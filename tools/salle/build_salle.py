# -*- coding: utf-8 -*-
"""La salle du Bougnat Burger, recréée en peinture vectorielle (pas de photo sur le site) :
facettes k-moyennes à dégradés ajustés (même chaîne que le décor du film), sur une sous-couche
« aérographe » qui bouche les interstices.
Entrée : une image de référence de la salle ; sortie : assets/img/salle.svg
Usage : python tools/salle/build_salle.py <image-de-reference> [largeur=520]"""
import os
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vectorize import Vectorizer, facets_svg  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
src = cv2.imread(sys.argv[1], cv2.IMREAD_COLOR)
if src is None:  # webp illisible par cette version d'OpenCV : passage par PIL
    from PIL import Image
    src = np.array(Image.open(sys.argv[1]).convert("RGB"))[..., ::-1].copy()
W = int(sys.argv[2]) if len(sys.argv) > 2 else 520
H = round(src.shape[0] * W / src.shape[1])
rgb = cv2.resize(src, (W, H), interpolation=cv2.INTER_AREA)[..., ::-1].astype(np.float32)

V = Vectorizer(rgb)
full = np.ones((H, W), bool)
# 1. sous-couche : grille floutée (le velouté), 2. facettes nettes à dégradés
base, _ = V.field(rgb, full, 22, 11, (0, 0, W, H), 0, 0)
fac = facets_svg(V, rgb, full, k=20, min_area=14, smooth=0.9, eps=0.55, bil=(7, 28, 6), seam=1.2, soften=0.55)
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
       f'<!-- La salle du Bougnat Burger, recréée en peinture vectorielle -->'
       f'<defs>{"".join(V.defs)}</defs>{base}{fac}</svg>')
out = os.path.join(ROOT, "assets", "img", "salle.svg")
open(out, "w", encoding="utf-8").write(svg)
print("salle.svg :", W, "x", H, "-", len(svg) // 1024, "Ko")
