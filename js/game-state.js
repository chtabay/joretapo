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

  static MIN_START_LINGOTS = 20;

  _distributeStartingResources(gameplayData) {
    this.joueurs.forEach(joueur => {
      const quartier = gameplayData.quartiers.find(q => q.id === joueur.quartier_origine);
      if (!quartier || !quartier.privileges_depart) return;

      const priv = quartier.privileges_depart;
      joueur.ressources.lingots = Math.max(priv.lingots || 0, GameState.MIN_START_LINGOTS);
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

  /**
   * Répartit les pions de départ sur le QUARTIER D'ORIGINE en couvrant le plus de
   * zones distinctes possible.
   *
   * L'ancienne version n'avançait le curseur de zone que pour les pions armés
   * (`if (isArmed) zoneIdx++`), si bien que toutes les prostituées d'un joueur
   * s'empilaient sur une seule et même case. South Brooklyn, annoncé à 15 points,
   * ne couvrait ainsi que 3 de ses 9 zones — et comme le contrôle d'un quartier
   * exigeait alors 100 % des zones, six des onze quartiers de départ rapportaient
   * 0 point au tour 1. C'étaient exactement les six affichés à 9 et 15 points : le
   * libellé du quartier le plus cher fonctionnait comme une contre-indication.
   *
   * Deux contraintes de cohabitation, les mêmes qu'en cours de partie : un seul
   * pion armé par zone, une seule prostituée par zone. Armés et prostituées se
   * répartissent donc sur deux passages décalés, ce qui maximise le nombre de
   * zones occupées au lieu de les empiler.
   */
  _placeInitialPions(gameplayData) {
    this.joueurs.forEach(joueur => {
      const quartier = gameplayData.quartiers.find(q => q.id === joueur.quartier_origine);
      if (!quartier) return;

      const zones = [...quartier.zones];
      const init = joueur.pions_initiaux;
      if (!init) return;

      const armes = [
        ...Array(init.trafiquants || 0).fill('trafiquant'),
        ...Array(init.dealers || 0).fill('dealer')
      ];
      const filles = [
        ...Array(init.prostituees_luxe || 0).fill('prostituee_luxe'),
        ...Array(init.prostituees_base || 0).fill('prostituee_base')
      ];

      const poser = (type, zoneId) => {
        const zone = this.plateau[zoneId];
        zone.pions.push({ type, joueur: joueur.id });
        zone.proprietaire = joueur.id;
      };

      /* Les pions armés d'abord, un par zone depuis le début.
         Le surplus — un quartier peut recevoir plus de pions armés qu'il n'a de
         zones — est empilé sur les cases les moins chargées plutôt que perdu :
         on ne fait jamais disparaître les pièces d'un joueur, quitte à ce qu'il
         doive les désempiler lui-même au premier tour. La donnée de ville qui
         provoque ce surplus est signalée par test/city-data.test.mjs. */
      armes.forEach((type, i) => {
        if (i < zones.length) { poser(type, zones[i]); return; }
        const moinsChargee = zones.reduce((a, b) =>
          this.plateau[a].pions.length <= this.plateau[b].pions.length ? a : b);
        poser(type, moinsChargee);
      });

      /* Les prostituées ensuite, en repartant APRÈS le dernier pion armé : deux
         passages décalés couvrent armes.length + filles.length zones distinctes
         au lieu d'empiler tout le monde au même endroit. */
      const depart = Math.min(armes.length, zones.length);
      filles.forEach((type, i) => {
        const zoneId = zones[(depart + i) % zones.length];
        const zone = this.plateau[zoneId];
        /* Une seule prostituée par zone : si le tour de piste est bouclé, on
           cherche la première case encore libre plutôt que d'empiler. */
        if (zone.pions.some(p => p.type === 'prostituee_base' || p.type === 'prostituee_luxe')) {
          const libre = zones.find(z =>
            !this.plateau[z].pions.some(p => p.type === 'prostituee_base' || p.type === 'prostituee_luxe'));
          if (libre) poser(type, libre);
          return;
        }
        poser(type, zoneId);
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

  /**
   * Contrôle d'un quartier — à la MAJORITÉ STRICTE de ses zones.
   *
   * L'unanimité était exigée auparavant, et c'est la règle qui figeait la partie.
   * Un quartier de 9 zones demandait de tenir les 9 simultanément ; une seule case
   * perdue faisait tomber les 15 points d'un coup, et une seule case libre suffisait
   * à empêcher quiconque de les gagner. Conséquence mesurée sur 20 parties : aucun
   * combat, aucun changement de main, et un plafond à 30 points sur 55.
   *
   * À la majorité, le territoire redevient disputable en permanence : on peut
   * prendre un quartier sans le nettoyer entièrement, et le perdre sans être
   * chassé partout. C'est ce qui donne une raison d'attaquer avant la fin.
   */
  getQuartierOwner(quartierId, gameplayData) {
    const quartier = gameplayData.quartiers.find(q => q.id === quartierId);
    if (!quartier) return null;

    const compte = new Map();
    quartier.zones.forEach(zid => {
      const p = this.plateau[zid]?.proprietaire;
      if (p === null || p === undefined) return;
      compte.set(p, (compte.get(p) || 0) + 1);
    });

    const seuil = quartier.zones.length / 2;
    for (const [pid, n] of compte) {
      if (n > seuil) return pid;
    }
    return null;
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
