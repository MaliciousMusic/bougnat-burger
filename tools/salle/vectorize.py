# -*- coding: utf-8 -*-
"""Vectorisation « aérographe » (reprise de l'outil svgscene du projet Pierre Guillaume) :
  · cache : le contour net de la zone (courbes de Bézier lissées), utilisé en clip-path ;
  · modelé : une grille de couleurs relevées sur le tableau, floutée (le dégradé doux de l'aérographe) ;
  · détails : les lumières et les ombres qui s'écartent du modelé, détourées en formes lissées (plusieurs niveaux).
Tout est du SVG pur : chemins, rectangles, dégradés, flou gaussien."""
import numpy as np
import cv2


def hexc(c):
    c = np.clip(np.round(c), 0, 255).astype(int)
    return f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}"


def _smooth_closed(pts, sigma):
    if sigma <= 0 or len(pts) < 8:
        return pts
    r = int(3 * sigma)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    out = np.empty_like(pts)
    for d in range(2):
        p = np.concatenate([pts[-r:, d], pts[:, d], pts[:r, d]])
        out[:, d] = np.convolve(p, k, mode="valid")
    return out


def _bezier_closed(P, prec=1):
    n = len(P)
    f = lambda v: f"{v:.{prec}f}".rstrip("0").rstrip(".")
    d = [f"M{f(P[0][0])} {f(P[0][1])}"]
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f"C{f(c1[0])} {f(c1[1])} {f(c2[0])} {f(c2[1])} {f(p2[0])} {f(p2[1])}")
    d.append("Z")
    return "".join(d)


def contour_d(cnt, smooth=1.2, eps=0.6, ox=0.0, oy=0.0):
    pts = cnt[:, 0, :].astype(np.float64) + 0.5
    if len(pts) < 5:
        return None
    pts = _smooth_closed(pts, smooth)
    ap = cv2.approxPolyDP(pts.astype(np.float32).reshape(-1, 1, 2), eps, True)[:, 0, :].astype(np.float64)
    if len(ap) < 3:
        return None
    ap[:, 0] -= ox; ap[:, 1] -= oy
    return _bezier_closed(ap)


def mask_d(mask, smooth=1.2, eps=0.6, min_area=4, ox=0.0, oy=0.0):
    """Chemin (evenodd) du masque, trous compris."""
    m = mask.astype(np.uint8)
    cnts, hier = cv2.findContours(m, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    parts = []
    for c in cnts:
        if abs(cv2.contourArea(c)) < min_area:
            continue
        d = contour_d(c, smooth, eps, ox, oy)
        if d:
            parts.append(d)
    return "".join(parts)


def fill_outside(img, mask, iters=None):
    """Prolonge les couleurs de la zone vers l'extérieur (voisin le plus proche), pour un modelé sans bords sales."""
    m = mask.astype(np.uint8)
    if m.sum() == 0:
        return img.copy()
    dist, labels = cv2.distanceTransformWithLabels(1 - m, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    ys, xs = np.where(m > 0)
    # table label -> coordonnées du pixel source
    lab_at = labels[ys, xs]
    table = np.zeros((labels.max() + 1, 2), np.int32)
    table[lab_at] = np.stack([ys, xs], 1)
    src = table[labels]
    out = img[src[..., 0], src[..., 1]]
    out[m > 0] = img[m > 0]
    return out


class Vectorizer:
    def __init__(self, rgb):
        self.rgb = rgb.astype(np.float32)
        self.H, self.W = rgb.shape[:2]
        self.defs = []
        self.uid = 0

    def _id(self, p):
        self.uid += 1
        return f"{p}{self.uid}"

    def blur_filter(self, sigma):
        fid = self._id("f")
        self.defs.append(f'<filter id="{fid}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">'
                         f'<feGaussianBlur stdDeviation="{sigma:g}"/></filter>')
        return fid

    def field(self, img, mask, cell, blur, bbox, ox, oy):
        """Grille de couleurs moyennes (dans la zone) prolongée au-delà, rendue en rectangles floutés.
        Renvoie (svg, image_rendue) : l'image simule le rendu SVG pour mesurer les écarts."""
        x0, y0, x1, y1 = bbox
        src = fill_outside(img, mask)
        gw, gh = int(np.ceil((x1 - x0) / cell)), int(np.ceil((y1 - y0) / cell))
        crop = src[y0:y0 + gh * cell, x0:x0 + gw * cell]
        ph, pw = gh * cell - crop.shape[0], gw * cell - crop.shape[1]
        if ph or pw:
            crop = np.pad(crop, ((0, ph), (0, pw), (0, 0)), mode="edge")
        grid = crop.reshape(gh, cell, gw, cell, 3).mean(axis=(1, 3))
        rects = []
        for j in range(gh):
            for i in range(gw):
                rects.append(f'<rect x="{x0 + i * cell - ox:g}" y="{y0 + j * cell - oy:g}" width="{cell + 0.6:g}" height="{cell + 0.6:g}" fill="{hexc(grid[j, i])}"/>')
        fid = self.blur_filter(blur)
        svg = f'<g filter="url(#{fid})">{"".join(rects)}</g>'
        # simulation du rendu : grille agrandie puis flou gaussien
        up = np.repeat(np.repeat(grid, cell, 0), cell, 1)[: y1 - y0, : x1 - x0]
        sim = cv2.GaussianBlur(up, (0, 0), blur)
        full = np.zeros_like(self.rgb)
        full[y0:y1, x0:x1] = sim
        return svg, full

    def details(self, img, mask, field_img, levels, min_area, smooth, eps, ox, oy, blur=0.0, opacity=1.0, only=None):
        """Formes lumière / ombre qui s'écartent du modelé : niveaux de seuil croissants (formes imbriquées)."""
        L_img = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
        L_fld = cv2.cvtColor(np.clip(field_img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
        res = cv2.GaussianBlur(L_img - L_fld, (0, 0), 0.8)
        m8 = mask.astype(bool)
        out = []
        for sign in (-1, 1):
            if only and ((sign < 0 and only != "dark") or (sign > 0 and only != "light")):
                continue
            for t in levels:
                sel = ((res * sign) > t) & m8
                sel = cv2.morphologyEx(sel.astype(np.uint8), cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
                n, lab, st, _ = cv2.connectedComponentsWithStats(sel, 8)
                for k in range(1, n):
                    if st[k, cv2.CC_STAT_AREA] < min_area:
                        continue
                    comp = (lab == k)
                    col = img[comp].mean(0)
                    x, y, w, h = st[k, 0], st[k, 1], st[k, 2], st[k, 3]
                    sub = comp[y:y + h, x:x + w].astype(np.uint8)
                    sub = np.pad(sub, 1)
                    cnts, _ = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
                    ds = []
                    for c in cnts:
                        if abs(cv2.contourArea(c)) < 1.5:
                            continue
                        c = c + np.array([[[x - 1, y - 1]]])
                        d = contour_d(c, smooth, eps, ox, oy)
                        if d:
                            ds.append(d)
                    if ds:
                        out.append(f'<path d="{"".join(ds)}" fill="{hexc(col)}" fill-rule="evenodd"/>')
        if not out:
            return ""
        attrs = f' opacity="{opacity:g}"' if opacity < 1 else ""
        if blur > 0:
            fid = self.blur_filter(blur)
            attrs += f' filter="url(#{fid})"'
        return f"<g{attrs}>{''.join(out)}</g>"

    def region(self, img, mask, cell, blur, levels, min_area=6, smooth=1.2, eps=0.6, detail_blur=0.5, pad=None, clip_smooth=1.0):
        """Zone complète : cache (clip-path) + modelé + détails. Renvoie (svg, bbox)."""
        ys, xs = np.where(mask)
        pad = pad if pad is not None else int(3 * blur + cell)
        x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
        x1, y1 = min(self.W, xs.max() + 1 + pad), min(self.H, ys.max() + 1 + pad)
        return self.region_in(img, mask, cell, blur, levels, (x0, y0, x1, y1), 0, 0, min_area, smooth, eps, detail_blur, clip_smooth)

    def region_in(self, img, mask, cell, blur, levels, bbox, ox, oy, min_area=6, smooth=1.2, eps=0.6, detail_blur=0.5, clip_smooth=1.0):
        cid = self._id("c")
        self.defs.append(f'<clipPath id="{cid}"><path d="{mask_d(mask, clip_smooth, 0.5, 4, ox, oy)}" clip-rule="evenodd"/></clipPath>')
        fsvg, fimg = self.field(img, mask, cell, blur, bbox, ox, oy)
        dsvg = self.details(img, mask, fimg, levels, min_area, smooth, eps, ox, oy, blur=detail_blur) if levels else ""
        return f'<g clip-path="url(#{cid})">{fsvg}{dsvg}</g>', fimg


# ---------------------------------------------------------------------------------------------------------------
# Facettes : la zone est découpée en plages de couleur aux bords francs (lissage qui préserve les bords, puis
# k-moyennes, puis composantes connexes ; les miettes rejoignent la plage voisine). Chaque facette reçoit un dégradé
# linéaire ajusté sur le tableau : c'est le geste de l'aérographe (un cache, un dégradé).
def _fit_gradient(px, cols):
    """px : (n,2) positions ; cols : (n,3) couleurs → (x1, y1, x2, y2, c1, c2) ou None (aplat)."""
    m = px.mean(0)
    q = px - m
    lum = cols @ np.array([0.3, 0.59, 0.11])
    A = np.c_[np.ones(len(q)), q]
    coef, *_ = np.linalg.lstsq(A, lum, rcond=None)
    g = coef[1:]
    gn = np.hypot(*g)
    span = np.ptp(q @ (g / gn)) if gn > 1e-6 else 0
    if gn * span < 3.0:  # variation négligeable : aplat
        return None, cols.mean(0)
    u = g / gn
    t = q @ u
    t0, t1 = np.percentile(t, 4), np.percentile(t, 96)
    if t1 - t0 < 1:
        return None, cols.mean(0)
    B = np.c_[np.ones(len(t)), t]
    cc, *_ = np.linalg.lstsq(B, cols, rcond=None)
    c1 = cc[0] + cc[1] * t0
    c2 = cc[0] + cc[1] * t1
    p1 = m + u * t0; p2 = m + u * t1
    return (p1[0], p1[1], p2[0], p2[1], c1, c2), None


def facets_svg(vz, img, mask, k=12, min_area=10, smooth=0.9, eps=0.5, bil=(7, 22, 5), seam=1.1, ox=0, oy=0, fit_img=None, sample=60000, soften=0.0):
    u8 = np.clip(img, 0, 255).astype(np.uint8)
    sm = cv2.bilateralFilter(u8, bil[0], bil[1], bil[2])
    sm = cv2.bilateralFilter(sm, bil[0], bil[1], bil[2])
    lab = cv2.cvtColor(sm, cv2.COLOR_RGB2LAB).astype(np.float32)
    ys, xs = np.where(mask)
    data = lab[ys, xs]
    crit = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.3)
    samp = data if len(data) <= sample else data[np.random.default_rng(1).choice(len(data), sample, replace=False)]
    _, _, centers = cv2.kmeans(samp, min(k, len(samp)), None, crit, 3, cv2.KMEANS_PP_CENTERS)
    d2 = ((data[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
    lbl = d2.argmin(1)
    Lb = np.full(mask.shape, -1, np.int32); Lb[ys, xs] = lbl
    F = np.full(mask.shape, -1, np.int32); nid = 0
    for c in range(len(centers)):
        n, lab_c, st, _ = cv2.connectedComponentsWithStats((Lb == c).astype(np.uint8), 8)
        if n <= 1:
            continue
        big = st[1:, cv2.CC_STAT_AREA] >= min_area
        ids = np.full(n, -1, np.int64); ids[1:][big] = np.arange(nid, nid + int(big.sum())); nid += int(big.sum())
        sel = lab_c > 0
        F[sel] = ids[lab_c[sel]]
    known = F >= 0
    if nid == 0:
        return ""
    un = mask & ~known
    if un.any():
        dist, labels = cv2.distanceTransformWithLabels((~known).astype(np.uint8), cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
        ky, kx = np.where(known)
        table = np.zeros(labels.max() + 1, np.int64); table[labels[ky, kx]] = F[ky, kx]
        F[un] = table[labels[un]]
    F[~mask] = -1
    src = (fit_img if fit_img is not None else cv2.GaussianBlur(img, (0, 0), 0.8)).astype(np.float64)
    order = np.bincount(F[F >= 0].ravel(), minlength=nid)
    parts = []
    for f in np.argsort(-order):
        if order[f] == 0:
            continue
        m = F == f
        yy, xx = np.where(m)
        x0, y0, x1, y1 = xx.min(), yy.min(), xx.max() + 1, yy.max() + 1
        sub = np.pad(m[y0:y1, x0:x1].astype(np.uint8), 1)
        cnts, _ = cv2.findContours(sub, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
        ds = []
        for c in cnts:
            if abs(cv2.contourArea(c)) < 1.0 and len(c) < 4:
                continue
            c = c + np.array([[[x0 - 1, y0 - 1]]])
            d = contour_d(c, smooth, eps, ox, oy)
            if d:
                ds.append(d)
        if not ds:
            continue
        px = np.c_[xx + 0.5, yy + 0.5].astype(np.float64)
        grad, flat = _fit_gradient(px, src[yy, xx])
        if grad is None:
            paint = hexc(flat)
        else:
            gx1, gy1, gx2, gy2, c1, c2 = grad
            gid = vz._id("g")
            vz.defs.append(f'<linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="{gx1 - ox:.1f}" y1="{gy1 - oy:.1f}" x2="{gx2 - ox:.1f}" y2="{gy2 - oy:.1f}">'
                           f'<stop offset="0" stop-color="{hexc(c1)}"/><stop offset="1" stop-color="{hexc(c2)}"/></linearGradient>')
            paint = f"url(#{gid})"
        parts.append(f'<path d="{"".join(ds)}" fill="{paint}" stroke="{paint}" stroke-width="{seam}" stroke-linejoin="round" fill-rule="evenodd"/>')
    if soften > 0:  # léger fondu des marches entre facettes (le velouté de l'aérographe), contour net conservé
        fid = vz.blur_filter(soften)
        cid = vz._id("c")
        vz.defs.append(f'<clipPath id="{cid}"><path d="{mask_d(mask, 0.8, 0.45, 4, ox, oy)}" clip-rule="evenodd"/></clipPath>')
        return f'<g clip-path="url(#{cid})"><g filter="url(#{fid})">{"".join(parts)}</g></g>'
    return "".join(parts)


def speckles_svg(img, mask, thresh=12, rmin=0.6, rmax=1.4, ox=0, oy=0, bins=10, blur=1.6, max_n=6000):
    """Mouchetures claires (aiguilles, poils) relevées aux maxima locaux de luminosité."""
    L = cv2.cvtColor(np.clip(img, 0, 255).astype(np.uint8), cv2.COLOR_RGB2LAB)[..., 0].astype(np.float32)
    hp = L - cv2.GaussianBlur(L, (0, 0), blur)
    mx = cv2.dilate(L, np.ones((3, 3), np.uint8))
    pts = np.argwhere((hp > thresh) & (L >= mx) & mask)
    if len(pts) > max_n:
        pts = pts[np.random.default_rng(3).choice(len(pts), max_n, replace=False)]
    if len(pts) == 0:
        return ""
    cols = img[pts[:, 0], pts[:, 1]]
    strength = np.clip((hp[pts[:, 0], pts[:, 1]] - thresh) / 30, 0, 1)
    # regroupement par teinte (un chemin par groupe)
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
            d.append(f"M{cx - r:.1f} {cy:.1f}a{r:.1f} {r:.1f} 0 1 0 {2 * r:.1f} 0a{r:.1f} {r:.1f} 0 1 0 {-2 * r:.1f} 0")
        out.append(f'<path d="{"".join(d)}" fill="{hexc(col)}"/>')
    return "".join(out)
