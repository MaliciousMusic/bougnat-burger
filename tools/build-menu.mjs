#!/usr/bin/env node
// Écrit la carte en HTML statique (français) dans index.html, ses données structurées (schema.org Menu)
// et llms.txt, à partir de la source unique js/bb-data.js. À relancer après chaque changement de carte.
// Usage : node tools/build-menu.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = { window: {}, console };
vm.createContext(ctx);
vm.runInContext(readFileSync(join(root, 'js', 'bb-data.js'), 'utf8'), ctx);
const BB = ctx.window.BB;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = (n) => n.toFixed(2).replace('.', ',') + ' €';
const html = readFileSync(join(root, 'index.html'), 'utf8');
const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1].replace(/\/+$/, '');

/* ---------- 1. la carte en HTML (lisible sans JS) ---------- */
let out = '';
for (const cat of BB.CATS) {
  out += `<section class="menu-sec" id="m-${cat.id}"><h3>${esc(cat.name.fr)}</h3>\n`;
  if (cat.id === 'burgers') {
    out += '<ul class="list-items">\n';
    for (const b of BB.BURGER_LIST) {
      out += `<li class="item plain"><h4>Ti' ${esc(b.name.fr)}</h4><span class="price">${eur(b.price)} · ${esc(b.name.fr)} double ${eur(b.double)}</span><p>${esc(BB.burgerDesc(b, 'fr', false))} ${esc(BB.SIDES.fr)}</p></li>\n`;
    }
    out += '</ul>\n';
  } else {
    out += '<ul class="list-items">\n';
    for (const it of BB.MENU_OTHER.filter((x) => x.cat === cat.id)) {
      const ps = it.variants ? it.variants.map((v) => v.price) : [];
      const prix = it.variants ? (Math.min(...ps) !== Math.max(...ps) ? 'dès ' : '') + eur(Math.min(...ps)) : it.price != null ? eur(it.price) : it.surPlace ? 'sur place uniquement' : '';
      const vars = it.variants ? `<ul>${it.variants.map((v) => `<li>${esc(v.name.fr)}${v.desc ? ` (${esc(v.desc.fr)})` : ''} : ${eur(v.price)}</li>`).join('')}</ul>` : '';
      out += `<li class="item plain"><h4>${esc(it.name.fr)}</h4>${prix ? `<span class="price">${prix}</span>` : ''}${it.desc ? `<p>${esc(it.desc.fr)}</p>` : ''}${vars}</li>\n`;
    }
    out += '</ul>\n';
  }
  out += '</section>\n';
}
if (BB.MENU_OTHER.some((x) => x.alcool)) out += `<p class="fine">L'abus d'alcool est dangereux pour la santé, à consommer avec modération. Vente d'alcool interdite aux mineurs.</p>\n`;
let next = html.replace(/<!-- MENU:START -->[\s\S]*?<!-- MENU:END -->/, `<!-- MENU:START -->\n${out}<!-- MENU:END -->`);

/* ---------- 2. données structurées : la carte ---------- */
const offer = (p) => ({ '@type': 'Offer', price: p.toFixed(2), priceCurrency: 'EUR' });
const menu = {
  '@context': 'https://schema.org',
  '@type': 'Menu',
  '@id': canonical + '/#carte',
  name: 'La carte du Bougnat Burger',
  inLanguage: 'fr',
  hasMenuSection: BB.CATS.map((cat) => {
    const items = cat.id === 'burgers'
      ? BB.BURGER_LIST.flatMap((b) => [
          // végétarien seulement s'il l'est tel que servi (le Vegetario) : la galette « possible » ne suffit pas (jambon, chorizo…)
          { '@type': 'MenuItem', name: "Ti' " + b.name.fr, description: BB.burgerDesc(b, 'fr', false), offers: offer(b.price), ...(b.id === 'vegetario' ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}) },
          { '@type': 'MenuItem', name: b.name.fr + ' (double)', description: BB.burgerDesc(b, 'fr', true), offers: offer(b.double), ...(b.id === 'vegetario' ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}) },
        ])
      : BB.MENU_OTHER.filter((x) => x.cat === cat.id && !x.variants).map((it) => ({
          '@type': 'MenuItem', name: it.name.fr,
          ...(it.desc || it.surPlace ? { description: [it.desc ? it.desc.fr : '', it.surPlace ? 'Sur place uniquement.' : ''].filter(Boolean).join(' ') } : {}),
          ...(it.price != null ? { offers: offer(it.price) } : {}),
        }));
    // les familles de boissons (softs, bières, vins) : une sous-section chacune, un article par bouteille
    const subs = BB.MENU_OTHER.filter((x) => x.cat === cat.id && x.variants).map((it) => ({
      '@type': 'MenuSection', name: it.name.fr, ...(it.desc ? { description: it.desc.fr } : {}),
      hasMenuItem: it.variants.map((v) => ({ '@type': 'MenuItem', name: v.name.fr, ...(v.desc ? { description: v.desc.fr } : {}), offers: offer(v.price) })),
    }));
    return { '@type': 'MenuSection', name: cat.name.fr, ...(items.length ? { hasMenuItem: items } : {}), ...(subs.length ? { hasMenuSection: subs } : {}) };
  }),
};
const ld = `<!-- MENU-JSONLD:START -->\n  <script type="application/ld+json">\n  ${JSON.stringify(menu)}\n  </script>\n  <!-- MENU-JSONLD:END -->`;
next = next.replace(/<!-- MENU-JSONLD:START -->[\s\S]*?<!-- MENU-JSONLD:END -->/, ld);
writeFileSync(join(root, 'index.html'), next);

/* ---------- 3. llms.txt : le résumé pour les assistants IA ---------- */
const I = BB.INFO;
const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const hours = [1, 2, 3, 4, 5, 6, 0].map((d) => `- ${days[d]} : ${I.hours[d].length ? I.hours[d].map(([a, b]) => `${a}–${b}`).join(' et ') : 'fermé'}`).join('\n');
let llms = `# Bougnat Burger

> Restaurant de burgers au terroir auvergnat à Clermont-Ferrand, ouvert depuis le 2 février 2012. Burgers maison au Saint-Nectaire fermier, Cantal, Salers et Bleu d'Auvergne (AOP), steak haché façon bouchère VBF (viande bovine française) ou galette de pommes de terre, pain artisanal, frites et salade maison. Sur place, à emporter, en livraison. Réservation possible.

## Informations pratiques
- Adresse : ${I.address.street}, ${I.address.zip} ${I.address.city}
- Téléphone : ${I.phoneLabel}
- E-mail : ${I.email}
- Note Google : ${String(I.google.rating).replace('.', ',')}/5 sur ${I.google.count} avis (au ${I.google.asOf})
- Site : ${canonical}/
- Instagram : ${I.instagram}

## Horaires (heure de Paris)
${hours}

## La carte (prix en euros, service compris)
Chaque burger existe en « Ti' » (un steak) ou en double, et peut se faire avec une galette de pommes de terre à la place du steak (option végétarienne). Tous sont servis avec frites maison et salade maison.
`;
for (const b of BB.BURGER_LIST) llms += `- Ti' ${b.name.fr} : ${eur(b.price)} ; ${b.name.fr} double ${eur(b.double)}. ${BB.burgerDesc(b, 'fr', false)}\n`;
for (const cat of BB.CATS.filter((c) => c.id !== 'burgers')) {
  llms += `\n### ${cat.name.fr}\n`;
  for (const it of BB.MENU_OTHER.filter((x) => x.cat === cat.id)) {
    llms += `- ${it.name.fr}${it.price != null ? ` : ${eur(it.price)}` : it.surPlace ? ' (sur place uniquement)' : ''}${it.desc ? `. ${it.desc.fr}` : ''}\n`;
    if (it.variants) for (const v of it.variants) llms += `  - ${v.name.fr}${v.desc ? ` (${v.desc.fr})` : ''} : ${eur(v.price)}\n`;
  }
}
llms += `
## Commander à emporter
Burgers, plats, desserts et boissons se commandent dans le site, onglet « Commander » : on choisit un créneau de retrait (midi ou soir, les jours d'ouverture), on laisse son prénom, son téléphone et un mot pour la cuisine (allergies). Les desserts et boissons à emporter sont ceux qui ont un prix ci-dessus ; les autres se dégustent sur place. Alcool : vente interdite aux mineurs, une pièce d'identité peut être demandée au retrait. L'abus d'alcool est dangereux pour la santé.
Dans cette maquette, le paiement est simulé : pour commander pour de vrai aujourd'hui, appeler le ${I.phoneLabel} ou passer par les plateformes de livraison ci-dessous.

## Réserver une table
Onglet « Réserver » : jour, midi ou soir, heure, nombre de couverts, prénom et téléphone ; le restaurant confirme par SMS. À partir de 10 personnes, il faut appeler le restaurant (${I.phoneLabel}) pour confirmer.

## Allergènes
La fiche de chaque plat indique les allergènes déduits de sa composition (gluten, lait, œufs, fruits à coque, poisson, sulfites) ; la liste complète est à confirmer auprès du restaurant.
`;
llms += `
## Livraison
${I.delivery.map((d) => `- ${d.name} : ${d.url}`).join('\n')}

## Langues du site
Français (par défaut), anglais, espagnol et chinois simplifié : ${canonical}/?lang=en · ${canonical}/?lang=es · ${canonical}/?lang=zh

## English
Bougnat Burger is a burger restaurant in Clermont-Ferrand (Auvergne, France), open since 2012, serving homemade burgers made with local PDO cheeses (Saint-Nectaire, Cantal, Salers, Bleu d'Auvergne), French beef or a potato rösti, homemade fries and salad. Open Wednesday to Saturday, lunch and dinner. Takeaway orders (burgers, desserts, soft drinks, local craft beers and wines) and table bookings on the site; for 10 people or more, call ${I.phoneLabel}. English version: ${canonical}/?lang=en

## Español
Bougnat Burger es un restaurante de hamburguesas en Clermont-Ferrand (Auvernia, Francia), abierto desde 2012: hamburguesas caseras con quesos DOP de Auvernia (Saint-Nectaire, Cantal, Salers, Bleu d'Auvergne), ternera francesa o tortita de patata, patatas fritas caseras. Abre de miércoles a sábado, mediodía y noche. Pedidos para llevar y reservas en la web; a partir de 10 personas, llamar al ${I.phoneLabel}. Versión en español: ${canonical}/?lang=es

## 中文
Bougnat Burger 是位于法国克莱蒙费朗（奥弗涅大区）的汉堡餐厅，2012 年开业：手工汉堡，使用奥弗涅 AOP 原产地保护奶酪（Saint-Nectaire、Cantal、Salers、Bleu d'Auvergne）、法国牛肉或土豆饼，配自制薯条。每周三至周六营业，午餐和晚餐。网站可外带点餐和订座；10 人及以上请致电 ${I.phoneLabel}。中文版：${canonical}/?lang=zh
`;
writeFileSync(join(root, 'llms.txt'), llms);
console.log('carte HTML, JSON-LD et llms.txt écrits');
