# JORETAPO -- Spécifications du projet web

## Présentation

**JORETAPO** est un jeu de plateau satirique de conquête urbaine situé dans le Grand New York.
Chaque joueur incarne un parrain qui cherche à devenir maire par tous les moyens :
trafics, corruption, magouilles électorales, intimidation, et humour noir assumé.

Le projet consiste à adapter ce jeu de plateau physique (conçu ~2010, jamais finalisé)
en une **version jouable en ligne**, hébergée sur **GitHub Pages**.

## Décisions de cadrage

| Paramètre            | Choix retenu                                              |
|----------------------|-----------------------------------------------------------|
| Mode de jeu          | **Hotseat** (même écran, on se passe la tablette)         |
| Support cible        | **Tablette** (tactile, ~10 pouces)                        |
| Périmètre v1         | **Jeu complet** (toutes les mécaniques)                   |
| Rendu du plateau     | **Carte OSM** : 74 quartiers réels (polygones officiels)  |
| Hébergement          | **GitHub Pages** (site statique, pas de backend)          |
| Technologie          | **HTML5 / CSS3 / SVG / JavaScript** (vanilla, pas de framework lourd) |

## Avancement

| Sprint | Contenu | Statut |
|--------|---------|--------|
| Phase 1 | Plateau SVG interactif (74 quartiers NYC/NJ) | **FAIT** |
| Phase 2 | Configuration partie, draft quartiers, GameState | **FAIT** |
| Phase 3 | Boucle de tour, ordres, revenus, hotseat | **FAIT** |
| Sprint 4 | Conflits Diplomacy-like, flics, élimination payante, victoire 55 pts | **FAIT** |
| Sprint 5 | Élections tous les 10 tours, 8 pouvoirs du maire | **FAIT** |
| Sprint 6 | 75 cartes Magouille (30 types), draft 8→4, 15+ effets | **FAIT** |
| Sprint 7 | Gitans, incorruptibles, gangs (5 effets), fin de mandat | **FAIT** |
| Sprint 8 | Contrats + Polish UX | **En cours** |

## Index des documents

| Document | Contenu |
|----------|---------|
| [01 -- Mécaniques de jeu](01-mecaniques-de-jeu.md) | Référence complète des règles adaptées pour le numérique |
| [02 -- Architecture technique](02-architecture-technique.md) | Stack, modules (10 fichiers JS), structure du code |
| [03 -- Flow UX](03-flow-ux.md) | Écrans, navigation, gestion du hotseat |
| [04 -- Modèle de données](04-modele-de-donnees.md) | Structures JSON des quartiers, cartes, pions, économie |
| [05 -- Roadmap](05-roadmap.md) | Phasage du développement (sprints réalisés + restants) |
| [06 -- Décisions gameplay](06-decisions-gameplay.md) | Arbitrages des ambiguïtés des règles pour le numérique |
| [07 -- Cartographie (archive)](07-cartographie-adjacences.md) | Adjacences du design original à 72 blocs (archivé) |
| [08 -- Cartographie OSM](08-cartographie-osm.md) | **Découpage de référence** : 74 quartiers (59 CD + 12 Hudson + 3 Bergen) |

## Origine du projet

Le jeu physique original comprend :
- Des règles versionnées jusqu'à la v8 (format PowerPoint)
- Un plateau imprimable (carte NYC, formats A1/A2)
- 75 cartes Magouille (38 modèles uniques, en PDF)
- 15 fiches de quartiers détaillées + 4 îles
- Des feuilles d'ordres (Actions et Approvisionnements)
- Des pions et pictos graphiques (bitmaps)

Les fichiers sources sont conservés localement (dossiers `01` à `06` et `archives&tests`, exclus du repo).
