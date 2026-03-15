const QUARTIER_COLORS = {
  bergen:          { fill: '#2d5a1e', stroke: '#5ab45a' },
  north_hudson:    { fill: '#5a1e2d', stroke: '#b45a7a' },
  jersey_city:     { fill: '#5a3a1e', stroke: '#b48a5a' },
  meadowlands:     { fill: '#3a3a1e', stroke: '#8a8a5a' },
  harlem:          { fill: '#4a1e4a', stroke: '#b45ab4' },
  upper_manhattan: { fill: '#1e3a5f', stroke: '#5a8ab4' },
  midtown:         { fill: '#1e5a5a', stroke: '#5ab4b4' },
  lower_manhattan: { fill: '#2a2a5a', stroke: '#7a7ab4' },
  south_bronx:     { fill: '#5a1e1e', stroke: '#b45a5a' },
  north_bronx:     { fill: '#3d1e5f', stroke: '#8a5ab4' },
  west_queens:     { fill: '#5f3d1e', stroke: '#b48a5a' },
  east_queens:     { fill: '#4a3a1e', stroke: '#9a8a5a' },
  north_brooklyn:  { fill: '#1e5f3d', stroke: '#5ab48a' },
  south_brooklyn:  { fill: '#1e4a4a', stroke: '#5a9a9a' },
  staten_island:   { fill: '#4a4a1e', stroke: '#9a9a5a' }
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

    features.forEach(f => { this.featureMap[f.properties.id] = f; });

    this._computeBounds();
    this._buildSvg();
    this._setupInteraction();
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
    const coords = f.geometry.type === 'MultiPolygon'
      ? f.geometry.coordinates.flat(2)
      : f.geometry.coordinates.flat(1);
    let sx = 0, sy = 0;
    coords.forEach(([lon, lat]) => { sx += lon; sy += lat; });
    return this._project(sx / coords.length, sy / coords.length);
  }

  _buildSvg() {
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('viewBox', `0 0 ${this.svgW} ${this.svgH}`);
    this.svg.setAttribute('width', '100%');
    this.svg.setAttribute('height', '100%');
    this.svg.style.background = '#0a0a1a';

    this.gZones = document.createElementNS(NS, 'g');
    this.gQuartierBorders = document.createElementNS(NS, 'g');
    this.gLabels = document.createElementNS(NS, 'g');
    this.pionsGroup = document.createElementNS(NS, 'g');

    this.features.forEach(f => {
      const id = f.properties.id;
      const q = this.zoneToQuartier[id];
      const colors = q ? QUARTIER_COLORS[q.id] : { fill: '#333', stroke: '#555' };

      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', this._featureToD(f));
      path.setAttribute('fill', colors.fill);
      path.setAttribute('stroke', colors.stroke);
      path.setAttribute('stroke-width', '0.8');
      path.setAttribute('opacity', '0.85');
      path.setAttribute('data-id', id);
      path.setAttribute('data-quartier', q ? q.id : '');
      path.setAttribute('data-base-fill', colors.fill);
      path.classList.add('zone');
      this.gZones.appendChild(path);
      this.pathMap[id] = path;

      const [cx, cy] = this._centroid(f);
      const zoneData = this.gameplay.zones[id];

      if (zoneData) {
        const shortName = zoneData.nom.split(',')[0].trim();
        const nameLabel = document.createElementNS(NS, 'text');
        nameLabel.setAttribute('x', cx.toFixed(1));
        nameLabel.setAttribute('y', (cy - 1.5).toFixed(1));
        nameLabel.setAttribute('text-anchor', 'middle');
        nameLabel.setAttribute('dominant-baseline', 'central');
        nameLabel.setAttribute('font-size', '4.2');
        nameLabel.setAttribute('fill', 'rgba(255,255,255,0.75)');
        nameLabel.setAttribute('font-family', 'system-ui, sans-serif');
        nameLabel.setAttribute('font-weight', '600');
        nameLabel.setAttribute('pointer-events', 'none');
        nameLabel.textContent = shortName;
        this.gLabels.appendChild(nameLabel);
      }

      const codeLabel = document.createElementNS(NS, 'text');
      codeLabel.setAttribute('x', cx.toFixed(1));
      codeLabel.setAttribute('y', (cy + 2).toFixed(1));
      codeLabel.setAttribute('text-anchor', 'middle');
      codeLabel.setAttribute('dominant-baseline', 'central');
      codeLabel.setAttribute('font-size', '3.2');
      codeLabel.setAttribute('fill', 'rgba(255,255,255,0.4)');
      codeLabel.setAttribute('font-family', 'monospace');
      codeLabel.setAttribute('pointer-events', 'none');
      codeLabel.textContent = id;
      this.gLabels.appendChild(codeLabel);
    });

    this.svg.appendChild(this.gZones);
    this.svg.appendChild(this.gQuartierBorders);
    this.svg.appendChild(this.gLabels);
    this.svg.appendChild(this.pionsGroup);

    this.container.innerHTML = '';
    this.container.appendChild(this.svg);
  }

  _setupInteraction() {
    this.viewBox = { x: 0, y: 0, w: this.svgW, h: this.svgH };
    let dragging = false, dragStart = null, vbStart = null;
    let pinchStart = null;

    const updateVB = () => {
      this.svg.setAttribute('viewBox',
        `${this.viewBox.x} ${this.viewBox.y} ${this.viewBox.w} ${this.viewBox.h}`);
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
        const scale = pinchStart.dist / dist;
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
      if (path) this.selectZone(path.dataset.id);
    });
  }

  selectZone(id) {
    Object.values(this.pathMap).forEach(p =>
      p.classList.remove('selected', 'adjacent', 'dimmed', 'quartier-highlight'));

    if (this.selectedId === id) {
      this.selectedId = null;
      if (this.onZoneSelect) this.onZoneSelect(null);
      return;
    }

    this.selectedId = id;
    const adj = this.adjacencies[id] || [];
    this.pathMap[id].classList.add('selected');
    adj.forEach(a => { if (this.pathMap[a]) this.pathMap[a].classList.add('adjacent'); });
    Object.keys(this.pathMap).forEach(pid => {
      if (pid !== id && !adj.includes(pid)) this.pathMap[pid].classList.add('dimmed');
    });

    if (this.onZoneSelect) this.onZoneSelect(id);
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

  updateOwnership(gameState) {
    Object.entries(this.pathMap).forEach(([zid, path]) => {
      const zone = gameState.plateau[zid];
      if (zone && zone.proprietaire !== null && zone.proprietaire !== undefined) {
        const joueur = gameState.joueurs[zone.proprietaire];
        path.setAttribute('fill', joueur.couleur + '55');
        path.setAttribute('stroke', joueur.couleur);
        path.setAttribute('stroke-width', '1.2');
      } else {
        path.setAttribute('fill', path.getAttribute('data-base-fill'));
        const q = this.zoneToQuartier[zid];
        const colors = q ? QUARTIER_COLORS[q.id] : { stroke: '#555' };
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
      if (owner === null) return;

      const joueur = gameState.joueurs[owner];
      if (!joueur) return;

      q.zones.forEach(zid => {
        const path = this.pathMap[zid];
        if (!path) return;
        const border = document.createElementNS(NS, 'path');
        border.setAttribute('d', path.getAttribute('d'));
        border.setAttribute('fill', 'none');
        border.setAttribute('stroke', joueur.couleur);
        border.setAttribute('stroke-width', '3');
        border.setAttribute('opacity', '0.9');
        border.setAttribute('pointer-events', 'none');
        border.setAttribute('stroke-dasharray', '6,2');
        this.gQuartierBorders.appendChild(border);
      });

      const firstFeature = this.featureMap[q.zones[0]];
      if (firstFeature) {
        const [cx, cy] = this._centroid(firstFeature);
        const badge = document.createElementNS(NS, 'text');
        badge.setAttribute('x', cx.toFixed(1));
        badge.setAttribute('y', (cy - 8).toFixed(1));
        badge.setAttribute('text-anchor', 'middle');
        badge.setAttribute('dominant-baseline', 'central');
        badge.setAttribute('font-size', '4');
        badge.setAttribute('fill', joueur.couleur);
        badge.setAttribute('font-family', 'system-ui, sans-serif');
        badge.setAttribute('font-weight', '700');
        badge.setAttribute('pointer-events', 'none');
        badge.setAttribute('opacity', '0.85');
        badge.textContent = `★ ${joueur.nom}`;
        this.gQuartierBorders.appendChild(badge);
      }
    });
  }

  renderPions(gameState) {
    while (this.pionsGroup.firstChild) this.pionsGroup.removeChild(this.pionsGroup.firstChild);

    Object.entries(gameState.plateau).forEach(([zid, zone]) => {
      if (!zone.pions.length) return;
      const feature = this.featureMap[zid];
      if (!feature) return;

      const [cx, cy] = this._centroid(feature);
      const count = zone.pions.length;
      const spacing = 4;
      const startX = cx - ((count - 1) * spacing) / 2;

      zone.pions.forEach((pion, i) => {
        const px = startX + i * spacing;
        const joueur = gameState.joueurs[pion.joueur];
        const info = PION_SYMBOLS[pion.type] || { symbol: '?', color: '#fff' };

        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', px.toFixed(1));
        circle.setAttribute('cy', (cy + 4).toFixed(1));
        circle.setAttribute('r', '2.5');
        circle.setAttribute('fill', joueur ? joueur.couleur : info.color);
        circle.setAttribute('stroke', '#000');
        circle.setAttribute('stroke-width', '0.4');
        circle.setAttribute('pointer-events', 'none');
        this.pionsGroup.appendChild(circle);

        const label = document.createElementNS(NS, 'text');
        label.setAttribute('x', px.toFixed(1));
        label.setAttribute('y', (cy + 4.5).toFixed(1));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'central');
        label.setAttribute('font-size', '2.2');
        label.setAttribute('fill', '#fff');
        label.setAttribute('font-family', 'monospace');
        label.setAttribute('font-weight', '700');
        label.setAttribute('pointer-events', 'none');
        label.textContent = info.symbol;
        this.pionsGroup.appendChild(label);
      });
    });
  }
}

export { QUARTIER_COLORS, FACILITE_LABELS, PION_SYMBOLS };
