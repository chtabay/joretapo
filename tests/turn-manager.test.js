/**
 * JORETAPO — Tests de l'automate de tour (js/turn-manager.js).
 *
 * Trois règles sont verrouillées ici :
 *   1. Le budget de 5 ordres par tour est appliqué par le MOTEUR, pas par l'UI.
 *   2. Une élection laisse toujours un état de mairie cohérent : soit un maire
 *      unique, soit personne — jamais un « maire fantôme ».
 *   3. Un tour interrompu se reprend exactement là où il s'était arrêté.
 */

import {
  test, assert, assertEqual,
  loadData, makeGame, simulateGame
} from './helpers.js';

import { TurnManager, PHASE, DEPARTAGE } from '../js/turn-manager.js';
import { GameState } from '../js/game-state.js';

/* ═══════════════════════════════════════════════════════════
 *  Fabriques
 * ═══════════════════════════════════════════════════════════ */

/**
 * Partie dont la puissance électorale est entièrement pilotée : le plateau est
 * vidé, seuls `electeurs_bonus` comptent. Permet de fabriquer une égalité
 * stricte, qu'aucun tirage de plateau ne produirait de façon fiable.
 */
async function partieElection({ pouvoirs, lingots = null, maire = null }) {
  const data = await loadData();
  const gs = await makeGame(pouvoirs.length, { data });

  Object.values(gs.plateau).forEach(z => {
    z.pions = [];
    z.construction = null;
    z.proprietaire = null;
  });

  gs.joueurs.forEach((j, i) => {
    j.electeurs_bonus = pouvoirs[i];
    j.electeurs_malus = 0;
    j.est_maire = false;
    j.privileges_maire_restants = 0;
    if (lingots) j.ressources.lingots = lingots[i];
  });

  gs.maire = { joueur_id: null, privileges_restants: 0, tour_election: null };
  if (maire !== null) {
    gs.maire = { joueur_id: maire, privileges_restants: 2, tour_election: 0 };
    gs.joueurs[maire].est_maire = true;
    gs.joueurs[maire].privileges_maire_restants = 2;
  }

  const tm = new TurnManager(gs, data.gameplay);
  return { gs, tm, data };
}

/** Amène l'automate jusqu'à la saisie d'ordres du premier joueur. */
async function partieOrdres(nbJoueurs = 2) {
  const data = await loadData();
  const gs = await makeGame(nbJoueurs, { data });
  const tm = new TurnManager(gs, data.gameplay);
  tm.startTurn();
  tm.confirmCurtain();
  return { gs, tm, data };
}

const ordresBidons = n => Array.from({ length: n }, (_, i) => ({ type: 'approvisionner', rang: i }));

/** État de la mairie tel qu'il serait relu après un rechargement. */
function porteursEcharpe(gs) {
  return gs.joueurs.map((j, i) => (j.est_maire ? i : -1)).filter(i => i >= 0);
}

/* ═══════════════════════════════════════════════════════════
 *  1 — Budget d'ordres (specs/06, décision 4 : 5 ordres par TOUR)
 * ═══════════════════════════════════════════════════════════ */

test("un joueur ne peut pas valider plus d'ordres que son budget du tour", async () => {
  const { tm } = await partieOrdres(2);
  const pid = tm.currentPlayerId;

  const res = tm.submitOrders(ordresBidons(9));

  assertEqual(res.ok, false, 'la validation doit signaler le dépassement');
  assertEqual(res.reason, 'budget_ordres_depasse', 'motif de refus attendu');
  assertEqual(tm.supplyOrders[pid].length, 5, 'seuls 5 ordres doivent être retenus');
  assertEqual(res.ignores, 4, '4 ordres devaient être écartés');
});

test("les ordres au-delà du budget ne sont pas exécutés du tout", async () => {
  const { tm } = await partieOrdres(2);
  const pid = tm.currentPlayerId;

  tm.submitOrders(ordresBidons(8));

  const rangsRetenus = tm.supplyOrders[pid].map(o => o.rang);
  assertEqual(rangsRetenus.join(','), '0,1,2,3,4', 'les 5 premiers ordres seulement');
});

test("les ordres dépensés en phase 1 sont décomptés du budget de la phase 4", async () => {
  const { gs, tm } = await partieOrdres(2);

  // Phase 1 : le premier joueur brûle tout son budget, le second n'en pose qu'un.
  const gros = tm.currentPlayerId;
  tm.submitOrders(ordresBidons(5));
  tm.confirmCurtain();
  const petit = tm.currentPlayerId;
  tm.submitOrders(ordresBidons(1));

  // Phases 2 et 3 : on traverse sans rien faire.
  tm.continueFromReveal();
  tm.endNegotiation();
  assertEqual(gs.phase, 4, 'on doit être arrivé en phase 4');
  tm.confirmCurtain();

  assertEqual(tm.maxOrdersForPhase(gros), 0, 'budget épuisé en phase 1 : plus aucun ordre en phase 4');
  assertEqual(tm.maxOrdersForPhase(petit), 4, 'un seul ordre consommé : il en reste 4');
});

test("un joueur au budget épuisé ne peut plus rien faire en phase 4", async () => {
  const { gs, tm } = await partieOrdres(2);

  const premier = tm.currentPlayerId;
  tm.submitOrders(ordresBidons(5));
  tm.confirmCurtain();
  tm.submitOrders(ordresBidons(5));
  tm.continueFromReveal();
  tm.endNegotiation();
  tm.confirmCurtain();

  const pid = tm.currentPlayerId;
  const res = tm.submitOrders(ordresBidons(3));
  assertEqual(res.ok, false, 'le dépassement doit être signalé');
  assertEqual(tm.moveOrders[pid].length, 0, 'aucun ordre de déplacement ne doit être retenu');
  assert(gs.phase === 4 || gs.phase === 5, 'la partie continue malgré le refus');
  assertEqual(premier >= 0, true);
});

test("un bonus d'actions augmente réellement le budget du tour", async () => {
  const { gs, tm } = await partieOrdres(2);
  const pid = tm.currentPlayerId;
  gs.joueurs[pid].actions_bonus = 2;

  const res = tm.submitOrders(ordresBidons(7));
  assertEqual(res.ok, true, '7 ordres sont légaux avec +2 actions');
  assertEqual(tm.supplyOrders[pid].length, 7, 'les 7 ordres doivent être retenus');
});

test("valider des ordres hors d'une phase de saisie est refusé et ne fait pas tourner le hotseat", async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  const tm = new TurnManager(gs, data.gameplay);
  tm.startTurn(); // on reste devant le rideau

  const avant = tm.currentPlayerIdx;
  const res = tm.submitOrders(ordresBidons(2));

  assertEqual(res.ok, false, 'refus attendu hors phase de saisie');
  assertEqual(res.reason, 'hors_phase_ordres', 'motif de refus attendu');
  assertEqual(tm.currentPlayerIdx, avant, 'la main ne doit pas passer au joueur suivant');
  assertEqual(tm.phase, PHASE.CURTAIN, "l'automate ne doit pas avoir bougé");
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Élections : plus jamais de maire fantôme
 * ═══════════════════════════════════════════════════════════ */

test("une élection sans vainqueur libère réellement la mairie", async () => {
  const { gs, tm, data } = await partieElection({ pouvoirs: [100, 100, 50, 50], maire: 0 });

  tm.applyElectionResult(null);

  assertEqual(gs.maire.joueur_id, null, 'aucun maire ne doit rester enregistré');
  assertEqual(gs.maire.privileges_restants, 0, 'aucun privilège ne doit survivre');
  assertEqual(porteursEcharpe(gs).length, 0, 'plus personne ne porte l\'écharpe');
  assertEqual(gs.joueurs[0].privileges_maire_restants, 0, 'le compteur miroir du sortant doit être remis à zéro');
  assertEqual(gs.getPlayerPoints(0, data.gameplay) < 15, true, "l'ancien maire ne doit plus toucher les 15 points de la fonction");
});

test("le drapeau est_maire et gs.maire ne se contredisent jamais après un scrutin", async () => {
  const { gs, tm } = await partieElection({ pouvoirs: [100, 80, 60, 40], maire: 0 });

  tm.applyElectionResult(2);

  assertEqual(gs.maire.joueur_id, 2, 'le nouvel élu doit être enregistré');
  assertEqual(porteursEcharpe(gs).join(','), '2', 'un seul porteur d\'écharpe, et c\'est l\'élu');
  assertEqual(gs.joueurs[0].est_maire, false, 'le sortant rend son écharpe');
  assertEqual(gs.joueurs[0].privileges_maire_restants, 0, 'le sortant perd ses privilèges');
  assertEqual(gs.joueurs[2].privileges_maire_restants, 2, "l'élu reçoit ses 2 privilèges");
  assertEqual(gs.maire.privileges_restants, 2, 'le compteur de la mairie est réarmé');
});

test("un vainqueur invalide est traité comme une absence de vainqueur", async () => {
  const { gs, tm } = await partieElection({ pouvoirs: [100, 80], maire: 0 });

  tm.applyElectionResult(42);

  assertEqual(gs.maire.joueur_id, null, 'un identifiant hors jeu ne peut pas devenir maire');
  assertEqual(porteursEcharpe(gs).length, 0, 'personne ne porte l\'écharpe');
});

/* ═══════════════════════════════════════════════════════════
 *  3 — Élections : cascade de départage
 * ═══════════════════════════════════════════════════════════ */

test("une égalité de voix est tranchée par la puissance électorale", async () => {
  const { tm, data } = await partieElection({ pouvoirs: [120, 100, 50, 50] });
  tm.votes = { 2: 0, 3: 1 };

  const r = tm.getElectionResults(data.gameplay);

  assertEqual(r.candidateVotes[0], r.candidateVotes[1], 'les deux favoris sont à égalité de voix');
  assertEqual(r.tied, true, "l'égalité doit être signalée");
  assertEqual(r.winner, 0, 'le plus fort électoralement l\'emporte');
  assertEqual(r.departage, DEPARTAGE.PUISSANCE, 'motif de départage attendu');
});

test("à puissance égale, le maire sortant s'efface devant son challenger", async () => {
  const { tm, data } = await partieElection({ pouvoirs: [100, 100, 50, 50], maire: 0 });
  tm.votes = { 2: 0, 3: 1 };

  const r = tm.getElectionResults(data.gameplay);

  assertEqual(r.winner, 1, "le challenger l'emporte sur le sortant");
  assertEqual(r.departage, DEPARTAGE.ANTI_CUMUL, 'motif de départage attendu');
});

test("à puissance égale et sans sortant en lice, le plus pauvre l'emporte", async () => {
  const { tm, data } = await partieElection({
    pouvoirs: [100, 100, 50, 50],
    lingots: [900, 120, 0, 0],
    maire: 2
  });
  tm.votes = { 2: 0, 3: 1 };

  const r = tm.getElectionResults(data.gameplay);

  assertEqual(r.winner, 1, "l'outsider le moins fortuné l'emporte");
  assertEqual(r.departage, DEPARTAGE.FORTUNE, 'motif de départage attendu');
});

test("une égalité irréductible laisse le siège vacant, et la mairie est vidée", async () => {
  const { gs, tm, data } = await partieElection({
    pouvoirs: [100, 100, 50, 50],
    lingots: [300, 300, 300, 300],
    maire: 2
  });
  tm.votes = { 2: 0, 3: 1 };

  const r = tm.getElectionResults(data.gameplay);
  assertEqual(r.winner, null, 'aucun vainqueur départageable');
  assertEqual(r.departage, DEPARTAGE.VACANT, 'motif de départage attendu');

  tm.applyElectionResult(r.winner);
  assertEqual(gs.maire.joueur_id, null, 'la mairie doit être vacante');
  assertEqual(porteursEcharpe(gs).length, 0, 'personne ne conserve l\'écharpe');
});

test("un scrutin remporté à la majorité simple n'invoque aucun départage", async () => {
  const { tm, data } = await partieElection({ pouvoirs: [100, 100, 50, 50] });
  tm.votes = { 0: 1, 2: 1, 3: 0 };

  const r = tm.getElectionResults(data.gameplay);

  assertEqual(r.winner, 1, 'le candidat le plus voté gagne');
  assertEqual(r.tied, false, 'aucune égalité');
  assertEqual(r.departage, DEPARTAGE.MAJORITE, 'motif de départage attendu');
});

/* ═══════════════════════════════════════════════════════════
 *  4 — Inéligibilité (carte 22 « Carte vidéo posthume »)
 * ═══════════════════════════════════════════════════════════ */

test("un joueur rendu inéligible ne figure pas parmi les candidats du scrutin", async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  const tm = new TurnManager(gs, data.gameplay);

  gs.joueurs[1]._ineligible = true;
  gs.tour = 7;
  // La vraie fin de mandat efface le marqueur : l'automate doit l'avoir
  // photographié AVANT, sinon la carte n'a aucun effet.
  tm.onEndOfMandate = () => { gs.joueurs.forEach(j => { delete j._ineligible; }); };
  tm.nextTurn();

  assertEqual(tm.phase, PHASE.PRE_ELECTION, 'le scrutin doit s\'ouvrir au tour 7');
  assertEqual(tm.getEligibleCandidates().includes(1), false, "l'inéligible n'est pas candidat");
  assertEqual(tm.getEligibleCandidates().join(','), '0,2', 'les autres restent candidats');
});

test("les voix portées sur un inéligible sont perdues et ne l'élisent pas", async () => {
  const { gs, tm, data } = await partieElection({ pouvoirs: [100, 100, 100] });
  gs.joueurs[1]._ineligible = true;
  gs.tour = 7;
  tm.onEndOfMandate = () => { gs.joueurs.forEach(j => { delete j._ineligible; }); };
  tm.nextTurn();

  tm.votes = { 0: 1, 1: 1, 2: 0 };
  const r = tm.getElectionResults(data.gameplay);

  assertEqual(r.candidateVotes[1], 0, "l'inéligible ne récolte aucune voix");
  assertEqual(r.bulletinsNuls, 200, 'les deux bulletins pour l\'inéligible sont nuls');
  assertEqual(r.winner, 0, 'le seul candidat recevable ayant des voix est élu');
});

test("si plus personne n'est éligible, le scrutin redevient ouvert à tous", async () => {
  const { gs, tm } = await partieElection({ pouvoirs: [100, 100] });
  gs.joueurs.forEach(j => { j._ineligible = true; });
  gs.tour = 7;
  tm.onEndOfMandate = null;
  tm.nextTurn();

  assertEqual(tm.getEligibleCandidates().join(','), '0,1', 'une élection sans candidat est impossible');
});

/* ═══════════════════════════════════════════════════════════
 *  5 — Reprise d'un tour interrompu
 * ═══════════════════════════════════════════════════════════ */

/** Rejoue le trajet complet sauvegarde → localStorage → chargement. */
function rechargerDepuisSauvegarde(gs) {
  const brut = JSON.parse(JSON.stringify(gs.serialize()));
  const res = GameState.deserialize(brut);
  assertEqual(res.ok, true, 'la sauvegarde doit rester chargeable');
  return res.state;
}

/** Joue toute la phase 1 puis les ordres du premier joueur de la phase 4. */
async function partieInterrompueEnPhase4() {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  const tm = new TurnManager(gs, data.gameplay);
  tm.startTurn();

  const consommes = {};
  for (let i = 0; i < 3; i++) {
    tm.confirmCurtain();
    const pid = tm.currentPlayerId;
    const n = i + 1; // 1, 2 puis 3 ordres
    consommes[pid] = n;
    tm.submitOrders(ordresBidons(n));
  }
  tm.continueFromReveal();
  tm.endNegotiation();
  tm.confirmCurtain();
  tm.submitOrders(ordresBidons(1));

  return { gs, tm, data, consommes };
}

test("un tour interrompu en phase 4 reprend en phase 4, pas en phase 1", async () => {
  const { gs, tm, data } = await partieInterrompueEnPhase4();

  const gs2 = rechargerDepuisSauvegarde(gs);
  const tm2 = new TurnManager(gs2, data.gameplay);
  const r = tm2.startOrResume();

  assertEqual(r.repris, true, 'le tour en cours doit être repris');
  assertEqual(gs2.phase, 4, 'la partie doit rester en phase 4');
  assertEqual(tm2.phase, tm.phase, "l'automate reprend exactement la même étape");
});

test("la reprise rend la main au joueur qui n'avait pas encore joué", async () => {
  const { gs, tm, data } = await partieInterrompueEnPhase4();

  const gs2 = rechargerDepuisSauvegarde(gs);
  const tm2 = new TurnManager(gs2, data.gameplay);
  tm2.startOrResume();

  assertEqual(tm2.currentPlayerId, tm.currentPlayerId, 'même joueur à la manœuvre');
  assertEqual(tm2.playerQueue.join(','), tm.playerQueue.join(','), "l'ordre de passage est conservé");
});

test("la reprise conserve les ordres déjà validés par les autres joueurs", async () => {
  const { gs, tm, data } = await partieInterrompueEnPhase4();

  const gs2 = rechargerDepuisSauvegarde(gs);
  const tm2 = new TurnManager(gs2, data.gameplay);
  tm2.startOrResume();

  assertEqual(
    JSON.stringify(tm2.supplyOrders),
    JSON.stringify(tm.supplyOrders),
    "les ordres d'approvisionnement du tour sont conservés"
  );
  assertEqual(
    JSON.stringify(tm2.moveOrders),
    JSON.stringify(tm.moveOrders),
    'les ordres de déplacement déjà validés sont conservés'
  );
});

test("la reprise ne réoffre pas un budget d'ordres neuf", async () => {
  const { gs, tm, data, consommes } = await partieInterrompueEnPhase4();

  const gs2 = rechargerDepuisSauvegarde(gs);
  const tm2 = new TurnManager(gs2, data.gameplay);
  tm2.startOrResume();

  Object.entries(consommes).forEach(([pid, n]) => {
    assertEqual(
      tm2.maxOrdersForPhase(Number(pid)),
      5 - n,
      `le joueur ${pid} doit retrouver son budget entamé (${n} ordre(s) déjà dépensé(s))`
    );
  });
});

test("un scrutin interrompu reprend au dépouillement avec les votes déjà exprimés", async () => {
  const data = await loadData();
  const gs = await makeGame(3, { data });
  const tm = new TurnManager(gs, data.gameplay);
  gs.tour = 7;
  gs.joueurs[1]._ineligible = true;
  tm.onEndOfMandate = () => { gs.joueurs.forEach(j => { delete j._ineligible; }); };
  tm.nextTurn();

  tm.confirmPreElection();
  tm.confirmElectionCurtain();
  tm.submitVote(0);

  const gs2 = rechargerDepuisSauvegarde(gs);
  const tm2 = new TurnManager(gs2, data.gameplay);
  tm2.startOrResume();

  assertEqual(tm2.phase, tm.phase, "l'automate reprend dans le scrutin, pas dans un tour neuf");
  assertEqual(JSON.stringify(tm2.votes), JSON.stringify(tm.votes), 'les bulletins déjà déposés sont conservés');
  assertEqual(tm2.ineligibles.join(','), '1', "l'inéligibilité du scrutin en cours survit au rechargement");
});

test("un état de tour qui ne correspond pas à la partie est ignoré au lieu d'être appliqué", async () => {
  const { gs, data } = await partieInterrompueEnPhase4();

  const gs2 = rechargerDepuisSauvegarde(gs);
  gs2.tour = gs2.tour + 3; // la sauvegarde du tour ne parle plus de ce tour-ci
  const tm2 = new TurnManager(gs2, data.gameplay);
  const r = tm2.startOrResume();

  assertEqual(r.repris, false, 'un cliché périmé doit être rejeté');
  assertEqual(r.reason, 'tour_desynchronise', 'motif de rejet attendu');
  assertEqual(gs2.phase, 1, 'un tour neuf est démarré proprement');
  assertEqual(tm2.phase, PHASE.CURTAIN, "l'automate repart du rideau");
});

test("une partie neuve démarre un tour au lieu d'échouer à reprendre", async () => {
  const data = await loadData();
  const gs = await makeGame(2, { data });
  const tm = new TurnManager(gs, data.gameplay);

  const r = tm.startOrResume();

  assertEqual(r.repris, false, 'rien à reprendre sur une partie neuve');
  assertEqual(gs.phase, 1, 'la partie commence en phase 1');
  assertEqual(tm.phase, PHASE.CURTAIN, 'le premier rideau est affiché');
});

test("l'état de tour voyage dans la sauvegarde du GameState", async () => {
  const { gs } = await partieInterrompueEnPhase4();
  const brut = JSON.parse(JSON.stringify(gs.serialize()));

  assert(brut.etat_tour, "l'état de tour doit faire partie de la sauvegarde");
  assertEqual(brut.etat_tour.phase_jeu, 4, 'la phase de jeu est sauvegardée');
  assertEqual(Array.isArray(brut.etat_tour.playerQueue), true, "l'ordre de passage est sauvegardé");
});

/* ═══════════════════════════════════════════════════════════
 *  6 — Invariant de bout en bout
 * ═══════════════════════════════════════════════════════════ */

test("sur une partie complète, la mairie n'est jamais portée par deux joueurs ni par un fantôme", async () => {
  const data = await loadData();
  let controles = 0;

  const r = await simulateGame(3, 8, {
    data,
    graine: 424242,
    surEtape: ({ gs }) => {
      controles++;
      const porteurs = porteursEcharpe(gs);
      assert(porteurs.length <= 1, `au plus un maire à la fois (vu : ${porteurs.join(',')})`);
      if (gs.maire.joueur_id === null) {
        assertEqual(porteurs.length, 0, 'mairie vacante : personne ne porte l\'écharpe');
        assertEqual(gs.maire.privileges_restants, 0, 'mairie vacante : aucun privilège actif');
      } else {
        assertEqual(porteurs.join(','), String(gs.maire.joueur_id), 'le porteur de l\'écharpe est le maire enregistré');
      }
    }
  });

  assert(controles > 50, 'la simulation doit avoir réellement tourné');
  assertEqual(r.softlock, null, 'la partie ne doit pas se bloquer');
});

test("sur une partie complète, aucun joueur ne dépasse son budget d'ordres", async () => {
  const data = await loadData();

  await simulateGame(3, 6, {
    data,
    graine: 91,
    surEtape: ({ gs, tm }) => {
      if (gs.phase !== 4) return;
      gs.joueurs.forEach((j, pid) => {
        const total = 5 + (j.actions_bonus || 0);
        const utilises = (tm.supplyOrders[pid] || []).length + (tm.moveOrders[pid] || []).length;
        assert(utilises <= total, `le joueur ${pid} a validé ${utilises} ordres pour un budget de ${total}`);
      });
    }
  });
});
