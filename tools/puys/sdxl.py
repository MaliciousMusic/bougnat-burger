# -*- coding: utf-8 -*-
"""Peinture SDXL de la maquette (image → image), en local : DreamShaper XL v2 Turbo, comme l'atelier d'images de
Pierre Guillaume (tools/imagegen/gen.py, lu, jamais modifié) — même modèle, même ordonnanceur, même délestage sur
le processeur ; ici notre bible de style (affiche de voyage des années 1930, moderne et raffinée).

Usage : python tools/puys/sdxl.py [--init _gen/base.png] [--strengths .35,.45] [--seeds 1,2,3] [--lot essai]
                                  [--preset v1|v2] [--cfg 2.6] [--steps 10] [--prompt-add "..."]
Peintures retenues (voir peinture.json) : lot e1 = --preset v1 --strengths 0.35,0.45,0.55 --seeds 1,2 ;
lot e2 = --preset v2 --strengths 0.45,0.55 --seeds 3,4 --cfg 3.2 ; image de départ : source/maquette.jpg.
Sorties : tools/puys/_gen/<lot>/s<force>_<graine>.png et une planche _planche.jpg.
Politesse GPU : gpu.wait_free() avant chaque image (un autre atelier peut peindre en même temps)."""
import argparse
import os
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gpu  # noqa: E402

MODEL = "Lykon/dreamshaper-xl-v2-turbo"
VAE = "madebyollin/sdxl-vae-fp16-fix"

PRESETS = {
    # v1 : premier essai (lot e1) — aplats d'affiche
    "v1": dict(
        prompt=("vintage 1930s French railway travel poster of the Puy de Dome volcano at sunset, Auvergne, Chaine des Puys, "
                "rounded olive green volcano with a TV mast on the summit, warm golden rim light on the right slopes, "
                "dark forests on the lower slopes, distant lavender blue volcanoes, pastel green meadows with hedgerows and "
                "small round trees casting long shadows, winding footpath, dark foreground hill, calm dusk"),
        style=("art deco lithograph poster in the style of Roger Broders and Cassandre, flat colour planes with soft "
               "airbrushed gradients, clean crisp edges, refined elegant stylization, fine detail, matte gouache, "
               "harmonious muted palette, masterpiece poster art"),
        neg=("text, letters, words, typography, title, watermark, signature, logo, frame, border, margin, photo, photograph, "
             "photorealistic, 3d render, cgi, people, animals, houses, village, castle, snow, glacier, alpine peaks, "
             "neon green, lime green, oversaturated, sepia, grunge, paper texture, film grain, noise, speckles, dots, "
             "blurry, lowres, jpeg artifacts")),
    # v2 : plus de détail (lot e2) — gouache, canopée, bocage
    "v2": dict(
        prompt=("highly detailed vintage travel poster painting of the Puy de Dome volcano at sunset, Auvergne, France, "
                "grassy olive green volcanic cone with shallow gullies, a thin rack railway line winding up the slope, "
                "slender TV mast and small observatory on the summit, golden rim light on the right slopes, "
                "dense beech and fir forest canopy on the lower slopes with individually painted tree crowns lit on one side, "
                "distant lavender blue rounded volcanoes of the Chaine des Puys, patchwork of pastel green meadows and hay "
                "fields with hedgerows, scattered small trees with long evening shadows, winding dirt footpath, "
                "dark grassy foreground bank"),
        style=("gouache and airbrush illustration in the style of Roger Broders and Cassandre, 1930s art deco railway poster, "
               "crisp shapes, subtle soft gradients, intricate fine detail, calm refined harmonious palette, masterpiece"),
        neg=("text, letters, words, typography, title, watermark, signature, logo, frame, border, margin, photo, photograph, "
             "photorealistic, 3d render, cgi, people, animals, houses, village, castle, snow, glacier, alpine peaks, sharp peaks, "
             "jagged mountains, torch, flame, fire, smoke, minimalist, simple, plain, empty, flat vector, cartoon, "
             "neon green, lime green, oversaturated, sepia, grunge, paper texture, film grain, noise, speckles, dots, "
             "blurry, lowres, jpeg artifacts")),
}


def load():
    import torch
    from diffusers import StableDiffusionXLImg2ImgPipeline, AutoencoderKL, DPMSolverMultistepScheduler
    vae = AutoencoderKL.from_pretrained(VAE, torch_dtype=torch.float16)
    pipe = StableDiffusionXLImg2ImgPipeline.from_pretrained(MODEL, vae=vae, torch_dtype=torch.float16, variant="fp16",
                                                            use_safetensors=True)
    pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True,
                                                             algorithm_type="sde-dpmsolver++")
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    pipe.set_progress_bar_config(disable=True)
    return pipe


def _encode(tok, enc, chunks, device):
    """Chaque tronçon de 75 jetons est encodé à part puis mis bout à bout (CLIP ne lit que 77 jetons)."""
    import torch
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
    """Encodage « long » (les deux encodeurs de SDXL), prompt et négatif à la même longueur."""
    import torch
    dev = pipe._execution_device
    ids = {k: [pipe.tokenizer(t, add_special_tokens=False, truncation=False).input_ids,
               pipe.tokenizer_2(t, add_special_tokens=False, truncation=False).input_ids]
           for k, t in (("pos", prompt), ("neg", neg))}
    n = max(1, max((len(v) + 74) // 75 for pair in ids.values() for v in pair))
    out = {}
    with torch.no_grad():
        for key, (i1, i2) in ids.items():
            e1, _ = _encode(pipe.tokenizer, pipe.text_encoder, [i1[k * 75:(k + 1) * 75] for k in range(n)], dev)
            e2, p2 = _encode(pipe.tokenizer_2, pipe.text_encoder_2, [i2[k * 75:(k + 1) * 75] for k in range(n)], dev)
            out[key] = (torch.cat([e1, e2], -1).to(torch.float16), p2.to(torch.float16))
    return out


def run_one(pipe, init, prompt, neg, strength, steps, cfg, seed, tries=30):
    import torch
    for k in range(tries):
        gpu.wait_free(f"graine {seed}")
        try:
            g = torch.Generator("cpu").manual_seed(seed)
            E = encode_long(pipe, prompt, neg)
            return pipe(image=init, strength=strength, prompt_embeds=E["pos"][0], pooled_prompt_embeds=E["pos"][1],
                        negative_prompt_embeds=E["neg"][0], negative_pooled_prompt_embeds=E["neg"][1],
                        num_inference_steps=steps, guidance_scale=cfg, generator=g).images[0]
        except torch.cuda.OutOfMemoryError:
            torch.cuda.empty_cache()
            print(f"  mémoire GPU saturée (essai {k + 1}), pause 60 s", flush=True)
            time.sleep(60)
    raise RuntimeError("GPU indisponible")


def sheet(paths, out, H=300):
    from PIL import Image, ImageDraw
    ims = []
    for f in paths:
        im = Image.open(f).convert("RGB")
        im = im.resize((int(im.width * H / im.height), H), Image.LANCZOS)
        ImageDraw.Draw(im).text((4, 2), os.path.basename(f), fill=(255, 255, 255))
        ims.append(im)
    cols = 3
    rows = (len(ims) + cols - 1) // cols
    W = max(i.width for i in ims)
    c = Image.new("RGB", (cols * (W + 4), rows * (H + 4)), (30, 30, 30))
    for i, im in enumerate(ims):
        c.paste(im, ((i % cols) * (W + 4), (i // cols) * (H + 4)))
    c.save(out, quality=88)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--init", default=os.path.join(HERE, "_gen", "base.png"))
    ap.add_argument("--strengths", default="0.4,0.5")
    ap.add_argument("--seeds", default="1,2")
    ap.add_argument("--lot", default="essai")
    ap.add_argument("--steps", type=int, default=10)
    ap.add_argument("--cfg", type=float, default=2.6)
    ap.add_argument("--prompt-add", default="")
    ap.add_argument("--size", default="1536x1024")
    ap.add_argument("--preset", default="v2", choices=sorted(PRESETS))
    a = ap.parse_args()
    from PIL import Image
    W, H = (int(v) for v in a.size.split("x"))
    init = Image.open(a.init).convert("RGB").resize((W, H), Image.LANCZOS)
    out = os.path.join(HERE, "_gen", a.lot)
    os.makedirs(out, exist_ok=True)
    gpu.wait_free("chargement")
    pipe = load()
    P = PRESETS[a.preset]
    prompt = P["prompt"] + (", " + a.prompt_add if a.prompt_add else "") + ", " + P["style"]
    done = []
    for st in (float(v) for v in a.strengths.split(",")):
        for sd in (int(v) for v in a.seeds.split(",")):
            t0 = time.time()
            img = run_one(pipe, init, prompt, P["neg"], st, a.steps, a.cfg, sd)
            fn = os.path.join(out, f"s{int(round(st * 100)):02d}_{sd}.png")
            img.save(fn)
            done.append(fn)
            print(f"{fn}  {time.time() - t0:.1f}s", flush=True)
    sheet(done, os.path.join(out, "_planche.jpg"))
    print("fini", flush=True)


if __name__ == "__main__":
    sys.exit(main())
