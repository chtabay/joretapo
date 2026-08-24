/**
 * JORETAPO — Entités hors joueurs : gitans, incorruptibles, gangs, fin de mandat.
 *
 * Trois familles d'objets qui n'appartiennent à personne mais contraignent tout
 * le monde, plus la remise à zéro de fin de mandat.
 *
 * Conventions du dépôt : classes statiques, verdicts `{ ok, msg, reason }`,
 * journaux `[{ pid, type, msg }]`, messages utilisateur en français.
 * `reason` est un code machine stable quand il sert de contrat (les tests s'en
 * servent) ; `msg` porte alors la phrase affichable.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  GITANS — représentation de l'état
 * ═══════════════════════════════════════════════════════════════════════════
 * Un camp de gitans existe sous TROIS formes qui doivent rester synchrones :
 *   1. `gs.gitans.positions` — liste des zones, référence faisant foi ;
 *   2. `gs.plateau[z].gitans` — drapeau par zone, miroir de (1) ;
 *   3. un pion `{ type: 'gitan', joueur: null }` dans `gs.plateau[z].pions`.
 * `setGitanCamps` est le SEUL écrivain autorisé : il met les trois à jour d'un
 * coup. `getGitanZones` / `isGitanZone` sont les seuls lecteurs (ils tolèrent
 * une désynchronisation héritée d'une vieille sauvegarde en prenant l'union).
 * Le prix des armes chez les gitans se lit par `getGitanArmesPrice(gs, zone)`,
 * jamais en testant `zoneId.startsWith('ile_')` : les camps se déplacent.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *  MARQUEURS D'ÉTAT EN ATTENTE DE LECTEUR  (chantier « effets de gangs »)
 * ═══════════════════════════════════════════════════════════════════════════
 * Huit des quinze gangs et trois cartes magouille n'ont jamais eu d'effet réel :
 * ils écrivaient un marqueur dans l'état que PERSONNE ne lit, puis annonçaient
 * un succès. Ces effets renvoient désormais `{ ok:false, reason:'effet_non_implemente' }`
 * (voir `EFFETS_NON_IMPLEMENTES`) et n'écrivent plus rien, pour ne pas mentir au
 * joueur. Tableau de bord du chantier — chaque marqueur, son écrivain, et le
 * module qui DOIT le lire pour que l'effet existe :
 *
 *   gs._blocages['armes_<quartierId>']      Cartel de Bogota (bergen)
 *       → lecteur attendu : RevenueEngine._buyGoods — refuser `denree:'armes'`
 *         si le point d'approvisionnement appartient au quartier bloqué.
 *   gs._blocages['appro_<quartierId>']      Syndicat des Dockers (north_brooklyn)
 *       → lecteur attendu : RevenueEngine.processSupplyOrders — refuser tout
 *         ordre `approvisionner`/`recruter` visant un point du quartier bloqué.
 *   gs._blocages['ordres_<pid>']            Mafia Créole (meadowlands)
 *       → lecteur attendu : TurnManager.maxOrdersForPhase — plafonner à 0 les
 *         ordres du joueur ciblé tant que `tour < tour_fin`.
 *   gs._blocages.deplacements_manhattan     Lobby des Taxis (staten_island)
 *       → lecteur attendu : ConflictResolver.resolve — annuler les ordres
 *         `deplacer` dont `from` ou `to` est une zone `MN*`.
 *   gs._restrictions_ethniques[]            Bolito / Triades / Ku Klux Klan
 *       → lecteurs attendus : ConflictResolver (interdire l'entrée d'un pion
 *         d'un joueur d'ethnie interdite dans le quartier) ET RevenueEngine
 *         (interdire le recrutement/la construction dans ce quartier).
 *   joueur._immunite_ethnie                 St James Boys (south_bronx)
 *       → lecteur attendu : le même que `_restrictions_ethniques`, en exemption.
 *   joueur._ineligible                      carte « rendre inéligible » (magouille-engine.js)
 *       → lecteur attendu : TurnManager (liste des candidats à l'élection).
 *   joueur._verges_actif / joueur._igor_actif   cartes magouille (magouille-engine.js)
 *       → lecteur attendu : ConflictResolver (résolution des combats).
 *
 * La purge de fin de mandat (`processEndOfMandate`) reste en place pour nettoyer
 * les sauvegardes qui contiennent déjà ces marqueurs.
 */

/** Pions pilotés par un joueur (ni décor, ni police, ni incorruptible). */
const EST_PION_JOUEUR = p =>
  !!p && p.joueur !== null && p.joueur !== undefined &&
  p.type !== 'flic' && p.type !== 'incorruptible' && p.type !== 'gitan';

const EST_ARME = t => t === 'dealer' || t === 'trafiquant';
const EST_PROST = t => t === 'prostituee_base' || t === 'prostituee_luxe';

export class SpecialEntities {

  // ═══════════════════════════════════════════
  //  GITANS
  // ═══════════════════════════════════════════

  /** Union des trois représentations : tolère une sauvegarde désynchronisée. */
  static getGitanZones(gs) {
    const zones = new Set(gs?.gitans?.positions || []);
    Object.entries(gs?.plateau || {}).forEach(([zid, z]) => {
      if (!z) return;
      if (z.gitans === true) zones.add(zid);
      if ((z.pions || []).some(p => p.type === 'gitan')) zones.add(zid);
    });
    return [...zones];
  }

  static isGitanZone(gs, zoneId) {
    if (!zoneId || !gs) return false;
    if ((gs.gitans?.positions || []).includes(zoneId)) return true;
    const z = gs.plateau?.[zoneId];
    if (!z) return false;
    return z.gitans === true || (z.pions || []).some(p => p.type === 'gitan');
  }

  /**
   * Écrivain unique de l'état gitan : positions, drapeaux et pions d'un seul
   * mouvement. Le nombre de camps est celui de la liste fournie.
   * Utilisé par le pouvoir du maire et par la carte magouille « déplacer les gitans ».
   */
  static setGitanCamps(gs, zones) {
    const cibles = [...new Set((zones || []).filter(Boolean))];
    const inconnues = cibles.filter(zid => !gs.plateau?.[zid]);
    if (inconnues.length > 0) {
      return { ok: false, reason: 'zone_invalide', msg: `Zone(s) inconnue(s) : ${inconnues.join(', ')}` };
    }
    Object.values(gs.plateau).forEach(z => {
      z.gitans = false;
      if ((z.pions || []).some(p => p.type === 'gitan')) {
        z.pions = z.pions.filter(p => p.type !== 'gitan');
      }
    });
    cibles.forEach(zid => {
      gs.plateau[zid].gitans = true;
      gs.plateau[zid].pions.push({ type: 'gitan', joueur: null });
    });
    if (!gs.gitans) gs.gitans = { positions: [] };
    gs.gitans.positions = cibles;
    return { ok: true, msg: `Camps de gitans : ${cibles.join(', ') || 'aucun'}` };
  }

  /** Spec 01:141 — 5 doses + 5 armes + 1 pion sacrifié. */
  static TRAVERSE_COST = { doses: 5, armes: 5, sacrifice_pion: true };

  /**
   * Traversée d'un camp de gitans (spec 01:141, spec 06:64-78).
   * Appelable de deux façons :
   *   canTraverseGitans(gs, pid)                       → seulement le coût en ressources
   *   canTraverseGitans(gs, pid, ordre, adjacences)    → règle complète
   * `ordre` = { from, camp, to, pion_idx?, sacrifice: { zone, idx } }
   * En cas de succès le verdict porte les objets résolus, pour que l'exécutant
   * n'ait plus jamais à retrouver un pion par un index qui a pu bouger.
   */
  static canTraverseGitans(gs, pid, ordre = null, adjacences = null) {
    const j = gs.joueurs?.[pid];
    if (!j) return { ok: false, reason: 'joueur_inconnu', msg: 'Joueur inconnu' };

    const c = SpecialEntities.TRAVERSE_COST;
    if (j.ressources.doses < c.doses) return { ok: false, reason: 'doses_insuffisantes', msg: `${c.doses} doses requises` };
    if (j.ressources.armes < c.armes) return { ok: false, reason: 'armes_insuffisantes', msg: `${c.armes} armes requises` };

    if (!ordre) return { ok: true };

    const { from, camp, to } = ordre;

    if (!SpecialEntities.isGitanZone(gs, camp)) {
      return { ok: false, reason: 'pas_un_camp', msg: `${camp} n'est pas un camp de gitans` };
    }
    if (!gs.plateau?.[from]) return { ok: false, reason: 'zone_invalide', msg: `Zone de départ ${from} inconnue` };
    if (!gs.plateau?.[to]) return { ok: false, reason: 'zone_invalide', msg: `Zone d'arrivée ${to} inconnue` };

    const voisins = adjacences?.[camp];
    if (!Array.isArray(voisins)) {
      return { ok: false, reason: 'adjacences_manquantes', msg: 'Adjacences du camp inconnues' };
    }
    if (!voisins.includes(from)) {
      return { ok: false, reason: 'depart_non_adjacent', msg: `${from} n'est pas adjacent au camp ${camp}` };
    }
    if (!voisins.includes(to)) {
      return { ok: false, reason: 'sortie_non_adjacente', msg: `${to} n'est pas adjacent au camp ${camp}` };
    }
    // Spec 06:69 — on ressort de l'AUTRE côté, et jamais sur le camp lui-même.
    if (to === from) return { ok: false, reason: 'sortie_egale_depart', msg: 'La sortie doit différer de la case de départ' };
    if (to === camp) return { ok: false, reason: 'sortie_sur_camp', msg: 'Le pion ne peut pas rester chez les gitans' };
    if (SpecialEntities.isGitanZone(gs, to)) {
      return { ok: false, reason: 'sortie_sur_camp', msg: `${to} est un autre camp de gitans` };
    }
    if (SpecialEntities.isZoneBlockedByIncorruptible(gs, to)) {
      return { ok: false, reason: 'sortie_bloquee', msg: `${to} est bloqué par un incorruptible` };
    }

    // ── Le pion qui traverse ──
    const pionsDepart = gs.plateau[from].pions;
    let pion = null;
    if (ordre.pion_idx != null) {
      const p = pionsDepart[ordre.pion_idx];
      if (EST_PION_JOUEUR(p) && p.joueur === pid) pion = p;
    } else {
      pion = pionsDepart.find(p => EST_PION_JOUEUR(p) && p.joueur === pid) || null;
    }
    if (!pion) return { ok: false, reason: 'pas_de_pion', msg: `Aucun pion à vous sur ${from}` };

    if (EST_ARME(pion.type) && gs.plateau[to].pions.some(p => EST_ARME(p.type))) {
      return { ok: false, reason: 'sortie_occupee', msg: `${to} porte déjà un homme armé` };
    }

    // ── Le pion sacrifié : n'importe lequel sur le plateau, sauf le voyageur ──
    const sac = ordre.sacrifice;
    if (!sac || !sac.zone || sac.idx == null) {
      return { ok: false, reason: 'sacrifice_requis', msg: 'Un pion doit être sacrifié' };
    }
    const pionSacrifie = gs.plateau[sac.zone]?.pions?.[sac.idx];
    if (!EST_PION_JOUEUR(pionSacrifie) || pionSacrifie.joueur !== pid) {
      return { ok: false, reason: 'sacrifice_invalide', msg: 'Le pion sacrifié doit être un de vos pions' };
    }
    if (pionSacrifie === pion) {
      return { ok: false, reason: 'sacrifice_est_voyageur', msg: 'Le pion sacrifié ne peut pas être celui qui traverse' };
    }

    return { ok: true, pion, pionSacrifie, from, camp, to, cout: { ...c } };
  }

  /**
   * Débite le coût de traversée. Le pion sacrifié est retiré par IDENTITÉ après
   * relecture de l'index : un splice ailleurs dans le même tableau ne peut plus
   * faire porter le sacrifice sur un autre pion.
   */
  static payTraversalCost(gs, pid, sacrificedPionZone, sacrificedPionIdx) {
    const j = gs.joueurs[pid];
    const c = SpecialEntities.TRAVERSE_COST;
    j.ressources.doses -= c.doses;
    j.ressources.armes -= c.armes;
    if (sacrificedPionZone && sacrificedPionIdx != null) {
      const zone = gs.plateau[sacrificedPionZone];
      const cible = zone?.pions?.[sacrificedPionIdx];
      if (cible) SpecialEntities._retirerPion(zone, cible);
    }
  }

  /**
   * Exécute une traversée complète : paiement, sacrifice, sortie de l'autre côté.
   * Atomique — rien n'est débité si le verdict est négatif.
   */
  static traverseGitans(gs, pid, ordre, adjacences) {
    const check = SpecialEntities.canTraverseGitans(gs, pid, ordre, adjacences);
    if (!check.ok) return check;

    const { pion, pionSacrifie, from, camp, to } = check;
    const j = gs.joueurs[pid];
    const c = SpecialEntities.TRAVERSE_COST;

    j.ressources.doses -= c.doses;
    j.ressources.armes -= c.armes;

    // Retraits par identité, jamais par index : l'ordre des splices n'importe plus.
    SpecialEntities._retirerPion(gs.plateau[ordre.sacrifice.zone], pionSacrifie);
    SpecialEntities._retirerPion(gs.plateau[from], pion);
    gs.plateau[to].pions.push(pion);

    [from, to, ordre.sacrifice.zone].forEach(zid => SpecialEntities._majProprieteZone(gs, zid));

    return {
      ok: true,
      from, camp, to, pion,
      msg: `${j.nom} traverse ${camp} : ${from} → ${to} (−${c.doses}D, −${c.armes}A, 1 pion sacrifié)`
    };
  }

  /** Retire un pion d'une zone par identité de référence. */
  static _retirerPion(zone, pion) {
    if (!zone || !pion) return false;
    const i = zone.pions.indexOf(pion);
    if (i === -1) return false;
    zone.pions.splice(i, 1);
    return true;
  }

  /**
   * Recalcule le propriétaire d'UNE zone selon la même règle que
   * ConflictResolver._updateOwnership (pion armé unique, sinon occupant unique).
   * Idempotent : le recalcul global de fin de phase donne le même résultat.
   */
  static _majProprieteZone(gs, zid) {
    const zone = gs.plateau?.[zid];
    if (!zone) return;
    const pionsJoueurs = zone.pions.filter(p => p.type !== 'flic' && p.joueur !== null && p.joueur !== undefined);
    const armes = [...new Set(pionsJoueurs.filter(p => EST_ARME(p.type)).map(p => p.joueur))];
    if (armes.length === 1) { zone.proprietaire = armes[0]; return; }
    if (armes.length > 1) return;
    if (zone.construction) return;
    const occupants = [...new Set(pionsJoueurs.map(p => p.joueur))];
    if (occupants.length === 1) { zone.proprietaire = occupants[0]; return; }
    if (occupants.length === 0) { zone.proprietaire = null; return; }
    if (!occupants.includes(zone.proprietaire)) zone.proprietaire = null;
  }

  /**
   * Spec 01:155 — « possible sur toute parcelle libre sauf cimetières et
   * terrains de gitans ». `gameplayData` est optionnel : sans lui, seuls les
   * camps de gitans sont testés (compatibilité des anciens appels).
   */
  static canBuildOnZone(gs, zoneId, gameplayData = null) {
    if (!gs.plateau?.[zoneId]) return { ok: false, reason: 'zone_invalide', msg: 'Zone inconnue' };
    if (SpecialEntities.isGitanZone(gs, zoneId)) {
      return { ok: false, reason: 'camp_gitans', msg: 'Construction impossible sur un camp de gitans' };
    }
    if (gameplayData?.zones?.[zoneId]?.facilite === 'cimetiere') {
      return { ok: false, reason: 'cimetiere', msg: 'Construction impossible sur un cimetière' };
    }
    return { ok: true };
  }

  /** Spec 01:139 — les gitans vendent les armes à 3× le prix normal. */
  static PRIX_ARMES_STANDARD = 4;
  static PRIX_ARMES_GITANS = 24;

  /**
   * Prix unitaire d'une arme sur une zone donnée. Appelé sans argument, renvoie
   * le tarif gitan (compatibilité de l'ancienne signature `getGitanArmesPrice()`).
   */
  static getGitanArmesPrice(gs = null, zoneId = null) {
    if (!gs || !zoneId) return SpecialEntities.PRIX_ARMES_GITANS;
    return SpecialEntities.isGitanZone(gs, zoneId)
      ? SpecialEntities.PRIX_ARMES_GITANS
      : SpecialEntities.PRIX_ARMES_STANDARD;
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
    const otherArmed = zone.pions.filter(p => p.type !== 'incorruptible' && EST_ARME(p.type));
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
    if (fromZone === toZone) return { ok: false, reason: 'Zone de départ et d\'arrivée identiques' };

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

  /**
   * Effets dont AUCUN module ne lit le marqueur d'état (voir l'en-tête du
   * fichier). Tant qu'un lecteur n'existe pas, le gang est refusé au lieu de
   * feindre le succès : le joueur ne gaspille ni son quartier ni son tour.
   * Retirer une entrée d'ici est la dernière étape de l'implémentation.
   */
  static EFFETS_NON_IMPLEMENTES = new Set([
    'bloquer_ventes_armes',
    'bloquer_ordres',
    'bloquer_approvisionnements',
    'bloquer_deplacements_manhattan',
    'restriction_ethnie_caucasien_asiatique',
    'restriction_ethnie_non_asiatique_non_italien',
    'restriction_ethnie_non_caucasien',
    'immunite_restrictions_ethniques'
  ]);

  static isEffetImplemente(effet) {
    return !SpecialEntities.EFFETS_NON_IMPLEMENTES.has(effet);
  }

  static TOUR_ACTIVATION_GANGS = 7;
  static BONUS_ACTIONS_GANG = 2;

  /** Revente en gros (Lobby Juif) : 1,5× le prix de vente normal, une fois par tour. */
  static PRIX_REVENTE = { arme: 12, dose: 6 };

  /** Racket (Camora) : ponction par établissement adverse. */
  static RACKET_PAR_ETABLISSEMENT = 20;

  static canActivateGang(gs, pid, quartierId, gameplayData) {
    if (gs.tour < SpecialEntities.TOUR_ACTIVATION_GANGS) {
      return { ok: false, reason: `Gangs activables à partir du tour ${SpecialEntities.TOUR_ACTIVATION_GANGS}` };
    }

    const q = gameplayData.quartiers.find(q => q.id === quartierId);
    if (!q || !q.gang) return { ok: false, reason: 'Pas de gang dans ce quartier' };

    if (gs.gangs_actifs[quartierId]) return { ok: false, reason: 'Gang déjà activé' };

    const ownsQuartier = gs.getQuartierOwner(quartierId, gameplayData) === pid;
    if (!ownsQuartier) return { ok: false, reason: 'Vous ne contrôlez pas ce quartier' };

    if (!SpecialEntities.isEffetImplemente(q.gang.effet)) {
      return {
        ok: false,
        reason: 'effet_non_implemente',
        msg: `${q.gang.nom} : effet pas encore implémenté, activation sans effet refusée`
      };
    }

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
    if (!j.gangs_actives.includes(quartierId)) j.gangs_actives.push(quartierId);

    return { ok: true, msg: `${check.gang.nom} activé dans ${quartierId}` };
  }

  static applyGangEffect(gs, pid, quartierId, gameplayData, params = {}) {
    const gangInfo = gs.gangs_actifs[quartierId];
    if (!gangInfo || gangInfo.joueur !== pid) return { ok: false, reason: 'Gang non actif ou pas à vous' };

    const gang = gangInfo.gang;

    if (!SpecialEntities.isEffetImplemente(gang.effet)) {
      return {
        ok: false,
        reason: 'effet_non_implemente',
        msg: `${gang.nom} : effet pas encore implémenté (aucun module ne lit son marqueur d'état)`
      };
    }

    switch (gang.effet) {
      case 'casino_gratuit': {
        const { zone } = params;
        const constructible = SpecialEntities.canBuildOnZone(gs, zone, gameplayData);
        if (!constructible.ok) return constructible;
        const z = gs.plateau[zone];
        if (z.construction) return { ok: false, reason: 'Déjà une construction' };
        // Un cadeau ne s'installe pas chez le voisin : il faut tenir la parcelle.
        const tenue = z.proprietaire === pid || z.pions.some(p => p.joueur === pid);
        if (!tenue) return { ok: false, reason: 'Vous ne tenez pas cette parcelle' };
        z.construction = 'casino';
        z.proprietaire = pid;
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `Casino construit gratuitement sur ${zone}` };
      }

      case 'eliminer_3_pions': {
        const { cibles } = params;
        if (!Array.isArray(cibles) || cibles.length === 0) return { ok: false, reason: 'Aucune cible' };
        if (cibles.length > 3) return { ok: false, reason: 'Max 3 cibles' };

        // Les pions sont résolus en RÉFÉRENCES avant toute suppression : sinon
        // le premier splice décale les index suivants et l'effet frappe à côté.
        const aRetirer = [];
        for (const { zone, idx } of cibles) {
          const z = gs.plateau[zone];
          const p = z?.pions?.[idx];
          if (!EST_PION_JOUEUR(p)) {
            return { ok: false, reason: `Cible invalide sur ${zone} (les flics, incorruptibles et gitans ne s'éliminent pas ainsi)` };
          }
          if (p.joueur === pid) return { ok: false, reason: 'On ne cible pas ses propres pions' };
          if (aRetirer.some(e => e.pion === p)) return { ok: false, reason: 'Cible sélectionnée deux fois' };
          aRetirer.push({ zone: z, pion: p });
        }

        aRetirer.forEach(({ zone, pion }) => SpecialEntities._retirerPion(zone, pion));
        [...new Set(cibles.map(c => c.zone))].forEach(zid => SpecialEntities._majProprieteZone(gs, zid));

        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${aRetirer.length} pion(s) éliminé(s) par les ${gang.nom}` };
      }

      case 'actions_supplementaires': {
        // Bonus permanent : accordé une seule fois, et reconstruit à chaque fin
        // de mandat par `recomputeActionsBonus` au lieu d'être effacé.
        if (gangInfo.effet_applique) {
          return { ok: false, reason: `${gang.nom} : bonus d'actions déjà accordé` };
        }
        gangInfo.effet_applique = true;
        gs.joueurs[pid].actions_bonus = (gs.joueurs[pid].actions_bonus || 0) + SpecialEntities.BONUS_ACTIONS_GANG;
        return { ok: true, msg: `+${SpecialEntities.BONUS_ACTIONS_GANG} actions/tour grâce aux ${gang.nom}` };
      }

      case 'revente_marchandises': {
        // Une revente par tour : sinon le gang est une pompe à lingots.
        if (gangInfo.dernier_tour_revente === gs.tour) {
          return { ok: false, reason: `${gang.nom} : une seule revente par tour` };
        }
        const armes = gs.joueurs[pid].ressources.armes;
        const doses = gs.joueurs[pid].ressources.doses;
        if (armes === 0 && doses === 0) return { ok: false, reason: 'Rien à revendre' };
        const p = SpecialEntities.PRIX_REVENTE;
        const total = armes * p.arme + doses * p.dose;
        gs.joueurs[pid].ressources.armes = 0;
        gs.joueurs[pid].ressources.doses = 0;
        gs.joueurs[pid].ressources.lingots += total;
        gangInfo.dernier_tour_revente = gs.tour;
        return { ok: true, msg: `${gang.nom} : ${armes}A + ${doses}D vendus pour ${total}L` };
      }

      case 'racket_etablissements': {
        let total = 0;
        gs.joueurs.forEach((j, i) => {
          if (i === pid) return;
          Object.values(gs.plateau).forEach(z => {
            if (z.construction && z.proprietaire === i) {
              const take = Math.min(SpecialEntities.RACKET_PAR_ETABLISSEMENT, j.ressources.lingots);
              j.ressources.lingots -= take;
              total += take;
            }
          });
        });
        if (total === 0) return { ok: false, reason: 'Aucun établissement adverse à racketter' };
        gs.joueurs[pid].ressources.lingots += total;
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ${total}L rackettés` };
      }

      case 'voler_action_maire': {
        if (gs.maire.joueur_id === null) return { ok: false, reason: 'Aucun maire en exercice' };
        if (gs.maire.joueur_id === pid) return { ok: false, reason: 'Vous êtes le maire' };
        if (gs.maire.privileges_restants <= 0) return { ok: false, reason: 'Le maire n\'a plus de privilèges' };
        const maire = gs.joueurs[gs.maire.joueur_id];
        gs.maire.privileges_restants--;
        maire.privileges_maire_restants = Math.max(0, (maire.privileges_maire_restants || 0) - 1);
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : 1 privilège volé au maire ${maire.nom}` };
      }

      case 'eliminer_prostituees_quartier_voisin': {
        const targetQ = params.quartierId;
        if (!targetQ) return { ok: false, reason: 'Quartier cible requis' };
        if (targetQ === quartierId) return { ok: false, reason: 'Choisissez un quartier VOISIN' };
        const q = gameplayData.quartiers.find(q => q.id === targetQ);
        if (!q) return { ok: false, reason: 'Quartier invalide' };
        // L'adjacence n'est vérifiable que si l'appelant fournit les adjacences.
        if (params.adjacences && !SpecialEntities.sontQuartiersVoisins(gameplayData, params.adjacences, quartierId, targetQ)) {
          return { ok: false, reason: `${q.nom} n'est pas voisin de ${quartierId}` };
        }
        let eliminated = 0;
        q.zones.forEach(zid => {
          const zone = gs.plateau[zid];
          if (!zone) return;
          for (let i = zone.pions.length - 1; i >= 0; i--) {
            const p = zone.pions[i];
            if (EST_PION_JOUEUR(p) && p.joueur !== pid && EST_PROST(p.type)) {
              zone.pions.splice(i, 1);
              eliminated++;
            }
          }
          if (eliminated > 0) SpecialEntities._majProprieteZone(gs, zid);
        });
        if (eliminated === 0) return { ok: false, reason: `Aucune prostituée adverse dans ${q.nom}` };
        if (gang.usage_unique) delete gs.gangs_actifs[quartierId];
        return { ok: true, msg: `${gang.nom} : ${eliminated} prostituée(s) éliminée(s) dans ${targetQ}` };
      }

      default:
        // Aucun des 15 gangs du jeu ne tombe ici : un effet inconnu vient d'une
        // donnée fausse, on ne l'annonce pas comme un succès « passif ».
        return { ok: false, reason: 'effet_inconnu', msg: `Effet « ${gang.effet} » inconnu` };
    }
  }

  /** Deux quartiers sont voisins si deux de leurs zones le sont. */
  static sontQuartiersVoisins(gameplayData, adjacences, qa, qb) {
    const a = gameplayData.quartiers.find(q => q.id === qa);
    const b = gameplayData.quartiers.find(q => q.id === qb);
    if (!a || !b || qa === qb) return false;
    const zonesB = new Set(b.zones);
    return a.zones.some(zid => (adjacences[zid] || []).some(v => zonesB.has(v)));
  }

  static getActiveGangsForPlayer(gs, pid) {
    return Object.entries(gs.gangs_actifs)
      .filter(([_, info]) => info.joueur === pid)
      .map(([qid, info]) => ({ quartierId: qid, ...info }));
  }

  /**
   * Reconstruit `actions_bonus` à partir des seuls bonus PERMANENTS encore en
   * vigueur (gang « Les Nets »). Tout ce qui vient d'une carte magouille, valable
   * pour le mandat, disparaît. Appelé en fin de mandat : avant, la remise à zéro
   * effaçait aussi le bonus permanent, que rien ne réattribuait jamais.
   */
  static recomputeActionsBonus(gs) {
    gs.joueurs.forEach(j => { j.actions_bonus = 0; });
    Object.values(gs.gangs_actifs || {}).forEach(info => {
      if (!info || info.gang?.effet !== 'actions_supplementaires') return;
      if (!info.effet_applique) return;
      const j = gs.joueurs[info.joueur];
      if (j) j.actions_bonus += SpecialEntities.BONUS_ACTIONS_GANG;
    });
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
      if (j._ineligible) delete j._ineligible;
      if (j._immunite_ethnie) delete j._immunite_ethnie;
    });

    SpecialEntities.recomputeActionsBonus(gs);

    // Purge des marqueurs hérités (voir l'en-tête : aucun lecteur à ce jour).
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
