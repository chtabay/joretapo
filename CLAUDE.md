# Joretapo — reprendre le fil

Ce fichier existe pour une raison précise : **ce genre de projet ne meurt pas
pendant le sprint, il meurt à la reprise.** Trois semaines passent, on rouvre le
dépôt, on ne sait plus où on en était, et on referme.

## En trente secondes

```bash
npm test                    # 195 tests, aucune dépendance, aucune configuration
node tools/sim.mjs          # 40 parties simulées : le jeu est-il encore jouable ?
npm run serve               # http://localhost:8000
npm run partie              # une soirée entière jouée à l'écran (Playwright)
npm run ecrans              # mise en page et cibles tactiles, cinq formats
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
| Offre d'armes | 46/tour | 140/tour | Un joueur dépensait 3 de ses 5 ordres en courses et ne s'étendait plus |
| Égalité de conflit | statu quo gratuit | départagée au tour même : celui qui tient la zone la garde ; sinon celui qui engage le plus de pions | 353 égalités sur 40 parties, dont 66 % rejouées à l'identique le tour suivant, pendant que 0,7 zone changeait de mains. Se bloquer était la position la moins chère du jeu |
| Traversées d'eau | aucune | deux ouvrages nommés | Le générateur de carte relie deux zones dont les polygones passent à moins de 50 m : aucun fleuve ne fait moins de 50 m, donc **aucun pont n'existait**. Bergen n'avait qu'une sortie, tenue dès le tour 1 par un pion armé adverse : un pion posé là enfermait le joueur dans 3 zones sur 74, toute la partie |
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
  décide plus rien. C'est l'indicateur qui a décidé du mandat de six tours : il
  valait 0,57 à sept, il vaut **1,00** aux trois formats depuis.
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

Ces quatre lignes datent d'avant la réparation du banc et le recalage : elles
mesurent l'effet du départage seul, toutes choses égales par ailleurs. Les
valeurs courantes sont celles du tableau « banc réparé » plus haut — verrouillage
à 1,00 aux trois formats.

Le front bouge — surtout à six joueurs, où le territoire circule deux fois plus.
Le prix est là aussi : la partie à six s'allonge de trois tours et demi, et le
verrouillage relatif se dégrade parce que la durée augmente sans que le tour de
verrouillage recule. **C'est un argument de plus pour recaler le seuil**, ce qui
suppose d'abord de réparer le banc (voir plus haut).

## La partie a enfin été jouée en entier — par un pilote, pas par une table

Le banc mesure les règles sans jamais toucher un bouton ; les tests vérifient
des moteurs sans DOM. Entre les deux, **personne ne regardait les écrans.** Deux
instruments comblent ce trou :

```bash
npm run partie    # une soirée entière, du menu au vainqueur annoncé
npm run ecrans    # cinq formats, cinq écrans, mise en page et cibles tactiles
```

Playwright n'est pas une dépendance et ne doit pas le devenir : `npm test` et
`node tools/sim.mjs` restent sans rien à installer. Les deux outils s'arrêtent
poliment s'ils ne le trouvent pas, et acceptent
`JORETAPO_PLAYWRIGHT=/chemin/vers/playwright/index.mjs`.

Relevé du premier, sur une partie à quatre menée jusqu'au bout :

| Mesure | Relevé |
|---|---|
| Fin de partie | 14ᵉ tour, bandeau de victoire, classement trié |
| Taps pour la soirée | 324, soit 23,1 par tour |
| Draft | 4 cartes par joueur et par scrutin, comme l'écran l'annonce |
| Rechargement au tour 3 | reprend par le rideau, phase intacte |
| Erreurs JS | aucune, hors les trois CDN injoignables hors ligne |

Ce que le second a trouvé, et qui ne pouvait pas se voir autrement qu'en
ouvrant la page :

| Défaut | Conséquence |
|---|---|
| `#election-ov` n'avait aucun fond | Le scrutin **à bulletin secret** se lisait par-dessus le plateau |
| « Je suis X » hors cadre en paysage | Le seul verrou d'identité du hotseat, inatteignable |
| Rangée d'actions coupée à 360 px | Sous la lisière : « Valider mes ordres ». Viser un peu bas finissait le tour |

Un relevé demeure, assumé : la cible du bouton de sauvegarde fait 43 × 35 au
doigt. La barre du haut fait 32 px et le bouton est à 2 px du bord de l'écran ;
aller chercher les 9 px manquants coûterait une bande morte de 45 × 15 sur le
coin du plateau. Le plateau vaut plus qu'un bouton de sauvegarde.

Un avertissement pour la suite, payé trois fois : **la boîte d'un bouton n'est
pas sa cible.** Un `::after` étendu agrandit la zone sensible sans changer
`getBoundingClientRect`, et un panneau fermé garde sa boîte alors qu'il n'est
plus à l'écran. La première version de l'audit mesurait des boîtes : elle
réclamait des réparations sur des boutons qui n'existaient pas, et ne voyait pas
ceux qui étaient couverts. On mesure au doigt, avec `elementFromPoint`.

La deuxième version avait le défaut symétrique, et plus grave : elle **écartait
en silence** tout bouton que le doigt n'atteignait pas, c'est-à-dire exactement
le pire cas — un bouton qui existe et sur lequel on ne peut pas appuyer. « Posé
par la mise en page » et « atteint par le doigt » sont deux questions
distinctes, et l'audit ne posait que la seconde. Une fois séparées, il a trouvé
du premier coup qu'en paysage la légende des quartiers, haute de 343 px sur un
écran de 390, recouvrait **« 🗺️ Territoires » et « 📖 Dictionnaire »** — dont le
premier ouvre justement la vue complète des quartiers. Elle est masquée en
paysage, comme elle l'est déjà sur téléphone.

## Le premier rapport d'une vraie table

Trois défauts remontés d'une partie jouée sur tablette. Le plus instructif est
qu'ils ont été trouvés sur **la version en ligne, vieille de cinq mois** : Pages
servait `main`, et `main` n'avait jamais reçu le travail. Deux des trois étaient
déjà morts dans le dépôt.

**« Je ne vois pas le joueur 2. »** Vrai en ligne, faux dans le dépôt. Sur
`main`, le placement initial n'avançait le curseur de zone que pour les pions
armés : toutes les prostituées s'empilaient sur une case, et le contrôle d'un
quartier exigeait l'unanimité. Résultat mesuré sur cette version : **six des
onze quartiers de départ rapportaient 0 point au tour 1** — exactement les six
gros, ceux annoncés à 9 et 15 points. Sans contrôle, pas de contour épais ni
d'étoile : il ne restait du joueur qu'un aplat à 33 % d'alpha et des pions de
3,2 px. Sur la branche, 7007 mises en place vérifiées, aucune muette.

Il en restait pourtant une part vraie ici : **rien ne disait au joueur où il
est.** Le rideau passait la tablette en laissant le cadre là où le précédent
l'avait posé. Le rideau recadre maintenant sur le territoire de celui qui prend
la tablette, et un second bouton ⌖ y ramène à tout moment.

**« L'échange d'une prostituée et d'un trafiquant a planté. »** Il n'y avait
aucune exception — 20 000 résolutions aléatoires n'en lèvent pas une. « Ça a
planté » voulait dire « rien ne s'est passé » : deux ordres sur trois dépensés,
le plateau inchangé, et le refus replié dans un volet fermé dont le résumé
disait « 2 lignes ». Trois choses étaient cassées, aucune n'était le moteur de
conflit :

- la règle d'entrée ne regardait que le pion **déjà là**, jamais celui qui
  arrive. Une prostituée ne pouvait donc **jamais** rejoindre son propre
  protecteur — alors que la fuite d'un pion armé suppose justement qu'ils
  cohabitent — et deux prostituées pouvaient s'empiler, ce que l'appro interdit ;
- le message accusait le pion armé même quand l'obstacle était la prostituée ;
- la feuille d'ordres proposait des destinations que le moteur refuse, et
  peignait même le pion allié de destination en pastille verte.

La règle vit désormais dans une seule fonction, `obstacleEntree`, exportée du
résolveur et lue par la feuille d'ordres : elle dit non **avant** que l'ordre
soit payé. Un refus ouvre son volet au bilan et se nomme.

Ce qui n'a **pas** été fait, et pourquoi : autoriser la rotation de ses propres
pions. Il faudrait tenir un départ pour acquis avant la résolution des conflits,
or un ordre de sortie annulé en conflit laisse le pion sur place — mesuré : deux
pions armés du même joueur sur une case, ce que trois modules interdisent. Dans
la position rapportée, les deux refus étaient d'ailleurs **justes** : la case
d'arrivée gardait sa prostituée, l'autre son trafiquant.

**« Les rivières coupent les connexions. »** Vrai, et pire que le rapport. Le
plateau était connexe, mais **Bergen n'avait qu'une zone de sortie**, HC08,
tenue par un pion armé de North Hudson au tour 1 dans 200 mises en place sur
200. Un pion posé là réduisait le joueur à 3 zones sur 74 pour toute la partie.
Quatre autres quartiers de départ étaient scellables à 11, 12, 13 et 18 zones.

Les treize traversées réelles de New York ont été essayées. **Elles font tomber
le taux de combat à 0 %** : un plateau ouvert offre des cases libres au lieu
d'obliger à se croiser — le mécanisme exact décrit plus haut pour la portée des
points d'appro, à l'envers. **Deux suffisent** : George Washington (BG02–MN12) et
Henry Hudson (MN12–BX8), MN12 étant la charnière entre le New Jersey et le
Bronx.

| 40 parties, mêmes graines | Sans pont | 13 ponts | **2 ponts** |
|---|---|---|---|
| Pire enfermement par un pion | **3 / 74** | 71 / 74 | **69 / 74** |
| Parties avec un combat | 13 % | **0 %** | 8 % |
| Premier combat (médiane) | tour 4 | — | tour 13 |
| Zones reprises par partie | 1,4 | 1,7 | 1,8 |
| Victoire (médiane) | 13 | 13 | 13 |
| Titre repris | 48 % | 45 % | 48 % |

Le prix est réel et assumé : le premier combat recule du tour 4 au tour 13. Un
joueur enfermé dans 3 zones par un seul pion adverse est un jeu cassé ; une
statistique de banc mesurée avec des bots gloutons et prudents ne l'est pas.
À revérifier à la table — c'est elle qui tranche.

Deux garde-fous dans `test/city-data.test.mjs` échouent sans les ponts et
passent avec, et les ouvrages vivent dans `data/ouvrages.json`, fusionnés
**après** le calcul géométrique : une régénération de la carte ne les efface
plus.

## Déplacer au doigt : deux touchers, pas un glissé

Deuxième remarque de la table : « l'ergonomie du déplacement est complexe,
pourrait-on glisser les pions sur la carte ? Faudrait-il des sprites ? »

Réponse mesurée : **oui pour la carte, non pour le glissé, non pour les
sprites.**

| Mesure, Playwright, cinq formats | Relevé |
|---|---|
| Diamètre d'un pion à l'écran | **18 px** partout — la contre-échelle tient |
| Entraxe de deux pions voisins | 20 px |
| Ce que touche le doigt au centre d'un pion | `path.zone` — les pions sont transparents aux événements |
| Petit côté d'une zone, portrait, médiane | **121 px**, minimum 44, aucune sous 44 |
| Glissé depuis le centre exact d'un pion | **3 px suffisent à déplacer la carte** |

Un pion ne se saisit pas ; une zone, si — elle est 6,7 fois plus large. Et
greffer un glisser-déposer obligerait à ajouter un seuil ou un appui long au
déplacement de la carte, c'est-à-dire à abîmer le geste principal du plateau
pour en installer un second. Le modèle d'ordres, lui, n'a jamais besoin de
désigner un pion précis : seulement `(from, pion_type, to)`.

D'où le geste retenu, en phase 4 : **toucher ma case, toucher la voisine.**
Les destinations légales s'éclairent, la règle d'entrée du moteur est consultée
avant que l'ordre soit posé, une flèche part du départ vers l'arrivée, et la
retoucher annule l'ordre. Rien ne bouge sur le plateau : les ordres restent
différés, le pion ne se déplace qu'à la résolution.

Coût : **0 passage de tablette**, aucun sprite, une couche SVG de plus. Les
flèches sont peintes hors de `refreshMap`, qui ne fait rien pendant les phases
secrètes — or c'est précisément là qu'elles servent ; ce qu'elles montrent est
le secret de celui qui tient la tablette, et il n'y en a jamais que d'un joueur.

Deux pièges payés en chemin, tous deux invisibles aux tests :

- **`renderOrderPanel` n'est pas un rafraîchissement, c'est une ouverture** : il
  remet `pendingOrders` à zéro. L'appeler pour redessiner le compteur effaçait
  l'ordre à l'instant même où on le comptait. Le bon crochet est le `refresh`
  interne du panneau.
- **Un écouteur posé sur une couche qu'on vide et regarnit** est un écouteur
  qu'on croit accroché. Celui des flèches vit sur la racine SVG.

## Ce qui reste ouvert

- **Aucune partie n'a encore été jouée par des humains.** Le pilote appuie sur
  les boutons ; il ne s'ennuie pas, ne se trompe pas d'écran et ne triche pas en
  regardant la tablette du voisin. C'est la prochaine étape et elle prime sur
  tout le reste : si les notes d'une vraie table contredisent ce qui est écrit
  ici, ce sont elles qui gagnent.
- **La question des stocks et des besoins n'a pas été instruite.** « L'état des
  stocks et des besoins n'est pas très clair » est le troisième point remonté de
  la table ; l'enquête a été interrompue avant d'aboutir. Ce qui est déjà
  établi : les trois ressources s'affichent en pastilles, les coûts n'apparaissent
  que sur certains boutons, et rien ne dit d'un coup d'œil ce qu'on peut se
  payer. À reprendre.
- Le taux de combat mesuré reste faible (10 % des parties). Les bots du banc sont
  gloutons et prudents ; un joueur réel attaquera plus. À revérifier à la table.
- 4 tests `todo` documentent des défauts connus non corrigés (`npm test` les
  liste). Ils ne font pas échouer la CI.
- **Les quartiers de départ ne se valent pas**, et le chiffre de référence est
  désormais périmé : « South Brooklyn 6 fois sur 10, West Queens et Jersey City
  jamais » a été mesuré sur le plateau **sans ponts**, avec le banc d'avant sa
  réparation. Les deux traversées changent la topologie de cinq quartiers sur
  onze. À remesurer avant d'y toucher — et une partie de l'écart n'était pas
  géographique : Jersey City a sept sorties et perd quand même.
- Les trois bibliothèques CDN (pako, lz-string, qrcodejs) n'ont ni SRI ni copie
  locale. Hors ligne, le partage et le QR se dégradent proprement mais se
  dégradent.
- La fusion des phases 1 et 4 a été essayée puis abandonnée : elle divise par
  deux les passages de tablette mais supprime les combats. Le raisonnement
  complet est en tête de `js/turn-manager.js` — ne pas la refaire sans le lire.

## Mettre en ligne

Le site est servi par GitHub Pages depuis `main`, et `.github/workflows/pages.yml`
le republie à chaque poussée, **une fois les tests verts**. Tant que le travail
reste sur une branche, il n'est pas en ligne : c'est ainsi qu'une version de mars
a été testée à la table cinq mois plus tard, avec trois défauts déjà corrigés
depuis. Si le jeu en ligne ne ressemble pas au dépôt, la question n'est pas
« quel bug » mais « quel commit ».

Le workflow remplace le service depuis une branche : il faut, une fois, basculer
*Settings → Pages → Source* sur « GitHub Actions ».

## Conventions

- Le code, les commentaires et les libellés de test sont en **français**.
- Un commentaire explique **pourquoi**, pas quoi. S'il énonce un chiffre, ce
  chiffre a été mesuré.
- Un test décrit une **règle du jeu**, pas une fonction :
  `test('un flic bloque les revenus de la zone sauf pour son propriétaire')`.
- Un système ne revient en jeu qu'en payant le péage de
  `docs/AJOUTER-UN-SYSTEME.md`.
- **Le secret du hotseat a une seule source : `js/vues.js`.** Les points, les
  zones et les quartiers sont publics — ils se lisent sur la carte. La caisse,
  les stocks et la main ne sont visibles que par le joueur dont c'est le tour, et
  par personne d'autre, à aucun moment : ni au bilan de fin de tour, ni pendant
  la négociation, ni dans une modale de ciblage. Tout écran qui affiche une
  ressource passe par `vueJoueurs(gs, gameplay, { revele })`, dont le paramètre
  n'a **pas** de valeur par défaut — un appelant qui l'oublie lève une erreur au
  lieu de fuiter en silence.
