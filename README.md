# Joretapo

Jeu de plateau numérique en hotseat (pass-and-play) sur tablette, inspiré par la mécanique de *Diplomacy* et l'univers du crime organisé dans un New York fictif.

## Concept

2 à 6 joueurs s'affrontent pour dominer les marchés illicites, contrôler des quartiers et accéder au pouvoir politique. Le premier à atteindre **35 points de victoire** l'emporte ; si personne n'y parvient, la partie se clôt au 14ᵉ tour et le joueur en tête gagne. Ces valeurs sont calées par simulation, pas au jugé — voir `js/rules.js`.

**Pas de serveur, pas de backend** : le jeu tourne entièrement dans le navigateur (HTML/CSS/JS vanilla) et se déploie sur GitHub Pages.

## Fonctionnalités

- **Plateau interactif** : carte SVG de 74 zones (NYC + Hudson/Bergen) avec zoom/pan tactile
- **Hotseat** : mécanisme de rideau entre joueurs, ordres secrets
- **5 phases par tour** : approvisionnement, révélation, négociation, déplacement, résolution
- **Conflits Diplomacy-like** : supports, **soutien explicite à un allié**, coupures, fuite, élimination payante
- **Élections tous les 7 tours** : vote secret, 8 pouvoirs du maire
- **43 cartes Magouille actives** (19 types) : draft 8→4, effets réellement appliqués. 22 autres cartes sont désactivées par drapeau dans `data/ruleset.json` faute d'effet lu — rien n'est supprimé
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
npm run serve      # ou : python -m http.server 8000
```

Puis ouvrir `http://localhost:8000` sur tablette ou navigateur.
Une autre ville se joue avec `?ville=<id>` (catalogue dans `data/villes.json`).

## Vérifier

```bash
npm test                       # 166 tests, aucune dépendance
node tools/sim.mjs             # parties simulées : durée, tension, équilibre
node tools/sim.mjs --detail    # journal tour par tour
```

Les moteurs ne touchent pas au DOM : ils sont pilotables sous Node, sans navigateur.
Le banc d'essai est ce qui permet de changer une règle en mesurant l'effet plutôt
qu'en le supposant.

## Documentation

La documentation détaillée se trouve dans le dossier `specs/` :

- [Mécaniques de jeu](specs/01-mecaniques-de-jeu.md)
- [Architecture technique](specs/02-architecture-technique.md)
- [Flux UX](specs/03-flow-ux.md)
- [Modèle de données](specs/04-modele-de-donnees.md)
- [Roadmap](specs/05-roadmap.md)
- [Décisions gameplay](specs/06-decisions-gameplay.md)
- [Cartographie et adjacences](specs/07-cartographie-adjacences.md)
- [Cartographie OSM](specs/08-cartographie-osm.md)

Et pour intervenir :

- [Ajouter une ville](docs/AJOUTER-UNE-VILLE.md) — le plateau est un graphe, pas New York
- [Remettre un système en jeu](docs/AJOUTER-UN-SYSTEME.md) — le péage d'entrée

## Licence

Projet personnel -- tous droits réservés.
