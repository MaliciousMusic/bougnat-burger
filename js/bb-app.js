/* ==========================================================================
   Bougnat Burger — l'appli : ouverture, onglets (#accueil, #carte, #commander, #reserver, #nous),
   feuilles qui montent, son, langue, film de l'accueil, QR sur ordinateur.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const VIEWS = ['accueil', 'carte', 'commander', 'reserver', 'nous'];
  let current = null;
  let film = null;
  let filmAllowed = false;

  /* ---------- le film de l'accueil ---------- */
  function startFilm() {
    const host = $('#film');
    if (!host) return;
    if (!film) {
      // le film : l'histoire du bougnat (js/film/bb-histoire.js, personnage dans bb-bougnat-dessin.js)
      if (BB.Histoire) {
        try {
          film = new BB.Histoire(host, {});
          if (BB.filmSound) film.onEvent = (type) => BB.filmSound.onEvent(type);
          host.classList.add('histoire');
        } catch (e) { console.warn('Histoire indisponible', e); film = null; }
      }
    }
    if (!film) { host.classList.add('no-film'); return; } // sinon le ciel peint du hublot (.film-fallback)
    film.start && film.start();
    BB.filmSound && BB.filmSound.start();
  }
  function stopFilm() {
    if (film && film.stop) film.stop();
    BB.filmSound && BB.filmSound.stop();
  }
  function syncFilm() { if (filmAllowed && current === 'accueil') startFilm(); else stopFilm(); }

  /* ---------- onglets ---------- */
  function route(first) {
    const raw = decodeURIComponent((location.hash || '#accueil').slice(1));
    let view = VIEWS.includes(raw) ? raw : null;
    let target = null;
    if (!view) {
      target = raw ? document.getElementById(raw) : null;
      const v = target && target.closest('.view');
      view = v ? v.dataset.view : 'accueil';
    }
    show(view, first);
    if (target) setTimeout(() => {
      const sc = target.closest('.view-scroll');
      if (sc) sc.scrollTo({ top: target.offsetTop - 12, behavior: BB.reduced ? 'auto' : 'smooth' });
    }, first ? 0 : 380);
  }

  function show(view, first) {
    if (view === current) return;
    const iNew = VIEWS.indexOf(view), iOld = VIEWS.indexOf(current);
    document.querySelectorAll('.view').forEach((v) => {
      const i = VIEWS.indexOf(v.dataset.view);
      const on = v.dataset.view === view;
      v.classList.toggle('is-active', on);
      v.classList.toggle('is-left', !on && i < iNew);
      v.setAttribute('aria-hidden', String(!on));
      if ('inert' in v) v.inert = !on;
    });
    document.querySelectorAll('#tabbar .tab').forEach((t) => {
      const on = t.dataset.tab === view;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    $('#tabbar').classList.toggle('on-nous', view === 'nous');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', view === 'nous' ? '#1E2613' : '#1A130F');
    void first; void iOld;
    current = view;
    syncFilm();
    BB.emit && BB.emit('view', view);
  }

  // re-toucher l'onglet actif : retour en haut de la vue
  function initTabs() {
    document.querySelectorAll('#tabbar .tab').forEach((t) => {
      t.addEventListener('click', (e) => {
        if (t.dataset.tab === current) {
          e.preventDefault();
          const sc = $(`#${current} .view-scroll`);
          if (sc) sc.scrollTo({ top: 0, behavior: BB.reduced ? 'auto' : 'smooth' });
        }
      });
    });
    window.addEventListener('hashchange', () => route(false));
  }

  /* ---------- feuilles ---------- */
  const closers = new Map();
  BB.openSheet = function (sel, onClose) {
    const s = $(sel);
    if (!s) return;
    closers.set(sel, onClose);
    s.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-open')));
    const panel = s.querySelector('.sheet-panel');
    panel.setAttribute('tabindex', '-1');
    setTimeout(() => panel.focus({ preventScroll: true }), 60);
    stopFilm();
  };
  BB.closeSheet = function (sel) {
    const s = $(sel);
    if (!s || s.hidden) return;
    s.classList.remove('is-open');
    const fn = closers.get(sel);
    closers.delete(sel);
    setTimeout(() => { s.hidden = true; fn && fn(); syncFilm(); }, 420);
  };
  function initSheets() {
    document.querySelectorAll('.sheet').forEach((s) => {
      const sel = '#' + s.id;
      s.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) BB.closeSheet(sel); });
      // glisser vers le bas pour fermer (depuis la poignée ou le visuel)
      const panel = s.querySelector('.sheet-panel');
      let y0 = null, dy = 0;
      panel.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('.sheet-grab, .p-name, .p-foot') && !(e.target.closest('.p-body') && panel.querySelector('.p-body').scrollTop <= 0 && e.pointerType === 'touch')) return;
        y0 = e.clientY; dy = 0;
        panel.style.transition = 'none';
      });
      panel.addEventListener('pointermove', (e) => {
        if (y0 == null) return;
        dy = Math.max(0, e.clientY - y0);
        panel.style.transform = `translateY(${dy}px)`;
      });
      const end = () => {
        if (y0 == null) return;
        y0 = null;
        panel.style.transition = '';
        panel.style.transform = '';
        if (dy > 110) BB.closeSheet(sel);
      };
      panel.addEventListener('pointerup', end);
      panel.addEventListener('pointercancel', end);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.sheet.is-open').forEach((s) => BB.closeSheet('#' + s.id));
    });
  }

  /* ---------- son et langue ---------- */
  function initSound() {
    const b = $('#sound-btn');
    if (!b) return;
    const sync = () => b.setAttribute('aria-pressed', String(!!BB.sfx.on));
    b.addEventListener('click', () => {
      BB.sfx.on = !BB.sfx.on;
      sync();
      BB.emit('sound', BB.sfx.on);
      if (BB.sfx.on) { BB.sfx.play('on'); syncFilm(); }
    });
    sync();
  }
  function initLang() {
    const b = $('#lang-btn'), list = $('#lang-list');
    if (!b || !list) return;
    const ouvrir = (on) => {
      list.hidden = !on;
      b.setAttribute('aria-expanded', String(on));
      if (on) { const cur = list.querySelector('[aria-current="true"]') || list.querySelector('a'); cur && cur.focus(); }
    };
    b.addEventListener('click', () => { ouvrir(list.hidden); BB.sfx.play(list.hidden ? 'close' : 'open'); });
    list.addEventListener('click', (e) => {
      const a = e.target.closest('[data-lang]');
      if (!a) return;
      e.preventDefault();
      ouvrir(false);
      b.focus();
      if (a.dataset.lang !== BB.lang) { BB.setLang(a.dataset.lang); BB.sfx.play('flip'); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !list.hidden) { ouvrir(false); b.focus(); } });
    document.addEventListener('pointerdown', (e) => { if (!list.hidden && !e.target.closest('.lang-choix')) ouvrir(false); });
  }

  /* le QR code du décor pour ordinateur est écrit dans la page (tools/render-qr.py) */

  /* ---------- démarrage ---------- */
  function init() {
    BB.applyLang();
    initSound();
    initLang();
    initSheets();
    BB.hours.init();
    BB.carte.init();
    BB.shop.init();
    BB.resa.init();
    initTabs();
    route(true);
    BB.splash(() => { filmAllowed = true; syncFilm(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopFilm(); else syncFilm(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
