export class SpecialEntities {

  // ═══════════════════════════════════════════
  //  GITANS
  // ═══════════════════════════════════════════

  static isGitanZone(gs, zoneId) {
    return gs.gitans.positions.includes(zoneId) || gs.plateau[zoneId]?.gitans === true;
  }

  static TRAVERSE_COST = { doses: 5, armes: 5, sacrifice_pion: true };

  static canTraverseGitans(gs, pid) {
    const j = gs.joueurs[pid];
    const c = SpecialEntities.TRAVERSE_COST;
    if (j.ressources.doses < c.doses) return { ok: false, reason: `${c.doses} doses requises` };
    if (j.ressources.armes < c.armes) return { ok: false, reason: `${c.armes} armes requises` };
    return { ok: true };
  }

  static payTraversalCost(gs, pid, sacrificedPionZone, sacrificedPionIdx) {
    const j = gs.joueurs[pid];
    const c = SpecialEntities.TRAVERSE_COST;
    j.ressources.doses -= c.doses;
    j.ressources.armes -= c.armes;
    if (sacrificedPionZone && sacrificedPionIdx != null) {
      const zone = gs.plateau[sacrificedPionZone];
      if (zone?.pions[sacrificedPionIdx]) {
        zone.pions.splice(sacrificedPionIdx, 1);
      }
    }
  }

  static canBuildOnZone(gs, zoneId) {
    if (SpecialEntities.isGitanZone(gs, zoneId)) {
      return { ok: false, reason: 'Construction impossible sur un camp de gitans' };
    }
    return { ok: true };
  }

  static getGitanArmesPrice() {
    return 24;
  }

  // ═══════════════════════════════════════════
  //  INCORRUPTIBLES
  // ═══════════════════════════════════════════

  static MAX_INCORRUPTIBLES = 2;

  static hasIncorruptible(gs, zoneId) {
    const zone = gs.plateau[zoneId];
    return zone?.pions.some(p => p.type === 'incorruptible') || false;
  }

  static isZoneBlockedByIncorruptible(gs, zoneId) {
    const zone = gs.plateau[zoneId];
    if (!zone) return false;
    const hasInc = zone.pions.some(p => p.type === 'incorruptible');
    if (!hasInc) return false;
    const otherArmed = zone.pions.filter(p => p.type !== 'incorruptible' && (p.type === 'dealer' || p.type === 'trafiquant'));
    return otherArmed.length === 0;
  }

  static canMoveIncorruptible(gs, pid) {
    const j = gs.joueurs[pid];
    const hasBordel = Object.values(gs.plateau).some(z => z.construction === 'bordel' && z.proprietaire === pid);
    const cost = hasBordel ? 500 : 1000;
    if (j.ressources.lingots < cost) return { ok: false, reason: `${cost}L requis`, cost };
    return { ok: true, cost };
  }

  static moveIncorruptible(gs, pid, fromZone, toZone) {
    const check = SpecialEntities.canMoveIncorruptible(gs, pid);
    if (!check.ok) return check;

    const from = gs.plateau[fromZone];
    const to = gs.plateau[toZone];
    if (!from || !to) return { ok: false, reason: 'Zone invalide' };

    const idx = from.pions.findIndex(p => p.type === 'incorruptible');
    if (idx === -1) return { ok: false, reason: 'Pas d\'incorruptible sur cette zone' };

    gs.joueurs[pid].ressources.lingots -= check.cost;
    const inc = from.pions.splice(idx, 1)[0];
    to.pions.push(inc);

    const idxDep = gs.incorruptibles.deployes.indexOf(fromZone);
    if (idxDep !== -1) gs.incorruptibles.deployes[idxDep] = toZone;

    return { ok: true, msg: `Incorruptible déplacé vers ${toZone} (−${check.cost}L)` };
  }

  static canEliminateIncorruptible(gs, pid) {
    const j = gs.joueurs[pid];
    if (j.ressources.lingots < 700) return { ok: false, reason: '700L requis' };
    return { ok: true, cost: 700 };
  }

  static eliminateIncorruptible(gs, pid, zoneId) {
    const check = SpecialEntities.canEliminateIncorruptible(gs, pid);
    if (!check.ok) return check;

    const zone = gs.plateau[zoneId];
    if (!zone) return { ok: false, reason: 'Zone invalide' };
    const idx = zone.pions.findIndex(p => p.type === 'incorruptible');
    if (idx === -1) return { ok: false, reason: 'Pas d\'incorruptible ici' };

    gs.joueurs[pid].ressources.lingots -= 700;
    zone.pions.splice(idx, 1);
    gs.incorruptibles.elimines++;

    const depIdx = gs.incorruptibles.deployes.indexOf(zoneId);
    if (depIdx !== -1) gs.incorruptibles.deployes.splice(depIdx, 1);

    return { ok: true, msg: `Incorruptible éliminé sur ${zoneId} (−700L, retiré du jeu)` };
  }

  // ═══════════════════════════════════════════
  //  GANGS
  // ═══════════════════════════════════════════

  static canActivateGang(gs, pid, quartierId, gameplayData) {
    if (gs.tour < 10) return { ok: false, reason: 'Gangs activables après le tour 10' };

    const q = gameplayData.quartiers.find(q => q.id === quartierId);
    if (!q || !q.gang) return { ok: false, reason: 'Pas de gang dans ce quartier' };

    if (gs.gangs_actifs[quartierId]) return { ok: false, reason: 'Gang déjà activé' };

    const ownsQuartier = gs.getQuartierOwner(quartierId, gameplayData) === pid;
    if (!ownsQuartier) return { ok: false, reason: 'Vous ne contrôlez pas ce quartier' };

    return { ok: true, gang: q.gang };
  }

  static activateGang(gs, pid, quartierId, gameplayData) {
    const check = SpecialEntities.canActivateGang(gs, pid, quartierId, gameplayData);
    if (!check.ok) return check;

    gs.gangs_actifs[quartierId] = {
      joueur: pid,
      gang: check.gang,
      tour_activation: gs.tour
    };

    const j = gs.joueurs[pid];
    if (!j.gangs_actives) j.gangs_actives = [];
    j.gangs_actives.push(quartierId);

    return { ok: true, msg: `${check.gang.nom} activé dans ${quartierId}` };
  }

  static applyGangEffect(gs, pid, quartierId, gameplayData, params) {
    const gangInfo = gs.gangs_actifs[quartierId];
    if (!gangInfo || gangInfo.joueur !== pid) return { ok: false, reason: 'Gang non actif ou pas à vous' };

    const gang = gangInfo.gang;

    switch (gang.effet) {
      case 'casino_gratuit': {
        const { zone } = params;
        if (!gs.plateau[zone]) return { ok: false, reason: 'Zone invalide' };
        if (gs.plateau[zone].construction) return { ok: false, reason: 'Déjà une construction' };
        gs.plateau[zone].construction = 'casino';
        gs.plateau[zone].proprietaire = pid;
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `Casino construit gratuitement sur ${zone}` };
      }

      case 'eliminer_3_pions': {
        const { cibles } = params;
        if (!cibles || cibles.length > 3) return { ok: false, reason: 'Max 3 cibles' };
        let count = 0;
        cibles.forEach(({ zone, idx }) => {
          const z = gs.plateau[zone];
          if (z?.pions[idx] && z.pions[idx].joueur !== pid) {
            z.pions.splice(idx, 1);
            count++;
          }
        });
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${count} pion(s) éliminé(s) par les ${gang.nom}` };
      }

      case 'actions_supplementaires': {
        gs.joueurs[pid].actions_bonus = (gs.joueurs[pid].actions_bonus || 0) + 2;
        return { ok: true, msg: `+2 actions/tour grâce aux ${gang.nom}` };
      }

      case 'revente_marchandises': {
        const armes = gs.joueurs[pid].ressources.armes;
        const doses = gs.joueurs[pid].ressources.doses;
        const total = armes * 20 + doses * 10;
        gs.joueurs[pid].ressources.armes = 0;
        gs.joueurs[pid].ressources.doses = 0;
        gs.joueurs[pid].ressources.lingots += total;
        return { ok: true, msg: `${gang.nom} : ${armes}A + ${doses}D vendus pour ${total}L` };
      }

      case 'racket_etablissements': {
        let total = 0;
        gs.joueurs.forEach((j, i) => {
          if (i === pid) return;
          Object.values(gs.plateau).forEach(z => {
            if (z.construction && z.proprietaire === i) {
              const tax = 20;
              const take = Math.min(tax, j.ressources.lingots);
              j.ressources.lingots -= take;
              total += take;
            }
          });
        });
        gs.joueurs[pid].ressources.lingots += total;
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ${total}L rackettés` };
      }

      default:
        return { ok: true, msg: `${gang.nom} activé (effet passif)` };
    }
  }

  static getActiveGangsForPlayer(gs, pid) {
    return Object.entries(gs.gangs_actifs)
      .filter(([_, info]) => info.joueur === pid)
      .map(([qid, info]) => ({ quartierId: qid, ...info }));
  }

  // ═══════════════════════════════════════════
  //  FIN DE MANDAT
  // ═══════════════════════════════════════════

  static processEndOfMandate(gs, gameplayData) {
    const results = [];

    gs.coupures_electricite = gs.coupures_electricite.filter(c => {
      if (c.source === 'carte') {
        const elapsed = gs.tour - c.tour_debut;
        if (elapsed >= (c.duree || 3)) {
          const q = gameplayData.quartiers.find(q => q.id === c.quartier);
          if (q) q.zones.forEach(zid => { if (gs.plateau[zid]) gs.plateau[zid].electricite = true; });
          results.push(`Électricité rétablie dans ${c.quartier}`);
          return false;
        }
      }
      return true;
    });

    gs.joueurs.forEach(j => {
      if (j._verges_actif) delete j._verges_actif;
      if (j._igor_actif) delete j._igor_actif;
    });

    gs.joueurs.forEach(j => {
      j.actions_bonus = 0;
    });

    gs.joueurs.forEach(j => {
      if (j._ineligible) delete j._ineligible;
    });

    return results;
  }
}
