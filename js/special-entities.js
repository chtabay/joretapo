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
    if (gs.tour < 7) return { ok: false, reason: 'Gangs activables après le tour 7' };

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

      case 'bloquer_ventes_armes': {
        const targetQ = params.quartierId || quartierId;
        if (!gs._blocages) gs._blocages = {};
        gs._blocages[`armes_${targetQ}`] = {
          type: 'armes', quartier: targetQ, joueur: pid,
          tour_fin: gs.tour + (gang.duree > 0 ? gang.duree : 5)
        };
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ventes d'armes bloquées dans ${targetQ} pour ${gang.duree} tours` };
      }

      case 'bloquer_ordres': {
        const cible = params.cible;
        if (cible == null || cible === pid) return { ok: false, reason: 'Cible invalide' };
        if (!gs._blocages) gs._blocages = {};
        gs._blocages[`ordres_${cible}`] = {
          type: 'ordres', cible, joueur: pid,
          tour_fin: gs.tour + (gang.duree > 0 ? gang.duree : 3)
        };
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ordres de ${gs.joueurs[cible].nom} bloqués pendant ${gang.duree} tours` };
      }

      case 'restriction_ethnie_caucasien_asiatique':
      case 'restriction_ethnie_non_asiatique_non_italien':
      case 'restriction_ethnie_non_caucasien': {
        if (!gs._restrictions_ethniques) gs._restrictions_ethniques = [];
        gs._restrictions_ethniques.push({
          quartier: quartierId, effet: gang.effet, joueur: pid,
          tour_fin: gs.tour + (gang.duree > 0 ? gang.duree : 5)
        });
        const labels = {
          restriction_ethnie_caucasien_asiatique: 'caucasiens et asiatiques interdits',
          restriction_ethnie_non_asiatique_non_italien: 'non-asiatiques et non-italiens interdits',
          restriction_ethnie_non_caucasien: 'non-caucasiens interdits'
        };
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ${labels[gang.effet]} dans ${quartierId}` };
      }

      case 'immunite_restrictions_ethniques': {
        gs.joueurs[pid]._immunite_ethnie = true;
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ${gs.joueurs[pid].nom} est immunisé contre les restrictions ethniques` };
      }

      case 'voler_action_maire': {
        if (gs.maire.joueur_id === null) return { ok: false, reason: 'Aucun maire en exercice' };
        if (gs.maire.joueur_id === pid) return { ok: false, reason: 'Vous êtes le maire' };
        if (gs.maire.privileges_restants <= 0) return { ok: false, reason: 'Le maire n\'a plus de privilèges' };
        gs.maire.privileges_restants--;
        gs.joueurs[gs.maire.joueur_id].privileges_maire_restants--;
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : 1 privilège volé au maire ${gs.joueurs[gs.maire.joueur_id].nom}` };
      }

      case 'eliminer_prostituees_quartier_voisin': {
        const targetQ = params.quartierId;
        if (!targetQ) return { ok: false, reason: 'Quartier cible requis' };
        const q = gameplayData.quartiers.find(q => q.id === targetQ);
        if (!q) return { ok: false, reason: 'Quartier invalide' };
        let eliminated = 0;
        q.zones.forEach(zid => {
          const zone = gs.plateau[zid];
          if (!zone) return;
          for (let i = zone.pions.length - 1; i >= 0; i--) {
            if (zone.pions[i].joueur !== pid && (zone.pions[i].type === 'prostituee_base' || zone.pions[i].type === 'prostituee_luxe')) {
              zone.pions.splice(i, 1);
              eliminated++;
            }
          }
        });
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ${eliminated} prostituée(s) éliminée(s) dans ${targetQ}` };
      }

      case 'bloquer_approvisionnements': {
        const targetQ = params.quartierId;
        if (!targetQ) return { ok: false, reason: 'Quartier cible requis' };
        if (!gs._blocages) gs._blocages = {};
        gs._blocages[`appro_${targetQ}`] = {
          type: 'approvisionnement', quartier: targetQ, joueur: pid,
          tour_fin: gs.tour + (gang.duree > 0 ? gang.duree : 5)
        };
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : approvisionnements bloqués dans ${targetQ} pendant ${gang.duree} tours` };
      }

      case 'bloquer_deplacements_manhattan': {
        if (!gs._blocages) gs._blocages = {};
        const manhattanZones = Object.keys(gameplayData.zones).filter(z => z.startsWith('MN'));
        gs._blocages.deplacements_manhattan = {
          type: 'deplacements', zones: manhattanZones, joueur: pid,
          tour_fin: gs.tour + (gang.duree > 0 ? gang.duree : 3)
        };
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : déplacements bloqués dans Manhattan pendant ${gang.duree} tours` };
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
      if (j._immunite_ethnie) delete j._immunite_ethnie;
    });

    if (gs._blocages) {
      Object.keys(gs._blocages).forEach(key => {
        const b = gs._blocages[key];
        if (b && b.tour_fin <= gs.tour) delete gs._blocages[key];
      });
    }
    if (gs._restrictions_ethniques) {
      gs._restrictions_ethniques = gs._restrictions_ethniques.filter(r => r.tour_fin > gs.tour);
    }

    return results;
  }
}
