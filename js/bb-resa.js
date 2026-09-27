/* ==========================================================================
   Bougnat Burger — réserver une table.
   Les jours proposés sont les jours d'ouverture ; les heures, celles de leur module actuel.
   MAQUETTE : la demande reste dans le téléphone.
   PROD : la demande part au restaurant (back-office ou SMS), qui confirme au client par SMS.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

  const st = { day: null, service: 'midi', time: null, guests: 2 };

  function isToday(d) {
    const n = BB.parisNow();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function timeOk(d, t) {
    if (!isToday(d)) return true;
    const n = BB.parisNow();
    return toMin(t) > n.getHours() * 60 + n.getMinutes() + 30; // au moins 30 min à l'avance
  }

  function renderDays() {
    const box = $('#resa-days');
    if (!box) return;
    const days = BB.nextOpenDays(14);
    // aujourd'hui n'est proposé que s'il reste une heure possible
    const usable = days.filter((d) => !isToday(d) || Object.values(BB.INFO.tableSlots).some((l) => l.some((t) => timeOk(d, t))));
    if (!st.day || !usable.some((d) => d.toDateString() === st.day.toDateString())) st.day = usable[0];
    box.innerHTML = '';
    usable.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(d.toDateString() === st.day.toDateString()));
      b.setAttribute('data-sfx', 'key');
      b.innerHTML = `<small>${esc(i === 0 && isToday(d) ? BB.t('today') : BB.t('daysShort')[d.getDay()])}</small><b>${d.getDate()}</b><small>${esc(BB.t('months')[d.getMonth()])}</small>`;
      b.addEventListener('click', () => { st.day = d; st.time = null; renderDays(); renderTimes(); });
      box.appendChild(b);
    });
  }

  function renderTimes() {
    const box = $('#resa-times');
    if (!box || !st.day) return;
    // service impossible aujourd'hui (déjà passé) : on bascule sur l'autre
    const ok = (svc) => BB.INFO.tableSlots[svc].some((t) => timeOk(st.day, t));
    if (!ok(st.service)) st.service = st.service === 'midi' ? 'soir' : 'midi';
    document.querySelectorAll('#resa-service [data-service]').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.service === st.service));
      b.disabled = !ok(b.dataset.service);
    });
    box.innerHTML = '';
    BB.INFO.tableSlots[st.service].forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'time';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(st.time === t));
      b.setAttribute('data-sfx', 'key');
      b.disabled = !timeOk(st.day, t);
      b.textContent = BB.fmtTime(t);
      b.addEventListener('click', () => { st.time = t; renderTimes(); });
      box.appendChild(b);
    });
  }

  /* à partir de 10 couverts (BB.INFO.groupFrom), la demande en ligne laisse place à un bouton d'appel */
  let enGroupe = false;
  function groupe(force) {
    const g = st.guests >= (BB.INFO.groupFrom || 10);
    if (g === enGroupe && !force) return;
    enGroupe = g;
    $('#resa-form').classList.toggle('groupe', g);
    const box = $('#resa-groupe');
    box.innerHTML = g ? `<p>${esc(BB.t('groupe', { n: BB.INFO.groupFrom || 10 }))}</p>
      <a class="btn btn-main" href="tel:${esc(BB.INFO.phone)}" data-sfx="tap"><svg aria-hidden="true"><use href="#i-tel"/></svg><span>${esc(BB.t('groupeCall'))}</span><small>${esc(BB.t('telAffiche'))}</small></a>` : '';
    if (g && !force) BB.sfx && BB.sfx.play('ding');
  }
  function guestsLabel(n) { return n === 1 ? BB.t('guest1') : BB.t('guests', { n }); }

  function submit(e) {
    if (enGroupe) { e && e.preventDefault(); return; }
    e.preventDefault();
    const name = $('#resa-name'), phone = $('#resa-phone');
    [name, phone].forEach((f) => f.setAttribute('aria-invalid', 'false'));
    let bad = null;
    if (!st.time) bad = BB.t('pickTime');
    if (phone.value.replace(/\D/g, '').length < 10) { phone.setAttribute('aria-invalid', 'true'); bad = bad || BB.t('needPhone'); }
    if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); bad = BB.t('needName'); }
    if (bad) { BB.sfx.play('nope'); BB.toast(bad); return; }
    const d = st.day;
    const dayTxt = isToday(d) ? BB.t('today') : BB.fmtJour(d, true);
    const done = $('#resa-done');
    done.innerHTML = `<div class="ticket"><svg class="ticket-stamp" aria-hidden="true"><use href="#tampon"/></svg>
        <h3>${esc(BB.t('resaSent'))}</h3>
        <p class="num">${esc(BB.fmtTime(st.time))}</p>
        <p><b>${esc(name.value.trim())}</b></p>
        <p>${esc(BB.t('resaText', { g: guestsLabel(st.guests), d: dayTxt, t: BB.fmtTime(st.time), p: phone.value.trim() }))}</p>
        <p class="fine">${esc(BB.tr({ fr: 'Maquette : rien n\'est envoyé.', en: 'Demo: nothing is sent.' }))}</p>
        <p style="margin-top:14px"><button class="btn btn-ghost" type="button" id="resa-again" data-sfx="tap">${esc(BB.t('resaAgain'))}</button></p>
      </div>`;
    done.hidden = false;
    $('#resa-form').hidden = true;
    BB.sfx.play('ding');
    BB.vibrate(30);
    $('#resa-again').addEventListener('click', () => {
      done.hidden = true;
      $('#resa-form').hidden = false;
      st.time = null;
      renderTimes();
    });
  }

  BB.resa = {
    init() {
      if (!$('#resa-form')) return;
      renderDays();
      renderTimes();
      $('#resa-service').addEventListener('click', (e) => {
        const b = e.target.closest('[data-service]');
        if (!b || b.disabled) return;
        st.service = b.dataset.service;
        st.time = null;
        renderTimes();
      });
      $('#resa-guests').addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        st.guests = BB.clamp(st.guests + Number(b.dataset.step), 1, BB.INFO.maxGuests);
        $('#resa-count').textContent = String(st.guests);
        groupe();
      });
      $('#resa-form').addEventListener('submit', submit);
      BB.on('lang', () => { renderDays(); renderTimes(); groupe(true); });
      setInterval(() => { renderDays(); renderTimes(); }, 60000);
    },
  };
})();
