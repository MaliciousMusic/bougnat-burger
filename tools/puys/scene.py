# -*- coding: utf-8 -*-
"""La scène de l'ouverture : géométrie commune à toute la chaîne (maquette, peinture SDXL, calques, détails).

Repère : le viewBox des calques, 480 × 320 (unités « u »). Toutes les lignes sont des fonctions y(x) ou des
polylignes dans ce repère ; les masques se rastérisent à n'importe quelle échelle K (pixels par unité).

Le puy de Dôme suit EXACTEMENT le profil relevé sur photo (tools/puys/puy-de-dome.json), à l'échelle S sans
déformation : un point photo (px, py) va en (SX + (px − 259)·S, SY + (py − y_sommet)·S). Au-delà de px = 494,
le relevé saute sur une crête lointaine de la photo : on l'ignore, et le flanc droit est prolongé dans sa pente
(cette partie plonge derrière la plaine, elle ne se voit pas).

Les voisins (la Vache égueulée, Lassolas, Laschamps, le Petit Puy de Dôme, Pariou et son cratère, Côme,
Louchadière) reprennent les profils simplifiés de build.py, en plus lointain (bleu violacé)."""
import json
import math
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
VW, VH = 480, 320

# ---------------------------------------------------------------- le profil relevé (pixels de la photo 612 × 340)
_D = json.loads((HERE / 'puy-de-dome.json').read_text(encoding='utf-8'))
PSW, PSH = _D['source_w'], _D['source_h']
PROF = np.array([(x * (PSW - 1), y * PSH) for x, y in _D['profile']], np.float64)
PX_END = 494.0                       # fin du relevé utile (au-delà : la chaîne lointaine de la photo)
SUMMIT_PX = 259.0                    # le sommet (pied de l'antenne)
SUMMIT_PY = float(np.interp(SUMMIT_PX, PROF[:, 0], PROF[:, 1]))
ANT_TOP_PY = 85.0                    # haut du mât (relevé à la main : trop fin pour le relevé automatique)

# ---------------------------------------------------------------- placement du Dôme dans la scène
S = 1.06                             # échelle photo → scène (identique en x et en y : proportions gardées)
SX, SY = 196.0, 119.0                # le sommet dans la scène


def photo_to_scene(px, py):
    return SX + (np.asarray(px, np.float64) - SUMMIT_PX) * S, SY + (np.asarray(py, np.float64) - SUMMIT_PY) * S


def scene_to_px(x):
    return SUMMIT_PX + (np.asarray(x, np.float64) - SX) / S


# pente du flanc droit au bout du relevé (photo), pour le prolonger sans cassure
_tail = PROF[(PROF[:, 0] >= PX_END - 40) & (PROF[:, 0] <= PX_END)]
_SLOPE_END = float(np.polyfit(_tail[:, 0], _tail[:, 1], 1)[0])
_Y_END = float(np.interp(PX_END, PROF[:, 0], PROF[:, 1]))


def dome_py(px):
    """Crête du Dôme en coordonnées photo (py pour px), prolongée à droite au-delà du relevé."""
    px = np.asarray(px, np.float64)
    py = np.interp(px, PROF[:, 0], PROF[:, 1])
    ext = px > PX_END
    d = px[ext] - PX_END
    # le flanc garde sa pente puis s'adoucit (pied du volcan) : il plonge derrière la plaine
    py[ext] = _Y_END + _SLOPE_END * d * np.exp(-d / 260.0)
    left = px < 0
    py[left] = PROF[0, 1] + 0.30 * (-px[left])   # à gauche du relevé : l'épaule continue de descendre
    return py


def dome_y(x):
    """Crête du Dôme dans la scène : y(x)."""
    x = np.asarray(x, np.float64)
    return SY + (dome_py(scene_to_px(x)) - SUMMIT_PY) * S


def dome_outline(step=0.5, x0=-12.0, x1=VW + 12.0):
    """Polyligne de la crête (scène), directement issue du relevé : c'est elle qui sert au contrôle de calque."""
    xs = np.arange(x0, x1 + step / 2, step)
    return np.column_stack([xs, dome_y(xs)])


SUMMIT = (SX, SY)
ANT_TOP = (SX, SY - (SUMMIT_PY - ANT_TOP_PY) * S)
# le relevé est un peu arrondi au sommet par le lissage : le pied du mât est posé sur la crête réelle
ANT_FOOT_Y = float(dome_y(np.array([SX]))[0])


# ---------------------------------------------------------------- outils de profils
def bump(xs, cx, w, h, flat=0.0, power=1.6):
    """Un puy arrondi : cloche en cosinus, sommet éventuellement aplati."""
    u = np.clip(np.abs(xs - cx) / (w / 2), 0, 1)
    return h * np.cos(u * math.pi / 2) ** (power - flat)


def cone(xs, cx, w, h, top=0.18, soft=0.5):
    """Un cône de scories : flancs droits, épaules arrondies, pied évasé."""
    u = np.abs(xs - cx) / (w / 2)
    lin = np.clip(1 - (u - top) / (1 - top), 0, 1)
    v = np.where(u < top, 1.0, lin)
    # arrondi du sommet et évasement du pied
    v = v - soft * 0.12 * np.exp(-((u - top) / 0.18) ** 2)
    v = np.clip(v, 0, None) ** 1.25
    return h * v


def crater(xs, cx, w, h, depth, width, skew=0.0, top=0.22):
    """Un cône à cratère (Pariou), ou égueulé si skew ≠ 0 (la Vache)."""
    base = cone(xs, cx, w, h, top=top)
    dip = depth * np.exp(-((xs - cx - skew * width) / (width / 2)) ** 2)
    return np.clip(base - dip, 0, None)


def smooth1d(v, sigma):
    if sigma <= 0:
        return v
    r = int(3 * sigma) + 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    p = np.concatenate([np.full(r, v[0]), v, np.full(r, v[-1])])
    return np.convolve(p, k, mode='valid')


# ---------------------------------------------------------------- les plans (y en fonction de x, scène)
HORIZON = 207.0                      # niveau du plateau des Dômes au pied de la chaîne


def far_haze_y(x):
    """Le plus lointain : une longue crête basse et pâle (les monts Dore, très loin)."""
    x = np.asarray(x, np.float64)
    h = (5.5 + 2.2 * np.sin(x / 41.0 + 0.7) + 1.4 * np.sin(x / 17.0 + 2.1) + 0.8 * np.sin(x / 7.3))
    h = np.maximum(h, bump(x, 300, 150, 12.0))
    h = np.maximum(h, bump(x, 395, 120, 10.0))
    return HORIZON - 2.0 - h


def puy(xs, cx, w, h, plateau=0.0, dip=0.0, dip_w=0.0, skew=0.0):
    """Un puy de la chaîne : cloche douce (pas de pic), sommet éventuellement tronqué (plateau, en fraction de la
    largeur), cratère en creux doux (dip, dip_w) ou égueulé (skew : le creux glisse vers un bord)."""
    u = np.abs(np.asarray(xs, np.float64) - cx) / (w / 2)
    p = plateau
    v = np.where(u <= p, 1.0, np.cos(np.clip((u - p) / (1 - p), 0, 1) * math.pi / 2) ** 1.35) if p < 1 else np.ones_like(u)
    y = h * v
    if dip > 0:
        y -= dip * np.exp(-((np.asarray(xs) - cx - skew * dip_w) / (dip_w / 2)) ** 2)
    return np.clip(y, 0, None)


def far_puys_y(x):
    """La chaîne des Puys derrière le Dôme (bleu violacé), des cloches douces et basses : à gauche la Vache
    égueulée, Lassolas, Laschamps ; à droite le Petit Puy de Dôme (le Nid de la Poule), Pariou et son cratère,
    Côme, Louchadière."""
    x = np.asarray(x, np.float64)
    h = 3.0 + 1.0 * np.sin(x / 23.0) + 0.6 * np.sin(x / 7.3 + 1)          # le plateau
    h = np.maximum(h, puy(x, 8, 84, 25.0, 0.12, 5.0, 16, skew=0.8))          # la Vache, égueulée
    h = np.maximum(h, puy(x, 54, 58, 19.0, 0.1, 3.0, 12, skew=-0.7))         # Lassolas
    h = np.maximum(h, puy(x, 112, 110, 30.0, 0.18))                          # Laschamps (derrière l'épaule)
    h = np.maximum(h, puy(x, 334, 62, 22.0, 0.22, 1.6, 12))                  # Petit Puy de Dôme (Nid de la Poule)
    h = np.maximum(h, puy(x, 402, 80, 29.0, 0.2, 3.2, 17))                   # Pariou et son cratère
    h = np.maximum(h, puy(x, 470, 106, 31.0, 0.12))                          # Côme
    h = np.maximum(h, puy(x, 538, 64, 21.0, 0.1))                            # Louchadière
    return HORIZON - h


def plain_top_y(x):
    """Le haut de la plaine (lisière devant le pied du Dôme) : une ligne douce, presque horizontale."""
    x = np.asarray(x, np.float64)
    return 213.0 - 3.2 * np.sin(x / 61.0 + 0.4) - 1.6 * np.sin(x / 23.0 + 1.9) + 0.012 * (x - 240)


def front_top_y(x):
    """Le premier plan (talus sombre) : plus haut aux deux bords, creusé au milieu (le chemin y descend)."""
    x = np.asarray(x, np.float64)
    u = (x - 236.0) / 240.0
    return 262.0 - 22.0 * u ** 2 - 3.0 * np.sin(x / 19.0 + 0.5) - 1.8 * np.sin(x / 8.1 + 1.3)


# ---------------------------------------------------------------- rastérisation
def grid(K, pad=0):
    """Coordonnées scène des centres de pixels pour une toile de (VW·K) × (VH·K) (+ marge pad en unités)."""
    W, H = int(round((VW + 2 * pad) * K)), int(round((VH + 2 * pad) * K))
    xs = (np.arange(W) + 0.5) / K - pad
    ys = (np.arange(H) + 0.5) / K - pad
    return xs, ys


def below(fn, K, pad=0, aa=True):
    """Masque (flottant 0..1, anti-crénelé) des pixels sous la ligne y = fn(x)."""
    xs, ys = grid(K, pad)
    top = fn(xs)[None, :]
    d = (ys[:, None] - top) * K          # distance verticale en pixels
    if aa:
        return np.clip(d + 0.5, 0, 1).astype(np.float32)
    return (d >= 0).astype(np.float32)


if __name__ == '__main__':
    print(f'sommet {SUMMIT}, pied du mât {ANT_FOOT_Y:.2f}, haut du mât {ANT_TOP}, pente du flanc {_SLOPE_END:.3f}')
    for x in (0, 45, 100, 150, 196, 250, 300, 350, 400, 435, 480):
        print(f'x={x:3d}  dôme {float(dome_y(np.array([x]))[0]):6.1f}  puys {float(far_puys_y(np.array([x]))[0]):6.1f}'
              f'  plaine {float(plain_top_y(np.array([x]))[0]):6.1f}  premier {float(front_top_y(np.array([x]))[0]):6.1f}')
