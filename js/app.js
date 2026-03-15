import { GameState } from './game-state.js';
import { MapRenderer, QUARTIER_COLORS, FACILITE_LABELS } from './map-renderer.js';
import { renderSetupScreen } from './setup.js';
import { TurnManager, PHASE, GAME_PHASE_LABELS, ELECTION_INTERVAL } from './turn-manager.js';
import { RevenueEngine, BUY_PRICE, CONSTRUCTION_DEFS } from './revenue-engine.js';
import { ConflictResolver } from './conflict-resolver.js';
import { MayorEngine, MAYOR_POWERS } from './mayor-engine.js';
import { MagouilleEngine } from './magouille-engine.js';
import { SpecialEntities } from './special-entities.js';
import { ContractEngine, CONTRACT_TYPES } from './contract-engine.js';
import { HeistEngine, HEIST_TYPES } from './heist-engine.js';
import { getShareUrl, generateQRCode, getWhatsAppShareUrl, copyToClipboard, shareViaWebShare, canUseWebShare, parseRestoreFromHash, clearRestoreHash } from './save-export.js';
import { showDictionaryEntry, initDictionaryOverlay } from './dictionary.js';

let gameData = null;
let cartesDef = null;
let gameState = null;
let mapRenderer = null;
let turnManager = null;
let pendingOrders = [];
let turnLog = [];

async function loadGameData() {
  const [geoRes, adjRes, gameRes, cartesRes] = await Promise.all([
    fetch('data/quartiers-osm.geojson').then(r => r.json()),
    fetch('data/adjacences-osm.json').then(r => r.json()),
    fetch('data/quartiers-gameplay.json').then(r => r.json()),
    fetch('data/cartes-magouille.json').then(r => r.json())
  ]);
  cartesDef = cartesRes;
  const zoneToQuartier = {};
  gameRes.quartiers.forEach(q => { q.zones.forEach(z => { zoneToQuartier[z] = q; }); });
  (gameRes.iles || []).forEach(ile => {
    (ile.adjacences || []).forEach(adj => {
      if (!adjRes[ile.id]) adjRes[ile.id] = [];
      if (!adjRes[ile.id].includes(adj)) adjRes[ile.id].push(adj);
      if (!adjRes[adj]) adjRes[adj] = [];
      if (!adjRes[adj].includes(ile.id)) adjRes[adj].push(ile.id);
    });
  });
  return { features: geoRes.features, adjacencies: adjRes, gameplay: gameRes, zoneToQuartier };
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function hideAllOverlays() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
  document.getElementById('order-panel')?.classList.add('hidden');
  document.getElementById('op-fab')?.classList.add('hidden');
  document.getElementById('info-panel')?.classList.remove('shifted');
}

function setActivePlayerColor(color) {
  const screen = document.getElementById('screen-game');
  if (!screen) return;
  screen.style.setProperty('--player-color', color ? `${color}33` : 'transparent');
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

const CONDITION_LABELS = {
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

function updateHUD() {
  const hud = document.getElementById('stats');
  if (!gameState) {
    const totalPts = gameData.gameplay.quartiers.reduce((s, q) => s + q.points, 0);
    const adjCount = Object.values(gameData.adjacencies).reduce((s, a) => s + a.length, 0) / 2;
    hud.innerHTML = `<h3>JORETAPO</h3><div id="stats-content"><strong>${gameData.features.length}</strong> zones · <strong>15</strong> quartiers<br><strong>${Math.round(adjCount)}</strong> adjacences · <strong>${totalPts}</strong> pts</div>`;
    return;
  }
  const phaseLabel = GAME_PHASE_LABELS[gameState.phase] || '';
  const activeContracts = ContractEngine.getActiveContracts(gameState);
  const nextElection = gameState.tour > 0 ? (ELECTION_INTERVAL - (gameState.tour % ELECTION_INTERVAL)) % ELECTION_INTERVAL : ELECTION_INTERVAL;
  const electionProgress = nextElection === 0 ? '<div class="hud-election-progress hud-clickable" data-dict="election">🗳️ Élection ce tour !</div>' : `<div class="hud-election-progress hud-clickable" data-dict="election">🗳️ Prochaine élection dans ${nextElection} tour${nextElection > 1 ? 's' : ''}</div>`;
  hud.innerHTML = `<h3 class="hud-clickable" data-dict="tour" title="Cliquer pour plus d'infos">Tour ${gameState.tour}</h3><div id="stats-content">
    <div class="hud-phase hud-clickable" data-dict="phase" title="Cliquer pour plus d'infos">${phaseLabel}</div>
    ${electionProgress}
    <div class="hud-players">${gameState.joueurs.map(j => {
      const pts = gameState.getPlayerPoints(j.id, gameData.gameplay);
      const maireTag = j.est_maire ? ' 🏛️' : '';
      const pContracts = activeContracts.filter(c => c.joueur_a === j.id || c.joueur_b === j.id).length;
      const contractBadge = pContracts > 0 ? `<span class="hud-contracts-badge">📜${pContracts}</span>` : '';
      const qOrig = gameData.gameplay.quartiers.find(q => q.id === j.quartier_origine)?.nom || j.quartier_origine;
      return `<div class="hud-player"><span class="hud-player-dot" style="background:${j.couleur}"></span><span class="hud-clickable" data-dict="joueur" data-pid="${j.id}" title="Cliquer pour plus d'infos">${j.nom}${maireTag}${contractBadge}</span><span class="hud-player-pts hud-clickable" data-dict="pts" title="Cliquer pour plus d'infos">${pts} pts</span><span class="hud-player-gold hud-clickable" data-dict="lingots" title="Cliquer pour plus d'infos">${j.ressources.lingots}L</span></div>` +
        `<div class="hud-player-res"><span class="hud-clickable" data-dict="ressources" title="Cliquer pour plus d'infos">🔫${j.ressources.armes} 💊${j.ressources.doses} 🃏${(j.cartes_magouille || []).length}</span></div>`;
    }).join('')}</div>
    <button class="btn-share" id="hud-share-btn">💾 Partager</button></div>`;
  document.getElementById('hud-share-btn')?.addEventListener('click', showShareModal);
  hud.querySelectorAll('.hud-clickable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const dict = el.dataset.dict;
      if (dict === 'joueur' && el.dataset.pid != null) {
        const j = gameState.joueurs[Number(el.dataset.pid)];
        const qOrig = gameData.gameplay.quartiers.find(q => q.id === j.quartier_origine)?.nom;
        showDictionaryEntry(dict, { ...j, quartier_origine: qOrig });
      } else {
        showDictionaryEntry(dict);
      }
    });
  });
}

function updateElectionBar() {
  const bar = document.getElementById('election-bar');
  if (!bar || !gameState) { bar?.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const elapsed = gameState.tour % ELECTION_INTERVAL;
  const remaining = elapsed === 0 && gameState.tour > 0 ? 0 : (ELECTION_INTERVAL - elapsed) % ELECTION_INTERVAL;
  const isElectionTurn = remaining === 0 && gameState.tour > 0;

  let dots = '';
  for (let i = 1; i <= ELECTION_INTERVAL; i++) {
    const isFilled = i <= elapsed;
    const isCurrent = i === elapsed;
    const isLast = i === ELECTION_INTERVAL;
    let cls = 'ebar-dot';
    if (isElectionTurn && isLast) cls += ' election';
    else if (isCurrent) cls += ' current';
    else if (isFilled) cls += ' filled';
    dots += `<div class="${cls}"></div>`;
  }

  const infoText = isElectionTurn
    ? '🗳️ Élection ce tour !'
    : `${remaining} tour${remaining > 1 ? 's' : ''} avant l'élection`;
  const infoClass = remaining <= 2 ? 'ebar-info urgent' : 'ebar-info';

  bar.innerHTML = `<span class="ebar-label">Élections</span><div class="ebar-dots">${dots}</div><span class="${infoClass}">${infoText}</span>`;
}

function refreshMap() {
  if (!gameState || !mapRenderer) return;
  mapRenderer.updateOwnership(gameState);
  mapRenderer.renderPions(gameState);
  updateHUD();
  updateElectionBar();
}

/* ── Turn Loop ── */
function startTurnLoop() {
  if (!gameState) return;
  turnManager = new TurnManager(gameState, gameData.gameplay);
  turnManager.onChange = onPhaseChange;
  turnManager.onEndOfMandate = () => {
    const results = SpecialEntities.processEndOfMandate(gameState, gameData.gameplay);
    results.forEach(msg => console.log('[Fin de mandat]', msg));
  };
  if (gameState.tour >= 1 && gameState.phase >= 1) {
    turnManager.startTurn();
  }
}

function onPhaseChange() {
  hideAllOverlays();
  updateHUD();
  refreshMap();

  const hasActivePlayer = [PHASE.CURTAIN, PHASE.ORDERS_SUPPLY, PHASE.ORDERS_MOVE, PHASE.ELECTION_CURTAIN, PHASE.ELECTION_VOTE, PHASE.DRAFT_CURTAIN, PHASE.DRAFT_PICK].includes(turnManager.phase);
  setActivePlayerColor(hasActivePlayer && turnManager.currentPlayer ? turnManager.currentPlayer.couleur : null);

  switch (turnManager.phase) {
    case PHASE.CURTAIN: renderCurtain(); break;
    case PHASE.ORDERS_SUPPLY: renderOrderPanel(1); break;
    case PHASE.ORDERS_MOVE: renderOrderPanel(4); break;
    case PHASE.REVEAL_HARVEST: processAndShowReveal(); break;
    case PHASE.NEGOTIATION: renderNegotiation(); break;
    case PHASE.REVEAL_RESOLVE: processAndShowResolve(); break;
    case PHASE.TURN_END: renderTurnEnd(); break;
    case PHASE.ELECTION_INTRO: renderElectionIntro(); break;
    case PHASE.ELECTION_CURTAIN: renderElectionCurtain(); break;
    case PHASE.ELECTION_VOTE: renderElectionVote(); break;
    case PHASE.ELECTION_RESULT: renderElectionResult(); break;
    case PHASE.DRAFT_CURTAIN: renderDraftCurtain(); break;
    case PHASE.DRAFT_PICK: renderDraftPick(); break;
  }
}

/* ── Curtain ── */
function renderCurtain() {
  const ov = document.getElementById('curtain');
  const j = turnManager.currentPlayer;
  const phaseNum = gameState.phase;
  ov.querySelector('.curtain-turn').textContent = `Tour ${gameState.tour}`;
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
  document.getElementById('info-panel')?.classList.add('shifted');
  const pid = turnManager.currentPlayerId;
  const j = gameState.joueurs[pid];
  const maxOrders = turnManager.maxOrdersForPhase(pid);
  pendingOrders = [];

  function refresh() {
    const remaining = maxOrders - pendingOrders.length;
    panel.innerHTML = `
      <div class="op-header" style="border-color:${j.couleur}">
        <div><strong style="color:${j.couleur}">${j.nom}</strong><span>${GAME_PHASE_LABELS[gamePhase]}</span></div>
        <button type="button" class="op-toggle-map" id="btn-op-toggle-map" title="Voir la carte entre deux instructions">🗺️</button>
      </div>
      <div class="op-scroll">
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
          <button class="op-btn" id="btn-elim-incorruptible">+ Éliminer un incorruptible (700L)</button>
          <button class="op-btn" id="btn-activate-gang">+ Activer un gang</button>
          <button class="op-btn" id="btn-heist" style="background:rgba(241,196,15,0.08);border-color:#f1c40f;color:#f1c40f">💰 Cambrioler</button>
          <div class="op-hint">Les pions non déplacés soutiennent automatiquement les alliés adjacents en conflit.</div>
        `}
        ${MayorEngine.canUse(gameState, pid) && MayorEngine.availablePowers(gameState, pid, gamePhase).length > 0 ? `
          <button class="op-btn op-btn-mayor" id="btn-mayor-power">🏛️ Pouvoir du Maire (${gameState.maire.privileges_restants} restant${gameState.maire.privileges_restants > 1 ? 's' : ''})</button>
        ` : ''}
        ${(j.cartes_magouille?.length || 0) > 0 ? `
          <button class="op-btn op-btn-magouille" id="btn-play-card">🃏 Jouer une carte (${j.cartes_magouille.length})</button>
        ` : ''}
      </div>
      <div class="op-list">
        ${pendingOrders.length === 0 ? '<div class="op-empty">Aucun ordre</div>' : ''}
        ${pendingOrders.map((o, i) => `<div class="op-order"><span>${formatOrder(o)}</span><button class="op-remove" data-idx="${i}">✕</button></div>`).join('')}
      </div>
      </div>
      <div class="op-footer"><button class="btn-primary op-submit" id="btn-submit-orders">Valider mes ordres</button></div>
    `;

    panel.querySelector('#btn-op-toggle-map')?.addEventListener('click', () => {
      panel.classList.add('hidden');
      document.getElementById('op-fab')?.classList.remove('hidden');
    });

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
      panel.querySelector('#btn-elim-incorruptible')?.addEventListener('click', () => showElimIncorruptibleModal(pid, refresh));
      panel.querySelector('#btn-activate-gang')?.addEventListener('click', () => showActivateGangModal(pid, refresh));
      panel.querySelector('#btn-heist')?.addEventListener('click', () => showHeistModal(pid, refresh));
    }
    panel.querySelector('#btn-mayor-power')?.addEventListener('click', () => showMayorPowerModal(pid, gamePhase, refresh));
    panel.querySelector('#btn-play-card')?.addEventListener('click', () => showPlayCardModal(pid, gamePhase, refresh));

    panel.querySelector('#btn-submit-orders').onclick = () => {
      panel.classList.add('hidden');
      document.getElementById('op-fab')?.classList.add('hidden');
      turnManager.submitOrders(pendingOrders);
    };
  }

  const fab = document.getElementById('op-fab');
  if (fab) {
    fab.classList.add('hidden');
    fab.onclick = () => { panel.classList.remove('hidden'); fab.classList.add('hidden'); };
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
  const cancelBtn = modal.querySelector('#modal-cancel');
  if (cancelBtn) cancelBtn.onclick = () => closeModal();
  const okBtn = modal.querySelector('#modal-ok');
  if (okBtn && onSubmit) okBtn.onclick = () => { closeModal(); onSubmit(); };
  modal.onclick = e => { if (e.target === modal) closeModal(); };
}

function closeModal() {
  document.getElementById('order-modal').classList.add('hidden');
}

function showSupplyModal(pid, refresh) {
  const sps = RevenueEngine.getSupplyPoints(gameData.gameplay).filter(sp => sp.type !== 'camp_gitans' || sp.caps.armes > 0);
  const denrees = [
    { id: 'doses', label: 'Doses', prix: 2 },
    { id: 'armes', label: 'Armes', prix: 4 }
  ];
  const j = gameState.joueurs[pid];

  const html = `
    <h3>Approvisionnement</h3>
    <label>Point :</label>
    <select id="f-point">${sps.map(sp => `<option value="${sp.zone}">${sp.nom} (${sp.type})</option>`).join('')}</select>
    <label>Denrée :</label>
    <select id="f-denree">${denrees.map(d => `<option value="${d.id}">${d.label} — ${d.prix}L / unité</option>`).join('')}</select>
    <label>Quantité :</label>
    <input type="number" id="f-qty" value="1" min="1" max="20" />
    <div id="f-cost-preview" class="modal-cost-preview"></div>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Commander</button></div>
  `;

  openModal(html, () => {
    const point = document.getElementById('f-point').value;
    const denree = document.getElementById('f-denree').value;
    const qty = parseInt(document.getElementById('f-qty').value) || 1;
    pendingOrders.push({ type: 'approvisionner', point, denree, quantite: qty });
    refresh();
  });

  function updateCostPreview() {
    const denreeId = document.getElementById('f-denree').value;
    const qty = parseInt(document.getElementById('f-qty').value) || 1;
    const d = denrees.find(x => x.id === denreeId);
    const total = d.prix * qty;
    const alreadySpent = pendingOrders.filter(o => o.type === 'approvisionner' || o.type === 'construire' || o.type === 'recruter' || o.type === 'deployer_flic')
      .reduce((s, o) => s + (o._cost || 0), 0);
    const el = document.getElementById('f-cost-preview');
    const warn = total > j.ressources.lingots ? ' <span style="color:#e74c3c">⚠ Fonds insuffisants</span>' : '';
    el.innerHTML = `💰 <strong>${qty} × ${d.prix}L = ${total}L</strong> <span style="color:#888">(solde : ${j.ressources.lingots}L)</span>${warn}`;
  }

  document.getElementById('f-denree').addEventListener('change', updateCostPreview);
  document.getElementById('f-qty').addEventListener('input', updateCostPreview);
  updateCostPreview();
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
    return (gameData.adjacencies[selectedPion.zid] || []).map(a => {
      const zn = gameData.gameplay.zones[a]?.nom || a;
      return `<option value="${a}">${a} — ${zn}</option>`;
    }).join('');
  }

  const html = `
    <h3>Déplacement</h3>
    <label>Pion :</label>
    <select id="f-pion">${myPions.map((p, i) => `<option value="${i}">${p.type.replace(/_/g, ' ')} @ ${p.zid} — ${gameData.gameplay.zones[p.zid]?.nom || ''}</option>`).join('')}</select>
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

/* ── Mayor Power Modal ── */
function showMayorPowerModal(pid, gamePhase, refresh) {
  const powers = MayorEngine.availablePowers(gameState, pid, gamePhase);
  if (powers.length === 0) return;

  const html = `
    <h3>🏛️ Pouvoir du Maire</h3>
    <p style="font-size:12px;color:#888;margin-bottom:12px">${gameState.maire.privileges_restants} privilège(s) restant(s)</p>
    <div class="mayor-power-list">
      ${powers.map(p => `<button class="op-btn mayor-power-choice" data-power="${p.id}" style="text-align:left;margin-bottom:6px"><strong>${p.label}</strong><br><span style="font-size:11px;color:#aaa">${p.desc}</span></button>`).join('')}
    </div>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>
  `;

  openModal(html, () => {});

  document.querySelectorAll('.mayor-power-choice').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      executeMayorPower(pid, btn.dataset.power, gamePhase, refresh);
    });
  });
}

function executeMayorPower(pid, powerId, gamePhase, refresh) {
  switch (powerId) {
    case 'taxe': {
      const result = MayorEngine.execute(gameState, pid, 'taxe', {}, gameData.gameplay);
      showMayorResultToast(result.msg);
      refresh();
      break;
    }
    case 'saisir_argent': showTargetPlayerModal(pid, 'saisir_argent', refresh); break;
    case 'saisir_denrees': showTargetPlayerModal(pid, 'saisir_denrees', refresh); break;
    case 'coupure': showQuartierSelectModal(pid, refresh); break;
    case 'repositionner': showRepositionnerModal(pid, refresh); break;
    case 'deplacer_gitans': showGitansModal(pid, refresh); break;
    case 'incorruptible': showZoneSelectModal(pid, 'incorruptible', refresh); break;
    case 'exproprier': showExproprierModal(pid, refresh); break;
  }
}

function showMayorResultToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'mayor-toast';
  toast.textContent = '🏛️ ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showTargetPlayerModal(pid, powerId, refresh) {
  const others = gameState.joueurs.filter((_, i) => i !== pid);
  const html = `
    <h3>🏛️ ${MAYOR_POWERS[powerId].label}</h3>
    <label>Joueur ciblé :</label>
    <select id="f-target">${others.map(j => `<option value="${j.id}">${j.nom}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>
  `;
  openModal(html, () => {
    const cible = Number(document.getElementById('f-target').value);
    const result = MayorEngine.execute(gameState, pid, powerId, { cible }, gameData.gameplay);
    showMayorResultToast(result.msg);
    refresh();
  });
}

function showQuartierSelectModal(pid, refresh) {
  const quartiers = gameData.gameplay.quartiers;
  const html = `
    <h3>🏛️ Couper l'électricité</h3>
    <label>Quartier :</label>
    <select id="f-quartier">${quartiers.map(q => `<option value="${q.id}">${q.nom}</option>`).join('')}</select>
    <p style="font-size:11px;color:#e74c3c;margin-top:6px">⚡ L'électricité sera coupée pour tout le mandat.</p>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>
  `;
  openModal(html, () => {
    const quartierId = document.getElementById('f-quartier').value;
    const result = MayorEngine.execute(gameState, pid, 'coupure', { quartierId }, gameData.gameplay);
    showMayorResultToast(result.msg);
    refresh();
  });
}

function showRepositionnerModal(pid, refresh) {
  const flicZones = Object.entries(gameState.plateau)
    .filter(([_, z]) => z.pions.some(p => p.type === 'flic'))
    .map(([zid]) => zid);

  if (flicZones.length === 0) {
    openModal(`<h3>Repositionner des flics</h3><p style="color:#888">Aucun flic sur le plateau.</p>
      <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Fermer</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>`, () => {});
    return;
  }

  const allZones = Object.keys(gameState.plateau);
  let movCount = Math.min(3, flicZones.length);
  let rows = '';
  for (let i = 0; i < movCount; i++) {
    rows += `<div style="display:flex;gap:6px;margin-bottom:6px">
      <select class="flic-from"><option value="">—</option>${flicZones.map(z => `<option value="${z}">${z}</option>`).join('')}</select>
      <span>→</span>
      <select class="flic-to">${allZones.map(z => `<option value="${z}">${z}</option>`).join('')}</select>
    </div>`;
  }
  openModal(`<h3>🏛️ Repositionner des flics</h3>${rows}
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`, () => {
    const froms = [...document.querySelectorAll('.flic-from')].map(s => s.value).filter(v => v);
    const tos = [...document.querySelectorAll('.flic-to')].map(s => s.value);
    const mouvements = froms.map((f, i) => ({ from: f, to: tos[i] })).filter(m => m.from);
    const result = MayorEngine.execute(gameState, pid, 'repositionner', { mouvements }, gameData.gameplay);
    showMayorResultToast(result.msg);
    refresh();
  });
}

function showZoneSelectModal(pid, powerId, refresh) {
  const allZones = Object.keys(gameState.plateau);
  const html = `
    <h3>🏛️ ${MAYOR_POWERS[powerId].label}</h3>
    <label>Zone :</label>
    <select id="f-zone">${allZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>
  `;
  openModal(html, () => {
    const zone = document.getElementById('f-zone').value;
    const result = MayorEngine.execute(gameState, pid, powerId, { zone }, gameData.gameplay);
    showMayorResultToast(result.msg);
    refresh();
  });
}

function showExproprierModal(pid, refresh) {
  const others = gameState.joueurs.filter((_, i) => i !== pid);
  const allZones = Object.keys(gameState.plateau);
  const html = `
    <h3>🏛️ Exproprier un joueur</h3>
    <label>Joueur ciblé :</label>
    <select id="f-target">${others.map(j => `<option value="${j.id}">${j.nom}</option>`).join('')}</select>
    <label>Zones (4 max, séparées par virgule) :</label>
    <input type="text" id="f-expro-zones" placeholder="ex: BG01,BG02,JC01,JC02" style="width:100%;padding:6px;background:#1a1a2e;color:#eee;border:1px solid #334;border-radius:4px">
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Exproprier</button></div>
  `;
  openModal(html, () => {
    const cible = Number(document.getElementById('f-target').value);
    const zones = document.getElementById('f-expro-zones').value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 4);
    const result = MayorEngine.execute(gameState, pid, 'exproprier', { cible, zones }, gameData.gameplay);
    showMayorResultToast(result.msg);
    refresh();
  });
}

function showGitansModal(pid, refresh) {
  const allZones = Object.keys(gameState.plateau);
  const currentPositions = gameState.gitans.positions || [];
  const html = `
    <h3>🏛️ Déplacer les gitans</h3>
    <label>Nouvelles zones (séparées par virgule) :</label>
    <input type="text" id="f-gitan-zones" value="${currentPositions.join(',')}" placeholder="ex: BG01,JC03" style="width:100%;padding:6px;background:#1a1a2e;color:#eee;border:1px solid #334;border-radius:4px">
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Déplacer</button></div>
  `;
  openModal(html, () => {
    const zones = document.getElementById('f-gitan-zones').value.split(',').map(s => s.trim()).filter(Boolean);
    const result = MayorEngine.execute(gameState, pid, 'deplacer_gitans', { zones }, gameData.gameplay);
    showMayorResultToast(result.msg);
    refresh();
  });
}

/* ── Incorruptible & Gang Modals ── */
function showElimIncorruptibleModal(pid, refresh) {
  const incZones = Object.entries(gameState.plateau)
    .filter(([_, z]) => z.pions.some(p => p.type === 'incorruptible'))
    .map(([zid]) => zid);

  if (incZones.length === 0) {
    openModal(`<h3>Éliminer un incorruptible</h3><p style="color:#888">Aucun incorruptible sur le plateau.</p>
      <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Fermer</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>`, () => {});
    return;
  }

  const check = SpecialEntities.canEliminateIncorruptible(gameState, pid);
  const html = `<h3>Éliminer un incorruptible</h3>
    <label>Zone :</label>
    <select id="f-zone">${incZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <p style="font-size:11px;color:#e74c3c;margin-top:6px">⚠ Coût : 700L. Retiré définitivement du jeu.</p>
    ${!check.ok ? `<p style="color:#e74c3c">${check.reason}</p>` : ''}
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok" ${!check.ok ? 'disabled' : ''}>Éliminer</button></div>`;

  openModal(html, () => {
    const zone = document.getElementById('f-zone').value;
    const result = SpecialEntities.eliminateIncorruptible(gameState, pid, zone);
    showMayorResultToast(result.msg || result.reason);
    refresh();
  });
}

function showActivateGangModal(pid, refresh) {
  const quartiers = gameData.gameplay.quartiers.filter(q => q.gang);
  const available = quartiers.map(q => {
    const check = SpecialEntities.canActivateGang(gameState, pid, q.id, gameData.gameplay);
    return { ...q, canActivate: check.ok, reason: check.reason };
  });

  const html = `<h3>Activer un gang</h3>
    ${available.map(q => `<button class="op-btn gang-choice" data-qid="${q.id}" ${!q.canActivate ? 'disabled title="' + q.reason + '"' : ''} style="text-align:left;margin-bottom:6px">
      <strong>${q.gang.nom}</strong> (${q.nom})${!q.canActivate ? ' ⛔' : ''}
      <br><span style="font-size:11px;color:#aaa">${q.gang.effet.replace(/_/g, ' ')}</span>
    </button>`).join('')}
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>`;

  openModal(html, () => {});

  document.querySelectorAll('.gang-choice:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      const qid = btn.dataset.qid;
      const result = SpecialEntities.activateGang(gameState, pid, qid, gameData.gameplay);
      showMayorResultToast(result.msg || result.reason);

      if (result.ok) {
        const gang = gameData.gameplay.quartiers.find(q => q.id === qid)?.gang;
        if (gang) executeGangEffect(pid, qid, gang, refresh);
        else refresh();
      } else {
        refresh();
      }
    });
  });
}

function executeGangEffect(pid, quartierId, gang, refresh) {
  const needsTarget = ['bloquer_ordres'];
  const needsQuartier = ['eliminer_prostituees_quartier_voisin', 'bloquer_approvisionnements', 'bloquer_ventes_armes'];
  const needsZone = ['casino_gratuit'];
  const needsCibles = ['eliminer_3_pions'];
  const directEffects = ['actions_supplementaires', 'revente_marchandises', 'racket_etablissements',
    'voler_action_maire', 'immunite_restrictions_ethniques', 'bloquer_deplacements_manhattan',
    'restriction_ethnie_caucasien_asiatique', 'restriction_ethnie_non_asiatique_non_italien', 'restriction_ethnie_non_caucasien'];

  if (directEffects.includes(gang.effet)) {
    const result = SpecialEntities.applyGangEffect(gameState, pid, quartierId, gameData.gameplay, {});
    showMayorResultToast(result.msg || result.reason);
    gameState.save(); refreshMap(); refresh();
  } else if (needsTarget.includes(gang.effet)) {
    showGangTargetPlayerModal(pid, quartierId, gang, refresh);
  } else if (needsQuartier.includes(gang.effet)) {
    showGangQuartierModal(pid, quartierId, gang, refresh);
  } else if (needsZone.includes(gang.effet)) {
    showGangZoneModal(pid, quartierId, gang, refresh);
  } else if (needsCibles.includes(gang.effet)) {
    showGangCiblesModal(pid, quartierId, gang, refresh);
  } else {
    const result = SpecialEntities.applyGangEffect(gameState, pid, quartierId, gameData.gameplay, {});
    showMayorResultToast(result.msg || result.reason);
    gameState.save(); refreshMap(); refresh();
  }
}

function showGangTargetPlayerModal(pid, quartierId, gang, refresh) {
  const others = gameState.joueurs.filter((_, i) => i !== pid);
  const html = `<h3>🔫 ${gang.nom}</h3><label>Joueur ciblé :</label>
    <select id="f-gang-target">${others.map(j => `<option value="${j.id}">${j.nom}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const cible = Number(document.getElementById('f-gang-target').value);
    const result = SpecialEntities.applyGangEffect(gameState, pid, quartierId, gameData.gameplay, { cible });
    showMayorResultToast(result.msg || result.reason);
    gameState.save(); refreshMap(); refresh();
  });
}

function showGangQuartierModal(pid, quartierId, gang, refresh) {
  const quartiers = gameData.gameplay.quartiers;
  const html = `<h3>🔫 ${gang.nom}</h3><label>Quartier ciblé :</label>
    <select id="f-gang-quartier">${quartiers.map(q => `<option value="${q.id}">${q.nom}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const targetQ = document.getElementById('f-gang-quartier').value;
    const result = SpecialEntities.applyGangEffect(gameState, pid, quartierId, gameData.gameplay, { quartierId: targetQ });
    showMayorResultToast(result.msg || result.reason);
    gameState.save(); refreshMap(); refresh();
  });
}

function showGangZoneModal(pid, quartierId, gang, refresh) {
  const buildable = Object.entries(gameState.plateau)
    .filter(([_, z]) => (z.proprietaire === pid || z.pions.some(p => p.joueur === pid)) && !z.construction)
    .map(([zid]) => zid);
  const html = `<h3>🔫 ${gang.nom}</h3><label>Zone :</label>
    <select id="f-gang-zone">${buildable.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const zone = document.getElementById('f-gang-zone').value;
    const result = SpecialEntities.applyGangEffect(gameState, pid, quartierId, gameData.gameplay, { zone });
    showMayorResultToast(result.msg || result.reason);
    gameState.save(); refreshMap(); refresh();
  });
}

function showGangCiblesModal(pid, quartierId, gang, refresh) {
  const enemyPions = [];
  Object.entries(gameState.plateau).forEach(([zid, zone]) => {
    zone.pions.forEach((p, i) => {
      if (p.joueur !== pid && p.joueur != null) {
        enemyPions.push({ zone: zid, idx: i, type: p.type, joueur: p.joueur });
      }
    });
  });
  if (enemyPions.length === 0) {
    showMayorResultToast('Aucun pion ennemi à cibler');
    refresh();
    return;
  }

  const selected = new Set();
  function refreshCibles() {
    const modal = document.getElementById('order-modal');
    const body = modal.querySelector('.modal-body');
    body.innerHTML = `<h3>🔫 ${gang.nom}</h3><p style="font-size:12px;color:#888">Sélectionnez jusqu'à 3 pions ennemis</p>
      <div style="max-height:40vh;overflow-y:auto">${enemyPions.map((p, i) => {
        const j = gameState.joueurs[p.joueur];
        const sel = selected.has(i);
        return `<div class="gang-cible-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border:1px solid ${sel ? '#e74c3c' : '#334'};border-radius:4px;margin-bottom:4px;background:${sel ? 'rgba(231,76,60,0.08)' : 'transparent'}">
          <span class="hud-player-dot" style="background:${j.couleur}"></span>
          <span>${p.type.replace(/_/g, ' ')} sur ${p.zone}</span>
          <span style="margin-left:auto;color:${j.couleur};font-size:12px">${j.nom}</span>
          ${sel ? '<span style="color:#e74c3c">✓</span>' : ''}
        </div>`;
      }).join('')}</div>
      <div style="text-align:center;margin-top:6px;font-size:12px;color:#888">${selected.size}/3</div>
      <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok" ${selected.size === 0 ? 'disabled' : ''}>Éliminer</button></div>`;

    body.querySelectorAll('.gang-cible-row').forEach(row => {
      row.onclick = () => {
        const idx = Number(row.dataset.idx);
        if (selected.has(idx)) selected.delete(idx);
        else if (selected.size < 3) selected.add(idx);
        refreshCibles();
      };
    });

    body.querySelector('#modal-cancel').onclick = () => closeModal();
    body.querySelector('#modal-ok').onclick = () => {
      closeModal();
      const cibles = [...selected].map(i => ({ zone: enemyPions[i].zone, idx: enemyPions[i].idx }));
      const result = SpecialEntities.applyGangEffect(gameState, pid, quartierId, gameData.gameplay, { cibles });
      showMayorResultToast(result.msg || result.reason);
      gameState.save(); refreshMap(); refresh();
    };
  }

  const modal = document.getElementById('order-modal');
  modal.classList.remove('hidden');
  refreshCibles();
}

/* ── Heist Modal ── */
function showHeistModal(pid, refresh) {
  const heists = Object.entries(HEIST_TYPES).map(([id, def]) => {
    const check = HeistEngine.canHeist(gameState, pid, id, gameData.gameplay);
    return { id, ...def, canDo: check.ok, reason: check.reason || '', check };
  });

  const html = `<h3>💰 Cambriolage</h3>
    ${heists.map(h => `<button class="op-btn heist-choice" data-hid="${h.id}" ${!h.canDo ? 'disabled' : ''} style="text-align:left;margin-bottom:6px">
      <strong>${h.icon} ${h.label}</strong>${!h.canDo ? ' ⛔' : ''}
      <br><span style="font-size:11px;color:#aaa">${h.butin}</span>
      ${!h.canDo ? `<br><span style="font-size:11px;color:#e74c3c">${h.reason}</span>` : ''}
    </button>`).join('')}
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>`;

  openModal(html, () => {});

  document.querySelectorAll('.heist-choice:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal();
      const hid = btn.dataset.hid;
      if (hid === 'casino' || hid === 'labo') {
        showHeistTargetModal(pid, hid, refresh);
      } else {
        const result = HeistEngine.executeHeist(gameState, pid, hid, {}, gameData.gameplay);
        showHeistToast(result.msg || result.reason);
        gameState.save();
        refreshMap();
        refresh();
      }
    });
  });
}

function showHeistTargetModal(pid, heistType, refresh) {
  const check = HeistEngine.canHeist(gameState, pid, heistType, gameData.gameplay);
  const zones = heistType === 'casino' ? check.casinoZones : check.laboZones;
  if (!zones || zones.length === 0) return;

  const html = `<h3>${HEIST_TYPES[heistType].icon} ${HEIST_TYPES[heistType].label}</h3>
    <label>Cible :</label>
    <select id="f-heist-target">${zones.map(z => {
      const owner = gameState.plateau[z]?.proprietaire;
      const ownerName = owner != null ? gameState.joueurs[owner]?.nom : '—';
      return `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z} (${ownerName})</option>`;
    }).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Cambrioler</button></div>`;

  openModal(html, () => {
    const targetZone = document.getElementById('f-heist-target').value;
    const result = HeistEngine.executeHeist(gameState, pid, heistType, { targetZone }, gameData.gameplay);
    showHeistToast(result.msg || result.reason);
    gameState.save();
    refreshMap();
    refresh();
  });
}

function showHeistToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'heist-toast';
  toast.textContent = '💰 ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
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
  const contractLog = ContractEngine.executeAutoContracts(gameState);
  const supplyLog = RevenueEngine.processSupplyOrders(gameState, turnManager.supplyOrders, gameData.gameplay, gameData.adjacencies);
  const revenueLog = RevenueEngine.calculateRevenues(gameState, gameData.gameplay, gameData.adjacencies);
  const expired = ContractEngine.tickContracts(gameState);
  gameState.save();
  refreshMap();

  const cLog = contractLog.map(cl => ({
    pid: cl.contrat.joueur_a,
    type: cl.ok ? 'rev' : 'warn',
    msg: cl.msg
  }));
  const eLog = expired.map(c => ({
    pid: -1,
    type: 'warn',
    msg: `📜 Contrat #${c.id} expiré (${CONTRACT_TYPES[c.type]?.label || c.type})`
  }));

  showRevealOverlay('Révélation & récolte', [...cLog, ...eLog, ...supplyLog, ...revenueLog], () => {
    const w = checkVictory();
    if (w) { hideAllOverlays(); showVictoryScreen(w); }
    else turnManager.continueFromReveal();
  });
}

/* ── Negotiation (Phase 3) ── */
function renderNegotiation() {
  const ov = document.getElementById('negotiation-ov');
  const container = ov.querySelector('.nego-container');
  const active = ContractEngine.getActiveContracts(gameState);

  container.innerHTML = `
    <div class="nego-title">Phase de négociation</div>
    <div class="nego-sub">Discutez entre joueurs : accords, menaces, alliances…<br>Le plateau est visible derrière cet écran.</div>
    <div class="nego-actions">
      <button class="btn-primary" id="btn-add-contract">📜 Nouveau contrat</button>
      <button class="btn-secondary" id="btn-coupole">⚖️ Convoquer la Coupole</button>
    </div>
    ${active.length > 0 ? `
      <div class="section-title" style="text-align:center;margin-top:4px">Contrats actifs</div>
      <div class="nego-contracts">${active.map(c => renderContractCard(c)).join('')}</div>
    ` : '<div style="text-align:center;font-size:12px;color:#555;margin-top:4px">Aucun contrat actif</div>'}
    <button class="btn-primary" id="btn-end-nego" style="margin-top:8px">Fin des négociations</button>
  `;

  container.querySelector('#btn-add-contract').onclick = () => showCreateContractModal(() => renderNegotiation());
  container.querySelector('#btn-coupole').onclick = () => showCoupoleModal(() => renderNegotiation());
  container.querySelector('#btn-end-nego').onclick = () => { ov.classList.add('hidden'); turnManager.endNegotiation(); };

  container.querySelectorAll('.contract-cancel').forEach(btn => {
    btn.onclick = () => {
      ContractEngine.cancelContract(gameState, Number(btn.dataset.cid));
      gameState.save();
      renderNegotiation();
    };
  });

  ov.classList.remove('hidden');
}

function renderContractCard(c) {
  const typeDef = CONTRACT_TYPES[c.type] || CONTRACT_TYPES.libre;
  const jA = gameState.joueurs[c.joueur_a];
  const jB = gameState.joueurs[c.joueur_b];
  const breach = !c.honore ? ' breached' : '';
  return `<div class="contract-card${breach}">
    <span class="contract-icon">${typeDef.icon}</span>
    <div class="contract-info">
      <div class="contract-parties"><span style="color:${jA.couleur}">${jA.nom}</span> → <span style="color:${jB.couleur}">${jB.nom}</span></div>
      <div class="contract-desc">${c.description || typeDef.label}${c.montant > 0 ? ` (${c.montant}/tour)` : ''}</div>
      <div class="contract-meta">Tour ${c.tour_creation} · ${c.tours_restants} tour${c.tours_restants > 1 ? 's' : ''} restant${c.tours_restants > 1 ? 's' : ''}${!c.honore ? ' · ⚠ Non honoré' : ''}</div>
    </div>
    <button class="contract-cancel" data-cid="${c.id}">Annuler</button>
  </div>`;
}

function showCreateContractModal(onDone) {
  const joueurs = gameState.joueurs;
  const typeOptions = Object.entries(CONTRACT_TYPES).map(([id, t]) => `<option value="${id}">${t.icon} ${t.label}</option>`).join('');

  const html = `
    <h3>📜 Nouveau contrat</h3>
    <label>Joueur A (qui donne / s'engage) :</label>
    <select id="f-cjoueurA">${joueurs.map(j => `<option value="${j.id}">${j.nom}</option>`).join('')}</select>
    <label>Joueur B (qui reçoit / bénéficie) :</label>
    <select id="f-cjoueurB">${joueurs.map((j, i) => `<option value="${j.id}" ${i === 1 ? 'selected' : ''}>${j.nom}</option>`).join('')}</select>
    <label>Type de contrat :</label>
    <select id="f-ctype">${typeOptions}</select>
    <label>Description (termes de l'accord) :</label>
    <input type="text" id="f-cdesc" placeholder="ex: 50 lingots/tour pendant 3 tours" style="width:100%;padding:6px;background:#1a1a2e;color:#eee;border:1px solid #334;border-radius:4px">
    <label>Montant par tour (pour transferts auto) :</label>
    <input type="number" id="f-cmontant" value="0" min="0" style="width:100%;padding:6px;background:#1a1a2e;color:#eee;border:1px solid #334;border-radius:4px">
    <label>Durée (en tours) :</label>
    <input type="number" id="f-cduree" value="5" min="1" max="50" style="width:100%;padding:6px;background:#1a1a2e;color:#eee;border:1px solid #334;border-radius:4px">
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Créer</button></div>
  `;

  openModal(html, () => {
    const joueurA = Number(document.getElementById('f-cjoueurA').value);
    const joueurB = Number(document.getElementById('f-cjoueurB').value);
    const typeContrat = document.getElementById('f-ctype').value;
    const description = document.getElementById('f-cdesc').value;
    const montant = parseInt(document.getElementById('f-cmontant').value) || 0;
    const duree = parseInt(document.getElementById('f-cduree').value) || 5;

    if (joueurA === joueurB) {
      showContractToast('Un contrat nécessite deux parties différentes');
      return;
    }

    ContractEngine.createContract(gameState, { joueurA, joueurB, typeContrat, description, montant, duree });
    showContractToast('Contrat enregistré');
    if (onDone) onDone();
  });
}

function showCoupoleModal(onDone) {
  const joueurs = gameState.joueurs;

  const html = `
    <h3>⚖️ Convoquer la Coupole</h3>
    <label>Plaignant (qui convoque) :</label>
    <select id="f-plaintiff">${joueurs.map(j => `<option value="${j.id}">${j.nom} (${j.nb_coupole_restantes || 0} restante${(j.nb_coupole_restantes || 0) > 1 ? 's' : ''})</option>`).join('')}</select>
    <label>Accusé :</label>
    <select id="f-accused">${joueurs.map((j, i) => `<option value="${j.id}" ${i === 1 ? 'selected' : ''}>${j.nom}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Réunir la Coupole</button></div>
  `;

  openModal(html, () => {
    const plaintiffId = Number(document.getElementById('f-plaintiff').value);
    const accusedId = Number(document.getElementById('f-accused').value);

    if (plaintiffId === accusedId) {
      showCoupoleToast('Le plaignant et l\'accusé doivent être différents');
      return;
    }

    const check = ContractEngine.canConvokeCoupole(gameState, plaintiffId);
    if (!check.ok) {
      showCoupoleToast(check.reason);
      return;
    }

    showCoupoleVoteModal(plaintiffId, accusedId, onDone);
  });
}

function showCoupoleVoteModal(plaintiffId, accusedId, onDone) {
  const ov = document.getElementById('coupole-ov');
  const body = ov.querySelector('.coupole-body');
  const votants = gameState.joueurs.filter(j => j.id !== plaintiffId && j.id !== accusedId);
  const votes = {};

  function refreshVotes() {
    const allVoted = votants.every(j => votes[j.id] !== undefined);
    body.innerHTML = `
      <div class="coupole-title">⚖️ La Coupole</div>
      <div class="coupole-sub">
        <strong style="color:${gameState.joueurs[plaintiffId].couleur}">${gameState.joueurs[plaintiffId].nom}</strong> accuse
        <strong style="color:${gameState.joueurs[accusedId].couleur}">${gameState.joueurs[accusedId].nom}</strong> de trahison.
      </div>
      ${votants.map(j => `<div class="coupole-vote-row">
        <span class="hud-player-dot" style="background:${j.couleur}"></span>
        <span>${j.nom}</span>
        <div class="coupole-vote-btns">
          <button class="coupole-vote-btn guilty ${votes[j.id] === true ? 'selected' : ''}" data-pid="${j.id}" data-vote="guilty">Coupable</button>
          <button class="coupole-vote-btn innocent ${votes[j.id] === false ? 'selected' : ''}" data-pid="${j.id}" data-vote="innocent">Innocent</button>
        </div>
      </div>`).join('')}
      <button id="btn-coupole-resolve" class="btn-primary" style="margin-top:16px;width:100%" ${!allVoted ? 'disabled' : ''}>Rendre le verdict</button>
    `;

    body.querySelectorAll('.coupole-vote-btn').forEach(btn => {
      btn.onclick = () => {
        const pid = Number(btn.dataset.pid);
        votes[pid] = btn.dataset.vote === 'guilty';
        refreshVotes();
      };
    });

    body.querySelector('#btn-coupole-resolve')?.addEventListener('click', () => {
      const result = ContractEngine.resolveCoupole(gameState, plaintiffId, accusedId, votes);
      const isGuilty = result.verdict === 'coupable';
      body.innerHTML = `
        <div class="coupole-title">⚖️ Verdict de la Coupole</div>
        <div class="coupole-sub">${result.pour} pour · ${result.contre} contre</div>
        <div class="coupole-result ${isGuilty ? 'guilty' : 'acquitted'}">
          ${isGuilty ? `☠️ COUPABLE — ${result.sanction}` : '✅ ACQUITTÉ — Aucune sanction'}
        </div>
        <button class="btn-primary" id="btn-coupole-close" style="margin-top:16px;width:100%">Fermer</button>
      `;
      body.querySelector('#btn-coupole-close').onclick = () => {
        ov.classList.add('hidden');
        refreshMap();
        if (onDone) onDone();
      };
    });
  }

  refreshVotes();
  ov.classList.remove('hidden');
}

function showContractToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'contract-toast';
  toast.textContent = '📜 ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showCoupoleToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'coupole-toast';
  toast.textContent = '⚖️ ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
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
  turnLog.push(...log);
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
/* ── Election ── */
function renderElectionIntro() {
  const ov = document.getElementById('election-intro-ov');
  const electionNum = Math.floor(gameState.tour / ELECTION_INTERVAL);
  ov.querySelector('.election-intro-subtitle').textContent = `Tour ${gameState.tour} — ${electionNum}${electionNum === 1 ? 'ère' : 'ème'} élection`;

  const maire = gameState.maire.joueur_id !== null ? gameState.joueurs[gameState.maire.joueur_id] : null;
  const mayorDiv = ov.querySelector('.election-intro-mayor');
  if (maire) {
    mayorDiv.innerHTML = `<div><div class="election-intro-mayor-label">Maire sortant</div><div class="election-intro-mayor-name" style="color:${maire.couleur}">${maire.nom}</div></div>`;
  } else {
    mayorDiv.innerHTML = `<div><div class="election-intro-mayor-label">Aucun maire en place</div><div class="election-intro-mayor-name" style="color:#888">Premier scrutin</div></div>`;
  }

  ov.querySelector('.election-intro-stakes').innerHTML = `
    <div class="election-intro-stake"><span class="election-intro-stake-icon">🏛️</span><span>Le maire gagne <strong>15 points de victoire</strong></span></div>
    <div class="election-intro-stake"><span class="election-intro-stake-icon">⚡</span><span><strong>2 privilèges</strong> : taxe, coupure, flics, expropriation…</span></div>
    <div class="election-intro-stake"><span class="election-intro-stake-icon">👥</span><span>Vote pondéré par la <strong>population contrôlée</strong></span></div>
    <div class="election-intro-stake"><span class="election-intro-stake-icon">🃏</span><span>Suivi du <strong>tirage de cartes magouille</strong> (8→4)</span></div>
  `;

  ov.querySelector('#btn-election-intro-go').onclick = () => {
    ov.classList.add('hidden');
    turnManager.confirmElectionIntro();
  };
  ov.classList.remove('hidden');
}

function renderElectionCurtain() {
  const ov = document.getElementById('curtain');
  const j = turnManager.currentPlayer;
  ov.querySelector('.curtain-turn').textContent = `Tour ${gameState.tour}`;
  ov.querySelector('.curtain-player').textContent = j.nom;
  ov.querySelector('.curtain-player').style.color = j.couleur;
  ov.querySelector('.curtain-phase').textContent = '🗳️ Élection municipale — Vote secret';
  ov.querySelector('#btn-curtain-go').textContent = `Je suis ${j.nom}`;
  ov.querySelector('#btn-curtain-go').onclick = () => {
    ov.classList.add('hidden');
    turnManager.confirmElectionCurtain();
  };
  ov.classList.remove('hidden');
}

function renderElectionVote() {
  const ov = document.getElementById('election-ov');
  const voter = turnManager.currentPlayer;
  const body = ov.querySelector('.election-body');
  let selectedCandidate = null;

  const candidateCards = gameState.joueurs.map(j => {
    const pts = gameState.getPlayerPoints(j.id, gameData.gameplay);
    return `<div class="vote-candidate" data-pid="${j.id}" role="button" tabindex="0">
      <span class="vote-candidate-dot" style="background:${j.couleur}"></span>
      <span class="vote-candidate-name">${j.nom}</span>
      <span class="vote-candidate-info">${pts} pts</span>
    </div>`;
  }).join('');

  body.innerHTML = `
    <div class="election-title">🗳️ Élection municipale</div>
    <div class="election-sub">Tour ${gameState.tour} — <strong style="color:${voter.couleur}">${voter.nom}</strong>, votez pour votre candidat</div>
    <div class="vote-candidates">${candidateCards}</div>
    <button id="btn-vote-submit" class="btn-main" disabled>Voter</button>
  `;

  body.querySelectorAll('.vote-candidate').forEach(el => {
    el.addEventListener('click', () => {
      body.querySelectorAll('.vote-candidate').forEach(c => c.classList.remove('selected'));
      el.classList.add('selected');
      selectedCandidate = Number(el.dataset.pid);
      body.querySelector('#btn-vote-submit').disabled = false;
    });
  });

  body.querySelector('#btn-vote-submit').addEventListener('click', () => {
    if (selectedCandidate !== null) {
      ov.classList.add('hidden');
      turnManager.submitVote(selectedCandidate);
    }
  });

  ov.classList.remove('hidden');
}

function renderElectionResult() {
  const ov = document.getElementById('election-ov');
  const body = ov.querySelector('.election-body');
  const results = turnManager.getElectionResults(gameData.gameplay);
  const maxVotes = Math.max(1, ...Object.values(results.candidateVotes));

  const rows = gameState.joueurs.map(j => {
    const votes = results.candidateVotes[j.id] || 0;
    const pct = Math.round((votes / maxVotes) * 100);
    const power = results.voterPower[j.id] || 0;
    const isWinner = results.winner === j.id;
    return `<div class="election-result-row" style="${isWinner ? 'border:1px solid #f8c48a;' : ''}">
      <span class="vote-candidate-dot" style="background:${j.couleur}"></span>
      <span style="width:100px;font-weight:600">${j.nom}</span>
      <div style="flex:1;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;">
        <div class="election-bar" style="width:${pct}%;background:${j.couleur}"></div>
      </div>
      <span style="min-width:90px;text-align:right;font-size:13px">${(votes / 1000).toFixed(0)}k voix</span>
      <span style="min-width:80px;text-align:right;font-size:11px;color:#888">(poids: ${(power / 1000).toFixed(0)}k)</span>
    </div>`;
  }).join('');

  let banner = '';
  if (results.winner !== null) {
    const w = gameState.joueurs[results.winner];
    banner = `<div class="election-winner-banner" style="color:${w.couleur}">🏛️ ${w.nom} est élu(e) Maire !</div>`;
  } else {
    banner = `<div class="election-winner-banner">Égalité — aucun maire élu ce tour</div>`;
  }

  body.innerHTML = `
    <div class="election-title">🗳️ Résultats de l'élection</div>
    <div class="election-results">${rows}</div>
    ${banner}
    <button id="btn-election-continue" class="btn-main" style="margin-top:16px">Continuer</button>
  `;

  body.querySelector('#btn-election-continue').addEventListener('click', () => {
    ov.classList.add('hidden');
    turnManager.applyElectionResult(results.winner);
  });

  ov.classList.remove('hidden');
}

/* ── Draft Magouille ── */
function renderDraftCurtain() {
  const ov = document.getElementById('curtain');
  const j = turnManager.currentPlayer;
  ov.querySelector('.curtain-turn').textContent = `Tour ${gameState.tour}`;
  ov.querySelector('.curtain-player').textContent = j.nom;
  ov.querySelector('.curtain-player').style.color = j.couleur;
  ov.querySelector('.curtain-phase').textContent = '🃏 Tirage de cartes Magouille';
  ov.querySelector('#btn-curtain-go').textContent = `Je suis ${j.nom}`;
  ov.querySelector('#btn-curtain-go').onclick = () => {
    ov.classList.add('hidden');
    turnManager.confirmDraftCurtain();
  };
  ov.classList.remove('hidden');
}

function renderDraftPick() {
  const pid = turnManager.currentPlayerId;
  const j = gameState.joueurs[pid];

  if (!turnManager.draftHands || Object.keys(turnManager.draftHands).length === 0) {
    if (!gameState.deck_magouille.pile || gameState.deck_magouille.pile.length === 0) {
      MagouilleEngine.initDeck(gameState, cartesDef);
    }
    const hands = MagouilleEngine.draftPhase(gameState, cartesDef);
    turnManager.setDraftHands(hands);
  }

  const hand = turnManager.draftHands[pid] || [];
  const selected = new Set();

  const ov = document.getElementById('election-ov');
  const body = ov.querySelector('.election-body');

  function refreshDraft() {
    const cards = hand.map(uid => {
      const card = MagouilleEngine.getCardDef(gameState, uid, cartesDef);
      if (!card) return '';
      const sel = selected.has(uid);
      const imgSrc = card.image ? `assets/cards/${card.image}.png` : null;
      return `<div class="draft-card ${sel ? 'draft-selected' : ''}" data-uid="${uid}" role="button" tabindex="0">
        ${imgSrc ? `<img src="${imgSrc}" class="draft-card-img" onerror="this.style.display='none'">` : '<div class="draft-card-img draft-card-placeholder">🃏</div>'}
        <div class="draft-card-info">
          <strong>${card.nom}</strong>
          <span class="draft-card-desc">${card.description}</span>
          ${Object.keys(card.cout || {}).length ? `<span class="draft-card-cost">${Object.entries(card.cout).map(([k,v]) => `${v}${k[0].toUpperCase()}`).join(' ')}</span>` : '<span class="draft-card-cost">Gratuit</span>'}
        </div>
        <div class="draft-card-actions" onclick="event.stopPropagation()">
          <button class="draft-card-expand" title="Voir la fiche complète">ℹ️ Détails</button>
          <button class="draft-card-select">${sel ? '✓ Retirer' : '+ Garder'}</button>
        </div>
      </div>`;
    }).join('');

    body.innerHTML = `
      <div class="election-title">🃏 Cartes Magouille</div>
      <div class="election-sub"><strong style="color:${j.couleur}">${j.nom}</strong>, choisissez 4 cartes parmi 8</div>
      <div class="draft-card-list">${cards}</div>
      <div style="text-align:center;margin-top:8px;font-size:13px;color:#888">${selected.size}/4 sélectionnée(s)</div>
      <button id="btn-draft-confirm" class="btn-main" style="margin-top:12px" ${selected.size !== 4 ? 'disabled' : ''}>Confirmer mon choix</button>
    `;

    body.querySelectorAll('.draft-card').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.draft-card-actions')) return;
        const uid = el.dataset.uid;
        if (selected.has(uid)) { selected.delete(uid); }
        else if (selected.size < 4) { selected.add(uid); }
        refreshDraft();
      });
    });
    body.querySelectorAll('.draft-card-select').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.closest('.draft-card').dataset.uid;
        if (selected.has(uid)) { selected.delete(uid); }
        else if (selected.size < 4) { selected.add(uid); }
        refreshDraft();
      });
    });
    body.querySelectorAll('.draft-card-expand').forEach(btn => {
      btn.addEventListener('click', () => {
        const uid = btn.closest('.draft-card').dataset.uid;
        const card = MagouilleEngine.getCardDef(gameState, uid, cartesDef);
        if (card) showMagouilleCardDetail(card, false, null, null);
      });
    });

    body.querySelector('#btn-draft-confirm')?.addEventListener('click', () => {
      const keptUids = [...selected];
      MagouilleEngine.keepCards(gameState, pid, keptUids);
      MagouilleEngine.discardFromDraft(gameState, hand, keptUids);
      ov.classList.add('hidden');
      turnManager.submitDraftPick();
    });
  }

  refreshDraft();
  ov.classList.remove('hidden');
}

function showMagouilleCardDetail(card, canPlay, reason, onPlay) {
  const ov = document.getElementById('magouille-detail-ov');
  if (!ov) return;
  const isInfoOnly = reason === null && !canPlay;

  ov.querySelector('.magouille-detail-title').textContent = card.nom;

  const imgEl = ov.querySelector('.magouille-detail-img');
  if (card.image) {
    imgEl.src = `assets/cards/${card.image}.png`;
    imgEl.style.display = '';
    imgEl.onerror = () => { imgEl.style.display = 'none'; };
  } else {
    imgEl.style.display = 'none';
  }

  const texteOriginal = card.texte_original;
  if (texteOriginal && texteOriginal.length > 0) {
    ov.querySelector('.magouille-detail-desc').innerHTML = texteOriginal.map(p => `<p>${p}</p>`).join('');
  } else {
    ov.querySelector('.magouille-detail-desc').textContent = card.description;
  }

  const conds = (card.conditions || []).map(c => CONDITION_LABELS[c] || c).join(' ; ');
  const coutStr = Object.keys(card.cout || {}).length
    ? Object.entries(card.cout).map(([k, v]) => `${v} ${k}`).join(', ')
    : 'Gratuit';

  ov.querySelector('.magouille-detail-meta').innerHTML = `
    ${!texteOriginal ? `<div><strong>Coût :</strong> ${coutStr}</div>
    ${conds ? `<div><strong>Conditions :</strong> ${conds}</div>` : ''}
    ${card.phase_jouable ? `<div>Phase jouable : ${card.phase_jouable === 'any' ? 'Toute phase' : `Phase ${card.phase_jouable}`}</div>` : ''}
    ${card.duree ? `<div>Durée : ${card.duree === 'immediat' ? 'Immédiat' : card.duree === 'tour' ? 'Ce tour' : card.duree}</div>` : ''}
    ${card.repose_sous_pile !== undefined ? `<div>${card.repose_sous_pile ? 'Retourne sous la pile après usage' : 'Retirée du jeu après usage'}</div>` : ''}` : ''}
    ${!isInfoOnly && !canPlay && reason ? `<div style="color:#e74c3c;margin-top:8px">⛔ ${reason}</div>` : ''}
  `;
  const actionsDiv = ov.querySelector('.magouille-detail-actions');
  if (actionsDiv) {
    actionsDiv.innerHTML = canPlay
      ? `<button class="btn-primary" id="magouille-detail-play">Jouer cette carte</button>`
      : '';
    ov.querySelector('#magouille-detail-play')?.addEventListener('click', () => {
      ov.classList.add('hidden');
      if (onPlay) onPlay();
    });
  }
  ov.classList.remove('hidden');
}

/* ── Play Magouille Card (from order panel) ── */
function showPlayCardModal(pid, currentPhase, refresh) {
  const j = gameState.joueurs[pid];
  const hand = j.cartes_magouille || [];
  if (hand.length === 0) {
    openModal(`<h3>🃏 Cartes Magouille</h3><p style="color:#888">Vous n'avez aucune carte en main.</p>
      <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Fermer</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>`, () => {});
    return;
  }

  const cards = hand.map(uid => {
    const card = MagouilleEngine.getCardDef(gameState, uid, cartesDef);
    if (!card) return '';
    const check = MagouilleEngine.canPlay(gameState, pid, uid, currentPhase, cartesDef);
    return `<button class="op-btn magouille-card-btn" data-uid="${uid}" data-canplay="${check.ok}" data-reason="${(check.reason || '').replace(/"/g, '&quot;')}" style="text-align:left;margin-bottom:6px">
      <strong>${card.nom}</strong>${!check.ok ? ' ⛔' : ''}
      <br><span style="font-size:12px;color:#bbb">${card.description.substring(0, 90)}…</span>
      ${Object.keys(card.cout || {}).length ? `<br><span style="font-size:12px;color:#f8c48a">${Object.entries(card.cout).map(([k,v]) => `${v} ${k}`).join(', ')}</span>` : ''}
    </button>`;
  }).join('');

  const html = `
    <h3>🃏 Jouer une carte Magouille</h3>
    <p style="font-size:12px;color:#888;margin-bottom:8px">Cliquez sur une carte pour voir les détails complets, puis « Jouer » pour l'utiliser.</p>
    <div class="magouille-card-list">${cards}</div>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok" style="display:none">OK</button></div>
  `;

  openModal(html, () => {});

  document.querySelectorAll('.magouille-card-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const uid = btn.dataset.uid;
      const card = MagouilleEngine.getCardDef(gameState, uid, cartesDef);
      if (!card) return;
      const canPlay = btn.dataset.canplay === 'true';
      const reason = btn.dataset.reason || '';
      showMagouilleCardDetail(card, canPlay, reason, () => {
        closeModal();
        executeCardWithParams(pid, uid, currentPhase, refresh);
      });
    });
  });
}

function executeCardWithParams(pid, uid, currentPhase, refresh) {
  const card = MagouilleEngine.getCardDef(gameState, uid, cartesDef);
  if (!card) return;

  switch (card.effet) {
    case 'tuer_pion':
    case 'retirer_pion':
      showCardTargetPionModal(pid, uid, card, refresh);
      break;

    case 'retirer_electeurs':
    case 'rendre_ineligible':
      showCardTargetPlayerModal(pid, uid, card, refresh);
      break;

    case 'teleporter_pion':
      showCardTeleportModal(pid, uid, card, refresh);
      break;

    case 'couper_electricite':
      showCardQuartierModal(pid, uid, card, refresh);
      break;

    case 'deplacer_incorruptible':
      showCardMoveIncorruptibleModal(pid, uid, card, refresh);
      break;

    case 'contaminer_prostituees':
      showCardZoneModal(pid, uid, card, 'Zone de la prostituée à contaminer', refresh);
      break;

    default: {
      const result = MagouilleEngine.play(gameState, pid, uid, {}, cartesDef);
      showMagouilleToast(result.msg);
      if (refresh) refresh();
    }
  }
}

function showCardTargetPionModal(pid, uid, card, refresh) {
  const allPions = [];
  Object.entries(gameState.plateau).forEach(([zid, zone]) => {
    zone.pions.forEach((p, i) => {
      if (card.effet === 'retirer_pion' || p.joueur !== pid) {
        allPions.push({ zone: zid, idx: i, type: p.type, joueur: p.joueur });
      }
    });
  });
  if (allPions.length === 0) { showMagouilleToast('Aucun pion ciblable'); return; }

  const html = `<h3>🃏 ${card.nom}</h3><label>Pion ciblé :</label>
    <select id="f-target-pion">${allPions.map((p, i) => `<option value="${i}">${p.type} sur ${p.zone} — ${gameData.gameplay.zones[p.zone]?.nom || ''} (${gameState.joueurs[p.joueur]?.nom || 'neutre'})</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const sel = allPions[Number(document.getElementById('f-target-pion').value)];
    const result = MagouilleEngine.play(gameState, pid, uid, { zone: sel.zone, pionIdx: sel.idx }, cartesDef);
    showMagouilleToast(result.msg);
    if (refresh) refresh();
  });
}

function showCardTargetPlayerModal(pid, uid, card, refresh) {
  const others = gameState.joueurs.filter((_, i) => i !== pid);
  const html = `<h3>🃏 ${card.nom}</h3><label>Joueur ciblé :</label>
    <select id="f-target">${others.map(j => `<option value="${j.id}">${j.nom}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const cible = Number(document.getElementById('f-target').value);
    const result = MagouilleEngine.play(gameState, pid, uid, { cible }, cartesDef);
    showMagouilleToast(result.msg);
    if (refresh) refresh();
  });
}

function showCardTeleportModal(pid, uid, card, refresh) {
  const myPions = [];
  Object.entries(gameState.plateau).forEach(([zid, zone]) => {
    zone.pions.forEach((p, i) => {
      if (p.joueur === pid) myPions.push({ zone: zid, idx: i, type: p.type });
    });
  });
  if (myPions.length === 0) { showMagouilleToast('Aucun pion à téléporter'); return; }
  const allZones = Object.keys(gameState.plateau);
  const html = `<h3>🃏 ${card.nom}</h3>
    <label>Pion :</label><select id="f-pion">${myPions.map((p, i) => `<option value="${i}">${p.type} sur ${p.zone} — ${gameData.gameplay.zones[p.zone]?.nom || ''}</option>`).join('')}</select>
    <label>Destination :</label><select id="f-dest">${allZones.map(z => `<option value="${z}">${z} — ${gameData.gameplay.zones[z]?.nom || z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Téléporter</button></div>`;
  openModal(html, () => {
    const sel = myPions[Number(document.getElementById('f-pion').value)];
    const result = MagouilleEngine.play(gameState, pid, uid, { fromZone: sel.zone, pionIdx: sel.idx, toZone: document.getElementById('f-dest').value }, cartesDef);
    showMagouilleToast(result.msg);
    if (refresh) refresh();
  });
}

function showCardQuartierModal(pid, uid, card, refresh) {
  const quartiers = gameData.gameplay.quartiers;
  const html = `<h3>🃏 ${card.nom}</h3><label>Quartier :</label>
    <select id="f-quartier">${quartiers.map(q => `<option value="${q.id}">${q.nom}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const result = MagouilleEngine.play(gameState, pid, uid, { quartierId: document.getElementById('f-quartier').value, gameplayData: gameData.gameplay }, cartesDef);
    showMagouilleToast(result.msg);
    if (refresh) refresh();
  });
}

function showCardMoveIncorruptibleModal(pid, uid, card, refresh) {
  const incZones = Object.entries(gameState.plateau).filter(([_, z]) => z.pions.some(p => p.type === 'incorruptible')).map(([zid]) => zid);
  const allZones = Object.keys(gameState.plateau);
  if (incZones.length === 0) { showMagouilleToast('Aucun incorruptible sur le plateau'); return; }
  const html = `<h3>🃏 ${card.nom}</h3>
    <label>Incorruptible actuel :</label><select id="f-from">${incZones.map(z => `<option value="${z}">${z}</option>`).join('')}</select>
    <label>Nouvelle zone :</label><select id="f-to">${allZones.map(z => `<option value="${z}">${z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Déplacer</button></div>`;
  openModal(html, () => {
    const result = MagouilleEngine.play(gameState, pid, uid, { fromZone: document.getElementById('f-from').value, toZone: document.getElementById('f-to').value }, cartesDef);
    showMagouilleToast(result.msg);
    if (refresh) refresh();
  });
}

function showCardZoneModal(pid, uid, card, label, refresh) {
  const allZones = Object.keys(gameState.plateau);
  const html = `<h3>🃏 ${card.nom}</h3><label>${label} :</label>
    <select id="f-zone">${allZones.map(z => `<option value="${z}">${z}</option>`).join('')}</select>
    <div class="modal-actions"><button class="btn-secondary" id="modal-cancel">Annuler</button><button class="btn-primary" id="modal-ok">Confirmer</button></div>`;
  openModal(html, () => {
    const result = MagouilleEngine.play(gameState, pid, uid, { zone: document.getElementById('f-zone').value, adjacencies: gameData.adjacencies }, cartesDef);
    showMagouilleToast(result.msg);
    if (refresh) refresh();
  });
}

function showMagouilleToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'magouille-toast';
  toast.textContent = '🃏 ' + msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

function renderTurnEnd() {
  const ov = document.getElementById('turnend-ov');
  const body = ov.querySelector('.turnend-body');
  const active = ContractEngine.getActiveContracts(gameState);

  const rankings = gameState.joueurs.map(j => ({
    ...j,
    pts: gameState.getPlayerPoints(j.id, gameData.gameplay)
  })).sort((a, b) => b.pts - a.pts);

  let html = `<div class="turnend-header">
    <div class="turnend-tour">Tour ${gameState.tour}</div>
    <div class="turnend-subtitle">Bilan de fin de tour</div>
  </div>`;

  html += `<div class="turnend-rankings">` +
    rankings.map((j, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const zones = Object.values(gameState.plateau).filter(z => z.proprietaire === j.id).length;
      const quartiers = gameData.gameplay.quartiers.filter(q => gameState.getQuartierOwner(q.id, gameData.gameplay) === j.id);
      return `<div class="turnend-rank" style="border-color:${j.couleur}">
        <div class="turnend-rank-medal">${medal}</div>
        <div class="turnend-rank-info">
          <div class="turnend-rank-name" style="color:${j.couleur}">${j.nom}</div>
          <div class="turnend-rank-detail">${zones} zones · ${quartiers.length} quartier${quartiers.length > 1 ? 's' : ''}</div>
        </div>
        <div class="turnend-rank-pts">${j.pts} <small>pts</small></div>
        <div class="turnend-rank-res">💰${j.ressources.lingots} 🔫${j.ressources.armes} 💊${j.ressources.doses}</div>
      </div>`;
    }).join('') + `</div>`;

  if (turnLog.length > 0) {
    const byPlayer = {};
    turnLog.forEach(e => {
      const k = e.pid >= 0 ? e.pid : -1;
      if (!byPlayer[k]) byPlayer[k] = [];
      byPlayer[k].push(e);
    });
    html += `<div class="turnend-recap"><div class="section-title">Récapitulatif du tour (${turnLog.length} événements)</div>`;
    for (const [pid, entries] of Object.entries(byPlayer)) {
      const joueur = pid >= 0 ? gameState.joueurs[pid] : null;
      const name = joueur ? joueur.nom : 'Général';
      const color = joueur ? joueur.couleur : '#888';
      html += `<div class="turnend-recap-player" style="border-left:3px solid ${color}"><strong style="color:${color}">${name}</strong> · ${entries.length} action${entries.length > 1 ? 's' : ''}</div>`;
    }
    html += `</div>`;
  }

  if (active.length > 0) {
    html += `<div class="section-title" style="margin-top:12px">📜 Contrats actifs (${active.length})</div>` +
      active.map(c => {
        const jA = gameState.joueurs[c.joueur_a];
        const jB = gameState.joueurs[c.joueur_b];
        const typeDef = CONTRACT_TYPES[c.type] || CONTRACT_TYPES.libre;
        return `<div class="reveal-line" style="border-left:3px solid #2ecc71;font-size:12px">${typeDef.icon} <span style="color:${jA.couleur}">${jA.nom}</span> → <span style="color:${jB.couleur}">${jB.nom}</span> : ${c.description || typeDef.label} (${c.tours_restants}t)${!c.honore ? ' <span style="color:#e74c3c">⚠ Non honoré</span>' : ''}</div>`;
      }).join('');
  }

  const winner = gameState.joueurs.find(j => gameState.getPlayerPoints(j.id, gameData.gameplay) >= 55);
  if (winner) {
    html += `<div class="victory-banner" style="color:${winner.couleur}">🏆 ${winner.nom} remporte la partie avec ${gameState.getPlayerPoints(winner.id, gameData.gameplay)} points !</div>`;
  }

  body.innerHTML = html;

  ov.querySelector('#btn-next-turn').textContent = winner ? 'Retour au menu' : 'Tour suivant';
  ov.querySelector('#btn-next-turn').onclick = () => {
    ov.classList.add('hidden');
    if (winner) { renderTitleScreen(); } else { turnLog = []; turnManager.nextTurn(); }
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
    const gangEl = document.getElementById('info-gang');
    gangEl.innerHTML = `<div class="gang-name">${g.nom}</div><div>${g.effet.replace(/_/g, ' ')} · ${dur}</div><div class="gang-more">ℹ Plus d'infos</div>`;
    gangEl.style.cursor = 'pointer';
    gangEl.onclick = () => showGangInfoModal(q);
  } else {
    document.getElementById('info-stats').innerHTML = '';
    document.getElementById('info-gang').innerHTML = '';
  }

  const gameInfoEl = document.getElementById('info-game');
  if (gameState) {
    const zone = gameState.plateau[id];
    let html = '';

    if (zone) {
      if (zone.proprietaire != null) {
        const owner = gameState.joueurs[zone.proprietaire];
        html += `<div class="stat-row"><span class="stat-label">Contrôle</span><span class="stat-value" style="color:${owner.couleur}">${owner.nom}</span></div>`;
      }
      if (zone.construction) {
        const buildLabel = CONSTRUCTION_DEFS[zone.construction]?.label || zone.construction;
        const owner = zone.proprietaire != null ? gameState.joueurs[zone.proprietaire] : null;
        html += `<div class="stat-row"><span class="stat-label">🏗️ ${buildLabel}</span><span class="stat-value" style="color:${owner?.couleur || '#888'}">${owner?.nom || '—'}</span></div>`;
      }
      if (!zone.electricite) {
        html += `<div class="stat-row" style="color:#f39c12"><strong>⚡ Électricité coupée</strong></div>`;
      }
      if (zone.pions.length > 0) {
        html += `<div class="section-title">Pions (${zone.pions.length})</div>` +
          zone.pions.map(p => {
            const j = p.joueur != null ? gameState.joueurs[p.joueur] : null;
            const color = j ? j.couleur : '#888';
            const name = j ? j.nom : 'Neutre';
            return `<div class="stat-row"><span class="stat-label" style="color:${color}">${name}</span><span class="stat-value">${p.type.replace(/_/g, ' ')}</span></div>`;
          }).join('');
      }
      if (zone.gitans) html += `<div class="stat-row" style="color:#795548"><strong>🏕️ Camp de gitans</strong></div>`;
    }
    gameInfoEl.innerHTML = html;
  } else { gameInfoEl.innerHTML = ''; }

  document.getElementById('info-adj').innerHTML = adj.length
    ? `<div class="section-title">Adjacences (${adj.length})</div>` + adj.map(a => `<span onclick="window._selectZone('${a}')">${a}</span>`).join('') : '';

  panel.classList.remove('hidden');
}

const GANG_DESCRIPTIONS = {
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

function showShareModal() {
  if (!gameState) return;
  gameState.save();
  const url = getShareUrl(gameState);
  const ov = document.getElementById('share-ov');
  const qrEl = document.getElementById('share-qr');
  generateQRCode(qrEl, url, 200);

  document.getElementById('share-copy').onclick = async () => {
    try {
      await copyToClipboard(url);
      const btn = document.getElementById('share-copy');
      const orig = btn.textContent;
      btn.textContent = '✓ Copié !';
      setTimeout(() => { btn.textContent = orig; }, 1500);
    } catch (e) {
      alert('Impossible de copier');
    }
  };

  document.getElementById('share-whatsapp').href = getWhatsAppShareUrl(url);
  document.getElementById('share-whatsapp').style.display = '';

  const nativeBtn = document.getElementById('share-native');
  if (canUseWebShare()) {
    nativeBtn.style.display = '';
    nativeBtn.onclick = async () => {
      const ok = await shareViaWebShare('JORETAPO', `Partie Tour ${gameState.tour}`, url);
      if (ok) ov.classList.add('hidden');
    };
  } else {
    nativeBtn.style.display = 'none';
  }

  document.getElementById('share-close').onclick = () => ov.classList.add('hidden');
  ov.onclick = e => { if (e.target === ov) ov.classList.add('hidden'); };
  ov.classList.remove('hidden');
}

function showGangInfoModal(quartier) {
  const g = quartier.gang;
  const dur = g.duree === -1 ? 'Permanent' : g.duree === 0 ? 'Instantané' : `${g.duree} tours`;
  const info = GANG_DESCRIPTIONS[g.effet] || { desc: g.effet.replace(/_/g, ' '), icon: '🔫' };

  let statusHtml = '';
  if (gameState) {
    const gangActif = gameState.gangs_actifs[quartier.id];
    if (gangActif) {
      const owner = gameState.joueurs[gangActif.joueur];
      statusHtml = `<div class="gang-modal-status active"><span style="color:${owner.couleur}">✔ Activé par ${owner.nom}</span> (tour ${gangActif.tour_activation})</div>`;
    } else {
      const owner = gameState.getQuartierOwner(quartier.id, gameData.gameplay);
      if (owner !== null) {
        const j = gameState.joueurs[owner];
        const canActivate = gameState.tour >= ELECTION_INTERVAL;
        statusHtml = `<div class="gang-modal-status"><span style="color:${j.couleur}">${j.nom}</span> contrôle ce quartier${canActivate ? ' — <strong>peut activer</strong>' : ` — activable après le tour ${ELECTION_INTERVAL}`}</div>`;
      } else {
        statusHtml = `<div class="gang-modal-status">Aucun joueur ne contrôle ce quartier</div>`;
      }
    }
  }

  const html = `
    <h3>${info.icon} ${g.nom}</h3>
    <div class="gang-modal-quartier">Quartier : <strong>${quartier.nom}</strong> (${quartier.zones.length} zones, ${quartier.points} pts)</div>
    <div class="gang-modal-effect">${info.desc}</div>
    <div class="gang-modal-details">
      <div class="stat-row"><span class="stat-label">Durée</span><span class="stat-value">${dur}</span></div>
      <div class="stat-row"><span class="stat-label">Usage unique</span><span class="stat-value">${g.usage_unique ? 'Oui — une seule activation' : 'Non — réutilisable'}</span></div>
    </div>
    <div class="gang-modal-howto">
      <div class="section-title">Comment obtenir un gang ?</div>
      <ol>
        <li><strong>Contrôler toutes les zones</strong> du quartier (avoir au moins un pion ou être propriétaire de chaque zone)</li>
        <li><strong>Attendre le tour 10</strong> — les gangs ne sont activables qu'à partir du 10ᵉ tour</li>
        <li><strong>Utiliser une action</strong> pendant la phase d'ordres pour activer le gang</li>
      </ol>
    </div>
    ${statusHtml}
    <div class="modal-actions"><button class="btn-primary" id="modal-cancel">Fermer</button></div>`;

  openModal(html, null);
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

function initOverlays() {
  initDictionaryOverlay();
  const magOv = document.getElementById('magouille-detail-ov');
  magOv?.addEventListener('click', e => { if (e.target === magOv) magOv.classList.add('hidden'); });
  document.getElementById('magouille-detail-close')?.addEventListener('click', () => magOv?.classList.add('hidden'));
}

document.addEventListener('DOMContentLoaded', async () => {
  initOverlays();
  gameData = await loadGameData();
  const restored = parseRestoreFromHash();
  if (restored) {
    const state = new GameState();
    Object.assign(state, restored);
    gameState = state;
    gameState.save();
    clearRestoreHash();
    showScreen('screen-game');
    renderGameScreen();
    startTurnLoop();
  } else {
    renderTitleScreen();
    renderLegend();
  }
});
