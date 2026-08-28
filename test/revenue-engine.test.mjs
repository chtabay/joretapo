/**
 * Le moteur de revenus est la boucle économique du jeu : c'est lui qui décide
 * combien chaque joueur encaisse à chaque tour, ce qu'il paie pour construire et
 * ce qu'il peut acheter aux points d'approvisionnement.
 *
 * Les règles vérifiées ici viennent de specs/01-mecaniques-de-jeu.md :
 *   - prix de vente : dose 3 lingots, arme 8 lingots, passe 1 lingot, passe de luxe 3 ;
 *   - le maximum vendable sur un bloc est l'indice D (doses), A (armes) ou P (passes) ;
 *   - un flic « bloque une case (plus de revenus) » ;
 *   - un casino rapporte 60 lingots/tour et est « insensible aux flics normaux » ;
 *   - les constructions versent leur coût à la Zurich Bank et le bakchich à la police.
 *
 * Plateau fictif (voir helpers.mjs) :
 *
 *     A1 — A2 — B1 — B2 — C1 — C2      p/d/a : A = 2/3/2   B = 3/4/3
 *                |                             C = 4/5/4   D = 3/3/3
 *               D1 — D2                 A2 porte un port (armes 10, doses 20, prost 0)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { newTestGame, place, posteAPortee, ROOT } from './helpers.mjs';

const { RevenueEngine, CONSTRUCTION_DEFS , SUPPLY_CAPS } = await import(`${ROOT}/js/revenue-engine.js`);

/** Les ressources d'un joueur, posées à plat pour que le test se lise seul. */
function dote(gs, pid, { lingots = 0, doses = 0, armes = 0 } = {}) {
  gs.joueurs[pid].ressources = { lingots, doses, armes };
}

const ress = (gs, pid) => gs.joueurs[pid].ressources;

/**
 * Le moteur mélange l'ordre des joueurs (Fisher-Yates sur Math.random) avant de
 * traiter les commandes. Plusieurs règles d'approvisionnement ne se constatent
 * que si l'on sait qui passe en premier : on neutralise le mélange le temps du
 * test. Un tirage constant proche de 1 rend chaque échange réflexif, donc
 * l'ordre reste J0 puis J1.
 */
function ordreDesJoueursFige() {
  const vrai = Math.random;
  Math.random = () => 0.9999999;
  return () => { Math.random = vrai; };
}

const appro = (point, denree, quantite) => ({ type: 'approvisionner', point, denree, quantite });

/* ── Revenus des pions ──────────────────────────────────────────────────── */

test('une prostituée rapporte un lingot par passe, soit l\'indice P de son bloc', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  place(gs, 'A1', 'prostituee_base', 0);   /* A1 : p = 2 */

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 2);
});

test('une prostituée de luxe rapporte trois lingots par passe', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  place(gs, 'C1', 'prostituee_luxe', 0);   /* C1 : p = 4 -> 4 passes à 3L */

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 12);
});

test('un dealer écoule au plus l\'indice D du bloc et sa vente entame son stock', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 10 });
  place(gs, 'C1', 'dealer', 0);            /* C1 : d = 5 */

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 15, '5 doses vendues à 3 lingots');
  assert.equal(ress(gs, 0).doses, 5, 'les doses vendues quittent le stock');
});

test('un dealer à court de marchandise ne vend que ce qu\'il a', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 2 });
  place(gs, 'C1', 'dealer', 0);            /* d = 5, mais seulement 2 doses en poche */

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 6);
  assert.equal(ress(gs, 0).doses, 0);
});

test('un dealer sans dose ne rapporte rien', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 0 });
  place(gs, 'C1', 'dealer', 0);

  const log = RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 0);
  assert.equal(log.filter(l => l.type === 'rev').length, 0, 'aucun revenu à journaliser');
});

test('un trafiquant écoule au plus l\'indice A du bloc et sa vente entame son stock', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, armes: 10 });
  place(gs, 'C1', 'trafiquant', 0);        /* C1 : a = 4 */

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 32, '4 armes vendues à 8 lingots');
  assert.equal(ress(gs, 0).armes, 6, 'les armes vendues quittent le stock');
});

test('chacun encaisse pour ses propres pions, y compris sur une zone partagée', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  dote(gs, 1, { lingots: 0 });
  place(gs, 'B1', 'prostituee_base', 0);   /* B1 : p = 3 */
  place(gs, 'B1', 'prostituee_luxe', 1);

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 3);
  assert.equal(ress(gs, 1).lingots, 9);
});

/* ── Électricité ────────────────────────────────────────────────────────── */

test('une zone privée d\'électricité ne produit plus rien', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 10 });
  place(gs, 'C1', 'dealer', 0);
  place(gs, 'C1', 'prostituee_luxe', 0);
  gs.plateau['C1'].construction = 'restaurant';
  gs.plateau['C1'].proprietaire = 0;
  gs.plateau['C1'].electricite = false;

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 0, 'ni les pions ni la construction ne rapportent');
  assert.equal(ress(gs, 0).doses, 10, 'et rien n\'est consommé');
});

/* ── Flics ──────────────────────────────────────────────────────────────── */

test('un flic bloque les revenus de la zone', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 10 });
  place(gs, 'C1', 'dealer', 0);
  place(gs, 'C1', 'flic', 1);

  const log = RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 0, 'le dealer ne vend rien sous surveillance');
  assert.equal(ress(gs, 0).doses, 10, 'et conserve sa marchandise');
  assert.ok(log.some(l => l.type === 'flic'), 'le blocage est journalisé');
});

test('un flic ne bloque pas le joueur qui l\'a posé', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 10 });
  dote(gs, 1, { lingots: 0, doses: 10 });
  place(gs, 'C1', 'dealer', 0);
  place(gs, 'C1', 'prostituee_base', 1);
  place(gs, 'C1', 'flic', 1);              /* le flic appartient à J1 */

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 0, 'J0 est bloqué');
  assert.equal(ress(gs, 1).lingots, 4, 'J1, propriétaire du flic, encaisse ses 4 passes');
});

test('un casino est insensible au flic : toute la zone continue de produire', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0, doses: 10 });
  place(gs, 'C1', 'dealer', 0);
  place(gs, 'C1', 'flic', 1);
  gs.plateau['C1'].construction = 'casino';
  gs.plateau['C1'].proprietaire = 0;

  const log = RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 75, '5 doses à 3L plus les 60L du casino');
  assert.equal(ress(gs, 0).doses, 5);
  assert.equal(log.some(l => l.type === 'flic'), false, 'aucun blocage à annoncer');
});

/* Anomalie non répertoriée, trouvée en écrivant ce fichier.
   La spec ne rend le casino « insensible aux flics normaux » (ligne 153) que
   parce que les autres bâtiments, eux, sont bloqués comme le reste de la case
   (ligne 136 : le flic « bloque une case (plus de revenus) »). Or le moteur
   calcule les revenus de construction hors de la boucle des pions, sans jamais
   consulter flicBlocked : un restaurant sous surveillance policière paie quand
   même ses 14 lingots, et l'immunité du casino ne vaut plus rien. */
test('un flic bloque aussi les revenus de la construction qu\'il surveille',
  { todo: 'le calcul des revenus de construction ignore flicBlocked, ce qui vide de son sens l\'immunité du casino' },
  async () => {
    const { gs, city, adj } = await newTestGame(2);
    dote(gs, 0, { lingots: 0 });
    place(gs, 'C1', 'flic', 1);
    gs.plateau['C1'].construction = 'restaurant';
    gs.plateau['C1'].proprietaire = 0;

    RevenueEngine.calculateRevenues(gs, city, adj);

    assert.equal(ress(gs, 0).lingots, 0, 'le restaurant est fermé tant que le flic est là');
  });

/* ── Revenus des constructions ──────────────────────────────────────────── */

test('un restaurant rapporte 14 lingots par tour', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  gs.plateau['A1'].construction = 'restaurant';
  gs.plateau['A1'].proprietaire = 0;

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 14);
});

test('un tripot rapporte 14 lingots par tour', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  gs.plateau['A1'].construction = 'tripot';
  gs.plateau['A1'].proprietaire = 0;

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 14);
});

test('un casino rapporte 60 lingots par tour', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  gs.plateau['A1'].construction = 'casino';
  gs.plateau['A1'].proprietaire = 0;

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 60);
});

test('un labo ne rapporte pas de lingots : il fait baisser le prix de la drogue', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  gs.plateau['A1'].construction = 'labo';
  gs.plateau['A1'].proprietaire = 0;

  RevenueEngine.calculateRevenues(gs, city, adj);

  assert.equal(ress(gs, 0).lingots, 0);
});

test('un bordel verse le rendement cumulé des trois cases de son triangle', async () => {
  /* Spec ligne 152 : le bordel rapporte le « rendement cumulé des 3 cases
     adjacentes pour pute de luxe ». C'est un bonus de réseau qui s'ajoute à ce
     que les trois demoiselles gagnent chacune sur leur propre case. */
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 0 });
  ['A1', 'A2', 'B1'].forEach(z => place(gs, z, 'prostituee_luxe', 0));
  gs.plateau['B1'].construction = 'bordel';
  gs.plateau['B1'].proprietaire = 0;
  gs.plateau['B1'].bordel_triangle = ['A1', 'A2', 'B1'];

  RevenueEngine.calculateRevenues(gs, city, adj);

  /* Passes de luxe : A1 = 2×3, A2 = 2×3, B1 = 3×3, soit 21 lingots ; le bonus
     de réseau du bordel cumule les mêmes trois rendements. */
  assert.equal(ress(gs, 0).lingots, 42);
});

/* ── Droit de construire ────────────────────────────────────────────────── */

test('un restaurant et un tripot sont constructibles dès qu\'on peut les payer', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 140 });

  assert.equal(RevenueEngine.canBuild(gs, 0, 'restaurant', adj).ok, true);
  assert.equal(RevenueEngine.canBuild(gs, 0, 'tripot', adj).ok, true);
});

test('on ne construit rien sans les lingots demandés', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: CONSTRUCTION_DEFS.restaurant.total - 1 });

  const refus = RevenueEngine.canBuild(gs, 0, 'restaurant', adj);
  assert.equal(refus.ok, false);
  assert.match(refus.reason, /lingots/i);

  dote(gs, 0, { lingots: CONSTRUCTION_DEFS.restaurant.total });
  assert.equal(RevenueEngine.canBuild(gs, 0, 'restaurant', adj).ok, true, 'au lingot près, ça passe');
});

test('un labo exige six dealers', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  ['A1', 'A2', 'B1', 'B2', 'C1'].forEach(z => place(gs, z, 'dealer', 0));

  const refus = RevenueEngine.canBuild(gs, 0, 'labo', adj);
  assert.equal(refus.ok, false, 'cinq dealers ne suffisent pas');
  assert.match(refus.reason, /6 dealers/);

  place(gs, 'C2', 'dealer', 0);
  assert.equal(RevenueEngine.canBuild(gs, 0, 'labo', adj).ok, true, 'le sixième débloque le labo');
});

test('les dealers d\'un adversaire ne comptent pas pour notre labo', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].forEach(z => place(gs, z, 'dealer', 1));

  assert.equal(RevenueEngine.canBuild(gs, 0, 'labo', adj).ok, false);
});

test('un casino exige de posséder déjà un bordel, sa couverture', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });

  const refus = RevenueEngine.canBuild(gs, 0, 'casino', adj);
  assert.equal(refus.ok, false);
  assert.match(refus.reason, /bordel/i);

  gs.plateau['D2'].construction = 'bordel';
  gs.plateau['D2'].proprietaire = 1;
  assert.equal(RevenueEngine.canBuild(gs, 0, 'casino', adj).ok, false,
    'le bordel d\'un adversaire ne sert pas de couverture');

  gs.plateau['D2'].proprietaire = 0;
  assert.equal(RevenueEngine.canBuild(gs, 0, 'casino', adj).ok, true);
});

test('un bordel exige trois prostituées de luxe sur trois cases mutuellement adjacentes', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  /* A1—A2—B1 est une chaîne, pas un triangle : A1 et B1 ne se touchent pas.
     Le plateau fictif ne contient volontairement aucun triangle. */
  ['A1', 'A2', 'B1'].forEach(z => place(gs, z, 'prostituee_luxe', 0));

  const refus = RevenueEngine.canBuild(gs, 0, 'bordel', adj);
  assert.equal(refus.ok, false, 'trois cases alignées ne forment pas une intersection');
  assert.match(refus.reason, /adjacentes/i);
});

test('trois cases mutuellement adjacentes ouvrent le droit au bordel', async () => {
  const { gs } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  /* Adjacences fabriquées pour l'occasion : canBuild les reçoit en argument,
     le moteur n'est donc lié à aucune carte. */
  const triangle = { A1: ['A2', 'B1'], A2: ['A1', 'B1'], B1: ['A1', 'A2'] };
  ['A1', 'A2', 'B1'].forEach(z => place(gs, z, 'prostituee_luxe', 0));

  const ok = RevenueEngine.canBuild(gs, 0, 'bordel', triangle);
  assert.equal(ok.ok, true);
  assert.deepEqual([...ok.triangle].sort(), ['A1', 'A2', 'B1'], 'le triangle retenu est identifié');
});

test('deux prostituées de luxe seulement ne suffisent pas au bordel', async () => {
  const { gs } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  const triangle = { A1: ['A2', 'B1'], A2: ['A1', 'B1'], B1: ['A1', 'A2'] };
  ['A1', 'A2'].forEach(z => place(gs, z, 'prostituee_luxe', 0));
  place(gs, 'B1', 'prostituee_base', 0);   /* une classique ne compte pas */

  assert.equal(RevenueEngine.canBuild(gs, 0, 'bordel', triangle).ok, false);
});

test('un bâtiment inconnu n\'est jamais constructible', async () => {
  const { gs, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 10000 });

  assert.equal(RevenueEngine.canBuild(gs, 0, 'stade', adj).ok, false);
});

/* ── Paiement des constructions ─────────────────────────────────────────── */

test('construire débite le joueur et remplit la Zurich Bank et l\'hôtel de police', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 200 });
  const d = CONSTRUCTION_DEFS.restaurant;

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: 'A1', batiment: 'restaurant' }]
  }, city, adj);

  assert.equal(gs.plateau['A1'].construction, 'restaurant');
  assert.equal(gs.plateau['A1'].proprietaire, 0);
  assert.equal(ress(gs, 0).lingots, 200 - d.total, 'le coût total est débité');
  assert.equal(gs.caisses.zurich_bank, d.z, 'le coût de construction va à la banque');
  assert.equal(gs.caisses.hotel_police, d.p, 'le bakchich va à la police');
});

test('un casino verse 400 lingots à la banque et 60 de bakchich', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  gs.plateau['D2'].construction = 'bordel';
  gs.plateau['D2'].proprietaire = 0;

  RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: 'A1', batiment: 'casino' }]
  }, city, adj);

  assert.equal(gs.plateau['A1'].construction, 'casino');
  assert.equal(ress(gs, 0).lingots, 1000 - CONSTRUCTION_DEFS.casino.total);
  assert.equal(gs.caisses.zurich_bank, 400);
  assert.equal(gs.caisses.hotel_police, 60);
});

test('une construction refusée ne coûte rien et se journalise', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });   /* de quoi payer, mais aucun bordel de couverture */

  const log = RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: 'A1', batiment: 'casino' }]
  }, city, adj);

  assert.equal(gs.plateau['A1'].construction, null);
  assert.equal(ress(gs, 0).lingots, 1000, 'rien n\'est débité');
  assert.equal(gs.caisses.zurich_bank, 0);
  assert.ok(log.some(l => l.type === 'warn'));
});

test('on ne construit pas sur une case déjà bâtie', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });
  gs.plateau['A1'].construction = 'tripot';
  gs.plateau['A1'].proprietaire = 1;

  const log = RevenueEngine.processSupplyOrders(gs, {
    0: [{ type: 'construire', zone: 'A1', batiment: 'restaurant' }]
  }, city, adj);

  assert.equal(gs.plateau['A1'].construction, 'tripot', 'le bâtiment en place est intact');
  assert.equal(gs.plateau['A1'].proprietaire, 1);
  assert.equal(ress(gs, 0).lingots, 1000);
  assert.ok(log.some(l => l.type === 'warn'));
});

/* ── Approvisionnement ──────────────────────────────────────────────────── */

test('les points d\'approvisionnement se déduisent des facilités des zones', async () => {
  const { city } = await newTestGame(2);

  const points = RevenueEngine.getSupplyPoints(city);

  assert.deepEqual(points.map(p => p.zone), ['A2'], 'seule A2 porte un port');
  /* Les valeurs viennent de SUPPLY_CAPS : la regle testee est « un point de type
     port offre le stock d'un port », pas « un port offre 10 armes ». Le reglage
     doit pouvoir bouger sans reecrire les tests. */
  assert.deepEqual(points[0].caps, { ...SUPPLY_CAPS.port });
});

test('une commande est plafonnée par le stock du point', async () => {
  const { gs, city, adj } = await newTestGame(2);
  posteAPortee(gs, 'A1', 0);          /* A1 jouxte le port A2 */
  dote(gs, 0, { lingots: 1000 });

  const stock = SUPPLY_CAPS.port.armes;
  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'armes', stock + 20)] }, city, adj);

  assert.equal(ress(gs, 0).armes, stock, 'on ne peut pas acheter plus que le stock du point');
  assert.equal(ress(gs, 0).lingots, 1000 - stock * 4, `${stock} armes à 4 lingots`);
});

test('une commande est plafonnée par ce que le joueur peut payer', async () => {
  const { gs, city, adj } = await newTestGame(2);
  posteAPortee(gs, 'A1', 0);
  dote(gs, 0, { lingots: 11 });

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'doses', 20)] }, city, adj);

  assert.equal(ress(gs, 0).doses, 5, '11 lingots achètent 5 doses à 2 lingots');
  assert.equal(ress(gs, 0).lingots, 1, 'et le reliquat ne suffit pas à une dose de plus');
});

test('un ordre non finançable ne débite rien et se journalise en avertissement', async () => {
  const { gs, city, adj } = await newTestGame(2);
  posteAPortee(gs, 'A1', 0);
  dote(gs, 0, { lingots: 1 });

  const log = RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'doses', 5)] }, city, adj);

  assert.equal(ress(gs, 0).lingots, 1, 'aucun lingot débité');
  assert.equal(ress(gs, 0).doses, 0, 'aucune dose livrée');
  assert.ok(log.some(l => l.type === 'warn' && l.pid === 0), 'le refus est journalisé');
});

test('une commande sur un point qui n\'existe pas ne livre rien', async () => {
  const { gs, city, adj } = await newTestGame(2);
  dote(gs, 0, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('C2', 'doses', 5)] }, city, adj);

  assert.equal(ress(gs, 0).doses, 0);
  assert.equal(ress(gs, 0).lingots, 1000);
});

test('un labo fait tomber la dose à un lingot pour son propriétaire', async () => {
  const { gs, city, adj } = await newTestGame(2);
  posteAPortee(gs, 'A1', 0);
  dote(gs, 0, { lingots: 100 });
  gs.plateau['D2'].construction = 'labo';
  gs.plateau['D2'].proprietaire = 0;

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'doses', 20)] }, city, adj);

  assert.equal(ress(gs, 0).doses, 20);
  assert.equal(ress(gs, 0).lingots, 80, '20 doses à 1 lingot au lieu de 2');
});

test('le stock d\'un point est partagé : qui arrive après ne trouve plus rien', async () => {
  const { gs, city, adj } = await newTestGame(2);
  const rendreLeHasard = ordreDesJoueursFige();
  try {
    posteAPortee(gs, 'A1', 0);
    posteAPortee(gs, 'A1', 1);
    dote(gs, 0, { lingots: 1000 });
    dote(gs, 1, { lingots: 1000 });

    const stock = SUPPLY_CAPS.port.doses;
    const log = RevenueEngine.processSupplyOrders(gs, {
      0: [appro('A2', 'doses', stock)],   /* J0 vide le stock du port */
      1: [appro('A2', 'doses', 5)]
    }, city, adj);

    assert.equal(ress(gs, 0).doses, stock);
    assert.equal(ress(gs, 1).doses, 0, 'le second arrivé repart les mains vides');
    assert.equal(ress(gs, 1).lingots, 1000, 'et ne paie rien');
    assert.ok(log.some(l => l.pid === 1 && l.type === 'warn'));
  } finally {
    rendreLeHasard();
  }
});

test('le stock partagé se répartit à hauteur de ce qui reste', async () => {
  const { gs, city, adj } = await newTestGame(2);
  const rendreLeHasard = ordreDesJoueursFige();
  try {
    posteAPortee(gs, 'A1', 0);
    posteAPortee(gs, 'A1', 1);
    dote(gs, 0, { lingots: 1000 });
    dote(gs, 1, { lingots: 1000 });

    /* Le premier prend les trois quarts du stock, le second n'obtient que le reste. */
    const stock = SUPPLY_CAPS.port.armes;
    const gros = Math.ceil(stock * 0.75);
    RevenueEngine.processSupplyOrders(gs, {
      0: [appro('A2', 'armes', gros)],
      1: [appro('A2', 'armes', gros)]
    }, city, adj);

    assert.equal(ress(gs, 0).armes, gros);
    assert.equal(ress(gs, 1).armes, stock - gros,
      `il ne restait que ${stock - gros} armes sur les ${stock} du port`);
  } finally {
    rendreLeHasard();
  }
});

/* B12 — le bonus d'administration est une livraison supplémentaire réservée à
   celui qui tient l'ambassade (spec : « +10 armes, +20 doses, +3 prostituées aux
   plafonds de commande »). Le moteur s'en sert bien pour relever le plafond du
   propriétaire, mais retire ensuite la totalité de l'achat du stock commun, qui
   part en négatif :  const cap = (pool[capKey] ?? 0) + bonus[capKey];  puis
   pool[capKey] -= actual. Le bonus est donc prélevé sur les autres joueurs.
   Un bonus qui appauvrit les adversaires n'est plus un bonus : c'est un vol. */
test('le bonus d\'administration ne se prélève pas sur le stock commun du point',
  { todo: 'B12 — le plafond vaut pool + bonus mais tout l\'achat est retiré du pool commun, qui passe en négatif' },
  async () => {
    const { gs, city, adj } = await newTestGame(2);
    const rendreLeHasard = ordreDesJoueursFige();
    try {
      city.zones['B1'].facilite = 'ambassade';
      gs.plateau['B1'].proprietaire = 0;     /* J0 tient l'ambassade : +20 doses */
      posteAPortee(gs, 'A1', 0);
      posteAPortee(gs, 'A1', 1);
      dote(gs, 0, { lingots: 1000 });
      dote(gs, 1, { lingots: 1000 });

      RevenueEngine.processSupplyOrders(gs, {
        0: [appro('A2', 'doses', 30)],   /* 20 de son bonus + 10 du port */
        1: [appro('A2', 'doses', 20)]
      }, city, adj);

      assert.equal(ress(gs, 0).doses, 30, 'le plafond de J0 est bien de 20 + 20');
      assert.equal(ress(gs, 1).doses, 10,
        'les 10 doses restantes du port doivent rester accessibles à J1');
    } finally {
      rendreLeHasard();
    }
  });

/* ── Domination des équipements logistiques ────────────────────────────────
   Les ports, péages et aéroports ne se construisent pas : ce sont des
   équipements publics qu'on domine. Auparavant n'importe qui commandait à
   n'importe quel port depuis n'importe où, sans condition — la logistique
   n'avait aucune géographie et prendre un port ne servait à rien.

   Deux effets, et pas de verrou : six des onze quartiers de départ de New York
   ne portent aucun point, les en priver serait une condamnation. */

test('le propriétaire d\'un port ne paie aucun péage', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.plateau['A2'].proprietaire = 0;          /* A2 est le port du plateau fictif */
  dote(gs, 0, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'armes', 10)] }, city, adj);

  assert.equal(ress(gs, 0).armes, 10);
  assert.equal(ress(gs, 0).lingots, 1000 - 40, '10 armes au prix de base, 4L pièce');
});

test('celui qui se sert chez un autre paie une surtaxe, qui va au propriétaire', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.plateau['A2'].proprietaire = 0;
  posteAPortee(gs, 'A1', 1);          /* J1 est a la porte du port sans le tenir */
  dote(gs, 0, { lingots: 100 });
  dote(gs, 1, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 1: [appro('A2', 'armes', 10)] }, city, adj);

  /* 4L de base + 2L de péage (50 %) = 6L l'arme. */
  assert.equal(ress(gs, 1).armes, 10);
  assert.equal(ress(gs, 1).lingots, 1000 - 60, 'le client paie base + péage');
  assert.equal(ress(gs, 0).lingots, 100 + 20, 'le propriétaire encaisse le péage');
});

test('un point que personne ne contrôle ne prélève rien', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.plateau['A2'].proprietaire = null;
  posteAPortee(gs, 'A1', 1);
  dote(gs, 1, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 1: [appro('A2', 'armes', 10)] }, city, adj);

  assert.equal(ress(gs, 1).lingots, 1000 - 40, 'prix de base seulement');
});

test('le propriétaire est servi avant les autres quand le stock manque', async () => {
  const { gs, city, adj } = await newTestGame(2);
  const rendreLeHasard = ordreDesJoueursFige();   /* sans ça, J0 passerait déjà en premier */
  try {
    const stock = SUPPLY_CAPS.port.armes;
    gs.plateau['A2'].proprietaire = 1;            /* c'est J1 qui tient le port */
    posteAPortee(gs, 'A1', 0);                    /* J0 est bien a portee : ce qui le bloque, c'est la priorite */
    dote(gs, 0, { lingots: 5000 });
    dote(gs, 1, { lingots: 5000 });

    /* J0 est premier dans l'ordre tiré au sort et demande tout le stock ;
       J1, propriétaire, doit malgré tout être servi le premier. */
    RevenueEngine.processSupplyOrders(gs, {
      0: [appro('A2', 'armes', stock)],
      1: [appro('A2', 'armes', stock)]
    }, city, adj);

    assert.equal(ress(gs, 1).armes, stock, 'le propriétaire prend tout le stock');
    assert.equal(ress(gs, 0).armes, 0, 'l\'autre repart les mains vides');
  } finally {
    rendreLeHasard();
  }
});

/* ── Géographie de l'approvisionnement ─────────────────────────────────────
   On ne commande qu'aux équipements où l'on est présent. Sans cette règle, la
   liste des points était la même pour tout le monde et depuis n'importe où :
   un joueur de Brooklyn commandait au port du New Jersey sans y aller. Un
   équipement ne valait alors la peine ni d'être pris ni d'être défendu. */

test('on ne commande pas à un port où l\'on n\'a personne', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'C2', 'trafiquant', 0);   /* C2 est à quatre zones du port A2 */
  dote(gs, 0, { lingots: 1000 });

  const log = RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'armes', 10)] }, city, adj);

  assert.equal(ress(gs, 0).armes, 0, 'rien n\'est livré');
  assert.equal(ress(gs, 0).lingots, 1000, 'et rien n\'est débité');
  assert.ok(log.some(l => l.pid === 0 && l.type === 'warn'), 'le refus est journalisé');
});

test('un pion dans la zone du port y donne accès', async () => {
  const { gs, city, adj } = await newTestGame(2);
  posteAPortee(gs, 'A2', 0);
  dote(gs, 0, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'armes', 10)] }, city, adj);

  assert.equal(ress(gs, 0).armes, 10);
});

test('un pion dans une zone voisine du port y donne accès', async () => {
  const { gs, city, adj } = await newTestGame(2);
  posteAPortee(gs, 'B1', 0);          /* B1 jouxte A2 */
  dote(gs, 0, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'armes', 10)] }, city, adj);

  assert.equal(ress(gs, 0).armes, 10);
});

test('posséder la zone d\'un équipement suffit à y commander, même sans pion dessus', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.plateau['A2'].proprietaire = 0;   /* conquis puis quitté : la zone reste sienne */
  dote(gs, 0, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, { 0: [appro('A2', 'armes', 10)] }, city, adj);

  assert.equal(ress(gs, 0).armes, 10, 'on ne se ferme pas son propre port');
});

test('deux zones d\'écart suffisent à couper un joueur d\'un port', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B2', 'trafiquant', 0);   /* B2 — B1 — A2 : une zone de trop */

  assert.equal(RevenueEngine.estAPortee(gs, 0, 'A2', adj), false);
  assert.equal(RevenueEngine.pointsAccessibles(gs, 0, city, adj).length, 0);
});

test('le recrutement obéit à la même géographie que l\'achat', async () => {
  const { gs, city, adj } = await newTestGame(2);
  city.zones['B1'].facilite = 'peage';
  place(gs, 'C2', 'dealer', 1);       /* J1 est loin du péage B1 */
  dote(gs, 1, { lingots: 1000 });

  const log = RevenueEngine.processSupplyOrders(gs, {
    1: [{ type: 'recruter', point: 'B1', pion_type: 'prostituee_base', zone_dest: 'C2' }]
  }, city, adj);

  assert.equal(ress(gs, 1).lingots, 1000, 'aucun recrutement, aucun débit');
  assert.ok(log.some(l => l.pid === 1 && l.type === 'warn'));
});

test('le marché noir des gitans échappe au système : ni propriétaire, ni péage', async () => {
  const { gs, city, adj } = await newTestGame(2);
  /* Une île n'existe pas sur le plateau fictif : on vérifie la règle sur la
     fonction qui la porte, en lui passant un identifiant d'île. */
  assert.equal(RevenueEngine.estMarcheNoir('ile_rikers'), true);
  assert.equal(RevenueEngine.estMarcheNoir('A2'), false);

  gs.plateau['ile_rikers'] = { proprietaire: 1, pions: [], construction: null, electricite: true };
  const prix = RevenueEngine.prixAppro(gs, 0, 'ile_rikers', 'armes', city);

  assert.equal(prix.peage, 0, 'aucun péage sur le marché noir');
  assert.equal(prix.base, 24, 'mais les gitans vendent l\'arme six fois le prix');
});

test('le péage s\'applique aussi au recrutement', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.plateau['A2'].proprietaire = 0;
  /* Le port n'offre pas de prostituée : on donne la facilité péage à B1, qui
     en propose 2, et on la fait tenir par J0. */
  city.zones['B1'].facilite = 'peage';
  gs.plateau['B1'].proprietaire = 0;
  posteAPortee(gs, 'B2', 1);          /* B2 jouxte B1 : J1 peut y recruter */
  place(gs, 'C1', 'dealer', 1);
  dote(gs, 0, { lingots: 0 });
  dote(gs, 1, { lingots: 1000 });

  RevenueEngine.processSupplyOrders(gs, {
    1: [{ type: 'recruter', point: 'B1', pion_type: 'prostituee_base', zone_dest: 'C1' }]
  }, city, adj);

  /* 40L de base + 20L de péage. */
  assert.equal(ress(gs, 1).lingots, 1000 - 60);
  assert.equal(ress(gs, 0).lingots, 20, 'le propriétaire du péage encaisse');
});
