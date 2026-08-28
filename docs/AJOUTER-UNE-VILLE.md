# Ajouter une ville

Le plateau n'est pas New York : c'est un **graphe de zones**. Les moteurs ne
connaissent que des zones, des adjacences et des quartiers — aucun d'eux ne
contient le mot « New York ». Ajouter Toulouse ou Châtellerault est donc une
tâche de **données**, pas de code.

Preuve : la suite de tests tourne sur un plateau fictif de 8 zones
(`test/helpers.mjs`) qui n'a aucun rapport avec NYC, et les couleurs de quartier
sont générées à partir du nombre de quartiers, jamais codées en dur.

---

## Les quatre fichiers

Une ville, c'est trois fichiers de données plus une entrée au catalogue.

| Fichier | Rôle |
|---|---|
| `data/<ville>/zones.geojson` | La géométrie : un polygone par zone, `properties.id` obligatoire |
| `data/<ville>/adjacences.json` | Le graphe : `{ "Z1": ["Z2", "Z3"], … }`, **symétrique** |
| `data/<ville>/gameplay.json` | Les règles locales : zones, quartiers, îles |
| `data/villes.json` | Le catalogue : une entrée pointant vers les trois |

Une fois l'entrée ajoutée au catalogue, la ville se joue avec `?ville=<id>`.

---

## `gameplay.json`

```jsonc
{
  "zones": {
    "TL1": {
      "nom": "Capitole",
      "p": 6,          // revenu d'une prostituée par tour (×3 pour une de luxe)
      "d": 5,          // doses qu'un dealer écoule ici par tour
      "a": 4,          // armes qu'un trafiquant écoule ici par tour
      "facilite": "port"   // ou null — voir plus bas
    }
  },
  "quartiers": [
    {
      "id": "capitole",
      "nom": "Capitole",
      "zones": ["TL1", "TL2", "TL3"],
      "points": 6,
      "disponible_au_lancement": true,
      "population_par_zone": 100000,   // poids électoral
      "privileges_depart": {
        "lingots": 40, "armes": 10, "doses": 10,
        "trafiquants": 2, "dealers": 1,
        "prostituees_base": 0, "prostituees_luxe": 0
      },
      "gang": { "nom": "…", "effet": "actions_supplementaires", "usage_unique": true, "duree": 0 }
    }
  ],
  "iles": []
}
```

`facilite` accepte : `port`, `aeroport`, `peage` (points d'approvisionnement,
plafonds dans `js/revenue-engine.js`), `zurich_bank`, `hotel_police`, `mairie`,
`ambassade`, `douanes`, `immigration`, `annexe_zurich_bank`, `cimetiere`.

Une ville a besoin d'**au moins un point d'approvisionnement en armes** (`port`
ou `peage`), faute de quoi personne ne peut alimenter ses trafiquants ni créer
de pions.

---

## Le péage d'entrée

`npm test` fait passer **chaque** ville du catalogue par les mêmes quatorze
vérifications. Aucune n'est décorative : chacune correspond à un défaut qui a
réellement existé sur le plateau de New York et que personne n'avait vu.

| Vérification | Ce qu'elle évite |
|---|---|
| Toute zone d'un quartier existe | Un quartier qui référence une zone fantôme |
| Toute zone appartient à un quartier, un seul | Des zones orphelines, invisibles au décompte |
| Adjacences symétriques | Un passage à sens unique |
| Adjacences vers des zones connues | Une arête vers le vide |
| Aucune zone isolée | **QN14** n'avait aucune voisine : son quartier, 15 points, était inatteignable |
| Plateau d'un seul tenant | Le graphe de NYC était en **deux morceaux** |
| Quartier de départ d'un seul tenant | **Upper Manhattan** était coupé en deux par Central Park |
| Quartier de départ tenant sa majorité | **South Bronx** avait 3 pions pour 6 zones : 0 point au tour 1 |
| Pas plus de pions armés que de zones | **Harlem** en distribuait 5 pour 3 zones |
| Pas plus de prostituées que de zones | Même contrainte de cohabitation |
| Rendements p/d/a numériques | Une zone qui ne produit rien |
| Privilèges de départ complets | Un joueur qui démarre sans rien |
| Au moins six quartiers de départ | Une partie à six joueurs impossible |
| Îles reliées à des zones existantes | Une île inatteignable |

**Deux règles de conception à retenir**, parce qu'elles ne sont pas évidentes :

1. **Un quartier de départ doit pouvoir tenir la majorité de ses zones dès le
   tour 1.** Le contrôle se fait à la majorité stricte ; un quartier de 9 zones
   demande 5 pions de départ. Sinon son libellé de points devient une
   contre-indication : c'est exactement ce qui rendait les quartiers à 15 points
   de NYC strictement moins bons que ceux à 6.
2. **Un pion armé par zone, une prostituée par zone.** Un quartier de 3 zones ne
   peut pas accueillir 5 pions armés au départ.

---

## Équilibrer

Les tests disent si les règles s'appliquent. Ils ne disent pas si la partie est
jouable. C'est le rôle du banc d'essai :

```bash
node tools/sim.mjs --graines 40                 # ville par défaut
node tools/sim.mjs --graines 40 --joueurs 6
node tools/sim.mjs --graines 1 --detail         # journal tour par tour
node tools/sim.mjs --graines 40 --seuil 30      # essayer un autre seuil
```

Quatre indicateurs, et ce qu'ils doivent valoir :

| Indicateur | Cible | Pourquoi |
|---|---|---|
| Parties terminées | **100 %** | Une soirée doit se conclure |
| Tour de victoire (médiane) | **10 à 14** | Au-delà, la soirée n'y suffit pas ; en deçà, la partie finit avant la première élection (tour 7) |
| Premier combat (médiane) | **≤ 6** | Tant que personne ne se touche, ce sont N réussites en parallèle |
| Écart 1er/dernier au tour 6 | **≤ ×3** | Au-delà, la fin de partie est jouée d'avance |

Point de repère : sur New York, **avant** correction, le banc donnait 0 % de
parties terminées et 0 % de parties avec un combat, sur 20 parties de 30 tours.

Les réglages se trouvent dans **`js/rules.js`** — seuil de victoire, fin de
partie, ordres par tour, durée d'un mandat. Une ville plus petite que New York
(qui offre 129 points de quartier) aura besoin d'un seuil plus bas.

---

## Fabriquer la géométrie

`tools/build-map.mjs` produit `zones.geojson` et `adjacences.json` à partir d'un
découpage administratif : il calcule les adjacences en cherchant les polygones
qui se touchent. Un découpage INSEE (IRIS, quartiers) fait très bien l'affaire
pour une ville française.

Deux pièges vus sur New York :

- **Les polygones qui ne se touchent pas mais devraient.** Deux rives, deux côtés
  d'un parc, une île reliée par un pont : le calcul géométrique ne les verra pas.
  Le test « plateau d'un seul tenant » les attrape, il faut ensuite ajouter
  l'arête à la main. NYC en a demandé trois : deux ponts vers les Rockaways et la
  traversée de Central Park.
- **Le poids du GeoJSON.** Celui de New York fait 2,92 Mo pour 81 932 points de
  coordonnées, téléchargés et reprojetés à chaque chargement. Simplifier les
  polygones à la tolérance d'un pixel écran ne change rien à l'affichage et
  divise le poids par un ordre de grandeur.

Les couleurs, elles, n'ont pas à être choisies : `js/palette.js` les génère en
répartissant les teintes et en résolvant la clarté pour une luminance constante.
Un pack de 8 quartiers obtient un écart perceptif de ΔE 25,6 sans réglage. Un
quartier peut tout de même imposer la sienne via `quartier.couleur`.
