# -*- coding: utf-8 -*-
"""Repère commun du bougnat : les pixels de l'image de base (source/base.png, 1024 × 1024), appelés « unités ».
Pièces, articulations, hublot et cadrage y sont tous exprimés ; le JS n'applique qu'une échelle (px par unité)."""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
SCENE = 1024

# --- le hublot : ouverture ronde (rayon HUB_RIN), anneau olive fin tout autour
HUB_C = (525.0, 600.0)
HUB_RIN = 410.0
MD_PX = 220.0                 # taille « md » du composant (px) : les épaisseurs du cadre sont réglées pour elle
VIEW = (76.0, 98.0, 948.0, 948.0)        # cadre carré du composant (x, y, largeur, hauteur) en unités
_U = VIEW[2] / MD_PX          # unités par px à la taille md
HUB_RIM = 5.0 * _U            # l'anneau olive : ≈ 5 px à la taille md
HUB_LIME = 1.25 * _U          # le filet tilleul intérieur : ≈ 1,25 px
HUB_BEVEL = 2.0 * _U          # le biseau sombre extérieur : ≈ 2 px
HUB_ROUT = HUB_RIN + HUB_RIM
# au-dessus de cette ligne, le bougnat sort du hublot (casquette, plateau) ; en dessous, l'ouverture le découpe
HUB_POP = 520.0

# --- cadrage sans hublot (frame: 'none') : le buste coupé net en bas
VIEW_NONE = (40.0, 98.0, 984.0, 926.0)
