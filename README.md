# Joretapo

Jeu de plateau numérique en hotseat (pass-and-play) sur tablette, inspiré par la mécanique de *Diplomacy* et l'univers du crime organisé dans un New York fictif.

## Concept

2 à 6 joueurs s'affrontent pour dominer les marchés illicites, contrôler des quartiers et accéder au pouvoir politique. Le premier à atteindre **55 points de victoire** l'emporte.

**Pas de serveur, pas de backend** : le jeu tourne entièrement dans le navigateur (HTML/CSS/JS vanilla) et se déploie sur GitHub Pages.

## Fonctionnalités

- **Plateau interactif** : carte SVG de 74 zones (NYC + Hudson/Bergen) avec zoom/pan tactile
- **Hotseat** : mécanisme de rideau entre joueurs, ordres secrets
- **5 phases par tour** : approvisionnement, révélation, négociation, déplacement, résolution
- **Conflits Diplomacy-like** : supports, coupures, fuite, élimination payante
- **Élections tous les 7 tours** : vote secret, 8 pouvoirs du maire
- **75 cartes Magouille** (30 types) : draft 8→4, 15+ effets
- **Entités spéciales** : gitans, incorruptibles, gangs
- **Contrats, cambriolages, coupole**
- **Sauvegarde & partage** : LocalStorage, export QR/WhatsApp
- **Mobile-friendly** : responsive, pinch-to-zoom, panneaux rétractables

## Stack technique

| Couche | Technologie |
|--------|------------|
| Structure | HTML5 |
| Style | CSS3 (variables, grid, flexbox) |
| Plateau | SVG (généré depuis GeoJSON) |
| Logique | JavaScript vanilla (ES modules) |
| Données | JSON (quartiers, cartes, pions, constructions) |
| Persistance | LocalStorage |
| Pipeline carto | Node.js + Turf.js + d3-geo |

## Structure du projet

```
joretapo/
├── index.html              # Point d'entrée unique (HTML + CSS)
├── js/                     # 14 modules ES6
│   ├── app.js              # Routeur, UI, point d'entrée
│   ├── game-state.js       # État de jeu sérialisable
│   ├── map-renderer.js     # Rendu SVG, zoom/pan, pions
│   ├── setup.js            # Configuration, draft quartiers
│   ├── turn-manager.js     # Automate à états (phases + élections)
│   ├── revenue-engine.js   # Revenus, approvisionnement, constructions
│   ├── conflict-resolver.js # Résolution Diplomacy-like
│   ├── mayor-engine.js     # 8 pouvoirs du maire
│   ├── magouille-engine.js # Deck, draft, 15+ effets
│   ├── special-entities.js # Gitans, incorruptibles, gangs
│   ├── contract-engine.js  # Contrats entre joueurs
│   ├── heist-engine.js     # Cambriolages
│   ├── save-export.js      # Sauvegarde, partage
│   └── dictionary.js       # Aide contextuelle
├── data/                   # Données de jeu (JSON/GeoJSON)
├── assets/                 # Images cartes, SVG plateau
├── tools/                  # Pipeline cartographique
└── specs/                  # Documentation détaillée
```

## Lancer le jeu

Servir les fichiers avec n'importe quel serveur HTTP statique :

```bash
# Avec Python
python -m http.server 8000

# Avec Node.js
npx serve .
```

Puis ouvrir `http://localhost:8000` sur tablette ou navigateur.

## Documentation

La documentation détaillée se trouve dans le dossier `specs/` :

- [Mécaniques de jeu](specs/01-mecaniques-de-jeu.md)
- [Architecture technique](specs/02-architecture-technique.md)
- [Données cartographiques](specs/03-donnees-cartographiques.md)
- [Fiches quartiers](specs/04-fiches-quartiers.md)
- [Roadmap](specs/05-roadmap.md)
- [Décisions gameplay](specs/06-decisions-gameplay.md)

## Licence

Projet personnel -- tous droits réservés.
