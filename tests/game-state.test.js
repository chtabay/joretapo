/**
 * JORETAPO — Tests de l'état de partie (js/game-state.js).
 *
 * Chaque test décrit une RÈGLE (de jeu ou de persistance), pas une
 * implémentation : ce qu'on a le droit de poser sur le plateau au tour 1,
 * ce qui part dans une sauvegarde, et ce qu'on accepte d'y relire.
 */

import { test, assert, assertEqual, loadData, makeGame } from './helpers.js';
import { GameState, COUT_CREATION_PION } from '../js/game-state.js';
import { MagouilleEngine } from '../js/magouille-engine.js';

const EST_ARME = t => t === 'dealer' || t === 'trafiquant';
const EST_PROSTITUEE = t => t === 'prostituee_base' || t === 'prostituee_luxe';

/** Tous les quartiers dotés de privilèges de départ (11 sur 15). */
function quartiersAvecPrivileges(data) {
  return data.gameplay.quartiers.filter(q => q.privileges_depart);
}

/** Partie à 1 joueur pour isoler un quartier donné (create accepte n'importe quel effectif). */
function partieMonoQuartier(data, quartierId) {
  const config = {
    nb_joueurs: 1,
    joueurs: [{ nom: 'Solo', ethnie: 'italien', quartier_origine: quartierId }]
  };
  return GameState.create(config, data.gameplay);
}

function nbPionsPrevus(priv) {
  return (priv.trafiquants || 0) + (priv.dealers || 0)
    + (priv.prostituees_base || 0) + (priv.prostituees_luxe || 0);
}

/** Sauvegarde nue (sans passer par localStorage). */
function etatNu(gs) {
  return JSON.parse(JSON.stringify(gs.serialize()));
}

/* ═══════════════════════════════════════════════════════════
 *  1 — Placement initial : les règles de cohabitation
 * ═══════════════════════════════════════════════════════════ */

test('aucune case ne porte deux pions armés au tour 1', async () => {
  const data = await loadData();
  quartiersAvecPrivileges(data).forEach(q => {
    const gs = partieMonoQuartier(data, q.id);
    q.zones.forEach(zid => {
      const armes = gs.plateau[zid].pions.filter(p => EST_ARME(p.type));
      assert(armes.length <= 1,
        `${q.id} / ${zid} : ${armes.length} pions armés sur la même case (règle : 1 maximum)`);
    });
  });
});

test('aucune case ne porte deux prostituées au tour 1', async () => {
  const data = await loadData();
  quartiersAvecPrivileges(data).forEach(q => {
    const gs = partieMonoQuartier(data, q.id);
    q.zones.forEach(zid => {
      const putes = gs.plateau[zid].pions.filter(p => EST_PROSTITUEE(p.type));
      assert(putes.length <= 1,
        `${q.id} / ${zid} : ${putes.length} prostituées sur la même case (règle : 1 maximum)`);
    });
  });
});

test('les pions de départ occupent le plus de cases possible du quartier', async () => {
  const data = await loadData();
  quartiersAvecPrivileges(data).forEach(q => {
    const gs = partieMonoQuartier(data, q.id);
    const poses = q.zones.reduce((n, zid) => n + gs.plateau[zid].pions.length, 0);
    const occupees = q.zones.filter(zid => gs.plateau[zid].pions.length > 0).length;
    assertEqual(occupees, Math.min(q.zones.length, poses),
      `${q.id} : ${poses} pions posés sur ${q.zones.length} cases devraient occuper ` +
      `${Math.min(q.zones.length, poses)} cases distinctes (obtenu ${occupees})`);
  });
});

test('tous les pions de départ sont posés dans le quartier d\'origine', async () => {
  const data = await loadData();
  quartiersAvecPrivileges(data).forEach(q => {
    const gs = partieMonoQuartier(data, q.id);
    Object.entries(gs.plateau).forEach(([zid, z]) => {
      const miens = z.pions.filter(p => p.joueur === 0);
      if (miens.length > 0) {
        assert(q.zones.includes(zid), `${q.id} : pion posé hors du quartier (${zid})`);
      }
    });
  });
});

test('un pion de départ sans case légale est indemnisé à son coût de création', async () => {
  const data = await loadData();
  // Harlem : 5 pions armés (3 trafiquants + 2 dealers) pour 3 cases seulement.
  const q = data.gameplay.quartiers.find(x => x.id === 'harlem');
  const priv = q.privileges_depart;
  const gs = partieMonoQuartier(data, 'harlem');
  const j = gs.joueurs[0];

  const poses = q.zones.reduce((n, zid) => n + gs.plateau[zid].pions.length, 0);
  const manquants = nbPionsPrevus(priv) - poses;
  assert(manquants > 0, 'Harlem doit bien avoir des pions non plaçables (sinon ce test n\'a plus d\'objet)');
  assertEqual(manquants, 2, 'Harlem : 5 pions armés pour 3 cases → 2 pions non plaçables');

  const attenduLingots = Math.max(priv.lingots || 0, GameState.MIN_START_LINGOTS)
    + manquants * COUT_CREATION_PION.dealer.lingots;
  const attenduArmes = (priv.armes || 0) + manquants * COUT_CREATION_PION.dealer.armes;
  assertEqual(j.ressources.lingots, attenduLingots, 'Harlem : indemnisation en lingots');
  assertEqual(j.ressources.armes, attenduArmes, 'Harlem : indemnisation en armes');
});

test('un joueur ne perd jamais son bonus de cartes magouille à la création', async () => {
  const data = await loadData();
  // north_hudson et jersey_city donnent cartes_magouille_bonus = 1.
  quartiersAvecPrivileges(data).forEach(q => {
    const gs = partieMonoQuartier(data, q.id);
    assertEqual(gs.joueurs[0].cartes_magouille_bonus, q.privileges_depart.cartes_magouille_bonus || 0,
      `${q.id} : le bonus de cartes magouille du quartier doit rester dans l'état`);
  });
  const avecBonus = quartiersAvecPrivileges(data)
    .filter(q => (q.privileges_depart.cartes_magouille_bonus || 0) > 0);
  assert(avecBonus.length > 0, 'au moins un quartier doit accorder un bonus de cartes (données)');
});

test('aucun champ de travail ne subsiste sur les joueurs après la création', async () => {
  const gs = await makeGame(4);
  gs.joueurs.forEach(j => {
    assertEqual(j.pions_initiaux, undefined, 'pions_initiaux ne doit pas rester dans l\'état');
  });
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Sérialisation : ce qui part dans la sauvegarde et le lien
 * ═══════════════════════════════════════════════════════════ */

test('les caches volatils (préfixe _) ne sont jamais sérialisés', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  assert(gs._cartes_index && Object.keys(gs._cartes_index).length > 0,
    'préalable : l\'index des cartes doit exister en mémoire');

  gs._scratch = { peu_importe: true };
  const nu = gs.serialize();
  Object.keys(nu).forEach(k =>
    assert(!k.startsWith('_'), `clé volatile sérialisée : ${k}`));
});

test('initialiser le deck ne fait pas exploser la taille de la sauvegarde', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  const avant = JSON.stringify(gs.serialize()).length;
  MagouilleEngine.initDeck(gs, data.cartes);
  const apres = JSON.stringify(gs.serialize()).length;

  // La pile de 65 uid ajoute quelques centaines d'octets ; l'index des
  // définitions (~72 Ko) ne doit PAS s'y retrouver.
  assert(apres - avant < 4000,
    `le deck ajoute ${apres - avant} octets à la sauvegarde (attendu < 4000 : l'index ne doit pas être sérialisé)`);
  assert(apres < 40000,
    `sauvegarde de ${apres} octets : trop lourde pour un lien de partage / QR code`);
});

test('l\'index des cartes est reconstruit après un aller-retour de sauvegarde', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  MagouilleEngine.initDeck(gs, data.cartes);
  const uid = gs.deck_magouille.pile[0];
  assert(uid, 'préalable : la pile doit contenir au moins une carte');

  gs.save(3);
  const relu = GameState.load(3);
  assert(relu, 'la sauvegarde doit se relire');
  assertEqual(relu._cartes_index, undefined, 'l\'index ne doit pas être présent au chargement');

  const carte = MagouilleEngine.getCardDef(relu, uid, data.cartes);
  assert(carte && carte.uid === uid,
    'le moteur doit savoir reconstruire la définition d\'une carte après rechargement');
  GameState.deleteSave(3);
});

test('un état rechargé reste un vrai GameState (méthodes disponibles)', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  gs.save(4);
  const relu = GameState.load(4);
  assert(relu instanceof GameState, 'load doit rendre une instance de GameState');
  assertEqual(typeof relu.getPlayerPoints, 'function', 'les méthodes doivent être disponibles');
  assertEqual(
    relu.getQuartierOwner(gs.joueurs[0].quartier_origine, data.gameplay),
    gs.getQuartierOwner(gs.joueurs[0].quartier_origine, data.gameplay),
    'le plateau rechargé doit donner les mêmes propriétaires');
  GameState.deleteSave(4);
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Version et migration
 * ═══════════════════════════════════════════════════════════ */

test('une sauvegarde du schéma courant est acceptée telle quelle', async () => {
  const gs = await makeGame(2);
  const res = GameState.deserialize(etatNu(gs));
  assertEqual(res.ok, true, 'une sauvegarde 2.0 doit être acceptée');
  assertEqual(res.reason, 'a_jour', 'aucune migration nécessaire');
  assertEqual(res.state.version, GameState.VERSION, 'version conservée');
});

test('une sauvegarde plus récente que le jeu est refusée avec un message', async () => {
  const gs = await makeGame(2);
  const nu = etatNu(gs);
  nu.version = '99.0';
  const res = GameState.deserialize(nu);
  assertEqual(res.ok, false, 'une sauvegarde du futur ne doit pas être chargée');
  assertEqual(res.reason, 'version_future', 'motif du refus');
  assert(typeof res.msg === 'string' && res.msg.length > 0, 'un message utilisateur est obligatoire');
  assertEqual(res.state, undefined, 'aucun état ne doit être produit');
});

test('une sauvegarde d\'un format inconnu est refusée sans lever d\'exception', async () => {
  ['banane', '', 'v2', 2, {}].forEach(v => {
    const res = GameState.deserialize({ version: v, joueurs: [], plateau: {} });
    assertEqual(res.ok, false, `version « ${String(v)} » : refus attendu`);
  });
  assertEqual(GameState.deserialize(null).ok, false, 'null : refus attendu');
  assertEqual(GameState.deserialize('coucou').ok, false, 'chaîne : refus attendu');
  assertEqual(GameState.deserialize({ version: '2.0' }).ok, false,
    'sans joueurs ni plateau : refus attendu');
});

test('une sauvegarde antérieure est migrée : aucun champ ne reste undefined', async () => {
  const gs = await makeGame(3);
  const nu = etatNu(gs);

  // Simule une sauvegarde d'avant le schéma 2.0 : pas de version, champs absents.
  delete nu.version;
  delete nu.gangs_actifs;
  delete nu.contrats;
  delete nu.caisses;
  delete nu.deck_magouille;
  delete nu.incorruptibles;
  nu.joueurs.forEach(j => {
    delete j.cartes_magouille;
    delete j.nb_coupole_restantes;
    delete j.electeurs_bonus;
  });

  const res = GameState.deserialize(nu);
  assertEqual(res.ok, true, `la migration doit réussir (${res.msg})`);
  assertEqual(res.reason, 'migre', 'la migration doit être signalée');
  const s = res.state;
  assertEqual(s.version, GameState.VERSION, 'la version est remise à jour');
  assert(s.gangs_actifs && typeof s.gangs_actifs === 'object', 'gangs_actifs reconstruit');
  assert(Array.isArray(s.contrats), 'contrats reconstruit');
  assertEqual(s.caisses.zurich_bank, 0, 'caisses reconstruites');
  assert(Array.isArray(s.deck_magouille.pile), 'deck reconstruit');
  s.joueurs.forEach(j => {
    assert(Array.isArray(j.cartes_magouille), 'main de cartes reconstruite');
    assertEqual(j.nb_coupole_restantes, 2, 'coupoles reconstruites');
    assertEqual(j.electeurs_bonus, 0, 'électeurs bonus reconstruits');
  });
});

test('un état migré reste exploitable par les lectures de partie', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  const nu = etatNu(gs);
  delete nu.version;
  delete nu.maire;
  const s = GameState.deserialize(nu).state;
  // Sans migration, this.maire.joueur_id levait un TypeError bien plus tard en partie.
  const pts = s.getPlayerPoints(0, data.gameplay);
  assert(Number.isFinite(pts), 'les points doivent rester calculables après migration');
});

test('les caches volatils d\'une vieille sauvegarde sont jetés au chargement', async () => {
  const gs = await makeGame(2);
  const nu = etatNu(gs);
  nu._cartes_index = { vieux: { texte_original: 'x'.repeat(500) } };
  const s = GameState.deserialize(nu).state;
  assertEqual(s._cartes_index, undefined, 'un index hérité d\'une vieille sauvegarde doit être ignoré');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Persistance : jamais d'exception qui fige la partie
 * ═══════════════════════════════════════════════════════════ */

test('une sauvegarde corrompue ne fait pas planter le jeu', async () => {
  localStorage.setItem(`${GameState.SAVE_KEY}-5`, '{ceci n\'est pas du JSON');
  assertEqual(GameState.load(5), null, 'load doit rendre null, pas lever');
  assertEqual(GameState.hasSave(5), false,
    '« Continuer » ne doit pas être proposé pour une sauvegarde illisible');
  GameState.deleteSave(5);
});

test('une sauvegarde du futur n\'est pas proposée au chargement', async () => {
  const gs = await makeGame(2);
  const nu = etatNu(gs);
  nu.version = '99.0';
  localStorage.setItem(`${GameState.SAVE_KEY}-6`, JSON.stringify(nu));
  assertEqual(GameState.hasSave(6), false, 'hasSave doit refuser une version incompatible');
  assertEqual(GameState.load(6), null, 'load doit rendre null');
  assert(GameState.dernierChargement && GameState.dernierChargement.msg,
    'le motif du refus doit rester consultable pour l\'interface');
  GameState.deleteSave(6);
});

test('un stockage indisponible ne fige pas la partie', async () => {
  const gs = await makeGame(2);
  const vrai = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('SecurityError'); },
    setItem() { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; },
    removeItem() { throw new Error('SecurityError'); }
  };
  try {
    const res = gs.save();
    assertEqual(res.ok, false, 'save doit signaler l\'échec au lieu de lever');
    assert(typeof res.msg === 'string' && res.msg.length > 0, 'message utilisateur attendu');
    assertEqual(GameState.hasSave(), false, 'hasSave doit rendre false sans lever');
    assertEqual(GameState.load(), null, 'load doit rendre null sans lever');
  } finally {
    globalThis.localStorage = vrai;
  }
});

test('sauvegarder puis relire conserve la partie à l\'identique', async () => {
  const gs = await makeGame(4);
  const res = gs.save(7);
  assertEqual(res.ok, true, 'la sauvegarde doit réussir');
  assertEqual(GameState.hasSave(7), true, 'la sauvegarde doit être détectée');
  const relu = GameState.load(7);
  assertEqual(JSON.stringify(relu.plateau), JSON.stringify(gs.plateau), 'plateau identique');
  assertEqual(JSON.stringify(relu.joueurs), JSON.stringify(gs.joueurs), 'joueurs identiques');
  GameState.deleteSave(7);
  assertEqual(GameState.hasSave(7), false, 'la sauvegarde doit avoir disparu');
});
