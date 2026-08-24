/**
 * JORETAPO — Tests des pouvoirs du maire (js/mayor-engine.js).
 *
 * Chaque test décrit une RÈGLE du jeu, pas une implémentation :
 *   1. Un pouvoir doit être ATTEIGNABLE : il ne se propose que dans une phase où
 *      le joueur a la main (phases 1 et 4 — les seules avec panneau d'ordres).
 *   2. Un privilège n'est consommé que si le pouvoir a produit son effet.
 *   3. Un effet annoncé « pour tout le mandat » se termine avec le mandat.
 *   4. Un effet doit survivre à la résolution du tour (sinon il n'existe pas).
 *   5. Les gitans déplacés sont déplacés PARTOUT : pions, drapeaux, positions.
 *   6. Aucune ressource n'apparaît ni ne disparaît hors des transferts déclarés.
 */

import {
  test, assert, assertEqual,
  loadData, makeGame
} from './helpers.js';

import { MayorEngine, MAYOR_POWERS } from '../js/mayor-engine.js';
import { SpecialEntities } from '../js/special-entities.js';
import { ConflictResolver } from '../js/conflict-resolver.js';

/* ── Utilitaires locaux ──────────────────────────────────── */

/** Installe `pid` comme maire avec `n` privilèges. */
function faireMaire(gs, pid, n = 2) {
  gs.joueurs.forEach((j, i) => { j.est_maire = i === pid; j.privileges_maire_restants = i === pid ? n : 0; });
  gs.maire = { joueur_id: pid, privileges_restants: n, tour_election: gs.tour };
  return gs;
}

const zonesReelles = gs => Object.keys(gs.plateau).filter(z => !z.startsWith('ile_'));

/** Zones réelles vierges : ni pion, ni construction, ni propriétaire. */
const zonesLibres = gs => zonesReelles(gs).filter(z =>
  gs.plateau[z].pions.length === 0 && !gs.plateau[z].construction && gs.plateau[z].proprietaire == null);

/** Zones portant au moins un pion de ce type. */
function zonesAvecPion(gs, type) {
  return Object.entries(gs.plateau)
    .filter(([, z]) => z.pions.some(p => p.type === type))
    .map(([zid]) => zid);
}

const totalLingots = gs => gs.joueurs.reduce((s, j) => s + j.ressources.lingots, 0);

/* ═══════════════════════════════════════════════════════════
 *  1 — Accessibilité des pouvoirs
 * ═══════════════════════════════════════════════════════════ */

test('les 8 pouvoirs du maire sont proposés dans une phase où le joueur a la main', async () => {
  const phasesJouables = [1, 4]; // seules phases avec panneau d'ordres (turn-manager)
  Object.values(MAYOR_POWERS).forEach(p => {
    assert(phasesJouables.includes(p.phase),
      `le pouvoir « ${p.label} » est déclaré en phase ${p.phase} : aucun panneau d'ordres n'y est affiché`);
  });
});

test('le maire voit tous ses pouvoirs de phase 1, incorruptible et expropriation compris', async () => {
  const gs = await makeGame(3);
  faireMaire(gs, 0);
  const ids = MayorEngine.availablePowers(gs, 0, 1).map(p => p.id);
  assertEqual(ids.length, Object.keys(MAYOR_POWERS).length, 'pouvoirs proposés en phase 1');
  assert(ids.includes('incorruptible'), 'le pouvoir incorruptible doit être atteignable');
  assert(ids.includes('exproprier'), 'le pouvoir exproprier doit être atteignable');
});

test('un joueur qui n\'est pas maire, ou un maire sans privilège, n\'a aucun pouvoir', async () => {
  const gs = await makeGame(3);
  faireMaire(gs, 0, 2);
  assertEqual(MayorEngine.availablePowers(gs, 1, 1).length, 0, 'pouvoirs d\'un non-maire');
  faireMaire(gs, 0, 0);
  assertEqual(MayorEngine.availablePowers(gs, 0, 1).length, 0, 'pouvoirs d\'un maire sans privilège');
  const r = MayorEngine.execute(gs, 0, 'taxe', {}, null);
  assertEqual(r.ok, false, 'exécution sans privilège');
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Un privilège n'est consommé que par un effet réel
 * ═══════════════════════════════════════════════════════════ */

test('un pouvoir refusé ne consomme aucun privilège', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);

  const refus = [
    ['incorruptible', { zone: 'ZONE_QUI_NEXISTE_PAS' }],
    ['exproprier', { cible: 1, zones: ['A', 'B'] }],
    ['coupure', { quartierId: 'quartier_bidon' }],
    ['repositionner', { mouvements: [] }],
    ['saisir_argent', { cible: 0 }],
    ['deplacer_gitans', { zones: [] }]
  ];
  refus.forEach(([id, params]) => {
    const r = MayorEngine.execute(gs, 0, id, params, data.gameplay);
    assertEqual(r.ok, false, `${id} aurait dû être refusé`);
  });
  assertEqual(gs.maire.privileges_restants, 2, 'privilèges après 6 refus');
  assertEqual(gs.joueurs[0].privileges_maire_restants, 2, 'compteur joueur après 6 refus');
});

test('un pouvoir réussi consomme exactement un privilège sur les deux compteurs', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);
  gs.joueurs[1].ressources.lingots = 500;

  const r = MayorEngine.execute(gs, 0, 'saisir_argent', { cible: 1 }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.maire.privileges_restants, 1, 'privilèges du mandat');
  assertEqual(gs.joueurs[0].privileges_maire_restants, 1, 'compteur du joueur');
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Incorruptible
 * ═══════════════════════════════════════════════════════════ */

test('l\'incorruptible lancé par le maire arrive physiquement sur le plateau', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  const zone = zonesLibres(gs)[0];

  const r = MayorEngine.execute(gs, 0, 'incorruptible', { zone }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  assert(SpecialEntities.hasIncorruptible(gs, zone), 'un pion incorruptible doit occuper la zone');
  assert(gs.incorruptibles.deployes.includes(zone), 'l\'état doit référencer la zone');
  assert(SpecialEntities.isZoneBlockedByIncorruptible(gs, zone), 'la zone doit devenir infranchissable');
});

test('le jeu ne contient jamais plus de 2 incorruptibles', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 5);
  const zones = zonesLibres(gs).slice(0, 4);

  assertEqual(MayorEngine.execute(gs, 0, 'incorruptible', { zone: zones[0] }, data.gameplay).ok, true, '1er');
  assertEqual(MayorEngine.execute(gs, 0, 'incorruptible', { zone: zones[1] }, data.gameplay).ok, true, '2e');
  const troisieme = MayorEngine.execute(gs, 0, 'incorruptible', { zone: zones[2] }, data.gameplay);
  assertEqual(troisieme.ok, false, '3e incorruptible : ' + troisieme.msg);
  assertEqual(zonesAvecPion(gs, 'incorruptible').length, 2, 'incorruptibles sur le plateau');
});

test('un incorruptible éliminé (700 L) ne libère pas sa place dans la réserve', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 5);
  const zones = zonesLibres(gs).slice(0, 3);

  MayorEngine.execute(gs, 0, 'incorruptible', { zone: zones[0] }, data.gameplay);
  // Élimination définitive : le jeton sort du jeu, il n'est pas recyclable.
  gs.plateau[zones[0]].pions = gs.plateau[zones[0]].pions.filter(p => p.type !== 'incorruptible');
  gs.incorruptibles.elimines = 1;
  gs.incorruptibles.deployes = [];

  assertEqual(MayorEngine.incorruptiblesDisponibles(gs), 1, 'jetons restants après une élimination');
  assertEqual(MayorEngine.execute(gs, 0, 'incorruptible', { zone: zones[1] }, data.gameplay).ok, true, '2e jeton');
  assertEqual(MayorEngine.execute(gs, 0, 'incorruptible', { zone: zones[2] }, data.gameplay).ok, false,
    'la réserve est vide : 1 posé + 1 éliminé');
});

test('deux incorruptibles ne s\'empilent pas sur la même zone', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 3);
  const zone = zonesLibres(gs)[0];
  MayorEngine.execute(gs, 0, 'incorruptible', { zone }, data.gameplay);
  assertEqual(MayorEngine.execute(gs, 0, 'incorruptible', { zone }, data.gameplay).ok, false, 'doublon refusé');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Coupure d'électricité : le temps du mandat, pas plus
 * ═══════════════════════════════════════════════════════════ */

test('la coupure du maire éteint tout le quartier', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  const q = data.gameplay.quartiers[0];

  const r = MayorEngine.execute(gs, 0, 'coupure', { quartierId: q.id }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  q.zones.forEach(zid => {
    if (gs.plateau[zid]) assertEqual(gs.plateau[zid].electricite, false, `électricité de ${zid}`);
  });
});

test('la coupure du maire est rétablie à la fin du mandat', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  gs.tour = 3;
  faireMaire(gs, 0);
  const q = data.gameplay.quartiers[0];
  MayorEngine.execute(gs, 0, 'coupure', { quartierId: q.id }, data.gameplay);

  gs.tour = 7; // fin de mandat : l'élection déclenche processEndOfMandate
  SpecialEntities.processEndOfMandate(gs, data.gameplay);

  q.zones.forEach(zid => {
    if (gs.plateau[zid]) assertEqual(gs.plateau[zid].electricite, true, `électricité rétablie sur ${zid}`);
  });
  assertEqual(gs.coupures_electricite.length, 0, 'coupures encore actives');
});

test('la coupure du maire tient jusqu\'au bout du mandat, pas moins', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  gs.tour = 6;
  faireMaire(gs, 0);
  const q = data.gameplay.quartiers[0];
  MayorEngine.execute(gs, 0, 'coupure', { quartierId: q.id }, data.gameplay);

  gs.tour = 6; // aucune fin de mandat n'a eu lieu
  SpecialEntities.processEndOfMandate(gs, data.gameplay);
  const zone = q.zones.find(zid => gs.plateau[zid]);
  assertEqual(gs.plateau[zone].electricite, false, 'la coupure ne doit pas expirer avant l\'élection');
});

test('un quartier déjà privé d\'électricité ne peut pas être recoupé', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);
  const q = data.gameplay.quartiers[0];
  MayorEngine.execute(gs, 0, 'coupure', { quartierId: q.id }, data.gameplay);
  const second = MayorEngine.execute(gs, 0, 'coupure', { quartierId: q.id }, data.gameplay);
  assertEqual(second.ok, false, 'deuxième coupure refusée');
  assertEqual(gs.maire.privileges_restants, 1, 'privilège non gaspillé');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — Expropriation : elle doit survivre à la résolution
 * ═══════════════════════════════════════════════════════════ */

test('l\'expropriation retire durablement la propriété des 4 blocs', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);

  const zones = zonesLibres(gs).slice(0, 4);
  zones.forEach(zid => {
    gs.plateau[zid].proprietaire = 1;
    gs.plateau[zid].pions.push({ type: 'dealer', joueur: 1 });
  });

  const r = MayorEngine.execute(gs, 0, 'exproprier', { cible: 1, zones }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  zones.forEach(zid => assertEqual(gs.plateau[zid].proprietaire, null, `propriétaire de ${zid}`));

  // La propriété est recalculée à chaque fin de phase 5 : l'effet doit tenir.
  ConflictResolver.resolve(gs, {}, data.adjacences, data.gameplay);
  zones.forEach(zid => assertEqual(gs.plateau[zid].proprietaire, null,
    `${zid} ne doit pas revenir à l'exproprié après la résolution`));
});

test('on ne peut exproprier que des blocs réellement possédés par la cible', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);
  const zones = zonesLibres(gs).slice(0, 4);
  zones.forEach(zid => { gs.plateau[zid].proprietaire = 1; });
  gs.plateau[zones[3]].proprietaire = 2;

  const r = MayorEngine.execute(gs, 0, 'exproprier', { cible: 1, zones }, data.gameplay);
  assertEqual(r.ok, false, 'expropriation d\'un bloc non possédé');
  assertEqual(gs.plateau[zones[0]].proprietaire, 1, 'aucun effet partiel');
  assertEqual(gs.maire.privileges_restants, 2, 'privilège non consommé');
});

test('le maire ne peut pas s\'exproprier lui-même', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  const zones = zonesLibres(gs).slice(0, 4);
  zones.forEach(zid => { gs.plateau[zid].proprietaire = 0; });
  assertEqual(MayorEngine.execute(gs, 0, 'exproprier', { cible: 0, zones }, data.gameplay).ok, false, 'auto-expropriation');
});

/* ═══════════════════════════════════════════════════════════
 *  6 — Gitans : ils bougent pour de vrai
 * ═══════════════════════════════════════════════════════════ */

test('déplacer les gitans déplace les pions, les drapeaux et les positions', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);

  const avant = zonesAvecPion(gs, 'gitan');
  assert(avant.length > 0, 'la partie doit démarrer avec des camps de gitans');
  const cibles = zonesReelles(gs).filter(z => !gs.plateau[z].construction).slice(0, avant.length);

  const r = MayorEngine.execute(gs, 0, 'deplacer_gitans', { zones: cibles }, data.gameplay);
  assertEqual(r.ok, true, r.msg);

  // 1. pions physiques
  assertEqual(zonesAvecPion(gs, 'gitan').sort().join(','), [...cibles].sort().join(','), 'pions gitans');
  // 2. drapeaux de zone
  cibles.forEach(zid => assertEqual(gs.plateau[zid].gitans, true, `drapeau gitans de ${zid}`));
  avant.forEach(zid => assertEqual(gs.plateau[zid].gitans, false, `ancien camp ${zid} vidé`));
  // 3. état de référence
  assertEqual([...gs.gitans.positions].sort().join(','), [...cibles].sort().join(','), 'gs.gitans.positions');
  // 4. les moteurs suivent
  cibles.forEach(zid => assert(SpecialEntities.isGitanZone(gs, zid), `${zid} doit être un camp de gitans`));
  avant.forEach(zid => assert(!gs.gitans.positions.includes(zid), `${zid} ne doit plus être un camp`));
});

test('le nombre de camps de gitans est conservé par le déplacement', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 3);
  const nb = MayorEngine.campsGitans(gs, data.gameplay);

  const trop = zonesReelles(gs).slice(0, nb + 1);
  assertEqual(MayorEngine.execute(gs, 0, 'deplacer_gitans', { zones: trop }, data.gameplay).ok, false, 'trop de camps');
  const pasAssez = zonesReelles(gs).slice(0, nb - 1);
  assertEqual(MayorEngine.execute(gs, 0, 'deplacer_gitans', { zones: pasAssez }, data.gameplay).ok, false, 'pas assez de camps');

  const ok = zonesReelles(gs).slice(0, nb);
  assertEqual(MayorEngine.execute(gs, 0, 'deplacer_gitans', { zones: ok }, data.gameplay).ok, true, 'bon compte');
  assertEqual(zonesAvecPion(gs, 'gitan').length, nb, 'camps après déplacement');
});

test('un camp de gitans ne s\'installe pas sur une parcelle bâtie', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  const nb = MayorEngine.campsGitans(gs, data.gameplay);
  const cibles = zonesReelles(gs).slice(0, nb);
  gs.plateau[cibles[0]].construction = 'restaurant';

  const r = MayorEngine.execute(gs, 0, 'deplacer_gitans', { zones: cibles }, data.gameplay);
  assertEqual(r.ok, false, 'camp sur une construction');
  assertEqual(gs.maire.privileges_restants, 2, 'privilège non consommé');
});

/* ═══════════════════════════════════════════════════════════
 *  7 — Argent et denrées : rien ne se crée, rien ne se perd
 * ═══════════════════════════════════════════════════════════ */

test('la taxe prélève 10 % de chaque adversaire sans créer de lingots', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  gs.joueurs[0].ressources.lingots = 100;
  gs.joueurs[1].ressources.lingots = 250;
  gs.joueurs[2].ressources.lingots = 99;
  const avant = totalLingots(gs);

  const r = MayorEngine.execute(gs, 0, 'taxe', {}, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.joueurs[1].ressources.lingots, 225, 'J1 après taxe');
  assertEqual(gs.joueurs[2].ressources.lingots, 90, 'J2 après taxe');
  assertEqual(gs.joueurs[0].ressources.lingots, 100 + 25 + 9, 'maire après taxe');
  assertEqual(totalLingots(gs), avant, 'masse monétaire des joueurs');
});

test('la saisie d\'argent verse tout à la caisse de police, pas au maire', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  gs.joueurs[1].ressources.lingots = 400;
  const caisseAvant = gs.caisses.hotel_police;
  const maireAvant = gs.joueurs[0].ressources.lingots;

  const r = MayorEngine.execute(gs, 0, 'saisir_argent', { cible: 1 }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.joueurs[1].ressources.lingots, 0, 'lingots du joueur saisi');
  assertEqual(gs.caisses.hotel_police, caisseAvant + 400, 'caisse de police');
  assertEqual(gs.joueurs[0].ressources.lingots, maireAvant, 'le maire ne s\'enrichit pas');
});

test('la saisie des denrées transfère drogue et armes au maire, sans perte', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0);
  const dosesMaire = gs.joueurs[0].ressources.doses;
  const armesMaire = gs.joueurs[0].ressources.armes;
  gs.joueurs[1].ressources.doses = 12;
  gs.joueurs[1].ressources.armes = 7;

  const r = MayorEngine.execute(gs, 0, 'saisir_denrees', { cible: 1 }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  assertEqual(gs.joueurs[1].ressources.doses, 0, 'doses restantes chez la cible');
  assertEqual(gs.joueurs[1].ressources.armes, 0, 'armes restantes chez la cible');
  assertEqual(gs.joueurs[0].ressources.doses, dosesMaire + 12, 'doses du maire');
  assertEqual(gs.joueurs[0].ressources.armes, armesMaire + 7, 'armes du maire');
});

test('saisir chez un joueur qui n\'a rien est refusé plutôt que de gâcher un privilège', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);
  gs.joueurs[1].ressources.lingots = 0;
  gs.joueurs[1].ressources.doses = 0;
  gs.joueurs[1].ressources.armes = 0;

  assertEqual(MayorEngine.execute(gs, 0, 'saisir_argent', { cible: 1 }, data.gameplay).ok, false, 'saisie d\'argent vide');
  assertEqual(MayorEngine.execute(gs, 0, 'saisir_denrees', { cible: 1 }, data.gameplay).ok, false, 'saisie de denrées vide');
  assertEqual(gs.maire.privileges_restants, 2, 'privilèges intacts');
});

/* ═══════════════════════════════════════════════════════════
 *  8 — Repositionnement des flics
 * ═══════════════════════════════════════════════════════════ */

test('le repositionnement déplace les flics existants, au maximum 3', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 3);
  const zones = zonesReelles(gs);
  const depart = zones.slice(0, 3);
  const arrivee = zones.slice(10, 13);
  depart.forEach(zid => gs.plateau[zid].pions.push({ type: 'flic', joueur: null }));

  const trop = MayorEngine.execute(gs, 0, 'repositionner', {
    mouvements: [0, 1, 2, 3].map(i => ({ from: depart[i % 3], to: arrivee[i % 3] }))
  }, data.gameplay);
  assertEqual(trop.ok, false, '4 mouvements refusés');

  const r = MayorEngine.execute(gs, 0, 'repositionner', {
    mouvements: depart.map((from, i) => ({ from, to: arrivee[i] }))
  }, data.gameplay);
  assertEqual(r.ok, true, r.msg);
  depart.forEach(zid => assert(!gs.plateau[zid].pions.some(p => p.type === 'flic'), `${zid} vidé de son flic`));
  arrivee.forEach(zid => assert(gs.plateau[zid].pions.some(p => p.type === 'flic'), `${zid} a reçu un flic`));
});

test('repositionner depuis une zone sans flic est refusé, sans coût', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);
  const zones = zonesReelles(gs);
  const r = MayorEngine.execute(gs, 0, 'repositionner', {
    mouvements: [{ from: zones[0], to: zones[1] }]
  }, data.gameplay);
  assertEqual(r.ok, false, 'aucun flic à déplacer');
  assertEqual(gs.maire.privileges_restants, 2, 'privilège non consommé');
});

/* ═══════════════════════════════════════════════════════════
 *  9 — Robustesse
 * ═══════════════════════════════════════════════════════════ */

test('un pouvoir inconnu ou une cible absurde ne fait pas planter le moteur', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  faireMaire(gs, 0, 2);
  assertEqual(MayorEngine.execute(gs, 0, 'pouvoir_imaginaire', {}, data.gameplay).ok, false, 'pouvoir inconnu');
  assertEqual(MayorEngine.execute(gs, 0, 'saisir_argent', { cible: 99 }, data.gameplay).ok, false, 'cible hors bornes');
  assertEqual(MayorEngine.execute(gs, 0, 'exproprier', { cible: 'J1', zones: [] }, data.gameplay).ok, false, 'cible non numérique');
  assertEqual(gs.maire.privileges_restants, 2, 'privilèges intacts');
});
