/* ==========================================================================
   Bougnat Burger — le comptoir : le panneau de François pour les cartes de fidélité.
   · Le verrou : le code du restaurant (MAQUETTE : 2012 ; PROD : le compte de François sur le serveur).
   · Trouver la carte : le QR code du client (l'appareil photo du téléphone ouvre cette page sur ?carte=…,
     ou le bouton « Scanner » quand le navigateur sait lire les QR codes), sinon téléphone, n° de carte ou nom.
   · Un passage : le nombre de personnes à table, un point chacune ; annulable (erreur de saisie).
   · Les cadeaux : débloqués tous les 15 points, marqués « remis » quand on les donne.
   Toutes les lectures et écritures passent par BB.fidApi (js/bb-fid-api.js).
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const api = BB.fidApi;
  const F = BB.FIDELITE;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const fr = (o) => (o && o.fr) || o;
  const pts = (n) => (n < 2 ? `${n} point` : `${n} points`);
  const telAffiche = (t) => String(t).replace(/(\d{2})(?=\d)/g, '$1 ');
  const quand = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

  /* ---------- le toast ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('is-on'), 2600);
  }
  const son = (n, o) => { try { BB.sfx && BB.sfx.play(n, o); } catch (e) { /* pas de son */ } };

  /* ---------- le verrou ---------- */
  // MAQUETTE : un code en dur ; PROD : POST /api/session { identifiant, mot de passe } → jeton de session
  const CODE = '2012';
  // la carte scannée avant d'entrer le code : on l'ouvre une fois le comptoir déverrouillé
  let demandee = new URLSearchParams(location.search).get('carte');
  const ouvert = () => { try { return sessionStorage.getItem('bb-comptoir') === '1'; } catch (e) { return false; } };
  function deverrouiller(oui) {
    try { if (oui) sessionStorage.setItem('bb-comptoir', '1'); else sessionStorage.removeItem('bb-comptoir'); } catch (e) { /* navigation privée */ }
    $('#ad-verrou').hidden = oui;
    $('#ad-app').hidden = !oui;
    $('#ad-verrouiller').hidden = !oui;
    if (oui) {
      const id = demandee;
      demandee = null;
      if (id) ouvrir(id); else chercher('');
    } else { arreterCamera(); if (carte) fermer(); }
  }
  function initVerrou() {
    $('#ad-pin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const pin = $('#ad-pin');
      if (pin.value.trim() === CODE) { pin.value = ''; son('on'); deverrouiller(true); return; }
      pin.setAttribute('aria-invalid', 'true');
      pin.closest('form').classList.remove('secoue'); void pin.offsetWidth; pin.closest('form').classList.add('secoue');
      son('nope');
      toast('Code incorrect.');
    });
    $('#ad-pin').addEventListener('input', (e) => e.target.removeAttribute('aria-invalid'));
    $('#ad-verrouiller').addEventListener('click', () => deverrouiller(false));
    deverrouiller(ouvert());
    if (!ouvert()) setTimeout(() => $('#ad-pin').focus(), 50);
  }

  /* ---------- trouver une carte ---------- */
  function chercher(q) {
    api.chercher(q).then((l) => {
      const ul = $('#ad-resultats');
      if (!l.length) { ul.innerHTML = `<li class="vide">${q ? 'Aucune carte ne correspond.' : 'Aucune carte enregistrée pour l\'instant.'}</li>`; return; }
      ul.innerHTML = (q ? '' : '<li class="titre">Dernières cartes</li>') + l.map((c) => `<li><button type="button" data-carte="${esc(c.id)}">
        <span class="nom">${esc(c.prenom)} ${esc(c.nom)}</span>
        <span class="meta">${esc(telAffiche(c.tel))} · ${esc(c.id)}</span>
        <b class="pts">${esc(pts(c.points))}</b></button></li>`).join('');
    });
  }
  function initRecherche() {
    $('#ad-cherche').addEventListener('submit', (e) => { e.preventDefault(); chercher($('#ad-q').value); });
    $('#ad-q').addEventListener('input', (e) => { clearTimeout(e.target._t); e.target._t = setTimeout(() => chercher(e.target.value), 250); });
    $('#ad-resultats').addEventListener('click', (e) => { const b = e.target.closest('[data-carte]'); if (b) ouvrir(b.dataset.carte); });
  }

  /* ---------- le scan : la caméra et le détecteur de QR codes du navigateur ---------- */
  let flux = null, boucle = 0;
  // ce que contient le QR code : l'adresse de ce panneau (…/admin/?carte=ID), ou le n° de carte seul
  function lireCode(txt) {
    try { const u = new URL(txt); const c = u.searchParams.get('carte'); if (c) return c; } catch (e) { /* pas une adresse */ }
    return /BB-?[0-9A-Z]{4}-?[0-9A-Z]{4}/i.test(txt) ? txt.match(/BB-?[0-9A-Z]{4}-?[0-9A-Z]{4}/i)[0] : null;
  }
  async function scanner() {
    if (!('BarcodeDetector' in window) || !navigator.mediaDevices) {
      toast('Ce navigateur ne lit pas les QR codes : ouvrez l\'appareil photo du téléphone, le code mène directement ici.');
      return;
    }
    let det;
    try { det = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { toast('Lecture des QR codes indisponible ici.'); return; }
    try { flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }); } catch (e) { toast('Caméra refusée ou indisponible.'); return; }
    const v = $('#ad-video');
    v.srcObject = flux;
    $('#ad-camera').hidden = false;
    $('#ad-scan').hidden = true;
    await v.play().catch(() => {});
    const lire = async () => {
      if (!flux) return;
      try {
        const r = await det.detect(v);
        const id = r && r[0] && lireCode(r[0].rawValue);
        if (id) { son('stamp'); arreterCamera(); ouvrir(id); return; }
      } catch (e) { /* image pas encore prête */ }
      boucle = setTimeout(lire, 220);
    };
    lire();
  }
  function arreterCamera() {
    clearTimeout(boucle);
    if (flux) flux.getTracks().forEach((t) => t.stop());
    flux = null;
    const v = $('#ad-video');
    if (v) v.srcObject = null;
    $('#ad-camera').hidden = true;
    $('#ad-scan').hidden = false;
  }
  function initScan() {
    $('#ad-scan').addEventListener('click', scanner);
    $('#ad-camera-fermer').addEventListener('click', arreterCamera);
  }

  /* ---------- la carte ouverte ---------- */
  let carte = null, nb = 2;
  function ouvrir(id) {
    api.get(id).then((c) => {
      if (!c) { toast(`Carte inconnue : ${api.idNorm(id) || id}`); son('nope'); fermer(); return; }
      if (!carte || carte.id !== c.id) nb = 2;
      carte = c;
      history.replaceState(null, '', '?carte=' + encodeURIComponent(c.id));
      $('#ad-trouver').hidden = true;
      rendre();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  function fermer() {
    carte = null;
    $('#ad-carte').hidden = true;
    $('#ad-carte').innerHTML = '';
    $('#ad-trouver').hidden = false;
    if (location.search) history.replaceState(null, '', location.pathname);
    $('#ad-q').value = '';
    if (!$('#ad-app').hidden) chercher('');
  }
  function rendre() {
    const box = $('#ad-carte');
    if (!carte) { box.hidden = true; return; }
    const c = carte, max = api.max(), pas = F.pas, k = api.debloques(c), remis = c.remis || 0;
    const complet = c.points >= max;
    const suite = complet ? 'Carte complète : les six cadeaux sont débloqués.' : `Prochain cadeau dans ${pts((k + 1) * pas - c.points)} : ${fr(F.paliers[k].cadeau)} (${F.paliers[k].puy}).`;
    box.innerHTML = `
      <div class="ad-client">
        <div><h2>${esc(c.prenom)} ${esc(c.nom)}</h2><p>${esc(telAffiche(c.tel))} · <span class="nw">${esc(c.id)}</span></p></div>
        <button class="ad-suivante" type="button" data-act="fermer">${icon('i-fermer')}<span>Carte suivante</span></button>
      </div>
      <div class="ad-score"><b>${c.points}</b><span>${c.points < 2 ? 'point' : 'points'}</span><small>sur ${max}</small></div>
      <div class="ad-jauge" aria-hidden="true">${F.paliers.map((p, i) => {
        const fait = Math.max(0, Math.min(1, (c.points - i * pas) / pas));
        return `<span class="${i < k ? 'plein' : ''}"><i style="width:${Math.round(fait * 100)}%"></i>${icon('i-cadeau')}</span>`;
      }).join('')}</div>
      <p class="ad-suite">${esc(suite)}</p>
      ${k - remis > 0 ? `<p class="ad-alerte">${icon('i-cadeau')}<span>${k - remis > 1 ? `${k - remis} cadeaux à remettre` : '1 cadeau à remettre'}</span></p>` : ''}

      <div class="ad-passage">
        <h3>Combien de personnes à table ?</h3>
        <div class="ad-nb">
          <div class="stepper"><button type="button" data-nb="-1" aria-label="Une personne de moins">${icon('i-moins')}</button><output id="ad-nb" aria-live="polite">${nb}</output><button type="button" data-nb="1" aria-label="Une personne de plus">${icon('i-plus')}</button></div>
          <div class="ad-rapides">${[1, 2, 3, 4, 6, 8].map((n) => `<button type="button" data-fixe="${n}" class="${n === nb ? 'on' : ''}">${n}</button>`).join('')}</div>
        </div>
        <button class="btn btn-main ad-valider" type="button" data-act="valider" ${complet ? 'disabled' : ''}>${complet ? 'Carte complète' : `Valider le passage · +${pts(nb)}`}</button>
      </div>

      <h3>Les cadeaux</h3>
      <ol class="ad-cadeaux">${F.paliers.map((p, i) => {
        const seuil = (i + 1) * pas;
        let etat;
        if (i < remis) etat = `<em class="remis">${icon('i-ok')}Remis</em>`;
        else if (i < k) etat = i === remis ? '<button class="btn btn-main" type="button" data-act="remettre">Remettre</button>' : '<em class="a-remettre">À remettre</em>';
        else etat = `<em>encore ${esc(pts(seuil - c.points))}</em>`;
        return `<li class="${i < remis ? 'remis' : i < k ? 'debloque' : ''}"><span class="seuil">${seuil}</span><span class="quoi"><b>${esc(fr(p.cadeau))}</b><small>${esc(p.puy)}</small></span>${etat}</li>`;
      }).join('')}</ol>

      <h3>Les passages</h3>
      <ul class="ad-passages">${c.passages.length ? c.passages.slice().reverse().map((p) => `<li><span>${esc(quand(p.d))}</span><b>${p.n} pers. · +${esc(pts(p.n))}</b></li>`).join('') : '<li class="vide">Pas encore de passage.</li>'}</ul>
      ${c.passages.length ? '<button class="ad-annuler" type="button" data-act="annuler">Annuler le dernier passage</button>' : ''}
      <p class="fine">Carte créée le ${esc(new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(c.cree)))}.</p>`;
    box.hidden = false;
  }
  function majNb(n) {
    nb = Math.max(1, Math.min(40, n));
    $('#ad-nb').textContent = String(nb);
    document.querySelectorAll('.ad-rapides [data-fixe]').forEach((b) => b.classList.toggle('on', Number(b.dataset.fixe) === nb));
    const v = $('.ad-valider');
    if (v && !v.disabled) v.textContent = `Valider le passage · +${pts(nb)}`;
  }
  function initCarte() {
    const box = $('#ad-carte');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || !carte) return;
      if (b.dataset.nb) { majNb(nb + Number(b.dataset.nb)); son(Number(b.dataset.nb) > 0 ? 'up' : 'down'); return; }
      if (b.dataset.fixe) { majNb(Number(b.dataset.fixe)); son('tab'); return; }
      const act = b.dataset.act;
      if (act === 'fermer') { son('close'); fermer(); }
      if (act === 'valider') {
        const avant = api.debloques(carte), n = nb;
        api.crediter(carte.id, n).then((c) => {
          carte = c;
          son('stamp');
          const apres = api.debloques(c);
          toast(apres > avant ? `+${pts(n)} : cadeau débloqué pour ${c.prenom} (${fr(F.paliers[apres - 1].cadeau)}) !` : `+${pts(n)} pour ${c.prenom} · ${pts(c.points)}`);
          nb = 2;
          rendre();
        }, (err) => { son('nope'); toast(err.message === 'carte complète' ? 'Carte complète : plus de points à ajouter.' : 'Impossible d\'ajouter ce passage.'); });
      }
      if (act === 'remettre') {
        api.remettre(carte.id).then((c) => { carte = c; son('add'); toast(`Cadeau remis à ${c.prenom}.`); rendre(); });
      }
      if (act === 'annuler') {
        // deux touches : la seconde dans les 4 s
        if (!b.classList.contains('confirme')) {
          b.classList.add('confirme');
          b.textContent = 'Toucher encore pour annuler le dernier passage';
          setTimeout(() => { if (b.isConnected) { b.classList.remove('confirme'); b.textContent = 'Annuler le dernier passage'; } }, 4000);
          return;
        }
        api.annuler(carte.id).then((c) => { carte = c; son('down'); toast('Dernier passage annulé.'); rendre(); });
      }
    });
  }

  function init() {
    initVerrou();
    initRecherche();
    initScan();
    initCarte();
    // une carte changée ailleurs (la carte du client, un autre onglet) : on relit
    api.onChange(() => {
      if (carte) api.get(carte.id).then((c) => { if (c) { carte = c; rendre(); } else { toast('Cette carte a été supprimée.'); fermer(); } });
      else if (!$('#ad-app').hidden) chercher($('#ad-q').value);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
