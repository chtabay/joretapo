/**
 * Le TurnManager est l'automate qui fait tourner la partie : cinq phases par
 * tour, un rideau entre chaque joueur (c'est du hotseat, l'écran est partagé),
 * et tous les sept tours une élection puis un draft de cartes.
 *
 * Deux règles y sont enfouies et invisibles à l'écran, donc testées ici en
 * priorité :
 *   - le budget de 5 ordres est COMMUN aux phases 1 et 4 (spec 01, « chaque
 *     joueur dispose de 5 ordres par tour, répartis entre approvisionnement et
 *     déplacement ») ;
 *   - le poids électoral d'un joueur est la population des zones où il a un
 *     homme armé ou une construction — les prostituées ne votent pas.
 *
 * Plateau fictif de 8 zones, 4 quartiers à 100 000 habitants par zone (helpers).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { newTestGame, place, readJson, testCity, ROOT } from './helpers.mjs';

const { TurnManager, PHASE } = await import(`${ROOT}/js/turn-manager.js`);
const { GameState } = await import(`${ROOT}/js/game-state.js`);
const { RULES } = await import(`${ROOT}/js/rules.js`);
const MANDAT = RULES.toursParMandat;

/** Fabrique un manager déjà branché sur une partie de test. */
async function newManager(nbJoueurs = 3) {
  const { gs, city } = await newTestGame(nbJoueurs);
  const tm = new TurnManager(gs, city);
  return { gs, city, tm };
}

const achat = () => ({ type: 'acheter', ressource: 'doses', quantite: 1 });
const deplacement = (from, to) => ({ type: 'deplacer', from, to, pion_type: 'dealer' });

/**
 * Fait passer tout le monde dans une phase de saisie : rideau, puis ordres.
 * Rend la liste des joueurs vus, dans l'ordre de la file.
 */
function passeToutLeMonde(tm, ordresDe = () => []) {
  const vus = [];
  const total = tm.playerQueue.length;
  for (let k = 0; k < total; k++) {
    assert.equal(tm.phase, PHASE.CURTAIN,
      'chaque joueur doit trouver le rideau avant de voir le plateau');
    const pid = tm.currentPlayerId;
    tm.confirmCurtain();
    vus.push(pid);
    tm.submitOrders(ordresDe(pid));
  }
  return vus;
}

/* ── Enchaînement des cinq phases ───────────────────────────────────────── */

test('un tour commence derrière le rideau, en phase 1', async () => {
  const { gs, tm } = await newManager(3);

  tm.startTurn();

  assert.equal(gs.phase, 1, 'le tour démarre à la phase d\'approvisionnement');
  assert.equal(tm.phase, PHASE.CURTAIN, 'et personne ne voit le plateau avant d\'avoir confirmé');
  assert.equal(tm.isOrderPhase(), false, 'le rideau n\'est pas une phase de saisie');

  tm.confirmCurtain();
  assert.equal(tm.phase, PHASE.ORDERS_SUPPLY, 'le rideau levé, le joueur écrit ses ordres');
  assert.equal(tm.isOrderPhase(), true);
});

test('la file de saisie contient tous les joueurs, une seule fois chacun', async () => {
  const { tm } = await newManager(5);

  tm.startTurn();

  assert.equal(tm.playerQueue.length, 5, 'les cinq joueurs jouent');
  assert.deepEqual([...tm.playerQueue].sort((a, b) => a - b), [0, 1, 2, 3, 4],
    'chaque joueur figure exactement une fois dans la file');
});

test('la phase 1 n\'avance qu\'une fois que tous les joueurs ont rendu leurs ordres', async () => {
  const { gs, tm } = await newManager(3);
  tm.startTurn();

  tm.confirmCurtain();
  tm.submitOrders([achat()]);
  assert.equal(gs.phase, 1, 'un joueur rendu, la phase ne bouge pas');
  assert.equal(tm.phase, PHASE.CURTAIN, 'le rideau retombe pour le joueur suivant');

  tm.confirmCurtain();
  tm.submitOrders([achat()]);
  assert.equal(gs.phase, 1, 'deux joueurs rendus, toujours pas');

  tm.confirmCurtain();
  tm.submitOrders([achat()]);
  assert.equal(gs.phase, 2, 'le dernier ordre rendu ouvre la révélation');
  assert.equal(tm.phase, PHASE.REVEAL_HARVEST);
});

test('chaque joueur passe à son tour et ses ordres sont conservés séparément', async () => {
  const { tm } = await newManager(4);
  tm.startTurn();

  const vus = passeToutLeMonde(tm, pid => [achat(), { type: 'note', pid }]);

  assert.deepEqual([...vus].sort((a, b) => a - b), [0, 1, 2, 3],
    'les quatre joueurs ont saisi, chacun une fois');
  vus.forEach(pid => {
    assert.equal(tm.supplyOrders[pid].length, 2, `les ordres de J${pid} sont enregistrés`);
    assert.equal(tm.supplyOrders[pid][1].pid, pid, 'et ne sont pas mélangés avec ceux des autres');
  });
});

test('un tour complet enchaîne saisie, récolte, négociation, déplacements et résolution', async () => {
  const { gs, tm } = await newManager(3);
  tm.startTurn();

  passeToutLeMonde(tm, () => [achat()]);
  assert.equal(gs.phase, 2);
  assert.equal(tm.phase, PHASE.REVEAL_HARVEST, 'phase 2 : révélation et récolte');

  tm.continueFromReveal();
  assert.equal(gs.phase, 3);
  assert.equal(tm.phase, PHASE.NEGOTIATION, 'phase 3 : négociation');

  tm.endNegotiation();
  assert.equal(gs.phase, 4);
  assert.equal(tm.phase, PHASE.CURTAIN, 'phase 4 : on repasse par le rideau, la saisie est secrète');

  assert.deepEqual([...tm.playerQueue].sort((a, b) => a - b), [0, 1, 2],
    'la phase 4 refait passer tous les joueurs, une fois chacun');

  passeToutLeMonde(tm, () => [deplacement('A1', 'A2')]);
  assert.equal(gs.phase, 5);
  assert.equal(tm.phase, PHASE.REVEAL_RESOLVE, 'phase 5 : résolution des conflits');

  tm.continueFromReveal();
  assert.equal(tm.phase, PHASE.TURN_END, 'puis le bilan de fin de tour');
});

test('en phase 4 le rideau ouvre sur la saisie des déplacements, pas sur celle des achats', async () => {
  const { tm } = await newManager(2);
  tm.startTurn();
  passeToutLeMonde(tm, () => []);
  tm.continueFromReveal();
  tm.endNegotiation();

  tm.confirmCurtain();

  assert.equal(tm.phase, PHASE.ORDERS_MOVE);
});

test('chaque transition sauvegarde la partie et prévient l\'interface', async () => {
  const { gs, tm } = await newManager(2);
  let emissions = 0;
  let sauvegardes = 0;
  tm.onChange = () => { emissions++; };
  const save = gs.save.bind(gs);
  gs.save = () => { sauvegardes++; save(); };

  tm.startTurn();
  tm.confirmCurtain();

  assert.equal(emissions, 2, 'le démarrage et la levée du rideau sont notifiés');
  assert.equal(sauvegardes, 2, 'et chacun est sauvegardé');
});

/* ── Budget d'ordres, commun aux phases 1 et 4 ──────────────────────────── */

test('un joueur dispose de 5 ordres par tour, à répartir entre la phase 1 et la phase 4', async () => {
  const { gs, tm } = await newManager(2);
  tm.startTurn();

  assert.equal(tm.maxOrdersForPhase(0), 5, 'phase 1 : le budget complet est offert');
  assert.equal(tm.maxOrdersForPhase(1), 5);

  /* Le premier joueur de la file dépense 2 ordres, l'autre n'en dépense aucun. */
  const premier = tm.currentPlayerId;
  tm.confirmCurtain();
  tm.submitOrders([achat(), achat()]);
  const second = tm.currentPlayerId;
  tm.confirmCurtain();
  tm.submitOrders([]);

  tm.continueFromReveal();
  tm.endNegotiation();

  assert.equal(gs.phase, 4);
  assert.equal(tm.maxOrdersForPhase(premier), 3,
    'ce qui a été dépensé en approvisionnement manque aux déplacements');
  assert.equal(tm.maxOrdersForPhase(second), 5,
    'celui qui n\'a rien dépensé garde ses cinq ordres');
});

test('un joueur qui brûle ses 5 ordres en phase 1 arrive en phase 4 sans aucun ordre', async () => {
  const { gs, tm } = await newManager(2);
  tm.startTurn();

  const gourmand = tm.currentPlayerId;
  tm.confirmCurtain();
  tm.submitOrders([achat(), achat(), achat(), achat(), achat()]);
  tm.confirmCurtain();
  tm.submitOrders([]);

  tm.continueFromReveal();
  tm.endNegotiation();

  assert.equal(gs.phase, 4);
  assert.equal(tm.maxOrdersForPhase(gourmand), 0,
    'le budget est commun aux deux phases : il ne reste rien à déplacer');
});

test('actions_bonus augmente le budget d\'ordres du tour', async () => {
  const { gs, tm } = await newManager(2);
  gs.joueurs[0].actions_bonus = 2;
  tm.startTurn();

  assert.equal(tm.maxOrdersForPhase(0), 7, 'le bonus s\'ajoute aux cinq ordres de base');
  assert.equal(tm.maxOrdersForPhase(1), 5, 'et ne profite qu\'à son bénéficiaire');
});

test('le bonus d\'actions reste disponible en phase 4 après une phase 1 dépensière', async () => {
  const { gs, tm } = await newManager(2);
  gs.joueurs[0].actions_bonus = 2;
  tm.startTurn();

  /* J0 dépense ses 5 ordres de base en phase 1 : il doit lui rester son bonus. */
  tm.supplyOrders[0] = [achat(), achat(), achat(), achat(), achat()];
  tm.ordersUsedP1[0] = 5;
  gs.phase = 4;

  assert.equal(tm.maxOrdersForPhase(0), 2);
});

test('un nouveau tour rend à chacun l\'intégralité de son budget', async () => {
  const { gs, tm } = await newManager(2);
  tm.startTurn();
  tm.confirmCurtain();
  tm.submitOrders([achat(), achat(), achat()]);
  const depensier = tm.playerQueue[0];

  tm.confirmCurtain();
  tm.submitOrders([]);
  tm.continueFromReveal();
  tm.endNegotiation();
  passeToutLeMonde(tm, () => []);
  tm.continueFromReveal();
  tm.nextTurn();

  assert.equal(gs.tour, 2);
  assert.equal(tm.maxOrdersForPhase(depensier), 5, 'les compteurs sont remis à zéro');
  assert.deepEqual(tm.supplyOrders[depensier], [], 'et les ordres du tour précédent sont oubliés');
});

/* ── Fin de tour et déclenchement de l'élection ─────────────────────────── */

test('les tours ordinaires s\'enchaînent sans élection', async () => {
  const { gs, tm } = await newManager(3);

  for (let tour = 1; tour < MANDAT; tour++) {
    gs.tour = tour;
    tm.nextTurn();
    assert.equal(gs.tour, tour + 1, `le tour ${tour} mène au tour ${tour + 1}`);
    assert.equal(tm.phase, PHASE.CURTAIN, 'et non à une élection');
    assert.equal(gs.phase, 1);
  }
});

test('l\'élection se déclenche à la fin de chaque mandat', async () => {
  /* La durée du mandat est un réglage : le test dit la règle, pas le chiffre.
     Elle est passée de 7 à 6 tours parce qu'à 7, avec une fin de partie au 14e,
     le second scrutin tombait pile sur la fin et n'avait jamais lieu. */
  const { gs, tm } = await newManager(3);

  gs.tour = MANDAT;
  tm.nextTurn();
  assert.equal(tm.phase, PHASE.PRE_ELECTION, `fin du tour ${MANDAT} : on vote`);
  assert.equal(gs.tour, MANDAT, 'le tour n\'avance pas tant que l\'élection n\'est pas jouée');

  gs.tour = MANDAT * 2;
  tm.nextTurn();
  assert.equal(tm.phase, PHASE.PRE_ELECTION, `et de nouveau à la fin du tour ${MANDAT * 2}`);
});

test('le second scrutin tombe avant la fin de la partie', async () => {
  /* C'est la raison d'être du mandat de six tours : à sept, la seconde élection
     tombait exactement sur la fin dure et le maire élu au premier scrutin
     gardait ses 15 points — 44 % du seuil — sans jamais les redéfendre. Mesuré
     au banc : le titre changeait de mains dans 0 % des parties. */
  assert.ok(MANDAT * 2 < RULES.finDePartie,
    `deux mandats de ${MANDAT} tours doivent tenir dans les ${RULES.finDePartie} tours de la partie`);
});

test('la fin de mandat est notifiée avant l\'ouverture du scrutin', async () => {
  const { gs, tm } = await newManager(2);
  let mandatsClos = 0;
  tm.onEndOfMandate = () => { mandatsClos++; };

  gs.tour = MANDAT;
  tm.nextTurn();

  assert.equal(mandatsClos, 1);
});

test('le scrutin fait voter chaque joueur derrière le rideau, une seule fois', async () => {
  const { gs, tm } = await newManager(3);
  gs.tour = MANDAT;
  tm.nextTurn();

  tm.confirmPreElection();
  assert.equal(tm.phase, PHASE.ELECTION_CURTAIN);
  assert.deepEqual([...tm.playerQueue].sort((a, b) => a - b), [0, 1, 2],
    'les trois joueurs votent, une fois chacun');

  const votants = [];
  for (let k = 0; k < 3; k++) {
    assert.equal(tm.phase, PHASE.ELECTION_CURTAIN, 'le vote est à bulletin secret');
    tm.confirmElectionCurtain();
    assert.equal(tm.phase, PHASE.ELECTION_VOTE);
    votants.push(tm.currentPlayerId);
    tm.submitVote((tm.currentPlayerId + 1) % 3);
  }

  assert.deepEqual([...votants].sort((a, b) => a - b), [0, 1, 2]);
  assert.equal(tm.phase, PHASE.ELECTION_RESULT, 'le dernier bulletin ouvre le dépouillement');
});

test('après le dépouillement viennent le draft de cartes puis le tour suivant', async () => {
  const { gs, tm } = await newManager(2);
  gs.tour = MANDAT;
  place(gs, 'A1', 'dealer', 0);
  place(gs, 'B1', 'dealer', 1);
  tm.nextTurn();

  tm.confirmPreElection();
  for (let k = 0; k < 2; k++) {
    tm.confirmElectionCurtain();
    tm.submitVote(0);
  }
  tm.applyElectionResult(0);

  assert.equal(tm.phase, PHASE.DRAFT_CURTAIN, 'le draft suit l\'élection');
  assert.deepEqual([...tm.playerQueue].sort((a, b) => a - b), [0, 1],
    'tous les joueurs draftent, une fois chacun');

  tm.confirmDraftCurtain();
  assert.equal(tm.phase, PHASE.DRAFT_PICK);
  tm.submitDraftPick();
  assert.equal(tm.phase, PHASE.DRAFT_CURTAIN, 'au suivant, derrière le rideau');
  assert.equal(gs.tour, MANDAT, 'le tour n\'a pas encore avancé');

  tm.confirmDraftCurtain();
  tm.submitDraftPick();

  assert.equal(gs.tour, MANDAT + 1, `le draft terminé, le tour ${MANDAT + 1} commence`);
  assert.equal(gs.phase, 1);
  assert.equal(tm.phase, PHASE.CURTAIN);
});

test('le vainqueur devient maire et l\'ancien maire perd son titre', async () => {
  const { gs, tm } = await newManager(3);
  gs.maire = { joueur_id: 2, privileges_restants: 1, tour_election: 1 };
  gs.joueurs[2].est_maire = true;
  gs.tour = MANDAT;
  tm.nextTurn();
  tm.confirmPreElection();
  for (let k = 0; k < 3; k++) { tm.confirmElectionCurtain(); tm.submitVote(1); }

  tm.applyElectionResult(1);

  assert.equal(gs.maire.joueur_id, 1);
  assert.equal(gs.joueurs[1].est_maire, true);
  assert.equal(gs.joueurs[2].est_maire, false, 'le sortant redevient un joueur ordinaire');
  assert.equal(gs.joueurs[1].privileges_maire_restants, 2, 'le mandat rouvre deux privilèges');
  assert.equal(gs.maire.tour_election, MANDAT);
});

/* ── Dépouillement ──────────────────────────────────────────────────────── */

test('le poids d\'un votant est la population des zones qu\'il tient par les armes ou le béton', async () => {
  const { gs, city, tm } = await newManager(3);

  /* J0 : deux zones tenues par des hommes armés. */
  place(gs, 'A1', 'dealer', 0);
  place(gs, 'A2', 'trafiquant', 0);

  /* J1 : une prostituée (qui ne vote pas) et une construction (qui vote). */
  place(gs, 'B1', 'prostituee_base', 1);
  place(gs, 'B2', 'prostituee_luxe', 1);
  gs.plateau['B2'].construction = 'casino';

  /* J2 : une zone armée, plus une clientèle achetée, moins un scandale. */
  place(gs, 'C1', 'dealer', 2);
  gs.joueurs[2].electeurs_bonus = 50000;
  gs.joueurs[2].electeurs_malus = 20000;

  tm.votes = {};
  const { voterPower } = tm.getElectionResults(city);

  assert.equal(voterPower[0], 200000, 'deux zones armées à 100 000 habitants');
  assert.equal(voterPower[1], 100000, 'seule la zone construite compte : les prostituées ne votent pas');
  assert.equal(voterPower[2], 130000, '100 000 + 50 000 de bonus − 20 000 de malus');
});

test('une construction ne pèse que pour le propriétaire de la zone', async () => {
  const { gs, city, tm } = await newManager(2);
  place(gs, 'A1', 'dealer', 0);
  gs.plateau['A1'].construction = 'bordel';
  /* La zone appartient à J0 : J1 ne doit rien en tirer. */

  tm.votes = {};
  const { voterPower } = tm.getElectionResults(city);

  assert.equal(voterPower[0], 100000, 'une seule voix de zone, pas une par titre');
  assert.equal(voterPower[1], 0);
});

test('un poids électoral négatif est ramené à zéro', async () => {
  const { gs, city, tm } = await newManager(2);
  place(gs, 'A1', 'dealer', 0);
  gs.joueurs[0].electeurs_malus = 300000;

  tm.votes = {};
  const { voterPower } = tm.getElectionResults(city);

  assert.equal(voterPower[0], 0, 'on ne vote pas en négatif');
});

test('le candidat qui récolte le plus de voix est élu', async () => {
  const { gs, city, tm } = await newManager(3);
  place(gs, 'A1', 'dealer', 0);                       /* J0 : 100 000 */
  place(gs, 'B1', 'dealer', 1); place(gs, 'B2', 'dealer', 1);   /* J1 : 200 000 */
  place(gs, 'C1', 'dealer', 2);                       /* J2 : 100 000 */

  tm.votes = { 0: 2, 1: 2, 2: 0 };
  const res = tm.getElectionResults(city);

  assert.equal(res.candidateVotes[2], 300000, 'J2 encaisse les voix de J0 et de J1');
  assert.equal(res.candidateVotes[0], 100000);
  assert.equal(res.candidateVotes[1], 0);
  assert.equal(res.winner, 2);
  assert.equal(res.tied, false);
});

test('un joueur sans terrain ni construction ne pèse rien dans l\'urne', async () => {
  const { gs, city, tm } = await newManager(2);
  place(gs, 'A1', 'dealer', 0);

  tm.votes = { 1: 1 };  /* J1, ruiné, vote : son bulletin ne vaut aucune voix */
  const res = tm.getElectionResults(city);

  assert.equal(res.candidateVotes[1], 0);
  assert.equal(res.winner, null, 'aucun candidat n\'a de voix, il n\'y a pas d\'élu');
});

test('une égalité parfaite ne désigne aucun maire', async () => {
  const { gs, city, tm } = await newManager(2);
  place(gs, 'A1', 'dealer', 0);
  place(gs, 'B1', 'dealer', 1);

  tm.votes = { 0: 1, 1: 0 };  /* chacun vote pour l'autre, à poids égal */
  const res = tm.getElectionResults(city);

  assert.equal(res.candidateVotes[0], 100000);
  assert.equal(res.candidateVotes[1], 100000);
  assert.equal(res.tied, true, 'l\'égalité est signalée');
  assert.equal(res.winner, null, 'et le fauteuil reste vide');
});

/* Le vote pour soi-même n'est interdit nulle part dans le moteur, et l'écran de
   vote (app.js renderElectionVote) propose bien le votant parmi les candidats.
   Or le titre de maire vaut 15 points, la plus grosse source du jeu : si chacun
   peut voter pour lui-même, l'équilibre rationnel est l'auto-vote et le maire
   est mécaniquement le joueur qui contrôle déjà le plus de population — donc
   celui qui est déjà en tête. L'élection cesse d'être un choix. La spec dit
   « vote à bulletin secret pour le candidat de son choix » sans trancher, mais
   une élection dont l'issue est calculable d'avance n'est pas une mécanique de
   jeu : on tranche pour le refus de l'auto-vote. */
test('un joueur ne peut pas voter pour lui-même',
  async () => {
    const { gs, city, tm } = await newManager(2);
    place(gs, 'A1', 'dealer', 0);
    place(gs, 'B1', 'dealer', 1);
    gs.tour = MANDAT;
    tm.nextTurn();
    tm.confirmPreElection();
    tm.confirmElectionCurtain();

    const votant = tm.currentPlayerId;
    tm.submitVote(votant);

    const res = tm.getElectionResults(city);
    assert.equal(res.candidateVotes[votant], 0,
      'un bulletin en sa propre faveur doit être refusé ou ignoré');
  });

/* ── Persistance (anomalie B2) ──────────────────────────────────────────── */

/* supplyOrders, moveOrders, ordersUsedP1, votes et draftHands vivent sur
   l'instance TurnManager et non dans le GameState : serialize() ne les voit
   pas. Une partie hotseat se joue sur des heures, la sauvegarde est le seul
   filet ; recharger au milieu d'une phase de saisie efface les ordres déjà
   rendus et rend son budget à un joueur qui l'avait dépensé. resumePhase()
   existe pour ce cas et n'est appelé de nulle part dans app.js. */

/* Anciennement en echec (B2) : l'etat de la manche vivait hors du GameState.
   Il est desormais range dans gs.manche et serialise automatiquement. */
test('les ordres déjà rendus survivent à une sauvegarde et un rechargement',
  async () => {
    const { gs, city, tm } = await newManager(3);
    tm.startTurn();
    const premier = tm.currentPlayerId;
    tm.confirmCurtain();
    tm.submitOrders([achat(), achat()]);   /* _emit() a sauvegardé */

    const gs2 = GameState.load();
    const tm2 = new TurnManager(gs2, city);
    tm2.resumePhase();

    assert.deepEqual(tm2.supplyOrders[premier], [achat(), achat()],
      'les ordres du joueur qui a déjà joué doivent être retrouvés');
    assert.equal(tm2.ordersUsedP1[premier], 2,
      'et son budget doit rester entamé');
  });

test('les bulletins et les mains de draft survivent à une sauvegarde et un rechargement',
  async () => {
    const { gs, city, tm } = await newManager(2);
    place(gs, 'A1', 'dealer', 0);
    place(gs, 'B1', 'dealer', 1);
    gs.tour = MANDAT;
    tm.nextTurn();
    tm.confirmPreElection();
    tm.confirmElectionCurtain();
    const votant = tm.currentPlayerId;
    tm.submitVote((votant + 1) % 2);
    tm.setDraftHands({ 0: ['carte-1'], 1: ['carte-2'] });
    gs.save();

    const gs2 = GameState.load();
    const tm2 = new TurnManager(gs2, city);

    assert.equal(tm2.votes?.[votant], (votant + 1) % 2,
      'un bulletin déjà déposé ne doit pas disparaître au rechargement');
    assert.deepEqual(tm2.draftHands?.[0], ['carte-1'],
      'ni la main de cartes proposée au joueur');
  });

/* ── Draft de cartes ────────────────────────────────────────────────────── */

test('le nombre de cartes à garder se mesure avant le tirage, pas sur ce qu\'il en reste', async () => {
  /* draftPhase vide la pioche. En relisant la taille du draft APRES le tirage,
     l'interface annoncait « gardez 4 sur 8 » et n'en distribuait qu'une a six
     joueurs, deux a cinq. La regle : ce qu'on promet au joueur est ce qu'on lui
     donne, quel que soit le nombre de joueurs. */
  const { MagouilleEngine } = await import(`${ROOT}/js/magouille-engine.js`);
  const { RULES } = await import(`${ROOT}/js/rules.js`);
  const cartes = readJson('data/cartes-magouille.json');

  for (const n of [3, 4, 5, 6]) {
    const { gs, city } = await newTestGame(n);
    MagouilleEngine.initDeck(gs, cartes);

    const annonce = MagouilleEngine.tailleDraft(gs, n);
    const mains = MagouilleEngine.draftPhase(gs, cartes);

    assert.equal(annonce.garde, RULES.draftGarde, `${n} joueurs : on garde bien ${RULES.draftGarde} cartes`);
    Object.values(mains).forEach(main => {
      assert.ok(main.length >= annonce.garde,
        `${n} joueurs : une main de ${main.length} cartes ne permet pas d'en garder ${annonce.garde}`);
    });
  }
});

test('recharger la partie pendant une saisie repasse par le rideau', async () => {
  /* La sauvegarde est écrite à chaque changement de phase. Sans ce retour, un
     rafraîchissement rouvrait directement la feuille d'ordres du joueur courant,
     avec sa caisse et ses stocks, sans que personne ait déclaré tenir la
     tablette — le rideau est le seul verrou d'identité du hotseat. */
  const { gs, tm } = await newManager(3);
  tm.confirmCurtain();
  assert.equal(tm.phase, PHASE.ORDERS_SUPPLY, 'on est bien en saisie');

  const repris = new TurnManager(gs, testCity());
  repris.resumePhase();

  assert.equal(repris.phase, PHASE.CURTAIN, 'la reprise commence par le rideau');
  assert.equal(repris.currentPlayerId, tm.currentPlayerId, 'et c\'est le même joueur qui doit le lever');
});

test('recharger pendant un vote ou un draft repasse aussi par leur rideau', async () => {
  const { gs, tm } = await newManager(3);
  gs.tour = MANDAT;
  tm.nextTurn();
  tm.confirmPreElection();
  tm.confirmElectionCurtain();
  assert.equal(tm.phase, PHASE.ELECTION_VOTE);

  const repris = new TurnManager(gs, testCity());
  repris.resumePhase();

  assert.equal(repris.phase, PHASE.ELECTION_CURTAIN, 'le bulletin est secret lui aussi');
});
