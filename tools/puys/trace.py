#!/usr/bin/env python3
"""Relève la ligne de crête du puy de Dôme sur une photo de référence (seulement le profil,
jamais l'image) et l'écrit en coordonnées normalisées dans tools/puys/puy-de-dome.json.

Usage : python tools/puys/trace.py <photo> [--debug sortie.png]
Principe : le ciel est clair (orange, rose, bleu) et le relief sombre ; pour chaque colonne, on
cherche la première ligne « relief » en partant du haut, on lisse, puis on repère l'antenne (le
mât fin au-dessus du sommet) à part pour la redessiner proprement.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent


def trace(path, debug=None):
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    L = cv2.GaussianBlur(lab[..., 0] / 255.0, (3, 3), 0)

    # force du bord « ciel au-dessus, relief en dessous » : chute de clarté vers le bas
    k = 4
    up = np.zeros_like(L)
    dn = np.zeros_like(L)
    for i in range(1, k + 1):
        up[i:, :] += L[:-i, :]
        dn[:-i, :] += L[i:, :]
    edge = (up - dn) / k                      # > 0 quand c'est clair au-dessus et sombre en dessous
    edge[:k, :] = 0
    edge[-k:, :] = 0
    dark_below = np.zeros_like(L)             # le relief reste sombre sur une bonne hauteur
    for i in range(3, 14):
        dark_below[:-i, :] += (L[i:, :] < 0.42)
    score = edge + 0.02 * dark_below

    # chemin de gauche à droite qui maximise le score, pente limitée (programmation dynamique)
    jump = 3
    cost = np.full((h, w), -1e9, np.float32)
    back = np.zeros((h, w), np.int16)
    cost[:, 0] = score[:, 0]
    for x in range(1, w):
        prev = cost[:, x - 1]
        best = np.full(h, -1e9, np.float32)
        arg = np.zeros(h, np.int16)
        for dy in range(-jump, jump + 1):
            sh = np.roll(prev, dy)
            if dy > 0:
                sh[:dy] = -1e9
            elif dy < 0:
                sh[dy:] = -1e9
            cand = sh - 0.004 * abs(dy)
            m = cand > best
            best[m] = cand[m]
            arg[m] = dy
        cost[:, x] = best + score[:, x]
        back[:, x] = arg
    y = int(np.argmax(cost[:, -1]))
    ridge = np.zeros(w, np.float32)
    for x in range(w - 1, -1, -1):
        ridge[x] = y
        y = y - int(back[y, x])
    ridge = cv2.GaussianBlur(ridge.reshape(1, -1), (5, 1), 1.0).reshape(-1)

    # l'antenne : un trait sombre, fin et vertical, au-dessus de la crête près du sommet
    summit = int(np.argmin(ridge))
    antenna = None
    best_len = 0
    for x in range(max(0, summit - 40), min(w, summit + 40)):
        yb = int(ridge[x]) - 2
        run = 0
        for yy in range(yb, 0, -1):
            if L[yy, x] < 0.36 and L[yy, x] < min(L[yy, max(0, x - 3)], L[yy, min(w - 1, x + 3)]) - 0.04:
                run += 1
            else:
                break
        if run > best_len:
            best_len, antenna = run, {'x': x / (w - 1), 'top': (yb - run) / h, 'foot': float(ridge[x]) / h}
    if best_len < 6:
        antenna = None
    pts = [(x / (w - 1), float(ridge[x]) / h) for x in range(w)]
    out = {'source_w': w, 'source_h': h, 'profile': pts, 'antenna': antenna}
    if debug:
        dbg = img.copy()
        for x in range(w - 1):
            cv2.line(dbg, (x, int(ridge[x])), (x + 1, int(ridge[x + 1])), (60, 255, 60), 1)
        if antenna:
            ax = int(round(antenna['x'] * (w - 1)))
            cv2.line(dbg, (ax, int(antenna['top'] * h)), (ax, int(antenna['foot'] * h)), (255, 60, 255), 1)
        cv2.imwrite(str(debug), cv2.resize(dbg, (w * 2, h * 2), interpolation=cv2.INTER_NEAREST))
    return out


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    debug = None
    if '--debug' in args:
        i = args.index('--debug')
        debug = args[i + 1]
        del args[i:i + 2]
    res = trace(args[0], debug)
    (HERE / 'puy-de-dome.json').write_text(json.dumps(res, separators=(',', ':')), encoding='utf-8')
    print('profil :', len(res['profile']), 'points ; antenne :', res['antenna'])


if __name__ == '__main__':
    main()
