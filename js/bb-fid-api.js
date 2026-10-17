/* ==========================================================================
   Bougnat Burger — les cartes de fidélité : UNE porte d'entrée pour la carte du client (bb-fidelite.js)
   et pour le panneau du comptoir (admin/). Tout passe par BB.fidApi, qui répond par des promesses.
   · MAQUETTE : les cartes sont gardées dans le navigateur (localStorage, clé « bb:fid-cartes ») ; sur un même
     appareil, le panneau et la carte du client voient donc les mêmes données (deux onglets suffisent pour essayer).
   · PROD : remplacer le corps de chaque fonction par un appel au serveur du restaurant, par exemple :
       creer      POST   /api/fidelite/cartes                 { prenom, nom, tel }          → carte
       get        GET    /api/fidelite/cartes/:id                                          → carte
       chercher   GET    /api/fidelite/cartes?q=…             (admin : numéro ou n° de carte) → [cartes]
       crediter   POST   /api/fidelite/cartes/:id/passages    { n }  (admin)               → carte
       annuler    DELETE /api/fidelite/cartes/:id/passages/dernier (admin)                → carte
       remettre   POST   /api/fidelite/cartes/:id/remises     (admin : un cadeau remis)    → carte
       supprimer  DELETE /api/fidelite/cartes/:id             (le client, ou l'admin)      → true
     Les appels « admin » exigent la session du comptoir ; onChange se branche alors sur un rafraîchissement
     (ou des notifications du serveur) au lieu de l'événement « storage ».
   Une carte : { id, prenom, nom, tel, cree, points, remis, passages: [{ d, n }] }.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const CARTES = 'fid-cartes', MOI = 'fid-moi';

  const max = () => BB.FIDELITE.pas * BB.FIDELITE.paliers.length;
  const lire = () => BB.store.get(CARTES, {}) || {};
  const ecrire = (c) => BB.store.set(CARTES, c);
  const copie = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const ok = (v) => Promise.resolve(copie(v));
  const non = (msg) => Promise.reject(new Error(msg));
  const telNorm = (v) => String(v || '').replace(/[^\d+]/g, '').replace(/^\+33/, '0').replace(/\D/g, '');
  const idNorm = (v) => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^BB/, '').replace(/^(.{4})(.{4})$/, 'BB-$1-$2');
  // les cadeaux débloqués : un tous les « pas » points, six au plus
  const debloques = (c) => Math.min(BB.FIDELITE.paliers.length, Math.floor(c.points / BB.FIDELITE.pas));

  // la première version gardait la carte du téléphone seule, sous « bb:fidelite » : on la range avec les autres
  (function migrer() {
    const a = BB.store.get('fidelite', null);
    if (!a || !a.id) return;
    const c = lire();
    if (!c[a.id]) { delete a.vu; c[a.id] = a; ecrire(c); }
    BB.store.set(MOI, a.id);
    BB.store.del('fidelite');
  })();

  function nouvelId(existe) {
    const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    for (;;) {
      const r = new Uint8Array(8);
      if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(r);
      else r.forEach((_, i) => { r[i] = Math.random() * 256; });
      const s = Array.from(r, (b) => A[b % A.length]).join('');
      const id = `BB-${s.slice(0, 4)}-${s.slice(4)}`;
      if (!existe[id]) return id;
    }
  }
  // modifier une carte : lue, changée, réécrite (un seul onglet écrit à la fois en pratique)
  function changer(id, fn) {
    const c = lire();
    const carte = c[idNorm(id)];
    if (!carte) return non('carte introuvable');
    const r = fn(carte);
    if (r instanceof Error) return Promise.reject(r);
    ecrire(c);
    return ok(carte);
  }

  BB.fidApi = {
    max, telNorm, idNorm, debloques,
    // la carte de ce téléphone (côté client)
    moi() {
      const id = BB.store.get(MOI, null);
      return ok(id ? lire()[id] || null : null);
    },
    creer({ prenom, nom, tel }) {
      const c = lire();
      const carte = { id: nouvelId(c), prenom: String(prenom).trim(), nom: String(nom).trim(), tel: telNorm(tel), cree: new Date().toISOString(), points: 0, remis: 0, passages: [] };
      c[carte.id] = carte;
      ecrire(c);
      BB.store.set(MOI, carte.id);
      return ok(carte);
    },
    get(id) { return ok(lire()[idNorm(id)] || null); },
    // par numéro de téléphone (au moins 4 chiffres), par n° de carte, ou par nom ; vide : les plus récentes
    chercher(q) {
      const l = Object.values(lire());
      const s = String(q || '').trim();
      const t = telNorm(s), id = idNorm(s), mot = s.toLowerCase();
      const r = !s ? l : l.filter((c) => (t.length >= 4 && c.tel.includes(t)) || c.id === id || (mot.length >= 2 && `${c.prenom} ${c.nom}`.toLowerCase().includes(mot)));
      return ok(r.sort((a, b) => ((b.passages.slice(-1)[0] || {}).d || b.cree).localeCompare((a.passages.slice(-1)[0] || {}).d || a.cree)).slice(0, 30));
    },
    // un passage : un point par personne (la carte s'arrête au dernier palier)
    crediter(id, n) {
      n = Math.round(Number(n));
      if (!(n >= 1 && n <= 40)) return non('nombre de personnes invalide');
      return changer(id, (c) => {
        if (c.points >= max()) return new Error('carte complète');
        c.passages.push({ d: new Date().toISOString(), n });
        c.points = Math.min(max(), c.points + n);
      });
    },
    // annuler le dernier passage (une erreur de saisie au comptoir)
    annuler(id) {
      return changer(id, (c) => {
        const p = c.passages.pop();
        if (!p) return new Error('aucun passage');
        c.points = Math.min(max(), c.passages.reduce((s, x) => s + x.n, 0));
        c.remis = Math.min(c.remis || 0, debloques(c));
      });
    },
    // un cadeau remis au comptoir : le plus ancien des cadeaux débloqués pas encore remis
    remettre(id) {
      return changer(id, (c) => {
        if ((c.remis || 0) >= debloques(c)) return new Error('aucun cadeau à remettre');
        c.remis = (c.remis || 0) + 1;
      });
    },
    supprimer(id) {
      const c = lire();
      const k = idNorm(id);
      delete c[k];
      ecrire(c);
      if (BB.store.get(MOI, null) === k) BB.store.del(MOI);
      return ok(true);
    },
    // prévenu quand une carte change ailleurs (un autre onglet : le panneau, ou la carte du client)
    onChange(fn) {
      window.addEventListener('storage', (e) => { if (e.key === 'bb:' + CARTES) fn(); });
    },
  };
})();
