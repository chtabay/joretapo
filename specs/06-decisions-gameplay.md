# 06 -- Décisions de gameplay

Arbitrages pris lors de l'audit de jouabilité, avant le développement.
Ces décisions tranchent les ambiguïtés des règles v8 du jeu physique
pour permettre une implémentation numérique sans équivoque.

---

## Décisions validées

| # | Sujet | Décision | Justification |
|---|-------|----------|---------------|
| 1 | **Ethnie des joueurs** | Le joueur **choisit son ethnie** lors de la création de son profil en début de partie. | Liberté de choix, cohérent avec le ton satirique du jeu. |
| 2 | **Cartes neutres** | Les ~10 cartes sans effet (Salto Angel, Niagara, Anna Nicole-Smith...) sont des **pioches perdues volontaires** pour diluer le deck. | Intention originale du game designer. |
| 3 | **Bordel** | Se forme avec **3 prostituées de luxe** à l'intersection de **3 cases**. Le bordel possède les 3 cases adjacentes. | Plus jouable géométriquement sur la carte, investissement déjà massif (3×80 + 400 lingots). La fiche pion v8 indique 3. |
| 4 | **Nombre d'ordres** | **5 ordres par tour** (répartis librement entre approvisionnement et déplacement). +2 possible avec Central Park ou Secrétaire particulière. | Conforme aux règles v8. Les 7 lignes sur la feuille incluent les bonus. |
| 5 | **Cohabitation prostituées** | **1 seule prostituée par case** (classique OU luxe, pas les deux). Elle peut cohabiter avec 1 pion armé (dealer ou trafiquant). | Simplifie les règles, cohérent avec "un seul pion d'un type donné par case". |
| 6 | **Ordre de saisie hotseat** | L'ordre dans lequel les joueurs saisissent leurs ordres est **randomisé à chaque phase**. | Compense la perte de simultanéité du hotseat. Le dernier à jouer n'a plus d'avantage systématique. |
| 7 | **Flics : propriété** | Un flic **ne change PAS de propriétaire** quand un autre joueur paie pour le déplacer. Le paiement est un pot-de-vin, pas un rachat. | Thématique (flic corrompu mais pas à vendre), respecte la limite de 2/joueur, crée une tension stratégique. |
| 8 | **Traversée des gitans** | Le pion **traverse** le camp de gitans et atterrit sur un bloc adjacent de l'autre côté (déplacement de 2 cases). Le joueur choisit le bloc de destination. | Cohérent avec "seul moyen de se déplacer de 2 cases". Justifie le coût élevé (5 doses + 5 armes + 1 pion sacrifié). |
| 9 | **Incorruptibles** | Les incorruptibles sont contrôlés par **le système (le "juge")**, pas par un joueur. Ils sont placés par le maire ou par des cartes magouille. | Neutre, pas d'avantage à un joueur, cohérent avec leur rôle d'obstacle universel. |
| 10 | **Victoire** | La victoire est **instantanée** : dès qu'un joueur atteint 55 points de victoire, la partie s'arrête et il gagne. La vérification se fait à chaque fin de phase. | Crée de la tension, encourage le jeu agressif. |

---

## Ethnies disponibles

Les ethnies sont un mécanisme de jeu satirique qui détermine l'accès à certains quartiers
quand les gangs sont activés :

| Ethnie | Accès restreint par | Accès libre à |
|--------|---------------------|---------------|
| Caucasien | Gang du Bolito (Harlem) | Ku Klux Klan (Cypress Hill) |
| Afro-américain | Ku Klux Klan (Cypress Hill) | Gang du Bolito (Harlem) |
| Asiatique | Ku Klux Klan (Cypress Hill), Gang du Bolito (Harlem) | Triades (China Town) |
| Italien | Ku Klux Klan (Cypress Hill), Gang du Bolito (Harlem) | Triades (China Town) |
| Autre | Selon le gang concerné | -- |

**Exceptions** :
- Les St James Boys (Bronx) immunisent leur propriétaire de TOUTES les restrictions ethniques
- La carte "Patrick Sébastien" donne temporairement accès aux quartiers asiatiques
- Les cartes "Dépigmentation" / "Pigmentation" changent l'ethnie du joueur

**Note** : le propriétaire d'un quartier n'est JAMAIS affecté par les restrictions de son propre gang.

---

## Règles de placement du bordel (précisées)

1. Le joueur doit posséder **3 prostituées de luxe** sur 3 cases distinctes
2. Ces 3 cases doivent être **mutuellement adjacentes** (chacune est adjacente aux 2 autres)
3. Le bordel se place conceptuellement à l'intersection des 3 cases
4. Le joueur prend possession des 3 cases (même si des adversaires y avaient des pions non armés)
5. Les revenus du bordel = somme des revenus des 3 cases pour une prostituée de luxe
6. Coût : 400 lingots (Zurich Bank) + 40 lingots (police)
7. Le bordel offre des avantages supplémentaires :
   - Permet le chantage (cartes magouille)
   - Réduit le coût de corruption des incorruptibles (de 1000 à 500 lingots)
   - Condition nécessaire pour construire un casino
   - Condition nécessaire pour certaines cartes magouille

---

## Traversée des gitans (précisée)

1. Le pion du joueur part de sa case actuelle (case A)
2. Il entre dans le camp de gitans (case G) en payant le prix : 5 doses + 5 armes
3. Le joueur sacrifie 1 de ses pions (n'importe lequel sur le plateau)
4. Le pion ressort de l'autre côté sur un bloc adjacent au camp (case B), au choix du joueur
5. Case B doit être adjacente au camp de gitans ET différente de case A
6. Le pion ne peut PAS rester sur la case des gitans

Schéma :
```
[Case A] ──(paiement)──> [Camp Gitans] ──(sortie)──> [Case B]
                              ▲
                        sacrifice 1 pion
```

---

## Vérification de la victoire

La vérification des 55 points se fait automatiquement à la fin de chaque phase :

| Source de points | Quand recompter |
|------------------|-----------------|
| Quartiers possédés | Fin de phase 5 (après résolution des conflits) |
| Constructions | Fin de phase 2 (après révélation des constructions) et phase 5 |
| Titres (Roi drogue/armes/prostitution) | Fin de phase 5 |
| Maire | Après les élections |
| Plus riche | Fin de phase 2 (après récolte) |

Si un joueur atteint 55 points en milieu de tour, **la partie s'arrête immédiatement**
après la résolution de la phase en cours.
