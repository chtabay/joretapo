# Remettre un système en jeu

Ce dépôt a dérivé d'une manière très ordinaire : un développeur seul empile des
systèmes sans boucle de retour. Au moment de l'audit, **environ 40 % des règles
présentées au joueur ne produisaient aucun effet** — 15 cartes sur 65, 8 effets
de gang sur 15, 2 pouvoirs de maire sur 8. Chacun affichait un message de
réussite. Rien ne changeait.

Le coût réel n'est pas le code mort : c'est que le joueur ne peut pas apprendre
un jeu dont une partie des règles est décorative. Sa carte mentale ne converge
jamais, la partie ne devient jamais un jeu d'habileté, et une soirée devient une
corvée.

Ces systèmes ne sont pas supprimés. Ils sont **désactivés par drapeau** dans
`data/ruleset.json` : le code et les données sont intacts, le retour arrière
coûte un booléen.

---

## Le péage

Un système ne revient en jeu que s'il livre les trois choses suivantes.

### 1. Un test qui prouve que son état est *lu*

Écrire un état ne suffit pas — c'est précisément le défaut d'origine. Le test
doit vérifier qu'une **règle consulte** cet état et que le résultat en dépend.

```js
test("un blocage d'ordres empêche réellement la cible d'agir", async () => {
  const { gs, city, adj } = await newTestGame(2);
  SpecialEntities.applyGangEffect(gs, 0, 'alpha', city, { cible: 1 });

  const log = ConflictResolver.resolve(gs, { 1: [move('A1', 'A2')] }, adj, city);

  assert.equal(holds(gs, 'A2', 1), false, "l'ordre n'a pas été exécuté");
  assert.ok(log.some(l => l.type === 'warn'));
});
```

Un test qui se contente de `assert.ok(gs._blocages['ordres_1'])` ne vaut rien :
c'est exactement ce que faisait le code avant, et ça passait.

### 2. Une ligne visible dans le journal de révélation

Un effet que les autres joueurs ne voient pas ne peut pas être négocié, ni
craint, ni anticipé. Il doit apparaître dans le log rendu à tous en phase 2 ou 5,
et non seulement dans une notification vue par celui qui l'a joué.

### 3. Un taux de déclenchement supérieur à 1 par partie

Mesuré par `tools/sim.mjs`. Un effet qui ne se produit jamais coûte du temps de
développement, de la surface de règles et de la charge cognitive, pour rien.

Exemple concret : les gangs exigent de contrôler **entièrement** un quartier au
tour 7. Dans une partie réelle, environ deux gangs sur quinze se déclenchent.
Câbler les huit effets manquants aurait coûté plusieurs jours pour du contenu
que personne ne verrait.

---

### 4. Une place, sans passage de tablette en plus

Le budget de **passages de tablette** est la ressource la plus contrainte d'une
soirée : 21,8 par tour à quatre joueurs, 30,5 à six — mesurés par
`node tools/sim.mjs`. Un système qui réclame sa propre tournée de rideaux coûte
2N passages, c'est-à-dire l'équivalent d'une phase entière. C'est ce coût, et non
une règle, qui interdit aujourd'hui de tenir plus d'une élection par partie.

Un système nouveau se loge donc dans un passage qui existe déjà : une feuille
d'ordres, un écran public, le rideau. S'il n'y rentre pas, il ne rentre pas.

La feuille d'ordres de la phase 4 est pleine : **huit pastilles, deux rangées de
quatre**, mesurées à 390 px pour tenir sans défilement. Une neuvième action
demande d'en retirer une, ou de créer un troisième groupe — pas de l'ajouter en
bas de la pile, où elle serait invisible.

---

## Et ne pas dégrader la partie

Après réactivation, relancer le banc et comparer :

```bash
node tools/sim.mjs --graines 40
node tools/sim.mjs --graines 40 --joueurs 6
```

Quatre garde-fous, dont aucun ne doit se dégrader :

| Indicateur | Cible |
|---|---|
| Parties terminées | 100 % |
| Tour de victoire (médiane) | 10 à 14 |
| Premier combat (médiane) | ≤ 6 |
| Écart 1er/dernier au tour 6 | ≤ ×3 |

Un système peut être correct — tests verts, effet visible, déclenché souvent — et
rendre le jeu injouable en allongeant la partie de six tours. C'est le rôle du
banc de le dire avant la table, pas après.

---

## Bons candidats au retour

Deux effets désactivés sont simples et bon marché :

- **Faire voter les morts** (`voter_morts`) — bonus d'électeurs si l'on possède
  un cimetière. La facilité `cimetiere` existe déjà sur quatre zones de New York.
- **Vils Voleurs à Vélo** (`voleurs_velo`) — voler une cargaison à un joueur.
  Un transfert de ressources, sans nouvel état à introduire.

Les cartes de réaction (`carte_triche`, `anti_carte_triche`,
`malencontreux_accident`) demandent un système d'interruption qui n'existe nulle
part : c'est un chantier, pas un branchement.
