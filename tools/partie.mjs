/**
 * Une partie entiere, ecran par ecran, du menu au vainqueur annonce.
 *
 * Le banc d'essai joue les regles ; il ne tape sur rien. Ce pilote-ci ne
 * comprend rien au jeu : il cherche le bouton qui existe et il appuie dessus.
 * C'est precisement ce qu'on veut verifier — qu'a chaque instant d'une soiree,
 * il y ait un bouton qui existe et qui fasse avancer la partie.
 *
 * Ce qu'il rapporte, et pourquoi :
 *
 * - le nombre de taps pour une soiree entiere. C'est la ressource la plus
 *   contrainte du hotseat, celle que CLAUDE.md appelle les passages de
 *   tablette ; un systeme nouveau se juge la-dessus ;
 * - le classement final, trie, avec la banniere de victoire — la fin dure du
 *   14e tour est une regle, pas une esperance ;
 * - les cartes en main apres draft, comparees a ce que l'ecran annonce ;
 * - un rechargement en pleine partie, au tour 3 : le hotseat doit reprendre par
 *   le rideau, jamais sur la feuille d'ordres de quelqu'un d'autre.
 *
 * Deux pannes du pilote lui-meme valent d'etre gardees en tete, parce qu'elles
 * se reproduiront : l'ecran de vote ne se ferme qu'en validant le bulletin, pas
 * en reselectionnant un candidat ; et le draft reconstruit sa liste a chaque
 * clic, donc les poignees d'elements se detachent entre deux selections.
 *
 * Usage : npm run partie        (Playwright requis, voir tools/pilote.mjs)
 */

import { chromium, servir, nouvellePartie, nettoyer, visible } from './pilote.mjs';

const lance = await chromium();
if (!lance) process.exit(0);

const { srv, url } = await servir();
const nav = await lance.launch();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

/* Les trois bibliotheques CDN (pako, lz-string, qrcodejs) n'ont ni SRI ni copie
   locale : hors ligne, elles echouent au chargement. C'est une fragilite connue
   du depot, pas un defaut de la partie — on la compte a part pour que le pilote
   ne crie pas au loup a chaque execution derriere un pare-feu. */
const erreurs = [], reseau = [];
const range = t => (/net::|Failed to load resource/.test(t) ? reseau : erreurs).push(t);
page.on('pageerror', e => range(e.message));
page.on('console', m => { if (m.type() === 'error') range('console: ' + m.text()); });

await nouvellePartie(page, url, 4);

const etat = () => page.evaluate(() => {
  const cle = Object.keys(localStorage).find(k => /joretapo/.test(k) && /save/.test(k));
  let s = null; try { s = JSON.parse(localStorage.getItem(cle)); } catch { /* pas encore de sauvegarde */ }
  return s ? { tour: s.tour, mphase: s.manche?.phase,
               mains: s.joueurs.map(j => (j.cartes_magouille || []).length),
               maire: s.maire?.joueur_id } : null;
});

let taps = 0, journal = [], garde = null, recharge = null;
let derniere = '', immobile = 0, drafts = 0, scrutins = 0;
const maires = [];

for (let k = 0; k < 4000; k++) {
  const e = await etat();
  if (e) {
    const cle = `T${e.tour}:${e.mphase}`;
    if (cle === derniere) {
      /* Si rien ne bouge pendant 80 tours de boucle, c'est que le pilote tourne
         a vide : mieux vaut le dire que remplir un journal de faux progres. */
      if (++immobile > 80) { journal.push(`BLOQUE en boucle sur ${cle}`); break; }
    } else { immobile = 0; derniere = cle; journal.push(cle); }
    if (e.maire != null && maires[maires.length - 1] !== e.maire) maires.push(e.maire);
  }

  const modale = await visible(page, '#order-modal:not(.hidden) #modal-cancel');
  if (modale) { await modale.click(); await page.waitForTimeout(90); continue; }

  if (await visible(page, '#turnend-ov .victory-banner')) break;

  const rideau = await visible(page, '#btn-curtain-go');
  if (rideau) { await rideau.click(); taps++; await page.waitForTimeout(140); await nettoyer(page); continue; }

  const valider = await visible(page, '#btn-submit-orders');
  if (valider) {
    if (recharge === null && e && e.tour === 3) {
      await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(700);
      await page.click('#btn-continue'); await page.waitForTimeout(800); await nettoyer(page);
      const auRideau = await page.evaluate(() => !document.getElementById('curtain').classList.contains('hidden'));
      recharge = `tour 3 -> rideau=${auRideau} phase=${(await etat())?.mphase}`;
      continue;
    }
    await valider.click(); taps++; await page.waitForTimeout(140); await nettoyer(page); continue;
  }

  const revelation = await visible(page, '#reveal-ov .btn-primary');
  if (revelation) { await revelation.click(); taps++; await page.waitForTimeout(140); await nettoyer(page); continue; }

  const nego = await visible(page, '#btn-end-nego');
  if (nego) { await nego.click(); taps++; await page.waitForTimeout(140); await nettoyer(page); continue; }

  const bilan = await visible(page, '#btn-next-turn');
  if (bilan) { await bilan.click(); taps++; await page.waitForTimeout(140); await nettoyer(page); continue; }

  const avantScrutin = await visible(page, '#pre-election-ov .btn-primary');
  if (avantScrutin) { await avantScrutin.click(); taps++; await page.waitForTimeout(140); continue; }

  /* Le bulletin avant le candidat : l'ecran de vote ne se ferme qu'en validant,
     et reselectionner un candidat a chaque passage ne vote jamais. */
  const bulletin = await visible(page, '#btn-vote-submit:not([disabled])');
  if (bulletin) { scrutins++; await bulletin.click(); taps++; await page.waitForTimeout(200); continue; }

  const candidat = await visible(page, '.vote-candidate');
  if (candidat) { await candidat.click(); taps++; await page.waitForTimeout(140); continue; }

  if (await visible(page, '.draft-card')) {
    if (garde === null) garde = await page.evaluate(() => {
      const t = document.querySelector('.election-body')?.innerText || '';
      const m = t.match(/choisissez\s+(\d+)/i); return m ? +m[1] : null;
    });
    /* La liste se reconstruit a chaque clic : on requete entre deux choix. */
    for (let i = 0; i < (garde || 4); i++) {
      const libres = await page.$$('.draft-card:not(.draft-selected)');
      if (!libres.length) break;
      await libres[0].click(); await page.waitForTimeout(80);
    }
    const ok = await visible(page, '#btn-draft-confirm:not([disabled])');
    if (ok) { drafts++; await ok.click(); taps++; await page.waitForTimeout(200); continue; }
  }

  const suite = await visible(page, '#election-ov .btn-main:not([disabled]), #election-ov .btn-primary');
  if (suite) { await suite.click(); taps++; await page.waitForTimeout(140); continue; }

  journal.push('BLOQUE : aucun bouton connu sur cet ecran');
  break;
}

const final = await etat();
const fin = await page.evaluate(() => {
  const ov = document.getElementById('turnend-ov');
  const rangs = [...document.querySelectorAll('#turnend-ov .turnend-rank')]
    .map(e => +((e.innerText.match(/(\d+)\s*\/\s*\d+/) || [])[1] ?? NaN));
  return { banniere: !!document.querySelector('#turnend-ov .victory-banner'),
           rangs, texte: ov?.innerText.replace(/\s+/g, ' ').slice(0, 160) };
});
const trie = fin.rangs.every((p, i, t) => i === 0 || t[i - 1] >= p);

console.log(`taps pour la soiree entiere : ${taps} (${(taps / (final?.tour || 1)).toFixed(1)} par tour)`);
console.log(`derniere phase atteinte     : tour ${final?.tour}, ${final?.mphase}`);
console.log(`banniere de victoire        : ${fin.banniere ? 'oui' : 'NON'}`);
console.log(`classement trie             : ${trie ? 'oui' : 'NON'} ${JSON.stringify(fin.rangs)}`);
console.log(`drafts joues / scrutins     : ${drafts} / ${scrutins}`);
console.log(`cartes en main a la fin     : ${JSON.stringify(final?.mains)} (l'ecran annonce ${garde} par draft)`);
console.log(`maires successifs           : ${JSON.stringify(maires)}`);
console.log(`rechargement en partie      : ${recharge || 'non effectue'}`);
console.log(`erreurs JS                  : ${erreurs.length ? erreurs.slice(0, 5).join(' | ') : 'aucune'}`);
console.log(`ressources injoignables     : ${reseau.length} (les CDN, si la machine est hors ligne)`);
console.log(`\n${fin.texte || ''}`);

await nav.close();
srv.close();
