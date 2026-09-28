/* ==========================================================================
   Bougnat Burger — la fenêtre sur les avis Google (onglet « Nous »).
   Une sélection d'avis réels, reproduits tels quels avec leur date (BB.AVIS, dans bb-data.js),
   qu'on fait glisser ; ils défilent seuls tant qu'on n'y touche pas.
   PROD : remplacer BB.AVIS par l'API Google Places (note, nombre d'avis, derniers avis), avec l'attribution.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const etoile = '<svg aria-hidden="true"><use href="#i-etoile"/></svg>';

  function carte(a) {
    const n = Math.round(a.note);
    const txt = esc(a.texte).replace(/\n+/g, '<br>');
    return `<article class="avis-carte">
      <div class="avis-etoiles" role="img" aria-label="${esc(BB.t('etoiles', { n }))}">${etoile.repeat(n)}${'<i></i>'.repeat(5 - n)}</div>
      <p class="avis-texte" lang="fr">« ${txt} »</p>
      <button class="avis-plus" type="button" aria-expanded="false" hidden>${esc(BB.t('avisPlus'))}</button>
      <footer><b>${esc(a.nom)}</b><span>${esc(BB.tr(a.date))}</span></footer>
    </article>`;
  }

  let timer = 0, idx = 0, touche = false;
  function render() {
    const piste = $('#avis-piste'), points = $('#avis-points');
    if (!piste || !BB.AVIS) return;
    piste.innerHTML = BB.AVIS.map(carte).join('');
    points.innerHTML = BB.AVIS.map((_, i) => `<button type="button" aria-label="${esc(BB.t('avisN', { n: i + 1 }))}" data-i="${i}"></button>`).join('');
    points.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { touche = true; aller(+b.dataset.i); }));
    majPoints();
    if (document.getElementById('nous') && document.getElementById('nous').classList.contains('is-active')) replis();
  }
  // « Lire la suite » seulement pour les avis qui dépassent leurs lignes
  function replis() {
    requestAnimationFrame(() => document.querySelectorAll('#avis-piste .avis-carte').forEach((c) => {
      const t = c.querySelector('.avis-texte'), b = c.querySelector('.avis-plus');
      if (!t || !b || c.classList.contains('ouvert')) return;
      b.hidden = t.scrollHeight <= t.clientHeight + 2;
    }));
  }
  function basculer(b) {
    const c = b.closest('.avis-carte'), ouvert = !c.classList.contains('ouvert');
    c.classList.toggle('ouvert', ouvert);
    b.setAttribute('aria-expanded', String(ouvert));
    b.textContent = BB.t(ouvert ? 'avisMoins' : 'avisPlus');
    touche = true; // on lit : plus de défilement automatique
  }
  function aller(i) {
    const piste = $('#avis-piste');
    const c = piste && piste.children[i];
    if (!c) return;
    idx = i;
    piste.scrollTo({ left: c.offsetLeft - piste.offsetLeft - 16, behavior: BB.reduced ? 'auto' : 'smooth' });
    majPoints();
  }
  function majPoints() {
    const points = $('#avis-points');
    if (points) [...points.children].forEach((b, i) => b.classList.toggle('on', i === idx));
  }
  function suivre() {
    const piste = $('#avis-piste');
    if (!piste) return;
    let raf = 0;
    piste.addEventListener('scroll', () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const x = piste.scrollLeft + 16;
        let best = 0, d = Infinity;
        [...piste.children].forEach((c, i) => { const e = Math.abs(c.offsetLeft - piste.offsetLeft - x); if (e < d) { d = e; best = i; } });
        idx = best;
        majPoints();
      });
    }, { passive: true });
    ['pointerdown', 'wheel', 'touchstart'].forEach((ev) => piste.addEventListener(ev, () => { touche = true; }, { passive: true }));
    piste.addEventListener('click', (e) => { const b = e.target.closest('.avis-plus'); if (b) basculer(b); });
    if ('ResizeObserver' in window) new ResizeObserver(replis).observe(piste);
  }
  function defiler() {
    clearInterval(timer);
    if (BB.reduced) return;
    timer = setInterval(() => {
      const nous = document.getElementById('nous');
      if (touche || document.hidden || !nous || !nous.classList.contains('is-active') || !BB.AVIS) return;
      aller((idx + 1) % BB.AVIS.length);
    }, 6000);
  }
  /* le hublot : fondu enchaîné toutes les 4,5 s, seulement quand « Nous » est à l'écran */
  function diaporama() {
    const box = document.getElementById('diapo');
    if (!box) return;
    const imgs = [...box.querySelectorAll('img')];
    if (imgs.length < 2) return;
    let i = 0;
    setInterval(() => {
      const nous = document.getElementById('nous');
      if (document.hidden || !nous || !nous.classList.contains('is-active') || BB.reduced) return;
      const next = (i + 1) % imgs.length;
      const im = imgs[next];
      const go = () => { imgs[i].classList.remove('on'); im.classList.add('on'); i = next; };
      if (im.complete && im.naturalWidth) go();
      else { im.loading = 'eager'; im.addEventListener('load', go, { once: true }); }
    }, 4500);
  }
  function init() {
    render();
    suivre();
    defiler();
    diaporama();
    if (BB.on) { BB.on('lang', render); BB.on('view', (v) => { if (v === 'nous') replis(); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
