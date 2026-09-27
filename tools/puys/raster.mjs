// Rastérise des SVG avec Chrome sans interface (CDP) : node raster.mjs <entrée.svg> <sortie.png> <largeur> <hauteur> [...]
// (plusieurs quadruplets possibles à la suite). Fond transparent conservé (PNG avec alpha).
// Port CDP : $PUYS_CDP_PORT (9417 par défaut) ; profil Chrome : $PUYS_CHROME_PROFILE (sinon un dossier temporaire).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.length < 4 || args.length % 4) { console.error('usage : node raster.mjs in.svg out.png W H [...]'); process.exit(1); }
const port = +(process.env.PUYS_CDP_PORT || 9417);
const prof = process.env.PUYS_CHROME_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'puys-chrome-'));
const chrome = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run',
  '--hide-scrollbars', '--allow-file-access-from-files', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 160 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
if (!target) { console.error('Chrome ne répond pas'); process.exit(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
for (let k = 0; k < args.length; k += 4) {
  const [inp, out, W, H] = [path.resolve(args[k]), path.resolve(args[k + 1]), +args[k + 2], +args[k + 3]];
  const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}img{display:block;width:${W}px;height:${H}px}</style></head>` +
    `<body><img src="${pathToFileURL(inp).href}"></body></html>`;
  const tmp = out + '.html';
  fs.writeFileSync(tmp, html);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send('Page.navigate', { url: pathToFileURL(tmp).href });
  await sleep(400);
  await send('Runtime.evaluate', { expression: 'new Promise(r => { const i = document.images[0]; (i.complete ? Promise.resolve() : new Promise(q => i.onload = q)).then(() => i.decode()).then(() => requestAnimationFrame(() => requestAnimationFrame(r))); })', awaitPromise: true });
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: W, height: H, scale: 1 } });
  fs.writeFileSync(out, Buffer.from(s.result.data, 'base64'));
  fs.rmSync(tmp, { force: true });
  console.log('ok', path.basename(out));
}
ws.close(); proc.kill(); await sleep(500);
if (!process.env.PUYS_CHROME_PROFILE) { try { fs.rmSync(prof, { recursive: true, force: true }); } catch { /* verrou Windows */ } }
process.exit(0);
