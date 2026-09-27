# -*- coding: utf-8 -*-
"""Vectorise le volcan du logo officiel Bougnat Burger (aplat vert + traits de pinceau blancs)
à partir d'une capture haute définition du logo sur fond noir.
Sortie : assets/logo/bougnat-volcan.svg (le volcan seul, tel quel) + assets/logo/bougnat-volcan.json (chemins, pour le JS).
Usage : python tools/logo/vectorize_logo.py <capture-logo-sur-noir.png>
(Python avec OpenCV : celui de tools/imagegen/.venv du projet Pierre Guillaume convient.)"""
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "logo")
os.makedirs(OUT, exist_ok=True)

src = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)[..., ::-1].astype(np.float32)  # RGB
H, W = src.shape[:2]
SCALE = 2  # on travaille au double pour des contours plus doux
img = cv2.resize(src, (W * SCALE, H * SCALE), interpolation=cv2.INTER_CUBIC)
R, G, B = img[..., 0], img[..., 1], img[..., 2]

# le volcan vit entre les deux mots (en haut « BOUGNAT », en bas « BURGER »)
ys = np.arange(H * SCALE)[:, None]
band = (ys > 118 * SCALE) & (ys < 398 * SCALE)

green = (G > 110) & (G > R + 25) & (G > B + 60) & band
white = (R > 150) & (G > 150) & (B > 150) & (np.abs(R - G) < 40) & band


def clean(m, close=2, open_=1, min_area=30):
    m = m.astype(np.uint8)
    if close:
        m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((close * 2 + 1, close * 2 + 1), np.uint8))
    if open_:
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((open_ * 2 + 1, open_ * 2 + 1), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, 8)
    keep = np.zeros_like(m)
    for k in range(1, n):
        if st[k, cv2.CC_STAT_AREA] >= min_area:
            keep[lab == k] = 1
    return keep.astype(bool)


green = clean(green, close=3, open_=1, min_area=400)
white = clean(white, close=1, open_=0, min_area=40)
# anticrénelage : un pixel blanc collé au vert reste blanc (les traits bordent le vert)


def smooth_closed(pts, sigma):
    if sigma <= 0 or len(pts) < 8:
        return pts
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.empty_like(pts)
    for d in range(2):
        p = np.concatenate([pts[-r:, d], pts[:, d], pts[:r, d]])
        out[:, d] = np.convolve(p, k, mode="valid")
    return out


def bezier_closed(P):
    n = len(P)
    f = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    d = [f"M{f(P[0][0])} {f(P[0][1])}"]
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    d.append("Z")
    return "".join(d)


def mask_path(mask, smooth, eps, scale, ox, oy, min_area=8):
    cnts, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cnts:
        if abs(cv2.contourArea(c)) < min_area:
            continue
        pts = c[:, 0, :].astype(np.float64) + 0.5
        pts = smooth_closed(pts, smooth)
        ap = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, True)[:, 0, :].astype(np.float64)
        if len(ap) < 3:
            continue
        ap = ap / scale - np.array([ox, oy])
        parts.append(bezier_closed(ap))
    return "".join(parts)


# cadrage : boîte englobante du volcan (vert + traits), avec une petite marge
both = green | white
yy, xx = np.where(both)
x0, y0, x1, y1 = xx.min() / SCALE - 4, yy.min() / SCALE - 4, xx.max() / SCALE + 4, yy.max() / SCALE + 4
vw, vh = x1 - x0, y1 - y0
col = img[green].mean(0)
hexc = "#%02x%02x%02x" % tuple(int(round(v)) for v in np.clip(col, 0, 255))
d_green = mask_path(green, smooth=2.2, eps=0.9, scale=SCALE, ox=x0, oy=y0, min_area=200)
d_white = mask_path(white, smooth=0.9, eps=0.5, scale=SCALE, ox=x0, oy=y0, min_area=10)

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vw:.1f} {vh:.1f}">'
       f'<!-- Bougnat Burger : le volcan du logo officiel, vectorisé tel quel -->'
       f'<path d="{d_green}" fill="{hexc}" fill-rule="evenodd"/>'
       f'<path d="{d_white}" fill="#ffffff" fill-rule="evenodd"/></svg>')
open(os.path.join(OUT, "bougnat-volcan.svg"), "w", encoding="utf-8").write(svg)
json.dump({"w": round(vw, 1), "h": round(vh, 1), "green": hexc, "dGreen": d_green, "dWhite": d_white},
          open(os.path.join(OUT, "bougnat-volcan.json"), "w", encoding="utf-8"))
# la même chose en script classique (le site doit marcher en file://, sans fetch)
data = {"w": round(vw, 1), "h": round(vh, 1), "green": hexc, "dGreen": d_green, "dWhite": d_white}
NL = chr(10)
open(os.path.join(ROOT, "js", "bb-logo.js"), "w", encoding="utf-8").write(
    "/* Bougnat Burger — le volcan du logo officiel, vectorisé tel quel (généré par tools/logo/vectorize_logo.py) */" + NL
    + "window.BB = window.BB || {};" + NL + "window.BB.LOGO = " + json.dumps(data) + ";" + NL)
print("volcan :", f"{vw:.0f}x{vh:.0f}", "vert", hexc, "-", len(svg) // 1024, "Ko")
