/**
 * Outillage de test.
 *
 * Deux partis pris.
 *
 * 1. Les tests tournent sur un plateau FICTIF minuscule, pas sur New York.
 *    C'est plus lisible — on peut tenir la topologie en tête — et ça vérifie au
 *    passage que les moteurs ne sont liés à aucune ville, ce qui est la condition
 *    pour porter le jeu sur Toulouse ou Châtellerault.
 *
 * 2. Aucune dépendance, aucune configuration. `node --test` suffit. Les moteurs
 *    ne touchent pas au DOM (vérifié module par module) ; seul game-state.js lit
 *    localStorage, pour lequel on pose un substitut en mémoire.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Substitut de localStorage — game-state.js est le seul moteur à en dépendre. */
export function installStorage() {
  if (globalThis.localStorage) return globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => { store.set(String(k), String(v)); },
    removeItem: k => { store.delete(String(k)); },
    clear: () => store.clear(),
    get length() { return store.size; },
    key: i => [...store.keys()][i] ?? null
  };
  return globalThis.localStorage;
}

export function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/** Les vraies données de New York, pour les tests qui doivent voir la vraie ville. */
export function loadCity() {
  return {
    gameplay: readJson('data/quartiers-gameplay.json'),
    adjacences: readJson('data/adjacences-osm.json')
  };
}

/* ── Plateau fictif ────────────────────────────────────────────────────────
   Quatre quartiers de deux zones, en ligne avec un embranchement en B1 :

       A1 — A2 — B1 — B2 — C1 — C2
                  |
                 D1 — D2

   Assez petit pour se tenir en tête, assez ramifié pour produire de vraies
   situations : B1 est un carrefour à trois voisines, donc un défenseur délogé
   peut y avoir — ou ne pas y avoir — une case de fuite selon ce que l'on pose. */

export const TEST_ADJ = {
  A1: ['A2'],
  A2: ['A1', 'B1'],
  B1: ['A2', 'B2', 'D1'],
  B2: ['B1', 'C1'],
  C1: ['B2', 'C2'],
  C2: ['C1'],
  D1: ['B1', 'D2'],
  D2: ['D1']
};

export function testCity() {
  const zone = (nom, p, d, a, facilite = null) => ({ nom, p, d, a, facilite });
  return {
    zones: {
      A1: zone('Alpha Un', 2, 3, 2),
      A2: zone('Alpha Deux', 2, 3, 2, 'port'),
      B1: zone('Beta Un', 3, 4, 3),
      B2: zone('Beta Deux', 3, 4, 3),
      C1: zone('Gamma Un', 4, 5, 4),
      C2: zone('Gamma Deux', 4, 5, 4),
      D1: zone('Delta Un', 3, 3, 3),
      D2: zone('Delta Deux', 3, 3, 3)
    },
    quartiers: [
      quartier('alpha', 'Alpha', ['A1', 'A2'], 6),
      quartier('beta', 'Beta', ['B1', 'B2'], 6),
      quartier('gamma', 'Gamma', ['C1', 'C2'], 6),
      quartier('delta', 'Delta', ['D1', 'D2'], 6)
    ],
    iles: []
  };
}

function quartier(id, nom, zones, points) {
  return {
    id, nom, zones, points,
    disponible_au_lancement: true,
    population_par_zone: 100000,
    privileges_depart: {
      lingots: 100, armes: 10, doses: 10,
      prostituees_base: 0, prostituees_luxe: 0, trafiquants: 1, dealers: 1
    },
    gang: { nom: `Gang ${nom}`, effet: 'actions_supplementaires', usage_unique: true, duree: 0 }
  };
}

/** Partie de test : N joueurs sur le plateau fictif, plateau vidé de ses pions. */
export async function newTestGame(nbJoueurs = 2) {
  installStorage();
  const { GameState } = await import(`${ROOT}/js/game-state.js`);
  const city = testCity();
  const ids = ['alpha', 'beta', 'gamma', 'delta'];
  const gs = GameState.create({
    joueurs: Array.from({ length: nbJoueurs }, (_, i) => ({
      nom: `J${i}`, ethnie: 'caucasien', quartier_origine: ids[i % ids.length]
    }))
  }, city);

  /* On repart d'un plateau nu : chaque test pose exactement les pions dont il a
     besoin, sinon le placement initial rend les assertions illisibles. */
  Object.values(gs.plateau).forEach(z => { z.pions = []; z.proprietaire = null; z.construction = null; });
  return { gs, city, adj: TEST_ADJ };
}

/** Pose un pion et rend la zone au joueur. */
export function place(gs, zoneId, type, joueur) {
  gs.plateau[zoneId].pions.push({ type, joueur });
  if (joueur != null) gs.plateau[zoneId].proprietaire = joueur;
  return gs.plateau[zoneId];
}

export function pionsOf(gs, zoneId) {
  return gs.plateau[zoneId].pions.map(p => `${p.type}@${p.joueur}`);
}

/** Vrai si le joueur possède un pion armé sur la zone. */
export function holds(gs, zoneId, joueur) {
  return gs.plateau[zoneId].pions.some(
    p => p.joueur === joueur && (p.type === 'dealer' || p.type === 'trafiquant')
  );
}
