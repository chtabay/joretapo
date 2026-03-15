# 04 -- Modèle de données

Toutes les données statiques du jeu sont stockées dans le dossier `data/`.
L'état dynamique d'une partie est géré par l'objet `GameState` (sauvegardé en LocalStorage).

---

## Données statiques

### quartiers-osm.geojson (74 quartiers)

Fichier GeoJSON généré par `tools/build-map.mjs` à partir des données officielles NYC et NJ.
Chaque feature contient un polygone géographique et ses propriétés.

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "MN5",
        "nom": "Midtown, Times Square",
        "type": "cd",
        "borough": "Manhattan",
        "boro_cd": 105
      },
      "geometry": { "type": "MultiPolygon", "coordinates": [...] }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "HC05",
        "nom": "Hoboken",
        "type": "hc",
        "county": "Hudson"
      },
      "geometry": { "type": "MultiPolygon", "coordinates": [...] }
    },
    {
      "type": "Feature",
      "properties": {
        "id": "BG01",
        "nom": "Bogota / Nord Bergen",
        "type": "bg",
        "county": "Bergen",
        "municipalities": ["Bogota Borough", "Teaneck Township", "Hackensack", "Englewood", "Englewood Cliffs Borough"]
      },
      "geometry": { "type": "MultiPolygon", "coordinates": [...] }
    }
  ]
}
```

**Types de quartiers** : `cd` (Community District NYC), `hc` (Hudson County NJ), `bg` (Bergen County NJ agrégé).

**Répartition** : 59 CDs (MN1-12, BX1-12, BK1-18, QN1-14, SI1-3) + 12 Hudson (HC01-12) + 3 Bergen (BG01-03).

### adjacences-osm.json

Adjacences calculées automatiquement à partir des géométries (buffer 50m, Turf.js).

```json
{
  "MN5": ["MN2", "MN3", "MN4", "MN6", "MN7", "MN8"],
  "HC05": ["HC06", "HC10", "HC11"],
  "BG01": ["BG02", "BG03"]
}
```

145 paires d'adjacences au total. Seul QN14 (Rockaways) est isolé (péninsule).

### quartiers-gameplay.json (modèle de jeu v2)

Fichier central regroupant les 74 zones géographiques en **15 quartiers de jeu**,
avec les stats de gameplay migrées depuis l'ancien plateau.

**Structure à 2 niveaux** :

- **Quartier** : unité de contrôle territorial (15 au total). Possède un gang, des points
  de victoire, des privilèges de départ. Un joueur « possède » un quartier s'il a un pion
  ou construction sur chaque zone du quartier.
- **Zone** : case jouable (74 au total). Possède des indices P/D/A et une facilité optionnelle.
  Les adjacences sont dans `adjacences-osm.json` et les géométries dans `quartiers-osm.geojson`.

```json
{
  "meta": { "version": "2.0", "description": "..." },
  "quartiers": [
    {
      "id": "bergen",
      "nom": "Bergen",
      "zones": ["BG01", "BG02", "BG03"],
      "points": 6,
      "disponible_au_lancement": true,
      "population_par_zone": 140000,
      "privileges_depart": {
        "lingots": 40, "armes": 20, "doses": 0,
        "prostituees_base": 3, "prostituees_luxe": 0,
        "trafiquants": 2, "dealers": 0, "cartes_magouille_bonus": 0
      },
      "gang": {
        "nom": "Cartel de Bogota",
        "effet": "bloquer_ventes_armes",
        "duree": 5,
        "usage_unique": true
      }
    }
  ],
  "zones": {
    "BG01": { "nom": "Bogota / Nord Bergen", "p": 5, "d": 3, "a": 3, "facilite": "annexe_zurich_bank" },
    "MN1":  { "nom": "Financial District, Tribeca", "p": 3, "d": 2, "a": 1, "facilite": "zurich_bank" }
  },
  "iles": [
    { "id": "ile_roosevelt", "nom": "Roosevelt Island", "points": 0, "facilite": "ile", "adjacences": ["MN8", "QN1"] }
  ]
}
```

**15 quartiers de jeu** :

| Quartier          | Zones | Pts | Dispo | Gang                    |
|-------------------|-------|-----|-------|-------------------------|
| Bergen            | 3     | 6   | Oui   | Cartel de Bogota        |
| North Hudson      | 5     | 9   | Oui   | Yakuzas                 |
| Jersey City       | 3     | 6   | Oui   | Lobby Juif              |
| Meadowlands       | 4     | 6   | Non   | Mafia Créole            |
| Harlem            | 3     | 6   | Oui   | Gang du Bolito          |
| Upper Manhattan   | 3     | 6   | Oui   | Rat Pack                |
| Midtown           | 3     | 6   | Oui   | Les Nets                |
| Lower Manhattan   | 3     | 6   | Non   | Triades                 |
| South Bronx       | 6     | 9   | Oui   | St James Boys           |
| North Bronx       | 6     | 9   | Oui   | Mafia Bulgare           |
| West Queens       | 5     | 9   | Oui   | Camora Napolitaine      |
| East Queens       | 9     | 15  | Non   | Natifs Américains       |
| North Brooklyn    | 9     | 15  | Oui   | Syndicat des Dockers    |
| South Brooklyn    | 9     | 15  | Oui   | Ku Klux Klan            |
| Staten Island     | 3     | 6   | Non   | Lobby des Taxis         |

**24 facilités** réparties sur les 74 zones :

| Facilité            | Zones                                    |
|---------------------|------------------------------------------|
| zurich_bank         | MN1                                      |
| mairie              | MN5                                      |
| hotel_police        | BX4                                      |
| aeroport            | QN7                                      |
| ambassade           | MN8                                      |
| immigration         | BK1                                      |
| douanes             | BK18                                     |
| annexe_zurich_bank  | BG01, HC10, MN2, MN9, QN3, BK8          |
| port                | BG02, HC01, BK6                          |
| peage               | BG03, HC09, BX3, QN5                     |
| cimetiere           | BK5, BK12, BK16, QN9                    |

### quartiers.json (référence historique — archivé)

> Ancien modèle à 15 quartiers / 68 blocs / 4 îles. Remplacé par `quartiers-gameplay.json`.
> Conservé uniquement pour traçabilité.

### cartes-magouille.json (implémenté)

Fichier structuré en trois sections :

```json
{
  "types": [
    {
      "id": "001_permis_de_tuer",
      "nom": "Permis de Tuer",
      "description": "Éliminez un pion adverse gratuitement.",
      "cout": { "lingots": 0, "armes": 0, "doses": 0 },
      "conditions": [],
      "effet": "tuer_pion",
      "phase_jouable": "any",
      "duree": "instant",
      "repose_sous_pile": true,
      "image": "001_permis_de_tuer.png",
      "quantite": 4,
      "params": { "cible": "adversaire" }
    },
    {
      "id": "010_coupure_electricite",
      "nom": "Coupure d'Électricité",
      "description": "Coupez le courant dans un quartier ennemi pendant 3 tours.",
      "cout": { "lingots": 0, "armes": 0, "doses": 0 },
      "conditions": [],
      "effet": "couper_electricite",
      "phase_jouable": "any",
      "duree": "3_tours",
      "repose_sous_pile": true,
      "image": "010_coupure_electricite.png",
      "quantite": 3,
      "params": { "cible": "quartier_adversaire" }
    }
  ],
  "culture": [
    {
      "id": "culture_01",
      "nom": "Culture Générale",
      "description": "Pas d'effet. Mauvaise pioche.",
      "image": null,
      "quantite": 1
    }
  ],
  "regles_tirage": {
    "frequence": "chaque_election",
    "cartes_piochees": 8,
    "cartes_gardees": 4
  }
}
```

30 types de cartes mécaniques + 5 cartes culture (sans effet). Images stockées dans `assets/cards/`.

**Types d'effets** implémentés dans `MagouilleEngine._applyEffect` :

| Effet                     | Description                                         |
|---------------------------|-----------------------------------------------------|
| `tuer_pion`               | Élimine un pion adverse sur le plateau              |
| `retirer_electeurs`       | Retire des électeurs à un adversaire                |
| `teleporter_pion`         | Déplace un pion vers n'importe quelle zone          |
| `couper_electricite`      | Coupe l'électricité d'un quartier pour 3 tours      |
| `piocher_caisse_police`   | Pioche dans la caisse de l'hôtel de police          |
| `changer_ethnie`          | Change l'ethnie d'un joueur                         |
| `vendre_armes`            | Vend toutes ses armes à prix fixe (8L/unité)        |
| `deplacer_incorruptible`  | Déplace un incorruptible vers une autre zone        |
| `deplacer_gitans`         | Déplace un camp de gitans                           |
| `rendre_ineligible`       | Rend un joueur inéligible aux prochaines élections  |
| `igor_nettoyeur`          | Élimination gratuite pendant 1 mandat               |
| `contaminer_prostituees`  | Contamine les prostituées d'un adversaire           |
| `carte_orange`            | Déplacements illimités pour 1 tour                  |
| `secretaire`              | +2 actions par tour pendant 1 mandat                |
| `verges`                  | +2 actions par tour pendant 1 mandat                |

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
      "zone": "MN1",
      "fonction": "Récolte l'argent des constructions"
    },
    {
      "id": "hotel_police",
      "nom": "Hôtel de Police",
      "zone": "BX4",
      "fonction": "Stocke amendes, récolte créations de pions et bakchichs"
    },
    {
      "id": "mairie",
      "nom": "Mairie",
      "zone": "MN5",
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
    "zones": {
      "BX1": {
        "proprietaire": 0,
        "pions": [
          { "type": "dealer", "joueur": 0 }
        ],
        "construction": null,
        "electricite": true,
        "gitans": false
      },
      "BX4": {
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
      { "zone": "BX3", "joueur": 1, "actif": true }
    ],
    "reserves": 5,
    "elimines": 0
  },

  "incorruptibles": {
    "deployes": [
      { "zone": "QN1" }
    ],
    "elimines": 0
  },

  "gitans": {
    "positions": ["ile_roosevelt", "ile_rikers", "ile_ward", "ile_liberty"]
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
Quartier (1) ──── contient ────> (3-9) Zones
Zone     (1) ──── adjacent à ──> (N) Zones      [adjacences-osm.json]
Zone     (1) ──── géométrie ───> (1) Polygone   [quartiers-osm.geojson]
Zone     (1) ──── contient ────> (0-N) Pions
Zone     (1) ──── contient ────> (0-1) Construction
Zone     (1) ──── a une ──────> (0-1) Facilité/Institution
Joueur   (1) ──── possède ─────> (N) Pions sur le plateau
Joueur   (1) ──── possède ─────> (N) Ressources
Joueur   (1) ──── détient ─────> (0-4) Cartes Magouille
Quartier (1) ──── a un ────────> (1) Gang (activable)
```
