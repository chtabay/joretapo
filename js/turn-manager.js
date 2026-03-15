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

export class TurnManager {
  constructor(gs, data) {
    this.gs = gs;
    this.data = data;
    this.phase = null;
    this.playerQueue = [];
    this.currentPlayerIdx = 0;
    this.supplyOrders = {};
    this.moveOrders = {};
    this.ordersUsedP1 = {};
    this.revealLog = [];
    this.onChange = null;
  }

  startTurn() {
    this.supplyOrders = {};
    this.moveOrders = {};
    this.ordersUsedP1 = {};
    this.gs.joueurs.forEach((_, i) => {
      this.supplyOrders[i] = [];
      this.moveOrders[i] = [];
      this.ordersUsedP1[i] = 0;
    });
    this.gs.phase = 1;
    this._beginHotseat();
  }

  resumePhase() {
    const p = this.gs.phase;
    if (p === 1 || p === 4) this._beginHotseat();
    else if (p === 2) { this.phase = PHASE.REVEAL_HARVEST; this._emit(); }
    else if (p === 3) { this.phase = PHASE.NEGOTIATION; this._emit(); }
    else if (p === 5) { this.phase = PHASE.REVEAL_RESOLVE; this._emit(); }
  }

  _beginHotseat() {
    this.playerQueue = shuffle(this.gs.joueurs.map((_, i) => i));
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
    if (this.gs.tour > 0 && this.gs.tour % 7 === 0) {
      this._beginElection();
      return;
    }
    this.gs.tour++;
    this.startTurn();
  }

  _beginElection() {
    if (this.onEndOfMandate) this.onEndOfMandate();
    this.votes = {};
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

  submitVote(candidateId) {
    const voterId = this.currentPlayerId;
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

  maxOrdersForPhase(pid) {
    const total = 5 + (this.gs.joueurs[pid].actions_bonus || 0);
    if (this.gs.phase === 1) return total;
    return total - (this.ordersUsedP1[pid] || 0);
  }

  _emit() {
    this.gs.save();
    if (this.onChange) this.onChange();
  }
}
