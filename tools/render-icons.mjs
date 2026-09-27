// Génère les icônes PNG (écran d'accueil, PWA) à partir de assets/logo/badge.svg (logo officiel), avec Chrome headless.
// Usage : node tools/render-icons.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'icons');
const svg = fs.readFileSync(path.join(ROOT, 'assets', 'logo', 'badge.svg'), 'utf8'); // l'écusson avec les vrais traits de pinceau
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9405;
const profile = path.join(ROOT, 'tools', '.chrome-icons');

// fond crème + badge (icônes classiques) ; fond charbon plein cadre (icône « maskable » d'Android)
const page = (size, maskable) => `<!doctype html><html><body style="margin:0;background:${maskable ? '#2B1A10' : '#F3E6CF'}">
<div style="width:${size}px;height:${size}px;display:grid;place-items:center">
<div style="width:${Math.round(size * (maskable ? 0.9 : 0.84))}px;height:${Math.round(size * (maskable ? 0.9 : 0.84))}px">${svg.replace('<svg ', '<svg width="100%" height="100%" ')}</div></div></body></html>`;

const JOBS = [
  ['apple-touch-icon.png', 180, false],
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
fs.rmSync(profile, { recursive: true, force: true });
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 80 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
for (const [name, size, maskable] of JOBS) {
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(page(size, maskable)).toString('base64') });
  await sleep(500);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, 'base64'));
  console.log('icône', name);
}
ws.close(); proc.kill();
await sleep(800);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier : sans gravité */ }
process.exit(0);
