#!/usr/bin/env node
// Vérifie un paquet de langue contre tools/i18n/source.json : rien d'oublié, {variables} et balises HTML intactes.
// Usage : node tools/i18n/verifier.mjs es   (ou zh)
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const code = process.argv[2];
if (!code) { console.error('Usage : node tools/i18n/verifier.mjs <code>'); process.exit(1); }
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'i18n', 'source.json'), 'utf8'));
const ctx = { window: {} };
ctx.window.BB = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'i18n', `bb-lang-${code}.js`), 'utf8'), ctx);
const packs = ctx.window.BB.langPacks || [];
const found = packs.find((p) => p[0] === code);
if (!found) { console.error('Paquet introuvable : BB.langPacks ne contient pas « ' + code + ' »'); process.exit(1); }
const pack = found[1];
const errs = [], warns = [];
const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');
const tags = (s) => (String(s).match(/<\/?[a-z][^>]*>/gi) || []).map((t) => t.replace(/\s.*?>/, '>').toLowerCase()).sort().join(' ');
function compare(where, fr, tr) {
  if (fr === '' || fr == null) return; // clé vide en français (inutilisée) : rien à traduire
  if (tr == null || tr === '') { errs.push(`${where} : manquant`); return; }
  if (Array.isArray(fr)) {
    if (!Array.isArray(tr) || tr.length !== fr.length) errs.push(`${where} : tableau de ${fr.length} attendu`);
    return;
  }
  if (typeof fr !== 'string') return;
  if (vars(fr) !== vars(tr)) errs.push(`${where} : variables ${vars(fr) || '∅'} ≠ ${vars(tr) || '∅'}`);
  if (tags(fr) !== tags(tr)) errs.push(`${where} : balises ${tags(fr) || '∅'} ≠ ${tags(tr) || '∅'}`);
  if (tr === fr && /[a-zà-ÿ]{4,}/i.test(fr) && !/^[A-Z0-9' .\-·%€]+$/.test(fr)) warns.push(`${where} : identique au français (${fr.slice(0, 50)})`);
}
for (const [k, v] of Object.entries(src.ui)) compare('ui.' + k, v.fr, (pack.ui || {})[k]);
for (const [k, v] of Object.entries(src.dyn)) compare('dyn.' + k, v.fr, (pack.dyn || {})[k]);
for (const d of src.data) compare('data « ' + d.fr.slice(0, 40) + ' »', d.fr, (pack.data || {})[d.fr]);
const extra = Object.keys(pack.data || {}).filter((k) => !src.data.some((d) => d.fr === k));
if (extra.length) warns.push(`${extra.length} entrée(s) de data sans source (texte français modifié ?) : ${extra.slice(0, 5).join(' | ')}`);
console.log(`${code} : ${errs.length} erreur(s), ${warns.length} remarque(s)`);
errs.slice(0, 80).forEach((e) => console.log('  ✗ ' + e));
warns.slice(0, 40).forEach((w) => console.log('  · ' + w));
process.exit(errs.length ? 2 : 0);
