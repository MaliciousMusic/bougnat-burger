/* ==========================================================================
   Bougnat Burger — le bougnat dessiné : le héros du film de l'accueil.
   Remplace les fonctions de personnage de l'animatique (bb-histoire.js) sans rien y changer :
   mêmes signatures, mêmes repères, mêmes angles, mêmes poignées. bb-histoire.js les prend d'office
   quand ce fichier est chargé avant lui (voir `this.rig` et `this.P` dans _build()).

   Style : aplats à 2 ou 3 tons par matière, silhouettes nettes, façon affiche Art déco moderne ;
   costume et couleurs d'après la fiche personnage (assets/bougnat/reference/). Aucun filtre SVG :
   le dessin fixe est construit une fois ; chaque image ne touche qu'une vingtaine d'attributs
   (transformations, et quelques tracés seulement quand l'expression change).

   Vues :
   · profil — makeProfil(parent) ; poseProfil(P, pose, t, avecSac) → la main proche [x, y]
              Repère du corps : corps couché, tête vers +x, ventre vers +y, bassin à l'origine.
              Épaules (78, −6) proche, (70, −12) lointaine ; hanches (−8, 8) et (−4, 0) ;
              bras 44 + 42 (40 lointain), jambes 52 + 50 (48 lointaine) ; tête en (128, −14) tournée de `tete`.
              Debout, assis ou en plongeon : tout le groupe tourne de −90° (poses assis, debout, salut, plonge).
   · dos    — makeDos(parent) ; poseDos(D, t, ecart, battre) : plongée verticale, tête vers −y.
              Le rabat du sac s'ouvre vers la caméra : charnière à y = −25 dans son propre repère.
   · face   — makeFace(parent) ; poseFace(F, o) : origine au milieu de la poitrine, tête en (0, −96),
              épaules (±62, −30), mains données par o.bg / o.bd, jambes par o.jambes.
   Options de poseFace en plus de l'animatique (toutes facultatives) :
     o.t          le temps (sinon celui du film, relevé sur BB.Histoire.prototype.frame) : clignements, vent ;
     o.mainG/D    forme de main : 'ouverte', 'ecartee', 'detendue', 'poing', 'pouce', 'tient', 'pince', 'visiere', 'anneau'
                  (sinon choisie d'après la situation) ; avec 'pince' / 'visiere', la cible est le bout des doigts ;
     o.sac        il porte le sac kraft : bretelles sur la poitrine, bords du sac à la taille ;
     o.cordon     'main' (la main bd tient l'anneau, cordon tendu ou mou depuis le fourreau) ou 'libre' (lâché, au vent).
   Aussi : ANCRE_CORDON [x, y] (sortie du cordon, repère de face), pointeVisiere(casq, casqY) (bout gauche de la
   visière, repère de face : la cible de mainG pour remettre la casquette), main(parent, forme) (une main seule).
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const NS = 'http://www.w3.org/2000/svg';

  /* ---------- outils ---------- */
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const RAD = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const lisser = (t) => t * t * (3 - 2 * t);
  const f = (n) => Math.round(n * 10) / 10;
  const f2 = (n) => Math.round(n * 100) / 100;
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  // écrit un attribut seulement s'il change (éléments internes : jamais les poignées que les plans modifient)
  const poser = (e, k, v) => { const c = e.__bd || (e.__bd = {}); if (c[k] !== v) { c[k] = v; e.setAttribute(k, v); } };
  const voir = (e, on) => poser(e, 'display', on ? 'inline' : 'none');
  const tr = (x, y, r = 0, sx = 1, sy = sx) => `translate(${f(x)} ${f(y)})` + (r ? ` rotate(${f(r)})` : '') + (sx !== 1 || sy !== 1 ? ` scale(${f2(sx)} ${f2(sy)})` : '');

  /* ---------- palette (fiche personnage, palette.json) ---------- */
  const C = {
    peau: '#EEA785', peau2: '#DB8864', peau3: '#BF6A4B', peauClair: '#F8C5A6',
    joue: '#E6735F', nez: '#E2836B', nez2: '#C6664E', nezClair: '#F8C9AF',
    levre: '#B04A38', bouche: '#4A1915', langue: '#C8594D', dents: '#FFF8EE',
    oeil: '#2A201B', blanc: '#FFFDF6',
    gris: '#C4C5CC', grisClair: '#E9E8EC', grisOmbre: '#999BA6', grisTrait: '#80828D',
    sourcil: '#6E6B72', sourcil2: '#514E55',
    casq: '#454C53', casqClair: '#5B636A', casqOmbre: '#323940', casqNoir: '#232A30',
    foulard: '#C8E3A0', foulardOmbre: '#A3B061', foulardClair: '#DDEEC4',
    blouse: '#3B527A', blouseClair: '#4D6891', blouseOmbre: '#2F4369', blouseNuit: '#26385A',
    tablier: '#73391D', tablierClair: '#894D2E', tablierOmbre: '#5A2B15', couture: '#A8683F',
    bouton: '#FCE2BD', bouton2: '#E2C29A',
    pantalon: '#484A50', pantalonOmbre: '#36383D', pantalonClair: '#5B5E65',
    botte: '#6F4229', botteClair: '#8D5735', botteOmbre: '#4C2C1A', semelle: '#2A1A11',
    sac: '#C9A274', sacOmbre: '#A9824F', sacClair: '#DDBC8F', sacNuit: '#6E4E2B', sacDedans: '#4E3319',
    logo: '#96C124', logoBord: '#FFF7E6', poignee: '#96C124',
    goutte: '#A8D8EA', goutteClair: '#F2FBFF', etoile: '#F9DE9E', etoileClair: '#FFF6D8', eclat: '#FFF1C6',
  };

  /* ---------- géométrie : tracés lisses, rubans effilés ---------- */
  // courbe lisse passant par des points (Catmull-Rom → Bézier), sans le M de départ
  function lisse(pts, ferme) {
    const n = pts.length;
    const P = (i) => (ferme ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
    let d = '';
    const m = ferme ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }
  const ferme = (pts) => `M${f(pts[0][0])} ${f(pts[0][1])}` + lisse(pts, true) + 'Z';
  // les deux bords d'un ruban : pts = [[x, y, demi-largeur], …]
  function bords(pts) {
    const n = pts.length;
    const T = pts.map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      return [dx / l, dy / l];
    });
    return {
      A: pts.map((p, i) => [p[0] - T[i][1] * p[2], p[1] + T[i][0] * p[2]]),
      B: pts.map((p, i) => [p[0] + T[i][1] * p[2], p[1] - T[i][0] * p[2]]),
      T,
    };
  }
  // contour fermé d'un trait d'épaisseur variable ; bout arrondi au dernier point (et au premier si demandé)
  function ruban(pts, debutRond = false, finRond = true) {
    const n = pts.length, { A, B } = bords(pts);
    const w0 = pts[0][2], w1 = pts[n - 1][2];
    let d = `M${f(B[0][0])} ${f(B[0][1])}`;
    d += debutRond ? `A${f(w0)} ${f(w0)} 0 0 0 ${f(A[0][0])} ${f(A[0][1])}` : `L${f(A[0][0])} ${f(A[0][1])}`;
    d += lisse(A, false);
    d += finRond ? `A${f(w1)} ${f(w1)} 0 0 0 ${f(B[n - 1][0])} ${f(B[n - 1][1])}` : `L${f(B[n - 1][0])} ${f(B[n - 1][1])}`;
    return d + lisse(B.slice().reverse(), false) + 'Z';
  }
  // bande le long du bord A d'un ruban (pour l'ombre d'un côté) : même bord extérieur, largeur × k
  function bandeA(pts, k) {
    const { T } = bords(pts);
    return pts.map((p, i) => [p[0] - T[i][1] * p[2] * (1 - k), p[1] + T[i][0] * p[2] * (1 - k), p[2] * k]);
  }
  function bandeB(pts, k) {
    const { T } = bords(pts);
    return pts.map((p, i) => [p[0] + T[i][1] * p[2] * (1 - k), p[1] - T[i][0] * p[2] * (1 - k), p[2] * k]);
  }
  // un doigt : base, direction (degrés), phalanges, flexions (degrés), demi-largeurs → points du ruban
  function doigtPts(bx, by, dir, L, fl, w) {
    const pts = [[bx, by, w[0]]];
    let a = dir, x = bx, y = by;
    for (let i = 0; i < L.length; i++) {
      a += fl[i] || 0;
      x += Math.cos(a * RAD) * L[i]; y += Math.sin(a * RAD) * L[i];
      pts.push([x, y, w[i + 1]]);
    }
    return pts;
  }
  const doigt = (...a) => ruban(doigtPts(...a));

  /* ---------- aplatir : à la construction, la transformation d'un groupe figé passe dans la géométrie ----------
     (moins de nœuds de transformation à recalculer et à peindre à chaque image) */
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  function matrice(s) {
    let m = [1, 0, 0, 1, 0, 0];
    const re = /(translate|scale|rotate|matrix)\(([^)]*)\)/g;
    let x;
    while ((x = re.exec(s || ''))) {
      const v = x[2].trim().split(/[\s,]+/).map(Number);
      if (x[1] === 'translate') m = mul(m, [1, 0, 0, 1, v[0], v[1] || 0]);
      else if (x[1] === 'scale') m = mul(m, [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0]);
      else if (x[1] === 'matrix') m = mul(m, v);
      else {
        const a = v[0] * RAD, c = Math.cos(a), s2 = Math.sin(a), cx = v[1] || 0, cy = v[2] || 0;
        m = mul(m, [1, 0, 0, 1, cx, cy]); m = mul(m, [c, s2, -s2, c, 0, 0]); m = mul(m, [1, 0, 0, 1, -cx, -cy]);
      }
    }
    return m;
  }
  // un tracé absolu (M L C Q A Z) passé dans une similitude (échelle uniforme, rotation, miroir, translation)
  function mapD(d, m) {
    const det = m[0] * m[3] - m[1] * m[2], k = Math.sqrt(Math.abs(det));
    const P = (x, y) => `${f(m[0] * x + m[2] * y + m[4])} ${f(m[1] * x + m[3] * y + m[5])}`;
    const toks = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    let out = '', i = 0, cmd = '';
    while (i < toks.length) {
      if (/[A-Za-z]/.test(toks[i])) {
        cmd = toks[i++];
        if (!/[MLCQAZ]/.test(cmd)) throw new Error('mapD : commande ' + cmd);
        out += cmd;
        if (cmd === 'Z') continue;
      }
      if (cmd === 'A') {
        const rx = +toks[i++], ry = +toks[i++], rot = +toks[i++], la = toks[i++], sw = +toks[i++], x = +toks[i++], y = +toks[i++];
        const r = rot * RAD, nr = Math.atan2(m[1] * Math.cos(r) + m[3] * Math.sin(r), m[0] * Math.cos(r) + m[2] * Math.sin(r)) / RAD;
        out += `${f(rx * k)} ${f(ry * k)} ${f(nr)} ${la} ${det < 0 ? 1 - sw : sw} ${P(x, y)} `;
      } else { const x = +toks[i++], y = +toks[i++]; out += P(x, y) + ' '; }
    }
    return out.trim();
  }
  const miroir = (d) => mapD(d, [-1, 0, 0, 1, 0, 0]);
  const A = (e, k) => +e.getAttribute(k) || 0;
  function versTrace(e) {
    if (e.localName === 'path') return e.getAttribute('d');
    if (e.localName === 'circle' || e.localName === 'ellipse') {
      const cx = A(e, 'cx'), cy = A(e, 'cy'), rx = e.localName === 'circle' ? A(e, 'r') : A(e, 'rx'), ry = e.localName === 'circle' ? rx : A(e, 'ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    if (e.localName === 'rect') {
      const x = A(e, 'x'), y = A(e, 'y'), w = A(e, 'width'), h = A(e, 'height'), r = Math.min(A(e, 'rx'), w / 2, h / 2);
      return r ? `M${x + r} ${y}L${x + w - r} ${y}A${r} ${r} 0 0 1 ${x + w} ${y + r}L${x + w} ${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}L${x + r} ${y + h}A${r} ${r} 0 0 1 ${x} ${y + h - r}L${x} ${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
        : `M${x} ${y}L${x + w} ${y}L${x + w} ${y + h}L${x} ${y + h}Z`;
    }
    return null;
  }
  // g figé : on remplace chaque forme par un <path> déjà transformé, puis on retire la transformation du groupe
  function aplatir(g, m0) {
    const m = m0 ? mul(m0, matrice(g.getAttribute('transform'))) : matrice(g.getAttribute('transform'));
    const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    for (const c of [...g.children]) {
      if (c.localName === 'g') { aplatir(c, m); continue; }
      const d = versTrace(c);
      if (d == null) continue;
      const mc = c.hasAttribute('transform') ? mul(m, matrice(c.getAttribute('transform'))) : m;
      const p = c.localName === 'path' ? c : el('path', {});
      for (const at of [...c.attributes]) if (!/^(d|cx|cy|r|rx|ry|x|y|width|height|transform)$/.test(at.name)) p.setAttribute(at.name, at.value);
      p.setAttribute('d', mapD(d, mc));
      p.removeAttribute('transform');
      if (p.hasAttribute('stroke-width')) p.setAttribute('stroke-width', f2(+p.getAttribute('stroke-width') * k));
      if (p !== c) c.replaceWith(p);
    }
    g.removeAttribute('transform');
    if (m0) { while (g.firstChild) g.parentNode.insertBefore(g.firstChild, g); g.remove(); }
  }

  /* ---------- dégradés : un jeu par <svg> hôte ---------- */
  let nDefs = 0;
  const DEFS = new WeakMap();
  function defsDe(node) {
    let s = node;
    while (s && s.localName !== 'svg') s = s.parentNode;
    const hote = s || node;
    let r = DEFS.get(hote);
    if (r) return r;
    const n = ++nDefs, id = (k) => `bd${n}-${k}`;
    const defs = el('defs', {});
    hote.insertBefore(defs, hote.firstChild);
    defs.innerHTML = `
      <radialGradient id="${id('halo')}"><stop offset="0" stop-color="#FFE7A0" stop-opacity=".95"/><stop offset=".45" stop-color="#F6C25A" stop-opacity=".62"/><stop offset="1" stop-color="#F2B84B" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id('rayons')}"><stop offset=".25" stop-color="#FFF4CF" stop-opacity=".7"/><stop offset="1" stop-color="#FFF4CF" stop-opacity="0"/></radialGradient>`;
    r = { halo: id('halo'), rayons: id('rayons') };
    DEFS.set(hote, r);
    return r;
  }

  /* ---------- l'horloge du film (pour les clignements et le vent de la vue de face, qui n'a pas de t) ---------- */
  let horlogeFilm = null;
  function brancherHorloge() {
    const H = BB.Histoire;
    if (!H || !H.prototype || H.prototype.__bdHorloge || typeof H.prototype.frame !== 'function') return;
    const f0 = H.prototype.frame;
    H.prototype.frame = function (t) {
      const d = this.duration || 31;
      horlogeFilm = ((t % d) + d) % d;
      return f0.apply(this, arguments);
    };
    H.prototype.__bdHorloge = true;
  }
  const maintenant = (o) => (o && isFinite(o.t) ? o.t : horlogeFilm != null ? horlogeFilm : performance.now() / 1000);
  // clignements : instants choisis hors des moments clés (ouverture 0..1)
  const CLIGNE = [2.2, 4.35, 7.1, 8.25, 10.15, 16.45, 20.55, 23.55, 25.35, 27.25, 30.65];
  function paupiere(t) {
    for (const c of CLIGNE) { const d = t - c; if (d >= 0 && d < 0.14) return Math.abs(d / 0.07 - 1); }
    return 1;
  }

  /* ========================================================================
     LES MAINS — fines, doigts effilés ; repère : poignet à l'origine, doigts vers +x.
     Vue de face / de dessus : dos de la main, pouce du côté +y.
     Vue de profil : de côté, pouce du côté −y (devant), paume vers +y.
     ======================================================================== */
  // le dos de la main : poignet étroit, arc des jointures, creux entre pouce et index
  const PAUME = 'M-1 -5.4C4 -6.2 9.2 -7.4 13.6 -7.6C15.8 -7.6 17 -5 17.3 -2C17.5 1.2 17 4.6 15.4 6.8C13 8.2 10.4 7.8 8 8.4C5 9.2 1.8 7.6 -1 5.4Z';
  const ANNEAU = [25.4, -0.6, 6.6]; // l'anneau du cordon dans le poing : centre x, y et rayon (unités de la main)
  const PRISE = { pince: [26.6, 6.5], visiere: [26.6, 6.5] }; // bout des doigts qui pincent : c'est lui qu'on pose sur la cible
  // doigts : [base x, base y, direction, phalanges, flexions, demi-largeurs] — auriculaire, annulaire, majeur, index
  const DOIGTS = (dirs, allonge = 1, fl = [0, 2, 2]) => [
    [14, -5.5, dirs[0], [4.6, 3.3, 2.8].map((v) => v * allonge), fl, [1.82, 1.68, 1.5, 1.2]],
    [15.9, -2.1, dirs[1], [5.9, 4.2, 3.3].map((v) => v * allonge), fl, [2.02, 1.88, 1.7, 1.36]],
    [16.4, 1.5, dirs[2], [6.4, 4.5, 3.5].map((v) => v * allonge), fl, [2.06, 1.92, 1.74, 1.4]],
    [15.4, 5.1, dirs[3], [5.8, 4.1, 3.2].map((v) => v * allonge), fl.map((v) => -v), [2.02, 1.88, 1.7, 1.36]],
  ];
  // chaque forme : liste de calques { d, fill } ou { d, stroke, w }
  const POUCE = (dir, L, fl) => ruban(doigtPts(6.2, 7.2, dir, L, fl, [3.3, 2.55, 2.2, 1.78]));
  const MAINS_FACE = {
    ouverte: () => {
      const ds = DOIGTS([-13, -4, 2, 9]);
      return [
        { d: POUCE(40, [5.2, 4.4, 3.6], [0, -10, -14]), fill: 'peau' },
        { d: PAUME, fill: 'peau' },
        ...ds.map((a) => ({ d: doigt(...a), fill: 'peau' })),
        { d: 'M8 9C10.6 9.4 12.8 8.8 14.8 7.4', stroke: 'peau2', w: 0.85 },
      ];
    },
    ecartee: () => {
      const ds = DOIGTS([-30, -11, 5, 20], 1.02, [0, 3, 3]);
      return [
        { d: POUCE(56, [5.6, 4.6, 3.8], [0, -8, -10]), fill: 'peau' },
        { d: PAUME, fill: 'peau' },
        ...ds.map((a) => ({ d: doigt(...a), fill: 'peau' })),
      ];
    },
    detendue: () => [
      { d: ruban(doigtPts(14.2, -3.4, -6, [4.8, 3.5, 2.8], [0, 12, 14], [1.95, 1.8, 1.62, 1.3])), fill: 'peau2' },
      { d: ruban(doigtPts(14.8, -0.6, -2, [5.8, 4.2, 3.2], [0, 11, 13], [2.2, 2.05, 1.84, 1.46])), fill: 'peau2' },
      { d: 'M-1.5 -5.4C4 -6 10 -6.4 15 -5.8C16.8 -5.5 17.8 -3.6 17.8 -1.4L17.8 3C17.4 4.6 16.2 5.4 14.4 5.4C9 5.6 4 5.4 -1.5 4.8Z', fill: 'peau' },
      { d: ruban(doigtPts(15, 2.4, 1, [6.4, 4.5, 3.4], [0, 9, 11], [2.35, 2.2, 1.96, 1.56])), fill: 'peau' },
      { d: 'M16.4 0.6C20 0.8 23.4 1.6 26.4 3.2', stroke: 'peau3', w: 0.65 },
      { d: ruban([[4, 4.4, 2.8], [9.6, 7.2, 2.5], [14.8, 8, 2.2], [18.8, 7.4, 1.8]]), fill: 'peau' },
      { d: 'M6.2 6.8C9 9 12.2 10 15.8 10', stroke: 'peau2', w: 0.8 },
    ],
    // poing vu de dos : arc des jointures, doigts repliés devant (plus sombres), pouce le long du côté
    poing: () => [
      { d: 'M-1 -5.4C4 -6.4 9.4 -8 14 -8.4C18.4 -8.8 21.8 -6.8 22.4 -2.4C23 2 21.8 6.6 18.2 8.4C14.4 10.2 10 9.8 7 9.8C4 9.8 1.4 8 -1 5.4Z', fill: 'peau' },
      { d: 'M17.4 -8.6C20.6 -8 22.2 -5.8 22.4 -2.4C23 2 21.8 6.6 18.2 8.4C19.8 4 20 -3.6 17.4 -8.6Z', fill: 'peau2' },
      { d: 'M18 -4.4Q20.2 -4.4 22.3 -3.6M18.4 -0.6Q20.6 -0.6 22.7 0.2M18 3.2Q20 3.4 21.9 4.6', stroke: 'peau3', w: 0.75 },
      { d: ruban([[5, 7.4, 2.85], [10.4, 10.2, 2.65], [15.6, 11, 2.35], [19.8, 9, 1.95]]), fill: 'peau' },
      { d: 'M7 9.6C10.4 11.6 14.6 12.6 18.4 11.4', stroke: 'peau2', w: 0.85 },
    ],
    // main qui tient (le repas contre lui) : doigts refermés mais pas serrés
    tient: () => [
      { d: 'M-1 -5.4C4 -6.4 9.4 -8 14 -8.4C19.4 -8.8 24 -7 25 -2.6C25.8 1.8 24.4 6.6 20 8.4C15.8 10 10.8 9.8 7 9.8C4 9.8 1.4 8 -1 5.4Z', fill: 'peau' },
      { d: 'M19.6 -8.6C22.8 -7.6 24.6 -5.4 25 -2.6C25.8 1.8 24.4 6.6 20 8.4C22 4 22.4 -3.8 19.6 -8.6Z', fill: 'peau2' },
      { d: 'M17 -4.6Q21 -4.8 24.6 -3.6M17.4 -0.8Q21.4 -0.8 25.2 0.2M17 3Q20.6 3.2 24 4.8', stroke: 'peau3', w: 0.75 },
      { d: POUCE(30, [5.6, 4.6, 3.6], [0, -8, -10]), fill: 'peau' },
    ],
    // la pince : pouce et index se rejoignent (la frite passe entre eux), les autres doigts repliés
    pince: () => [
      { d: 'M13.6 -4.8C17.8 -7 22.6 -6 23.6 -2.4C24.4 0.8 22 2.8 18.4 2.4Z', fill: 'peau2' },
      { d: 'M18 -4.2Q21 -4.4 23.2 -2.6', stroke: 'peau3', w: 0.7 },
      { d: 'M-1.5 -5.2C4 -5.8 10 -6 15 -5.4C16.8 -5.1 17.6 -3.4 17.6 -1.4L17.6 3C17.2 4.6 16 5.3 14.2 5.3C9 5.5 4 5.3 -1.5 4.6Z', fill: 'peau' },
      { d: ruban([[14.8, 0.8, 2.3], [21, 1.2, 2.1], [25.6, 3, 1.88], [28.4, 5.8, 1.5]]), fill: 'peau' },
      { d: ruban([[4, 4.2, 2.8], [9.8, 7, 2.5], [15.4, 8.2, 2.2], [20.6, 8.2, 1.9], [25, 7.4, 1.55]]), fill: 'peau' },
      { d: 'M6.2 6.6C9.4 9 13 10.2 17 10.4', stroke: 'peau2', w: 0.8 },
    ],
    // le poing qui serre l'anneau vert du cordon : l'anneau passe derrière les doigts et dépasse devant
    anneau: () => [
      { d: `M${ANNEAU[0] + ANNEAU[2]} ${ANNEAU[1]}A${ANNEAU[2]} ${ANNEAU[2]} 0 1 1 ${ANNEAU[0] - ANNEAU[2]} ${ANNEAU[1]}A${ANNEAU[2]} ${ANNEAU[2]} 0 1 1 ${ANNEAU[0] + ANNEAU[2]} ${ANNEAU[1]}Z`, stroke: 'anneau', w: 3.1 },
      { d: `M${ANNEAU[0] + 2} ${ANNEAU[1] - ANNEAU[2] + 0.6}A${ANNEAU[2] - 0.6} ${ANNEAU[2] - 0.6} 0 0 1 ${ANNEAU[0] + ANNEAU[2] - 0.2} ${ANNEAU[1] + 1.4}`, stroke: 'anneauClair', w: 1.1 },
      { d: 'M-1 -5.4C4 -6.4 9.4 -8 14 -8.4C18.4 -8.8 21.8 -6.8 22.4 -2.4C23 2 21.8 6.6 18.2 8.4C14.4 10.2 10 9.8 7 9.8C4 9.8 1.4 8 -1 5.4Z', fill: 'peau' },
      { d: 'M17.4 -8.6C20.6 -8 22.2 -5.8 22.4 -2.4C23 2 21.8 6.6 18.2 8.4C19.8 4 20 -3.6 17.4 -8.6Z', fill: 'peau2' },
      { d: 'M18 -4.4Q20.2 -4.4 22.3 -3.6M18.4 -0.6Q20.6 -0.6 22.7 0.2M18 3.2Q20 3.4 21.9 4.6', stroke: 'peau3', w: 0.75 },
      { d: ruban([[5, 7.4, 2.85], [10.4, 10.2, 2.65], [15.6, 11, 2.35], [19.8, 9, 1.95]]), fill: 'peau' },
      { d: 'M7 9.6C10.4 11.6 14.6 12.6 18.4 11.4', stroke: 'peau2', w: 0.85 },
    ],
    // pouce levé : dessiné droit (le pouce vers le haut), poing au centre, poignet en bas à gauche
    pouce: () => [
      { d: ruban([[-6.4, 6.4, 5.8], [-15, 15, 5.6]]), fill: 'peau' },
      { d: 'M-11 8.6C-12.6 2.6 -12 -4.4 -8.4 -8.6C-6 -11.2 -2 -11.8 2 -11.4L9.2 -10.8C12.4 -10.4 13.8 -7.8 13.2 -5.2C14.6 -3.2 14.6 -0.2 13.4 1.8C14.4 3.8 14.2 6.4 12.4 7.8C12.6 10.2 11 12 8.4 12.2L-3.6 12.6C-7.4 12.6 -10.2 11.2 -11 8.6Z', fill: 'peau' },
      { d: 'M13.2 -5.2C14.6 -3.2 14.6 -0.2 13.4 1.8C14.4 3.8 14.2 6.4 12.4 7.8C12.6 10.2 11 12 8.4 12.2L-3.6 12.6C-7.4 12.6 -10.2 11.2 -11 8.6C-6 10.4 4.6 10.2 9.4 8.8C11.8 6.6 12.4 2.6 12 -1.8Z', fill: 'peau2' },
      { d: 'M-2.4 -5.8Q6 -6.4 13 -5.4M-2.6 -0.6Q6 -1 13.6 -0.3M-2.4 4.6Q5.6 4.4 12.8 5.2', stroke: 'peau3', w: 0.85 },
      { d: ruban([[-5.2, -7.4, 3.5], [-5.8, -13.6, 3.2], [-5.2, -19.6, 2.85], [-3.6, -24.6, 2.4]]), fill: 'peau' },
      { d: 'M-2.6 -9.6C-1.4 -14 -1.4 -19 -2.4 -23', stroke: 'peau2', w: 1 },
    ],
  };
  const PAUME_P = 'M-1.5 -4.4C4 -5 10 -5.2 15 -4.8C16.6 -4.6 17.2 -3 17.2 -1L17.2 3C16.8 4.4 15.6 4.9 14 4.9C9 5.1 4 4.9 -1.5 4.2Z';
  const MAINS_PROFIL = {
    ouverte: () => [
      { d: ruban([[14.4, 1.6, 2.2], [20.2, 2, 2.0], [24.6, 2.2, 1.78], [28, 2.1, 1.4]]), fill: 'peau2' },
      { d: PAUME_P, fill: 'peau' },
      { d: ruban([[14.4, -2, 2.3], [20.6, -2.1, 2.1], [25.4, -1.9, 1.86], [29, -1.5, 1.5]]), fill: 'peau' },
      { d: ruban([[3.6, -3.8, 2.6], [8.6, -6.2, 2.3], [13.4, -6.8, 2.0], [17.2, -6.2, 1.65]]), fill: 'peau' },
      { d: 'M15.6 0.1C20 0.2 24 0.3 27.4 0.3', stroke: 'peau3', w: 0.65 },
    ],
    demi: () => [
      { d: ruban(doigtPts(14.4, 1.8, 4, [5.4, 3.9, 3], [0, 24, 28], [2.2, 2.0, 1.78, 1.4])), fill: 'peau2' },
      { d: PAUME_P, fill: 'peau' },
      { d: ruban(doigtPts(14.6, -1.6, -2, [6, 4.3, 3.3], [0, 16, 20], [2.3, 2.1, 1.86, 1.5])), fill: 'peau' },
      { d: 'M15.8 0.4C19.4 0.6 22.4 1.6 24.8 3.6', stroke: 'peau3', w: 0.65 },
      { d: ruban([[3.6, -3.8, 2.6], [8.6, -6, 2.3], [13.2, -6.4, 2.0], [16.8, -5.2, 1.65]]), fill: 'peau' },
    ],
    poing: () => [
      { d: 'M-1.5 -4.6C4 -5.4 10 -5.9 15 -5.6C19.6 -5.2 21.6 -1.8 21.4 2C21.2 5.8 18.6 8.4 14.6 8.4L8 7.8C4 7.2 1 5.9 -1.5 4.4Z', fill: 'peau' },
      { d: 'M16 -5.4C19.8 -4.6 21.6 -1.6 21.4 2C21.2 5.8 18.6 8.4 14.6 8.4C17.8 5.8 18.6 -1 16 -5.4Z', fill: 'peau2' },
      { d: 'M15.6 1.2Q18.4 1.2 21.2 2.2M14.6 4.6Q17 5 19.6 6.4', stroke: 'peau3', w: 0.75 },
      { d: ruban([[3.4, -3.6, 2.8], [9, -6.6, 2.45], [14.4, -6.6, 2.15], [18.2, -4.2, 1.75]]), fill: 'peau' },
    ],
  };
  // construit toutes les formes d'une main (une seule visible à la fois)
  function makeMain(parent, lib, echelle, tons) {
    const g = el('g', {}, parent);
    const formes = {};
    for (const nom in lib) {
      const fg = el('g', { display: 'none', transform: echelle !== 1 ? `scale(${echelle})` : '' }, g);
      for (const c of lib[nom]()) {
        if (c.fill) el('path', { d: c.d, fill: tons[c.fill] }, fg);
        else el('path', { d: c.d, fill: 'none', stroke: tons[c.stroke], 'stroke-width': c.w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, fg);
      }
      if (echelle !== 1) aplatir(fg);
      formes[nom] = fg;
    }
    return { g, formes, cur: null };
  }
  function formeMain(M, nom) {
    if (nom === 'visiere') nom = 'pince';
    if (M.cur === nom || !M.formes[nom]) return;
    if (M.cur) M.formes[M.cur].setAttribute('display', 'none');
    M.formes[nom].setAttribute('display', 'inline');
    M.cur = nom;
  }
  const TONS_PEAU = { peau: C.peau, peau2: C.peau2, peau3: C.peau3, anneau: C.poignee, anneauClair: '#D6F08E' };
  const TONS_PEAU_LOIN = { peau: C.peau2, peau2: C.peau3, peau3: '#A45A3E' };

  /* ---------- le logo du sac : le volcan de Bougnat Burger, cerné de blanc (d'après js/bb-logo.js) ---------- */
  const LOGO_D = 'M120 12C128 40 150 66 178 70C196 72 212 62 226 60C262 100 318 150 362 192C300 190 230 188 180 205C130 222 80 244 32 242C26 200 60 110 120 12Z';
  function logo(parent, x, y, largeur) {
    const k = largeur / 340;
    const g = el('g', { transform: `translate(${f(x)} ${f(y)}) scale(${f2(k * 100) / 100}) translate(-197 -127)` }, parent);
    el('path', { d: LOGO_D, fill: C.logo, stroke: C.logoBord, 'stroke-width': f(2.2 / k), 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, g);
    return g;
  }

  /* ========================================================================
     VUE DE FACE — origine au milieu de la poitrine ; tête en (0, −96)
     ======================================================================== */
  const BRAS = { L1: 67, L2: 66, AV: 58, PAUME: 8 }; // épaule→coude, coude→milieu de la paume, avant-bras dessiné, poignet→paume
  const JAMBE = 80; // hanche → cheville (y = 60 → 140)
  const MAIN_FACE = 1.22;
  const ANCRE_CORDON = [43, -29]; // sortie du cordon de la poignée, sur la bretelle de droite (repère de face)
  // la pointe gauche de la visière (repère de face, tête en (0, −96)) : pour y porter la main gauche (mainG 'pince' ou 'visiere')
  function pointeVisiere(casq = 0, casqY = 0) {
    const a = num(casq, 0) * RAD, dx = -32, dy = -66 + (66 - 24.5) * 0.93 + 40;
    return [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a) - 40 + num(casqY, 0) - 96];
  }

  // manches, jambes : dessinées le long de +x, ombre du côté +y
  function dessinBrasHaut(g, tons) {
    el('path', { d: 'M0 -15.5C20 -16 46 -13.4 67 -11.8L67 11.8C46 13.4 20 16 0 15.5A15.5 15.5 0 0 1 0 -15.5Z', fill: tons.base }, g);
    el('path', { d: 'M2 5.4C22 6.8 46 5.4 67 4.2L67 11.8C46 13.4 20 16 2 15.4Z', fill: tons.ombre }, g);
    el('path', { d: 'M6 -9.6C22 -10.6 40 -9.2 55 -8', fill: 'none', stroke: tons.clair, 'stroke-width': 3.2, 'stroke-linecap': 'round' }, g);
    el('circle', { cx: 67, cy: 0, r: 11.8, fill: tons.base }, g);
    el('path', { d: 'M55 7.2Q62 4.8 66 9.6M58.5 -1.8Q63.5 0.4 65.6 4.6', fill: 'none', stroke: tons.pli, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
  }
  function dessinAvantBras(g, tons) {
    el('path', { d: 'M0 -11.8C16 -11.8 34 -10.8 50 -10.2L50 10.2C34 10.8 16 11.8 0 11.8A11.8 11.8 0 0 1 0 -11.8Z', fill: tons.base }, g);
    el('path', { d: 'M2 4.6C18 5.2 34 4.6 50 4L50 10.2C34 10.8 16 11.8 2 11.6Z', fill: tons.ombre }, g);
    el('path', { d: 'M48 -11L58 -10.8L58 10.8L48 11Z', fill: tons.poignet }, g); // le poignet de la blouse
    el('path', { d: 'M49 -10.9L49 10.9', stroke: tons.pli, 'stroke-width': 1.2 }, g);
  }
  function dessinJambe(g, tons, L) {
    el('path', { d: `M0 -14.5C${L * 0.3} -14.5 ${L * 0.7} -12.4 ${L} -11.6L${L} 11.6C${L * 0.7} 12.4 ${L * 0.3} 14.5 0 14.5Z`, fill: tons.base }, g);
    el('path', { d: `M0 5.5C${L * 0.3} 5.8 ${L * 0.7} 4.8 ${L} 4.4L${L} 11.6C${L * 0.7} 12.4 ${L * 0.3} 14.5 0 14.5Z`, fill: tons.ombre }, g);
    el('path', { d: `M${L * 0.08} -6C${L * 0.4} -5.6 ${L * 0.7} -4.8 ${L * 0.96} -4.4`, fill: 'none', stroke: tons.clair, 'stroke-width': 2, 'stroke-linecap': 'round' }, g);
  }

  function makeFace(parent) {
    brancherHorloge();
    const R = defsDe(parent);
    const G = el('g', { class: 'bd-face' }, parent);

    // le halo doré (la force) : rayons Art déco + lueur
    const halo = el('g', { opacity: 0, display: 'none' }, G);
    const rayons = el('g', {}, halo);
    let dr = '';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2, b = a + Math.PI / 36;
      dr += `M0 0L${f(Math.cos(a) * 260)} ${f(Math.sin(a) * 300)}L${f(Math.cos(b) * 260)} ${f(Math.sin(b) * 300)}Z`;
    }
    el('path', { d: dr, fill: `url(#${R.rayons})` }, rayons);
    el('ellipse', { cx: 0, cy: -20, rx: 190, ry: 230, fill: `url(#${R.halo})` }, halo);
    const ombre = el('ellipse', { cx: 0, cy: 152, rx: 74, ry: 12, fill: '#1B1408', 'fill-opacity': 0.24 }, G);
    // le sac kraft sur son dos (o.sac) : on n'en voit que les bords, de part et d'autre de la taille
    const sacDos = el('g', { display: 'none' }, G);
    el('path', { d: 'M-62 -36L62 -36C68 -36 71.4 -32.6 71.6 -27L73 60C73.2 66.4 69.8 70 63.6 70L-63.6 70C-69.8 70 -73.2 66.4 -73 60L-71.6 -27C-71.4 -32.6 -68 -36 -62 -36Z', fill: C.sac }, sacDos);
    el('path', { d: 'M60 -36L62 -36C68 -36 71.4 -32.6 71.6 -27L73 60C73.2 66.4 69.8 70 63.6 70L58 70Z', fill: C.sacOmbre }, sacDos);
    el('path', { d: 'M-72.4 22L-60 22M60 22L72.6 22M-73 46L-60 46M60 46L73 46', stroke: C.sacOmbre, 'stroke-width': 1.3 }, sacDos);

    // les jambes (derrière le torse) : pantalon tendu de la hanche à la cheville, bottes
    const jambes = el('g', {}, G);
    const tonsJ = { base: C.pantalon, ombre: C.pantalonOmbre, clair: C.pantalonClair };
    const jambe = () => { const g = el('g', {}, jambes); dessinJambe(g, tonsJ, JAMBE); return g; };
    const jg = jambe(), jd = jambe();
    const botte = () => {
      const g = el('g', {}, jambes);
      const debout = el('g', {}, g); // vue de face, pointe un peu vers l'extérieur (dessinée pour la jambe droite)
      el('path', { d: 'M-12 -6L12 -6L14 2C19 3 24 6 24 10.5C24 13.6 21 15 16 15L-11 15C-15 15 -16 12.4 -15.4 9C-14.8 4.8 -13.4 0 -12 -6Z', fill: C.botte }, debout);
      el('path', { d: 'M4 3.6C10 2.6 17 4 21.6 7.4C18 6.8 12 6.6 6 8Z', fill: C.botteClair }, debout);
      el('path', { d: 'M-15.6 11.4L24 11.4C24 13.8 21 15.2 16 15.2L-11 15.2C-14.2 15.2 -15.8 13.6 -15.6 11.4Z', fill: C.semelle }, debout);
      el('path', { d: 'M-12 -6L12 -6L12.6 -2L-12.6 -2Z', fill: C.botteOmbre }, debout);
      const semelle = el('g', { display: 'none' }, g); // vue d'en dessous (la chute) : la semelle, talon près de la cheville
      el('path', { d: 'M-2 -10C8 -11.6 26 -12.6 36 -10C43 -8 44 8 36 10C26 12.6 8 11.6 -2 10C-6 9 -6 -9 -2 -10Z', fill: C.botte }, semelle);
      el('path', { d: 'M0 -8.6C9 -10 24 -10.8 34 -8.6C39.6 -7 40.4 7 34 8.6C24 10.8 9 10 0 8.6C-3 7.8 -3 -7.8 0 -8.6Z', fill: C.semelle }, semelle);
      el('path', { d: 'M1.6 -7C5 -7.6 9 -7.8 11.6 -7.4L11.6 7.4C9 7.8 5 7.6 1.6 7C-0.6 6.2 -0.6 -6.2 1.6 -7Z', fill: '#3B271A' }, semelle);
      el('path', { d: 'M17 -6.4L17 6.4M22 -7.4L22 7.4M27 -7.6L27 7.6M32 -6.8L32 6.8', stroke: '#3B271A', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, semelle);
      return { g, debout, semelle };
    };
    const bg0 = botte(), bd0 = botte();

    // le torse (se bombe avec la force)
    const torse = el('g', {}, G);
    // la blouse indigo
    el('path', { d: 'M-17 -54C-30 -50 -48 -45 -60 -37C-67 -32 -69 -20 -68 -6C-67 22 -65 52 -61 79C-30 85 30 85 61 79C65 52 67 22 68 -6C69 -20 67 -32 60 -37C48 -45 30 -50 17 -54C8 -48 -8 -48 -17 -54Z', fill: C.blouse }, torse);
    el('path', { d: 'M38 -46C52 -41 64 -36 66 -24C68 -10 67 20 66 44C65 58 63 70 61 79C53 81 45 82 38 82C44 56 48 26 46 -4C45 -22 43 -36 38 -46Z', fill: C.blouseOmbre }, torse);
    el('path', { d: 'M-58 -35C-50 -41 -40 -45 -30 -48C-40 -40 -48 -30 -52 -16C-56 -2 -58 14 -60 28C-62 12 -63 -2 -63 -14C-63 -24 -62 -31 -58 -35Z', fill: C.blouseClair }, torse);
    el('path', { d: 'M-44 20C-45 40 -46 60 -48 80M-30 36C-31 52 -32 66 -33 82M46 24C47 44 48 62 49 80', fill: 'none', stroke: C.blouseOmbre, 'stroke-width': 2.2, 'stroke-linecap': 'round' }, torse);
    el('path', { d: 'M-61 74C-30 80 30 80 61 74L61 79C30 85 -30 85 -61 79Z', fill: C.blouseNuit }, torse);
    // le tablier de cuir : bavette, bretelles, boutons, poche ; la jupe flotte dans la chute
    el('path', { d: 'M-17 -22L-11 -49M17 -22L11 -49', stroke: C.tablierOmbre, 'stroke-width': 5, 'stroke-linecap': 'round' }, torse);
    el('path', { d: 'M-40 26C-43 30 -46 34 -64 36M40 26C43 30 46 34 64 36', fill: 'none', stroke: C.tablierOmbre, 'stroke-width': 4, 'stroke-linecap': 'round' }, torse);
    const jupe = el('g', {}, torse);
    el('path', { d: 'M-40 20L40 20L45 110C30 114 -30 114 -45 110Z', fill: C.tablier }, jupe);
    el('path', { d: 'M-40 20L-18 20L-20 113C-30 113 -40 112 -45 110Z', fill: C.tablierClair }, jupe);
    el('path', { d: 'M28 20L40 20L45 110C41 111 36 112 32 112.6Z', fill: C.tablierOmbre }, jupe);
    el('path', { d: 'M-23 46L23 46L22 72C8 74 -8 74 -22 72Z', fill: '#6A3219' }, jupe);
    el('path', { d: 'M-21.4 48.6L21.4 48.6M-20.6 70L20.6 70M0 48.6L0 72', stroke: C.couture, 'stroke-width': 0.9, 'stroke-dasharray': '2.2 2', fill: 'none' }, jupe);
    el('path', { d: 'M-21 -26L21 -26C22 -6 30 12 40 24L-40 24C-30 12 -22 -6 -21 -26Z', fill: C.tablier }, torse);
    el('path', { d: 'M-21 -26L-6 -26C-8 -4 -12 12 -18 24L-40 24C-30 12 -22 -6 -21 -26Z', fill: C.tablierClair }, torse);
    el('path', { d: 'M14 -26L21 -26C22 -6 30 12 40 24L30 24C24 12 18 -6 14 -26Z', fill: C.tablierOmbre }, torse);
    el('path', { d: 'M-19 -23.6L19 -23.6', stroke: C.couture, 'stroke-width': 0.9, 'stroke-dasharray': '2.2 2' }, torse);
    [[-16, -21.2], [16, -21.2]].forEach(([x, y]) => {
      el('circle', { cx: x, cy: y, r: 3.2, fill: C.bouton }, torse);
      el('circle', { cx: x + 0.7, cy: y + 0.7, r: 1.4, fill: C.bouton2 }, torse);
    });
    // le foulard vert pomme : tour de cou, nœud, deux pans
    el('path', { d: 'M-27 -57C-19 -49 -9 -45.6 0 -45.6C9 -45.6 19 -49 27 -57L29.6 -47.4C20 -38.4 9 -34.6 0 -34.6C-9 -34.6 -20 -38.4 -29.6 -47.4Z', fill: C.foulard }, torse);
    el('path', { d: 'M-29.6 -47.4C-20 -38.4 -9 -34.6 0 -34.6C9 -34.6 20 -38.4 29.6 -47.4L28.6 -43.6C19.4 -35.6 9 -31.8 0 -31.8C-9 -31.8 -19.4 -35.6 -28.6 -43.6Z', fill: C.foulardOmbre }, torse);
    const pans = el('g', {}, torse);
    const panG = el('g', {}, pans), panD = el('g', {}, pans);
    el('path', { d: 'M-3 -40C-10 -32 -17 -21 -20 -7C-16.4 -6.2 -12 -5.6 -8 -3.8C-6.4 -17 -3 -29 2.4 -37.4Z', fill: C.foulard }, panG);
    el('path', { d: 'M-3 -40C-10 -32 -17 -21 -20 -7C-18.4 -6.6 -16.6 -6.2 -15 -5.8C-13 -18 -8.6 -29 -1 -38.6Z', fill: C.foulardOmbre }, panG);
    el('path', { d: 'M2 -40C8.4 -30 13.4 -17 14.4 -1.6C10.6 -3.4 6.6 -4 3 -3.6C3.2 -16.6 1.8 -28 -2.4 -37.6Z', fill: C.foulard }, panD);
    el('path', { d: 'M7.4 -31.6C10.8 -22 13 -12 14.4 -1.6C13 -2.4 11.4 -2.9 9.8 -3.2C9.6 -13 9 -22.4 7.4 -31.6Z', fill: C.foulardOmbre }, panD);
    el('path', { d: 'M-9.4 -48C-4.4 -52.4 5.4 -52.4 9.4 -48C10.8 -42.6 7.4 -37.8 0 -37.4C-7.4 -37.8 -10.8 -42.6 -9.4 -48Z', fill: C.foulard }, torse);
    el('path', { d: 'M-6 -46.4C-2 -49 3 -49 6.4 -46.6', fill: 'none', stroke: C.foulardClair, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, torse);
    el('path', { d: 'M-5.6 -41C-2 -39.6 2.2 -39.6 5.8 -41.2', fill: 'none', stroke: C.foulardOmbre, 'stroke-width': 1.3, 'stroke-linecap': 'round' }, torse);
    // les bretelles du sac (o.sac) : papier kraft torsadé, par-dessus les épaules et jusque sous les bras
    const bretelles = el('g', { display: 'none' }, torse);
    const BRET = 'M-33 -54C-38 -40 -45 -24 -53 -4M33 -54C38 -40 45 -24 53 -4';
    el('path', { d: BRET, fill: 'none', stroke: C.sacNuit, 'stroke-width': 7.4, 'stroke-linecap': 'round', 'stroke-opacity': 0.35 }, bretelles);
    el('path', { d: BRET, fill: 'none', stroke: C.sacOmbre, 'stroke-width': 5.8, 'stroke-linecap': 'round' }, bretelles);
    el('path', { d: BRET, fill: 'none', stroke: C.sacClair, 'stroke-width': 1.7, 'stroke-dasharray': '2.6 3.4', 'stroke-linecap': 'round' }, bretelles);
    // le fourreau du cordon, sur la bretelle de droite (côté bd), à hauteur de poitrine
    const fourreau = el('g', { display: 'none', transform: `translate(${ANCRE_CORDON[0]} ${ANCRE_CORDON[1]}) rotate(68)` }, torse);
    el('rect', { x: -6.4, y: -5.6, width: 12.8, height: 11.2, rx: 3, fill: C.sac }, fourreau);
    el('rect', { x: -6.4, y: 1.6, width: 12.8, height: 4, rx: 2, fill: C.sacOmbre }, fourreau);
    el('path', { d: 'M-6.4 -1.6L6.4 -1.6', stroke: C.sacNuit, 'stroke-width': 1, 'stroke-opacity': 0.6 }, fourreau);

    /* la tête (repère : centre du visage ; les plans remplacent sa transformation) */
    const tete = el('g', {}, G);
    const oreille = (s) => {
      const g = el('g', { transform: `scale(${s} 1)` }, tete);
      el('path', { d: 'M38 -13C47 -19 55 -9 54 2C53 12 46 19 39 16Z', fill: C.peau }, g);
      el('path', { d: 'M44.4 -6.6C49.4 -5.6 50.4 4 46.4 10C47.6 4 47.4 -1.4 44.4 -6.6Z', fill: C.peau2 }, g);
      aplatir(g);
    };
    oreille(1); oreille(-1);
    el('path', { d: 'M0 -47C25 -47 42 -35 44 -14C46 2 47 18 43 30C38 42 21 51 0 51C-21 51 -38 42 -43 30C-47 18 -46 2 -44 -14C-42 -35 -25 -47 0 -47Z', fill: C.peau }, tete);
    el('path', { d: 'M31 -40C39 -32 43 -22 44 -14C46 2 47 18 43 30C38 42 21 51 0 51C14 47 28 38 33 26C37 13 37 -2 36.4 -14C35.8 -24 34 -33 31 -40Z', fill: C.peau2 }, tete);
    el('path', { d: 'M-15 44.6Q0 49.4 15 44.6', fill: 'none', stroke: C.peau3, 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-opacity': 0.45 }, tete);
    // le crâne dégarni et ses trois cheveux (on ne les voit que quand la casquette s'envole)
    const crane = el('g', {}, tete);
    el('ellipse', { cx: -13, cy: -36, rx: 12, ry: 5, fill: C.peauClair, transform: 'rotate(-16 -13 -36)' }, crane);
    aplatir(crane);
    const ombreCasq = el('path', { d: 'M-42 -25C-24 -20.4 24 -20.4 42 -25C40 -18.4 24 -15.2 0 -15.2C-24 -15.2 -40 -18.4 -42 -25Z', fill: C.peau2, 'fill-opacity': 0.85 }, tete);
    // les touffes grises des tempes
    const touffe = (s) => {
      const g = el('g', { transform: `scale(${s} 1)` }, tete);
      el('path', { d: 'M34 -28C41 -31 50 -29 53.6 -23C56 -18.6 55 -13.4 52.8 -10.4C55.4 -7.2 55 -2.2 51.6 0.4C51.4 -3.2 49.8 -5.4 47.2 -6.2C48.6 -2.2 47.8 2.2 44.6 4.8C44 0.2 42.6 -3.4 40.2 -6C40.4 -2 39.4 1.6 37.4 3.6C36.6 -3 36.6 -9 35.6 -14C35.2 -19 34.8 -23.6 34 -28Z', fill: C.gris }, g);
      el('path', { d: 'M47.2 -6.2C48.6 -2.2 47.8 2.2 44.6 4.8C44 0.2 42.6 -3.4 40.2 -6C42.8 -6.8 45.2 -6.8 47.2 -6.2Z', fill: C.grisOmbre }, g);
      el('path', { d: 'M52.8 -10.4C55.4 -7.2 55 -2.2 51.6 0.4C51.4 -3.2 50.4 -6.4 48.4 -8.8C50 -9.2 51.6 -9.8 52.8 -10.4Z', fill: C.grisOmbre }, g);
      el('path', { d: 'M40.2 -6C40.4 -2 39.4 1.6 37.4 3.6C36.8 -1.6 36.6 -6.4 36.2 -10.4C37.8 -9 39.2 -7.6 40.2 -6Z', fill: C.grisOmbre }, g);
      el('path', { d: 'M38.6 -26C44.6 -27 49.4 -24 51 -18.8M39.4 -19.4C43 -18.8 45.8 -16.2 46.8 -12.4', fill: 'none', stroke: C.grisClair, 'stroke-width': 1.3, 'stroke-linecap': 'round' }, g);
      aplatir(g);
    };
    touffe(1); touffe(-1);
    // pommettes roses, joues gonflées (quand il mâche)
    el('ellipse', { cx: -26, cy: 10, rx: 11, ry: 7.4, fill: C.joue, 'fill-opacity': 0.5 }, tete);
    el('ellipse', { cx: 26, cy: 10, rx: 11, ry: 7.4, fill: C.joue, 'fill-opacity': 0.5 }, tete);
    const joues = el('g', { display: 'none' }, tete);
    const joue = (s) => {
      const j = el('g', { transform: `translate(${s * 33} 22)` }, joues);
      el('ellipse', { cx: 0, cy: 0, rx: 21, ry: 18, fill: C.peau }, j);
      el('path', { d: `M${s * 14.6} 13C${s * 20} 7 ${s * 21.4} -2 ${s * 19.4} -8.4C${s * 22} 1 ${s * 18.6} 12.4 ${s * 6.6} 17.8Z`, fill: C.peau2 }, j);
      el('ellipse', { cx: s * 3, cy: -3.4, rx: 12, ry: 8, fill: C.joue, 'fill-opacity': 0.55 }, j);
      return j;
    };
    const jg0 = joue(-1), jd0 = joue(1);
    // les yeux : blanc (la peur), pupille, paupières, yeux fermés heureux, spirales (étourdi)
    const yeux = el('g', {}, tete);
    const blancs = el('g', { display: 'none' }, yeux);
    const blancG = el('ellipse', { cx: -15, cy: -5, rx: 11, ry: 13, fill: C.blanc, stroke: C.peau3, 'stroke-width': 1.2 }, blancs);
    const blancD = el('ellipse', { cx: 15, cy: -5, rx: 11, ry: 13, fill: C.blanc, stroke: C.peau3, 'stroke-width': 1.2 }, blancs);
    const pupilles = el('g', {}, yeux);
    const pupille = (x) => { const p = el('g', { transform: `translate(${x} -3)` }, pupilles); el('ellipse', { cx: 0, cy: 0, rx: 4.4, ry: 5.4, fill: C.oeil }, p); el('circle', { cx: 1.5, cy: -2.1, r: 1.45, fill: '#FFF' }, p); return p; };
    const pg = pupille(-15), pd = pupille(15);
    const paupieres = el('path', { fill: C.peau, display: 'none' }, yeux);
    const cils = el('path', { fill: 'none', stroke: C.oeil, 'stroke-width': 1.7, 'stroke-linecap': 'round', display: 'none' }, yeux);
    const fermes = el('path', { d: 'M-21 -1.6Q-15 -8.6 -9 -1.6M9 -1.6Q15 -8.6 21 -1.6', fill: 'none', stroke: C.oeil, 'stroke-width': 2.6, 'stroke-linecap': 'round', display: 'none' }, yeux);
    const spirales = el('g', { display: 'none' }, yeux);
    let sp = '';
    for (let k = 0; k <= 40; k++) { const a = k / 40 * Math.PI * 5, r = 0.4 + k / 40 * 5.6; sp += (k ? 'L' : 'M') + f(Math.cos(a) * r) + ' ' + f(Math.sin(a) * r); }
    const spirale = (x) => { const s = el('g', { transform: `translate(${x} -3)` }, spirales); el('path', { d: sp, fill: 'none', stroke: C.oeil, 'stroke-width': 1.5, 'stroke-linecap': 'round' }, s); return s; };
    const sg = spirale(-15), sdr = spirale(15);
    el('path', { d: 'M-21 4.8Q-15 7.6 -9.4 5.2M9.4 5.2Q15 7.6 21 4.8', fill: 'none', stroke: C.peau3, 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-opacity': 0.35 }, tete);
    // les sourcils gris, épais
    const sourcil = (s) => {
      const g = el('g', {}, tete);
      el('path', { d: `M${s * 4.4} -13.6C${s * 6.4} -19.8 ${s * 16} -22.4 ${s * 26.4} -17.6C${s * 27.6} -16 ${s * 27} -14.8 ${s * 25.2} -15C${s * 18.6} -17.2 ${s * 11} -15.6 ${s * 6.6} -11.4C${s * 5.2} -11.2 ${s * 4.2} -12 ${s * 4.4} -13.6Z`, fill: C.sourcil }, g);
      el('path', { d: `M${s * 8} -15.8C${s * 13} -18.6 ${s * 19} -19.2 ${s * 24} -17.4`, fill: 'none', stroke: '#8D8A91', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g);
      return g;
    };
    const srcG = sourcil(-1), srcD = sourcil(1);
    // la bouche (derrière la moustache) : intérieur, dents, langue ; creux du menton
    el('path', { d: 'M-8.6 38.4Q0 41 8.6 38.4', fill: 'none', stroke: C.peau2, 'stroke-width': 1.8, 'stroke-linecap': 'round' }, tete);
    const bouche = el('g', {}, tete);
    const boucheD = el('path', { fill: C.bouche }, bouche);
    const dents = el('path', { fill: C.dents }, bouche);
    const langue = el('path', { fill: C.langue }, bouche);
    const levre = el('path', { fill: 'none', stroke: C.levre, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-opacity': 0.7 }, bouche);
    // la moustache en guidon : normale, hérissée (la peur), fière (la force)
    const moust = el('g', {}, tete);
    const moustIn = el('g', {}, moust);
    const aile = (pts) => {
      const g = el('g', {});
      el('path', { d: ruban(pts), fill: C.gris }, g);
      el('path', { d: ruban(bandeA(pts, 0.46)), fill: C.grisOmbre }, g);
      const n = pts.length, reflet = (k0, k1, dy) => pts.slice(Math.round(k0 * (n - 1)), Math.round(k1 * (n - 1)) + 1).map((p) => [p[0], p[1] - p[2] * dy, 0.55]);
      el('path', { d: ruban(reflet(0.08, 0.6, 0.45)), fill: C.grisClair }, g);
      el('path', { d: ruban(reflet(0.18, 0.72, 0.05)), fill: C.grisClair, 'fill-opacity': 0.7 }, g);
      return g;
    };
    const variante = (pts) => {
      const g = el('g', { display: 'none' }, moustIn);
      const d = aile(pts); g.appendChild(d);
      const gch = aile(pts); gch.setAttribute('transform', 'scale(-1 1)'); g.appendChild(gch); aplatir(gch);
      return g;
    };
    const MOUST = {
      normale: variante([[0.6, 18.2, 5.2], [6, 20, 7.4], [12.6, 22.4, 7.6], [19.6, 24, 6.8], [26, 23.6, 5.4], [31, 21, 4.0], [34.2, 16.8, 2.9], [34.8, 12, 2.0], [32.4, 8.8, 1.25]]),
      herissee: variante([[0.6, 18, 5.2], [7, 18.6, 7.2], [14, 18.4, 7.0], [21, 16.6, 6.0], [28, 13, 4.8], [34, 8.6, 3.6], [39, 3.8, 2.4], [42.4, -0.6, 1.3]]),
      fiere: variante([[0.6, 18.2, 5.2], [6, 20, 7.4], [12.6, 22, 7.4], [19.6, 22.6, 6.6], [26, 21, 5.4], [30.6, 16.8, 4.3], [32.4, 11.4, 3.4], [31, 6.8, 2.6], [27.4, 4.8, 2.0], [24.6, 6.6, 1.6], [25.4, 9.6, 1.2]]),
    };
    // des poils dressés quand il a peur (mèches en pointe sous les ailes hérissées)
    const poils = el('g', { display: 'none' }, moustIn);
    [1, -1].forEach((s) => [[38, 5, -78, 9], [40, 3, -52, 11], [40.4, 4.4, -26, 10], [37, 8.6, -4, 8], [22, 13.6, -96, 6.4], [29, 11, -84, 7]].forEach(([x, y, a, l]) => {
      const pts = [[x, y, 1.7], [x + Math.cos(a * RAD) * l * 0.5, y + Math.sin(a * RAD) * l * 0.5 + 0.8, 1.1], [x + Math.cos(a * RAD) * l, y + Math.sin(a * RAD) * l, 0.22]];
      el('path', { d: s < 0 ? miroir(ruban(pts)) : ruban(pts), fill: C.gris }, poils);
    }));
    // le nez rond et rose, posé sur la moustache
    const nez = el('g', { transform: 'translate(0 9) scale(0.9) translate(0 -9)' }, tete);
    el('path', { d: 'M0 -6C4.4 -6 5.6 -1.6 6.6 2C10.8 3.2 13 7.2 12.6 11.6C12.2 16.4 7.2 19.2 0 19.2C-7.2 19.2 -12.2 16.4 -12.6 11.6C-13 7.2 -10.8 3.2 -6.6 2C-5.6 -1.6 -4.4 -6 0 -6Z', fill: C.nez }, nez);
    el('path', { d: 'M12.6 11.6C12.2 16.4 7.2 19.2 0 19.2C-5.6 19.2 -9.8 17.6 -11.6 15C-6 16.8 4.6 17 9.8 12.8C11.4 10.8 11.8 7.6 11 4.2C12.2 6.4 12.8 9 12.6 11.6Z', fill: C.nez2 }, nez);
    el('path', { d: 'M4.4 -1.8C5.6 1 6 3.4 6.6 5.6', fill: 'none', stroke: C.nez2, 'stroke-width': 1.3, 'stroke-linecap': 'round', 'stroke-opacity': 0.8 }, nez);
    el('ellipse', { cx: -4.4, cy: 7, rx: 3.6, ry: 2.8, fill: C.nezClair }, nez);
    aplatir(nez);
    // les gouttes de sueur
    const gouttes = el('g', { display: 'none' }, tete);
    const gts = [[-44, -30, 1], [46, -22, 0.85], [-50, -4, 0.75]].map(([x, y, k]) => {
      const gi = el('g', { transform: tr(x, y, 0, k) }, gouttes);
      el('path', { d: 'M0 -10C3.6 -4 6 0 6 3.6C6 7.4 3.4 9.6 0 9.6C-3.4 9.6 -6 7.4 -6 3.6C-6 0 -3.6 -4 0 -10Z', fill: C.goutte }, gi);
      el('ellipse', { cx: -2, cy: 3.4, rx: 1.5, ry: 2.4, fill: C.goutteClair }, gi);
      gi.__pos = [x, y, k];
      return gi;
    });
    // la casquette gavroche anthracite (pivote autour de (0, −40), s'envole avec casqY)
    const casq = el('g', {}, tete);
    const casqForme = el('g', { transform: 'translate(0 -66) scale(1 0.93) translate(0 66)' }, casq);
    // la visière (sous le bord du dessus qui la déborde)
    el('path', { d: 'M-35 -29C-18 -32.6 18 -32.6 35 -29C37.6 -26.2 36.2 -22.4 31.6 -21.2C16 -18 -16 -18 -31.6 -21.2C-36.2 -22.4 -37.6 -26.2 -35 -29Z', fill: C.casqOmbre }, casqForme);
    el('path', { d: 'M-31.6 -21.2C-16 -18 16 -18 31.6 -21.2C34.4 -21.8 36 -23.4 36.4 -25.2C36.8 -22 35 -19.4 31.8 -18.6C16 -15.6 -16 -15.6 -31.8 -18.6C-35 -19.4 -36.8 -22 -36.4 -25.2C-36 -23.4 -34.4 -21.8 -31.6 -21.2Z', fill: C.casqNoir }, casqForme);
    el('path', { d: 'M-27 -22.8C-12 -20.4 12 -20.4 27 -22.8', fill: 'none', stroke: '#747C83', 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-opacity': 0.9 }, casqForme);
    // le dessus bombé, ses coutures, son bouton
    el('path', { d: 'M-48 -24C-58 -32 -56 -53 -32 -61C-12 -67 20 -68 40 -61C57 -54 60 -35 49 -24C40 -26.6 32 -28.6 22 -29.6C8 -31 -8 -31 -22 -29.6C-32 -28.6 -40 -26.6 -48 -24Z', fill: C.casq }, casqForme);
    el('path', { d: 'M-48 -24C-58 -32 -56 -53 -32 -61C-18 -65.6 -2 -67 12 -66.4C-8 -63 -26 -56 -34 -45C-40 -37 -42 -30 -40.4 -26.6C-43.2 -25.8 -45.8 -25 -48 -24Z', fill: C.casqClair }, casqForme);
    el('path', { d: 'M40 -61C57 -54 60 -35 49 -24C44 -25.6 39 -26.8 34 -27.6C41 -35 43 -49 35 -62.4C36.8 -62 38.4 -61.6 40 -61Z', fill: C.casqOmbre }, casqForme);
    el('path', { d: 'M-4 -65.6C-10 -55 -12 -42 -10.6 -30.8M14 -65.6C18.6 -55 19.6 -42 18 -30.6', fill: 'none', stroke: C.casqOmbre, 'stroke-width': 1.3, 'stroke-linecap': 'round' }, casqForme);
    el('path', { d: 'M-48 -24C-40 -26.6 -32 -28.6 -22 -29.6C-8 -31 8 -31 22 -29.6C32 -28.6 40 -26.6 49 -24L48.2 -20.8C39 -23.4 31 -25.2 22 -26C8 -27.4 -8 -27.4 -22 -26C-31 -25.2 -39 -23.4 -47.4 -20.8Z', fill: C.casqNoir }, casqForme);
    el('ellipse', { cx: 2, cy: -65.6, rx: 5.6, ry: 3, fill: C.casqClair }, casqForme);
    el('path', { d: 'M-3.6 -65C-1 -63.4 4 -63.4 7.6 -65', fill: 'none', stroke: C.casqOmbre, 'stroke-width': 1.2, 'stroke-linecap': 'round' }, casqForme);
    aplatir(casqForme);

    // le cordon (o.cordon) : de la bretelle jusqu'à l'anneau, tenu en main ou lâché au vent
    const cordon = el('g', { display: 'none' }, G);
    const cordonD = el('path', { fill: 'none', stroke: C.sacNuit, 'stroke-width': 3.2, 'stroke-linecap': 'round' }, cordon);
    const cordonL = el('path', { fill: 'none', stroke: '#E6D3AE', 'stroke-width': 1.5, 'stroke-linecap': 'round' }, cordon);
    const anneauLibre = el('g', { display: 'none' }, cordon);
    el('circle', { r: 8, fill: 'none', stroke: C.poignee, 'stroke-width': 3.8 }, anneauLibre);
    el('path', { d: 'M-5.6 -4.2A7 7 0 0 1 2.6 -6.6', fill: 'none', stroke: '#D6F08E', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, anneauLibre);

    // les bras (devant la tête : il porte la frite à la bouche)
    const tonsB = { base: C.blouse, ombre: C.blouseOmbre, clair: C.blouseClair, pli: C.blouseNuit, poignet: C.blouseOmbre };
    const bras = () => {
      const g = el('g', {}, G);
      const haut = el('g', {}, g); dessinBrasHaut(haut, tonsB);
      const biceps = el('g', { display: 'none' }, haut);
      const bic = el('g', {}, biceps);
      el('path', { d: 'M8 -12C18 -26 44 -28 58 -12Z', fill: C.blouse }, bic);
      el('path', { d: 'M14 -18C24 -24.6 40 -25 50 -18', fill: 'none', stroke: C.blouseClair, 'stroke-width': 3, 'stroke-linecap': 'round' }, bic);
      const avant = el('g', {}, g); dessinAvantBras(avant, tonsB);
      const main = el('g', {}, g);
      const M = makeMain(main, MAINS_FACE, MAIN_FACE, TONS_PEAU);
      return { g, haut, biceps, bic, avant, main, M };
    };
    const BG = bras(), BD = bras();

    // les étoiles (étourdi) et les éclats (la force) : les plans placent chaque enfant
    const etoiles = el('g', { display: 'none' }, G);
    for (let i = 0; i < 4; i++) {
      const g = el('g', {}, etoiles);
      let d = '';
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 4.4 : 10.4; d += (k ? 'L' : 'M') + f(Math.cos(a) * r) + ' ' + f(Math.sin(a) * r); }
      el('path', { d: d + 'Z', fill: C.etoile, stroke: C.etoile, 'stroke-width': 2.4, 'stroke-linejoin': 'round' }, g);
      el('circle', { cx: -1.4, cy: -1.2, r: 2.6, fill: C.etoileClair }, g);
    }
    const eclats = el('g', { display: 'none' }, G);
    for (let i = 0; i < 6; i++) {
      const g = el('g', {}, eclats);
      el('path', { d: 'M0 -16C1.4 -5 5 -1.4 16 0C5 1.4 1.4 5 0 16C-1.4 5 -5 1.4 -16 0C-5 -1.4 -1.4 -5 0 -16Z', fill: C.eclat }, g);
      el('circle', { r: 3.2, fill: '#FFFFFF' }, g);
    }

    return {
      G, halo, rayons, ombre, torse, jupe, pans, panG, panD, jambes, jg, jd, bg: BG, bd: BD, BG, BD, botteG: bg0, botteD: bd0,
      sacDos, bretelles, fourreau, cordon, cordonD, cordonL, anneauLibre,
      tete, crane, ombreCasq, joues, jg0, jd0, blancs, blancG, blancD, pupilles, pg, pd, paupieres, cils, fermes, spirales, sg, sdr,
      srcG, srcD, boucheD, bouche, langue, dents, levre, moust, moustIn, MOUST, poils, gouttes, gts, casq, etoiles, eclats,
      mg: BG.M.g, md: BD.M.g, pouce: BD.M.formes.pouce, _moustCur: null, _yeux: null, _bouche: null,
    };
  }

  // deux segments (épaule → coude → main) : le coude choisit, en fondu, le côté « dehors et bas »
  function brasIK(sx, sy, hx, hy, cote, L1, L2) {
    const dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 0.001;
    const th = Math.atan2(dy, dx);
    let phi, k = 1;
    if (d >= L1 + L2) { phi = th; k = d / (L1 + L2); }
    else {
      const ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), al = Math.acos(ca);
      const n = Math.hypot(1, 1.6), nx = cote / n, ny = 1.6 / n;
      const s1 = Math.cos(th - al) * nx + Math.sin(th - al) * ny, s2 = Math.cos(th + al) * nx + Math.sin(th + al) * ny;
      const w = lisser(clamp(0.5 + (s2 - s1) / 0.18));
      phi = th - al + 2 * al * w;
    }
    const ex = sx + Math.cos(phi) * L1 * k, ey = sy + Math.sin(phi) * L1 * k;
    return { ex, ey, a1: phi / RAD, k1: k, a2: Math.atan2(hy - ey, hx - ex) / RAD };
  }

  function poseFace(F, o, tArg) {
    o = o || {};
    const t = isFinite(tArg) ? tArg : maintenant(o);
    const bg = o.bg || [-62, -30, -72, 100], bd = o.bd || [62, -30, 72, 100];
    const p = clamp(num(o.peur, 0)), m = clamp(num(o.muscles, 0), 0, 1.3), dec = clamp(num(o.decide, 0), 0, 1.3);
    const j = o.jambes || [-34, -38, 140, 34, 38, 140];
    const chute = Math.abs(j[1] - j[0]) > 45 || j[2] > 170;
    const vent = chute ? 1 : 0;

    // le torse et les épaules (la force élargit)
    poser(F.torse, 'transform', m ? `scale(${f2(1 + 0.22 * m)} 1)` : '');
    // la jupe du tablier et les pans du foulard : le vent de la chute
    if (vent) {
      poser(F.jupe, 'transform', `translate(0 20) skewX(${f(Math.sin(t * 9.5) * 7)}) scale(${f2(1 + 0.05 * Math.sin(t * 13))} ${f2(0.78 + 0.1 * Math.sin(t * 11 + 1))}) translate(0 -20)`);
      poser(F.panG, 'transform', `rotate(${f(58 + Math.sin(t * 14) * 18)} -2 -40)`);
      poser(F.panD, 'transform', `rotate(${f(-58 + Math.sin(t * 12 + 2) * 18)} 0 -40)`);
    } else {
      poser(F.jupe, 'transform', '');
      poser(F.panG, 'transform', `rotate(${f(Math.sin(t * 1.3) * 1.5)} -2 -40)`);
      poser(F.panD, 'transform', `rotate(${f(Math.sin(t * 1.1 + 1) * 1.5)} 0 -40)`);
    }

    // les jambes : tendues de la hanche à la cheville ; bottes vues de face, ou semelles quand il tombe
    const jambe = (J, B, hx, ax, ay, s) => {
      const dx = ax - hx, dy = ay - 60, L = Math.hypot(dx, dy), a = Math.atan2(dy, dx) / RAD;
      poser(J, 'transform', `translate(${f(hx)} 60) rotate(${f(a)}) scale(${f2(L / JAMBE)} ${s})`);
      voir(B.debout, !chute); voir(B.semelle, chute);
      poser(B.g, 'transform', chute ? `translate(${f(ax)} ${f(ay)}) rotate(${f(a)}) scale(1 ${s})` : `translate(${f(ax)} ${f(ay + 2)}) scale(${s} 1)`);
    };
    jambe(F.jg, F.botteG, j[0], j[1], j[2], -1);
    jambe(F.jd, F.botteD, j[3], j[4], j[5], 1);
    voir(F.ombre, !!o.ombre);

    // les bras
    const ep = 0.22 * m * 62;
    const unBras = (B, a, cote, nomMain) => {
      const sx = a[0] + cote * ep, sy = a[1];
      let hx = a[2], hy = a[3];
      let ik = brasIK(sx, sy, hx, hy, cote, BRAS.L1, BRAS.L2);
      const prise = PRISE[nomMain];
      if (prise) {
        // la cible est le bout des doigts qui pincent : on recule le milieu de la paume en conséquence (deux passes)
        for (let k = 0; k < 2; k++) {
          const r = ik.a2 * RAD, fl = -Math.sin(r) * -cote >= 0 ? 1 : -1;
          const dx = (prise[0] - BRAS.PAUME) * MAIN_FACE, dy = prise[1] * MAIN_FACE * fl;
          hx = a[2] - (Math.cos(r) * dx - Math.sin(r) * dy); hy = a[3] - (Math.sin(r) * dx + Math.cos(r) * dy);
          ik = brasIK(sx, sy, hx, hy, cote, BRAS.L1, BRAS.L2);
        }
      }
      const s = cote; // côté ombre vers l'intérieur
      poser(B.haut, 'transform', `translate(${f(sx)} ${f(sy)}) rotate(${f(ik.a1)}) scale(${f2(ik.k1)} ${f2(s * (1 + 0.42 * m))})`);
      // l'avant-bras va du coude au poignet
      const lx = hx - ik.ex, ly = hy - ik.ey, l = Math.hypot(lx, ly);
      const lav = Math.max(0.5, l - BRAS.PAUME * MAIN_FACE);
      poser(B.avant, 'transform', `translate(${f(ik.ex)} ${f(ik.ey)}) rotate(${f(ik.a2)}) scale(${f2(lav / BRAS.AV)} ${f2(s * (1 + 0.18 * m))})`);
      // les biceps gonflent du côté où l'avant-bras se replie
      if (m > 0.02) {
        voir(B.biceps, true);
        let rel = ((ik.a2 - ik.a1) % 360 + 540) % 360 - 180;
        const cotePli = (rel < 0 ? -1 : 1) * s;
        poser(B.bic, 'transform', `scale(1 ${f2(-cotePli * clamp(m, 0, 1.2))})`);
      } else voir(B.biceps, false);
      // la main : forme selon la situation, orientée comme l'avant-bras, pouce vers le corps
      let nom = nomMain;
      let rot = ik.a2, flip;
      const nx = -Math.sin(rot * RAD);
      flip = nx * -cote >= 0 ? 1 : -1;
      if (nom === 'pouce') { rot = clamp((ik.a2 + 50) * 0.25, -14, 14); flip = 1; }
      poser(B.main, 'transform', `translate(${f(hx)} ${f(hy)}) rotate(${f(rot)}) scale(${nom === 'pouce' ? cote : 1} ${nom === 'pouce' ? 1 : flip})` + (nom === 'pouce' ? '' : ` translate(${f(-BRAS.PAUME * MAIN_FACE)} 0)`));
      formeMain(B.M, nom);
      // où est l'anneau (repère de face) quand cette main le tient
      if (nom === 'anneau') {
        const r = rot * RAD, lx = (ANNEAU[0] - BRAS.PAUME) * MAIN_FACE, ly = ANNEAU[1] * MAIN_FACE * flip;
        B.anneau = [hx + Math.cos(r) * lx - Math.sin(r) * ly, hy + Math.sin(r) * lx + Math.cos(r) * ly, ANNEAU[2] * MAIN_FACE];
      } else B.anneau = null;
    };
    const cordon = o.cordon === 'main' || o.cordon === 'libre' ? o.cordon : null;
    const mainPour = (cote, H) => {
      const opt = cote < 0 ? o.mainG : o.mainD;
      if (opt) return opt;
      if (cote > 0 && cordon === 'main') return 'anneau';
      if (cote > 0 && o.pouce) return 'pouce';
      if (m > 0.35) return 'poing';
      if (p > 0.3) return 'ecartee';
      if (o.joues) return 'tient';
      if (chute) return cote > 0 ? 'poing' : 'ouverte';
      if (H[1] < -40) return cote > 0 ? 'pince' : 'ouverte';
      return 'detendue';
    };
    unBras(F.BG, bg, -1, mainPour(-1, [bg[2], bg[3]]));
    unBras(F.BD, bd, 1, mainPour(1, [bd[2], bd[3]]));

    // le sac sur le dos, ses bretelles ; le cordon de la poignée
    const sac = !!o.sac;
    voir(F.sacDos, sac); voir(F.bretelles, sac);
    voir(F.cordon, !!cordon); voir(F.fourreau, !!cordon);
    if (cordon) {
      const ax = ANCRE_CORDON[0] * (1 + 0.22 * m), ay = ANCRE_CORDON[1] + 3;
      let d;
      if (cordon === 'main' && F.BD.anneau) {
        // tendu quand la main est loin, un peu mou quand elle est près
        const [rx, ry, rr] = F.BD.anneau, vx = ax - rx, vy = ay - ry, l = Math.hypot(vx, vy) || 1;
        const ex = rx + (vx / l) * rr, ey = ry + (vy / l) * rr, dd = Math.hypot(ex - ax, ey - ay);
        const mou = Math.sqrt(Math.max(0, 70 * 70 - dd * dd)) * 0.32;
        let nx = -(ey - ay) / (dd || 1), ny = (ex - ax) / (dd || 1);
        if (ny < 0) { nx = -nx; ny = -ny; }
        d = `M${f(ax)} ${f(ay)}Q${f((ax + ex) / 2 + nx * mou)} ${f((ay + ey) / 2 + ny * mou)} ${f(ex)} ${f(ey)}`;
        voir(F.anneauLibre, false);
      } else {
        // lâché : il pend du fourreau et claque au vent
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const s = k / 6, amp = 8 * s * (0.6 + 0.4 * Math.sin(t * 5));
          pts.push([ax + 18 * s + Math.sin(t * 15 - s * 4) * amp, ay + 48 * s + Math.cos(t * 13 - s * 4) * amp * 0.4]);
        }
        d = `M${f(pts[0][0])} ${f(pts[0][1])}` + lisse(pts, false);
        const q = pts[6];
        voir(F.anneauLibre, true);
        poser(F.anneauLibre, 'transform', `translate(${f(q[0] + 2)} ${f(q[1] + 7)}) rotate(${f(Math.sin(t * 15 - 4) * 30)})`);
      }
      poser(F.cordonD, 'd', d); poser(F.cordonL, 'd', d);
    }

    /* le visage */
    // les yeux : l'expression vient du plan (yeux, peur, étoiles) ; le clignement passe par les paupières
    const yeuxO = num(o.yeux, 1);
    const etourdi = !!o.etoiles && yeuxO < 0.5;
    voir(F.blancs, p > 0.02);
    if (p > 0.02) {
      poser(F.blancG, 'rx', f(11 * p)); poser(F.blancG, 'ry', f(13 * p));
      poser(F.blancD, 'rx', f(11 * p)); poser(F.blancD, 'ry', f(13 * p));
    }
    const modeYeux = etourdi ? 'spirale' : p > 0.02 ? 'peur' : yeuxO <= 0.32 ? 'fermes' : 'ouverts';
    voir(F.pupilles, modeYeux === 'peur' || modeYeux === 'ouverts');
    voir(F.fermes, modeYeux === 'fermes');
    voir(F.spirales, modeYeux === 'spirale');
    if (modeYeux === 'spirale') { poser(F.sg, 'transform', `translate(-15 -3) rotate(${f(t * 400 % 360)})`); poser(F.sdr, 'transform', `translate(15 -3) rotate(${f(-t * 400 % 360)})`); }
    if (modeYeux === 'peur') {
      const k = f2(lerp(1, 0.56, p)), y = f(-3 - 2 * p);
      poser(F.pg, 'transform', `translate(-15 ${y}) scale(${k})`); poser(F.pd, 'transform', `translate(15 ${y}) scale(${k})`);
    } else { poser(F.pg, 'transform', 'translate(-15 -3)'); poser(F.pd, 'transform', 'translate(15 -3)'); }
    // paupières : lourdes (sûr de lui, décidé, il mâche) quand 0,32 < yeux < 0,85 ; sinon le clignement
    const niveau = modeYeux === 'ouverts' ? (yeuxO < 0.85 ? yeuxO : paupiere(t)) : 1;
    const lourd = niveau < 0.9;
    voir(F.paupieres, lourd); voir(F.cils, lourd);
    if (lourd) {
      const ly = -8.8 + (1 - niveau) * 11.4, pente = 2.2 * dec;
      const lid = (x, s) => `M${x - 8.4 * s} -11.4L${x + 8.4 * s} -11.4L${x + 8.4 * s} ${f(ly - pente)}Q${x} ${f(ly - 2.4 + pente * 0.2)} ${x - 8.4 * s} ${f(ly + pente)}Z`;
      poser(F.paupieres, 'd', lid(-15, -1) + lid(15, 1));
      const cil = (x, s) => `M${x - 6.6 * s} ${f(ly + pente * 0.9 - 0.4)}Q${x} ${f(ly - 2 + pente * 0.2)} ${x + 6.6 * s} ${f(ly - pente * 0.9 - 0.4)}`;
      poser(F.cils, 'd', cil(-15, -1) + cil(15, 1));
    }
    // les sourcils : la peur les monte (l'intérieur plus haut), la décision les fronce
    const sb = (s) => `translate(0 ${f(-10 * p + 3 * dec)}) rotate(${f(s * (9 * p - 14 * dec))} ${s * 26} -16)`;
    poser(F.srcG, 'transform', sb(-1)); poser(F.srcD, 'transform', sb(1));
    // les joues gonflées
    const jo = clamp(num(o.joues, 0) / 0.75, 0, 1.2);
    voir(F.joues, jo > 0.02);
    if (jo > 0.02) { const k = f2(0.5 + 0.5 * jo); poser(F.jg0, 'transform', `translate(-33 22) scale(${k})`); poser(F.jd0, 'transform', `translate(33 22) scale(${k})`); }
    // la bouche : hauteur (bouche = ry de l'animatique), largeur (boucheL)
    const ry = clamp(num(o.bouche, 2), 0, 20), w = clamp(num(o.boucheL, 12), 4, 22);
    const cleB = f(ry) + ',' + f(w);
    if (F._bouche !== cleB) {
      F._bouche = cleB;
      const yc = 30 - 0.3 * ry, yb = 30 + ry * 1.25, yh = 30 - ry * 0.9;
      const dB = `M${f(-w)} ${f(yc)}C${f(-w)} ${f(yb)} ${f(w)} ${f(yb)} ${f(w)} ${f(yc)}C${f(w * 0.6)} ${f(yh)} ${f(-w * 0.6)} ${f(yh)} ${f(-w)} ${f(yc)}Z`;
      const yHaut = 0.25 * yc + 0.75 * yh, yBas = 0.25 * yc + 0.75 * yb;
      F.boucheD.setAttribute('d', dB);
      F.dents.setAttribute('display', ry > 2.6 ? 'inline' : 'none');
      F.langue.setAttribute('display', ry > 3.5 ? 'inline' : 'none');
      if (ry > 2.6) { F.dents.setAttribute('d', dB); F.dents.setAttribute('transform', `translate(0 ${f(yHaut)}) scale(0.9 ${f2(clamp(5.2 / Math.max(1, yBas - yHaut), 0.2, 0.62))}) translate(0 ${f(-yHaut)})`); }
      if (ry > 3.5) { F.langue.setAttribute('d', dB); F.langue.setAttribute('transform', `translate(0 ${f(yBas)}) scale(0.62 0.48) translate(0 ${f(-yBas)})`); }
      F.levre.setAttribute('d', `M${f(-w * 0.62)} ${f(30 + ry * 0.98 + 1.6)}Q0 ${f(30 + ry * 1.12 + 3.4)} ${f(w * 0.62)} ${f(30 + ry * 0.98 + 1.6)}`);
    }
    // la moustache : hérissée, fière, ou normale ; elle suit la bouche
    const mh = clamp(num(o.moustHaut, 0), 0, 1.3);
    const vm = p > 0.3 ? 'herissee' : mh > 0.3 ? 'fiere' : 'normale';
    if (F._moustCur !== vm) { if (F._moustCur) F.MOUST[F._moustCur].setAttribute('display', 'none'); F.MOUST[vm].setAttribute('display', 'inline'); F._moustCur = vm; }
    voir(F.poils, p > 0.45);
    const ondule = vent ? Math.sin(t * 17) * 0.04 : 0;
    poser(F.moustIn, 'transform', `translate(0 ${f(-ry * 0.16 - 3 * mh - 2 * p)}) scale(${f2(1 + 0.08 * mh + 0.08 * p + ondule)} ${f2(1 + 0.25 * p - 0.05 * mh)}) translate(0 ${f(-3 * p)})`);
    // les gouttes (la peur) glissent
    voir(F.gouttes, p > 0.5);
    if (p > 0.5) F.gts.forEach((g, i) => { const [x, y, k] = g.__pos; poser(g, 'transform', `translate(${x} ${f(y + ((t * 26 + i * 7) % 14))}) scale(${k})`); });
    // la casquette : pivote, s'envole ; son ombre sur le front s'efface
    const cy = num(o.casqY, 0), cr = num(o.casq, 0);
    poser(F.casq, 'transform', cy || cr ? `translate(0 ${f(cy)}) rotate(${f(cr)} 0 -40)` : '');
    poser(F.ombreCasq, 'fill-opacity', f2(0.85 * clamp(1 + cy / 8) * clamp(1 - Math.abs(cr) / 30)));
    voir(F.etoiles, !!o.etoiles);
    // la force : halo et rayons qui tournent
    const hal = clamp(num(o.halo, 0), 0, 1.2);
    voir(F.halo, hal > 0.01);
    if (hal > 0.01) { poser(F.halo, 'opacity', f2(hal)); poser(F.rayons, 'transform', `translate(0 -20) rotate(${f(t * 12 % 360)})`); }
    voir(F.eclats, num(o.eclats, 0) > 0);
    const tt = o.tete || 'translate(0 -96)';
    if (F.tete.getAttribute('transform') !== tt) F.tete.setAttribute('transform', tt);
  }

  /* ========================================================================
     VUE DE PROFIL — repère du corps (couché, tête vers +x, ventre vers +y) ;
     le dessin fixe est fait « debout » (x vers le ventre, y vers les pieds) puis tourné de 90°.
     ======================================================================== */
  const MAIN_PROFIL = 0.64;
  function brasProfil(parent, L1, L2, tons, mainTons) {
    const g = el('g', {}, parent);
    const haut = el('g', {}, g);
    el('path', { d: `M0 -11.6C${L1 * 0.4} -12 ${L1 * 0.75} -10.6 ${L1} -9.4L${L1} 9.4C${L1 * 0.75} 10.6 ${L1 * 0.4} 12 0 11.6A11.6 11.6 0 0 1 0 -11.6Z`, fill: tons.base }, haut);
    el('path', { d: `M1 4.4C${L1 * 0.4} 5.2 ${L1 * 0.75} 4.4 ${L1} 3.6L${L1} 9.4C${L1 * 0.75} 10.6 ${L1 * 0.4} 12 1 11.6Z`, fill: tons.ombre }, haut);
    el('circle', { cx: L1, cy: 0, r: 9.4, fill: tons.base }, haut);
    const avant = el('g', { transform: `translate(${L1} 0)` }, haut);
    const lav = L2 - 6;
    el('path', { d: `M0 -9.4C${lav * 0.45} -9.4 ${lav * 0.8} -8.6 ${lav} -8.2L${lav} 8.2C${lav * 0.8} 8.6 ${lav * 0.45} 9.4 0 9.4Z`, fill: tons.base }, avant);
    el('path', { d: `M0 3.6C${lav * 0.45} 4.2 ${lav * 0.8} 3.6 ${lav} 3.2L${lav} 8.2C${lav * 0.8} 8.6 ${lav * 0.45} 9.4 0 9.4Z`, fill: tons.ombre }, avant);
    el('path', { d: `M${lav - 4} -8.8L${lav + 1.6} -8.6L${lav + 1.6} 8.6L${lav - 4} 8.8Z`, fill: tons.poignet }, avant);
    const main = el('g', { transform: `translate(${f(lav + 0.6)} 0)` }, avant);
    const M = makeMain(main, MAINS_PROFIL, MAIN_PROFIL, mainTons);
    return { g, haut, avant, main, M };
  }
  function jambeProfil(parent, L1, L2, tons, tonsB) {
    const g = el('g', {}, parent);
    const cuisse = el('g', {}, g);
    el('path', { d: `M0 -14C${L1 * 0.35} -14 ${L1 * 0.7} -12.6 ${L1} -11.4L${L1} 11.4C${L1 * 0.7} 12.6 ${L1 * 0.35} 14 0 14A14 14 0 0 1 0 -14Z`, fill: tons.base }, cuisse);
    el('path', { d: `M1 5.4C${L1 * 0.35} 6 ${L1 * 0.7} 5.2 ${L1} 4.6L${L1} 11.4C${L1 * 0.7} 12.6 ${L1 * 0.35} 14 1 14Z`, fill: tons.ombre }, cuisse);
    el('circle', { cx: L1, cy: 0, r: 11.4, fill: tons.base }, cuisse);
    const tibia = el('g', { transform: `translate(${L1} 0)` }, cuisse);
    el('path', { d: `M0 -11.4C${L2 * 0.35} -11.2 ${L2 * 0.7} -10.2 ${L2 - 4} -9.8L${L2 - 4} 9.8C${L2 * 0.7} 10.2 ${L2 * 0.35} 11.2 0 11.4Z`, fill: tons.base }, tibia);
    el('path', { d: `M0 4.4C${L2 * 0.35} 4.8 ${L2 * 0.7} 4.2 ${L2 - 4} 4L${L2 - 4} 9.8C${L2 * 0.7} 10.2 ${L2 * 0.35} 11.2 0 11.4Z`, fill: tons.ombre }, tibia);
    // la botte : pied vers −y (devant), semelle à x ≈ L2 + 11
    const b = el('g', { transform: `translate(${L2} 0)` }, tibia);
    el('path', { d: 'M-10 -10.2L0 -10.6C2.4 -14 3.6 -21 5.4 -25.6C6.8 -29.4 10.4 -30 12.2 -26.6L12.6 8.4C12.6 11.2 9.8 12.2 6.4 11.8L-10 10.4Z', fill: tonsB.base }, b);
    el('path', { d: 'M1.6 -14.4C3.4 -19.6 4.6 -23.4 6.2 -26.2C7.6 -28 9.4 -28 10.4 -26.6C8.6 -24 6.4 -19.4 4.8 -13.6Z', fill: tonsB.clair }, b);
    el('path', { d: 'M9.6 -28.4C11.6 -28.6 12.6 -27.4 12.6 -26L12.9 8.6C12.9 11.2 10.4 12.4 7 12L7.4 -27Z', fill: C.semelle }, b);
    el('path', { d: 'M-10 -10.4L-4 -10.6L-4 10.6L-10 10.4Z', fill: tons.ombre }, b);
    return { g, cuisse, tibia, b };
  }

  function makeProfil(parent) {
    brancherHorloge();
    const G = el('g', { class: 'bd-profil' }, parent);
    const tonsLoin = { base: C.blouseOmbre, ombre: C.blouseNuit, poignet: C.blouseNuit };
    const tonsPres = { base: C.blouse, ombre: C.blouseOmbre, poignet: C.blouseOmbre };
    const pantLoin = { base: C.pantalonOmbre, ombre: '#2B2D31' }, pantPres = { base: C.pantalon, ombre: C.pantalonOmbre };
    const botteLoin = { base: C.botteOmbre, clair: C.botte }, bottePres = { base: C.botte, clair: C.botteClair };

    // l'arrière-plan du corps : jambe et bras lointains
    const jl = jambeProfil(G, 52, 48, pantLoin, botteLoin);
    const bl = brasProfil(G, 44, 40, tonsLoin, TONS_PEAU_LOIN);
    const jp = jambeProfil(G, 52, 50, pantPres, bottePres);

    // le corps, dessiné debout puis tourné
    const corps = el('g', { transform: 'rotate(90)' }, G);
    // la blouse
    el('path', { d: 'M-4 -108C8 -108 16 -104 20 -96C28 -86 30 -70 30 -56C31 -40 36 -24 34 -8C33 4 30 14 26 20L-30 20C-34 8 -36 -10 -37 -30C-38 -56 -36 -84 -28 -98C-22 -106 -12 -108 -4 -108Z', fill: C.blouse }, corps);
    el('path', { d: 'M-28 -98C-22 -106 -12 -108 -4 -108C-10 -100 -16 -86 -18 -66C-20 -40 -18 -10 -14 20L-30 20C-34 8 -36 -10 -37 -30C-38 -56 -36 -84 -28 -98Z', fill: C.blouseOmbre }, corps);
    el('path', { d: 'M14 -100C22 -92 26 -80 27 -66', fill: 'none', stroke: C.blouseClair, 'stroke-width': 3.4, 'stroke-linecap': 'round' }, corps);
    el('path', { d: 'M-30 14L26 14L26 20L-30 20Z', fill: C.blouseNuit }, corps);
    el('path', { d: 'M-4 -40C-3 -24 -2 -8 0 12M12 -30C13 -16 14 -2 15 12', fill: 'none', stroke: C.blouseOmbre, 'stroke-width': 2, 'stroke-linecap': 'round' }, corps);
    // le lien du tablier et son nœud dans le dos
    el('path', { d: 'M33 -12C10 -15 -18 -15 -36 -11', fill: 'none', stroke: C.tablierOmbre, 'stroke-width': 4, 'stroke-linecap': 'round' }, corps);
    const noeud = el('g', {}, corps);
    el('path', { d: 'M-36 -12C-44 -22 -52 -14 -46 -8C-43 -5 -39 -8 -36 -11Z', fill: C.tablier }, noeud);
    const liens = el('g', {}, noeud);
    el('path', { d: 'M-37 -10C-40 0 -41 10 -44 20L-40 20.6C-38 11 -36 1 -35 -9Z', fill: C.tablierOmbre }, liens);
    el('path', { d: 'M-36 -10C-34 0 -34 8 -32 16L-28.6 15.4C-30.6 7.6 -32 -1 -34 -10Z', fill: C.tablier }, liens);
    // le tablier devant le ventre ; le bas flotte au vent
    el('path', { d: 'M20 -82L6 -104', stroke: C.tablierOmbre, 'stroke-width': 3.6, 'stroke-linecap': 'round' }, corps);
    el('path', { d: 'M22 -84C29 -74 32 -60 33 -46C34 -34 40 -22 40 -8L34 -8C34 -22 29 -34 28 -46C27 -60 25 -72 18 -82Z', fill: C.tablier }, corps);
    el('path', { d: 'M22 -84C29 -74 32 -60 33 -46C34 -34 40 -22 40 -8L38 -8C37 -22 31.6 -34 30.6 -46C29.6 -60 27.4 -72 21 -83Z', fill: C.tablierClair }, corps);
    const bas = el('g', {}, corps);
    el('path', { d: 'M32 -10L41 -10C41.6 8 39.6 32 36.6 57.4L27.4 58.4C29.6 32 31.4 8 32 -10Z', fill: C.tablier }, bas);
    el('path', { d: 'M38 -10L41 -10C41.6 8 39.6 32 36.6 57.4L33.8 57.8C36.6 32 38.4 8 38 -10Z', fill: C.tablierClair }, bas);
    el('path', { d: 'M27.4 58.4L36.6 57.4L36.2 60.6L27.2 61.6Z', fill: C.tablierOmbre }, bas);
    el('path', { d: 'M33 4L39 4M31.8 26L37.6 26', stroke: C.couture, 'stroke-width': 0.9, 'stroke-dasharray': '2 2' }, bas);
    // le cou (reste attaché même quand la tête tourne beaucoup), puis le foulard
    el('path', { d: 'M-21 -96L-21 -122C-21 -128 1 -128 1 -122L1 -96Z', fill: C.peau2 }, corps);
    el('path', { d: 'M-24 -104C-12 -110 4 -109 12 -101C13 -97 10 -93 4 -93C-6 -95 -16 -97 -24 -96Z', fill: C.foulardOmbre }, corps);
    el('path', { d: 'M-22 -106C-12 -111 2 -110 10 -103C11 -100 8 -98 3 -98C-6 -100 -14 -101 -22 -100Z', fill: C.foulard }, corps);
    const pans = el('g', { transform: '' }, corps);
    const pan = el('g', {}, pans);
    el('path', { d: 'M6 -101C12 -96 18 -88 22 -78C19 -78 16 -79 13 -81C11 -88 8 -94 3 -98Z', fill: C.foulard }, pan);
    el('path', { d: 'M9 -94C14 -89 18 -84 22 -78C20.4 -78 18.8 -78.4 17.2 -79C15 -84 12 -89 9 -94Z', fill: C.foulardOmbre }, pan);
    el('path', { d: 'M4 -101C10 -104 13 -99 10 -95C7 -93 3 -96 4 -101Z', fill: C.foulardClair }, corps);

    // le sac kraft sur le dos : bretelles en papier torsadé, rabat plié, logo, anneau à tirer
    const sac = el('g', {}, G);
    const sacC = el('g', { transform: 'rotate(90)' }, sac);
    el('path', { d: 'M-31 -80C-24 -96 -6 -100 8 -94C18 -89 22 -78 20 -66', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 5.4, 'stroke-linecap': 'round' }, sacC);
    el('path', { d: 'M-29 -82C-22 -95 -6 -98.4 7 -92.6C16 -88 19.6 -78 18.4 -67', fill: 'none', stroke: C.sacClair, 'stroke-width': 1.5, 'stroke-linecap': 'round' }, sacC);
    el('path', { d: 'M-80 -82L-32 -84L-30 4L-78 6Z', fill: C.sac }, sacC);
    el('path', { d: 'M-80 -82L-66 -82.6L-64 5.4L-78 6Z', fill: C.sacOmbre }, sacC);
    el('path', { d: 'M-50 -83.4L-48.6 5', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 1.4 }, sacC);
    el('path', { d: 'M-78 6L-54 -10L-30 4Z', fill: C.sacOmbre, 'fill-opacity': 0.55 }, sacC);
    el('path', { d: 'M-30 -84L-34 4', fill: 'none', stroke: C.sacNuit, 'stroke-width': 2, 'stroke-opacity': 0.5 }, sacC);
    const rabatPos = el('g', {}, sacC);
    const rabat = el('g', {}, rabatPos);
    el('path', { d: 'M-82 -86L-30 -88L-30 -70C-46 -67 -64 -67 -82 -70Z', fill: C.sacOmbre }, rabat);
    el('path', { d: 'M-82 -86L-30 -88L-30 -84L-82 -82Z', fill: C.sacClair }, rabat);
    logo(sacC, -52, -38, 30);
    const poignee = el('g', {}, sacC);
    const pgIn = el('g', {}, poignee);
    el('path', { d: 'M-56 5L-56 13', stroke: C.sacNuit, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, pgIn);
    el('circle', { cx: -56, cy: 20, r: 7.4, fill: 'none', stroke: C.poignee, 'stroke-width': 4 }, pgIn);
    el('path', { d: 'M-61 16A6.6 6.6 0 0 1 -53 14', fill: 'none', stroke: '#D3EE86', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, pgIn);
    el('path', { d: 'M-31 -40C-18 -42 -2 -48 8 -58', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 5.4, 'stroke-linecap': 'round' }, sacC);

    // la tête de profil (repère : visage vers +x, crâne vers −y)
    const tete = el('g', {}, G);
    const tt = el('g', { transform: 'scale(1.16)' }, tete);
    el('path', { d: 'M-8 -31C10 -32 22 -26 25 -14C27 -9 28 -5 27 -2L26.4 10C27.6 16 27.2 23 23.6 28C18.6 32.4 6 32.4 -2 29C-10 26.4 -18 24 -24 18C-31 10 -33 -8 -28 -20C-24 -28 -17 -31 -8 -31Z', fill: C.peau }, tt);
    el('path', { d: 'M-28 -20C-33 -8 -31 10 -24 18C-18 24 -10 26.4 -2 29C-10 22 -16 12 -18 0C-20 -10 -18 -20 -12 -28C-18 -28 -24 -26 -28 -20Z', fill: C.peau2 }, tt);
    el('path', { d: 'M4 30.4C9 31.6 16 31.8 21 30', fill: 'none', stroke: C.peau3, 'stroke-width': 1.1, 'stroke-linecap': 'round', 'stroke-opacity': 0.45 }, tt);
    el('path', { d: 'M-8 -6C-2 -9 3 -4 2 3C1 9 -4 11 -7 8C-5 4 -6 -1 -8 -6Z', fill: C.peau }, tt);
    el('path', { d: 'M-5.4 -3C-2.4 -3.4 -0.6 0 -1.4 3.6', fill: 'none', stroke: C.peau3, 'stroke-width': 1.4, 'stroke-linecap': 'round' }, tt);
    el('ellipse', { cx: 11.4, cy: 6.4, rx: 7.4, ry: 5, fill: C.joue, 'fill-opacity': 0.5 }, tt);
    el('path', { d: 'M-30 -10C-34 -4 -33 4 -28 10C-26.4 6 -24 2 -21.6 0.6C-24 -3 -22 -7 -18 -9Z', fill: C.gris }, tt);
    el('path', { d: 'M-30 -10C-34 -4 -33 4 -28 10C-28.4 4 -28.4 -2 -26 -7Z', fill: C.grisOmbre }, tt);
    el('path', { d: 'M-1 -12.4C2.6 -9.4 4.4 -3.6 2.6 2.6C0.6 -0.6 -1.8 -4.6 -3.4 -10.6Z', fill: C.gris }, tt);
    el('path', { d: 'M0.4 -10.4C2.4 -7.6 3.2 -3.6 2.4 0.2', fill: 'none', stroke: C.grisClair, 'stroke-width': 1, 'stroke-linecap': 'round' }, tt);
    // l'œil, la paupière, le sourcil
    const oeil = el('g', {}, tt);
    const oeilO = el('g', { transform: 'translate(15.4 -4)' }, oeil);
    const oeilN = el('g', {}, oeilO);
    el('ellipse', { cx: 0, cy: 0, rx: 2.8, ry: 3.6, fill: C.oeil }, oeilN);
    el('circle', { cx: 1, cy: -1.4, r: 0.95, fill: '#FFF' }, oeilN);
    const oeilP = el('g', { display: 'none' }, oeilO);
    el('path', { d: 'M-3.4 -4.6C1 -6.4 5 -4 5.4 0C5.4 4.4 1.6 6.6 -2 5.2C-4 3.6 -4.6 -2.4 -3.4 -4.6Z', fill: C.blanc, stroke: C.peau3, 'stroke-width': 0.9 }, oeilP);
    el('circle', { cx: 2.4, cy: 0.4, r: 1.6, fill: C.oeil }, oeilP);
    const oeilF = el('path', { d: 'M11.6 -3.4Q15.4 -0.2 19.2 -3.4', fill: 'none', stroke: C.oeil, 'stroke-width': 1.8, 'stroke-linecap': 'round', display: 'none' }, oeil);
    el('path', { d: 'M11.4 1.6Q15 3.6 18.6 1.8', fill: 'none', stroke: C.peau3, 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-opacity': 0.5 }, tt);
    const sourcil = el('g', {}, tt);
    el('path', { d: 'M8 -11C11.4 -16.4 19.4 -17.2 25.4 -13C21.4 -13.6 14.4 -12.6 10 -8.8C8.8 -8.6 7.8 -9.6 8 -11Z', fill: C.sourcil }, sourcil);
    el('path', { d: 'M11 -12.6C14.6 -14.6 19 -15 23 -13.8', fill: 'none', stroke: '#8D8A91', 'stroke-width': 0.9, 'stroke-linecap': 'round' }, sourcil);
    // la bouche (sous la moustache) et la lèvre du bas
    const bouche = el('path', { fill: C.bouche }, tt);
    // la moustache en guidon : l'aile proche part de la joue, passe sous le nez et remonte en crochet devant
    const moust = el('g', {}, tt);
    const mIn = el('g', {}, moust);
    const pres = [[12, 13.4, 3], [18.4, 16.4, 5.6], [25.4, 18.6, 6.6], [32.4, 19.4, 6.2], [38.6, 18.4, 4.8], [43, 15.8, 3.3], [45.4, 12.2, 2.1], [45.8, 8.8, 1.15]];
    el('path', { d: ruban(pres), fill: C.gris }, mIn);
    el('path', { d: ruban(bandeB(pres, 0.3)), fill: C.grisOmbre }, mIn);
    el('path', { d: ruban(pres.slice(1, 4).map((q) => [q[0] + 1, q[1] - q[2] * 0.35, 0.6])), fill: C.grisClair }, mIn);
    el('path', { d: ruban(pres.slice(3, 7).map((q) => [q[0], q[1] - q[2] * 0.15, 0.5])), fill: C.grisClair, 'fill-opacity': 0.8 }, mIn);
    // le nez rond, posé sur la moustache
    el('path', { d: 'M25 -3C30 -2 37 0.6 38.6 7.4C39.8 13 34 16.4 28.4 14.4C26 11.4 25.8 4.6 25 -3Z', fill: C.nez }, tt);
    el('path', { d: 'M38.6 7.4C39.8 13 34 16.4 28.4 14.4C27.4 13.2 26.8 11.6 26.6 9.8C30 12.4 35.4 12.6 38.6 7.4Z', fill: C.nez2 }, tt);
    el('ellipse', { cx: 31.4, cy: 3.6, rx: 2.6, ry: 1.8, fill: C.nezClair }, tt);
    // la casquette de profil (visière vers +x)
    const casq = el('g', {}, tt);
    el('path', { d: 'M-31 -10C-35 -26 -20 -40 2 -41C22 -42 36 -34 40 -22C42 -17 40 -14 36 -13L-31 -10Z', fill: C.casq }, casq);
    el('path', { d: 'M-24 -30C-14 -38 0 -41 14 -40C4 -37 -8 -32 -16 -24C-20 -20 -22 -16 -23 -12L-31 -10C-32.4 -18 -29 -25 -24 -30Z', fill: C.casqClair }, casq);
    el('path', { d: 'M-31 -10C-33 -18 -31 -24 -28 -28C-28 -22 -27.6 -16 -26 -10.2Z', fill: C.casqOmbre }, casq);
    el('path', { d: 'M-31 -10L36 -13L36.4 -9.6L-30 -6.4Z', fill: C.casqNoir }, casq);
    el('path', { d: 'M20 -17C32 -19.4 46 -17.4 56 -11.4C58.4 -9.6 57.4 -7.4 53.6 -7.4C44 -9 32 -10 21 -10Z', fill: C.casqClair }, casq);
    el('path', { d: 'M21 -10C32 -10 44 -9 53.6 -7.4C57.4 -7.4 58.4 -9.6 56 -11.4C57 -8.6 55.6 -5.6 51.6 -5.8C42 -6.8 32 -7.6 21 -7.6Z', fill: C.casqNoir }, casq);
    el('ellipse', { cx: 2, cy: -41, rx: 4.6, ry: 2.4, fill: C.casqClair }, casq);
    el('path', { d: 'M6 -40C12 -30 14 -22 13 -14', fill: 'none', stroke: C.casqOmbre, 'stroke-width': 1.2, 'stroke-linecap': 'round' }, casq);

    // le bras proche, devant tout
    const bp = brasProfil(G, 44, 42, tonsPres, TONS_PEAU);
    const hp = bp.M.g;
    return { G, jl, bl, jp, corps, noeud, liens, bas, pans, pan, sac, rabat, poignee, pgIn, tete, oeil, oeilN, oeilP, oeilF, oeilO, sourcil, bouche, moust, mIn, casq, bp: bp.g, hp, BP: bp, BL: bl, _yeux: null };
  }

  function poseProfil(P, pose, t, avecSac = true) {
    t = num(t, 0);
    const A = (k, i, d) => (pose && Array.isArray(pose[k]) ? num(pose[k][i], d) : d);
    const bp = [A('bp', 0, 180), A('bp', 1, -10)], bl = [A('bl', 0, 180), A('bl', 1, -10)];
    const jp = [A('jp', 0, 175), A('jp', 1, 5)], jl = [A('jl', 0, 185), A('jl', 1, -5)];
    const tete = num(pose && pose.tete, 90), bouche = clamp(num(pose && pose.bouche, 0)), yeux = clamp(num(pose && pose.yeux, 1), 0, 2);
    const vent = clamp(num(pose && pose.vent, tete < 55 ? 1 : 0));
    const courbe = (v) => (v < 0.25 ? 'ouverte' : v < 0.7 ? 'demi' : 'poing');
    const membre = (M, px, py, a1, a2) => {
      poser(M.g, 'transform', `translate(${px} ${py}) rotate(${f(a1)})`);
      poser(M.tibia || M.avant, 'transform', `translate(${M.tibia ? 52 : 44} 0) rotate(${f(a2)})`);
    };
    membre(P.BP, 78, -6, bp[0], bp[1]);
    membre(P.BL, 70, -12, bl[0], bl[1]);
    membre(P.jp, -8, 8, jp[0], jp[1]);
    membre(P.jl, -4, 0, jl[0], jl[1]);
    formeMain(P.BP.M, courbe(num(pose && pose.mp, 0.4)));
    formeMain(P.BL.M, courbe(num(pose && pose.ml, 0.4)));
    const tt = `translate(128 -14) rotate(${f(tete)})`;
    if (P.tete.getAttribute('transform') !== tt) P.tete.setAttribute('transform', tt);
    // les yeux (0 fermés, 1 normaux, 2 exorbités) ; clignement
    const o = yeux * (yeux > 0.85 && yeux < 1.15 ? paupiere(t) : 1);
    const mode = o < 0.35 ? 'f' : o > 1.08 ? 'p' : 'n';
    if (P._yeux !== mode) { P._yeux = mode; voir(P.oeilN, mode === 'n'); voir(P.oeilP, mode === 'p'); voir(P.oeilF, mode === 'f'); }
    if (mode === 'n') poser(P.oeilN, 'transform', o < 0.98 ? `scale(1 ${f2(o)})` : '');
    if (mode === 'p') poser(P.oeilP, 'transform', `scale(${f2(0.8 + 0.3 * (yeux - 1))})`);
    poser(P.sourcil, 'transform', `translate(0 ${f(-3.4 * Math.max(0, yeux - 1) + 1.6 * Math.max(0, 0.6 - yeux))}) rotate(${f(-8 * Math.max(0, yeux - 1))} 16 -12)`);
    // la bouche : elle s'ouvre, mâche
    const ry = Math.min(7, 0.6 + 6 * bouche * (0.6 + 0.4 * Math.abs(Math.sin(t * 16))));
    poser(P.bouche, 'd', `M17.2 21.8C20.6 21.2 24.6 21.2 27.6 22C27.4 ${f(22.8 + ry)} 24 ${f(23.8 + ry * 1.1)} 20.2 ${f(23.2 + ry * 0.9)}C18.6 ${f(22.8 + ry * 0.6)} 17.4 ${f(22.4 + ry * 0.3)} 17.2 21.8Z`);
    // la moustache se dresse quand il a peur, ondule au vent
    poser(P.mIn, 'transform', `rotate(${f(-12 * Math.max(0, yeux - 1) + (vent ? Math.sin(t * 15) * 3 : 0))} 24 16)`);
    // le vent : bas du tablier, pans du foulard, liens du nœud, anneau du sac
    poser(P.bas, 'transform', vent ? `rotate(${f(18 * vent + Math.sin(t * 11) * 7 * vent)} 37 -9) skewY(${f(Math.sin(t * 13 + 1) * 4 * vent)})` : `rotate(${f(Math.sin(t * 1.4) * 1.2)} 37 -9)`);
    poser(P.pan, 'transform', `rotate(${f(-100 * vent + Math.sin(t * (vent ? 14 : 1.3)) * (vent ? 14 : 2))} 5 -99)`);
    if (!avecSac) poser(P.liens, 'transform', `rotate(${f(40 * vent + Math.sin(t * 12) * 10 * vent)} -36 -10)`); // le nœud n'est visible que sans le sac
    poser(P.pgIn, 'transform', `rotate(${f(Math.sin(t * (vent ? 9 : 2)) * (vent ? 18 : 5) + 30 * vent)} -56 5)`);
    const ds = avecSac ? 'inline' : 'none';
    if (P.sac.getAttribute('display') !== ds) P.sac.setAttribute('display', ds);
    // la main proche, dans le repère du corps (mêmes calculs que l'animatique)
    const r1 = bp[0] * RAD, r2 = (bp[0] + bp[1]) * RAD;
    return [78 + Math.cos(r1) * 44 + Math.cos(r2) * 42, -6 + Math.sin(r1) * 44 + Math.sin(r2) * 42];
  }

  /* ========================================================================
     VUE DE DOS — plongée verticale : la casquette, le dos, le sac, bras et jambes écartés
     ======================================================================== */
  const DOS = { L1: 46, L2: 50, AV: 42, T1: 50, T2: 44 };
  const MAIN_DOS = 0.86;
  function makeDos(parent) {
    brancherHorloge();
    const G = el('g', { class: 'bd-dos' }, parent);
    const tonsB = { base: C.blouse, ombre: C.blouseOmbre, clair: C.blouseClair, pli: C.blouseNuit, poignet: C.blouseOmbre };
    // les jambes (cuisse, tibia, botte vue de derrière)
    const jambe = () => {
      const g = el('g', {}, G);
      const cuisse = el('g', {}, g);
      el('path', { d: 'M0 -15C16 -15 34 -13.4 50 -12.4L50 12.4C34 13.4 16 15 0 15A15 15 0 0 1 0 -15Z', fill: C.pantalon }, cuisse);
      el('path', { d: 'M1 5.6C16 6.4 34 5.4 50 4.8L50 12.4C34 13.4 16 15 1 15Z', fill: C.pantalonOmbre }, cuisse);
      el('circle', { cx: 50, cy: 0, r: 12.4, fill: C.pantalon }, cuisse);
      const tibia = el('g', {}, g);
      el('path', { d: 'M0 -12.4C14 -12.2 28 -11 40 -10.4L40 10.4C28 11 14 12.2 0 12.4Z', fill: C.pantalon }, tibia);
      el('path', { d: 'M0 4.8C14 5.2 28 4.6 40 4.2L40 10.4C28 11 14 12.2 0 12.4Z', fill: C.pantalonOmbre }, tibia);
      const b = el('g', { transform: 'translate(40 0)' }, tibia);
      el('path', { d: 'M-2 -11.4C6 -12.4 14 -12.2 20 -10.6C26 -9 28 9 20 10.6C14 12.2 6 12.4 -2 11.4Z', fill: C.botte }, b);
      el('path', { d: 'M9 -11.8C14 -11.6 18 -11.2 20 -10.6C26 -9 28 9 20 10.6C18 11.2 14 11.6 9 11.8C13 6 13 -6 9 -11.8Z', fill: C.semelle }, b);
      el('path', { d: 'M-2 -11.4C2 -11.8 5 -12 8 -12L8 12C5 12 2 11.8 -2 11.4Z', fill: C.botteOmbre }, b);
      el('path', { d: 'M1 -7C3 -3 3 3 1 7', fill: 'none', stroke: C.botteClair, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, b);
      return { g, cuisse, tibia };
    };
    const JG = jambe(), JD = jambe();
    // les bras (manche, avant-bras, main ouverte vue de dessus)
    const bras = () => {
      const g = el('g', {}, G);
      const haut = el('g', {}, g);
      el('path', { d: 'M0 -13.4C16 -13.8 34 -12 46 -11L46 11C34 12 16 13.8 0 13.4A13.4 13.4 0 0 1 0 -13.4Z', fill: C.blouse }, haut);
      el('path', { d: 'M1 4.8C16 5.6 34 4.8 46 4L46 11C34 12 16 13.8 1 13.4Z', fill: C.blouseOmbre }, haut);
      el('circle', { cx: 46, cy: 0, r: 11, fill: C.blouse }, haut);
      const avant = el('g', {}, g);
      el('path', { d: 'M0 -11C14 -11 28 -10 42 -9.4L42 9.4C28 10 14 11 0 11Z', fill: C.blouse }, avant);
      el('path', { d: 'M1 4C14 4.6 28 4 42 3.6L42 9.4C28 10 14 11 1 11Z', fill: C.blouseOmbre }, avant);
      el('path', { d: 'M37 -9.8L44 -9.6L44 9.6L37 9.8Z', fill: C.blouseOmbre }, avant);
      const main = el('g', {}, g);
      const M = makeMain(main, MAINS_FACE, MAIN_DOS, TONS_PEAU);
      formeMain(M, 'ecartee');
      return { g, haut, avant, main, M };
    };
    const BG = bras(), BD = bras();
    // le dos de la blouse
    el('path', { d: 'M-50 -44C-57 -34 -57 -10 -51 14C-48 30 -49 46 -53 60C-30 67 30 67 53 60C49 46 48 30 51 14C57 -10 57 -34 50 -44C40 -58 18 -62 0 -62C-18 -62 -40 -58 -50 -44Z', fill: C.blouse }, G);
    el('path', { d: 'M30 -56C44 -52 52 -46 54 -36C57 -14 52 8 50 24C49 40 50 50 53 60C46 62 40 63 34 64C40 40 40 12 40 -12C40 -30 37 -46 30 -56Z', fill: C.blouseOmbre }, G);
    el('path', { d: 'M-46 -46C-38 -54 -26 -58 -14 -60C-26 -52 -36 -42 -42 -28C-46 -18 -48 -8 -50 2C-53 -14 -53 -30 -46 -46Z', fill: C.blouseClair }, G);
    const ourlet = el('g', {}, G);
    el('path', { d: 'M-53 56C-30 63 30 63 53 56L55 64C30 72 -30 72 -55 64Z', fill: C.blouseNuit }, ourlet);
    // le lien du tablier et son nœud au creux des reins
    el('path', { d: 'M-50 38C-30 41 -12 43 0 43C12 43 30 41 50 38', fill: 'none', stroke: C.tablierOmbre, 'stroke-width': 4.4, 'stroke-linecap': 'round' }, G);
    const noeud = el('g', {}, G);
    const lienG = el('g', {}, noeud), lienD = el('g', {}, noeud);
    el('path', { d: 'M-1 44C-4 52 -7 60 -11 67L-6.6 68.6C-3.4 61 -0.8 53 1.4 45Z', fill: C.tablierOmbre }, lienG);
    el('path', { d: 'M1 44C4 52 7 60 11 67L6.6 68.6C3.4 61 0.8 53 -1.4 45Z', fill: C.tablier }, lienD);
    el('path', { d: 'M0 43C-6 34 -18 34 -16 42C-14 48 -6 46 0 43Z', fill: C.tablier }, noeud);
    el('path', { d: 'M0 43C6 34 18 34 16 42C14 48 6 46 0 43Z', fill: C.tablierClair }, noeud);
    el('ellipse', { cx: 0, cy: 43.4, rx: 3.6, ry: 3, fill: C.tablierOmbre }, noeud);
    // le col, le foulard au cou
    el('path', { d: 'M-21 -61C-10 -66 10 -66 21 -61L19 -53C8 -57 -8 -57 -19 -53Z', fill: C.blouseOmbre }, G);
    el('path', { d: 'M-17 -63C-8 -67 8 -67 17 -63L15 -57C6 -60 -6 -60 -15 -57Z', fill: C.foulard }, G);
    // le sac
    const sac = el('g', {}, G);
    el('path', { d: 'M-40 -46C-46 -56 -46 -62 -40 -64', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 5, 'stroke-linecap': 'round' }, sac);
    el('path', { d: 'M40 -46C46 -56 46 -62 40 -64', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 5, 'stroke-linecap': 'round' }, sac);
    el('path', { d: 'M-36 -10C-44 -14 -50 -18 -54 -24M36 -10C44 -14 50 -18 54 -24', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 5, 'stroke-linecap': 'round' }, sac);
    el('path', { d: 'M-36 -10C-44 -14 -50 -18 -54 -24M36 -10C44 -14 50 -18 54 -24M-40 -46C-46 -56 -46 -62 -40 -64M40 -46C46 -56 46 -62 40 -64', fill: 'none', stroke: C.sacClair, 'stroke-width': 1.6, 'stroke-dasharray': '2.4 3.2', 'stroke-linecap': 'round' }, sac);
    el('path', { d: 'M-37 -44L37 -44C39 -44 40 -43 40 -41L39 34C39 37 37 38 34 38L-34 38C-37 38 -39 37 -39 34L-40 -41C-40 -43 -39 -44 -37 -44Z', fill: C.sac }, sac);
    el('path', { d: 'M26 -44L37 -44C39 -44 40 -43 40 -41L39 34C39 37 37 38 34 38L28 38C30 14 30 -18 26 -44Z', fill: C.sacOmbre }, sac);
    el('path', { d: 'M-39 32L39 32L39 34C39 37 37 38 34 38L-34 38C-37 38 -39 37 -39 34Z', fill: C.sacOmbre }, sac);
    el('path', { d: 'M-40 -44L40 -44L39.6 -18L-39.6 -18Z', fill: C.sacDedans }, sac); // l'ouverture (sous le rabat)
    el('path', { d: 'M-34 -24C-20 -28 -6 -22 6 -27C16 -31 28 -26 34 -28L34 -18L-34 -18Z', fill: '#8A6A44' }, sac);
    logo(sac, 0, 8, 34);
    // le rabat : charnière à y = −25 dans son repère (placée à y = −44 sur le sac), il se rabat vers la caméra
    const rabatPos = el('g', { transform: 'translate(0 -19)' }, sac);
    const rabat = el('g', {}, rabatPos);
    el('path', { d: 'M-41 -25L41 -25L40.6 -2C40.6 0.6 38.6 1.8 36 1.8L-36 1.8C-38.6 1.8 -40.6 0.6 -40.6 -2Z', fill: C.sacClair }, rabat);
    el('path', { d: 'M-40.6 -5L40.6 -5L40.6 -2C40.6 0.6 38.6 1.8 36 1.8L-36 1.8C-38.6 1.8 -40.6 0.6 -40.6 -2Z', fill: C.sacOmbre }, rabat);
    el('path', { d: 'M-41 -25L41 -25L41 -21.6L-41 -21.6Z', fill: C.sacOmbre, 'fill-opacity': 0.6 }, rabat);
    el('path', { d: 'M-28 -12C-14 -13.4 14 -13.4 28 -12', fill: 'none', stroke: C.sacOmbre, 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, rabat);
    // l'anneau à tirer
    const poignee = el('g', {}, sac);
    el('path', { d: 'M39 14L45 16', stroke: C.sacNuit, 'stroke-width': 2.4, 'stroke-linecap': 'round' }, poignee);
    el('circle', { cx: 50, cy: 18, r: 6.6, fill: 'none', stroke: C.poignee, 'stroke-width': 3.8 }, poignee);
    // la tête vue de dessus : cheveux de la nuque, oreilles, bouts de moustache, casquette
    const tete = el('g', {}, G);
    el('path', { d: 'M-24 -64C-16 -55 16 -55 24 -64C22 -58 12 -52 0 -52C-12 -52 -22 -58 -24 -64Z', fill: C.gris }, tete);
    el('path', { d: 'M-18 -58C-10 -54 10 -54 18 -58C12 -54 6 -53 0 -53C-6 -53 -12 -54 -18 -58Z', fill: C.grisOmbre }, tete);
    [-1, 1].forEach((s) => {
      el('path', { d: `M${s * 26} -84C${s * 33} -86 ${s * 35} -76 ${s * 29} -72Z`, fill: C.peau2 }, tete);
    });
    const moustG = el('g', {}, tete), moustD = el('g', {}, tete);
    [[moustG, -1], [moustD, 1]].forEach(([g, s]) => {
      const pts = [[s * 26, -80, 4.2], [s * 34, -80.6, 3.4], [s * 40, -84, 2.5], [s * 41.6, -89.6, 1.7], [s * 38.6, -92.6, 1.1]];
      el('path', { d: ruban(pts), fill: C.gris }, g);
      el('path', { d: ruban(s > 0 ? bandeA(pts, 0.45) : bandeB(pts, 0.45)), fill: C.grisOmbre }, g);
    });
    el('ellipse', { cx: 0, cy: -84, rx: 32, ry: 30.5, fill: C.casq }, tete);
    el('path', { d: 'M-2 -114.4C14 -113 30 -102 31.6 -86C32.8 -72 24 -60 10 -55.6C22 -64 26 -76 24 -88C22 -100 12 -110 -2 -114.4Z', fill: C.casqOmbre }, tete);
    el('path', { d: 'M-30 -92C-26 -104 -14 -112 -2 -113.6C-14 -106 -22 -98 -25 -86C-27 -78 -26 -70 -22 -63C-30 -70 -33 -82 -30 -92Z', fill: C.casqClair }, tete);
    el('path', { d: 'M-2 -86L-22 -107M-2 -86L20 -108M-2 -86L-31 -78M-2 -86L30 -76M-2 -86L-4 -54', fill: 'none', stroke: C.casqOmbre, 'stroke-width': 1.2, 'stroke-linecap': 'round' }, tete);
    el('path', { d: 'M-24 -106C-14 -122 14 -122 24 -106C14 -110 -14 -110 -24 -106Z', fill: C.casqNoir }, tete);
    el('path', { d: 'M-22 -109C-12 -120 12 -120 22 -109C12 -112 -12 -112 -22 -109Z', fill: C.casqClair }, tete);
    el('circle', { cx: -2, cy: -86, r: 4.2, fill: C.casqClair }, tete);
    el('circle', { cx: -1.2, cy: -85.2, r: 2, fill: C.casqOmbre }, tete);
    return { G, bras: BG.g, jambes: JG.g, BG, BD, JG, JD, mg: BG.M.g, md: BD.M.g, pg: JG.g, pd: JD.g, sac, rabat, poignee, tete, ourlet, lienG, lienD, moustG, moustD };
  }

  function poseDos(D, t, ecart = 1, battre = 0) {
    t = num(t, 0); ecart = num(ecart, 1); battre = num(battre, 0);
    const a = Math.sin(t * 6) * 6 * (1 + battre * 3);
    const bx = 110 * ecart, by = -30 + a;
    const unBras = (B, sx, sy, hx, hy, cote) => {
      // le coude part en arrière (vers les pieds) et vers l'extérieur
      const dx = hx - sx, dy = hy - sy, d = Math.hypot(dx, dy) || 0.001, th = Math.atan2(dy, dx);
      let phi, k = 1;
      if (d >= DOS.L1 + DOS.L2) { phi = th; k = d / (DOS.L1 + DOS.L2); }
      else {
        const al = Math.acos(clamp((DOS.L1 * DOS.L1 + d * d - DOS.L2 * DOS.L2) / (2 * DOS.L1 * d), -1, 1));
        const s1 = Math.cos(th - al) * cote * 0.5 + Math.sin(th - al), s2 = Math.cos(th + al) * cote * 0.5 + Math.sin(th + al);
        phi = s2 > s1 ? th + al : th - al;
      }
      const ex = sx + Math.cos(phi) * DOS.L1 * k, ey = sy + Math.sin(phi) * DOS.L1 * k;
      const a2 = Math.atan2(hy - ey, hx - ex), l = Math.hypot(hx - ex, hy - ey);
      const s = cote;
      poser(B.haut, 'transform', `translate(${f(sx)} ${f(sy)}) rotate(${f(phi / RAD)}) scale(${f2(k)} ${s})`);
      poser(B.avant, 'transform', `translate(${f(ex)} ${f(ey)}) rotate(${f(a2 / RAD)}) scale(${f2(Math.max(0.3, (l - 8 * MAIN_DOS) / DOS.AV))} ${s})`);
      const flip = -Math.sin(a2) * -cote >= 0 ? 1 : -1;
      const fl = Math.sin(t * 9 + cote) * 5 * (1 + battre);
      poser(B.main, 'transform', `translate(${f(hx)} ${f(hy)}) rotate(${f(a2 / RAD + fl)}) scale(1 ${flip}) translate(${f(-8 * MAIN_DOS)} 0)`);
    };
    unBras(D.BG, -44, -40, -bx, by - 40, -1);
    unBras(D.BD, 44, -40, bx, -by - 100, 1);
    const jx = 62 * ecart, j = Math.cos(t * 5) * 8;
    const uneJambe = (J, hx, hy, ax, ay, cote) => {
      const dx = ax - hx, dy = ay - hy, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
      let phi = th, k = 1;
      if (d >= DOS.T1 + DOS.T2) k = d / (DOS.T1 + DOS.T2);
      else { const al = Math.acos(clamp((DOS.T1 * DOS.T1 + d * d - DOS.T2 * DOS.T2) / (2 * DOS.T1 * d), -1, 1)); phi = th - al * cote; }
      const kx = hx + Math.cos(phi) * DOS.T1 * k, ky = hy + Math.sin(phi) * DOS.T1 * k;
      const a2 = Math.atan2(ay - ky, ax - kx);
      poser(J.cuisse, 'transform', `translate(${f(hx)} ${f(hy)}) rotate(${f(phi / RAD)}) scale(${f2(k)} ${cote})`);
      poser(J.tibia, 'transform', `translate(${f(kx)} ${f(ky)}) rotate(${f(a2 / RAD)}) scale(${f2(Math.max(0.3, Math.hypot(ax - kx, ay - ky) / 40))} ${cote})`);
    };
    uneJambe(D.JG, -22, 50, -jx, 130 + j, -1);
    uneJambe(D.JD, 22, 50, jx, 130 - j, 1);
    // le vent : ourlet de la blouse, liens du tablier, bouts de moustache
    poser(D.ourlet, 'transform', `translate(0 ${f(Math.sin(t * 13) * 1.6)}) scale(${f2(1 + Math.sin(t * 11) * 0.02)} 1)`);
    poser(D.lienG, 'transform', `rotate(${f(Math.sin(t * 14) * 16 + 10)} 0 44)`);
    poser(D.lienD, 'transform', `rotate(${f(Math.sin(t * 12 + 1) * 16 - 10)} 0 44)`);
    poser(D.moustG, 'transform', `rotate(${f(Math.sin(t * 16) * 6)} -26 -80)`);
    poser(D.moustD, 'transform', `rotate(${f(-Math.sin(t * 15 + 1) * 6)} 26 -80)`);
  }

  /* ---------- les poses de profil (angles dans le repère du corps, comme l'animatique) ----------
     En plus : mp / ml = main proche / lointaine (0 ouverte → 1 fermée), vent = 0..1 (tablier, foulard). */
  const POSES = {
    chute: { bp: [55, -95], bl: [70, -100], jp: [165, 95], jl: [175, 100], tete: 0, bouche: 0, yeux: 1, mp: 0.1, ml: 0.1, vent: 1 },
    tire: { bp: [-125, -60], bl: [70, -100], jp: [165, 95], jl: [175, 100], tete: -8, bouche: 0.2, yeux: 1, mp: 1, ml: 0.1, vent: 1 },
    nage: { bp: [-20, -10], bl: [10, 10], jp: [170, 60], jl: [185, 70], tete: -6, bouche: 0.4, yeux: 1.4, mp: 0, ml: 0, vent: 1 },
    mange: { bp: [60, -150], bl: [75, -140], jp: [165, 90], jl: [175, 95], tete: 4, bouche: 0.8, yeux: 0.6, mp: 0.8, ml: 0.8, vent: 1 },
    boit: { bp: [30, -135], bl: [70, -100], jp: [165, 90], jl: [175, 95], tete: -18, bouche: 0.5, yeux: 0.2, mp: 0.8, ml: 0.3, vent: 1 },
    assis: { bp: [100, -40], bl: [95, -30], jp: [180, 90], jl: [176, 92], tete: 90, bouche: 0.1, yeux: 1.2, mp: 0, ml: 0.4, vent: 0 },
    debout: { bp: [178, -14], bl: [184, -10], jp: [175, 5], jl: [185, -5], tete: 90, bouche: 0.2, yeux: 1, mp: 0.45, ml: 0.45, vent: 0 },
    salut: { bp: [49, -41], bl: [184, -10], jp: [175, 5], jl: [185, -5], tete: 80, bouche: 0.6, yeux: 1, mp: 0, ml: 0.45, vent: 0.2 },
    plonge: { bp: [-20, -10], bl: [-30, -10], jp: [160, 20], jl: [200, -20], tete: 10, bouche: 0.8, yeux: 1.6, mp: 0, ml: 0, vent: 1 },
    tend: { bp: [-5, -5], bl: [5, 5], jp: [175, 40], jl: [190, 30], tete: -4, bouche: 0.6, yeux: 1.5, mp: 0, ml: 0, vent: 1 },
    calin: { bp: [70, -165], bl: [80, -160], jp: [165, 90], jl: [175, 95], tete: -10, bouche: 0.9, yeux: 1.2, mp: 0.9, ml: 0.9, vent: 1 },
  };

  // une main seule, pour les plans qui dessinent eux-mêmes un bras (la main qui tâtonne, les mains en vue subjective) :
  // poignet à l'origine, doigts vers +x, pouce du côté +y (vue 'face') ou −y (vue 'profil') ; m.forme('poing') la change
  function main(parent, forme = 'ouverte', { vue = 'face', echelle = 1 } = {}) {
    const M = makeMain(parent, vue === 'profil' ? MAINS_PROFIL : MAINS_FACE, echelle, TONS_PEAU);
    formeMain(M, forme);
    return { g: M.g, forme: (nom) => formeMain(M, nom) };
  }

  BB.BougnatDessin = { makeProfil, poseProfil, makeDos, poseDos, makeFace, poseFace, POSES, ANCRE_CORDON, pointeVisiere, main, C };
})();
