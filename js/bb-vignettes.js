/* Bougnat Burger — les vignettes de la carte, calculées d'avance (tools/render-vignettes.mjs) : id → image.
   Sans ce fichier (ou avec ?cuire dans l'adresse), les vignettes sont composées dans le navigateur par le moteur. */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  if (/[?&]cuire\b/.test(location.search)) return;
  BB.VIGNETTES = {
    'allier': 'assets/img/vignettes/allier.webp?v=20260927',
    'aperitifs': 'assets/img/vignettes/aperitifs.webp?v=20260927',
    'auvergnate': 'assets/img/vignettes/auvergnate.webp?v=20260927',
    'bavette': 'assets/img/vignettes/bavette.webp?v=20260927',
    'blue': 'assets/img/vignettes/blue.webp?v=20260927',
    'bougnat': 'assets/img/vignettes/bougnat.webp?v=20260927',
    'cabri': 'assets/img/vignettes/cabri.webp?v=20260927',
    'chevre-chaud': 'assets/img/vignettes/chevre-chaud.webp?v=20260927',
    'desprat': 'assets/img/vignettes/desprat.webp?v=20260927',
    'foret-noire': 'assets/img/vignettes/foret-noire.webp?v=20260927',
    'framboisier': 'assets/img/vignettes/framboisier.webp?v=20260927',
    'givres': 'assets/img/vignettes/givres.webp?v=20260927',
    'glaces': 'assets/img/vignettes/glaces.webp?v=20260927',
    'gourmand': 'assets/img/vignettes/gourmand.webp?v=20260927',
    'mefia-te': 'assets/img/vignettes/mefia-te.webp?v=20260927',
    'mefiano': 'assets/img/vignettes/mefiano.webp?v=20260927',
    'moelleux': 'assets/img/vignettes/moelleux.webp?v=20260927',
    'mousse-chocolat': 'assets/img/vignettes/mousse-chocolat.webp?v=20260927',
    'nougat-glace': 'assets/img/vignettes/nougat-glace.webp?v=20260927',
    'petiot': 'assets/img/vignettes/petiot.webp?v=20260927',
    'plateau': 'assets/img/vignettes/plateau.webp?v=20260927',
    'rillac': 'assets/img/vignettes/rillac.webp?v=20260927',
    'sagnes': 'assets/img/vignettes/sagnes.webp?v=20260927',
    'salers': 'assets/img/vignettes/salers.webp?v=20260927',
    'sancy': 'assets/img/vignettes/sancy.webp?v=20260927',
    'softs': 'assets/img/vignettes/softs.webp?v=20260927',
    'steak-hache': 'assets/img/vignettes/steak-hache.webp?v=20260927',
    'tarte-citron': 'assets/img/vignettes/tarte-citron.webp?v=20260927',
    'tiramisu-cafe': 'assets/img/vignettes/tiramisu-cafe.webp?v=20260927',
    'tiramisu-framboise': 'assets/img/vignettes/tiramisu-framboise.webp?v=20260927',
    'vegetario': 'assets/img/vignettes/vegetario.webp?v=20260927',
    'vercingetorix': 'assets/img/vignettes/vercingetorix.webp?v=20260927',
    'vins': 'assets/img/vignettes/vins.webp?v=20260927',
    'vulcano': 'assets/img/vignettes/vulcano.webp?v=20260927',
    'wrap-chevre': 'assets/img/vignettes/wrap-chevre.webp?v=20260927',
    'wrap-poulet': 'assets/img/vignettes/wrap-poulet.webp?v=20260927',
    'wrap-saumon': 'assets/img/vignettes/wrap-saumon.webp?v=20260927',
  };
})();
