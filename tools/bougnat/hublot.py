# -*- coding: utf-8 -*-
"""Le hublot du bougnat : le cadre rond de la salle, derrière lui un ciel de coucher de soleil en aplat d'affiche.

Palette (retour de l'utilisateur) : l'anneau est olive (#7C8A3A), fin (≈ 5 px à la taille md), avec un filet tilleul
(#96C124) sur le bord intérieur et un biseau sombre à l'extérieur. Le vert tilleul du logo reste un accent.

La ligne des Puys (le puy de Dôme et son antenne) n'est PAS dessinée ici : un tracé fidèle arrive à part.
Pour la poser : enregistrer source/puys.json = {"d": "<chemin>", "viewBox": [x, y, l, h], "fill": "#…"}
(optionnel : "layers": [{"d", "fill"}, …] pour plusieurs plans, même viewBox), puis relancer
python hublot.py && python build.py --js : le calque assets/bougnat/hublot-puys.svg est créé et le JS l'affiche.

Sorties (repère de la scène, voir rig.py) :
  assets/bougnat/hublot-fond.svg    le ciel (dégradé pêche → rose → crème) dans l'ouverture ronde
  assets/bougnat/hublot-puys.svg    la ligne des Puys, si source/puys.json existe
  assets/bougnat/hublot-anneau.svg  l'anneau complet (derrière le bougnat)
  assets/bougnat/hublot-avant.svg   le bas de l'anneau (devant le bougnat : il sort du hublot par le haut)
Usage : python hublot.py"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rig  # noqa: E402

OUT = os.path.join(rig.ROOT, "assets", "bougnat")
PUYS = os.path.join(HERE, "source", "puys.json")


def f(v):
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return s if s not in ("-0", "") else "0"


def circle_d(cx, cy, r, sweep=1):
    return (f"M{f(cx - r)} {f(cy)}a{f(r)} {f(r)} 0 1 {sweep} {f(2 * r)} 0a{f(r)} {f(r)} 0 1 {sweep} {f(-2 * r)} 0z")


def svg(box, defs, body):
    x, y, w, h = box
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{f(x)} {f(y)} {f(w)} {f(h)}" width="{f(w)}" height="{f(h)}">'
            f'<defs>{"".join(defs)}</defs>{body}</svg>')


def fond():
    """Le ciel du coucher de soleil, et un léger voile d'ombre au bord de l'ouverture (la profondeur du hublot)."""
    (cx, cy), R = rig.HUB_C, rig.HUB_RIN
    top, bot = cy - R, cy + R
    defs = [
        f'<linearGradient id="k" x1="0" y1="{f(top)}" x2="0" y2="{f(bot)}" gradientUnits="userSpaceOnUse">'
        '<stop stop-color="#f2b48c"/><stop offset=".42" stop-color="#eda39a"/><stop offset=".72" stop-color="#f4c4aa"/>'
        '<stop offset="1" stop-color="#f8e4c8"/></linearGradient>',
        # voile d'ombre intérieur, décalé vers le haut à gauche (la cloison porte ombre sur la vitre)
        f'<radialGradient id="v" cx="{f(cx + R * 0.05)}" cy="{f(cy + R * 0.06)}" r="{f(R * 1.02)}" gradientUnits="userSpaceOnUse">'
        '<stop offset=".86" stop-color="#6b3b35" stop-opacity="0"/><stop offset="1" stop-color="#6b3b35" stop-opacity=".22"/></radialGradient>',
    ]
    body = f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R + 0.5)}" fill="url(#k)"/><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R + 0.5)}" fill="url(#v)"/>'
    box = (cx - R - 1, cy - R - 1, 2 * R + 2, 2 * R + 2)
    return svg(box, defs, body), box


def puys():
    """La ligne des Puys fournie (source/puys.json), mise à la largeur de l'ouverture, posée sur son bas."""
    if not os.path.exists(PUYS):
        return None, None
    spec = json.load(open(PUYS, encoding="utf-8"))
    (cx, cy), R = rig.HUB_C, rig.HUB_RIN
    vx, vy, vw, vh = spec["viewBox"]
    k = (2 * R * spec.get("width", 1.04)) / vw           # un peu plus large que l'ouverture
    x0 = cx - vw * k / 2
    y0 = cy + R * spec.get("bottom", 1.02) - vh * k      # le bas du tracé au bas de l'ouverture
    layers = spec.get("layers") or [{"d": spec["d"], "fill": spec.get("fill", "#6e3f4c")}]
    defs = [f'<clipPath id="o"><circle cx="{f(cx)}" cy="{f(cy)}" r="{f(R + 0.5)}"/></clipPath>']
    body = "".join(f'<path d="{L["d"]}" fill="{L.get("fill", "#6e3f4c")}"/>' for L in layers)
    body = (f'<g clip-path="url(#o)"><g transform="translate({f(x0)} {f(y0)}) scale({k:.5f}) translate({f(-vx)} {f(-vy)})">'
            f'{body}</g></g>')
    box = (cx - R - 1, cy - R - 1, 2 * R + 2, 2 * R + 2)
    return svg(box, defs, body), box


def anneau(front=False):
    """L'anneau olive : biseau sombre dehors, aplat olive au léger dégradé d'aérographe, filet tilleul dedans.
    front=True : seulement le bas, sous la ligne HUB_POP (devant le bougnat)."""
    (cx, cy) = rig.HUB_C
    Ri, t = rig.HUB_RIN, rig.HUB_RIM
    tb = rig.HUB_BEVEL          # biseau sombre extérieur
    tl = rig.HUB_LIME           # filet tilleul intérieur
    Ro = Ri + t
    pad = tb + 2
    box = (cx - Ro - pad, cy - Ro - pad, 2 * (Ro + pad), 2 * (Ro + pad))
    defs = [
        f'<linearGradient id="a" x1="{f(cx - Ro * .7)}" y1="{f(cy - Ro * .7)}" x2="{f(cx + Ro * .7)}" y2="{f(cy + Ro * .7)}" gradientUnits="userSpaceOnUse">'
        '<stop stop-color="#95a352"/><stop offset=".5" stop-color="#7c8a3a"/><stop offset="1" stop-color="#6a7730"/></linearGradient>',
        f'<linearGradient id="b" x1="{f(cx - Ro * .7)}" y1="{f(cy - Ro * .7)}" x2="{f(cx + Ro * .7)}" y2="{f(cy + Ro * .7)}" gradientUnits="userSpaceOnUse">'
        '<stop stop-color="#5d6a2a"/><stop offset="1" stop-color="#2c3413"/></linearGradient>',
    ]
    ring = lambda r0, r1: circle_d(cx, cy, r1) + circle_d(cx, cy, r0, 0)
    body = (f'<path d="{ring(Ro - 0.3, Ro + tb)}" fill="url(#b)" fill-rule="evenodd"/>'
            f'<path d="{ring(Ri + tl * 0.6, Ro)}" fill="url(#a)" fill-rule="evenodd"/>'
            f'<path d="{ring(Ri - 0.3, Ri + tl)}" fill="#96c124" fill-rule="evenodd"/>')
    if front:
        yp = rig.HUB_POP
        x, y, w, h = box
        defs.append(f'<clipPath id="c"><rect x="{f(x)}" y="{f(yp)}" width="{f(w)}" height="{f(y + h - yp)}"/></clipPath>')
        body = f'<g clip-path="url(#c)">{body}</g>'
        box = (x, yp, w, y + h - yp)
    return svg(box, defs, body), box


def main():
    os.makedirs(OUT, exist_ok=True)
    boxes = {}
    items = [("hublot-fond", fond()), ("hublot-puys", puys()), ("hublot-anneau", anneau()), ("hublot-avant", anneau(True))]
    for name, (s, box) in items:
        path = os.path.join(OUT, name + ".svg")
        if s is None:
            if os.path.exists(path):
                os.remove(path)
            continue
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(s)
        boxes[name] = [round(v, 2) for v in box]
        print(name, len(s), "o", boxes[name])
    json.dump(boxes, open(os.path.join(HERE, "_work", "hublot.json"), "w"), indent=1)
    return boxes


if __name__ == "__main__":
    os.makedirs(os.path.join(HERE, "_work"), exist_ok=True)
    main()
