# -*- coding: utf-8 -*-
"""Image de base du bougnat : source/base.png.

Deux tirages du même lot (même maquette layout.py « c », même prompt : jobs/06-maquette-c.json) :
  · c62_602 : le visage retenu (jovial, pommettes roses, regard bienveillant, grosse moustache grise), la main
    fine sous le plateau ;
  · c66_612 : ce qu'il y a SUR le plateau (burger, cornet de frites rayé, verre de bière), bien plus net.
On recolle les mets du second sur le plateau du premier (le haut du plateau est à la même hauteur, à quelques
pixels près : on les recale), bord fondu. Le fond pêche disparaît au détourage.
Usage : python compose.py"""
import os
import numpy as np
import cv2
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
GEN = os.path.join(HERE, "_gen", "06-maquette-c")
SRC = os.path.join(HERE, "source")

BASE, ITEMS = "c62_602", "c66_612"
BOX = (664, 236, 1000, 412)        # zone des mets (au-dessus du plateau), repère 1024 × 1024


def load(n):
    return np.asarray(Image.open(os.path.join(GEN, n + ".png")).convert("RGB")).astype(np.float32)


def plate_top(img, x0=700, x1=960, y0=380, y1=440):
    """Ligne du dessus du plateau : la rangée où le gris clair du plateau apparaît (moyenne sur la largeur)."""
    lab = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    sat = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    rows = []
    for y in range(y0, y1):
        seg = sat[y, x0:x1]
        rows.append((seg < 12).mean())       # gris peu saturé = le plateau
    rows = np.array(rows)
    return y0 + int(np.argmax(rows > 0.5)) if (rows > 0.5).any() else None


def main():
    os.makedirs(SRC, exist_ok=True)
    a, b = load(BASE), load(ITEMS)
    ya, yb = plate_top(a), plate_top(b)
    dy = (ya - yb) if (ya and yb) else 0
    print("dessus du plateau :", BASE, ya, "·", ITEMS, yb, "→ décalage", dy)
    x0, y0, x1, y1 = BOX
    # fond de b : pêche uni ; les mets = ce qui s'en écarte nettement
    bg = np.median(b[40:200, 40:200].reshape(-1, 3), axis=0)
    lab_b = cv2.cvtColor(np.clip(b, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    lab_bg = cv2.cvtColor(np.clip(bg[None, None], 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
    dist = np.sqrt(((lab_b - lab_bg) ** 2).sum(-1))
    m = np.zeros(dist.shape, np.float32)
    m[y0:y1 - max(0, -dy), x0:x1] = np.clip((dist[y0:y1 - max(0, -dy), x0:x1] - 6) / 10, 0, 1)
    m = cv2.dilate(m, np.ones((5, 5), np.uint8))
    # on remplit les trous (l'intérieur du verre, la mousse claire) : enveloppe fermée des mets
    mb = cv2.morphologyEx((m > 0.5).astype(np.uint8), cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    cnts, _ = cv2.findContours(mb, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    filled = np.zeros_like(mb)
    cv2.drawContours(filled, [c for c in cnts if cv2.contourArea(c) > 200], -1, 1, -1)
    m = np.maximum(m, filled.astype(np.float32))
    m = cv2.GaussianBlur(m, (0, 0), 1.2)
    # décalage vertical de b pour poser les mets sur le plateau de a
    M = np.float32([[1, 0, 0], [0, 1, dy]])
    b2 = cv2.warpAffine(b, M, (b.shape[1], b.shape[0]), borderMode=cv2.BORDER_REPLICATE)
    m2 = cv2.warpAffine(m, M, (m.shape[1], m.shape[0]))
    # la zone des mets de a (petit pain en trop, verre différent) est d'abord rendue au fond pêche de a
    bga = np.median(a[40:200, 820:980].reshape(-1, 3), axis=0)
    out = a.copy()
    clear = np.zeros(dist.shape, np.float32)
    clear[y0:ya - 1, x0:x1] = 1.0
    # sans toucher à l'oreille et aux cheveux (à gauche de la zone)
    clear[:, :690] *= np.clip((np.arange(690) - 664) / 26.0, 0, 1)[None, :]
    clear = cv2.GaussianBlur(clear, (0, 0), 1.5)[..., None]
    out = out * (1 - clear) + bga * clear
    m2 = m2[..., None]
    out = out * (1 - m2) + b2 * m2
    # retouches : le petit bloc rouge sombre coincé entre le cornet et le verre (une barquette ?) → fond pêche,
    # et le bord du plateau qu'il ombrait, recopié d'un bout de plateau dégagé
    x0r, y0r, x1r, y1r = 882, 383, 907, 404
    col = out[378:382, x0r:x1r].reshape(-1, 3).mean(0)
    out[y0r:y1r, x0r:x1r] = col
    out[403:408, x0r:x1r] = out[403:408, 980:980 + (x1r - x0r)]
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(SRC, "base.png"))
    print("source/base.png")


if __name__ == "__main__":
    main()
