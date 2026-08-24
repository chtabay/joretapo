import { SpecialEntities } from './special-entities.js';

const IS_ARMED = t => t === 'dealer' || t === 'trafiquant';
const IS_PROST = t => t === 'prostituee_base' || t === 'prostituee_luxe';

/** Coût d'élimination d'un pion vaincu (spec 01:116-119). */
const ELIM_COST = {
  dealer:     { lingots: 40,  armes: 4 },
  trafiquant: { lingots: 160, armes: 6 }
};

/** Coût de création d'un homme armé (spec 01:116-119). */
const CREATE_COST = {
  dealer:     { lingots: 40, armes: 2 },
  trafiquant: { lingots: 80, armes: 3 }
};

/** Barème des flics (spec 01:136). */
const FLIC = {
  creation: 160,
  transport: 20,
  max_par_joueur: 2,
  max_total: 7,
  elim_temporaire: 300,
  elim_definitif: 550
};

const MALUS_ELECTEURS = 100000;

/**
 * Borne des conflits en cascade (spec 01:193-195). Un fugitif ne peut être
 * repoussé qu'un nombre fini de fois : au-delà il est éliminé et c'est journalisé.
 */
const MAX_CASCADE = 8;

export class ConflictResolver {

  /**
   * Résout tous les ordres de la Phase 5.
   *
   * Types d'ordres acceptés dans `allMoveOrders[pid]` :
   *   { type:'creer_pion',    zone, pion_type }
   *   { type:'deployer_flic', zone }
   *   { type:'eliminer_flic', zone, definitif? }
   *   { type:'deplacer',      from, to, pion_type, eliminer? }
   *   { type:'soutenir',      from, to, pion_type, pour_joueur? }
   *
   * @returns {Array<{pid:number, msg:string, type:string}>} journal de résolution
   */
  static resolve(gs, allMoveOrders, adjacencies, gameplayData) {
    const log = [];
    const pids = ConflictResolver._ordreJoueurs(allMoveOrders);

    // 1 — Ordres immédiats (création de pion, flics), joueurs mélangés (spec 06 #6)
    pids.forEach(pid => {
      (allMoveOrders[pid] || []).forEach(o => {
        if (!o) return;
        if (o.type === 'creer_pion') ConflictResolver._createPion(gs, pid, o, log);
        else if (o.type === 'deployer_flic') ConflictResolver._deployFlic(gs, pid, o, log);
        else if (o.type === 'eliminer_flic') ConflictResolver._eliminateFlic(gs, pid, o, log);
      });
    });

    // 2 — Parser les manœuvres (déplacements + soutiens)
    const { armedMoves, prostMoves, supports } =
      ConflictResolver._parseManoeuvres(gs, allMoveOrders, pids, adjacencies, log);

    const ctx = {
      gs, adjacencies, gameplayData, log,
      armedMoves, supports,
      pionsMobiles: new Set(armedMoves.map(m => m.pion)),
      pionsSoutiens: new Set(supports.map(s => s.pion)),
      fugitifs: new Map()
    };

    // 3 — Classifier : mouvement simple vs conflit
    const { simples, conflits } = ConflictResolver._classer(ctx);

    // 4 — Résoudre chaque conflit (forces + supports)
    const arrivees = [...simples];
    const fuites = [];
    conflits.forEach(c => {
      const r = ConflictResolver._resolveConflict(c, ctx);
      log.push(...r.log);
      if (r.winnerMove) arrivees.push(r.winnerMove);
      if (r.flight) fuites.push(r.flight);
    });

    // 5 — Déplacements de prostituées (non combattantes, spec 01:127/130) :
    //     exécutés en premier pour qu'elles puissent quitter une case menacée
    prostMoves.forEach(m => ConflictResolver._executeProstMove(ctx, m));

    // 6 — Les vaincus fuient (spec 01:188) avant que les vainqueurs n'avancent
    fuites.forEach(f => ConflictResolver._executeFlight(ctx, f, arrivees, 0));

    // 7 — Exécuter les arrivées : échanges/rotations et conflits en cascade
    ConflictResolver._executeArrivals(ctx, arrivees);

    // 8 — Mettre à jour la propriété des zones
    ConflictResolver._updateOwnership(gs);

    return log;
  }

  /* ═══════════════ 1 — ordre des joueurs ═══════════════ */

  static _ordreJoueurs(allMoveOrders) {
    const pids = Object.keys(allMoveOrders || {})
      .map(Number)
      .filter(n => Number.isInteger(n));
    for (let i = pids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pids[i], pids[j]] = [pids[j], pids[i]];
    }
    return pids;
  }

  /* ═══════════════ 2 — parsing des manœuvres ═══════════════ */

  static _parseManoeuvres(gs, allMoveOrders, pids, adjacencies, log) {
    const armedMoves = [];
    const prostMoves = [];
    const supports = [];
    const pionsEngages = new Set();
    const ciblesArmees = new Set();

    pids.forEach(pid => {
      const joueur = gs.joueurs[pid];
      if (!joueur) return;

      (allMoveOrders[pid] || []).forEach(o => {
        if (!o || (o.type !== 'deplacer' && o.type !== 'soutenir')) return;

        const from = gs.plateau[o.from];
        if (!from) return;

        const adj = adjacencies[o.from] || [];
        if (!adj.includes(o.to)) {
          log.push({ pid, msg: `${joueur.nom}: ${o.from}→${o.to} non adjacent`, type: 'warn' });
          return;
        }

        const candidats = from.pions.filter(p => p.type === o.pion_type && p.joueur === pid);
        if (candidats.length === 0) {
          log.push({ pid, msg: `${joueur.nom}: pas de ${o.pion_type} sur ${o.from}`, type: 'warn' });
          return;
        }
        const pion = candidats.find(p => !pionsEngages.has(p));
        if (!pion) {
          log.push({ pid, msg: `${joueur.nom}: le ${o.pion_type} de ${o.from} a déjà un ordre ce tour`, type: 'warn' });
          return;
        }

        // ── Ordre de soutien (spec 01:182) ──
        if (o.type === 'soutenir') {
          if (!IS_ARMED(pion.type)) {
            log.push({ pid, msg: `${joueur.nom}: seul un homme armé peut soutenir`, type: 'warn' });
            return;
          }
          const pour = (o.pour_joueur === undefined || o.pour_joueur === null) ? pid : Number(o.pour_joueur);
          if (!gs.joueurs[pour]) {
            log.push({ pid, msg: `${joueur.nom}: joueur soutenu inconnu`, type: 'warn' });
            return;
          }
          pionsEngages.add(pion);
          supports.push({ pid, pour, from: o.from, to: o.to, pion, pion_type: pion.type });
          log.push({
            pid,
            msg: `🤝 ${joueur.nom}: ${pion.type} de ${o.from} soutient ${gs.joueurs[pour].nom} sur ${o.to}`,
            type: 'move'
          });
          return;
        }

        // ── Ordre de déplacement ──
        if (SpecialEntities.isZoneBlockedByIncorruptible(gs, o.to)) {
          log.push({ pid, msg: `${joueur.nom}: ${o.to} bloqué par un incorruptible`, type: 'warn' });
          return;
        }
        if (SpecialEntities.isGitanZone(gs, o.to)) {
          log.push({ pid, msg: `${joueur.nom}: ${o.to} est un camp de gitans (traversée payante requise)`, type: 'warn' });
          return;
        }

        if (IS_ARMED(pion.type)) {
          const cle = `${pid}:${o.to}`;
          if (ciblesArmees.has(cle)) {
            log.push({ pid, msg: `${joueur.nom}: un seul homme armé peut viser ${o.to}, ordre ${o.pion_type} annulé`, type: 'warn' });
            return;
          }
          ciblesArmees.add(cle);
          pionsEngages.add(pion);
          armedMoves.push({
            pid, from: o.from, to: o.to, pion_type: pion.type, pion,
            eliminer: !!o.eliminer
          });
          return;
        }

        if (IS_PROST(pion.type)) {
          pionsEngages.add(pion);
          prostMoves.push({ pid, from: o.from, to: o.to, pion_type: pion.type, pion });
          return;
        }

        log.push({ pid, msg: `${joueur.nom}: ${o.pion_type} n'est pas déplaçable`, type: 'warn' });
      });
    });

    return { armedMoves, prostMoves, supports };
  }

  /* ═══════════════ 3 — classification ═══════════════ */

  static _classer(ctx) {
    const { gs, log, armedMoves, pionsMobiles } = ctx;
    const simples = [];
    const conflits = [];

    const byDest = {};
    armedMoves.forEach(m => {
      if (!byDest[m.to]) byDest[m.to] = [];
      byDest[m.to].push(m);
    });

    Object.entries(byDest).forEach(([dest, movers]) => {
      const zone = gs.plateau[dest];
      if (!zone) return;

      const immobilesArmes = zone.pions.filter(p => IS_ARMED(p.type) && !pionsMobiles.has(p));
      const defenseur = immobilesArmes.find(p => !movers.some(m => m.pid === p.joueur)) || null;
      const allie = immobilesArmes.find(p => movers.some(m => m.pid === p.joueur)) || null;

      let effectifs = movers;
      if (allie) {
        effectifs = movers.filter(m => {
          if (m.pid !== allie.joueur) return true;
          log.push({
            pid: m.pid,
            msg: `${gs.joueurs[m.pid].nom}: ${dest} porte déjà un de ses hommes armés, ${m.pion_type} reste sur ${m.from}`,
            type: 'warn'
          });
          return false;
        });
      }
      if (effectifs.length === 0) return;

      const attackerPids = [...new Set(effectifs.map(m => m.pid))];
      if (!defenseur && attackerPids.length === 1) {
        simples.push(effectifs[0]);
        return;
      }

      conflits.push({
        dest,
        movers: effectifs,
        attackerPids,
        defenderPid: defenseur ? defenseur.joueur : null,
        defenderPion: defenseur
      });
    });

    return { simples, conflits };
  }

  /* ═══════════════ 4 — résolution d'un conflit ═══════════════ */

  static _resolveConflict(conflict, ctx) {
    const { gs, adjacencies, gameplayData, armedMoves, supports, pionsMobiles, pionsSoutiens } = ctx;
    const { dest, movers, defenderPid } = conflict;
    const result = { log: [], winnerMove: null, flight: null };
    const adj = adjacencies[dest] || [];

    const participants = new Map();
    movers.forEach(m => participants.set(m.pid, { strength: 1, supports: 0, isDefender: false }));
    if (defenderPid !== null && defenderPid !== undefined && !participants.has(defenderPid)) {
      participants.set(defenderPid, { strength: 1, supports: 0, isDefender: true });
    }

    const dejaComptes = new Set();

    // Soutiens explicites — y compris entre joueurs différents (spec 01:182)
    supports.forEach(s => {
      if (s.to !== dest) return;
      if (!participants.has(s.pour)) return;
      if (dejaComptes.has(s.pion)) return;
      dejaComptes.add(s.pion);
      if (ConflictResolver._supportCoupe(armedMoves, s.from, s.pour, s.pid)) {
        result.log.push({
          pid: s.pid,
          msg: `✂️ ${gs.joueurs[s.pid].nom}: soutien depuis ${s.from} coupé (zone attaquée)`,
          type: 'conflict'
        });
        return;
      }
      const p = participants.get(s.pour);
      p.strength++;
      p.supports++;
    });

    // Soutiens automatiques : hommes armés immobiles et sans autre ordre
    adj.forEach(adjZone => {
      const zone = gs.plateau[adjZone];
      if (!zone) return;
      zone.pions.forEach(pion => {
        if (!IS_ARMED(pion.type)) return;
        if (pionsMobiles.has(pion) || pionsSoutiens.has(pion)) return;
        if (dejaComptes.has(pion)) return;
        if (!participants.has(pion.joueur)) return;
        if (ConflictResolver._supportCoupe(armedMoves, adjZone, pion.joueur, pion.joueur)) return;
        dejaComptes.add(pion);
        const p = participants.get(pion.joueur);
        p.strength++;
        p.supports++;
      });
    });

    // Vainqueur : force maximale strictement unique
    let maxStrength = 0;
    let gagnants = [];
    participants.forEach((data, pid) => {
      if (data.strength > maxStrength) { maxStrength = data.strength; gagnants = [pid]; }
      else if (data.strength === maxStrength) gagnants.push(pid);
    });

    const zoneName = gameplayData?.zones?.[dest]?.nom || dest;
    const forceDetails = [...participants.entries()].map(([pid, data]) => {
      const name = gs.joueurs[pid]?.nom || '?';
      const color = gs.joueurs[pid]?.couleur || '#888';
      return `<span style="color:${color}">${name}</span> ${data.strength} (1 pion${data.supports > 0 ? ` + ${data.supports} support${data.supports > 1 ? 's' : ''}` : ''}${data.isDefender ? ' 🛡️' : ''})`;
    }).join(' vs ');

    if (gagnants.length !== 1) {
      result.log.push({
        pid: -1,
        msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → Égalité, statu quo !`,
        type: 'conflict'
      });
      return result;
    }

    const winner = gagnants[0];
    result.log.push({
      pid: winner,
      msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → <strong style="color:${gs.joueurs[winner].couleur}">${gs.joueurs[winner].nom}</strong> l'emporte !`,
      type: 'conflict'
    });

    if (participants.get(winner).isDefender) {
      result.log.push({
        pid: winner,
        msg: `🛡️ ${gs.joueurs[winner].nom} conserve ${zoneName}`,
        type: 'conflict'
      });
      return result;
    }

    const winnerMove = movers.find(m => m.pid === winner);
    if (defenderPid !== null && defenderPid !== undefined) {
      result.flight = {
        zone: dest,
        pid: defenderPid,
        eliminateBy: winnerMove.eliminer ? winner : null
      };
    }
    result.winnerMove = winnerMove;
    return result;
  }

  /**
   * Le soutien est coupé si la case du supporter est attaquée par quelqu'un
   * d'autre que le joueur soutenu (spec 01:183).
   */
  static _supportCoupe(armedMoves, zone, pourPid, supporterPid) {
    return armedMoves.some(m => m.to === zone && m.pid !== pourPid && m.pid !== supporterPid);
  }

  /* ═══════════════ 5 — exécution des arrivées ═══════════════ */

  static _executeArrivals(ctx, arrivees) {
    const { gs, log } = ctx;
    let restants = arrivees.slice();
    const maxIterations = arrivees.length * 6 + 24;
    let iterations = 0;

    while (restants.length > 0 && iterations < maxIterations) {
      iterations++;

      // a) tout ce qui peut avancer immédiatement avance
      const libres = restants.filter(m => !ConflictResolver._armeSur(gs, m.to));
      if (libres.length > 0) {
        libres.forEach(m => ConflictResolver._executeMove(gs, m, log));
        restants = restants.filter(m => !libres.includes(m));
        continue;
      }

      // b) conflit en cascade : un fugitif occupe la case convoitée (spec 01:193-195)
      const bloque = restants[0];
      const bloqueur = ConflictResolver._armeSur(gs, bloque.to);
      const fugitif = ctx.fugitifs.get(bloque.to);

      if (bloqueur && fugitif && fugitif.pion === bloqueur && bloqueur.joueur !== bloque.pid) {
        // Conflit en cascade : un fugitif ne résiste pas à un nouveau conquérant
        ConflictResolver._executeFlight(ctx, {
          zone: bloque.to,
          pid: bloqueur.joueur,
          eliminateBy: bloque.eliminer ? bloque.pid : null,
          cascade: true
        }, restants, fugitif.depth);
        continue;
      }

      // c) échange de positions / rotation (spec 01:178)
      const cycle = ConflictResolver._detecterCycle(gs, restants);
      if (cycle) {
        ConflictResolver._executeCycle(gs, cycle, log);
        restants = restants.filter(m => !cycle.includes(m));
        continue;
      }

      // d) blocage définitif
      log.push({
        pid: bloque.pid,
        msg: `${gs.joueurs[bloque.pid].nom}: ${bloque.pion_type} bloqué, ${bloque.to} reste occupée`,
        type: 'warn'
      });
      restants = restants.filter(m => m !== bloque);
    }

    if (restants.length > 0) {
      log.push({
        pid: -1,
        msg: `⚠️ Résolution interrompue : ${restants.length} mouvement(s) non résolu(s) (borne de sécurité atteinte)`,
        type: 'warn'
      });
    }
  }

  static _armeSur(gs, zid) {
    return gs.plateau[zid]?.pions.find(p => IS_ARMED(p.type)) || null;
  }

  /** Cherche une rotation fermée (échange de 2 pions, ou cycle plus long). */
  static _detecterCycle(gs, restants) {
    const parFrom = new Map();
    restants.forEach(m => { if (!parFrom.has(m.from)) parFrom.set(m.from, m); });

    for (const depart of restants) {
      const chaine = [];
      let courant = depart;
      for (let i = 0; i <= restants.length; i++) {
        chaine.push(courant);
        const bloqueur = ConflictResolver._armeSur(gs, courant.to);
        const suivant = parFrom.get(courant.to);
        if (!suivant || !bloqueur || bloqueur !== suivant.pion) break;
        if (suivant === depart) return chaine;
        if (chaine.includes(suivant)) break;
        courant = suivant;
      }
    }
    return null;
  }

  static _executeCycle(gs, cycle, log) {
    cycle.forEach(m => {
      const zone = gs.plateau[m.from];
      const idx = zone.pions.indexOf(m.pion);
      if (idx !== -1) zone.pions.splice(idx, 1);
    });
    cycle.forEach(m => {
      gs.plateau[m.to].pions.push(m.pion);
      log.push({
        pid: m.pid,
        msg: `🔄 ${gs.joueurs[m.pid].nom}: ${m.pion_type} ${m.from} → ${m.to} (échange de positions)`,
        type: 'move'
      });
    });
    cycle.forEach(m => ConflictResolver._captureProstituees(gs, m.to, m.pid, log));
  }

  static _executeMove(gs, move, log) {
    const fromZone = gs.plateau[move.from];
    const toZone = gs.plateau[move.to];
    if (!fromZone || !toZone) return false;

    const idx = fromZone.pions.indexOf(move.pion);
    if (idx === -1) return false;

    fromZone.pions.splice(idx, 1);
    toZone.pions.push(move.pion);

    log.push({
      pid: move.pid,
      msg: `${gs.joueurs[move.pid].nom}: ${move.pion_type} ${move.from} → ${move.to}`,
      type: 'move'
    });

    ConflictResolver._captureProstituees(gs, move.to, move.pid, log);
    return true;
  }

  /**
   * Une prostituée sans homme armé de son camp sur la case est capturée par le
   * conquérant (spec 01:130 et 01:190).
   */
  static _captureProstituees(gs, zid, conquerantPid, log) {
    const zone = gs.plateau[zid];
    if (!zone) return;
    zone.pions.forEach(p => {
      if (!IS_PROST(p.type)) return;
      if (p.joueur === conquerantPid || p.joueur === null || p.joueur === undefined) return;
      const protegee = zone.pions.some(pp => IS_ARMED(pp.type) && pp.joueur === p.joueur);
      if (protegee) return;
      const ancien = gs.joueurs[p.joueur]?.nom || '?';
      p.joueur = conquerantPid;
      log.push({
        pid: conquerantPid,
        msg: `👑 ${gs.joueurs[conquerantPid].nom} capture une prostituée de ${ancien} sur ${zid}`,
        type: 'conflict'
      });
    });
  }

  /* ═══════════════ fuite du vaincu ═══════════════ */

  static _executeFlight(ctx, flight, restants, depth) {
    const { gs, adjacencies, log, fugitifs } = ctx;
    const { zone: fromZone, pid, eliminateBy } = flight;
    const zoneData = gs.plateau[fromZone];
    const joueur = gs.joueurs[pid];
    if (!zoneData || !joueur) return;

    const armedIdx = zoneData.pions.findIndex(p => IS_ARMED(p.type) && p.joueur === pid);
    if (armedIdx === -1) return;
    const defPion = zoneData.pions[armedIdx];

    const retirer = () => {
      const i = zoneData.pions.indexOf(defPion);
      if (i !== -1) zoneData.pions.splice(i, 1);
      if (fugitifs.get(fromZone)?.pion === defPion) fugitifs.delete(fromZone);
    };

    // Élimination payante (spec 01:191)
    if (eliminateBy !== null && eliminateBy !== undefined) {
      const attacker = gs.joueurs[eliminateBy];
      const cost = ELIM_COST[defPion.type];
      if (attacker && cost &&
          attacker.ressources.lingots >= cost.lingots &&
          attacker.ressources.armes >= (cost.armes || 0)) {
        attacker.ressources.lingots -= cost.lingots;
        attacker.ressources.armes -= (cost.armes || 0);
        gs.caisses.hotel_police += cost.lingots;
        attacker.electeurs_malus = (attacker.electeurs_malus || 0) + MALUS_ELECTEURS;
        retirer();
        log.push({
          pid: eliminateBy,
          msg: `💀 ${attacker.nom} élimine ${defPion.type} de ${joueur.nom} (−${cost.lingots}L, −${cost.armes || 0}A, −100k élect.)`,
          type: 'conflict'
        });
        return;
      }
      if (attacker && cost) {
        log.push({
          pid: eliminateBy,
          msg: `${attacker.nom}: élimination impossible (${cost.lingots}L + ${cost.armes || 0}A requis) — ${defPion.type} de ${joueur.nom} prend la fuite`,
          type: 'warn'
        });
      }
    }

    if (depth >= MAX_CASCADE) {
      retirer();
      log.push({
        pid,
        msg: `💀 ${joueur.nom}: ${defPion.type} éliminé — cascade de fuites bornée à ${MAX_CASCADE} sur ${fromZone}`,
        type: 'warn'
      });
      return;
    }

    const attendues = new Set(restants.map(m => m.to));
    const candidates = (adjacencies[fromZone] || []).filter(a => {
      const z = gs.plateau[a];
      if (!z) return false;
      if (z.pions.some(p => IS_ARMED(p.type))) return false;
      if (SpecialEntities.isZoneBlockedByIncorruptible(gs, a)) return false;
      if (SpecialEntities.isGitanZone(gs, a)) return false;
      return true;
    }).sort((a, b) => {
      const ca = attendues.has(a) ? 1 : 0;
      const cb = attendues.has(b) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      const oa = gs.plateau[a].proprietaire === pid ? 0 : 1;
      const ob = gs.plateau[b].proprietaire === pid ? 0 : 1;
      if (oa !== ob) return oa - ob;
      return a < b ? -1 : 1;
    });

    if (candidates.length === 0) {
      retirer();
      log.push({
        pid,
        msg: `💀 ${joueur.nom}: ${defPion.type} éliminé (pas de fuite possible depuis ${fromZone})`,
        type: 'conflict'
      });
      return;
    }

    const dest = candidates[0];
    retirer();
    gs.plateau[dest].pions.push(defPion);
    fugitifs.set(dest, { pion: defPion, pid, depth: depth + 1 });
    log.push({
      pid,
      msg: `🏃 ${joueur.nom}: ${defPion.type} fuit ${fromZone} → ${dest}`,
      type: 'conflict'
    });

    // La prostituée suit son protecteur, sauf si la case d'arrivée en a déjà une
    const prostIdx = zoneData.pions.findIndex(p => IS_PROST(p.type) && p.joueur === pid);
    if (prostIdx !== -1) {
      if (!gs.plateau[dest].pions.some(p => IS_PROST(p.type))) {
        const [prost] = zoneData.pions.splice(prostIdx, 1);
        gs.plateau[dest].pions.push(prost);
        log.push({ pid, msg: `${joueur.nom}: prostituée emmenée vers ${dest}`, type: 'move' });
      } else {
        log.push({
          pid,
          msg: `${joueur.nom}: prostituée abandonnée sur ${fromZone} (${dest} en a déjà une)`,
          type: 'conflict'
        });
      }
    }
  }

  /* ═══════════════ 6 — prostituées ═══════════════ */

  static _executeProstMove(ctx, move) {
    const { gs, log, pionsMobiles } = ctx;
    const joueur = gs.joueurs[move.pid];
    const toZone = gs.plateau[move.to];
    const fromZone = gs.plateau[move.from];
    if (!toZone || !fromZone || !joueur) return;

    if (toZone.pions.some(p => IS_PROST(p.type))) {
      log.push({ pid: move.pid, msg: `${joueur.nom}: ${move.to} a déjà une prostituée`, type: 'warn' });
      return;
    }
    if (toZone.pions.some(p => IS_ARMED(p.type) && p.joueur !== move.pid && !pionsMobiles.has(p))) {
      log.push({ pid: move.pid, msg: `${joueur.nom}: ${move.to} est tenue par un homme armé adverse`, type: 'warn' });
      return;
    }

    const idx = fromZone.pions.indexOf(move.pion);
    if (idx === -1) return;
    fromZone.pions.splice(idx, 1);
    toZone.pions.push(move.pion);
    log.push({
      pid: move.pid,
      msg: `${joueur.nom}: ${move.pion_type} ${move.from} → ${move.to}`,
      type: 'move'
    });
  }

  /* ═══════════════ ordres immédiats ═══════════════ */

  static _createPion(gs, pid, order, log) {
    const joueur = gs.joueurs[pid];
    if (!joueur) return;
    const c = CREATE_COST[order.pion_type];
    if (!c) return;

    if (joueur.ressources.lingots < c.lingots || joueur.ressources.armes < (c.armes || 0)) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de ressources pour ${order.pion_type}`, type: 'warn' });
      return;
    }
    const zone = gs.plateau[order.zone];
    if (!zone) return;
    if (SpecialEntities.isGitanZone(gs, order.zone)) {
      log.push({ pid, msg: `${joueur.nom}: création impossible sur un camp de gitans`, type: 'warn' });
      return;
    }
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
    if (!joueur) return;
    const cost = FLIC.creation + FLIC.transport;

    if (joueur.ressources.lingots < cost) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de lingots pour déployer un flic (${cost}L)`, type: 'warn' });
      return;
    }

    const surPlateau = Object.values(gs.plateau).flatMap(z => z.pions).filter(p => p.type === 'flic');
    if (surPlateau.filter(p => p.joueur === pid).length >= FLIC.max_par_joueur) {
      log.push({ pid, msg: `${joueur.nom}: max ${FLIC.max_par_joueur} flics par joueur atteint`, type: 'warn' });
      return;
    }

    const plafond = Number.isInteger(gs.flics?.reserves) ? gs.flics.reserves : FLIC.max_total;
    if (surPlateau.length >= plafond) {
      log.push({ pid, msg: `${joueur.nom}: plus de flic disponible (${plafond} en service)`, type: 'warn' });
      return;
    }

    const zone = gs.plateau[order.zone];
    if (!zone) return;

    joueur.ressources.lingots -= cost;
    gs.caisses.hotel_police += cost;
    zone.pions.push({ type: 'flic', joueur: pid });
    log.push({ pid, msg: `🚔 ${joueur.nom} déploie un flic sur ${order.zone} (−${cost}L)`, type: 'flic' });
  }

  static _eliminateFlic(gs, pid, order, log) {
    const joueur = gs.joueurs[pid];
    if (!joueur) return;
    const zone = gs.plateau[order.zone];
    if (!zone) return;

    const flicIdx = zone.pions.findIndex(p => p.type === 'flic' && p.joueur !== pid);
    if (flicIdx === -1) {
      log.push({ pid, msg: `${joueur.nom}: pas de flic ennemi sur ${order.zone}`, type: 'warn' });
      return;
    }

    const definitif = order.definitif === true;
    const cost = definitif ? FLIC.elim_definitif : FLIC.elim_temporaire;

    if (joueur.ressources.lingots < cost) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de lingots (${cost}L) pour éliminer le flic`, type: 'warn' });
      return;
    }

    joueur.ressources.lingots -= cost;
    gs.caisses.hotel_police += cost;
    zone.pions.splice(flicIdx, 1);
    joueur.electeurs_malus = (joueur.electeurs_malus || 0) + MALUS_ELECTEURS;

    if (definitif && gs.flics) {
      gs.flics.reserves = Math.max(0, (gs.flics.reserves ?? FLIC.max_total) - 1);
      gs.flics.elimines = (gs.flics.elimines || 0) + 1;
    }

    const label = definitif
      ? `définitivement (${gs.flics?.reserves ?? '?'} flics restants dans la partie)`
      : '(retour hôtel de police)';
    log.push({ pid, msg: `🚔 ${joueur.nom} élimine un flic ${label} sur ${order.zone} (−${cost}L, −100k électeurs)`, type: 'flic' });
  }

  /* ═══════════════ 7 — propriété des zones ═══════════════ */

  static _updateOwnership(gs) {
    Object.values(gs.plateau).forEach(zone => {
      const pionsJoueurs = zone.pions.filter(p =>
        p.type !== 'flic' && p.joueur !== null && p.joueur !== undefined
      );

      const armes = [...new Set(pionsJoueurs.filter(p => IS_ARMED(p.type)).map(p => p.joueur))];
      if (armes.length === 1) { zone.proprietaire = armes[0]; return; }
      if (armes.length > 1) return; // situation illégale : on ne tranche pas

      if (zone.construction) return; // la construction fixe la propriété

      const occupants = [...new Set(pionsJoueurs.map(p => p.joueur))];
      if (occupants.length === 1) { zone.proprietaire = occupants[0]; return; }
      if (occupants.length === 0) { zone.proprietaire = null; return; }
      if (!occupants.includes(zone.proprietaire)) zone.proprietaire = null;
    });
  }
}
