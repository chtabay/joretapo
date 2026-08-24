/**
 * JORETAPO — Tests du moteur des cartes Magouille (js/magouille-engine.js).
 *
 * Chaque test décrit une RÈGLE du jeu, pas une implémentation :
 *   1. Le tirage d'élection ne doit JAMAIS rendre une main incomplète tant que
 *      le circuit contient assez de cartes (softlock du draft).
 *   2. Une carte Magouille n'est payée et consommée que si son effet a réussi.
 *   3. Aucun lingot ne disparaît ni n'apparaît hors des effets déclarés.
 */

import {
  test, assert, assertEqual,
  loadData, makeGame, simulateGame
} from './helpers.js';

import { MagouilleEngine } from '../js/magouille-engine.js';

const TOTAL_EXEMPLAIRES = 65;

/* ── Utilitaires locaux ──────────────────────────────────── */

/** Met `uids` dans la main de `pid` en les sortant du circuit (pas de doublon). */
function donnerCartes(gs, pid, uids) {
  const j = gs.joueurs[pid];
  j.cartes_magouille = [...uids];
  gs.deck_magouille.pile = gs.deck_magouille.pile.filter(u => !uids.includes(u));
  gs.deck_magouille.defaussees = gs.deck_magouille.defaussees.filter(u => !uids.includes(u));
}

/** Joue un tirage complet : chacun pioche puis garde le maximum autorisé. */
function tirageComplet(gs, cartes) {
  const mains = MagouilleEngine.draftPhase(gs, cartes);
  gs.joueurs.forEach((j, pid) => {
    const main = mains[pid] || [];
    const gardees = main.slice(0, MagouilleEngine.nbCartesAGarder(main.length));
    MagouilleEngine.keepCards(gs, pid, gardees, main.length);
    MagouilleEngine.discardFromDraft(gs, main, gardees);
  });
  return mains;
}

const zonesReelles = gs => Object.keys(gs.plateau).filter(z => !z.startsWith('ile_'));

/* ═══════════════════════════════════════════════════════════
 *  1 — Composition et conservation du deck
 * ═══════════════════════════════════════════════════════════ */

test('le deck construit contient 65 exemplaires aux identifiants uniques', async () => {
  const { cartes } = await loadData();
  const deck = MagouilleEngine.buildDeck(cartes);
  assertEqual(deck.length, TOTAL_EXEMPLAIRES, 'exemplaires dans le deck');
  assertEqual(new Set(deck.map(c => c.uid)).size, TOTAL_EXEMPLAIRES, 'uid uniques');
});

test('réinitialiser le deck ne duplique pas une carte déjà en main', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['igor_0', 'igor_1']);

  MagouilleEngine.initDeck(gs, data.cartes);

  assert(!gs.deck_magouille.pile.includes('igor_0'),
    'une carte en main ne doit pas réapparaître dans la pile');
  const stats = MagouilleEngine.statsDeck(gs);
  assertEqual(stats.total, TOTAL_EXEMPLAIRES, 'total des exemplaires après réinitialisation');
});

test('aucune carte ne se perd ni ne se dédouble au fil des tirages', async () => {
  const data = await loadData();
  const gs = await makeGame(6, { data });
  MagouilleEngine.initDeck(gs, data.cartes);

  for (let election = 1; election <= 5; election++) {
    tirageComplet(gs, data.cartes);
    const stats = MagouilleEngine.statsDeck(gs);
    assertEqual(stats.total, TOTAL_EXEMPLAIRES,
      `élection ${election} : total des exemplaires conservé`);
    const tous = [
      ...gs.deck_magouille.pile,
      ...gs.deck_magouille.defaussees,
      ...gs.deck_magouille.retirees_du_jeu,
      ...gs.joueurs.flatMap(j => j.cartes_magouille)
    ];
    assertEqual(new Set(tous).size, tous.length,
      `élection ${election} : aucun exemplaire en double`);
  }
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Le softlock du tirage (correction à la racine)
 * ═══════════════════════════════════════════════════════════ */

test('à 6 joueurs, cinq élections d\'affilée servent toujours 8 cartes à chacun', async () => {
  const data = await loadData();
  const gs = await makeGame(6, { data });
  MagouilleEngine.initDeck(gs, data.cartes);

  for (let election = 1; election <= 5; election++) {
    const mains = tirageComplet(gs, data.cartes);
    gs.joueurs.forEach((j, pid) => {
      assertEqual(mains[pid].length, MagouilleEngine.TAILLE_MAIN_DRAFT,
        `élection ${election}, joueur ${pid} : main pleine attendue`);
      assertEqual(j.cartes_magouille.length, MagouilleEngine.NB_CARTES_GARDEES,
        `élection ${election}, joueur ${pid} : 4 cartes conservées`);
    });
  }
});

test('les cartes non jouées repartent dans le circuit au tirage suivant', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  MagouilleEngine.initDeck(gs, data.cartes);

  tirageComplet(gs, data.cartes);
  const gardeesMandat1 = gs.joueurs.flatMap(j => [...j.cartes_magouille]);
  assert(gardeesMandat1.length === 16, '4 joueurs x 4 cartes conservées au 1er mandat');

  const mains2 = MagouilleEngine.draftPhase(gs, data.cartes);

  gs.joueurs.forEach((j, pid) =>
    assertEqual(j.cartes_magouille.length, 0,
      `joueur ${pid} : la main du mandat précédent est recyclée avant le nouveau tirage`));

  const enCirculation = new Set([
    ...gs.deck_magouille.pile,
    ...gs.deck_magouille.defaussees,
    ...Object.values(mains2).flat()
  ]);
  gardeesMandat1.forEach(uid =>
    assert(enCirculation.has(uid), `la carte ${uid} doit être revenue dans le circuit`));
});

test('une partie à 6 joueurs traverse quatre élections sans blocage du tirage', async () => {
  const taillesVues = [];
  const r = await simulateGame(6, 29, {
    surEtape: ({ tm }) => {
      if (tm.phase === 'draft_pick' && tm.draftHands) {
        Object.values(tm.draftHands).forEach(m => taillesVues.push(m.length));
      }
    }
  });
  assertEqual(r.softlock, null, `blocage : ${r.softlock?.raison || ''}`);
  assert(taillesVues.length > 0, 'au moins un tirage doit avoir eu lieu');
  const minimum = Math.min(...taillesVues);
  assert(minimum >= 4,
    `toute main de tirage doit permettre de garder des cartes (minimum vu : ${minimum})`);
});

test('quand le stock est réduit, tout le monde reçoit la même main écourtée', async () => {
  const data = await loadData();
  const gs = await makeGame(6, { data });
  MagouilleEngine.initDeck(gs, data.cartes);

  // 20 cartes disponibles pour 6 joueurs : 3 chacun, personne à 0.
  gs.deck_magouille.pile = gs.deck_magouille.pile.slice(0, 20);
  gs.deck_magouille.defaussees = [];

  const mains = MagouilleEngine.draftPhase(gs, data.cartes, { recycler: false });
  const tailles = gs.joueurs.map((_, pid) => mains[pid].length);
  assert(Math.min(...tailles) === Math.max(...tailles),
    `mains inégales : ${tailles.join('/')}`);
  assertEqual(tailles[0], 3, 'floor(20/6) = 3 cartes par joueur');
  tailles.forEach((t, pid) => assert(t > 0, `joueur ${pid} ne doit jamais recevoir 0 carte`));
});

test('le nombre de cartes à garder suit la taille réelle de la main', async () => {
  assertEqual(MagouilleEngine.nbCartesAGarder(8), 4, 'main pleine : 4 gardées');
  assertEqual(MagouilleEngine.nbCartesAGarder(12), 4, 'jamais plus de 4');
  assertEqual(MagouilleEngine.nbCartesAGarder(3), 2, 'main de 3 : 2 gardées');
  assertEqual(MagouilleEngine.nbCartesAGarder(1), 1, 'main de 1 : 1 gardée');
  assertEqual(MagouilleEngine.nbCartesAGarder(0), 0, 'main vide : 0 gardée');
});

test('une carte égarée hors du circuit est récupérée au tirage suivant', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  MagouilleEngine.initDeck(gs, data.cartes);

  // Simule une carte consommée ailleurs sans retour à la défausse.
  const perdue = gs.deck_magouille.pile.pop();
  assertEqual(MagouilleEngine.statsDeck(gs).total, TOTAL_EXEMPLAIRES - 1, 'carte bien égarée');

  tirageComplet(gs, data.cartes);
  const stats = MagouilleEngine.statsDeck(gs);
  assertEqual(stats.total, TOTAL_EXEMPLAIRES, `la carte ${perdue} doit être réinjectée`);
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Ordre payer / appliquer
 * ═══════════════════════════════════════════════════════════ */

test('un effet non implémenté refuse la carte au lieu de débiter dans le vide', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['guerre_gangs_0']);   // effet detruire_gangs : pas encore codé
  const j = gs.joueurs[0];
  j.ressources.lingots = 900;
  j.ressources.armes = 5;

  const r = MagouilleEngine.play(gs, 0, 'guerre_gangs_0', {}, data.cartes);

  assertEqual(r.ok, false, 'un effet absent ne doit pas être annoncé comme réussi');
  assertEqual(r.reason, 'effet_non_implemente', 'raison explicite attendue');
  assertEqual(j.ressources.lingots, 900, 'aucun lingot débité');
  assertEqual(j.ressources.armes, 5, 'aucune arme débitée');
  assert(j.cartes_magouille.includes('guerre_gangs_0'), 'la carte reste en main');
  assertEqual(gs.deck_magouille.retirees_du_jeu.length, 0, 'la carte n\'est pas retirée du jeu');
});

test('une carte dont l\'effet échoue n\'est ni payée ni défaussée', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['ca_commence_0']);    // retirer_pion, 400L, bordel ou maire
  const j = gs.joueurs[0];
  j.ressources.lingots = 500;
  gs.maire.joueur_id = 0;                    // condition remplie

  const r = MagouilleEngine.play(gs, 0, 'ca_commence_0',
    { zone: 'ZONE_QUI_N_EXISTE_PAS', pionIdx: 0 }, data.cartes);

  assertEqual(r.ok, false, 'cible invalide : la carte doit échouer');
  assertEqual(j.ressources.lingots, 500, 'aucun lingot débité sur un échec');
  assert(j.cartes_magouille.includes('ca_commence_0'), 'la carte reste en main');
  assertEqual(gs.deck_magouille.defaussees.includes('ca_commence_0'), false,
    'la carte ne part pas à la défausse');
});

test('une carte réussie est payée une fois et quitte la main', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['ca_commence_0']);
  const j = gs.joueurs[0];
  j.ressources.lingots = 500;
  gs.maire.joueur_id = 0;

  const zone = zonesReelles(gs).find(z => gs.plateau[z].pions.some(p => p.joueur === 1));
  assert(zone, 'il faut un pion adverse sur le plateau pour ce test');
  const avant = gs.plateau[zone].pions.length;

  const r = MagouilleEngine.play(gs, 0, 'ca_commence_0', { zone, pionIdx: 0 }, data.cartes);

  assertEqual(r.ok, true, r.msg);
  assertEqual(j.ressources.lingots, 100, '400L débités une seule fois');
  assertEqual(gs.plateau[zone].pions.length, avant - 1, 'un pion retiré');
  assertEqual(j.cartes_magouille.length, 0, 'la carte quitte la main');
  assert(gs.deck_magouille.defaussees.includes('ca_commence_0'),
    'une carte « repose sous la pile » revient à la défausse');
});

test('jouer une carte trop chère est refusé avant tout débit', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['maitre_verges_0']);  // 140 lingots
  const j = gs.joueurs[0];
  j.ressources.lingots = 10;

  const r = MagouilleEngine.play(gs, 0, 'maitre_verges_0', {}, data.cartes);

  assertEqual(r.ok, false, 'carte impayable : refus attendu');
  assertEqual(j.ressources.lingots, 10, 'les ressources ne deviennent jamais négatives');
  assert(j.cartes_magouille.includes('maitre_verges_0'), 'la carte reste en main');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Conditions de jouabilité
 * ═══════════════════════════════════════════════════════════ */

test('une carte réservée au maire est injouable par un non-maire', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 1, ['detournement_fonds_0']);
  gs.joueurs[1].ressources.lingots = 500;
  gs.maire.joueur_id = 0;

  const refus = MagouilleEngine.canPlay(gs, 1, 'detournement_fonds_0', null, data.cartes);
  assertEqual(refus.ok, false, 'un non-maire ne peut pas détourner les fonds');

  gs.maire.joueur_id = 1;
  const ok = MagouilleEngine.canPlay(gs, 1, 'detournement_fonds_0', null, data.cartes);
  assertEqual(ok.ok, true, `le maire doit pouvoir la jouer (${ok.reason || ''})`);
});

test('une carte n\'est jouable que dans sa phase quand la phase est fournie', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['carte_orange_0']);   // phase_jouable = 4

  assertEqual(MagouilleEngine.canPlay(gs, 0, 'carte_orange_0', 1, data.cartes).ok, false,
    'phase 1 : refus');
  assertEqual(MagouilleEngine.canPlay(gs, 0, 'carte_orange_0', 4, data.cartes).ok, true,
    'phase 4 : autorisé');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — Effets : conservation et portée
 * ═══════════════════════════════════════════════════════════ */

test('le racket des restaurants transfère exactement ce qu\'il prélève', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['roses_connexion_0']); // coût 10L, 10L par resto

  zonesReelles(gs).slice(0, 3).forEach(z => {
    gs.plateau[z].construction = 'restaurant';
    gs.plateau[z].proprietaire = 1;
  });

  gs.joueurs[0].ressources.lingots = 50;
  gs.joueurs[1].ressources.lingots = 20;     // moins que les 30L dus

  const r = MagouilleEngine.play(gs, 0, 'roses_connexion_0', {}, data.cartes);
  assertEqual(r.ok, true, r.msg);

  const preleve = 20 - gs.joueurs[1].ressources.lingots;
  const encaisse = gs.joueurs[0].ressources.lingots - 50 + 10; // +10 : coût de la carte
  assertEqual(preleve, 20, 'la victime est prélevée à hauteur de ce qu\'elle possède');
  assertEqual(encaisse, preleve, 'aucun lingot ne disparaît entre la victime et le racketteur');
});

test('la contamination des prostituées ne franchit pas une zone sans prostituée', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['coup_de_0']);
  gs.joueurs[0].ressources.lingots = 50;

  const [a, b, c, d] = zonesReelles(gs).slice(0, 4);
  [a, b, c, d].forEach(z => { gs.plateau[z].pions = []; });
  gs.plateau[a].pions.push({ type: 'prostituee_base', joueur: 1 });
  gs.plateau[b].pions.push({ type: 'prostituee_base', joueur: 1 });
  gs.plateau[d].pions.push({ type: 'prostituee_luxe', joueur: 1 }); // isolée par c
  const adjacencies = { [a]: [b], [b]: [a, c], [c]: [b, d], [d]: [c] };

  const r = MagouilleEngine.play(gs, 0, 'coup_de_0', { zone: a, adjacencies }, data.cartes);

  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.plateau[a].pions.length, 0, 'la zone ciblée est nettoyée');
  assertEqual(gs.plateau[b].pions.length, 0, 'la voisine contiguë est contaminée');
  assertEqual(gs.plateau[d].pions.length, 1,
    'la chaîne s\'arrête sur une zone sans prostituée : la zone suivante est épargnée');
});

test('la contamination ne balaie pas tout le plateau depuis une zone isolée', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['coup_de_0']);
  gs.joueurs[0].ressources.lingots = 50;

  const compter = () => Object.values(gs.plateau)
    .reduce((n, z) => n + z.pions.filter(p => String(p.type).startsWith('prostituee')).length, 0);

  const zone = zonesReelles(gs).find(z =>
    gs.plateau[z].pions.some(p => String(p.type).startsWith('prostituee')));
  assert(zone, 'il faut une prostituée de départ');
  const avant = compter();

  const r = MagouilleEngine.play(gs, 0, 'coup_de_0',
    { zone, adjacencies: data.adjacences }, data.cartes);

  assertEqual(r.ok, true, r.msg);
  const apres = compter();
  assert(apres > 0, `toutes les prostituées du plateau ont été supprimées (${avant} -> ${apres})`);
});

test('un incorruptible ne s\'abat pas gratuitement avec « Permis de tuer »', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['permis_de_tuer_0']);

  const zone = zonesReelles(gs)[0];
  gs.plateau[zone].pions = [{ type: 'incorruptible', joueur: null }];
  gs.incorruptibles.deployes = [zone];

  const r = MagouilleEngine.play(gs, 0, 'permis_de_tuer_0', { zone, pionIdx: 0 }, data.cartes);

  assertEqual(r.ok, false, 'la carte gratuite ne contourne pas les 700L d\'élimination');
  assertEqual(gs.plateau[zone].pions.length, 1, 'l\'incorruptible reste en place');
  assert(gs.joueurs[0].cartes_magouille.includes('permis_de_tuer_0'), 'la carte reste en main');
});

test('retirer un flic du plateau met à jour les compteurs de flics', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['permis_de_tuer_0']);

  const zone = zonesReelles(gs)[0];
  gs.plateau[zone].pions = [{ type: 'flic', joueur: 1 }];
  gs.flics.deployes = [zone];
  const reservesAvant = gs.flics.reserves;
  const eliminesAvant = gs.flics.elimines;

  const r = MagouilleEngine.play(gs, 0, 'permis_de_tuer_0', { zone, pionIdx: 0 }, data.cartes);

  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.flics.elimines, eliminesAvant + 1, 'le flic est compté comme éliminé');
  assertEqual(gs.flics.reserves, reservesAvant - 1, 'le plafond de flics de la partie baisse');
  assertEqual(gs.flics.deployes.includes(zone), false, 'la zone sort des flics déployés');
});

test('déplacer un incorruptible met à jour sa position enregistrée', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['piscine_debordement_0']); // 400L
  gs.joueurs[0].ressources.lingots = 500;

  const [from, to] = zonesReelles(gs).slice(0, 2);
  gs.plateau[from].pions = [{ type: 'incorruptible', joueur: null }];
  gs.plateau[to].pions = [];
  gs.incorruptibles.deployes = [from];

  const r = MagouilleEngine.play(gs, 0, 'piscine_debordement_0', { fromZone: from, toZone: to }, data.cartes);

  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.incorruptibles.deployes.includes(to), true, 'la nouvelle zone est enregistrée');
  assertEqual(gs.incorruptibles.deployes.includes(from), false, 'l\'ancienne zone est libérée');
});

test('on ne peut pas se rendre soi-même inéligible', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['video_posthume_0']);
  gs.joueurs[0].ressources.lingots = 500;

  const soi = MagouilleEngine.play(gs, 0, 'video_posthume_0', { cible: 0 }, data.cartes);
  assertEqual(soi.ok, false, 'se cibler soi-même est refusé');
  assertEqual(gs.joueurs[0].ressources.lingots, 500, 'aucun débit sur un refus');

  const autre = MagouilleEngine.play(gs, 0, 'video_posthume_0', { cible: 2 }, data.cartes);
  assertEqual(autre.ok, true, autre.msg);
  assertEqual(gs.joueurs[2]._ineligible, true, 'la cible est marquée inéligible');
  assertEqual(gs.joueurs[0].ressources.lingots, 100, '400L débités');
});

test('vendre ses armes sans stock ne consomme pas la carte', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  donnerCartes(gs, 0, ['amine_dada_0']);
  gs.gangs_actifs[MagouilleEngine.QUARTIER_LOBBY_JUIF] = { joueur: 0, gang: {}, tour_activation: 7 };
  gs.joueurs[0].ressources.armes = 0;
  gs.joueurs[0].ressources.lingots = 0;

  const vide = MagouilleEngine.play(gs, 0, 'amine_dada_0', {}, data.cartes);
  assertEqual(vide.ok, false, 'pas d\'armes : refus');
  assert(gs.joueurs[0].cartes_magouille.includes('amine_dada_0'), 'la carte reste en main');

  gs.joueurs[0].ressources.armes = 5;
  const plein = MagouilleEngine.play(gs, 0, 'amine_dada_0', {}, data.cartes);
  assertEqual(plein.ok, true, plein.msg);
  assertEqual(gs.joueurs[0].ressources.lingots, 100, '5 armes x 20L');
  assert(gs.deck_magouille.retirees_du_jeu.includes('amine_dada_0'),
    'une carte qui ne repose pas sous la pile est retirée du jeu');
});
