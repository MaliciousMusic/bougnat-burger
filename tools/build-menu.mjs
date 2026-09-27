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
      out += `<li class="item plain"><h4>${esc(it.name.fr)}</h4>${it.price != null ? `<span class="price">${eur(it.price)}</span>` : ''}${it.desc ? `<p>${esc(it.desc.fr)}</p>` : ''}</li>\n`;
    }
    out += '</ul>\n';
  }
  out += '</section>\n';
}
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
          { '@type': 'MenuItem', name: "Ti' " + b.name.fr, description: BB.burgerDesc(b, 'fr', false), offers: offer(b.price), ...(b.veggie ? { suitableForDiet: 'https://schema.org/VegetarianDiet' } : {}) },
          { '@type': 'MenuItem', name: b.name.fr + ' (double)', description: BB.burgerDesc(b, 'fr', true), offers: offer(b.double) },
        ])
      : BB.MENU_OTHER.filter((x) => x.cat === cat.id).map((it) => ({
          '@type': 'MenuItem', name: it.name.fr, ...(it.desc ? { description: it.desc.fr } : {}), ...(it.price != null ? { offers: offer(it.price) } : {}),
        }));
    return { '@type': 'MenuSection', name: cat.name.fr, hasMenuItem: items };
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
  for (const it of BB.MENU_OTHER.filter((x) => x.cat === cat.id)) llms += `- ${it.name.fr}${it.price != null ? ` : ${eur(it.price)}` : ''}${it.desc ? `. ${it.desc.fr}` : ''}\n`;
}
llms += `
## Livraison
${I.delivery.map((d) => `- ${d.name} : ${d.url}`).join('\n')}

## English
Bougnat Burger is a burger restaurant in Clermont-Ferrand (Auvergne, France), open since 2012, serving homemade burgers made with local PDO cheeses (Saint-Nectaire, Cantal, Salers, Bleu d'Auvergne), French beef or a potato rösti (veggie), homemade fries. Open Wednesday to Saturday, lunch and dinner. An English version of the site is available at ${canonical}/?lang=en.
`;
writeFileSync(join(root, 'llms.txt'), llms);
console.log('carte HTML, JSON-LD et llms.txt écrits');
