/**
 * JORETAPO — Automate de tour.
 *
 * Pilote l'enchaînement des 5 phases d'un tour, du hotseat (rideau → saisie
 * d'ordres → joueur suivant), des élections (tous les 7 tours) et du draft de
 * cartes magouille qui les suit.
 *
 * PERSISTANCE DU TOUR EN COURS
 * ────────────────────────────
 * L'état de l'automate (file hotseat, ordres déjà validés, budget d'ordres
 * consommé, votes, mains de draft) ne vit PAS dans le GameState : il vit ici.
 * Sans précaution, un rechargement de page en pleine phase 4 repartait en
 * phase 1 avec les ressources déjà dépensées ET un budget d'ordres remis à
 * neuf. `serializeTurnState()` / `restoreTurnState()` règlent ça : à chaque
 * transition, `_emit()` dépose le cliché sur `gs.etat_tour`, que
 * `GameState.serialize()` sauvegarde comme n'importe quelle autre clé, et
 * `startOrResume()` le relit au démarrage.
 */

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

const PHASES_CONNUES = new Set(Object.values(PHASE));

export const GAME_PHASE_LABELS = {
  1: 'Phase 1 — Approvisionnement & construction',
  2: 'Phase 2 — Révélation & récolte',
  3: 'Phase 3 — Négociation',
  4: 'Phase 4 — Déplacements & création',
  5: 'Phase 5 — Résolution'
};

/** Motifs de départage d'une élection, dans l'ordre où ils sont appliqués. */
export const DEPARTAGE = {
  MAJORITE: 'majorite',
  PUISSANCE: 'puissance_electorale',
  ANTI_CUMUL: 'anti_cumul_mandats',
  FORTUNE: 'outsider_fortune',
  VACANT: 'siege_vacant',
  AUCUNE_VOIX: 'aucune_voix'
};

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Copie profonde d'une structure JSON-able (ordres, mains de draft). */
function copie(v) {
  if (v === null || v === undefined) return {};
  try { return JSON.parse(JSON.stringify(v)); } catch (e) { return {}; }
}

/** Sous-ensemble des candidats maximisant `score`. */
function meilleurs(candidats, score) {
  let max = -Infinity;
  let lot = [];
  candidats.forEach(pid => {
    const s = score(pid);
    if (s > max) { max = s; lot = [pid]; }
    else if (s === max) lot.push(pid);
  });
  return lot;
}

export class TurnManager {
  /** Version du cliché d'état de tour : un cliché d'une autre version est ignoré. */
  static ETAT_VERSION = 1;
  /** Clé posée sur le GameState (non volatile : elle passe par `serialize()`). */
  static CLE_ETAT_TOUR = 'etat_tour';

  constructor(gs, data) {
    this.gs = gs;
    this.data = data;
    this.phase = null;
    this.playerQueue = [];
    this.currentPlayerIdx = 0;
    this.supplyOrders = {};
    this.moveOrders = {};
    this.ordersUsedP1 = {};
    this.votes = {};
    this.draftHands = {};
    /** pids rendus inéligibles (carte 22), photographiés à l'ouverture du scrutin. */
    this.ineligibles = [];
    this.revealLog = [];
    this.onChange = null;
  }

  /* ═══════════════════════════════════════════
   *  DÉMARRAGE / REPRISE
   * ═══════════════════════════════════════════ */

  startTurn() {
    this.supplyOrders = {};
    this.moveOrders = {};
    this.ordersUsedP1 = {};
    this.gs.joueurs.forEach((_, i) => {
      this.supplyOrders[i] = [];
      this.moveOrders[i] = [];
      this.ordersUsedP1[i] = 0;
    });
    this.votes = {};
    this.draftHands = {};
    this.gs.phase = 1;
    this._beginHotseat();
  }

  /**
   * Reprend là où l'automate s'était arrêté.
   * Si un cliché a été restauré (`restoreTurnState`), la phase exacte est
   * réaffichée ; sinon on retombe sur une déduction à partir de `gs.phase`.
   */
  resumePhase() {
    if (this.phase && PHASES_CONNUES.has(this.phase)) { this._emit(); return; }
    this._normaliserOrdres();
    const p = this.gs.phase;
    if (p === 1 || p === 4) this._beginHotseat();
    else if (p === 2) { this.phase = PHASE.REVEAL_HARVEST; this._emit(); }
    else if (p === 3) { this.phase = PHASE.NEGOTIATION; this._emit(); }
    else if (p === 5) { this.phase = PHASE.REVEAL_RESOLVE; this._emit(); }
  }

  /**
   * Point d'entrée unique du chargement de partie : reprend le tour sauvegardé
   * s'il est exploitable, sinon en démarre un neuf.
   * @returns {{ok:boolean, repris:boolean, msg:string, reason:string}}
   */
  startOrResume() {
    const res = this.restoreTurnState(this.gs[TurnManager.CLE_ETAT_TOUR]);
    if (res.ok) {
      this.resumePhase();
      return { ok: true, repris: true, msg: res.msg, reason: res.reason };
    }
    this.startTurn();
    return {
      ok: true,
      repris: false,
      msg: 'Nouveau tour démarré.',
      reason: res.reason
    };
  }

  /* ═══════════════════════════════════════════
   *  SÉRIALISATION DE L'ÉTAT DE TOUR
   * ═══════════════════════════════════════════ */

  /**
   * Cliché complet de l'état volatile de l'automate, prêt pour JSON.stringify.
   * Déposé sur `gs.etat_tour` par `_emit()` avant chaque `gs.save()`.
   */
  serializeTurnState() {
    return {
      version: TurnManager.ETAT_VERSION,
      tour: this.gs.tour,
      phase_jeu: this.gs.phase,
      phase: this.phase,
      nb_joueurs: this.gs.joueurs.length,
      playerQueue: [...this.playerQueue],
      currentPlayerIdx: this.currentPlayerIdx,
      supplyOrders: copie(this.supplyOrders),
      moveOrders: copie(this.moveOrders),
      ordersUsedP1: copie(this.ordersUsedP1),
      votes: copie(this.votes),
      ineligibles: [...this.ineligibles],
      draftHands: copie(this.draftHands)
    };
  }

  /**
   * Recharge un cliché produit par `serializeTurnState()`.
   * Refuse tout cliché qui ne décrit pas EXACTEMENT la partie en cours : un
   * cliché périmé rendrait la main au mauvais joueur avec de mauvais ordres.
   * @returns {{ok:boolean, msg:string, reason:string}}
   */
  restoreTurnState(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, msg: 'Aucun tour en cours à reprendre.', reason: 'absent' };
    }
    if (data.version !== TurnManager.ETAT_VERSION) {
      return { ok: false, msg: "Le tour sauvegardé vient d'une autre version du jeu : il est relancé depuis la phase 1.", reason: 'version_incompatible' };
    }
    const n = this.gs.joueurs.length;
    if (data.nb_joueurs !== n) {
      return { ok: false, msg: 'Le tour sauvegardé ne correspond pas à cette partie : il est relancé.', reason: 'joueurs_incompatibles' };
    }
    if (data.tour !== this.gs.tour) {
      return { ok: false, msg: 'Le tour sauvegardé est périmé : il est relancé.', reason: 'tour_desynchronise' };
    }
    if (!PHASES_CONNUES.has(data.phase)) {
      return { ok: false, msg: 'Le tour sauvegardé est illisible : il est relancé.', reason: 'phase_inconnue' };
    }

    const file = (Array.isArray(data.playerQueue) ? data.playerQueue : [])
      .filter(i => Number.isInteger(i) && i >= 0 && i < n);
    if (file.length !== n) {
      return { ok: false, msg: 'Le tour sauvegardé est illisible : il est relancé.', reason: 'file_invalide' };
    }

    this.phase = data.phase;
    this.gs.phase = Number.isInteger(data.phase_jeu) ? data.phase_jeu : this.gs.phase;
    this.playerQueue = file;
    this.currentPlayerIdx = Math.min(
      Math.max(0, Number.isInteger(data.currentPlayerIdx) ? data.currentPlayerIdx : 0),
      file.length - 1
    );
    this.supplyOrders = copie(data.supplyOrders);
    this.moveOrders = copie(data.moveOrders);
    this.ordersUsedP1 = copie(data.ordersUsedP1);
    this.votes = copie(data.votes);
    this.draftHands = copie(data.draftHands);
    this.ineligibles = (Array.isArray(data.ineligibles) ? data.ineligibles : [])
      .filter(i => Number.isInteger(i) && i >= 0 && i < n);
    this._normaliserOrdres();

    return {
      ok: true,
      msg: `Tour ${this.gs.tour} repris là où il s'était arrêté.`,
      reason: 'repris'
    };
  }

  /** Garantit une entrée par joueur dans les trois tables d'ordres. */
  _normaliserOrdres() {
    this.gs.joueurs.forEach((_, i) => {
      if (!Array.isArray(this.supplyOrders[i])) this.supplyOrders[i] = [];
      if (!Array.isArray(this.moveOrders[i])) this.moveOrders[i] = [];
      const u = Number(this.ordersUsedP1[i]);
      this.ordersUsedP1[i] = Number.isFinite(u) && u > 0 ? Math.floor(u) : 0;
    });
  }

  /* ═══════════════════════════════════════════
   *  HOTSEAT ET PHASES D'ORDRES
   * ═══════════════════════════════════════════ */

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

  /**
   * Enregistre les ordres du joueur courant et passe la main.
   *
   * Le budget d'ordres (specs/06 décision 4 : 5 par TOUR, répartis librement
   * entre phase 1 et phase 4) est appliqué ici : les ordres au-delà du budget
   * sont écartés, jamais exécutés. Le contrôle de l'UI n'est plus qu'un confort.
   *
   * @returns {{ok:boolean, msg:string, reason:string, retenus:number, ignores:number}}
   */
  submitOrders(orders) {
    if (!this.isOrderPhase()) {
      return { ok: false, msg: "Aucune saisie d'ordres en cours.", reason: 'hors_phase_ordres', retenus: 0, ignores: 0 };
    }
    const pid = this.currentPlayerId;
    if (pid === undefined || !this.gs.joueurs[pid]) {
      return { ok: false, msg: "Aucun joueur à la manœuvre.", reason: 'joueur_inconnu', retenus: 0, ignores: 0 };
    }

    const liste = Array.isArray(orders) ? orders.filter(o => o && typeof o === 'object') : [];
    const max = Math.max(0, this.maxOrdersForPhase(pid));
    const retenus = liste.slice(0, max);
    const ignores = liste.length - retenus.length;

    if (this.gs.phase === 1) {
      this.supplyOrders[pid] = retenus;
      this.ordersUsedP1[pid] = retenus.length;
    } else {
      this.moveOrders[pid] = retenus;
    }

    if (ignores > 0) {
      this.revealLog.push({
        pid,
        type: 'warn',
        msg: `${this.gs.joueurs[pid].nom} : ${ignores} ordre(s) au-delà du budget de ${max} — ignoré(s).`
      });
    }

    this.currentPlayerIdx++;
    if (this.currentPlayerIdx < this.playerQueue.length) {
      this.phase = PHASE.CURTAIN;
    } else {
      this._advance();
    }
    this._emit();

    return ignores > 0
      ? { ok: false, msg: `Budget dépassé : ${ignores} ordre(s) ignoré(s) (maximum ${max}).`, reason: 'budget_ordres_depasse', retenus: retenus.length, ignores }
      : { ok: true, msg: 'Ordres enregistrés.', reason: 'ok', retenus: retenus.length, ignores: 0 };
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

  /* ═══════════════════════════════════════════
   *  ÉLECTIONS
   * ═══════════════════════════════════════════ */

  _beginElection() {
    // L'inéligibilité (carte 22) est photographiée AVANT la fin de mandat :
    // `SpecialEntities.processEndOfMandate` efface le marqueur, or il doit
    // porter sur le scrutin qui s'ouvre à l'instant.
    this.ineligibles = this.gs.joueurs
      .map((j, i) => (j && j._ineligible ? i : -1))
      .filter(i => i >= 0);

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

  /**
   * Candidats recevables : tout le monde sauf les joueurs rendus inéligibles.
   * Si plus personne n'est éligible, le scrutin redevient ouvert à tous —
   * une élection sans candidat n'a pas de sens.
   * @returns {number[]}
   */
  getEligibleCandidates() {
    const tous = this.gs.joueurs.map((_, i) => i);
    const eligibles = tous.filter(i => !this.ineligibles.includes(i));
    return eligibles.length > 0 ? eligibles : tous;
  }

  /**
   * Dépouille le scrutin.
   *
   * Règle de départage (voir docs/journal-decisions.md — absente des specs) :
   *  1. plus grande puissance électorale (cohérent avec la Coupole, specs/01) ;
   *  2. le maire sortant s'efface devant un challenger (anti-cumul de mandats) ;
   *  3. le plus pauvre en lingots l'emporte (l'outsider) ;
   *  4. faute de quoi le siège reste VACANT — et la mairie est alors réellement
   *     libérée par `applyElectionResult`.
   *
   * @returns {{voterPower:object, candidateVotes:object, winner:?number,
   *            tied:boolean, exAequo:number[], eligibles:number[],
   *            ineligibles:number[], bulletinsNuls:number, departage:string}}
   */
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

    const eligibles = this.getEligibleCandidates();
    const candidateVotes = {};
    this.gs.joueurs.forEach((_, i) => { candidateVotes[i] = 0; });

    // Un bulletin porté sur un inéligible est nul : la voix est perdue.
    let bulletinsNuls = 0;
    Object.entries(this.votes).forEach(([voterId, candidateId]) => {
      const cid = Number(candidateId);
      const poids = voterPower[Number(voterId)] || 0;
      if (!eligibles.includes(cid)) { bulletinsNuls += poids; return; }
      candidateVotes[cid] = (candidateVotes[cid] || 0) + poids;
    });

    let maxVotes = 0;
    eligibles.forEach(pid => { maxVotes = Math.max(maxVotes, candidateVotes[pid] || 0); });
    const exAequo = maxVotes > 0 ? eligibles.filter(pid => (candidateVotes[pid] || 0) === maxVotes) : [];
    const tied = exAequo.length > 1;

    const { winner, motif } = this._departager(exAequo, voterPower);

    return {
      voterPower, candidateVotes, winner, tied, exAequo,
      eligibles, ineligibles: [...this.ineligibles],
      bulletinsNuls, departage: motif
    };
  }

  /** Applique la cascade de départage. @returns {{winner:?number, motif:string}} */
  _departager(exAequo, voterPower) {
    if (exAequo.length === 0) return { winner: null, motif: DEPARTAGE.AUCUNE_VOIX };
    if (exAequo.length === 1) return { winner: exAequo[0], motif: DEPARTAGE.MAJORITE };

    // 1 — la puissance électorale tranche.
    let lot = meilleurs(exAequo, pid => voterPower[pid] || 0);
    if (lot.length === 1) return { winner: lot[0], motif: DEPARTAGE.PUISSANCE };

    // 2 — anti-cumul : le sortant s'efface devant un challenger à égalité parfaite.
    const sortant = this.gs.maire ? this.gs.maire.joueur_id : null;
    if (sortant !== null && lot.includes(sortant)) {
      const challengers = lot.filter(pid => pid !== sortant);
      if (challengers.length > 0) lot = challengers;
    }
    if (lot.length === 1) return { winner: lot[0], motif: DEPARTAGE.ANTI_CUMUL };

    // 3 — l'outsider : le moins riche en lingots.
    lot = meilleurs(lot, pid => -((this.gs.joueurs[pid]?.ressources?.lingots) || 0));
    if (lot.length === 1) return { winner: lot[0], motif: DEPARTAGE.FORTUNE };

    // 4 — égalité irréductible : personne n'est élu, la mairie reste vide.
    return { winner: null, motif: DEPARTAGE.VACANT };
  }

  /**
   * Clôt le scrutin. La mairie est TOUJOURS libérée d'abord : sans vainqueur,
   * aucun « maire fantôme » ne conserve ses 15 points ni ses privilèges.
   * @returns {{ok:boolean, msg:string, reason:string, maire:?number}}
   */
  applyElectionResult(winnerId) {
    const elu = Number.isInteger(winnerId) && this.gs.joueurs[winnerId] ? winnerId : null;

    this.gs.joueurs.forEach(j => {
      j.est_maire = false;
      j.privileges_maire_restants = 0;
    });
    this.gs.maire = { joueur_id: null, privileges_restants: 0, tour_election: this.gs.tour };

    if (elu !== null) {
      this.gs.maire = { joueur_id: elu, privileges_restants: 2, tour_election: this.gs.tour };
      this.gs.joueurs[elu].est_maire = true;
      this.gs.joueurs[elu].privileges_maire_restants = 2;
    }

    const res = elu !== null
      ? { ok: true, msg: `${this.gs.joueurs[elu].nom} est élu(e) maire.`, reason: 'elu', maire: elu }
      : { ok: true, msg: 'Aucun maire élu : la mairie reste vacante jusqu\'au prochain scrutin.', reason: 'siege_vacant', maire: null };

    this._beginDraft();
    return res;
  }

  /* ═══════════════════════════════════════════
   *  DRAFT
   * ═══════════════════════════════════════════ */

  _beginDraft() {
    this.playerQueue = shuffle(this.gs.joueurs.map((_, i) => i));
    this.currentPlayerIdx = 0;
    this.draftHands = {};
    this.phase = PHASE.DRAFT_CURTAIN;
    this._emit();
  }

  setDraftHands(hands) {
    this.draftHands = hands || {};
    // Pas de `_emit()` ici : appelé depuis le rendu du draft, il relancerait
    // ce rendu. On persiste sans notifier.
    this._persist();
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

  /* ═══════════════════════════════════════════
   *  ACCESSEURS
   * ═══════════════════════════════════════════ */

  get currentPlayerId() { return this.playerQueue[this.currentPlayerIdx]; }
  get currentPlayer() { return this.gs.joueurs[this.currentPlayerId]; }

  isOrderPhase() {
    return this.phase === PHASE.ORDERS_SUPPLY || this.phase === PHASE.ORDERS_MOVE;
  }

  /** Budget d'ordres restant au joueur pour la phase en cours (specs/06, décision 4). */
  maxOrdersForPhase(pid) {
    const joueur = this.gs.joueurs[pid];
    if (!joueur) return 0;
    const total = 5 + (joueur.actions_bonus || 0);
    if (this.gs.phase === 1) return total;
    return Math.max(0, total - (this.ordersUsedP1[pid] || 0));
  }

  /** Dépose le cliché du tour sur le GameState et sauvegarde, sans notifier l'UI. */
  _persist() {
    this.gs[TurnManager.CLE_ETAT_TOUR] = this.serializeTurnState();
    return this.gs.save();
  }

  _emit() {
    this._persist();
    if (this.onChange) this.onChange();
  }
}
