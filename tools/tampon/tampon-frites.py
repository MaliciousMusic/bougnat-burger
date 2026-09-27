#!/usr/bin/env python3
"""Le tampon « Frites maison » de la fiche produit.

Usage : python tools/tampon/tampon-frites.py
Écrit le dessin fixe (anneaux, cornet de frites gravé, étoiles, sel, éclaboussures, arcs fantômes) dans
js/bb-carte.js, entre // TAMPON-FRITES:START et // TAMPON-FRITES:END, et une page d'aperçu
tools/tampon/apercu.html (FR et EN, grand et à la taille de la fiche).
Les mots courbés (FRITES / MAISON, HOMEMADE / FRIES) sont posés par bb-carte.js, dans la langue courante.
L'encre : le filtre #encre-tampon de index.html.
"""
import math
import random
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
random.seed(7)
CX = CY = 60.0


def f(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def pt(x, y):
    return f'{f(x)} {f(y)}'


def polar(r, deg):
    a = math.radians(deg)
    return CX + r * math.sin(a), CY - r * math.cos(a)  # 0° = en haut, sens horaire


def arc(r, a0, a1):
    x0, y0 = polar(r, a0)
    x1, y1 = polar(r, a1)
    large = 1 if (a1 - a0) % 360 > 180 else 0
    return f'M{pt(x0, y0)}A{f(r)} {f(r)} 0 {large} 1 {pt(x1, y1)}'


def star(x, y, ro, ri, rot=0):
    p = []
    for i in range(10):
        r = ro if i % 2 == 0 else ri
        a = math.radians(rot + i * 36)
        p.append(pt(x + r * math.sin(a), y - r * math.cos(a)))
    return 'M' + 'L'.join(p) + 'Z'


# ---------- le cornet et les frites (dessinés comme un masque : blanc = encre, noir = taille) ----------
def fry(bx, by, ang, L, w=5.6):
    a = math.radians(ang)
    dx, dy = math.sin(a), -math.cos(a)       # vers le haut de la frite
    nx, ny = math.cos(a), math.sin(a)        # vers sa droite
    bx, by = bx - dx * 7, by - dy * 7        # le pied, caché dans le cornet
    L += 7
    tx, ty = bx + dx * L, by + dy * L
    h = w / 2
    cut = random.uniform(-0.9, 0.9)          # le bout coupé, un peu de biais
    pts = [(bx - nx * h, by - ny * h), (tx - nx * h + dx * cut, ty - ny * h + dy * cut),
           (tx + nx * h - dx * cut, ty + ny * h - dy * cut), (bx + nx * h, by + ny * h)]
    body = 'M' + 'L'.join(pt(*q) for q in pts) + 'Z'
    # la taille du reflet : un trait fin le long de la frite, côté lumière
    o = -h * 0.3
    hl = f'M{pt(bx + dx * (L - 9.5) + nx * o, by + dy * (L - 9.5) + ny * o)}L{pt(bx + dx * (L - 3.4) + nx * o, by + dy * (L - 3.4) + ny * o)}'
    return body, hl


FRIES = [  # pied (x, y) sur le bord du cornet, angle depuis la verticale, longueur visible (de l'arrière vers l'avant)
    (50.0, 55.4, -24, 15.0),
    (72.5, 53.0, 24, 14.5),
    (56.0, 54.6, -9, 22.5),
    (66.5, 53.7, 12, 21.0),
    (61.2, 54.2, 1, 23.4),
    (52.8, 55.0, -17, 18.5),
    (70.0, 53.4, 19, 17.5),
]


def cornet():
    TL, TR, A = (44.0, 56.8), (77.5, 52.6), (61.0, 88.0)
    rim_c = (60.5, 58.6)
    body = f'M{pt(*TL)}Q{pt(*rim_c)} {pt(*TR)}L{pt(*A)}Z'
    fold0, fold1 = (46.5, 58.8), (70.2, 72.8)
    fold = f'M{pt(*fold0)}Q{pt(58, 62.5)} {pt(*fold1)}'
    # les hachures de la partie repliée (entre le pli et le bord droit), taillées vers la pointe
    hatches = []
    for x in (61.0, 64.4, 67.8, 71.2, 74.6):
        # point sur le bord du haut (courbe quadratique approchée)
        t = (x - TL[0]) / (TR[0] - TL[0])
        y = (1 - t) ** 2 * TL[1] + 2 * (1 - t) * t * rim_c[1] + t * t * TR[1] + 2.2
        dx, dy = A[0] - x, A[1] - y
        n = math.hypot(dx, dy)
        dx, dy = dx / n, dy / n
        # jusqu'au pli (droite fold0–fold1)
        ex, ey = fold1[0] - fold0[0], fold1[1] - fold0[1]
        den = dx * ey - dy * ex
        s = ((fold0[0] - x) * ey - (fold0[1] - y) * ex) / den
        s = max(0.0, s - 1.6)
        hatches.append(f'M{pt(x, y)}L{pt(x + dx * s, y + dy * s)}')
    # le bord roulé du cornet : un trait sous l'ouverture
    rim = f'M{pt(TL[0] + 1.5, TL[1] + 2.4)}Q{pt(rim_c[0], rim_c[1] + 2.6)} {pt(TR[0] - 1.8, TR[1] + 2.2)}'
    # quelques tailles courtes sur la partie avant (le papier froissé)
    nicks = [f'M{pt(52, 71)}l{pt(3.2, 4.4)}', f'M{pt(56.5, 79)}l{pt(1.8, 3)}', f'M{pt(49.5, 64.5)}l{pt(2.6, 3.3)}']
    return body, fold, hatches, rim, nicks


def mask_art():
    out = []
    # les frites, de l'arrière vers l'avant : chacune taille le contour de celles qu'elle recouvre
    for bx, by, ang, L in FRIES:
        body, hl = fry(bx, by, ang, L)
        out.append(f'<path d="{body}" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/>')
        out.append(f'<path d="{hl}" stroke="#000" stroke-width="1" stroke-linecap="round"/>')
    body, fold, hatches, rim, nicks = cornet()
    out.append(f'<path d="{body}" fill="#000" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/>')
    out.append(f'<path d="{body}" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>')
    out.append(f'<path d="{fold}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>')
    out.append(f'<path d="{" ".join(hatches)}" stroke="#fff" stroke-width="1.15" stroke-linecap="round"/>')
    out.append(f'<path d="{rim}" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/>')
    out.append(f'<path d="{" ".join(nicks)}" stroke="#fff" stroke-width="0.9" stroke-linecap="round"/>')
    return ''.join(out)


def encre_fixe():
    """Tout ce qui est à l'encre pleine (anneaux, étoiles, points, éclats), sans les mots."""
    g = []
    g.append(f'<circle cx="60" cy="60" r="55.2" fill="none" stroke-width="4.2"/>')
    g.append(f'<circle cx="60" cy="60" r="49.4" fill="none" stroke-width="1.3"/>')
    # l'anneau intérieur en pointillé, autour du cornet
    g.append(f'<circle cx="60" cy="60" r="32.6" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="0.01 3.12"/>')
    # les étoiles entre les deux mots
    g.append(f'<path stroke="none" d="{star(18.6, 60, 4.1, 1.75)}{star(101.4, 60, 4.1, 1.75)}"/>')
    # le sel, et les petits traits de « tout chaud »
    salt = ''.join(f'M{pt(x, y)}m-{f(r)} 0a{f(r)} {f(r)} 0 1 0 {f(2 * r)} 0a{f(r)} {f(r)} 0 1 0 -{f(2 * r)} 0'
                   for x, y, r in ((37.4, 50.2, 0.95), (35.4, 45.4, 0.75), (39.6, 44.2, 0.65), (34.8, 54.2, 0.6), (82.6, 49.6, 0.8), (84.8, 54.6, 0.6)))
    g.append(f'<path stroke="none" d="{salt}"/>')
    # le tampon a un peu glissé : deux arcs fantômes, et des éclaboussures autour
    g.append(f'<g fill="none" stroke-width="1.15" stroke-linecap="round" opacity=".75" transform="translate(1.6 -1.3)">'
             f'<path d="{arc(57.6, 292, 338)}" stroke-dasharray="11 2.6 5 3.4 22 4"/><path d="{arc(57.8, 104, 142)}" stroke-dasharray="7 3 16 2.4"/></g>')
    dots = []
    for _ in range(11):
        a = random.uniform(0, 360)
        r = random.uniform(58.4, 62.2)
        x, y = polar(r, a)
        rr = random.uniform(0.35, 0.95)
        dots.append(f'M{pt(x - rr, y)}a{f(rr)} {f(rr)} 0 1 0 {f(2 * rr)} 0a{f(rr)} {f(rr)} 0 1 0 -{f(2 * rr)} 0')
    g.append(f'<path stroke="none" d="{"".join(dots)}"/>')
    return ''.join(g)


# les chemins des mots : en haut, lu de gauche à droite par-dessus ; en bas, lu de gauche à droite par-dessous
HAUT = f'M{pt(CX - 36.9, CY)}A36.9 36.9 0 0 1 {pt(CX + 36.9, CY)}'
BAS = f'M{pt(CX - 45.3, CY)}A45.3 45.3 0 0 0 {pt(CX + 45.3, CY)}'

MASK = mask_art()
FIXE = encre_fixe()

js = (
    "  // TAMPON-FRITES:START (généré par tools/tampon/tampon-frites.py : anneaux, cornet gravé en masque, chemins des mots)\n"
    f"  const TF_MASK = '{MASK}';\n"
    f"  const TF_ENCRE = '{FIXE}';\n"
    f"  const TF_HAUT = '{HAUT}';\n"
    f"  const TF_BAS = '{BAS}';\n"
    "  // TAMPON-FRITES:END"
)
carte = ROOT / 'js' / 'bb-carte.js'
s = carte.read_text(encoding='utf-8')
s, n = re.subn(r'  // TAMPON-FRITES:START.*?// TAMPON-FRITES:END', lambda m: js, s, flags=re.S)
assert n == 1, 'marqueurs TAMPON-FRITES introuvables dans js/bb-carte.js'
carte.write_text(s, encoding='utf-8')


def stamp_svg(haut, bas, size, fs_h=12.6, fs_b=12.6, ls_h=2.4, ls_b=2.4, uid='a'):
    return f'''<svg viewBox="0 0 120 120" width="{size}" height="{size}" style="color:#C8E3A0;overflow:visible">
  <defs><path id="tfh-{uid}" d="{HAUT}"/><path id="tfb-{uid}" d="{BAS}"/>
  <mask id="tfm-{uid}" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">{MASK}</mask></defs>
  <g transform="rotate(-10 60 60)" filter="url(#encre-tampon)" fill="currentColor" stroke="currentColor" font-family="'Alfa Slab One', Rockwell, Georgia, serif">
    {FIXE}
    <rect width="120" height="120" stroke="none" mask="url(#tfm-{uid})"/>
    <text stroke="none" font-size="{fs_h}" letter-spacing="{ls_h}" text-anchor="middle"><textPath href="#tfh-{uid}" startOffset="50%">{haut}</textPath></text>
    <text stroke="none" font-size="{fs_b}" letter-spacing="{ls_b}" text-anchor="middle"><textPath href="#tfb-{uid}" startOffset="50%">{bas}</textPath></text>
  </g>
</svg>'''


idx = (ROOT / 'index.html').read_text(encoding='utf-8')
a = idx.index('    <filter id="encre-tampon"')
b = idx.index('</filter>', a) + len('</filter>')
html = f'''<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Tampon frites maison</title>
<link rel="stylesheet" href="../../css/fonts.css">
<style>body{{margin:0;background:#1E1611;display:flex;flex-wrap:wrap;gap:30px;padding:30px;align-items:center}}</style></head><body>
<svg width="0" height="0" style="position:absolute"><defs>{idx[a:b]}</defs></svg>
{stamp_svg('FRITES', 'MAISON', 360, uid='a')}
{stamp_svg('HOMEMADE', 'FRIES', 360, fs_h=10.6, ls_h=1.2, uid='b')}
{stamp_svg('FRITES', 'MAISON', 104, uid='c')}
{stamp_svg('HOMEMADE', 'FRIES', 104, fs_h=10.6, ls_h=1.2, uid='d')}
</body></html>'''
(HERE / 'apercu.html').write_text(html, encoding='utf-8')
print('js/bb-carte.js (TAMPON-FRITES), tools/tampon/apercu.html :', len(MASK) + len(FIXE), 'octets de dessin')
