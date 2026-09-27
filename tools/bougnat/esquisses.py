# -*- coding: utf-8 -*-
"""Esquisses en aplats, posées sur des copies de l'image de base, pour guider les repeints SDXL (inpaint.py, force
< 1 : le modèle repeint le détail mais garde la place et les couleurs de l'esquisse) :
  esq-salut   le bras lointain levé, la main qui tient le bout de la visière (il soulève sa casquette)
  esq-tampon  le bras lointain levé, le poing serré sur un tampon encreur en bois (le tampon vers le bas)
  esq-crane   la tête sans casquette : le haut du crâne, cheveux gris courts
Repère : pixels de source/base.png (1024 × 1024). Usage : python esquisses.py"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source")

MANCHE, MANCHE_O, MANCHE_B = "#4d6891", "#3e557c", "#31456c"
PEAU, PEAU_O, PEAU_C = "#eb9b77", "#d9825f", "#f0b08e"
FOND = "#f3c19d"


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def cr(pts, n=10):
    P = np.array(pts, np.float64)
    m = len(P)
    out = []
    for i in range(m):
        p0, p1, p2, p3 = P[(i - 1) % m], P[i], P[(i + 1) % m], P[(i + 2) % m]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)))
    return out


def grad_poly(img, pts, c1, c2, p1, p2, n=10):
    W, H = img.size
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).polygon(cr(pts, n), fill=255)
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    d = np.array(p2, np.float32) - np.array(p1, np.float32)
    t = np.clip(((xx - p1[0]) * d[0] + (yy - p1[1]) * d[1]) / max(1e-6, float(d @ d)), 0, 1)[..., None]
    col = np.array(hexrgb(c1), np.float32) * (1 - t) + np.array(hexrgb(c2), np.float32) * t
    img.paste(Image.fromarray(col.astype(np.uint8), "RGB"), (0, 0), m)


def poly(img, pts, c, n=8):
    ImageDraw.Draw(img).polygon(cr(pts, n), fill=hexrgb(c))


def salut(base):
    im = base.copy()
    # bras : épaule lointaine (≈ 215, 735) → coude (150, 575) → poignet (250, 405) ; manche retroussée au poignet
    grad_poly(im, [(118, 780), (96, 690), (100, 600), (150, 548), (212, 572), (250, 640), (280, 730), (230, 790)],
              MANCHE, MANCHE_B, (120, 600), (260, 780))
    grad_poly(im, [(104, 598), (150, 540), (208, 468), (236, 418), (286, 424), (270, 480), (224, 560), (196, 606)],
              "#5874a0", MANCHE, (160, 560), (280, 430))
    poly(im, [(226, 424), (240, 404), (292, 408), (290, 432), (266, 440)], "#44608c", 6)   # revers de manche
    # main : paume et doigts repliés sur le bout de la visière, le pouce dessous
    grad_poly(im, [(238, 408), (236, 372), (252, 344), (282, 322), (318, 318), (336, 332), (330, 352), (304, 360), (300, 392), (286, 414)],
              PEAU_C, PEAU_O, (250, 340), (300, 410))
    for (x, y) in ((286, 326), (304, 322), (320, 326)):
        poly(im, [(x - 7, y + 4), (x - 4, y - 8), (x + 8, y - 8), (x + 9, y + 6)], PEAU, 4)       # jointures
    poly(im, [(256, 362), (276, 352), (300, 358), (296, 368), (270, 370)], PEAU_O, 5)            # pouce sous la visière
    return im


def tampon(base):
    im = base.copy()
    # bras levé sur le côté : épaule (190, 720) → coude à gauche (45, 620) → poignet (205, 545), avant-bras à plat
    grad_poly(im, [(170, 770), (236, 706), (206, 664), (126, 616), (52, 590), (18, 634), (58, 690), (126, 744)],
              MANCHE, MANCHE_B, (60, 610), (200, 760))
    grad_poly(im, [(26, 604), (84, 578), (150, 552), (206, 514), (218, 582), (164, 612), (94, 642), (40, 654)],
              "#5874a0", MANCHE, (40, 630), (210, 540))
    poly(im, [(184, 522), (208, 510), (218, 584), (196, 594)], "#44608c", 5)                       # revers de manche
    # tampon : bouton de bois sur le dessus, manche, sabot, semelle de caoutchouc encrée (vers le bas)
    grad_poly(im, [(216, 470), (222, 452), (242, 446), (262, 452), (268, 470), (256, 482), (228, 482)], "#c98f55", "#8a5a30", (220, 450), (260, 482))
    poly(im, [(230, 480), (254, 480), (252, 600), (232, 600)], "#9a6a3c", 4)
    grad_poly(im, [(192, 600), (290, 600), (294, 640), (188, 640)], "#b07a45", "#7a4c26", (192, 600), (290, 640), 4)
    poly(im, [(186, 640), (296, 640), (294, 654), (188, 654)], "#5d6a2a", 4)
    # poing serré autour du manche (le dos de la main vers nous, les doigts repliés à droite)
    grad_poly(im, [(204, 520), (212, 498), (236, 490), (268, 496), (278, 520), (274, 560), (252, 580), (216, 578), (200, 556)],
              PEAU_C, PEAU_O, (220, 500), (260, 575))
    for y in (512, 530, 548):
        poly(im, [(260, y - 8), (278, y - 6), (280, y + 6), (262, y + 8)], PEAU, 4)                # doigts repliés
    poly(im, [(206, 510), (230, 498), (244, 508), (222, 520)], PEAU_O, 4)                          # pouce
    return im


def crane(base):
    im = base.copy()
    d = ImageDraw.Draw(im)
    # on efface la casquette (fond pêche), puis le haut du crâne : peau au sommet dégarni, couronne de cheveux gris
    d.polygon(cr([(262, 350), (268, 300), (300, 250), (350, 200), (420, 170), (520, 162), (600, 180), (650, 220), (668, 280),
                  (664, 336), (600, 344), (470, 344), (360, 356)], 8), fill=hexrgb(FOND))
    grad_poly(im, [(334, 372), (338, 320), (362, 272), (410, 238), (480, 226), (552, 236), (604, 266), (632, 312), (640, 372),
                   (600, 360), (520, 348), (440, 350), (380, 360)], "#e7a07c", "#c9805e", (400, 240), (620, 360))
    grad_poly(im, [(560, 250), (606, 272), (636, 318), (644, 380), (626, 430), (600, 400), (596, 330), (570, 290)], "#c2c3c8", "#9c9ea5", (580, 260), (630, 420))
    grad_poly(im, [(340, 350), (344, 318), (362, 288), (392, 264), (380, 300), (366, 340)], "#c2c3c8", "#a4a6ad", (350, 290), (370, 350))
    return im


def main():
    base = Image.open(os.path.join(SRC, "base.png")).convert("RGB")
    for name, fn in (("esq-salut", salut), ("esq-tampon", tampon), ("esq-crane", crane)):
        im = fn(base).filter(ImageFilter.GaussianBlur(0.8))
        im.save(os.path.join(SRC, name + ".png"))
        print(name)


if __name__ == "__main__":
    main()
