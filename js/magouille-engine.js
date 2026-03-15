export class MagouilleEngine {

  static buildDeck(cartesDef) {
    const deck = [];
    cartesDef.types.forEach(type => {
      for (let i = 0; i < type.quantite; i++) {
        deck.push({ ...type, uid: `${type.id}_${i}` });
      }
    });
    return MagouilleEngine.shuffle(deck);
  }

  static shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  static initDeck(gs, cartesDef) {
    const deck = MagouilleEngine.buildDeck(cartesDef);
    gs.deck_magouille.pile = deck.map(c => c.uid);
    gs.deck_magouille.defaussees = [];
    gs.deck_magouille.retirees_du_jeu = [];
    gs._cartes_index = {};
    deck.forEach(c => { gs._cartes_index[c.uid] = c; });
  }

  static drawCards(gs, pid, count, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (gs.deck_magouille.pile.length === 0) {
        gs.deck_magouille.pile = MagouilleEngine.shuffle([...gs.deck_magouille.defaussees]);
        gs.deck_magouille.defaussees = [];
      }
      if (gs.deck_magouille.pile.length === 0) break;
      drawn.push(gs.deck_magouille.pile.pop());
    }
    return drawn;
  }

  static draftPhase(gs, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const drafts = {};
    gs.joueurs.forEach((j, pid) => {
      const drawn = MagouilleEngine.drawCards(gs, pid, 8, cartesDef);
      drafts[pid] = drawn;
    });
    return drafts;
  }

  static keepCards(gs, pid, keptUids) {
    const j = gs.joueurs[pid];
    if (!j.cartes_magouille) j.cartes_magouille = [];
    const kept = keptUids.slice(0, 4);
    j.cartes_magouille.push(...kept);
    return kept;
  }

  static discardFromDraft(gs, allDrawn, keptUids) {
    const keptSet = new Set(keptUids);
    allDrawn.forEach(uid => {
      if (!keptSet.has(uid)) {
        gs.deck_magouille.defaussees.push(uid);
      }
    });
  }

  static canPlay(gs, pid, uid, currentPhase, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const card = gs._cartes_index[uid];
    if (!card) return { ok: false, reason: 'Carte inconnue' };

    const j = gs.joueurs[pid];
    if (!j.cartes_magouille?.includes(uid)) return { ok: false, reason: 'Carte non en main' };

    if (card.phase_jouable !== 'any' && card.phase_jouable !== currentPhase) {
      return { ok: false, reason: `Jouable uniquement en phase ${card.phase_jouable}` };
    }

    const res = card.cout || {};
    if (res.lingots && j.ressources.lingots < res.lingots) return { ok: false, reason: `${res.lingots}L requis` };
    if (res.armes && j.ressources.armes < res.armes) return { ok: false, reason: `${res.armes} armes requises` };
    if (res.doses && j.ressources.doses < res.doses) return { ok: false, reason: `${res.doses} doses requises` };

    return { ok: true };
  }

  static play(gs, pid, uid, params, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const card = gs._cartes_index[uid];
    if (!card) return { ok: false, msg: 'Carte inconnue' };

    const j = gs.joueurs[pid];
    const idx = j.cartes_magouille.indexOf(uid);
    if (idx === -1) return { ok: false, msg: 'Carte non en main' };

    const cost = card.cout || {};
    if (cost.lingots) j.ressources.lingots -= cost.lingots;
    if (cost.armes) j.ressources.armes -= cost.armes;
    if (cost.doses) j.ressources.doses -= cost.doses;

    j.cartes_magouille.splice(idx, 1);

    const result = MagouilleEngine._applyEffect(gs, pid, card, params);

    if (card.repose_sous_pile) {
      gs.deck_magouille.defaussees.push(uid);
    } else {
      gs.deck_magouille.retirees_du_jeu.push(uid);
    }

    return result;
  }

  static _applyEffect(gs, pid, card, params) {
    const j = gs.joueurs[pid];

    switch (card.effet) {
      case 'tuer_pion': {
        const { zone, pionIdx } = params;
        const z = gs.plateau[zone];
        if (!z || pionIdx == null || !z.pions[pionIdx]) return { ok: false, msg: 'Cible invalide' };
        const removed = z.pions.splice(pionIdx, 1)[0];
        return { ok: true, msg: `${removed.type} éliminé sur ${zone}` };
      }

      case 'retirer_electeurs': {
        const { cible } = params;
        const target = gs.joueurs[cible];
        if (!target || cible === pid) return { ok: false, msg: 'Cible invalide' };
        const amount = card.params?.electeurs || 100000;
        target.electeurs_malus = (target.electeurs_malus || 0) + amount;
        return { ok: true, msg: `${target.nom} perd ${(amount/1000)}k électeurs` };
      }

      case 'regagner_electeurs': {
        const amount = card.params?.electeurs || 100000;
        j.electeurs_malus = Math.max(0, (j.electeurs_malus || 0) - amount);
        return { ok: true, msg: `${j.nom} regagne ${(amount/1000)}k électeurs` };
      }

      case 'gagner_lingots': {
        const amount = card.params?.lingots || 400;
        j.ressources.lingots += amount;
        return { ok: true, msg: `${j.nom} reçoit ${amount}L` };
      }

      case 'retirer_pion': {
        const { zone, pionIdx } = params;
        const z = gs.plateau[zone];
        if (!z || !z.pions[pionIdx]) return { ok: false, msg: 'Cible invalide' };
        const removed = z.pions.splice(pionIdx, 1)[0];
        return { ok: true, msg: `${removed.type} retiré de ${zone}` };
      }

      case 'teleporter_pion': {
        const { fromZone, pionIdx, toZone } = params;
        const from = gs.plateau[fromZone];
        const to = gs.plateau[toZone];
        if (!from || !to || !from.pions[pionIdx]) return { ok: false, msg: 'Déplacement invalide' };
        const pion = from.pions[pionIdx];
        if (pion.joueur !== pid) return { ok: false, msg: 'Ce n\'est pas votre pion' };
        from.pions.splice(pionIdx, 1);
        to.pions.push(pion);
        return { ok: true, msg: `${pion.type} téléporté de ${fromZone} vers ${toZone}` };
      }

      case 'couper_electricite': {
        const { quartierId, gameplayData } = params;
        const q = gameplayData?.quartiers?.find(q => q.id === quartierId);
        if (!q) return { ok: false, msg: 'Quartier invalide' };
        q.zones.forEach(zid => { if (gs.plateau[zid]) gs.plateau[zid].electricite = false; });
        gs.coupures_electricite.push({ quartier: quartierId, tour_debut: gs.tour, duree: 3, par: pid, source: 'carte' });
        return { ok: true, msg: `Électricité coupée dans ${q.nom} pour 3 tours` };
      }

      case 'piocher_caisse_police': {
        if (gs.maire.joueur_id !== pid) return { ok: false, msg: 'Vous n\'êtes pas maire' };
        const amount = gs.caisses.hotel_police;
        gs.caisses.hotel_police = 0;
        j.ressources.lingots += amount;
        j.electeurs_malus = (j.electeurs_malus || 0) + (card.params?.electeurs_malus || 500000);
        return { ok: true, msg: `${amount}L détournés des caisses de police (−500k élect.)` };
      }

      case 'annuler_justice': {
        j._verges_actif = gs.tour;
        return { ok: true, msg: `Maître Vergès protège ${j.nom} ce tour` };
      }

      case 'racket_restaurants': {
        let total = 0;
        gs.joueurs.forEach((other, i) => {
          if (i === pid) return;
          let restoCount = 0;
          Object.values(gs.plateau).forEach(z => {
            if (z.construction === 'restaurant' && z.proprietaire === i) restoCount++;
          });
          const tax = restoCount * 10;
          other.ressources.lingots -= Math.min(tax, other.ressources.lingots);
          total += Math.min(tax, other.ressources.lingots);
        });
        j.ressources.lingots += total;
        return { ok: true, msg: `Roses connexion : ${total}L rackettés` };
      }

      case 'bonus_actions': {
        const bonus = card.params?.actions || 2;
        j.actions_bonus = (j.actions_bonus || 0) + bonus;
        return { ok: true, msg: `+${bonus} actions/tour jusqu'à la fin du mandat` };
      }

      case 'changer_ethnie': {
        const { ethnie } = card.params || {};
        if (!ethnie) return { ok: false, msg: 'Ethnie invalide' };
        const old = j.ethnie;
        j.ethnie = ethnie;
        return { ok: true, msg: `${j.nom} passe de ${old} à ${ethnie}` };
      }

      case 'retirer_flic_reserve': {
        if (gs.flics.reserves <= 0) return { ok: false, msg: 'Plus de flics en réserve' };
        gs.flics.reserves--;
        gs.flics.elimines++;
        return { ok: true, msg: `Un flic retiré du jeu (${gs.flics.reserves} en réserve)` };
      }

      case 'vendre_armes': {
        const prix = card.params?.prix_par_arme || 20;
        const qty = j.ressources.armes;
        if (qty <= 0) return { ok: false, msg: 'Pas d\'armes en stock' };
        j.ressources.armes = 0;
        j.ressources.lingots += qty * prix;
        return { ok: true, msg: `${qty} armes vendues pour ${qty * prix}L` };
      }

      case 'deplacer_incorruptible': {
        const { fromZone, toZone } = params;
        const from = gs.plateau[fromZone];
        const to = gs.plateau[toZone];
        if (!from || !to) return { ok: false, msg: 'Zones invalides' };
        const idx = from.pions.findIndex(p => p.type === 'incorruptible');
        if (idx === -1) return { ok: false, msg: 'Pas d\'incorruptible sur cette zone' };
        const inc = from.pions.splice(idx, 1)[0];
        to.pions.push(inc);
        return { ok: true, msg: `Incorruptible déplacé de ${fromZone} vers ${toZone}` };
      }

      case 'deplacer_gitans': {
        const { zones } = params;
        Object.values(gs.plateau).forEach(z => { z.gitans = false; });
        if (zones?.length) {
          zones.forEach(zid => { if (gs.plateau[zid]) gs.plateau[zid].gitans = true; });
        }
        gs.gitans.positions = zones || [];
        return { ok: true, msg: `Gitans déplacés vers ${(zones || []).length} zone(s)` };
      }

      case 'rendre_ineligible': {
        const { cible } = params;
        if (cible == null) return { ok: false, msg: 'Cible invalide' };
        gs.joueurs[cible]._ineligible = true;
        return { ok: true, msg: `${gs.joueurs[cible].nom} est inéligible aux prochaines élections` };
      }

      case 'igor_nettoyeur': {
        j._igor_actif = true;
        return { ok: true, msg: `Igor protège ${j.nom}` };
      }

      case 'contaminer_prostituees': {
        const { zone } = params;
        const z = gs.plateau[zone];
        if (!z) return { ok: false, msg: 'Zone invalide' };
        const removed = [];
        const toCheck = [zone];
        const visited = new Set();
        while (toCheck.length) {
          const cur = toCheck.pop();
          if (visited.has(cur)) continue;
          visited.add(cur);
          const zd = gs.plateau[cur];
          if (!zd) continue;
          zd.pions = zd.pions.filter(p => {
            if (p.type === 'prostituee_base' || p.type === 'prostituee_luxe') {
              removed.push({ zone: cur, type: p.type });
              return false;
            }
            return true;
          });
          if (removed.length > 0) {
            const adj = params.adjacencies?.[cur] || [];
            adj.forEach(a => { if (!visited.has(a)) toCheck.push(a); });
          }
        }
        return { ok: true, msg: `${removed.length} prostituée(s) contaminée(s)` };
      }

      default:
        return { ok: true, msg: `${card.nom} jouée` };
    }
  }

  static getCardDef(gs, uid, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    return gs._cartes_index?.[uid] || null;
  }

  static _ensureIndex(gs, cartesDef) {
    if (gs._cartes_index && Object.keys(gs._cartes_index).length > 0) return;
    gs._cartes_index = {};
    cartesDef.types.forEach(type => {
      for (let i = 0; i < type.quantite; i++) {
        const uid = `${type.id}_${i}`;
        gs._cartes_index[uid] = { ...type, uid };
      }
    });
  }
}
