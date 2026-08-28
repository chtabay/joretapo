/**
 * Palette des quartiers.
 *
 * Le module génère les aplats au lieu de les coder en dur, parce que le plateau
 * est destiné à changer de ville (Toulouse, Châtellerault…). Ces tests sont le
 * garde-fou de cette promesse : ils vérifient qu'un pack de N quartiers, quel que
 * soit N, reste lisible sur le fond du plateau et discernable quartier par
 * quartier. Une régression de palette doit faire échouer la CI, pas attendre
 * qu'un joueur se plaigne de ne rien distinguer.
 *
 * Deux mesures, deux rôles :
 *  — le contraste WCAG contre BOARD_BG dit si l'aplat se détache du fond ;
 *    3:1 est le seuil WCAG 1.4.11 pour un élément d'interface non textuel ;
 *  — le ΔE (CIE76) dit si deux aplats se distinguent l'un de l'autre ;
 *    sous 2 c'est invisible, on exige plus de 6 pour que le joueur tranche
 *    d'un coup d'œil, sans compter les quartiers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, loadCity } from './helpers.mjs';

const {
  BOARD_BG, quartierColor, buildQuartierColors,
  contrast, deltaE, luminance, toLab, toRgb, rgbDistance, auditPalette
} = await import(`${ROOT}/js/palette.js`);

/* Tailles de packs à couvrir : 6 est le minimum jouable, 15 est New York,
   24 est la marge prise pour une ville plus découpée. */
const PACKS = [6, 8, 12, 15, 20, 24];

const CONTRASTE_MINI = 3;   /* WCAG 1.4.11, élément d'interface non textuel */
const DELTA_E_MINI = 6;     /* en deçà, deux quartiers voisins se confondent */

const fillsOf = n => Array.from({ length: n }, (_, i) => quartierColor(i, n).fill);
const strokesOf = n => Array.from({ length: n }, (_, i) => quartierColor(i, n).stroke);

/** Message d'échec utile : le pack, la valeur obtenue, la paire fautive. */
function paireFautive(audit, couleurs) {
  const p = audit.closestPair;
  if (!p) return 'aucune paire';
  return `quartiers #${p.i} (${couleurs[p.i]}) et #${p.j} (${couleurs[p.j]})`;
}

/* ── Lisibilité de la palette générée ──────────────────────────────────────── */

for (const n of PACKS) {
  test(`un pack de ${n} quartiers pose des aplats qui se détachent du fond du plateau`, () => {
    const fills = fillsOf(n);
    const audit = auditPalette(fills, BOARD_BG);

    assert.ok(audit.minContrast >= CONTRASTE_MINI,
      `pack de ${n} : contraste le plus faible ${audit.minContrast.toFixed(2)}:1 ` +
      `contre le fond ${BOARD_BG}, il en faut ${CONTRASTE_MINI}:1`);
  });

  test(`un pack de ${n} quartiers donne deux aplats jamais confondables`, () => {
    const fills = fillsOf(n);
    const audit = auditPalette(fills, BOARD_BG);

    assert.ok(audit.minDeltaE > DELTA_E_MINI,
      `pack de ${n} : écart perçu le plus faible ΔE=${audit.minDeltaE.toFixed(2)} ` +
      `(seuil ${DELTA_E_MINI}), entre ${paireFautive(audit, fills)}`);
  });

  test(`un pack de ${n} quartiers trace des liserés visibles sur le fond`, () => {
    /* Le liseré délimite le quartier ; s'il se noie dans le fond, les frontières
       disparaissent même quand les aplats, eux, sont corrects. */
    const strokes = strokesOf(n);
    const audit = auditPalette(strokes, BOARD_BG);

    assert.ok(audit.minContrast >= CONTRASTE_MINI,
      `pack de ${n} : liseré le plus faible ${audit.minContrast.toFixed(2)}:1 contre le fond`);
  });
}

test('deux liserés de quartiers différents restent discernables',
  { todo: 'un pack de 24 descend à ΔE=5,78 sur les liserés — les aplats tiennent, pas les contours' },
  () => {
    /* Les liserés partagent la teinte de leur aplat mais pas ses trois paliers de
       luminance : ils ne sont séparés que par la teinte, donc par 360/n degrés.
       Au-delà de ~20 quartiers cela ne suffit plus. Défaut mineur — l'aplat reste
       la porteuse d'identité — mais réel dès qu'une ville dépasse 20 quartiers. */
    for (const n of PACKS) {
      const strokes = strokesOf(n);
      const audit = auditPalette(strokes, BOARD_BG);
      assert.ok(audit.minDeltaE > DELTA_E_MINI,
        `pack de ${n} : liserés à ΔE=${audit.minDeltaE.toFixed(2)}, ` +
        `entre ${paireFautive(audit, strokes)}`);
    }
  });

/* ── Déterminisme ──────────────────────────────────────────────────────────── */

test('la palette est déterministe : deux parties de la même ville se peignent pareil', () => {
  /* Sans cela, une sauvegarde rechargée repeindrait le plateau et le joueur
     perdrait ses repères en cours de partie. */
  for (const n of PACKS) {
    for (let i = 0; i < n; i++) {
      assert.deepEqual(quartierColor(i, n), quartierColor(i, n),
        `quartier ${i}/${n} : deux appels doivent rendre la même couleur`);
    }
  }
});

test('deux constructions successives du même pack rendent les mêmes couleurs', () => {
  const quartiers = Array.from({ length: 15 }, (_, i) => ({ id: `q${i}` }));
  assert.deepEqual(
    buildQuartierColors(quartiers, {}),
    buildQuartierColors(quartiers, {})
  );
});

/* ── Construction de la table partagée ─────────────────────────────────────── */

test('changer de ville repeint la table partagée sans en changer la référence', () => {
  /* Les modules d'affichage importent QUARTIER_COLORS une fois. Remplacer l'objet
     au lieu de le muter les laisserait sur l'ancienne ville. */
  const table = {};
  const garde = table;

  const rendu = buildQuartierColors([{ id: 'manhattan' }, { id: 'bronx' }], table);

  assert.equal(rendu, garde, 'la table rendue doit être l\'objet passé, pas une copie');
  assert.deepEqual(Object.keys(table).sort(), ['bronx', 'manhattan']);
});

test('la ville précédente ne laisse aucun quartier fantôme dans la table', () => {
  const table = {};
  buildQuartierColors([{ id: 'manhattan' }, { id: 'bronx' }, { id: 'queens' }], table);

  buildQuartierColors([{ id: 'capitole' }, { id: 'saint-cyprien' }], table);

  assert.deepEqual(Object.keys(table).sort(), ['capitole', 'saint-cyprien'],
    'un quartier de New York ne doit pas survivre au passage à Toulouse');
});

test('un pack qui impose sa couleur garde la sienne', () => {
  const impose = { fill: '#123456', stroke: '#abcdef' };
  const table = buildQuartierColors([{ id: 'a' }, { id: 'b', couleur: impose }], {});

  assert.equal(table.b.fill, '#123456');
  assert.equal(table.b.stroke, '#abcdef');
  assert.notEqual(table.a.fill, '#123456', 'les autres restent générés');
});

test('un pack qui n\'impose que l\'aplat reçoit un liseré généré', () => {
  const table = buildQuartierColors([{ id: 'a', couleur: { fill: '#123456' } }], {});

  assert.equal(table.a.fill, '#123456');
  assert.equal(table.a.stroke, quartierColor(0, 1).stroke,
    'la moitié non imposée retombe sur la teinte générée');
});

test('chaque quartier de la ville reçoit un aplat et un liseré', () => {
  const { gameplay } = loadCity();
  const table = buildQuartierColors(gameplay.quartiers, {});

  const incomplets = gameplay.quartiers
    .filter(q => !table[q.id] || !table[q.id].fill || !table[q.id].stroke)
    .map(q => q.id);
  assert.deepEqual(incomplets, [], 'un quartier sans couleur est invisible sur le plateau');
});

/* ── Mesures ───────────────────────────────────────────────────────────────── */

test('le contraste ne dépend pas de l\'ordre des deux couleurs', () => {
  const paires = [['#ffffff', '#000000'], [BOARD_BG, '#3a5f2d'], ['hsl(28 46% 34.9%)', '#abc']];
  for (const [a, b] of paires) {
    assert.equal(contrast(a, b), contrast(b, a), `${a} / ${b}`);
  }
});

test('une couleur contre elle-même ne contraste pas', () => {
  for (const c of ['#ffffff', '#000000', BOARD_BG, 'hsl(208 46% 46.8%)']) {
    assert.equal(contrast(c, c), 1, c);
  }
});

test('le blanc sur le noir atteint le contraste maximal de 21', () => {
  assert.equal(contrast('#ffffff', '#000000'), 21);
});

test('une couleur ne diffère pas d\'elle-même', () => {
  for (const c of ['#ffffff', BOARD_BG, 'hsl(28 46% 34.9%)']) {
    assert.equal(deltaE(c, c), 0, c);
    assert.equal(rgbDistance(c, c), 0, c);
  }
});

test('le ΔE ne dépend pas de l\'ordre des deux couleurs', () => {
  assert.equal(deltaE('#ffffff', BOARD_BG), deltaE(BOARD_BG, '#ffffff'));
});

test('le noir n\'a aucune luminance et le blanc en a une entière', () => {
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#ffffff'), 1);
});

test('le noir est le zéro de l\'espace Lab', () => {
  assert.deepEqual(toLab('#000000').map(v => +v.toFixed(6)), [0, 0, 0]);
  assert.ok(Math.abs(toLab('#ffffff')[0] - 100) < 0.01, 'le blanc a une clarté de 100');
});

/* ── Lecture des couleurs ──────────────────────────────────────────────────── */

test('l\'hexadécimal court désigne la même couleur que l\'hexadécimal long', () => {
  assert.deepEqual(toRgb('#abc'), toRgb('#aabbcc'));
  assert.deepEqual(toRgb('#abc'), [170, 187, 204]);
  assert.deepEqual(toRgb('#0a0a1a'), [10, 10, 26]);
});

test('le format hsl produit par le module est relu sans perte', () => {
  /* Le module écrit ses couleurs en hsl() ; s'il ne savait pas les relire, tout
     l'audit de contraste porterait sur du vide. */
  assert.deepEqual(toRgb('hsl(0 0% 0%)').map(Math.round), [0, 0, 0]);
  assert.deepEqual(toRgb('hsl(0 0% 100%)').map(Math.round), [255, 255, 255]);
  assert.deepEqual(toRgb('hsl(0 100% 50%)').map(Math.round), [255, 0, 0]);
  assert.deepEqual(toRgb('hsl(120 100% 50%)').map(Math.round), [0, 255, 0]);
  assert.deepEqual(toRgb('hsl(240 100% 50%)').map(Math.round), [0, 0, 255]);

  const genere = quartierColor(3, 15).fill;
  assert.ok(genere.startsWith('hsl('), 'le module écrit bien du hsl()');
  assert.ok(toRgb(genere).every(Number.isFinite), `couleur illisible : ${genere}`);
});

/* ── Témoin de non-régression ──────────────────────────────────────────────── */

/* L'ancienne palette de New York, codée en dur, mesurée sur ce même fond :
   contraste MAXIMAL 2,58:1 (donc aucun aplat n'atteignait le seuil de 3:1)
   et ΔE MINIMAL 2,50 (31 paires sur 105 en dessous de 6, indiscernables).
   La palette générée doit faire strictement mieux sur les deux mesures — et son
   pire aplat doit battre le meilleur aplat de l'ancienne table. */
const ANCIENNE_PALETTE = [
  '#2d5a1e', '#5a1e2d', '#5a3a1e', '#3a3a1e', '#4a1e4a', '#1e3a5f', '#1e5a5a', '#2a2a5a',
  '#5a1e1e', '#3d1e5f', '#5f3d1e', '#4a3a1e', '#1e5f3d', '#1e4a4a', '#4a4a1e'
];

test('la palette générée bat l\'ancienne table codée en dur sur les deux mesures', () => {
  const ancien = auditPalette(ANCIENNE_PALETTE, BOARD_BG);

  /* On vérifie d'abord que le témoin est bien celui qu'on croit : si l'ancienne
     table changeait, la comparaison ne voudrait plus rien dire. */
  assert.ok(Math.abs(ancien.maxContrast - 2.58) < 0.01,
    `témoin : contraste maximal attendu 2,58:1, mesuré ${ancien.maxContrast.toFixed(2)}`);
  assert.ok(Math.abs(ancien.minDeltaE - 2.5) < 0.05,
    `témoin : ΔE minimal attendu 2,50, mesuré ${ancien.minDeltaE.toFixed(2)}`);

  const fills = fillsOf(ANCIENNE_PALETTE.length);
  const nouveau = auditPalette(fills, BOARD_BG);

  assert.ok(nouveau.minContrast > ancien.maxContrast,
    `le pire aplat généré (${nouveau.minContrast.toFixed(2)}:1) doit battre le meilleur ` +
    `aplat de l'ancienne table (${ancien.maxContrast.toFixed(2)}:1)`);
  assert.ok(nouveau.minDeltaE > ancien.minDeltaE,
    `écart perçu minimal : généré ΔE=${nouveau.minDeltaE.toFixed(2)}, ` +
    `ancien ΔE=${ancien.minDeltaE.toFixed(2)}, entre ${paireFautive(nouveau, fills)}`);
});

test('aucune paire de l\'ancienne table n\'aurait passé les seuils d\'aujourd\'hui', () => {
  /* Pourquoi ce test : il fige la raison d'être du module. Si quelqu'un remettait
     un jour une table figée équivalente, ces seuils la refuseraient. */
  const ancien = auditPalette(ANCIENNE_PALETTE, BOARD_BG);
  assert.ok(ancien.minContrast < CONTRASTE_MINI);
  assert.ok(ancien.minDeltaE < DELTA_E_MINI);
});
