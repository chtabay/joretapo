import { GameState } from './game-state.js';
import { MapRenderer, QUARTIER_COLORS, FACILITE_LABELS } from './map-renderer.js';
import { renderSetupScreen } from './setup.js';
import { TurnManager, PHASE, GAME_PHASE_LABELS } from './turn-manager.js';
import { RevenueEngine, BUY_PRICE, CONSTRUCTION_DEFS } from './revenue-engine.js';
import { ConflictResolver } from './conflict-resolver.js';

let gameData = null;
let gameState = null;
let mapRenderer = null;
let turnManager = null;
let pendingOrders = [];

async function loadGameData() {
  const [geoRes, adjRes, gameRes] = await Promise.all([
    fetch('data/quartiers-osm.geojson').then(r => r.json()),
    fetch('data/adjacences-osm.json').then(r => r.json()),
    fetch('data/quartiers-gameplay.json').then(r => r.json())
  ]);
  const zoneToQuartier = {};
  gameRes.quartiers.forEach(q => { q.zones.forEach(z => { zoneToQuartier[z] = q; }); });
  return { features: geoRes.features, adjacencies: adjRes, gameplay: gameRes, zoneToQuartier };
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function hideAllOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
  document.getElementById('order-panel')?.classList.add('hidden');
}

/* ── Title Screen ── */
function renderTitleScreen() {
  showScreen('screen-title');
  const hasSave = GameState.hasSave();
  const btnCont = document.getElementById('btn-continue');
  btnCont.style.display = hasSave ? '' : 'none';
  document.getElementById('btn-new-game').onclick = () => {
    showScreen('screen-setup');
    renderSetupScreen(document.getElementById('setup-container'), gameData.gameplay, onGameStart);
  };
  btnCont.onclick = () => {
    gameState = GameState.load();
    if (gameState) { showScreen('screen-game'); renderGameScreen(); startTurnLoop(); }
  };
  document.getElementById('btn-map-only').onclick = () => {
    showScreen('screen-game'); gameState = null; renderGameScreen();
  };
}

function onGameStart(config) {
  gameState = GameState.create(config, gameData.gameplay);
  gameState.save();
  showScreen('screen-game');
  renderGameScreen();
  startTurnLoop();
}

/* ── Map + base game screen ── */
function renderGameScreen() {
  const mc = document.getElementById('map-container');
  mapRenderer = new MapRenderer(mc, gameData);
  if (gameState) {
    mapRenderer.updateOwnership(gameState);
    mapRenderer.renderPions(gameState);
  }
  mapRenderer.onZoneSelect = id => renderInfoPanel(id);
  renderLegend();
  updateHUD();
}

function updateHUD() {
  const hud = document.getElementById('stats');
  if (!gameState) {
    const totalPts = gameData.gameplay.quartiers.reduce((s, q) => s + q.points, 0);
    const adjCount = Object.values(gameData.adjacencies).reduce((s, a) => s + a.length, 0) / 2;
    hud.innerHTML = `<h3>JORETAPO</h3><div id="stats-content"><strong>${gameData.features.length}</strong> zones · <strong>15</strong> quartiers<br><strong>${Math.round(adjCount)}</strong> adjacences · <strong>${totalPts}</strong> pts</div>`;
    return;
  }
  const phaseLabel = GAME_PHASE_LABELS[gameState.phase] || '';
  hud.innerHTML = `<h3>Tour ${gameState.tour}</h3><div id="stats-content">
    <div class="hud-phase">${phaseLabel}</div>
    <div class="hud-players">${gameState.joueurs.map(j => {
      const pts = gameState.getPlayerPoints(j.id, gameData.gameplay);
      return `<div class="hud-player"><span class="hud-player-dot" style="background:${j.couleur}"></span><span>${j.nom}</span><span class="hud-player-pts">${pts} pts</span><span class="hud-player-gold">${j.ressources.lingots}L</span></div>`;
    }).join('')}</div></div>`;
}

function refreshMap() {
  if (!gameState || !mapRenderer) return;
  mapRenderer.updateOwnership(gameState);
  mapRenderer.renderPions(gameState);
  updateHUD();
}

/* ── Turn Loop ── */
function startTurnLoop() {
  if (!gameState) return;
  turnManager = new TurnManager(gameState, gameData.gameplay);
  turnManager.onChange = onPhaseChange;
  if (gameState.tour >= 1 && gameState.phase >= 1) {
    turnManager.startTurn();
  }
}

function onPhaseChange() {
  hideAllOverlays();
  updateHUD();
  refreshMap();

  switch (turnManager.phase) {
    case PHASE.CURTAIN: renderCurtain(); break;
    case PHASE.ORDERS_SUPPLY: renderOrderPanel(1); break;
    case PHASE.ORDERS_MOVE: renderOrderPanel(4); break;
    case PHASE.REVEAL_HARVEST: processAndShowReveal(); break;
    case PHASE.NEGOTIATION: renderNegotiation(); break;
    case PHASE.REVEAL_RESOLVE: processAndShowResolve(); break;
    case PHASE.TURN_END: renderTurnEnd(); break;
  }
}

/* ── Curtain ── */
function renderCurtain() {
  const ov = document.getElementById('curtain');
  const j = turnManager.currentPlayer;
  const phaseNum = gameState.phase;
  ov.querySelector('.curtain-player').textContent = j.nom;
  ov.querySelector('.curtain-player').style.color = j.couleur;
  ov.querySelector('.curtain-phase').textContent = GAME_PHASE_LABELS[phaseNum];
  const btn = ov.querySelector('#btn-curtain-go');
  btn.textContent = `Je suis ${j.nom}`;
  btn.onclick = () => { ov.classList.add('hidden'); turnManager.confirmCurtain(); };
  ov.classList.remove('hidden');
}

/* ── Order Panel (Phase 1 & 4) ── */
function renderOrderPanel(gamePhase) {
  const panel = document.getElementById('order-panel');
  const pid = turnManager.currentPlayerId;
  const j = gameState.joueurs[pid];
  const maxOrders = turnManager.maxOrdersForPhase(pid);
  pendingOrders = [];

  function refresh() {
    const remaining = maxOrders - pendingOrders.length;
    panel.innerHTML = `
      <div class="op-header" style="border-color:${j.couleur}">
        <strong style="color:${j.couleur}">${j.nom}</strong>
        <span>${GAME_PHASE_LABELS[gamePhase]}</span>
      </div>
      <div class="op-resources">
        <span class="op-res">💰 ${j.ressources.lingots}L</span>
        <span class="op-res">🔫 ${j.ressources.armes}</span>
        <span class="op-res">💊 ${j.ressources.doses}</span>
      </div>
      <div class="op-budget">${remaining} ordre${remaining > 1 ? 's' : ''} disponible${remaining > 1 ? 's' : ''} (sur ${maxOrders})</div>
      <div class="op-actions">
        ${gamePhase === 1 ? `
          <button class="op-btn" id="btn-add-supply" ${remaining <= 0 ? 'disabled' : ''}>+ Acheter denrées</button>
          <button class="op-btn" id="btn-add-recruit" ${remaining <= 0 ? 'disabled' : ''}>+ Recruter prostituée</button>
          <button class="op-btn" id="btn-add-build" ${remaining <= 0 ? 'disabled' : ''}>+ Construire</button>
        ` : `
          <button class="op-btn" id="btn-add-move" ${remaining <= 0 ? 'disabled' : ''}>+ Déplacer un pion</button>
          <button class="op-btn" id="btn-add-create" ${remaining <= 0 ? 'disabled' : ''}>+ Créer dealer/trafiquant</button>
          <button class="op-btn" id="btn-add-flic" ${remaining <= 0 ? 'disabled' : ''}>+ Déployer un flic (180L)</button>
          <button class="op-btn" id="btn-elim-flic" ${remaining <= 0 ? 'disabled' : ''}>+ Éliminer un flic ennemi</button>
          <div class="op-hint">Les pions non déplacés soutiennent automatiquement les alliés adjacents en conflit.</div>
        `}
      </div>
      <div class="op-list">
        ${pendingOrders.length === 0 ? '<div class="op-empty">Aucun ordre</div>' : ''}
        ${pendingOrders.map((o, i) => `<div class="op-order"><span>${formatOrder(o)}</span><button class="op-remove" data-idx="${i}">✕</button></div>`).join('')}
      </div>
      <button class="btn-primary op-submit" id="btn-submit-orders">Valider mes ordres</button>
    `;

    panel.querySelectorAll('.op-remove').forEach(b => {
      b.onclick = () => { pendingOrders.splice(parseInt(b.dataset.idx), 1); refresh(); };
    });

    if (gamePhase === 1) {
      panel.querySelector('#btn-add-supply')?.addEventListener('click', () => showSupplyModal(pid, refresh));
      panel.querySelector('#btn-add-recruit')?.addEventListener('click', () => showRecruitModal(pid, refresh));
      panel.querySelector('#btn-add-build')?.addEventListener('click', () => showBuildModal(pid, refresh));
    } else {
      panel.querySelector('#btn-add-move')?.addEventListener('click', () => showMoveModal(pid, refresh));
      panel.querySelector('#btn-add-create')?.addEventListener('click', () => showCreateModal(pid, refresh));
      panel.querySelector('#btn-add-flic')?.addEventListener('click', () => showDeployFlicModal(pid, refresh));
      panel.querySelector('#btn-elim-flic')?.addEventListener('click', () => showElimFlicModal(pid, refresh));
    }

    panel.querySelector('#btn-submit-orders').onclick = () => {
      panel.classList.add('hidden');
      turnManager.submitOrders(pendingOrders);
    };
  }

  refresh();
  panel.classList.remove('hidden');
}

function formatOrder(o) {
  switch (o.type) {
    case 'approvisionner': return `${o.quantite} ${o.denree} via ${o.point} (${o.quantite * (BUY_PRICE[o.denree] || 0)}L)`;
    case 'recruter': return `${o.pion_type.replace(/_/g, ' ')} → ${o.zone_dest} (${BUY_PRICE[o.pion_type]}L)`;
    case 'construire': return `${o.batiment} sur ${o.zone}`;
    case 'deplacer': return `${o.pion_type} ${o.from} → ${o.to}${o.eliminer ? ' 💀' : ''}`;
    case 'creer_pion': return `Créer ${o.pion_type} sur ${o.zone}`;
    case 'deployer_flic': return `🚔 Flic → ${o.zone} (180L)`;
    case 'eliminer_flic': return `🚔 Éliminer flic sur ${o.zone} (${o.definitif ? '550L déf.' : '300L temp.'})`;
    default: return JSON.stringify(o);
  }
}

/* ── Modals ── */
function openModal(html, onSubmit) {
  const modal = document.getElementById('order-modal');
  modal.querySelector('.modal-body').innerHTML = html;
  modal.classList.remove('hidden');
  modal.querySelector('#modal-cancel').onclick = () => modal.classList.add('hidden');
  modal.querySelector('#modal-ok').onclick = () => { modal.classList.add('hidden'); onSubmit(); };
}

function showSupplyModal(pid, refresh) {
  const sps = RevenueEngine.getSupplyPoints(gameData.gameplay).filter(sp => sp.type !== 'camp_gitans' || sp.caps.armes > 0);
  const denrees = [
    { id: 'doses', label: 'Doses', prix: 2 },
    { id: 'armes', label: 'Armes', prix: 4 }
  ];
  let sel = { point: sps[0]?.zone || '', denree: 'doses', qty: 1 };

  const html = `
    <h3>Approvisionnement</h3>
    <label>Point :</label>
    <select id="f-point">${sps.map(sp => `<option value="${sp.zone}">${sp.nom} (${sp.type})</option>`).join('')}</select>
    <label>Denrée :</label>
    <select id="f-denree">${denrees.map(d => `<option value="${d.id}">${d.label} — ${d.prix}L</option>`).join('')}</select>
    <label>Quantité :</label>
    <input type="number" id="f-qty" value="1" min="1" max="20" />
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Commander</button></div>
  `;

  openModal(html, () => {
    const point = document.getElementById('f-point').value;
    const denree = document.getElementById('f-denree').value;
    const qty = parseInt(document.getElementById('f-qty').value) || 1;
    pendingOrders.push({ type: 'approvisionner', point, denree, quantite: qty });
    refresh();
  });
}

function showRecruitModal(pid, refresh) {
  const sps = RevenueEngine.getSupplyPoints(gameData.gameplay).filter(sp => sp.caps.prost > 0);
  const ownedZones = Object.entries(gameState.plateau)
    .filter(([_, z]) => z.proprietaire === pid || z.pions.some(p => p.joueur === pid))
    .filter(([_, z]) => !z.pions.some(p => p.type === 'prostituee_base' || p.type === 'prostituee_luxe'))
    .map(([zid]) => zid);

  const html = `
    <h3>Recruter prostituée</h3>
    <label>Point :</label>
    <select id="f-point">${sps.map(sp => `<option value="${sp.zone}">${sp.nom} (${sp.type})</option>`).join('')}</select>
    <label>Type :</label>
    <select id="f-ptype">
      <option value="prostituee_base">Classique — 40L</option>
      <option value="prostituee_luxe">De luxe — 80L</option>
    </select>
    <label>Zone de placement :</label>
    <select id="f-zone">${ownedZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Recruter</button></div>
  `;

  openModal(html, () => {
    pendingOrders.push({
      type: 'recruter',
      point: document.getElementById('f-point').value,
      pion_type: document.getElementById('f-ptype').value,
      zone_dest: document.getElementById('f-zone').value
    });
    refresh();
  });
}

function showBuildModal(pid, refresh) {
  const buildable = Object.entries(gameState.plateau)
    .filter(([_, z]) => (z.proprietaire === pid || z.pions.some(p => p.joueur === pid)) && !z.construction)
    .map(([zid]) => zid);

  const allTypes = [
    { id: 'restaurant', label: 'Restaurant', rev: '14L/tour' },
    { id: 'tripot',     label: 'Tripot',     rev: '14L/tour' },
    { id: 'labo',       label: 'Labo',       rev: 'Prix drogue ÷2' },
    { id: 'bordel',     label: 'Bordel',     rev: 'Variable (réseau PL)' },
    { id: 'casino',     label: 'Casino',     rev: '60L/tour' }
  ];

  const types = allTypes.map(t => {
    const check = RevenueEngine.canBuild(gameState, pid, t.id, gameData.adjacencies);
    const d = CONSTRUCTION_DEFS[t.id];
    return { ...t, cost: d.total, canBuild: check.ok, reason: check.reason || '' };
  });

  const html = `
    <h3>Construction</h3>
    <label>Bâtiment :</label>
    <select id="f-bat">${types.map(t =>
      `<option value="${t.id}" ${!t.canBuild ? 'disabled' : ''}>${t.label} — ${t.cost}L → ${t.rev}${!t.canBuild ? ' ⛔' : ''}</option>`
    ).join('')}</select>
    <div id="f-bat-info" class="modal-prereq"></div>
    <label>Zone :</label>
    <select id="f-zone">${buildable.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Construire</button></div>
  `;

  openModal(html, () => {
    pendingOrders.push({
      type: 'construire',
      batiment: document.getElementById('f-bat').value,
      zone: document.getElementById('f-zone').value
    });
    refresh();
  });

  setTimeout(() => {
    const sel = document.getElementById('f-bat');
    const info = document.getElementById('f-bat-info');
    function updateInfo() {
      const t = types.find(x => x.id === sel.value);
      if (t && !t.canBuild) info.textContent = '⛔ ' + t.reason;
      else info.textContent = '';
    }
    if (sel) { sel.onchange = updateInfo; updateInfo(); }
  }, 0);
}

function showMoveModal(pid, refresh) {
  const myPions = [];
  Object.entries(gameState.plateau).forEach(([zid, zone]) => {
    zone.pions.forEach((p, i) => {
      if (p.joueur === pid) myPions.push({ zid, type: p.type, idx: i });
    });
  });

  let selectedPion = myPions[0] || null;

  function getAdjOptions() {
    if (!selectedPion) return '';
    return (gameData.adjacencies[selectedPion.zid] || []).map(a =>
      `<option value="${a}">${a} — ${gameData.gameplay.zones[a]?.nom || a}</option>`
    ).join('');
  }

  const html = `
    <h3>Déplacement</h3>
    <label>Pion :</label>
    <select id="f-pion">${myPions.map((p, i) => `<option value="${i}">${p.type.replace(/_/g, ' ')} @ ${p.zid}</option>`).join('')}</select>
    <label>Destination :</label>
    <select id="f-dest">${getAdjOptions()}</select>
    <label style="margin-top:10px;display:flex;align-items:center;gap:8px;cursor:pointer">
      <input type="checkbox" id="f-elim" style="width:16px;height:16px">
      <span style="font-size:13px;color:#e74c3c">Éliminer si victoire (coût supp. + 100k électeurs)</span>
    </label>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Déplacer</button></div>
  `;

  openModal(html, () => {
    const pIdx = parseInt(document.getElementById('f-pion').value);
    const p = myPions[pIdx];
    if (!p) return;
    const order = {
      type: 'deplacer',
      pion_type: p.type,
      from: p.zid,
      to: document.getElementById('f-dest').value
    };
    if (document.getElementById('f-elim')?.checked) order.eliminer = true;
    pendingOrders.push(order);
    refresh();
  });

  setTimeout(() => {
    const selPion = document.getElementById('f-pion');
    if (selPion) selPion.onchange = () => {
      selectedPion = myPions[parseInt(selPion.value)] || null;
      const dest = document.getElementById('f-dest');
      if (dest) dest.innerHTML = getAdjOptions();
    };
  }, 0);
}

function showCreateModal(pid, refresh) {
  const ownedZones = Object.entries(gameState.plateau)
    .filter(([_, z]) => (z.proprietaire === pid || z.pions.some(p => p.joueur === pid)))
    .filter(([_, z]) => !z.pions.some(p => p.type === 'dealer' || p.type === 'trafiquant'))
    .map(([zid]) => zid);

  const html = `
    <h3>Créer un pion</h3>
    <label>Type :</label>
    <select id="f-ptype">
      <option value="dealer">Dealer — 40L + 2 armes</option>
      <option value="trafiquant">Trafiquant — 80L + 3 armes</option>
    </select>
    <label>Zone :</label>
    <select id="f-zone">${ownedZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Créer</button></div>
  `;

  openModal(html, () => {
    pendingOrders.push({
      type: 'creer_pion',
      pion_type: document.getElementById('f-ptype').value,
      zone: document.getElementById('f-zone').value
    });
    refresh();
  });
}

function showDeployFlicModal(pid, refresh) {
  const allZones = Object.keys(gameState.plateau)
    .filter(zid => gameData.gameplay.zones[zid]);

  const html = `
    <h3>Déployer un flic</h3>
    <p style="font-size:12px;color:#888;margin-bottom:8px">Coût : 160L (création) + 20L (déplacement direct) = 180L<br>Max 2 par joueur, 7 au total dans la partie.</p>
    <label>Zone cible :</label>
    <select id="f-zone">${allZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Déployer</button></div>
  `;

  openModal(html, () => {
    pendingOrders.push({
      type: 'deployer_flic',
      zone: document.getElementById('f-zone').value
    });
    refresh();
  });
}

function showElimFlicModal(pid, refresh) {
  const flicZones = Object.entries(gameState.plateau)
    .filter(([_, z]) => z.pions.some(p => p.type === 'flic' && p.joueur !== pid))
    .map(([zid]) => zid);

  if (flicZones.length === 0) {
    openModal(`
      <h3>Éliminer un flic</h3>
      <p style="color:#888">Aucun flic ennemi sur le plateau.</p>
      <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Fermer</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>
    `, () => {});
    return;
  }

  const html = `
    <h3>Éliminer un flic ennemi</h3>
    <label>Zone :</label>
    <select id="f-zone">${flicZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <label>Type :</label>
    <select id="f-elim-type">
      <option value="temp">Temporaire — 300L (retour hôtel de police)</option>
      <option value="def">Définitif — 550L (retiré du jeu)</option>
    </select>
    <p style="font-size:11px;color:#e74c3c;margin-top:6px">⚠ Coûte aussi 100 000 électeurs.</p>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Éliminer</button></div>
  `;

  openModal(html, () => {
    pendingOrders.push({
      type: 'eliminer_flic',
      zone: document.getElementById('f-zone').value,
      definitif: document.getElementById('f-elim-type').value === 'def'
    });
    refresh();
  });
}

/* ── Victory Check ── */
function checkVictory() {
  if (!gameState) return null;
  const results = gameState.joueurs.map(j => ({
    joueur: j,
    points: gameState.getPlayerPoints(j.id, gameData.gameplay)
  }));
  results.sort((a, b) => b.points - a.points);
  if (results[0].points >= 55) return results[0];
  return null;
}

function showVictoryScreen(winner) {
  const ov = document.getElementById('turnend-ov');
  const body = ov.querySelector('.turnend-body');
  body.innerHTML = `<h2>Partie terminée !</h2>` +
    gameState.joueurs.map(j => {
      const pts = gameState.getPlayerPoints(j.id, gameData.gameplay);
      return `<div class="reveal-player"><span class="hud-player-dot" style="background:${j.couleur}"></span>
        <strong>${j.nom}</strong> — <span class="hud-player-pts">${pts} pts</span> · ${j.ressources.lingots}L · ${j.ressources.armes}A · ${j.ressources.doses}D</div>`;
    }).join('') +
    `<div class="victory-banner" style="color:${winner.joueur.couleur}">🏆 ${winner.joueur.nom} remporte la partie avec ${winner.points} points !</div>`;

  ov.querySelector('#btn-next-turn').textContent = 'Retour au menu';
  ov.querySelector('#btn-next-turn').onclick = () => { ov.classList.add('hidden'); renderTitleScreen(); };
  ov.classList.remove('hidden');
}

/* ── Reveal (Phase 2) ── */
function processAndShowReveal() {
  const supplyLog = RevenueEngine.processSupplyOrders(gameState, turnManager.supplyOrders, gameData.gameplay, gameData.adjacencies);
  const revenueLog = RevenueEngine.calculateRevenues(gameState, gameData.gameplay, gameData.adjacencies);
  gameState.save();
  refreshMap();

  showRevealOverlay('Révélation & récolte', [...supplyLog, ...revenueLog], () => {
    const w = checkVictory();
    if (w) { hideAllOverlays(); showVictoryScreen(w); }
    else turnManager.continueFromReveal();
  });
}

/* ── Negotiation (Phase 3) ── */
function renderNegotiation() {
  const ov = document.getElementById('negotiation-ov');
  ov.classList.remove('hidden');
  document.getElementById('btn-end-nego').onclick = () => {
    ov.classList.add('hidden');
    turnManager.endNegotiation();
  };
}

/* ── Resolve (Phase 5) ── */
function processAndShowResolve() {
  const moveLog = ConflictResolver.resolve(gameState, turnManager.moveOrders, gameData.adjacencies);
  gameState.save();
  refreshMap();

  showRevealOverlay('Résolution des mouvements', moveLog, () => {
    const w = checkVictory();
    if (w) { hideAllOverlays(); showVictoryScreen(w); }
    else turnManager.continueFromReveal();
  });
}

/* ── Reveal overlay (shared) ── */
function showRevealOverlay(title, log, onContinue) {
  const ov = document.getElementById('reveal-ov');
  ov.querySelector('.reveal-title').textContent = title;
  const body = ov.querySelector('.reveal-body');

  if (log.length === 0) {
    body.innerHTML = '<div class="reveal-empty">Aucun événement ce tour.</div>';
  } else {
    body.innerHTML = log.map(entry => {
      const color = entry.pid >= 0 ? gameState.joueurs[entry.pid]?.couleur || '#888' : '#888';
      const icon = { buy: '📦', rev: '💰', build: '🏗️', move: '🚶', create: '✨', conflict: '⚔️', warn: '⚠️', flic: '🚔' }[entry.type] || '•';
      return `<div class="reveal-line" data-type="${entry.type}" style="border-left:3px solid ${color}"><span class="reveal-icon">${icon}</span>${entry.msg}</div>`;
    }).join('');
  }

  const summary = document.createElement('div');
  summary.className = 'reveal-summary';
  summary.innerHTML = '<div class="section-title">Ressources après résolution</div>' +
    gameState.joueurs.map(j =>
      `<div class="reveal-player"><span class="hud-player-dot" style="background:${j.couleur}"></span><strong>${j.nom}</strong> — ${j.ressources.lingots}L · ${j.ressources.armes}A · ${j.ressources.doses}D</div>`
    ).join('');
  body.appendChild(summary);

  ov.querySelector('#btn-reveal-ok').onclick = () => { ov.classList.add('hidden'); onContinue(); };
  ov.classList.remove('hidden');
}

/* ── Turn End ── */
function renderTurnEnd() {
  const ov = document.getElementById('turnend-ov');
  const body = ov.querySelector('.turnend-body');
  body.innerHTML = `<h2>Fin du tour ${gameState.tour}</h2>` +
    gameState.joueurs.map(j => {
      const pts = gameState.getPlayerPoints(j.id, gameData.gameplay);
      return `<div class="reveal-player"><span class="hud-player-dot" style="background:${j.couleur}"></span>
        <strong>${j.nom}</strong> — <span class="hud-player-pts">${pts} pts</span> · ${j.ressources.lingots}L · ${j.ressources.armes}A · ${j.ressources.doses}D</div>`;
    }).join('');

  const winner = gameState.joueurs.find(j => gameState.getPlayerPoints(j.id, gameData.gameplay) >= 55);
  if (winner) {
    body.innerHTML += `<div class="victory-banner" style="color:${winner.couleur}">🏆 ${winner.nom} remporte la partie avec ${gameState.getPlayerPoints(winner.id, gameData.gameplay)} points !</div>`;
  }

  ov.querySelector('#btn-next-turn').textContent = winner ? 'Retour au menu' : 'Tour suivant';
  ov.querySelector('#btn-next-turn').onclick = () => {
    ov.classList.add('hidden');
    if (winner) { renderTitleScreen(); } else { turnManager.nextTurn(); }
  };
  ov.classList.remove('hidden');
}

/* ── Info Panel ── */
function renderInfoPanel(id) {
  const panel = document.getElementById('info-panel');
  if (!id) { panel.classList.add('hidden'); return; }

  const f = gameData.features.find(f => f.properties.id === id);
  const adj = gameData.adjacencies[id] || [];
  const q = gameData.zoneToQuartier[id];
  const zd = gameData.gameplay.zones[id];

  document.getElementById('info-name').textContent = zd ? zd.nom : f?.properties.nom || id;
  document.getElementById('info-id').textContent = id;

  const qBadge = document.getElementById('info-quartier');
  if (q) {
    const c = QUARTIER_COLORS[q.id];
    qBadge.textContent = q.nom; qBadge.style.background = c.fill; qBadge.style.color = c.stroke; qBadge.style.border = `1px solid ${c.stroke}`;
  }

  document.getElementById('info-facilite').innerHTML = zd?.facilite
    ? `<span class="facilite-tag">${FACILITE_LABELS[zd.facilite] || zd.facilite}</span>` : '';

  if (zd) {
    document.getElementById('info-indices').innerHTML = `
      <div class="index-box" style="background:rgba(200,100,150,0.2);color:#f8a0c8">${zd.p}<div class="index-label">Prost.</div></div>
      <div class="index-box" style="background:rgba(100,200,100,0.2);color:#a0f8a0">${zd.d}<div class="index-label">Drogue</div></div>
      <div class="index-box" style="background:rgba(150,150,200,0.2);color:#a0a0f8">${zd.a}<div class="index-label">Armes</div></div>`;
  }

  if (q) {
    document.getElementById('info-stats').innerHTML = `
      <div class="section-title">Quartier : ${q.nom}</div>
      <div class="stat-row"><span class="stat-label">Zones</span><span class="stat-value">${q.zones.length}</span></div>
      <div class="stat-row"><span class="stat-label">Points</span><span class="stat-value">${q.points}</span></div>
      <div class="stat-row"><span class="stat-label">Pop./zone</span><span class="stat-value">${(q.population_par_zone / 1000).toFixed(0)}k</span></div>`;
    const g = q.gang;
    const dur = g.duree === -1 ? 'permanent' : g.duree === 0 ? 'instantané' : `${g.duree} tours`;
    document.getElementById('info-gang').innerHTML = `<div class="gang-name">${g.nom}</div><div>${g.effet.replace(/_/g, ' ')} · ${dur}</div>`;
  } else {
    document.getElementById('info-stats').innerHTML = '';
    document.getElementById('info-gang').innerHTML = '';
  }

  const gameInfoEl = document.getElementById('info-game');
  if (gameState) {
    const zone = gameState.plateau[id];
    if (zone && zone.pions.length > 0) {
      gameInfoEl.innerHTML = `<div class="section-title">Pions</div>` +
        zone.pions.map(p => {
          const j = gameState.joueurs[p.joueur];
          return `<div class="stat-row"><span class="stat-label" style="color:${j.couleur}">${j.nom}</span><span class="stat-value">${p.type.replace(/_/g, ' ')}</span></div>`;
        }).join('');
    } else { gameInfoEl.innerHTML = ''; }
  } else { gameInfoEl.innerHTML = ''; }

  document.getElementById('info-adj').innerHTML = adj.length
    ? `<div class="section-title">Adjacences (${adj.length})</div>` + adj.map(a => `<span onclick="window._selectZone('${a}')">${a}</span>`).join('') : '';

  panel.classList.remove('hidden');
}

function renderLegend() {
  const el = document.getElementById('legend-items');
  el.innerHTML = '';
  let highlightedQ = null;
  gameData.gameplay.quartiers.forEach(q => {
    const c = QUARTIER_COLORS[q.id];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<div class="legend-swatch" style="background:${c.fill};border-color:${c.stroke}"></div><span>${q.nom}</span><span class="legend-info">${q.zones.length}z · ${q.points}pts</span>`;
    item.onclick = () => {
      if (highlightedQ === q.id) { highlightedQ = null; mapRenderer.highlightQuartier(null); el.querySelectorAll('.legend-item').forEach(e => e.classList.remove('active')); }
      else { highlightedQ = q.id; mapRenderer.highlightQuartier(q.id); el.querySelectorAll('.legend-item').forEach(e => e.classList.remove('active')); item.classList.add('active'); }
    };
    el.appendChild(item);
  });
}

window._selectZone = id => { if (mapRenderer) mapRenderer.selectZone(id); };

document.addEventListener('DOMContentLoaded', async () => {
  gameData = await loadGameData();
  renderTitleScreen();
  renderLegend();
});
