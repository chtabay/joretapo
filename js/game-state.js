/**
 * JORETAPO — État de partie.
 *
 * Contient TOUT ce qui définit une partie en cours : joueurs, plateau, caisses,
 * deck, maire, contrats. C'est le seul objet sauvegardé (localStorage) et le
 * seul objet exporté dans le lien / QR code de partage.
 *
 * CONVENTION DE SÉRIALISATION
 * ───────────────────────────
 * Toute clé posée sur l'état dont le nom commence par `_` est considérée comme
 * VOLATILE : cache de travail reconstructible à la volée, jamais sauvegardée.
 * C'est le cas de `_cartes_index` (MagouilleEngine.initDeck / _ensureIndex) qui
 * pèse ~72 Ko et faisait exploser la taille du lien de partage.
 */

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const ETHNIES = ['caucasien', 'afro_americain', 'asiatique', 'italien'];

/** Un seul pion armé par case (specs/01 « Cohabitation »). */
const EST_ARME = t => t === 'dealer' || t === 'trafiquant';
/** Une seule prostituée par case, classique OU luxe (specs/06, décision 5). */
const EST_PROSTITUEE = t => t === 'prostituee_base' || t === 'prostituee_luxe';

/**
 * Coûts de création (specs/01 « Pions usuels »). Servent à indemniser un pion
 * de départ qu'aucune case libre du quartier d'origine ne peut accueillir.
 */
const COUT_CREATION_PION = {
  trafiquant: { lingots: 80, armes: 3 },
  dealer: { lingots: 40, armes: 2 },
  prostituee_luxe: { lingots: 80, armes: 0 },
  prostituee_base: { lingots: 40, armes: 0 }
};

export class GameState {
  static VERSION = '2.0';
  static SAVE_KEY = 'joretapo-save';

  /** Résultat du dernier `load()` / `deserialize()` — permet à l'UI d'expliquer un refus. */
  static dernierChargement = null;

  /* ═══════════════════════════════════════════
   *  VALEURS PAR DÉFAUT (création ET migration)
   * ═══════════════════════════════════════════ */

  /** Squelette d'un état neuf : toute clé absente d'une vieille sauvegarde est reprise ici. */
  static _defautsEtat() {
    return {
      version: GameState.VERSION,
      timestamp: null,
      config: {},
      tour: 0,
      phase: 0,
      joueur_actif_index: null,
      joueurs: [],
      plateau: {},
      caisses: { zurich_bank: 0, hotel_police: 0 },
      maire: { joueur_id: null, privileges_restants: 0, tour_election: null },
      deck_magouille: { pile: [], defaussees: [], retirees_du_jeu: [] },
      flics: { deployes: [], reserves: 7, elimines: 0 },
      incorruptibles: { deployes: [], elimines: 0 },
      gitans: { positions: [] },
      gangs_actifs: {},
      contrats: [],
      coupures_electricite: [],
      historique: []
    };
  }

  /** Squelette d'un joueur : même rôle que _defautsEtat pour les sous-objets joueur. */
  static _defautsJoueur() {
    return {
      id: 0,
      nom: '',
      couleur: PLAYER_COLORS[0],
      ethnie: ETHNIES[0],
      quartier_origine: null,
      ressources: { lingots: 0, doses: 0, armes: 0 },
      cartes_magouille: [],
      cartes_magouille_bonus: 0,
      electeurs_bonus: 0,
      electeurs_malus: 0,
      est_maire: false,
      privileges_maire_restants: 0,
      gangs_actives: [],
      nb_coupole_restantes: 2,
      actions_bonus: 0,
      ordres_phase_courante: []
    };
  }

  /** Squelette d'une case du plateau. */
  static _defautsZone() {
    return { proprietaire: null, pions: [], construction: null, electricite: true, gitans: false };
  }

  /* ═══════════════════════════════════════════
   *  CRÉATION
   * ═══════════════════════════════════════════ */

  static create(config, gameplayData) {
    const state = new GameState();
    Object.assign(state, GameState._defautsEtat());
    state.timestamp = new Date().toISOString();
    state.config = { ...config };

    state.joueurs = config.joueurs.map((j, i) => ({
      ...GameState._defautsJoueur(),
      id: i,
      nom: j.nom,
      couleur: j.couleur || PLAYER_COLORS[i % PLAYER_COLORS.length],
      ethnie: j.ethnie,
      quartier_origine: j.quartier_origine
    }));

    state.plateau = {};
    Object.keys(gameplayData.zones).forEach(zid => {
      state.plateau[zid] = GameState._defautsZone();
    });
    (gameplayData.iles || []).forEach(ile => {
      state.plateau[ile.id] = GameState._defautsZone();
    });

    state._distributeStartingResources(gameplayData);
    state._placeInitialPions(gameplayData);
    state._placeGitans(gameplayData);

    state.tour = 1;
    state.phase = 1;

    return state;
  }

  static MIN_START_LINGOTS = 20;

  _quartierDe(joueur, gameplayData) {
    return (gameplayData.quartiers || []).find(q => q.id === joueur.quartier_origine) || null;
  }

  /**
   * Ressources et privilèges de départ. N'écrit AUCUN champ de travail sur le
   * joueur : le placement relit les données du quartier lui-même.
   */
  _distributeStartingResources(gameplayData) {
    this.joueurs.forEach(joueur => {
      const quartier = this._quartierDe(joueur, gameplayData);
      if (!quartier || !quartier.privileges_depart) return;

      const priv = quartier.privileges_depart;
      joueur.ressources.lingots = Math.max(priv.lingots || 0, GameState.MIN_START_LINGOTS);
      joueur.ressources.armes = priv.armes || 0;
      joueur.ressources.doses = priv.doses || 0;
      // Privilège réellement conservé dans l'état : il est consommé au draft.
      joueur.cartes_magouille_bonus = priv.cartes_magouille_bonus || 0;
    });
  }

  /** Liste ordonnée des pions de départ d'un quartier (armés d'abord). */
  static _pionsDeDepart(priv) {
    const pions = [];
    for (let i = 0; i < (priv.trafiquants || 0); i++) pions.push('trafiquant');
    for (let i = 0; i < (priv.dealers || 0); i++) pions.push('dealer');
    for (let i = 0; i < (priv.prostituees_luxe || 0); i++) pions.push('prostituee_luxe');
    for (let i = 0; i < (priv.prostituees_base || 0); i++) pions.push('prostituee_base');
    return pions;
  }

  /**
   * Place les pions de départ dans le quartier d'origine en respectant les deux
   * règles de cohabitation (1 armé max et 1 prostituée max par case) et en
   * étalant les pions pour occuper le plus de cases possible.
   *
   * Un pion qu'aucune case ne peut légalement accueillir (Harlem : 5 pions armés
   * pour 3 cases) n'est PAS posé : le joueur reçoit à la place son coût de
   * création en lingots et armes (cf. docs/journal-decisions.md).
   */
  _placeInitialPions(gameplayData) {
    this.joueurs.forEach(joueur => {
      const quartier = this._quartierDe(joueur, gameplayData);
      if (!quartier || !quartier.privileges_depart) return;

      const zones = (quartier.zones || []).filter(zid => this.plateau[zid]);
      if (zones.length === 0) return;

      const pions = GameState._pionsDeDepart(quartier.privileges_depart);
      // Les prostituées démarrent leur ronde là où les armés l'ont finie :
      // sans ça toutes les cases occupées porteraient deux pions et le reste
      // du quartier resterait vide.
      let curseurArme = 0;
      let curseurProst = pions.filter(EST_ARME).length % zones.length;

      pions.forEach(type => {
        const arme = EST_ARME(type);
        const libre = zid => {
          const z = this.plateau[zid];
          if (arme) return !z.pions.some(p => EST_ARME(p.type));
          return !z.pions.some(p => EST_PROSTITUEE(p.type));
        };

        let cible = null;
        const depart = arme ? curseurArme : curseurProst;
        for (let pas = 0; pas < zones.length; pas++) {
          const zid = zones[(depart + pas) % zones.length];
          if (libre(zid)) { cible = zid; break; }
        }

        if (!cible) {
          // Aucune case légale : indemnisation au coût de création.
          const cout = COUT_CREATION_PION[type] || { lingots: 0, armes: 0 };
          joueur.ressources.lingots += cout.lingots;
          joueur.ressources.armes += cout.armes;
          return;
        }

        const zone = this.plateau[cible];
        zone.pions.push({ type, joueur: joueur.id });
        zone.proprietaire = joueur.id;

        const suivant = (zones.indexOf(cible) + 1) % zones.length;
        if (arme) curseurArme = suivant; else curseurProst = suivant;
      });
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

  /* ═══════════════════════════════════════════
   *  SÉRIALISATION
   * ═══════════════════════════════════════════ */

  /** Vrai pour une clé de travail non sauvegardée (convention `_`). */
  static estCleVolatile(cle) {
    return typeof cle === 'string' && cle.startsWith('_');
  }

  /**
   * État nu, prêt pour JSON.stringify.
   * Exclut les caches volatils (`_cartes_index` &co) : ils sont reconstruits à
   * la demande par les moteurs et n'ont rien à faire dans un lien de partage.
   */
  serialize() {
    this.timestamp = new Date().toISOString();
    const plain = {};
    for (const key of Object.keys(this)) {
      if (GameState.estCleVolatile(key)) continue;
      if (typeof this[key] === 'function') continue;
      plain[key] = this[key];
    }
    return plain;
  }

  /* ═══════════════════════════════════════════
   *  VERSION ET MIGRATION
   * ═══════════════════════════════════════════ */

  static _parseVersion(v) {
    const m = /^(\d+)\.(\d+)$/.exec(String(v ?? '').trim());
    if (!m) return null;
    return { majeur: Number(m[1]), mineur: Number(m[2]) };
  }

  /**
   * Vérifie la version d'une sauvegarde et la complète pour le schéma courant.
   * @returns {{ok:boolean, data?:object, msg:string, reason:string}}
   */
  static migrer(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, msg: 'Sauvegarde illisible : ce n\'est pas un état de partie.', reason: 'format_invalide' };
    }
    if (!Array.isArray(data.joueurs) || !data.plateau || typeof data.plateau !== 'object') {
      return { ok: false, msg: 'Sauvegarde illisible : joueurs ou plateau manquants.', reason: 'structure_invalide' };
    }

    // Une sauvegarde sans champ `version` date d'avant l'introduction du schéma.
    const brute = data.version == null ? '1.0' : data.version;
    const lue = GameState._parseVersion(brute);
    const courante = GameState._parseVersion(GameState.VERSION);
    if (!lue) {
      return {
        ok: false,
        msg: `Sauvegarde d'un format inconnu (version « ${String(brute)} ») : impossible à charger.`,
        reason: 'version_inconnue'
      };
    }
    if (lue.majeur > courante.majeur || (lue.majeur === courante.majeur && lue.mineur > courante.mineur)) {
      return {
        ok: false,
        msg: `Cette sauvegarde vient d'une version plus récente de JORETAPO (${brute} > ${GameState.VERSION}). Mettez le jeu à jour pour l'ouvrir.`,
        reason: 'version_future'
      };
    }

    const migre = GameState._completer(data);
    migre.version = GameState.VERSION;
    const ancienne = lue.majeur !== courante.majeur || lue.mineur !== courante.mineur;
    return {
      ok: true,
      data: migre,
      msg: ancienne
        ? `Sauvegarde migrée de la version ${brute} vers ${GameState.VERSION}.`
        : 'Sauvegarde chargée.',
      reason: ancienne ? 'migre' : 'a_jour'
    };
  }

  /** Complète un état partiel avec les valeurs par défaut du schéma courant. */
  static _completer(data) {
    const complet = { ...GameState._defautsEtat(), ...data };

    complet.caisses = { ...GameState._defautsEtat().caisses, ...(data.caisses || {}) };
    complet.maire = { ...GameState._defautsEtat().maire, ...(data.maire || {}) };
    complet.deck_magouille = { ...GameState._defautsEtat().deck_magouille, ...(data.deck_magouille || {}) };
    complet.flics = { ...GameState._defautsEtat().flics, ...(data.flics || {}) };
    complet.incorruptibles = { ...GameState._defautsEtat().incorruptibles, ...(data.incorruptibles || {}) };
    complet.gitans = { ...GameState._defautsEtat().gitans, ...(data.gitans || {}) };
    complet.gangs_actifs = data.gangs_actifs && typeof data.gangs_actifs === 'object' ? data.gangs_actifs : {};
    ['contrats', 'coupures_electricite', 'historique'].forEach(cle => {
      if (!Array.isArray(complet[cle])) complet[cle] = [];
    });

    complet.joueurs = data.joueurs.map((j, i) => {
      const base = GameState._defautsJoueur();
      const joueur = { ...base, ...(j || {}) };
      joueur.id = Number.isInteger(j?.id) ? j.id : i;
      joueur.ressources = { ...base.ressources, ...((j && j.ressources) || {}) };
      ['cartes_magouille', 'gangs_actives', 'ordres_phase_courante'].forEach(cle => {
        if (!Array.isArray(joueur[cle])) joueur[cle] = [];
      });
      return joueur;
    });

    complet.plateau = {};
    Object.entries(data.plateau).forEach(([zid, zone]) => {
      const z = { ...GameState._defautsZone(), ...(zone || {}) };
      if (!Array.isArray(z.pions)) z.pions = [];
      complet.plateau[zid] = z;
    });

    // Les caches volatils d'une sauvegarde ancienne sont jetés : reconstruits à la demande.
    Object.keys(complet).forEach(cle => {
      if (GameState.estCleVolatile(cle)) delete complet[cle];
    });

    return complet;
  }

  /**
   * Reconstruit un GameState à partir d'un état nu (sauvegarde ou lien partagé).
   * @returns {{ok:boolean, state?:GameState, msg:string, reason:string}}
   */
  static deserialize(data) {
    const migration = GameState.migrer(data);
    GameState.dernierChargement = migration;
    if (!migration.ok) return migration;

    const state = new GameState();
    Object.assign(state, migration.data);
    return { ok: true, state, msg: migration.msg, reason: migration.reason };
  }

  /* ═══════════════════════════════════════════
   *  PERSISTANCE
   * ═══════════════════════════════════════════ */

  save(slot = 0) {
    const key = `${GameState.SAVE_KEY}-${slot}`;
    try {
      localStorage.setItem(key, JSON.stringify(this.serialize()));
      return { ok: true, msg: 'Partie sauvegardée.', reason: 'ok' };
    } catch (e) {
      // Safari privé, quota plein, stockage bloqué : la partie continue en mémoire.
      return {
        ok: false,
        msg: 'Sauvegarde impossible : le stockage du navigateur est indisponible ou plein. La partie continue mais ne sera pas conservée.',
        reason: e && e.name ? e.name : 'storage_error'
      };
    }
  }

  static _lireBrut(slot) {
    try {
      return localStorage.getItem(`${GameState.SAVE_KEY}-${slot}`);
    } catch (e) {
      return null;
    }
  }

  /** @returns {GameState|null} — null (jamais d'exception) si absente, illisible ou incompatible. */
  static load(slot = 0) {
    const raw = GameState._lireBrut(slot);
    if (!raw) return null;

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      GameState.dernierChargement = {
        ok: false, msg: 'Sauvegarde corrompue : impossible de la relire.', reason: 'json_invalide'
      };
      return null;
    }

    const res = GameState.deserialize(data);
    if (!res.ok) return null;
    return res.state;
  }

  /** Vrai seulement si la sauvegarde existe ET est réellement chargeable. */
  static hasSave(slot = 0) {
    const raw = GameState._lireBrut(slot);
    if (!raw) return false;
    try {
      return GameState.migrer(JSON.parse(raw)).ok;
    } catch (e) {
      return false;
    }
  }

  static deleteSave(slot = 0) {
    try {
      localStorage.removeItem(`${GameState.SAVE_KEY}-${slot}`);
      return { ok: true, msg: 'Sauvegarde effacée.', reason: 'ok' };
    } catch (e) {
      return { ok: false, msg: 'Impossible d\'effacer la sauvegarde.', reason: e && e.name ? e.name : 'storage_error' };
    }
  }

  /* ═══════════════════════════════════════════
   *  LECTURES DE PARTIE
   * ═══════════════════════════════════════════ */

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

export { PLAYER_COLORS, ETHNIES, COUT_CREATION_PION };
