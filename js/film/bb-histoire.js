/* ==========================================================================
   Bougnat Burger — le film de l'accueil : « Le bougnat s'est trompé de sac ».
   DEUXIÈME PASSE (graphismes) : les décors, les objets et les effets sont dessinés en SVG détaillé,
   dans l'esprit des affiches de voyage d'Auvergne des années 1930 revues au goût du jour : aplats nets,
   dégradés doux, lumière dorée du couchant (le soleil est à l'ouest : à gauche sur la carte comme au sol).
   Le découpage validé de l'animatique ne bouge pas : plans, minutage, cadrages, angles et rythme.

   Découpage (31 s, en boucle) — voir PLANS plus bas :
     L'avion   1 Survol (vue de dessus) · 2 Le hublot · 3 Les deux sacs (plongée) · 4 Le saut
     La chute  5 Chute libre (plongée verticale) · 6 La poignée (contre-plongée) · 7 Un menu ! (plongée)
               8 Oh non ! (gros plan, zoom brutal) · 9 Tout attraper (caméra qui tourne)
               10 Tout manger (face) · 11 La force ! (contre-plongée) · 12 Le sol ! (vue subjective)
               13 Boum (au ras du sol)
     À terre   14 Indemne · 15 La dernière (contre-plongée) · 16 Crunch (gros plan) · 17 Iris
   Le personnage vient de js/film/bb-bougnat-dessin.js (BB.BougnatDessin) quand il est chargé ; sinon,
   la version de l'animatique plus bas (makeProfil, makeDos, makeFace… mêmes conventions de repère).
   Performances : tout le décor est construit une seule fois (chemins composés, dégradés, aucun filtre) ;
   à chaque image on ne fait que déplacer, tourner, mettre à l'échelle ou fondre des groupes, et un
   attribut n'est réécrit que s'il a changé. La carte vue du ciel (des milliers de formes) est découpée en
   cellules, puis rasterisée une fois dans des toiles posées sous le SVG et bougées par le compositeur
   (voir _carteCalque) ; l'iris reste fermé le temps de cette préparation (une demi-seconde environ).
   Scène : viewBox 600 × 780 (le cadre du film sur téléphone), rognée en « cover » ailleurs.
   API : const h = new BB.Histoire(host); h.start(); h.stop(); h.seek(t); h.setSpeed(k); h.destroy();
         h.duration ; BB.Histoire.PLANS ; h.onEvent = (type, t) => {} ; h.onPlan = (i, plan) => {}
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const NS = 'http://www.w3.org/2000/svg';
  const W = 600, H = 780;

  /* ---------- outils ---------- */
  const el = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const ease = (t) => t * t * (3 - 2 * t);
  const easeIn = (t) => t * t * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const back = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const f = (n) => Math.round(n * 10) / 10;
  const tr = (x, y, r = 0, s = 1) => `translate(${f(x)} ${f(y)}) rotate(${f(r)}) scale(${Math.round(s * 1000) / 1000})`;
  // un attribut n'est réécrit que s'il change : moins d'invalidations de style et de peinture à chaque image
  const setA = (e, k, v) => { const c = e._bb || (e._bb = {}); if (c[k] !== v) { c[k] = v; e.setAttribute(k, v); } };
  const show = (e, on) => setA(e, 'display', on ? 'inline' : 'none');
  const place = (e, x, y, r = 0, s = 1) => setA(e, 'transform', tr(x, y, r, s));
  const fondu = (e, v) => setA(e, 'opacity', String(Math.round(clamp(v) * 100) / 100));
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const TAU = Math.PI * 2;
  const pt = (x, y) => `${f(x)} ${f(y)}`;
  const poly = (p) => 'M' + p.map((q) => pt(q[0], q[1])).join('L') + 'Z';
  const cercle = (x, y, r) => `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  const aireS = (p) => { let a = 0; for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; };
  const centre = (p) => { let x = 0, y = 0; p.forEach((q) => { x += q[0]; y += q[1]; }); return [x / p.length, y / p.length]; };
  const pick = (a, r) => a[Math.floor(r() * a.length) % a.length];
  // courbe lisse (Catmull-Rom → Bézier) passant par des points
  function lisse(p, ferme = true, k = 1) {
    const n = p.length;
    if (n < 3) return poly(p);
    const P = (i) => p[ferme ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
    let d = `M${pt(p[0][0], p[0][1])}`;
    const m = ferme ? n : n - 1;
    for (let i = 0; i < m; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      d += `C${pt(p1[0] + ((p2[0] - p0[0]) / 6) * k, p1[1] + ((p2[1] - p0[1]) / 6) * k)} ${pt(p2[0] - ((p3[0] - p1[0]) / 6) * k, p2[1] - ((p3[1] - p1[1]) / 6) * k)} ${pt(p2[0], p2[1])}`;
    }
    return ferme ? d + 'Z' : d;
  }
  // points d'une forme ronde irrégulière (tache, bosquet, bois)
  function tache(cx, cy, rx, ry, n, jit, r, rot = 0) {
    const c = Math.cos((rot * Math.PI) / 180), s = Math.sin((rot * Math.PI) / 180), o = [], ph = r() * TAU;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, k = 1 + (r() - 0.5) * 2 * jit + Math.sin(a * 2 + ph) * jit * 0.5;
      const x = Math.cos(a) * rx * k, y = Math.sin(a) * ry * k;
      o.push([cx + x * c - y * s, cy + x * s + y * c]);
    }
    return o;
  }
  // rééchantillonne un contour fermé environ tous les « pas »
  function reech(p, pas, r) {
    const o = [];
    let reste = 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = reste;
      while (d < L) { o.push([a[0] + ((b[0] - a[0]) * d) / L, a[1] + ((b[1] - a[1]) * d) / L]); d += pas * (0.7 + r() * 0.6); }
      reste = d - L;
    }
    return o;
  }
  // contour festonné : chaque tronçon devient une bosse vers l'extérieur (lisière, houppiers, fumée)
  function feston(p, pas, amp, r) {
    const q = reech(p, pas, r);
    if (q.length < 3) return lisse(p);
    const s = aireS(q) > 0 ? 1 : -1;
    let d = `M${pt(q[0][0], q[0][1])}`;
    for (let i = 0; i < q.length; i++) {
      const a = q[i], b = q[(i + 1) % q.length];
      const h = amp * (0.55 + r() * 0.9);
      d += `Q${pt((a[0] + b[0]) / 2 + s * (b[1] - a[1]) * h, (a[1] + b[1]) / 2 - s * (b[0] - a[0]) * h)} ${pt(b[0], b[1])}`;
    }
    return d + 'Z';
  }
  // points denses le long d'une courbe de Catmull-Rom ouverte (routes, ruisseau)
  function spline(p, pas = 8) {
    const o = [];
    for (let i = 0; i < p.length - 1; i++) {
      const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
      const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / pas));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const c = (a, b, cc, d) => 0.5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
        o.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
      }
    }
    o.push(p[p.length - 1]);
    return o;
  }
  const trace = (p) => 'M' + p.map((q) => pt(q[0], q[1])).join('L');

  /* ---------- le découpage ---------- */
  const PLANS = [
    { t: 0.0, id: 'survol', titre: 'Au-dessus des Puys', cadre: 'plan d\'ensemble · vue de dessus', txt: 'Iris qui s\'ouvre. Vue du ciel : la chaîne des Puys, le cratère du Pariou, le puy de Dôme et son antenne ; un petit avion traverse le cadre, son ombre glisse sur les prés.' },
    { t: 2.6, id: 'hublot', titre: 'Le hublot', cadre: 'plan rapproché · intérieur', txt: 'Dans l\'avion, le bougnat a le nez collé au hublot. Les Puys défilent en dessous ; la buée de son souffle sur la vitre.' },
    { t: 4.8, id: 'sacs', titre: 'Les deux sacs', cadre: 'insert · plongée', txt: 'Sur la banquette, son parachute et son sac à emporter Bougnat Burger. Sans quitter le hublot des yeux, sa main tâtonne… et prend le mauvais.' },
    { t: 6.6, id: 'saut', titre: 'Le saut', cadre: 'plan large · porte ouverte', txt: 'À la porte ouverte, le vent. Il salue de la casquette et saute ; il rapetisse vers les Puys.' },
    { t: 8.6, id: 'chute', titre: 'Chute libre', cadre: 'plongée verticale', txt: 'Vu d\'au-dessus : son dos, le sac, bras et jambes écartés ; les nuages passent sous lui, le sol est loin.' },
    { t: 10.6, id: 'poignee', titre: 'La poignée', cadre: 'contre-plongée', txt: 'Vu d\'en dessous, sur le ciel : sûr de lui, il tire la poignée.' },
    { t: 12.2, id: 'menu', titre: 'Un menu !', cadre: 'plongée', txt: 'Le sac s\'ouvre : pas de parachute, un burger, des frites et une boisson s\'envolent vers nous.' },
    { t: 13.8, id: 'peur', titre: 'Oh non !', cadre: 'gros plan · zoom brutal', txt: 'Il comprend : pas de parachute. Les yeux lui sortent de la tête, la moustache se dresse, la casquette décolle ; l\'image tremble.' },
    { t: 15.2, id: 'tout', titre: 'Tout attraper', cadre: 'plan moyen · caméra qui tourne', txt: 'Il fonce en courbe, rafle le burger, les frites et la boisson d\'un seul geste et les serre dans ses bras.' },
    { t: 17.2, id: 'mange', titre: 'Tout manger', cadre: 'plan rapproché · face', txt: 'Il engloutit tout à toute vitesse : bouchées, frites, une gorgée ; les joues gonflent, les miettes volent.' },
    { t: 18.6, id: 'force', titre: 'La force !', cadre: 'contre-plongée', txt: 'Repu, il gonfle les muscles : la moustache se relève, un halo doré l\'entoure, des étincelles. Il est paré pour l\'atterrissage.' },
    { t: 20.0, id: 'sol', titre: 'Le sol !', cadre: 'vue subjective', txt: 'Par ses yeux : le pré et le puy de Dôme foncent vers nous, ses mains en avant.' },
    { t: 21.8, id: 'boum', titre: 'Boum', cadre: 'plan large · au ras du sol', txt: 'Au ras de l\'herbe, le puy de Dôme au fond : il tombe dans le pré, gros nuage de fumée, l\'image tremble.' },
    { t: 22.8, id: 'indemne', titre: 'Indemne', cadre: 'plan moyen', txt: 'La fumée retombe : il est debout dans son petit cratère, casquette de travers, étoiles ; il se secoue, pouce levé.' },
    { t: 25.0, id: 'derniere', titre: 'La dernière', cadre: 'contre-plongée', txt: 'Vu de ses pieds : une dernière frite tombe du ciel et lui rebondit sur la casquette.' },
    { t: 26.6, id: 'crunch', titre: 'Crunch', cadre: 'gros plan', txt: 'Il prend la frite, la regarde, la croque, aux anges.' },
    { t: 29.4, id: 'iris', titre: 'Iris', cadre: 'gros plan', txt: 'Le cercle noir se referme sur lui.' },
  ];
  const DUREE = 31.0;

  // les événements sonores (js/bb-film-sound.js) ; « avion », « vent » et « etincelle » sont nouveaux
  const EVENTS = [
    [0.3, 'avion'], [5.7, 'attrape'], [6.75, 'vent'], [7.9, 'chute'], [11.3, 'poignee'], [12.35, 'ouvre'], [12.45, 'envol'],
    [13.85, 'peur'], [15.75, 'attrape'], [16.2, 'attrape'], [16.6, 'attrape'],
    [17.3, 'bouchee'], [17.55, 'bouchee'], [17.85, 'croque'], [18.05, 'croque'], [18.25, 'gloups'], [18.4, 'pschitt'],
    [18.75, 'force'], [19.05, 'etincelle'], [19.45, 'etincelle'], [20.1, 'chute'], [21.8, 'boum'], [23.9, 'pouce'], [25.95, 'toc'], [27.9, 'crunch'], [29.4, 'iris'],
  ];

  /* ---------- la palette ---------- */
  const C = {
    // la marque
    charbon: '#1A130F', creme: '#F5EAD4', vert: '#96C124', pomme: '#C8E3A0', olive: '#7C8A3A', olive2: '#5D6A2A', olive3: '#3F4A1C',
    peche: '#F2B48C', rose: '#E7B8AC', or: '#F9DE9E', bleu: '#9FBBCB',
    // le personnage de l'animatique (repli) : mêmes teintes que la fiche du bougnat
    peau: '#E9A57F', joue: '#E08A68', nez: '#DB9A7A', moust: '#3A2417', casq: '#3F464C', casq2: '#4E5459',
    blouse: '#3B527A', blouse2: '#2F4369', foulard: '#C8E3A0', pantalon: '#3E3B38', botte: '#5A3A24',
    sac: '#C9A274', sac2: '#A9824F', logo: '#96C124', poignee: '#96C124', etoile: '#F9DE9E', noir: '#0B0806',
    trait: '#FFF6E6', fumee: '#E6DCCB', fumee2: '#BFB19C',
    pain: '#D69049', frite: '#F4C95D',
  };

  // le logo officiel (volcan vert, contour blanc au pinceau), simplifié depuis js/bb-logo.js : 100 unités de large, centré
  const LOGO_V = 'M-44.2 21 -43.4 24 -38.8 25.3 -38.8 25.9 -40.6 26.3 -35.3 26.5 -31.1 24.5 -28.7 24.9 -26 22.8 -19.9 21.9 -17.2 20.5 -18.6 20.2 -18.5 19.6 -16.5 19 -16 19.7 -14.6 19.4 -13 17.1 -6.1 13.9 4.5 13.8 7 12.8 9.7 13.9 11.2 12.4 16.9 13.6 18.7 12.8 23.5 12.9 27.3 13.8 30.4 13.2 32.4 14.1 33.1 13.3 35.5 13.4 29 6.3 25.6 5 25.9 3.9 24.3 3.2 23.5 1.8 21.5 1.1 17.5 -3.5 17.6 -5.2 18.4 -4.5 3.5 -18.5 3.9 -17.8 1.4 -16.3 -2.2 -15.3 -11.6 -15.1 -17 -18.5 -19.5 -23.6 -20.5 -27.8 -21.5 -28.1 -26.8 -19.6 -30.4 -10.9 -32.7 -8.8 -32.9 -5.5 -33.8 -5.1 -35.3 -2.9 -34.7 -2.3 -34.9 -1.1 -35.6 -0.9 -36 -1.7 -37.6 0.2 -39.9 5 -41.7 9.5 -41.7 10.6 -40.8 11.1 -42.2 16 -43.6 15.8 -42.7 18.5 -43.2 19.1 -44 18.6ZM-37.6 2.7 -37.5 3.6 -38.8 5.4 -38.5 2.9Z';
  const LOGO_B = 'M-42.5 30.9 -40.5 31.8 -37.5 31.7ZM-41.4 24.9 -38.3 26 -35.8 25.4ZM-15.8 19 -18.4 19.7 -20.5 21.1 -16.9 20ZM-45.9 12.5 -47 15.2 -47.4 20.1ZM-1.4 13 6 12.7 -0.2 12.3ZM-45.8 9.2 -46.8 10.7 -48.7 17.8 -48.7 23.6 -46.6 27.8 -42.7 29.9 -46.4 25.7 -48 20.5 -47.9 16.1ZM-40.2 -4 -41.4 -1.9 -41 -1.2 -42.1 1.8 -39.7 -3.2ZM8.4 -11.5 9.9 -10 10.5 -10.4 12.3 -9 9.1 -12ZM-46.4 22.1 -45.4 26.1 -41.2 29.2 -37.5 29 -38.2 30 -34.6 29.8 -36.7 29.8 -37.2 29.2 -34.8 29.1 -33.8 28.4 -33.1 29 -26.2 27.3 -27.9 30.1 -31.6 30.9 -32.9 30.2 -34.5 31.4 -37.2 31.7 -34.1 31.8 -28.3 30.5 -26.3 28.7 -21.3 26 -21.3 26.8 -23 28 -20.3 27.2 -19.5 25.6 -14.4 24.3 -10.3 21.7 -9.6 22 -9.5 21.3 -6.5 20.4 -2.7 17.7 3 18 0.9 17.3 4.8 16.6 6.2 16.8 6.3 17.4 8 17.4 9.1 18.3 11.8 17.2 16.1 18.5 23.5 18.8 25.5 18.1 31 18.1 32.8 18.8 37.7 18.8 40.6 18.1 41.4 18.2 41.4 18.9 45.8 18.9 48.4 18.2 49.1 16.1 48.6 15.3 48.6 15.9 46.7 15.4 46.7 15 48.1 14.9 45.3 14.9 42.2 13.1 40.6 11.5 40.8 11 34.9 6.3 31.8 4.8 29.3 1.8 27.4 0.9 16.9 -7.8 24.1 -0.4 26.4 1 25.3 0.9 16.6 -5.6 17.6 -3.5 21.8 0.8 26.8 3.9 26.9 4.7 25 4 25.8 5 27 4.9 30.7 7.4 31.2 9.2 37.7 14.6 35.1 14.6 35.5 13.7 33.3 13.5 33.3 14.3 32.7 14.5 21.8 13.8 22 13.3 24.2 13.2 21.8 12.9 21.1 12.9 21.3 13.6 20.3 14.3 19.2 14.5 19.2 12.9 15.9 14.2 14.7 14.1 14.8 13.5 13.1 12.9 11.5 13.3 10.6 12.7 10.4 14.1 8.5 13.9 8.8 13.2 7.2 13 5.9 13.6 7 14.2 6.6 14.6 -0.4 13.9 -4.8 14.8 -4.9 14 -3.4 12.8 -9.4 16 -13.6 17.4 -14.6 18.2 -13.1 17.8 -13.7 19.2 -20.1 22.4 -21.6 22 -26.1 23 -28.9 25.4 -29.8 25.1 -28 23.8 -28.4 23.5 -35.3 26.7 -41.2 26.3 -42.4 24.3 -43.5 24.4 -44.2 22.8 -44.1 16 -42.9 13.5 -42.9 16 -42.4 16 -39.9 8.6 -34.7 -1.9 -35.4 -2 -38.7 4.1 -42.1 12.6 -42.6 12.4 -41.5 7.9 -37.9 -0.2 -37.4 0 -33.7 -6 -32.8 -9.1 -29.1 -14.5 -27 -19.7 -21.3 -29.2 -20.1 -28.1 -19.3 -23.4 -17.3 -19.1 -15 -17 -11.7 -15.3 -5.8 -14.9 -2.7 -15.4 1.3 -16.6 1.1 -17.5 3.2 -18.5 -1.4 -16.7 -5.2 -16.1 -5.5 -16.6 -10.9 -16.6 -13.3 -17.5 -17.1 -21.4 -19.8 -30.6 -20.7 -31.6 -22.6 -29.7 -28.7 -20.1 -30.8 -14.9 -32.6 -13 -34.7 -8.2 -41.8 3.6 -43 6.4 -42.4 6.8 -43.7 8.6 -45.6 13.9ZM-5.5 17.8 -8.1 19.4 -7.2 18.1ZM22.8 16.7 25 16.2 32.2 16.9 31.5 17.4 28.8 16.9 27.8 17.5ZM16.7 18 16.8 17.3 18.9 17.3 17.3 16.8 18.5 16.2 22.5 16.7 21.9 17.3 19.3 17.4 19.7 17.9 19 18.4ZM3.1 16.2 -5.2 17.3 -2.9 15.7 -1.3 16.2 -0.4 15.6 0.8 16.2 2.5 15.8ZM38 10.9 39.4 11.2 41.9 13.8 39.9 13.3Z';
  function logo(parent, x, y, s, ombre) {
    const g = el('g', { transform: tr(x, y, 0, s) }, parent);
    if (ombre) el('path', { d: LOGO_B, fill: ombre, transform: 'translate(1.2 1.4)' }, g);
    el('path', { d: LOGO_B, fill: '#FFFBF2' }, g);
    el('path', { d: LOGO_V, fill: C.vert }, g);
    return g;
  }

  /* ---------- les dégradés (définis une fois) ---------- */
  const DEFS = `
    <radialGradient id="h-halo"><stop offset="0" stop-color="#FFE08A" stop-opacity=".95"/><stop offset=".5" stop-color="#F2B84B" stop-opacity=".6"/><stop offset="1" stop-color="#F2B84B" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-vignette" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>
    <clipPath id="h-hublot"><circle cx="0" cy="0" r="150"/></clipPath>
    <clipPath id="h-porte"><rect x="-150" y="-230" width="300" height="460" rx="40"/></clipPath>
    <clipPath id="h-trouHublot"><path clip-rule="evenodd" d="M-100 -100H700V900H-100Z M240 330a150 150 0 1 0 300 0a150 150 0 1 0 -300 0Z"/></clipPath>
    <clipPath id="h-trouPorte"><path clip-rule="evenodd" d="M-100 -100H700V900H-100Z M250 150H470Q510 150 510 190V570Q510 610 470 610H250Q210 610 210 570V190Q210 150 250 150Z"/></clipPath>
    <radialGradient id="h-cone" cx=".42" cy=".4" r=".66" fx=".3" fy=".28"><stop offset="0" stop-color="#6F8538"/><stop offset=".45" stop-color="#4C6128"/><stop offset=".82" stop-color="#33441E"/><stop offset="1" stop-color="#27351A"/></radialGradient>
    <radialGradient id="h-coneH" cx=".42" cy=".4" r=".66" fx=".3" fy=".28"><stop offset="0" stop-color="#C4CB80"/><stop offset=".5" stop-color="#98A655"/><stop offset=".85" stop-color="#6D7F3B"/><stop offset="1" stop-color="#58692F"/></radialGradient>
    <linearGradient id="h-bol" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2A3719"/><stop offset=".42" stop-color="#5A6D30"/><stop offset=".78" stop-color="#9AA95B"/><stop offset="1" stop-color="#BCC57A"/></linearGradient>
    <linearGradient id="h-bolB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1C2713"/><stop offset=".5" stop-color="#34461F"/><stop offset="1" stop-color="#6A8036"/></linearGradient>
    <radialGradient id="h-domeH" cx=".46" cy=".44" r=".62" fx=".3" fy=".28"><stop offset="0" stop-color="#E4DB93"/><stop offset=".28" stop-color="#BCBE6A"/><stop offset=".62" stop-color="#809344"/><stop offset=".88" stop-color="#56682D"/><stop offset="1" stop-color="#4A5B28"/></radialGradient>
    <radialGradient id="h-ombreDome"><stop offset="0" stop-color="#101808" stop-opacity=".5"/><stop offset=".6" stop-color="#101808" stop-opacity=".36"/><stop offset="1" stop-color="#101808" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-lumiere" gradientUnits="userSpaceOnUse" x1="-700" y1="-800" x2="1700" y2="1900"><stop offset="0" stop-color="#FFE2A6" stop-opacity=".26"/><stop offset=".42" stop-color="#FFE2A6" stop-opacity="0"/><stop offset=".6" stop-color="#34405A" stop-opacity="0"/><stop offset="1" stop-color="#34405A" stop-opacity=".24"/></linearGradient>
    <linearGradient id="h-avion" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFCF4"/><stop offset=".6" stop-color="#F1EADB"/><stop offset="1" stop-color="#D9CFBB"/></linearGradient>
    <radialGradient id="h-helice"><stop offset="0" stop-color="#FFF8EA" stop-opacity=".05"/><stop offset=".7" stop-color="#FFF8EA" stop-opacity=".22"/><stop offset="1" stop-color="#FFF8EA" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-paroi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CBBC9E"/><stop offset=".16" stop-color="#E3D7BF"/><stop offset=".48" stop-color="#F1E7D3"/><stop offset=".8" stop-color="#E0D2B7"/><stop offset="1" stop-color="#C7B797"/></linearGradient>
    <linearGradient id="h-couple" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FBF4E6"/><stop offset=".25" stop-color="#E9DDC5"/><stop offset=".8" stop-color="#CDBD9D"/><stop offset="1" stop-color="#B7A684"/></linearGradient>
    <linearGradient id="h-jante" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A5B25E"/><stop offset=".45" stop-color="#7C8A3A"/><stop offset="1" stop-color="#5E6A2B"/></linearGradient>
    <linearGradient id="h-jante2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A7730"/><stop offset="1" stop-color="#2C3413"/></linearGradient>
    <radialGradient id="h-vitre"><stop offset=".78" stop-color="#1A130F" stop-opacity="0"/><stop offset=".94" stop-color="#1A130F" stop-opacity=".22"/><stop offset="1" stop-color="#1A130F" stop-opacity=".45"/></radialGradient>
    <linearGradient id="h-voileHublot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE3B0" stop-opacity=".26"/><stop offset=".45" stop-color="#F7D6B8" stop-opacity=".05"/><stop offset="1" stop-color="#6D7F9A" stop-opacity=".18"/></linearGradient>
    <radialGradient id="h-buee"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".62"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".24"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-flaque"><stop offset="0" stop-color="#FFF1CF" stop-opacity=".75"/><stop offset=".5" stop-color="#FFE9C0" stop-opacity=".28"/><stop offset="1" stop-color="#FFE9C0" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-banc" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93A04E"/><stop offset=".5" stop-color="#7C8A3A"/><stop offset="1" stop-color="#65722E"/></linearGradient>
    <linearGradient id="h-para" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#858852"/><stop offset=".55" stop-color="#6E7141"/><stop offset="1" stop-color="#565932"/></linearGradient>
    <linearGradient id="h-kraft" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#D7B585"/><stop offset=".55" stop-color="#C9A274"/><stop offset="1" stop-color="#B38D5E"/></linearGradient>
    <linearGradient id="h-manche" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#4D6891"/><stop offset=".45" stop-color="#3B527A"/><stop offset="1" stop-color="#2A3C5E"/></linearGradient>
    <linearGradient id="h-peau" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F2B793"/><stop offset=".5" stop-color="#E9A07A"/><stop offset="1" stop-color="#D58660"/></linearGradient>
    <linearGradient id="h-cadre" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4ECDC"/><stop offset=".5" stop-color="#D4C6A8"/><stop offset="1" stop-color="#A89878"/></linearGradient>
    <linearGradient id="h-horizonPorte" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F9DDB0" stop-opacity=".72"/><stop offset=".22" stop-color="#F2C6A0" stop-opacity=".45"/><stop offset=".45" stop-color="#E7B8AC" stop-opacity="0"/></linearGradient>
    <linearGradient id="h-ciel" gradientUnits="userSpaceOnUse" x1="0" y1="-420" x2="0" y2="700"><stop offset="0" stop-color="#4C7A96"/><stop offset=".3" stop-color="#7EA3B8"/><stop offset=".5" stop-color="#B9B6C3"/><stop offset=".64" stop-color="#E2B5A5"/><stop offset=".76" stop-color="#F0B78E"/><stop offset=".88" stop-color="#F6CF93"/><stop offset="1" stop-color="#FAE3A8"/></linearGradient>
    <radialGradient id="h-soleil"><stop offset="0" stop-color="#FFF8E2"/><stop offset=".16" stop-color="#FFF1C8" stop-opacity=".9"/><stop offset=".42" stop-color="#FBDFA0" stop-opacity=".42"/><stop offset="1" stop-color="#F9DE9E" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-contre" gradientUnits="userSpaceOnUse" x1="0" y1="800" x2="0" y2="-60"><stop offset="0" stop-color="#EFD9BF"/><stop offset=".2" stop-color="#C6D9DC"/><stop offset=".55" stop-color="#8FB2C5"/><stop offset="1" stop-color="#58849F"/></linearGradient>
    <radialGradient id="h-soleilC" gradientUnits="userSpaceOnUse" cx="480" cy="70" r="440"><stop offset="0" stop-color="#FFF7DC" stop-opacity=".95"/><stop offset=".16" stop-color="#FDE8B6" stop-opacity=".72"/><stop offset=".45" stop-color="#F9DE9E" stop-opacity=".24"/><stop offset="1" stop-color="#F9DE9E" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-gloire"><stop offset="0" stop-color="#FFF4CF" stop-opacity=".95"/><stop offset=".35" stop-color="#FBD77E" stop-opacity=".6"/><stop offset="1" stop-color="#F2B84B" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-eclat"><stop offset="0" stop-color="#FFFBEA" stop-opacity=".9"/><stop offset="1" stop-color="#FFF1C6" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-cielSol" gradientUnits="userSpaceOnUse" x1="0" y1="-360" x2="0" y2="540"><stop offset="0" stop-color="#4F7C97"/><stop offset=".34" stop-color="#86A9BC"/><stop offset=".56" stop-color="#C3B8C0"/><stop offset=".72" stop-color="#E7B8A8"/><stop offset=".86" stop-color="#F3BF90"/><stop offset=".95" stop-color="#F8D697"/><stop offset="1" stop-color="#FAE2A6"/></linearGradient>
    <linearGradient id="h-domeCote" gradientUnits="userSpaceOnUse" x1="-259" y1="0" x2="235" y2="0"><stop offset="0" stop-color="#A9B25E"/><stop offset=".3" stop-color="#879846"/><stop offset=".5" stop-color="#607334"/><stop offset=".72" stop-color="#4A5C38"/><stop offset="1" stop-color="#3E4C3A"/></linearGradient>
    <linearGradient id="h-brume" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6D1A6" stop-opacity="0"/><stop offset=".6" stop-color="#F6D1A6" stop-opacity=".45"/><stop offset="1" stop-color="#F6D1A6" stop-opacity="0"/></linearGradient>
    <linearGradient id="h-pre" gradientUnits="userSpaceOnUse" x1="0" y1="628" x2="0" y2="860"><stop offset="0" stop-color="#B9C26C"/><stop offset=".35" stop-color="#96A64F"/><stop offset="1" stop-color="#5F7331"/></linearGradient>
    <linearGradient id="h-colline1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7F8F48"/><stop offset="1" stop-color="#5E6E36"/></linearGradient>
    <linearGradient id="h-colline2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9EAB57"/><stop offset="1" stop-color="#6F8039"/></linearGradient>
    <radialGradient id="h-trou" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="#1E160F"/><stop offset=".6" stop-color="#3A2A1C"/><stop offset="1" stop-color="#5E4630"/></radialGradient>
    <linearGradient id="h-painH" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#EDB56A"/><stop offset=".45" stop-color="#D38D43"/><stop offset="1" stop-color="#A45E27"/></linearGradient>
    <linearGradient id="h-painB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D99A52"/><stop offset="1" stop-color="#A2602A"/></linearGradient>
    <linearGradient id="h-steak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E4128"/><stop offset=".5" stop-color="#4E2B1A"/><stop offset="1" stop-color="#351C11"/></linearGradient>
    <linearGradient id="h-fromage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAD267"/><stop offset="1" stop-color="#EA9E2C"/></linearGradient>
    <linearGradient id="h-frite" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FCE7A8"/><stop offset=".45" stop-color="#F4C95D"/><stop offset="1" stop-color="#DDA23C"/></linearGradient>
    <linearGradient id="h-cornet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#DDBC8C"/><stop offset=".5" stop-color="#C9A274"/><stop offset="1" stop-color="#A9824F"/></linearGradient>
    <linearGradient id="h-biere" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8C95A"/><stop offset=".5" stop-color="#EDA83A"/><stop offset="1" stop-color="#C9792A"/></linearGradient>
    <linearGradient id="h-verre" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/><stop offset=".18" stop-color="#FFFFFF" stop-opacity=".08"/><stop offset=".8" stop-color="#FFFFFF" stop-opacity=".04"/><stop offset="1" stop-color="#FFFFFF" stop-opacity=".35"/></linearGradient>
    <linearGradient id="h-sillage" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8EC" stop-opacity="0"/><stop offset="1" stop-color="#FFF8EC" stop-opacity=".75"/></linearGradient>
    <radialGradient id="h-flash"><stop offset="0" stop-color="#FFFDF4"/><stop offset=".35" stop-color="#FFF3CF" stop-opacity=".85"/><stop offset="1" stop-color="#FFE9B0" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-flouDome" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#AAA86E"/><stop offset=".36" stop-color="#919763"/><stop offset=".52" stop-color="#737D5B"/><stop offset="1" stop-color="#5C6753"/></linearGradient>
    <linearGradient id="h-flouForet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4B5A33" stop-opacity="0"/><stop offset=".35" stop-color="#4B5A33" stop-opacity=".55"/><stop offset="1" stop-color="#435230" stop-opacity=".85"/></linearGradient>
    <radialGradient id="h-voile"><stop offset="0" stop-color="#F1C2B2" stop-opacity=".8"/><stop offset=".6" stop-color="#EDB9AB" stop-opacity=".35"/><stop offset="1" stop-color="#EDB9AB" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-voileOr"><stop offset="0" stop-color="#FFE2A2" stop-opacity=".85"/><stop offset="1" stop-color="#FFE2A2" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-disque"><stop offset="0" stop-color="#FFFDF2"/><stop offset=".6" stop-color="#FFF6D8" stop-opacity=".95"/><stop offset="1" stop-color="#FFF1C6" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-rai" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="460"><stop offset="0" stop-color="#FFF1CC" stop-opacity=".5"/><stop offset=".55" stop-color="#FFF1CC" stop-opacity=".14"/><stop offset="1" stop-color="#FFF1CC" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-poussiere"><stop offset="0" stop-color="#FFF6DA" stop-opacity=".95"/><stop offset="1" stop-color="#FFF6DA" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-bokehV"><stop offset="0" stop-color="#E3F2C4" stop-opacity=".42"/><stop offset=".7" stop-color="#E3F2C4" stop-opacity=".16"/><stop offset="1" stop-color="#E3F2C4" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-feu"><stop offset="0" stop-color="#FF7A55" stop-opacity=".9"/><stop offset=".4" stop-color="#FF6040" stop-opacity=".35"/><stop offset="1" stop-color="#FF6040" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-flouJaune"><stop offset="0" stop-color="#F8CF55" stop-opacity=".95"/><stop offset=".6" stop-color="#F2C14E" stop-opacity=".6"/><stop offset="1" stop-color="#F2C14E" stop-opacity="0"/></radialGradient>
    <radialGradient id="h-flouBlanc"><stop offset="0" stop-color="#FFFCF4" stop-opacity=".95"/><stop offset=".6" stop-color="#FFF8EA" stop-opacity=".55"/><stop offset="1" stop-color="#FFF8EA" stop-opacity="0"/></radialGradient>
    <linearGradient id="h-filet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FFF6E6" stop-opacity="0"/><stop offset=".55" stop-color="#FFF6E6" stop-opacity=".85"/><stop offset="1" stop-color="#FFF6E6" stop-opacity=".25"/></linearGradient>
    <linearGradient id="h-aile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B7AC95"/><stop offset=".7" stop-color="#DCD2BD"/><stop offset="1" stop-color="#EFE7D6"/></linearGradient>
    <radialGradient id="h-bokeh"><stop offset="0" stop-color="#FFF2CC" stop-opacity=".5"/><stop offset=".7" stop-color="#FFF2CC" stop-opacity=".18"/><stop offset="1" stop-color="#FFF2CC" stop-opacity="0"/></radialGradient>`;

  /* ==========================================================================
     LA CARTE VUE DU CIEL (définie une fois, réutilisée par <use> dans plusieurs plans)
     repère 0–1000, nord en haut, soleil couchant à l'ouest-nord-ouest (ombres portées vers l'est-sud-est) ;
     le pré où il atterrit en PRE_C ; le puy de Dôme en DOME_C. La carte déborde largement (plongées lointaines).
     ========================================================================== */
  const DOME_C = [560, 400], PRE_C = [500, 575];
  const PRE = [[438, 531], [586, 521], [605, 630], [452, 641]];
  function carteAerienne(defs) {
    const g = el('g', { id: 'h-carte' }, defs);
    const r = rng(7);
    const X0 = -700, X1 = 1700, Y0 = -820, Y1 = 1900;
    const bruit = (x, y) => Math.sin(x * 0.0061 + 1.3) * Math.sin(y * 0.0053 + 0.4) + 0.6 * Math.sin((x - y) * 0.0097 + 2.1) + 0.35 * Math.sin(x * 0.017 + y * 0.011);

    /* --- les puys, les bois, les cheires --- */
    const PUYS = [
      { x: 385, y: 148, r: 72, t: 'pariou' }, { x: 180, y: 450, r: 98, t: 'come' }, { x: 668, y: 205, r: 60, t: 'petit' },
      { x: 900, y: 140, r: 56, t: 'egueule', dir: 180 }, { x: 770, y: 812, r: 68, t: 'egueule', dir: 130 }, { x: 892, y: 736, r: 60, t: 'egueule', dir: 112 },
      { x: 150, y: 820, r: 78, t: 'rond' }, { x: 55, y: 140, r: 52, t: 'bois' }, { x: 1000, y: 470, r: 50, t: 'bois' },
      { x: 335, y: 1000, r: 56, t: 'bois' }, { x: 640, y: 1030, r: 48, t: 'bois' }, { x: -170, y: 520, r: 68, t: 'bois' },
      { x: 1190, y: 280, r: 64, t: 'bois' }, { x: -120, y: -60, r: 60, t: 'bois' }, { x: 1160, y: 900, r: 58, t: 'egueule', dir: 200 },
      { x: 560, y: -220, r: 66, t: 'rond' }, { x: -420, y: 1040, r: 70, t: 'bois' }, { x: 1420, y: 180, r: 62, t: 'rond' },
    ];
    const BOIS = [[290, 300, 62, 40, 20], [60, 340, 52, 86, -10], [830, 370, 50, 78, 15], [735, 650, 58, 30, -25], [300, 640, 40, 64, 10],
      [50, 990, 90, 48, 5], [990, 960, 78, 58, 30], [1110, 690, 66, 46, -15], [-300, 200, 120, 76, 20], [1310, 1100, 120, 86, -20],
      [-260, 1220, 110, 66, 10], [480, -260, 96, 56, 0], [1150, -140, 88, 66, 25], [-380, 760, 90, 130, 0], [1400, 520, 100, 140, 10],
      [620, 1400, 150, 70, 0], [100, 1500, 110, 60, -10], [1000, 1560, 120, 70, 15], [-500, -300, 100, 90, 0], [1450, -400, 110, 80, 0],
      [-600, 400, 80, 120, 0], [1600, 900, 90, 140, 0], [300, 1700, 140, 70, 10], [-550, 1650, 120, 80, 0]];
    const bois = BOIS.map(([x, y, rx, ry, a]) => tache(x, y, rx, ry, 14, 0.2, r, a));
    PUYS.filter((p) => p.t === 'egueule').forEach((p) => { // la coulée de lave boisée qui sort de la brèche
      const a = (p.dir * Math.PI) / 180;
      bois.push(tache(p.x + Math.cos(a) * p.r * 1.95, p.y + Math.sin(a) * p.r * 1.95, p.r * 1.3, p.r * 0.5, 16, 0.25, r, p.dir));
    });
    const zones = PUYS.map((p) => [p.x, p.y, p.r * 1.04]).concat([[DOME_C[0], DOME_C[1], 170]]);
    const dedans = (pg, x, y) => { let c = false; for (let i = 0, j = pg.length - 1; i < pg.length; j = i++) { const a = pg[i], b = pg[j]; if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const libre = (x, y) => !zones.some(([zx, zy, zr]) => (x - zx) ** 2 + (y - zy) ** 2 < zr * zr) && !bois.some((b) => dedans(b, x, y)) && !dedans(PRE, x, y);
    const proche = (x, y) => x > -200 && x < 1200 && y > -260 && y < 1260;

    /* --- géométrie des parcelles (polygones convexes) --- */
    function couper(p, px, py, nx, ny) {
      const A = [], B = [], S = [];
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        const da = (a[0] - px) * nx + (a[1] - py) * ny, db = (b[0] - px) * nx + (b[1] - py) * ny;
        (da >= 0 ? A : B).push(a);
        if ((da >= 0) !== (db >= 0)) { const k = da / (da - db); const q = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; A.push(q); B.push(q); S.push(q); }
      }
      return [A, B, S.length === 2 ? S : null];
    }
    function nettoie(p) {
      const o = [];
      p.forEach((q) => { const l = o[o.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.9) o.push(q); });
      if (o.length > 2 && Math.hypot(o[0][0] - o[o.length - 1][0], o[0][1] - o[o.length - 1][1]) < 0.9) o.pop();
      return o.filter((q, i) => {
        const a = o[(i + o.length - 1) % o.length], b = o[(i + 1) % o.length];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        return Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) / L > 0.35;
      });
    }
    function retrait(p, d) { // le champ, rentré de d : la lisière (herbe haute, fossé) apparaît entre les parcelles
      const n = p.length;
      if (n < 3) return null;
      const s = aireS(p) > 0 ? 1 : -1, L = [];
      for (let i = 0; i < n; i++) {
        const a = p[i], b = p[(i + 1) % n];
        let nx = -(b[1] - a[1]) * s, ny = (b[0] - a[0]) * s;
        const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
        L.push([a[0] + nx * d, a[1] + ny * d, b[0] - a[0], b[1] - a[1]]);
      }
      const o = [], c = centre(p);
      for (let i = 0; i < n; i++) {
        const A = L[(i + n - 1) % n], B = L[i];
        const den = A[2] * B[3] - A[3] * B[2];
        let q;
        if (Math.abs(den) < 1e-6) q = [B[0], B[1]];
        else { const t = ((B[0] - A[0]) * B[3] - (B[1] - A[1]) * B[2]) / den; q = [A[0] + A[2] * t, A[1] + A[3] * t]; }
        if (Math.hypot(q[0] - p[i][0], q[1] - p[i][1]) > d * 4) q = [lerp(p[i][0], c[0], 0.08), lerp(p[i][1], c[1], 0.08)];
        o.push(q);
      }
      return Math.abs(aireS(o)) > 30 ? o : null;
    }
    function clipLigne(p, px, py, dx, dy) { // Cyrus–Beck : la partie d'une droite dans un polygone convexe
      let t0 = -1e9, t1 = 1e9;
      const s = aireS(p) > 0 ? 1 : -1;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        const nx = -(b[1] - a[1]) * s, ny = (b[0] - a[0]) * s;
        const den = nx * dx + ny * dy, num = nx * (px - a[0]) + ny * (py - a[1]);
        if (Math.abs(den) < 1e-9) { if (num < 0) return null; continue; }
        const t = -num / den;
        if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
        if (t0 > t1) return null;
      }
      return [[px + dx * t0, py + dy * t0], [px + dx * t1, py + dy * t1]];
    }
    const axe = (p) => { // direction du plus long côté
      let best = 0, ex = 1, ey = 0;
      for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; const dx = q[0] - p[i][0], dy = q[1] - p[i][1], l = dx * dx + dy * dy; if (l > best) { best = l; ex = dx; ey = dy; } }
      const L = Math.sqrt(best) || 1;
      return [ex / L, ey / L, L];
    };

    /* --- le bocage : de grands îlots (entre routes et haies) redécoupés en parcelles --- */
    const champs = [], haies = [];
    const B = 150, NX = Math.round((X1 - X0) / B), NY = Math.round((Y1 - Y0) / B), gp = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const bord = i === 0 || j === 0 || i === NX || j === NY;
      gp.push([X0 + i * B + (bord ? 0 : (r() - 0.5) * B * 0.46), Y0 + j * B + (bord ? 0 : (r() - 0.5) * B * 0.46)]);
    }
    const G = (i, j) => gp[j * (NX + 1) + i];
    function decoupe(p, amin, d) {
      const a = Math.abs(aireS(p));
      if (d > 7 || a < amin * (0.55 + r() * 0.9)) { champs.push(p); return; }
      const [ex, ey, L] = axe(p);
      let nx = ex, ny = ey;
      if (r() < 0.22) { nx = -ey; ny = ex; }
      const c = centre(p), off = (r() - 0.5) * 0.35 * L;
      const [A, Bq, S] = couper(p, c[0] + nx * off, c[1] + ny * off, nx, ny);
      if (A.length < 3 || Bq.length < 3) { champs.push(p); return; }
      if (S && r() < 0.14 && proche(c[0], c[1])) haies.push(S);
      decoupe(A, amin, d + 1); decoupe(Bq, amin, d + 1);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const bloc = [G(i, j), G(i + 1, j), G(i + 1, j + 1), G(i, j + 1)];
      const c = centre(bloc), pres = proche(c[0], c[1]);
      decoupe(bloc, pres ? 3000 : 9000, 0);
      if (pres) for (let k = 0; k < 2; k++) if (r() < 0.4) haies.push([bloc[k], bloc[k + 1]]);
    }

    /* --- teintes des parcelles (prés, fauches, foin, chaume, labours) et leurs rayures --- */
    const COUL = {
      sombre: ['#627532', '#687B35', '#5C6F30'],
      pre: ['#7C9240', '#849A44', '#8DA149', '#788D3D'],
      clair: ['#A0B25B', '#A9BA63', '#B3C26D'],
      foin: ['#C3BC72', '#CABF7A', '#BAB368'],
      chaume: ['#D5C28C', '#D9C795', '#CEB980'],
      labour: ['#96724F', '#9D7954', '#8A6947'],
    };
    const STRIES = { labour: ['sillon', 3.4, 0.9], chaume: ['chaume', 4, 0.8], foin: ['andain', 7, 0.8], clair: ['tonte', 9, 0.6], pre: ['tonte', 10, 0.18] };
    /* les couches sont découpées en cellules : pour chaque tuile, Chrome ne rejoue que les morceaux qui la touchent */
    const CEL = 240, COUCHES = {}, couleurs = new Set();
    const ajoute = (nom, x, y, d) => { const m = COUCHES[nom] || (COUCHES[nom] = new Map()); const k = Math.floor(x / CEL) + ':' + Math.floor(y / CEL); m.set(k, (m.get(k) || '') + d); };
    const emet = (nom, attrs, parent = g) => { const m = COUCHES[nom]; if (m) m.forEach((d) => el('path', Object.assign({ d }, attrs), parent)); };
    champs.forEach((p) => {
      const c = centre(p);
      if (!libre(c[0], c[1])) return;
      const pres = proche(c[0], c[1]);
      const q = retrait(nettoie(p), pres ? 1.25 : 1.7);
      if (!q) return;
      const n = bruit(c[0], c[1]) * 1.25 + (r() - 0.5) * 0.85;
      const t = n < -0.95 ? 'sombre' : n < 0.1 ? 'pre' : n < 0.55 ? 'clair' : n < 0.95 ? 'foin' : n < 1.3 ? 'chaume' : 'labour';
      const col = pick(COUL[t], r);
      couleurs.add(col);
      ajoute('c' + col, c[0], c[1], poly(q));
      const st = STRIES[t];
      if (!pres || !st || r() > st[2]) return;
      const [ex, ey] = axe(q), nx = -ey, ny = ex;
      let mn = 1e9, mx = -1e9;
      q.forEach(([x, y]) => { const v = x * nx + y * ny; mn = Math.min(mn, v); mx = Math.max(mx, v); });
      for (let v = mn + st[1] * 0.6; v < mx - st[1] * 0.3; v += st[1]) {
        const s = clipLigne(q, nx * v, ny * v, ex, ey);
        if (!s) continue;
        const L = Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1]);
        if (L < 4) continue;
        const k = 1 / L;
        ajoute('r' + st[0], c[0], c[1], `M${pt(s[0][0] + (s[1][0] - s[0][0]) * k, s[0][1] + (s[1][1] - s[0][1]) * k)}L${pt(s[1][0] - (s[1][0] - s[0][0]) * k, s[1][1] - (s[1][1] - s[0][1]) * k)}`);
      }
    });

    /* --- les routes, les chemins, le ruisseau --- */
    const ROUTES = [
      [[-700, 720], [-350, 700], [-60, 668], [180, 700], [360, 676], [520, 668], [700, 612], [860, 562], [1050, 548], [1300, 575], [1700, 540]],
      [[330, -820], [330, -300], [300, 0], [290, 250], [330, 420], [360, 560], [352, 690], [300, 900], [262, 1200], [285, 1900]],
      [[1700, 200], [1300, 250], [1050, 300], [880, 335], [790, 420], [735, 478]],
      [[860, 562], [980, 700], [1010, 900], [1100, 1150], [1200, 1400], [1250, 1900]],
      [[-700, 120], [-400, 160], [-150, 230], [60, 250], [210, 300], [290, 250]],
    ];
    const CHEMINS = [];
    for (let i = 0; i < 26; i++) {
      const x = -150 + r() * 1300, y = -200 + r() * 1400, a = r() * TAU, L = 90 + r() * 200;
      if (!libre(x, y)) continue;
      const p = [];
      for (let k = 0; k < 4; k++) p.push([x + Math.cos(a + (r() - 0.5) * 0.5) * L * (k / 3) + (r() - 0.5) * 18, y + Math.sin(a + (r() - 0.5) * 0.5) * L * (k / 3) + (r() - 0.5) * 18]);
      CHEMINS.push(p);
    }
    const RUISSEAU = spline([[1700, 910], [1400, 880], [1180, 950], [1000, 1080], [820, 1140], [600, 1180], [320, 1150], [60, 1250], [-300, 1210], [-700, 1270]], 10);

    /* --- les ombres portées, les bois, les bosquets : chemins composés (quelques éléments pour des centaines de formes) --- */
    // un bosquet : houppiers festonnés (liseré de lumière au nord-ouest) et son ombre portée, une ellipse vers l'est
    const bosquet = (x, y, R) => {
      const pts = tache(x, y, R, R * (0.72 + r() * 0.3), 7, 0.22, r, r() * 180);
      ajoute('arbre', x, y, feston(pts, Math.max(2.4, R * 0.72), 0.3, r));
      const ox = x + R * 0.66 + 1.6, oy = y + R * 0.36 + 0.9, a = R * 1.05, b = R * 0.78;
      ajoute('ombre', x, y, `M${f(ox - a)} ${f(oy)}a${f(a)} ${f(b)} 0 1 0 ${f(2 * a)} 0a${f(a)} ${f(b)} 0 1 0 ${f(-2 * a)} 0Z`);
    };
    bois.forEach((b) => {
      const c = centre(b);
      ajoute('foret', c[0], c[1], feston(b, 11, 0.3, r));
      ajoute('ombre', c[0], c[1], poly(b.map(([x, y]) => [x + 7, y + 4])));
      const A = Math.abs(aireS(b)), k = Math.sqrt(A);
      for (let i = 0, n = Math.floor(A / 4200); i < n; i++) { // des dômes de canopée plus clairs, plutôt côté soleil
        const px = c[0] + (r() - 0.62) * k * 0.55, py = c[1] + (r() - 0.62) * k * 0.45;
        if (!dedans(b, px, py)) continue;
        const rr = k * (0.1 + r() * 0.09);
        ajoute('canopee', px, py, feston(tache(px, py, rr, rr * 0.82, 8, 0.2, r, r() * 180), rr * 0.5, 0.3, r));
      }
    });
    haies.forEach(([a, b]) => {
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      if (!libre(mx, my)) return;
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = 2 + Math.floor(L / 34), p = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, w = i && i < n ? 1 : 0;
        p.push([a[0] + (b[0] - a[0]) * k + (r() - 0.5) * 3 * w, a[1] + (b[1] - a[1]) * k + (r() - 0.5) * 3 * w]);
      }
      ajoute('haie', mx, my, trace(p));
      for (let i = 0, m = Math.floor(L / 90 + r() * 1.3); i < m; i++) { // les grands arbres de la haie
        const k = r();
        bosquet(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 3.2 + r() * 4.2);
      }
    });
    for (let i = 0; i < 100; i++) { // arbres isolés et bosquets dans les prés
      const x = -180 + r() * 1360, y = -240 + r() * 1480;
      if (!libre(x, y)) continue;
      const R = r() < 0.7 ? 2.6 + r() * 3 : 5 + r() * 5;
      bosquet(x, y, R);
      if (R > 6) for (let k = 0; k < 2 + r() * 3; k++) bosquet(x + (r() - 0.5) * R * 2.4, y + (r() - 0.5) * R * 2, R * (0.45 + r() * 0.4));
    }
    for (let i = 8; i < RUISSEAU.length; i += 3) { // la ripisylve le long du ruisseau
      const [x, y] = RUISSEAU[i];
      if (!proche(x, y) || r() < 0.3) continue;
      bosquet(x + (r() - 0.5) * 10, y + (r() - 0.5) * 8, 3 + r() * 3.4);
    }
    // les arbres autour du pré de l'atterrissage (on les verra de près)
    [[592, 534, 8.6], [598, 552, 5.4], [446, 540, 6.2], [441, 626, 7.4], [611, 616, 5.2], [527, 520, 4.6], [480, 522, 5.8], [462, 649, 5.6], [560, 638, 6.4]].forEach(([x, y, R]) => bosquet(x, y, R));

    /* --- dessin : parcelles, rayures, pré, routes, ruisseau --- */
    el('rect', { x: X0 - 200, y: Y0 - 200, width: X1 - X0 + 400, height: Y1 - Y0 + 400, fill: '#4D5A27' }, g);
    couleurs.forEach((col) => emet('c' + col, { fill: col }));
    emet('rtonte', { fill: 'none', stroke: '#D4DC9C', 'stroke-width': 4.2, 'stroke-opacity': 0.34 });
    emet('randain', { fill: 'none', stroke: '#A39952', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-opacity': 0.75 });
    emet('rchaume', { fill: 'none', stroke: '#F3E7C4', 'stroke-width': 0.9, 'stroke-opacity': 0.6 });
    emet('rsillon', { fill: 'none', stroke: '#6B4E33', 'stroke-width': 1.1, 'stroke-opacity': 0.5 });
    // le pré de l'atterrissage : vert pomme, fauché en bandes, semé de fleurs
    el('path', { d: poly(PRE), fill: '#BFD891' }, g);
    {
      const [ex, ey] = axe(PRE), nx = -ey, ny = ex;
      let mn = 1e9, mx = -1e9, dd = '';
      PRE.forEach(([x, y]) => { const v = x * nx + y * ny; mn = Math.min(mn, v); mx = Math.max(mx, v); });
      for (let v = mn + 5; v < mx; v += 11) { const s = clipLigne(PRE, nx * v, ny * v, ex, ey); if (s) dd += trace(s); }
      el('path', { d: dd, fill: 'none', stroke: '#D2E6AC', 'stroke-width': 5.2, 'stroke-opacity': 0.8 }, g);
      let fl = ['', '', ''];
      for (let i = 0; i < 26; i++) { // des touffes de fleurs, en taches irrégulières
        const cx = lerp(450, 596, r()), cy = lerp(534, 632, r());
        if (!dedans(PRE, cx, cy)) continue;
        const k = Math.floor(r() * 3);
        for (let j = 0; j < 4 + r() * 6; j++) fl[k] += cercle(cx + (r() - 0.5) * 6, cy + (r() - 0.5) * 4, 0.35 + r() * 0.35);
      }
      ['#FBF6EA', '#F4D35E', '#E7B8AC'].forEach((c, i) => el('path', { d: fl[i], fill: c }, g));
    }
    let dRoute = '', dPetite = '';
    ROUTES.forEach((p, i) => { (i < 2 ? (dRoute += trace(spline(p, 10))) : (dPetite += trace(spline(p, 10)))); });
    let dChemin = '';
    CHEMINS.forEach((p) => { dChemin += trace(spline(p, 6)); });
    el('path', { d: dChemin, fill: 'none', stroke: '#DCCDA3', 'stroke-width': 1.4, 'stroke-opacity': 0.8, 'stroke-linecap': 'round' }, g);
    el('path', { d: dRoute + dPetite, fill: 'none', stroke: '#4A5626', 'stroke-width': 7.5, 'stroke-opacity': 0.55, 'stroke-linejoin': 'round' }, g);
    el('path', { d: dRoute, fill: 'none', stroke: '#E8D9B6', 'stroke-width': 4.6, 'stroke-linejoin': 'round' }, g);
    el('path', { d: dPetite, fill: 'none', stroke: '#E1D1AB', 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
    el('path', { d: trace(RUISSEAU), fill: 'none', stroke: '#4F6A63', 'stroke-width': 3.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    el('path', { d: trace(RUISSEAU), fill: 'none', stroke: '#8EB2B6', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    // l'étang du village
    {
      const e = tache(-40, 830, 34, 20, 12, 0.14, r, 20);
      el('path', { d: lisse(e), fill: '#3E5A55' }, g);
      el('path', { d: lisse(e.map(([x, y]) => [x - 1.2, y - 1])), fill: '#7FA7AE' }, g);
      el('path', { d: lisse(e.map(([x, y]) => [lerp(x, -40, 0.35) - 5, lerp(y, 830, 0.35) - 3])), fill: '#B9D3CF', opacity: 0.5 }, g);
    }

    /* --- villages (Laschamps, Orcines, hameaux) : toits de tuiles ou d'ardoises, pan éclairé et pan à l'ombre --- */
    function maison(x, y, w, d, a, k) {
      const c = Math.cos(a), s = Math.sin(a);
      const P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
      const A = P(-w / 2, -d / 2), Bp = P(w / 2, -d / 2), Cp = P(w / 2, d / 2), D = P(-w / 2, d / 2), M1 = P(-w / 2, 0), M2 = P(w / 2, 0);
      const clair = s * -0.83 + -c * -0.56 > 0; // le pan « -v » regarde-t-il le soleil ?
      ajoute(k + (clair ? 'c' : 'f'), x, y, poly([A, Bp, M2, M1]));
      ajoute(k + (clair ? 'f' : 'c'), x, y, poly([M1, M2, Cp, D]));
      ajoute('ombre', x, y, poly([A, Bp, Cp, D].map(([px, py]) => [px + 3.2, py + 1.8])));
    }
    function village(route, cx, cy, R, n) {
      const pts = spline(route, 4).filter(([x, y]) => Math.hypot(x - cx, y - cy) < R);
      if (pts.length < 2) return;
      for (let i = 0; i < n; i++) {
        const j = 1 + Math.floor(r() * (pts.length - 2)), p = pts[j], q = pts[j + 1] || pts[j - 1];
        const a = Math.atan2(q[1] - p[1], q[0] - p[0]), side = r() < 0.5 ? -1 : 1, dd = 6 + r() * 12;
        const x = p[0] - Math.sin(a) * dd * side, y = p[1] + Math.cos(a) * dd * side;
        const w = 8.5 + r() * 7;
        maison(x, y, w, 5.5 + r() * 3, a + (r() < 0.25 ? Math.PI / 2 : 0), r() < 0.72 ? 't' : 'a');
        if (r() < 0.45) ajoute('jardin', x, y, poly([[x - 4, y + 5], [x + 5, y + 4], [x + 6, y + 11], [x - 3, y + 12]].map(([u, v]) => [u + (r() - 0.5) * 3, v + (r() - 0.5) * 3])));
        if (r() < 0.35) bosquet(x + (r() - 0.5) * 18, y + (r() - 0.5) * 16, 2.4 + r() * 2.6);
      }
    }
    village(ROUTES[0], 30, 690, 90, 26);
    village(ROUTES[2], 1060, 300, 100, 30);
    village(ROUTES[1], 335, 800, 50, 7);
    village(ROUTES[0], 640, 640, 40, 5);
    village(ROUTES[3], 990, 760, 40, 6);
    // l'église de Laschamps : la nef et le clocher carré
    maison(10, 676, 18, 7.5, -0.08, 'a');
    ajoute('ac', 23, 674, poly([[20, 671], [26, 671], [23, 674]]) + poly([[20, 671], [23, 674], [20, 677]]));
    ajoute('af', 23, 674, poly([[26, 671], [26, 677], [23, 674]]) + poly([[20, 677], [23, 674], [26, 677]]));
    // la gare du Panoramique des Dômes, au pied du puy, et son parking
    {
      const px = 752, py = 490;
      el('path', { d: `M${px - 26} ${py - 8}l46 -10 6 22 -46 10z`, fill: '#B7AF9B' }, g);
      const cols = ['#EDE3CF', '#7C8A3A', '#A6533A', '#5E7684', '#2F2A25', '#D9B45A']; // les voitures garées
      for (let i = 0; i < 16; i++) {
        const u = -20 + (i % 8) * 5.2, v = -3 + Math.floor(i / 8) * 9 + (r() - 0.5);
        if (r() < 0.3) continue;
        const cx = px + u - v * 0.2, cy = py + v + u * -0.21;
        el('rect', { x: f(cx), y: f(cy), width: 2.4, height: 1.3, fill: pick(cols, r), transform: `rotate(-12 ${f(cx)} ${f(cy)})` }, g);
      }
      maison(733, 478, 22, 7, -0.24, 'a');
    }

    /* --- cast shadows (dôme d'abord : très longue ombre douce vers l'est) --- */
    const [dx, dy] = DOME_C;
    el('ellipse', { cx: dx + 200, cy: dy + 84, rx: 280, ry: 140, transform: `rotate(24 ${dx + 200} ${dy + 84})`, fill: 'url(#h-ombreDome)' }, g);
    { // l'ombre nette du dôme, allongée vers l'est par le soleil couchant
      const o = [], v = Math.atan2(120, 270);
      for (let i = 0; i <= 12; i++) { const a = v + Math.PI / 2 + (i / 12) * Math.PI; o.push([dx + Math.cos(a) * 150, dy + Math.sin(a) * 140]); }
      for (let i = 0; i <= 12; i++) { const a = v - Math.PI / 2 + (i / 12) * Math.PI; o.push([dx + 270 + Math.cos(a) * 92, dy + 120 + Math.sin(a) * 84]); }
      el('path', { d: lisse(o), fill: '#101808', 'fill-opacity': 0.2 }, g);
    }
    PUYS.forEach((p) => { ajoute('ombre', p.x, p.y, lisse(tache(p.x + p.r * 0.4, p.y + p.r * 0.22, p.r * 1.05, p.r, 12, 0.05, r))); });
    emet('ombre', { fill: '#141D0B', 'fill-opacity': 0.34 });

    /* --- haies (liseré de lumière côté soleil, ombre côté est) --- */
    const tiret = { 'stroke-dasharray': '16 3.4 9 4.2 23 3 7 5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none' };
    emet('haie', Object.assign({ stroke: '#141D0B', 'stroke-width': 3, 'stroke-opacity': 0.3, transform: 'translate(2 1.2)' }, tiret));
    emet('haie', Object.assign({ stroke: '#7A8E3E', 'stroke-width': 2.4, 'stroke-opacity': 0.8, transform: 'translate(-.6 -.5)' }, tiret));
    emet('haie', Object.assign({ stroke: '#42552A', 'stroke-width': 2.1 }, tiret));

    /* --- les bois : lisière festonnée, dômes de canopée --- */
    const trois = (d, cc, cl, cf, k, parent = g) => {
      el('path', { d, fill: cf, transform: `translate(${k} ${f(k * 0.8)})` }, parent);
      el('path', { d, fill: cl, transform: `translate(${-k} ${f(-k * 0.8)})` }, parent);
      return el('path', { d, fill: cc }, parent);
    };
    [['foret', '#35461F', '#6C8436', '#1F2B15', 1.7], ['canopee', '#43562A', '#5F7631', '#2E3D1B', 1.2]].forEach(([nom, cc, cl, cf, k]) => {
      emet(nom, { fill: cf, transform: `translate(${k} ${f(k * 0.8)})` });
      emet(nom, { fill: cl, transform: `translate(${-k} ${f(-k * 0.8)})` });
      emet(nom, { fill: cc });
    });

    /* --- les puys vus d'en haut : cônes boisés, cratères --- */
    const gp2 = el('g', {}, g);
    const cone = (x, y, R, fill = 'url(#h-cone)', parent = gp2, rot = 0) => {
      const pts = tache(x, y, R, R * (0.94 + r() * 0.1), 18, 0.05, r, rot || r() * 180);
      trois(feston(pts, R * 0.12, 0.3, r), fill, '#6F8638', '#1E2A14', 1.8, parent);
      return pts;
    };
    const bol = (x, y, R, fill = 'url(#h-bol)', parent = gp2) => {
      el('circle', { cx: f(x), cy: f(y), r: f(R * 1.1), fill: '#A8B466', opacity: 0.9 }, parent); // la lèvre du cratère, éclairée
      el('circle', { cx: f(x), cy: f(y), r: f(R), fill }, parent);
    };
    PUYS.forEach((p) => {
      const { x, y, r: R, t } = p;
      if (t === 'pariou') {
        // le Pariou : un cône parfait dans l'anneau d'un ancien cratère (le « double anneau »)
        const a0 = 2.7, a1 = 6.9;
        let d = '';
        const n = 30, R1 = R * 1.28, R2 = R * 1.62;
        const ext = [], int = [];
        for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n, w = 1 + Math.sin(i * 1.7) * 0.03; ext.push([x + Math.cos(a) * R2 * w, y + Math.sin(a) * R2 * w * 0.96]); int.unshift([x + Math.cos(a) * R1, y + Math.sin(a) * R1 * 0.96]); }
        d = feston(ext.concat(int), R * 0.12, 0.28, r);
        trois(d, 'url(#h-cone)', '#768D3B', '#1E2A14', 1.8, gp2);
        cone(x, y, R);
        el('circle', { cx: f(x - 2), cy: f(y - 2), r: f(R * 0.8), fill: 'url(#h-coneH)' }, gp2);
        bol(x, y, R * 0.5);
        el('circle', { cx: f(x + R * 0.06), cy: f(y + R * 0.06), r: f(R * 0.17), fill: '#8FA04C' }, gp2);
        el('circle', { cx: f(x), cy: f(y), r: f(R * 0.53), fill: 'none', stroke: '#F1E6C8', 'stroke-width': 1.5, 'stroke-opacity': 0.9 }, gp2);
        let z = [];
        for (let i = 0; i < 8; i++) z.push([x + R * 0.36 + i * 4.4 + (i % 2 ? 3 : -3), y + R * 0.38 + i * 3.6]);
        el('path', { d: trace(z), fill: 'none', stroke: '#F1E6C8', 'stroke-width': 1.1, 'stroke-opacity': 0.85 }, gp2);
      } else if (t === 'come') {
        cone(x, y, R);
        bol(x, y, R * 0.46, 'url(#h-bolB)');
        cone(x + R * 0.04, y + R * 0.04, R * 0.2, 'url(#h-cone)');
        el('circle', { cx: f(x + R * 0.05), cy: f(y + R * 0.05), r: f(R * 0.075), fill: 'url(#h-bolB)' }, gp2);
      } else if (t === 'petit') {
        cone(x, y, R, 'url(#h-coneH)');
        bol(x - R * 0.1, y + R * 0.05, R * 0.36);
      } else if (t === 'egueule') {
        cone(x, y, R);
        const a = (p.dir * Math.PI) / 180, R0 = R * 0.5, ou = 0.62;
        let d = `M${pt(x + Math.cos(a - ou) * R * 1.05, y + Math.sin(a - ou) * R * 1.05)}L${pt(x + Math.cos(a - ou) * R0, y + Math.sin(a - ou) * R0)}`;
        d += `A${f(R0)} ${f(R0)} 0 1 0 ${pt(x + Math.cos(a + ou) * R0, y + Math.sin(a + ou) * R0)}L${pt(x + Math.cos(a + ou) * R * 1.05, y + Math.sin(a + ou) * R * 1.05)}Z`;
        el('path', { d, fill: '#A8B466', transform: 'translate(-1.2 -1)' }, gp2);
        el('path', { d, fill: 'url(#h-bol)' }, gp2);
      } else if (t === 'rond') {
        cone(x, y, R);
        bol(x, y, R * 0.3, 'url(#h-bol)');
      } else cone(x, y, R);
    });

    /* --- le puy de Dôme : ceinture boisée, dôme herbeux, train à crémaillère en spirale, sommet et antenne --- */
    const gd = el('g', {}, g);
    const base = tache(dx, dy, 164, 150, 26, 0.05, r, -8);
    trois(feston(base, 11, 0.32, r), 'url(#h-cone)', '#6F8638', '#1E2A14', 2, gd);
    el('path', { d: lisse(tache(dx - 6, dy - 6, 132, 121, 16, 0.035, r, -8)), fill: 'url(#h-domeH)' }, gd);
    let dBoisD = '';
    [[0.35, 128, 34, 22], [1.1, 124, 30, 20], [5.6, 124, 28, 18], [2.2, 126, 24, 16], [4.4, 128, 22, 15]].forEach(([a, rr, lx, ly]) => {
      dBoisD += feston(tache(dx + Math.cos(a) * rr, dy + Math.sin(a) * rr * 0.92, lx, ly, 10, 0.2, r, (a * 180) / Math.PI + 90), 7, 0.3, r);
    });
    trois(dBoisD, '#3B4D22', '#6A8134', '#1E2A14', 1.4, gd);
    let rav = '';
    for (let i = 0; i < 14; i++) { // les ravines qui descendent du sommet
      const a = r() * TAU, r0 = 40 + r() * 20, r1 = 105 + r() * 18;
      rav += `M${pt(dx + Math.cos(a) * r0, dy + Math.sin(a) * r0 * 0.92)}Q${pt(dx + Math.cos(a + 0.12) * (r0 + r1) / 2, dy + Math.sin(a + 0.12) * (r0 + r1) * 0.46)} ${pt(dx + Math.cos(a + 0.05) * r1, dy + Math.sin(a + 0.05) * r1 * 0.92)}`;
    }
    el('path', { d: rav, fill: 'none', stroke: '#5E6F33', 'stroke-width': 1.2, 'stroke-opacity': 0.28 }, gd);
    const spirale = (tours, r0, r1, a0, n) => {
      const o = [];
      for (let k = 0; k <= n; k++) { const v = k / n, a = a0 + v * tours * TAU, rr = lerp(r0, r1, Math.pow(v, 0.85)); o.push([dx - 8 + Math.cos(a) * rr, dy - 10 + Math.sin(a) * rr * 0.92]); }
      return o;
    };
    const route = lisse(spirale(1.25, 118, 34, 2.4, 60), false);
    el('path', { d: route, fill: 'none', stroke: '#DDD2B2', 'stroke-width': 1.5, 'stroke-opacity': 0.38 }, gd);
    const voie = lisse(spirale(0.84, 156, 28, 0.32, 44), false);
    el('path', { d: voie, fill: 'none', stroke: '#1B2511', 'stroke-width': 4.8, 'stroke-opacity': 0.3, transform: 'translate(1.2 1)' }, gd);
    el('path', { d: voie, fill: 'none', stroke: '#E7DCC1', 'stroke-width': 3.4 }, gd);
    el('path', { d: voie, fill: 'none', stroke: '#6E6754', 'stroke-width': 0.8 }, gd);
    const zz = [];
    for (let i = 0; i < 10; i++) { const k = i / 9; zz.push([lerp(dx + 120, dx + 20, k) + (i % 2 ? 8 : -8), lerp(dy + 86, dy + 6, k)]); }
    el('path', { d: trace(zz), fill: 'none', stroke: '#EFE4C7', 'stroke-width': 1, 'stroke-opacity': 0.8 }, gd); // le chemin des Muletiers
    // le sommet : le plateau, l'observatoire, la gare d'arrivée, le temple de Mercure, l'antenne et sa longue ombre
    const sx = dx - 10, sy = dy - 12;
    el('path', { d: lisse(tache(sx, sy, 30, 22, 9, 0.12, r, -10)), fill: '#C3C582' }, gd);
    let so = '';
    const bat = (x, y, w, h, a, c1, c2) => {
      const c = Math.cos(a), s = Math.sin(a), P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
      so += poly([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, h / 2), P(-w / 2, h / 2)].map(([u, v]) => [u + 2.6, v + 1.5]));
      return () => { el('path', { d: poly([P(-w / 2, -h / 2), P(w / 2, -h / 2), P(w / 2, 0), P(-w / 2, 0)]), fill: c1 }, gd); el('path', { d: poly([P(-w / 2, 0), P(w / 2, 0), P(w / 2, h / 2), P(-w / 2, h / 2)]), fill: c2 }, gd); };
    };
    const bats = [bat(sx - 12, sy - 6, 12, 7, 0.2, '#EEE7D8', '#B8B1A2'), bat(sx + 9, sy + 6, 19, 6, -0.25, '#DCD4C3', '#A39C8D'), bat(sx + 13, sy - 8, 7, 5, 0.4, '#EEE7D8', '#B8B1A2')];
    // l'ombre de l'antenne, longue et fine, vers l'est ; ses paliers
    const ax = sx + 1, ay = sy - 1, bx = ax + 128, by = ay + 58;
    so += `M${pt(ax, ay - 2.4)}L${pt(bx, by - 0.5)}L${pt(bx, by + 0.5)}L${pt(ax, ay + 2.4)}Z` + cercle(lerp(ax, bx, 0.42), lerp(ay, by, 0.42), 3.2) + cercle(lerp(ax, bx, 0.64), lerp(ay, by, 0.64), 2.4) + cercle(lerp(ax, bx, 0.8), lerp(ay, by, 0.8), 1.6);
    el('path', { d: so, fill: '#141D0B', 'fill-opacity': 0.58 }, gd);
    bats.forEach((b) => b());
    el('path', { d: `M${sx - 20} ${sy + 8}h9v5h-9z`, fill: 'none', stroke: '#E4D9BD', 'stroke-width': 1.4 }, gd); // le temple de Mercure
    el('circle', { cx: ax, cy: ay, r: 3.4, fill: '#F4EEE0', stroke: '#8D877C', 'stroke-width': 0.8 }, gd);
    el('circle', { cx: ax - 0.8, cy: ay - 0.8, r: 1.2, fill: '#FFFFFF' }, gd);

    /* --- les arbres (liseré de lumière au nord-ouest, ombre au sud-est), les toits, les vaches du pré voisin --- */
    emet('arbre', { fill: '#7D9642', transform: 'translate(-1 -0.8)' });
    emet('arbre', { fill: '#41552A' });
    emet('jardin', { fill: '#A9BB6C', opacity: 0.85 });
    emet('tc', { fill: '#CF8456' }); emet('tf', { fill: '#94513A' });
    emet('ac', { fill: '#8E8A84' }); emet('af', { fill: '#5A5752' });
    let dv = '', dvc = '', dvo = '';
    [[628, 590, 0.4], [646, 603, -0.5], [654, 580, 1.1], [672, 613, 0.2], [614, 616, 1.9], [690, 590, 2.6]].forEach(([x, y, a]) => { // des Salers, acajou
      const c = Math.cos(a), s = Math.sin(a), P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
      const corps = lisse([P(-2.8, 0), P(-2, -1.3), P(1.8, -1.35), P(2.8, 0), P(1.8, 1.35), P(-2, 1.3)]);
      dv += corps + cercle(...P(3.5, 0), 0.8);
      dvc += cercle(...P(-0.4, -0.35), 1.1) + cercle(...P(1.2, -0.3), 0.8);
      dvo += lisse([P(-2.4, 0), P(-1.8, -1.2), P(2, -1.2), P(3.3, 0), P(2, 1.2), P(-1.8, 1.2)].map(([u, v]) => [u + 2.2, v + 1.2]));
    });
    el('path', { d: dvo, fill: '#141D0B', 'fill-opacity': 0.35 }, g);
    el('path', { d: dv, fill: '#8C4326' }, g);
    el('path', { d: dvc, fill: '#B8693F' }, g);
    // la lumière dorée du couchant sur toute la carte
    el('rect', { x: X0 - 200, y: Y0 - 200, width: X1 - X0 + 400, height: Y1 - Y0 + 400, fill: 'url(#h-lumiere)' }, g);
    return g;
  }

  /* ---------- le bougnat de profil (assis, debout, en chute, tête à droite) ---------- */
  function membre(p, l1, l2, a1, a2) {
    const r1 = (a1 * Math.PI) / 180, r2 = ((a1 + a2) * Math.PI) / 180;
    const x1 = p[0] + Math.cos(r1) * l1, y1 = p[1] + Math.sin(r1) * l1;
    const x2 = x1 + Math.cos(r2) * l2, y2 = y1 + Math.sin(r2) * l2;
    return { d: `M${f(p[0])} ${f(p[1])}L${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`, bout: [x2, y2], angle: a1 + a2 };
  }
  // angles dans le repère du corps (corps couché, tête vers +x ; ventre vers +y)
  const POSES = {
    chute: { bp: [55, -95], bl: [70, -100], jp: [165, 95], jl: [175, 100], tete: 0, bouche: 0, yeux: 1 },
    tire: { bp: [-125, -60], bl: [70, -100], jp: [165, 95], jl: [175, 100], tete: -8, bouche: 0.2, yeux: 1 },
    nage: { bp: [-20, -10], bl: [10, 10], jp: [170, 60], jl: [185, 70], tete: -6, bouche: 0.4, yeux: 1.4 },
    mange: { bp: [60, -150], bl: [75, -140], jp: [165, 90], jl: [175, 95], tete: 4, bouche: 0.8, yeux: 0.6 },
    boit: { bp: [30, -135], bl: [70, -100], jp: [165, 90], jl: [175, 95], tete: -18, bouche: 0.5, yeux: 0.2 },
    // debout / assis : corps tourné de -90° (tête en haut) ; les angles restent dans le repère du corps
    assis: { bp: [100, -40], bl: [95, -30], jp: [-90, 90], jl: [-95, 92], tete: 90, bouche: 0.1, yeux: 1.2 },
    debout: { bp: [95, 10], bl: [100, 5], jp: [175, 5], jl: [185, -5], tete: 90, bouche: 0.2, yeux: 1 },
    salut: { bp: [-40, -40], bl: [100, 5], jp: [175, 5], jl: [185, -5], tete: 80, bouche: 0.6, yeux: 1 },
    plonge: { bp: [-20, -10], bl: [-30, -10], jp: [160, 20], jl: [200, -20], tete: 10, bouche: 0.8, yeux: 1.6 },
    tend: { bp: [-5, -5], bl: [5, 5], jp: [175, 40], jl: [190, 30], tete: -4, bouche: 0.6, yeux: 1.5 },
    calin: { bp: [70, -165], bl: [80, -160], jp: [165, 90], jl: [175, 95], tete: -10, bouche: 0.9, yeux: 1.2 },
  };
  function mix(a, b, k) {
    const o = {};
    for (const key in a) o[key] = Array.isArray(a[key]) ? a[key].map((v, i) => lerp(v, b[key][i], k)) : lerp(a[key], b[key], k);
    return o;
  }
  function makeProfil(parent) {
    const G = el('g', {}, parent);
    const jl = el('path', { fill: 'none', stroke: C.pantalon, 'stroke-width': 26, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.8 }, G);
    const bl = el('path', { fill: 'none', stroke: C.blouse2, 'stroke-width': 20, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const hl = el('circle', { r: 11, fill: C.peau, opacity: 0.85 }, G);
    const botteL = el('ellipse', { rx: 16, ry: 10, fill: C.botte, opacity: 0.85 }, G);
    const jp = el('path', { fill: 'none', stroke: C.pantalon, 'stroke-width': 28, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const botteP = el('ellipse', { rx: 17, ry: 11, fill: C.botte }, G);
    el('rect', { x: -22, y: -34, width: 128, height: 64, rx: 30, fill: C.blouse }, G);
    el('path', { d: 'M-10 18C30 30 70 30 104 16L104 24C70 36 30 36-10 26Z', fill: C.blouse2 }, G);
    const sac = el('g', {}, G);
    el('path', { d: 'M-6 -30C-8 -62 6 -80 36 -80C66 -80 84 -66 82 -30Z', fill: C.sac }, sac);
    const rabat = el('path', { d: 'M-6 -58C14 -70 60 -72 82 -56L82 -44C60 -58 16 -58-6 -46Z', fill: C.sac2 }, sac);
    el('path', { d: 'M4 -30L4 -12M70 -30L70 -12', stroke: C.sac2, 'stroke-width': 6, 'stroke-linecap': 'round' }, sac);
    el('path', { d: 'M24 -40L34 -54 38 -50 44 -58 54 -40Z', fill: C.logo, stroke: '#FFF7E6', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }, sac);
    const poignee = el('g', {}, sac);
    el('path', { d: 'M-14 -56L-6 -56', stroke: C.sac2, 'stroke-width': 4 }, poignee);
    el('circle', { cx: -20, cy: -56, r: 8, fill: 'none', stroke: C.poignee, 'stroke-width': 5 }, poignee);
    el('path', { d: 'M96 -18L122 -8L100 6Z', fill: C.foulard }, G);
    const tete = el('g', {}, G);
    el('circle', { cx: 0, cy: 0, r: 30, fill: C.peau }, tete);
    el('circle', { cx: 12, cy: 10, r: 8, fill: C.joue, opacity: 0.7 }, tete);
    const oeil = el('ellipse', { cx: 14, cy: -6, rx: 3.6, ry: 4.2, fill: C.moust }, tete);
    el('circle', { cx: 30, cy: 2, r: 7, fill: C.nez }, tete);
    const bouche = el('ellipse', { cx: 22, cy: 18, rx: 7, ry: 1, fill: '#7A2E24' }, tete);
    const moust = el('path', { d: 'M12 12C18 4 30 6 34 10C40 6 50 8 52 16C44 16 40 20 34 18C28 22 16 22 12 12Z', fill: C.moust }, tete);
    const casq = el('g', {}, tete);
    el('path', { d: 'M-30 -4C-32 -26-10-40 12-38C30-37 40-28 42-16L44-12L-2-8Z', fill: C.casq }, casq);
    el('path', { d: 'M20 -14C34 -18 50 -16 58 -10L56 -6C46 -10 32 -10 20 -8Z', fill: C.casq2 }, casq);
    const bp = el('path', { fill: 'none', stroke: C.blouse, 'stroke-width': 22, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const hp = el('circle', { r: 12, fill: C.peau }, G);
    return { G, jl, bl, hl, botteL, jp, botteP, sac, rabat, poignee, tete, oeil, bouche, moust, casq, bp, hp };
  }
  function poseProfil(P, pose, t, avecSac = true) {
    const bp = membre([78, -6], 44, 42, pose.bp[0], pose.bp[1]);
    const bl = membre([70, -12], 44, 40, pose.bl[0], pose.bl[1]);
    const jp = membre([-8, 8], 52, 50, pose.jp[0], pose.jp[1]);
    const jl = membre([-4, 0], 52, 48, pose.jl[0], pose.jl[1]);
    P.bp.setAttribute('d', bp.d); P.hp.setAttribute('cx', f(bp.bout[0])); P.hp.setAttribute('cy', f(bp.bout[1]));
    P.bl.setAttribute('d', bl.d); P.hl.setAttribute('cx', f(bl.bout[0])); P.hl.setAttribute('cy', f(bl.bout[1]));
    P.jp.setAttribute('d', jp.d); P.botteP.setAttribute('transform', tr(jp.bout[0], jp.bout[1], jp.angle));
    P.jl.setAttribute('d', jl.d); P.botteL.setAttribute('transform', tr(jl.bout[0], jl.bout[1], jl.angle));
    P.tete.setAttribute('transform', tr(128, -14, pose.tete));
    P.oeil.setAttribute('ry', f(1 + 3.2 * pose.yeux));
    P.bouche.setAttribute('ry', f(0.8 + 6 * pose.bouche * (0.6 + 0.4 * Math.abs(Math.sin(t * 16)))));
    P.moust.setAttribute('transform', `rotate(${f(-10 * Math.max(0, pose.yeux - 1))} 30 12)`);
    show(P.sac, avecSac);
    return bp.bout;
  }

  /* ---------- le bougnat vu de dessus (plongée verticale) : dos, sac, casquette ---------- */
  function makeDos(parent) {
    const G = el('g', {}, parent);
    const bras = el('path', { fill: 'none', stroke: C.blouse, 'stroke-width': 24, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const jambes = el('path', { fill: 'none', stroke: C.pantalon, 'stroke-width': 28, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const mains = el('g', { fill: C.peau }, G);
    const mg = el('circle', { r: 12 }, mains), md = el('circle', { r: 12 }, mains);
    const pieds = el('g', { fill: C.botte }, G);
    const pg = el('ellipse', { rx: 13, ry: 18 }, pieds), pd = el('ellipse', { rx: 13, ry: 18 }, pieds);
    el('ellipse', { cx: 0, cy: 0, rx: 52, ry: 66, fill: C.blouse }, G);
    el('path', { d: 'M-40 30C-20 44 20 44 40 30L40 50C20 62-20 62-40 50Z', fill: C.blouse2 }, G);
    const sac = el('g', {}, G);
    el('rect', { x: -34, y: -40, width: 68, height: 78, rx: 12, fill: C.sac }, sac);
    const rabat = el('path', { d: 'M-34 -40H34V-14C18 -8-18 -8-34 -14Z', fill: C.sac2 }, sac);
    el('path', { d: 'M-12 8L-2 -6 2 -2 8 -10 18 8Z', fill: C.logo, stroke: '#FFF7E6', 'stroke-width': 1.5 }, sac);
    el('circle', { cx: 44, cy: 20, r: 7, fill: 'none', stroke: C.poignee, 'stroke-width': 4 }, sac);
    const tete = el('g', {}, G);
    el('circle', { cx: 0, cy: -84, r: 30, fill: C.casq }, tete);
    el('path', { d: 'M-24 -104C-10 -118 10 -118 24 -104L20 -98C8 -108-8 -108-20 -98Z', fill: C.casq2 }, tete);
    el('path', { d: 'M-34 -62C-40 -50-34 -44-26 -46M34 -62C40 -50 34 -44 26 -46', fill: 'none', stroke: C.moust, 'stroke-width': 7, 'stroke-linecap': 'round' }, tete); // la moustache dépasse
    return { G, bras, jambes, mg, md, pg, pd, sac, rabat, tete };
  }
  function poseDos(D, t, ecart = 1, battre = 0) {
    const a = Math.sin(t * 6) * 6 * (1 + battre * 3);
    const bx = 110 * ecart, by = -30 + a;
    D.bras.setAttribute('d', `M-44 -40Q${f(-bx * 0.7)} ${f(-70 + a)} ${f(-bx)} ${f(by - 40)}M44 -40Q${f(bx * 0.7)} ${f(-70 - a)} ${f(bx)} ${f(-by - 100)}`);
    D.mg.setAttribute('cx', f(-bx)); D.mg.setAttribute('cy', f(by - 40));
    D.md.setAttribute('cx', f(bx)); D.md.setAttribute('cy', f(-by - 100));
    const jx = 62 * ecart, j = Math.cos(t * 5) * 8;
    D.jambes.setAttribute('d', `M-22 50L${f(-jx)} ${f(130 + j)}M22 50L${f(jx)} ${f(130 - j)}`);
    D.pg.setAttribute('cx', f(-jx)); D.pg.setAttribute('cy', f(146 + j));
    D.pd.setAttribute('cx', f(jx)); D.pd.setAttribute('cy', f(146 - j));
  }

  /* ---------- le bougnat de face (à terre ; et en contre-plongée pendant la chute) ---------- */
  function makeFace(parent) {
    const G = el('g', {}, parent);
    const halo = el('ellipse', { cx: 0, cy: -20, rx: 190, ry: 230, fill: 'url(#h-halo)', opacity: 0 }, G);
    const ombre = el('ellipse', { cx: 0, cy: 150, rx: 70, ry: 12, fill: '#000', opacity: 0.25 }, G);
    const jambes = el('path', { fill: 'none', stroke: C.pantalon, 'stroke-width': 30, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const pg = el('ellipse', { rx: 22, ry: 11, fill: C.botte }, G), pd = el('ellipse', { rx: 22, ry: 11, fill: C.botte }, G);
    const torse = el('g', {}, G);
    el('path', { d: 'M-60 -40C-62 10-56 50-48 76L48 76C56 50 62 10 60-40C40-56-40-56-60-40Z', fill: C.blouse }, torse);
    el('path', { d: 'M-48 60L48 60L48 76L-48 76Z', fill: C.blouse2 }, torse);
    el('path', { d: 'M-24 -50L0 -18L24 -50Z', fill: C.foulard }, torse);
    const bg = el('path', { fill: 'none', stroke: C.blouse, 'stroke-width': 24, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const bd = el('path', { fill: 'none', stroke: C.blouse, 'stroke-width': 24, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, G);
    const biceps = el('g', { fill: C.blouse }, G);
    const bcg = el('circle', { r: 0 }, biceps), bcd = el('circle', { r: 0 }, biceps);
    const mg = el('circle', { r: 13, fill: C.peau }, G), md = el('circle', { r: 13, fill: C.peau }, G);
    const pouce = el('path', { d: 'M0 0L0 -16', stroke: C.peau, 'stroke-width': 8, 'stroke-linecap': 'round' }, G);
    const tete = el('g', {}, G);
    el('circle', { cx: 0, cy: 0, r: 46, fill: C.peau }, tete);
    el('circle', { cx: -24, cy: 14, r: 10, fill: C.joue, opacity: 0.65 }, tete);
    el('circle', { cx: 24, cy: 14, r: 10, fill: C.joue, opacity: 0.65 }, tete);
    const blancs = el('g', { fill: '#FFFDF6' }, tete);
    const bgb = el('ellipse', { cx: -15, cy: -8, rx: 0, ry: 0 }, blancs), bdb = el('ellipse', { cx: 15, cy: -8, rx: 0, ry: 0 }, blancs);
    const og = el('ellipse', { cx: -15, cy: -6, rx: 4.5, ry: 5.5, fill: C.moust }, tete);
    const od = el('ellipse', { cx: 15, cy: -6, rx: 4.5, ry: 5.5, fill: C.moust }, tete);
    const sourcils = el('path', { fill: 'none', stroke: C.moust, 'stroke-width': 4, 'stroke-linecap': 'round' }, tete);
    const joues = el('g', { fill: C.joue, opacity: 0 }, tete);
    el('circle', { cx: -26, cy: 16, r: 15 }, joues); el('circle', { cx: 26, cy: 16, r: 15 }, joues);
    const gouttes = el('g', { fill: '#9CC2D2' }, tete);
    [[-40, -34], [44, -26], [-48, -8]].forEach(([x, y]) => el('path', { d: `M${x} ${y - 9}C${x + 5} ${y - 2} ${x + 5} ${y + 5} ${x} ${y + 5}C${x - 5} ${y + 5} ${x - 5} ${y - 2} ${x} ${y - 9}Z` }, gouttes));
    el('circle', { cx: 0, cy: 8, r: 9, fill: C.nez }, tete);
    const bouche = el('ellipse', { cx: 0, cy: 30, rx: 12, ry: 2, fill: '#7A2E24' }, tete);
    const moust = el('path', { d: 'M0 14C-10 10-26 12-34 22C-26 26-14 26-6 22L0 20L6 22C14 26 26 26 34 22C26 12 10 10 0 14Z', fill: C.moust }, tete);
    const casq = el('g', {}, tete);
    el('path', { d: 'M-50 -12C-54 -42-26-60 4-58C30-56 50-44 52-22L50-14Z', fill: C.casq }, casq);
    el('path', { d: 'M-40 -16C-20 -24 26 -26 58 -14L56 -8C26 -18-20 -16-42 -10Z', fill: C.casq2 }, casq);
    const etoiles = el('g', {}, G);
    for (let i = 0; i < 4; i++) el('path', { d: 'M0 -9L2.6 -2.6 9 0 2.6 2.6 0 9-2.6 2.6-9 0-2.6-2.6Z', fill: C.etoile }, etoiles);
    const eclats = el('g', { fill: '#FFF1C6' }, G);
    for (let i = 0; i < 6; i++) el('path', { d: 'M0 -14L3.5 -3.5 14 0 3.5 3.5 0 14-3.5 3.5-14 0-3.5-3.5Z' }, eclats);
    return { G, halo, ombre, torse, jambes, pg, pd, bg, bd, biceps, bcg, bcd, mg, md, pouce, tete, bgb, bdb, og, od, sourcils, joues, gouttes, bouche, moust, casq, etoiles, eclats };
  }
  // bras et jambes de face : [épaule x, y, main x, y] ; jambes [hanche x, pied x, pied y]
  function poseFace(F, o) {
    const bg = o.bg || [-62, -30, -72, 100], bd = o.bd || [62, -30, 72, 100];
    F.bg.setAttribute('d', `M${bg[0]} ${bg[1]}Q${f(bg[0] - 20)} ${f((bg[1] + bg[3]) / 2)} ${f(bg[2])} ${f(bg[3])}`);
    F.bd.setAttribute('d', `M${bd[0]} ${bd[1]}Q${f(bd[0] + 24)} ${f((bd[1] + bd[3]) / 2)} ${f(bd[2])} ${f(bd[3])}`);
    F.mg.setAttribute('cx', f(bg[2])); F.mg.setAttribute('cy', f(bg[3]));
    F.md.setAttribute('cx', f(bd[2])); F.md.setAttribute('cy', f(bd[3]));
    const j = o.jambes || [-34, -38, 140, 34, 38, 140];
    F.jambes.setAttribute('d', `M${j[0]} 60L${f(j[1])} ${f(j[2])}M${j[3]} 60L${f(j[4])} ${f(j[5])}`);
    F.pg.setAttribute('transform', tr(j[1] - 2, j[2] + 6)); F.pd.setAttribute('transform', tr(j[4] + 2, j[5] + 6));
    show(F.pouce, !!o.pouce);
    F.pouce.setAttribute('transform', `translate(${f(bd[2])} ${f(bd[3] - 10)})`);
    show(F.ombre, !!o.ombre);
    F.og.setAttribute('ry', f(5.5 * (o.yeux == null ? 1 : o.yeux)));
    F.od.setAttribute('ry', f(5.5 * (o.yeux == null ? 1 : o.yeux)));
    F.bouche.setAttribute('ry', f(o.bouche == null ? 2 : o.bouche));
    F.bouche.setAttribute('rx', f(o.boucheL == null ? 12 : o.boucheL));
    F.casq.setAttribute('transform', `translate(0 ${f(o.casqY || 0)}) rotate(${f(o.casq || 0)} 0 -40)`);
    show(F.etoiles, !!o.etoiles);
    // la peur : blanc des yeux, petites pupilles, sourcils hauts, gouttes, moustache dressée
    const p = o.peur || 0;
    F.bgb.setAttribute('rx', f(11 * p)); F.bgb.setAttribute('ry', f(14 * p));
    F.bdb.setAttribute('rx', f(11 * p)); F.bdb.setAttribute('ry', f(14 * p));
    if (p) { F.og.setAttribute('rx', f(lerp(4.5, 2.6, p))); F.og.setAttribute('ry', f(lerp(5.5, 3, p))); F.od.setAttribute('rx', f(lerp(4.5, 2.6, p))); F.od.setAttribute('ry', f(lerp(5.5, 3, p))); }
    else { F.og.setAttribute('rx', 4.5); F.od.setAttribute('rx', 4.5); }
    const sy = -24 - 10 * p + 4 * (o.decide || 0);
    F.sourcils.setAttribute('d', `M-26 ${f(sy + 2 * (o.decide || 0))}Q-15 ${f(sy - 5)} -5 ${f(sy + 3 * (o.decide || 0))}M5 ${f(sy + 3 * (o.decide || 0))}Q15 ${f(sy - 5)} 26 ${f(sy + 2 * (o.decide || 0))}`);
    show(F.gouttes, p > 0.5);
    F.moust.setAttribute('transform', o.moustHaut ? `translate(0 ${f(-4 * o.moustHaut)}) scale(${f(1 + 0.15 * o.moustHaut)} ${f(1 - 0.1 * o.moustHaut)})` : p ? `translate(0 -6) scale(1.1 ${f(1 + 0.5 * p)})` : '');
    F.joues.setAttribute('opacity', f(o.joues || 0));
    // la force : muscles, torse bombé, halo, étincelles
    const m = o.muscles || 0;
    F.bg.setAttribute('stroke-width', f(24 + 18 * m)); F.bd.setAttribute('stroke-width', f(24 + 18 * m));
    F.torse.setAttribute('transform', `scale(${f(1 + 0.22 * m)} 1)`);
    const mid = (a) => [(a[0] + a[2]) / 2 + (a[0] < 0 ? -12 : 12), (a[1] + a[3]) / 2 - 6];
    const g1 = mid(bg), d1 = mid(bd);
    F.bcg.setAttribute('cx', f(g1[0])); F.bcg.setAttribute('cy', f(g1[1])); F.bcg.setAttribute('r', f(24 * m));
    F.bcd.setAttribute('cx', f(d1[0])); F.bcd.setAttribute('cy', f(d1[1])); F.bcd.setAttribute('r', f(24 * m));
    F.halo.setAttribute('opacity', f(o.halo || 0));
    show(F.eclats, (o.eclats || 0) > 0);
    F.tete.setAttribute('transform', o.tete || 'translate(0 -96)'); // la tête sur les épaules (les plans à terre la remplacent ensuite)
  }

  /* ==========================================================================
     LES OBJETS : le burger, le cornet de frites, la bière, la dernière frite, les miettes
     ========================================================================== */
  let clipN = 0;
  // la forme d'une morsure : l'union de quelques cercles, festonnée par les dents (échantillonnage polaire)
  function morsure(cercles, r) {
    const cx = cercles.reduce((s, c) => s + c[0], 0) / cercles.length, cy = cercles.reduce((s, c) => s + c[1], 0) / cercles.length;
    const pts = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU, dx = Math.cos(a), dy = Math.sin(a);
      let best = 0;
      cercles.forEach(([x, y, R]) => { // sortie du rayon hors du cercle
        const ox = cx - x, oy = cy - y, b = ox * dx + oy * dy, c = ox * ox + oy * oy - R * R, disc = b * b - c;
        if (disc >= 0) best = Math.max(best, -b + Math.sqrt(disc));
      });
      pts.push([cx + dx * best, cy + dy * best]);
    }
    return feston(pts, 4.2, 0.22, r);
  }
  function makeBurger(parent) {
    const r = rng(11 + clipN);
    const g0 = el('g', {}, parent);
    const id = 'h-mord' + (++clipN);
    const cp = el('clipPath', { id }, g0);
    const trou = el('path', { d: 'M-60 -60H60V60H-60Z', 'clip-rule': 'evenodd' }, cp);
    const g = el('g', { 'clip-path': `url(#${id})` }, g0);
    // le pain du bas, sa mie
    el('path', { d: 'M-30 9H30C31 17 27 22 18 22H-18C-27 22-31 17-30 9Z', fill: 'url(#h-painB)' }, g);
    el('path', { d: 'M-24 19Q0 23 24 19', fill: 'none', stroke: '#FFE3B5', 'stroke-width': 1.2, 'stroke-opacity': 0.45, 'stroke-linecap': 'round' }, g);
    // le steak : bord grumeleux, grillé
    const st = [];
    for (let i = 0; i <= 16; i++) st.push([-33 + (66 * i) / 16, -3 + (r() - 0.5) * 1.6]);
    for (let i = 16; i >= 0; i--) st.push([-32 + (64 * i) / 16, 12 + (r() - 0.5) * 1.8]);
    el('path', { d: lisse(st), fill: 'url(#h-steak)' }, g);
    let gr = '';
    for (let i = 0; i < 16; i++) gr += cercle(-28 + r() * 56, 1 + r() * 9, 0.6 + r() * 0.9);
    el('path', { d: gr, fill: '#8C5A38', opacity: 0.55 }, g);
    el('path', { d: 'M-30 3Q0 1 30 3', fill: 'none', stroke: '#A06A44', 'stroke-width': 1, 'stroke-opacity': 0.5 }, g);
    // le cheddar fondu qui coule sur le steak
    el('path', { d: 'M-34 -4H34L32 2Q29 2 28.5 7Q27.5 12.5 25.8 7.5L25 2H11Q9 3 8.6 9.5Q7.8 16 6 10L5 2H-15Q-17 3-17.4 6.5Q-18.2 11-19.8 6.6L-21 2H-32Z', fill: 'url(#h-fromage)' }, g);
    el('path', { d: 'M-30 -2.4H30', stroke: '#FFF0B0', 'stroke-width': 1, 'stroke-opacity': 0.8 }, g);
    // la tomate
    el('path', { d: 'M-31 -8.5H31Q32.5 -6 31 -3.5H-31Q-32.5 -6-31 -8.5Z', fill: '#D2402F' }, g);
    el('path', { d: 'M-27 -6H-12M-6 -6H9M15 -6H27', stroke: '#F27A5E', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, g);
    // la salade frisée qui déborde
    let s = 'M-36 -8';
    for (let i = 0; i <= 12; i++) { const x = -36 + i * 6; s += `Q${f(x + 3)} ${f(-14 - (i % 2) * 2.5)} ${f(x + 6)} ${f(-9 - (i % 3))}`; }
    s += 'L36 -6Q20 -3 0 -4Q-20 -3-36 -6Z';
    el('path', { d: s, fill: '#86B940' }, g);
    el('path', { d: 'M-30 -9Q-24 -12-18 -9M-6 -10Q0 -13 6 -10M16 -9Q22 -12 28 -9', fill: 'none', stroke: '#5E8F2A', 'stroke-width': 1.1, 'stroke-linecap': 'round' }, g);
    // le pain du haut : dôme doré brillant, graines de sésame
    el('path', { d: 'M-32 -9C-32 -27-17-34 0-34C17-34 32-27 32-9Q32-6 29-6H-29Q-32-6-32-9Z', fill: 'url(#h-painH)' }, g);
    el('path', { d: 'M-22 -24C-17 -30-8 -31 -2 -30.5C-10 -28-17 -25-21 -19Z', fill: '#FFF6E2', opacity: 0.55 }, g);
    el('path', { d: 'M-30 -9.5Q0 -7 30 -9.5', fill: 'none', stroke: '#8E4E20', 'stroke-width': 1.2, 'stroke-opacity': 0.5 }, g);
    let ses = '', sesO = '';
    [[-18, -22, 20], [-9, -27, -30], [2, -29, 10], [12, -26, 45], [21, -19, -10], [-24, -14, 60], [-4, -20, -60], [8, -18, 30], [17, -12, 80], [-13, -13, -20], [26, -12, 20], [-1, -12, 5]].forEach(([x, y, a]) => {
      const c = Math.cos((a * Math.PI) / 180), sn = Math.sin((a * Math.PI) / 180), P = (u, v) => [x + u * c - v * sn, y + u * sn + v * c];
      ses += lisse([P(-2, 0), P(0, -1), P(2, 0), P(0, 1)]);
      sesO += lisse([P(-2, 0.6), P(0, -0.3), P(2, 0.6), P(0, 1.6)]);
    });
    el('path', { d: sesO, fill: '#9A5A26', opacity: 0.45 }, g);
    el('path', { d: ses, fill: '#FBEFD2' }, g);
    return { g: g0, trou, r, n: 0 };
  }
  // les étapes de la morsure : 0 entier, 1 et 2 croqué, 3 presque fini
  const MORSURES = [[], [[33, -8, 13]], [[33, -8, 13], [22, 8, 15]], [[33, -8, 13], [22, 8, 15], [4, -14, 17], [8, 12, 12]]];
  function croque(B, n) {
    if (B.n === n) return;
    B.n = n;
    B.trou.setAttribute('d', 'M-60 -60H60V60H-60Z' + (n ? morsure(MORSURES[n], rng(40 + n)) : ''));
  }
  function makeFrites(parent) {
    const g = el('g', {}, parent);
    // l'intérieur du cornet (derrière les frites)
    el('path', { d: 'M-25 -12Q0 -19 25 -12L23 -4H-23Z', fill: '#8F6A3E' }, g);
    const sticks = el('g', {}, g);
    const liste = [];
    [[-15, -45, -12, 38], [7, -53, 7, 42], [-5, -50, -3, 40], [15, -41, 13, 32], [-20, -34, -18, 28], [2, -46, 2, 36], [19, -33, 17, 26], [-10, -40, -8, 32], [11, -47, 10, 38]].forEach(([x, y, a, L]) => {
      const fr = el('g', { transform: `rotate(${a} ${x} ${y + L})` }, sticks);
      el('rect', { x: x - 3.6, y, width: 7.2, height: L, rx: 1.6, fill: 'url(#h-frite)' }, fr);
      el('rect', { x: x - 3.6, y, width: 7.2, height: 3.2, rx: 1.4, fill: '#D58E3A', opacity: 0.75 }, fr);
      el('rect', { x: x - 2.6, y: y + 5, width: 1.6, height: L - 9, rx: 0.8, fill: '#FFF1C4', opacity: 0.7 }, fr);
      liste.push(fr);
    });
    // le cornet kraft Bougnat Burger
    el('path', { d: 'M-26 -12Q0 -6 26 -12L19 31Q0 35-19 31Z', fill: 'url(#h-cornet)' }, g);
    el('path', { d: 'M-26 -12Q0 -6 26 -12L25.2 -7.5Q0 -1.5-25.2 -7.5Z', fill: '#E7CDA2' }, g);
    el('path', { d: 'M-20 26Q0 30 20 26', fill: 'none', stroke: '#8F6A3E', 'stroke-width': 1, 'stroke-opacity': 0.5 }, g);
    el('path', { d: 'M13 -8L9 30', stroke: '#A9824F', 'stroke-width': 1, 'stroke-opacity': 0.55 }, g);
    logo(g, -1, 10, 0.3, '#8F6A3E');
    return { g, sticks, liste };
  }
  let clipB = 0;
  function makeBoisson(parent) {
    const g = el('g', {}, parent);
    const id = 'h-verre' + (++clipB);
    const cp = el('clipPath', { id }, g);
    el('path', { d: 'M-17.5 -24L17.5 -24L14 29Q0 31.5-14 29Z' }, cp);
    // la bière ambrée de la région, ses bulles
    const dedans = el('g', { 'clip-path': `url(#${id})` }, g);
    const liquide = el('g', {}, dedans);
    el('rect', { x: -20, y: -19, width: 40, height: 52, fill: 'url(#h-biere)' }, liquide);
    el('rect', { x: -20, y: -19, width: 40, height: 3, fill: '#FBD779', opacity: 0.9 }, liquide);
    let bu = '';
    const r = rng(5 + clipB);
    for (let i = 0; i < 14; i++) bu += cercle(-11 + r() * 22, -14 + r() * 40, 0.5 + r() * 0.8);
    el('path', { d: bu, fill: '#FFEDB8', opacity: 0.7 }, liquide);
    // la mousse, crémeuse, qui déborde un peu et coule
    const mousse = el('g', {}, g);
    el('path', { d: 'M-19 -20C-22 -28-16-34-9-32C-6-38 3-39 7-33C13-36 21-31 19-24C22-21 20-17 17-17Q17-12 15.5-9Q14-6 13.5-12L13-17H-17Q-20-17-19-20Z', fill: '#FFF8E8' }, mousse);
    el('path', { d: 'M-17 -19Q0 -15 17 -19L17 -17H-17Z', fill: '#E9D9B8' }, mousse);
    el('path', { d: 'M-12 -29C-9 -32-5 -31-4 -29M3 -33C6 -35 9 -34 10 -31', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.4, 'stroke-linecap': 'round' }, mousse);
    // le verre : reflets, fond épais
    el('path', { d: 'M-17.5 -24L17.5 -24L14 29Q0 31.5-14 29Z', fill: 'url(#h-verre)', stroke: '#FFF7E6', 'stroke-width': 1.4, 'stroke-opacity': 0.75 }, g);
    el('path', { d: 'M-13 -14L-11 22', stroke: '#FFFFFF', 'stroke-width': 2.4, 'stroke-opacity': 0.5, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M11 -12L10 4', stroke: '#FFFFFF', 'stroke-width': 1.2, 'stroke-opacity': 0.4, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M-13.5 26Q0 28.5 13.5 26L14 29Q0 31.5-14 29Z', fill: '#FFF3D6', opacity: 0.6 }, g);
    return { g, liquide, mousse };
  }
  function makeFrite(parent) {
    const g = el('g', {}, parent);
    el('rect', { x: -4.4, y: -23, width: 8.8, height: 46, rx: 2.6, fill: 'url(#h-frite)' }, g);
    el('rect', { x: -4.4, y: -23, width: 8.8, height: 4, rx: 2.2, fill: '#D58E3A', opacity: 0.8 }, g);
    el('rect', { x: -3.2, y: -16, width: 1.8, height: 34, rx: 0.9, fill: '#FFF3CE', opacity: 0.75 }, g);
    el('path', { d: 'M1 -6h1.2v1.2H1zM-1 6h1v1h-1zM2 12h1v1H2z', fill: '#FFFFFF', opacity: 0.9 }, g); // des grains de sel
    return g;
  }
  // une miette : pain, sésame, salade ou frite
  function miette(parent, i, r) {
    const k = i % 4;
    if (k === 0) return el('path', { d: lisse(tache(0, 0, 3.2, 2.4, 6, 0.3, r)), fill: i % 8 ? '#D69049' : '#E8B36A' }, parent);
    if (k === 1) return el('ellipse', { rx: 2, ry: 1, fill: '#FBEFD2' }, parent);
    if (k === 2) return el('path', { d: 'M-3 0Q-1.5 -3 0 0T3 0Q0 2-3 0Z', fill: '#86B940' }, parent);
    return el('rect', { x: -1.4, y: -3.4, width: 2.8, height: 6.8, rx: 1, fill: C.frite }, parent);
  }

  /* ==========================================================================
     LES NUAGES ET LES DÉCORS DE CIEL
     ========================================================================== */
  // un cumulus vu d'en haut : des lobes en chou-fleur ; dessous à l'ombre, dômes éclairés du nord-ouest, reflets ; son ombre au sol
  function nuageDessus(parent, pOmbre, w, r) {
    const g = el('g', {}, parent);
    const h = w * (0.5 + r() * 0.16);
    const d = feston(tache(0, 0, w * 0.5, h * 0.5, 16, 0.2, r, r() * 30 - 15), w * 0.085, 0.34, r);
    // le dessous à l'ombre (côté est), puis le corps éclairé, décalé vers le soleil
    el('path', { d, fill: '#C8B3BE' }, g);
    el('path', { d, fill: '#EFE0D8', transform: `translate(${f(-w * 0.028)} ${f(-w * 0.032)}) scale(0.93)` }, g);
    // les dômes du chou-fleur : flanc à l'ombre, sommet éclairé
    let dd = '';
    for (let i = 0, n = 4 + Math.floor(r() * 3); i < n; i++) {
      const a = r() * TAU, rr = w * (0.09 + r() * 0.08), dist = Math.sqrt(r()) * w * 0.24;
      dd += feston(tache(Math.cos(a) * dist * 1.25 - w * 0.03, Math.sin(a) * dist * 0.62 - w * 0.03, rr, rr * 0.84, 9, 0.18, r, r() * 180), rr * 0.45, 0.3, r);
    }
    el('path', { d: dd, fill: '#DCC8C7', transform: `translate(${f(w * 0.014)} ${f(w * 0.016)})` }, g);
    el('path', { d: dd, fill: '#FAF1E8' }, g);
    el('path', { d: lisse(tache(-w * 0.16, -h * 0.16, w * 0.13, h * 0.08, 8, 0.2, r, -20)), fill: '#FFFFFF', opacity: 0.6 }, g);
    const o = el('path', { d, fill: '#101808', 'fill-opacity': 0.22 }, pOmbre);
    return { g, o };
  }
  // un cumulus d'affiche : des bosses nettes posées sur une base plate ; liseré de lumière côté soleil, base ombrée
  let clipN2 = 0;
  // la silhouette d'un rang de bosses (arcs de cercle exacts) posé sur une base plate
  function bosses(w, r, n) {
    const C2 = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      const k = Math.sin(((i + 0.5) / n) * Math.PI);
      const R = w * (0.1 + 0.13 * k) * (0.75 + r() * 0.5);
      if (i) x += (C2[i - 1][2] + R) * (0.56 + r() * 0.18);
      C2.push([x, -R * (0.28 + r() * 0.3), R]);
    }
    const dx = (C2[0][0] + C2[n - 1][0]) / 2;
    C2.forEach((c) => { c[0] -= dx; });
    const inter = (A, B) => { // intersection haute de deux cercles
      const ddx = B[0] - A[0], ddy = B[1] - A[1], d = Math.hypot(ddx, ddy);
      const a = (A[2] * A[2] - B[2] * B[2] + d * d) / (2 * d), h = Math.sqrt(Math.max(0, A[2] * A[2] - a * a));
      const px = A[0] + (a * ddx) / d, py = A[1] + (a * ddy) / d;
      const p1 = [px - (h * ddy) / d, py + (h * ddx) / d], p2 = [px + (h * ddy) / d, py - (h * ddx) / d];
      return p1[1] < p2[1] ? p1 : p2;
    };
    const c0 = C2[0], cn = C2[n - 1];
    const xL = c0[0] - Math.sqrt(Math.max(0, c0[2] * c0[2] - c0[1] * c0[1])), xR = cn[0] + Math.sqrt(Math.max(0, cn[2] * cn[2] - cn[1] * cn[1]));
    let d = `M${pt(xL, 0)}`, prev = [xL, 0];
    for (let i = 0; i < n; i++) {
      const c = C2[i], end = i < n - 1 ? inter(c, C2[i + 1]) : [xR, 0];
      const a0 = Math.atan2(prev[1] - c[1], prev[0] - c[0]), a1 = Math.atan2(end[1] - c[1], end[0] - c[0]);
      const span = (a1 - a0 + TAU * 2) % TAU;
      d += `A${f(c[2])} ${f(c[2])} 0 ${span > Math.PI ? 1 : 0} 1 ${pt(end[0], end[1])}`;
      prev = end;
    }
    d += `Q${pt(0, w * 0.025)} ${pt(xL, 0)}Z`;
    return { d, xL, xR, hmax: Math.max(...C2.map((c) => c[2] - c[1])) };
  }
  function nuageAffiche(parent, w, r, pal, lum = -1, op = 1) {
    const { d, xL, xR, hmax } = bosses(w, r, 3 + Math.floor(r() * 4));
    const g = el('g', { opacity: op }, parent);
    if (w > 110 && r() < 0.75) { // un second étage de bosses, plus petit, en retrait au-dessus
      const t2 = bosses(w * (0.42 + r() * 0.16), r, 2 + Math.floor(r() * 3));
      const tx = (r() - 0.5) * w * 0.32, ty = -hmax * (0.42 + r() * 0.12);
      el('path', { d: t2.d, fill: pal[0], transform: `translate(${f(tx + lum * w * 0.012)} ${f(ty - w * 0.014)})` }, g);
      el('path', { d: t2.d, fill: pal[1], transform: `translate(${f(tx)} ${f(ty)})` }, g);
    }
    el('path', { d, fill: pal[0], transform: `translate(${f(lum * w * 0.014)} ${f(-w * 0.016)})` }, g);
    el('path', { d, fill: pal[1] }, g);
    const id = 'h-nu' + (++clipN2);
    const cp = el('clipPath', { id }, g);
    el('path', { d }, cp);
    let b = `M${pt(xL - 4, -hmax * 0.3)}`;
    for (let i = 0; i <= 8; i++) { const xx = lerp(xL - 4, xR + 4, i / 8); b += `Q${pt(xx - (xR - xL) / 16, -hmax * (0.3 + (i % 2 ? 0.1 : -0.02)))} ${pt(xx, -hmax * 0.3)}`; }
    b += `L${pt(xR + 4, 8)}L${pt(xL - 4, 8)}Z`;
    el('path', { d: b, fill: pal[2], 'clip-path': `url(#${id})` }, g);
    return g;
  }
  const PAL_COUCHANT = ['#FFE8C4', '#F3C8B4', '#D79CA0'];
  const PAL_HAUT = ['#FFF4E4', '#EEE4E2', '#BDB8CC'];
  const PAL_DESSOUS = ['#FFF0D8', '#D9D3DC', '#AFA8C0'];
  const PAL_LOIN = ['#F8D9C0', '#E9BDB2', '#C99AA6'];

  // le profil relevé du puy de Dôme (tools/puys/puy-de-dome.json, simplifié) : [x photo, hauteur], sommet en x = 259
  const DOME = [[0, 0], [8, 3.5], [20, 7.5], [33, 12.5], [46, 16.5], [64, 21.5], [75, 23], [88, 28.5], [99, 30.5], [108, 34.5], [117, 35], [124, 38],
    [135, 40.5], [156, 46], [169, 47.5], [187, 58.5], [205, 68], [220, 76.5], [233, 84], [247, 90.5], [255, 93], [259, 94.5], [263, 93], [266, 91.5],
    [273, 88], [280, 85], [290, 84], [303, 81], [314, 79], [332, 77], [352, 73.5], [373, 58.5], [387, 44], [403, 34.5], [426, 24.5], [447, 15.5],
    [460, 9.5], [475, 2.5], [494, 0]];
  const hDome = (x) => { // hauteur du profil en x (repère photo)
    for (let i = 1; i < DOME.length; i++) if (x <= DOME[i][0]) { const [x0, h0] = DOME[i - 1], [x1, h1] = DOME[i]; return lerp(h0, h1, (x - x0) / (x1 - x0)); }
    return 0;
  };
  // la voie du Panoramique sur la face du dôme (repère du dôme de côté : sommet en 0, base en 94,5)
  const voieY = (x) => 94.5 - hDome(x + 259) * lerp(0.3, 0.9, clamp((175 - x) / 235));
  // le puy de Dôme vu de côté, sommet en (0, 0), base en y = 94,5 (unités de la photo) : flanc éclairé à gauche,
  // ceinture de hêtres, la voie du Panoramique, le sommet et l'antenne
  function domeCote(parent, o = {}) {
    const g = el('g', {}, parent);
    const r = rng(o.graine || 3);
    const P = DOME.map(([x, h]) => [x - 259, 94.5 - h]);
    // la silhouette se prolonge en un large plateau : aucun bord ne se voit, même quand la caméra penche
    const sil = `M${pt(P[0][0] - 700, 900)}L${pt(P[0][0] - 700, 99)}L${pt(P[0][0] - 20, 96)}` + P.map((p) => 'L' + pt(p[0], p[1])).join('') + `L${pt(P[P.length - 1][0] + 30, 96)}L${pt(P[P.length - 1][0] + 700, 99)}L${pt(P[P.length - 1][0] + 700, 900)}Z`;
    if (o.plat) { el('path', { d: sil, fill: o.plat }, g); return g; }
    el('path', { d: sil, fill: 'url(#h-domeCote)' }, g);
    // la voie du Panoramique des Dômes qui monte en écharpe sur la face (elle entre dans la hêtraie en bas)
    const voie = [];
    for (let x = 175; x >= -60; x -= 8) voie.push([x, voieY(x)]);
    el('path', { d: lisse(voie, false), fill: 'none', stroke: '#2E3B22', 'stroke-width': 2.2, 'stroke-opacity': 0.35, transform: 'translate(0.6 0.8)' }, g);
    el('path', { d: lisse(voie, false), fill: 'none', stroke: '#EDE3CB', 'stroke-width': 1.3, 'stroke-opacity': 0.9 }, g);
    // la ceinture de hêtres des pentes basses : une lisière festonnée qui suit la pente
    const haut = [];
    for (let x = -300; x <= 270; x += 9) haut.push([x, 94.5 - Math.min(hDome(x + 259), 26 + Math.sin(x * 0.05) * 5 + Math.sin(x * 0.13) * 3) + 2]);
    let d = `M${pt(-960, 130)}L${pt(-960, 96.5)}L${pt(haut[0][0], haut[0][1])}`;
    for (let i = 1; i < haut.length; i++) { const a = haut[i - 1], b = haut[i]; d += `Q${pt((a[0] + b[0]) / 2, Math.min(a[1], b[1]) - 3.2 - r() * 2)} ${pt(b[0], b[1])}`; }
    d += `L${pt(940, 96.5)}L${pt(940, 130)}Z`;
    el('path', { d, fill: '#6E8537', transform: 'translate(-1.2 -1)' }, g);
    el('path', { d, fill: '#3F5226' }, g);
    // les ravines et la lumière rasante sur le flanc ouest
    let rv = '';
    for (let i = 0; i < 9; i++) { const x = -226 + i * 24 + r() * 12, hh = hDome(x + 259); if (hh < 30) continue; rv += `M${pt(x, 94.5 - hh + 5)}Q${pt(x - 4, 94.5 - hh * 0.6)} ${pt(x - 10 - r() * 6, 94.5 - Math.max(24, hh * 0.3))}`; }
    el('path', { d: rv, fill: 'none', stroke: '#B4BD72', 'stroke-width': 1.1, 'stroke-opacity': 0.4, 'stroke-linecap': 'round' }, g);
    el('path', { d: 'M' + P.slice(0, 22).map((p) => pt(p[0], p[1] + 0.8)).join('L'), fill: 'none', stroke: '#F3DCA0', 'stroke-width': 1.6, 'stroke-opacity': 0.75, 'stroke-linejoin': 'round' }, g);
    // le sommet : l'observatoire, la gare, l'antenne (mât effilé, paliers)
    el('path', { d: 'M-12 1h7v-4h5v4h3v-2h4v2h2V3h-21z', fill: '#EDE5D2' }, g);
    el('path', { d: 'M-1.2 0.5L-0.55 -17L0 -21.5L0.55 -17L1.2 0.5Z', fill: '#EFE8DA' }, g);
    el('path', { d: 'M-2.2 -7.5h4.4v1.2h-4.4zM-1.8 -12.5h3.6v1h-3.6z', fill: '#DAD2C0' }, g);
    el('path', { d: 'M0.3 0.5L0.55 -17L0 -21.5Z', fill: '#A8A08F', opacity: 0.6 }, g);
    return g;
  }
  // la ligne des Puys au loin : bosses arrondies, cratères, cônes égueulés (d'après tools/puys/build.py)
  function chaine(x0, x1, base, k, graine) {
    const r = rng(graine), bosses = [];
    for (let x = x0; x < x1; x += 50 + r() * 80) bosses.push([x, 50 + r() * 70, 14 + r() * 24, r() < 0.3 ? 0.25 + r() * 0.3 : 0]);
    const h = (x) => {
      let v = 5 + 2 * Math.sin(x / 37 + graine) + 1.5 * Math.sin(x / 13 + graine * 2);
      bosses.forEach(([cx, w, hh, cr]) => {
        const u = Math.abs(x - cx) / (w / 2);
        if (u < 1) { let b = hh * Math.pow(Math.cos((u * Math.PI) / 2), 1.3); if (cr) b -= hh * cr * Math.exp(-Math.pow((x - cx) / (w * 0.13), 2)); v = Math.max(v, b); }
      });
      return v * k;
    };
    let d = `M${x0} ${base + 900}L${x0} ${f(base - h(x0))}`;
    for (let x = x0 + 6; x <= x1; x += 6) d += `L${x} ${f(base - h(x))}`;
    return d + `L${x1} ${base + 900}Z`;
  }
  // une colline qui ondule
  function colline(x0, x1, y, amp, per, ph) {
    let d = `M${x0} ${y + 900}L${x0} ${f(y - amp * (0.5 + 0.5 * Math.sin(x0 / per + ph)))}`;
    for (let x = x0 + 12; x <= x1; x += 12) d += `L${x} ${f(y - amp * (0.5 + 0.5 * Math.sin(x / per + ph)) - amp * 0.25 * Math.sin(x / (per * 0.37) + ph * 2))}`;
    return d + `L${x1} ${y + 900}Z`;
  }
  // une touffe d'herbe : quelques brins effilés (clairs à gauche, sombres à droite)
  function touffe(x, y, h, r) {
    let c = '', s = '';
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = (i / (n - 1) - 0.5) * 1.2 + (r() - 0.5) * 0.3, L = h * (0.6 + r() * 0.5), w = h * 0.07 + 0.5;
      const bx = x + (i - n / 2) * w * 0.9, tx = bx + Math.sin(a) * L, ty = y - Math.cos(a) * L;
      const d = `M${pt(bx - w, y)}Q${pt(bx + Math.sin(a) * L * 0.5 - w * 0.3, y - Math.cos(a) * L * 0.55)} ${pt(tx, ty)}Q${pt(bx + Math.sin(a) * L * 0.45 + w * 0.6, y - Math.cos(a) * L * 0.5)} ${pt(bx + w, y)}Z`;
      if (a < 0.05) c += d; else s += d;
    }
    return [c, s];
  }

  /* ==========================================================================
     L'AVION, LA CABINE, LA BANQUETTE ET LES DEUX SACS, LA PORTE
     ========================================================================== */
  // le petit avion de largage vu de dessus (nez vers -y) : crème et olive ; sa silhouette sert aussi d'ombre
  const AVION = {
    aile: 'M-97 -35Q-101 -24 -97 -13L97 -13Q101 -24 97 -35Z',
    corps: 'M0 -86C6.5 -86 9 -79 9 -66L10.5 -40C10.5 -2 8.4 30 4.2 62L-4.2 62C-8.4 30-10.5 -2-10.5 -40L-9 -66C-9 -79-6.5 -86 0 -86Z',
    queue: 'M-33 52Q-34 45 -27 44L27 44Q34 45 33 52L32 57L-32 57Z',
  };
  function makeAvion(parent) {
    const g = el('g', {}, parent);
    const ombre = el('g', { opacity: 0.4 }, g);
    ['aile', 'corps', 'queue'].forEach((k) => el('path', { d: AVION[k], fill: '#101808' }, ombre));
    const corps = el('g', {}, g);
    el('path', { d: AVION.aile, fill: 'url(#h-avion)' }, corps);
    el('path', { d: 'M-97 -35Q-101 -24 -97 -13L-80 -13L-80 -35Z M97 -35Q101 -24 97 -13L80 -13L80 -35Z', fill: C.olive }, corps);
    el('path', { d: 'M-78 -17H-20M20 -17H78', stroke: '#B9AE96', 'stroke-width': 1, 'stroke-opacity': 0.8 }, corps);
    el('path', { d: 'M-96 -34.2H96', stroke: '#FFFFFF', 'stroke-width': 1.2, 'stroke-opacity': 0.8 }, corps);
    el('path', { d: AVION.queue, fill: 'url(#h-avion)' }, corps);
    el('path', { d: 'M-33 52Q-34 45 -27 44L-24 44L-24 57L-32 57Z M33 52Q34 45 27 44L24 44L24 57L32 57Z', fill: C.olive }, corps);
    el('path', { d: AVION.corps, fill: 'url(#h-avion)' }, corps);
    el('path', { d: 'M0 -86C6.5 -86 9 -79 9 -66L9.4 -60H-9.4L-9 -66C-9 -79-6.5 -86 0 -86Z', fill: C.olive2 }, corps); // le capot moteur
    el('path', { d: 'M-2.2 -58L-2.6 60M2.2 -58L2.6 60', stroke: C.olive, 'stroke-width': 1.6 }, corps); // le filet olive
    el('path', { d: 'M-8.4 -56Q0 -60 8.4 -56L8.8 -44Q0 -47-8.8 -44Z', fill: '#34505C' }, corps); // le pare-brise
    el('path', { d: 'M-6 -55Q-2 -57 1 -56.5L-5.5 -47Z', fill: '#BFD6DC', opacity: 0.6 }, corps);
    el('rect', { x: -1.4, y: 40, width: 2.8, height: 24, rx: 1.2, fill: '#D5CBB6' }, corps); // la dérive, vue par la tranche
    const imm = el('text', { x: 58, y: -20.5, 'text-anchor': 'middle', 'font-family': 'Instrument Sans, sans-serif', 'font-weight': 700, 'font-size': 8.5, fill: C.olive2, 'letter-spacing': 1.2 }, corps);
    imm.textContent = 'F-BRGR';
    const helice = el('g', { transform: 'translate(0 -88)' }, corps);
    el('circle', { r: 19, fill: 'url(#h-helice)' }, helice);
    const pales = el('g', {}, helice);
    el('path', { d: 'M-1.4 -18Q0 -19.5 1.4 -18L1 0 1.4 18Q0 19.5-1.4 18L-1 0Z', fill: '#3A3128', opacity: 0.35 }, pales);
    el('path', { d: 'M-18 -1.4Q-19.5 0-18 1.4L0 1 18 1.4Q19.5 0 18-1.4L0-1Z', fill: '#3A3128', opacity: 0.2 }, pales);
    el('circle', { r: 3.4, fill: '#E8E0CF' }, helice);
    return { g, ombre, corps, pales };
  }
  // la paroi de la cabine : couples, lisses, rivets, plafond et plancher
  function makeParoi(parent) {
    const g = el('g', {}, parent);
    el('rect', { x: -60, y: -60, width: W + 120, height: H + 120, fill: 'url(#h-paroi)' }, g);
    el('path', { d: 'M-60 96H660M-60 612H660', stroke: '#C9B998', 'stroke-width': 3 }, g);
    el('path', { d: 'M-60 99H660M-60 615H660', stroke: '#FBF4E4', 'stroke-width': 1.2, 'stroke-opacity': 0.8 }, g);
    let riv = '', rivC = '';
    for (let i = 0; i < 6; i++) {
      const x = -30 + i * 128;
      el('rect', { x, y: -60, width: 26, height: H + 120, fill: 'url(#h-couple)' }, g);
      el('rect', { x: x + 26, y: -60, width: 6, height: H + 120, fill: '#B3A280', opacity: 0.35 }, g);
      for (let y = 10; y < H; y += 34) { riv += cercle(x + 7, y, 1.7) + cercle(x + 19, y + 17, 1.7); rivC += cercle(x + 6.4, y - 0.6, 0.7) + cercle(x + 18.4, y + 16.4, 0.7); }
    }
    el('path', { d: riv, fill: '#B8A785' }, g);
    el('path', { d: rivC, fill: '#FFF9EC' }, g);
    // le plafond et la barre d'accroche des sangles d'ouverture
    el('rect', { x: -60, y: -60, width: W + 120, height: 106, fill: '#BCAB89', opacity: 0.5 }, g);
    el('rect', { x: -60, y: 26, width: W + 120, height: 9, rx: 4.5, fill: C.olive2 }, g);
    el('rect', { x: -60, y: 27, width: W + 120, height: 2.4, fill: '#A5B25E', opacity: 0.8 }, g);
    for (let i = 0; i < 7; i++) el('path', { d: `M${40 + i * 96} 35v10`, stroke: '#8C7E62', 'stroke-width': 3 }, g);
    // le plancher
    el('rect', { x: -60, y: 706, width: W + 120, height: 140, fill: '#4A3F33' }, g);
    el('rect', { x: -60, y: 706, width: W + 120, height: 4, fill: '#8E7E66' }, g);
    let pl = '';
    for (let x = -40; x < W + 60; x += 70) pl += `M${x} 712L${x - 30} 846`;
    el('path', { d: pl, stroke: '#3A3128', 'stroke-width': 2 }, g);
    return g;
  }
  // une main (dos de la main, doigts vers +y) : ouverte ou refermée ; la manche indigo de la blouse
  function makeMain(parent, longueManche = 300) {
    const g = el('g', {}, parent);
    el('path', { d: `M-31 ${-longueManche}L31 ${-longueManche}L27 -52Q0 -44-27 -52Z`, fill: 'url(#h-manche)' }, g);
    el('path', { d: `M14 ${-longueManche}L17 -60`, stroke: '#27385A', 'stroke-width': 3, 'stroke-opacity': 0.6 }, g);
    el('path', { d: 'M-29 -62Q0 -53 29 -62L28 -44Q0 -35-28 -44Z', fill: '#2C3E62' }, g);
    el('path', { d: 'M-27 -58Q0 -50 27 -58', fill: 'none', stroke: '#6682AA', 'stroke-width': 1.6, 'stroke-opacity': 0.8 }, g);
    const ouverte = el('g', {}, g), fermee = el('g', {}, g);
    // ouverte : la paume, quatre doigts un peu écartés, le pouce
    el('path', { d: 'M-21 -46C-26 -24-26 -2-20 12L19 12C25 -2 26 -24 21 -46Z', fill: 'url(#h-peau)' }, ouverte);
    [[-15, 6, 36, -8], [-5, 8, 42, -2], [5, 8, 41, 3], [14.5, 6, 34, 9]].forEach(([x, y, L, a]) => {
      el('rect', { x: x - 4.6, y, width: 9.2, height: L, rx: 4.6, fill: 'url(#h-peau)', transform: `rotate(${a} ${x} ${y})` }, ouverte);
      el('path', { d: `M${x - 2.4} ${y + L - 8}h4.8`, stroke: '#F6CDB2', 'stroke-width': 3, 'stroke-linecap': 'round', transform: `rotate(${a} ${x} ${y})` }, ouverte);
    });
    el('path', { d: 'M-19 -22C-30 -18-38 -6-39 6C-39 11-34 12-31 8C-28 0-24 -8-16 -12Z', fill: '#E39C77' }, ouverte);
    el('path', { d: 'M-12 2Q-7 5-2 2M6 2Q11 5 15 2', fill: 'none', stroke: '#C77A58', 'stroke-width': 1.2, 'stroke-opacity': 0.6 }, ouverte);
    // refermée sur l'anse : les jointures en rang, le pouce par-dessus
    el('path', { d: 'M-22 -46C-27 -24-26 -4-22 8Q-12 24 0 24Q14 24 22 8C26 -4 27 -24 22 -46Z', fill: 'url(#h-peau)' }, fermee);
    el('path', { d: 'M-20 6Q-15 14-9 8Q-4 15 1 8Q6 15 11 8Q16 14 20 5', fill: 'none', stroke: '#C77A58', 'stroke-width': 1.4, 'stroke-opacity': 0.7 }, fermee);
    el('path', { d: 'M-21 -16C-28 -6-24 8-12 10C-6 10-8 4-12 2C-16 0-15 -8-12 -14Z', fill: '#E39C77' }, fermee);
    return { g, ouverte, fermee };
  }

  /* ==========================================================================
     LES EFFETS : bouffées de fumée, éclat du choc, traits de vitesse, gloire dorée, étincelles, iris
     ========================================================================== */
  // une bouffée de fumée (rayon 40) : ombre en bas à droite, reflet en haut à gauche
  function bouffee(parent, r, terre) {
    const g = el('g', {}, parent);
    const d = feston(tache(0, 0, 40, 36, 9, 0.12, r, r() * 180), 15, 0.24, r);
    el('path', { d, fill: terre ? '#9A8769' : '#AFA28B', transform: 'translate(5 7)' }, g);
    el('path', { d, fill: terre ? '#CBBB9D' : '#DAD0BD' }, g);
    el('path', { d, fill: terre ? '#E3D6BD' : '#F0E9DC', transform: 'translate(-7 -8) scale(0.78)' }, g);
    el('path', { d: lisse(tache(-15, -16, 12, 8, 7, 0.2, r, -30)), fill: '#FFFFFF', opacity: 0.7 }, g);
    return g;
  }
  // un éclat à quatre branches (étincelle)
  const ETOILE = 'M0 -12C1.2 -3 3 -1.2 12 0C3 1.2 1.2 3 0 12C-1.2 3-3 1.2-12 0C-3 -1.2-1.2 -3 0 -12Z';
  function etincelle(parent) {
    const g = el('g', {}, parent);
    el('circle', { r: 14, fill: 'url(#h-eclat)' }, g);
    el('path', { d: ETOILE, fill: '#FFF7DA' }, g);
    return g;
  }

  /* ========================================================================== */
  class Histoire {
    constructor(host, opts = {}) {
      this.host = host;
      this.o = opts;
      this.duration = DUREE;
      this.plans = PLANS;
      this.t = 0;
      this.speed = 1;
      this.playing = false;
      this.onEvent = null;
      this.onPlan = null;
      this._plan = -1;
      this.reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      this._nait = performance.now();
      this._build();
      this.seek(0);
      this._vis = true;
      if ('IntersectionObserver' in window) {
        this._io = new IntersectionObserver((es) => { this._vis = es[0].isIntersecting; if (this._vis && this.playing) this._loop(); });
        this._io.observe(host);
      }
    }

    _build() {
      // le personnage : la version dessinée si elle est chargée (js/film/bb-bougnat-dessin.js), sinon l'animatique
      const R = BB.BougnatDessin || {};
      this.rig = {
        makeProfil: R.makeProfil || makeProfil, poseProfil: R.poseProfil || poseProfil,
        makeDos: R.makeDos || makeDos, poseDos: R.poseDos || poseDos,
        makeFace: R.makeFace || makeFace, poseFace: R.poseFace || poseFace,
      };
      this.P = Object.assign({}, POSES, R.POSES || {});
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid slice', class: 'bb-histoire', 'aria-hidden': 'true' });
      svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;overflow:hidden';
      const defs = el('defs', {}, svg);
      defs.innerHTML = DEFS;
      carteAerienne(defs);
      const S = (this.S = {});
      S.svg = svg;
      const r = rng(63);

      /* ----- scène « carte vue du ciel » (plans 1, 5, 7, 12) ----- */
      S.aerien = el('g', {}, svg);
      S.carte = el('use', { href: '#h-carte' }, S.aerien);
      S.ombresAer = el('g', {}, S.aerien);
      S.avion = makeAvion(S.aerien);
      S.nuagesAer = el('g', {}, S.aerien);
      this.nAer = [];
      for (let i = 0; i < 10; i++) {
        const n = nuageDessus(S.nuagesAer, S.ombresAer, 150 + r() * 130, r);
        this.nAer.push({ c: n.g, o: n.o, a: r() * TAU, d: 60 + r() * 300, ph: r() });
      }
      S.dos = this.rig.makeDos(S.aerien);
      S.objAer = el('g', {}, S.aerien);
      S.burgerA = makeBurger(S.objAer); S.fritesA = makeFrites(S.objAer); S.boissonA = makeBoisson(S.objAer);
      S.pov = el('g', {}, S.aerien); // ses mains, en vue subjective
      S.povG = el('g', {}, S.pov); S.povD = el('g', {}, S.pov);
      [S.povG, S.povD].forEach((g) => { const m = makeMain(g, 420); show(m.fermee, false); m.g.setAttribute('transform', 'scale(1.5)'); });
      S.traitsRad = el('g', { fill: 'url(#h-filet)' }, S.aerien);
      this.tRad = [];
      for (let i = 0; i < 34; i++) this.tRad.push({ l: el('path', { d: 'M0 0L1 -0.5L1 0.5Z' }, S.traitsRad), a: r() * TAU, p: r(), w: 2 + r() * 5 });

      /* ----- scène « cabine » (plans 2, 3, 4) ----- */
      S.cabine = el('g', {}, svg);
      S.paroi = makeParoi(S.cabine);
      // le hublot (plan 2) : la jante de la marque, la vitre, les Puys qui défilent, la buée
      S.hub = el('g', {}, S.cabine);
      // des anneaux (et non des disques) : la vitre reste vide, la carte peut venir du calque de dessous
      const anneau = (R, cx = 0, cy = 0) => cercle(cx, cy, R) + cercle(0, 0, 149.5);
      el('path', { d: anneau(250), fill: 'url(#h-flaque)', opacity: 0.8, 'fill-rule': 'evenodd' }, S.hub);
      el('path', { d: anneau(176, 5, 7), fill: '#1A130F', opacity: 0.1, 'fill-rule': 'evenodd' }, S.hub);
      el('path', { d: anneau(172), fill: '#D5C6A8', 'fill-rule': 'evenodd' }, S.hub);
      el('path', { d: anneau(164), fill: '#BFAE8C', 'fill-rule': 'evenodd' }, S.hub);
      const hv = el('g', { 'clip-path': 'url(#h-hublot)' }, S.hub);
      S.hubFond = el('rect', { x: -160, y: -160, width: 320, height: 320, fill: '#8FA05A' }, hv);
      S.hubCarte = el('use', {}, hv); // la carte vectorielle n'y est clonée qu'en repli (voir _carte)
      S.hubNuages = el('g', {}, hv);
      this.nHub = [];
      for (let i = 0; i < 3; i++) { const n = nuageDessus(S.hubNuages, S.hubNuages, 100 + r() * 60, r); show(n.o, false); this.nHub.push({ c: n.g, x: i * 260 + r() * 80, y: -118 + (i % 2) * 40 }); }
      el('rect', { x: -160, y: -160, width: 320, height: 320, fill: 'url(#h-voileHublot)' }, hv);
      S.hubBuee = el('ellipse', { cx: -84, cy: 40, rx: 70, ry: 48, fill: 'url(#h-buee)', opacity: 0 }, hv);
      el('circle', { r: 150, fill: 'url(#h-vitre)' }, hv);
      el('path', { d: 'M-118 -40L-40 -118L-18 -112L-112 -18Z', fill: '#FFFFFF', opacity: 0.16 }, hv);
      el('path', { d: 'M-92 22L22 -92L32 -86L-86 32Z', fill: '#FFFFFF', opacity: 0.1 }, hv);
      el('circle', { r: 162, fill: 'none', stroke: 'url(#h-jante2)', 'stroke-width': 8 }, S.hub);
      el('circle', { r: 152, fill: 'none', stroke: 'url(#h-jante)', 'stroke-width': 18 }, S.hub);
      el('circle', { r: 143, fill: 'none', stroke: C.vert, 'stroke-width': 2.2 }, S.hub);
      el('path', { d: 'M-128 -80A152 152 0 0 1 -30 -149', fill: 'none', stroke: '#FFFDF2', 'stroke-width': 4, 'stroke-opacity': 0.45, 'stroke-linecap': 'round' }, S.hub);
      el('path', { d: 'M126 84A152 152 0 0 1 40 146', fill: 'none', stroke: '#1E240C', 'stroke-width': 4, 'stroke-opacity': 0.35, 'stroke-linecap': 'round' }, S.hub);
      for (let i = 0; i < 12; i++) { // les boulons de la jante
        const a = (i / 12) * TAU + 0.26, x = Math.cos(a) * 152, y = Math.sin(a) * 152;
        el('circle', { cx: f(x), cy: f(y), r: 3.6, fill: '#5E6A2B' }, S.hub);
        el('circle', { cx: f(x - 0.9), cy: f(y - 0.9), r: 2.2, fill: '#B9C47A' }, S.hub);
      }
      // la banquette capitonnée sous lui (plan 2)
      S.siege = el('g', {}, S.cabine);
      el('path', { d: 'M-60 700H470L462 712H-60Z', fill: '#1A130F', opacity: 0.3 }, S.siege);
      el('path', { d: 'M-60 572H444Q454 572 454 584V700H-60Z', fill: '#5B6729' }, S.siege);
      el('path', { d: 'M-60 600H454', stroke: '#48531F', 'stroke-width': 2 }, S.siege);
      el('path', { d: 'M-60 548H436Q454 548 454 564V574Q454 588 436 588H-60Z', fill: 'url(#h-banc)' }, S.siege);
      let cap = '';
      for (let x = -40; x < 400; x += 44) cap += `M${x} 552L${x + 22} 584M${x + 22} 552L${x} 584`;
      el('path', { d: cap, stroke: '#56622A', 'stroke-width': 1.4, 'stroke-opacity': 0.7 }, S.siege);
      for (let x = -29; x < 420; x += 44) el('circle', { cx: x, cy: 568, r: 2.2, fill: '#4B5623' }, S.siege);
      el('path', { d: 'M-60 550H436Q450 550 452 560', fill: 'none', stroke: '#B4C173', 'stroke-width': 2, 'stroke-opacity': 0.7 }, S.siege);
      el('path', { d: 'M-60 588H436Q452 588 454 576', fill: 'none', stroke: '#48531F', 'stroke-width': 2.4 }, S.siege);
      // la banquette et les deux sacs (plan 3, vue de dessus)
      S.banc = el('g', {}, S.cabine);
      el('rect', { x: -700, y: -600, width: 1400, height: 1200, fill: '#4B4034' }, S.banc);
      let pl = '';
      for (let x = -700; x < 700; x += 58) pl += `M${x} -600V600`;
      for (let y = -560; y < 600; y += 150) pl += `M-700 ${y}H700`;
      el('path', { d: pl, stroke: '#3A3128', 'stroke-width': 2.4 }, S.banc);
      el('path', { d: pl.replace(/M(-?\d+) /g, (m, x) => `M${+x + 3} `), stroke: '#6B5C49', 'stroke-width': 0.8, 'stroke-opacity': 0.6 }, S.banc);
      el('rect', { x: -312, y: -208, width: 624, height: 424, rx: 38, fill: '#1A130F', opacity: 0.35, transform: 'translate(14 16)' }, S.banc);
      el('rect', { x: -306, y: -206, width: 612, height: 412, rx: 36, fill: '#56622A' }, S.banc);
      el('rect', { x: -300, y: -200, width: 600, height: 400, rx: 32, fill: 'url(#h-banc)' }, S.banc);
      let q = '';
      for (let x = -300; x <= 300; x += 75) q += `M${x} -200L${x + 150} 0L${x} 200M${x} -200L${x - 150} 0L${x} 200`;
      const cpB = el('clipPath', { id: 'h-banc-clip' }, S.banc);
      el('rect', { x: -300, y: -200, width: 600, height: 400, rx: 32 }, cpB);
      const qg = el('g', { 'clip-path': 'url(#h-banc-clip)' }, S.banc);
      el('path', { d: q, stroke: '#5A6628', 'stroke-width': 2.2, fill: 'none' }, qg);
      el('path', { d: q, stroke: '#A3B05E', 'stroke-width': 1, fill: 'none', transform: 'translate(-1.6 -1.2)', 'stroke-opacity': 0.55 }, qg);
      let bt = '', btC = '';
      for (let x = -300; x <= 300; x += 75) for (let y = -200; y <= 200; y += 100) { const ox = (Math.round((y + 200) / 100) % 2) * 75; bt += cercle(x + ox, y, 3.4); btC += cercle(x + ox - 1, y - 1, 1.2); }
      el('path', { d: bt, fill: '#4A5521' }, qg);
      el('path', { d: btC, fill: '#B8C47C', opacity: 0.7 }, qg);
      // le parachute : toile kaki, rabat surpiqué, sangles, boucles, étiquette pochoir, poignée d'ouverture
      S.para = el('g', {}, S.banc);
      el('rect', { x: -170, y: -108, width: 152, height: 204, rx: 24, fill: '#1A130F', opacity: 0.35, transform: 'translate(10 12)' }, S.para);
      el('rect', { x: -172, y: -112, width: 154, height: 206, rx: 24, fill: 'url(#h-para)' }, S.para);
      el('path', { d: 'M-172 -60Q-172 -112 -120 -112H-70Q-18 -112 -18 -60L-18 -46Q-95 -30-172 -46Z', fill: '#5B5E34' }, S.para);
      el('path', { d: 'M-164 -52Q-95 -38-26 -52', fill: 'none', stroke: '#E9E1D2', 'stroke-width': 1.3, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.5 }, S.para);
      el('path', { d: 'M-160 84Q-95 94-30 84', fill: 'none', stroke: '#E9E1D2', 'stroke-width': 1.3, 'stroke-dasharray': '4 3', 'stroke-opacity': 0.4 }, S.para);
      [-148, -42].forEach((x) => {
        el('rect', { x: x - 8, y: -114, width: 16, height: 210, fill: '#3F4222' }, S.para);
        el('rect', { x: x - 2, y: -114, width: 4, height: 210, fill: '#595C32' }, S.para);
        [-16, 52].forEach((y) => {
          el('rect', { x: x - 12, y: y - 7, width: 24, height: 14, rx: 3, fill: '#CFC8B6' }, S.para);
          el('rect', { x: x - 7, y: y - 3, width: 14, height: 6, rx: 1.5, fill: '#3F4222' }, S.para);
          el('path', { d: `M${x - 10} ${y - 5}h18`, stroke: '#FFFFFF', 'stroke-width': 1.2, 'stroke-opacity': 0.8 }, S.para);
        });
      });
      el('rect', { x: -144, y: -95, width: 98, height: 27, rx: 3, fill: '#E9E1D2' }, S.para);
      el('rect', { x: -141, y: -92, width: 92, height: 21, rx: 2, fill: 'none', stroke: '#8E8466', 'stroke-width': 1 }, S.para);
      const tp = el('text', { x: -95, y: -77, 'text-anchor': 'middle', 'font-family': 'Instrument Sans, sans-serif', 'font-weight': 700, 'font-size': 11.5, fill: '#3F4222', 'letter-spacing': 1.1, textLength: 80, lengthAdjust: 'spacingAndGlyphs' }, S.para);
      tp.textContent = 'PARACHUTE';
      el('path', { d: 'M-42 18C-26 18-24 38-42 38', fill: 'none', stroke: '#1A130F', 'stroke-width': 7, 'stroke-opacity': 0.3, transform: 'translate(2 2)' }, S.para);
      el('path', { d: 'M-42 18C-26 18-24 38-42 38Z', fill: 'none', stroke: '#D9D2C2', 'stroke-width': 5, 'stroke-linejoin': 'round' }, S.para);
      el('path', { d: 'M-40 19C-29 20-28 30-30 33', fill: 'none', stroke: '#FFFFFF', 'stroke-width': 1.4, 'stroke-opacity': 0.8 }, S.para);
      // le sac à emporter kraft : plis, rabat roulé, anse torsadée, le logo, « à emporter », le petit anneau vert
      S.kraft = el('g', {}, S.banc);
      el('path', { d: 'M22 -96H168L158 98Q95 106 32 98Z', fill: '#1A130F', opacity: 0.33, transform: 'translate(10 12)' }, S.kraft);
      el('path', { d: 'M22 -96H168L158 98Q95 106 32 98Z', fill: 'url(#h-kraft)' }, S.kraft);
      el('path', { d: 'M40 -96L46 99M150 -96L144 99', stroke: '#A9824F', 'stroke-width': 1.6, 'stroke-opacity': 0.7 }, S.kraft);
      el('path', { d: 'M43 -96L49 99M147 -96L141 99', stroke: '#E6CBA0', 'stroke-width': 1.2, 'stroke-opacity': 0.6 }, S.kraft);
      el('path', { d: 'M22 -96H168L166 -60Q95 -52 24 -60Z', fill: '#B08A57' }, S.kraft);
      el('path', { d: 'M24 -62Q95 -54 166 -62', fill: 'none', stroke: '#E2C597', 'stroke-width': 2.6, 'stroke-linecap': 'round' }, S.kraft);
      el('path', { d: 'M22 -94H168', stroke: '#D9B98A', 'stroke-width': 2 }, S.kraft);
      el('path', { d: 'M72 -96C70 -140 120 -140 118 -96', fill: 'none', stroke: '#1A130F', 'stroke-width': 9, 'stroke-opacity': 0.25, transform: 'translate(4 6)' }, S.kraft);
      el('path', { d: 'M72 -96C70 -140 120 -140 118 -96', fill: 'none', stroke: '#A9824F', 'stroke-width': 8, 'stroke-linecap': 'round' }, S.kraft);
      el('path', { d: 'M72 -96C70 -140 120 -140 118 -96', fill: 'none', stroke: '#DDBE8E', 'stroke-width': 2.6, 'stroke-dasharray': '5 4', 'stroke-linecap': 'round' }, S.kraft);
      const tb = el('text', { x: 95, y: -30, 'text-anchor': 'middle', 'font-family': 'Instrument Sans, sans-serif', 'font-weight': 700, 'font-size': 8.5, fill: '#6B4A2A', 'letter-spacing': 2.4, opacity: 0.85 }, S.kraft);
      tb.textContent = 'BOUGNAT BURGER';
      logo(S.kraft, 95, 8, 0.72, '#8F6A3E');
      const te = el('text', { x: 95, y: 72, 'text-anchor': 'middle', 'font-family': 'Shrikhand, Georgia, serif', 'font-size': 18, fill: '#6B4A2A' }, S.kraft);
      te.textContent = 'à emporter';
      el('path', { d: 'M160 -20Q172 -14 170 -2', fill: 'none', stroke: '#8F6A3E', 'stroke-width': 1.6 }, S.kraft);
      el('circle', { cx: 170, cy: 5, r: 7.5, fill: 'none', stroke: C.vert, 'stroke-width': 3.4 }, S.kraft);
      el('path', { d: 'M165 1A6 6 0 0 1 172 -1.5', fill: 'none', stroke: '#E4F5B8', 'stroke-width': 1.2 }, S.kraft);
      S.main = makeMain(S.banc, 320);
      // la porte ouverte (plan 4) : l'air, le vide, les Puys tout en bas
      S.porte = el('g', {}, S.cabine);
      el('path', { d: cercle(0, 0, 360) + 'M-150 -190Q-150 -230-110 -230H110Q150 -230 150 -190V190Q150 230 110 230H-110Q-150 230-150 190Z', fill: 'url(#h-flaque)', opacity: 0.9, 'fill-rule': 'evenodd' }, S.porte);
      const pv = el('g', { 'clip-path': 'url(#h-porte)' }, S.porte);
      S.porteFond = el('rect', { x: -200, y: -300, width: 400, height: 600, fill: '#9CB0A8' }, pv);
      S.porteCarte = el('use', {}, pv);
      S.porteNuages = el('g', {}, pv);
      this.nPorte = [];
      for (let i = 0; i < 4; i++) { const n = nuageDessus(S.porteNuages, S.porteNuages, 120 + r() * 70, r); show(n.o, false); this.nPorte.push({ c: n.g, x: r() * 640, y: -160 + i * 110 }); }
      el('rect', { x: -160, y: -240, width: 320, height: 480, fill: 'url(#h-horizonPorte)' }, pv);
      // le dessous de l'aile haute, qui passe au-dessus de la porte
      el('path', { d: 'M-200 -300H200V-190Q60 -168-200 -204Z', fill: '#1A130F', opacity: 0.2, transform: 'translate(0 8)' }, pv);
      el('path', { d: 'M-200 -300H200V-190Q60 -168-200 -204Z', fill: 'url(#h-aile)' }, pv);
      el('path', { d: 'M-200 -214Q60 -180 200 -200', fill: 'none', stroke: '#9C917A', 'stroke-width': 1.4 }, pv);
      el('path', { d: 'M-200 -204Q60 -168 200 -190', fill: 'none', stroke: '#FFFAF0', 'stroke-width': 1.6, 'stroke-opacity': 0.8 }, pv);
      S.porteVent = el('g', { fill: '#FFFFFF' }, pv);
      for (let i = 0; i < 12; i++) el('path', { d: `M0 -1.2L${60 + (i % 4) * 22} 0L0 1.2Z`, opacity: 0.35 + (i % 3) * 0.15 }, S.porteVent);
      el('path', { d: 'M-176 -198Q-176 -256-118 -256H118Q176 -256 176 -198V198Q176 256 118 256H-118Q-176 256-176 198Z M-150 -190Q-150 -230-110 -230H110Q150 -230 150 -190V190Q150 230 110 230H-110Q-150 230-150 190Z', fill: 'url(#h-cadre)', 'fill-rule': 'evenodd' }, S.porte);
      el('rect', { x: -150, y: -230, width: 300, height: 460, rx: 40, fill: 'none', stroke: '#2A231C', 'stroke-width': 5 }, S.porte);
      el('rect', { x: -176, y: -256, width: 352, height: 512, rx: 58, fill: 'none', stroke: '#FFFAF0', 'stroke-width': 1.6, 'stroke-opacity': 0.7 }, S.porte);
      el('path', { d: 'M-160 226H160V250H-160Z', fill: '#B9AE97' }, S.porte);
      el('path', { d: 'M-160 226H160', stroke: '#F4ECDC', 'stroke-width': 2 }, S.porte);
      let pd = '';
      for (let x = -150; x < 160; x += 12) pd += `M${x} 232l6 6M${x + 6} 232l-6 6`;
      el('path', { d: pd, stroke: '#8C8168', 'stroke-width': 1.2 }, S.porte);
      el('rect', { x: -212, y: -170, width: 12, height: 300, rx: 6, fill: C.olive2 }, S.porte); // la barre de maintien
      el('rect', { x: -210, y: -168, width: 3.5, height: 296, rx: 1.75, fill: '#A5B25E' }, S.porte);
      el('path', { d: 'M-212 -160h-10M-212 118h-10', stroke: '#8C7E62', 'stroke-width': 6 }, S.porte);
      // la lampe de saut, au-dessus de la porte : rouge… puis verte
      el('rect', { x: -38, y: -300, width: 76, height: 28, rx: 8, fill: '#3A3128' }, S.porte);
      S.lampeR = el('circle', { cx: -17, cy: -286, r: 8, fill: '#C75A45' }, S.porte);
      S.lampeV = el('circle', { cx: 17, cy: -286, r: 8, fill: '#5F6B55' }, S.porte);
      S.lueurV = el('circle', { cx: 17, cy: -286, r: 30, fill: 'url(#h-eclat)', opacity: 0 }, S.porte);
      S.profilCab = this.rig.makeProfil(S.cabine);

      /* ----- scène « ciel » de profil (plan 9) : le couchant, la chaîne et le puy de Dôme en parallaxe ----- */
      S.ciel = el('g', {}, svg);
      S.cielMonde = el('g', {}, S.ciel);
      el('rect', { x: -900, y: -1100, width: 2400, height: 2800, fill: 'url(#h-ciel)' }, S.cielMonde);
      S.soleil9 = el('g', { transform: 'translate(150 610)' }, S.cielMonde);
      el('circle', { r: 360, fill: 'url(#h-soleil)' }, S.soleil9);
      el('circle', { r: 120, fill: 'none', stroke: '#FFF1C6', 'stroke-width': 1.6, 'stroke-opacity': 0.3 }, S.soleil9);
      el('circle', { r: 180, fill: 'none', stroke: '#FFF1C6', 'stroke-width': 1.2, 'stroke-opacity': 0.18 }, S.soleil9);
      el('circle', { r: 46, fill: '#FFF6DA' }, S.soleil9);
      S.nuagesLoin = el('g', {}, S.cielMonde);
      S.loin = el('g', {}, S.cielMonde);
      el('path', { d: chaine(-900, 1500, 0, 1.2, 4), fill: '#B6A9C0' }, S.loin);
      el('rect', { x: -900, y: -70, width: 2400, height: 140, fill: 'url(#h-brume)' }, S.loin);
      el('path', { d: chaine(-900, 1500, 26, 0.9, 9), fill: '#9A98AE' }, S.loin);
      S.domeC = el('g', {}, S.cielMonde);
      domeCote(S.domeC, { graine: 5 });
      el('rect', { x: -700, y: 60, width: 1400, height: 60, fill: 'url(#h-brume)', opacity: 0.7 }, S.domeC);
      S.colline = el('g', {}, S.cielMonde);
      el('path', { d: colline(-900, 1500, 0, 30, 70, 0.5), fill: 'url(#h-colline1)' }, S.colline);
      el('path', { d: colline(-900, 1500, 40, 22, 110, 2.1), fill: 'url(#h-colline2)' }, S.colline);
      S.nuagesMilieu = el('g', {}, S.cielMonde);
      S.traits = el('g', { fill: C.trait }, S.cielMonde);
      S.profil = this.rig.makeProfil(S.cielMonde);
      S.objCiel = el('g', {}, S.cielMonde);
      S.burger = makeBurger(S.objCiel); S.boisson = makeBoisson(S.objCiel); S.frites = makeFrites(S.objCiel);
      S.nuagesProches = el('g', {}, S.cielMonde);
      this.nuages = [];
      [[S.nuagesLoin, 7, 90, 0.22, PAL_LOIN, 0.75], [S.nuagesMilieu, 5, 170, 0.6, PAL_COUCHANT, 0.95], [S.nuagesProches, 2, 330, 1.25, PAL_HAUT, 0.92]].forEach(([g, n, w, k, pal, op]) => {
        for (let i = 0; i < n; i++) this.nuages.push({ c: nuageAffiche(g, w * (0.7 + r() * 0.6), r, pal, -1, op), x: k > 1 ? (i % 2 ? -90 : 690) : -60 + r() * (W + 120), y: k > 1 ? i * 520 : r() * (H + 500), k });
      });
      this.traits = [];
      for (let i = 0; i < 10; i++) { // des filets de vitesse effilés
        const L = 40 + r() * 70, w = 1 + r() * 1.8;
        this.traits.push({ l: el('path', { d: `M0 0Q${f(w)} ${f(L * 0.55)} 0 ${f(L)}Q${f(-w)} ${f(L * 0.55)} 0 0Z`, opacity: f(0.14 + r() * 0.18) }, S.traits), x: r() * W, y: r() * (H + 300), v: 0.8 + r() * 0.8 });
      }

      /* ----- scène « contre-plongée » (plans 6, 8, 10, 11) : le ciel, le soleil, les nuages qui s'éloignent ----- */
      S.contre = el('g', {}, svg);
      el('rect', { x: -200, y: -200, width: W + 400, height: H + 400, fill: 'url(#h-contre)' }, S.contre);
      el('rect', { x: -200, y: -200, width: W + 400, height: H + 400, fill: 'url(#h-soleilC)' }, S.contre);
      S.rayonsSoleil = el('g', { fill: '#FFF6DE', opacity: 0.1 }, S.contre);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; el('path', { d: `M0 0L${pt(Math.cos(a - 0.07) * 1100, Math.sin(a - 0.07) * 1100)}L${pt(Math.cos(a + 0.07) * 1100, Math.sin(a + 0.07) * 1100)}Z` }, S.rayonsSoleil); }
      el('circle', { cx: 480, cy: 70, r: 34, fill: '#FFF8E4', opacity: 0.9 }, S.contre);
      S.contreMonde = el('g', {}, S.contre);
      S.nuagesContre = el('g', {}, S.contreMonde);
      this.nCon = [];
      for (let i = 0; i < 8; i++) this.nCon.push({ c: nuageAffiche(S.nuagesContre, 150 + r() * 110, r, PAL_DESSOUS, 1, 0.95), a: r() * TAU, d: 80 + r() * 320, ph: r() });
      // la gloire dorée derrière lui (plan 11)
      S.gloire = el('g', {}, S.contreMonde);
      el('circle', { r: 330, fill: 'url(#h-gloire)' }, S.gloire);
      S.gloireRayons = el('g', {}, S.gloire);
      for (let i = 0; i < 20; i++) { const a = (i / 20) * TAU, e = 0.075; el('path', { d: `M${pt(Math.cos(a - e) * 60, Math.sin(a - e) * 60)}L${pt(Math.cos(a - e * 2.4) * 620, Math.sin(a - e * 2.4) * 620)}L${pt(Math.cos(a + e * 2.4) * 620, Math.sin(a + e * 2.4) * 620)}L${pt(Math.cos(a + e) * 60, Math.sin(a + e) * 60)}Z`, fill: i % 2 ? '#FBE3A4' : '#F6C766', opacity: i % 2 ? 0.34 : 0.26 }, S.gloireRayons); }
      S.anneaux = el('g', { fill: 'none', stroke: '#FFF3CF' }, S.gloire);
      for (let i = 0; i < 3; i++) el('circle', { r: 100, 'stroke-width': 3 }, S.anneaux);
      S.faceC = this.rig.makeFace(S.contreMonde);
      // la poignée de repli (si le personnage ne dessine pas lui-même le cordon) : le cordon part de la boucle de la bretelle
      S.cordonC = el('path', { fill: 'none', stroke: '#7A5A33', 'stroke-width': 3, 'stroke-linecap': 'round' }, S.contreMonde);
      S.poigneeC = el('g', {}, S.contreMonde);
      el('circle', { r: 11, fill: 'none', stroke: '#5E7A18', 'stroke-width': 6 }, S.poigneeC);
      el('circle', { r: 11, fill: 'none', stroke: C.vert, 'stroke-width': 4.4 }, S.poigneeC);
      el('path', { d: 'M-8 -6A10 10 0 0 1 4 -10', fill: 'none', stroke: '#E8F7BE', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, S.poigneeC);
      S.fritesC = makeFrites(S.contreMonde);
      S.burgerC = makeBurger(S.contreMonde);
      S.boissonC = makeBoisson(S.contreMonde);
      S.miettes = el('g', {}, S.contreMonde);
      this.miettes = [];
      for (let i = 0; i < 22; i++) this.miettes.push({ m: miette(S.miettes, i, r), a: (i / 22) * TAU + i, v: 90 + ((i * 37) % 110) });
      S.etincelles = el('g', {}, S.contreMonde);
      this.eti = [];
      for (let i = 0; i < 9; i++) this.eti.push({ g: etincelle(S.etincelles), a: (i / 9) * TAU + r() * 0.4, d: 150 + r() * 110, ph: r() });
      // les traits de choc autour du cadre (plan 8)
      S.choc = el('g', { fill: '#FFF8EC' }, S.contre);
      this.choc = [];
      for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU + r() * 0.1; this.choc.push(el('path', { d: `M${pt(300 + Math.cos(a) * 250, 390 + Math.sin(a) * 320)}L${pt(300 + Math.cos(a - 0.03) * 700, 390 + Math.sin(a - 0.03) * 700)}L${pt(300 + Math.cos(a + 0.03) * 700, 390 + Math.sin(a + 0.03) * 700)}Z`, opacity: 0.5 }, S.choc)); }

      /* ----- scène « au sol » (plans 13 à 17) : le pré au pied du puy de Dôme ----- */
      S.sol = el('g', {}, svg);
      S.solMonde = el('g', {}, S.sol);
      const sm = S.solMonde;
      el('rect', { x: -1000, y: -1600, width: 2600, height: 2400, fill: 'url(#h-cielSol)' }, sm);
      S.soleilSol = el('g', { transform: 'translate(128 468)' }, sm);
      el('circle', { r: 330, fill: 'url(#h-soleil)' }, S.soleilSol);
      el('circle', { r: 96, fill: 'none', stroke: '#FFF1C6', 'stroke-width': 1.4, 'stroke-opacity': 0.3 }, S.soleilSol);
      el('circle', { r: 30, fill: '#FFF6DA' }, S.soleilSol);
      S.nuagesSol = el('g', {}, sm);
      this.nSol = [];
      [[-120, 250, 210], [210, 170, 260], [520, 280, 180], [420, 90, 150], [-40, 60, 170], [700, 150, 220]].forEach(([x, y, w], i) => {
        const g = el('g', {}, S.nuagesSol);
        nuageAffiche(g, w, r, y > 200 ? PAL_COUCHANT : PAL_HAUT, -1, 0.9);
        this.nSol.push({ g, x, y, v: 3 + i });
      });
      S.lointSol = el('g', {}, sm);
      el('path', { d: chaine(-700, 1300, 512, 1.1, 21), fill: '#B4A8BE' }, S.lointSol);
      el('rect', { x: -700, y: 440, width: 2000, height: 110, fill: 'url(#h-brume)' }, S.lointSol);
      el('path', { d: chaine(-700, 1300, 526, 0.8, 33), fill: '#979AAE' }, S.lointSol);
      S.domeSol = el('g', { transform: `translate(300 ${f(520 - 94.5 * 1.2)}) scale(1.2)` }, sm);
      domeCote(S.domeSol, { graine: 7 });
      S.train = el('g', {}, S.domeSol);
      el('rect', { x: -4, y: -2, width: 8, height: 3, rx: 1, fill: '#F2EADA' }, S.train);
      el('rect', { x: -4, y: -0.4, width: 8, height: 0.9, fill: C.olive }, S.train);
      // les collines du milieu : prés, haies, bosquets, une ferme et ses Salers
      S.milieuSol = el('g', {}, sm);
      const mg = S.milieuSol;
      el('path', { d: colline(-700, 1300, 566, 26, 80, 1.1), fill: 'url(#h-colline1)' }, mg);
      el('path', { d: colline(-700, 1300, 604, 22, 120, 2.6), fill: 'url(#h-colline2)' }, mg);
      let dc = '', dco = '';
      [[-150, 552, 14], [-60, 548, 10], [60, 556, 9], [130, 552, 12], [440, 548, 12], [520, 556, 10], [610, 552, 14], [700, 548, 11],
        [-110, 592, 11], [20, 598, 8], [180, 594, 9], [410, 596, 10], [560, 590, 12], [660, 598, 8], [760, 594, 12]].forEach(([x, y, R]) => {
        const pts = tache(x, y - R * 0.5, R, R * 0.8, 9, 0.2, r);
        dc += feston(pts, R * 0.5, 0.3, r);
        dco += `M${pt(x - R * 0.2, y + R * 0.2)}Q${pt(x + R * 2, y + R * 0.1)} ${pt(x + R * 3.6, y + R * 0.35)}Q${pt(x + R * 2, y + R * 0.7)} ${pt(x - R * 0.2, y + R * 0.55)}Z`;
      });
      // les haies du bocage : des rangées d'arbres qui suivent les courbes des collines, avec des trouées
      [[576, 5, 0.9], [616, 6.5, 1.3]].forEach(([y0, R0, ph]) => {
        for (let x = -80; x < 700; x += R0 * 1.5 + r() * R0) {
          if (r() < 0.16) { x += R0 * 3; continue; }
          const y = y0 + Math.sin(x / 70 + ph) * 3, R = R0 * (0.7 + r() * 0.6);
          dc += feston(tache(x, y - R * 0.6, R, R * 0.85, 8, 0.2, r), R * 0.5, 0.3, r);
          dco += `M${pt(x - R * 0.2, y)}Q${pt(x + R * 1.6, y - R * 0.1)} ${pt(x + R * 2.8, y + R * 0.2)}Q${pt(x + R * 1.6, y + R * 0.55)} ${pt(x - R * 0.2, y + R * 0.4)}Z`;
        }
      });
      el('path', { d: dco, fill: '#24321A', 'fill-opacity': 0.35 }, mg);
      el('path', { d: dc, fill: '#26351B', transform: 'translate(1.4 1)' }, mg);
      el('path', { d: dc, fill: '#7C9440', transform: 'translate(-1.4 -1)' }, mg);
      el('path', { d: dc, fill: '#46592A' }, mg);
      // la ferme au toit de tuiles
      el('path', { d: 'M470 588h26v10h-26z', fill: '#E9DCC3' }, mg);
      el('path', { d: 'M467 589l6-8h20l6 8z', fill: '#B8663F' }, mg);
      el('path', { d: 'M493 581l6 8h-6z', fill: '#8E4A30' }, mg);
      el('path', { d: 'M475 591h4v7h-4zM486 591h5v4h-5z', fill: '#6B5A48' }, mg);
      [[380, 606, 1], [398, 609, -1], [-40, 616, 1]].forEach(([x, y, s]) => { // des Salers au loin
        const vg = el('g', { transform: `translate(${x} ${y}) scale(${s} 1)` }, mg);
        el('path', { d: 'M-6 0Q-6 -4-2 -4H4Q7 -4 7.5 -2L9.5 -3.2Q11 -3 10.6 -1L8 0.4V1.6H6.5V0.5H-3.5V1.6H-5Z', fill: '#8C4326' }, vg);
        el('path', { d: 'M9.6 -3.4l1.2 -1.4M8.4 -3.2l0.2 -1.6', stroke: '#F1E6CE', 'stroke-width': 0.5 }, vg);
      });
      // le pré : herbe dorée au loin, plus verte devant ; rochers de basalte, gentianes, marguerites, touffes
      S.preSol = el('g', {}, sm);
      const pg = S.preSol;
      el('path', { d: 'M-700 640Q-300 628 0 636T600 634T1300 640V1400H-700Z', fill: 'url(#h-pre)' }, pg);
      let bandes = '';
      for (let i = 0; i < 6; i++) bandes += `M-700 ${650 + i * 22 + i * i * 3}Q300 ${644 + i * 22 + i * i * 3} 1300 ${652 + i * 22 + i * i * 3}`;
      el('path', { d: bandes, fill: 'none', stroke: '#C9D07E', 'stroke-width': 5, 'stroke-opacity': 0.22 }, pg);
      S.cratere = el('g', { transform: 'translate(300 678)' }, pg);
      {
        const cr = S.cratere;
        el('ellipse', { rx: 132, ry: 28, fill: '#3E4A22', opacity: 0.35 }, cr);
        // les fissures : courtes, brisées, effilées
        let fis = '';
        for (let i = 0; i < 13; i++) {
          const a = (i / 13) * TAU + (r() - 0.5) * 0.3, L = 26 + r() * 46, n = 4;
          let x = Math.cos(a) * 108, y = Math.sin(a) * 23;
          const pts = [[x, y]];
          for (let k = 1; k <= n; k++) { const b = a + (r() - 0.5) * 1.1; x += (Math.cos(b) * L) / n; y += ((Math.sin(b) * L) / n) * 0.3; pts.push([x, y]); }
          const g1 = [], g2 = [];
          pts.forEach((p, k) => { const q = pts[Math.min(k + 1, n)], o = pts[Math.max(k - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1, w = 1.9 * (1 - k / n) + 0.15; g1.push([p[0] - (dy / l) * w, p[1] + (dx / l) * w]); g2.unshift([p[0] + (dy / l) * w, p[1] - (dx / l) * w]); });
          fis += poly(g1.concat(g2));
        }
        el('path', { d: fis, fill: '#3A2C1D', opacity: 0.8 }, cr);
        el('path', { d: feston(tache(0, 0, 118, 26, 20, 0.08, r), 14, 0.35, r), fill: '#6E5236' }, cr);
        el('path', { d: feston(tache(-2, -3, 112, 23, 20, 0.08, r), 13, 0.3, r), fill: '#9A7650' }, cr);
        el('ellipse', { cx: 0, cy: 2, rx: 94, ry: 17, fill: 'url(#h-trou)' }, cr);
        let mo = '', moH = '';
        for (let i = 0; i < 16; i++) { const a = r() * TAU, d = 108 + r() * 60, x = Math.cos(a) * d, y = Math.sin(a) * d * 0.24, s = 3 + r() * 5; mo += lisse(tache(x, y, s, s * 0.7, 6, 0.3, r)); moH += lisse(tache(x - s * 0.2, y - s * 0.45, s * 0.8, s * 0.35, 5, 0.3, r)); }
        el('path', { d: mo, fill: '#5A4430' }, cr);
        el('path', { d: moH, fill: '#7E9140' }, cr);
      }
      let ro = '', roC = '', roM = '';
      [[70, 700, 18], [-60, 668, 12], [540, 690, 22], [640, 660, 11], [200, 742, 9], [430, 760, 13], [-10, 770, 26], [610, 790, 30]].forEach(([x, y, s]) => {
        const p = [[x - s, y], [x - s * 0.8, y - s * 0.55], [x - s * 0.1, y - s * 0.75], [x + s * 0.7, y - s * 0.5], [x + s, y]];
        ro += poly(p);
        roC += poly([[x - s * 0.8, y - s * 0.55], [x - s * 0.1, y - s * 0.75], [x + s * 0.2, y - s * 0.35], [x - s * 0.55, y - s * 0.25]]);
        roM += lisse(tache(x - s * 0.3, y - s * 0.6, s * 0.35, s * 0.13, 6, 0.3, r));
      });
      el('path', { d: ro, fill: '#3E3630' }, pg);
      el('path', { d: roC, fill: '#6E6358' }, pg);
      el('path', { d: roM, fill: '#7E9140', opacity: 0.85 }, pg);
      let hc = '', hs = '', tiges = '', fleursJ = '', fleursB = '', coeurs = '', fleursR = '';
      for (let i = 0; i < 110; i++) {
        const y = 646 + Math.pow(r(), 1.4) * 150, k = (y - 630) / 150;
        const x = -120 + r() * 840, h = 6 + k * 20;
        if (Math.abs(x - 300) < 125 && Math.abs(y - 678) < 30) continue;
        const [c, s] = touffe(x, y, h, r);
        hc += c; hs += s;
      }
      for (let i = 0; i < 26; i++) { // des gentianes jaunes, sur leurs hautes tiges
        const x = -80 + r() * 760, y = 650 + r() * 110, k = (y - 630) / 150, h = 14 + k * 30;
        if (Math.abs(x - 300) < 130 && Math.abs(y - 678) < 34) continue;
        tiges += `M${pt(x, y)}Q${pt(x + 1.5, y - h * 0.5)} ${pt(x, y - h)}`;
        for (let j = 0; j < 3; j++) fleursJ += lisse(tache(x + (j - 1) * 1.2 * (1 + k), y - h * (0.55 + j * 0.2), 2.4 + k * 2.2, 1.6 + k * 1.4, 5, 0.3, r));
      }
      for (let i = 0; i < 44; i++) { // des marguerites et quelques scabieuses
        const x = -100 + r() * 800, y = 648 + Math.pow(r(), 1.2) * 140, k = (y - 630) / 150, s = 1.4 + k * 3.2;
        if (Math.abs(x - 300) < 130 && Math.abs(y - 678) < 34) continue;
        if (i % 5 === 0) { fleursR += cercle(x, y - s, s * 1.1); continue; }
        fleursB += lisse(tache(x, y - s, s * 1.5, s * 0.8, 8, 0.2, r));
        coeurs += cercle(x, y - s, s * 0.42);
      }
      el('path', { d: tiges, fill: 'none', stroke: '#56692C', 'stroke-width': 1.3 }, pg);
      el('path', { d: hs, fill: '#4E6428' }, pg);
      el('path', { d: hc, fill: '#A8B85E' }, pg);
      el('path', { d: fleursJ, fill: '#F2C14E' }, pg);
      el('path', { d: fleursB, fill: '#FBF6EA' }, pg);
      el('path', { d: fleursR, fill: '#C9A0C8' }, pg);
      el('path', { d: coeurs, fill: '#F2C14E' }, pg);
      S.face = this.rig.makeFace(sm);
      // la silhouette qui tombe, floue de vitesse (plan 13)
      S.chuteSol = el('g', {}, sm);
      el('path', { d: 'M-16 -150L16 -150L22 -10L-22 -10Z', fill: 'url(#h-sillage)' }, S.chuteSol);
      el('ellipse', { cx: 0, cy: -6, rx: 24, ry: 30, fill: C.blouse }, S.chuteSol);
      el('path', { d: 'M-24 -2L-40 -40M24 -2L40 -40', stroke: C.blouse, 'stroke-width': 12, 'stroke-linecap': 'round' }, S.chuteSol);
      el('circle', { cx: 0, cy: 26, r: 15, fill: C.peau }, S.chuteSol);
      el('path', { d: 'M-16 32Q0 22 16 32Q0 44-16 32Z', fill: '#3F464C' }, S.chuteSol);
      // l'impact : l'éclat, l'onde, les mottes, la fumée
      S.impact = el('g', { transform: 'translate(300 668)' }, sm);
      S.eclatChoc = el('g', {}, S.impact);
      el('circle', { r: 150, fill: 'url(#h-flash)' }, S.eclatChoc);
      let et = '';
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU, R1 = i % 2 ? 60 : 130; et += (i ? 'L' : 'M') + pt(Math.cos(a) * R1, Math.sin(a) * R1 * 0.55); }
      el('path', { d: et + 'Z', fill: '#FFF7DC' }, S.eclatChoc);
      S.onde = el('ellipse', { rx: 100, ry: 20, fill: 'none', stroke: '#FFF3D0', 'stroke-width': 5 }, S.impact);
      S.mottes = el('g', {}, S.impact);
      this.mottes = [];
      for (let i = 0; i < 14; i++) {
        const g = el('g', {}, S.mottes), s = 4 + r() * 6;
        el('path', { d: lisse(tache(0, 0, s, s * 0.8, 6, 0.3, r)), fill: '#5A4430' }, g);
        el('path', { d: lisse(tache(-s * 0.2, -s * 0.5, s * 0.8, s * 0.35, 5, 0.3, r)), fill: '#7E9140' }, g);
        this.mottes.push({ g, a: -Math.PI * (0.1 + r() * 0.8), v: 160 + r() * 260, rot: (r() - 0.5) * 900 });
      }
      S.fumee = el('g', {}, sm);
      this.bouffees = [];
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * TAU;
        this.bouffees.push({ b: bouffee(S.fumee, r, i % 4 === 0), dx: Math.cos(a) * (60 + r() * 80), dy: Math.sin(a) * (30 + r() * 40) - 34, r: 40 + r() * 42, dr: (r() - 0.5) * 60 });
      }
      S.frite = makeFrite(sm);
      // le premier plan : quelques grandes touffes sur les bords
      S.avantSol = el('g', {}, sm);
      {
        let c = '', s = '';
        [[-60, 792, 50], [20, 800, 40], [110, 796, 30], [500, 800, 34], [580, 796, 46], [660, 800, 54]].forEach(([x, y, h]) => { const [a, b] = touffe(x, y, h, r); c += a; s += b; });
        el('path', { d: s, fill: '#3F5422' }, S.avantSol);
        el('path', { d: c, fill: '#8FA34C' }, S.avantSol);
      }
      // le sac à emporter, déchiré dans le choc, gît au bord du cratère (plans 14 et 15)
      S.sacDechire = el('g', { transform: 'translate(406 690) rotate(-9)' }, pg);
      {
        const sg = S.sacDechire;
        el('ellipse', { cx: 4, cy: 8, rx: 44, ry: 7, fill: '#24321A', opacity: 0.35 }, sg);
        el('path', { d: 'M-40 5Q-54 16-46 23Q-34 29-22 15', fill: 'none', stroke: '#9C7A4B', 'stroke-width': 3.6, 'stroke-linecap': 'round' }, sg); // la bretelle
        el('path', { d: 'M-36 6L-33 -20L20 -25L24 -21L20 -17L27 -13L22 -9L28 -5L24 -1L27 5Q-6 10-36 6Z', fill: 'url(#h-kraft)' }, sg);
        el('path', { d: 'M20 -25L24 -21L20 -17L27 -13L22 -9L28 -5L24 -1L27 5L17 3L15 -21Z', fill: '#5A4028' }, sg); // l'intérieur, par la déchirure
        el('path', { d: 'M-33 -20L20 -25L18 -14Q-8 -11-34 -9Z', fill: '#B08A57' }, sg);
        el('path', { d: 'M-22 -19L-20 4M4 -22L6 6', stroke: '#A9824F', 'stroke-width': 1.2, 'stroke-opacity': 0.7 }, sg);
        el('path', { d: 'M-12 -10L-4 -6L-9 1', fill: 'none', stroke: '#E6CBA0', 'stroke-width': 1, 'stroke-opacity': 0.7 }, sg); // un pli
        logo(sg, -6, -3, 0.2, '#8F6A3E');
        el('path', { d: 'M27 2Q36 4 40 10', fill: 'none', stroke: '#8F6A3E', 'stroke-width': 1.2 }, sg);
        el('circle', { cx: 43, cy: 12, r: 3.8, fill: 'none', stroke: C.vert, 'stroke-width': 1.8 }, sg); // l'anneau, arraché avec son cordon
        el('path', { d: 'M34 -12l6 -3 1 5zM-44 -6l5 -4 2 5zM30 16l5 1 -2 4z', fill: '#C9A274' }, sg); // des lambeaux de kraft
      }
      // l'arrière-plan du gros plan (plans 16 et 17) : une profondeur de champ peinte, sans filtre — formes adoucies
      // par des dégradés et des bords fondus, le puy de Dôme reconnaissable (profil relevé, antenne et son feu rouge,
      // l'observatoire), la chaîne dans la brume, des traînées de nuages, des rais de lumière dans la poussière du choc,
      // des bokehs, un reflet d'objectif, un buron, une Salers, des piquets ; au premier plan, des herbes et des fleurs floues
      S.flou = el('g', {}, sm);
      sm.insertBefore(S.flou, S.soleilSol);
      {
        const fg = S.flou;
        el('rect', { x: -1000, y: -1600, width: 2600, height: 2400, fill: 'url(#h-cielSol)' }, fg);
        // les traînées de nuages, bord inférieur doré (le soleil est bas)
        [[250, 296, 150, 16], [372, 326, 120, 12], [196, 352, 96, 10], [430, 278, 140, 14], [318, 372, 80, 8]].forEach(([x, y, rx, ry]) => {
          el('ellipse', { cx: x, cy: y, rx, ry, fill: 'url(#h-voile)' }, fg);
          el('ellipse', { cx: x - rx * 0.1, cy: y + ry * 0.42, rx: rx * 0.78, ry: ry * 0.5, fill: 'url(#h-voileOr)' }, fg);
        });
        // le soleil couchant, bas sur le flanc ouest
        S.flouSoleil = el('g', { transform: 'translate(196 470)' }, fg);
        el('circle', { r: 240, fill: 'url(#h-soleil)' }, S.flouSoleil);
        el('circle', { r: 17, fill: 'url(#h-disque)' }, S.flouSoleil);
        S.flouLoin = el('g', {}, fg);
        el('path', { d: chaine(-700, 1300, 520, 1.1, 21), fill: '#C7B8C7', stroke: '#C7B8C7', 'stroke-width': 7, 'stroke-opacity': 0.3, opacity: 0.85 }, S.flouLoin);
        el('rect', { x: -700, y: 470, width: 2000, height: 80, fill: 'url(#h-brume)' }, S.flouLoin);
        // le puy de Dôme, peint doux : flanc éclairé, flanc à l'ombre, bord fondu, hêtraie floue, l'antenne et son feu
        const dm = el('g', { transform: `translate(392 ${f(520 - 94.5 * 1.2)}) scale(1.2)` }, S.flouLoin);
        const P = DOME.map(([x, h]) => [x - 259, 94.5 - h]);
        const sil = `M${pt(-340, 400)}L${pt(-279, 96)}` + P.map((p) => 'L' + pt(p[0], p[1])).join('') + `L${pt(265, 96)}L${pt(325, 400)}Z`;
        el('path', { d: sil, fill: 'url(#h-flouDome)', stroke: '#8E9466', 'stroke-width': 2.6, 'stroke-opacity': 0.35, 'stroke-linejoin': 'round' }, dm);
        el('path', { d: 'M' + P.slice(0, 22).map((p) => pt(p[0], p[1] + 1.4)).join('L'), fill: 'none', stroke: '#F8DFA2', 'stroke-width': 3.2, 'stroke-opacity': 0.3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, dm);
        el('path', { d: `M-300 140V${f(94.5 - 30)}Q-150 ${f(94.5 - 40)} 0 ${f(94.5 - 34)}T300 ${f(94.5 - 30)}V140Z`, fill: 'url(#h-flouForet)' }, dm);
        el('path', { d: 'M150 70Q60 52-30 38', fill: 'none', stroke: '#EFE4CC', 'stroke-width': 1.6, 'stroke-opacity': 0.3, 'stroke-linecap': 'round' }, dm);
        el('path', { d: 'M-13 1.5h8v-4.5h6v4.5h4v-2.5h5v2.5h2v2.5h-25z', fill: '#EFE6D3', opacity: 0.8 }, dm); // l'observatoire
        el('circle', { cx: -6, cy: -2.4, r: 2.4, fill: '#F6F0E2', opacity: 0.8 }, dm);
        el('path', { d: 'M-1.5 0.5L-0.7 -17L0 -21.5L0.7 -17L1.5 0.5Z', fill: '#EDE4D2', opacity: 0.78 }, dm);
        el('path', { d: 'M-2.4 -8h4.8v1.4h-4.8zM-1.9 -13h3.8v1.2h-3.8z', fill: '#E0D6C2', opacity: 0.7 }, dm);
        S.feuRouge = el('g', { transform: 'translate(0 -22)' }, dm);
        el('circle', { r: 5.5, fill: 'url(#h-feu)' }, S.feuRouge);
        el('circle', { r: 0.9, fill: '#FF5A3C' }, S.feuRouge);
        el('rect', { x: -700, y: 520, width: 2000, height: 60, fill: 'url(#h-brume)', opacity: 0.8 }, S.flouLoin);
        // les collines du milieu, un buron de pierre, une Salers, des piquets de clôture (tout est doux, peu contrasté)
        el('path', { d: colline(-700, 1300, 576, 26, 80, 1.1), fill: '#8E9A5C', stroke: '#8E9A5C', 'stroke-width': 6, 'stroke-opacity': 0.35 }, S.flouLoin);
        const bu = el('g', { transform: 'translate(424 552)', opacity: 0.82 }, S.flouLoin);
        el('path', { d: 'M-15 0V-10H15V0Z', fill: '#B9AD98' }, bu);
        el('path', { d: 'M-18 -9L0 -24L18 -9Z', fill: '#6B6660' }, bu);
        el('path', { d: 'M0 -24L18 -9H8Z', fill: '#57534E' }, bu);
        el('path', { d: 'M-4 0V-6H2V0Z', fill: '#5E5044' }, bu);
        el('path', { d: 'M-15 0V-10H15V0Z', fill: 'none', stroke: '#B9AD98', 'stroke-width': 2.4, 'stroke-opacity': 0.4 }, bu);
        const va = el('g', { transform: 'translate(176 574) scale(1.35)', opacity: 0.8 }, S.flouLoin);
        el('path', { d: 'M-8 0Q-8 -5-3 -5H5Q9 -5 9.6 -2.5L12.2 -4Q14 -3.8 13.6 -1.2L10.4 0.5V2H8.4V0.6H-4.6V2H-6.6Z', fill: '#9A5438' }, va);
        el('path', { d: 'M-6 -4.6H4Q7 -4.6 8 -3', fill: 'none', stroke: '#C27A55', 'stroke-width': 1.2, 'stroke-opacity': 0.6 }, va);
        let pq = '';
        [168, 190, 214, 386, 412, 438].forEach((x, i) => { pq += `M${x - 1.6} ${596 - i % 2}h3.2v-17h-3.2z`; });
        el('path', { d: pq, fill: '#6B5B48', opacity: 0.7 }, S.flouLoin);
        el('path', { d: 'M150 584Q190 587 230 584M370 584Q410 587 460 584', fill: 'none', stroke: '#6B5B48', 'stroke-width': 0.8, 'stroke-opacity': 0.5 }, S.flouLoin);
        el('path', { d: colline(-700, 1300, 612, 22, 120, 2.6), fill: '#A2AE64', stroke: '#A2AE64', 'stroke-width': 7, 'stroke-opacity': 0.35 }, S.flouLoin);
        // les rais de lumière à travers la poussière du choc, qui dérive à contre-jour
        S.flouRais = el('g', { transform: 'translate(196 470)' }, fg);
        [[-2, 0.18, 360], [8, 0.14, 420], [17, 0.2, 380], [27, 0.12, 460], [36, 0.16, 400], [-12, 0.1, 340]].forEach(([a, w, L]) => {
          el('path', { d: `M0 0L${pt(Math.cos((a - 2) * Math.PI / 180) * L, Math.sin((a - 2) * Math.PI / 180) * L)}L${pt(Math.cos((a + 2) * Math.PI / 180) * L, Math.sin((a + 2) * Math.PI / 180) * L)}Z`, fill: 'url(#h-rai)', opacity: w * 4 }, S.flouRais);
        });
        S.flouPoussiere = el('g', {}, fg);
        const rp = rng(91);
        for (let i = 0; i < 30; i++) { const x = 170 + rp() * 280, y = 360 + rp() * 250, R = 0.6 + rp() * 1.4; el('circle', { cx: f(x), cy: f(y), r: f(R * 2.2), fill: 'url(#h-poussiere)', opacity: f(0.35 + rp() * 0.5) }, S.flouPoussiere); }
        // les bokehs : chauds, vert pâle, quelques disques cerclés
        S.flouBokeh = el('g', {}, fg);
        [[178, 560, 16, 0], [420, 552, 22, 1], [214, 506, 11, 0], [455, 600, 15, 1], [240, 470, 9, 0], [360, 500, 8, 1], [205, 470, 18, 0], [170, 432, 8, 0], [226, 418, 6, 0], [196, 512, 10, 1], [438, 612, 10, 0], [330, 612, 14, 1], [160, 590, 13, 1], [470, 530, 11, 0], [300, 590, 7, 0], [395, 470, 6, 1]].forEach(([x, y, R, v]) => {
          el('circle', { cx: x, cy: y, r: R, fill: v ? 'url(#h-bokehV)' : 'url(#h-bokeh)' }, S.flouBokeh);
          if (R > 14) el('circle', { cx: x, cy: y, r: R * 0.94, fill: 'none', stroke: v ? '#E6F2C8' : '#FFF0C8', 'stroke-width': 0.5, 'stroke-opacity': 0.16 }, S.flouBokeh);
        });
        // le reflet d'objectif : une étoile de lumière sur le soleil, des fantômes sur l'axe qui traverse l'image
        S.flouReflet = el('g', {}, fg);
        const etoileR = el('g', { transform: 'translate(196 470)', opacity: 0.55 }, S.flouReflet);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI; el('path', { d: `M${pt(-Math.cos(a) * 46, -Math.sin(a) * 46)}L${pt(-Math.sin(a) * 0.7, Math.cos(a) * 0.7)}L${pt(Math.cos(a) * 46, Math.sin(a) * 46)}L${pt(Math.sin(a) * 0.7, -Math.cos(a) * 0.7)}Z`, fill: '#FFF6DC', opacity: i % 2 ? 0.5 : 0.8 }, etoileR); }
        S.fantomes = [[0.55, 5, '#FFE7B0', 0.35], [0.95, 12, '#DDEFC0', 0.18], [1.3, 7, '#F7C6B0', 0.28], [1.85, 17, '#E8F0CC', 0.12], [2.3, 4, '#FFF0CC', 0.4]].map(([k, R, c, o]) => {
          const g = el('g', { opacity: o }, S.flouReflet);
          el('path', { d: poly([0, 1, 2, 3, 4, 5].map((i) => [Math.cos((i / 6) * TAU) * R, Math.sin((i / 6) * TAU) * R])), fill: c }, g);
          return { g, k };
        });
      }
      // le premier plan flou du gros plan, devant le personnage, aux coins bas : brins d'herbe, gentianes, marguerites
      S.flouAvant = el('g', {}, sm);
      {
        const fa = S.flouAvant;
        let c = '', s = '';
        [[150, 646, 60], [172, 650, 44], [196, 652, 30], [410, 652, 34], [432, 648, 52], [452, 646, 64]].forEach(([x, y, h]) => { const [a, b] = touffe(x, y, h, rng(x)); c += a; s += b; });
        el('path', { d: s, fill: '#3E4E24', opacity: 0.8, stroke: '#3E4E24', 'stroke-width': 2.4, 'stroke-opacity': 0.3 }, fa);
        el('path', { d: c, fill: '#6F8038', opacity: 0.75, stroke: '#6F8038', 'stroke-width': 2.4, 'stroke-opacity': 0.3 }, fa);
        [[164, 606, 9], [176, 596, 7], [158, 590, 6]].forEach(([x, y, R]) => el('circle', { cx: x, cy: y, r: R, fill: 'url(#h-flouJaune)' }, fa));
        [[440, 612, 8], [452, 598, 6.5], [428, 620, 5]].forEach(([x, y, R]) => { el('circle', { cx: x, cy: y, r: R, fill: 'url(#h-flouBlanc)' }, fa); el('circle', { cx: x, cy: y, r: R * 0.34, fill: 'url(#h-flouJaune)' }, fa); });
      }
      // les grands brins du premier plan en contre-plongée (plan 15), dans le repère de l'écran
      S.brinsBas = el('g', {}, S.sol);
      {
        let c = '', s = '';
        [[-20, 800, 150], [60, 806, 110], [130, 812, 70], [470, 812, 76], [540, 806, 120], [620, 800, 160]].forEach(([x, y, h]) => { const [a, b] = touffe(x, y, h, r); c += a; s += b; });
        el('path', { d: s, fill: '#2E3F1A' }, S.brinsBas);
        el('path', { d: c, fill: '#5E7430' }, S.brinsBas);
      }

      /* ----- voiles : vignette, flash, iris (la jante du hublot de la marque qui se referme) ----- */
      S.vignette = el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#h-vignette)', opacity: 0 }, svg);
      S.flash = el('rect', { x: -100, y: -100, width: W + 200, height: H + 200, fill: '#FFF8E8', opacity: 0 }, svg);
      S.iris = el('path', { fill: C.charbon, 'fill-rule': 'evenodd' }, svg);
      S.irisJante = el('circle', { fill: 'none', stroke: C.olive, 'stroke-width': 10 }, svg);
      S.irisFilet = el('circle', { fill: 'none', stroke: C.vert, 'stroke-width': 1.8 }, svg);
      this.host.appendChild(svg);
      this._carteCalque();
    }

    /* La carte des plans aériens (1, 5, 7, le début du 12), du hublot (2) et de la porte (4) : rasterisée une seule fois
       dans trois toiles (l'ensemble, le cœur plus finement, la bande du hublot plus finement encore), posées dans un
       calque sous le SVG et déplacées par des transformations CSS : c'est le compositeur qui les bouge, sans rien
       redessiner ; la paroi de la cabine est percée à la vitre et à la porte pour les laisser voir. Tant qu'elles ne
       sont pas prêtes, en cas d'échec, et pour les plans très rapprochés (zoom > 1,25), la carte vectorielle (<use>) sert. */
    _carteCalque() {
      const S = this.S;
      const X = -800, Y = -900, LW = 2600, LH = 2900;
      // [x, y, largeur, hauteur, pixels par unité] : l'ensemble, le cœur, et la bande que survole le hublot (plus fine)
      const PARTS = [[X, Y, LW, LH, 0.48], [-150, -280, 1350, 1560, 1.32], [70, 220, 860, 400, 2.4]];
      const div = document.createElement('div');
      div.setAttribute('aria-hidden', 'true');
      div.style.cssText = 'position:absolute;inset:0;overflow:hidden;pointer-events:none;display:none';
      const plateau = document.createElement('div'); // le repère du viewBox (600 × 780), cadré comme le SVG (« slice »)
      plateau.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0`;
      div.appendChild(plateau);
      this.host.insertBefore(div, S.svg);
      this._calque = { div, plateau, parts: [], pret: false, vue: null };
      const cadre = () => {
        const w = this.host.clientWidth, h = this.host.clientHeight;
        if (!w || !h) return;
        const s = Math.max(w / W, h / H);
        plateau.style.transform = `translate(${f((w - W * s) / 2)}px,${f((h - H * s) / 2)}px) scale(${Math.round(s * 1e4) / 1e4})`;
      };
      cadre();
      if ('ResizeObserver' in window) { this._ro = new ResizeObserver(cadre); this._ro.observe(this.host); }
      setTimeout(() => { if (!this._mort) this._rasterise(X, Y, LW, LH, PARTS, plateau); }, 0); // hors de la longue tâche de construction
    }
    _rasterise(X, Y, LW, LH, PARTS, plateau) {
      const S = this.S, cal = this._calque;
      try {
        const ser = new XMLSerializer();
        const degr = ['h-cone', 'h-coneH', 'h-bol', 'h-bolB', 'h-domeH', 'h-ombreDome', 'h-lumiere'].map((i) => ser.serializeToString(S.svg.querySelector('#' + i))).join('');
        const texte = `<svg xmlns="${NS}" viewBox="${X} ${Y} ${LW} ${LH}" width="${LW}" height="${LH}"><defs>${degr}</defs>${ser.serializeToString(S.svg.querySelector('#h-carte'))}</svg>`;
        const src = URL.createObjectURL(new Blob([texte], { type: 'image/svg+xml' }));
        const im = new Image();
        im.onload = () => {
          PARTS.forEach(([x, y, w, h, k], i) => setTimeout(() => {
            if (this._mort) return;
            try {
              const c = document.createElement('canvas');
              c.width = Math.round(w * k); c.height = Math.round(h * k);
              c.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform';
              c.getContext('2d').drawImage(im, x - X, y - Y, w, h, 0, 0, c.width, c.height);
              plateau.appendChild(c);
              cal.parts[i] = { c, x, y, k, vu: null };
              if (cal.parts.filter(Boolean).length === PARTS.length) { cal.pret = true; URL.revokeObjectURL(src); if (!this.playing) this.frame(this.t); }
            } catch (e) { /* toile refusée (navigateur ancien) : on garde la carte vectorielle */ }
          }, 30 + i * 90));
        };
        im.src = src;
      } catch (e) { /* idem */ }
    }
    // la vue du calque : null (caché), 'aerien' (plein cadre), 'hublot' (dans la vitre), 'porte' (dans l'ouverture)
    _voirCalque(vue) {
      const c = this._calque;
      if (!c || c.vue === vue) return;
      c.vue = vue;
      c.div.style.display = vue ? 'block' : 'none';
      // la découpe, dans le repère du viewBox : le disque de la vitre, l'ouverture de la porte
      const clip = vue === 'hublot' ? 'circle(150px at 390px 330px)' : vue === 'porte' ? 'inset(150px 90px 170px 210px round 40px)' : 'none';
      c.plateau.style.clipPath = clip; c.plateau.style.webkitClipPath = clip; // (Safari ancien : préfixe)
      const lesquelles = vue === 'hublot' ? [2] : vue === 'porte' ? [1] : [0, 1];
      c.parts.forEach((p, i) => { const on = lesquelles.includes(i); if (p.vu !== on) { p.vu = on; p.c.style.display = on ? 'block' : 'none'; } });
    }

    /* la carte vue du ciel : zoom autour d'un point, rotation (roulis), glissement ;
       en plein cadre, dans le hublot ou par la porte, le calque rasterisé si possible, sinon la carte vectorielle */
    _carte(use, cx, cy, z, rot = 0, ox = W / 2, oy = H / 2, zmax = 1.25) {
      const S = this.S;
      const vue = use === S.carte ? 'aerien' : use === S.hubCarte ? 'hublot' : 'porte';
      const cal = !!(this._calque && this._calque.pret && z <= zmax);
      this._voirCalque(cal ? vue : null);
      this._calqueVu = cal;
      show(use, !cal);
      if (vue !== 'aerien') { // la vitre ou l'ouverture laisse voir le calque : on perce la paroi, on retire le fond de la vue
        show(vue === 'hublot' ? S.hubFond : S.porteFond, !cal);
        setA(S.paroi, 'clip-path', cal ? (vue === 'hublot' ? 'url(#h-trouHublot)' : 'url(#h-trouPorte)') : 'none');
      }
      if (!cal) {
        setA(use, 'href', '#h-carte'); // le clone vectoriel n'est construit que s'il sert
        setA(use, 'transform', `translate(${f(ox)} ${f(oy)}) rotate(${f(rot)}) scale(${Math.round(z * 1000) / 1000}) translate(${f(-cx)} ${f(-cy)})`);
        return;
      }
      if (vue === 'hublot') { ox += 390; oy += 330; } else if (vue === 'porte') { ox += 360; oy += 380; } // la position du hublot, de la porte
      this._calque.parts.forEach((p) => {
        if (!p.vu) return;
        const st = `translate(${f(ox)}px,${f(oy)}px) rotate(${f(rot)}deg) scale(${Math.round(z * 1e4) / 1e4}) translate(${f(p.x - cx)}px,${f(p.y - cy)}px) scale(${Math.round(1e4 / p.k) / 1e4})`;
        if (p.c._tf !== st) { p.c._tf = st; p.c.style.transform = st; }
      });
    }
    // nuages vus de dessus : ils s'écartent du centre et grossissent (on descend vers eux) ; leur ombre glisse sur les prés
    _nuagesRadiaux(list, prog, sens = 1, mul = 1) {
      list.forEach((n) => {
        const p = (n.ph + prog) % 1;
        const k = sens > 0 ? p : 1 - p;
        const d = sens > 0 ? n.d * 0.35 + k * k * (420 + n.d * 1.6) : n.d * (0.3 + k * 2.2); // en descendant, ils grossissent et sortent du cadre
        const s = 0.4 + k * 2.4;
        const x = W / 2 + Math.cos(n.a) * d, y = H / 2 + Math.sin(n.a) * d;
        const op = (sens > 0 ? Math.min(1, k * 10) * (1 - seg(k, 0.94, 1)) : Math.min(1, k * 5) * (1 - seg(k, 0.86, 1))) * mul;
        show(n.c, true); if (n.o) show(n.o, true);
        place(n.c, x, y, 0, s);
        fondu(n.c, op);
        if (n.o) { place(n.o, W / 2 + Math.cos(n.a) * d * 0.55 + 60, H / 2 + Math.sin(n.a) * d * 0.55 + 36, 0, 0.5 + k * 0.7); fondu(n.o, op); }
      });
    }
    _traitsRadiaux(prog, force) {
      show(this.S.traitsRad, force > 0);
      if (!force) return;
      this.tRad.forEach((s) => {
        const p = (s.p + prog * 2) % 1;
        const d0 = 70 + p * 520, L = 50 + p * 190 * force;
        setA(s.l, 'transform', `translate(${W / 2} ${H / 2}) rotate(${f((s.a * 180) / Math.PI)}) translate(${f(d0)} 0) scale(${f(L)} ${f(s.w * (0.4 + p))})`);
        fondu(s.l, force * 0.55 * Math.min(1, p * 4));
      });
    }

    frame(t) {
      t = ((t % DUREE) + DUREE) % DUREE;
      const S = this.S;
      let pi = 0;
      for (let i = 0; i < PLANS.length; i++) if (t >= PLANS[i].t) pi = i;
      const P0 = PLANS[pi], t1 = pi + 1 < PLANS.length ? PLANS[pi + 1].t : DUREE;
      const u = seg(t, P0.t, t1); // progression dans le plan
      const scene = { survol: 'aerien', hublot: 'cabine', sacs: 'cabine', saut: 'cabine', chute: 'aerien', poignee: 'contre', menu: 'aerien',
        peur: 'contre', tout: 'ciel', mange: 'contre', force: 'contre', sol: 'aerien', boum: 'sol', indemne: 'sol', derniere: 'sol', crunch: 'sol', iris: 'sol' }[P0.id];
      ['aerien', 'cabine', 'ciel', 'contre', 'sol'].forEach((k) => show(S[k], k === scene));
      setA(S.sol, 'transform', ''); // la secousse du choc (plan 13) est remise à zéro ; elle reste dans le décor, sans découvrir les bords
      fondu(S.flash, 0);
      fondu(S.vignette, 0);
      let iris = null; // [cx, cy, r]
      this._calqueVu = false;
      this['_' + P0.id](t, u, (v) => { iris = v; });
      if (!this._calqueVu) this._voirCalque(null); // pas de carte dans ce plan : le calque se cache
      if (t < 0.8) iris = [W / 2, H / 2, lerp(0, 900, easeOut(seg(t, 0, 0.8)))];
      this._iris_(iris);
      this._events(t);
      if (pi !== this._plan) { this._plan = pi; this.onPlan && this.onPlan(pi, P0); }
      this.t = t;
    }
    // l'iris : un disque charbon percé d'un cercle, cerclé de la jante olive et du filet vert de la marque
    _iris_(iris) {
      const S = this.S;
      const on = !!iris && iris[2] < 880;
      show(S.iris, on); show(S.irisJante, on); show(S.irisFilet, on);
      if (!on) return;
      const [x, y, R] = iris;
      setA(S.iris, 'd', `M-200 -200H${W + 200}V${H + 200}H-200Z M${f(x)} ${f(y - R)}a${f(R)} ${f(R)} 0 1 0 0.01 0z`);
      [S.irisJante, S.irisFilet].forEach((c, i) => { setA(c, 'cx', f(x)); setA(c, 'cy', f(y)); setA(c, 'r', f(Math.max(0, R - (i ? 10.5 : 5)))); });
      fondu(S.irisJante, R > 12 ? 1 : 0); fondu(S.irisFilet, R > 16 ? 1 : 0);
    }

    /* ---------- 1 · Au-dessus des Puys : vue du ciel, l'avion traverse ---------- */
    _survol(t, u) {
      const S = this.S;
      this._carte(S.carte, lerp(520, 540, u), lerp(470, 440, u), 0.62);
      show(S.avion.g, true); show(S.dos.G, false); show(S.objAer, false); show(S.pov, false);
      const ax = lerp(-120, W + 120, u), ay = lerp(520, 300, u);
      place(S.avion.corps, ax, ay, 75, 0.9);
      place(S.avion.ombre, ax + 72, ay + 44, 75, 0.9);
      place(S.avion.pales, 0, 0, (t * 2300) % 360);
      // les nuages cadrent la vue sans cacher les Puys ; ils glissent lentement, leur ombre sur les prés
      const NS1 = [[-30, 70, 1.05], [590, 150, 0.8], [520, -10, 0.6], [40, 690, 1.15], [540, 720, 1.0], [300, 860, 0.9], [-60, 420, 0.7], [640, 520, 0.75]];
      this.nAer.forEach((n, i) => {
        const c = NS1[i];
        show(n.c, !!c); show(n.o, !!c);
        if (!c) return;
        const x = c[0] + t * 9 * (0.6 + c[2] * 0.4), y = c[1] - t * 3;
        place(n.c, x, y, 0, c[2]); fondu(n.c, 1);
        place(n.o, x + 64 * c[2], y + 40 * c[2], 0, c[2] * 0.96); fondu(n.o, 1);
      });
      this._traitsRadiaux(0, 0);
    }
    /* ---------- 2 · Le hublot : nez collé à la vitre, les Puys défilent ---------- */
    _hublot(t, u) {
      const S = this.S;
      show(S.hub, true); show(S.siege, true); show(S.banc, false); show(S.porte, false); show(S.profilCab.G, true); show(S.paroi, true);
      place(S.hub, 390, 330);
      this._carte(S.hubCarte, lerp(300, 700, u), 420, 0.8, 0, 0, 0);
      this.nHub.forEach((n) => { place(n.c, ((n.x - t * 260) % 780 + 780) % 780 - 330, n.y, 0, 0.62); }); // les nuages passent en haut du hublot, loin de son nez
      fondu(S.hubBuee, 0.25 + 0.5 * Math.pow(Math.sin(t * 2.6), 2));
      place(S.hubBuee, 0, 0, 0, 1);
      const P = S.profilCab;
      P.G.setAttribute('transform', tr(262 + Math.sin(t * 2) * 3, 530, -90, 1.4));
      this.rig.poseProfil(P, Object.assign({}, this.P.assis, { tete: 88 + Math.sin(t * 2) * 3, yeux: 1.6, bouche: 0.3 }), t, false);
    }
    /* ---------- 3 · Les deux sacs : vue de dessus, la main tâtonne et prend le mauvais ---------- */
    _sacs(t, u) {
      const S = this.S;
      show(S.hub, false); show(S.siege, false); show(S.banc, true); show(S.porte, false); show(S.profilCab.G, false); show(S.paroi, false);
      place(S.banc, 300, 430, -6, 1.15);
      // la main arrive par le haut, hésite au-dessus du parachute, glisse et attrape le sac kraft
      const x = u < 0.35 ? lerp(-60, -100, ease(u / 0.35)) : u < 0.6 ? lerp(-100, 95, ease(seg(u, 0.35, 0.6))) : 95;
      const y = u < 0.2 ? lerp(-420, -40, ease(u / 0.2)) : u < 0.6 ? -40 + Math.sin(u * 30) * 8 : lerp(-40, -110, ease(seg(u, 0.6, 0.72)));
      const prise = u > 0.58;
      place(S.main.g, x, y + (prise ? -12 : 0), u < 0.6 ? Math.sin(u * 22) * 4 : 0);
      show(S.main.ouverte, !prise); show(S.main.fermee, prise);
      const part = ease(seg(u, 0.75, 1));
      setA(S.kraft, 'transform', `translate(0 ${f(-part * 520)})`);
    }
    /* ---------- 4 · Le saut : à la porte, il salue, il saute, il rapetisse ---------- */
    _saut(t, u) {
      const S = this.S;
      show(S.hub, false); show(S.siege, false); show(S.banc, false); show(S.porte, true); show(S.profilCab.G, true); show(S.paroi, true);
      place(S.porte, 360, 380);
      this._carte(S.porteCarte, 500 + t * 30, 500, lerp(0.45, 0.5, u), 0, 0, 0);
      this.nPorte.forEach((n) => { place(n.c, ((n.x + t * 420) % 800 + 800) % 800 - 400, n.y, 0, 0.9); });
      [...S.porteVent.children].forEach((l, i) => place(l, ((t * 1100 + i * 97) % 420) - 230, -200 + i * 36 + Math.sin(t * 3 + i) * 6));
      const vert = u > 0.28;
      setA(S.lampeR, 'fill', vert ? '#6B4038' : '#E0654C');
      setA(S.lampeV, 'fill', vert ? '#DDF2B6' : '#5F6B55');
      fondu(S.lueurV, vert ? 0.8 + 0.2 * Math.sin(t * 12) : 0);
      const P = S.profilCab;
      let x, y, s = 1, rot = -90, pose;
      if (u < 0.45) { x = lerp(80, 230, ease(u / 0.45)); y = 600; pose = u > 0.25 ? mix(this.P.debout, this.P.salut, ease(seg(u, 0.25, 0.4))) : this.P.debout; }
      else { // il plonge dans la porte, puis rapetisse vers les Puys
        const v = seg(u, 0.45, 1);
        x = lerp(230, 380, easeOut(v)); y = lerp(600, 420, easeOut(v)) + easeIn(v) * 40;
        s = lerp(1, 0.18, easeIn(v)); rot = lerp(-90, 10, ease(Math.min(1, v * 2)));
        pose = mix(this.P.salut, this.P.plonge, ease(Math.min(1, v * 3)));
      }
      P.G.setAttribute('transform', tr(x, y, rot, s));
      this.rig.poseProfil(P, pose, t, true);
    }
    /* ---------- 5 · Chute libre : plongée verticale sur son dos ---------- */
    _chute(t, u) {
      const S = this.S;
      this._carte(S.carte, 500, 560, lerp(0.35, 0.5, u), Math.sin(t * 0.8) * 8);
      show(S.avion.g, false); show(S.dos.G, true); show(S.objAer, false); show(S.pov, false);
      S.dos.G.setAttribute('transform', tr(300 + Math.sin(t * 1.3) * 10, 400, Math.sin(t) * 10, 1.05));
      this.rig.poseDos(S.dos, t, 1, 0);
      if (S.dos.rabat) S.dos.rabat.setAttribute('transform', '');
      this._nuagesRadiaux(this.nAer, u * 0.9, 1);
      this._traitsRadiaux(u, 0.6);
    }
    /* ---------- 6 · La poignée : contre-plongée, il tire la poignée ---------- */
    _poignee(t, u) {
      const S = this.S;
      setA(S.contreMonde, 'transform', `rotate(${f(-8)} 300 390)`);
      this._nuagesRadiaux(this.nCon, u * 0.6, -1);
      const F = S.faceC;
      this._contreObjets(false);
      show(F.G, true);
      const s = lerp(1.1, 1.25, u);
      F.G.setAttribute('transform', tr(300, 380, 0, s));
      // la main est posée sur l'anneau, à la boucle de la bretelle ; elle l'empoigne, prend un petit élan,
      // puis l'arrache d'un coup sec vers l'extérieur et le bas (l'événement « poignee », 11,3 s, tombe sur l'arraché) ;
      // le cordon se déroule, tendu, et la main rebondit un peu en bout de course
      const R = BB.BougnatDessin || {}, A = R.ANCRE_CORDON || [30, -12];
      const Y = [112, 86]; // vers le bas et l'extérieur : le coude s'écarte, le cordon reste bien visible sur la poitrine
      const approche = ease(seg(u, 0, 0.16)), elan = ease(seg(u, 0.3, 0.4)), arrache = easeOut(seg(u, 0.4, 0.47)), rebond = seg(u, 0.47, 0.66);
      let hx = lerp(A[0] + 22, A[0], approche) - 7 * elan * (1 - arrache), hy = lerp(A[1] - 16, A[1], approche) - 6 * elan * (1 - arrache);
      hx = lerp(hx, Y[0], arrache); hy = lerp(hy, Y[1], arrache);
      const osc = Math.sin(rebond * Math.PI * 2.5) * (1 - rebond) * (rebond > 0 ? 1 : 0);
      hx += osc * 9; hy += osc * 11 + Math.sin(t * 3) * 1.5 * seg(u, 0.66, 1);
      const tire = seg(u, 0.4, 1) > 0;
      this.rig.poseFace(F, { bg: [-62, -30, -150, -120], bd: [62, -30, hx, hy], jambes: [-34, -110, 190, 34, 110, 190], yeux: 0.4, bouche: tire ? 8 : 4, casq: 0,
        sac: true, cordon: 'main' }); // la main droite tient l'anneau (le personnage dessine l'anneau et le cordon)
      // le cordon et l'anneau de repli, seulement si le personnage ne les dessine pas
      const repli = !R.ANCRE_CORDON;
      show(S.poigneeC, repli); show(S.cordonC, repli);
      if (repli) {
        const P = (x, y) => [300 + x * s, 380 + y * s];
        const [ax, ay] = P(A[0], A[1]), [bx, by] = P(hx, hy);
        const mou = (1 - arrache) * 14 + Math.max(0, -osc) * 6; // le cordon pend un peu avant l'arraché, tendu après
        setA(S.cordonC, 'd', `M${pt(ax, ay)}Q${pt((ax + bx) / 2 + mou * 0.3, (ay + by) / 2 + mou)} ${pt(bx, by)}`);
        place(S.poigneeC, bx, by, arrache * 40);
      }
    }
    /* ---------- 7 · Un menu ! : plongée, le sac s'ouvre, tout vole vers nous ---------- */
    _menu(t, u) {
      const S = this.S;
      this._carte(S.carte, 500, 560, lerp(0.5, 0.56, u), Math.sin(t * 0.8) * 8);
      show(S.avion.g, false); show(S.dos.G, true); show(S.objAer, true); show(S.pov, false);
      S.dos.G.setAttribute('transform', tr(300, 470, -6, 1.1));
      this.rig.poseDos(S.dos, t, lerp(1, 0.8, u), ease(seg(u, 0, 0.3)));
      if (S.dos.rabat) S.dos.rabat.setAttribute('transform', `translate(0 ${f(-40 * back(seg(u, 0.05, 0.2)))}) scale(1 ${f(lerp(1, -0.6, back(seg(u, 0.05, 0.2))))})`);
      const vol = (O, dx, dy, r0, d0) => {
        const v = easeOut(seg(u, d0, d0 + 0.75));
        place(O.g, 300 + dx * v, 440 + dy * v, r0 * v * 360, lerp(0.4, 2.4, v));
        show(O.g, u > d0);
      };
      vol(S.burgerA, -120, -300, 0.8, 0.1);
      vol(S.fritesA, 150, -260, -0.6, 0.16);
      vol(S.boissonA, 20, -360, 0.5, 0.22);
      this._nuagesRadiaux(this.nAer, 0.9 + u * 0.5, 1);
      this._traitsRadiaux(u, 0.5);
    }
    /* ---------- 8 · Oh non ! : gros plan, zoom brutal, il comprend ---------- */
    _peur(t, u) {
      const S = this.S;
      setA(S.contreMonde, 'transform', `rotate(${f(-8 + Math.sin(t * 38) * 1.6)} 300 390)`);
      this._nuagesRadiaux(this.nCon, u * 0.9, -1);
      this._contreObjets(false);
      const F = S.faceC;
      show(F.G, true);
      const z = lerp(1.7, 2.6, easeOut(seg(u, 0, 0.18)));
      const k = (1 - seg(u, 0.15, 1)) * 7;
      F.G.setAttribute('transform', tr(300 + Math.sin(t * 50) * k, 590 + Math.cos(t * 43) * k, 0, z));
      const p = back(seg(u, 0.05, 0.25));
      this.rig.poseFace(F, { bg: [-62, -30, -150, -160], bd: [62, -30, 150, -160], jambes: [-34, -110, 190, 34, 110, 190], peur: p, bouche: lerp(3, 16, p), boucheL: lerp(12, 16, p), casq: Math.sin(t * 30) * 6, casqY: -26 * p, sac: true, cordon: 'libre' });
      // les traits de choc qui clignotent autour du cadre
      show(S.choc, u > 0.04);
      const fl = Math.floor(t * 24);
      this.choc.forEach((c, i) => fondu(c, ((i * 7 + fl) % 5 < 3 ? 0.55 : 0.12) * (1 - seg(u, 0.6, 1) * 0.6)));
    }
    /* ---------- 9 · Tout attraper : il fonce en courbe et rafle les trois d'un coup ---------- */
    _tout(t, u) {
      const S = this.S;
      this._ciel(t, u, lerp(-20, 16, ease(u)), 0.58);
      show(S.burger.g, true); show(S.boisson.g, true); show(S.frites.g, true);
      croque(S.burger, 0);
      setA(S.boisson.liquide, 'transform', ''); fondu(S.boisson.mousse, 1);
      S.frites.liste.forEach((fr) => show(fr, true));
      // la trajectoire : une courbe qui passe par les trois objets, puis revient au centre
      const way = [[60, 620], [170, 330], [430, 250], [480, 500], [300, 430]];
      const k = ease(u) * (way.length - 1), i = Math.min(way.length - 2, Math.floor(k)), v = k - i;
      const a = way[i], b = way[i + 1];
      const x = lerp(a[0], b[0], ease(v)), y = lerp(a[1], b[1], ease(v));
      const cap = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
      const P = S.profil;
      const fin = ease(seg(u, 0.78, 0.95));
      const rot = lerp(cap, -8, fin);
      P.G.setAttribute('transform', tr(x, y, rot, 0.95));
      this.rig.poseProfil(P, mix(this.P.tend, this.P.calin, fin), t);
      // chaque objet flotte jusqu'à son passage, puis se range contre lui
      const rr = (rot * Math.PI) / 180;
      const toS = (lx, ly) => [x + (lx * Math.cos(rr) - ly * Math.sin(rr)) * 0.95, y + (lx * Math.sin(rr) + ly * Math.cos(rr)) * 0.95];
      const objets = [[S.burger, [170, 290], 0.22, [95, 34]], [S.frites, [430, 205], 0.47, [60, 30]], [S.boisson, [485, 450], 0.72, [125, 24]]];
      objets.forEach(([O, pos, tPrise, rangement], j) => {
        const pris = ease(seg(u, tPrise - 0.04, tPrise + 0.08));
        const flotte = [pos[0] + Math.sin(t * 2 + j) * 12, pos[1] + Math.cos(t * 1.7 + j) * 10];
        const cible = toS(rangement[0], rangement[1]);
        place(O.g, lerp(flotte[0], cible[0], pris), lerp(flotte[1], cible[1], pris), lerp(t * 60 * (j % 2 ? -1 : 1), rot, pris), lerp(1.2, 0.8, pris));
      });
    }
    /* ---------- 10 · Tout manger : face, à toute vitesse ---------- */
    _mange(t, u) {
      const S = this.S;
      setA(S.contreMonde, 'transform', `rotate(${f(6)} 300 390)`);
      this._nuagesRadiaux(this.nCon, 0.3 + u * 0.5, -1);
      const F = S.faceC;
      show(F.G, true);
      this._contreObjets(true);
      F.G.setAttribute('transform', tr(300, 640, 0, 1.9));
      const bouche = [300, 640 + (-96 + 30) * 1.9];
      const mache = Math.abs(Math.sin(t * 26));
      this.rig.poseFace(F, { bg: [-62, -30, -40, 30], bd: [62, -30, 40, 30], jambes: [-34, -110, 190, 34, 110, 190], bouche: 4 + mache * 12, joues: u < 0.85 ? 0.35 + mache * 0.4 : 0, yeux: 0.7, sac: true });
      // le burger (0 → 0,32), les frites (0,32 → 0,58), la boisson (0,58 → 0,82), près de la bouche
      const pos = (i) => [bouche[0] + [-70, 80, 10][i], bouche[1] + 60];
      const [bx, by] = pos(0), [fx, fy] = pos(1), [dx, dy] = pos(2);
      const pb = seg(u, 0, 0.32), pf = seg(u, 0.32, 0.58), pd = seg(u, 0.58, 0.82);
      show(S.burgerC.g, pb < 1); place(S.burgerC.g, lerp(bx, bouche[0] - 20, ease(pb)), lerp(by, bouche[1] + 20, ease(pb)), -10, 1.7);
      croque(S.burgerC, pb > 0.75 ? 3 : pb > 0.5 ? 2 : pb > 0.2 ? 1 : 0);
      show(S.fritesC.g, pf < 1); place(S.fritesC.g, lerp(fx, bouche[0] + 30, ease(pf)), lerp(fy, bouche[1] + 30, ease(pf)), 15, 1.6);
      S.fritesC.liste.forEach((fr, i) => show(fr, pf < (i + 1) / (S.fritesC.liste.length + 1)));
      show(S.boissonC.g, pd < 1); place(S.boissonC.g, lerp(dx, bouche[0] + 10, ease(pd)), lerp(dy, bouche[1] + 10, ease(pd)), lerp(0, -60, ease(pd)), 1.6);
      setA(S.boissonC.liquide, 'transform', `translate(0 ${f(46 * pd)})`);
      fondu(S.boissonC.mousse, 1 - pd * 1.2);
      // les miettes jaillissent à chaque bouchée
      const jet = u < 0.82 ? (u * 7) % 1 : 1;
      this.miettes.forEach((c) => {
        const d = jet * c.v;
        place(c.m, bouche[0] + Math.cos(c.a) * d, bouche[1] + 30 + Math.sin(c.a) * d * 0.7 + jet * jet * 40, c.a * 57 + jet * 200);
        fondu(c.m, u < 0.82 ? 1 - jet : 0);
      });
    }
    /* ---------- 11 · La force ! : contre-plongée, il gonfle les muscles, gloire dorée ---------- */
    _force(t, u) {
      const S = this.S;
      setA(S.contreMonde, 'transform', `rotate(${f(-4)} 300 390)`);
      this._nuagesRadiaux(this.nCon, 0.8 + u * 0.6, -1);
      this._contreObjets(false);
      const F = S.faceC;
      show(F.G, true);
      const m = back(seg(u, 0.08, 0.4));
      const z = lerp(1.25, 1.5, ease(u));
      F.G.setAttribute('transform', tr(300, 560, 0, z));
      this.rig.poseFace(F, { bg: [-62, -30, lerp(-72, -135, m), lerp(60, -120, m)], bd: [62, -30, lerp(72, 135, m), lerp(60, -120, m)], jambes: [-34, -100, 190, 34, 100, 190],
        muscles: m, halo: m * (0.75 + 0.25 * Math.sin(t * 10)), eclats: m, moustHaut: m, decide: m, yeux: 0.7, bouche: 3, boucheL: 16, sac: true });
      if (F.eclats && F.eclats.children) [...F.eclats.children].forEach((e, i) => {
        const a = (i / 6) * Math.PI * 2 + t * 1.5, d = 170 + Math.sin(t * 6 + i) * 20;
        const s = 0.5 + 0.5 * Math.abs(Math.sin(t * 5 + i * 1.3));
        e.setAttribute('transform', tr(Math.cos(a) * d, -40 + Math.sin(a) * d * 1.15, t * 90, s * m));
      });
      // la gloire dorée : rayons qui tournent, anneaux qui s'élargissent
      const gm = clamp(m);
      show(S.gloire, gm > 0.01);
      place(S.gloire, 300, 560 - 60 * z, 0, 0.4 + gm * 0.7);
      fondu(S.gloire, gm);
      place(S.gloireRayons, 0, 0, t * 14);
      [...S.anneaux.children].forEach((c, i) => {
        const p = (u * 1.6 + i / 3) % 1;
        setA(c, 'r', f(80 + p * 300)); fondu(c, (1 - p) * 0.5 * gm);
      });
      show(S.etincelles, gm > 0.01);
      this.eti.forEach((e) => {
        const p = (t * 0.9 + e.ph) % 1, a = e.a + t * 0.6;
        place(e.g, 300 + Math.cos(a) * e.d * z * 0.8, 560 - 60 * z + Math.sin(a) * e.d * z, p * 180, gm * Math.sin(p * Math.PI) * 1.3);
      });
    }
    // les objets de la contre-plongée : visibles seulement pour « tout manger »
    _contreObjets(on) {
      const S = this.S;
      show(S.fritesC.g, on); show(S.burgerC.g, on); show(S.boissonC.g, on); show(S.miettes, on);
      show(S.poigneeC, false); show(S.cordonC, false); show(S.gloire, false); show(S.etincelles, false); show(S.choc, false);
    }
    /* ---------- 12 · Le sol ! : vue subjective, la carte fonce vers nous ---------- */
    _sol(t, u) {
      const S = this.S;
      const z = lerp(0.6, 6, easeIn(u));
      this._carte(S.carte, lerp(510, PRE_C[0], u), lerp(520, PRE_C[1], u), z, Math.sin(t * 7) * (2 + u * 6));
      show(S.avion.g, false); show(S.dos.G, false); show(S.objAer, false); show(S.pov, true);
      this._nuagesRadiaux(this.nAer, 1.4 + u * 0.9, 1, 1 - seg(u, 0.3, 0.55)); // on passe sous les derniers nuages, puis le pré se dégage
      this._traitsRadiaux(u * 2, 0.6 + u);
      const b = Math.sin(t * 22) * 30;
      place(S.povG, 70 + b, 742 - Math.abs(b) * 0.6, 208 + b * 0.4);
      setA(S.povD, 'transform', tr(530 - b, 742 - Math.abs(b) * 0.6, -208 - b * 0.4) + ' scale(-1 1)');
      fondu(S.vignette, 0.4 + u * 0.5);
    }
    /* ---------- 13 · Boum : au ras du sol, il tombe dans le pré ---------- */
    _boum(t, u) {
      const S = this.S;
      this._solVue(1.35, 300, 690, 300, 690, false);
      show(S.face.G, false); show(S.frite, false); show(S.chuteSol, u < 0.12); show(S.cratere, u >= 0.12); show(S.sacDechire, false);
      place(S.chuteSol, lerp(420, 300, seg(u, 0, 0.12)), lerp(-60, 670, easeIn(seg(u, 0, 0.12))), 18);
      this._fumee(seg(u, 0.12, 1), u >= 0.12, 0);
      const c = seg(u, 0.12, 0.34);
      show(S.impact, u >= 0.12);
      if (u >= 0.12) {
        show(S.eclatChoc, c < 1); place(S.eclatChoc, 0, 0, c * 40, 0.4 + easeOut(c) * 1.3); fondu(S.eclatChoc, 1 - c);
        const o = seg(u, 0.12, 0.7);
        setA(S.onde, 'rx', f(100 + easeOut(o) * 380)); setA(S.onde, 'ry', f(20 + easeOut(o) * 70)); fondu(S.onde, (1 - o) * 0.8);
        this._mottes(seg(u, 0.12, 1));
      }
      fondu(S.flash, u >= 0.12 && u < 0.3 ? 0.8 * (1 - seg(u, 0.12, 0.3)) : 0);
      const tremble = u >= 0.12 ? (1 - seg(u, 0.12, 0.8)) * 10 : 0;
      if (tremble) setA(S.sol, 'transform', `translate(${f(Math.sin(t * 90) * tremble * 1.4)} ${f(Math.cos(t * 77) * tremble * 1.4)})`);
      this._train(t);
    }
    _mottes(k) {
      this.mottes.forEach((m) => {
        const d = m.v * k, g = 420 * k * k;
        place(m.g, Math.cos(m.a) * d, Math.sin(m.a) * d * 0.9 + g, m.rot * k);
        fondu(m.g, 1 - seg(k, 0.6, 1));
      });
    }
    // la fumée : les bouffées jaillissent (k de 0 à 1), puis retombent et se dissipent (fin de 0 à 1)
    _fumee(k, on, fin) {
      show(this.S.fumee, on && fin < 1);
      if (!on || fin >= 1) return;
      const g = easeOut(Math.min(1, k * 3));
      this.bouffees.forEach((b) => {
        const x = 300 + b.dx * (g + fin * 0.5), y = 640 + b.dy * g + fin * 40 - fin * fin * 30;
        place(b.b, x, y, b.dr * (g + fin), (b.r / 40) * g * (1 + fin * 0.3) * (1 - fin * 0.35));
      });
      fondu(this.S.fumee, 1 - ease(fin)); // le nuage se dissipe d'un bloc (pas de bulles translucides qui se chevauchent)
    }
    // le petit train du Panoramique qui grimpe sur le flanc du dôme
    _train(t) {
      const x = lerp(140, -56, (t * 0.045) % 1), y = voieY(x);
      show(this.S.train, 94.5 - y > 30); // caché dans la hêtraie en bas de la pente
      place(this.S.train, x, y - 1.2, (Math.atan2(voieY(x - 4) - y, -4) * 180) / Math.PI + 180);
    }
    // cadrage de la scène au sol : zoom k autour de (cx, cy) ramené en (ox, oy) ; flou = arrière-plan du gros plan
    _solVue(k, ox, oy, cx, cy, flou, bas = 0) {
      const S = this.S;
      setA(S.solMonde, 'transform', `translate(${ox} ${oy}) scale(${k}) translate(${-cx} ${-cy})`);
      show(S.flou, flou); show(S.flouAvant, flou);
      [S.lointSol, S.domeSol, S.milieuSol, S.nuagesSol, S.soleilSol].forEach((e) => show(e, !flou));
      show(S.preSol, true);
      // en contre-plongée (bas > 0), le lointain descend : la ligne d'horizon s'abaisse derrière lui
      setA(S.lointSol, 'transform', bas ? `translate(0 ${f(bas * 0.5)})` : '');
      setA(S.domeSol, 'transform', `translate(300 ${f(520 - 94.5 * 1.2 + bas * 0.42)}) scale(1.2)`);
      setA(S.milieuSol, 'transform', bas ? `translate(0 ${f(bas * 0.3)})` : '');
      show(S.brinsBas, bas > 0);
      this.nSol.forEach((n) => place(n.g, n.x + this.t * n.v, n.y + bas * 0.6));
    }
    /* ---------- 14 · Indemne : la fumée retombe, debout, pouce levé ---------- */
    _indemne(t, u) {
      const S = this.S;
      this._solVue(lerp(1.2, 1.1, u), 300, 690, 300, 690, false);
      show(S.face.G, true); show(S.frite, false); show(S.chuteSol, false); show(S.cratere, true); show(S.impact, false); show(S.sacDechire, true);
      this._fumee(1, true, ease(seg(u, 0, 0.44)));
      S.face.G.setAttribute('transform', tr(300, 530, 0, 0.95));
      const pouce = u > 0.5;
      const bd = pouce ? [62, -30, lerp(72, 110, back(seg(u, 0.5, 0.6))), lerp(100, -10, back(seg(u, 0.5, 0.6)))] : [62, -30, 72, 100];
      // la main libre (bg, à gauche de l'image) monte à la visière, la pince et redresse la casquette d'un coup sec,
      // avec un petit dépassement ; elle y reste, sûre d'elle, pendant le pouce levé, puis redescend
      const monte = ease(seg(u, 0.2, 0.33)), tire = seg(u, 0.37, 0.47), descend = ease(seg(u, 0.8, 0.95));
      const b = back(tire), casq = u < 0.37 ? -16 : -16 + 16 * b + 19 * Math.max(0, b - 1);
      const k = (casq + 16) / 16, R = BB.BougnatDessin || {};
      const visiere = R.pointeVisiere ? R.pointeVisiere(casq) : [lerp(-42, -48, k), lerp(-107, -120, k)]; // le bout gauche de la visière suit la casquette
      const repos = [-72, 100], v0 = R.pointeVisiere ? R.pointeVisiere(0) : [-48, -120];
      const hx = descend > 0 ? lerp(v0[0], repos[0], descend) : lerp(repos[0], visiere[0], monte);
      const hy = descend > 0 ? lerp(v0[1], repos[1], descend) : lerp(repos[1], visiere[1], monte);
      const pince = monte > 0.6 && descend < 0.4;
      this.rig.poseFace(S.face, { bg: [-62, -30, hx, hy], bd, pouce, mainG: pince ? 'pince' : undefined, ombre: true, etoiles: u < 0.36, casq, yeux: u < 0.3 ? 0.3 : 1 });
      if (S.face.etoiles && S.face.etoiles.children) [...S.face.etoiles.children].forEach((e, i) => { const a = t * 5 + (i * Math.PI) / 2; e.setAttribute('transform', tr(Math.cos(a) * 58, -150 + Math.sin(a) * 14, t * 200)); });
      if (S.face.tete) S.face.tete.setAttribute('transform', 'translate(0 -96)');
      this._train(t);
    }
    /* ---------- 15 · La dernière : contre-plongée depuis ses pieds, la frite tombe sur la casquette ---------- */
    _derniere(t, u) {
      const S = this.S;
      // caméra basse : le décor descend, le bougnat grandit et domine le cadre
      this._solVue(1.55, 300, 770, 300, 690, false, 60);
      show(S.face.G, true); show(S.frite, true); show(S.chuteSol, false); show(S.cratere, true); show(S.impact, false); show(S.sacDechire, true);
      this._fumee(0, false, 0);
      S.face.G.setAttribute('transform', tr(300, 540, 0, 1.0));
      this.rig.poseFace(S.face, { ombre: true });
      const choc = u >= 0.55 ? Math.sin((u - 0.55) * 40) * 7 * (1 - seg(u, 0.55, 0.85)) : 0;
      if (S.face.tete) S.face.tete.setAttribute('transform', `translate(0 -96) rotate(${f(choc)})`);
      // coordonnées de la frite dans le repère du décor (solMonde)
      const cible = [300, 540 - 96 - 60];
      let x, y, rr;
      if (u < 0.55) { const v = easeIn(seg(u, 0, 0.55)); x = 300; y = lerp(-200, cible[1], v); rr = v * 540; }
      else { const v = seg(u, 0.55, 1); x = 300 + v * 44; y = cible[1] - Math.sin(Math.min(1, v * 1.4) * Math.PI) * 70 + (v > 0.72 ? 6 : 0); rr = 540 + Math.min(1, v * 1.4) * 250; }
      place(S.frite, x, y, rr, 1);
      this._train(t);
    }
    /* ---------- 16 · Crunch : gros plan, il la prend et la croque ---------- */
    _crunch(t, u) {
      const S = this.S;
      this._solVue(2.1, 300, 360, 300, 434, true);
      show(S.face.G, true); show(S.frite, u < 0.55); show(S.chuteSol, false); show(S.cratere, true); show(S.impact, false); show(S.sacDechire, false);
      // l'arrière-plan flou respire : dérive lente en parallaxe, rais qui oscillent, poussière qui monte, feu rouge qui clignote
      const d = t - 26.6;
      place(S.flouLoin, -d * 1.6, 0);
      place(S.flouRais, 196, 470, Math.sin(d * 0.9) * 1.6); fondu(S.flouRais, 0.8 + 0.2 * Math.sin(d * 1.7));
      place(S.flouPoussiere, d * 3.2 + Math.sin(d * 0.8) * 2, -d * 2.4);
      place(S.flouBokeh, d * 2.2, -d * 0.8);
      place(S.flouAvant, d * 3, 0);
      S.fantomes.forEach((fa) => place(fa.g, 196 + (104 + d * 3) * fa.k, 470 + (-36 - d * 0.5) * fa.k));
      fondu(S.feuRouge, Math.sin(d * 3.2) > -0.2 ? 1 : 0.25);
      this._fumee(0, false, 0);
      S.face.G.setAttribute('transform', tr(300, 530, 0, 0.95));
      // la main (le bout des doigts, forme « pince ») : va chercher la frite sur la casquette, l'amène à la bouche,
      // la pousse dedans — crunch —, puis se pose sur la joue pendant qu'il savoure
      const u1 = ease(seg(u, 0.05, 0.2)), u2 = ease(seg(u, 0.25, 0.42)), u3 = ease(seg(u, 0.42, 0.47)), u4 = ease(seg(u, 0.5, 0.64));
      const PRISE = [63, -160], BOUCHE = [42.6, -73.2], DEDANS = [37, -72.6], JOUE = [26, -70];
      let hx = lerp(72, PRISE[0], u1), hy = lerp(100, PRISE[1], u1);
      hx = lerp(hx, BOUCHE[0], u2); hy = lerp(hy, BOUCHE[1], u2);
      hx = lerp(hx, DEDANS[0], u3); hy = lerp(hy, DEDANS[1], u3);
      hx = lerp(hx, JOUE[0], u4); hy = lerp(hy, JOUE[1], u4);
      const mache = u > 0.5 ? Math.abs(Math.sin((u - 0.5) * 30)) : 0;
      this.rig.poseFace(S.face, { bd: [62, -30, hx, hy], mainD: u < 0.5 ? 'pince' : undefined, ombre: false, bouche: u > 0.36 && u < 0.47 ? 10 : 2 + mache * 5, yeux: u > 0.5 ? 0.25 : 1 });
      if (S.face.moust) S.face.moust.setAttribute('transform', `translate(0 ${f(u > 0.5 ? -2 - mache * 2 : 0)})`);
      if (S.face.tete) S.face.tete.setAttribute('transform', 'translate(0 -96)');
      // la frite : posée en travers sur la casquette ; une fois prise, tenue par son bout droit, l'autre bout
      // arrive dans la bouche ouverte (bouche du rig : (0, 30) dans le repère de la tête) ; avalée d'un « croc »
      show(S.frite, u < 0.47);
      if (u < 0.2) place(S.frite, 344, 530 - 96 * 0.95 - 58, 80, 1);
      else place(S.frite, 300 + hx * 0.95 - 15.9, 530 + hy * 0.95 + 2.8, 80, 1);
    }
    /* ---------- 17 · Iris : le cercle se referme sur son visage ---------- */
    _iris(t, u, setIris) {
      this._crunch(t, 1);
      const face = [300, 360 + (530 - 96 * 0.95 - 434) * 2.1];
      setIris([face[0], face[1], lerp(900, 0, ease(seg(u, 0, 0.8)))]);
    }

    /* la scène « ciel » de profil (plan 9) : parallaxe de la chaîne, cadre penché */
    _ciel(t, u, penche, alt) {
      const S = this.S;
      setA(S.cielMonde, 'transform', `rotate(${f(penche)} 300 390)`);
      const up = 1 - alt;
      place(S.loin, 0, lerp(760, 500, up) - u * 10);
      // le dôme un peu plus haut que dans l'animatique : sa silhouette entière et l'antenne restent dans le cadre penché
      const sD = lerp(0.5, 1.3, Math.pow(up, 1.5)) * 0.9;
      place(S.domeC, 300 + Math.sin(t * 0.3) * 20, lerp(860, 540, Math.pow(up, 1.15)) - 42 - u * 16 - 94.5 * sD, 0, sD);
      place(S.colline, 0, lerp(1040, 630, Math.pow(up, 1.7)) - 150 - u * 30);
      place(S.soleil9, 150, lerp(760, 500, up) - u * 10 - 40);
      const dist = t * 0.9;
      this.nuages.forEach((n) => {
        const span = H + 700;
        let y = (n.y - dist * 140 * n.k) % span;
        if (y < -350) y += span;
        place(n.c, n.x, y - 150);
      });
      this.traits.forEach((s) => {
        const span = H + 300;
        let y = (s.y - dist * 520 * s.v) % span;
        if (y < -150) y += span;
        setA(s.l, 'transform', `translate(${f(s.x)} ${f(y - 120)})`);
      });
    }

    _events(t) {
      const last = this._lastT;
      this._lastT = t;
      if (last === undefined || !this.onEvent || !this.playing) return;
      if (t < last) { EVENTS.forEach(([et, type]) => { if (et > last || et <= t) this.onEvent(type, et); }); return; }
      EVENTS.forEach(([et, type]) => { if (et > last && et <= t) this.onEvent(type, et); });
    }

    seek(t) { this._lastT = undefined; this._plan = -1; this.frame(t); }
    start() {
      if (this.playing) return;
      this.playing = true;
      if (this.reduced) { this.frame(19.4); return; }
      this._loop();
    }
    _loop() {
      cancelAnimationFrame(this._raf);
      this._t0 = performance.now() - (this.t * 1000) / this.speed;
      const tick = (now) => {
        if (!this.playing || !this._vis) return;
        // au tout début, l'iris reste fermé tant que la carte en image se prépare (3 s au plus) : pas d'à-coup à l'ouverture ;
        // on ne redessine rien pendant l'attente, pour laisser au navigateur le temps libre où il encode l'image
        if (this.t < 0.02 && this._calque && !this._calque.pret && now - this._nait < 3000) this._t0 = now;
        else this.frame(((now - this._t0) / 1000) * this.speed);
        this._raf = requestAnimationFrame(tick);
      };
      this._raf = requestAnimationFrame(tick);
    }
    stop() { this.playing = false; cancelAnimationFrame(this._raf); }
    setSpeed(k) { this.speed = k; if (this.playing) this._loop(); }
    destroy() {
      this.stop(); this._mort = true;
      this._io && this._io.disconnect();
      this._ro && this._ro.disconnect();
      if (this._calque) { this._calque.parts.forEach((p) => { p.c.width = p.c.height = 0; }); this._calque.div.remove(); }
      this.S.svg.remove();
    }
  }
  Histoire.PLANS = PLANS;
  Histoire.EVENTS = EVENTS;
  BB.Histoire = Histoire;
})();
