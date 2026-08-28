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
   * Le banc avait un second defaut, decouvert en cherchant pourquoi le titre de
   * maire ne changeait jamais de mains : son bot votait pour le joueur en tete
   * parmi les autres, c'est-a-dire pour le maire sortant — qui mene precisement
   * PARCE QU'il a la mairie. Personne, a une vraie table, ne redonne 15 points a
   * celui qui gagne deja. Une fois ce vote rendu rationnel, tout se deplace.
   *
   * Mesure sur 40 parties a 4 joueurs, banc repare et mandat de 6 tours :
   *
   *     seuil 30 -> 95 % gagnees au seuil, mediane tour 7   (trop court)
   *     seuil 32 -> 93 %, mediane tour 11
   *     seuil 34 -> 85 %, mediane tour 13                   <- retenu
   *     seuil 36 -> 63 %, mediane tour 13
   *     seuil 38 -> 38 %, mediane tour 14                   (la fin dure decide)
   *
   * 34 est la valeur la plus STABLE d'un format a l'autre : mediane 13 a trois,
   * quatre et six joueurs, 68 a 85 % de parties gagnees au seuil plutot qu'a
   * l'usure, et un tour de verrouillage a 1,00 — le meneur n'est le vainqueur
   * assure qu'au tout dernier tour. Le titre de maire change de mains dans une
   * partie sur deux.
   *
   * Les points arrivent par blocs (un quartier vaut 3 a 15, la mairie 15) : le
   * reglage est discontinu, il n'y a pas de valeur intermediaire utile.
   */
  victoire: 34,

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

  /**
   * Tours entre deux elections municipales.
   *
   * Sept auparavant : avec une fin de partie au 14e tour, la seconde election
   * tombait exactement sur la fin et n'avait donc jamais lieu. Le maire elu au
   * tour 7 gardait 15 points — 44 % du seuil — jusqu'au bout, sans jamais avoir
   * a les redefendre. Mesure : le titre changeait de mains dans 0 % des parties.
   *
   * A six tours, les scrutins tombent a la fin des tours 6 et 12, et la mediane
   * de victoire est au tour 13 : le second a bien lieu, et il reste deux tours
   * pour exploiter le titre ou le perdre.
   *
   *                        mandat 7   mandat 6
   *   elections tenues        1,00       1,93
   *   titre repris             0 %       48 %
   *   tour de verrouillage    0,57       1,00
   *
   * Le tour de verrouillage passe de 0,57 a 1,00 : avec un mandat de sept tours,
   * l'issue etait scellee a mi-partie ; a six, elle ne l'est qu'au dernier tour.
   * C'est le seul reglage du depot qui deplace cet indicateur a ce point.
   */
  toursParMandat: 6,

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
