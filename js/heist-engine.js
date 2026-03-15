export const HEIST_TYPES = {
  zurich_bank: {
    label: 'Cambriolage de la Zurich Bank',
    icon: '🏦',
    butin: 'Tous les fonds de la banque'
  },
  hotel_police: {
    label: 'Cambriolage de l\'Hôtel de Police',
    icon: '🚔',
    butin: 'Moitié des fonds de la police'
  },
  casino: {
    label: 'Cambriolage de Casino',
    icon: '🎰',
    butin: 'Tout l\'argent du propriétaire'
  },
  labo: {
    label: 'Cambriolage de Labo',
    icon: '🧪',
    butin: 'Toute la drogue du propriétaire'
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
