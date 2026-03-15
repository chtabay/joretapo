# 05 -- Roadmap de développement

## Principe

Le jeu est construit **par couches fonctionnelles**, chaque étape produisant un livrable
testable. Même si l'objectif est le jeu complet, ce phasage permet de jouer et tester
progressivement.

---

## Phase 1 : Fondations et plateau interactif

**Objectif** : afficher la carte NYC interactive et navigable sur tablette.

### Livrables
- [x] Structure du projet (dossiers, fichiers, index.html)
- [x] Pipeline cartographique (tools/build-map.mjs)
- [x] 74 quartiers en GeoJSON (59 CDs + 12 Hudson + 3 Bergen)
- [x] Adjacences calculées automatiquement (145 paires)
- [x] Carte SVG générée depuis les polygones réels
- [x] Zoom/pan (molette + drag)
- [x] Clic sur un quartier → panneau d'info (nom, ID, type, adjacences)
- [x] Code couleur par borough / comté
- [x] Déploiement GitHub Pages

### Critère de validation
On peut naviguer sur la carte, zoomer, et cliquer chaque quartier pour voir ses infos. **FAIT.**

---

## Phase 2 : Configuration et démarrage de partie

**Objectif** : pouvoir lancer une partie avec 2-6 joueurs, tirer les quartiers, distribuer les ressources.

### Livrables
- [ ] Écran de configuration (nombre de joueurs, noms, couleurs)
- [ ] Tirage des quartiers (règles selon nombre de joueurs)
- [ ] Distribution automatique des ressources de départ (selon fiche quartier)
- [ ] Placement initial des pions sur le plateau
- [ ] Placement des gitans sur les îles
- [ ] Objet `GameState` initialisé et fonctionnel
- [ ] Fichiers JSON : `pions.json`, `constructions.json`, `institutions.json`

### Critère de validation
On peut configurer une partie, tirer les quartiers, voir les pions placés sur le plateau.

---

## Phase 3 : Boucle de tour -- ordres et revenus

**Objectif** : jouer un tour complet en hotseat (sans les conflits).

### Livrables
- [ ] `TurnManager` : automate à états pilotant les 5 phases
- [ ] Mécanisme du rideau hotseat (écrans privés/publics)
- [ ] Saisie des ordres d'approvisionnement (formulaire tactile)
- [ ] Saisie des ordres de construction
- [ ] Révélation des ordres (écran collectif)
- [ ] `RevenueEngine` : calcul automatique des revenus par pion et construction
- [ ] Saisie des ordres de déplacement (formulaire tactile)
- [ ] Exécution des déplacements simples (sans conflit)
- [ ] Phase de négociation (écran plateau + timer + bouton fin)
- [ ] Barre d'état (tour, phase, joueur actif)
- [ ] Sauvegarde automatique en LocalStorage à chaque fin de phase

### Critère de validation
On peut enchaîner les tours : saisir des ordres, voir les revenus, déplacer ses pions.

---

## Phase 4 : Économie complète

**Objectif** : tout le système économique fonctionne.

### Livrables
- [ ] `EconomyEngine` : achats, ventes de drogue et d'armes selon indices de blocs
- [ ] Points d'approvisionnement : ports, aéroports, péages, camps de gitans
- [ ] Bonus des administrations (ambassade, douanes, immigration)
- [ ] Constructions complètes : restaurant, tripot, labo, bordel, casino
- [ ] Flux d'argent vers Zurich Bank et Hôtel de police
- [ ] Création de pions (coûte une action + prix)
- [ ] Transactions entre joueurs (échanges de ressources, pions, bâtiments)

### Critère de validation
L'économie tourne : les revenus sont cohérents, on peut construire, acheter, vendre, échanger.

---

## Phase 5 : Conflits et combats

**Objectif** : le système de conflits fonctionne intégralement.

### Livrables
- [ ] `ConflictResolver` : détection des conflits de position
- [ ] Système de supports (pions immobiles soutiennent un voisin)
- [ ] Coupure de support (le supporteur est lui-même attaqué)
- [ ] Résolution : plus de supports = victoire, égalité = statu quo
- [ ] Fuite du vaincu (vers case libre adjacente)
- [ ] Conflits en cascade (résolution récursive)
- [ ] Capture de prostituées (non protégées)
- [ ] Élimination payante (payer le prix + -100 000 électeurs)
- [ ] Écran de résolution animé (conflit par conflit)
- [ ] Échange de positions (même joueur ou accord mutuel)

### Critère de validation
Les conflits se résolvent correctement, y compris les cascades et captures.

---

## Phase 6 : Cartes Magouille

**Objectif** : les 75 cartes sont jouables avec tous leurs effets.

### Livrables
- [ ] `CardSystem` : deck, pioche, sélection, activation
- [ ] Fichier `cartes-magouille.json` : les 38 cartes uniques avec effets codés
- [ ] Écran de sélection des cartes (pioche 8, garde 4)
- [ ] Interface pour jouer une carte en cours de partie
- [ ] Implémentation de chaque type d'effet (cf. modèle de données)
- [ ] Cartes neutres (culture générale) : aucun effet, mauvaise pioche
- [ ] `CardViewer` : affichage détaillé d'une carte (texte, coût, effet)
- [ ] Conservation des cartes non jouées entre mandats

### Critère de validation
On peut piocher, sélectionner, jouer les 38 types de cartes et voir leurs effets appliqués.

---

## Phase 7 : Élections et pouvoirs du maire

**Objectif** : les élections fonctionnent, le maire a ses pouvoirs.

### Livrables
- [ ] `ElectionSystem` : comptage des électeurs par joueur
- [ ] Calcul des voix : constructions + hommes armés sur les blocs
- [ ] Malus et bonus d'électeurs (cartes magouille, détournement, etc.)
- [ ] Vote à bulletin secret (hotseat avec rideau)
- [ ] Dépouillement animé
- [ ] Attribution du titre de maire (+15 pts de victoire)
- [ ] Interface pour les 8 pouvoirs du maire
- [ ] Implémentation des 8 pouvoirs du maire
- [ ] Gestion des 2 privilèges par mandat

### Critère de validation
On peut voter, élire un maire, et utiliser les pouvoirs du maire.

---

## Phase 8 : Gangs et pouvoirs de quartier

**Objectif** : les 15 gangs sont activables et leurs effets fonctionnent.

### Livrables
- [ ] `GangSystem` : vérification de possession de quartier, activation
- [ ] Implémentation des 15 pouvoirs de gang :
  - [ ] Cartel de Bogota (bloquer ventes d'armes)
  - [ ] Gang du Bolito (restrictions d'accès)
  - [ ] Lobby des Taxis (bloquer déplacements Manhattan)
  - [ ] Triades (restrictions d'accès)
  - [ ] Les Nets (+2 actions)
  - [ ] Syndicat des Dockers (bloquer approvisionnements)
  - [ ] Camora Napolitaine (racket)
  - [ ] St James Boys (immunité)
  - [ ] Rat Pack (voler action du maire)
  - [ ] Natifs Américains (casino gratuit)
  - [ ] Ku Klux Klan (restrictions d'accès)
  - [ ] Mafia Bulgare (éliminer prostituées)
  - [ ] Yakuzas (éliminer pions)
  - [ ] Lobby Juif (revente marchandises)
  - [ ] Mafia Créole (bloquer ordres)
- [ ] Interface d'activation (lors de la phase d'action, après tour 10)

### Critère de validation
On peut activer un gang et voir son effet appliqué correctement.

---

## Phase 9 : Cambriolages, contrats, coupole, conditions de victoire

**Objectif** : toutes les mécaniques restantes.

### Livrables
- [ ] Cambriolages : Zurich Bank, Hôtel de police, Casino, Labo
- [ ] Contrats formalisés (interface de saisie, affichage)
- [ ] Coupole (vote, sanction)
- [ ] `VictoryChecker` : vérification des 55 points après chaque tour
- [ ] Écran de fin de partie (classement, détail des points)
- [ ] Pions spéciaux complets : flics (activation/désactivation), incorruptibles, gitans (traversée)

### Critère de validation
Une partie peut se terminer avec un vainqueur déclaré.

---

## Phase 10 : Polish et finitions

**Objectif** : le jeu est agréable à utiliser et prêt pour GitHub Pages.

### Livrables
- [ ] Animations de transitions entre phases
- [ ] Animations des conflits et résolutions
- [ ] Design visuel cohérent (thème sombre, typographie)
- [ ] Effets sonores (optionnel)
- [ ] Tutoriel / aide intégrée (résumé des règles consultable)
- [ ] Gestion de sauvegarde multi-slots
- [ ] Tests sur tablette (iPad, Android)
- [ ] Optimisation des performances SVG
- [ ] README du projet pour GitHub
- [ ] Déploiement sur GitHub Pages

### Critère de validation
Le jeu tourne de manière fluide sur tablette, est visuellement soigné, et est jouable de bout en bout.

---

## Estimation de charge

| Phase | Complexité | Estimation |
|-------|-----------|------------|
| Phase 1 : Plateau SVG | Élevée (cartographie) | **FAIT** |
| Phase 2 : Configuration | Moyenne | Moyen |
| Phase 3 : Boucle de tour | Élevée (hotseat + ordres) | Long |
| Phase 4 : Économie | Moyenne | Moyen |
| Phase 5 : Conflits | Très élevée (algorithme récursif) | Long |
| Phase 6 : Cartes Magouille | Élevée (volume + effets variés) | Long |
| Phase 7 : Élections | Moyenne | Moyen |
| Phase 8 : Gangs | Moyenne | Moyen |
| Phase 9 : Finitions mécaniques | Moyenne | Moyen |
| Phase 10 : Polish | Variable | Variable |

Le projet est **ambitieux**. La carte SVG (phase 1) et le système de conflits (phase 5)
sont les deux plus gros morceaux techniques.
