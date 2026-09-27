# -*- coding: utf-8 -*-
"""Le GPU (RTX 3060, 6 Go) est partagé avec d'autres ateliers du projet : avant chaque image, on attend qu'il soit
libre (personne ne calcule, et la mémoire n'est pas tenue par un autre processus). Sous Windows, deux modèles SDXL
en même temps ne plantent pas : ils débordent en mémoire partagée et rampent tous les deux. On passe donc chacun
son tour."""
import subprocess
import time


def _sample():
    out = subprocess.run(["nvidia-smi", "--query-gpu=memory.used,utilization.gpu", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True).stdout.strip().splitlines()[0]
    mem, util = (int(v) for v in out.split(","))
    return mem, util


def _own_mb():
    try:
        import torch
        if torch.cuda.is_available() and torch.cuda.is_initialized():
            return torch.cuda.memory_reserved() / 2 ** 20 + 450  # + le contexte CUDA
    except Exception:
        pass
    return 0


def _apps():
    """Processus qui tiennent un contexte CUDA (sous Windows/WDDM, leur mémoire s'affiche « [N/A] » : on ne peut
    alors juger que sur la mémoire totale, moins la nôtre)."""
    out = subprocess.run(["nvidia-smi", "--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"],
                         capture_output=True, text=True).stdout.strip().splitlines()
    apps = []
    for line in out:
        pid, mem = (v.strip() for v in line.split(","))
        apps.append((int(pid), None if not mem.isdigit() else int(mem)))
    return apps


def busy(max_other_mb=1000, max_util=12):
    """Règle du projet : un autre processus qui tient plus d'environ 1 Go de mémoire vidéo, ou qui calcule → occupé."""
    import os
    me = os.getpid()
    others = [m for pid, m in _apps() if pid != me]
    if any(m is not None and m > max_other_mb for m in others):
        return True
    mem, util = _sample()
    return util > max_util or (mem - _own_mb() - 180) > max_other_mb   # 180 Mo : le contexte du serveur d'images au repos


def wait_free(label=""):
    """Bloque tant qu'un autre atelier se sert du GPU (trois relevés libres d'affilée, à une seconde d'écart) ;
    sinon on réessaie toutes les 60 s. Jamais deux pipelines en même temps."""
    n = 0
    while True:
        free = 0
        for _ in range(3):
            if busy():
                break
            free += 1
            time.sleep(1.0)
        if free == 3:
            return
        mem, util = _sample()
        print(f"  GPU occupé ailleurs ({mem} Mo, {util} %) — on attend 60 s{(' : ' + label) if label else ''}…", flush=True)
        n += 1
        time.sleep(60)
