/* ==========================================================================
   Bougnat Burger — l'ardoise des horaires (en haut de l'accueil).
   Pliée : l'état du moment écrit à la craie (« Ouvert · jusqu'à 22h », « Ce soir dès 18h30 »,
   « Fermé · ouvre mercredi à 11h30 »), calculé à l'heure de Paris et remis à jour chaque minute.
   Un tap la déplie : la semaine, le jour même souligné, le service en cours ondulé.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s) => document.querySelector(s);
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  /* État du moment : { open, text, day, service } */
  function status(now = BB.parisNow()) {
    const H = BB.INFO.hours;
    const d = now.getDay();
    const m = now.getHours() * 60 + now.getMinutes();
    const today = H[d] || [];
    for (const [a, b] of today) {
      if (m >= toMin(a) && m < toMin(b)) return { open: true, text: BB.t('openUntil', { t: BB.fmtTime(b) }), day: d, service: a };
    }
    const later = today.find(([a]) => toMin(a) > m);
    if (later) {
      const evening = toMin(later[0]) >= 17 * 60;
      const text = evening && today.some(([, b]) => toMin(b) <= m) // entre midi et soir
        ? BB.t('openTonight', { t: BB.fmtTime(later[0]) })
        : BB.t('closedOpensToday', { t: BB.fmtTime(later[0]) });
      return { open: false, text, day: d };
    }
    for (let k = 1; k <= 7; k++) {
      const nd = (d + k) % 7;
      if ((H[nd] || []).length) {
        const dayLabel = k === 1 ? BB.t('tomorrow') : (BB.t('daysOn') || BB.t('days'))[nd]; // daysOn : « el miércoles » (es)
        return { open: false, text: BB.t('closedOpens', { d: dayLabel, t: BB.fmtTime(H[nd][0][0]) }), day: d, next: nd };
      }
    }
    return { open: false, text: '', day: d };
  }
  BB.hoursStatus = status;

  /* Prochains services (pour le retrait et la réservation) */
  BB.nextOpenDays = function (count, from = BB.parisNow()) {
    const out = [];
    for (let k = 0; out.length < count && k < 60; k++) {
      const dt = new Date(from.getFullYear(), from.getMonth(), from.getDate() + k);
      if ((BB.INFO.hours[dt.getDay()] || []).length) out.push(dt);
    }
    return out;
  };

  function renderWeek() {
    const ul = $('#week');
    if (!ul) return;
    const now = BB.parisNow();
    const st = status(now);
    const H = BB.INFO.hours;
    const order = [1, 2, 3, 4, 5, 6, 0]; // la semaine commence le lundi
    ul.innerHTML = '';
    order.forEach((d) => {
      const li = document.createElement('li');
      const svc = H[d] || [];
      if (d === now.getDay()) li.classList.add('is-today');
      if (!svc.length) li.classList.add('closed');
      const b = document.createElement('b');
      b.textContent = BB.t('days')[d].replace(/^./, (c) => c.toUpperCase());
      li.appendChild(b);
      const span = document.createElement('span');
      span.className = 'svc';
      if (!svc.length) span.textContent = BB.t('weekClosed');
      else svc.forEach(([a, z]) => {
        const s = document.createElement('span');
        s.textContent = `${BB.fmtTime(a)}–${BB.fmtTime(z)}`;
        if (st.open && d === now.getDay() && st.service === a) s.classList.add('now');
        span.appendChild(s);
      });
      li.appendChild(span);
      ul.appendChild(li);
    });
  }

  function renderFace() {
    const st = status();
    const el = $('#ardoise-state');
    if (!el) return;
    el.innerHTML = '';
    const dot = document.createElement('i');
    dot.className = 'chalk-dot' + (st.open ? ' on' : '');
    el.appendChild(dot);
    // un mot, pour un bandeau net ; le détail (jusqu'à quand, quand ça rouvre) est lu par les lecteurs d'écran
    // et écrit en tête de la semaine dépliée
    el.appendChild(document.createTextNode(BB.t(st.open ? 'ouvert' : 'ferme')));
    const sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = ' · ' + st.text;
    el.appendChild(sr);
    const wk = $('#ardoise-week');
    if (wk) {
      let now = $('#week-now');
      if (!now) { now = document.createElement('p'); now.id = 'week-now'; now.className = 'week-now'; wk.insertBefore(now, wk.querySelector('.week')); }
      now.textContent = st.text;
    }
  }

  BB.hours = {
    init() {
      const box = $('#ardoise'), face = $('#ardoise-face');
      if (!box) return;
      renderFace();
      renderWeek();
      face.addEventListener('click', () => {
        const open = !box.classList.contains('is-open');
        box.classList.toggle('is-open', open);
        face.setAttribute('aria-expanded', String(open));
        BB.sfx.play(open ? 'chalk' : 'close');
      });
      setInterval(() => { renderFace(); renderWeek(); }, 60000);
      BB.on('lang', () => { renderFace(); renderWeek(); });
    },
  };
})();
