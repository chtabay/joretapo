# 09 -- État des lieux du projet

> **Date de l'audit** : 23 août 2026
> **Périmètre** : `index.html`, les 14 modules de `js/`, les 8 fichiers de `data/`, `assets/`, `tools/`, `specs/`
> **Méthode** : 8 audits parallèles (architecture, moteurs principaux, moteurs secondaires, données,
> UI/UX, specs vs code, dette technique, chasse aux bugs) produisant 167 constats bruts, puis une
> passe de vérification adversariale fichier par fichier — chaque constat devant être confirmé par
> lecture du code réel. **118 confirmés, 48 réfutés ou fusionnés.**
> Ce document décrit l'état du dépôt à la date ci-dessus ; il n'a pas vocation à être maintenu à jour.

---


## 1. Vue d'ensemble

Joretapo est un jeu de plateau numérique hotseat (tablette), en HTML/CSS/JS vanilla sans backend, déployé sur GitHub Pages. Le code est réel et étendu : **14 modules ES6, 6 862 lignes** (dont `js/app.js` 3 079 lignes = 45 %), un `index.html` de 917 lignes dont 683 de CSS inline, **74 zones / 15 quartiers / 145 adjacences**, un deck de **65 cartes Magouille** (31 types + 5 cartes « culture » jamais distribuées), **39 illustrations pour 10 Mo** et **31 Mo d'arbre de travail** (dont 3,0 Mo de GeoJSON et 1,9 Mo de SVG jamais chargés). L'ensemble a été livré en 42 commits sur 2 jours calendaires (2026-03-15/16).

La maturité réelle est celle d'un **prototype complet mais non durci** : la boucle de jeu tourne de bout en bout (5 phases, élections tous les 7 tours, draft de cartes, contrats, coupole, cambriolages), l'architecture modulaire est saine, mais aucun test, aucun linter, aucune CI n'existe, et l'audit ligne à ligne a confirmé **118 problèmes**, dont un softlock certain de la pioche de cartes et une quinzaine de règles documentées qui n'ont aucun effet mécanique.

---

## 2. Ce qui est en place

### Fonctionnalités livrées

- **Boucle de tour complète** : automate à 13 états (`js/turn-manager.js:1-15`) couvrant CURTAIN → ORDERS_SUPPLY → REVEAL_HARVEST → NEGOTIATION → CURTAIN → ORDERS_MOVE → REVEAL_RESOLVE → TURN_END, plus la branche élection/draft tous les 7 tours (`js/turn-manager.js:112`).
- **7 types d'ordres** produits par l'UI : approvisionner, recruter, construire, deplacer, creer_pion, deployer_flic, eliminer_flic. Budget de 5 ordres + bonus, mutualisé entre phases 1 et 4 (`js/turn-manager.js:241-245`), ordre de saisie hotseat randomisé (`js/turn-manager.js:69-74`).
- **Résolution de conflits** type Diplomacy simplifié : supports automatiques, coupure de support, égalité → statu quo, fuite, élimination payante (`js/conflict-resolver.js`).
- **Économie** : approvisionnement plafonné par point, bonus des 3 administrations, 5 constructions, revenus par pion et par bâtiment, blocage par flic (`js/revenue-engine.js`).
- **Élections** : poids électoral par population, barème de points conforme, seuil de victoire 55 (`js/game-state.js:194-234`).
- **8 pouvoirs de maire** (`js/mayor-engine.js:1-10`), **15 gangs de quartier** (`js/special-entities.js:158-330`), **4 cambriolages** complets (`js/heist-engine.js`), **7 types de contrats** dont 3 auto-exécutés + Coupole (`js/contract-engine.js`).
- **Dictionnaire en jeu** de 17 entrées avec index et navigation (`js/dictionary.js:5-278`).
- **Setup en 3 écrans** : config joueurs → draft de quartiers tour par tour parmi 11 → confirmation (`js/setup.js`, 218 lignes).
- **Partage** : sauvegarde compressée dans l'URL (pako → LZString → base64), QR code, lien WhatsApp, presse-papiers (`js/save-export.js`).
- **Couche mobile** : bottom nav 4 onglets, deux bottom sheets à 3 crans avec drag, tutoriel contextuel, cibles tactiles 44-48 px, `safe-area-inset`, `100dvh`.

### Architecture réelle

- Point d'entrée unique : `<script type="module" src="js/app.js">` (`index.html:915`). Graphe d'imports en étoile, sans cycle ; `js/app.js:1-13` importe les 13 autres modules, seuls `conflict-resolver.js:1` et `setup.js:1-2` ont des imports secondaires.
- **Une seule variable globale** : `window._selectZone` (`js/app.js:3053`), utilisée par 3 handlers inline générés.
- **Séparation logique/UI effective** : les 7 moteurs de règles (revenue, conflict, mayor, magouille, heist, contract, special-entities) ne référencent ni `document` ni `window` — ils sont exécutables en Node tels quels. Seuls `app.js` (179 accès DOM), `map-renderer.js` (14), `save-export.js` (11) et `dictionary.js` (3) touchent le DOM.
- **Convention de retour homogène** dans tous les moteurs : `{ok, msg, reason}` et logs `{pid, type, msg}` consommés par un rendu partagé (`js/app.js:2029`).
- La carte n'utilise **pas** les SVG livrés : `MapRenderer._buildSvg()` (`js/map-renderer.js:109-177`) reconstruit 74 `<path>` à l'exécution depuis `data/quartiers-osm.geojson`, avec pan/pinch/wheel maison.

### Volumétrie

| Élément | Chiffre |
|---|---|
| Modules JS / lignes | 14 / 6 862 (app.js 3 079, map-renderer 524, conflict-resolver 417, special-entities 375, revenue-engine 372, magouille-engine 330, dictionary 287, heist-engine 271, turn-manager 251, game-state 237, setup 218, save-export 186, contract-engine 180, mayor-engine 135) |
| `index.html` | 917 lignes / 70 737 o, dont CSS inline 683 lignes / 59 441 o (84 %) |
| Fichiers `data/` | 8 présents, **4 chargés** (`js/app.js:25-28`) |
| GeoJSON | 3 062 545 o, 74 features, 81 932 points |
| Cartes | 31 types + 5 culture, 65 exemplaires, 39 fichiers image / 10 Mo |
| Specs | 9 markdown, 2 336 lignes |
| Tests / lint / CI | 0 / 0 / 0 |

---

## 3. État par domaine

| Domaine | État | Commentaire |
|---|---|---|
| Architecture & code | **Correct** | Vrais modules ES6, graphe sans cycle, moteurs purs testables ; mais `app.js` concentre 45 % du code, 90 fonctions racine, 7 globals de module, 0 export. |
| Moteurs de jeu (règles) | **Fragile** | Économie et élections fidèles aux specs ; conflits amputés de 3 règles (cascade, support inter-joueurs, échange) avec 2 défauts de séquencement ; 22 cartes sur 65 et 8 gangs sur 15 sans effet mécanique. |
| Données & cartographie | **Correct** | Intégrité référentielle parfaite entre les 4 fichiers actifs (74 IDs identiques, 145 paires symétriques) ; mais 4 fichiers `data/` jamais chargés avec valeurs dupliquées en dur, QN14 isolée, 5 images cassées. |
| Rendu carte & perf | **Fragile** | Rendu SVG structuré et pinch correct, mais 3 Mo de GeoJSON non simplifié au démarrage sans indicateur, zoom/pan sans aucune borne ni bouton de recentrage. |
| UI/UX mobile | **Fragile** | Refonte mobile réelle et soignée, mais drag de sheet qui meurt au premier ordre, pas d'écouteur `resize`, z-index en nombres magiques, accessibilité nulle (0 `aria-*`, 0 `keydown`). |
| Persistance & partage | **Fragile** | Un seul slot, aucun `try/catch`, aucun contrôle de version, état du TurnManager non sérialisé, URL de partage inutilisable après le tour 7 (19 837 caractères). |
| Documentation | **Fragile** | Volumineuse et globalement juste sur la carto et l'automate, mais README racine avec 2 liens morts, specs/04 décrochée sur ≥ 7 points, contradictions 7/10 tours, roadmap fausse dans les deux sens. |
| Outillage & tests | **Absent** | Pas de `package.json` racine, pas de test, pas de linter/formatter, pas de `.github/`, `tools/package.json` a un script `test` bidon (`tools/package.json:6`). |

---

## 4. Points forts

1. **Modularité ES6 réellement respectée** — 13 modules métier de 135 à 524 lignes, un seul point d'entrée, un seul `window.*` (`js/app.js:3053`), aucune dépendance circulaire. Sur ~40 symboles exportés, 3 seulement ne sont importés nulle part.
2. **Moteurs de règles purs et testables en l'état** — aucun des 7 moteurs ne touche le DOM ; un premier harnais de tests ne demanderait aucun refactoring préalable.
3. **Automate de tour centralisé et propre** — 13 constantes de phase, toutes les transitions passant par `_emit()` (`js/turn-manager.js:247-250`), un unique callback vers un `switch` de dispatch (`js/app.js:542`). C'est le point le plus solide du code.
4. **Intégrité des données cartographiques** — les 74 IDs de zone sont strictement identiques dans les 4 sources actives, le graphe d'adjacence a 290 arêtes / 145 paires avec 0 asymétrie, 0 auto-référence, 0 référence orpheline ; les 74 features GeoJSON ont toutes id, nom et anneaux fermés.
5. **Fidélité des tableaux d'équilibrage aux specs** — plafonds d'approvisionnement (`js/revenue-engine.js:1-7` vs specs/01:91-96), coûts et répartition des 5 constructions (`js/revenue-engine.js:11-17` vs specs/01:147-153), coûts d'élimination (`js/conflict-resolver.js:6-9`), barème de victoire (`js/game-state.js:194-234`) : vérifiés ligne à ligne, tous conformes.
6. **`save-export.js` est le seul module réellement défensif** — triple repli pako → LZString → base64 (`js/save-export.js:55-63`), double repli QR local → API distante, `copyToClipboard` avec fallback textarea, chaîne compaction/expansion bijective vérifiée par simulation.
7. **Hygiène de code inhabituelle** — 0 TODO/FIXME/HACK/XXX sur 6 862 lignes, 2 `console.*` en production, aucun `eval`, aucun secret, optional chaining systématique sur les accès DOM, `.gitignore` documenté par sections.
8. **`HeistEngine` est le moteur le mieux écrit** — `executeHeist` re-valide intégralement les prérequis avant d'appliquer (`js/heist-engine.js:187-190`), `getProgress` expose un avancement prérequis par prérequis sans dupliquer les règles, et les suppressions de pions itèrent à l'envers (`js/heist-engine.js:229-234`).

---

## 5. Problèmes confirmés

### Bloquants

- **Softlock de l'écran de draft par pénurie de deck** — `js/magouille-engine.js:49` / `js/app.js:2251` — `draftPhase` distribue 8 cartes à chaque joueur sur un deck de 65 exemplaires, `keepCards` en sort 4 définitivement du circuit à chaque élection (`js/magouille-engine.js:55-61`), `drawCards` sort par `break` quand pile et défausse sont vides (`js/magouille-engine.js:39`), et le bouton de validation est conditionné à `selected.size !== 4` sur un overlay `#election-ov` sans bouton fermer ni handler Escape (`index.html:835-839`). *Impact :* à 6 joueurs le blocage tombe dès l'élection 2 (tour 14), à 5 joueurs au tour 21, à 4 joueurs au tour 28 ; la partie est figée en séance, récupérable seulement par F5 — qui reconstruit un deck complet mais rejoue le tour depuis la phase 1 et duplique les uid.

### Majeurs

**Persistance et reprise**

- **Reprendre une sauvegarde rembobine le tour et perd les ordres secrets** — `js/app.js:526` / `js/turn-manager.js:247` — `startTurnLoop` appelle toujours `startTurn()` qui force `gs.phase = 1` et vide les ordres ; `resumePhase()` (`js/turn-manager.js:61-67`) n'a aucun appelant, et tout l'état de tour (supplyOrders, moveOrders, ordersUsedP1, playerQueue, votes, draftHands) vit hors du GameState sérialisé. *Impact :* un rechargement en phase 4 renvoie en phase 1 avec les ressources déjà dépensées et 5 ordres offerts (`ordersUsedP1` remis à 0).
- **L'index des cartes est sérialisé dans chaque sauvegarde et dans l'URL** — `js/game-state.js:151-157` — `serialize()` copie `Object.keys(this)`, donc `_cartes_index` (71 910 o, 65 définitions avec `texte_original`) posé par `initDeck`. Mesuré : sauvegarde 10 129 → 83 242 o, payload d'URL 1 366 → ~19 584 caractères. *Impact :* après le tour 7, le QR déborde la limite de 2 953 o, le repli `api.qrserver.com` reçoit une URL de 20 Ko, et le partage WhatsApp devient inutilisable ; 83 Ko resérialisés à chaque transition de phase.
- **Ouvrir un lien de partage écrase la sauvegarde locale sans confirmation** — `js/app.js:3065-3070` — `parseRestoreFromHash()` est évalué avant tout affichage, suivi d'un `Object.assign` puis d'un `gameState.save()` immédiat sur l'unique slot `joretapo-save-0` (`js/game-state.js:6, 161`). *Impact :* deux groupes sur la même tablette, la partie du premier est irrécupérablement détruite.

**Cartes Magouille**

- **9 effets sur 28 ne sont pas implémentés et sont avalés silencieusement** — `js/magouille-engine.js:303` — la branche `default` renvoie `{ok:true, msg:'<nom> jouée'}` pour annuler_accusation_triche, annuler_carte_triche, annuler_magouille, bloquer_quartier, bonus_electeurs_cimetiere, detruire_gangs, expulser_quartier, tuer_en_fuite, voler_cargaison, soit **15 exemplaires (23 % du deck)**. *Impact :* le coût est débité, la carte défaussée, un message de succès affiché, rien ne se passe.
- **Trois effets « implémentés » n'écrivent qu'un drapeau que personne ne relit** — `js/magouille-engine.js:191, 266, 271` — `_verges_actif`, `_ineligible`, `_igor_actif` ne sont lus par aucun moteur, uniquement purgés par `processEndOfMandate` (`js/special-entities.js:350-359`). Un joueur rendu inéligible reste candidat et peut être élu maire ; pire, le drapeau est effacé par `processEndOfMandate` appelé au tout début de `_beginElection` (`js/turn-manager.js:121`). *Impact :* **22 cartes sur 65 (34 %) sont sans conséquence mécanique.**
- **Le champ `conditions` n'est jamais évalué** — `js/magouille-engine.js:72-90` — `canPlay` ne teste que la présence en main, `phase_jouable` et le coût ; 16 des 18 conditions déclarées (possede_bordel, est_maire, majorite_quartier, conflit_en_cours…) sont ignorées alors qu'elles sont affichées au joueur (`js/app.js:2315`). *Impact :* n'importe quelle carte est jouable par n'importe qui.
- **Racket des restaurants : les lingots prélevés sont détruits** — `js/magouille-engine.js:204-205` — le second `Math.min` est réévalué après la déduction. *Impact :* victime à 40 L, taxe 30 → elle perd 30 L, l'attaquant en reçoit 10 ; victime à 20 L → elle est vidée, l'attaquant reçoit 0 et le toast annonce « 0 L rackettés ».
- **`contaminer_prostituees` balaie tout le plateau** — `js/magouille-engine.js:295` — la condition d'expansion teste `removed.length > 0`, cumul global du parcours, au lieu du résultat de la zone courante. *Impact :* si la zone ciblée contient au moins une prostituée, les 73 zones connexes sont visitées et **toutes** les prostituées de la partie sont supprimées, y compris celles du lanceur (le filtre `js/magouille-engine.js:288-294` ne teste pas `p.joueur`).
- **Une carte est payée et consommée même quand son effet échoue** — `js/magouille-engine.js:101-116` — coût débité, carte retirée de la main et défaussée avant que `_applyEffect` ne soit appelé ; le `ok:false` n'est jamais testé. *Impact :* `detournement_fonds` (140 L) joué sans être maire coûte 140 L et la carte pour un toast d'erreur.
- **Le deck réel contient 65 cartes, pas les 75 annoncées** — `js/magouille-engine.js:5` — `buildDeck` n'itère que sur `cartesDef.types` ; les 5 cartes `culture` sont totalement inertes (le mot « culture » n'apparaît nulle part dans `js/`). *Impact :* la décision de game design de specs/06:14 (« ~10 cartes sans effet pour diluer le deck ») repose sur une dilution qui n'existe pas.

**Résolution de conflits**

- **La capture des prostituées ne peut jamais se déclencher** — `js/conflict-resolver.js:272, 291` — les fuites sont exécutées à l'étape 4 (`:105-107`) et les mouvements gagnants à l'étape 6 (`:117-119`) : au moment de la fuite le vainqueur n'est pas sur la case et le défenseur vient d'en être retiré, donc `find(IS_ARMED)` renvoie toujours `undefined`. *Impact :* règle spec 01:130 jamais appliquée, et `_updateOwnership` voyant deux propriétaires laisse la zone au perdant.
- **La fuite peut empiler deux pions armés alliés** — `js/conflict-resolver.js:249` — le filtre n'exclut que les pions armés **ennemis**, et ne teste ni incorruptible, ni camp de gitans, ni zone contestée. *Impact :* viole spec 01:126/128 et casse tous les `find(IS_ARMED)` en aval (détection du défenseur `:75`, blocage de création `:334`).
- **Conflits en cascade non implémentés** — `js/conflict-resolver.js:260` — `freeZones[0]` est choisi sans consulter les destinations du tour ni relancer `_resolveConflict` (appelé une seule fois, `:99`, non récursif). *Impact :* un fugitif et un mouvement simple peuvent atterrir sur la même case sans résolution ; spec 01:193-195 absente.
- **Une prostituée peut attaquer et chasser un pion armé** — `js/conflict-resolver.js:75-77, 136` — ni la classification ni le calcul de force ne filtrent le type de l'attaquant, et `showMoveModal` liste tous les pions du joueur (`js/app.js:978-982`). *Impact :* une prostituée soutenue par 2 dealers gagne 3 contre 1 et peut payer 160 L + 6 armes pour éliminer le trafiquant adverse.

**Autres règles**

- **Le bordel peut être construit n'importe où et ne prend pas possession de son triangle** — `js/revenue-engine.js:186-190` — `canBuild` valide un triangle mais `_buildConstruction` pose la construction sur `order.zone` sans vérifier l'appartenance, et ne prend qu'une zone. *Impact :* triangle à Brooklyn, bordel à Bergen, revenu réseau encaissé à distance ; contredit specs/06:52-53.
- **Placement initial : deux pions armés sur la même case** — `js/game-state.js:124-126` — la zone de repli n'est pas revérifiée par `hasArmed` avant le push. *Impact :* le quartier **harlem** produit MN10 = [trafiquant, dealer] et MN11 = [trafiquant, dealer] dès le tour 1 ; corollaire, north_hudson/south_bronx/north_bronx/north_brooklyn/south_brooklyn laissent 2 à 6 zones vides.
- **Deux des huit pouvoirs du maire sont inaccessibles** — `js/mayor-engine.js:2-3` — `incorruptible` et `exproprier` sont `phase: 5`, or le bouton n'est rendu que dans le panneau d'ordres des phases 1 et 4 (`js/app.js:625`, `js/app.js:552-553`). *Impact :* `_incorruptible`, `_exproprier` et leurs modales sont du code mort ; **aucun incorruptible ne peut jamais apparaître sur le plateau**, ce qui rend mortes aussi l'élimination à 700 L et la carte `deplacer_incorruptible`.
- **La coupure d'électricité du maire n'est jamais rétablie** — `js/mayor-engine.js:80` — l'entrée poussée n'a pas de champ `source`, or `processEndOfMandate` ne rétablit que `c.source === 'carte'` (`js/special-entities.js:337`). *Impact :* East Queens (9 zones, 15 pts) coupé au tour 3 reste stérile pour toute la partie ; ce pouvoir est `phase: 1`, donc réellement atteignable.
- **Le pouvoir « déplacer les gitans » ne déplace pas les gitans** — `js/mayor-engine.js:126-132` — seuls le drapeau `z.gitans` et `gs.gitans.positions` bougent ; les pions `{type:'gitan'}` restent sur les îles (`js/game-state.js:145`) et les points d'achat sont reconstruits depuis `gameplay.iles` (`js/revenue-engine.js:27-29`). *Impact :* la nouvelle zone affiche « Camp de gitans » sans rien vendre, les îles continuent de vendre des armes illimitées à 24 L ; même défaut dupliqué dans `js/magouille-engine.js:253-260`.
- **Les gitans n'ont quasiment aucun effet mécanique** — `js/special-entities.js:13-42` — `canTraverseGitans`, `payTraversalCost`, `canBuildOnZone`, `getGitanArmesPrice` n'ont aucun appelant, et l'état gitan existe sous 4 représentations désynchronisées. *Impact :* coût de traversée, blocage de construction et prix majoré ne s'appliquent jamais.
- **Six familles de marqueurs sont écrites puis purgées sans jamais être lues** — `js/special-entities.js:221-260` — `_blocages`, `_restrictions_ethniques`, `_immunite_ethnie`, plus les 3 drapeaux de cartes. *Impact :* **8 gangs sur 15** (Cartel de Bogota, Mafia Créole, Syndicat des Dockers, Lobby des Taxis, Bolito, Triades, KKK, St James Boys) affichent un toast de succès sans aucun effet ; `maxOrdersForPhase` (`js/turn-manager.js:241-245`) et `processSupplyOrders` ignorent totalement `_blocages`.
- **Comptage des flics adverses faussé par un index de tableau filtré** — `js/heist-engine.js:152` (dupliqué `:90`) — `filter((_, i) => i !== pid).map((_, i) => ...)` compte les joueurs 0..n-2, donc le cambrioleur lui-même sauf s'il est le dernier. *Impact :* le cambriolage de l'Hôtel de Police est refusé ou accordé à tort, et la barre de progression affiche un pourcentage faux.
- **L'événement `refresh-orders` n'a aucun écouteur** — `js/app.js:405-411` — le popup de zone dispatche un `Event('refresh-orders')` que personne n'écoute ; le vrai `refresh()` est une closure locale de `renderOrderPanel`. Le contrôle de budget est purement visuel (`js/app.js:612-619`) et `submitOrders` (`js/turn-manager.js:75-90`) accepte le tableau sans vérifier `maxOrdersForPhase`. *Impact :* les ordres passés depuis la carte n'apparaissent jamais dans la liste, et un joueur peut soumettre 12 ordres au lieu de 5.
- **Régression du z-index de la fiche carte Magouille** — `index.html:488` — `#magouille-detail-ov` n'a plus aucune règle propre depuis le commit 97b3c10 (les commits 80511e2, 393309a, e44ce9e l'avaient corrigée trois fois) ; il hérite de `.overlay { z-index: 100 }` alors que `#order-modal` reste ouvert à z-index 200 avec `background: rgba(0,0,0,0.7)`. *Impact :* depuis « Jouer une carte », la fiche se dessine sous le voile noir et ses boutons sont inatteignables ; le chemin depuis le draft n'est pas affecté.

**Données**

- **QN14 (Rockaways) est isolée du graphe** — `data/adjacences-osm.json:101` (`"QN14": []`) — seule des 74 zones sans aucune adjacence, hors de la composante connexe (73/74). *Impact :* `getQuartierOwner` (`js/game-state.js:188-192`) exigeant l'unanimité des 9 zones, **les 15 points d'east_queens — le quartier le mieux coté — sont hors d'atteinte**, sauf tirage d'une des 3 cartes `carte_orange` (téléportation sans contrôle d'adjacence). `upper_manhattan` est également non contigu (MN8 n'a que des voisins hors quartier), sans conséquence bloquante.

### Moyens

**Code et robustesse**

- **`app.js` mélange 8 responsabilités** — `js/app.js:1` — 3 079 lignes, 90 fonctions racine, 0 export, 7 variables mutables de module (`js/app.js:15-21`) partagées par toutes. *Impact :* rien n'est testable ni isolable ; un découpage ultérieur devra démêler ces globals.
- **Aucune gestion d'erreurs sur le chargement et la persistance** — `js/app.js:23-42`, `js/game-state.js:162, 170` — 4 `fetch().then(r=>r.json())` sans `try/catch` ni test de `r.ok`, `localStorage.setItem` et `JSON.parse` nus, alors que le drapeau tutoriel est lui bien protégé (`js/app.js:498`). *Impact :* un 404 donne un écran figé sans message ; un stockage bloqué (Safari privé) fait avorter la transition de phase depuis `_emit()`.
- **Aucun contrôle de version ni migration** — `js/game-state.js:172` — `GameState.VERSION = '2.0'` est écrit mais jamais relu ; `load()` et `parseRestoreFromHash` font un `Object.assign` brut sur une instance sans constructeur. *Impact :* un lien de partage ancien ou un schéma modifié produit un état partiel et un `TypeError` tardif.
- **Duplication massive de vues** — 3 familles de modales écrites 3 fois (joueur cible `js/app.js:1263/1491/2447`, zone `:1328/1517/2508`, quartier `:1279/1504/2481`), 4 toasts au corps identique (`:1255, 2000, 2008, 2520`), HUD joueur dupliqué desktop/mobile (`:189` vs `:295`), seuil 55 en dur à `:1775` et `:2724`. *Impact :* la divergence est déjà là — `QUARTIER_COLORS` est correct à `:3044` et cassé à `:303`.
- **Aucun test, aucun linter, aucune CI** — `tools/package.json:6` — 6 862 lignes de règles interdépendantes validables uniquement par une partie hotseat manuelle complète.
- **`pions.json`, `constructions.json`, `institutions.json`, `quartiers.json` ne sont jamais chargés** — `js/app.js:25-28` — leurs valeurs sont recopiées en dur dans `js/revenue-engine.js:7-17`, `js/conflict-resolver.js:6-9, 347`, `js/special-entities.js:11, 41, 95`. *Impact :* éditer `data/constructions.json` pour l'équilibrage n'a aucun effet ; les valeurs concordent aujourd'hui, la dérive est à venir.
- **XSS et casse d'affichage via noms de joueurs non échappés** — `js/app.js:189` (ligne de 505 caractères), `js/setup.js:50` — aucune fonction d'échappement dans le dépôt, 178 interpolations de `.nom` et 55 de `.couleur` en `innerHTML`, alimentables depuis le fragment `#restore=` sans validation (`js/save-export.js:88`). *Impact :* dégât réaliste = un nom contenant `<`, `&` ou `"` casse HUD, draft et modales ; l'exécution de script suppose l'ouverture d'un lien forgé sur une origine ne contenant qu'une sauvegarde de partie.
- **3 scripts CDN sans SRI ni repli local** — `index.html:912-914` — pako, lz-string, qrcodejs. *Impact :* hors-ligne ou CDN bloqué, un lien `z1…` échoue dans `importFromUrl` (`js/save-export.js:71-90`), le `catch` renvoie `null` et `js/app.js:3072` affiche l'écran-titre sans le moindre message ; le repli QR envoie l'état complet de la partie à `api.qrserver.com` (`js/save-export.js:131`).

**Règles**

- **La victoire n'est pas vérifiée après l'élection** — `js/app.js:2189` — `checkVictory` n'est appelé qu'en fin de phase 2 (`:1816`) et de phase 5 (`:2023`) ; `applyElectionResult` enchaîne sur le draft. *Impact :* un joueur à 42 points élu maire (+15) ne gagne qu'à la fin de la phase 2 du tour suivant.
- **Égalité électorale : l'ancien maire garde ses 15 points et ses privilèges** — `js/turn-manager.js:192-201` — `est_maire = false` est posé inconditionnellement mais `gs.maire` n'est réinitialisé que si `winnerId !== null`. *Impact :* maire fantôme encaissant +15 pts (`js/game-state.js:209`) et gardant `canUse` vrai (`js/mayor-engine.js:15`), pendant que le HUD affiche « Aucun maire en poste ».
- **Double comptage des revenus du bordel** — `js/revenue-engine.js:262-276` — le bonus réseau s'ajoute aux revenus déjà versés par la boucle des pions (`:227-232`). *Impact :* 3 zones p=5 rapportent 90 L/tour au lieu de 45 ; investissement de 440 L amorti deux fois plus vite.
- **Constructions autorisées sur les cimetières** — `js/revenue-engine.js:171` — ni `canBuild` ni `_buildConstruction` ne testent la facilité ; `SpecialEntities.canBuildOnZone` n'a aucun appelant. *Impact :* casino à 60 L/tour sur l'une des 4 zones `cimetiere`, contredit specs/01:155.
- **Un flic ne bloque pas les revenus des constructions** — `js/revenue-engine.js:258` — `flicBlocked` n'est consulté que dans la boucle des pions. *Impact :* le tripot continue de rapporter sous un flic, ce qui vide de son sens l'exception explicite accordée au casino (specs/01:153).
- **Le bonus des administrations est prélevé sur le stock commun** — `js/revenue-engine.js:68, 84` — plafond = `pool + bonus`, déduction sur `pool`. *Impact :* un joueur avec les 3 administrations commandant 40 armes sur un port à 10 fait passer le pool à −30 ; tous les joueurs suivants du tour voient « commande refusée ».
- **Élimination temporaire (300 L) et définitive (550 L) ont le même effet** — `js/conflict-resolver.js:391-400` — même `splice`, plafonds recalculés depuis le plateau, `gs.flics.reserves/elimines` jamais mis à jour. *Impact :* les 250 L supplémentaires n'achètent rien ; le flic peut être redéployé pour 180 L.
- **Un défenseur qui quitte la case la défend quand même** — `js/conflict-resolver.js:75` — `enemyArmed` ne consulte pas `movedKeys`, alors que le calcul des supports le fait (`:149`). *Impact :* égalité et statu quo alors que la case va être libérée ; l'attaquant est bloqué pour rien.
- **Un joueur qui envoie deux pions sur la même case en perd un silencieusement** — `js/conflict-resolver.js:206` — seul `winnerMoves[0]` est retenu, les suivants ne sont ni exécutés, ni annulés, ni journalisés. *Impact :* ordre consommé sans effet ni message.
- **Support inter-joueurs et échange de positions absents** — `js/conflict-resolver.js:156, 81-84` — la force n'est incrémentée que pour le propriétaire du supporter, aucun ordre `soutenir` n'existe, et deux pions d'un même joueur ne peuvent pas permuter. *Impact :* specs/01:178 et 01:182 non implémentées ; une alliance de phase 3 ne se traduit par aucune force cumulée.
- **Les flics sont proposés comme pions déplaçables** — `js/app.js:978-982` — aucun filtre de type dans la modale ni dans `ConflictResolver.resolve` (`:51`). *Impact :* repositionnement gratuit des flics à raison d'un ordre, court-circuitant le pouvoir de maire dédié et tout coût.
- **Le champ `duree` des cartes est totalement ignoré** — `js/magouille-engine.js:119` — `_applyEffect` ne lit jamais `card.duree` ; la coupure d'électricité annoncée « 3 tours » n'est évaluée qu'à la fin du mandat (`js/special-entities.js:336-347`), soit 6 à 8 tours réels ; « Patrick Sébastien » change l'ethnie de façon définitive ; `processEndOfMandate` remet `actions_bonus = 0` en effaçant aussi le bonus permanent du gang Les Nets (`js/special-entities.js:354-356`).
- **Cambriolage de labo : coût divisé par 2 mais prérequis au tarif plein** — `js/heist-engine.js:176-177` vs `:254-255` — `canHeist` exige 20 armes et 2 cartes sans connaître la coupure. *Impact :* un joueur avec 12 armes et l'électricité coupée est refusé ; il doit accumuler 20 armes pour n'en dépenser que 10.
- **Les cambriolages détruisent des cartes hors du circuit du deck** — `js/heist-engine.js:236, 257` — `splice(0, n)` sans choix du joueur et sans passer par `defaussees`/`retirees_du_jeu`. *Impact :* aggrave directement la pénurie de deck (57 des 65 exemplaires sont recyclables).
- **Le bonus de cartes de départ est supprimé avant d'avoir servi** — `js/game-state.js:95` puis `:136` — `cartes_magouille_bonus` est écrit puis `delete` dans le même appel à `GameState.create`. *Impact :* north_hudson et jersey_city (`cartes_magouille_bonus: 1`) ne reçoivent jamais leur carte, sans aucun signal.
- **Suppression multiple par index périmé dans l'effet de gang « éliminer 3 pions »** — `js/special-entities.js:175-181` — index capturés avant les `splice` successifs. *Impact :* deux cibles dans la même zone → mauvais pion ennemi détruit ou action ignorée, compteur affiché faux.
- **Traversée du camp de gitans jamais implémentée** — `js/special-entities.js:13-32` — aucun appelant, aucun type d'ordre correspondant, et `js/revenue-engine.js:307` interdit tout déplacement non adjacent. *Impact :* le « seul moyen de se déplacer de 2 cases » (specs/01:141, specs/06:64-78) n'existe pas, alors que specs/05:147 le coche comme fait.
- **La carte de phase 5 est structurellement injouable** — `js/app.js:629` — le bouton « Jouer une carte » n'existe qu'en phases 1 et 4. *Impact :* « L'Opportuniste » (1 exemplaire) ne peut jamais être jouée ; gaspille un choix de draft.

**UI et performance**

- **Le drag des bottom sheets meurt au premier ordre ajouté** — `js/app.js:702-704` — le WeakSet indexe le panneau, les listeners sont posés sur le handle que `refresh()` détruit en réécrivant `panel.innerHTML` (`:593-594`). *Impact :* le panneau reste bloqué à 50vh en masquant la moitié de la carte pendant la sélection de zones.
- **Aucun écouteur `resize`/`orientationchange`** — `js/app.js:48` — `showScreen` pose un `display:none` inline sur `#mobile-nav` et ne le lève que si `isMobile()` est vrai à l'instant de l'appel. *Impact :* tablette démarrée en paysage puis passée en portrait → HUD masqué par la media query et nav masquée par l'inline : plus aucun accès aux ordres.
- **Zoom et pan sans aucune borne ni recentrage** — `js/map-renderer.js:196-199, 237-238, 260-261, 280-281` — aucun `Math.min/max` dans les 524 lignes, aucune méthode `resetView`, aucun bouton de zoom. *Impact :* un pinch trop large rend la carte invisible ; le seul recours est le rechargement, qui perd `pendingOrders` (`js/app.js:20`, non persisté).
- **Sur desktop, impossible de paner depuis une zone** — `js/map-renderer.js:249` — `pointerdown` sort si la cible porte `.zone`, ce qui couvre la quasi-totalité du viewport ; le chemin tactile n'a pas cette restriction. *Impact :* incohérence souris/doigt, pan pratiquement inutilisable au navigateur.
- **L'écran de négociation promet un plateau visible sur un fond opaque à 95 %** — `index.html:166` vs `index.html:822` — le texte réinjecté à chaque phase 3 (`js/app.js:1829`) affirme « Le plateau est visible derrière cet écran », alors que la seule sortie (`#btn-end-nego`) termine la phase. *Impact :* consigne d'interface contredite par son comportement.
- **3 Mo de GeoJSON non minifié au premier chargement** — `js/app.js:25`, `data/quartiers-osm.geojson` — 163 864 nombres dont 150 253 à 13-15 décimales, écrits sans arrondi ni simplification (`tools/build-map.mjs:177`) alors que le rendu projette en `toFixed(1)` sur 1200 px (`js/map-renderer.js:89`). Aucun indicateur autour de `await loadGameData()` (`js/app.js:3064`). *Impact :* écran figé plusieurs secondes ; arrondi à 6 décimales = 1,88 Mo (‑39 %), 473 Ko gzippé contre 1,05 Mo.
- **PNG jusqu'à 1,47 Mo affichés en 64×48 px** — `js/app.js:2231` — 8 `<img>` générés sans `loading="lazy"` ni `srcset`, CSS 64×48 (`index.html:242`). *Impact :* ~2 Mo par écran de draft sur un écran chronométré par le passage de tablette.
- **5 cartes sur 31 n'affichent jamais leur illustration** — `js/app.js:2231, 2301` — l'extension `.png` est codée en dur alors que 031/032/035/038 sont en `.jpeg` et que 003 n'existe pas ; les `onerror` (`:2233, 2303`) masquent l'échec sans le signaler. 13 fichiers (2,5 Mo) sont à l'inverse orphelins.

**Documentation**

- **README racine : 2 liens morts et un chiffre faux** — `README.md:82-83` pointent vers `specs/03-donnees-cartographiques.md` et `specs/04-fiches-quartiers.md` qui n'ont jamais existé ; specs/07 et specs/08 (découpage de référence) ne sont pas cités ; `README.md:18` annonce « 75 cartes (30 types) » comme specs/01:274, specs/02:146, specs/05:127 et specs/README.md:32.
- **`specs/04-modele-de-donnees.md` est décroché sur ≥ 7 points** — `specs/04:361-487` — version 1.0 vs 2.0, plateau imbriqué `plateau.zones.*` vs plat, `quartiers_origine` tableau vs `quartier_origine` chaîne, `lingots_sales` et `timer_negociation` inexistants, `incorruptibles.deployes` documenté objets vs chaînes, `flics.deployes` documenté mais jamais alimenté (réserves 5 vs 7). Le schéma de cartes de `specs/04:165-211` date d'une version antérieure du JSON (ids préfixés, `image` avec extension, `cout` toujours rempli, 3 champs réels non documentés).
- **Contradictions internes 7 vs 10 tours** — `specs/02:160` et `specs/01:139` disent « après tour 10 » quand `js/special-entities.js:124` et `js/turn-manager.js:112` disent 7 ; `specs/03:251` et `:372` parlent encore d'élections « tous les 10 tours ».
- **Condition du bordel : 4 cases dans specs/04:289-292** contre 3 dans specs/01:152, specs/06:15/50-53, `data/constructions.json:40` et `js/revenue-engine.js:135-152`.
- **La règle de draft des quartiers de specs/03:71** (tirage de 2 ou 4) ne correspond pas au code (`js/setup.js:103-166` : liste complète des 11 disponibles, choix tour par tour, aucun `Math.random`) ; specs/05:37 décrit correctement le comportement réel.
- **La roadmap déclare « restants » trois chantiers livrés** — `specs/05:202, 206, 207-208` : bonus des administrations (`js/revenue-engine.js:34-43`, branché ligne 60), UX cambriolages (`js/heist-engine.js:71`, `js/app.js:1590-1667`), UX conquêtes (`js/app.js:1030`) — commits f96c084 et 498fa35.

### Mineurs

- **Sélecteurs DOM globaux dans les modales** — `js/app.js:1228` (aussi 780, 1319, 1444, 1637, 1651, 1703, 2371) — `document.querySelectorAll` au lieu d'un scope modale, IDs de champs réutilisés (`f-zone`, `f-target`, `modal-ok`). *Impact :* latent, aucune collision aujourd'hui.
- **`setTimeout(..., 0)` comme faux « DOM ready »** — `js/app.js:780, 966, 1086, 1637, 1702, 2622` — alors que `openModal` assigne `innerHTML` de façon synchrone (`:793`).
- **Handlers `onclick` inline pointant sur un global** — `js/app.js:2820, 2880, 2882` (+ `onerror` `:2233`, `onclick` `:2239`, `index.html:755`). *Impact :* empêche toute CSP stricte.
- **Aucun départage en cas de victoire simultanée** — `js/app.js:1775` — le tri stable départage par index de joueur, sans règle ni mention.
- **Pastilles de couleur en `[object Object]` dans l'onglet Stats mobile** — `js/app.js:303` — l'objet `{fill, stroke}` est interpolé entier alors que le desktop fait `c.fill`/`c.stroke` (`:3044`) ; `#legend` étant masqué sur mobile (`index.html:591`), c'est le seul code couleur disponible.
- **Trois `catch` entièrement vides** — `js/app.js:498, 508`, `js/save-export.js:129` — le dernier enchaîne silencieusement sur l'appel tiers `api.qrserver.com`.
- **Écouteurs pan/zoom et nav mobile accumulés à chaque partie** — `js/app.js:102`, `js/map-renderer.js:203-292` — 10 listeners par instance, aucun `removeEventListener`. *Impact :* fuite mémoire, sans effet visible sur la carte courante.
- **Libellé de construction toujours dégradé en identifiant brut** — `js/app.js:2853` — `CONSTRUCTION_DEFS` ne porte aucune propriété `label` (`js/revenue-engine.js:11-17`) ; les vrais libellés sont dans `data/constructions.json`, jamais chargé.
- **`tuer_pion`/`retirer_pion` peuvent supprimer un incorruptible sans passer par le coût de 700 L** — `js/magouille-engine.js:127, 156` — `splice` aveugle, UI sans filtre de type (`js/app.js:2424-2429`) ; `deplacer_incorruptible` (`:241-251`) ne met pas non plus à jour `gs.incorruptibles.deployes`.
- **`MagouilleEngine.play` ne revalide pas avant de débiter** — `js/magouille-engine.js:101-104` — contrairement à `HeistEngine.executeHeist` (`js/heist-engine.js:187`). Non atteignable aujourd'hui.
- **1,9 Mo de SVG versionnés jamais chargés** — `assets/plateau-osm.svg` (1 120 471 o, généré par `tools/build-map.mjs:323-324`) et `assets/carte_v12_traced.svg` (806 310 o). *Impact :* jamais téléchargés par le joueur, mais piège documentaire réel (specs/08:248 les nomme même `assets/plateau.svg`).
- **Accessibilité inexistante** — `index.html:796` — 0 `aria-*`, 0 `role=`, 0 `<label>`, 0 `tabindex`, 0 `keydown` dans tout le projet ; deux `role="button" tabindex="0"` générés sans handler clavier (`js/app.js:2116, 2232`) ; `alt=""` sur l'image principale de la fiche carte (`index.html:878`).
- **Z-index en nombres magiques** — `index.html:93` — 20 déclarations, 15 valeurs, saut de 300 à 10 000, `.zone-popup` et `#info-panel` mobile tous deux à 55. C'est la cause structurelle de la régression de la fiche Magouille.
- **CSS monolithique inline** — `index.html:7-689` — 683 lignes, 59 441 o (84 % du fichier), 57 `!important`, une seule custom property (`--panel-shift`), `#8ab4f8` répété 38 fois.
- **Constantes de gabarit mobile désynchronisées** — `index.html:664` (topbar 32 px) vs `:593, 597, 600, 618, 622` (calculs sur 36 px).
- **Élimination payante : échec silencieux et prostituée non traitée** — `js/conflict-resolver.js:235-241` — aucun log quand l'attaquant n'a pas les ressources.
- **Une zone contenant seulement un incorruptible perd son propriétaire** — `js/conflict-resolver.js:412` — `owners = [null]` de longueur 1 ; la branche symétrique (zone vide avec construction) est pourtant protégée (`:409-410`).
- **Index de `movedKeys` invalidés par les `splice`** — `js/conflict-resolver.js:58` — les fuites de l'étape 4 (`:239, 254, 261`) décalent les tableaux entre deux appels à `_resolveConflict`.
- **Coût du flic : 180 L facturés, 160 L versés** — `js/conflict-resolver.js:348, 375` — 20 L évaporés ; l'élimination (`:399`) n'est créditée nulle part non plus.
- **Ordre de traitement des créations de pions non randomisé** — `js/conflict-resolver.js:24` — par pid croissant, alors que `js/revenue-engine.js:52-57` mélange.
- **`RevenueEngine.processMovements` : 80 lignes de code mort avec un bug d'index périmé** — `js/revenue-engine.js:290-369, 357`.
- **Prix des armes gitanes : 24 L appliqués, 12 L annoncés dans le dictionnaire** — `js/dictionary.js:92, 94` vs `js/revenue-engine.js:7, 73` ; specs/01:96 est elle-même ambiguë (« 3× le prix » = 3× le prix de vente).
- **Champs d'état déclarés et jamais utilisés** — `js/game-state.js:15, 29, 32, 65` (`joueur_actif_index`, `gangs_actives`, `ordres_phase_courante`, `historique`) et `type_contrat` dans `KEY_MAP` (`js/save-export.js:22`) qui ne matche aucun champ réel.
- **L'expropriation serait annulée dès la résolution suivante** — `js/mayor-engine.js:50-56` vs `js/conflict-resolver.js:407-416` — latent, le pouvoir étant inaccessible.
- **`MAX_INCORRUPTIBLES = 2` n'est référencé nulle part** — `js/special-entities.js:49`.
- **`regles_tirage` du JSON n'est pas lu** — `data/cartes-magouille.json:989` — 8, 4 et 7 codés en dur dans `js/magouille-engine.js:49, 58` et `js/turn-manager.js:112` (le 7 est dupliqué 4 fois avec `js/app.js:147, 176, 282`).
- **5 illustrations « culture » (1,28 Mo) et 4 PNG orphelins (934 Ko)** — `data/cartes-magouille.json:919`, `assets/cards` — dont deux paires byte-identiques (017/019 et 017_2/018).
- **Deux jeux de données quartiers coexistent** — `data/quartiers.json` (24 410 o, IDs totalement disjoints, `harlem` à 9 pts contre 6 dans le modèle actif) ; documenté comme archivé en specs/04:156-159 mais sans marqueur dans le fichier.
- **Un contrat non honoré n'a aucune conséquence et le drapeau est irréversible** — `js/contract-engine.js:76, 80` — `honore` n'est jamais remis à `true` et n'est lu que pour un badge (`js/app.js:1861, 1867, 2720`) ; aucun lien avec la Coupole.
- **Le pipeline carto n'est pas reproductible depuis un clone frais** — `tools/build-map.mjs:48-49` — `data/geo-raw/` est gitignoré (`.gitignore:17`), aucun script `build`, millésime des sources non documenté (les URL, elles, le sont en specs/08:196-203).
- **La liste de specs/01 contient un doublon** — `specs/01:244` et `:272` sont la même carte « Maître Vergès » ; 37 entrées distinctes, pas 38.
- **specs/03 décrit un écran d'accueil et un timer de négociation qui n'existent pas** — `specs/03:22-31, 197, 215, 353` vs `index.html:697-699, 819-825` et `js/game-state.js:194-234`.

---

## 6. Dette technique structurelle

**1. `app.js` comme couche vue monolithique.** 3 079 lignes, 90 fonctions au niveau racine (47 `show*`, 16 `render*`), 42 `innerHTML`, 136 `getElementById`, 0 `export`, et 7 variables de module mutables lues et écrites depuis n'importe où. Trois tables de contenu y sont enchâssées (`CONDITION_LABELS` `:122`, `TUTORIAL_TIPS` `:444`, `GANG_DESCRIPTIONS` `:2891`, ~120 lignes). Conséquence directe : les 3 familles de modales et les 4 toasts existent chacun en 3 ou 4 copies, et la divergence est déjà mesurable (`QUARTIER_COLORS` correct à `:3044`, cassé à `:303`). Toute correction transverse — échappement HTML, scope des sélecteurs, budget d'ordres — demande 3 à 9 éditions séparées.

**2. Écriture d'état sans lecture : un tiers du contenu de jeu est décoratif.** Le pattern est systématique et couvre trois moteurs : 9 effets de cartes tombent dans un `default` qui annonce le succès (`js/magouille-engine.js:303`), 3 autres n'écrivent qu'un drapeau (`_verges_actif`, `_igor_actif`, `_ineligible`), 8 gangs sur 15 n'écrivent que dans `gs._blocages` / `gs._restrictions_ethniques` / `_immunite_ethnie`, et le champ `conditions` comme le champ `duree` ne sont jamais lus. Ces structures sont écrites, affichées à l'utilisateur en toast de succès, puis purgées en fin de mandat (`js/special-entities.js:350-370`) sans qu'aucune règle ne les ait consultées. Au total **22 cartes sur 65 et 8 gangs sur 15** consomment un coût et un tour pour rien. Le contrat implicite « un moteur retourne `{ok:true}` donc l'effet est appliqué » est faux, et rien dans le code ne le signale.

**3. Quatre à cinq sources de vérité pour les mêmes constantes.** `data/pions.json`, `data/constructions.json`, `data/institutions.json` et `data/quartiers.json` sont versionnés, documentés comme le modèle de données (specs/02:55-57, tout specs/04) et cochés comme livrés (specs/05:42) — mais jamais chargés (`js/app.js:25-28`). Leurs valeurs sont recopiées en dur dans `js/revenue-engine.js:7-17`, `js/conflict-resolver.js:6-9`, `js/special-entities.js:11, 41, 95`, `js/heist-engine.js:34-43`. S'y ajoutent `regles_tirage` ignoré au profit de littéraux, la fréquence 7 dupliquée en 4 endroits, et le seuil de victoire 55 en dur à 2 endroits. Les valeurs concordent aujourd'hui ; c'est un piège d'équilibrage, pas encore un bug.

**4. La frontière état/instance n'est pas tenue.** `GameState.serialize()` copie aveuglément `Object.keys(this)` (`js/game-state.js:151-157`) : ce qui ne devrait pas être persisté l'est (`_cartes_index`, 71,9 Ko, alors que `_ensureIndex` sait le reconstruire), et ce qui devrait l'être ne l'est pas (tout l'état de tour du TurnManager — ordres, file hotseat, votes, mains de draft — vit dans l'instance, `js/turn-manager.js:38-45`). `resumePhase()` a été écrite pour ce cas et n'a jamais été branchée. Le résultat est une sauvegarde 8× trop grosse **et** incapable de reprendre un tour.

**5. Aucun filet : ni test, ni lint, ni CI, ni gestion d'erreurs.** Les 7 moteurs de règles sont purs et directement exécutables en Node — le coût d'un premier harnais est faible — mais rien n'existe : `tools/package.json:6` a un script `test` bidon, il n'y a pas de `package.json` racine ni de `.github/`. En parallèle, 7 blocs `try` seulement dans tout le projet, dont 3 `catch` vides, aucun autour des 4 `fetch` ni autour de `localStorage`. Chaque régression de règle se découvre en pleine partie, sur un état déjà sauvegardé et non réversible.

---

## 7. Reste à faire

### Déclaré restant, et effectivement ouvert (specs/05:211-215)

- Animations et transitions
- Sons et retours haptiques
- Multi-slots de sauvegarde (un seul slot aujourd'hui, `js/game-state.js:6`)
- Tests sur tablette réelle (iPad, Android)
- Optimisation des performances SVG — à noter que le levier réel n'est pas `assets/plateau-osm.svg` (jamais chargé) mais l'arrondi/simplification de `data/quartiers-osm.geojson`

### Déclaré restant mais déjà livré (roadmap à corriger)

- Bonus des administrations (`specs/05:202`) — implémenté et branché : `js/revenue-engine.js:34-43`, appelé ligne 60
- UX cambriolages (`specs/05:207`) — `js/heist-engine.js:71`, `js/app.js:1590-1667`, commit f96c084
- UX conquêtes de territoires (`specs/05:208`) — alerte de perte de contrôle `js/app.js:1030`, commit 498fa35

### Déclaré fait mais incomplet

| Élément | Déclaré | Réel |
|---|---|---|
| Effets de gangs (`specs/05:149`, `specs/02:160`) | « 5 effets », 10 restants | 15 `case` écrits, **7 seulement produisent un effet** |
| Traversée des gitans (`specs/05:147`) | `[x]` livré | Fonctions sans appelant, aucun type d'ordre (`js/special-entities.js:13-32`) |
| Incorruptibles max 2 (`specs/01:137`, `:02:159`, `:05:148`) | limite documentée 3 fois | constante morte, et **aucun incorruptible ne peut apparaître** (pouvoir phase 5 non exposé) |
| Cartes Magouille (`README:18`, `specs/01:274`, `:02:146`) | 75 cartes / 30 types | 65 exemplaires / 31 types, 5 culture inertes, 9 effets non codés |
| `pions.json` / `constructions.json` / `institutions.json` (`specs/05:42`) | `[x]` livrés | jamais chargés |
| Conflits (`specs/01:178, 182, 193-195`) | règles décrites | échange, support inter-joueurs et cascade absents |
| Bordel (`specs/06:52-53`) | prend possession des 3 cases | pose sur une zone quelconque, 1 seule zone prise |

---

## 8. Recommandations priorisées

| # | Action | Effort | Gain |
|---|---|---|---|
| 1 | Débloquer le draft : accepter une main incomplète (`selected.size === Math.min(4, hand.length)`, `js/app.js:2251`) **et** recycler les cartes des casses via `defaussees` (`js/heist-engine.js:236, 257`) | S | Supprime le seul softlock certain ; partie à 6 joueurs jouable au-delà du tour 14 |
| 2 | Exclure `_cartes_index` (et les clés `_*` volatiles) de `serialize()` (`js/game-state.js:151-157`) | S | Sauvegarde 83 Ko → 10 Ko, URL 19 800 → 1 400 caractères : QR code et partage WhatsApp réparés |
| 3 | Ajouter `escapeHtml()` et l'appliquer aux 178 interpolations de `.nom` ; envelopper les 4 `fetch`, `save()` et `load()` dans des `try/catch` avec message utilisateur | S | Supprime la casse d'affichage sur `<`/`&`/`"`, l'écran noir silencieux et le gel sur stockage bloqué |
| 4 | Corriger les 4 bugs arithmétiques/d'index isolés : racket (`js/magouille-engine.js:205`), propagation de contamination (`:295`), `filter().map` du heist (`js/heist-engine.js:90, 152`), test du résultat avant de défausser (`:106-116`) | S | 4 règles rendues correctes pour ~20 lignes modifiées |
| 5 | Rétablir `#magouille-detail-ov { z-index: 350; background: rgba(0,0,0,0.85) }` (`index.html:488`) et poser une échelle nommée de z-index | S | Fonction « Jouer une carte » de nouveau utilisable ; évite la 4ᵉ régression du même bug |
| 6 | Exposer le vrai `refresh()` du panneau d'ordres au popup de zone et vérifier le budget dans `submitOrders` (`js/app.js:405-411`, `js/turn-manager.js:75-90`) | S | Ordres passés depuis la carte de nouveau visibles ; triche involontaire sur le budget supprimée |
| 7 | Repasser `incorruptible` et `exproprier` en `phase: 1` ou rendre le panneau accessible en phase 5 (`js/mayor-engine.js:2-3`) ; ajouter `source: 'mairie'` aux coupures du maire (`:80`) | S | Débloque 2 pouvoirs sur 8 et toute la mécanique des incorruptibles ; supprime la coupure définitive |
| 8 | Ajouter un `Math.max/min` sur `viewBox.w/h` et un bouton « recentrer » (`js/map-renderer.js:196-199, 237-238`) ; borner le pan | S | Supprime le cas « carte perdue, rechargement obligatoire, ordres perdus » |
| 9 | Arrondir les coordonnées à 6 décimales et appliquer `turf.simplify` dans `tools/build-map.mjs:177` ; ajouter un indicateur de chargement | S | GeoJSON 3,0 → ~1,9 Mo (473 Ko gzip), parsing divisé d'autant, plus d'écran figé muet |
| 10 | Persister l'état de tour du TurnManager dans le GameState et appeler `resumePhase()` depuis `startTurnLoop` (`js/app.js:526`) ; demander confirmation avant l'écrasement par `#restore=` (`:3070`) | M | Reprise fiable d'une partie ; plus de tour rejoué ni de sauvegarde tierce détruite |
| 11 | Reprendre `conflict-resolver` : déplacer le traitement des prostituées après l'étape 6, exclure les pions non armés de l'attaque, exclure les alliés armés des cases de fuite, consulter `movedKeys` pour le défenseur (`js/conflict-resolver.js:75, 136, 249, 272`) | M | 4 règles de combat conformes aux specs ; supprime les états de plateau illégaux |
| 12 | Statuer sur les 22 cartes et 8 gangs inertes : soit les implémenter, soit les retirer du deck et de l'UI ; retirer le `default` silencieux au profit d'un `ok:false` explicite (`js/magouille-engine.js:303`) | L | Le joueur cesse de payer pour rien ; l'équilibrage devient mesurable |
| 13 | Aligner la documentation : liens du README (`README.md:82-83`), 75→65 cartes (5 fichiers), tour 7 partout (`specs/01:139`, `:02:160`, `:03:251, 372`), bordel à 3 cases (`specs/04:289`), roadmap (`specs/05:202-208`), schéma GameState (`specs/04:361-487`) | S | La doc redevient utilisable comme référence par un contributeur ou un agent |
| 14 | Extraire de `app.js` les 3 familles de modales, les 4 toasts et les 3 tables de données ; ajouter un premier harnais de tests Node sur `revenue-engine`, `conflict-resolver` et `turn-manager` (déjà purs, aucun refactoring préalable) | L | Fin de la divergence entre copies ; non-régression sans partie hotseat complète |