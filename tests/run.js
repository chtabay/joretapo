#!/usr/bin/env node
/**
 * JORETAPO — Runner de tests maison, zéro dépendance.
 *
 *   node tests/run.js              lance tous les tests/*.test.js
 *   node tests/run.js conflict     ne lance que les fichiers contenant "conflict"
 *   node tests/run.js appro revenu  filtres multiples (OU)
 *
 * Sortie : ✓ vert / ✗ rouge / ⚠ jaune (bug connu) / – gris (ignoré),
 * puis « N tests, M échecs » et code de sortie 1 si M > 0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { __registre, __setFichierCourant } from './helpers.js';

const DOSSIER = path.dirname(fileURLToPath(import.meta.url));

/* ── Couleurs ANSI (désactivées si NO_COLOR ou sortie non-TTY) ── */
const couleursActives = !process.env.NO_COLOR && (process.stdout.isTTY || process.env.FORCE_COLOR);
const c = (code, s) => (couleursActives ? `\x1b[${code}m${s}\x1b[0m` : s);
const vert = s => c('32', s);
const rouge = s => c('31', s);
const jaune = s => c('33', s);
const gris = s => c('90', s);
const gras = s => c('1', s);
const cyan = s => c('36', s);

/* ── Découverte des fichiers de test ── */
const filtres = process.argv.slice(2).filter(a => !a.startsWith('-'));

const fichiers = fs.readdirSync(DOSSIER)
  .filter(f => f.endsWith('.test.js'))
  .filter(f => filtres.length === 0 || filtres.some(fl => f.includes(fl)))
  .sort();

if (fichiers.length === 0) {
  console.log(jaune(filtres.length
    ? `Aucun fichier de test ne correspond à « ${filtres.join(' ')} ».`
    : 'Aucun fichier tests/*.test.js trouvé.'));
  process.exit(filtres.length ? 1 : 0);
}

/* ── Chargement : chaque import enregistre ses tests via helpers.test() ── */
for (const f of fichiers) {
  __setFichierCourant(f);
  try {
    await import(pathToFileURL(path.join(DOSSIER, f)).href);
  } catch (e) {
    console.error(rouge(`✗ Impossible de charger ${f}`));
    console.error(gris(pileCourte(e)));
    process.exit(1);
  }
}
__setFichierCourant('(inconnu)');

/* ── Exécution ── */
const tests = __registre();
let echecs = 0;
let reussites = 0;
let connus = 0;
let ignores = 0;
const details = [];
let fichierAffiche = null;
const debut = Date.now();

for (const t of tests) {
  if (t.fichier !== fichierAffiche) {
    fichierAffiche = t.fichier;
    console.log(`\n${gras(cyan(fichierAffiche))}`);
  }

  if (t.ignore) {
    ignores++;
    console.log(`  ${gris('–')} ${gris(t.nom)} ${gris(`(ignoré : ${t.raison})`)}`);
    continue;
  }

  const t0 = Date.now();
  try {
    await t.fn();
    const ms = Date.now() - t0;
    if (t.connu) {
      connus++;
      console.log(`  ${jaune('⚠')} ${t.nom} ${jaune('(bug connu — toujours reproduit)')}${duree(ms)}`);
    } else {
      reussites++;
      console.log(`  ${vert('✓')} ${t.nom}${duree(ms)}`);
    }
  } catch (e) {
    const ms = Date.now() - t0;
    if (t.connu) {
      connus++;
      console.log(`  ${jaune('⚠')} ${t.nom} ${jaune('(bug connu — comportement changé, à reclasser)')}${duree(ms)}`);
      console.log(`      ${gris(premiereLigne(e))}`);
    } else {
      echecs++;
      console.log(`  ${rouge('✗')} ${t.nom}${duree(ms)}`);
      console.log(`      ${rouge(premiereLigne(e))}`);
      console.log(gris(indenter(pileCourte(e), 6)));
      details.push({ fichier: t.fichier, nom: t.nom, err: e });
    }
  }
}

/* ── Résumé ── */
const total = reussites + echecs + connus;
const secondes = ((Date.now() - debut) / 1000).toFixed(2);

console.log('');
console.log(gras('─'.repeat(56)));
if (echecs > 0) {
  console.log(rouge(gras(`${total} tests, ${echecs} échecs`)) +
    gris(` · ${reussites} ok · ${connus} bugs connus · ${ignores} ignorés · ${secondes}s`));
  console.log('');
  details.forEach(d => console.log(rouge(`  ✗ ${d.fichier} › ${d.nom}`)));
} else {
  console.log(vert(gras(`${total} tests, 0 échecs`)) +
    gris(` · ${connus} bugs connus · ${ignores} ignorés · ${secondes}s`));
}
console.log(gras('─'.repeat(56)));

process.exit(echecs ? 1 : 0);

/* ── Utilitaires d'affichage ── */

function duree(ms) {
  return ms >= 50 ? gris(` (${ms} ms)`) : '';
}

function premiereLigne(e) {
  const msg = (e && e.message) || String(e);
  return msg.split('\n').join('\n      ');
}

/** 3 premières frames utiles de la pile, hors internes Node. */
function pileCourte(e) {
  if (!e || !e.stack) return '';
  return e.stack
    .split('\n')
    .slice(1)
    .filter(l => l.includes('at ') && !l.includes('node:internal'))
    .slice(0, 3)
    .map(l => l.trim()
      .replaceAll(pathToFileURL(process.cwd()).href + '/', '')
      .replaceAll(process.cwd() + '/', ''))
    .join('\n');
}

function indenter(txt, n) {
  if (!txt) return '';
  const pad = ' '.repeat(n);
  return txt.split('\n').map(l => pad + l).join('\n');
}
