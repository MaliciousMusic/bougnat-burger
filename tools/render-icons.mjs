// L'icône de l'appli (écran d'accueil du téléphone, PWA) : leur logo tel quel, « BOUGNAT » courbé au-dessus et
// « BURGER » au-dessous, comme à l'ouverture (Shrikhand, crème imprimé sur une ombre olive), sur le charbon.
// Écrit les PNG (assets/icons/), assets/logo/icone-app.svg (source, police en @font-face) et assets/icons/favicon.svg
// (le volcan seul : les mots seraient illisibles dans un onglet). Chrome sans tête.
// Usage : node tools/render-icons.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'icons');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const fontUrl = pathToFileURL(path.join(ROOT, 'assets', 'fonts', 'shrikhand-normal-400-latin.woff2')).href;
const logoUrl = pathToFileURL(path.join(ROOT, 'js', 'bb-logo.js')).href;

// la page qui dessine l'icône (repère 400 de l'écusson de l'ouverture, ramené sur 512)
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'Shrikhand'; src: url('${fontUrl}') format('woff2'); }
html, body { margin: 0; background: #1A130F; }
</style></head><body><svg id="ic" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"></svg>
<script src="${logoUrl}"></script>
<script>
window.dessiner = async function (k) {
  await document.fonts.load("44px 'Shrikhand'");
  const L = BB.LOGO, NS = 'http://www.w3.org/2000/svg', svg = document.getElementById('ic');
  const S = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); parent.appendChild(e); return e; };
  const f = (n) => Math.round(n * 100) / 100;
  svg.innerHTML = '<defs><radialGradient id="fond" cx=".5" cy=".42" r=".76"><stop offset="0" stop-color="#3A271B"/><stop offset=".62" stop-color="#1D140F"/><stop offset="1" stop-color="#110C09"/></radialGradient></defs>'
    + '<rect width="512" height="512" fill="url(#fond)"/>';
  const CX = 200, CY = 200, R_WORDS = 124, VOLCANO_W = 212;
  const font = { family: 'Shrikhand', size: 44, spacing: 1.8, cap: 0.74 };
  const g = S('g', { transform: 'translate(256 256) scale(' + (1.3 * k) + ') translate(-200 -200)' }, svg);
  // le filet pointillé et les deux losanges verts entre les mots, comme à l'ouverture
  S('circle', { cx: CX, cy: CY, r: R_WORDS - 10, fill: 'none', stroke: '#FBF4E6', 'stroke-opacity': 0.16, 'stroke-width': 1.4, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, g);
  [-1, 1].forEach((side) => { const x = CX + side * (R_WORDS + 18), y = CY; S('path', { d: 'M' + x + ' ' + (y - 7) + 'L' + (x + 6) + ' ' + y + 'L' + x + ' ' + (y + 7) + 'L' + (x - 6) + ' ' + y + 'Z', fill: L.green }, g); });
  // le volcan, tel quel
  const s = VOLCANO_W / L.w, vh = L.h * s, vx = CX - VOLCANO_W / 2, vy = CY - vh / 2 + 6;
  const vol = S('g', { transform: 'translate(' + f(vx) + ' ' + f(vy) + ') scale(' + f(s * 1000) / 1000 + ')' }, g);
  S('path', { d: L.dGreen, fill: L.green, 'fill-rule': 'evenodd' }, vol);
  S('path', { d: L.dWhite, fill: '#FFFFFF', 'fill-rule': 'evenodd' }, vol);
  // les mots, lettre par lettre sur l'arc (même calcul que js/bb-splash.js)
  const measure = S('text', { x: -999, y: -999, 'font-family': "'Shrikhand'", 'font-size': font.size }, svg);
  const widthOf = (ch) => { measure.textContent = ch; return measure.getComputedTextLength() || font.size * 0.7; };
  const cap = font.size * font.cap;
  function place(word, top) {
    const ws = [...word].map(widthOf);
    const R = top ? R_WORDS : R_WORDS + cap, Rm = top ? R + cap * 0.35 : R - cap * 0.35;
    const total = ws.reduce((a, b) => a + b, 0) + font.spacing * (ws.length - 1);
    let acc = -total / 2;
    [...word].forEach((ch, i) => {
      const mid = acc + ws[i] / 2;
      acc += ws[i] + font.spacing;
      const th = mid / Rm;
      const x = CX + R * Math.sin(th), y = top ? CY - R * Math.cos(th) : CY + R * Math.cos(th);
      const rot = top ? (th * 180) / Math.PI : (-th * 180) / Math.PI;
      const lg = S('g', { transform: 'translate(' + f(x) + ' ' + f(y) + ') rotate(' + f(rot) + ')' }, g);
      const attrs = { 'text-anchor': 'middle', 'font-family': "'Shrikhand', Georgia, serif", 'font-size': font.size };
      S('text', Object.assign({}, attrs, { x: 2, y: 2.6, fill: '#7C8A3A' }), lg).textContent = ch; // l'impression en deux couleurs : olive…
      S('text', Object.assign({}, attrs, { fill: '#FBF4E6' }), lg).textContent = ch;                // … et crème
    });
  }
  place('BOUGNAT', true);
  place('BURGER', false);
  measure.remove();
  return svg.outerHTML;
};
</script></body></html>`;

const tmp = path.join(ROOT, 'tools', '.icone-rendu.html');
fs.writeFileSync(tmp, PAGE);
const JOBS = [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.9], // tout dans le cercle de sécurité (80 %) du masque d'Android
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 90);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-icones-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 200 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result && r.result.result ? r.result.result.value : null; };
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: pathToFileURL(tmp).href });
await sleep(1200);
let source = null;
for (const [name, size, k] of JOBS) {
  const svg = await ev(`dessiner(${k})`);
  if (!source && k === 1) source = svg;
  await ev(`(() => { const s = document.getElementById('ic'); s.setAttribute('width', ${size}); s.setAttribute('height', ${size}); })()`);
  await send('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  const s = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  fs.writeFileSync(path.join(OUT, name), Buffer.from(s.result.data, 'base64'));
  console.log('icône', name);
}
// la source vectorielle (les lettres restent du texte : la police vient de assets/fonts/)
fs.writeFileSync(path.join(ROOT, 'assets', 'logo', 'icone-app.svg'), source
  .replace(/ width="\d+" height="\d+"/, '')
  .replace(' id="ic"', '')
  .replace('<defs>', `<defs><style>@font-face { font-family: 'Shrikhand'; src: url('../fonts/shrikhand-normal-400-latin.woff2') format('woff2'); }</style>`));
// l'onglet du navigateur : le volcan seul, sur un rond charbon
const L = JSON.parse(fs.readFileSync(path.join(ROOT, 'js', 'bb-logo.js'), 'utf8').match(/BB\.LOGO = (\{.*\});?/s)[1]);
const sc = 380 / L.w;
fs.writeFileSync(path.join(OUT, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="252" fill="#1D140F"/>`
  + `<g transform="translate(${(512 - 380) / 2} ${(512 - L.h * sc) / 2 + 8}) scale(${Math.round(sc * 1000) / 1000})"><path d="${L.dGreen}" fill="${L.green}" fill-rule="evenodd"/><path d="${L.dWhite}" fill="#FFFFFF" fill-rule="evenodd"/></g></svg>`);
ws.close(); proc.kill();
await sleep(800);
fs.rmSync(tmp, { force: true });
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome tient encore le dossier : sans gravité */ }
process.exit(0);
