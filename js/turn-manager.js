export const PHASE = {
  CURTAIN: 'curtain',
  ORDERS_SUPPLY: 'orders_supply',
  REVEAL_HARVEST: 'reveal_harvest',
  NEGOTIATION: 'negotiation',
  ORDERS_MOVE: 'orders_move',
  REVEAL_RESOLVE: 'reveal_resolve',
  TURN_END: 'turn_end'
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
    this.gs.tour++;
    this.startTurn();
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
