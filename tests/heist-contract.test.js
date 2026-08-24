/**
 * JORETAPO — Tests des cambriolages (js/heist-engine.js) et des contrats /
 * de la Coupole (js/contract-engine.js).
 *
 * Chaque test décrit une RÈGLE du jeu, pas une implémentation :
 *   1. Un prérequis « plus que tout ADVERSAIRE » se mesure sur les adversaires,
 *      jamais sur soi-même.
 *   2. Le prix annoncé est le prix payé : ce que `canHeist` exige est
 *      exactement ce que `executeHeist` prélève (coupure d'électricité incluse).
 *   3. Rien ne disparaît du jeu sans raison : une carte sacrifiée retourne à la
 *      défausse, le circuit du deck reste fermé.
 *   4. Un contrat non honoré a un COÛT, et le payer intégralement réhabilite.
 *   5. La Coupole juge sur pièces : condamner exige un grief, accuser à vide
 *      se retourne contre le plaignant.
 */

import {
  test, assert, assertEqual,
  loadData, makeGame
} from './helpers.js';

import { HeistEngine } from '../js/heist-engine.js';
import { ContractEngine, CONTRACT_TYPES } from '../js/contract-engine.js';
import { MagouilleEngine } from '../js/magouille-engine.js';

/* ── Utilitaires locaux ──────────────────────────────────── */

const zonesReelles = gs => Object.keys(gs.plateau).filter(z => !z.startsWith('ile_'));

/** Table rase : plus aucun pion sur le plateau. */
function viderPlateau(gs) {
  Object.values(gs.plateau).forEach(z => { z.pions = []; });
  return gs;
}

function poser(gs, zid, pid, type, n = 1) {
  for (let i = 0; i < n; i++) gs.plateau[zid].pions.push({ joueur: pid, type });
}

/** Pose `n` flics du joueur `pid` sur des cases qui n'en portent pas encore. */
function poserFlics(gs, pid, n) {
  const libres = zonesReelles(gs).filter(z => !gs.plateau[z].pions.some(p => p.type === 'flic'));
  if (libres.length < n) throw new Error('pas assez de cases libres pour poser les flics');
  for (let i = 0; i < n; i++) poser(gs, libres[i], pid, 'flic');
}

function zoneFacilite(data, facilite) {
  return Object.entries(data.gameplay.zones).find(([, z]) => z.facilite === facilite)?.[0] || null;
}

/** Coupe l'électricité du quartier contenant `zid`, comme le fait le maire. */
function couperElectricite(gs, data, zid) {
  const q = data.gameplay.quartiers.find(q => q.zones.includes(zid));
  q.zones.forEach(z => { if (gs.plateau[z]) gs.plateau[z].electricite = false; });
  gs.coupures_electricite.push({ quartier: q.id, tour_debut: gs.tour, duree: 3, tour_fin: gs.tour + 3, par: 0, source: 'test' });
  return q.id;
}

/** Prépare un labo adverse cambriolable par `pid`, cible retournée. */
function preparerLabo(gs, pid, proprietaire) {
  const cible = zonesReelles(gs)[3];
  gs.plateau[cible].construction = 'labo';
  gs.plateau[cible].proprietaire = proprietaire;
  poser(gs, cible, pid, 'dealer');
  return cible;
}

/** Donne `n` cartes réelles au joueur, prises sur la pile. */
function donnerCartes(gs, data, pid, n) {
  if (!gs.deck_magouille.pile.length) MagouilleEngine.initDeck(gs, data.cartes);
  const uids = MagouilleEngine.drawCards(gs, pid, n, data.cartes);
  gs.joueurs[pid].cartes_magouille.push(...uids);
  return uids;
}

/* ═══════════════════════════════════════════════════════════
 *  1 — Hôtel de Police : « plus de flics que tout ADVERSAIRE »
 * ═══════════════════════════════════════════════════════════ */

/** Installe le décor minimal du casse de l'Hôtel de Police pour `pid`. */
function preparerHotelPolice(gs, data, pid) {
  const hp = zoneFacilite(data, 'hotel_police');
  poser(gs, hp, pid, 'trafiquant');
  const bordel = zonesReelles(gs).find(z => z !== hp);
  gs.plateau[bordel].construction = 'bordel';
  gs.plateau[bordel].proprietaire = pid;
  return hp;
}

test('le cambrioleur de l\'Hôtel de Police n\'est jamais compté parmi ses propres adversaires', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  viderPlateau(gs);
  preparerHotelPolice(gs, data, 0);

  // Le joueur 0 est de loin le mieux doté : 5 flics contre 2 au meilleur adverse.
  poserFlics(gs, 0, 5);
  poserFlics(gs, 3, 2);

  assertEqual(HeistEngine._maxFlicsAdverses(gs, 0), 2,
    'le maximum adverse du joueur 0 doit ignorer les 5 flics du joueur 0 lui-même');

  const check = HeistEngine.canHeist(gs, 0, 'hotel_police', data.gameplay);
  assert(check.ok, `le casse doit être accordé (obtenu : ${check.reason})`);
});

test('le dernier joueur du tableau est bien compté comme adversaire', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  viderPlateau(gs);
  preparerHotelPolice(gs, data, 1);

  // Le seul vrai rival est le DERNIER joueur du tableau.
  poserFlics(gs, 1, 4);
  poserFlics(gs, 3, 9);

  const check = HeistEngine.canHeist(gs, 1, 'hotel_police', data.gameplay);
  assert(!check.ok, 'le casse doit être refusé face à un adversaire bien mieux doté en flics');
  assert(check.reason.includes('9'),
    `le refus doit citer les 9 flics du dernier joueur (obtenu : ${check.reason})`);
});

test('un joueur qui domine réellement tous ses adversaires obtient le casse', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  viderPlateau(gs);
  preparerHotelPolice(gs, data, 1);

  poserFlics(gs, 1, 4);   // le cambrioleur, au milieu du tableau
  poserFlics(gs, 0, 1);
  poserFlics(gs, 2, 2);
  poserFlics(gs, 3, 3);

  const check = HeistEngine.canHeist(gs, 1, 'hotel_police', data.gameplay);
  assert(check.ok, `4 flics contre 3 au mieux : le casse est dû (obtenu : ${check.reason})`);
});

test('la progression affichée annonce le même seuil de flics que la validation', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  viderPlateau(gs);
  preparerHotelPolice(gs, data, 1);
  poserFlics(gs, 1, 3);
  poserFlics(gs, 3, 5);

  const req = HeistEngine.getProgress(gs, 1, 'hotel_police', data.gameplay)
    .reqs.find(r => r.label.includes('flics'));
  assertEqual(req.needed, 6, 'il faut strictement plus de flics que le meilleur adversaire (5) donc 6');
  assertEqual(req.current, 3, 'le joueur en a 3');
  assert(!HeistEngine.canHeist(gs, 1, 'hotel_police', data.gameplay).ok,
    'l\'écran de progression et la validation doivent annoncer le même seuil');
});

test('l\'Hôtel de Police coûte bien 2 hommes de main, même si un seul est sur le bloc', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const hp = preparerHotelPolice(gs, data, 0);
  poserFlics(gs, 0, 2);
  const ailleurs = zonesReelles(gs).find(z => z !== hp && gs.plateau[z].pions.length === 0);
  poser(gs, ailleurs, 0, 'dealer');
  gs.caisses.hotel_police = 400;

  const avant = HeistEngine._countPlayerArmedPions(gs, 0);
  const lingotsAvant = gs.joueurs[0].ressources.lingots;
  const res = HeistEngine.executeHeist(gs, 0, 'hotel_police', {}, data.gameplay);
  assert(res.ok, `le casse doit réussir (${res.reason})`);
  assertEqual(HeistEngine._countPlayerArmedPions(gs, 0), avant - 2,
    'le casse annonce « vous perdez 2 hommes » : il doit en retirer 2');
  assertEqual(gs.caisses.hotel_police, 200, 'la police garde la moitié de sa caisse');
  assertEqual(gs.joueurs[0].ressources.lingots, lingotsAvant + 200, 'la moitié de la caisse est créditée');
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Coupure d'électricité : le prix annoncé est le prix payé
 * ═══════════════════════════════════════════════════════════ */

test('avec l\'électricité coupée, le casse de labo est ACCORDÉ à qui a le coût réduit', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const cible = preparerLabo(gs, 0, 1);
  couperElectricite(gs, data, cible);

  gs.joueurs[0].ressources.armes = 12;   // < 20 plein tarif, > 10 tarif coupure
  donnerCartes(gs, data, 0, 1);

  const check = HeistEngine.canHeist(gs, 0, 'labo', data.gameplay, { targetZone: cible });
  assert(check.ok, `12 armes suffisent quand le coût est divisé par 2 (obtenu : ${check.reason})`);
  assertEqual(check.cost.armes, 10, 'le coût annoncé doit être le coût réduit');
  assertEqual(check.cost.cartes, 1, 'une seule carte est due quand l\'électricité est coupée');
});

test('sans coupure, le tarif plein reste exigé', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const cible = preparerLabo(gs, 0, 1);
  gs.joueurs[0].ressources.armes = 12;
  donnerCartes(gs, data, 0, 2);

  const check = HeistEngine.canHeist(gs, 0, 'labo', data.gameplay, { targetZone: cible });
  assert(!check.ok, '12 armes ne suffisent pas au tarif plein');
  assert(/20 armes/.test(check.reason), `le refus doit citer le tarif plein (obtenu : ${check.reason})`);
});

test('le casse de labo prélève exactement ce que la validation avait exigé', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const cible = preparerLabo(gs, 0, 1);
  couperElectricite(gs, data, cible);

  gs.joueurs[0].ressources.armes = 12;
  donnerCartes(gs, data, 0, 3);
  gs.joueurs[1].ressources.doses = 40;

  const res = HeistEngine.executeHeist(gs, 0, 'labo', { targetZone: cible }, data.gameplay);
  assert(res.ok, `le casse doit réussir (${res.reason})`);
  assertEqual(gs.joueurs[0].ressources.armes, 2, '12 armes − 10 = 2 : jamais de solde négatif');
  assertEqual(gs.joueurs[0].cartes_magouille.length, 2, 'une seule carte prélevée');
  assertEqual(gs.joueurs[0].ressources.doses, 40, 'toute la drogue du propriétaire est volée');
  assertEqual(gs.joueurs[1].ressources.doses, 0, 'la victime est vidée de sa drogue');
});

test('la cible désignée impose SON tarif, pas celui d\'une autre cible mieux placée', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const zones = zonesReelles(gs);
  const coupee = zones[3], alimentee = zones[40];
  [[coupee, 1], [alimentee, 2]].forEach(([z, prop]) => {
    gs.plateau[z].construction = 'labo';
    gs.plateau[z].proprietaire = prop;
  });
  couperElectricite(gs, data, coupee);
  assert(gs.plateau[alimentee].electricite !== false, 'la seconde cible doit rester alimentée');

  gs.joueurs[0].ressources.armes = 12;
  donnerCartes(gs, data, 0, 2);

  assert(HeistEngine.canHeist(gs, 0, 'labo', data.gameplay, { targetZone: coupee }).ok,
    'la cible privée d\'électricité est abordable');
  assert(!HeistEngine.canHeist(gs, 0, 'labo', data.gameplay, { targetZone: alimentee }).ok,
    'la cible alimentée reste au tarif plein');
  const res = HeistEngine.executeHeist(gs, 0, 'labo', { targetZone: alimentee }, data.gameplay);
  assert(!res.ok, 'on ne peut pas payer le tarif réduit sur une cible alimentée');
  assertEqual(gs.joueurs[0].ressources.armes, 12, 'un casse refusé ne prélève rien');
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Les cartes sacrifiées retournent dans le circuit du deck
 * ═══════════════════════════════════════════════════════════ */

test('les cartes sacrifiées par un casse de labo passent par la défausse', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const cible = preparerLabo(gs, 0, 1);
  gs.joueurs[0].ressources.armes = 30;
  const uids = donnerCartes(gs, data, 0, 4);

  const avant = MagouilleEngine.statsDeck(gs).total;
  const res = HeistEngine.executeHeist(gs, 0, 'labo', { targetZone: cible }, data.gameplay);
  assert(res.ok, `le casse doit réussir (${res.reason})`);

  const apres = MagouilleEngine.statsDeck(gs);
  assertEqual(apres.total, avant, 'aucun exemplaire ne doit sortir du circuit du deck');
  assertEqual(gs.joueurs[0].cartes_magouille.length, 2, '2 cartes prélevées sur 4');
  uids.slice(0, 2).forEach(uid =>
    assert(gs.deck_magouille.defaussees.includes(uid), `la carte ${uid} doit être à la défausse`));
});

test('le joueur peut désigner les cartes qu\'il sacrifie', async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  viderPlateau(gs);
  const cible = preparerLabo(gs, 0, 1);
  gs.joueurs[0].ressources.armes = 30;
  const uids = donnerCartes(gs, data, 0, 4);
  const garder = [uids[0], uids[1]];

  const res = HeistEngine.executeHeist(gs, 0, 'labo',
    { targetZone: cible, cartes: [uids[2], uids[3]] }, data.gameplay);
  assert(res.ok, `le casse doit réussir (${res.reason})`);
  assertEqual(gs.joueurs[0].cartes_magouille.join(','), garder.join(','),
    'les cartes non désignées restent en main');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Contrats : un manquement coûte, un paiement réhabilite
 * ═══════════════════════════════════════════════════════════ */

/** Contrat de transfert de `montant` lingots de 0 vers 1, sur `duree` tours. */
function contratLingots(gs, montant = 500, duree = 5) {
  return ContractEngine.createContract(gs, {
    joueurA: 0, joueurB: 1, typeContrat: 'transfert_lingots',
    description: 'dîme', montant, duree
  });
}

test('un contrat entre un joueur et lui-même est refusé', async () => {
  const gs = await makeGame(3);
  const r = ContractEngine.createContract(gs, { joueurA: 1, joueurB: 1, typeContrat: 'libre', montant: 0, duree: 2 });
  assert(r && r.ok === false, 'la création doit être refusée');
  assertEqual(gs.contrats.length, 0, 'aucun contrat ne doit être enregistré');
});

test('un transfert sans montant est refusé : un contrat automatique inerte n\'a pas de sens', async () => {
  const gs = await makeGame(3);
  const r = ContractEngine.createContract(gs, { joueurA: 0, joueurB: 1, typeContrat: 'transfert_armes', montant: 0, duree: 3 });
  assert(r && r.ok === false, 'la création doit être refusée');
  assertEqual(gs.contrats.length, 0, 'aucun contrat ne doit être enregistré');
});

test('trahir un contrat se paie en électeurs, tour après tour', async () => {
  const gs = await makeGame(3);
  contratLingots(gs, 500, 5);
  gs.joueurs[0].ressources.lingots = 0;
  const avant = gs.joueurs[0].electeurs_malus || 0;

  ContractEngine.executeAutoContracts(gs);
  const apres1 = gs.joueurs[0].electeurs_malus;
  assert(apres1 > avant, 'un défaut de paiement doit coûter des électeurs');

  ContractEngine.executeAutoContracts(gs);
  assert(gs.joueurs[0].electeurs_malus > apres1,
    'un second tour de défaut coûte encore : la trahison n\'est jamais gratuite');
});

test('le manque impayé devient une dette réclamée au tour suivant', async () => {
  const gs = await makeGame(3);
  const c = contratLingots(gs, 500, 5);
  gs.joueurs[0].ressources.lingots = 200;
  gs.joueurs[1].ressources.lingots = 0;

  ContractEngine.executeAutoContracts(gs);
  assertEqual(c.dette, 300, '500 dus, 200 versés : 300 d\'arriéré');
  assertEqual(c.honore, false, 'le contrat est en défaut');

  gs.joueurs[0].ressources.lingots = 1000;
  ContractEngine.executeAutoContracts(gs);
  assertEqual(gs.joueurs[1].ressources.lingots, 200 + 800,
    'le tour suivant réclame l\'échéance (500) ET l\'arriéré (300)');
  assertEqual(c.dette, 0, 'la dette est soldée');
});

test('solder sa dette réhabilite le contrat : « non honoré » n\'est pas une cicatrice définitive', async () => {
  const gs = await makeGame(3);
  const c = contratLingots(gs, 100, 5);
  gs.joueurs[0].ressources.lingots = 0;

  ContractEngine.executeAutoContracts(gs);
  assertEqual(c.honore, false, 'un tour manqué marque le contrat');

  gs.joueurs[0].ressources.lingots = 1000;
  ContractEngine.executeAutoContracts(gs);
  assertEqual(c.honore, true, 'une fois tout payé, le contrat est de nouveau honoré');
  assert((c.manquements || 0) > 0, 'le manquement passé reste archivé comme grief');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — La Coupole juge sur pièces
 * ═══════════════════════════════════════════════════════════ */

/** Fait défaut le joueur 0 sur un contrat envers le joueur 1. */
function creerGrief(gs, montant = 500) {
  const c = contratLingots(gs, montant, 5);
  gs.joueurs[0].ressources.lingots = 0;
  ContractEngine.executeAutoContracts(gs);
  return c;
}

test('sans grief, la saisine de la Coupole contre un joueur nommé est irrecevable', async () => {
  const gs = await makeGame(4);
  const check = ContractEngine.canConvokeCoupole(gs, 1, 0);
  assert(!check.ok, 'on ne convoque pas la Coupole contre quelqu\'un sans rien à lui reprocher');
});

test('un manquement constaté rend la saisine recevable', async () => {
  const gs = await makeGame(4);
  creerGrief(gs);
  const check = ContractEngine.canConvokeCoupole(gs, 1, 0);
  assert(check.ok, `la victime du défaut doit pouvoir saisir la Coupole (${check.reason})`);
  assert(check.griefs.fonde, 'le grief est un constat du moteur, pas une simple parole');
});

test('la saisine sans accusé nommé reste possible (appel historique de l\'UI)', async () => {
  const gs = await makeGame(4);
  assert(ContractEngine.canConvokeCoupole(gs, 1).ok,
    'l\'appel à deux arguments doit continuer à ne vérifier que la forme');
});

test('un contrat sans effet moteur peut être dénoncé par la partie lésée, et par elle seule', async () => {
  const gs = await makeGame(4);
  const c = ContractEngine.createContract(gs, {
    joueurA: 0, joueurB: 1, typeContrat: 'non_agression', description: 'trêve', montant: 0, duree: 4
  });
  const intrus = ContractEngine.signalerViolation(gs, c.id, { plaignantId: 2, motif: 'jalousie' });
  assert(!intrus.ok, 'un tiers ne peut pas dénoncer un contrat qui ne le lie pas');

  const r = ContractEngine.signalerViolation(gs, c.id, { plaignantId: 1, motif: 'attaque de Harlem' });
  assert(r.ok, `la partie lésée doit pouvoir dénoncer (${r.reason})`);
  assertEqual(c.honore, false, 'le contrat dénoncé s\'affiche comme non honoré');
  assert(ContractEngine.canConvokeCoupole(gs, 1, 0).ok, 'la dénonciation rend la saisine recevable');
  assert(!ContractEngine.getGriefs(gs, 1, 0).fonde,
    'une dénonciation n\'est que la parole du plaignant : ce n\'est pas une preuve');
});

test('une condamnation coûte 2 hommes, des électeurs, et la restitution de la dette', async () => {
  const data = await loadData();
  const gs = await makeGame(4, { data });
  viderPlateau(gs);
  const c = creerGrief(gs, 500);
  const zones = zonesReelles(gs);
  poser(gs, zones[0], 0, 'dealer');
  poser(gs, zones[1], 0, 'trafiquant');
  poser(gs, zones[2], 0, 'dealer');
  gs.joueurs[0].ressources.lingots = 400;
  gs.joueurs[1].ressources.lingots = 0;
  const malusAvant = gs.joueurs[0].electeurs_malus || 0;

  const res = ContractEngine.resolveCoupole(gs, 1, 0, { 2: true, 3: true });
  assertEqual(res.verdict, 'coupable', 'deux voix pour, zéro contre');
  assertEqual(HeistEngine._countPlayerArmedPions(gs, 0), 1, 'le condamné perd 2 hommes de main');
  assert(gs.joueurs[0].electeurs_malus > malusAvant, 'la condamnation publique coûte des électeurs');
  assertEqual(gs.joueurs[1].ressources.lingots, 400, 'la dette est restituée au plaignant, à hauteur du possible');
  assertEqual(gs.joueurs[0].ressources.lingots, 0, 'le condamné est saisi');
  assertEqual(c.actif, false, 'le contrat jugé est clos');
});

test('accuser sans le moindre manquement constaté et perdre coûte des électeurs au plaignant', async () => {
  const gs = await makeGame(4);
  const malusAvant = gs.joueurs[1].electeurs_malus || 0;

  const res = ContractEngine.resolveCoupole(gs, 1, 0, { 2: false, 3: false });
  assertEqual(res.verdict, 'acquitté', 'aucune voix pour');
  assert(gs.joueurs[1].electeurs_malus > malusAvant,
    'une accusation sans preuve qui échoue se retourne contre son auteur');
  assert(res.sanction_plaignant, 'le résultat doit expliciter la sanction du plaignant');
});

test('un plaignant débouté MALGRÉ un manquement constaté n\'est pas puni', async () => {
  const gs = await makeGame(4);
  creerGrief(gs);
  const malusAvant = gs.joueurs[1].electeurs_malus || 0;

  const res = ContractEngine.resolveCoupole(gs, 1, 0, { 2: false, 3: false });
  assertEqual(res.verdict, 'acquitté', 'la Coupole peut protéger un des siens');
  assertEqual(gs.joueurs[1].electeurs_malus, malusAvant,
    'le plaignant avait des pièces au dossier : il ne paie pas la calomnie');
});

test('la convocation est consommée quel que soit le verdict', async () => {
  const gs = await makeGame(4);
  assertEqual(gs.joueurs[1].nb_coupole_restantes, 2, 'deux convocations par partie');
  ContractEngine.resolveCoupole(gs, 1, 0, { 2: false, 3: false });
  assertEqual(gs.joueurs[1].nb_coupole_restantes, 1, 'la convocation est dépensée même en cas d\'acquittement');
});

test('les contrats et leurs griefs survivent à une sauvegarde/restauration', async () => {
  const gs = await makeGame(3);
  const c = creerGrief(gs, 500);
  const { GameState } = await import('../js/game-state.js');
  const copie = GameState.deserialize(JSON.parse(JSON.stringify(gs.serialize())));
  assert(copie.ok, `la sauvegarde doit se recharger (${copie.msg})`);
  const restaure = copie.state;
  const cr = (restaure.contrats || [])[0];
  assert(cr, 'le contrat doit survivre à la sérialisation');
  assertEqual(cr.dette, c.dette, 'la dette est sauvegardée');
  assertEqual(cr.manquements, c.manquements, 'le compteur de manquements est sauvegardé');
});
