/* ==========================================================================
   Bougnat Burger — la carte de fidélité : la chaîne des Puys du nord au sud, de la Louchadière au puy de Dôme,
   six puys à cadeau, et le petit bougnat (celui du film) qui marche de puy en puy au fil des points.
   · Un point par personne et par venue : au comptoir, François scanne le QR code du client et saisit
     le nombre de personnes (le comptoir, admin/) ; ici, des boutons « maquette » le simulent aussi.
   · Inscription : prénom, nom, téléphone. Les cartes passent par BB.fidApi (bb-fid-api.js) : gardées dans le
     navigateur pour la maquette, au restaurant en production ; le panneau du comptoir (admin/) y ajoute les points.
   · Paliers et cadeaux : BB.FIDELITE (bb-data.js).
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (n) => Math.round(n * 10) / 10;
  const svgEl = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };

  const F = () => BB.FIDELITE;
  const MAX = () => F().pas * F().paliers.length;
  const api = BB.fidApi;
  let carte = null; // { id, prenom, nom, tel, cree, points, remis, passages: [{ d, n }] } (bb-fid-api.js)
  // jusqu'où le bougnat a déjà marché sur ce téléphone : il repart de là à la prochaine ouverture
  const vu = () => (carte ? Math.min(BB.store.get('fid-vu:' + carte.id, 0), carte.points) : 0);
  const marquerVu = () => { if (carte) BB.store.set('fid-vu:' + carte.id, carte.points); rendreEtat(); };

  /* ---------- la chaîne des Puys, du nord au sud : de la Louchadière au puy de Dôme ----------
     Treize puys dans leur ordre réel, chacun avec sa forme (cône de scories et son cratère, cône égueulé,
     dôme de lave en cloche, le puy de Dôme et son antenne) et son altitude ; relief exagéré (×3 environ),
     comme sur les tables d'orientation. Les six puys à cadeau portent un palier (BB.FIDELITE.paliers).
     La bande est plus large que l'écran : on la fait glisser, et elle suit le bougnat quand il marche. */
  const W = 1780, H = 212, SOL = 198, X0 = 40;
  // altitude (m) → hauteur dans le dessin ; au-dessus de 1 300 m on tasse un peu, pour que le Dôme tienne sous les noms
  const haut = (alt) => (Math.min(alt, 1300) - 920) * 0.3 + Math.max(0, alt - 1300) * 0.19;
  const PUYS = [
    { nom: 'Puy de la Louchadière', alt: 1200, x: 174, w: 78, type: 'cone', top: 0.2, cratere: 0.1, egueule: -1, foret: 0.9, palier: 0 },
    { nom: 'Puy de Jume', alt: 1162, x: 300, w: 48, type: 'cone', top: 0.14, foret: 1 },
    { nom: 'Puy de la Coquille', alt: 1153, x: 383, w: 42, type: 'cone', top: 0.18, foret: 1 },
    { nom: 'Puy Chopine', alt: 1181, x: 478, w: 40, type: 'dome', k: 0.55, foret: 0.45, palier: 1 },
    { nom: 'Puy des Gouttes', alt: 1137, x: 582, w: 52, type: 'cone', top: 0.24, cratere: 0.08, foret: 1 },
    { nom: 'Grand Suchet', alt: 1233, x: 706, w: 64, type: 'cone', top: 0.2, cratere: 0.06, foret: 0.8 },
    { nom: 'Puy de Côme', alt: 1253, x: 860, w: 88, type: 'cone', top: 0.24, cratere: 0.07, foret: 0.95, palier: 2 },
    { nom: 'Puy de Clierzou', alt: 1185, x: 996, w: 48, type: 'dome', k: 0.8, foret: 1 },
    { nom: 'Puy de Pariou', alt: 1209, x: 1116, w: 66, type: 'cone', top: 0.26, cratere: 0.14, foret: 0.2, palier: 3 },
    { nom: 'Puy des Goules', alt: 1146, x: 1246, w: 52, type: 'cone', top: 0.2, cratere: 0.08, foret: 0.7 },
    { nom: 'Grand Sarcoui', alt: 1147, x: 1348, w: 42, type: 'dome', k: 0.45, foret: 0.3, palier: 4 },
    { nom: 'Petit Puy de Dôme', alt: 1288, x: 1498, w: 58, type: 'cone', top: 0.22, cratere: 0.1, foret: 0 },
    { nom: 'Puy de Dôme', alt: 1465, x: 1648, w: 100, type: 'pdd', foret: 0.3, palier: 5, dxCadeau: -14 },
  ];
  PUYS.forEach((p) => { p.h = haut(p.alt); });
  const CADEAUX = PUYS.filter((p) => p.palier != null).sort((a, b) => a.palier - b.palier);
  const plateau = (x) => 18 + 3 * Math.sin(x * 0.011) + 2 * Math.sin(x * 0.027 + 1.3);
  const lisse = (v) => v * v * (3 - 2 * v);
  function forme(p, x) {
    const u = (x - p.x) / p.w, a = Math.abs(u);
    if (a >= 1) return 0;
    let t;
    if (p.type === 'dome') t = Math.pow(1 - a * a, p.k); // dôme de lave : une cloche
    else if (p.type === 'pdd') { // le puy de Dôme : large, épaulé, plus raide côté sud
      const b = u < 0 ? a * 1.04 : a * 0.96;
      t = b >= 1 ? 0 : Math.pow(1 - Math.pow(b, 2.2), 1.25);
    } else { // cône de scories : flancs droits, rebord du cratère, pied qui s'évase
      t = a <= p.top ? 1 : lisse(1 - (a - p.top) / (1 - p.top));
      if (p.cratere && a < p.top) t -= p.cratere * (1 - (a / p.top) ** 2);
      if (p.egueule && u * p.egueule > 0) t -= 0.24 * Math.exp(-(((a - p.top * 0.7) / 0.2) ** 2)); // le cratère ouvert d'un côté
    }
    const base = plateau(p.x);
    return base + (p.h - base) * Math.max(0, t);
  }
  function relief(x) { // la ligne de crête en x (y du dessin)
    let best = plateau(x);
    PUYS.forEach((p) => { if (Math.abs(x - p.x) < p.w) best = Math.max(best, forme(p, x)); });
    return SOL - best;
  }
  const domine = (p, x) => forme(p, x) >= SOL - relief(x) - 0.01;
  const sommet = (p) => ({ x: p.x, y: SOL - p.h });
  // la position du bougnat pour un nombre de points : d'un puy à cadeau au suivant, posé sur la crête
  function position(pts) {
    const pas = F().pas;
    const p = Math.max(0, Math.min(MAX(), pts));
    const k = Math.min(CADEAUX.length - 1, Math.floor(p / pas));
    const xa = k === 0 ? X0 : CADEAUX[k - 1].x, xb = CADEAUX[k].x;
    const x = p >= MAX() ? CADEAUX[CADEAUX.length - 1].x : xa + (xb - xa) * ((p - k * pas) / pas);
    return { x, y: relief(x) };
  }
  const crete = (xa, xb, pas = 2) => {
    let d = '';
    for (let x = xa; x <= xb + 0.01; x += pas) d += (d ? 'L' : 'M') + f1(x) + ' ' + f1(relief(Math.min(x, xb)));
    return d;
  };
  const altTxt = (m) => new Intl.NumberFormat('fr-FR').format(m).replace(/\s/g, ' ') + ' m';

  /* ---------- le dessin de la carte ---------- */
  const S = {}; // éléments vivants
  function dessiner() {
    const fig = $('#fid-carte');
    if (!fig) return;
    fig.innerHTML = '';
    const piste = document.createElement('div');
    piste.className = 'fid-piste';
    fig.appendChild(piste);
    S.piste = piste;
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'fid-svg', 'aria-hidden': 'true' }, piste);
    svg.style.aspectRatio = `${W} / ${H}`;
    const defs = svgEl('defs', {}, svg);
    defs.innerHTML = `
      <linearGradient id="fid-ciel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C2238"/><stop offset=".38" stop-color="#6E4757"/><stop offset=".66" stop-color="#E2AFA4"/><stop offset=".9" stop-color="#F9DE9E"/></linearGradient>
      <linearGradient id="fid-puys" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7C8A3A"/><stop offset=".5" stop-color="#5D6A2A"/><stop offset="1" stop-color="#3F4A1C"/></linearGradient>
      <radialGradient id="fid-soleil"><stop offset="0" stop-color="#FFF1C6"/><stop offset=".55" stop-color="#F9DE9E" stop-opacity=".85"/><stop offset="1" stop-color="#F2B48C" stop-opacity="0"/></radialGradient>
      <linearGradient id="fid-brume" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F2C9B0" stop-opacity="0"/><stop offset="1" stop-color="#F2C9B0" stop-opacity=".35"/></linearGradient>`;
    const g = svgEl('g', {}, svg);
    svgEl('rect', { width: W, height: H, fill: 'url(#fid-ciel)' }, g);
    // les étoiles du haut du ciel, le soleil couchant derrière le puy de Dôme
    const r = BB.rng ? BB.rng(7) : Math.random;
    for (let i = 0; i < 100; i++) svgEl('circle', { cx: f1(r() * W), cy: f1(r() * 60), r: f1(0.35 + r() * 0.75), fill: '#FFF6D8', opacity: f1(0.2 + r() * 0.5) }, g);
    svgEl('circle', { cx: 1690, cy: 92, r: 96, fill: 'url(#fid-soleil)' }, g);
    svgEl('circle', { cx: 1690, cy: 92, r: 22, fill: '#FFE7B0', opacity: 0.95 }, g);
    // au loin : les monts Dore, puis une première ligne de collines, en aplats lavés, et la brume du soir
    const loin = (y0, a, f, ph, col, op) => {
      let d = `M0 ${H}`;
      for (let x = 0; x <= W; x += 6) d += `L${x} ${f1(y0 - a * (0.5 + 0.5 * Math.sin(x * f + ph)) * (0.6 + 0.4 * Math.sin(x * f * 2.7 + ph * 2)))}`;
      svgEl('path', { d: d + `L${W} ${H}Z`, fill: col, opacity: op }, g);
    };
    loin(160, 38, 0.009, 2.2, '#B6A9C0', 0.5);
    loin(172, 20, 0.022, 0.4, '#9A98AE', 0.55);
    svgEl('rect', { y: 120, width: W, height: 80, fill: 'url(#fid-brume)' }, g);
    // la chaîne
    svgEl('path', { d: crete(0, W) + `L${W} ${H}L0 ${H}Z`, fill: 'url(#fid-puys)' }, g);
    PUYS.forEach((p) => {
      // le flanc tourné vers le couchant (à droite) éclairé, l'autre dans l'ombre
      let clair = '';
      for (let x = p.x; x <= p.x + p.w; x += 2) if (domine(p, x)) clair += `${clair ? 'L' : 'M'}${f1(x)} ${f1(relief(x))}`;
      if (clair) svgEl('path', { d: clair + `L${f1(p.x + p.w * 0.6)} ${SOL + 8}L${f1(p.x + p.w * 0.06)} ${SOL + 8}Z`, fill: '#A3B061', opacity: p.foret > 0.6 ? 0.18 : 0.3 }, g);
      let ombre = '';
      for (let x = p.x - p.w; x <= p.x - p.w * 0.08; x += 2) if (domine(p, x)) ombre += `${ombre ? 'L' : 'M'}${f1(x)} ${f1(relief(x) + 1)}`;
      if (ombre) svgEl('path', { d: ombre + `L${f1(p.x - p.w * 0.14)} ${SOL + 8}L${f1(p.x - p.w * 0.85)} ${SOL + 8}Z`, fill: '#252B12', opacity: 0.24 }, g);
    });
    // les forêts : des houppiers serrés sur les flancs boisés (Côme, Jume, la Coquille…), pas sur les puys d'herbe
    const bois = svgEl('g', {}, g);
    const rb = BB.rng ? BB.rng(23) : Math.random;
    PUYS.forEach((p) => {
      if (!p.foret) return;
      const limite = plateau(p.x) + (p.h - plateau(p.x)) * p.foret;
      for (let x = p.x - p.w * 0.97; x <= p.x + p.w * 0.97; x += 2.6) {
        if (!domine(p, x)) continue;
        const y = relief(x), hauteur = SOL - y;
        if (hauteur > limite) continue;
        for (let rang = 0; rang < 3; rang++) {
          const yy = y + 2 + rang * 5 + rb() * 2;
          if (yy > SOL + 4) break;
          svgEl('circle', { cx: f1(x + (rb() - 0.5) * 2), cy: f1(yy), r: f1(2 + rb() * 1.4), fill: rb() < 0.5 ? '#34401A' : '#3F4A1C', opacity: f1(0.8 - rang * 0.2) }, bois);
        }
      }
    });
    svgEl('path', { d: crete(0, W), fill: 'none', stroke: '#C8E3A0', 'stroke-width': 1.2, 'stroke-linejoin': 'round', opacity: 0.5 }, g);
    // le puy de Dôme : le chemin des Muletiers en lacets, l'observatoire, l'antenne et son feu
    const dome = PUYS[PUYS.length - 1], ds = sommet(dome);
    // (la demi-largeur du Dôme à une hauteur donnée, côté est : on inverse sa forme)
    const base = plateau(dome.x);
    const demi = (hh) => dome.w * Math.pow(Math.max(0, 1 - Math.pow(Math.max(0, (hh - base) / (dome.h - base)), 1 / 1.25)), 1 / 2.2) / 0.96;
    let lacets = '';
    for (let k = 0; k <= 10; k++) {
      const hh = base + 10 + k * ((dome.h - base - 18) / 10);
      const l = demi(hh);
      lacets += `${k ? 'L' : 'M'}${f1(dome.x + l * (k % 2 ? 0.5 : 0.82))} ${f1(SOL - hh)}`;
    }
    svgEl('path', { d: lacets, fill: 'none', stroke: '#F5EAD4', 'stroke-width': 0.5, opacity: 0.32, 'stroke-linejoin': 'round' }, g);
    const xo = dome.x - 34, yo = relief(xo);
    svgEl('rect', { x: xo - 4, y: f1(yo - 3), width: 8, height: 4, fill: '#D8C6A8' }, g);
    svgEl('path', { d: `M${xo - 4} ${f1(yo - 3)}l4-2.2 4 2.2z`, fill: '#D8C6A8' }, g);
    svgEl('rect', { x: dome.x + 4.2, y: f1(ds.y - 24), width: 2.2, height: 24.5, fill: '#F5EAD4' }, g);
    svgEl('rect', { x: dome.x + 4.2, y: f1(ds.y - 18), width: 2.2, height: 3, fill: '#E5673A' }, g);
    svgEl('rect', { x: dome.x + 4.2, y: f1(ds.y - 10), width: 2.2, height: 3, fill: '#E5673A' }, g);
    S.feu = svgEl('circle', { cx: dome.x + 5.3, cy: f1(ds.y - 25.5), r: 1.5, fill: '#E5673A', class: 'fid-feu' }, g);
    // le sol de devant
    svgEl('path', { d: `M0 ${SOL + 6}C400 ${SOL - 1} 1000 ${SOL + 9} ${W} ${SOL + 3}V${H}H0Z`, fill: '#252B12' }, g);
    // le sentier : tout le chemin en pointillés crème, la part déjà faite en pomme
    const fin = CADEAUX[CADEAUX.length - 1].x;
    svgEl('path', { d: crete(X0, fin), fill: 'none', stroke: '#F5EAD4', 'stroke-width': 1.2, 'stroke-dasharray': '1.5 3.5', 'stroke-linecap': 'round', opacity: 0.6 }, g);
    S.fait = svgEl('path', { d: '', fill: 'none', stroke: '#C8E3A0', 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, g);
    // le départ : un panneau
    svgEl('path', { d: `M${X0} ${f1(relief(X0))}V${f1(relief(X0) - 14)}`, stroke: '#D8C6A8', 'stroke-width': 1.4 }, g);
    svgEl('path', { d: `M${X0} ${f1(relief(X0) - 14)}h12l3 3-3 3h-12z`, fill: '#D8C6A8' }, g);
    // les noms, comme sur une table d'orientation : en haut du ciel, sur deux rangs, reliés au sommet par de fins tirets
    const noms = svgEl('g', { class: 'fid-noms' }, g);
    S.cadeaux = [];
    PUYS.forEach((p, i) => {
      const s = sommet(p);
      const cadeau = p.palier != null;
      const yNom = i % 2 ? 36 : 14;
      const xc = p.x + (p.dxCadeau || 0);
      const bas = cadeau ? s.y - 26 : s.y - 4;
      svgEl('path', { d: `M${xc} ${yNom + 11}V${f1(bas)}`, class: 'fid-trait' }, noms);
      const t = svgEl('text', { x: xc, y: yNom, 'text-anchor': 'middle', class: 'fid-nom' + (cadeau ? ' cadeau' : '') }, noms);
      t.textContent = p.nom;
      const t2 = svgEl('text', { x: xc, y: yNom + 8.6, 'text-anchor': 'middle', class: 'fid-alt' }, noms);
      t2.textContent = altTxt(p.alt) + (cadeau ? ` · ${(p.palier + 1) * F().pas} pts` : '');
      if (!cadeau) return;
      // le cadeau, au sommet
      const c = svgEl('g', { class: 'fid-cadeau', transform: `translate(${xc} ${f1(s.y - 13)})` }, g);
      svgEl('circle', { r: 11.5, class: 'fid-halo' }, c);
      const boite = svgEl('g', { class: 'fid-boite' }, c);
      svgEl('use', { href: '#i-cadeau-net', x: -9, y: -9.5, width: 18, height: 18 }, boite);
      S.cadeaux[p.palier] = c;
    });
    // le bougnat
    S.perso = svgEl('g', { class: 'fid-perso' }, g);
    monterBougnat(S.perso);
    // « faites glisser » : l'indice, jusqu'au premier glissé
    if (!BB.store.get('fid-glisse', false)) {
      const h = document.createElement('span');
      h.className = 'fid-glisser';
      h.setAttribute('aria-hidden', 'true');
      h.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M3 12h18"/></svg>${esc(BB.t('fidGlisser'))}`;
      fig.appendChild(h);
      S.indice = h;
    }
    suivreGestes();
  }

  /* ---------- la bande qu'on fait glisser ; elle suit le bougnat quand il marche ---------- */
  let suivi = true;
  const echelle = () => (S.piste ? S.piste.clientHeight / H : 1);
  function cadrer(x, doux) {
    const pi = S.piste;
    if (!pi || !pi.clientWidth) return;
    const cible = Math.max(0, x * echelle() - pi.clientWidth * 0.42);
    if (doux && !BB.reduced) pi.scrollTo({ left: cible, behavior: 'smooth' }); else pi.scrollLeft = cible;
  }
  function suivreGestes() {
    const pi = S.piste;
    // la main de l'utilisateur reprend la main : on ne recadre plus jusqu'à la prochaine marche
    const lache = () => {
      suivi = false;
      if (S.indice) { S.indice.classList.add('parti'); BB.store.set('fid-glisse', true); setTimeout(() => S.indice && S.indice.remove(), 600); S.indice = null; }
    };
    ['touchstart', 'wheel'].forEach((ev) => pi.addEventListener(ev, lache, { passive: true }));
    // à la souris (ordinateur) : on attrape la bande et on la fait glisser
    let x0 = null, s0 = 0;
    pi.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      lache();
      x0 = e.clientX; s0 = pi.scrollLeft;
      pi.classList.add('tenu');
      pi.setPointerCapture(e.pointerId);
    });
    pi.addEventListener('pointermove', (e) => { if (x0 != null) pi.scrollLeft = s0 - (e.clientX - x0); });
    const fin = () => { x0 = null; pi.classList.remove('tenu'); };
    pi.addEventListener('pointerup', fin);
    pi.addEventListener('pointercancel', fin);
  }

  /* ---------- le bougnat : celui du film (bb-bougnat-dessin.js), de profil, qui marche ---------- */
  const B = { pts: 0, phase: 0, marche: 0, P: null, mid: null, mesure: false, salut: false };
  const HAUTEUR = 32; // en unités du dessin de la carte
  function monterBougnat(host) {
    B.P = null;
    const D = BB.BougnatDessin;
    B.mid = svgEl('g', {}, host);
    if (D && D.makeProfil) {
      try {
        const rot = svgEl('g', { transform: 'rotate(-90)' }, B.mid);
        B.P = D.makeProfil(rot);
        D.poseProfil(B.P, D.POSES.debout, 0, false);
        B.mesure = false;
        return;
      } catch (e) { console.warn('Bougnat indisponible', e); B.mid.innerHTML = ''; B.P = null; }
    }
    // repli : sa casquette et sa silhouette, en aplats
    B.mid.innerHTML = '<g transform="translate(-9 -40)"><path d="M3 14c0-6 3-10 7-10s7 4 7 10l-1 26H4z" fill="#3B527A"/><circle cx="10" cy="7" r="5" fill="#EEA785"/><path d="M4 5c1-4 10-5 13-1l3 1-3 1H4z" fill="#454C53"/><path d="M5 40h4V28H5zM11 40h4V28h-4z" fill="#484A50"/></g>';
    B.mesure = true;
  }
  // une fois la vue affichée : on mesure le dessin pour poser ses pieds sur la crête
  function mesurer() {
    if (B.mesure || !B.P || !B.mid) return;
    let b;
    try { b = B.mid.getBBox(); } catch (e) { return; }
    if (!b || !b.height) return;
    const s = HAUTEUR / b.height;
    B.mid.setAttribute('transform', `scale(${f1(s * 1000) / 1000}) translate(${f1(-(b.x + b.width * 0.5))} ${f1(-(b.y + b.height))})`);
    B.mesure = true;
  }
  function pose(t) {
    const D = BB.BougnatDessin;
    if (!B.P || !D) return;
    if (B.marche > 0) {
      const s = Math.sin(B.phase), c = Math.cos(B.phase);
      D.poseProfil(B.P, {
        bp: [178 + 26 * s, -18], bl: [178 - 26 * s, -18],
        jp: [178 - 26 * s, 6 + 40 * Math.max(0, c)], jl: [178 + 26 * s, 6 + 40 * Math.max(0, -c)],
        tete: 92, bouche: 0.15, yeux: 1, mp: 0.45, ml: 0.45, vent: 0,
      }, t, false);
    } else if (B.salut) { // pas encore de carte : il fait signe
      const o = Math.sin(t * 6) * 18;
      D.poseProfil(B.P, Object.assign({}, D.POSES.salut, { bp: [49 + o * 0.4, -41 + o], tete: 84, bouche: 0.45 }), t, false);
    } else D.poseProfil(B.P, D.POSES.debout, t, false);
  }
  function placer(pts, dy = 0) {
    const p = position(pts);
    S.perso.setAttribute('transform', `translate(${f1(p.x)} ${f1(p.y + dy)})`);
    if (suivi) cadrer(p.x);
    S.fait.setAttribute('d', pts > 0 ? crete(X0, p.x, 1.5) : '');
    const atteints = Math.floor(Math.min(pts, MAX()) / F().pas);
    S.cadeaux.forEach((c, i) => {
      c.classList.toggle('gagne', i < atteints);
      c.classList.toggle('prochain', carte && i === atteints);
    });
  }

  // l'animation : la marche d'un nombre de points à un autre, puis le repos (clignements, signe de la main)
  let raf = 0, tPrec = 0, cible = 0, quandFini = null, dernierRepos = 0;
  function boucle(now) {
    raf = 0;
    if (!actif()) return;
    const dt = Math.min(0.12, (now - (tPrec || now)) / 1000);
    tPrec = now;
    const t = now / 1000;
    mesurer();
    if (B.pts !== cible) {
      const v = Math.max(3, Math.abs(cible - B.pts) * 1.1, 0) * (BB.reduced ? 100 : 1); // points par seconde
      const avant = B.pts;
      B.pts = cible > B.pts ? Math.min(cible, B.pts + v * dt) : Math.max(cible, B.pts - v * dt);
      B.marche = 1;
      B.phase += dt * Math.PI * 2 * 1.7;
      // un palier franchi : le cadeau saute, coup de tampon
      const pas = F().pas;
      const kA = Math.floor(avant / pas), kB = Math.floor(B.pts / pas);
      if (kB > kA && kB <= F().paliers.length) palier(kB - 1);
      placer(B.pts, -Math.abs(Math.sin(B.phase)) * 1.2);
      // le compteur suit le bougnat
      const cpt = $('#fid-etat .fid-points b');
      if (cpt && cible > avant) cpt.textContent = BB.fmtNum(Math.floor(B.pts), 0);
      pose(t % 31);
      if (B.pts === cible) { B.marche = 0; placer(B.pts); pose(t % 31); if (quandFini) { const q = quandFini; quandFini = null; q(); } }
      raf = requestAnimationFrame(boucle);
      return;
    }
    // au repos : une image tous les 1/12 s suffit (clignements, la main qui salue)
    if (now - dernierRepos > 80) { dernierRepos = now; pose(t % 31); }
    raf = requestAnimationFrame(boucle);
  }
  const actif = () => {
    const v = document.getElementById('fidelite');
    return !!(v && v.classList.contains('is-active') && !document.hidden);
  };
  function relancer() { if (!raf && actif()) { tPrec = 0; raf = requestAnimationFrame(boucle); } }
  function allerA(pts, fini) {
    cible = Math.max(0, Math.min(MAX(), pts));
    suivi = true;
    quandFini = fini || null;
    relancer();
  }
  function palier(i) {
    const c = S.cadeaux && S.cadeaux[i];
    if (c) { c.classList.remove('saute'); void c.getBoundingClientRect(); c.classList.add('saute'); }
    BB.sfx && BB.sfx.play('stamp');
    BB.vibrate && BB.vibrate(20);
    const pal = F().paliers[i];
    if (pal && BB.toast) BB.toast(BB.t('fidCadeau', { c: BB.tr(pal.cadeau) }));
  }

  /* ---------- le texte, le QR code, les paliers, les passages ---------- */
  const minuscule = (s) => (BB.lang === 'zh' ? s : s.charAt(0).toLowerCase() + s.slice(1)); // (le nom du cadeau, en milieu de phrase)
  const ptsTxt = (n) => BB.t(n === 1 ? 'fidPt1' : n === 0 ? 'fidPt0' : 'fidPts', { n: BB.fmtNum(n, 0) });
  function rendreEtat() {
    const e = $('#fid-etat');
    if (!e) return;
    if (!carte) { e.innerHTML = `<p class="fid-invite-txt">${esc(BB.t('fidInvite'))}</p>`; return; }
    const pts = carte.points, pas = F().pas;
    const k = Math.floor(Math.min(pts, MAX()) / pas);
    const pal = F().paliers[k];
    const aRetirer = Math.min(k, F().paliers.length) - (carte.remis || 0);
    let suite;
    if (pts >= MAX()) suite = BB.t('fidDone');
    else suite = BB.t('fidNext', { n: ptsTxt((k + 1) * pas - pts), c: minuscule(BB.tr(pal.cadeau)), p: pal.puy });
    e.innerHTML = `<p class="fid-points"><b>${esc(BB.fmtNum(pts, 0))}</b><span>${esc(BB.t(pts === 1 || (pts === 0 && BB.lang === 'fr') ? 'fidMotPt1' : 'fidMotPts'))}</span></p>
      <p class="fid-suite">${esc(suite)}</p>
      ${aRetirer > 0 ? `<p class="fid-retirer"><svg aria-hidden="true"><use href="#i-cadeau"/></svg>${esc(BB.t(aRetirer > 1 ? 'fidRetirerN' : 'fidRetirer', { n: aRetirer }))}</p>` : ''}`;
  }
  function lienQR(id) {
    // le QR code mène au panneau du comptoir (admin/), qui ouvre la carte de ce client :
    // le téléphone du comptoir le lit avec l'appareil photo, sans appli
    const can = document.querySelector('link[rel="canonical"]');
    const base = (can && can.href) || location.origin + location.pathname.replace(/[^/]*$/, '');
    return base.replace(/\/?$/, '/') + 'admin/?carte=' + encodeURIComponent(id);
  }
  function rendreTicket() {
    const t = $('#fid-ticket');
    if (!t) return;
    t.hidden = !carte;
    if (!carte) return;
    const qr = $('#fid-qr');
    if (qr.dataset.id !== carte.id) {
      try { qr.innerHTML = BB.qrSVG(lienQR(carte.id), { sombre: '#1A130F' }); } catch (e) { qr.textContent = carte.id; }
      qr.dataset.id = carte.id;
    }
    $('#fid-qui-nom').textContent = `${carte.prenom} ${carte.nom}`;
    $('#fid-qui-num').textContent = BB.t('fidNum', { id: carte.id });
  }
  function rendrePaliers() {
    const ol = $('#fid-paliers');
    if (!ol) return;
    const pts = carte ? carte.points : 0, pas = F().pas;
    ol.innerHTML = F().paliers.map((p, i) => {
      const seuil = (i + 1) * pas;
      const gagne = carte && pts >= seuil;
      const prochain = carte && !gagne && pts >= i * pas;
      const etat = gagne && i < (carte.remis || 0) ? `<em class="ok">${esc(BB.t('fidRemis'))}</em>` : gagne ? `<em class="ok">${esc(BB.t('fidGagne'))}</em>` : prochain ? `<em>${esc(BB.t('fidReste', { n: ptsTxt(seuil - pts) }))}</em>` : '';
      return `<li class="${gagne ? 'gagne' : prochain ? 'prochain' : ''}">
        <span class="fid-pal-ic"><svg aria-hidden="true"><use href="#i-cadeau"/></svg></span>
        <span class="fid-pal-txt"><small>${esc(BB.t('fidPalier', { n: seuil, p: p.puy }))}</small><b>${esc(BB.tr(p.cadeau))}</b>${etat}</span>
      </li>`;
    }).join('');
  }
  function rendrePassages() {
    const ul = $('#fid-passages');
    if (!ul || !carte) return;
    const l = (carte.passages || []).slice().reverse();
    ul.innerHTML = l.length ? l.map((p) => {
      const d = new Date(p.d);
      return `<li><span>${esc(BB.fmtJour ? BB.fmtJour(d, true) : d.toLocaleDateString())}</span><b>${esc(BB.t(p.n > 1 ? 'fidPassageN' : 'fidPassage1', { n: p.n }))}</b></li>`;
    }).join('') : `<li class="vide">${esc(BB.t('fidVide'))}</li>`;
  }
  function rendre() {
    $('#fid-invite').hidden = !!carte;
    $('#fid-membre').hidden = !carte;
    rendreEtat();
    rendreTicket();
    rendrePaliers();
    rendrePassages();
    const sms = $('#fid-sms-m');
    if (sms && carte) sms.checked = !!carte.sms;
    B.salut = !carte;
  }

  /* ---------- l'inscription ---------- */
  const telNorm = (v) => BB.fidApi.telNorm(v);
  function initForm() {
    const form = $('#fid-form');
    if (!form) return;
    form.addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const prenom = $('#fid-prenom'), nom = $('#fid-nom'), tel = $('#fid-tel'), ok = $('#fid-accord');
      let bad = '';
      if (!prenom.value.trim()) { prenom.setAttribute('aria-invalid', 'true'); bad = bad || BB.t('fidNeedPrenom'); }
      if (!nom.value.trim()) { nom.setAttribute('aria-invalid', 'true'); bad = bad || BB.t('fidNeedNom'); }
      if (telNorm(tel.value).length < 10) { tel.setAttribute('aria-invalid', 'true'); bad = bad || BB.t('needPhone'); }
      if (!ok.checked) { ok.setAttribute('aria-invalid', 'true'); bad = bad || BB.t('fidNeedAccord'); }
      if (bad) { BB.sfx && BB.sfx.play('nope'); BB.toast && BB.toast(bad); return; }
      // les offres par SMS : une case à part, facultative, jamais cochée d'office
      const sms = $('#fid-sms');
      api.creer({ prenom: prenom.value, nom: nom.value, tel: tel.value, sms: !!(sms && sms.checked) }).then((c) => {
        carte = c;
        marquerVu();
        form.reset();
        BB.sfx && BB.sfx.play('stamp');
        BB.toast && BB.toast(BB.t('fidBienvenue', { n: carte.prenom }));
        rendre();
        const sc = $('#fidelite .view-scroll');
        if (sc) sc.scrollTo({ top: 0, behavior: BB.reduced ? 'auto' : 'smooth' });
      });
    });
  }

  /* ---------- des points arrivent : le bougnat se met en marche ----------
     Ils viennent du panneau du comptoir (admin/, un autre onglet dans la maquette) ou des boutons « maquette ». */
  function arrivee(c, son) {
    carte = c;
    if (son) BB.sfx && BB.sfx.play('add');
    rendrePassages();
    rendrePaliers();
    rendreTicket();
    if (!actif()) { rendreEtat(); return; } // (il marchera à la prochaine ouverture de l'onglet)
    const sc = $('#fidelite .view-scroll');
    const haut = sc && sc.scrollTop > 40;
    if (haut) sc.scrollTo({ top: 0, behavior: BB.reduced ? 'auto' : 'smooth' });
    setTimeout(() => allerA(carte.points, marquerVu), haut ? 450 : 60);
  }
  // des points arrivés quand la carte n'était pas à l'écran : il marche dès qu'on la regarde
  function rattraper() {
    if (!actif() || !carte || cible === carte.points) return;
    setTimeout(() => { if (carte && actif()) allerA(carte.points, marquerVu); }, 500);
  }
  // MAQUETTE : simuler un passage au comptoir
  function passage(n) {
    if (!carte || !(n > 0)) return;
    api.crediter(carte.id, n).then((c) => arrivee(c, true), () => BB.toast && BB.toast(BB.t('fidDone')));
  }
  function initMembre() {
    const demo = $('#fid-demo');
    if (demo) demo.addEventListener('click', (e) => { const b = e.target.closest('[data-scan]'); if (b) passage(Number(b.dataset.scan)); });
    // les offres par SMS : oui ou non, à tout moment (le comptoir n'écrit qu'à ceux qui ont dit oui)
    const sms = $('#fid-sms-m');
    if (sms) sms.addEventListener('change', () => {
      if (!carte) return;
      api.reglerSms(carte.id, sms.checked).then((c) => { carte = c; BB.toast && BB.toast(BB.t(c.sms ? 'fidSmsOui' : 'fidSmsNon')); });
    });
    // supprimer sa carte : deux touches (la seconde dans les 4 s)
    const q = $('#fid-quitter');
    if (q) q.addEventListener('click', () => {
      if (!q.classList.contains('confirme')) {
        q.classList.add('confirme');
        q._txt = q.innerHTML;
        q.textContent = BB.t('fidSupprConfirm');
        clearTimeout(q._t);
        q._t = setTimeout(() => { q.classList.remove('confirme'); q.innerHTML = q._txt; }, 4000);
        return;
      }
      clearTimeout(q._t);
      q.classList.remove('confirme');
      q.innerHTML = q._txt;
      api.supprimer(carte.id);
      carte = null;
      BB.toast && BB.toast(BB.t('fidSupprime'));
      B.pts = 0; cible = 0;
      rendre();
      placer(0);
      relancer();
    });
  }

  BB.fidelite = {
    init() {
      dessiner();
      initForm();
      initMembre();
      rendre();
      placer(0);
      // la carte de ce téléphone ; le bougnat reprend là où on l'avait laissé, puis marche jusqu'aux points du jour
      api.moi().then((c) => {
        carte = c;
        rendre();
        B.pts = vu();
        cible = B.pts;
        placer(B.pts);
        rattraper();
      });
      // un passage validé au comptoir pendant que la carte est ouverte (maquette : le panneau dans un autre onglet)
      api.onChange(() => api.moi().then((c) => {
        if (!c) { if (carte) { carte = null; B.pts = 0; cible = 0; rendre(); placer(0); } return; }
        if (!carte || c.points !== carte.points) arrivee(c, true); else { carte = c; rendre(); }
      }));
      BB.on('view', (v) => {
        if (v !== 'fidelite') return;
        requestAnimationFrame(() => {
          mesurer();
          if (suivi) cadrer(position(B.pts).x);
          pose(0);
          relancer();
          rattraper();
        });
      });
      document.addEventListener('visibilitychange', () => { relancer(); rattraper(); });
      BB.on('lang', rendre);
    },
    // pour les essais : BB.fidelite.passage(4)
    passage,
  };
})();
