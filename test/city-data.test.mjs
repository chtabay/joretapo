/**
 * Validation des données d'une ville.
 *
 * C'est le péage d'entrée : tout nouveau pack (Toulouse, Châtellerault…) doit
 * passer ces vérifications avant d'être jouable. Elles sont écrites contre
 * n'importe quelle ville, pas contre New York.
 *
 * QN14 est la raison d'être de ce fichier. Cette zone n'a aucune adjacence : le
 * graphe du plateau est en deux morceaux, et le quartier East Queens — 15 points,
 * l'un des trois plus chers — est arithmétiquement inatteignable puisque le
 * contrôle exige toutes ses zones. Personne ne s'en est aperçu en 42 commits,
 * parce que rien ne regardait les données.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCity } from './helpers.mjs';

const { gameplay, adjacences } = loadCity();
const zoneIds = Object.keys(gameplay.zones);

test('chaque zone d\'un quartier existe dans la table des zones', () => {
  const manquantes = [];
  gameplay.quartiers.forEach(q => {
    q.zones.forEach(z => { if (!gameplay.zones[z]) manquantes.push(`${q.id}/${z}`); });
  });
  assert.deepEqual(manquantes, []);
});

test('chaque zone appartient à exactement un quartier', () => {
  const compte = {};
  gameplay.quartiers.forEach(q => q.zones.forEach(z => { compte[z] = (compte[z] || 0) + 1; }));
  const orphelines = zoneIds.filter(z => !compte[z]);
  const partagees = Object.entries(compte).filter(([, n]) => n > 1).map(([z]) => z);
  assert.deepEqual(orphelines, [], 'zones sans quartier');
  assert.deepEqual(partagees, [], 'zones revendiquées par plusieurs quartiers');
});

test('les adjacences sont symétriques', () => {
  const asym = [];
  Object.entries(adjacences).forEach(([a, voisines]) => {
    voisines.forEach(b => { if (!(adjacences[b] || []).includes(a)) asym.push(`${a}->${b}`); });
  });
  assert.deepEqual(asym, [], 'une adjacence doit exister dans les deux sens');
});

test('les adjacences ne désignent que des zones connues', () => {
  const connues = new Set([...zoneIds, ...(gameplay.iles || []).map(i => i.id)]);
  const inconnues = new Set();
  Object.entries(adjacences).forEach(([a, voisines]) => {
    if (!connues.has(a)) inconnues.add(a);
    voisines.forEach(b => { if (!connues.has(b)) inconnues.add(b); });
  });
  assert.deepEqual([...inconnues], []);
});

test('aucune zone n\'est isolée', () => {
  const isolees = zoneIds.filter(z => !(adjacences[z] || []).length);
  assert.deepEqual(isolees, [],
    'une zone sans voisine ne peut jamais être atteinte, donc son quartier ne peut jamais être contrôlé');
});

test('le plateau est d\'un seul tenant', () => {
  const vus = new Set();
  const file = [zoneIds[0]];
  vus.add(zoneIds[0]);
  while (file.length) {
    const z = file.pop();
    for (const v of adjacences[z] || []) {
      if (!vus.has(v)) { vus.add(v); file.push(v); }
    }
  }
  const inaccessibles = zoneIds.filter(z => !vus.has(z));
  assert.deepEqual(inaccessibles, [],
    'toutes les zones doivent être reliées : un morceau détaché est un quartier mort');
});

test('les îles déclarent des voisines qui existent', () => {
  const orphelines = [];
  (gameplay.iles || []).forEach(ile => {
    (ile.adjacences || []).forEach(a => { if (!gameplay.zones[a]) orphelines.push(`${ile.id}->${a}`); });
    if (!(ile.adjacences || []).length) orphelines.push(`${ile.id} (aucune)`);
  });
  assert.deepEqual(orphelines, []);
});

test('chaque zone porte des rendements exploitables', () => {
  const invalides = Object.entries(gameplay.zones)
    .filter(([, z]) => !Number.isFinite(z.p) || !Number.isFinite(z.d) || !Number.isFinite(z.a))
    .map(([id]) => id);
  assert.deepEqual(invalides, [], 'p, d et a pilotent tous les revenus');
});

test('les quartiers de départ distribuent des privilèges complets', () => {
  const incomplets = gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .filter(q => {
      const p = q.privileges_depart;
      return !p || ['lingots', 'armes', 'doses'].some(k => !Number.isFinite(p[k]));
    })
    .map(q => q.id);
  assert.deepEqual(incomplets, []);
});

test('il y a assez de quartiers de départ pour six joueurs', () => {
  const n = gameplay.quartiers.filter(q => q.disponible_au_lancement).length;
  assert.ok(n >= 6, `seulement ${n} quartiers disponibles au lancement`);
});

test('un quartier de départ est d\'un seul tenant', () => {
  /* Un quartier en morceaux ne peut pas se défendre : ses zones ne se soutiennent
     pas entre elles, et le joueur y démarre coupé en deux. */
  const morceles = [];
  gameplay.quartiers.forEach(q => {
    const dans = new Set(q.zones);
    const vus = new Set([q.zones[0]]);
    const file = [q.zones[0]];
    while (file.length) {
      const z = file.pop();
      for (const v of adjacences[z] || []) {
        if (dans.has(v) && !vus.has(v)) { vus.add(v); file.push(v); }
      }
    }
    if (vus.size !== q.zones.length) morceles.push(`${q.id} (${vus.size}/${q.zones.length})`);
  });
  assert.deepEqual(morceles, []);
});

test('un quartier de départ permet de tenir la majorité de ses zones au tour 1', async () => {
  /* Règle de conception pour tout pack de ville. Le contrôle d'un quartier se fait
     à la majorité stricte : un quartier de depart dont les pions initiaux ne
     peuvent pas couvrir plus de la moitie des zones ne rapporte rien au tour 1,
     et son libelle de points devient une contre-indication. C'est ce qui rendait
     les quartiers a 9 et 15 points strictement moins bons que ceux a 6.

     Contraintes de cohabitation : un pion arme par zone, une prostituee par zone.
     Le nombre de zones distinctes couvrables vaut donc armes + prostituees. */
  const insuffisants = gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .map(q => {
      const p = q.privileges_depart || {};
      const couvrables = Math.min(
        q.zones.length,
        (p.trafiquants || 0) + (p.dealers || 0) + (p.prostituees_base || 0) + (p.prostituees_luxe || 0)
      );
      return { id: q.id, couvrables, zones: q.zones.length };
    })
    .filter(x => x.couvrables <= x.zones / 2)
    .map(x => `${x.id} (${x.couvrables}/${x.zones})`);

  assert.deepEqual(insuffisants, [],
    'ces quartiers ne peuvent pas atteindre la majorite de leurs zones avec leurs pions de depart');
});

test('un quartier de départ ne reçoit pas plus de pions armés que de zones', () => {
  /* Un seul pion arme par zone est la regle partout ailleurs — a la creation
     comme au deplacement. Un quartier de depart qui en distribue davantage force
     un empilement des le tour 1, que le joueur doit defaire avant de pouvoir
     jouer. Harlem donnait 5 pions armes pour 3 zones. */
  const surcharges = gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .map(q => {
      const p = q.privileges_depart || {};
      return { id: q.id, armes: (p.trafiquants || 0) + (p.dealers || 0), zones: q.zones.length };
    })
    .filter(x => x.armes > x.zones)
    .map(x => `${x.id} (${x.armes} pions armés pour ${x.zones} zones)`);

  assert.deepEqual(surcharges, []);
});

test('un quartier de départ ne reçoit pas plus de prostituées que de zones', () => {
  /* Meme raison : une seule prostituee par zone. */
  const surcharges = gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .map(q => {
      const p = q.privileges_depart || {};
      return { id: q.id, filles: (p.prostituees_base || 0) + (p.prostituees_luxe || 0), zones: q.zones.length };
    })
    .filter(x => x.filles > x.zones)
    .map(x => `${x.id} (${x.filles} prostituées pour ${x.zones} zones)`);

  assert.deepEqual(surcharges, []);
});
