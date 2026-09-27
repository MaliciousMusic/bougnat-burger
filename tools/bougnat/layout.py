# -*- coding: utf-8 -*-
"""Maquette en aplats pour guider SDXL (image → image) : la pose et la palette du bougnat, qu'un prompt seul ne tient
pas (il le met de face, et le vert du foulard déborde partout). Buste de trois quarts tourné vers la gauche,
casquette charbon, blouse indigo, foulard vert pomme pâle, tablier de cuir, et le plateau (burger, frites, bière)
porté haut sur la main proche, à droite. Le bras lointain reste caché derrière la poitrine.

Usage : python layout.py [variante]  → _gen/layout/<variante>.png"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "_gen", "layout")
S = 1024


def cr(pts, n=12, closed=True):
    """Catmull-Rom échantillonné : un polygone aux coins arrondis."""
    P = np.array(pts, np.float64)
    m = len(P)
    out = []
    rng = range(m) if closed else range(m - 1)
    for i in rng:
        p0 = P[(i - 1) % m] if closed else P[max(0, i - 1)]
        p1, p2 = P[i], P[(i + 1) % m]
        p3 = P[(i + 2) % m] if closed else P[min(m - 1, i + 2)]
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return [tuple(p) for p in out]


def grad_fill(img, poly, c1, c2, p1, p2):
    """Remplit un polygone d'un dégradé linéaire de c1 (en p1) à c2 (en p2)."""
    m = Image.new("L", img.size, 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    d = np.array(p2, np.float32) - np.array(p1, np.float32)
    t = ((xx - p1[0]) * d[0] + (yy - p1[1]) * d[1]) / max(1e-6, float(d @ d))
    t = np.clip(t, 0, 1)[..., None]
    col = np.array(c1, np.float32) * (1 - t) + np.array(c2, np.float32) * t
    layer = Image.fromarray(col.astype(np.uint8), "RGB")
    img.paste(layer, (0, 0), m)


def hexrgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def blush(img, c, r, col="#e88a78", a=150, blur=14):
    blob = Image.new("L", (S, S), 0)
    ImageDraw.Draw(blob).ellipse((c[0] - r, c[1] - r * 0.8, c[0] + r, c[1] + r * 0.8), fill=a)
    blob = blob.filter(ImageFilter.GaussianBlur(blur))
    img.paste(Image.new("RGB", (S, S), hexrgb(col)), (0, 0), blob)


def head_a(img, d):
    """Première maquette : tête presque de face (le nez seul indique le trois quarts)."""
    head = cr([(300, 360), (318, 300), (360, 250), (430, 222), (520, 226), (585, 262), (612, 330), (612, 420),
               (590, 500), (548, 555), (480, 580), (400, 570), (345, 530), (312, 470), (296, 420)], 10)
    grad_fill(img, head, hexrgb("#f3c19d"), hexrgb("#c98b6c"), (330, 350), (610, 480))
    d.polygon(cr([(600, 360), (632, 350), (648, 390), (640, 440), (612, 452)], 6), fill=hexrgb("#d9977a"))
    for c, r in (((375, 452), 38), ((540, 462), 34)):
        blush(img, c, r)
    d.polygon(cr([(398, 370), (372, 432), (366, 458), (392, 470), (420, 462)], 6), fill=hexrgb("#dc9c7e"))
    for (ex, ey, w) in ((348, 385, 34), (468, 382, 44)):
        d.ellipse((ex - w / 2, ey - 9, ex + w / 2, ey + 9), fill=hexrgb("#f7ede2"))
        d.ellipse((ex - 9, ey - 9, ex + 9, ey + 9), fill=hexrgb("#4a3a30"))
    d.polygon(cr([(318, 356), (345, 342), (378, 348), (376, 358), (344, 356)], 4), fill=hexrgb("#8d8278"))
    d.polygon(cr([(430, 350), (470, 336), (515, 346), (512, 358), (470, 350)], 4), fill=hexrgb("#8d8278"))
    mou = cr([(300, 470), (318, 486), (352, 486), (392, 474), (420, 488), (470, 490), (520, 480), (548, 466), (562, 450),
              (556, 478), (522, 508), (470, 516), (420, 506), (392, 498), (350, 512), (310, 504), (290, 486)], 8)
    grad_fill(img, mou, hexrgb("#9b9189"), hexrgb("#5d534c"), (330, 470), (540, 515))
    d.polygon(cr([(390, 512), (440, 522), (490, 516), (470, 530), (420, 532)], 5), fill=hexrgb("#a8574f"))
    d.polygon(cr([(590, 300), (615, 330), (612, 400), (598, 360)], 4), fill=hexrgb("#a6a19b"))


def head_b(img, d):
    """Vrai trois quarts gauche : la ligne médiane du visage passe à gauche du centre du crâne, le nez dépasse du
    contour, l'œil lointain est plus petit, l'oreille proche se voit à droite. Visage rond et plein (la cinquantaine
    jviale), tempes grises, grosse moustache grise."""
    head = cr([(322, 372), (330, 318), (362, 262), (430, 226), (520, 226), (588, 262), (618, 330), (622, 410),
               (604, 486), (566, 544), (500, 584), (430, 590), (378, 566), (346, 524), (330, 470), (322, 420)], 10)
    grad_fill(img, head, hexrgb("#f4c29c"), hexrgb("#c7876a"), (340, 380), (620, 470))
    # le plan du visage côté ombre (droite) un peu plus sombre
    d.polygon(cr([(520, 300), (590, 290), (618, 360), (612, 450), (578, 520), (530, 552), (540, 470), (548, 380)], 6),
              fill=hexrgb("#d59876"))
    # oreille proche
    d.polygon(cr([(606, 372), (640, 360), (656, 400), (650, 452), (620, 470)], 6), fill=hexrgb("#d18c70"))
    d.polygon(cr([(622, 384), (640, 384), (644, 420), (628, 446)], 4), fill=hexrgb("#b87460"))
    # tempes et favoris gris
    d.polygon(cr([(596, 300), (624, 330), (628, 398), (606, 420), (600, 360)], 4), fill=hexrgb("#b3aea8"))
    d.polygon(cr([(328, 330), (344, 318), (346, 380), (334, 392)], 4), fill=hexrgb("#b3aea8"))
    # joues roses (la lointaine plus petite)
    blush(img, (352, 468), 30, a=170)
    blush(img, (492, 474), 46, a=170)
    # sourcils gris, arqués (air bienveillant)
    d.polygon(cr([(334, 360), (352, 346), (380, 348), (382, 358), (356, 358)], 4), fill=hexrgb("#8f8a86"))
    d.polygon(cr([(420, 352), (456, 336), (508, 342), (510, 354), (460, 352)], 4), fill=hexrgb("#8f8a86"))
    # yeux : le lointain petit, près du contour ; le proche plus grand ; regard vers la gauche (vers nous)
    d.ellipse((346, 380, 376, 396), fill=hexrgb("#f7ede2"))
    d.ellipse((350, 380, 366, 396), fill=hexrgb("#3e3129"))
    d.ellipse((428, 378, 480, 398), fill=hexrgb("#f7ede2"))
    d.ellipse((432, 378, 452, 398), fill=hexrgb("#3e3129"))
    d.polygon(cr([(344, 380), (360, 374), (378, 380), (360, 377)], 3), fill=hexrgb("#6d4b3c"))
    d.polygon(cr([(426, 378), (452, 370), (482, 378), (452, 374)], 3), fill=hexrgb("#6d4b3c"))
    # nez : il dépasse le contour du visage vers la gauche
    d.polygon(cr([(392, 372), (372, 420), (340, 452), (346, 470), (380, 474), (404, 462), (406, 420)], 6), fill=hexrgb("#e3a282"))
    d.polygon(cr([(346, 468), (372, 474), (392, 466), (378, 478), (352, 478)], 4), fill=hexrgb("#b8735c"))
    # grande moustache grise en guidon : le côté lointain raccourci, le côté proche long et relevé
    mou = cr([(318, 470), (330, 488), (356, 490), (384, 478), (402, 486), (440, 494), (486, 492), (526, 478), (552, 458),
              (566, 436), (568, 462), (548, 494), (506, 516), (450, 522), (402, 510), (380, 500), (352, 514), (322, 508), (306, 490)], 8)
    grad_fill(img, mou, hexrgb("#c3bdb6"), hexrgb("#7b746e"), (340, 470), (540, 520))
    # bouche souriante et menton rond
    d.polygon(cr([(376, 516), (420, 530), (462, 526), (446, 540), (404, 542)], 5), fill=hexrgb("#a5534c"))
    d.polygon(cr([(392, 556), (430, 566), (470, 560), (444, 574), (410, 572)], 4), fill=hexrgb("#d9987a"))


def draw(variant="a"):
    img = Image.new("RGB", (S, S), hexrgb("#f1c3a2"))
    d = ImageDraw.Draw(img)
    # --- buste : blouse indigo (épaules larges, trois quarts : l'épaule proche à droite, plus large)
    smock = cr([(120, 1024), (150, 820), (215, 700), (330, 640), (430, 622), (560, 628), (700, 640), (820, 690),
                (905, 790), (950, 1024)], 10)
    grad_fill(img, smock, hexrgb("#4b6aa8"), hexrgb("#27396b"), (200, 650), (900, 1000))
    # plis de la blouse (quelques ombres franches)
    for pl in ([(420, 760), (445, 1024), (405, 1024), (395, 800)], [(760, 720), (820, 1024), (780, 1024), (735, 760)]):
        d.polygon(cr(pl, 6), fill=hexrgb("#2d4378"))
    # tablier de cuir : bavette sur la poitrine, bretelle autour du cou
    apron = cr([(330, 1024), (345, 830), (370, 790), (600, 780), (640, 820), (660, 1024)], 8)
    grad_fill(img, apron, hexrgb("#8a5634"), hexrgb("#5c3620"), (340, 790), (660, 1024))
    d.polygon(cr([(372, 792), (410, 690), (430, 694), (398, 796)], 4), fill=hexrgb("#6e4127"))
    d.polygon(cr([(560, 786), (548, 690), (570, 688), (588, 786)], 4), fill=hexrgb("#6e4127"))
    # cou
    neck = cr([(400, 560), (395, 650), (430, 690), (530, 690), (560, 640), (548, 540)], 8)
    grad_fill(img, neck, hexrgb("#e2a584"), hexrgb("#b97a5e"), (400, 600), (560, 640))
    # foulard vert pomme pâle noué (le nœud à gauche, les pointes qui tombent)
    scarf = cr([(372, 640), (420, 618), (500, 626), (575, 612), (600, 650), (560, 690), (480, 704), (410, 698)], 8)
    grad_fill(img, scarf, hexrgb("#d6ebb4"), hexrgb("#a9c985"), (380, 630), (600, 700))
    d.polygon(cr([(420, 680), (455, 690), (470, 780), (440, 800), (410, 760)], 5), fill=hexrgb("#b9d696"))
    d.polygon(cr([(455, 690), (500, 700), (510, 770), (480, 782)], 5), fill=hexrgb("#a3c27f"))
    if variant == "a":
        head_a(img, d)
    else:
        head_b(img, d)
    # --- casquette charbon, visière vers l'avant-gauche
    if variant == "a":
        cap = cr([(292, 318), (300, 262), (340, 205), (420, 168), (520, 164), (600, 190), (640, 238), (648, 290),
                  (630, 320), (560, 300), (470, 292), (380, 300)], 10)
        grad_fill(img, cap, hexrgb("#5a5a62"), hexrgb("#2b2b31"), (340, 180), (640, 320))
        brim = cr([(250, 318), (290, 296), (380, 290), (460, 298), (470, 318), (380, 330), (300, 338)], 6)
        grad_fill(img, brim, hexrgb("#3a3a42"), hexrgb("#22222a"), (260, 300), (470, 330))
    else:
        # casquette plate de trois quarts : le plateau bombé part vers l'arrière-droite, la visière vers la gauche
        cap = cr([(318, 322), (320, 270), (352, 222), (420, 186), (510, 174), (596, 190), (646, 228), (660, 276),
                  (644, 318), (600, 326), (520, 318), (430, 318)], 10)
        grad_fill(img, cap, hexrgb("#5c5c64"), hexrgb("#2a2a30"), (360, 190), (650, 320))
        d.polygon(cr([(420, 192), (470, 180), (452, 250), (430, 312), (414, 300), (426, 240)], 4), fill=hexrgb("#44444c"))
        brim = cr([(268, 342), (300, 318), (360, 306), (430, 310), (446, 326), (400, 342), (330, 350)], 6)
        grad_fill(img, brim, hexrgb("#3c3c44"), hexrgb("#1f1f26"), (280, 320), (446, 346))
    # --- plateau porté haut, à droite, sur la main proche (avant-bras vertical, main cachée sous le plateau)
    if variant == "c":
        # bras proche : le coude plus bas (contre le flanc), l'avant-bras en diagonale jusqu'au plateau, manche retroussée
        fore = cr([(862, 900), (826, 760), (800, 610), (790, 470), (842, 462), (858, 600), (900, 740), (930, 880)], 6)
        grad_fill(img, fore, hexrgb("#5373b0"), hexrgb("#2b3f74"), (800, 480), (930, 900))
        d.polygon(cr([(786, 500), (790, 462), (846, 458), (852, 500), (820, 512)], 4), fill=hexrgb("#e0a282"))   # poignet nu
    else:
        fore = cr([(790, 700), (765, 560), (770, 450), (812, 440), (838, 540), (860, 690)], 6)
        grad_fill(img, fore, hexrgb("#4b6aa8"), hexrgb("#2b3f74"), (770, 450), (860, 690))
    if variant == "c":
        # la main sous le plateau : paume à plat, quatre doigts écartés dont on voit le bout, pouce sur le côté
        d.polygon(cr([(772, 484), (760, 452), (770, 432), (860, 430), (872, 444), (850, 474), (812, 486)], 5), fill=hexrgb("#e6a886"))
        for fx in (776, 800, 824, 846):
            d.polygon(cr([(fx, 438), (fx + 4, 426), (fx + 16, 426), (fx + 18, 438)], 3), fill=hexrgb("#d69576"))
        d.polygon(cr([(752, 450), (762, 434), (784, 438), (774, 456)], 3), fill=hexrgb("#d69576"))
    elif variant != "a":
        # la main sous le plateau : poignet, paume à plat, pouce qui dépasse
        d.polygon(cr([(772, 452), (768, 428), (780, 414), (840, 412), (852, 420), (838, 446), (812, 452)], 5), fill=hexrgb("#e2a584"))
        d.polygon(cr([(760, 420), (772, 408), (792, 410), (782, 420)], 3), fill=hexrgb("#d39475"))
    tray = cr([(640, 400), (700, 382), (820, 376), (930, 386), (990, 404), (930, 424), (820, 432), (700, 426)], 8)
    grad_fill(img, tray, hexrgb("#d9d2c4"), hexrgb("#8f8778"), (650, 380), (990, 430))
    d.polygon(cr([(640, 404), (990, 408), (985, 418), (645, 414)], 3), fill=hexrgb("#6f685c"))
    # le burger (dôme doré, garniture), le cornet de frites, le verre de bière
    d.polygon(cr([(690, 392), (700, 340), (740, 318), (790, 322), (820, 350), (826, 392)], 8), fill=hexrgb("#d69a4a"))
    d.polygon(cr([(688, 392), (828, 392), (826, 404), (690, 404)], 3), fill=hexrgb("#6a3b24"))
    d.polygon(cr([(686, 386), (830, 386), (828, 392), (688, 394)], 3), fill=hexrgb("#9cc46a"))
    if variant == "c":
        # cornet de papier rayé rouge et blanc, frites dorées qui en sortent
        cone = cr([(846, 402), (832, 322), (906, 322), (892, 402)], 4)
        grad_fill(img, cone, hexrgb("#f3ebe0"), hexrgb("#d9cfc0"), (832, 330), (906, 400))
        for sx in (842, 862, 882):
            d.polygon([(sx, 324), (sx + 9, 324), (sx + 7, 402), (sx + 2, 402)], fill=hexrgb("#c9452f"))
        for i, x in enumerate(range(836, 904, 8)):
            top = 276 + (i * 13) % 30
            d.polygon([(x, 326), (x + 2, top), (x + 8, top + 2), (x + 7, 326)], fill=hexrgb("#f2c75c" if i % 2 else "#e8b448"))
    else:
        d.polygon(cr([(846, 400), (838, 330), (900, 330), (892, 400)], 4), fill=hexrgb("#c9452f"))
        for x in range(842, 900, 9):
            d.polygon([(x, 334), (x + 4, 290 + (x * 7) % 26), (x + 9, 292 + (x * 5) % 22), (x + 7, 334)], fill=hexrgb("#f2c75c"))
    d.polygon(cr([(916, 398), (908, 282), (962, 282), (956, 398)], 4), fill=hexrgb("#e6a93a"))
    d.polygon(cr([(904, 290), (912, 262), (940, 256), (966, 266), (968, 292)], 5), fill=hexrgb("#f8f2e4"))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, f"{variant}.png")
    img.save(p)
    print(p)


if __name__ == "__main__":
    draw(*(sys.argv[1:] or ["a"]))
