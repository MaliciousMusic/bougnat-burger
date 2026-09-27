# -*- coding: utf-8 -*-
"""Génère les essais du bougnat (SDXL DreamShaper XL v2 Turbo, local, RTX 3060 6 Go).

Reprise de l'atelier d'images de Pierre Guillaume (tools/imagegen/gen.py, lu, jamais modifié) :
même modèle, même ordonnanceur, même délestage sur le processeur ; ici notre propre bible de style
(affiche de voyage des années 1930, version moderne et raffinée) et nos sorties dans tools/bougnat/_gen/.

Usage : python gen.py jobs/01-essais.json [--only nom1,nom2] [--n 3] [--seeds 5,6,7]
Chaque job : {"name": "...", "prompt": "...", "w": 896, "h": 1152, "seeds": [1, 2, 3], "style": "...", "neg_add": "..."}
Sorties : _gen/<lot>/<nom>_<graine>.png, et une planche _gen/<lot>/_planche_<nom>.jpg.
Le GPU est partagé avec d'autres ateliers : en cas de mémoire saturée, on attend et on réessaie."""
import argparse
import json
import os
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
import torch  # noqa: E402
import gpu  # noqa: E402
from diffusers import StableDiffusionXLPipeline, AutoencoderKL, DPMSolverMultistepScheduler  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "Lykon/dreamshaper-xl-v2-turbo"
VAE = "madebyollin/sdxl-vae-fp16-fix"

# Bible de style : l'affiche de voyage des années 1930 (Broders, Cassandre), en version moderne et raffinée
STYLE = ("1930s French railway travel poster illustration, art deco lithograph in the style of Roger Broders, "
         "flat colour planes with soft airbrushed gradients, strong simple silhouette, crisp clean edges, "
         "refined elegant stylization, matte gouache, limited warm palette, masterpiece poster art")
NEG = ("photo, photograph, photorealistic, 3d render, cgi, cartoon, caricature, anime, comic, chibi, grotesque, ugly, "
       "deformed face, disfigured, bad anatomy, bad hands, extra fingers, missing fingers, fused fingers, extra arms, "
       "text, letters, words, watermark, signature, logo, frame, border, busy background, scenery, "
       "sepia, aged paper, grunge, paper texture, film grain, noise, blurry, lowres, jpeg artifacts")


def load(kind="txt"):
    """kind : 'txt' (texte → image) ou 'img' (image → image, guidé par une maquette en aplats : layout.py)."""
    vae = AutoencoderKL.from_pretrained(VAE, torch_dtype=torch.float16)
    if kind == "img":
        from diffusers import StableDiffusionXLImg2ImgPipeline as P
    else:
        P = StableDiffusionXLPipeline
    pipe = P.from_pretrained(MODEL, vae=vae, torch_dtype=torch.float16, variant="fp16", use_safetensors=True)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True,
                                                             algorithm_type="sde-dpmsolver++")
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def _ids(tok, text):
    return tok(text, add_special_tokens=False, truncation=False).input_ids


def _encode(tok, enc, chunks, device):
    """Chaque tronçon de 75 jetons est encodé à part (BOS + tronçon + EOS + bourrage), puis on les met bout à bout :
    CLIP ne lit que 77 jetons, et la bible de style + le sujet dépassent largement."""
    embs, pooled = [], None
    pad = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
    for c in chunks:
        ids = [tok.bos_token_id] + c + [tok.eos_token_id]
        ids += [pad] * (77 - len(ids))
        out = enc(torch.tensor([ids], device=device), output_hidden_states=True)
        embs.append(out.hidden_states[-2])
        if pooled is None:
            pooled = out[0]
    return torch.cat(embs, 1), pooled


def encode_long(pipe, prompt, neg):
    """Encodage « long » pour SDXL (les deux encodeurs de texte), prompt et négatif à la même longueur."""
    dev = pipe._execution_device
    res = {}
    for key, text in (("pos", prompt), ("neg", neg)):
        res[key] = [_ids(pipe.tokenizer, text), _ids(pipe.tokenizer_2, text)]
    n = max(1, max((len(v) + 74) // 75 for pair in res.values() for v in pair))
    out = {}
    with torch.no_grad():
        for key, (i1, i2) in res.items():
            ch1 = [i1[k * 75:(k + 1) * 75] for k in range(n)]
            ch2 = [i2[k * 75:(k + 1) * 75] for k in range(n)]
            e1, _ = _encode(pipe.tokenizer, pipe.text_encoder, ch1, dev)
            e2, p2 = _encode(pipe.tokenizer_2, pipe.text_encoder_2, ch2, dev)
            out[key] = (torch.cat([e1, e2], -1).to(torch.float16), p2.to(torch.float16))
    return out


def run_one(pipe, prompt, neg, w, h, steps, cfg, seed, tries=20, init=None, strength=0.8):
    """Une image ; si la mémoire du GPU est prise par un autre atelier, on patiente puis on réessaie."""
    for k in range(tries):
        gpu.wait_free(f"graine {seed}")
        try:
            g = torch.Generator("cpu").manual_seed(seed)
            E = encode_long(pipe, prompt, neg)
            kw = dict(prompt_embeds=E["pos"][0], pooled_prompt_embeds=E["pos"][1],
                      negative_prompt_embeds=E["neg"][0], negative_pooled_prompt_embeds=E["neg"][1],
                      num_inference_steps=steps, guidance_scale=cfg, generator=g)
            if init is not None:
                return pipe(image=init, strength=strength, **kw).images[0]
            return pipe(width=w, height=h, **kw).images[0]
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            print(f"  mémoire GPU saturée (essai {k + 1}), on attend 30 s…", flush=True)
            time.sleep(30)
    raise RuntimeError("GPU indisponible")


def sheet(paths, out, H=420):
    from PIL import Image, ImageDraw
    ims = []
    for f in paths:
        im = Image.open(f).convert("RGB")
        k = H / im.height
        im = im.resize((max(1, int(im.width * k)), H), Image.LANCZOS)
        d = ImageDraw.Draw(im)
        d.rectangle((0, 0, 170, 14), fill=(0, 0, 0))
        d.text((3, 1), os.path.basename(f)[:30], fill=(255, 255, 255))
        ims.append(im)
    W = sum(i.width + 6 for i in ims)
    c = Image.new("RGB", (W, H), (30, 30, 30))
    x = 0
    for im in ims:
        c.paste(im, (x, 0))
        x += im.width + 6
    c.save(out, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jobs")
    ap.add_argument("--only", default=None)
    ap.add_argument("--n", type=int, default=None)
    ap.add_argument("--seeds", default=None)
    ap.add_argument("--steps", type=int, default=10)
    ap.add_argument("--cfg", type=float, default=2.6)
    a = ap.parse_args()
    spec = json.load(open(a.jobs, encoding="utf-8"))
    lot = spec.get("lot", os.path.splitext(os.path.basename(a.jobs))[0])
    out = os.path.join(HERE, "_gen", lot)
    os.makedirs(out, exist_ok=True)
    kind = "img" if any(j.get("init") for j in spec["jobs"]) else "txt"
    pipe = load(kind)
    from PIL import Image
    for job in spec["jobs"]:
        if a.only and job["name"] not in a.only.split(","):
            continue
        init = Image.open(os.path.join(HERE, job["init"])).convert("RGB") if job.get("init") else None
        style = job.get("style", spec.get("style", STYLE))
        # le sujet d'abord (le premier tronçon pèse le plus), la bible de style ensuite
        prompt = f"{style}, {job['prompt']}" if job.get("style_first", spec.get("style_first", False)) else f"{job['prompt']}, {style}"
        neg = job.get("neg", spec.get("neg", NEG)) + (", " + job["neg_add"] if job.get("neg_add") else "")
        seeds = [int(s) for s in a.seeds.split(",")] if a.seeds else job.get("seeds", [1, 2, 3])[: a.n or None]
        done = []
        for sd in seeds:
            t0 = time.time()
            img = run_one(pipe, prompt, neg, job.get("w", 896), job.get("h", 1152), job.get("steps", a.steps),
                          job.get("cfg", a.cfg), sd, init=init, strength=job.get("strength", 0.8))
            fn = os.path.join(out, f"{job['name']}_{sd}.png")
            img.save(fn)
            done.append(fn)
            print(f"{fn}  {time.time() - t0:.1f}s", flush=True)
        if done:
            sheet(done, os.path.join(out, f"_planche_{job['name']}.jpg"))
    print("fini", flush=True)


if __name__ == "__main__":
    sys.exit(main())
