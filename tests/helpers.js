/**
 * JORETAPO — Harnais de tests : API commune.
 *
 * Zéro dépendance, ES modules natifs, exécuté par Node (`node tests/run.js`).
 * Les modules du jeu utilisent `fetch` et `localStorage` ; ici on lit les données
 * avec `fs.readFileSync` et on installe un `localStorage` mémoire.
 *
 * API publique (contrat stable — d'autres agents s'appuient dessus) :
 *   test(nom, fn) / test.connu(nom, fn) / test.ignore(nom, raison)
 *   assert(cond, msg)
 *   assertEqual(actuel, attendu, msg)
 *   assertClose(a, b, eps, msg)
 *   assertThrows(fn, msg)
 *   await loadData()                            -> { geo, adjacences, gameplay, cartes }
 *   await makeGame(nbJoueurs, options)          -> GameState
 *   await simulateGame(nbJoueurs, nbTours, opt) -> { gs, log, tours, ... }
 *
 * Utilitaires supplémentaires : prng(graine), RACINE, PHASE (ré-exporté).
 * Les exports préfixés `__` sont réservés au runner.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* ═══════════════════════════════════════════════════════════
 *  0 — Environnement Node : stub localStorage
 * ═══════════════════════════════════════════════════════════ */

export const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function installerLocalStorage() {
  if (globalThis.localStorage) return;
  const memoire = new Map();
  globalThis.localStorage = {
    getItem: k => (memoire.has(String(k)) ? memoire.get(String(k)) : null),
    setItem: (k, v) => { memoire.set(String(k), String(v)); },
    removeItem: k => { memoire.delete(String(k)); },
    clear: () => memoire.clear(),
    key: i => [...memoire.keys()][i] ?? null,
    get length() { return memoire.size; }
  };
}
installerLocalStorage();

/* ═══════════════════════════════════════════════════════════
 *  1 — Enregistrement des tests
 * ═══════════════════════════════════════════════════════════ */

const REGISTRE = [];
let fichierCourant = '(inconnu)';

/** Enregistre un test. `fn` peut être synchrone ou async. */
export function test(nom, fn) {
  REGISTRE.push({ nom, fn, fichier: fichierCourant, connu: false, ignore: false, raison: null });
}

/**
 * Test qui DOCUMENTE un bug connu du code actuel.
 * Il s'exécute et s'affiche en jaune, mais ne fait jamais échouer la suite :
 * son échec signale seulement que le bug a changé (ou a été corrigé →
 * le test doit alors être reclassé en `test(...)` normal).
 */
test.connu = function (nom, fn) {
  REGISTRE.push({ nom, fn, fichier: fichierCourant, connu: true, ignore: false, raison: null });
};

/** Test volontairement non exécuté (affiché en gris). */
test.ignore = function (nom, raison = 'non implémenté') {
  REGISTRE.push({ nom, fn: null, fichier: fichierCourant, connu: false, ignore: true, raison });
};

export function __registre() { return REGISTRE; }
export function __setFichierCourant(f) { fichierCourant = f; }

/* ═══════════════════════════════════════════════════════════
 *  2 — Assertions
 * ═══════════════════════════════════════════════════════════ */

export class EchecAssertion extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'EchecAssertion';
    this.assertion = true;
  }
}

function decrire(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.length} élément(s)]`;
  if (typeof v === 'object') return `{${Object.keys(v).slice(0, 6).join(', ')}}`;
  return String(v);
}

export function assert(cond, msg = 'assertion échouée') {
  if (!cond) throw new EchecAssertion(msg);
  return true;
}

export function assertEqual(actuel, attendu, msg = 'valeurs différentes') {
  const egal = Object.is(actuel, attendu);
  if (!egal) {
    throw new EchecAssertion(`${msg}\n      attendu : ${decrire(attendu)}\n      obtenu  : ${decrire(actuel)}`);
  }
  return true;
}

export function assertClose(a, b, eps = 1e-9, msg = 'valeurs trop éloignées') {
  const da = Number(a), db = Number(b);
  if (!Number.isFinite(da) || !Number.isFinite(db)) {
    throw new EchecAssertion(`${msg} — valeur non numérique (${decrire(a)} / ${decrire(b)})`);
  }
  const ecart = Math.abs(da - db);
  if (ecart > eps) {
    throw new EchecAssertion(`${msg}\n      ${da} ≉ ${db} (écart ${ecart} > ε ${eps})`);
  }
  return true;
}

/**
 * Vérifie que `fn` lève. Retourne l'erreur attrapée.
 * Si `fn` renvoie une promesse, retourne une promesse (utiliser `await`).
 */
export function assertThrows(fn, msg = "la fonction aurait dû lever une exception") {
  let resultat;
  try {
    resultat = fn();
  } catch (e) {
    return e;
  }
  if (resultat && typeof resultat.then === 'function') {
    return resultat.then(
      () => { throw new EchecAssertion(msg); },
      e => e
    );
  }
  throw new EchecAssertion(msg);
}

/* ═══════════════════════════════════════════════════════════
 *  3 — Générateur pseudo-aléatoire à graine (mulberry32)
 *      Jamais Math.random dans les tests : tout échec doit être rejouable.
 * ═══════════════════════════════════════════════════════════ */

export function prng(graine = 20260823) {
  let a = graine >>> 0;
  return function suivant() {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const entier = (rnd, n) => Math.floor(rnd() * n);
const piocher = (rnd, arr) => (arr.length ? arr[entier(rnd, arr.length)] : null);

/**
 * Remplace Math.random par le générateur à graine le temps de `fn`.
 * Le code du jeu (shuffle hotseat, ordre des joueurs, mélange du deck) appelle
 * Math.random : sans ça, aucun test ne serait reproductible.
 */
function avecHasardDeterministe(rnd, fn) {
  const original = Math.random;
  Math.random = rnd;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/* ═══════════════════════════════════════════════════════════
 *  4 — Chargement des données (équivalent Node de app.js:23-40)
 * ═══════════════════════════════════════════════════════════ */

const CHEMINS = {
  geo: 'data/quartiers-osm.geojson',
  adjacences: 'data/adjacences-osm.json',
  gameplay: 'data/quartiers-gameplay.json',
  cartes: 'data/cartes-magouille.json'
};

const cacheTexte = {};
let cacheGeo = null;

function lireJson(cle) {
  if (cacheTexte[cle] === undefined) {
    cacheTexte[cle] = fs.readFileSync(path.join(RACINE, CHEMINS[cle]), 'utf8');
  }
  return JSON.parse(cacheTexte[cle]);
}

/**
 * Charge les 4 fichiers de `data/` et reproduit EXACTEMENT la fusion des
 * adjacences des îles faite par js/app.js:31-38 — sans elle, toute île est
 * injoignable et les tests de déplacement seraient faux.
 *
 * @returns {Promise<{geo:object, adjacences:object, gameplay:object, cartes:object}>}
 */
export async function loadData() {
  if (!cacheGeo) cacheGeo = lireJson('geo'); // 3 Mo : parsé une seule fois
  const geo = cacheGeo;
  const adjacences = lireJson('adjacences');
  const gameplay = lireJson('gameplay');
  const cartes = lireJson('cartes');

  (gameplay.iles || []).forEach(ile => {
    (ile.adjacences || []).forEach(adj => {
      if (!adjacences[ile.id]) adjacences[ile.id] = [];
      if (!adjacences[ile.id].includes(adj)) adjacences[ile.id].push(adj);
      if (!adjacences[adj]) adjacences[adj] = [];
      if (!adjacences[adj].includes(ile.id)) adjacences[adj].push(ile.id);
    });
  });

  return { geo, adjacences, gameplay, cartes };
}

/* ═══════════════════════════════════════════════════════════
 *  5 — Fabrique de partie déterministe
 * ═══════════════════════════════════════════════════════════ */

const COULEURS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const ETHNIES_TEST = ['caucasien', 'afro_americain', 'asiatique', 'italien'];

/**
 * Crée un GameState initialisé, joueurs J0..Jn, quartiers attribués de façon
 * déterministe (ordre du JSON, aucun Math.random qui fuite).
 *
 * @param {number} nbJoueurs 2..6
 * @param {object} [options] { data, graine, quartiers:[id], noms:[string], ethnies:[string] }
 * @returns {Promise<import('../js/game-state.js').GameState>}
 */
export async function makeGame(nbJoueurs, options = {}) {
  if (!Number.isInteger(nbJoueurs) || nbJoueurs < 2 || nbJoueurs > 6) {
    throw new EchecAssertion(`nbJoueurs doit être un entier de 2 à 6 (reçu ${decrire(nbJoueurs)})`);
  }
  const data = options.data || await loadData();
  const { GameState } = await import('../js/game-state.js');

  const dispo = data.gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .map(q => q.id);
  const quartiers = options.quartiers || dispo.slice(0, nbJoueurs);
  if (quartiers.length < nbJoueurs) {
    throw new EchecAssertion(`pas assez de quartiers jouables (${quartiers.length}) pour ${nbJoueurs} joueurs`);
  }

  const joueurs = [];
  for (let i = 0; i < nbJoueurs; i++) {
    joueurs.push({
      nom: options.noms?.[i] || `J${i}`,
      couleur: COULEURS[i % COULEURS.length],
      ethnie: options.ethnies?.[i] || ETHNIES_TEST[i % ETHNIES_TEST.length],
      quartier_origine: quartiers[i]
    });
  }

  const config = { nb_joueurs: nbJoueurs, joueurs };
  const rnd = prng(options.graine ?? 20260823);
  return avecHasardDeterministe(rnd, () => GameState.create(config, data.gameplay));
}

/* ═══════════════════════════════════════════════════════════
 *  6 — Simulation de parties complètes
 * ═══════════════════════════════════════════════════════════ */

const EST_ARME = t => t === 'dealer' || t === 'trafiquant';
const EST_PROST = t => t === 'prostituee_base' || t === 'prostituee_luxe';

/** Zones réelles + îles où le joueur possède au moins un pion. */
function zonesDuJoueur(gs, pid) {
  return Object.entries(gs.plateau)
    .filter(([, z]) => z.pions.some(p => p.joueur === pid))
    .map(([zid]) => zid);
}

/** Pions concrets du joueur : [{ zone, idx, type }]. */
function pionsDuJoueur(gs, pid) {
  const out = [];
  Object.entries(gs.plateau).forEach(([zid, z]) => {
    z.pions.forEach((p, idx) => {
      if (p.joueur === pid && p.type !== 'flic') out.push({ zone: zid, idx, type: p.type });
    });
  });
  return out;
}

/**
 * Ordres de phase 1 (approvisionnement / recrutement / construction).
 * Aléatoires MAIS légaux : budget suivi sur toute la salve, plafonds respectés,
 * zones cibles valides — pour exercer les vrais chemins, pas les branches "warn".
 */
function genererOrdresAppro(gs, pid, data, rnd, maxOrdres, moteurs) {
  const { RevenueEngine, CONSTRUCTION_DEFS } = moteurs;
  const ordres = [];
  if (maxOrdres <= 0) return ordres;

  const joueur = gs.joueurs[pid];
  let budget = joueur.ressources.lingots;
  const points = RevenueEngine.getSupplyPoints(data.gameplay);
  const restants = {};
  points.forEach(sp => { restants[sp.zone] = { ...sp.caps }; });

  const nb = 1 + entier(rnd, maxOrdres);
  for (let i = 0; i < nb; i++) {
    const tirage = rnd();

    // 65 % — approvisionnement en doses / armes
    if (tirage < 0.65) {
      const sp = piocher(rnd, points);
      if (!sp) continue;
      const denree = rnd() < 0.5 ? 'doses' : 'armes';
      const pool = restants[sp.zone];
      const capRestante = pool[denree] ?? 0;
      if (capRestante <= 0) continue;
      let prix = denree === 'doses' ? 2 : 4;
      if (denree === 'armes' && sp.zone.startsWith('ile_')) prix = 24;
      const abordable = Math.floor(budget / prix);
      if (abordable <= 0) continue;
      const qte = Math.max(1, Math.min(capRestante === Infinity ? 5 : capRestante, abordable, 1 + entier(rnd, 6)));
      if (qte <= 0) continue;
      budget -= qte * prix;
      if (capRestante !== Infinity) pool[denree] -= qte;
      ordres.push({ type: 'approvisionner', point: sp.zone, denree, quantite: qte });
      continue;
    }

    // 20 % — recrutement d'une prostituée
    if (tirage < 0.85) {
      const sp = piocher(rnd, points.filter(p => (restants[p.zone].prost ?? 0) > 0));
      if (!sp) continue;
      const pionType = rnd() < 0.8 ? 'prostituee_base' : 'prostituee_luxe';
      const prix = pionType === 'prostituee_base' ? 40 : 80;
      if (budget < prix) continue;
      const cible = piocher(rnd, zonesDuJoueur(gs, pid).filter(zid =>
        !gs.plateau[zid].pions.some(p => EST_PROST(p.type)) &&
        !ordres.some(o => o.type === 'recruter' && o.zone_dest === zid)
      ));
      if (!cible) continue;
      budget -= prix;
      restants[sp.zone].prost -= 1;
      ordres.push({ type: 'recruter', point: sp.zone, pion_type: pionType, zone_dest: cible });
      continue;
    }

    // 15 % — construction
    const batiments = Object.keys(CONSTRUCTION_DEFS);
    const batiment = piocher(rnd, batiments);
    const def = CONSTRUCTION_DEFS[batiment];
    if (budget < def.total) continue;
    const check = RevenueEngine.canBuild(gs, pid, batiment, data.adjacences);
    if (!check.ok) continue;
    const cible = piocher(rnd, zonesDuJoueur(gs, pid).filter(zid =>
      !gs.plateau[zid].construction &&
      !zid.startsWith('ile_') &&
      !ordres.some(o => o.type === 'construire' && o.zone === zid)
    ));
    if (!cible) continue;
    budget -= def.total;
    ordres.push({ type: 'construire', zone: cible, batiment });
  }

  return ordres.slice(0, maxOrdres);
}

/**
 * Ordres de phase 4 (déplacement / création / flics).
 * Un pion concret n'est bougé qu'une fois, jamais vers une case déjà occupée
 * par un pion armé allié, jamais depuis une case inexistante.
 */
function genererOrdresDeplacement(gs, pid, data, rnd, maxOrdres) {
  const ordres = [];
  if (maxOrdres <= 0) return ordres;

  const joueur = gs.joueurs[pid];
  let lingots = joueur.ressources.lingots;
  let armes = joueur.ressources.armes;

  const dispo = pionsDuJoueur(gs, pid);
  const utilises = new Set();
  const destinationsPrises = new Set();

  const nb = 1 + entier(rnd, maxOrdres);
  for (let i = 0; i < nb; i++) {
    const tirage = rnd();

    // 70 % — déplacement
    if (tirage < 0.70) {
      const candidats = dispo.filter(p => !utilises.has(`${p.zone}:${p.idx}`));
      const pion = piocher(rnd, candidats);
      if (!pion) continue;
      const voisins = (data.adjacences[pion.zone] || []).filter(to => {
        const z = gs.plateau[to];
        if (!z) return false;
        if (destinationsPrises.has(to)) return false;
        if (z.pions.some(p => p.type === 'incorruptible')) return false;
        // ConflictResolver:80-86 refuse TOUT déplacement isolé vers une case
        // portant déjà un pion armé allié — y compris une prostituée qui
        // rejoindrait son protecteur. On s'aligne sur ce comportement pour
        // n'émettre que des ordres acceptés ; si la règle est corrigée, ce
        // filtre peut être restreint aux seuls pions armés.
        if (z.pions.some(p => EST_ARME(p.type) && p.joueur === pid)) return false;
        return true;
      });
      const to = piocher(rnd, voisins);
      if (!to) continue;
      utilises.add(`${pion.zone}:${pion.idx}`);
      destinationsPrises.add(to);
      const ordre = { type: 'deplacer', from: pion.zone, to, pion_type: pion.type };
      // Élimination payante occasionnelle (coût vérifié par le moteur)
      if (EST_ARME(pion.type) && rnd() < 0.15) ordre.eliminer = true;
      ordres.push(ordre);
      continue;
    }

    // 22 % — création de pion armé
    if (tirage < 0.92) {
      const pionType = rnd() < 0.7 ? 'dealer' : 'trafiquant';
      const cout = pionType === 'dealer' ? { l: 40, a: 2 } : { l: 80, a: 3 };
      if (lingots < cout.l || armes < cout.a) continue;
      const cible = piocher(rnd, zonesDuJoueur(gs, pid).filter(zid =>
        !gs.plateau[zid].pions.some(p => EST_ARME(p.type)) &&
        !destinationsPrises.has(zid) &&
        !ordres.some(o => o.type === 'creer_pion' && o.zone === zid)
      ));
      if (!cible) continue;
      lingots -= cout.l; armes -= cout.a;
      ordres.push({ type: 'creer_pion', zone: cible, pion_type: pionType });
      continue;
    }

    // 8 % — déploiement de flic (180 L, max 2/joueur, 7 en jeu)
    const mesFlics = Object.values(gs.plateau).flatMap(z => z.pions)
      .filter(p => p.type === 'flic' && p.joueur === pid).length;
    const totalFlics = Object.values(gs.plateau).flatMap(z => z.pions)
      .filter(p => p.type === 'flic').length;
    const dejaDemandes = ordres.filter(o => o.type === 'deployer_flic').length;
    if (lingots < 180 || mesFlics + dejaDemandes >= 2 || totalFlics + dejaDemandes >= 7) continue;
    const cible = piocher(rnd, Object.keys(gs.plateau).filter(zid => !zid.startsWith('ile_')));
    if (!cible) continue;
    lingots -= 180;
    ordres.push({ type: 'deployer_flic', zone: cible });
  }

  return ordres.slice(0, maxOrdres);
}

/**
 * Joue réellement des tours complets en pilotant TurnManager et les moteurs.
 *
 * Reproduit le pilotage de js/app.js (processAndShowReveal, processAndShowResolve,
 * renderDraftPick, renderElectionResult) mais sans DOM. Toute exception levée par
 * le code du jeu remonte telle quelle : c'est le but du harnais.
 *
 * @param {number} nbJoueurs 2..6
 * @param {number} nbTours   nombre de tours à jouer
 * @param {object} [options]
 *   graine          {number}  graine du PRNG (défaut 20260823) — rejouabilité
 *   data            {object}  résultat de loadData() (évite de re-parser)
 *   gs              {object}  GameState existant à reprendre
 *   stopOnSoftlock  {boolean} défaut true : s'arrête proprement et renseigne
 *                             `softlock` au lieu de boucler indéfiniment
 *   maxEtapes       {number}  plafond d'itérations de l'automate
 *   surEtape        {fn}      callback({ gs, tm, tour, phaseJeu, phase, etape })
 *                             appelé avant chaque étape de l'automate : permet
 *                             d'inspecter le plateau en cours de partie
 * @returns {Promise<{gs, log, tours, softlock, phasesVues, tm, data, etapes}>}
 */
export async function simulateGame(nbJoueurs, nbTours, options = {}) {
  const data = options.data || await loadData();
  const [
    { TurnManager, PHASE },
    { RevenueEngine, CONSTRUCTION_DEFS },
    { ConflictResolver },
    { MagouilleEngine },
    { ContractEngine },
    { SpecialEntities }
  ] = await Promise.all([
    import('../js/turn-manager.js'),
    import('../js/revenue-engine.js'),
    import('../js/conflict-resolver.js'),
    import('../js/magouille-engine.js'),
    import('../js/contract-engine.js'),
    import('../js/special-entities.js')
  ]);
  const moteurs = { RevenueEngine, CONSTRUCTION_DEFS };

  const graine = options.graine ?? 20260823;
  const rnd = prng(graine);
  const stopOnSoftlock = options.stopOnSoftlock !== false;
  const maxEtapes = options.maxEtapes ?? Math.max(400, nbTours * 300 + 400);

  const gs = options.gs || await makeGame(nbJoueurs, { data, graine });
  const log = [];
  const phasesVues = new Set();
  let softlock = null;
  let etapes = 0;
  let tourAtteint = gs.tour;

  const journaliser = (type, msg, pid = -1) => log.push({ pid, type, msg });

  const resultat = () => ({
    gs, log, tours: Math.max(0, tourAtteint - 1), softlock,
    phasesVues: [...phasesVues], tm: null, data, etapes, graine
  });

  const sortie = avecHasardDeterministe(rnd, () => {
    const tm = new TurnManager(gs, data.gameplay);
    tm.onChange = null; // pilotage explicite : pas de ré-entrance via _emit
    tm.onEndOfMandate = () => {
      SpecialEntities.processEndOfMandate(gs, data.gameplay)
        .forEach(m => journaliser('mandat', m));
    };
    tm.startTurn();

    while (etapes < maxEtapes) {
      etapes++;
      phasesVues.add(tm.phase);
      tourAtteint = Math.max(tourAtteint, gs.tour);
      if (options.surEtape) {
        options.surEtape({ gs, tm, tour: gs.tour, phaseJeu: gs.phase, phase: tm.phase, etape: etapes });
      }

      switch (tm.phase) {

        case PHASE.CURTAIN:
          tm.confirmCurtain();
          break;

        case PHASE.ORDERS_SUPPLY: {
          const pid = tm.currentPlayerId;
          const max = tm.maxOrdersForPhase(pid);
          tm.submitOrders(genererOrdresAppro(gs, pid, data, rnd, max, moteurs));
          break;
        }

        case PHASE.REVEAL_HARVEST: {
          // app.js:1796-1817
          ContractEngine.executeAutoContracts(gs).forEach(cl =>
            log.push({ pid: cl.contrat.joueur_a, type: cl.ok ? 'rev' : 'warn', msg: cl.msg }));
          log.push(...RevenueEngine.processSupplyOrders(gs, tm.supplyOrders, data.gameplay, data.adjacences));
          log.push(...RevenueEngine.calculateRevenues(gs, data.gameplay, data.adjacences));
          ContractEngine.tickContracts(gs).forEach(c =>
            journaliser('warn', `📜 Contrat #${c.id} expiré`));
          tm.continueFromReveal();
          break;
        }

        case PHASE.NEGOTIATION:
          tm.endNegotiation();
          break;

        case PHASE.ORDERS_MOVE: {
          const pid = tm.currentPlayerId;
          const max = tm.maxOrdersForPhase(pid);
          tm.submitOrders(genererOrdresDeplacement(gs, pid, data, rnd, max));
          break;
        }

        case PHASE.REVEAL_RESOLVE:
          // app.js:2017-2020
          log.push(...ConflictResolver.resolve(gs, tm.moveOrders, data.adjacences, data.gameplay));
          tm.continueFromReveal();
          break;

        case PHASE.TURN_END:
          if (gs.tour >= nbTours) {
            tourAtteint = gs.tour + 1;
            journaliser('sim', `Simulation terminée à la fin du tour ${gs.tour}`);
            return { fini: true, tm };
          }
          tm.nextTurn();
          break;

        case PHASE.PRE_ELECTION:
          tm.confirmPreElection();
          break;

        case PHASE.ELECTION_CURTAIN:
          tm.confirmElectionCurtain();
          break;

        case PHASE.ELECTION_VOTE: {
          const candidats = gs.joueurs.map((_, i) => i);
          tm.submitVote(piocher(rnd, candidats));
          break;
        }

        case PHASE.ELECTION_RESULT: {
          const res = tm.getElectionResults(data.gameplay);
          journaliser('election',
            res.winner === null
              ? `Élection tour ${gs.tour} : égalité, aucun maire élu`
              : `Élection tour ${gs.tour} : ${gs.joueurs[res.winner].nom} élu maire`);
          tm.applyElectionResult(res.winner);
          break;
        }

        case PHASE.DRAFT_CURTAIN:
          tm.confirmDraftCurtain();
          break;

        case PHASE.DRAFT_PICK: {
          // app.js:2208-2285
          const pid = tm.currentPlayerId;
          if (!tm.draftHands || Object.keys(tm.draftHands).length === 0) {
            if (!gs.deck_magouille.pile || gs.deck_magouille.pile.length === 0) {
              MagouilleEngine.initDeck(gs, data.cartes);
            }
            tm.setDraftHands(MagouilleEngine.draftPhase(gs, data.cartes));
          }
          const main = tm.draftHands[pid] || [];

          // L'écran de draft n'autorise la validation que si exactement 4 cartes
          // sont sélectionnées (app.js:2251 + index.html:835). Une main incomplète
          // fige donc la partie : c'est le softlock connu de la pioche.
          if (main.length < 4) {
            softlock = {
              tour: gs.tour,
              phase: tm.phase,
              joueur: pid,
              cartesEnMain: main.length,
              pile: gs.deck_magouille.pile.length,
              defaussees: gs.deck_magouille.defaussees.length,
              raison: `main de draft incomplète (${main.length}/8) : le bouton de validation exige 4 cartes sélectionnées`
            };
            journaliser('softlock', `⛔ Softlock draft tour ${gs.tour}, joueur ${pid} : ${softlock.raison}`);
            if (stopOnSoftlock) return { fini: false, tm };
          }
          const gardees = main.slice(0, Math.min(4, main.length));
          MagouilleEngine.keepCards(gs, pid, gardees);
          MagouilleEngine.discardFromDraft(gs, main, gardees);
          tm.submitDraftPick();
          break;
        }

        default:
          throw new Error(`Phase inconnue de l'automate : ${String(tm.phase)}`);
      }
    }

    softlock = softlock || {
      tour: gs.tour,
      phase: tm.phase,
      raison: `plafond de ${maxEtapes} étapes atteint sans atteindre le tour ${nbTours}`
    };
    journaliser('softlock', `⛔ ${softlock.raison}`);
    return { fini: false, tm };
  });

  const r = resultat();
  r.tm = sortie.tm;
  return r;
}
