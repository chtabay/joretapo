/**
 * Le pilote : ce qui manquait entre le banc et la table.
 *
 * `tools/sim.mjs` mesure les regles sans jamais toucher un bouton ; les tests
 * verifient des moteurs sans DOM. Entre les deux, personne ne regardait les
 * ecrans. Trois defauts serieux y vivaient tranquillement : un ecran de vote a
 * bulletin secret entierement transparent, le bouton « Je suis X » hors cadre en
 * paysage — le seul verrou d'identite du hotseat — et une rangee d'actions dont
 * le bas ouvrait « Valider mes ordres ». Aucun ne pouvait etre vu autrement
 * qu'en ouvrant la page.
 *
 * Ce module ne fait que l'intendance : servir le depot, ouvrir un navigateur,
 * lancer une partie. Les deux instruments sont a cote : `tools/ecrans.mjs`
 * (audit de mise en page) et `tools/partie.mjs` (partie entiere, ecran par
 * ecran).
 *
 * Playwright n'est pas une dependance du depot et ne doit pas le devenir : le
 * jeu tourne sans build et `npm test` sans rien installer. Le pilote se
 * contente de le chercher, et le dit poliment s'il ne le trouve pas.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RACINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon'
};

/** Serveur statique minimal : le depot n'a pas de dependances, le pilote non plus. */
export function servir() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
      const abs = path.join(RACINE, rel);
      if (!abs.startsWith(RACINE) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        res.writeHead(404); res.end('introuvable'); return;
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs)] || 'application/octet-stream' });
      fs.createReadStream(abs).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}` }));
  });
}

/**
 * Playwright peut etre installe dans le projet ou pose ailleurs sur la machine.
 * JORETAPO_PLAYWRIGHT permet de designer la seconde. Sans lui, on ne fait pas
 * echouer le depot : on explique quoi installer.
 */
export async function chromium() {
  const pistes = [process.env.JORETAPO_PLAYWRIGHT, 'playwright', 'playwright-core'].filter(Boolean);
  for (const p of pistes) {
    try { return (await import(p)).chromium; } catch { /* piste suivante */ }
  }
  console.log(
    'Playwright est introuvable, et ce n\'est pas une dependance du depot.\n' +
    'Pour relancer cet instrument :\n' +
    '  npm i -D playwright && npx playwright install chromium\n' +
    'ou, si un Playwright existe deja sur la machine :\n' +
    '  JORETAPO_PLAYWRIGHT=/chemin/vers/playwright/index.mjs npm run ecrans');
  return null;
}

/** Les tutoriels se posent par-dessus tout : ils fausseraient chaque mesure. */
export const nettoyer = page =>
  page.evaluate(() => document.querySelectorAll('.tutorial-tip').forEach(e => e.remove()));

export const visible = async (page, sel) => {
  const e = await page.$(sel);
  return e && await e.isVisible() ? e : null;
};

/** Du menu au premier rideau : choix du nombre de joueurs, des quartiers, lancement. */
export async function nouvellePartie(page, url, nbJoueurs = 4) {
  await page.goto(`${url}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.click('#btn-new-game'); await page.waitForTimeout(200);
  await page.click('#btn-intro-start'); await page.waitForTimeout(250);
  if (nbJoueurs !== 4) { await page.click(`.nb-btn[data-nb="${nbJoueurs}"]`); await page.waitForTimeout(200); }
  await page.click('#btn-next'); await page.waitForTimeout(250);
  for (let i = 0; i < nbJoueurs; i++) {
    await page.click('.quartier-pick-btn:not([disabled])');
    await page.waitForTimeout(160);
  }
  await page.click('#btn-launch'); await page.waitForTimeout(1100);
  await page.evaluate(() => localStorage.setItem('joretapo_tutorial', 'off'));
  await nettoyer(page);
}
