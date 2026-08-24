/**
 * JORETAPO — Moteur des cambriolages.
 *
 * Règles de référence : specs/01-mecaniques-de-jeu.md, section « Cambriolages »
 * (tableau des 4 cibles + « Coupure d'électricité = coût du cambriolage divisé
 * par 2 »).
 *
 * Écarts assumés et journalisés dans docs/journal-decisions.md (2026-08-23) :
 *   - la réduction « coupure d'électricité » s'applique aussi au casino
 *     (3 → 2 cartes) et elle est prise en compte par `canHeist`, pas seulement
 *     au moment du prélèvement ;
 *   - l'Hôtel de Police coûte réellement 2 hommes de main : si le bloc n'en
 *     porte qu'un, le second est pris ailleurs sur le plateau ;
 *   - les cartes magouille sacrifiées partent à la défausse au lieu de
 *     disparaître du circuit du deck.
 *
 * Conventions du projet : classes statiques, retours { ok, msg, reason }.
 */

export const HEIST_TYPES = {
  zurich_bank: {
    label: 'Zurich Bank',
    icon: '🏦',
    butin: 'Tous les fonds de la banque',
    color: '#f1c40f',
    desc: 'Placez un pion armé sur chacune des 4 annexes. Les 4 hommes meurent après le casse.'
  },
  hotel_police: {
    label: 'Hôtel de Police',
    icon: '🚔',
    butin: 'Moitié des fonds de la police',
    color: '#3498db',
    desc: 'Pion armé sur place, bordel requis, plus de flics que tout adversaire (min 2). Vous perdez 2 hommes.'
  },
  casino: {
    label: 'Casino adverse',
    icon: '🎰',
    butin: 'Tout l\'argent du propriétaire',
    color: '#9b59b6',
    desc: '11 hommes, 1 prostituée de luxe, posséder un casino et l\'aéroport, sacrifier 3 cartes magouille (2 si l\'électricité est coupée).'
  },
  labo: {
    label: 'Labo de raffinage',
    icon: '🧪',
    butin: 'Toute la drogue du propriétaire',
    color: '#2ecc71',
    desc: 'Pion armé sur le labo, 20 armes + 2 cartes magouille. Coupure d\'électricité = coûts ÷2 (10 armes + 1 carte).'
  }
};

const EST_ARME = t => t === 'dealer' || t === 'trafiquant';

export class HeistEngine {

  /* ═══════════════════════════════════════════
   *  COÛTS (specs/01 : coupure d'électricité = coût ÷ 2)
   * ═══════════════════════════════════════════ */

  /** Coût du casse de labo, réduit de moitié si l'électricité de la cible est coupée. */
  static coutLabo(coupure) {
    return coupure ? { armes: 10, cartes: 1 } : { armes: 20, cartes: 2 };
  }

  /** Coût du casse de casino, réduit de moitié (arrondi au supérieur) si coupure. */
  static coutCasino(coupure) {
    return coupure ? { cartes: 2 } : { cartes: 3 };
  }

  /* ═══════════════════════════════════════════
   *  UTILITAIRES DE LECTURE DU PLATEAU
   * ═══════════════════════════════════════════ */

  static _getAnnexeZones(gameplayData) {
    return Object.entries(gameplayData.zones)
      .filter(([_, z]) => z.facilite === 'annexe_zurich_bank')
      .map(([zid]) => zid);
  }

  static _getZoneByFacilite(gameplayData, facilite) {
    const entry = Object.entries(gameplayData.zones).find(([_, z]) => z.facilite === facilite);
    return entry ? entry[0] : null;
  }

  /**
   * Une zone est privée d'électricité si son quartier porte une coupure
   * enregistrée OU si le drapeau de la case est baissé. Les deux sont tenus en
   * phase par les moteurs, tester les deux ne coûte rien et évite un faux
   * négatif si l'un des deux venait à diverger.
   */
  static _hasElectricityCut(gs, zoneId, gameplayData) {
    if (!zoneId) return false;
    if (gs.plateau?.[zoneId]?.electricite === false) return true;
    const q = (gameplayData?.quartiers || []).find(q => q.zones.includes(zoneId));
    if (!q) return false;
    return (gs.coupures_electricite || []).some(c => c.quartier === q.id);
  }

  /** Identifiants des joueurs AUTRES que `pid` (jamais l'index d'un tableau filtré). */
  static _autresJoueurs(gs, pid) {
    return (gs.joueurs || [])
      .map((j, i) => (j && j.id != null ? j.id : i))
      .filter(id => id !== pid);
  }

  /**
   * Nombre de flics du meilleur adversaire de `pid`.
   * Le cambrioleur n'est JAMAIS compté dans son propre maximum adverse.
   */
  static _maxFlicsAdverses(gs, pid) {
    const comptes = this._autresJoueurs(gs, pid).map(id => this._countPlayerFlics(gs, id));
    return comptes.length ? Math.max(0, ...comptes) : 0;
  }

  static _countPlayerArmedPions(gs, pid) {
    let count = 0;
    Object.values(gs.plateau).forEach(z => {
      z.pions.forEach(p => {
        if (p.joueur === pid && EST_ARME(p.type)) count++;
      });
    });
    return count;
  }

  static _countPlayerFlics(gs, pid) {
    let count = 0;
    Object.values(gs.plateau).forEach(z => {
      z.pions.forEach(p => {
        if (p.joueur === pid && p.type === 'flic') count++;
      });
    });
    return count;
  }

  /* ═══════════════════════════════════════════
   *  COÛTS PRÉLEVÉS
   * ═══════════════════════════════════════════ */

  /**
   * Retire jusqu'à `nb` hommes de main de `pid` en parcourant `zoneIds`.
   * @returns {number} nombre réellement retiré
   */
  static _retirerHommes(gs, pid, nb, zoneIds) {
    let retires = 0;
    for (const zid of zoneIds) {
      if (retires >= nb) break;
      const zone = gs.plateau[zid];
      if (!zone) continue;
      for (let i = zone.pions.length - 1; i >= 0 && retires < nb; i--) {
        const p = zone.pions[i];
        if (p.joueur === pid && EST_ARME(p.type)) {
          zone.pions.splice(i, 1);
          retires++;
        }
      }
    }
    return retires;
  }

  /**
   * Sacrifie `nb` cartes magouille de la main de `joueur` et les REND À LA
   * DÉFAUSSE : le circuit du deck reste fermé (voir MagouilleEngine.initDeck,
   * qui recycle `defaussees` mais ignore les uid évaporés).
   *
   * @param {string[]|null} uidsChoisis cartes désignées par le joueur (optionnel) ;
   *        les manquantes sont complétées par le début de la main.
   * @returns {string[]} uid effectivement défaussés
   */
  static _defausserCartes(gs, joueur, nb, uidsChoisis = null) {
    if (!Array.isArray(joueur.cartes_magouille)) joueur.cartes_magouille = [];
    const main = joueur.cartes_magouille;
    const rendues = [];

    if (Array.isArray(uidsChoisis)) {
      uidsChoisis.forEach(uid => {
        if (rendues.length >= nb) return;
        const i = main.indexOf(uid);
        if (i >= 0) rendues.push(main.splice(i, 1)[0]);
      });
    }
    while (rendues.length < nb && main.length > 0) rendues.push(main.shift());

    if (!gs.deck_magouille) gs.deck_magouille = { pile: [], defaussees: [], retirees_du_jeu: [] };
    if (!Array.isArray(gs.deck_magouille.defaussees)) gs.deck_magouille.defaussees = [];
    rendues.forEach(uid => gs.deck_magouille.defaussees.push(uid));

    return rendues;
  }

  /* ═══════════════════════════════════════════
   *  PROGRESSION (affichage)
   * ═══════════════════════════════════════════ */

  /**
   * @param {object} [params] { targetZone } — permet d'afficher le coût réel
   *        de la cible visée. Sans cible, on affiche le coût le PLUS FAVORABLE
   *        parmi les cibles possibles (sinon l'écran annonce un prix que le
   *        joueur ne paiera pas).
   */
  static getProgress(gs, pid, heistType, gameplayData, params = {}) {
    const j = gs.joueurs[pid];
    const reqs = [];

    switch (heistType) {
      case 'zurich_bank': {
        const annexes = this._getAnnexeZones(gameplayData);
        const ownedAnnexes = annexes.filter(zid => {
          const z = gs.plateau[zid];
          return z && z.pions.some(p => p.joueur === pid && EST_ARME(p.type));
        });
        reqs.push({ label: 'Pions sur les annexes', current: ownedAnnexes.length, needed: 4, zones: annexes, ownedZones: ownedAnnexes });
        return { reqs, sacrifice: '4 hommes de main', loot: `${gs.caisses.zurich_bank} lingots`, lootValue: gs.caisses.zurich_bank, zones: annexes, ownedZones: ownedAnnexes };
      }
      case 'hotel_police': {
        const hpZone = this._getZoneByFacilite(gameplayData, 'hotel_police');
        const hasPion = hpZone && gs.plateau[hpZone]?.pions.some(p => p.joueur === pid && EST_ARME(p.type));
        const hasBordel = Object.values(gs.plateau).some(z => z.construction === 'bordel' && z.proprietaire === pid);
        const myFlics = this._countPlayerFlics(gs, pid);
        const othersMaxFlics = this._maxFlicsAdverses(gs, pid);
        reqs.push({ label: 'Pion armé sur place', current: hasPion ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Bordel possédé', current: hasBordel ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Plus de flics que adversaires (min 2)', current: myFlics, needed: Math.max(2, othersMaxFlics + 1) });
        const butin = Math.floor(gs.caisses.hotel_police / 2);
        return { reqs, sacrifice: '2 hommes de main', loot: `${butin} lingots`, lootValue: butin, zones: hpZone ? [hpZone] : [] };
      }
      case 'casino': {
        const armedCount = this._countPlayerArmedPions(gs, pid);
        const hasLuxe = Object.values(gs.plateau).some(z => z.pions.some(p => p.joueur === pid && p.type === 'prostituee_luxe'));
        const aeroZone = this._getZoneByFacilite(gameplayData, 'aeroport');
        const ownsAero = aeroZone && gs.plateau[aeroZone]?.pions.some(p => p.joueur === pid);
        const ownsCasino = Object.values(gs.plateau).some(z => z.construction === 'casino' && z.proprietaire === pid);
        const casinoZones = Object.entries(gs.plateau).filter(([_, z]) => z.construction === 'casino' && z.proprietaire !== pid);
        const targets = casinoZones.map(([zid]) => zid);
        const coupure = this._coupureLaPlusFavorable(gs, targets, gameplayData, params.targetZone);
        const cout = this.coutCasino(coupure);
        reqs.push({ label: 'Hommes de main', current: armedCount, needed: 11 });
        reqs.push({ label: 'Prostituée de luxe', current: hasLuxe ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Aéroport contrôlé', current: ownsAero ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Casino possédé', current: ownsCasino ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Cartes magouille', current: (j.cartes_magouille || []).length, needed: cout.cartes });
        reqs.push({ label: 'Casino adverse existant', current: targets.length > 0 ? 1 : 0, needed: 1 });
        const sacrifice = `${cout.cartes} carte${cout.cartes > 1 ? 's' : ''} magouille${coupure ? ' (coupure ✓)' : ''}`;
        return { reqs, sacrifice, loot: 'Tout l\'argent du propriétaire', lootValue: -1, zones: targets, targetZones: targets, coupure, cout };
      }
      case 'labo': {
        const laboZones = Object.entries(gs.plateau).filter(([_, z]) => z.construction === 'labo' && z.proprietaire !== pid);
        const targets = laboZones.map(([zid]) => zid);
        const coupure = this._coupureLaPlusFavorable(gs, targets, gameplayData, params.targetZone);
        const cout = this.coutLabo(coupure);
        reqs.push({ label: 'Armes', current: j.ressources.armes, needed: cout.armes });
        reqs.push({ label: 'Cartes magouille', current: (j.cartes_magouille || []).length, needed: cout.cartes });
        reqs.push({ label: 'Labo adverse existant', current: targets.length > 0 ? 1 : 0, needed: 1 });
        const sacrifice = `${cout.armes} armes + ${cout.cartes} carte${cout.cartes > 1 ? 's' : ''}${coupure ? ' (coupure ✓)' : ''}`;
        return { reqs, sacrifice, loot: 'Toute la drogue du propriétaire', lootValue: -1, zones: targets, targetZones: targets, coupure, cout };
      }
    }
    return { reqs, sacrifice: '', loot: '', lootValue: 0, zones: [] };
  }

  /**
   * Cible désignée -> sa coupure ; sinon, vrai dès qu'UNE cible possible est
   * privée d'électricité (le joueur pourra choisir celle-là).
   */
  static _coupureLaPlusFavorable(gs, cibles, gameplayData, targetZone) {
    if (targetZone && cibles.includes(targetZone)) {
      return this._hasElectricityCut(gs, targetZone, gameplayData);
    }
    return cibles.some(zid => this._hasElectricityCut(gs, zid, gameplayData));
  }

  /* ═══════════════════════════════════════════
   *  VALIDATION
   * ═══════════════════════════════════════════ */

  /**
   * @param {object} [params] { targetZone } — optionnel : sans cible, les
   *        prérequis sont évalués au tarif de la cible la moins chère, comme
   *        l'écran de progression. `executeHeist` re-valide avec la cible réelle.
   */
  static canHeist(gs, pid, heistType, gameplayData, params = {}) {
    const j = gs.joueurs[pid];
    if (!j) return { ok: false, reason: 'Joueur invalide' };

    switch (heistType) {
      case 'zurich_bank': {
        const annexes = this._getAnnexeZones(gameplayData);
        const ownedAnnexes = annexes.filter(zid => {
          const z = gs.plateau[zid];
          return z && z.pions.some(p => p.joueur === pid && EST_ARME(p.type));
        });
        if (ownedAnnexes.length < 4) {
          return { ok: false, reason: `Pion armé requis sur 4 annexes (${ownedAnnexes.length}/${Math.min(4, annexes.length)} couvertes)`, details: { annexes, ownedAnnexes } };
        }
        return { ok: true, cost: {}, sacrifice: 4, annexes: ownedAnnexes.slice(0, 4) };
      }

      case 'hotel_police': {
        const hpZone = this._getZoneByFacilite(gameplayData, 'hotel_police');
        if (!hpZone) return { ok: false, reason: 'Zone introuvable' };
        const hasPion = gs.plateau[hpZone]?.pions.some(p => p.joueur === pid && EST_ARME(p.type));
        if (!hasPion) return { ok: false, reason: `Pion armé requis sur ${hpZone}` };
        const hasBordel = Object.values(gs.plateau).some(z => z.construction === 'bordel' && z.proprietaire === pid);
        if (!hasBordel) return { ok: false, reason: 'Bordel requis' };
        const myFlics = this._countPlayerFlics(gs, pid);
        if (myFlics < 2) return { ok: false, reason: `Min. 2 flics (vous en avez ${myFlics})` };
        const othersMaxFlics = this._maxFlicsAdverses(gs, pid);
        if (myFlics <= othersMaxFlics) return { ok: false, reason: `Plus de flics que tout adversaire requis (max adverse : ${othersMaxFlics})` };
        return { ok: true, cost: {}, sacrifice: 2, othersMaxFlics };
      }

      case 'casino': {
        const casinoZones = Object.entries(gs.plateau).filter(([_, z]) => z.construction === 'casino' && z.proprietaire !== pid).map(([zid]) => zid);
        if (casinoZones.length === 0) return { ok: false, reason: 'Aucun casino adverse à cambrioler' };
        const armedCount = this._countPlayerArmedPions(gs, pid);
        if (armedCount < 11) return { ok: false, reason: `11 hommes de main requis (${armedCount})` };
        const hasLuxe = Object.values(gs.plateau).some(z => z.pions.some(p => p.joueur === pid && p.type === 'prostituee_luxe'));
        if (!hasLuxe) return { ok: false, reason: '1 prostituée de luxe requise' };
        const aeroZone = this._getZoneByFacilite(gameplayData, 'aeroport');
        const ownsAero = aeroZone && gs.plateau[aeroZone]?.pions.some(p => p.joueur === pid);
        if (!ownsAero) return { ok: false, reason: 'Aéroport requis' };
        const ownsCasino = Object.values(gs.plateau).some(z => z.construction === 'casino' && z.proprietaire === pid);
        if (!ownsCasino) return { ok: false, reason: 'Posséder un casino soi-même requis' };
        const coupure = this._coupureLaPlusFavorable(gs, casinoZones, gameplayData, params.targetZone);
        const cout = this.coutCasino(coupure);
        const enMain = (j.cartes_magouille || []).length;
        if (enMain < cout.cartes) return { ok: false, reason: `${cout.cartes} cartes magouille requises (${enMain})` };
        return { ok: true, cost: { cartes: cout.cartes }, casinoZones, coupure };
      }

      case 'labo': {
        const laboZones = Object.entries(gs.plateau).filter(([_, z]) => z.construction === 'labo' && z.proprietaire !== pid).map(([zid]) => zid);
        if (laboZones.length === 0) return { ok: false, reason: 'Aucun labo adverse à cambrioler' };
        const coupure = this._coupureLaPlusFavorable(gs, laboZones, gameplayData, params.targetZone);
        const cout = this.coutLabo(coupure);
        if (j.ressources.armes < cout.armes) return { ok: false, reason: `${cout.armes} armes requises (${j.ressources.armes})` };
        const enMain = (j.cartes_magouille || []).length;
        if (enMain < cout.cartes) return { ok: false, reason: `${cout.cartes} cartes magouille requises (${enMain})` };
        return { ok: true, cost: { armes: cout.armes, cartes: cout.cartes }, laboZones, coupure };
      }

      default:
        return { ok: false, reason: 'Type de cambriolage invalide' };
    }
  }

  /* ═══════════════════════════════════════════
   *  EXÉCUTION
   * ═══════════════════════════════════════════ */

  /**
   * @param {object} params { targetZone, cartes? } — `cartes` (uid) permet au
   *        joueur de désigner les cartes sacrifiées ; sinon on prend le début
   *        de la main. Dans tous les cas elles repartent à la défausse.
   */
  static executeHeist(gs, pid, heistType, params = {}, gameplayData) {
    const check = this.canHeist(gs, pid, heistType, gameplayData, params);
    if (!check.ok) return check;

    const j = gs.joueurs[pid];

    switch (heistType) {
      case 'zurich_bank': {
        const annexes = check.annexes;
        let sacrificed = 0;
        annexes.forEach(zid => {
          const zone = gs.plateau[zid];
          const idx = zone.pions.findIndex(p => p.joueur === pid && EST_ARME(p.type));
          if (idx >= 0) { zone.pions.splice(idx, 1); sacrificed++; }
        });

        const butin = gs.caisses.zurich_bank;
        gs.caisses.zurich_bank = 0;
        j.ressources.lingots += butin;

        return { ok: true, msg: `🏦 Zurich Bank cambriolée ! ${butin}L récupérés, ${sacrificed} hommes perdus` };
      }

      case 'hotel_police': {
        const hpZone = this._getZoneByFacilite(gameplayData, 'hotel_police');
        // Le casse coûte 2 hommes (specs/01) : le bloc d'abord, le reste ailleurs.
        let sacrificed = this._retirerHommes(gs, pid, 2, [hpZone]);
        if (sacrificed < 2) {
          const ailleurs = Object.keys(gs.plateau).filter(z => z !== hpZone);
          sacrificed += this._retirerHommes(gs, pid, 2 - sacrificed, ailleurs);
        }

        const butin = Math.floor(gs.caisses.hotel_police / 2);
        gs.caisses.hotel_police -= butin;
        j.ressources.lingots += butin;

        return { ok: true, msg: `🚔 Hôtel de Police cambriolé ! ${butin}L récupérés, ${sacrificed} hommes perdus` };
      }

      case 'casino': {
        const targetZone = params.targetZone;
        if (!targetZone) return { ok: false, reason: 'Zone cible requise' };
        const zone = gs.plateau[targetZone];
        if (!zone || zone.construction !== 'casino') return { ok: false, reason: 'Pas de casino sur cette zone' };
        const ownerId = zone.proprietaire;
        if (ownerId === pid) return { ok: false, reason: 'Vous ne pouvez pas cambrioler votre propre casino' };
        const victim = gs.joueurs[ownerId];
        if (!victim) return { ok: false, reason: 'Casino sans propriétaire' };

        const nbCartes = check.cost.cartes;
        const defaussees = this._defausserCartes(gs, j, nbCartes, params.cartes);

        const butin = victim.ressources.lingots;
        victim.ressources.lingots = 0;
        j.ressources.lingots += butin;

        const mention = check.coupure ? ' (électricité coupée)' : '';
        return { ok: true, msg: `🎰 Casino de ${victim.nom} cambriolé ! ${butin}L volés, ${defaussees.length} cartes défaussées${mention}` };
      }

      case 'labo': {
        const targetZone = params.targetZone;
        if (!targetZone) return { ok: false, reason: 'Zone cible requise' };
        const zone = gs.plateau[targetZone];
        if (!zone || zone.construction !== 'labo') return { ok: false, reason: 'Pas de labo sur cette zone' };
        const ownerId = zone.proprietaire;
        if (ownerId === pid) return { ok: false, reason: 'Vous ne pouvez pas cambrioler votre propre labo' };
        const victim = gs.joueurs[ownerId];
        if (!victim) return { ok: false, reason: 'Labo sans propriétaire' };

        const costArmes = check.cost.armes;
        const costCartes = check.cost.cartes;
        j.ressources.armes -= costArmes;
        const defaussees = this._defausserCartes(gs, j, costCartes, params.cartes);

        const butin = victim.ressources.doses;
        victim.ressources.doses = 0;
        j.ressources.doses += butin;

        const mention = check.coupure ? ' (électricité coupée)' : '';
        return { ok: true, msg: `🧪 Labo de ${victim.nom} cambriolé ! ${butin} doses volées (−${costArmes}A, −${defaussees.length} cartes)${mention}` };
      }

      default:
        return { ok: false, reason: 'Type invalide' };
    }
  }
}
