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

/* Ces quatre tests viennent d'un rapport de table : « un joueur a tenté
   d'échanger de cases une prostituée et un trafiquant, ça a planté ». Il n'y
   avait aucune exception — les deux ordres étaient refusés en silence, et le
   message accusait le mauvais pion. */

/* Les déplacements coordonnés. Remarque du concepteur après une partie : la
   règle « un pion armé par case » bloquait l'échange et la rotation. Elle ne les
   bloquait pas — c'est la résolution qui jugeait chaque entrée contre le plateau
   d'AVANT tout mouvement. Mesuré : la règle retire 18,8 % des entrées possibles
   à quatre joueurs, et dans 99,8 % de ces cas le bloqueur avait lui-même une
   sortie. */

test('deux pions d\'un même joueur peuvent échanger leurs cases', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'trafiquant', 0);
  place(gs, 'A2', 'dealer', 0);

  ConflictResolver.resolve(gs, {
    0: [move('A1', 'A2', 'trafiquant'), move('A2', 'A1', 'dealer')]
  }, adj, city);

  assert.deepEqual(gs.plateau['A1'].pions.map(p => p.type), ['dealer']);
  assert.deepEqual(gs.plateau['A2'].pions.map(p => p.type), ['trafiquant']);
});

test('une chaîne de déplacements avance si sa tête se libère', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'trafiquant', 0);
  place(gs, 'A2', 'dealer', 0);   /* B1 est libre : la tête de chaîne */

  ConflictResolver.resolve(gs, {
    0: [move('A1', 'A2', 'trafiquant'), move('A2', 'B1', 'dealer')]
  }, adj, city);

  assert.equal(gs.plateau['A1'].pions.length, 0, 'la queue part');
  assert.deepEqual(gs.plateau['A2'].pions.map(p => p.type), ['trafiquant']);
  assert.deepEqual(gs.plateau['B1'].pions.map(p => p.type), ['dealer']);
});

test('une chaîne dont la tête est bloquée ne bouge pas du tout', async () => {
  /* Sinon le joueur croit avoir avancé sa queue alors que sa tête est restée :
     deux pions armés sur une case, ce que trois modules interdisent. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'trafiquant', 0);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'B1', 'trafiquant', 0);   /* la tête n'a nulle part où aller */

  const log = ConflictResolver.resolve(gs, {
    0: [move('A1', 'A2', 'trafiquant'), move('A2', 'B1', 'dealer')]
  }, adj, city);

  assert.deepEqual(gs.plateau['A1'].pions.map(p => p.type), ['trafiquant']);
  assert.deepEqual(gs.plateau['A2'].pions.map(p => p.type), ['dealer']);
  assert.deepEqual(gs.plateau['B1'].pions.map(p => p.type), ['trafiquant']);
  assert.ok(log.some(l => l.type === 'warn' && /sortie n'a pas abouti/.test(l.msg)),
    'et le refus dit que c\'est la sortie qui a échoué, pas la case qui est pleine');
});

test('un ordre de sortie annulé en conflit ne libère pas sa case', async () => {
  /* Le piège payé une fois : `movedKeys` est peuplé au parsing, donc il compte
     comme parti un pion dont l'ordre sera annulé en conflit. L'entrant était
     admis quand même — deux pions armés du même joueur sur une case. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'trafiquant', 0);
  place(gs, 'A2', 'dealer', 0);
  place(gs, 'B2', 'trafiquant', 1);   /* égalité 1 contre 1 : le défenseur tient */

  ConflictResolver.resolve(gs, {
    0: [move('B1', 'B2', 'trafiquant'), move('A2', 'B1', 'dealer')]
  }, adj, city);

  const armesDeJ0 = gs.plateau['B1'].pions.filter(p => p.joueur === 0 && /dealer|trafiquant/.test(p.type));
  assert.equal(armesDeJ0.length, 1, 'un seul pion armé de J0 sur B1');
  assert.deepEqual(gs.plateau['B2'].pions.map(p => p.type), ['trafiquant'], 'B2 reste au défenseur');
});

test('une prostituée peut rejoindre son propre protecteur', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'prostituee_base', 0);
  place(gs, 'A2', 'trafiquant', 0);

  ConflictResolver.resolve(gs, { 0: [move('A1', 'A2', 'prostituee_base')] }, adj, city);

  assert.equal(gs.plateau['A2'].pions.length, 2, 'les deux cohabitent sur la case');
  assert.equal(gs.plateau['A1'].pions.length, 0, 'elle a bien quitté la sienne');
});

test('deux prostituées ne peuvent pas tenir la même case', async () => {
  /* L'appro l'interdit déjà ; le déplacement, lui, laissait passer. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'prostituee_base', 0);
  place(gs, 'A2', 'prostituee_luxe', 0);

  const log = ConflictResolver.resolve(gs, { 0: [move('A1', 'A2', 'prostituee_base')] }, adj, city);

  assert.equal(gs.plateau['A1'].pions.length, 1, 'elle reste où elle est');
  assert.ok(log.some(l => l.type === 'warn' && /prostituée/.test(l.msg)),
    'et le refus nomme la prostituée, pas un pion armé');
});

test('un refus d\'entrée nomme le pion qui bloque vraiment', async () => {
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'dealer', 0);
  place(gs, 'A2', 'trafiquant', 0);

  const log = ConflictResolver.resolve(gs, { 0: [move('A1', 'A2', 'dealer')] }, adj, city);

  const refus = log.find(l => l.type === 'warn');
  assert.ok(refus, 'un ordre refusé doit le dire');
  assert.ok(/pion armé/.test(refus.msg), 'ici c\'est bien le pion armé qui bloque');
});

test('échanger deux pions de sa propre couleur reste refusé, et le dit', async () => {
  /* La position rapportée à la table : chaque case porte déjà un pion armé et
     une prostituée, donc chaque entrée est illégale de son côté. Le refus est
     juste ; ce qui manquait, c'est de le dire. Autoriser l'échange demanderait
     de tenir un départ pour acquis avant la résolution des conflits — ce qui
     laisse passer deux pions armés sur une même case, mesuré. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'A1', 'trafiquant', 0);
  place(gs, 'A1', 'prostituee_base', 0);
  place(gs, 'A2', 'trafiquant', 0);
  place(gs, 'A2', 'prostituee_base', 0);

  const log = ConflictResolver.resolve(gs, {
    0: [move('A1', 'A2', 'prostituee_base'), move('A2', 'A1', 'trafiquant')]
  }, adj, city);

  assert.equal(gs.plateau['A1'].pions.length, 2, 'rien ne bouge');
  assert.equal(gs.plateau['A2'].pions.length, 2);
  const refus = log.filter(l => l.type === 'warn');
  assert.equal(refus.length, 2, 'les deux ordres sont refusés');
  assert.ok(refus.some(l => /prostituée/.test(l.msg)), 'l\'un pour la prostituée');
  assert.ok(refus.some(l => /pion armé/.test(l.msg)), 'l\'autre pour le pion armé');
});


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

test('on n\'entre jamais sur une case où un pion armé adverse reste debout', async () => {
  /* Le classement du défenseur ignore les pions d'un joueur qui attaque aussi la
     case. Quand un joueur y avait déjà un pion ET en envoyait un autre, personne
     n'était déclaré défenseur, personne ne fuyait — et depuis que l'égalité est
     départagée, le vainqueur entrait par-dessus : la case finissait avec un pion
     armé de chaque camp, ce que le jeu interdit partout ailleurs. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'D1', 'dealer', 1);
  gs.plateau['D1'].proprietaire = 0;      /* le drapeau est à J0, le pion à J1 */
  place(gs, 'D2', 'dealer', 0);
  place(gs, 'B1', 'dealer', 1);

  ConflictResolver.resolve(gs, {
    0: [move('D2', 'D1')],
    1: [move('B1', 'D1')]
  }, adj, city);

  const armes = gs.plateau['D1'].pions.filter(p => p.type === 'dealer' || p.type === 'trafiquant');
  assert.equal(new Set(armes.map(p => p.joueur)).size, 1,
    'une seule couleur de pion armé par case');
});

test('à égalité, le pion présent l\'emporte sur le drapeau', async () => {
  /* « Tenir la zone », c'est y avoir un pion, pas y avoir le drapeau. Une
     prostituée de l'ancien propriétaire restée sur place suffisait à ce que le
     drapeau ne suive pas le pion armé adverse : l'attaquant délogeait alors un
     défenseur bien présent, à force strictement égale. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'prostituee_base', 0);          /* le drapeau reste à J0 */
  gs.plateau['B1'].pions.push({ type: 'dealer', joueur: 1 });
  place(gs, 'A2', 'dealer', 0);

  ConflictResolver.resolve(gs, { 0: [move('A2', 'B1')] }, adj, city);

  assert.equal(holds(gs, 'B1', 1), true, 'le défenseur présent garde la zone');
  assert.equal(holds(gs, 'A2', 0), true, 'l\'assaut rebondit');
});

/* ── L'invariant, tenu au hasard ────────────────────────────────────────────
 *
 * Deux verrous du résolveur n'avaient AUCUN test : la fuite qui n'écartait que
 * les pions armés ENNEMIS, et le refus d'entrée sur une case restée tenue par un
 * adverse. Mesuré en les révertant un à un : `npm test` restait entièrement vert
 * pendant qu'un fuzz comptait 791 et 576 violations sur 30 000 résolutions. Un
 * verrou sans test est un verrou qu'un passant défait en silence.
 *
 * Ce test ne décrit pas une règle de plus : il tient celle que trois modules
 * énoncent déjà — un pion armé par case, une prostituée par case — contre tout
 * ce que la résolution peut produire.
 */

/** Générateur reproductible : un fuzz qui change à chaque exécution ne dit rien. */
function graine(n) {
  return () => {
    n |= 0; n = (n + 0x6D2B79F5) | 0;
    let t = Math.imul(n ^ (n >>> 15), 1 | n);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('aucune résolution ne laisse deux pions armés, ni deux prostituées, sur une case', async () => {
  const ZONES = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];
  const TYPES = ['dealer', 'trafiquant', 'prostituee_base', 'prostituee_luxe'];
  const EST_ARME = t => t === 'dealer' || t === 'trafiquant';
  const EST_PROST = t => t.startsWith('prostituee');
  let violations = 0, resolutions = 0;

  for (let n = 0; n < 4000; n++) {
    const r = graine(n * 7919 + 13);
    const { gs, city, adj } = await newTestGame(3);

    /* Une mise en place quelconque, mais LEGALE : c'est l'etat de depart du
       jeu, et le resolveur n'a pas a rattraper une position deja illegale. */
    ZONES.forEach(z => {
      if (r() < 0.45) {
        const t = TYPES[Math.floor(r() * TYPES.length)];
        place(gs, z, t, Math.floor(r() * 3));
        if (r() < 0.5) {
          const autre = EST_ARME(t)
            ? (r() < 0.5 ? 'prostituee_base' : 'prostituee_luxe')
            : (r() < 0.5 ? 'dealer' : 'trafiquant');
          place(gs, z, autre, Math.floor(r() * 3));
        }
      }
    });

    const ordres = { 0: [], 1: [], 2: [] };
    ZONES.forEach(z => {
      (gs.plateau[z].pions || []).forEach(p => {
        if (r() > 0.55) return;
        const voisines = adj[z] || [];
        if (!voisines.length) return;
        const to = voisines[Math.floor(r() * voisines.length)];
        ordres[p.joueur].push({ type: 'deplacer', from: z, to, pion_type: p.type,
                                eliminer: r() < 0.2 });
      });
    });

    ConflictResolver.resolve(gs, ordres, adj, city);
    resolutions++;

    ZONES.forEach(z => {
      const pions = gs.plateau[z].pions || [];
      if (pions.filter(p => EST_ARME(p.type)).length > 1) violations++;
      if (pions.filter(p => EST_PROST(p.type)).length > 1) violations++;
    });
  }

  assert.equal(violations, 0,
    `${violations} case(s) illégale(s) sur ${resolutions} résolutions`);
});

test('un pion délogé ne fuit pas sur une case où il a déjà un pion armé', async () => {
  /* D1 est sa seule issue, et elle porte déjà un de ses dealers. Il n'a donc
     pas de refuge : il est éliminé. Le contraire — fuir sur sa propre case —
     produisait deux pions armés du même joueur, ce que trois modules
     interdisent et qu'aucun test ne voyait. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'dealer', 1);       /* le défenseur */
  place(gs, 'D1', 'dealer', 1);       /* une issue, déjà tenue par lui */
  place(gs, 'B2', 'dealer', 0);       /* deux attaquants sur B1 */
  place(gs, 'A2', 'trafiquant', 0);
  place(gs, 'D2', 'dealer', 0);       /* qui attaque D1 pour couper son soutien */

  ConflictResolver.resolve(gs, {
    0: [move('B2', 'B1'), move('A2', 'B1', 'trafiquant'), move('D2', 'D1')]
  }, adj, city);

  const armesDeJ1 = z => gs.plateau[z].pions.filter(p => p.joueur === 1 && /dealer|trafiquant/.test(p.type));
  assert.equal(armesDeJ1('D1').length, 1, 'D1 ne porte qu\'un seul pion armé de J1');
  assert.equal(armesDeJ1('B1').length, 0, 'et il a bien quitté B1');
});

test('un fugitif préfère un refuge que personne ne conquiert', async () => {
  /* Les fuites s'exécutent avant que les entrées ne soient tranchées : un pion
     délogé pouvait atterrir sur la case qu'un vainqueur venait de nettoyer, et
     c'est le vainqueur qui était refusé — après avoir payé son élimination.
     Mesuré au fuzz : 442 des 3 032 éliminations payantes perdues ainsi.
     Une case convoitée reste un refuge de DERNIER recours : l'écarter tout à
     fait ferait bondir les éliminations faute de fuite de 4 421 à 6 654. */
  const { gs, city, adj } = await newTestGame(2);
  place(gs, 'B1', 'dealer', 1);   /* le délogé : A2, B2 et D1 pour fuir */

  const ou = convoitees => {
    const copie = JSON.parse(JSON.stringify(gs.plateau));
    const faux = { ...gs, plateau: copie };
    ConflictResolver._executeFlight(faux, { zone: 'B1', pid: 1, eliminateBy: null }, adj, [], convoitees);
    return ['A2', 'B2', 'D1'].find(z => copie[z].pions.some(p => p.joueur === 1)) || 'éliminé';
  };

  assert.equal(ou(new Set(['A2'])), 'B2', 'il évite la case qu\'un autre conquiert');
  assert.equal(ou(new Set(['A2', 'B2'])), 'D1', 'et la suivante aussi');
  assert.equal(ou(new Set(['A2', 'B2', 'D1'])), 'A2',
    'mais quand toutes sont convoitées, il en prend une plutôt que de mourir');
});
