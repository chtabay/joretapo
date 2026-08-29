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
import { loadToutesLesVilles } from './helpers.mjs';

/* Une passe complete par ville du catalogue. Le jour ou Toulouse arrive dans
   data/villes.json, elle passe le meme peage sans qu'on ecrive un test. */
for (const { ville, gameplay, adjacences } of loadToutesLesVilles()) {
const zoneIds = Object.keys(gameplay.zones);
const T = (nom, fn, opts) => opts ? test(`[${ville.id}] ${nom}`, opts, fn) : test(`[${ville.id}] ${nom}`, fn);

T('chaque zone d\'un quartier existe dans la table des zones', () => {
  const manquantes = [];
  gameplay.quartiers.forEach(q => {
    q.zones.forEach(z => { if (!gameplay.zones[z]) manquantes.push(`${q.id}/${z}`); });
  });
  assert.deepEqual(manquantes, []);
});

T('chaque zone appartient à exactement un quartier', () => {
  const compte = {};
  gameplay.quartiers.forEach(q => q.zones.forEach(z => { compte[z] = (compte[z] || 0) + 1; }));
  const orphelines = zoneIds.filter(z => !compte[z]);
  const partagees = Object.entries(compte).filter(([, n]) => n > 1).map(([z]) => z);
  assert.deepEqual(orphelines, [], 'zones sans quartier');
  assert.deepEqual(partagees, [], 'zones revendiquées par plusieurs quartiers');
});

T('les adjacences sont symétriques', () => {
  const asym = [];
  Object.entries(adjacences).forEach(([a, voisines]) => {
    voisines.forEach(b => { if (!(adjacences[b] || []).includes(a)) asym.push(`${a}->${b}`); });
  });
  assert.deepEqual(asym, [], 'une adjacence doit exister dans les deux sens');
});

T('les adjacences ne désignent que des zones connues', () => {
  const connues = new Set([...zoneIds, ...(gameplay.iles || []).map(i => i.id)]);
  const inconnues = new Set();
  Object.entries(adjacences).forEach(([a, voisines]) => {
    if (!connues.has(a)) inconnues.add(a);
    voisines.forEach(b => { if (!connues.has(b)) inconnues.add(b); });
  });
  assert.deepEqual([...inconnues], []);
});

T('aucune zone n\'est isolée', () => {
  const isolees = zoneIds.filter(z => !(adjacences[z] || []).length);
  assert.deepEqual(isolees, [],
    'une zone sans voisine ne peut jamais être atteinte, donc son quartier ne peut jamais être contrôlé');
});

T('aucun quartier de départ ne peut être scellé par un seul pion adverse', () => {
  /* Rapport de table : « un joueur de Bergen est bloqué par un joueur de North
     Hudson ». C'était vrai et pire que ça — Bergen n'avait qu'une zone de
     sortie, HC08, tenue par un pion armé adverse dès le tour 1 dans 200 mises
     en place sur 200. Un pion posé là enfermait le joueur dans 3 zones sur 74
     pour toute la partie. Les traversées d'eau manquaient : le générateur de
     carte relie deux zones dont les polygones passent à moins de 50 m, ce qui
     ne franchit aucun fleuve. */
  const departs = Object.entries(gameplay.quartiers)
    .filter(([, q]) => q.disponible_au_lancement)
    .map(([id, q]) => ({ id, nom: q.nom, zones: q.zones || [] }));
  const atteignables = (depuis, banni) => {
    const vus = new Set(depuis.filter(z => z !== banni));
    const file = [...vus];
    while (file.length) {
      for (const v of adjacences[file.pop()] || []) {
        if (v !== banni && !vus.has(v)) { vus.add(v); file.push(v); }
      }
    }
    return vus.size;
  };
  const SEUIL = Math.round(zoneIds.length * 0.5);
  const scelles = departs.map(q => {
    const pire = Math.min(...zoneIds.filter(z => !q.zones.includes(z))
      .map(z => atteignables(q.zones, z)));
    return { nom: q.nom, pire };
  }).filter(x => x.pire < SEUIL);
  assert.deepEqual(scelles, [],
    `retirer une seule zone ne doit pas couper un quartier de départ de la moitié du plateau (seuil ${SEUIL}/${zoneIds.length})`);
});

T('chaque quartier de départ a au moins deux zones de sortie', () => {
  const zoneDe = {};
  Object.entries(gameplay.quartiers).forEach(([qid, q]) => (q.zones || []).forEach(z => { zoneDe[z] = qid; }));
  const enclaves = Object.entries(gameplay.quartiers)
    .filter(([, q]) => q.disponible_au_lancement)
    .map(([qid, q]) => {
      const sorties = new Set((q.zones || []).flatMap(z => (adjacences[z] || []).filter(v => zoneDe[v] !== qid)));
      return { nom: q.nom, sorties: sorties.size };
    })
    .filter(x => x.sorties < 2);
  assert.deepEqual(enclaves, [],
    'une seule porte de sortie, c\'est une porte qu\'un adversaire peut fermer');
});

T('le plateau est d\'un seul tenant', () => {
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

T('les îles déclarent des voisines qui existent', () => {
  const orphelines = [];
  (gameplay.iles || []).forEach(ile => {
    (ile.adjacences || []).forEach(a => { if (!gameplay.zones[a]) orphelines.push(`${ile.id}->${a}`); });
    if (!(ile.adjacences || []).length) orphelines.push(`${ile.id} (aucune)`);
  });
  assert.deepEqual(orphelines, []);
});

T('chaque zone porte des rendements exploitables', () => {
  const invalides = Object.entries(gameplay.zones)
    .filter(([, z]) => !Number.isFinite(z.p) || !Number.isFinite(z.d) || !Number.isFinite(z.a))
    .map(([id]) => id);
  assert.deepEqual(invalides, [], 'p, d et a pilotent tous les revenus');
});

T('les quartiers de départ distribuent des privilèges complets', () => {
  const incomplets = gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .filter(q => {
      const p = q.privileges_depart;
      return !p || ['lingots', 'armes', 'doses'].some(k => !Number.isFinite(p[k]));
    })
    .map(q => q.id);
  assert.deepEqual(incomplets, []);
});

T('il y a assez de quartiers de départ pour six joueurs', () => {
  const n = gameplay.quartiers.filter(q => q.disponible_au_lancement).length;
  assert.ok(n >= 6, `seulement ${n} quartiers disponibles au lancement`);
});

T('un quartier de départ est d\'un seul tenant', () => {
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

T('un quartier de départ permet de tenir la majorité de ses zones au tour 1', async () => {
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

T('un quartier de départ ne reçoit pas plus de pions armés que de zones', () => {
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

T('un quartier de départ ne reçoit pas plus de prostituées que de zones', () => {
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


T('chaque quartier de départ a un point d\'armes à sa portée dès le tour 1', () => {
  /* On ne commande qu'aux equipements ou l'on a un pion, sur place ou juste a
     cote. Un quartier de depart sans aucun point a portee ne peut donc ni
     nourrir ses trafiquants ni creer de pion : il faudrait deja sortir, et
     sortir coute la majorite du quartier. Sur New York, Midtown etait dans ce
     cas — d'ou le peage donne au tunnel Lincoln, en MN4.

     Le marche noir d'une ile compte comme un point d'armes, a contrecoeur : il
     vend six fois le prix. Harlem n'a que lui a portee au tour 1, et c'est
     mesure — sur 120 parties simulees, il l'emporte dans 17 % d'entre elles,
     davantage que six quartiers pourvus d'un vrai equipement. Lui en donner un
     a ete essaye : Harlem tombe a 8 %, le premier combat recule du tour 4 au
     tour 8 et le taux de parties avec combat passe de 10 % a 3 %. La rarete
     etait la tension.

     La portee se mesure a partir des zones du quartier, puisque le placement
     initial y pose les pions. */
  const ARMES = new Set(['port', 'peage']);
  const pointsArmes = Object.entries(gameplay.zones)
    .filter(([, z]) => ARMES.has(z.facilite)).map(([zid]) => zid);
  (gameplay.iles || []).forEach(ile => pointsArmes.push(ile.id));

  /* Les adjacences des iles vivent dans gameplay.iles, comme au chargement. */
  const voisines = zid => {
    const base = adjacences[zid] || [];
    const ile = (gameplay.iles || []).find(i => i.id === zid);
    return ile ? [...base, ...(ile.adjacences || [])] : base;
  };
  const rives = {};
  (gameplay.iles || []).forEach(ile => {
    (ile.adjacences || []).forEach(z => { (rives[z] = rives[z] || []).push(ile.id); });
  });

  const isoles = gameplay.quartiers
    .filter(q => q.disponible_au_lancement)
    .filter(q => {
      const aPortee = new Set();
      q.zones.forEach(z => {
        aPortee.add(z);
        voisines(z).forEach(v => aPortee.add(v));
        (rives[z] || []).forEach(v => aPortee.add(v));
      });
      return !pointsArmes.some(pt => aPortee.has(pt));
    })
    .map(q => q.id);

  assert.deepEqual(isoles, [], 'ces quartiers de départ ne peuvent s\'approvisionner nulle part');
});

}
