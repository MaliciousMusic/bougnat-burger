/* ==========================================================================
   Bougnat Burger — les apparitions : ce qui porte la classe .reveal monte en
   fondu quand il arrive à l'écran (les hublots s'ouvrent, les prix se tamponnent).
   En changeant d'onglet, ce qui est visible rejoue son entrée, en cascade.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let io = null, suivi = null;
  const visibles = new Set(); // ce qui est à l'écran en ce moment (suivi en continu : aucune mesure à faire)

  function watch(el) {
    if (el._rv) return;
    el._rv = true;
    if (!io) { el.classList.add('is-in'); return; }
    io.observe(el);
    if (suivi) suivi.observe(el);
  }
  BB.reveal = function (root) {
    (root || document).querySelectorAll('.reveal').forEach(watch);
  };

  // en arrivant sur un onglet : ce qui est à l'écran rejoue son entrée, l'un après l'autre.
  // Web Animations (opacité, translation : le compositeur s'en charge), sans lire ni forcer la mise en page.
  function replay(view) {
    if (!io) return;
    const box = document.getElementById(view);
    if (!box) return;
    let i = 0;
    visibles.forEach((el) => {
      if (!el.animate || !el.classList.contains('is-in') || !box.contains(el)) return;
      el.animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }],
        { duration: 560, delay: Math.min(i++ * 70, 420), easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'backwards' });
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
      suivi = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) visibles.add(en.target); else visibles.delete(en.target); });
      });
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
