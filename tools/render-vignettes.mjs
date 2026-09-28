#!/usr/bin/env node
// Les vignettes de la carte, calculées une fois pour toutes : le moteur (bb-burger.js, bb-plat.js) compose chaque plat
// dans Chrome sans tête et on garde son image figée, en WebP, dans assets/img/vignettes/. Le téléphone n'a plus rien
// à cuire ni à animer en faisant défiler la carte ; le moteur ne sert plus qu'au grand format de la fiche.
// Écrit aussi js/bb-vignettes.js (BB.VIGNETTES : id → fichier). À relancer après un changement de dessin.
// Usage : node tools/render-vignettes.mjs   (Python + Pillow pour le WebP)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'img', 'vignettes');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-vignettes-'));
const port = 9300 + Math.floor(Math.random() * 90);
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profil')}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 200 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
// téléphone large (430 px), densité 2 ; mouvement réduit : chaque carte se fige d'emblée, sans composition ;
// ?cuire : la page ignore les vignettes déjà faites et fait travailler le moteur
await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 932, deviceScaleFactor: 2, mobile: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: "try{sessionStorage.setItem('bb:intro','1')}catch(e){}" });
await send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'index.html')).href + '?cuire#carte' });
await sleep(3000);
// on descend toute la carte pour que chaque vignette se monte et se fige
for (let k = 0; k < 60; k++) {
  const fini = await ev(`(() => { const sc = document.getElementById('carte-scroll'); sc.scrollTop += 420;
    const v = [...document.querySelectorAll('#menu .bcard .vis')]; return { n: v.length, figees: v.filter((x) => x.querySelector('img.bb-still')).length, bas: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4 }; })()`);
  await sleep(900);
  if (fini && fini.bas && fini.figees === fini.n) break;
}
for (let k = 0; k < 40; k++) {
  const r = await ev(`(() => { const v = [...document.querySelectorAll('#menu .bcard .vis')]; return [v.length, v.filter((x) => { const i = x.querySelector('img.bb-still'); return i && i.complete && i.naturalWidth; }).length]; })()`);
  if (r && r[0] === r[1]) break;
  await ev(`(() => { const sc = document.getElementById('carte-scroll'); sc.scrollTop = sc.scrollTop === 0 ? sc.scrollHeight : 0; })()`);
  await sleep(1000);
}
const images = await ev(`(async () => {
  const out = {};
  for (const v of document.querySelectorAll('#menu .bcard .vis')) {
    const img = v.querySelector('img.bb-still');
    if (!img) continue;
    const b = await (await fetch(img.src)).blob();
    out[v.dataset.id] = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(b); });
  }
  return out;
})()`);
ws.close(); proc.kill();
const ids = Object.keys(images || {});
console.log(ids.length + ' vignettes figées');
for (const id of ids) fs.writeFileSync(path.join(tmp, id + '.png'), Buffer.from(images[id].split(',')[1], 'base64'));
// en WebP (transparence gardée), avec Pillow
execFileSync('python', ['-c', `
import sys, os
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
tot = 0
for f in sorted(os.listdir(src)):
    if not f.endswith('.png'): continue
    im = Image.open(os.path.join(src, f)).convert('RGBA')
    bb = im.getbbox()
    out = os.path.join(dst, f[:-4] + '.webp')
    im.save(out, 'WEBP', quality=84, method=6)
    tot += os.path.getsize(out)
print('WebP :', tot // 1024, 'Ko au total')
`, tmp, OUT], { stdio: 'inherit' });
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const manifest = `/* Bougnat Burger — les vignettes de la carte, calculées d'avance (tools/render-vignettes.mjs) : id → image.
   Sans ce fichier (ou avec ?cuire dans l'adresse), les vignettes sont composées dans le navigateur par le moteur. */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  if (/[?&]cuire\\b/.test(location.search)) return;
  BB.VIGNETTES = {
${ids.sort().map((id) => `    '${id}': 'assets/img/vignettes/${id}.webp?v=${stamp}',`).join('\n')}
  };
})();
`;
fs.writeFileSync(path.join(ROOT, 'js', 'bb-vignettes.js'), manifest);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier */ }
console.log('js/bb-vignettes.js écrit');
process.exit(0);
