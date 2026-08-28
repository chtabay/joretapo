# Joretapo — reprendre le fil

Ce fichier existe pour une raison précise : **ce genre de projet ne meurt pas
pendant le sprint, il meurt à la reprise.** Trois semaines passent, on rouvre le
dépôt, on ne sait plus où on en était, et on referme.

## En trente secondes

```bash
npm test                    # 172 tests, aucune dépendance, aucune configuration
node tools/sim.mjs          # 40 parties simulées : le jeu est-il encore jouable ?
npm run serve               # http://localhost:8000
```

Si les deux premières commandes passent, le dépôt tourne.

## Ce qu'il faut savoir avant de toucher quoi que ce soit

**Les moteurs sont purs.** Les neuf modules `js/*-engine.js`, `game-state.js`,
`conflict-resolver.js`, `special-entities.js` et `turn-manager.js` ne contiennent
aucune référence au DOM. C'est ce qui rend possibles les tests et le banc
d'essai. Ne pas y introduire de `document.` : c'est la propriété la plus
précieuse du dépôt.

**`app.js` est une feuille.** Aucun module ne l'importe ; il est le seul
consommateur de tout le reste. On peut donc refaire l'interface sans toucher aux
règles — et inversement.

**Le plateau n'est pas New York.** C'est un graphe de zones. Les tests tournent
sur un plateau fictif de 8 zones. Ajouter une ville est une tâche de données :
voir `docs/AJOUTER-UNE-VILLE.md`.

**Les réglages de partie sont dans `js/rules.js`**, calés par simulation. Quand
on en change un, on relance `node tools/sim.mjs` et on regarde ce qui bouge.

## Ce qui a été changé par rapport au plateau de 2010

Ce ne sont pas des corrections de bugs mais des décisions, prises parce que le
banc d'essai montrait que la partie ne se terminait jamais — 0 % sur 20 parties
de 30 tours, et 0 % avec le moindre combat.

| Règle | Avant | Maintenant | Pourquoi |
|---|---|---|---|
| Contrôle d'un quartier | 100 % des zones | majorité stricte | Une case perdue faisait tomber 15 points ; une case libre empêchait quiconque de les gagner |
| Propriété d'une zone | perdue en sortant | conservée jusqu'à ce qu'un autre la prenne | On ne pouvait grandir qu'en achetant des pions ; les points oscillaient 15 → 0 → 15 |
| Victoire | 55 points | 35 points, fin dure au 14ᵉ tour | 55 sur un plateau qui en offre 129 demandait de tenir 42 % de la carte |
| Soutien à un allié | inexistant | ordre explicite, coûte un ordre | Le comptage ne créditait que le propriétaire du pion : aider quelqu'un était impossible, et la négociation n'avait rien à négocier |
| Vote | pour soi possible | interdit | L'auto-vote rendait le maire mécanique : le joueur déjà en tête |
| Offre d'armes | 46/tour | 130/tour | Un joueur dépensait 3 de ses 5 ordres en courses et ne s'étendait plus |
| Points d'appro | accessibles à tous, sans condition | priorité au propriétaire + péage de 50 % | La logistique n'avait aucune géographie : prendre un port ne servait à rien. Ce sont des équipements publics qu'on domine |

Après : 100 % de parties terminées, médiane au tour 11 à 13, et 6,4 équipements
logistiques sur 8 contrôlés en fin de partie contre presque aucun avant.

## Ce qui reste ouvert

- **Aucune partie n'a encore été jouée par des humains.** C'est la prochaine
  étape et elle prime sur tout le reste : si les notes d'une vraie table
  contredisent ce qui est écrit ici, ce sont elles qui gagnent.
- Le taux de combat mesuré reste faible (10 % des parties). Les bots du banc sont
  gloutons et prudents ; un joueur réel attaquera plus. À revérifier à la table.
- 4 tests `todo` documentent des défauts connus non corrigés (`npm test` les
  liste). Ils ne font pas échouer la CI.
- Les trois bibliothèques CDN (pako, lz-string, qrcodejs) n'ont ni SRI ni copie
  locale. Hors ligne, le partage et le QR se dégradent proprement mais se
  dégradent.
- La fusion des phases 1 et 4 a été essayée puis abandonnée : elle divise par
  deux les passages de tablette mais supprime les combats. Le raisonnement
  complet est en tête de `js/turn-manager.js` — ne pas la refaire sans le lire.

## Conventions

- Le code, les commentaires et les libellés de test sont en **français**.
- Un commentaire explique **pourquoi**, pas quoi. S'il énonce un chiffre, ce
  chiffre a été mesuré.
- Un test décrit une **règle du jeu**, pas une fonction :
  `test('un flic bloque les revenus de la zone sauf pour son propriétaire')`.
- Un système ne revient en jeu qu'en payant le péage de
  `docs/AJOUTER-UN-SYSTEME.md`.
