import { buildQuartierColors, BOARD_BG, luminance } from './palette.js';

/**
 * Couleurs des quartiers de la ville courante.
 *
 * Objet partagé, rempli par `setQuartierColors()` au chargement des données —
 * jamais codé en dur. Le plateau est destiné à changer de ville : une table figée
 * sur les identifiants de New York obligerait à repeindre chaque nouveau pack à la
 * main. Les modules qui l'importent gardent la même référence, il est muté sur place.
 */
const QUARTIER_COLORS = {};

/** À appeler une fois, avec les quartiers de la ville chargée. */
function setQuartierColors(quartiers) {
  return buildQuartierColors(quartiers, QUARTIER_COLORS);
}

const NO_QUARTIER = { fill: '#2b2b33', stroke: '#5c5c68' };

/* ── Tailles à l'écran, en pixels CSS ──────────────────────────────────────
   Les pions et les libellés sont dessinés dans un repère contre-échelé : ces
   valeurs sont donc de vrais pixels écran, constants à tous les niveaux de zoom.
   Avant cette correction ils étaient exprimés en unités du repère géographique,
   où 1 unité ≈ 40 m de New York — un pion mesurait 3,48 px sur tablette et
   1,63 px sur mobile, c'est-à-dire rien. */
const PX = {
  pionRadius: 9,        /* 18 px de diamètre */
  pionGap: 20,          /* entraxe : 2 px de marge entre deux pions */
  pionPerRow: 3,
  pionFont: 8.5,
  zoneNameFont: 12,
  zoneCodeFont: 9,
  /* En dessous de cette largeur à l'écran, une zone ne peut plus porter son nom
     sans écraser ses voisines : on ne garde que le code, puis plus rien. */
  nameMinZoneWidth: 78,
  codeMinZoneWidth: 34
};

const FACILITE_LABELS = {
  zurich_bank: 'Zurich Bank', mairie: 'Mairie', hotel_police: 'Hôtel de Police',
  aeroport: 'Aéroport', ambassade: 'Ambassade', immigration: 'Immigration',
  douanes: 'Douanes', annexe_zurich_bank: 'Annexe Zurich Bank',
  port: 'Port', peage: 'Péage', cimetiere: 'Cimetière'
};

const PION_SYMBOLS = {
  dealer: { symbol: 'DE', color: '#e74c3c' },
  trafiquant: { symbol: 'TR', color: '#e67e22' },
  prostituee_base: { symbol: 'PR', color: '#e91e63' },
  prostituee_luxe: { symbol: 'PL', color: '#9c27b0' },
  flic: { symbol: 'FL', color: '#2196f3' },
  incorruptible: { symbol: 'IC', color: '#fff' },
  gitan: { symbol: 'GI', color: '#795548' }
};

const NS = 'http://www.w3.org/2000/svg';

/** Noir ou blanc, selon ce qui se lit sur la couleur donnée. Les couleurs de
    joueur sont choisies librement (sélecteur de couleur à la configuration) :
    un symbole blanc en dur devient illisible sur un jaune. */
function readableOn(bg) {
  try { return luminance(bg) > 0.42 ? '#0b0b12' : '#ffffff'; }
  catch { return '#ffffff'; }
}

export class MapRenderer {
  constructor(container, { features, adjacencies, gameplay, zoneToQuartier }) {
    this.container = container;
    this.features = features;
    this.adjacencies = adjacencies;
    this.gameplay = gameplay;
    this.zoneToQuartier = zoneToQuartier;
    this.pathMap = {};
    this.featureMap = {};
    this.pionsGroup = null;
    this.selectedId = null;
    this.onZoneSelect = null;

    /* Caches géométriques : centroïdes et largeurs de zone servent à chaque
       recalcul d'échelle, c'est-à-dire à chaque image pendant un pincement. */
    this.centroids = {};
    this.zoneWidths = {};
    this.glyphGroups = {};
    this.glyphScale = 1;

    features.forEach(f => { this.featureMap[f.properties.id] = f; });

    this._computeBounds();
    this._buildSvg();
    this._setupInteraction();
    this._updateGlyphScale();

    /* Le viewBox est en unités SVG, l'échelle des pions en pixels écran : un
       redimensionnement de fenêtre change le rapport entre les deux. */
    this._onResize = () => this._updateGlyphScale();
    window.addEventListener('resize', this._onResize);
  }

  destroy() {
    window.removeEventListener('resize', this._onResize);
  }

  _computeBounds() {
    let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
    this.features.forEach(f => {
      const coords = f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates.flat(2)
        : f.geometry.coordinates.flat(1);
      coords.forEach(([lon, lat]) => {
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      });
    });
    this.bounds = { minLon, maxLon, minLat, maxLat };
    this.pad = 20;
    this.svgW = 1200;
    const aspect = (maxLat - minLat) / (maxLon - minLon) /
      Math.cos((minLat + maxLat) / 2 * Math.PI / 180);
    this.svgH = Math.round(this.svgW * aspect);
  }

  _project(lon, lat) {
    const { minLon, maxLon, minLat, maxLat } = this.bounds;
    const x = this.pad + ((lon - minLon) / (maxLon - minLon)) * (this.svgW - 2 * this.pad);
    const y = this.pad + ((maxLat - lat) / (maxLat - minLat)) * (this.svgH - 2 * this.pad);
    return [x, y];
  }

  _ringToPath(ring) {
    return ring.map((pt, i) => {
      const [x, y] = this._project(pt[0], pt[1]);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z';
  }

  _featureToD(f) {
    const g = f.geometry;
    if (g.type === 'Polygon') return g.coordinates.map(r => this._ringToPath(r)).join(' ');
    if (g.type === 'MultiPolygon') return g.coordinates.map(p => p.map(r => this._ringToPath(r)).join(' ')).join(' ');
    return '';
  }

  _centroid(f) {
    const id = f.properties?.id;
    if (id && this.centroids[id]) return this.centroids[id];

    const coords = f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.flat(2)
      : f.geometry.coordinates.flat(1);
    let sx = 0, sy = 0;
    coords.forEach(([lon, lat]) => { sx += lon; sy += lat; });
    const c = this._project(sx / coords.length, sy / coords.length);

    if (id) {
      this.centroids[id] = c;
      /* Largeur de la zone en unités SVG — sert au niveau de détail des libellés. */
      let minLon = Infinity, maxLon = -Infinity;
      coords.forEach(([lon]) => { if (lon < minLon) minLon = lon; if (lon > maxLon) maxLon = lon; });
      this.zoneWidths[id] = this._project(maxLon, 0)[0] - this._project(minLon, 0)[0];
    }
    return c;
  }

  /* ── Contre-échelle ───────────────────────────────────────────────────────
     Le plateau est dessiné dans le repère géographique, où une unité vaut des
     dizaines de mètres. Les pions et les libellés, eux, doivent garder une taille
     constante À L'ÉCRAN quel que soit le zoom. On les place donc dans des groupes
     `translate(centroïde) scale(k)`, où k est le nombre d'unités SVG par pixel
     écran, recalculé à chaque changement de viewBox. Leur contenu est alors
     exprimé directement en pixels. */

  /**
   * Unités SVG par pixel écran.
   *
   * Attention au piège : le SVG est en `width:100% height:100%` avec le
   * preserveAspectRatio par défaut (`xMidYMid meet`). Il est donc mis à l'échelle
   * pour TENIR dans la boîte, ce qui laisse des bandes vides sur l'axe le moins
   * contraint. Diviser la largeur du viewBox par la largeur de l'élément donne
   * alors un facteur faux — et des pions de taille variable selon la forme de la
   * fenêtre. Le bon facteur est le plus contraignant des deux axes.
   */
  _unitsPerPixel() {
    /* Source de vérité : la matrice de transformation réellement appliquée par le
       navigateur. La recalculer depuis this.viewBox laisserait les deux diverger —
       c'est exactement ce qui s'est produit tant que le viewBox d'ouverture n'était
       pas poussé dans le DOM, et les pions sortaient à la moitié de leur taille. */
    const ctm = this.svg?.getScreenCTM?.();
    if (ctm && ctm.a > 0) return 1 / ctm.a;

    /* Repli hors document (écran masqué, tests unitaires) : le SVG est en
       `width/height:100%` avec le preserveAspectRatio par défaut, donc mis à
       l'échelle pour TENIR dans la boîte. Le facteur est le plus contraignant
       des deux axes, pas la largeur seule. */
    const r = this.svg?.getBoundingClientRect();
    const w = r && r.width > 1 ? r.width : (this.container?.clientWidth || 1000);
    const h = r && r.height > 1 ? r.height : (this.container?.clientHeight || 800);
    if (!this.viewBox) return 1;
    return Math.max(this.viewBox.w / w, this.viewBox.h / h);
  }

  _updateGlyphScale() {
    this.glyphScale = this._unitsPerPixel();
    const k = this.glyphScale;

    Object.entries(this.glyphGroups).forEach(([zid, g]) => {
      const [cx, cy] = this.centroids[zid] || [0, 0];
      g.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${k.toFixed(5)})`);

      /* Niveau de détail : une zone trop petite à l'écran perd son nom, puis son
         code. Sans ça, les libellés restant lisibles se chevauchent au dézoom. */
      const screenW = (this.zoneWidths[zid] || 0) / k;
      const name = g.querySelector('.zone-name');
      const code = g.querySelector('.zone-code');
      if (name) name.style.display = screenW >= PX.nameMinZoneWidth ? '' : 'none';
      if (code) code.style.display = screenW >= PX.codeMinZoneWidth ? '' : 'none';
    });

    if (this.pionsGroup) {
      Array.from(this.pionsGroup.children).forEach(g => {
        const zid = g.dataset.zone;
        const [cx, cy] = this.centroids[zid] || [0, 0];
        g.setAttribute('transform', `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) scale(${k.toFixed(5)})`);
      });
    }
  }

  /** Recadre sur le plateau entier. */
  recenter() {
    this.viewBox = { x: 0, y: 0, w: this.svgW, h: this.svgH };
    this._applyViewBox();
  }

  _applyViewBox() {
    this.svg.setAttribute('viewBox',
      `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
    this._updateGlyphScale();
  }

  /** Empêche de zoomer jusqu'à l'atome ou de sortir du plateau sans retour. */
  _clampViewBox() {
    const vb = this.viewBox;
    const minW = this.svgW / 14;
    const maxW = this.svgW * 1.6;
    if (vb.w < minW) { const r = minW / vb.w; vb.w = minW; vb.h *= r; }
    if (vb.w > maxW) { const r = maxW / vb.w; vb.w = maxW; vb.h *= r; }
    /* On autorise à déborder d'une demi-vue, pas davantage : le plateau reste
       toujours au moins à moitié visible. */
    const mx = vb.w / 2, my = vb.h / 2;
    vb.x = Math.max(-mx, Math.min(this.svgW - vb.w + mx, vb.x));
    vb.y = Math.max(-my, Math.min(this.svgH - vb.h + my, vb.y));
  }

  _buildSvg() {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.svgW} ${this.svgH}`);
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.style.background = BOARD_BG;

    this.gZones = document.createElementNS(NS, 'g');
    this.gQuartierBorders = document.createElementNS(NS, 'g');
    this.gLabels = document.createElementNS(NS, 'g');
    this.pionsGroup = document.createElementNS(NS, 'g');

    this.features.forEach(f => {
      const id = f.properties.id;
      const q = this.zoneToQuartier[id];
      const colors = q ? QUARTIER_COLORS[q.id] : NO_QUARTIER;

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', this._featureToD(f));
      path.setAttribute('fill', colors.fill);
      path.setAttribute('stroke', colors.stroke);
      path.setAttribute('stroke-width', '0.8');
      path.setAttribute('data-id', id);
      path.setAttribute('data-quartier', q ? q.id : '');
      path.setAttribute('data-base-fill', colors.fill);
      path.classList.add('zone');
      this.gZones.appendChild(path);
      this.pathMap[id] = path;

      /* Le centroïde alimente le cache ; la position réelle est portée par le
         groupe contre-échelé, pas par les textes eux-mêmes. */
      this._centroid(f);
      const zoneData = this.gameplay.zones[id];

      /* Un groupe de libellés par zone. Son transform est réécrit à chaque zoom
         par _updateGlyphScale ; à l'intérieur, tout est en pixels écran. */
      const glyphs = document.createElementNS(NS, 'g');
      glyphs.setAttribute('pointer-events', 'none');
      glyphs.dataset.zone = id;

      if (zoneData) {
        const shortName = zoneData.nom.split(',')[0].trim();
        const nameLabel = document.createElementNS(NS, 'text');
        nameLabel.setAttribute('x', '0');
        /* Les libellés remontent : la rangée de pions occupe le dessous du
           centroïde. Avant, code de zone et pions se superposaient. */
        nameLabel.setAttribute('y', String(-PX.pionRadius - 12));
        nameLabel.setAttribute('text-anchor', 'middle');
        nameLabel.setAttribute('dominant-baseline', 'central');
        nameLabel.setAttribute('font-size', String(PX.zoneNameFont));
        nameLabel.setAttribute('fill', 'rgba(255,255,255,0.92)');
        nameLabel.setAttribute('font-family', 'system-ui, sans-serif');
        nameLabel.setAttribute('font-weight', '600');
        /* Halo : le nom doit rester lisible sur un aplat clair comme sur un aplat
           sombre, et la couleur du propriétaire change sous lui en cours de partie. */
        nameLabel.setAttribute('stroke', 'rgba(0,0,0,0.85)');
        nameLabel.setAttribute('stroke-width', '3');
        nameLabel.setAttribute('paint-order', 'stroke');
        nameLabel.classList.add('zone-name');
        nameLabel.textContent = shortName;
        glyphs.appendChild(nameLabel);
      }

      const codeLabel = document.createElementNS(NS, 'text');
      codeLabel.setAttribute('x', '0');
      codeLabel.setAttribute('y', String(-PX.pionRadius - 1));
      codeLabel.setAttribute('text-anchor', 'middle');
      codeLabel.setAttribute('dominant-baseline', 'central');
      codeLabel.setAttribute('font-size', String(PX.zoneCodeFont));
      codeLabel.setAttribute('fill', 'rgba(255,255,255,0.62)');
      codeLabel.setAttribute('font-family', 'monospace');
      codeLabel.setAttribute('stroke', 'rgba(0,0,0,0.8)');
      codeLabel.setAttribute('stroke-width', '2.5');
      codeLabel.setAttribute('paint-order', 'stroke');
      codeLabel.classList.add('zone-code');
      codeLabel.textContent = id;
      glyphs.appendChild(codeLabel);

      this.gLabels.appendChild(glyphs);
      this.glyphGroups[id] = glyphs;
    });

    this.svg.appendChild(this.gZones);
    this.svg.appendChild(this.gQuartierBorders);
    this.svg.appendChild(this.gLabels);
    this.svg.appendChild(this.pionsGroup);

    this.container.innerHTML = '';
    this.container.appendChild(this.svg);
  }

  _setupInteraction() {
    /* Vue d'ouverture à mi-zoom, centrée : à pleine étendue, une zone ne fait que
       quelques dizaines de pixels et le plateau se lit comme une tache. */
    const w = this.svgW / 1.9, h = this.svgH / 1.9;
    this.viewBox = { x: (this.svgW - w) / 2, y: (this.svgH - h) / 2, w, h };

    let dragging = false, dragStart = null, vbStart = null;
    let pinchStart = null;

    const updateVB = () => {
      this._clampViewBox();
      this._applyViewBox();
    };

    const zoomAt = (clientX, clientY, scale) => {
      const rect = this.svg.getBoundingClientRect();
      const mx = (clientX - rect.left) / rect.width;
      const my = (clientY - rect.top) / rect.height;
      const px = this.viewBox.x + mx * this.viewBox.w;
      const py = this.viewBox.y + my * this.viewBox.h;
      this.viewBox.w *= scale;
      this.viewBox.h *= scale;
      this.viewBox.x = px - mx * this.viewBox.w;
      this.viewBox.y = py - my * this.viewBox.h;
      updateVB();
    };

    this.container.addEventListener('wheel', e => {
      e.preventDefault();
      const scale = e.deltaY > 0 ? 1.15 : 0.87;
      zoomAt(e.clientX, e.clientY, scale);
    }, { passive: false });

    /* Pinch-to-zoom pour mobile */
    this.container.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        pinchStart = {
          dist: Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY),
          vb: { ...this.viewBox }
        };
        vbStart = null; /* annule le pan */
      } else {
        pinchStart = null;
      }
    }, { passive: true });
    this.container.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        if (!pinchStart) pinchStart = {
          dist: Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY),
          vb: { ...this.viewBox }
        };
        e.preventDefault();
        const dist = Math.hypot(e.touches[1].clientX - e.touches[0].clientX, e.touches[1].clientY - e.touches[0].clientY);
        const scale = dist / pinchStart.dist;
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const rect = this.svg.getBoundingClientRect();
        const mx = (midX - rect.left) / rect.width;
        const my = (midY - rect.top) / rect.height;
        const px = pinchStart.vb.x + mx * pinchStart.vb.w;
        const py = pinchStart.vb.y + my * pinchStart.vb.h;
        this.viewBox.w = pinchStart.vb.w / scale;
        this.viewBox.h = pinchStart.vb.h / scale;
        this.viewBox.x = px - mx * this.viewBox.w;
        this.viewBox.y = py - my * this.viewBox.h;
        updateVB();
      }
    }, { passive: false });
    this.container.addEventListener('touchend', e => {
      if (e.touches.length < 2) pinchStart = null;
    }, { passive: true });

    this.container.addEventListener('pointerdown', e => {
      if (e.target.classList.contains('zone')) return;
      if (e.pointerType === 'touch') return; /* touch géré par touchstart/touchmove */
      dragging = true;
      this.container.classList.add('dragging');
      dragStart = { x: e.clientX, y: e.clientY };
      vbStart = { ...this.viewBox };
      this.container.setPointerCapture(e.pointerId);
    });
    this.container.addEventListener('pointermove', e => {
      if (!dragging) return;
      const rect = this.svg.getBoundingClientRect();
      this.viewBox.x = vbStart.x - (e.clientX - dragStart.x) / rect.width * vbStart.w;
      this.viewBox.y = vbStart.y - (e.clientY - dragStart.y) / rect.height * vbStart.h;
      updateVB();
    });
    this.container.addEventListener('pointerup', () => {
      dragging = false;
      this.container.classList.remove('dragging');
    });

    /* Pan au doigt (1 toucher) */
    this.container.addEventListener('touchstart', e => {
      if (e.touches.length === 1 && !pinchStart) {
        dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        vbStart = { ...this.viewBox };
      }
    }, { passive: true });
    this.container.addEventListener('touchmove', e => {
      if (e.touches.length === 1 && vbStart && !pinchStart) {
        e.preventDefault();
        const rect = this.svg.getBoundingClientRect();
        this.viewBox.x = vbStart.x - (e.touches[0].clientX - dragStart.x) / rect.width * vbStart.w;
        this.viewBox.y = vbStart.y - (e.touches[0].clientY - dragStart.y) / rect.height * vbStart.h;
        updateVB();
      }
    }, { passive: false });
    this.container.addEventListener('touchend', e => {
      if (e.touches.length === 0) { vbStart = null; dragStart = null; }
    }, { passive: true });

    this.gZones.addEventListener('click', e => {
      const path = e.target.closest('.zone');
      if (path) this.selectZone(path.dataset.id, e);
    });

    /* Pousser le viewBox d'ouverture dans le DOM. Sans ça, l'attribut reste à
       l'étendue complète posée par _buildSvg jusqu'au premier zoom, et l'échelle
       des pions est calculée contre une vue qui n'est pas celle affichée. */
    this._clampViewBox();
    this._applyViewBox();
  }

  selectZone(id, event) {
    Object.values(this.pathMap).forEach(p =>
      p.classList.remove('selected', 'adjacent', 'dimmed', 'quartier-highlight'));

    if (this.selectedId === id) {
      this.selectedId = null;
      if (this.onZoneSelect) this.onZoneSelect(null, event);
      return;
    }

    this.selectedId = id;
    const adj = this.adjacencies[id] || [];
    this.pathMap[id].classList.add('selected');
    adj.forEach(a => { if (this.pathMap[a]) this.pathMap[a].classList.add('adjacent'); });
    Object.keys(this.pathMap).forEach(pid => {
      if (pid !== id && !adj.includes(pid)) this.pathMap[pid].classList.add('dimmed');
    });

    if (this.onZoneSelect) this.onZoneSelect(id, event);
  }

  highlightQuartier(quartierId) {
    Object.values(this.pathMap).forEach(p =>
      p.classList.remove('dimmed', 'quartier-highlight', 'selected', 'adjacent'));
    this.selectedId = null;

    if (!quartierId) return;

    const q = this.gameplay.quartiers.find(q => q.id === quartierId);
    if (!q) return;

    Object.entries(this.pathMap).forEach(([pid, p]) => {
      if (q.zones.includes(pid)) {
        p.classList.add('quartier-highlight');
      } else {
        p.classList.add('dimmed');
      }
    });
  }

  highlightZones(zoneIds, { targetClass = 'heist-target', ownedIds = [], ownedClass = 'heist-owned', dimOthers = true } = {}) {
    Object.values(this.pathMap).forEach(p =>
      p.classList.remove('dimmed', 'heist-target', 'heist-owned', 'move-source', 'move-dest', 'move-conflict', 'selected', 'adjacent'));
    this.selectedId = null;

    if (!zoneIds || zoneIds.length === 0) return;

    Object.entries(this.pathMap).forEach(([pid, p]) => {
      if (ownedIds.includes(pid)) {
        p.classList.add(ownedClass);
      } else if (zoneIds.includes(pid)) {
        p.classList.add(targetClass);
      } else if (dimOthers) {
        p.classList.add('dimmed');
      }
    });
  }

  clearHighlights() {
    Object.values(this.pathMap).forEach(p =>
      p.classList.remove('dimmed', 'heist-target', 'heist-owned', 'move-source', 'move-dest', 'move-conflict', 'selected', 'adjacent', 'quartier-highlight'));
    this.selectedId = null;
  }

  updateOwnership(gameState) {
    Object.entries(this.pathMap).forEach(([zid, path]) => {
      const zone = gameState.plateau[zid];
      if (zone && zone.proprietaire !== null && zone.proprietaire !== undefined) {
        const joueur = gameState.joueurs[zone.proprietaire];
        /* 'B3' = 70 % d'opacité. À '55' (33 %), l'alpha effectif tombait à 0,28 et
           une zone conquise contrastait à 1,4:1 avec le fond : prendre un territoire
           ne le changeait pas visuellement. */
        path.setAttribute('fill', joueur.couleur + 'B3');
        path.setAttribute('stroke', joueur.couleur);
        path.setAttribute('stroke-width', '1.6');
      } else {
        path.setAttribute('fill', path.getAttribute('data-base-fill'));
        const q = this.zoneToQuartier[zid];
        const colors = q ? QUARTIER_COLORS[q.id] : NO_QUARTIER;
        path.setAttribute('stroke', colors.stroke);
        path.setAttribute('stroke-width', '0.8');
      }
    });

    this._updateQuartierDomination(gameState);
  }

  _updateQuartierDomination(gameState) {
    while (this.gQuartierBorders.firstChild) this.gQuartierBorders.removeChild(this.gQuartierBorders.firstChild);

    this.gameplay.quartiers.forEach(q => {
      const owner = gameState.getQuartierOwner(q.id, this.gameplay);

      const presence = {};
      q.zones.forEach(zid => {
        const z = gameState.plateau[zid];
        if (z && z.proprietaire != null) {
          if (!presence[z.proprietaire]) presence[z.proprietaire] = 0;
          presence[z.proprietaire]++;
        }
      });
      const topEntry = Object.entries(presence).sort((a, b) => b[1] - a[1])[0];
      const topPlayer = topEntry ? Number(topEntry[0]) : null;
      const topCount = topEntry ? topEntry[1] : 0;
      const pct = topCount / q.zones.length;

      if (owner !== null) {
        const joueur = gameState.joueurs[owner];
        if (!joueur) return;

        q.zones.forEach(zid => {
          const path = this.pathMap[zid];
          if (!path) return;
          const border = document.createElementNS(NS, 'path');
          border.setAttribute('d', path.getAttribute('d'));
          border.setAttribute('fill', 'none');
          border.setAttribute('stroke', joueur.couleur);
          border.setAttribute('stroke-width', '3.5');
          border.setAttribute('opacity', '1');
          border.setAttribute('pointer-events', 'none');
          this.gQuartierBorders.appendChild(border);
        });

        const avgCentroid = this._quartierCentroid(q);
        if (avgCentroid) {
          const [cx, cy] = avgCentroid;

          const bgRect = document.createElementNS(NS, 'rect');
          bgRect.setAttribute('x', (cx - 18).toFixed(1));
          bgRect.setAttribute('y', (cy - 12).toFixed(1));
          bgRect.setAttribute('width', '36');
          bgRect.setAttribute('height', '8');
          bgRect.setAttribute('rx', '3');
          bgRect.setAttribute('fill', joueur.couleur);
          bgRect.setAttribute('opacity', '0.85');
          bgRect.setAttribute('pointer-events', 'none');
          this.gQuartierBorders.appendChild(bgRect);

          const badge = document.createElementNS(NS, 'text');
          badge.setAttribute('x', cx.toFixed(1));
          badge.setAttribute('y', (cy - 7.5).toFixed(1));
          badge.setAttribute('text-anchor', 'middle');
          badge.setAttribute('dominant-baseline', 'central');
          badge.setAttribute('font-size', '4.5');
          badge.setAttribute('fill', '#fff');
          badge.setAttribute('font-family', 'system-ui, sans-serif');
          badge.setAttribute('font-weight', '800');
          badge.setAttribute('pointer-events', 'none');
          badge.textContent = `★ ${joueur.nom}`;
          this.gQuartierBorders.appendChild(badge);
        }
      } else if (pct >= 0.5 && topPlayer !== null) {
        const joueur = gameState.joueurs[topPlayer];
        if (!joueur) return;

        q.zones.forEach(zid => {
          const z = gameState.plateau[zid];
          if (z && z.proprietaire === topPlayer) {
            const path = this.pathMap[zid];
            if (!path) return;
            const border = document.createElementNS(NS, 'path');
            border.setAttribute('d', path.getAttribute('d'));
            border.setAttribute('fill', 'none');
            border.setAttribute('stroke', joueur.couleur);
            border.setAttribute('stroke-width', '2');
            border.setAttribute('opacity', '0.6');
            border.setAttribute('pointer-events', 'none');
            border.setAttribute('stroke-dasharray', '4,3');
            this.gQuartierBorders.appendChild(border);
          }
        });
      }
    });
  }

  _quartierCentroid(quartier) {
    let sx = 0, sy = 0, n = 0;
    quartier.zones.forEach(zid => {
      const f = this.featureMap[zid];
      if (f) {
        const [cx, cy] = this._centroid(f);
        sx += cx; sy += cy; n++;
      }
    });
    return n > 0 ? [sx / n, sy / n] : null;
  }

  renderPions(gameState) {
    while (this.pionsGroup.firstChild) this.pionsGroup.removeChild(this.pionsGroup.firstChild);

    Object.entries(gameState.plateau).forEach(([zid, zone]) => {
      if (!zone.pions.length) return;

      const feature = this.featureMap[zid];
      /* Les îles n'ont pas de géométrie dans le GeoJSON : sans repli, leurs pions
         — dont les gitans posés à l'initialisation — ne sont dessinés nulle part.
         On les place au barycentre de leurs voisines déclarées. */
      const c = feature ? this._centroid(feature) : this._fallbackCentroid(zid);
      if (!c) return;
      this.centroids[zid] = c;

      /* Un groupe par zone, contre-échelé : tout ce qui suit est en pixels écran. */
      const g = document.createElementNS(NS, 'g');
      g.dataset.zone = zid;
      g.setAttribute('pointer-events', 'none');

      const n = zone.pions.length;
      const perRow = Math.min(PX.pionPerRow, n);
      const rows = Math.ceil(n / perRow);

      zone.pions.forEach((pion, i) => {
        const row = Math.floor(i / perRow);
        const inRow = i % perRow;
        const rowCount = Math.min(perRow, n - row * perRow);
        const px = (inRow - (rowCount - 1) / 2) * PX.pionGap;
        const py = PX.pionRadius + 3 + (row - (rows - 1) / 2) * PX.pionGap + (rows - 1) * PX.pionGap / 2;

        const joueur = gameState.joueurs[pion.joueur];
        const info = PION_SYMBOLS[pion.type] || { symbol: '?', color: '#fff' };
        const fill = joueur ? joueur.couleur : info.color;

        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', px.toFixed(1));
        circle.setAttribute('cy', py.toFixed(1));
        circle.setAttribute('r', String(PX.pionRadius));
        circle.setAttribute('fill', fill);
        circle.setAttribute('stroke', 'rgba(0,0,0,0.9)');
        circle.setAttribute('stroke-width', '1.5');
        g.appendChild(circle);

        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', px.toFixed(1));
        label.setAttribute('y', py.toFixed(1));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('font-size', String(PX.pionFont));
        label.setAttribute('fill', readableOn(fill));
        label.setAttribute('font-family', 'ui-monospace, monospace');
        label.setAttribute('font-weight', '700');
        label.textContent = info.symbol;
        g.appendChild(label);
      });

      this.pionsGroup.appendChild(g);
    });

    this._updateGlyphScale();
  }

  /** Position de repli pour une zone sans géométrie (les îles). */
  _fallbackCentroid(zid) {
    if (this.centroids[zid]) return this.centroids[zid];
    const ile = (this.gameplay.iles || []).find(i => i.id === zid);
    const voisins = (ile?.adjacences || [])
      .map(a => this.featureMap[a])
      .filter(Boolean)
      .map(f => this._centroid(f));
    if (!voisins.length) return null;
    const cx = voisins.reduce((s, p) => s + p[0], 0) / voisins.length;
    const cy = voisins.reduce((s, p) => s + p[1], 0) / voisins.length;
    return [cx, cy];
  }
}

export { QUARTIER_COLORS, setQuartierColors, FACILITE_LABELS, PION_SYMBOLS, PX };
