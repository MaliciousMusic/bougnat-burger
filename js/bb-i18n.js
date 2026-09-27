/* ==========================================================================
   Bougnat Burger — quatre langues, une seule page.
   · Le français est écrit dans le HTML (lisible par Google et les IA, même sans JS).
   · L'anglais est ici, clé par clé ; les plats portent leur français et leur anglais dans bb-data.js.
   · L'espagnol et le chinois (simplifié) sont dans js/i18n/bb-lang-es.js et bb-lang-zh.js (BB.addLang) :
     les textes de l'interface par clé, et un dictionnaire « texte français → traduction » pour les données.
   · Repli : la langue demandée, sinon l'anglais, sinon le français.
   · Choix de la langue : ?lang=… > choix mémorisé > langues du téléphone (navigator.languages), sinon l'anglais.
     Jamais d'après l'adresse IP (touriste sur le wifi d'un hôtel, VPN, robot de Google…).
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});

  const EN = {
    'splash.go': 'Come in',
    'splash.hint': 'It sounds better with the volume up.',
    'hours.more': 'opening hours',
    'hours.title': 'Opening hours',
    'film.alt': 'Short film: a bougnat skydives over the Chaîne des Puys volcanoes, but he grabbed the wrong bag: instead of a parachute, a meal flies out. He catches and eats the burger, the fries and the drink, crash-lands in a cloud of smoke, gets up unharmed and crunches one last fry.',
    'home.title1': 'The Auvergne burger,',
    'home.title2': 'since 2012',
    'home.lede': 'Saint-Nectaire, Cantal and Bleu d\'Auvergne PDO cheeses, butcher-style French beef, artisan buns and homemade fries. At 10 boulevard Léon-Malfreyt, Clermont-Ferrand.',
    'quick': 'Quick actions',
    'quick.book': 'Book',
    'quick.order': 'Order',
    'quick.call': 'Call',
    'quick.route': 'Directions',
    'sig.title': 'House favourites',
    'sig.all': 'Full menu',
    'rating.text': '2,039 Google reviews',
    'home.fine': 'Eat in, take away or delivered. Terrace when the sun is out.',
    'carte.title': 'The menu',
    'carte.lede': 'Every burger comes with homemade fries and salad. Butcher-style beef patty or potato rösti, your choice.',
    'carte.nav': 'Menu sections',
    'carte.fine': 'Prices include service. Allergies: ask the team, they will go through each dish with you.',
    'cmd.title': 'Order',
    'cmd.takeaway': 'Takeaway',
    'cmd.delivery': 'Delivery',
    'cart.empty': 'Your bag is empty.',
    'cart.browse': 'See the menu',
    'co.when': 'Pick up at the counter',
    'co.who': 'Name for the order',
    'co.name': 'First name',
    'co.phone': 'Phone',
    'co.note': 'Allergies or notes for the kitchen (optional)',
    'co.note.ph': 'E.g. nut allergy, no tomato…',
    'co.total': 'Total',
    'co.pay': 'Pay and order',
    'co.fine': 'Demo: payment is simulated, no order is sent.',
    'resa.less': 'One guest fewer',
    'resa.more': 'One more guest',
    'co.alcool': 'Your order contains alcohol: no sale to under-18s, ID may be requested at pick-up. Please drink responsibly.',
    'del.lede': 'For now, delivery goes through these apps:',
    'del.soon.title': 'Soon, right here',
    'del.soon.text': 'Order in the Bougnat Burger app and a courier brings it to you. Same prices as in the restaurant, no platform commission.',
    'resa.title': 'Book a table',
    'resa.lede': 'Tell us when and we\'ll keep a table for you. For 10 people or more, give us a call.',
    'resa.day': 'Which day?',
    'resa.service': 'Lunch or dinner?',
    'resa.lunch': 'Lunch',
    'resa.dinner': 'Dinner',
    'resa.guests': 'How many people?',
    'resa.who': 'Name for the booking',
    'resa.note': 'A note for the team (optional)',
    'resa.send': 'Request the table',
    'resa.fine': 'Demo: the request is not sent. For real, the restaurant confirms by text message.',
    'nous.kicker': 'Since 2 February 2012',
    'nous.title': 'A bougnat is someone from Auvergne who loves to feed you.',
    'nous.story1': 'In the 19th and 20th centuries, the “bougnats” were people from Auvergne who moved to Paris and ran wine-and-coal cafés: wine, firewood, coal, and a table for everyone.',
    'nous.story2': 'At Bougnat Burger we keep the spirit and change the menu: homemade burgers with the best of Auvergne. Everything else follows the same idea, from fries cut here to homemade desserts.',
    'terroir.title': 'What goes in the bun',
    'terroir.aop': 'Four Auvergne PDO cheeses',
    'terroir.aop.t': 'Farmhouse Saint-Nectaire, Cantal, Salers and Bleu d\'Auvergne.',
    'terroir.beef': 'French beef',
    'terroir.beef.t': 'Butcher-style VBF patties, organic Charolais flank steak.',
    'terroir.fries': 'Homemade fries',
    'terroir.fries.t': 'With every burger, plus a house salad.',
    'terroir.beer': 'Local beers',
    'terroir.beer.t': 'Brasserie des Sagnes, Brasserie Desprat, Auvergne wines.',
    'avis.title': 'What guests say',
    'avis.count': '2,039 Google reviews',
    'avis.asof': 'as of 27 September 2026',
    'avis.fine': 'A selection of Google reviews, reproduced as written with their date, and not verified by the restaurant. All reviews, good and less good, can be read on Google. In production, they appear here live.',
    'avis.window': 'Google reviews',
    'nous.photos': 'Photos: Bougnat Burger',
    'avis.bar': 'Google reviews',
    'avis.open': 'Open the reviews on Google',
    'avis.read': 'Read the reviews',
    'avis.write': 'Leave a review',
    'infos.title': 'Find us',
    'infos.route': 'Directions',
    'foot.legal': 'Legal notice and privacy',
    'foot.demo': 'Demo version. Prices and details taken from the restaurant\'s menu, September 2026.',
    'tab.home': 'Home',
    'tab.menu': 'Menu',
    'tab.order': 'Order',
    'tab.book': 'Book',
    'tab.us': 'About',
    'p.add': 'Add',
    'p.less': 'One fewer',
    'p.more': 'One more',
    'sound': 'Sound',
    'bag': 'My bag',
    'close': 'Close',
    'skip': 'Skip to content',
    'meta.title': 'Bougnat Burger · The Auvergne burger in Clermont-Ferrand since 2012',
    'meta.desc': 'Bougnat Burger, 10 bd Léon-Malfreyt in Clermont-Ferrand: burgers with Saint-Nectaire, Cantal and Bleu d\'Auvergne PDO cheeses, butcher-style French beef, homemade fries. Wednesday to Saturday, lunch and dinner. Book a table, take away, delivery.',
  };

  /* Textes produits par le JS (les deux langues ici) */
  const DYN = {
    fr: {
      days: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
      daysShort: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
      months: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
      today: 'aujourd\'hui', tomorrow: 'demain',
      openUntil: 'Ouvert · jusqu\'à {t}',
      openTonight: 'Ce soir dès {t}',
      closedOpens: 'Fermé · ouvre {d} à {t}',
      closedOpensToday: 'Fermé · ouvre à {t}',
      weekClosed: 'fermé',
      weekDaysClosed: 'Dimanche, lundi, mardi',
      burgersNote: 'Chaque burger existe en « Ti\' » (un steak) ou en double. Steak façon bouchère VBF ou galette de pommes de terre.',
      from: 'dès',
      withFries: 'frites maison', ti: 'Ti\'', double: 'Double', simpleLong: 'Ti\' · un steak', doubleLong: 'Double · deux steaks',
      steak: 'Steak VBF', galette: 'Galette de pommes de terre', steakShort: 'Steak VBF', galetteShort: 'Galette végé',
      priceOnSite: 'prix sur place',
      langue: 'Langue', etoiles: '{n} étoiles sur 5', avisN: 'Avis {n}', tamponHaut: 'FRITES', tamponBas: 'MAISON',
      surPlace: 'sur place uniquement',
      surPlaceLong: 'Servi sur place uniquement : à déguster au restaurant.',
      choix: 'Votre choix',
      alcool: 'L\'abus d\'alcool est dangereux pour la santé, à consommer avec modération. Vente d\'alcool interdite aux mineurs : une pièce d\'identité peut être demandée au retrait.',
      homemade: 'fait maison', local: 'du coin',
      veggie: 'végé possible', spicy: 'relevé', raw: 'lait cru',
      allergens: 'Allergènes d\'après la composition (liste complète à confirmer au restaurant) : {a}.',
      rawNote: '{r}',
      added: 'Dans le sac : {n}',
      removed: 'Retiré du sac',
      asap: 'Au plus tôt',
      lunch: 'Midi', dinner: 'Soir',
      pickupDay: 'Retrait {d}',
      closedToday: 'Fermé aujourd\'hui. Premier retrait possible {d}.',
      needName: 'Indiquez un prénom.',
      needPhone: 'Numéro de téléphone incomplet.',
      needSlot: 'Choisissez un créneau.',
      paying: 'Paiement…',
      orderNum: 'Commande n°',
      noteCuisine: 'Pour la cuisine :',
      pickupAt: 'À retirer {d} à {t}, au comptoir.',
      thanks: 'Merci {n} !',
      simulated: 'Maquette : paiement simulé, rien n\'est débité ni transmis.',
      newOrder: 'Nouvelle commande',
      guests: '{n} couverts', guest1: '1 couvert',
      groupe: 'À partir de {n} personnes, on organise votre table ensemble : appelez-nous pour confirmer la réservation.',
      groupeCall: 'Appeler pour confirmer', telAffiche: '07 60 12 00 63',
      resaSent: 'Demande envoyée',
      resaText: '{g}, {d} à {t}. Le restaurant vous confirme par SMS au {p}.',
      resaAgain: 'Faire une autre demande',
      pickDay: 'Choisissez un jour.',
      pickTime: 'Choisissez une heure.',
      dlvUber: 'Livraison en voiture ou scooter', dlvDeliveroo: 'Livraison en scooter ou vélo', dlvBike: 'Coursiers à vélo, coopérative locale',
      qty: 'Quantité',
      removeOne: 'Retirer un', addOne: 'Ajouter un',
      noFilm: '',
    },
    en: {
      days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      daysShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
      today: 'today', tomorrow: 'tomorrow',
      openUntil: 'Open · until {t}',
      openTonight: 'Tonight from {t}',
      closedOpens: 'Closed · opens {d} at {t}',
      closedOpensToday: 'Closed · opens at {t}',
      weekClosed: 'closed',
      weekDaysClosed: 'Sunday, Monday, Tuesday',
      burgersNote: 'Every burger comes as a “Ti\'” (one patty) or a double. Butcher-style French beef or potato rösti.',
      from: 'from',
      withFries: 'homemade fries', ti: 'Ti\'', double: 'Double', simpleLong: 'Ti\' · one patty', doubleLong: 'Double · two patties',
      steak: 'French beef patty', galette: 'Potato rösti', steakShort: 'Beef patty', galetteShort: 'Veggie rösti',
      priceOnSite: 'price on site',
      langue: 'Language', etoiles: '{n} stars out of 5', avisN: 'Review {n}', tamponHaut: 'HOMEMADE', tamponBas: 'FRIES',
      surPlace: 'eat in only',
      surPlaceLong: 'Served in the restaurant only.',
      choix: 'Your choice',
      alcool: 'Please drink responsibly. No sale of alcohol to under-18s: ID may be requested at pick-up.',
      homemade: 'homemade', local: 'local',
      veggie: 'veggie option', spicy: 'spicy', raw: 'raw milk',
      allergens: 'Allergens from the recipe (full list to be confirmed at the restaurant): {a}.',
      rawNote: '{r}',
      added: 'In your bag: {n}',
      removed: 'Removed from your bag',
      asap: 'Earliest',
      lunch: 'Lunch', dinner: 'Dinner',
      pickupDay: 'Pick-up {d}',
      closedToday: 'Closed today. First pick-up {d}.',
      needName: 'Please add a first name.',
      needPhone: 'This phone number looks incomplete.',
      needSlot: 'Pick a time slot.',
      paying: 'Paying…',
      orderNum: 'Order no.',
      noteCuisine: 'For the kitchen:',
      pickupAt: 'Pick up {d} at {t}, at the counter.',
      thanks: 'Thank you {n}!',
      simulated: 'Demo: simulated payment, nothing is charged or sent.',
      newOrder: 'New order',
      guests: '{n} people', guest1: '1 person',
      groupe: 'For {n} people or more, we set up your table together: please call us to confirm the booking.',
      groupeCall: 'Call to confirm', telAffiche: '+33 7 60 12 00 63',
      resaSent: 'Request sent',
      resaText: '{g}, {d} at {t}. The restaurant will confirm by text message to {p}.',
      resaAgain: 'Make another request',
      pickDay: 'Pick a day.',
      pickTime: 'Pick a time.',
      dlvUber: 'Delivered by car or scooter', dlvDeliveroo: 'Delivered by scooter or bike', dlvBike: 'Bike couriers, local co-op',
      qty: 'Quantity',
      removeOne: 'Remove one', addOne: 'Add one',
      noFilm: '',
    },
  };

  /* Les langues du site (codes courts) ; le contenu de es et zh arrive par BB.addLang (js/i18n/) */
  const CODES = ['fr', 'en', 'es', 'zh'];
  const LANGS = {
    fr: { nom: 'Français', court: 'FR', html: 'fr', locale: 'fr-FR' },
    en: { nom: 'English', court: 'EN', html: 'en', locale: 'en-GB' },
    es: { nom: 'Español', court: 'ES', html: 'es', locale: 'es-ES' },
    zh: { nom: '中文', court: '中文', html: 'zh-Hans', locale: 'zh-CN' },
  };
  const UI = { en: EN };  // textes du HTML (data-i18n) par langue ; le français reste celui du HTML
  const DATA = {};        // données : texte français → traduction
  BB.LANGS = LANGS;
  BB.LANG_CODES = CODES;
  BB.addLang = function (id, pack) {
    if (!CODES.includes(id) || !pack) return;
    Object.assign(LANGS[id], pack.meta || {});
    UI[id] = pack.ui || {};
    DYN[id] = pack.dyn || {};
    DATA[id] = pack.data || {};
  };
  BB.I18N = { EN, DYN, UI, DATA }; // pour les outils (tools/i18n/)
  // les paquets déjà chargés (js/i18n/bb-lang-*.js passent avant ce fichier : la langue est connue dès le premier rendu)
  (BB.langPacks || []).forEach(([id, pack]) => BB.addLang(id, pack));
  BB.langPacks = { push: ([id, pack]) => BB.addLang(id, pack) };

  function detect() {
    try {
      const q = (new URLSearchParams(location.search).get('lang') || '').toLowerCase().slice(0, 2);
      if (CODES.includes(q)) return q;
    } catch (e) { /* file:// sans recherche */ }
    const saved = BB.store && BB.store.get('lang');
    if (CODES.includes(saved)) return saved;
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'fr']).map((l) => String(l).toLowerCase());
    // la première langue du téléphone que le site parle ; sinon l'anglais, langue commune des visiteurs
    for (const l of langs) { const c = l.slice(0, 2); if (CODES.includes(c)) return c; }
    return 'en';
  }

  BB.lang = detect();

  /* BB.t('clé', { t: '22h' }) → texte dynamique dans la langue courante */
  BB.t = function (key, vars) {
    let s = DYN[BB.lang] && DYN[BB.lang][key];
    if (s == null && BB.lang !== 'fr') s = DYN.en[key];
    if (s == null) s = DYN.fr[key];
    if (typeof s !== 'string') return s;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  /* Texte d'un objet { fr, en } dans une langue : la sienne, sinon le dictionnaire de la langue (clé : le français),
     sinon l'anglais, sinon le français */
  BB.trLang = function (o, lang) {
    if (o == null) return '';
    if (typeof o === 'string') return o;
    if (o[lang] != null) return o[lang];
    const d = DATA[lang];
    if (d && o.fr != null && d[o.fr] != null) return d[o.fr];
    return (lang !== 'fr' && o.en) || o.fr || '';
  };
  BB.tr = (o) => BB.trLang(o, BB.lang);

  /* 22h, 22h15 (fr) / 10 pm, 10:15 pm (en) */
  BB.fmtTime = function (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    if (BB.lang === 'en') {
      const hh = ((h + 11) % 12) + 1;
      return hh + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm');
    }
    if (BB.lang === 'fr') return h + 'h' + (m ? String(m).padStart(2, '0') : '');
    return h + ':' + String(m).padStart(2, '0'); // es, zh : 22:00
  };
  /* un jour : « mercredi 30 », « jeudi 1 oct. » ; en chinois « 9月30日（星期三） » */
  BB.fmtJour = function (d, mois) {
    const j = BB.t('days')[d.getDay()];
    if (BB.lang === 'zh') return (d.getMonth() + 1) + '月' + d.getDate() + '日（' + j + '）';
    return j + ' ' + d.getDate() + (mois ? ' ' + BB.t('months')[d.getMonth()] : '');
  };
  /* une énumération : « a, b, c » ; en chinois « a、b、c » */
  BB.liste = (arr) => arr.join(BB.lang === 'zh' ? '、' : ', ');
  /* un nombre à la façon de la langue (4,6 · 4.6) */
  BB.fmtNum = (n, dec = 1) => new Intl.NumberFormat((LANGS[BB.lang] || LANGS.fr).locale, { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  const NF = {};
  BB.fmtPriceL = (n) => {
    if (n == null) return BB.t('priceOnSite');
    const loc = (LANGS[BB.lang] || LANGS.fr).locale;
    return (NF[loc] || (NF[loc] = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR' }))).format(n);
  };

  /* Applique la langue aux textes marqués data-i18n (le français d'origine est gardé la première fois) */
  const texte = (k) => (BB.lang === 'fr' ? null : UI[BB.lang] && UI[BB.lang][k] != null ? UI[BB.lang][k] : EN[k]);
  function apply() {
    document.documentElement.lang = (LANGS[BB.lang] || LANGS.fr).html;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      if (el.dataset.fr == null) el.dataset.fr = el.innerHTML;
      const v = texte(k);
      el.innerHTML = v != null ? v : el.dataset.fr;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, k] = pair.split(':');
        const keep = 'fr' + attr.replace(/[^a-z]/gi, '');
        if (el.dataset[keep] == null) el.dataset[keep] = el.getAttribute(attr) || '';
        const v = texte(k);
        el.setAttribute(attr, v != null ? v : el.dataset[keep]);
      });
    });
    // les nombres écrits dans la page (la note Google) : virgule ou point selon la langue
    document.querySelectorAll('[data-nombre]').forEach((el) => { el.textContent = BB.fmtNum(Number(el.dataset.nombre)); });
    // le titre et la description de la page (le français d'origine est gardé la première fois)
    const md = document.querySelector('meta[name="description"]');
    if (apply.titreFr == null) { apply.titreFr = document.title; apply.descFr = md ? md.content : ''; }
    document.title = texte('meta.title') || apply.titreFr;
    if (md) md.content = texte('meta.desc') || apply.descFr;
    // le sélecteur : la langue courante sur le bouton, cochée dans la liste
    const cur = document.getElementById('lang-cur'), btn = document.getElementById('lang-btn');
    if (cur) cur.textContent = (LANGS[BB.lang] || LANGS.fr).court;
    if (btn) btn.setAttribute('aria-label', BB.t('langue') + ' : ' + (LANGS[BB.lang] || LANGS.fr).nom);
    document.querySelectorAll('#lang-list [data-lang]').forEach((b) => {
      if (b.dataset.lang === BB.lang) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
  }

  BB.setLang = function (l) {
    if (!CODES.includes(l)) return;
    BB.lang = l;
    BB.store.set('lang', l);
    apply();
    BB.emit('lang', l);
  };
  BB.applyLang = apply;
})();
