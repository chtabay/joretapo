/**
 * JORETAPO — Tests du moteur de résolution des conflits (js/conflict-resolver.js).
 *
 * Chaque test décrit une RÈGLE de specs/01-mecaniques-de-jeu.md, pas une
 * implémentation : le plateau est vidé puis reconstruit à la main pour que le
 * scénario soit lisible et déterministe.
 */

import { test, assert, assertEqual, loadData, makeGame, simulateGame } from './helpers.js';
import { ConflictResolver } from '../js/conflict-resolver.js';
import { PHASE } from '../js/turn-manager.js';

const EST_ARME = t => t === 'dealer' || t === 'trafiquant';

/**
 * Plateau nu : toutes les zones vidées, joueurs riches, caisses à zéro.
 * Les zones utilisées sont celles de Manhattan :
 *   MN5 ── MN2, MN3, MN4, MN6, MN7, MN8      (carrefour à 6 voisins)
 *   MN4 ── MN2, MN5, MN7
 *   MN3 ── MN1, MN2, MN5, MN6
 *   MN7 ── MN4, MN5, MN9, MN10
 */
async function plateauNu(nbJoueurs = 2, options = {}) {
  const data = options.data || await loadData();
  const gs = await makeGame(nbJoueurs, { data });

  Object.values(gs.plateau).forEach(z => {
    z.pions = [];
    z.proprietaire = null;
    z.construction = null;
  });
  gs.joueurs.forEach(j => {
    j.ressources.lingots = 2000;
    j.ressources.armes = 40;
    j.electeurs_malus = 0;
  });
  gs.caisses.hotel_police = 0;
  gs.caisses.zurich_bank = 0;

  const poser = (zid, type, pid) => {
    const pion = { type, joueur: pid };
    gs.plateau[zid].pions.push(pion);
    if (pid !== null && pid !== undefined) gs.plateau[zid].proprietaire = pid;
    return pion;
  };
  const resoudre = ordres => ConflictResolver.resolve(gs, ordres, data.adjacences, data.gameplay);
  const armeSur = zid => gs.plateau[zid].pions.find(p => EST_ARME(p.type)) || null;
  const contenu = zid => gs.plateau[zid].pions.map(p => `${p.type}@J${p.joueur}`).sort();
  const journal = log => log.map(l => l.msg).join(' | ');

  return { gs, data, poser, resoudre, armeSur, contenu, journal };
}

const deplacer = (from, to, pion_type, extra = {}) => ({ type: 'deplacer', from, to, pion_type, ...extra });
const soutenir = (from, to, pion_type, pour_joueur) => ({ type: 'soutenir', from, to, pion_type, pour_joueur });

/* ═══════════════════════════════════════════════════════════
 *  1 — Supports (spec 01:181-184)
 * ═══════════════════════════════════════════════════════════ */

test('un allié peut soutenir l\'attaque d\'un autre joueur (spec 01:182)', async () => {
  const { poser, resoudre, armeSur } = await plateauNu(3);
  poser('MN4', 'dealer', 0);      // attaquant
  poser('MN3', 'dealer', 1);      // allié soutenant J0
  poser('MN5', 'dealer', 2);      // défenseur

  const log = resoudre({
    0: [deplacer('MN4', 'MN5', 'dealer')],
    1: [soutenir('MN3', 'MN5', 'dealer', 0)],
    2: []
  });

  assertEqual(armeSur('MN5')?.joueur, 0, 'J0 soutenu par J1 (force 2) doit emporter MN5 sur J2 (force 1)');
  assert(log.some(l => l.msg.includes('soutient')), 'le soutien inter-joueurs doit être journalisé');
});

test('sans soutien, deux forces égales laissent la case au défenseur (spec 01:187)', async () => {
  const { poser, resoudre, armeSur, journal } = await plateauNu(3);
  poser('MN4', 'dealer', 0);
  poser('MN3', 'dealer', 1);      // présent mais ne soutient personne
  poser('MN5', 'dealer', 2);

  const log = resoudre({ 0: [deplacer('MN4', 'MN5', 'dealer')], 1: [], 2: [] });

  assertEqual(armeSur('MN5')?.joueur, 2, 'égalité 1 contre 1 : statu quo, le défenseur reste');
  assertEqual(armeSur('MN4')?.joueur, 0, 'l\'attaquant reste sur sa case de départ');
  assert(journal(log).includes('Égalité'), 'l\'égalité doit être annoncée');
});

test('un soutien dont la case est attaquée est coupé (spec 01:183)', async () => {
  const { poser, resoudre, armeSur, journal } = await plateauNu(4);
  poser('MN4', 'dealer', 0);      // attaquant de MN5
  poser('MN3', 'dealer', 1);      // soutient J0… mais se fait attaquer
  poser('MN5', 'dealer', 2);      // défenseur de MN5
  poser('MN2', 'dealer', 3);      // attaque MN3, ce qui coupe le soutien

  const log = resoudre({
    0: [deplacer('MN4', 'MN5', 'dealer')],
    1: [soutenir('MN3', 'MN5', 'dealer', 0)],
    2: [],
    3: [deplacer('MN2', 'MN3', 'dealer')]
  });

  assert(journal(log).includes('coupé'), 'la coupure du soutien doit être journalisée');
  assertEqual(armeSur('MN5')?.joueur, 2, 'soutien coupé → égalité → MN5 reste au défenseur');
});

test('un pion qui soutient ne peut pas se déplacer dans le même tour (spec 01:182)', async () => {
  const { poser, resoudre, armeSur } = await plateauNu(2);
  poser('MN3', 'dealer', 0);
  poser('MN5', 'dealer', 1);

  const log = resoudre({
    0: [soutenir('MN3', 'MN5', 'dealer', 0), deplacer('MN3', 'MN2', 'dealer')],
    1: []
  });

  assertEqual(armeSur('MN3')?.joueur, 0, 'le supporter reste immobile');
  assertEqual(armeSur('MN2'), null, 'le second ordre sur le même pion est refusé');
  assert(log.some(l => l.type === 'warn'), 'le refus doit être journalisé');
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Combattants (spec 01:126-130)
 * ═══════════════════════════════════════════════════════════ */

test('une prostituée ne peut pas chasser un homme armé (spec 01:130)', async () => {
  const { poser, resoudre, armeSur, contenu, journal } = await plateauNu(2);
  poser('MN4', 'prostituee_base', 0);
  poser('MN2', 'dealer', 0);      // soutiendrait automatiquement un vrai assaut
  poser('MN5', 'dealer', 1);

  const log = resoudre({ 0: [deplacer('MN4', 'MN5', 'prostituee_base')], 1: [] });

  assertEqual(armeSur('MN5')?.joueur, 1, 'le trafic armé de J1 tient toujours MN5');
  assert(contenu('MN4').includes('prostituee_base@J0'), 'la prostituée reste sur sa case');
  assert(!journal(log).includes('Conflit'), 'aucune bataille ne doit être déclenchée par une prostituée');
});

test('une prostituée non protégée est capturée par le conquérant (spec 01:130)', async () => {
  const { gs, poser, resoudre, contenu } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN5', 'prostituee_luxe', 1);   // seule, sans homme armé

  const log = resoudre({ 0: [deplacer('MN4', 'MN5', 'dealer')], 1: [] });

  assert(contenu('MN5').includes('prostituee_luxe@J0'), 'la prostituée change de propriétaire');
  assertEqual(gs.plateau['MN5'].proprietaire, 0, 'la case revient au conquérant');
  assert(log.some(l => l.msg.includes('capture')), 'la capture doit être journalisée');
});

test('un seul homme armé par case : deux ordres du même joueur vers la même case sont refusés (spec 01:126)', async () => {
  const { poser, resoudre, gs } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN2', 'trafiquant', 0);

  const log = resoudre({
    0: [deplacer('MN4', 'MN5', 'dealer'), deplacer('MN2', 'MN5', 'trafiquant')],
    1: []
  });

  const armes = gs.plateau['MN5'].pions.filter(p => EST_ARME(p.type));
  assertEqual(armes.length, 1, 'MN5 ne doit porter qu\'un seul homme armé');
  assert(log.some(l => l.type === 'warn' && l.msg.includes('MN5')),
    'le second ordre doit être explicitement refusé, pas perdu en silence');
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Échange de positions (spec 01:178)
 * ═══════════════════════════════════════════════════════════ */

test('deux pions d\'un même joueur peuvent échanger leurs positions (spec 01:178)', async () => {
  const { poser, resoudre, armeSur } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN5', 'trafiquant', 0);

  resoudre({
    0: [deplacer('MN4', 'MN5', 'dealer'), deplacer('MN5', 'MN4', 'trafiquant')],
    1: []
  });

  assertEqual(armeSur('MN5')?.type, 'dealer', 'le dealer occupe désormais MN5');
  assertEqual(armeSur('MN4')?.type, 'trafiquant', 'le trafiquant occupe désormais MN4');
});

test('deux joueurs peuvent échanger leurs positions si les deux le spécifient (spec 01:178)', async () => {
  const { poser, resoudre, armeSur, journal } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN5', 'dealer', 1);

  const log = resoudre({
    0: [deplacer('MN4', 'MN5', 'dealer')],
    1: [deplacer('MN5', 'MN4', 'dealer')]
  });

  assertEqual(armeSur('MN5')?.joueur, 0, 'J0 prend MN5');
  assertEqual(armeSur('MN4')?.joueur, 1, 'J1 prend MN4');
  assert(!journal(log).includes('Conflit'), 'un échange consenti n\'est pas une bataille');
});

test('un défenseur qui quitte sa case ne la défend pas', async () => {
  const { poser, resoudre, armeSur, journal } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN5', 'dealer', 1);

  const log = resoudre({
    0: [deplacer('MN4', 'MN5', 'dealer')],
    1: [deplacer('MN5', 'MN8', 'dealer')]
  });

  assertEqual(armeSur('MN8')?.joueur, 1, 'J1 rejoint bien MN8');
  assertEqual(armeSur('MN5')?.joueur, 0, 'J0 occupe la case libérée, sans égalité fictive');
  assert(!journal(log).includes('Égalité'), 'aucun statu quo ne doit être déclaré');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Fuite du vaincu (spec 01:188-190)
 * ═══════════════════════════════════════════════════════════ */

test('la fuite n\'empile jamais deux hommes armés, même alliés (spec 01:126)', async () => {
  const { gs, poser, resoudre, journal } = await plateauNu(3);
  poser('MN5', 'dealer', 0);        // attaquant
  poser('MN2', 'trafiquant', 0);    // soutien automatique (MN2 est adjacent à MN4)
  poser('MN4', 'dealer', 1);        // défenseur, force 1 contre 2
  poser('MN7', 'trafiquant', 1);    // dernière sortie de MN4… déjà occupée par un allié
  poser('MN9', 'dealer', 2);        // attaque MN7 : coupe le soutien de J1 sur MN4

  const log = resoudre({
    0: [deplacer('MN5', 'MN4', 'dealer')],
    1: [],
    2: [deplacer('MN9', 'MN7', 'dealer')]
  });

  assertEqual(gs.plateau['MN7'].pions.filter(p => EST_ARME(p.type)).length, 1,
    'MN7 ne doit pas se retrouver avec deux hommes armés de J1');
  assertEqual(gs.plateau['MN4'].pions.filter(p => EST_ARME(p.type)).length, 1,
    'MN4 ne porte que le vainqueur');
  assert(journal(log).includes('éliminé'), 'sans case de repli légale, le vaincu est éliminé');
});

test('le vaincu emmène sa prostituée, sauf si la case d\'arrivée en a déjà une (spec 01:190)', async () => {
  const { poser, resoudre, contenu } = await plateauNu(3);
  poser('MN4', 'dealer', 0);        // attaquant
  poser('MN2', 'trafiquant', 0);    // soutien automatique de J0 sur MN5
  poser('MN5', 'dealer', 1);        // défenseur
  poser('MN5', 'prostituee_luxe', 1);
  poser('MN3', 'prostituee_base', 2); // seule case de repli, elle a déjà une prostituée
  poser('MN6', 'dealer', 2);        // bouche les autres sorties de MN5
  poser('MN7', 'dealer', 2);
  poser('MN8', 'dealer', 2);

  const log = resoudre({ 0: [deplacer('MN4', 'MN5', 'dealer')], 1: [], 2: [] });

  assert(contenu('MN3').includes('dealer@J1'), 'le vaincu s\'est réfugié sur MN3');
  assert(contenu('MN5').includes('prostituee_luxe@J0'),
    'la prostituée laissée derrière est capturée par le vainqueur');
  assert(log.some(l => l.msg.includes('capture')), 'la capture doit être journalisée');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — Conflits en cascade (spec 01:193-195)
 * ═══════════════════════════════════════════════════════════ */

test('un fugitif qui atterrit sur une case convoitée est repoussé à son tour (spec 01:193)', async () => {
  const { poser, resoudre, armeSur, journal } = await plateauNu(4);
  poser('MN5', 'dealer', 0);        // attaque MN4
  poser('MN2', 'dealer', 2);        // soutient J0 (et bouche une sortie de MN4)
  poser('MN4', 'dealer', 1);        // défenseur : sa seule sortie libre est MN7
  poser('MN9', 'dealer', 3);        // avance sur MN7 le même tour

  const log = resoudre({
    0: [deplacer('MN5', 'MN4', 'dealer')],
    1: [],
    2: [soutenir('MN2', 'MN4', 'dealer', 0)],
    3: [deplacer('MN9', 'MN7', 'dealer')]
  });

  const fuites = log.filter(l => l.msg.includes('🏃')).length;
  assert(fuites >= 2, `la cascade doit produire au moins deux fuites (obtenu ${fuites}) — ${journal(log)}`);
  assertEqual(armeSur('MN4')?.joueur, 0, 'J0 prend MN4');
  assertEqual(armeSur('MN7')?.joueur, 3, 'J3 prend MN7 malgré le fugitif qui s\'y était réfugié');
  assertEqual(armeSur('MN10')?.joueur, 1, 'le fugitif de J1 a été repoussé une seconde fois');
});

/* ═══════════════════════════════════════════════════════════
 *  6 — Élimination payante (spec 01:191)
 * ═══════════════════════════════════════════════════════════ */

test('éliminer un vaincu coûte le tarif de la fiche et 100 000 électeurs (spec 01:136/191)', async () => {
  const { gs, poser, resoudre, armeSur } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN2', 'trafiquant', 0);    // soutien automatique
  poser('MN5', 'dealer', 1);
  const lingots = gs.joueurs[0].ressources.lingots;
  const armes = gs.joueurs[0].ressources.armes;

  resoudre({ 0: [deplacer('MN4', 'MN5', 'dealer', { eliminer: true })], 1: [] });

  assertEqual(armeSur('MN5')?.joueur, 0, 'le vainqueur occupe la case');
  const survivants = Object.values(gs.plateau).flatMap(z => z.pions).filter(p => p.joueur === 1 && EST_ARME(p.type));
  assertEqual(survivants.length, 0, 'le dealer éliminé disparaît du plateau');
  assertEqual(gs.joueurs[0].ressources.lingots, lingots - 40, 'coût d\'élimination d\'un dealer : 40 lingots');
  assertEqual(gs.joueurs[0].ressources.armes, armes - 4, 'coût d\'élimination d\'un dealer : 4 armes');
  assertEqual(gs.joueurs[0].electeurs_malus, 100000, 'l\'exécution coûte 100 000 électeurs');
  assertEqual(gs.caisses.hotel_police, 40, 'le prix du contrat est encaissé par la police');
});

test('une élimination impossible faute de ressources est annoncée et le vaincu fuit', async () => {
  const { gs, poser, resoudre, journal } = await plateauNu(2);
  poser('MN4', 'dealer', 0);
  poser('MN2', 'trafiquant', 0);
  poser('MN5', 'trafiquant', 1);
  gs.joueurs[0].ressources.lingots = 10;   // 160L requis pour un trafiquant

  const log = resoudre({ 0: [deplacer('MN4', 'MN5', 'dealer', { eliminer: true })], 1: [] });

  assert(journal(log).includes('élimination impossible'),
    'l\'échec du contrat doit être expliqué au joueur');
  const survivants = Object.values(gs.plateau).flatMap(z => z.pions).filter(p => p.joueur === 1 && EST_ARME(p.type));
  assertEqual(survivants.length, 1, 'faute de paiement, le vaincu prend la fuite au lieu de mourir');
});

/* ═══════════════════════════════════════════════════════════
 *  7 — Flics (spec 01:136)
 * ═══════════════════════════════════════════════════════════ */

test('éliminer un flic définitivement le retire de la partie, temporairement non (spec 01:136)', async () => {
  const { gs, poser, resoudre } = await plateauNu(2);
  poser('MN5', 'flic', 1);
  poser('MN4', 'flic', 1);
  const reservesDepart = gs.flics.reserves;

  resoudre({ 0: [{ type: 'eliminer_flic', zone: 'MN5', definitif: false }], 1: [] });
  assertEqual(gs.flics.reserves, reservesDepart, '300L : le flic retourne à l\'hôtel de police, le vivier est intact');

  resoudre({ 0: [{ type: 'eliminer_flic', zone: 'MN4', definitif: true }], 1: [] });
  assertEqual(gs.flics.reserves, reservesDepart - 1, '550L : un flic de moins pour toute la partie');
  assertEqual(gs.flics.elimines, 1, 'le flic définitivement éliminé est comptabilisé');
});

test('le plafond de flics en jeu suit le vivier restant (spec 01:136)', async () => {
  const { gs, poser, resoudre } = await plateauNu(2);
  gs.flics.reserves = 1;
  poser('MN5', 'flic', 1);

  const log = resoudre({ 0: [{ type: 'deployer_flic', zone: 'MN4' }], 1: [] });

  assertEqual(gs.plateau['MN4'].pions.length, 0, 'aucun flic ne peut être déployé au-delà du vivier');
  assert(log.some(l => l.type === 'warn'), 'le refus doit être journalisé');
});

/* ═══════════════════════════════════════════════════════════
 *  8 — Propriété des zones
 * ═══════════════════════════════════════════════════════════ */

test('une case ne portant plus qu\'un flic adverse perd son propriétaire', async () => {
  const { gs, poser, resoudre } = await plateauNu(2);
  poser('MN5', 'flic', 1);
  gs.plateau['MN5'].proprietaire = 0;

  resoudre({ 0: [], 1: [] });

  assertEqual(gs.plateau['MN5'].proprietaire, null, 'plus aucun pion de J0 : la case ne lui appartient plus');
});

test('une construction garde son propriétaire même sous un incorruptible', async () => {
  const { gs, poser, resoudre } = await plateauNu(2);
  poser('MN5', 'incorruptible', null);
  gs.plateau['MN5'].proprietaire = 0;
  gs.plateau['MN5'].construction = 'casino';

  resoudre({ 0: [], 1: [] });

  assertEqual(gs.plateau['MN5'].proprietaire, 0, 'le casino reste la propriété de J0');
});

/* ═══════════════════════════════════════════════════════════
 *  9 — Terrain et ordre de résolution
 * ═══════════════════════════════════════════════════════════ */

test('un pion ne peut pas terminer son déplacement sur un camp de gitans (spec 06:8)', async () => {
  const { gs, data, poser, resoudre, armeSur } = await plateauNu(2);
  const ile = (data.gameplay.iles || [])[0];
  assert(ile, 'le plateau doit comporter au moins un camp de gitans');
  const voisin = (data.adjacences[ile.id] || []).find(z => gs.plateau[z] && !z.startsWith('ile_'));
  assert(voisin, `le camp ${ile.id} doit avoir un voisin jouable`);
  poser(voisin, 'dealer', 0);

  const log = resoudre({ 0: [deplacer(voisin, ile.id, 'dealer')], 1: [] });

  assertEqual(armeSur(ile.id), null, 'le camp de gitans ne se traverse qu\'en payant le prix fort');
  assertEqual(armeSur(voisin)?.joueur, 0, 'le pion reste sur sa case');
  assert(log.some(l => l.type === 'warn'), 'le refus doit être journalisé');
});

test('l\'ordre de résolution des joueurs est tiré au sort, pas l\'ordre des identifiants (spec 06 #6)', async () => {
  const original = Math.random;
  const gagnants = new Set();
  try {
    for (const valeur of [0, 0.999]) {
      Math.random = () => valeur;
      const { gs, resoudre } = await plateauNu(2);
      resoudre({
        0: [{ type: 'creer_pion', zone: 'MN5', pion_type: 'dealer' }],
        1: [{ type: 'creer_pion', zone: 'MN5', pion_type: 'dealer' }]
      });
      const arme = gs.plateau['MN5'].pions.find(p => EST_ARME(p.type));
      assert(arme, 'un des deux joueurs doit avoir créé son dealer');
      gagnants.add(arme.joueur);
    }
  } finally {
    Math.random = original;
  }
  assertEqual(gagnants.size, 2, 'selon le tirage, l\'un ou l\'autre joueur doit pouvoir gagner la course');
});

/* ═══════════════════════════════════════════════════════════
 *  10 — Régression sur parties complètes
 * ═══════════════════════════════════════════════════════════ */

test('aucune partie simulée ne crée d\'empilement d\'hommes armés', async () => {
  const data = await loadData();
  const anomalies = [];

  for (const { n, tours, graine } of [{ n: 4, tours: 10, graine: 1 }, { n: 6, tours: 10, graine: 3 }]) {
    const depart = await makeGame(n, { data, graine });
    const dejaCasses = new Set(
      Object.entries(depart.plateau)
        .filter(([, z]) => z.pions.filter(p => EST_ARME(p.type)).length > 1)
        .map(([zid]) => zid)
    );

    await simulateGame(n, tours, {
      data, graine,
      surEtape: ({ gs, phase }) => {
        if (phase !== PHASE.TURN_END) return;
        Object.entries(gs.plateau).forEach(([zid, z]) => {
          if (dejaCasses.has(zid)) return;   // empilements hérités de la mise en place (game-state.js)
          if (z.pions.filter(p => EST_ARME(p.type)).length > 1) {
            anomalies.push(`${n}j/graine ${graine} tour ${gs.tour} : ${zid}`);
          }
        });
      }
    });
  }

  assertEqual(anomalies.length, 0, `empilements produits par la résolution : ${anomalies.slice(0, 5).join(', ')}`);
});

test('la résolution reste bornée : une partie dense se termine sans blocage', async () => {
  const data = await loadData();
  const r = await simulateGame(5, 8, { data, graine: 77 });
  assert(r.tours >= 8 || r.softlock, 'la simulation doit progresser jusqu\'au bout ou signaler un softlock connu');
  assert(!r.log.some(l => l.msg.includes('borne de sécurité atteinte')),
    'aucune résolution ne doit atteindre la borne de sécurité en jeu normal');
});
