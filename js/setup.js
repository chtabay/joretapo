import { PLAYER_COLORS, ETHNIES } from './game-state.js';
import { QUARTIER_COLORS } from './map-renderer.js';

const ETHNIE_LABELS = {
  caucasien: 'Caucasien', afro_americain: 'Afro-américain',
  asiatique: 'Asiatique', italien: 'Italien'
};

export function renderSetupScreen(container, gameplay, onStart) {
  renderWelcomeScreen(container, gameplay, onStart);
}

function renderWelcomeScreen(container, gameplay, onStart) {
  container.innerHTML = `
    <div class="game-intro">
      <h1>JORETAPO</h1>
      <div class="game-intro-tagline">Jeu de plateau satirique — NYC & NJ</div>
      <div class="game-intro-desc">
        Prenez le contrôle des quartiers, bâtissez votre empire criminel,
        manipulez les élections et devenez le maître de la ville.
        <strong>Premier à 55 points</strong> remporte la partie.
      </div>
      <div class="game-intro-features">
        <div class="game-intro-feat"><span class="game-intro-feat-icon">🗺️</span><div class="game-intro-feat-text"><span class="game-intro-feat-title">15 quartiers</span><span class="game-intro-feat-sub">Contrôlez des zones, construisez, dominez</span></div></div>
        <div class="game-intro-feat"><span class="game-intro-feat-icon">🗳️</span><div class="game-intro-feat-text"><span class="game-intro-feat-title">Élections tous les 7 tours</span><span class="game-intro-feat-sub">Devenez maire pour 15 pts</span></div></div>
        <div class="game-intro-feat"><span class="game-intro-feat-icon">🃏</span><div class="game-intro-feat-text"><span class="game-intro-feat-title">Cartes magouille</span><span class="game-intro-feat-sub">Effets spéciaux dévastateurs</span></div></div>
        <div class="game-intro-feat"><span class="game-intro-feat-icon">⚔️</span><div class="game-intro-feat-text"><span class="game-intro-feat-title">5 phases par tour</span><span class="game-intro-feat-sub">Ordres secrets, négociations, conflits</span></div></div>
        <div class="game-intro-feat"><span class="game-intro-feat-icon">💰</span><div class="game-intro-feat-text"><span class="game-intro-feat-title">Économie complète</span><span class="game-intro-feat-sub">Lingots, armes, doses, constructions</span></div></div>
        <div class="game-intro-feat"><span class="game-intro-feat-icon">🔫</span><div class="game-intro-feat-text"><span class="game-intro-feat-title">Gangs & conflits</span><span class="game-intro-feat-sub">Dealers, trafiquants, flics, gangs</span></div></div>
      </div>
      <div class="game-intro-rules">2 à 6 joueurs · Hotseat (une tablette pour tous) · Parties de 1 à 3 heures</div>
      <button class="btn-primary" id="btn-intro-continue" style="padding:14px 48px;font-size:18px">Configurer la partie</button>
    </div>
  `;
  container.querySelector('#btn-intro-continue').addEventListener('click', () => {
    renderPlayerSetup(container, gameplay, onStart);
  });
}

function renderPlayerSetup(container, gameplay, onStart) {
  let nbJoueurs = 4;
  let joueurs = [];

  function initJoueurs() {
    joueurs = [];
    for (let i = 0; i < nbJoueurs; i++) {
      joueurs.push({
        nom: `Joueur ${i + 1}`,
        couleur: PLAYER_COLORS[i],
        ethnie: ETHNIES[i % ETHNIES.length],
        quartier_origine: null
      });
    }
  }

  initJoueurs();

  function render() {
    container.innerHTML = `
      <div class="setup-screen">
        <div class="setup-header">
          <h1>JORETAPO</h1>
          <p class="setup-subtitle">Configuration de la partie</p>
        </div>

        <div class="setup-section">
          <label class="setup-label">Nombre de joueurs</label>
          <div class="nb-joueurs-selector">
            ${[2, 3, 4, 5, 6].map(n => `
              <button class="nb-btn ${n === nbJoueurs ? 'active' : ''}" data-nb="${n}">${n}</button>
            `).join('')}
          </div>
        </div>

        <div class="setup-section">
          <label class="setup-label">Joueurs</label>
          <div class="joueurs-list">
            ${joueurs.map((j, i) => `
              <div class="joueur-card" style="border-left: 4px solid ${j.couleur}">
                <div class="joueur-card-row">
                  <input type="text" class="joueur-nom" data-idx="${i}" value="${j.nom}" placeholder="Nom du joueur" />
                  <input type="color" class="joueur-color" data-idx="${i}" value="${j.couleur}" />
                </div>
                <div class="joueur-card-row">
                  <select class="joueur-ethnie" data-idx="${i}">
                    ${ETHNIES.map(e => `<option value="${e}" ${e === j.ethnie ? 'selected' : ''}>${ETHNIE_LABELS[e]}</option>`).join('')}
                  </select>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <button class="btn-primary" id="btn-next">Choisir les quartiers</button>
      </div>
    `;

    container.querySelectorAll('.nb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        nbJoueurs = parseInt(btn.dataset.nb);
        initJoueurs();
        render();
      });
    });

    container.querySelectorAll('.joueur-nom').forEach(input => {
      input.addEventListener('input', () => {
        joueurs[parseInt(input.dataset.idx)].nom = input.value;
      });
    });

    container.querySelectorAll('.joueur-color').forEach(input => {
      input.addEventListener('input', () => {
        const idx = parseInt(input.dataset.idx);
        joueurs[idx].couleur = input.value;
        input.closest('.joueur-card').style.borderLeftColor = input.value;
      });
    });

    container.querySelectorAll('.joueur-ethnie').forEach(sel => {
      sel.addEventListener('change', () => {
        joueurs[parseInt(sel.dataset.idx)].ethnie = sel.value;
      });
    });

    container.querySelector('#btn-next').addEventListener('click', () => {
      renderDraftScreen(container, gameplay, joueurs, onStart);
    });
  }

  render();
}

function renderDraftScreen(container, gameplay, joueurs, onStart) {
  const available = gameplay.quartiers.filter(q => q.disponible_au_lancement);
  const chosen = new Array(joueurs.length).fill(null);
  let currentPicker = 0;

  function render() {
    const pickerJoueur = joueurs[currentPicker];
    const takenIds = chosen.filter(Boolean);

    container.innerHTML = `
      <div class="setup-screen">
        <div class="setup-header">
          <h1>Draft des quartiers</h1>
          <p class="setup-subtitle">
            <span class="draft-player-indicator" style="background:${pickerJoueur.couleur}">${pickerJoueur.nom}</span>
            choisit son quartier d'origine
          </p>
        </div>

        <div class="draft-progress">
          ${joueurs.map((j, i) => `
            <div class="draft-slot ${i === currentPicker ? 'active' : ''} ${chosen[i] ? 'done' : ''}">
              <div class="draft-slot-color" style="background:${j.couleur}"></div>
              <span>${j.nom}</span>
              ${chosen[i] ? `<span class="draft-slot-quartier">${gameplay.quartiers.find(q => q.id === chosen[i])?.nom || ''}</span>` : ''}
            </div>
          `).join('')}
        </div>

        <div class="setup-section">
          <label class="setup-label">Quartiers disponibles</label>
          <div class="quartiers-grid">
            ${available.map(q => {
              const taken = takenIds.includes(q.id);
              const colors = QUARTIER_COLORS[q.id];
              return `
                <button class="quartier-pick-btn ${taken ? 'taken' : ''}"
                        data-qid="${q.id}" ${taken ? 'disabled' : ''}
                        style="border-color:${colors.stroke};${taken ? 'opacity:0.3' : ''}">
                  <div class="qpb-swatch" style="background:${colors.fill}"></div>
                  <div class="qpb-info">
                    <strong>${q.nom}</strong>
                    <span>${q.zones.length} zones · ${q.points} pts · ${q.gang.nom}</span>
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;

    container.querySelectorAll('.quartier-pick-btn:not(.taken)').forEach(btn => {
      btn.addEventListener('click', () => {
        chosen[currentPicker] = btn.dataset.qid;
        joueurs[currentPicker].quartier_origine = btn.dataset.qid;

        currentPicker++;
        if (currentPicker < joueurs.length) {
          render();
        } else {
          renderConfirmScreen(container, gameplay, joueurs, onStart);
        }
      });
    });
  }

  render();
}

function renderConfirmScreen(container, gameplay, joueurs, onStart) {
  container.innerHTML = `
    <div class="setup-screen">
      <div class="setup-header">
        <h1>Prêts à jouer !</h1>
        <p class="setup-subtitle">${joueurs.length} joueurs · Tour 1</p>
      </div>

      <div class="confirm-players">
        ${joueurs.map(j => {
          const q = gameplay.quartiers.find(q => q.id === j.quartier_origine);
          const colors = QUARTIER_COLORS[j.quartier_origine];
          return `
            <div class="confirm-card" style="border-left: 4px solid ${j.couleur}">
              <div class="confirm-name">${j.nom}</div>
              <div class="confirm-details">
                ${ETHNIE_LABELS[j.ethnie]} ·
                <span style="color:${colors?.stroke || '#888'}">${q?.nom || '?'}</span> ·
                ${q?.gang.nom || ''}
              </div>
              <div class="confirm-resources">
                ${q?.privileges_depart ? `${q.privileges_depart.lingots} lingots · ${q.privileges_depart.armes} armes · ${q.privileges_depart.doses} doses` : 'Pas de privilèges'}
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="confirm-buttons">
        <button class="btn-secondary" id="btn-back">Modifier</button>
        <button class="btn-primary" id="btn-launch">Lancer la partie</button>
      </div>
    </div>
  `;

  container.querySelector('#btn-back').addEventListener('click', () => {
    renderDraftScreen(container, gameplay, joueurs, onStart);
  });

  container.querySelector('#btn-launch').addEventListener('click', () => {
    onStart({
      nb_joueurs: joueurs.length,
      joueurs
    });
  });
}
