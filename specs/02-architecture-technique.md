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
├── index.html                  # Point d'entrée (carte interactive + futur jeu)
├── data/
│   ├── quartiers-osm.geojson   # 74 polygones (59 CDs + 12 Hudson + 3 Bergen)
│   ├── adjacences-osm.json     # Adjacences calculées (145 paires)
│   └── quartiers.json          # Stats de jeu historiques (gangs, indices, à migrer)
├── assets/
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

## Modules principaux (à développer)

### GameState

Objet central qui contient l'intégralité de l'état de la partie :

- `players[]` : joueurs (nom, couleur, ressources, pions, cartes, électeurs)
- `board` : état de chaque quartier (propriétaire, pions présents, constructions)
- `turn` : numéro du tour en cours
- `phase` : phase en cours (1-5)
- `mayor` : joueur maire en exercice, privilèges restants
- `banks` : caisses (Zurich Bank, Hôtel de police)
- `cardDeck` : état du deck de cartes magouille
- `gangs` : état d'activation des gangs par quartier
- `history` : historique des tours (pour affichage et debug)

Doit être entièrement **sérialisable en JSON** pour la sauvegarde LocalStorage.

### TurnManager

Automate à états qui pilote la séquence des phases :

```
PHASE_1_ORDERS_SUPPLY  →  chaque joueur saisit (hotseat)
PHASE_2_REVEAL_HARVEST →  révélation collective + calcul revenus
PHASE_3_NEGOTIATION    →  écran neutre, discussion orale
PHASE_4_ORDERS_MOVE    →  chaque joueur saisit (hotseat)
PHASE_5_REVEAL_RESOLVE →  révélation + résolution conflits
    └─ si tour % 10 == 0 :
        ELECTION       →  vote secret par joueur
        CARD_DRAW      →  pioche 8, garde 4
        GANG_CHECK     →  possibilité d'activation
```

### ConflictResolver

Le module le plus complexe. Algorithme de résolution :

1. Collecter tous les ordres de déplacement
2. Identifier les conflits (2+ pions veulent la même case)
3. Calculer les supports effectifs (et couper ceux dont les supporteurs sont eux-mêmes attaqués)
4. Résoudre chaque conflit (plus de supports = victoire, égalité = statu quo)
5. Gérer les cascades (un vaincu repoussé peut créer un nouveau conflit)
6. Appliquer les captures de prostituées
7. Appliquer les éliminations payantes

### CardSystem

Gère le cycle de vie des cartes magouille :

1. **Deck** : 75 cartes initiales mélangées
2. **Pioche** : chaque joueur tire 8, sélectionne 4 (UI de sélection)
3. **Main** : les 4 cartes du joueur
4. **Jeu** : le joueur active une carte, le système applique l'effet
5. **Défausse** : la carte retourne sous la pile (ou sort du jeu selon la carte)

Chaque carte a un `effect` défini comme une fonction qui modifie le `GameState`.

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
