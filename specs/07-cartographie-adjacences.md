# 07 -- Cartographie des adjacences

## Source

Adjacences reconstituées à partir de la carte couleur du plateau
(`archives&tests/carte couleur 131108 copie.jpg`) et des PDFs du plateau.

**Convention** : deux blocs sont adjacents s'ils partagent une frontière sur le plateau
(pas seulement un coin). Les adjacences inter-quartiers sont marquées `[inter]`.

## Légende des facilités

- `$` = Annexe Zurich Bank
- `PORT` = Port
- `PEAGE` = Péage / Station de péage
- `NYPD` = Hôtel de Police
- `MAIRIE` = Mairie
- `BANK` = Central Zurich Bank
- `AMB` = Ambassade
- `IMM` = Service de l'Immigration
- `DOUANE` = Office des Douanes
- `CIM` = Cimetière
- `AERO` = Aéroport

---

## Disposition géographique du plateau

```
NORD (haut du plateau)
═══════════════════════════════════════════════════════════

    ┌─────── BOGOTA ──────┐         ┌──────── BRONX ─────────────┐
    │ Hackensack  Teaneck │         │ Kings Br.   Tremont        │
    │ Bogotá    Englewood │         │ High Br.(NYPD)  Morrisania │
    │      Engl. Cliffs   │         │ Yankee St.  Mott Haven     │
    └─────────────────────┘         │             Hunts Point    │
                                    └────────────────────────────┘
    ┌── LITTLE FERRY ──┐  ┌── EDGEWATER ──┐
    │ Ridgefield Park  │  │ Fort Lee(PORT)│
    │ Little Ferry      │  │ Ridgefield    │     ┌──── HARLEM ─────────┐
    │ Moonachie         │  │ Edgewater     │     │ Inwood Hill Pk      │
    └───────────────────┘  │ Fairview      │     │ High Bridge Pk      │
                           └───────────────┘     │ Wash. Heights(NB)   │
                                                 │ W. 155th St         │
    ┌── NORTH BERGEN ──┐                         │ Lennox Av.  E.Harlem│
    │ Union City ($)   │    ┌─ N.BROADWAY ──┐    └─────────────────────┘
    │ Gutenberg(PEAGE) │    │ Riverbank SP  │
    │ Weehawken        │    │ Upper W Side  │   ┌── CENTRAL PARK ─────┐
    └──────────────────┘    │   (PORT)      │   │ NW C.Park  NE C.Park│
                            └───────────────┘   │ Rockefeller  (AMB)  │
                                                │ Timesquare  Up.E.S. │
    ┌── JERSEY CITY ───┐   ┌─ GREENWICH V. ─┐  └─────────────────────┘
    │ Hoboken          │   │ Chelsea        │
    │ Washington Pk    │   │ Greenwich V.($)│   ┌── CHINA TOWN ──────┐
    │ Jersey City      │   │ Soho           │   │ Little Italy       │
    │ Liberty St.Pk    │   │ Tribeca        │   │ East Village       │
    └──────────────────┘   └────────────────┘   │ China Town         │
                                                │ Lower East Side    │
                            ┌── SKYLINE ─────┐  └────────────────────┘
                            │ 5 Points       │
                            │ WTC (MAIRIE)   │
                            │ Financial(BANK)│
                            │ Battery        │
                            └────────────────┘

    ┌────────────── QUEENS ──────────────────┐
    │ LaGuardia(AERO)  Astoria              │
    │ Long Island C.   Corona               │
    │ Jackson Hts($)   Flushing M.          │
    │ Maspeth          Middle Vill.(PEAGE)  │
    └───────────────────────────────────────┘

    ┌────────────── BROOKLYN ────────────────┐  ┌─ CYPRESS HILL ──┐
    │ Green Point(IMM) Bushwick             │  │ Cypress H. Cem. │
    │ Brooklyn Hts     Bedford Stuyv.       │  │ Evergreen Cem.  │
    │ Atlantic Av.($)  Crown Heights        │  │ Lutheran Cem.   │
    │ Red Hook(PORT)   Flatbush             │  └─────────────────┘
    │ Greenwood Cem.   Canarsie(DOUANE)     │
    └───────────────────────────────────────┘

ÎLES :
    Roosevelt Island  (entre Manhattan/Central Park et Queens)
    Ward Island Park  (entre Harlem/East Harlem et Bronx)
    Rickers Island    (entre Bronx/Hunts Point et Queens/LaGuardia)
    Statue of Liberty (sud, entre Battery et Liberty State Park)

SUD (bas du plateau)
═══════════════════════════════════════════════════════════
```

---

## Adjacences par quartier

### BOGOTA (5 blocs, 9 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Bogotá ($) | Hackensack, Teaneck | -- |
| Teaneck (PEAGE) | Bogotá, Hackensack, Englewood | Ridgefield Park [Little Ferry] |
| Hackensack | Bogotá, Teaneck, Englewood | Ridgefield Park [Little Ferry] |
| Englewood | Hackensack, Teaneck, Englewood Cliffs | -- |
| Englewood Cliffs | Englewood | Fort Lee [Edgewater] |

### LITTLE FERRY (3 blocs, 3 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Ridgefield Park | Little Ferry, Moonachie | Hackensack [Bogota], Teaneck [Bogota], Fairview [Edgewater] |
| Little Ferry | Ridgefield Park, Moonachie | -- |
| Moonachie | Ridgefield Park, Little Ferry | Ridgefield [Edgewater] |

### EDGEWATER (4 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Fort Lee (PORT) | Ridgefield | Englewood Cliffs [Bogota], Riverbank State Park [North Broadway] |
| Ridgefield | Fort Lee, Edgewater, Fairview | Moonachie [Little Ferry] |
| Edgewater | Ridgefield, Fairview | Gutenberg [North Bergen] |
| Fairview | Ridgefield, Edgewater | Ridgefield Park [Little Ferry], Union City [North Bergen] |

### NORTH BERGEN (3 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Union City ($) | Gutenberg, Weehawken | Fairview [Edgewater], Upper W Side [North Broadway] |
| Gutenberg (PEAGE) | Union City, Weehawken | Edgewater [Edgewater] |
| Weehawken | Union City, Gutenberg | Hoboken [Jersey City] |

### HARLEM (5 blocs, 9 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Inwood Hill Park | High Bridge Park | Kings Bridge [Bronx] |
| High Bridge Park | Inwood Hill Park, West 155th St | Washington Heights [North Broadway], Tremont [Bronx] |
| West 155th St | High Bridge Park, Lennox Avenue, East Harlem | High Bridge [Bronx], Riverbank State Park [North Broadway] |
| Lennox Avenue ($) | West 155th St, East Harlem | NE Central Park [Central Park] |
| East Harlem | West 155th St, Lennox Avenue | Mott Haven [Bronx], Ward Island Park [Île] |

### BRONX (7 blocs, 12 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Kings Bridge ($) | Tremont, High Bridge | Inwood Hill Park [Harlem] |
| Tremont | Kings Bridge, High Bridge, Morrisania | High Bridge Park [Harlem] |
| High Bridge (NYPD) | Kings Bridge, Tremont, Yankee Stadium | West 155th St [Harlem] |
| Morrisania (PEAGE) | Tremont, Yankee Stadium, Mott Haven | -- |
| Yankee Stadium | High Bridge, Morrisania, Mott Haven | -- |
| Mott Haven | Morrisania, Yankee Stadium, Hunts Point | East Harlem [Harlem] |
| Hunts Point | Mott Haven | Rickers Island [Île] |

### NORTH BROADWAY (3 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Riverbank State Park | Washington Heights, Upper W Side | West 155th St [Harlem], Fort Lee [Edgewater] |
| Washington Heights | Riverbank State Park, Upper W Side | High Bridge Park [Harlem] |
| Upper W Side (PORT) | Washington Heights, Riverbank State Park | Union City [North Bergen], NW Central Park [Central Park], Rockefeller [Central Park] |

### CENTRAL PARK (5 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| NW Central Park | NE Central Park, Rockefeller | Upper W Side [North Broadway] |
| NE Central Park (AMB) | NW Central Park, Upper East Side | Lennox Avenue [Harlem] |
| Rockefeller | NW Central Park, Timesquare, Upper East Side | Upper W Side [North Broadway] |
| Timesquare | Rockefeller, Upper East Side | Chelsea [Greenwich Village] |
| Upper East Side | NE Central Park, Rockefeller, Timesquare | Roosevelt Island [Île] |

### GREENWICH VILLAGE (4 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Chelsea | Greenwich Village, Soho | Timesquare [Central Park] |
| Greenwich Village ($) | Chelsea, Soho, Tribeca | Little Italy [China Town] |
| Soho | Chelsea, Greenwich Village, Tribeca | East Village [China Town] |
| Tribeca | Greenwich Village, Soho | 5 Points [Skyline], Washington Park [Jersey City] |

### CHINA TOWN (4 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Little Italy | East Village, China Town | Greenwich Village [Greenwich Village] |
| East Village | Little Italy, China Town, Lower East Side | Soho [Greenwich Village] |
| China Town | Little Italy, East Village, Lower East Side | 5 Points [Skyline] |
| Lower East Side | East Village, China Town | Green Point [Brooklyn], Long Island City [Queens] |

### SKYLINE (4 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| 5 Points | World Trade Center, Financial District | Tribeca [Greenwich Village], China Town [China Town] |
| World Trade Center (MAIRIE) | 5 Points, Financial District, Battery | -- |
| Financial District (BANK) | 5 Points, World Trade Center, Battery | Brooklyn Heights [Brooklyn] |
| Battery | World Trade Center, Financial District | Red Hook [Brooklyn], Statue of Liberty [Île], Liberty State Park [Jersey City] |

### JERSEY CITY (4 blocs, 6 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Hoboken | Washington Park, Jersey City | Weehawken [North Bergen] |
| Washington Park | Hoboken, Jersey City, Liberty State Park | Tribeca [Greenwich Village] |
| Jersey City | Hoboken, Washington Park, Liberty State Park | -- |
| Liberty State Park | Washington Park, Jersey City | Battery [Skyline], Statue of Liberty [Île] |

### QUEENS (8 blocs, 12 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| LaGuardia (AERO) | Astoria, Flushing Meadows | Rickers Island [Île] |
| Astoria | LaGuardia, Long Island City, Corona | -- |
| Long Island City | Astoria, Jackson Heights, Maspeth | Lower East Side [China Town], Green Point [Brooklyn], Roosevelt Island [Île] |
| Corona | Astoria, Flushing Meadows, Jackson Heights | -- |
| Flushing Meadows | LaGuardia, Corona, Middle Village | -- |
| Jackson Heights ($) | Long Island City, Corona, Maspeth | -- |
| Maspeth | Long Island City, Jackson Heights, Middle Village | Bushwick [Brooklyn] |
| Middle Village (PEAGE) | Flushing Meadows, Maspeth | Cypress Hills Cemetery [Cypress Hill] |

### BROOKLYN (10 blocs, 15 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Green Point (IMM) | Brooklyn Heights, Bushwick, Atlantic Avenue | Lower East Side [China Town], Long Island City [Queens] |
| Brooklyn Heights | Green Point, Atlantic Avenue, Red Hook | Financial District [Skyline] |
| Atlantic Avenue ($) | Green Point, Brooklyn Heights, Crown Heights, Bedford Stuyvesant | -- |
| Red Hook (PORT) | Brooklyn Heights, Flatbush, Greenwood Cemetery | Battery [Skyline] |
| Crown Heights | Atlantic Avenue, Bedford Stuyvesant, Flatbush | -- |
| Bedford Stuyvesant | Atlantic Avenue, Crown Heights, Bushwick | Evergreen Cemetery [Cypress Hill] |
| Bushwick | Green Point, Bedford Stuyvesant | Maspeth [Queens], Cypress Hills Cemetery [Cypress Hill] |
| Flatbush | Red Hook, Crown Heights, Greenwood Cemetery, Canarsie | -- |
| Greenwood Cemetery (CIM) | Red Hook, Flatbush | -- |
| Canarsie (DOUANE) | Flatbush | Lutheran Cemetery [Cypress Hill] |

### CYPRESS HILL (3 blocs, 3 pts)

| Bloc | Adjacences intra-quartier | Adjacences inter-quartier |
|------|---------------------------|---------------------------|
| Cypress Hills Cemetery (CIM) | Evergreen Cemetery | Bushwick [Brooklyn], Middle Village [Queens] |
| Evergreen Cemetery (CIM) | Cypress Hills Cemetery, Lutheran Cemetery | Bedford Stuyvesant [Brooklyn] |
| Lutheran Cemetery (CIM) | Evergreen Cemetery | Canarsie [Brooklyn] |

### ÎLES (4 blocs, 0 pts chacune)

| Île | Adjacences |
|-----|------------|
| Roosevelt Island | Upper East Side [Central Park], Long Island City [Queens] |
| Ward Island Park | East Harlem [Harlem], Mott Haven [Bronx] |
| Rickers Island | Hunts Point [Bronx], LaGuardia [Queens] |
| Statue of Liberty | Battery [Skyline], Liberty State Park [Jersey City] |

---

## Statistiques

- **Total de blocs** : 72 (68 blocs de quartiers + 4 îles)
- **Total d'adjacences uniques** : ~160
- **Blocs les plus connectés** : Long Island City (7), Atlantic Avenue (5), Mott Haven (5)
- **Blocs les moins connectés** : Bogotá (2), Little Ferry (2), Canarsie (2), Hunts Point (2)
- **Quartiers isolés** (peu d'adjacences inter-quartier) : Bogota (2 liens), Little Ferry (3 liens)
- **Quartiers très connectés** : Central Park (5 liens), Brooklyn (5 liens), Queens (4 liens)

## Points d'attention

1. **Traversées d'eau validées** :
   - **Hudson River (NJ ↔ Manhattan)** : seulement 2 liens traversent le fleuve :
     - Fort Lee [Edgewater] ↔ Riverbank State Park [North Broadway] (pont GW Bridge)
     - Union City [North Bergen] ↔ Upper West Side [North Broadway] (tunnel Lincoln)
   - **Lien le plus au sud NJ ↔ Manhattan** : Liberty State Park ↔ Battery (pas de lien intermédiaire)
   - **East River (Manhattan ↔ Queens/Brooklyn)** :
     - Upper East Side ↔ Roosevelt Island ↔ Long Island City (pont/île)
     - Lower East Side ↔ Green Point [Brooklyn] (pont Williamsburg)
     - Lower East Side ↔ Long Island City [Queens] (pont Manhattan)
     - Financial District ↔ Brooklyn Heights (pont Brooklyn)
     - Battery ↔ Red Hook
2. **Les îles** ont exactement 2 adjacences chacune, ce qui en fait des points de passage stratégiques pour la traversée des gitans.
3. **Le Bronx** n'est relié à Manhattan que par 4 liens (via Harlem), ce qui en fait un quartier relativement isolé.
4. **Manhattan** (Harlem + North Broadway + Central Park + Greenwich Village + China Town + Skyline) forme un continuum très connecté.
5. **NJ est relativement isolé de Manhattan** : seulement 2 points de passage via North Broadway, plus le lien Battery ↔ Liberty State Park au sud. Cela rend les quartiers NJ stratégiquement défensifs mais difficiles à étendre vers Manhattan.
