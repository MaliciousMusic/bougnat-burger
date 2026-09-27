# -*- coding: utf-8 -*-
"""Maquette de l'ouverture : la scène complète en aplats et dégradés d'aérographe, construite sur nos silhouettes
exactes (scene.py). Elle sert d'image de départ à la peinture SDXL (sdxl.py) ; ses lignes (lisière des forêts,
parcelles, haies, chemin, voie du Panoramique) servent aussi aux détails nets posés sur les calques (paint.py).

Usage : python tools/puys/base.py            → tools/puys/_gen/base.svg et base.png (1536 × 1024)
Palette : lueur du couchant pêche #F2B48C, rose #E7B8AC, or #F9DE9E ; chaîne lointaine bleu violacé ;
Dôme et pentes en verts olive #7C8A3A, #5D6A2A, #3F4A1C, liseré chaud à droite ; prés vert pomme pastel
#C8E3A0 éteint par le soir ; premier plan olive presque noir. Jamais le vert lime de l'interface (#96C124)."""
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scene as SC  # noqa: E402
import motifs as M  # noqa: E402

GEN = os.path.join(HERE, '_gen')
VW, VH = SC.VW, SC.VH
GLOW = (338.0, 206.0)                 # cœur de la lueur du couchant (derrière le flanc droit du Dôme)


def xs_line(fn, x0=-14, x1=VW + 14, step=1.0):
    xs = np.arange(x0, x1 + step / 2, step)
    return np.column_stack([xs, fn(xs)])


def area_below(fn, bottom=VH + 4, x0=-14, x1=VW + 14, step=1.0, eps=0.05):
    pts = M.rdp(xs_line(fn, x0, x1, step), eps)
    d = M.polyline(pts)
    return d + f'V{M.f1(bottom)}H{M.f1(x0)}Z'


def band(fn_top, fn_bot, x0=-14, x1=VW + 14, step=1.0, eps=0.05):
    a = M.rdp(xs_line(fn_top, x0, x1, step), eps)
    b = M.rdp(xs_line(fn_bot, x0, x1, step), eps)[::-1]
    return M.polyline(np.vstack([a, b]), closed=True)


# ---------------------------------------------------------------- lignes secondaires (partagées avec paint.py)
_FOREST = [(-14, 3.0), (20, 4.0), (60, 5.5), (95, 8.0), (118, 12.0), (136, 22.0), (160, 36.0), (182, 52.0),
           (205, 60.0), (232, 50.0), (262, 44.0), (292, 42.0), (322, 40.0), (352, 17.0), (380, 9.0), (420, 5.0),
           (494, 4.0)]


def forest_top_y(x):
    """Lisière haute des forêts du Dôme (sous la crête) : les bois montent haut sur l'épaule gauche, restent au
    pied du cône, et remontent quelques ravines (langues de forêt)."""
    x = np.asarray(x, np.float64)
    off = np.interp(x, [p[0] for p in _FOREST], [p[1] for p in _FOREST])
    y = SC.dome_y(x) + off
    # langues de forêt dans les ravines
    for cx, w, up in ((150, 9, 9.0), (214, 11, 12.0), (268, 10, 10.0), (318, 8, 8.0)):
        y -= up * np.exp(-((x - cx) / w) ** 2)
    y += 1.2 * np.sin(x / 5.3) + 0.8 * np.sin(x / 2.9 + 1.0)
    return np.maximum(y, SC.dome_y(x) + 2.0)


def rail_points():
    """La voie du Panoramique des Dômes : sort des bois sur l'épaule gauche, traverse la face en montant vers la
    droite (une spirale vue de côté : elle se creuse au milieu), puis passe derrière la crête du plateau."""
    t = np.linspace(0, 1, 60)
    p0, p1, p2, p3 = np.array([96.0, 181.0]), np.array([150.0, 176.0]), np.array([236.0, 168.0]), np.array([300.0, 150.5])
    pts = ((1 - t) ** 3)[:, None] * p0 + (3 * (1 - t) ** 2 * t)[:, None] * p1 + (3 * (1 - t) * t ** 2)[:, None] * p2 + (t ** 3)[:, None] * p3
    # la voie reste sous la crête (au moins 3 u)
    pts[:, 1] = np.maximum(pts[:, 1], SC.dome_y(pts[:, 0]) + 3.0)
    return pts


def path_points():
    """Le chemin dans les prés : du coin bas gauche vers le pied du Dôme, en lacets qui se resserrent."""
    ctrl = np.array([[34, 330], [58, 300], [48, 280], [84, 262], [72, 248], [112, 238], [104, 229], [140, 223],
                     [150, 218.5], [172, 215.6]], np.float64)
    # Catmull-Rom échantillonné
    out = []
    P = np.vstack([ctrl[:1], ctrl, ctrl[-1:]])
    for i in range(1, len(P) - 2):
        for t in np.linspace(0, 1, 12, endpoint=False):
            p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(ctrl[-1])
    return np.array(out)


def path_ribbon(pts, w_near=7.0, w_far=0.7, y_near=320.0, y_far=214.0):
    """Ruban du chemin (largeur selon la profondeur)."""
    P = np.asarray(pts)
    tang = np.gradient(P, axis=0)
    tang /= np.hypot(tang[:, 0], tang[:, 1])[:, None] + 1e-9
    nrm = np.column_stack([-tang[:, 1], tang[:, 0]])
    k = np.clip((P[:, 1] - y_far) / (y_near - y_far), 0, 1) ** 1.3
    w = w_far + (w_near - w_far) * k
    L = P + nrm * (w / 2)[:, None]
    R = P - nrm * (w / 2)[:, None]
    return np.vstack([L, R[::-1]])


# parcelles de la plaine : rangs (écart sous la lisière) et limites qui fuient vers le pied du Dôme
FIELD_ROWS = [0.0, 2.6, 6.0, 10.5, 16.5, 24.5, 35.0, 48.0, 64.0]
VANISH = (212.0, 170.0)


def field_row_y(k, x):
    return SC.plain_top_y(x) + FIELD_ROWS[k] + 0.6 * np.sin(np.asarray(x) / (9 + 3 * k) + k)


def field_cuts(seed=5):
    """Limites de parcelles : pour chaque rang, des abscisses de coupe (droites qui fuient vers VANISH)."""
    rng = np.random.default_rng(seed)
    cuts = []
    for k in range(len(FIELD_ROWS) - 1):
        n = int(5 + k * 1.3)
        xs = np.sort(rng.uniform(-10, VW + 10, n))
        cuts.append(xs)
    return cuts


def hedge_segments(seed=5):
    """Haies (segments de lisière entre parcelles) : une partie des limites des rangs et des coupes."""
    rng = np.random.default_rng(seed + 1)
    segs = []
    cuts = field_cuts(seed)
    for k in range(1, len(FIELD_ROWS) - 1):
        xs = np.concatenate([[-14.0], cuts[k - 1], [VW + 14.0]])
        for a, b in zip(xs[:-1], xs[1:]):
            if rng.random() < 0.55:
                x = np.linspace(a, b, max(3, int((b - a) / 2)))
                segs.append(('row', k, np.column_stack([x, field_row_y(k, x)])))
    for k, xs in enumerate(cuts):
        for xc in xs:
            if rng.random() < 0.5:
                y0, y1 = None, None
                # la coupe va du haut au bas du rang, en fuyant vers VANISH
                ya = float(field_row_y(k, np.array([xc]))[0])
                yb = float(field_row_y(k + 1, np.array([xc]))[0])
                vx, vy = VANISH
                xa = vx + (xc - vx) * (ya - vy) / max(1e-3, (yb - vy))
                segs.append(('cut', k, np.array([[xa, ya], [xc, yb]])))
    return segs


# ---------------------------------------------------------------- la maquette complète
def lin(id_, x1, y1, x2, y2, stops, units='userSpaceOnUse'):
    st = ''.join(f'<stop offset="{o:g}" stop-color="{c}"' + (f' stop-opacity="{a:g}"' if a < 1 else '') + '/>'
                 for o, c, a in [(s + (1,))[:3] for s in stops])
    return f'<linearGradient id="{id_}" gradientUnits="{units}" x1="{x1:g}" y1="{y1:g}" x2="{x2:g}" y2="{y2:g}">{st}</linearGradient>'


def rad(id_, cx, cy, rx, ry, stops):
    st = ''.join(f'<stop offset="{o:g}" stop-color="{c}"' + (f' stop-opacity="{a:g}"' if a < 1 else '') + '/>'
                 for o, c, a in [(s + (1,))[:3] for s in stops])
    return (f'<radialGradient id="{id_}" gradientUnits="userSpaceOnUse" cx="{cx:g}" cy="{cy:g}" r="{rx:g}" '
            f'gradientTransform="translate({cx:g} {cy:g}) scale(1 {ry / rx:g}) translate({-cx:g} {-cy:g})">{st}</radialGradient>')


def clumps_svg(items, cols, rng, shadow=None):
    """items : [(cx, base_y, w, h)] → bouquets (ombre, lumière, reflet) ; cols = (ombre, lumière, reflet)."""
    sh, li, hi = [], [], []
    casts = []
    for (cx, by, w, h) in items:
        sil, lit, hil = M.clump_shapes(cx, by, w, h, rng)
        sh.append(M.catmull(M.rdp_closed(sil, 0.04), closed=True))
        li.append(M.catmull(M.rdp_closed(lit, 0.04), closed=True))
        if cols[2] and w > 3.2:
            hi.append(M.catmull(M.rdp_closed(hil, 0.04), closed=True))
        if shadow:
            L = w * shadow
            casts.append(f'M{M.f1(cx + w * 0.3)} {M.f1(by)}c{M.f1(-L * 0.3)} {M.f1(-w * 0.05)} {M.f1(-L * 0.8)} {M.f1(w * 0.04)} '
                         f'{M.f1(-L)} {M.f1(w * 0.12)}c{M.f1(L * 0.3)} {M.f1(w * 0.12)} {M.f1(L * 0.75)} {M.f1(w * 0.1)} {M.f1(L)} 0z')
    out = ''
    if casts:
        out += f'<path d="{"".join(casts)}" fill="{shadow_col}" fill-opacity=".45"/>'
    out += f'<path d="{"".join(sh)}" fill="{cols[0]}"/><path d="{"".join(li)}" fill="{cols[1]}"/>'
    if hi:
        out += f'<path d="{"".join(hi)}" fill="{cols[2]}"/>'
    return out


shadow_col = '#2B3316'


def build_svg(opaque_sky=True, parts=('ciel', 'lointain', 'dome', 'plaine', 'premier')):
    rng = np.random.default_rng(11)
    defs, body = [], []
    gx, gy = GLOW
    # ---------- ciel
    if 'ciel' in parts:
        defs.append(lin('sky', 0, 0, 0, SC.HORIZON, [(0, '#1A130F'), (0.34, '#241915'), (0.52, '#3E2622'), (0.68, '#6E4440'),
                                                    (0.8, '#A96F63'), (0.9, '#D99A82'), (1, '#EDB08A')]))
        defs.append(rad('glow', gx, gy, 190, 74, [(0, '#FCE6AE'), (0.22, '#F9DE9E', 0.9), (0.5, '#F2B48C', 0.55), (1, '#E7B8AC', 0)]))
        body.append(f'<rect x="-20" y="-20" width="{VW + 40}" height="{VH + 40}" fill="url(#sky)"/>')
        body.append(f'<rect x="-20" y="80" width="{VW + 40}" height="160" fill="url(#glow)"/>')
        # quelques voiles de nuages effilés, roses sur le couchant
        for (x, y, w, t, o) in ((40, 150, 120, 2.2, .35), (270, 128, 150, 2.6, .30), (360, 171, 110, 1.8, .45), (120, 178, 80, 1.4, .3)):
            body.append(f'<path d="M{x} {y}c{w * .25:g} -{t:g} {w * .6:g} -{t * 1.4:g} {w:g} -{t * .3:g}c-{w * .3:g} {t * .9:g} -{w * .7:g} {t * 1.2:g} -{w:g} {t * .3:g}z" fill="#E7B8AC" opacity="{o:g}"/>')
    # ---------- chaîne lointaine : la crête pâle, puis les puys bleu violacé
    if 'lointain' in parts:
        defs.append(lin('haze', 0, 0, VW, 0, [(0, '#8C86AC'), (0.45, '#A99BB6'), (0.7, '#C4A9B2'), (0.85, '#B7A1B4'), (1, '#9C92B2')]))
        defs.append(lin('farp', 0, 0, VW, 0, [(0, '#5C5A86'), (0.3, '#67648F'), (0.62, '#7E7399'), (0.78, '#8A7C9E'), (1, '#6E6892')]))
        defs.append(lin('farv', 0, 160, 0, SC.HORIZON + 4, [(0, '#FFFFFF', 0), (1, '#2A2A48', 0.35)]))
        body.append(f'<path d="{area_below(SC.far_haze_y)}" fill="url(#haze)"/>')
        fp = area_below(SC.far_puys_y)
        body.append(f'<path d="{fp}" fill="url(#farp)"/><path d="{fp}" fill="url(#farv)"/>')
        # liseré de lumière sur la crête des puys (contre-jour)
        ridge = M.polyline(M.rdp(xs_line(lambda x: SC.far_puys_y(x) + 0.5), 0.05))
        body.append(f'<path d="{ridge}" fill="none" stroke="#E9B9A6" stroke-width="0.9" stroke-opacity=".55"/>')
    # ---------- le Dôme
    if 'dome' in parts:
        dome = area_below(SC.dome_y)
        defs.append(f'<clipPath id="kd"><path d="{dome}"/></clipPath>')
        defs.append(lin('dh', -10, 0, 470, 0, [(0, '#35401A'), (0.3, '#3F4A1C'), (0.4, '#4D5A24'), (0.52, '#5D6A2A'),
                                               (0.66, '#6C7932'), (0.8, '#7C8A3A'), (1, '#86903F')]))
        defs.append(lin('dv', 0, 110, 0, 225, [(0, '#FFFFFF', 0), (0.45, '#1B2410', 0.05), (1, '#1B2410', 0.55)]))
        body.append(f'<path d="{dome}" fill="url(#dh)"/>')
        g = [f'<path d="{dome}" fill="url(#dv)"/>']
        # la face à l'ombre (à gauche du terminateur) : un voile froid
        term = np.array([[196, 116], [206, 132], [228, 148], [262, 160], [302, 172], [342, 190], [380, 208], [430, 226], [500, 240]])
        shade = M.catmull(term) + 'L500 330L-20 330L-20 100Z'
        defs.append(f'<filter id="soft3" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="3.2"/></filter>')
        defs.append(f'<filter id="soft1" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1"/></filter>')
        g.append(f'<path d="{shade}" fill="#2E3A2A" opacity=".32" filter="url(#soft3)"/>')
        # le versant éclairé : un croissant chaud le long de la crête droite
        crest = xs_line(SC.dome_y, 196, 470, 2.0)
        lit = np.vstack([crest + [0, -2], (crest + [0, 14])[::-1]])
        g.append(f'<path d="{M.polyline(lit, True)}" fill="#A39A50" opacity=".55" filter="url(#soft3)"/>')
        # ravines : sillons doux qui suivent la pente du cône (côté ombre à gauche, arête éclairée à droite)
        for (x0, y0, x1, y1, bend, w, c, o) in ((184, 131, 150, 176, -4, 3.2, '#2E3A18', .22), (203, 136, 194, 182, -2, 2.6, '#2E3A18', .2),
                                                (230, 146, 236, 184, 2, 2.8, '#2E3A18', .18), (262, 153, 282, 188, 3, 3.0, '#2E3A18', .16),
                                                (188, 133, 158, 176, -3, 1.6, '#8E944A', .18), (208, 139, 203, 182, -1, 1.4, '#8E944A', .16),
                                                (235, 148, 243, 184, 2, 1.4, '#9A9A4E', .16), (268, 155, 290, 188, 3, 1.6, '#A09C52', .2)):
            mx, my = (x0 + x1) / 2 + bend, (y0 + y1) / 2
            g.append(f'<path d="M{x0} {y0}Q{mx:g} {my:g} {x1} {y1}" stroke="{c}" stroke-width="{w:g}" '
                     f'stroke-linecap="round" fill="none" opacity="{o:g}" filter="url(#soft3)"/>')
        # la forêt du bas des pentes
        fo = area_below(forest_top_y, x0=-14, x1=500)
        defs.append(lin('fo', 0, 160, 0, 225, [(0, '#3B4719'), (1, '#252F10')]))
        g.append(f'<path d="{fo}" fill="url(#fo)"/>')
        # houppiers de la lisière et du sous-bois
        items = []
        for x in np.arange(-10, 480, 3.1):
            yt = float(forest_top_y(np.array([x]))[0])
            items.append((x + rng.normal(0, 0.8), yt + 3.2 + rng.normal(0, 0.6), 4.2 + rng.random() * 2.2, 4.0 + rng.random() * 1.8))
        for _ in range(170):
            x = rng.uniform(-10, 480)
            yt = float(forest_top_y(np.array([x]))[0])
            yb = min(float(SC.plain_top_y(np.array([x]))[0]) + 4, 232)
            if yb - yt < 6:
                continue
            y = rng.uniform(yt + 6, yb)
            items.append((x, y, 5.0 + rng.random() * 3.0, 4.4 + rng.random() * 2.0))
        items.sort(key=lambda t: t[1])
        g.append(clumps_svg(items, ('#2A3411', '#46521F', '#5E6A2B'), rng))
        # la voie du Panoramique
        rp = rail_points()
        g.append(f'<path d="{M.catmull(M.rdp(rp + [0, 0.7], 0.05))}" fill="none" stroke="#2A3414" stroke-width="1.3" opacity=".6"/>')
        g.append(f'<path d="{M.catmull(M.rdp(rp, 0.05))}" fill="none" stroke="#D9C79A" stroke-width=".8" opacity=".85"/>')
        # liseré chaud sur la crête (le couchant par la droite), qui s'éteint vers la gauche
        defs.append(lin('rim', 150, 0, 470, 0, [(0, '#F9DE9E', 0), (0.15, '#F9DE9E', 0.5), (0.55, '#F2B48C', 0.9), (1, '#F2B48C', 0.7)]))
        g.append(f'<path d="{M.polyline(M.rdp(xs_line(SC.dome_y, 150, 470, 1.0), 0.03))}" fill="none" stroke="url(#rim)" stroke-width="2"/>')
        body.append(f'<g clip-path="url(#kd)">{"".join(g)}</g>')
        # sommet : antenne et observatoire (silhouettes)
        body.append(summit_svg())
    # ---------- la plaine
    if 'plaine' in parts:
        body.append(plain_svg(rng))
    # ---------- premier plan
    if 'premier' in parts:
        body.append(front_svg(rng))
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" width="{VW}" height="{VH}" '
            f'preserveAspectRatio="xMidYMax slice"><defs>{"".join(defs)}</defs>{"".join(body)}</svg>')


def summit_svg(dark='#1C2412', rim='#F2B48C', light='#FF6A4A', glow=True):
    """Le sommet : le mât de télévision (fin, effilé, un palier, un feu rouge), l'observatoire et ses coupoles,
    le petit mât voisin. Posé sur la crête exacte."""
    ax, top = SC.ANT_TOP
    fy = SC.ANT_FOOT_Y
    h = fy - top
    y_at = lambda x: float(SC.dome_y(np.array([x]))[0])
    out = []
    # l'observatoire : un bloc bas à gauche du mât, une coupole, une aile plus basse
    b0, b1 = ax - 7.6, ax - 1.2
    yb = max(y_at(b0), y_at(b1)) + 0.6
    out.append(f'<path d="M{M.f1(b0)} {M.f1(yb)}V{M.f1(fy - 2.2)}h2.1v-.8h2.4v.8h1.9V{M.f1(yb)}z" fill="{dark}"/>')
    out.append(f'<path d="M{M.f1(ax - 5.9)} {M.f1(fy - 2.9)}a1.25 1.25 0 0 1 2.5 0z" fill="{dark}"/>')        # coupole
    out.append(f'<path d="M{M.f1(ax + 1.0)} {M.f1(y_at(ax + 4) + 0.5)}V{M.f1(fy - 1.1)}h3.6V{M.f1(y_at(ax + 4.6) + 0.5)}z" fill="{dark}"/>')  # la gare
    # deux fenêtres encore éclairées (le soir tombe)
    out.append(f'<path d="M{M.f1(b0 + 1.0)} {M.f1(fy - 1.35)}h.55v.4h-.55zM{M.f1(b0 + 3.3)} {M.f1(fy - 1.35)}h.55v.4h-.55z" fill="#F9D98E" opacity=".9"/>')
    # le petit mât voisin
    out.append(f'<path d="M{M.f1(ax - 9.4)} {M.f1(y_at(ax - 9.4) + 0.4)}l.25 -{M.f1(h * 0.34)}h.3l.25 {M.f1(h * 0.34)}z" fill="{dark}"/>')
    # le grand mât : fût effilé, palier aux deux tiers, pointe
    w0, w1 = 1.3, 0.42
    p1 = fy - h * 0.62
    out.append(f'<path d="M{M.f1(ax - w0 / 2)} {M.f1(fy + 0.4)}L{M.f1(ax - w1 / 2)} {M.f1(top + 2.4)}L{M.f1(ax - 0.12)} {M.f1(top)}'
               f'L{M.f1(ax + 0.12)} {M.f1(top)}L{M.f1(ax + w1 / 2)} {M.f1(top + 2.4)}L{M.f1(ax + w0 / 2)} {M.f1(fy + 0.4)}z" fill="{dark}"/>')
    out.append(f'<path d="M{M.f1(ax - 1.9)} {M.f1(p1)}h3.8v1.1h-3.8zM{M.f1(ax - 1.2)} {M.f1(fy - h * 0.34)}h2.4v.9h-2.4z" fill="{dark}"/>')
    # liseré chaud à droite (le couchant)
    out.append(f'<path d="M{M.f1(ax + w0 / 2 - 0.25)} {M.f1(fy)}L{M.f1(ax + w1 / 2 - 0.1)} {M.f1(top + 2.4)}" stroke="{rim}" stroke-width=".35" opacity=".8"/>')
    out.append(f'<path d="M{M.f1(ax + 1.2)} {M.f1(p1)}h.7" stroke="{rim}" stroke-width=".5" opacity=".8"/>')
    # le feu rouge
    if glow:
        out.append(f'<circle cx="{M.f1(ax)}" cy="{M.f1(top - 0.2)}" r="1.5" fill="{light}" opacity=".3"/>')
    out.append(f'<circle cx="{M.f1(ax)}" cy="{M.f1(top - 0.2)}" r=".7" fill="{light}"/>')
    return ''.join(out)


def plain_svg(rng):
    out = []
    defs = []
    top = SC.plain_top_y
    # fond des prés
    out.append(f'<path d="{area_below(top)}" fill="#A9BE86"/>')
    # parcelles : couleurs alternées, plus chaudes à droite (le couchant), plus sombres vers le bas
    pal = ['#C8E3A0', '#BCD495', '#C9CE92', '#AFC68A', '#D3D9A0', '#A3B87F', '#B8C98C']
    cuts = field_cuts()
    for k in range(len(FIELD_ROWS) - 1):
        xs = np.concatenate([[-14.0], cuts[k], [VW + 14.0]])
        ya = lambda x, k=k: field_row_y(k, x)
        yb = lambda x, k=k: field_row_y(k + 1, x)
        vx, vy = VANISH
        for a, b in zip(xs[:-1], xs[1:]):
            col = pal[int(rng.integers(len(pal)))]
            # coins : les coupes fuient vers VANISH
            def cut_top(xc):
                y_b = float(yb(np.array([xc]))[0])
                y_a = float(ya(np.array([xc]))[0])
                return vx + (xc - vx) * (y_a - vy) / max(1e-3, (y_b - vy))
            ta, tb = cut_top(a), cut_top(b)
            n = 8
            upper = np.column_stack([np.linspace(ta, tb, n), ya(np.linspace(ta, tb, n))])
            lower = np.column_stack([np.linspace(b, a, n), yb(np.linspace(b, a, n))])
            poly = np.vstack([upper, lower])
            shade = 0.9 - 0.1 * k / len(FIELD_ROWS)
            out.append(f'<path d="{M.polyline(poly, True)}" fill="{col}" opacity="{shade:.2f}"/>')
    # lumière du couchant (à droite) et ombre du soir (vers le bas, contre le talus)
    defs.append(lin('pw', 0, 0, VW, 0, [(0, '#5F6F8A', 0.18), (0.5, '#FFFFFF', 0), (0.8, '#F9DE9E', 0.18), (1, '#F2B48C', 0.3)]))
    defs.append(lin('pv', 0, 208, 0, 270, [(0, '#F2B48C', 0.12), (0.35, '#FFFFFF', 0), (1, '#27310F', 0.55)]))
    out.append(f'<path d="{area_below(top)}" fill="url(#pw)"/><path d="{area_below(top)}" fill="url(#pv)"/>')
    # haies
    hedges = []
    items = []
    for kind, k, pts in hedge_segments():
        depth = np.clip((pts[:, 1].mean() - 212) / 60, 0, 1)
        wd = 0.6 + 1.6 * depth
        hedges.append(f'<path d="{M.polyline(pts)}" stroke="#3F4A1C" stroke-width="{wd:.2f}" fill="none" stroke-linecap="round"/>')
        L = np.hypot(*(pts[-1] - pts[0]))
        n = int(L / (1.2 + 3.5 * depth))
        for t in rng.uniform(0, 1, n):
            p = pts[0] + (pts[-1] - pts[0]) * t if kind == 'cut' else pts[min(len(pts) - 1, int(t * (len(pts) - 1)))]
            s = 1.0 + 3.6 * depth
            items.append((p[0] + rng.normal(0, 0.3), p[1] + 0.3, s * (0.9 + 0.5 * rng.random()), s * (0.8 + 0.4 * rng.random())))
    out += hedges
    # arbres isolés
    for _ in range(26):
        x = rng.uniform(-10, 490)
        y = float(top(np.array([x]))[0]) + rng.uniform(4, 44)
        depth = np.clip((y - 212) / 60, 0, 1)
        s = 2.2 + 6.0 * depth
        items.append((x, y, s * (0.9 + 0.4 * rng.random()), s * (1.0 + 0.3 * rng.random())))
    items.sort(key=lambda t: t[1])
    out.append(clumps_svg(items, ('#34401A', '#5B6A2C', '#7D8A3E'), rng, shadow=2.2))
    # le chemin
    pp = path_points()
    rib = path_ribbon(pp)
    out.append(f'<path d="{M.polyline(rib, True)}" fill="#DCCF9E"/>')
    out.append(f'<path d="{M.polyline(path_ribbon(pp + [0.5, 0.6], 2.0, 0.3), True)}" fill="#8E8A5E" opacity=".35"/>')
    return f'<defs>{"".join(defs)}</defs>' + ''.join(out)


def front_svg(rng):
    out = []
    top = SC.front_top_y
    d = area_below(top)
    out.append(f'<path d="{d}" fill="#1B210E"/>')
    out.append(f'<defs>{lin("fv", 0, 236, 0, 320, [(0, "#2A3214"), (0.4, "#1A200D"), (1, "#12160A")])}</defs>')
    out.append(f'<path d="{d}" fill="url(#fv)"/>')
    # herbes hautes le long de la crête du talus
    tufts = []
    for x in np.arange(-10, 492, 2.6):
        x += rng.normal(0, 0.7)
        y = float(top(np.array([x]))[0]) + 1.2
        tufts.append(M.grass_tuft(x, y, 3.0 + 4.0 * rng.random(), rng))
    out.append(f'<path d="{"".join(tufts)}" fill="#1B210E"/>')
    # buissons et arbres bas sur le talus
    items = []
    for x in (8, 20, 33, 402, 416, 452, 470):
        y = float(top(np.array([x]))[0]) + 3
        items.append((x, y, 9 + 6 * rng.random(), 8 + 6 * rng.random()))
    out.append(clumps_svg(items, ('#161B0B', '#252D12', None), rng))
    firs = []
    for (x, hh) in ((-2, 40), (12, 30), (462, 34), (478, 44)):
        y = float(top(np.array([x]))[0]) + 4
        sil, lit = M.conifer(x, y, hh, hh * 0.36, rng)
        firs.append(M.polyline(sil, True))
    out.append(f'<path d="{"".join(firs)}" fill="#12160A"/>')
    return ''.join(out)


def main():
    os.makedirs(GEN, exist_ok=True)
    svg = build_svg()
    p = os.path.join(GEN, 'base.svg')
    open(p, 'w', encoding='utf-8').write(svg)
    png = os.path.join(GEN, 'base.png')
    subprocess.run(['node', os.path.join(HERE, 'raster.mjs'), p, png, '1536', '1024'], check=True)
    print('base.svg', len(svg) // 1024, 'Ko -> base.png')


if __name__ == '__main__':
    main()


# ---------------------------------------------------------------- lisière festonnée des forêts du Dôme
def forest_crowns(seed=7):
    """Houppiers de la lisière : (x, y du pied de l'arc, rayon), serrés, de tailles variées."""
    rng = np.random.default_rng(seed)
    out = []
    x = -16.0
    while x < VW + 20:
        r = float(rng.uniform(1.0, 2.2)) * (1.45 if rng.random() < 0.18 else 1.0)   # quelques grands arbres
        base = float(forest_top_y(np.array([x]))[0]) + r * float(rng.uniform(0.35, 0.75))
        out.append((x, base, r))
        x += r * float(rng.uniform(0.9, 1.5))
    return out


_CROWNS = None


def forest_edge_y(x):
    """Lisière festonnée : la ligne des bois (forest_top_y) découpée par l'arrondi des houppiers."""
    global _CROWNS
    if _CROWNS is None:
        _CROWNS = forest_crowns()
    x = np.asarray(x, np.float64)
    y = forest_top_y(x) + 1.2
    for (cx, by, r) in _CROWNS:
        m = np.abs(x - cx) < r
        if m.any():
            y[m] = np.minimum(y[m], by - np.sqrt(r * r - (x[m] - cx) ** 2))
    return np.maximum(y, SC.dome_y(x) + 1.0)


# ---------------------------------------------------------------- haies en courbes de niveau dans la plaine
HEDGE_ROWS = [3.0, 8.2, 15.4, 25.5, 38.5]


def hedge_row_y(k, x):
    x = np.asarray(x, np.float64)
    return SC.plain_top_y(x) + HEDGE_ROWS[k] + 0.9 * np.sin(x / (13 + 4 * k) + 1.7 * k) + 0.5 * np.sin(x / 5.1 + k)


def depth_of(y):
    """0 au fond de la plaine (lisière), 1 au bord du talus."""
    return float(np.clip((y - 212.0) / 46.0, 0, 1))


FRONT_OFF = 52.0                         # le bas de la plaine (sous le talus du premier plan)


def band_edge_y(k, x):
    """Bords des bandes de parcelles : -1 = lisière de la plaine, 0..4 = rangs de haies, 5 = sous le talus."""
    x = np.asarray(x, np.float64)
    if k < 0:
        return SC.plain_top_y(x)
    if k >= len(HEDGE_ROWS):
        return SC.plain_top_y(x) + FRONT_OFF
    return hedge_row_y(k, x)


def fields_layout(seed=19):
    """Le bocage : chaque bande (entre deux rangs) est coupée en parcelles par des limites qui fuient vers le pied
    du Dôme. Renvoie [(bande k, x gauche, x droite)] (x pris sur le bord bas de la bande) et, pour chaque bord de
    parcelle, s'il porte une haie."""
    rng = np.random.default_rng(seed)
    fields, row_hedges, cut_hedges = [], [], []
    for k in range(-1, len(HEDGE_ROWS)):
        n = 2 + (k + 1) // 2
        cuts = np.sort(rng.uniform(-10, VW + 10, n))
        edges = [-16.0] + [float(c) for c in cuts] + [VW + 16.0]
        for a, b in zip(edges[:-1], edges[1:]):
            fields.append((k, a, b))
            if k >= 0 and rng.random() < 0.6:          # haie sur le haut de la parcelle
                row_hedges.append((k, a, b))
        for c in cuts:
            if k >= 0 and rng.random() < 0.45:
                cut_hedges.append((float(c), k))
    return fields, row_hedges, cut_hedges


def cut_x_at(xb, k_bot, y):
    """Abscisse, à la hauteur y, de la limite qui passe par xb sur le bord bas de la bande k_bot (fuite vers VANISH)."""
    yb = float(band_edge_y(k_bot, np.array([xb]))[0])
    vx, vy = VANISH
    return vx + (xb - vx) * (y - vy) / max(1e-3, yb - vy)


def hedge_layout(seed=19):
    """Haies : tronçons (x0, x1) sur chaque rang (le haut des parcelles qui en portent une), et limites plantées
    (x du bas, rang du haut) pour les haies perpendiculaires."""
    fields, row_hedges, cut_hedges = fields_layout(seed)
    rows = [[] for _ in HEDGE_ROWS]
    for (k, a, b) in row_hedges:
        y = float(band_edge_y(k, np.array([(a + b) / 2]))[0])
        xa, xb = cut_x_at(a, k + 1, y), cut_x_at(b, k + 1, y)
        rows[k].append((min(xa, xb) + 0.8, max(xa, xb) - 0.8))
    cross = [(xb, k) for (xb, k) in cut_hedges if k + 1 < len(HEDGE_ROWS)]
    return rows, cross


def cross_points(xb, k, n=12):
    """Haie perpendiculaire du rang k au rang k+1, alignée sur la fuite vers VANISH."""
    yb = float(hedge_row_y(k + 1, np.array([xb]))[0])
    vx, vy = VANISH
    ya0 = float(hedge_row_y(k, np.array([xb]))[0])
    xa = vx + (xb - vx) * (ya0 - vy) / max(1e-3, yb - vy)
    ya = float(hedge_row_y(k, np.array([xa]))[0])
    t = np.linspace(0, 1, n)
    return np.column_stack([xa + (xb - xa) * t, ya + (yb - ya) * t])
