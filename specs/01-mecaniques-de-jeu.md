# 01 -- Mécaniques de jeu

## Objectif

Être le premier joueur à atteindre **55 points de victoire** en dominant les marchés
illicites, en contrôlant des quartiers et en accédant au pouvoir politique.

## Points de victoire

| Source                          | Points | Condition                                      |
|---------------------------------|--------|-------------------------------------------------|
| Roi de la prostitution          | 10     | Minimum 8 demoiselles (bordels inclus)          |
| Roi du marché de la drogue      | 10     | Minimum 8 dealers                               |
| Roi du marché des armes         | 10     | Minimum 6 vendeurs d'armes                      |
| Être maire                      | 15     | Élu lors des élections                          |
| Être le plus riche              | 10     | À partir de 2 000 lingots                       |
| Chaque construction             | 1      | Par bâtiment possédé                            |
| Posséder un quartier entier     | Variable | Selon tableau des quartiers (3 à 15 pts)       |

## Joueurs

- **2 à 6 joueurs** (optimal : 4)
- Chaque joueur a un nom, une couleur, une **ethnie** (choisie à la création) et un quartier d'origine
- L'ethnie détermine l'accès à certains quartiers quand les gangs sont activés (cf. 06-decisions-gameplay.md)

---

## Structure d'un tour

Chaque tour comporte **5 phases** jouées séquentiellement.
Au total, chaque joueur dispose de **5 ordres par tour** (répartis entre approvisionnement et déplacement).

### Phase 1 : Rédaction des ordres d'approvisionnement, construction et transaction

Chaque joueur rédige secrètement ses ordres :
- Commandes de denrées (drogue, armes, prostituées) aux points d'approvisionnement
- Constructions de bâtiments
- Transactions avec d'autres joueurs (échanges d'argent, denrées, pions, bâtiments)

**Règle de commande** : une ligne par denrée et par point d'approvisionnement.

### Phase 2 : Révélation des ordres et récolte

- Tous les ordres sont révélés simultanément
- Chaque joueur récupère ses commandes
- Calcul automatique des revenus (prostituées, dealers, trafiquants, constructions)

### Phase 3 : Négociation

- Phase libre de discussion orale entre joueurs
- Accords, menaces, rackets, alliances
- Possibilité de formaliser des contrats écrits
- Pas de limite de temps (ou timer configurable)

### Phase 4 : Rédaction des ordres de déplacement, conquête et création de pions

Chaque joueur rédige secrètement :
- Déplacements de pions (case par case, vers un bloc adjacent)
- Créations de nouveaux pions (coûte une action + le prix du pion)
- Cambriolages
- Activation/désactivation de flics
- Activation de gangs

### Phase 5 : Révélation des ordres de déplacement et résolution des conflits

- Tous les ordres sont révélés
- Résolution des mouvements et conflits (voir section Conflits)
- Mise à jour du plateau

### Tous les 7 tours : événements spéciaux

1. **Élections** : vote à bulletin secret, élection du maire
2. **Tirage de cartes magouille** : chaque joueur pioche 8 cartes, en garde 4
3. **Activation de gangs** possible (à partir du tour 7)

---

## Économie

### Denrées et prix

| Denrée            | Prix d'achat | Prix de vente | Notes                              |
|-------------------|--------------|---------------|-------------------------------------|
| Dose de chnouf    | 2 lingots    | 3 lingots     | 1 lingot avec un labo de raffinage  |
| Arme              | 4 lingots    | 8 lingots     |                                     |
| Passe classique   | --           | 1 lingot      | Indice P du bloc = nb de passes/tour |
| Passe de luxe     | --           | 3 lingots     | Indice P du bloc = nb de passes/tour |

### Points d'approvisionnement

| Point              | Prostituées max | Armes max | Doses max | Notes                        |
|--------------------|-----------------|-----------|-----------|-------------------------------|
| Port               | 0               | 10        | 20        |                               |
| Aéroport           | 4               | 0         | 10        |                               |
| Péage              | 1               | 4         | 10        |                               |
| Camp de gitans     | 0               | Illimité  | 0         | Armes à 3× le prix (24 lingots) |

**Bonus des administrations** (si possédées) :
- Ambassade : +10 armes, +20 doses, +3 prostituées aux plafonds de commande
- Office des douanes : mêmes bonus
- Services de l'immigration : mêmes bonus

### Flux d'argent

- Constructions : coût versé à la **Zurich Bank** + bakchich à la **police**
- Créations de pions : coût versé à la **police**
- Amendes : versées à la **police** (en argent, drogue ou armes)
- Cambriolages : butin pris dans les caisses de l'institution visée

---

## Pions

### Pions usuels

| Pion                   | Prix de création              | Fonction                                           | Coût d'élimination          |
|------------------------|-------------------------------|-----------------------------------------------------|-----------------------------|
| Dealer                 | 40 lingots + 2 armes          | Vend la drogue (3 lingots/dose, max = indice D du bloc) | 40 lingots + 4 armes        |
| Prostituée classique   | 40 lingots                    | Rapporte 1 lingot/passe/tour (max = indice P du bloc)   | 40 lingots                  |
| Prostituée de luxe     | 80 lingots                    | Rapporte 3 lingots/passe/tour (max = indice P du bloc)  | 160 lingots                 |
| Trafiquant d'armes     | 80 lingots + 3 armes          | Vend les armes (8 lingots/arme, max = indice A du bloc) | 160 lingots + 6 armes       |

**Points de départ** : toujours dans le quartier d'origine du joueur.

**Cohabitation** :
- Un seul pion armé (dealer ou trafiquant) par case
- Les prostituées cohabitent avec les pions armés
- Un dealer et un trafiquant ne peuvent PAS cohabiter

**Capture** : une prostituée non protégée (sans homme armé sur sa case) est capturée quand un adversaire conquiert la case.

### Pions spéciaux

| Pion           | Prix / conditions                | Fonction                                                    | Élimination                        |
|----------------|----------------------------------|--------------------------------------------------------------|------------------------------------|
| Policier (flic)| 160 lingots (max 2/joueur, 7 total) | Bloque une case (plus de revenus), va directement à la cible pour 20 lingots | 300 lingots (retour hôtel de police) ou 550 lingots (définitif) |
| Incorruptible  | 1 000 lingots pour le déplacer (500 avec bordel). Contrôlé par le système, pas par un joueur. | Bloque une case, infranchissable s'il est seul, seulement 2 dans le jeu | 700 lingots (définitif, retiré du jeu) |
| Gitans         | Non achetables                   | Vendent armes à 3× le prix, bloquent la construction, coûtent cher à traverser | Impossible à éliminer              |
| Gangs          | Activation après tour 10         | Pouvoir spécial unique par quartier (cf. fiches quartiers)   | --                                  |

**Traverser un camp de gitans** coûte : 5 doses de drogue + 5 armes + 1 pion sacrifié. Le pion traverse le camp et atterrit sur un bloc adjacent de l'autre côté (le joueur choisit lequel). C'est le seul moyen de se déplacer de 2 cases en un tour.

---

## Constructions

| Bâtiment         | Coût (Zurich Bank) | Bakchich (police) | Condition                     | Rendement              |
|------------------|--------------------|--------------------|-------------------------------|------------------------|
| Restaurant/Pizzeria | 40 lingots      | 40 lingots         | Aucune                        | 14 lingots/tour        |
| Labo de raffinage | 100 lingots       | 40 lingots         | Min. 6 dealers                | Divise prix drogue ×2  |
| Tripot            | 100 lingots       | 40 lingots         | Aucune                        | 14 lingots/tour        |
| Bordel            | 400 lingots       | 40 lingots         | 3 prostituées de luxe regroupées à l'intersection de 3 cases mutuellement adjacentes | Rendement cumulé des 3 cases adjacentes pour pute de luxe + chantage + protection |
| Casino            | 400 lingots       | 60 lingots         | Avoir un bordel pour couverture | 60 lingots/tour, insensible aux flics normaux |

**Construction** : possible sur toute parcelle libre sauf cimetières et terrains de gitans.
Sans permis de construire (carte magouille), il faut payer un bakchich supplémentaire de 40 lingots (60 pour un casino).

---

## Cambriolages

| Cible            | Conditions                                                               | Butin                              |
|------------------|--------------------------------------------------------------------------|------------------------------------|
| Zurich Bank      | 1 pion sur chacune des 4 annexes, les 4 hommes meurent après            | Tous les fonds de la banque        |
| Hôtel de police  | 1 pion sur le bloc + bordel + plus de flics que quiconque (min 2), perd 2 hommes | Moitié des fonds de la police      |
| Casino           | 1 pion adjacent + 11 hommes de main + 1 prostituée de luxe + aéroport + casino déjà possédé, coûte 3 cartes magouille | Tout l'argent du propriétaire      |
| Labo de raffinage | 1 pion sur le bloc, coûte 20 armes + 2 cartes magouille                 | Toute la drogue du propriétaire    |

Coupure d'électricité = coût du cambriolage divisé par 2.

---

## Déplacements et conflits

### Règles de déplacement

- Une unité se déplace vers **un bloc adjacent** (1 case par tour)
- Échange de positions possible entre 2 unités du même joueur, ou entre 2 joueurs si les deux le spécifient

### Système de supports

- Un pion immobile peut **supporter** un pion allié (ou d'un autre joueur) dans un bloc adjacent
- Si un pion supportant est lui-même attaqué, le support est **coupé**

### Résolution des conflits

1. Celui qui a le **plus de supports non coupés** l'emporte
2. En cas d'**égalité** : toutes les unités restent en place (statu quo)
3. Le **vaincu** doit fuir vers une case libre adjacente
   - S'il y a une prostituée sur sa case, il l'emmène (sauf si la destination en a déjà une → elle est capturée par le vainqueur)
4. **Éliminer** au lieu de laisser fuir : possible en payant le coût indiqué + perte de 100 000 électeurs

### Conflits en cascade

Si un pion repoussé ne peut aller que sur une case convoitée par un autre, cela peut générer des conflits en chaîne, résolus récursivement.

---

## Élections

- Se déroulent à la fin du **tour 7**, puis **tous les 7 tours**
- Vote à **bulletin secret** : chaque joueur vote pour le candidat de son choix
- Un joueur obtient les **voix des terrains** où il possède une construction ou un homme armé (pas les prostituées)
- Chaque bloc a une population (ex : 200 000 électeurs)
- Le candidat qui reçoit les votes d'un joueur récupère les voix de ce joueur (y compris les malus)

### Pouvoirs du maire

Le maire dispose de **2 privilèges** au total pendant son mandat, à choisir parmi :

1. Lancer un incorruptible où il veut *(phase 5)*
2. Exproprier un joueur de 4 blocs *(phase 5)*
3. Exiger 10% de l'argent de chaque joueur *(phase 1)*
4. Couper l'électricité d'un quartier entier pendant tout le mandat *(phase 1)*
5. Repositionner 3 flics où il veut *(phase 1)*
6. Saisir l'argent d'un joueur → caisses de la police *(phase 1)*
7. Saisir les denrées d'un joueur (drogue + armes) à son profit *(phase 1)*
8. Déplacer tous les gitans *(phase 1)*

---

## Cartes Magouille

### Fonctionnement

- Tirage : chaque joueur pioche 8 cartes, en garde 4 (tous les 7 tours)
- Les cartes non jouées peuvent être conservées pour le mandat suivant
- Jouables à n'importe quel moment sauf si précisé autrement sur la carte
- Certaines cartes sont jouables uniquement si on est maire

### Liste complète des 38 cartes uniques

| # | Nom | Coût | Effet | Exemplaires |
|---|-----|------|-------|-------------|
| 1 | Carte Triche | Gratis | Protège d'une accusation de triche pour ce tour | 1 |
| 2 | Anti-Carte Triche | Gratis | Annule une carte triche | 1 |
| 3 | Permis de tuer | Gratis | Élimine gratuitement n'importe quel pion | 4 |
| 4 | C'est au pied du mur... | -- | Carte neutre (culture générale / blague) | 2 |
| 5 | Anna Nicole-Smith est morte | -- | Carte neutre | 2 |
| 6 | Salto Angel | -- | Carte neutre (culture générale) | 2 |
| 7 | Chutes Victoria | -- | Carte neutre (culture générale) | 2 |
| 8 | Chutes du Niagara | -- | Carte neutre (culture générale) | 2 |
| 9 | Le coup de... | 1 lingot | Contamine prostituées en chaîne à partir d'une cible | 1 |
| 10 | Carte Maître Vergès | 140 lingots | Annule toutes les décisions de justice | 2 |
| 11 | Carte chantage | Gratis | Retire 100 000 électeurs à un adversaire | 2 |
| 12 | Carte piscine à débordement | 400 lingots | Déplace un incorruptible | 2 |
| 13 | Coupure d'électricité | Gratis | Bloque un quartier 3 tours + cambriolage ×0.5 | 3 |
| 14 | Guerre des gangs | 400 lingots + 1 arme + 1 pion sacrifié | Détruit 2 gangs adverses voisins définitivement | 2 |
| 15 | Détournement de fonds | 140 lingots | Récupère caisse de la police, perd 500 000 électeurs (maire uniquement) | 1 |
| 16 | Offre de soutien public (Maé) | Gratis | Adversaire perd 100 000 électeurs | 2 |
| 17 | Offre de soutien public (Willem) | Gratis | Adversaire perd 100 000 électeurs | 2 |
| 18 | Permis de tuer Christophe | Gratis | Annule les effets d'un soutien public, regagne les voix | 4 |
| 19 | Un malencontreux accident | Gratis | Annule une carte magouille adverse (nécessite 1 homme de main) | 3 |
| 20 | Du goudron et des plumes | 2 lingots | Vire les pions adverses d'un quartier que vous dominez | 1 |
| 21 | À la mode Chicago | 3 armes | Bloque l'extension adverse sur un quartier jusqu'aux élections | 1 |
| 22 | Carte vidéo posthume | 400 lingots + 1 homme sacrifié | Rend un ancien maire inéligible | 1 |
| 23 | Faire voter les morts | 100 lingots | +200 000 voix par cimetière possédé | 2 |
| 24 | Vils Voleurs à Vélo | 10 lingots + 4 hommes | Vole toute la cargaison d'un rival au port | 3 |
| 25 | Roses connexion | 10 lingots | Chaque joueur paie 10 lingots par resto possédé | 1 |
| 26 | Igor (nettoyeur) | Gratis | Libère de l'obligation de posséder un cimetière pour cacher les corps | 4 |
| 27 | Ça commence à bien faire | 400 lingots | Retire n'importe quel pion du plateau (nécessite bordel ou être maire) | 3 |
| 28 | L'opportuniste | Gratis | Tue l'adversaire après un conflit perdu, votre pion revient à l'origine | 1 |
| 29 | Cascader la baseline | Gratis | Gagne 400 lingots (parodie corporate) | 2 |
| 30 | Dépigmentation de la peau | 6 doses de chnouf | Change d'ethnie (blanc) : avantages/inconvénients | 2 |
| 31 | Pigmentation de la peau | 6 doses de chnouf | Change d'ethnie (noir) : avantages/inconvénients | 2 |
| 32 | Carte Patrick Sébastien | Gratis | Accès aux quartiers asiatiques | 2 |
| 33 | Carte Orange | Gratis | Téléporte un pion n'importe où sur la carte | 3 |
| 34 | La Carte JeuneS | Gratis | Déplace un groupe de gitans (nécessite bordel) | 1 |
| 35 | La retraite de McBride | Gratis | Retire un flic non placé définitivement du jeu | 2 |
| 36 | Secrétaire particulière | Gratis | +2 actions/tour jusqu'aux prochaines élections | 2 |
| 37 | Carte Amine Dada | Gratis | Vend tout le stock d'armes à 20 lingots/arme (nécessite lobby juif) | 2 |
| 38 | Carte Maître Vergès | 140 lingots | Annule toutes les décisions de justice | 2 |

**Total : 75 cartes** dans le deck.

Les cartes neutres (culture générale, blagues) n'ont aucun effet mécanique : elles font perdre un tirage.

---

## Contrats et Coupole

### Contrats
Tout est négociable entre joueurs. Un contrat peut être formalisé par écrit et posé à côté du plateau.

### La Coupole
Si un joueur se sent trahi (accord non honoré), il peut convoquer la **Coupole** (assemblée des chefs) :
- Maximum **2 fois par partie** par joueur
- Vote à la majorité des joueurs (l'accusé et le plaignant ne votent pas)
- En cas d'égalité : le joueur avec le plus d'électeurs tranche
- Sanction : l'accusé perd **2 hommes de main**

---

## Possession de territoire

- Une **case** est possédée si le joueur y a un pion ou une construction
- Un **quartier** est possédé si le joueur a au moins 1 pion ou construction sur chaque case
- Posséder un quartier permet d'**activer son gang** (à partir du tour 7)
