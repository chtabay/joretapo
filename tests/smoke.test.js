/**
 * JORETAPO — Tests de fumée.
 *
 * Ces tests doivent passer sur le code ACTUEL, bugs inclus : ils vérifient que
 * les données se chargent, qu'une partie se crée, que l'automate de tour
 * enchaîne ses 13 phases et que le plateau est cohérent au tour 1.
 *
 * Les `test.connu(...)` documentent des bugs confirmés par l'audit : ils
 * s'affichent en jaune et ne font jamais échouer la suite. Quand un bug est
 * corrigé, le test bascule en échec jaune → le reclasser en `test(...)`.
 */

import {
  test, assert, assertEqual, assertClose, assertThrows,
  loadData, makeGame, simulateGame
} from './helpers.js';

import { PHASE } from '../js/turn-manager.js';

const NB_ZONES = 74;
const NB_ILES = 4;
const NB_QUARTIERS = 15;

/* ═══════════════════════════════════════════════════════════
 *  1 — Chargement des données
 * ═══════════════════════════════════════════════════════════ */

test('loadData charge les 4 fichiers de data/', async () => {
  const data = await loadData();
  ['geo', 'adjacences', 'gameplay', 'cartes'].forEach(k =>
    assert(data[k], `loadData() doit exposer « ${k} »`));
});

test('le GeoJSON expose une feature par zone jouable', async () => {
  const { geo } = await loadData();
  assertEqual(geo.type, 'FeatureCollection', 'quartiers-osm.geojson doit être une FeatureCollection');
  assert(Array.isArray(geo.features), 'geo.features doit être un tableau');
  assert(geo.features.length >= NB_ZONES,
    `geo.features doit couvrir au moins les ${NB_ZONES} zones (obtenu ${geo.features.length})`);
});

test('quartiers-gameplay.json a 15 quartiers, 74 zones et 4 îles', async () => {
  const { gameplay } = await loadData();
  assertEqual(gameplay.quartiers.length, NB_QUARTIERS, 'nombre de quartiers');
  assertEqual(Object.keys(gameplay.zones).length, NB_ZONES, 'nombre de zones');
  assertEqual((gameplay.iles || []).length, NB_ILES, "nombre d'îles");

  gameplay.quartiers.forEach(q => {
    assert(typeof q.id === 'string' && q.id.length, 'chaque quartier a un id');
    assert(Array.isArray(q.zones) && q.zones.length > 0, `${q.id} : zones non vides`);
    assert(typeof q.points === 'number', `${q.id} : points numériques`);
    q.zones.forEach(z => assert(gameplay.zones[z], `${q.id} référence une zone inconnue : ${z}`));
  });

  Object.entries(gameplay.zones).forEach(([zid, z]) => {
    ['p', 'd', 'a'].forEach(k =>
      assert(typeof z[k] === 'number', `zone ${zid} : rendement « ${k} » manquant`));
  });
});

test('toutes les zones du plateau ont un quartier et un seul', async () => {
  const { gameplay } = await loadData();
  const vues = new Map();
  gameplay.quartiers.forEach(q => q.zones.forEach(z => {
    assert(!vues.has(z), `zone ${z} rattachée à 2 quartiers (${vues.get(z)} et ${q.id})`);
    vues.set(z, q.id);
  }));
  assertEqual(vues.size, NB_ZONES, 'toutes les zones doivent être rattachées à un quartier');
});

test('les adjacences sont symétriques et fusionnent les îles (app.js:31-38)', async () => {
  const { adjacences, gameplay } = await loadData();
  assertEqual(Object.keys(adjacences).length, NB_ZONES + NB_ILES,
    'adjacences = 74 zones + 4 îles après fusion');

  Object.entries(adjacences).forEach(([a, voisins]) => {
    voisins.forEach(b => {
      assert(adjacences[b], `${b} (voisin de ${a}) absent de la table d'adjacence`);
      assert(adjacences[b].includes(a), `adjacence non symétrique : ${a}→${b} sans ${b}→${a}`);
    });
  });

  (gameplay.iles || []).forEach(ile => {
    assert(adjacences[ile.id]?.length > 0, `l'île ${ile.id} doit être joignable`);
    ile.adjacences.forEach(z =>
      assert(adjacences[ile.id].includes(z), `${ile.id} doit être adjacente à ${z}`));
  });
});

test('cartes-magouille.json : 31 types pour 65 exemplaires', async () => {
  const { cartes } = await loadData();
  assert(Array.isArray(cartes.types), 'cartes.types doit être un tableau');
  assertEqual(cartes.types.length, 31, 'nombre de types de cartes');
  const total = cartes.types.reduce((s, t) => s + (t.quantite || 0), 0);
  assertEqual(total, 65, 'nombre total de cartes dans le deck');
  cartes.types.forEach(t => {
    assert(typeof t.id === 'string' && t.id.length, 'chaque carte a un id');
    assert(typeof t.effet === 'string', `carte ${t.id} : effet manquant`);
    assert(typeof t.phase_jouable !== 'undefined', `carte ${t.id} : phase_jouable manquante`);
  });
  const ids = cartes.types.map(t => t.id);
  assertEqual(new Set(ids).size, ids.length, 'les ids de cartes doivent être uniques');
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Création de partie (2 à 6 joueurs)
 * ═══════════════════════════════════════════════════════════ */

test('une partie de 2 à 6 joueurs se crée sans exception', async () => {
  const data = await loadData();
  for (let n = 2; n <= 6; n++) {
    const gs = await makeGame(n, { data });
    assertEqual(gs.joueurs.length, n, `partie à ${n} joueurs`);
    assertEqual(gs.tour, 1, `partie à ${n} joueurs : tour initial`);
    assertEqual(gs.phase, 1, `partie à ${n} joueurs : phase initiale`);
    assertEqual(gs.version, '2.0', 'version du GameState');
    assertEqual(Object.keys(gs.plateau).length, NB_ZONES + NB_ILES,
      `partie à ${n} joueurs : zones + îles sur le plateau`);
  }
});

test('makeGame est déterministe (même graine → même plateau)', async () => {
  const data = await loadData();
  const a = await makeGame(4, { data });
  const b = await makeGame(4, { data });
  assertEqual(JSON.stringify(a.plateau), JSON.stringify(b.plateau),
    'deux makeGame(4) doivent produire un plateau identique');
});

test('makeGame refuse un nombre de joueurs hors 2..6', async () => {
  const data = await loadData();
  await assertThrows(() => makeGame(1, { data }), 'makeGame(1) doit lever');
  await assertThrows(() => makeGame(7, { data }), 'makeGame(7) doit lever');
});

test('chaque joueur démarre avec un quartier distinct et des ressources', async () => {
  const data = await loadData();
  const gs = await makeGame(6, { data });
  const quartiers = gs.joueurs.map(j => j.quartier_origine);
  assertEqual(new Set(quartiers).size, 6, 'les quartiers d\'origine doivent être distincts');
  gs.joueurs.forEach((j, i) => {
    assertEqual(j.id, i, 'id du joueur');
    assert(j.ressources.lingots >= 20,
      `${j.nom} : plancher de départ de 20 lingots (obtenu ${j.ressources.lingots})`);
    ['lingots', 'doses', 'armes'].forEach(r =>
      assert(Number.isFinite(j.ressources[r]), `${j.nom} : ressource ${r} numérique`));
    assertEqual(j.cartes_magouille.length, 0, 'aucune carte en main au tour 1');
    assertEqual(j.est_maire, false, 'aucun maire au tour 1');
  });
});

test('chaque joueur a posé des pions dans son quartier d\'origine', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  gs.joueurs.forEach(j => {
    const q = data.gameplay.quartiers.find(x => x.id === j.quartier_origine);
    const mesPions = Object.entries(gs.plateau)
      .flatMap(([zid, z]) => z.pions.filter(p => p.joueur === j.id).map(p => ({ zid, p })));
    assert(mesPions.length > 0, `${j.nom} doit avoir au moins un pion`);
    mesPions.forEach(({ zid }) =>
      assert(q.zones.includes(zid),
        `${j.nom} : pion posé hors de son quartier d'origine (${zid} ∉ ${q.id})`));
  });
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Cohérence du plateau au tour 1
 * ═══════════════════════════════════════════════════════════ */

test('les 74 zones ont un propriétaire cohérent au tour 1', async () => {
  const data = await loadData();
  const gs = await makeGame(6, { data });
  const zones = Object.keys(data.gameplay.zones);
  assertEqual(zones.length, NB_ZONES, 'nombre de zones à vérifier');

  let occupees = 0;
  zones.forEach(zid => {
    const z = gs.plateau[zid];
    assert(z, `zone ${zid} absente du plateau`);
    assert(Array.isArray(z.pions), `zone ${zid} : pions doit être un tableau`);
    assertEqual(z.construction, null, `zone ${zid} : aucune construction au tour 1`);
    assertEqual(z.electricite, true, `zone ${zid} : électricité au tour 1`);

    const proprios = [...new Set(z.pions.map(p => p.joueur))];

    if (z.pions.length === 0) {
      assertEqual(z.proprietaire, null, `zone vide ${zid} : propriétaire doit être null`);
      return;
    }
    occupees++;
    assertEqual(proprios.length, 1,
      `zone ${zid} : au tour 1 une zone ne peut contenir que les pions d'un seul joueur`);
    assertEqual(z.proprietaire, proprios[0],
      `zone ${zid} : propriétaire incohérent avec les pions présents`);
    assert(gs.joueurs[z.proprietaire], `zone ${zid} : propriétaire ${z.proprietaire} inconnu`);
  });

  assert(occupees > 0, 'au moins une zone doit être occupée au tour 1');
});

test('les 4 îles portent les gitans et n\'appartiennent à personne', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  assertEqual(gs.gitans.positions.length, NB_ILES, 'gitans placés sur les 4 îles');
  gs.gitans.positions.forEach(zid => {
    const z = gs.plateau[zid];
    assertEqual(z.gitans, true, `${zid} : drapeau gitans`);
    assertEqual(z.proprietaire, null, `${zid} : une île n'a pas de propriétaire`);
    assert(z.pions.some(p => p.type === 'gitan'), `${zid} : pion gitan présent`);
  });
});

test('les caisses et le maire sont vides au lancement', async () => {
  const gs = await makeGame(4, { data: await loadData() });
  assertEqual(gs.caisses.zurich_bank, 0, 'caisse Zurich');
  assertEqual(gs.caisses.hotel_police, 0, 'caisse hôtel de police');
  assertEqual(gs.maire.joueur_id, null, 'aucun maire');
  assertEqual(gs.contrats.length, 0, 'aucun contrat');
  assertEqual(gs.deck_magouille.pile.length, 0, 'deck non initialisé avant la 1re élection');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Automate de tour : les 13 phases
 * ═══════════════════════════════════════════════════════════ */

test('l\'automate enchaîne les 5 phases de jeu sur un tour complet', async () => {
  const data = await loadData();
  const vues = [];
  const r = await simulateGame(3, 1, {
    data,
    surEtape: ({ phaseJeu }) => { if (vues[vues.length - 1] !== phaseJeu) vues.push(phaseJeu); }
  });
  assertEqual(r.softlock, null, 'aucun blocage sur un tour simple');
  assertEqual(r.tours, 1, 'un tour joué');
  assertEqual(vues.join('→'), '1→2→3→4→5', 'ordre des phases de jeu');
});

test('l\'automate enchaîne ses 13 phases (élection + draft compris)', async () => {
  const data = await loadData();
  const r = await simulateGame(3, 8, { data });
  assertEqual(r.softlock, null, `simulation bloquée : ${r.softlock?.raison || ''}`);

  const attendues = Object.values(PHASE);
  assertEqual(attendues.length, 13, "l'automate déclare bien 13 phases");
  attendues.forEach(p =>
    assert(r.phasesVues.includes(p), `phase jamais atteinte en 8 tours : ${p}`));
});

test('l\'élection du tour 7 élit un maire et distribue les cartes', async () => {
  const data = await loadData();
  const r = await simulateGame(4, 8, { data });
  assertEqual(r.softlock, null, 'pas de blocage avant le tour 8');
  assert(r.gs.tour >= 8, `la partie doit dépasser l'élection (tour atteint : ${r.gs.tour})`);
  assert(r.gs.deck_magouille.pile.length + r.gs.deck_magouille.defaussees.length > 0,
    'le deck Magouille doit être initialisé après l\'élection');
  r.gs.joueurs.forEach(j =>
    assertEqual(j.cartes_magouille.length, 4, `${j.nom} garde 4 cartes au draft`));
  const maire = r.gs.maire.joueur_id;
  assert(maire === null || r.gs.joueurs[maire].est_maire,
    'le maire élu doit porter le drapeau est_maire');
});

test('une simulation est rejouable à graine identique', async () => {
  const data = await loadData();
  const a = await simulateGame(4, 4, { data, graine: 4242 });
  const b = await simulateGame(4, 4, { data, graine: 4242 });
  assertEqual(JSON.stringify(a.gs.plateau), JSON.stringify(b.gs.plateau),
    'même graine → même plateau final');
  assertEqual(a.log.length, b.log.length, 'même graine → même journal');
});

test('des graines différentes produisent des parties différentes', async () => {
  const data = await loadData();
  const a = await simulateGame(4, 4, { data, graine: 1 });
  const b = await simulateGame(4, 4, { data, graine: 999 });
  assert(JSON.stringify(a.gs.plateau) !== JSON.stringify(b.gs.plateau),
    'deux graines distinctes doivent diverger');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — Invariants tenus sur plusieurs tours simulés
 * ═══════════════════════════════════════════════════════════ */

test('aucune ressource ne devient négative sur 6 tours (2 à 6 joueurs)', async () => {
  const data = await loadData();
  for (let n = 2; n <= 6; n++) {
    const r = await simulateGame(n, 6, { data, graine: 1000 + n });
    r.gs.joueurs.forEach(j => {
      ['lingots', 'doses', 'armes'].forEach(res =>
        assert(j.ressources[res] >= 0,
          `${n} joueurs — ${j.nom} : ${res} négatif (${j.ressources[res]})`));
    });
  }
});

test('le plateau reste structurellement valide après 10 tours', async () => {
  const data = await loadData();
  const r = await simulateGame(4, 10, { data, graine: 77 });
  assertEqual(Object.keys(r.gs.plateau).length, NB_ZONES + NB_ILES, 'nombre de cases');
  Object.entries(r.gs.plateau).forEach(([zid, z]) => {
    assert(Array.isArray(z.pions), `${zid} : pions doit rester un tableau`);
    z.pions.forEach(p => {
      assert(typeof p.type === 'string', `${zid} : pion sans type`);
      const idOk = p.joueur === null || (Number.isInteger(p.joueur) && r.gs.joueurs[p.joueur]);
      assert(idOk, `${zid} : pion rattaché à un joueur inexistant (${p.joueur})`);
    });
    assert(z.proprietaire === null || r.gs.joueurs[z.proprietaire],
      `${zid} : propriétaire inconnu (${z.proprietaire})`);
  });
});

test('les points de victoire restent calculables et finis', async () => {
  const data = await loadData();
  const r = await simulateGame(5, 8, { data, graine: 31 });
  r.gs.joueurs.forEach(j => {
    const pts = r.gs.getPlayerPoints(j.id, data.gameplay);
    assert(Number.isFinite(pts), `${j.nom} : points non numériques (${pts})`);
    assertClose(pts, Math.round(pts), 1e-9, `${j.nom} : les points doivent être entiers`);
  });
});

/* ═══════════════════════════════════════════════════════════
 *  6 — Bugs connus (jaune, n'échouent jamais la suite)
 * ═══════════════════════════════════════════════════════════ */

test.connu('SOFTLOCK : la pioche de draft s\'épuise à 6 joueurs vers le tour 14', async () => {
  const data = await loadData();
  const r = await simulateGame(6, 20, { data, graine: 6006, stopOnSoftlock: true });
  assert(r.softlock !== null,
    'le softlock du draft devrait encore se produire (s\'il ne se produit plus, reclasser ce test)');
  assertEqual(r.softlock.tour, 14, 'le blocage tombe à la 2e élection, tour 14');
  assert(r.softlock.cartesEnMain < 4,
    `main incomplète attendue, obtenu ${r.softlock.cartesEnMain} carte(s)`);
});

test.connu('SOFTLOCK : à 4 joueurs le draft tient plus longtemps mais casse aussi', async () => {
  const data = await loadData();
  const r = await simulateGame(4, 35, { data, graine: 4004, stopOnSoftlock: true });
  assert(r.softlock !== null, 'le deck finit aussi par s\'épuiser à 4 joueurs');
  assert(r.softlock.tour >= 21,
    `blocage attendu à partir du tour 21, obtenu tour ${r.softlock.tour}`);
});

/**
 * Scanne le plateau à chaque fin de tour d'une série de parties simulées et
 * retourne les états illégaux rencontrés. Déterministe : mêmes graines →
 * mêmes états.
 */
async function scannerEtatsIllegaux(data, configs) {
  const empilements = new Set();
  const fantomes = new Set();

  const scan = gs => {
    Object.entries(gs.plateau).forEach(([zid, z]) => {
      const armes = z.pions.filter(p => p.type === 'dealer' || p.type === 'trafiquant');
      if (armes.length > 1) {
        const joueurs = [...new Set(armes.map(p => p.joueur))];
        empilements.add(JSON.stringify({
          zone: zid,
          pions: armes.map(p => `${p.type}@J${p.joueur}`).sort(),
          allies: joueurs.length === 1
        }));
      }
      if (z.proprietaire !== null && !z.construction &&
          !z.pions.some(p => p.joueur === z.proprietaire)) {
        fantomes.add(JSON.stringify({
          zone: zid,
          proprietaire: `J${z.proprietaire}`,
          pions: z.pions.map(p => `${p.type}@J${p.joueur}`)
        }));
      }
    });
  };

  for (const { n, tours, graine } of configs) {
    await simulateGame(n, tours, {
      data, graine,
      surEtape: ({ gs, phase }) => { if (phase === PHASE.TURN_END) scan(gs); }
    });
  }
  return {
    empilements: [...empilements].map(JSON.parse),
    fantomes: [...fantomes].map(JSON.parse)
  };
}

const CONFIGS_SCAN = [
  { n: 4, tours: 12, graine: 1 },
  { n: 4, tours: 12, graine: 3 },
  { n: 6, tours: 12, graine: 1 },
  { n: 6, tours: 12, graine: 3 }
];

test.connu('RÈGLE VIOLÉE : deux pions armés se retrouvent sur la même case', async () => {
  // spec 01 : une case ne porte qu'un seul pion armé.
  // Observé en simulation : la fuite du défenseur (conflict-resolver.js:_executeFlight,
  // étape 4) est exécutée AVANT les mouvements simples et gagnants (étapes 5-6),
  // qui ont été validés sur un plateau antérieur — le fuyard et un arrivant
  // atterrissent donc sur la même case. Le filtre de fuite n'exclut par ailleurs
  // que les pions armés ENNEMIS (conflict-resolver.js:249), d'où des empilements
  // entre pions alliés.
  const data = await loadData();
  const { empilements } = await scannerEtatsIllegaux(data, CONFIGS_SCAN);
  assert(empilements.length > 0,
    'plus aucun empilement de pions armés : le bug est corrigé, reclasser ce test en test(...)');
  assert(empilements.some(e => e.allies), 'empilement entre pions alliés attendu');
});

test.connu('PROPRIÉTAIRE FANTÔME : une case sans aucun pion du propriétaire lui reste acquise', async () => {
  // conflict-resolver.js:_updateOwnership ne remet `proprietaire` à null que si
  // la case est totalement vide. Une case ne contenant plus qu'un flic ennemi
  // (les flics sont exclus du calcul des propriétaires) garde donc son ancien
  // propriétaire, qui continue d'encaisser ses points de quartier.
  const data = await loadData();
  const { fantomes } = await scannerEtatsIllegaux(data, CONFIGS_SCAN);
  assert(fantomes.length > 0,
    'plus aucun propriétaire fantôme : le bug est corrigé, reclasser ce test en test(...)');
  assert(fantomes.some(f => f.pions.every(p => p.startsWith('flic@'))),
    'cas attendu : case ne portant plus qu\'un flic');
});
