# -*- coding: utf-8 -*-
"""Fabrique les marques à partir du volcan officiel vectorisé (js/bb-logo.js) :
- l'icône de la barre du haut (symbole #logo-mini dans index.html) : écusson charbon + volcan vert à liseré blanc ;
- assets/icons/favicon.svg (la même, en fichier) ;
- assets/logo/badge.svg : l'écusson complet avec les vrais traits de pinceau blancs (sert aux icônes PNG et à l'image de partage).
Usage : python tools/logo/make_marks.py"""
import io
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
src = io.open(os.path.join(ROOT, "js", "bb-logo.js"), encoding="utf-8").read()
L = json.loads(src.split("window.BB.LOGO = ", 1)[1].rsplit(";", 1)[0])

# volcan centré dans un carré de 48 : 36 de large
S = 36 / L["w"]
TX, TY = 24 - 18, 25 - L["h"] * S / 2
light = (f'<circle cx="24" cy="24" r="23.5" fill="#2B1A10"/>'
         f'<g transform="translate({TX:.2f} {TY:.2f}) scale({S:.5f})">'
         f'<path d="{L["dGreen"]}" fill="{L["green"]}" stroke="#FFFFFF" stroke-width="15" stroke-linejoin="round" paint-order="stroke" fill-rule="evenodd"/></g>')

# 1. le symbole de la barre du haut
p = os.path.join(ROOT, "index.html")
html = io.open(p, encoding="utf-8").read()
html = re.sub(r'(<symbol id="logo-mini" viewBox="0 0 48 48">).*?(</symbol>)', lambda m: m.group(1) + "\n      " + light + "\n    " + m.group(2), html, flags=re.S)
io.open(p, "w", encoding="utf-8", newline="\n").write(html)

# 2. le favicon
io.open(os.path.join(ROOT, "assets", "icons", "favicon.svg"), "w", encoding="utf-8", newline="\n").write(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><!-- Bougnat Burger : le volcan du logo officiel -->' + light + "</svg>\n")

# 3. l'écusson complet (vrais traits de pinceau), 512 × 512
S2 = 330 / L["w"]
tx, ty = 256 - 165, 262 - L["h"] * S2 / 2
badge = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
         f'<defs><radialGradient id="d" cx="0.42" cy="0.36" r="0.75"><stop offset="0" stop-color="#43291A"/>'
         f'<stop offset="0.6" stop-color="#2E1C12"/><stop offset="1" stop-color="#1E120B"/></radialGradient></defs>'
         f'<circle cx="256" cy="256" r="250" fill="url(#d)"/>'
         f'<circle cx="256" cy="256" r="238" fill="none" stroke="#FBF4E6" stroke-opacity="0.28" stroke-width="2"/>'
         f'<g transform="translate({tx:.2f} {ty:.2f}) scale({S2:.5f})">'
         f'<path d="{L["dGreen"]}" fill="{L["green"]}" fill-rule="evenodd"/>'
         f'<path d="{L["dWhite"]}" fill="#FFFFFF" fill-rule="evenodd"/></g></svg>\n')
os.makedirs(os.path.join(ROOT, "assets", "logo"), exist_ok=True)
io.open(os.path.join(ROOT, "assets", "logo", "badge.svg"), "w", encoding="utf-8", newline="\n").write(badge)
print("marques écrites : #logo-mini, favicon.svg, badge.svg")
