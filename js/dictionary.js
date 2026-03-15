/**
 * Dictionnaire du jeu JORETAPO — pages d'information accessibles en modale
 */

export const DICT_ENTRIES = {
  tour: {
    title: 'Tour',
    content: `
      <p>Un <strong>tour</strong> représente un cycle complet des 5 phases du jeu.</p>
      <p>Chaque tour, chaque joueur dispose de <strong>5 ordres</strong> au total, répartis entre la phase 1 (approvisionnement, construction) et la phase 4 (déplacements, création de pions).</p>
      <p><strong>Tous les 7 tours</strong> : élections municipales, tirage de cartes magouille (8→4), et activation des gangs possible à partir du tour 7.</p>
    `
  },
  phase: {
    title: 'Phases du jeu',
    content: `
      <p>Chaque tour comporte <strong>5 phases</strong> :</p>
      <ol>
        <li><strong>Approvisionnement & construction</strong> — Commandes de denrées, constructions, transactions (ordres secrets)</li>
        <li><strong>Révélation & récolte</strong> — Révélation des ordres, récupération des commandes, calcul des revenus</li>
        <li><strong>Négociation</strong> — Discussion libre, contrats, alliances</li>
        <li><strong>Déplacements & création</strong> — Mouvements de pions, créations, cambriolages, flics, gangs (ordres secrets)</li>
        <li><strong>Résolution</strong> — Révélation des ordres, résolution des conflits</li>
      </ol>
    `
  },
  joueur: {
    title: 'Fiche joueur',
    content: `
      <p>Chaque joueur possède :</p>
      <ul>
        <li><strong>Lingots (L)</strong> — Monnaie du jeu</li>
        <li><strong>Armes</strong> — Pour créer des dealers, éliminer des pions</li>
        <li><strong>Doses</strong> — Drogue pour approvisionner les dealers</li>
        <li><strong>Cartes magouille</strong> — Effets spéciaux</li>
        <li><strong>Pions</strong> — Dealers, trafiquants, prostituées, flics sur la carte</li>
      </ul>
      <p>Le <strong>maire</strong> (🏛️) dispose de 2 privilèges par mandat.</p>
    `
  },
  pts: {
    title: 'Points de victoire',
    content: `
      <p><strong>Objectif</strong> : être le premier à atteindre <strong>55 points</strong>.</p>
      <table class="dict-table">
        <tr><th>Source</th><th>Pts</th></tr>
        <tr><td>Roi de la prostitution (8+ demoiselles)</td><td>10</td></tr>
        <tr><td>Roi du marché de la drogue (8+ dealers)</td><td>10</td></tr>
        <tr><td>Roi du marché des armes (6+ vendeurs)</td><td>10</td></tr>
        <tr><td>Être maire</td><td>15</td></tr>
        <tr><td>Être le plus riche (2000+ lingots)</td><td>10</td></tr>
        <tr><td>Chaque construction</td><td>1</td></tr>
        <tr><td>Quartier entier</td><td>3 à 15</td></tr>
      </table>
    `
  },
  lingots: {
    title: 'Budget (lingots)',
    content: `
      <p>Les <strong>lingots</strong> sont la monnaie du jeu.</p>
      <p><strong>Revenus</strong> : prostituées (1–3L/passe), dealers (3L/dose), trafiquants (8L/arme), constructions (bordels, casinos, labos).</p>
      <p><strong>Dépenses</strong> : commandes de denrées, constructions (Zurich Bank + bakchich police), création de pions, cartes magouille.</p>
      <p>À 2000 lingots, vous gagnez 10 pts de victoire (roi des richesses).</p>
    `
  },
  election: {
    title: 'Élections municipales',
    content: `
      <p>Les élections ont lieu <strong>tous les 7 tours</strong> (tours 7, 14, 21…).</p>
      <p>Chaque joueur vote secrètement pour un candidat. Le poids du vote dépend de la <strong>population</strong> contrôlée (zones avec pions armés ou constructions).</p>
      <p>Le vainqueur devient <strong>maire</strong> et obtient 2 privilèges : taxe, coupure électricité, repositionner flics, exproprier, déplacer gitans, placer incorruptible.</p>
    `
  },
  ressources: {
    title: 'Ressources (🔫💊🃏)',
    content: `
      <p><strong>🔫 Armes</strong> — Achat au port, péage ou camp gitans. Nécessaires pour créer des dealers, éliminer des pions.</p>
      <p><strong>💊 Doses</strong> — Drogue. Achat au port, aéroport, péage. Les dealers vendent 3L/dose.</p>
      <p><strong>🃏 Cartes magouille</strong> — Effets spéciaux. Pioche de 8, garde 4 à chaque élection.</p>
    `
  },

  approvisionnement: {
    title: 'Approvisionnement',
    content: `
      <p>Commandez des <strong>denrées</strong> (drogue, armes) aux points d'approvisionnement.</p>
      <table class="dict-table">
        <tr><th>Point</th><th>Doses</th><th>Armes</th><th>Notes</th></tr>
        <tr><td>Port</td><td>20</td><td>10</td><td></td></tr>
        <tr><td>Aéroport</td><td>10</td><td>—</td><td>+4 prostituées</td></tr>
        <tr><td>Péage</td><td>10</td><td>4</td><td>+1 prostituée</td></tr>
        <tr><td>Camp gitans</td><td>—</td><td>∞</td><td>Armes à 3× le prix (12L)</td></tr>
      </table>
      <p><strong>Prix</strong> : doses = 2L, armes = 4L (12L chez les gitans).</p>
      <p>Les <strong>administrations</strong> (ambassade, douanes, immigration) augmentent les plafonds si possédées.</p>
      <p>Chaque commande utilise <strong>1 ordre</strong>. Une seule ligne par denrée et par point.</p>
    `
  },

  recrutement: {
    title: 'Recruter une prostituée',
    content: `
      <p>Recrutez des prostituées aux points disposant de capacité (aéroport, péage).</p>
      <table class="dict-table">
        <tr><th>Type</th><th>Coût</th><th>Revenu</th></tr>
        <tr><td>Classique</td><td>40L</td><td>1L par passe/tour</td></tr>
        <tr><td>De luxe</td><td>80L</td><td>3L par passe/tour</td></tr>
      </table>
      <p><strong>Placement</strong> : sur une zone que vous contrôlez. Max 1 type de pion par case (les prostituées cohabitent avec les pions armés).</p>
      <p><strong>Capture</strong> : une prostituée non protégée (sans homme armé sur sa case) est capturée si un adversaire conquiert la case.</p>
      <p><strong>Roi de la prostitution</strong> : 10 pts de victoire avec 8+ demoiselles.</p>
    `
  },

  construction: {
    title: 'Construction',
    content: `
      <p>Construisez des bâtiments sur les zones que vous contrôlez.</p>
      <table class="dict-table">
        <tr><th>Bâtiment</th><th>Coût</th><th>Bakchich</th><th>Revenu</th><th>Prérequis</th></tr>
        <tr><td>Restaurant</td><td>40L</td><td>40L</td><td>14L/tour</td><td>—</td></tr>
        <tr><td>Tripot</td><td>100L</td><td>40L</td><td>14L/tour</td><td>—</td></tr>
        <tr><td>Labo</td><td>100L</td><td>40L</td><td>Prix drogue ÷2</td><td>6+ dealers</td></tr>
        <tr><td>Bordel</td><td>400L</td><td>40L</td><td>Variable</td><td>3 PL adjacentes</td></tr>
        <tr><td>Casino</td><td>400L</td><td>60L</td><td>60L/tour</td><td>Posséder un bordel</td></tr>
      </table>
      <p>Le coût est versé à la <strong>Zurich Bank</strong>, le bakchich à la <strong>police</strong>.</p>
      <p>Chaque construction rapporte <strong>1 pt de victoire</strong>. Pas de construction sur cimetières ou terrains de gitans.</p>
    `
  },

  deplacement: {
    title: 'Déplacement',
    content: `
      <p>Déplacez un pion vers une <strong>case adjacente</strong> (1 case par tour).</p>
      <p><strong>Supports</strong> : les pions armés qui ne bougent pas supportent automatiquement les alliés adjacents en conflit. Un pion supportant qui est lui-même attaqué voit son support <strong>coupé</strong>.</p>
      <h4>Résolution des conflits</h4>
      <ol>
        <li>Le camp avec le <strong>plus de supports non coupés</strong> l'emporte</li>
        <li><strong>Égalité</strong> = statu quo (personne ne bouge)</li>
        <li>Le <strong>vaincu</strong> fuit vers une case adjacente libre</li>
        <li><strong>Élimination payante</strong> : possible en payant le coût du pion + perte de 100k électeurs</li>
      </ol>
      <p><strong>Cohabitation</strong> : un seul pion armé (dealer ou trafiquant) par case. Les prostituées cohabitent.</p>
    `
  },

  creation_pion: {
    title: 'Créer un pion',
    content: `
      <p>Créez un dealer ou trafiquant sur une zone que vous contrôlez.</p>
      <table class="dict-table">
        <tr><th>Pion</th><th>Coût</th><th>Fonction</th><th>Roi avec…</th></tr>
        <tr><td>Dealer</td><td>40L + 2 armes</td><td>Vend drogue (3L/dose)</td><td>8+ → 10 pts</td></tr>
        <tr><td>Trafiquant</td><td>80L + 3 armes</td><td>Vend armes (8L/arme)</td><td>6+ → 10 pts</td></tr>
      </table>
      <p>Le coût est versé à la <strong>police</strong>. Le pion apparaît immédiatement.</p>
      <p><strong>Cohabitation</strong> : un seul pion armé par case, les prostituées peuvent cohabiter avec.</p>
    `
  },

  flic: {
    title: 'Flics',
    content: `
      <p>Les flics sont des pions spéciaux qui <strong>bloquent les revenus</strong> d'une zone.</p>
      <h4>Déployer un flic</h4>
      <p>Coût : <strong>160L</strong> (création) + <strong>20L</strong> (déplacement direct) = 180L. Max <strong>2 par joueur</strong>, <strong>7 au total</strong> dans la partie.</p>
      <h4>Éliminer un flic ennemi</h4>
      <table class="dict-table">
        <tr><th>Type</th><th>Coût</th><th>Effet</th></tr>
        <tr><td>Temporaire</td><td>300L</td><td>Retour à l'hôtel de police (redéployable)</td></tr>
        <tr><td>Définitif</td><td>550L</td><td>Retiré du jeu définitivement</td></tr>
      </table>
      <p>Chaque élimination de flic coûte <strong>100 000 électeurs</strong>.</p>
    `
  },

  incorruptible: {
    title: 'Incorruptibles',
    content: `
      <p>Max <strong>2</strong> dans la partie. Un incorruptible est <strong>infranchissable</strong> s'il est seul sur une zone (aucun autre pion).</p>
      <p><strong>Déplacer</strong> : 1000L (500L avec un bordel). Contrôlé par le système, pas par un joueur.</p>
      <p><strong>Éliminer</strong> : 700L — retiré <strong>définitivement</strong> du jeu.</p>
      <p>Le maire peut placer un incorruptible gratuitement avec un de ses privilèges.</p>
    `
  },

  gang: {
    title: 'Gangs',
    content: `
      <p>Chaque quartier possède un <strong>gang</strong> unique avec un effet spécial.</p>
      <h4>Conditions d'activation</h4>
      <ol>
        <li><strong>Contrôler toutes les zones</strong> du quartier (pion ou construction sur chaque case)</li>
        <li><strong>Après le tour 7</strong> — les gangs ne sont activables qu'après la première élection</li>
        <li>Utiliser <strong>1 action</strong> pendant la phase d'ordres de déplacement</li>
      </ol>
      <p>Chaque gang a un effet unique : bloquer les ventes, éliminer des pions, actions bonus, racket, etc.</p>
      <p>Certains gangs sont <strong>permanents</strong>, d'autres ont une durée limitée, d'autres sont instantanés.</p>
    `
  },

  cambriolage: {
    title: 'Cambriolages',
    content: `
      <p>Opérations risquées à haut rendement. Chaque cible a des <strong>prérequis stricts</strong>.</p>
      <table class="dict-table">
        <tr><th>Cible</th><th>Prérequis</th><th>Butin</th></tr>
        <tr><td>Zurich Bank</td><td>1 pion sur chaque annexe (×4), tous meurent</td><td>Tous les fonds</td></tr>
        <tr><td>Hôtel de Police</td><td>1 pion sur place + bordel + plus de flics que tous</td><td>50% des fonds</td></tr>
        <tr><td>Casino</td><td>11 hommes + PL + aéroport + casino + 3 cartes</td><td>Argent du propriétaire</td></tr>
        <tr><td>Labo</td><td>1 pion sur le labo + 20 armes + 2 cartes</td><td>Drogue du propriétaire</td></tr>
      </table>
      <p><strong>Coupure d'électricité</strong> = coût du cambriolage ÷2.</p>
    `
  },

  maire: {
    title: 'Pouvoirs du Maire',
    content: `
      <p>Le maire dispose de <strong>2 privilèges</strong> par mandat, à choisir parmi :</p>
      <table class="dict-table">
        <tr><th>Pouvoir</th><th>Phase</th><th>Effet</th></tr>
        <tr><td>Taxe 10%</td><td>Phase 1</td><td>Prélève 10% de l'argent de chaque joueur</td></tr>
        <tr><td>Coupure électricité</td><td>Phase 1</td><td>Bloque un quartier tout le mandat</td></tr>
        <tr><td>Repositionner flics</td><td>Phase 1</td><td>Déplace 3 flics où il veut</td></tr>
        <tr><td>Saisie argent</td><td>Phase 1</td><td>Saisie l'argent d'un joueur → police</td></tr>
        <tr><td>Saisie denrées</td><td>Phase 1</td><td>Saisie drogue + armes d'un joueur</td></tr>
        <tr><td>Déplacer gitans</td><td>Phase 1</td><td>Repositionne les camps de gitans</td></tr>
        <tr><td>Incorruptible</td><td>Phase 5</td><td>Place un incorruptible n'importe où</td></tr>
        <tr><td>Exproprier</td><td>Phase 5</td><td>Retire un joueur de 4 zones</td></tr>
      </table>
    `
  }
};

const DICT_INDEX_ORDER = [
  'tour', 'phase', 'joueur', 'pts', 'lingots', 'ressources', 'election',
  'approvisionnement', 'recrutement', 'construction', 'deplacement', 'creation_pion',
  'flic', 'incorruptible', 'gang', 'cambriolage', 'maire'
];

export function showDictionaryIndex() {
  const ov = document.getElementById('dict-ov');
  if (!ov) return;
  ov.querySelector('.dict-title').textContent = '📖 Dictionnaire du jeu';
  ov.querySelector('.dict-body').innerHTML = `
    <p style="color:#888;margin-bottom:16px">Cliquez sur un sujet pour afficher les détails.</p>
    <div class="dict-index">
      ${DICT_INDEX_ORDER.filter(id => DICT_ENTRIES[id]).map(id => {
        const e = DICT_ENTRIES[id];
        return `<button class="dict-index-item" data-dict="${id}">${e.title}</button>`;
      }).join('')}
    </div>
  `;
  ov.classList.remove('hidden');
  ov.querySelectorAll('.dict-index-item').forEach(btn => {
    btn.addEventListener('click', () => showDictionaryEntry(btn.dataset.dict));
  });
}

export function showDictionaryEntry(entryId, playerData = null) {
  const entry = DICT_ENTRIES[entryId];
  if (!entry) return;

  let content = entry.content;
  if (entryId === 'joueur' && playerData) {
    content = `<div class="dict-player-card" style="border-left-color:${playerData.couleur}">
      <strong>${playerData.nom}</strong> — ${playerData.quartier_origine || '?'}
      ${playerData.est_maire ? ' 🏛️ Maire' : ''}
    </div>` + entry.content;
  }

  const ov = document.getElementById('dict-ov');
  if (!ov) return;
  ov.querySelector('.dict-title').textContent = entry.title;
  ov.querySelector('.dict-body').innerHTML = `<p><button class="dict-back-link" type="button">← Retour à l'index</button></p>${content}`;
  ov.classList.remove('hidden');
  ov.querySelector('.dict-back-link')?.addEventListener('click', () => showDictionaryIndex());
}

export function initDictionaryOverlay() {
  const ov = document.getElementById('dict-ov');
  if (!ov) return;
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
  ov.querySelector('#dict-close')?.addEventListener('click', () => ov.classList.add('hidden'));
}
