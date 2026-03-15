import BoardRenderer from './board/BoardRenderer.js';
import PanZoom from './board/PanZoom.js';
import { FACILITE_LABELS, QUARTIER_COLORS } from './board/BoardData.js';

let boardRenderer = null;
let panZoom = null;
let boardData = null;

async function loadBoardData() {
  const resp = await fetch('data/quartiers.json');
  return resp.json();
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
}

function showBlockInfo(blocId) {
  const info = boardRenderer.getBlocInfo(blocId);
  if (!info) return;

  const panel = document.getElementById('block-info-panel');
  const quartier = info.quartier;
  const color = QUARTIER_COLORS[quartier.id] || '#666';

  document.getElementById('info-block-name').textContent = info.nom;

  const qLabel = document.getElementById('info-quartier');
  qLabel.textContent = quartier.nom + (quartier.points !== undefined ? ` (${quartier.points} pts)` : '');
  qLabel.style.background = color + '33';
  qLabel.style.color = color;

  const statsDiv = document.getElementById('info-stats');
  if (info.p !== undefined) {
    statsDiv.innerHTML = `
      <div class="stat-box"><div class="stat-label">Prost.</div><div class="stat-value">${info.p}</div></div>
      <div class="stat-box"><div class="stat-label">Drogue</div><div class="stat-value">${info.d}</div></div>
      <div class="stat-box"><div class="stat-label">Armes</div><div class="stat-value">${info.a}</div></div>
    `;
  } else {
    statsDiv.innerHTML = '';
  }

  const faciliteDiv = document.getElementById('info-facilite');
  if (info.facilite) {
    faciliteDiv.textContent = FACILITE_LABELS[info.facilite] || info.facilite;
    faciliteDiv.classList.remove('hidden');
  } else {
    faciliteDiv.classList.add('hidden');
  }

  const adjDiv = document.getElementById('info-adjacences');
  if (info.adjacences && info.adjacences.length) {
    const adjNames = info.adjacences.map(adjId => {
      const adj = boardRenderer.getBlocInfo(adjId);
      return adj ? adj.nom : adjId;
    });
    adjDiv.innerHTML = `<strong>Adjacent\u00e0 :</strong> ${adjNames.join(', ')}`;
  } else {
    adjDiv.innerHTML = '';
  }

  panel.classList.remove('hidden');
}

function hideBlockInfo() {
  document.getElementById('block-info-panel').classList.add('hidden');
}

async function init() {
  boardData = await loadBoardData();

  document.getElementById('btn-view-board').addEventListener('click', () => {
    showScreen('screen-board');
    if (!boardRenderer) {
      const svg = document.getElementById('board-svg');
      boardRenderer = new BoardRenderer(svg, boardData);
      boardRenderer.render();
      boardRenderer.onBlocSelect = showBlockInfo;
      panZoom = new PanZoom(svg);
    }
  });

  document.getElementById('btn-new-game').addEventListener('click', () => {
    showScreen('screen-board');
    if (!boardRenderer) {
      const svg = document.getElementById('board-svg');
      boardRenderer = new BoardRenderer(svg, boardData);
      boardRenderer.render();
      boardRenderer.onBlocSelect = showBlockInfo;
      panZoom = new PanZoom(svg);
    }
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    hideBlockInfo();
    showScreen('screen-title');
  });

  document.getElementById('btn-zoom-reset').addEventListener('click', () => {
    if (panZoom) panZoom.reset();
  });

  document.getElementById('btn-close-info').addEventListener('click', hideBlockInfo);
}

init();
