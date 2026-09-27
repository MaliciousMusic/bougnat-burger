# -*- coding: utf-8 -*-
"""Palette de référence du bougnat, relevée sur l'image de base (source/base.png) : pour chaque matière, trois tons
(clair, moyen, ombre) par k-moyennes Lab sur ses pixels (repérés par zone + couleur), plus la teinte de marque la
plus proche quand il y en a une (les verts : pomme / olive, pas de tilleul saturé). Pour le personnage dessiné en code.
Sorties : assets/bougnat/reference/palette.json et palette.png (nuancier).
Usage : python palette.py"""
import json
import os
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "bougnat", "reference")

# jetons de la charte (css/bougnat.css) : les verts et les tons chauds
BRAND = {
    "--pomme": "#C8E3A0", "--pomme-2": "#DDEEC4", "--olive": "#7C8A3A", "--olive-clair": "#A3B061", "--olive-2": "#5D6A2A",
    "--olive-3": "#3F4A1C", "--peche": "#F2B48C", "--rose": "#E7B8AC", "--creme": "#F5EAD4", "--charbon": "#1A130F",
}


def poly(shape, pts):
    m = np.zeros(shape, np.uint8)
    cv2.fillPoly(m, [np.array(pts, np.int32)], 1)
    return m.astype(bool)


def hexc(c):
    c = np.clip(np.round(c), 0, 255).astype(int)
    return "#%02X%02X%02X" % tuple(c)


def tones(rgb, m, k=3):
    px = rgb[m].reshape(-1, 3).astype(np.float32)
    if len(px) < 30:
        return None
    lab = cv2.cvtColor(px[None].astype(np.uint8), cv2.COLOR_RGB2LAB)[0].astype(np.float32)
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 50, 0.2)
    cv2.setRNGSeed(3)
    _, lbl, cen = cv2.kmeans(lab, k, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    order = np.argsort(-cen[:, 0])
    out = []
    for i in order:
        sel = lbl[:, 0] == i
        out.append((hexc(px[sel].mean(0)), round(float(sel.mean()), 2)))
    return out


def nearest_brand(h):
    c = np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    lab = cv2.cvtColor(c[None, None].astype(np.uint8), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)
    best = None
    for k, v in BRAND.items():
        b = np.array([int(v[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
        bl = cv2.cvtColor(b[None, None].astype(np.uint8), cv2.COLOR_RGB2LAB)[0, 0].astype(np.float32)
        d = float(np.linalg.norm(lab - bl))
        if best is None or d < best[1]:
            best = (k, d)
    return best


def main():
    rgb = np.asarray(Image.open(os.path.join(HERE, "source", "base.png")).convert("RGB"))
    alpha = np.asarray(Image.open(os.path.join(HERE, "_work", "matte-base.png"))) > 128
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    L, A, B = lab[..., 0], lab[..., 1] - 128, lab[..., 2] - 128
    chroma = np.hypot(A, B)
    H, W = alpha.shape
    head = poly((H, W), [(262, 345), (300, 320), (330, 230), (420, 165), (560, 170), (650, 220), (668, 330), (662, 470), (630, 500),
                         (600, 540), (540, 590), (470, 610), (390, 606), (345, 560), (320, 500), (300, 470)])
    cap = poly((H, W), [(262, 350), (268, 300), (318, 250), (380, 190), (470, 158), (510, 160), (600, 180), (660, 220), (668, 336),
                        (560, 342), (440, 352), (330, 356)])
    face = head & ~cap
    body = alpha & poly((H, W), [(0, 1024), (0, 600), (380, 600), (620, 600), (1024, 600), (1024, 1024)])
    apron = poly((H, W), [(310, 690), (680, 690), (690, 1024), (300, 1024)])
    hand = poly((H, W), [(760, 420), (1000, 400), (990, 520), (780, 520)])
    mats = {
        "casquette": alpha & cap & (L < 110),
        "peau": alpha & (face | hand) & (L > 150) & (A > 8) & (A < 32) & (B > 12) & (chroma > 16),
        "joues (rose)": alpha & face & (A > 26) & (L > 140) & (L < 215),
        "cheveux et moustache (gris)": alpha & (poly((H, W), [(296, 462), (545, 462), (545, 535), (296, 535)]) |
                                                poly((H, W), [(560, 318), (645, 318), (645, 440), (560, 440)])) & (chroma < 10) & (L > 150) & (L < 232),
        "sourcils": alpha & face & (chroma < 12) & (L < 110),
        "lèvres": alpha & face & (A > 30) & (L < 140),
        "blouse (indigo)": body & ~apron & (B < -12) & (L < 150),
        "foulard (vert pomme)": alpha & poly((H, W), [(360, 580), (615, 580), (615, 810), (360, 810)]) & (A < -6) & (B > 8) & (L > 120),
        "tablier (cuir)": alpha & apron & (A > 12) & (B > 12) & (L < 120),
        "boutons du tablier": alpha & apron & (L > 215),
    }
    res = {}
    for name, m in mats.items():
        t = tones(rgb, m)
        if not t:
            continue
        entry = {"clair": t[0][0], "moyen": t[1][0], "ombre": t[2][0], "parts": [p for _, p in t], "pixels": int(m.sum())}
        nb = nearest_brand(t[1][0])
        if nb and nb[1] < 18:
            entry["jeton_proche"] = nb[0]
        res[name] = entry
    # recommandation pour le personnage dessiné : les verts ramenés à la charte (retour de l'utilisateur)
    res["_note"] = ("Tons relevés sur l'image de base (SDXL, jobs/06-maquette-c.json : c62_602 + mets de c66_612). "
                    "Pour le personnage dessiné en code : garder 2 à 3 tons par matière ; le foulard en vert pomme de la charte "
                    "(--pomme #C8E3A0 clair, --olive-clair #A3B061 ombre) ou en olive ; aucun tilleul saturé (#96C124) sur lui.")
    os.makedirs(OUT, exist_ok=True)
    json.dump(res, open(os.path.join(OUT, "palette.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    # nuancier
    rows = [k for k in res if not k.startswith("_")]
    sw, pad, lh = 120, 14, 64
    img = Image.new("RGB", (pad * 2 + 260 + 3 * (sw + 8), pad * 2 + len(rows) * (lh + 8) + 30), (26, 19, 15))
    d = ImageDraw.Draw(img)
    try:
        font = ImageFont.truetype("arial.ttf", 15)
        small = ImageFont.truetype("arial.ttf", 13)
    except OSError:
        font = small = ImageFont.load_default()
    d.text((pad, pad), "Le bougnat — palette relevée (clair · moyen · ombre)", fill=(245, 234, 212), font=font)
    for i, k in enumerate(rows):
        y = pad + 30 + i * (lh + 8)
        d.text((pad, y + lh // 2 - 18), k, fill=(245, 234, 212), font=font)
        if res[k].get("jeton_proche"):
            d.text((pad, y + lh // 2 + 2), "≈ " + res[k]["jeton_proche"], fill=(200, 227, 160), font=small)
        for j, key in enumerate(("clair", "moyen", "ombre")):
            h = res[k][key]
            x = pad + 260 + j * (sw + 8)
            c = tuple(int(h[q:q + 2], 16) for q in (1, 3, 5))
            d.rectangle((x, y, x + sw, y + lh), fill=c)
            lum = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
            d.text((x + 8, y + lh - 22), h, fill=(20, 16, 12) if lum > 140 else (245, 234, 212), font=small)
    img.save(os.path.join(OUT, "palette.png"))
    for k in rows:
        print(f"{k:32s} {res[k]['clair']} {res[k]['moyen']} {res[k]['ombre']}  {res[k].get('jeton_proche', '')}")


if __name__ == "__main__":
    main()
