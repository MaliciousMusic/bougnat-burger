// Image de partage (Open Graph, 1200 × 630) : l'écusson officiel dans son hublot, le titre, la chaîne des Puys, sur le charbon du site.
// Usage : node tools/render-og.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9408;
const profile = path.join(ROOT, 'tools', '.chrome-og');
const page = path.join(ROOT, 'tools', '.og.html');
const u = (p) => pathToFileURL(path.join(ROOT, p)).href;
fs.writeFileSync(page, `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${u('css/fonts.css')}">
<style>
  body { margin: 0; width: 1200px; height: 630px; overflow: hidden; font-family: 'Instrument Sans', sans-serif; color: #F5EAD4;
    background: radial-gradient(640px 420px at 27% 46%, rgba(242, 180, 140, 0.34), transparent 70%), radial-gradient(900px 400px at 70% 110%, rgba(150, 193, 36, 0.12), transparent 70%), #1A130F; }
  .wrap { position: relative; z-index: 1; display: flex; align-items: center; gap: 60px; height: 100%; padding: 0 84px; box-sizing: border-box; }
  img { width: 400px; height: 400px; border-radius: 50%; box-shadow: 0 0 0 12px #96C124, 0 0 0 16px rgba(0,0,0,.5), 0 40px 60px -20px #000; }
  .k { font-weight: 700; font-size: 22px; letter-spacing: .22em; text-transform: uppercase; color: #96C124; margin: 0 0 18px; }
  h1 { font: 400 96px/0.98 'Shrikhand', Georgia, serif; margin: 0 0 22px; }
  p { font-size: 34px; line-height: 1.25; margin: 0; max-width: 13em; color: #D8C6A8; }
  p b { color: #96C124; font-weight: 700; }
  svg.puys { position: absolute; left: 0; right: 0; bottom: 0; width: 1200px; height: 120px; fill: #0F0B08; }
</style></head><body>
  <svg class="puys" viewBox="0 0 480 60" preserveAspectRatio="none"><path d="M0 60V50C14 48 22 42 34 42S52 47 62 47 80 34 96 33 106 36 110 36 118 34 124 35 142 46 154 46 172 40 182 40 198 44 206 44 236 22 252 16 266 13 272 14 298 36 314 42 330 44 338 42 356 38 366 42 388 45 398 40 418 36 428 41 460 47 480 45V60Z"/><path d="M261.2 14.4V3.2h1.6v11.2z"/></svg>
  <div class="wrap">
  <img src="${u('assets/logo/badge.svg')}" alt="">
  <div><div class="k">Clermont-Ferrand</div><h1>Bougnat<br>Burger</h1><p>Le burger d'Auvergne, <b>depuis 2012</b>.</p></div>
</div></body></html>`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 80 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: pathToFileURL(page).href });
await sleep(1500);
const s = await send('Page.captureScreenshot', { format: 'png' });
fs.mkdirSync(path.join(ROOT, 'assets', 'img'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'assets', 'img', 'og-bougnat.png'), Buffer.from(s.result.data, 'base64'));
console.log('assets/img/og-bougnat.png');
ws.close(); proc.kill();
await sleep(800);
try { fs.rmSync(profile, { recursive: true, force: true }); fs.rmSync(page); } catch { /* sans gravité */ }
process.exit(0);
