/* ==========================================================================
   Bougnat Burger — l'ouverture, avec LEUR logo : le volcan vert peint au pinceau et son contour
   blanc, vectorisés tels quels (js/bb-logo.js), posés sur un écusson charbon comme sur leur
   enseigne. « BOUGNAT » et « BURGER » s'enroulent autour, dans une police plus belle.
   · Avant le geste : l'écusson se pose, le vert se peint d'un coup de pinceau, puis le contour ;
     les mots en filigrane ; bouton « Entrer ».
   · « Entrer » (le geste qui autorise le son) : les lettres éclosent une à une, chacune sur sa note,
     puis accord final, un reflet traverse le volcan.
   · Son coupé : elle part toute seule. Une fois par session ; ?intro la rejoue ; un tap la passe.
   · ?font=ultra | alfa | holtwood | bagel pour comparer d'autres polices (Shrikhand par défaut).
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const S = (tag, attrs, parent) => BB.svg(tag, attrs, parent);

  const FONTS = {
    shrikhand: { family: 'Shrikhand', size: 38, spacing: 1.6, cap: 0.74 },
    ultra: { family: 'Ultra', size: 40, spacing: 3, cap: 0.7 },
    alfa: { family: 'Alfa Slab One', size: 40, spacing: 2.6, cap: 0.7 },
    holtwood: { family: 'Holtwood One SC', size: 30, spacing: 1.6, cap: 0.76 },
    bagel: { family: 'Bagel Fat One', size: 42, spacing: 2.2, cap: 0.72 },
  };

  const CX = 200, CY = 200;   // centre de l'écusson (viewBox 400 × 400)
  const R_DISC = 178;         // l'écusson
  const R_WORDS = 128;        // ligne de base du mot du haut (le mot du bas lui fait face, contre l'autre bord)
  const VOLCANO_W = 228;      // largeur du volcan dans l'écusson

  function build(root, font) {
    const L = BB.LOGO;
    const svg = S('svg', { viewBox: '0 0 400 400', role: 'img', 'aria-label': 'Bougnat Burger' }, root);
    const defs = S('defs', {}, svg);
    defs.innerHTML = `
      <radialGradient id="sp-disc" cx="0.42" cy="0.36" r="0.75">
        <stop offset="0" stop-color="#43291A"/><stop offset="0.6" stop-color="#2E1C12"/><stop offset="1" stop-color="#1E120B"/>
      </radialGradient>
      <radialGradient id="sp-halo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0.7" stop-color="#6B3E22" stop-opacity="0.28"/><stop offset="1" stop-color="#6B3E22" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="sp-glint" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>`;

    /* l'écusson : ombre douce, disque charbon, filets, deux losanges entre les mots */
    const disc = S('g', { class: 'sp-disc' }, svg);
    S('circle', { cx: CX, cy: CY + 6, r: R_DISC + 14, fill: 'url(#sp-halo)' }, disc);
    S('circle', { cx: CX, cy: CY, r: R_DISC, fill: 'url(#sp-disc)' }, disc);
    // la jante du hublot (vert du logo) et son biseau
    S('circle', { cx: CX, cy: CY, r: R_DISC - 5, fill: 'none', stroke: '#7C8A3A', 'stroke-width': 10 }, disc); // jante olive
    S('circle', { cx: CX, cy: CY, r: R_DISC - 10.5, fill: 'none', stroke: L.green, 'stroke-width': 1.6 }, disc); // filet du vert du logo
    S('circle', { cx: CX, cy: CY, r: R_DISC - 11, fill: 'none', stroke: '#0E0906', 'stroke-opacity': 0.55, 'stroke-width': 3 }, disc);
    S('path', { d: `M${CX - 150} ${CY - 60}A160 160 0 0 1 ${CX - 40} ${CY - 158}`, fill: 'none', stroke: '#FBF4E6', 'stroke-opacity': 0.16, 'stroke-width': 5, 'stroke-linecap': 'round' }, disc);
    S('circle', { cx: CX, cy: CY, r: R_WORDS - 10, fill: 'none', stroke: '#FBF4E6', 'stroke-opacity': 0.14, 'stroke-width': 1.2, 'stroke-dasharray': '2 6', 'stroke-linecap': 'round' }, disc);
    [-1, 1].forEach((side) => {
      const x = CX + side * (R_WORDS + 17), y = CY;
      S('path', { d: `M${x} ${y - 6}L${x + 5} ${y}L${x} ${y + 6}L${x - 5} ${y}Z`, fill: L.green }, disc);
    });

    /* le volcan, tel quel : l'aplat vert puis le contour blanc, chacun révélé par un coup de pinceau */
    const s = VOLCANO_W / L.w;
    const vh = L.h * s;
    const vx = CX - VOLCANO_W / 2, vy = CY - vh / 2 + 8;
    const volcano = S('g', { class: 'sp-volcano', transform: `translate(${BB.f(vx)} ${BB.f(vy)}) scale(${Math.round(s * 1000) / 1000})` }, svg);
    const mkReveal = (id, seed) => {
      const cp = S('clipPath', { id }, defs);
      // un bord de pinceau irrégulier qui balaie de gauche à droite (on anime sa translation)
      const r = BB.rng(seed);
      const edge = [];
      for (let y = -30; y <= L.h + 30; y += 18) edge.push([(r() - 0.5) * 26, y]);
      const d = `M${-L.w - 60} -30 ` + edge.map(([x, y]) => `L${BB.f(x)} ${BB.f(y)}`).join(' ') + ` L${-L.w - 60} ${L.h + 30}Z`;
      return S('path', { d }, cp);
    };
    const revGreen = mkReveal('sp-rev-green', 3);
    const revWhite = mkReveal('sp-rev-white', 9);
    const gGreen = S('g', { 'clip-path': 'url(#sp-rev-green)' }, volcano);
    S('path', { d: L.dGreen, fill: L.green, 'fill-rule': 'evenodd' }, gGreen);
    const gWhite = S('g', { 'clip-path': 'url(#sp-rev-white)' }, volcano);
    S('path', { d: L.dWhite, fill: '#FFFFFF', 'fill-rule': 'evenodd' }, gWhite);
    // un reflet qui traverse le vert à la fin
    const glintClip = S('clipPath', { id: 'sp-glint-clip' }, defs);
    S('path', { d: L.dGreen }, glintClip);
    const glintG = S('g', { 'clip-path': 'url(#sp-glint-clip)' }, volcano);
    const glint = S('rect', { x: -140, y: -20, width: 100, height: L.h + 40, fill: 'url(#sp-glint)', opacity: 0 }, glintG);

    /* ---------- les mots, lettre par lettre, posés sur l'arc ---------- */
    const words = S('g', { class: 'sp-words' }, svg);
    const letters = [];
    const measure = S('text', { x: -999, y: -999, 'font-family': `'${font.family}'`, 'font-size': font.size }, svg);
    const widthOf = (ch) => { measure.textContent = ch; return measure.getComputedTextLength() || font.size * 0.7; };
    const cap = font.size * font.cap;
    function place(word, top) {
      const ws = [...word].map(widthOf);
      const R = top ? R_WORDS : R_WORDS + cap;          // rayon de la ligne de base
      const Rm = top ? R + cap * 0.35 : R - cap * 0.35;   // l'arc est mesuré au milieu des lettres
      const total = ws.reduce((a, b) => a + b, 0) + font.spacing * (ws.length - 1);
      let acc = -total / 2;
      [...word].forEach((ch, i) => {
        const mid = acc + ws[i] / 2;
        acc += ws[i] + font.spacing;
        const th = mid / Rm;
        const x = CX + R * Math.sin(th);
        const y = top ? CY - R * Math.cos(th) : CY + R * Math.cos(th);
        const rot = top ? (th * 180) / Math.PI : (-th * 180) / Math.PI;
        const g = S('g', { transform: `translate(${BB.f(x)} ${BB.f(y)}) rotate(${BB.f(rot)})` }, words);
        const inner = S('g', { class: 'sp-l' }, g); // on anime ce groupe (jamais le <text> : WebKit)
        const attrs = { 'text-anchor': 'middle', 'font-family': `'${font.family}', Georgia, serif`, 'font-size': font.size };
        const shadow = S('text', { ...attrs, x: 1.8, y: 2.4, fill: '#7C8A3A', opacity: 0 }, inner); // impression en deux couleurs : crème et olive
        const body = S('text', { ...attrs, fill: 'none', stroke: '#FBF4E6', 'stroke-width': 1, 'stroke-opacity': 0.35 }, inner);
        shadow.textContent = ch; body.textContent = ch;
        letters.push({ g: inner, body, shadow });
      });
    }
    place('BOUGNAT', true);
    place('BURGER', false);
    measure.remove();

    return { svg, disc, revGreen, revWhite, glint, letters, L };
  }

  /* ---------- animation ---------- */
  const anim = (el, frames, opts) => (el.animate ? el.animate(frames, { fill: 'both', ...opts }) : null);
  // balayage d'un masque de pinceau : la translation est réécrite image par image (fiable partout, WebKit compris)
  function sweep(band, L, dur, delay) {
    const from = 0, to = L.w + 40; // la bande couvre [-w-60, 0] au départ, [-20, w+40] à la fin
    band.setAttribute('transform', `translate(${from} 0)`);
    const t0 = performance.now() + delay;
    const step = (now) => {
      const p = BB.clamp((now - t0) / dur);
      band.setAttribute('transform', `translate(${BB.f(from + (to - from) * BB.ease.inOutCubic(p))} 0)`);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  // le reflet : même principe (une translation dans le repère du volcan)
  function glide(el, L, dur, delay) {
    const t0 = performance.now() + delay;
    const step = (now) => {
      const p = BB.clamp((now - t0) / dur);
      el.setAttribute('transform', `translate(${BB.f((L.w + 280) * BB.ease.inOutSine(p))} 0) skewX(-18)`);
      el.setAttribute('opacity', String(Math.sin(Math.PI * p).toFixed(3)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function compose(P, fast) {
    const k = fast ? 0.3 : 1;
    P.disc.style.transformBox = 'fill-box';
    P.disc.style.transformOrigin = '50% 50%';
    anim(P.disc, [{ transform: 'scale(0.6)', opacity: 0 }, { transform: 'scale(1.03)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 620 * k, easing: 'cubic-bezier(.3,.7,.3,1)' });
    sweep(P.revGreen, P.L, 950 * k, 380 * k);
    sweep(P.revWhite, P.L, 850 * k, 1050 * k);
    P.letters.forEach((l, i) => anim(l.g, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: (1300 + i * 30) * k }));
    return 2000 * k;
  }

  function lettersPop(P, withSound) {
    const n = P.letters.length;
    const step = 95;
    P.letters.forEach((l, i) => {
      const delay = i * step + (i >= 7 ? 140 : 0); // petite respiration entre les deux mots
      l.g.style.transformBox = 'fill-box';
      l.g.style.transformOrigin = '50% 70%';
      setTimeout(() => {
        l.body.setAttribute('fill', '#FBF4E6');
        l.body.setAttribute('stroke', 'none');
        l.shadow.setAttribute('opacity', '1');
        if (withSound) BB.sfx.play('tab', { i: i >= 7 ? i - 5 : i });
      }, delay);
      anim(l.g, [{ transform: 'scale(0.3)', opacity: 0.4 }, { transform: 'scale(1.22)', opacity: 1, offset: 0.55 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, delay, easing: 'cubic-bezier(.3,1.4,.5,1)' });
    });
    const end = (n - 1) * step + 140 + 420;
    setTimeout(() => {
      if (withSound) BB.sfx.play('chord');
      glide(P.glint, P.L, 900, 0);
    }, end);
    return end + 700;
  }

  /* ---------- point d'entrée ---------- */
  BB.splash = function (onDone) {
    const el = document.getElementById('splash');
    const stage = document.getElementById('splash-stage');
    const go = document.getElementById('splash-go');
    if (!el) { onDone && onDone(); return; }
    let params;
    try { params = new URLSearchParams(location.search); } catch (e) { params = new URLSearchParams(); }
    let seen = false;
    try { seen = sessionStorage.getItem('bb:intro') === '1'; } catch (e) { /* navigation privée */ }
    if ((seen && !params.has('intro')) || !BB.LOGO) { el.remove(); onDone && onDone(); return; }

    const key = (params.get('font') || 'shrikhand').toLowerCase();
    const font = FONTS[key] || FONTS.shrikhand;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { sessionStorage.setItem('bb:intro', '1'); } catch (e) { /* idem */ }
      el.classList.add('is-gone');
      setTimeout(() => el.remove(), 900);
      onDone && onDone();
    };

    const ready = document.fonts && document.fonts.load
      ? Promise.race([document.fonts.load(`${font.size}px '${font.family}'`), BB.wait(1800)])
      : BB.wait(300);
    ready.then(() => {
      const P = build(stage, font);
      const tCompose = compose(P, BB.reduced);
      const soundOn = BB.sfx && BB.sfx.supported && BB.sfx.on !== false;
      if (!soundOn || BB.reduced) {
        // son coupé (ou mouvement réduit) : pas de bouton, elle part toute seule
        go.remove();
        setTimeout(() => setTimeout(finish, lettersPop(P, false)), tCompose + 200);
        el.addEventListener('click', finish);
        return;
      }
      setTimeout(() => go.classList.add('is-ready'), tCompose - 200);
      let started = false;
      go.addEventListener('click', (e) => {
        e.stopPropagation();
        if (started) return;
        started = true;
        BB.sfx.unlock && BB.sfx.unlock();
        go.classList.remove('is-ready');
        go.disabled = true;
        setTimeout(finish, lettersPop(P, true));
      });
      // un tap ailleurs pendant l'animation la passe
      el.addEventListener('click', () => { if (started) finish(); });
    });
  };
})();
