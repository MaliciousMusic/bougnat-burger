#!/usr/bin/env node
// Tous les textes à traduire, en français et en anglais, dans tools/i18n/source.json :
//   ui   : les textes du HTML (data-i18n, data-i18n-attr), clé → { fr, en }
//   dyn  : les textes produits par le JS (bb-i18n.js), clé → { fr, en } (tableaux pour les jours et les mois)
//   data : tous les objets { fr, en } des données (plats, ingrédients, catégories, horaires…), avec leur chemin
// Les traductions vont dans js/i18n/bb-lang-<code>.js (ui et dyn par clé, data : texte français → traduction).
// Usage : node tools/i18n/extraire.mjs   (lance Chrome sans tête sur index.html)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9800 + Math.floor(Math.random() * 150);
const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-i18n-'));
const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 200 && !target; i++) { try { target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json(); } catch { await sleep(250); } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise((r) => (ws.onopen = r));
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: pathToFileURL(path.join(ROOT, 'index.html')).href + '?lang=fr' });
await sleep(3500);
const r = await send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
  const { EN, DYN } = BB.I18N;
  const ui = {};
  document.querySelectorAll('[data-i18n]').forEach((el) => { const k = el.dataset.i18n; ui[k] = { fr: el.dataset.fr != null ? el.dataset.fr : el.innerHTML, en: EN[k] }; });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => el.dataset.i18nAttr.split(';').forEach((pair) => {
    const [attr, k] = pair.split(':'); const keep = 'fr' + attr.replace(/[^a-z]/gi, '');
    ui[k] = { fr: el.dataset[keep] != null ? el.dataset[keep] : el.getAttribute(attr), en: EN[k], attr };
  }));
  // le titre et la description de la page : leur français est celui du <head>
  const md = document.querySelector('meta[name="description"]');
  if (EN['meta.title']) ui['meta.title'] = { fr: document.title, en: EN['meta.title'] };
  if (EN['meta.desc']) ui['meta.desc'] = { fr: md ? md.content : '', en: EN['meta.desc'] };
  Object.keys(EN).forEach((k) => { if (!ui[k]) ui[k] = { fr: null, en: EN[k], note: 'clé sans élément dans la page' }; });
  const dyn = {};
  new Set([...Object.keys(DYN.fr), ...Object.keys(DYN.en)]).forEach((k) => { dyn[k] = { fr: DYN.fr[k], en: DYN.en[k] }; });
  // les données : tout objet { fr, en } sous BB (sauf les tables de langue), avec son chemin ; les avis restent en français
  const data = new Map(), vus = new Set();
  const walk = (o, p) => {
    if (!o || typeof o !== 'object' || vus.has(o) || o.nodeType) return;
    vus.add(o);
    if (typeof o.fr === 'string') { if (!data.has(o.fr)) data.set(o.fr, { fr: o.fr, en: o.en, ou: [] }); const d = data.get(o.fr); if (d.ou.length < 3) d.ou.push(p); return; }
    for (const k of Object.keys(o)) { if (k === 'I18N' || k === 'LANGS' || k === 'texte') continue; try { walk(o[k], p + '.' + k); } catch (e) {} }
  };
  ['INFO', 'CATS', 'BURGER_LIST', 'MENU_OTHER', 'ING', 'SIDES', 'RAW', 'ALLERGEN_LABELS', 'AVIS', 'HOURS', 'WEEK'].forEach((k) => BB[k] && walk(BB[k], 'BB.' + k));
  // les formules écrites dans le code (bb-data.js, burgerDesc)
  [{ fr: 'double steak haché façon bouchère VBF', en: 'double butcher-style French beef patty (VBF)', ou: 'BB.burgerDesc (double)' },
   { fr: 'double galette de pommes de terre', en: 'double potato rösti', ou: 'BB.burgerDesc (double)' },
   { fr: "Maquette : rien n'est envoyé.", en: 'Demo: nothing is sent.', ou: 'bb-resa.js (demande envoyée)' },
   { fr: 'steak haché VBF', en: 'VBF beef patty', ou: 'bb-burger.js (étiquette du Petiot)' },
   { fr: 'salade et mesclun', en: 'salad and mesclun', ou: 'bb-burger.js (étiquette du Petiot)' }]
    .forEach((o) => data.set(o.fr, { fr: o.fr, en: o.en, ou: [o.ou] }));
  return { ui, dyn, data: [...data.values()] };
})()` });
if (!r.result || r.result.exceptionDetails || !r.result.result) { console.error('Extraction impossible :', JSON.stringify(r.result && r.result.exceptionDetails || r).slice(0, 800)); process.exit(1); }
const out = r.result.result.value;
out.consignes = [
  'Traduire depuis le français (l\'anglais aide pour le sens). Garder les balises HTML et les {variables} telles quelles.',
  'Noms propres en alphabet latin : noms des burgers (Mefia Te, Bougnat, Vulcano…), fromages (Saint-Nectaire, Cantal, Salers, Bleu d\'Auvergne), bières, vins, lieux ; « Ti\' » reste « Ti\' ».',
  'AOP : « DOP » en espagnol ; en chinois, garder « AOP » (原产地保护) après le nom. VBF : garder « VBF » (viande bovine française).',
  'Listes des descriptions de plats : mêmes éléments, même ordre, séparés par « , » (es) ou « 、 » (zh) : chaque élément devient une étiquette du dessin.',
  'Chinois : simplifié (zh-Hans), ton chaleureux et simple ; heures au format 22:00 ; les jours et mois en chinois.',
  'Les avis Google restent en français (citations) : ils ne sont pas dans cette liste.',
];
fs.mkdirSync(path.join(ROOT, 'tools', 'i18n'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools', 'i18n', 'source.json'), JSON.stringify(out, null, 1));
console.log(`tools/i18n/source.json : ${Object.keys(out.ui).length} textes d'interface, ${Object.keys(out.dyn).length} textes dynamiques, ${out.data.length} textes de données`);
ws.close(); proc.kill(); await sleep(400);
try { fs.rmSync(prof, { recursive: true, force: true }); } catch {}
process.exit(0);
