# -*- coding: utf-8 -*-
"""Repeints SDXL sur l'image de base du bougnat (même modèle local que gen.py, hors ligne) : les zones cachées
(le haut du crâne sous la casquette, la lèvre sous la moustache…) et les variantes de geste (la main qui soulève
la casquette, le poing qui tient le tampon), peintes dans le même style puisque tout le reste du tableau est gardé.
Adapté de tools/film/girl/inpaint_sd.py.

Usage : python inpaint.py <job> [graine …]        → _gen/inpaint/<job>_<graine>.png + planche
        python inpaint.py <job> --pick <graine>   → source/<job>.png (la version retenue, au format de la base)
Les jobs sont dans jobs/inpaint.json : {"<job>": {"box": [x0, y0, x1, y1], "mask": [[x, y], …] ou [[[x, y], …], …],
"prompt": "...", "neg": "...", "strength": .95, "steps": 10, "cfg": 3, "src": "base"}} (repère : pixels de la base).
"""
import json
import os
import sys

os.environ.setdefault("HF_HUB_OFFLINE", "1")
import numpy as np  # noqa: E402
import cv2  # noqa: E402
from PIL import Image  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gpu  # noqa: E402

SRC = os.path.join(HERE, "source")
OUT = os.path.join(HERE, "_gen", "inpaint")
MODEL = "Lykon/dreamshaper-xl-v2-turbo"
VAE = "madebyollin/sdxl-vae-fp16-fix"
STYLE = ("modern art deco poster illustration in the style of Mads Berg and Roger Broders, bold flat shapes, "
         "smooth airbrush gradients, clean vector edges, refined and charming, warm muted palette")
NEG = ("photo, photorealistic, 3d render, cartoon, caricature, grotesque, deformed, bad anatomy, bad hands, extra fingers, "
       "missing fingers, fused fingers, text, letters, watermark, frame, border, neon green, lime green, blurry, noise")


def load():
    import torch
    from diffusers import StableDiffusionXLInpaintPipeline, AutoencoderKL, DPMSolverMultistepScheduler
    vae = AutoencoderKL.from_pretrained(VAE, torch_dtype=torch.float16)
    pipe = StableDiffusionXLInpaintPipeline.from_pretrained(MODEL, vae=vae, torch_dtype=torch.float16, variant="fp16",
                                                            use_safetensors=True)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True,
                                                             algorithm_type="sde-dpmsolver++")
    pipe.enable_model_cpu_offload()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def polys_mask(shape, mask):
    m = np.zeros(shape, np.uint8)
    polys = mask if isinstance(mask[0][0], (list, tuple)) else [mask]
    for p in polys:
        cv2.fillPoly(m, [np.round(np.array(p, np.float64)).astype(np.int32)], 255, cv2.LINE_AA)
    return m.astype(np.float32) / 255.0


def job_inputs(J):
    base = np.asarray(Image.open(os.path.join(SRC, J.get("src", "base") + ".png")).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = J["box"]
    crop = base[y0:y1, x0:x1]
    m = polys_mask(base.shape[:2], J["mask"])[y0:y1, x0:x1]
    # le cadre est agrandi à ~1 Mpx (multiple de 8) : SDXL peint mieux à sa résolution native
    k = (1024 * 1024 / ((x1 - x0) * (y1 - y0))) ** 0.5
    W, H = int(round((x1 - x0) * k / 8) * 8), int(round((y1 - y0) * k / 8) * 8)
    img = Image.fromarray(np.clip(cv2.resize(crop, (W, H), interpolation=cv2.INTER_CUBIC), 0, 255).astype(np.uint8))
    mk = cv2.GaussianBlur(cv2.resize(m, (W, H), interpolation=cv2.INTER_LINEAR), (0, 0), J.get("feather", 6))
    mask = Image.fromarray(np.clip(mk * 255 * 1.4, 0, 255).astype(np.uint8))
    return base, img, mask


def run(names, seeds):
    """names : un ou plusieurs jobs (séparés par des virgules) ; le modèle n'est chargé qu'une fois."""
    gpu.wait_free(names)
    pipe = load()
    for name in names.split(","):
        run_job(pipe, name, seeds)


def run_job(pipe, name, seeds):
    import torch
    from gen import encode_long
    J = json.load(open(os.path.join(HERE, "jobs", "inpaint.json"), encoding="utf-8"))[name]
    os.makedirs(OUT, exist_ok=True)
    base, img, mask = job_inputs(J)
    prompt = J["prompt"] + ", " + J.get("style", STYLE)
    neg = J.get("neg_base", NEG) + (", " + J["neg"] if J.get("neg") else "")
    thumbs = [np.asarray(img)]
    for sd in seeds:
        gpu.wait_free(f"{name} {sd}")
        g = torch.Generator("cpu").manual_seed(sd)
        E = encode_long(pipe, prompt, neg)
        res = pipe(prompt_embeds=E["pos"][0], pooled_prompt_embeds=E["pos"][1], negative_prompt_embeds=E["neg"][0],
                   negative_pooled_prompt_embeds=E["neg"][1], image=img, mask_image=mask, width=img.width, height=img.height,
                   strength=J.get("strength", 0.95), num_inference_steps=J.get("steps", 10), guidance_scale=J.get("cfg", 3.0),
                   generator=g).images[0]
        fn = os.path.join(OUT, f"{name}_{sd}.png")
        res.save(fn)
        thumbs.append(np.asarray(res))
        print("ok", fn, flush=True)
    h = 520
    sheet = np.concatenate([cv2.resize(t, (int(t.shape[1] * h / t.shape[0]), h), interpolation=cv2.INTER_AREA) for t in thumbs], 1)
    Image.fromarray(sheet).save(os.path.join(OUT, f"{name}_planche.jpg"), quality=88)


def pick(name, seed):
    """Recolle la version retenue dans l'image de base (même cadre, bord du masque fondu) : source/<job>.png."""
    J = json.load(open(os.path.join(HERE, "jobs", "inpaint.json"), encoding="utf-8"))[name]
    base = np.asarray(Image.open(os.path.join(SRC, J.get("src", "base") + ".png")).convert("RGB")).astype(np.float32)
    x0, y0, x1, y1 = J["box"]
    res = np.asarray(Image.open(os.path.join(OUT, f"{name}_{seed}.png")).convert("RGB")).astype(np.float32)
    small = cv2.resize(res, (x1 - x0, y1 - y0), interpolation=cv2.INTER_AREA)
    m = polys_mask(base.shape[:2], J["mask"])[y0:y1, x0:x1]
    m = np.clip(cv2.GaussianBlur(m, (0, 0), 2.0) * 1.6, 0, 1)[..., None]
    out = base.copy()
    out[y0:y1, x0:x1] = base[y0:y1, x0:x1] * (1 - m) + small * m
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(os.path.join(SRC, f"{name}.png"))
    print("retenu", name, seed, flush=True)


if __name__ == "__main__":
    nm = sys.argv[1]
    if len(sys.argv) > 3 and sys.argv[2] == "--pick":
        pick(nm, int(sys.argv[3]))
    else:
        run(nm, [int(s) for s in sys.argv[2:]] or [1, 2, 3, 4])
