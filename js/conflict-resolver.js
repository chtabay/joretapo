import { SpecialEntities } from './special-entities.js';

const IS_ARMED = t => t === 'dealer' || t === 'trafiquant';
const IS_PROST = t => t === 'prostituee_base' || t === 'prostituee_luxe';

const ELIM_COST = {
  dealer:     { lingots: 40,  armes: 4 },
  trafiquant: { lingots: 160, armes: 6 }
};

export class ConflictResolver {

  /**
   * Résout tous les mouvements de la Phase 5, y compris les conflits.
   * Remplace RevenueEngine.processMovements.
   */
  static resolve(gs, allMoveOrders, adjacencies, gameplayData) {
    const log = [];

    // 1 — Parser et valider les ordres de déplacement
    const moves = [];
    const movedKeys = new Set();

    Object.entries(allMoveOrders).forEach(([pid, orders]) => {
      pid = Number(pid);
      (orders || []).forEach(o => {
        if (o.type === 'creer_pion') {
          ConflictResolver._createPion(gs, pid, o, log);
          return;
        }
        if (o.type === 'deployer_flic') {
          ConflictResolver._deployFlic(gs, pid, o, log);
          return;
        }
        if (o.type === 'eliminer_flic') {
          ConflictResolver._eliminateFlic(gs, pid, o, log);
          return;
        }
        if (o.type !== 'deplacer') return;

        const from = gs.plateau[o.from];
        if (!from) return;
        const adj = adjacencies[o.from] || [];
        if (!adj.includes(o.to)) {
          log.push({ pid, msg: `${gs.joueurs[pid].nom}: ${o.from}→${o.to} non adjacent`, type: 'warn' });
          return;
        }
        if (SpecialEntities.isZoneBlockedByIncorruptible(gs, o.to)) {
          log.push({ pid, msg: `${gs.joueurs[pid].nom}: ${o.to} bloqué par un incorruptible`, type: 'warn' });
          return;
        }
        const pionIdx = from.pions.findIndex(p => p.type === o.pion_type && p.joueur === pid);
        if (pionIdx === -1) {
          log.push({ pid, msg: `${gs.joueurs[pid].nom}: pas de ${o.pion_type} sur ${o.from}`, type: 'warn' });
          return;
        }
        moves.push({ pid, from: o.from, to: o.to, pion_type: o.pion_type, pionIdx, eliminer: !!o.eliminer });
        movedKeys.add(`${o.from}:${pionIdx}`);
      });
    });

    // 2 — Regrouper par destination
    const byDest = {};
    moves.forEach(m => {
      if (!byDest[m.to]) byDest[m.to] = [];
      byDest[m.to].push(m);
    });

    // 3 — Classifier : simple move vs conflit
    const simpleMoves = [];
    const conflicts = [];

    Object.entries(byDest).forEach(([dest, movers]) => {
      const destZone = gs.plateau[dest];
      const enemyArmed = destZone.pions.find(p =>
        IS_ARMED(p.type) && !movers.some(m => m.pid === p.joueur)
      );

      if (movers.length === 1 && !enemyArmed) {
        const m = movers[0];
        const friendArmed = destZone.pions.find(p => IS_ARMED(p.type) && p.joueur === m.pid);
        if (friendArmed) {
          log.push({ pid: m.pid, msg: `${gs.joueurs[m.pid].nom}: zone ${dest} a déjà un pion armé allié`, type: 'warn' });
        } else {
          simpleMoves.push(m);
        }
      } else {
        const attackerPids = [...new Set(movers.map(m => m.pid))];
        const defenderPid = enemyArmed ? enemyArmed.joueur : null;
        conflicts.push({ dest, movers, attackerPids, defenderPid });
      }
    });

    // 4 — Résoudre les conflits
    const resolvedMoves = [];
    const cancelledMoves = new Set();

    conflicts.forEach(c => {
      const result = ConflictResolver._resolveConflict(c, gs, adjacencies, movedKeys, byDest, gameplayData);
      log.push(...result.log);

      result.winners.forEach(m => resolvedMoves.push(m));
      result.cancelled.forEach(m => cancelledMoves.add(m));

      result.flights.forEach(flight => {
        ConflictResolver._executeFlight(gs, flight, adjacencies, log);
      });
    });

    // 5 — Exécuter les mouvements simples
    simpleMoves.forEach(m => {
      if (cancelledMoves.has(m)) return;
      ConflictResolver._executeMove(gs, m, log);
    });

    // 6 — Exécuter les mouvements gagnants
    resolvedMoves.forEach(m => {
      ConflictResolver._executeMove(gs, m, log);
    });

    // 7 — Mettre à jour la propriété des zones
    ConflictResolver._updateOwnership(gs);

    return log;
  }

  static _resolveConflict(conflict, gs, adjacencies, movedKeys, allByDest, gameplayRef) {
    const { dest, movers, attackerPids, defenderPid } = conflict;
    const result = { log: [], winners: [], cancelled: [], flights: [] };
    const adj = adjacencies[dest] || [];

    // Participants : chaque joueur impliqué (attaquants + défenseur)
    const participants = new Map();

    attackerPids.forEach(pid => {
      participants.set(pid, { strength: movers.filter(m => m.pid === pid).length, isDefender: false });
    });
    if (defenderPid !== null && !participants.has(defenderPid)) {
      participants.set(defenderPid, { strength: 1, isDefender: true });
    }

    // Compter les supports par participant
    adj.forEach(adjZone => {
      const zone = gs.plateau[adjZone];
      if (!zone) return;

      zone.pions.forEach((pion, idx) => {
        if (!IS_ARMED(pion.type)) return;
        if (movedKeys.has(`${adjZone}:${idx}`)) return;

        // Support coupé si la zone du supporter est elle-même attaquée par un ennemi
        const isAttacked = Object.values(allByDest).some(ms =>
          ms.some(m => m.to === adjZone && m.pid !== pion.joueur)
        );
        if (isAttacked) return;

        if (participants.has(pion.joueur)) {
          participants.get(pion.joueur).strength++;
        }
      });
    });

    // Déterminer le vainqueur
    let maxStrength = 0;
    let winner = null;
    let tied = false;

    participants.forEach((data, pid) => {
      if (data.strength > maxStrength) {
        maxStrength = data.strength;
        winner = pid;
        tied = false;
      } else if (data.strength === maxStrength) {
        tied = true;
      }
    });

    const forceDetails = [...participants.entries()]
      .map(([pid, data]) => {
        const name = gs.joueurs[pid]?.nom || '?';
        const color = gs.joueurs[pid]?.couleur || '#888';
        const units = movers.filter(m => m.pid === pid).length;
        const supports = data.strength - units - (data.isDefender ? 1 : 0);
        return `<span style="color:${color}">${name}</span> ${data.strength} (${units} pion${units > 1 ? 's' : ''}${supports > 0 ? ` + ${supports} support${supports > 1 ? 's' : ''}` : ''}${data.isDefender ? ' 🛡️' : ''})`;
      }).join(' vs ');

    const zoneName = gameplayRef?.zones?.[dest]?.nom || dest;

    if (tied || winner === null) {
      result.log.push({ pid: -1, msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → Égalité, statu quo !`, type: 'conflict' });
      movers.forEach(m => result.cancelled.push(m));
      return result;
    }

    const winnerName = gs.joueurs[winner].nom;
    const winnerMoves = movers.filter(m => m.pid === winner);
    const loserPids = [...participants.keys()].filter(p => p !== winner);

    result.log.push({
      pid: winner,
      msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → <strong style="color:${gs.joueurs[winner].couleur}">${winnerName}</strong> l'emporte !`,
      type: 'conflict'
    });

    // Les pions du vainqueur avancent (1 seul armé par case)
    if (winnerMoves.length > 0) result.winners.push(winnerMoves[0]);

    // Les attaquants perdants restent en place
    movers.filter(m => m.pid !== winner).forEach(m => result.cancelled.push(m));

    // Le défenseur doit fuir (ou être éliminé si le gagnant a payé)
    if (defenderPid !== null && defenderPid !== winner) {
      const wantElim = winnerMoves.some(m => m.eliminer);
      result.flights.push({ zone: dest, pid: defenderPid, eliminateBy: wantElim ? winner : null });
    }

    return result;
  }

  static _executeFlight(gs, flight, adjacencies, log) {
    const { zone: fromZone, pid, eliminateBy } = flight;
    const zoneData = gs.plateau[fromZone];
    const adj = adjacencies[fromZone] || [];
    const joueur = gs.joueurs[pid];

    // Trouver le pion armé du défenseur
    const armedIdx = zoneData.pions.findIndex(p => IS_ARMED(p.type) && p.joueur === pid);
    if (armedIdx === -1) return;

    // Élimination payante par le gagnant
    if (eliminateBy !== null && eliminateBy !== undefined) {
      const attacker = gs.joueurs[eliminateBy];
      const defPion = zoneData.pions[armedIdx];
      const cost = ELIM_COST[defPion.type];
      if (cost && attacker.ressources.lingots >= cost.lingots && attacker.ressources.armes >= (cost.armes || 0)) {
        attacker.ressources.lingots -= cost.lingots;
        attacker.ressources.armes -= (cost.armes || 0);
        attacker.electeurs_malus = (attacker.electeurs_malus || 0) + 100000;
        zoneData.pions.splice(armedIdx, 1);
        log.push({ pid: eliminateBy, msg: `💀 ${attacker.nom} élimine ${defPion.type} de ${joueur.nom} (−${cost.lingots}L, −${cost.armes || 0}A, −100k élect.)`, type: 'conflict' });
        return;
      }
    }

    // Trouver une case adjacente libre (pas de pion armé ennemi)
    const freeZones = adj.filter(a => {
      const z = gs.plateau[a];
      if (!z) return false;
      return !z.pions.some(p => IS_ARMED(p.type) && p.joueur !== pid);
    });

    if (freeZones.length === 0) {
      // Pas de fuite possible — le pion est éliminé
      const [removed] = zoneData.pions.splice(armedIdx, 1);
      log.push({ pid, msg: `💀 ${joueur.nom}: ${removed.type} éliminé (pas de fuite possible depuis ${fromZone})`, type: 'conflict' });
      return;
    }

    // Fuir vers la première zone libre
    const dest = freeZones[0];
    const [fugitive] = zoneData.pions.splice(armedIdx, 1);
    gs.plateau[dest].pions.push(fugitive);

    log.push({ pid, msg: `🏃 ${joueur.nom}: ${fugitive.type} fuit ${fromZone} → ${dest}`, type: 'conflict' });

    // Prostituée : emmener si possible
    const prostIdx = zoneData.pions.findIndex(p => IS_PROST(p.type) && p.joueur === pid);
    if (prostIdx !== -1) {
      const destHasProst = gs.plateau[dest].pions.some(p => IS_PROST(p.type));
      if (destHasProst) {
        // Prostituée capturée par le vainqueur
        const winnerPid = zoneData.pions.find(p => IS_ARMED(p.type))?.joueur;
        if (winnerPid !== undefined) {
          zoneData.pions[prostIdx].joueur = winnerPid;
          log.push({ pid: winnerPid, msg: `👑 ${gs.joueurs[winnerPid].nom} capture une prostituée sur ${fromZone}`, type: 'conflict' });
        }
      } else {
        // Emmener la prostituée
        const [prost] = zoneData.pions.splice(prostIdx, 1);
        gs.plateau[dest].pions.push(prost);
        log.push({ pid, msg: `${joueur.nom}: prostituée emmenée vers ${dest}`, type: 'move' });
      }
    }

    // Prostituée non protégée restante → capturée
    const unprotectedProst = zoneData.pions.findIndex(p =>
      IS_PROST(p.type) && p.joueur === pid &&
      !zoneData.pions.some(pp => IS_ARMED(pp.type) && pp.joueur === pid)
    );
    if (unprotectedProst !== -1) {
      const winnerOnZone = zoneData.pions.find(p => IS_ARMED(p.type));
      if (winnerOnZone) {
        zoneData.pions[unprotectedProst].joueur = winnerOnZone.joueur;
        log.push({
          pid: winnerOnZone.joueur,
          msg: `👑 ${gs.joueurs[winnerOnZone.joueur].nom} capture une prostituée abandonnée sur ${fromZone}`,
          type: 'conflict'
        });
      }
    }
  }

  static _executeMove(gs, move, log) {
    const fromZone = gs.plateau[move.from];
    const toZone = gs.plateau[move.to];

    const actualIdx = fromZone.pions.findIndex(p =>
      p.type === move.pion_type && p.joueur === move.pid
    );
    if (actualIdx === -1) return;

    const [pion] = fromZone.pions.splice(actualIdx, 1);
    toZone.pions.push(pion);

    log.push({
      pid: move.pid,
      msg: `${gs.joueurs[move.pid].nom}: ${move.pion_type} ${move.from} → ${move.to}`,
      type: 'move'
    });
  }

  static _createPion(gs, pid, order, log) {
    const joueur = gs.joueurs[pid];
    const costs = { dealer: { lingots: 40, armes: 2 }, trafiquant: { lingots: 80, armes: 3 } };
    const c = costs[order.pion_type];
    if (!c) return;

    if (joueur.ressources.lingots < c.lingots || joueur.ressources.armes < (c.armes || 0)) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de ressources pour ${order.pion_type}`, type: 'warn' });
      return;
    }
    const zone = gs.plateau[order.zone];
    if (!zone) return;
    if (zone.pions.some(p => IS_ARMED(p.type))) {
      log.push({ pid, msg: `${joueur.nom}: zone ${order.zone} a déjà un pion armé`, type: 'warn' });
      return;
    }

    joueur.ressources.lingots -= c.lingots;
    joueur.ressources.armes -= c.armes || 0;
    gs.caisses.hotel_police += c.lingots;
    zone.pions.push({ type: order.pion_type, joueur: pid });
    log.push({ pid, msg: `${joueur.nom} crée ${order.pion_type} sur ${order.zone} (−${c.lingots}L, −${c.armes}A)`, type: 'create' });
  }

  static _deployFlic(gs, pid, order, log) {
    const joueur = gs.joueurs[pid];
    const cost = 160 + 20;

    if (joueur.ressources.lingots < cost) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de lingots pour déployer un flic (${cost}L)`, type: 'warn' });
      return;
    }

    const myFlics = Object.values(gs.plateau)
      .flatMap(z => z.pions)
      .filter(p => p.type === 'flic' && p.joueur === pid).length;
    if (myFlics >= 2) {
      log.push({ pid, msg: `${joueur.nom}: max 2 flics par joueur atteint`, type: 'warn' });
      return;
    }

    const totalFlics = Object.values(gs.plateau)
      .flatMap(z => z.pions)
      .filter(p => p.type === 'flic').length;
    if (totalFlics >= 7) {
      log.push({ pid, msg: `${joueur.nom}: max 7 flics dans la partie atteint`, type: 'warn' });
      return;
    }

    const zone = gs.plateau[order.zone];
    if (!zone) return;

    joueur.ressources.lingots -= cost;
    gs.caisses.hotel_police += 160;
    zone.pions.push({ type: 'flic', joueur: pid });
    log.push({ pid, msg: `🚔 ${joueur.nom} déploie un flic sur ${order.zone} (−${cost}L)`, type: 'flic' });
  }

  static _eliminateFlic(gs, pid, order, log) {
    const joueur = gs.joueurs[pid];
    const zone = gs.plateau[order.zone];
    if (!zone) return;

    const flicIdx = zone.pions.findIndex(p => p.type === 'flic' && p.joueur !== pid);
    if (flicIdx === -1) {
      log.push({ pid, msg: `${joueur.nom}: pas de flic ennemi sur ${order.zone}`, type: 'warn' });
      return;
    }

    const definitif = order.definitif === true;
    const cost = definitif ? 550 : 300;

    if (joueur.ressources.lingots < cost) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de lingots (${cost}L) pour éliminer le flic`, type: 'warn' });
      return;
    }

    joueur.ressources.lingots -= cost;
    zone.pions.splice(flicIdx, 1);
    joueur.electeurs_malus = (joueur.electeurs_malus || 0) + 100000;

    const label = definitif ? 'définitivement' : '(retour hôtel de police)';
    log.push({ pid, msg: `🚔 ${joueur.nom} élimine un flic ${label} sur ${order.zone} (−${cost}L, −100k électeurs)`, type: 'flic' });
  }

  static _updateOwnership(gs) {
    Object.entries(gs.plateau).forEach(([zid, zone]) => {
      if (zone.pions.length === 0 && !zone.construction) {
        zone.proprietaire = null;
      } else if (zone.pions.length > 0) {
        const owners = [...new Set(zone.pions.filter(p => p.type !== 'flic').map(p => p.joueur))];
        if (owners.length === 1) zone.proprietaire = owners[0];
      }
    });
  }
}
