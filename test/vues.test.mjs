/**
 * Le secret du hotseat.
 *
 * Ce fichier existe parce que la regle la plus chere du jeu — huit rideaux par
 * tour, 40 % de son cout en passages de tablette — etait annulee par un tap sur
 * un onglet. Une regle de secret ne se verifie pas a l'oeil : elle se teste.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { newTestGame, place, ROOT } from './helpers.mjs';

const { vueJoueurs, classementDe, quartiersDisputes } = await import(`${ROOT}/js/vues.js`);

function dote(gs, pid, r) {
  Object.assign(gs.joueurs[pid].ressources, r);
}

test('pendant une phase secrète, on ne voit ni les lingots ni les stocks des autres', async () => {
  const { gs, city } = await newTestGame(3);
  dote(gs, 0, { lingots: 500, armes: 12, doses: 7 });
  dote(gs, 1, { lingots: 40, armes: 1, doses: 0 });

  const vues = vueJoueurs(gs, city, { revele: 0 });

  assert.equal(vues[0].lingots, 500, 'celui qui tient la tablette se voit');
  assert.equal(vues[0].cache, false);
  assert.equal(vues[1].cache, true);
  assert.equal(vues[1].lingots, null, 'le voisin ne voit pas la caisse');
  assert.equal(vues[1].armes, null);
  assert.equal(vues[1].doses, null);
  assert.equal(vues[1].cartes, null);
  assert.equal(vues[1].points, null, 'les points trahissent le palier des lingots');
});

test('hors phase secrète, tout le monde voit tout', async () => {
  const { gs, city } = await newTestGame(3);
  dote(gs, 1, { lingots: 40 });

  const vues = vueJoueurs(gs, city, { revele: 'tous' });

  assert.ok(vues.every(v => v.cache === false));
  assert.equal(vues[1].lingots, 40);
});

test('le territoire reste public : il se lit déjà sur la carte', async () => {
  const { gs, city } = await newTestGame(3);
  place(gs, 'A1', 'trafiquant', 1);
  place(gs, 'A2', 'trafiquant', 1);

  const vues = vueJoueurs(gs, city, { revele: 0 });

  assert.equal(vues[1].cache, true, 'ses ressources sont bien cachées');
  assert.equal(vues[1].zones, 2, 'mais ses zones se comptent sur le plateau');
  assert.deepEqual(vues[1].quartiers.map(q => q.id), ['alpha'], 'et son quartier aussi');
});

test('une vue sans destinataire déclaré est refusée plutôt que dévoilée', async () => {
  const { gs, city } = await newTestGame(2);

  assert.throws(() => vueJoueurs(gs, city), /revele/);
  assert.throws(() => vueJoueurs(gs, city, {}), /revele/);
});

test('on ne classe pas une vue masquée', async () => {
  const { gs, city } = await newTestGame(3);

  assert.throws(() => classementDe(vueJoueurs(gs, city, { revele: 0 })), /masquee/);
  assert.doesNotThrow(() => classementDe(vueJoueurs(gs, city, { revele: 'tous' })));
});

test('le classement va du plus de points au moins', async () => {
  const { gs, city } = await newTestGame(3);
  ['A1', 'A2'].forEach(z => place(gs, z, 'trafiquant', 2));   /* J2 tient alpha */

  const rang = classementDe(vueJoueurs(gs, city, { revele: 'tous' }));

  assert.equal(rang[0].id, 2);
  assert.ok(rang[0].points >= rang[1].points);
});

test('un quartier est disputé quand il manque une zone pour la majorité, pas la moitié', async () => {
  const { gs, city } = await newTestGame(2);
  /* Alpha compte deux zones : la majorite stricte en demande deux. Une seule
     zone tenue, c'est donc a une zone de basculer. */
  place(gs, 'A1', 'trafiquant', 0);

  const d = quartiersDisputes(gs, city);

  assert.deepEqual(d.map(x => x.quartier), ['alpha']);
  assert.equal(d[0].joueur, 0);
  assert.equal(d[0].majorite, 2);
});

test('un quartier déjà tenu n\'est plus disputé', async () => {
  const { gs, city } = await newTestGame(2);
  ['A1', 'A2'].forEach(z => place(gs, z, 'trafiquant', 0));

  assert.equal(quartiersDisputes(gs, city).some(x => x.quartier === 'alpha'), false);
});

test('les vues ne touchent pas au DOM', async () => {
  const src = (await import('node:fs')).readFileSync(`${ROOT}/js/vues.js`, 'utf8');
  assert.equal(/\bdocument\./.test(src), false, 'js/vues.js doit rester pur');
});
