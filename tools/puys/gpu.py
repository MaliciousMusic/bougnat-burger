# -*- coding: utf-8 -*-
"""Politesse GPU (RTX 3060, 6 Go, partagée avec les autres ateliers du projet) : avant chaque passe SDXL, on
regarde ce que les autres processus tiennent en mémoire (nvidia-smi --query-compute-apps). Sous Windows (WDDM),
la mémoire par processus n'est pas publiée (« N/A ») : on se rabat sur la mémoire totale occupée, moins la nôtre.
Si un autre atelier tient plus d'environ 1 Go (ou calcule), on attend 60 s et on réessaie. Jamais deux pipelines
en même temps : deux SDXL débordent en mémoire partagée et rampent tous les deux."""
import os
import subprocess
import time

LIMIT_MB = 1024          # au-delà, quelqu'un d'autre travaille
PAUSE_S = 60


def _smi(args):
    return subprocess.run(["nvidia-smi"] + args, capture_output=True, text=True).stdout.strip().splitlines()


def _own_mb():
    try:
        import torch
        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return torch.cuda.memory_reserved() / 2 ** 20 + 450  # + le contexte CUDA
    except Exception:
        pass
    return 0.0


def others_mb():
    """Mémoire GPU tenue par les autres processus (Mo), et leur liste."""
    me = os.getpid()
    apps = []
    for line in _smi(["--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"]):
        parts = [p.strip() for p in line.split(",")]
        if len(parts) == 2 and parts[0].isdigit() and int(parts[0]) != me:
            apps.append((int(parts[0]), parts[1]))
    known = [int(m) for _, m in apps if m.isdigit()]
    if known:
        return float(sum(known)), apps
    used, util = (int(v) for v in _smi(["--query-gpu=memory.used,utilization.gpu", "--format=csv,noheader,nounits"])[0].split(","))
    other = used - _own_mb()
    if util > 20 and other > 300:
        other = max(other, LIMIT_MB + 1)   # quelqu'un calcule : on considère le GPU pris
    return float(other), apps


def wait_free(label=""):
    """Bloque tant qu'un autre atelier tient plus de ~1 Go (trois relevés libres d'affilée)."""
    n = 0
    while True:
        ok = 0
        for _ in range(3):
            mb, apps = others_mb()
            if mb > LIMIT_MB:
                break
            ok += 1
            time.sleep(1.0)
        if ok == 3:
            return
        print(f"  GPU tenu par un autre atelier ({mb:.0f} Mo, {len(apps)} processus) — pause {PAUSE_S} s"
              f"{(' : ' + label) if label else ''}", flush=True)
        n += 1
        time.sleep(PAUSE_S)


if __name__ == "__main__":
    print(others_mb())
