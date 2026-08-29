/**
 * Audit de mise en page : ce que le joueur peut voir et atteindre.
 *
 * Cinq formats, cinq ecrans chacun. Ce que l'instrument sait dire :
 *
 * - un bouton hors cadre — c'est ainsi qu'on a trouve « Je suis X » sorti de
 *   l'ecran en paysage, alors qu'il est le seul verrou d'identite du hotseat ;
 * - une cible trop petite pour un doigt. Attention : la boite n'est pas la
 *   cible. Un ::after etendu agrandit la zone sensible sans changer
 *   getBoundingClientRect, et un panneau ferme garde sa boite alors qu'il n'est
 *   plus la. On mesure donc au doigt, avec elementFromPoint, sinon on repare
 *   des boutons qui n'existent pas et on rate ceux qui sont couverts ;
 * - un texte reellement coupe. scrollWidth ment sur un bouton en flex centre et
 *   compte les libelles que le media query efface : on mesure la largeur peinte
 *   avec un Range ;
 * - une feuille qui deborde sans pouvoir defiler.
 *
 * Usage : npm run ecrans        (Playwright requis, voir tools/pilote.mjs)
 */

import { chromium, servir, nouvellePartie, nettoyer, visible } from './pilote.mjs';

const AUDIT = () => {
  const W = window.innerWidth, H = window.innerHeight;

  /* Un ecran couvert par le rideau ou une revelation n'est pas un defaut : la
     moitie des boutons de la page sont derriere, c'est le principe. */
  const estVoile = t => { for (let p = t; p; p = p.parentElement)
    if (p.id === 'curtain' || /-ov$/.test(p.id || '') || /-modal$/.test(p.id || '')) return true;
    return false; };

  /* Deux questions distinctes, et la seconde etait posee a la place de la
     premiere : « la mise en page le montre-t-elle » et « le doigt l'atteint-il ».
     Un bouton pose puis recouvert repondait non a la seconde et disparaissait
     de l'audit — exactement le cas le plus grave, celui d'un bouton qui existe
     et sur lequel on ne peut pas appuyer. */
  const pose = e => {
    if (!e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = e.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    for (let p = e; p; p = p.parentElement) if (getComputedStyle(p).pointerEvents === 'none') return false;
    return true;
  };
  const auDoigt = e => {
    const r = e.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!t && (t === e || e.contains(t) || e.contains(t.parentElement));
  };
  const couverts = [];
  const vu = e => {
    if (!pose(e)) return false;
    if (auDoigt(e)) return true;
    const r = e.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    /* Le meme bouton passe sous plusieurs sondes : on ne le signale qu'une fois. */
    const cle = e.id || e.className.toString().slice(0, 36);
    if (t && !estVoile(t) && !couverts.some(c => c.el === cle)) {
      couverts.push({ el: cle, par: (t.id || t.className || t.tagName).toString().slice(0, 28) });
    }
    return false;
  };
  const dedans = e => {
    const r = e.getBoundingClientRect();
    return r.right <= W + 0.5 && r.left >= -0.5 && r.bottom <= H + 0.5 && r.top >= -0.5;
  };
  const nom = e => e.id || e.className.toString().slice(0, 36);

  const horsCadre = [];
  document.querySelectorAll('button:not([disabled]), .op-pastille, .qty-btn, .mnav-tab, .etb-share, select')
    .forEach(e => {
      if (!vu(e) || dedans(e)) return;
      const r = e.getBoundingClientRect();
      horsCadre.push({ el: nom(e), t: Math.round(r.top), b: Math.round(r.bottom),
                       l: Math.round(r.left), r: Math.round(r.right) });
    });

  const petites = [];
  document.querySelectorAll('button:not([disabled]), .mnav-tab, .op-pastille').forEach(e => {
    if (!vu(e)) return;
    const r = e.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const touche = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === e || e.contains(t)); };
    const bal = (dx, dy) => { let d = 0; for (let i = 1; i <= 44; i++) { if (!touche(cx + dx * i, cy + dy * i)) break; d = i; } return d; };
    const w = bal(-1, 0) + bal(1, 0), h = bal(0, -1) + bal(0, 1);
    if (w < 40 || h < 40) petites.push({ el: nom(e), w, h, boite: `${Math.round(r.width)}x${Math.round(r.height)}` });
  });

  const tronques = [];
  document.querySelectorAll('button, .op-pastille, .cur-nom, .rb-nom, .etb-horloge, .curtain-phase, .op-hint, .nego-sub')
    .forEach(e => {
      /* Pas `vu` ici : un libelle recouvert n'est pas une cible tactile ratee,
         et le signaler comme telle noierait les vrais boutons injoignables. */
      if (!pose(e) || !auDoigt(e)) return;
      let large = 0;
      for (const n of e.childNodes) {
        if (n.nodeType !== 3 || !n.textContent.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        large = Math.max(large, rg.getBoundingClientRect().width);
      }
      for (const f of e.children) {
        if (getComputedStyle(f).display === 'none') continue;
        large = Math.max(large, f.getBoundingClientRect().width);
      }
      if (large > e.clientWidth + 2) {
        tronques.push({ el: nom(e), peint: Math.round(large), boite: e.clientWidth,
                        txt: (e.innerText || '').trim().slice(0, 40) });
      }
    });

  const bloque = [];
  document.querySelectorAll('.op-scroll, .reveal-body, .nego-defile, .curtain-etat, .election-body').forEach(e => {
    if (!vu(e)) return;
    if (e.scrollHeight > e.clientHeight + 2 && !/auto|scroll/.test(getComputedStyle(e).overflowY)) {
      bloque.push({ el: nom(e), sh: e.scrollHeight, ch: e.clientHeight });
    }
  });

  return { horsCadre, petites, tronques, bloque, couverts, debordeH: document.documentElement.scrollWidth > W + 1 };
};

const FORMATS = [
  { nom: 'iphone-390', vp: { width: 390, height: 844 }, j: 4 },
  { nom: 'petit-360',  vp: { width: 360, height: 740 }, j: 4 },
  { nom: 'paysage',    vp: { width: 844, height: 390 }, j: 4 },
  { nom: 'six-390',    vp: { width: 390, height: 844 }, j: 6 },
  { nom: 'trois-390',  vp: { width: 390, height: 844 }, j: 3 }
];

const lance = await chromium();
if (!lance) process.exit(0);

const { srv, url } = await servir();
const nav = await lance.launch();
const sorties = process.env.JORETAPO_ECRANS_PNG || null;
let total = 0;

for (const f of FORMATS) {
  const ctx = await nav.newContext({ viewport: f.vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));

  await nouvellePartie(page, url, f.j);
  const rapport = {};
  const noter = async cle => {
    rapport[cle] = await page.evaluate(AUDIT);
    if (sorties) await page.screenshot({ path: `${sorties}/${f.nom}-${cle}.png` });
  };

  await noter('rideau');
  await page.click('#btn-curtain-go'); await page.waitForTimeout(400); await nettoyer(page);
  await noter('ordres-p1');

  /* On traverse la phase 1 pour tous les joueurs, puis la negociation, puis on
     s'arrete sur la feuille d'ordres de la phase 4 : c'est l'ecran le plus
     charge du tour, celui ou les huit actions doivent tenir. */
  for (let k = 0; k < 26; k++) {
    const m = await visible(page, '#order-modal:not(.hidden) #modal-cancel'); if (m) { await m.click(); await page.waitForTimeout(90); continue; }
    const c = await visible(page, '#btn-curtain-go'); if (c) { await c.click(); await page.waitForTimeout(220); await nettoyer(page); continue; }
    const s = await visible(page, '#btn-submit-orders'); if (s) { await s.click(); await page.waitForTimeout(220); await nettoyer(page); continue; }
    if (await visible(page, '#reveal-ov .btn-primary')) break;
  }
  await noter('revelation');
  const r = await visible(page, '#reveal-ov .btn-primary'); if (r) { await r.click(); await page.waitForTimeout(300); await nettoyer(page); }
  await noter('negociation');
  const n = await visible(page, '#btn-end-nego'); if (n) { await n.click(); await page.waitForTimeout(300); await nettoyer(page); }
  for (let k = 0; k < 26; k++) {
    const m = await visible(page, '#order-modal:not(.hidden) #modal-cancel'); if (m) { await m.click(); await page.waitForTimeout(90); continue; }
    const c = await visible(page, '#btn-curtain-go'); if (c) { await c.click(); await page.waitForTimeout(220); await nettoyer(page); continue; }
    if (await visible(page, '#btn-submit-orders')) break;
  }
  await noter('ordres-p4');

  const pbs = [];
  for (const [ecran, a] of Object.entries(rapport)) {
    if (a.debordeH) pbs.push(`${ecran} : la page deborde horizontalement`);
    a.horsCadre.forEach(x => pbs.push(`${ecran} : HORS CADRE ${x.el} (haut ${x.t} bas ${x.b} gauche ${x.l} droite ${x.r})`));
    (a.couverts || []).forEach(x => pbs.push(`${ecran} : COUVERT ${x.el} — le doigt tombe sur ${x.par}`));
    a.petites.forEach(x => pbs.push(`${ecran} : CIBLE ${x.w}x${x.h} au doigt (boite ${x.boite}) ${x.el}`));
    a.tronques.forEach(x => pbs.push(`${ecran} : TRONQUE ${x.el} ${x.boite}<${x.peint} « ${x.txt} »`));
    a.bloque.forEach(x => pbs.push(`${ecran} : DEBORDE SANS DEFILEMENT ${x.el} ${x.ch}<${x.sh}`));
  }
  total += pbs.length;
  console.log(`\n=== ${f.nom} (${f.vp.width}x${f.vp.height}, ${f.j} joueurs) ===`);
  if (!pbs.length) console.log('  rien a signaler');
  else pbs.forEach(p => console.log('  ' + p));
  if (erreurs.length) console.log('  erreurs JS :', erreurs.slice(0, 3));
  await ctx.close();
}

/* Connu et assume : la barre du haut fait 32 px, le bouton de sauvegarde ne
   peut pas y atteindre 44 px de haut sans poser une bande morte sur le plateau.
   Voir le commentaire de .etb-share dans index.html. */
console.log(`\n${total} releve(s). Le seul attendu est la cible du bouton de sauvegarde (43x35).`);
await nav.close();
srv.close();
