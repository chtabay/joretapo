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
    desc: '11 hommes, 1 prostituée de luxe, posséder un casino et l\'aéroport, sacrifier 3 cartes magouille.'
  },
  labo: {
    label: 'Labo de raffinage',
    icon: '🧪',
    butin: 'Toute la drogue du propriétaire',
    color: '#2ecc71',
    desc: 'Pion armé sur le labo, 20 armes + 2 cartes magouille. Coupure d\'électricité = coûts ÷2.'
  }
};

export class HeistEngine {

  static _getAnnexeZones(gameplayData) {
    return Object.entries(gameplayData.zones)
      .filter(([_, z]) => z.facilite === 'annexe_zurich_bank')
      .map(([zid]) => zid);
  }

  static _getZoneByFacilite(gameplayData, facilite) {
    const entry = Object.entries(gameplayData.zones).find(([_, z]) => z.facilite === facilite);
    return entry ? entry[0] : null;
  }

  static _hasElectricityCut(gs, zoneId, gameplayData) {
    const q = gameplayData.quartiers.find(q => q.zones.includes(zoneId));
    if (!q) return false;
    return gs.coupures_electricite.some(c => c.quartier === q.id);
  }

  static _countPlayerArmedPions(gs, pid) {
    let count = 0;
    Object.values(gs.plateau).forEach(z => {
      z.pions.forEach(p => {
        if (p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant')) count++;
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

  static getProgress(gs, pid, heistType, gameplayData) {
    const j = gs.joueurs[pid];
    const reqs = [];

    switch (heistType) {
      case 'zurich_bank': {
        const annexes = this._getAnnexeZones(gameplayData);
        const ownedAnnexes = annexes.filter(zid => {
          const z = gs.plateau[zid];
          return z && z.pions.some(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant'));
        });
        reqs.push({ label: 'Pions sur les annexes', current: ownedAnnexes.length, needed: 4, zones: annexes, ownedZones: ownedAnnexes });
        return { reqs, sacrifice: '4 hommes de main', loot: `${gs.caisses.zurich_bank} lingots`, lootValue: gs.caisses.zurich_bank, zones: annexes, ownedZones: ownedAnnexes };
      }
      case 'hotel_police': {
        const hpZone = this._getZoneByFacilite(gameplayData, 'hotel_police');
        const hasPion = hpZone && gs.plateau[hpZone]?.pions.some(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant'));
        const hasBordel = Object.values(gs.plateau).some(z => z.construction === 'bordel' && z.proprietaire === pid);
        const myFlics = this._countPlayerFlics(gs, pid);
        const othersMaxFlics = Math.max(0, ...gs.joueurs.filter((_, i) => i !== pid).map((_, i) => this._countPlayerFlics(gs, i)));
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
        reqs.push({ label: 'Hommes de main', current: armedCount, needed: 11 });
        reqs.push({ label: 'Prostituée de luxe', current: hasLuxe ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Aéroport contrôlé', current: ownsAero ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Casino possédé', current: ownsCasino ? 1 : 0, needed: 1 });
        reqs.push({ label: 'Cartes magouille', current: (j.cartes_magouille || []).length, needed: 3 });
        reqs.push({ label: 'Casino adverse existant', current: casinoZones.length > 0 ? 1 : 0, needed: 1 });
        const targets = casinoZones.map(([zid]) => zid);
        return { reqs, sacrifice: '3 cartes magouille', loot: 'Tout l\'argent du propriétaire', lootValue: -1, zones: targets, targetZones: targets };
      }
      case 'labo': {
        const laboZones = Object.entries(gs.plateau).filter(([_, z]) => z.construction === 'labo' && z.proprietaire !== pid);
        const hasArmes = j.ressources.armes;
        const hasCartes = (j.cartes_magouille || []).length;
        reqs.push({ label: 'Armes', current: hasArmes, needed: 20 });
        reqs.push({ label: 'Cartes magouille', current: hasCartes, needed: 2 });
        reqs.push({ label: 'Labo adverse existant', current: laboZones.length > 0 ? 1 : 0, needed: 1 });
        const targets = laboZones.map(([zid]) => zid);
        return { reqs, sacrifice: '20 armes + 2 cartes', loot: 'Toute la drogue du propriétaire', lootValue: -1, zones: targets, targetZones: targets };
      }
    }
    return { reqs, sacrifice: '', loot: '', lootValue: 0, zones: [] };
  }

  static canHeist(gs, pid, heistType, gameplayData) {
    const j = gs.joueurs[pid];

    switch (heistType) {
      case 'zurich_bank': {
        const annexes = this._getAnnexeZones(gameplayData);
        const ownedAnnexes = annexes.filter(zid => {
          const z = gs.plateau[zid];
          return z && z.pions.some(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant'));
        });
        if (ownedAnnexes.length < 4) {
          return { ok: false, reason: `Pion armé requis sur 4 annexes (${ownedAnnexes.length}/${Math.min(4, annexes.length)} couvertes)`, details: { annexes, ownedAnnexes } };
        }
        return { ok: true, cost: {}, sacrifice: 4, annexes: ownedAnnexes.slice(0, 4) };
      }

      case 'hotel_police': {
        const hpZone = this._getZoneByFacilite(gameplayData, 'hotel_police');
        if (!hpZone) return { ok: false, reason: 'Zone introuvable' };
        const hasPion = gs.plateau[hpZone]?.pions.some(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant'));
        if (!hasPion) return { ok: false, reason: `Pion armé requis sur ${hpZone}` };
        const hasBordel = Object.values(gs.plateau).some(z => z.construction === 'bordel' && z.proprietaire === pid);
        if (!hasBordel) return { ok: false, reason: 'Bordel requis' };
        const myFlics = this._countPlayerFlics(gs, pid);
        if (myFlics < 2) return { ok: false, reason: `Min. 2 flics (vous en avez ${myFlics})` };
        const othersMaxFlics = Math.max(0, ...gs.joueurs.filter((_, i) => i !== pid).map((_, i) => this._countPlayerFlics(gs, i)));
        if (myFlics <= othersMaxFlics) return { ok: false, reason: `Plus de flics que tout adversaire requis (max adverse : ${othersMaxFlics})` };
        return { ok: true, cost: {}, sacrifice: 2 };
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
        if ((j.cartes_magouille || []).length < 3) return { ok: false, reason: `3 cartes magouille requises (${(j.cartes_magouille || []).length})` };
        return { ok: true, cost: { cartes: 3 }, casinoZones };
      }

      case 'labo': {
        const laboZones = Object.entries(gs.plateau).filter(([_, z]) => z.construction === 'labo' && z.proprietaire !== pid).map(([zid]) => zid);
        if (laboZones.length === 0) return { ok: false, reason: 'Aucun labo adverse à cambrioler' };
        if (j.ressources.armes < 20) return { ok: false, reason: `20 armes requises (${j.ressources.armes})` };
        if ((j.cartes_magouille || []).length < 2) return { ok: false, reason: `2 cartes magouille requises (${(j.cartes_magouille || []).length})` };
        return { ok: true, cost: { armes: 20, cartes: 2 }, laboZones };
      }

      default:
        return { ok: false, reason: 'Type de cambriolage invalide' };
    }
  }

  static executeHeist(gs, pid, heistType, params, gameplayData) {
    const check = this.canHeist(gs, pid, heistType, gameplayData);
    if (!check.ok) return check;

    const j = gs.joueurs[pid];
    const hasCut = params.targetZone ? this._hasElectricityCut(gs, params.targetZone, gameplayData) : false;

    switch (heistType) {
      case 'zurich_bank': {
        const annexes = check.annexes;
        let sacrificed = 0;
        annexes.forEach(zid => {
          const zone = gs.plateau[zid];
          const idx = zone.pions.findIndex(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant'));
          if (idx >= 0) { zone.pions.splice(idx, 1); sacrificed++; }
        });

        const butin = gs.caisses.zurich_bank;
        gs.caisses.zurich_bank = 0;
        j.ressources.lingots += butin;

        return { ok: true, msg: `🏦 Zurich Bank cambriolée ! ${butin}L récupérés, ${sacrificed} hommes perdus` };
      }

      case 'hotel_police': {
        const hpZone = this._getZoneByFacilite(gameplayData, 'hotel_police');
        const zone = gs.plateau[hpZone];
        let sacrificed = 0;
        for (let i = zone.pions.length - 1; i >= 0 && sacrificed < 2; i--) {
          if (zone.pions[i].joueur === pid && (zone.pions[i].type === 'dealer' || zone.pions[i].type === 'trafiquant')) {
            zone.pions.splice(i, 1);
            sacrificed++;
          }
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

        j.cartes_magouille.splice(0, 3);

        const victim = gs.joueurs[ownerId];
        const butin = victim.ressources.lingots;
        victim.ressources.lingots = 0;
        j.ressources.lingots += butin;

        return { ok: true, msg: `🎰 Casino de ${victim.nom} cambriolé ! ${butin}L volés, 3 cartes dépensées` };
      }

      case 'labo': {
        const targetZone = params.targetZone;
        if (!targetZone) return { ok: false, reason: 'Zone cible requise' };
        const zone = gs.plateau[targetZone];
        if (!zone || zone.construction !== 'labo') return { ok: false, reason: 'Pas de labo sur cette zone' };
        const ownerId = zone.proprietaire;
        if (ownerId === pid) return { ok: false, reason: 'Vous ne pouvez pas cambrioler votre propre labo' };

        const costArmes = hasCut ? 10 : 20;
        const costCartes = hasCut ? 1 : 2;
        j.ressources.armes -= costArmes;
        j.cartes_magouille.splice(0, costCartes);

        const victim = gs.joueurs[ownerId];
        const butin = victim.ressources.doses;
        victim.ressources.doses = 0;
        j.ressources.doses += butin;

        return { ok: true, msg: `🧪 Labo de ${victim.nom} cambriolé ! ${butin} doses volées (−${costArmes}A, −${costCartes} cartes)` };
      }

      default:
        return { ok: false, reason: 'Type invalide' };
    }
  }
}
