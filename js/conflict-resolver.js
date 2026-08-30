import { SpecialEntities } from './special-entities.js';
import { COUTS } from './rules.js';

const IS_ARMED = t => t === 'dealer' || t === 'trafiquant';

/** Portée du soutien explicite à un allié, en nombre de zones. */
export const PORTEE_SOUTIEN = 2;
const IS_PROST = t => t === 'prostituee_base' || t === 'prostituee_luxe';

const ELIM_COST = COUTS.eliminer_en_conflit;

/**
 * Ce qui empêche un pion d'entrer sur une case, ou null.
 *
 * Exportée parce que la feuille d'ordres doit pouvoir dire NON *avant* que le
 * joueur paie son ordre. La règle vivait ici seule : la modale proposait donc
 * des destinations que le moteur refusait ensuite en silence, et le joueur
 * voyait un tour dépensé pour rien — ce qui se raconte à la table comme « ça a
 * planté ». Une seule source, deux lecteurs.
 *
 * Un pion armé ennemi n'est PAS un obstacle : c'est une attaque, et elle part
 * en résolution de conflit.
 */
export function obstacleEntree(destZone, pionType, pid, partants = []) {
  if (!destZone) return null;
  const restants = pionsRestants(destZone.pions, partants);
  if (IS_ARMED(pionType) && restants.some(p => IS_ARMED(p.type) && p.joueur === pid)) {
    return 'a déjà un pion armé à vous';
  }
  if (IS_PROST(pionType) && restants.some(p => IS_PROST(p.type))) {
    return 'a déjà une prostituée';
  }
  return null;
}

/**
 * Ce qui reste sur une case une fois les partants retirés.
 *
 * Un départ se décrit par { type, joueur } et retire UN pion correspondant :
 * deux pions identiques ne s'annulent pas avec un seul ordre.
 */
function pionsRestants(pions, partants) {
  if (!partants || !partants.length) return pions;
  const reste = [...pions];
  partants.forEach(d => {
    const i = reste.findIndex(p => p.type === d.type && p.joueur === d.joueur);
    if (i !== -1) reste.splice(i, 1);
  });
  return reste;
}

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
    const supports = [];

    Object.entries(allMoveOrders).forEach(([pid, orders]) => {
      pid = Number(pid);
      (orders || []).forEach(o => {
        if (o.type === 'soutenir') {
          supports.push({ pid, from: o.from, to: o.to, beneficiaire: Number(o.beneficiaire) });
          return;
        }
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
        /* La cohabitation ne se juge plus ici : voir l'etape 4bis. Trancher a ce
           stade, c'est juger chaque entree contre le plateau d'AVANT tout
           mouvement — donc refuser tout echange et toute rotation, alors que le
           pion qui bloque s'en va au meme instant. Mesure : la regle « un pion
           arme par case » retire 18,8 % des entrees possibles a quatre joueurs,
           et dans 99,8 % de ces cas le bloqueur avait lui-meme une sortie. */
        simpleMoves.push(movers[0]);
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
      const result = ConflictResolver._resolveConflict(
        c, gs, adjacencies, movedKeys, byDest, gameplayData,
        supports.filter(s => s.to === c.dest)
      );
      log.push(...result.log);

      result.winners.forEach(m => resolvedMoves.push(m));
      result.cancelled.forEach(m => cancelledMoves.add(m));

      /* Une case qu'un ordre encore debout conquiert n'est un refuge qu'en
         DERNIER recours. Les fuites s'exécutent ici, le verrou « pion armé
         adverse » à l'étape 4bis : sans cette préférence, un pion délogé
         ailleurs atterrit sur la case qu'un vainqueur vient de nettoyer, et
         c'est le vainqueur qui se voit refuser l'entrée — après avoir payé
         l'élimination. Mesuré au fuzz : 442 des 3 032 éliminations payantes
         étaient ainsi perdues, soit 43 600 lingots et 44,2 M d'électeurs.
         On ne RETIRE pas ces cases du refuge : la variante stricte fait bondir
         les éliminations faute de fuite de 4 421 à 6 654. */
      const convoitees = new Set([...simpleMoves, ...resolvedMoves]
        .filter(m => !cancelledMoves.has(m) && IS_ARMED(m.pion_type))
        .map(m => m.to));
      result.flights.forEach(flight => {
        ConflictResolver._executeFlight(gs, flight, adjacencies, log, convoitees);
      });
    });

    /* 4bis — Qui peut vraiment entrer, une fois qu'on sait qui part.
     *
     * On part de l'hypothese optimiste que tout ordre encore debout apres les
     * conflits aboutit, puis on retire un a un ceux qu'un pion reste sur place
     * empeche. Retirer un depart ne peut que rendre d'autres entrees illegales,
     * jamais legales : la suite est decroissante et converge. Le plus grand
     * point fixe garde les cycles — chacun est libere par le suivant — et fait
     * s'effondrer les chaines dont la tete est bloquee.
     *
     * Le placer ICI, apres les conflits et apres les fuites, est ce qui evite le
     * piege paye une fois : `movedKeys` est peuple au parsing et compte comme
     * partis des pions dont l'ordre sera annule en conflit, ce qui laissait deux
     * pions armes du meme joueur sur une case. Un ordre annule n'entre jamais
     * dans `enAttente` : il n'a donc jamais valeur de depart. */
    const enAttente = [...simpleMoves, ...resolvedMoves].filter(m => !cancelledMoves.has(m));
    const confirmes = new Set(enAttente);
    const refuses = new Map();
    for (let passe = 0; passe <= enAttente.length; passe++) {
      let change = false;
      for (const m of enAttente) {
        if (!confirmes.has(m)) continue;
        const partants = [];      /* mes departs : clause « un pion arme a moi » */
        const tousPartants = [];  /* tous : clause « un pion arme adverse » */
        confirmes.forEach(x => {
          if (x.from !== m.to) return;
          tousPartants.push({ type: x.pion_type, joueur: x.pid });
          if (x.pid === m.pid) partants.push({ type: x.pion_type, joueur: x.pid });
        });
        let obstacle = obstacleEntree(gs.plateau[m.to], m.pion_type, m.pid, partants);
        /* Dernier verrou, apres les fuites : le garde de _resolveConflict lit le
           plateau d'AVANT les fuites, un fugitif qui atterrit ici lui echappe. */
        if (!obstacle && IS_ARMED(m.pion_type)) {
          const restants = pionsRestants(gs.plateau[m.to].pions, tousPartants);
          if (restants.some(p => IS_ARMED(p.type) && p.joueur !== m.pid)) {
            obstacle = 'reste tenue par un pion armé adverse';
          }
        }
        if (obstacle) { confirmes.delete(m); refuses.set(m, obstacle); change = true; }
      }
      if (!change) break;
    }

    /* Un refus muet est ce qui s'est raconte a la table comme « ca a plante ».
       Quand le refus vient d'une sortie qui n'a pas abouti, on le dit : sinon le
       joueur lit « case occupee » sur une case qu'il croyait vider. */
    refuses.forEach((obstacle, m) => {
      const nomZone = gameplayData?.zones?.[m.to]?.nom || m.to;
      const sortieRatee = enAttente.some(x => x.from === m.to && x.pid === m.pid && !confirmes.has(x))
        || moves.some(x => x.from === m.to && x.pid === m.pid && cancelledMoves.has(x));
      log.push({
        pid: m.pid,
        msg: `${gs.joueurs[m.pid].nom}: ${nomZone} ${obstacle}`
           + (sortieRatee ? ' — son ordre de sortie n\'a pas abouti' : ''),
        type: 'warn'
      });
    });

    /* 5 — Executer. L'ordre est indifferent : un pion n'est qu'un
       { type, joueur }, deux pions identiques sont interchangeables, donc un
       empilement transitoire pendant l'execution d'un cycle ne s'observe pas. */
    enAttente.forEach(m => {
      if (confirmes.has(m)) ConflictResolver._executeMove(gs, m, log);
    });

    // 7 — Mettre à jour la propriété des zones
    ConflictResolver._updateOwnership(gs);

    return log;
  }

  static _resolveConflict(conflict, gs, adjacencies, movedKeys, allByDest, gameplayRef, explicitSupports = []) {
    const { dest, movers, attackerPids, defenderPid } = conflict;
    const result = { log: [], winners: [], cancelled: [], flights: [] };
    const adj = adjacencies[dest] || [];
    const zonesADeuxCases = new Set(adj);
    adj.forEach(v => (adjacencies[v] || []).forEach(w => { if (w !== dest) zonesADeuxCases.add(w); }));

    // Participants : chaque joueur impliqué (attaquants + défenseur)
    const participants = new Map();

    attackerPids.forEach(pid => {
      participants.set(pid, { strength: movers.filter(m => m.pid === pid).length, isDefender: false, allies: [] });
    });
    if (defenderPid !== null && !participants.has(defenderPid)) {
      participants.set(defenderPid, { strength: 1, isDefender: true, allies: [] });
    }

    /* Un support est coupé si la zone du supporteur est elle-même attaquée —
       sauf par celui qu'il soutient, qui ne se coupe pas lui-même. */
    const supportCoupe = (zoneSupport, beneficiaire) =>
      Object.values(allByDest).some(ms =>
        ms.some(m => m.to === zoneSupport && m.pid !== beneficiaire)
      );

    /* ── Soutien explicite à un allié ────────────────────────────────────────
       Sans lui, `participants.get(pion.joueur)` plus bas ne crédite jamais que le
       propriétaire du pion : il était mécaniquement impossible d'aider quelqu'un
       d'autre, alors que le panneau d'ordres l'annonçait. Or dans un jeu de type
       Diplomacy, on négocie précisément parce que le soutien d'un tiers est la
       seule façon de gagner un combat qu'on ne peut pas gagner seul. La phase de
       négociation n'avait donc rien à négocier.

       Le soutien coûte un ordre : c'est ce qui lui donne son prix à la table. */
    const usedForSupport = new Set();

    /* Portee du soutien explicite : DEUX zones, la ou le soutien passif reste a
       une. Mesure sur 40 parties simulees : sur 529 zones disputees par au moins
       deux camps, un joueur non implique avait un pion arme sur une zone voisine
       dans UN cas. L'ordre de soutien a un allie — la seule chose que la phase de
       negociation avait a negocier — etait donc quasi injouable.
       Aider deliberement porte plus loin que monter la garde : c'est un
       deplacement de troupe qu'on renonce a faire. */
    const aPortee = zoneSource => zonesADeuxCases.has(zoneSource);

    explicitSupports.forEach(s => {
      const zone = gs.plateau[s.from];
      if (!zone) return;
      if (!aPortee(s.from)) {
        result.log.push({ pid: s.pid, msg: `${gs.joueurs[s.pid]?.nom}: soutien impossible, ${s.from} est à plus de ${PORTEE_SOUTIEN} zones de ${dest}`, type: 'warn' });
        return;
      }
      const idx = zone.pions.findIndex((p, i) =>
        IS_ARMED(p.type) && p.joueur === s.pid &&
        !movedKeys.has(`${s.from}:${i}`) && !usedForSupport.has(`${s.from}:${i}`)
      );
      if (idx === -1) {
        result.log.push({ pid: s.pid, msg: `${gs.joueurs[s.pid]?.nom}: aucun pion armé disponible sur ${s.from} pour soutenir`, type: 'warn' });
        return;
      }
      const cible = participants.get(s.beneficiaire);
      if (!cible) {
        result.log.push({ pid: s.pid, msg: `${gs.joueurs[s.pid]?.nom}: ${gs.joueurs[s.beneficiaire]?.nom || '?'} n'est pas engagé sur ${dest}`, type: 'warn' });
        return;
      }
      if (supportCoupe(s.from, s.beneficiaire)) {
        result.log.push({ pid: s.pid, msg: `✂️ ${gs.joueurs[s.pid]?.nom}: soutien coupé, ${s.from} est attaqué`, type: 'conflict' });
        return;
      }

      usedForSupport.add(`${s.from}:${idx}`);
      cible.strength++;
      if (s.pid !== s.beneficiaire) cible.allies.push(s.pid);
      result.log.push({
        pid: s.pid,
        msg: `🤝 <strong style="color:${gs.joueurs[s.pid]?.couleur}">${gs.joueurs[s.pid]?.nom}</strong> soutient <strong style="color:${gs.joueurs[s.beneficiaire]?.couleur}">${gs.joueurs[s.beneficiaire]?.nom}</strong> sur ${dest}`,
        type: 'conflict'
      });
    });

    // Support passif : un pion armé immobile défend son propre camp
    adj.forEach(adjZone => {
      const zone = gs.plateau[adjZone];
      if (!zone) return;

      zone.pions.forEach((pion, idx) => {
        if (!IS_ARMED(pion.type)) return;
        if (movedKeys.has(`${adjZone}:${idx}`)) return;
        /* Un pion déjà engagé dans un soutien explicite ne compte pas deux fois. */
        if (usedForSupport.has(`${adjZone}:${idx}`)) return;
        if (supportCoupe(adjZone, pion.joueur)) return;

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
        const allies = (data.allies || []).length
          ? `, dont ${[...new Set(data.allies)].map(a => gs.joueurs[a]?.nom).join(' et ')}`
          : '';
        return `<span style="color:${color}">${name}</span> ${data.strength} (${units} pion${units > 1 ? 's' : ''}${supports > 0 ? ` + ${supports} soutien${supports > 1 ? 's' : ''}${allies}` : ''}${data.isDefender ? ' 🛡️' : ''})`;
      }).join(' vs ');

    const zoneName = gameplayRef?.zones?.[dest]?.nom || dest;

    /* ── Departage d'une egalite ─────────────────────────────────────────────
       Une egalite annulait tous les mouvements sans rien couter a personne. Sur
       40 parties simulees : 353 egalites, soit 8,8 par partie, dont 66 % rejouees
       a l'identique au tour suivant — pendant que 0,7 zone seulement changeait de
       mains. Le front etait gele, et se bloquer etait la position la moins chere
       du jeu : on repassait le meme ordre.

       On tranche donc au tour meme, dans cet ordre :

         1. Celui qui TIENT la zone l'emporte. On ne deloge pas sans superiorite —
            c'est la regle de Diplomacy, et elle vaut aussi pour le proprietaire
            qui a conquis la zone puis en est sorti.
         2. Sinon, celui qui engage le PLUS DE PIONS PROPRES. Les soutiens font le
            total, la chair fait le departage : une force obtenue par alliance ne
            vaut pas une force qu'on a payee de ses pions.
         3. Sinon seulement, statu quo.

       Le point 2 est ce qui donne son prix a la negociation : un allie vous fait
       gagner le total, il ne vous fait pas gagner l'egalite. */
    if (tied || winner === null) {
      const exAequo = [...participants.entries()].filter(([, d]) => d.strength === maxStrength);

      /* « Tenir la zone », c'est y avoir un pion, pas y avoir le drapeau. Les
         deux criteres etaient fusionnes dans un seul find, tranche par l'ordre
         d'insertion — les attaquants avant le defenseur : il suffisait qu'une
         prostituee de l'ancien proprietaire soit restee sur place pour que le
         drapeau ne suive pas le pion arme adverse, et l'attaquant delogeait a
         force strictement egale un defenseur bien present. */
      const physique = exAequo.find(([, d]) => d.isDefender);
      const drapeau = exAequo.find(([pid]) => gs.plateau[dest]?.proprietaire === pid);
      const enPlace = physique || drapeau;
      let departage = enPlace || null;
      let motif = physique ? 'défend la zone' : enPlace ? 'la zone lui appartient' : null;

      if (!departage) {
        const pionsDe = pid => movers.filter(m => m.pid === pid).length;
        const meilleur = Math.max(...exAequo.map(([pid]) => pionsDe(pid)));
        const candidats = exAequo.filter(([pid]) => pionsDe(pid) === meilleur);
        if (candidats.length === 1) {
          departage = candidats[0];
          motif = `engage ${meilleur} pion${meilleur > 1 ? 's' : ''} contre moins`;
        }
      }

      if (!departage) {
        result.log.push({ pid: -1, msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → Égalité parfaite, statu quo !`, type: 'conflict' });
        movers.forEach(m => result.cancelled.push(m));
        return result;
      }

      winner = departage[0];
      result.log.push({
        pid: winner,
        msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → égalité départagée : <strong style="color:${gs.joueurs[winner].couleur}">${gs.joueurs[winner].nom}</strong> l'emporte (${motif})`,
        type: 'conflict'
      });
    }

    const winnerName = gs.joueurs[winner].nom;
    const winnerMoves = movers.filter(m => m.pid === winner);
    const loserPids = [...participants.keys()].filter(p => p !== winner);

    result.log.push({
      pid: winner,
      msg: `⚔️ Conflit sur <strong>${zoneName}</strong> — ${forceDetails} → <strong style="color:${gs.joueurs[winner].couleur}">${winnerName}</strong> l'emporte !`,
      type: 'conflict'
    });

    /* On n'entre jamais sur une case ou un pion arme adverse reste debout.
       Le classement du defenseur ignore les pions d'un joueur qui attaque aussi
       la case : quand un joueur y avait deja un pion ET en envoyait un autre,
       personne n'etait declare defenseur, personne ne fuyait — et depuis que
       l'egalite est departagee, le vainqueur entrait par-dessus. La case
       finissait avec un pion arme de chaque camp, configuration que le jeu
       interdit partout ailleurs et devant laquelle le decompte de propriete
       renonce. */
    const survivants = gs.plateau[dest].pions.filter(p =>
      IS_ARMED(p.type) && p.joueur !== winner &&
      !(defenderPid !== null && defenderPid !== winner && p.joueur === defenderPid)
    );
    if (winnerMoves.length > 0) {
      if (survivants.length === 0) {
        result.winners.push(winnerMoves[0]);
      } else {
        result.cancelled.push(winnerMoves[0]);
        result.log.push({
          pid: winner,
          msg: `${gs.joueurs[winner].nom}: ${zoneName} reste tenue par un pion adverse, l'assaut rebondit`,
          type: 'warn'
        });
      }
    }

    // Les attaquants perdants restent en place
    movers.filter(m => m.pid !== winner).forEach(m => result.cancelled.push(m));

    // Le défenseur doit fuir (ou être éliminé si le gagnant a payé)
    if (defenderPid !== null && defenderPid !== winner) {
      const wantElim = winnerMoves.some(m => m.eliminer);
      result.flights.push({ zone: dest, pid: defenderPid, eliminateBy: wantElim ? winner : null });
    }

    return result;
  }

  static _executeFlight(gs, flight, adjacencies, log, convoitees = new Set()) {
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

    /* Une case libre, c'est une case SANS pion armé — pas seulement sans pion
       armé ennemi. Le `p.joueur !== pid` faisait fuir le pion délogé sur une
       case où il en avait déjà un : deux pions armés du même joueur sur la même
       case, ce que trois modules interdisent. */
    const freeZones = adj.filter(a => {
      const z = gs.plateau[a];
      if (!z) return false;
      return !z.pions.some(p => IS_ARMED(p.type));
    });

    if (freeZones.length === 0) {
      // Pas de fuite possible — le pion est éliminé
      const [removed] = zoneData.pions.splice(armedIdx, 1);
      log.push({ pid, msg: `💀 ${joueur.nom}: ${removed.type} éliminé (pas de fuite possible depuis ${fromZone})`, type: 'conflict' });
      return;
    }

    // Fuir vers la première zone libre
    const dest = freeZones.find(a => !convoitees.has(a)) ?? freeZones[0];
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
    const costs = COUTS.creer_pion;
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
    const cost = COUTS.deployer_flic.lingots;

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
    const cost = (definitif ? COUTS.eliminer_flic.definitif : COUTS.eliminer_flic.temporaire).lingots;

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

  /**
   * Propriété des zones — une zone conquise le RESTE jusqu'à ce qu'un autre la prenne.
   *
   * Auparavant, une zone vidée de ses pions redevenait neutre. Un joueur qui avançait
   * perdait donc la case qu'il quittait : le territoire ne pouvait jamais croître par
   * le déplacement, uniquement par l'achat de nouveaux pions, à 40 ou 80 lingots
   * pièce. Mesuré au banc d'essai : les points d'un joueur oscillaient 15 → 0 → 15
   * d'un tour à l'autre, il avançait un pion, perdait la majorité de son quartier,
   * puis reculait. Aucune partie ne progressait.
   *
   * Désormais on plante un drapeau : la zone change de main quand un autre joueur
   * y installe ses pions, pas quand on en sort. L'occupation redevient un choix de
   * position — tenir, avancer, laisser derrière soi — au lieu d'une obligation.
   * Une zone n'est neutre qu'au début de la partie.
   */
  static _updateOwnership(gs) {
    Object.values(gs.plateau).forEach(zone => {
      /* Les flics n'appartiennent à personne au sens territorial : ils bloquent des
         revenus, ils ne conquièrent pas. Les gitans non plus (joueur null). */
      const occupants = [...new Set(
        zone.pions.filter(p => p.type !== 'flic' && p.joueur !== null && p.joueur !== undefined)
          .map(p => p.joueur)
      )];
      if (occupants.length === 1) zone.proprietaire = occupants[0];
      /* Zéro occupant : on garde le drapeau. Plusieurs : personne ne l'emporte,
         la zone reste à qui elle était. */
    });
  }
}
