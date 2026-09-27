/* ==========================================================================
   Bougnat Burger — le sac, le retrait au comptoir (click & collect) et la livraison.
   MAQUETTE : le panier vit dans le téléphone, le paiement est simulé.
   PROD : une fonction serveur /api/checkout crée la session de paiement (Stripe) avec des prix
   recalculés côté serveur ; la commande part en cuisine (tablette / imprimante) et par SMS.
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

  let cart = BB.store.get('cart', []);
  let slot = null;
  const save = () => { BB.store.set('cart', cart); BB.emit('cart', cart); };
  const count = () => cart.reduce((a, l) => a + l.qty, 0);
  const total = () => cart.reduce((a, l) => a + l.qty * l.unit, 0);

  /* nom d'une ligne dans la langue courante */
  const varianteDe = (it, l) => (l.variant && it.variants ? it.variants.find((v) => v.id === l.variant) : null);
  function lineName(l) {
    const it = BB.menuItem && BB.menuItem(l.base);
    if (!it) return l.name;
    const v = varianteDe(it, l);
    if (v) return BB.tr(v.name);
    return (it.cat === 'burgers' && !l.double ? BB.t('ti') + ' ' : '') + BB.tr(it.name);
  }
  function lineOption(l) {
    const it = BB.menuItem && BB.menuItem(l.base);
    if (!it) return l.option || '';
    const v = varianteDe(it, l);
    if (v) return v.desc ? BB.tr(v.desc) : BB.tr(it.name);
    const p = [];
    if (it.cat === 'burgers' && l.double) p.push(BB.t('double'));
    if (it.veggie || it.burger) p.push(l.veggie ? BB.t('galette') : BB.t('steak'));
    return p.join(' · ');
  }

  function toast(msg) {
    const t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('is-on'), 2200);
  }
  BB.toast = toast;

  /* ---------- compteur du sac ---------- */
  function renderBadge(bump) {
    const n = count();
    const badge = $('#bag-count'), dot = $('#tab-dot');
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
      if (bump && n) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    }
    if (dot) dot.hidden = n === 0;
  }

  /* ---------- créneaux de retrait : services d'aujourd'hui, sinon du prochain jour ouvert ---------- */
  function slots() {
    const now = BB.parisNow();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const days = BB.nextOpenDays(3, now);
    for (const d of days) {
      const isToday = d.toDateString() === new Date(now.getFullYear(), now.getMonth(), now.getDate()).toDateString();
      const out = [];
      (BB.INFO.hours[d.getDay()] || []).forEach(([a, b], si) => {
        let start = toMin(a) + 15;
        if (isToday) start = Math.max(start, Math.ceil((nowMin + 20) / 15) * 15);
        for (let m = start; m <= toMin(b) - 15; m += 15) out.push({ t: hhmm(m), service: si === 0 ? 'lunch' : 'dinner', date: d });
      });
      if (out.length) return { date: d, isToday, list: out };
    }
    return { date: null, isToday: false, list: [] };
  }
  function dayLabel(d) {
    const now = BB.parisNow();
    const d0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - d0) / 86400000);
    if (diff === 0) return BB.t('today');
    if (diff === 1) return BB.t('tomorrow');
    return BB.fmtJour(d);
  }

  function renderSlots() {
    const box = $('#slots');
    if (!box) return;
    const S = slots();
    box.innerHTML = '';
    if (!S.list.length) return;
    const legend = box.closest('fieldset').querySelector('legend');
    legend.textContent = S.isToday ? BB.t('pickupDay', { d: BB.t('today') }) : BB.t('pickupDay', { d: dayLabel(S.date) });
    if (!S.isToday) {
      const p = document.createElement('p');
      p.className = 'fine';
      p.style.margin = '0 2px 6px';
      p.style.width = '100%';
      p.textContent = BB.t('closedToday', { d: dayLabel(S.date) });
      box.appendChild(p);
    }
    let lastSvc = null;
    S.list.forEach((s) => {
      if (s.service !== lastSvc) {
        lastSvc = s.service;
        const h = document.createElement('span');
        h.className = 'fine';
        h.style.cssText = 'width:100%;margin:4px 2px 0;font-weight:700';
        h.textContent = BB.t(s.service);
        box.appendChild(h);
      }
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'slot';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(!!slot && slot.t === s.t && slot.date.toDateString() === s.date.toDateString()));
      b.setAttribute('data-sfx', 'key');
      b.textContent = BB.fmtTime(s.t);
      b.addEventListener('click', () => { slot = s; renderSlots(); });
      box.appendChild(b);
    });
  }

  /* ---------- le sac ---------- */
  function renderCart() {
    const list = $('#cart-list'), empty = $('#cart-empty'), co = $('#checkout');
    if (!list) return;
    list.innerHTML = '';
    const n = count();
    empty.hidden = n > 0;
    co.hidden = n === 0 || !$('#ticket').hidden;
    cart.forEach((l, i) => {
      const li = document.createElement('li');
      li.className = 'cart-line';
      const opt = lineOption(l);
      li.innerHTML = `<h4>${esc(lineName(l))}</h4>
        <div class="stepper" data-i="${i}">
          <button type="button" data-step="-1" aria-label="${esc(BB.t('removeOne'))}" data-sfx="down">${icon('i-moins')}</button>
          <output>${l.qty}</output>
          <button type="button" data-step="1" aria-label="${esc(BB.t('addOne'))}" data-sfx="up">${icon('i-plus')}</button>
        </div>
        ${opt ? `<small>${esc(opt)}</small>` : ''}
        <span class="lt">${esc(BB.fmtPriceL(l.unit * l.qty))}</span>`;
      list.appendChild(li);
    });
    $('#co-total').textContent = BB.fmtPriceL(total());
    const alc = $('#co-alcool');
    if (alc) alc.hidden = !avecAlcool();
    if (n) renderSlots();
  }

  const avecAlcool = () => cart.some((l) => { const it = BB.menuItem && BB.menuItem(l.base); return !!(it && it.alcool); });
  function add(line) {
    const found = cart.find((l) => l.id === line.id);
    if (found) found.qty = Math.min(20, found.qty + line.qty);
    else cart.push({ id: line.id, base: line.base, variant: line.variant || null, name: line.name, double: !!line.double, veggie: !!line.veggie, unit: line.unit, qty: line.qty });
    save();
    renderCart();
    renderBadge(true);
    toast(BB.t('added', { n: (line.qty > 1 ? line.qty + ' × ' : '') + line.name }));
  }

  /* ---------- paiement simulé et ticket ---------- */
  function validPhone(v) { return v.replace(/[^\d+]/g, '').replace(/^\+33/, '0').replace(/\D/g, '').length >= 10; }

  async function pay(e) {
    e.preventDefault();
    const name = $('#co-name'), phone = $('#co-phone'), note = $('#co-note');
    let bad = null;
    [name, phone].forEach((f) => f.setAttribute('aria-invalid', 'false'));
    if (!slot) bad = BB.t('needSlot');
    if (!validPhone(phone.value)) { phone.setAttribute('aria-invalid', 'true'); bad = bad || BB.t('needPhone'); }
    if (!name.value.trim()) { name.setAttribute('aria-invalid', 'true'); bad = BB.t('needName'); }
    if (bad) { BB.sfx.play('nope'); toast(bad); return; }
    const btn = $('#co-pay');
    btn.disabled = true;
    const label = btn.querySelector('span');
    const keep = label.innerHTML;
    label.textContent = BB.t('paying');
    // PROD : fetch('/api/checkout', { method: 'POST', body: JSON.stringify({ cart, slot, name, phone }) }) → redirection Stripe
    await BB.wait(1100);
    label.innerHTML = keep;
    btn.disabled = false;
    const num = 'B-' + String(100 + Math.floor(Math.random() * 900));
    const lines = cart.map((l) => `<li><span>${l.qty} × ${esc(lineName(l))}${lineOption(l) ? ` <small>(${esc(lineOption(l))})</small>` : ''}</span><b>${esc(BB.fmtPriceL(l.unit * l.qty))}</b></li>`).join('');
    const t = $('#ticket');
    t.innerHTML = `<svg class="ticket-stamp" aria-hidden="true"><use href="#tampon"/></svg><h3>${esc(BB.t('thanks', { n: name.value.trim() }))}</h3>
      <p>${esc(BB.t('orderNum'))}</p><p class="num">${num}</p>
      <p><b>${esc(BB.t('pickupAt', { d: dayLabel(slot.date), t: BB.fmtTime(slot.t) }))}</b></p>
      ${note && note.value.trim() ? `<p class="note-cuisine"><b>${esc(BB.t('noteCuisine'))}</b> ${esc(note.value.trim())}</p>` : ''}
      <ul>${lines}<li><span>${esc(BB.t('co.total') || 'Total')}</span><b>${esc(BB.fmtPriceL(total()))}</b></li></ul>
      ${avecAlcool() ? `<p class="fine">${esc(BB.t('alcool'))}</p>` : ''}
      <p class="fine">${esc(BB.t('simulated'))}</p>
      <p style="margin-top:14px"><button class="btn btn-ghost" type="button" id="new-order" data-sfx="tap">${esc(BB.t('newOrder'))}</button></p>`;
    t.hidden = false;
    $('#checkout').hidden = true;
    $('#cart').hidden = true;
    BB.sfx.play('ding');
    BB.vibrate(30);
    cart = [];
    slot = null;
    save();
    renderBadge(false);
    $('#new-order').addEventListener('click', () => {
      t.hidden = true;
      $('#cart').hidden = false;
      renderCart();
      location.hash = '#carte';
    });
  }

  /* ---------- livraison ---------- */
  function renderDelivery() {
    const box = $('#delivery');
    if (!box) return;
    const sub = { ubereats: BB.t('dlvUber'), deliveroo: BB.t('dlvDeliveroo'), raboule: BB.t('dlvBike') };
    const tint = { ubereats: '#3D2F24', deliveroo: '#4A3A2C', raboule: '#56731A' };
    box.innerHTML = BB.INFO.delivery.map((d) => `
      <a class="dlv" href="${esc(d.url)}" target="_blank" rel="noopener">
        <span class="dlv-mark" style="background:${tint[d.id] || '#2B1A10'}">${icon(d.bike ? 'i-velo' : 'i-sac')}</span>
        <span><b>${esc(d.name)}</b><small>${esc(sub[d.id] || '')}</small></span>
        <svg class="go" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>`).join('');
  }

  function initModes() {
    const seg = $('#cmd-seg');
    if (!seg) return;
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      seg.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
      $('#mode-emporter').hidden = b.dataset.mode !== 'emporter';
      $('#mode-livraison').hidden = b.dataset.mode !== 'livraison';
    });
  }

  BB.shop = {
    add, count, total,
    init() {
      initModes();
      renderCart();
      renderBadge(false);
      renderDelivery();
      $('#cart-list').addEventListener('click', (e) => {
        const b = e.target.closest('[data-step]');
        if (!b) return;
        const i = Number(b.closest('.stepper').dataset.i);
        cart[i].qty += Number(b.dataset.step);
        if (cart[i].qty <= 0) { cart.splice(i, 1); toast(BB.t('removed')); }
        save();
        renderCart();
        renderBadge(false);
      });
      $('#checkout').addEventListener('submit', pay);
      BB.on('lang', () => { renderCart(); renderDelivery(); });
      setInterval(() => { if (count()) renderSlots(); }, 60000);
    },
  };
})();
