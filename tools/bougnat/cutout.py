# -*- coding: utf-8 -*-
"""Détoure une ou plusieurs images (BiRefNet, précis jusqu'aux cheveux) → PNG RGBA + WebP pour le site.

Usage : .venv/Scripts/python.exe cutout.py out/komorebi/sujet_11.png [...] [--dest ../../prototypes/v2/univers/komorebi] [--name sujet]
"""
import argparse, os
os.environ.setdefault("HF_HUB_OFFLINE", "1")
import numpy as np
import torch
from PIL import Image, ImageFilter
from torchvision import transforms
from transformers import AutoModelForImageSegmentation

_model = None
DEV = os.environ.get("CUTOUT_DEVICE", "cuda")


def model():
    global _model
    if _model is None:
        torch.set_float32_matmul_precision("high")
        _model = AutoModelForImageSegmentation.from_pretrained("ZhengPeng7/BiRefNet", trust_remote_code=True)
        _model.to(DEV).eval()
        _model.half() if DEV == "cuda" else _model.float()
    return _model


TF = transforms.Compose([
    transforms.Resize((1024, 1024)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


def cut(path, feather=1.2):
    im = Image.open(path).convert("RGB")
    x = TF(im).unsqueeze(0).to(DEV)
    if DEV == "cuda":
        x = x.half()
    with torch.no_grad():
        pred = model()(x)[-1].sigmoid().float().cpu()[0, 0]
    mask = transforms.functional.to_pil_image(pred).resize(im.size, Image.BICUBIC)
    mask = mask.filter(ImageFilter.MinFilter(3))  # resserre le bord : pas de liseré du fond d'origine
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    out = im.copy()
    out.putalpha(mask)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("images", nargs="+")
    ap.add_argument("--dest", default=None)
    ap.add_argument("--name", default=None)
    ap.add_argument("--max", type=int, default=1600)
    a = ap.parse_args()
    for p in a.images:
        rgba = cut(p)
        base = a.name or os.path.splitext(os.path.basename(p))[0]
        dest = a.dest or os.path.dirname(p)
        os.makedirs(dest, exist_ok=True)
        png = os.path.join(os.path.dirname(p), base + "_cut.png")
        rgba.save(png)
        if a.dest:
            w, h = rgba.size
            k = min(1.0, a.max / max(w, h))
            web = rgba.resize((int(w * k), int(h * k)), Image.LANCZOS) if k < 1 else rgba
            web.save(os.path.join(dest, base + ".webp"), "WEBP", quality=90, method=6)
        print("ok", png)


if __name__ == "__main__":
    main()
