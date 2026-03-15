import { GameState } from './game-state.js';
import { MapRenderer, QUARTIER_COLORS, FACILITE_LABELS } from './map-renderer.js';
import { renderSetupScreen } from './setup.js';

let gameData = null;
let gameState = null;
let mapRenderer = null;

async function loadGameData() {
  const [geoRes, adjRes, gameRes] = await Promise.all([
    fetch('data/quartiers-osm.geojson').then(r => r.json()),
    fetch('data/adjacences-osm.json').then(r => r.json()),
    fetch('data/quartiers-gameplay.json').then(r => r.json())
  ]);

  const zoneToQuartier = {};
  gameRes.quartiers.forEach(q => {
    q.zones.forEach(z => { zoneToQuartier[z] = q; });
  });

  return {
    features: geoRes.features,
    adjacencies: adjRes,
    gameplay: gameRes,
    zoneToQuartier
  };
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(screenId);
  if (screen) screen.classList.add('active');
}

function renderTitleScreen() {
  showScreen('screen-title');
  const hasSave = GameState.hasSave();
  const btnContinue = document.getElementById('btn-continue');
  btnContinue.style.display = hasSave ? '' : 'none';

  document.getElementById('btn-new-game').onclick = () => {
    showScreen('screen-setup');
    renderSetupScreen(
      document.getElementById('setup-container'),
      gameData.gameplay,
      onGameStart
    );
  };

  btnContinue.onclick = () => {
    gameState = GameState.load();
    if (gameState) {
      showScreen('screen-game');
      renderGameScreen();
    }
  };

  document.getElementById('btn-map-only').onclick = () => {
    showScreen('screen-game');
    gameState = null;
    renderGameScreen();
  };
}

function onGameStart(config) {
  gameState = GameState.create(config, gameData.gameplay);
  gameState.save();
  showScreen('screen-game');
  renderGameScreen();
}

function renderGameScreen() {
  const mapContainer = document.getElementById('map-container');
  mapRenderer = new MapRenderer(mapContainer, gameData);

  if (gameState) {
    mapRenderer.updateOwnership(gameState);
    mapRenderer.renderPions(gameState);
    renderGameHUD();
  } else {
    renderExploreHUD();
  }

  mapRenderer.onZoneSelect = (id) => renderInfoPanel(id);
}

function renderGameHUD() {
  const hud = document.getElementById('stats');
  hud.innerHTML = `
    <h3>JORETAPO — Tour ${gameState.tour}</h3>
    <div id="stats-content">
      <div class="hud-phase">Phase ${gameState.phase}/5</div>
      <div class="hud-players">
        ${gameState.joueurs.map(j => {
          const pts = gameState.getPlayerPoints(j.id, gameData.gameplay);
          return `<div class="hud-player">
            <span class="hud-player-dot" style="background:${j.couleur}"></span>
            <span>${j.nom}</span>
            <span class="hud-player-pts">${pts} pts</span>
            <span class="hud-player-gold">${j.ressources.lingots} L</span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

function renderExploreHUD() {
  const totalPts = gameData.gameplay.quartiers.reduce((s, q) => s + q.points, 0);
  const adjCount = Object.values(gameData.adjacencies).reduce((s, a) => s + a.length, 0) / 2;
  const availCount = gameData.gameplay.quartiers.filter(q => q.disponible_au_lancement).length;
  const hud = document.getElementById('stats');
  hud.innerHTML = `
    <h3>JORETAPO</h3>
    <div id="stats-content">
      <strong>${gameData.features.length}</strong> zones · <strong>15</strong> quartiers<br>
      <strong>${Math.round(adjCount)}</strong> adjacences · <strong>${totalPts}</strong> pts<br>
      <strong>${availCount}</strong> dispo · <strong>4</strong> îles
    </div>`;
}

function renderInfoPanel(id) {
  const panel = document.getElementById('info-panel');
  if (!id) {
    panel.classList.add('hidden');
    return;
  }

  const f = gameData.features.find(f => f.properties.id === id);
  const adj = gameData.adjacencies[id] || [];
  const q = gameData.zoneToQuartier[id];
  const zoneData = gameData.gameplay.zones[id];

  document.getElementById('info-name').textContent = zoneData ? zoneData.nom : f.properties.nom;
  document.getElementById('info-id').textContent = id;

  const qBadge = document.getElementById('info-quartier');
  if (q) {
    const colors = QUARTIER_COLORS[q.id];
    qBadge.textContent = q.nom;
    qBadge.style.background = colors.fill;
    qBadge.style.color = colors.stroke;
    qBadge.style.border = `1px solid ${colors.stroke}`;
  }

  const faciliteEl = document.getElementById('info-facilite');
  faciliteEl.innerHTML = zoneData?.facilite
    ? `<span class="facilite-tag">${FACILITE_LABELS[zoneData.facilite] || zoneData.facilite}</span>`
    : '';

  const indicesEl = document.getElementById('info-indices');
  if (zoneData) {
    indicesEl.innerHTML = `
      <div class="index-box" style="background:rgba(200,100,150,0.2);color:#f8a0c8">
        ${zoneData.p}<div class="index-label">Prost.</div>
      </div>
      <div class="index-box" style="background:rgba(100,200,100,0.2);color:#a0f8a0">
        ${zoneData.d}<div class="index-label">Drogue</div>
      </div>
      <div class="index-box" style="background:rgba(150,150,200,0.2);color:#a0a0f8">
        ${zoneData.a}<div class="index-label">Armes</div>
      </div>`;
  }

  const statsEl = document.getElementById('info-stats');
  if (q) {
    statsEl.innerHTML = `
      <div class="section-title">Quartier : ${q.nom}</div>
      <div class="stat-row"><span class="stat-label">Zones</span><span class="stat-value">${q.zones.length}</span></div>
      <div class="stat-row"><span class="stat-label">Points victoire</span><span class="stat-value">${q.points}</span></div>
      <div class="stat-row"><span class="stat-label">Dispo lancement</span><span class="stat-value">${q.disponible_au_lancement ? 'Oui' : 'Non'}</span></div>
      <div class="stat-row"><span class="stat-label">Pop. / zone</span><span class="stat-value">${(q.population_par_zone / 1000).toFixed(0)}k</span></div>`;
  } else {
    statsEl.innerHTML = '';
  }

  const gangEl = document.getElementById('info-gang');
  if (q) {
    const g = q.gang;
    const dureeText = g.duree === -1 ? 'permanent' : g.duree === 0 ? 'instantané' : `${g.duree} tours`;
    gangEl.innerHTML = `
      <div class="gang-name">${g.nom}</div>
      <div>Effet : ${g.effet.replace(/_/g, ' ')}</div>
      <div>Durée : ${dureeText} · ${g.usage_unique ? 'usage unique' : 'réutilisable'}</div>`;
  } else {
    gangEl.innerHTML = '';
  }

  if (gameState) {
    const zone = gameState.plateau[id];
    const gameInfoEl = document.getElementById('info-game');
    if (zone && zone.pions.length > 0) {
      gameInfoEl.innerHTML = `
        <div class="section-title">Pions présents</div>
        ${zone.pions.map(p => {
          const j = gameState.joueurs[p.joueur];
          return `<div class="stat-row">
            <span class="stat-label" style="color:${j.couleur}">${j.nom}</span>
            <span class="stat-value">${p.type.replace(/_/g, ' ')}</span>
          </div>`;
        }).join('')}`;
    } else {
      gameInfoEl.innerHTML = '';
    }
  }

  const adjEl = document.getElementById('info-adj');
  adjEl.innerHTML = adj.length
    ? `<div class="section-title">Adjacences (${adj.length})</div>` +
      adj.map(a => `<span onclick="window._selectZone('${a}')">${a}</span>`).join('')
    : '<em>Aucune adjacence</em>';

  panel.classList.remove('hidden');
}

function renderLegend() {
  const legendEl = document.getElementById('legend-items');
  legendEl.innerHTML = '';
  let highlightedQ = null;

  gameData.gameplay.quartiers.forEach(q => {
    const colors = QUARTIER_COLORS[q.id];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-swatch" style="background:${colors.fill};border-color:${colors.stroke}"></div>` +
      `<span>${q.nom}</span><span class="legend-info">${q.zones.length}z · ${q.points}pts</span>`;

    item.addEventListener('click', () => {
      if (highlightedQ === q.id) {
        highlightedQ = null;
        mapRenderer.highlightQuartier(null);
        legendEl.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
      } else {
        highlightedQ = q.id;
        mapRenderer.highlightQuartier(q.id);
        legendEl.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
      }
    });
    legendEl.appendChild(item);
  });
}

window._selectZone = (id) => {
  if (mapRenderer) mapRenderer.selectZone(id);
};

document.addEventListener('DOMContentLoaded', async () => {
  gameData = await loadGameData();
  renderTitleScreen();
  renderLegend();
});
