/**
 * Réglages de partie.
 *
 * Ces valeurs decident si une partie tient dans une soiree. Elles etaient
 * dispersees en dur dans app.js, turn-manager.js et le dictionnaire, ce qui
 * rendait impossible de les changer — et donc de les mesurer.
 *
 * Chaque valeur ici est calee par `tools/sim.mjs`, pas au jugé. Quand on en
 * modifie une, on relance le banc et on regarde ce qui bouge.
 *
 * Un pack de ville pourra les surcharger : Chatellerault, avec moins de
 * quartiers qu'un New York a 129 points, n'aura pas le meme seuil.
 */

export const RULES = {
  /**
   * Points de victoire.
   *
   * 55 auparavant, sur un plateau qui n'offre que 129 points de quartier : il
   * fallait tenir simultanement 42 % de la carte. Mesure au banc d'essai sur
   * 40 parties a 4 joueurs, apres correction du placement, du controle a la
   * majorite et de la propriete persistante :
   *
   *     seuil 25 -> 100 % de parties finies, mediane tour 8   (trop court : la
   *                 partie s'acheve avant la premiere election, au tour 7)
   *     seuil 35 ->  80 %, mediane tour 12,5, etendue 8-18    <- retenu
   *     seuil 45 ->  12 %, mediane tour 15                    (une soiree n'y suffit pas)
   *
   * 35 place la fin apres le premier mandat de maire, donc apres que l'election
   * ait compte, tout en tenant dans une soiree.
   */
  victoire: 35,

  /**
   * Fin de partie forcee, en nombre de tours.
   *
   * Sans elle, une partie ou personne ne decroche l'avantage ne finit jamais :
   * 0 % des parties simulees s'achevaient. Au 2e mandat revolu, le joueur en tete
   * l'emporte. La victoire immediate au seuil reste prioritaire.
   */
  finDePartie: 14,

  /** Ordres par joueur et par tour, communs aux phases 1 et 4. */
  ordresParTour: 5,

  /** Tours entre deux elections municipales. */
  toursParMandat: 7,

  /**
   * Peage preleve par celui qui controle un point d'approvisionnement, en part
   * du prix de base, sur tout joueur qui s'y sert.
   *
   * Les ports, peages et aeroports sont des equipements PUBLICS : ils ne se
   * construisent pas, ils se dominent. Sans ce peage, n'importe qui commandait a
   * n'importe quel port depuis n'importe ou et un port ne valait pas la peine
   * d'etre pris — la logistique n'avait aucune geographie.
   *
   * 0,5 place la rente a un niveau qui se remarque sans etouffer : 30 armes
   * achetees chez un rival lui versent 60 lingots. Six des onze quartiers de
   * depart ne portant aucun point, ce ne peut pas etre un verrou.
   */
  peageApproPct: 0.5,

  /** Draft de cartes apres chaque election : on pioche N, on en garde N/2. */
  draftPioche: 8,
  draftGarde: 4
};

export default RULES;
