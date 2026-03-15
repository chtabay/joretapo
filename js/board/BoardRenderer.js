import { QUARTIER_COLORS, FACILITE_LABELS, FACILITE_ICONS, BLOCK_POSITIONS } from './BoardData.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const VIEWBOX = { x: 0, y: 0, w: 750, h: 900 };

export default class BoardRenderer {
  constructor(svgElement, data) {
    this.svg = svgElement;
    this.data = data;
    this.blocIndex = {};
    this.selectedBloc = null;
    this.onBlocSelect = null;

    this._buildBlocIndex();
  }

  _buildBlocIndex() {
    for (const q of this.data.quartiers) {
      for (const b of q.blocs) {
        this.blocIndex[b.id] = { ...b, quartier: q };
      }
    }
    if (this.data.iles) {
      for (const ile of this.data.iles) {
        this.blocIndex[ile.id] = { ...ile, quartier: { id: 'ile', nom: 'Île' } };
      }
    }
  }

  render() {
    this.svg.setAttribute('viewBox', `${VIEWBOX.x} ${VIEWBOX.y} ${VIEWBOX.w} ${VIEWBOX.h}`);
    this.svg.innerHTML = '';

    this._renderWater();
    this._renderAdjacencyLines();
    this._renderBlocs();
    this._renderIles();
    this._renderQuartierLabels();
    this._renderRiverLabels();
  }

  _renderWater() {
    const bg = this._createSvgElement('rect', {
      x: VIEWBOX.x, y: VIEWBOX.y,
      width: VIEWBOX.w, height: VIEWBOX.h,
      class: 'water'
    });
    this.svg.appendChild(bg);

    const njLand = this._createSvgElement('path', {
      d: `M 0,0 L 330,0 L 330,100 L 300,120 L 310,200 L 280,280
          L 220,350 L 200,400 L 190,500 L 210,520 L 240,560
          L 270,650 L 290,750 L 300,850 L 280,900 L 0,900 Z`,
      class: 'land-bg'
    });
    this.svg.appendChild(njLand);

    const manhattanLand = this._createSvgElement('path', {
      d: `M 340,90 L 470,80 L 510,100 L 500,250 L 490,350
          L 480,420 L 475,500 L 460,550 L 440,600 L 420,650
          L 400,700 L 390,750 L 400,800 L 380,840 L 340,830
          L 320,750 L 330,650 L 325,550 L 320,450 L 330,380
          L 340,300 L 345,200 L 340,130 Z`,
      class: 'land-bg'
    });
    this.svg.appendChild(manhattanLand);

    const bronxLand = this._createSvgElement('path', {
      d: `M 510,60 L 680,60 L 680,380 L 620,360
          L 560,340 L 520,300 L 510,200 Z`,
      class: 'land-bg'
    });
    this.svg.appendChild(bronxLand);

    const queensBrooklynLand = this._createSvgElement('path', {
      d: `M 490,380 L 750,380 L 750,900 L 400,900
          L 410,850 L 430,800 L 460,760 L 470,700
          L 480,650 L 485,580 L 490,500 Z`,
      class: 'land-bg'
    });
    this.svg.appendChild(queensBrooklynLand);
  }

  _renderAdjacencyLines() {
    const group = this._createSvgElement('g', { class: 'adjacency-lines' });
    const drawn = new Set();

    for (const [id, bloc] of Object.entries(this.blocIndex)) {
      const posA = BLOCK_POSITIONS[id];
      if (!posA || !bloc.adjacences) continue;

      for (const adjId of bloc.adjacences) {
        const key = [id, adjId].sort().join('|');
        if (drawn.has(key)) continue;
        drawn.add(key);

        const posB = BLOCK_POSITIONS[adjId];
        if (!posB) continue;

        const line = this._createSvgElement('line', {
          x1: posA.x, y1: posA.y,
          x2: posB.x, y2: posB.y,
          class: 'adjacency-line',
          'data-from': id,
          'data-to': adjId
        });
        group.appendChild(line);
      }
    }
    this.svg.appendChild(group);
  }

  _renderBlocs() {
    const group = this._createSvgElement('g', { class: 'blocs-layer' });

    for (const q of this.data.quartiers) {
      const color = QUARTIER_COLORS[q.id] || '#666';
      for (const bloc of q.blocs) {
        const pos = BLOCK_POSITIONS[bloc.id];
        if (!pos) continue;
        this._renderOneBloc(group, bloc, pos, color, q);
      }
    }
    this.svg.appendChild(group);
  }

  _renderIles() {
    if (!this.data.iles) return;
    const group = this._createSvgElement('g', { class: 'iles-layer' });
    const color = QUARTIER_COLORS.ile;

    for (const ile of this.data.iles) {
      const pos = BLOCK_POSITIONS[ile.id];
      if (!pos) continue;

      const r = Math.min(pos.w, pos.h) / 2;
      const circle = this._createSvgElement('ellipse', {
        cx: pos.x, cy: pos.y,
        rx: r + 2, ry: r - 2,
        fill: color,
        class: 'ile-marker',
        'data-bloc-id': ile.id
      });
      circle.addEventListener('click', () => this._selectBloc(ile.id));
      group.appendChild(circle);

      const shortName = ile.nom.replace('Franklin D. ', 'F.D.R. ').replace(' Island', ' Isl.').replace(' Park', ' Pk');
      const label = this._createSvgElement('text', {
        x: pos.x, y: pos.y,
        class: 'bloc-label bloc-label-small'
      });
      label.textContent = shortName;
      group.appendChild(label);
    }
    this.svg.appendChild(group);
  }

  _renderOneBloc(group, bloc, pos, color, quartier) {
    const rx = pos.w / 2;
    const ry = pos.h / 2;

    const rect = this._createSvgElement('rect', {
      x: pos.x - rx, y: pos.y - ry,
      width: pos.w, height: pos.h,
      rx: 3, ry: 3,
      fill: color,
      class: 'bloc',
      'data-bloc-id': bloc.id,
      'data-quartier-id': quartier.id
    });
    rect.addEventListener('click', () => this._selectBloc(bloc.id));
    group.appendChild(rect);

    let displayName = bloc.nom;
    if (displayName.length > 14) {
      displayName = displayName.replace(' Cemetery', ' Cem.').replace(' Street', ' St.')
        .replace('Heights', 'Hts').replace('Bridge', 'Br.').replace('Village', 'Vill.')
        .replace('Island', 'Isl.').replace('Stadium', 'Stad.').replace('State ', 'St. ')
        .replace('Center', 'Ctr').replace('Avenue', 'Ave').replace(' Park', ' Pk');
    }

    const needsSmall = displayName.length > 12;
    const label = this._createSvgElement('text', {
      x: pos.x, y: bloc.facilite ? pos.y - 3 : pos.y,
      class: `bloc-label${needsSmall ? ' bloc-label-small' : ''}`
    });
    label.textContent = displayName;
    group.appendChild(label);

    if (bloc.facilite && FACILITE_ICONS[bloc.facilite]) {
      const icon = this._createSvgElement('text', {
        x: pos.x, y: pos.y + 8,
        class: 'facilite-icon'
      });
      icon.textContent = FACILITE_ICONS[bloc.facilite];
      group.appendChild(icon);
    }
  }

  _renderQuartierLabels() {
    const group = this._createSvgElement('g', { class: 'quartier-labels' });
    const centers = {};

    for (const q of this.data.quartiers) {
      let sx = 0, sy = 0, n = 0;
      for (const b of q.blocs) {
        const pos = BLOCK_POSITIONS[b.id];
        if (pos) { sx += pos.x; sy += pos.y; n++; }
      }
      if (n === 0) continue;
      centers[q.id] = { x: sx / n, y: sy / n - 20 };
    }

    for (const q of this.data.quartiers) {
      const c = centers[q.id];
      if (!c) continue;
      const label = this._createSvgElement('text', {
        x: c.x, y: c.y,
        class: 'quartier-label'
      });
      label.textContent = q.nom.toUpperCase();
      group.appendChild(label);
    }
    this.svg.appendChild(group);
  }

  _renderRiverLabels() {
    const group = this._createSvgElement('g');
    const rivers = [
      { text: 'Hudson River', x: 310, y: 500, rotate: -80 },
      { text: 'East River', x: 500, y: 550, rotate: -75 },
      { text: 'Harlem River', x: 520, y: 280, rotate: -30 }
    ];
    for (const r of rivers) {
      const label = this._createSvgElement('text', {
        x: r.x, y: r.y,
        class: 'river-label',
        transform: `rotate(${r.rotate}, ${r.x}, ${r.y})`
      });
      label.textContent = r.text;
      group.appendChild(label);
    }
    this.svg.appendChild(group);
  }

  _selectBloc(blocId) {
    this.svg.querySelectorAll('.bloc.selected, .ile-marker.selected').forEach(el => el.classList.remove('selected'));
    this.svg.querySelectorAll('.adjacency-line.highlighted').forEach(el => el.classList.remove('highlighted'));

    const el = this.svg.querySelector(`[data-bloc-id="${blocId}"]`);
    if (el) el.classList.add('selected');

    this.svg.querySelectorAll(`.adjacency-line[data-from="${blocId}"], .adjacency-line[data-to="${blocId}"]`).forEach(line => {
      line.classList.add('highlighted');
    });

    this.selectedBloc = blocId;
    if (this.onBlocSelect) this.onBlocSelect(blocId);
  }

  getBlocInfo(blocId) {
    return this.blocIndex[blocId] || null;
  }

  _createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    return el;
  }
}
