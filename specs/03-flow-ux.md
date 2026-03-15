# 03 -- Flow UX

## Principes directeurs

- **Tablette tactile** : tout se fait au toucher, gros boutons, zones de tap confortables
- **Hotseat** : le "rideau" entre joueurs est sacré, aucune fuite d'information
- **Lisibilité** : le plateau NYC est dense (~70 blocs), il faut pouvoir zoomer et identifier rapidement l'état
- **Autonomie** : le jeu guide les joueurs phase par phase, pas besoin de connaître les règles par cœur
- **Thème sombre** : ambiance "pègre", cohérente avec l'univers du jeu

---

## Écrans principaux

### 1. Écran d'accueil

```
┌──────────────────────────────────┐
│                                  │
│          J O R É T A P O         │
│                                  │
│     [  Nouvelle partie  ]        │
│     [  Charger partie   ]        │
│     [  Règles du jeu    ]        │
│                                  │
└──────────────────────────────────┘
```

- Titre stylisé, ambiance noire/dorée
- "Charger partie" grisé si aucune sauvegarde
- "Règles du jeu" ouvre un résumé interactif consultable à tout moment

### 2. Configuration de partie

```
┌──────────────────────────────────────────┐
│  NOUVELLE PARTIE                         │
│                                          │
│  Nombre de joueurs : [2] [3] [4] [5] [6]│
│                                          │
│  Joueur 1 : [Nom______] 🔴              │
│  Joueur 2 : [Nom______] 🔵              │
│  Joueur 3 : [Nom______] 🟢              │
│  Joueur 4 : [Nom______] 🟡              │
│                                          │
│           [ Lancer la partie ]           │
└──────────────────────────────────────────┘
```

- Choix du nombre de joueurs (2-6)
- Nom et couleur pour chaque joueur
- Les couleurs sont des pastilles tactiles sélectionnables

### 3. Tirage des quartiers

```
┌──────────────────────────────────────────┐
│  TIRAGE DES QUARTIERS                    │
│  Joueur 1, choisissez votre quartier     │
│                                          │
│  ┌─────────┐  ┌─────────┐               │
│  │ BROOKLYN │  │ QUEENS  │               │
│  │  15 pts  │  │  12 pts │               │
│  │ Dockers  │  │ Camora  │               │
│  └─────────┘  └─────────┘               │
│                                          │
│  Touchez un quartier pour le sélectionner│
└──────────────────────────────────────────┘
```

- Selon les règles : 4+ joueurs → tirage de 2, choix de 1 ; 3- joueurs → tirage de 4, choix de 2
- Affichage des cartes de quartier avec points, gang, privilèges de départ
- Passage au joueur suivant via rideau

### 4. Écran plateau (écran principal)

```
┌──────────────────────────────────────────────────┐
│ Tour 3 │ Phase 2: Révélation │ Joueur actif: Bob │
├──────────────────────────────────────────────────┤
│                                                  │
│              ┌─── CARTE NYC ───┐                 │
│              │                 │                 │
│              │   (plateau SVG  │                 │
│              │    interactif   │                 │
│              │    zoomable)    │                 │
│              │                 │                 │
│              └─────────────────┘                 │
│                                                  │
├──────────────────────────────────────────────────┤
│ [Mes ordres] [Mes cartes] [Scores] [Menu] [Aide] │
└──────────────────────────────────────────────────┘
```

- **Barre du haut** : tour, phase courante, joueur actif
- **Zone centrale** : carte SVG en plein écran, zoom/pan tactile
- **Barre du bas** : actions contextuelles

**Interactions avec le plateau** :
- **Tap sur un bloc** : popup d'information (propriétaire, pions, constructions, indices P/D/A, électeurs)
- **Tap long sur un bloc** : ouvre les actions possibles (déplacer vers, construire, etc.)
- **Pions** : icônes colorées sur chaque bloc, empilables visuellement
- **Quartiers** : contour coloré selon le propriétaire dominant

### 5. Écran Rideau (hotseat)

```
┌──────────────────────────────────────────┐
│                                          │
│                                          │
│     Passez la tablette à                 │
│                                          │
│            JOUEUR 3                      │
│            (Alice)                       │
│              🟢                          │
│                                          │
│     [ Je suis Alice, commencer ]         │
│                                          │
│                                          │
└──────────────────────────────────────────┘
```

- Fond opaque (noir complet)
- Gros texte, nom et couleur du joueur
- Bouton de confirmation (évite qu'un autre joueur voie par accident)

### 6. Écran de saisie des ordres (privé)

```
┌──────────────────────────────────────────────────┐
│ ORDRES DE ALICE (Tour 3)        Ordres: 2/5 used │
├──────────────────────────────────────────────────┤
│                                                  │
│ Vos ressources:                                  │
│ 💰 340 lingots  💊 12 doses  🔫 8 armes          │
│ 👩 3 prostituées  🃏 2 cartes magouille           │
│                                                  │
│ ┌─ Ordre 1 ─────────────────────────────┐        │
│ │ Type: [Approvisionnement ▼]           │        │
│ │ Denrée: [Armes ▼]  Quantité: [4]     │        │
│ │ Point d'appro: [Péage Morrisania ▼]   │        │
│ └───────────────────────────────────────┘        │
│                                                  │
│ ┌─ Ordre 2 ─────────────────────────────┐        │
│ │ Type: [Construction ▼]                │        │
│ │ Bâtiment: [Restaurant ▼]              │        │
│ │ Case: [Mott Haven ▼]                  │        │
│ └───────────────────────────────────────┘        │
│                                                  │
│ [ + Ajouter un ordre ]                           │
│                                                  │
│ [Voir le plateau]       [ Valider mes ordres ]   │
└──────────────────────────────────────────────────┘
```

- Affichage des ressources actuelles du joueur
- Compteur d'ordres (max 5 par défaut, +2 si Central Park ou Secrétaire)
- Formulaires tactiles avec menus déroulants
- Bouton "Voir le plateau" : ouvre le plateau en lecture seule (vision du joueur uniquement)
- Validation = verrouillage des ordres + passage au rideau suivant

### 7. Écran de révélation

```
┌──────────────────────────────────────────────────┐
│ RÉVÉLATION DES ORDRES - Tour 3, Phase 2          │
├──────────────────────────────────────────────────┤
│                                                  │
│ 🔴 Bob :                                         │
│   1. Commande 4 armes au Port Red Hook           │
│   2. Construit un restaurant à Mott Haven        │
│                                                  │
│ 🔵 Charlie :                                     │
│   1. Commande 10 doses au Péage Morrisania       │
│                                                  │
│ 🟢 Alice :                                       │
│   1. Commande 4 armes au Péage Morrisania        │
│   2. Construit un restaurant à Mott Haven        │
│                                                  │
│ ─── Revenus perçus ───                           │
│ 🔴 Bob : +48 lingots (dealers) +14 (resto)       │
│ 🔵 Charlie : +18 lingots (prostituées)           │
│ 🟢 Alice : +6 lingots (prostituées)              │
│                                                  │
│            [ Phase suivante → ]                  │
└──────────────────────────────────────────────────┘
```

- Affichage séquentiel ou simultané des ordres de chaque joueur
- Calcul automatique des revenus avec animation
- Bouton pour passer à la phase suivante

### 8. Écran de négociation

```
┌──────────────────────────────────────────────────┐
│ PHASE DE NÉGOCIATION                  ⏱ 5:00     │
├──────────────────────────────────────────────────┤
│                                                  │
│           ┌─── PLATEAU ───┐                      │
│           │  (lecture     │                      │
│           │   seule)      │                      │
│           └───────────────┘                      │
│                                                  │
│  Discutez entre vous !                           │
│  Accords, menaces, alliances...                  │
│                                                  │
│  [ Enregistrer un contrat ]                      │
│                                                  │
│        [ Fin des négociations → ]                │
└──────────────────────────────────────────────────┘
```

- Plateau visible en lecture seule (tous les joueurs voient tout)
- Timer optionnel (configurable ou désactivable)
- Bouton "Enregistrer un contrat" : formulaire simple (joueur A donne X à joueur B contre Y)
- Les contrats sont affichés à côté du plateau pour mémoire

### 9. Écran de résolution des conflits

```
┌──────────────────────────────────────────────────┐
│ RÉSOLUTION DES CONFLITS - Tour 3                 │
├──────────────────────────────────────────────────┤
│                                                  │
│  ⚔ CONFLIT sur East Harlem :                     │
│                                                  │
│  🔴 Dealer de Bob → East Harlem                  │
│     Supports: Trafiquant (Lennox Ave) ✓          │
│     Force totale: 2                              │
│                                                  │
│  🔵 Dealer de Charlie → East Harlem              │
│     Supports: aucun                              │
│     Force totale: 1                              │
│                                                  │
│  ➤ Résultat: Bob l'emporte !                     │
│    Charlie fuit vers Inwood Hill Park             │
│                                                  │
│            [ Conflit suivant → ]                 │
└──────────────────────────────────────────────────┘
```

- Chaque conflit est présenté un par un avec animation
- Affichage des supports, supports coupés, forces
- Résultat avec indication de fuite/capture/élimination
- Vue du plateau mise à jour en temps réel

### 10. Écran d'élection

```
┌──────────────────────────────────────────────────┐
│ ÉLECTIONS - Fin du Tour 10                       │
├──────────────────────────────────────────────────┤
│                                                  │
│  Candidats et voix :                             │
│  🔴 Bob : 1 200 000 électeurs                    │
│  🔵 Charlie : 860 000 électeurs                  │
│  🟢 Alice : 1 450 000 électeurs                  │
│  🟡 Dave : 620 000 électeurs                     │
│                                                  │
│  ─── VOTE SECRET ───                             │
│  (passez la tablette à chaque joueur)            │
│                                                  │
│           [ Commencer le vote → ]                │
└──────────────────────────────────────────────────┘
```

Puis pour chaque joueur (via rideau) :

```
┌──────────────────────────────────────────────────┐
│ VOTE DE ALICE 🟢                                 │
│                                                  │
│ Vos 1 450 000 voix iront à :                    │
│                                                  │
│  [ 🔴 Bob     ]                                  │
│  [ 🔵 Charlie ]                                  │
│  [ 🟢 Moi-même]                                  │
│  [ 🟡 Dave    ]                                  │
│                                                  │
│           [ Voter → ]                            │
└──────────────────────────────────────────────────┘
```

Puis dépouillement :

```
┌──────────────────────────────────────────────────┐
│ RÉSULTAT DES ÉLECTIONS                           │
│                                                  │
│  🟢 ALICE est élue MAIRE !                       │
│     2 650 000 voix                               │
│                                                  │
│  🔴 Bob : 1 200 000                              │
│  🔵 Charlie : 0                                  │
│  🟡 Dave : 620 000                               │
│                                                  │
│  Alice gagne 15 points de victoire               │
│  et pourra utiliser 2 privilèges de maire        │
│                                                  │
│          [ Continuer → ]                         │
└──────────────────────────────────────────────────┘
```

### 11. Écran de sélection des cartes magouille

```
┌──────────────────────────────────────────────────┐
│ TIRAGE DE CARTES - Alice 🟢                      │
│ Sélectionnez 4 cartes parmi 8                    │
├──────────────────────────────────────────────────┤
│                                                  │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │Permis  │ │Carte   │ │Coupure │ │Igor    │     │
│ │de tuer │ │Orange  │ │élec.   │ │        │     │
│ │  ✓     │ │        │ │  ✓     │ │  ✓     │     │
│ └────────┘ └────────┘ └────────┘ └────────┘     │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐     │
│ │Salto   │ │Roses   │ │Secré-  │ │Guerre  │     │
│ │Angel   │ │connex. │ │taire   │ │des     │     │
│ │        │ │        │ │  ✓     │ │gangs   │     │
│ └────────┘ └────────┘ └────────┘ └────────┘     │
│                                                  │
│ Sélectionnées : 4/4                              │
│                                                  │
│ [ Voir le détail ]       [ Valider → ]           │
└──────────────────────────────────────────────────┘
```

- Cartes affichées en grille, tap pour sélectionner/désélectionner
- Tap long pour voir le détail complet de la carte
- Compteur de sélection (exactement 4)

### 12. Écran de fin de partie

```
┌──────────────────────────────────────────────────┐
│                                                  │
│          🏆 ALICE REMPORTE LA PARTIE ! 🏆        │
│                                                  │
│  Points de victoire :                            │
│  🟢 Alice : 57 pts  ← VICTOIRE                  │
│  🔴 Bob : 42 pts                                 │
│  🔵 Charlie : 38 pts                             │
│  🟡 Dave : 29 pts                                │
│                                                  │
│  Détail :                                        │
│  - Quartiers : 21 pts                            │
│  - Maire : 15 pts                                │
│  - Reine de la drogue : 10 pts                   │
│  - Constructions : 8 pts                         │
│  - Plus riche : 0 pts                            │
│  - Cartes bonus : 3 pts                          │
│                                                  │
│  [ Nouvelle partie ]  [ Retour à l'accueil ]     │
└──────────────────────────────────────────────────┘
```

---

## Navigation entre écrans

```
Accueil
  ├── Nouvelle partie → Configuration → Tirage quartiers → Boucle de jeu
  ├── Charger partie → Boucle de jeu
  └── Règles du jeu (overlay consultable à tout moment)

Boucle de jeu :
  Plateau ←→ Rideau ←→ Saisie ordres ←→ Révélation ←→ Négociation ←→ Résolution
                                                            │
                                              (tous les 10 tours)
                                                            ↓
                                                      Élections → Cartes → Gangs
```

## Gestes tactiles

| Geste              | Action                                    |
|---------------------|-------------------------------------------|
| Tap                 | Sélectionner un bloc, un bouton, une carte |
| Tap long            | Ouvrir le détail / les actions possibles   |
| Pinch-to-zoom       | Zoomer/dézoomer sur le plateau            |
| Pan (glisser)       | Se déplacer sur le plateau                |
| Swipe gauche/droite | Navigation entre panneaux d'information   |

## Accessibilité

- Taille minimale des zones de tap : **44×44 pixels** (recommandation Apple/Google)
- Contraste suffisant pour lisibilité en conditions d'éclairage variées
- Couleurs des joueurs choisies pour être distinguables (y compris daltonisme) + icône distinctive par joueur
- Texte des cartes magouille lisible sans zoom (taille min 14px)
