#!/usr/bin/env python3
"""La chaîne des Puys, à partir du profil relevé du puy de Dôme (tools/puys/puy-de-dome.json).

Usage : python tools/puys/build.py
Écrit :
  - css/puys.css              : --puys (silhouette pleine, pied de la barre d'onglets) et --puys-trait (soulignés)
  - index.html                : les symboles #puys-fill et #puys-line (entre <!-- PUYS:START --> et <!-- PUYS:END -->)
  - assets/img/hublot-ciel.svg : le fond des hublots (le puy de Dôme au couchant)
  - assets/img/puys/*.svg     : les plans du paysage de l'ouverture (lointain, dôme, plaine, premier plan)
Le puy de Dôme garde ses vraies proportions partout ; ses voisins (Petit Puy de Dôme, Pariou et son
cratère, Côme, Laschamps, la Vache et son cratère égueulé) sont des profils simplifiés.
"""
import json
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1].parent
HERE = Path(__file__).resolve().parent
RNG = np.random.default_rng(63)

# ---------- le profil relevé (pixels de la photo : 612 × 340) ----------
D = json.loads((HERE / 'puy-de-dome.json').read_text(encoding='utf-8'))
SW, SH = D['source_w'], D['source_h']
PROF = np.array([(x * (SW - 1), y * SH) for x, y in D['profile']], np.float64)
X0, X1 = 0, 494             # toute la crête relevée, de la gauche de la photo au flanc droit (coupé avant la chaîne lointaine)
BASE = 199.0                # pied du dôme sur la photo
SUMMIT_X, ANT_TOP = 259.0, 85.0   # l'antenne (relevée à la main : le mât est trop fin pour la photo)


def dome_height(xs):
    """Hauteur du dôme (pixels photo, au-dessus de BASE) pour des abscisses photo."""
    ys = np.interp(xs, PROF[:, 0], PROF[:, 1])
    hgt = np.clip(BASE - ys, 0, None)
    hgt[(xs < X0) | (xs > X1)] = 0
    return hgt


def bump(xs, cx, w, h, flat=0.0):
    """Un puy arrondi : cloche en cosinus, sommet éventuellement aplati."""
    u = np.clip(np.abs(xs - cx) / (w / 2), 0, 1)
    v = np.cos(u * math.pi / 2) ** (1.6 - flat)
    return h * v


def crater(xs, cx, w, h, depth, width, skew=0.0):
    """Un cône à cratère (Pariou), ou égueulé si skew ≠ 0 (la Vache)."""
    base = bump(xs, cx, w, h, flat=0.3)
    dip = depth * np.exp(-((xs - cx - skew * width) / (width / 2)) ** 2)
    return np.clip(base - dip, 0, None)


def rdp(pts, eps):
    """Simplification de Ramer–Douglas–Peucker."""
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    a, b = pts[0], pts[-1]
    ab = b - a
    n = np.hypot(*ab) or 1.0
    rel = pts - a
    d = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / n  # distance à la corde (produit vectoriel 2D)
    i = int(np.argmax(d))
    if d[i] > eps:
        left = rdp(pts[: i + 1], eps)
        right = rdp(pts[i:], eps)
        return np.vstack([left[:-1], right])
    return np.vstack([a, b])


def fmt(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def poly(pts):
    return 'M' + ' '.join(f'{fmt(x)} {fmt(y)}' for x, y in pts)


# ---------- la chaîne vue de Clermont (unités « chaîne » : largeur 520, hauteur 40) ----------
CW, CH = 520, 40
S_CHAIN = 0.354                         # échelle photo → chaîne (le dôme garde ses proportions)
DOME_X = 260.0 - SUMMIT_X * S_CHAIN     # le sommet au milieu de la chaîne


def chain_heights(X):
    """Hauteur de la chaîne (unités chaîne) en X (0–520)."""
    xs_photo = X0 + (X - DOME_X) / S_CHAIN
    h = dome_height(xs_photo) * S_CHAIN
    h = np.maximum(h, 4.5 + 1.2 * np.sin(X / 23.0) + 0.8 * np.sin(X / 7.3 + 1))  # le plateau des Dômes
    h = np.maximum(h, crater(X, 38, 64, 9.5, 3.0, 12, skew=0.9))                 # la Vache, égueulé
    h = np.maximum(h, bump(X, 104, 84, 12.0))                                     # Laschamps
    h = np.maximum(h, bump(X, 150, 44, 8.5))                                      # un petit puy
    h = np.maximum(h, bump(X, 336, 44, 12.5))                                     # Petit Puy de Dôme
    h = np.maximum(h, crater(X, 394, 60, 16.0, 2.6, 11))                          # Pariou et son cratère
    h = np.maximum(h, bump(X, 454, 80, 13.0))                                     # Côme
    h = np.maximum(h, bump(X, 508, 44, 8.5))                                      # Louchadière
    return h


def chain_paths():
    X = np.linspace(0, CW, CW * 2 + 1)
    Y = CH - chain_heights(X)
    pts = rdp(np.column_stack([X, Y]), 0.08)
    ax = DOME_X + (SUMMIT_X - X0) * S_CHAIN
    top_y = CH - (BASE - ANT_TOP) * S_CHAIN
    summit_y = float(np.interp(ax, X, Y))
    fill = poly(pts) + f' L{CW} {CH} L0 {CH}Z'
    # l'antenne : un mât fin, un palier, la pointe
    ant = (f'M{fmt(ax - 0.7)} {fmt(summit_y + 0.6)}L{fmt(ax - 0.45)} {fmt(top_y + 1.2)}L{fmt(ax)} {fmt(max(0.2, top_y))}'
           f'L{fmt(ax + 0.45)} {fmt(top_y + 1.2)}L{fmt(ax + 0.7)} {fmt(summit_y + 0.6)}Z'
           f'M{fmt(ax - 1.6)} {fmt(summit_y - 1.4)}h3.2v1.9h-3.2z')
    line = poly(pts)
    ant_line = f'M{fmt(ax)} {fmt(summit_y)}V{fmt(max(0.3, top_y))}'
    return fill, ant, line, ant_line, (ax, summit_y, top_y)


# ---------- l'ornement des titres : le dôme et ses deux voisins (vraies proportions) ----------
def trait_paths():
    # une fenêtre de la chaîne autour du dôme, 220 × 40
    X = np.linspace(150, 370, 441)
    Y = CH - chain_heights(X)
    pts = rdp(np.column_stack([X - 150, Y]), 0.08)
    ax = DOME_X + (SUMMIT_X - X0) * S_CHAIN - 150
    sy = float(np.interp(ax + 150, X, Y))
    top_y = CH - (BASE - ANT_TOP) * S_CHAIN
    return poly(pts), f'M{fmt(ax)} {fmt(sy)}V{fmt(max(0.4, top_y))}'


def data_uri(svg):
    svg = re.sub(r'\s+', ' ', svg).replace('"', "'").replace('#', '%23')
    return f'url("data:image/svg+xml;utf8,{svg}")'


# ---------- le bas du film : une chaîne simple, de simples dômes arrondis (pas le puy de Dôme) ----------
def chaine_simple():
    """Le ciel au-dessus d'une chaîne de dômes doux (520 × 40) : opaque au-dessus de la crête.
    Sert de masque au bas du film : sous la crête, on voit le vrai fond de l'appli."""
    X = np.linspace(0, CW, CW + 1)
    h = np.full_like(X, 5.0)
    for cx, w, hh in ((-20, 150, 10), (70, 170, 17), (186, 190, 24), (300, 200, 29), (412, 180, 20), (506, 160, 15)):
        d = np.clip((X - cx) / (w / 2), -1, 1)
        h += hh * np.cos(d * math.pi / 2) ** 2
    h = np.minimum(h, 36.0)
    pts = rdp(np.column_stack([X, CH - h]), 0.05)
    sky = f'M0 0 L{CW} 0 L' + poly(pts[::-1])[1:] + 'Z'
    return f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {CW} {CH}' preserveAspectRatio='none'><path d='{sky}'/></svg>"


def write_css_and_symbols():
    fill, ant, line, ant_line, _ = chain_paths()
    tline, tant = trait_paths()
    mask_fill = f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {CW} {CH}' preserveAspectRatio='none'><path d='{fill}'/><path d='{ant}'/></svg>"
    mask_line = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 220 40' preserveAspectRatio='none'>"
                 f"<path d='{tline}' fill='none' stroke='black' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/>"
                 f"<path d='{tant}' stroke='black' stroke-width='1.6'/></svg>")
    # le liseré de la chaîne du pied (même tracé que --puys) : un trait de 2 px à l'écran, quelle que soit la largeur
    mask_bord = (f"<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {CW} {CH}' preserveAspectRatio='none'>"
                 f"<path d='{line}' fill='none' stroke='black' stroke-width='2' stroke-linejoin='round' vector-effect='non-scaling-stroke'/>"
                 f"<path d='{ant_line}' fill='none' stroke='black' stroke-width='1.5' vector-effect='non-scaling-stroke'/></svg>")
    css = ('/* La chaîne des Puys : généré par tools/puys/build.py (profil du puy de Dôme relevé sur photo). */\n'
           ':root {\n'
           f'  --puys: {data_uri(mask_fill)};\n'
           f'  --puys-bord: {data_uri(mask_bord)};\n'
           f'  --puys-trait: {data_uri(mask_line)};\n'
           f'  --chaine: {data_uri(chaine_simple())};\n'
           '}\n')
    (ROOT / 'css' / 'puys.css').write_text(css, encoding='utf-8')
    sym = (f'    <!-- PUYS:START (généré par tools/puys/build.py) -->\n'
           f'    <symbol id="puys-fill" viewBox="0 0 {CW} {CH}" preserveAspectRatio="none"><path d="{fill}"/><path d="{ant}"/></symbol>\n'
           f'    <symbol id="puys-line" viewBox="0 0 {CW} {CH}" preserveAspectRatio="none"><path d="{line}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/><path d="{ant_line}" fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"/></symbol>\n'
           f'    <!-- PUYS:END -->')
    idx = ROOT / 'index.html'
    html = idx.read_text(encoding='utf-8')
    if '<!-- PUYS:START' in html:
        html = re.sub(r'    <!-- PUYS:START.*?<!-- PUYS:END -->', lambda m: sym, html, flags=re.S)
    else:
        # première fois : remplace les anciens symboles dessinés à la main
        html = re.sub(r'    <!-- La ligne des Puys \(silhouette pleine et trait seul\).*?\n    <symbol id="puys-fill".*?</symbol>\n    <symbol id="puys-line".*?</symbol>',
                      lambda m: sym, html, flags=re.S)
    idx.write_text(html, encoding='utf-8')


# ---------- le dôme en grand, relevé et lissé (pour le hublot et l'ouverture) ----------
def dome_outline(s, ox, base_y, x_from=X0, x_to=X1, step=2.0):
    xs = np.arange(x_from, x_to + step, step)
    ys = base_y - dome_height(xs) * s
    return np.column_stack([ox + (xs - X0) * s, ys])


def smooth_path(pts, close_to=None):
    """Chemin lissé (Catmull-Rom → Bézier) ; close_to = y du bas pour fermer."""
    p = np.asarray(pts, float)
    d = f'M{fmt(p[0][0])} {fmt(p[0][1])}'
    for i in range(len(p) - 1):
        p0 = p[i - 1] if i > 0 else p[i]
        p1, p2 = p[i], p[i + 1]
        p3 = p[i + 2] if i + 2 < len(p) else p2
        c1 = p1 + (p2 - p0) / 6
        c2 = p2 - (p3 - p1) / 6
        d += f'C{fmt(c1[0])} {fmt(c1[1])} {fmt(c2[0])} {fmt(c2[1])} {fmt(p2[0])} {fmt(p2[1])}'
    if close_to is not None:
        d += f'L{fmt(p[-1][0])} {fmt(close_to)}L{fmt(p[0][0])} {fmt(close_to)}Z'
    return d


def ridge_path(w, base, amp, waves, seed, close_to):
    rng = np.random.default_rng(seed)
    xs = np.linspace(-4, w + 4, 60)
    ph = rng.uniform(0, 6.28, len(waves))
    ys = base - sum(a * (0.5 + 0.5 * np.sin(xs / l + p)) for (a, l), p in zip(waves, ph)) * amp
    return smooth_path(np.column_stack([xs, ys]), close_to)


def write_hublot():
    """Le fond des hublots (200 × 200) : le puy de Dôme au couchant, comme la photo de référence."""
    s = 0.47
    ox, by = 14.0 - 96 * 0.47, 152.0
    outline = dome_outline(s, ox, by, x_from=0)
    dome_d = smooth_path(outline, close_to=200)
    ax = ox + (SUMMIT_X - X0) * s
    sy = float(np.interp(ax, outline[:, 0], outline[:, 1]))
    ty = by - (BASE - ANT_TOP) * s
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <!-- Le fond des hublots : le puy de Dôme au couchant (profil relevé, généré par tools/puys/build.py) -->
  <defs>
    <linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2E5A6E"/><stop offset=".22" stop-color="#5D8295"/><stop offset=".42" stop-color="#D99A86"/>
      <stop offset=".58" stop-color="#F0A560"/><stop offset=".7" stop-color="#F6C874"/><stop offset=".78" stop-color="#F8DB93"/>
    </linearGradient>
    <radialGradient id="s" cx="150" cy="138" r="70" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFF1C6"/><stop offset=".3" stop-color="#FBD68C" stop-opacity=".85"/><stop offset="1" stop-color="#F6B870" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="d" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#2B3520"/><stop offset=".55" stop-color="#35402A"/><stop offset=".8" stop-color="#4A4A2C"/><stop offset="1" stop-color="#5E5333"/>
    </linearGradient>
    <linearGradient id="p" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9FA65A"/><stop offset="1" stop-color="#6F7A36"/>
    </linearGradient>
  </defs>
  <rect width="200" height="200" fill="url(#c)"/>
  <circle cx="150" cy="138" r="70" fill="url(#s)"/>
  <path d="M22 50c9-3 20-3 28 1 5-2 12-1 15 2H18c1-1 2-2 4-3z" fill="#F08A63" opacity=".55"/>
  <path d="M104 36c7-3 16-2 21 1 6-1 11 0 14 2h-40c1-1 3-2 5-3z" fill="#F4A06C" opacity=".5"/>
  <path d="M130 70c6-2 13-2 17 1 4-1 8 0 10 2h-31c1-1 2-2 4-3z" fill="#F7B777" opacity=".45"/>
  {'<path d="' + ridge_path(200, 150, 1.0, [(5, 9), (3, 4), (1.5, 2)], 7, 200) + '" fill="#6D7A92" opacity=".75"/>'}
  <path d="{dome_d}" fill="url(#d)"/>
  <path d="M{fmt(ax - 0.5)} {fmt(sy + 0.5)}L{fmt(ax - 0.3)} {fmt(ty + 1)}L{fmt(ax)} {fmt(ty)}L{fmt(ax + 0.3)} {fmt(ty + 1)}L{fmt(ax + 0.5)} {fmt(sy + 0.5)}Z" fill="#2B3520"/>
  <path d="M{fmt(ax - 2.4)} {fmt(sy - 0.6)}h4.8v1.6h-4.8z" fill="#2B3520"/>
  <path d="M0 160C22 156 44 157 62 161C84 166 104 163 124 158C146 153 170 154 200 159V200H0Z" fill="#46542B"/>
  <path d="M0 171C30 165 62 166 92 172C120 177 150 175 176 169C186 167 194 166 200 166V200H0Z" fill="url(#p)"/>
  <path d="M0 166C14 165 28 168 40 174C50 179 56 187 60 200H0Z" fill="#2E3A1F"/>
  <path d="M112 200C120 191 136 186 158 184C176 182 190 183 200 185V200Z" fill="#3E4B24"/>
  <path d="M0 190C40 186 86 189 124 194C150 197 176 196 200 193V200H0Z" fill="#1F2915"/>
</svg>
'''
    (ROOT / 'assets' / 'img' / 'hublot-ciel.svg').write_text(svg, encoding='utf-8')


# ---------- l'ouverture : quatre plans, le plus de détails possible ----------
PW, PH = 480, 320


def trees(n, x0, x1, yfun, rmin, rmax, colors, seed, jitter=3.0):
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n):
        x = rng.uniform(x0, x1)
        y = yfun(x) + rng.uniform(-jitter, jitter)
        r = rng.uniform(rmin, rmax)
        c = colors[int(rng.integers(len(colors)))]
        out.append(f'<ellipse cx="{fmt(x)}" cy="{fmt(y)}" rx="{fmt(r)}" ry="{fmt(r * 0.86)}" fill="{c}"/>')
    return ''.join(out)


def write_splash_layers():
    out = ROOT / 'assets' / 'img' / 'puys'
    out.mkdir(parents=True, exist_ok=True)
    head = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {PW} {PH}" width="{PW}" height="{PH}" preserveAspectRatio="xMidYMax slice">'

    # 1) le lointain : la chaîne bleutée et la brume du couchant
    X = np.linspace(0, PW, 241)
    far = 214 - 1.3 * (chain_heights(X * CW / PW)) - 6 * np.sin(X / 51) - 3 * np.sin(X / 17 + 2)
    far_d = smooth_path(np.column_stack([X, far]), close_to=PH)
    lointain = f'''{head}
  <!-- plan 1 : la chaîne des Puys au loin, bleutée ; la lueur du couchant sur l'horizon -->
  <defs>
    <radialGradient id="g" cx="300" cy="206" r="260" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#F7C78A" stop-opacity=".75"/><stop offset=".35" stop-color="#E9967A" stop-opacity=".35"/><stop offset="1" stop-color="#1A130F" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6D7394"/><stop offset="1" stop-color="#3B3F57"/></linearGradient>
  </defs>
  <rect width="{PW}" height="{PH}" fill="url(#g)"/>
  <path d="M40 150c14-4 30-4 40 1 8-3 18-2 23 2H34c1-1 3-2 6-3z" fill="#E98C6B" opacity=".35"/>
  <path d="M300 128c11-4 25-3 33 1 8-2 16-1 20 2h-58c1-1 3-2 5-3z" fill="#F2A673" opacity=".38"/>
  <path d="M372 164c8-3 18-2 24 1 6-2 12-1 15 1h-43c1-1 2-1 4-2z" fill="#F4B77E" opacity=".35"/>
  <path d="{far_d}" fill="url(#f)" opacity=".92"/>
</svg>
'''
    (out / 'lointain.svg').write_text(lointain, encoding='utf-8')

    # 2) le puy de Dôme : relevé, éclairé par la droite, la voie du Panoramique, l'antenne, l'observatoire
    s = 0.80
    ox, by = 92.0 - 96 * 0.80, 262.0
    outline = dome_outline(s, ox, by, x_from=40, step=1.5)
    dome_d = smooth_path(outline, close_to=PH)
    ax = ox + (SUMMIT_X - X0) * s
    sy = float(np.interp(ax, outline[:, 0], outline[:, 1]))
    ty = by - (BASE - ANT_TOP) * s
    # la face éclairée : la même silhouette, décalée, révélée par un dégradé vers la droite
    lit = outline.copy()
    lit[:, 0] += 3.5
    lit[:, 1] += 2.2
    lit_d = smooth_path(lit, close_to=PH)
    # la voie du train à crémaillère : lacets qui montent en diagonale sur la face
    rail = []
    for k, (xa, xb, yoff) in enumerate([(ox + 40, ox + 262, 62), (ox + 250, ox + 110, 44), (ox + 120, ox + 222, 28), (ox + 214, ox + 160, 14)]):
        xa_, xb_ = sorted((xa, xb))
        xx = np.linspace(xa, xb, 30)
        yy = np.interp(xx, outline[:, 0], outline[:, 1]) + yoff * (0.6 + 0.4 * np.cos(np.linspace(0, 1, 30) * math.pi * 0.3))
        rail.append(smooth_path(np.column_stack([xx, yy])))
    # forêts sur les flancs bas, herbe plus claire en haut
    def flank_y(x):
        return float(np.interp(x, outline[:, 0], outline[:, 1])) + 38
    forests = trees(150, ox + 8, ox + 300, lambda x: flank_y(x) + 16, 2.2, 4.6, ['#232C1A', '#29331D', '#1E2616'], 21, jitter=14)
    dome = f'''{head}
  <!-- plan 2 : le puy de Dôme (profil relevé sur photo), lumière rasante du couchant par la droite -->
  <defs>
    <linearGradient id="d" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#232C1B"/><stop offset=".5" stop-color="#2E3822"/><stop offset="1" stop-color="#3A3F26"/></linearGradient>
    <linearGradient id="l" x1="0" y1="0" x2="1" y2=".3"><stop offset=".45" stop-color="#C98A4B" stop-opacity="0"/><stop offset=".75" stop-color="#C98A4B" stop-opacity=".32"/><stop offset="1" stop-color="#F0B06A" stop-opacity=".55"/></linearGradient>
    <linearGradient id="h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C8A3A" stop-opacity=".45"/><stop offset=".4" stop-color="#7C8A3A" stop-opacity="0"/></linearGradient>
    <clipPath id="k"><path d="{dome_d}"/></clipPath>
  </defs>
  <path d="{dome_d}" fill="url(#d)"/>
  <g clip-path="url(#k)">
    <path d="{lit_d}" fill="url(#l)"/>
    <rect x="0" y="{fmt(sy)}" width="{PW}" height="80" fill="url(#h)"/>
    {''.join(f'<path d="{r}" fill="none" stroke="#C9B98A" stroke-opacity=".38" stroke-width="1.1" stroke-dasharray="3 1.6"/>' for r in rail)}
    {forests}
  </g>
  <!-- le sommet : l'observatoire, le temple de Mercure, l'antenne -->
  <path d="M{fmt(ax - 9)} {fmt(sy + 1.2)}h7v-3.4h2.4v3.4h3v-2.2a2.2 2.2 0 0 1 4.4 0v2.2h4" fill="#1E2616"/>
  <path d="M{fmt(ax - 1.3)} {fmt(sy)}L{fmt(ax - 0.6)} {fmt(ty + 3)}L{fmt(ax)} {fmt(ty)}L{fmt(ax + 0.6)} {fmt(ty + 3)}L{fmt(ax + 1.3)} {fmt(sy)}Z" fill="#1E2616"/>
  <path d="M{fmt(ax - 2.2)} {fmt(ty + 7)}h4.4v1.4h-4.4zM{fmt(ax - 1.7)} {fmt(ty + 12)}h3.4v1.2h-3.4z" fill="#1E2616"/>
  <circle cx="{fmt(ax)}" cy="{fmt(ty - 0.6)}" r="1.1" fill="#FF6A4A"/>
</svg>
'''
    (out / 'dome.svg').write_text(dome, encoding='utf-8')

    # 3) la plaine : prés d'un vert pomme éteint, haies, arbres isolés, le chemin
    Xp = np.linspace(-4, PW + 4, 70)
    yp = 276 - 10 * np.sin(Xp / 70 + 0.6) - 5 * np.sin(Xp / 23 + 1.3)
    plaine_d = smooth_path(np.column_stack([Xp, yp]), close_to=PH)
    def plaine_y(x):
        return float(np.interp(x, Xp, yp))
    hedges = ''.join(trees(26, 20 + 90 * i, 90 + 90 * i, lambda x, i=i: plaine_y(x) + 10 + 6 * i, 1.4, 2.6, ['#3A4A22', '#445528'], 40 + i, jitter=2) for i in range(5))
    lone = trees(18, 10, PW - 10, lambda x: plaine_y(x) + 14, 2.4, 4.2, ['#2E3B1C', '#35431F'], 55, jitter=12)
    path_d = smooth_path(np.array([[268, PH], [262, 312], [274, 300], [266, 290], [281, 282], [290, 276]]))
    plaine = f'''{head}
  <!-- plan 3 : la plaine au pied du dôme, prés, haies, arbres, le chemin -->
  <defs><linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8E9A55"/><stop offset=".45" stop-color="#6E7A38"/><stop offset="1" stop-color="#4E5A28"/></linearGradient>
  <linearGradient id="r" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#F2C07A" stop-opacity=".35"/><stop offset=".6" stop-color="#F2C07A" stop-opacity="0"/></linearGradient></defs>
  <path d="{plaine_d}" fill="url(#p)"/>
  <path d="{plaine_d}" fill="url(#r)"/>
  {hedges}{lone}
  <path d="{path_d}" fill="none" stroke="#C7B78A" stroke-opacity=".55" stroke-width="2.2" stroke-linecap="round"/>
</svg>
'''
    (out / 'plaine.svg').write_text(plaine, encoding='utf-8')

    # 4) le premier plan : la crête sombre, herbes hautes, deux sapins
    Xf = np.linspace(-4, PW + 4, 80)
    yf = 300 - 7 * np.sin(Xf / 40 + 2.2) - 4 * np.sin(Xf / 13)
    front_d = smooth_path(np.column_stack([Xf, yf]), close_to=PH)
    grass = []
    rng = np.random.default_rng(77)
    for _ in range(140):
        x = rng.uniform(0, PW)
        y0 = float(np.interp(x, Xf, yf)) + 2
        hgt = rng.uniform(4, 11)
        lean = rng.uniform(-3, 3)
        grass.append(f'M{fmt(x)} {fmt(y0)}q{fmt(lean * 0.4)} {fmt(-hgt * 0.6)} {fmt(lean)} {fmt(-hgt)}')
    def fir(cx, base, hgt, w):
        tiers = []
        for i in range(5):
            t = i / 5
            yy = base - hgt * t
            ww = w * (1 - t * 0.8)
            tiers.append(f'M{fmt(cx - ww)} {fmt(yy)}L{fmt(cx)} {fmt(yy - hgt * 0.34)}L{fmt(cx + ww)} {fmt(yy)}Z')
        return f'<path d="{"".join(tiers)}M{fmt(cx - 1.2)} {fmt(base)}h2.4v6h-2.4z" fill="#0E120A"/>'
    premier = f'''{head}
  <!-- plan 4 : premier plan sombre, herbes, sapins -->
  <path d="{front_d}" fill="#121709"/>
  <path d="{''.join(grass)}" fill="none" stroke="#121709" stroke-width="1.4" stroke-linecap="round"/>
  {fir(26, 306, 58, 13)}{fir(46, 312, 40, 10)}{fir(452, 308, 62, 14)}
</svg>
'''
    (out / 'premier.svg').write_text(premier, encoding='utf-8')


def main():
    import sys
    write_css_and_symbols()
    write_hublot()
    if '--paysage' in sys.argv:  # ancien paysage procédural (remplacé par la version peinte de tools/puys/paint.py)
        write_splash_layers()
    sizes = {p.name: p.stat().st_size for p in (ROOT / 'assets' / 'img' / 'puys').glob('*.svg')}
    print('css/puys.css, index.html (symboles), hublot-ciel.svg,', ', '.join(f'{k} {v // 1024} Ko' for k, v in sizes.items()))


if __name__ == '__main__':
    main()
