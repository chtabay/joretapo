import { RULES } from './rules.js';

export const PHASE = {
  CURTAIN: 'curtain',
  ORDERS_SUPPLY: 'orders_supply',
  REVEAL_HARVEST: 'reveal_harvest',
  NEGOTIATION: 'negotiation',
  ORDERS_MOVE: 'orders_move',
  REVEAL_RESOLVE: 'reveal_resolve',
  TURN_END: 'turn_end',
  PRE_ELECTION: 'pre_election',
  ELECTION_CURTAIN: 'election_curtain',
  ELECTION_VOTE: 'election_vote',
  ELECTION_RESULT: 'election_result',
  DRAFT_CURTAIN: 'draft_curtain',
  DRAFT_PICK: 'draft_pick'
};

/**
 * Structure du tour — cinq phases, et une fusion essayee puis abandonnee.
 *
 * A quatre joueurs, un tour coute HUIT passages de tablette : rideau + ordres
 * d'appro pour chacun, revelation, negociation, rideau + ordres de deplacement
 * pour chacun, resolution. Fusionner les phases 1 et 4 en une seule saisie
 * secrete, negociation placee avant, ramene ce compte a quatre — et c'est
 * l'ordre de Diplomacy, dont le jeu se reclame.
 *
 * Cette fusion a ete implementee et mesuree au banc d'essai. Comparaison a bot
 * identique, 30 parties a 4 joueurs :
 *
 *                        5 phases   3 phases fusionnees
 *   parties terminees      100 %          100 %
 *   tour de victoire        12             11
 *   parties avec un combat   10 %            0 %
 *
 * Elle SUPPRIME les combats, et le mecanisme est clair : les ordres de
 * deplacement sont alors ecrits AVANT l'encaissement des revenus, donc un joueur
 * cree moins de pions, les armees ne montent pas, et un assaut — qui demande des
 * soutiens — ne devient jamais possible. Le gain de tempo se paie du peu de
 * conflit que le jeu produit.
 *
 * Elle n'est donc pas retenue. A reessayer seulement si l'economie change au
 * point que la creation de pions ne depende plus des revenus du tour, et en
 * revalidant sur cet indicateur-la.
 */
export const GAME_PHASE_LABELS = {
  1: 'Phase 1 — Approvisionnement & construction',
  2: 'Phase 2 — Révélation & récolte',
  3: 'Phase 3 — Négociation',
  4: 'Phase 4 — Déplacements & création',
  5: 'Phase 5 — Résolution'
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Etat volatil d'une manche.
 *
 * Il vivait sur l'instance TurnManager, donc hors du GameState, donc hors de la
 * sauvegarde : recharger la page au milieu d'un tour perdait les ordres deja
 * rendus, les bulletins de vote et les mains de draft. Comme `resumePhase()`
 * n'etait de toute facon jamais appele, « Continuer » relancait le tour depuis
 * la phase 1 avec les revenus deja encaisses.
 *
 * Tout est desormais range dans gs.manche. `GameState.serialize()` parcourt les
 * cles propres de l'objet : la sauvegarde devient automatique, et une tablette
 * qui se verrouille au tour 9 ne coute plus la soiree.
 */
function mancheVierge(nbJoueurs) {
  const parJoueur = () => Object.fromEntries(Array.from({ length: nbJoueurs }, (_, i) => [i, []]));
  return {
    phase: null,
    playerQueue: [],
    currentPlayerIdx: 0,
    supplyOrders: parJoueur(),
    moveOrders: parJoueur(),
    ordersUsedP1: Object.fromEntries(Array.from({ length: nbJoueurs }, (_, i) => [i, 0])),
    votes: {},
    draftHands: {}
  };
}

export class TurnManager {
  constructor(gs, data) {
    this.gs = gs;
    this.data = data;
    this.revealLog = [];
    this.onChange = null;
    if (!gs.manche) gs.manche = mancheVierge(gs.joueurs.length);
  }

  /* Accesseurs : les appelants continuent d'ecrire `tm.phase` ou `tm.supplyOrders`,
     mais la donnee vit dans l'etat sauvegarde. */
  get phase() { return this.gs.manche.phase; }
  set phase(v) { this.gs.manche.phase = v; }
  get playerQueue() { return this.gs.manche.playerQueue; }
  set playerQueue(v) { this.gs.manche.playerQueue = v; }
  get currentPlayerIdx() { return this.gs.manche.currentPlayerIdx; }
  set currentPlayerIdx(v) { this.gs.manche.currentPlayerIdx = v; }
  get supplyOrders() { return this.gs.manche.supplyOrders; }
  set supplyOrders(v) { this.gs.manche.supplyOrders = v; }
  get moveOrders() { return this.gs.manche.moveOrders; }
  set moveOrders(v) { this.gs.manche.moveOrders = v; }
  get ordersUsedP1() { return this.gs.manche.ordersUsedP1; }
  set ordersUsedP1(v) { this.gs.manche.ordersUsedP1 = v; }
  get votes() { return this.gs.manche.votes; }
  set votes(v) { this.gs.manche.votes = v; }
  get draftHands() { return this.gs.manche.draftHands; }
  set draftHands(v) { this.gs.manche.draftHands = v; }

  startTurn() {
    const garde = this.gs.manche.phase;
    this.gs.manche = mancheVierge(this.gs.joueurs.length);
    this.gs.manche.phase = garde;
    this.gs.phase = 1;
    this._beginHotseat();
  }

  /**
   * Reprend exactement la ou on s'etait arrete.
   *
   * On repart de la phase de l'automate, sauvegardee, et non plus de gs.phase :
   * ce dernier ne distingue pas le rideau de la saisie, ni les phases d'election
   * et de draft, qui n'ont pas de numero. Sans ca, une partie rechargee pendant
   * une election repartait en phase 5.
   */
  resumePhase() {
    if (this.gs.manche?.phase) {
      /* On ne rentre jamais dans une saisie secrete sans repasser par le rideau.
         La sauvegarde est ecrite a chaque changement de phase : recharger la page
         pendant le tour de J2 rouvrait directement SA feuille d'ordres, avec sa
         caisse et ses stocks, sans que personne ait declare tenir la tablette.
         Le rideau est le seul verrou d'identite du hotseat ; un rafraichissement
         ne doit pas pouvoir le sauter. */
      const RETOUR_AU_RIDEAU = {
        [PHASE.ORDERS_SUPPLY]: PHASE.CURTAIN,
        [PHASE.ORDERS_MOVE]: PHASE.CURTAIN,
        [PHASE.ELECTION_VOTE]: PHASE.ELECTION_CURTAIN,
        [PHASE.DRAFT_PICK]: PHASE.DRAFT_CURTAIN
      };
      const rideau = RETOUR_AU_RIDEAU[this.gs.manche.phase];
      if (rideau) this.gs.manche.phase = rideau;
      this._emit();
      return;
    }
    /* Sauvegarde d'avant cette correction : on retombe sur l'ancien comportement,
       au debut de la phase en cours. */
    const p = this.gs.phase;
    if (p === 1 || p === 4) this._beginHotseat();
    else if (p === 2) { this.phase = PHASE.REVEAL_HARVEST; this._emit(); }
    else if (p === 3) { this.phase = PHASE.NEGOTIATION; this._emit(); }
    else if (p === 5) { this.phase = PHASE.REVEAL_RESOLVE; this._emit(); }
    else this.startTurn();
  }

  /**
   * Ouvre une tournee de saisie secrete.
   *
   * L'ordre de passage etait retire au sort a CHAQUE tournee, donc deux fois par
   * tour : un joueur pouvait passer premier en phase 1 puis dernier en phase 4,
   * et attendre deux gestes ici, quarante-quatre la. Un ordre qu'on ne peut pas
   * annoncer est un ordre qu'on subit.
   *
   * Il est desormais tire UNE fois par tour, au debut, et reutilise en phase 4 :
   * le rideau peut donc l'afficher, chacun sait quand vient son tour, et
   * l'attente est la meme pour tous.
   */
  _beginHotseat() {
    if (!this.playerQueue?.length) {
      this.playerQueue = shuffle(this.gs.joueurs.map((_, i) => i));
    }
    this.currentPlayerIdx = 0;
    this.phase = PHASE.CURTAIN;
    this._emit();
  }

  confirmCurtain() {
    this.phase = this.gs.phase === 1 ? PHASE.ORDERS_SUPPLY : PHASE.ORDERS_MOVE;
    this._emit();
  }

  submitOrders(orders) {
    const pid = this.currentPlayerId;
    if (this.gs.phase === 1) {
      this.supplyOrders[pid] = orders;
      this.ordersUsedP1[pid] = orders.length;
    } else {
      this.moveOrders[pid] = orders;
    }
    this.currentPlayerIdx++;
    if (this.currentPlayerIdx < this.playerQueue.length) {
      this.phase = PHASE.CURTAIN;
    } else {
      this._advance();
    }
    this._emit();
  }

  _advance() {
    switch (this.gs.phase) {
      case 1: this.gs.phase = 2; this.phase = PHASE.REVEAL_HARVEST; break;
      case 2: this.gs.phase = 3; this.phase = PHASE.NEGOTIATION; break;
      case 3: this.gs.phase = 4; this._beginHotseat(); return;
      case 4: this.gs.phase = 5; this.phase = PHASE.REVEAL_RESOLVE; break;
      case 5: this.phase = PHASE.TURN_END; break;
    }
  }

  continueFromReveal() { this._advance(); this._emit(); }
  endNegotiation() { this._advance(); this._emit(); }

  nextTurn() {
    if (this.gs.tour > 0 && this.gs.tour % RULES.toursParMandat === 0) {
      this._beginElection();
      return;
    }
    this.gs.tour++;
    this.startTurn();
  }

  _beginElection() {
    if (this.onEndOfMandate) this.onEndOfMandate();
    this.votes = {};
    this.draftHands = {};
    this.playerQueue = shuffle(this.gs.joueurs.map((_, i) => i));
    this.currentPlayerIdx = 0;
    this.phase = PHASE.PRE_ELECTION;
    this._emit();
  }

  confirmPreElection() {
    this.phase = PHASE.ELECTION_CURTAIN;
    this._emit();
  }

  confirmElectionCurtain() {
    this.phase = PHASE.ELECTION_VOTE;
    this._emit();
  }

  /** Candidats qu'un votant donné peut choisir : tout le monde sauf lui-même. */
  candidatsPour(voterId) {
    return this.gs.joueurs.map((_, i) => i).filter(i => i !== voterId);
  }

  /**
   * Le vote pour soi-même est refusé.
   *
   * Tant qu'il était permis, l'équilibre rationnel était que chacun vote pour lui :
   * le report des voix donnait alors exactement le poids électoral de chacun, et le
   * titre de maire — 15 points, la plus grosse source unique du jeu — revenait
   * mécaniquement au joueur qui contrôlait déjà le plus de population. L'élection
   * n'était pas un scrutin, c'était l'affichage du classement.
   *
   * En s'interdisant de se voter, chacun doit choisir un adversaire, et la voix
   * devient une monnaie d'échange pour la phase de négociation.
   */
  submitVote(candidateId) {
    const voterId = this.currentPlayerId;
    if (candidateId === voterId) return { ok: false, msg: 'On ne peut pas voter pour soi-même' };
    this.votes[voterId] = candidateId;
    this.currentPlayerIdx++;
    if (this.currentPlayerIdx < this.playerQueue.length) {
      this.phase = PHASE.ELECTION_CURTAIN;
    } else {
      this.phase = PHASE.ELECTION_RESULT;
    }
    this._emit();
  }

  getElectionResults(gameplayData) {
    const voterPower = {};
    const zoneToQuartier = {};
    gameplayData.quartiers.forEach(q => {
      q.zones.forEach(z => { zoneToQuartier[z] = q; });
    });

    this.gs.joueurs.forEach((j, pid) => {
      let pop = 0;
      Object.entries(this.gs.plateau).forEach(([zid, zone]) => {
        const hasArmed = zone.pions.some(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant'));
        const hasConstruction = zone.construction && zone.proprietaire === pid;
        if (hasArmed || hasConstruction) {
          const q = zoneToQuartier[zid];
          if (q) pop += q.population_par_zone;
        }
      });
      pop += (j.electeurs_bonus || 0);
      pop -= (j.electeurs_malus || 0);
      voterPower[pid] = Math.max(0, pop);
    });

    const candidateVotes = {};
    this.gs.joueurs.forEach((_, i) => { candidateVotes[i] = 0; });

    Object.entries(this.votes).forEach(([voterId, candidateId]) => {
      candidateVotes[candidateId] = (candidateVotes[candidateId] || 0) + (voterPower[Number(voterId)] || 0);
    });

    let maxVotes = 0;
    let winner = null;
    let tied = false;
    Object.entries(candidateVotes).forEach(([pid, votes]) => {
      if (votes > maxVotes) { maxVotes = votes; winner = Number(pid); tied = false; }
      else if (votes === maxVotes && votes > 0) { tied = true; }
    });

    return { voterPower, candidateVotes, winner: tied ? null : winner, tied };
  }

  applyElectionResult(winnerId) {
    if (this.gs.maire.joueur_id !== null) {
      const oldMayor = this.gs.joueurs[this.gs.maire.joueur_id];
      if (oldMayor) oldMayor.est_maire = false;
    }

    if (winnerId !== null) {
      this.gs.maire = { joueur_id: winnerId, privileges_restants: 2, tour_election: this.gs.tour };
      this.gs.joueurs[winnerId].est_maire = true;
      this.gs.joueurs[winnerId].privileges_maire_restants = 2;
    }

    this._beginDraft();
  }

  _beginDraft() {
    this.playerQueue = shuffle(this.gs.joueurs.map((_, i) => i));
    this.currentPlayerIdx = 0;
    this.draftHands = {};
    this.phase = PHASE.DRAFT_CURTAIN;
    this._emit();
  }

  setDraftHands(hands) {
    this.draftHands = hands;
  }

  confirmDraftCurtain() {
    this.phase = PHASE.DRAFT_PICK;
    this._emit();
  }

  submitDraftPick() {
    this.currentPlayerIdx++;
    if (this.currentPlayerIdx < this.playerQueue.length) {
      this.phase = PHASE.DRAFT_CURTAIN;
    } else {
      this.gs.tour++;
      this.startTurn();
    }
    this._emit();
  }

  get currentPlayerId() { return this.playerQueue[this.currentPlayerIdx]; }
  get currentPlayer() { return this.gs.joueurs[this.currentPlayerId]; }

  isOrderPhase() {
    return this.phase === PHASE.ORDERS_SUPPLY || this.phase === PHASE.ORDERS_MOVE;
  }

  maxOrdersForPhase(pid) {
    const total = RULES.ordresParTour + (this.gs.joueurs[pid].actions_bonus || 0);
    if (this.gs.phase === 1) return total;
    return total - (this.ordersUsedP1[pid] || 0);
  }

  _emit() {
    this.gs.save();
    if (this.onChange) this.onChange();
  }
}
