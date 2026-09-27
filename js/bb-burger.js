/* ==========================================================================
   Bougnat Burger — les burgers « éclatés » (SVG pseudo-3D animé)
   Chaque burger est empilé couche par couche avec, à la lettre, les ingrédients
   de la carte (bb-data.js : BB.BURGER_LIST, les mots de BB.ING). Chaque couche
   est une texture réaliste cuisinée par bb-bake.js (vue plongeante ~25°,
   lumière de studio cuite dedans), posée dans le SVG.
   Le cycle, au rythme calme :
     1. composition : les couches tombent une à une et s'empilent ; le fromage
        arrive en tranches et fond sur le steak ; la sauce, glissée sous le pain
        du haut, s'étale et coule sur la garniture ;
     2. l'éclaté : les couches s'écartent (légers basculements, flottement),
        les étiquettes apparaissent (traits de rappel, FR/EN) ;
     3. la recomposition : tout retombe en place, le fromage refond ;
     4. l'envol : les couches repartent vers le haut… et on recompose.
   En mode « once » (les cartes de la grille), le burger se compose une fois
   quand il entre à l'écran, puis se fige en image (canvas → <img>) : le SVG
   vivant est démonté, plus rien ne tourne (une carte qui sort de l'écran en
   pleine composition se fige aussitôt).
   Devant un hublot (le ::before rond de l'hôte, s'il y en a un), le burger
   assemblé se cadre dessus : ~1,1 × son diamètre, centré.

   const b = new BB.Burger(host, 'ti-bougnat' | BB.BURGERS[…], {   // lang : toute langue (BB.trLang)
     size: 'card' | 'hero',   // carte (~160 px, allégée) ou grand format
     autoplay: true | 'once' | false, // boucle ; composition unique puis image figée ; immobile
     labels: true,            // étiquettes FR/EN (défaut : grand format seulement)
     lang: 'fr' | 'en',
     interactive: true,       // glisser verticalement écarte / rapproche (défaut : grand format)
     patty: 'steak' | 'galette',
     shadows: true, float: true }); // ombres portées fines, flottement (défaut : grand format)
   b.explode = 0..1 ; b.play() ; b.stop() ; b.compose() ; b.setRecipe(r) ; b.setLang('en') ; b.destroy()
   Les temps forts (pour le son) : option onEvent, ou b.onEvent = (type, info) => …, appelé à l'instant
   même, en lecture réelle seulement (jamais en _seek ni en pose de test, jamais en mouvement réduit) ;
   info.hero dit si c'est le grand format.
     'compose'   la composition commence                     { }
     'couche'    une couche se pose sur la pile              { id, kind, index, force (0..1), again }
                 kind : 'pain-bas' | 'pain-haut' | 'steak' | 'galette' | 'fromage' | 'salade' | 'tomate' |
                        'oignon' | 'jambon' | 'autre' ; again : true quand elle retombe après l'éclaté
     'fond'      un fromage se met à fondre sur le steak     { id, index }
     'sauce'     la sauce s'étale et coule                    { id, index }
     'eclate'    l'éclaté commence                            { }
     'etiquette' une étiquette apparaît                       { i, text }
     'recompose' les couches reviennent                      { }
     'envol'     les couches s'envolent                       { }
     'fige'      une carte se fige en image                  { }
   BB.BURGERS : les recettes (clés 'ti-mefia-te', 'mefia-te' (double), …, 'petiot') ;
   BB.INGREDIENTS : libellés FR/EN ; BB.withPatty(r, 'galette').
   Étiquettes : crème cernée de sombre, lisibles sur tout fond ; variables CSS
   --bb-lab-ink, --bb-lab-halo, --bb-lab-dot, --bb-lab-ring.
   Script classique (pas de module) ; charger bb-core.js, bb-data.js puis bb-bake.js avant.
   ========================================================================== */
(function () {
  'use strict';

  const BB = window.BB;
  const PHI = (25 * Math.PI) / 180;
  const S = Math.sin(PHI), C = Math.cos(PHI);
  const SHADOW = '#140C08'; // ombres portées
  const XLINK = 'http://www.w3.org/1999/xlink';
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const outCubic = (t) => 1 - Math.pow(1 - t, 3);
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r2 = (v) => Math.round(v * 100) / 100;
  // n'écrit un attribut que s'il change : une image immobile ne coûte alors plus rien à repeindre
  function attr(el, k, v) {
    const o = el.__v || (el.__v = {});
    if (o[k] !== v) { o[k] = v; el.setAttribute(k, v); }
  }

  /* ======================================================================
     Les mots de la carte. La source est bb-data.js (BB.ING) ; ce repli, mot
     pour mot identique, ne sert que si bb-data.js n'est pas chargé.
     ====================================================================== */
  const WORDS = {
    pain: { fr: 'pain burger artisanal', en: 'artisan burger bun' },
    steak: { fr: 'steak haché façon bouchère VBF', en: 'butcher-style French beef patty (VBF)' },
    galette: { fr: 'galette de pommes de terre', en: 'potato rösti' },
    stn: { fr: 'Saint-Nectaire fermier AOP', en: 'farmhouse Saint-Nectaire PDO' },
    bleu: { fr: "Bleu d'Auvergne AOP", en: "Bleu d'Auvergne PDO" },
    cantal: { fr: 'Cantal jeune AOP', en: 'young Cantal PDO' },
    salers: { fr: 'Cantal Salers AOP', en: 'Salers PDO cheese' },
    aurillac: { fr: "Carré d'Aurillac", en: "Carré d'Aurillac soft cheese" },
    chevre: { fr: 'fromage de chèvre moulé à la louche', en: "ladle-moulded goat's cheese" },
    jambon: { fr: 'jambon sec', en: 'dry-cured ham' },
    chorizo: { fr: 'chorizo', en: 'chorizo' },
    poivrons: { fr: 'poivrons', en: 'roasted peppers' },
    tomates: { fr: 'tomates', en: 'tomatoes' },
    paillasson: { fr: 'pomme paillasson', en: 'crispy potato straw cake' },
    noix: { fr: 'noix', en: 'walnuts' },
    miel: { fr: 'miel', en: 'honey' },
    salade: { fr: 'salade et mesclun maison', en: 'house salad and mesclun' },
    sStn: { fr: 'sauce au Saint-Nectaire fermier AOP', en: 'farmhouse Saint-Nectaire PDO sauce' },
    sBleu: { fr: "sauce au Bleu d'Auvergne AOP", en: "Bleu d'Auvergne PDO sauce" },
    sChili: { fr: 'sauce chili', en: 'chili sauce' },
    sCiboulette: { fr: 'sauce crème ciboulette', en: 'sour cream and chive sauce' },
  };
  const words = (k) => (BB.ING && BB.ING[k]) || WORDS[k];
  // toute langue : bb-i18n.js (BB.trLang : la langue, sinon son dictionnaire, sinon l'anglais) ; à défaut, la langue ou le français
  const trL = (o, lang) => (BB.trLang ? BB.trLang(o, lang) : !o ? '' : typeof o === 'string' ? o : o[lang] || (lang !== 'fr' && o.en) || o.fr || '');
  // (les idéogrammes des étiquettes : une police de repli après celle de la page)
  const CJK = ", 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
  const DOUBLE = { fr: 'double ', en: 'double ', es: 'doble ', zh: '双层' };
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // couche dessinée → mot de la carte, et l'inverse
  const KEY = {
    'bun-top': 'pain', 'bun-bottom': 'pain', steak: 'steak', galette: 'galette',
    'st-nectaire': 'stn', bleu: 'bleu', cantal: 'cantal', salers: 'salers', aurillac: 'aurillac', chevre: 'chevre',
    jambon: 'jambon', chorizo: 'chorizo', poivrons: 'poivrons', tomato: 'tomates', paillasson: 'paillasson', noix: 'noix', miel: 'miel',
    salad: 'salade', 'sauce-sn': 'sStn', 'sauce-bleu': 'sBleu', 'sauce-chili': 'sChili', 'sauce-ciboulette': 'sCiboulette',
  };
  const LAYER = {};
  Object.keys(KEY).forEach((id) => { if (id !== 'bun-bottom' && id !== 'bun-top') LAYER[KEY[id]] = id; });

  /* ======================================================================
     La place de chaque couche dans la pile (unité = rayon du pain)
     th : épaisseur ajoutée à la pile ; top : hauteur de son dessus ; r : rayon ;
     sprite : texture de l'éclaté ; melt : texture de l'assemblé (fromage fondu,
     sauce nappée) ; melt2 : fromage posé sous un autre (juste une lèvre, pas de
     coulures : un seul rideau par pile) ; fb : couleurs de repli (dessus, tranche).
     ====================================================================== */
  const GEO = {
    'bun-top': { th: 0.6, top: 0.62, r: 1.0, dome: true, fb: ['#C98840', '#E3B877'] },
    'bun-bottom': { th: 0.22, top: 0.235, r: 0.975, label: false, fb: ['#E6C58E', '#C48A46'] },
    steak: { th: 0.245, top: 0.26, r: 0.97, patty: true, fb: ['#5E3524', '#6E4231'] },
    galette: { th: 0.235, top: 0.25, r: 0.97, patty: true, fb: ['#D79A42', '#B47530'] },
    paillasson: { th: 0.07, top: 0.1, r: 0.95, fb: ['#DDA650', '#B8782E'] },
    salad: { th: 0.055, top: 0.09, r: 1.12, fb: ['#93C25A', '#5E8F34'] },
    tomato: { th: 0.07, top: 0.1, r: 0.9, fb: ['#E0553C', '#B32A1E'] },
    'st-nectaire': { th: 0.02, top: 0.04, r: 0.97, cheese: true, melt: 'st-nectaire-melt', melt2: 'st-nectaire-melt2', fb: ['#F1E0B6', '#E4CC98'] },
    bleu: { th: 0.02, top: 0.04, r: 0.97, cheese: true, melt: 'bleu-melt', melt2: 'bleu-melt2', fb: ['#EEE8D4', '#D9D0B4'] },
    cantal: { th: 0.02, top: 0.04, r: 0.97, cheese: true, melt: 'cantal-melt', melt2: 'cantal-melt2', fb: ['#F1D38A', '#E0BD6C'] },
    salers: { th: 0.02, top: 0.04, r: 0.97, cheese: true, melt: 'salers-melt', fb: ['#E9BC5C', '#D3A246'] },
    aurillac: { th: 0.02, top: 0.04, r: 0.97, cheese: true, melt: 'aurillac-melt', fb: ['#F3E2B6', '#E6D0A0'] },
    chevre: { th: 0.045, top: 0.06, r: 0.62, cheese: true, rounds: true, melt: 'chevre-melt', fb: ['#F8F5EC', '#E8E2D2'] },
    jambon: { th: 0.05, top: 0.09, r: 1.02, fb: ['#9E2E3A', '#7C2029'] },
    chorizo: { th: 0.035, top: 0.06, r: 0.66, fb: ['#C1432A', '#8E2A1A'] },
    poivrons: { th: 0.04, top: 0.07, r: 0.75, fb: ['#D0341F', '#9E2616'] },
    noix: { th: 0.035, top: 0.07, r: 0.72, fb: ['#B98A55', '#8D633A'] },
    miel: { th: 0.008, top: 0.03, r: 0.8, fb: ['#E0A030', '#C07818'] },
    'sauce-sn': { th: 0.024, top: 0.045, r: 0.95, sauce: true, sprite: 'spread-sn', melt: 'drape-sn', fb: ['#F2DFAE', '#E8CF98'] },
    'sauce-bleu': { th: 0.024, top: 0.045, r: 0.95, sauce: true, sprite: 'spread-bleu', melt: 'drape-bleu', fb: ['#EFE8D2', '#DDD5BC'] },
    'sauce-chili': { th: 0.024, top: 0.045, r: 0.95, sauce: true, sprite: 'spread-chili', melt: 'drape-chili', fb: ['#D9481F', '#B8361A'] },
    'sauce-ciboulette': { th: 0.024, top: 0.045, r: 0.95, sauce: true, sprite: 'spread-ciboulette', melt: 'drape-ciboulette', fb: ['#F8F5EC', '#E6E1D2'] },
  };
  const ING = {};
  Object.keys(GEO).forEach((id) => {
    const w = words(KEY[id]);
    ING[id] = Object.assign({ id, fr: cap(w.fr), en: cap(w.en) }, GEO[id]);
  });
  BB.INGREDIENTS = ING;

  /* ======================================================================
     Les recettes : à la lettre de la carte (bb-data.js). L'ordre d'empilement,
     lui, n'est pas écrit sur la carte : pain du bas, salade, tomates, steak,
     fromages fondus dessus (miel sur le chèvre), jambon, chorizo, poivrons,
     pomme paillasson, noix, la sauce glissée sous le pain du haut, pain du haut.
     ====================================================================== */
  const CHEESES = ['st-nectaire', 'bleu', 'cantal', 'salers', 'aurillac', 'chevre'];
  const ABOVE = ['miel', 'jambon', 'chorizo', 'poivrons', 'paillasson', 'noix'];
  // repli, identique à bb-data.js (les ingrédients de chaque burger, dans l'ordre de la carte)
  const LIST = [
    ['mefia-te', 'Mefia Te', 18.9, 23.9, ['pain', 'steak', 'ouGalette', 'stn', 'bleu', 'cantal', 'jambon', 'tomates', 'paillasson', 'noix', 'salade', 'sStn']],
    ['bougnat', 'Bougnat', 16.9, 21.9, ['pain', 'steak', 'ouGalette', 'stn', 'jambon', 'paillasson', 'salade', 'sStn']],
    ['gourmand', 'Gourmand', 18.9, 23.9, ['pain', 'steak', 'ouGalette', 'stn', 'bleu', 'jambon', 'paillasson', 'noix', 'salade', 'sStn']],
    ['vulcano', 'Vulcano', 16.9, 21.9, ['pain', 'steak', 'ouGalette', 'cantal', 'poivrons', 'chorizo', 'paillasson', 'salade', 'sChili']],
    ['blue', 'Blue', 16.9, 21.9, ['pain', 'steak', 'ouGalette', 'bleu', 'cantal', 'paillasson', 'noix', 'salade', 'sBleu']],
    ['rillac', 'Rillac', 17.9, 22.9, ['pain', 'steak', 'ouGalette', 'aurillac', 'paillasson', 'noix', 'salade', 'sBleu']],
    ['salers', 'Salers', 20.9, 25.9, ['pain', 'steak', 'ouGalette', 'salers', 'jambon', 'paillasson', 'salade', 'sStn']],
    ['cabri', 'Cabri', 18.9, 23.9, ['pain', 'steak', 'ouGalette', 'chevre', 'jambon', 'miel', 'salade', 'sCiboulette']],
    ['vegetario', 'Vegetario', 15.9, 18.9, ['pain', 'galette', 'cantal', 'poivrons', 'tomates', 'salade', 'sCiboulette']],
    ['mefiano', 'Mefiano', 21.9, 26.9, ['pain', 'steak', 'ouGalette', 'stn', 'bleu', 'cantal', 'chevre', 'jambon', 'chorizo', 'tomates', 'paillasson', 'poivrons', 'noix', 'salade', 'sStn']],
  ];

  function stackOf(ids, patty, double) {
    const has = (x) => ids.includes(x);
    const cheeses = ids.filter((x) => CHEESES.includes(x)); // dans l'ordre de la carte
    const L = ['bun-bottom'];
    if (has('salad')) L.push('salad');
    if (has('tomato')) L.push('tomato');
    if (!double) L.push(patty, ...cheeses);
    else if (cheeses.length < 2) L.push(patty, patty, ...cheeses); // un seul fromage : il fond sur le steak du haut
    else {
      // plusieurs : répartis sur les deux steaks (chacun une fois : rien d'ajouté)
      const h = Math.ceil(cheeses.length / 2);
      L.push(patty, ...cheeses.slice(0, h), patty, ...cheeses.slice(h));
    }
    ABOVE.forEach((k) => { if (has(k)) L.push(k); });
    const sauce = ids.find((k) => /^sauce-/.test(k));
    if (sauce) L.push(sauce);
    L.push('bun-top');
    return L;
  }

  // une recette dessinée à partir des ingrédients de la carte
  function recipeFrom(id, name, price, double, ings, extra) {
    const onlyGalette = ings.includes('galette') && !ings.includes('steak');
    const patty = onlyGalette ? 'galette' : 'steak';
    const ids = ings.map((k) => (k === 'pain' ? 'bun-top' : LAYER[k])).filter(Boolean);
    return Object.assign({
      id, name, price, double, patty, veggie: patty === 'galette', galetteOption: !onlyGalette,
      sauce: ids.find((k) => /^sauce-/.test(k)) || null,
      layers: stackOf(ids, patty, double),
      ingredients: ids, // l'ordre de la carte
    }, extra || {});
  }

  const BURGERS = {};
  const list = BB.BURGER_LIST ? BB.BURGER_LIST.map((b) => [b.id, b.name.fr, b.price, b.double, b.ings]) : LIST;
  list.forEach(([key, name, p1, p2, ings]) => {
    BURGERS['ti-' + key] = recipeFrom('ti-' + key, "Ti' " + name, p1, false, ings);
    BURGERS[key] = recipeFrom(key, name, p2, true, ings);
  });
  // Le Petiot (menu enfant) : sa carte a ses propres mots (« steak haché VBF », « salade et mesclun »)
  const petiotItem = BB.MENU_OTHER && BB.MENU_OTHER.find((it) => it.id === 'petiot');
  BURGERS.petiot = recipeFrom('petiot', petiotItem ? petiotItem.name.fr : 'Le Petiot', petiotItem ? petiotItem.price : 13.9, false,
    ['pain', 'steak', 'ouGalette', 'cantal', 'tomates', 'salade', 'sStn'], {
      kids: true,
      words: {
        pain: { fr: 'pain burger artisanal', en: 'artisan bun' },
        steak: { fr: 'steak haché VBF', en: 'French beef patty' },
        salade: { fr: 'salade et mesclun', en: 'salad and mesclun' },
      },
    });
  BB.BURGERS = BURGERS;

  /* la même recette avec une autre galette (steak ↔ galette de pommes de terre) */
  BB.withPatty = function (recipe, patty) {
    const r = typeof recipe === 'string' ? BURGERS[recipe] : recipe;
    // une recette sans choix (le Vegetario : galette seulement) reste telle quelle
    if (!r || !patty || r.patty === patty || r.galetteOption === false) return r;
    const sw = (a) => a.map((i) => (i === 'steak' || i === 'galette' ? patty : i));
    return Object.assign({}, r, { patty, veggie: patty === 'galette', layers: sw(r.layers), ingredients: sw(r.ingredients) });
  };

  // le libellé d'une couche dans une recette, avec les mots de la carte
  function labelOf(L, recipe, lang) {
    const key = KEY[L.id];
    const w = (recipe.words && recipe.words[key]) || words(key);
    let t = w ? trL(w, lang) : L.id;
    if (L.g.patty && recipe.double) t = (DOUBLE[lang] || 'double ') + t; // « double steak haché façon bouchère VBF »
    return cap(t);
  }

  /* ======================================================================
     Réglages de l'animation (secondes, unités du burger)
     ====================================================================== */
  const T = {
    step: 0.3, fall: 0.62, settle: 0.8, // composition : une couche toutes les 0,3 s
    hold0: 1.8, up: 2.1, hold1: 3.8, down: 1.7, hold2: 2.2, // assemblé, éclaté, recomposé
    offStep: 0.07, off: 0.6, empty: 0.35, // envol, couche par couche, puis un temps à vide
  };
  const STAGGER = 0.55; // décalage entre couches dans l'éclaté (fraction de la transition)
  const LIFT = 0.14; // le pain du bas décolle un peu en éclaté
  const DROP = 1.7; // hauteur d'où tombent les couches
  const PORT_W = 1.1, PORT_DY = 0.05; // devant un hublot : burger assemblé ≈ 1,1 × son diamètre, un peu sous son centre
  // pour le son : la nature d'une couche qui se pose, et la force de l'impact (l'épaisseur fait le poids)
  const KIND = { 'bun-bottom': 'pain-bas', 'bun-top': 'pain-haut', steak: 'steak', galette: 'galette', salad: 'salade', tomato: 'tomate', jambon: 'jambon', oignon: 'oignon' };
  const kindOf = (L) => KIND[L.id] || (L.cheese ? 'fromage' : 'autre');
  const forceOf = (L) => r2(clamp(0.25 + 2.5 * L.th, 0.2, 1));

  /* ---------- une seule boucle d'animation pour tous les burgers ---------- */
  const ticking = new Set();
  let raf = 0;
  function wake(b) {
    ticking.add(b);
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function loop(now) {
    raf = 0;
    ticking.forEach((b) => { if (!b._frame(now)) ticking.delete(b); });
    if (ticking.size) raf = requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ticking.forEach((b) => { b._tLast = 0; });
  });

  /* ---------- visibilité : textures quand on approche, animation quand on voit ---------- */
  let ioNear = null, ioSeen = null;
  function observe(b) {
    if (typeof IntersectionObserver === 'undefined') { b._setNear(true); b._setSeen(true); return; }
    if (!ioNear) {
      ioNear = new IntersectionObserver((es) => es.forEach((e) => { const x = e.target.__bb; if (x) x._setNear(e.isIntersecting); }), { rootMargin: '400px 0px' });
      ioSeen = new IntersectionObserver((es) => es.forEach((e) => { const x = e.target.__bb; if (x) x._setSeen(e.isIntersecting); }), { rootMargin: '0px' });
    }
    b.host.__bb = b;
    ioNear.observe(b.host);
    ioSeen.observe(b.host);
  }
  function unobserve(b) {
    if (ioNear) { ioNear.unobserve(b.host); ioSeen.unobserve(b.host); }
  }

  /* ---------- styles (injectés une fois) ---------- */
  let cssDone = false;
  function injectCSS() {
    if (cssDone) return;
    cssDone = true;
    const st = document.createElement('style');
    const halo = 'var(--bb-lab-halo,rgba(26,19,15,.85))', ink = 'var(--bb-lab-ink,#F5EAD4)';
    st.textContent =
      '.bb-burger{display:block;width:100%;height:100%;overflow:visible;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}' +
      '.bb-burger .bb-fb{transition:opacity .35s ease}' +
      // étiquettes : crème cernée de sombre, lisibles sur le ciel comme sur le charbon ou la crème
      '.bb-burger .bb-lab text{font-family:inherit;font-weight:600;fill:' + ink + ';stroke:' + halo + ';stroke-width:3.5px;stroke-linejoin:round;paint-order:stroke fill}' +
      '.bb-burger .bb-lab .bb-lh{stroke:' + halo + ';stroke-width:3.2px;stroke-linecap:round;fill:none}' +
      '.bb-burger .bb-lab .bb-li{stroke:' + ink + ';stroke-width:1.1px;stroke-linecap:round;fill:none}' +
      '.bb-burger .bb-lab circle{fill:var(--bb-lab-dot,#C8E3A0);stroke:var(--bb-lab-ring,#1A130F);stroke-width:1.6px}' +
      '.bb-still{display:block;width:100%;height:100%;object-fit:contain;-webkit-user-select:none;user-select:none;pointer-events:none}' +
      '.bb-hit{position:absolute;top:0;bottom:0;touch-action:none;cursor:grab;z-index:1}' +
      '.bb-hit:active{cursor:grabbing}';
    document.head.appendChild(st);
  }

  // mesure de texte (étiquettes)
  let mctx = null;
  function measure(txt, font) {
    if (!mctx) mctx = document.createElement('canvas').getContext('2d');
    mctx.font = font;
    return mctx.measureText(txt).width;
  }
  // coupe un texte en lignes de largeur ≤ max (au plus 3), en équilibrant les lignes
  function wrap(txt, font, max) {
    const full = measure(txt, font);
    if (full <= max) return { lines: [txt], w: full };
    const words = txt.split(' ');
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
      const w = Math.max(measure(a, font), measure(b, font));
      if (!best || w < best.w) best = { lines: [a, b], w };
    }
    if (best && best.w <= max) return best;
    for (let i = 1; i < words.length - 1; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const ls = [words.slice(0, i).join(' '), words.slice(i, j).join(' '), words.slice(j).join(' ')];
        const w = Math.max.apply(null, ls.map((l) => measure(l, font)));
        if (!best || best.lines.length < 3 ? w <= max || !best || w < best.w : w < best.w) best = { lines: ls, w };
      }
    }
    return best || { lines: [txt], w: full };
  }

  // chemin d'une « galette » vue de 3/4 : tranche + ellipse du dessus (formes de repli)
  function puck(r, top) {
    const ry = r * S, yt = -top * C;
    return 'M' + r2(-r) + ' ' + r2(yt) + 'A' + r2(r) + ' ' + r2(ry) + ' 0 0 1 ' + r2(r) + ' ' + r2(yt) +
      'L' + r2(r) + ' 0A' + r2(r) + ' ' + r2(ry) + ' 0 0 1 ' + r2(-r) + ' 0Z';
  }

  // les images figées des cartes (une par recette, taille et finesse) : un burger déjà composé
  // réapparaît tout de suite (changement de langue, retour sur la carte), sans rien recalculer
  const STILLS = new Map();

  /* ======================================================================
     Le burger
     ====================================================================== */
  class Burger {
    constructor(host, recipe, opts) {
      opts = opts || {};
      const hero = opts.size === 'hero';
      this.host = host;
      this.o = Object.assign({ size: 'card', autoplay: true, labels: hero, lang: 'fr', interactive: hero, patty: null, shadows: hero, float: hero }, opts);
      this.hero = hero;
      this.lang = String(this.o.lang || 'fr');
      this.uid = BB.uid('bbb');
      this._once = this.o.autoplay === 'once';
      this._E = 0; this._target = 0; this._dir = 0;
      this._auto = false; this._wantAuto = false; this._resumeAt = 0;
      this._clock = 0; this._wait = 0; this._delay = 0;
      this._near = false; this._seen = false;
      this._sway = 0; this._swayV = 0;
      this._tLast = 0; this._w = 0; this._h = 0;
      this._alive = true;
      this.onEvent = typeof this.o.onEvent === 'function' ? this.o.onEvent : null;
      this._ev = { live: false, k: -1, open: false, peak: 0 };
      // en lecture automatique, le burger commence vide : il va se composer sous nos yeux
      this._fresh = !!(this.o.autoplay && !BB.reduced);
      injectCSS();
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      this.svg = BB.svg('svg', { class: 'bb-burger bb-burger--' + (hero ? 'hero' : 'card'), role: 'img', focusable: 'false' });
      host.appendChild(this.svg);
      if (host.clientHeight < 8) { this.svg.style.height = 'auto'; this.svg.style.aspectRatio = hero ? '3 / 4' : '4 / 5'; }
      this.setRecipe(recipe);
      if (typeof ResizeObserver !== 'undefined') {
        this._ro = new ResizeObserver(() => this._resize());
        this._ro.observe(this.svg);
      }
      this._resize();
      // déjà composé ailleurs (même recette, même taille) : l'image figée, tout de suite
      if (this._once && this._showCached()) return;
      if (this.o.interactive) this._bindPointer();
      observe(this);
      if (this.o.autoplay && !BB.reduced) this.play();
    }

    /* ---------- API ---------- */
    get explode() { return this._E; }
    set explode(v) {
      if (this._frozen) return;
      this._auto = false;
      this._wantAuto = false;
      this._frozen2 = false;
      this._target = clamp(+v || 0);
      if (BB.reduced) this._E = this._target;
      this._kick(true);
    }
    // cycle automatique : composition → assemblé → éclaté → recomposé → envol → …
    play() {
      if (this._frozen) return;
      this._wantAuto = true;
      this._frozen2 = false;
      if (BB.reduced) return;
      const P = this._T;
      this._auto = true;
      this._wait = 0;
      if (this._fresh) { this._clock = 0; this._delay = this.hero ? 0 : this._once ? this._cascade() : Math.random() * 1.6; } // on part du vide (cartes un peu décalées)
      else if (this._E > 0.5) this._clock = P.comp + T.hold0 + T.up + 0.2; // déjà éclaté : on reste éclaté un moment
      else this._clock = P.comp + T.hold0 * 0.55; // assemblé : l'éclaté arrive bientôt
      this._fresh = false;
      this._kick(true);
    }
    // décalage d'une carte selon sa place à l'écran : la cascade part d'en haut à gauche
    _cascade() {
      const b = this.host.getBoundingClientRect(), vh = window.innerHeight || 800, vw = window.innerWidth || 400;
      return 0.35 * clamp(b.top / vh) + (b.left + b.width / 2 > vw / 2 ? 0.14 : 0);
    }
    stop() {
      this._wantAuto = false;
      this._auto = false;
      this._target = this._E;
      this._kick(true);
    }
    // tests : fige le cycle automatique à l'instant tc (s depuis le début de la composition)
    _seek(tc) {
      if (this._frozen) return;
      this._auto = true;
      this._wantAuto = false;
      this._frozen2 = true;
      this._clock = tc;
      this._kick(true);
    }
    // recommence la composition (couche par couche)
    compose() {
      if (BB.reduced || this._frozen) return;
      this._frozen2 = false;
      this._wantAuto = true;
      this._auto = true;
      this._clock = 0;
      this._wait = 0;
      this.layers.forEach((L) => { L.c = 0; L.m = 0; });
      this._kick(true);
    }
    setLang(lang) {
      this.lang = String(lang || 'fr');
      this._aria();
      if (this._frozen) return;
      this._layout();
      this._kick(true);
    }
    setRecipe(recipe) {
      let r = typeof recipe === 'string' ? BURGERS[recipe] : recipe;
      if (!r || !r.layers) r = BURGERS['ti-bougnat'];
      if (this.o.patty) r = BB.withPatty(r, this.o.patty);
      if (this._frozen) { this.recipe = r; this._aria(); return; }
      const had = !!this.recipe;
      this.recipe = r;
      // nouvelle recette en lecture automatique : elle se compose sous nos yeux
      if (had && this._auto) { this._clock = 0; this._wait = 0; }
      this._build();
      this._aria();
      this._layout();
      if (this._near) this._loadTextures();
      this._pose();
      this._kick(true);
    }
    destroy() {
      this._alive = false;
      ticking.delete(this);
      unobserve(this);
      if (this._ro) this._ro.disconnect();
      if (this._hit) this._hit.remove();
      if (this.svg) this.svg.remove();
      if (this._img) this._img.remove();
      if (this.host.__bb === this) this.host.__bb = null;
    }

    // un temps fort : seulement en lecture réelle (ni pose, ni _seek, ni mouvement réduit)
    _emit(type, info) {
      const fn = this.onEvent;
      if (typeof fn !== 'function' || BB.reduced || !this._ev.live) return;
      const o = info || {};
      o.hero = this.hero;
      try { fn.call(this, type, o); } catch (e) { /* un écouteur fautif n'arrête pas l'animation */ }
    }

    /* ---------- construction ---------- */
    _build() {
      const svg = this.svg, uid = this.uid;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      const defs = BB.svg('defs', null, svg);
      const grad = (id, stops) => {
        const g = BB.svg('radialGradient', { id }, defs);
        stops.forEach(([o, a]) => BB.svg('stop', { offset: o, 'stop-color': SHADOW, 'stop-opacity': a }, g));
      };
      grad(uid + '-gr', [[0, 0.55], [0.45, 0.4], [0.75, 0.16], [1, 0]]);
      grad(uid + '-sh', [[0, 0.95], [0.6, 0.85], [0.84, 0.42], [1, 0]]);
      this._cam = BB.svg('g', { class: 'bb-cam' }, svg);
      this._ground = BB.svg('ellipse', { fill: 'url(#' + uid + '-gr)', opacity: 0 }, this._cam);
      const ids = this.recipe.layers;
      const seen = {};
      const empty = this._fresh || (this._auto && this._clock < 0.01);
      this.layers = ids.map((id, i) => {
        const g = ING[id];
        seen[id] = (seen[id] || 0) + 1;
        return {
          id, i, g, th: g.th, top: g.top, r: g.r, sauce: !!g.sauce, cheese: !!g.cheese, dome: !!g.dome,
          sprite: g.sprite || id, melt: g.melt || null,
          e: 0, f: 0, m: empty ? 0 : 1, c: empty ? 0 : 1, d: 0, al: -1, imp: 0, tx: 0, ty: 0, rot: 0, sx: 1, sy: 1, z: 0,
          ph: [(i * 2.39) % 6.28, (i * 1.71 + 1) % 6.28, (i * 0.93 + 2) % 6.28],
          label: g.label !== false, count: 0, im: {},
        };
      });
      // plusieurs fromages empilés sur un même steak : un seul rideau (le plus haut qui en a un),
      // les autres ne montrent qu'une lèvre (pas de « dents » de coulures alternées)
      for (let i = 0; i < this.layers.length; i++) {
        if (!this.layers[i].cheese) continue;
        let j = i;
        while (j + 1 < this.layers.length && this.layers[j + 1].cheese) j++;
        let top = -1;
        for (let k = j; k >= i; k--) if (!this.layers[k].g.rounds) { top = k; break; }
        for (let k = i; k <= j; k++) {
          const L = this.layers[k];
          if (k !== top && !L.g.rounds && L.g.melt2) L.melt = L.g.melt2;
        }
        i = j;
      }
      // un ingrédient en double (le steak d'un double) : une seule étiquette, sur le plus haut
      this.layers.forEach((L) => {
        L.count = seen[L.id];
        if (L.count > 1) L.label = L.label && this.layers.filter((M) => M.id === L.id).pop() === L;
      });
      this.layers.forEach((L, i) => {
        const g = BB.svg('g', { class: 'bb-l', opacity: empty ? 0 : 1 }, this._cam);
        L.el = { g };
        L.el.fb = this._fallback(L, g);
        L.el.img = this._image(g, L.sprite);
        if (L.melt) L.el.melt = this._image(g, L.melt);
        // le fondu se révèle de haut en bas : le dessus d'abord, puis les coulures s'allongent
        if (L.melt) {
          const fr = BB.bake.frame(L.melt);
          const cp = BB.svg('clipPath', { id: uid + '-v' + i }, defs);
          L.el.rv = BB.svg('rect', { x: -2, y: r3(fr.y0 - 0.02), width: 4, height: r3(fr.y1 - fr.y0 + 0.04) }, cp);
          L.rvH = fr.y1 - fr.y0 + 0.04;
          L.rvTop = Math.min(L.rvH, L.r * S + 0.05 - (fr.y0 - 0.02));
          L.el.melt.setAttribute('clip-path', 'url(#' + uid + '-v' + i + ')');
        }
        const U = this.layers[i + 1];
        if (this.o.shadows && U && !L.dome) {
          // l'ombre de la couche du dessus ne tombe que sur la matière : masque = la texture elle-même
          const mk = BB.svg('mask', { id: uid + '-m' + i, maskContentUnits: 'userSpaceOnUse', style: 'mask-type:alpha' }, defs);
          L.el.mk = this._image(mk, L.sprite);
          L.el.mk.setAttribute('opacity', 1);
          if (L.melt) L.el.mk2 = this._image(mk, L.melt); // la bascule tranche → fondu, aussi dans le masque
          L.el.sh = BB.svg('ellipse', { fill: 'url(#' + uid + '-sh)', mask: 'url(#' + uid + '-m' + i + ')', opacity: 0 }, g);
        }
      });
      this._labG = BB.svg('g', { class: 'bb-lab' }, svg);
      this._labels = [];
      const nn = Math.max(1, ids.length - 3);
      this._G = this.hero ? clamp(3.6 / nn, 0.3, 0.55) : clamp(2.4 / nn, 0.2, 0.4);
      this._tex = {};
      this._texAsked = null;
      // chronologie de la composition : une couche toutes les 0,3 s (un peu plus pour le fromage et la sauce)
      let t = 0, end = 0;
      this.layers.forEach((L) => {
        L.t0 = t;
        L.dur = T.fall;
        t += T.step + (L.cheese || L.sauce ? 0.12 : 0);
        end = Math.max(end, L.t0 + L.dur);
      });
      const n = this.layers.length;
      const P = { comp: end + T.settle, off: T.offStep * (n - 1) + T.off + T.empty };
      P.P = P.comp + T.hold0 + T.up + T.hold1 + T.down + T.hold2 + P.off;
      this._T = P;
    }

    _image(g, sid) {
      const fr = BB.bake.frame(sid);
      return BB.svg('image', { x: r3(fr.x0), y: r3(fr.y0), width: r3(fr.x1 - fr.x0), height: r3(fr.y1 - fr.y0), preserveAspectRatio: 'none', opacity: 0 }, g);
    }

    _fallback(L, g) {
      const fb = BB.svg('g', { class: 'bb-fb' }, g);
      const [top, side] = L.g.fb;
      if (L.dome) {
        const h = L.top * C;
        BB.svg('path', { d: 'M-1 0A1 ' + r2(S) + ' 0 0 0 1 0L1 -0.07C1 ' + r2(-h * 0.7) + ' 0.6 ' + r2(-h) + ' 0 ' + r2(-h) + 'C-0.6 ' + r2(-h) + ' -1 ' + r2(-h * 0.7) + ' -1 -0.07Z', fill: top }, fb);
        return fb;
      }
      const r = L.r * (L.id === 'salad' ? 0.98 : 1);
      BB.svg('path', { d: puck(r, Math.max(0.02, L.top * 0.8)), fill: side }, fb);
      BB.svg('ellipse', { cx: 0, cy: r3(-Math.max(0.02, L.top * 0.8) * C), rx: r, ry: r3(r * S), fill: top }, fb);
      return fb;
    }

    _aria() {
      const r = this.recipe;
      const list = r.ingredients.map((id) => labelOf({ id, g: ING[id] }, r, this.lang)).join(', ');
      const txt = r.name + (this.lang === 'fr' ? ' : ' : this.lang === 'en' ? ' burger: ' : ': ') + list;
      if (this.svg) this.svg.setAttribute('aria-label', txt);
      if (this._img) this._img.alt = txt;
    }

    /* ---------- textures ---------- */
    _texPlan() {
      const tier = this.hero ? 2 : 1;
      let base = this.hero ? 10 : this._seen ? 7 : 3;
      if (!this.hero) {
        const b = this.host.getBoundingClientRect(), vh = window.innerHeight || 800, vw = window.innerWidth || 400;
        base += 2 * clamp(1 - b.top / vh) + 0.4 * clamp(1 - b.left / vw);
      }
      // dans l'ordre où les couches tombent : le pain du bas d'abord, le pain du haut en dernier
      const n = this.layers.length, jobs = [];
      this.layers.forEach((L, i) => {
        const w = 1 - (0.6 * i) / Math.max(1, n - 1);
        jobs.push([L, 'img', L.sprite, w]);
        if (L.melt) jobs.push([L, 'melt', L.melt, w - 0.02]);
      });
      return { tier, base, jobs };
    }
    _loadTextures() {
      const { tier, base, jobs } = this._texPlan();
      const again = this._texAsked === this.recipe;
      this._texAsked = this.recipe;
      jobs.forEach(([L, key, sid, w]) => {
        const cur = BB.bake.peek(sid, tier);
        if (cur && !again) this._setTex(L, key, cur);
        if (cur && cur.tier >= tier) return;
        if (tier > 1 && !cur) BB.bake.get(sid, 1, base + 2 + w).then((t) => this._setTex(L, key, t), () => {});
        // (redemandé à l'entrée dans l'écran : la priorité monte, les cartes visibles passent devant)
        BB.bake.get(sid, tier, base + w).then((t) => this._setTex(L, key, t), () => {});
      });
    }

    _setTex(L, key, t) {
      if (!this._alive || this._frozen || !this.layers.includes(L)) return;
      const k = L.i + key;
      const cur = this._tex[k];
      if (cur && cur.tier >= t.tier) return;
      this._tex[k] = t;
      const els = [L.el[key]];
      if (key === 'img' && L.el.mk) els.push(L.el.mk);
      if (key === 'melt' && L.el.mk2) els.push(L.el.mk2);
      const im = new Image();
      const apply = () => {
        if (this._tex[k] !== t || !this.layers.includes(L) || this._frozen) return;
        els.forEach((el) => {
          el.setAttribute('href', t.url);
          el.setAttributeNS(XLINK, 'xlink:href', t.url);
          el.setAttribute('x', r3(t.frame.x0));
          el.setAttribute('y', r3(t.frame.y0));
          el.setAttribute('width', r3(t.frame.x1 - t.frame.x0));
          el.setAttribute('height', r3(t.frame.y1 - t.frame.y0));
        });
        L.im[key] = { im, frame: t.frame };
        L[key + 'Ok'] = true;
        // les points d'ancrage arrivent avec les textures : on replace les étiquettes (une fois par image)
        if (this._anchMiss && this.o.labels && !this._relab) {
          this._relab = requestAnimationFrame(() => { this._relab = 0; if (this._anchMiss) this._layout(); });
        }
        this._kick(true);
      };
      // on attend le décodage : pas d'éclair vide en changeant de finesse
      im.src = t.url;
      if (im.decode) im.decode().then(apply, apply);
      else im.onload = apply;
    }

    _texReady() {
      return this.layers.every((L) => L.imgOk && (!L.melt || L.meltOk));
    }

    /* ---------- mise en page : caméra (assemblé / éclaté) et étiquettes ---------- */
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
    /* le hublot peint derrière le burger (le ::before rond de l'hôte, s'il y en a un) : le burger
       assemblé s'y cadre, un peu plus large que lui et centré dessus ; sinon il remplit l'hôte */
    _porthole() {
      try {
        const cs = getComputedStyle(this.host, '::before');
        if (!cs || cs.content === 'none' || cs.content === 'normal' || cs.display === 'none') return null;
        const d = parseFloat(cs.width), hh = parseFloat(cs.height) || d;
        if (!(d > 24)) return null; // (le ::before sert de repère de cadrage, visible ou non, rond ou non)
        let left = parseFloat(cs.left), bottom = parseFloat(cs.bottom), top = parseFloat(cs.top);
        const m = /matrix\(([^)]+)\)/.exec(cs.transform || '');
        const tx = m ? parseFloat(m[1].split(',')[4]) || 0 : 0, ty = m ? parseFloat(m[1].split(',')[5]) || 0 : 0;
        if (!isFinite(left)) left = (this._w - d) / 2;
        const cx = left + tx + d / 2;
        const cy = isFinite(bottom) && cs.bottom !== 'auto' ? this._h - bottom - hh + ty + hh / 2 : isFinite(top) ? top + ty + hh / 2 : this._h / 2;
        return { cx, cy, d };
      } catch (e) { return null; }
    }
    // pose l'image courante sans attendre d'être à l'écran (et sans faire avancer le temps)
    _pose() {
      if (!this._cam0 || this._seen || this._frozen) return;
      const t = this._tLast;
      this._frame(performance.now(), true);
      this._tLast = t;
    }

    // positions de la pile pour des écartements f (0 = assemblé, 1 = éclaté)
    _zs(f, out) {
      const n = this.layers.length, G = this._G;
      out = out || new Array(n);
      let z = 0;
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        if (i === 0) { out[0] = LIFT * f[0]; z = out[0] + L.th; continue; }
        out[i] = z + G * f[i] * (0.8 + 0.9 * Math.min(1, L.top / 0.6)); // plus d'air sous une couche haute
        z = out[i] + L.th;
      }
      return out;
    }

    // l'emprise de la pile (sans la chute ni le flottement)
    _bounds(zs) {
      const n = this.layers.length;
      let x0 = -1.02, x1 = 1.02, y0 = 1e9, y1 = -1e9;
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        const rr = L.id === 'salad' ? 1.16 : L.r;
        if (-rr < x0) x0 = -rr;
        if (rr > x1) x1 = rr;
        const a = -(zs[i] + L.top) * C - L.r * S, b = -zs[i] * C + rr * S + (L.id === 'salad' ? 0.1 : L.melt ? 0.14 : 0.03);
        if (a < y0) y0 = a;
        if (b > y1) y1 = b;
      }
      y1 = Math.max(y1, 1.12 * S + 0.04);
      return { x0, x1, y0, y1 };
    }
    // cadre la pile dans la boîte [X0, X1] × [Y0, Y1] (pixels)
    _fitBox(zs, X0, X1, Y0, Y1) {
      const b = this._bounds(zs);
      const k = Math.min((X1 - X0) / (b.x1 - b.x0), (Y1 - Y0) / (b.y1 - b.y0), this._kMax);
      return { k, cx: (X0 + X1) / 2 - (k * (b.x0 + b.x1)) / 2, cy: (Y0 + Y1) / 2 - (k * (b.y0 + b.y1)) / 2 };
    }
    // cadrage de la pile telle qu'elle est ; lf : place faite aux étiquettes (0..1)
    _fit(zs, lf) {
      const W = this._w, H = this._h, pad = this._pad();
      const L = (this._colL || 0) * lf, R = (this._colR || 0) * lf;
      const box = this._fitBox(zs, pad + L, W - pad - R, pad, H - pad);
      const P = this._port;
      if (!P || lf >= 1) return box;
      // devant le hublot : pas plus large que lui (× PORT_W), centré dessus autant que la place le permet
      const b = this._bounds(zs), bw = b.x1 - b.x0, bh = b.y1 - b.y0;
      const k = Math.min(box.k, (P.d * PORT_W) / bw), wx = k * bw, hy = k * bh;
      const mx = clamp(P.cx, pad + wx / 2, W - pad - wx / 2), my = clamp(P.cy + P.d * PORT_DY, pad + hy / 2, H - pad - hy / 2);
      const pc = { k, cx: mx - (k * (b.x0 + b.x1)) / 2, cy: my - (k * (b.y0 + b.y1)) / 2 };
      if (lf <= 0) return pc;
      return { k: pc.k + (box.k - pc.k) * lf, cx: pc.cx + (box.cx - pc.cx) * lf, cy: pc.cy + (box.cy - pc.cy) * lf };
    }
    _pad() { return this.hero ? 8 : 6; }

    _layout() {
      const W = this._w, H = this._h;
      if (!W || !H || !this.layers) return;
      const n = this.layers.length;
      const dpr = window.devicePixelRatio || 1;
      this._kMax = (BB.bake.TIERS[this.hero ? 2 : 1] * 1.7) / dpr; // au-delà, la texture deviendrait floue
      const plan = this.o.labels ? this._labelPlan(W, H) : null;
      this._colL = plan ? plan.colL : 0;
      this._colR = plan ? plan.colR : 0;
      this._cam0 = this._fit(this._zs(new Array(n).fill(0)), 0);
      this._cam1 = plan ? plan.cam : this._fit(this._zs(new Array(n).fill(1)), 1);
      this._camS = null;
      this._layoutLabels(plan);
    }

    /* Les étiquettes : lisibles, jamais l'une sur l'autre, jamais hors de l'hôte.
       On essaie une colonne à droite et deux colonnes (gauche/droite), avec la
       plus grande taille de texte possible (12 px au moins en grand format) ; on
       garde le plan qui tient et qui laisse le burger le plus grand. */
    _labelItems() {
      const items = [];
      this.layers.forEach((L) => { if (L.label) items.push({ L, text: labelOf(L, this.recipe, this.lang) }); });
      return items.reverse(); // de haut en bas
    }
    _labelPlan(W, H) {
      const items = this._labelItems();
      if (!items.length) return null;
      const n = this.layers.length;
      const zs1 = this._zs(new Array(n).fill(1));
      const fam = (getComputedStyle(this.svg).fontFamily || 'system-ui, sans-serif') + CJK;
      const fs0 = this.hero ? (W < 420 ? 13 : 14) : 10, fsMin = this.hero ? 12 : 9;
      this._anchMiss = false;
      let best = null;
      for (let fs = fs0; fs >= fsMin - 1e-6; fs -= 0.5) {
        for (const mode of ['right', 'both']) {
          const p = this._tryPlan(mode, fs, '600 ' + fs + 'px ' + fam, items, zs1, W, H);
          if (!p) continue;
          const better = !best || (p.ok && !best.ok) || (p.ok === best.ok && (p.ok ? p.k > best.k : p.over < best.over));
          if (better) best = p;
        }
        if (best && best.ok) break;
      }
      return best;
    }
    _tryPlan(mode, fs, font, items, zs1, W, H) {
      const pad = this._pad(), halo = 2, gapX = 12, lh = Math.round(fs * 1.2 * 10) / 10, gapY = Math.max(3, Math.round(fs * 0.3));
      const colMax = Math.floor(W * (mode === 'both' ? 0.34 : 0.46)) - 2 * halo;
      const rows = items.map((it, j) => {
        const w = wrap(it.text, font, colMax);
        return { it, lines: w.lines, w: w.w + 2 * halo, side: mode === 'right' || j % 2 === 0 ? 1 : -1 };
      });
      let colL = 0, colR = 0;
      rows.forEach((r) => { if (r.side > 0) colR = Math.max(colR, r.w + gapX); else colL = Math.max(colL, r.w + gapX); });
      const cam = this._fitBox(zs1, pad + colL, W - pad - colR, pad, H - pad);
      if (cam.k < 8) return null;
      // la position voulue : à hauteur du point d'ancrage (sur la matière de la couche)
      const rMax = Math.max.apply(null, this.layers.map((L) => (L.id === 'salad' ? 1.1 : L.r)));
      rows.forEach((r) => {
        const L = r.it.L;
        const aa = BB.bake.anchors(L.sprite);
        if (!aa) this._anchMiss = true; // en attendant la texture : le bord avant de la couche
        const an = aa ? aa[r.side > 0 ? 0 : 1] : [r.side * L.r * 0.85, L.r * 0.3, L.top * 0.8];
        r.ax = an[0];
        r.ay = an[1] * S - an[2] * C; // repère de la couche
        r.y = cam.cy + cam.k * (r.ay - zs1[L.i] * C);
        r.h = lh * r.lines.length;
        r.x = cam.cx + r.side * (cam.k * rMax + gapX);
      });
      // chaque colonne : on écarte vers le bas, puis on remonte si ça déborde
      let over = 0;
      [-1, 1].forEach((side) => {
        const col = rows.filter((r) => r.side === side).sort((a, b) => a.y - b.y);
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
      g.style.fontFamily = (getComputedStyle(this.svg).fontFamily || 'system-ui, sans-serif') + CJK;
      while (g.firstChild) g.removeChild(g.firstChild);
      this._labels = [];
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
        this._labels.push({ r, grp, hl, li, dot, a: -1 });
      });
    }

    /* ---------- l'animation ---------- */
    _setNear(v) {
      this._near = v;
      if (v) this._loadTextures();
    }
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

    // la prochaine couche à tomber n'a pas encore sa texture ?
    _waitTex(u) {
      if (u >= this._T.comp) return false;
      const ls = this.layers;
      for (let i = 0; i < ls.length; i++) if (ls[i].t0 <= u + 0.04 && !ls[i].imgOk) return true;
      return false;
    }
    // où en est le cycle automatique
    _phase(tc) {
      const P = this._T;
      let u = ((tc % P.P) + P.P) % P.P;
      if (u < P.comp) return { k: 0, u, E: 0 }; // composition
      u -= P.comp;
      if (u < T.hold0) return { k: 1, E: 0 };
      u -= T.hold0;
      if (u < T.up) return { k: 2, E: u / T.up }; // éclaté
      u -= T.up;
      if (u < T.hold1) return { k: 1, E: 1 };
      u -= T.hold1;
      if (u < T.down) return { k: 3, E: 1 - u / T.down }; // recomposition
      u -= T.down;
      if (u < T.hold2) return { k: 1, E: 0 };
      u -= T.hold2;
      return { k: 4, u, E: 0 }; // envol
    }

    /* une image de l'animation ; rend false quand il n'y a plus rien à faire (on s'endort) */
    _frame(now, force) {
      if (!this._alive || this._frozen) return false;
      if (!force && !this._seen && typeof IntersectionObserver !== 'undefined') return false;
      const t = now / 1000;
      const dt = this._tLast ? Math.min(0.05, Math.max(0, t - this._tLast)) : 1 / 60;
      this._tLast = t;
      const n = this.layers.length;
      const ev = this._ev;
      ev.live = !force && !this._frozen2 && !BB.reduced && typeof this.onEvent === 'function';
      // composition unique (cartes) : une fois posé, le burger se fige en image
      if (this._once && !force && this._texReady() && (BB.reduced || (this._auto && this._clock >= this._T.comp + 0.15))) {
        this._freeze();
        return false;
      }
      let ph = null, dir = 0;
      if (this._auto) {
        // la composition commence dès que la première couche est prête, et attend (6 s au plus en tout)
        // la texture de chaque couche avant de la faire tomber : pas de formes de repli qui tombent
        const u = ((this._clock % this._T.P) + this._T.P) % this._T.P;
        if (this._frozen2) { /* image figée (tests) */ } else if (this._delay > 0) this._delay -= dt; else if (this._waitTex(u) && this._wait < 6) this._wait += dt;
        else { this._clock += dt; this._started = true; }
        if (this._once && this._clock > this._T.comp + 0.3) this._clock = this._T.comp + 0.3; // (pas d'éclaté pour une carte)
        ph = this._phase(this._clock);
        this._E = ph.E;
        dir = ph.k === 2 ? 1 : ph.k === 3 ? -1 : 0;
        // les temps forts du cycle : le début de chaque phase (la composition : quand elle démarre vraiment)
        const k = ph.k === 0 && !this._started ? -1 : ph.k;
        if (k !== ev.k) {
          if (k === 0) this._emit('compose');
          else if (k === 2) this._emit('eclate');
          else if (k === 3) this._emit('recompose');
          else if (k === 4) this._emit('envol');
          ev.k = k;
        }
      } else {
        const k = this._drag ? 26 : 7.5;
        this._E += (this._target - this._E) * (1 - Math.exp(-dt * k));
        if (Math.abs(this._target - this._E) < 5e-4) this._E = this._target;
        if (this._wantAuto && !this._drag && this._resumeAt && t > this._resumeAt) { this._resumeAt = 0; this.play(); }
        ev.k = -1;
        if (this._drag || ev.open) {
          if (!ev.open && this._E > 0.08) { ev.open = true; ev.peak = this._E; this._emit('eclate'); }
          else if (ev.open) {
            ev.peak = Math.max(ev.peak, this._E);
            if (!ev.down && this._E < ev.peak - 0.12) { ev.down = true; this._emit('recompose'); }
            if (this._E > ev.peak - 0.02) ev.down = false;
            if (this._E < 0.02) { ev.open = false; ev.down = false; }
          }
        }
      }
      this._dir = dir;
      // balancement (au doigt)
      this._swayV += (-42 * this._sway - 6.5 * this._swayV) * dt;
      this._sway += this._swayV * dt;
      if (Math.abs(this._sway) < 1e-4 && Math.abs(this._swayV) < 1e-4) { this._sway = 0; this._swayV = 0; }

      const f = this._f || (this._f = new Array(n));
      let busy = this._auto || this._E !== this._target || this._sway !== 0 || this._dirty;
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        // arrivée (composition) et départ (envol)
        let c = 1, d = 0;
        if (ph && ph.k === 0) c = clamp((ph.u - L.t0) / L.dur);
        if (ph && ph.k === 4) d = clamp((ph.u - (n - 1 - i) * T.offStep) / T.off);
        if (L.c < 1 && c >= 1) { L.imp = t; this._emit('couche', { id: L.id, kind: kindOf(L), index: i, force: forceOf(L), again: false }); } // posé : petit tassement
        if (c < 1) L.m = 0; // le fromage arrive en tranches, la sauce en flaque : ils fondront une fois posés
        L.c = c;
        L.d = d;
        // écartement de l'éclaté, couche par couche (le haut part en premier, le bas se repose en premier)
        const w = n > 1 ? (n - 1 - i) / (n - 1) : 0;
        const e = clamp(this._E * (1 + STAGGER) - STAGGER * w);
        // en descente, les couches accélèrent et « tombent » ; sinon, douceur des deux côtés
        const fi = dir < 0 ? e * (2 - e) : inOut(e);
        if (dir < 0 && L.f > 0.004 && fi <= 0.004) { L.imp = t; this._emit('couche', { id: L.id, kind: kindOf(L), index: i, force: r2(forceOf(L) * 0.5), again: true }); }
        L.e = e;
        L.f = fi;
        f[i] = fi;
        // le fromage fond une fois reposé sur le steak ; la sauce s'étale et coule
        if (L.melt) {
          const tgt = c >= 1 && fi < 0.006 && L.meltOk ? 1 : 0;
          if (tgt && !L.melting && L.m < 0.5) { L.melting = true; this._emit(L.sauce ? 'sauce' : 'fond', { id: L.id, index: i }); }
          if (!tgt) L.melting = false;
          const rate = tgt ? 1 / 0.55 : 1 / 0.14;
          L.m += (tgt - L.m) * (1 - Math.exp(-dt * rate * 3));
          if (Math.abs(tgt - L.m) < 0.003) L.m = tgt; else busy = true;
        }
        if (L.imp) busy = true;
        if (fi > 0.001 && !BB.reduced && this.o.float) busy = true; // ça flotte
      }
      const zs = this._zs(f, this._zbuf || (this._zbuf = new Array(n)));
      const fl = BB.reduced || !this.o.float ? 0 : 1;
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        const a = L.f * fl;
        const k = n > 1 ? i / (n - 1) : 0;
        let dz = a * 0.02 * Math.sin(t * 1.05 + L.ph[0]);
        let rot = a * 1.9 * Math.sin(t * 0.8 + L.ph[1]) + this._sway * (0.25 + 0.75 * k) * 7;
        const pitch = 1 + a * 0.03 * Math.sin(t * 0.9 + L.ph[2]);
        let dx = a * 0.016 * Math.sin(t * 0.63 + L.ph[0] * 2) + this._sway * 0.03 * k;
        // chute (composition) : accélère, un peu de travers, se pose à plat ; envol : repart vers le haut
        const cc = L.c, dd = L.d;
        if (cc < 1) { dz += DROP * (1 - cc * cc); rot += (1 - cc) * 7 * Math.sin(L.ph[1] * 3 + 1.3); dx += (1 - cc) * 0.08 * Math.sin(L.ph[2] * 2); }
        if (dd > 0) { dz += 1.6 * dd * dd; rot += dd * 6 * Math.sin(L.ph[0] * 3); }
        const al = smooth(0, 0.12, cc) * (1 - smooth(0.5, 0.95, dd));
        let sq = 0;
        if (L.imp) {
          const u = t - L.imp;
          if (u < 0.7) sq = Math.exp(-u * 7) * Math.sin(u * 26); else L.imp = 0;
        }
        L.z = zs[i] + dz;
        L.tx = dx; L.ty = -L.z * C; L.rot = rot;
        L.sx = 1 + 0.028 * sq; L.sy = (1 - 0.05 * sq) * pitch;
        attr(L.el.g, 'transform', 'translate(' + r3(L.tx) + ' ' + r3(L.ty) + ') rotate(' + r2(rot) + ' 0 ' + r3(-L.top * C * 0.5) + ') scale(' + r3(L.sx) + ' ' + r3(L.sy) + ')');
        attr(L.el.g, 'opacity', r2(al));
        L.al = al;
        // images : fondu du fromage et de la sauce, repli tant que la texture cuit
        const imgOk = !!L.imgOk, meltOk = !!L.meltOk;
        if (L.melt) {
          const mv = meltOk ? L.m : 0;
          const om = r3(smooth(0, 0.35, mv)), of = imgOk ? r3(1 - smooth(0.55, 1, mv)) : 0;
          attr(L.el.melt, 'opacity', om);
          attr(L.el.rv, 'height', r3(L.rvTop + (L.rvH - L.rvTop) * outCubic(mv)));
          attr(L.el.img, 'opacity', of);
          if (L.el.mk2) { attr(L.el.mk, 'opacity', of); attr(L.el.mk2, 'opacity', om); }
          attr(L.el.fb, 'opacity', imgOk || meltOk || this._once ? 0 : 1); // (une carte « once » n'affiche jamais de forme de repli)
        } else {
          attr(L.el.img, 'opacity', imgOk ? 1 : 0);
          attr(L.el.fb, 'opacity', imgOk || this._once ? 0 : 1);
        }
      }
      // ombres portées sur la couche du dessous : nettes au contact, diffuses en l'air
      for (let i = 0; i < n - 1; i++) {
        const L = this.layers[i], U = this.layers[i + 1];
        if (!L.el.sh) continue;
        const gap = Math.max(0, U.z - (L.z + L.top));
        const rx = U.r * (1.07 + 0.55 * gap), ry = rx * S * (1 + 0.2 * gap);
        // (l'ombre s'efface quand la couche s'éloigne : en l'air, plus de masque à recalculer à chaque image)
        const op = (((U.cheese || U.sauce) && U.m > 0.5 ? 0.26 : 0.48) / (1 + 6 * gap)) * Math.max(0, U.al) * (1 - smooth(0.1, 0.22, gap));
        if (op < 0.004) { attr(L.el.sh, 'display', 'none'); continue; }
        attr(L.el.sh, 'display', 'inline');
        attr(L.el.sh, 'cx', r3(U.tx - L.tx + 0.55 * gap));
        attr(L.el.sh, 'cy', r3(-L.top * C - 0.24 * gap));
        attr(L.el.sh, 'rx', r3(rx));
        attr(L.el.sh, 'ry', r3(ry));
        attr(L.el.sh, 'opacity', r3(op));
      }
      // ombre au sol
      const L0 = this.layers[0], f0 = L0.f;
      const gr = 1.16 * (1 + 0.3 * f0);
      attr(this._ground, 'cx', r3(0.07 + 0.1 * f0));
      attr(this._ground, 'cy', 0.02);
      attr(this._ground, 'rx', r3(gr));
      attr(this._ground, 'ry', r3(gr * S * 1.05));
      attr(this._ground, 'opacity', r2((1 - 0.35 * f0) * smooth(0, 1, L0.c) * Math.max(0, L0.al)));
      // caméra : elle cadre la pile telle qu'elle est (on recule pendant l'éclaté), en douceur
      if (this._cam0) {
        const tg = this._fit(zs, smooth(0.25, 0.9, this._E));
        let cm = this._camS;
        if (!cm) cm = this._camS = { k: tg.k, cx: tg.cx, cy: tg.cy };
        const q = 1 - Math.exp(-dt * 12);
        cm.k += (tg.k - cm.k) * q; cm.cx += (tg.cx - cm.cx) * q; cm.cy += (tg.cy - cm.cy) * q;
        if (Math.abs(tg.k - cm.k) > 0.01 || Math.abs(tg.cx - cm.cx) > 0.05 || Math.abs(tg.cy - cm.cy) > 0.05) busy = true;
        attr(this._cam, 'transform', 'translate(' + r2(cm.cx) + ' ' + r2(cm.cy) + ') scale(' + r3(cm.k) + ')');
        this._k = cm.k; this._cx = cm.cx; this._cy = cm.cy;
        this._drawLabels();
      }
      this._dirty = false;
      return busy || (this._once && !force);
    }

    // étiquettes : apparaissent quand la couche est bien écartée ; le trait suit la couche qui flotte
    _drawLabels() {
      const labs = this._labels;
      for (let j = 0; j < labs.length; j++) {
        const lb = labs[j], L = lb.r.it.L;
        const a = smooth(0.8, 0.98, L.f) * smooth(0.7, 0.95, this._E);
        attr(lb.grp, 'opacity', r2(a));
        if (a > 0 && !(lb.a > 0)) this._emit('etiquette', { i: j, text: lb.r.it.text });
        lb.a = a;
        if (a <= 0) continue;
        // point d'ancrage : sur la matière de la couche, transformé comme elle
        const x = lb.r.ax * L.sx, y = lb.r.ay * L.sy;
        const oy = -L.top * C * 0.5, ang = (L.rot * Math.PI) / 180, ca = Math.cos(ang), sn = Math.sin(ang);
        const rx = x * ca - (y - oy) * sn, ry = x * sn + (y - oy) * ca + oy;
        const px = r2(this._cx + this._k * (rx + L.tx)), py = r2(this._cy + this._k * (ry + L.ty));
        attr(lb.hl, 'x1', px); attr(lb.hl, 'y1', py);
        attr(lb.li, 'x1', px); attr(lb.li, 'y1', py);
        attr(lb.dot, 'cx', px); attr(lb.dot, 'cy', py);
      }
    }

    /* ---------- l'image figée (cartes) : le burger assemblé, peint une fois dans un canvas ---------- */
    _stillKey() {
      const dpr = Math.min(2.5, window.devicePixelRatio || 1);
      return [this.recipe.id, this.recipe.patty, this._w, this._h, dpr].join('|');
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
        this._ev.live = this._seen && !this._frozen2 && typeof this.onEvent === 'function';
        this._emit('fige');
        this._ev.live = false;
        this._showStill(url, true);
      };
      const cv = this._paintStill();
      if (!cv) { this._freezing = false; return; }
      try { cv.toBlob((b) => done(b ? URL.createObjectURL(b) : cv.toDataURL('image/png')), 'image/png'); } catch (e) { done(cv.toDataURL('image/png')); }
    }
    // remplace le SVG vivant par l'image (fondu court), puis démonte tout ce qui tournait
    _showStill(url, fade) {
      const img = document.createElement('img');
      img.className = 'bb-still';
      img.decoding = 'async';
      img.draggable = false;
      img.src = url;
      this._img = img;
      this._frozen = true;
      ticking.delete(this);
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
            setTimeout(() => {
              img.style.position = ''; img.style.left = ''; img.style.top = ''; img.style.transition = '';
              svg.remove();
            }, 380);
          };
          if (img.decode) img.decode().then(show, show); else img.onload = show;
        } else {
          svg.parentNode.replaceChild(img, svg);
        }
      } else this.host.appendChild(img);
      this.svg = null;
      this.layers.forEach((L) => { L.el = null; L.im = null; });
      this._labels = [];
    }
    // le burger assemblé, en pixels, avec les ombres de contact entre couches et l'ombre au sol
    _paintStill() {
      const W = this._w, H = this._h, dpr = Math.min(2.5, window.devicePixelRatio || 1);
      const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
      const n = this.layers.length, cam = this._cam0;
      if (!cam) return null;
      const zs = this._zs(new Array(n).fill(0));
      const cv = document.createElement('canvas');
      cv.width = pw; cv.height = ph;
      const ctx = cv.getContext('2d');
      const off = document.createElement('canvas');
      off.width = pw; off.height = ph;
      const oc = off.getContext('2d');
      const world = (c) => c.setTransform(dpr * cam.k, 0, 0, dpr * cam.k, dpr * cam.cx, dpr * cam.cy);
      const ellipse = (c, cx, cy, rx, ry, stops) => {
        c.save();
        c.translate(cx, cy);
        c.scale(1, ry / rx);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, rx);
        stops.forEach(([o, a]) => g.addColorStop(o, 'rgba(20,12,8,' + a + ')'));
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, rx, 0, Math.PI * 2);
        c.fill();
        c.restore();
      };
      world(ctx);
      ellipse(ctx, 0.07, 0.02, 1.16, 1.16 * S * 1.05, [[0, 0.55], [0.45, 0.4], [0.75, 0.16], [1, 0]]);
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        const key = L.melt && L.im.melt ? 'melt' : 'img';
        const t = L.im[key];
        if (!t) continue;
        const fr = t.frame, z = zs[i];
        oc.setTransform(1, 0, 0, 1, 0, 0);
        oc.clearRect(0, 0, pw, ph);
        world(oc);
        oc.drawImage(t.im, fr.x0, fr.y0 - z * C, fr.x1 - fr.x0, fr.y1 - fr.y0);
        // ombre de contact de la couche du dessus, seulement sur la matière de celle-ci
        const U = this.layers[i + 1];
        if (U && !L.dome) {
          oc.globalCompositeOperation = 'source-atop';
          const op = (U.cheese || U.sauce) ? 0.26 : 0.48, rx = U.r * 1.07;
          ellipse(oc, 0, -(z + L.top) * C, rx, rx * S, [[0, 0.95 * op], [0.6, 0.85 * op], [0.84, 0.42 * op], [1, 0]]);
          oc.globalCompositeOperation = 'source-over';
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(off, 0, 0);
        world(ctx);
      }
      return cv;
    }

    /* ---------- au doigt : glisser verticalement écarte / rapproche ---------- */
    _bindPointer() {
      const hit = document.createElement('div');
      hit.className = 'bb-hit';
      hit.setAttribute('aria-hidden', 'true');
      this.host.appendChild(hit);
      this._hit = hit;
      this._placeHit();
      let last = null;
      hit.addEventListener('pointerdown', (e) => {
        if (e.button > 0 || this._frozen) return;
        try { hit.setPointerCapture(e.pointerId); } catch (err) { /* rien */ }
        // on prend le burger tel qu'il est : entièrement composé
        this.layers.forEach((L) => { L.c = 1; L.d = 0; });
        this._drag = { y: e.clientY, e0: this._E, id: e.pointerId };
        last = { x: e.clientX, t: performance.now() };
        this._auto = false;
        this._target = this._E;
        this._kick(true);
      });
      hit.addEventListener('pointermove', (e) => {
        const d = this._drag;
        if (!d || e.pointerId !== d.id) return;
        const span = Math.max(160, this._h * 0.55);
        this._target = clamp(d.e0 + (d.y - e.clientY) / span);
        const now = performance.now();
        if (last) {
          const vx = (e.clientX - last.x) / Math.max(8, now - last.t);
          this._swayV += clamp(vx, -3, 3) * 0.35;
        }
        last = { x: e.clientX, t: now };
        this._kick();
      });
      const end = (e) => {
        const d = this._drag;
        if (!d || e.pointerId !== d.id) return;
        this._drag = null;
        // petit rebond au lâcher ; la lecture automatique reprend au bout de quelques secondes
        this._swayV += (Math.random() - 0.5) * 0.4;
        if (this._wantAuto) this._resumeAt = performance.now() / 1000 + 6;
        this._kick();
      };
      hit.addEventListener('pointerup', end);
      hit.addEventListener('pointercancel', end);
    }
    _placeHit() {
      if (!this._hit) return;
      // la colonne du burger seulement : les côtés laissent défiler la page
      const W = this._w || this.host.clientWidth;
      const k = this._cam0 ? this._cam0.k : W / 3;
      const half = Math.min(W / 2, k * 1.15);
      this._hit.style.left = Math.max(0, W / 2 - half) + 'px';
      this._hit.style.width = Math.min(W, half * 2) + 'px';
    }
  }

  BB.Burger = Burger;
  // les outils partagés avec les autres plats (bb-plat.js) : même horloge, mêmes observateurs, mêmes étiquettes
  Burger._kit = { wake, observe, unobserve, injectCSS, measure, wrap, attr, clamp, smooth, inOut, outCubic, r2, r3, STILLS, S, C };
})();
