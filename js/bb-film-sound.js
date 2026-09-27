/* ==========================================================================
   Bougnat Burger — la bande-son du film de l'accueil, à mi-voix.
   Un vent d'altitude en fond, et chaque temps de l'histoire du bougnat sur son son : l'avion,
   le vent à la porte, la chute, la poignée, le sac qui s'ouvre, les prises, les bouchées,
   les gorgées, la force, le boum, le pouce, la dernière frite, l'iris.
   Tout est synthétisé (bb-core.js) et suit le bouton son de la barre du haut.
   Les noms d'événements viennent de BB.Histoire.EVENTS (js/film/bb-histoire.js).
   ========================================================================== */
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});
  let ch = null, wind = null, running = false;

  const MAP = {
    arrive: ['arrive'],
    catch: ['catch'],
    bite: ['crunch', { power: 0.8 }],
    chew: ['chew'],
    crumbs: ['crumbs'],
    grab: ['catch', { gain: 0.6 }],
    crunch: ['crunch', { power: 0.45 }],
    toss: ['toss'],
    sip: ['gulp'],
    gulp: ['gulp'],
    lick: ['lick'],
    spin: ['whoosh'],
    fizz: ['fizz'],
    // l'histoire du bougnat
    avion: ['pan', { dur: 2.4 }],      // l'avion passe au-dessus des Puys
    vent: ['whoosh', { gain: 0.7 }],   // la porte ouverte, la lampe passe au vert
    chute: ['whoosh'],
    poignee: ['flap'],
    ouvre: ['pop'],
    envol: ['whoosh', { gain: 0.5 }],
    attrape: ['catch'],
    bouchee: ['crunch', { power: 0.8 }],
    gloups: ['gulp'],
    croque: ['crunch', { power: 0.45 }],
    gorgee: ['gulp'],
    pschitt: ['fizz'],
    boum: ['stamp', { power: 1 }],
    pouce: ['yes'],
    toc: ['pop', { gain: 0.8 }],
    iris: ['close'],
    peur: ['nope'],
    force: ['chord'],
    etincelle: ['dot'],                // les étincelles de la force
  };

  function channel() {
    if (!ch) ch = BB.sfx.channel(0.9);
    return ch;
  }

  BB.filmSound = {
    /* à brancher sur l'onEvent du film (BB.Histoire) */
    onEvent(type) {
      if (!running || !BB.sfx.on) return;
      const m = MAP[type];
      if (!m) return;
      channel().play(m[0], m[1] || {});
      if (type === 'sip') channel().play('fizz', { gain: 0.6 }); // la mousse pétille à la première gorgée
    },
    start() {
      running = true;
      if (!BB.sfx.on || BB.reduced) return;
      if (!wind) {
        wind = channel().voice('wind');
        if (wind) wind.level(0.55);
      }
    },
    stop() {
      running = false;
      if (ch) { ch.cut(); ch = null; }
      wind = null;
    },
  };
  // couper net quand on coupe le son
  BB.on && BB.on('sound', (on) => { if (!on) BB.filmSound.stop(); });
})();
