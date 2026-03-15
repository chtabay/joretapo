const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const ETHNIES = ['caucasien', 'afro_americain', 'asiatique', 'italien'];

export class GameState {
  static VERSION = '2.0';
  static SAVE_KEY = 'joretapo-save';

  static create(config, gameplayData) {
    const state = new GameState();
    state.version = GameState.VERSION;
    state.timestamp = new Date().toISOString();
    state.config = { ...config };
    state.tour = 0;
    state.phase = 0;
    state.joueur_actif_index = null;

    state.joueurs = config.joueurs.map((j, i) => ({
      id: i,
      nom: j.nom,
      couleur: j.couleur || PLAYER_COLORS[i],
      ethnie: j.ethnie,
      quartier_origine: j.quartier_origine,
      ressources: { lingots: 0, doses: 0, armes: 0 },
      cartes_magouille: [],
      electeurs_bonus: 0,
      electeurs_malus: 0,
      est_maire: false,
      privileges_maire_restants: 0,
      gangs_actives: [],
      nb_coupole_restantes: 2,
      actions_bonus: 0,
      ordres_phase_courante: []
    }));

    state.plateau = {};
    const allZoneIds = Object.keys(gameplayData.zones);
    allZoneIds.forEach(zid => {
      state.plateau[zid] = {
        proprietaire: null,
        pions: [],
        construction: null,
        electricite: true,
        gitans: false
      };
    });
    (gameplayData.iles || []).forEach(ile => {
      state.plateau[ile.id] = {
        proprietaire: null,
        pions: [],
        construction: null,
        electricite: true,
        gitans: false
      };
    });

    state.caisses = { zurich_bank: 0, hotel_police: 0 };
    state.maire = { joueur_id: null, privileges_restants: 0, tour_election: null };
    state.deck_magouille = { pile: [], defaussees: [], retirees_du_jeu: [] };
    state.flics = { deployes: [], reserves: 7, elimines: 0 };
    state.incorruptibles = { deployes: [], elimines: 0 };
    state.gitans = { positions: [] };
    state.gangs_actifs = {};
    state.contrats = [];
    state.coupures_electricite = [];
    state.historique = [];

    state._distributeStartingResources(gameplayData);
    state._placeInitialPions(gameplayData);
    state._placeGitans(gameplayData);

    state.tour = 1;
    state.phase = 1;

    return state;
  }

  _distributeStartingResources(gameplayData) {
    this.joueurs.forEach(joueur => {
      const quartier = gameplayData.quartiers.find(q => q.id === joueur.quartier_origine);
      if (!quartier || !quartier.privileges_depart) return;

      const priv = quartier.privileges_depart;
      joueur.ressources.lingots = priv.lingots;
      joueur.ressources.armes = priv.armes;
      joueur.ressources.doses = priv.doses;

      joueur.pions_initiaux = {
        prostituees_base: priv.prostituees_base,
        prostituees_luxe: priv.prostituees_luxe,
        trafiquants: priv.trafiquants,
        dealers: priv.dealers
      };
      joueur.cartes_magouille_bonus = priv.cartes_magouille_bonus;
    });
  }

  _placeInitialPions(gameplayData) {
    this.joueurs.forEach(joueur => {
      const quartier = gameplayData.quartiers.find(q => q.id === joueur.quartier_origine);
      if (!quartier) return;

      const zones = [...quartier.zones];
      const init = joueur.pions_initiaux;
      if (!init) return;

      const pionsToPlace = [];
      for (let i = 0; i < (init.trafiquants || 0); i++) pionsToPlace.push('trafiquant');
      for (let i = 0; i < (init.dealers || 0); i++) pionsToPlace.push('dealer');
      for (let i = 0; i < (init.prostituees_base || 0); i++) pionsToPlace.push('prostituee_base');
      for (let i = 0; i < (init.prostituees_luxe || 0); i++) pionsToPlace.push('prostituee_luxe');

      let zoneIdx = 0;
      pionsToPlace.forEach(type => {
        const zoneId = zones[zoneIdx % zones.length];
        const zone = this.plateau[zoneId];

        const hasArmed = zone.pions.some(p => p.type === 'dealer' || p.type === 'trafiquant');
        const isArmed = type === 'dealer' || type === 'trafiquant';

        if (isArmed && hasArmed) {
          zoneIdx++;
          const nextZone = zones[zoneIdx % zones.length];
          this.plateau[nextZone].pions.push({ type, joueur: joueur.id });
          this.plateau[nextZone].proprietaire = joueur.id;
        } else {
          zone.pions.push({ type, joueur: joueur.id });
          zone.proprietaire = joueur.id;
        }

        if (isArmed) zoneIdx++;
      });

      delete joueur.pions_initiaux;
      delete joueur.cartes_magouille_bonus;
    });
  }

  _placeGitans(gameplayData) {
    const iles = gameplayData.iles || [];
    this.gitans.positions = iles.map(ile => ile.id);
    iles.forEach(ile => {
      if (this.plateau[ile.id]) {
        this.plateau[ile.id].pions.push({ type: 'gitan', joueur: null });
        this.plateau[ile.id].gitans = true;
      }
    });
  }

  serialize() {
    this.timestamp = new Date().toISOString();
    const plain = {};
    for (const key of Object.keys(this)) {
      plain[key] = this[key];
    }
    return plain;
  }

  save(slot = 0) {
    const key = `${GameState.SAVE_KEY}-${slot}`;
    localStorage.setItem(key, JSON.stringify(this.serialize()));
  }

  static load(slot = 0) {
    const key = `${GameState.SAVE_KEY}-${slot}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const data = JSON.parse(raw);
    const state = new GameState();
    Object.assign(state, data);
    return state;
  }

  static hasSave(slot = 0) {
    return localStorage.getItem(`${GameState.SAVE_KEY}-${slot}`) !== null;
  }

  static deleteSave(slot = 0) {
    localStorage.removeItem(`${GameState.SAVE_KEY}-${slot}`);
  }

  getQuartierOwner(quartierId, gameplayData) {
    const quartier = gameplayData.quartiers.find(q => q.id === quartierId);
    if (!quartier) return null;

    const owners = quartier.zones.map(zid => this.plateau[zid]?.proprietaire);
    if (owners.some(o => o === null || o === undefined)) return null;
    const unique = [...new Set(owners)];
    return unique.length === 1 ? unique[0] : null;
  }

  getPlayerPoints(joueurId, gameplayData) {
    let points = 0;

    gameplayData.quartiers.forEach(q => {
      if (this.getQuartierOwner(q.id, gameplayData) === joueurId) {
        points += q.points;
      }
    });

    Object.values(this.plateau).forEach(zone => {
      if (zone.construction && zone.proprietaire === joueurId) {
        points += 1;
      }
    });

    if (this.maire.joueur_id === joueurId) points += 15;

    const joueur = this.joueurs[joueurId];

    const dealerCount = Object.values(this.plateau)
      .flatMap(z => z.pions)
      .filter(p => p.joueur === joueurId && p.type === 'dealer').length;
    if (dealerCount >= 8) points += 10;

    const prostCount = Object.values(this.plateau)
      .flatMap(z => z.pions)
      .filter(p => p.joueur === joueurId && (p.type === 'prostituee_base' || p.type === 'prostituee_luxe')).length;
    if (prostCount >= 8) points += 10;

    const trafCount = Object.values(this.plateau)
      .flatMap(z => z.pions)
      .filter(p => p.joueur === joueurId && p.type === 'trafiquant').length;
    if (trafCount >= 6) points += 10;

    const maxLingots = Math.max(...this.joueurs.map(j => j.ressources.lingots));
    if (joueur.ressources.lingots >= 2000 && joueur.ressources.lingots === maxLingots) {
      points += 10;
    }

    return points;
  }
}

export { PLAYER_COLORS, ETHNIES };
