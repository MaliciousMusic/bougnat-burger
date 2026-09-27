/* ==========================================================================
   Bougnat Burger — les données : UNE seule source pour le français et l'anglais
   (la carte anglaise n'est plus une copie ressaisie à la main : chaque plat porte
   ses deux langues, son prix et ses mentions au même endroit).
   Sources : bougnatburger.fr (pages carte, septembre 2026) et fiche Google.
   À CONFIRMER avec le restaurant : voir les commentaires « ⚠ ».
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});

  /* ---------- Le restaurant ---------- */
  BB.INFO = {
    name: 'Bougnat Burger',
    since: '2012-02-02', // « depuis le 02 février 2012 » (page Bougnat Burger de leur site)
    address: { street: '10 boulevard Léon-Malfreyt', zip: '63000', city: 'Clermont-Ferrand' },
    geo: { lat: 45.7739412, lng: 3.0856348 },
    phone: '+33760120063',
    phoneLabel: '07 60 12 00 63',
    email: 'bougnatburger@hotmail.fr', // ⚠ leurs mentions légales donnent contact@bougnatburger.fr
    instagram: 'https://www.instagram.com/bougnatburger/',
    facebook: 'https://www.facebook.com/BougnatBurger',
    google: {
      place: 'https://www.google.com/maps/place/?q=place_id:ChIJ-SIFuukb90cRnD9t-Ioq67Y',
      review: 'https://search.google.com/local/writereview?placeid=ChIJ-SIFuukb90cRnD9t-Ioq67Y',
      rating: 4.6, count: 2039, asOf: '2026-09-27',
    },
    directions: {
      google: 'https://www.google.com/maps/dir/?api=1&destination=45.7739412,3.0856348&destination_place_id=ChIJ-SIFuukb90cRnD9t-Ioq67Y',
      apple: 'https://maps.apple.com/?daddr=10+boulevard+L%C3%A9on-Malfreyt,+63000+Clermont-Ferrand&dirflg=w',
    },
    delivery: [
      { id: 'ubereats', name: 'Uber Eats', url: 'https://www.ubereats.com/fr/store/bougnat-burger-clermont/liGEKfrmXW-DfAmCzAOFBA' },
      { id: 'deliveroo', name: 'Deliveroo', url: 'https://deliveroo.fr/fr/menu/clermont-ferrand/centre-ville/bougnat-burger' },
      { id: 'raboule', name: 'Raboule', url: 'https://cyclome.coopcycle.org/fr/restaurant/15-bougnat-burger', bike: true },
    ],
    /* Horaires (heure de Paris) : jour 0 = dimanche. Identiques sur le site et sur Google (27/09/2026). */
    hours: {
      0: [], 1: [], 2: [],
      3: [['11:30', '14:00'], ['18:30', '22:00']],
      4: [['11:30', '14:00'], ['18:30', '22:00']],
      5: [['11:30', '14:00'], ['18:30', '22:15']],
      6: [['11:30', '14:00'], ['18:30', '22:15']],
    },
    /* Créneaux de réservation proposés par leur module actuel (VikRestaurants) */
    tableSlots: { midi: ['11:30', '12:00', '12:30', '13:00', '13:30'], soir: ['18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30'] },
    maxGuests: 10,
  };

  /* ---------- Libellés partagés ---------- */
  const SIDES = { fr: 'Servi avec frites faites maison et salade maison.', en: 'Served with homemade fries and house salad.' };
  const RAW = {
    stn: { fr: 'Fromage au lait cru : Saint-Nectaire fermier.', en: 'Raw-milk cheese: farmhouse Saint-Nectaire.' },
    chevre: { fr: 'Fromage au lait cru : chèvre.', en: 'Raw-milk cheese: goat\'s cheese.' },
    both: { fr: 'Fromages au lait cru : Saint-Nectaire fermier et chèvre.', en: 'Raw-milk cheeses: farmhouse Saint-Nectaire and goat\'s cheese.' },
  };
  // Ingrédients des burgers (pour les descriptions ; l'ordre d'empilement du dessin est dans bb-burger.js)
  const I = {
    pain: { fr: 'pain burger artisanal', en: 'artisan burger bun' },
    steak: { fr: 'steak haché façon bouchère VBF', en: 'butcher-style French beef patty (VBF)' },
    ouGalette: { fr: 'ou galette de pommes de terre', en: 'or a potato rösti instead (veggie)' },
    galette: { fr: 'galette de pommes de terre', en: 'potato rösti' },
    stn: { fr: 'Saint-Nectaire fermier AOP', en: 'farmhouse Saint-Nectaire PDO' },
    bleu: { fr: 'Bleu d\'Auvergne AOP', en: 'Bleu d\'Auvergne PDO' },
    cantal: { fr: 'Cantal jeune AOP', en: 'young Cantal PDO' },
    salers: { fr: 'Cantal Salers AOP', en: 'Salers PDO cheese' },
    aurillac: { fr: 'Carré d\'Aurillac', en: 'Carré d\'Aurillac soft cheese' }, // ⚠ leur carte écrit « AOP » : ce n'en est pas une
    chevre: { fr: 'fromage de chèvre moulé à la louche', en: 'ladle-moulded goat\'s cheese' },
    jambon: { fr: 'jambon sec', en: 'dry-cured ham' },
    chorizo: { fr: 'chorizo', en: 'chorizo' },
    poivrons: { fr: 'poivrons', en: 'roasted peppers' },
    tomates: { fr: 'tomates', en: 'tomatoes' },
    paillasson: { fr: 'pomme paillasson', en: 'crispy potato straw cake' },
    noix: { fr: 'noix', en: 'walnuts' },
    miel: { fr: 'miel', en: 'honey' },
    salade: { fr: 'salade et mesclun maison', en: 'house salad and mesclun' },
    sStn: { fr: 'sauce au Saint-Nectaire fermier AOP', en: 'farmhouse Saint-Nectaire PDO sauce' },
    sBleu: { fr: 'sauce au Bleu d\'Auvergne AOP', en: 'Bleu d\'Auvergne PDO sauce' },
    sChili: { fr: 'sauce chili', en: 'chili sauce' },
    sCiboulette: { fr: 'sauce crème ciboulette', en: 'sour cream and chive sauce' },
  };
  BB.ING = I;

  /* ---------- Les burgers ----------
     prix : [Ti (simple), double]. ⚠ Leur page « Nos burgers » affiche DEUX grilles de doubles
     (« double steak ou galette » et « double steak et galette », moins chère) : la maquette prend la
     première ; la seconde est gardée dans `double2` pour mémoire. À faire trancher par le restaurant. */
  const burger = (id, fr, en, price, double, double2, ings, extra = {}) => ({
    id, cat: 'burgers', name: { fr, en }, price, double, double2,
    ings, veggie: ings.includes('ouGalette') || ings.includes('galette'),
    raw: extra.raw || null, signature: !!extra.signature, spicy: !!extra.spicy,
    tagline: extra.tagline || null,
  });
  BB.BURGER_LIST = [
    burger('mefia-te', 'Mefia Te', 'Mefia Te', 18.9, 23.9, 21.9,
      ['pain', 'steak', 'ouGalette', 'stn', 'bleu', 'cantal', 'jambon', 'tomates', 'paillasson', 'noix', 'salade', 'sStn'],
      { raw: 'stn', signature: true, tagline: { fr: 'Les trois AOP d\'un coup. « Méfie-toi » : il est copieux.', en: 'All three PDO cheeses at once. "Watch out": it\'s a big one.' } }),
    burger('bougnat', 'Bougnat', 'Bougnat', 16.9, 21.9, 19.9,
      ['pain', 'steak', 'ouGalette', 'stn', 'jambon', 'paillasson', 'salade', 'sStn'],
      { raw: 'stn', signature: true, tagline: { fr: 'Le classique de la maison : Saint-Nectaire et jambon sec.', en: 'The house classic: Saint-Nectaire and dry-cured ham.' } }),
    burger('gourmand', 'Gourmand', 'Gourmand', 18.9, 23.9, 22.9,
      ['pain', 'steak', 'ouGalette', 'stn', 'bleu', 'jambon', 'paillasson', 'noix', 'salade', 'sStn'], { raw: 'stn' }),
    burger('vulcano', 'Vulcano', 'Vulcano', 16.9, 21.9, 19.9,
      ['pain', 'steak', 'ouGalette', 'cantal', 'poivrons', 'chorizo', 'paillasson', 'salade', 'sChili'],
      { spicy: true, signature: true, tagline: { fr: 'Chorizo, poivrons et sauce chili : ça gronde.', en: 'Chorizo, peppers and chili sauce: it rumbles.' } }),
    burger('blue', 'Blue', 'Blue', 16.9, 21.9, 19.9,
      ['pain', 'steak', 'ouGalette', 'bleu', 'cantal', 'paillasson', 'noix', 'salade', 'sBleu']),
    burger('rillac', 'Rillac', 'Rillac', 17.9, 22.9, 19.9,
      ['pain', 'steak', 'ouGalette', 'aurillac', 'paillasson', 'noix', 'salade', 'sBleu']),
    burger('salers', 'Salers', 'Salers', 20.9, 25.9, 21.9,
      ['pain', 'steak', 'ouGalette', 'salers', 'jambon', 'paillasson', 'salade', 'sStn'], { raw: 'stn' }),
    burger('cabri', 'Cabri', 'Cabri', 18.9, 23.9, 21.9,
      ['pain', 'steak', 'ouGalette', 'chevre', 'jambon', 'miel', 'salade', 'sCiboulette'], { raw: 'chevre' }),
    burger('vegetario', 'Vegetario', 'Vegetario', 15.9, 18.9, 18.9,
      ['pain', 'galette', 'cantal', 'poivrons', 'tomates', 'salade', 'sCiboulette']),
    burger('mefiano', 'Mefiano', 'Mefiano', 21.9, 26.9, 23.9,
      ['pain', 'steak', 'ouGalette', 'stn', 'bleu', 'cantal', 'chevre', 'jambon', 'chorizo', 'tomates', 'paillasson', 'poivrons', 'noix', 'salade', 'sStn'],
      { raw: 'both', tagline: { fr: 'Tout le terroir dans un seul pain.', en: 'The whole region in one bun.' } }),
  ];

  /* ---------- Le reste de la carte ---------- */
  BB.MENU_OTHER = [
    // Viandes
    { id: 'bavette', cat: 'viandes', name: { fr: 'Bavette d\'aloyau', en: 'Flank steak' }, price: 20.9,
      desc: { fr: 'Bavette de bœuf charolais bio, 300 g. Origine France.', en: 'Organic Charolais beef flank steak, 300 g. French origin.' }, sides: true },
    { id: 'steak-hache', cat: 'viandes', name: { fr: 'Steak haché façon bouchère', en: 'Butcher-style beef patty' }, price: 16.9,
      desc: { fr: 'Steak haché façon bouchère VBF. Viande bovine, origine France.', en: 'Butcher-style patty, French beef (VBF).' }, sides: true },
    // Salades
    { id: 'allier', cat: 'salades', name: { fr: 'Allier', en: 'Allier' }, price: 16.9,
      desc: { fr: 'Salade et mesclun maison, saumon fumé en Auvergne, Bleu d\'Auvergne AOP, Cantal jeune AOP, tomates cerises.', en: 'House salad and mesclun, salmon smoked in Auvergne, Bleu d\'Auvergne PDO, young Cantal PDO, cherry tomatoes.' } },
    { id: 'chevre-chaud', cat: 'salades', name: { fr: 'Chèvre chaud', en: 'Warm goat\'s cheese' }, price: 16.9, raw: 'chevre',
      desc: { fr: 'Salade et mesclun maison, toasts chauds de chèvre moulé à la louche, miel, jambon d\'Auvergne IGP, pignons de pin, herbes de Provence, tomates cerises.', en: 'House salad and mesclun, warm toasts of ladle-moulded goat\'s cheese, honey, Auvergne PGI ham, pine nuts, herbes de Provence, cherry tomatoes.' } },
    { id: 'vercingetorix', cat: 'salades', name: { fr: 'Vercingétorix vs César', en: 'Vercingetorix vs Caesar' }, price: 16.9,
      desc: { fr: 'Salade et mesclun maison, Cantal jeune AOP, blanc de poulet, poivrons, croûtons à l\'huile d\'olive, tomates cerises.', en: 'House salad and mesclun, young Cantal PDO, chicken breast, peppers, olive-oil croutons, cherry tomatoes.' } },
    { id: 'auvergnate', cat: 'salades', name: { fr: 'Auvergnate', en: 'Auvergnate' }, price: 15.9,
      desc: { fr: 'Salade et mesclun maison, jambon d\'Auvergne IGP, Bleu d\'Auvergne AOP, Cantal jeune AOP, noix, tomates cerises.', en: 'House salad and mesclun, Auvergne PGI ham, Bleu d\'Auvergne PDO, young Cantal PDO, walnuts, cherry tomatoes.' } },
    { id: 'sancy', cat: 'salades', name: { fr: 'Sancy', en: 'Sancy' }, price: 16.9, raw: 'stn',
      desc: { fr: 'Salade et mesclun maison, toasts chauds de Saint-Nectaire fermier AOP et de Bleu d\'Auvergne AOP, Cantal jeune AOP, jambon d\'Auvergne IGP, tomates cerises.', en: 'House salad and mesclun, warm toasts of farmhouse Saint-Nectaire PDO and Bleu d\'Auvergne PDO, young Cantal PDO, Auvergne PGI ham, cherry tomatoes.' } },
    // Wraps
    { id: 'wrap-saumon', cat: 'wraps', name: { fr: 'Wrap saumon', en: 'Salmon wrap' }, price: 18.9, sides: true,
      desc: { fr: 'Galette de blé, saumon fumé en Auvergne, tomates, salade et mesclun maison, sauce à l\'aneth.', en: 'Wheat tortilla, salmon smoked in Auvergne, tomatoes, house salad and mesclun, dill sauce.' } },
    { id: 'wrap-chevre', cat: 'wraps', name: { fr: 'Wrap chèvre', en: 'Goat\'s cheese wrap' }, price: 19.9, sides: true, raw: 'chevre',
      desc: { fr: 'Galette de blé, chèvre moulé à la louche, miel, jambon sec, tomates, salade et mesclun maison, sauce crème ciboulette.', en: 'Wheat tortilla, ladle-moulded goat\'s cheese, honey, dry-cured ham, tomatoes, house salad and mesclun, sour cream and chive sauce.' } },
    { id: 'wrap-poulet', cat: 'wraps', name: { fr: 'Wrap poulet', en: 'Chicken wrap' }, price: 18.9, sides: true,
      desc: { fr: 'Galette de blé, blanc de poulet, tomates, poivrons, salade et mesclun maison, sauce crème curry.', en: 'Wheat tortilla, chicken breast, tomatoes, peppers, house salad and mesclun, creamy curry sauce.' } },
    // Enfant
    { id: 'petiot', cat: 'enfant', name: { fr: 'Le Petiot', en: 'Le Petiot' }, price: 13.9, burger: true, sides: true, raw: 'stn',
      desc: { fr: 'Pain burger artisanal, steak haché VBF ou galette de pommes de terre, Cantal jeune AOP, tomates, salade et mesclun, sauce au Saint-Nectaire fermier. Avec un sirop et une boule de glace.', en: 'Artisan bun, French beef patty or potato rösti, young Cantal PDO, tomatoes, salad and mesclun, farmhouse Saint-Nectaire sauce. With a cordial and one scoop of ice cream.' } },
    // Desserts (⚠ pas de prix publiés : à compléter)
    { id: 'framboisier', cat: 'desserts', name: { fr: 'Framboisier', en: 'Raspberry cake' }, price: null, homemade: true },
    { id: 'tiramisu-framboise', cat: 'desserts', name: { fr: 'Tiramisu framboise', en: 'Raspberry tiramisu' }, price: null, homemade: true },
    { id: 'tiramisu-cafe', cat: 'desserts', name: { fr: 'Tiramisu café', en: 'Coffee tiramisu' }, price: null, homemade: true },
    { id: 'foret-noire', cat: 'desserts', name: { fr: 'Forêt noire', en: 'Black Forest cake' }, price: null, homemade: true },
    { id: 'mousse-chocolat', cat: 'desserts', name: { fr: 'Mousse au chocolat', en: 'Chocolate mousse' }, price: null, homemade: true },
    { id: 'moelleux', cat: 'desserts', name: { fr: 'Moelleux', en: 'Molten cake' }, price: null },
    { id: 'tarte-citron', cat: 'desserts', name: { fr: 'Tarte au citron', en: 'Lemon tart' }, price: null },
    { id: 'nougat-glace', cat: 'desserts', name: { fr: 'Nougat glacé', en: 'Iced nougat' }, price: null },
    { id: 'givres', cat: 'desserts', name: { fr: 'Citron, coco ou orange givrés', en: 'Frosted lemon, coconut or orange' }, price: null },
    { id: 'glaces', cat: 'desserts', name: { fr: 'Glaces et sorbets', en: 'Ice creams and sorbets' }, price: null },
    { id: 'plateau', cat: 'desserts', name: { fr: 'Plateau gourmand', en: 'Dessert platter' }, price: null },
    // Boissons (⚠ pas de prix publiés)
    { id: 'sagnes', cat: 'boissons', name: { fr: 'Bières de la Brasserie des Sagnes', en: 'Brasserie des Sagnes craft beers' }, price: null, local: true,
      desc: { fr: 'Brasserie artisanale auvergnate : blonde, ambrée et cuvées plus typées.', en: 'Auvergne craft brewery: blonde, amber and bolder brews.' } },
    { id: 'desprat', cat: 'boissons', name: { fr: 'Bières de la Brasserie Desprat', en: 'Brasserie Desprat beers' }, price: null, local: true,
      desc: { fr: 'Une maison historique de la bière en Auvergne.', en: 'A historic Auvergne brewing house.' } },
    { id: 'vins', cat: 'boissons', name: { fr: 'Vins bio et vins d\'Auvergne', en: 'Organic and Auvergne wines' }, price: null, local: true,
      desc: { fr: 'Au verre ou à la bouteille.', en: 'By the glass or the bottle.' } },
    { id: 'aperitifs', cat: 'boissons', name: { fr: 'Apéritifs', en: 'Aperitifs' }, price: null,
      desc: { fr: 'Rhum, vodka, whisky, tequila, pastis.', en: 'Rum, vodka, whisky, tequila, pastis.' } },
    { id: 'softs', cat: 'boissons', name: { fr: 'Softs', en: 'Soft drinks' }, price: null,
      desc: { fr: 'Sodas, jus Pago, eaux minérales.', en: 'Sodas, Pago juices, mineral water.' } },
  ];

  BB.CATS = [
    { id: 'burgers', icon: 'i-burger', name: { fr: 'Burgers', en: 'Burgers' } },
    { id: 'viandes', icon: 'i-steak', name: { fr: 'Viandes', en: 'Meat' } },
    { id: 'salades', icon: 'i-salade', name: { fr: 'Salades', en: 'Salads' } },
    { id: 'wraps', icon: 'i-wrap', name: { fr: 'Wraps', en: 'Wraps' } },
    { id: 'enfant', icon: 'i-petiot', name: { fr: 'Enfant', en: 'Kids' } },
    { id: 'desserts', icon: 'i-dessert', name: { fr: 'Desserts', en: 'Desserts' } },
    { id: 'boissons', icon: 'i-biere', name: { fr: 'Boissons', en: 'Drinks' } },
  ];

  /* Description d'un burger dans une langue, à partir de ses ingrédients (jamais ressaisie) */
  BB.burgerDesc = function (b, lang, double) {
    const parts = b.ings.map((k) => {
      if (k === 'steak' && double) return lang === 'en' ? 'double butcher-style French beef patty (VBF)' : 'double steak haché façon bouchère VBF';
      if (k === 'galette' && double) return lang === 'en' ? 'double potato rösti' : 'double galette de pommes de terre';
      return I[k][lang];
    });
    // « steak, ou galette » : la virgule avant « ou » se retire
    let s = parts.join(', ').replace(/, (ou |or a )/g, ' $1');
    s = s.charAt(0).toUpperCase() + s.slice(1) + '.';
    return s;
  };
  BB.SIDES = SIDES;
  BB.RAW = RAW;

  /* Allergènes majeurs déduits de la composition (⚠ à valider par le restaurant ; pas d'invention au-delà) */
  BB.allergens = function (item) {
    const a = new Set();
    const ings = item.ings || [];
    if (item.cat === 'burgers' || item.burger || item.cat === 'wraps') a.add('gluten');
    if (ings.some((k) => ['stn', 'bleu', 'cantal', 'salers', 'aurillac', 'chevre', 'sStn', 'sBleu', 'sCiboulette'].includes(k))) a.add('lait');
    if (ings.includes('noix')) a.add('fruitsACoque');
    const d = item.desc ? item.desc.fr : '';
    if (/Saint-Nectaire|Bleu|Cantal|chèvre|crème/i.test(d)) a.add('lait');
    if (/noix/i.test(d)) a.add('fruitsACoque'); // (les pignons ne font pas partie des 14 allergènes réglementaires)
    if (/croûtons|toasts|Galette de blé/i.test(d)) a.add('gluten');
    if (/saumon/i.test(d)) a.add('poisson');
    return [...a];
  };
  BB.ALLERGEN_LABELS = {
    gluten: { fr: 'gluten', en: 'gluten' },
    lait: { fr: 'lait', en: 'milk' },
    fruitsACoque: { fr: 'fruits à coque', en: 'tree nuts' },
    poisson: { fr: 'poisson', en: 'fish' },
  };

  /* ---------- Une sélection d'avis Google réels (fiche du restaurant, relevés le 27 septembre 2026) ----------
     Reproduits tels quels (fautes comprises), avec leur note et la date de l'avis ; le nom tel qu'affiché
     par Google, raccourci à l'initiale. PROD : remplacés par l'API Google Places, en direct. */
  BB.AVIS = [
    { nom: 'Mika', note: 5, date: { fr: 'août 2026', en: 'August 2026' }, texte: "Toujours bien accueilli, on mange bien et c'est très bon.\nOn adore et recommande" },
    { nom: 'François F.', note: 5, date: { fr: 'juillet 2026', en: 'July 2026' }, texte: "Excellente cuisine,  Burgers copieux et bons. Merci à la serveuse super sympa, drôle et charmante. Dommage on a pas su son prénom!" },
    { nom: 'Axelle D.', note: 5, date: { fr: 'juin 2026', en: 'June 2026' }, texte: "Le burger gourmand fut délicieux ! C'est très rare que j'aime les frites mais j'ai adoré celles ci.\nJ'ai passé un très bon moment avec moi-même, servie par Anaïs très sympathique et à l'écoute\nJe recommande les yeux fermés ;)" },
    { nom: 'Sky_Sherco', note: 5, date: { fr: 'décembre 2025', en: 'December 2025' }, texte: "Service très rapide !\nLes Burger super bon mais aussi très copieux ! En 2025 ça fait plaisir d’en avoir pour son argent vu la taille des Burger et de leur viandes" },
    { nom: 'Sker FaLL', note: 5, date: { fr: 'novembre 2025', en: 'November 2025' }, texte: "Anomalie, expérience incroyable pour un burger frite. C'est le plus copieux que j'ai jamais eu. Frites excellente. Je vous invite à tous tester !" },
    { nom: 'Super Zouzou', note: 5, date: { fr: 'octobre 2025', en: 'October 2025' }, texte: "Chanceux les Clermontois car c'est vous qui avez le meilleur burger. Qualité exceptionnelle des ingrédients, plat généreux bon rapport qualité prix. Un grand professionnalisme pour toute l'équipe...Bravo et cette sauce au bleu un régal." },
    { nom: 'Jules R.', note: 5, date: { fr: '2025', en: '2025' }, texte: "Les burgers étaient savoureux, préparés avec des produits de qualité et servis en portions généreuses.\nLes frites maison étaient excellentes.\nLes desserts, quant à eux, étaient un vrai régal.\nLe service était attentionné et l’ambiance très plaisante.\nJe recommande vivement ce restaurant, sans doute l’un des meilleurs de Clermont." },
  ];
})();
