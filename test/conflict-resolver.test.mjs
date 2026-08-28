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

/* ── Départage des égalités ─────────────────────────────────────────────── */

test('à égalité, celui qui tient la zone la garde', async () => {
  /* On ne déloge pas sans supériorité : c'est la règle, et elle vaut aussi pour
     le propriétaire qui a conquis la zone puis en est sorti. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'dealer', 1);   /* défenseur */
  place(gs, 'A2', 'dealer', 0);

  ConflictResolver.resolve(gs, { 0: [move('A2', 'B1')] }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true);
  assert.equal(holds(gs, 'A2', 0), true, 'l\'assaut rebondit');
});

test('sur une zone libre, à force égale, celui qui engage le plus de pions l\'emporte', async () => {
  /* Les soutiens font le total, la chair fait le départage : une force obtenue
     par alliance ne vaut pas une force qu'on a payée de ses propres pions. */
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'D1', 'dealer', 0);   /* J0 engage DEUX pions sur B1 */
  place(gs, 'B2', 'dealer', 1);   /* J1 en engage un... */
  place(gs, 'D2', 'dealer', 2);   /* ...soutenu par un tiers : total 2 contre 2 */

  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1'), move('D1', 'B1')],
    1: [move('B2', 'B1')],
    2: [soutien('D2', 'B1', 1)]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 0), true, 'deux pions propres battent un pion soutenu');
});

test('une égalité parfaite laisse tout le monde sur place', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'B2', 'dealer', 1);   /* un pion chacun sur une zone libre et sans propriétaire */

  const log = ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    1: [move('B2', 'B1')]
  }, adj, city);

  assert.equal(gs.plateau['B1'].pions.length, 0);
  assert.ok(log.some(l => /Égalité parfaite/.test(l.msg)));
});

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

test('une zone conquise le reste quand on en sort', async () => {
  /* Regle changee volontairement. Une zone videe redevenait neutre, si bien qu'un
     joueur qui avancait perdait la case qu'il quittait : le territoire ne pouvait
     croitre que par l'achat de nouveaux pions. Mesure au banc d'essai avant/apres :
     points du meneur au tour 30, de 16 a 44. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'dealer', 0);

  ConflictResolver.resolve(gs, { 0: [move('A1', 'A2')] }, adj, city);

  assert.equal(gs.plateau['A1'].proprietaire, 0, 'le drapeau reste plante');
  assert.equal(gs.plateau['A2'].proprietaire, 0, 'et la nouvelle zone est prise');
});

test('une zone change de main quand un autre joueur s\'y installe', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'dealer', 0);
  ConflictResolver.resolve(gs, { 0: [move('A1', 'A2')] }, adj, city);
  assert.equal(gs.plateau['A1'].proprietaire, 0);

  /* Le pion de J0 repart vers A1 : A2 se vide mais garde le drapeau de J0. */
  ConflictResolver.resolve(gs, { 0: [move('A2', 'A1')] }, adj, city);
  assert.equal(gs.plateau['A2'].pions.length, 0, 'A2 est vide');
  assert.equal(gs.plateau['A2'].proprietaire, 0, 'mais toujours a J0');

  /* J1 vient occuper la case laissee derriere : elle bascule sans combat. */
  place(gs, 'B1', 'dealer', 1);
  ConflictResolver.resolve(gs, { 1: [move('B1', 'A2')] }, adj, city);

  assert.equal(gs.plateau['A2'].proprietaire, 1, 'occuper une zone videe la prend');
});

/* ── Soutien à un allié ─────────────────────────────────────────────────────
   La capacité d'aider quelqu'un d'autre n'existait pas : le comptage des forces
   ne créditait que le propriétaire du pion. Le panneau d'ordres l'annonçait
   pourtant. Sans elle, la phase de négociation n'a rien à négocier — dans un jeu
   de type Diplomacy, on parle parce que le soutien d'un tiers est la seule façon
   de gagner un combat qu'on ne peut pas gagner seul. */

const soutien = (from, to, beneficiaire) => ({ type: 'soutenir', from, to, beneficiaire });

test('un tiers peut soutenir un allié et faire basculer un combat', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);   /* défenseur : 1 */
  place(gs, 'A2', 'dealer', 0);   /* attaquant : 1, égalité, il perdrait seul */
  place(gs, 'D1', 'dealer', 2);   /* J2, adjacent à B1, neutre dans l'affaire */

  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    2: [soutien('D1', 'B1', 0)]   /* J2 prête sa force à J0 */
  }, adj, city);

  assert.equal(holds(gs, 'B1', 0), true, "l'allié fait passer l'attaquant à 2 contre 1");
  assert.equal(holds(gs, 'D1', 2), true, 'le soutien ne bouge pas de sa case');
});

test('sans le soutien, le même assaut échoue', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'D1', 'dealer', 2);   /* présent mais ne soutient pas */

  ConflictResolver.resolve(gs, { 0: [move('A2', 'B1')] }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true, 'le défenseur tient : la présence ne suffit pas, il faut l\'ordre');
});

test('on peut aussi soutenir un défenseur', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);   /* défenseur : 1 */
  place(gs, 'A2', 'dealer', 0);   /* attaquant : 1 */
  place(gs, 'B2', 'dealer', 0);   /* soutien passif de l'attaquant : 2 */
  place(gs, 'D1', 'dealer', 2);   /* J2 vole au secours du défenseur : 2 partout */

  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    2: [soutien('D1', 'B1', 1)]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true, 'égalité rétablie, le défenseur conserve sa zone');
});

test('un soutien est coupé si la zone du soutien est attaquée', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);   /* défenseur */
  place(gs, 'A2', 'dealer', 0);   /* attaquant */
  place(gs, 'D1', 'dealer', 2);   /* soutiendrait J0... */
  place(gs, 'D2', 'dealer', 1);   /* ...mais J1 attaque D1, ce qui coupe le soutien */

  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    1: [move('D2', 'D1')],
    2: [soutien('D1', 'B1', 0)]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true, 'soutien coupé : le défenseur tient');
});

test('on soutient un allié jusqu\'à deux zones de distance', async () => {
  /* Le soutien exigeait l'adjacence. Mesure sur 40 parties simulees : sur 529
     zones disputees par au moins deux camps, un joueur non implique avait un
     pion arme sur une zone VOISINE dans un seul cas — l'ordre de soutien, seul
     objet de la phase de negociation, etait donc quasi injouable. Aider
     deliberement porte plus loin que monter la garde. */
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);   /* défenseur : 1 */
  place(gs, 'A2', 'dealer', 0);   /* attaquant : 1 */
  place(gs, 'B2', 'dealer', 2);   /* B2 — B1 : voisin, donc à portée */
  place(gs, 'D2', 'dealer', 2);   /* D2 — D1 — B1 : deux zones, à portée aussi */

  const log = ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    2: [soutien('D2', 'B1', 0)]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 0), true, 'le soutien à deux zones fait basculer le conflit');
  assert.ok(log.some(l => /soutient/.test(l.msg)));
});

test('un soutien depuis plus de deux zones est refusé', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'C2', 'dealer', 2);   /* C2 — C1 — B2 — B1 : trois zones */

  const log = ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    2: [soutien('C2', 'B1', 0)]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true, 'le soutien lointain ne compte pas');
  assert.ok(log.some(l => l.type === 'warn' && /plus de 2 zones/.test(l.msg)));
});

test('un pion ne peut pas soutenir et se battre le même tour', async () => {
  const { gs, city, adj } = await newTestGame(3);
  place(gs, 'B1', 'dealer', 1);   /* défenseur : 1 */
  place(gs, 'A2', 'dealer', 0);   /* attaquant : 1 */
  place(gs, 'B2', 'dealer', 2);   /* unique pion de J2, adjacent à B1 */

  /* J2 soutient J0 depuis B2 — sa force ne doit être comptée qu'une fois, pas
     une fois pour le soutien explicite et une fois comme présence passive. */
  ConflictResolver.resolve(gs, {
    0: [move('A2', 'B1')],
    2: [soutien('B2', 'B1', 0)]
  }, adj, city);

  assert.equal(holds(gs, 'B1', 0), true, "J0 l'emporte 2 contre 1");
  assert.equal(gs.plateau['B1'].pions.filter(p => p.joueur === 0).length, 1,
    "un seul pion occupe la zone conquise");
});
