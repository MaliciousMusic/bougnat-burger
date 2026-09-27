# -*- coding: utf-8 -*-
"""Vectorisation « aérographe » d'une zone du tableau (adapté de l'outil « svgscene » de la panthère) :
  · facettes : la zone est découpée en plages de couleur aux bords francs (lissage qui préserve les bords, puis
    k-moyennes, puis composantes connexes ; les miettes rejoignent la plage voisine). Chaque facette reçoit un
    dégradé linéaire ajusté sur le tableau : le geste de l'aérographe (un cache, un dégradé) ;
  · champ : une grille de couleurs relevées, floutée (le dégradé doux de l'aérographe) ;
  · mouchetures : petites touches claires (houppiers des arbres).
Tout est du SVG pur : chemins de Bézier, dégradés linéaires, flou gaussien. Les chemins sont écrits en coordonnées
relatives compactes (une décimale) pour tenir le poids des calques."""
import numpy as np
import cv2


def hexc(c):
    c = np.clip(np.round(c), 0, 255).astype(int)
    s = f"{c[0]:02x}{c[1]:02x}{c[2]:02x}"
    if s[0] == s[1] and s[2] == s[3] and s[4] == s[5]:
        s = s[0] + s[2] + s[4]
    return "#" + s


def fnum(v, prec=1):
    """Nombre SVG compact : 0.5 → .5, -0.5 → -.5, 2.0 → 2."""
    s = f"{v:.{prec}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    if s in ("-0", ""):
        s = "0"
    if s.startswith("0.") and len(s) > 2:
        s = s[1:]
    elif s.startswith("-0.") and len(s) > 3:
        s = "-" + s[2:]
    return s


def join_nums(vals, prec=1):
    """Suite de nombres sans séparateurs inutiles (« 1.5.5-2 » = 1.5, .5, -2)."""
    out = []
    prev = ""
    for v in vals:
        s = fnum(v, prec)
        if out:
            if s[0] == "-" or (s[0] == "." and "." in prev):
                pass
            else:
                out.append(" ")
        out.append(s)
        prev = s
    return "".join(out)


def _smooth_closed(pts, sigma):
    if sigma <= 0 or len(pts) < 8:
        return pts
    r = int(3 * sigma)
    if r >= len(pts):
        r = len(pts) - 1
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2)
    k /= k.sum()
    out = np.empty_like(pts)
    for d in range(2):
        p = np.concatenate([pts[-r:, d], pts[:, d], pts[:r, d]])
        out[:, d] = np.convolve(p, k, mode="valid")
    return out


def bezier_closed(P, prec=1):
    """Polygone → courbe fermée de Catmull-Rom (Bézier cubiques), coordonnées relatives compactes."""
    n = len(P)
    q = 10 ** prec
    # positions absolues arrondies (les écarts relatifs se calculent sur les arrondis : pas de dérive)
    segs = []
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        segs.append((c1, c2, p2))
    rnd = lambda p: np.round(np.asarray(p) * q) / q
    cur = rnd(P[0])
    d = ["M" + join_nums([cur[0], cur[1]], prec) + "c"]
    vals = []
    for c1, c2, p2 in segs:
        a, b, e = rnd(c1), rnd(c2), rnd(p2)
        vals += [a[0] - cur[0], a[1] - cur[1], b[0] - cur[0], b[1] - cur[1], e[0] - cur[0], e[1] - cur[1]]
        cur = e
    d.append(join_nums(vals, prec))
    d.append("z")
    return "".join(d)


def contour_d(cnt, smooth=1.2, eps=0.6, ox=0.0, oy=0.0, prec=1):
    pts = cnt[:, 0, :].astype(np.float64) + 0.5
    if len(pts) < 5:
        return None
    pts = _smooth_closed(pts, smooth)
    ap = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, True)[:, 0, :].astype(np.float64)
    if len(ap) < 3:
        return None
    ap[:, 0] -= ox
    ap[:, 1] -= oy
    return bezier_closed(ap, prec)


def mask_d(mask, smooth=1.2, eps=0.6, min_area=4, ox=0.0, oy=0.0, prec=1):
    """Chemin (evenodd) du masque, trous compris."""
    m = mask.astype(np.uint8)
    cnts, _ = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cnts:
        if abs(cv2.contourArea(c)) < min_area:
            continue
        d = contour_d(c, smooth, eps, ox, oy, prec)
        if d:
            parts.append(d)
    return "".join(parts)


def fill_outside(img, mask):
    """Prolonge les couleurs de la zone vers l'extérieur (pixel connu le plus proche) : modelé sans bords sales,
    et zones cachées derrière les plans plus proches (la parallaxe peut les découvrir de quelques pixels)."""
    m = mask.astype(np.uint8)
    if m.sum() == 0:
        return img.copy()
    _, labels = cv2.distanceTransformWithLabels(1 - m, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.where(m > 0)
    table = np.zeros((labels.max() + 1, 2), np.int32)
    table[labels[ys, xs]] = np.stack([ys, xs], 1)
    src = table[labels]
    out = img[src[..., 0], src[..., 1]]
    out[m > 0] = img[m > 0]
    return out


def extend_soft(img, mask, sigma=3.0):
    """fill_outside puis flou progressif hors de la zone (les prolongements ne doivent pas faire de stries)."""
    ext = fill_outside(img, mask)
    bl = cv2.GaussianBlur(ext, (0, 0), sigma)
    d = cv2.distanceTransform((~mask.astype(bool)).astype(np.uint8), cv2.DIST_L2, 3)
    w = np.clip(d / (2 * sigma), 0, 1)[..., None]
    return ext * (1 - w) + bl * w


class Vectorizer:
    """Accumule les <defs> (dégradés, filtres, masques) d'un calque ; ids courts et uniques par calque."""

    def __init__(self, prefix="a"):
        self.defs = []
        self.uid = 0
        self.prefix = prefix

    def _id(self, p=""):
        self.uid += 1
        n, s = self.uid, ""
        while True:
            n, r = divmod(n, 36)
            s = "0123456789abcdefghijklmnopqrstuvwxyz"[r] + s
            if n == 0:
                break
        return f"{self.prefix}{p}{s}"

    def blur_filter(self, sigma, pad=20):
        fid = self._id("f")
        self.defs.append(f'<filter id="{fid}" x="-{pad}%" y="-{pad}%" width="{100 + 2 * pad}%" height="{100 + 2 * pad}%" '
                         f'color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="{sigma:g}"/></filter>')
        return fid

    def lin_gradient(self, x1, y1, x2, y2, stops, prec=1):
        """Dégradé linéaire en coordonnées de la scène. Les attributs communs viennent d'un modèle (href) :
        chaque dégradé ne porte que ses extrémités et ses arrêts."""
        if not getattr(self, "_tpl", None):
            self._tpl = self._id("U")
            self.defs.insert(0, f'<linearGradient id="{self._tpl}" gradientUnits="userSpaceOnUse"/>')
        gid = self._id("g")
        st = "".join((f'<stop stop-color="{c}"/>' if o == 0 else f'<stop offset="{fnum(o, 3)}" stop-color="{c}"/>')
                     for o, c in stops)
        self.defs.append(f'<linearGradient id="{gid}" href="#{self._tpl}" x1="{fnum(x1, prec)}" y1="{fnum(y1, prec)}" '
                         f'x2="{fnum(x2, prec)}" y2="{fnum(y2, prec)}">{st}</linearGradient>')
        return gid

    def field_rows(self, img, row, step, blur, bbox, ox=0, oy=0, tol=1.6, blur_x=None):
        """Champ d'aérographe économe : une rangée de `row` px = un rectangle rempli d'un dégradé horizontal
        (arrêts tous les `step` px, simplifiés à `tol` près), le tout flouté (surtout verticalement).
        img doit déjà être prolongée hors de la zone. Renvoie (svg, image simulée du rendu)."""
        x0, y0, x1, y1 = bbox
        W, Hh = x1 - x0, y1 - y0
        nr = int(np.ceil(Hh / row))
        crop = img[y0:y0 + nr * row, x0:x1]
        if crop.shape[0] < nr * row:
            crop = np.pad(crop, ((0, nr * row - crop.shape[0]), (0, 0), (0, 0)), mode="edge")
        rows_mean = crop.reshape(nr, row, W, 3).mean(1)          # (nr, W, 3)
        xs = np.arange(step / 2, W, step)
        parts = []
        sim_rows = np.zeros((nr, W, 3), np.float32)
        for j in range(nr):
            cs = np.array([rows_mean[j, int(min(W - 1, x - step / 2)):int(min(W, x + step / 2))].mean(0) for x in xs])
            keep = _simplify(xs, cs, tol)
            kx, kc = xs[keep], cs[keep]
            stops = [((x) / W, hexc(c)) for x, c in zip(kx, kc)]
            gid = self._id("r")
            st = "".join((f'<stop stop-color="{c}"/>' if i == 0 else f'<stop offset="{fnum(o, 3)}" stop-color="{c}"/>')
                         for i, (o, c) in enumerate(stops))
            self.defs.append(f'<linearGradient id="{gid}" x2="1">{st}</linearGradient>')
            parts.append(f'<rect x="{fnum(x0 - ox)}" y="{fnum(y0 + j * row - oy)}" width="{W}" height="{fnum(row + 0.5)}" fill="url(#{gid})"/>')
            sim_rows[j] = np.stack([np.interp(np.arange(W) + 0.5, kx, kc[:, c]) for c in range(3)], 1)
        bx = blur if blur_x is None else blur_x
        fid = self._id("f")
        self.defs.append(f'<filter id="{fid}" x="-2%" y="-10%" width="104%" height="120%" color-interpolation-filters="sRGB">'
                         f'<feGaussianBlur stdDeviation="{bx:g} {blur:g}" edgeMode="duplicate"/></filter>')
        svg = f'<g filter="url(#{fid})">{"".join(parts)}</g>'
        up = np.repeat(sim_rows, row, 0)[:Hh]
        sim = cv2.GaussianBlur(up.astype(np.float32), (0, 0), sigmaX=bx, sigmaY=blur)
        return svg, sim

    def field(self, img, cell, blur, bbox, ox=0, oy=0, opacity=1.0):
        """Grille de couleurs moyennes rendue en rectangles floutés (le dégradé doux de l'aérographe).
        img doit déjà être prolongée hors de la zone. Renvoie (svg, image simulée)."""
        x0, y0, x1, y1 = bbox
        gw, gh = int(np.ceil((x1 - x0) / cell)), int(np.ceil((y1 - y0) / cell))
        crop = img[y0:y0 + gh * cell, x0:x0 + gw * cell]
        ph, pw = gh * cell - crop.shape[0], gw * cell - crop.shape[1]
        if ph or pw:
            crop = np.pad(crop, ((0, ph), (0, pw), (0, 0)), mode="edge")
        grid = crop.reshape(gh, cell, gw, cell, 3).mean(axis=(1, 3))
        rows = []
        for j in range(gh):
            # une rangée : rectangles contigus de même couleur fusionnés
            i = 0
            while i < gw:
                c = hexc(grid[j, i])
                k = i + 1
                while k < gw and hexc(grid[j, k]) == c:
                    k += 1
                rows.append(f'<rect x="{fnum(x0 + i * cell - ox)}" y="{fnum(y0 + j * cell - oy)}" '
                            f'width="{fnum((k - i) * cell + 0.6)}" height="{fnum(cell + 0.6)}" fill="{c}"/>')
                i = k
        fid = self.blur_filter(blur)
        op = f' opacity="{opacity:g}"' if opacity < 1 else ""
        svg = f'<g filter="url(#{fid})"{op}>{"".join(rows)}</g>'
        up = np.repeat(np.repeat(grid, cell, 0), cell, 1)[: y1 - y0, : x1 - x0]
        sim = cv2.GaussianBlur(up.astype(np.float32), (0, 0), blur)
        return svg, sim


def _simplify(xs, cs, tol):
    """Indices des points à garder pour que l'interpolation linéaire reste à `tol` près (Douglas-Peucker 1D)."""
    keep = {0, len(xs) - 1}
    stack = [(0, len(xs) - 1)]
    while stack:
        a, b = stack.pop()
        if b - a < 2:
            continue
        t = (xs[a + 1:b] - xs[a]) / (xs[b] - xs[a])
        lin = cs[a][None, :] * (1 - t[:, None]) + cs[b][None, :] * t[:, None]
        err = np.abs(cs[a + 1:b] - lin).max(1)
        j = int(np.argmax(err))
        if err[j] > tol:
            m = a + 1 + j
            keep.add(m)
            stack += [(a, m), (m, b)]
    return np.array(sorted(keep))


def details_svg(vz, img, mask, field_img, levels, min_area, smooth=1.2, eps=0.6, blur=1.0, ox=0, oy=0,
                only=None, opacity=1.0, open_=3):
    """Détails d'aérographe : formes claires et sombres qui s'écartent du champ (seuils croissants : formes
    imbriquées), remplies de la couleur moyenne du tableau, légèrement floutées."""
    L_img = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    L_fld = cv2.cvtColor(np.clip(field_img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    res = cv2.GaussianBlur(L_img - L_fld, (0, 0), 1.2)
    out = []
    for sign in (-1, 1):
        if only and ((sign < 0 and only != "dark") or (sign > 0 and only != "light")):
            continue
        for t in levels:
            sel = ((res * sign) > t) & mask
            if open_:
                sel = cv2.morphologyEx(sel.astype(np.uint8), cv2.MORPH_OPEN, np.ones((open_, open_), np.uint8))
            n, lab, st, _ = cv2.connectedComponentsWithStats(sel.astype(np.uint8), 8)
            for k in range(1, n):
                if st[k, cv2.CC_STAT_AREA] < min_area:
                    continue
                x, y, w, h = st[k, 0], st[k, 1], st[k, 2], st[k, 3]
                comp = lab[y:y + h, x:x + w] == k
                col = img[y:y + h, x:x + w][comp].mean(0)
                sub = np.pad(comp.astype(np.uint8), 1)
                cnts, _ = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
                ds = []
                for c in cnts:
                    if abs(cv2.contourArea(c)) < 2:
                        continue
                    d = contour_d(c + np.array([[[x - 1, y - 1]]]), smooth, eps, ox, oy)
                    if d:
                        ds.append(d)
                if ds:
                    out.append(f'<path d="{"".join(ds)}" fill="{hexc(col)}"/>')
    if not out:
        return "", 0
    fid = vz.blur_filter(blur, pad=6) if blur > 0 else None
    attrs = (f' filter="url(#{fid})"' if fid else "") + (f' opacity="{opacity:g}"' if opacity < 1 else "")
    return f'<g{attrs} fill-rule="evenodd">{"".join(out)}</g>', len(out)


# ---------------------------------------------------------------------------------------------------------------
def fit_gradient(px, cols, min_delta=3.0):
    """px : (n,2) positions ; cols : (n,3) couleurs → ((x1, y1, x2, y2, c1, c2), None) ou (None, aplat)."""
    m = px.mean(0)
    q = px - m
    lum = cols @ np.array([0.3, 0.59, 0.11])
    A = np.c_[np.ones(len(q)), q]
    coef, *_ = np.linalg.lstsq(A, lum, rcond=None)
    g = coef[1:]
    gn = np.hypot(*g)
    # la direction du dégradé suit la luminance ; si elle est plate, on essaie la chromie (a/b)
    if gn < 1e-6:
        return None, cols.mean(0)
    u = g / gn
    t = q @ u
    t0, t1 = np.percentile(t, 4), np.percentile(t, 96)
    if t1 - t0 < 1 or gn * (t1 - t0) < min_delta:
        return None, cols.mean(0)
    B = np.c_[np.ones(len(t)), t]
    cc, *_ = np.linalg.lstsq(B, cols, rcond=None)
    c1 = cc[0] + cc[1] * t0
    c2 = cc[0] + cc[1] * t1
    p1 = m + u * t0
    p2 = m + u * t1
    return (p1[0], p1[1], p2[0], p2[1], c1, c2), None


def segment(img, mask, k=12, min_area=10, bil=(7, 22, 5), sample=60000, seed=1, presmooth=0):
    """Plages de couleur : lissage bilatéral, k-moyennes (Lab), composantes connexes ; les miettes (< min_area)
    rejoignent la plage voisine. Renvoie F (H, W) int : n° de facette (-1 hors zone), et le nombre de facettes."""
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    sm = u8
    for _ in range(2):
        sm = cv2.bilateralFilter(sm, bil[0], bil[1], bil[2])
    if presmooth:
        sm = cv2.GaussianBlur(sm, (0, 0), presmooth)
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
    ys, xs = np.where(mask)
    data = lab[ys, xs]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3)
    rng = np.random.default_rng(seed)
    samp = data if len(data) <= sample else data[rng.choice(len(data), sample, replace=False)]
    cv2.setRNGSeed(seed)
    _, _, centers = cv2.kmeans(samp, min(k, len(samp)), None, crit, 3, cv2.KMEANS_PP_CENTERS)
    lbl = np.empty(len(data), np.int32)
    for s in range(0, len(data), 200000):
        d2 = ((data[s:s + 200000, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lbl[s:s + 200000] = d2.argmin(1)
    Lb = np.full(mask.shape, -1, np.int32)
    Lb[ys, xs] = lbl
    F = np.full(mask.shape, -1, np.int32)
    nid = 0
    for c in range(len(centers)):
        n, lab_c, st, _ = cv2.connectedComponentsWithStats((Lb == c).astype(np.uint8), 8)
        if n <= 1:
            continue
        big = st[1:, cv2.CC_STAT_AREA] >= min_area
        ids = np.full(n, -1, np.int64)
        ids[1:][big] = np.arange(nid, nid + int(big.sum()))
        nid += int(big.sum())
        sel = lab_c > 0
        F[sel] = ids[lab_c[sel]]
    known = F >= 0
    if nid == 0:
        return F, 0
    un = mask & ~known
    if un.any():
        _, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ky, kx = np.where(known)
        table = np.zeros(labels.max() + 1, np.int64)
        table[labels[ky, kx]] = F[ky, kx]
        F[un] = table[labels[un]]
    F[~mask] = -1
    return F, nid


def facets_from(vz, F, nid, img, fit_img=None, smooth=0.9, eps=0.5, seam=1.0, ox=0, oy=0, min_delta=3.0,
                prec=1, order="area"):
    """Facettes (chemins + dégradés) à partir d'une segmentation F. Renvoie la liste des éléments SVG."""
    from scipy import ndimage
    src = (fit_img if fit_img is not None else cv2.GaussianBlur(img, (0, 0), 0.8)).astype(np.float64)
    areas = np.bincount(F[F >= 0].ravel(), minlength=nid)
    boxes = ndimage.find_objects(F + 1, max_label=nid)
    parts = []
    idx = np.argsort(-areas) if order == "area" else np.arange(nid)
    for f in idx:
        if areas[f] == 0 or boxes[f] is None:
            continue
        sy, sx = boxes[f]
        y0, y1, x0, x1 = sy.start, sy.stop, sx.start, sx.stop
        mloc = F[y0:y1, x0:x1] == f
        yy, xx = np.where(mloc)
        yy = yy + y0
        xx = xx + x0
        sub = np.pad(mloc.astype(np.uint8), 1)
        cnts, _ = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        ds = []
        for c in cnts:
            if abs(cv2.contourArea(c)) < 1.0 and len(c) < 4:
                continue
            c = c + np.array([[[x0 - 1, y0 - 1]]])
            d = contour_d(c, smooth, eps, ox, oy, prec)
            if d:
                ds.append(d)
        if not ds:
            continue
        px = np.c_[xx + 0.5, yy + 0.5].astype(np.float64)
        grad, flat = fit_gradient(px, src[yy, xx], min_delta)
        if grad is None:
            paint = hexc(flat)
        else:
            gx1, gy1, gx2, gy2, c1, c2 = grad
            if hexc(c1) == hexc(c2):
                paint = hexc(c1)
            else:
                gid = vz.lin_gradient(gx1 - ox, gy1 - oy, gx2 - ox, gy2 - oy, [(0, hexc(c1)), (1, hexc(c2))])
                paint = f"url(#{gid})"
        st = f' stroke="{paint}"' if seam > 0 else ""
        parts.append(f'<path d="{"".join(ds)}" fill="{paint}"{st}/>')
    return parts


def facets_svg(vz, img, mask, k=12, min_area=10, smooth=0.9, eps=0.5, bil=(7, 22, 5), seam=1.0, ox=0, oy=0,
               fit_img=None, soften=0.0, clip=True, min_delta=3.0, presmooth=0, seed=1, under=None, clip_smooth=0.8,
               prec=1, stats=None):
    """Zone → facettes. `soften` : léger flou de l'ensemble (le velouté de l'aérographe), contour net gardé par un
    clip-path (clip=True) ou laissé doux (clip=False). `under` : couleur d'une sous-couche pleine (dans le clip,
    sous le flou) qui bouche les interstices sans jamais dépasser du contour."""
    F, nid = segment(img, mask, k, min_area, bil, seed=seed, presmooth=presmooth)
    if nid == 0:
        return ""
    parts = facets_from(vz, F, nid, img, fit_img, smooth, eps, seam, ox, oy, min_delta, prec=prec)
    if stats is not None:
        stats["facets"] = stats.get("facets", 0) + len(parts)
    body = "".join(parts)
    g_attr = f' stroke-width="{seam:g}" stroke-linejoin="round" fill-rule="evenodd"' if seam > 0 else ' fill-rule="evenodd"'
    clip_d = mask_d(mask, clip_smooth, 0.45, 4, ox, oy) if (clip or under) else ""
    und = f'<path d="{clip_d}" fill="{under}" fill-rule="evenodd"/>' if under else ""
    if soften > 0:
        fid = vz.blur_filter(soften, pad=4)
        inner = f'<g filter="url(#{fid})"{g_attr}>{body}</g>'
    else:
        inner = f'<g{g_attr}>{body}</g>'
    if clip:
        cid = vz._id("c")
        vz.defs.append(f'<clipPath id="{cid}"><path d="{clip_d}" clip-rule="evenodd"/></clipPath>')
        return f'<g clip-path="url(#{cid})">{und}{inner}</g>'
    return und + inner


def speckles_svg(img, mask, thresh=12, rmin=0.6, rmax=1.4, ox=0, oy=0, bins=10, blur=1.6, max_n=6000, seed=3,
                 opacity=1.0, dark=False):
    """Mouchetures (houppiers éclairés, ou creux d'ombre si dark=True) relevées aux extrema locaux de luminosité."""
    L = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    hp = L - cv2.GaussianBlur(L, (0, 0), blur)
    if dark:
        hp = -hp
        mx = -cv2.erode(L, np.ones((3, 3), np.uint8))
        pts = np.argwhere((hp > thresh) & (-L >= mx) & mask)
    else:
        mx = cv2.dilate(L, np.ones((3, 3), np.uint8))
        pts = np.argwhere((hp > thresh) & (L >= mx) & mask)
    if len(pts) > max_n:
        pts = pts[np.random.default_rng(seed).choice(len(pts), max_n, replace=False)]
    if len(pts) == 0:
        return ""
    cols = img[pts[:, 0], pts[:, 1]]
    strength = np.clip((hp[pts[:, 0], pts[:, 1]] - thresh) / 30, 0, 1)
    lum = cols @ np.array([0.3, 0.59, 0.11])
    edges = np.quantile(lum, np.linspace(0, 1, bins + 1))
    groups = np.clip(np.searchsorted(edges, lum, side="right") - 1, 0, bins - 1)
    out = []
    for gi in range(bins):
        sel = groups == gi
        if not sel.any():
            continue
        col = cols[sel].mean(0)
        d = []
        for (y, x), s in zip(pts[sel], strength[sel]):
            r = rmin + (rmax - rmin) * s
            cx, cy = x + 0.5 - ox, y + 0.5 - oy
            d.append(f"M{fnum(cx - r)} {fnum(cy)}a{fnum(r)} {fnum(r)} 0 1 0 {fnum(2 * r)} 0a{fnum(r)} {fnum(r)} 0 1 0 {fnum(-2 * r)} 0")
        out.append(f'<path d="{"".join(d)}" fill="{hexc(col)}"/>')
    op = f' opacity="{opacity:g}"' if opacity < 1 else ""
    return f"<g{op}>{''.join(out)}</g>"


def l0_smooth(img, lam=0.02, kappa=2.0, beta_max=1e5, pad=16):
    """Lissage L0 (Xu, Lu, Xu, Jia 2011) : minimise le nombre de gradients non nuls. Donne des plages de couleur
    franches aux bords nets, sans la texture fine (feuillages, herbe) : la base d'une peinture propre.
    img : RGB float 0..255 → même format."""
    I = np.pad(np.clip(img, 0, 255).astype(np.float64) / 255.0, ((pad, pad), (pad, pad), (0, 0)), mode="reflect")
    H, W = I.shape[:2]
    fx = np.zeros((H, W)); fx[0, 0], fx[0, -1] = -1, 1
    fy = np.zeros((H, W)); fy[0, 0], fy[-1, 0] = -1, 1
    Fx, Fy = np.fft.fft2(fx), np.fft.fft2(fy)
    den_grad = np.abs(Fx) ** 2 + np.abs(Fy) ** 2
    FI = np.fft.fft2(I, axes=(0, 1))
    S = I.copy()
    beta = 2 * lam
    while beta < beta_max:
        h = np.roll(S, -1, axis=1) - S
        v = np.roll(S, -1, axis=0) - S
        t = (h ** 2 + v ** 2).sum(-1) < lam / beta
        h[t] = 0
        v[t] = 0
        # divergence (transposée des différences)
        dh = np.roll(h, 1, axis=1) - h
        dv = np.roll(v, 1, axis=0) - v
        num = FI + beta * np.fft.fft2(dh + dv, axes=(0, 1))
        S = np.real(np.fft.ifft2(num / (1 + beta * den_grad)[..., None], axes=(0, 1)))
        beta *= kappa
    return (np.clip(S[pad:-pad, pad:-pad], 0, 1) * 255).astype(np.float32)



# ---------------------------------------------------------------------------------------------------------------
# Peinture d'une zone (plaque déjà lissée L0) : grandes plages à dégradés + touches rondes pour les petites taches
# (houppiers, bosquets). Plus propre et bien plus léger qu'une mosaïque de petites facettes.
def paint_svg(vz, img, mask, k=22, min_area=60, dab_min=5, dab_de=6.0, grad_min=140, smooth=1.0, eps=0.55, ox=0, oy=0,
              soften=0.5, clip=True, under=None, bil=(3, 6, 2), min_delta=3.0, clip_smooth=0.8, seed=1, stats=None,
              fit_img=None, dab_scale=1.0, gprec=0, max_dabs=4000, prec=1, fit_blur=0.0, mode=0):
    from scipy import ndimage
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    sm = u8
    if bil:
        for _ in range(bil[3] if len(bil) > 3 else 1):
            sm = cv2.bilateralFilter(sm, bil[0], bil[1], bil[2])
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
    ys, xs = np.where(mask)
    data = lab[ys, xs]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3)
    rng = np.random.default_rng(seed)
    samp = data if len(data) <= 60000 else data[rng.choice(len(data), 60000, replace=False)]
    cv2.setRNGSeed(seed)
    _, _, centers = cv2.kmeans(samp, min(k, len(samp)), None, crit, 3, cv2.KMEANS_PP_CENTERS)
    lbl = np.empty(len(data), np.int32)
    for i0 in range(0, len(data), 200000):
        d2 = ((data[i0:i0 + 200000, None, :] - centers[None, :, :]) ** 2).sum(-1)
        lbl[i0:i0 + 200000] = d2.argmin(1)
    Lb = np.full(mask.shape, -1, np.int32)
    Lb[ys, xs] = lbl
    if mode:
        # filtre de mode (vote majoritaire dans un voisinage mode × mode) : bords des plages nets et réguliers,
        # miettes et filaments absorbés — le geste d'un peintre, pas le grain de la photo
        votes = np.zeros((len(centers),) + mask.shape, np.float32)
        for c in range(len(centers)):
            votes[c] = cv2.GaussianBlur((Lb == c).astype(np.float32), (0, 0), mode / 2.5)
        Lb = np.where(mask, votes.argmax(0), -1).astype(np.int32)
        del votes
    F = np.full(mask.shape, -1, np.int32)
    small = []          # petites taches : (masque local, x, y, aire)
    nid = 0
    for c in range(len(centers)):
        n, lab_c, st, _ = cv2.connectedComponentsWithStats((Lb == c).astype(np.uint8), 8)
        if n <= 1:
            continue
        areas = st[1:, cv2.CC_STAT_AREA]
        big = areas >= min_area
        ids = np.full(n, -1, np.int64)
        ids[1:][big] = np.arange(nid, nid + int(big.sum()))
        nid += int(big.sum())
        sel = lab_c > 0
        F[sel] = ids[lab_c[sel]]
        for j in np.nonzero(~big & (areas >= dab_min))[0] + 1:
            x, y, w, h = st[j, 0], st[j, 1], st[j, 2], st[j, 3]
            fill = st[j, cv2.CC_STAT_AREA] / float(w * h)
            if fill < 0.45 or max(w, h) > 2.6 * min(w, h) + 2:
                continue            # tache allongée : pas une touche ronde
            small.append((lab_c[y:y + h, x:x + w] == j, x, y, st[j, cv2.CC_STAT_AREA]))
    known = F >= 0
    if nid == 0:
        return ""
    un = mask & ~known
    if un.any():
        _, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ky, kx = np.where(known)
        table = np.zeros(labels.max() + 1, np.int64)
        table[labels[ky, kx]] = F[ky, kx]
        F[un] = table[labels[un]]
    F[~mask] = -1
    src = (fit_img if fit_img is not None else img).astype(np.float64)
    if fit_blur > 0:
        src = cv2.GaussianBlur(src, (0, 0), fit_blur)
    lab_src = cv2.cvtColor(np.clip(src, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    areas = np.bincount(F[F >= 0].ravel(), minlength=nid)
    boxes = ndimage.find_objects(F + 1, max_label=nid)
    k3 = np.ones((3, 3), np.uint8)
    parts = []
    facet_lab = np.zeros((nid, 3), np.float32)
    for f in np.argsort(-areas):
        if areas[f] == 0 or boxes[f] is None:
            continue
        sy, sx = boxes[f]
        y0, y1, x0, x1 = sy.start, sy.stop, sx.start, sx.stop
        mloc = F[y0:y1, x0:x1] == f
        yy, xx = np.where(mloc)
        facet_lab[f] = lab_src[yy + y0, xx + x0].mean(0)
        # contour pris sur la facette élargie d'un pixel : les voisines se chevauchent, pas de fissure
        sub = cv2.dilate(np.pad(mloc.astype(np.uint8), 2), k3)
        cnts, _ = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        ds = []
        for cc in cnts:
            if abs(cv2.contourArea(cc)) < 2.0:
                continue
            d = contour_d(cc + np.array([[[x0 - 2, y0 - 2]]]), smooth, eps, ox, oy, prec)
            if d:
                ds.append(d)
        if not ds:
            continue
        cols = src[yy + y0, xx + x0]
        paint = None
        if areas[f] >= grad_min:
            px = np.c_[xx + x0 + 0.5, yy + y0 + 0.5].astype(np.float64)
            grad, flat = fit_gradient(px, cols, min_delta)
            if grad is not None:
                gx1, gy1, gx2, gy2, c1, c2 = grad
                if hexc(c1) != hexc(c2):
                    paint = "url(#%s)" % vz.lin_gradient(gx1 - ox, gy1 - oy, gx2 - ox, gy2 - oy,
                                                         [(0, hexc(c1)), (1, hexc(c2))], prec=gprec)
                else:
                    paint = hexc(c1)
            else:
                paint = hexc(flat)
        if paint is None:
            paint = hexc(cols.mean(0))
        parts.append(f'<path d="{"".join(ds)}" fill="{paint}"/>')
    # touches rondes : seulement celles qui se voient (écart de couleur avec la plage où elles ont fondu)
    groups = {}
    ndab = 0
    small.sort(key=lambda t: -t[3])
    for m, x, y, area in small:
        yy, xx = np.nonzero(m)
        cy_, cx_ = yy.mean() + y, xx.mean() + x
        iy, ix = int(round(cy_)), int(round(cx_))
        iy, ix = min(mask.shape[0] - 1, iy), min(mask.shape[1] - 1, ix)
        if not mask[iy, ix]:
            continue
        col_lab = lab_src[yy + y, xx + x].mean(0)
        host = F[iy, ix]
        if host < 0 or np.sqrt(((col_lab - facet_lab[host]) ** 2).sum()) < dab_de:
            continue
        col = src[yy + y, xx + x].mean(0)
        key = hexc(np.round(col / 5) * 5)
        r = np.sqrt(area / np.pi) * dab_scale
        px_, py_ = cx_ + 0.5 - ox, cy_ + 0.5 - oy
        groups.setdefault(key, []).append(
            f"M{fnum(px_ - r)} {fnum(py_)}a{fnum(r)} {fnum(r)} 0 1 0 {fnum(2 * r)} 0a{fnum(r)} {fnum(r)} 0 1 0 {fnum(-2 * r)} 0")
        ndab += 1
        if ndab >= max_dabs:
            break
    dabs = "".join(f'<path d="{"".join(v)}" fill="{kc}"/>' for kc, v in groups.items())
    if stats is not None:
        stats["facets"] = stats.get("facets", 0) + len(parts)
        stats["dabs"] = stats.get("dabs", 0) + ndab
    body = "".join(parts) + dabs
    clip_d = mask_d(mask, clip_smooth, 0.45, 4, ox, oy) if (clip or under) else ""
    und = f'<path d="{clip_d}" fill="{under}" fill-rule="evenodd"/>' if under else ""
    inner = (f'<g filter="url(#{vz.blur_filter(soften, pad=4)})" fill-rule="evenodd">{body}</g>' if soften > 0
             else f'<g fill-rule="evenodd">{body}</g>')
    if clip:
        cid = vz._id("c")
        vz.defs.append(f'<clipPath id="{cid}"><path d="{clip_d}" clip-rule="evenodd"/></clipPath>')
        return f'<g clip-path="url(#{cid})">{und}{inner}</g>'
    return und + inner


# ---------------------------------------------------------------------------------------------------------------
# Affiche (le bougnat) : une palette Lab COMMUNE à toutes les pièces (deux pièces voisines ont exactement les mêmes
# teintes : pas de couture), vote majoritaire pour des bords de plages nets, miettes fondues dans la plage voisine,
# puis une facette par plage avec son dégradé linéaire ajusté sur le tableau. `detail` : zones (yeux, bouche) où l'on
# garde les petites formes (pas de vote, aire minimale réduite).
def palette(imgs_masks, k=40, seed=1, sample=120000, extra=None):
    """Palette Lab commune : k-moyennes sur les pixels de toutes les pièces (liste de (image, masque)).
    extra : [(image, masque, k)] petites zones (les yeux) qui reçoivent leurs propres teintes, sinon noyées."""
    more = []
    for img, m, kk in (extra or []):
        more.append(palette([(img, m)], k=kk, seed=seed))
    data = []
    for img, m in imgs_masks:
        lab = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
        data.append(lab[m.astype(bool)])
    data = np.concatenate(data)
    rng = np.random.default_rng(seed)
    samp = data if len(data) <= sample else data[rng.choice(len(data), sample, replace=False)]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 60, 0.2)
    cv2.setRNGSeed(seed)
    _, _, centers = cv2.kmeans(samp, k, None, crit, 4, cv2.KMEANS_PP_CENTERS)
    return np.concatenate([centers] + more) if more else centers


def poster_svg(vz, img, mask, centers, fit_img=None, min_area=40, mode=5, detail=None, detail_min=6,
               smooth=1.0, eps=0.7, soften=0.0, grad_min=60, min_delta=3.0, prec=1, under=True, stats=None,
               clip_smooth=0.8, weights=None, crisp_max=0):
    """soften : flou (unités) des grandes plages seulement (le velouté de l'aérographe) ; les petites formes
    (aire < crisp_max) et celles des zones de détail sont redessinées nettes par-dessus."""
    from scipy import ndimage
    H, W = mask.shape
    m = mask.astype(bool)
    if not m.any():
        return ""
    lab = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)
    C = np.asarray(centers, np.float32)
    wts = np.array(weights if weights is not None else (1.0, 1.0, 1.0), np.float32)
    ys, xs = np.where(m)
    d2 = (((lab[ys, xs][:, None, :] - C[None]) * wts) ** 2).sum(-1)
    Lb = np.full((H, W), -1, np.int32)
    Lb[ys, xs] = d2.argmin(1)
    det = detail.astype(bool) & m if detail is not None else np.zeros_like(m)
    if mode:
        used = np.unique(Lb[m])
        votes = np.zeros((len(used), H, W), np.float32)
        for i, c in enumerate(used):
            votes[i] = cv2.GaussianBlur((Lb == c).astype(np.float32), (0, 0), mode / 2.5)
        voted = used[votes.argmax(0)]
        del votes
        Lb = np.where(m & ~det, voted, Lb).astype(np.int32)
    # composantes ; miettes → plage voisine
    F = np.full((H, W), -1, np.int32)
    nid = 0
    for c in np.unique(Lb[m]):
        n, lab_c, st, _ = cv2.connectedComponentsWithStats((Lb == c).astype(np.uint8), 8)
        if n <= 1:
            continue
        areas = st[1:, cv2.CC_STAT_AREA]
        # une composante qui touche la zone de détail garde un seuil plus bas
        touch = np.zeros(n - 1, bool)
        if det.any():
            hit = np.unique(lab_c[det])
            hit = hit[hit > 0] - 1
            touch[hit] = True
        big = np.where(touch, areas >= detail_min, areas >= min_area)
        ids = np.full(n, -1, np.int64)
        ids[1:][big] = np.arange(nid, nid + int(big.sum()))
        nid += int(big.sum())
        sel = lab_c > 0
        F[sel] = ids[lab_c[sel]]
    known = F >= 0
    if nid == 0:
        return ""
    un = m & ~known
    if un.any():
        _, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ky, kx = np.where(known)
        table = np.zeros(labels.max() + 1, np.int64)
        table[labels[ky, kx]] = F[ky, kx]
        F[un] = table[labels[un]]
    F[~m] = -1
    src = (fit_img if fit_img is not None else img).astype(np.float64)
    areas = np.bincount(F[F >= 0].ravel(), minlength=nid)
    boxes = ndimage.find_objects(F + 1, max_label=nid)
    k3 = np.ones((3, 3), np.uint8)
    parts, crisp = [], []
    for f in np.argsort(-areas):
        if areas[f] == 0 or boxes[f] is None:
            continue
        sy, sx = boxes[f]
        y0, y1, x0, x1 = sy.start, sy.stop, sx.start, sx.stop
        mloc = F[y0:y1, x0:x1] == f
        yy, xx = np.where(mloc)
        in_det = bool(det[yy + y0, xx + x0].mean() > 0.5) if det.any() else False
        sub = cv2.dilate(np.pad(mloc.astype(np.uint8), 2), k3)
        cnts, _ = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        ds = []
        small = areas[f] < min_area
        for cc in cnts:
            if abs(cv2.contourArea(cc)) < 2.0:
                continue
            d = contour_d(cc + np.array([[[x0 - 2, y0 - 2]]]), smooth * (0.6 if small else 1.0), eps * (0.6 if small else 1.0), 0, 0, prec)
            if d:
                ds.append(d)
        if not ds:
            continue
        cols = src[yy + y0, xx + x0]
        paint = None
        if areas[f] >= grad_min:
            px = np.c_[xx + x0 + 0.5, yy + y0 + 0.5].astype(np.float64)
            grad, flat = fit_gradient(px, cols, min_delta)
            if grad is not None:
                gx1, gy1, gx2, gy2, c1, c2 = grad
                paint = hexc(c1) if hexc(c1) == hexc(c2) else "url(#%s)" % vz.lin_gradient(gx1, gy1, gx2, gy2, [(0, hexc(c1)), (1, hexc(c2))], prec=0)
            else:
                paint = hexc(flat)
        if paint is None:
            paint = hexc(cols.mean(0))
        el = f'<path d="{"".join(ds)}" fill="{paint}"/>'
        parts.append(el)
        if soften > 0 and (in_det or areas[f] < crisp_max):
            crisp.append(el)
    if stats is not None:
        stats["facets"] = stats.get("facets", 0) + len(parts)
        stats["crisp"] = stats.get("crisp", 0) + len(crisp)
    body = "".join(parts)
    clip_d = mask_d(m, clip_smooth, 0.45, 4, 0, 0, prec)
    und = f'<path d="{clip_d}" fill="{hexc(src[m].mean(0))}"/>' if under else ""
    inner = (f'<g filter="url(#{vz.blur_filter(soften, pad=3)})">{und}{body}</g>{"".join(crisp)}' if soften > 0 else f"{und}{body}")
    cid = vz._id("c")
    vz.defs.append(f'<clipPath id="{cid}"><path d="{clip_d}"/></clipPath>')
    return f'<g clip-path="url(#{cid})">{inner}</g>'
