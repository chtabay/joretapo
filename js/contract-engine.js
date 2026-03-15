export const CONTRACT_TYPES = {
  transfert_lingots:   { label: 'Transfert de lingots',   icon: '💰', auto: true },
  transfert_armes:     { label: 'Transfert d\'armes',     icon: '🔫', auto: true },
  transfert_doses:     { label: 'Transfert de doses',     icon: '💊', auto: true },
  non_agression:       { label: 'Pacte de non-agression', icon: '🤝', auto: false },
  soutien_electoral:   { label: 'Soutien électoral',      icon: '🗳️', auto: false },
  protection:          { label: 'Protection de zone',     icon: '🛡️', auto: false },
  libre:               { label: 'Accord libre',           icon: '📝', auto: false }
};

export class ContractEngine {

  static _nextId(gs) {
    const maxId = gs.contrats.reduce((m, c) => Math.max(m, c.id || 0), 0);
    return maxId + 1;
  }

  static createContract(gs, { joueurA, joueurB, typeContrat, description, montant, duree }) {
    const contrat = {
      id: this._nextId(gs),
      tour_creation: gs.tour,
      joueur_a: joueurA,
      joueur_b: joueurB,
      type: typeContrat,
      description: description || '',
      montant: montant || 0,
      duree: duree || 1,
      tours_restants: duree || 1,
      actif: true,
      honore: true
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

  static executeAutoContracts(gs) {
    const log = [];
    const active = this.getActiveContracts(gs);

    active.forEach(c => {
      const typeDef = CONTRACT_TYPES[c.type];
      if (!typeDef || !typeDef.auto || c.montant <= 0) return;

      const payer = gs.joueurs[c.joueur_a];
      const receveur = gs.joueurs[c.joueur_b];
      if (!payer || !receveur) return;

      let resource = null;
      if (c.type === 'transfert_lingots') resource = 'lingots';
      else if (c.type === 'transfert_armes') resource = 'armes';
      else if (c.type === 'transfert_doses') resource = 'doses';

      if (!resource) return;

      const available = payer.ressources[resource] || 0;
      const actual = Math.min(c.montant, available);

      if (actual > 0) {
        payer.ressources[resource] -= actual;
        receveur.ressources[resource] += actual;
        log.push({
          contrat: c,
          msg: `📜 Contrat #${c.id} : ${payer.nom} transfère ${actual} ${resource} à ${receveur.nom}`,
          ok: actual >= c.montant
        });
        if (actual < c.montant) {
          c.honore = false;
          log[log.length - 1].msg += ` (insuffisant : ${actual}/${c.montant})`;
        }
      } else {
        c.honore = false;
        log.push({
          contrat: c,
          msg: `📜 Contrat #${c.id} : ${payer.nom} ne peut pas payer ${c.montant} ${resource} à ${receveur.nom}`,
          ok: false
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

  static canConvokeCoupole(gs, plaintiffId) {
    const j = gs.joueurs[plaintiffId];
    if (!j) return { ok: false, reason: 'Joueur invalide' };
    if ((j.nb_coupole_restantes || 0) <= 0) return { ok: false, reason: 'Plus de convocations disponibles (max 2 par partie)' };
    if (gs.joueurs.length < 3) return { ok: false, reason: 'Il faut au moins 3 joueurs pour la Coupole' };
    return { ok: true };
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
    } else if (pour === contre) {
      const maxElecteurs = Math.max(
        ...votants.map(j => {
          const bonus = j.electeurs_bonus || 0;
          const malus = j.electeurs_malus || 0;
          return bonus - malus;
        })
      );
      const tiebreaker = votants.find(j => (j.electeurs_bonus || 0) - (j.electeurs_malus || 0) === maxElecteurs);
      verdict = tiebreaker && votes[tiebreaker.id] === true ? 'coupable' : 'acquitté';
    } else {
      verdict = 'acquitté';
    }

    const plaintiff = gs.joueurs[plaintiffId];
    plaintiff.nb_coupole_restantes = (plaintiff.nb_coupole_restantes || 2) - 1;

    const result = { pour, contre, verdict, sanction: null };

    if (verdict === 'coupable') {
      const accusedPions = [];
      Object.entries(gs.plateau).forEach(([zid, zone]) => {
        zone.pions.forEach((p, idx) => {
          if (p.joueur === accusedId && (p.type === 'dealer' || p.type === 'trafiquant')) {
            accusedPions.push({ zid, idx, type: p.type });
          }
        });
      });

      let removed = 0;
      for (let i = accusedPions.length - 1; i >= 0 && removed < 2; i--) {
        const entry = accusedPions[i];
        const zone = gs.plateau[entry.zid];
        const pIdx = zone.pions.findIndex(p => p.joueur === accusedId && p.type === entry.type);
        if (pIdx >= 0) {
          zone.pions.splice(pIdx, 1);
          removed++;
        }
      }
      result.sanction = `${gs.joueurs[accusedId].nom} perd ${removed} homme(s) de main`;
    }

    gs.save();
    return result;
  }
}
