export const MAYOR_POWERS = {
  incorruptible:   { id: 'incorruptible',   label: 'Lancer un incorruptible',              phase: 5, desc: 'Déployez un incorruptible sur la zone de votre choix' },
  exproprier:      { id: 'exproprier',      label: 'Exproprier un joueur de 4 blocs',      phase: 5, desc: 'Retirez la propriété de 4 zones d\'un joueur' },
  taxe:            { id: 'taxe',            label: 'Exiger 10 % de l\'argent de chacun',   phase: 1, desc: 'Prélevez 10 % des lingots de chaque joueur' },
  coupure:         { id: 'coupure',         label: 'Couper l\'électricité d\'un quartier',  phase: 1, desc: 'Un quartier entier perd l\'électricité pour le mandat' },
  repositionner:   { id: 'repositionner',   label: 'Repositionner 3 flics',                phase: 1, desc: 'Déplacez 3 flics vers les zones de votre choix' },
  saisir_argent:   { id: 'saisir_argent',   label: 'Saisir l\'argent d\'un joueur',        phase: 1, desc: 'L\'argent du joueur ciblé va à la caisse de police' },
  saisir_denrees:  { id: 'saisir_denrees',  label: 'Saisir drogue + armes d\'un joueur',   phase: 1, desc: 'Récupérez la drogue et les armes d\'un joueur' },
  deplacer_gitans: { id: 'deplacer_gitans', label: 'Déplacer tous les gitans',             phase: 1, desc: 'Repositionnez tous les gitans sur le plateau' }
};

export class MayorEngine {

  static canUse(gs, pid) {
    return gs.maire.joueur_id === pid && gs.maire.privileges_restants > 0;
  }

  static availablePowers(gs, pid, currentPhase) {
    if (!MayorEngine.canUse(gs, pid)) return [];
    return Object.values(MAYOR_POWERS).filter(p => p.phase === currentPhase);
  }

  static execute(gs, pid, powerId, params, gameplayData) {
    if (!MayorEngine.canUse(gs, pid)) return { ok: false, msg: 'Pas de privilège disponible' };
    const power = MAYOR_POWERS[powerId];
    if (!power) return { ok: false, msg: 'Pouvoir inconnu' };

    const result = MayorEngine['_' + powerId](gs, pid, params, gameplayData);
    if (result.ok) {
      gs.maire.privileges_restants--;
      gs.joueurs[pid].privileges_maire_restants--;
    }
    return result;
  }

  static _incorruptible(gs, pid, params) {
    const { zone } = params;
    if (!gs.plateau[zone]) return { ok: false, msg: 'Zone invalide' };
    gs.plateau[zone].pions.push({ type: 'incorruptible', joueur: null });
    gs.incorruptibles.deployes.push(zone);
    return { ok: true, msg: `Un incorruptible est déployé sur ${zone}` };
  }

  static _exproprier(gs, pid, params) {
    const { cible, zones } = params;
    if (cible === pid) return { ok: false, msg: 'Impossible de s\'exproprier soi-même' };
    if (!zones || zones.length !== 4) return { ok: false, msg: 'Sélectionnez exactement 4 zones' };

    const expelled = [];
    zones.forEach(zid => {
      const zone = gs.plateau[zid];
      if (zone && zone.proprietaire === cible) {
        zone.proprietaire = null;
        expelled.push(zid);
      }
    });
    return { ok: true, msg: `${gs.joueurs[cible].nom} exproprié de ${expelled.length} zone(s)` };
  }

  static _taxe(gs, pid) {
    let total = 0;
    gs.joueurs.forEach((j, i) => {
      if (i === pid) return;
      const tax = Math.floor(j.ressources.lingots * 0.1);
      j.ressources.lingots -= tax;
      total += tax;
    });
    gs.joueurs[pid].ressources.lingots += total;
    return { ok: true, msg: `Taxe perçue : ${total}L` };
  }

  static _coupure(gs, pid, params, gameplayData) {
    const { quartierId } = params;
    const q = gameplayData.quartiers.find(q => q.id === quartierId);
    if (!q) return { ok: false, msg: 'Quartier invalide' };

    q.zones.forEach(zid => {
      if (gs.plateau[zid]) gs.plateau[zid].electricite = false;
    });
    gs.coupures_electricite.push({ quartier: quartierId, tour_debut: gs.tour, par: pid });
    return { ok: true, msg: `Électricité coupée dans ${q.nom}` };
  }

  static _repositionner(gs, pid, params) {
    const { mouvements } = params;
    if (!mouvements || mouvements.length > 3) return { ok: false, msg: 'Maximum 3 flics' };

    const moved = [];
    mouvements.forEach(({ from, to }) => {
      const fromZone = gs.plateau[from];
      const toZone = gs.plateau[to];
      if (!fromZone || !toZone) return;
      const flicIdx = fromZone.pions.findIndex(p => p.type === 'flic');
      if (flicIdx === -1) return;
      const flic = fromZone.pions.splice(flicIdx, 1)[0];
      toZone.pions.push(flic);
      moved.push(`${from}→${to}`);
    });
    return { ok: true, msg: `${moved.length} flic(s) repositionné(s)` };
  }

  static _saisir_argent(gs, pid, params) {
    const { cible } = params;
    if (cible === pid) return { ok: false, msg: 'Impossible de se cibler soi-même' };
    const amount = gs.joueurs[cible].ressources.lingots;
    gs.joueurs[cible].ressources.lingots = 0;
    gs.caisses.hotel_police += amount;
    return { ok: true, msg: `${amount}L saisis chez ${gs.joueurs[cible].nom} → caisses de police` };
  }

  static _saisir_denrees(gs, pid, params) {
    const { cible } = params;
    if (cible === pid) return { ok: false, msg: 'Impossible de se cibler soi-même' };
    const target = gs.joueurs[cible];
    const doses = target.ressources.doses;
    const armes = target.ressources.armes;
    target.ressources.doses = 0;
    target.ressources.armes = 0;
    gs.joueurs[pid].ressources.doses += doses;
    gs.joueurs[pid].ressources.armes += armes;
    return { ok: true, msg: `Saisi chez ${target.nom} : ${doses}D + ${armes}A` };
  }

  static _deplacer_gitans(gs, pid, params) {
    const { zones } = params;
    Object.values(gs.plateau).forEach(z => { z.gitans = false; });
    if (zones && zones.length > 0) {
      zones.forEach(zid => {
        if (gs.plateau[zid]) gs.plateau[zid].gitans = true;
      });
    }
    gs.gitans.positions = zones || [];
    return { ok: true, msg: `Gitans déplacés vers ${(zones || []).length} zone(s)` };
  }
}
