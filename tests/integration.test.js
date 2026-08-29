/**
 * VALIDATION CROISÉE
 * ══════════════════
 * Les neuf moteurs de règles ont été repris en parallèle, chacun par un
 * auteur différent. Les tests par module vérifient chaque moteur isolément ;
 * ce fichier vérifie ce que personne ne voit seul : la cohérence de
 * l'ensemble quand tout tourne en même temps.
 *
 * Deux volets :
 *  1. cohérence statique — toute méthode appelée d'un module à l'autre existe,
 *     tout import nommé se résout ;
 *  2. invariants de partie — des règles que l'état du jeu ne doit JAMAIS
 *     violer, contrôlées à chaque étape de l'automate sur des parties réelles.
 */

import fs from 'fs';
import path from 'path';
import { test, assert, assertEqual, loadData, simulateGame, RACINE } from './helpers.js';

const DOSSIER_JS = path.join(RACINE, 'js');
const PIONS_ARMES = new Set(['dealer', 'trafiquant']);
const TAILLE_DECK = 65;

/* ═══════════════════════════════════════════════════════════
 *  1 — Cohérence statique entre modules
 * ═══════════════════════════════════════════════════════════ */

const fichiersJs = () => fs.readdirSync(DOSSIER_JS).filter(f => f.endsWith('.js'));

test('toute méthode appelée d\'un module à l\'autre existe vraiment', async () => {
  const classes = {};
  for (const f of fichiersJs()) {
    if (f === 'app.js') continue;                 // lié au DOM, non importable en Node
    const mod = await import(path.join(DOSSIER_JS, f));
    for (const [nom, val] of Object.entries(mod)) {
      if (typeof val === 'function' && /^[A-Z]/.test(nom)) {
        classes[nom] = { fichier: f, membres: new Set(Object.getOwnPropertyNames(val)) };
      }
    }
  }
  assert(Object.keys(classes).length >= 9, 'les moteurs devraient tous exporter leur classe');

  const casses = [];
  for (const f of fichiersJs()) {
    const src = fs.readFileSync(path.join(DOSSIER_JS, f), 'utf8');
    // On retire commentaires de bloc et de ligne : ils citent des méthodes en prose.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/\b([A-Z][A-Za-z0-9_]*)\.([a-zA-Z_][A-Za-z0-9_]*)\s*\(/g)) {
      const [, cls, meth] = m;
      if (!classes[cls] || classes[cls].membres.has(meth)) continue;
      const ligne = code.slice(0, m.index).split('\n').length;
      casses.push(`${f}:${ligne} → ${cls}.${meth}() (défini dans ${classes[cls].fichier})`);
    }
  }
  assertEqual(casses.length, 0, `appel(s) inter-modules cassé(s) :\n    ${casses.join('\n    ')}`);
});

test('tout import nommé se résout', async () => {
  const manquants = [];
  for (const f of fichiersJs()) {
    const src = fs.readFileSync(path.join(DOSSIER_JS, f), 'utf8');
    for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]\.\/([^'"]+)['"]/g)) {
      const mod = await import(path.join(DOSSIER_JS, m[2]));
      for (const brut of m[1].split(',')) {
        const nom = brut.trim().split(/\s+as\s+/)[0].trim();
        if (nom && !(nom in mod)) manquants.push(`${f} importe { ${nom} } de ${m[2]}`);
      }
    }
  }
  assertEqual(manquants.length, 0, `import(s) non résolu(s) :\n    ${manquants.join('\n    ')}`);
});

/* ═══════════════════════════════════════════════════════════
 *  2 — Invariants tenus en cours de partie
 * ═══════════════════════════════════════════════════════════ */

/** Règles que l'état ne doit jamais violer. Retourne la liste des violations. */
function violations(gs, mainsDraft) {
  const out = [];
  const dire = (regle, detail) => out.push(`${regle} — ${detail}`);

  for (const [zid, z] of Object.entries(gs.plateau)) {
    const armes = (z.pions || []).filter(p => PIONS_ARMES.has(p.type));
    if (armes.length > 1) dire('EMPILEMENT', `${zid} porte ${armes.length} pions armés (spec 01:126)`);
    for (const p of z.pions || []) {
      if (p.joueur != null && !gs.joueurs[p.joueur]) dire('PION_ORPHELIN', `${zid} → joueur ${p.joueur} inexistant`);
    }
    if (z.proprietaire != null && !z.construction && !(z.pions || []).some(p => p.joueur === z.proprietaire)) {
      dire('PROPRIETAIRE_FANTOME', `${zid} appartient à ${z.proprietaire} sans y avoir ni pion ni construction`);
    }
  }

  for (const [i, j] of gs.joueurs.entries()) {
    for (const [r, v] of Object.entries(j.ressources || {})) {
      if (typeof v !== 'number') continue;
      if (v < 0) dire('RESSOURCE_NEGATIVE', `joueur ${i} : ${r} = ${v}`);
      if (!Number.isFinite(v)) dire('RESSOURCE_NON_FINIE', `joueur ${i} : ${r} = ${v}`);
    }
  }

  const maires = gs.joueurs.filter(j => j.est_maire).length;
  if (maires > 1) dire('DEUX_MAIRES', `${maires} joueurs portent est_maire`);
  if (gs.maire?.joueur_id != null && !gs.joueurs[gs.maire.joueur_id]?.est_maire) {
    dire('MAIRE_FANTOME', `gs.maire vaut ${gs.maire.joueur_id} mais ce joueur n'a pas est_maire`);
  }

  // Conservation du deck. Une carte gardée figure à la fois dans la main du
  // joueur et dans draftHands tant que le draft n'est pas clos : on compte
  // donc l'union des identifiants, pas leur somme.
  const d = gs.deck_magouille || {};
  const horsJeu = [...(d.pile || []), ...(d.defaussees || []), ...(d.retirees_du_jeu || [])];
  if (horsJeu.length) {                                  // deck initialisé (après la 1re élection)
    const detenues = gs.joueurs.flatMap(j => j.cartes_magouille || []);
    const enDraft = Object.values(mainsDraft || {}).flat();
    const uniques = new Set([...horsJeu, ...detenues, ...enDraft]);
    if (uniques.size !== TAILLE_DECK) {
      dire('DECK_PERDU', `${uniques.size} cartes distinctes au lieu de ${TAILLE_DECK}`);
    }
    const horsJeuSet = new Set(horsJeu);
    const collisions = detenues.filter(u => horsJeuSet.has(u));
    if (collisions.length) {
      dire('CARTE_EN_DEUX_LIEUX', `${collisions.length} carte(s) à la fois en main et dans le deck`);
    }
  }
  return out;
}

test('aucun invariant de partie violé, de 2 à 6 joueurs sur 35 tours', async () => {
  const data = await loadData();
  const vues = new Map();

  for (const nbJoueurs of [2, 3, 4, 5, 6]) {
    for (const graine of [1, 77, 4242]) {
      const r = await simulateGame(nbJoueurs, 35, {
        data, graine, stopOnSoftlock: true,
        surEtape: ({ gs, tm, tour, phase }) => {
          for (const v of violations(gs, tm?.draftHands)) {
            if (!vues.has(v)) vues.set(v, `${nbJoueurs}j graine ${graine}, tour ${tour}, ${phase}`);
          }
        }
      });
      assertEqual(r.softlock, null,
        `partie bloquée à ${nbJoueurs} joueurs (graine ${graine}) : ${JSON.stringify(r.softlock)}`);
    }
  }

  const liste = [...vues.entries()].map(([v, ou]) => `${v}   [1re occurrence : ${ou}]`);
  assertEqual(liste.length, 0, `invariant(s) violé(s) :\n    ${liste.join('\n    ')}`);
});

test('une partie reste gagnable : le meilleur score progresse vraiment', async () => {
  // Les ordres simulés sont aléatoires : on n'exige pas la victoire (elle
  // demande de viser l'unanimité sur un quartier), mais la courbe doit monter.
  const data = await loadData();
  const r = await simulateGame(4, 35, { data, graine: 2024, stopOnSoftlock: true });
  const points = r.gs.joueurs.map((_, i) => r.gs.getPlayerPoints(i, data.gameplay));
  const meilleur = Math.max(...points);
  assert(meilleur >= 20,
    `après 35 tours le meilleur joueur n'a que ${meilleur} points : la progression est cassée`);
  assert(points.every(p => Number.isFinite(p) && p >= 0),
    `score aberrant : ${JSON.stringify(points)}`);
});
