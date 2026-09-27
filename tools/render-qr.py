#!/usr/bin/env python3
"""Le QR code du décor pour ordinateur (« Scannez pour ouvrir l'appli »), écrit en SVG dans index.html.

Il mène à l'adresse canonique de la page (balise canonical) : aucune bibliothèque ni CDN à l'exécution,
il s'affiche même hors ligne ou en local. tools/set-domain.mjs le relance quand l'adresse change.
Usage : python tools/render-qr.py
"""
import re
from pathlib import Path

import qrcode

ROOT = Path(__file__).resolve().parents[1]
idx = ROOT / 'index.html'
html = idx.read_text(encoding='utf-8')
url = re.search(r'<link rel="canonical" href="([^"]+)"', html).group(1)

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
qr.add_data(url)
qr.make(fit=True)
m = qr.get_matrix()
n = len(m)
# un seul tracé : une suite de carrés d'un module, les modules voisins d'une même ligne fusionnés
d = []
for r, row in enumerate(m):
    c = 0
    while c < n:
        if row[c]:
            start = c
            while c < n and row[c]:
                c += 1
            d.append(f'M{start} {r}h{c - start}v1h{start - c}z')
        else:
            c += 1
svg = (f'<svg viewBox="-1 -1 {n + 2} {n + 2}" shape-rendering="crispEdges" role="img" aria-label="QR code : {url}">'
       f'<path d="{"".join(d)}" fill="#2B1A10"/></svg>')
block = f'<!-- QR:START (tools/render-qr.py : {url}) -->{svg}<!-- QR:END -->'
if '<!-- QR:START' in html:
    html = re.sub(r'<!-- QR:START.*?<!-- QR:END -->', lambda _: block, html, flags=re.S)
else:
    html = html.replace('<div class="desk-qr" id="desk-qr"></div>', f'<div class="desk-qr" id="desk-qr">{block}</div>', 1)
idx.write_text(html, encoding='utf-8')
print(f'QR code ({n}x{n} modules) -> {url}')
