#!/usr/bin/env python3
"""Rapatrie les polices Google Fonts dans assets/fonts/ (hébergées sur le site : RGPD, aucun appel à Google).

Usage : python tools/fetch-fonts.py
Génère css/fonts.css et télécharge les fichiers .woff2 (sous-ensembles latin + latin étendu)
ainsi que les licences de chaque famille (SIL OFL ; Apache 2.0 pour Ultra).
Titres : Shrikhand ; texte : Instrument Sans ; Ultra et les autres ne servent qu'aux comparaisons (?font=).
"""
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / "assets" / "fonts"
CSS = ROOT / "css" / "fonts.css"
API = (
    "https://fonts.googleapis.com/css2?family=Shrikhand&family=Ultra"
    "&family=Instrument+Sans:ital,wdth,wght@0,75..100,400..700;1,75..100,400..700"
    "&family=Gochi+Hand"
    # polices de comparaison de l'ouverture (?font=alfa | holtwood | bagel), chargées seulement si utilisées
    "&family=Alfa+Slab+One&family=Holtwood+One+SC&family=Bagel+Fat+One"
    "&display=swap"
)
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"
KEEP = {"latin", "latin-ext"}
LICENSES = {
    "shrikhand": "https://raw.githubusercontent.com/google/fonts/main/ofl/shrikhand/OFL.txt",
    "ultra": "https://raw.githubusercontent.com/google/fonts/main/apache/ultra/LICENSE.txt",
    "instrument-sans": "https://raw.githubusercontent.com/google/fonts/main/ofl/instrumentsans/OFL.txt",
    "gochi-hand": "https://raw.githubusercontent.com/google/fonts/main/ofl/gochihand/OFL.txt",
    "alfa-slab-one": "https://raw.githubusercontent.com/google/fonts/main/ofl/alfaslabone/OFL.txt",
    "holtwood-one-sc": "https://raw.githubusercontent.com/google/fonts/main/ofl/holtwoodonesc/OFL.txt",
    "bagel-fat-one": "https://raw.githubusercontent.com/google/fonts/main/ofl/bagelfatone/OFL.txt",
}


def get(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    return data if binary else data.decode("utf-8")


def slug(name):
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def main():
    FONTS.mkdir(parents=True, exist_ok=True)
    css = get(API)
    blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
    out = [
        "/* Polices hébergées sur le site (licences dans assets/fonts/LICENSE-*.txt).",
        "   Généré par tools/fetch-fonts.py : ne pas modifier à la main. */",
        "",
    ]
    total = 0
    seen = set()
    for subset, body in blocks:
        if subset not in KEEP:
            continue
        prop = lambda k: (re.search(rf"{k}:\s*([^;]+);", body) or [None, ""])[1].strip()
        family = prop("font-family").strip("'\"")
        weight = prop("font-weight")
        style = prop("font-style") or "normal"
        stretch = prop("font-stretch")
        rng = prop("unicode-range")
        url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
        name = f"{slug(family)}-{style}-{weight.replace(' ', '-')}-{subset}.woff2"
        if name not in seen:
            data = get(url, binary=True)
            (FONTS / name).write_bytes(data)
            total += len(data)
            seen.add(name)
            print(f"{name:60s} {len(data) // 1024:4d} Ko")
        out += [
            "@font-face {",
            f"  font-family: '{family}';",
            f"  font-style: {style};",
            f"  font-weight: {weight};",
            *( [f"  font-stretch: {stretch};"] if stretch else [] ),
            "  font-display: swap;",
            f"  src: url('../assets/fonts/{name}') format('woff2');",
            f"  unicode-range: {rng};",
            "}",
            "",
        ]
    CSS.write_text("\n".join(out), encoding="utf-8")
    for key, url in LICENSES.items():
        try:
            (FONTS / f"LICENSE-{key}.txt").write_text(get(url), encoding="utf-8")
        except Exception as exc:  # licence introuvable : on le signale sans bloquer
            print(f"Licence {key} non récupérée : {exc}")
    print(f"Total polices : {total // 1024} Ko · {CSS.relative_to(ROOT)} écrit")


if __name__ == "__main__":
    main()
