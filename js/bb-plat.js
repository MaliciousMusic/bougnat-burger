/* ==========================================================================
   Bougnat Burger — les autres plats en 3D : viandes, salades, wraps, desserts, boissons
   Même cuisine que les burgers (bb-bake.js : chaque élément cuit pixel par
   pixel, lumière de studio) et même moteur (bb-burger.js : horloge commune,
   observateurs, étiquettes, calques composités, image figée des cartes).
   Présentation calquée sur celle du restaurant :
     · viandes : assiette blanche, la viande grillée (bavette tranchée au bout,
       steak haché épais au cœur saignant), frites maison et salade maison ;
     · salades : le tas de salade et mesclun dans l'assiette (l'Auvergnate sur
       l'ardoise), les garnitures qui tombent une à une, les toasts dorés dessus ;
     · wraps : la galette ouverte sur l'ardoise, la garniture posée en bande,
       roulée, coupée en biais : deux moitiés montrent les couches enroulées ;
     · desserts (vus à 32°) : la part sur l'assiette ou l'ardoise, ses décors
       qui tombent dessus ; les tranches montrent leurs couches ;
     · boissons (vues à 25°, comme les burgers) : bouteille et verres sur
       l'ardoise ; chaque verre se pose vide, puis se remplit (mousse, bulles).
   Les éléments sont ceux du texte de la carte (bb-data.js, desc), rien de plus ;
   les frites et la salade des viandes viennent de BB.SIDES. Sans description,
   quelques mots du nom seulement (les parfums des givrés, glaces et sorbets…).

   const p = new BB.Plat(host, 'allier', {
     size: 'card' | 'hero', autoplay: 'once' | true | false, labels, lang (toute langue), interactive,
     variant: 'ambree' | 'rose' | 'cola' | … (boissons : la teinte de bb-data.js, ou l'id / le nom d'une variante),
     onEvent: (type, info) => … });
   p.explode = 0..1 (0 : servi ; 1 : détaillé et étiqueté — éclaté, ou galette ouverte pour un wrap)
   p.play() ; p.stop() ; p.compose() ; p.setLang('es') ; p.setVariant(v, nom) ; p.destroy()
   BB.PLATS : les scènes, clés = ids de bb-data.js ; BB.hasPlat(id).
   Les temps forts (pour le son), en lecture réelle seulement (jamais en _seek, ni en mouvement réduit) ;
   info.hero dit si c'est le grand format :
     'compose'   la composition commence                   { }
     'pose'      un élément se pose                         { kind, id, index, force (0..1), again }
                 kind : 'assiette' | 'ardoise' | 'salade' | 'tomates' | 'fromage' | 'jambon' | 'saumon' | 'noix' |
                        'poulet' | 'poivrons' | 'croutons' | 'toast' | 'miel' | 'pignons' | 'herbes' | 'viande' |
                        'frites' | 'sauce' | 'galette' | 'gateau' | 'fruits' | 'amandes' | 'chocolat' | 'cafe' |
                        'tarte' | 'meringue' | 'ramequin' | 'coulant' | 'fruit-givre' | 'coupe' | 'boule' |
                        'verre' | 'bouteille' | 'autre'
     'coupe'     le couteau passe (bavette, wrap)          { what: 'bavette' | 'wrap' }
     'roule'     le wrap se roule                           { }
     'verse'     on remplit un verre                        { kind: 'biere' | 'vin' | 'soft' | 'spiritueux', id, index }
     'mousse'    la mousse monte (bière, soda)              { id, index }
     'bulles'    les bulles (bière, soda)                   { id, index }
     'eclate'    le détail commence (étiquettes)            { }
     'etiquette' une étiquette apparaît                     { i, text }
     'recompose' on revient au plat servi                   { }
     'envol'     tout s'envole                              { }
     'fige'      une carte se fige en image                 { }
   Script classique ; charger après bb-bake.js et bb-burger.js.
   ========================================================================== */
(function () {
  'use strict';

  const BB = window.BB;
  if (!BB || !BB.Burger || !BB.Burger._kit || !BB.bake) return;
  const K = BB.Burger._kit;
  const { wake, observe, unobserve, injectCSS, measure, wrap: wrapText, attr, clamp, smooth, inOut, outCubic, r2, r3, Stage } = K;
  const PHI_PLAT = BB.bake.PHI_PLAT || 40;
  const XLINK = 'http://www.w3.org/1999/xlink';
  const SHADOW = '#140C08';
  const DROP = 1.5; // hauteur d'où tombent les éléments
  const PORT_W = 1.08, PORT_DY = 0.02; // devant un hublot : l'assiette ≈ 1,1 × son diamètre
  // (les idéogrammes : une police de repli après la police de la page)
  const CJK = ", 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
  const trL = (o, lang) => (BB.trLang ? BB.trLang(o, lang) : !o ? '' : typeof o === 'string' ? o : o[lang] || (lang !== 'fr' && o.en) || o.fr || '');

  /* ======================================================================
     Les scènes : couches dans l'ordre où elles arrivent ; w = l'élément de
     la carte qu'elles portent (index dans le texte de la carte, ou 'frites' /
     'salade' pour les accompagnements des viandes) ; lab = plusieurs étiquettes
     sur une même couche (p : point d'ancrage donné par la cuisine) ; nw = un mot
     du nom (desserts sans description) ; k = la nature (pour le son) ;
     pour = un verre qui se remplit ; vary = la couche qui suit la variante.
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

    /* les desserts */
    'tarte-citron': { kind: 'dessert', phi: 32, base: 'ardoise-d', layers: [
      { tex: 'tarte-fond', k: 'tarte', lab: [{ w: 0, p: 0 }, { w: 1, p: 1 }] }, { tex: 'meringue', k: 'meringue', w: 2 },
    ] },
    framboisier: { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'framboisier-part', k: 'gateau', lab: [{ w: 0, p: 0 }, { w: 1, p: 1 }] }, { tex: 'framboises-dessus', k: 'fruits', w: 2 }, { tex: 'amandes-hachees', k: 'amandes', w: 3 },
    ] },
    'foret-noire': { kind: 'dessert', phi: 32, base: 'ardoise-d', layers: [
      { tex: 'foret-noire-part', k: 'gateau', lab: [{ w: 0, p: 0 }, { w: 1, p: 1 }] }, { tex: 'copeaux-foret', k: 'chocolat', w: 2 },
    ] },
    moelleux: { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'moelleux', k: 'gateau', w: 0 }, { tex: 'coulant', k: 'coulant' },
    ] },
    'nougat-glace': { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'nougat-part', k: 'gateau', lab: [{ w: 0, p: 0 }, { w: 1, p: 1 }, { w: 2, p: 2 }, { w: 3, p: 3 }, { w: 4, p: 4 }, { w: 5, p: 5 }] },
    ] },
    'tiramisu-framboise': { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'tiramisu-framboise-part', k: 'gateau' }, { tex: 'framboises-tiramisu', k: 'fruits', nw: { fr: 'framboise', en: 'raspberry', es: 'frambuesa', zh: '覆盆子' } },
    ] },
    'tiramisu-cafe': { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'tiramisu-cafe-part', k: 'gateau' }, { tex: 'grains-cafe', k: 'cafe', nw: { fr: 'café', en: 'coffee', es: 'café', zh: '咖啡' } },
    ] },
    'mousse-chocolat': { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'ramequin-mousse', k: 'ramequin', nw: { fr: 'chocolat', en: 'chocolate', es: 'chocolate', zh: '巧克力' } }, { tex: 'copeaux-mousse', k: 'chocolat' },
    ] },
    givres: { kind: 'dessert', phi: 32, base: 'ardoise-d', layers: [
      { tex: 'citron-givre', k: 'fruit-givre', nw: { fr: 'citron', en: 'lemon', es: 'limón', zh: '柠檬' } },
      { tex: 'orange-givree', k: 'fruit-givre', nw: { fr: 'orange', en: 'orange', es: 'naranja', zh: '橙' } },
      { tex: 'coco-givre', k: 'fruit-givre', nw: { fr: 'coco', en: 'coconut', es: 'coco', zh: '椰' } },
    ] },
    glaces: { kind: 'dessert', phi: 32, base: 'assiette-d', layers: [
      { tex: 'coupe-glace', k: 'coupe' }, { tex: 'boules-glace', k: 'boule', nw: { fr: 'glaces', en: 'ice creams', es: 'helados', zh: '冰淇淋' } },
      { tex: 'boule-sorbet', k: 'boule', nw: { fr: 'sorbets', en: 'sorbets', es: 'sorbetes', zh: '雪葩' } },
    ] },
    plateau: { kind: 'dessert', phi: 32, base: 'ardoise-d', layers: [
      { tex: 'plateau-tarte', k: 'tarte' }, { tex: 'plateau-foret', k: 'gateau' }, { tex: 'plateau-mousse', k: 'ramequin' },
      { tex: 'plateau-sorbet', k: 'boule' }, { tex: 'plateau-framboises', k: 'fruits' },
    ] },

    /* les boissons : de l'arrière vers l'avant */
    softs: { kind: 'boisson', phi: 25, base: 'ardoise-b', variant: { fam: 'soft', def: 'cola' }, layers: [
      { tex: 'bouteille-eau', k: 'bouteille', w: 3 }, { tex: 'bouteille-jus', k: 'bouteille', w: 2 },
      { tex: 'verre-soft-{v}', k: 'verre', pour: 'soft', vary: true, w: 0 }, { tex: 'verre-the-glace', k: 'verre', pour: 'soft', w: 1 },
    ] },
    sagnes: { kind: 'boisson', phi: 25, base: 'ardoise-b', variant: { fam: 'beer', def: 'blonde' }, layers: [
      { tex: 'bouteille-sagnes', k: 'bouteille' }, { tex: 'verre-sagnes-noire', k: 'verre', pour: 'biere' },
      { tex: 'verre-sagnes-ambree', k: 'verre', pour: 'biere' }, { tex: 'verre-sagnes-v-{v}', k: 'verre', pour: 'biere', vary: true },
    ] },
    desprat: { kind: 'boisson', phi: 25, base: 'ardoise-b', variant: { fam: 'beer', def: 'blonde' }, layers: [
      { tex: 'bouteille-desprat', k: 'bouteille' }, { tex: 'verre-desprat-{v}', k: 'verre', pour: 'biere', vary: true },
    ] },
    vins: { kind: 'boisson', phi: 25, base: 'ardoise-b', variant: { fam: 'wine', def: 'rouge' }, layers: [
      { tex: 'bouteille-vin-{v}', k: 'bouteille', vary: true }, { tex: 'verre-vin-{v}', under: 'verre-vin-pied', k: 'verre', pour: 'vin', vary: true },
    ] },
    aperitifs: { kind: 'boisson', phi: 25, base: 'ardoise-b', layers: [
      { tex: 'verre-rhum', k: 'verre', pour: 'spiritueux', w: 0 }, { tex: 'verre-whisky', k: 'verre', pour: 'spiritueux', w: 2 },
      { tex: 'verre-pastis', k: 'verre', pour: 'spiritueux', w: 4 }, { tex: 'verre-vodka', k: 'verre', pour: 'spiritueux', w: 1 },
      { tex: 'verre-tequila', k: 'verre', pour: 'spiritueux', w: 3 },
    ] },
  };
  Object.keys(SCENES).forEach((id) => { SCENES[id].id = id; });
  BB.PLATS = SCENES;
  BB.hasPlat = (id) => !!SCENES[id];

  /* ---------- les variantes des boissons : la teinte (bb-data.js) ; à défaut, l'id ou le nom ---------- */
  const FAMS = { beer: ['blonde', 'ambree', 'blanche', 'ipa', 'noire'], wine: ['rouge', 'rose', 'blanc'], soft: ['cola', 'the', 'orange', 'eau', 'jus'] };
  function variantKey(fam, v) {
    if (!fam || !FAMS[fam]) return null;
    const s = String(v == null ? '' : v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (FAMS[fam].includes(s)) return s;
    if (fam === 'beer') {
      if (/noire|stout|black|brune|dark|porter|lave/.test(s)) return 'noire';
      if (/ambr|amber|rousse|antidote|noix/.test(s)) return 'ambree';
      if (/blanche|white|wit|weiss|druide|flagrant/.test(s)) return 'blanche';
      if (/ipa|shiva/.test(s)) return 'ipa';
      return 'blonde';
    }
    if (fam === 'wine') { if (/ros/.test(s)) return 'rose'; if (/blanc|white|blanco|bianco/.test(s)) return 'blanc'; return 'rouge'; }
    if (/cola|coca/.test(s)) return 'cola';
    if (/the|tea|fuze/.test(s)) return 'the';
    if (/orang/.test(s)) return 'orange';
    if (/pago|jus|juice|zumo|succo/.test(s)) return 'jus';
    if (/eau|water|perrier|agua|acqua/.test(s)) return 'eau';
    return 'cola';
  }
  const texOf = (spec, key) => spec.tex.replace('{v}', key || '');

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
  // la nature d'un élément qui se pose (pour le son) et la force de l'impact
  const KINDS = [
    [/^assiette/, 'assiette', 0.9], [/^ardoise/, 'ardoise', 0.9], [/mesclun|salade|ruban-salade/, 'salade', 0.3], [/tomate/, 'tomates', 0.4],
    [/cantal|bleu|chevre/, 'fromage', 0.35], [/jambon/, 'jambon', 0.35], [/saumon/, 'saumon', 0.35], [/noix/, 'noix', 0.45], [/poulet/, 'poulet', 0.45],
    [/poivron/, 'poivrons', 0.35], [/crouton/, 'croutons', 0.5], [/toasts/, 'toast', 0.6], [/miel/, 'miel', 0.2], [/pignon/, 'pignons', 0.4],
    [/herbes/, 'herbes', 0.15], [/steak|bavette/, 'viande', 0.8], [/frites/, 'frites', 0.55], [/sauce/, 'sauce', 0.3], [/tortilla/, 'galette', 0.4],
  ];
  const FORCE = { gateau: 0.6, fruits: 0.3, amandes: 0.2, chocolat: 0.25, cafe: 0.25, tarte: 0.6, meringue: 0.4, ramequin: 0.75, coulant: 0.2,
    'fruit-givre': 0.55, coupe: 0.7, boule: 0.45, verre: 0.5, bouteille: 0.85 };
  function kindOf(spec, tex) {
    if (spec && spec.k) return [spec.k, FORCE[spec.k] || 0.5];
    for (let i = 0; i < KINDS.length; i++) if (KINDS[i][0].test(tex)) return [KINDS[i][1], KINDS[i][2]];
    return ['autre', 0.4];
  }
  // un verre qui se remplit : durée, mousse, bulles
  const POUR = { biere: { d: 1.25, foam: 0.74, fizz: true }, vin: { d: 1.0 }, soft: { d: 1.0, fizz: true }, spiritueux: { d: 0.6 } };

  /* ---------- les mots de la carte (toute langue : BB.trLang) ---------- */
  const menuItem = (id) => (BB.menuItem && BB.menuItem(id)) || (BB.MENU_OTHER || []).find((it) => it.id === id);
  const capit = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  // la première phrase d'un texte (la liste des éléments ; « Sans cerises, sans alcool. » n'en est pas)
  const firstSentence = (d) => String(d || '').split(/\.\s+|。|\.$/)[0].replace(/[.。]\s*$/, '');
  // une liste : les virgules (aussi 、 et ，), et le dernier « et / and / y / e / 和 / 与 / 或 / ou / or / o »
  const splitList = (s) => s.split(/\s*[,、，;；]\s*|\s+(?:et|and|y|e|ou|or|o|und)\s+|\s*[和与及或]\s*/).map((x) => x.trim()).filter(Boolean);
  function sidesParts(lang) {
    const s = trL(BB.SIDES || { fr: 'Servi avec frites faites maison et salade maison.', en: 'Served with homemade fries and house salad.' }, lang);
    const m = /(?:avec|with|con|mit|配|配有|附)\s*(.+)$/.exec(s.replace(/[.。]\s*$/, ''));
    const parts = m ? splitList(m[1]) : [];
    if (parts.length >= 2) return [parts[0], parts[1]];
    return lang === 'fr' ? ['frites faites maison', 'salade maison'] : ['homemade fries', 'house salad'];
  }
  function labelText(scene, L, lang, w) {
    if (w === 'frites') return capit(sidesParts(lang)[0]);
    if (w === 'salade') return capit(sidesParts(lang)[1]);
    const it = menuItem(scene.id);
    const d = it && it.desc ? trL(it.desc, lang) : '';
    // la viande : la première phrase (« Bavette de bœuf charolais bio, 300 g ») ; sinon la liste, élément par élément
    if (scene.kind === 'viande') return capit(firstSentence(d));
    if (scene.kind === 'salade' || scene.kind === 'wrap') {
      // (« Salade et mesclun maison » est un seul élément : on ne coupe qu'aux virgules)
      const parts = firstSentence(d).split(/\s*[,、，]\s*/);
      return capit(parts[w] || '');
    }
    let parts = firstSentence(d);
    // (une boisson : « Brasserie … : blonde, ambrée » → après les deux-points)
    const colon = parts.search(/[:：]/);
    if (colon >= 0) parts = parts.slice(colon + 1);
    return capit(splitList(parts)[w] || '');
  }
  // un mot du nom (desserts sans description) : seulement s'il y figure, en français comme en anglais
  function nameWord(scene, nw, lang) {
    if (!nw) return '';
    const it = menuItem(scene.id);
    if (!it) return '';
    const has = (l) => trL(it.name, l).toLowerCase().includes(String(nw[l] || '').toLowerCase());
    if (!has('fr') || !has('en')) return '';
    const word = nw[lang] || (lang === 'fr' ? nw.fr : nw.en);
    return capit(word);
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
      this.lang = String(this.o.lang || 'fr');
      this.uid = BB.uid('bbp');
      this._once = this.o.autoplay === 'once';
      this.scene = SCENES[id] || SCENES.allier;
      const sc = this.scene;
      const it = menuItem(sc.id);
      this.recipe = { id: sc.id, name: it ? it.name : { fr: id, en: id } };
      this.onEvent = typeof this.o.onEvent === 'function' ? this.o.onEvent : null;
      this._ev = { live: false, k: '', seg: -1 };
      // la vue : 40° (plats), 32° (desserts), 25° (boissons)
      const phi = ((sc.phi || PHI_PLAT) * Math.PI) / 180;
      this._S = Math.sin(phi); this._C = Math.cos(phi);
      this._variant = sc.variant ? variantKey(sc.variant.fam, this.o.variant != null ? this.o.variant : sc.variant.def) : null;
      this._variantLabel = null;
      this._composeE = sc.kind === 'wrap' ? 1 : 0;
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
      this._stage = new Stage(host, this.svg); // les éléments, sous le SVG des étiquettes
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
    get variant() { return this._variant; }
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
      this.lang = String(lang || 'fr');
      this._aria();
      if (this._frozen) return;
      this._layout();
      this._kick(true);
    }
    /* boissons : la variante choisie dans la fiche (teinte de bb-data.js, id ou nom) ; nom : le texte de son étiquette.
       Le grand format se recompose avec la nouvelle couleur (le verre se remplit à nouveau). */
    setVariant(v, name) {
      const sc = this.scene;
      if (!sc.variant || this._frozen) return this._variant;
      const key = variantKey(sc.variant.fam, v);
      this._variantLabel = name ? String(name) : null;
      if (key === this._variant) { this._layout(); this._kick(true); return key; }
      this._variant = key;
      this._build();
      this._texAsked = false;
      this._layout();
      if (this._near || this._seen) this._loadTextures();
      if (this.o.autoplay && !BB.reduced) { this._clock = 0; this._wait = 0; this._auto = true; this._wantAuto = true; }
      this._pose();
      this._kick(true);
      return key;
    }
    destroy() {
      this._alive = false;
      clearTimeout(this._napT);
      clearTimeout(this._relab);
      unobserve(this);
      if (this._ro) this._ro.disconnect();
      if (this._hit) this._hit.remove();
      if (this.svg) this.svg.remove();
      if (this._stage) this._stage.remove();
      if (this._img) this._img.remove();
      if (this.host.__bb === this) this.host.__bb = null;
    }
    _cascade() {
      const b = this.host.getBoundingClientRect(), vh = window.innerHeight || 800, vw = window.innerWidth || 400;
      return 0.35 * clamp(b.top / vh) + (b.left + b.width / 2 > vw / 2 ? 0.14 : 0);
    }
    _aria() {
      const it = menuItem(this.scene.id);
      const name = it ? trL(it.name, this.lang) : this.scene.id;
      const d = it && it.desc ? trL(it.desc, this.lang) : '';
      const txt = name + (d ? (this.lang === 'fr' ? ' : ' : ': ') + d : '');
      if (this.svg) this.svg.setAttribute('aria-label', txt);
      if (this._img) this._img.alt = txt;
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
    _image(g, tex) {
      const fr = BB.bake.frame(tex);
      return BB.svg('image', { x: r3(fr.x0), y: r3(fr.y0), width: r3(fr.x1 - fr.x0), height: r3(fr.y1 - fr.y0), preserveAspectRatio: 'none', opacity: 0 }, g);
    }
    _build() {
      const svg = this.svg, uid = this.uid, sc = this.scene, C = this._C, st = this._stage;
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      st.clear();
      // l'ombre au sol : un disque (rayon 1) au dégradé doux, étiré et placé à chaque image
      const gc = this._groundC = st.layer({ x0: -1, y0: -1, x1: 1, y1: 1 }, 1.3);
      const g0 = BB.svg('radialGradient', { id: uid + '-gr' }, gc.defs);
      [[0, 0.5], [0.5, 0.34], [0.78, 0.12], [1, 0]].forEach(([o, a]) => BB.svg('stop', { offset: o, 'stop-color': SHADOW, 'stop-opacity': a }, g0));
      BB.svg('ellipse', { cx: 0, cy: 0, rx: 1, ry: 1, fill: 'url(#' + uid + '-gr)' }, gc.g);
      // par-dessus, dans le repère de la caméra : le couteau (il ne passe qu'un instant)
      this._camO = BB.svg('g', { class: 'bb-cam' }, svg);
      this._knife = null;
      this._knifeA = 0;
      this._imgs = {}; // texture → éléments image qui la montrent
      const reg = (tex, el) => { (this._imgs[tex] || (this._imgs[tex] = [])).push(el); return el; };
      const shown = (el) => { el.setAttribute('opacity', 1); return el; };
      // chaque élément dans son calque (voir BB.Burger._kit.Stage), à la taille de ses textures
      const layer = (texs) => st.layer(Stage.box(texs.filter(Boolean).map((t) => BB.bake.frame(t))));
      // le plat (assiette, ardoise)
      const bc = layer([sc.base]);
      this.base = { tex: sc.base, cl: bc, img: shown(reg(sc.base, this._image(bc.g, sc.base))), frame: BB.bake.frame(sc.base) };
      const n = sc.layers.length;
      // dessin de l'arrière vers l'avant (le tas de salade d'abord) ; l'ordre d'arrivée reste celui de la scène
      // (desserts et boissons : les scènes sont déjà écrites de l'arrière vers l'avant)
      const flat = sc.kind === 'wrap' || sc.kind === 'dessert' || sc.kind === 'boisson';
      const order = flat ? sc.layers.map((x, i) => i)
        : sc.layers.map((x, i) => i).sort((a, b) => (a === 0 && sc.kind === 'salade' ? -9 : DEPTH[sc.layers[a].tex] || 0) - (b === 0 && sc.kind === 'salade' ? -9 : DEPTH[sc.layers[b].tex] || 0));
      this._order = order;
      const vkey = this._variant;
      const texs = sc.layers.map((spec) => { const full = spec.vary ? texOf(spec, vkey) : spec.tex; return { full, tex: spec.pour ? full + '-vide' : full }; });
      const cls = [];
      order.forEach((i) => { const spec = sc.layers[i]; cls[i] = layer([spec.under, texs[i].tex, spec.pour ? texs[i].full : null, spec.sliced]); });
      // un wrap : la galette ouverte se roule (chaque couche garde ce qui est derrière la ligne du rouleau, voir _place)
      const wrap = sc.kind === 'wrap';
      this._flatO = 1;
      this._clipB = null;
      this.layers = sc.layers.map((spec, i) => {
        const cl = cls[i], g = cl.g, defs = cl.defs, full = texs[i].full;
        const L = { i, spec, full, tex: texs[i].tex, w: spec.w, cl, frame: BB.bake.frame(full), c: 0, d: 0, f: 0, imp: 0, al: 0, lz: 0, dz: 0, fill: 1 };
        if (spec.under) { L.under = spec.under; L.underImg = shown(reg(spec.under, this._image(g, spec.under))); }
        L.img = shown(reg(L.tex, this._image(g, L.tex)));
        if (wrap) {
          const cp = BB.svg('clipPath', { id: uid + '-roll' + i }, defs);
          L.rollRect = BB.svg('rect', { x: -3, y: -3, width: 6, height: 6 }, cp);
          L.rollUrl = 'url(#' + uid + '-roll' + i + ')';
        }
        if (spec.pour) {
          // le verre plein se découvre de bas en haut : la boisson monte
          const fr = L.frame;
          const cp = BB.svg('clipPath', { id: uid + '-p' + i }, defs);
          L.pourClip = BB.svg('rect', { x: r3(fr.x0 - 0.05), y: r3(fr.y1), width: r3(fr.x1 - fr.x0 + 0.1), height: 0 }, cp);
          L.fullImg = reg(full, this._image(g, full));
          L.fullImg.setAttribute('clip-path', 'url(#' + uid + '-p' + i + ')');
          L.pour = POUR[spec.pour] || POUR.soft;
          L.pourKind = spec.pour;
        }
        if (spec.sliced) {
          // la bavette : la version tranchée se découvre sous le couteau, du bout vers le centre
          const cp = BB.svg('clipPath', { id: uid + '-cut' }, defs);
          this._sliceClip = BB.svg('rect', { x: 3, y: -3, width: 6, height: 6 }, cp);
          L.sliced = reg(spec.sliced, this._image(g, spec.sliced));
          L.sliced.setAttribute('clip-path', 'url(#' + uid + '-cut)');
          this._knife = BB.svg('line', { stroke: '#FFF4DE', 'stroke-linecap': 'round', opacity: 0 }, this._camO);
        }
        L.kind = kindOf(spec, full);
        return L;
      });
      if (sc.kind === 'wrap') {
        const mk = (tex) => { const cl = layer([tex]); return { tex, cl, img: shown(reg(tex, this._image(cl.g, tex))), frame: BB.bake.frame(tex), m6: null, al: 0 }; };
        this.roll = mk('wrap-roule');
        this.halfB = mk('wrap-' + sc.rec + '-b');
        this.halfA = mk('wrap-' + sc.rec + '-a');
        this._knife = BB.svg('line', { stroke: '#FFF4DE', 'stroke-linecap': 'round', opacity: 0 }, this._camO);
      }
      this._labG = BB.svg('g', { class: 'bb-lab' }, svg);
      this._labels = [];
      this._tex = {};
      // la bavette arrive entière et se tranche pendant la composition ; immobile, elle est servie tranchée
      this._slice = sc.layers.some((s) => s.sliced) && this.o.autoplay && !BB.reduced ? 0 : 1;
      // chronologie de la composition
      let t = 0.25;
      this.layers.forEach((L) => { L.t0 = t; L.dur = 0.62; t += sc.kind === 'boisson' ? 0.42 : 0.32; });
      const lastEnd = this.layers[n - 1].t0 + 0.62;
      let comp = lastEnd + 0.5;
      // les verres se remplissent une fois posés
      this.layers.forEach((L) => { if (L.pour) { L.tp = L.t0 + L.dur + 0.14; comp = Math.max(comp, L.tp + L.pour.d + 0.5); } });
      if (this.layers.some((L) => L.spec.sliced)) { this._tSlice = lastEnd + 0.2; comp = this._tSlice + 1.1; }
      const hasLabels = this.o.labels && this._labelItems().length > 0;
      /* le cycle. E (écartement) : 0 = servi ; 1 = détaillé et étiqueté.
         Wrap : 0,5 = galette garnie ouverte ; au-dessus, la garniture s'élève en couches (étiquettes) ;
         en dessous, la galette se roule (0,5 → 0,22) puis on coupe (0,22 → 0).
         Desserts et boissons sans étiquettes : servis, puis ils s'envolent.
         Une carte « once » : composition (puis, pour un wrap, roulé et coupé), et elle se fige. */
      let segs;
      if (sc.kind === 'wrap') {
        segs = this._once
          ? [['comp', comp, 0.5], ['hold', 0.4, 0.5], ['go', 2.6, 0.5, 0], ['hold', 3, 0], ['off', 1.0, 0]]
          : [['comp', comp, 0.5], ['hold', 1.0, 0.5], ['go', 1.6, 0.5, 1], ['hold', 3.4, 1], ['go', 1.3, 1, 0.5], ['go', 2.8, 0.5, 0], ['hold', 3.2, 0], ['off', 1.0, 0]];
      } else if ((sc.kind === 'dessert' || sc.kind === 'boisson') && !hasLabels) {
        segs = [['comp', comp, 0], ['hold', 5.5, 0], ['off', 1.0, 0]];
      } else segs = [['comp', comp, 0], ['hold', 1.4, 0], ['go', 1.2, 0, 1], ['hold', 4.0, 1], ['go', 1.0, 1, 0], ['hold', 1.8, 0], ['off', 1.0, 0]];
      this._segs = segs;
      this._T = { comp, P: segs.reduce((a, s) => a + s[1], 0), end: sc.kind === 'wrap' ? comp + 0.4 + 2.6 : comp };
      // le détail : de combien chaque couche s'élève (un wrap : la garniture en couches au-dessus de la galette)
      this.layers.forEach((L, i) => {
        if (sc.kind === 'wrap') L.lift = i === 0 ? 0 : 0.16 + 0.2 * (i - 1);
        else if (sc.kind === 'boisson') L.lift = 0;
        else L.lift = (sc.kind === 'salade' || sc.kind === 'dessert') && i === 0 ? 0 : 0.035;
      });
      this._C = C;
    }

    /* ---------- textures ---------- */
    _texList() {
      const out = [[this.base.tex, 1]];
      const n = this.layers.length;
      this.layers.forEach((L, i) => {
        const w = 0.95 - (0.5 * i) / Math.max(1, n - 1);
        if (L.under) out.push([L.under, w + 0.01]);
        out.push([L.tex, w]);
        if (L.pour) out.push([L.full, w - 0.02]);
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
          const cl = el.ownerSVGElement && el.ownerSVGElement.__cl;
          if (cl && this._stage) this._stage.grow(cl, t.frame);
          el.setAttribute('href', t.url);
          el.setAttributeNS(XLINK, 'xlink:href', t.url);
          el.setAttribute('x', r3(t.frame.x0));
          el.setAttribute('y', r3(t.frame.y0));
          el.setAttribute('width', r3(t.frame.x1 - t.frame.x0));
          el.setAttribute('height', r3(t.frame.y1 - t.frame.y0));
        });
        if (this._labOn && this._anchMiss && !this._relab) this._relab = setTimeout(() => { this._relab = 0; if (this._anchMiss && this._alive && !this._frozen) { this._layout(); this._kick(true); } }, 160);
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
      const b = this.svg.getBoundingClientRect(), hb = this.host.getBoundingClientRect();
      this._stage.place(b.left - hb.left - this.host.clientLeft, b.top - hb.top - this.host.clientTop);
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
      const fb = this.base.frame, C = this._C;
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
    // la plus grande échelle que prendra la caméra (servi, détaillé et entre les deux) : la finesse des calques
    _kTop() {
      const wrap = this.scene.kind === 'wrap';
      let k = 0;
      for (let E = 0; E <= 1.001; E += 0.125) k = Math.max(k, this._fit(E, wrap ? smooth(0.6, 0.95, E) : smooth(0.2, 0.85, E)).k);
      return k;
    }
    _layout(force) {
      const W = this._w, H = this._h;
      if (!W || !H || !this.layers) return;
      const dpr = window.devicePixelRatio || 1;
      this._kMax = (BB.bake.TIERS[this.hero ? 2 : 1] * 1.7) / dpr;
      // les étiquettes : leur plan attend que le plat soit composé (_frame) ; ensuite il suit la taille, la langue, la variante
      if (force) this._labOn = true;
      const plan = this.o.labels && this._labOn ? this._labelPlan(W, H) : null;
      this._labStale = !!this.o.labels && !this._labOn;
      this._colL = plan ? plan.colL : 0;
      this._colR = plan ? plan.colR : 0;
      this._cam0 = this._fit(0, 0);
      this._camS = null;
      if (this._stage) this._stage.scale(this._kTop() * 1.03); // (+3 % : le tassement à l'atterrissage)
      this._layoutLabels(plan);
    }

    /* ---------- les étiquettes : lisibles, jamais l'une sur l'autre, jamais hors de l'hôte ---------- */
    _labelItems() {
      const seen = {};
      const items = [];
      const add = (L, text, pt) => {
        if (!text || seen[text]) return;
        seen[text] = 1;
        items.push({ L, text, pt });
      };
      this.layers.forEach((L) => {
        const sp = L.spec;
        if (sp.vary && this._variantLabel) { add(L, this._variantLabel); return; }
        if (sp.lab) {
          const pts = BB.bake.points ? BB.bake.points(L.full) : null;
          sp.lab.forEach((lb) => add(L, labelText(this.scene, L, this.lang, lb.w), pts && pts[lb.p] ? pts[lb.p] : null));
          return;
        }
        if (sp.nw) { add(L, nameWord(this.scene, sp.nw, this.lang)); return; }
        if (sp.w != null) add(L, labelText(this.scene, L, this.lang, sp.w));
      });
      return items;
    }
    // le point d'ancrage (écran, unités du plat) d'une étiquette dans la pose détaillée (E = 1)
    _anchor(it, side) {
      const L = it.L, S = this._S, C = this._C, lz = L.lift;
      if (it.pt) return { x: it.pt[0], y: it.pt[1] * S - (it.pt[2] + lz) * C, lz };
      const aa = BB.bake.anchors(L.full);
      if (!aa) this._anchMiss = true;
      const f = L.frame;
      const an = aa ? aa[side > 0 ? 0 : 1] : [side > 0 ? f.x1 - 0.15 : f.x0 + 0.15, 0, 0];
      return { x: an[0], y: an[1] * S - (an[2] + lz) * C, lz };
    }
    _font() { return this._fam || (this._fam = (getComputedStyle(this.svg).fontFamily || 'system-ui, sans-serif') + CJK); } // (lue une fois)
    _labelPlan(W, H) {
      const items = this._labelItems();
      if (!items.length) return null;
      const fam = this._font();
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
        const a0 = this._anchor(it, 1), a1 = this._anchor(it, -1);
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
            r.an = this._anchor(r.it, r.side);
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
      g.style.fontFamily = this._font();
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
        this._labels.push({ r, grp, hl, li, dot, a: -1 });
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
          if (s[0] === 'comp') return { k: 'comp', u, E: s[2], i };
          if (s[0] === 'hold') return { k: 'hold', u, E: s[2], i };
          if (s[0] === 'go') return { k: 'go', u, E: s[2] + (s[3] - s[2]) * inOut(u / s[1]), dir: s[3] > s[2] ? 1 : -1, i, to: s[3] };
          return { k: 'off', u, E: s[2], i };
        }
        u -= s[1];
      }
      return { k: 'hold', u: 0, E: segs[0][2], i: 0 };
    }
    _waitTex(u) {
      if (!this._ok(this.base.tex)) return true;
      for (let i = 0; i < this.layers.length; i++) {
        const L = this.layers[i];
        if (L.t0 <= u + 0.04 && (!this._ok(L.tex) || (L.under && !this._ok(L.under)))) return true;
        if (L.pour && L.tp <= u + 0.04 && !this._ok(L.full)) return true;
      }
      if (this._tSlice != null && u > this._tSlice - 0.1 && this.layers.some((L) => L.spec.sliced && !this._ok(L.spec.sliced))) return true;
      return false;
    }

    _frame(now, force) {
      if (!this._alive || this._frozen) return false;
      if (!force && !this._seen && typeof IntersectionObserver !== 'undefined') return false;
      const t = now / 1000;
      let dt = this._tLast ? Math.min(0.05, Math.max(0, t - this._tLast)) : 1 / 60;
      // au réveil d'une sieste (un temps immobile, voir _sieste) : le temps passé compte en entier
      if (this._nap) { if (this._auto && !this._frozen2) this._clock += Math.max(0, t - this._nap); this._nap = 0; clearTimeout(this._napT); dt = 1 / 60; }
      this._tLast = t;
      const sc = this.scene, n = this.layers.length, S = this._S, C = this._C;
      const ev = this._ev;
      ev.live = !force && !this._frozen2 && !BB.reduced && typeof this.onEvent === 'function';
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
        // les temps forts du cycle : le début de chaque étape
        const segKey = ph.k === 'comp' && !this._started ? -1 : ph.i;
        if (segKey !== ev.seg) {
          if (ph.k === 'comp' && segKey >= 0) this._emit('compose');
          else if (ph.k === 'off') this._emit('envol');
          else if (ph.k === 'go' && sc.kind !== 'wrap') this._emit(ph.dir > 0 ? 'eclate' : 'recompose');
          else if (ph.k === 'go' && sc.kind === 'wrap') { if (ph.dir > 0) this._emit('eclate'); else if (ph.to >= 0.5) this._emit('recompose'); }
          ev.seg = segKey;
        }
      } else {
        const k = this._drag ? 26 : 7.5;
        this._E += (this._target - this._E) * (1 - Math.exp(-dt * k));
        if (Math.abs(this._target - this._E) < 5e-4) this._E = this._target;
        if (this._wantAuto && !this._drag && this._resumeAt && t > this._resumeAt) { this._resumeAt = 0; this.play(); }
        ev.seg = -2;
      }
      // les étiquettes : leur plan (mesures de texte, colonnes) attend que le plat soit composé, ou qu'on l'ouvre au doigt
      if (this._labStale && !force && (!this._auto || (ph && ph.k !== 'comp'))) this._layout(true);
      let busy = this._auto || this._E !== this._target || this._dirty;
      let calm = (this._auto || this._E === this._target) && !this._drag; // (rien ne bouge : voir _sieste)
      const E = this._E;
      // l'assiette (ou l'ardoise) : là tout de suite, en fondu
      const bOk = this._ok(this.base.tex);
      let baseA = bOk ? 1 : 0;
      if (ph && ph.k === 'comp') baseA = bOk ? smooth(0, 0.25, ph.u) : 0;
      if (baseA > 0 && !(this._baseA > 0) && ph && ph.k === 'comp') { const kd = kindOf(null, this.base.tex); this._emit('pose', { kind: kd[0], id: this.base.tex, index: -1, force: kd[1], again: false }); }
      this._baseA = baseA;
      // les éléments : arrivée (chute), éclaté, envol
      for (let i = 0; i < n; i++) {
        const L = this.layers[i];
        let c = 1, d = 0;
        if (ph && ph.k === 'comp') c = clamp((ph.u - L.t0) / L.dur);
        if (ph && ph.k === 'off') d = clamp((ph.u - (n - 1 - i) * 0.05) / 0.6);
        if (L.c < 1 && c >= 1) { L.imp = t; this._emit('pose', { kind: L.kind[0], id: L.full, index: i, force: L.kind[1], again: false }); }
        L.c = c; L.d = d;
        const w = n > 1 ? (n - 1 - i) / (n - 1) : 0;
        const e = sc.kind === 'wrap' ? clamp((E - 0.5) * 2 * 1.45 - 0.45 * w) : clamp(E * 1.45 - 0.45 * w);
        const fi = inOut(e);
        L.f = fi;
        let dz = DROP * (1 - c * c) + 1.4 * d * d;
        let sq = 0;
        if (L.imp) { const u = t - L.imp; if (u < 0.6) sq = Math.exp(-u * 8) * Math.sin(u * 26); else L.imp = 0; }
        if (L.imp) { busy = true; calm = false; }
        // (détaillé, les éléments soulevés flottent un peu ; pas dans la fiche : option float: false)
        const fl = fi > 0.001 && L.lift > 0 && !BB.reduced && this.o.float !== false;
        const lz = L.lift * fi + (fl ? 0.012 * fi * Math.sin(t * 1.1 + i * 1.7) : 0);
        if (fl) { busy = true; calm = false; }
        L.lz = lz; L.dz = dz;
        const okL = this._ok(L.tex) && (!L.under || this._ok(L.under));
        const al = okL ? smooth(0, 0.12, c) * (1 - smooth(0.45, 0.95, d)) : 0;
        L.al = al;
        const ty = -(lz + dz) * C;
        // petit tassement à l'atterrissage (autour du bas de la couche)
        const py = L.frame.y1 - 0.02, sx = 1 + 0.02 * sq, sy = 1 - 0.04 * sq;
        L.sx = sx; L.sy = sy; L.y = ty + py * (1 - sy); // (placé avec la caméra : _place)
        if (L.pour && this._pourFrame(L, ph, i)) { busy = true; calm = false; }
        if (L.sliced) {
          // le couteau : la version tranchée se découvre, du bout vers le milieu
          let sl = this._slice;
          if (ph && ph.k === 'comp') sl = clamp((ph.u - this._tSlice) / 0.9);
          else if (ph) sl = 1;
          if (sl > 0 && !(this._slPrev > 0) && sl < 1) this._emit('coupe', { what: 'bavette' });
          this._slPrev = sl;
          const okS = this._ok(L.spec.sliced);
          const xa = BAV.x + BAV.L * 1.08 * Math.cos(BAV.rot) + 0.05, xb = BAV.x + BAV.L * (BAV.cut - 0.06) * Math.cos(BAV.rot);
          const xs = xa + (xb - xa) * outCubic(sl);
          attr(this._sliceClip, 'x', r3(okS ? xs : 5));
          attr(L.sliced, 'opacity', okS ? 1 : 0);
          const kn = sl > 0 && sl < 1 ? Math.sin(Math.PI * sl) : 0;
          attr(this._knife, 'opacity', r2(kn * al * 0.9));
          this._knifeA = kn * al;
          if (kn > 0) {
            const y0 = BAV.y - 0.3, y1 = BAV.y + 0.28;
            attr(this._knife, 'x1', r3(xs + 0.03)); attr(this._knife, 'y1', r3(y0 * S - (0.16 + lz + dz) * C));
            attr(this._knife, 'x2', r3(xs - 0.03)); attr(this._knife, 'y2', r3(y1 * S - (0.05 + lz + dz) * C));
            attr(this._knife, 'stroke-width', 0.012);
            busy = true; calm = false;
          }
        }
      }
      if (sc.kind === 'wrap' && this._wrapFrame(ph, E, t)) { busy = true; calm = false; }
      // caméra
      if (this._cam0) {
        const lf = sc.kind === 'wrap' ? smooth(0.6, 0.95, E) : smooth(0.2, 0.85, E);
        const tg = this._fit(E, lf);
        let cm = this._camS;
        if (!cm) cm = this._camS = { k: tg.k, cx: tg.cx, cy: tg.cy };
        const q = 1 - Math.exp(-dt * 12);
        cm.k += (tg.k - cm.k) * q; cm.cx += (tg.cx - cm.cx) * q; cm.cy += (tg.cy - cm.cy) * q;
        if (Math.abs(tg.k - cm.k) > 0.01 || Math.abs(tg.cx - cm.cx) > 0.05 || Math.abs(tg.cy - cm.cy) > 0.05) { busy = true; calm = false; }
        this._place(cm, baseA);
        this._k = cm.k; this._cx = cm.cx; this._cy = cm.cy;
        this._drawLabels(E);
      }
      this._dirty = false;
      if (this._auto && calm && !force && !this._once && !this._frozen2 && ph && ph.k === 'hold' && this._sieste(t)) return false;
      return busy || (this._once && !force);
    }
    // un temps immobile du cycle (servi, détaillé…) : plus rien ne bouge ; on dort jusqu'à la suite, sans calculer
    // une seule image (le temps passé est rendu à l'horloge au réveil)
    _sieste(t) {
      const left = this._holdLeft(this._clock);
      if (left < 0.2) return false;
      this._nap = t;
      clearTimeout(this._napT);
      this._napT = setTimeout(() => { this._napT = 0; this._kick(true); }, (left - 0.03) * 1000);
      return true;
    }
    // le temps qui reste dans un temps immobile du cycle (0 ailleurs)
    _holdLeft(tc) {
      const segs = this._segs, P = this._T.P;
      let u = ((tc % P) + P) % P;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (u < s[1]) return s[0] === 'hold' ? s[1] - u : 0;
        u -= s[1];
      }
      return 0;
    }

    // chaque calque à sa place : la caméra × la pose de l'élément (BB.Burger._kit.Stage)
    _place(cm, baseA) {
      const st = this._stage, sc = this.scene, fb = this.base.frame, S = this._S;
      const grx = (fb.x1 - fb.x0) * 0.56, gry = grx * S * (/^ardoise/.test(sc.base) ? 0.8 : 1.05);
      st.put(this._groundC, cm, grx, 0, 0, gry, (fb.x0 + fb.x1) / 2 + 0.06, 0.04, baseA * 0.9); // l'ombre au sol, sous le plat
      st.put(this.base.cl, cm, 1, 0, 0, 1, 0, 0, baseA);
      const wrap = sc.kind === 'wrap', fo = wrap ? this._flatO : 1, cb = wrap ? this._clipB : null;
      for (let i = 0; i < this.layers.length; i++) {
        const L = this.layers[i];
        if (L.sy == null) continue;
        st.put(L.cl, cm, L.sx, 0, 0, L.sy, 0, L.y, L.al * fo);
        if (!wrap) continue;
        // la galette qui se roule : la ligne du rouleau, ramenée dans le repère de la couche
        attr(L.cl.g, 'clip-path', cb == null ? 'none' : L.rollUrl);
        if (cb != null) {
          attr(L.rollRect, 'x', r3(-3 / L.sx)); attr(L.rollRect, 'width', r3(6 / L.sx));
          attr(L.rollRect, 'y', r3((-3 - L.y) / L.sy)); attr(L.rollRect, 'height', r3((cb + 3) / L.sy));
        }
      }
      if (wrap) [this.roll, this.halfB, this.halfA].forEach((R) => { const m = R.m6; if (m) st.put(R.cl, cm, m[0], m[1], m[2], m[3], m[4], m[5], R.al); });
      // le couteau (dans le SVG des étiquettes) : la caméra seulement quand il passe
      if (this._knife && this._knifeA > 0) attr(this._camO, 'transform', 'translate(' + r2(cm.cx) + ' ' + r2(cm.cy) + ') scale(' + r3(cm.k) + ')');
    }

    /* un verre qui se remplit : le verre plein se découvre de bas en haut ; la mousse, puis les bulles */
    _pourFrame(L, ph, i) {
      let fill = 1;
      if (ph && ph.k === 'comp') {
        const u = clamp((ph.u - L.tp) / L.pour.d);
        fill = 1 - (1 - u) * (1 - u);
        if (ph.u < L.tp) fill = 0;
      } else if (!ph && this._auto) fill = 1;
      const prev = L.fill;
      if (fill > 0 && !(prev > 0) && fill < 1) this._emit('verse', { kind: L.pourKind, id: L.full, index: i });
      if (L.pour.foam && fill >= L.pour.foam && prev < L.pour.foam) this._emit('mousse', { id: L.full, index: i });
      if (L.pour.fizz && fill >= 1 && prev < 1 && prev > 0 && (L.pourKind !== 'soft' || /cola/.test(L.full))) this._emit('bulles', { id: L.full, index: i });
      L.fill = fill;
      const fr = L.frame, hh = fr.y1 - fr.y0;
      const okF = this._ok(L.full);
      attr(L.pourClip, 'y', r3(fr.y1 - fill * hh - (fill >= 1 ? 0.05 : 0)));
      attr(L.pourClip, 'height', r3(fill * hh + (fill >= 1 ? 0.1 : 0.001)));
      attr(L.fullImg, 'opacity', okF ? 1 : 0);
      return fill > 0 && fill < 1;
    }

    /* le wrap : la galette se roule (le rouleau grossit en avançant), puis on coupe et les deux moitiés s'écartent */
    _wrapFrame(ph, E, t) {
      const S = this._S, C = this._C;
      const p = clamp((0.5 - E) / 0.28), q = clamp((0.22 - E) / 0.22);
      if (p > 0 && !(this._pPrev > 0)) this._emit('roule');
      if (q > 0.05 && !(this._qPrev > 0.05)) this._emit('coupe', { what: 'wrap' });
      this._pPrev = p; this._qPrev = q;
      const pe = inOut(p);
      const off = ph && ph.k === 'off' ? clamp(ph.u / 0.7) : 0;
      // la ligne du rouleau : de l'avant de la galette vers l'arrière
      const yFront = TOR.y + TOR.R + 0.02, yEnd = WR.y + WR.R * 0.6;
      const yl = yFront + (yEnd - yFront) * pe;
      const rr = WR.R * (0.28 + 0.72 * pe);
      // la partie encore à plat : ce qui est derrière la ligne
      this._clipB = p > 0.001 ? yl * S - (WR.top + 0.03) * C : null;
      this._flatO = p >= 0.999 ? 0 : 1;
      // le rouleau
      const R = this.roll, okR = this._ok(R.tex);
      const yMax = Math.max(yl, TOR.y);
      const chord = 2 * Math.sqrt(Math.max(0, TOR.R * TOR.R - (yMax - TOR.y) * (yMax - TOR.y)));
      const sxr = clamp(chord / (2 * WR.L), 0.3, 1), syr = rr / WR.R;
      const ya = yl - rr * 0.7; // l'axe du rouleau, juste derrière la ligne
      const rA = okR ? smooth(0, 0.05, p) * (1 - smooth(0.3, 0.62, q)) * (1 - off) : 0;
      const pvY = WR.y * S - WR.top * C; // pivot : le bas du rouleau, sur l'ardoise
      const tyR = (ya - WR.y) * S;
      R.m6 = [sxr, 0, 0, syr, 0, tyR + pvY * (1 - syr)];
      R.al = rA;
      // les deux moitiés : elles partent du rouleau et glissent à leur place
      const hq = outCubic(clamp((q - 0.3) / 0.7));
      const hA = (this._ok(this.halfA.tex) && this._ok(this.halfB.tex) ? smooth(0.3, 0.55, q) : 0) * (1 - off);
      [[this.halfA, HALF_Y.a, 0.05], [this.halfB, HALF_Y.b, -0.05]].forEach(([Hh, y0, sx0]) => {
        const dy = (WR.y - y0) * (1 - hq), dx = sx0 * (1 - hq);
        const lift = off * off * 1.2;
        Hh.m6 = [1, 0, 0, 1, dx, dy * S - lift * C];
        Hh.al = hA;
      });
      // l'éclair du couteau, en biais sur le rouleau
      const kn = q > 0.05 && q < 0.4 ? Math.sin((Math.PI * (q - 0.05)) / 0.35) : 0;
      attr(this._knife, 'opacity', r2(kn * 0.9));
      this._knifeA = kn;
      if (kn > 0) {
        attr(this._knife, 'x1', r3(0.1)); attr(this._knife, 'y1', r3((WR.y - 0.26) * S - (WR.top + 2.2 * WR.R) * C));
        attr(this._knife, 'x2', r3(-0.08)); attr(this._knife, 'y2', r3((WR.y + 0.26) * S - WR.top * C));
        attr(this._knife, 'stroke-width', 0.014);
      }
      // la galette et sa garniture s'effacent aussi à l'envol
      if (off > 0) this._flatO = 1 - off;
      return p > 0 && p < 1 || q > 0 && q < 1 || off > 0;
    }

    // étiquettes : dans la pose détaillée ; le trait suit la couche
    _drawLabels(E) {
      const labs = this._labels, C = this._C;
      const a = smooth(0.8, 0.98, E);
      for (let j = 0; j < labs.length; j++) {
        const lb = labs[j], L = lb.r.it.L;
        const aj = a * (L.al > 0.5 ? 1 : 0);
        attr(lb.grp, 'opacity', r2(aj));
        if (aj > 0 && !(lb.a > 0)) this._emit('etiquette', { i: j, text: lb.r.it.text });
        lb.a = aj;
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
      return ['plat', this.scene.id, this._variant || '', this._w, this._h, dpr].join('|');
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
      const svg = this.svg, stage = this._stage;
      this._stage = null;
      this._aria();
      if (svg) {
        if (svg.style.aspectRatio) { img.style.height = 'auto'; img.style.aspectRatio = svg.style.aspectRatio; }
        if (fade) {
          img.style.cssText += ';position:absolute;left:0;top:0;opacity:0;transition:opacity .35s ease';
          svg.parentNode.insertBefore(img, svg.nextSibling);
          const show = () => {
            img.style.opacity = '1';
            setTimeout(() => { img.style.position = ''; img.style.left = ''; img.style.top = ''; img.style.transition = ''; svg.remove(); if (stage) stage.remove(); }, 380);
          };
          if (img.decode) img.decode().then(show, show); else img.onload = show;
        } else { svg.parentNode.replaceChild(img, svg); if (stage) stage.remove(); }
      } else { this.host.appendChild(img); if (stage) stage.remove(); }
      this.svg = null;
      this._labels = [];
    }
    // le plat servi, en pixels : ombre au sol, le plat, puis les éléments dans l'ordre de dessin (ou les deux moitiés du wrap)
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
      ctx.scale(1, this._S * (/^ardoise/.test(this.scene.base) ? 0.8 : 1.05));
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
        (this._order || this.layers.map((L, i) => i)).forEach((i) => {
          const L = this.layers[i];
          if (L.under) draw(L.under, 0, 0);
          draw(L.spec.sliced || (L.pour ? L.full : L.tex), 0, 0);
        });
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
