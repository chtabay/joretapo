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
- [x] Écran de configuration (nombre de joueurs, noms, couleurs, ethnie)
- [x] Draft des quartiers (sélection tour par tour parmi les 11 dispo au lancement)
- [x] Distribution automatique des ressources de départ (selon fiche quartier)
- [x] Placement initial des pions sur le plateau
- [x] Placement des gitans sur les îles
- [x] Objet `GameState` initialisé et fonctionnel (avec sauvegarde LocalStorage)
- [x] Fichiers JSON : `pions.json`, `constructions.json`, `institutions.json`
- [x] Écran titre (Nouvelle partie / Continuer / Explorer la carte)
- [x] Routeur d'écrans (title → setup → draft → confirm → game)
- [x] Modules ES6 : `app.js`, `game-state.js`, `map-renderer.js`, `setup.js`
- [x] HUD en jeu (tour, phase, scores, lingots par joueur)

### Critère de validation
On peut configurer une partie, tirer les quartiers, voir les pions placés sur le plateau. **FAIT.**

---

## Phase 3 : Boucle de tour -- ordres et revenus

**Objectif** : jouer un tour complet en hotseat (sans les conflits).

### Livrables
- [x] `TurnManager` (js/turn-manager.js) : automate à états pilotant les 5 phases
- [x] Mécanisme du rideau hotseat (écrans privés/publics, ordre aléatoire)
- [x] Saisie des ordres d'approvisionnement (modal : point, denrée, quantité)
- [x] Saisie des ordres de construction (modal : bâtiment, zone)
- [x] Recrutement de prostituées (modal : point, type, zone de placement)
- [x] Révélation des ordres Phase 2 (log détaillé + résumé ressources)
- [x] `RevenueEngine` (js/revenue-engine.js) : revenus prostituées, dealers, trafiquants, constructions
- [x] Saisie des ordres de déplacement (modal : pion, destination adjacente)
- [x] Création de pions (modal : dealer/trafiquant, zone)
- [x] Exécution des déplacements simples (statu quo si conflit)
- [x] Révélation Phase 5 (log mouvements + résumé)
- [x] Phase de négociation (écran semi-transparent + bouton fin)
- [x] HUD en jeu (tour, phase, points et lingots par joueur)
- [x] Sauvegarde automatique en LocalStorage à chaque transition de phase
- [x] Écran de fin de tour (résumé points + détection victoire à 55 pts)

### Critère de validation
On peut enchaîner les tours : saisir des ordres, voir les revenus, déplacer ses pions. **FAIT.**

---

## Sprint 4 : Conflits, combats, flics et victoire (ancienne Phase 5)

**Objectif** : le système de conflits fonctionne, les flics sont déployables, la victoire est détectable.

### Livrables
- [x] `ConflictResolver` (js/conflict-resolver.js) : résolution Diplomacy-like
- [x] Système de supports (pions immobiles adjacents au défenseur)
- [x] Coupure de support (supporteur lui-même attaqué)
- [x] Résolution : plus de supports = victoire, égalité = statu quo
- [x] Fuite du vaincu (vers case libre adjacente)
- [x] Capture de prostituées non protégées
- [x] Élimination payante (prix du pion + -100 000 électeurs)
- [x] Log de résolution animé (conflit par conflit, CSS distinct)
- [x] Flics : déploiement, blocage revenus, élimination payante
- [x] `RevenueEngine.canBuild` : validation dynamique des prérequis de construction
- [x] Détection de victoire (55 points) à chaque fin de tour

### Critère de validation
Les conflits se résolvent correctement, les flics bloquent les revenus, la victoire est détectée. **FAIT.**

---

## Sprint 5 : Élections et pouvoirs du maire (ancienne Phase 7)

**Objectif** : les élections fonctionnent, le maire a ses pouvoirs.

### Livrables
- [x] Phases `PRE_ELECTION`, `ELECTION_CURTAIN`, `ELECTION_VOTE`, `ELECTION_RESULT` dans TurnManager
- [x] Déclenchement automatique tous les 7 tours
- [x] Calcul des voix (pions + constructions × population de zone)
- [x] Vote à bulletin secret (hotseat avec rideau)
- [x] Dépouillement avec barres animées
- [x] Attribution du titre de maire (+15 pts)
- [x] `MayorEngine` (js/mayor-engine.js) : 8 pouvoirs, 2 privilèges par mandat
- [x] Modales spécialisées pour chaque pouvoir (taxe, exproprier, incorruptible, etc.)
- [x] Marqueur 🏛️ dans le HUD pour le maire en exercice

### Critère de validation
On peut voter, élire un maire, et utiliser les pouvoirs du maire. **FAIT.**

---

## Sprint 6 : Cartes Magouille (ancienne Phase 6)

**Objectif** : les cartes magouille sont jouables avec tous leurs effets.

### Livrables
- [x] `MagouilleEngine` (js/magouille-engine.js) : deck, draft, pioche, play, effets
- [x] `data/cartes-magouille.json` : 30 types mécaniques + 5 cartes culture
- [x] Extraction des 39 images de cartes depuis les fichiers PowerPoint originaux
- [x] Phases `DRAFT_CURTAIN`, `DRAFT_PICK` dans TurnManager (après chaque élection)
- [x] UI de draft : pioche 8, sélection 4, UI cartes illustrées
- [x] Bouton "🃏 Jouer une carte" dans le panneau d'ordres
- [x] Modales contextuelles selon l'effet (cible pion, quartier, joueur, zone...)
- [x] 15+ effets implémentés (tuer_pion, téléporter, couper_electricite, changer_ethnie, vendre_armes, etc.)
- [x] Conservation des cartes non jouées entre les tours

### Critère de validation
On peut piocher, sélectionner, jouer les cartes et voir leurs effets appliqués. **FAIT.**

---

## Sprint 7 : Gitans, Incorruptibles, Gangs, Fin de mandat (anciennes Phases 8 & 9 partiellement)

**Objectif** : les entités spéciales du plateau sont fonctionnelles.

### Livrables
- [x] `SpecialEntities` (js/special-entities.js) : module centralisé
- [x] **Gitans** : placement initial sur les 4 îles, blocage construction, traversée coûteuse (5D+5A+1 pion), vente armes 3×
- [x] **Incorruptibles** : placement (max 2), zone bloquée infranchissable si seul, élimination 700L (500L avec Bordel), déplacement 1000L
- [x] **Gangs** : activation après tour 7 si quartier contrôlé, framework + 5 effets (casino gratuit, éliminer 3 pions, +2 actions, revente marchandises, racket établissements)
- [x] **Fin de mandat** : restauration automatique de l'électricité, nettoyage des cartes ouvertes (verges, igor), reset des actions bonus
- [x] Initialisation des îles dans le plateau + fusion des adjacences îles dans les données globales
- [x] Rendu visuel des gitans (GI) et incorruptibles (IC) sur la carte

### Critère de validation
Les gitans bloquent la construction et coûtent cher à traverser, les incorruptibles bloquent les zones, les gangs sont activables, la fin de mandat nettoie les effets temporaires. **FAIT.**

---

## Sprint 8 : Contrats, Cambriolages et Coupole

**Objectif** : contrats entre joueurs, cambriolages et coupole fonctionnels.

### Livrables
- [x] `ContractEngine` (js/contract-engine.js) : création, suivi, violation de contrats
- [x] Interface de saisie de contrats (joueur A ↔ joueur B, termes, durée)
- [x] Affichage des contrats actifs dans le panneau de négociation
- [x] `HeistEngine` (js/heist-engine.js) : cambriolages Zurich Bank, Police, Casino, Labo
- [x] Validation des prérequis de cambriolage
- [x] Coupole : vote, sanction (2 hommes perdus)

### Critère de validation
On peut créer des contrats, exécuter des cambriolages (si prérequis remplis), et convoquer la coupole. **FAIT.**

---

## Sprint 9 : Polish UX, Mobile et Aide contextuelle

**Objectif** : rendre le jeu jouable sur mobile, améliorer la lisibilité et l'expérience utilisateur.

### Livrables
- [x] Adaptation mobile (CSS responsive, pinch-to-zoom, pan tactile)
- [x] Panneau d'ordres rétractable avec FAB pour masquer/afficher
- [x] Boutons de validation fixes et accessibles sur mobile
- [x] Top bar élections : chapelet de 7 points, couleur du joueur actif, bouton partage
- [x] Page pré-élection interstitielle (rappel des enjeux)
- [x] Page d'introduction / présentation du jeu
- [x] Dictionnaire contextuel : titres cliquables (tour, phase, joueur, points, budget)
- [x] Fiches détaillées des cartes Magouille (texte original PPTX, images)
- [x] Noms de zones avec couleurs des quartiers dans le panneau d'adjacences
- [x] `SaveExport` (js/save-export.js) : sauvegarde, partage QR/WhatsApp/WebShare
- [x] `Dictionary` (js/dictionary.js) : entrées d'aide contextuelle
- [x] Amélioration lisibilité : cartes magouille, vote, modales

### Critère de validation
Le jeu est jouable sur mobile, l'aide contextuelle fonctionne, le partage fonctionne. **FAIT.**

---

## Phases restantes (non encore planifiées en sprints)

**Économie avancée** :
- [ ] Bonus des administrations (ambassade, douanes, immigration)
- [ ] Transactions entre joueurs (échanges de ressources, pions, bâtiments)

**Mécaniques restantes** :
- [ ] 10 effets de gangs supplémentaires à implémenter
- [ ] UX cambriolages (interface guidée, feedback visuel)
- [ ] UX conquêtes de territoires (indicateurs visuels, animation)

**Polish et finitions** :
- [ ] Animations de transitions entre phases
- [ ] Effets sonores (optionnel)
- [ ] Gestion de sauvegarde multi-slots
- [ ] Tests sur tablette (iPad, Android)
- [ ] Optimisation des performances SVG

---

## Estimation de charge

| Phase / Sprint | Complexité | Statut |
|-------|-----------|------------|
| Phase 1 : Plateau SVG | Élevée (cartographie) | **FAIT** |
| Phase 2 : Configuration | Moyenne | **FAIT** |
| Phase 3 : Boucle de tour | Élevée (hotseat + ordres) | **FAIT** |
| Sprint 4 : Conflits + Flics | Très élevée (algorithme récursif) | **FAIT** |
| Sprint 5 : Élections + Maire | Moyenne | **FAIT** |
| Sprint 6 : Cartes Magouille | Élevée (volume + effets variés) | **FAIT** |
| Sprint 7 : Gitans, Incorruptibles, Gangs | Élevée | **FAIT** |
| Sprint 8 : Contrats, Cambriolages, Coupole | Moyenne | **FAIT** |
| Sprint 9 : Polish UX, Mobile, Aide contextuelle | Moyenne | **FAIT** |
| Reste : Économie avancée, UX avancé | Moyenne | En attente |
| Polish final | Variable | En attente |
