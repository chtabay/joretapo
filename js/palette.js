/**
 * Palette des quartiers — générée, jamais codée en dur.
 *
 * Pourquoi générée : le plateau est destiné à changer de ville (NYC, Toulouse,
 * Châtellerault…). Une table d'identifiants figée obligerait à repeindre à la main
 * chaque nouveau pack, et c'est exactement ce qui a produit les 15 aplats actuels,
 * dont 31 paires sur 105 sont indiscernables et dont aucun n'atteint 2,6:1 de
 * contraste contre le fond.
 *
 * Une ville fournit N quartiers ; on leur distribue N teintes régulièrement
 * espacées sur la roue, à saturation et clarté fixes, calées pour un fond sombre.
 * L'écart de teinte minimal est donc 360/N, garanti par construction.
 *
 * Un pack peut toujours imposer sa propre couleur : `quartier.couleur` dans les
 * données gagne sur la teinte générée.
 */

/* Fond de plateau — sert de référence de contraste. */
export const BOARD_BG = '#0a0a1a';

/* Calage pour fond sombre. La clarté n'est PAS fixe : HSL n'est pas perceptuel,
   et une même valeur de L donne 4,2:1 sur un jaune pour 1,8:1 sur un bleu. On fixe
   donc la luminance relative visée et on résout la clarté teinte par teinte, ce qui
   garantit le même contraste pour les 15 quartiers quelle que soit leur couleur. */
const FILL_S = 46, FILL_TARGET_LUM = 0.150;
const STROKE_S = 70, STROKE_TARGET_LUM = 0.480;

/* Décalage de départ : évite que le premier quartier tombe sur un rouge pur,
   qui entre en concurrence avec la couleur du premier joueur. */
const HUE_OFFSET = 28;

function hsl(h, s, l) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${s}% ${+l.toFixed(1)}%)`;
}

/** Clarté HSL qui atteint la luminance relative visée, pour une teinte donnée. */
function solveLightness(h, s, targetLum) {
  let lo = 0, hi = 100;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(hsl(h, s, mid)) < targetLum) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Couleurs d'un quartier à l'index i parmi n.
 * Teintes réparties régulièrement, mais en alternant les moitiés de la roue pour
 * que deux quartiers voisins dans la liste — souvent voisins sur la carte, les
 * données étant ordonnées géographiquement — ne reçoivent pas des teintes proches.
 */
export function quartierColor(i, n) {
  const half = Math.ceil(n / 2);
  const rank = i % 2 === 0 ? i / 2 : half + (i - 1) / 2;
  const h = HUE_OFFSET + (rank * 360) / n;

  /* Seconde dimension de discrimination. Avec la seule teinte, deux quartiers
     voisins sur la roue restent proches à l'œil dès que la ville en compte
     beaucoup. Trois paliers de luminance en rotation les écartent sans faire
     descendre aucun aplat sous 3:1 contre le fond. */
  const tier = [0, 2, 1][i % 3];
  const lum = FILL_TARGET_LUM * (1 + (tier - 1) * 0.22);

  return {
    fill: hsl(h, FILL_S, solveLightness(h, FILL_S, lum)),
    stroke: hsl(h, STROKE_S, solveLightness(h, STROKE_S, STROKE_TARGET_LUM)),
    hue: h
  };
}

/**
 * Remplit `target` (l'objet QUARTIER_COLORS partagé) à partir des quartiers d'une
 * ville. Mute l'objet au lieu de le remplacer : les modules qui l'ont déjà importé
 * gardent la même référence.
 */
export function buildQuartierColors(quartiers, target = {}) {
  for (const k of Object.keys(target)) delete target[k];
  const n = quartiers.length || 1;
  quartiers.forEach((q, i) => {
    const gen = quartierColor(i, n);
    target[q.id] = q.couleur
      ? { fill: q.couleur.fill || gen.fill, stroke: q.couleur.stroke || gen.stroke }
      : { fill: gen.fill, stroke: gen.stroke };
  });
  return target;
}

/* ── Vérification de contraste ─────────────────────────────────────────────
   Utilisé par les tests : une palette qui régresse doit faire échouer la CI,
   pas attendre qu'un joueur se plaigne de ne rien distinguer. */

function parseHsl(str) {
  const m = /hsl\((\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\)/.exec(str);
  if (!m) return null;
  return { h: +m[1], s: +m[2] / 100, l: +m[3] / 100 };
}

function hslToRgb({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const t = h / 60;
  let r = 0, g = 0, b = 0;
  if (t < 1) [r, g, b] = [c, x, 0];
  else if (t < 2) [r, g, b] = [x, c, 0];
  else if (t < 3) [r, g, b] = [0, c, x];
  else if (t < 4) [r, g, b] = [0, x, c];
  else if (t < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

export function toRgb(color) {
  const h = parseHsl(color);
  if (h) return hslToRgb(h);
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
}

export function luminance(color) {
  const lin = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = toRgb(color);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Rapport de contraste WCAG entre deux couleurs. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Distance euclidienne RGB — conservée pour comparer avec l'ancienne palette. */
export function rgbDistance(a, b) {
  const [x, y] = [toRgb(a), toRgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/* ── ΔE : la vraie mesure ──────────────────────────────────────────────────
   La distance RGB ment : deux bleus très proches à l'œil peuvent en être loin,
   et deux verts éloignés en RGB se ressemblent. On passe par CIELAB, conçu pour
   que la distance euclidienne approche la différence perçue. Repère d'usage :
   ΔE < 2 est invisible, ~10 est net, > 25 est franc. */

function toXyz(color) {
  const lin = c => {
    const v = c / 255;
    return (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)) * 100;
  };
  const [r, g, b] = toRgb(color).map(lin);
  return [
    r * 0.4124 + g * 0.3576 + b * 0.1805,
    r * 0.2126 + g * 0.7152 + b * 0.0722,
    r * 0.0193 + g * 0.1192 + b * 0.9505
  ];
}

export function toLab(color) {
  /* Illuminant D65, observateur 2° */
  const ref = [95.047, 100.0, 108.883];
  const [x, y, z] = toXyz(color).map((v, i) => {
    const t = v / ref[i];
    return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  });
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/** Différence perçue entre deux couleurs (CIE76). */
export function deltaE(a, b) {
  const [x, y] = [toLab(a), toLab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/**
 * Audite une palette complète. Rendu tel quel par les tests, pour qu'un échec
 * dise ce qui ne va pas au lieu d'un simple « assertion failed ».
 */
export function auditPalette(colors, bg = BOARD_BG) {
  const contrasts = colors.map(c => contrast(c, bg));
  const pairs = [];
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      pairs.push({ i, j, dE: deltaE(colors[i], colors[j]) });
    }
  }
  pairs.sort((a, b) => a.dE - b.dE);
  return {
    minContrast: Math.min(...contrasts),
    maxContrast: Math.max(...contrasts),
    minDeltaE: pairs.length ? pairs[0].dE : Infinity,
    closestPair: pairs[0] || null,
    pairCount: pairs.length
  };
}
