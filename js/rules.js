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
   * fallait tenir simultanement 42 % de la carte, et aucune partie ne finissait.
   *
   * Puis 35, cale sur un banc d'essai defaillant : son bot renoncait a creer des
   * pions faute d'armes, et il ne jouait ni le draft, ni les cartes, ni les
   * gangs, ni les casses, ni les pouvoirs de maire. Une fois le banc repare, 35
   * donne une mediane au tour 8 — la partie s'acheve juste apres la premiere
   * election, avant que le titre de maire ait pu etre repris.
   *
   * Mesure sur 40 parties a 4 joueurs, banc repare :
   *
   *     seuil 35 -> 85 % gagnees au seuil, mediane tour 8    (trop court)
   *     seuil 37 -> 68 %, mediane tour 9,5
   *     seuil 38 -> 57 %, mediane tour 11                    <- retenu
   *     seuil 40 -> 50 %, mediane tour 14                    (la fin dure decide)
   *
   * 38 est la seule valeur qui place la mediane dans la fourchette visee de 10 a
   * 14 tours. A trois joueurs elle donne 14, a six 13 : la partie passe partout
   * la premiere election et laisse le temps de reprendre la mairie.
   *
   * Les points arrivent par blocs (un quartier vaut 3 a 15, la mairie 15) : le
   * reglage est donc discontinu. Entre 35 et 40, seul 38 tombe juste.
   */
  victoire: 38,

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
