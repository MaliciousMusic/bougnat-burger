/* ==========================================================================
   Bougnat Burger — le comptoir : les commandes à emporter passées sur le site.
   · Une commande arrive : le comptoir sonne (et resonne toutes les 30 s tant que personne ne l'a prise),
     et le ticket sort en cuisine si l'imprimante Bluetooth est branchée et l'impression automatique cochée ;
     un ticket imprimé passe la commande « en cuisine ».
   · Nouvelle → En cuisine → Prête (le client reçoit un SMS) → Retirée ; ou Annulée (PROD : remboursement Stripe).
   · La pause : quand la cuisine déborde, les commandes en ligne s'arrêtent 20 min, 45 min ou jusqu'à reprise ;
     le site le dit et propose d'appeler.
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const ad = BB.ad;
  const api = BB.restoApi;
  const { $, esc, icon, toast, son, telAffiche, prix, heure, heureDe, jourCourt } = ad;

  const LIB = { nouvelle: 'Nouvelle', cuisine: 'En cuisine', prete: 'Prête', retiree: 'Retirée', annulee: 'Annulée' };
  let liste = [], filtre = 'encours', connues = null, sonnerie = 0;
  const ouvertes = new Set(); // les aperçus de ticket dépliés

  const imp = () => ad.imprimante;
  const minutesAvant = (c) => {
    const n = BB.parisNow();
    return Math.round((new Date(`${c.retrait.jour}T${c.retrait.heure}:00`) - n) / 60000);
  };

  /* ---------- l'imprimante ---------- */
  // le bandeau ne parle que s'il y a quelque chose à faire ; les réglages s'ouvrent depuis la puce du haut
  let reglagesOuverts = false;
  function rendreImprimante() {
    const box = $('#cmd-imp'), I = imp(), e = I.etat(), r = I.reglages();
    const puce = $('#ad-imp-puce');
    const branchee = e === 'prete' || e === 'impression';
    puce.hidden = false;
    puce.dataset.etat = e;
    puce.setAttribute('aria-expanded', String(reglagesOuverts));
    puce.querySelector('span').textContent = branchee ? (I.nom() || 'Imprimante') : e === 'connexion' ? 'Connexion…' : 'Pas d\'imprimante';
    if (!I.dispo()) {
      box.innerHTML = reglagesOuverts ? `<p>${icon('i-imprimante')}<span><b>Pas de Bluetooth dans ce navigateur.</b> Pour imprimer en cuisine : Chrome (tablette Android, PC, Mac) ou l'appli Bluefy sur iPhone. En attendant, « Ticket » puis « Imprimer avec le navigateur ».</span></p>` : '';
      return;
    }
    const ligne = branchee ? `<p>${icon('i-imprimante')}<span><b>${esc(I.nom())}</b> est prête${r.auto ? ' : chaque nouvelle commande sort en cuisine' : ''}.</span></p>`
      : `<p>${icon('i-imprimante')}<span>${e === 'connexion' ? 'Connexion à l\'imprimante…' : '<b>Imprimante de la cuisine</b> pas branchée.'}</span><button class="btn btn-main" type="button" data-imp="on" ${e === 'connexion' ? 'disabled' : ''}>Connecter</button></p>`;
    const regl = `<div class="ad-actions">
        ${branchee ? '<button class="ad-petit" type="button" data-imp="essai">Ticket d\'essai</button><button class="ad-petit" type="button" data-imp="off">Déconnecter</button>' : ''}
        <label class="ad-coche"><input type="checkbox" data-imp="auto" ${r.auto ? 'checked' : ''}><span>Imprimer chaque nouvelle commande</span></label>
        <label class="ad-choix"><span>Papier</span><select data-imp="largeur"><option value="32" ${r.largeur === 32 ? 'selected' : ''}>58 mm</option><option value="48" ${r.largeur === 48 ? 'selected' : ''}>80 mm</option></select></label>
      </div>`;
    box.innerHTML = branchee && !reglagesOuverts ? '' : ligne + (reglagesOuverts ? regl : '');
  }
  function initImprimante() {
    const box = $('#cmd-imp');
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('button[data-imp]');
      if (!b) return;
      const I = imp();
      try {
        if (b.dataset.imp === 'on') { await I.connecter(); son('on'); toast(`Imprimante connectée : ${I.nom()}`); imprimerEnAttente(); }
        if (b.dataset.imp === 'off') { I.deconnecter(); toast('Imprimante déconnectée.'); }
        if (b.dataset.imp === 'essai') { await I.essai(); toast('Ticket d\'essai envoyé.'); }
      } catch (err) {
        if (err && err.name === 'NotFoundError') return; // liste fermée sans choisir
        son('nope');
        toast(err && err.message ? err.message : 'Impossible de joindre l\'imprimante.');
      }
    });
    box.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.imp === 'auto') { imp().regler({ auto: t.checked }); if (t.checked) imprimerEnAttente(); }
      if (t.dataset.imp === 'largeur') { imp().regler({ largeur: Number(t.value) }); rendreListe(); }
    });
    $('#ad-imp-puce').addEventListener('click', () => {
      reglagesOuverts = !reglagesOuverts || ad.vue() !== 'commandes';
      if (ad.vue() !== 'commandes') { location.hash = '#commandes'; ad.montrer('commandes'); }
      rendreImprimante();
      son('tab');
      if (reglagesOuverts) window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    imp().onEtat(() => rendreImprimante());
    imp().reprendre();
  }
  // le ticket d'une commande, en Bluetooth ; imprimé, il part « en cuisine »
  async function imprimer(c, opts) {
    try {
      const fait = await imp().imprimerCommande(c, opts);
      if (fait && c.statut === 'nouvelle') await api.commandes.statut(c.id, 'cuisine');
      return fait;
    } catch (e) { son('nope'); toast('Le ticket n\'est pas sorti : ' + (e.message || 'imprimante injoignable')); return false; }
  }
  // les nouvelles commandes jamais imprimées (l'imprimante vient d'être branchée)
  async function imprimerEnAttente() {
    if (!imp().reglages().auto || imp().etat() !== 'prete') return;
    for (const c of liste.filter((o) => o.statut === 'nouvelle' && !o.imprime)) await imprimer(c);
  }

  /* ---------- la pause des commandes en ligne ---------- */
  function rendrePause() {
    const box = $('#cmd-pause'), p = api.reglages.pause();
    box.classList.toggle('en-pause', !!p);
    box.innerHTML = p
      ? `<p>${icon('i-pause')}<span><b>Commandes en ligne en pause</b> ${p.jusqua ? `jusqu'à ${esc(heureDe(p.jusqua.toISOString()))}` : 'jusqu\'à reprise'}. Le site propose d'appeler.</span><button class="btn btn-main" type="button" data-pause="0">Reprendre</button></p>`
      : `<p>${icon('i-pause')}<span><b>Coup de feu ?</b> Pause des commandes en ligne :</span><span class="ad-boutons"><button class="ad-petit" type="button" data-pause="20">20 min</button><button class="ad-petit" type="button" data-pause="45">45 min</button><button class="ad-petit" type="button" data-pause="service">Jusqu'à reprise</button></span></p>`;
  }
  function initPause() {
    $('#cmd-pause').addEventListener('click', (e) => {
      const b = e.target.closest('[data-pause]');
      if (!b) return;
      const v = b.dataset.pause;
      const pause = v === '0' ? null : v === 'service' ? 'service' : new Date(Date.now() + Number(v) * 60000).toISOString();
      api.reglages.regler({ pause }).then(() => { son(pause ? 'down' : 'up'); toast(pause ? 'Commandes en ligne en pause.' : 'Les commandes en ligne reprennent.'); rendrePause(); });
    });
    api.reglages.onChange(rendrePause);
  }

  /* ---------- la liste ---------- */
  const groupes = {
    encours: (o) => o.statut === 'nouvelle' || o.statut === 'cuisine',
    pretes: (o) => o.statut === 'prete',
    finies: (o) => o.statut === 'retiree' || o.statut === 'annulee',
  };
  function ligneHTML(l) { return `<li><b>${l.qty}×</b><span>${esc(l.nom)}${l.option ? `<small>${esc(l.option)}</small>` : ''}</span></li>`; }
  function carteHTML(c) {
    const m = minutesAvant(c);
    const actif = c.statut === 'nouvelle' || c.statut === 'cuisine' || c.statut === 'prete';
    const delai = !actif ? '' : c.retrait.jour !== api.aujourdhui() ? jourCourt(c.retrait.jour) : m > 90 ? '' : m >= 0 ? `dans ${m} min` : `en retard de ${-m} min`;
    const acts = [];
    if (c.statut === 'nouvelle') acts.push(`<button class="btn btn-main" type="button" data-act="cuisine">${imp().etat() === 'prete' && !c.imprime ? 'Imprimer et lancer en cuisine' : 'Lancer en cuisine'}</button>`);
    if (c.statut === 'cuisine') acts.push(`<button class="btn btn-main" type="button" data-act="prete">Prête · prévenir ${esc(c.nom)} par SMS</button>`);
    if (c.statut === 'prete') acts.push('<button class="btn btn-main" type="button" data-act="retiree">Retirée</button>');
    if (c.statut === 'prete') acts.push('<button class="ad-petit" type="button" data-act="cuisine">Revenir en cuisine</button>');
    acts.push(`<button class="ad-petit" type="button" data-act="ticket" aria-expanded="${ouvertes.has(c.id)}">Ticket</button>`);
    if (c.statut === 'nouvelle' || c.statut === 'cuisine') acts.push('<button class="ad-petit ad-danger" type="button" data-act="annuler">Annuler</button>');
    return `<article class="ad-cmd s-${c.statut}${m < 0 && actif ? ' en-retard' : ''}" data-id="${esc(c.id)}">
      <header>
        <b class="num">${esc(c.id)}</b>
        <span class="retrait">${icon('i-horloge')}<b>${esc(heure(c.retrait.heure))}</b>${delai ? `<small>${esc(delai)}</small>` : ''}</span>
        <span class="statut">${esc(LIB[c.statut])}</span>
      </header>
      <p class="client"><b>${esc(c.nom)}</b> · <a href="tel:${esc(c.tel)}">${esc(telAffiche(c.tel))}</a></p>
      <ul class="lignes">${c.lignes.map(ligneHTML).join('')}</ul>
      ${c.note ? `<p class="note"><b>Note</b> ${esc(c.note)}</p>` : ''}
      ${c.alcool ? '<p class="alcool">Alcool : vérifier l\'âge au retrait.</p>' : ''}
      <p class="pied"><span>${esc(prix(c.total))} · payée en ligne</span><span>reçue à ${esc(heureDe(c.cree))}${c.imprime ? ` · ${icon('i-imprimante')} imprimée` : ''}</span></p>
      <div class="ad-actions">${acts.join('')}</div>
      ${ouvertes.has(c.id) ? apercuHTML(c) : ''}
    </article>`;
  }
  function apercuHTML(c) {
    const I = imp();
    return `<div class="ad-apercu">${I.apercu(I.ticketCommande(c))}
      <div class="ad-actions">${I.etat() === 'prete' ? '<button class="btn btn-main" type="button" data-act="imprimer">Imprimer en cuisine</button>' : ''}<button class="ad-petit" type="button" data-act="navigateur">Imprimer avec le navigateur</button></div></div>`;
  }
  function rendreListe() {
    const box = $('#cmd-liste');
    const l = liste.filter(groupes[filtre]);
    if (filtre === 'finies') l.sort((a, b) => b.maj.localeCompare(a.maj)); else l.sort((a, b) => (a.retrait.jour + a.retrait.heure).localeCompare(b.retrait.jour + b.retrait.heure));
    box.innerHTML = l.length ? l.slice(0, 40).map(carteHTML).join('')
      : `<p class="ad-vide">${filtre === 'encours' ? 'Aucune commande à préparer. Elles sonnent ici dès qu\'un client paie sur le site.' : filtre === 'pretes' ? 'Aucune commande prête en attente.' : 'Rien de terminé pour l\'instant.'}</p>`;
    document.querySelectorAll('#cmd-filtre [data-n]').forEach((b) => { const n = liste.filter(groupes[b.dataset.n]).length; b.textContent = n ? String(n) : ''; });
    const nouvelles = liste.filter((o) => o.statut === 'nouvelle').length;
    ad.pastille('commandes', nouvelles || liste.filter(groupes.encours).length, nouvelles > 0);
    document.title = (nouvelles ? `(${nouvelles}) ` : '') + 'Comptoir · Bougnat Burger';
  }

  /* ---------- les arrivées ---------- */
  async function charger() {
    liste = await api.commandes.liste();
    const nouvelles = liste.filter((o) => o.statut === 'nouvelle' && connues && !connues.has(o.id));
    if (!connues) connues = new Set();
    liste.forEach((o) => connues.add(o.id));
    if (nouvelles.length) {
      son('ding');
      BB.vibrate && BB.vibrate([60, 60, 60]);
      toast(nouvelles.length > 1 ? `${nouvelles.length} nouvelles commandes !` : `Nouvelle commande ${nouvelles[0].id} · ${nouvelles[0].nom}, retrait ${heure(nouvelles[0].retrait.heure)}`);
      if (imp().reglages().auto && imp().etat() === 'prete') {
        for (const c of nouvelles) if (!c.imprime) await imprimer(c);
        liste = await api.commandes.liste();
      }
    }
    rendreListe();
  }
  // tant qu'une commande attend d'être prise en charge, le comptoir resonne toutes les 30 s
  function relancer() {
    clearInterval(sonnerie);
    sonnerie = setInterval(() => {
      if (!ad.ouvert()) return;
      if (liste.some((o) => o.statut === 'nouvelle')) son('ding');
      rendreListe(); // les « dans 12 min » avancent
    }, 30000);
  }

  /* ---------- les gestes ---------- */
  // (sans ê ni ç : le SMS reste dans l'alphabet SMS, donc en un seul message)
  const SMS_PRETE = (c) => `Bougnat Burger : ${c.nom}, votre commande ${c.id} est terminée ! Elle vous attend au comptoir, 10 bd Léon-Malfreyt. Bon appétit !`;
  async function agir(b, c) {
    const act = b.dataset.act;
    if (act === 'cuisine') {
      if (c.statut === 'nouvelle' && !c.imprime && imp().etat() === 'prete') await imprimer(c);
      await api.commandes.statut(c.id, 'cuisine');
      son('tab');
    }
    if (act === 'prete') {
      await api.commandes.statut(c.id, 'prete');
      await api.sms.envoyer([{ tel: c.tel, texte: SMS_PRETE(c) }], 'commande');
      son('stamp');
      toast(`${c.id} prête : SMS envoyé à ${c.nom} (simulation).`);
    }
    if (act === 'retiree') { await api.commandes.statut(c.id, 'retiree'); son('add'); toast(`${c.id} retirée. Bon appétit ${c.nom} !`); }
    if (act === 'annuler') {
      ad.deuxTouches(b, 'Toucher encore pour annuler', async () => {
        await api.commandes.statut(c.id, 'annulee');
        son('down');
        // PROD : le serveur rembourse le paiement Stripe et prévient le client par SMS
        toast(`${c.id} annulée. En vrai : remboursement et SMS au client.`);
        await charger();
      });
      return;
    }
    if (act === 'ticket') { if (ouvertes.has(c.id)) ouvertes.delete(c.id); else ouvertes.add(c.id); rendreListe(); return; }
    if (act === 'imprimer') { if (await imprimer(c, { reimpression: c.imprime > 0 })) toast('Ticket envoyé en cuisine.'); }
    if (act === 'navigateur') { imp().imprimerNavigateur(imp().ticketCommande(c)); return; }
    await charger();
  }

  /* ---------- une commande d'essai (pour la démonstration) ---------- */
  const PRENOMS = ['Camille', 'Léa', 'Hugo', 'Inès', 'Lucas', 'Manon', 'Jules', 'Chloé', 'Nathan', 'Zoé'];
  function commandeEssai() {
    const au = (l) => l[Math.floor(Math.random() * l.length)];
    const burgers = BB.BURGER_LIST;
    const lignes = [];
    const nb = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < nb; i++) {
      const b = au(burgers), dbl = Math.random() < 0.3, veg = b.id === 'vegetario' || Math.random() < 0.2;
      lignes.push({ qty: 1 + (Math.random() < 0.25 ? 1 : 0), nom: (dbl ? '' : 'Ti ') + b.name.fr, option: [dbl && 'double', veg ? 'galette' : 'steak'].filter(Boolean).join(' · '), unit: dbl ? b.double : b.price });
    }
    if (Math.random() < 0.6) { const s = BB.MENU_OTHER.find((x) => x.id === 'softs'); const v = au(s.variants); lignes.push({ qty: 1, nom: v.name.fr, option: '', unit: v.price }); }
    const n = BB.parisNow();
    const m = Math.ceil((n.getHours() * 60 + n.getMinutes() + 25) / 15) * 15;
    const hh = `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    api.commandes.creer({
      nom: au(PRENOMS), tel: '06' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'),
      retrait: { jour: api.aujourdhui(), heure: hh }, lignes, note: Math.random() < 0.4 ? au(['Allergie aux noix', 'Sans tomate svp', 'Sauce à part', 'Bien cuit']) : '',
      total: Math.round(lignes.reduce((s, l) => s + l.qty * l.unit, 0) * 100) / 100, alcool: false, lang: 'fr',
    }).then(charger);
  }

  ad.module('commandes', {
    init() {
      initImprimante();
      initPause();
      rendreImprimante();
      rendrePause();
      $('#cmd-filtre').addEventListener('click', (e) => {
        const b = e.target.closest('[data-f]');
        if (!b) return;
        filtre = b.dataset.f;
        document.querySelectorAll('#cmd-filtre [data-f]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
        son('tab');
        rendreListe();
      });
      $('#cmd-liste').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const c = liste.find((o) => o.id === b.closest('[data-id]').dataset.id);
        if (c) agir(b, c);
      });
      $('#cmd-test').addEventListener('click', commandeEssai);
      api.commandes.onChange(charger);
      // en secours (deux onglets du même navigateur qui ratent un événement, ou PROD sans notifications) : on relit
      setInterval(() => { if (ad.ouvert()) charger(); }, 15000);
      setInterval(rendrePause, 30000);
      charger();
      relancer();
    },
    entrer() { rendreListe(); },
  });
})();
