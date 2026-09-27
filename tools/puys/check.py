# -*- coding: utf-8 -*-
"""Contrôle de la silhouette du Dôme : le calque assets/img/puys/dome.svg est rastérisé seul (Chrome), son bord haut
relevé colonne par colonne, puis comparé au profil relevé sur photo (tools/puys/puy-de-dome.json, mis à l'échelle
et placé comme dans scene.py). Écrit une planche : le calque, le profil relevé en rouge par-dessus, deux loupes
(sommet, flanc droit), et les écarts.

Usage : python tools/puys/check.py [sortie.png]      (par défaut tools/puys/_gen/controle-dome.png)"""
import os
import subprocess
import sys

import numpy as np
import cv2

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import scene as SC  # noqa: E402

Z = 4                                                   # 4 px par unité de scène


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '_gen', 'controle-dome.png')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    svg = os.path.join(SC.ROOT, 'assets', 'img', 'puys', 'dome.svg')
    png = out.replace('.png', '-calque.png')
    subprocess.run(['node', os.path.join(HERE, 'raster.mjs'), svg, png, str(SC.VW * Z), str(SC.VH * Z)], check=True)
    rgba = cv2.imread(png, cv2.IMREAD_UNCHANGED)
    alpha = rgba[..., 3].astype(np.float32) / 255.0
    H, W = alpha.shape
    # bord haut rendu : première ligne où l'opacité dépasse 50 % (interpolée au sous-pixel)
    xs_px = np.arange(W)
    top = np.full(W, np.nan)
    for x in xs_px:
        col = alpha[:, x]
        idx = np.argmax(col > 0.5)
        if col[idx] > 0.5:
            if idx > 0:
                a0, a1 = col[idx - 1], col[idx]
                top[x] = idx - 1 + (0.5 - a0) / max(1e-6, a1 - a0) + 0.5
            else:
                top[x] = 0.5
    xs = (xs_px + 0.5) / Z
    y_render = top / Z
    # profil relevé (photo → scène), seulement sur la partie relevée (px de 0 à 494) et visible (x de 0 à 480)
    px = SC.scene_to_px(xs)
    y_trace = SC.dome_y(xs)
    sx, _ = SC.SUMMIT
    keep = (px >= 0) & (px <= SC.PX_END) & ~np.isnan(y_render) & ~((xs > sx - 11.5) & (xs < sx + 6.5))   # hors bâtiments
    dev = np.abs(y_render[keep] - y_trace[keep])
    msg = (f'écart bord rendu / profil relevé : moyen {dev.mean():.3f} u, max {dev.max():.3f} u '
           f'({dev.max() / SC.S:.2f} px photo), sur {keep.sum()} colonnes (Dôme hors bâtiments du sommet)')
    print(msg)
    # planche : calque sur charbon, profil relevé en rouge (points du relevé, sans lissage)
    bg = np.zeros((H, W, 3), np.float32)
    bg[:] = (15, 19, 26)
    col = rgba[..., :3].astype(np.float32)
    img = (bg * (1 - alpha[..., None]) + col * alpha[..., None]).astype(np.uint8)
    P = SC.PROF[SC.PROF[:, 0] <= SC.PX_END]
    sxp, syp = SC.photo_to_scene(P[:, 0], P[:, 1])
    pts = np.column_stack([sxp * Z, syp * Z]).round().astype(np.int32)
    over = img.copy()
    cv2.polylines(over, [pts], False, (40, 40, 255), 1, cv2.LINE_AA)
    ax, at = SC.ANT_TOP
    cv2.line(over, (int(ax * Z), int(SC.ANT_FOOT_Y * Z)), (int(ax * Z), int(at * Z)), (255, 60, 255), 1, cv2.LINE_AA)
    # loupes ×3 : le sommet et le flanc droit
    def loupe(x0, y0, x1, y1):
        c = over[int(y0 * Z):int(y1 * Z), int(x0 * Z):int(x1 * Z)]
        return cv2.resize(c, None, fx=3, fy=3, interpolation=cv2.INTER_NEAREST)
    l1 = loupe(170, 92, 250, 150)
    l2 = loupe(300, 130, 420, 215)
    band = np.zeros((max(l1.shape[0], l2.shape[0]), l1.shape[1] + l2.shape[1] + 12, 3), np.uint8)
    band[:] = 30
    band[:l1.shape[0], :l1.shape[1]] = l1
    band[:l2.shape[0], l1.shape[1] + 12:] = l2
    canvas = np.zeros((H + band.shape[0] + 60, max(W, band.shape[1]), 3), np.uint8)
    canvas[:] = 30
    canvas[:H, :W] = over
    canvas[H + 10:H + 10 + band.shape[0], :band.shape[1]] = band
    cv2.putText(canvas, 'rouge : profil releve (puy-de-dome.json) ; magenta : mat (releve a la main)', (10, H + band.shape[0] + 32),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (230, 230, 230), 1, cv2.LINE_AA)
    cv2.putText(canvas, f'ecart moyen {dev.mean():.3f} u, max {dev.max():.3f} u ({dev.max() / SC.S:.2f} px photo)',
                (10, H + band.shape[0] + 54), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (230, 230, 230), 1, cv2.LINE_AA)
    cv2.imwrite(out, canvas)
    print('planche :', out)


if __name__ == '__main__':
    main()
