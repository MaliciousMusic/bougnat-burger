/* ==========================================================================
   Bougnat Burger — deux langues, une seule page.
   · Le français est écrit dans le HTML (lisible par Google et les IA, même sans JS).
   · L'anglais est ici, clé par clé ; les plats, eux, portent leurs deux langues dans bb-data.js.
   · Choix de la langue : ?lang=… > choix mémorisé > langue du téléphone (navigator.languages).
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
    'del.lede': 'For now, delivery goes through these apps:',
    'del.soon.title': 'Soon, right here',
    'del.soon.text': 'Order in the Bougnat Burger app and a courier brings it to you. Same prices as in the restaurant, no platform commission.',
    'resa.title': 'Book a table',
    'resa.lede': 'Tell us when and we\'ll keep a table for you. For more than 10 people, give us a call.',
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
    'nous.photo.alt': 'A painting of the Bougnat Burger dining room: green booths, a laid table, a porthole window onto the terrace',
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
    'avis.src': 'Google review, 2025',
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
    'lang.switch': 'Version française',
    'sound': 'Sound',
    'bag': 'My bag',
    'close': 'Close',
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

  function detect() {
    try {
      const q = new URLSearchParams(location.search).get('lang');
      if (q === 'fr' || q === 'en') return q;
    } catch (e) { /* file:// sans recherche */ }
    const saved = BB.store && BB.store.get('lang');
    if (saved === 'fr' || saved === 'en') return saved;
    const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'fr']).map((l) => String(l).toLowerCase());
    // Un téléphone réglé en français → français ; sinon, l'anglais sert de langue commune aux visiteurs
    return langs[0].startsWith('fr') ? 'fr' : 'en';
  }

  BB.lang = detect();

  /* BB.t('clé', { t: '22h' }) → texte dynamique dans la langue courante */
  BB.t = function (key, vars) {
    const table = DYN[BB.lang] || DYN.fr;
    let s = table[key];
    if (s == null) s = DYN.fr[key];
    if (typeof s !== 'string') return s;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  };
  /* Texte d'un objet { fr, en } */
  BB.tr = (o) => (o == null ? '' : typeof o === 'string' ? o : o[BB.lang] || o.fr);

  /* 22h, 22h15 (fr) / 10 pm, 10:15 pm (en) */
  BB.fmtTime = function (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    if (BB.lang === 'en') {
      const hh = ((h + 11) % 12) + 1;
      return hh + (m ? ':' + String(m).padStart(2, '0') : '') + (h < 12 ? ' am' : ' pm');
    }
    return h + 'h' + (m ? String(m).padStart(2, '0') : '');
  };
  BB.fmtPriceL = (n) => (n == null ? BB.t('priceOnSite') : new Intl.NumberFormat(BB.lang === 'en' ? 'en-GB' : 'fr-FR', { style: 'currency', currency: 'EUR' }).format(n));

  /* Applique la langue aux textes marqués data-i18n (le français d'origine est gardé la première fois) */
  function apply() {
    document.documentElement.lang = BB.lang;
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const k = el.dataset.i18n;
      if (el.dataset.fr == null) el.dataset.fr = el.innerHTML;
      el.innerHTML = BB.lang === 'en' && EN[k] != null ? EN[k] : el.dataset.fr;
    });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, k] = pair.split(':');
        const keep = 'fr' + attr.replace(/[^a-z]/gi, '');
        if (el.dataset[keep] == null) el.dataset[keep] = el.getAttribute(attr) || '';
        el.setAttribute(attr, BB.lang === 'en' && EN[k] != null ? EN[k] : el.dataset[keep]);
      });
    });
    const on = document.getElementById('lang-on'), off = document.getElementById('lang-off');
    if (on && off) { on.textContent = BB.lang.toUpperCase(); off.textContent = BB.lang === 'en' ? 'FR' : 'EN'; }
  }

  BB.setLang = function (l) {
    if (l !== 'fr' && l !== 'en') return;
    BB.lang = l;
    BB.store.set('lang', l);
    apply();
    BB.emit('lang', l);
  };
  BB.applyLang = apply;
})();
