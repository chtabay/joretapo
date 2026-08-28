/**
 * Vues de l'etat de partie — ce que chaque joueur a le droit de voir.
 *
 * Le bandeau des joueurs existait en cinq versions divergentes dans app.js, et
 * une seule savait masquer. Comme le HUD de bureau est en `display:none` sous
 * 768 px, la seule liste atteignable sur telephone — l'onglet « Stats » — etait
 * precisement celle qui ne masquait rien : pendant que J2 saisissait ses ordres
 * secrets, un tap sur l'onglet affichait les lingots, les armes, les doses et le
 * nombre de cartes de tout le monde. Les huit rideaux d'un tour, soit 40 % de son
 * cout en passages de tablette, ne protegeaient donc plus rien.
 *
 * Ce module est la source unique. Il est PUR : aucune reference au DOM, donc
 * testable — c'est la seule facon de verifier une regle de secret autrement qu'a
 * l'oeil.
 *
 * `revele` n'a deliberement AUCUNE valeur par defaut : un appelant qui l'oublie
 * leve une erreur au lieu de tout devoiler en silence. Une fuite doit casser, pas
 * s'installer.
 */

/** Ce que voit la table d'un joueur donne. Les champs secrets valent null. */
export function vueJoueurs(gs, gameplay, options) {
  if (!options || !('revele' in options)) {
    throw new Error('vueJoueurs : il faut dire QUI a le droit de voir — passer { revele }.');
  }
  const { revele } = options;
  const visible = pid => revele === 'tous' || revele === pid;

  return gs.joueurs.map(j => {
    const quartiers = gameplay.quartiers.filter(
      q => gs.getQuartierOwner(q.id, gameplay) === j.id
    );
    const zones = Object.values(gs.plateau).filter(z => z.proprietaire === j.id).length;
    const ouvert = visible(j.id);

    return {
      id: j.id,
      nom: j.nom,
      couleur: j.couleur,
      estMaire: !!j.est_maire,
      /* Public : ce qui se lit deja sur la carte. Personne ne gagne a le cacher,
         et le cacher rendrait le plateau incomprehensible. */
      zones,
      quartiers: quartiers.map(q => ({ id: q.id, nom: q.nom, points: q.points })),
      /* Secret : la tresorerie, les stocks, la main. Un adversaire qui les
         connait sait exactement ce que l'autre peut acheter ce tour-ci. */
      cache: !ouvert,
      points: ouvert ? gs.getPlayerPoints(j.id, gameplay) : null,
      lingots: ouvert ? j.ressources.lingots : null,
      armes: ouvert ? j.ressources.armes : null,
      doses: ouvert ? j.ressources.doses : null,
      cartes: ouvert ? (j.cartes_magouille || []).length : null
    };
  });
}

/** Les joueurs classes par points. Ne s'emploie que sur une vue revelee a tous. */
export function classementDe(vues) {
  if (vues.some(v => v.points === null)) {
    throw new Error('classementDe : on ne classe pas une vue masquee.');
  }
  return [...vues].sort((a, b) => b.points - a.points);
}

/**
 * Quartiers a une zone de basculer.
 *
 * Le controle se fait a la majorite STRICTE : il faut plus de la moitie des
 * zones. Trois endroits de l'interface annoncaient « presque domine » a partir
 * de la moitie, donc parfois pour un quartier deja tenu, et jamais pour celui
 * ou il ne manquait qu'une case. On calcule le seuil ici, une fois.
 */
export function quartiersDisputes(gs, gameplay) {
  const disputes = [];
  gameplay.quartiers.forEach(q => {
    const majorite = Math.floor(q.zones.length / 2) + 1;
    const compte = {};
    q.zones.forEach(zid => {
      const p = gs.plateau[zid]?.proprietaire;
      if (p !== null && p !== undefined) compte[p] = (compte[p] || 0) + 1;
    });
    const tenu = Object.entries(compte).find(([, n]) => n >= majorite);
    Object.entries(compte).forEach(([pid, n]) => {
      if (n === majorite - 1 && !tenu) {
        disputes.push({
          quartier: q.id, nom: q.nom, points: q.points,
          joueur: Number(pid), tenues: n, majorite, total: q.zones.length
        });
      }
    });
  });
  return disputes;
}

export default { vueJoueurs, classementDe, quartiersDisputes };
