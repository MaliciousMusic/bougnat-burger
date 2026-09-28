# Bougnat Burger — maquette du site-appli

Le site pensé comme une petite appli de téléphone : un écran, des onglets en bas, pas de long scroll.
HTML/CSS/JS sans framework ni build : ça s'ouvre tel quel (double-clic sur `index.html`) et s'héberge n'importe où.

Direction artistique choisie le 27 septembre 2026 : **l'affiche d'Auvergne, la nuit tombée**. Fond charbon (brun-noir, jamais gris), texte crème, **le vert du logo** en signature (boutons, prix, onglet actif), titres en **Shrikhand**. Deux motifs tirés du lieu : **le hublot** (la fenêtre ronde à jante verte de la salle : accès rapides, enseigne des horaires, salle, fermeture du film) et **la ligne des Puys** (le puy de Dôme et son antenne, relevés sur photo : pied de la barre d'onglets avec son liseré vert pomme, soulignés des titres ; le bas du film est découpé par une chaîne de dômes plus simple). Icônes et « frites maison » façon tampon encreur. La mascotte : **le bougnat** (l'Auvergnat de Paris, casquette et moustache), héros du film de l'accueil.

**Pas de photos**, tout est recréé (logo vectorisé, salle peinte en vectoriel, film et plats dessinés et animés), à une exception près : le hublot de « Nous » fait défiler des photos publiées par le restaurant lui-même sur sa fiche Google (provenance : `tools/photos/proprietaire.md`).

## Lancer en local

```bash
python tools/dev-server.py
```

Puis http://localhost:5188 (serveur sans cache). Un double-clic sur `index.html` marche aussi. Paramètres utiles :

| Adresse | Effet |
|---|---|
| `?intro` | rejoue l'ouverture (elle ne passe qu'une fois par session) |
| `?font=ultra` · `?font=alfa` · `?font=holtwood` · `?font=bagel` | compare d'autres polices pour les mots de l'ouverture (Shrikhand par défaut) |
| `?lang=en` · `?lang=es` · `?lang=zh` | force l'anglais, l'espagnol ou le chinois (sinon : le choix mémorisé, puis les langues du téléphone, sinon l'anglais) |
| `lab/histoire.html` (`?t=`, `?plan=`) · `lab/bougnat-dessin.html` · `lab/burger.html` | labos du film (plan par plan), du personnage et des burgers dessinés |

## Ce qu'il y a dedans

| Onglet | Contenu |
|---|---|
| **Ouverture** | Leur logo : le volcan vert peint au pinceau et son contour blanc, vectorisés tels quels, dans un hublot à jante verte, la chaîne des Puys au pied de l'écran. Le vert se peint d'un coup de pinceau, puis le contour ; « BOUGNAT » et « BURGER » s'enroulent autour, en filigrane (Shrikhand). « Entrer » (le geste qui autorise le son) : les lettres éclosent une à une, chacune sur sa note, accord final, un reflet traverse le volcan et il fume. Son coupé : elle part toute seule. |
| **Accueil** | L'enseigne des horaires en haut (un petit hublot qui passe à la nuit quand c'est fermé, un voyant vert qui bat quand c'est ouvert ; à l'heure de Paris : « Ouvert · jusqu'à 22h », « Ce soir dès 18h30 », « Fermé · ouvre mercredi à 11h30 ») qui se déplie sur la semaine. Le petit film, « Le bougnat s'est trompé de sac » (31 s, 17 plans, en boucle) : dans l'avion au-dessus des Puys, il prend le sac à emporter au lieu du parachute, saute, tire la poignée… et un menu s'envole. Il rattrape burger, frites et bière, mange tout, devient costaud, s'écrase dans un nuage de fumée, se relève indemne, remet sa casquette et croque une dernière frite. Dessiné et animé en SVG dans le navigateur, avec sa bande-son synthétisée. Accès rapides : Réserver · Commander · Appeler · Itinéraire. Les incontournables. La note Google. |
| **Carte** | Une seule source pour le français et l'anglais (`js/bb-data.js`) : plus de carte anglaise ressaisie à la main. Rubriques collantes, puces qui y mènent. Chaque plat a sa vignette toute prête (une image cuite d'avance) qui flotte doucement ; dans la fiche, il se compose en pseudo-3D sous vos yeux, puis s'ouvre « en éclaté ». Fiche : « Ti' » ou double, steak ou galette, description recalculée depuis les ingrédients, tampon « frites maison », lait cru, allergènes déduits (à confirmer), quantité, ajout au sac. |
| **Commander** | À emporter : burgers, plats, desserts et boissons (softs, bières des Sagnes et Desprat, vins : le choix se fait dans la fiche ; mention alcool et vente interdite aux mineurs), le sac, les créneaux de retrait (aujourd'hui, sinon le prochain jour d'ouverture), prénom et téléphone, un mot pour la cuisine (allergies), paiement **simulé**, ticket tamponné avec numéro de commande. En livraison : Uber Eats, Deliveroo, Raboule, et l'encart « bientôt, directement ici ». |
| **Réserver** | Jours d'ouverture sur deux semaines, midi ou soir, heures de leur module actuel, couverts, prénom, téléphone : demande **simulée**. À partir de 10 couverts, un bouton « Appeler pour confirmer » remplace la demande en ligne. |
| **Nous** (la nuit sur les banquettes vertes) | L'histoire des bougnats, la salle vue par son hublot (peinte en vectoriel d'après une photo, jamais la photo elle-même), ce qu'il y a dans le pain (4 AOP, bœuf VBF, frites maison, bières du coin), une fenêtre sur les avis Google (une sélection d'avis réels, tels quels et datés, qu'on fait glisser), le diaporama des photos du restaurant dans le hublot, l'adresse, l'itinéraire, les réseaux, les mentions légales. |

```
index.html              tout le contenu (lisible par Google et les IA, même sans JS) + icônes dessinées (sprite SVG)
css/bougnat.css         l'identité : charbon, crème, vert du logo ; hublots, ligne des Puys, tampons
js/bb-core.js           hasard seedé, bruit simplex, maths, couleurs, SVG, stockage, sons WebAudio
js/bb-anim.js           les apparitions : ça monte en fondu, les hublots s'ouvrent, les prix se tamponnent
js/bb-data.js           LA source : infos du restaurant, horaires, carte FR/EN, prix, allergènes déduits
js/bb-i18n.js           français (dans le HTML) / anglais (dictionnaire) ; langue du téléphone, jamais l'IP
js/bb-logo.js           le volcan du logo officiel, vectorisé (généré par tools/logo/)
js/bb-splash.js         l'ouverture : leur logo sur l'écusson, les mots enroulés
js/bb-hours.js          l'ardoise des horaires
js/bb-carte.js          la carte, la fiche d'un plat
js/bb-bake.js           les textures des ingrédients, calculées dans le navigateur (Web Workers, cache IndexedDB)
js/bb-burger.js         les burgers en éclaté qui se composent (pseudo-3D, textures réalistes, un calque par couche)
js/bb-vignettes.js      les vignettes toutes prêtes de la carte (assets/img/vignettes/, générées par tools/render-vignettes.mjs)
js/bb-plat.js           les autres plats dessinés de la même façon (viandes, salades, wraps…)
js/bb-avis.js           la fenêtre des avis Google et le diaporama du hublot de « Nous »
js/bb-shop.js           le sac, le retrait, la livraison
js/bb-resa.js           la réservation
js/bb-app.js            onglets, feuilles, son, langue, film, QR sur ordinateur
js/film/bb-histoire.js  le film de l'accueil : les 17 plans, les décors, les objets, les effets (PLANS, EVENTS)
js/film/bb-bougnat-dessin.js  le bougnat : vues de profil, de dos et de face, poses, mains, bretelles, cordon
js/bb-film-sound.js     la bande-son du film (événements → sons synthétisés)
css/puys.css            les masques de la chaîne (générés par tools/puys/build.py)
tools/build-menu.mjs    carte HTML statique + données structurées + llms.txt, depuis bb-data.js
tools/logo/             vectorisation du logo officiel (vectorize_logo.py) et des marques : icône, favicon, écusson (make_marks.py)
tools/salle/            la salle peinte en vectoriel (facettes à dégradés)
tools/puys/             le puy de Dôme relevé sur photo (trace.py), les masques de la chaîne et le paysage de l'ouverture
tools/tampon/           le tampon « frites maison » de la fiche (dessin généré dans bb-carte.js ; encre blanche, un tampon en bois vient l'apposer)
js/i18n/bb-lang-es.js   l'espagnol ; bb-lang-zh.js le chinois simplifié (interface par clé, données : texte français → traduction)
tools/i18n/             extraire.mjs (tous les textes à traduire → source.json) et verifier.mjs (rien d'oublié, variables et balises intactes)
tools/fetch-fonts.py    polices hébergées sur le site (css/fonts.css + assets/fonts/)
tools/render-icons.mjs  l'icône de l'appli : le badge crème, leur volcan au centre (PNG + assets/logo/icone-app.svg)
tools/render-vignettes.mjs  les vignettes de la carte, cuites par le moteur 3D puis figées en WebP
tools/render-og.mjs     image de partage (assets/img/og-bougnat.png)
assets/img/hublot-ciel.svg  le couchant d'affiche sur les Puys, au fond de chaque hublot
tools/dev-server.py     serveur local sans cache
tools/set-domain.mjs    mettre le vrai domaine partout
tools/bump.mjs          estampiller CSS et JS avant chaque publication (cache GitHub Pages)
```

Après une modification de la carte : `node tools/build-menu.mjs` ; d'un plat dessiné ou d'une texture : `node tools/render-vignettes.mjs`.

## À confirmer avec le restaurant

- **Prix des burgers doubles** : leur page « Nos burgers » affiche deux grilles (« double steak ou galette » et « double steak et galette », moins chère). La maquette prend la première ; la seconde est notée dans `double2` (`js/bb-data.js`).
- **Carré d'Aurillac** : leur carte écrit « AOP », ce n'en est pas une. La maquette ne le dit pas.
- **Desserts et boissons** : pas de prix publiés sur leur site. Ceux de la maquette viennent de leur carte à emporter Raboule/CoopCycle (relevée le 27 septembre 2026) : 5 desserts, softs, 15 bières, 7 vins. Les autres desserts et les apéritifs sont notés « sur place uniquement ». Millésimes des vins non repris.
- **Allergènes** : déduits de la composition ; la liste complète (14 allergènes) vient du restaurant.
- **E-mail** : le site affiche bougnatburger@hotmail.fr, leurs mentions légales contact@bougnatburger.fr.
- **Mentions légales** : capital, TVA, directeur de la publication (le gérant), hébergeur de production.
- **Nom de domaine** : aujourd'hui au nom d'« ELTEG SAS » ; à transférer au nom de CHABAILLE.
- **Logo** : vectorisé depuis leur site ; demander le fichier source (vectoriel) pour la version finale.

## Fluidité (téléphones modestes compris)

- la carte et l'accueil affichent des vignettes toutes prêtes (WebP) : rien à calculer en faisant défiler ; elles flottent sur le compositeur, et seulement à l'écran ;
- le moteur 3D (textures, burgers, plats) n'est chargé que pour les fiches : quand on s'arrête sur la carte, ou dès qu'on touche un plat ;
- dans la fiche, chaque couche est un calque que le processeur graphique déplace sans rien repeindre ; pendant les temps immobiles du cycle, plus aucune image n'est calculée ; la fiche glisse d'abord avec sa vignette, le plat se monte ensuite ;
- un onglet jamais ouvert n'est pas mis en page ; les pastilles des vignettes n'ont pas de filtre d'encre ;
- mesures (Chrome, processeur ralenti ×4, écran de téléphone) : carte au repos 88 % → 3 % d'occupation ; défilement de la carte ~30 → 50–60 images/s ; fiche ouverte 98 % → 45 % d'occupation, 0 % pendant les temps immobiles ; première vignette 10–11 s → 2,5 s.

## Passer en production

1. **Hébergement statique** (Netlify, Cloudflare Pages…) + le domaine ; `node tools/set-domain.mjs https://www.bougnatburger.fr`, retirer le `noindex`.
2. **Paiement** : une fonction serveur `/api/checkout` crée la session Stripe Checkout, prix recalculés côté serveur ; webhook → la commande part en cuisine (tablette ou imprimante) et un SMS confirme au client.
3. **Réservations** : back-office simple (ou branchement sur leur outil) ; confirmation par SMS.
4. **Livraison sans plateforme** : commande dans l'appli, course confiée à **Uber Direct** (la livraison d'Uber en marque blanche, par API, disponible en France) ou à la coopérative de coursiers locale (Raboule / CoopCycle). Le restaurant garde son client et ses prix, et paie la course au lieu d'une commission d'environ 30 %. Commander « à travers » l'appli Uber Eats elle-même n'est pas possible : son API sert à recevoir les commandes dans la caisse, pas à en passer.
5. **Avis Google en direct** (API Places) à la place de la sélection figée, avec l'attribution Google.
6. **Légal** : CGV pour la vente en ligne, politique de confidentialité validée.

## SEO local, accessibilité et IA

En place :
- quatre langues (FR dans le HTML, EN, ES, ZH par JS) avec `hreflang` et le sitemap qui les déclare ; titre et description de la page traduits ;
- JSON-LD `Restaurant` (horaires, géo, actions « Réserver » et « Commander à emporter »), `WebSite` (langues), `Menu` généré (sous-sections pour les boissons, végétarien seulement pour le Vegetario) ;
- la carte complète en HTML statique (lisible sans JS) et `llms.txt` : carte et prix, commande, réservation (groupes au téléphone), allergènes, résumés EN/ES/ZH ;
- robots ouverts aux robots IA, manifest ;
- accessibilité : lien d'évitement, un seul `h1`, contrôles tous nommés, vrais boutons radio pour les choix, annonces `aria-live` (couverts, groupe), cibles tactiles d'au moins 24 px, focus visible, `lang` sur chaque nom de langue ; audit : 0 problème relevé.
Hors du site, le plus rentable : fiche Google à jour (lien de réservation, photos), Apple Plans, Bing, OpenStreetMap, et les mêmes nom, adresse, téléphone partout.
