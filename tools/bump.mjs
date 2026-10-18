#!/usr/bin/env node
// Estampille les CSS et JS de index.html (?v=AAAAMMJJhhmmss) avant chaque publication.
// (Le comptoir, dépôt privé à part, a son propre outil : comptoir/outils/synchro.mjs.)
// GitHub Pages garde les fichiers 10 minutes en cache : sans ça, un téléphone pourrait
// mélanger la nouvelle page et d'anciens scripts.
// Usage : node tools/bump.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');
const d = new Date();
const p = (n) => String(n).padStart(2, '0');
const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
let n = 0;
const estampiller = (f, re) => {
  const out = readFileSync(f, 'utf8').replace(re, (m, attr, path) => {
    n++;
    return `${attr}="${path}?v=${stamp}"`;
  });
  writeFileSync(f, out);
};
estampiller(file, /(href|src)="((?:css|js)\/[^"?]+\.(?:css|js))(?:\?v=[^"]*)?"/g);
console.log(`${n} fichier(s) estampillé(s) v=${stamp}`);
