/* ==========================================================================
   Bougnat Burger — la cuisine des ingrédients (textures procédurales)
   Chaque ingrédient du burger est calculé pixel par pixel, une seule fois :
   1. vue de dessus : une carte de hauteur (dôme brioché, steak haché,
      filaments de pomme de terre, feuilles, tranches, graines…) et, en
      chaque point, sa couleur, sa brillance, sa translucidité, sa tranche ;
   2. lumière de photo culinaire : principale chaude en haut à gauche,
      débouché à droite, contre-jour pour les reflets, ombre dans les creux ;
   3. vue plongeante (~25°) : la carte est projetée colonne par colonne, de
      l'avant vers l'arrière ; les bords montrent leur tranche (épaisseur),
      les nappes (fromage fondu, sauce) pendent en rideaux.
   Résultat : un PNG (adresse blob:) posé dans le SVG du burger (bb-burger.js).
   Le calcul part dans des workers créés à partir de ce code même (aucun
   fichier à charger : ça marche aussi en file://) ; sinon il est découpé en
   tranches de quelques ms sur la page. Une texture = un ingrédient × une
   finesse ; gardée en mémoire et dans IndexedDB (la clé contient une empreinte
   du code : la moindre retouche repart de zéro).
   ========================================================================== */
(function () {
  'use strict';

  const BB = (window.BB = window.BB || {});

  /* ======================================================================
     La bibliothèque de calcul. Autonome : elle ne voit rien d'extérieur.
     La même fonction tourne sur la page et, recopiée en texte, dans les workers.
     ====================================================================== */
  function bakeLib(IN_WORKER) {
    'use strict';

    const TAU = Math.PI * 2;
    const PHI = (25 * Math.PI) / 180; // la caméra regarde le burger d'un peu au-dessus
    const S = Math.sin(PHI), C = Math.cos(PHI);
    const KY = 1.0; // rangées de la carte de hauteur par pixel (plus serrées que la vue ne l'exige : bords raides sans crénelage)
    let RPX = 100; // pixels par unité (rayon du pain = 1) pendant le calcul en cours

    /* ---------- hasard et bruit (copies autonomes des outils de bb-core) ---------- */
    function rng(seed) {
      let a = seed >>> 0;
      const r = function () {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      r.range = (lo, hi) => lo + r() * (hi - lo);
      return r;
    }
    function hash(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return h >>> 0;
    }
    /* bruit simplex 2D seedé (Gustavson) → [-1, 1] */
    function noise2(seed) {
      const r = rng(seed);
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      for (let i = 255; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = p[i]; p[i] = p[j]; p[j] = t;
      }
      const perm = new Uint8Array(512), pm = new Uint8Array(512);
      for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
      const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
      const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
      return function (xin, yin) {
        const s = (xin + yin) * F2;
        const i = Math.floor(xin + s), j = Math.floor(yin + s);
        const t = (i + j) * G2;
        const x0 = xin - i + t, y0 = yin - j + t;
        const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
        const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
        const ii = i & 255, jj = j & 255;
        let n = 0, tt, g;
        tt = 0.5 - x0 * x0 - y0 * y0;
        if (tt > 0) { g = pm[ii + perm[jj]] * 2; tt *= tt; n += tt * tt * (G[g] * x0 + G[g + 1] * y0); }
        tt = 0.5 - x1 * x1 - y1 * y1;
        if (tt > 0) { g = pm[ii + i1 + perm[jj + j1]] * 2; tt *= tt; n += tt * tt * (G[g] * x1 + G[g + 1] * y1); }
        tt = 0.5 - x2 * x2 - y2 * y2;
        if (tt > 0) { g = pm[ii + 1 + perm[jj + 1]] * 2; tt *= tt; n += tt * tt * (G[g] * x2 + G[g + 1] * y2); }
        return 70 * n;
      };
    }
    /* bruit cellulaire (Worley) : F1, F2 et identifiant de cellule */
    function worley(seed) {
      const s = seed | 0;
      const hs = (i, j) => {
        let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + s) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
      };
      const out = { f1: 0, f2: 0, id: 0 };
      out.at = function (x, y) {
        const xi = Math.floor(x), yi = Math.floor(y);
        let f1 = 9, f2 = 9, id = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const cx = xi + di, cy = yi + dj;
            const h1 = hs(cx, cy), h2 = hs(cx + 7919, cy - 1049);
            const dx = cx + 0.1 + h1 * 0.8 - x, dy = cy + 0.1 + h2 * 0.8 - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < f1) { f2 = f1; f1 = d; id = h1; } else if (d < f2) f2 = d;
          }
        }
        out.f1 = f1; out.f2 = f2; out.id = id;
      };
      return out;
    }

    /* ---------- petites aides ---------- */
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
    const angDiff = (a, b) => {
      let d = (a - b) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    };
    // union douce de deux distances signées
    const smin = (a, b, k) => { const h = clamp01(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };
    function sdRoundBox(px, py, hx, hy, r) {
      const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
      const mx = qx > 0 ? qx : 0, my = qy > 0 ? qy : 0;
      return Math.min(Math.max(qx, qy), 0) + Math.sqrt(mx * mx + my * my) - r;
    }
    // mélange la couleur de travail vers c
    function tint(o, c, t) {
      if (!(t > 0)) return;
      if (t > 1) t = 1;
      o.r += (c[0] - o.r) * t; o.g += (c[1] - o.g) * t; o.b += (c[2] - o.b) * t;
    }
    const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    /* une fonction de l'angle seul, tabulée une fois (lecture par interpolation) */
    function angTab(fn) {
      const T = new Float32Array(1025);
      for (let i = 0; i <= 1024; i++) T[i] = fn((i / 1024) * TAU);
      return function (th) {
        let f = (th / TAU) * 1024;
        f -= Math.floor(f / 1024) * 1024;
        const i0 = f | 0;
        return T[i0] + (T[i0 + 1] - T[i0]) * (f - i0);
      };
    }
    /* contour polaire irrégulier (harmoniques + bruit), tabulé */
    function polar(seed, base, harm, nAmp, nFreq) {
      const r = rng(seed), n = noise2(seed ^ 0x5bd1e995);
      const T = new Float32Array(1025);
      const ph = harm.map(() => r() * TAU);
      for (let i = 0; i <= 1024; i++) {
        const th = (i / 1024) * TAU;
        let m = 1;
        for (let j = 0; j < harm.length; j++) m += harm[j][1] * Math.sin(harm[j][0] * th + ph[j]);
        if (nAmp) m += nAmp * n(Math.cos(th) * nFreq + 11, Math.sin(th) * nFreq - 7);
        T[i] = base * m;
      }
      return function (th) {
        let f = (th / TAU) * 1024;
        f -= Math.floor(f / 1024) * 1024;
        const i0 = f | 0, fr = f - i0;
        return T[i0] + (T[i0 + 1] - T[i0]) * fr;
      };
    }

    /* ---------- formes partagées ---------- */
    // le pain : contour et dôme (le pain du haut, et la sauce qui le nappe)
    const BUN = (function () {
      const rho = polar(hash('pain'), 1.0, [[2, 0.008], [3, 0.011], [5, 0.005], [7, 0.003]], 0.006, 2.2);
      const nD = noise2(hash('dôme'));
      const H = 0.6, HW = 0.075;
      const g = { u: 0, h: 0, R: 1, rr: 0, th: 0, dist: 0, rho, H, HW };
      g.at = function (x, y) {
        const rr = Math.sqrt(x * x + y * y), th = Math.atan2(y, x), R = rho(th), u = rr / R;
        g.rr = rr; g.th = th; g.R = R; g.u = u; g.dist = R - rr;
        const uu = u < 1 ? u : 1;
        const prof = Math.pow(Math.max(0, 1 - Math.pow(uu, 2.2)), 0.6);
        g.h = HW + (H - HW) * prof + 0.022 * nD(x * 1.2, y * 1.2) * prof;
        return g;
      };
      return g;
    })();
    // la galette (steak ou pommes de terre) : le fromage fondu épouse son contour
    const PATTY = polar(hash('galette'), 0.97, [[2, 0.012], [3, 0.016], [4, 0.009], [6, 0.007], [9, 0.005], [13, 0.004]], 0.011, 3.2);
    // le pain du bas : la sauce étalée dessus déborde de son contour
    const BUNB = polar(hash('pain bas'), 0.975, [[2, 0.008], [3, 0.01], [5, 0.005]], 0.005, 2.2);

    /* filaments (pomme paillasson, galette) : capsules un peu courbées, rangées dans une grille */
    function strands(seed, cfg) {
      const r = rng(seed);
      const L = [];
      for (let i = 0; i < cfg.n; i++) {
        const a = r() * TAU, d = cfg.R * Math.pow(r(), cfg.pow);
        const ang = r() * TAU;
        L.push({
          x: Math.cos(a) * d, y: Math.sin(a) * d, c: Math.cos(ang), s: Math.sin(ang),
          hl: r.range(cfg.len[0], cfg.len[1]) / 2, hw: r.range(cfg.hw[0], cfg.hw[1]),
          bend: r.range(-cfg.bend, cfg.bend), z: r.range(cfg.z[0], cfg.z[1]), tone: r(), sq: r.range(0.75, 1.1),
        });
      }
      const cs = cfg.cell, E = cfg.R + 0.35, GN = Math.ceil((2 * E) / cs);
      const grid = Array.from({ length: GN * GN }, () => []);
      L.forEach((s, idx) => {
        const br = s.hl * (1 + Math.abs(s.bend)) + s.hw;
        const x0 = Math.max(0, Math.floor((s.x - br + E) / cs)), x1 = Math.min(GN - 1, Math.floor((s.x + br + E) / cs));
        const y0 = Math.max(0, Math.floor((s.y - br + E) / cs)), y1 = Math.min(GN - 1, Math.floor((s.y + br + E) / cs));
        for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) grid[gy * GN + gx].push(idx);
      });
      const q = { i: -1, top: 0, cross: 0, t: 0, cov: 0, list: L };
      q.at = function (x, y) {
        q.i = -1; q.top = -9; q.cov = 0;
        const gx = Math.floor((x + E) / cs), gy = Math.floor((y + E) / cs);
        if (gx < 0 || gy < 0 || gx >= GN || gy >= GN) return q;
        const cell = grid[gy * GN + gx];
        for (let k = 0; k < cell.length; k++) {
          const s = L[cell[k]];
          const dx = x - s.x, dy = y - s.y;
          const t = (dx * s.c + dy * s.s) / s.hl;
          if (t < -1.3 || t > 1.3) continue;
          const tt = t < -1 ? -1 : t > 1 ? 1 : t;
          const ay = -dx * s.s + dy * s.c - s.bend * s.hl * (tt * tt - 1) * 0.5;
          const ex = (t - tt) * s.hl;
          const w = s.hw * (1 - 0.3 * tt * tt * tt * tt);
          const dd2 = ex * ex + ay * ay;
          if (dd2 >= w * w) continue;
          const dd = Math.sqrt(dd2);
          const cv = (w - dd) * RPX + 0.5;
          if (cv > q.cov) q.cov = cv > 1 ? 1 : cv;
          const cr = dd / w;
          const top = s.z + s.hw * s.sq * Math.sqrt(1 - cr * cr);
          if (top > q.top) { q.top = top; q.i = cell[k]; q.cross = ay / w; q.t = tt; }
        }
        return q;
      };
      return q;
    }

    /* ======================================================================
       Les ingrédients. Chacun rend une fonction px(x, y, o) qui remplit, pour
       un point de la vue de dessus (x vers la droite, y vers la caméra, unité =
       rayon du pain) : o.a (couverture), o.h (hauteur du dessus), o.hb (bas de
       sa tranche), o.hr (hauteur exacte du bord, pour les pentes très raides),
       o.r/g/b (couleur), o.sp/o.sh (reflet), o.ss (translucidité), o.id (objet :
       les bords entre objets montrent leur tranche), o.k (matière de la tranche),
       o.sr/sg/sb (couleur de la tranche), o.wt (galbe du rideau).
       ====================================================================== */
    const DEFS = {}, MADE = {};
    function def(id, meta, make) {
      DEFS[id] = {
        id, ext: meta.ext, exy: meta.exy || meta.ext, cx: meta.cx || 0, cy: meta.cy || 0,
        hmax: meta.hmax, hbmin: meta.hbmin || 0, ky: meta.ky || KY, make, phi: meta.phi || 25,
        band: meta.band || null, shadow: meta.shadow || null,
      };
    }
    const made = (id) => MADE[id] || (MADE[id] = DEFS[id].make());

    /* ---------- Pain du haut : dôme brioché, doré, brillant, sésame ---------- */
    def('bun-top', { ext: 1.05, hmax: 0.68, ky: 1.3 }, () => {
      const nA = noise2(11), nB = noise2(12), nC = noise2(13), nT = noise2(14);
      // sésame : grille « jittered », dense sur le dessus, clairsemée vers la taille
      const r = rng(hash('sésame'));
      const g = 0.084, E = 1.1, GN = Math.ceil((2 * E) / g);
      const grid = new Array(GN * GN).fill(null);
      for (let j = 0; j < GN; j++) {
        for (let i = 0; i < GN; i++) {
          const x = -E + (i + r.range(0.12, 0.88)) * g, y = -E + (j + r.range(0.12, 0.88)) * g;
          const u = BUN.at(x, y).u;
          const keep = r() < 1 - 0.96 * smooth(0.62, 0.93, u);
          if (u > 0.93 || !keep) continue;
          // la graine est couchée sur la pente du dôme : sa trace vue de dessus est raccourcie
          const e = 0.01;
          const gx = (BUN.at(x + e, y).h - BUN.at(x - e, y).h) / (2 * e);
          const gy = (BUN.at(x, y + e).h - BUN.at(x, y - e).h) / (2 * e);
          const gl = Math.sqrt(gx * gx + gy * gy);
          const ang = r() * TAU;
          grid[j * GN + i] = {
            x, y, c: Math.cos(ang), s: Math.sin(ang),
            hl: r.range(0.023, 0.03), hw: r.range(0.0115, 0.015), hh: r.range(0.008, 0.011), tone: r(),
            ux: gl > 1e-4 ? gx / gl : 1, uy: gl > 1e-4 ? gy / gl : 0, st: Math.sqrt(1 + gl * gl),
          };
        }
      }
      const SEED = [249, 240, 218], SEED2 = [228, 198, 144];
      // ombre portée d'une graine : la lumière vient d'en haut à gauche, l'ombre part vers la droite et l'arrière
      const SHX = 0.011, SHY = -0.009;
      // la graine la plus haute qui couvre (x, y) (bosse dans SG, 0 si aucune) et, en même temps,
      // celle dont l'ombre tombe sur (x, y) (SG.sh : 0..1)
      const SG = { s: null, t: 0, d: 1, sh: 1 };
      function cover(s, x, y) {
        const dx = x - s.x, dy = y - s.y;
        if (dx * dx + dy * dy > 0.0022) return 2;
        const ds = (dx * s.ux + dy * s.uy) * s.st, dp = -dx * s.uy + dy * s.ux;
        const ex = ds * s.ux - dp * s.uy, ey = ds * s.uy + dp * s.ux;
        const t = (ex * s.c + ey * s.s) / s.hl;
        if (t <= -1 || t >= 1) return 2;
        const q = (-ex * s.s + ey * s.c) / (s.hw * (1 - 0.3 * t));
        SG.tt = t;
        return t * t + q * q;
      }
      function seedAt(x, y) {
        const gi = Math.floor((x + E) / g), gj = Math.floor((y + E) / g);
        let best = 0;
        SG.s = null; SG.sh = 1;
        for (let dj = -1; dj <= 1; dj++) {
          const jj = gj + dj;
          if (jj < 0 || jj >= GN) continue;
          for (let di = -1; di <= 1; di++) {
            const ii = gi + di;
            if (ii < 0 || ii >= GN) continue;
            const s = grid[jj * GN + ii];
            if (!s) continue;
            const d2 = cover(s, x, y);
            if (d2 < 1) {
              const bump = s.hh * Math.sqrt(1 - d2);
              if (bump > best) { best = bump; SG.s = s; SG.t = SG.tt; SG.d = d2; }
            } else {
              const d3 = cover(s, x - SHX, y - SHY);
              if (d3 < SG.sh) SG.sh = d3;
            }
          }
        }
        return best;
      }
      return function (x, y, o) {
        const b = BUN.at(x, y);
        const a = 0.5 + b.dist * RPX;
        if (a <= 0) return;
        const u = b.u < 1 ? b.u : 1, dome = b.h;
        o.a = a > 1 ? 1 : a;
        const skin = 1 - smooth(0.93, 1, u);
        let h = dome + (0.0009 * nB(x * 15, y * 15) + 0.0004 * nC(x * 38, y * 38)) * skin;
        // dorure : sommet acajou, flancs dorés, taille pâle (la pâte s'est étirée à la cuisson)
        const t1 = smooth(0, 0.95, u);
        o.r = 138 + 76 * t1; o.g = 64 + 70 * t1; o.b = 22 + 30 * t1;
        tint(o, [232, 176, 98], smooth(0.965, 1.0, u) * 0.75);
        const v = 1 + 0.08 * nA(x * 2.1 + 3, y * 2.1) + 0.03 * nB(x * 6.5, y * 6.5);
        o.r *= v; o.g *= v; o.b *= v;
        const dk = smooth(0.3, 0.85, nT(x * 4, y * 4)) * 0.18 * (1 - smooth(0.85, 0.99, u));
        o.r *= 1 - dk; o.g *= 1 - dk * 1.25; o.b *= 1 - dk * 1.5;
        // dorure à l'œuf : un lustre large et un vernis net, un peu irréguliers
        o.sp = 0.42 * skin; o.sh = 10;
        o.cc = (0.5 + 0.2 * nC(x * 5, y * 5)) * (1 - 0.65 * smooth(0.9, 1.0, u));
        o.ss = 0.08;
        // sésame (loin de toute graine : rien à chercher)
        const best = seedAt(x, y);
        if (SG.s) {
          const s0 = SG.s, w = smooth(1, 0.7, SG.d);
          h = Math.max(h, dome + best);
          tint(o, lerp3(SEED, SEED2, s0.tone * 0.65 + 0.35 * smooth(0.2, 1, SG.t)), w);
          o.sp += (0.28 - o.sp) * w; o.sh += (30 - o.sh) * w; o.cc += (0.35 - o.cc) * w; o.ss += (0.3 - o.ss) * w;
        } else if (SG.sh < 1) {
          // dans l'ombre d'une graine
          const k = 0.3 * smooth(1, 0.5, SG.sh);
          o.r *= 1 - k; o.g *= 1 - k * 1.1; o.b *= 1 - k * 1.2;
          o.cc *= 1 - k; o.sp *= 1 - k;
        }
        o.h = h; o.hb = 0; o.id = 1; o.k = 1;
        if (b.u > 0.85) o.hr = BUN.HW;
        o.sr = 226; o.sg = 168; o.sb = 94;
      };
    });

    /* ---------- Pain du bas : mie serrée, toastée, liseré de croûte ---------- */
    def('bun-bottom', { ext: 1.02, hmax: 0.3 }, () => {
      const n1 = noise2(21), n2 = noise2(22), n3 = noise2(23), n4 = noise2(24), n5 = noise2(25);
      const T = 0.235;
      return function (x, y, o) {
        const rr = Math.sqrt(x * x + y * y), R = BUNB(Math.atan2(y, x)), u = rr / R;
        const a = 0.5 + (R - rr) * RPX;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const rim = smooth(0.9, 1, u);
        // mie : fibres fines et serrées (aucune alvéole)
        const f1 = n1(x * 26, y * 11), f2 = n2(x * 12 + 4, y * 32), f3 = n3(x * 60, y * 60);
        o.h = T - 0.03 * rim * rim + (0.0028 * f1 + 0.002 * f2 + 0.0009 * f3) * (1 - rim);
        o.hb = 0;
        // toastée à la plancha : blond doré, plus soutenu vers le bord
        const toast = clamp01(0.55 + 0.2 * n4(x * 2.2, y * 2.2) + 0.25 * smooth(0.55, 0.97, u) + 0.1 * n5(x * 7, y * 7));
        o.r = 238 + (198 - 238) * toast; o.g = 208 + (130 - 208) * toast; o.b = 152 + (60 - 152) * toast;
        const v = 1 + 0.035 * f1 + 0.03 * f2 + 0.02 * f3;
        o.r *= v; o.g *= v; o.b *= v;
        const crust = smooth(0.945, 0.975, u);
        tint(o, [176, 114, 58], crust);
        o.sp = 0.06 + 0.26 * crust + 0.05 * toast; o.sh = 14; o.cc = 0.3 * crust; o.ss = 0.12;
        o.id = 1; o.k = 13; o.sr = 196; o.sg = 136; o.sb = 74;
      };
    });

    /* ---------- Steak haché façon bouchère : croûte saisie, grain de hachage, jus ---------- */
    def('steak', { ext: 1.04, hmax: 0.3 }, () => {
      const nW1 = noise2(31), nW2 = noise2(32), nL = noise2(35), nC = noise2(36), nJ = noise2(37), nD = noise2(30), nE = noise2(29);
      const W1 = worley(39), W2 = worley(40);
      const T = 0.25;
      return function (x, y, o) {
        const rr = Math.sqrt(x * x + y * y), R = PATTY(Math.atan2(y, x)), u = rr / R;
        const a = 0.5 + (R - rr) * RPX;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const rim = smooth(0.8, 1, u);
        // viande hachée façon bouchère : de petits dômes de viande serrés, à deux échelles, de hauteurs
        // inégales ; les creux ne sont que le réseau entre eux (jamais un trou isolé). C'est la lumière qui
        // dessine le relief : la couleur, elle, reste une croûte de Maillard presque uniforme.
        const wx = x + 0.025 * nW1(x * 6, y * 6), wy = y + 0.025 * nW2(x * 6 + 7, y * 6);
        W1.at(wx * 19, wy * 19);
        const c1 = Math.max(0, 1 - W1.f1 * 1.55), id1 = W1.id;
        W2.at(wx * 37 + 3, wy * 37);
        const c2 = Math.max(0, 1 - W2.f1 * 1.65);
        const bumps = Math.sqrt(c1) * (0.55 + 0.7 * id1) * 0.7 + Math.sqrt(c2) * (0.5 + 0.8 * W2.id) * 0.3;
        let h = T * (1 - 0.3 * Math.pow(rim, 1.6));
        h += (0.013 * bumps + 0.0016 * nD(wx * 70, wy * 70) + 0.006 * nL(x * 2.4, y * 2.4)) * (1 - 0.35 * rim);
        // croûte : brun profond, plus ou moins saisie par grandes plages
        const n1 = nC(x * 2.2, y * 2.2), n2 = nE(x * 5, y * 5);
        o.r = 80; o.g = 49; o.b = 32;
        tint(o, [112, 76, 56], smooth(0.15, 0.75, n1) * 0.5); // moins saisi
        tint(o, [50, 31, 21], smooth(0.1, 0.8, -n1) * 0.55); // plus saisi
        tint(o, [124, 76, 46], smooth(0.45, 0.8, n2) * 0.16); // reflets caramel
        // les grumeaux ressortent : un peu plus clairs au sommet, plus sombres entre eux (on lit des bosses, pas des trous)
        const cv = (0.74 + 0.36 * bumps) * (0.94 + 0.12 * id1);
        o.r *= cv; o.g *= cv; o.b *= cv;
        tint(o, [62, 37, 23], rim * 0.5); // le bord, plus grillé
        // le jus : un lustre par plaques, qui accroche le haut des grumeaux
        const juice = smooth(0.0, 0.6, nJ(x * 4.5, y * 4.5));
        o.sp = 0.14 + 0.3 * juice; o.sh = 28;
        o.cc = 0.42 * juice * smooth(0.3, 0.8, bumps);
        o.ss = 0.08;
        o.h = h; o.hb = 0; o.id = 1; o.k = 2;
        o.sr = 128; o.sg = 86; o.sb = 66;
      };
    });

    /* ---------- Galette de pommes de terre (option végé) : épaisse, râpée, dorée ---------- */
    def('galette', { ext: 1.04, hmax: 0.3 }, () => {
      const ST = strands(hash('galette râpée'), { n: 1400, R: 0.9, pow: 0.5, len: [0.14, 0.3], hw: [0.012, 0.017], z: [0, 0.01], bend: 0.3, cell: 0.07 });
      const nA = noise2(51), nB = noise2(52);
      const T = 0.235;
      return function (x, y, o) {
        const rr = Math.sqrt(x * x + y * y), R = PATTY(Math.atan2(y, x)), u = rr / R;
        const q = ST.at(x, y);
        const a = 0.5 + (R - rr) * RPX; // bord net : les filaments ne dépassent pas (pas de tranche en créneaux)
        const onS = q.i >= 0;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const rim = smooth(0.8, 1, u);
        let h = T * (1 - 0.3 * Math.pow(rim, 1.4)) + 0.005 * nA(x * 3, y * 3);
        o.r = 156; o.g = 98; o.b = 38; // entre les filaments : brun doré
        o.sp = 0.22; o.sh = 24;
        if (onS) {
          const s = q.list[q.i];
          h += (q.top - s.z) * 0.9 * (1 - smooth(0.9, 1, u));
          const crisp = clamp01(0.35 * s.tone + 0.5 * smooth(0.5, 1, Math.abs(q.t)) + 0.3 * rim + 0.15 * nB(x * 4, y * 4));
          o.r = 236 + (170 - 236) * crisp; o.g = 188 + (106 - 188) * crisp; o.b = 100 + (40 - 100) * crisp;
          const k = 1 - 0.16 * q.cross * q.cross;
          o.r *= k; o.g *= k; o.b *= k;
          o.sp = 0.42; o.sh = 32; o.cc = 0.3;
        }
        o.h = h; o.hb = 0; o.id = 1; o.k = 3; o.ss = 0.1;
        if (u > 0.9) o.hr = T * 0.7;
        o.sr = 196; o.sg = 122; o.sb = 46;
      };
    });

    /* ---------- Pomme paillasson : galette fine de pomme de terre râpée, dorée, dentelle croustillante ---------- */
    def('paillasson', { ext: 1.08, hmax: 0.13 }, () => {
      const ST = strands(hash('paillasson'), { n: 1600, R: 0.93, pow: 0.52, len: [0.12, 0.28], hw: [0.0105, 0.015], z: [0, 0.03], bend: 0.45, cell: 0.07 });
      const body = polar(hash('paillasson corps'), 0.84, [[3, 0.03], [5, 0.03], [7, 0.02], [11, 0.02]], 0.04, 4);
      const nA = noise2(41), nB = noise2(42), nC = noise2(43);
      return function (x, y, o) {
        const rr = Math.sqrt(x * x + y * y), R = body(Math.atan2(y, x)), u = rr / R;
        const q = ST.at(x, y);
        const onS = q.i >= 0;
        let a = 0.5 + (R - rr) * RPX; // le corps, compact
        if (onS && q.cov > a) a = q.cov; // les filaments qui dépassent : la dentelle du bord
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const inBody = u < 1;
        const T = 0.045 * (1 - 0.45 * smooth(0.7, 1, u)) + 0.006 * nA(x * 4, y * 4);
        // entre les filaments : pomme de terre tassée, dorée plus sombre
        o.r = 168; o.g = 114; o.b = 50;
        let h = T, hb = 0, id = 1;
        if (onS) {
          const s = q.list[q.i];
          if (inBody) h = T + (q.top - s.z) * 0.95 + s.z * 0.35;
          else { h = q.top + 0.012; hb = s.z + 0.004; id = 2 + (q.i % 60000); }
          const crisp = clamp01(0.3 * s.tone + 0.5 * smooth(0.45, 1, Math.abs(q.t)) + 0.35 * smooth(0.6, 1.05, rr) + 0.25 * nB(x * 5, y * 5) + (inBody ? 0 : 0.25));
          o.r = 238 + (166 - 238) * crisp; o.g = 198 + (104 - 198) * crisp; o.b = 116 + (40 - 116) * crisp;
          tint(o, [248, 228, 164], clamp01(0.4 - 0.6 * nC(x * 3 + s.tone * 9, y * 3)) * 0.4);
          const k = 1 - 0.18 * q.cross * q.cross;
          o.r *= k; o.g *= k; o.b *= k;
        } else if (!inBody) return;
        o.h = h; o.hb = hb;
        o.sp = 0.45; o.sh = 32; o.cc = 0.4; o.ss = 0.22;
        o.id = id; o.k = 3;
        o.sr = 196; o.sg = 124; o.sb = 44;
      };
    });

    /* ---------- Salade et mesclun : feuilles frisées de plusieurs verts, un peu de rouge ---------- */
    def('salad', { ext: 1.3, hmax: 0.2, hbmin: -0.2 }, () => {
      const r = rng(hash('salade'));
      const n1 = noise2(61), n2 = noise2(62), n3 = noise2(63);
      const TY = {
        batavia: { base: [218, 234, 150], mid: [138, 200, 66], edge: [82, 158, 40], lob: 0.16, frill: 0.07, ruf: 0.03 },
        lollo: { base: [206, 226, 128], mid: [128, 186, 58], edge: [96, 152, 44], red: [124, 22, 58], lob: 0.12, frill: 0.1, ruf: 0.034 },
        frisee: { base: [236, 240, 160], mid: [176, 218, 84], edge: [112, 176, 46], lob: 0.1, frill: 0.05, deep: 0.55, ruf: 0.024 },
        dark: { base: [150, 196, 88], mid: [74, 140, 40], edge: [46, 100, 28], lob: 0.12, frill: 0.06, ruf: 0.028 },
        roquette: { base: [146, 188, 84], mid: [96, 150, 52], edge: [72, 124, 40], lob: 0.05, frill: 0.02, deep: 0.6, ruf: 0.01 },
        mache: { base: [140, 190, 86], mid: [98, 156, 58], edge: [78, 134, 48], lob: 0.03, frill: 0.01, ruf: 0.006, vein: [176, 212, 130] },
        blette: { base: [150, 170, 80], mid: [112, 146, 58], edge: [96, 126, 50], red: [150, 26, 52], lob: 0.05, frill: 0.02, ruf: 0.01, vein: [186, 52, 80] },
      };
      const L = [];
      const order = ['batavia', 'lollo', 'batavia', 'frisee', 'lollo', 'dark', 'batavia', 'frisee', 'lollo', 'batavia', 'dark', 'frisee'];
      order.forEach((ty, j) => {
        const th = (j / order.length) * TAU + r.range(-0.18, 0.18);
        const r0 = r.range(0.02, 0.12);
        L.push({ ox: Math.cos(th) * r0, oy: Math.sin(th) * r0, c: Math.cos(th), s: Math.sin(th), L: r.range(1.04, 1.16), W: r.range(0.28, 0.36), z: r.range(0, 0.035), T: TY[ty], ph: r.range(0, 50), fq: r.range(6, 10), big: true });
      });
      ['lollo', 'frisee', 'mache', 'lollo', 'roquette', 'frisee', 'blette', 'lollo'].forEach((ty) => {
        const th = r() * TAU, rc = r.range(0.45, 0.85), dir = th + r.range(-0.5, 0.5), len = r.range(0.2, 0.32);
        const cx = Math.cos(th) * rc, cy = Math.sin(th) * rc;
        L.push({ ox: cx - Math.cos(dir) * len * 0.35, oy: cy - Math.sin(dir) * len * 0.35, c: Math.cos(dir), s: Math.sin(dir), L: len, W: len * r.range(0.22, 0.3), z: r.range(0.03, 0.055), T: TY[ty], ph: r.range(0, 50), fq: r.range(3, 6), big: false });
      });
      const VEIN = [236, 246, 200];
      return function (x, y, o) {
        const rr = Math.sqrt(x * x + y * y);
        let best = -9, bj = -1, bt = 0, bq = 0, cov = 0;
        for (let j = 0; j < L.length; j++) {
          const f = L[j];
          const dx = x - f.ox, dy = y - f.oy;
          const al = dx * f.c + dy * f.s;
          if (al <= 0 || al >= f.L) continue;
          const ac = -dx * f.s + dy * f.c;
          if (ac > f.W * 1.45 || ac < -f.W * 1.45) continue;
          const t = al / f.L, T = f.T;
          let w;
          if (f.big) { const tt = 2 * Math.pow(t, 0.7) - 1; w = f.W * Math.sqrt(Math.max(0, 1 - tt * tt * tt * tt)); }
          else w = f.W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.62);
          w *= 1 + T.lob * Math.sin(t * f.fq * Math.PI + f.ph) * smooth(0.08, 0.35, t) + 0.07 * n1(x * 6 + f.ph, y * 6);
          if (T.deep) w *= 1 - T.deep * (0.5 + 0.5 * Math.sin(t * f.fq * 2.2 * Math.PI + f.ph * 1.7)) * smooth(0.15, 0.4, t);
          w *= 1 + T.frill * (0.65 * Math.sin(t * 36 + f.ph * 3) + 0.35 * Math.sin(t * 17 + f.ph)) * smooth(0.25, 0.8, t);
          const aa = ac < 0 ? -ac : ac;
          if (aa >= w) continue;
          const q = aa / w;
          const cv = (w - aa) * RPX + 0.5;
          if (cv > cov) cov = cv;
          // la feuille se creuse (bords relevés), ondule et frise vers le bord
          let h = f.z + (f.big ? 0.045 : 0.018) * t + 0.03 * q * q * t
            + T.ruf * smooth(0.35, 1, q) * smooth(0.15, 0.7, t) * Math.sin(t * 30 + q * 5 + f.ph)
            + 0.005 * (1 - smooth(0, 0.08, q)) * (1 - t);
          // hors du pain, elle retombe
          const out = smooth(0.93, 1.25, rr);
          h -= 0.15 * out * out;
          if (h > best) { best = h; bj = j; bt = t; bq = q; }
        }
        if (bj < 0) return;
        const f = L[bj], T = f.T, t = bt, q = bq;
        o.a = cov > 1 ? 1 : cov;
        const g1 = smooth(0, 0.65, t);
        o.r = T.base[0] + (T.mid[0] - T.base[0]) * g1; o.g = T.base[1] + (T.mid[1] - T.base[1]) * g1; o.b = T.base[2] + (T.mid[2] - T.base[2]) * g1;
        tint(o, T.edge, smooth(0.5, 1, Math.max(q, t * 0.85)));
        if (T.red) tint(o, T.red, clamp01(smooth(0.5, 0.95, q) * smooth(0.2, 0.65, t) * (0.75 + 0.5 * n2(x * 5, y * 5))));
        // nervures, plus claires
        const mid = (1 - smooth(0, 0.06, q)) * (1 - 0.6 * t);
        const vein = smooth(0.86, 1, Math.sin((t * f.L - q * f.W * 0.9) * (f.big ? 38 : 60) + f.ph)) * (1 - q) * smooth(0.08, 0.3, t);
        tint(o, T.vein || VEIN, mid * 0.7 + vein * 0.35);
        const v = 1 + 0.05 * n3(x * 9, y * 9);
        o.r *= v; o.g *= v; o.b *= v;
        o.h = best; o.hb = best - 0.012;
        o.sp = 0.26; o.sh = 26; o.cc = 0.3; o.ss = 0.72;
        o.id = 1 + bj; o.k = 4;
        o.sr = o.r * 0.9; o.sg = o.g * 0.92; o.sb = o.b * 0.85;
      };
    });

    /* ---------- Tomates : trois tranches, loges, gelée et graines ---------- */
    def('tomato', { ext: 1.0, hmax: 0.14 }, () => {
      const r = rng(hash('tomates'));
      const n1 = noise2(71), n2 = noise2(72), n3 = noise2(73);
      const SL = [];
      [[0, 0.03], [2.15, 0], [-2.15, 0.015]].forEach(([da, z]) => {
        const a = Math.PI / 2 + da + r.range(-0.2, 0.2), d = r.range(0.4, 0.44);
        const nL = r() < 0.5 ? 3 : 4, rot = r() * TAU;
        const seeds = [];
        for (let k = 0; k < nL; k++) {
          const a0 = rot + ((k + 0.5) / nL) * TAU;
          for (let m = 0; m < 3; m++) {
            const aa = a0 + r.range(-0.5, 0.5) * (TAU / nL) * 0.55, rr = r.range(0.34, 0.62);
            const ang = aa + r.range(-0.5, 0.5);
            seeds.push({ x: Math.cos(aa) * rr, y: Math.sin(aa) * rr, c: Math.cos(ang), s: Math.sin(ang) });
          }
        }
        // cloisons irrégulières (une vraie tomate n'est pas une pizza)
        const sep = [];
        for (let k = 0; k < nL; k++) sep.push(rot + (k / nL) * TAU + r.range(-0.22, 0.22));
        SL.push({ cx: Math.cos(a) * d, cy: Math.sin(a) * d, R: r.range(0.47, 0.5), z, nL, rot, sep, seeds, ph: r() * 50 });
      });
      const PERI = [204, 32, 26], SEPT = [212, 44, 32], COLM = [236, 116, 92], GEL = [228, 74, 40], SEED = [226, 188, 120], HALO = [236, 120, 70], SKIN = [158, 20, 16];
      return function (x, y, o) {
        let best = -9, bj = -1, cov = 0;
        for (let j = 0; j < SL.length; j++) {
          const s = SL[j];
          const dx = x - s.cx, dy = y - s.cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > s.R * s.R * 1.1) continue;
          const d = Math.sqrt(d2);
          const Re = s.R * (1 + 0.014 * Math.sin(Math.atan2(dy, dx) * 5 + s.ph));
          const cv = (Re - d) * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          if (s.z > best) { best = s.z; bj = j; }
        }
        if (bj < 0) return;
        o.a = cov > 1 ? 1 : cov;
        const s = SL[bj];
        const lx = (x - s.cx) / s.R, ly = (y - s.cy) / s.R;
        const rho = Math.sqrt(lx * lx + ly * ly), phi = Math.atan2(ly, lx);
        let dphi = 9;
        for (let k = 0; k < s.nL; k++) { const dd = Math.abs(angDiff(phi, s.sep[k])); if (dd < dphi) dphi = dd; }
        const peri = smooth(0.7 + 0.06 * n1(lx * 4 + s.ph, ly * 4), 0.78, rho);
        const sepW = (0.055 + 0.05 * (1 - rho)) * (1 + 0.35 * n1(lx * 3 + s.ph, ly * 3 - 9));
        const sept = 1 - smooth(sepW * 0.55, sepW, dphi * rho);
        const colm = 1 - smooth(0.16, 0.23, rho - 0.035 * Math.cos(s.nL * (phi - s.rot)));
        const flesh = Math.max(peri, sept, colm);
        const gel = 1 - flesh;
        o.r = GEL[0]; o.g = GEL[1]; o.b = GEL[2];
        tint(o, colm >= Math.max(peri, sept) ? COLM : sept > peri ? SEPT : PERI, flesh);
        // chair fibreuse, rayonnante
        const fib = 1 + 0.06 * n2(rho * 26, phi * 5) * peri;
        o.r *= fib; o.g *= fib; o.b *= fib;
        tint(o, SKIN, smooth(0.955, 0.985, rho));
        // graines dans la gelée
        let seed = 0, halo = 0;
        if (gel > 0.2) {
          for (let k = 0; k < s.seeds.length; k++) {
            const sd = s.seeds[k];
            const ex = lx - sd.x, ey = ly - sd.y;
            if (ex * ex + ey * ey > 0.008) continue;
            const t = (ex * sd.c + ey * sd.s) / 0.044, qq = (-ex * sd.s + ey * sd.c) / (0.026 * (1 - 0.3 * t));
            const dd = t * t + qq * qq;
            if (dd < 2.2) halo = Math.max(halo, 1 - dd / 2.2);
            if (dd < 1) seed = Math.max(seed, 1 - dd);
          }
          tint(o, HALO, halo * gel * 0.45);
          tint(o, SEED, smooth(0, 0.4, seed) * gel * 0.85);
        }
        o.h = s.z + 0.068 + 0.003 * (1 - rho * rho) - 0.007 * gel + 0.005 * Math.sqrt(seed) * gel + 0.0015 * n3(lx * 20, ly * 20);
        o.hb = s.z;
        o.sp = 0.3 + 0.35 * gel; o.sh = 34 + 30 * gel; o.cc = 0.4 + 0.55 * gel; o.ss = 0.45 + 0.4 * gel;
        o.id = 1 + bj; o.k = 5;
        o.sr = 188; o.sg = 30; o.sb = 22;
      };
    });

    /* ---------- Fromages en tranches (vue éclatée) ---------- */
    function cheeseSlices(id, cfg) {
      def(id, { ext: 0.98, hmax: cfg.round ? 0.14 : 0.1, hbmin: -0.04 }, () => {
        const sd0 = hash(id), r = rng(sd0);
        const n1 = noise2(sd0 ^ 1), n2 = noise2(sd0 ^ 2), n3 = noise2(sd0 ^ 3), n4 = noise2(sd0 ^ 4), n5 = noise2(sd0 ^ 5);
        const T = cfg.T || 0.04;
        let SL;
        if (cfg.round) {
          SL = [0, 2.1, -2.1].map((da, j) => {
            const a = Math.PI / 2 + da + r.range(-0.25, 0.25), d = r.range(0.26, 0.32);
            return { cx: Math.cos(a) * d, cy: Math.sin(a) * d, R: r.range(0.25, 0.28), z: [0.02, 0, 0.01][j] };
          });
        } else {
          SL = [
            { cx: r.range(-0.1, -0.03), cy: r.range(0.08, 0.16), hx: r.range(0.45, 0.49), hy: r.range(0.25, 0.28), rot: r.range(-0.28, -0.1), z: 0 },
            { cx: r.range(0.03, 0.1), cy: r.range(-0.17, -0.09), hx: r.range(0.43, 0.47), hy: r.range(0.24, 0.27), rot: r.range(0.22, 0.42), z: 0.026 },
          ];
        }
        SL.forEach((s) => { s.c = Math.cos(s.rot || 0); s.s = Math.sin(s.rot || 0); s.side = r() < 0.5 ? 1 : -1; s.o = r.range(0, 40); });
        const P = cfg.paste, P2 = cfg.paste2, RD = cfg.rind;
        return function (x, y, o) {
          let best = -9, bj = -1, cov = 0, bax = 0, bay = 0, bsd = 0;
          for (let j = 0; j < SL.length; j++) {
            const s = SL[j];
            const dx = x - s.cx, dy = y - s.cy;
            let ax, ay, sd;
            if (cfg.round) {
              ax = dx; ay = dy;
              sd = Math.sqrt(dx * dx + dy * dy) - s.R * (1 + 0.025 * Math.sin(Math.atan2(dy, dx) * 4 + s.o));
            } else {
              ax = dx * s.c + dy * s.s; ay = -dx * s.s + dy * s.c;
              if (ax > s.hx + 0.05 || ax < -s.hx - 0.05 || ay > s.hy + 0.05 || ay < -s.hy - 0.05) continue;
              sd = sdRoundBox(ax, ay, s.hx, s.hy, 0.07);
            }
            sd += (cfg.crumb || 0.003) * n1(x * 18 + s.o, y * 18);
            const cv = 0.5 - sd * RPX;
            if (cv <= 0) continue;
            if (cv > cov) cov = cv;
            // tranche souple : bords arrondis, les bouts s'affaissent un peu
            const hh = s.z + T * (0.45 + 0.55 * smooth(0, 0.03, -sd)) - (cfg.round ? 0 : 0.045 * (ax / s.hx) * (ax / s.hx)) + 0.003 * n2(x * 6 + s.o, y * 6);
            if (hh > best) { best = hh; bj = j; bax = ax; bay = ay; bsd = sd; }
          }
          if (bj < 0) return;
          const s = SL[bj];
          o.a = cov > 1 ? 1 : cov;
          const m = 0.5 + 0.5 * n2(x * 3.5 + s.o, y * 3.5);
          o.r = P[0] + (P2[0] - P[0]) * m; o.g = P[1] + (P2[1] - P[1]) * m; o.b = P[2] + (P2[2] - P[2]) * m;
          const v = 1 + (cfg.grain || 0.02) * n3(x * 28, y * 28);
          o.r *= v; o.g *= v; o.b *= v;
          let h = best + 0.0015 * n4(x * 14, y * 14);
          if (cfg.round) h += 0.004 * Math.sin(Math.sqrt(bax * bax + bay * bay) * 32 + 2.5 * n2(x * 4, y * 4)); // moulé à la louche
          if (cfg.marble) {
            // bleu : veines et poches bleu-vert irrégulières (jamais de petits trous ronds)
            const wx = x + 0.22 * n1(x * 1.8, y * 1.8), wy = y + 0.22 * n1(x * 1.8 + 5, y * 1.8 - 3);
            const vein = 1 - smooth(0.02, 0.085, Math.abs(n4(wx * 3.6, wy * 3.6)));
            const pocket = smooth(0.34, 0.56, n5(wx * 7.5 + 3, wy * 7.5)) * smooth(-0.2, 0.35, n2(x * 2.5, y * 2.5));
            const mb = Math.max(vein * 0.85, pocket);
            tint(o, [96, 126, 112], mb * 0.9);
            tint(o, [58, 80, 72], smooth(0.6, 1, mb) * 0.7);
            h -= 0.003 * pocket;
          }
          if (cfg.cracks) {
            // salers : fines fêlures d'une pâte plus sèche
            const c = (1 - smooth(0, 0.035, Math.abs(n4(x * 5 + 2, y * 5)))) * smooth(0.1, 0.4, n5(x * 2, y * 2));
            tint(o, [192, 142, 60], c * 0.6);
            h -= 0.004 * c;
          }
          // croûte
          let rind = 0;
          if (cfg.rindW) {
            if (cfg.round) rind = smooth(-cfg.rindW - 0.006, -cfg.rindW + 0.004, bsd);
            else {
              const e = cfg.sides === 2 ? Math.abs(bay) : bay * s.side;
              rind = smooth(s.hy - cfg.rindW - 0.006, s.hy - cfg.rindW + 0.004, e + 0.004 * n5(x * 30, y * 30));
            }
          }
          if (rind > 0) {
            const mm = 0.5 + 0.5 * n5(x * 16 + 9, y * 16);
            const rc = lerp3(RD[0], RD[1], mm);
            if (RD[2] && n4(x * 40 + 3, y * 40) > 0.5) { rc[0] = RD[2][0]; rc[1] = RD[2][1]; rc[2] = RD[2][2]; }
            if (cfg.bloom) { const f = 1 + 0.035 * n3(x * 80, y * 80); rc[0] *= f; rc[1] *= f; rc[2] *= f; }
            tint(o, rc, rind);
            h -= 0.004 * rind - (cfg.rough || 0) * rind * n3(x * 34, y * 34);
          }
          o.h = h; o.hb = best - T;
          o.sp = (cfg.sp || 0.18) * (1 - 0.8 * rind) + (cfg.rindSp || 0.04) * rind; o.sh = cfg.sh || 20; o.ss = (cfg.ss || 0.3) + 0.12; o.cc = (cfg.cc != null ? cfg.cc : 0.14) * (1 - rind);
          o.id = 1 + bj; o.k = 6;
          if (rind > 0.5) { o.sr = o.r * 0.92; o.sg = o.g * 0.9; o.sb = o.b * 0.88; } else { o.sr = P[0] * 0.95; o.sg = P[1] * 0.93; o.sb = P[2] * 0.9; }
        };
      });
    }
    cheeseSlices('st-nectaire', { paste: [243, 229, 190], paste2: [236, 216, 170], rind: [[204, 146, 96], [146, 136, 120], [230, 222, 204]], rindW: 0.075, sides: 1, sp: 0.2, ss: 0.32, rough: 0.006 });
    cheeseSlices('bleu', { paste: [241, 236, 216], paste2: [233, 226, 200], rind: [[216, 202, 160], [198, 186, 142]], rindW: 0.016, sides: 1, marble: true, sp: 0.16, ss: 0.25, crumb: 0.008 });
    cheeseSlices('cantal', { paste: [243, 218, 146], paste2: [237, 207, 126], rind: [[208, 194, 166], [182, 170, 148]], rindW: 0.022, sides: 1, sp: 0.18, ss: 0.28 });
    cheeseSlices('salers', { paste: [235, 192, 94], paste2: [225, 177, 74], rind: [[152, 102, 62], [120, 110, 96], [182, 114, 64]], rindW: 0.045, sides: 1, cracks: true, crumb: 0.012, sp: 0.14, ss: 0.22 });
    cheeseSlices('aurillac', { paste: [245, 228, 180], paste2: [241, 217, 158], rind: [[249, 247, 240], [236, 231, 218]], rindW: 0.04, sides: 2, bloom: true, sp: 0.28, ss: 0.32, rindSp: 0.02 });
    cheeseSlices('chevre', { round: true, T: 0.06, paste: [255, 253, 248], paste2: [250, 247, 236], rind: [[240, 236, 224], [230, 224, 208]], rindW: 0.028, sp: 0.12, ss: 0.45, grain: 0.012 });

    /* ---------- Fromage fondu (vue assemblée) : il nappe le steak et coule sur les bords ---------- */
    function cheeseMelt(id, cfg) {
      def(id, { ext: 1.08, hmax: 0.06, hbmin: -0.2 }, () => {
        const sd0 = hash(id), r = rng(sd0);
        const n1 = noise2(sd0 ^ 1), n2 = noise2(sd0 ^ 2), n3 = noise2(sd0 ^ 3), n4 = noise2(sd0 ^ 4), n5 = noise2(sd0 ^ 5), nH = noise2(sd0 ^ 6), nF = noise2(sd0 ^ 8);
        // la nappe ne fait pas un disque régulier : par endroits elle déborde et pend (lobes),
        // ailleurs elle s'arrête avant le bord du steak (on voit la viande)
        const OV = new Float32Array(1025);
        for (let i = 0; i <= 1024; i++) {
          const th = (i / 1024) * TAU;
          OV[i] = smooth(-0.3, 0.35, nF(Math.cos(th) * 1.25 + 3, Math.sin(th) * 1.25 - 2) + (cfg.low ? -0.1 : 0.12));
        }
        const over = (th) => { let f = (th / TAU) * 1024; f -= Math.floor(f / 1024) * 1024; const i0 = f | 0; return OV[i0] + (OV[i0 + 1] - OV[i0]) * (f - i0); };
        // coulures arrondies là où la nappe déborde le plus, surtout vers l'avant (on les voit)
        const front = Math.PI / 2;
        const best = (a0, a1) => { let bt = a0, bv = -1; for (let k = 0; k <= 24; k++) { const t = a0 + ((a1 - a0) * k) / 24, v = over(t); if (v > bv) { bv = v; bt = t; } } return [bt, bv]; };
        const D = [];
        if (!cfg.low) {
          const m0 = best(front - 0.7, front + 0.7), m1 = best(front + 0.75, front + 1.6), m2 = best(front - 1.6, front - 0.75);
          D.push({ th: m0[0], w: r.range(0.13, 0.17), L: r.range(0.07, 0.1) });
          if (m1[1] > 0.5) D.push({ th: m1[0], w: r.range(0.1, 0.14), L: r.range(0.03, 0.055) });
          if (m2[1] > 0.5) D.push({ th: m2[0], w: r.range(0.1, 0.14), L: r.range(0.035, 0.06) });
          // la grande coulure de devant a toujours sa nappe qui déborde
          const c = D[0].th;
          for (let i = 0; i <= 1024; i++) { const th = (i / 1024) * TAU, d = angDiff(th, c) / 0.42; if (d > -1 && d < 1) OV[i] = Math.max(OV[i], 1 - d * d * d * d); }
        }
        const P = cfg.paste, P2 = cfg.paste2;
        const SAG = cfg.low ? 0.012 : 0.03, SAGV = cfg.low ? 0.006 : 0.018;
        const SAGT = angTab((th) => Math.max(0.008, SAG + SAGV * nH(Math.cos(th) * 2.6, Math.sin(th) * 2.6) + 0.006 * nH(Math.cos(th) * 7 + 5, Math.sin(th) * 7)));
        const LIPT = angTab((th) => n1(Math.cos(th) * 2.5, Math.sin(th) * 2.5));
        return function (x, y, o) {
          const rr = Math.sqrt(x * x + y * y);
          if (rr > 1.2) return;
          const th = Math.atan2(y, x), ov = over(th);
          const R0 = PATTY(th) - 0.05 * (1 - ov); // en retrait là où elle ne déborde pas
          let drip = 0, wt = 0;
          for (let k = 0; k < D.length; k++) {
            const da = angDiff(th, D[k].th) / D[k].w;
            if (da > -1 && da < 1) {
              const ad = da < 0 ? -da : da;
              const Lk = D[k].L * Math.sqrt(1 - da * da) * (1 - 0.75 * smooth(0.62, 1, ad));
              if (Lk > drip) { drip = Lk; wt = da; }
            }
          }
          const lip = 0.008 + ov * (0.012 + 0.006 * LIPT(th)) + 0.06 * drip;
          const Rm = R0 + lip;
          const a = 0.5 + (Rm - rr) * RPX;
          if (a <= 0) return;
          o.a = a > 1 ? 1 : a;
          let h, hb, e = 0;
          if (rr < R0) {
            const u = rr / R0;
            h = 0.016 + 0.012 * (1 - u * u) + 0.0045 * n2(x * 4.2, y * 4.2) + 0.0018 * n3(x * 13, y * 13);
            hb = h - 0.02;
          } else {
            e = (rr - R0) / lip;
            h = 0.016 - 0.028 * e * e;
            // bord qui pend (rideau) là où ça déborde ; simple arrondi ailleurs
            hb = (h - 0.02) * (1 - ov) - (SAGT(th) + drip) * ov;
            o.hr = 0.016 - 0.028;
            o.wt = drip > 0.004 ? wt : 0;
          }
          const m = 0.5 + 0.5 * n2(x * 2.6, y * 2.6);
          o.r = P[0] + (P2[0] - P[0]) * m; o.g = P[1] + (P2[1] - P[1]) * m; o.b = P[2] + (P2[2] - P[2]) * m;
          if (cfg.streak) {
            // traînées de la croûte ou du bleu, étirées par la fonte
            const k = (1 - smooth(0, cfg.streak.w, Math.abs(n4(x * cfg.streak.f, y * cfg.streak.f * 0.6 + 3)))) * smooth(cfg.streak.lo, cfg.streak.lo + 0.3, n5(x * 2.2, y * 2.2));
            tint(o, cfg.streak.col, k * cfg.streak.amt);
          }
          if (cfg.blots) {
            const k = smooth(0.5, 0.68, n5(x * 5 + 7, y * 5)) * smooth(0, 0.4, n1(x * 2, y * 2 + 4));
            tint(o, cfg.blots, k * 0.85);
          }
          // plus épais au centre : un peu plus doré ; le bord qui a coulé, un peu plus soutenu
          const th2 = rr < R0 ? 1 - rr / R0 : 0;
          o.r *= 1 - 0.04 * th2; o.g *= 1 - 0.07 * th2; o.b *= 1 - 0.14 * th2;
          const edge = ov * e;
          o.r *= 1 - 0.02 * edge; o.g *= 1 - 0.06 * edge; o.b *= 1 - 0.16 * edge;
          o.h = h; o.hb = hb;
          o.sp = cfg.sp || 0.42; o.sh = cfg.sh || 36; o.cc = 0.62; o.ss = 0.62;
          o.id = 1; o.k = 7;
          o.sr = o.r * 0.97; o.sg = o.g * 0.9; o.sb = o.b * 0.8;
        };
      });
    }
    const MELT = {
      'st-nectaire': { paste: [244, 224, 168], paste2: [238, 212, 148], streak: { col: [206, 150, 96], f: 7, w: 0.06, lo: 0.1, amt: 0.6 } },
      bleu: { paste: [236, 226, 190], paste2: [228, 216, 176], streak: { col: [98, 128, 114], f: 6, w: 0.07, lo: -0.1, amt: 0.75 }, blots: [112, 138, 122] },
      cantal: { paste: [244, 210, 118], paste2: [238, 198, 98] },
    };
    Object.keys(MELT).forEach((k) => {
      cheeseMelt(k + '-melt', MELT[k]);
      cheeseMelt(k + '-melt2', Object.assign({ low: true }, MELT[k])); // sous un autre fromage : juste une lèvre
    });
    cheeseMelt('salers-melt', { paste: [238, 186, 80], paste2: [230, 172, 62], streak: { col: [176, 116, 66], f: 6, w: 0.05, lo: 0.2, amt: 0.4 } });
    cheeseMelt('aurillac-melt', { paste: [246, 230, 182], paste2: [242, 220, 160], blots: [250, 248, 242] });

    /* ---------- Chèvre fondant (vue assemblée) : rondelles affaissées, gratinées ---------- */
    def('chevre-melt', { ext: 0.95, hmax: 0.12, hbmin: -0.03 }, () => {
      const sd0 = hash('chevre'), r = rng(sd0); // mêmes rondelles que la vue éclatée
      const n1 = noise2(sd0 ^ 1), n2 = noise2(sd0 ^ 12), n3 = noise2(sd0 ^ 13);
      const SL = [0, 2.1, -2.1].map((da, j) => {
        const a = Math.PI / 2 + da + r.range(-0.25, 0.25), d = r.range(0.26, 0.32);
        return { cx: Math.cos(a) * d, cy: Math.sin(a) * d, R: r.range(0.25, 0.28) * 1.12, z: [0.012, 0, 0.006][j], o: j * 13 };
      });
      return function (x, y, o) {
        let best = -9, bj = -1, cov = 0, brho = 0;
        for (let j = 0; j < SL.length; j++) {
          const s = SL[j];
          const dx = x - s.cx, dy = y - s.cy;
          const d = Math.sqrt(dx * dx + dy * dy), Re = s.R * (1 + 0.04 * n1(dx * 6 + s.o, dy * 6));
          const cv = (Re - d) * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          const rho = Math.min(1, d / Re);
          const hh = s.z + 0.045 * Math.sqrt(Math.max(0, 1 - Math.pow(rho, 2.6))) + 0.004;
          if (hh > best) { best = hh; bj = j; brho = rho; }
        }
        if (bj < 0) return;
        o.a = cov > 1 ? 1 : cov;
        o.r = 250; o.g = 247; o.b = 238;
        const gr = smooth(0.05, 0.6, n2(x * 5, y * 5)) * smooth(0.95, 0.3, brho);
        tint(o, [234, 192, 120], gr * 0.85);
        tint(o, [204, 142, 72], smooth(0.55, 0.78, n3(x * 11, y * 11)) * gr);
        o.h = best + 0.002 * n3(x * 20, y * 20); o.hb = SL[bj].z;
        o.sp = 0.3; o.sh = 30; o.cc = 0.35; o.ss = 0.55;
        o.id = 1 + bj; o.k = 6;
        o.sr = 240; o.sg = 234; o.sb = 220;
      };
    });

    /* ---------- Jambon sec : tranches fines plissées, rouge profond, gras nacré ---------- */
    def('jambon', { ext: 1.2, hmax: 0.19, hbmin: -0.16 }, () => {
      const r = rng(hash('jambon sec'));
      const n1 = noise2(81), n2 = noise2(82), n3 = noise2(83), n4 = noise2(84);
      const SL = [];
      for (let j = 0; j < 3; j++) {
        const th = (j / 3) * TAU + r.range(-0.3, 0.3) + 0.9, d = r.range(0.28, 0.36);
        const rot = th + Math.PI / 2 + r.range(-0.3, 0.3);
        SL.push({ cx: Math.cos(th) * d, cy: Math.sin(th) * d, ra: r.range(0.62, 0.72), rb: r.range(0.4, 0.46), c: Math.cos(rot), s: Math.sin(rot), z: j * 0.016, ph: r() * 50, fq: r.range(8, 11), side: r() < 0.5 ? 1 : -1 });
      }
      return function (x, y, o) {
        const rr = Math.sqrt(x * x + y * y);
        let best = -9, bj = -1, cov = 0, bf = 0, bax = 0, bay = 0, sec = -9;
        for (let j = 0; j < SL.length; j++) {
          const s = SL[j];
          const dx = x - s.cx, dy = y - s.cy;
          const ax = dx * s.c + dy * s.s, ay = -dx * s.s + dy * s.c;
          const ex = ax / s.ra, ey = ay / s.rb;
          const rho = Math.sqrt(ex * ex + ey * ey);
          if (rho > 1.25) continue;
          const phi = Math.atan2(ey, ex);
          const re = 1 + 0.07 * Math.sin(phi * 5 + s.ph) + 0.05 * n1(ex * 2 + s.ph, ey * 2);
          const cv = (re - rho) * s.rb * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          // tranche froncée : plis serrés et irréguliers, plus marqués vers le bord
          const f = Math.sin(ax * s.fq + s.ph + 1.6 * n2(ax * 2 + s.ph, ay * 2));
          let h = s.z + 0.03 + 0.055 * (0.5 + 0.5 * f) * (0.3 + 0.7 * Math.min(1, rho)) + 0.012 * Math.sin(ay * 15 + s.ph * 2) * Math.min(1, rho) + 0.015 * (1 - Math.min(1, rho * rho));
          const out = smooth(0.86, 1.12, rr);
          h -= 0.12 * out * out;
          if (h > best) { sec = best; best = h; bj = j; bf = f; bax = dx; bay = dy; } else if (h > sec) sec = h;
        }
        if (bj < 0) return;
        const s = SL[bj];
        o.a = cov > 1 ? 1 : cov;
        // maigre : rouge rosé profond, translucide, plus sombre au creux des plis
        const lx = bax * s.c + bay * s.s, ly = -bax * s.s + bay * s.c;
        const v = n3(x * 4, y * 4);
        o.r = 108 + 13 * v; o.g = 32 + 6 * v; o.b = 34 + 6 * v;
        const fold = 0.8 + 0.2 * (0.5 + 0.5 * bf);
        o.r *= fold; o.g *= fold; o.b *= fold;
        tint(o, [96, 20, 28], smooth(0.25, 0.8, n4(lx * 2.4 + 3, ly * 2.4)) * 0.4); // muscles plus sombres
        // persillé : quelques traînées claires dans le sens de la tranche
        tint(o, [224, 156, 154], (1 - smooth(0, 0.05, Math.abs(n4(lx * 2 + 5, ly * 8)))) * smooth(0.35, 0.7, n3(x * 3 + 7, y * 3)) * 0.4);
        // gras nacré le long d'un bord de la tranche, bordé de rose
        const w = (ly * s.side) / s.rb;
        const fat = smooth(0.56, 0.68, w + 0.08 * n1(x * 6, y * 6));
        tint(o, [244, 232, 220], fat);
        tint(o, [224, 158, 150], fat * (1 - smooth(0.68, 0.84, w)) * 0.55);
        o.h = best;
        const under = sec > -5; // une autre tranche dessous : la tranche descend jusqu'à elle
        o.hb = under ? Math.min(best - 0.008, Math.max(sec - 0.004, best - 0.07)) : best - 0.012;
        o.sp = 0.26 + 0.2 * fat; o.sh = 30 + 12 * fat; o.cc = 0.28 + 0.25 * fat; o.ss = 0.34 - 0.12 * fat;
        o.id = 1 + bj; o.k = 8;
        if (under) { o.sr = o.r * 0.62; o.sg = o.g * 0.6; o.sb = o.b * 0.6; } else { o.sr = Math.min(255, o.r * 1.05); o.sg = o.g * 1.1; o.sb = o.b * 1.1; }
      };
    });

    /* ---------- Chorizo : rondelles rouge-orangé, mosaïque de gras, huile ---------- */
    def('chorizo', { ext: 0.9, hmax: 0.12 }, () => {
      const r = rng(hash('chorizo'));
      const n1 = noise2(91), n2 = noise2(92);
      const W = worley(93);
      const SL = [{ cx: r.range(-0.05, 0.05), cy: r.range(-0.05, 0.05) }];
      const a0 = r() * TAU;
      for (let j = 0; j < 6; j++) {
        const a = a0 + (j / 6) * TAU + r.range(-0.15, 0.15), d = r.range(0.4, 0.46);
        SL.push({ cx: Math.cos(a) * d, cy: Math.sin(a) * d });
      }
      SL.forEach((s, j) => { s.R = r.range(0.155, 0.175); s.z = j === 0 ? 0.03 : (j % 3) * 0.01; s.o = r.range(0, 99); });
      return function (x, y, o) {
        let best = -9, bj = -1, cov = 0, brho = 0;
        for (let j = 0; j < SL.length; j++) {
          const s = SL[j];
          const dx = x - s.cx, dy = y - s.cy;
          const d2 = dx * dx + dy * dy;
          if (d2 > s.R * s.R * 1.2) continue;
          const d = Math.sqrt(d2), Re = s.R * (1 + 0.02 * n1(dx * 9 + s.o, dy * 9));
          const cv = (Re - d) * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          const rho = Math.min(1, d / Re);
          const hh = s.z + 0.022 + 0.012 * rho * rho;
          if (hh > best) { best = hh; bj = j; brho = rho; }
        }
        if (bj < 0) return;
        const s = SL[bj];
        o.a = cov > 1 ? 1 : cov;
        // mosaïque : maigre au paprika, morceaux de gras rosé (polygones, pas des trous)
        W.at((x - s.cx) * 26 + s.o, (y - s.cy) * 26);
        const fat = W.id < 0.2;
        const tone = W.id;
        if (fat) { o.r = 226; o.g = 170; o.b = 148; } else { o.r = 164 + 40 * tone; o.g = 38 + 20 * tone; o.b = 26 + 12 * tone; }
        const edge = 1 - smooth(0.02, 0.09, W.f2 - W.f1);
        tint(o, [134, 28, 20], edge * (fat ? 0.35 : 0.5));
        tint(o, [112, 26, 18], smooth(0.92, 0.97, brho));
        const hh = best + (fat ? 0.002 : 0) + 0.0015 * n2(x * 30, y * 30);
        o.h = hh; o.hb = s.z;
        o.sp = 0.4; o.sh = 40; o.cc = 0.5; o.ss = 0.32;
        o.id = 1 + bj; o.k = 9;
        o.sr = 118; o.sg = 30; o.sb = 20;
      };
    });

    /* ---------- Poivrons rôtis : lanières rouges et jaunes, brillantes, taches grillées ---------- */
    def('poivrons', { ext: 0.98, hmax: 0.14 }, () => {
      const r = rng(hash('poivrons'));
      const n1 = noise2(101), n2 = noise2(102), n3 = noise2(103);
      const ST = [];
      const cols = ['r', 'y', 'r', 'y', 'r'];
      cols.forEach((c, j) => {
        const a = r() * TAU, d = r.range(0.05, 0.38);
        const cx = Math.cos(a) * d, cy = Math.sin(a) * d;
        const ang = r() * TAU, L = r.range(0.62, 0.85), bend = r.range(-0.2, 0.2);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const P0 = [cx - dx * L / 2, cy - dy * L / 2], P2 = [cx + dx * L / 2, cy + dy * L / 2], P1 = [cx - dy * bend * L, cy + dx * bend * L];
        const pts = [];
        for (let k = 0; k <= 20; k++) {
          const t = k / 20, u = 1 - t;
          pts.push([u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]);
        }
        let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
        pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
        const hw = r.range(0.072, 0.095);
        ST.push({ pts, hw, x0: x0 - hw, x1: x1 + hw, y0: y0 - hw, y1: y1 + hw, z: j * 0.009, red: c === 'r', o: r.range(0, 60), L });
      });
      return function (x, y, o) {
        let best = -9, bj = -1, cov = 0, bt = 0, bq = 0;
        for (let j = 0; j < ST.length; j++) {
          const s = ST[j];
          if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
          let dmin = 9, tmin = 0, side = 1;
          const P = s.pts;
          for (let k = 0; k < 20; k++) {
            const ax = P[k][0], ay = P[k][1], bx = P[k + 1][0] - ax, by = P[k + 1][1] - ay;
            const l2 = bx * bx + by * by;
            let t = ((x - ax) * bx + (y - ay) * by) / l2;
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const ex = x - ax - bx * t, ey = y - ay - by * t;
            const d = ex * ex + ey * ey;
            if (d < dmin) { dmin = d; tmin = (k + t) / 20; side = bx * ey - by * ex > 0 ? 1 : -1; }
          }
          const d = Math.sqrt(dmin);
          const tt = 2 * tmin - 1;
          const w = s.hw * (1 - 0.55 * Math.pow(Math.abs(tt), 8)) * (1 + 0.1 * n1(x * 9 + s.o, y * 9));
          const cv = (w - d) * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          const q = Math.min(1, d / w);
          // lanière plate, bords un peu roulés, ondulée et fripée (la peau rôtie se ride)
          const hh = s.z + 0.024 + 0.006 * (1 - q * q) + 0.007 * q * q * q * q + 0.007 * Math.sin(tmin * s.L * 14 + s.o) * (0.6 + 0.4 * q)
            + 0.0025 * n2(x * 26 + s.o, y * 26) + 0.0015 * Math.sin(tmin * s.L * 70 + 4 * n1(x * 5, y * 5));
          if (hh > best) { best = hh; bj = j; bt = tmin; bq = q * side; }
        }
        if (bj < 0) return;
        const s = ST[bj];
        o.a = cov > 1 ? 1 : cov;
        if (s.red) { o.r = 176; o.g = 28; o.b = 16; } else { o.r = 236; o.g = 150; o.b = 28; }
        const v = 1 + 0.07 * n2(x * 6 + s.o, y * 6);
        o.r *= v; o.g *= v; o.b *= v;
        const e = Math.abs(bq);
        tint(o, s.red ? [128, 14, 12] : [196, 110, 14], smooth(0.55, 1, e) * 0.55);
        tint(o, s.red ? [226, 80, 60] : [246, 204, 90], smooth(0.4, 0.8, n2(x * 5 + s.o, y * 5)) * (1 - e) * 0.35); // chair plus claire par endroits
        // cloques grillées
        const ch = smooth(0.42, 0.74, n3(x * 5 + s.o, y * 5)) * (0.55 + 0.45 * smooth(-0.3, 0.5, n1(x * 18, y * 18)));
        tint(o, s.red ? [74, 20, 10] : [120, 66, 16], ch * 0.8);
        tint(o, s.red ? [150, 44, 20] : [206, 120, 30], smooth(0.2, 0.6, n1(x * 3 + s.o, y * 3)) * 0.3); // rôti inégal
        o.h = best - 0.004 * ch; o.hb = best - 0.013;
        if (Math.abs(bq) > 0.55) o.hr = ST[bj].z + 0.03;
        o.sp = 0.4 * (1 - 0.6 * ch); o.sh = 38; o.cc = 0.75 * (1 - 0.8 * ch); o.ss = 0.5;
        o.id = 1 + bj; o.k = 10;
        o.sr = o.r * 0.8; o.sg = o.g * 0.75; o.sb = o.b * 0.7;
      };
    });

    /* ---------- Noix : cerneaux bilobés, plissés ---------- */
    def('noix', { ext: 0.92, hmax: 0.12 }, () => {
      const r = rng(hash('noix'));
      const n1 = noise2(111), n2 = noise2(112), n3 = noise2(113);
      const NU = [];
      for (let j = 0; NU.length < 8 && j < 300; j++) {
        const a = r() * TAU, d = 0.72 * Math.sqrt(r());
        const x = Math.cos(a) * d, y = Math.sin(a) * d;
        const hl = r.range(0.095, 0.125);
        if (NU.some((n) => Math.hypot(n.x - x, n.y - y) < (n.hl + hl) * 1.05)) continue;
        const ang = r() * TAU;
        NU.push({ x, y, hl, hw: hl * r.range(0.66, 0.78), c: Math.cos(ang), s: Math.sin(ang), z: r.range(0, 0.02), o: r.range(0, 60), tone: r() });
      }
      return function (x, y, o) {
        let best = -9, bj = -1, cov = 0, bu = 0, bv = 0, brho = 0;
        for (let j = 0; j < NU.length; j++) {
          const n = NU[j];
          const dx = x - n.x, dy = y - n.y;
          if (dx * dx + dy * dy > n.hl * n.hl * 1.3) continue;
          const u = (dx * n.c + dy * n.s) / n.hl, v = (-dx * n.s + dy * n.c) / n.hw;
          const rho = Math.sqrt(0.5 * u * u * u * u + 0.5 * u * u + v * v);
          const notch = 0.35 * Math.exp(-(v * v) / 0.03) * smooth(0.45, 1, u);
          const re = 1 - notch + 0.05 * n1(u * 3 + n.o, v * 3);
          const cv = (re - rho) * n.hw * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          const rr = Math.min(1, rho / re);
          const hh = n.z + 0.05 * Math.sqrt(1 - rr * rr);
          if (hh > best) { best = hh; bj = j; bu = u; bv = v; brho = rr; }
        }
        if (bj < 0) return;
        const n = NU[bj];
        o.a = cov > 1 ? 1 : cov;
        // circonvolutions du cerneau + sillon central
        const wr = 1 - Math.abs(n2(bu * 2.6 + n.o, bv * 3.4));
        const groove = Math.exp(-(bv * bv) / 0.012);
        const h = best + 0.012 * wr * wr * (1 - brho * 0.5) - 0.02 * groove * (1 - brho);
        const deep = clamp01(0.55 * (1 - wr) + 0.7 * groove);
        o.r = 206 - 16 * n.tone; o.g = 156 - 14 * n.tone; o.b = 96 - 10 * n.tone;
        tint(o, [112, 70, 36], deep * 0.75);
        tint(o, [182, 124, 70], smooth(0.2, 0.7, n3(x * 9, y * 9)) * 0.35);
        o.h = h; o.hb = n.z;
        if (brho > 0.75) o.hr = n.z + 0.004;
        o.sp = 0.22; o.sh = 26; o.cc = 0.1; o.ss = 0.2;
        o.id = 1 + bj; o.k = 11;
        o.sr = 150; o.sg = 100; o.sb = 56;
      };
    });

    /* ---------- Miel : un filet versé en zigzag, ambré, brillant ----------
       La cuillère va et vient au-dessus du fromage : le filet est fin là où elle va vite, plus épais
       aux demi-tours (où il fait de petites gouttes), et s'effile aux deux bouts. */
    def('miel', { ext: 0.86, hmax: 0.06 }, () => {
      const r = rng(hash('miel'));
      const n1 = noise2(121);
      const R = 0.72, TURNS = 5.25, ph = r() * TAU, rot = r.range(-0.6, 0.6), cr = Math.cos(rot), sr = Math.sin(rot);
      const HW = 0.017, N = 240;
      const SEG = [], POOL = [];
      let prev = null;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const phs = t * TURNS * TAU + ph;
        const v0 = (t * 2 - 1) * R * 0.84;
        const half = Math.sqrt(Math.max(0, R * R - v0 * v0));
        const sw = Math.sin(phs);
        const v = v0 + 0.032 * Math.sin(2 * phs); // petites boucles aux demi-tours
        const u = half * (0.8 * sw + 0.12 * Math.sin(phs * 1.37 + 1.1)) * (0.74 + 0.26 * Math.sin(t * 2.3 * TAU + ph * 1.3)) + 0.02 * Math.sin(t * 37 + ph * 2);
        const px = u * cr - v * sr, py = u * sr + v * cr;
        const w = HW * (0.42 + 0.58 * Math.pow(Math.abs(sw), 3)) * smooth(0, 0.05, t) * smooth(0, 0.05, 1 - t);
        if (prev) SEG.push({ ax: prev[0], ay: prev[1], bx: px - prev[0], by: py - prev[1], wa: prev[2], wb: w });
        prev = [px, py, w];
      }
      // de petites gouttes à quelques demi-tours
      const turnsAt = [];
      for (let k = -2; k < 14; k++) {
        const t = ((k + 0.5) * Math.PI - ph) / (TURNS * TAU);
        if (t > 0.12 && t < 0.88) turnsAt.push(Math.round(t * N));
      }
      for (let k = 0; k < 3 && turnsAt.length; k++) {
        const j = turnsAt.splice(Math.floor(r() * turnsAt.length), 1)[0];
        const sg = SEG[Math.min(SEG.length - 1, j)];
        POOL.push({ x: sg.ax, y: sg.ay, R: r.range(0.028, 0.042) });
      }
      // grille d'accélération : chaque point ne regarde que les tronçons proches
      const G = 0.08, E = 0.86, NC = Math.ceil((2 * E) / G);
      const cells = new Array(NC * NC);
      const put = (x0, y0, x1, y1, idx) => {
        const i0 = Math.max(0, Math.floor((x0 + E) / G)), i1 = Math.min(NC - 1, Math.floor((x1 + E) / G));
        const j0 = Math.max(0, Math.floor((y0 + E) / G)), j1 = Math.min(NC - 1, Math.floor((y1 + E) / G));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * NC + i] || (cells[j * NC + i] = [])).push(idx);
      };
      SEG.forEach((sg, k) => {
        const m = Math.max(sg.wa, sg.wb) + 0.02;
        put(Math.min(sg.ax, sg.ax + sg.bx) - m, Math.min(sg.ay, sg.ay + sg.by) - m, Math.max(sg.ax, sg.ax + sg.bx) + m, Math.max(sg.ay, sg.ay + sg.by) + m, k);
      });
      POOL.forEach((p, k) => put(p.x - p.R * 1.3, p.y - p.R * 1.3, p.x + p.R * 1.3, p.y + p.R * 1.3, -1 - k));
      return function (x, y, o) {
        const ci = Math.floor((x + E) / G), cj = Math.floor((y + E) / G);
        if (ci < 0 || cj < 0 || ci >= NC || cj >= NC) return;
        const list = cells[cj * NC + ci];
        if (!list) return;
        let cov = 0, best = -1;
        for (let q = 0; q < list.length; q++) {
          const k = list[q];
          if (k < 0) {
            const p = POOL[-1 - k];
            const d = Math.hypot(x - p.x, y - p.y) / (p.R * (1 + 0.1 * n1(x * 24, y * 24)));
            if (d >= 1.05) continue;
            const cv = (1 - d) * p.R * RPX + 0.5;
            if (cv > cov) cov = cv;
            const hh = 0.014 + 0.018 * Math.sqrt(Math.max(0, 1 - d * d));
            if (hh > best) best = hh;
            continue;
          }
          const sg = SEG[k];
          const ex = x - sg.ax, ey = y - sg.ay;
          const l2 = sg.bx * sg.bx + sg.by * sg.by || 1e-9;
          let t = (ex * sg.bx + ey * sg.by) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const fx = ex - sg.bx * t, fy = ey - sg.by * t;
          const d = Math.sqrt(fx * fx + fy * fy), w = sg.wa + (sg.wb - sg.wa) * t;
          if (w <= 0) continue;
          const cv = (w - d) * RPX + 0.5;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          const qq = Math.min(1, d / w);
          const hh = 0.008 + (0.004 + 0.012 * (w / HW)) * Math.sqrt(1 - qq * qq);
          if (hh > best) best = hh;
        }
        if (best < 0 || cov <= 0) return;
        o.a = cov > 1 ? 1 : cov;
        // l'épaisseur fonce l'ambre ; le miel est translucide et très brillant
        const th = clamp01((best - 0.01) / 0.022);
        o.r = 246 + (186 - 246) * th; o.g = 190 + (104 - 190) * th; o.b = 70 + (16 - 70) * th;
        o.h = best; o.hb = 0.004; o.hr = 0.012;
        o.sp = 0.5; o.sh = 60; o.cc = 1.0; o.ss = 1.0;
        o.id = 1; o.k = 12;
        o.sr = 204; o.sg = 120; o.sb = 22;
      };
    });

    /* ---------- Sauces : couleur commune (la nappe sous le pain, la flaque de l'éclaté) ---------- */
    function sauceInk(sd0, cfg, R, area) {
      const r = rng(sd0 ^ 0x1234);
      const nC = noise2(sd0 ^ 5), nD = noise2(sd0 ^ 7), nE = noise2(sd0 ^ 11);
      const CH = [];
      if (cfg.chives && !area) {
        // ciboulette ciselée : petits tronçons verts
        for (let k = 0; k < 90 * R * R; k++) {
          const a = r() * TAU, d = R * Math.sqrt(r()), ang = r() * TAU;
          CH.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, c: Math.cos(ang), s: Math.sin(ang), hl: r.range(0.018, 0.034), hw: r.range(0.0045, 0.0065), tone: r() });
        }
      } else if ((cfg.chives || cfg.dill) && area) {
        // semés dans un rectangle ; l'aneth en brins fins et plus longs
        const nb = Math.round((cfg.dill ? 150 : 110) * area.hx * area.hy);
        for (let k = 0; k < nb; k++) {
          const ang = r() * TAU;
          CH.push({ x: area.cx + r.range(-area.hx, area.hx), y: area.cy + r.range(-area.hy, area.hy), c: Math.cos(ang), s: Math.sin(ang),
            hl: cfg.dill ? r.range(0.02, 0.034) : r.range(0.018, 0.03), hw: cfg.dill ? r.range(0.0022, 0.0032) : r.range(0.0045, 0.006), tone: r() });
        }
      }
      const COL = cfg.col, COL2 = cfg.col2;
      return function (x, y, o) {
        const m = 0.5 + 0.5 * nC(x * 3, y * 3);
        o.r = COL[0] + (COL2[0] - COL[0]) * m; o.g = COL[1] + (COL2[1] - COL[1]) * m; o.b = COL[2] + (COL2[2] - COL[2]) * m;
        if (cfg.flecks) {
          const F = cfg.flecks;
          tint(o, F.col, smooth(F.t, F.t + 0.1, nD(x * F.f, y * F.f)) * (0.7 + 0.3 * nE(x * 5, y * 5)));
          if (F.col2) tint(o, F.col2, smooth(0.8, 0.9, nE(x * F.f * 1.6 + 9, y * F.f * 1.6)) * 0.7);
        }
        if (cfg.marble) tint(o, cfg.marble, smooth(0.55, 0.75, nE(x * 5, y * 5 + 2)) * smooth(0, 0.5, nD(x * 1.5, y * 1.5)) * 0.5);
        // veines fines et ondulées (du bleu fondu dans la crème) : des traits, jamais des points
        if (cfg.veins) tint(o, cfg.veins, (1 - smooth(0, 0.07, Math.abs(nE(x * 3.2 + 1, y * 3.2)))) * smooth(-0.3, 0.4, nD(x * 1.4, y * 1.4)) * 0.85);
        let up = 0;
        for (let k = 0; k < CH.length; k++) {
          const c = CH[k];
          const ex = x - c.x, ey = y - c.y;
          if (ex * ex + ey * ey > 0.0014) continue;
          const t = (ex * c.c + ey * c.s) / c.hl, q = (-ex * c.s + ey * c.c) / c.hw;
          if (t * t * t * t + q * q < 1) { tint(o, c.tone < 0.5 ? [58, 122, 36] : [98, 156, 52], 0.95); up = 0.003; }
        }
        o.sp = cfg.sp; o.sh = cfg.sh; o.cc = cfg.cc; o.ss = cfg.ss;
        o.id = 1; o.k = 7;
        o.sr = o.r * 0.97; o.sg = o.g * 0.93; o.sb = o.b * 0.88;
        return up;
      };
    }

    // le disque de garniture sur lequel la sauce est glissée, sous le pain du haut
    const PLATE = polar(hash('garniture'), 0.95, [[2, 0.012], [3, 0.018], [5, 0.012], [7, 0.008]], 0.012, 3);

    /* ---------- Sauce glissée sous le pain du haut : une nappe crémeuse qui coule sur la garniture ---------- */
    function drape(id, cfg) {
      def(id, { ext: 1.07, hmax: 0.08, hbmin: -0.2, ky: 1.1 }, () => {
        const sd0 = hash(id), r = rng(sd0);
        const n1 = noise2(sd0 ^ 1), n2 = noise2(sd0 ^ 2), nH = noise2(sd0 ^ 6);
        // débordements : des lobes où la nappe sort de sous le pain, entre eux elle reste en retrait
        const front = Math.PI / 2;
        const LOBES = [front + r.range(0.35, 0.8), front - r.range(0.45, 0.95), front + r.range(-0.15, 0.15) + (r() < 0.5 ? 2.2 : -2.2)]
          .map((th, j) => ({ th, w: r.range(0.4, 0.62), out: j < 2 ? r.range(0.07, 0.1) : r.range(0.04, 0.07) }));
        const OUT = new Float32Array(1025);
        for (let i = 0; i <= 1024; i++) {
          const th = (i / 1024) * TAU;
          let m = 0;
          LOBES.forEach((L) => { const d = angDiff(th, L.th) / L.w; if (d > -1 && d < 1) m = Math.max(m, L.out * (1 - d * d) * (1 - d * d)); });
          OUT[i] = m;
        }
        const ooze = (th) => { let f = (th / TAU) * 1024; f -= Math.floor(f / 1024) * 1024; const i0 = f | 0; return OUT[i0] + (OUT[i0 + 1] - OUT[i0]) * (f - i0); };
        // coulures (courtes, arrondies) au milieu des deux débordements de devant
        const D = [
          { th: LOBES[0].th + r.range(-0.1, 0.1), w: r.range(0.12, 0.16), L: r.range(0.045, 0.075) },
          { th: LOBES[1].th + r.range(-0.1, 0.1), w: r.range(0.1, 0.14), L: r.range(0.03, 0.055) },
        ];
        const ink = sauceInk(sd0, cfg, 0.9);
        const SAGT = angTab((th) => Math.max(0.012, 0.028 + 0.016 * nH(Math.cos(th) * 2.6, Math.sin(th) * 2.6)));
        const LIPT = angTab((th) => n1(Math.cos(th) * 2.5, Math.sin(th) * 2.5));
        return function (x, y, o) {
          const rr = Math.sqrt(x * x + y * y);
          if (rr > 1.15) return;
          const th = Math.atan2(y, x), R0 = PLATE(th) - 0.07 + ooze(th);
          let drip = 0, wt = 0;
          for (let k = 0; k < D.length; k++) {
            const da = angDiff(th, D[k].th) / D[k].w;
            if (da > -1 && da < 1) {
              const ad = da < 0 ? -da : da;
              const Lk = D[k].L * Math.sqrt(1 - da * da) * (1 - 0.75 * smooth(0.62, 1, ad));
              if (Lk > drip) { drip = Lk; wt = da; }
            }
          }
          const lip = 0.022 + 0.006 * LIPT(th) + 0.06 * drip;
          const Rm = R0 + lip;
          const a = 0.5 + (Rm - rr) * RPX;
          if (a <= 0) return;
          o.a = a > 1 ? 1 : a;
          let h, hb;
          if (rr < R0) {
            const u = rr / R0;
            h = 0.022 + 0.014 * (1 - u * u) + 0.005 * n2(x * 4, y * 4);
            hb = h - 0.024;
          } else {
            const e = (rr - R0) / lip;
            h = 0.022 - 0.03 * e * e;
            hb = -(SAGT(th) + drip);
            o.hr = 0.022 - 0.03;
            o.wt = drip > 0.004 ? wt : 0;
          }
          o.h = h + ink(x, y, o);
          o.hb = hb;
        };
      });
    }

    /* ---------- La même sauce, en flaque (vue éclatée) ---------- */
    function puddle(id, cfg) {
      def(id, { ext: 0.92, hmax: 0.06 }, () => {
        const sd0 = hash(id), r = rng(sd0);
        const nB = noise2(sd0 ^ 3);
        const pool = polar(sd0 ^ 13, r.range(0.62, 0.7), [[2, 0.05], [3, 0.07], [5, 0.05], [8, 0.03]], 0.07, 2.5);
        const ink = sauceInk(sd0, cfg, 0.75);
        return function (x, y, o) {
          const rr = Math.sqrt(x * x + y * y), sd = rr - pool(Math.atan2(y, x));
          const a = 0.5 - sd * RPX;
          if (a <= 0) return;
          o.a = a > 1 ? 1 : a;
          const thick = 0.006 + 0.022 * Math.sqrt(clamp01(-sd / 0.04)) + 0.004 * nB(x * 6, y * 6);
          o.hb = 0;
          if (sd > -0.03) o.hr = 0.006;
          o.h = thick + ink(x, y, o);
        };
      });
    }
    const SAUCES = {
      sn: { col: [246, 226, 170], col2: [238, 210, 142], sp: 0.45, sh: 34, cc: 0.75, ss: 0.5 },
      bleu: { col: [242, 236, 212], col2: [226, 224, 198], veins: [104, 136, 120], sp: 0.42, sh: 34, cc: 0.7, ss: 0.45 },
      chili: { col: [196, 42, 20], col2: [214, 66, 26], flecks: { f: 30, t: 0.74, col: [150, 26, 10], col2: [232, 170, 96] }, sp: 0.5, sh: 40, cc: 0.9, ss: 0.55 },
      ciboulette: { col: [250, 248, 238], col2: [238, 234, 218], chives: true, sp: 0.38, sh: 30, cc: 0.6, ss: 0.4 },
    };
    Object.keys(SAUCES).forEach((k) => { drape('drape-' + k, SAUCES[k]); puddle('spread-' + k, SAUCES[k]); });

    /* ======================================================================
       Les autres plats de la carte : viandes, salades composées, wraps.
       Même cuisine que les burgers. Repère commun : l'assiette (ou l'ardoise)
       est centrée en (0, 0), rayon ~1. Chaque garniture ne calcule que son coin
       du plat (cx, cy, ext, exy) ; ce qui est posé porte une ombre douce sur ce
       qui est dessous (shadow). Présentation calquée sur celle du restaurant :
       assiette blanche (viandes, salades), ardoise (wraps, salade auvergnate).
       ====================================================================== */
    // les plats posés à plat se regardent de plus haut que les burgers
    const defP = (id, meta, make) => def(id, Object.assign({ phi: 40 }, meta), make);
    const OMBRE = { r: 0.02, dx: 0.02, dy: 0.03, a: 0.4 };
    const OMBRE_F = { r: 0.035, dx: 0.03, dy: 0.045, a: 0.48 };

    /* ---------- L'assiette blanche : un puits peu profond, un large marli, une lèvre arrondie ---------- */
    const ASS_R = 1.0, PUITS = 0.64;
    function assietteH(r) {
      if (r <= PUITS - 0.1) { const t = r / (PUITS - 0.1); return 0.028 + 0.01 * t * t; }
      if (r <= PUITS) return 0.038 + 0.04 * smooth(PUITS - 0.1, PUITS, r);
      const t = (r - PUITS) / (ASS_R - PUITS);
      return 0.078 + 0.024 * t - 0.03 * Math.pow(smooth(0.84, 1, t), 2);
    }
    const assietteAt = (x, y) => assietteH(Math.sqrt(x * x + y * y));
    defP('assiette', { ext: 1.03, hmax: 0.11 }, () => {
      const n1 = noise2(hash('assiette'));
      return function (x, y, o) {
        const r = Math.sqrt(x * x + y * y);
        const a = 0.5 + (ASS_R - r) * RPX;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        o.h = assietteH(r); o.hb = 0;
        if (r > ASS_R - 0.04) o.hr = o.h - 0.012;
        // émail blanc crémeux ; le fond du puits un rien plus froid
        const well = 1 - smooth(PUITS - 0.08, PUITS + 0.03, r);
        o.r = 242 - 6 * well; o.g = 240 - 4 * well; o.b = 233 + 3 * well;
        const v = 1 + 0.012 * n1(x * 2.5, y * 2.5);
        o.r *= v; o.g *= v; o.b *= v;
        o.sp = 0.3; o.sh = 44; o.cc = 0.85; o.ss = 0.04;
        o.id = 1; o.k = 14;
        o.sr = 230; o.sg = 228; o.sb = 222;
      };
    });

    /* ---------- L'ardoise : une plaque de schiste sombre, bords clivés un peu irréguliers ---------- */
    const ARD_X = 1.12, ARD_Y = 0.82, ARD_TOP = 0.045;
    defP('ardoise', { ext: 1.16, exy: 0.86, hmax: 0.06 }, () => {
      const s0 = hash('ardoise'), n1 = noise2(s0 ^ 1), n2 = noise2(s0 ^ 2), n3 = noise2(s0 ^ 3), n4 = noise2(s0 ^ 4);
      return function (x, y, o) {
        const e = 0.014 * n1(x * 4, y * 4) + 0.006 * n2(x * 15, y * 15);
        const sd = sdRoundBox(x, y, ARD_X, ARD_Y, 0.05) + e;
        const a = 0.5 - sd * RPX;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        // clivage : de longues strates presque parallèles, à peine de relief ; le bord écaillé
        const strata = n3(x * 0.9 + 3, y * 5.5);
        const chip = smooth(-0.05, 0, sd);
        o.h = ARD_TOP + 0.0025 * strata + 0.001 * n4(x * 22, y * 22) - 0.006 * chip * (0.5 + 0.5 * n2(x * 9, y * 9));
        o.hb = 0;
        const t = 0.5 + 0.5 * strata;
        o.r = 38 + 10 * t; o.g = 39 + 10 * t; o.b = 42 + 10 * t;
        tint(o, [74, 74, 76], smooth(0.55, 0.8, n2(x * 1.3, y * 7)) * 0.3); // veines plus claires, allongées
        o.sp = 0.1 + 0.05 * t; o.sh = 14; o.cc = 0.05; o.ss = 0;
        o.id = 1; o.k = 15;
        o.sr = 70; o.sg = 70; o.sb = 72;
      };
    });

    /* ---------- Les feuilles de la salade maison (mêmes familles que celle des burgers, plus la feuille de chêne) ---------- */
    const LEAF_TY = {
      batavia: { base: [218, 234, 150], mid: [138, 200, 66], edge: [82, 158, 40], lob: 0.16, frill: 0.07, ruf: 0.03 },
      lollo: { base: [206, 226, 128], mid: [128, 186, 58], edge: [96, 152, 44], red: [124, 22, 58], lob: 0.12, frill: 0.1, ruf: 0.034 },
      frisee: { base: [236, 240, 160], mid: [176, 218, 84], edge: [112, 176, 46], lob: 0.1, frill: 0.05, deep: 0.55, ruf: 0.024 },
      dark: { base: [150, 196, 88], mid: [74, 140, 40], edge: [46, 100, 28], lob: 0.12, frill: 0.06, ruf: 0.028 },
      chene: { base: [176, 192, 96], mid: [156, 70, 80], edge: [128, 40, 62], lob: 0.22, frill: 0.04, ruf: 0.02, vein: [206, 186, 132] },
      roquette: { base: [146, 188, 84], mid: [96, 150, 52], edge: [72, 124, 40], lob: 0.05, frill: 0.02, deep: 0.6, ruf: 0.01 },
      mache: { base: [140, 190, 86], mid: [98, 156, 58], edge: [78, 134, 48], lob: 0.03, frill: 0.01, ruf: 0.006, vein: [176, 212, 130] },
    };
    const LEAF_VEIN = [236, 246, 200];
    /* un tas de feuilles posé sur un support base(x, y) ; feuilles : { x, y, dir, L, W, z, ty, big } */
    function leafPile(seed, leaves, base) {
      const r = rng(seed);
      const n1 = noise2(seed ^ 1), n2 = noise2(seed ^ 2), n3 = noise2(seed ^ 3);
      const LV = leaves.map((f) => {
        const big = f.big !== false;
        return { ox: f.x, oy: f.y, c: Math.cos(f.dir), s: Math.sin(f.dir), L: f.L, W: f.W, z: f.z, T: LEAF_TY[f.ty], big, ph: r.range(0, 50), fq: big ? r.range(6, 10) : r.range(3, 6) };
      });
      // grille d'accélération : chaque case connaît les feuilles qui la touchent
      let X0 = 9, X1 = -9, Y0 = 9, Y1 = -9;
      const bb = LV.map((f) => {
        const m = f.W * 1.5, xs = [f.ox, f.ox + f.c * f.L], ys = [f.oy, f.oy + f.s * f.L];
        const b = [Math.min(xs[0], xs[1]) - m, Math.max(xs[0], xs[1]) + m, Math.min(ys[0], ys[1]) - m, Math.max(ys[0], ys[1]) + m];
        X0 = Math.min(X0, b[0]); X1 = Math.max(X1, b[1]); Y0 = Math.min(Y0, b[2]); Y1 = Math.max(Y1, b[3]);
        return b;
      });
      const G = 0.08, NX = Math.max(1, Math.ceil((X1 - X0) / G)), NG = Math.max(1, Math.ceil((Y1 - Y0) / G));
      const cells = new Array(NX * NG);
      bb.forEach((b, k) => {
        const i0 = Math.max(0, Math.floor((b[0] - X0) / G)), i1 = Math.min(NX - 1, Math.floor((b[1] - X0) / G));
        const j0 = Math.max(0, Math.floor((b[2] - Y0) / G)), j1 = Math.min(NG - 1, Math.floor((b[3] - Y0) / G));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * NX + i] || (cells[j * NX + i] = [])).push(k);
      });
      return function (x, y, o) {
        const ci = Math.floor((x - X0) / G), cj = Math.floor((y - Y0) / G);
        if (ci < 0 || cj < 0 || ci >= NX || cj >= NG) return false;
        const list = cells[cj * NX + ci];
        if (!list) return false;
        let best = -9, sec = -9, bj = -1, bt = 0, bq = 0, cov = 0;
        const nw = n1(x * 6, y * 6);
        for (let k = 0; k < list.length; k++) {
          const f = LV[list[k]];
          const dx = x - f.ox, dy = y - f.oy;
          const al = dx * f.c + dy * f.s;
          if (al <= 0 || al >= f.L) continue;
          const ac = -dx * f.s + dy * f.c;
          if (ac > f.W * 1.45 || ac < -f.W * 1.45) continue;
          const t = al / f.L, T = f.T;
          let w;
          if (f.big) { const tt = 2 * Math.pow(t, 0.7) - 1; w = f.W * Math.sqrt(Math.max(0, 1 - tt * tt * tt * tt)); }
          else w = f.W * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.62);
          w *= 1 + T.lob * Math.sin(t * f.fq * Math.PI + f.ph) * smooth(0.08, 0.35, t) + 0.07 * nw;
          if (T.deep) w *= 1 - T.deep * (0.5 + 0.5 * Math.sin(t * f.fq * 2.2 * Math.PI + f.ph * 1.7)) * smooth(0.15, 0.4, t);
          w *= 1 + 0.55 * T.frill * (0.65 * Math.sin(t * 36 + f.ph * 3) + 0.35 * Math.sin(t * 17 + f.ph)) * smooth(0.25, 0.8, t);
          const aa = ac < 0 ? -ac : ac;
          if (aa >= w) continue;
          const q = aa / w;
          const cv = (w - aa) * RPX + 0.5;
          if (cv > cov) cov = cv;
          const h = f.z + (f.big ? 0.03 : 0.012) * t + 0.022 * q * q * t
            + 0.6 * T.ruf * smooth(0.35, 1, q) * smooth(0.15, 0.7, t) * Math.sin(t * 22 + q * 5 + f.ph)
            + 0.005 * (1 - smooth(0, 0.08, q)) * (1 - t);
          if (h > best) { sec = best; best = h; bj = list[k]; bt = t; bq = q; } else if (h > sec) sec = h;
        }
        if (bj < 0) return false;
        const f = LV[bj], T = f.T, t = bt, q = bq;
        o.a = cov > 1 ? 1 : cov;
        const g1 = smooth(0, 0.65, t);
        o.r = T.base[0] + (T.mid[0] - T.base[0]) * g1; o.g = T.base[1] + (T.mid[1] - T.base[1]) * g1; o.b = T.base[2] + (T.mid[2] - T.base[2]) * g1;
        tint(o, T.edge, smooth(0.5, 1, Math.max(q, t * 0.85)));
        if (T.red) tint(o, T.red, clamp01(smooth(0.5, 0.95, q) * smooth(0.2, 0.65, t) * (0.75 + 0.5 * n2(x * 5, y * 5))));
        const mid = (1 - smooth(0, 0.06, q)) * (1 - 0.6 * t);
        const vein = smooth(0.86, 1, Math.sin((t * f.L - q * f.W * 0.9) * (f.big ? 38 : 60) + f.ph)) * (1 - q) * smooth(0.08, 0.3, t);
        tint(o, T.vein || LEAF_VEIN, mid * 0.7 + vein * 0.35);
        const v = 1 + 0.05 * n3(x * 9, y * 9);
        o.r *= v; o.g *= v; o.b *= v;
        const b0 = base(x, y);
        const under = sec > -5 && sec > best - 0.06;
        o.h = b0 + best;
        o.hb = b0 + (under ? sec - 0.004 : best - 0.012);
        o.sp = 0.26; o.sh = 26; o.cc = 0.3; o.ss = 0.72;
        o.id = 1 + bj; o.k = 4;
        // sous le bord d'une feuille relevée : la feuille du dessous, dans l'ombre (jamais le vide)
        if (under) { o.sr = o.r * 0.72; o.sg = o.g * 0.76; o.sb = o.b * 0.66; } else { o.sr = o.r * 0.9; o.sg = o.g * 0.92; o.sb = o.b * 0.85; }
        return true;
      };
    }
    // un tas de feuilles en dôme : n grandes feuilles qui partent du centre vers l'extérieur, et du mesclun dessus
    function leafDome(seed, cx, cy, R, nBig, nSmall, mix) {
      const r = rng(seed);
      const pick = () => { let u = r(), acc = 0; for (const k in mix) { acc += mix[k]; if (u <= acc) return k; } return 'batavia'; };
      const leaves = [];
      for (let i = 0; i < nBig; i++) {
        const a = (i / nBig) * TAU + r.range(-0.3, 0.3), d = R * 0.45 * Math.sqrt(r());
        leaves.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, dir: a + r.range(-0.7, 0.7), L: R * r.range(0.45, 0.66), W: R * r.range(0.17, 0.26), z: r.range(0, 0.04), ty: pick() });
      }
      for (let i = 0; i < nSmall; i++) {
        const a = r() * TAU, d = R * 0.55 * Math.sqrt(r());
        leaves.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, dir: r() * TAU, L: R * r.range(0.22, 0.34), W: R * r.range(0.05, 0.08), z: r.range(0.035, 0.06), ty: ['roquette', 'mache', 'lollo', 'frisee', 'chene'][Math.floor(r() * 5)], big: false });
      }
      return leaves;
    }

    /* ---------- Le tas de salade des salades composées (commun aux cinq) ---------- */
    const TAS_R = 0.84;
    const tasN = noise2(hash('tas de salade'));
    function tasDome(x, y) {
      const r = Math.sqrt(x * x + y * y), plate = assietteH(r) + 0.008;
      if (r >= TAS_R) return plate;
      const u = r / TAS_R;
      return Math.max(plate, 0.05 + 0.26 * Math.pow(1 - u * u, 1.05) + 0.016 * tasN(x * 2.2, y * 2.2));
    }
    // la hauteur où se posent les garnitures (sur les feuilles)
    const HEAP = (x, y) => tasDome(x, y) + 0.045;
    defP('mesclun-tas', { ext: 0.98, hmax: 0.46, ky: 1.2, shadow: OMBRE_F }, () => {
      const leaves = leafDome(hash('mesclun maison'), 0, 0, 0.82, 34, 18, { batavia: 0.34, chene: 0.22, frisee: 0.2, lollo: 0.14, dark: 0.1 });
      return leafPile(hash('mesclun maison') ^ 7, leaves, tasDome);
    });

    /* ---------- Les secteurs de l'assiette (vus de dessus ; l'avant, vers nous, est à 90°) ---------- */
    const SECT = { S0: Math.PI / 2, S1: (5 * Math.PI) / 6, S2: (7 * Math.PI) / 6, S3: (3 * Math.PI) / 2, S4: (11 * Math.PI) / 6, S5: Math.PI / 6 };
    const sectXY = (k, d) => [Math.cos(SECT[k]) * d, Math.sin(SECT[k]) * d];
    // des morceaux éparpillés dans un secteur, sans trop se chevaucher
    function scatter(seed, cx, cy, spread, n, minD) {
      const r = rng(seed), P = [];
      for (let j = 0; P.length < n && j < 400; j++) {
        const a = r() * TAU, d = spread * Math.sqrt(r());
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        if (P.some((p) => Math.hypot(p.x - x, p.y - y) < minD)) continue;
        P.push({ x, y, rot: r() * TAU, s: r.range(0.85, 1.15), tone: r(), o: r.range(0, 60) });
      }
      return P;
    }
    // le morceau le plus haut qui couvre (x, y) parmi des pièces à profil de hauteur ; garde aussi le deuxième
    function topPiece(P, x, y, R, fn, Q) {
      Q.best = -9; Q.sec = -9; Q.j = -1; Q.cov = 0;
      for (let j = 0; j < P.length; j++) {
        const p = P[j], dx = x - p.x, dy = y - p.y;
        if (dx * dx + dy * dy > R * R) continue;
        const cs = Math.cos(p.rot), sn = Math.sin(p.rot);
        const u = dx * cs + dy * sn, v = -dx * sn + dy * cs;
        if (!fn(p, u, v, Q)) continue;
        if (Q.cv > Q.cov) Q.cov = Q.cv;
        if (Q.hh > Q.best) { Q.sec = Q.best; Q.best = Q.hh; Q.j = j; Q.u = u; Q.v = v; Q.w = Q.ww; } else if (Q.hh > Q.sec) Q.sec = Q.hh;
      }
      return Q.j >= 0;
    }

    /* ---------- Tomates cerises coupées en deux (les mêmes dans toutes les salades) ---------- */
    defP('tomates-cerises', { ext: 0.8, hmax: 0.5, shadow: OMBRE }, () => {
      const r = rng(hash('tomates cerises'));
      const n1 = noise2(151), n2 = noise2(152);
      const P = [[1.02, 0.6, 1], [1.2, 0.68, 0], [3.08, 0.6, 1], [3.26, 0.67, 1], [5.16, 0.6, 1], [5.34, 0.68, 0]].map(([a, d, cut]) => ({
        x: Math.cos(a) * d, y: Math.sin(a) * d, rot: r() * TAU, R: r.range(0.08, 0.092), cut, o: r.range(0, 50),
      }));
      const Q = {};
      return function (x, y, o) {
        const ok = topPiece(P, x, y, 0.11, (p, u, v, Q) => {
          const d = Math.sqrt(u * u + v * v), Re = p.R * (1 + 0.02 * Math.sin(Math.atan2(v, u) * 3 + p.o));
          const cv = (Re - d) * RPX + 0.5;
          if (cv <= 0) return false;
          const rho = Math.min(1, d / Re);
          Q.cv = cv; Q.ww = rho;
          Q.hh = p.cut ? 0.05 + 0.008 * (1 - rho * rho) - 0.02 * Math.pow(rho, 8) : 0.072 * Math.sqrt(Math.max(0, 1 - Math.pow(rho, 2.2)));
          return true;
        }, Q);
        if (!ok) return;
        const p = P[Q.j], rho = Q.w, base = HEAP(p.x, p.y);
        o.a = Q.cov > 1 ? 1 : Q.cov;
        let h = base + Q.best;
        if (p.cut) {
          // face coupée : peau fine, chair, cloison centrale, deux loges de gelée (sans pépins)
          const u = Q.u / p.R, v = Q.v / p.R;
          const sept = 1 - smooth(0.1, 0.17, Math.abs(u) + 0.03 * n1(v * 6 + p.o, u * 6));
          const col = 1 - smooth(0.16, 0.26, Math.sqrt(u * u + v * v * 1.6));
          const peri = smooth(0.66, 0.74, rho + 0.03 * n2(u * 5 + p.o, v * 5));
          const gel = (1 - Math.max(sept, col, peri));
          o.r = 238; o.g = 88; o.b = 56;
          tint(o, [232, 70, 46], peri);
          tint(o, [242, 132, 98], Math.max(sept, col) * 0.8);
          tint(o, [186, 20, 14], smooth(0.9, 0.97, rho));
          h -= 0.006 * gel;
          o.sp = 0.35 + 0.3 * gel; o.sh = 40 + 30 * gel; o.cc = 0.45 + 0.5 * gel; o.ss = 0.5 + 0.35 * gel;
        } else {
          // peau luisante
          o.r = 204; o.g = 28; o.b = 20;
          tint(o, [226, 60, 34], smooth(0.2, 0.9, n1(Q.u * 12 + p.o, Q.v * 12)) * 0.25);
          o.sp = 0.6; o.sh = 60; o.cc = 1.0; o.ss = 0.45;
        }
        o.h = h; o.hb = base - 0.02;
        o.id = 1 + Q.j; o.k = 5;
        o.sr = 176; o.sg = 22; o.sb = 16;
      };
    });

    /* ---------- Copeaux de Cantal jeune : triangles fins, pâte ivoire, un liseré de croûte ---------- */
    function sdTri(px, py, r) {
      const k = Math.sqrt(3);
      px = Math.abs(px) - r; py = py + r / k;
      if (px + k * py > 0) { const t = (px - k * py) / 2; py = (-k * px - py) / 2; px = t; }
      px -= Math.max(-2 * r, Math.min(0, px));
      return -Math.sqrt(px * px + py * py) * Math.sign(py);
    }
    const [CAN_X, CAN_Y] = sectXY('S1', 0.44);
    defP('copeaux-cantal', { cx: CAN_X, cy: CAN_Y, ext: 0.32, exy: 0.32, hmax: 0.5, shadow: OMBRE }, () => {
      const P = scatter(hash('copeaux cantal'), CAN_X, CAN_Y, 0.17, 5, 0.09);
      const n1 = noise2(161), n2 = noise2(162);
      const Q = {};
      return function (x, y, o) {
        const ok = topPiece(P, x, y, 0.13, (p, u, v, Q) => {
          const sz = 0.075 * p.s;
          const sd = sdTri(u, v, sz) - 0.012 + 0.004 * n1(u * 30 + p.o, v * 30);
          const cv = 0.5 - sd * RPX;
          if (cv <= 0) return false;
          Q.cv = cv; Q.ww = sd;
          Q.hh = 0.012 + 0.012 * p.tone + 0.02 * (u / sz) * (u / sz) + 0.006 * (1 - smooth(-0.03, 0, sd));
          return true;
        }, Q);
        if (!ok) return;
        const p = P[Q.j], base = HEAP(p.x, p.y);
        o.a = Q.cov > 1 ? 1 : Q.cov;
        o.r = 244; o.g = 228; o.b = 170;
        tint(o, [236, 214, 146], 0.5 + 0.5 * n2(x * 6, y * 6));
        // la croûte, sur le grand côté (en bas du triangle)
        const rind = smooth(-0.075 * p.s * 0.52, -0.075 * p.s * 0.42, -Q.v) * smooth(-0.02, -0.004, Q.w + 0.012);
        tint(o, [196, 172, 128], rind * 0.8);
        o.h = base + Q.best; o.hb = base - 0.015;
        o.sp = 0.2; o.sh = 22; o.cc = 0.15; o.ss = 0.4;
        o.id = 1 + Q.j; o.k = 6;
        o.sr = 226; o.sg = 204; o.sb = 144;
      };
    });

    /* ---------- Bleu d'Auvergne émietté : morceaux crémeux, veines bleu-vert (des traits, jamais des points) ---------- */
    const [BLE_X, BLE_Y] = sectXY('S5', 0.44);
    defP('miettes-bleu', { cx: BLE_X, cy: BLE_Y, ext: 0.3, exy: 0.3, hmax: 0.5, shadow: OMBRE }, () => {
      const P = scatter(hash('miettes bleu'), BLE_X, BLE_Y, 0.16, 8, 0.07);
      const n1 = noise2(171), n2 = noise2(172), n3 = noise2(173);
      const Q = {};
      return function (x, y, o) {
        const ok = topPiece(P, x, y, 0.08, (p, u, v, Q) => {
          const hs = 0.038 * p.s;
          const sd = sdRoundBox(u, v, hs, hs * 0.78, 0.01) + 0.008 * n1(u * 22 + p.o, v * 22);
          const cv = 0.5 - sd * RPX;
          if (cv <= 0) return false;
          Q.cv = cv; Q.ww = sd;
          // un morceau cassé : dessus en pans, arêtes un peu émoussées
          Q.hh = 0.03 + 0.012 * (u / hs) * (p.tone - 0.5) + 0.01 * (v / hs) + 0.006 * smooth(-0.012, 0, -sd) - 0.004 + 0.004 * n2(u * 30 + p.o, v * 30);
          return true;
        }, Q);
        if (!ok) return;
        const p = P[Q.j], base = HEAP(p.x, p.y);
        o.a = Q.cov > 1 ? 1 : Q.cov;
        o.r = 240; o.g = 234; o.b = 212;
        const wx = x + 0.1 * n1(x * 3, y * 3), wy = y + 0.1 * n1(x * 3 + 5, y * 3);
        const vein = 1 - smooth(0.02, 0.09, Math.abs(n3(wx * 13, wy * 13)));
        const pocket = smooth(0.35, 0.6, n1(wx * 9 + 3, wy * 9)) * 0.6;
        tint(o, [92, 124, 112], Math.max(vein * 0.9, pocket));
        tint(o, [58, 84, 76], smooth(0.7, 1, vein) * 0.5);
        o.h = base + Q.best - 0.003 * vein; o.hb = base - 0.015;
        o.sp = 0.16; o.sh = 20; o.cc = 0.1; o.ss = 0.3;
        o.id = 1 + Q.j; o.k = 6;
        o.sr = 230; o.sg = 226; o.sb = 208;
      };
    });

    /* ---------- Rubans de jambon d'Auvergne : tranches fines pliées, rouge profond, gras nacré ---------- */
    function hamRibbons(id, meta, list, mat) {
      const salmon = mat === 'saumon';
      defP(id, Object.assign({ hmax: 0.5, shadow: OMBRE }, meta), () => {
        const r = rng(hash(id));
        const n1 = noise2(181), n2 = noise2(182), n3 = noise2(183);
        const RB = list.map((b) => ({ x: b.x, y: b.y, c: Math.cos(b.dir), s: Math.sin(b.dir), L: b.L, W: b.W, fq: r.range(9, 13), ph: r() * 50, side: r() < 0.5 ? 1 : -1, z: b.z || 0, flat: b.flat }));
        return function (x, y, o) {
          let best = -9, sec = -9, bj = -1, cov = 0, bf = 0, bw = 0;
          for (let j = 0; j < RB.length; j++) {
            const b = RB[j];
            const dx = x - b.x, dy = y - b.y;
            const al = dx * b.c + dy * b.s;
            if (al < -b.L * 0.55 || al > b.L * 0.55) continue;
            const t = al / b.L;
            const ac = -dx * b.s + dy * b.c - 0.035 * Math.sin(t * 7 + b.ph); // le ruban ondule
            const w = b.W * (1 - 0.35 * Math.pow(Math.abs(t) * 2, 6)) * (1 + 0.06 * n1(x * 9 + b.ph, y * 9));
            const aa = Math.abs(ac);
            if (aa >= w) continue;
            const cv = (w - aa) * RPX + 0.5;
            if (cv > cov) cov = cv;
            const f = Math.sin(t * b.fq + b.ph);
            const h = b.z + (b.flat ? 0.014 : 0.018 + 0.026 * (0.5 + 0.5 * f)) + 0.008 * (1 - (aa / w) * (aa / w));
            if (h > best) { sec = best; best = h; bj = j; bf = f; bw = (ac / w) * b.side; } else if (h > sec) sec = h;
          }
          if (bj < 0) return;
          o.a = cov > 1 ? 1 : cov;
          const b = RB[bj], v = n3(x * 4, y * 4);
          const fold = 0.82 + 0.18 * (0.5 + 0.5 * bf);
          let fat = 0;
          if (salmon) {
            // saumon fumé : corail translucide, fines lignes blanches en biais, bords plus clairs
            o.r = 240 + 6 * v; o.g = 128 + 8 * v; o.b = 90 + 6 * v;
            o.r *= fold; o.g *= fold; o.b *= fold;
            const ln = 1 - smooth(0.05, 0.15, Math.abs(Math.sin((x * 9 + y * 13 + b.ph) * Math.PI)));
            tint(o, [252, 222, 204], ln * 0.45);
            tint(o, [252, 184, 150], smooth(0.7, 1, Math.abs(bw)) * 0.4);
          } else {
            o.r = 150 + 16 * v; o.g = 40 + 7 * v; o.b = 46 + 6 * v;
            o.r *= fold; o.g *= fold; o.b *= fold;
            tint(o, [112, 26, 34], smooth(0.25, 0.8, n2(x * 5 + 3, y * 5)) * 0.35);
            fat = smooth(0.56, 0.72, bw + 0.08 * n1(x * 7, y * 7));
            tint(o, [244, 230, 220], fat);
            tint(o, [226, 150, 150], fat * (1 - smooth(0.72, 0.9, bw)) * 0.5);
          }
          const base = meta.base ? meta.base(x, y) : HEAP(x, y);
          const under = sec > -5 && sec > best - 0.06;
          o.h = base + best; o.hb = base + (under ? sec - 0.004 : best - 0.012);
          if (salmon) { o.sp = 0.38; o.sh = 38; o.cc = 0.6; o.ss = 0.62; }
          else { o.sp = 0.26 + 0.2 * fat; o.sh = 30 + 12 * fat; o.cc = 0.3 + 0.25 * fat; o.ss = 0.36 - 0.12 * fat; }
          o.id = 1 + bj; o.k = 8;
          if (under) { o.sr = o.r * 0.66; o.sg = o.g * 0.62; o.sb = o.b * 0.62; } else { o.sr = Math.min(255, o.r * 1.05); o.sg = o.g * 1.1; o.sb = o.b * 1.1; }
        };
      });
    }
    const [JAM_X, JAM_Y] = sectXY('S3', 0.44);
    hamRibbons('rubans-jambon', { cx: JAM_X, cy: JAM_Y, ext: 0.44, exy: 0.32 }, [
      { x: JAM_X - 0.17, y: JAM_Y + 0.02, dir: 0.35, L: 0.38, W: 0.08 },
      { x: JAM_X + 0.14, y: JAM_Y - 0.05, dir: -0.4, L: 0.36, W: 0.075, z: 0.01 },
      { x: JAM_X, y: JAM_Y + 0.12, dir: 0.1, L: 0.32, W: 0.07, z: 0.02 },
    ]);

    /* ---------- Saumon fumé en Auvergne : trois tranches froncées, posées au centre et devant ---------- */
    hamRibbons('saumon-rosaces', { cx: 0.03, cy: 0.16, ext: 0.4, exy: 0.4 }, [
      { x: 0.02, y: -0.02, dir: 0.3, L: 0.4, W: 0.085 },
      { x: -0.12, y: 0.34, dir: -0.5, L: 0.34, W: 0.08, z: 0.01 },
      { x: 0.2, y: 0.22, dir: 1.2, L: 0.3, W: 0.075, z: 0.02 },
    ], 'saumon');

    /* ---------- Noix (cerneaux entiers, posés devant) ---------- */
    function walnuts(id, meta, P) {
      defP(id, Object.assign({ hmax: 0.5, shadow: OMBRE }, meta), () => {
        const n1 = noise2(211), n2 = noise2(212), n3 = noise2(213);
        return function (x, y, o) {
          let best = -9, bj = -1, cov = 0, bu = 0, bv = 0, brho = 0;
          for (let j = 0; j < P.length; j++) {
            const n = P[j];
            const dx = x - n.x, dy = y - n.y;
            if (dx * dx + dy * dy > n.hl * n.hl * 1.3) continue;
            const u = (dx * n.c + dy * n.s) / n.hl, v = (-dx * n.s + dy * n.c) / n.hw;
            const rho = Math.sqrt(0.5 * u * u * u * u + 0.5 * u * u + v * v);
            const notch = 0.35 * Math.exp(-(v * v) / 0.03) * smooth(0.45, 1, u);
            const re = 1 - notch + 0.05 * n1(u * 3 + n.o, v * 3);
            const cv = (re - rho) * n.hw * RPX + 0.5;
            if (cv <= 0) continue;
            if (cv > cov) cov = cv;
            const rr = Math.min(1, rho / re);
            const hh = 0.045 * Math.sqrt(1 - rr * rr);
            if (hh > best) { best = hh; bj = j; bu = u; bv = v; brho = rr; }
          }
          if (bj < 0) return;
          const n = P[bj], base = (meta.base || HEAP)(n.x, n.y);
          o.a = cov > 1 ? 1 : cov;
          const wr = 1 - Math.abs(n2(bu * 2.6 + n.o, bv * 3.4));
          const groove = Math.exp(-(bv * bv) / 0.012);
          o.h = base + best + 0.011 * wr * wr * (1 - brho * 0.5) - 0.018 * groove * (1 - brho);
          const deep = clamp01(0.55 * (1 - wr) + 0.7 * groove);
          o.r = 206 - 16 * n.tone; o.g = 156 - 14 * n.tone; o.b = 96 - 10 * n.tone;
          tint(o, [112, 70, 36], deep * 0.75);
          tint(o, [182, 124, 70], smooth(0.2, 0.7, n3(x * 9, y * 9)) * 0.35);
          o.hb = base - 0.012;
          if (brho > 0.75) o.hr = base + 0.004;
          o.sp = 0.22; o.sh = 26; o.cc = 0.1; o.ss = 0.2;
          o.id = 1 + bj; o.k = 11;
          o.sr = 150; o.sg = 100; o.sb = 56;
        };
      });
    }
    {
      const [NX0, NY0] = sectXY('S0', 0.46);
      const P = scatter(hash('noix salade'), NX0, NY0, 0.15, 5, 0.12).map((p) => {
        const hl = 0.07 * p.s;
        return { x: p.x, y: p.y, hl, hw: hl * 0.72, c: Math.cos(p.rot), s: Math.sin(p.rot), o: p.o, tone: p.tone };
      });
      walnuts('cerneaux-noix', { cx: NX0, cy: NY0, ext: 0.28, exy: 0.28 }, P);
    }

    /* ---------- Blanc de poulet grillé, tranché en éventail (Vercingétorix) ---------- */
    function chickenSlices(id, meta, SL, base) {
      defP(id, Object.assign({ hmax: 0.52, shadow: OMBRE }, meta), () => {
        const n1 = noise2(221), n2 = noise2(222), n3 = noise2(223);
        return function (x, y, o) {
          let best = -9, sec = -9, bj = -1, cov = 0, bu = 0, bv = 0;
          for (let j = 0; j < SL.length; j++) {
            const s = SL[j], dx = x - s.x, dy = y - s.y;
            const u = dx * s.c + dy * s.s, v = -dx * s.s + dy * s.c;
            const sd = sdRoundBox(u, v, s.hl, s.hw * (1 - 0.25 * Math.pow(Math.abs(u) / s.hl, 4)), s.hw * 0.8) + 0.003 * n1(u * 30 + j, v * 30);
            const cv = 0.5 - sd * RPX;
            if (cv <= 0) continue;
            if (cv > cov) cov = cv;
            // tranches légèrement couchées les unes sur les autres
            const h = s.z + 0.03 + 0.014 * (v / s.hw) + 0.006 * (1 - smooth(-0.012, 0, sd));
            if (h > best) { sec = best; best = h; bj = j; bu = u / s.hl; bv = v / s.hw; } else if (h > sec) sec = h;
          }
          if (bj < 0) return;
          o.a = cov > 1 ? 1 : cov;
          // chair blanche nacrée, fibres fines en travers ; le bord extérieur saisi, doré, marqué par le gril
          o.r = 236; o.g = 218; o.b = 190;
          const fib = n2(bu * 3, bv * 18 + bj * 7);
          o.r *= 1 + 0.03 * fib; o.g *= 1 + 0.03 * fib; o.b *= 1 + 0.035 * fib;
          const crust = smooth(0.25, 0.85, -bv);
          tint(o, [204, 144, 76], crust * 0.92);
          tint(o, [226, 192, 140], (1 - crust) * smooth(0.2, 0.9, bv) * 0.35);
          const mark = (1 - smooth(0.12, 0.3, Math.abs(Math.sin((bu * 3.2 + bv * 0.6) * Math.PI)))) * crust;
          tint(o, [96, 58, 30], mark * 0.8);
          tint(o, [226, 196, 150], smooth(0.2, 0.8, n3(x * 6, y * 6)) * 0.2 * (1 - crust));
          const b0 = base(x, y), under = sec > -5 && sec > best - 0.05;
          o.h = b0 + best - 0.003 * mark; o.hb = b0 + (under ? sec - 0.004 : -0.012);
          o.sp = 0.24 + 0.2 * crust; o.sh = 28; o.cc = 0.25 + 0.25 * crust; o.ss = 0.3;
          o.id = 1 + bj; o.k = 8;
          if (under) { o.sr = 170; o.sg = 150; o.sb = 120; } else { o.sr = 214; o.sg = 170; o.sb = 110; }
        };
      });
    }
    {
      const SL = [];
      for (let j = 0; j < 5; j++) {
        const a = -0.5 + j * 0.25, cx = -0.1 + j * 0.055, cy = -0.02 + j * 0.02;
        SL.push({ x: cx, y: cy, c: Math.cos(Math.PI / 2 + a), s: Math.sin(Math.PI / 2 + a), hl: 0.16, hw: 0.04, z: j * 0.006 });
      }
      chickenSlices('tranches-poulet', { cx: 0.02, cy: 0, ext: 0.32, exy: 0.3 }, SL, HEAP);
    }

    /* ---------- Poivrons rôtis en lanières (générique : n'importe quel support) ---------- */
    function pepperStrips(id, meta, ST0, base) {
      defP(id, Object.assign({ hmax: 0.52, shadow: OMBRE }, meta), () => {
        const n1 = noise2(101), n2 = noise2(102), n3 = noise2(103);
        const ST = ST0.map((q) => {
          const dx = Math.cos(q.dir), dy = Math.sin(q.dir);
          const P0 = [q.x - (dx * q.L) / 2, q.y - (dy * q.L) / 2], P2 = [q.x + (dx * q.L) / 2, q.y + (dy * q.L) / 2], P1 = [q.x - dy * q.bend * q.L, q.y + dx * q.bend * q.L];
          const pts = [];
          for (let k = 0; k <= 16; k++) {
            const t = k / 16, u = 1 - t;
            pts.push([u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]]);
          }
          let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
          pts.forEach((p) => { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
          return { pts, hw: q.hw, x0: x0 - q.hw, x1: x1 + q.hw, y0: y0 - q.hw, y1: y1 + q.hw, z: q.z || 0, red: q.red, o: q.o || 0, L: q.L };
        });
        return function (x, y, o) {
          let best = -9, sec = -9, bj = -1, cov = 0, bq = 0;
          for (let j = 0; j < ST.length; j++) {
            const s = ST[j];
            if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
            let dmin = 9, tmin = 0, side = 1;
            const P = s.pts;
            for (let k = 0; k < 16; k++) {
              const ax = P[k][0], ay = P[k][1], bx = P[k + 1][0] - ax, by = P[k + 1][1] - ay;
              let t = ((x - ax) * bx + (y - ay) * by) / (bx * bx + by * by);
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const ex = x - ax - bx * t, ey = y - ay - by * t, d = ex * ex + ey * ey;
              if (d < dmin) { dmin = d; tmin = (k + t) / 16; side = bx * ey - by * ex > 0 ? 1 : -1; }
            }
            const d = Math.sqrt(dmin), tt = 2 * tmin - 1;
            const w = s.hw * (1 - 0.5 * Math.pow(Math.abs(tt), 8)) * (1 + 0.1 * n1(x * 9 + s.o, y * 9));
            const cv = (w - d) * RPX + 0.5;
            if (cv <= 0) continue;
            if (cv > cov) cov = cv;
            const q = Math.min(1, d / w);
            const hh = s.z + 0.02 + 0.006 * (1 - q * q) + 0.006 * q * q * q * q + 0.006 * Math.sin(tmin * s.L * 14 + s.o) * (0.6 + 0.4 * q) + 0.0025 * n2(x * 26 + s.o, y * 26);
            if (hh > best) { sec = best; best = hh; bj = j; bq = q * side; } else if (hh > sec) sec = hh;
          }
          if (bj < 0) return;
          const s = ST[bj];
          o.a = cov > 1 ? 1 : cov;
          if (s.red) { o.r = 176; o.g = 28; o.b = 16; } else { o.r = 236; o.g = 150; o.b = 28; }
          const v = 1 + 0.07 * n2(x * 6 + s.o, y * 6);
          o.r *= v; o.g *= v; o.b *= v;
          const e = Math.abs(bq);
          tint(o, s.red ? [128, 14, 12] : [196, 110, 14], smooth(0.55, 1, e) * 0.5);
          const ch = smooth(0.42, 0.74, n3(x * 5 + s.o, y * 5)) * (0.55 + 0.45 * smooth(-0.3, 0.5, n1(x * 18, y * 18)));
          tint(o, s.red ? [74, 20, 10] : [120, 66, 16], ch * 0.75);
          const b0 = base(x, y), under = sec > -5 && sec > best - 0.05;
          o.h = b0 + best - 0.004 * ch; o.hb = b0 + (under ? sec - 0.004 : best - 0.013);
          o.sp = 0.4 * (1 - 0.6 * ch); o.sh = 38; o.cc = 0.75 * (1 - 0.8 * ch); o.ss = 0.5;
          o.id = 1 + bj; o.k = 10;
          o.sr = o.r * (under ? 0.55 : 0.8); o.sg = o.g * (under ? 0.5 : 0.75); o.sb = o.b * (under ? 0.5 : 0.7);
        };
      });
    }
    {
      const [PX, PY] = sectXY('S5', 0.44), r = rng(hash('poivrons salade'));
      const L = [];
      for (let j = 0; j < 5; j++) L.push({ x: PX + r.range(-0.1, 0.1), y: PY + r.range(-0.1, 0.1), dir: r() * TAU, L: r.range(0.2, 0.28), bend: r.range(-0.25, 0.25), hw: r.range(0.028, 0.036), red: j % 2 === 0, o: r.range(0, 60), z: j * 0.008 });
      pepperStrips('lanieres-poivrons', { cx: PX, cy: PY, ext: 0.3, exy: 0.3 }, L, HEAP);
    }

    /* ---------- Croûtons à l'huile d'olive : petits cubes dorés, arêtes plus grillées ---------- */
    {
      const [C0X, C0Y] = sectXY('S0', 0.46), [C3X, C3Y] = sectXY('S3', 0.44);
      const P = scatter(hash('croutons a'), C0X, C0Y, 0.14, 5, 0.075).concat(scatter(hash('croutons b'), C3X, C3Y, 0.15, 5, 0.075));
      defP('croutons', { cx: 0, cy: 0.01, ext: 0.26, exy: 0.66, hmax: 0.52, shadow: OMBRE }, () => {
        const n1 = noise2(231), n2 = noise2(232);
        const Q = {};
        return function (x, y, o) {
          const ok = topPiece(P, x, y, 0.07, (p, u, v, Q) => {
            const hs = 0.03 * p.s;
            const sd = sdRoundBox(u, v, hs, hs * 0.9, 0.01) + 0.002 * n1(u * 50 + p.o, v * 50);
            const cv = 0.5 - sd * RPX;
            if (cv <= 0) return false;
            Q.cv = cv; Q.ww = sd;
            Q.hh = 0.045 * p.s + 0.004 * (u / hs) + 0.008 * smooth(-0.012, -0.002, -sd) - 0.008;
            return true;
          }, Q);
          if (!ok) return;
          const p = P[Q.j], base = HEAP(p.x, p.y);
          o.a = Q.cov > 1 ? 1 : Q.cov;
          const edge = smooth(-0.01, 0, Q.w);
          o.r = 226; o.g = 172; o.b = 92;
          tint(o, [242, 206, 132], smooth(0.1, 0.7, n2(x * 18, y * 18)) * 0.4); // mie dorée
          tint(o, [172, 108, 48], edge * 0.8);
          o.h = base + Q.best + 0.003 * n2(x * 40, y * 40); o.hb = base - 0.015;
          o.sp = 0.32; o.sh = 30; o.cc = 0.35; o.ss = 0.15;
          o.id = 1 + Q.j; o.k = 19;
          o.sr = 190; o.sg = 126; o.sb = 60;
        };
      });
    }

    /* ---------- Toasts chauds : pain de campagne grillé, fromage fondu gratiné ---------- */
    // la hauteur du dessus des toasts (pour le miel et les herbes posés dessus) ; -9 hors des toasts
    function toastSet(list) {
      return list.map((t) => ({ x: t.x, y: t.y, c: Math.cos(t.rot), s: Math.sin(t.rot), a: t.a, b: t.b, ch: t.ch, o: t.o, z: HEAP(t.x, t.y) }));
    }
    function toastTop(T, x, y) {
      let best = -9;
      for (let j = 0; j < T.length; j++) {
        const t = T[j], dx = x - t.x, dy = y - t.y;
        const u = (dx * t.c + dy * t.s) / t.a, v = (-dx * t.s + dy * t.c) / t.b;
        const d = u * u + v * v;
        if (d >= 1) continue;
        const h = t.z + 0.05 + 0.03 * Math.sqrt(Math.max(0, 1 - d * 1.2));
        if (h > best) best = h;
      }
      return best;
    }
    // des toasts (a × b), chacun avec son fromage : 'chevre' (rondelle fondue), 'stn' (Saint-Nectaire), 'bleu'
    function toasts(id, meta, T) {
      defP(id, Object.assign({ hmax: 0.54, shadow: OMBRE_F }, meta), () => {
        const n1 = noise2(241), n2 = noise2(242), n3 = noise2(243), n4 = noise2(244);
        return function (x, y, o) {
          let best = -9, sec = -9, bj = -1, cov = 0, bu = 0, bv = 0, bd = 0, bcheese = 0;
          for (let j = 0; j < T.length; j++) {
            const t = T[j], dx = x - t.x, dy = y - t.y;
            const u = (dx * t.c + dy * t.s) / t.a, v = (-dx * t.s + dy * t.c) / t.b;
            const d = Math.sqrt(u * u + v * v) * (1 + 0.03 * n1(u * 3 + t.o, v * 3));
            const cv = (1 - d) * t.b * RPX + 0.5;
            if (cv <= 0) continue;
            if (cv > cov) cov = cv;
            // le fromage : rond et bombé (chèvre) ou étalé jusqu'aux bords (Saint-Nectaire, bleu), un peu coulant
            const cr = t.ch === 'chevre' ? Math.sqrt(u * u * 1.8 + v * v * 1.3) / (0.72 + 0.06 * n2(u * 4 + t.o, v * 4)) : d / (0.9 + 0.08 * n2(u * 5 + t.o, v * 5));
            const cheese = 1 - smooth(0.9, 1.0, cr);
            const h = t.z + 0.046 * (1 - 0.3 * Math.pow(d, 6)) + cheese * (t.ch === 'chevre' ? 0.03 * Math.sqrt(Math.max(0, 1 - cr * cr)) + 0.006 : 0.012 + 0.006 * (1 - cr));
            if (h > best) { sec = best; best = h; bj = j; bu = u; bv = v; bd = d; bcheese = cheese; } else if (h > sec) sec = h;
          }
          if (bj < 0) return;
          const t = T[bj];
          o.a = cov > 1 ? 1 : cov;
          // pain grillé : croûte brune au bord, mie dorée
          const crust = smooth(0.8, 0.95, bd);
          o.r = 222; o.g = 170; o.b = 96;
          tint(o, [240, 204, 138], smooth(0.2, 0.8, n3(x * 14, y * 14)) * 0.35 * (1 - crust));
          tint(o, [150, 88, 38], crust);
          let sp = 0.2, cc = 0.15, ss = 0.15;
          if (bcheese > 0) {
            // fromage fondu, doré par le gril (plages dorées douces, jamais de bulles)
            const gold = smooth(0.1, 0.8, n4(x * 7 + t.o, y * 7)) * 0.55 + 0.25 * (1 - bd);
            let c;
            if (t.ch === 'chevre') { c = [250, 246, 234]; }
            else if (t.ch === 'stn') { c = [244, 214, 146]; }
            else { c = [240, 234, 212]; }
            const oc = [o.r, o.g, o.b];
            o.r = c[0]; o.g = c[1]; o.b = c[2];
            tint(o, t.ch === 'chevre' ? [232, 186, 108] : [222, 160, 84], gold * (t.ch === 'bleu' ? 0.35 : 0.7));
            if (t.ch === 'bleu') {
              const wx = x + 0.06 * n1(x * 4, y * 4), wy = y + 0.06 * n1(x * 4 + 5, y * 4);
              const vein = 1 - smooth(0.02, 0.08, Math.abs(n3(wx * 16, wy * 16)));
              tint(o, [96, 128, 114], vein * 0.8);
            }
            if (t.ch === 'stn') tint(o, [196, 132, 84], (1 - smooth(0, 0.06, Math.abs(n2(x * 9 + 3, y * 9)))) * 0.35); // traînées de croûte fondue
            // bord du fromage qui coule sur le pain
            const k = smooth(0, 0.35, bcheese);
            o.r = oc[0] + (o.r - oc[0]) * k; o.g = oc[1] + (o.g - oc[1]) * k; o.b = oc[2] + (o.b - oc[2]) * k;
            sp = 0.3 + 0.15 * k; cc = 0.35 + 0.35 * k; ss = 0.2 + 0.4 * k;
          }
          const under = sec > -5 && sec > best - 0.06;
          o.h = best + 0.002 * n3(x * 30, y * 30); o.hb = under ? sec - 0.004 : t.z - 0.01;
          o.sp = sp; o.sh = 30; o.cc = cc; o.ss = ss;
          o.id = 1 + bj; o.k = 19;
          o.sr = 176; o.sg = 112; o.sb = 50;
        };
      });
    }
    const TOASTS_CHEVRE = toastSet([
      { x: 0.0, y: 0.2, rot: 0.2, a: 0.15, b: 0.1, ch: 'chevre', o: 1 },
      { x: -0.19, y: -0.1, rot: 2.3, a: 0.15, b: 0.1, ch: 'chevre', o: 7 },
      { x: 0.19, y: -0.1, rot: -2.2, a: 0.15, b: 0.1, ch: 'chevre', o: 13 },
    ]);
    toasts('toasts-chevre', { cx: 0, cy: 0.03, ext: 0.4, exy: 0.36 }, TOASTS_CHEVRE);
    const TOASTS_SANCY = toastSet([
      { x: -0.02, y: 0.25, rot: 0.1, a: 0.17, b: 0.11, ch: 'stn', o: 2 },
      { x: -0.25, y: 0.0, rot: 1.9, a: 0.17, b: 0.11, ch: 'bleu', o: 5 },
      { x: 0.25, y: 0.03, rot: -1.7, a: 0.17, b: 0.11, ch: 'bleu', o: 9 },
      { x: 0.02, y: -0.22, rot: 3.0, a: 0.17, b: 0.11, ch: 'stn', o: 15 },
    ]);
    toasts('toasts-sancy', { cx: 0, cy: 0.02, ext: 0.46, exy: 0.42 }, TOASTS_SANCY);

    /* ---------- Miel en filet, sur les toasts de chèvre ---------- */
    function honeyDrizzle(id, meta, path, top) {
      defP(id, Object.assign({ hmax: 0.56 }, meta), () => {
        const r = rng(hash(id));
        const n1 = noise2(251);
        const SEG = [], HW = path.hw || 0.012, N = path.n || 200;
        let prev = null;
        for (let i = 0; i <= N; i++) {
          const t = i / N, p = path.at(t);
          const w = HW * (0.45 + 0.55 * Math.pow(Math.abs(p.sw), 3)) * smooth(0, 0.05, t) * smooth(0, 0.05, 1 - t);
          if (prev) SEG.push({ ax: prev[0], ay: prev[1], bx: p.x - prev[0], by: p.y - prev[1], wa: prev[2], wb: w });
          prev = [p.x, p.y, w];
        }
        const G = 0.06, E = meta.ext, EY = meta.exy || meta.ext, X0 = meta.cx - E, Y0 = meta.cy - EY;
        const NX = Math.ceil((2 * E) / G), NG = Math.ceil((2 * EY) / G), cells = new Array(NX * NG);
        SEG.forEach((sg, k) => {
          const m = Math.max(sg.wa, sg.wb) + 0.02;
          const i0 = Math.max(0, Math.floor((Math.min(sg.ax, sg.ax + sg.bx) - m - X0) / G)), i1 = Math.min(NX - 1, Math.floor((Math.max(sg.ax, sg.ax + sg.bx) + m - X0) / G));
          const j0 = Math.max(0, Math.floor((Math.min(sg.ay, sg.ay + sg.by) - m - Y0) / G)), j1 = Math.min(NG - 1, Math.floor((Math.max(sg.ay, sg.ay + sg.by) + m - Y0) / G));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * NX + i] || (cells[j * NX + i] = [])).push(k);
        });
        return function (x, y, o) {
          const ci = Math.floor((x - X0) / G), cj = Math.floor((y - Y0) / G);
          if (ci < 0 || cj < 0 || ci >= NX || cj >= NG) return;
          const list = cells[cj * NX + ci];
          if (!list) return;
          let cov = 0, best = -1;
          for (let q = 0; q < list.length; q++) {
            const sg = SEG[list[q]];
            const ex = x - sg.ax, ey = y - sg.ay;
            let t = (ex * sg.bx + ey * sg.by) / (sg.bx * sg.bx + sg.by * sg.by || 1e-9);
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            const fx = ex - sg.bx * t, fy = ey - sg.by * t;
            const d = Math.sqrt(fx * fx + fy * fy), w = sg.wa + (sg.wb - sg.wa) * t;
            if (w <= 0) continue;
            const cv = (w - d) * RPX + 0.5;
            if (cv <= 0) continue;
            if (cv > cov) cov = cv;
            const qq = Math.min(1, d / w);
            const hh = 0.004 + (0.003 + 0.008 * (w / HW)) * Math.sqrt(1 - qq * qq);
            if (hh > best) best = hh;
          }
          if (best < 0 || cov <= 0) return;
          o.a = cov > 1 ? 1 : cov;
          const th = clamp01((best - 0.004) / 0.012);
          o.r = 246 + (190 - 246) * th; o.g = 192 + (106 - 192) * th; o.b = 74 + (18 - 74) * th;
          const b0 = top(x, y);
          o.h = b0 + best; o.hb = b0 - 0.004; o.hr = b0 + 0.004;
          o.sp = 0.5; o.sh = 60; o.cc = 1.0; o.ss = 1.0;
          o.id = 1; o.k = 12;
          o.sr = 204; o.sg = 120; o.sb = 22;
        };
      });
    }
    {
      // le filet passe et repasse sur les trois toasts
      const ph = 0.7;
      honeyDrizzle('miel-toasts', { cx: 0, cy: 0.03, ext: 0.36, exy: 0.32 }, {
        n: 220, hw: 0.011,
        at(t) {
          const phs = t * 4.5 * TAU + ph, sw = Math.sin(phs);
          const v = -0.24 + 0.5 * t + 0.02 * Math.sin(2 * phs);
          return { x: 0.27 * sw + 0.03 * Math.sin(t * 31), y: v, sw };
        },
      }, (x, y) => { const tt = toastTop(TOASTS_CHEVRE, x, y); return tt > -5 ? tt : HEAP(x, y); });
    }

    /* ---------- Pignons de pin : petits grains allongés, ivoire, pointes toastées (clairsemés) ---------- */
    {
      const [A0X, A0Y] = sectXY('S0', 0.47), [A5X, A5Y] = sectXY('S5', 0.46), [A1X, A1Y] = sectXY('S1', 0.46);
      const P = scatter(hash('pignons a'), A0X, A0Y, 0.12, 7, 0.045).concat(scatter(hash('pignons b'), A5X, A5Y, 0.12, 7, 0.045), scatter(hash('pignons c'), A1X, A1Y, 0.12, 6, 0.045));
      defP('pignons', { cx: 0, cy: 0.28, ext: 0.58, exy: 0.3, hmax: 0.52, shadow: OMBRE }, () => {
        const n1 = noise2(261);
        const Q = {};
        return function (x, y, o) {
          const ok = topPiece(P, x, y, 0.03, (p, u, v, Q) => {
            // une goutte allongée : large au talon, effilée à la pointe
            const hl = 0.019 * p.s, hw = 0.0085 * p.s, t = u / hl;
            if (t <= -1 || t >= 1) return false;
            const w = hw * Math.sqrt(1 - t * t) * (1 - 0.35 * Math.max(0, t));
            const av = Math.abs(v);
            const cv = (w - av) * RPX + 0.5;
            if (cv <= 0) return false;
            const q = Math.min(1, av / Math.max(1e-4, w));
            Q.cv = cv; Q.ww = t;
            Q.hh = 0.004 + 0.01 * Math.sqrt(1 - q * q) * Math.sqrt(1 - t * t);
            return true;
          }, Q);
          if (!ok) return;
          const p = P[Q.j], base = HEAP(p.x, p.y);
          o.a = Q.cov > 1 ? 1 : Q.cov;
          o.r = 238; o.g = 220; o.b = 176;
          tint(o, [206, 156, 88], smooth(0.2, 1, Math.abs(Q.w)) * (0.4 + 0.4 * p.tone));
          o.h = base + Q.best; o.hb = base - 0.008;
          o.sp = 0.35; o.sh = 36; o.cc = 0.35; o.ss = 0.3;
          o.id = 1 + Q.j; o.k = 11;
          o.sr = 214; o.sg = 180; o.sb = 120;
        };
      });
    }

    /* ---------- Herbes de Provence : de fines aiguilles séchées sur le fromage des toasts ---------- */
    {
      const r = rng(hash('herbes de provence'));
      const P = [];
      TOASTS_CHEVRE.forEach((t) => {
        for (let k = 0; k < 13; k++) {
          const a = r() * TAU, d = Math.sqrt(r()) * 0.75;
          const u = Math.cos(a) * d * t.a * 0.7, v = Math.sin(a) * d * t.b * 0.9;
          P.push({ x: t.x + u * t.c - v * t.s, y: t.y + u * t.s + v * t.c, rot: r() * TAU, s: r.range(0.7, 1.3), tone: r(), o: 0 });
        }
      });
      defP('herbes-provence', { cx: 0, cy: 0.03, ext: 0.36, exy: 0.32, hmax: 0.56 }, () => {
        const Q = {};
        return function (x, y, o) {
          const ok = topPiece(P, x, y, 0.02, (p, u, v, Q) => {
            const hl = 0.012 * p.s, hw = 0.0022;
            if (Math.abs(u) > hl) return false;
            const w = hw * (1 - Math.pow(Math.abs(u) / hl, 4));
            const cv = (w - Math.abs(v)) * RPX + 0.5;
            if (cv <= 0) return false;
            Q.cv = cv; Q.ww = 0; Q.hh = 0.003;
            return true;
          }, Q);
          if (!ok) return;
          const p = P[Q.j], b0 = toastTop(TOASTS_CHEVRE, p.x, p.y);
          if (b0 < -5) return;
          o.a = Q.cov > 1 ? 1 : Q.cov;
          if (p.tone < 0.6) { o.r = 88; o.g = 104; o.b = 52; } else { o.r = 122; o.g = 100; o.b = 58; }
          o.h = b0 + Q.best; o.hb = b0 - 0.002;
          o.sp = 0.1; o.sh = 16; o.cc = 0; o.ss = 0.2;
          o.id = 1 + Q.j; o.k = 4;
          o.sr = o.r * 0.8; o.sg = o.g * 0.8; o.sb = o.b * 0.8;
        };
      });
    }

    /* ======================================================================
       Les viandes : sur l'assiette blanche, avec frites maison et salade maison
       (la viande derrière à gauche, les frites à droite, la salade devant à gauche :
       le coin avant droit reste libre pour la pastille « frites maison »)
       ====================================================================== */
    // quadrillage du gril : deux familles de traits noircis ; rend 0..1
    function grillMarks(x, y, a1, a2, sp, n) {
      const w1 = (x * Math.cos(a1) + y * Math.sin(a1)) / sp, w2 = (x * Math.cos(a2) + y * Math.sin(a2)) / sp;
      const d1 = Math.abs(w1 - Math.round(w1)), d2 = Math.abs(w2 - Math.round(w2));
      return Math.max(1 - smooth(0.08, 0.2, d1 + 0.04 * n), 1 - smooth(0.08, 0.2, d2 - 0.04 * n));
    }

    /* ---------- Steak haché façon bouchère, épais : croûte, marques du gril, cœur saignant sur la tranche ---------- */
    const STK = { x: -0.26, y: -0.2 };
    defP('steak-epais', { cx: STK.x, cy: STK.y, ext: 0.5, exy: 0.5, hmax: 0.34, shadow: OMBRE_F, band: { k: 16, c: [178, 84, 90], p: [0.1, 0.32, 0.6, 0.86] } }, () => {
      const R0 = polar(hash('steak épais'), 0.4, [[2, 0.03], [3, 0.035], [5, 0.02], [7, 0.012], [11, 0.008]], 0.02, 3.4);
      const nW1 = noise2(271), nW2 = noise2(272), nL = noise2(273), nC = noise2(274), nJ = noise2(275), nD = noise2(276), nE = noise2(277), nG = noise2(278);
      const W1 = worley(279), W2 = worley(280);
      const T = 0.2;
      return function (x, y, o) {
        const lx = x - STK.x, ly = y - STK.y;
        const rr = Math.sqrt(lx * lx + ly * ly), R = R0(Math.atan2(ly, lx)), u = rr / R;
        const a = 0.5 + (R - rr) * RPX;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const rim = smooth(0.7, 1, u);
        const wx = lx + 0.025 * nW1(lx * 6, ly * 6), wy = ly + 0.025 * nW2(lx * 6 + 7, ly * 6);
        W1.at(wx * 21, wy * 21);
        const c1 = Math.max(0, 1 - W1.f1 * 1.55), id1 = W1.id;
        W2.at(wx * 40 + 3, wy * 40);
        const c2 = Math.max(0, 1 - W2.f1 * 1.65);
        const bumps = Math.sqrt(c1) * (0.55 + 0.7 * id1) * 0.7 + Math.sqrt(c2) * (0.5 + 0.8 * W2.id) * 0.3;
        const base = assietteAt(x, y);
        let h = base + T * (1 - 0.42 * Math.pow(rim, 2.2)) + (0.012 * bumps + 0.0015 * nD(wx * 70, wy * 70) + 0.008 * nL(lx * 2.4, ly * 2.4)) * (1 - 0.4 * rim);
        const n1 = nC(lx * 2.2, ly * 2.2), n2 = nE(lx * 5, ly * 5);
        o.r = 96; o.g = 60; o.b = 42;
        tint(o, [132, 88, 64], smooth(0.15, 0.75, n1) * 0.45);
        tint(o, [62, 36, 24], smooth(0.1, 0.8, -n1) * 0.45);
        tint(o, [140, 84, 52], smooth(0.45, 0.8, n2) * 0.14);
        const cv = (0.74 + 0.36 * bumps) * (0.94 + 0.12 * id1);
        o.r *= cv; o.g *= cv; o.b *= cv;
        // le gril : un quadrillage noirci, sur le dessus seulement
        const mark = grillMarks(lx, ly, 0.62, -0.95, 0.105, nG(lx * 8, ly * 8)) * (1 - smooth(0.66, 0.86, u)) * (0.75 + 0.25 * bumps);
        tint(o, [34, 20, 12], mark * 0.85);
        h -= 0.004 * mark;
        const juice = smooth(0.0, 0.6, nJ(lx * 4.5, ly * 4.5)) * (1 - mark);
        o.sp = 0.14 + 0.3 * juice; o.sh = 28; o.cc = 0.42 * juice * smooth(0.3, 0.8, bumps); o.ss = 0.08;
        o.h = h; o.hb = base; o.id = 1; o.k = 16;
        if (u > 0.9) o.hr = base + T * 0.55;
        o.sr = 112; o.sg = 70; o.sb = 50;
      };
    });

    /* ---------- Bavette d'aloyau : longue, un peu arquée, fibres marquées, quadrillée ; tranchée au bout ---------- */
    const BAV = { x: -0.24, y: -0.22, rot: -0.2, L: 0.54, W: 0.22, T: 0.075, cut: 0.32 };
    function bavette(id, sliced) {
      defP(id, { cx: BAV.x, cy: BAV.y, ext: 0.62, exy: 0.46, hmax: 0.26, shadow: OMBRE_F, band: { k: 16, c: [176, 80, 86], p: [0.12, 0.3, 0.55, 0.82] } }, () => {
        const nE = noise2(291), nF = noise2(292), nG = noise2(293), nJ = noise2(294), nC = noise2(295);
        const cs = Math.cos(BAV.rot), sn = Math.sin(BAV.rot);
        return function (x, y, o) {
          const dx = x - BAV.x, dy = y - BAV.y;
          const lx = dx * cs + dy * sn, ly0 = -dx * sn + dy * cs;
          const s = lx / BAV.L;
          if (s <= -1.08 || s >= 1.08) return;
          const ly = ly0 - 0.05 * BAV.W * s * s;
          const edge = 0.012 * nE(lx * 6, ly * 6) + 0.006 * nE(lx * 19 + 4, ly * 19);
          const w = BAV.W * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(s), 3.2))) * (1 - 0.14 * s) + edge;
          if (w <= 0) return;
          const a = 0.5 + (w - Math.abs(ly)) * RPX;
          if (a <= 0) return;
          o.a = a > 1 ? 1 : a;
          const q = Math.abs(ly) / w, base = assietteAt(x, y);
          const inCut = sliced && s > BAV.cut;
          let h = base + BAV.T * (1 - 0.5 * Math.pow(q, 4)) * (0.9 + 0.1 * Math.sqrt(Math.max(0, 1 - s * s)));
          let face = 0, f = 0;
          if (inCut) {
            // tranches couchées vers la gauche : la coupe (rose) regarde en haut à gauche
            const k = (s - BAV.cut) / ((1.02 - BAV.cut) / 4);
            f = k - Math.floor(k);
            face = 1;
            h = base + BAV.T * (0.5 + 0.55 * (1 - f)) * (1 - 0.35 * Math.pow(q, 4));
            if (f > 0.9) h = base + BAV.T * 0.45; // le sillon entre deux tranches
          }
          if (face) {
            // la coupe : croûte, liseré gris-brun, chair rose et juteuse au cœur
            const t = f / 0.9;
            const crust = Math.max(1 - smooth(0.04, 0.12, t), smooth(0.86, 0.95, t));
            const grey = Math.max(1 - smooth(0.12, 0.24, t), smooth(0.74, 0.86, t));
            o.r = 206; o.g = 96; o.b = 100;
            tint(o, [192, 70, 80], (1 - Math.abs(t - 0.48) / 0.3) * 0.5);
            tint(o, [146, 104, 90], grey * (1 - crust));
            tint(o, [60, 34, 22], crust);
            const fib = n2fib(nF, lx, ly);
            o.r *= 1 + 0.05 * fib; o.g *= 1 + 0.04 * fib; o.b *= 1 + 0.04 * fib;
            if (f > 0.9) { o.r *= 0.45; o.g *= 0.4; o.b *= 0.4; }
            o.sp = 0.3; o.sh = 40; o.cc = 0.6 * (1 - crust); o.ss = 0.3;
          } else {
            // grillée : brun profond, fibres en biais, quadrillage noirci, jus luisant
            const fib = n2fib(nF, lx, ly);
            o.r = 104; o.g = 62; o.b = 40;
            tint(o, [70, 40, 26], smooth(0.1, 0.8, -nC(lx * 2, ly * 2)) * 0.5);
            tint(o, [148, 92, 56], smooth(0.4, 0.9, nC(lx * 3 + 4, ly * 3)) * 0.25);
            o.r *= 1 + 0.08 * fib; o.g *= 1 + 0.08 * fib; o.b *= 1 + 0.08 * fib;
            h += 0.004 * fib * (1 - q);
            const mark = grillMarks(lx, ly, 0.75, -0.8, 0.1, nG(lx * 8, ly * 8)) * (1 - smooth(0.7, 0.92, q));
            tint(o, [32, 18, 10], mark * 0.85);
            h -= 0.003 * mark;
            const juice = smooth(0.0, 0.6, nJ(lx * 4.5, ly * 4.5)) * (1 - mark);
            o.sp = 0.16 + 0.3 * juice; o.sh = 30; o.cc = 0.5 * juice; o.ss = 0.08;
          }
          o.h = h; o.hb = base; o.id = inCut ? 2 + Math.floor((s - BAV.cut) / ((1.02 - BAV.cut) / 4)) : 1; o.k = 16;
          o.sr = 100; o.sg = 60; o.sb = 42;
        };
      });
    }
    // les fibres de la bavette : de longs traits serrés, en biais
    function n2fib(n, lx, ly) {
      const u = lx * 0.34 + ly * 0.94, v = lx * 0.94 - ly * 0.34;
      return n(u * 60, v * 4) * 0.7 + n(u * 140 + 3, v * 9) * 0.3;
    }
    bavette('bavette-entiere', false);
    bavette('bavette-tranchee', true);

    /* ---------- Frites maison : bâtonnets rustiques en tas, dorés, arêtes et bouts plus bruns ---------- */
    const FRI = { x: 0.46, y: -0.16, R: 0.36 }; // (un peu en arrière : la pastille « frites maison » couvre l'avant droit)
    function friesPile(id, meta, F0, base) {
      defP(id, Object.assign({ hmax: 0.42, shadow: OMBRE_F }, meta), () => {
        const r = rng(hash(id));
        const n1 = noise2(301), n2 = noise2(302), n3 = noise2(303);
        const L = [];
        for (let i = 0; i < F0.n; i++) {
          const a = r() * TAU, d = F0.R * 0.72 * Math.pow(r(), 0.75);
          const x = F0.x + Math.cos(a) * d, y = F0.y + Math.sin(a) * d * 0.95;
          const ang = r() * Math.PI, len = r.range(0.2, 0.38) * (F0.scale || 1), hw = r.range(0.021, 0.029) * (F0.scale || 1);
          const z = F0.H * Math.max(0, 1 - (d / F0.R) * (d / F0.R)) * r.range(0.45, 1);
          L.push({ x, y, c: Math.cos(ang), s: Math.sin(ang), hl: len / 2, hw, z, tone: r(), skin: r() < 0.35 ? (r() < 0.5 ? 1 : -1) : 0, o: r.range(0, 50) });
        }
        L.sort((p, q) => p.z - q.z);
        const G = 0.08, X0 = F0.x - F0.R - 0.25, Y0 = F0.y - F0.R - 0.25, NX = Math.ceil((2 * F0.R + 0.5) / G), cells = new Array(NX * NX);
        L.forEach((f, k) => {
          const ex = Math.abs(f.c) * f.hl + f.hw, ey = Math.abs(f.s) * f.hl + f.hw;
          const i0 = Math.max(0, Math.floor((f.x - ex - X0) / G)), i1 = Math.min(NX - 1, Math.floor((f.x + ex - X0) / G));
          const j0 = Math.max(0, Math.floor((f.y - ey - Y0) / G)), j1 = Math.min(NX - 1, Math.floor((f.y + ey - Y0) / G));
          for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) (cells[j * NX + i] || (cells[j * NX + i] = [])).push(k);
        });
        return function (x, y, o) {
          const ci = Math.floor((x - X0) / G), cj = Math.floor((y - Y0) / G);
          if (ci < 0 || cj < 0 || ci >= NX || cj >= NX) return;
          const list = cells[cj * NX + ci];
          if (!list) return;
          let best = -9, sec = -9, bj = -1, cov = 0, bt = 0, bq = 0, bv = 0;
          for (let k = 0; k < list.length; k++) {
            const f = L[list[k]];
            const dx = x - f.x, dy = y - f.y;
            const u = dx * f.c + dy * f.s, v = -dx * f.s + dy * f.c;
            const t = u / f.hl;
            if (t <= -1.02 || t >= 1.02) continue;
            const w = f.hw * (1 + 0.08 * n1(u * 20 + f.o, 0.5));
            const av = Math.abs(v);
            if (av >= w) continue;
            const endc = Math.abs(t) > 0.96 ? Math.sqrt(Math.max(0, 1 - Math.pow((Math.abs(t) - 0.96) / 0.06, 2))) : 1;
            const cv = Math.min((w - av) * RPX + 0.5, (1.02 - Math.abs(t)) * f.hl * RPX + 0.5);
            if (cv > cov) cov = cv;
            const q = av / w;
            const hh = f.z + 1.8 * f.hw * Math.sqrt(Math.max(0, 1 - q * q * q * q)) * endc;
            if (hh > best) { sec = best; best = hh; bj = list[k]; bt = t; bq = q; bv = v / w; } else if (hh > sec) sec = hh;
          }
          if (bj < 0) return;
          const f = L[bj];
          o.a = cov > 1 ? 1 : cov;
          // dorée, plus brune sur les arêtes et aux bouts ; parfois un liseré de peau (coupe rustique)
          o.r = 246 - 14 * f.tone; o.g = 206 - 24 * f.tone; o.b = 112 - 26 * f.tone;
          tint(o, [252, 224, 150], smooth(0.3, 0.9, n2(x * 20 + f.o, y * 20)) * 0.3 * (1 - bq));
          tint(o, [212, 150, 70], smooth(0.62, 0.96, bq) * 0.5);
          tint(o, [184, 116, 48], smooth(0.8, 1, Math.abs(bt)) * 0.7);
          if (f.skin && bv * f.skin > 0.62) tint(o, [168, 116, 60], 0.8);
          tint(o, [216, 150, 70], smooth(0.5, 0.9, n3(x * 7, y * 7)) * 0.25);
          const b0 = base(x, y), under = sec > -5 && sec > best - 0.07;
          o.h = b0 + best; o.hb = b0 + (under ? sec - 0.004 : Math.max(0, best - 1.9 * f.hw));
          o.sp = 0.34; o.sh = 30; o.cc = 0.28; o.ss = 0.3;
          o.id = 1 + bj; o.k = 17;
          if (under) { o.sr = 170; o.sg = 112; o.sb = 50; } else { o.sr = 226; o.sg = 172; o.sb = 90; }
        };
      });
    }
    friesPile('frites', { cx: FRI.x, cy: FRI.y, ext: 0.46, exy: 0.46, ky: 1.3 }, { x: FRI.x, y: FRI.y, R: FRI.R, n: 36, H: 0.14 }, assietteAt);

    /* ---------- La salade maison qui accompagne (devant à gauche) ---------- */
    const SMA = { x: -0.36, y: 0.4, R: 0.36 };
    defP('salade-maison', { cx: SMA.x, cy: SMA.y, ext: 0.46, exy: 0.44, hmax: 0.34, ky: 1.2, shadow: OMBRE_F }, () => {
      const leaves = leafDome(hash('salade maison'), SMA.x, SMA.y, 0.4, 16, 7, { batavia: 0.5, chene: 0.3, frisee: 0.2 });
      const dome = (x, y) => {
        const dx = x - SMA.x, dy = y - SMA.y, d = Math.sqrt(dx * dx + dy * dy) / SMA.R;
        return assietteAt(x, y) + 0.008 + (d < 1 ? 0.11 * (1 - d * d) : 0);
      };
      return leafPile(hash('salade maison') ^ 3, leaves, dome);
    });

    /* ======================================================================
       Les wraps : la galette de blé ouverte sur l'ardoise, la garniture posée
       en bande, puis roulée, coupée en biais : deux moitiés dont la coupe montre
       les couches enroulées.
       ====================================================================== */
    const TOR = { x: 0, y: 0.04, R: 0.78 }, TOR_TOP = ARD_TOP + 0.01;
    const BANDE = { x: 0, y: 0.27, hx: 0.54, hy: 0.16 };
    // la pâte : crème, farinée, des plages dorées douces (jamais des points)
    function tortillaInk(x, y, o, nB, nF) {
      o.r = 236; o.g = 222; o.b = 188;
      tint(o, [212, 166, 104], smooth(0.3, 0.8, nB(x * 3.2, y * 3.2)) * 0.5);
      tint(o, [190, 136, 78], smooth(0.6, 0.9, nB(x * 7 + 3, y * 7)) * 0.38);
      tint(o, [248, 240, 220], smooth(0.2, 0.7, nF(x * 8, y * 8)) * 0.25);
    }
    defP('tortilla', { cx: TOR.x, cy: TOR.y, ext: 0.84, exy: 0.84, hmax: 0.06, shadow: OMBRE }, () => {
      const R0 = polar(hash('tortilla'), TOR.R, [[3, 0.008], [5, 0.006], [7, 0.004]], 0.006, 3);
      const n1 = noise2(311), nB = noise2(312), nF = noise2(313);
      return function (x, y, o) {
        const dx = x - TOR.x, dy = y - TOR.y, rr = Math.sqrt(dx * dx + dy * dy), R = R0(Math.atan2(dy, dx));
        const a = 0.5 + (R - rr) * RPX;
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const u = rr / R;
        o.h = TOR_TOP + 0.004 * n1(x * 5, y * 5) + 0.008 * smooth(0.86, 1, u) - 0.008;
        o.hb = ARD_TOP;
        tortillaInk(x, y, o, nB, nF);
        o.sp = 0.1; o.sh = 16; o.cc = 0.04; o.ss = 0.35;
        o.id = 1; o.k = 18;
        o.sr = 226; o.sg = 212; o.sb = 178;
      };
    });
    // les garnitures posées en bande (toutes dans le même coin de la galette)
    const bandMeta = { cx: BANDE.x, cy: BANDE.y, ext: 0.66, exy: 0.3 };
    const bandBase = (z) => () => TOR_TOP + z;
    /* sauce étalée dans la bande */
    function bandSauce(id, cfg) {
      defP(id, Object.assign({ hmax: 0.08 }, bandMeta), () => {
        const sd0 = hash(id), nE = noise2(sd0 ^ 9);
        const ink = sauceInk(sd0, cfg, 0.7, { cx: BANDE.x, cy: BANDE.y, hx: BANDE.hx, hy: BANDE.hy });
        return function (x, y, o) {
          const sd = sdRoundBox(x - BANDE.x, y - BANDE.y, BANDE.hx + 0.02, BANDE.hy + 0.02, 0.1) + 0.022 * nE(x * 5, y * 5);
          const a = 0.5 - sd * RPX;
          if (a <= 0) return;
          o.a = a > 1 ? 1 : a;
          const up = ink(x, y, o);
          o.h = TOR_TOP + 0.002 + 0.007 * smooth(0, 0.04, -sd) + up; o.hb = TOR_TOP - 0.002;
        };
      });
    }
    bandSauce('ruban-sauce-aneth', { col: [246, 244, 230], col2: [236, 236, 214], dill: true, sp: 0.4, sh: 32, cc: 0.6, ss: 0.4 });
    bandSauce('ruban-sauce-ciboulette', { col: [250, 248, 238], col2: [238, 234, 218], chives: true, sp: 0.38, sh: 30, cc: 0.6, ss: 0.4 });
    bandSauce('ruban-sauce-curry', { col: [238, 188, 80], col2: [228, 168, 60], sp: 0.45, sh: 34, cc: 0.7, ss: 0.45 });
    /* salade en bande */
    defP('ruban-salade', Object.assign({ hmax: 0.2, ky: 1.2, shadow: OMBRE }, bandMeta), () => {
      const r = rng(hash('ruban salade'));
      const leaves = [];
      const TYS = ['batavia', 'chene', 'frisee', 'batavia', 'lollo', 'batavia', 'chene', 'frisee', 'batavia', 'lollo', 'batavia', 'frisee'];
      TYS.forEach((ty, i) => {
        const x = -0.5 + (i / (TYS.length - 1)) * 0.98 + r.range(-0.04, 0.04), y = BANDE.y + r.range(-0.09, 0.09);
        leaves.push({ x, y, dir: (r() < 0.5 ? 0 : Math.PI) + r.range(-0.6, 0.6), L: r.range(0.2, 0.3), W: r.range(0.07, 0.1), z: r.range(0, 0.02), ty });
      });
      for (let i = 0; i < 6; i++) leaves.push({ x: r.range(-0.48, 0.48), y: BANDE.y + r.range(-0.1, 0.1), dir: r() * TAU, L: r.range(0.1, 0.16), W: r.range(0.025, 0.035), z: r.range(0.02, 0.035), ty: ['roquette', 'mache', 'lollo'][i % 3], big: false });
      return leafPile(hash('ruban salade') ^ 5, leaves, bandBase(0.012));
    });
    /* tomates en rondelles */
    defP('ruban-tomates', Object.assign({ hmax: 0.2, shadow: OMBRE }, bandMeta), () => {
      const r = rng(hash('ruban tomates'));
      const n1 = noise2(321), n2 = noise2(322);
      const P = [];
      for (let i = 0; i < 5; i++) P.push({ x: -0.44 + i * 0.22 + r.range(-0.02, 0.02), y: BANDE.y - 0.03 + r.range(-0.03, 0.03), rot: r() * TAU, R: r.range(0.085, 0.095), nL: r() < 0.5 ? 3 : 4, o: r.range(0, 50), z: (i % 2) * 0.008 });
      const Q = {};
      return function (x, y, o) {
        const ok = topPiece(P, x, y, 0.1, (p, u, v, Q) => {
          const d = Math.sqrt(u * u + v * v), Re = p.R * (1 + 0.015 * Math.sin(Math.atan2(v, u) * 5 + p.o));
          const cv = (Re - d) * RPX + 0.5;
          if (cv <= 0) return false;
          Q.cv = cv; Q.ww = d / Re; Q.hh = p.z + 0.028 + 0.004 * (1 - (d / Re) * (d / Re));
          return true;
        }, Q);
        if (!ok) return;
        const p = P[Q.j], rho = Q.w, phi = Math.atan2(Q.v, Q.u);
        o.a = Q.cov > 1 ? 1 : Q.cov;
        let dphi = 9;
        for (let k = 0; k < p.nL; k++) { const dd = Math.abs(angDiff(phi, p.o + (k / p.nL) * TAU)); if (dd < dphi) dphi = dd; }
        const peri = smooth(0.7 + 0.05 * n1(Q.u * 30 + p.o, Q.v * 30), 0.78, rho);
        const sept = 1 - smooth(0.05, 0.1, dphi * rho);
        const colm = 1 - smooth(0.16, 0.24, rho);
        const flesh = Math.max(peri, sept, colm), gel = 1 - flesh;
        o.r = 228; o.g = 74; o.b = 40;
        tint(o, colm >= Math.max(peri, sept) ? [236, 116, 92] : sept > peri ? [212, 44, 32] : [204, 32, 26], flesh);
        tint(o, [158, 20, 16], smooth(0.955, 0.985, rho));
        o.h = TOR_TOP + Q.best - 0.005 * gel; o.hb = TOR_TOP + 0.01;
        o.sp = 0.3 + 0.35 * gel; o.sh = 34 + 30 * gel; o.cc = 0.4 + 0.55 * gel; o.ss = 0.45 + 0.4 * gel;
        o.id = 1 + Q.j; o.k = 5;
        o.sr = 188; o.sg = 30; o.sb = 22;
      };
    });
    /* saumon fumé : tranches à plat, un peu ondulées */
    defP('ruban-saumon', Object.assign({ hmax: 0.2, shadow: OMBRE }, bandMeta), () => {
      const r = rng(hash('ruban saumon'));
      const n1 = noise2(331), n2 = noise2(332);
      const SL = [-0.3, 0.02, 0.32].map((x, i) => ({ x, y: BANDE.y + r.range(-0.03, 0.03), rot: r.range(-0.25, 0.25), hl: 0.19, hw: 0.075, fq: r.range(14, 20), ph: r() * 50, z: i * 0.006 }));
      return function (x, y, o) {
        let best = -9, sec = -9, bj = -1, cov = 0, bu = 0, bv = 0;
        for (let j = 0; j < SL.length; j++) {
          const s = SL[j], dx = x - s.x, dy = y - s.y, cs = Math.cos(s.rot), sn = Math.sin(s.rot);
          const u = dx * cs + dy * sn, v = -dx * sn + dy * cs - 0.012 * Math.sin(u * 20 + s.ph);
          const sd = sdRoundBox(u, v, s.hl, s.hw, 0.05) + 0.008 * n1(u * 12 + s.ph, v * 12);
          const cv = 0.5 - sd * RPX;
          if (cv <= 0) continue;
          if (cv > cov) cov = cv;
          const h = s.z + 0.05 + 0.01 * Math.sin(u * s.fq + s.ph) + 0.004 * (1 - smooth(-0.02, 0, sd));
          if (h > best) { sec = best; best = h; bj = j; bu = u; bv = v; } else if (h > sec) sec = h;
        }
        if (bj < 0) return;
        const s = SL[bj];
        o.a = cov > 1 ? 1 : cov;
        o.r = 238; o.g = 120; o.b = 80;
        const line = 1 - smooth(0.04, 0.12, Math.abs(Math.sin((bu * 9 + bv * 5 + s.ph) * Math.PI * 0.5)));
        tint(o, [252, 220, 200], line * 0.5);
        tint(o, [250, 170, 130], smooth(0.2, 0.9, n2(x * 8, y * 8)) * 0.25);
        const under = sec > -5 && sec > best - 0.05;
        o.h = TOR_TOP + best; o.hb = TOR_TOP + (under ? sec - 0.004 : 0.02);
        o.sp = 0.38; o.sh = 38; o.cc = 0.6; o.ss = 0.62;
        o.id = 1 + bj; o.k = 8;
        o.sr = under ? 150 : 222; o.sg = under ? 70 : 104; o.sb = under ? 50 : 70;
      };
    });
    /* chèvre frais en demi-rondelles */
    defP('ruban-chevre', Object.assign({ hmax: 0.2, shadow: OMBRE }, bandMeta), () => {
      const r = rng(hash('ruban chevre'));
      const n1 = noise2(341), n2 = noise2(342);
      const P = [];
      for (let i = 0; i < 5; i++) P.push({ x: -0.44 + i * 0.22 + r.range(-0.02, 0.02), y: BANDE.y + 0.04, rot: r.range(-0.4, 0.4) + (i % 2 ? Math.PI : 0), R: r.range(0.07, 0.08), o: r.range(0, 40) });
      const Q = {};
      return function (x, y, o) {
        const ok = topPiece(P, x, y, 0.1, (p, u, v, Q) => {
          const d = Math.sqrt(u * u + v * v), Re = p.R * (1 + 0.05 * n1(u * 30 + p.o, v * 30));
          const sdv = -v - 0.004; // la demi-rondelle : le côté plat vers l'arrière
          const cv = Math.min((Re - d) * RPX + 0.5, 0.5 - sdv * RPX);
          if (cv <= 0) return false;
          Q.cv = cv; Q.ww = d / Re;
          Q.hh = 0.052 + 0.02 * Math.sqrt(Math.max(0, 1 - (d / Re) * (d / Re)));
          return true;
        }, Q);
        if (!ok) return;
        o.a = Q.cov > 1 ? 1 : Q.cov;
        o.r = 250; o.g = 249; o.b = 244;
        tint(o, [238, 234, 222], smooth(0.2, 0.9, n2(x * 20, y * 20)) * 0.4);
        o.h = TOR_TOP + Q.best + 0.002 * n2(x * 50, y * 50); o.hb = TOR_TOP + 0.02;
        o.sp = 0.12; o.sh = 18; o.cc = 0.05; o.ss = 0.5;
        o.id = 1 + Q.j; o.k = 6;
        o.sr = 240; o.sg = 238; o.sb = 230;
      };
    });
    /* miel en filet sur la bande */
    honeyDrizzle('ruban-miel', Object.assign({}, bandMeta), {
      n: 180, hw: 0.01,
      at(t) {
        const phs = t * 5.5 * TAU + 0.4, sw = Math.sin(phs);
        return { x: -0.5 + t * 1.0 + 0.03 * Math.sin(2 * phs), y: BANDE.y + 0.12 * sw, sw };
      },
    }, bandBase(0.075));
    /* jambon sec, deux tranches à plat */
    hamRibbons('ruban-jambon', Object.assign({ base: bandBase(0.03) }, bandMeta), [
      { x: -0.24, y: BANDE.y - 0.02, dir: 0.08, L: 0.5, W: 0.1, flat: true },
      { x: 0.26, y: BANDE.y + 0.03, dir: -0.1, L: 0.48, W: 0.1, flat: true, z: 0.008 },
    ]);
    /* blanc de poulet en lanières */
    chickenSlices('ruban-poulet', bandMeta, [0, 1, 2, 3].map((i) => ({ x: -0.36 + i * 0.24, y: BANDE.y + (i % 2 ? 0.05 : -0.04), c: Math.cos(0.1 * (i % 2 ? 1 : -1)), s: Math.sin(0.1 * (i % 2 ? 1 : -1)), hl: 0.14, hw: 0.04, z: 0.02 + i * 0.004 })), bandBase(0.02));
    /* poivrons en lanières */
    {
      const r = rng(hash('ruban poivrons'));
      const L = [];
      for (let j = 0; j < 6; j++) L.push({ x: -0.42 + j * 0.17 + r.range(-0.03, 0.03), y: BANDE.y + r.range(-0.07, 0.07), dir: r.range(-0.5, 0.5), L: r.range(0.2, 0.26), bend: r.range(-0.2, 0.2), hw: r.range(0.026, 0.032), red: j % 2 === 0, o: r.range(0, 60), z: 0.01 + j * 0.004 });
      pepperStrips('ruban-poivrons', bandMeta, L, bandBase(0.035));
    }

    /* ---------- Le wrap roulé (couché le long de x) ---------- */
    const WRP = { R: 0.21, y: -0.3, L: 0.62 };
    defP('wrap-roule', { cx: 0, cy: WRP.y, ext: 0.7, exy: 0.26, hmax: 0.46, shadow: OMBRE_F }, () => {
      const nB = noise2(351), nF = noise2(352), n3 = noise2(353);
      return function (x, y, o) {
        const ax = Math.abs(x);
        if (ax > WRP.L) return;
        const Rx = WRP.R * (ax > WRP.L - 0.07 ? Math.sqrt(Math.max(0, 1 - Math.pow((ax - (WRP.L - 0.07)) / 0.07, 2))) * 0.85 + 0.15 : 1);
        const dy = y - WRP.y;
        const a = Math.min(0.5 + (Rx - Math.abs(dy)) * RPX, 0.5 + (WRP.L - ax) * RPX);
        if (a <= 0) return;
        o.a = a > 1 ? 1 : a;
        const s = Math.sqrt(Math.max(0, Rx * Rx - dy * dy)), zc = ARD_TOP + WRP.R;
        // la galette roulée : son bord fait une couture le long du rouleau, de légers plis en travers
        const seam = dy + 0.085;
        let h = zc + s + 0.0025 * Math.sin(x * 38 + 3 * n3(x * 3, y * 3));
        if (seam > 0) h += 0.004;
        o.h = h; o.hb = zc - 0.45 * Rx;
        if (Math.abs(dy) > Rx * 0.9) o.hr = zc;
        tortillaInk(x * 1.3, y * 1.3, o, nB, nF);
        const line = 1 - smooth(0, 0.01, Math.abs(seam));
        tint(o, [176, 150, 112], line * 0.6);
        o.sp = 0.1; o.sh = 16; o.cc = 0.05; o.ss = 0.35;
        o.id = 1; o.k = 18;
        o.sr = 226; o.sg = 212; o.sb = 178;
      };
    });

    /* ---------- Les deux moitiés, coupées en biais : la coupe montre les couches enroulées ---------- */
    const WRAP_LAYERS = {
      saumon: [['salade', 0.3], ['aneth', 0.07], ['tomate', 0.19], ['saumon', 0.34], ['aneth', 0.1]],
      chevre: [['salade', 0.26], ['ciboulette', 0.07], ['tomate', 0.15], ['jambon', 0.2], ['chevre', 0.2], ['miel', 0.05], ['ciboulette', 0.07]],
      poulet: [['salade', 0.28], ['curry', 0.08], ['tomate', 0.14], ['poivrons', 0.17], ['poulet', 0.26], ['curry', 0.07]],
    };
    // la coupe d'un wrap au point (a, b) du disque unité (a : en travers, vers nous ; b : vertical)
    function wrapSection(a, b, rec, o, nA, nB) {
      const rho = Math.sqrt(a * a + b * b), th = Math.atan2(b, a);
      // la galette : la couche extérieure, puis un tour intérieur qui s'enroule (et s'arrête)
      const outer = smooth(0.905, 0.925, rho);
      const phi = ((th - 2.2) % TAU + TAU) % TAU; // angle déroulé depuis le bord intérieur de la galette
      const rt = 0.84 - 0.07 * (phi / TAU);
      const inner = phi < 1.65 * Math.PI ? 1 - smooth(0.018, 0.03, Math.abs(rho - rt)) : 0;
      let bump = 0;
      if (outer > 0 || inner > 0.5) {
        const k = Math.max(outer, inner);
        o.r = 242; o.g = 234; o.b = 212;
        tint(o, [226, 206, 168], smooth(0.97, 1, rho) * 0.6); // le bord doré de la galette
        o.sp = 0.12; o.sh = 18; o.cc = 0.08; o.ss = 0.35;
        bump = 0.012 * k;
        if (k > 0.5) return bump;
      }
      // les garnitures : des couches arrondies autour d'un point sous le centre (comme roulées)
      const l = Math.sqrt(a * a * 0.9 + (b + 0.55) * (b + 0.55)) / 1.5 + 0.05 * Math.sin(th * 3 + 1.3) + 0.035 * nA(a * 3, b * 3);
      const LY = WRAP_LAYERS[rec];
      let acc = 0, m = LY[LY.length - 1][0], lf = 0;
      for (let i = 0; i < LY.length; i++) {
        const t = LY[i][1];
        if (l < acc + t || i === LY.length - 1) { m = LY[i][0]; lf = clamp01((l - acc) / t); break; }
        acc += t;
      }
      const n = nB(a * 9, b * 9);
      o.sp = 0.2; o.sh = 24; o.cc = 0.2; o.ss = 0.4;
      switch (m) {
        case 'salade': {
          const cr = Math.sin(lf * 14 + th * 2 + 2 * nA(a * 4, b * 4));
          o.r = 112; o.g = 176; o.b = 56;
          tint(o, [196, 230, 134], smooth(0.55, 0.95, cr) * 0.6); // les nervures claires
          tint(o, [64, 124, 32], smooth(0.4, 0.95, -cr) * 0.45);
          bump = 0.018 + 0.01 * cr; o.ss = 0.65; o.cc = 0.3; break;
        }
        case 'aneth': case 'ciboulette':
          o.r = 248; o.g = 246; o.b = 236;
          tint(o, m === 'aneth' ? [80, 130, 52] : [92, 156, 60], (1 - smooth(0.03, 0.09, Math.abs(nB(a * 30, b * 8)))) * 0.8);
          bump = -0.006; o.sp = 0.4; o.cc = 0.5; break;
        case 'curry':
          o.r = 236; o.g = 182; o.b = 72; bump = -0.006; o.sp = 0.4; o.cc = 0.55; break;
        case 'tomate':
          o.r = 214; o.g = 40; o.b = 30;
          tint(o, [238, 110, 80], (1 - Math.abs(lf - 0.5) * 2) * 0.55);
          bump = 0.01; o.cc = 0.7; o.ss = 0.6; break;
        case 'saumon':
          o.r = 240; o.g = 124; o.b = 84;
          tint(o, [252, 222, 202], (1 - smooth(0.03, 0.1, Math.abs(Math.sin((lf * 3 + th * 1.5) * Math.PI)))) * 0.5);
          bump = 0.014; o.cc = 0.55; o.ss = 0.6; break;
        case 'jambon':
          o.r = 186; o.g = 66; o.b = 72;
          tint(o, [246, 232, 222], smooth(0.8, 0.95, lf));
          bump = 0.01; o.cc = 0.35; break;
        case 'chevre':
          o.r = 250; o.g = 249; o.b = 244;
          tint(o, [236, 232, 220], smooth(0.2, 0.9, n) * 0.3);
          bump = 0.016; o.sp = 0.1; o.cc = 0.05; break;
        case 'miel':
          o.r = 222; o.g = 150; o.b = 40; bump = 0.004; o.sp = 0.5; o.cc = 1; o.ss = 1; break;
        case 'poivrons':
          if (Math.sin(th * 2 + 0.7) > 0) { o.r = 206; o.g = 38; o.b = 24; } else { o.r = 240; o.g = 170; o.b = 30; }
          bump = 0.01; o.cc = 0.6; break;
        case 'poulet':
          o.r = 236; o.g = 220; o.b = 192;
          tint(o, [202, 148, 82], smooth(0.8, 0.95, lf) * 0.8);
          bump = 0.012; o.cc = 0.25; break;
      }
      // un fin liseré d'ombre entre deux couches
      const edge = Math.min(lf, 1 - lf);
      const dk = 1 - 0.25 * (1 - smooth(0, 0.08, edge));
      o.r *= dk; o.g *= dk; o.b *= dk;
      return bump;
    }
    // une moitié : cylindre couché le long de x, bout fermé arrondi, coupé par un plan incliné (normale N)
    function wrapHalf(id, H, rec) {
      const dirE = H.xe > H.xc ? 1 : -1, xm = (H.xe + H.xc) / 2;
      defP(id, { cx: xm, cy: H.y0, ext: Math.abs(H.xe - H.xc) / 2 + 0.26, exy: 0.28, hmax: 0.46, shadow: OMBRE_F }, () => {
        const nA = noise2(361), nB = noise2(362), nT = noise2(363), nF = noise2(364);
        const N = H.N, R = WRP.R, zc = ARD_TOP + R;
        return function (x, y, o) {
          const e = (x - H.xe) * -dirE; // distance au bout fermé, vers la coupe
          if (e < 0) return;
          const Rx = R * (e < 0.12 ? Math.sqrt(Math.max(0, 1 - Math.pow((0.12 - e) / 0.12, 2))) * 0.8 + 0.2 : 1);
          const dy = y - H.y0;
          const aSide = 0.5 + (Rx - Math.abs(dy)) * RPX;
          if (aSide <= 0) return;
          const s = Math.sqrt(Math.max(0, Rx * Rx - dy * dy));
          const zp = zc - ((x - H.xc) * N[0] + dy * N[1]) / N[2];
          const zbot = zc - s, ztop = zc + s;
          if (zp <= zbot) return;
          const aCut = 0.5 + ((zp - zbot) / (Math.hypot(N[0], N[1]) / N[2] + 1e-3)) * RPX * 0.7;
          o.a = Math.min(1, aSide, aCut);
          const face = zp < ztop;
          let h = face ? zp : ztop;
          if (face) {
            const bump = wrapSection(dy / R, (zp - zc) / R, rec, o, nA, nB);
            h += bump * R;
            o.k = 20;
          } else {
            tortillaInk(x * 1.3, y * 1.3, o, nT, nF);
            const seam = dy + 0.085;
            if (seam > 0) h += 0.004;
            tint(o, [176, 150, 112], (1 - smooth(0, 0.01, Math.abs(seam))) * 0.6);
            h += 0.0025 * Math.sin(x * 38);
            o.sp = 0.1; o.sh = 16; o.cc = 0.05; o.ss = 0.35;
            o.k = 18;
          }
          o.h = h; o.hb = Math.max(zbot, zc - 0.45 * Rx);
          if (!face && Math.abs(dy) > Rx * 0.9) o.hr = zc;
          o.id = face ? 2 : 1;
          o.sr = 226; o.sg = 212; o.sb = 178;
        };
      });
    }
    const nrm3 = (x, y, z) => { const l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; };
    // devant : la coupe regarde à gauche, vers la lumière (et loin de la pastille « frites maison », en bas à droite) ;
    // derrière : la coupe regarde à droite
    const HALF_A = { y0: 0.22, xe: 0.8, xc: -0.14, N: nrm3(-0.62, 0.52, 0.58) };
    const HALF_B = { y0: -0.24, xe: -0.8, xc: 0.12, N: nrm3(0.62, 0.52, 0.58) };
    ['saumon', 'chevre', 'poulet'].forEach((rec) => {
      wrapHalf('wrap-' + rec + '-a', HALF_A, rec);
      wrapHalf('wrap-' + rec + '-b', HALF_B, rec);
    });

    /* ======================================================================
       Le calcul : champs → lumière → projection → PNG
       ====================================================================== */
    function frame(id) {
      const D = DEFS[id], p = (D.phi * Math.PI) / 180, s = Math.sin(p), c = Math.cos(p);
      return { x0: D.cx - D.ext, x1: D.cx + D.ext, y0: (D.cy - D.exy) * s - D.hmax * c - 0.01, y1: (D.cy + D.exy) * s - D.hbmin * c + 0.01 };
    }

    /* L'éclairage de studio, cuit dans les textures (repère : x à droite, y vers la caméra, z en haut) :
       une principale chaude en haut à gauche, un débouché froid et doux à droite, un contre-jour orangé
       derrière à droite (le couchant du hublot) qui dessine les bords, une ambiance ciel au-dessus et
       charbon dessous. Reflets en deux lobes : la brillance propre de la matière, et un « vernis » net
       (dorure à l'œuf, sauce, fromage fondu, gelée de tomate, miel) qui accroche aussi le contre-jour. */
    const nrm = (x, y, z) => { const l = Math.sqrt(x * x + y * y + z * z); return [x / l, y / l, z / l]; };
    const L1 = nrm(-0.45, 0.35, 0.82); // principale (grande boîte à lumière, assez haut)
    const L2 = nrm(0.75, 0.55, 0.35); // débouché
    const L4 = nrm(0.6, -0.62, 0.5); // contre-jour du couchant
    // la vue du calcul en cours (réglée par render, recette par recette)
    let VS = S, VC = C;
    let V = [0, C, S]; // vers la caméra
    let H1 = nrm(L1[0] + V[0], L1[1] + V[1], L1[2] + V[2]);
    let H4 = nrm(L4[0] + V[0], L4[1] + V[1], L4[2] + V[2]);
    function setView(phi) {
      const p = (phi * Math.PI) / 180;
      VS = Math.sin(p); VC = Math.cos(p);
      V = [0, VC, VS];
      H1 = nrm(L1[0] + V[0], L1[1] + V[1], L1[2] + V[2]);
      H4 = nrm(L4[0] + V[0], L4[1] + V[1], L4[2] + V[2]);
    }
    const KEY = [1.16, 1.06, 0.92], FILL = [0.19, 0.22, 0.27], RIM = [1.05, 0.6, 0.32];
    const SKY = [0.31, 0.31, 0.32], GND = [0.1, 0.075, 0.06];
    const L1h = Math.hypot(L1[0], L1[1]);
    const LO = [0, 0, 0];
    // la lumière reçue par un point : albédo (0..1), brillance sp/sh, vernis cc, translucidité ss, occlusion ao, ombre shd
    function lit(nx, ny, nz, ar, ag, ab, sp, shn, cc, ss, ao, shd) {
      let kd = nx * L1[0] + ny * L1[1] + nz * L1[2];
      const w = ss * 0.45;
      kd = (kd + w) / (1 + w);
      if (kd < 0) kd = 0;
      kd *= shd;
      let fd = nx * L2[0] + ny * L2[1] + nz * L2[2];
      if (fd < 0) fd = 0;
      let nv = nx * V[0] + ny * V[1] + nz * V[2];
      if (nv < 0) nv = 0;
      const gr = 1 - nv, fr2 = gr * gr;
      let rd = nx * L4[0] + ny * L4[1] + nz * L4[2];
      rd = rd > 0 ? rd * (0.2 + 0.8 * fr2) : 0; // le contre-jour prend surtout les bords rasants
      const hz = 0.5 + 0.5 * nz;
      const a0 = (GND[0] + (SKY[0] - GND[0]) * hz) * ao, a1 = (GND[1] + (SKY[1] - GND[1]) * hz) * ao, a2 = (GND[2] + (SKY[2] - GND[2]) * hz) * ao;
      let r = ar * (a0 + KEY[0] * kd + FILL[0] * fd + RIM[0] * rd * ao);
      let g = ag * (a1 + KEY[1] * kd + FILL[1] * fd + RIM[1] * rd * ao);
      let b = ab * (a2 + KEY[2] * kd + FILL[2] * fd + RIM[2] * rd * ao);
      if (ss > 0) {
        // translucidité : chaleur qui ressort dans l'ombre, et bords qui s'allument à contre-jour
        const t = ss * ((1 - kd) * 0.28 * ao + 0.4 * fr2 * (0.3 + rd));
        r += ar * ar * t * 1.2; g += ag * ag * t * 0.85; b += ab * ab * t * 0.5;
      }
      if (sp > 0 || cc > 0) {
        const fs = 0.4 + 0.6 * fr2 * fr2; // Fresnel : plus brillant de biais
        let d1 = nx * H1[0] + ny * H1[1] + nz * H1[2];
        if (d1 < 0) d1 = 0;
        let d4 = nx * H4[0] + ny * H4[1] + nz * H4[2];
        if (d4 < 0) d4 = 0;
        let s1 = 0, s4 = 0;
        // (les puissances ne valent la peine que près du reflet : en dessous, elles sont nulles à 1/1000 près)
        if (sp > 0) {
          if (d1 > 0.45) s1 += sp * Math.pow(d1, shn) * shd * (0.75 + 0.35 * fs);
          if (d4 > 0.45) s4 += sp * 0.7 * Math.pow(d4, shn) * fs;
        }
        if (cc > 0) {
          if (d1 > 0.9) s1 += cc * 1.3 * Math.pow(d1, 95) * shd;
          if (d4 > 0.88) s4 += cc * 0.9 * Math.pow(d4, 70) * (0.35 + 0.65 * fs);
        }
        s1 *= ao; s4 *= ao;
        r += s1 * KEY[0] + s4 * RIM[0]; g += s1 * KEY[1] + s4 * RIM[1]; b += s1 * KEY[2] + s4 * RIM[2];
      }
      LO[0] = r; LO[1] = g; LO[2] = b;
    }
    // courbe des tons : saturation un peu relevée, épaule douce (les reflets ne brûlent pas), noirs profonds
    const shoulder = (v) => (v <= 0 ? 0 : v < 0.8 ? v : 0.8 + 0.2 * (1 - Math.exp(-(v - 0.8) / 0.2)));
    function toneOut(r, g, b, out, o) {
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      r = l + (r - l) * 1.1; g = l + (g - l) * 1.1; b = l + (b - l) * 1.1;
      out[o] = 255 * shoulder(r); out[o + 1] = 255 * shoulder(g); out[o + 2] = 255 * shoulder(b);
    }
    // tranches : [assombrissement vers le bas, grain, fréquence x, fréquence y, part de la brillance du dessus]
    // (6e valeur : galbe — la normale plonge vers le bas en descendant la tranche)
    const WALL = [
      [0.3, 0.04, 3, 1, 0.3, 0], // 0 par défaut
      [0.22, 0.03, 1, 1, 0.55, 0.55], // 1 pain (taille)
      [0.3, 0.34, 3, 3, 0.5, 0.15], // 2 steak
      [0.34, 0.16, 1, 4, 0.5, 0.1], // 3 pomme de terre
      [0.25, 0.05, 2, 2, 0.5, 0], // 4 feuille
      [0.3, 0.03, 1, 1, 0.9, 0.2], // 5 peau de tomate
      [0.22, 0.03, 2, 2, 0.5, 0.2], // 6 fromage
      [0.12, 0.05, 1, 4, 0.9, 0.6], // 7 nappe fondue / sauce
      [0.22, 0.06, 2, 2, 0.6, 0.2], // 8 jambon
      [0.3, 0.08, 3, 2, 0.6, 0.2], // 9 chorizo
      [0.22, 0.04, 1, 2, 0.9, 0.3], // 10 poivron
      [0.35, 0.12, 4, 4, 0.4, 0], // 11 noix
      [0.1, 0.02, 1, 1, 1, 0.3], // 12 miel
      [0.36, 0.05, 1, 1, 0.5, 0.3], // 13 croûte du pain du bas
      [0.3, 0.01, 1, 1, 0.8, 0.6], // 14 bord de l'assiette (émail)
      [0.25, 0.25, 4, 2, 0.3, 0.1], // 15 tranche de l'ardoise (clivée)
      [0.3, 0.3, 3, 3, 0.5, 0.3], // 16 viande épaisse (cœur rosé en bande)
      [0.3, 0.08, 1, 3, 0.5, 0.3], // 17 frite
      [0.3, 0.04, 2, 2, 0.3, 1.0], // 18 galette de blé (roulée : la tranche file dessous)
      [0.34, 0.14, 3, 3, 0.4, 0.2], // 19 pain grillé, croûtons
      [0.2, 0.05, 2, 2, 0.5, 0.2], // 20 coupe du wrap
    ];

    // grain des tranches : bruit tuilable 256 × 256
    let NTAB = null;
    function noiseTable() {
      if (NTAB) return NTAB;
      const n = noise2(777), T = new Float32Array(65536);
      const f = (x, y) => 0.65 * n(x / 22, y / 22) + 0.35 * n(x / 8 + 50, y / 8);
      for (let y = 0; y < 256; y++) {
        for (let x = 0; x < 256; x++) {
          const wx = x / 256, wy = y / 256;
          T[y * 256 + x] = f(x, y) * (1 - wx) * (1 - wy) + f(x - 256, y) * wx * (1 - wy) + f(x, y - 256) * (1 - wx) * wy + f(x - 256, y - 256) * wx * wy;
        }
      }
      return (NTAB = T);
    }

    // flou boîte séparable, deux passes (≈ gaussien)
    function blurXY(src, W, H, rx, ry) {
      let a = src;
      const b = new Float32Array(src.length), c = new Float32Array(src.length);
      for (let pass = 0; pass < 2; pass++) {
        const wx = 2 * rx + 1;
        for (let y = 0; y < H; y++) {
          const row = y * W;
          let acc = 0;
          for (let x = -rx; x <= rx; x++) acc += a[row + (x < 0 ? 0 : x >= W ? W - 1 : x)];
          for (let x = 0; x < W; x++) {
            b[row + x] = acc / wx;
            const xa = x + rx + 1, xs = x - rx;
            acc += a[row + (xa >= W ? W - 1 : xa)] - a[row + (xs < 0 ? 0 : xs)];
          }
        }
        const wy = 2 * ry + 1;
        for (let x = 0; x < W; x++) {
          let acc = 0;
          for (let y = -ry; y <= ry; y++) acc += b[(y < 0 ? 0 : y >= H ? H - 1 : y) * W + x];
          for (let y = 0; y < H; y++) {
            c[y * W + x] = acc / wy;
            const ya = y + ry + 1, ys = y - ry;
            acc += b[(ya >= H ? H - 1 : ya) * W + x] - b[(ys < 0 ? 0 : ys) * W + x];
          }
        }
        a = c.slice();
      }
      return a;
    }

    /* découpage : d'une traite dans un worker, par tranches de quelques ms sur la page */
    function nextTick() {
      return new Promise((res) => {
        if (typeof document !== 'undefined' && document.hidden) {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => res();
          ch.port2.postMessage(0);
          return;
        }
        let done = false;
        const go = () => { if (!done) { done = true; res(); } };
        requestAnimationFrame(go);
        setTimeout(go, 34);
      });
    }
    const budget = { ms: 6 };
    async function slice(n, fn) {
      if (IN_WORKER) { for (let i = 0; i < n; i++) fn(i); return; }
      let i = 0;
      while (i < n) {
        const t0 = performance.now();
        while (i < n && performance.now() - t0 < budget.ms) fn(i++);
        if (i < n) await nextTick();
      }
    }

    function newOut() { return { a: 0, h: 0, hb: 0, hr: -9, r: 0, g: 0, b: 0, sp: 0, sh: 16, cc: 0, ss: 0, id: 0, k: 0, sr: -1, sg: 0, sb: 0, wt: 0 }; }

    /* 1. les champs vus de dessus */
    async function fields(id, rpx) {
      const D = DEFS[id], px = made(id), E = D.ext, EXY = D.exy, CX = D.cx, CY = D.cy;
      const W = Math.max(8, Math.ceil(2 * E * rpx)), NY = Math.max(8, Math.ceil(2 * EXY * rpx * D.ky));
      const R = W / (2 * E); // pixels par unité, exacts
      const n = W * NY;
      const F = {
        W, NY, E, EXY, CX, CY, rpx: R, ky: NY / (2 * EXY * R), band: D.band,
        a: new Float32Array(n), h: new Float32Array(n), hb: new Float32Array(n), hr: new Float32Array(n),
        r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
        sr: new Float32Array(n), sg: new Float32Array(n), sb: new Float32Array(n),
        sp: new Float32Array(n), sh: new Float32Array(n), cc: new Float32Array(n), ss: new Float32Array(n), wt: new Float32Array(n),
        id: new Uint16Array(n), k: new Uint8Array(n),
      };
      const dx = 1 / R, dy = (2 * EXY) / NY;
      const o = newOut();
      await slice(NY, (py) => {
        RPX = R;
        const y = CY - EXY + (py + 0.5) * dy;
        for (let ix = 0; ix < W; ix++) {
          o.a = 0; o.h = 0; o.hb = 0; o.hr = -9; o.sp = 0; o.sh = 16; o.cc = 0; o.ss = 0; o.id = 0; o.k = 0; o.sr = -1; o.wt = 0;
          px(CX - E + (ix + 0.5) * dx, y, o);
          if (!(o.a > 0)) continue;
          const i = py * W + ix;
          F.a[i] = o.a > 1 ? 1 : o.a; F.h[i] = o.h; F.hb[i] = o.hb; F.hr[i] = o.hr > -5 && o.hr < o.h ? o.hr : o.h;
          F.r[i] = o.r; F.g[i] = o.g; F.b[i] = o.b;
          if (o.sr < 0) { F.sr[i] = o.r * 0.8; F.sg[i] = o.g * 0.8; F.sb[i] = o.b * 0.8; } else { F.sr[i] = o.sr; F.sg[i] = o.sg; F.sb[i] = o.sb; }
          F.sp[i] = o.sp; F.sh[i] = o.sh; F.cc[i] = o.cc; F.ss[i] = o.ss; F.wt[i] = o.wt;
          F.id[i] = o.id; F.k[i] = o.k;
        }
      });
      return F;
    }

    /* 2. la lumière du dessus (normales, occlusion, ombre portée douce) + normales des tranches */
    async function shade(F) {
      const W = F.W, NY = F.NY, n = W * NY, R = F.rpx;
      const sx = R, sy = R * F.ky; // pixels par unité en x et en y
      const Hm = F.h, A = F.a, ID = F.id;
      const HB = blurXY(Hm, W, NY, Math.max(1, Math.round(0.035 * sx)), Math.max(1, Math.round(0.035 * sy)));
      const HE = blurXY(Hm, W, NY, 3, 2);
      const AE = blurXY(A, W, NY, 5, 3);
      const LR = new Float32Array(n), LG = new Float32Array(n), LB = new Float32Array(n);
      const EX = new Float32Array(n), EY = new Float32Array(n);
      const ox = Math.round((-L1[0] / L1h) * 0.045 * sx), oy = Math.round((-L1[1] / L1h) * 0.045 * sy);
      const TMP = [0, 0, 0];
      await slice(NY, (py) => {
        for (let px = 0; px < W; px++) {
          const i = py * W + px;
          if (A[i] <= 0) continue;
          const id = ID[i], h = Hm[i];
          // pente, sans mélanger deux objets voisins ni une marche
          const l = px > 0 ? i - 1 : -1, rt = px < W - 1 ? i + 1 : -1, u = py > 0 ? i - W : -1, d = py < NY - 1 ? i + W : -1;
          const okL = l >= 0 && A[l] > 0.5 && ID[l] === id, okR = rt >= 0 && A[rt] > 0.5 && ID[rt] === id;
          const okU = u >= 0 && A[u] > 0.5 && ID[u] === id, okD = d >= 0 && A[d] > 0.5 && ID[d] === id;
          let gx = 0, gy = 0;
          if (okL && okR) { const d1 = h - Hm[l], d2 = Hm[rt] - h; gx = Math.abs(d1) > 3 * Math.abs(d2) + 1e-4 ? d2 : Math.abs(d2) > 3 * Math.abs(d1) + 1e-4 ? d1 : (d1 + d2) / 2; } else if (okL) gx = h - Hm[l]; else if (okR) gx = Hm[rt] - h;
          if (okU && okD) { const d1 = h - Hm[u], d2 = Hm[d] - h; gy = Math.abs(d1) > 3 * Math.abs(d2) + 1e-4 ? d2 : Math.abs(d2) > 3 * Math.abs(d1) + 1e-4 ? d1 : (d1 + d2) / 2; } else if (okU) gy = h - Hm[u]; else if (okD) gy = Hm[d] - h;
          gx *= sx; gy *= sy;
          const nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
          const nx = -gx * nl, ny = -gy * nl, nz = nl;
          let ao = 1 - (HB[i] - h) * 10;
          ao = ao < 0.36 ? 0.36 : ao > 1 ? 1 : ao;
          const qx = px + ox < 0 ? 0 : px + ox >= W ? W - 1 : px + ox, qy = py + oy < 0 ? 0 : py + oy >= NY ? NY - 1 : py + oy;
          const ds = clamp01((HB[qy * W + qx] - h - 0.003) * 18);
          lit(nx, ny, nz, F.r[i] / 255, F.g[i] / 255, F.b[i] / 255, F.sp[i], F.sh[i], F.cc[i], F.ss[i], ao, 1 - 0.62 * ds);
          toneOut(LO[0], LO[1], LO[2], TMP, 0);
          LR[i] = TMP[0]; LG[i] = TMP[1]; LB[i] = TMP[2];
          // normale horizontale de la tranche : vers l'extérieur du contour, sinon du haut vers le bas d'une marche
          const xl = px > 0 ? i - 1 : i, xr = px < W - 1 ? i + 1 : i, yu = py > 0 ? i - W : i, yd = py < NY - 1 ? i + W : i;
          let ex = -(AE[xr] - AE[xl]) * sx, ey = -(AE[yd] - AE[yu]) * sy;
          let el = Math.sqrt(ex * ex + ey * ey);
          if (el < 0.05 * sx) { ex = -(HE[xr] - HE[xl]) * sx; ey = -(HE[yd] - HE[yu]) * sy; el = Math.sqrt(ex * ex + ey * ey); }
          if (el > 1e-6) { EX[i] = ex / el; EY[i] = ey / el; } else { EX[i] = 0; EY[i] = 1; }
        }
      });
      F.LR = LR; F.LG = LG; F.LB = LB; F.EX = EX; F.EY = EY;
    }

    /* 3. la vue plongeante : colonne par colonne, de l'avant vers l'arrière ; ce qui est
       déjà peint cache ce qui est derrière. Sur-échantillonnage 2 × 2, puis réduction. */
    async function paint(F, fr, H) {
      const W = F.W, NY = F.NY, R = F.rpx;
      const K = R * 2, W2 = W * 2, H2 = H * 2;
      const OC = new Float32Array(W2 * H2 * 3);
      const M = new Uint8Array(W2 * H2);
      const dyw = (2 * F.EXY) / NY;
      const rowPx = dyw * VS * K;
      const topPx = Math.max(1.3, rowPx * 1.2);
      const NT = noiseTable();
      const y0 = fr.y0;
      const LR = F.LR, LG = F.LG, LB = F.LB, A = F.a, Hm = F.h, ID = F.id;

      function put(cx, ya, yb, r1, g1, b1, r2, g2, b2, yc) {
        let r0 = Math.ceil(ya - 0.5);
        if (r0 < 0) r0 = 0;
        let r9 = Math.ceil(yb - 0.5);
        if (r9 > H2) r9 = H2;
        const span = yc - ya;
        for (let row = r0; row < r9; row++) {
          const m = row * W2 + cx;
          if (M[m]) continue;
          M[m] = 1;
          const t = span > 0.01 ? clamp01((row + 0.5 - ya) / span) : 0;
          const o = m * 3;
          OC[o] = r1 + (r2 - r1) * t; OC[o + 1] = g1 + (g2 - g1) * t; OC[o + 2] = b1 + (b2 - b1) * t;
        }
      }

      const TW = [0, 0, 0];
      function wall(cx, ya, yb, yTop, d, tr, tg, tb) {
        let r0 = Math.ceil(ya - 0.5);
        if (r0 < 0) r0 = 0;
        let r9 = Math.ceil(yb - 0.5);
        if (r9 > H2) r9 = H2;
        if (r9 <= r0) return;
        const P = WALL[F.k[d]] || WALL[0];
        const dark = P[0], namp = P[1], nfx = P[2], nfy = P[3], gk = P[4], belly = P[5] || 0;
        const wsp = F.sp[d] * gk, wsh = Math.max(8, F.sh[d] * 0.7), wcc = F.cc[d] * gk, wss = F.ss[d];
        let ex = F.EX[d], ey = F.EY[d];
        const wt = F.wt[d];
        if (wt) {
          // rideau galbé : la normale tourne le long de la coulure
          const tx = -ey, ty = ex;
          ex += tx * wt * 0.9; ey += ty * wt * 0.9;
          const l = Math.sqrt(ex * ex + ey * ey) || 1;
          ex /= l; ey /= l;
        }
        const sr = F.sr[d] / 255, sg = F.sg[d] / 255, sb = F.sb[d] / 255;
        const BD = F.band && F.band.k === F.k[d] ? F.band : null;
        const span = Math.max(1, yb - yTop), round = Math.min(span, 10), blend = Math.max(2.5, rowPx * 1.5);
        for (let row = r0; row < r9; row++) {
          const m = row * W2 + cx;
          if (M[m]) continue;
          M[m] = 1;
          const y = row + 0.5 - yTop;
          const v = clamp01(y / span);
          // la tranche s'arrondit en haut : sa normale s'y redresse
          const vr = 1 - clamp01(y / round);
          let nx = ex, ny = ey, nz = 0.95 * vr * vr - belly * v * v;
          const nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx *= nl; ny *= nl; nz *= nl;
          let occ = 1 - dark * Math.pow(v, 1.3);
          if (F.k[d] === 2) occ *= 0.7 + 0.3 * smooth(0, 0.22, v) * (1 - smooth(0.78, 1, v)); // steak : faces saisies
          const tex = 1 + namp * NT[((row * nfy) & 255) * 256 + ((cx * nfx) & 255)];
          let ar = sr, ag = sg, ab = sb;
          if (BD) {
            const bp = smooth(BD.p[0], BD.p[1], v) * (1 - smooth(BD.p[2], BD.p[3], v)) * (0.85 + 0.15 * tex);
            ar += (BD.c[0] / 255 - ar) * bp; ag += (BD.c[1] / 255 - ag) * bp; ab += (BD.c[2] / 255 - ab) * bp;
          }
          lit(nx, ny, nz, ar * tex, ag * tex, ab * tex, wsp, wsh, wcc, wss, occ, 0.55 + 0.45 * occ);
          toneOut(LO[0], LO[1], LO[2], TW, 0);
          const o = m * 3, bt = clamp01((row + 0.5 - ya) / blend);
          OC[o] = tr + (TW[0] - tr) * bt; OC[o + 1] = tg + (TW[1] - tg) * bt; OC[o + 2] = tb + (TW[2] - tb) * bt;
        }
      }

      await slice(W2, (cx) => {
        const xf = (cx + 0.5) / 2 - 0.5;
        let i0 = Math.floor(xf), fx = xf - i0;
        if (i0 < 0) { i0 = 0; fx = 0; } else if (i0 > W - 2) { i0 = W - 2; fx = 1; }
        let prevIn = false, prevId = -1, pT = 0, pR = 0, pG = 0, pB = 0;
        for (let iy = NY - 1; iy >= 0; iy--) {
          const p = iy * W + i0, q = p + 1;
          const ap = A[p], aq = A[q];
          const a = ap + (aq - ap) * fx;
          if (a < 0.5) { prevIn = false; continue; }
          const inP = ap >= 0.5, inQ = aq >= 0.5;
          const d = fx < 0.5 ? (inP ? p : q) : (inQ ? q : p);
          const id = ID[d];
          let h, cr, cg, cb;
          if (inP && inQ && ID[p] === ID[q]) {
            h = Hm[p] + (Hm[q] - Hm[p]) * fx;
            cr = LR[p] + (LR[q] - LR[p]) * fx; cg = LG[p] + (LG[q] - LG[p]) * fx; cb = LB[p] + (LB[q] - LB[p]) * fx;
          } else { h = Hm[d]; cr = LR[d]; cg = LG[d]; cb = LB[d]; }
          const yw = F.CY - F.EXY + (iy + 0.5) * dyw;
          const yT = (yw * VS - h * VC - y0) * K;
          if (prevIn && id === prevId) {
            // même surface : on la prolonge jusqu'au point de devant, en fondu
            if (pT > yT + topPx) put(cx, yT, pT, cr, cg, cb, pR, pG, pB, pT);
            else put(cx, yT, yT + topPx, cr, cg, cb, cr, cg, cb, yT + topPx);
          } else {
            // bord : un liseré du dessus, puis la tranche jusqu'au bas de l'objet
            const yB = (yw * VS - F.hb[d] * VC - y0) * K;
            const yR = (yw * VS - F.hr[d] * VC - y0) * K; // le vrai bord, sous le dernier point (pentes très raides)
            const yS = Math.max(yT + topPx, yR);
            put(cx, yT, yS, cr, cg, cb, cr, cg, cb, yS);
            if (yB > yS) wall(cx, yS, yB, Math.max(yT, yR - topPx), d, cr, cg, cb);
          }
          prevIn = true; prevId = id; pT = yT; pR = cr; pG = cg; pB = cb;
        }
      });

      // réduction 2 × 2 (la couverture devient l'alpha)
      const out = new Uint8ClampedArray(W * H * 4);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let c = 0, r = 0, g = 0, b = 0;
          for (let dy = 0; dy < 2; dy++) {
            for (let dx = 0; dx < 2; dx++) {
              const m = (2 * y + dy) * W2 + 2 * x + dx;
              if (M[m]) { c++; r += OC[m * 3]; g += OC[m * 3 + 1]; b += OC[m * 3 + 2]; }
            }
          }
          if (c) {
            const j = (y * W + x) * 4;
            out[j] = r / c; out[j + 1] = g / c; out[j + 2] = b / c; out[j + 3] = c * 63.75;
          }
        }
      }
      return out;
    }

    /* ombre portée : l'alpha flouté, décalé (lumière en haut à gauche), glissé sous la matière */
    const SHC = [34, 20, 12];
    function dropShadow(out, W, H, sh, rpx) {
      const rad = Math.max(1, Math.round(sh.r * rpx)), ox = Math.round(sh.dx * rpx), oy = Math.round(sh.dy * rpx);
      const A = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) A[i] = out[i * 4 + 3] / 255;
      const B = blurXY(A, W, H, rad, rad);
      for (let y = 0; y < H; y++) {
        const sy = y - oy;
        if (sy < 0 || sy >= H) continue;
        for (let x = 0; x < W; x++) {
          const sx = x - ox;
          if (sx < 0 || sx >= W) continue;
          const s = B[sy * W + sx] * sh.a;
          if (s <= 0.004) continue;
          const j = (y * W + x) * 4, a0 = out[j + 3] / 255;
          if (a0 >= 0.999) continue;
          const aT = a0 + s * (1 - a0), k = a0 / aT;
          out[j] = out[j] * k + SHC[0] * (1 - k); out[j + 1] = out[j + 1] * k + SHC[1] * (1 - k); out[j + 2] = out[j + 2] * k + SHC[2] * (1 - k);
          out[j + 3] = aT * 255;
        }
      }
    }

    /* un ingrédient, à une finesse donnée (pixels par unité) → pixels RGBA + cadre exact */
    async function render(id, rpx) {
      if (!DEFS[id]) throw new Error('ingrédient inconnu : ' + id);
      setView(DEFS[id].phi);
      const t0 = performance.now();
      const F = await fields(id, rpx);
      const t1 = performance.now();
      await shade(F);
      const t2 = performance.now();
      const fr = frame(id);
      const H = Math.max(4, Math.ceil((fr.y1 - fr.y0) * F.rpx));
      const data = await paint(F, fr, H);
      if (DEFS[id].shadow) dropShadow(data, F.W, H, DEFS[id].shadow, F.rpx);
      const t3 = performance.now();
      const an = anchors(id);
      const t4 = performance.now();
      // (durées des étapes, pour les mesures)
      const t = { f: Math.round(t1 - t0), s: Math.round(t2 - t1), p: Math.round(t3 - t2), a: Math.round(t4 - t3) };
      return { w: F.W, h: H, data, frame: { x0: fr.x0, x1: fr.x0 + F.W / F.rpx, y0: fr.y0, y1: fr.y0 + H / F.rpx }, anchors: an, t };
    }

    /* points d'ancrage des étiquettes : le point de matière le plus à droite-devant, et à gauche-devant
       (repère de l'ingrédient : x, y vers la caméra, h hauteur) */
    function anchors(id) {
      const D = DEFS[id], px = made(id), E = D.ext, EXY = D.exy, o = newOut(), N = 56;
      RPX = 60;
      const best = [null, null];
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const x = D.cx - E + ((i + 0.5) * 2 * E) / N, y = D.cy - EXY + ((j + 0.5) * 2 * EXY) / N;
          o.a = 0; o.h = 0; o.hb = 0; o.hr = -9; o.id = 0; o.sr = -1; o.wt = 0;
          px(x, y, o);
          if (!(o.a >= 0.9)) continue;
          const sR = x + 0.45 * y, sL = -x + 0.45 * y;
          if (!best[0] || sR > best[0][3]) best[0] = [x, y, o.h, sR];
          if (!best[1] || sL > best[1][3]) best[1] = [x, y, o.h, sL];
        }
      }
      // un peu en retrait du bord, vers le centre
      return best.map((b) => {
        if (!b) return [D.cx, D.cy, 0];
        const ux = b[0] - D.cx, uy = b[1] - D.cy, l = Math.hypot(ux, uy) || 1, k = Math.max(0, l - 0.035) / l;
        return [D.cx + ux * k, D.cy + uy * k, b[2]];
      });
    }

    return { ids: Object.keys(DEFS), frame, render, anchors, S, C, PHI, PHI_PLAT: 40, budget };
  }

  /* ======================================================================
     Côté page : file d'attente, workers, mémoire, IndexedDB
     ====================================================================== */
  const LIB = bakeLib(false);
  const SRC = bakeLib.toString();
  const VERSION = (BB.hash ? BB.hash(SRC) : SRC.length).toString(36);
  const TIERS = { 1: 150, 2: 280 }; // finesses (pixels par rayon de pain) : cartes, grand format
  const QS = typeof location !== 'undefined' ? location.search : '';

  /* ---------- workers créés depuis le code même (pas de fichier : marche en file://) ---------- */
  const WORKER_SRC =
    'var LIB = (' + SRC + ')(true);\n' +
    'self.onmessage = async function (e) {\n' +
    '  var m = e.data;\n' +
    '  try {\n' +
    '    var out = await LIB.render(m.ing, m.rpx);\n' +
    '    var blob = null;\n' +
    '    if (typeof OffscreenCanvas !== "undefined") {\n' +
    '      try {\n' +
    '        var cv = new OffscreenCanvas(out.w, out.h);\n' +
    '        cv.getContext("2d").putImageData(new ImageData(out.data, out.w, out.h), 0, 0);\n' +
    '        blob = await cv.convertToBlob({ type: "image/png" });\n' +
    '      } catch (err) { blob = null; }\n' +
    '    }\n' +
    '    if (blob) self.postMessage({ id: m.id, ok: true, blob: blob, w: out.w, h: out.h, frame: out.frame, anchors: out.anchors, t: out.t });\n' +
    '    else self.postMessage({ id: m.id, ok: true, data: out.data, w: out.w, h: out.h, frame: out.frame, anchors: out.anchors, t: out.t }, [out.data.buffer]);\n' +
    '  } catch (err) { self.postMessage({ id: m.id, ok: false, err: String((err && err.stack) || err) }); }\n' +
    '};\n';

  let pool = null, seq = 0;
  const waiting = new Map();
  function workers() {
    if (pool) return pool;
    pool = [];
    if (/[?&]noworker\b/.test(QS) || typeof Worker === 'undefined' || typeof Blob === 'undefined' || !window.URL) return pool;
    let url;
    try { url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' })); } catch (e) { return pool; }
    // pas plus que ce que l'appareil peut porter : un cœur reste à la page ; 2 Go de mémoire ou moins → 2 au plus ;
    // petit appareil (≤ 2 cœurs ou ≤ 1 Go) → 1 seul. (?workers=N pour les essais)
    const hc = navigator.hardwareConcurrency || 2, mem = navigator.deviceMemory || 4;
    let n = Math.max(1, Math.min(4, hc - 1));
    if (mem <= 2) n = Math.min(n, 2);
    if (hc <= 2 || mem <= 1) n = 1;
    const forced = /[?&]workers=(\d)/.exec(QS);
    if (forced) n = Math.max(1, +forced[1]);
    for (let i = 0; i < n; i++) {
      try {
        const slot = { w: new Worker(url), busy: 0 };
        slot.w.onmessage = (e) => {
          const cb = waiting.get(e.data.id);
          if (!cb) return;
          waiting.delete(e.data.id);
          slot.busy--;
          if (e.data.ok) cb.resolve(e.data);
          else { broken(); cb.reject(new Error(e.data.err)); }
        };
        slot.w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); broken(); };
        pool.push(slot);
      } catch (e) {
        broken();
        break;
      }
    }
    return pool;
  }
  // un worker a lâché : on arrête tout, le reste sera calculé sur la page
  function broken() {
    (pool || []).forEach((s) => { try { s.w.terminate(); } catch (e) { /* déjà arrêté */ } });
    pool = [];
    waiting.forEach((cb) => cb.reject(new Error('worker')));
    waiting.clear();
  }
  function remote(ing, rpx) {
    const p = workers();
    if (!p.length) return Promise.reject(new Error('pas de worker'));
    const slot = p.reduce((a, b) => (b.busy < a.busy ? b : a));
    const id = ++seq;
    slot.busy++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      slot.w.postMessage({ id, ing, rpx });
    });
  }
  // sur la page : une seule tâche à la fois (elle se découpe déjà en tranches)
  let lock = Promise.resolve();
  function onMain(fn) {
    const p = lock.then(fn, fn);
    lock = p.catch(() => {});
    return p;
  }
  function encode(out) {
    const cv = document.createElement('canvas');
    cv.width = out.w;
    cv.height = out.h;
    cv.getContext('2d').putImageData(new ImageData(out.data, out.w, out.h), 0, 0);
    return new Promise((res) => {
      try { cv.toBlob((b) => res(b || cv.toDataURL('image/png')), 'image/png'); } catch (e) { res(cv.toDataURL('image/png')); }
    });
  }

  /* ---------- la mémoire du téléphone (IndexedDB) ---------- */
  const vault = (() => {
    let dbp = null;
    const off = /[?&]nocache\b/.test(QS);
    const open = () => dbp || (dbp = new Promise((res) => {
      try {
        if (off || typeof indexedDB === 'undefined') return res(null);
        const rq = indexedDB.open('bougnat-cuisine', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('tex');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = (e) => { if (e.preventDefault) e.preventDefault(); res(null); };
        rq.onblocked = () => res(null);
      } catch (e) { res(null); }
    }));
    const quiet = (e) => { if (e && e.preventDefault) e.preventDefault(); };
    return {
      open,
      async get(k) {
        const db = await open();
        if (!db) return null;
        return new Promise((res) => {
          try {
            const rq = db.transaction('tex', 'readonly').objectStore('tex').get(k);
            rq.onsuccess = () => res(rq.result == null ? null : rq.result);
            rq.onerror = (e) => { quiet(e); res(null); };
          } catch (e) { res(null); }
        });
      },
      async put(k, v) {
        const db = await open();
        if (!db || v == null) return;
        try {
          const t = db.transaction('tex', 'readwrite');
          t.onerror = t.onabort = quiet;
          t.objectStore('tex').put(v, k).onerror = quiet;
        } catch (e) { /* mémoire pleine ou refusée : on recalculera */ }
      },
      // rangement : les textures d'une ancienne version du code s'en vont
      async sweep() {
        const db = await open();
        if (!db) return;
        try {
          const t = db.transaction('tex', 'readwrite');
          t.onerror = t.onabort = quiet;
          const store = t.objectStore('tex');
          const rq = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
          rq.onsuccess = () => {
            const c = rq.result;
            if (!c) return;
            if (!String(c.key).startsWith(VERSION + '|')) store.delete(c.key);
            c.continue();
          };
        } catch (e) { /* rien */ }
      },
    };
  })();
  vault.open();
  setTimeout(() => vault.sweep(), 9000);

  /* ---------- la file : les plus prioritaires d'abord, plusieurs à la fois avec les workers ---------- */
  const cache = new Map();
  const ANCH = {};
  const queue = [];
  let running = 0;
  const listeners = new Set();

  let pumpT = 0;
  function schedulePump() {
    if (running > 0) { pump(); return; }
    if (!pumpT) pumpT = setTimeout(() => { pumpT = 0; pump(); }, 10);
  }
  function pump() {
    const cap = Math.max(1, workers().length);
    while (running < cap && queue.length) {
      queue.sort((a, b) => b.e.pri - a.e.pri);
      const job = queue.shift();
      running++;
      run(job.e)
        .then(job.res, job.rej)
        .finally(() => { running--; pump(); });
    }
  }
  async function run(e) {
    const t0 = performance.now();
    e.ts = Math.round(t0);
    const rpx = TIERS[e.tier] || e.tier;
    let out = null;
    if (workers().length) {
      try { out = await remote(e.ing, rpx); } catch (err) { out = null; }
    }
    if (!out) out = await onMain(() => LIB.render(e.ing, rpx));
    let blob = out.blob;
    if (!blob) blob = await encode(out);
    e.ms = Math.round(performance.now() - t0);
    e.te = Math.round(performance.now());
    e.t = out.t;
    return { blob, w: out.w, h: out.h, frame: out.frame, anchors: out.anchors };
  }

  function finish(e, res) {
    e.url = typeof res.blob === 'string' ? res.blob : URL.createObjectURL(res.blob);
    e.frame = res.frame;
    if (res.anchors && !ANCH[e.ing]) ANCH[e.ing] = res.anchors;
    e.w = res.w;
    e.h = res.h;
    e.done = true;
    const r = { id: e.ing, tier: e.tier, url: e.url, frame: e.frame, w: e.w, h: e.h };
    listeners.forEach((fn) => { try { fn(r); } catch (err) { /* un abonné fautif n'arrête pas les autres */ } });
    return r;
  }

  /* une texture : promesse de { url, frame (unités du burger), w, h } */
  function get(ing, tier = 1, pri = 0) {
    const key = ing + '@' + tier;
    let e = cache.get(key);
    if (!e) {
      e = { key, ing, tier, pri, url: null, done: false, tq: Math.round(performance.now()) };
      e.promise = (async () => {
        const pkey = VERSION + '|' + key;
        const hit = await vault.get(pkey);
        if (hit && hit.blob) { e.cached = true; return finish(e, hit); }
        const res = await new Promise((resolve, reject) => { queue.push({ e, res: resolve, rej: reject }); schedulePump(); });
        if (typeof res.blob !== 'string') vault.put(pkey, { blob: res.blob, w: res.w, h: res.h, frame: res.frame, anchors: res.anchors });
        return finish(e, res);
      })();
      cache.set(key, e);
    } else if (!e.done && pri > e.pri) e.pri = pri;
    return e.promise;
  }

  /* la meilleure texture déjà prête, sans dépasser la finesse voulue (sinon la plus fine dispo) */
  function peek(ing, tier = 2) {
    let best = null;
    cache.forEach((e) => {
      if (e.ing !== ing || !e.done) return;
      if (!best) best = e;
      else if (e.tier <= tier && (best.tier > tier || e.tier > best.tier)) best = e;
      else if (best.tier > tier && e.tier < best.tier) best = e;
    });
    return best ? { id: ing, tier: best.tier, url: best.url, frame: best.frame, w: best.w, h: best.h } : null;
  }

  /* BB.bake.get(id, tier, priorité) → promesse { url (blob:), frame (unités du burger), w, h }
     BB.bake.peek(id, tier) : la meilleure déjà prête ; BB.bake.anchors(id) : points d'étiquette ;
     tiers : 1 = cartes (150 px par rayon de pain), 2 = grand format (280). */
  function warm() {
    ['bun-bottom', 'salad', 'steak', 'bun-top'].forEach((id, i) => get(id, 1, 1 - i * 0.1).catch(() => {}));
  }
  if (typeof window !== 'undefined' && !/[?&]nowarm\b/.test(QS)) setTimeout(warm, 0);

  BB.bake = {
    ids: LIB.ids,
    TIERS,
    S: LIB.S,
    C: LIB.C,
    PHI: LIB.PHI,
    PHI_PLAT: LIB.PHI_PLAT, // les plats (assiettes, ardoises) : vue à 40°
    version: VERSION,
    frame: LIB.frame, // cadre nominal (unités du burger) d'un ingrédient
    // points d'ancrage des étiquettes [droite, gauche] : [x, y, h] dans le repère de l'ingrédient
    // (calculés avec la texture, dans le worker ; null tant qu'elle n'est pas prête)
    anchors(id) { return ANCH[id] || null; },
    get,
    peek,
    onReady(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    pending: () => queue.length + running,
    workers: () => workers().length,
    stats: () => Array.from(cache.values()).map((e) => ({ key: e.key, ms: e.ms, cached: !!e.cached, done: e.done, tq: e.tq, ts: e.ts, te: e.te, pri: Math.round(e.pri * 10) / 10, t: e.t })),
    lib: LIB, // pour les tests
    budget: LIB.budget,
  };
})();
