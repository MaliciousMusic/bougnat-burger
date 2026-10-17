#!/usr/bin/env node
// Vérifie js/bb-qr.js module par module contre python-qrcode (même texte, même masque, correction M).
// Usage : node tools/qr-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {}, TextEncoder };
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'js', 'bb-qr.js'), 'utf8'), ctx);
const BB = ctx.window.BB;

const textes = ['BB', 'https://maliciousmusic.github.io/bougnat-burger/fidelite/?carte=BB-7K3Q-9XF2',
  'Bougnat Burger · carte n° BB-7K3Q', 'x'.repeat(120), 'é'.repeat(100)];
const py = `
import sys, json, qrcode
out = []
for t, m in json.loads(sys.stdin.buffer.read().decode('utf-8')):
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0, mask_pattern=m)
    q.add_data(qrcode.util.QRData(t.encode('utf-8'), mode=qrcode.util.MODE_8BIT_BYTE, check_data=False))
    q.make(fit=True)
    out.append(["".join("1" if c else "0" for c in row) for row in q.get_matrix()])
print(json.dumps(out))`;
const cas = [];
textes.forEach((t) => { for (let m = 0; m < 8; m++) cas.push([t, m]); });
const ref = JSON.parse(execFileSync('python', ['-c', py], { input: JSON.stringify(cas) }).toString());
let ko = 0;
cas.forEach(([t, m], i) => {
  const q = BB.qr(t, m);
  const rows = [];
  for (let y = 0; y < q.n; y++) { let r = ''; for (let x = 0; x < q.n; x++) r += q.mod(x, y) ? '1' : '0'; rows.push(r); }
  if (rows.join('\n') !== ref[i].join('\n')) { ko++; console.log(`DIFFÉRENT : « ${t.slice(0, 30)} » masque ${m} (v${q.version}, ${q.n} vs ${ref[i].length})`); }
});
console.log(ko ? `${ko} cas sur ${cas.length} différents` : `${cas.length} cas identiques`);
process.exit(ko ? 1 : 0);
