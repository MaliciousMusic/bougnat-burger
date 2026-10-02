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

  // un onglet jamais ouvert n'est pas mis en page (CSS : .view sans .vue) ; à sa première ouverture, il naît
  // (son style de départ est lu, pour que le fondu d'entrée joue), puis reste mis en page
  function show(view, first) {
    if (view === current) return;
    if (!first) document.querySelectorAll('.sheet.is-open').forEach((s) => BB.closeSheet('#' + s.id, true));
    const iNew = VIEWS.indexOf(view), iOld = VIEWS.indexOf(current);
    document.querySelectorAll('.view').forEach((v) => {
      const i = VIEWS.indexOf(v.dataset.view);
      const on = v.dataset.view === view;
      if (on && !v.classList.contains('vue')) {
        v.classList.add('vue');
        v.classList.toggle('is-left', i < iOld); // (il arrive du côté où il est rangé)
        if (!first) void getComputedStyle(v).opacity;
      }
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
    if (meta) meta.setAttribute('content', '#1A130F'); // le charbon de la barre du haut, sur tous les onglets
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
  }

  /* ---------- le retour en arrière ----------
     Chaque onglet visité et chaque fiche ouverte sont une étape de l'historique : le geste du bord de l'écran (ou le
     bouton retour) ferme d'abord la fiche, puis revient à l'onglet précédent, et finit à l'accueil. L'appli installée
     sur iPhone n'a pas ce geste : on le refait, depuis le bord gauche ou droit de l'écran. */
  const appli = window.navigator.standalone === true || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let depth = 0, sautePop = false;
  const etat = () => (history.state && typeof history.state.bb === 'number' ? history.state : null);
  function initRetour() {
    // l'étape de départ ; l'appli installée ouverte ailleurs qu'à l'accueil y revient en un geste
    if (etat()) depth = etat().bb;
    else if (appli && current !== 'accueil') {
      const ici = location.href;
      history.replaceState({ bb: 0 }, '', location.pathname + location.search + '#accueil');
      history.pushState({ bb: 1 }, '', ici);
      depth = 1;
    } else history.replaceState({ bb: 0 }, '');
    window.addEventListener('hashchange', () => {
      // un lien vers un onglet : une étape de plus (un pas dans l'historique, lui, retrouve la sienne)
      if (!etat()) history.replaceState({ bb: ++depth }, '');
      else depth = etat().bb;
      route(false);
    });
    window.addEventListener('popstate', () => {
      const st = etat();
      if (!st) return; // (un lien vers un onglet : hashchange s'en occupe)
      const recul = st.bb < depth;
      depth = st.bb;
      if (sautePop) { sautePop = false; return; }
      const ouverte = document.querySelector('.sheet.is-open');
      if (ouverte && st.feuille !== '#' + ouverte.id) { BB.closeSheet('#' + ouverte.id, true); return; }
      // une fiche refermée entre-temps (on avait changé d'onglet par-dessus) : on passe son étape
      if (st.feuille && !ouverte && recul) history.back();
    });
    geste();
  }
  // revenir d'un pas : la fiche ouverte se ferme ; sinon l'onglet précédent ; au bout, l'accueil
  function retour() {
    const ouverte = document.querySelector('.sheet.is-open');
    BB.sfx && BB.sfx.play(ouverte ? 'close' : 'tab');
    if (depth > 0) history.back();
    else if (ouverte) BB.closeSheet('#' + ouverte.id);
    else if (current !== 'accueil') {
      history.replaceState({ bb: 0 }, '', location.pathname + location.search + '#accueil');
      route(false);
    }
  }
  // le geste du bord de l'écran, refait pour l'appli installée sur iPhone (?geste pour l'essayer ailleurs) :
  // on glisse depuis le bord, une flèche suit le doigt ; lâchée assez loin, on revient d'un pas
  function geste() {
    let essai = false;
    try { essai = new URLSearchParams(location.search).has('geste'); } catch (e) { /* */ }
    if (window.navigator.standalone !== true && !essai) return;
    const BORD = 24, SEUIL = 72;
    const cue = document.createElement('div');
    cue.className = 'retour-cue';
    cue.setAttribute('aria-hidden', 'true');
    cue.innerHTML = '<svg viewBox="0 0 24 24"><path d="M14.5 5.5 8 12l6.5 6.5"/></svg>';
    document.body.appendChild(cue);
    let g = null;
    // (un carrousel qui touche le bord garde son défilement)
    const carrousel = (el) => {
      for (; el && el !== document.body; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 2) {
          const o = getComputedStyle(el).overflowX;
          if (o === 'auto' || o === 'scroll') return true;
        }
      }
      return false;
    };
    const poser = () => {
      const p = Math.min(1, g.dx / SEUIL);
      cue.classList.toggle('droite', g.cote < 0);
      cue.classList.toggle('pret', p >= 1);
      cue.style.opacity = String(Math.min(1, p * 1.5));
      cue.style.transform = `translate(${g.cote > 0 ? -48 + 62 * p : 48 - 62 * p}px, ${g.y}px)`;
    };
    document.addEventListener('touchstart', (e) => {
      g = null;
      if (e.touches.length !== 1) return;
      const t = e.touches[0], w = window.innerWidth;
      const cote = t.clientX < BORD ? 1 : t.clientX > w - BORD ? -1 : 0;
      if (!cote || carrousel(e.target)) return;
      g = { x: t.clientX, y: t.clientY, cote, dx: 0, parti: false };
    }, { passive: true });
    document.addEventListener('touchmove', (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = (t.clientX - g.x) * g.cote, dy = Math.abs(t.clientY - g.y);
      if (!g.parti) {
        if (dy > 18 && dy > dx) { g = null; return; } // (un défilement vertical)
        if (dx < 10) return;
        g.parti = true;
      }
      g.dx = Math.max(0, dx);
      g.y = t.clientY;
      poser();
    }, { passive: true });
    const lacher = (ok) => {
      if (!g) return;
      const go = ok && g.parti && g.dx >= SEUIL;
      g = null;
      cue.style.opacity = '0';
      cue.classList.remove('pret');
      if (go) retour();
    };
    document.addEventListener('touchend', () => lacher(true), { passive: true });
    document.addEventListener('touchcancel', () => lacher(false), { passive: true });
  }

  /* ---------- feuilles ---------- */
  const closers = new Map();
  BB.openSheet = function (sel, onClose) {
    const s = $(sel);
    if (!s) return;
    closers.set(sel, onClose);
    s._ferme = false;
    s.hidden = false;
    // une étape de l'historique : le retour en arrière la referme
    if (!(etat() && etat().feuille === sel)) history.pushState({ bb: ++depth, feuille: sel }, '');
    document.documentElement.classList.add('feuille'); // (CSS : ce qui est derrière cesse de flotter)
    requestAnimationFrame(() => requestAnimationFrame(() => s.classList.add('is-open')));
    const panel = s.querySelector('.sheet-panel');
    panel.setAttribute('tabindex', '-1');
    setTimeout(() => panel.focus({ preventScroll: true }), 60);
    stopFilm();
  };
  BB.closeSheet = function (sel, parHistorique) {
    const s = $(sel);
    if (!s || s.hidden || s._ferme) return;
    s._ferme = true;
    // refermée à la main (croix, glissé, ajout au sac) : son étape de l'historique s'en va aussi
    if (!parHistorique && etat() && etat().feuille === sel) { sautePop = true; history.back(); }
    s.classList.remove('is-open');
    const fn = closers.get(sel);
    closers.delete(sel);
    setTimeout(() => {
      s.hidden = true;
      if (!document.querySelector('.sheet.is-open')) document.documentElement.classList.remove('feuille');
      fn && fn();
      syncFilm();
    }, 420);
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
    initRetour();
    BB.splash(() => { filmAllowed = true; syncFilm(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopFilm(); else syncFilm(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
