/* ==========================================================================
   Bougnat Burger — le restaurant : UNE porte d'entrée pour le site (la carte, le sac, la réservation)
   et pour le comptoir (admin/). Même principe que BB.fidApi : tout répond par des promesses.
   · MAQUETTE : tout est gardé dans le navigateur (localStorage) ; sur un même appareil, le site et le comptoir
     voient donc les mêmes données (deux onglets suffisent pour essayer : une commande passée sur le site
     sonne au comptoir).
   · PROD : remplacer le corps des fonctions par le serveur du restaurant (les modules : caisse, réservation,
     SMS…), par exemple :
       commandes.creer     POST  /api/commandes                 (le site, après le paiement Stripe)
       commandes.liste     GET   /api/commandes?depuis=…        (admin)
       commandes.statut    PATCH /api/commandes/:id  { statut } (admin ; « prête » envoie le SMS au client)
       resas.creer         POST  /api/reservations              (le site, ou le comptoir pour un appel)
       resas.liste         GET   /api/reservations?du=…&au=…    (admin)
       resas.statut        PATCH /api/reservations/:id { statut } (admin ; confirmée / refusée : SMS)
       carte.reglages      GET   /api/carte/reglages            (public : prix, épuisés, masqués, allergènes)
       carte.regler        PUT   /api/carte/reglages/:plat      (admin)
       reglages            GET/PUT /api/reglages                (pause des commandes en ligne)
       sms.campagnes       GET/POST/DELETE /api/sms/campagnes   (admin ; le serveur envoie à l'heure dite)
       sms.envoyer         POST  /api/sms                       (admin : prestataire SMS, ex. Brevo, OVH, Twilio)
     onChange se branche alors sur des notifications du serveur (SSE ou WebSocket) au lieu de l'événement « storage ».
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const K = { cmd: 'commandes', resa: 'resas', carte: 'carte-reglages', regl: 'reglages', camp: 'sms-campagnes', journal: 'sms-journal' };

  const lire = (k, d) => BB.store.get(k, d) || d;
  const ecrire = (k, v) => BB.store.set(k, v);
  const copie = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const ok = (v) => Promise.resolve(copie(v));
  const non = (msg) => Promise.reject(new Error(msg));
  const maintenant = () => new Date().toISOString();
  const telNorm = (v) => String(v || '').replace(/[^\d+]/g, '').replace(/^\+33/, '0').replace(/\D/g, '');
  // le jour à Paris, AAAA-MM-JJ (les épuisés « du jour » et la numérotation des commandes en dépendent)
  const jourDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const aujourdhui = () => jourDe(BB.parisNow ? BB.parisNow() : new Date());
  const alea = (n) => {
    const A = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
    const r = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(r); else r.forEach((_, i) => { r[i] = Math.random() * 256; });
    return Array.from(r, (b) => A[b % A.length]).join('');
  };
  function changer(cle, id, fn) {
    const l = lire(cle, []);
    const x = l.find((o) => o.id === id);
    if (!x) return non('introuvable');
    const r = fn(x);
    if (r instanceof Error) return Promise.reject(r);
    x.maj = maintenant();
    ecrire(cle, l);
    return ok(x);
  }
  const ecoute = (cles, fn) => window.addEventListener('storage', (e) => { if (cles.some((k) => e.key === 'bb:' + k)) fn(); });

  /* ---------- Les commandes à emporter ----------
     { id: 'B-101', cree, maj, statut, nom, tel, retrait: { jour, heure }, lignes: [{ qty, nom, option, unit }],
       note, total, alcool, imprime (nombre de tickets sortis), lang }
     statut : nouvelle → cuisine → prete → retiree ; ou annulee */
  const STATUTS_CMD = ['nouvelle', 'cuisine', 'prete', 'retiree', 'annulee'];
  const commandes = {
    STATUTS: STATUTS_CMD,
    creer(c) {
      const l = lire(K.cmd, []);
      const jour = aujourdhui();
      // le numéro du jour : B-101, B-102… (court, facile à crier au comptoir)
      const duJour = l.filter((o) => jourDe(new Date(o.cree)) === jour).length;
      const cmd = Object.assign({ note: '', alcool: false, lang: 'fr' }, copie(c), {
        id: 'B-' + (101 + duJour), cree: maintenant(), maj: maintenant(), statut: 'nouvelle', imprime: 0, tel: telNorm(c.tel),
      });
      l.push(cmd);
      // on garde 60 jours de commandes dans la maquette
      const limite = Date.now() - 60 * 86400000;
      ecrire(K.cmd, l.filter((o) => new Date(o.cree).getTime() > limite));
      return ok(cmd);
    },
    get(id) { return ok(lire(K.cmd, []).find((o) => o.id === id) || null); },
    liste() { return ok(lire(K.cmd, []).slice().sort((a, b) => b.cree.localeCompare(a.cree))); },
    statut(id, s) {
      if (!STATUTS_CMD.includes(s)) return non('statut inconnu');
      return changer(K.cmd, id, (o) => { o.statut = s; });
    },
    imprimee(id) { return changer(K.cmd, id, (o) => { o.imprime = (o.imprime || 0) + 1; }); },
    onChange(fn) { ecoute([K.cmd], fn); },
  };

  /* ---------- Les réservations ----------
     { id: 'R-XXXX', cree, maj, statut, nom, tel, jour, heure, couverts, note, source: 'site' | 'telephone' }
     statut : demande → confirmee → venue ; ou refusee, annulee, absente */
  const STATUTS_RESA = ['demande', 'confirmee', 'venue', 'refusee', 'annulee', 'absente'];
  const resas = {
    STATUTS: STATUTS_RESA,
    creer(r) {
      const l = lire(K.resa, []);
      const resa = Object.assign({ note: '', source: 'site' }, copie(r), {
        id: 'R-' + alea(4), cree: maintenant(), maj: maintenant(), tel: telNorm(r.tel), couverts: Math.max(1, Math.round(Number(r.couverts) || 1)),
        statut: r.source === 'telephone' ? 'confirmee' : 'demande',
      });
      l.push(resa);
      const limite = jourDe(new Date(Date.now() - 90 * 86400000));
      ecrire(K.resa, l.filter((o) => o.jour >= limite));
      return ok(resa);
    },
    get(id) { return ok(lire(K.resa, []).find((o) => o.id === id) || null); },
    liste() { return ok(lire(K.resa, []).slice().sort((a, b) => (a.jour + a.heure).localeCompare(b.jour + b.heure))); },
    statut(id, s) {
      if (!STATUTS_RESA.includes(s)) return non('statut inconnu');
      return changer(K.resa, id, (o) => { o.statut = s; });
    },
    onChange(fn) { ecoute([K.resa], fn); },
  };

  /* ---------- Les réglages de la carte ----------
     Par plat : { price, double, variants: { id: { price, epuise } }, epuise: 'AAAA-MM-JJ', cache: true, allergenes: [...] }
     « Épuisé » vaut pour le jour où on l'a coché : le lendemain, le plat revient tout seul.
     Les prix d'origine restent dans bb-data.js ; un réglage les remplace sans les effacer. */
  const tous = () => [...(BB.BURGER_LIST || []), ...(BB.MENU_OTHER || [])];
  // la carte telle que bb-data.js la donne : de quoi tout rétablir
  const ORIG = { burgers: (BB.BURGER_LIST || []).slice(), autres: (BB.MENU_OTHER || []).slice(), prix: {} };
  tous().forEach((it) => {
    ORIG.prix[it.id] = { price: it.price, double: it.double, variants: (it.variants || []).reduce((o, v) => { o[v.id] = v.price; return o; }, {}), allergens: it.allergens };
  });
  const carte = {
    // les réglages de tous les plats
    reglages() { return ok(lire(K.carte, {})); },
    origine(id) { return copie(ORIG.prix[id] || null); },
    tous() { return [...ORIG.burgers, ...ORIG.autres]; },
    regler(id, r) {
      const all = lire(K.carte, {});
      const v = Object.assign({}, all[id] || {}, r);
      Object.keys(v).forEach((k) => { if (v[k] == null || v[k] === false) delete v[k]; });
      if (v.variants) { Object.keys(v.variants).forEach((k) => { const x = v.variants[k]; Object.keys(x).forEach((j) => { if (x[j] == null || x[j] === false) delete x[j]; }); if (!Object.keys(x).length) delete v.variants[k]; }); if (!Object.keys(v.variants).length) delete v.variants; }
      if (Object.keys(v).length) all[id] = v; else delete all[id];
      ecrire(K.carte, all);
      return ok(all[id] || null);
    },
    retablir(id) { const all = lire(K.carte, {}); delete all[id]; ecrire(K.carte, all); return ok(true); },
    estEpuise: (r) => !!(r && r.epuise === aujourdhui()),
    aujourdhui,
    /* sur le site : applique les réglages aux plats (prix, épuisés, masqués, allergènes) ; rappelable à chaud */
    appliquer() {
      const R = lire(K.carte, {});
      const j = aujourdhui();
      [...ORIG.burgers, ...ORIG.autres].forEach((it) => {
        const o = ORIG.prix[it.id], r = R[it.id] || {};
        it.price = r.price != null ? r.price : o.price;
        if (it.cat === 'burgers') it.double = r.double != null ? r.double : o.double;
        (it.variants || []).forEach((v) => {
          const rv = (r.variants || {})[v.id] || {};
          v.price = rv.price != null ? rv.price : o.variants[v.id];
          v._epuise = rv.epuise === j;
        });
        it._epuise = r.epuise === j || (!!it.variants && it.variants.every((v) => v._epuise));
        it._allergenes = Array.isArray(r.allergenes) ? r.allergenes.slice() : null;
      });
      const garde = (it) => !(R[it.id] && R[it.id].cache);
      if (BB.BURGER_LIST) { BB.BURGER_LIST.length = 0; ORIG.burgers.filter(garde).forEach((it) => BB.BURGER_LIST.push(it)); }
      if (BB.MENU_OTHER) { BB.MENU_OTHER.length = 0; ORIG.autres.filter(garde).forEach((it) => BB.MENU_OTHER.push(it)); }
    },
    onChange(fn) { ecoute([K.carte], fn); },
  };
  // les allergènes réglés au comptoir remplacent ceux déduits de la recette
  if (BB.allergens && !BB.allergens._regle) {
    const deduits = BB.allergens;
    BB.allergensDeduits = deduits;
    BB.allergens = (item) => (item && Array.isArray(item._allergenes) ? item._allergenes.slice() : deduits(item));
    BB.allergens._regle = true;
  }

  /* ---------- Les réglages du restaurant ----------
     pause : jusqu'à quand les commandes en ligne sont suspendues (ISO), ou 'service' (jusqu'à la reprise manuelle) */
  const reglages = {
    get() { return ok(lire(K.regl, {})); },
    regler(r) { const v = Object.assign(lire(K.regl, {}), r); Object.keys(v).forEach((k) => v[k] == null && delete v[k]); ecrire(K.regl, v); return ok(v); },
    // les commandes en ligne sont-elles en pause ? → null, ou { jusqua: Date | null }
    pause() {
      const p = lire(K.regl, {}).pause;
      if (!p) return null;
      if (p === 'service') return { jusqua: null };
      const d = new Date(p);
      return d.getTime() > Date.now() ? { jusqua: d } : null;
    },
    onChange(fn) { ecoute([K.regl], fn); },
  };

  /* ---------- Les SMS ----------
     Une campagne : { id, modele, titre, texte, cible, quand (ISO), repete: 'non' | 'semaine', statut, cree, envois: [{ d, nb }] }
     statut : programmee → envoyee ; ou annulee. Le journal garde les derniers SMS « partis » (simulés ici). */
  const sms = {
    campagnes() { return ok(lire(K.camp, []).slice().sort((a, b) => (a.quand || '').localeCompare(b.quand || ''))); },
    programmer(c) {
      const l = lire(K.camp, []);
      const camp = Object.assign({ repete: 'non' }, copie(c), { id: 'S-' + alea(5), cree: maintenant(), statut: 'programmee', envois: [] });
      l.push(camp);
      ecrire(K.camp, l);
      return ok(camp);
    },
    annuler(id) { return changer(K.camp, id, (o) => { if (o.statut !== 'programmee') return new Error('déjà partie'); o.statut = 'annulee'; }); },
    // une campagne vient de partir : envoyée, ou reprogrammée la semaine suivante
    partie(id, nb) {
      return changer(K.camp, id, (o) => {
        o.envois.push({ d: maintenant(), nb });
        if (o.repete === 'semaine') { const q = new Date(o.quand); do q.setDate(q.getDate() + 7); while (q.getTime() <= Date.now()); o.quand = q.toISOString(); } else o.statut = 'envoyee';
      });
    },
    // MAQUETTE : rien ne part, le SMS est écrit dans le journal ; PROD : POST /api/sms { messages }
    envoyer(messages, type) {
      const j = lire(K.journal, []);
      const d = maintenant();
      messages.forEach((m) => j.push({ d, tel: telNorm(m.tel), texte: m.texte, type: type || 'offre' }));
      ecrire(K.journal, j.slice(-300));
      return ok(messages.length);
    },
    journal() { return ok(lire(K.journal, []).slice().reverse()); },
    onChange(fn) { ecoute([K.camp, K.journal], fn); },
  };

  BB.restoApi = { commandes, resas, carte, reglages, sms, telNorm, jourDe, aujourdhui };
})();
