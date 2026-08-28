# Joretapo — reprendre le fil

Ce fichier existe pour une raison précise : **ce genre de projet ne meurt pas
pendant le sprint, il meurt à la reprise.** Trois semaines passent, on rouvre le
dépôt, on ne sait plus où on en était, et on referme.

## En trente secondes

```bash
npm test                    # 188 tests, aucune dépendance, aucune configuration
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
| Sources de points | 7, dont 4 paliers (8 dealers, 8 prostituées, 6 trafiquants, 2 000 lingots) | 3 : quartiers, mairie, constructions | Les 4 paliers valaient 40 points annoncés et ne se déclenchaient **jamais** : sur 2 284 relevés, maxima 4, 4, 3 et 542. Celui des lingots faisait en outre entrer une information secrète dans un score public |
| Ordre de passage | retiré au sort à chaque phase | tiré une fois par tour | Un joueur pouvait passer premier en phase 1 et dernier en phase 4. Un ordre qu'on ne peut pas annoncer est un ordre qu'on subit |
| Seuil de victoire | 55, puis 35 | **34** | 55 exigeait 42 % de la carte, aucune partie ne finissait ; 35 était calé sur un banc défaillant et donnait une médiane au tour 8, avant que la mairie ait pu être reprise |
| Durée du mandat | 7 tours | **6 tours** | À 7, avec une fin au 14ᵉ, le second scrutin tombait pile sur la fin : il n'avait jamais lieu et le maire gardait 15 points — 44 % du seuil — sans les redéfendre. Titre repris : 0 % → 48 % |
| Vote | pour soi possible | interdit | L'auto-vote rendait le maire mécanique : le joueur déjà en tête |
| Offre d'armes | 46/tour | 130/tour | Un joueur dépensait 3 de ses 5 ordres en courses et ne s'étendait plus |
| Égalité de conflit | statu quo gratuit | départagée au tour même : celui qui tient la zone la garde ; sinon celui qui engage le plus de pions | 353 égalités sur 40 parties, dont 66 % rejouées à l'identique le tour suivant, pendant que 0,7 zone changeait de mains. Se bloquer était la position la moins chère du jeu |
| Portée du soutien | zone adjacente | deux zones | Sur 483 zones disputées, un joueur non impliqué avait un pion armé juste à côté dans **un** cas. L'ordre de soutien — seul objet de la négociation — était injouable |
| Points d'appro | accessibles à tous, depuis n'importe où | il faut un pion sur place ou à côté ; priorité au propriétaire + péage de 50 % | La logistique n'avait aucune géographie : la liste des 13 points était la même pour tous depuis n'importe quelle case, et prendre un port ne servait à rien. Ce sont des équipements publics qu'on domine |

Après : 100 % de parties terminées (0 % avant), médiane au tour 13 à 4 joueurs,
et 6,2 équipements logistiques sur 9 contrôlés en fin de partie contre presque
aucun avant.

C'est la **portée** qui a produit la tension, pas le péage. À 40 parties et
graines identiques, avant/après la contrainte de présence :

| | Péage seul | Péage + portée |
|---|---|---|
| Parties avec un combat, 4 joueurs | 3 % | **13 %** |
| Parties avec un combat, 6 joueurs | 13 % | **33 %** |
| Premier combat (médiane) | tour 10 | **tour 4** |

Le péage rendait un port rentable ; la portée le rend nécessaire. Deux
conséquences mesurées et assumées : la partie s'allonge (médiane 11 → 13) et
Harlem n'a que le marché noir à portée au tour 1. Lui donner un péage a été
essayé — le premier combat recule au tour 8, le taux de combat retombe à 3 %,
et Harlem gagne *moins* souvent (8 % contre 17 %). La rareté était la tension.

## Le banc joue enfin la partie entière

Le banc d'essai avait un défaut qui invalidait les chiffres avec lesquels
`victoire: 35` et `finDePartie: 14` ont été calés. Le bot visait un trafiquant
dès 200 lingots, puis renonçait à créer quoi que ce soit s'il n'avait pas les
trois armes qu'il coûte — sans jamais essayer le dealer, à deux armes, qu'il
pouvait payer. **Il cessait donc de grandir en pleine richesse.**

Le seul repli sur le dealer, à graines et à règles identiques :

| 40 parties, 4 joueurs | Bot défaillant | Bot corrigé |
|---|---|---|
| Victoire (médiane) | tour 13 | **tour 8** |
| Gagnées au seuil | 63 % | **80 %** |
| Tour de verrouillage | — | 7 (0,88 de la partie) |

Il sautait par ailleurs **cinq systèmes entiers** : le draft, les cartes
magouille, les gangs, les casses et les pouvoirs de maire.

Et il avait un troisième défaut, découvert en cherchant pourquoi le titre de
maire ne changeait jamais de mains : **son bot votait pour le joueur en tête**,
c'est-à-dire pour le maire sortant — qui mène précisément *parce qu'*il a la
mairie. Personne, à une vraie table, ne redonne 15 points à celui qui gagne
déjà. Une fois ce vote rendu rationnel, tout se déplace.

| 40 parties, banc réparé | 3 joueurs | 4 joueurs | 6 joueurs |
|---|---|---|---|
| Parties terminées | 100 % | 100 % | 100 % |
| Victoire (médiane) | 13 | 13 | 13 |
| **Tour de verrouillage** | **1,00** | **1,00** | **1,00** |
| Élections tenues | 1,75 | 1,63 | 1,63 |
| Titre repris | 55 % | 48 % | 55 % |
| Cartes gardées / jouées | 21 / 7,3 | 26 / 8,7 | 31 / 11,5 |
| Gangs joués | 3,6 | 4,6 | 6,8 |
| Pouvoirs de maire | 3,1 | 2,6 | 2,5 |
| **Casses réussis** | **0** | **0** | **0** |

Un tour de verrouillage à **1,00** signifie que le meneur n'est le vainqueur
assuré qu'au tout dernier tour : plus rien n'est joué d'avance. Il valait 0,57
avec un mandat de sept tours.

Prix payé, mesuré : les passages de tablette montent de 21,7 à 22,4 par tour à
quatre joueurs, parce qu'il y a désormais deux scrutins au lieu d'un.

**Les casses ne se déclenchent jamais.** Le hold-up de la Zurich Bank demande un
pion armé sur quatre des six annexes — BG01, HC10, MN2, MN9, QN3, BK8, réparties
dans six quartiers différents — et celui de l'hôtel de police exige en plus un
bordel. Sur une partie qui dure onze tours, personne n'y arrive. C'est un système
décoratif au sens de `docs/AJOUTER-UN-SYSTEME.md`, et il n'a pas encore été
traité.

**Deux pouvoirs de maire sur huit sont inatteignables** : `incorruptible` et
`exproprier` sont déclarés en phase 5, or la feuille d'ordres n'existe qu'en
phases 1 et 4. Ils ne sont jamais proposés.

Deux indicateurs ont été ajoutés pour cela :

- **tour de verrouillage** — le premier tour à partir duquel celui qui mène est
  déjà le vainqueur dans 90 % des parties, rapporté à la durée médiane. À 1,0, le
  sort ne se scelle qu'au dernier tour ; à 0,5, la seconde moitié de la soirée ne
  décide plus rien. C'est l'indicateur qui dit si le recalage du seuil est urgent :
  à 6 joueurs il est retombé à 0,52 depuis que les égalités se départagent, non
  parce que la partie se décide plus tôt mais parce qu'elle dure plus longtemps.
- **passages de tablette** — le nombre d'écrans par tour qui demandent qu'on
  prenne l'appareil. C'est la ressource la plus contrainte d'une soirée : 21,9 par
  tour à 4 joueurs, 30,6 à 6. Un système nouveau qui en réclame d'autres doit se
  replier dans un passage existant.

## Effet mesuré du départage des égalités

40 graines identiques, banc corrigé, avant et après les deux règles de conflit :

| | 4 joueurs | | 6 joueurs | |
|---|---|---|---|---|
| | avant | après | avant | après |
| Égalités par partie | 8,8 | **0,7** | — | — |
| Zones reprises par partie | 0,7 | **1,0** | 1,3 | **2,7** |
| Victoire (médiane) | 8 | 8 | 10 | **13,5** |
| Tour de verrouillage | 0,88 | 0,88 | 0,70 | **0,52** |

Le front bouge — surtout à six joueurs, où le territoire circule deux fois plus.
Le prix est là aussi : la partie à six s'allonge de trois tours et demi, et le
verrouillage relatif se dégrade parce que la durée augmente sans que le tour de
verrouillage recule. **C'est un argument de plus pour recaler le seuil**, ce qui
suppose d'abord de réparer le banc (voir plus haut).

## Ce qui reste ouvert

- **Aucune partie n'a encore été jouée par des humains.** C'est la prochaine
  étape et elle prime sur tout le reste : si les notes d'une vraie table
  contredisent ce qui est écrit ici, ce sont elles qui gagnent.
- Le taux de combat mesuré reste faible (10 % des parties). Les bots du banc sont
  gloutons et prudents ; un joueur réel attaquera plus. À revérifier à la table.
- 4 tests `todo` documentent des défauts connus non corrigés (`npm test` les
  liste). Ils ne font pas échouer la CI.
- **Les quartiers de départ ne se valent pas**, et l'écart est large : sur 120
  parties simulées, South Brooklyn l'emporte 6 fois sur 10, West Queens et
  Jersey City jamais. Ce déséquilibre est antérieur à tout ce qui précède — il
  était identique avant les changements de règles — et il n'a pas encore été
  travaillé. C'est le prochain chantier d'équilibrage.
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
