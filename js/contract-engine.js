/**
 * JORETAPO — Moteur des contrats et de la Coupole.
 *
 * Règles de référence : specs/01-mecaniques-de-jeu.md, section « Contrats et
 * Coupole » (contrats librement négociés ; Coupole convocable 2 fois par
 * partie, vote à la majorité hors plaignant et accusé, égalité tranchée par le
 * plus d'électeurs, sanction : 2 hommes de main).
 *
 * CONSÉQUENCE D'UNE TRAHISON (écart aux specs, journalisé le 2026-08-23)
 * ─────────────────────────────────────────────────────────────────────
 * La spec ne dit pas ce que coûte un contrat non honoré. Sans conséquence, le
 * contrat était purement décoratif. Trois mécaniques le rendent contraignant :
 *
 *   1. DETTE — un transfert non payé n'est pas oublié : le manque est reporté
 *      sur `c.dette` et réclamé au tour suivant, en plus de l'échéance. Solder
 *      la dette REHABILITE le contrat (`honore` redevient vrai) : le drapeau
 *      décrit l'état courant, il n'est plus une cicatrice définitive.
 *   2. RÉPUTATION — chaque tour de défaut coûte au débiteur
 *      `MALUS_ELECTEURS_MANQUEMENT` électeurs, exactement comme une élimination
 *      publique (conflict-resolver.js). La trahison se paie à l'élection.
 *   3. COUPOLE — un manquement CONSTATÉ par le moteur (ou une violation
 *      SIGNALÉE par la partie lésée pour les contrats sans effet moteur) est un
 *      grief archivé sur le contrat. La Coupole s'en saisit : condamnation =
 *      2 hommes + restitution forcée de la dette + malus électoral ;
 *      acquittement d'une accusation SANS constat = le plaignant paie sa
 *      calomnie.
 *
 * Conventions du projet : classes statiques, retours { ok, msg, reason }.
 */

export const CONTRACT_TYPES = {
  transfert_lingots:   { label: 'Transfert de lingots',   icon: '💰', auto: true,  ressource: 'lingots' },
  transfert_armes:     { label: 'Transfert d\'armes',     icon: '🔫', auto: true,  ressource: 'armes' },
  transfert_doses:     { label: 'Transfert de doses',     icon: '💊', auto: true,  ressource: 'doses' },
  non_agression:       { label: 'Pacte de non-agression', icon: '🤝', auto: false },
  soutien_electoral:   { label: 'Soutien électoral',      icon: '🗳️', auto: false },
  protection:          { label: 'Protection de zone',     icon: '🛡️', auto: false },
  libre:               { label: 'Accord libre',           icon: '📝', auto: false }
};

export class ContractEngine {

  /* ═══════════════════════════════════════════
   *  BARÈME DES CONSÉQUENCES
   * ═══════════════════════════════════════════ */

  /** Électeurs perdus par TOUR de défaut sur un contrat de transfert. */
  static MALUS_ELECTEURS_MANQUEMENT = 100000;

  /** Électeurs perdus par l'accusé condamné par la Coupole. */
  static MALUS_ELECTEURS_CONDAMNATION = 100000;

  /** Électeurs perdus par le plaignant débouté SANS aucun manquement constaté. */
  static MALUS_ELECTEURS_ACCUSATION_INFONDEE = 100000;

  /** Hommes de main perdus par l'accusé condamné (specs/01). */
  static SANCTION_HOMMES = 2;

  /** Taille max de l'historique des griefs d'un contrat (le save part en URL). */
  static MAX_GRIEFS = 12;

  static _estArme(type) { return type === 'dealer' || type === 'trafiquant'; }

  static _nextId(gs) {
    const maxId = gs.contrats.reduce((m, c) => Math.max(m, c.id || 0), 0);
    return maxId + 1;
  }

  /** Ressource transférée par un contrat automatique, ou null. */
  static ressourceDe(typeContrat) {
    return CONTRACT_TYPES[typeContrat]?.ressource || null;
  }

  /* ═══════════════════════════════════════════
   *  CRÉATION
   * ═══════════════════════════════════════════ */

  /**
   * @returns {object} le contrat créé, ou { ok:false, reason } si les
   *          paramètres sont invalides (aucun contrat n'est alors ajouté).
   */
  static createContract(gs, { joueurA, joueurB, typeContrat, description, montant, duree }) {
    const a = Number(joueurA);
    const b = Number(joueurB);
    if (!Number.isInteger(a) || !gs.joueurs[a]) return { ok: false, reason: 'Signataire A invalide' };
    if (!Number.isInteger(b) || !gs.joueurs[b]) return { ok: false, reason: 'Signataire B invalide' };
    if (a === b) return { ok: false, reason: 'Un contrat nécessite deux parties différentes' };
    if (!CONTRACT_TYPES[typeContrat]) return { ok: false, reason: 'Type de contrat inconnu' };

    const m = Math.max(0, Math.floor(Number(montant) || 0));
    const d = Math.max(1, Math.floor(Number(duree) || 1));
    if (CONTRACT_TYPES[typeContrat].auto && m <= 0) {
      return { ok: false, reason: 'Un transfert doit porter sur un montant positif' };
    }

    const contrat = {
      id: this._nextId(gs),
      tour_creation: gs.tour,
      joueur_a: a,
      joueur_b: b,
      type: typeContrat,
      description: description || '',
      montant: m,
      duree: d,
      tours_restants: d,
      actif: true,
      honore: true,
      dette: 0,
      manquements: 0,
      griefs: []
    };
    gs.contrats.push(contrat);
    gs.save();
    return contrat;
  }

  static getActiveContracts(gs) {
    return gs.contrats.filter(c => c.actif);
  }

  static getPlayerContracts(gs, playerId) {
    return gs.contrats.filter(c => c.actif && (c.joueur_a === playerId || c.joueur_b === playerId));
  }

  /* ═══════════════════════════════════════════
   *  GRIEFS
   * ═══════════════════════════════════════════ */

  static _ajouterGrief(c, grief) {
    if (!Array.isArray(c.griefs)) c.griefs = [];
    c.griefs.push(grief);
    if (c.griefs.length > this.MAX_GRIEFS) c.griefs.splice(0, c.griefs.length - this.MAX_GRIEFS);
    return grief;
  }

  /**
   * Griefs de `plaignantId` contre `accuseId`, actifs ou expirés.
   *
   *  - `constats`     : manquements établis par le moteur (dette de transfert).
   *                     Ce sont les seules PREUVES : elles protègent le
   *                     plaignant même s'il est débouté.
   *  - `declarations` : violations signalées à la main sur un contrat sans
   *                     effet moteur. Recevables, mais ce n'est que sa parole.
   */
  static getGriefs(gs, plaignantId, accuseId) {
    const constats = [];
    const declarations = [];
    let dette = 0;

    (gs.contrats || []).forEach(c => {
      const entreEux = (c.joueur_a === plaignantId && c.joueur_b === accuseId)
        || (c.joueur_a === accuseId && c.joueur_b === plaignantId);
      if (!entreEux) return;

      // Le débiteur d'un transfert est toujours joueur_a.
      if (c.joueur_a === accuseId && (c.manquements || 0) > 0) {
        constats.push(c);
        dette += Math.max(0, c.dette || 0);
      }
      const declare = (c.griefs || []).some(g => g.type === 'declaration' && g.par === plaignantId && g.contre === accuseId);
      if (declare && !constats.includes(c)) declarations.push(c);
    });

    return {
      constats,
      declarations,
      dette,
      fonde: constats.length > 0,
      recevable: constats.length > 0 || declarations.length > 0
    };
  }

  /**
   * Signale la violation d'un contrat SANS effet moteur (non-agression,
   * protection, soutien électoral, accord libre). Aucune sanction automatique :
   * personne ne peut punir sur sa seule parole. Le grief rend l'accusation
   * recevable devant la Coupole et affiche le contrat comme non honoré.
   */
  static signalerViolation(gs, contractId, { plaignantId, motif } = {}) {
    const c = (gs.contrats || []).find(x => x.id === contractId);
    if (!c) return { ok: false, reason: 'Contrat introuvable' };
    if (plaignantId !== c.joueur_a && plaignantId !== c.joueur_b) {
      return { ok: false, reason: 'Seule une partie au contrat peut en signaler la violation' };
    }
    const accuse = plaignantId === c.joueur_a ? c.joueur_b : c.joueur_a;
    const dejaCeTour = (c.griefs || []).some(g =>
      g.type === 'declaration' && g.par === plaignantId && g.tour === gs.tour);
    if (dejaCeTour) return { ok: false, reason: 'Violation déjà signalée ce tour' };

    c.honore = false;
    this._ajouterGrief(c, {
      tour: gs.tour,
      par: plaignantId,
      contre: accuse,
      type: 'declaration',
      motif: String(motif || '').slice(0, 60)
    });
    gs.save();

    const nom = gs.joueurs[plaignantId]?.nom || `J${plaignantId}`;
    const nomAccuse = gs.joueurs[accuse]?.nom || `J${accuse}`;
    return {
      ok: true,
      contrat: c,
      accuse,
      msg: `📜 ${nom} dénonce une violation du contrat #${c.id} par ${nomAccuse}`
    };
  }

  /* ═══════════════════════════════════════════
   *  EXÉCUTION AUTOMATIQUE (révélation de récolte)
   * ═══════════════════════════════════════════ */

  static executeAutoContracts(gs) {
    const log = [];

    this.getActiveContracts(gs).forEach(c => {
      const typeDef = CONTRACT_TYPES[c.type];
      if (!typeDef || !typeDef.auto) return;
      const resource = typeDef.ressource;
      if (!resource) return;

      const payer = gs.joueurs[c.joueur_a];
      const receveur = gs.joueurs[c.joueur_b];
      if (!payer || !receveur) return;

      const arriere = Math.max(0, c.dette || 0);
      const echeance = Math.max(0, c.montant || 0) + arriere;
      if (echeance <= 0) return;

      const disponible = Math.max(0, payer.ressources[resource] || 0);
      const verse = Math.min(echeance, disponible);

      if (verse > 0) {
        payer.ressources[resource] -= verse;
        receveur.ressources[resource] += verse;
      }

      const manque = echeance - verse;
      c.dette = manque;

      if (manque > 0) {
        c.manquements = (c.manquements || 0) + 1;
        c.honore = false;
        payer.electeurs_malus = (payer.electeurs_malus || 0) + this.MALUS_ELECTEURS_MANQUEMENT;
        this._ajouterGrief(c, {
          tour: gs.tour,
          par: c.joueur_b,
          contre: c.joueur_a,
          type: 'constat',
          manque
        });
        const detail = verse > 0
          ? `ne verse que ${verse}/${echeance} ${resource}`
          : `ne verse rien sur ${echeance} ${resource}`;
        log.push({
          contrat: c,
          ok: false,
          msg: `📜 Contrat #${c.id} : ${payer.nom} ${detail} à ${receveur.nom} — dette ${manque}, −${this.MALUS_ELECTEURS_MANQUEMENT / 1000}k électeurs`
        });
      } else {
        const rehabilite = c.honore === false;
        c.honore = true;
        const suffixe = arriere > 0 ? ` (dont ${arriere} d'arriéré soldé)` : '';
        log.push({
          contrat: c,
          ok: true,
          msg: `📜 Contrat #${c.id} : ${payer.nom} transfère ${verse} ${resource} à ${receveur.nom}${suffixe}${rehabilite ? ' — contrat de nouveau honoré' : ''}`
        });
      }
    });

    return log;
  }

  static tickContracts(gs) {
    const expired = [];
    gs.contrats.forEach(c => {
      if (!c.actif) return;
      c.tours_restants--;
      if (c.tours_restants <= 0) {
        c.actif = false;
        expired.push(c);
      }
    });
    return expired;
  }

  static cancelContract(gs, contractId) {
    const c = gs.contrats.find(x => x.id === contractId);
    if (c) {
      c.actif = false;
      c.tours_restants = 0;
    }
    return c;
  }

  /* ═══════════════════════════════════════════
   *  LA COUPOLE
   * ═══════════════════════════════════════════ */

  /**
   * @param {number} [accusedId] optionnel : si fourni, la saisine exige un
   *        grief enregistré contre l'accusé (constat de manquement ou violation
   *        signalée). Sans accusé, seules les conditions de forme sont vérifiées
   *        — l'appelant historique (js/app.js) n'est donc pas cassé.
   */
  static canConvokeCoupole(gs, plaintiffId, accusedId = null) {
    const j = gs.joueurs[plaintiffId];
    if (!j) return { ok: false, reason: 'Joueur invalide' };
    if ((j.nb_coupole_restantes || 0) <= 0) return { ok: false, reason: 'Plus de convocations disponibles (max 2 par partie)' };
    if (gs.joueurs.length < 3) return { ok: false, reason: 'Il faut au moins 3 joueurs pour la Coupole' };

    if (accusedId === null || accusedId === undefined) return { ok: true };

    if (!gs.joueurs[accusedId]) return { ok: false, reason: 'Accusé invalide' };
    if (accusedId === plaintiffId) return { ok: false, reason: 'Le plaignant et l\'accusé doivent être différents' };

    const griefs = this.getGriefs(gs, plaintiffId, accusedId);
    if (!griefs.recevable) {
      return {
        ok: false,
        reason: `Aucun grief contre ${gs.joueurs[accusedId].nom} : il faut un contrat non honoré ou une violation signalée`,
        griefs
      };
    }
    return { ok: true, griefs };
  }

  static resolveCoupole(gs, plaintiffId, accusedId, votes) {
    const votants = gs.joueurs.filter(j => j.id !== plaintiffId && j.id !== accusedId);
    let pour = 0;
    let contre = 0;

    votants.forEach(j => {
      if (votes[j.id] === true) pour++;
      else contre++;
    });

    let verdict;
    if (pour > contre) {
      verdict = 'coupable';
    } else if (pour === contre && votants.length > 0) {
      const electeurs = j => (j.electeurs_bonus || 0) - (j.electeurs_malus || 0);
      const maxElecteurs = Math.max(...votants.map(electeurs));
      const tiebreaker = votants.find(j => electeurs(j) === maxElecteurs);
      verdict = tiebreaker && votes[tiebreaker.id] === true ? 'coupable' : 'acquitté';
    } else {
      verdict = 'acquitté';
    }

    const plaintiff = gs.joueurs[plaintiffId];
    plaintiff.nb_coupole_restantes = (plaintiff.nb_coupole_restantes || 2) - 1;

    const griefs = this.getGriefs(gs, plaintiffId, accusedId);
    const result = {
      pour, contre, verdict,
      sanction: null,
      sanction_plaignant: null,
      fonde: griefs.fonde,
      griefs: { constats: griefs.constats.map(c => c.id), declarations: griefs.declarations.map(c => c.id) },
      restitution: null
    };

    if (verdict === 'coupable') {
      const accuse = gs.joueurs[accusedId];
      const parts = [];

      // 1. Sanction de la spec : 2 hommes de main.
      const removed = this._retirerHommes(gs, accusedId, this.SANCTION_HOMMES);
      parts.push(`perd ${removed} homme(s) de main`);

      // 2. Déshonneur public : la condamnation coûte des électeurs.
      accuse.electeurs_malus = (accuse.electeurs_malus || 0) + this.MALUS_ELECTEURS_CONDAMNATION;
      parts.push(`−${this.MALUS_ELECTEURS_CONDAMNATION / 1000}k électeurs`);

      // 3. Restitution forcée des dettes constatées, puis clôture des contrats.
      const restitution = this._executerRestitution(gs, accusedId, plaintiffId, griefs.constats);
      if (restitution.total > 0) {
        parts.push(`restitue ${restitution.detail} à ${plaintiff.nom}`);
      }
      griefs.constats.concat(griefs.declarations).forEach(c => {
        c.actif = false;
        c.tours_restants = 0;
        c.honore = false;
        c.juge = 'coupable';
      });
      result.restitution = restitution;
      result.sanction = `${accuse.nom} ${parts.join(', ')}`;
    } else if (!griefs.fonde) {
      // Accusation sans le moindre manquement constaté : la calomnie se paie.
      plaintiff.electeurs_malus = (plaintiff.electeurs_malus || 0) + this.MALUS_ELECTEURS_ACCUSATION_INFONDEE;
      result.sanction_plaignant =
        `${plaintiff.nom} accusait sans preuve : −${this.MALUS_ELECTEURS_ACCUSATION_INFONDEE / 1000}k électeurs`;
      griefs.declarations.forEach(c => { c.juge = 'acquitte'; });
    } else {
      griefs.constats.forEach(c => { c.juge = 'acquitte'; });
    }

    gs.save();
    return result;
  }

  /** Retire jusqu'à `nb` hommes de main de `pid` sur l'ensemble du plateau. */
  static _retirerHommes(gs, pid, nb) {
    let retires = 0;
    for (const zone of Object.values(gs.plateau)) {
      if (retires >= nb) break;
      for (let i = zone.pions.length - 1; i >= 0 && retires < nb; i--) {
        const p = zone.pions[i];
        if (p.joueur === pid && this._estArme(p.type)) {
          zone.pions.splice(i, 1);
          retires++;
        }
      }
    }
    return retires;
  }

  /** Transfère de force la dette constatée du condamné vers le plaignant. */
  static _executerRestitution(gs, debiteurId, creancierId, contrats) {
    const debiteur = gs.joueurs[debiteurId];
    const creancier = gs.joueurs[creancierId];
    const parRessource = {};
    let total = 0;

    contrats.forEach(c => {
      const resource = this.ressourceDe(c.type);
      const du = Math.max(0, c.dette || 0);
      if (!resource || du === 0) return;
      const disponible = Math.max(0, debiteur.ressources[resource] || 0);
      const verse = Math.min(du, disponible);
      if (verse > 0) {
        debiteur.ressources[resource] -= verse;
        creancier.ressources[resource] += verse;
        parRessource[resource] = (parRessource[resource] || 0) + verse;
        total += verse;
      }
      c.dette = du - verse;
    });

    const detail = Object.entries(parRessource).map(([r, n]) => `${n} ${r}`).join(' + ');
    return { total, parRessource, detail };
  }
}
