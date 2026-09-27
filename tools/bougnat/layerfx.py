# -*- coding: utf-8 -*-
"""Finitions des couches détourées : tiges coupées par le cadre fondues en douceur, fragments parasites retirés."""
import numpy as np
from PIL import Image
from scipy import ndimage


def keep_main(rgba, ratio=0.35):
    """Ne garde que la plus grande forme (et celles d'au moins `ratio` × sa surface)."""
    a = np.asarray(rgba.getchannel("A"), dtype=np.float32)
    lab, n = ndimage.label(a > 24)
    if n <= 1:
        return rgba
    sizes = ndimage.sum(np.ones_like(a), lab, index=np.arange(1, n + 1))
    keep = np.zeros(n + 1, bool)
    keep[1:] = sizes >= sizes.max() * ratio
    mask = keep[lab]
    # on dilate un peu pour ne pas rogner le liseré antialiasé des formes gardées
    mask = ndimage.binary_dilation(mask, iterations=3)
    out = np.array(rgba)
    out[..., 3] = (out[..., 3] * mask).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def cut_sides(rgba, thr=96, band=2):
    """Côtés où la forme touche le bord de l'image (donc coupée net par le cadre de génération)."""
    a = np.asarray(rgba.getchannel("A"))
    return {
        "top": a[:band].max() > thr, "bottom": a[-band:].max() > thr,
        "left": a[:, :band].max() > thr, "right": a[:, -band:].max() > thr,
    }


def fade_sides(rgba, sides, frac=0.16):
    """Fond l'alpha vers les côtés coupés (rampe lissée sur `frac` de la dimension)."""
    out = np.array(rgba).astype(np.float32)
    h, w = out.shape[:2]
    ys = np.linspace(0, 1, h)[:, None]
    xs = np.linspace(0, 1, w)[None, :]
    s = lambda t: np.clip(t, 0, 1) ** 2 * (3 - 2 * np.clip(t, 0, 1))
    k = np.ones((h, w), np.float32)
    if sides.get("top"): k *= s(ys / frac)
    if sides.get("bottom"): k *= s((1 - ys) / frac)
    if sides.get("left"): k *= s(xs / frac)
    if sides.get("right"): k *= s((1 - xs) / frac)
    out[..., 3] *= k
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), "RGBA")
