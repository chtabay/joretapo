import fs from 'fs';
import path from 'path';
import * as turf from '@turf/turf';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'data', 'geo-raw');
const OUT = path.join(ROOT, 'data');

// ── Borough names by code ──
const BOROUGH_NAMES = { 1: 'Manhattan', 2: 'Bronx', 3: 'Brooklyn', 4: 'Queens', 5: 'Staten Island' };
const BOROUGH_PREFIX = { 1: 'MN', 2: 'BX', 3: 'BK', 4: 'QN', 5: 'SI' };

// ── CD neighborhood labels (from spec 08) ──
const CD_LABELS = {
  101: 'Financial District, Tribeca', 102: 'Greenwich Village, SoHo', 103: 'East Village',
  104: 'Chelsea, Hell\'s Kitchen', 105: 'Midtown, Times Square', 106: 'Gramercy, Murray Hill',
  107: 'Upper West Side', 108: 'Upper East Side, Yorkville', 109: 'Morningside Heights, Hamilton Heights',
  110: 'Central Harlem', 111: 'East Harlem', 112: 'Washington Heights, Inwood',
  201: 'Mott Haven, Melrose', 202: 'Hunts Point, Longwood', 203: 'Morrisania, Claremont',
  204: 'Highbridge, Concourse', 205: 'Fordham, Morris Heights', 206: 'Belmont, East Tremont',
  207: 'Kingsbridge, Norwood', 208: 'Riverdale, Kingsbridge Heights', 209: 'Parkchester, Soundview',
  210: 'Co-op City, Throggs Neck', 211: 'Morris Park, Pelham Parkway', 212: 'Baychester, Woodlawn',
  301: 'Williamsburg, Greenpoint', 302: 'Brooklyn Heights, DUMBO', 303: 'Bedford-Stuyvesant',
  304: 'Bushwick', 305: 'East New York, Cypress Hills', 306: 'Red Hook, Park Slope',
  307: 'Sunset Park', 308: 'Crown Heights, Prospect Heights', 309: 'Crown Heights South',
  310: 'Bay Ridge, Dyker Heights', 311: 'Bensonhurst, Gravesend', 312: 'Borough Park, Kensington',
  313: 'Coney Island, Brighton Beach', 314: 'Flatbush, Midwood', 315: 'Sheepshead Bay',
  316: 'Brownsville', 317: 'East Flatbush', 318: 'Canarsie, Flatlands',
  401: 'Astoria, Long Island City', 402: 'Sunnyside, Woodside', 403: 'Jackson Heights',
  404: 'Elmhurst, Corona', 405: 'Maspeth, Middle Village', 406: 'Rego Park, Forest Hills',
  407: 'Flushing, Whitestone', 408: 'Fresh Meadows', 409: 'Woodhaven, Richmond Hill',
  410: 'Howard Beach, Ozone Park', 411: 'Bayside, Douglaston', 412: 'Jamaica, Hollis',
  413: 'Laurelton, Queens Village', 414: 'Rockaways, Broad Channel',
  501: 'North Shore', 502: 'Mid-Island', 503: 'South Shore'
};

// ── Bergen zones to merge ──
const BERGEN_ZONES = {
  BG01: { nom: 'Bogota / Nord Bergen', municipalities: ['Bogota Borough', 'Teaneck Township', 'Hackensack', 'Englewood', 'Englewood Cliffs Borough'] },
  BG02: { nom: 'Edgewater / Palisades', municipalities: ['Fort Lee Borough', 'Ridgefield Borough', 'Edgewater Borough', 'Fairview Borough'] },
  BG03: { nom: 'Little Ferry / Meadowlands', municipalities: ['Little Ferry Borough', 'Moonachie Borough', 'Ridgefield Park Village'] }
};

// ─────────────────────────────────────────────────
// 1. Load raw data
// ─────────────────────────────────────────────────
console.log('Loading raw GeoJSON...');
const nycRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'nyc-community-districts.geojson'), 'utf-8'));
const njRaw = JSON.parse(fs.readFileSync(path.join(RAW, 'nj-hudson-bergen.geojson'), 'utf-8'));

// ─────────────────────────────────────────────────
// 2. Filter NYC: keep 59 CDs, exclude JIAs
// ─────────────────────────────────────────────────
console.log('Filtering NYC CDs...');
const jiaBoroCD = new Set([164, 226, 227, 228, 355, 356, 480, 481, 482, 483, 484, 595]);
const nycFeatures = nycRaw.features
  .filter(f => !jiaBoroCD.has(f.properties.BoroCD))
  .map(f => {
    const boroCD = f.properties.BoroCD;
    const boroCode = Math.floor(boroCD / 100);
    const cdNum = boroCD % 100;
    const id = `${BOROUGH_PREFIX[boroCode]}${cdNum}`;
    return {
      type: 'Feature',
      properties: {
        id,
        nom: CD_LABELS[boroCD] || `CD ${boroCD}`,
        type: 'cd',
        borough: BOROUGH_NAMES[boroCode],
        boro_cd: boroCD
      },
      geometry: f.geometry
    };
  });

console.log(`  → ${nycFeatures.length} Community Districts`);

// ─────────────────────────────────────────────────
// 3. Hudson County: keep all 12 municipalities
// ─────────────────────────────────────────────────
console.log('Processing Hudson County...');
const hudsonFeatures = njRaw.features
  .filter(f => f.properties.COUNTY === 'HUDSON')
  .map((f, i) => {
    const name = f.properties.NAME;
    const id = `HC${String(i + 1).padStart(2, '0')}`;
    return {
      type: 'Feature',
      properties: {
        id,
        nom: name,
        type: 'hc',
        county: 'Hudson'
      },
      geometry: f.geometry
    };
  });

// Sort Hudson by name for stable IDs
hudsonFeatures.sort((a, b) => a.properties.nom.localeCompare(b.properties.nom));
hudsonFeatures.forEach((f, i) => { f.properties.id = `HC${String(i + 1).padStart(2, '0')}`; });

console.log(`  → ${hudsonFeatures.length} Hudson municipalities`);
hudsonFeatures.forEach(f => console.log(`    ${f.properties.id}: ${f.properties.nom}`));

// ─────────────────────────────────────────────────
// 4. Bergen County: merge municipalities into 3 zones
// ─────────────────────────────────────────────────
console.log('Merging Bergen zones...');
const bergenAll = njRaw.features.filter(f => f.properties.COUNTY === 'BERGEN');

const bergenFeatures = Object.entries(BERGEN_ZONES).map(([id, zone]) => {
  const munis = zone.municipalities.map(name => {
    const found = bergenAll.find(f => f.properties.NAME === name);
    if (!found) {
      console.warn(`  ⚠ Bergen municipality not found: "${name}"`);
      const candidates = bergenAll.map(f => f.properties.NAME).filter(n => n.toLowerCase().includes(name.toLowerCase().split(' ')[0]));
      if (candidates.length) console.warn(`    Candidates: ${candidates.join(', ')}`);
      return null;
    }
    return found;
  }).filter(Boolean);

  if (munis.length === 0) {
    console.error(`  ✗ No municipalities found for zone ${id}`);
    return null;
  }

  let merged;
  try {
    const fc = turf.featureCollection(munis);
    merged = turf.dissolve(fc);
    if (merged.features.length > 1) {
      merged = turf.combine(merged);
    }
  } catch (e) {
    console.warn(`  ⚠ dissolve failed for ${id}, using union fallback`);
    merged = munis[0];
    for (let i = 1; i < munis.length; i++) {
      try {
        merged = turf.union(turf.featureCollection([merged, munis[i]]));
      } catch (e2) {
        console.warn(`    ⚠ union failed for ${munis[i].properties.NAME}`);
      }
    }
    merged = { features: [merged] };
  }

  const geom = merged.features ? merged.features[0].geometry : merged.geometry;

  console.log(`  ${id}: ${zone.nom} (${munis.length} municipalités)`);

  return {
    type: 'Feature',
    properties: {
      id,
      nom: zone.nom,
      type: 'bg',
      county: 'Bergen',
      municipalities: zone.municipalities
    },
    geometry: geom
  };
}).filter(Boolean);

console.log(`  → ${bergenFeatures.length} Bergen zones`);

// ─────────────────────────────────────────────────
// 5. Merge all into one GeoJSON
// ─────────────────────────────────────────────────
const allFeatures = [...nycFeatures, ...hudsonFeatures, ...bergenFeatures];
const mergedGeoJSON = { type: 'FeatureCollection', features: allFeatures };

console.log(`\nTotal: ${allFeatures.length} features`);

const outPath = path.join(OUT, 'quartiers-osm.geojson');
fs.writeFileSync(outPath, JSON.stringify(mergedGeoJSON));
console.log(`Written: ${outPath}`);

// ─────────────────────────────────────────────────
// 6. Compute adjacencies
// ─────────────────────────────────────────────────
console.log('\nComputing adjacencies (buffer method)...');

const adjacencies = {};
allFeatures.forEach(f => { adjacencies[f.properties.id] = []; });

const BUFFER_KM = 0.05; // 50m buffer to catch near-touching borders

const total = allFeatures.length;
let checked = 0;
const totalPairs = (total * (total - 1)) / 2;

const buffered = allFeatures.map(f => {
  try {
    return turf.buffer(f, BUFFER_KM, { units: 'kilometers' });
  } catch (e) {
    return f;
  }
});

for (let i = 0; i < total; i++) {
  for (let j = i + 1; j < total; j++) {
    checked++;
    if (checked % 500 === 0) {
      process.stdout.write(`  ${checked}/${totalPairs} pairs checked...\r`);
    }

    const idA = allFeatures[i].properties.id;
    const idB = allFeatures[j].properties.id;

    try {
      if (turf.booleanIntersects(buffered[i], buffered[j])) {
        const centA = turf.centroid(allFeatures[i]);
        const centB = turf.centroid(allFeatures[j]);
        const dist = turf.distance(centA, centB, { units: 'kilometers' });
        if (dist < 30) {
          adjacencies[idA].push(idB);
          adjacencies[idB].push(idA);
        }
      }
    } catch (e) {
      // skip problematic geometries
    }
  }
}

console.log(`  ${totalPairs} pairs checked.`);

Object.keys(adjacencies).forEach(id => {
  adjacencies[id] = [...new Set(adjacencies[id])].sort();
});

const adjPath = path.join(OUT, 'adjacences-osm.json');
fs.writeFileSync(adjPath, JSON.stringify(adjacencies, null, 2));
console.log(`Written: ${adjPath}`);

const adjCount = Object.values(adjacencies).reduce((sum, arr) => sum + arr.length, 0) / 2;
console.log(`  → ${adjCount} adjacency pairs found`);

Object.entries(adjacencies).forEach(([id, adj]) => {
  if (adj.length === 0) console.warn(`  ⚠ Isolated: ${id}`);
});

// ─────────────────────────────────────────────────
// 7. Generate SVG
// ─────────────────────────────────────────────────
console.log('\nGenerating SVG...');

const bbox = turf.bbox(mergedGeoJSON);
const [minLon, minLat, maxLon, maxLat] = bbox;
console.log(`  Bounding box: [${minLon.toFixed(4)}, ${minLat.toFixed(4)}, ${maxLon.toFixed(4)}, ${maxLat.toFixed(4)}]`);

const svgW = 1200;
const svgH = 1600;
const padding = 30;

function project(lon, lat) {
  const x = padding + ((lon - minLon) / (maxLon - minLon)) * (svgW - 2 * padding);
  const y = padding + ((maxLat - lat) / (maxLat - minLat)) * (svgH - 2 * padding);
  return [x, y];
}

function coordsToPath(coords) {
  return coords.map((ring, ri) => {
    return ring.map((pt, pi) => {
      const [x, y] = project(pt[0], pt[1]);
      return `${pi === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ') + ' Z';
  }).join(' ');
}

function featureToPath(feature) {
  const geom = feature.geometry;
  if (geom.type === 'Polygon') {
    return coordsToPath(geom.coordinates);
  } else if (geom.type === 'MultiPolygon') {
    return geom.coordinates.map(poly => coordsToPath(poly)).join(' ');
  }
  return '';
}

const TYPE_COLORS = {
  cd: { fill: '#2a3a4a', stroke: '#5a8ab4' },
  hc: { fill: '#3a2a2a', stroke: '#b45a5a' },
  bg: { fill: '#2a3a2a', stroke: '#5ab45a' }
};

const BOROUGH_FILLS = {
  'Manhattan': '#1e3a5f',
  'Bronx': '#3d1e5f',
  'Brooklyn': '#1e5f3d',
  'Queens': '#5f3d1e',
  'Staten Island': '#4a4a1e'
};

let svgPaths = '';
let svgLabels = '';

allFeatures.forEach(f => {
  const id = f.properties.id;
  const type = f.properties.type;
  const colors = TYPE_COLORS[type];
  const fill = f.properties.borough ? (BOROUGH_FILLS[f.properties.borough] || colors.fill) : colors.fill;
  const d = featureToPath(f);

  const centroid = turf.centroid(f);
  const [cx, cy] = project(centroid.geometry.coordinates[0], centroid.geometry.coordinates[1]);

  svgPaths += `  <path id="${id}" d="${d}" fill="${fill}" stroke="${colors.stroke}" stroke-width="0.8" opacity="0.85">\n    <title>${f.properties.nom}</title>\n  </path>\n`;
  svgLabels += `  <text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" text-anchor="middle" dominant-baseline="central" font-size="6" fill="white" font-family="sans-serif" pointer-events="none">${id}</text>\n`;
});

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="${svgW}" height="${svgH}">
  <rect width="100%" height="100%" fill="#0a0a1a"/>
  <g id="quartiers">
${svgPaths}  </g>
  <g id="labels">
${svgLabels}  </g>
</svg>`;

const svgPath = path.join(ROOT, 'assets', 'plateau-osm.svg');
fs.writeFileSync(svgPath, svg);
console.log(`Written: ${svgPath}`);

console.log('\n✓ Pipeline complete.');
