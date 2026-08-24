/**
 * JORETAPO — Tests du moteur économique (js/revenue-engine.js).
 *
 * Chaque test décrit une RÈGLE du jeu, pas une implémentation :
 * approvisionnement (stock commun vs dotation personnelle), constructions
 * (où l'on peut bâtir, ce que ça coûte, ce que ça prend) et revenus
 * (qui encaisse quoi, et ce qu'un flic coupe).
 */

import { test, assert, assertEqual, loadData, makeGame, simulateGame } from './helpers.js';
import {
  RevenueEngine,
  BUY_PRICE,
  SELL_PRICE,
  CONSTRUCTION_DEFS,
  CONSTRUCTION_REVENUE
} from '../js/revenue-engine.js';

/* ═══════════════════════════════════════════════════════════
 *  Outils de scénario
 * ═══════════════════════════════════════════════════════════ */

/** Plateau vierge : ni pion, ni construction, ni propriétaire. Trésor identique. */
function preparer(gs, lingots = 5000) {
  Object.values(gs.plateau).forEach(z => {
    z.pions = [];
    z.proprietaire = null;
    z.construction = null;
    z.electricite = true;
    delete z.bordel_triangle;
  });
  gs.joueurs.forEach(j => { j.ressources = { lingots, doses: 0, armes: 0 }; });
  gs.caisses = { zurich_bank: 0, hotel_police: 0 };
}

function poser(gs, zid, pid, type) {
  gs.plateau[zid].pions.push({ type, joueur: pid });
  if (type !== 'flic') gs.plateau[zid].proprietaire = pid;
}

/** Premier triplet de cases réelles mutuellement adjacentes. */
function trouverTriangle(data) {
  for (const a of Object.keys(data.gameplay.zones)) {
    const voisins = (data.adjacences[a] || []).filter(z => data.gameplay.zones[z]);
    for (let i = 0; i < voisins.length; i++) {
      for (let j = i + 1; j < voisins.length; j++) {
        if ((data.adjacences[voisins[i]] || []).includes(voisins[j])) {
          return [a, voisins[i], voisins[j]];
        }
      }
    }
  }
  return null;
}

/** Case réelle sans lien avec les zones fournies. */
function zoneEloignee(data, exclues) {
  const interdites = new Set(exclues.flatMap(z => [z, ...(data.adjacences[z] || [])]));
  return Object.keys(data.gameplay.zones).find(z => !interdites.has(z) &&
    data.gameplay.zones[z].facilite !== 'cimetiere');
}

const zonesParFacilite = (data, f) =>
  Object.entries(data.gameplay.zones).filter(([, z]) => z.facilite === f).map(([zid]) => zid);

/** Fige l'ordre de service des joueurs (le moteur mélange via Math.random). */
function ordreNaturel(fn) {
  const original = Math.random;
  Math.random = () => 0.999;
  try { return fn(); } finally { Math.random = original; }
}

const lingots = (gs, pid) => gs.joueurs[pid].ressources.lingots;

/* ═══════════════════════════════════════════════════════════
 *  1 — Approvisionnement : stock commun et dotation personnelle
 * ═══════════════════════════════════════════════════════════ */

test('une commande écrête au stock du point au lieu de refuser la ligne', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const port = zonesParFacilite(data, 'port')[0];

  const log = RevenueEngine.processSupplyOrders(
    gs, { 0: [{ type: 'approvisionner', point: port, denree: 'armes', quantite: 99 }] },
    data.gameplay, data.adjacences
  );

  assertEqual(gs.joueurs[0].ressources.armes, 10, 'le port ne livre que son plafond de 10 armes');
  assertEqual(lingots(gs, 0), 5000 - 10 * BUY_PRICE.armes, 'seules les armes livrées sont payées');
  assert(log.some(l => l.type === 'buy'), 'la commande écrêtée reste une commande servie');
});

test('la dotation d\'une administration ne peut pas être asséchée par un adversaire', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const port = zonesParFacilite(data, 'port')[0];
  const [ambassade] = zonesParFacilite(data, 'ambassade');
  const [douanes] = zonesParFacilite(data, 'douanes');
  const [immigration] = zonesParFacilite(data, 'immigration');

  gs.plateau[ambassade].proprietaire = 0;   // J0 : +20 armes de dotation
  gs.plateau[douanes].proprietaire = 0;
  gs.plateau[immigration].proprietaire = 1; // J1 : +10 armes de dotation

  ordreNaturel(() => RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'approvisionner', point: port, denree: 'armes', quantite: 30 }],
    1: [{ type: 'approvisionner', point: port, denree: 'armes', quantite: 10 }]
  }, data.gameplay, data.adjacences));

  assertEqual(gs.joueurs[0].ressources.armes, 30, 'J0 sert 10 armes du port + 20 de sa dotation');
  assertEqual(gs.joueurs[1].ressources.armes, 10,
    'le port est vide mais la dotation personnelle de J1 reste intacte (stock commun jamais négatif)');
});

test('la dotation des administrations vaut pour le tour entier, pas pour chaque point', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const ports = zonesParFacilite(data, 'port');
  assert(ports.length >= 2, 'il faut au moins deux ports pour ce test');
  gs.plateau[zonesParFacilite(data, 'ambassade')[0]].proprietaire = 0; // +10 armes

  RevenueEngine.processSupplyOrders(gs, {
    0: [
      { type: 'approvisionner', point: ports[0], denree: 'armes', quantite: 20 },
      { type: 'approvisionner', point: ports[1], denree: 'armes', quantite: 20 }
    ]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.joueurs[0].ressources.armes, 10 + 10 + 10,
    'deux ports (10+10) plus UNE seule fois la dotation de +10, pas +10 par point');
});

test('une ligne de commande absurde ne livre rien et ne coûte rien', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const port = zonesParFacilite(data, 'port')[0];

  RevenueEngine.processSupplyOrders(gs, {
    0: [
      { type: 'approvisionner', point: port, denree: 'armes', quantite: 0 },
      { type: 'approvisionner', point: port, denree: 'armes', quantite: -5 },
      { type: 'approvisionner', point: port, denree: 'prostituee_luxe', quantite: 3 },
      { type: 'approvisionner', point: port, denree: 'lingots', quantite: 100 }
    ]
  }, data.gameplay, data.adjacences);

  assertEqual(lingots(gs, 0), 5000, 'aucun lingot dépensé');
  assertEqual(gs.joueurs[0].ressources.armes, 0, 'aucune arme livrée');
  assertEqual(gs.joueurs[0].ressources.doses, 0, 'aucune dose livrée');
});

test('le labo de raffinage divise par deux le prix de la dose', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const port = zonesParFacilite(data, 'port')[0];
  const zoneLabo = zoneEloignee(data, [port]);
  gs.plateau[zoneLabo].construction = 'labo';
  gs.plateau[zoneLabo].proprietaire = 0;

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'approvisionner', point: port, denree: 'doses', quantite: 10 }]
  }, data.gameplay, data.adjacences);
  assertEqual(gs.joueurs[0].ressources.doses, 10, 'les 10 doses sont livrées');
  assertEqual(5000 - lingots(gs, 0), 10 * (BUY_PRICE.doses / 2), 'avec labo, la dose coûte moitié prix');

  const gs2 = await makeGame(2, { data });
  preparer(gs2);
  RevenueEngine.processSupplyOrders(gs2, {
    0: [{ type: 'approvisionner', point: port, denree: 'doses', quantite: 10 }]
  }, data.gameplay, data.adjacences);
  assertEqual(5000 - lingots(gs2, 0), 10 * BUY_PRICE.doses, 'sans labo, plein tarif');
});

test('les armes des gitans coûtent le prix fort', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const ile = data.gameplay.iles[0].id;

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'approvisionner', point: ile, denree: 'armes', quantite: 5 }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.joueurs[0].ressources.armes, 5, 'le camp de gitans a un stock illimité');
  assertEqual(lingots(gs, 0), 5000 - 5 * BUY_PRICE.armes_gitans, 'facturé au tarif gitan');
  assert(BUY_PRICE.armes_gitans > BUY_PRICE.armes * 2, 'revendre des armes gitanes doit rester une perte');
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Recrutement
 * ═══════════════════════════════════════════════════════════ */

test('on ne recrute une prostituée que sur une case que l\'on contrôle', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const aeroport = zonesParFacilite(data, 'aeroport')[0];
  const chezJ1 = zoneEloignee(data, [aeroport]);
  poser(gs, chezJ1, 1, 'trafiquant');

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'recruter', point: aeroport, pion_type: 'prostituee_base', zone_dest: chezJ1 }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.plateau[chezJ1].proprietaire, 1, 'la case reste à son occupant');
  assertEqual(gs.plateau[chezJ1].pions.length, 1, 'aucune prostituée parachutée chez l\'adversaire');
  assertEqual(lingots(gs, 0), 5000, 'ordre refusé, rien de débité');
});

test('une case ne porte jamais deux prostituées', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const aeroport = zonesParFacilite(data, 'aeroport')[0];
  const chezJ0 = zoneEloignee(data, [aeroport]);
  poser(gs, chezJ0, 0, 'prostituee_base');

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'recruter', point: aeroport, pion_type: 'prostituee_luxe', zone_dest: chezJ0 }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.plateau[chezJ0].pions.filter(p => p.type.startsWith('prostituee')).length, 1,
    'une seule prostituée par case (décision 06:17)');
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Où l'on peut bâtir
 * ═══════════════════════════════════════════════════════════ */

test('on ne bâtit pas sur un cimetière', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const cimetiere = zonesParFacilite(data, 'cimetiere')[0];
  assert(cimetiere, 'la carte doit contenir au moins un cimetière');
  poser(gs, cimetiere, 0, 'dealer');

  const log = RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: cimetiere, batiment: 'restaurant' }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.plateau[cimetiere].construction, null, 'aucune construction sur un cimetière');
  assertEqual(lingots(gs, 0), 5000, 'rien de débité');
  assert(log.some(l => l.type === 'warn' && /cimeti/i.test(l.msg)), 'le refus est motivé');
});

test('on ne bâtit pas sur un camp de gitans', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const ile = data.gameplay.iles[0].id;
  poser(gs, ile, 0, 'dealer');

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: ile, batiment: 'restaurant' }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.plateau[ile].construction, null, 'les gitans bloquent la construction (spec 01:138)');
  assertEqual(lingots(gs, 0), 5000, 'rien de débité');
});

test('on ne bâtit pas sur une case tenue par un homme armé adverse', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'prostituee_base');
  gs.plateau[zone].pions.push({ type: 'trafiquant', joueur: 1 });

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone, batiment: 'restaurant' }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.plateau[zone].construction, null, 'un adversaire armé interdit le chantier');
  assertEqual(lingots(gs, 0), 5000, 'rien de débité');
});

test('construire débite le joueur et alimente la Zurich Bank et la police', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'dealer');

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone, batiment: 'tripot' }]
  }, data.gameplay, data.adjacences);

  const d = CONSTRUCTION_DEFS.tripot;
  assertEqual(gs.plateau[zone].construction, 'tripot', 'le tripot est bâti');
  assertEqual(lingots(gs, 0), 5000 - d.total, 'le coût total est débité');
  assertEqual(gs.caisses.zurich_bank, d.z, 'la Zurich Bank encaisse sa part');
  assertEqual(gs.caisses.hotel_police, d.p, 'la police encaisse son bakchich');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Le bordel
 * ═══════════════════════════════════════════════════════════ */

test('le bordel se bâtit sur l\'une des 3 cases de son triangle, pas à l\'autre bout de la carte', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const [a, b, c] = trouverTriangle(data);
  [a, b, c].forEach(z => poser(gs, z, 0, 'prostituee_luxe'));
  const ailleurs = zoneEloignee(data, [a, b, c]);
  poser(gs, ailleurs, 0, 'dealer');

  const log = RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: ailleurs, batiment: 'bordel' }]
  }, data.gameplay, data.adjacences);

  assertEqual(gs.plateau[ailleurs].construction, null, 'pas de bordel hors du triangle');
  assertEqual(lingots(gs, 0), 5000, 'rien de débité');
  assert(log.some(l => l.type === 'warn'), 'le refus est journalisé');

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: a, batiment: 'bordel' }]
  }, data.gameplay, data.adjacences);
  assertEqual(gs.plateau[a].construction, 'bordel', 'sur une case du triangle, il se bâtit');
});

test('bâtir un bordel donne la possession des 3 cases du triangle', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const [a, b, c] = trouverTriangle(data);
  [a, b, c].forEach(z => poser(gs, z, 0, 'prostituee_luxe'));
  gs.plateau[b].proprietaire = 1; // l'adversaire revendiquait la case

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: a, batiment: 'bordel' }]
  }, data.gameplay, data.adjacences);

  [a, b, c].forEach(z => assertEqual(gs.plateau[z].proprietaire, 0,
    `la case ${z} du triangle passe au bordel (spec 06:53)`));
  assertEqual(gs.plateau[a].bordel_triangle.length, 3, 'le triangle est mémorisé');
});

test('le bordel encaisse les passes de ses 3 cases — et une seule fois', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const [a, b, c] = trouverTriangle(data);
  [a, b, c].forEach(z => poser(gs, z, 0, 'prostituee_luxe'));

  const attenduReseau = [a, b, c].reduce((s, z) => s + data.gameplay.zones[z].p * 3, 0);

  // Avant construction : les trois filles travaillent dans la rue.
  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0) - 5000, attenduReseau, 'trois prostituées de luxe = somme des passes');

  gs.joueurs[0].ressources.lingots = 5000;
  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: a, batiment: 'bordel' }]
  }, data.gameplay, data.adjacences);
  const apresChantier = lingots(gs, 0);

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0) - apresChantier, attenduReseau,
    'le bordel remplace les passes de rue de ses filles, il ne les double pas');
});

test('une fille redéployée hors du triangle rapporte à nouveau, le bordel continue de payer', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const [a, b, c] = trouverTriangle(data);
  [a, b, c].forEach(z => poser(gs, z, 0, 'prostituee_luxe'));
  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: a, batiment: 'bordel' }]
  }, data.gameplay, data.adjacences);

  const ailleurs = zoneEloignee(data, [a, b, c]);
  gs.plateau[c].pions = [];
  poser(gs, ailleurs, 0, 'prostituee_luxe');

  const attendu = [a, b, c].reduce((s, z) => s + data.gameplay.zones[z].p * 3, 0)
                + data.gameplay.zones[ailleurs].p * 3;

  gs.joueurs[0].ressources.lingots = 0;
  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0), attendu,
    'le bordel paie ses 3 cases quoi qu\'il arrive ; la fille sortie du triangle retrouve sa rue');
});

test('un casino exige un bordel', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  assertEqual(RevenueEngine.canBuild(gs, 0, 'casino', data.adjacences).ok, false,
    'pas de casino sans bordel de couverture');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — Revenus des pions
 * ═══════════════════════════════════════════════════════════ */

test('un dealer écoule au plus l\'indice D de sa case et encaisse le prix de vente', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'dealer');
  gs.joueurs[0].ressources.doses = 50;
  const d = data.gameplay.zones[zone].d;

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);

  assertEqual(gs.joueurs[0].ressources.doses, 50 - d, 'il n\'écoule que l\'indice D du bloc');
  assertEqual(lingots(gs, 0), d * SELL_PRICE.dose, 'chaque dose est vendue au prix de vente');
  assert(SELL_PRICE.dose > BUY_PRICE.doses, 'revendre de la drogue doit rester rentable');
});

test('un trafiquant écoule au plus l\'indice A de sa case', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'trafiquant');
  gs.joueurs[0].ressources.armes = 50;
  const a = data.gameplay.zones[zone].a;

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);

  assertEqual(gs.joueurs[0].ressources.armes, 50 - a, 'il n\'écoule que l\'indice A du bloc');
  assertEqual(lingots(gs, 0), a * SELL_PRICE.arme, 'chaque arme est vendue au prix de vente');
});

test('une prostituée de luxe rapporte le triple d\'une classique sur la même case', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'prostituee_base');
  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  const base = lingots(gs, 0);

  gs.plateau[zone].pions = [];
  gs.joueurs[0].ressources.lingots = 0;
  poser(gs, zone, 0, 'prostituee_luxe');
  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);

  assertEqual(lingots(gs, 0), base * 3, 'passe de luxe = 3 lingots contre 1 (spec 01:86-87)');
});

test('une coupure d\'électricité prive la case de tout revenu', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'prostituee_luxe');
  gs.plateau[zone].construction = 'tripot';
  gs.plateau[zone].electricite = false;

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0), 0, 'sans courant, ni passes ni tripot');
});

/* ═══════════════════════════════════════════════════════════
 *  6 — Les flics coupent les revenus
 * ═══════════════════════════════════════════════════════════ */

test('un flic adverse coupe aussi les revenus d\'une construction', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  poser(gs, zone, 0, 'dealer');
  gs.plateau[zone].construction = 'tripot';
  gs.plateau[zone].proprietaire = 0;
  gs.plateau[zone].pions.push({ type: 'flic', joueur: 1 });

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0), 0, 'le flic bloque la case, bâtiment compris (spec 01:136)');
});

test('le casino est insensible aux flics normaux', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  gs.plateau[zone].construction = 'casino';
  gs.plateau[zone].proprietaire = 0;
  gs.plateau[zone].pions.push({ type: 'flic', joueur: 1 });

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0), CONSTRUCTION_REVENUE.casino, 'le casino paie malgré le flic (spec 01:153)');
});

test('son propre flic ne coupe pas ses revenus', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const zone = zoneEloignee(data, []);
  gs.plateau[zone].construction = 'tripot';
  gs.plateau[zone].proprietaire = 0;
  gs.plateau[zone].pions.push({ type: 'flic', joueur: 0 });

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  assertEqual(lingots(gs, 0), CONSTRUCTION_REVENUE.tripot, 'le flic corrompu travaille pour son patron');
});

test('un flic sur une case du triangle ampute d\'autant le bordel', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs);
  const [a, b, c] = trouverTriangle(data);
  [a, b, c].forEach(z => poser(gs, z, 0, 'prostituee_luxe'));
  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: a, batiment: 'bordel' }]
  }, data.gameplay, data.adjacences);

  gs.plateau[c].pions.push({ type: 'flic', joueur: 1 });
  gs.joueurs[0].ressources.lingots = 0;
  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);

  const attendu = data.gameplay.zones[a].p * 3 + data.gameplay.zones[b].p * 3;
  assertEqual(lingots(gs, 0), attendu, 'la case tenue par le flic ne rapporte plus rien au réseau');
});

/* ═══════════════════════════════════════════════════════════
 *  7 — Équilibrage : la montée en puissance existe
 * ═══════════════════════════════════════════════════════════ */

test('le tripot rapporte plus que le restaurant, à rentabilité comparable', async () => {
  assert(CONSTRUCTION_REVENUE.tripot > CONSTRUCTION_REVENUE.restaurant,
    'un tripot coûte 140L contre 80L : il doit rapporter davantage, sinon personne ne le bâtit');
  const amorti = b => CONSTRUCTION_DEFS[b].total / CONSTRUCTION_REVENUE[b];
  assert(Math.abs(amorti('tripot') - amorti('restaurant')) <= 2,
    'les deux bâtiments de rente doivent s\'amortir en un nombre de tours voisin');
});

test('toute construction de rente s\'amortit en moins de 8 tours', () => {
  ['restaurant', 'tripot', 'casino'].forEach(b => {
    const tours = CONSTRUCTION_DEFS[b].total / CONSTRUCTION_REVENUE[b];
    assert(tours <= 8, `${b} s'amortit en ${tours.toFixed(1)} tours : trop lent pour une partie de 14 à 21 tours`);
  });
});

test('investir fait décoller le revenu : un quartier équipé rapporte plus que les seuls pions', async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  preparer(gs, 0);
  const [a, b, c] = trouverTriangle(data);
  poser(gs, a, 0, 'dealer');
  poser(gs, b, 0, 'trafiquant');
  poser(gs, c, 0, 'prostituee_base');
  gs.joueurs[0].ressources.doses = 99;
  gs.joueurs[0].ressources.armes = 99;

  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);
  const brut = lingots(gs, 0);

  gs.plateau[a].construction = 'tripot';
  gs.plateau[c].construction = 'restaurant';
  gs.joueurs[0].ressources.lingots = 0;
  gs.joueurs[0].ressources.doses = 99;
  gs.joueurs[0].ressources.armes = 99;
  RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences);

  assertEqual(lingots(gs, 0), brut + CONSTRUCTION_REVENUE.tripot + CONSTRUCTION_REVENUE.restaurant,
    'les bâtiments s\'ajoutent aux pions : la rente est la vraie montée en puissance');
});

/* ═══════════════════════════════════════════════════════════
 *  8 — Périmètre du moteur
 * ═══════════════════════════════════════════════════════════ */

test('le moteur économique ne déplace aucun pion (c\'est le rôle de ConflictResolver)', () => {
  assertEqual(typeof RevenueEngine.processMovements, 'undefined',
    'processMovements était du code mort doublonnant conflict-resolver.js');
});

test('une partie complète traverse le moteur économique sans casse', async () => {
  const data = await loadData();
  const r = await simulateGame(4, 12, { data, graine: 20260823 });
  r.gs.joueurs.forEach(j => {
    assert(j.ressources.lingots >= 0, `${j.nom} : lingots négatifs`);
    assert(j.ressources.doses >= 0, `${j.nom} : doses négatives`);
    assert(j.ressources.armes >= 0, `${j.nom} : armes négatives`);
  });
  assert(r.tours >= 12, 'la simulation doit aller au bout des 12 tours');
});
