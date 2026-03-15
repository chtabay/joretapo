# 02 -- Architecture technique

## Contraintes

| Contrainte           | Implication                                              |
|----------------------|----------------------------------------------------------|
| GitHub Pages         | Site 100% statique : HTML, CSS, JS, pas de backend       |
| Pas de serveur       | Pas de base de données, pas d'API, pas de WebSocket       |
| Tablette tactile     | Interface tactile, taille d'écran ~10", performance fluide |
| Hotseat              | Toute la logique tourne sur un seul client                |
| Jeu complet          | Volume de données important (75 cartes, 74 quartiers, etc.) |

## Stack technique

| Couche           | Technologie                        | Justification                           |
|------------------|------------------------------------|-----------------------------------------|
| Structure        | HTML5                              | Sémantique, accessible                  |
| Style            | CSS3 (variables, grid, flexbox)    | Responsive tablette, thème sombre       |
| Plateau          | SVG généré depuis GeoJSON          | Polygones réels, zoomable, cliquable    |
| Interactions     | JavaScript vanilla (ES modules)    | Pas de dépendance, performance tablette |
| Zoom/Pan plateau | Gestion maison (pointer events)    | Pinch-to-zoom tactile                   |
| Données de jeu   | GeoJSON + fichiers JSON            | Quartiers, cartes, prix, pions          |
| Persistance      | LocalStorage                       | Sauvegarde de partie en cours           |
| Build            | Aucun (ou optionnel: esbuild)      | Simplicité, déploiement direct          |
| Pipeline carto   | Node.js + Turf.js + d3-geo         | Génération des polygones et adjacences  |

**Pas de React, Vue, Angular** : le jeu est un automate à états, pas une app CRUD.
Du JS bien structuré en modules ES6 sera plus léger et performant.

## Structure du projet

```
joretapo/
├── index.html                  # Point d'entrée (écran titre + setup + carte de jeu + CSS)
├── js/
│   ├── app.js                  # Routeur d'écrans, chargement données, UI, point d'entrée
│   ├── game-state.js           # Classe GameState (init, sauvegarde, calcul points)
│   ├── map-renderer.js         # Rendu SVG, zoom/pan, sélection de zones, pions
│   ├── setup.js                # Écrans de configuration, draft et confirmation
│   ├── turn-manager.js         # Automate à états (5 phases + élection + draft cartes)
│   ├── revenue-engine.js       # Revenus, approvisionnement, constructions, canBuild
│   ├── conflict-resolver.js    # Résolution Diplomacy-like (supports, fuite, élimination)
│   ├── mayor-engine.js         # 8 pouvoirs du maire, validation, exécution
│   ├── magouille-engine.js     # Deck, pioche, draft 8→4, play, 15+ effets
│   └── special-entities.js     # Gitans, incorruptibles, gangs, fin de mandat
├── data/
│   ├── quartiers-osm.geojson   # 74 polygones (59 CDs + 12 Hudson + 3 Bergen)
│   ├── adjacences-osm.json     # Adjacences calculées (145 paires)
│   ├── quartiers-gameplay.json # 15 quartiers × 74 zones + 4 îles, gangs, indices P/D/A
│   ├── cartes-magouille.json   # 30 types de cartes uniques + 5 cartes culture
│   ├── pions.json              # Définitions des pions (prix, fonctions, cohabitation)
│   ├── constructions.json      # Définitions des constructions (coûts, rendements)
│   └── institutions.json       # Zurich Bank, Hôtel de Police, Mairie, annexes
├── assets/
│   ├── cards/                  # 39 images de cartes magouille (extraites des PPT)
│   ├── plateau-osm.svg         # Carte SVG générée par le pipeline
│   └── carte_v12_traced.svg    # Source historique (référence)
├── tools/
│   ├── build-map.mjs           # Pipeline : GeoJSON brut → quartiers + adjacences + SVG
│   └── package.json            # Dépendances : @turf/turf, d3-geo
├── specs/                      # Documentation du projet
└── .gitignore
```

### Pipeline cartographique

```
data/geo-raw/nyc-community-districts.geojson  ─┐
                                                ├──► tools/build-map.mjs
data/geo-raw/nj-hudson-bergen.geojson         ─┘
                                                     │
                                        ┌────────────┼────────────┐
                                        ▼            ▼            ▼
                              quartiers-osm   adjacences-osm   plateau-osm
                              .geojson        .json            .svg
```

Les fichiers `geo-raw/` sont dans `.gitignore` (régénérables).

## Modules principaux (implémentés)

### GameState (`js/game-state.js`)

Objet central sérialisable en JSON, sauvegardé en LocalStorage :

- `joueurs[]` : joueurs (nom, couleur, ethnie, ressources, cartes, électeurs, est_maire)
- `plateau{}` : état de chaque zone (propriétaire, pions, construction, electricite, gitans)
- `tour` / `phase` : progression du jeu
- `maire` : joueur maire, privilèges restants, tour d'élection
- `caisses` : Zurich Bank + Hôtel de police
- `deck_magouille` : pile, défaussées, retirées du jeu
- `flics` : déployés, réserves, éliminés
- `incorruptibles` : déployés, éliminés (max 2)
- `gitans` : positions (initialement sur les 4 îles)
- `gangs_actifs` : gangs activés par quartier
- `coupures_electricite` : coupures en cours avec durée

### TurnManager (`js/turn-manager.js`)

Automate à états pilotant les 5 phases + cycle électoral :

```
CURTAIN → ORDERS_SUPPLY → REVEAL_HARVEST → NEGOTIATION → ORDERS_MOVE → REVEAL_RESOLVE → TURN_END
                                                                                            │
                                                            (si tour % 10 == 0 au nextTurn) │
                                                                                            ▼
                                          ELECTION_CURTAIN → ELECTION_VOTE → ELECTION_RESULT
                                                                                            │
                                                                                            ▼
                                                            DRAFT_CURTAIN → DRAFT_PICK (×N joueurs)
                                                                                            │
                                                                                            ▼
                                                                                      tour++ → startTurn
```

### RevenueEngine (`js/revenue-engine.js`)

Traite les ordres d'approvisionnement et calcule les revenus :
- Points d'appro (ports, aéroports, péages, camps gitans) avec plafonds
- Construction avec prérequis complexes (Bordel: triangle 3 prostituées luxe adjacentes, Casino: posséder bordel, Labo: 6 dealers)
- Revenus par type de pion et construction, blocage par flics

### ConflictResolver (`js/conflict-resolver.js`)

Résolution Diplomacy-like des mouvements en Phase 5 :
1. Validation et parsing des ordres (déplacer, créer pion, déployer/éliminer flic)
2. Blocage par incorruptible (zone infranchissable si seul)
3. Détection des conflits (2+ pions vers la même case)
4. Calcul des supports passifs (pions immobiles adjacents)
5. Coupure de supports (supporteur lui-même attaqué)
6. Résolution (plus de supports = victoire, égalité = statu quo)
7. Fuite du vaincu ou élimination payante

### MayorEngine (`js/mayor-engine.js`)

8 pouvoirs du maire (2 privilèges par mandat) :
- Phase 1 : taxe 10%, coupure électricité, repositionner flics, saisie argent/denrées, gitans
- Phase 5 : incorruptible, exproprier 4 blocs

### MagouilleEngine (`js/magouille-engine.js`)

Cycle de vie des 75 cartes (30 types) :
1. **Deck** : construction et mélange à la première élection
2. **Draft** : chaque joueur pioche 8, sélectionne 4 (UI hotseat)
3. **Main** : cartes conservées entre les tours
4. **Jeu** : activation depuis le panneau d'ordres, modales contextuelles par effet
5. **Défausse/Retrait** : selon la carte, retourne sous la pile ou sort du jeu

15+ effets implémentés : tuer pion, modifier électeurs, téléporter, couper électricité, contaminer prostituées, racket, vendre armes, changer ethnie, etc.

### SpecialEntities (`js/special-entities.js`)

Gère les entités spéciales du plateau :
- **Gitans** : placés sur les îles, blocage construction, traversée coûteuse (5D+5A+1 pion), armes 3x
- **Incorruptibles** : max 2, blocage zone, infranchissable si seul, élimination 700L
- **Gangs** : activation après tour 10 si quartier contrôlé, 5 effets actifs (casino gratuit, éliminer 3 pions, +actions, revente, racket)
- **Fin de mandat** : restauration électricité, nettoyage cartes ouvertes, reset actions bonus

## Gestion du Hotseat

Le hotseat nécessite un mécanisme de "rideau" (curtain) entre les joueurs :

```
[Écran collectif : plateau visible]
      │
      ▼
[Rideau : "Passez la tablette au Joueur X"]
[Bouton : "Je suis Joueur X, commencer"]
      │
      ▼
[Écran privé : saisie des ordres de Joueur X]
[Le joueur voit SES ressources, SES pions, SES cartes]
[Bouton : "Valider mes ordres"]
      │
      ▼
[Rideau : "Passez la tablette au Joueur Y"]
      │
      ... (répéter pour chaque joueur)
      │
      ▼
[Écran collectif : révélation des ordres]
```

Le rideau doit être **opaque** : aucune information du joueur précédent ne doit subsister à l'écran.

## Sauvegarde

- **Auto-save** à chaque fin de phase dans `LocalStorage`
- Clé : `joretapo-save-{slot}` (plusieurs slots possibles)
- Format : JSON complet du `GameState`
- Interface : bouton "Sauvegarder" / "Charger" sur l'écran d'accueil

## Performance

Cibles pour tablette :
- Rendu SVG du plateau : < 100ms
- Transition entre écrans : < 200ms
- Résolution des conflits (cas complexe, 6 joueurs) : < 500ms
- Taille totale du site : < 5 Mo (sans assets lourds)
