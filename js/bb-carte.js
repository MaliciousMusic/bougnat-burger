/* ==========================================================================
   Bougnat Burger — la carte : rubriques, cartes des burgers (dessinés en éclaté par
   bb-burger.js quand il est chargé), fiche d'un plat (Ti ou double, steak ou galette),
   ajout au sac. Tout est rendu depuis bb-data.js, dans la langue courante.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;

  /* ---------- le tampon « frites maison » de la fiche : les mots courbés en haut et en bas, le cornet gravé au centre ---------- */
  // TAMPON-FRITES:START (généré par tools/tampon/tampon-frites.py : anneaux, cornet gravé en masque, chemins des mots)
  const TF_MASK = '<path d="M50.29 62.93L41.47 43.13L46.33 40.27L55.41 60.66Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M47 50.72L44.51 45.14" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M67.09 58.26L75.58 39.19L81.21 40.32L72.21 60.53Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M73.77 48.09L76.25 42.52" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M54.33 61.95L49.67 32.55L55.29 32.21L59.86 61.08Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M53.14 41.89L52.18 35.87" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M62.31 59.96L67.97 33.33L73.76 32.99L67.78 61.13Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M68.07 42.28L69.34 36.31" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M58.28 61.15L58.81 30.69L64.41 30.92L63.88 61.25Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M60.6 40.29L60.71 34.19" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M52.17 62.51L44.78 38.36L50 36.26L57.52 60.88Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M49.37 46.64L47.58 40.81" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M65.07 59.11L72.79 36.69L78.6 37.01L70.37 60.93Z" fill="#fff" stroke="#000" stroke-width="1.9" stroke-linejoin="round"/><path d="M71.81 45.56L73.8 39.79" stroke="#000" stroke-width="1" stroke-linecap="round"/><path d="M44 56.8Q60.5 58.6 77.5 52.6L61 88Z" fill="#000" stroke="#000" stroke-width="2.6" stroke-linejoin="round"/><path d="M44 56.8Q60.5 58.6 77.5 52.6L61 88Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M46.5 58.8Q58 62.5 70.2 72.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/><path d="M61 58.82L61 65.77 M64.4 58.3L63.39 67.08 M67.8 57.62L65.43 68.21 M71.2 56.78L67.15 69.18 M74.6 55.78L68.59 70.01" stroke="#fff" stroke-width="1.15" stroke-linecap="round"/><path d="M45.5 59.2Q60.5 61.2 75.7 54.8" fill="none" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="M52 71l3.2 4.4 M56.5 79l1.8 3 M49.5 64.5l2.6 3.3" stroke="#fff" stroke-width="0.9" stroke-linecap="round"/>';
  const TF_ENCRE = '<circle cx="60" cy="60" r="55.2" fill="none" stroke-width="4.2"/><circle cx="60" cy="60" r="49.4" fill="none" stroke-width="1.3"/><circle cx="60" cy="60" r="32.6" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="0.01 3.12"/><path stroke="none" d="M18.6 55.9L19.63 58.58L22.5 58.73L20.26 60.54L21.01 63.32L18.6 61.75L16.19 63.32L16.94 60.54L14.7 58.73L17.57 58.58ZM101.4 55.9L102.43 58.58L105.3 58.73L103.06 60.54L103.81 63.32L101.4 61.75L98.99 63.32L99.74 60.54L97.5 58.73L100.37 58.58Z"/><path stroke="none" d="M37.4 50.2m-0.95 0a0.95 0.95 0 1 0 1.9 0a0.95 0.95 0 1 0 -1.9 0M35.4 45.4m-0.75 0a0.75 0.75 0 1 0 1.5 0a0.75 0.75 0 1 0 -1.5 0M39.6 44.2m-0.65 0a0.65 0.65 0 1 0 1.3 0a0.65 0.65 0 1 0 -1.3 0M34.8 54.2m-0.6 0a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0M82.6 49.6m-0.8 0a0.8 0.8 0 1 0 1.6 0a0.8 0.8 0 1 0 -1.6 0M84.8 54.6m-0.6 0a0.6 0.6 0 1 0 1.2 0a0.6 0.6 0 1 0 -1.2 0"/><g fill="none" stroke-width="1.15" stroke-linecap="round" opacity=".75" transform="translate(1.6 -1.3)"><path d="M6.59 38.42A57.6 57.6 0 0 1 38.42 6.59" stroke-dasharray="11 2.6 5 3.4 22 4"/><path d="M116.08 73.98A57.8 57.8 0 0 1 95.59 105.55" stroke-dasharray="7 3 16 2.4"/></g><path stroke="none" d="M56.66 118.48a0.61 0.61 0 1 0 1.22 0a0.61 0.61 0 1 0 -1.22 0M84.36 6.82a0.6 0.6 0 1 0 1.21 0a0.6 0.6 0 1 0 -1.21 0M7.38 32.66a0.48 0.48 0 1 0 0.97 0a0.48 0.48 0 1 0 -0.97 0M14.8 103.17a0.7 0.7 0 1 0 1.39 0a0.7 0.7 0 1 0 -1.39 0M97.17 109.48a0.38 0.38 0 1 0 0.76 0a0.38 0.38 0 1 0 -0.76 0M13.35 22.52a0.44 0.44 0 1 0 0.87 0a0.44 0.44 0 1 0 -0.87 0M99.33 16.01a0.84 0.84 0 1 0 1.68 0a0.84 0.84 0 1 0 -1.68 0M114.23 34.44a0.73 0.73 0 1 0 1.47 0a0.73 0.73 0 1 0 -1.47 0M103.07 102.06a0.39 0.39 0 1 0 0.78 0a0.39 0.39 0 1 0 -0.78 0M80.89 4.92a0.76 0.76 0 1 0 1.52 0a0.76 0.76 0 1 0 -1.52 0M85.49 113.53a0.7 0.7 0 1 0 1.4 0a0.7 0.7 0 1 0 -1.4 0"/>';
  const TF_HAUT = 'M23.1 60A36.9 36.9 0 0 1 96.9 60';
  const TF_BAS = 'M14.7 60A45.3 45.3 0 0 0 105.3 60';
  // TAMPON-FRITES:END
  function tamponFrites() {
    const haut = BB.t('tamponHaut'), bas = BB.t('tamponBas');
    const cjk = /[\u3000-\u9fff]/.test(haut + bas);
    // la place sur l'arc (≈ 72 en haut, 80 en bas) : les mots longs se serrent, les idéogrammes s'espacent
    const esp = (txt) => (cjk ? 9 : txt.length > 6 ? 1.2 : 2.4);
    const taille = (txt, place) => Math.min(cjk ? 15 : 12.6, (place - (txt.length - 1) * esp(txt)) / (txt.length * (cjk ? 1 : 0.72)));
    const mot = (id, txt, fs, ls) => `<text stroke="none" font-size="${fs}" letter-spacing="${ls}"${cjk ? ' font-weight="700"' : ''} text-anchor="middle"><textPath href="#${id}" startOffset="50%">${txt}</textPath></text>`;
    return `<svg class="empreinte" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs><path id="tf-haut" d="${TF_HAUT}"/><path id="tf-bas" d="${TF_BAS}"/>
      <mask id="tf-masque" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">${TF_MASK}</mask></defs>
      <g transform="rotate(-10 60 60)" filter="url(#encre-tampon)" fill="currentColor" stroke="currentColor" font-family="'Alfa Slab One', Rockwell, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', Georgia, sans-serif">
        ${TF_ENCRE}<rect width="120" height="120" stroke="none" mask="url(#tf-masque)"/>
        ${mot('tf-haut', haut, taille(haut, 72), esp(haut))}
        ${mot('tf-bas', bas, taille(bas, 80), esp(bas))}
      </g></svg>${TAMPONNEUR}`;
  }
  // le tampon lui-même, vu de dessus (monture en bois, bague de laiton, poignée) : il descend, appuie, se relève
  const TAMPONNEUR = `<svg class="tamponneur" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <defs><radialGradient id="tf-bois" cx=".38" cy=".34" r=".75"><stop offset="0" stop-color="#C08650"/><stop offset=".7" stop-color="#96623A"/><stop offset="1" stop-color="#6E4424"/></radialGradient>
      <radialGradient id="tf-pommeau" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#9A623A"/><stop offset=".65" stop-color="#6A3F20"/><stop offset="1" stop-color="#4A2A14"/></radialGradient></defs>
      <g transform="rotate(-10 60 60)">
        <circle cx="60" cy="60" r="57" fill="url(#tf-bois)"/>
        <circle cx="60" cy="60" r="55.4" fill="none" stroke="#5A3519" stroke-width="3"/>
        <g fill="none" stroke="#F3D3A6" stroke-opacity=".14" stroke-width="1.1"><circle cx="58" cy="61" r="46"/><circle cx="61" cy="59" r="37.5"/><path d="M22 70q14 9 30 6t34 4"/></g>
        <circle cx="60" cy="60" r="26" fill="#B89048"/><circle cx="60" cy="60" r="26" fill="none" stroke="#F4DC9C" stroke-opacity=".55" stroke-width="1.4"/>
        <circle cx="60" cy="60" r="20.5" fill="url(#tf-pommeau)"/>
        <ellipse cx="53" cy="52" rx="7.5" ry="4.6" fill="#FFF3DC" opacity=".3" transform="rotate(-30 53 52)"/>
      </g></svg>`;

  const byId = new Map();
  const all = () => [...BB.BURGER_LIST, ...BB.MENU_OTHER];
  all().forEach((it) => byId.set(it.id, it));
  BB.menuItem = (id) => byId.get(id);

  /* ---------- le dessin d'un burger (si bb-burger.js est là) ---------- */
  // Retrouve la recette dessinée : clés possibles 'ti-bougnat' (Ti), 'bougnat' (double), 'petiot'…
  function drawnRecipe(item, { double = false, veggie = false } = {}) {
    const R = BB.BURGERS;
    if (!R) return null;
    const keys = item.id === 'petiot' ? ['petiot'] : double ? [item.id, item.id + '-double', 'double-' + item.id] : ['ti-' + item.id, item.id + '-ti', item.id];
    let rec = null;
    for (const k of keys) if (R[k]) { rec = R[k]; break; }
    if (!rec) return null;
    if (!veggie || !Array.isArray(rec.layers)) return rec;
    if (BB.withPatty) return BB.withPatty(rec, 'galette'); // étiquettes et couches suivent
    // version végé : la galette remplace le steak (même place dans l'empilement)
    const swap = (id) => (/^steak/.test(id) ? id.replace(/^steak[^,]*/, 'galette') : id);
    return Object.assign({}, rec, { layers: rec.layers.map((l) => (typeof l === 'string' ? swap(l) : Object.assign({}, l, { id: swap(l.id || '') }))) });
  }
  BB.drawnRecipe = drawnRecipe;

  const live = new Set(); // burgers dessinés actuellement montés
  /* Les sons de l'assemblage : dans la fiche seulement (sur la carte, vingt vignettes à la fois feraient un vacarme),
     et pendant le premier cycle après l'ouverture (ensuite le plat boucle en silence). Événements de bb-burger.js / bb-plat.js. */
  // les couches d'un burger (kind de bb-burger.js ; les autres, d'après leur id)
  const COUCHE = { 'pain-bas': 'pain', 'pain-haut': 'pain', steak: 'steak', galette: 'steak', fromage: 'fromage', salade: 'feuille', tomate: 'tranche', oignon: 'tranche', jambon: 'tranche' };
  const COUCHE_ID = { noix: 'noix', walnuts: 'noix', paillasson: 'feuille', rosti: 'feuille', chorizo: 'tranche', poivrons: 'tranche', peppers: 'tranche', miel: 'sauce', honey: 'sauce' };
  // ce qui se pose dans une assiette (kind de bb-plat.js)
  const POSE = {
    assiette: 'bol', ardoise: 'bol', ramequin: 'bol', coupe: 'bol',
    salade: 'feuille', herbes: 'feuille', frites: 'feuille',
    tomates: 'tranche', poivrons: 'tranche', jambon: 'tranche', saumon: 'tranche', poulet: 'tranche',
    fromage: 'fromage', meringue: 'fromage', boule: 'fromage', 'fruit-givre': 'fromage', fruits: 'fromage', cafe: 'fromage',
    noix: 'noix', pignons: 'noix', croutons: 'noix', amandes: 'noix',
    toast: 'pain', galette: 'pain', gateau: 'pain', tarte: 'pain',
    miel: 'sauce', sauce: 'sauce', coulant: 'sauce', chocolat: 'sauce',
    viande: 'steak', verre: 'verre', bouteille: 'verre',
  };
  const AUTRES = { fond: 'fonte', sauce: 'sauce', eclate: 'eclate', recompose: 'rassemble', envol: 'envole', etiquette: 'etiquette', roule: 'roule', coupe: 'coupe', verse: 'verse', mousse: 'fizz', bulles: 'fizz' };
  let sonsJusqua = 0;
  function sonAssemblage(type, info) {
    info = info || {};
    if (!BB.sfx || info.hero === false || performance.now() > sonsJusqua) return;
    const nom = type === 'couche' ? COUCHE[info.kind] || COUCHE_ID[info.id] || 'pain' : type === 'pose' ? POSE[info.kind] || 'pain' : AUTRES[type];
    if (nom) BB.sfx.play(nom, { force: info.force != null ? 0.55 + 0.45 * info.force : 1, i: info.i || 0 });
  }
  function mountBurger(host, item, opts, variant) {
    if (!BB.Burger) return null;
    const rec = drawnRecipe(item, variant);
    if (!rec) return null;
    try {
      host.querySelector('.ph') && host.querySelector('.ph').remove();
      const b = new BB.Burger(host, rec, Object.assign({ lang: BB.lang }, opts));
      live.add(b);
      return b;
    } catch (e) {
      console.warn('Burger non dessiné', item.id, e);
      return null;
    }
  }
  // Monte les cartes quand elles approchent de l'écran (pas 20 dessins d'un coup)
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const host = en.target;
      io.unobserve(host);
      const item = byId.get(host.dataset.id);
      if (item && !host._burger) host._burger = monter(host, item, { size: 'card', labels: false, interactive: false, autoplay: 'once' });
    });
  }, { rootMargin: '200px 0px' }) : null;
  const dessine = (it) => it.cat === 'burgers' || !!it.burger || !!(BB.Plat && BB.hasPlat && BB.hasPlat(it.id));
  function mountPlat(host, item, opts) {
    if (!BB.Plat || !BB.hasPlat || !BB.hasPlat(item.id)) return null;
    try {
      host.querySelector('.ph') && host.querySelector('.ph').remove();
      const p = new BB.Plat(host, item.id, Object.assign({ lang: BB.lang }, opts));
      live.add(p);
      return p;
    } catch (e) {
      console.warn('Plat non dessiné', item.id, e);
      return null;
    }
  }
  // la variante dessinée par défaut d'une famille de boissons (sa teinte)
  const teinteDe = (it, v) => (v ? v.teinte || v.id : it.variants ? it.variants[0].teinte || it.variants[0].id : undefined);
  function monter(host, item, opts) {
    if (item.cat === 'burgers' || item.burger) return mountBurger(host, item, opts, {});
    return mountPlat(host, item, Object.assign({ variant: teinteDe(item) }, opts));
  }
  function lazyBurger(host) {
    if (io) io.observe(host);
    else host._burger = monter(host, byId.get(host.dataset.id), { size: 'card', labels: false, interactive: false, autoplay: 'once' });
  }

  /* ---------- rendu de la carte ---------- */
  function priceHTML(item) {
    if (item.cat === 'burgers') {
      return `<span class="price"><span class="p-main">${esc(BB.fmtPriceL(item.price))}</span><span class="p-alt">${esc(BB.t('double'))} ${esc(BB.fmtPriceL(item.double))}</span></span>`;
    }
    if (item.variants) {
      const ps = item.variants.map((v) => v.price).filter((n) => n != null);
      const lo = Math.min(...ps), hi = Math.max(...ps);
      return `<span class="price"><span class="p-main">${lo !== hi ? esc(BB.t('from')) + ' ' : ''}${esc(BB.fmtPriceL(lo))}</span></span>`;
    }
    if (item.price == null) return `<span class="price"><span class="p-alt">${esc(item.surPlace ? BB.t('surPlace') : BB.t('priceOnSite'))}</span></span>`;
    return `<span class="price"><span class="p-main">${esc(BB.fmtPriceL(item.price))}</span></span>`;
  }

  function tagsHTML(item) {
    const t = [];
    const tag = (cls, txt, ic) => `<span class="${cls}" role="img" title="${esc(txt)}" aria-label="${esc(txt)}">${icon(ic)}</span>`;
    if (item.veggie) t.push(tag('tag', BB.t('veggie'), 'i-feuille'));
    if (item.raw) t.push(tag('tag', BB.t('raw'), 'i-lait-cru'));
    if (item.spicy) t.push(tag('tag hot', BB.t('spicy'), 'i-piment'));
    if (item.homemade) t.push(tag('tag', BB.t('homemade'), 'i-dessert'));
    if (item.local) t.push(tag('tag', BB.t('local'), 'i-pin'));
    return t.length ? `<span class="tags">${t.join('')}</span>` : '';
  }

  function burgerCard(item) {
    const b = el('button', 'bcard reveal');
    b.type = 'button';
    b.dataset.open = item.id;
    b.setAttribute('data-sfx', 'open');
    b.innerHTML = `${tagsHTML(item)}<div class="vis" data-id="${item.id}"><div class="ph">${icon('i-burger')}</div></div>
      <h4>${esc(BB.t('ti'))} ${esc(BB.tr(item.name))}</h4>${priceHTML(item)}`;
    return b;
  }

  const commandable = (item) => item.price != null || !!item.variants;
  function platCard(item) {
    const b = el('button', 'bcard reveal' + (commandable(item) ? '' : ' sur-place'));
    b.type = 'button';
    b.dataset.open = item.id;
    b.setAttribute('data-sfx', 'open');
    const cat = BB.CATS.find((c) => c.id === item.cat);
    b.innerHTML = `${tagsHTML(item)}<div class="vis" data-id="${item.id}"><div class="ph">${icon(cat ? cat.icon : 'i-burger')}</div></div>
      <h4>${esc(BB.tr(item.name))}</h4>${priceHTML(item)}`;
    return b;
  }
  function itemRow(item) {
    const addable = commandable(item);
    const li = el('li', 'reveal');
    const b = el(addable ? 'button' : 'div', 'item' + (addable ? '' : ' plain'));
    if (addable) { b.type = 'button'; b.dataset.open = item.id; b.setAttribute('data-sfx', 'open'); }
    const mini = [];
    if (item.sides) mini.push(`<span>${icon('i-frites')}${esc(BB.tr(BB.SIDES).replace(/\.$/, ''))}</span>`);
    if (item.raw) mini.push(`<span>${icon('i-lait-cru')}${esc(BB.t('raw'))}</span>`);
    if (item.homemade) mini.push(`<span>${icon('i-dessert')}${esc(BB.t('homemade'))}</span>`);
    if (item.local) mini.push(`<span>${icon('i-pin')}${esc(BB.t('local'))}</span>`);
    b.innerHTML = `<h4>${esc(BB.tr(item.name))}</h4>${priceHTML(item)}
      ${item.desc ? `<p>${esc(BB.tr(item.desc))}</p>` : ''}${mini.length ? `<span class="mini">${mini.join('')}</span>` : ''}`;
    li.appendChild(b);
    return li;
  }

  function renderMenu() {
    const menu = $('#menu');
    if (!menu) return;
    live.forEach((b) => { try { b.destroy && b.destroy(); } catch (e) { /* déjà parti */ } });
    live.clear();
    menu.innerHTML = '';
    BB.CATS.forEach((cat) => {
      const sec = el('section', 'menu-sec');
      sec.id = 'm-' + cat.id;
      sec.innerHTML = `<h3 class="reveal">${icon(cat.icon)}${esc(BB.tr(cat.name))}</h3>`;
      if (cat.id === 'burgers') {
        sec.appendChild(el('p', 'sec-note', esc(BB.t('burgersNote'))));
        const grid = el('div', 'grid-burgers');
        BB.BURGER_LIST.forEach((it) => grid.appendChild(burgerCard(it)));
        sec.appendChild(grid);
      } else {
        const items = BB.MENU_OTHER.filter((it) => it.cat === cat.id);
        const vignettes = items.filter(dessine), lignes = items.filter((it) => !dessine(it));
        if (vignettes.length) {
          const grid = el('div', 'grid-burgers grid-plats');
          vignettes.forEach((it) => grid.appendChild(platCard(it)));
          sec.appendChild(grid);
        }
        if (lignes.length) {
          const ul = el('ul', 'list-items');
          lignes.forEach((it) => ul.appendChild(itemRow(it)));
          sec.appendChild(ul);
        }
        if (cat.id === 'boissons') sec.appendChild(el('p', 'fine alcool-note', esc(BB.t('alcool'))));
      }
      menu.appendChild(sec);
    });
    menu.querySelectorAll('.bcard .vis').forEach(lazyBurger);
  }

  function renderChips() {
    const nav = $('#chips');
    if (!nav) return;
    nav.innerHTML = '';
    BB.CATS.forEach((cat, i) => {
      const c = el('button', 'chip' + (i === 0 ? ' is-on' : ''), `${icon(cat.icon)}<span>${esc(BB.tr(cat.name))}</span>`);
      c.type = 'button';
      c.dataset.cat = cat.id;
      c.setAttribute('data-sfx', 'tab');
      c.dataset.sfxI = String(i);
      c.addEventListener('click', () => {
        const sec = document.getElementById('m-' + cat.id);
        const sc = $('#carte-scroll');
        if (sec && sc) {
          lockSpy = true;
          sc.scrollTo({ top: sec.offsetTop - 56, behavior: BB.reduced ? 'auto' : 'smooth' });
          setTimeout(() => { lockSpy = false; }, 700);
        }
        setChip(cat.id);
      });
      nav.appendChild(c);
    });
  }
  let lockSpy = false;
  function setChip(id) {
    document.querySelectorAll('#chips .chip').forEach((c) => {
      const on = c.dataset.cat === id;
      c.classList.toggle('is-on', on);
      // on fait défiler la seule rangée de puces (scrollIntoView ferait aussi défiler la carte et annulerait le saut vers la rubrique)
      if (on && c.parentElement) {
        const nav = c.parentElement;
        nav.scrollTo({ left: Math.max(0, c.offsetLeft - (nav.clientWidth - c.clientWidth) / 2), behavior: BB.reduced ? 'auto' : 'smooth' });
      }
    });
  }
  function spy() {
    const sc = $('#carte-scroll');
    if (!sc) return;
    let raf = 0;
    sc.addEventListener('scroll', () => {
      if (raf || lockSpy) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = sc.scrollTop + 90;
        let cur = BB.CATS[0].id;
        BB.CATS.forEach((c) => { const s = document.getElementById('m-' + c.id); if (s && s.offsetTop <= y) cur = c.id; });
        setChip(cur);
      });
    }, { passive: true });
  }

  /* ---------- les incontournables de l'accueil ---------- */
  function renderSignatures() {
    const row = $('#sig-row');
    if (!row) return;
    row.innerHTML = '';
    BB.BURGER_LIST.filter((b) => b.signature).forEach((item) => {
      const c = el('button', 'sig-card');
      c.type = 'button';
      c.dataset.open = item.id;
      c.setAttribute('data-sfx', 'open');
      c.innerHTML = `<div class="vis" data-id="${item.id}"><div class="ph">${icon('i-burger')}</div></div>
        <h3>${esc(BB.t('ti'))} ${esc(BB.tr(item.name))}</h3><p>${esc(BB.tr(item.tagline))}</p>${priceHTML(item)}`;
      row.appendChild(c);
      lazyBurger(c.querySelector('.vis'));
    });
  }

  /* ---------- la fiche d'un plat ---------- */
  const sheet = { item: null, double: false, veggie: false, qty: 1, burger: null, variant: null };
  const variante = () => (sheet.item && sheet.item.variants ? sheet.item.variants.find((v) => v.id === sheet.variant) || sheet.item.variants[0] : null);

  function unitPrice() {
    const it = sheet.item;
    if (it.variants) return variante().price;
    if (it.cat === 'burgers') return sheet.double ? it.double : it.price;
    return it.price;
  }
  function optionLabel() {
    const it = sheet.item;
    if (it.cat !== 'burgers' && !it.burger) return '';
    const parts = [];
    if (it.cat === 'burgers' && sheet.double) parts.push(BB.t('double'));
    if (it.veggie || it.burger) parts.push(sheet.veggie ? BB.t('galette') : BB.t('steak'));
    return parts.join(' · ');
  }
  function refreshSheet(redraw) {
    const it = sheet.item;
    const isBurger = it.cat === 'burgers';
    $('#p-name').textContent = (isBurger ? (sheet.double ? '' : BB.t('ti') + ' ') : '') + BB.tr(it.name);
    $('#p-tagline').textContent = it.tagline ? BB.tr(it.tagline) : '';
    $('#p-tagline').hidden = !it.tagline;
    $('#p-desc').textContent = isBurger ? BB.burgerDesc(it, BB.lang, sheet.double) : BB.tr(it.desc || '');
    const notes = [];
    if (isBurger || it.sides) notes.push(`<li class="frites">${icon('i-frites')}<span>${esc(BB.tr(BB.SIDES))}</span></li>`);
    // le tampon, à droite du nom : dessiné une fois par langue, montré pour tout ce qui vient avec des frites
    const tp = $('#p-tampon');
    tp.hidden = !(isBurger || it.sides);
    if (!tp.hidden && tp.dataset.lang !== BB.lang) { tp.innerHTML = tamponFrites(); tp.dataset.lang = BB.lang; }
    if (!tp.dataset.son) {
      tp.dataset.son = '1';
      tp.addEventListener('animationstart', (e) => { if (e.animationName === 'empreinte' && BB.sfx) BB.sfx.play('stamp', { gain: 0.8 }); });
    }
    if (it.raw) notes.push(`<li>${icon('i-lait-cru')}<span>${esc(BB.tr(BB.RAW[it.raw]))}</span></li>`);
    const v = variante();
    const al = [...new Set([...BB.allergens(it), ...((v && v.allergens) || [])])];
    if (al.length) notes.push(`<li>${icon('i-fromage')}<span>${esc(BB.t('allergens', { a: BB.liste(al.map((a) => BB.tr(BB.ALLERGEN_LABELS[a]))) }))}</span></li>`);
    if (it.alcool) notes.push(`<li class="alcool">${icon('i-biere')}<span>${esc(BB.t('alcool'))}</span></li>`);
    $('#p-notes').innerHTML = notes.join('');
    $('#p-count').textContent = String(sheet.qty);
    // un plat servi seulement sur place : pas de quantité ni d'ajout, une mention à la place
    const ok = commandable(it);
    $('#p-qty').hidden = !ok;
    $('#p-add').hidden = !ok;
    $('#p-surplace').hidden = ok;
    if (!ok) $('#p-surplace').textContent = BB.t('surPlaceLong');
    $('#p-price').textContent = BB.fmtPriceL(unitPrice() * sheet.qty);
    // options
    const opts = $('#p-options');
    opts.innerHTML = '';
    if (isBurger) opts.appendChild(seg('format', [['ti', BB.t('ti') + ' ' + BB.tr(it.name) + '\n' + BB.fmtPriceL(it.price)], ['double', BB.tr(it.name) + ' ' + BB.t('double').toLowerCase() + '\n' + BB.fmtPriceL(it.double)]], sheet.double ? 'double' : 'ti', (v) => { sheet.double = v === 'double'; refreshSheet(true); }));
    if (it.variants) opts.appendChild(choix(it));
    if (it.veggie || it.burger) opts.appendChild(seg('patty', [['steak', BB.t('steakShort')], ['galette', BB.t('galetteShort')]], sheet.veggie ? 'galette' : 'steak', (v) => { sheet.veggie = v === 'galette'; refreshSheet(true); }, it.id === 'vegetario'));
    if (redraw) drawSheetVisual();
  }
  // le choix d'une bière, d'un vin, d'un soft : une liste de boutons radio (clavier et lecteurs d'écran natifs)
  function choix(it) {
    const f = el('fieldset', 'choix');
    const cur = variante();
    f.innerHTML = `<legend>${esc(BB.t('choix'))}</legend>` + it.variants.map((v) => `<label class="choix-opt">
        <input type="radio" name="variante" value="${esc(v.id)}"${v === cur ? ' checked' : ''}>
        <span class="c-nom">${esc(BB.tr(v.name))}</span>${v.desc ? `<span class="c-desc">${esc(BB.tr(v.desc))}</span>` : ''}
        <span class="c-prix">${esc(BB.fmtPriceL(v.price))}</span></label>`).join('');
    f.addEventListener('change', (e) => {
      if (!e.target.matches('input[name="variante"]')) return;
      sheet.variant = e.target.value;
      const v = variante();
      if (sheet.burger && sheet.burger.setVariant && v) sheet.burger.setVariant(v.teinte || v.id, BB.tr(v.name));
      BB.sfx && BB.sfx.play('tab', { i: it.variants.findIndex((x) => x.id === sheet.variant) });
      $('#p-price').textContent = BB.fmtPriceL(unitPrice() * sheet.qty);
    });
    return f;
  }
  function seg(name, choices, value, onChange, lockOnly) {
    const s = el('div', 'seg');
    s.setAttribute('role', 'radiogroup');
    choices.forEach(([v, label], i) => {
      if (lockOnly && v !== 'galette') return;
      const b = el('button', null, `<span>${esc(label)}</span>`);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v === value || !!lockOnly));
      b.setAttribute('data-sfx', 'tab');
      b.dataset.sfxI = String(i + 1);
      b.addEventListener('click', () => { if (v !== value) onChange(v); });
      s.appendChild(b);
    });
    return s;
  }
  function drawSheetVisual() {
    const vis = $('#p-visual');
    if (sheet.burger) { try { sheet.burger.destroy(); } catch (e) { /* */ } live.delete(sheet.burger); sheet.burger = null; }
    vis.innerHTML = '';
    const it = sheet.item;
    const isBurger = it.cat === 'burgers' || it.burger;
    const plat = !isBurger && BB.Plat && BB.hasPlat && BB.hasPlat(it.id);
    vis.classList.toggle('small', !isBurger && !plat);
    if (plat) {
      const cat = BB.CATS.find((c) => c.id === it.cat);
      vis.innerHTML = `<div class="ph">${icon(cat ? cat.icon : 'i-burger')}</div>`;
      vis.classList.add('vis');
      sonsJusqua = performance.now() + 12000;
      sheet.burger = mountPlat(vis, it, { size: 'hero', labels: true, interactive: true, autoplay: true, variant: teinteDe(it, variante()), onEvent: sonAssemblage });
    } else if (isBurger) {
      vis.innerHTML = `<div class="ph">${icon('i-burger')}</div>`;
      vis.classList.add('vis');
      sonsJusqua = performance.now() + 12000;
      sheet.burger = mountBurger(vis, it, { size: 'hero', labels: true, interactive: true, autoplay: true, onEvent: sonAssemblage }, { double: sheet.double, veggie: sheet.veggie || it.id === 'vegetario' });
    } else {
      const cat = BB.CATS.find((c) => c.id === it.cat);
      vis.innerHTML = `<div class="ph">${icon(cat ? cat.icon : 'i-burger')}</div>`;
      vis.classList.add('vis');
    }
  }

  function openSheet(id) {
    const it = byId.get(id);
    if (!it || !(commandable(it) || dessine(it))) return;
    sheet.item = it;
    sheet.variant = it.variants ? it.variants[0].id : null;
    const pb = document.querySelector('#sheet-product .p-body');
    if (pb) pb.scrollTop = 0;
    sheet.double = false;
    sheet.veggie = it.id === 'vegetario';
    sheet.qty = 1;
    refreshSheet(false);
    BB.openSheet('#sheet-product', () => {
      if (sheet.burger) { try { sheet.burger.destroy(); } catch (e) { /* */ } live.delete(sheet.burger); sheet.burger = null; }
    });
    requestAnimationFrame(drawSheetVisual);
  }
  BB.openProduct = openSheet;

  function initSheet() {
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]');
      if (b) openSheet(b.dataset.open);
    });
    $('#p-qty').addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b || !sheet.item) return;
      sheet.qty = BB.clamp(sheet.qty + Number(b.dataset.step), 1, 20);
      refreshSheet(false);
    });
    $('#p-add').addEventListener('click', () => {
      const it = sheet.item;
      if (!it) return;
      const v = variante();
      BB.shop.add({
        id: it.id + (v ? ':' + v.id : '') + (sheet.double ? ':double' : '') + (sheet.veggie ? ':galette' : ''),
        variant: v ? v.id : null,
        name: v ? BB.tr(v.name) : (it.cat === 'burgers' && !sheet.double ? BB.t('ti') + ' ' : '') + BB.tr(it.name),
        nameObj: it.name, base: it.id, option: optionLabel(), double: sheet.double, veggie: sheet.veggie,
        unit: unitPrice(), qty: sheet.qty,
      });
      BB.sfx.play('add');
      BB.closeSheet('#sheet-product');
    });
  }

  BB.carte = {
    init() {
      try { document.fonts.load("12px 'Alfa Slab One'"); } catch (e) { /* la police du tampon, chargée d'avance */ }
      renderChips();
      renderMenu();
      renderSignatures();
      spy();
      initSheet();
      BB.on('lang', () => {
        renderChips(); renderMenu(); renderSignatures();
        if (sheet.item && !$('#sheet-product').hidden) refreshSheet(false);
        live.forEach((b) => b.setLang && b.setLang(BB.lang));
      });
      // les dessins de burgers arrivent (script chargé tard) : on remonte les cartes
      BB.on('burgers-ready', () => { renderMenu(); renderSignatures(); });
    },
  };
})();
