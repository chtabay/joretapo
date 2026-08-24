## 2026-08-23 — js/magouille-engine.js — Les cartes Magouille ne valent que le temps d'un mandat

**Avant** — Les 4 cartes gardées à chaque tirage restaient en main indéfiniment.
Le stock recyclable (65 exemplaires) perdait 4 × nbJoueurs par élection :
`drawCards` sortait par `break` en rendant une main incomplète et l'écran de
tirage se bloquait (6 joueurs → tour 14, 5j → 21, 4j → 28, 3j → 35, 2j → 56).

**Après** — `MagouilleEngine.draftPhase` recycle d'abord toutes les cartes encore
en main dans la défausse (`recyclerMains`), puis distribue. Une carte gardée doit
donc être jouée pendant le mandat en cours, sinon elle repart dans le circuit.

**Raison** — Correction à la racine plutôt qu'un colmatage : le circuit redevient
fermé (65 exemplaires moins les cartes explicitement « retirées du jeu »), donc
la pénurie est structurellement impossible quel que soit le nombre de joueurs ou
la durée de la partie. Effet de jeu recherché : les cartes deviennent une
ressource périssable, ce qui pousse à les jouer au lieu de les thésauriser — plus
de tension, moins d'accumulation. Aucune modification de `data/` n'a été
nécessaire (pas de propriété sur ce fichier).

---

## 2026-08-23 — js/magouille-engine.js — Tirage en tour de table et main écourtée gérée proprement

**Avant** — `draftPhase` servait 8 cartes au joueur 0, puis 8 au joueur 1, etc.
Le dernier servi pouvait recevoir 1 carte, voire 0, pendant que les autres en
avaient 8.

**Après** — Distribution en round-robin ; la taille de main est calculée d'abord
(`min(8, floor(stock_recyclable / nbJoueurs))`) et elle est **identique pour
tous**. `MagouilleEngine.nbCartesAGarder(tailleMain)` donne le nombre de cartes à
conserver (8→4, sinon moitié arrondie au supérieur, plafonné à 4).
`recupererCartesPerdues` réinjecte au passage tout exemplaire qui aurait quitté
le circuit sans y revenir (cartes consommées comme coût de cambriolage).

**Raison** — Filet de sécurité en profondeur : même si un autre chantier retire
des cartes du circuit, la dégradation reste équitable et jouable au lieu de
produire un blocage. Écart assumé à la spec 01 (« 8 cartes, en garde 4 ») : le
8→4 reste la règle nominale, la réduction n'intervient qu'en stock insuffisant.

---

## 2026-08-23 — js/magouille-engine.js — Ordre REVALIDER → APPLIQUER → PAYER → DÉFAUSSER

**Avant** — `play()` débitait le coût et retirait la carte de la main AVANT
d'appeler `_applyEffect`, sans jamais tester son résultat. Une carte dont l'effet
échouait était perdue et payée.

**Après** — `play()` revalide via `canPlay` (coût, conditions, phase si fournie),
applique l'effet, et ne débite / ne défausse **que si l'effet a réussi**.

**Raison** — Aucune raison de jeu ne justifie de facturer un joueur pour un effet
qui n'a pas eu lieu. Effet secondaire voulu : une carte inutilisable reste
disponible pour un meilleur moment.

---

## 2026-08-23 — js/magouille-engine.js — Un effet non implémenté est refusé explicitement

**Avant** — Le `default` du switch renvoyait `{ ok: true, msg: '<nom> jouée' }`
pour les 9 effets non codés (15 exemplaires sur 65, 23 % du deck) : coût débité,
carte défaussée, rien ne se passait.

**Après** — `{ ok: false, reason: 'effet_non_implemente', msg: '« <nom> » : effet
« <effet> » pas encore implémenté — carte conservée' }`. Combiné au point
précédent, la carte n'est ni payée ni consommée.

**Raison** — Les 9 effets seront implémentés lors d'un chantier ultérieur. En
attendant, le joueur voit clairement pourquoi la carte ne part pas, plutôt que de
payer pour du vide.

---

## 2026-08-23 — js/magouille-engine.js — Évaluation des conditions de jouabilité

**Avant** — Le champ `conditions` de `data/cartes-magouille.json` (18 conditions
distinctes) n'était évalué nulle part ; seules `est_maire` et `flics_en_reserve`
étaient testées en dur au fond de deux effets.

**Après** — `canPlay` évalue les 7 conditions calculables depuis l'état de partie :
`est_maire`, `possede_bordel`, `possede_bordel_ou_maire`, `possede_cimetiere`,
`possede_homme_de_main`, `flics_en_reserve`, `possede_lobby_juif`
(= gang de Jersey City activé par le joueur). Les 11 autres dépendent de la
géométrie du plateau ou d'un événement du tour : elles restent **non bloquantes**
et sont signalées comme telles dans le code.

**Raison** — Les conditions étaient affichées au joueur comme si elles
s'appliquaient. Mieux vaut en appliquer 7 pour de bon que 0. Impact d'équilibrage
assumé : « Ça commence à bien faire » (400 L) exige désormais réellement un
bordel ou la mairie, et « Amine Dada » exige réellement le Lobby Juif — ces
cartes deviennent conditionnelles, comme la spec 01 l'annonçait.

---

## 2026-08-23 — js/magouille-engine.js — Racket des restaurants : plus de lingots détruits

**Avant** — `other.ressources.lingots -= Math.min(tax, other.ressources.lingots);`
puis `total += Math.min(tax, other.ressources.lingots);` — le second `Math.min`
relisait un solde déjà décrémenté. Une victime à 40 L taxée de 30 L perdait 30 L
et le racketteur n'en recevait que 10 : 20 L sortaient de l'économie.

**Après** — Le montant prélevé est mémorisé avant le débit. Ce qui est pris est
exactement ce qui est encaissé.

**Raison** — Correction de bug pur ; aucune valeur de jeu modifiée (10 L par
restaurant, conforme à la spec 01 ligne 267).

---

## 2026-08-23 — js/magouille-engine.js — « Le Coup de … » : contagion locale et non planétaire

**Avant** — La propagation testait `removed.length > 0` (cumul global du
parcours) : dès qu'une prostituée était retirée quelque part, toutes les zones
visitées ensuite empilaient leurs voisines. Une seule carte balayait les
73 zones connexes et supprimait TOUTES les prostituées de la partie.

**Après** — La propagation ne repart que depuis une zone **effectivement**
contaminée. La chaîne s'arrête sur la première zone sans prostituée, conformément
au texte original de la carte. Si la zone ciblée n'en contient aucune, la carte
est refusée (`aucune_cible`) au lieu d'être gaspillée.

**Raison** — Correction de bug ; la carte redevient un outil chirurgical à 1 L au
lieu d'une arme de fin de partie.

---

## 2026-08-23 — js/magouille-engine.js — Compteurs de pions spéciaux et incorruptibles

**Avant** — `tuer_pion` et `retirer_pion` faisaient un `splice` aveugle :
un flic ou un incorruptible disparaissait du plateau sans que `gs.flics` ni
`gs.incorruptibles` soient mis à jour. `deplacer_incorruptible` ne mettait pas à
jour `gs.incorruptibles.deployes` (contrairement à son équivalent de
`special-entities.js`).

**Après** — `_pionRetire` tient les compteurs à jour ; `deplacer_incorruptible`
déplace l'entrée dans `deployes`. Et surtout : **« Permis de tuer » (gratuite,
4 exemplaires) ne peut plus cibler un incorruptible** — seule « Ça commence à
bien faire » (400 L) ou l'élimination officielle à 700 L le peuvent.

**Raison** — Une carte gratuite qui supprimait un obstacle facturé 700 L par
`SpecialEntities.eliminateIncorruptible` vidait de son sens le coût de l'action.
Écart à la spec assumé : la spec dit « retire n'importe quel pion » pour la carte
n°27 (« Ça commence à bien faire », qui garde ce pouvoir), pas pour n°18.

---

## 2026-08-23 — js/magouille-engine.js — Cartes qui ne se gaspillent plus à vide

**Avant** — `regagner_electeurs` (Permis de tuer Christophe),
`piocher_caisse_police` (Détournement de fonds) et `deplacer_gitans`
(La Carte JeuneS) renvoyaient `ok: true` même sans rien à faire : aucun malus à
annuler, caisses de police vides, aucune destination choisie.

**Après** — Ces trois cas renvoient `ok: false` (`aucun_malus`, `caisse_vide`,
`zone_invalide`), donc la carte reste en main et n'est pas payée.
`regagner_electeurs` ne rend par ailleurs que le malus réellement subi (plus de
malus négatif implicite). `changer_ethnie` refuse une ethnie identique à
l'actuelle et mémorise `_ethnie_temporaire` quand la durée n'est pas
« permanent », pour permettre la restauration en fin de mandat.

**Raison** — Cohérence avec la nouvelle règle « pas d'effet, pas de paiement » et
suppression de pièges purement punitifs pour le joueur.

---

## 2026-08-23 — js/magouille-engine.js — `initDeck` non destructeur

**Avant** — `initDeck` reconstruisait les 65 uid dans la pile sans tenir compte
des cartes en main : le garde-fou « pile vide → initDeck » de l'interface créait
des uid en double (une même carte en main ET dans la pile).

**Après** — `initDeck` exclut de la pile les uid déjà en main et ceux
définitivement retirés du jeu, et préserve `retirees_du_jeu`. `draftPhase`
garantit en plus de ne jamais laisser la pile vide.

**Raison** — Rendre l'opération de resynchronisation sûre à tout moment, y
compris après un rechargement de partie.

## 2026-08-23 — js/conflict-resolver.js — Ordre `soutenir` explicite, soutien inter-joueurs

**Avant** — Le soutien était exclusivement automatique et intra-joueur : seuls
les hommes armés immobiles du propriétaire d'un belligérant ajoutaient de la
force (`participants.has(pion.joueur)`). Soutenir un autre joueur était
impossible, la phase 3 de négociation n'avait donc aucune traduction mécanique.

**Après** — Le soutien automatique intra-joueur est conservé (défendre son
propre territoire reste gratuit) et un nouveau type d'ordre est introduit :
`{ type:'soutenir', from, to, pion_type, pour_joueur }`. Le pion désigné doit
être armé, rester immobile (un même pion ne peut pas avoir deux ordres dans le
tour) et `to` doit être adjacent à `from`. `pour_joueur` désigne le joueur
soutenu ; omis, il vaut le joueur qui donne l'ordre. Un pion qui a un ordre de
soutien ne soutient plus automatiquement son propre camp.

**Raison** — spec 01:182 (« un pion immobile peut supporter un pion allié (ou
d'un autre joueur) »). Le fait qu'un soutien à un allié consomme un des 5 ordres
du tour (décision 06 #4) est le prix de l'alliance : c'est ce qui donne un enjeu
réel à la phase de négociation, sans rendre la défense de son propre territoire
plus coûteuse qu'avant.

## 2026-08-23 — js/conflict-resolver.js — Un seul homme armé par joueur et par case convoitée

**Avant** — Un joueur pouvait envoyer deux hommes armés sur la même case : le
premier avançait, les suivants étaient silencieusement perdus (ordre consommé,
aucun message).

**Après** — Le second ordre visant la même case est refusé au parsing avec un
avertissement nominatif ; la force d'un belligérant dans un conflit vaut donc
toujours 1 pion + ses soutiens.

**Raison** — spec 01:126 (« un seul pion armé par case ») rend le second pion
inutilisable de toute façon. Rendre le refus explicite évite de gaspiller un
ordre sans explication, et donne des forces de conflit lisibles (1 + supports),
fidèles au modèle Diplomacy.

## 2026-08-23 — js/conflict-resolver.js — Conflits en cascade : le fugitif ne résiste pas, borne à 8

**Avant** — Aucune cascade : le vaincu fuyait vers `freeZones[0]` sans tenir
compte des mouvements du tour, deux pions armés pouvaient finir sur la case.

**Après** — La fuite évite en priorité les cases visées par un mouvement du
tour ; si elle n'a pas le choix, le fugitif s'y installe et est **repoussé de
nouveau** quand le conquérant arrive, sans droit de résistance (il ne rejoue pas
sa force ni ses soutiens). Le nombre de repoussées successives est borné à 8 :
au-delà le pion est éliminé et une ligne de journal l'indique.

**Raison** — spec 01:193-195 demande des conflits en chaîne « résolus
récursivement » sans dire comment. Une unité en déroute qui n'oppose pas de
résistance est la règle de Diplomacy (retraite, pas combat), c'est le seul choix
qui garantit la terminaison sans arbitrage arbitraire.

## 2026-08-23 — js/conflict-resolver.js — Un défenseur en cours de départ ne défend plus

**Avant** — Un homme armé ayant un ordre de départ était quand même compté comme
défenseur (force 1), ce qui provoquait des égalités et des statu quo sur une
case qui allait être libérée.

**Après** — Seuls les hommes armés sans ordre de mouvement défendent. Un
mouvement qui se retrouve malgré tout bloqué (le partant est resté à cause d'un
statu quo ailleurs) est annulé avec un message explicite.

**Raison** — spec 01:176-192 ne tranche pas ce cas ; l'immobilité est pourtant
exigée pour le soutien (01:182), la symétrie veut qu'elle le soit aussi pour la
défense. Sans cela une case pouvait finir vide après un « statu quo ».

## 2026-08-23 — js/conflict-resolver.js — Les prostituées ne sont pas des combattantes

**Avant** — N'importe quel pion déplacé devenait belligérant : une prostituée
soutenue par deux dealers pouvait chasser un trafiquant, voire l'éliminer.

**Après** — Seuls dealers et trafiquants entrent dans les conflits. Les
prostituées se déplacent avant les hommes armés (elles peuvent donc quitter une
case menacée), ne peuvent pas entrer sur une case tenue par un homme armé
adverse, et une case ne peut pas en accueillir deux (décision 06 #5). Une
prostituée sans homme armé de son camp sur la case est capturée par tout homme
armé adverse qui arrive.

**Raison** — spec 01:127/130 : les prostituées cohabitent et sont capturées,
elles ne combattent pas.

## 2026-08-23 — js/conflict-resolver.js — Propriété d'une zone : armé > construction > autres pions

**Avant** — `_updateOwnership` ne remettait `proprietaire` à null que si la case
était totalement vide, et calculait les propriétaires sur tous les pions sauf
les flics. Une case ne portant plus qu'un flic adverse restait acquise à son
ancien propriétaire ; une case portant un incorruptible (`joueur: null`) perdait
le sien, construction comprise.

**Après** — Ordre de priorité : (1) si un seul joueur a un homme armé sur la
case, elle est à lui ; (2) sinon une construction fige la propriété ; (3) sinon
le seul joueur ayant encore un pion (prostituée) la possède ; (4) sinon elle
n'appartient à personne. Flics, incorruptibles et gitans n'entrent jamais dans
le calcul.

**Raison** — spec 01:196-200 (les voix vont aux terrains « où il possède une
construction ou un homme armé »). Corrige à la fois les propriétaires fantômes
et la perte d'un bâtiment sous un incorruptible.

## 2026-08-23 — js/conflict-resolver.js — Conservation de l'argent : élimination et flics encaissés par la police

**Avant** — Les 40/160 lingots d'une élimination de pion, les 300/550 lingots
d'une élimination de flic et 20 des 180 lingots d'un déploiement de flic
disparaissaient de l'économie sans caisse de destination.

**Après** — Tous ces montants sont crédités à `gs.caisses.hotel_police`
(coût du contrat = pot-de-vin étouffant l'affaire).

**Raison** — Rendre le butin du cambriolage de l'hôtel de police (spec 01:160)
proportionnel à la violence de la partie : plus les joueurs s'entretuent, plus
la caisse de police devient une cible. Aucun coût n'est modifié, seule leur
destination l'est.

## 2026-08-23 — js/conflict-resolver.js — L'élimination définitive d'un flic (550L) réduit réellement le vivier

**Avant** — Les options 300L (retour hôtel de police) et 550L (définitif)
faisaient exactement la même chose : `splice` du flic. Le plafond de flics était
la constante 7 recomptée sur le plateau, donc un flic « définitivement retiré »
pouvait être redéployé pour 180L. Payer 250L de plus n'apportait rien.

**Après** — 300L : le flic quitte le plateau, le vivier `gs.flics.reserves` est
intact, il peut être redéployé. 550L : `gs.flics.reserves--` et
`gs.flics.elimines++`, le flic est perdu pour toute la partie. Le plafond de
flics en jeu suit désormais `gs.flics.reserves` (et non plus la constante 7),
ce qui rend enfin effective la carte magouille `retirer_flic_reserve`.

**Raison** — spec 01:136 distingue explicitement les deux tarifs ; sans effet
distinct, le second était un piège pour le joueur.

## 2026-08-23 — js/revenue-engine.js — La dose se revend 4 lingots (et non 3)

**Avant** — `SELL_PRICE.dose = 3` pour un prix d'achat de 2 : la marge d'un
dealer était de 1 lingot par dose. Sur une case d'indice D moyen (3,7), un
dealer rapportait ~4L par tour pour un investissement de 40L + 2 armes (48L),
soit 12 tours d'amortissement — deux fois plus lent qu'un trafiquant (marge 4L,
~15L/tour). La filière drogue était mécaniquement inférieure à la filière armes,
et le titre « Roi du marché de la drogue » (8 dealers, 10 pts) ne se jouait
jamais.

**Après** — `SELL_PRICE.dose = 4`. Marge de 2L/dose, 3L avec un labo (achat à
1L). Un dealer s'amortit en ~6,4 tours, exactement comme un trafiquant (~6) et
comme les bâtiments de rente. Le labo devient le vrai moteur de la filière :
6 dealers + labo ≈ 66L/tour.

**Raison** — Écart assumé à la table de la spec 01:84 (« 3 lingots »). Deux
filières concurrentes ne sont intéressantes que si elles s'équivalent : sinon
l'une n'est jouée que par défaut. Le plafond de vente reste l'indice D du bloc
et le stock de doses, donc la marge accrue n'ouvre aucune boucle infinie —
elle est bornée par les plafonds d'approvisionnement (110 doses/tour pour toute
la table).

---

## 2026-08-23 — js/revenue-engine.js — Le tripot rapporte 24L/tour (et non 14L)

**Avant** — Restaurant : 80L pour 14L/tour. Tripot : 140L pour 14L/tour, sans
condition ni contrepartie. Le tripot était strictement dominé par le
restaurant : aucune raison rationnelle de le bâtir, un bâtiment sur cinq était
mort-né.

**Après** — `CONSTRUCTION_REVENUE.tripot = 24`. Amortissement : restaurant
80/14 = 5,7 tours ; tripot 140/24 = 5,8 tours. Les deux sont équivalents en
rentabilité mais pas en ticket d'entrée : le restaurant est le premier
investissement accessible, le tripot celui du milieu de partie.

**Raison** — Écart assumé à spec 01:151 (« 14 lingots/tour »). Un choix qui
n'en est pas un n'est pas un choix : deux bâtiments de rente doivent se
départager par le montant à immobiliser, pas par une infériorité pure. Un test
verrouille l'invariant (`tripot > restaurant`, amortissements à moins de
2 tours d'écart).

---

## 2026-08-23 — js/revenue-engine.js — Le bordel encaisse les passes de ses 3 cases, il ne les double plus

**Avant** — Les 3 prostituées de luxe du triangle touchaient leurs passes dans
la boucle des pions (`p × 3` chacune), PUIS le bordel réencaissait `p × 3` pour
chacune des mêmes cases : le revenu était compté deux fois (90L/tour au lieu de
45L sur un triangle de p=5). De plus, le bordel pouvait être bâti sur n'importe
quelle case possédée, à l'autre bout de la carte, et n'y prenait possession que
d'une seule case.

**Après** — Trois règles solidaires :
1. Le bordel se bâtit obligatoirement sur l'une des 3 cases de son triangle
   (spec 06:52) ; `canBuild` accepte une case cible et ne retient que les
   triangles qui la contiennent.
2. La pose donne la possession des 3 cases du triangle (spec 06:53).
3. Le bordel encaisse `Σ(p × 3)` sur ses 3 cases **à la place** des passes de
   rue des prostituées de luxe qui s'y trouvent — plus de double comptage. Il
   paie tant qu'il tient les cases, **que les filles y soient restées ou non**.

**Raison** — Supprimer le doublon sans rendre les 440L inutiles. Avec la seule
règle « le bordel remplace », la construction n'aurait rapporté strictement
rien de plus que les 3 filles laissées dans la rue. En rendant le revenu
indépendant de la présence des pions, le bordel devient une **rente foncière**
qui libère trois prostituées de luxe (240L de pions) pour les redéployer
ailleurs, où elles regagnent leurs passes : le gain réel est de l'ordre de
+36L/tour, plus 3 cases acquises (points de quartier), +1 point de
construction, et l'accès au casino, au chantage et à la corruption des
incorruptibles à demi-tarif. Un flic adverse posé sur une case du triangle en
ampute la part correspondante : le réseau reste attaquable.

---

## 2026-08-23 — js/revenue-engine.js — La dotation des administrations est personnelle et globale au tour

**Avant** — Le plafond appliqué était `stock_du_point + bonus_du_joueur`, mais
la déduction se faisait entièrement sur le stock commun : le bonus personnel du
possesseur d'ambassade vidait la réserve des autres joueurs et pouvait la rendre
négative (port à 10 armes, commande de 40 → `pool = −30`), refusant toute
commande aux joueurs servis ensuite. Le bonus était en outre ré-accordé
**à chaque point d'approvisionnement** : un joueur possédant une seule
administration pouvait encaisser +10 armes sur chacun des 7 points, soit +70.

**Après** — Le bonus devient une **dotation personnelle du tour** : on puise
d'abord dans le stock commun (qui ne descend jamais sous zéro), le reliquat est
prélevé sur la dotation, et celle-ci est consommée une seule fois pour
l'ensemble des ordres du joueur. Valeurs inchangées (+3 prostituées, +10 armes,
+20 doses par administration, spec 01:98-101).

**Raison** — Le stock commun est la principale source de tension du jeu (46
armes par tour pour 2 à 6 joueurs). Un bonus qui se sert dans la réserve des
autres transforme un avantage en monopole ; multiplié par point, il produisait
littéralement de l'arme à partir de rien. La dotation reste un avantage fort et
convoité — les 3 administrations sont 3 cases précises à conquérir — mais
additif, borné et lisible.

---

## 2026-08-23 — js/revenue-engine.js — On ne bâtit et on ne recrute que sur une case sous contrôle

**Avant** — `_buildConstruction` ne testait que l'absence de construction :
n'importe quelle case du plateau, y compris une case adverse tenue par un homme
armé, un cimetière ou un camp de gitans, acceptait un bâtiment — et la pose
transférait la propriété de la case au bâtisseur. `recruter` plaçait de même une
prostituée sur n'importe quelle case et s'en attribuait la propriété.

**Après** — Construction et recrutement exigent que la case soit contrôlée par
le joueur (propriétaire ou pion présent) et qu'aucun homme armé adverse ne s'y
trouve. Les cimetières et les camps de gitans sont interdits à la construction
(spec 01:155), les camps de gitans le sont aussi au recrutement.

**Raison** — Conquérir une case est le travail de la phase 5 et de
`conflict-resolver.js` ; permettre de la prendre en phase 1 en posant 80L de
restaurant court-circuitait tout le système de conflits et de supports. Le
durcissement va légèrement au-delà de la lettre des specs (qui n'interdisent
pas explicitement de bâtir chez l'adversaire) : il est journalisé à ce titre.

---

## 2026-08-23 — js/revenue-engine.js — Un flic coupe aussi les revenus des bâtiments

**Avant** — Le blocage par un flic adverse n'était appliqué qu'aux pions. Un
restaurant, un tripot ou un bordel encaissaient normalement sous le nez du flic,
ce qui vidait de tout sens l'exception explicite accordée au casino.

**Après** — Un flic adverse coupe l'intégralité des revenus de sa case, pions et
bâtiment compris ; seul le casino y est insensible (spec 01:153). Le flic ne
bloque jamais le joueur qui l'a déployé (flic corrompu, décision 06:19).

**Raison** — Spec 01:136 (« bloque une case (plus de revenus) »). Conséquence
d'équilibrage assumée : 180L de flic peuvent désormais assécher 24L/tour de
rente adverse, ce qui donne enfin un usage offensif rentable au pion policier et
justifie le surcoût du casino (460L) comme rente inattaquable.

---

## 2026-08-23 — js/mayor-engine.js — Les pouvoirs « incorruptible » et « exproprier » passent en phase 1

**Avant** — Les specs (01:210-211) plaçaient ces deux pouvoirs en phase 5. Or la
phase 5 est une phase de révélation automatique : aucun panneau d'ordres n'y est
affiché (seules les phases 1 et 4 ouvrent le hotseat). `availablePowers` filtrant
strictement sur la phase courante, les deux pouvoirs n'étaient proposés nulle
part. Aucun incorruptible ne pouvait donc apparaître sur le plateau, ce qui
rendait également mortes l'élimination à 700 L et la carte
`deplacer_incorruptible`.

**Après** — Les 8 pouvoirs du maire sont déclarés `phase: 1`.

**Raison** — Écart assumé à la lettre des specs pour rendre le contenu
atteignable. Le déroulé du tour reste cohérent : le maire déploie son
incorruptible ou exproprie AVANT que les déplacements de la phase 4 ne soient
donnés, ce qui laisse aux joueurs un tour entier pour réagir au blocage — plus
tendu, et lisible, qu'une décision tombant après la résolution.

---

## 2026-08-23 — js/mayor-engine.js — La coupure d'électricité du maire dure le mandat, puis s'arrête

**Avant** — `_coupure` empilait `{ quartier, tour_debut, par }` sans durée ni
`source`. `SpecialEntities.processEndOfMandate` ne rétablit l'électricité que
pour les entrées marquées `source: 'carte'` : la coupure du maire était donc
DÉFINITIVE, stérilisant un quartier entier (jusqu'à 15 pts et 9 zones) pour le
reste de la partie.

**Après** — L'entrée porte `duree` = nombre de tours restants jusqu'à la fin du
mandat (7 − tour mod 7), `tour_fin`, `origine: 'maire'` et `source: 'carte'`,
valeur qui sert de discriminant « coupure temporaire à durée » dans
`special-entities.js`. Un quartier déjà coupé ne peut plus l'être une seconde
fois (le privilège n'est plus gaspillé).

**Raison** — Spec 01:214 : « pendant tout le mandat ». Le champ `source` est
aujourd'hui le seul marqueur de restauration reconnu ; `origine` conserve
l'information réelle en attendant que `processEndOfMandate` restaure toute
coupure porteuse d'une `duree` quelle que soit sa provenance.

---

## 2026-08-23 — js/mayor-engine.js — L'expropriation déloge les pions du joueur exproprié

**Avant** — `_exproprier` posait `zone.proprietaire = null` sans toucher aux
pions. `ConflictResolver._updateOwnership`, exécuté à chaque fin de phase 5,
recalcule le propriétaire à partir des pions présents : la victime récupérait ses
4 blocs dans le même tour. Le privilège (1 des 2 du mandat) était consommé pour
rien.

**Après** — L'expropriation exige exactement 4 zones distinctes réellement
possédées par la cible (sinon refus sans coût), retire la propriété ET déloge du
plateau les pions du joueur exproprié présents sur ces zones (flics et pions
neutres exclus). Une construction reste debout mais sans propriétaire.

**Raison** — Écart aux specs (qui ne parlent que de propriété) rendu nécessaire
par le recalcul automatique de la propriété. Conséquence d'équilibrage assumée :
l'expropriation devient le pouvoir le plus violent du maire — jusqu'à 4 pions
armés perdus — ce qui justifie qu'elle coûte la moitié du mandat et donne une
vraie raison de se battre pour la mairie.

---

## 2026-08-23 — js/mayor-engine.js — Plafond de 2 incorruptibles réellement appliqué

**Avant** — `SpecialEntities.MAX_INCORRUPTIBLES = 2` n'était référencé nulle
part ; `_incorruptible` empilait sans compter.

**Après** — Le déploiement est refusé si `posés sur le plateau + éliminés ≥ 2`,
et deux incorruptibles ne peuvent pas occuper la même zone.

**Raison** — Spec 01:137 : « seulement 2 dans le jeu » et « 700 lingots
(définitif, retiré du jeu) ». Les deux jetons forment une réserve fermée :
éliminer un incorruptible à 700 L le retire pour de bon et prive le maire d'un
jeton — c'est ce qui donne son prix à l'élimination.

---

## 2026-08-23 — js/mayor-engine.js — Un privilège n'est consommé que par un effet réel

**Avant** — Taxe à 0 L, saisie chez un joueur ruiné, repositionnement d'une liste
vide de flics, expropriation de zones non possédées : tous ces cas renvoyaient
`ok: true` et consommaient un des 2 privilèges du mandat.

**Après** — Chacun renvoie `{ ok: false, msg, reason }` et laisse les compteurs
`gs.maire.privileges_restants` / `joueur.privileges_maire_restants` intacts.

**Raison** — Un mandat n'offre que 2 privilèges : les gaspiller sur une action
sans effet est une punition arbitraire du joueur, pas une décision de jeu.

---

## 2026-08-23 — js/mayor-engine.js — Les gitans se déplacent vraiment (pions inclus)

**Avant** — `_deplacer_gitans` ne touchait que le drapeau `zone.gitans` et
`gs.gitans.positions`. Les pions `{ type: 'gitan' }` restaient sur les îles et le
plateau affichait deux camps là où il n'y en avait qu'un.

**Après** — Le pouvoir retire les pions gitans de leurs cases, les repose sur les
zones choisies, met à jour drapeaux et `gs.gitans.positions`. Le nombre de camps
est conservé (autant de zones que de camps existants, distinctes, connues, non
bâties), sinon l'ordre est refusé sans coût.

**Raison** — Spec 01:138 et 01:157. Contrainte ajoutée (nombre de camps constant,
pas de camp sur une parcelle bâtie) : sans elle le maire pouvait multiplier ou
supprimer les camps de gitans, donc les points d'achat d'armes illimitées.
`gs.gitans.positions` est retenu comme représentation faisant foi ; les pions et
les drapeaux en sont le miroir.

---

## 2026-08-23 — js/special-entities.js — Les 8 gangs sans effet sont refusés, plus feints

**Avant** — Huit gangs sur quinze (Cartel de Bogota, Mafia Créole, Syndicat des
Dockers, Lobby des Taxis, Gang du Bolito, Triades, Ku Klux Klan, St James Boys)
écrivaient un marqueur dans `gs._blocages` / `gs._restrictions_ethniques` /
`joueur._immunite_ethnie` que **personne ne lit**, renvoyaient `{ ok: true }` et
affichaient un toast de succès. Le joueur consommait son unique activation de
quartier pour un effet inexistant.

**Après** — `canActivateGang` ET `applyGangEffect` renvoient
`{ ok:false, reason:'effet_non_implemente', msg }` pour ces huit effets
(`SpecialEntities.EFFETS_NON_IMPLEMENTES`). Rien n'est inscrit dans
`gs.gangs_actifs` : le quartier reste activable le jour où l'effet existera.
L'en-tête du fichier documente, marqueur par marqueur, le module qui doit le lire
(RevenueEngine, TurnManager, ConflictResolver) — retirer une entrée de
`EFFETS_NON_IMPLEMENTES` est la dernière étape de cette implémentation.
Le `default:` du `switch`, qui annonçait « effet passif » pour n'importe quel
effet inconnu, renvoie désormais `reason:'effet_inconnu'`.

**Raison** — Un jeu qui annonce un effet qu'il n'applique pas est pire qu'un jeu
qui refuse : le joueur bâtit sa stratégie sur une promesse fausse. Écart assumé
aux specs (7 gangs jouables sur 15 au lieu de 15) jusqu'au chantier « contenu inerte ».

---

## 2026-08-23 — js/special-entities.js — Revente en gros (Lobby Juif) : 12L/arme, 6L/dose, une fois par tour

**Avant** — `revente_marchandises` payait 20 L par arme et 10 L par dose, sans
limite de fréquence, sur un gang permanent (`duree: -1`, `usage_unique: false`).
Les armes s'achètent 4 L (`BUY_PRICE.armes`) et se revendent normalement 8 L
(`SELL_PRICE.arme`) : acheter à 4 pour revendre à 20 tous les tours était une
pompe à lingots infinie, plafonnée seulement par les stocks des points d'appro.

**Après** — `PRIX_REVENTE = { arme: 12, dose: 6 }`, soit 1,5× le prix de vente
normal, et **une seule revente par tour** (`gangInfo.dernier_tour_revente`).
Une revente à vide renvoie `{ ok:false }` au lieu d'un succès à 0 L.

**Raison** — Le gang doit rester un avantage (écouler tout un stock d'un coup au
lieu de le vendre pion par pion, plafonné par l'indice A du bloc), pas une
machine à imprimer de l'argent qui rend la tension économique du jeu nulle.

---

## 2026-08-23 — js/special-entities.js — Le bonus permanent des Nets survit à la fin de mandat

**Avant** — `processEndOfMandate` faisait `j.actions_bonus = 0` pour tous les
joueurs. Le gang « Les Nets » (midtown, `duree: -1`, permanent) accordait
+2 actions/tour… effacées à la première élection, sans que rien ne les réattribue.

**Après** — `recomputeActionsBonus` reconstruit `actions_bonus` à partir des seuls
bonus permanents encore actifs dans `gs.gangs_actifs`. Les bonus temporaires
(cartes magouille, magouille-engine.js:502) continuent d'expirer. En contrepartie
le bonus n'est accordé qu'une fois (`gangInfo.effet_applique`) : deux appels
successifs à `applyGangEffect` ne le cumulent plus.

**Raison** — Un effet annoncé permanent doit l'être ; et un effet permanent ne
doit pas non plus se cumuler à volonté par répétition de l'appel.

---

## 2026-08-23 — js/special-entities.js — Traversée du camp de gitans réellement implémentée

**Avant** — `canTraverseGitans` et `payTraversalCost` existaient sans aucun
appelant. La mécanique de spec 01:141 et spec 06:64-78 (« le seul moyen de se
déplacer de 2 cases en un tour ») n'existait pas dans le jeu.

**Après** — `canTraverseGitans(gs, pid, ordre, adjacences)` valide la règle
complète (départ et sortie adjacents au camp, sortie ≠ départ, jamais sur le camp
ni sur un autre camp, ni sur une case bloquée par un incorruptible, pas deux
hommes armés sur la case d'arrivée, pion sacrifié à soi et différent du voyageur)
et `traverseGitans(...)` l'exécute atomiquement. Coût inchangé (5 doses + 5 armes
+ 1 pion). Ajouts au-delà des specs : la sortie ne peut pas être un autre camp de
gitans, ni une case bloquée par un incorruptible, et un homme armé ne sort pas sur
une case déjà tenue par un homme armé.

**Raison** — Sans ces trois garde-fous la traversée contournait des règles que
tous les autres déplacements respectent (spec 01:137, cohabitation des pions armés).

---

## 2026-08-23 — js/special-entities.js — Le casino offert et l'élimination par gang cessent d'ignorer les règles

**Avant** — `casino_gratuit` posait un casino sur **n'importe quelle** zone libre,
y compris une parcelle adverse, un cimetière ou un camp de gitans.
`eliminer_3_pions` acceptait pour cible un flic adverse (normalement 300 L ou
550 L) ou un incorruptible (700 L), et le compteur affiché était faux dès que deux
cibles partageaient une zone.
`eliminer_prostituees_quartier_voisin` acceptait n'importe quel quartier, y compris
le sien.

**Après** — Le casino exige une parcelle constructible (`canBuildOnZone` : ni
gitans ni cimetière, spec 01:155) et tenue par le joueur. L'élimination refuse les
flics, incorruptibles, gitans, ses propres pions et les doublons, et retire les
pions **par référence** au lieu d'index capturés d'avance. La Mafia Bulgare refuse
son propre quartier et, si l'appelant fournit `params.adjacences`, tout quartier
non voisin.

**Raison** — Un pouvoir de gang reste un coup fort, pas une dérogation à
l'ensemble des règles de placement et d'élimination.

---

## 2026-08-23 — js/game-state.js — Placement initial : une case, un pion armé, une prostituée

**Avant** — `_placeInitialPions` avançait son curseur de case uniquement pour les
pions armés et ne revérifiait pas la case de repli. Résultat sur les données
réelles : Harlem démarrait avec MN10 = [trafiquant, dealer] et MN11 =
[trafiquant, dealer] (deux pions armés sur la même case dès le tour 1), Bergen
empilait ses 3 prostituées sur BG03, et 2 à 6 cases d'autres quartiers restaient
vides alors qu'il restait des pions à poser.

**Après** — Les pions sont posés en respectant les deux règles de cohabitation
(1 pion armé max et 1 prostituée max par case) et en étalant les rondes : les
prostituées commencent leur tour de garde là où les armés l'ont fini. Le nombre
de cases occupées vaut désormais `min(nb de cases du quartier, nb de pions posés)`.

**Raison** — specs/01 « Cohabitation » (un seul pion armé par case) et specs/06
décision 5 (une seule prostituée par case). L'invariant est vérifié partout
ailleurs dans le code (revenue-engine, conflict-resolver) : le laisser violer par
l'état initial faussait la résolution de conflits dès le premier tour.

---

## 2026-08-23 — js/game-state.js — Pion de départ non plaçable : indemnisation au coût de création

**Avant** — Rien n'était prévu : Harlem (3 cases, 5 pions armés de dotation)
posait ses 2 pions en trop sur des cases déjà occupées.

**Après** — Un pion de départ qu'aucune case du quartier d'origine ne peut
accueillir légalement n'est pas posé ; le joueur reçoit à la place son **coût de
création** (specs/01) en lingots et en armes. Concrètement Harlem passe de
« 3 trafiquants + 2 dealers, dont 2 illégaux » à « 3 trafiquants posés +
80 lingots et 4 armes » (20 → 100 lingots, 10 → 14 armes).

**Raison** — Écart aux données de `data/quartiers-gameplay.json`, assumé : la
dotation de Harlem est mécaniquement impossible à poser en respectant les règles.
L'indemnisation préserve la valeur du quartier (le joueur peut recréer ses pions
quand il aura conquis des cases) sans démarrer sur un plateau illégal, et évite
de toucher aux données que d'autres chantiers utilisent.

---

## 2026-08-23 — js/game-state.js — Le bonus de cartes magouille de départ n'est plus détruit

**Avant** — `_distributeStartingResources` écrivait
`joueur.cartes_magouille_bonus`, que `_placeInitialPions` supprimait quelques
instructions plus tard, dans le même appel à `create`. North Hudson et Jersey
City perdaient donc silencieusement leur carte bonus.

**Après** — `cartes_magouille_bonus` est un champ de l'état joueur à part
entière (défaut 0), conservé, sauvegardé et disponible pour la phase de draft.
Le champ de travail `pions_initiaux` a lui disparu : le placement relit les
données du quartier au lieu de passer par l'objet joueur.

**Raison** — Le privilège est décrit dans les données et doit être rendu au
joueur. La consommation effective (1 carte de plus au draft) reste à brancher
dans `MagouilleEngine.draftPhase` — voir la note de coordination.

---

## 2026-08-23 — js/game-state.js — Sauvegardes : clés volatiles exclues, version vérifiée

**Avant** — `serialize()` copiait `Object.keys(this)` en aveugle, donc
`_cartes_index` (~72 Ko, reconstructible par `MagouilleEngine._ensureIndex`)
partait dans chaque sauvegarde et dans l'URL de partage (10 Ko → 83 Ko mesurés,
payload d'URL 1 366 → ~19 600 caractères, QR code impossible). `GameState.VERSION`
n'était jamais relu et `load()` faisait un `Object.assign` brut sans try/catch.

**Après** — Convention : toute clé de l'état préfixée `_` est volatile et n'est
jamais sérialisée (delta mesuré après `initDeck` : +73 113 → +590 octets).
`GameState.migrer()` / `GameState.deserialize()` valident la structure, refusent
proprement une version future ou illisible (`{ok:false, msg, reason}`) et
complètent une sauvegarde ancienne avec les valeurs par défaut du schéma courant.
`save()`, `load()`, `hasSave()` et `deleteSave()` ne lèvent plus jamais :
`save()` renvoie `{ok, msg, reason}` et `hasSave()` ne propose « Continuer » que
si la sauvegarde est réellement rechargeable.

**Raison** — Un lien de partage doit tenir dans un QR code (2 953 octets) et une
sauvegarde d'un schéma inconnu doit être refusée avec un message, pas produire un
`TypeError` au milieu d'une partie. Le stockage peut être indisponible (Safari
privé, quota) sans que la partie se fige.

---

## 2026-08-23 — js/turn-manager.js — Égalité électorale : cascade de départage et mairie réellement libérée

**Avant** — `getElectionResults` renvoyait `winner: null, tied: true` dès que
deux candidats étaient à égalité de voix, et `applyElectionResult(null)` posait
`est_maire = false` sur le sortant mais ne touchait pas `gs.maire`. Résultat :
le HUD annonçait « Aucun maire en poste » pendant que l'ancien maire continuait
d'encaisser +15 points (`getPlayerPoints`) et de dépenser ses privilèges
(`gs.maire.privileges_restants` intact, `privileges_maire_restants` jamais remis
à 0). Les specs ne tranchent pas l'égalité électorale : seule la Coupole a une
règle (specs/01 « en cas d'égalité : le joueur avec le plus d'électeurs tranche »).

**Après** — Cascade de départage, appliquée dans cet ordre :
1. **Puissance électorale** la plus élevée — transposition directe de la règle
   Coupole ci-dessus.
2. **Anti-cumul de mandats** : à puissance strictement égale, le maire sortant
   s'efface devant son ou ses challengers.
3. **L'outsider** : à puissance égale et sans sortant en lice, le candidat le
   moins fortuné en lingots l'emporte.
4. **Siège vacant** : égalité irréductible (même puissance, même fortune, pas de
   sortant à écarter) → personne n'est élu.

Dans tous les cas, `applyElectionResult` libère d'abord la mairie
inconditionnellement (`gs.maire` remis à `{joueur_id:null, privileges_restants:0}`,
`est_maire` et `privileges_maire_restants` remis à zéro sur TOUS les joueurs)
avant d'installer l'élu s'il y en a un. Un `winnerId` hors jeu est traité comme
une absence de vainqueur.

**Raison** — Le point 1 rend le territoire décisif jusqu'au dernier bulletin.
Le point 2 est un frein anti-boule-de-neige : le maire touche déjà +15 points
pendant 7 tours, il ne doit pas conserver le siège par simple inertie. Le point 3
fait pencher l'arbitrage vers celui qui est en retard, ce qui garde la partie
tendue. Le point 4 devient très rare, et quand il arrive un mandat entier sans
maire (aucun privilège, aucun +15 point pour personne) est une situation lisible
et jouable — bien plus que l'état incohérent d'avant.

---

## 2026-08-23 — js/turn-manager.js — Inéligibilité (carte 22) : photographiée à l'ouverture du scrutin

**Avant** — `gs.joueurs[x]._ineligible`, posé par la carte 22 « Carte vidéo
posthume » (400 L + 1 homme sacrifié), n'était lu nulle part : ni par la liste
des candidats, ni par le dépouillement. Pire, `processEndOfMandate` effaçait le
marqueur à la première ligne de `_beginElection`, avant même l'ouverture du vote.

**Après** — `_beginElection` photographie les inéligibles AVANT d'appeler
`onEndOfMandate`, dans `this.ineligibles`. `getEligibleCandidates()` expose la
liste des candidats recevables, et le dépouillement annule les bulletins portés
sur un inéligible (la voix est perdue, comptée dans `bulletinsNuls`).
L'inéligibilité vaut pour **un seul scrutin** — le marqueur reste effacé par la
fin de mandat, comme le prévoyait déjà `special-entities.js`.
Garde-fou : si TOUS les joueurs sont inéligibles, le scrutin redevient ouvert à
tous — une élection sans candidat n'a pas de sens.

**Raison** — La carte est documentée dans specs/01 (ligne 256) et coûte cher ;
sans lecture du marqueur elle n'avait strictement aucun effet mécanique. Annuler
le bulletin plutôt que le reporter garde la sanction lisible : voter pour un
inéligible, c'est gâcher sa voix.

---

## 2026-08-23 — js/turn-manager.js — Budget de 5 ordres appliqué par le moteur

**Avant** — `submitOrders(orders)` stockait le tableau reçu tel quel sans jamais
consulter `maxOrdersForPhase`. Le plafond de specs/06 (décision 4 : 5 ordres par
tour, répartis librement entre phase 1 et phase 4, +2 avec Central Park ou la
Secrétaire particulière) n'existait que dans l'affichage du panneau d'ordres.

**Après** — `submitOrders` écarte les ordres au-delà du budget (ils ne sont
jamais exécutés), refuse toute validation hors d'une phase de saisie sans faire
tourner le hotseat, et renvoie `{ok, msg, reason, retenus, ignores}` au style du
projet. Un dépassement est aussi journalisé dans `revealLog`.

**Raison** — Conformité à la spec, pas un écart : c'est le contrôle qui manquait
côté moteur. Journalisé ici parce que le comportement effectif du jeu change
(une UI buguée, une carte magouille ou un lien de partage bricolé ne peuvent
plus offrir d'ordres gratuits).

---

## 2026-08-23 — js/turn-manager.js — Persistance du tour en cours (`gs.etat_tour`)

**Avant** — Toute la mémoire du tour (file hotseat, `supplyOrders`, `moveOrders`,
`ordersUsedP1`, `votes`, `draftHands`, phase de l'automate) vivait dans
l'instance `TurnManager` et n'était jamais sérialisée. Un rechargement en pleine
phase 4 repartait en phase 1 : ordres des autres joueurs perdus, ressources déjà
dépensées, et budget d'ordres remis à zéro — 5 ordres offerts. `resumePhase()`,
écrite pour ce cas, n'avait aucun appelant.

**Après** — `serializeTurnState()` / `restoreTurnState(data)` forment une paire
publique ; `_emit()` dépose le cliché sur `gs.etat_tour` (clé non volatile, donc
embarquée par `GameState.serialize()` sans modifier game-state.js) avant chaque
`gs.save()`. `startOrResume()` reprend le tour s'il est exploitable, sinon en
démarre un neuf. Un cliché d'une autre version, d'un autre nombre de joueurs,
d'un autre tour ou de phase inconnue est refusé avec `{ok:false, msg, reason}`
plutôt qu'appliqué de travers.

**Raison** — Le jeu est une application hotseat sur tablette : fermer l'onglet ou
suivre un lien de partage est le cas normal, pas le cas limite. Un tour rejoué
avec des ressources déjà consommées et un budget d'ordres neuf n'est pas une
gêne, c'est une triche involontaire.

---

## 2026-08-23 — js/heist-engine.js — La coupure d'électricité change le PRIX EXIGÉ, pas seulement le prix prélevé

**Avant** — `canHeist('labo')` exigeait 20 armes + 2 cartes en toutes
circonstances, alors que `executeHeist` ne prélevait que 10 armes + 1 carte si
l'électricité de la cible était coupée. Un joueur qui coupait l'électricité —
exactement ce que la règle conseille — se voyait refuser le casse avec
« 20 armes requises (12) » alors qu'il n'en aurait dépensé que 10. La réduction
n'était donc pas un avantage tactique mais un remboursement après coup, réservé
à ceux qui n'en avaient pas besoin. Le casino, lui, ignorait complètement la
réduction (3 cartes en toutes circonstances).

**Après** — Le coût est calculé en un seul endroit (`HeistEngine.coutLabo` /
`coutCasino`) et sert à la fois à `getProgress` (affichage), `canHeist`
(validation) et `executeHeist` (prélèvement) :

| Casse  | Plein tarif        | Électricité coupée |
|--------|--------------------|--------------------|
| labo   | 20 armes + 2 cartes | 10 armes + 1 carte |
| casino | 3 cartes            | **2 cartes**       |

`canHeist` et `getProgress` acceptent un 5e paramètre optionnel `params`
(`{ targetZone }`) : avec une cible désignée, c'est SA coupure qui compte ;
sans cible (écran de liste), on annonce le tarif de la cible la moins chère,
puis `executeHeist` re-valide sur la cible réellement choisie. Les signatures
publiques restent compatibles avec les appels existants de `js/app.js`.

**Raison** — specs/01 (ligne 169) dit « Coupure d'électricité = coût du
cambriolage divisé par 2 », sans restreindre au labo : l'extension au casino
comble un manque plutôt qu'elle ne s'écarte de la règle (3 → 2, arrondi au
supérieur, pour que la carte reste un coût réel). L'écart assumé est le passage
de 3 à 2 cartes pour le casino. Effet de jeu recherché : la carte « Coupure
d'électricité » (gratuite, 3 exemplaires) devient une vraie ouverture offensive
— on prépare un casse en éteignant le quartier — au lieu d'un bonus qui ne
change rien à ce qu'on a le droit de tenter.

---

## 2026-08-23 — js/heist-engine.js — L'Hôtel de Police coûte réellement 2 hommes de main

**Avant** — `executeHeist('hotel_police')` ne cherchait ses 2 sacrifiés que sur
la case de l'Hôtel de Police. Or `canHeist` n'exige qu'UN pion armé sur place
(un seul y tient à la fois, règle de cohabitation) : le casse annoncé « vous
perdez 2 hommes » n'en coûtait donc qu'un dans la quasi-totalité des parties.

**Après** — Le premier homme est pris sur le bloc, le second ailleurs sur le
plateau si le bloc n'en porte pas deux. Le message annonce le nombre réellement
retiré.

**Raison** — specs/01 : « 1 pion sur le bloc + bordel + plus de flics que
quiconque (min 2), perd 2 hommes ». Le butin (moitié de la caisse de police, qui
grossit à chaque élimination payante) était payé au tarif d'un seul homme.

---

## 2026-08-23 — js/heist-engine.js — Les cartes sacrifiées par un casse repartent à la défausse

**Avant** — `j.cartes_magouille.splice(0, n)` faisait disparaître les uid du
circuit : ni `defaussees`, ni `retirees_du_jeu`. Chaque casse amputait
définitivement le stock recyclable de 65 exemplaires et aggravait la pénurie de
tirage traitée dans `js/magouille-engine.js`.

**Après** — `HeistEngine._defausserCartes` pousse les uid sacrifiés dans
`gs.deck_magouille.defaussees`. `executeHeist` accepte en outre un
`params.cartes` optionnel (uid désignés par le joueur) ; à défaut, le début de
la main est pris comme avant.

**Raison** — Correction de cohérence, pas d'équilibrage : le circuit du deck
doit rester fermé. Sacrifier une carte doit signifier « je la rends au jeu »,
pas « je la détruis pour tout le monde ».

---

## 2026-08-23 — js/contract-engine.js — Un contrat trahi a désormais un coût : dette, réputation, Coupole

**Avant** — `honore` était posé à `false` au premier défaut de paiement, jamais
remis à `true`, et servait uniquement à afficher un badge « ⚠ Non honoré ».
Aucune sanction, aucun lien avec la Coupole — laquelle jugeait un accusé sans
jamais consulter les contrats. Le manque non versé était oublié dès le tour
suivant. Un joueur pouvait donc signer n'importe quoi, ne rien payer, et n'en
subir strictement aucune conséquence ; symétriquement, un joueur à court de
trésorerie un seul tour restait marqué en rouge pour toute la durée du contrat.
Les 4 types non automatiques (non-agression, soutien électoral, protection,
accord libre) n'avaient aucun effet moteur du tout.

**Après** — Trois mécaniques, toutes dans `js/contract-engine.js` :

1. **Dette** — le manque devient `c.dette` et s'ajoute à l'échéance du tour
   suivant (`montant + dette`). Solder l'arriéré remet `honore` à `true` :
   le drapeau décrit l'état COURANT du contrat, ce n'est plus une cicatrice.
   Le passé reste consigné dans `c.manquements` et `c.griefs`.
2. **Réputation** — chaque tour de défaut coûte **100 000 électeurs** au
   débiteur (`MALUS_ELECTEURS_MANQUEMENT`), soit exactement le tarif d'une
   élimination payante dans `js/conflict-resolver.js` (≈ une case de quartier
   moyen). La trahison se paie au scrutin, sans que personne ait à agir.
3. **Coupole** — les manquements constatés par le moteur (`type: 'constat'`) et
   les violations signalées par la partie lésée sur un contrat sans effet moteur
   (`ContractEngine.signalerViolation`, `type: 'declaration'`) sont archivés sur
   le contrat. `canConvokeCoupole(gs, plaignant, accuse)` — 3e argument
   OPTIONNEL, l'appel à 2 arguments de `js/app.js` est inchangé — refuse une
   saisine sans aucun grief. `resolveCoupole` en tire les conséquences :
   * **coupable** : 2 hommes de main (specs/01) + 100 000 électeurs +
     **restitution forcée** de la dette au plaignant (dans la ressource du
     contrat, à hauteur de ce que le condamné possède) + clôture des contrats
     jugés ;
   * **acquitté sans le moindre constat** : le plaignant perd 100 000 électeurs
     (`sanction_plaignant`) — accuser à vide se retourne contre soi ;
   * **acquitté malgré un constat** : le plaignant ne paie rien ; il avait des
     pièces au dossier, l'assemblée a couvert l'un des siens.

`createContract` refuse en outre un contrat avec soi-même, un type inconnu ou un
transfert à montant nul, et renvoie `{ok:false, reason}` dans ce cas.

**Raison** — Écart assumé : les specs décrivent la Coupole mais ne disent rien
du coût d'un contrat non honoré. Sans conséquence, le contrat n'était qu'un
pense-bête et la phase de négociation ne produisait aucune tension : promettre
ne coûtait rien, donc une promesse ne valait rien. Le choix d'une sanction
**électorale** plutôt que matérielle est délibéré : elle frappe la seule
ressource qu'on ne peut pas cambrioler, elle se règle publiquement au scrutin
(le cœur politique du jeu), elle est réversible par la carte « rendre des
électeurs » — il existe donc un chemin de rédemption — et elle ne tue pas un
joueur en difficulté de trésorerie, elle le marginalise. La dette reportée
transforme un défaut en engrenage : plus on retarde, plus on doit, et plus la
saisine devient rentable pour le créancier. Enfin, punir l'accusation infondée
empêche la Coupole de devenir une arme gratuite : les 2 convocations par partie
deviennent un capital qu'on dépense sur pièces.

## 2026-08-23 — data/adjacences-osm.json — QN14 (Rockaways) raccordée au plateau par ses deux ponts

**Avant** — `"QN14": []`. Seule zone des 74 avec une liste d'adjacences vide, hors
de la composante connexe du plateau (73 + 1). Comme `getQuartierOwner`
(js/game-state.js) exige que **toutes** les zones d'un quartier aient le même
propriétaire, et qu'aucun pion ne peut entrer dans une zone sans voisin
(js/conflict-resolver.js refuse tout déplacement non adjacent), les **15 points
d'east_queens — le plus gros lot du plateau — étaient définitivement hors
d'atteinte**, sauf tirage aléatoire d'une des 3 cartes `teleporter_pion`.
east_queens étant `disponible_au_lancement: false`, aucun pion n'y démarrait non
plus : QN14 restait `proprietaire: null` à vie.

**Après** — deux arêtes ajoutées, réciproques :

* `QN14 ↔ QN10` (Howard Beach / Ozone Park) — le **Cross Bay Bridge** via Broad
  Channel. Arête **interne** à east_queens : le quartier redevient d'un seul
  tenant (9 zones, 1 composante).
* `QN14 ↔ BK18` (Canarsie / Flatlands, où se trouve Marine Park) — le **Marine
  Parkway–Gil Hodges Memorial Bridge**. Arête **inter-quartier** : elle ouvre une
  porte d'east_queens sur south_brooklyn.

Le plateau compte désormais 148 paires (au lieu de 145) et **une seule
composante connexe couvrant les 74 zones**.

**Raison** — Écart assumé à specs/04-modele-de-donnees.md:71 (« Seul QN14
(Rockaways) est isolé (péninsule) ») et au calcul par tampon de 50 m de
`tools/build-map.mjs`, qui ne franchit aucun bras d'eau et manquait donc tous les
ponts. Géographiquement la liste vide n'est pas absurde ; **ludiquement elle
stérilisait 15 des 129 points de victoire du jeu**, soit 11,6 % du plateau, et
transformait le quartier le mieux coté en décor. Les Rockaways sont réellement
reliées par deux ponts routiers : on suit la réalité plutôt que le tampon.

Le choix des **deux** ponts plutôt que d'un seul est délibéré et sert la tension :

1. Le pont de Cross Bay (interne) rend east_queens conquérable **sans sortir du
   quartier**, comme les 13 autres quartiers contigus — la conquête reste un
   objectif long (9 zones à tenir à l'unanimité), mais elle devient un objectif.
2. Le pont de Marine Parkway corrige un déséquilibre indépendant : **south_brooklyn
   (9 zones, 15 pts, quartier de départ) n'avait qu'UN seul quartier voisin**,
   north_brooklyn. Il démarrait dans un cul-de-sac, sans accès au gros lot
   d'east_queens, alors que north_brooklyn (BK5) et west_queens (QN5) y touchaient
   déjà. Les trois quartiers de départ voisins du lot ont désormais chacun leur
   porte, et QN14 devient un verrou disputé entre Brooklyn-sud et le Queens-est
   plutôt qu'un angle mort.

L'alternative — sortir QN14 d'east_queens et réduire ses points — a été écartée :
elle ramenait le meilleur quartier au niveau des autres 9-zones et supprimait un
point de friction au lieu d'en créer un.

## 2026-08-23 — data/adjacences-osm.json — MN7 ↔ MN8 : Central Park se traverse

**Avant** — `MN8` (Upper East Side, Yorkville) n'avait que des voisins **hors de
son propre quartier** : MN11 (harlem), MN5 et MN6 (midtown). upper_manhattan
(MN7, MN8, MN9) se scindait donc en `[MN7, MN9]` + `[MN8]`. C'est un quartier de
**départ** : ses pions initiaux sont placés sur ses 3 zones, mais son propriétaire
ne pouvait pas faire circuler un pion entre MN8 et le reste de chez lui sans
traverser midtown ou harlem, c'est-à-dire sans entrer en conflit chez un rival.
Aucun autre quartier de départ ne payait ce péage.

**Après** — arête réciproque `MN7 ↔ MN8`. upper_manhattan est d'un seul tenant, et
les 15 quartiers sont désormais tous parcourables sans en sortir.

**Raison** — Le tampon de 50 m a séparé les deux rives de Central Park, qui
n'appartient à aucun district. Dans la réalité les **transversales du parc**
(65e, 79e, 86e, 97e rues) relient l'Upper West Side à l'Upper East Side : le
raccord est géographiquement fondé. Impact d'équilibrage volontairement minime :
MN7 et MN8 étaient déjà tous deux voisins de MN5, la distance passe de 2 à 1 et
aucun nouveau raccourci inter-quartier n'apparaît (les deux zones sont dans le
même quartier). Le gain est une **égalité de traitement entre quartiers de
départ**, pas un avantage pour upper_manhattan.

Ces deux règles sont verrouillées par `tests/donnees.test.js` : plateau d'un seul
tenant, aucune zone isolée, réciprocité des adjacences, contiguïté interne de
chaque quartier et existence d'au moins une porte d'entrée par quartier.
