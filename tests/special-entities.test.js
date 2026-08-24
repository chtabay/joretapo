/**
 * JORETAPO — Règles des entités hors joueurs : gitans, incorruptibles, gangs,
 * fin de mandat. Chaque test énonce une RÈGLE de jeu, pas une implémentation.
 */

import { test, assert, assertEqual, loadData, makeGame } from './helpers.js';
import { SpecialEntities } from '../js/special-entities.js';

/* ── outillage local ───────────────────────────────────────── */

/** Vide une zone et y pose exactement les pions demandés. */
function poser(gs, zid, pions) {
  gs.plateau[zid].pions = pions.map(p => ({ ...p }));
  return gs.plateau[zid];
}

/** Purge tout le plateau de ses pions (hors gitans) pour isoler un scénario. */
function plateauVierge(gs) {
  Object.values(gs.plateau).forEach(z => {
    z.pions = z.pions.filter(p => p.type === 'gitan');
    z.proprietaire = null;
    z.construction = null;
  });
}

function quartierAvecEffet(gameplay, effet) {
  return gameplay.quartiers.find(q => q.gang?.effet === effet);
}

/** Donne à `pid` le contrôle total d'un quartier, tour 7 : gang activable. */
function donnerQuartier(gs, gameplay, pid, quartierId) {
  const q = gameplay.quartiers.find(x => x.id === quartierId);
  q.zones.forEach(zid => { gs.plateau[zid].proprietaire = pid; });
  gs.tour = Math.max(gs.tour, SpecialEntities.TOUR_ACTIVATION_GANGS);
  return q;
}

/* ═══════════════════════════════════════════════════════════
 *  GITANS — état
 * ═══════════════════════════════════════════════════════════ */

test('un camp de gitans est reconnu par ses trois représentations à la fois', async () => {
  const gs = await makeGame(2);
  const camps = SpecialEntities.getGitanZones(gs);
  assertEqual(camps.length, 4, 'la partie démarre avec 4 camps (les 4 îles)');
  camps.forEach(zid => {
    assert(gs.gitans.positions.includes(zid), `${zid} absent de gs.gitans.positions`);
    assert(gs.plateau[zid].gitans === true, `${zid} n'a pas le drapeau gitans`);
    assert(gs.plateau[zid].pions.some(p => p.type === 'gitan'), `${zid} n'a pas de pion gitan`);
  });
});

test('déplacer les camps déplace positions, drapeaux ET pions ensemble', async () => {
  const gs = await makeGame(2);
  const res = SpecialEntities.setGitanCamps(gs, ['BX2', 'QN1']);
  assert(res.ok, res.reason);

  assertEqual(gs.gitans.positions.length, 2, 'deux camps attendus');
  assert(SpecialEntities.isGitanZone(gs, 'BX2'), 'BX2 doit être un camp');
  assert(gs.plateau.BX2.pions.some(p => p.type === 'gitan'), 'le pion gitan doit avoir suivi');

  ['ile_rikers', 'ile_roosevelt', 'ile_ward', 'ile_liberty'].forEach(ile => {
    assert(!SpecialEntities.isGitanZone(gs, ile), `${ile} ne doit plus être un camp`);
    assert(!gs.plateau[ile].pions.some(p => p.type === 'gitan'), `${ile} garde un pion gitan fantôme`);
  });
  assertEqual(SpecialEntities.getGitanZones(gs).length, 2, 'aucun camp fantôme ne subsiste');
});

test('les armes coûtent le tarif gitan là où le camp se trouve, pas là où il était', async () => {
  const gs = await makeGame(2);
  assertEqual(SpecialEntities.getGitanArmesPrice(gs, 'ile_rikers'), SpecialEntities.PRIX_ARMES_GITANS,
    'tarif gitan attendu sur une île occupée par un camp');
  assertEqual(SpecialEntities.getGitanArmesPrice(gs, 'BX2'), SpecialEntities.PRIX_ARMES_STANDARD,
    'tarif normal attendu hors camp');

  SpecialEntities.setGitanCamps(gs, ['BX2']);
  assertEqual(SpecialEntities.getGitanArmesPrice(gs, 'BX2'), SpecialEntities.PRIX_ARMES_GITANS,
    'le tarif majoré suit le camp');
  assertEqual(SpecialEntities.getGitanArmesPrice(gs, 'ile_rikers'), SpecialEntities.PRIX_ARMES_STANDARD,
    'une île sans camp revend au tarif normal');
  assertEqual(SpecialEntities.getGitanArmesPrice(), SpecialEntities.PRIX_ARMES_GITANS,
    'appel sans argument : tarif gitan (compatibilité)');
});

test('on ne construit ni sur un camp de gitans ni sur un cimetière', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });

  assert(!SpecialEntities.canBuildOnZone(gs, 'ile_rikers', data.gameplay).ok, 'camp de gitans constructible');

  const cimetiere = Object.keys(data.gameplay.zones).find(z => data.gameplay.zones[z].facilite === 'cimetiere');
  assert(cimetiere, 'le jeu doit contenir au moins un cimetière');
  const verdict = SpecialEntities.canBuildOnZone(gs, cimetiere, data.gameplay);
  assert(!verdict.ok, 'cimetière constructible');
  assertEqual(verdict.reason, 'cimetiere', 'motif de refus attendu');

  assert(SpecialEntities.canBuildOnZone(gs, 'BX2', data.gameplay).ok, 'une parcelle ordinaire reste constructible');
});

/* ═══════════════════════════════════════════════════════════
 *  GITANS — traversée (spec 01:141, spec 06:64-78)
 * ═══════════════════════════════════════════════════════════ */

async function scenarioTraversee(options = {}) {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  plateauVierge(gs);
  const j = gs.joueurs[0];
  j.ressources.doses = options.doses ?? 10;
  j.ressources.armes = options.armes ?? 10;
  poser(gs, 'BX2', [{ type: 'dealer', joueur: 0 }]);
  poser(gs, 'MN1', [{ type: 'prostituee_base', joueur: 0 }]);
  return { data, gs };
}

const ORDRE_RIKERS = { from: 'BX2', camp: 'ile_rikers', to: 'QN1', sacrifice: { zone: 'MN1', idx: 0 } };

test('traverser un camp exige 5 doses et 5 armes', async () => {
  const { data, gs } = await scenarioTraversee({ doses: 4, armes: 10 });
  const sansDoses = SpecialEntities.canTraverseGitans(gs, 0, ORDRE_RIKERS, data.adjacences);
  assert(!sansDoses.ok, 'traversée acceptée avec 4 doses');
  assertEqual(sansDoses.reason, 'doses_insuffisantes', 'motif attendu');

  gs.joueurs[0].ressources.doses = 5;
  gs.joueurs[0].ressources.armes = 4;
  const sansArmes = SpecialEntities.canTraverseGitans(gs, 0, ORDRE_RIKERS, data.adjacences);
  assert(!sansArmes.ok, 'traversée acceptée avec 4 armes');
  assertEqual(sansArmes.reason, 'armes_insuffisantes', 'motif attendu');
});

test('la traversée fait sortir le pion de l\'autre côté, à 2 cases de son départ', async () => {
  const { data, gs } = await scenarioTraversee();
  assert(!(data.adjacences.BX2 || []).includes('QN1'),
    'le scénario perd son sens si BX2 et QN1 sont adjacents');

  const res = SpecialEntities.traverseGitans(gs, 0, ORDRE_RIKERS, data.adjacences);
  assert(res.ok, res.msg || res.reason);

  assertEqual(gs.plateau.BX2.pions.length, 0, 'le pion doit avoir quitté sa case');
  assertEqual(gs.plateau.QN1.pions.filter(p => p.type === 'dealer').length, 1, 'le pion doit être arrivé en QN1');
  assert(!gs.plateau.ile_rikers.pions.some(p => p.joueur === 0),
    'le pion ne reste jamais sur la case des gitans (spec 06:70)');
  assertEqual(gs.plateau.QN1.proprietaire, 0, 'la case d\'arrivée revient au pion armé');
});

test('la traversée coûte 5 doses, 5 armes et un pion sacrifié', async () => {
  const { data, gs } = await scenarioTraversee();
  const res = SpecialEntities.traverseGitans(gs, 0, ORDRE_RIKERS, data.adjacences);
  assert(res.ok, res.msg || res.reason);

  assertEqual(gs.joueurs[0].ressources.doses, 5, '10 − 5 doses');
  assertEqual(gs.joueurs[0].ressources.armes, 5, '10 − 5 armes');
  assertEqual(gs.plateau.MN1.pions.length, 0, 'le pion sacrifié doit avoir disparu');
});

test('un refus de traversée ne coûte rien', async () => {
  const { data, gs } = await scenarioTraversee();
  const avant = { ...gs.joueurs[0].ressources };
  const res = SpecialEntities.traverseGitans(gs, 0, { ...ORDRE_RIKERS, to: 'BX2' }, data.adjacences);
  assert(!res.ok, 'sortir sur sa propre case ne doit pas être accepté');
  assertEqual(gs.joueurs[0].ressources.doses, avant.doses, 'doses débitées malgré le refus');
  assertEqual(gs.joueurs[0].ressources.armes, avant.armes, 'armes débitées malgré le refus');
  assertEqual(gs.plateau.MN1.pions.length, 1, 'pion sacrifié malgré le refus');
});

test('la sortie doit être une case adjacente au camp, autre que le départ', async () => {
  const { data, gs } = await scenarioTraversee();

  const horsCamp = SpecialEntities.canTraverseGitans(gs, 0, { ...ORDRE_RIKERS, to: 'MN1' }, data.adjacences);
  assert(!horsCamp.ok, 'sortie sur une case non adjacente au camp acceptée');
  assertEqual(horsCamp.reason, 'sortie_non_adjacente', 'motif attendu');

  const surCamp = SpecialEntities.canTraverseGitans(gs, 0, { ...ORDRE_RIKERS, to: 'ile_rikers' }, data.adjacences);
  assert(!surCamp.ok, 'le pion ne peut pas rester chez les gitans');

  const pasUnCamp = SpecialEntities.canTraverseGitans(gs, 0, { ...ORDRE_RIKERS, camp: 'BX2' }, data.adjacences);
  assert(!pasUnCamp.ok, 'on ne traverse que des camps de gitans');
  assertEqual(pasUnCamp.reason, 'pas_un_camp', 'motif attendu');
});

test('le départ doit être adjacent au camp traversé', async () => {
  const { data, gs } = await scenarioTraversee();
  poser(gs, 'MN8', [{ type: 'dealer', joueur: 0 }]);
  const res = SpecialEntities.canTraverseGitans(gs, 0, { ...ORDRE_RIKERS, from: 'MN8' }, data.adjacences);
  assert(!res.ok, 'départ non adjacent au camp accepté');
  assertEqual(res.reason, 'depart_non_adjacent', 'motif attendu');
});

test('le pion sacrifié est un autre pion à soi, jamais le voyageur ni celui d\'un adversaire', async () => {
  const { data, gs } = await scenarioTraversee();

  const soiMeme = SpecialEntities.canTraverseGitans(
    gs, 0, { ...ORDRE_RIKERS, sacrifice: { zone: 'BX2', idx: 0 } }, data.adjacences);
  assert(!soiMeme.ok, 'le voyageur ne peut pas être son propre sacrifice');
  assertEqual(soiMeme.reason, 'sacrifice_est_voyageur', 'motif attendu');

  poser(gs, 'BX1', [{ type: 'dealer', joueur: 1 }]);
  const adverse = SpecialEntities.canTraverseGitans(
    gs, 0, { ...ORDRE_RIKERS, sacrifice: { zone: 'BX1', idx: 0 } }, data.adjacences);
  assert(!adverse.ok, 'on ne sacrifie pas le pion d\'un adversaire');

  const sansSacrifice = SpecialEntities.canTraverseGitans(
    gs, 0, { ...ORDRE_RIKERS, sacrifice: null }, data.adjacences);
  assert(!sansSacrifice.ok, 'la traversée sans sacrifice doit être refusée');
});

test('un homme armé ne sort pas sur une case déjà tenue par un homme armé', async () => {
  const { data, gs } = await scenarioTraversee();
  poser(gs, 'QN1', [{ type: 'trafiquant', joueur: 1 }]);
  const res = SpecialEntities.canTraverseGitans(gs, 0, ORDRE_RIKERS, data.adjacences);
  assert(!res.ok, 'deux hommes armés sur la même case');
  assertEqual(res.reason, 'sortie_occupee', 'motif attendu');
});

/* ═══════════════════════════════════════════════════════════
 *  GANGS
 * ═══════════════════════════════════════════════════════════ */

test('un gang dont l\'effet n\'a aucun lecteur est refusé au lieu d\'être feint', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });

  const sansLecteur = data.gameplay.quartiers.filter(q => q.gang && !SpecialEntities.isEffetImplemente(q.gang.effet));
  assertEqual(sansLecteur.length, 8, '8 gangs sur 15 attendent encore leur lecteur');

  sansLecteur.forEach(q => {
    donnerQuartier(gs, data.gameplay, 0, q.id);
    const verdict = SpecialEntities.canActivateGang(gs, 0, q.id, data.gameplay);
    assert(!verdict.ok, `${q.gang.nom} annonce un succès alors qu'il ne fait rien`);
    assertEqual(verdict.reason, 'effet_non_implemente', `${q.gang.nom} : code de refus attendu`);

    const active = SpecialEntities.activateGang(gs, 0, q.id, data.gameplay);
    assert(!active.ok, `${q.gang.nom} ne doit pas consommer l'activation du quartier`);
    assert(!gs.gangs_actifs[q.id], `${q.gang.nom} ne doit rien inscrire dans gangs_actifs`);
  });
});

test('appliquer directement un effet sans lecteur est refusé et n\'écrit aucun marqueur', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'bloquer_ordres');
  gs.tour = 8;
  gs.gangs_actifs[q.id] = { joueur: 0, gang: q.gang, tour_activation: 8 };

  const res = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, { cible: 1 });
  assert(!res.ok, 'l\'effet sans lecteur ne doit pas réussir');
  assertEqual(res.reason, 'effet_non_implemente', 'code de refus attendu');
  assert(!gs._blocages || Object.keys(gs._blocages).length === 0,
    'aucun marqueur ne doit être écrit tant que personne ne le lit');
});

test('les 7 gangs restants s\'activent et produisent un effet réel', async () => {
  const data = await loadData();
  const implementes = data.gameplay.quartiers.filter(q => q.gang && SpecialEntities.isEffetImplemente(q.gang.effet));
  assertEqual(implementes.length, 7, '7 gangs doivent rester jouables');

  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'actions_supplementaires');
  donnerQuartier(gs, data.gameplay, 0, q.id);
  const res = SpecialEntities.activateGang(gs, 0, q.id, data.gameplay);
  assert(res.ok, res.reason);
  assert(gs.gangs_actifs[q.id], 'le gang activé doit être inscrit');
});

test('éliminer plusieurs pions d\'une même case retire exactement les pions choisis', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  plateauVierge(gs);

  const q = quartierAvecEffet(data.gameplay, 'eliminer_3_pions');
  gs.tour = 8;
  gs.gangs_actifs[q.id] = { joueur: 0, gang: q.gang, tour_activation: 8 };

  // Trois pions ennemis sur la même case : le bug historique décalait les index
  // au premier splice et frappait le mauvais pion.
  poser(gs, 'MN3', [
    { type: 'dealer', joueur: 1, marque: 'A' },
    { type: 'prostituee_base', joueur: 1, marque: 'B' },
    { type: 'prostituee_luxe', joueur: 1, marque: 'C' }
  ]);

  const res = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {
    cibles: [{ zone: 'MN3', idx: 0 }, { zone: 'MN3', idx: 1 }]
  });
  assert(res.ok, res.msg || res.reason);

  const restants = gs.plateau.MN3.pions.map(p => p.marque);
  assertEqual(restants.length, 1, 'exactement 2 pions doivent avoir été retirés');
  assertEqual(restants[0], 'C', 'le pion épargné doit être celui qui n\'était pas ciblé');
});

test('l\'élimination par gang ne touche ni les flics, ni les incorruptibles, ni ses propres pions', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  plateauVierge(gs);
  const q = quartierAvecEffet(data.gameplay, 'eliminer_3_pions');
  gs.tour = 8;

  const cas = [
    [{ type: 'flic', joueur: 1 }, 'un flic (300L ou 550L, pas gratuitement)'],
    [{ type: 'incorruptible', joueur: null }, 'un incorruptible (700L)'],
    [{ type: 'dealer', joueur: 0 }, 'ses propres pions']
  ];

  cas.forEach(([pion, libelle]) => {
    gs.gangs_actifs[q.id] = { joueur: 0, gang: q.gang, tour_activation: 8 };
    poser(gs, 'MN3', [pion]);
    const res = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, { cibles: [{ zone: 'MN3', idx: 0 }] });
    assert(!res.ok, `le gang ne doit pas pouvoir éliminer ${libelle}`);
    assertEqual(gs.plateau.MN3.pions.length, 1, `${libelle} a été retiré du plateau`);
  });
});

test('le bonus d\'actions permanent d\'un gang survit à la fin de mandat', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'actions_supplementaires');
  donnerQuartier(gs, data.gameplay, 0, q.id);

  assert(SpecialEntities.activateGang(gs, 0, q.id, data.gameplay).ok, 'activation du gang');
  const res = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {});
  assert(res.ok, res.reason);
  assertEqual(gs.joueurs[0].actions_bonus, SpecialEntities.BONUS_ACTIONS_GANG, 'bonus accordé');

  SpecialEntities.processEndOfMandate(gs, data.gameplay);
  assertEqual(gs.joueurs[0].actions_bonus, SpecialEntities.BONUS_ACTIONS_GANG,
    'un bonus annoncé permanent ne doit pas disparaître à la fin du mandat');
});

test('un bonus d\'actions temporaire, lui, expire à la fin de mandat', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  gs.joueurs[1].actions_bonus = 3; // ex. carte magouille, valable pour le mandat
  SpecialEntities.processEndOfMandate(gs, data.gameplay);
  assertEqual(gs.joueurs[1].actions_bonus, 0, 'le bonus de mandat doit être remis à zéro');
});

test('le bonus d\'actions d\'un gang ne s\'accorde qu\'une fois', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'actions_supplementaires');
  donnerQuartier(gs, data.gameplay, 0, q.id);
  SpecialEntities.activateGang(gs, 0, q.id, data.gameplay);

  assert(SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {}).ok, '1er octroi');
  const second = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {});
  assert(!second.ok, 'le bonus ne doit pas se cumuler par appels répétés');
  assertEqual(gs.joueurs[0].actions_bonus, SpecialEntities.BONUS_ACTIONS_GANG, 'bonus inchangé');
});

test('la revente en gros n\'a lieu qu\'une fois par tour et rapporte moins qu\'elle ne coûterait à racheter', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'revente_marchandises');
  donnerQuartier(gs, data.gameplay, 0, q.id);
  SpecialEntities.activateGang(gs, 0, q.id, data.gameplay);

  gs.joueurs[0].ressources.armes = 10;
  gs.joueurs[0].ressources.doses = 10;
  gs.joueurs[0].ressources.lingots = 0;

  const res = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {});
  assert(res.ok, res.reason);
  const attendu = 10 * SpecialEntities.PRIX_REVENTE.arme + 10 * SpecialEntities.PRIX_REVENTE.dose;
  assertEqual(gs.joueurs[0].ressources.lingots, attendu, 'produit de la revente');
  assertEqual(gs.joueurs[0].ressources.armes, 0, 'le stock d\'armes est écoulé');

  gs.joueurs[0].ressources.armes = 10;
  const second = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {});
  assert(!second.ok, 'deux reventes dans le même tour : pompe à lingots');

  gs.tour++;
  assert(SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {}).ok, 'la revente redevient possible au tour suivant');
});

test('le casino offert par un gang se pose sur une parcelle qu\'on tient, jamais sur un cimetière', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  plateauVierge(gs);
  const q = quartierAvecEffet(data.gameplay, 'casino_gratuit');
  gs.tour = 8;

  const poserGang = () => { gs.gangs_actifs[q.id] = { joueur: 0, gang: q.gang, tour_activation: 8 }; };

  poserGang();
  gs.plateau.MN3.proprietaire = 1;
  const chezLautre = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, { zone: 'MN3' });
  assert(!chezLautre.ok, 'un casino gratuit ne se pose pas sur une parcelle adverse');
  assertEqual(gs.plateau.MN3.construction, null, 'aucune construction ne doit apparaître');

  const cimetiere = Object.keys(data.gameplay.zones).find(z => data.gameplay.zones[z].facilite === 'cimetiere');
  gs.plateau[cimetiere].proprietaire = 0;
  poserGang();
  assert(!SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, { zone: cimetiere }).ok,
    'un casino ne se pose pas sur un cimetière');

  gs.plateau.MN4.proprietaire = 0;
  poserGang();
  const ok = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, { zone: 'MN4' });
  assert(ok.ok, ok.reason);
  assertEqual(gs.plateau.MN4.construction, 'casino', 'le casino doit être posé');
});

test('le vol de privilège au maire ne rend jamais un compteur négatif', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'voler_action_maire');
  gs.tour = 8;
  gs.gangs_actifs[q.id] = { joueur: 0, gang: q.gang, tour_activation: 8 };

  gs.maire = { joueur_id: 1, privileges_restants: 1, tour_election: 7 };
  gs.joueurs[1].privileges_maire_restants = 0; // désynchronisé par une autre action

  const res = SpecialEntities.applyGangEffect(gs, 0, q.id, data.gameplay, {});
  assert(res.ok, res.reason);
  assertEqual(gs.maire.privileges_restants, 0, 'le privilège est bien volé');
  assert(gs.joueurs[1].privileges_maire_restants >= 0, 'un compteur de privilèges ne devient jamais négatif');
});

test('un effet de gang inconnu est refusé, pas annoncé comme un effet passif', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  gs.tour = 8;
  gs.gangs_actifs.faux_quartier = {
    joueur: 0, gang: { nom: 'Gang fantôme', effet: 'effet_inexistant', duree: 0, usage_unique: true }, tour_activation: 8
  };
  const res = SpecialEntities.applyGangEffect(gs, 0, 'faux_quartier', data.gameplay, {});
  assert(!res.ok, 'un effet inconnu ne doit pas passer pour un succès');
  assertEqual(res.reason, 'effet_inconnu', 'code de refus attendu');
});

test('un gang ne s\'active qu\'après le tour d\'ouverture et sur un quartier entièrement contrôlé', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = quartierAvecEffet(data.gameplay, 'actions_supplementaires');

  gs.tour = 1;
  q.zones.forEach(zid => { gs.plateau[zid].proprietaire = 0; });
  assert(!SpecialEntities.canActivateGang(gs, 0, q.id, data.gameplay).ok, 'gang activable dès le tour 1');

  gs.tour = SpecialEntities.TOUR_ACTIVATION_GANGS;
  gs.plateau[q.zones[0]].proprietaire = 1;
  assert(!SpecialEntities.canActivateGang(gs, 0, q.id, data.gameplay).ok,
    'gang activable sans contrôler tout le quartier');

  gs.plateau[q.zones[0]].proprietaire = 0;
  assert(SpecialEntities.canActivateGang(gs, 0, q.id, data.gameplay).ok, 'gang refusé alors que tout est réuni');
  SpecialEntities.activateGang(gs, 0, q.id, data.gameplay);
  assert(!SpecialEntities.canActivateGang(gs, 0, q.id, data.gameplay).ok, 'un gang ne s\'active pas deux fois');
});

/* ═══════════════════════════════════════════════════════════
 *  INCORRUPTIBLES
 * ═══════════════════════════════════════════════════════════ */

test('un incorruptible seul rend sa case infranchissable, un homme armé la rouvre', async () => {
  const gs = await makeGame(2);
  poser(gs, 'MN3', [{ type: 'incorruptible', joueur: null }]);
  assert(SpecialEntities.isZoneBlockedByIncorruptible(gs, 'MN3'), 'incorruptible seul : case bloquée');

  gs.plateau.MN3.pions.push({ type: 'dealer', joueur: 1 });
  assert(!SpecialEntities.isZoneBlockedByIncorruptible(gs, 'MN3'),
    'un homme armé sur place lève le blocage (spec 01:137)');
});

test('déplacer un incorruptible coûte 1000L, ou 500L avec un bordel', async () => {
  const gs = await makeGame(2);
  gs.joueurs[0].ressources.lingots = 999;
  assert(!SpecialEntities.canMoveIncorruptible(gs, 0).ok, '999L ne suffisent pas sans bordel');

  gs.plateau.MN4.construction = 'bordel';
  gs.plateau.MN4.proprietaire = 0;
  const avecBordel = SpecialEntities.canMoveIncorruptible(gs, 0);
  assert(avecBordel.ok, 'le bordel doit réduire le coût');
  assertEqual(avecBordel.cost, 500, 'coût réduit attendu');
});

test('déplacer un incorruptible le retire de sa case et met à jour son déploiement', async () => {
  const gs = await makeGame(2);
  gs.joueurs[0].ressources.lingots = 1000;
  poser(gs, 'MN3', [{ type: 'incorruptible', joueur: null }]);
  gs.incorruptibles.deployes = ['MN3'];

  const res = SpecialEntities.moveIncorruptible(gs, 0, 'MN3', 'MN4');
  assert(res.ok, res.reason);
  assertEqual(gs.plateau.MN3.pions.length, 0, 'l\'incorruptible doit avoir quitté MN3');
  assertEqual(gs.plateau.MN4.pions.length, 1, 'l\'incorruptible doit être en MN4');
  assertEqual(gs.incorruptibles.deployes[0], 'MN4', 'la liste des déploiements doit suivre');
  assertEqual(gs.joueurs[0].ressources.lingots, 0, '1000L débités');
});

test('éliminer un incorruptible coûte 700L et le retire définitivement du jeu', async () => {
  const gs = await makeGame(2);
  gs.joueurs[0].ressources.lingots = 700;
  poser(gs, 'MN3', [{ type: 'incorruptible', joueur: null }]);
  gs.incorruptibles.deployes = ['MN3'];

  const res = SpecialEntities.eliminateIncorruptible(gs, 0, 'MN3');
  assert(res.ok, res.reason);
  assertEqual(gs.incorruptibles.elimines, 1, 'compteur d\'éliminations');
  assertEqual(gs.incorruptibles.deployes.length, 0, 'plus aucun déploiement');
  assertEqual(gs.joueurs[0].ressources.lingots, 0, '700L débités');
  assert(!SpecialEntities.hasIncorruptible(gs, 'MN3'), 'la case ne porte plus d\'incorruptible');
});

/* ═══════════════════════════════════════════════════════════
 *  FIN DE MANDAT
 * ═══════════════════════════════════════════════════════════ */

test('la fin de mandat éteint les effets de cartes valables pour le mandat', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  gs.joueurs[0]._verges_actif = true;
  gs.joueurs[0]._igor_actif = true;
  gs.joueurs[1]._ineligible = true;
  gs.joueurs[1]._immunite_ethnie = true;

  SpecialEntities.processEndOfMandate(gs, data.gameplay);

  assert(!gs.joueurs[0]._verges_actif, '_verges_actif doit être purgé');
  assert(!gs.joueurs[0]._igor_actif, '_igor_actif doit être purgé');
  assert(!gs.joueurs[1]._ineligible, '_ineligible doit être purgé');
  assert(!gs.joueurs[1]._immunite_ethnie, '_immunite_ethnie doit être purgé');
});

test('la fin de mandat rétablit l\'électricité coupée par une carte arrivée à terme', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const q = data.gameplay.quartiers[0];
  q.zones.forEach(zid => { gs.plateau[zid].electricite = false; });
  gs.tour = 7;
  gs.coupures_electricite = [{ source: 'carte', quartier: q.id, tour_debut: 1, duree: 3 }];

  const results = SpecialEntities.processEndOfMandate(gs, data.gameplay);
  assertEqual(gs.coupures_electricite.length, 0, 'la coupure expirée doit disparaître');
  assert(results.some(m => m.includes(q.id)), 'le rétablissement doit être journalisé');
  q.zones.forEach(zid => assert(gs.plateau[zid].electricite === true, `${zid} doit être réalimentée`));
});
