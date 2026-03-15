const SUPPLY_CAPS = {
  port:      { prost: 0,  armes: 10, doses: 20 },
  aeroport:  { prost: 4,  armes: 0,  doses: 10 },
  peage:     { prost: 1,  armes: 4,  doses: 10 }
};

const BUY_PRICE = { doses: 2, armes: 4, armes_gitans: 24, prostituee_base: 40, prostituee_luxe: 80 };
const SELL_PRICE = { dose: 3, arme: 8 };
const CONSTRUCTION_REVENUE = { restaurant: 14, tripot: 14, casino: 60 };

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

  static processSupplyOrders(gs, allSupplyOrders, gameplay) {
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
      const bonus = RevenueEngine._adminBonus(gs, pid, gameplay);

      (allSupplyOrders[pid] || []).forEach(o => {
        if (o.type === 'approvisionner') {
          const pool = remaining[o.point];
          if (!pool) return;
          const isGitan = o.point.startsWith('ile_');
          const capKey = o.denree === 'prostituee_base' || o.denree === 'prostituee_luxe' ? 'prost' : o.denree;
          const cap = (pool[capKey] ?? 0) + bonus[capKey];
          const qty = Math.min(o.quantite, cap);
          if (qty <= 0) { log.push({ pid, msg: `${joueur.nom}: commande refusée (${o.denree} épuisé)`, type: 'warn' }); return; }

          let price = BUY_PRICE[o.denree] || 0;
          if (o.denree === 'armes' && isGitan) price = BUY_PRICE.armes_gitans;
          const hasLabo = Object.values(gs.plateau).some(z => z.construction === 'labo' && z.proprietaire === pid);
          if (o.denree === 'doses' && hasLabo) price = 1;

          const maxAfford = Math.floor(joueur.ressources.lingots / price);
          const actual = Math.min(qty, maxAfford);
          if (actual <= 0) { log.push({ pid, msg: `${joueur.nom}: pas assez de lingots pour ${o.denree}`, type: 'warn' }); return; }

          joueur.ressources.lingots -= actual * price;
          if (o.denree === 'doses') joueur.ressources.doses += actual;
          else if (o.denree === 'armes') joueur.ressources.armes += actual;
          pool[capKey] -= actual;
          log.push({ pid, msg: `${joueur.nom} achète ${actual} ${o.denree} (−${actual * price}L)`, type: 'buy' });

        } else if (o.type === 'recruter') {
          const pool = remaining[o.point];
          if (!pool) return;
          const cap = pool.prost + bonus.prost;
          if (cap <= 0) { log.push({ pid, msg: `${joueur.nom}: pas de prostituée dispo`, type: 'warn' }); return; }
          const price = BUY_PRICE[o.pion_type] || 40;
          if (joueur.ressources.lingots < price) { log.push({ pid, msg: `${joueur.nom}: pas assez de lingots`, type: 'warn' }); return; }
          const zone = gs.plateau[o.zone_dest];
          if (!zone) return;
          const hasProst = zone.pions.some(p => p.type === 'prostituee_base' || p.type === 'prostituee_luxe');
          if (hasProst) { log.push({ pid, msg: `${joueur.nom}: zone ${o.zone_dest} a déjà une prostituée`, type: 'warn' }); return; }
          joueur.ressources.lingots -= price;
          zone.pions.push({ type: o.pion_type, joueur: pid });
          zone.proprietaire = pid;
          pool.prost--;
          log.push({ pid, msg: `${joueur.nom} recrute ${o.pion_type.replace(/_/g, ' ')} → ${o.zone_dest} (−${price}L)`, type: 'buy' });

        } else if (o.type === 'construire') {
          RevenueEngine._buildConstruction(gs, pid, o, gameplay, log);
        }
      });
    });
    return log;
  }

  static _buildConstruction(gs, pid, order, gameplay, log) {
    const joueur = gs.joueurs[pid];
    const zone = gs.plateau[order.zone];
    if (!zone || zone.construction) { log.push({ pid, msg: `${joueur.nom}: construction impossible sur ${order.zone}`, type: 'warn' }); return; }

    const defs = { restaurant: { z: 40, p: 40 }, tripot: { z: 100, p: 40 }, labo: { z: 100, p: 40 }, bordel: { z: 400, p: 40 }, casino: { z: 400, p: 60 } };
    const d = defs[order.batiment];
    if (!d) return;
    const total = d.z + d.p;
    if (joueur.ressources.lingots < total) { log.push({ pid, msg: `${joueur.nom}: pas assez de lingots pour ${order.batiment}`, type: 'warn' }); return; }

    joueur.ressources.lingots -= total;
    gs.caisses.zurich_bank += d.z;
    gs.caisses.hotel_police += d.p;
    zone.construction = order.batiment;
    zone.proprietaire = pid;
    log.push({ pid, msg: `${joueur.nom} construit ${order.batiment} sur ${order.zone} (−${total}L)`, type: 'build' });
  }

  static calculateRevenues(gs, gameplay) {
    const log = [];
    const dealerSales = {};
    const trafSales = {};

    gs.joueurs.forEach((_, i) => { dealerSales[i] = 0; trafSales[i] = 0; });

    Object.entries(gs.plateau).forEach(([zid, zone]) => {
      if (!zone.electricite) return;
      const zd = gameplay.zones[zid];
      if (!zd) return;

      zone.pions.forEach(pion => {
        const j = gs.joueurs[pion.joueur];
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
        const rev = CONSTRUCTION_REVENUE[zone.construction] || 0;
        if (rev > 0) {
          gs.joueurs[zone.proprietaire].ressources.lingots += rev;
          log.push({ pid: zone.proprietaire, msg: `${zone.construction} (${zid}): +${rev}L`, type: 'rev' });
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
          const costs = { dealer: { lingots: 40, armes: 2 }, trafiquant: { lingots: 80, armes: 3 } };
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

export { BUY_PRICE, SELL_PRICE };
