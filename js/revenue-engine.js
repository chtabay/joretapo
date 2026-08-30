/**
 * Stock disponible par point d'approvisionnement et par tour, PARTAGÉ entre tous
 * les joueurs.
 *
 * Ces plafonds étaient l'étranglement central du jeu. Un ordre d'approvisionnement
 * ne vise qu'UN point : un joueur dont les trafiquants réclamaient 21 armes par
 * tour devait donc dépenser trois de ses cinq ordres rien qu'à faire ses courses,
 * et n'étendait plus jamais son territoire. Mesuré sur une partie simulée : au
 * tour 100, un joueur parti de Harlem avait 11 103 lingots et toujours 7 pions.
 * Le budget d'ordres — la vraie monnaie du jeu — était consommé par l'intendance.
 *
 * L'offre mondiale passe de 46 à 140 armes par tour (3 ports, 5 péages), soit de
 * quoi nourrir un joueur avec UN ordre au lieu de trois, tout en gardant une
 * pénurie réelle : à 6 joueurs, la demande dépasse encore l'offre dès que le
 * plateau se remplit, et les points restent disputés.
 *
 * Ce chiffre est trompeur pris seul : depuis que l'approvisionnement demande
 * d'être sur place (voir `estAPortee`), un joueur n'atteint qu'un à trois points
 * sur treize. L'offre qui le concerne, lui, reste rare.
 */
import { RULES } from './rules.js';

const SUPPLY_CAPS = {
  port:      { prost: 0,  armes: 30, doses: 45 },
  aeroport:  { prost: 6,  armes: 0,  doses: 25 },
  peage:     { prost: 2,  armes: 10, doses: 20 }
};

const BUY_PRICE = { doses: 2, armes: 4, armes_gitans: 24, prostituee_base: 40, prostituee_luxe: 80 };
const SELL_PRICE = { dose: 3, arme: 8 };
const CONSTRUCTION_REVENUE = { restaurant: 14, tripot: 14, casino: 60 };

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

  static _adminBonus(gs, pid, gameplay) {
    let bonus = { prost: 0, armes: 0, doses: 0 };
    const admins = ['ambassade', 'douanes', 'immigration'];
    Object.entries(gameplay.zones).forEach(([zid, z]) => {
      if (admins.includes(z.facilite) && gs.plateau[zid]?.proprietaire === pid) {
        bonus.prost += 3; bonus.armes += 10; bonus.doses += 20;
      }
    });
    return bonus;
  }

  /**
   * Un point d'approvisionnement est-il un camp gitan ?
   * Le marche noir des iles reste hors du systeme public : ni proprietaire,
   * ni peage. C'est le recours de celui qui ne domine aucun equipement — a
   * 24 lingots l'arme contre 4, il paie deja son independance.
   */
  static estMarcheNoir(pointZone) {
    return String(pointZone).startsWith('ile_');
  }

  /**
   * A-t-on acces a ce point d'approvisionnement ?
   *
   * Il faut y etre, ou etre a sa porte : un pion dans la zone du point, un pion
   * dans une zone adjacente, ou en etre le proprietaire.
   *
   * Sans cette condition, la liste des points etait la meme pour tout le monde
   * et depuis n'importe ou : un joueur de Brooklyn commandait au port du New
   * Jersey sans jamais y mettre les pieds. La logistique n'avait aucune
   * geographie, et un equipement ne valait donc pas la peine d'etre pris — ni
   * defendu. Le peage seul ne suffisait pas : il rendait l'equipement rentable,
   * pas necessaire.
   *
   * Mesure sur le plateau de New York : treize points existent — trois ports,
   * cinq peages, un aeroport et quatre camps gitans — et un quartier de depart
   * en atteint un a trois. C'est la contrainte qui donne un objectif
   * militaire a un port.
   */
  static estAPortee(gs, pid, pointZone, adjacencies) {
    const zone = gs.plateau[pointZone];
    if (!zone) return false;
    if (zone.proprietaire === pid) return true;

    const occupee = zid => (gs.plateau[zid]?.pions || []).some(p => p.joueur === pid);
    if (occupee(pointZone)) return true;
    return (adjacencies?.[pointZone] || []).some(occupee);
  }

  /** Les points ou ce joueur peut commander, dans l'etat actuel du plateau. */
  static pointsAccessibles(gs, pid, gameplay, adjacencies) {
    return RevenueEngine.getSupplyPoints(gameplay)
      .filter(sp => RevenueEngine.estAPortee(gs, pid, sp.zone, adjacencies));
  }

  /** Qui controle ce point d'approvisionnement, s'il est controle. */
  static proprietaireDuPoint(gs, pointZone) {
    if (RevenueEngine.estMarcheNoir(pointZone)) return null;
    const p = gs.plateau[pointZone]?.proprietaire;
    return (p === null || p === undefined) ? null : p;
  }

  /**
   * Prix unitaire d'une denree a un point donne, pour un joueur donne.
   *
   * Les points d'approvisionnement sont des EQUIPEMENTS PUBLICS : ports, peages,
   * aeroport. Ils ne se construisent pas, ils se dominent. Auparavant n'importe
   * qui commandait a n'importe quel port depuis n'importe ou, sans condition :
   * la logistique n'avait aucune geographie et un port ne valait pas la peine
   * d'etre pris. Desormais celui qui tient l'equipement prend un peage sur ceux
   * qui s'y servent — ce qui en fait une rente, donc un objectif.
   *
   * Le peage n'est pas un verrou : on peut toujours se servir chez un rival,
   * on paie plus cher et on passe apres lui. Le verrou, c'est la geographie
   * (`estAPortee`) : encore faut-il avoir un pion sur place.
   */
  static prixAppro(gs, pid, pointZone, denree, gameplay) {
    let base = BUY_PRICE[denree] || 0;
    if (denree === 'armes' && RevenueEngine.estMarcheNoir(pointZone)) base = BUY_PRICE.armes_gitans;
    if (denree === 'doses') {
      const hasLabo = Object.values(gs.plateau).some(z => z.construction === 'labo' && z.proprietaire === pid);
      if (hasLabo) base = 1;
    }

    const proprietaire = RevenueEngine.proprietaireDuPoint(gs, pointZone);
    const soumisAuPeage = proprietaire !== null && proprietaire !== pid;
    const peage = soumisAuPeage ? Math.max(1, Math.ceil(base * RULES.peageApproPct)) : 0;

    return { base, peage, total: base + peage, proprietaire, soumisAuPeage };
  }

  /**
   * Traite les commandes d'approvisionnement et de recrutement.
   *
   * Deux effets de la domination d'un equipement, dans cet ordre :
   *   1. PRIORITE — le stock d'un point sert d'abord celui qui le controle.
   *      Un port dont le proprietaire vide le stock ne laisse rien aux autres.
   *   2. PEAGE — les autres paient une surtaxe qui va dans sa poche.
   *
   * Hors de ca, l'ordre de service reste tire au hasard a chaque tour : on ne
   * peut pas compter sur le fait d'etre servi.
   */
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
    const rang = Object.fromEntries(pids.map((pid, i) => [pid, i]));

    const bonusDe = {};
    pids.forEach(pid => { bonusDe[pid] = RevenueEngine._adminBonus(gs, pid, gameplay); });

    /* File des commandes : proprietaire du point d'abord, puis l'ordre tire au
       sort. Le tri de JavaScript est stable, l'ordre aleatoire est donc conserve
       a l'interieur de chaque groupe. */
    const commandes = [];
    pids.forEach(pid => {
      (allSupplyOrders[pid] || []).forEach(o => {
        if (o.type === 'approvisionner' || o.type === 'recruter') commandes.push({ pid, o });
      });
    });
    commandes.sort((a, b) => {
      const pa = RevenueEngine.proprietaireDuPoint(gs, a.o.point) === a.pid ? 0 : 1;
      const pb = RevenueEngine.proprietaireDuPoint(gs, b.o.point) === b.pid ? 0 : 1;
      return pa - pb || rang[a.pid] - rang[b.pid];
    });

    const verserPeage = (pid, proprietaire, montant, pointZone) => {
      if (!montant || proprietaire === null) return;
      gs.joueurs[proprietaire].ressources.lingots += montant;
      log.push({
        pid: proprietaire,
        msg: `🛃 ${gs.joueurs[proprietaire].nom} percoit ${montant}L de peage sur ${pointZone} (${gs.joueurs[pid].nom})`,
        type: 'buy'
      });
    };

    commandes.forEach(({ pid, o }) => {
      const joueur = gs.joueurs[pid];
      const bonus = bonusDe[pid];
      const pool = remaining[o.point];
      if (!pool) return;

      /* On ne commande pas a un equipement ou l'on n'a personne. */
      if (!RevenueEngine.estAPortee(gs, pid, o.point, adjacencies)) {
        log.push({ pid, msg: `${joueur.nom}: aucun pion a portee de ${o.point}, commande annulée`, type: 'warn' });
        return;
      }

      if (o.type === 'approvisionner') {
        const capKey = o.denree === 'prostituee_base' || o.denree === 'prostituee_luxe' ? 'prost' : o.denree;
        const cap = (pool[capKey] ?? 0) + bonus[capKey];
        const qty = Math.min(o.quantite, cap);
        if (qty <= 0) { log.push({ pid, msg: `${joueur.nom}: commande refusée (${o.denree} épuisé à ${o.point})`, type: 'warn' }); return; }

        const prix = RevenueEngine.prixAppro(gs, pid, o.point, o.denree, gameplay);
        const maxAfford = Math.floor(joueur.ressources.lingots / prix.total);
        const actual = Math.min(qty, maxAfford);
        if (actual <= 0) { log.push({ pid, msg: `${joueur.nom}: pas assez de lingots pour ${o.denree}`, type: 'warn' }); return; }

        joueur.ressources.lingots -= actual * prix.total;
        if (o.denree === 'doses') joueur.ressources.doses += actual;
        else if (o.denree === 'armes') joueur.ressources.armes += actual;
        pool[capKey] -= actual;

        const mention = prix.soumisAuPeage ? ` dont ${actual * prix.peage}L de péage` : '';
        log.push({ pid, msg: `${joueur.nom} achète ${actual} ${o.denree} à ${o.point} (−${actual * prix.total}L${mention})`, type: 'buy' });
        verserPeage(pid, prix.proprietaire, actual * prix.peage, o.point);

      } else if (o.type === 'recruter') {
        const cap = pool.prost + bonus.prost;
        if (cap <= 0) { log.push({ pid, msg: `${joueur.nom}: pas de prostituée dispo à ${o.point}`, type: 'warn' }); return; }
        const prix = RevenueEngine.prixAppro(gs, pid, o.point, o.pion_type, gameplay);
        if (joueur.ressources.lingots < prix.total) { log.push({ pid, msg: `${joueur.nom}: pas assez de lingots`, type: 'warn' }); return; }
        const zone = gs.plateau[o.zone_dest];
        if (!zone) return;
        const hasProst = zone.pions.some(p => p.type === 'prostituee_base' || p.type === 'prostituee_luxe');
        if (hasProst) { log.push({ pid, msg: `${joueur.nom}: zone ${o.zone_dest} a déjà une prostituée`, type: 'warn' }); return; }

        joueur.ressources.lingots -= prix.total;
        zone.pions.push({ type: o.pion_type, joueur: pid });
        zone.proprietaire = pid;
        pool.prost--;
        const mention = prix.soumisAuPeage ? ` dont ${prix.peage}L de péage` : '';
        log.push({ pid, msg: `${joueur.nom} recrute ${o.pion_type.replace(/_/g, ' ')} → ${o.zone_dest} (−${prix.total}L${mention})`, type: 'buy' });
        verserPeage(pid, prix.proprietaire, prix.peage, o.point);
      }
    });

    /* Les constructions viennent apres : on se ravitaille, puis on batit avec
       ce qui reste. */
    pids.forEach(pid => {
      (allSupplyOrders[pid] || []).forEach(o => {
        if (o.type === 'construire') RevenueEngine._buildConstruction(gs, pid, o, gameplay, log, adjacencies);
      });
    });

    return log;
  }

  static canBuild(gs, pid, batiment, adjacencies) {
    const d = CONSTRUCTION_DEFS[batiment];
    if (!d) return { ok: false, reason: 'Bâtiment inconnu' };

    const joueur = gs.joueurs[pid];
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
        const plZones = Object.entries(gs.plateau)
          .filter(([_, z]) => z.pions.some(p => p.type === 'prostituee_luxe' && p.joueur === pid))
          .map(([zid]) => zid);
        for (let i = 0; i < plZones.length; i++) {
          for (let j = i + 1; j < plZones.length; j++) {
            for (let k = j + 1; k < plZones.length; k++) {
              const a = plZones[i], b = plZones[j], c = plZones[k];
              if (adjacencies[a]?.includes(b) &&
                  adjacencies[b]?.includes(c) &&
                  adjacencies[a]?.includes(c)) {
                return { ok: true, triangle: [a, b, c] };
              }
            }
          }
        }
        return { ok: false, reason: '3 prostituées de luxe sur 3 zones mutuellement adjacentes requises' };
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

  static _buildConstruction(gs, pid, order, gameplay, log, adjacencies) {
    const joueur = gs.joueurs[pid];
    const zone = gs.plateau[order.zone];
    if (!zone || zone.construction) {
      log.push({ pid, msg: `${joueur.nom}: construction impossible sur ${order.zone}`, type: 'warn' });
      return;
    }

    const check = RevenueEngine.canBuild(gs, pid, order.batiment, adjacencies);
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
      zone.bordel_triangle = check.triangle;
    }

    log.push({ pid, msg: `${joueur.nom} construit ${order.batiment} sur ${order.zone} (−${d.total}L)`, type: 'build' });
  }

  static calculateRevenues(gs, gameplay, adjacencies) {
    const log = [];

    Object.entries(gs.plateau).forEach(([zid, zone]) => {
      if (!zone.electricite) return;
      const zd = gameplay.zones[zid];
      if (!zd) return;

      const hasCasino = zone.construction === 'casino';
      const enemyFlic = zone.pions.find(p => p.type === 'flic');
      const flicBlocked = enemyFlic && !hasCasino;

      if (flicBlocked) {
        log.push({ pid: enemyFlic.joueur, msg: `🚔 Flic bloque les revenus sur ${zid}`, type: 'flic' });
      }

      zone.pions.forEach(pion => {
        if (pion.type === 'flic') return;
        const j = gs.joueurs[pion.joueur];

        if (flicBlocked && enemyFlic.joueur !== pion.joueur) {
          return;
        }

        switch (pion.type) {
          case 'prostituee_base': {
            const rev = zd.p;
            j.ressources.lingots += rev;
            if (rev > 0) log.push({ pid: pion.joueur, msg: `Prostituée (${zid}): +${rev}L`, type: 'rev' });
            break;
          }
          case 'prostituee_luxe': {
            const rev = zd.p * 3;
            j.ressources.lingots += rev;
            if (rev > 0) log.push({ pid: pion.joueur, msg: `Prostituée luxe (${zid}): +${rev}L`, type: 'rev' });
            break;
          }
          case 'dealer': {
            const canSell = zd.d;
            const hasDoses = j.ressources.doses;
            const sold = Math.min(canSell, hasDoses);
            if (sold > 0) {
              j.ressources.doses -= sold;
              j.ressources.lingots += sold * SELL_PRICE.dose;
              log.push({ pid: pion.joueur, msg: `Dealer (${zid}): vend ${sold} doses → +${sold * 3}L`, type: 'rev' });
            }
            break;
          }
          case 'trafiquant': {
            const canSell = zd.a;
            const hasArmes = j.ressources.armes;
            const sold = Math.min(canSell, hasArmes);
            if (sold > 0) {
              j.ressources.armes -= sold;
              j.ressources.lingots += sold * SELL_PRICE.arme;
              log.push({ pid: pion.joueur, msg: `Trafiquant (${zid}): vend ${sold} armes → +${sold * 8}L`, type: 'rev' });
            }
            break;
          }
        }
      });

      if (zone.construction && zone.proprietaire !== null) {
        const pid = zone.proprietaire;
        const j = gs.joueurs[pid];

        if (zone.construction === 'bordel') {
          const triangle = zone.bordel_triangle || [];
          let bordelRev = 0;
          triangle.forEach(adjZid => {
            const adjZd = gameplay.zones[adjZid];
            if (!adjZd) return;
            const adjZone = gs.plateau[adjZid];
            if (!adjZone || !adjZone.electricite) return;
            const pl = adjZone.pions.find(p => p.type === 'prostituee_luxe' && p.joueur === pid);
            if (pl) bordelRev += adjZd.p * 3;
          });
          if (bordelRev > 0) {
            j.ressources.lingots += bordelRev;
            log.push({ pid, msg: `Bordel (${zid}): bonus réseau +${bordelRev}L`, type: 'rev' });
          }
        } else {
          const rev = CONSTRUCTION_REVENUE[zone.construction] || 0;
          if (rev > 0) {
            j.ressources.lingots += rev;
            log.push({ pid, msg: `${zone.construction} (${zid}): +${rev}L`, type: 'rev' });
          }
        }
      }
    });

    return log;
  }

  static processMovements(gs, allMoveOrders, gameplay, adjacencies) {
    const log = [];
    const pids = Object.keys(allMoveOrders).map(Number);
    for (let i = pids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pids[i], pids[j]] = [pids[j], pids[i]];
    }

    const destinations = {};

    pids.forEach(pid => {
      const joueur = gs.joueurs[pid];
      (allMoveOrders[pid] || []).forEach(o => {
        if (o.type === 'deplacer') {
          const from = gs.plateau[o.from];
          const adj = adjacencies[o.from] || [];
          if (!adj.includes(o.to)) { log.push({ pid, msg: `${joueur.nom}: ${o.from}→${o.to} non adjacent`, type: 'warn' }); return; }

          const pionIdx = from.pions.findIndex(p => p.type === o.pion_type && p.joueur === pid);
          if (pionIdx === -1) { log.push({ pid, msg: `${joueur.nom}: pas de ${o.pion_type} sur ${o.from}`, type: 'warn' }); return; }

          const destKey = `${o.to}`;
          if (!destinations[destKey]) destinations[destKey] = [];
          destinations[destKey].push({ pid, from: o.from, pionIdx, pion_type: o.pion_type });

        } else if (o.type === 'creer_pion') {
          const costs = COUTS.creer_pion;
          const c = costs[o.pion_type];
          if (!c) return;
          if (joueur.ressources.lingots < c.lingots || joueur.ressources.armes < (c.armes || 0)) {
            log.push({ pid, msg: `${joueur.nom}: pas assez de ressources pour ${o.pion_type}`, type: 'warn' }); return;
          }
          const zone = gs.plateau[o.zone];
          if (!zone) return;
          const hasArmed = zone.pions.some(p => p.type === 'dealer' || p.type === 'trafiquant');
          if (hasArmed) { log.push({ pid, msg: `${joueur.nom}: zone ${o.zone} a déjà un pion armé`, type: 'warn' }); return; }

          joueur.ressources.lingots -= c.lingots;
          joueur.ressources.armes -= c.armes || 0;
          gs.caisses.hotel_police += c.lingots;
          zone.pions.push({ type: o.pion_type, joueur: pid });
          zone.proprietaire = pid;
          log.push({ pid, msg: `${joueur.nom} crée ${o.pion_type} sur ${o.zone} (−${c.lingots}L, −${c.armes || 0}A)`, type: 'create' });
        }
      });
    });

    Object.entries(destinations).forEach(([dest, movers]) => {
      if (movers.length > 1) {
        log.push({ pid: -1, msg: `Conflit sur ${dest} — statu quo (${movers.length} prétendants)`, type: 'conflict' });
        return;
      }

      const m = movers[0];
      const destZone = gs.plateau[dest];
      const isArmed = m.pion_type === 'dealer' || m.pion_type === 'trafiquant';
      const destHasArmed = destZone.pions.some(p => p.type === 'dealer' || p.type === 'trafiquant');

      if (isArmed && destHasArmed) {
        const enemy = destZone.pions.find(p => (p.type === 'dealer' || p.type === 'trafiquant') && p.joueur !== m.pid);
        if (enemy) {
          log.push({ pid: m.pid, msg: `Conflit sur ${dest} — statu quo`, type: 'conflict' });
          return;
        }
      }

      const fromZone = gs.plateau[m.from];
      const [pion] = fromZone.pions.splice(m.pionIdx, 1);
      destZone.pions.push(pion);
      if (destZone.pions.length > 0 && destZone.pions.every(p => p.joueur === m.pid)) {
        destZone.proprietaire = m.pid;
      }
      if (fromZone.pions.length === 0 && !fromZone.construction) {
        fromZone.proprietaire = null;
      }
      log.push({ pid: m.pid, msg: `${gs.joueurs[m.pid].nom}: ${m.pion_type} ${m.from} → ${dest}`, type: 'move' });
    });

    return log;
  }
}

export { BUY_PRICE, SELL_PRICE, CONSTRUCTION_DEFS, SUPPLY_CAPS, CONSTRUCTION_REVENUE };
