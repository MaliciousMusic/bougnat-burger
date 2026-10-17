/* ==========================================================================
   Bougnat Burger — un QR code dessiné dans la page (la carte de fidélité du client).
   Aucune bibliothèque ni CDN : mode octets, correction M, versions 1 à 10 (jusqu'à 213 octets),
   d'après la norme ISO 18004 (même construction que la bibliothèque de référence de Nayuki).
   BB.qr(texte) → { n, mod(x, y) } ; BB.qrSVG(texte, { sombre, clair, marge }) → '<svg …>'.
   Vérifié module par module contre python-qrcode (tools/qr-test.mjs).
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});

  // correction M : codes de correction par bloc et nombre de blocs, versions 1 à 10
  const EC_BLOC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const BLOCS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

  const bit = (x, i) => ((x >>> i) & 1) !== 0;
  function modulesBruts(v) { // modules disponibles pour les données (hors motifs fixes)
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const na = Math.floor(v / 7) + 2; r -= (25 * na - 10) * na - 55; if (v >= 7) r -= 36; }
    return r;
  }
  const motsBruts = (v) => Math.floor(modulesBruts(v) / 8);
  const motsDonnees = (v) => motsBruts(v) - EC_BLOC[v] * BLOCS[v];
  function alignements(v) {
    if (v === 1) return [];
    const na = Math.floor(v / 7) + 2, n = v * 4 + 17;
    const pas = Math.ceil((v * 4 + 4) / (na * 2 - 2)) * 2;
    const r = [6];
    for (let p = n - 7; r.length < na; p -= pas) r.splice(1, 0, p);
    return r;
  }

  /* ---------- Reed-Solomon sur GF(256) ---------- */
  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function diviseur(deg) {
    const r = new Array(deg).fill(0);
    r[deg - 1] = 1;
    let rac = 1;
    for (let i = 0; i < deg; i++) {
      for (let j = 0; j < deg; j++) { r[j] = mul(r[j], rac); if (j + 1 < deg) r[j] ^= r[j + 1]; }
      rac = mul(rac, 2);
    }
    return r;
  }
  function reste(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, f); });
    }
    return r;
  }

  /* ---------- l'encodage ---------- */
  function encoder(texte, masqueForce) {
    const octets = Array.from(new TextEncoder().encode(String(texte)));
    let v = 1;
    for (; v <= 10; v++) if (4 + (v < 10 ? 8 : 16) + octets.length * 8 <= motsDonnees(v) * 8) break;
    if (v > 10) throw new Error('QR : texte trop long');
    const cap = motsDonnees(v);
    // les bits : mode octets (0100), longueur, données, terminaison, remplissage
    const bits = [];
    const pousser = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    pousser(4, 4);
    pousser(octets.length, v < 10 ? 8 : 16);
    octets.forEach((b) => pousser(b, 8));
    pousser(0, Math.min(4, cap * 8 - bits.length));
    pousser(0, (8 - (bits.length % 8)) % 8);
    for (let p = 0xec; bits.length < cap * 8; p ^= 0xec ^ 0x11) pousser(p, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // les blocs, leur correction, l'entrelacement
    const nb = BLOCS[v], ec = EC_BLOC[v], brut = motsBruts(v);
    const courts = nb - (brut % nb), lCourt = Math.floor(brut / nb);
    const div = diviseur(ec);
    const blocs = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const d = data.slice(k, k + lCourt - ec + (i < courts ? 0 : 1));
      k += d.length;
      const e = reste(d, div);
      if (i < courts) d.push(0);
      blocs.push(d.concat(e));
    }
    const mots = [];
    for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== lCourt - ec || j >= courts) mots.push(b[i]); });

    // la matrice : motifs fixes, puis les données en zigzag
    const n = v * 4 + 17;
    const M = Array.from({ length: n }, () => new Array(n).fill(false));
    const F = Array.from({ length: n }, () => new Array(n).fill(false));
    const fixe = (x, y, s) => { M[y][x] = s; F[y][x] = true; };
    for (let i = 0; i < n; i++) { fixe(6, i, i % 2 === 0); fixe(i, 6, i % 2 === 0); }
    const reperes = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) fixe(x, y, d !== 2 && d !== 4);
      }
    };
    reperes(3, 3); reperes(n - 4, 3); reperes(3, n - 4);
    const al = alignements(v), na = al.length;
    for (let i = 0; i < na; i++) for (let j = 0; j < na; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) fixe(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const format = (masque) => {
      const d = masque; // correction M : bits de niveau 00
      let r = d;
      for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; i++) fixe(8, i, bit(b, i));
      fixe(8, 7, bit(b, 6)); fixe(8, 8, bit(b, 7)); fixe(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) fixe(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) fixe(n - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) fixe(8, n - 15 + i, bit(b, i));
      fixe(8, n - 8, true);
    };
    format(0); // réserve les cases du format
    if (v >= 7) {
      let r = v;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (v << 12) | r;
      for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), c = Math.floor(i / 3); fixe(a, c, bit(b, i)); fixe(c, a, bit(b, i)); }
    }
    let i = 0;
    for (let droite = n - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = droite - j, monte = ((droite + 1) & 2) === 0, y = monte ? n - 1 - vert : vert;
        if (!F[y][x] && i < mots.length * 8) { M[y][x] = bit(mots[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
    // le masque : celui qui pénalise le moins (ou celui demandé, pour les tests)
    const MASQUES = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const appliquer = (k) => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && MASQUES[k](x, y)) M[y][x] = !M[y][x]; };
    let choisi = masqueForce;
    if (choisi == null) {
      let mieux = Infinity;
      for (let k = 0; k < 8; k++) {
        appliquer(k); format(k);
        const p = penalite(M, n);
        if (p < mieux) { mieux = p; choisi = k; }
        appliquer(k); // (un masque est son propre inverse)
      }
    }
    appliquer(choisi); format(choisi);
    return { n, version: v, masque: choisi, mod: (x, y) => M[y][x] };
  }
  // pénalités de la norme : suites de 5 et plus, carrés 2×2, faux repères, équilibre clair/sombre
  function penalite(M, n) {
    let p = 0, sombres = 0;
    const suites = (get) => {
      for (let a = 0; a < n; a++) {
        let run = 1;
        for (let b = 1; b <= n; b++) {
          if (b < n && get(a, b) === get(a, b - 1)) run++;
          else { if (run >= 5) p += run - 2; run = 1; }
        }
        const ligne = Array.from({ length: n }, (_, b) => get(a, b));
        const s = ligne.map((c) => (c ? '1' : '0')).join('');
        const re = /(?=(10111010000|00001011101))/g;
        while (re.exec(s)) { p += 40; re.lastIndex++; }
      }
    };
    suites((y, x) => M[y][x]);
    suites((x, y) => M[y][x]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (M[y][x]) sombres++;
      if (x < n - 1 && y < n - 1 && M[y][x] === M[y][x + 1] && M[y][x] === M[y + 1][x] && M[y][x] === M[y + 1][x + 1]) p += 3;
    }
    const k = Math.ceil(Math.abs(sombres * 20 - n * n * 10) / (n * n)) - 1;
    return p + Math.max(0, k) * 10;
  }

  BB.qr = encoder;
  // en SVG : un seul tracé, les modules voisins d'une ligne fusionnés
  BB.qrSVG = function (texte, { sombre = '#1A130F', clair = 'none', marge = 2 } = {}) {
    const q = encoder(texte);
    const t = q.n + marge * 2;
    let d = '';
    for (let y = 0; y < q.n; y++) for (let x = 0; x < q.n; x++) {
      if (!q.mod(x, y)) continue;
      let l = 1;
      while (x + l < q.n && q.mod(x + l, y)) l++;
      d += `M${x + marge} ${y + marge}h${l}v1h-${l}z`;
      x += l - 1;
    }
    return `<svg viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" aria-hidden="true">${clair !== 'none' ? `<rect width="${t}" height="${t}" fill="${clair}"/>` : ''}<path d="${d}" fill="${sombre}"/></svg>`;
  };
})();
