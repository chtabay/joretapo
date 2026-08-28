/**
 * Save export / import / share
 * - Export vers URL (compact + compressé LZ/pako)
 * - QR code pour transfert tablette → autre appareil
 * - Partage WhatsApp, copie lien
 */

const SAVE_HASH_PREFIX = 'restore=';

const KEY_MAP = {
  plateau: 'p', proprietaire: 'o', pions: 'pi', construction: 'c', electricite: 'e', gitans: 'g',
  joueurs: 'j', ressources: 'r', lingots: 'l', armes: 'a', doses: 'd', quartier_origine: 'qo',
  cartes_magouille: 'cm', type: 't', joueur: 'jo', config: 'cfg', tour: 'tr', phase: 'ph',
  version: 'v', timestamp: 'ts', maire: 'm', deck_magouille: 'dm', flics: 'fl', incorruptibles: 'ic',
  gangs_actifs: 'ga', contrats: 'ct', coupures_electricite: 'ce', historique: 'h',
  caisses: 'ca', electeurs_bonus: 'eb', electeurs_malus: 'em', est_maire: 'emr',
  privileges_maire_restants: 'pmr', gangs_actives: 'gact', nb_coupole_restantes: 'ncr',
  actions_bonus: 'ab', ordres_phase_courante: 'opc', nom: 'n', couleur: 'co', ethnie: 'et',
  defaussees: 'df', pile: 'pl', retirees_du_jeu: 'rdj', deployes: 'dp', reserves: 'rs',
  elimines: 'el', positions: 'pos', joueur_actif_index: 'jai', uid: 'u', gang: 'gn',
  joueur_id: 'ji', privileges_restants: 'pr', tour_election: 'te', tour_activation: 'ta',
  joueur_a: 'ja', joueur_b: 'jb', type_contrat: 'tc', description: 'desc', montant: 'mt',
  duree: 'du', tours_restants: 'trs', actif: 'ac', honore: 'ho', tour_creation: 'tcr',
  zone: 'z', idx: 'ix'
};
const KEY_MAP_REV = Object.fromEntries(Object.entries(KEY_MAP).map(([k, v]) => [v, k]));

function _compactObj(obj, map) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(x => _compactObj(x, map));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const k2 = map[k] || k;
    out[k2] = _compactObj(v, map);
  }
  return out;
}

function _expandObj(obj, map) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(x => _expandObj(x, map));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const k2 = map[k] || k;
    out[k2] = _expandObj(v, map);
  }
  return out;
}

export function exportToUrl(gameState) {
  const raw = gameState.serialize();
  /* _cartes_index est un cache de 65 definitions de cartes, texte original
     compris : 70 Ko attaches a l'etat des le premier draft. Il faisait passer le
     lien de partage de 1 410 a 18 083 caracteres, six fois la capacite d'un QR
     code — le partage cessait donc de fonctionner au tour 7, exactement quand une
     partie devient interessante a partager. Le cache est reconstructible depuis
     cartes-magouille.json par MagouilleEngine._ensureIndex. */
  delete raw._cartes_index;
  const compact = _compactObj(raw, KEY_MAP);
  const json = JSON.stringify(compact);
  let encoded;
  if (typeof pako !== 'undefined') {
    const compressed = pako.deflate(json, { level: 9 });
    const b64 = btoa(String.fromCharCode.apply(null, compressed));
    encoded = 'z1' + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } else if (typeof LZString !== 'undefined') {
    encoded = LZString.compressToEncodedURIComponent(json);
  } else {
    encoded = encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
  }
  return encoded;
}

export function importFromUrl(encoded) {
  if (!encoded) return null;
  let json;
  try {
    if (encoded.startsWith('z1') && typeof pako !== 'undefined') {
      const b64 = encoded.slice(2).replace(/-/g, '+').replace(/_/g, '/');
      const pad = b64.length % 4;
      const padded = pad ? b64 + '='.repeat(4 - pad) : b64;
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      json = pako.inflate(bytes, { to: 'string' });
    } else {
      if (encoded.includes('%')) encoded = decodeURIComponent(encoded);
      if (typeof LZString !== 'undefined') {
        json = LZString.decompressFromEncodedURIComponent(encoded);
      } else {
        json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
      }
    }
    const parsed = json ? JSON.parse(json) : null;
    return parsed ? _expandObj(parsed, KEY_MAP_REV) : null;
  } catch (_) {
    return null;
  }
}

export function getShareUrl(gameState) {
  const base = window.location.origin + window.location.pathname;
  const data = exportToUrl(gameState);
  return `${base}#${SAVE_HASH_PREFIX}${data}`;
}

export function parseRestoreFromHash() {
  const hash = window.location.hash || '';
  if (!hash.startsWith('#' + SAVE_HASH_PREFIX)) return null;
  const encoded = hash.slice(('#').length + SAVE_HASH_PREFIX.length);
  return importFromUrl(encoded);
}

export function clearRestoreHash() {
  if (window.history.replaceState) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  } else {
    window.location.hash = '';
  }
}

/** Capacite maximale d'un QR code : version 40, correction L, mode octet. */
export const QR_CAPACITE_OCTETS = 2953;

/**
 * Genere le QR localement, ou explique pourquoi il ne peut pas l'etre.
 *
 * Le repli precedent envoyait l'URL a api.qrserver.com — c'est-a-dire l'ETAT
 * COMPLET DE LA PARTIE, compresse mais en clair, a un service tiers, sans que
 * personne en soit informe. Une fonctionnalite de partage entre amis autour
 * d'une table n'a pas a faire ca. On prefere dire que le QR est indisponible.
 */
export function generateQRCode(containerEl, url, size = 200) {
  containerEl.innerHTML = '';

  const message = (texte, couleur = '#f39c12') => {
    const p = document.createElement('p');
    p.style.cssText = `color:${couleur};font-size:13px;margin:0;line-height:1.5`;
    p.textContent = texte;
    containerEl.appendChild(p);
    return null;
  };

  if (typeof QRCode === 'undefined') {
    return message('QR indisponible hors ligne (bibliothèque non chargée) — utilisez « Copier le lien » ou WhatsApp.');
  }
  if (url.length > QR_CAPACITE_OCTETS) {
    return message(
      `Lien trop long pour un QR code (${url.length} caractères pour ${QR_CAPACITE_OCTETS} possibles). ` +
      'Utilisez « Copier le lien » ou WhatsApp.');
  }

  try {
    return new QRCode(containerEl, {
      text: url,
      width: size,
      height: size,
      colorDark: '#1a1a2e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.L
    });
  } catch (e) {
    return message('QR indisponible — utilisez « Copier le lien » ou WhatsApp.');
  }
}

/** Bibliotheques externes reellement chargees. Sert a prevenir plutot qu'a subir. */
export function bibliothequesManquantes() {
  const manque = [];
  if (typeof pako === 'undefined' && typeof LZString === 'undefined') manque.push('compression');
  if (typeof QRCode === 'undefined') manque.push('QR code');
  return manque;
}

export function getWhatsAppShareUrl(fullUrl, message = 'Partage de partie JORETAPO') {
  const text = encodeURIComponent(`${message}\n\n${fullUrl}`);
  return `https://wa.me/?text=${text}`;
}

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text);
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    document.body.removeChild(ta);
    return Promise.resolve();
  } catch (e) {
    document.body.removeChild(ta);
    return Promise.reject(e);
  }
}

export function canUseWebShare() {
  return navigator.share && navigator.canShare;
}

export async function shareViaWebShare(title, text, url) {
  if (!canUseWebShare()) return false;
  try {
    await navigator.share({
      title: title || 'JORETAPO',
      text: text || 'Partage de partie',
      url: url
    });
    return true;
  } catch (e) {
    if (e.name !== 'AbortError') console.warn('Share failed:', e);
    return false;
  }
}
