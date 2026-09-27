/* ==========================================================================
   Bougnat Burger — les autres plats en 3D : viandes, salades, wraps
   Même cuisine que les burgers (bb-bake.js : chaque ingrédient cuit pixel par
   pixel, lumière de studio, vue plongeante ~25°) et même moteur (bb-burger.js :
   horloge commune, observateurs, étiquettes, image figée des cartes).
   Présentation calquée sur celle du restaurant :
     · viandes : assiette blanche, la viande grillée (bavette tranchée au bout,
       steak haché épais au cœur saignant), frites maison et salade maison ;
     · salades : le tas de salade et mesclun dans l'assiette (l'Auvergnate sur
       l'ardoise), les garnitures qui tombent une à une, les toasts dorés dessus ;
     · wraps : la galette ouverte sur l'ardoise, la garniture posée en bande,
       roulée, coupée en biais : deux moitiés montrent les couches enroulées.
   Les ingrédients sont ceux du texte de la carte (bb-data.js, desc), rien de
   plus ; les frites et la salade des viandes viennent de BB.SIDES.

   const p = new BB.Plat(host, 'allier', {
     size: 'card' | 'hero', autoplay: 'once' | true | false, labels, lang: 'fr' | 'en', interactive });
   p.explode = 0..1 (0 : servi ; 1 : détaillé et étiqueté — éclaté, ou galette ouverte pour un wrap)
   p.play() ; p.stop() ; p.compose() ; p.setLang('en') ; p.destroy()
   BB.PLATS : les scènes, clés = ids de bb-data.js ; BB.hasPlat(id).
   Script classique ; charger après bb-bake.js et bb-burger.js.
   ========================================================================== */
(function () {
  'use strict';

  const BB = window.BB;
  if (!BB || !BB.Burger || !BB.Burger._kit || !BB.bake) return;
  const K = BB.Burger._kit;
  const { wake, observe, unobserve, injectCSS, measure, wrap: wrapText, attr, clamp, smooth, inOut, outCubic, r2, r3 } = K;
  const PHI = ((BB.bake.PHI_PLAT || 40) * Math.PI) / 180, S = Math.sin(PHI), C = Math.cos(PHI);
  const XLINK = 'http://www.w3.org/1999/xlink';
  const SHADOW = '#140C08';
  const DROP = 1.5; // hauteur d'où tombent les ingrédients
  const PORT_W = 1.08, PORT_DY = 0.02; // devant un hublot : l'assiette ≈ 1,1 × son diamètre

  /* ======================================================================
     Les scènes : couches dans l'ordre où elles arrivent ; w = l'ingrédient
     de la carte qu'elles portent (index dans le texte de la carte, ou
     'frites' / 'salade' pour les accompagnements des viandes)
     ====================================================================== */
  const SCENES = {
    bavette: { kind: 'viande', base: 'assiette', layers: [
      { tex: 'salade-maison', w: 'salade' }, { tex: 'frites', w: 'frites' }, { tex: 'bavette-entiere', sliced: 'bavette-tranchee', w: 0 },
    ] },
    'steak-hache': { kind: 'viande', base: 'assiette', layers: [
      { tex: 'salade-maison', w: 'salade' }, { tex: 'frites', w: 'frites' }, { tex: 'steak-epais', w: 0 },
    ] },
    allier: { kind: 'salade', base: 'assiette', layers: [
      { tex: 'mesclun-tas', w: 0 }, { tex: 'copeaux-cantal', w: 3 }, { tex: 'miettes-bleu', w: 2 }, { tex: 'tomates-cerises', w: 4 }, { tex: 'saumon-rosaces', w: 1 },
    ] },
    'chevre-chaud': { kind: 'salade', base: 'assiette', layers: [
      { tex: 'mesclun-tas', w: 0 }, { tex: 'rubans-jambon', w: 3 }, { tex: 'tomates-cerises', w: 6 }, { tex: 'pignons', w: 4 },
      { tex: 'toasts-chevre', w: 1 }, { tex: 'miel-toasts', w: 2 }, { tex: 'herbes-provence', w: 5 },
    ] },
    vercingetorix: { kind: 'salade', base: 'assiette', layers: [
      { tex: 'mesclun-tas', w: 0 }, { tex: 'copeaux-cantal', w: 1 }, { tex: 'lanieres-poivrons', w: 3 }, { tex: 'tomates-cerises', w: 5 },
      { tex: 'croutons', w: 4 }, { tex: 'tranches-poulet', w: 2 },
    ] },
    auvergnate: { kind: 'salade', base: 'ardoise', layers: [
      { tex: 'mesclun-tas', w: 0 }, { tex: 'rubans-jambon', w: 1 }, { tex: 'miettes-bleu', w: 2 }, { tex: 'copeaux-cantal', w: 3 },
      { tex: 'cerneaux-noix', w: 4 }, { tex: 'tomates-cerises', w: 5 },
    ] },
    sancy: { kind: 'salade', base: 'assiette', layers: [
      { tex: 'mesclun-tas', w: 0 }, { tex: 'copeaux-cantal', w: 2 }, { tex: 'rubans-jambon', w: 3 }, { tex: 'tomates-cerises', w: 4 }, { tex: 'toasts-sancy', w: 1 },
    ] },
    'wrap-saumon': { kind: 'wrap', base: 'ardoise', rec: 'saumon', layers: [
      { tex: 'tortilla', w: 0 }, { tex: 'ruban-sauce-aneth', w: 4 }, { tex: 'ruban-salade', w: 3 }, { tex: 'ruban-tomates', w: 2 }, { tex: 'ruban-saumon', w: 1 },
    ] },
    'wrap-chevre': { kind: 'wrap', base: 'ardoise', rec: 'chevre', layers: [
      { tex: 'tortilla', w: 0 }, { tex: 'ruban-sauce-ciboulette', w: 6 }, { tex: 'ruban-salade', w: 5 }, { tex: 'ruban-tomates', w: 4 },
      { tex: 'ruban-jambon', w: 3 }, { tex: 'ruban-chevre', w: 1 }, { tex: 'ruban-miel', w: 2 },
    ] },
    'wrap-poulet': { kind: 'wrap', base: 'ardoise', rec: 'poulet', layers: [
      { tex: 'tortilla', w: 0 }, { tex: 'ruban-sauce-curry', w: 5 }, { tex: 'ruban-salade', w: 4 }, { tex: 'ruban-tomates', w: 2 },
      { tex: 'ruban-poivrons', w: 3 }, { tex: 'ruban-poulet', w: 1 },
    ] },
  };
  Object.keys(SCENES).forEach((id) => { SCENES[id].id = id; });
  BB.PLATS = SCENES;
  BB.hasPlat = (id) => !!SCENES[id];

  // géométrie commune avec bb-bake.js (le wrap roulé, les deux moitiés, la galette)
  const WR = { R: 0.21, y: -0.3, L: 0.62, top: 0.045 };
  const TOR = { y: 0.04, R: 0.78 };
  const HALF_Y = { a: 0.22, b: -0.24 };
  // l'ordre de dessin (de l'arrière vers l'avant) des garnitures posées sur l'assiette
  const DEPTH = {
    'rubans-jambon': -0.44, 'tranches-poulet': 0, croutons: 0.01, 'toasts-chevre': 0.02, 'toasts-sancy': 0.02, 'miel-toasts': 0.03, 'herbes-provence': 0.04,
    'saumon-rosaces': 0.1, 'copeaux-cantal': 0.22, 'miettes-bleu': 0.22, 'lanieres-poivrons': 0.23, pignons: 0.28, 'cerneaux-noix': 0.46, 'tomates-cerises': 0.5,
    'bavette-entiere': -0.22, 'steak-epais': -0.2, frites: -0.16, 'salade-maison': 0.4,
  };
  const BAV = { x: -0.24, y: -0.22, rot: -0.2, L: 0.54, cut: 0.32 };

  /* ---------- les mots de la carte ---------- */
  const menuItem = (id) => (BB.MENU_OTHER || []).find((it) => it.id === id);
  const capit = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  function sidesParts(lang) {
    const s = BB.SIDES ? BB.SIDES[lang] || BB.SIDES.fr : '';
    const m = /(?:avec|with)\s+(.+?)\s+(?:et|and)\s+(.+?)\.?$/.exec(s);
    return m ? [m[1], m[2]] : lang === 'en' ? ['homemade fries', 'house salad'] : ['frites faites maison', 'salade maison'];
  }
  function labelText(scene, L, lang) {
    if (L.w === 'frites') return capit(sidesParts(lang)[0]);
    if (L.w === 'salade') return capit(sidesParts(lang)[1]);
    const it = menuItem(scene.id);
    const d = it && it.desc ? it.desc[lang] || it.desc.fr : '';
    // la viande : la première phrase (« Bavette de bœuf charolais bio, 300 g ») ; sinon la liste, virgule par virgule
    if (scene.kind === 'viande') return capit(d.split(/\.\s+/)[0].replace(/\.\s*$/, ''));
    const parts = d.replace(/\.\s*$/, '').split(/,\s+/);
    return capit(parts[L.w] || '');
  }

  // les images figées des cartes (une par plat, taille et finesse)
  const STILLS = K.STILLS;

  /* ======================================================================
     Le plat
     ====================================================================== */
  class Plat {
    constructor(host, id, opts) {
      opts = opts || {};
      const hero = opts.size === 'hero';
      this.host = host;
      this.o = Object.assign({ size: 'card', autoplay: true, labels: hero, lang: 'fr', interactive: hero }, opts);
      this.hero = hero;
      this.lang = this.o.lang === 'en' ? 'en' : 'fr';
      this.uid = BB.uid('bbp');
      this._once = this.o.autoplay === 'once';
      this.scene = SCENES[id] || SCENES.allier;
      this.recipe = { id: this.scene.id, name: menuItem(this.scene.id) ? menuItem(this.scene.id).name : { fr: id, en: id } };
      this._composeE = this.scene.kind === 'wrap' ? 1 : 0;
      this._E = 0; this._target = 0;
      this._auto = false; this._wantAuto = false; this._resumeAt = 0;
      this._clock = 0; this._wait = 0; this._delay = 0;
      this._near = false; this._seen = false;
      this._tLast = 0; this._w = 0; this._h = 0;
      this._alive = true;
      this._fresh = !!(this.o.autoplay && !BB.reduced);
      injectCSS();
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      this.svg = BB.svg('svg', { class: 'bb-burger bb-plat bb-plat--' + (hero ? 'hero' : 'card'), role: 'img', focusable: 'false' });
      host.appendChild(this.svg);
      if (host.clientHeight < 8) { this.svg.style.height = 'auto'; this.svg.style.aspectRatio = hero ? '4 / 3' : '1 / 1'; }
      this._build();
      this._aria();
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(this.svg);
      }
      this._resize();
      if (this._once && this._showCached()) return;
      if (this.o.interactive) this._bindPointer();
      observe(this);
      if (this.o.autoplay && !BB.reduced) this.play();
      else { this._E = this._target = 0; this._kick(true); }
    }

    /* ---------- API ---------- */
    get explode() { return this._E; }
    set explode(v) {
      if (this._frozen) return;
      this._auto = false;
      this._wantAuto = false;
      this._frozen2 = false;
      this._target = clamp(+v || 0);
      this.layers.forEach((L) => { L.c = 1; L.d = 0; });
      this._slice = 1;
      if (BB.reduced) this._E = this._target;
      this._kick(true);
    }
    play() {
      if (this._frozen) return;
      this._wantAuto = true;
      this._frozen2 = false;
      if (BB.reduced) return;
      this._auto = true;
      this._wait = 0;
      if (this._fresh) { this._clock = 0; this._delay = this.hero ? 0 : this._once ? this._cascade() : Math.random() * 1.2; }
      else this._clock = this._T.comp + 0.8;
      this._fresh = false;
      this._kick(true);
    }
    stop() {
      this._wantAuto = false;
      this._auto = false;
      this._target = this._E;
      this._kick(true);
    }
    compose() {
      if (BB.reduced || this._frozen) return;
      this._frozen2 = false;
      this._wantAuto = true;
      this._auto = true;
      this._clock = 0;
      this._wait = 0;
      this._kick(true);
    }
    _seek(tc) {
      if (this._frozen) return;
      this._auto = true;
      this._wantAuto = false;
      this._frozen2 = true;
      this._clock = tc;
      this._kick(true);
    }
    setLang(lang) {
      this.lang = lang === 'en' ? 'en' : 'fr';
      this._aria();
      if (this._frozen) return;
      this._layout();
      this._kick(true);
    }
    destroy() {
      this._alive = false;
      unobserve(this);
      if (this._ro) this._ro.disconnect();
      if (this._hit) this._hit.remove();
      if (this.svg) this.svg.remove();
      if (this._img) this._img.remove();
      if (this.host.__bb === this) this.host.__bb = null;
    }
    _cascade() {
      const b = this.host.getBoundingClientRect(), vh = window.innerHeight || 800, vw = window.innerWidth || 400;
      return 0.35 * clamp(b.top / vh) + (b.left + b.width / 2 > vw / 2 ? 0.14 : 0);
    }
    _aria() {
      const it = menuItem(this.scene.id);
      const name = it ? it.name[this.lang] || it.name.fr : this.scene.id;
      const d = it && it.desc ? it.desc[this.lang] || it.desc.fr : '';
      const txt = name + (this.lang === 'en' ? ': ' : ' : ') + d;
      if (this.svg) this.svg.setAttribute('aria-label', txt);
      if (this._img) this._img.alt = txt;
    }

    /* ---------- construction ---------- */
    _image(g, tex) {
      const fr = BB.bake.frame(tex);
      return BB.svg('image', { x: r3(fr.x0), y: r3(fr.y0), width: r3(fr.x1 - fr.x0), height: r3(fr.y1 - fr.y0), preserveAspectRatio: 'none', opacity: 0 }, g);
    }
    _build() {
      const svg = this.svg, uid = this.uid, sc = this.scene;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const defs = BB.svg('defs', null, svg);
      const g0 = BB.svg('radialGradient', { id: uid + '-gr' }, defs);
      [[0, 0.5], [0.5, 0.34], [0.78, 0.12], [1, 0]].forEach(([o, a]) => BB.svg('stop', { offset: o, 'stop-color': SHADOW, 'stop-opacity': a }, g0));
      this._cam = BB.svg('g', { class: 'bb-cam' }, svg);
      this._ground = BB.svg('ellipse', { fill: 'url(#' + uid + '-gr)', opacity: 0 }, this._cam);
      this._imgs = {}; // texture → éléments image qui la montrent
      const reg = (tex, el) => { (this._imgs[tex] || (this._imgs[tex] = [])).push(el); return el; };
      // le plat (assiette, ardoise)
      const bg = BB.svg('g', { class: 'bb-l' }, this._cam);
      this.base = { tex: sc.base, g: bg, img: reg(sc.base, this._image(bg, sc.base)), frame: BB.bake.frame(sc.base) };
      // les ingrédients ; pour un wrap, ceux de la galette ouverte dans un groupe découpé pendant qu'on roule
      let parent = this._cam;
      if (sc.kind === 'wrap') {
        const cp = BB.svg('clipPath', { id: uid + '-roll' }, defs);
        this._rollClip = BB.svg('rect', { x: -3, y: -3, width: 6, height: 6 }, cp);
        parent = this._flat = BB.svg('g', { 'clip-path': 'url(#' + uid + '-roll)' }, this._cam);
      }
      const n = sc.layers.length;
      // dessin de l'arrière vers l'avant (le tas de salade d'abord) ; l'ordre d'arrivée reste celui de la scène
      const order = sc.kind === 'wrap' ? sc.layers.map((x, i) => i)
        : sc.layers.map((x, i) => i).sort((a, b) => (a === 0 && sc.kind === 'salade' ? -9 : DEPTH[sc.layers[a].tex] || 0) - (b === 0 && sc.kind === 'salade' ? -9 : DEPTH[sc.layers[b].tex] || 0));
      const groups = [];
      order.forEach((i) => { groups[i] = BB.svg('g', { class: 'bb-l', opacity: 0 }, parent); });
      this.layers = sc.layers.map((spec, i) => {
        const g = groups[i];
        const L = { i, spec, tex: spec.tex, w: spec.w, g, img: reg(spec.tex, this._image(g, spec.tex)), frame: BB.bake.frame(spec.tex), c: 0, d: 0, f: 0, imp: 0, al: 0, lz: 0, dz: 0 };
        if (spec.sliced) {
          // la bavette : la version tranchée se découvre sous le couteau, du bout vers le centre
          const cp = BB.svg('clipPath', { id: uid + '-cut' }, defs);
          this._sliceClip = BB.svg('rect', { x: 3, y: -3, width: 6, height: 6 }, cp);
          L.sliced = reg(spec.sliced, this._image(g, spec.sliced));
          L.sliced.setAttribute('clip-path', 'url(#' + uid + '-cut)');
          this._knife = BB.svg('line', { stroke: '#FFF4DE', 'stroke-linecap': 'round', opacity: 0 }, this._cam);
        }
        return L;
      });
      if (sc.kind === 'wrap') {
        const mk = (tex) => { const g = BB.svg('g', { class: 'bb-l', opacity: 0 }, this._cam); return { tex, g, img: reg(tex, this._image(g, tex)), frame: BB.bake.frame(tex) }; };
        this.roll = mk('wrap-roule');
        this.halfB = mk('wrap-' + sc.rec + '-b');
        this.halfA = mk('wrap-' + sc.rec + '-a');
        this._knife = BB.svg('line', { stroke: '#FFF4DE', 'stroke-linecap': 'round', opacity: 0 }, this._cam);
      }
      this._labG = BB.svg('g', { class: 'bb-lab' }, svg);
      this._labels = [];
      this._tex = {};
      // la bavette arrive entière et se tranche pendant la composition ; immobile, elle est servie tranchée
      this._slice = sc.layers.some((s) => s.sliced) && this.o.autoplay && !BB.reduced ? 0 : 1;
      // chronologie de la composition
      let t = 0.25;
      this.layers.forEach((L) => { L.t0 = t; L.dur = 0.62; t += 0.32; });
      const lastEnd = this.layers[n - 1].t0 + 0.62;
      let comp = lastEnd + 0.5;
      if (this.layers.some((L) => L.spec.sliced)) { this._tSlice = lastEnd + 0.2; comp = this._tSlice + 1.1; }
      /* le cycle. E (écartement) : 0 = servi ; 1 = détaillé et étiqueté.
         Wrap : 0,5 = galette garnie ouverte ; au-dessus, la garniture s'élève en couches (étiquettes) ;
         en dessous, la galette se roule (0,5 → 0,22) puis on coupe (0,22 → 0).
         Une carte « once » : composition (puis, pour un wrap, roulé et coupé), et elle se fige. */
      const segs = sc.kind === 'wrap'
        ? (this._once
          ? [['comp', comp, 0.5], ['hold', 0.4, 0.5], ['go', 2.6, 0.5, 0], ['hold', 3, 0], ['off', 1.0, 0]]
          : [['comp', comp, 0.5], ['hold', 1.0, 0.5], ['go', 1.6, 0.5, 1], ['hold', 3.4, 1], ['go', 1.3, 1, 0.5], ['go', 2.8, 0.5, 0], ['hold', 3.2, 0], ['off', 1.0, 0]])
        : [['comp', comp, 0], ['hold', 1.4, 0], ['go', 1.2, 0, 1], ['hold', 4.0, 1], ['go', 1.0, 1, 0], ['hold', 1.8, 0], ['off', 1.0, 0]];
      this._segs = segs;
      this._T = { comp, P: segs.reduce((a, s) => a + s[1], 0), end: sc.kind === 'wrap' ? comp + 0.4 + 2.6 : comp };
      // le détail : de combien chaque couche s'élève (un wrap : la garniture en couches au-dessus de la galette)
      this.layers.forEach((L, i) => {
        if (sc.kind === 'wrap') L.lift = i === 0 ? 0 : 0.16 + 0.2 * (i - 1);
        else L.lift = sc.kind === 'salade' && i === 0 ? 0 : 0.035;
      });
    }

    /* ---------- textures ---------- */
    _texList() {
      const out = [[this.base.tex, 1]];
      const n = this.layers.length;
      this.layers.forEach((L, i) => {
        out.push([L.tex, 0.95 - (0.5 * i) / Math.max(1, n - 1)]);
        if (L.spec.sliced) out.push([L.spec.sliced, 0.3]);
      });
      if (this.roll) { out.push([this.roll.tex, 0.35], [this.halfB.tex, 0.3], [this.halfA.tex, 0.3]); }
      return out;
    }
    _loadTextures() {
      const tier = this.hero ? 2 : 1;
      let base = this.hero ? 10 : this._seen ? 7 : 3;
      if (!this.hero) {
        const b = this.host.getBoundingClientRect(), vh = window.innerHeight || 800, vw = window.innerWidth || 400;
        base += 2 * clamp(1 - b.top / vh) + 0.4 * clamp(1 - b.left / vw);
      }
      const again = this._texAsked;
      this._texAsked = true;
      this._texList().forEach(([tex, w]) => {
        const cur = BB.bake.peek(tex, tier);
        if (cur && !again) this._setTex(tex, cur);
        if (cur && cur.tier >= tier) return;
        if (tier > 1 && !cur) BB.bake.get(tex, 1, base + 2 + w).then((t) => this._setTex(tex, t), () => {});
        BB.bake.get(tex, tier, base + w).then((t) => this._setTex(tex, t), () => {});
      });
    }
    _setTex(tex, t) {
      if (!this._alive || this._frozen) return;
      const cur = this._tex[tex];
      if (cur && cur.tier >= t.tier) return;
      const im = new Image();
      const apply = () => {
        if (this._frozen || !this._alive) return;
        const c2 = this._tex[tex];
        if (c2 && c2.t.tier >= t.tier) return;
        this._tex[tex] = { t, im, tier: t.tier };
        (this._imgs[tex] || []).forEach((el) => {
          el.setAttribute('href', t.url);
          el.setAttributeNS(XLINK, 'xlink:href', t.url);
          el.setAttribute('x', r3(t.frame.x0));
          el.setAttribute('y', r3(t.frame.y0));
          el.setAttribute('width', r3(t.frame.x1 - t.frame.x0));
          el.setAttribute('height', r3(t.frame.y1 - t.frame.y0));
        });
        if (this.o.labels && this._anchMiss && !this._relab) this._relab = requestAnimationFrame(() => { this._relab = 0; if (this._anchMiss) this._layout(); });
        this._kick(true);
      };
      im.src = t.url;
      if (im.decode) im.decode().then(apply, apply);
      else im.onload = apply;
    }
    _ok(tex) { return !!this._tex[tex]; }
    _texReady() { return this._texList().every(([tex]) => this._ok(tex)); }

    /* ---------- mise en page ---------- */
    _resize() {
      if (this._frozen || !this.svg) return;
      const b = this.svg.getBoundingClientRect();
      const w = Math.round(b.width), h = Math.round(b.height);
      if (!w || !h || (w === this._w && h === this._h)) return;
      this._w = w;
      this._h = h;
      this._port = this._porthole();
      this.svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      this._layout();
      if (this._hit) this._placeHit();
      this._pose();
      this._kick(true);
    }
    _porthole() {
      try {
        const cs = getComputedStyle(this.host, '::before');
        if (!cs || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return null;
        const d = parseFloat(cs.width), hh = parseFloat(cs.height) || d;
        if (!(d > 24)) return null; // (le ::before sert de repère de cadrage, visible ou non, rond ou non)
        let left = parseFloat(cs.left);
        const bottom = parseFloat(cs.bottom), top = parseFloat(cs.top);
        const m = /matrix\(([^)]+)\)/.exec(cs.transform || '');
        const tx = m ? parseFloat(m[1].split(',')[4]) || 0 : 0, ty = m ? parseFloat(m[1].split(',')[5]) || 0 : 0;
        if (!isFinite(left)) left = (this._w - d) / 2;
        const cx = left + tx + d / 2;
        const cy = isFinite(bottom) && cs.bottom !== 'auto' ? this._h - bottom - hh + ty + hh / 2 : isFinite(top) ? top + ty + hh / 2 : this._h / 2;
        return { cx, cy, d };
      } catch (e) { return null; }
    }
    _pose() {
      if (!this._cam0 || this._seen || this._frozen) return;
      const t = this._tLast;
      this._frame(performance.now(), true);
      this._tLast = t;
    }
    _pad() { return this.hero ? 8 : 5; }
    // l'emprise du plat pour un écartement E (sans la chute)
    _bounds(E) {
      const fb = this.base.frame;
      let x0 = fb.x0, x1 = fb.x1, y0 = fb.y0, y1 = fb.y1 + 0.06;
      const e = this.scene.kind === 'wrap' ? clamp((E - 0.5) * 2) : E;
      this.layers.forEach((L) => { y0 = Math.min(y0, L.frame.y0 - L.lift * e * C); });
      return { x0, x1, y0, y1 };
    }
    _fitBox(b, X0, X1, Y0, Y1) {
      const k = Math.min((X1 - X0) / (b.x1 - b.x0), (Y1 - Y0) / (b.y1 - b.y0), this._kMax);
      return { k, cx: (X0 + X1) / 2 - (k * (b.x0 + b.x1)) / 2, cy: (Y0 + Y1) / 2 - (k * (b.y0 + b.y1)) / 2 };
    }
    _fit(E, lf) {
      const W = this._w, H = this._h, pad = this._pad();
      const L = (this._colL || 0) * lf, R = (this._colR || 0) * lf;
      const b = this._bounds(E);
      const box = this._fitBox(b, pad + L, W - pad - R, pad, H - pad);
      const P = this._port;
      if (!P || lf >= 1) return box;
      const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      const k = Math.min(box.k, (P.d * PORT_W) / bw), wx = k * bw, hy = k * bh;
      const mx = clamp(P.cx, pad + wx / 2, W - pad - wx / 2), my = clamp(P.cy + P.d * PORT_DY, pad + hy / 2, H - pad - hy / 2);
      const pc = { k, cx: mx - (k * (b.x0 + b.x1)) / 2, cy: my - (k * (b.y0 + b.y1)) / 2 };
      if (lf <= 0) return pc;
      return { k: pc.k + (box.k - pc.k) * lf, cx: pc.cx + (box.cx - pc.cx) * lf, cy: pc.cy + (box.cy - pc.cy) * lf };
    }
    _layout() {
      const W = this._w, H = this._h;
      if (!W || !H || !this.layers) return;
      const dpr = window.devicePixelRatio || 1;
      this._kMax = (BB.bake.TIERS[this.hero ? 2 : 1] * 1.7) / dpr;
      const plan = this.o.labels ? this._labelPlan(W, H) : null;
      this._colL = plan ? plan.colL : 0;
      this._colR = plan ? plan.colR : 0;
      this._cam0 = this._fit(0, 0);
      this._camS = null;
      this._layoutLabels(plan);
    }

    /* ---------- les étiquettes : lisibles, jamais l'une sur l'autre, jamais hors de l'hôte ---------- */
    _labelItems() {
      const seen = {};
      const items = [];
      this.layers.forEach((L) => {
        const text = labelText(this.scene, L, this.lang);
        if (!text || seen[text]) return;
        seen[text] = 1;
        items.push({ L, text });
      });
      return items;
    }
    // le point d'ancrage (écran, unités du plat) d'une couche dans la pose détaillée (E = 1)
    _anchor(L, side) {
      const aa = BB.bake.anchors(L.tex);
      if (!aa) this._anchMiss = true;
      const f = L.frame;
      const an = aa ? aa[side > 0 ? 0 : 1] : [side > 0 ? f.x1 - 0.15 : f.x0 + 0.15, 0, 0];
      const lz = L.lift;
      return { x: an[0], y: an[1] * S - (an[2] + lz) * C, lz };
    }
    _labelPlan(W, H) {
      const items = this._labelItems();
      if (!items.length) return null;
      const fam = getComputedStyle(this.svg).fontFamily || 'system-ui, sans-serif';
      const fs0 = this.hero ? (W < 420 ? 13 : 14) : 10, fsMin = this.hero ? 12 : 9;
      this._anchMiss = false;
      let best = null;
      for (let fs = fs0; fs >= fsMin - 1e-6; fs -= 0.5) {
        for (const mode of ['both', 'right']) {
          const p = this._tryPlan(mode, fs, '600 ' + fs + 'px ' + fam, items, W, H);
          if (!p) continue;
          // (à taille presque égale, on préfère les deux colonnes : le plat reste au centre du hublot)
          const bonus = p.mode === 'both' ? 1.18 : 1;
          const better = !best || (p.ok && !best.ok) || (p.ok === best.ok && (p.ok ? p.k * bonus > best.k * (best.mode === 'both' ? 1.18 : 1) : p.over < best.over));
          if (better) best = p;
        }
        if (best && best.ok) break;
      }
      return best;
    }
    _tryPlan(mode, fs, font, items, W, H) {
      const pad = this._pad(), halo = 2, gapX = 10, lh = Math.round(fs * 1.2 * 10) / 10, gapY = Math.max(3, Math.round(fs * 0.3));
      const colMax = Math.floor(W * (mode === 'both' ? 0.3 : 0.42)) - 2 * halo;
      // côté : à gauche ce qui est à gauche du plat (mode both), sinon à droite
      const rows = items.map((it) => {
        const a0 = this._anchor(it.L, 1), a1 = this._anchor(it.L, -1);
        const side = mode === 'right' ? 1 : (a0.x + a1.x) / 2 < -0.05 ? -1 : 1;
        const w = wrapText(it.text, font, colMax);
        return { it, lines: w.lines, w: w.w + 2 * halo, side, an: side > 0 ? a0 : a1 };
      });
      if (mode === 'both') {
        // équilibre : pas plus de 60 % d'un côté
        const nR = rows.filter((r) => r.side > 0).length, n = rows.length;
        if (nR > Math.ceil(n * 0.6) || nR < Math.floor(n * 0.4)) {
          rows.sort((a, b) => a.an.x - b.an.x).forEach((r, i) => {
            r.side = i < n / 2 ? -1 : 1;
            const a = this._anchor(r.it.L, r.side);
            r.an = a;
          });
        }
      }
      let colL = 0, colR = 0;
      rows.forEach((r) => { if (r.side > 0) colR = Math.max(colR, r.w + gapX); else colL = Math.max(colL, r.w + gapX); });
      const b = this._bounds(1);
      const cam = this._fitBox(b, pad + colL, W - pad - colR, pad, H - pad);
      if (cam.k < 8) return null;
      rows.forEach((r) => {
        r.ax = cam.cx + cam.k * r.an.x;
        r.ay = cam.cy + cam.k * r.an.y;
        r.h = lh * r.lines.length;
        r.x = r.side > 0 ? cam.cx + cam.k * b.x1 + gapX : cam.cx + cam.k * b.x0 - gapX;
        r.y = r.ay;
      });
      let over = 0;
      [-1, 1].forEach((side) => {
        const col = rows.filter((r) => r.side === side).sort((a, b2) => a.y - b2.y);
        for (let k = 0; k < col.length; k++) {
          const prev = col[k - 1];
          col[k].ty = Math.max(col[k].y - col[k].h / 2, prev ? prev.ty + prev.h + gapY : pad);
        }
        for (let k = col.length - 1; k >= 0; k--) {
          const next = col[k + 1];
          col[k].ty = Math.min(col[k].ty, (next ? next.ty - gapY : H - pad) - col[k].h);
        }
        if (col.length && col[0].ty < pad) over += pad - col[0].ty;
        col.forEach((r) => {
          if (side > 0 && r.x + r.w > W - pad + 0.5) over += r.x + r.w - (W - pad);
          if (side < 0 && r.x - r.w < pad - 0.5) over += pad - (r.x - r.w);
        });
      });
      return { ok: over < 0.5, over, k: cam.k, cam, mode, fs, lh, rows, colL, colR };
    }
    _layoutLabels(plan) {
      const g = this._labG;
      while (g.firstChild) g.removeChild(g.firstChild);
      this._labels = [];
      this._plan = plan;
      if (!plan) return;
      plan.rows.forEach((r) => {
        const grp = BB.svg('g', { opacity: 0 }, g);
        const ly = r.ty + plan.lh * 0.5 * r.lines.length;
        const hl = BB.svg('line', { class: 'bb-lh', x2: r2(r.x - r.side * 5), y2: r2(ly) }, grp);
        const li = BB.svg('line', { class: 'bb-li', x2: r2(r.x - r.side * 5), y2: r2(ly) }, grp);
        const t = BB.svg('text', { x: r2(r.x), y: r2(r.ty + plan.fs * 0.9), 'font-size': plan.fs, 'text-anchor': r.side > 0 ? 'start' : 'end' }, grp);
        r.lines.forEach((l, k) => {
          const sp = BB.svg('tspan', { x: r2(r.x), dy: k ? r2(plan.lh) : 0 }, t);
          sp.textContent = l;
        });
        const dot = BB.svg('circle', { r: this.hero ? 3.2 : 2.2 }, grp);
        this._labels.push({ r, grp, hl, li, dot });
      });
    }

    /* ---------- l'animation ---------- */
    _setNear(v) { this._near = v; if (v) this._loadTextures(); }
    _setSeen(v) {
      this._seen = v;
      if (v) { this._loadTextures(); this._kick(true); }
      else if (this._once && this._started && !this._frozen && this._texReady()) this._freeze();
    }
    _kick(force) {
      if (this._frozen) return;
      if (force) this._dirty = true;
      if (this._seen || typeof IntersectionObserver === 'undefined') wake(this);
    }
    _phase(tc) {
      const segs = this._segs, P = this._T.P;
      let u = ((tc % P) + P) % P;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (u < s[1]) {
          if (s[0] === 'comp') return { k: 'comp', u, E: s[2] };
          if (s[0] === 'hold') return { k: 'hold', u, E: s[2] };
          if (s[0] === 'go') return { k: 'go', u, E: s[2] + (s[3] - s[2]) * inOut(u / s[1]), dir: s[3] > s[2] ? 1 : -1 };
          return { k: 'off', u, E: s[2] };
        }
        u -= s[1];
      }
      return { k: 'hold', u: 0, E: segs[0][2] };
    }
    _waitTex(u) {
      if (!this._ok(this.base.tex)) return true;
      for (let i = 0; i < this.layers.length; i++) { const L = this.layers[i]; if (L.t0 <= u + 0.04 && !this._ok(L.tex)) return true; }
      if (this._tSlice != null && u > this._tSlice - 0.1 && this.layers.some((L) => L.spec.sliced && !this._ok(L.spec.sliced))) return true;
      return false;
    }

    _frame(now, force) {
      if (!this._alive || this._frozen) return false;
      if (!force && !this._seen && typeof IntersectionObserver !== 'undefined') return false;
      const t = now / 1000;
      const dt = this._tLast ? Math.min(0.05, Math.max(0, t - this._tLast)) : 1 / 60;
      this._tLast = t;
      const sc = this.scene, n = this.layers.length;
      const endT = this._T.end;
      if (this._once && !force && this._texReady() && (BB.reduced || (this._auto && this._clock >= endT + 0.2))) {
        this._freeze();
        return false;
      }
      let ph = null;
      if (this._auto) {
        const u = ((this._clock % this._T.P) + this._T.P) % this._T.P;
        const inComp = u < this._T.comp;
        if (this._frozen2) { /* image figée (tests) */ } else if (this._delay > 0) this._delay -= dt;
        else if (inComp && this._waitTex(u) && this._wait < 6) this._wait += dt;
        else if (!inComp && sc.kind === 'wrap' && !this._texReady() && this._wait < 8) this._wait += dt;
        else { this._clock += dt; this._started = true; }
        if (this._once && this._clock > endT + 0.3) this._clock = endT + 0.3;
        ph = this._phase(this._clock);
        this._E = ph.E;
      } else {
        const k = this._drag ? 26 : 7.5;
        this._E += (this._target - this._E) * (1 - Math.exp(-dt * k));
        if (Math.abs(this._target - this._E) < 5e-4) this._E = this._target;
        if (this._wantAuto && !this._drag && this._resumeAt && t > this._resumeAt) { this._resumeAt = 0; this.play(); }
      }
      let busy = this._auto || this._E !== this._target || this._dirty;
      const E = this._E;
      // l'assiette (ou l'ardoise) : là tout de suite, en fondu
      const bOk = this._ok(this.base.tex);
      let baseA = bOk ? 1 : 0;
      if (ph && ph.k === 'comp') baseA = bOk ? smooth(0, 0.25, ph.u) : 0;
      attr(this.base.img, 'opacity', r2(baseA));
      // les ingrédients : arrivée (chute), éclaté, envol
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        let c = 1, d = 0;
        if (ph && ph.k === 'comp') c = clamp((ph.u - L.t0) / L.dur);
        if (ph && ph.k === 'off') d = clamp((ph.u - (n - 1 - i) * 0.05) / 0.6);
        if (L.c < 1 && c >= 1) L.imp = t;
        L.c = c; L.d = d;
        const w = n > 1 ? (n - 1 - i) / (n - 1) : 0;
        const e = sc.kind === 'wrap' ? clamp((E - 0.5) * 2 * 1.45 - 0.45 * w) : clamp(E * 1.45 - 0.45 * w);
        const fi = inOut(e);
        L.f = fi;
        let dz = DROP * (1 - c * c) + 1.4 * d * d;
        let sq = 0;
        if (L.imp) { const u = t - L.imp; if (u < 0.6) sq = Math.exp(-u * 8) * Math.sin(u * 26); else L.imp = 0; }
        if (L.imp) busy = true;
        const lz = L.lift * fi + (fi > 0.001 && !BB.reduced ? 0.012 * fi * Math.sin(t * 1.1 + i * 1.7) : 0);
        if (fi > 0.001 && !BB.reduced) busy = true;
        L.lz = lz; L.dz = dz;
        const al = this._ok(L.tex) ? smooth(0, 0.12, c) * (1 - smooth(0.45, 0.95, d)) : 0;
        L.al = al;
        const ty = -(lz + dz) * C;
        // petit tassement à l'atterrissage (autour du bas de la couche)
        const py = L.frame.y1 - 0.02, sx = 1 + 0.02 * sq, sy = 1 - 0.04 * sq;
        attr(L.g, 'transform', 'translate(' + r3(0) + ' ' + r3(ty + py * (1 - sy)) + ') scale(' + r3(sx) + ' ' + r3(sy) + ')');
        attr(L.g, 'opacity', r2(al));
        attr(L.img, 'opacity', 1);
        if (L.sliced) {
          // le couteau : la version tranchée se découvre, du bout vers le milieu
          let sl = this._slice;
          if (ph && ph.k === 'comp') sl = clamp((ph.u - this._tSlice) / 0.9);
          else if (ph) sl = 1;
          const okS = this._ok(L.spec.sliced);
          const xa = BAV.x + BAV.L * 1.08 * Math.cos(BAV.rot) + 0.05, xb = BAV.x + BAV.L * (BAV.cut - 0.06) * Math.cos(BAV.rot);
          const xs = xa + (xb - xa) * outCubic(sl);
          attr(this._sliceClip, 'x', r3(okS ? xs : 5));
          attr(L.sliced, 'opacity', okS ? 1 : 0);
          const kn = sl > 0 && sl < 1 ? Math.sin(Math.PI * sl) : 0;
          attr(this._knife, 'opacity', r2(kn * al * 0.9));
          if (kn > 0) {
            const y0 = BAV.y - 0.3, y1 = BAV.y + 0.28;
            attr(this._knife, 'x1', r3(xs + 0.03)); attr(this._knife, 'y1', r3(y0 * S - (0.16 + lz + dz) * C));
            attr(this._knife, 'x2', r3(xs - 0.03)); attr(this._knife, 'y2', r3(y1 * S - (0.05 + lz + dz) * C));
            attr(this._knife, 'stroke-width', 0.012);
            busy = true;
          }
        }
      }
      if (sc.kind === 'wrap') busy = this._wrapFrame(ph, E, t) || busy;
      // ombre au sol, sous le plat
      const fb = this.base.frame, gx = (fb.x0 + fb.x1) / 2;
      attr(this._ground, 'cx', r3(gx + 0.06));
      attr(this._ground, 'cy', r3(0.04));
      attr(this._ground, 'rx', r3((fb.x1 - fb.x0) * 0.56));
      attr(this._ground, 'ry', r3((fb.x1 - fb.x0) * 0.56 * S * (sc.base === 'ardoise' ? 0.8 : 1.05)));
      attr(this._ground, 'opacity', r2(baseA * 0.9));
      // caméra
      if (this._cam0) {
        const lf = sc.kind === 'wrap' ? smooth(0.6, 0.95, E) : smooth(0.2, 0.85, E);
        const tg = this._fit(E, lf);
        let cm = this._camS;
        if (!cm) cm = this._camS = { k: tg.k, cx: tg.cx, cy: tg.cy };
        const q = 1 - Math.exp(-dt * 12);
        cm.k += (tg.k - cm.k) * q; cm.cx += (tg.cx - cm.cx) * q; cm.cy += (tg.cy - cm.cy) * q;
        if (Math.abs(tg.k - cm.k) > 0.01 || Math.abs(tg.cx - cm.cx) > 0.05 || Math.abs(tg.cy - cm.cy) > 0.05) busy = true;
        attr(this._cam, 'transform', 'translate(' + r2(cm.cx) + ' ' + r2(cm.cy) + ') scale(' + r3(cm.k) + ')');
        this._k = cm.k; this._cx = cm.cx; this._cy = cm.cy;
        this._drawLabels(E);
      }
      this._dirty = false;
      return busy || (this._once && !force);
    }

    /* le wrap : la galette se roule (le rouleau grossit en avançant), puis on coupe et les deux moitiés s'écartent */
    _wrapFrame(ph, E, t) {
      const p = clamp((0.5 - E) / 0.28), q = clamp((0.22 - E) / 0.22);
      const pe = inOut(p);
      const off = ph && ph.k === 'off' ? clamp(ph.u / 0.7) : 0;
      // la ligne du rouleau : de l'avant de la galette vers l'arrière
      const yFront = TOR.y + TOR.R + 0.02, yEnd = WR.y + WR.R * 0.6;
      const yl = yFront + (yEnd - yFront) * pe;
      const rr = WR.R * (0.28 + 0.72 * pe);
      // la partie encore à plat : ce qui est derrière la ligne
      const clipB = p > 0.001 ? yl * S - (WR.top + 0.03) * C : 3;
      attr(this._rollClip, 'height', r3(clipB + 3));
      attr(this._flat, 'opacity', r2(p >= 0.999 ? 0 : 1));
      // le rouleau
      const R = this.roll, okR = this._ok(R.tex);
      const yMax = Math.max(yl, TOR.y);
      const chord = 2 * Math.sqrt(Math.max(0, TOR.R * TOR.R - (yMax - TOR.y) * (yMax - TOR.y)));
      const sxr = clamp(chord / (2 * WR.L), 0.3, 1), syr = rr / WR.R;
      const ya = yl - rr * 0.7; // l'axe du rouleau, juste derrière la ligne
      const rA = okR ? smooth(0, 0.05, p) * (1 - smooth(0.3, 0.62, q)) * (1 - off) : 0;
      const pvY = WR.y * S - WR.top * C; // pivot : le bas du rouleau, sur l'ardoise
      const tyR = (ya - WR.y) * S;
      attr(R.g, 'transform', 'translate(0 ' + r3(tyR + pvY * (1 - syr)) + ') scale(' + r3(sxr) + ' ' + r3(syr) + ')');
      attr(R.g, 'opacity', r2(rA));
      attr(R.img, 'opacity', 1);
      // les deux moitiés : elles partent du rouleau et glissent à leur place
      const hq = outCubic(clamp((q - 0.3) / 0.7));
      const hA = (this._ok(this.halfA.tex) && this._ok(this.halfB.tex) ? smooth(0.3, 0.55, q) : 0) * (1 - off);
      [[this.halfA, HALF_Y.a, 0.05], [this.halfB, HALF_Y.b, -0.05]].forEach(([Hh, y0, sx0]) => {
        const dy = (WR.y - y0) * (1 - hq), dx = sx0 * (1 - hq);
        const lift = off * off * 1.2;
        attr(Hh.g, 'transform', 'translate(' + r3(dx) + ' ' + r3(dy * S - lift * C) + ')');
        attr(Hh.g, 'opacity', r2(hA));
        attr(Hh.img, 'opacity', 1);
      });
      // l'éclair du couteau, en biais sur le rouleau
      const kn = q > 0.05 && q < 0.4 ? Math.sin((Math.PI * (q - 0.05)) / 0.35) : 0;
      attr(this._knife, 'opacity', r2(kn * 0.9));
      if (kn > 0) {
        attr(this._knife, 'x1', r3(0.1)); attr(this._knife, 'y1', r3((WR.y - 0.26) * S - (WR.top + 2.2 * WR.R) * C));
        attr(this._knife, 'x2', r3(-0.08)); attr(this._knife, 'y2', r3((WR.y + 0.26) * S - WR.top * C));
        attr(this._knife, 'stroke-width', 0.014);
      }
      // la galette et sa garniture s'effacent aussi à l'envol
      if (off > 0) attr(this._flat, 'opacity', r2(1 - off));
      return p > 0 && p < 1 || q > 0 && q < 1 || off > 0;
    }

    // étiquettes : dans la pose détaillée ; le trait suit la couche
    _drawLabels(E) {
      const labs = this._labels;
      const a = smooth(0.8, 0.98, E);
      for (let j = 0; j < labs.length; j++) {
        const lb = labs[j], L = lb.r.it.L;
        const aj = a * (L.al > 0.5 ? 1 : 0);
        attr(lb.grp, 'opacity', r2(aj));
        if (aj <= 0) continue;
        const an = lb.r.an;
        const px = r2(this._cx + this._k * an.x), py = r2(this._cy + this._k * (an.y + (an.lz - L.lz - L.dz) * C));
        attr(lb.hl, 'x1', px); attr(lb.hl, 'y1', py);
        attr(lb.li, 'x1', px); attr(lb.li, 'y1', py);
        attr(lb.dot, 'cx', px); attr(lb.dot, 'cy', py);
      }
    }

    /* ---------- l'image figée (cartes) ---------- */
    _stillKey() {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      return ['plat', this.scene.id, this._w, this._h, dpr].join('|');
    }
    _showCached() {
      if (!this._w || !this._h) return false;
      const url = STILLS.get(this._stillKey());
      if (!url) return false;
      this._showStill(url, false);
      return true;
    }
    _freeze() {
      if (this._frozen || this._freezing || !this._w) return;
      this._freezing = true;
      const key = this._stillKey();
      const done = (url) => {
        this._freezing = false;
        if (!this._alive || !url) return;
        STILLS.set(key, url);
        this._showStill(url, true);
      };
      const cv = this._paintStill();
      if (!cv) { this._freezing = false; return; }
      try { cv.toBlob((b) => done(b ? URL.createObjectURL(b) : cv.toDataURL('image/png')), 'image/png'); } catch (e) { done(cv.toDataURL('image/png')); }
    }
    _showStill(url, fade) {
      const img = document.createElement('img');
      img.className = 'bb-still';
      img.decoding = 'async';
      img.draggable = false;
      img.src = url;
      this._img = img;
      this._frozen = true;
      unobserve(this);
      if (this._ro) { this._ro.disconnect(); this._ro = null; }
      const svg = this.svg;
      this._aria();
      if (svg) {
        if (svg.style.aspectRatio) { img.style.height = 'auto'; img.style.aspectRatio = svg.style.aspectRatio; }
        if (fade) {
          img.style.cssText += ';position:absolute;left:0;top:0;opacity:0;transition:opacity .35s ease';
          svg.parentNode.insertBefore(img, svg.nextSibling);
          const show = () => {
            img.style.opacity = '1';
            setTimeout(() => { img.style.position = ''; img.style.left = ''; img.style.top = ''; img.style.transition = ''; svg.remove(); }, 380);
          };
          if (img.decode) img.decode().then(show, show); else img.onload = show;
        } else svg.parentNode.replaceChild(img, svg);
      } else this.host.appendChild(img);
      this.svg = null;
      this._labels = [];
    }
    // le plat servi, en pixels : ombre au sol, le plat, puis les ingrédients (ou les deux moitiés du wrap)
    _paintStill() {
      const W = this._w, H = this._h, dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const cam = this._cam0;
      if (!cam) return null;
      const cv = document.createElement('canvas');
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.cx, dpr * cam.cy);
      const fb = this.base.frame, gw = (fb.x1 - fb.x0) * 0.56;
      ctx.save();
      ctx.translate((fb.x0 + fb.x1) / 2 + 0.06, 0.04);
      ctx.scale(1, S * (this.scene.base === 'ardoise' ? 0.8 : 1.05));
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, gw);
      [[0, 0.5], [0.5, 0.34], [0.78, 0.12], [1, 0]].forEach(([o, a]) => gr.addColorStop(o, 'rgba(20,12,8,' + a * 0.9 + ')'));
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, gw, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      const draw = (tex, dx, dy) => {
        const t = this._tex[tex];
        if (!t) return;
        const fr = t.t.frame;
        ctx.drawImage(t.im, fr.x0 + dx, fr.y0 + dy, fr.x1 - fr.x0, fr.y1 - fr.y0);
      };
      draw(this.base.tex, 0, 0);
      if (this.scene.kind === 'wrap') {
        draw(this.halfB.tex, 0, 0);
        draw(this.halfA.tex, 0, 0);
      } else {
        this.layers.forEach((L) => draw(L.spec.sliced || L.tex, 0, 0));
      }
      return cv;
    }

    /* ---------- au doigt : glisser verticalement détaille / resserre ---------- */
    _bindPointer() {
      const hit = document.createElement('div');
      hit.className = 'bb-hit';
      hit.setAttribute('aria-hidden', 'true');
      this.host.appendChild(hit);
      this._hit = hit;
      this._placeHit();
      hit.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || this._frozen) return;
        try { hit.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
        this.layers.forEach((L) => { L.c = 1; L.d = 0; });
        this._slice = 1;
        this._drag = { y: e.clientY, e0: this._E, id: e.pointerId };
        this._auto = false;
        this._target = this._E;
        this._kick(true);
      });
      hit.addEventListener('pointermove', (e) => {
        const d = this._drag;
        if (!d || e.pointerId !== d.id) return;
        const span = Math.max(160, this._h * 0.55);
        this._target = clamp(d.e0 + (d.y - e.clientY) / span);
        this._kick();
      });
      const end = (e) => {
        const d = this._drag;
        if (!d || e.pointerId !== d.id) return;
        this._drag = null;
        if (this._wantAuto) this._resumeAt = performance.now() / 1000 + 6;
        this._kick();
      };
      hit.addEventListener('pointerup', end);
      hit.addEventListener('pointercancel', end);
    }
    _placeHit() {
      if (!this._hit) return;
      const W = this._w || this.host.clientWidth;
      const k = this._cam0 ? this._cam0.k : W / 3;
      const half = Math.min(W / 2, k * 1.1);
      this._hit.style.left = Math.max(0, W / 2 - half) + 'px';
      this._hit.style.width = Math.min(W, half * 2) + 'px';
    }
  }

  BB.Plat = Plat;
})();
