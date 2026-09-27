// Captures et mesures du bougnat dans Chrome sans tête, piloté par le protocole DevTools (CDP).
// Usage :
//   node tools/bougnat/capture.mjs --out <dossier> shot <nom> <url relative au projet> [largeur hauteur dpr]
//   node tools/bougnat/capture.mjs --out <dossier> batch <fichier.json>     ([{name, url, w, h, dpr, wait}] )
//   node tools/bougnat/capture.mjs --out <dossier> perf <url> [secondes] [ralentissement CPU]
// Port 9413 et profil jetable dans le dossier de sortie (les autres ateliers utilisent 9401–9412).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9413;
const args = process.argv.slice(2);
let out = path.join(ROOT, 'tools', 'bougnat', '_work', 'captures');
if (args[0] === '--out') { out = path.resolve(args[1]); args.splice(0, 2); }
fs.mkdirSync(out, { recursive: true });
const profile = path.join(out, '.chrome-profile');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urlOf = (u) => (/^(file|https?):/.test(u) ? u : pathToFileURL(path.join(ROOT, u.split('?')[0])).href + (u.includes('?') ? '?' + u.split('?').slice(1).join('?') : ''));

const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run',
  '--hide-scrollbars', '--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 80 && !target; i++) {
  try { target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); }
}
if (!target) { console.error('Chrome ne répond pas sur le port', PORT); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const listeners = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } else if (m.method) listeners.forEach((fn) => fn(m));
};
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable');
await send('Runtime.enable');
const logs = [];
listeners.push((m) => {
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
});
const evalJS = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

async function open(url, w = 800, h = 800, dpr = 1) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  await send('Page.navigate', { url: urlOf(url) });
  for (let i = 0; i < 120; i++) { if (await evalJS('!!window.__ready')) break; await sleep(100); }
  await sleep(250);
}

async function shot(name, url, w = 800, h = 800, dpr = 1, wait = 0, full = true) {
  await open(url, w, h, dpr);
  if (wait) await sleep(wait);
  let clip;
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    const cs = m.result.cssContentSize || m.result.contentSize;
    clip = { x: 0, y: 0, width: Math.max(w, Math.ceil(cs.width)), height: Math.max(1, Math.ceil(cs.height)), scale: 1 };
  }
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!full, ...(clip ? { clip } : {}) });
  const file = path.join(out, name + '.png');
  fs.writeFileSync(file, Buffer.from(s.result.data, 'base64'));
  console.log(file);
}

// Mesure : temps du fil principal par image (script, style, mise en page, peinture), sur une animation qui tourne.
async function perf(url, secs = 6, rate = 1) {
  await open(url, 800, 900, 1);
  await send('Emulation.setCPUThrottlingRate', { rate: +rate });
  await send('Performance.enable');
  await evalJS('window.__perf && window.__perf.start()');
  // trace : on compte les peintures et les recalculs pendant la lecture
  const cats = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'];
  const events = [];
  listeners.push((m) => { if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); });
  await sleep(600);
  const m0 = (await send('Performance.getMetrics')).result.metrics;
  await send('Tracing.start', { categories: cats.join(','), transferMode: 'ReportEvents' });
  const f0 = await evalJS('window.__perf ? window.__perf.frames : 0');
  await sleep(secs * 1000);
  const f1 = await evalJS('window.__perf ? window.__perf.frames : 0');
  const m1 = (await send('Performance.getMetrics')).result.metrics;
  const done = new Promise((r) => listeners.push((m) => { if (m.method === 'Tracing.tracingComplete') r(); }));
  await send('Tracing.end');
  await done;
  const js = await evalJS('window.__perf ? window.__perf.report() : null');
  const get = (ms, k) => (ms.find((x) => x.name === k) || { value: 0 }).value;
  const frames = Math.max(1, f1 - f0);
  const per = (k) => ((get(m1, k) - get(m0, k)) * 1000 / frames).toFixed(3);
  const count = (n) => events.filter((e) => e.name === n).length;
  const dur = (n) => events.filter((e) => e.name === n && e.dur).reduce((a, e) => a + e.dur, 0) / 1000;
  const res = {
    url, rate, frames, fps: +(frames / secs).toFixed(1),
    main_ms_per_frame: { task: per('TaskDuration'), script: per('ScriptDuration'), style: per('RecalcStyleDuration'), layout: per('LayoutDuration') },
    trace: { Paint: count('Paint'), PaintMs: +dur('Paint').toFixed(2), Layout: count('Layout'), UpdateLayoutTree: count('UpdateLayoutTree'),
      UpdateLayoutTreeMs: +dur('UpdateLayoutTree').toFixed(2), RasterTask: count('RasterTask'), CompositeLayers: count('CompositeLayers') },
    page: js,
  };
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(out, `perf-x${rate}.json`), JSON.stringify(res, null, 1));
}

try {
  const mode = args[0];
  if (mode === 'shot') await shot(args[1], args[2], +(args[3] || 800), +(args[4] || 800), +(args[5] || 1));
  else if (mode === 'batch') {
    const list = JSON.parse(fs.readFileSync(args[1], 'utf8'));
    for (const s of list) await shot(s.name, s.url, s.w || 800, s.h || 800, s.dpr || 1, s.wait || 0, s.full !== false);
  } else if (mode === 'perf') await perf(args[1], +(args[2] || 6), +(args[3] || 1));
  else console.error('mode inconnu :', mode);
} finally {
  if (logs.length) console.log('--- console ---\n' + logs.slice(0, 60).join('\n'));
  ws.close();
  proc.kill();
  await sleep(600);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* sans gravité */ }
}
process.exit(0);
