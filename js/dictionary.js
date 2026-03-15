/**
 * Dictionnaire du jeu JORETAPO — pages d'information accessibles en modale
 */

export const DICT_ENTRIES = {
  tour: {
    title: 'Tour',
    content: `
      <p>Un <strong>tour</strong> représente un cycle complet des 5 phases du jeu.</p>
      <p>Chaque tour, chaque joueur dispose de <strong>5 ordres</strong> au total, répartis entre la phase 1 (approvisionnement, construction) et la phase 4 (déplacements, création de pions).</p>
      <p><strong>Tous les 10 tours</strong> : élections municipales, tirage de cartes magouille (8→4), et activation des gangs possible à partir du tour 10.</p>
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
      <p>Les élections ont lieu <strong>tous les 10 tours</strong> (tours 10, 20, 30…).</p>
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
  }
};

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
  ov.querySelector('.dict-body').innerHTML = content;
  ov.classList.remove('hidden');
}

export function initDictionaryOverlay() {
  const ov = document.getElementById('dict-ov');
  if (!ov) return;
  ov.addEventListener('click', e => { if (e.target === ov) ov.classList.add('hidden'); });
  ov.querySelector('#dict-close')?.addEventListener('click', () => ov.classList.add('hidden'));
}
