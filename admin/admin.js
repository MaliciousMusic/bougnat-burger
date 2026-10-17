/* ==========================================================================
   Bougnat Burger — le comptoir : la coque commune aux cinq onglets.
   · Le verrou : le code du restaurant (MAQUETTE : 2012 ; PROD : le compte de François sur le serveur).
   · Les onglets (#commandes, #resas, #fidelite, #carte, #sms) : chaque fichier ad-*.js déclare le sien avec
     BB.ad.module(nom, { init, entrer, sortir, verrouiller }) ; init une fois le comptoir ouvert, entrer à chaque visite.
   · Les petits outils partagés : toast, sons, pastilles des onglets, « toucher deux fois » pour les gestes à risque.
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const telAffiche = (t) => String(t || '').replace(/(\d{2})(?=\d)/g, '$1 ');
  const prix = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const heure = (hhmm) => { const [h, m] = String(hhmm).split(':'); return `${Number(h)}h${m !== '00' ? m : ''}`; };
  const jourLong = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'));
  const jourCourt = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'));
  const heureDe = (iso) => { const d = new Date(iso); return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`; };

  /* ---------- le toast ---------- */
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('is-on'), 2800);
  }
  const son = (n, o) => { try { BB.sfx && BB.sfx.play(n, o); } catch (e) { /* pas de son */ } };

  // un geste qu'on ne veut pas faire par mégarde : la seconde touche dans les 4 s confirme
  function deuxTouches(b, texte, fn) {
    if (!b.classList.contains('confirme')) {
      const avant = b.innerHTML;
      b.classList.add('confirme');
      b.textContent = texte;
      setTimeout(() => { if (b.isConnected && b.classList.contains('confirme')) { b.classList.remove('confirme'); b.innerHTML = avant; } }, 4000);
      return;
    }
    b.classList.remove('confirme');
    fn();
  }

  /* ---------- les onglets ---------- */
  const modules = {};
  const VUES = ['commandes', 'resas', 'fidelite', 'carte', 'sms'];
  let vue = null, demarre = false;
  function module(nom, m) { modules[nom] = m; }
  function montrer(nom) {
    if (!VUES.includes(nom)) nom = 'commandes';
    if (vue && vue !== nom && modules[vue] && modules[vue].sortir) modules[vue].sortir();
    vue = nom;
    document.querySelectorAll('.ad-vue').forEach((s) => { s.hidden = s.dataset.vue !== nom; });
    document.querySelectorAll('#ad-onglets [data-vue]').forEach((a) => { if (a.dataset.vue === nom) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (modules[nom] && modules[nom].entrer) modules[nom].entrer();
  }
  function pastille(nom, n, alerte) {
    const b = $(`#ad-onglets [data-vue="${nom}"] .ad-pastille`);
    if (!b) return;
    b.hidden = !n;
    b.textContent = n > 99 ? '99+' : String(n || '');
    b.classList.toggle('alerte', !!alerte);
  }

  /* ---------- l'écran reste allumé tant que le comptoir est ouvert ----------
     Sinon le téléphone se met en veille, et les commandes ne sonnent plus (Wake Lock : Chrome, Edge, Safari 16.4+). */
  let veille = null;
  async function garderAllume() {
    if (!('wakeLock' in navigator) || !ouvert() || document.visibilityState !== 'visible' || veille) return;
    try {
      veille = await navigator.wakeLock.request('screen');
      veille.addEventListener('release', () => { veille = null; });
    } catch (e) { veille = null; /* batterie faible, ou refusé */ }
  }
  function laisserDormir() { if (veille) { veille.release().catch(() => {}); veille = null; } }
  document.addEventListener('visibilitychange', garderAllume);
  document.addEventListener('pointerdown', garderAllume, { passive: true }); // Safari veut parfois un geste

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
    $('#ad-onglets').hidden = !oui;
    $('#ad-verrouiller').hidden = !oui;
    document.body.classList.toggle('ad-ouvert', oui);
    if (oui) {
      if (!demarre) { demarre = true; VUES.forEach((n) => modules[n] && modules[n].init && modules[n].init()); }
      const id = demandee;
      demandee = null;
      if (id) { montrer('fidelite'); ad.fidelite.ouvrir(id); } else montrer((location.hash || '').slice(1));
      garderAllume();
    } else {
      laisserDormir();
      Object.values(modules).forEach((m) => m.verrouiller && m.verrouiller());
    }
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
    window.addEventListener('hashchange', () => { if (ouvert()) montrer(location.hash.slice(1)); });
  }

  const ad = (BB.ad = {
    $, esc, icon, toast, son, telAffiche, prix, heure, jourLong, jourCourt, heureDe, deuxTouches,
    module, montrer, pastille,
    vue: () => vue,
    ouvert,
  });

  function init() {
    initVerrou();
    deverrouiller(ouvert());
    if (!ouvert()) setTimeout(() => $('#ad-pin').focus(), 50);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else setTimeout(init, 0);
})();
