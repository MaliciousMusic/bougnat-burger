/* ==========================================================================
   Bougnat Burger — les apparitions : ce qui porte la classe .reveal monte en
   fondu quand il arrive à l'écran (les hublots s'ouvrent, les prix se tamponnent).
   En changeant d'onglet, ce qui est visible rejoue son entrée, en cascade.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let io = null;

  function watch(el) {
    if (el._rv) return;
    el._rv = true;
    if (!io) { el.classList.add('is-in'); return; }
    io.observe(el);
  }
  BB.reveal = function (root) {
    (root || document).querySelectorAll('.reveal').forEach(watch);
  };

  // en arrivant sur un onglet : ce qui est à l'écran rejoue son entrée, l'un après l'autre
  function replay(view) {
    if (!io) return;
    const box = document.getElementById(view);
    if (!box) return;
    const sc = box.querySelector('.view-scroll');
    const h = (sc && sc.clientHeight) || window.innerHeight;
    const top = sc ? sc.getBoundingClientRect().top : 0;
    const seen = [...box.querySelectorAll('.reveal.is-in')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.bottom > top && r.top < top + h;
    });
    seen.forEach((el) => { el.style.transition = 'none'; el.classList.remove('is-in'); });
    void box.offsetWidth;
    seen.forEach((el, i) => {
      el.style.transition = '';
      el.style.transitionDelay = Math.min(i * 70, 420) + 'ms';
      el.classList.add('is-in');
      setTimeout(() => { el.style.transitionDelay = ''; }, 1200);
    });
  }

  function init() {
    if (!reduce && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          en.target.classList.add('is-in');
          io.unobserve(en.target);
        });
      }, { rootMargin: '0px 0px -6% 0px', threshold: 0.08 });
    }
    BB.reveal(document);
    // ce que la carte, le sac ou la réservation ajoutent plus tard
    const views = document.getElementById('views');
    if (views && 'MutationObserver' in window) {
      new MutationObserver((muts) => {
        muts.forEach((m) => m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.classList.contains('reveal')) watch(n);
          n.querySelectorAll && n.querySelectorAll('.reveal').forEach(watch);
        }));
      }).observe(views, { childList: true, subtree: true });
    }
    if (BB.on) BB.on('view', replay);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
