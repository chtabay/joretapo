/**
 * JORETAPO — Contenu et helpers purs de l'interface.
 *
 * Ce module ne touche NI au DOM NI à `window` : il est importable en Node et
 * donc testable (tests/app-robustesse.test.js). Il regroupe :
 *   1. l'échappement HTML (aucune fonction de ce type n'existait dans le dépôt) ;
 *   2. les tables de contenu extraites de js/app.js (conditions de cartes,
 *      conseils du tutoriel, descriptions de gangs, libellés de construction) ;
 *   3. les quelques calculs d'affichage qui n'ont aucune raison de vivre dans
 *      un fichier de 3 000 lignes : formatage d'un ordre, départage d'une
 *      victoire, libellé d'un départage d'élection.
 *
 * Convention du projet : classes/fonctions pures, retours `{ok, msg, reason}`
 * quand un verdict est rendu, messages en français.
 */

import { BUY_PRICE } from './revenue-engine.js';
import { SpecialEntities } from './special-entities.js';

/* ═══════════════════════════════════════════════════════════
 *  1 — Échappement HTML
 * ═══════════════════════════════════════════════════════════ */

const ENTITES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/**
 * Échappe une valeur destinée à être interpolée dans du HTML (texte OU attribut
 * entre guillemets). Toute donnée venant d'un joueur — nom saisi à la
 * configuration, nom restauré depuis un fragment `#restore=` — DOIT passer ici.
 *
 * `null` / `undefined` deviennent la chaîne vide plutôt que « null ».
 */
export function escapeHtml(valeur) {
  if (valeur === null || valeur === undefined) return '';
  return String(valeur).replace(/[&<>"'`]/g, ch => ENTITES[ch]);
}

/** Le motif d'une couleur CSS que l'on accepte de recopier dans un `style=`. */
const COULEUR_VALIDE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/;

/**
 * Couleur sûre pour un attribut `style`. Une valeur non reconnue (ou forgée via
 * un lien de partage) est remplacée par le gris neutre au lieu d'être recopiée.
 */
export function couleurSure(valeur, defaut = '#888') {
  if (valeur === null || valeur === undefined) return defaut;
  const v = String(valeur).trim();
  return COULEUR_VALIDE.test(v) ? v : defaut;
}

/* ═══════════════════════════════════════════════════════════
 *  2 — Tables de contenu (extraites de js/app.js)
 * ═══════════════════════════════════════════════════════════ */

/** Libellés français des conditions de jouabilité des cartes Magouille. */
export const CONDITION_LABELS = {
  possede_homme_de_main: 'Posséder un homme de main',
  carte_magouille_jouee: 'Une carte magouille adverse vient d\'être jouée',
  pion_adjacent_prostituee: 'Un pion adjacent à une prostituée',
  carte_triche_jouee: 'Une carte triche vient d\'être jouée',
  gangs_voisins_actifs: 'Deux gangs ennemis voisins actifs',
  est_maire: 'Être maire',
  possede_cimetiere: 'Posséder le cimetière',
  possede_bordel: 'Posséder un bordel',
  possede_bordel_ou_maire: 'Posséder un bordel ou être maire',
  flics_en_reserve: 'Flics en réserve',
  conflit_en_cours: 'Conflit en cours',
  possede_lobby_juif: 'Posséder le Lobby Juif',
  majorite_quartier: 'Majorité dans un quartier',
  '3_hommes_quartier': '3 hommes dans un quartier',
  '4_hommes_pres_port': '4 hommes près du port',
  a_perdu_electeurs_christophe: 'A perdu des électeurs (Chantage Christophe)',
  adversaire_1_case_quartier_moitie: 'Adversaire à 1 case d\'un quartier à moitié contrôlé',
  cible_ancien_maire: 'Cible ancien maire'
};

/** Conseils affichés une fois chacun pendant les deux premiers tours. */
export const TUTORIAL_TIPS = {
  orders_supply_1: {
    title: '📦 Phase d\'approvisionnement',
    text: 'Commencez par acheter des <strong>doses</strong> et des <strong>armes</strong> aux points d\'approvisionnement. Vous pouvez aussi recruter des prostituées ou construire des bâtiments.',
    next: 'Utilisez les boutons ci-dessous pour passer vos ordres, puis « Valider ».'
  },
  orders_move_1: {
    title: '🚶 Phase de déplacements',
    text: 'Déplacez vos pions sur des cases adjacentes pour conquérir de nouveaux territoires. Créez des dealers ou trafiquants pour augmenter vos revenus.',
    next: 'Les pions immobiles soutiennent automatiquement les alliés en conflit ; un ordre « Soutenir » permet de désigner explicitement la case défendue.'
  },
  negotiation_1: {
    title: '🤝 Négociation',
    text: 'Profitez de cette phase pour discuter avec les autres joueurs. Proposez des alliances, des contrats, ou menacez vos rivaux !',
    next: 'Appuyez sur « Continuer » quand vous avez terminé.'
  },
  reveal_1: {
    title: '👁️ Révélation',
    text: 'Les ordres de tous les joueurs sont maintenant révélés. Observez les mouvements et les achats de vos adversaires.',
    next: ''
  }
};

/** Fiches longues des effets de gang, affichées dans la modale d'information. */
export const GANG_DESCRIPTIONS = {
  bloquer_ventes_armes: {
    desc: 'Bloque toutes les ventes d\'armes sur les points d\'approvisionnement pendant la durée de l\'effet. Aucun joueur ne peut acheter d\'armes.',
    icon: '🔫'
  },
  eliminer_3_pions: {
    desc: 'Éliminez immédiatement jusqu\'à 3 pions ennemis de votre choix, partout sur le plateau. Effet instantané et dévastateur.',
    icon: '💀'
  },
  revente_marchandises: {
    desc: 'Permet de revendre vos doses et armes à tout moment au prix du marché. Effet permanent tant que vous contrôlez le quartier.',
    icon: '💱'
  },
  bloquer_ordres: {
    desc: 'Bloque tous les ordres d\'un joueur ciblé pendant la durée de l\'effet. Le joueur ne peut plus passer aucun ordre.',
    icon: '🚫'
  },
  restriction_ethnie_caucasien_asiatique: {
    desc: 'Interdit le recrutement de pions caucasiens et asiatiques dans tout le quartier. Restriction permanente tant que le gang est actif.',
    icon: '🚷'
  },
  voler_action_maire: {
    desc: 'Volez une action de maire au joueur qui en est le titulaire. Si personne n\'est maire, l\'effet est perdu.',
    icon: '🏛️'
  },
  actions_supplementaires: {
    desc: 'Vous octroie 2 ordres supplémentaires par tour, de manière permanente. Un avantage stratégique majeur.',
    icon: '⚡'
  },
  restriction_ethnie_non_asiatique_non_italien: {
    desc: 'Interdit le recrutement de pions non-asiatiques et non-italiens dans le quartier. Restriction permanente.',
    icon: '🚷'
  },
  immunite_restrictions_ethniques: {
    desc: 'Immunise tous vos pions contre les restrictions ethniques imposées par les autres gangs. Effet permanent.',
    icon: '🛡️'
  },
  eliminer_prostituees_quartier_voisin: {
    desc: 'Élimine toutes les prostituées ennemies dans un quartier voisin de votre choix. Effet instantané.',
    icon: '💃'
  },
  racket_etablissements: {
    desc: 'Percevez immédiatement les revenus de tous les établissements d\'un quartier ciblé, même s\'ils ne vous appartiennent pas.',
    icon: '💰'
  },
  casino_gratuit: {
    desc: 'Construisez un casino gratuitement sur une zone que vous contrôlez. Normalement le casino coûte extrêmement cher.',
    icon: '🎰'
  },
  bloquer_approvisionnements: {
    desc: 'Bloque tous les approvisionnements (denrées, armes, doses) pendant la durée de l\'effet. Aucun joueur ne peut s\'approvisionner.',
    icon: '📦'
  },
  restriction_ethnie_non_caucasien: {
    desc: 'Interdit le recrutement de pions non-caucasiens dans le quartier. Restriction permanente tant que le gang est actif.',
    icon: '🚷'
  },
  bloquer_deplacements_manhattan: {
    desc: 'Bloque tous les déplacements de pions vers Manhattan pendant la durée de l\'effet. Un blocus stratégique redoutable.',
    icon: '🚕'
  }
};

/**
 * Libellés affichables des bâtiments. `CONSTRUCTION_DEFS` (revenue-engine) ne
 * porte que les coûts : le panneau d'info retombait systématiquement sur
 * l'identifiant technique.
 */
export const CONSTRUCTION_LABELS = {
  restaurant: 'Restaurant',
  tripot: 'Tripot',
  labo: 'Labo de raffinage',
  bordel: 'Bordel',
  casino: 'Casino'
};

/** Libellés français des types de pions. */
export const PION_LABELS = {
  dealer: 'Dealer',
  trafiquant: 'Trafiquant',
  prostituee_base: 'Prostituée',
  prostituee_luxe: 'Prostituée de luxe',
  flic: 'Flic',
  incorruptible: 'Incorruptible',
  gitan: 'Gitan'
};

export function libellePion(type) {
  return PION_LABELS[type] || String(type || '').replace(/_/g, ' ');
}

/** Motifs de départage d'un scrutin (constante DEPARTAGE de turn-manager). */
export const DEPARTAGE_LABELS = {
  majorite: 'élu à la majorité des voix',
  puissance_electorale: 'départagé à la puissance électorale',
  anti_cumul_mandats: 'départagé par l\'anti-cumul des mandats (le sortant s\'efface)',
  outsider_fortune: 'départagé en faveur du moins fortuné',
  siege_vacant: 'égalité irréductible — le siège reste vacant',
  aucune_voix: 'aucune voix exprimée — le siège reste vacant'
};

export function libelleDepartage(motif) {
  return DEPARTAGE_LABELS[motif] || '';
}

/* ═══════════════════════════════════════════════════════════
 *  3 — Victoire
 * ═══════════════════════════════════════════════════════════ */

/** Seuil de victoire (specs/06:22). Était codé en dur à deux endroits d'app.js. */
export const SEUIL_VICTOIRE = 55;

/**
 * Départage une fin de partie. `entrees` = [{ joueur, points, lingots, zones }].
 *
 * Les specs ne prévoient rien pour deux joueurs franchissant le seuil au même
 * instant ; l'ancien code renvoyait `results[0]`, c'est-à-dire le joueur au plus
 * petit index. Cascade retenue (journalisée dans docs/journal-decisions.md) :
 * points, puis lingots, puis nombre de zones, puis victoire partagée.
 *
 * @returns {{vainqueur:?object, points:number, exAequo:object[], motif:string}|null}
 */
export function trouverVainqueur(entrees, seuil = SEUIL_VICTOIRE) {
  const liste = (entrees || []).filter(e => e && e.joueur);
  if (liste.length === 0) return null;

  const classement = [...liste].sort((a, b) => b.points - a.points);
  const tete = classement[0];
  if (tete.points < seuil) return null;

  let lot = classement.filter(e => e.points === tete.points);
  let motif = 'points';

  if (lot.length > 1) {
    const maxL = Math.max(...lot.map(e => e.lingots || 0));
    const parLingots = lot.filter(e => (e.lingots || 0) === maxL);
    if (parLingots.length < lot.length) motif = 'lingots';
    lot = parLingots;
  }
  if (lot.length > 1) {
    const maxZ = Math.max(...lot.map(e => e.zones || 0));
    const parZones = lot.filter(e => (e.zones || 0) === maxZ);
    if (parZones.length < lot.length) motif = 'zones';
    lot = parZones;
  }

  if (lot.length > 1) {
    return { vainqueur: null, points: tete.points, exAequo: lot, motif: 'ex_aequo' };
  }
  return { vainqueur: lot[0].joueur, points: lot[0].points, exAequo: [], motif };
}

/* ═══════════════════════════════════════════════════════════
 *  4 — Formatage d'un ordre
 * ═══════════════════════════════════════════════════════════ */

/** Le joueur possède-t-il un labo (remise de 50 % sur les doses, spec 01:150) ? */
function aUnLabo(gs, pid) {
  if (!gs || !gs.plateau) return false;
  return Object.values(gs.plateau).some(z => z.construction === 'labo' && z.proprietaire === pid);
}

/**
 * Prix unitaire réellement facturé par le moteur pour une denrée à un point.
 * Reproduit `RevenueEngine._prixAchat` sans dépendre d'un helper privé :
 * armes chez les gitans à 24 L, doses à moitié prix avec un labo.
 */
export function prixUnitaire(gs, pid, denree, pointId) {
  if (denree === 'armes') return SpecialEntities.getGitanArmesPrice(gs, pointId);
  if (denree === 'doses') return aUnLabo(gs, pid) ? Math.ceil(BUY_PRICE.doses / 2) : BUY_PRICE.doses;
  return BUY_PRICE[denree] || 0;
}

/**
 * Résumé d'un ordre pour la liste du panneau. Rendu en texte brut : l'appelant
 * l'échappe avant de l'insérer dans du HTML.
 *
 * @param {object} o ordre en attente
 * @param {object} [ctx] { gs, pid } pour calculer le coût réel d'un achat
 */
export function formatOrder(o, ctx = {}) {
  if (!o || typeof o !== 'object') return '';
  const { gs = null, pid = null } = ctx;
  switch (o.type) {
    case 'approvisionner': {
      const pu = prixUnitaire(gs, pid, o.denree, o.point);
      return `${o.quantite} ${o.denree} via ${o.point} (${o.quantite * pu}L)`;
    }
    case 'recruter':
      return `${libellePion(o.pion_type)} → ${o.zone_dest} (${BUY_PRICE[o.pion_type] || 0}L)`;
    case 'construire':
      return `${CONSTRUCTION_LABELS[o.batiment] || o.batiment} sur ${o.zone}`;
    case 'deplacer':
      return `${libellePion(o.pion_type)} ${o.from} → ${o.to}${o.eliminer ? ' 💀' : ''}`;
    case 'soutenir':
      return `🤝 ${o.pion_type} ${o.from} → soutient ${o.to}`;
    case 'creer_pion':
      return `Créer ${libellePion(o.pion_type)} sur ${o.zone}`;
    case 'deployer_flic':
      return `🚔 Flic → ${o.zone} (180L)`;
    case 'eliminer_flic':
      return `🚔 Éliminer flic sur ${o.zone} (${o.definitif ? '550L déf.' : '300L temp.'})`;
    default:
      return JSON.stringify(o);
  }
}
