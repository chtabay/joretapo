/**
 * JORETAPO — Moteur économique.
 *
 * Trois responsabilités, dans l'ordre du tour :
 *   1. `processSupplyOrders` — phase 1/2 : achats de denrées, recrutements,
 *      constructions. Le stock de chaque point est commun à tous les joueurs et
 *      remis à zéro à chaque tour ; la dotation des administrations est
 *      PERSONNELLE et s'ajoute par-dessus sans entamer le stock commun.
 *   2. `calculateRevenues` — phase 2 : revenus des pions et des bâtiments.
 *   3. `canBuild` / `_buildConstruction` — prérequis et pose des bâtiments.
 *
 * La logique de déplacement et de conflit vit dans js/conflict-resolver.js.
 *
 * Toutes les fonctions renvoient soit un journal `[{pid, type, msg}]`, soit un
 * verdict `{ok, reason}` — jamais d'exception.
 */

const SUPPLY_CAPS = {
  port:      { prost: 0,  armes: 10, doses: 20 },
  aeroport:  { prost: 4,  armes: 0,  doses: 10 },
  peage:     { prost: 1,  armes: 4,  doses: 10 }
};

const BUY_PRICE = { doses: 2, armes: 4, armes_gitans: 24, prostituee_base: 40, prostituee_luxe: 80 };
const SELL_PRICE = { dose: 4, arme: 8 };
const CONSTRUCTION_REVENUE = { restaurant: 14, tripot: 24, labo: 0, casino: 60 };

/** Valeur d'une passe (spec 01:86-87) : l'indice P du bloc = nombre de passes/tour. */
const PASSE = { base: 1, luxe: 3 };

/** Dotation personnelle apportée par CHAQUE administration possédée (spec 01:98-101). */
const ADMIN_BONUS = { prost: 3, armes: 10, doses: 20 };
const ADMINISTRATIONS = ['ambassade', 'douanes', 'immigration'];

const DENREES_ACHETABLES = ['doses', 'armes'];
const PIONS_RECRUTABLES = ['prostituee_base', 'prostituee_luxe'];
const EST_ARME = t => t === 'dealer' || t === 'trafiquant';
const EST_PROST = t => t === 'prostituee_base' || t === 'prostituee_luxe';

const CONSTRUCTION_DEFS = {
  restaurant: { z: 40,  p: 40, total: 80 },
  tripot:     { z: 100, p: 40, total: 140 },
  labo:       { z: 100, p: 40, total: 140 },
  bordel:     { z: 400, p: 40, total: 440 },
  casino:     { z: 400, p: 60, total: 460 }
};

export class RevenueEngine {

  static getSupplyPoints(gameplay) {
    const points = [];
    Object.entries(gameplay.zones).forEach(([zid, zone]) => {
      if (SUPPLY_CAPS[zone.facilite]) {
        points.push({ zone: zid, nom: zone.nom, type: zone.facilite, caps: { ...SUPPLY_CAPS[zone.facilite] } });
      }
    });
    (gameplay.iles || []).forEach(ile => {
      points.push({ zone: ile.id, nom: ile.nom, type: 'camp_gitans', caps: { prost: 0, armes: Infinity, doses: 0 } });
    });
    return points;
  }

  /* ═══════════════════════════════════════════════════════════
   *  Helpers de territoire
   * ═══════════════════════════════════════════════════════════ */

  /** Camp de gitans (île ou case envahie) — spec 01:155 : pas de construction. */
  static _estCampGitans(gs, zid, gameplay) {
    if (gs.plateau[zid]?.gitans === true) return true;
    if ((gs.gitans?.positions || []).includes(zid)) return true;
    return (gameplay?.iles || []).some(i => i.id === zid);
  }

  /**
   * Motif d'interdiction de bâtir sur une case, ou `null` si elle est libre.
   * Spec 01:155 — « construction possible sur toute parcelle libre sauf
   * cimetières et terrains de gitans ».
   */
  static _interditDeBatir(gs, zid, gameplay) {
    if (!gs.plateau[zid]) return 'zone inconnue';
    if (RevenueEngine._estCampGitans(gs, zid, gameplay)) return 'un camp de gitans';
    if (gameplay?.zones?.[zid]?.facilite === 'cimetiere') return 'un cimetière';
    return null;
  }

  /** Le joueur tient la case s'il en est propriétaire ou s'il y a un pion. */
  static _controle(zone, pid) {
    return zone.proprietaire === pid || zone.pions.some(p => p.joueur === pid);
  }

  /** Un homme armé adverse verrouille la case. */
  static _tenueParAdversaire(zone, pid) {
    return zone.pions.some(p => EST_ARME(p.type) && p.joueur !== null && p.joueur !== pid);
  }

  /**
   * Revenus coupés sur la case ? Un flic adverse « bloque une case (plus de
   * revenus) » (spec 01:136) ; seul le casino y est insensible (spec 01:153).
   * Le flic ne bloque jamais son propre propriétaire (flic corrompu).
   */
  static _bloqueParFlic(zone, pid) {
    if (!zone || zone.construction === 'casino') return false;
    const flic = zone.pions.find(p => p.type === 'flic');
    return !!flic && flic.joueur !== pid;
  }

  /* ═══════════════════════════════════════════════════════════
   *  Phase 1/2 — approvisionnement, recrutement, construction
   * ═══════════════════════════════════════════════════════════ */

  /**
   * Dotation personnelle du tour, apportée par les administrations possédées.
   * Elle N'EST PAS prélevée sur le stock commun (sinon un joueur bien doté
   * assèche le port pour tous les autres) et vaut pour l'ensemble du tour,
   * pas par point d'approvisionnement.
   */
  static _adminBonus(gs, pid, gameplay) {
    const bonus = { prost: 0, armes: 0, doses: 0 };
    Object.entries(gameplay.zones).forEach(([zid, z]) => {
      if (ADMINISTRATIONS.includes(z.facilite) && gs.plateau[zid]?.proprietaire === pid) {
        bonus.prost += ADMIN_BONUS.prost;
        bonus.armes += ADMIN_BONUS.armes;
        bonus.doses += ADMIN_BONUS.doses;
      }
    });
    return bonus;
  }

  static _aUnLabo(gs, pid) {
    return Object.values(gs.plateau).some(z => z.construction === 'labo' && z.proprietaire === pid);
  }

  /** Prix unitaire effectif d'une denrée pour ce joueur, à ce point. */
  static _prixAchat(gs, pid, denree, pointId) {
    if (denree === 'armes') {
      return pointId && String(pointId).startsWith('ile_') ? BUY_PRICE.armes_gitans : BUY_PRICE.armes;
    }
    if (denree === 'doses') {
      // Labo de raffinage : « divise prix drogue ×2 » (spec 01:150).
      return RevenueEngine._aUnLabo(gs, pid) ? Math.ceil(BUY_PRICE.doses / 2) : BUY_PRICE.doses;
    }
    return BUY_PRICE[denree] || 0;
  }

  static processSupplyOrders(gs, allSupplyOrders, gameplay, adjacencies) {
    const log = [];
    const remaining = {};
    RevenueEngine.getSupplyPoints(gameplay).forEach(sp => {
      remaining[sp.zone] = { ...sp.caps };
    });

    const pids = Object.keys(allSupplyOrders).map(Number);
    for (let i = pids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pids[i], pids[j]] = [pids[j], pids[i]];
    }

    pids.forEach(pid => {
      const joueur = gs.joueurs[pid];
      if (!joueur) return;
      // Dotation consommable sur tout le tour, tous points confondus.
      const dotation = RevenueEngine._adminBonus(gs, pid, gameplay);

      (allSupplyOrders[pid] || []).forEach(o => {
        if (!o || typeof o !== 'object') return;
        if (o.type === 'approvisionner')      RevenueEngine._buyGoods(gs, pid, o, remaining, dotation, log);
        else if (o.type === 'recruter')       RevenueEngine._recruitProst(gs, pid, o, remaining, dotation, gameplay, log);
        else if (o.type === 'construire')     RevenueEngine._buildConstruction(gs, pid, o, gameplay, log, adjacencies);
      });
    });
    return log;
  }

  /** Achat de doses / armes à un point d'approvisionnement. */
  static _buyGoods(gs, pid, o, remaining, dotation, log) {
    const joueur = gs.joueurs[pid];
    const pool = remaining[o.point];
    if (!pool) return;

    if (!DENREES_ACHETABLES.includes(o.denree)) {
      log.push({ pid, msg: `${joueur.nom}: denrée « ${o.denree} » non commandable`, type: 'warn' });
      return;
    }
    const demande = Math.floor(Number(o.quantite));
    if (!Number.isFinite(demande) || demande <= 0) {
      log.push({ pid, msg: `${joueur.nom}: quantité invalide pour ${o.denree}`, type: 'warn' });
      return;
    }

    const dispoPoint = Math.max(0, pool[o.denree] ?? 0);
    const dispoDotation = Math.max(0, dotation[o.denree] ?? 0);
    const cap = dispoPoint + dispoDotation;
    if (cap <= 0) {
      log.push({ pid, msg: `${joueur.nom}: commande refusée (${o.denree} épuisé)`, type: 'warn' });
      return;
    }

    const price = RevenueEngine._prixAchat(gs, pid, o.denree, o.point);
    if (!(price > 0)) {
      log.push({ pid, msg: `${joueur.nom}: prix inconnu pour ${o.denree}`, type: 'warn' });
      return;
    }

    const qty = Math.min(demande, cap);
    const actual = Math.min(qty, Math.floor(joueur.ressources.lingots / price));
    if (actual <= 0) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de lingots pour ${o.denree}`, type: 'warn' });
      return;
    }

    joueur.ressources.lingots -= actual * price;
    joueur.ressources[o.denree] += actual;

    // On puise d'abord dans le stock commun, le reste sur la dotation perso :
    // le stock commun ne peut donc jamais devenir négatif.
    const surPoint = Math.min(actual, dispoPoint);
    pool[o.denree] = dispoPoint - surPoint;
    dotation[o.denree] = dispoDotation - (actual - surPoint);

    const ecart = actual < demande ? ` (sur ${demande} demandées)` : '';
    log.push({ pid, msg: `${joueur.nom} achète ${actual} ${o.denree}${ecart} (−${actual * price}L)`, type: 'buy' });
  }

  /** Recrutement d'une prostituée et placement immédiat sur une case tenue. */
  static _recruitProst(gs, pid, o, remaining, dotation, gameplay, log) {
    const joueur = gs.joueurs[pid];
    const pool = remaining[o.point];
    if (!pool) return;

    if (!PIONS_RECRUTABLES.includes(o.pion_type)) {
      log.push({ pid, msg: `${joueur.nom}: pion « ${o.pion_type} » non recrutable ici`, type: 'warn' });
      return;
    }

    const dispoPoint = Math.max(0, pool.prost ?? 0);
    const dispoDotation = Math.max(0, dotation.prost ?? 0);
    if (dispoPoint + dispoDotation <= 0) {
      log.push({ pid, msg: `${joueur.nom}: pas de prostituée dispo`, type: 'warn' });
      return;
    }

    const price = BUY_PRICE[o.pion_type];
    if (joueur.ressources.lingots < price) {
      log.push({ pid, msg: `${joueur.nom}: pas assez de lingots`, type: 'warn' });
      return;
    }

    const zone = gs.plateau[o.zone_dest];
    if (!zone) return;
    if (RevenueEngine._estCampGitans(gs, o.zone_dest, gameplay)) {
      log.push({ pid, msg: `${joueur.nom}: placement impossible sur un camp de gitans`, type: 'warn' });
      return;
    }
    if (!RevenueEngine._controle(zone, pid) || RevenueEngine._tenueParAdversaire(zone, pid)) {
      log.push({ pid, msg: `${joueur.nom}: zone ${o.zone_dest} non contrôlée`, type: 'warn' });
      return;
    }
    // Spec 06:17 — une seule prostituée par case.
    if (zone.pions.some(p => EST_PROST(p.type))) {
      log.push({ pid, msg: `${joueur.nom}: zone ${o.zone_dest} a déjà une prostituée`, type: 'warn' });
      return;
    }

    joueur.ressources.lingots -= price;
    zone.pions.push({ type: o.pion_type, joueur: pid });
    zone.proprietaire = pid;

    const surPoint = Math.min(1, dispoPoint);
    pool.prost = dispoPoint - surPoint;
    dotation.prost = dispoDotation - (1 - surPoint);

    log.push({ pid, msg: `${joueur.nom} recrute ${o.pion_type.replace(/_/g, ' ')} → ${o.zone_dest} (−${price}L)`, type: 'buy' });
  }

  /* ═══════════════════════════════════════════════════════════
   *  Constructions
   * ═══════════════════════════════════════════════════════════ */

  /**
   * Prérequis d'un bâtiment (lingots + conditions de la spec 01:147-153).
   *
   * @param {string} [zoneCible] case visée. Pour le bordel, le triangle retourné
   *        DOIT contenir cette case (le bordel se pose à l'intersection des 3
   *        cases, spec 06:52). Omis : n'importe quel triangle valide convient —
   *        c'est le mode « puis-je bâtir ? » utilisé par l'interface.
   * @returns {{ok:boolean, reason?:string, triangle?:string[]}}
   */
  static canBuild(gs, pid, batiment, adjacencies, zoneCible = null) {
    const d = CONSTRUCTION_DEFS[batiment];
    if (!d) return { ok: false, reason: 'Bâtiment inconnu' };

    const joueur = gs.joueurs[pid];
    if (!joueur) return { ok: false, reason: 'Joueur inconnu' };
    if (joueur.ressources.lingots < d.total) {
      return { ok: false, reason: `Pas assez de lingots (${d.total}L nécessaires)` };
    }

    switch (batiment) {
      case 'restaurant':
      case 'tripot':
        return { ok: true };

      case 'labo': {
        const dealers = Object.values(gs.plateau)
          .flatMap(z => z.pions)
          .filter(p => p.joueur === pid && p.type === 'dealer').length;
        return dealers >= 6
          ? { ok: true }
          : { ok: false, reason: `Min. 6 dealers requis (${dealers} actuellement)` };
      }

      case 'bordel': {
        const triangles = RevenueEngine.findBordelTriangles(gs, pid, adjacencies, zoneCible);
        if (triangles.length > 0) return { ok: true, triangle: triangles[0] };
        const dejaUnTriangle = zoneCible
          ? RevenueEngine.findBordelTriangles(gs, pid, adjacencies).length > 0
          : false;
        return {
          ok: false,
          reason: dejaUnTriangle
            ? 'Le bordel doit être bâti sur l\'une des 3 cases du triangle de prostituées de luxe'
            : '3 prostituées de luxe sur 3 zones mutuellement adjacentes requises'
        };
      }

      case 'casino': {
        const hasBordel = Object.values(gs.plateau).some(z =>
          z.construction === 'bordel' && z.proprietaire === pid
        );
        return hasBordel
          ? { ok: true }
          : { ok: false, reason: 'Posséder un bordel requis' };
      }

      default:
        return { ok: false, reason: 'Bâtiment inconnu' };
    }
  }

  /**
   * Tous les triplets de cases mutuellement adjacentes portant chacune une
   * prostituée de luxe du joueur. Si `zoneCible` est fourni, seuls les triangles
   * qui la contiennent sont retournés.
   */
  static findBordelTriangles(gs, pid, adjacencies, zoneCible = null) {
    const adj = adjacencies || {};
    const plZones = Object.entries(gs.plateau)
      .filter(([, z]) => z.pions.some(p => p.type === 'prostituee_luxe' && p.joueur === pid))
      .map(([zid]) => zid);

    const trouves = [];
    for (let i = 0; i < plZones.length; i++) {
      for (let j = i + 1; j < plZones.length; j++) {
        for (let k = j + 1; k < plZones.length; k++) {
          const a = plZones[i], b = plZones[j], c = plZones[k];
          if (zoneCible && a !== zoneCible && b !== zoneCible && c !== zoneCible) continue;
          if (adj[a]?.includes(b) && adj[b]?.includes(c) && adj[a]?.includes(c)) {
            trouves.push([a, b, c]);
          }
        }
      }
    }
    return trouves;
  }

  static _buildConstruction(gs, pid, order, gameplay, log, adjacencies) {
    const joueur = gs.joueurs[pid];
    const zone = gs.plateau[order.zone];
    if (!zone || zone.construction) {
      log.push({ pid, msg: `${joueur.nom}: construction impossible sur ${order.zone}`, type: 'warn' });
      return;
    }

    const interdit = RevenueEngine._interditDeBatir(gs, order.zone, gameplay);
    if (interdit) {
      log.push({ pid, msg: `${joueur.nom}: on ne bâtit pas sur ${interdit} (${order.zone})`, type: 'warn' });
      return;
    }

    if (!RevenueEngine._controle(zone, pid) || RevenueEngine._tenueParAdversaire(zone, pid)) {
      log.push({ pid, msg: `${joueur.nom}: ${order.zone} n'est pas sous votre contrôle`, type: 'warn' });
      return;
    }

    const cible = order.batiment === 'bordel' ? order.zone : null;
    const check = RevenueEngine.canBuild(gs, pid, order.batiment, adjacencies, cible);
    if (!check.ok) {
      log.push({ pid, msg: `${joueur.nom}: ${check.reason}`, type: 'warn' });
      return;
    }

    const d = CONSTRUCTION_DEFS[order.batiment];
    joueur.ressources.lingots -= d.total;
    gs.caisses.zurich_bank += d.z;
    gs.caisses.hotel_police += d.p;
    zone.construction = order.batiment;
    zone.proprietaire = pid;

    if (order.batiment === 'bordel' && check.triangle) {
      zone.bordel_triangle = [...check.triangle];
      // Spec 06:53 — le joueur prend possession des 3 cases du triangle.
      check.triangle.forEach(zid => {
        const z = gs.plateau[zid];
        if (z) z.proprietaire = pid;
      });
    }

    log.push({ pid, msg: `${joueur.nom} construit ${order.batiment} sur ${order.zone} (−${d.total}L)`, type: 'build' });
  }

  /* ═══════════════════════════════════════════════════════════
   *  Phase 2 — revenus
   * ═══════════════════════════════════════════════════════════ */

  /**
   * Cases dont les passes de luxe sont encaissées par un bordel.
   * @returns {Map<string, number>} zone → pid du propriétaire du bordel
   */
  static _casesDeBordel(gs) {
    const cases = new Map();
    Object.values(gs.plateau).forEach(z => {
      if (z.construction !== 'bordel' || z.proprietaire === null) return;
      (z.bordel_triangle || []).forEach(zid => cases.set(zid, z.proprietaire));
    });
    return cases;
  }

  static calculateRevenues(gs, gameplay, adjacencies) {
    const log = [];
    const casesDeBordel = RevenueEngine._casesDeBordel(gs);

    Object.entries(gs.plateau).forEach(([zid, zone]) => {
      if (!zone.electricite) return;
      const zd = gameplay.zones[zid];
      if (!zd) return;

      const enemyFlic = zone.pions.find(p => p.type === 'flic');
      if (enemyFlic && zone.construction !== 'casino') {
        log.push({ pid: enemyFlic.joueur, msg: `🚔 Flic bloque les revenus sur ${zid}`, type: 'flic' });
      }

      zone.pions.forEach(pion => {
        if (pion.type === 'flic' || pion.joueur === null || pion.joueur === undefined) return;
        const j = gs.joueurs[pion.joueur];
        if (!j) return;
        if (RevenueEngine._bloqueParFlic(zone, pion.joueur)) return;

        switch (pion.type) {
          case 'prostituee_base': {
            const rev = zd.p * PASSE.base;
            j.ressources.lingots += rev;
            if (rev > 0) log.push({ pid: pion.joueur, msg: `Prostituée (${zid}): +${rev}L`, type: 'rev' });
            break;
          }
          case 'prostituee_luxe': {
            // Elle travaille au bordel du joueur : ses passes sont encaissées
            // par le bâtiment, pas dans la rue (pas de double comptage).
            if (casesDeBordel.get(zid) === pion.joueur) break;
            const rev = zd.p * PASSE.luxe;
            j.ressources.lingots += rev;
            if (rev > 0) log.push({ pid: pion.joueur, msg: `Prostituée luxe (${zid}): +${rev}L`, type: 'rev' });
            break;
          }
          case 'dealer': {
            const sold = Math.min(zd.d, j.ressources.doses);
            if (sold > 0) {
              j.ressources.doses -= sold;
              j.ressources.lingots += sold * SELL_PRICE.dose;
              log.push({ pid: pion.joueur, msg: `Dealer (${zid}): vend ${sold} doses → +${sold * SELL_PRICE.dose}L`, type: 'rev' });
            }
            break;
          }
          case 'trafiquant': {
            const sold = Math.min(zd.a, j.ressources.armes);
            if (sold > 0) {
              j.ressources.armes -= sold;
              j.ressources.lingots += sold * SELL_PRICE.arme;
              log.push({ pid: pion.joueur, msg: `Trafiquant (${zid}): vend ${sold} armes → +${sold * SELL_PRICE.arme}L`, type: 'rev' });
            }
            break;
          }
        }
      });

      if (!zone.construction || zone.proprietaire === null) return;
      const pid = zone.proprietaire;
      const j = gs.joueurs[pid];
      if (!j) return;
      if (RevenueEngine._bloqueParFlic(zone, pid)) return;

      if (zone.construction === 'bordel') {
        // Spec 06:54 — le bordel encaisse, pour chacune des 3 cases du triangle,
        // ce qu'y rapporterait une prostituée de luxe. Il paie tant qu'il tient
        // les cases, que les filles y soient restées ou qu'elles aient été
        // redéployées ailleurs.
        let bordelRev = 0;
        (zone.bordel_triangle || []).forEach(adjZid => {
          const adjZd = gameplay.zones[adjZid];
          const adjZone = gs.plateau[adjZid];
          if (!adjZd || !adjZone || !adjZone.electricite) return;
          if (RevenueEngine._bloqueParFlic(adjZone, pid)) return;
          bordelRev += adjZd.p * PASSE.luxe;
        });
        if (bordelRev > 0) {
          j.ressources.lingots += bordelRev;
          log.push({ pid, msg: `Bordel (${zid}): +${bordelRev}L`, type: 'rev' });
        }
      } else {
        const rev = CONSTRUCTION_REVENUE[zone.construction] || 0;
        if (rev > 0) {
          j.ressources.lingots += rev;
          log.push({ pid, msg: `${zone.construction} (${zid}): +${rev}L`, type: 'rev' });
        }
      }
    });

    return log;
  }
}

export { BUY_PRICE, SELL_PRICE, CONSTRUCTION_DEFS, CONSTRUCTION_REVENUE, SUPPLY_CAPS };
