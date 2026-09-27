# -*- coding: utf-8 -*-
"""Maquette en aplats d'une planche de personnage (le bougnat en pied : de face, de trois quarts, de profil),
pour guider SDXL en image → image (gen.py, jobs/07-planche.json). Même palette que l'image de base : casquette
charbon, cheveux et moustache gris, blouse indigo, foulard vert pomme pâle, tablier de cuir, pantalon sombre,
brodequins bruns. Sortie : _gen/layout/planche.png (1344 × 768)."""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from layout import cr, hexrgb

HERE = os.path.dirname(os.path.abspath(__file__))
W, H = 1344, 768

CAP, CAP_O = "#50555c", "#2e343b"
SKIN, SKIN_O, BLUSH = "#eea27f", "#cf8360", "#ea8a78"
GREY, GREY_O = "#b3b5bb", "#8f9299"
SMOCK, SMOCK_O = "#4d6893", "#344a74"
SCARF, SCARF_O = "#c8dd9c", "#a3ba74"
APRON, APRON_O = "#84492a", "#65331a"
PANTS, PANTS_O = "#3b3a44", "#2a2931"
BOOT = "#6b4128"


def P(d, pts, col, n=8):
    d.polygon(cr(pts, n), fill=hexrgb(col))


def R(d, pts, col):
    """Polygone droit (tablier, jambes : pas d'arrondi qui en ferait un œuf)."""
    d.polygon([tuple(p) for p in pts], fill=hexrgb(col))


def figure(img, cx, view):
    """Une silhouette en pied, pieds à y = 736, hauteur ≈ 6 têtes (trapu, jovial). view : 'face', 'trois', 'profil'."""
    d = ImageDraw.Draw(img)
    s = {"face": 0.0, "trois": 0.5, "profil": 1.0}[view]
    # jambes et brodequins
    for side in (-1, 1):
        if view == "profil" and side == 1:
            continue
        lx = cx + side * (34 - 18 * s) - 12 * s
        R(d, [(lx - 30, 470), (lx + 30, 470), (lx + 26, 700), (lx - 24, 700)], PANTS if side < 0 else PANTS_O)
        R(d, [(lx - 28, 696), (lx + 28, 696), (lx + 30 - 30 * s, 722), (lx + 20 - 40 * s, 736), (lx - 40 - 26 * s, 736), (lx - 34 - 20 * s, 716)], BOOT)
    # blouse ample (évasée aux hanches), manches le long du corps
    sh = 118 - 34 * s
    P(d, [(cx - sh, 236), (cx - sh - 26, 300), (cx - sh - 34, 480), (cx - sh + 16, 500), (cx + sh - 16 - 30 * s, 500),
          (cx + sh + 34 - 40 * s, 480), (cx + sh + 26 - 20 * s, 300), (cx + sh - 10 * s, 236), (cx + 40, 210), (cx - 40, 210)], SMOCK, 8)
    P(d, [(cx + sh * 0.2, 250), (cx + sh - 10 * s, 240), (cx + sh + 26 - 20 * s, 300), (cx + sh + 34 - 40 * s, 480), (cx + sh * 0.5, 496)], SMOCK_O, 6)
    # bras et mains (le long du corps)
    for side in (-1, 1):
        if view == "profil" and side == 1:
            continue
        ax = cx + side * (sh + 10) - (60 * s if side > 0 else 30 * s)
        R(d, [(ax - 20, 250), (ax + 20, 250), (ax + 22, 436), (ax - 18, 438)], SMOCK_O if side > 0 else SMOCK)
        P(d, [(ax - 16, 434), (ax + 18, 432), (ax + 16, 474), (ax + 2, 486), (ax - 14, 474)], SKIN, 5)
    # tablier de cuir (bavette + jupe jusqu'aux genoux)
    aw = 70 - 30 * s
    ax0 = cx - 20 * s - 26 * s
    if view == "profil":
        R(d, [(cx - 66, 280), (cx - 56, 280), (cx - 70, 600), (cx - 86, 596)], APRON)
    else:
        bw = aw * 0.72
        R(d, [(ax0 - bw, 262), (ax0 + bw, 262), (ax0 + bw, 330), (ax0 + aw + 12, 360), (ax0 + aw + 18, 600), (ax0 - aw - 18, 600),
              (ax0 - aw - 12, 360), (ax0 - bw, 330)], APRON)
        R(d, [(ax0 + bw * 0.4, 262), (ax0 + bw, 262), (ax0 + bw, 330), (ax0 + aw + 12, 360), (ax0 + aw + 18, 600), (ax0 + aw * 0.45, 600)], APRON_O)
    # cou et foulard noué
    P(d, [(cx - 30 - 10 * s, 180), (cx + 30 - 10 * s, 180), (cx + 28 - 10 * s, 222), (cx - 28 - 10 * s, 222)], SKIN_O, 4)
    P(d, [(cx - 48 - 12 * s, 206), (cx + 46 - 20 * s, 204), (cx + 40 - 20 * s, 236), (cx - 42 - 12 * s, 238)], SCARF, 6)
    P(d, [(cx - 16 - 30 * s, 230), (cx + 8 - 30 * s, 230), (cx + 4 - 30 * s, 300), (cx - 20 - 30 * s, 296)], SCARF_O, 4)
    # tête ronde, oreille, joues roses
    hx = cx - 14 * s
    P(d, [(hx - 58 + 8 * s, 100), (hx - 50, 70), (hx, 58), (hx + 50, 70), (hx + 58, 110), (hx + 50 - 6 * s, 160), (hx + 20 - 16 * s, 190),
          (hx - 22 - 10 * s, 190), (hx - 52 + 4 * s, 160)], SKIN, 10)
    if view != "face":
        P(d, [(hx + 30 + 10 * s, 104), (hx + 46 + 6 * s, 100), (hx + 52 + 4 * s, 128), (hx + 36 + 8 * s, 140)], SKIN_O, 5)
        P(d, [(hx - 60 - 14 * s, 124), (hx - 46 - 10 * s, 120), (hx - 46 - 10 * s, 140), (hx - 60 - 12 * s, 142)], SKIN, 4)   # nez
    else:
        for side in (-1, 1):
            P(d, [(hx + side * 58, 104), (hx + side * 66, 108), (hx + side * 64, 132), (hx + side * 56, 136)], SKIN_O, 4)
    # cheveux gris aux tempes, moustache grise en guidon
    P(d, [(hx + 30, 84), (hx + 56, 92), (hx + 58, 120), (hx + 44, 112)], GREY, 4)
    mx = hx - 30 * s
    if view == "profil":
        P(d, [(mx - 34, 150), (mx - 18, 146), (mx, 150), (mx - 8, 160), (mx - 26, 164), (mx - 44, 158), (mx - 50, 146)], GREY, 5)
    else:
        P(d, [(mx - 46, 146), (mx - 34, 154), (mx - 10, 150), (mx, 154), (mx + 10, 150), (mx + 34, 154), (mx + 46, 146), (mx + 44, 158),
              (mx + 20, 168), (mx, 164), (mx - 20, 168), (mx - 44, 158)], GREY, 5)
    ex = hx - 26 * s
    for side in ((-1, 1) if view == "face" else (-1,) if view == "profil" else (-1, 1)):
        k = 1.0 if view == "face" else (0.7 if side < 0 else 1.0)
        x = ex + side * 22 * (1 - 0.4 * s)
        d.ellipse((x - 6 * k, 116, x + 6 * k, 126), fill=hexrgb("#3a2e27"))
    # casquette plate, visière vers l'avant (vers la gauche de trois quarts et de profil)
    P(d, [(hx - 60, 88), (hx - 56, 60), (hx - 20, 40), (hx + 30, 38), (hx + 60, 54), (hx + 66, 84), (hx + 40, 92), (hx - 20, 94)], CAP, 8)
    if view == "face":
        P(d, [(hx - 64, 88), (hx + 64, 86), (hx + 58, 102), (hx - 58, 104)], CAP_O, 5)
    else:
        P(d, [(hx - 100 * s - 30, 94), (hx - 30 * s - 10, 84), (hx + 10, 92), (hx - 30 * s - 20, 106), (hx - 90 * s - 30, 104)], CAP_O, 5)


def main():
    img = Image.new("RGB", (W, H), hexrgb("#f1c3a2"))
    for cx, v in ((230, "face"), (672, "trois"), (1110, "profil")):
        figure(img, cx, v)
    img = img.filter(ImageFilter.GaussianBlur(1.0))
    os.makedirs(os.path.join(HERE, "_gen", "layout"), exist_ok=True)
    p = os.path.join(HERE, "_gen", "layout", "planche.png")
    img.save(p)
    print(p)


if __name__ == "__main__":
    main()
