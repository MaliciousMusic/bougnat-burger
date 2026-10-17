/* ==========================================================================
   Bougnat Burger — le comptoir : la carte.
   · Les prix (Ti et double pour les burgers, chaque bière, chaque vin…), changés d'un geste, partent sur le site.
   · « Épuisé aujourd'hui » : le plat reste sur la carte, grisé, sans bouton d'ajout ; il revient le lendemain.
   · « Masqué » : le plat disparaît de la carte du site jusqu'à ce qu'on le remette.
   · Les allergènes : déduits de la recette par le site ; le restaurant les corrige ici (c'est lui qui sait).
   Ajouter un plat neuf reste un travail de l'atelier : chaque plat a son dessin (bb-burger.js, bb-plat.js).
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const ad = BB.ad;
  const api = BB.restoApi.carte;
  const { $, esc, icon, toast, son, prix } = ad;

  let R = {}, cat = 'tous', q = '';
  const ouverts = new Set();
  const deduits = (it) => (BB.allergensDeduits || BB.allergens)(it);
  const nombre = (s) => { const n = Number(String(s).replace(/\s|€/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 && n < 1000 ? Math.round(n * 100) / 100 : null; };
  const champ = (n) => (n == null ? '' : n.toFixed(2).replace('.', ','));
  const sans = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  function prixHTML(it, cle, label, actuel, origine, vid) {
    const modifie = actuel !== origine;
    return `<label class="ad-prix${modifie ? ' modifie' : ''}"><span>${esc(label)}</span>
      <span class="ad-prix-champ"><input type="text" inputmode="decimal" value="${esc(champ(actuel))}" data-prix="${cle}" ${vid ? `data-variante="${esc(vid)}"` : ''} aria-label="${esc(label)} ${esc(it.name.fr)}"><i>€</i></span>
      ${modifie ? `<small>au lieu de ${esc(prix(origine))}</small>` : ''}</label>`;
  }
  function platHTML(it) {
    const r = R[it.id] || {}, o = api.origine(it.id);
    const epuise = api.estEpuise(r), cache = !!r.cache, modifie = !!R[it.id];
    const nomCat = (BB.CATS.find((c) => c.id === it.cat) || {}).name;
    let prixs = '';
    if (it.cat === 'burgers') prixs = prixHTML(it, 'price', 'Ti', r.price != null ? r.price : o.price, o.price) + prixHTML(it, 'double', 'Double', r.double != null ? r.double : o.double, o.double);
    else if (it.variants) {
      const ps = it.variants.map((v) => ((r.variants || {})[v.id] || {}).price ?? o.variants[v.id]), lo = Math.min(...ps), hi = Math.max(...ps);
      prixs = `<p class="ad-variantes-resume">${it.variants.length} choix, ${lo === hi ? `à ${esc(prix(lo))}` : `de ${esc(prix(lo))} à ${esc(prix(hi))}`}</p>`;
    }
    else if (o.price == null) prixs = '<p class="ad-variantes-resume">Sur place seulement : pas de prix en ligne.</p>';
    else prixs = prixHTML(it, 'price', 'Prix', r.price != null ? r.price : o.price, o.price);
    const nbEpuisees = it.variants ? it.variants.filter((v) => api.estEpuise((r.variants || {})[v.id])).length : 0;
    const ouvert = ouverts.has(it.id);
    return `<article class="ad-plat${epuise ? ' epuise' : ''}${cache ? ' cache' : ''}" data-id="${esc(it.id)}">
      <div class="tete"><b>${esc(it.name.fr)}</b><small>${esc(nomCat ? nomCat.fr : '')}</small>
        <span class="etats">${epuise ? '<em class="e-epuise">Épuisé</em>' : ''}${nbEpuisees && !epuise ? `<em class="e-epuise">${nbEpuisees} épuisé${nbEpuisees > 1 ? 's' : ''}</em>` : ''}${cache ? '<em class="e-cache">Masqué</em>' : ''}${modifie && !epuise && !cache && !nbEpuisees ? '<em class="e-modifie">Modifié</em>' : ''}</span></div>
      <div class="prixs">${prixs}</div>
      <div class="ad-actions">
        <button class="ad-bascule" type="button" data-act="epuise" aria-pressed="${epuise}">${epuise ? icon('i-ok') : ''}Épuisé aujourd'hui</button>
        <button class="ad-bascule" type="button" data-act="cache" aria-pressed="${cache}">${cache ? icon('i-ok') : ''}Masqué</button>
        <button class="ad-petit" type="button" data-act="details" aria-expanded="${ouvert}">${it.variants ? 'Choix et allergènes' : 'Allergènes'}</button>
      </div>
      ${ouvert ? detailsHTML(it, r, o) : ''}
    </article>`;
  }
  function detailsHTML(it, r, o) {
    const actuels = Array.isArray(r.allergenes) ? r.allergenes : deduits(it);
    const regles = Array.isArray(r.allergenes);
    let h = '<div class="ad-details">';
    if (it.variants) {
      h += '<h4>Les choix</h4><ul class="ad-variantes">' + it.variants.map((v) => {
        const rv = (r.variants || {})[v.id] || {};
        const ep = api.estEpuise(rv);
        return `<li class="${ep ? 'epuise' : ''}"><span class="nom">${esc(v.name.fr)}</span>${prixHTML(it, 'variante', 'Prix', rv.price != null ? rv.price : o.variants[v.id], o.variants[v.id], v.id)}
          <button class="ad-bascule" type="button" data-act="epuise-variante" data-variante="${esc(v.id)}" aria-pressed="${ep}">${ep ? icon('i-ok') : ''}Épuisé</button></li>`;
      }).join('') + '</ul>';
    }
    h += `<h4>Allergènes</h4><p class="ad-aide">${regles ? 'Réglés au comptoir.' : 'Déduits de la recette par le site : cochez ou décochez pour corriger.'}</p>
      <div class="ad-allergenes">${BB.ALLERGENES.map((a) => `<label class="ad-coche"><input type="checkbox" data-allergene="${a}" ${actuels.includes(a) ? 'checked' : ''}><span>${esc(BB.ALLERGEN_LABELS[a].fr)}</span></label>`).join('')}</div>`;
    if (R[it.id]) h += '<button class="ad-annuler" type="button" data-act="retablir">Rétablir ce plat comme sur la carte d\'origine</button>';
    return h + '</div>';
  }

  function visibles() {
    const m = sans(q.trim());
    return api.tous().filter((it) => (cat === 'tous' || it.cat === cat) && (!m || sans(it.name.fr).includes(m) || (it.variants || []).some((v) => sans(v.name.fr).includes(m))));
  }
  function rendre() {
    $('#carte-cats').innerHTML = [['tous', 'Tout'], ...BB.CATS.map((c) => [c.id, c.name.fr])].map(([id, nom]) => `<button type="button" class="ad-puce" data-cat="${id}" aria-pressed="${id === cat}">${esc(nom)}</button>`).join('');
    const l = visibles();
    $('#carte-liste').innerHTML = l.length ? l.map(platHTML).join('') : '<p class="ad-vide">Aucun plat ne correspond.</p>';
    compter();
  }
  function rendrePlat(id) {
    const a = document.querySelector(`.ad-plat[data-id="${CSS.escape(id)}"]`);
    const it = api.tous().find((x) => x.id === id);
    if (a && it) a.outerHTML = platHTML(it);
    compter();
  }
  function compter() {
    const n = Object.values(R).filter((r) => api.estEpuise(r) || Object.values(r.variants || {}).some((v) => api.estEpuise(v))).length;
    ad.pastille('carte', n, false);
  }
  async function regler(id, r, msg) {
    await api.regler(id, r);
    R = await api.reglages();
    rendrePlat(id);
    if (msg) toast(msg);
  }

  function initEvenements() {
    $('#carte-cats').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; son('tab'); rendre(); });
    $('#carte-cherche').addEventListener('submit', (e) => e.preventDefault());
    $('#carte-q').addEventListener('input', (e) => { q = e.target.value; clearTimeout(e.target._t); e.target._t = setTimeout(rendre, 150); });
    const liste = $('#carte-liste');
    liste.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const id = b.closest('[data-id]').dataset.id, it = api.tous().find((x) => x.id === id), r = R[id] || {};
      const act = b.dataset.act;
      if (act === 'epuise') { const oui = !api.estEpuise(r); son(oui ? 'down' : 'up'); regler(id, { epuise: oui ? api.aujourdhui() : null }, oui ? `${it.name.fr} : épuisé pour aujourd'hui.` : `${it.name.fr} est de nouveau disponible.`); }
      if (act === 'cache') { const oui = !r.cache; son(oui ? 'down' : 'up'); regler(id, { cache: oui }, oui ? `${it.name.fr} est masqué sur le site.` : `${it.name.fr} est de retour sur la carte.`); }
      if (act === 'details') { if (ouverts.has(id)) ouverts.delete(id); else ouverts.add(id); son('tab'); rendrePlat(id); }
      if (act === 'epuise-variante') {
        const vid = b.dataset.variante, v = Object.assign({}, (r.variants || {})[vid]);
        const oui = !api.estEpuise(v);
        v.epuise = oui ? api.aujourdhui() : null;
        son(oui ? 'down' : 'up');
        regler(id, { variants: Object.assign({}, r.variants, { [vid]: v }) }, `${it.variants.find((x) => x.id === vid).name.fr} : ${oui ? 'épuisé pour aujourd\'hui' : 'de nouveau disponible'}.`);
      }
      if (act === 'retablir') ad.deuxTouches(b, 'Toucher encore pour tout rétablir', async () => { await api.retablir(id); R = await api.reglages(); rendrePlat(id); son('down'); toast(`${it.name.fr} : comme sur la carte d'origine.`); });
    });
    liste.addEventListener('change', (e) => {
      const t = e.target;
      const art = t.closest('[data-id]');
      if (!art) return;
      const id = art.dataset.id, it = api.tous().find((x) => x.id === id), r = R[id] || {}, o = api.origine(id);
      if (t.dataset.prix) {
        const n = nombre(t.value);
        if (n == null) { son('nope'); toast('Ce prix ne se lit pas : par exemple 16,90'); t.setAttribute('aria-invalid', 'true'); return; }
        if (t.dataset.prix === 'variante') {
          const vid = t.dataset.variante, v = Object.assign({}, (r.variants || {})[vid]);
          v.price = n === o.variants[vid] ? null : n;
          regler(id, { variants: Object.assign({}, r.variants, { [vid]: v }) }, `${it.variants.find((x) => x.id === vid).name.fr} : ${prix(n)}`);
        } else {
          regler(id, { [t.dataset.prix]: n === o[t.dataset.prix] ? null : n }, `${it.name.fr}${it.cat === 'burgers' ? (t.dataset.prix === 'double' ? ' double' : ' (Ti)') : ''} : ${prix(n)}`);
        }
        son('stamp');
      }
      if (t.dataset.allergene) {
        const coches = [...art.querySelectorAll('[data-allergene]:checked')].map((x) => x.dataset.allergene);
        const base = deduits(it);
        const pareil = coches.length === base.length && coches.every((a) => base.includes(a));
        regler(id, { allergenes: pareil ? null : coches });
        son('tab');
      }
    });
    liste.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset.prix) e.target.blur(); });
  }

  ad.module('carte', {
    async init() {
      initEvenements();
      R = await api.reglages();
      rendre();
      api.onChange(async () => { R = await api.reglages(); rendre(); });
      // à minuit, les « épuisé aujourd'hui » de la veille tombent d'eux-mêmes
      setInterval(() => { if (ad.vue() === 'carte' && !document.activeElement.matches('input')) rendre(); else compter(); }, 60000);
    },
    entrer() { rendre(); },
  });
})();
