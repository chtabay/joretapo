import { SpecialEntities } from './special-entities.js';

/**
 * Pouvoirs du maire (spec 01:207-216).
 *
 * `phase` = phase de jeu pendant laquelle le pouvoir est proposé au maire.
 * Les specs plaçaient `incorruptible` et `exproprier` en phase 5, mais la phase 5
 * est une phase de révélation automatique : aucun panneau d'ordres n'y est affiché
 * (turn-manager: seules les phases 1 et 4 ouvrent le hotseat). Les deux pouvoirs
 * étaient donc inaccessibles. Ils sont ramenés en phase 1, ce qui reste cohérent
 * avec le déroulé du tour : on déploie l'incorruptible / on exproprie AVANT que
 * les déplacements de la phase 4 ne soient joués. Écart journalisé dans
 * docs/journal-decisions.md.
 */
export const MAYOR_POWERS = {
  incorruptible:   { id: 'incorruptible',   label: 'Lancer un incorruptible',              phase: 1, desc: 'Déployez un incorruptible sur la zone de votre choix' },
  exproprier:      { id: 'exproprier',      label: 'Exproprier un joueur de 4 blocs',      phase: 1, desc: 'Retirez la propriété de 4 zones d\'un joueur' },
  taxe:            { id: 'taxe',            label: 'Exiger 10 % de l\'argent de chacun',   phase: 1, desc: 'Prélevez 10 % des lingots de chaque joueur' },
  coupure:         { id: 'coupure',         label: 'Couper l\'électricité d\'un quartier',  phase: 1, desc: 'Un quartier entier perd l\'électricité pour le mandat' },
  repositionner:   { id: 'repositionner',   label: 'Repositionner 3 flics',                phase: 1, desc: 'Déplacez 3 flics vers les zones de votre choix' },
  saisir_argent:   { id: 'saisir_argent',   label: 'Saisir l\'argent d\'un joueur',        phase: 1, desc: 'L\'argent du joueur ciblé va à la caisse de police' },
  saisir_denrees:  { id: 'saisir_denrees',  label: 'Saisir drogue + armes d\'un joueur',   phase: 1, desc: 'Récupérez la drogue et les armes d\'un joueur' },
  deplacer_gitans: { id: 'deplacer_gitans', label: 'Déplacer tous les gitans',             phase: 1, desc: 'Repositionnez tous les gitans sur le plateau' }
};

/** Durée d'un mandat, en tours (spec 01:203 : élections tous les 7 tours). */
export const LONGUEUR_MANDAT = 7;

/** Nombre de blocs retirés d'un coup par le pouvoir d'expropriation (spec 01:211). */
const ZONES_EXPROPRIATION = 4;

const EST_PION_JOUEUR = p => p.type !== 'flic' && p.type !== 'incorruptible' && p.type !== 'gitan';

export class MayorEngine {

  static canUse(gs, pid) {
    if (!gs || !gs.maire) return false;
    return gs.maire.joueur_id === pid && gs.maire.privileges_restants > 0;
  }

  static availablePowers(gs, pid, currentPhase) {
    if (!MayorEngine.canUse(gs, pid)) return [];
    return Object.values(MAYOR_POWERS).filter(p => p.phase === currentPhase);
  }

  static execute(gs, pid, powerId, params, gameplayData) {
    if (!MayorEngine.canUse(gs, pid)) return { ok: false, msg: 'Pas de privilège disponible', reason: 'pas_de_privilege' };
    const power = MAYOR_POWERS[powerId];
    if (!power) return { ok: false, msg: 'Pouvoir inconnu', reason: 'pouvoir_inconnu' };

    const result = MayorEngine['_' + powerId](gs, pid, params || {}, gameplayData);
    if (result.ok) {
      gs.maire.privileges_restants = Math.max(0, gs.maire.privileges_restants - 1);
      const j = gs.joueurs[pid];
      if (j) j.privileges_maire_restants = Math.max(0, (j.privileges_maire_restants || 0) - 1);
    }
    return result;
  }

  /* ═══════════════════════════════════════════════════════════
   *  Helpers publics (lecture seule)
   * ═══════════════════════════════════════════════════════════ */

  /** Plafond de la partie (spec 01:137 : « seulement 2 dans le jeu »). */
  static get MAX_INCORRUPTIBLES() {
    return SpecialEntities.MAX_INCORRUPTIBLES ?? 2;
  }

  /**
   * Incorruptibles encore disponibles. Les deux jetons sont une réserve fermée :
   * ceux posés sur le plateau et ceux éliminés à 700 L (« définitif, retiré du
   * jeu », spec 01:137) sortent tous les deux de la réserve.
   */
  static incorruptiblesDisponibles(gs) {
    const surPlateau = Object.values(gs.plateau)
      .filter(z => z.pions.some(p => p.type === 'incorruptible')).length;
    const elimines = gs.incorruptibles?.elimines || 0;
    return Math.max(0, MayorEngine.MAX_INCORRUPTIBLES - surPlateau - elimines);
  }

  /** Nombre de camps de gitans actuellement en jeu (le pouvoir les déplace tous). */
  static campsGitans(gs, gameplayData) {
    const surPlateau = Object.values(gs.plateau)
      .filter(z => z.pions.some(p => p.type === 'gitan')).length;
    if (surPlateau > 0) return surPlateau;
    const positions = (gs.gitans?.positions || []).length;
    if (positions > 0) return positions;
    return (gameplayData?.iles || []).length;
  }

  /**
   * Nombre de tours restants avant la fin du mandat en cours.
   * Les élections tombent à la fin de chaque tour multiple de 7 : une coupure
   * décidée au tour 3 dure 4 tours, une coupure décidée au tour 7 (juste avant
   * l'élection) court sur tout le mandat suivant.
   */
  static dureeMandatRestante(tour) {
    const reste = LONGUEUR_MANDAT - (tour % LONGUEUR_MANDAT);
    return reste === 0 ? LONGUEUR_MANDAT : reste;
  }

  /* ═══════════════════════════════════════════════════════════
   *  Pouvoirs
   * ═══════════════════════════════════════════════════════════ */

  static _incorruptible(gs, pid, params) {
    const { zone } = params;
    const z = gs.plateau[zone];
    if (!z) return { ok: false, msg: 'Zone invalide', reason: 'zone_invalide' };
    if (z.pions.some(p => p.type === 'incorruptible')) {
      return { ok: false, msg: 'Un incorruptible occupe déjà cette zone', reason: 'deja_incorruptible' };
    }
    if (MayorEngine.incorruptiblesDisponibles(gs) <= 0) {
      return {
        ok: false,
        msg: `Les ${MayorEngine.MAX_INCORRUPTIBLES} incorruptibles du jeu sont déjà engagés ou éliminés`,
        reason: 'plafond_incorruptibles'
      };
    }

    z.pions.push({ type: 'incorruptible', joueur: null });
    if (!gs.incorruptibles) gs.incorruptibles = { deployes: [], elimines: 0 };
    if (!gs.incorruptibles.deployes.includes(zone)) gs.incorruptibles.deployes.push(zone);
    return { ok: true, msg: `Un incorruptible est déployé sur ${zone}` };
  }

  /**
   * Expropriation : le maire retire au joueur ciblé la propriété de 4 blocs.
   * Poser `proprietaire = null` ne suffit pas — ConflictResolver._updateOwnership
   * recalcule la propriété à partir des pions présents à chaque fin de phase 5 et
   * rendrait aussitôt les blocs à la victime. Les pions du joueur exproprié sont
   * donc délogés (retirés du plateau) : c'est ce qui rend l'expropriation réelle.
   * Écart journalisé dans docs/journal-decisions.md.
   */
  static _exproprier(gs, pid, params) {
    const { cible, zones } = params;
    if (!Number.isInteger(cible) || !gs.joueurs[cible]) {
      return { ok: false, msg: 'Joueur ciblé invalide', reason: 'cible_invalide' };
    }
    if (cible === pid) return { ok: false, msg: 'Impossible de s\'exproprier soi-même', reason: 'auto_ciblage' };

    const uniques = [...new Set((zones || []).filter(Boolean))];
    if (uniques.length !== ZONES_EXPROPRIATION) {
      return { ok: false, msg: `Sélectionnez exactement ${ZONES_EXPROPRIATION} zones distinctes`, reason: 'nombre_de_zones' };
    }

    const nom = gs.joueurs[cible].nom;
    const refusees = uniques.filter(zid => !gs.plateau[zid] || gs.plateau[zid].proprietaire !== cible);
    if (refusees.length > 0) {
      return { ok: false, msg: `${nom} ne possède pas ${refusees.join(', ')}`, reason: 'zone_non_possedee' };
    }

    let deloges = 0;
    uniques.forEach(zid => {
      const zone = gs.plateau[zid];
      const restants = zone.pions.filter(p => !(p.joueur === cible && EST_PION_JOUEUR(p)));
      deloges += zone.pions.length - restants.length;
      zone.pions = restants;
      zone.proprietaire = null;
    });

    return {
      ok: true,
      msg: `${nom} exproprié de ${uniques.length} bloc(s)${deloges > 0 ? ` — ${deloges} pion(s) délogé(s)` : ''}`
    };
  }

  static _taxe(gs, pid) {
    let total = 0;
    gs.joueurs.forEach((j, i) => {
      if (i === pid) return;
      const tax = Math.floor(j.ressources.lingots * 0.1);
      j.ressources.lingots -= tax;
      total += tax;
    });
    if (total <= 0) {
      return { ok: false, msg: 'Aucun joueur n\'a de lingots à taxer', reason: 'rien_a_taxer' };
    }
    gs.joueurs[pid].ressources.lingots += total;
    return { ok: true, msg: `Taxe perçue : ${total}L` };
  }

  /**
   * Coupure d'électricité « pendant tout le mandat » (spec 01:214).
   * L'entrée porte une durée explicite : SpecialEntities.processEndOfMandate ne
   * rétablit que les coupures marquées `source: 'carte'`, valeur qui sert de
   * discriminant « coupure temporaire à durée » (le champ `origine` dit d'où elle
   * vient réellement). Sans ça la coupure du maire était définitive.
   */
  static _coupure(gs, pid, params, gameplayData) {
    const { quartierId } = params;
    const q = gameplayData?.quartiers?.find(x => x.id === quartierId);
    if (!q) return { ok: false, msg: 'Quartier invalide', reason: 'quartier_invalide' };
    if (gs.coupures_electricite.some(c => c.quartier === quartierId)) {
      return { ok: false, msg: `${q.nom} est déjà privé d'électricité`, reason: 'deja_coupe' };
    }

    const duree = MayorEngine.dureeMandatRestante(gs.tour);
    (q.zones || []).forEach(zid => {
      if (gs.plateau[zid]) gs.plateau[zid].electricite = false;
    });
    gs.coupures_electricite.push({
      quartier: quartierId,
      tour_debut: gs.tour,
      duree,
      tour_fin: gs.tour + duree,
      par: pid,
      origine: 'maire',
      source: 'carte'
    });
    return { ok: true, msg: `Électricité coupée dans ${q.nom} jusqu'à la fin du mandat (${duree} tour(s))` };
  }

  static _repositionner(gs, pid, params) {
    const { mouvements } = params;
    if (!Array.isArray(mouvements) || mouvements.length === 0) {
      return { ok: false, msg: 'Indiquez au moins un déplacement de flic', reason: 'aucun_mouvement' };
    }
    if (mouvements.length > 3) return { ok: false, msg: 'Maximum 3 flics', reason: 'trop_de_mouvements' };

    const moved = [];
    mouvements.forEach(({ from, to }) => {
      const fromZone = gs.plateau[from];
      const toZone = gs.plateau[to];
      if (!fromZone || !toZone || from === to) return;
      const flicIdx = fromZone.pions.findIndex(p => p.type === 'flic');
      if (flicIdx === -1) return;
      const flic = fromZone.pions.splice(flicIdx, 1)[0];
      toZone.pions.push(flic);
      moved.push(`${from}→${to}`);
    });

    if (moved.length === 0) {
      return { ok: false, msg: 'Aucun flic à repositionner sur les zones indiquées', reason: 'aucun_flic' };
    }
    return { ok: true, msg: `${moved.length} flic(s) repositionné(s) : ${moved.join(', ')}` };
  }

  static _saisir_argent(gs, pid, params) {
    const { cible } = params;
    if (!Number.isInteger(cible) || !gs.joueurs[cible]) {
      return { ok: false, msg: 'Joueur ciblé invalide', reason: 'cible_invalide' };
    }
    if (cible === pid) return { ok: false, msg: 'Impossible de se cibler soi-même', reason: 'auto_ciblage' };

    const amount = gs.joueurs[cible].ressources.lingots;
    if (amount <= 0) {
      return { ok: false, msg: `${gs.joueurs[cible].nom} n'a aucun lingot à saisir`, reason: 'rien_a_saisir' };
    }
    gs.joueurs[cible].ressources.lingots = 0;
    gs.caisses.hotel_police += amount;
    return { ok: true, msg: `${amount}L saisis chez ${gs.joueurs[cible].nom} → caisses de police` };
  }

  static _saisir_denrees(gs, pid, params) {
    const { cible } = params;
    if (!Number.isInteger(cible) || !gs.joueurs[cible]) {
      return { ok: false, msg: 'Joueur ciblé invalide', reason: 'cible_invalide' };
    }
    if (cible === pid) return { ok: false, msg: 'Impossible de se cibler soi-même', reason: 'auto_ciblage' };

    const target = gs.joueurs[cible];
    const doses = target.ressources.doses;
    const armes = target.ressources.armes;
    if (doses <= 0 && armes <= 0) {
      return { ok: false, msg: `${target.nom} n'a ni drogue ni armes à saisir`, reason: 'rien_a_saisir' };
    }
    target.ressources.doses = 0;
    target.ressources.armes = 0;
    gs.joueurs[pid].ressources.doses += doses;
    gs.joueurs[pid].ressources.armes += armes;
    return { ok: true, msg: `Saisi chez ${target.nom} : ${doses}D + ${armes}A` };
  }

  /**
   * Déplacement des camps de gitans.
   * Trois représentations doivent rester synchrones : les pions physiques
   * `{ type: 'gitan' }`, le drapeau `zone.gitans` et `gs.gitans.positions`
   * (référence faisant foi). Avant correction seuls les deux derniers bougeaient :
   * les pions restaient sur les îles. Le nombre de camps est conservé.
   */
  static _deplacer_gitans(gs, pid, params, gameplayData) {
    const zones = [...new Set((params.zones || []).filter(Boolean))];
    const camps = MayorEngine.campsGitans(gs, gameplayData);
    if (camps === 0) return { ok: false, msg: 'Aucun camp de gitans sur le plateau', reason: 'pas_de_gitans' };
    if (zones.length !== camps) {
      return { ok: false, msg: `Sélectionnez exactement ${camps} zones distinctes`, reason: 'nombre_de_zones' };
    }

    const inconnues = zones.filter(zid => !gs.plateau[zid]);
    if (inconnues.length > 0) {
      return { ok: false, msg: `Zone(s) invalide(s) : ${inconnues.join(', ')}`, reason: 'zone_invalide' };
    }
    const baties = zones.filter(zid => gs.plateau[zid].construction);
    if (baties.length > 0) {
      return { ok: false, msg: `Un camp ne s'installe pas sur une parcelle bâtie : ${baties.join(', ')}`, reason: 'zone_batie' };
    }

    Object.values(gs.plateau).forEach(z => {
      z.gitans = false;
      if (z.pions.some(p => p.type === 'gitan')) {
        z.pions = z.pions.filter(p => p.type !== 'gitan');
      }
    });
    zones.forEach(zid => {
      gs.plateau[zid].pions.push({ type: 'gitan', joueur: null });
      gs.plateau[zid].gitans = true;
    });
    if (!gs.gitans) gs.gitans = { positions: [] };
    gs.gitans.positions = [...zones];

    return { ok: true, msg: `Camps de gitans déplacés vers ${zones.join(', ')}` };
  }
}
