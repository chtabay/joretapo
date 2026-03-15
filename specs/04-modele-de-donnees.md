# 04 -- Modèle de données

Toutes les données statiques du jeu sont stockées en **fichiers JSON** dans le dossier `data/`.
L'état dynamique d'une partie est géré par l'objet `GameState` (sauvegardé en LocalStorage).

---

## Données statiques

### quartiers.json

```json
{
  "quartiers": [
    {
      "id": "bogota",
      "nom": "Bogota",
      "points": 9,
      "disponible_au_lancement": true,
      "population_par_bloc": 160000,
      "privileges_depart": {
        "lingots": 40,
        "armes": 20,
        "doses": 0,
        "prostituees_base": 3,
        "prostituees_luxe": 0,
        "trafiquants": 2,
        "dealers": 0,
        "cartes_magouille_bonus": 0
      },
      "gang": {
        "nom": "Cartel de Bogota",
        "description": "Bloque les ventes d'armes de tous les autres joueurs pendant 5 tours.",
        "usage_unique": true,
        "effet": "bloquer_ventes_armes",
        "duree": 5
      },
      "blocs": [
        {
          "id": "bogota_bogota",
          "nom": "Bogotá",
          "indice_p": 7,
          "indice_d": 2,
          "indice_a": 1,
          "facilite": "annexe_zurich_bank",
          "adjacences": ["bogota_teaneck", "bogota_hackensack"]
        },
        {
          "id": "bogota_teaneck",
          "nom": "Teaneck",
          "indice_p": 7,
          "indice_d": 2,
          "indice_a": 1,
          "facilite": "peage",
          "adjacences": ["bogota_bogota", "bogota_hackensack", "bogota_englewood"]
        },
        {
          "id": "bogota_hackensack",
          "nom": "Hackensack",
          "indice_p": 7,
          "indice_d": 2,
          "indice_a": 1,
          "facilite": null,
          "adjacences": ["bogota_bogota", "bogota_teaneck", "bogota_englewood", "bogota_englewood_cliffs"]
        },
        {
          "id": "bogota_englewood",
          "nom": "Englewood",
          "indice_p": 7,
          "indice_d": 2,
          "indice_a": 1,
          "facilite": null,
          "adjacences": ["bogota_teaneck", "bogota_hackensack", "bogota_englewood_cliffs"]
        },
        {
          "id": "bogota_englewood_cliffs",
          "nom": "Englewood Cliffs",
          "indice_p": 7,
          "indice_d": 2,
          "indice_a": 1,
          "facilite": null,
          "adjacences": ["bogota_hackensack", "bogota_englewood"]
        }
      ]
    }
  ]
}
```

**Note** : les `adjacences` entre blocs de quartiers différents devront être déterminées
d'après la carte du plateau. C'est un travail de cartographie à faire lors du développement
du plateau SVG.

**Structure par quartier** (15 quartiers + îles) :

| Quartier          | Blocs | Pts | Dispo lancement | Gang                    |
|-------------------|-------|-----|-----------------|-------------------------|
| Bogota            | 5     | 9   | Oui             | Cartel de Bogota        |
| Harlem            | 5     | 9   | Oui             | Gang du Bolito          |
| Skyline           | 4     | 6   | Non             | Lobby des Taxis         |
| China Town        | 4     | 6   | Non             | Triades                 |
| Central Park      | 5     | 6   | Oui             | Les Nets                |
| Brooklyn          | 10    | 15  | Oui             | Syndicat des Dockers    |
| Queens            | 8     | 12  | Oui             | Camora Napolitaine      |
| Bronx             | 7     | 12  | Oui             | St James Boys           |
| North Broadway    | 3     | 6   | Oui             | Rat Pack                |
| Greenwich Village | 4     | 6   | Oui             | Natifs Américains       |
| Cypress Hill      | 3     | 3   | Non             | Ku Klux Klan            |
| Edgewater         | 4     | 6   | Oui             | Mafia Bulgare           |
| North Bergen      | 3     | 6   | Oui             | Yakuzas                 |
| Jersey City       | 4     | 6   | Oui             | Lobby Juif              |
| Little Ferry      | 3     | 3   | Non             | Mafia Créole            |
| Îles (×4)         | 1 chacune | 0 | Non          | --                      |

### cartes-magouille.json

```json
{
  "cartes": [
    {
      "id": "permis_de_tuer",
      "nom": "Permis de tuer",
      "texte_saveur": "Cette carte est une opportunité unique d'abattre un importun gratuitement...",
      "cout": { "lingots": 0, "armes": 0, "doses": 0, "cartes": 0 },
      "conditions": [],
      "effet": {
        "type": "eliminer_pion",
        "cible": "any",
        "gratuit": true
      },
      "duree": "tour",
      "retour_pile": true,
      "exemplaires": 4,
      "phase_jouable": "any"
    },
    {
      "id": "coupure_electricite",
      "nom": "Coupure d'électricité",
      "texte_saveur": "Vous avez l'opportunité de couper le courant...",
      "cout": { "lingots": 0, "armes": 0, "doses": 0, "cartes": 0 },
      "conditions": [],
      "effet": {
        "type": "bloquer_quartier",
        "duree_tours": 3,
        "bonus_cambriolage": 0.5
      },
      "duree": "3_tours",
      "retour_pile": true,
      "exemplaires": 3,
      "phase_jouable": "any"
    }
  ]
}
```

**Types d'effets** des cartes :

| Type d'effet            | Description                                         |
|-------------------------|-----------------------------------------------------|
| `eliminer_pion`         | Retire un pion du plateau                           |
| `deplacer_pion`         | Déplace un pion (incorruptible, flic, gitan)        |
| `bloquer_quartier`      | Coupe l'électricité d'un quartier                   |
| `modifier_electeurs`    | Ajoute ou retire des électeurs                      |
| `voler_ressources`      | Vole cargaison, argent, denrées                     |
| `annuler_carte`         | Annule l'effet d'une autre carte magouille          |
| `gagner_lingots`        | Gain direct de lingots                              |
| `proteger_triche`       | Protection contre accusation de triche              |
| `bloquer_extension`     | Empêche les adversaires de s'étendre sur un quartier|
| `ineligible`            | Rend un joueur inéligible aux prochaines élections  |
| `actions_bonus`         | Actions supplémentaires par tour                    |
| `changer_ethnie`        | Change les restrictions d'accès aux quartiers       |
| `teleporter_pion`       | Envoie un pion n'importe où sur la carte            |
| `racket`                | Force les autres joueurs à payer                    |
| `carte_neutre`          | Aucun effet (mauvaise pioche)                       |
| `retirer_flic`          | Retire un flic du jeu définitivement                |
| `nettoyeur`             | Dispense de posséder un cimetière pour cacher corps |
| `vendre_armes`          | Vend le stock d'armes à prix fixe                   |
| `detournement_fonds`    | Récupère la caisse de la police (maire uniquement)  |

### pions.json

```json
{
  "pions": [
    {
      "id": "dealer",
      "nom": "Dealer",
      "abreviation": "DE",
      "categorie": "usuel",
      "arme": true,
      "prix": { "lingots": 40, "armes": 2 },
      "prix_elimination": { "lingots": 40, "armes": 4 },
      "fonction": "vente_drogue",
      "cohabite_avec": ["prostituee_base", "prostituee_luxe"],
      "ne_cohabite_pas": ["trafiquant", "dealer"]
    },
    {
      "id": "prostituee_base",
      "nom": "Prostituée classique",
      "abreviation": "PR",
      "categorie": "usuel",
      "arme": false,
      "prix": { "lingots": 40 },
      "prix_elimination": { "lingots": 40 },
      "fonction": "passe_classique",
      "capturable": true,
      "cohabite_avec": ["dealer", "trafiquant", "prostituee_luxe"]
    }
  ]
}
```

### constructions.json

```json
{
  "constructions": [
    {
      "id": "restaurant",
      "nom": "Restaurant / Pizzeria",
      "cout_zurich": 40,
      "cout_police": 40,
      "condition": null,
      "rendement_par_tour": 14,
      "points_victoire": 1,
      "notes": null
    },
    {
      "id": "bordel",
      "nom": "Bordel",
      "cout_zurich": 400,
      "cout_police": 40,
      "condition": "4 prostituées de luxe à l'intersection de 4 cases",
      "rendement_par_tour": "variable (somme des 4 cases adjacentes pour pute de luxe)",
      "points_victoire": 1,
      "notes": "Possède les 4 cases adjacentes. Permet le chantage. Réduit coût corruption incorruptible."
    },
    {
      "id": "casino",
      "nom": "Casino",
      "cout_zurich": 400,
      "cout_police": 60,
      "condition": "Posséder un bordel",
      "rendement_par_tour": 60,
      "points_victoire": 1,
      "notes": "Insensible aux flics normaux, mais pas aux incorruptibles"
    },
    {
      "id": "tripot",
      "nom": "Tripot",
      "cout_zurich": 100,
      "cout_police": 40,
      "condition": null,
      "rendement_par_tour": 14,
      "points_victoire": 1,
      "notes": null
    },
    {
      "id": "labo",
      "nom": "Labo de raffinage",
      "cout_zurich": 100,
      "cout_police": 40,
      "condition": "Minimum 6 dealers",
      "rendement_par_tour": 0,
      "points_victoire": 1,
      "notes": "Divise par 2 le coût d'achat de la drogue (1 lingot au lieu de 2)"
    }
  ]
}
```

### institutions.json

```json
{
  "institutions": [
    {
      "id": "zurich_bank",
      "nom": "Central Zurich Bank",
      "bloc": "skyline_financial_district",
      "fonction": "Récolte l'argent des constructions"
    },
    {
      "id": "hotel_police",
      "nom": "Hôtel de Police",
      "bloc": "bronx_high_bridge",
      "fonction": "Stocke amendes, récolte créations de pions et bakchichs"
    },
    {
      "id": "mairie",
      "nom": "Mairie",
      "bloc": "skyline_world_trade_center",
      "fonction": "Siège du pouvoir"
    }
  ]
}
```

---

## État dynamique (GameState)

Structure complète de l'objet `GameState` sauvegardé en LocalStorage :

```json
{
  "version": "1.0",
  "timestamp": "2026-03-14T18:30:00Z",

  "config": {
    "nb_joueurs": 4,
    "timer_negociation": 300
  },

  "tour": 3,
  "phase": 2,
  "joueur_actif_index": null,

  "joueurs": [
    {
      "id": 0,
      "nom": "Bob",
      "couleur": "#e74c3c",
      "quartiers_origine": ["bronx"],
      "ressources": {
        "lingots": 340,
        "doses": 12,
        "armes": 8,
        "lingots_sales": 0
      },
      "cartes_magouille": ["permis_de_tuer", "igor", "carte_orange"],
      "electeurs_bonus": 0,
      "electeurs_malus": 0,
      "est_maire": false,
      "privileges_maire_restants": 0,
      "gangs_actives": [],
      "nb_coupole_restantes": 2,
      "ethnie": "caucasien",
      "actions_bonus": 0,
      "ordres_phase_courante": []
    }
  ],

  "plateau": {
    "blocs": {
      "bronx_mott_haven": {
        "proprietaire": 0,
        "pions": [
          { "type": "dealer", "joueur": 0 }
        ],
        "construction": null,
        "electricite": true,
        "gitans": false
      },
      "bronx_high_bridge": {
        "proprietaire": null,
        "pions": [],
        "construction": null,
        "electricite": true,
        "gitans": false
      }
    }
  },

  "caisses": {
    "zurich_bank": 1200,
    "hotel_police": 560
  },

  "maire": {
    "joueur_id": null,
    "privileges_restants": 0,
    "tour_election": null
  },

  "deck_magouille": {
    "pile": ["carte_id_1", "carte_id_2"],
    "defaussees": [],
    "retirees_du_jeu": []
  },

  "flics": {
    "deployes": [
      { "bloc": "bronx_morrisania", "joueur": 1, "actif": true }
    ],
    "reserves": 5,
    "elimines": 0
  },

  "incorruptibles": {
    "deployes": [
      { "bloc": "queens_astoria" }
    ],
    "elimines": 0
  },

  "gitans": {
    "positions": ["ile_roosevelt", "ile_rickers", "ile_ward", "ile_liberty"]
  },

  "gangs_actifs": {},

  "contrats": [
    {
      "id": 1,
      "tour_creation": 2,
      "joueur_a": 0,
      "joueur_b": 2,
      "description": "Bob donne 100 lingots à Alice en échange de 5 armes par tour pendant 3 tours"
    }
  ],

  "coupures_electricite": [
    {
      "quartier": "queens",
      "tours_restants": 2
    }
  ],

  "historique": [
    {
      "tour": 1,
      "phase": 5,
      "evenements": [
        "Bob déplace son Dealer vers East Harlem",
        "Conflit sur East Harlem : Bob l'emporte sur Charlie"
      ]
    }
  ]
}
```

---

## Relations clés entre les données

```
Quartier (1) ──── contient ────> (N) Blocs
Bloc     (1) ──── adjacent à ──> (N) Blocs
Bloc     (1) ──── contient ────> (0-N) Pions
Bloc     (1) ──── contient ────> (0-1) Construction
Bloc     (1) ──── a une ──────> (0-1) Facilité/Institution
Joueur   (1) ──── possède ─────> (N) Pions sur le plateau
Joueur   (1) ──── possède ─────> (N) Ressources
Joueur   (1) ──── détient ─────> (0-4) Cartes Magouille
Quartier (1) ──── a un ────────> (1) Gang (activable)
```
