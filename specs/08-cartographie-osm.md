# 08 -- Cartographie OSM (découpage de référence)

## Décision

Les **quartiers de plus bas niveau** du plateau sont alignés sur les données OSM/officielles :

| Source | Nombre | Détail |
|--------|--------|--------|
| **NYC** | 59 | Community Districts |
| **Hudson County (NJ)** | 12 | Municipalités |
| **Bergen County (NJ)** | 3 | Zones agrégées |
| **Total** | **74** | Quartiers de plus bas niveau |

---

## 59 Community Districts (NYC)

### Manhattan (MN1–MN12)
| Id | Quartier principal |
|----|--------------------|
| MN1 | Financial District, Tribeca, Battery Park |
| MN2 | Greenwich Village, SoHo |
| MN3 | East Village |
| MN4 | Chelsea, Hell's Kitchen |
| MN5 | Midtown, Times Square, Flatiron |
| MN6 | Gramercy, Murray Hill, Kips Bay |
| MN7 | Upper West Side |
| MN8 | Upper East Side, Yorkville, Roosevelt Island |
| MN9 | Morningside Heights, Hamilton Heights |
| MN10 | Central Harlem |
| MN11 | East Harlem (El Barrio) |
| MN12 | Washington Heights, Inwood |

### Bronx (BX1–BX12)
| Id | Quartier principal |
|----|--------------------|
| BX1 | Mott Haven, Melrose, Port Morris |
| BX2 | Hunts Point, Longwood |
| BX3 | Morrisania, Claremont |
| BX4 | Highbridge, Concourse |
| BX5 | Fordham, Morris Heights |
| BX6 | Belmont, East Tremont |
| BX7 | Kingsbridge, Norwood, Bedford Park |
| BX8 | Riverdale, Kingsbridge Heights |
| BX9 | Parkchester, Soundview, Castle Hill |
| BX10 | Co-op City, Throggs Neck, City Island |
| BX11 | Morris Park, Pelham Parkway |
| BX12 | Baychester, Woodlawn, Wakefield |

### Brooklyn (BK1–BK18)
| Id | Quartier principal |
|----|--------------------|
| BK1 | Williamsburg, Greenpoint |
| BK2 | Brooklyn Heights, DUMBO, Fort Greene |
| BK3 | Bedford-Stuyvesant, Ocean Hill |
| BK4 | Bushwick |
| BK5 | East New York, Cypress Hills |
| BK6 | Red Hook, Carroll Gardens, Park Slope |
| BK7 | Sunset Park, Windsor Terrace |
| BK8 | Crown Heights, Prospect Heights |
| BK9 | Crown Heights, Prospect Lefferts Gardens |
| BK10 | Bay Ridge, Dyker Heights |
| BK11 | Bath Beach, Gravesend, Bensonhurst |
| BK12 | Borough Park, Kensington, Midwood |
| BK13 | Coney Island, Brighton Beach |
| BK14 | Flatbush, Midwood |
| BK15 | Sheepshead Bay, Manhattan Beach |
| BK16 | Brownsville, Ocean Hill |
| BK17 | East Flatbush |
| BK18 | Canarsie, Flatlands, Marine Park |

### Queens (QN1–QN14)
| Id | Quartier principal |
|----|--------------------|
| QN1 | Astoria, Long Island City |
| QN2 | Sunnyside, Woodside |
| QN3 | Jackson Heights, East Elmhurst |
| QN4 | Elmhurst, Corona |
| QN5 | Maspeth, Middle Village, Ridgewood |
| QN6 | Rego Park, Forest Hills |
| QN7 | Flushing, Whitestone |
| QN8 | Fresh Meadows, Kew Gardens Hills |
| QN9 | Woodhaven, Richmond Hill |
| QN10 | Howard Beach, Ozone Park |
| QN11 | Bayside, Douglaston |
| QN12 | Jamaica, Hollis |
| QN13 | Laurelton, Queens Village |
| QN14 | Rockaways, Broad Channel |

### Staten Island (SI1–SI3)
| Id | Quartier principal |
|----|--------------------|
| SI1 | North Shore (St. George, Port Richmond) |
| SI2 | Mid-Island (New Dorp, Todt Hill) |
| SI3 | South Shore (Tottenville, Great Kills) |

---

## 12 municipalités Hudson County (NJ)

| Id | Municipalité |
|----|--------------|
| HC01 | Bayonne |
| HC02 | East Newark |
| HC03 | Guttenberg |
| HC04 | Harrison |
| HC05 | Hoboken |
| HC06 | Jersey City |
| HC07 | Kearny |
| HC08 | North Bergen |
| HC09 | Secaucus |
| HC10 | Union City |
| HC11 | Weehawken |
| HC12 | West New York |

---

## 3 zones Bergen (agrégées)

Bergen County n'est pas découpé en 70 municipalités ; il est regroupé en 3 zones :

| Id | Zone | Municipalités regroupées | Rôle |
|----|------|---------------------------|------|
| BG01 | Bogota / Nord Bergen | Bogota, Teaneck, Hackensack, Englewood, Englewood Cliffs | Accès GW Bridge, banlieue nord |
| BG02 | Edgewater / Palisades | Fort Lee, Ridgefield, Edgewater, Fairview | GW Bridge, rive Hudson |
| BG03 | Little Ferry / Meadowlands | Little Ferry, Moonachie, Ridgefield Park | Zone industrielle, aéroports |

---

## 15 quartiers de jeu (regroupement)

Les 74 zones sont regroupées en **15 quartiers de jeu**, préservant la mécanique
à 2 niveaux du jeu original (quartier = objectif de contrôle, zone = case jouable).

### NJ (4 quartiers)

| Quartier | Id | Zones | Détail |
|----------|----|-------|--------|
| Bergen | bergen | BG01, BG02, BG03 | ex-Bogota + Little Ferry + Edgewater |
| North Hudson | north_hudson | HC03, HC08, HC10, HC11, HC12 | Guttenberg → West New York |
| Jersey City | jersey_city | HC01, HC05, HC06 | Bayonne, Hoboken, Jersey City |
| Meadowlands | meadowlands | HC02, HC04, HC07, HC09 | arrière-pays industriel |

### Manhattan (4 quartiers)

| Quartier | Id | Zones | Détail |
|----------|----|-------|--------|
| Harlem | harlem | MN10, MN11, MN12 | Central Harlem → Inwood |
| Upper Manhattan | upper_manhattan | MN7, MN8, MN9 | Upper West/East Side, Morningside |
| Midtown | midtown | MN4, MN5, MN6 | Chelsea → Murray Hill |
| Lower Manhattan | lower_manhattan | MN1, MN2, MN3 | Financial District → East Village |

### Bronx (2 quartiers)

| Quartier | Id | Zones | Détail |
|----------|----|-------|--------|
| South Bronx | south_bronx | BX1–BX6 | Mott Haven → East Tremont |
| North Bronx | north_bronx | BX7–BX12 | Kingsbridge → Woodlawn |

### Queens (2 quartiers)

| Quartier | Id | Zones | Détail |
|----------|----|-------|--------|
| West Queens | west_queens | QN1–QN5 | Astoria → Maspeth |
| East Queens | east_queens | QN6–QN14 | Forest Hills → Rockaways |

### Brooklyn (2 quartiers)

| Quartier | Id | Zones | Détail |
|----------|----|-------|--------|
| North Brooklyn | north_brooklyn | BK1–BK6, BK8, BK9, BK16 | Williamsburg → Brownsville |
| South Brooklyn | south_brooklyn | BK7, BK10–BK15, BK17, BK18 | Sunset Park → Canarsie |

### Staten Island (1 quartier)

| Quartier | Id | Zones | Détail |
|----------|----|-------|--------|
| Staten Island | staten_island | SI1, SI2, SI3 | North Shore → South Shore |

### Données de jeu

Voir `data/quartiers-gameplay.json` pour les gangs, points, privilèges et indices P/D/A.

---

## Approche : découpe précise à partir des données géographiques

### Principe

1. **Télécharger** les polygones officiels (GeoJSON)
2. **Fusionner** dans un seul fichier avec nos IDs
3. **Calculer** les adjacences à partir des géométries
4. **Projeter** pour le rendu (SVG ou canvas)

### 1. Sources des géométries

| Zone | Source | Format | URL / accès |
|------|--------|--------|-------------|
| **NYC (59 CD)** | NYC Open Data (DCP) | GeoJSON, Shapefile | [Community Districts](https://data.cityofnewyork.us/City-Government/Community-Districts/yfnk-k7r4) → Export |
| **NYC (alt.)** | ArcGIS REST API | JSON | `services2.arcgis.com/.../nycd/FeatureServer` |
| **NJ (564 munic.)** | NJOGIS Open Data | GeoJSON, Shapefile | [Municipal Boundaries of NJ](https://njogis-newjersey.opendata.arcgis.com/datasets/newjersey::municipal-boundaries-of-nj/about) |
| **NJ (alt.)** | OSM | Overpass API | `boundary=administrative` + `admin_level=8` |

**Convention** : NYC utilise le champ `boro_cd` (3 chiffres) : 1xx=Manhattan, 2xx=Bronx, 3xx=Brooklyn, 4xx=Queens, 5xx=Staten Island. Conserver uniquement les 59 CDs (101–112, 201–212, 301–318, 401–414, 501–503) et exclure les 12 JIAs (parcs, aéroports).

### 2. Pipeline de traitement

```
[NYC GeoJSON] ──┐
                ├──► [Filtrage : 59 CDs uniquement, exclure JIAs]
[NJ GeoJSON]  ──┤
                │
                ├──► [Bergen : union des polygones par zone]
                │    BG01 = Bogota + Teaneck + Hackensack + Englewood + Englewood Cliffs
                │    BG02 = Fort Lee + Ridgefield + Edgewater + Fairview
                │    BG03 = Little Ferry + Moonachie + Ridgefield Park
                │
                ├──► [Assignation IDs : MN1, BX1, HC01, BG01, etc.]
                │
                └──► [GeoJSON unique : 74 features, WGS84]
```

**Filtrage NJ** : Hudson = 12 municipalités (toutes). Bergen = 12 municipalités à regrouper en 3.

### 3. Calcul des adjacences

**Méthode** : deux polygones sont adjacents s'ils partagent une frontière (touchent sans se chevaucher).

- **Outil** : [Turf.js](https://turfjs.org/) — `booleanTouches(geomA, geomB)`
- **Algorithme** : pour chaque paire (i, j), si `turf.booleanTouches(feature[i], feature[j])` alors adjacents
- **Sortie** : liste d'adjacences par `id` (comme dans `quartiers.json`)

**Note** : les polygones peuvent avoir des imperfections (trous, doublons de frontière). Si `booleanTouches` rate des cas, on peut assouplir avec `turf.booleanIntersects` + `!turf.booleanWithin` pour détecter les bordures partagées.

### 4. Projection pour le plateau

- **CRS** : WGS84 (EPSG:4326) pour les données sources
- **Rendu** : projection Web Mercator (EPSG:3857) ou projection équivalente centrée sur NYC
- **Bounding box** : englober NYC + Hudson + Bergen (ex. lon -74.3 à -73.7, lat 40.5 à 40.95)
- **Sortie** : conversion GeoJSON → chemins SVG (via [d3-geo](https://github.com/d3/d3-geo) ou [mapbox-gl](https://github.com/mapbox/mapbox-gl-js))

### 5. Fichiers de sortie attendus

| Fichier | Contenu |
|---------|---------|
| `data/quartiers-osm.geojson` | 74 polygones avec `id`, `nom`, `type` (cd/hc/bg) |
| `data/adjacences-osm.json` | `{ "MN1": ["MN2", "MN4"], "MN2": [...], ... }` |
| `assets/plateau.svg` | Carte SVG avec les 74 zones en `<path>` |

### 6. Réalisation

- **Script** : Node.js ou Python (geopandas, shapely) pour le pipeline
- **Dépendances** : Turf.js (JS) ou Shapely (Python) pour les adjacences
- **Option** : [QGIS](https://qgis.org/) pour le merge manuel si préféré

---

## Références

- NYC Community Districts : [NYC Planning](https://www.nyc.gov/site/planning/planning-level/community-districts.page)
- [NYC Open Data - Community Districts](https://data.cityofnewyork.us/City-Government/Community-Districts/5crt-au7u)
- [NJOGIS - Municipal Boundaries](https://njogis-newjersey.opendata.arcgis.com/datasets/newjersey::municipal-boundaries-of-nj/about)
- Hudson County : [visithudson.org](https://www.visithudson.org/municipalities/)
- [Turf.js - booleanTouches](https://turfjs.org/docs/api/booleanTouches)
- Voir aussi `07-cartographie-adjacences.md` pour les adjacences du design actuel (à migrer)
