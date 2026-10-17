/* ==========================================================================
   Bougnat Burger — le comptoir : les SMS aux clients.
   · Seulement aux clients qui l'ont accepté (case à part sur la carte de fidélité, jamais cochée d'office) :
     c'est la loi pour les SMS commerciaux (consentement préalable), avec un moyen de dire STOP dans chaque SMS.
   · Des modèles tout prêts (offres, soirées, fermetures…), à compléter là où il y a des [crochets] ;
     {prenom} se remplace par le prénom de chaque client. On peut garder ses propres modèles.
   · Tout de suite, ou programmé (une fois, ou chaque semaine). Le compteur dit combien de SMS ça coûte :
     160 caractères par SMS, 70 seulement dès qu'un caractère sort de l'alphabet SMS (é, è, à, ù y sont ;
     ê, â, ô, û, ç et les emoji n'y sont pas).
   · MAQUETTE : rien ne part ; les SMS s'écrivent dans le journal, et les messages programmés partent quand le
     comptoir est ouvert. PROD : le serveur envoie à l'heure dite par un prestataire SMS (Brevo, OVH, Twilio…).
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const ad = BB.ad;
  const api = BB.restoApi.sms;
  const fid = BB.fidApi;
  const { $, esc, icon, toast, son, telAffiche } = ad;

  // ⚠ le numéro court du STOP est donné par le prestataire SMS (il dépend du compte)
  const STOP = 'STOP au 36xxx';
  const SITE = 'bougnatburger.fr';

  /* ---------- les modèles ---------- */
  const MODELES = [
    { id: 'burger-mois', groupe: 'offre', titre: 'Le burger du mois', aide: 'Un nouveau burger à faire goûter', cible: 'tous',
      texte: 'Bougnat Burger : {prenom}, le burger du mois est arrivé : le [nom du burger] ! Venez le déguster avant qu\'il redescende du puy. ' + SITE },
    { id: 'emporter', groupe: 'offre', titre: 'Remise à emporter', aide: 'Un pourcentage sur les commandes en ligne', cible: 'tous',
      texte: 'Bougnat Burger : ce [jour], -[10] % sur les commandes à emporter passées sur ' + SITE + '. Bon appétit {prenom} !' },
    { id: 'dessert', groupe: 'offre', titre: 'Dessert offert', aide: 'À montrer au comptoir', cible: 'tous',
      texte: 'Bougnat Burger : {prenom}, ce [jour], le dessert est offert pour un burger mangé sur place. Montrez ce SMS au comptoir !' },
    { id: 'cadeau', groupe: 'offre', titre: 'Votre cadeau vous attend', aide: 'Aux clients qui ont un cadeau à retirer', cible: 'cadeau',
      texte: 'Bougnat Burger : {prenom}, votre bougnat a atteint un sommet ! Un cadeau vous attend au comptoir, passez le chercher.' },
    { id: 'absents', groupe: 'offre', titre: 'Vous nous manquez', aide: 'Aux clients pas venus depuis 6 semaines', cible: 'absents',
      texte: 'Bougnat Burger : {prenom}, cela fait un moment ! Le Saint-Nectaire vous attend, et votre carte de fidélité aussi. Revenez vite !' },
    { id: 'soiree', groupe: 'event', titre: 'Soirée spéciale', aide: 'Match, concert, soirée à thème', cible: 'tous',
      texte: 'Bougnat Burger : soirée [thème] le [date] dès [heure] ! Burgers, bières d\'Auvergne et bonne ambiance. Réservez sur ' + SITE },
    { id: 'nouvelle-carte', groupe: 'event', titre: 'Nouvelle carte', aide: 'De nouveaux plats arrivent', cible: 'tous',
      texte: 'Bougnat Burger : nouvelle carte dès le [date] ! [Nouveautés]. On vous attend {prenom}. ' + SITE },
    { id: 'anniversaire', groupe: 'event', titre: 'Anniversaire du Bougnat', aide: 'Le Bougnat est né le 2 février 2012', cible: 'tous',
      texte: 'Bougnat Burger a [14] ans le 2 février ! [La surprise] pour les fidèles. {prenom}, on compte sur vous.' },
    { id: 'fermeture', groupe: 'event', titre: 'Fermeture ou congés', aide: 'Prévenir avant de fermer', cible: 'tous',
      texte: 'Bougnat Burger : le restaurant sera fermé du [date] au [date]. On se retrouve dès le [date] pour de nouveaux burgers !' },
    { id: 'libre', groupe: 'event', titre: 'Message libre', aide: 'Une page blanche', cible: 'tous', texte: 'Bougnat Burger : ' },
  ];
  const PERSO = 'ad-sms-modeles';
  const perso = () => BB.store.get(PERSO, []);
  const CIBLES = {
    tous: 'Tous les clients inscrits aux SMS',
    cadeau: 'Ceux qui ont un cadeau à retirer',
    absents: 'Ceux qui ne sont pas venus depuis 6 semaines',
    fideles: 'Les fidèles (30 points et plus)',
  };

  /* ---------- les destinataires ---------- */
  let cartes = [];
  const dernier = (c) => new Date((c.passages.slice(-1)[0] || {}).d || c.cree).getTime();
  function destinataires(cible) {
    const l = cartes.filter((c) => c.sms && c.tel);
    if (cible === 'cadeau') return l.filter((c) => fid.debloques(c) > (c.remis || 0));
    if (cible === 'absents') return l.filter((c) => Date.now() - dernier(c) > 42 * 86400000);
    if (cible === 'fideles') return l.filter((c) => c.points >= 30);
    return l;
  }
  const personnaliser = (texte, c) => `${texte.replace(/\{prenom\}/g, c ? c.prenom : 'Camille').trim()} ${STOP}`;

  /* ---------- le compteur : l'alphabet SMS (GSM 03.38) ou l'Unicode ---------- */
  const GSM = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  const GSM_EXT = '^{}\\[~]|€';
  function compter(s) {
    let gsm = true, n = 0;
    for (const ch of s) { if (GSM.includes(ch)) n++; else if (GSM_EXT.includes(ch)) n += 2; else { gsm = false; break; } }
    if (!gsm) { const u = s.length; return { gsm, n: u, sms: u <= 70 ? 1 : Math.ceil(u / 67), hors: [...new Set([...s].filter((ch) => !GSM.includes(ch) && !GSM_EXT.includes(ch)))] }; }
    return { gsm, n, sms: n <= 160 ? 1 : Math.ceil(n / 153), hors: [] };
  }
  const trous = (t) => [...new Set(t.match(/\[[^\]]*\]/g) || [])];
  // l'heure d'envoi recommandée pour un SMS commercial : du lundi au samedi, de 8 h à 20 h
  function horsHeures(d) { const h = d.getHours() + d.getMinutes() / 60; return d.getDay() === 0 || h < 8 || h >= 20; }

  /* ---------- l'écran ---------- */
  let brouillon = null; // { modele, titre, texte, cible, quand: 'maintenant' | 'plus-tard', date, repete }
  const fmtQuand = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  const demainOnze = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(11, 0, 0, 0); return d; };
  const versChamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  function galerieHTML() {
    const bouton = (m, sup) => `<button type="button" class="ad-modele g-${m.groupe}" data-modele="${esc(m.id)}"><b>${esc(m.titre)}</b><small>${esc(m.aide || CIBLES[m.cible])}</small>${sup ? `<i data-suppr="${esc(m.id)}" role="button" aria-label="Supprimer ce modèle">${icon('i-fermer')}</i>` : ''}</button>`;
    const p = perso();
    return `<h2 class="ad-sous">Nouveau message</h2>
      <h3 class="ad-groupe">Offres</h3><div class="ad-modeles">${MODELES.filter((m) => m.groupe === 'offre').map((m) => bouton(m)).join('')}</div>
      <h3 class="ad-groupe">Événements et infos</h3><div class="ad-modeles">${MODELES.filter((m) => m.groupe === 'event').map((m) => bouton(m)).join('')}</div>
      ${p.length ? `<h3 class="ad-groupe">Vos modèles</h3><div class="ad-modeles">${p.map((m) => bouton(Object.assign({ groupe: 'perso' }, m), true)).join('')}</div>` : ''}`;
  }
  // ce qui bouge pendant la frappe : le compteur, l'aperçu, les alertes et le bouton d'envoi
  function etat() {
    const b = brouillon;
    const l = destinataires(b.cible), n = l.length, exemple = l[0];
    const final = personnaliser(b.texte, exemple || { prenom: 'Camille' });
    const c = compter(final);
    const manque = trous(b.texte);
    const quand = b.quand === 'plus-tard' ? new Date(b.date) : new Date();
    const alertes = [];
    if (manque.length) alertes.push(`À compléter : ${manque.map(esc).join(', ')}`);
    if (!n) alertes.push('Personne dans cette liste pour l\'instant : aucun client inscrit aux SMS ne correspond.');
    if (horsHeures(b.quand === 'plus-tard' ? quand : BB.parisNow())) alertes.push('En dehors des heures conseillées pour un SMS commercial (du lundi au samedi, 8 h à 20 h).');
    if (b.quand === 'plus-tard' && !(quand.getTime() > Date.now())) alertes.push(b.date ? 'Cette heure est déjà passée.' : 'Choisissez le jour et l\'heure.');
    const bloque = manque.length || !n || (b.quand === 'plus-tard' && !(quand.getTime() > Date.now()));
    return { n, exemple, final, c, alertes, bloque };
  }
  function zoneTexteHTML(e) {
    const { c } = e;
    return `<div class="ad-outils"><button class="ad-petit" type="button" data-act="prenom">+ {prenom}</button><span class="ad-compteur${c.sms > 1 ? ' cher' : ''}">${c.n} caractères · ${c.sms} SMS par client${c.gsm ? '' : ' (Unicode)'}</span></div>
      ${c.gsm ? '' : `<p class="ad-aide">Ces caractères font passer le SMS en Unicode, 70 caractères au lieu de 160 : ${c.hors.map((x) => `<code>${esc(x)}</code>`).join(' ')}. Sans accent, ça tient souvent en un seul SMS.</p>`}
      <div class="ad-bulle-zone"><p class="ad-aide">Ce que reçoit ${esc(e.exemple ? e.exemple.prenom : 'un client')} :</p><div class="ad-bulle">${esc(e.final)}</div></div>`;
  }
  function zoneEnvoiHTML(e) {
    const b = brouillon, n = e.n;
    return `${e.alertes.length ? `<ul class="ad-alertes">${e.alertes.map((a) => `<li>${a}</li>`).join('')}</ul>` : ''}
      <div class="ad-actions">
        <button class="btn btn-main" type="button" data-act="envoyer" ${e.bloque ? 'disabled' : ''}>${b.quand === 'plus-tard' ? `Programmer pour ${n} client${n > 1 ? 's' : ''}` : `Envoyer à ${n} client${n > 1 ? 's' : ''}`}</button>
        <button class="ad-petit" type="button" data-act="test">M'envoyer un test</button>
        <button class="ad-petit" type="button" data-act="garder">Garder comme modèle</button>
      </div>
      <p class="fine">${n} × ${e.c.sms} = ${n * e.c.sms} SMS${b.repete === 'semaine' && b.quand === 'plus-tard' ? ' chaque semaine' : ''}. Maquette : rien ne part, les SMS s'écrivent dans le journal plus bas.</p>`;
  }
  function editeurHTML() {
    const b = brouillon, e = etat();
    return `<form class="ad-editeur who" id="sms-editeur" novalidate>
      <div class="ad-entete"><h2 class="ad-sous" id="sms-titre">${esc(b.titre || 'Message')}</h2><button class="ad-petit" type="button" data-act="fermer">Fermer</button></div>
      <label><span>Nom du message (pour vous)</span><input name="titre" value="${esc(b.titre)}" autocomplete="off"></label>
      <label><span>Le texte</span><textarea name="texte" rows="4">${esc(b.texte)}</textarea></label>
      <div id="sms-zone-texte">${zoneTexteHTML(e)}</div>
      <label><span>À qui ?</span><select name="cible">${Object.entries(CIBLES).map(([k, v]) => `<option value="${k}" ${k === b.cible ? 'selected' : ''}>${esc(v)} (${destinataires(k).length})</option>`).join('')}</select></label>
      <fieldset class="ad-quand"><legend>Quand ?</legend>
        <label class="ad-coche"><input type="radio" name="quand" value="maintenant" ${b.quand !== 'plus-tard' ? 'checked' : ''}><span>Tout de suite</span></label>
        <label class="ad-coche"><input type="radio" name="quand" value="plus-tard" ${b.quand === 'plus-tard' ? 'checked' : ''}><span>Programmer</span></label>
        ${b.quand === 'plus-tard' ? `<div class="ad-grille"><label><span>Le</span><input type="datetime-local" name="date" value="${esc(b.date)}"></label>
          <label><span>Répéter</span><select name="repete"><option value="non" ${b.repete !== 'semaine' ? 'selected' : ''}>Une seule fois</option><option value="semaine" ${b.repete === 'semaine' ? 'selected' : ''}>Chaque semaine</option></select></label></div>` : ''}
      </fieldset>
      <div id="sms-zone-envoi">${zoneEnvoiHTML(e)}</div>
    </form>`;
  }
  function rafraichir() {
    if (!brouillon || !$('#sms-editeur')) return;
    const e = etat();
    $('#sms-zone-texte').innerHTML = zoneTexteHTML(e);
    $('#sms-zone-envoi').innerHTML = zoneEnvoiHTML(e);
    $('#sms-titre').textContent = brouillon.titre || 'Message';
  }
  async function listesHTML() {
    const camps = await api.campagnes();
    const prog = camps.filter((c) => c.statut === 'programmee');
    const faits = camps.filter((c) => c.envois.length).sort((a, b) => b.envois.slice(-1)[0].d.localeCompare(a.envois.slice(-1)[0].d));
    const journal = (await api.journal()).slice(0, 30);
    const TYPE = { offre: 'Offre', commande: 'Commande', resa: 'Réservation', test: 'Test' };
    ad.pastille('sms', prog.length, false);
    return `<h2 class="ad-sous">Programmés ${prog.length ? `<b>${prog.length}</b>` : ''}</h2>
      ${prog.length ? prog.map((c) => `<article class="ad-camp" data-id="${esc(c.id)}">
        <p class="t"><b>${esc(c.titre)}</b><span>${icon('i-horloge')}${esc(fmtQuand(c.quand))}${c.repete === 'semaine' ? ' · chaque semaine' : ''}</span></p>
        <p class="meta">${esc(CIBLES[c.cible] || c.cible)} · ${destinataires(c.cible).length} aujourd'hui</p>
        <p class="txt">${esc(c.texte)}</p>
        <div class="ad-actions"><button class="ad-petit ad-danger" type="button" data-act="annuler">Annuler</button></div></article>`).join('') : '<p class="ad-vide">Aucun message programmé.</p>'}
      <h2 class="ad-sous">Déjà envoyés</h2>
      ${faits.length ? faits.slice(0, 12).map((c) => { const e = c.envois.slice(-1)[0]; return `<article class="ad-camp fait"><p class="t"><b>${esc(c.titre)}</b><span>${esc(fmtQuand(e.d))}</span></p><p class="meta">${e.nb} client${e.nb > 1 ? 's' : ''}${c.envois.length > 1 ? ` · ${c.envois.length} envois` : ''}</p></article>`; }).join('') : '<p class="ad-vide">Rien d\'envoyé pour l\'instant.</p>'}
      <h2 class="ad-sous">Journal des SMS <small>(simulation)</small></h2>
      ${journal.length ? `<ul class="ad-journal">${journal.map((j) => `<li><span class="q">${esc(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(j.d)))}</span><span class="type t-${esc(j.type)}">${esc(TYPE[j.type] || j.type)}</span><span class="tel">${esc(telAffiche(j.tel))}</span><span class="txt">${esc(j.texte)}</span></li>`).join('')}</ul>` : '<p class="ad-vide">Les SMS envoyés (commandes prêtes, réservations, offres) s\'afficheront ici.</p>'}`;
  }
  async function rendre() {
    cartes = await fid.toutes();
    const inscrits = cartes.filter((c) => c.sms).length;
    const box = $('#sms-contenu');
    box.innerHTML = `<div class="ad-public"><b>${inscrits}</b><span>client${inscrits > 1 ? 's' : ''} inscrit${inscrits > 1 ? 's' : ''} aux SMS<small>sur ${cartes.length} carte${cartes.length > 1 ? 's' : ''} de fidélité. Seuls ceux qui ont coché la case des offres reçoivent ces messages.</small></span></div>
      ${brouillon ? editeurHTML() : galerieHTML()}
      <div id="sms-listes">${await listesHTML()}</div>`;
  }

  /* ---------- les gestes ---------- */
  function ouvrirModele(id) {
    const m = MODELES.find((x) => x.id === id) || perso().find((x) => x.id === id);
    if (!m) return;
    brouillon = { modele: m.id, titre: m.titre, texte: m.texte, cible: m.cible || 'tous', quand: 'maintenant', date: versChamp(demainOnze()), repete: 'non' };
    son('open');
    rendre().then(() => { const t = $('#sms-editeur textarea'); if (t) { t.focus(); const i = t.value.indexOf('['); t.setSelectionRange(i >= 0 ? i : t.value.length, i >= 0 ? t.value.indexOf(']', i) + 1 : t.value.length); } window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  async function envoyerMaintenant(b) {
    const l = destinataires(b.cible);
    await api.envoyer(l.map((c) => ({ tel: c.tel, texte: personnaliser(b.texte, c) })), 'offre');
    const camp = await api.programmer({ modele: b.modele, titre: b.titre, texte: b.texte, cible: b.cible, quand: new Date().toISOString(), repete: 'non' });
    await api.partie(camp.id, l.length);
    return l.length;
  }
  // les messages programmés arrivés à l'heure (MAQUETTE : quand le comptoir est ouvert ; PROD : le serveur)
  async function tic() {
    const camps = await api.campagnes();
    const dues = camps.filter((c) => c.statut === 'programmee' && new Date(c.quand).getTime() <= Date.now());
    if (!dues.length) return;
    cartes = await fid.toutes();
    for (const c of dues) {
      const l = destinataires(c.cible);
      await api.envoyer(l.map((x) => ({ tel: x.tel, texte: personnaliser(c.texte, x) })), 'offre');
      await api.partie(c.id, l.length);
      son('ding');
      toast(`« ${c.titre} » est parti vers ${l.length} client${l.length > 1 ? 's' : ''} (simulation).`);
    }
    if (ad.vue() === 'sms') rendre();
  }

  function initEvenements() {
    const box = $('#sms-contenu');
    box.addEventListener('click', async (e) => {
      const suppr = e.target.closest('[data-suppr]');
      if (suppr) { e.stopPropagation(); BB.store.set(PERSO, perso().filter((m) => m.id !== suppr.dataset.suppr)); son('down'); rendre(); return; }
      const m = e.target.closest('[data-modele]');
      if (m) { ouvrirModele(m.dataset.modele); return; }
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'fermer') { brouillon = null; son('close'); rendre(); }
      if (act === 'prenom') {
        const t = $('#sms-editeur textarea'), p = t.selectionStart ?? t.value.length;
        t.setRangeText('{prenom}', p, t.selectionEnd ?? p, 'end');
        t.focus();
        brouillon.texte = t.value;
        rafraichir();
      }
      if (act === 'garder') {
        const l = perso().filter((x) => x.titre !== brouillon.titre);
        l.push({ id: 'p-' + Date.now().toString(36), titre: brouillon.titre || 'Mon modèle', aide: 'Votre modèle', texte: brouillon.texte, cible: brouillon.cible });
        BB.store.set(PERSO, l);
        son('add');
        toast(`Modèle gardé : « ${brouillon.titre || 'Mon modèle'} ».`);
      }
      if (act === 'test') {
        let tel = BB.store.get('ad-sms-test', '');
        if (!tel) { tel = window.prompt('Votre numéro de téléphone, pour recevoir les tests :', '') || ''; if (BB.restoApi.telNorm(tel).length < 10) { if (tel) toast('Numéro incomplet.'); return; } BB.store.set('ad-sms-test', BB.restoApi.telNorm(tel)); tel = BB.restoApi.telNorm(tel); }
        await api.envoyer([{ tel, texte: personnaliser(brouillon.texte, { prenom: 'François' }) }], 'test');
        son('tab');
        toast(`Test envoyé au ${telAffiche(tel)} (simulation).`);
        rendre();
      }
      if (act === 'envoyer') {
        const b0 = brouillon;
        const n = destinataires(b0.cible).length;
        const txt = b0.quand === 'plus-tard' ? `Toucher encore : programmer pour ${n} client${n > 1 ? 's' : ''}` : `Toucher encore : envoyer à ${n} client${n > 1 ? 's' : ''}`;
        ad.deuxTouches(b, txt, async () => {
          if (b0.quand === 'plus-tard') {
            await api.programmer({ modele: b0.modele, titre: b0.titre, texte: b0.texte, cible: b0.cible, quand: new Date(b0.date).toISOString(), repete: b0.repete });
            son('stamp');
            toast(`« ${b0.titre} » programmé : ${fmtQuand(new Date(b0.date).toISOString())}.`);
          } else {
            const nb = await envoyerMaintenant(b0);
            son('stamp');
            toast(`« ${b0.titre} » envoyé à ${nb} client${nb > 1 ? 's' : ''} (simulation).`);
          }
          brouillon = null;
          rendre();
        });
      }
      if (act === 'annuler') {
        const id = b.closest('[data-id]').dataset.id;
        ad.deuxTouches(b, 'Toucher encore pour annuler', async () => { await api.annuler(id); son('down'); toast('Message programmé annulé.'); rendre(); });
      }
    });
    // la saisie : le brouillon suit, l'aperçu et le compteur aussi
    box.addEventListener('input', (e) => {
      if (!brouillon || !e.target.closest('#sms-editeur')) return;
      const t = e.target;
      if (t.name === 'texte' || t.name === 'titre') { brouillon[t.name] = t.value; rafraichir(); }
      if (t.name === 'date') { brouillon.date = t.value; rafraichir(); }
    });
    box.addEventListener('change', (e) => {
      if (!brouillon || !e.target.closest('#sms-editeur')) return;
      const t = e.target;
      if (['cible', 'quand', 'repete'].includes(t.name)) { brouillon[t.name] = t.value; son('tab'); rendre(); }
    });
  }

  ad.module('sms', {
    init() {
      initEvenements();
      api.onChange(() => { if (ad.vue() === 'sms' && !(document.activeElement && document.activeElement.closest('#sms-editeur'))) rendre(); });
      fid.onChange(() => { if (ad.vue() === 'sms' && !brouillon) rendre(); });
      setInterval(() => { if (ad.ouvert()) tic(); }, 20000);
      tic();
      api.campagnes().then((l) => ad.pastille('sms', l.filter((c) => c.statut === 'programmee').length, false));
    },
    entrer() { rendre(); },
  });
})();
