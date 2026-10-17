/* ==========================================================================
   Bougnat Burger — le comptoir : les réservations.
   · Les demandes du site attendent en haut : Confirmer ou Refuser, et le client reçoit un SMS.
   · Un appel : « Noter un appel » l'ajoute, confirmé d'office (SMS de confirmation au choix).
   · Le jour choisi : midi et soir, le nombre de couverts par service ; « Venus » propose de créditer
     la carte de fidélité du client (retrouvée par son numéro) avec le nombre de couverts.
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const ad = BB.ad;
  const api = BB.restoApi;
  const fid = BB.fidApi;
  const { $, esc, icon, toast, son, telAffiche, heure, jourLong, jourCourt } = ad;

  const LIB = { demande: 'À confirmer', confirmee: 'Confirmée', venue: 'Venus', refusee: 'Refusée', annulee: 'Annulée', absente: 'Pas venus' };
  const ACTIVES = ['demande', 'confirmee', 'venue'];
  let liste = [], jour = null, connues = null;
  const cartes = new Map(); // tél → carte de fidélité (ou null)

  const couverts = (n) => (n > 1 ? `${n} couverts` : '1 couvert');
  const service = (h) => (Number(h.split(':')[0]) < 16 ? 'midi' : 'soir');
  const jours = () => {
    const open = BB.nextOpenDays(14).map((d) => api.jourDe(d));
    const avec = liste.filter((r) => r.jour >= api.aujourdhui() && ACTIVES.includes(r.statut)).map((r) => r.jour);
    return [...new Set([...open, ...avec])].sort().slice(0, 21);
  };

  /* ---------- les SMS au client (MAQUETTE : écrits dans le journal) ---------- */
  const TEL = BB.INFO.phoneLabel;
  const SMS = {
    confirmee: (r) => `Bougnat Burger : ${r.nom}, votre table pour ${r.couverts} est confirmée ${jourCourt(r.jour)} à ${heure(r.heure)}. On vous attend ! Un imprévu ? Appelez le ${TEL}.`,
    refusee: (r) => `Bougnat Burger : désolés ${r.nom}, nous sommes complets ${jourCourt(r.jour)} à ${heure(r.heure)}. Appelez-nous au ${TEL} pour trouver un autre moment.`,
    annulee: (r) => `Bougnat Burger : ${r.nom}, votre réservation du ${jourCourt(r.jour)} à ${heure(r.heure)} est annulée. Pour en parler : ${TEL}.`,
  };

  /* ---------- rendu ---------- */
  function rendreJours() {
    const box = $('#resa-jours');
    const l = jours();
    if (!jour || !l.includes(jour)) jour = l[0];
    box.innerHTML = l.map((j) => {
      const du = liste.filter((r) => r.jour === j && ACTIVES.includes(r.statut));
      const cv = du.reduce((s, r) => s + r.couverts, 0);
      const att = du.some((r) => r.statut === 'demande');
      const d = new Date(j + 'T12:00:00');
      return `<button type="button" class="day" role="radio" aria-checked="${j === jour}" data-jour="${j}">
        <small>${j === api.aujourdhui() ? 'Auj.' : esc(new Intl.DateTimeFormat('fr-FR', { weekday: 'short' }).format(d))}</small><b>${d.getDate()}</b>
        <small class="cv">${cv ? esc(cv + ' cv') : '·'}</small>${att ? '<i class="att" aria-label="demandes à confirmer"></i>' : ''}</button>`;
    }).join('');
  }
  function ligneHTML(r, avecJour) {
    const carte = cartes.get(r.tel);
    const acts = [];
    if (r.statut === 'demande') {
      acts.push('<button class="btn btn-main" type="button" data-act="confirmee">Confirmer</button>');
      acts.push('<button class="ad-petit ad-danger" type="button" data-act="refusee">Refuser</button>');
    }
    if (r.statut === 'confirmee') {
      acts.push('<button class="btn btn-main" type="button" data-act="venue">Venus</button>');
      acts.push('<button class="ad-petit" type="button" data-act="absente">Pas venus</button>');
      acts.push('<button class="ad-petit ad-danger" type="button" data-act="annulee">Annuler</button>');
    }
    if (r.statut === 'venue' && carte) acts.push(`<button class="btn btn-main" type="button" data-act="fidelite">${icon('i-cadeau')}<span>Fidélité de ${esc(carte.prenom)} · +${r.couverts}</span></button>`);
    if (['refusee', 'annulee', 'absente', 'venue'].includes(r.statut)) acts.push('<button class="ad-petit" type="button" data-act="confirmee-sans-sms">Remettre en confirmée</button>');
    return `<article class="ad-resa s-${r.statut}" data-id="${esc(r.id)}">
      <div class="h"><b>${esc(heure(r.heure))}</b>${avecJour ? `<small>${esc(jourCourt(r.jour))}</small>` : ''}</div>
      <div class="qui">
        <p><b>${esc(r.nom)}</b> · ${esc(couverts(r.couverts))}</p>
        <p class="meta"><a href="tel:${esc(r.tel)}">${esc(telAffiche(r.tel))}</a> · ${r.source === 'telephone' ? 'par téléphone' : 'sur le site'}${carte ? ` · ${icon('i-cadeau')} carte` : ''}</p>
        ${r.note ? `<p class="note">${esc(r.note)}</p>` : ''}
      </div>
      <span class="statut">${esc(LIB[r.statut])}</span>
      <div class="ad-actions">${acts.join('')}</div>
    </article>`;
  }
  function rendreListe() {
    const box = $('#resa-liste');
    const auj = api.aujourdhui();
    const demandes = liste.filter((r) => r.statut === 'demande' && r.jour >= auj);
    let h = '';
    if (demandes.length) h += `<h2 class="ad-sous">À confirmer <b>${demandes.length}</b></h2>${demandes.map((r) => ligneHTML(r, true)).join('')}`;
    const du = liste.filter((r) => r.jour === jour);
    h += `<h2 class="ad-sous">${esc(jourLong(jour))}</h2>`;
    ['midi', 'soir'].forEach((s) => {
      const l = du.filter((r) => service(r.heure) === s).sort((a, b) => a.heure.localeCompare(b.heure) || (ACTIVES.indexOf(a.statut) < 0) - (ACTIVES.indexOf(b.statut) < 0));
      const cv = l.filter((r) => ACTIVES.includes(r.statut)).reduce((n, r) => n + r.couverts, 0);
      h += `<div class="ad-service"><h3>${s === 'midi' ? 'Midi' : 'Soir'}</h3><span>${cv ? esc(couverts(cv)) : 'personne pour l\'instant'}</span></div>`;
      h += l.length ? l.map((r) => ligneHTML(r, false)).join('') : '';
    });
    box.innerHTML = h;
    ad.pastille('resas', demandes.length, demandes.length > 0);
  }
  function rendre() { rendreJours(); rendreListe(); }

  /* ---------- données ---------- */
  async function charger() {
    liste = await api.resas.liste();
    const nouvelles = liste.filter((r) => r.statut === 'demande' && connues && !connues.has(r.id));
    if (!connues) connues = new Set();
    liste.forEach((r) => connues.add(r.id));
    if (nouvelles.length) { son('ding'); toast(nouvelles.length > 1 ? `${nouvelles.length} demandes de réservation` : `Demande de réservation : ${nouvelles[0].nom}, ${couverts(nouvelles[0].couverts)}, ${jourCourt(nouvelles[0].jour)} à ${heure(nouvelles[0].heure)}`); }
    // la carte de fidélité de chaque client, d'après son numéro
    const tels = [...new Set(liste.map((r) => r.tel))].filter((t) => !cartes.has(t));
    await Promise.all(tels.map((t) => fid.chercher(t).then((l) => cartes.set(t, l.find((c) => c.tel === t) || null))));
    rendre();
  }

  async function agir(b, r) {
    const act = b.dataset.act;
    const statut = async (s, sms) => {
      await api.resas.statut(r.id, s);
      if (sms && SMS[s]) await api.sms.envoyer([{ tel: r.tel, texte: SMS[s](r) }], 'resa');
    };
    if (act === 'confirmee') { await statut('confirmee', true); son('stamp'); toast(`Table de ${r.nom} confirmée : SMS envoyé (simulation).`); }
    if (act === 'confirmee-sans-sms') { await statut('confirmee'); son('tab'); }
    if (act === 'refusee' || act === 'annulee') {
      ad.deuxTouches(b, act === 'refusee' ? 'Toucher encore : refuser et prévenir par SMS' : 'Toucher encore : annuler et prévenir par SMS', async () => {
        await statut(act, true);
        son('down');
        toast(act === 'refusee' ? `Demande de ${r.nom} refusée : SMS envoyé (simulation).` : `Réservation de ${r.nom} annulée : SMS envoyé (simulation).`);
        charger();
      });
      return;
    }
    if (act === 'venue') {
      await statut('venue');
      son('add');
      const c = cartes.get(r.tel);
      toast(c ? `${r.nom} est là. Sa carte de fidélité est prête : +${r.couverts} points d'un geste.` : `${r.nom} est là. Bon service !`);
    }
    if (act === 'absente') { await statut('absente'); son('down'); }
    if (act === 'fidelite') { const c = cartes.get(r.tel); if (c) { location.hash = '#fidelite'; ad.montrer('fidelite'); ad.fidelite.ouvrir(c.id, r.couverts); } return; }
    charger();
  }

  /* ---------- noter un appel ---------- */
  function formulaire() {
    const f = $('#resa-ajout');
    const js = BB.nextOpenDays(21).map((d) => api.jourDe(d));
    const creneaux = [...BB.INFO.tableSlots.midi, ...BB.INFO.tableSlots.soir];
    f.innerHTML = `<h2 class="ad-sous">Noter un appel</h2>
      <div class="ad-grille">
        <label><span>Nom</span><input name="nom" autocomplete="off" required></label>
        <label><span>Téléphone</span><input name="tel" type="tel" inputmode="tel" autocomplete="off" required></label>
        <label><span>Jour</span><select name="jour">${js.map((j) => `<option value="${j}" ${j === jour ? 'selected' : ''}>${esc(jourCourt(j))}</option>`).join('')}</select></label>
        <label><span>Heure</span><select name="heure">${creneaux.map((h) => `<option value="${h}">${esc(heure(h))}</option>`).join('')}</select></label>
        <label><span>Couverts</span><input name="couverts" type="number" inputmode="numeric" min="1" max="60" value="2"></label>
        <label class="large"><span>Note (facultatif)</span><input name="note" autocomplete="off" placeholder="Anniversaire, chaise bébé, terrasse…"></label>
      </div>
      <label class="ad-coche"><input type="checkbox" name="sms" checked><span>Envoyer un SMS de confirmation</span></label>
      <div class="ad-actions"><button class="btn btn-main" type="submit">Enregistrer la réservation</button><button class="ad-petit" type="button" data-act="fermer">Fermer</button></div>`;
  }
  function initAjout() {
    const f = $('#resa-ajout');
    $('#resa-ajout-btn').addEventListener('click', () => {
      if (!f.hidden) { f.hidden = true; return; }
      formulaire();
      f.hidden = false;
      f.querySelector('[name="nom"]').focus();
    });
    f.addEventListener('click', (e) => { if (e.target.closest('[data-act="fermer"]')) f.hidden = true; });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(f));
      const nom = f.querySelector('[name="nom"]'), tel = f.querySelector('[name="tel"]');
      [nom, tel].forEach((x) => x.removeAttribute('aria-invalid'));
      if (!v.nom.trim()) { nom.setAttribute('aria-invalid', 'true'); son('nope'); toast('Le nom, s\'il vous plaît.'); return; }
      if (api.telNorm(v.tel).length < 10) { tel.setAttribute('aria-invalid', 'true'); son('nope'); toast('Le numéro de téléphone est incomplet.'); return; }
      const r = await api.resas.creer({ nom: v.nom.trim(), tel: v.tel, jour: v.jour, heure: v.heure, couverts: Number(v.couverts) || 2, note: v.note.trim(), source: 'telephone' });
      if (v.sms) await api.sms.envoyer([{ tel: r.tel, texte: SMS.confirmee(r) }], 'resa');
      son('stamp');
      toast(`Réservation notée : ${r.nom}, ${couverts(r.couverts)}, ${jourCourt(r.jour)} à ${heure(r.heure)}.`);
      f.hidden = true;
      jour = r.jour;
      connues && connues.add(r.id);
      charger();
    });
  }

  ad.module('resas', {
    init() {
      $('#resa-jours').addEventListener('click', (e) => {
        const b = e.target.closest('[data-jour]');
        if (!b) return;
        jour = b.dataset.jour;
        son('tab');
        rendre();
      });
      $('#resa-liste').addEventListener('click', (e) => {
        const b = e.target.closest('button[data-act]');
        if (!b) return;
        const r = liste.find((x) => x.id === b.closest('[data-id]').dataset.id);
        if (r) agir(b, r);
      });
      initAjout();
      api.resas.onChange(charger);
      fid.onChange(() => { cartes.clear(); charger(); });
      setInterval(() => { if (ad.ouvert()) charger(); }, 20000);
      charger();
    },
    entrer() { rendre(); },
  });
})();
