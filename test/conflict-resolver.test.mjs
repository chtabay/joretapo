/**
 * Le résolveur de conflits est la pièce la plus difficile du dépôt et la seule
 * qui décide qui gagne la partie. Il n'avait aucun test.
 *
 * Plateau : A1 — A2 — B1 — B2 — C1 — C2 (voir helpers.mjs)
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { newTestGame, place, holds, ROOT } from './helpers.mjs';

const { ConflictResolver } = await import(`${ROOT}/js/conflict-resolver.js`);

const move = (from, to, pion_type = 'dealer', extra = {}) => ({ type: 'deplacer', from, to, pion_type, ...extra });

/* ── Déplacement simple ─────────────────────────────────────────────────── */

test('un pion avance sur une zone libre adjacente', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'dealer', 0);

  ConflictResolver.resolve(gs, { 0: [move('A1', 'A2')] }, adj, city);

  assert.equal(holds(gs, 'A2', 0), true, 'le pion doit être arrivé');
  assert.equal(gs.plateau['A1'].pions.length, 0, 'et avoir quitté sa case');
  assert.equal(gs.plateau['A2'].proprietaire, 0);
});

test('un déplacement vers une zone non adjacente est refusé', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'dealer', 0);

  const log = ConflictResolver.resolve(gs, { 0: [move('A1', 'C2')] }, adj, city);

  assert.equal(holds(gs, 'A1', 0), true, 'le pion reste sur place');
  assert.ok(log.some(l => l.type === 'warn'), 'et le refus est journalisé');
});

/* ── Conflits ───────────────────────────────────────────────────────────── */

test('à forces égales, personne ne bouge', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'B2', 'dealer', 1);

  const log = ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    1: [move('B2', 'B1')]
  }, adj, city);

  assert.equal(gs.plateau['B1'].pions.length, 0, 'la zone contestée reste vide');
  assert.equal(holds(gs, 'A2', 0), true);
  assert.equal(holds(gs, 'B2', 1), true);
  assert.ok(log.some(l => l.type === 'conflict' && /gal/i.test(l.msg)), 'égalité annoncée');
});

test('un support adjacent immobile fait pencher la balance', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'A1', 'dealer', 0);   /* soutient A2, adjacent à... A2, pas à B1 */
  place(gs, 'B2', 'dealer', 1);

  /* A1 n'est pas adjacent à B1, il ne peut donc PAS soutenir l'attaque sur B1.
     Le conflit doit rester une égalité : c'est la règle d'adjacence du support. */
  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    1: [move('B2', 'B1')]
  }, adj, city);

  assert.equal(gs.plateau['B1'].pions.length, 0,
    'un pion non adjacent à la zone contestée ne soutient rien');
});

test('le défenseur en place tient face à un attaquant seul', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'dealer', 1);   /* défenseur, force 1 */
  place(gs, 'A2', 'dealer', 0);   /* attaquant, force 1 */

  ConflictResolver.resolve(gs, { 0: [move('A2', 'B1')] }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true, 'le défenseur tient');
  assert.equal(holds(gs, 'A2', 0), true, "l'attaquant est resté chez lui");
});

test('un attaquant soutenu déloge le défenseur, qui fuit par le carrefour', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'dealer', 1);   /* défenseur : 1 */
  place(gs, 'A2', 'dealer', 0);   /* attaquant : 1 */
  place(gs, 'B2', 'dealer', 0);   /* adjacent à B1, immobile -> soutient : 2 */
  /* D1 reste libre : c'est la seule issue du défenseur. */

  ConflictResolver.resolve(gs, { 0: [move('A2', 'B1')] }, adj, city);

  assert.equal(holds(gs, 'B1', 0), true, "l'attaquant a pris la zone");
  assert.equal(holds(gs, 'D1', 1), true, 'le défenseur a fui vers la seule case libre');
});

test('un défenseur délogé et encerclé est éliminé', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'dealer', 1);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'B2', 'dealer', 0);
  place(gs, 'D1', 'dealer', 0);   /* les trois voisines de B1 sont tenues */

  const log = ConflictResolver.resolve(gs, { 0: [move('A2', 'B1')] }, adj, city);

  const survit = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'].some(z => holds(gs, z, 1));
  assert.equal(survit, false, 'sans issue, le pion est perdu');
  assert.ok(log.some(l => /limin/i.test(l.msg)), "l'élimination est journalisée");
});

test('un support est coupé si la zone du supporteur est elle-même attaquée', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);   /* défenseur */
  place(gs, 'A2', 'dealer', 0);   /* attaquant */
  place(gs, 'B2', 'dealer', 0);   /* soutiendrait l'attaque... */
  place(gs, 'C1', 'dealer', 2);   /* ...mais J2 attaque B2, ce qui coupe le support */

  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    2: [move('C1', 'B2')]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true,
    'support coupé : le défenseur tient');
});

/* ── Création de pion ───────────────────────────────────────────────────── */

test('créer un pion coûte ses ressources et alimente la caisse de police', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.joueurs[0].ressources = { lingots: 100, armes: 5, doses: 0 };
  place(gs, 'A1', 'prostituee_base', 0);
  const caisse = gs.caisses.hotel_police;

  ConflictResolver.resolve(gs, {
    0: [{ type: 'creer_pion', pion_type: 'dealer', zone: 'A1' }]
  }, adj, city);

  assert.equal(holds(gs, 'A1', 0), true, 'le pion existe');
  assert.equal(gs.joueurs[0].ressources.lingots, 60);
  assert.equal(gs.joueurs[0].ressources.armes, 3);
  assert.equal(gs.caisses.hotel_police, caisse + 40);
});

test('créer un pion sans les ressources échoue sans rien débiter', async () => {
  const { gs, city, adj } = await newTestGame(2);
  gs.joueurs[0].ressources = { lingots: 10, armes: 0, doses: 0 };

  const log = ConflictResolver.resolve(gs, {
    0: [{ type: 'creer_pion', pion_type: 'dealer', zone: 'A1' }]
  }, adj, city);

  assert.equal(gs.plateau['A1'].pions.length, 0);
  assert.equal(gs.joueurs[0].ressources.lingots, 10, 'rien n\'a été débité');
  assert.ok(log.some(l => l.type === 'warn'));
});

/* ── Propriété des zones ────────────────────────────────────────────────── */

test('une zone vidée de ses pions cesse d\'appartenir à quiconque', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'dealer', 0);

  ConflictResolver.resolve(gs, { 0: [move('A1', 'A2')] }, adj, city);

  assert.equal(gs.plateau['A1'].proprietaire, null);
  assert.equal(gs.plateau['A2'].proprietaire, 0);
});
