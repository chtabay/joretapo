#!/usr/bin/env node
/**
 * Banc d'essai — joue des parties completes sans navigateur.
 *
 * Pourquoi. Le projet a ete construit sans jamais etre observe : pas un test, pas
 * une partie terminee, meme par son auteur. On ne pouvait donc rien affirmer sur la
 * duree d'une partie ni sur son equilibre, et toute correction de regle etait un
 * pari. Les moteurs ne touchant pas au DOM, on peut les piloter sous Node avec des
 * bots et transformer ces paris en mesures.
 *
 * Ce que l'outil mesure — et pourquoi ces indicateurs-la.
 *   duree              : une partie doit tenir dans une soiree. C'est la question
 *                        posee par l'auteur, et elle a une reponse chiffrable.
 *   premier conflit    : tant que personne ne se touche, quatre joueurs font quatre
 *                        reussites en parallele. C'est le meilleur predicteur de
 *                        l'ennui, et il ne se voit pas dans la duree.
 *   ecart au tour 6    : si le premier a deja trois fois les points du dernier a
 *                        mi-parcours, la fin de partie est jouee d'avance.
 *   zones reprises     : mesure si le territoire circule ou se fige.
 *
 * Les bots sont gloutons et sans finesse. Ils ne disent donc rien du plafond
 * strategique du jeu — mais ils disent tout du plancher : ce qu'un joueur obtient
 * en jouant l'evidence. Si meme eux ne finissent pas la partie, personne ne la finit.
 *
 * Usage :
 *   node tools/sim.mjs                    4 joueurs, 40 graines
 *   node tools/sim.mjs --joueurs 6        6 joueurs
 *   node tools/sim.mjs --graines 200      200 parties
 *   node tools/sim.mjs --detail           journal tour par tour de la 1re partie
 *   node tools/sim.mjs --json             sortie machine, pour la CI
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ── Aleatoire reproductible ───────────────────────────────────────────────
   Les moteurs appellent Math.random pour melanger l'ordre des joueurs. Sans
   graine, deux executions du banc donneraient des chiffres differents et il
   deviendrait impossible de dire si un changement de regle a eu un effet. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Substitut de localStorage : GameState sauvegarde a chaque transition de phase. */
if (!globalThis.localStorage) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => (store.has(String(k)) ? store.get(String(k)) : null),
    setItem: (k, v) => store.set(String(k), String(v)),
    removeItem: k => store.delete(String(k)),
    clear: () => store.clear()
  };
}

const { GameState } = await import(`${ROOT}/js/game-state.js`);
const { TurnManager, PHASE } = await import(`${ROOT}/js/turn-manager.js`);
const { RevenueEngine } = await import(`${ROOT}/js/revenue-engine.js`);
const { ConflictResolver } = await import(`${ROOT}/js/conflict-resolver.js`);
const { RULES } = await import(`${ROOT}/js/rules.js`);

const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const IS_ARMED = t => t === 'dealer' || t === 'trafiquant';
const COUT_PION = { dealer: { lingots: 40, armes: 2 }, trafiquant: { lingots: 80, armes: 3 } };

/* ── Le bot ────────────────────────────────────────────────────────────────
   Politique volontairement simple, dans cet ordre de priorite :
     1. nourrir les pions existants (sans stock, un dealer ne rapporte rien) ;
     2. s'etendre vers la zone libre adjacente la plus rentable ;
     3. attaquer une zone voisine tenue par un adversaire quand on peut la
        soutenir, sinon on n'attaque jamais et le jeu n'a aucun conflit. */

/* Equipements logistiques : ce sont des objectifs, pas des cases comme les
   autres. Les tenir donne la priorite sur leur stock et un peage sur ceux qui
   s'y servent — un bot qui l'ignore ne dirait rien de leur valeur. */
const FACILITES_APPRO = new Set(['port', 'peage', 'aeroport']);
const PRIME_EQUIPEMENT = 12;

class Bot {
  constructor(pid, gs, city, adj) {
    this.pid = pid; this.gs = gs; this.city = city; this.adj = adj;
  }

  /** Valeur d'une zone pour l'expansion : rendement, plus la prime d'equipement. */
  valeurZone(zid) {
    const zd = this.city.zones[zid];
    if (!zd) return 0;
    const prime = FACILITES_APPRO.has(zd.facilite) ? PRIME_EQUIPEMENT : 0;
    /* Un equipement deja tenu par un adversaire vaut encore plus : on lui coupe
       sa rente en meme temps qu'on prend la sienne. */
    const proprio = this.gs.plateau[zid]?.proprietaire;
    const arrache = prime && proprio !== null && proprio !== undefined && proprio !== this.pid ? prime / 2 : 0;
    return zd.d + zd.a + zd.p + prime + arrache;
  }

  get joueur() { return this.gs.joueurs[this.pid]; }

  mesZones() {
    return Object.entries(this.gs.plateau).filter(([, z]) => z.pions.some(p => p.joueur === this.pid));
  }

  besoins() {
    let doses = 0, armes = 0;
    Object.entries(this.gs.plateau).forEach(([zid, z]) => {
      const zd = this.city.zones[zid];
      if (!zd || !z.electricite) return;
      z.pions.forEach(p => {
        if (p.joueur !== this.pid) return;
        if (p.type === 'dealer') doses += zd.d;
        if (p.type === 'trafiquant') armes += zd.a;
      });
    });
    return { doses, armes };
  }

  /** Phase 1 : reapprovisionnement, puis construction si on est riche. */
  ordresAppro(budget) {
    const ordres = [];
    const j = this.joueur;
    /* Le bot ne commande qu'ou il a quelqu'un : meme contrainte que le joueur. */
    const points = RevenueEngine.pointsAccessibles(this.gs, this.pid, this.city, this.adj);
    const besoin = this.besoins();

    /* On vise de quoi nourrir les pions plus deux armes d'avance, sans quoi on ne
       pourra jamais creer le pion suivant : les armes servent aux deux. */
    const cibles = [
      { denree: 'armes', manque: Math.max(0, besoin.armes + 2 - j.ressources.armes), prix: 4 },
      { denree: 'doses', manque: Math.max(0, besoin.doses - j.ressources.doses), prix: 2 }
    ].filter(c => c.manque > 0);

    for (const c of cibles) {
      let reste = c.manque;
      /* On se sert d'abord chez soi : pas de peage, et on est servi en premier. */
      const ordreDesPoints = [...points].sort((a, b) => {
        const ma = this.gs.plateau[a.zone]?.proprietaire === this.pid ? 0 : 1;
        const mb = this.gs.plateau[b.zone]?.proprietaire === this.pid ? 0 : 1;
        return ma - mb;
      });
      for (const pt of ordreDesPoints) {
        if (ordres.length >= budget || reste <= 0) break;
        const stock = pt.caps[c.denree === 'armes' ? 'armes' : 'doses'] || 0;
        if (stock <= 0) continue;
        const abordable = Math.floor(j.ressources.lingots / c.prix);
        const qte = Math.min(reste, stock === Infinity ? reste : stock, abordable);
        if (qte <= 0) continue;
        ordres.push({ type: 'approvisionner', point: pt.zone, denree: c.denree, quantite: qte });
        reste -= qte;
      }
    }

    /* Construire : seulement quand la tresorerie le permet largement, sinon le bot
       se ruine et n'etend plus rien. */
    if (ordres.length < budget && j.ressources.lingots > 400) {
      const libre = this.mesZones().find(([, z]) => !z.construction);
      if (libre) {
        for (const bat of ['tripot', 'restaurant']) {
          if (RevenueEngine.canBuild(this.gs, this.pid, bat, this.adj).ok) {
            ordres.push({ type: 'construire', batiment: bat, zone: libre[0] });
            break;
          }
        }
      }
    }
    return ordres.slice(0, budget);
  }

  /** Phase 4 : creation, expansion, attaque. */
  ordresMouvement(budget) {
    const ordres = [];
    const j = this.joueur;
    const pris = new Set();      /* zones deja visees ce tour */
    const partis = new Set();    /* pions deja engages */

    const zonesArmees = this.mesZones().filter(([, z]) => z.pions.some(p => p.joueur === this.pid && IS_ARMED(p.type)));

    /* Frontiere : zones adjacentes aux miennes, classees par rendement. */
    const frontiere = new Map();
    this.mesZones().forEach(([zid]) => {
      (this.adj[zid] || []).forEach(v => {
        const z = this.gs.plateau[v];
        if (!z) return;
        const zd = this.city.zones[v];
        if (!zd) return;   /* iles : le bot ne s'y aventure pas */
        if (!frontiere.has(v)) frontiere.set(v, { depuis: [], valeur: this.valeurZone(v) });
        frontiere.get(v).depuis.push(zid);
      });
    });
    const cibles = [...frontiere.entries()].sort((a, b) => b[1].valeur - a[1].valeur);

    /* 1. Avancer sur les zones libres. */
    for (const [dest, info] of cibles) {
      if (ordres.length >= budget) break;
      const z = this.gs.plateau[dest];
      if (z.pions.some(p => IS_ARMED(p.type))) continue;
      if (pris.has(dest)) continue;
      const src = info.depuis.find(s => {
        if (partis.has(s)) return false;
        const zs = this.gs.plateau[s];
        const arme = zs.pions.find(p => p.joueur === this.pid && IS_ARMED(p.type));
        if (!arme) return false;
        /* On ne quitte pas une zone si c'est la seule chose qui la tient. */
        return zs.pions.filter(p => p.joueur === this.pid).length > 1 || this.mesZones().length > 2;
      });
      if (!src) continue;
      const arme = this.gs.plateau[src].pions.find(p => p.joueur === this.pid && IS_ARMED(p.type));
      ordres.push({ type: 'deplacer', from: src, to: dest, pion_type: arme.type });
      pris.add(dest); partis.add(src);
    }

    /* 2. Attaquer un voisin quand on peut esperer l'emporter : il faut au moins un
          pion immobile adjacent a la cible pour soutenir l'assaut. */
    for (const [dest, info] of cibles) {
      if (ordres.length >= budget) break;
      const z = this.gs.plateau[dest];
      const ennemi = z.pions.find(p => IS_ARMED(p.type) && p.joueur !== this.pid);
      if (!ennemi || pris.has(dest)) continue;
      const soutiens = (this.adj[dest] || []).filter(v =>
        !partis.has(v) && this.gs.plateau[v]?.pions.some(p => p.joueur === this.pid && IS_ARMED(p.type))
      );
      /* Un soutien pour l'assaut, un pour le pion qui part : il en faut deux.
         Sauf pour un equipement logistique : la prise vaut la priorite sur son
         stock, la fin du peage qu'on versait et le debut de celui qu'on percoit.
         On y va des qu'on a de quoi partir. */
      const estEquipement = FACILITES_APPRO.has(this.city.zones[dest]?.facilite);
      if (soutiens.length < (estEquipement ? 1 : 2)) continue;
      const src = soutiens.find(s => !partis.has(s));
      const arme = this.gs.plateau[src].pions.find(p => p.joueur === this.pid && IS_ARMED(p.type));
      ordres.push({ type: 'deplacer', from: src, to: dest, pion_type: arme.type });
      pris.add(dest); partis.add(src);
    }

    /* 3. Creer un pion sur une zone a soi qui n'en a pas. */
    while (ordres.length < budget) {
      const type = j.ressources.lingots >= 200 ? 'trafiquant' : 'dealer';
      const c = COUT_PION[type];
      if (j.ressources.lingots < c.lingots || j.ressources.armes < c.armes) break;
      const libre = this.mesZones().find(([zid, z]) =>
        !z.pions.some(p => IS_ARMED(p.type)) && !pris.has(zid));
      if (!libre) break;
      ordres.push({ type: 'creer_pion', pion_type: type, zone: libre[0] });
      pris.add(libre[0]);
      /* Le cout n'est preleve qu'a la resolution : on l'anticipe pour ne pas
         empiler des ordres que le joueur ne pourra pas payer. */
      j.ressources.lingots -= c.lingots; j.ressources.armes -= c.armes;
      ordres[ordres.length - 1]._reserve = c;
    }
    /* On rend ce qu'on a mis de cote : la resolution refera le calcul. */
    ordres.forEach(o => {
      if (o._reserve) { j.ressources.lingots += o._reserve.lingots; j.ressources.armes += o._reserve.armes; delete o._reserve; }
    });

    return ordres.slice(0, budget);
  }

  /** Vote : pour le joueur en tete parmi les autres, faute de mieux. */
  vote(candidats) {
    const scores = candidats.map(pid => ({ pid, pts: this.gs.getPlayerPoints(pid, this.city) }));
    scores.sort((a, b) => b.pts - a.pts);
    return scores[0]?.pid ?? candidats[0];
  }
}

/* ── Une partie ────────────────────────────────────────────────────────── */

function jouerPartie({ seed, nbJoueurs, city, adj, maxTours, detail }) {
  const rand = mulberry32(seed);
  const vraiRandom = Math.random;
  Math.random = rand;

  try {
    const dispo = city.quartiers.filter(q => q.disponible_au_lancement);
    /* Repartition des quartiers de depart variee d'une graine a l'autre. */
    const ordre = [...dispo].sort(() => rand() - 0.5).slice(0, nbJoueurs);
    const gs = GameState.create({
      joueurs: ordre.map((q, i) => ({ nom: `J${i}`, ethnie: 'caucasien', quartier_origine: q.id }))
    }, city);

    const tm = new TurnManager(gs, city);
    const bots = gs.joueurs.map((_, i) => new Bot(i, gs, city, adj));

    const m = {
      seed,
      quartiersDepart: ordre.map(q => q.id),
      tourVictoire: null,
      vainqueur: null,
      premierAccrochage: null,   /* deux joueurs visent la meme case libre */
      premierCombat: null,       /* on attaque une case tenue par un adversaire */
      pointsParTour: [],
      zonesReprises: 0,
      equipementsRepris: 0,      /* un port/peage/aeroport change de main */
      equipementsTenusFin: null, /* repartition en fin de partie */
      pointsFinaux: null,
      arret: 'max_tours'
    };
    let proprietairesPrec = null;
    let boucle = 0;
    const LIMITE = maxTours * 400;   /* garde-fou : un automate bloque ne doit pas pendre */

    tm.onChange = () => {};

    const relevePoints = () => gs.joueurs.map((_, i) => gs.getPlayerPoints(i, city));

    const finDeTour = () => {
      const pts = relevePoints();
      m.pointsParTour.push({ tour: gs.tour, points: pts });

      const proprios = Object.fromEntries(Object.entries(gs.plateau).map(([z, d]) => [z, d.proprietaire]));
      if (proprietairesPrec) {
        for (const [z, p] of Object.entries(proprios)) {
          const avant = proprietairesPrec[z];
          if (avant != null && p != null && avant !== p) {
            m.zonesReprises++;
            if (FACILITES_APPRO.has(city.zones[z]?.facilite)) m.equipementsRepris++;
          }
        }
      }
      proprietairesPrec = proprios;

      const max = Math.max(...pts);
      if (max >= SEUIL_VICTOIRE) {
        m.tourVictoire = gs.tour;
        m.vainqueur = pts.indexOf(max);
        m.arret = 'victoire';
        return true;
      }
      /* Fin dure : au dernier tour, le meneur l'emporte. */
      if (gs.tour >= maxTours) {
        m.tourVictoire = gs.tour;
        m.vainqueur = pts.indexOf(max);
        m.arret = 'fin_de_partie';
        return true;
      }
      return false;
    };

    tm.startTurn();

    while (boucle++ < LIMITE) {
      if (gs.tour > maxTours) { m.arret = 'max_tours'; break; }

      switch (tm.phase) {
        case PHASE.CURTAIN:
          tm.confirmCurtain();
          break;

        case PHASE.ORDERS_SUPPLY: {
          const pid = tm.currentPlayerId;
          tm.submitOrders(bots[pid].ordresAppro(tm.maxOrdersForPhase(pid)));
          break;
        }

        case PHASE.ORDERS_MOVE: {
          const pid = tm.currentPlayerId;
          tm.submitOrders(bots[pid].ordresMouvement(tm.maxOrdersForPhase(pid)));
          break;
        }

        case PHASE.REVEAL_HARVEST:
          RevenueEngine.processSupplyOrders(gs, tm.supplyOrders, city, adj);
          RevenueEngine.calculateRevenues(gs, city, adj);
          tm.continueFromReveal();
          break;

        case PHASE.NEGOTIATION:
          tm.endNegotiation();
          break;

        case PHASE.REVEAL_RESOLVE: {
          /* Deux situations tres differentes, que le journal du resolveur confond
             sous le meme type : deux joueurs qui convoitent la meme case VIDE, et
             un joueur qui attaque une case TENUE. Seule la seconde est un combat,
             et c'est elle qui dit si le jeu produit de la tension. On les distingue
             en regardant le plateau avant resolution. */
          const combats = [];
          Object.entries(tm.moveOrders).forEach(([pid, ordres]) => {
            (ordres || []).forEach(o => {
              if (o.type !== 'deplacer') return;
              const dest = gs.plateau[o.to];
              if (dest?.pions.some(p => IS_ARMED(p.type) && p.joueur !== Number(pid))) combats.push(o.to);
            });
          });
          const log = ConflictResolver.resolve(gs, tm.moveOrders, adj, city);
          if (m.premierAccrochage === null && log.some(l => l.type === 'conflict')) m.premierAccrochage = gs.tour;
          if (m.premierCombat === null && combats.length) m.premierCombat = gs.tour;
          if (detail) {
            const pts = relevePoints();
            const conflits = log.filter(l => l.type === 'conflict').length;
            console.log(`  T${String(gs.tour).padStart(2)}  points ${pts.join('/')}  ` +
              `zones ${gs.joueurs.map((_, i) => Object.values(gs.plateau).filter(z => z.proprietaire === i).length).join('/')}  ` +
              `lingots ${gs.joueurs.map(j => Math.round(j.ressources.lingots)).join('/')}  ` +
              `${conflits ? conflits + ' conflit(s)' : ''}`);
          }
          tm.continueFromReveal();
          break;
        }

        case PHASE.TURN_END:
          if (finDeTour()) { boucle = LIMITE; break; }
          tm.nextTurn();
          break;

        case PHASE.PRE_ELECTION: tm.confirmPreElection(); break;
        case PHASE.ELECTION_CURTAIN: tm.confirmElectionCurtain(); break;

        case PHASE.ELECTION_VOTE: {
          const pid = tm.currentPlayerId;
          /* candidatsPour exclut le votant : submitVote refuse l'auto-vote sans
             faire avancer la file, ce qui bloquerait l'automate. */
          tm.submitVote(bots[pid].vote(tm.candidatsPour(pid)));
          break;
        }

        case PHASE.ELECTION_RESULT: {
          const res = tm.getElectionResults(city);
          tm.applyElectionResult(res.winner);
          break;
        }

        case PHASE.DRAFT_CURTAIN: tm.confirmDraftCurtain(); break;

        case PHASE.DRAFT_PICK:
          /* Le draft de cartes est saisi par l'interface ; le banc le saute, les
             effets de cartes n'etant pas dans la boucle mesuree. */
          tm.submitDraftPick();
          break;

        default:
          m.arret = `phase_inconnue:${tm.phase}`;
          boucle = LIMITE;
      }

      if (boucle === LIMITE - 1) {
        /* On a atteint le garde-fou sans victoire ni fin de partie : l'automate
           tourne en rond. C'est un defaut, pas un resultat — il doit se voir. */
        m.arret = `BLOCAGE en phase ${tm.phase} au tour ${gs.tour}`;
      }
    }

    /* Qui tient les equipements a la fin : s'ils finissent tous chez le vainqueur,
       c'est qu'ils comptent ; s'ils restent chez qui les avait au depart, non. */
    const equip = Object.keys(city.zones).filter(z => FACILITES_APPRO.has(city.zones[z].facilite));
    m.equipementsTenusFin = equip.filter(z => gs.plateau[z].proprietaire !== null).length;
    m.equipementsTotal = equip.length;
    m.equipementsDuVainqueur = null;
    m.pointsFinaux = relevePoints();
    m.toursJoues = Math.min(gs.tour, maxTours);
    return m;
  } finally {
    Math.random = vraiRandom;
  }
}

/* ── Seuil de victoire ─────────────────────────────────────────────────────
   Lu depuis les regles si elles l'exposent, sinon la valeur historique. Le banc
   sert justement a le calibrer : il doit donc etre une variable, pas une constante
   dispersee dans le code. */
let SEUIL_VICTOIRE = RULES.victoire;

/* ── Agregation ────────────────────────────────────────────────────────── */

const mediane = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

function agreger(parties, maxTours) {
  const auSeuil = parties.filter(p => p.arret === 'victoire');
  const finies = parties.filter(p => p.arret === 'victoire' || p.arret === 'fin_de_partie');
  const combats = parties.map(p => p.premierCombat).filter(t => t !== null);
  const accrochages = parties.map(p => p.premierAccrochage).filter(t => t !== null);

  const ecarts = parties.map(p => {
    const t6 = p.pointsParTour.find(x => x.tour === 6) || p.pointsParTour[p.pointsParTour.length - 1];
    if (!t6) return null;
    const min = Math.min(...t6.points), max = Math.max(...t6.points);
    return min > 0 ? max / min : (max > 0 ? Infinity : 1);
  }).filter(x => x !== null && Number.isFinite(x));

  return {
    parties: parties.length,
    seuilVictoire: SEUIL_VICTOIRE,
    maxTours,
    tauxParties: finies.length / parties.length,
    tauxAuSeuil: auSeuil.length / parties.length,
    blocages: parties.filter(p => String(p.arret).startsWith('BLOCAGE')).length,
    tourVictoireMedian: mediane(finies.map(p => p.tourVictoire)),
    tourVictoireMin: finies.length ? Math.min(...finies.map(p => p.tourVictoire)) : null,
    tourVictoireMax: finies.length ? Math.max(...finies.map(p => p.tourVictoire)) : null,
    tauxCombat: combats.length / parties.length,
    premierCombatMedian: mediane(combats),
    tauxAccrochage: accrochages.length / parties.length,
    premierAccrochageMedian: mediane(accrochages),
    ecartT6Median: mediane(ecarts),
    zonesReprisesMoyen: parties.reduce((s, p) => s + p.zonesReprises, 0) / parties.length,
    equipementsReprisMoyen: parties.reduce((s, p) => s + p.equipementsRepris, 0) / parties.length,
    partiesAvecEquipementRepris: parties.filter(p => p.equipementsRepris > 0).length / parties.length,
    equipementsTenusMoyen: parties.reduce((s, p) => s + (p.equipementsTenusFin || 0), 0) / parties.length,
    equipementsTotal: parties[0]?.equipementsTotal || 0,
    pointsMaxMedian: mediane(parties.map(p => Math.max(...p.pointsFinaux)))
  };
}

/* ── Entree ────────────────────────────────────────────────────────────── */

function arg(nom, defaut) {
  const i = process.argv.indexOf(`--${nom}`);
  if (i === -1) return defaut;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const nbJoueurs = Number(arg('joueurs', 4));
const nbGraines = Number(arg('graines', 40));
const maxTours = Number(arg('tours', RULES.finDePartie));
const detail = !!arg('detail', false);
const json = !!arg('json', false);
SEUIL_VICTOIRE = Number(arg('seuil', RULES.victoire));

const city = readJson('data/quartiers-gameplay.json');
const adj = readJson('data/adjacences-osm.json');
/* Fusion des adjacences des iles, comme le fait le chargement de l'application. */
(city.iles || []).forEach(ile => {
  (ile.adjacences || []).forEach(a => {
    (adj[ile.id] ||= []).includes(a) || adj[ile.id].push(a);
    (adj[a] ||= []).includes(ile.id) || adj[a].push(ile.id);
  });
});

if (detail) console.log(`Journal de la partie (graine 1, ${nbJoueurs} joueurs) :`);

const parties = [];
for (let s = 1; s <= nbGraines; s++) {
  parties.push(jouerPartie({ seed: s, nbJoueurs, city, adj, maxTours, detail: detail && s === 1 }));
}
const r = agreger(parties, maxTours);

if (json) {
  console.log(JSON.stringify({ resume: r, parties }, null, 2));
} else {
  const pct = x => `${Math.round(x * 100)} %`;
  console.log('');
  console.log(`Banc d'essai — ${r.parties} parties, ${nbJoueurs} joueurs, victoire a ${SEUIL_VICTOIRE} points, ${maxTours} tours max`);
  console.log('');
  console.log(`  parties terminees          ${pct(r.tauxParties)}`);
  console.log(`  dont gagnees au seuil      ${pct(r.tauxAuSeuil)}   (le reste : meneur au dernier tour)`);
  if (r.blocages) console.log(`  BLOCAGES DE L'AUTOMATE     ${r.blocages}`);
  console.log(`  tour de victoire (median)  ${r.tourVictoireMedian ?? '—'}` +
    (r.tourVictoireMin ? `   (de ${r.tourVictoireMin} a ${r.tourVictoireMax})` : ''));
  console.log(`  points du premier (median) ${r.pointsMaxMedian}`);
  console.log('');
  console.log(`  parties avec un combat     ${pct(r.tauxCombat)}   (attaque d'une case tenue)`);
  console.log(`  premier combat (median)    tour ${r.premierCombatMedian ?? '—'}`);
  console.log(`  premier accrochage (med.)  tour ${r.premierAccrochageMedian ?? '—'}   (case libre disputee)`);
  console.log(`  zones reprises par partie  ${r.zonesReprisesMoyen.toFixed(1)}`);
  console.log(`  equipements repris         ${r.equipementsReprisMoyen.toFixed(1)} par partie · ${pct(r.partiesAvecEquipementRepris)} des parties`);
  console.log(`  equipements sous controle  ${r.equipementsTenusMoyen.toFixed(1)} sur ${r.equipementsTotal} en fin de partie`);
  console.log(`  ecart 1er/dernier au T6    x${r.ecartT6Median?.toFixed(2) ?? '—'}`);
  console.log('');
}

export { jouerPartie, agreger };
