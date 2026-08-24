/**
 * JORETAPO — Moteur des cartes Magouille.
 *
 * Règles de circulation du deck (voir docs/journal-decisions.md, 2026-08-23) :
 *   - Le deck compte 65 exemplaires (31 types x quantite). Les 5 entrées
 *     `culture` du JSON n'ont pas de `quantite` : elles ne sont pas distribuées.
 *   - Tirage tous les 7 tours : chaque joueur pioche 8 cartes et en garde 4.
 *   - Les cartes gardées valent POUR LA DURÉE DU MANDAT. Au tirage suivant,
 *     tout ce qui reste en main retourne à la défausse (recyclage) : sans ça le
 *     stock recyclable fondait de 4 x nbJoueurs par élection et la pioche se
 *     vidait (softlock du draft dès le tour 14 à 6 joueurs).
 *   - Le tirage est distribué en tour de table (round-robin) et la taille de
 *     main est identique pour tous : jamais 8 cartes pour l'un et 0 pour l'autre.
 *
 * Conventions du projet : classes statiques, retours { ok, msg, reason }.
 */

export class MagouilleEngine {

  /* ═══════════════════════════════════════════
   *  CONSTANTES DE TIRAGE
   * ═══════════════════════════════════════════ */

  /** Cartes piochées par joueur lors d'un tirage (spec 01, ligne 226). */
  static TAILLE_MAIN_DRAFT = 8;

  /** Cartes conservées par joueur sur une main pleine (spec 01, ligne 226). */
  static NB_CARTES_GARDEES = 4;

  /** Identifiant du quartier portant le gang « Lobby Juif ». */
  static QUARTIER_LOBBY_JUIF = 'jersey_city';

  /**
   * Combien de cartes garder pour une main de `tailleMain` cartes.
   * Main pleine (8) -> 4. Main écourtée -> moitié arrondie au supérieur.
   * L'UI DOIT utiliser cette valeur plutôt qu'un 4 en dur.
   */
  static nbCartesAGarder(tailleMain) {
    const t = Math.max(0, Math.floor(Number(tailleMain) || 0));
    if (t >= MagouilleEngine.TAILLE_MAIN_DRAFT) return MagouilleEngine.NB_CARTES_GARDEES;
    return Math.min(MagouilleEngine.NB_CARTES_GARDEES, Math.ceil(t / 2));
  }

  /* ═══════════════════════════════════════════
   *  CONSTRUCTION ET CIRCULATION DU DECK
   * ═══════════════════════════════════════════ */

  static buildDeck(cartesDef) {
    const deck = [];
    (cartesDef.types || []).forEach(type => {
      for (let i = 0; i < type.quantite; i++) {
        deck.push({ ...type, uid: `${type.id}_${i}` });
      }
    });
    return MagouilleEngine.shuffle(deck);
  }

  static shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * (Re)construit le deck. Idempotent et NON destructeur : les cartes déjà en
   * main et celles définitivement retirées du jeu ne sont pas réinjectées dans
   * la pile — sinon un même uid existerait en double (bug du garde-fou
   * « pile vide -> initDeck » de l'UI).
   */
  static initDeck(gs, cartesDef) {
    const deck = MagouilleEngine.buildDeck(cartesDef);

    gs._cartes_index = {};
    deck.forEach(c => { gs._cartes_index[c.uid] = c; });

    if (!gs.deck_magouille) gs.deck_magouille = { pile: [], defaussees: [], retirees_du_jeu: [] };
    const retirees = gs.deck_magouille.retirees_du_jeu || [];
    const horsCircuit = new Set([...retirees, ...MagouilleEngine._uidsEnMain(gs)]);

    gs.deck_magouille.pile = deck.map(c => c.uid).filter(uid => !horsCircuit.has(uid));
    gs.deck_magouille.defaussees = [];
    gs.deck_magouille.retirees_du_jeu = [...retirees];
  }

  /** Tous les uid actuellement dans la main d'un joueur. */
  static _uidsEnMain(gs) {
    const out = [];
    (gs.joueurs || []).forEach(j => { (j.cartes_magouille || []).forEach(uid => out.push(uid)); });
    return out;
  }

  /**
   * Pioche `count` cartes. Recycle la défausse quand la pile est vide.
   * Peut rendre MOINS que `count` si le circuit est réellement épuisé :
   * l'appelant doit tester `drawn.length` (voir draftPhase).
   */
  static drawCards(gs, pid, count, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const drawn = [];
    for (let i = 0; i < count; i++) {
      if (gs.deck_magouille.pile.length === 0) {
        gs.deck_magouille.pile = MagouilleEngine.shuffle([...gs.deck_magouille.defaussees]);
        gs.deck_magouille.defaussees = [];
      }
      if (gs.deck_magouille.pile.length === 0) break;
      drawn.push(gs.deck_magouille.pile.pop());
    }
    return drawn;
  }

  /**
   * Fin de mandat : toutes les cartes non jouées retournent à la défausse.
   * C'est la correction à la racine du softlock du tirage.
   * @returns {number} nombre de cartes recyclées
   */
  static recyclerMains(gs) {
    let n = 0;
    (gs.joueurs || []).forEach(j => {
      const main = j.cartes_magouille || [];
      main.forEach(uid => { gs.deck_magouille.defaussees.push(uid); n++; });
      j.cartes_magouille = [];
    });
    return n;
  }

  /**
   * Filet de sécurité : réinjecte dans la défausse tout uid connu de l'index
   * qui n'est ni en pile, ni en défausse, ni retiré du jeu, ni en main.
   * (Des cartes sont consommées ailleurs comme coût de cambriolage sans jamais
   * revenir dans le circuit — voir "coordination".)
   * @returns {number} nombre de cartes récupérées
   */
  static recupererCartesPerdues(gs) {
    if (!gs._cartes_index) return 0;
    const connues = new Set([
      ...gs.deck_magouille.pile,
      ...gs.deck_magouille.defaussees,
      ...(gs.deck_magouille.retirees_du_jeu || []),
      ...MagouilleEngine._uidsEnMain(gs)
    ]);
    let n = 0;
    Object.keys(gs._cartes_index).forEach(uid => {
      if (!connues.has(uid)) { gs.deck_magouille.defaussees.push(uid); n++; }
    });
    return n;
  }

  /** Photo du deck : utile aux tests et au diagnostic. */
  static statsDeck(gs) {
    const mains = MagouilleEngine._uidsEnMain(gs).length;
    const pile = gs.deck_magouille.pile.length;
    const defaussees = gs.deck_magouille.defaussees.length;
    const retirees = (gs.deck_magouille.retirees_du_jeu || []).length;
    return {
      pile, defaussees, retirees, mains,
      recyclable: pile + defaussees,
      total: pile + defaussees + retirees + mains
    };
  }

  /**
   * Tirage d'élection. Recycle les mains, récupère les cartes égarées, puis
   * distribue en tour de table une main de taille IDENTIQUE pour tous.
   *
   * @param {object} gs
   * @param {object} cartesDef
   * @param {object} [options] { recycler:boolean=true, taille:number }
   * @returns {Record<number, string[]>} uid piochés par joueur
   */
  static draftPhase(gs, cartesDef, options = {}) {
    MagouilleEngine._ensureIndex(gs, cartesDef);

    if (options.recycler !== false) {
      MagouilleEngine.recyclerMains(gs);
      MagouilleEngine.recupererCartesPerdues(gs);
    }

    const nbJoueurs = (gs.joueurs || []).length;
    const drafts = {};
    if (nbJoueurs === 0) return drafts;
    gs.joueurs.forEach((j, pid) => { drafts[pid] = []; });

    const recyclable = gs.deck_magouille.pile.length + gs.deck_magouille.defaussees.length;
    const souhaitee = Math.max(0, Math.floor(options.taille ?? MagouilleEngine.TAILLE_MAIN_DRAFT));
    const taille = Math.min(souhaitee, Math.floor(recyclable / nbJoueurs));

    for (let rang = 0; rang < taille; rang++) {
      for (let pid = 0; pid < nbJoueurs; pid++) {
        const c = MagouilleEngine.drawCards(gs, pid, 1, cartesDef);
        if (c.length) drafts[pid].push(c[0]);
      }
    }

    // Ne jamais laisser la pile vide : le garde-fou de l'UI reconstruirait le deck.
    if (gs.deck_magouille.pile.length === 0 && gs.deck_magouille.defaussees.length > 0) {
      gs.deck_magouille.pile = MagouilleEngine.shuffle([...gs.deck_magouille.defaussees]);
      gs.deck_magouille.defaussees = [];
    }

    return drafts;
  }

  /**
   * Conserve les cartes choisies. Le plafond suit la taille réelle de la main
   * si elle est fournie (main écourtée), sinon NB_CARTES_GARDEES.
   */
  static keepCards(gs, pid, keptUids, tailleMain = null) {
    const j = gs.joueurs[pid];
    if (!j.cartes_magouille) j.cartes_magouille = [];
    const plafond = tailleMain == null
      ? MagouilleEngine.NB_CARTES_GARDEES
      : MagouilleEngine.nbCartesAGarder(tailleMain);
    const kept = (keptUids || []).slice(0, plafond);
    j.cartes_magouille.push(...kept);
    return kept;
  }

  static discardFromDraft(gs, allDrawn, keptUids) {
    const keptSet = new Set(keptUids);
    (allDrawn || []).forEach(uid => {
      if (!keptSet.has(uid)) {
        gs.deck_magouille.defaussees.push(uid);
      }
    });
  }

  /* ═══════════════════════════════════════════
   *  CONDITIONS DE JOUABILITÉ
   * ═══════════════════════════════════════════ */

  static CONDITION_LABELS = {
    possede_homme_de_main: 'Posséder un homme de main',
    est_maire: 'Être maire',
    possede_cimetiere: 'Posséder un cimetière',
    possede_bordel: 'Posséder un bordel',
    possede_bordel_ou_maire: 'Posséder un bordel ou être maire',
    flics_en_reserve: 'Avoir un flic en réserve',
    possede_lobby_juif: 'Posséder le Lobby Juif'
  };

  static _possedeConstruction(gs, pid, batiment) {
    return Object.values(gs.plateau || {}).some(z =>
      z.construction === batiment && z.proprietaire === pid);
  }

  /**
   * @returns {boolean|null} true/false si la condition est évaluable,
   *                         null si elle dépend d'un contexte non disponible ici.
   */
  static _conditionRemplie(gs, pid, condition) {
    switch (condition) {
      case 'est_maire':
        return gs.maire?.joueur_id === pid;
      case 'possede_bordel':
        return MagouilleEngine._possedeConstruction(gs, pid, 'bordel');
      case 'possede_bordel_ou_maire':
        return gs.maire?.joueur_id === pid || MagouilleEngine._possedeConstruction(gs, pid, 'bordel');
      case 'possede_cimetiere':
        return MagouilleEngine._possedeConstruction(gs, pid, 'cimetiere');
      case 'possede_homme_de_main':
        return Object.values(gs.plateau || {}).some(z =>
          z.pions.some(p => p.joueur === pid && (p.type === 'dealer' || p.type === 'trafiquant')));
      case 'flics_en_reserve':
        return (gs.flics?.reserves || 0) > 0;
      case 'possede_lobby_juif':
        return gs.gangs_actifs?.[MagouilleEngine.QUARTIER_LOBBY_JUIF]?.joueur === pid;
      default:
        // Conditions dépendant du plateau/géométrie ou d'un événement du tour :
        // non évaluables ici, donc non bloquantes (voir "coordination").
        return null;
    }
  }

  static _verifierConditions(gs, pid, card) {
    const conditions = card.conditions || [];
    for (const c of conditions) {
      if (MagouilleEngine._conditionRemplie(gs, pid, c) === false) {
        const label = MagouilleEngine.CONDITION_LABELS[c] || c;
        return { ok: false, reason: `Condition non remplie : ${label}` };
      }
    }
    return { ok: true };
  }

  static _verifierCout(j, card) {
    const res = card.cout || {};
    if (res.lingots && j.ressources.lingots < res.lingots) return { ok: false, reason: `${res.lingots}L requis` };
    if (res.armes && j.ressources.armes < res.armes) return { ok: false, reason: `${res.armes} armes requises` };
    if (res.doses && j.ressources.doses < res.doses) return { ok: false, reason: `${res.doses} doses requises` };
    return { ok: true };
  }

  static canPlay(gs, pid, uid, currentPhase, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const card = gs._cartes_index[uid];
    if (!card) return { ok: false, reason: 'Carte inconnue' };

    const j = gs.joueurs[pid];
    if (!j) return { ok: false, reason: 'Joueur inconnu' };
    if (!j.cartes_magouille?.includes(uid)) return { ok: false, reason: 'Carte non en main' };

    if (currentPhase != null && card.phase_jouable !== 'any'
        && String(card.phase_jouable) !== String(currentPhase)) {
      return { ok: false, reason: `Jouable uniquement en phase ${card.phase_jouable}` };
    }

    const cout = MagouilleEngine._verifierCout(j, card);
    if (!cout.ok) return cout;

    return MagouilleEngine._verifierConditions(gs, pid, card);
  }

  /* ═══════════════════════════════════════════
   *  JEU D'UNE CARTE
   * ═══════════════════════════════════════════ */

  /**
   * Ordre strict : REVALIDER -> APPLIQUER -> PAYER -> DÉFAUSSER.
   * Une carte dont l'effet échoue n'est ni payée ni consommée.
   * `params.currentPhase` (optionnel) réactive le contrôle de phase.
   */
  static play(gs, pid, uid, params = {}, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const card = gs._cartes_index[uid];
    if (!card) return { ok: false, msg: 'Carte inconnue', reason: 'carte_inconnue' };

    const j = gs.joueurs[pid];
    if (!j) return { ok: false, msg: 'Joueur inconnu', reason: 'joueur_inconnu' };
    if (!(j.cartes_magouille || []).includes(uid)) {
      return { ok: false, msg: 'Carte non en main', reason: 'carte_non_en_main' };
    }

    const check = MagouilleEngine.canPlay(gs, pid, uid, params?.currentPhase ?? null, cartesDef);
    if (!check.ok) return { ok: false, msg: check.reason, reason: check.reason };

    const result = MagouilleEngine._applyEffect(gs, pid, card, params || {});
    if (!result || !result.ok) {
      return result || { ok: false, msg: 'Effet sans résultat', reason: 'effet_sans_resultat' };
    }

    const cost = card.cout || {};
    if (cost.lingots) j.ressources.lingots -= cost.lingots;
    if (cost.armes) j.ressources.armes -= cost.armes;
    if (cost.doses) j.ressources.doses -= cost.doses;

    const idx = j.cartes_magouille.indexOf(uid);
    if (idx !== -1) j.cartes_magouille.splice(idx, 1);

    if (card.repose_sous_pile) {
      gs.deck_magouille.defaussees.push(uid);
    } else {
      gs.deck_magouille.retirees_du_jeu.push(uid);
    }

    return result;
  }

  /* ═══════════════════════════════════════════
   *  COMPTEURS GLOBAUX
   * ═══════════════════════════════════════════ */

  /** Tient à jour gs.flics / gs.incorruptibles quand un pion quitte le plateau. */
  static _pionRetire(gs, zoneId, pion) {
    if (!pion) return;
    if (pion.type === 'flic') {
      if (gs.flics) {
        gs.flics.elimines = (gs.flics.elimines || 0) + 1;
        gs.flics.reserves = Math.max(0, (gs.flics.reserves || 0) - 1);
        const i = (gs.flics.deployes || []).indexOf(zoneId);
        if (i !== -1) gs.flics.deployes.splice(i, 1);
      }
    } else if (pion.type === 'incorruptible') {
      if (gs.incorruptibles) {
        gs.incorruptibles.elimines = (gs.incorruptibles.elimines || 0) + 1;
        const i = (gs.incorruptibles.deployes || []).indexOf(zoneId);
        if (i !== -1) gs.incorruptibles.deployes.splice(i, 1);
      }
    }
  }

  /* ═══════════════════════════════════════════
   *  EFFETS
   * ═══════════════════════════════════════════ */

  static _applyEffect(gs, pid, card, params) {
    const j = gs.joueurs[pid];

    switch (card.effet) {
      case 'tuer_pion': {
        const { zone, pionIdx } = params;
        const z = gs.plateau[zone];
        if (!z || pionIdx == null || !z.pions[pionIdx]) return { ok: false, msg: 'Cible invalide', reason: 'cible_invalide' };
        // Un incorruptible ne s'élimine qu'en payant les 700L de SpecialEntities.
        if (z.pions[pionIdx].type === 'incorruptible') {
          return { ok: false, msg: 'Un incorruptible ne peut pas être abattu par cette carte', reason: 'cible_incorruptible' };
        }
        const removed = z.pions.splice(pionIdx, 1)[0];
        MagouilleEngine._pionRetire(gs, zone, removed);
        return { ok: true, msg: `${removed.type} éliminé sur ${zone}` };
      }

      case 'retirer_electeurs': {
        const { cible } = params;
        const target = gs.joueurs[cible];
        if (!target || cible === pid) return { ok: false, msg: 'Cible invalide', reason: 'cible_invalide' };
        const amount = card.params?.electeurs || 100000;
        target.electeurs_malus = (target.electeurs_malus || 0) + amount;
        return { ok: true, msg: `${target.nom} perd ${(amount / 1000)}k électeurs` };
      }

      case 'regagner_electeurs': {
        const amount = card.params?.electeurs || 100000;
        if (!(j.electeurs_malus > 0)) {
          return { ok: false, msg: 'Aucun malus d\'électeurs à annuler', reason: 'aucun_malus' };
        }
        const rendu = Math.min(amount, j.electeurs_malus);
        j.electeurs_malus -= rendu;
        return { ok: true, msg: `${j.nom} regagne ${(rendu / 1000)}k électeurs` };
      }

      case 'gagner_lingots': {
        const amount = card.params?.lingots || 400;
        j.ressources.lingots += amount;
        return { ok: true, msg: `${j.nom} reçoit ${amount}L` };
      }

      case 'retirer_pion': {
        const { zone, pionIdx } = params;
        const z = gs.plateau[zone];
        if (!z || pionIdx == null || !z.pions[pionIdx]) return { ok: false, msg: 'Cible invalide', reason: 'cible_invalide' };
        const removed = z.pions.splice(pionIdx, 1)[0];
        MagouilleEngine._pionRetire(gs, zone, removed);
        return { ok: true, msg: `${removed.type} retiré de ${zone}` };
      }

      case 'teleporter_pion': {
        const { fromZone, pionIdx, toZone } = params;
        const from = gs.plateau[fromZone];
        const to = gs.plateau[toZone];
        if (!from || !to || pionIdx == null || !from.pions[pionIdx]) return { ok: false, msg: 'Déplacement invalide', reason: 'cible_invalide' };
        const pion = from.pions[pionIdx];
        if (pion.joueur !== pid) return { ok: false, msg: 'Ce n\'est pas votre pion', reason: 'pion_adverse' };
        from.pions.splice(pionIdx, 1);
        to.pions.push(pion);
        return { ok: true, msg: `${pion.type} téléporté de ${fromZone} vers ${toZone}` };
      }

      case 'couper_electricite': {
        const { quartierId, gameplayData } = params;
        const q = gameplayData?.quartiers?.find(x => x.id === quartierId);
        if (!q) return { ok: false, msg: 'Quartier invalide', reason: 'quartier_invalide' };
        const duree = card.params?.duree_tours || 3;
        q.zones.forEach(zid => { if (gs.plateau[zid]) gs.plateau[zid].electricite = false; });
        gs.coupures_electricite.push({
          quartier: quartierId, tour_debut: gs.tour, duree,
          tour_fin: gs.tour + duree, par: pid, source: 'carte'
        });
        return { ok: true, msg: `Électricité coupée dans ${q.nom} pour ${duree} tours` };
      }

      case 'piocher_caisse_police': {
        if (gs.maire.joueur_id !== pid) return { ok: false, msg: 'Vous n\'êtes pas maire', reason: 'pas_maire' };
        const amount = gs.caisses.hotel_police;
        if (amount <= 0) return { ok: false, msg: 'Les caisses de la police sont vides', reason: 'caisse_vide' };
        gs.caisses.hotel_police = 0;
        j.ressources.lingots += amount;
        const malus = card.params?.electeurs_malus || 500000;
        j.electeurs_malus = (j.electeurs_malus || 0) + malus;
        return { ok: true, msg: `${amount}L détournés des caisses de police (−${malus / 1000}k élect.)` };
      }

      case 'annuler_justice': {
        j._verges_actif = gs.tour;
        return { ok: true, msg: `Maître Vergès protège ${j.nom} ce tour` };
      }

      case 'racket_restaurants': {
        const parResto = card.params?.lingots_par_resto || 10;
        let total = 0;
        gs.joueurs.forEach((other, i) => {
          if (i === pid) return;
          let restoCount = 0;
          Object.values(gs.plateau).forEach(z => {
            if (z.construction === 'restaurant' && z.proprietaire === i) restoCount++;
          });
          const du = restoCount * parResto;
          // Le montant prélevé est mémorisé AVANT le débit : sinon des lingots
          // sortaient du jeu au lieu d'être encaissés.
          const pris = Math.min(du, other.ressources.lingots);
          other.ressources.lingots -= pris;
          total += pris;
        });
        j.ressources.lingots += total;
        return { ok: true, msg: `Roses connexion : ${total}L rackettés` };
      }

      case 'bonus_actions': {
        const bonus = card.params?.actions || 2;
        j.actions_bonus = (j.actions_bonus || 0) + bonus;
        return { ok: true, msg: `+${bonus} actions/tour jusqu'à la fin du mandat` };
      }

      case 'changer_ethnie': {
        const { ethnie } = card.params || {};
        if (!ethnie) return { ok: false, msg: 'Ethnie invalide', reason: 'ethnie_invalide' };
        if (j.ethnie === ethnie) return { ok: false, msg: `${j.nom} est déjà ${ethnie}`, reason: 'ethnie_identique' };
        const old = j.ethnie;
        j.ethnie = ethnie;
        // Durée « mandat » : on laisse la trace nécessaire à la restauration.
        if (card.duree && card.duree !== 'permanent') {
          j._ethnie_temporaire = { origine: old, duree: card.duree, tour_debut: gs.tour };
        } else {
          delete j._ethnie_temporaire;
        }
        return { ok: true, msg: `${j.nom} passe de ${old} à ${ethnie}` };
      }

      case 'retirer_flic_reserve': {
        if (gs.flics.reserves <= 0) return { ok: false, msg: 'Plus de flics en réserve', reason: 'pas_de_reserve' };
        gs.flics.reserves--;
        gs.flics.elimines++;
        return { ok: true, msg: `Un flic retiré du jeu (${gs.flics.reserves} en réserve)` };
      }

      case 'vendre_armes': {
        const prix = card.params?.prix_par_arme || 20;
        const qty = j.ressources.armes;
        if (qty <= 0) return { ok: false, msg: 'Pas d\'armes en stock', reason: 'pas_d_armes' };
        j.ressources.armes = 0;
        j.ressources.lingots += qty * prix;
        return { ok: true, msg: `${qty} armes vendues pour ${qty * prix}L` };
      }

      case 'deplacer_incorruptible': {
        const { fromZone, toZone } = params;
        const from = gs.plateau[fromZone];
        const to = gs.plateau[toZone];
        if (!from || !to) return { ok: false, msg: 'Zones invalides', reason: 'zone_invalide' };
        if (fromZone === toZone) return { ok: false, msg: 'Zones identiques', reason: 'zone_invalide' };
        const idx = from.pions.findIndex(p => p.type === 'incorruptible');
        if (idx === -1) return { ok: false, msg: 'Pas d\'incorruptible sur cette zone', reason: 'pas_d_incorruptible' };
        const inc = from.pions.splice(idx, 1)[0];
        to.pions.push(inc);
        if (gs.incorruptibles?.deployes) {
          const d = gs.incorruptibles.deployes.indexOf(fromZone);
          if (d !== -1) gs.incorruptibles.deployes[d] = toZone;
        }
        return { ok: true, msg: `Incorruptible déplacé de ${fromZone} vers ${toZone}` };
      }

      case 'deplacer_gitans': {
        const { zones } = params;
        if (!zones?.length) return { ok: false, msg: 'Aucune destination choisie', reason: 'zone_invalide' };
        if (zones.some(zid => !gs.plateau[zid])) return { ok: false, msg: 'Destination invalide', reason: 'zone_invalide' };
        Object.values(gs.plateau).forEach(z => { z.gitans = false; });
        zones.forEach(zid => { gs.plateau[zid].gitans = true; });
        gs.gitans.positions = [...zones];
        return { ok: true, msg: `Gitans déplacés vers ${zones.length} zone(s)` };
      }

      case 'rendre_ineligible': {
        const { cible } = params;
        if (cible == null || !gs.joueurs[cible]) return { ok: false, msg: 'Cible invalide', reason: 'cible_invalide' };
        if (cible === pid) return { ok: false, msg: 'Impossible de se rendre soi-même inéligible', reason: 'cible_invalide' };
        gs.joueurs[cible]._ineligible = true;
        return { ok: true, msg: `${gs.joueurs[cible].nom} est inéligible aux prochaines élections` };
      }

      case 'igor_nettoyeur': {
        j._igor_actif = true;
        return { ok: true, msg: `Igor protège ${j.nom}` };
      }

      case 'contaminer_prostituees': {
        const { zone } = params;
        const z = gs.plateau[zone];
        if (!z) return { ok: false, msg: 'Zone invalide', reason: 'zone_invalide' };
        const removed = [];
        const toCheck = [zone];
        const visited = new Set();
        while (toCheck.length) {
          const cur = toCheck.pop();
          if (visited.has(cur)) continue;
          visited.add(cur);
          const zd = gs.plateau[cur];
          if (!zd) continue;
          // La contagion ne se propage QUE depuis une zone effectivement
          // contaminée : sinon elle balayait tout le plateau connexe.
          let contamineeIci = 0;
          zd.pions = zd.pions.filter(p => {
            if (p.type === 'prostituee_base' || p.type === 'prostituee_luxe') {
              removed.push({ zone: cur, type: p.type });
              contamineeIci++;
              return false;
            }
            return true;
          });
          if (contamineeIci > 0) {
            const adj = params.adjacencies?.[cur] || [];
            adj.forEach(a => { if (!visited.has(a)) toCheck.push(a); });
          }
        }
        if (removed.length === 0) {
          return { ok: false, msg: 'Aucune prostituée sur cette zone', reason: 'aucune_cible' };
        }
        return { ok: true, msg: `${removed.length} prostituée(s) contaminée(s)` };
      }

      default:
        // Effets déclarés dans data/cartes-magouille.json mais pas encore codés
        // (chantier ultérieur). On refuse explicitement : plus aucun débit à vide.
        return {
          ok: false,
          reason: 'effet_non_implemente',
          msg: `« ${card.nom} » : effet « ${card.effet} » pas encore implémenté — carte conservée`
        };
    }
  }

  /* ═══════════════════════════════════════════
   *  INDEX DES CARTES
   * ═══════════════════════════════════════════ */

  static getCardDef(gs, uid, cartesDef) {
    MagouilleEngine._ensureIndex(gs, cartesDef);
    const indexed = gs._cartes_index?.[uid];
    if (!indexed) return null;
    const typeId = uid.replace(/_\d+$/, '');
    const fullType = cartesDef.types.find(t => t.id === typeId);
    if (fullType && fullType.texte_original && !indexed.texte_original) {
      indexed.texte_original = fullType.texte_original;
    }
    return indexed;
  }

  static _ensureIndex(gs, cartesDef) {
    if (gs._cartes_index && Object.keys(gs._cartes_index).length > 0) return;
    gs._cartes_index = {};
    (cartesDef?.types || []).forEach(type => {
      for (let i = 0; i < type.quantite; i++) {
        const uid = `${type.id}_${i}`;
        gs._cartes_index[uid] = { ...type, uid };
      }
    });
  }
}
