/* ==========================================================================
   Bougnat Burger — le comptoir : l'imprimante de la cuisine, en Bluetooth.
   · Web Bluetooth (Chrome ou Edge sur Android, Windows, Mac, ChromeOS ; pas Safari sur iPhone/iPad, où
     l'appli « Bluefy » fait l'affaire) : une imprimante thermique Bluetooth BLE qui parle ESC/POS (58 ou 80 mm).
     Les imprimantes en Bluetooth « classique » seul (beaucoup de modèles pro) ne sont pas visibles d'une page
     web : PROD, les brancher au serveur (Epson ePOS, Star CloudPRNT) et garder ce module pour les tickets.
   · Un ticket est d'abord une liste de lignes (texte, gros, gras, centré, inversé) : la même liste sert à
     l'imprimante (octets ESC/POS) et à l'aperçu à l'écran (et à l'impression du navigateur, en secours).
   · Sans accents à l'impression : les pages de code des imprimantes à bas prix sont un loto ; « é » → « e ».
   ========================================================================== */
(function () {
  'use strict';
  const BB = window.BB;
  const ad = BB.ad;

  // les services Bluetooth des imprimantes thermiques courantes (il faut les citer pour y avoir accès)
  const SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb',
  ];
  const REG = 'ad-imprimante'; // réglages de CET appareil : { largeur: 32 | 48, auto, nom }
  let reglages = Object.assign({ largeur: 32, auto: true, nom: null }, BB.store.get(REG, {}));
  const sauver = () => BB.store.set(REG, reglages);

  let appareil = null, carac = null, sansReponse = false, etat = 'deconnectee'; // deconnectee | connexion | prete | impression
  const abonnes = [];
  const changerEtat = (e) => { etat = e; abonnes.forEach((fn) => fn(e)); };
  const dispo = () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice);

  /* ---------- connexion ---------- */
  async function brancher(dev) {
    appareil = dev;
    changerEtat('connexion');
    dev.removeEventListener('gattserverdisconnected', perdue);
    dev.addEventListener('gattserverdisconnected', perdue);
    const gatt = await dev.gatt.connect();
    let trouve = null;
    const services = await gatt.getPrimaryServices();
    for (const s of services) {
      const cs = await s.getCharacteristics().catch(() => []);
      trouve = cs.find((c) => c.properties.write) || cs.find((c) => c.properties.writeWithoutResponse);
      if (trouve) break;
    }
    if (!trouve) { gatt.disconnect(); throw new Error('Cette imprimante ne se laisse pas écrire (pas d\'ESC/POS en Bluetooth BLE ?)'); }
    carac = trouve;
    sansReponse = !trouve.properties.write;
    reglages.nom = dev.name || 'Imprimante';
    sauver();
    changerEtat('prete');
  }
  function perdue() { carac = null; changerEtat('deconnectee'); }

  async function connecter() {
    if (!dispo()) throw new Error('Bluetooth indisponible dans ce navigateur : ouvrez le comptoir dans Chrome (Android, Windows, Mac) ou Bluefy (iPhone).');
    const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
    await brancher(dev);
  }
  // au retour sur la page : l'imprimante déjà autorisée se rebranche sans repasser par la liste
  async function reprendre() {
    if (!dispo() || !navigator.bluetooth.getDevices || !reglages.nom) return;
    try {
      const l = await navigator.bluetooth.getDevices();
      const dev = l.find((d) => d.name === reglages.nom) || l[0];
      if (dev) await brancher(dev);
    } catch (e) { changerEtat('deconnectee'); }
  }
  function deconnecter() {
    if (appareil && appareil.gatt.connected) appareil.gatt.disconnect();
    carac = null;
    reglages.nom = null;
    sauver();
    changerEtat('deconnectee');
  }

  /* ---------- le ticket : une liste de lignes ---------- */
  const sansAccent = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae')
    .replace(/[’‘]/g, '\'').replace(/[«»“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/€/g, 'EUR').replace(/·/g, '-').replace(/[  ]/g, ' ').replace(/[^\x20-\x7e\n]/g, '');
  function couper(txt, w) {
    const out = [];
    String(txt).split('\n').forEach((para) => {
      let l = '';
      para.split(' ').forEach((m) => {
        while (m.length > w) { if (l) { out.push(l); l = ''; } out.push(m.slice(0, w)); m = m.slice(w); }
        if (!l) l = m; else if ((l + ' ' + m).length <= w) l += ' ' + m; else { out.push(l); l = m; }
      });
      out.push(l);
    });
    return out;
  }
  const prix = (n) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' EUR';
  const jourCourt = (iso) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'));
  const heure = (hhmm) => hhmm.replace(/^0(?=\d)/, '').replace(':', 'h');
  const telAff = (t) => String(t).replace(/(\d{2})(?=\d)/g, '$1 ');

  // le ticket cuisine d'une commande (sans les prix : la cuisine n'en a que faire ; le total en bas, pour le comptoir)
  function ticketCommande(c, { reimpression } = {}) {
    const L = [];
    const tiret = { tiret: true };
    L.push({ txt: 'BOUGNAT BURGER', centre: true, gras: true });
    L.push({ txt: 'A EMPORTER' + (reimpression ? ' - REIMPRESSION' : ''), centre: true });
    L.push({ txt: c.id, centre: true, gros: 2 });
    L.push({ txt: 'Retrait ' + heure(c.retrait.heure), centre: true, gros: 1, gras: true });
    if (c.retrait.jour !== BB.restoApi.aujourdhui()) L.push({ txt: jourCourt(c.retrait.jour), centre: true, gras: true });
    L.push(tiret);
    L.push({ txt: c.nom, gras: true });
    L.push({ txt: telAff(c.tel) });
    L.push(tiret);
    c.lignes.forEach((l) => {
      L.push({ txt: `${l.qty} x ${l.nom}`, gros: 1, gras: true });
      if (l.option) L.push({ txt: '    ' + l.option });
    });
    if (c.note) { L.push(tiret); L.push({ txt: 'NOTE : ' + c.note, inverse: true, gras: true }); }
    L.push(tiret);
    const n = c.lignes.reduce((s, l) => s + l.qty, 0);
    L.push({ txt: `${n} article${n > 1 ? 's' : ''}`, droite: prix(c.total) });
    L.push({ txt: 'Recue a ' + new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(c.cree)) + ' - payee en ligne' });
    if (c.alcool) L.push({ txt: 'ALCOOL : verifier l\'age au retrait', gras: true });
    return L;
  }
  // un ticket d'essai, pour régler l'imprimante
  function ticketEssai() {
    const w = reglages.largeur;
    return [
      { txt: 'BOUGNAT BURGER', centre: true, gras: true },
      { txt: 'Ticket d\'essai', centre: true },
      { txt: 'B-101', centre: true, gros: 2 },
      { tiret: true },
      { txt: `Largeur : ${w} caracteres (${w === 48 ? '80' : '58'} mm)` },
      { txt: '1234567890'.repeat(5).slice(0, w) },
      { txt: 'Gros caracteres', gros: 1, gras: true },
      { txt: 'Note en negatif', inverse: true },
      { txt: 'Accents retires : Mefia Te, Saint-Nectaire' },
    ];
  }

  /* ---------- ESC/POS ---------- */
  function escpos(L) {
    const w = reglages.largeur;
    const o = [];
    const push = (...b) => b.forEach((x) => o.push(x));
    const texte = (s) => { for (const ch of sansAccent(s)) o.push(ch.charCodeAt(0)); };
    push(0x1b, 0x40); // initialiser
    L.forEach((l) => {
      if (l.tiret) { push(0x1b, 0x61, 0); texte('-'.repeat(w)); push(0x0a); return; }
      const g = l.gros === 2 ? 0x11 : l.gros === 1 ? 0x01 : 0x00; // 2 : double largeur et hauteur ; 1 : double hauteur
      const lw = l.gros === 2 ? Math.floor(w / 2) : w;
      push(0x1b, 0x61, l.centre ? 1 : 0, 0x1d, 0x21, g, 0x1b, 0x45, l.gras ? 1 : 0, 0x1d, 0x42, l.inverse ? 1 : 0);
      const lignes = l.droite != null ? [ligneDroite(sansAccent(l.txt), sansAccent(l.droite), lw)] : couper(sansAccent(l.txt), lw);
      lignes.forEach((s) => { texte(s); push(0x0a); });
    });
    push(0x1d, 0x21, 0, 0x1b, 0x45, 0, 0x1d, 0x42, 0, 0x1b, 0x61, 0);
    push(0x1b, 0x64, 4);        // avance de 4 lignes
    push(0x1d, 0x56, 0x42, 0);  // coupe (ignorée sans massicot)
    return new Uint8Array(o);
  }
  const ligneDroite = (g, d, w) => (g.length + d.length + 1 <= w ? g + ' '.repeat(w - g.length - d.length) + d : g + ' ' + d);

  async function envoyer(octets) {
    if (!carac) throw new Error('Imprimante non connectée');
    changerEtat('impression');
    try {
      const pas = 20; // la taille sûre d'un paquet BLE, même sans négociation
      for (let i = 0; i < octets.length; i += pas) {
        const bout = octets.slice(i, i + pas);
        if (sansReponse) { await (carac.writeValueWithoutResponse ? carac.writeValueWithoutResponse(bout) : carac.writeValue(bout)); await BB.wait(12); }
        else await (carac.writeValueWithResponse ? carac.writeValueWithResponse(bout) : carac.writeValue(bout));
      }
    } finally { changerEtat(carac ? 'prete' : 'deconnectee'); }
  }

  /* ---------- l'aperçu (et l'impression du navigateur en secours) ---------- */
  function apercu(L) {
    const w = reglages.largeur;
    const esc = ad.esc;
    return `<div class="ad-ticket" style="--col:${w}">` + L.map((l) => {
      if (l.tiret) return '<div class="t-tiret"></div>';
      const cls = ['t-l', l.centre && 't-c', l.gras && 't-g', l.inverse && 't-i', l.gros === 2 && 't-xx', l.gros === 1 && 't-x'].filter(Boolean).join(' ');
      if (l.droite != null) return `<div class="${cls} t-d"><span>${esc(sansAccent(l.txt))}</span><span>${esc(sansAccent(l.droite))}</span></div>`;
      return `<div class="${cls}">${esc(sansAccent(l.txt))}</div>`;
    }).join('') + '</div>';
  }
  function imprimerNavigateur(L) {
    let z = document.getElementById('ad-impression');
    if (!z) { z = document.createElement('div'); z.id = 'ad-impression'; document.body.appendChild(z); }
    z.innerHTML = apercu(L);
    document.body.classList.add('ad-imprime');
    const fin = () => { document.body.classList.remove('ad-imprime'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    window.print();
    setTimeout(fin, 1500);
  }

  /* imprime le ticket d'une commande : en Bluetooth si l'imprimante est là ; sinon rien (renvoie false) */
  async function imprimerCommande(c, opts) {
    if (!carac) return false;
    await envoyer(escpos(ticketCommande(c, opts)));
    await BB.restoApi.commandes.imprimee(c.id);
    return true;
  }

  ad.imprimante = {
    dispo, connecter, deconnecter, reprendre,
    etat: () => etat,
    nom: () => reglages.nom,
    reglages: () => Object.assign({}, reglages),
    regler(r) { Object.assign(reglages, r); sauver(); abonnes.forEach((fn) => fn(etat)); },
    onEtat: (fn) => abonnes.push(fn),
    ticketCommande, ticketEssai, apercu, imprimerNavigateur, imprimerCommande,
    essai: () => envoyer(escpos(ticketEssai())),
    _escpos: escpos, // pour les essais
  };
})();
