# -*- coding: utf-8 -*-
"""Motifs vectoriels nets du paysage (repère de la scène 480 × 320) : chemins lissés, bouquets d'arbres (côté
lumière / côté ombre, jamais des pastilles rondes alignées), sapins, touffes d'herbe, ombres portées.
La lumière vient de la droite (le couchant) : les bouquets sont éclairés en haut à droite, leurs ombres filent
vers la gauche."""
import math

import numpy as np


def f1(v, prec=1):
    s = f'{v:.{prec}f}'
    if '.' in s:
        s = s.rstrip('0').rstrip('.')
    if s in ('-0', ''):
        s = '0'
    if s.startswith('0.') and len(s) > 2:
        s = s[1:]
    elif s.startswith('-0.') and len(s) > 3:
        s = '-' + s[2:]
    return s


def nums(vals, prec=1):
    out, prev = [], ''
    for v in vals:
        s = f1(v, prec)
        if out and not (s[0] == '-' or (s[0] == '.' and '.' in prev)):
            out.append(' ')
        out.append(s)
        prev = s
    return ''.join(out)


def catmull(pts, closed=False, prec=1):
    """Polyligne → courbe de Catmull-Rom (Bézier cubiques), coordonnées relatives compactes."""
    P = np.asarray(pts, np.float64)
    n = len(P)
    q = 10 ** prec
    rnd = lambda p: np.round(np.asarray(p) * q) / q
    cur = rnd(P[0])
    d = ['M' + nums([cur[0], cur[1]], prec)]
    vals = []
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        p0 = P[i - 1] if (i > 0 or closed) else P[i]
        p1, p2 = P[i], P[(i + 1) % n]
        p3 = P[(i + 2) % n] if (i + 2 < n or closed) else p2
        c1, c2 = rnd(p1 + (p2 - p0) / 6.0), rnd(p2 - (p3 - p1) / 6.0)
        e = rnd(p2)
        vals += [c1[0] - cur[0], c1[1] - cur[1], c2[0] - cur[0], c2[1] - cur[1], e[0] - cur[0], e[1] - cur[1]]
        cur = e
    d.append('c' + nums(vals, prec))
    if closed:
        d.append('z')
    return ''.join(d)


def polyline(pts, closed=False, prec=1):
    P = np.round(np.asarray(pts, np.float64) * 10 ** prec) / 10 ** prec
    d = 'M' + nums(P[0], prec) + 'l' + nums((P[1:] - P[:-1]).ravel(), prec)
    return d + ('z' if closed else '')


def rdp(pts, eps):
    """Simplification de Ramer–Douglas–Peucker (polyligne ouverte)."""
    pts = np.asarray(pts, float)
    if len(pts) < 3:
        return pts
    keep = np.zeros(len(pts), bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        ab = pts[b] - pts[a]
        nrm = math.hypot(*ab) or 1.0
        rel = pts[a + 1:b] - pts[a]
        dist = np.abs(ab[0] * rel[:, 1] - ab[1] * rel[:, 0]) / nrm
        i = int(np.argmax(dist))
        if dist[i] > eps:
            m = a + 1 + i
            keep[m] = True
            stack += [(a, m), (m, b)]
    return pts[keep]


def rdp_closed(pts, eps):
    """RDP pour un contour fermé : coupé en deux au point le plus éloigné du premier (sinon, quand le premier et le
    dernier point se confondent, la corde est nulle et tout le contour s'effondre)."""
    P = np.asarray(pts, float)
    if len(P) < 4:
        return P
    j = int(np.argmax(np.hypot(P[:, 0] - P[0, 0], P[:, 1] - P[0, 1])))
    if j == 0:
        return P
    a = rdp(P[:j + 1], eps)
    b = rdp(np.vstack([P[j:], P[:1]]), eps)
    return np.vstack([a[:-1], b[:-1]])


# ---------------------------------------------------------------- bouquets d'arbres
def _union_radius(lobes, cx, cy, th):
    """Rayon (depuis cx, cy) de l'union de disques le long des rayons d'angle th (forme étoilée)."""
    r = np.zeros_like(th)
    dx, dy = np.cos(th), np.sin(th)
    for (lx, ly, lr) in lobes:
        ox, oy = lx - cx, ly - cy
        b = ox * dx + oy * dy
        c = ox * ox + oy * oy - lr * lr
        disc = b * b - c
        t = np.where(disc >= 0, b + np.sqrt(np.clip(disc, 0, None)), 0)
        r = np.maximum(r, t)
    return r


def clump_shapes(cx, base_y, w, h, rng, n_lobes=None, flat=0.35, light=(0.9, -1.0), n_th=44):
    """Un bouquet d'arbres (houppiers feuillus) : silhouette irrégulière à lobes, bas un peu aplati.
    Renvoie (silhouette, côté éclairé, reflet) en polygones (scène). light : direction de la lumière."""
    n = n_lobes or int(rng.integers(3, 6))
    cy = base_y - h * 0.48
    lobes = []
    for i in range(n):
        t = (i + 0.5) / n - 0.5
        lx = cx + t * w * 0.72 + rng.normal(0, w * 0.05)
        top = 1 - (2 * abs(t)) ** 1.6 * 0.55
        lr = (0.26 + 0.12 * rng.random()) * w * (0.8 + 0.35 * top)
        ly = base_y - h * (0.30 + 0.34 * top) + rng.normal(0, h * 0.04)
        lobes.append((lx, ly, lr))
    lobes.append((cx, base_y - h * 0.30, w * 0.36))              # le cœur du houppier
    th = np.linspace(-math.pi, math.pi, n_th, endpoint=False)
    r = _union_radius(lobes, cx, cy, th)
    pts = np.column_stack([cx + r * np.cos(th), cy + r * np.sin(th)])
    # bas aplati (le houppier repose sur l'ombre du sous-bois)
    floor = base_y - h * 0.02
    pts[:, 1] = np.where(pts[:, 1] > floor, floor + (pts[:, 1] - floor) * flat, pts[:, 1])
    # côté éclairé : les lobes rétrécis et poussés vers la lumière, gardés dans la silhouette
    lx_, ly_ = light
    nrm = math.hypot(lx_, ly_)
    ux, uy = lx_ / nrm, ly_ / nrm
    lit_lobes = [(x + ux * rr * 0.34, y + uy * rr * 0.34, rr * 0.70) for (x, y, rr) in lobes[:-1]]
    rl = np.minimum(_union_radius(lit_lobes, cx, cy, th), r * 0.985)
    lit = np.column_stack([cx + rl * np.cos(th), cy + rl * np.sin(th)])
    lit[:, 1] = np.minimum(lit[:, 1], pts[:, 1])
    hi_lobes = [(x + ux * rr * 0.55, y + uy * rr * 0.55, rr * 0.36) for (x, y, rr) in lit_lobes]
    rh = np.minimum(_union_radius(hi_lobes, cx, cy, th), rl * 0.97)
    hi = np.column_stack([cx + rh * np.cos(th), cy + rh * np.sin(th)])
    return pts, lit, hi


def _keep_nonempty(pts, cx, cy, min_r=0.15):
    r = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
    return pts if r.max() > min_r else None


def conifer(cx, base_y, h, w, rng, tiers=None):
    """Un sapin stylisé : flèche étroite à étages légèrement dentelés. Renvoie (silhouette, côté éclairé)."""
    n = tiers or int(rng.integers(4, 7))
    left, right = [], []
    for i in range(n + 1):
        t = i / n
        y = base_y - h * t
        half = w / 2 * (1 - t) ** 0.95
        # chaque étage : une pointe de branche puis un retrait
        left.append((cx - half, y))
        right.append((cx + half, y))
        if i < n:
            yn = y - h / n * 0.45
            left.append((cx - half * 0.55, yn))
            right.append((cx + half * 0.55, yn))
    top = (cx + rng.normal(0, w * 0.02), base_y - h * 1.04)
    sil = [(cx - w * 0.07, base_y + h * 0.05)] + left + [top] + right[::-1] + [(cx + w * 0.07, base_y + h * 0.05)]
    sil = np.array(sil)
    # côté éclairé : la moitié droite, rentrée d'une fraction
    lit = [(cx + w * 0.02, base_y)] + [(cx + (x - cx) * 0.86, y + 0.2) for (x, y) in right] + [top]
    return sil, np.array(lit)


def grass_tuft(x, y, h, rng, n=None):
    """Une touffe d'herbe : quelques brins effilés (chemins fermés en fuseau)."""
    n = n or int(rng.integers(3, 6))
    d = []
    for i in range(n):
        lean = rng.normal(0, 0.35) + (i - (n - 1) / 2) * 0.22
        hh = h * (0.55 + 0.45 * rng.random())
        bx = x + (i - (n - 1) / 2) * h * 0.08
        tx, ty = bx + lean * hh, y - hh
        wb = 0.22 + 0.12 * rng.random()
        cx1, cy1 = bx + lean * hh * 0.3, y - hh * 0.55
        d.append(f'M{f1(bx - wb)} {f1(y)}Q{f1(cx1 - wb * 0.5)} {f1(cy1)} {f1(tx)} {f1(ty)}'
                 f'Q{f1(cx1 + wb * 0.5)} {f1(cy1)} {f1(bx + wb)} {f1(y)}Z')
    return ''.join(d)


# ---------------------------------------------------------------- lisières festonnées et liserés de lumière
def crowns_along(x0, x1, base_fn, size, rng, spacing=(0.55, 0.95), jitter=0.25, rmin=0.7, rmax=1.3):
    """Houppiers le long d'une ligne de pied : [(cx, cy, r)] (cy = centre du cercle, posé sur la ligne)."""
    out = []
    x = x0 + rng.uniform(0, size * 0.5)
    while x < x1:
        r = size / 2 * rng.uniform(rmin, rmax)
        by = float(base_fn(np.array([x]))[0])
        out.append((x, by - r * (0.55 + jitter * rng.random()), r))
        x += 2 * r * rng.uniform(*spacing)
    return out


def scallop_top(xs, base, crowns):
    """Ligne haute d'une lisière : le plus haut des arcs de houppiers, jamais sous la ligne de pied."""
    y = base.copy()
    for (cx, cy, r) in crowns:
        m = np.abs(xs - cx) < r
        if m.any():
            y[m] = np.minimum(y[m], cy - np.sqrt(r * r - (xs[m] - cx) ** 2))
    return y


def lit_runs(pts, light=(0.78, -0.62), thr=0.3, min_len=2):
    """Parties d'une ligne haute (parcourue de gauche à droite) tournées vers la lumière : liste de polylignes."""
    P = np.asarray(pts, np.float64)
    d = np.diff(P, axis=0)
    n = np.column_stack([d[:, 1], -d[:, 0]])
    n /= np.hypot(n[:, 0], n[:, 1])[:, None] + 1e-9
    face = n @ np.array(light) / np.hypot(*light) > thr
    runs, cur = [], []
    for i, f in enumerate(face):
        if f:
            if not cur:
                cur = [P[i]]
            cur.append(P[i + 1])
        elif cur:
            if len(cur) >= min_len:
                runs.append(np.array(cur))
            cur = []
    if cur and len(cur) >= min_len:
        runs.append(np.array(cur))
    return runs


# ---------------------------------------------------------------- vaches Salers et buron
def salers(x, y, s=1.0, facing=-1, grazing=True):
    """Une vache Salers (robe acajou, cornes en lyre), en silhouette : (corps, liseré du dos, cornes).
    (x, y) = sabots, au sol ; s = longueur / 10 ; facing = -1 tête à gauche."""
    body = [(2.2, 1.7), (3.0, 1.35), (5.5, 1.5), (8.2, 1.3), (9.3, 1.7), (9.6, 2.6), (9.4, 4.2), (8.9, 4.5),
            (8.7, 6.6), (8.25, 6.6), (8.1, 4.8), (7.6, 4.8), (7.45, 6.6), (7.0, 6.6), (6.9, 4.7), (4.2, 4.8),
            (4.05, 6.6), (3.6, 6.6), (3.45, 4.8), (3.0, 4.75), (2.85, 6.6), (2.4, 6.6), (2.2, 4.4), (1.9, 3.6)]
    head = [(1.9, 3.0), (0.9, 4.4), (0.2, 5.7), (0.25, 6.2), (0.9, 6.25), (1.6, 5.2), (2.4, 3.9)] if grazing else \
           [(2.1, 2.2), (1.2, 1.4), (0.2, 1.9), (0.1, 2.6), (0.9, 3.3), (2.2, 3.6)]
    tail = [(9.45, 1.9), (9.95, 3.4), (10.05, 5.2), (9.8, 5.4), (9.7, 3.6), (9.3, 2.4)]
    horns = [(1.2, 4.35), (0.9, 3.7), (1.35, 3.35), (1.3, 3.75), (1.55, 4.1)] if grazing else \
            [(0.9, 1.5), (0.6, 0.7), (1.05, 0.35), (1.0, 0.8), (1.25, 1.35)]
    back = [(2.4, 1.6), (3.0, 1.4), (5.5, 1.55), (8.2, 1.35), (9.2, 1.75)]

    def tr(pts):
        P = np.asarray(pts, np.float64)
        X = P[:, 0] if facing < 0 else 10.0 - P[:, 0]
        return np.column_stack([x + (X - 5.0) * s, y + (P[:, 1] - 6.6) * s])
    return tr(body), tr(head), tr(tail), tr(horns), tr(back)


def buron(x, y, s=1.0):
    """Un buron (petite ferme de pierre au toit de lauzes) : (murs, pignon éclairé, toit, porte, fenêtre, cheminée).
    (x, y) = milieu du pied de la façade ; s = échelle (largeur ≈ 7 s)."""
    def tr(pts):
        P = np.asarray(pts, np.float64)
        return np.column_stack([x + P[:, 0] * s, y + P[:, 1] * s])
    walls = tr([(-3.5, 0), (-3.5, -3.0), (3.5, -3.0), (3.5, 0)])
    gable = tr([(1.2, 0), (1.2, -3.0), (2.35, -4.6), (3.5, -3.0), (3.5, 0)])          # pignon tourné vers le couchant
    roof = tr([(-3.9, -2.8), (-1.6, -5.9), (2.35, -5.9), (3.9, -2.8)])
    door = tr([(-1.4, 0), (-1.4, -1.7), (-0.5, -1.7), (-0.5, 0)])
    window = tr([(2.0, -1.9), (2.0, -1.2), (2.7, -1.2), (2.7, -1.9)])
    chimney = tr([(-2.6, -4.5), (-2.6, -6.6), (-1.9, -6.6), (-1.9, -5.4)])
    return walls, gable, roof, door, window, chimney
