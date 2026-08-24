/**
 * JORETAPO — Tests des données de jeu (data/adjacences-osm.json,
 * data/quartiers-gameplay.json).
 *
 * Ces tests décrivent des RÈGLES DE PLATEAU, pas une implémentation :
 *
 *   R1. Le plateau est un graphe non orienté : si A est voisin de B,
 *       B est voisin de A.
 *   R2. Aucune case n'est un cul-de-sac absolu : toute zone a au moins
 *       un voisin, et le plateau est d'un seul tenant.
 *   R3. Tout quartier est parcourable sans en sortir (contiguïté interne),
 *       sinon son propriétaire doit traverser l'adversaire pour circuler
 *       chez lui.
 *   R4. Tout quartier a au moins une porte d'entrée depuis l'extérieur,
 *       sinon ses points de victoire sont hors d'atteinte.
 *   R5. Les 74 zones du gameplay et les clés d'adjacence décrivent le même
 *       plateau, et chaque zone appartient à exactement un quartier.
 *
 * `getQuartierOwner` (js/game-state.js) exige l'unanimité des zones d'un
 * quartier : une seule zone injoignable suffit à rendre ses points
 * définitivement inatteignables. R2/R3/R4 verrouillent ce cas.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  test, assert, assertEqual,
  loadData, simulateGame, RACINE
} from './helpers.js';

const NB_ZONES = 74;
const NB_QUARTIERS = 15;

/** Le fichier brut, AVANT la fusion des îles faite par loadData/app.js. */
function lireAdjacencesBrutes() {
  return JSON.parse(fs.readFileSync(path.join(RACINE, 'data', 'adjacences-osm.json'), 'utf8'));
}

/** Composantes connexes d'un sous-graphe restreint à `noeuds`. */
function composantes(noeuds, voisinsDe) {
  const dans = new Set(noeuds);
  const vus = new Set();
  const out = [];
  for (const depart of noeuds) {
    if (vus.has(depart)) continue;
    const comp = [];
    const pile = [depart];
    vus.add(depart);
    while (pile.length) {
      const n = pile.pop();
      comp.push(n);
      for (const v of voisinsDe(n)) {
        if (dans.has(v) && !vus.has(v)) { vus.add(v); pile.push(v); }
      }
    }
    out.push(comp.sort());
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════
 *  R1 — Le graphe est non orienté
 * ═══════════════════════════════════════════════════════════ */

test('une adjacence est réciproque : si A liste B, B liste A', () => {
  const adj = lireAdjacencesBrutes();
  const manquants = [];
  for (const [a, voisins] of Object.entries(adj)) {
    for (const b of voisins) {
      if (!adj[b] || !adj[b].includes(a)) manquants.push(`${a} → ${b}`);
    }
  }
  assertEqual(manquants.length, 0,
    `adjacences non réciproques : ${manquants.join(', ')}`);
});

test('aucune adjacence ne désigne une zone inconnue', () => {
  const adj = lireAdjacencesBrutes();
  const connues = new Set(Object.keys(adj));
  const orphelines = [];
  for (const [a, voisins] of Object.entries(adj)) {
    voisins.forEach(b => { if (!connues.has(b)) orphelines.push(`${a} → ${b}`); });
  }
  assertEqual(orphelines.length, 0, `voisins inexistants : ${orphelines.join(', ')}`);
});

test('une zone n\'est jamais sa propre voisine et n\'apparaît qu\'une fois par liste', () => {
  const adj = lireAdjacencesBrutes();
  const fautes = [];
  for (const [a, voisins] of Object.entries(adj)) {
    if (voisins.includes(a)) fautes.push(`${a} est adjacente à elle-même`);
    if (new Set(voisins).size !== voisins.length) fautes.push(`${a} contient un doublon`);
  }
  assertEqual(fautes.length, 0, fautes.join(' ; '));
});

/* ═══════════════════════════════════════════════════════════
 *  R2 — Le plateau est d'un seul tenant
 * ═══════════════════════════════════════════════════════════ */

test('aucune zone du plateau n\'est isolée : toute zone a au moins un voisin', () => {
  const adj = lireAdjacencesBrutes();
  const isolees = Object.entries(adj).filter(([, v]) => v.length === 0).map(([z]) => z);
  assertEqual(isolees.length, 0,
    `zones sans aucune adjacence, donc injoignables par déplacement : ${isolees.join(', ')}`);
});

test('toute zone est atteignable depuis n\'importe quelle autre', () => {
  const adj = lireAdjacencesBrutes();
  const zones = Object.keys(adj);
  const comps = composantes(zones, z => adj[z] || []);
  assertEqual(comps.length, 1,
    `le plateau doit former une seule composante connexe, ${comps.length} trouvées : ` +
    comps.map(c => `[${c.length} zones : ${c.slice(0, 4).join(',')}…]`).join(' '));
  assertEqual(comps[0].length, NB_ZONES, `la composante doit couvrir les ${NB_ZONES} zones`);
});

/* ═══════════════════════════════════════════════════════════
 *  R3/R4 — Quartiers parcourables et pénétrables
 * ═══════════════════════════════════════════════════════════ */

test('chaque quartier est parcourable sans jamais en sortir', async () => {
  const { adjacences, gameplay } = await loadData();
  const scindes = [];
  gameplay.quartiers.forEach(q => {
    const interne = new Set(q.zones);
    const comps = composantes(q.zones, z => (adjacences[z] || []).filter(v => interne.has(v)));
    if (comps.length > 1) scindes.push(`${q.id} → ${comps.map(c => `[${c.join(',')}]`).join(' + ')}`);
  });
  assertEqual(scindes.length, 0,
    'un quartier scindé oblige son propriétaire à traverser un rival pour circuler chez lui : ' +
    scindes.join(' ; '));
});

test('chaque quartier possède au moins une porte d\'entrée depuis un autre quartier', async () => {
  const { adjacences, gameplay } = await loadData();
  const enclaves = [];
  gameplay.quartiers.forEach(q => {
    const interne = new Set(q.zones);
    const portes = q.zones.some(z => (adjacences[z] || []).some(v => !interne.has(v) && !!adjacences[v]));
    if (!portes) enclaves.push(q.id);
  });
  assertEqual(enclaves.length, 0,
    `quartiers hermétiques, donc jamais conquérables par un tiers : ${enclaves.join(', ')}`);
});

test('east_queens, le quartier le mieux coté, est conquérable par déplacement', async () => {
  const { adjacences, gameplay } = await loadData();
  const q = gameplay.quartiers.find(x => x.id === 'east_queens');
  assert(q, 'east_queens doit exister');
  assert(q.points >= 15, 'east_queens reste le quartier le mieux coté du plateau');

  q.zones.forEach(z => {
    assert((adjacences[z] || []).length > 0,
      `${z} appartient à east_queens (${q.points} pts) mais n'a aucun voisin : ` +
      'ses points seraient hors d\'atteinte, getQuartierOwner exigeant l\'unanimité des zones');
  });

  const interne = new Set(q.zones);
  const comps = composantes(q.zones, z => (adjacences[z] || []).filter(v => interne.has(v)));
  assertEqual(comps.length, 1, 'east_queens doit être d\'un seul tenant');
});

test('upper_manhattan est conquérable sans traverser un quartier rival', async () => {
  const { adjacences, gameplay } = await loadData();
  const q = gameplay.quartiers.find(x => x.id === 'upper_manhattan');
  assert(q, 'upper_manhattan doit exister');
  assert(q.disponible_au_lancement, 'upper_manhattan est un quartier de départ');

  const interne = new Set(q.zones);
  const comps = composantes(q.zones, z => (adjacences[z] || []).filter(v => interne.has(v)));
  assertEqual(comps.length, 1,
    'un quartier de départ doit être parcourable chez soi : ' +
    comps.map(c => `[${c.join(',')}]`).join(' + '));
});

/* ═══════════════════════════════════════════════════════════
 *  R5 — Cohérence zones / quartiers
 * ═══════════════════════════════════════════════════════════ */

test('le fichier d\'adjacences décrit exactement les zones du gameplay', async () => {
  const { gameplay } = await loadData();
  const adj = lireAdjacencesBrutes();
  const zonesJeu = Object.keys(gameplay.zones).sort();
  const zonesAdj = Object.keys(adj).sort();
  assertEqual(zonesJeu.length, NB_ZONES, `le gameplay doit décrire ${NB_ZONES} zones`);
  assertEqual(zonesAdj.join(','), zonesJeu.join(','),
    'adjacences-osm.json et quartiers-gameplay.json doivent décrire le même plateau');
});

test('chaque zone appartient à exactement un quartier', async () => {
  const { gameplay } = await loadData();
  const vu = new Map();
  const doublons = [];
  gameplay.quartiers.forEach(q => q.zones.forEach(z => {
    if (vu.has(z)) doublons.push(`${z} (${vu.get(z)} et ${q.id})`);
    vu.set(z, q.id);
  }));
  assertEqual(doublons.length, 0, `zones revendiquées par deux quartiers : ${doublons.join(', ')}`);
  assertEqual(gameplay.quartiers.length, NB_QUARTIERS, `il doit y avoir ${NB_QUARTIERS} quartiers`);

  const orphelines = Object.keys(gameplay.zones).filter(z => !vu.has(z));
  assertEqual(orphelines.length, 0,
    `zones jouables rattachées à aucun quartier : ${orphelines.join(', ')}`);

  const fantomes = [...vu.keys()].filter(z => !gameplay.zones[z]);
  assertEqual(fantomes.length, 0, `quartiers citant une zone inexistante : ${fantomes.join(', ')}`);
});

test('chaque zone porte des indices P/D/A exploitables', async () => {
  const { gameplay } = await loadData();
  const fautes = [];
  Object.entries(gameplay.zones).forEach(([zid, z]) => {
    if (typeof z.nom !== 'string' || !z.nom) fautes.push(`${zid} sans nom`);
    ['p', 'd', 'a'].forEach(k => {
      if (!Number.isInteger(z[k]) || z[k] < 1) fautes.push(`${zid}.${k} = ${z[k]}`);
    });
    if (z.facilite !== null && typeof z.facilite !== 'string') fautes.push(`${zid}.facilite invalide`);
  });
  assertEqual(fautes.length, 0, `indices de zone invalides : ${fautes.join(', ')}`);
});

test('un quartier de départ offre des privilèges, un quartier neutre n\'en offre pas', async () => {
  const { gameplay } = await loadData();
  const fautes = [];
  gameplay.quartiers.forEach(q => {
    if (q.disponible_au_lancement && !q.privileges_depart) fautes.push(`${q.id} jouable sans privilèges`);
    if (!q.disponible_au_lancement && q.privileges_depart) fautes.push(`${q.id} neutre mais avec privilèges`);
    if (!Number.isInteger(q.points) || q.points <= 0) fautes.push(`${q.id} points = ${q.points}`);
    if (!Array.isArray(q.zones) || q.zones.length === 0) fautes.push(`${q.id} sans zones`);
  });
  assertEqual(fautes.length, 0, fautes.join(' ; '));
});

/* ═══════════════════════════════════════════════════════════
 *  Îles — reliées au plateau, jamais dans le fichier d'adjacences
 * ═══════════════════════════════════════════════════════════ */

test('chaque île est reliée à au moins deux zones du plateau', async () => {
  const { adjacences, gameplay } = await loadData();
  const brut = lireAdjacencesBrutes();
  const iles = gameplay.iles || [];
  assert(iles.length > 0, 'le plateau doit compter des îles (camps de gitans)');
  iles.forEach(ile => {
    assert(!brut[ile.id],
      `${ile.id} est une île : ses adjacences vivent dans quartiers-gameplay.json, pas dans adjacences-osm.json`);
    const voisins = ile.adjacences || [];
    assert(voisins.length >= 2,
      `${ile.id} doit toucher au moins 2 zones pour qu'une traversée de gitans ait un « autre côté » (${voisins.length})`);
    voisins.forEach(z => {
      assert(brut[z], `${ile.id} pointe vers la zone inconnue ${z}`);
      assert((adjacences[z] || []).includes(ile.id),
        `après fusion, ${z} doit lister ${ile.id} en voisin`);
    });
  });
});

/* ═══════════════════════════════════════════════════════════
 *  Non-régression : le plateau reste jouable de bout en bout
 * ═══════════════════════════════════════════════════════════ */

test('une partie complète tourne sur le plateau corrigé', async () => {
  const res = await simulateGame(4, 3, { graine: 20260823 });
  assert(res && res.gs, 'simulateGame doit rendre un GameState');
});
