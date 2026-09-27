# -*- coding: utf-8 -*-
"""L'ouverture peinte : quatre plans SVG (assets/img/puys/{lointain,dome,plaine,premier}.svg, viewBox 480 × 320,
preserveAspectRatio « xMidYMax slice »), comme une affiche de voyage des années 1930 (Broders, Cassandre).

Chaîne (la manière « Pierre Guillaume ») :
  1. base.py  : la maquette en aplats et dégradés, sur nos silhouettes exactes (scene.py) ;
  2. sdxl.py  : la peinture SDXL image → image (force modérée : la composition tient) ; les peintures retenues sont
                gardées dans tools/puys/source/ (la vectorisation se refait sans GPU) ;
  3. ici      : chaque plan est découpé avec NOS masques exacts, vectorisé (lissage L0 → k-moyennes Lab → filtre de
                mode → plages → dégradé ajusté par plage → velouté), puis coiffé de détails vectoriels nets : antenne,
                observatoire, voie du Panoramique, lisière festonnée des bois, haies en courbes de niveau, bosquets et
                arbres éclairés d'un côté (ombre portée vers la gauche), chemin, herbes du talus.
                Le Dôme est découpé par SON profil relevé : sa silhouette reste exacte même si SDXL a dérivé.

Usage : python tools/puys/paint.py              → assets/img/puys/*.svg
        python tools/puys/paint.py --out DOSSIER → ailleurs (essais)
Variables : PUYS_DEBUG=1 (images intermédiaires dans tools/puys/_gen/debug)."""
import json
import os
import sys
import time

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scene as SC  # noqa: E402
import motifs as M  # noqa: E402
import base as B  # noqa: E402
from vectorize import Vectorizer, hexc, extend_soft, paint_svg, l0_smooth  # noqa: E402

OUT = os.path.join(SC.ROOT, 'assets', 'img', 'puys')
GEN = os.path.join(HERE, '_gen')
SRC = os.path.join(HERE, 'source')
DEBUG = os.environ.get('PUYS_DEBUG')
K = 2.0                                  # résolution de vectorisation : 2 px par unité (960 × 640)
VW, VH = SC.VW, SC.VH
XS, YS = SC.grid(K)
XX, YY = np.meshgrid(XS, YS)
LIGHT = '#F9DE9E'


def dbg(name, img):
    if DEBUG:
        os.makedirs(os.path.join(GEN, 'debug'), exist_ok=True)
        cv2.imwrite(os.path.join(GEN, 'debug', name + '.png'), np.clip(img, 0, 255).astype(np.uint8)[..., ::-1])


# ---------------------------------------------------------------- masques exacts (à la résolution K)
def line_mask(fn, dy=0.0):
    return YY >= (fn(XS) + dy)[None, :]


def dilate(m, r):
    if r <= 0:
        return m
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.dilate(m.astype(np.uint8), k).astype(bool)


def erode(m, r):
    if r <= 0:
        return m
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.erode(m.astype(np.uint8), k).astype(bool)


M_DOME = line_mask(SC.dome_y)
M_FOREST = line_mask(B.forest_edge_y)
M_PLAIN = line_mask(SC.plain_top_y)
M_FRONT = line_mask(SC.front_top_y)


# ---------------------------------------------------------------- chemins exacts (unités de la scène)
def exact_below(fn, x0=-16, x1=VW + 16, step=0.5, eps=0.02, bottom=VH + 6):
    pts = M.rdp(B.xs_line(fn, x0, x1, step), eps)
    return M.polyline(pts, prec=2) + f'V{bottom}H{x0}Z'


def load_painting(path):
    img = cv2.imread(path, cv2.IMREAD_COLOR)[..., ::-1].astype(np.float32)
    W, H = int(round(VW * K)), int(round(VH * K))
    return cv2.resize(img, (W, H), interpolation=cv2.INTER_AREA)


def grade(img, L=1.0, C=1.0, warm=0.0):
    """Retouche de couleur en Lab : clarté × L, saturation × C, un soupçon de chaud (le soir)."""
    lab = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    lab[..., 0] *= L
    lab[..., 1:] = 128 + (lab[..., 1:] - 128) * C
    lab[..., 1] += warm * 0.4
    lab[..., 2] += warm
    return cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)


# ---------------------------------------------------------------- un plan vectorisé
def hidden_fill(img, known, sigma_far=18.0):
    """Prolonge la peinture hors de la partie connue (sous les plans plus proches) sans stries : pixel connu le plus
    proche, puis flou de plus en plus large avec la distance, surtout en largeur (ces parties ne se voient qu'à
    l'ouverture, quand le plan de devant est encore transparent)."""
    ext = extend_soft(img, known, 3.0)
    far = cv2.GaussianBlur(ext, (0, 0), sigmaX=sigma_far * 2.5, sigmaY=sigma_far)
    d = cv2.distanceTransform((~known.astype(bool)).astype(np.uint8), cv2.DIST_L2, 3)
    w = np.clip((d - 3) / 16.0, 0, 1)[..., None]
    out = ext * (1 - w) + far * w
    out[known.astype(bool)] = img[known.astype(bool)]
    return out


def vector_plane(prefix, img, region, visible, lam=0.006, mode=3, k=20, min_area=12, grad_min=40, soften=0.5,
                 fit_sigma=1.5, eps=0.6, smooth=1.0, core=2, blur_x=0.0, close=0, open_=0, seed=1):
    """Plan peint : plaque = la peinture sur la partie visible (relevée un peu à l'intérieur), prolongée sous les
    plans plus proches ; `close` efface les traits sombres fins (fermeture) ; lissage L0 (plages franches) ;
    `open_` efface les traits clairs fins (ouverture) ; facettes à dégradés ajustés. Coordonnées en pixels K
    (remises à l'échelle de la scène par scaled())."""
    t0 = time.time()
    c = erode(visible, core) if core else visible
    if c.sum() < 0.5 * visible.sum():
        c = visible
    src = img
    if close:
        src = cv2.morphologyEx(src, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (close, close)))
    if open_:
        src = cv2.morphologyEx(src, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (open_, open_)))
    plate = hidden_fill(src, c)
    ys, _ = np.where(region)
    y0, y1 = max(0, ys.min() - 8), min(img.shape[0], ys.max() + 9)
    shape = plate.copy()
    if lam:
        shape[y0:y1] = l0_smooth(plate[y0:y1], lam)
    fit = cv2.GaussianBlur(plate, (0, 0), fit_sigma) if fit_sigma else plate
    if blur_x > 0:
        shape = cv2.GaussianBlur(shape, (0, 0), sigmaX=blur_x, sigmaY=0.5)
        fit = cv2.GaussianBlur(fit, (0, 0), sigmaX=blur_x, sigmaY=0.5)
    shape = hidden_fill(shape, c)                  # les parties cachées : prolongées puis floutées (pas de stries)
    fit = hidden_fill(fit, c)
    dbg(prefix + '-shape', shape)
    vz = Vectorizer(prefix)
    st = {}
    body = paint_svg(vz, shape, region, k=k, min_area=min_area, dab_de=999, grad_min=grad_min, smooth=smooth, eps=eps,
                     soften=soften, clip=False, under=hexc(fit[visible].mean(0)), stats=st, min_delta=2.0,
                     bil=(3, 6, 2), prec=0, fit_img=fit, mode=mode, seed=seed)
    print(f'    {prefix} : {st.get("facets", 0)} plages ({time.time() - t0:.1f} s)', flush=True)
    return vz, body


def scaled(body):
    return f'<g transform="scale({1 / K:g})">{body}</g>'


def svg_doc(defs, body, comment):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW} {VH}" width="{VW}" height="{VH}" '
            f'preserveAspectRatio="xMidYMax slice">\n<!-- {comment} -->\n<defs>{"".join(defs)}</defs>{body}</svg>\n')


# ---------------------------------------------------------------- bouquets d'arbres (côté ombre / côté lumière)
def trees_svg(items, cols, rng, shadow=None, shadow_col='#2E3818', shadow_op=0.42):
    """items : [(x, y du pied, largeur, hauteur)] → ombres portées (vers la gauche, le soleil est à droite),
    silhouettes côté ombre, côtés éclairés, reflets chauds ; un chemin par couleur (léger)."""
    sh, li, hi, casts = [], [], [], []
    for (cx, by, w, h) in items:
        sil, lit, hil = M.clump_shapes(cx, by, w, h, rng)
        eps = 0.02 + 0.012 * w
        sh.append(M.catmull(M.rdp_closed(sil, eps), closed=True))
        li.append(M.catmull(M.rdp_closed(lit, eps), closed=True))
        if cols[2] and w > 2.4:
            hi.append(M.catmull(M.rdp_closed(hil, eps), closed=True))
        if shadow:
            L_ = w * shadow
            casts.append(f'M{M.f1(cx + w * 0.22)} {M.f1(by - 0.15)}c{M.f1(-L_ * 0.35)} {M.f1(-w * 0.06)} {M.f1(-L_ * 0.85)} '
                         f'{M.f1(w * 0.03)} {M.f1(-L_)} {M.f1(w * 0.12)}c{M.f1(L_ * 0.35)} {M.f1(w * 0.13)} {M.f1(L_ * 0.8)} '
                         f'{M.f1(w * 0.11)} {M.f1(L_)} {M.f1(-w * 0.09)}z')
    out = ''
    if casts:
        out += f'<path d="{"".join(casts)}" fill="{shadow_col}" opacity="{shadow_op:g}"/>'
    out += f'<path d="{"".join(sh)}" fill="{cols[0]}"/><path d="{"".join(li)}" fill="{cols[1]}"/>'
    if hi:
        out += f'<path d="{"".join(hi)}" fill="{cols[2]}"/>'
    return out


# ================================================================== 1. le lointain : lueur du couchant, chaîne des Puys
def sky_glow_svg():
    """La lueur du couchant, posée sur le charbon de l'interface : dégradés à opacité, nuls en haut du calque
    (le fond et la lueur CSS de l'écran passent au travers)."""
    gx, gy = B.GLOW
    defs = [
        B.rad('s-a', gx - 20, SC.HORIZON + 10, 440, 150, [(0, '#F2B48C', 0.9), (0.22, '#EDA98A', 0.66), (0.48, '#D39088', 0.36),
                                                          (0.76, '#8E5E63', 0.11), (1, '#6B4450', 0)]),
        B.rad('s-b', gx, gy + 2, 200, 56, [(0, '#FEF3D0', 1), (0.18, '#FBE4AA', 0.92), (0.5, '#F6C58F', 0.45), (1, '#F2B48C', 0)]),
        B.lin('s-c', 0, 110, 0, SC.HORIZON + 6, [(0, '#E7B8AC', 0), (0.5, '#E7B8AC', 0.14), (1, '#F2B48C', 0.4)]),
    ]
    body = [f'<rect x="-20" y="30" width="{VW + 40}" height="{SC.HORIZON + 30 - 30:g}" fill="url(#s-a)"/>',
            f'<rect x="-20" y="110" width="{VW + 40}" height="{SC.HORIZON + 30 - 110:g}" fill="url(#s-c)"/>',
            f'<rect x="{gx - 205:g}" y="{gy + 2 - 60:g}" width="410" height="120" fill="url(#s-b)"/>']
    # banderoles de nuages (art déco) : dessus sombre et transparent, ventre éclairé par le couchant (dégradé), bord doux
    defs.append('<filter color-interpolation-filters="sRGB" id="s-f" x="-5%" y="-60%" width="110%" height="220%"><feGaussianBlur stdDeviation=".45"/></filter>')
    clouds = [(-10, 157, 132, 5.6, '#F2B48C', .8), (30, 164.5, 80, 3.2, '#F4BE92', .65),
              (292, 128, 140, 4.6, '#E7B8AC', .6), (340, 168, 126, 5.0, LIGHT, .88), (392, 177.5, 84, 3.2, '#FCE8B6', .82)]
    for i, (x, y, w, t, rim, o) in enumerate(clouds):
        gid = f's-n{i}'
        defs.append(B.lin(gid, 0, y - t, 0, y + t * 0.2, [(0, '#5E4250', 0), (0.55, '#A87272', o * 0.55), (1, rim, o)]))
        top = (f'M{x:g} {y:g}C{x + w * .08:g} {y - t * .7:g} {x + w * .22:g} {y - t:g} {x + w * .4:g} {y - t * .92:g}'
               f'C{x + w * .62:g} {y - t * .8:g} {x + w * .84:g} {y - t * .35:g} {x + w:g} {y - t * .05:g}')
        bot = f'C{x + w * .7:g} {y + t * .16:g} {x + w * .3:g} {y + t * .2:g} {x:g} {y:g}z'
        body.append(f'<path d="{top}{bot}" fill="url(#{gid})" filter="url(#s-f)"/>')
    return defs, ''.join(body)


def build_lointain():
    """Plan 1 : la lueur du couchant, la crête pâle la plus lointaine, la chaîne des Puys bleu violacé (liseré de
    contre-jour, versants tournés vers le couchant un peu plus clairs), pleine jusqu'en bas du calque."""
    defs, sky = sky_glow_svg()
    haze = exact_below(SC.far_haze_y)
    puys = exact_below(SC.far_puys_y)
    defs += [
        B.lin('l-h', 0, 0, VW, 0, [(0, '#8D87AD'), (0.4, '#A597B6'), (0.62, '#C4A8B4'), (0.74, '#CFB0B2'), (0.88, '#B49FB5'), (1, '#9C92B3')]),
        B.lin('l-p', 0, 0, VW, 0, [(0, '#5D5B87'), (0.22, '#66638E'), (0.55, '#7A7098'), (0.7, '#8C7D9F'), (0.8, '#85789D'), (1, '#6A6591')]),
        B.lin('l-v', 0, 168, 0, SC.HORIZON + 10, [(0, '#FFFFFF', 0.06), (0.5, '#FFFFFF', 0), (1, '#2C2B4A', 0.4)]),
        B.lin('l-r', 0, 0, VW, 0, [(0, '#E7B8AC', 0.35), (0.55, '#F2B48C', 0.8), (0.75, LIGHT, 0.95), (1, '#E7B8AC', 0.5)]),
        f'<clipPath id="l-k"><path d="{puys}"/></clipPath>',
        '<filter color-interpolation-filters="sRGB" id="l-f" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="4.5"/></filter>',
        B.lin('l-m', 0, 186, 0, 226, [(0, '#E8B9A6', 0), (0.45, '#E8B9A6', 0.26), (0.55, '#F2C7A4', 0.4), (0.75, '#E0B2A2', 0.2), (1, '#E0B2A2', 0)]),
    ]
    ridge = M.polyline(M.rdp(B.xs_line(SC.far_puys_y, -16, VW + 16, 0.5), 0.02), prec=2)
    hridge = M.polyline(M.rdp(B.xs_line(SC.far_haze_y, -16, VW + 16, 0.5), 0.02), prec=2)
    shade = []
    for cx, w in ((8, 84), (54, 58), (112, 110), (334, 62), (402, 80), (470, 106)):
        shade.append(f'<ellipse cx="{cx + w * 0.18:g}" cy="{SC.HORIZON - 9:g}" rx="{w * 0.28:g}" ry="15" fill="#BBA6BD" opacity=".24"/>')
    body = (sky + f'<path d="{haze}" fill="url(#l-h)"/>'
            f'<path d="{hridge}" fill="none" stroke="#F4C9A6" stroke-width=".5" opacity=".45"/>'
            f'<path d="{puys}" fill="url(#l-p)"/>'
            f'<g clip-path="url(#l-k)"><g filter="url(#l-f)">{"".join(shade)}</g><path d="{puys}" fill="url(#l-v)"/></g>'
            f'<path d="{ridge}" fill="none" stroke="url(#l-r)" stroke-width=".7"/>'
            f'<rect x="-20" y="186" width="{VW + 40}" height="40" fill="url(#l-m)"/>')
    return svg_doc(defs, body, 'Plan 1 : la lueur du couchant et la chaîne des Puys au loin (généré par tools/puys/paint.py)')


# ================================================================== 2. le puy de Dôme
def rim_svg(width=1.5, glow=5.0):
    """Liseré chaud le long de la crête exacte (côté couchant), à l'intérieur du Dôme : il ne change pas le contour."""
    crest = M.polyline(M.rdp(B.xs_line(SC.dome_y, 118, VW + 12, 0.5), 0.02), prec=2)
    defs = [B.lin('d-r', 118, 0, 470, 0, [(0, LIGHT, 0), (0.2, LIGHT, 0.45), (0.45, '#F7CB93', 0.85), (0.75, '#F2B48C', 0.9), (1, '#E7B8AC', 0.6)]),
            f'<filter color-interpolation-filters="sRGB" id="d-g" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="{glow / 3:g}"/></filter>']
    body = (f'<path d="{crest}" fill="none" stroke="url(#d-r)" stroke-width="{glow:g}" opacity=".3" filter="url(#d-g)"/>'
            f'<path d="{crest}" fill="none" stroke="url(#d-r)" stroke-width="{width:g}"/>')
    return defs, body


def rail_svg():
    """La voie du Panoramique des Dômes : un fil clair qui monte en travers de la face, son talus en ombre dessous ;
    elle sort des bois et passe derrière la crête."""
    rp = B.rail_points()
    d = M.catmull(M.rdp(rp, 0.03), prec=2)
    d2 = M.catmull(M.rdp(rp + [0.2, 0.7], 0.03), prec=2)
    x0, x1 = rp[0, 0], rp[-1, 0]
    defs = [B.lin('d-v1', x0, 0, x1, 0, [(0, '#E6D6A6', 0.5), (0.5, '#EED9A6', 0.9), (1, '#F7D9A0', 0.95)]),
            B.lin('d-v2', x0, 0, x1, 0, [(0, '#1E2710', 0.4), (1, '#1E2710', 0.3)])]
    body = (f'<path d="{d2}" fill="none" stroke="url(#d-v2)" stroke-width="1.05" stroke-linecap="round"/>'
            f'<path d="{d}" fill="none" stroke="url(#d-v1)" stroke-width=".5" stroke-linecap="round"/>')
    return defs, body


def forest_rims_svg(rng):
    """La lumière sur les bois : un liseré fin sur les seules parties de la lisière tournées vers le couchant, puis
    deux rangs de houppiers plus bas (liserés discontinus, plus pâles) qui disent les étages de la forêt sur la
    pente — pas de taches."""
    xs = np.arange(-16, VW + 16, 0.2)
    top = B.forest_edge_y(xs)
    vis = top < SC.plain_top_y(xs) - 0.6
    runs = [r for r in M.lit_runs(np.column_stack([xs, top]), thr=0.25) if vis[int(np.clip((r[0, 0] + 16) / 0.2, 0, len(xs) - 1))]]
    edge = ''.join(M.polyline(M.rdp(r, 0.02), prec=2) for r in runs)
    inner = []
    for off, keep, size in ((6.5, 0.45, 3.8),):
        base_fn = lambda x, off=off: B.forest_top_y(x) + off
        crowns = M.crowns_along(-16, VW + 16, base_fn, size, rng, spacing=(0.7, 1.05))
        t = M.scallop_top(xs, base_fn(xs), crowns)
        ok = (t < SC.plain_top_y(xs) - 1.5)
        for r in M.lit_runs(np.column_stack([xs, t]), thr=0.35):
            i = int(np.clip((r[0, 0] + 16) / 0.2, 0, len(xs) - 1))
            if ok[i] and rng.random() < keep and len(r) > 8:
                inner.append(M.polyline(M.rdp(r, 0.02), prec=2))
    defs = [B.lin('d-cr', 0, 0, VW, 0, [(0, '#5A662C'), (0.35, '#6E7934'), (0.7, '#8E8E46'), (1, '#A0944C')])]
    body = (f'<path d="{"".join(inner)}" fill="none" stroke="url(#d-cr)" stroke-width=".45" stroke-linecap="round" opacity=".32"/>'
            f'<path d="{edge}" fill="none" stroke="url(#d-cr)" stroke-width=".55" stroke-linecap="round"/>')
    return defs, body


def cone_light_svg():
    """Le modelé du cône à l'aérographe : un voile froid sur la face à l'ombre (à gauche d'un terminateur doux qui
    descend du sommet vers la droite), un voile doré sur le versant tourné vers le couchant."""
    term = np.array([[190, 112], [199, 128], [214, 144], [238, 158], [270, 171], [306, 186], [346, 203], [392, 222], [450, 240], [520, 256]])
    shade = M.catmull(term, prec=1) + 'L520 330L-20 330L-20 100Z'
    lit = M.catmull(term, prec=1) + 'L520 100Z'
    defs = ['<filter color-interpolation-filters="sRGB" id="d-s" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="5"/></filter>',
            B.lin('d-sh', 0, 0, 330, 0, [(0, '#1C2616', 0.5), (0.55, '#223018', 0.34), (1, '#2A3418', 0.18)]),
            B.lin('d-li', 200, 0, 470, 0, [(0, LIGHT, 0.1), (0.5, '#F7CB93', 0.22), (1, '#F2B48C', 0.26)])]
    body = f'<path d="{shade}" fill="url(#d-sh)" filter="url(#d-s)"/><path d="{lit}" fill="url(#d-li)" filter="url(#d-s)"/>'
    return defs, body


def train_svg(t=0.62):
    """Le train du Panoramique des Dômes sur sa voie : deux voitures claires, fenêtres allumées (le soir tombe)."""
    rp = B.rail_points()
    i = int(t * (len(rp) - 1))
    p0, p1 = rp[i], rp[min(len(rp) - 1, i + 2)]
    ang = np.degrees(np.arctan2(p1[1] - p0[1], p1[0] - p0[0]))
    x, y = p0
    body = (f'<g transform="translate({M.f1(x, 2)} {M.f1(y, 2)}) rotate({M.f1(ang, 1)})">'
            f'<path d="M-2.9 -1.05h2.7v1.05h-2.7zM.1 -1.05h2.7v1.05h-2.7z" fill="#E8DDC0"/>'
            f'<path d="M-2.9 -.18h5.7v.22h-5.7z" fill="#B0472F"/>'
            f'<path d="M-2.6 -.85h2.1v.38h-2.1zM.4 -.85h2.1v.38h-2.1z" fill="#FFD98A"/>'
            f'</g>')
    return [], body


def build_dome(cone_src, forest_src, cone_p=None, forest_p=None):
    """Plan 2 : le Dôme. Le cône (modelé de la peinture, lissé fort : pas de taches), la forêt du bas des pentes
    (peinture lissée plus finement : houppiers éclairés en grappes) sous une lisière festonnée nette, la voie du
    Panoramique, le liseré du couchant, le sommet. Tout est découpé par le profil relevé."""
    cp = dict(lam=0.02, mode=5, k=16, min_area=40, grad_min=40, soften=0.55, fit_sigma=2.0, eps=0.6, core=2, close=5)
    cp.update(cone_p or {})
    fp = dict(lam=0.014, mode=5, k=9, min_area=60, grad_min=40, soften=0.6, fit_sigma=2.5, eps=0.6, core=1, close=3, open_=5)
    fp.update(forest_p or {})
    visible = M_DOME & ~M_PLAIN
    vzc, cone = vector_plane('c', grade(cone_src, 0.94, 1.0, 1.0), dilate(M_DOME, 4), visible & ~dilate(M_FOREST, 1), **cp)
    forest_region = dilate(M_FOREST & M_DOME, 3)
    vzf, forest = vector_plane('f', grade(forest_src, 0.78, 0.95, 1.0), forest_region, visible & M_FOREST, **fp)
    exact = exact_below(SC.dome_y)
    fedge = exact_below(B.forest_edge_y, step=0.25, eps=0.015)
    rdefs, rim = rim_svg()
    vdefs, rail = rail_svg()
    cdefs, crim = forest_rims_svg(np.random.default_rng(5))
    defs = vzc.defs + vzf.defs + rdefs + vdefs + cdefs + [
        f'<clipPath id="d-k"><path d="{exact}"/></clipPath>',
        f'<clipPath id="d-fk"><path d="{fedge}"/></clipPath>']
    ldefs, light = cone_light_svg()
    defs += ldefs
    mist_top = SC.plain_top_y(np.arange(-16, VW + 17, 2.0)) - 16
    mist = np.vstack([np.column_stack([np.arange(-16, VW + 17, 2.0), mist_top]), [[VW + 16, VH + 6], [-16, VH + 6]]])
    defs += [B.lin('d-m', 0, 192, 0, 216, [(0, '#E9C9A0', 0), (0.6, '#E9C9A0', 0.1), (1, '#F4D6A8', 0.22)])]
    mist_svg = f'<path d="{M.polyline(M.rdp_closed(mist, 0.1), True)}" fill="url(#d-m)"/>'
    tdefs, train = train_svg()
    defs += tdefs
    out = (f'<g clip-path="url(#d-k)">{scaled(cone)}{light}{rail}'
           f'{train}<g clip-path="url(#d-fk)">{scaled(forest)}{crim}</g>{mist_svg}{rim}</g>' + B.summit_svg())
    return svg_doc(defs, out, 'Plan 2 : le puy de Dôme, profil relevé sur photo, au couchant (généré par tools/puys/paint.py)')


# ================================================================== 3. la plaine
def hedgerows(rng):
    """Haies en courbes de niveau : une bande sombre au sommet festonné par les houppiers, un liseré de lumière sur
    les seules parties tournées vers le couchant, une ombre portée vers l'avant ; quelques haies perpendiculaires
    (bouquets alignés qui fuient vers le pied du Dôme)."""
    rows, cross = B.hedge_layout()
    fills, rims, shadows, items = [], [], [], []
    for k, segs in enumerate(rows):
        base_fn = lambda x, k=k: B.hedge_row_y(k, x)
        for (x0, x1) in segs:
            ym = float(base_fn(np.array([(x0 + x1) / 2]))[0])
            dep = B.depth_of(ym)
            size = 1.2 + 3.2 * dep
            crowns = M.crowns_along(x0, x1, base_fn, size, rng, spacing=(0.5, 0.85))
            if not crowns:
                continue
            xs = np.arange(crowns[0][0] - crowns[0][2], crowns[-1][0] + crowns[-1][2], 0.12)
            base = base_fn(xs) + 0.15
            top = M.scallop_top(xs, base, crowns)
            poly = np.vstack([np.column_stack([xs, top]), np.column_stack([xs[::-1], base[::-1]])])
            fills.append(M.polyline(M.rdp_closed(poly, 0.025), True, prec=2))
            if dep > 0.3:                                  # au fond, la haie n'est qu'un trait sombre
                for r in M.lit_runs(np.column_stack([xs, top]), thr=0.3):
                    if len(r) > 5:
                        rims.append(M.polyline(M.rdp(r, 0.02), prec=2))
            sh = 0.35 + 1.1 * dep                          # ombre portée vers l'avant, collée au pied
            shp = np.vstack([np.column_stack([xs, base - 0.2]), np.column_stack([xs[::-1] - sh * 0.8, base[::-1] + sh])])
            shadows.append(M.polyline(M.rdp_closed(shp, 0.04), True))
    for (xb, k) in cross:
        pts = B.cross_points(xb, k)
        L_ = float(np.hypot(*(pts[-1] - pts[0])))
        dep = B.depth_of(float(pts[:, 1].mean()))
        s_ = 1.0 + 2.6 * dep
        n = max(2, int(L_ / (s_ * 0.85)))
        for t in np.linspace(0.08, 0.92, n):
            q = pts[0] + (pts[-1] - pts[0]) * t
            w = s_ * (0.8 + 0.4 * rng.random()) * (0.8 + 0.4 * t)
            items.append((q[0] + rng.normal(0, 0.12), q[1] + 0.2, w, w * (0.85 + 0.3 * rng.random())))
    return fills, rims, shadows, items


def groves(rng):
    """Bosquets et arbres isolés, posés à la main (pas semés au hasard) : près du chemin, sur les côtés ; au fond
    de la plaine, pas de points isolés (ils ne liraient que comme des taches)."""
    spots = [(34, 228.5, 4), (120, 234, 3), (296, 230, 3), (352, 239, 3), (446, 235, 4), (12, 245, 3), (420, 248, 3),
             (86, 241, 2), (385, 229, 2)]
    items = []
    for (x, y, n) in spots:
        depth = B.depth_of(y)
        s_ = 2.0 + 4.6 * depth
        for i in range(n):
            dx = (i - (n - 1) / 2) * s_ * 0.8 + rng.normal(0, s_ * 0.15)
            w = s_ * (0.8 + 0.45 * rng.random())
            items.append((x + dx, y + rng.normal(0, 0.3), w, w * (1.0 + 0.35 * rng.random())))
    for x in (98, 186, 262, 330, 372, 408, 458, 58):          # arbres seuls, dans la moitié proche des prés
        y = float(B.hedge_row_y(int(rng.integers(2, 5)), np.array([x]))[0]) + rng.uniform(1.2, 3.5)
        s_ = 1.8 + 4.2 * B.depth_of(y)
        items.append((x, y, s_, s_ * 1.15))
    return items


def patchwork(rng):
    """Le bocage : des parcelles aux couleurs voisines (vert pomme, sauge, foin doré, olive), posées sur les prés
    peints ; une parcelle ne prend jamais la couleur de sa voisine."""
    fields, _, _ = B.fields_layout()
    pal = ['#AFC98A', '#9DB77E', '#8FA676', '#B9B67E', '#7F9360', '#A3BF83', '#B2B478']
    out, prev = [], None
    for (k, a, b) in fields:
        def top_x(xb):
            x = xb
            for _ in range(2):
                y = float(B.band_edge_y(k, np.array([x]))[0])
                x = B.cut_x_at(xb, k + 1, y)
            return x
        ta, tb = top_x(a), top_x(b)
        xt = np.linspace(ta, tb, max(3, int(abs(tb - ta) / 2.5)))
        xbt = np.linspace(b, a, max(3, int(abs(b - a) / 2.5)))
        poly = np.vstack([np.column_stack([xt, B.band_edge_y(k, xt)]), np.column_stack([xbt, B.band_edge_y(k + 1, xbt)])])
        choices = [c for c in pal if c != prev]
        c = choices[int(rng.integers(len(choices)))]
        prev = c
        out.append(f'<path d="{M.polyline(M.rdp_closed(poly, 0.04), True)}" fill="{c}"/>')
    return f'<g opacity=".72">{"".join(out)}</g>'


def farm_life_svg():
    """La vie de la plaine, sur les côtés visibles au téléphone : un buron au bord du chemin (une fenêtre encore
    allumée, un filet de fumée) et deux vaches Salers qui paissent (robe acajou, cornes en lyre, liseré du couchant)."""
    out = []
    w, g, r, d, win, ch = M.buron(101.0, 236.6, 0.95)
    poly = lambda P: M.polyline(np.round(P, 2), True, prec=2)
    out.append(f'<path d="M{M.f1(96.5, 2)} {M.f1(236.7, 2)}c-3 .3-7 1.2-10 2.2c3.5.3 8.2-.6 10-1.3z" fill="#26301A" opacity=".35"/>')
    out.append(f'<path d="{poly(w)}" fill="#5F5B4B"/><path d="{poly(g)}" fill="#8E8062"/>'
               f'<path d="{poly(r)}" fill="#3A3C40"/><path d="{poly(ch)}" fill="#3A3C40"/>'
               f'<path d="{poly(d)}" fill="#2B2A26"/><path d="{poly(win)}" fill="#FFD98A"/>')
    cx, cy = ch[1]
    out.append(f'<path d="M{M.f1(cx + 0.3, 2)} {M.f1(cy, 2)}c-.6-1.2.9-1.9.2-3.1s.8-2 .1-3.2" fill="none" stroke="#C9B9A6" '
               f'stroke-width=".35" stroke-linecap="round" opacity=".45"/>')
    for (x, y, sc, face) in ((375.0, 247.6, 0.82, -1), (391.0, 246.6, 0.74, 1)):
        body, head, tail, horns, back = M.salers(x, y, sc, facing=face)
        out.append(f'<ellipse cx="{M.f1(x - 1.2, 2)}" cy="{M.f1(y + 0.1, 2)}" rx="{M.f1(4.2 * sc * 1.6, 2)}" ry="{M.f1(0.45, 2)}" fill="#26301A" opacity=".35"/>')
        out.append(f'<path d="{poly(body)}{poly(head)}{poly(tail)}" fill="#3E1A10"/>')
        out.append(f'<path d="{poly(horns)}" fill="#D9CCAE"/>')
        out.append(f'<path d="{M.polyline(np.round(back, 2), prec=2)}" fill="none" stroke="#C8663A" stroke-width=".5" stroke-linecap="round" opacity=".9"/>')
    return ''.join(out)


def path_svg():
    pp = B.path_points()
    rib = B.path_ribbon(pp)
    edge = B.path_ribbon(pp + [0.45, 0.55], 1.6, 0.25)
    return (f'<path d="{M.polyline(M.rdp_closed(edge, 0.03), True)}" fill="#4A5530" opacity=".45"/>'
            f'<path d="{M.polyline(M.rdp_closed(rib, 0.03), True)}" fill="url(#p-c)"/>')


def build_plaine(src, params=None):
    """Plan 3 : la plaine au pied du Dôme. Prés peints (lissés en grandes plages, éteints par le soir), parcelles
    nuancées, haies en courbes de niveau, bosquets et arbres avec leur ombre du soir, le chemin."""
    p = dict(lam=0.06, mode=8, k=8, min_area=80, grad_min=40, soften=0.8, fit_sigma=4.0, eps=0.6, core=3, blur_x=2.5, close=17)
    p.update(params or {})
    rng = np.random.default_rng(23)
    vz, body = vector_plane('p', src, dilate(M_PLAIN, 3), M_PLAIN & ~M_FRONT, **p)
    exact = exact_below(SC.plain_top_y)
    fills, rims, shadows, items = hedgerows(rng)
    items += groves(rng)
    items.sort(key=lambda t: t[1])
    defs = vz.defs + [f'<clipPath id="p-k"><path d="{exact}"/></clipPath>',
                      B.lin('p-c', 0, 214, 0, 300, [(0, '#E4D4A2'), (1, '#C9BB8A')]),
                      B.lin('p-w', 0, 0, VW, 0, [(0, '#4E5A7A', 0.14), (0.45, '#FFFFFF', 0), (0.78, LIGHT, 0.08), (1, '#F2B48C', 0.16)]),
                      B.lin('p-s', 0, 212, 0, 262, [(0, LIGHT, 0.12), (0.22, '#FFFFFF', 0), (1, '#1F2810', 0.58)]),
                      B.lin('p-h', 0, 0, VW, 0, [(0, '#2A3413'), (1, '#343C17')]),
                      B.lin('p-r', 0, 0, VW, 0, [(0, '#5E6C2E'), (0.6, '#7C8840'), (1, '#A09A50')])]
    out = (f'<g clip-path="url(#p-k)">{scaled(body)}{patchwork(rng)}'
           f'<rect x="-10" y="200" width="{VW + 20}" height="{VH - 190}" fill="url(#p-w)"/>'
           f'<rect x="-10" y="200" width="{VW + 20}" height="{VH - 190}" fill="url(#p-s)"/>'
           f'{path_svg()}'
           f'<path d="{"".join(shadows)}" fill="#26301A" opacity=".28"/>'
           f'<path d="{"".join(fills)}" fill="url(#p-h)"/>'
           f'<path d="{"".join(rims)}" fill="none" stroke="url(#p-r)" stroke-width=".42" stroke-linecap="round"/>'
           f'{trees_svg(items, ("#2F3A15", "#56642A", "#7F8A40"), rng, shadow=2.3)}{farm_life_svg()}</g>')
    return svg_doc(defs, out, 'Plan 3 : la plaine au pied du Dôme, prés, haies, arbres, le chemin (généré par tools/puys/paint.py)')


# ================================================================== 4. le premier plan
def build_premier():
    """Plan 4 : le talus sombre du premier plan (olive presque noir), herbes hautes dont les pointes prennent la
    lumière du couchant, buissons et sapins aux deux bords."""
    rng = np.random.default_rng(41)
    top = SC.front_top_y
    exact = exact_below(top)
    tufts, lit_tufts = [], []
    for x in np.arange(-10, VW + 12, 2.3):
        x += rng.normal(0, 0.6)
        y = float(top(np.array([x]))[0]) + 1.4
        tufts.append(M.grass_tuft(x, y, 2.6 + 4.2 * rng.random(), rng))
    for x in np.arange(-6, VW + 8, 5.3):
        x += rng.normal(0, 1.2)
        y = float(top(np.array([x]))[0]) + 1.0
        lit_tufts.append(M.grass_tuft(x, y, 2.0 + 2.6 * rng.random(), rng, n=2))
    bushes = []
    for x in (6, 22, 36, 404, 420, 440, 458, 474):
        y = float(top(np.array([x]))[0]) + 3.2
        bushes.append((x + rng.normal(0, 1.5), y, 10 + 6 * rng.random(), 8 + 6 * rng.random()))
    firs, firs_lit = [], []
    for (x, hh) in ((-4, 44), (9, 33), (22, 24), (459, 30), (470, 42), (484, 52)):
        y = float(top(np.array([x]))[0]) + 4
        sil, lit = M.conifer(x, y, hh, hh * 0.34, rng)
        firs.append(M.polyline(M.rdp_closed(sil, 0.03), True))
        firs_lit.append(M.polyline(M.rdp_closed(lit, 0.03), True))
    defs = [B.lin('f-v', 0, 236, 0, 320, [(0, '#2B3315'), (0.3, '#1B210E'), (1, '#11150A')]),
            B.lin('f-r', 0, 0, VW, 0, [(0, '#F2B48C', 0), (0.55, '#F2B48C', 0.18), (1, LIGHT, 0.4)])]
    out = (f'<path d="{exact}" fill="url(#f-v)"/>'
           f'<path d="{"".join(tufts)}" fill="#1D2410"/>'
           f'<path d="{"".join(lit_tufts)}" fill="url(#f-r)"/>'
           f'{trees_svg(bushes, ("#141A0A", "#232B12", "#303A18"), rng)}'
           f'<path d="{"".join(firs)}" fill="#10140A"/><path d="{"".join(firs_lit)}" fill="#1E2511"/>')
    return svg_doc(defs, out, 'Plan 4 : le premier plan, talus sombre, herbes, buissons, sapins (généré par tools/puys/paint.py)')


# ================================================================== assemblage
RECIPE = os.path.join(HERE, 'peinture.json')


def sources():
    """Les peintures retenues pour chaque zone (tools/puys/peinture.json) ; à défaut, la maquette."""
    if os.path.exists(RECIPE):
        R = json.load(open(RECIPE, encoding='utf-8'))
        get = lambda k: load_painting(os.path.join(HERE, R[k]['file']))
        return {k: get(k) for k in ('cone', 'forest', 'plain')}, R
    base = load_painting(os.path.join(GEN, 'base.png'))
    return {'cone': base, 'forest': base, 'plain': base}, {}


def main():
    out = OUT
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    os.makedirs(out, exist_ok=True)
    S, R = sources()
    t0 = time.time()
    plain_src = grade(S['plain'], **R.get('plain', {}).get('grade', {}))
    docs = {
        'lointain': build_lointain(),
        'dome': build_dome(S['cone'], S['forest'], cone_p=R.get('cone', {}).get('params'), forest_p=R.get('forest', {}).get('params')),
        'plaine': build_plaine(plain_src),
        'premier': build_premier(),
    }
    total = 0
    for name, svg in docs.items():
        p = os.path.join(out, name + '.svg')
        open(p, 'w', encoding='utf-8').write(svg)
        n = len(svg.encode('utf-8'))
        total += n
        print(f'  {name}.svg  {n / 1024:.1f} Ko', flush=True)
    print(f'total {total / 1024:.0f} Ko ({time.time() - t0:.0f} s)')


if __name__ == '__main__':
    main()
