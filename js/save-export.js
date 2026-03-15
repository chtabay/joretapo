/**
 * Save export / import / share
 * - Export vers URL (compressé LZ)
 * - QR code pour transfert tablette → autre appareil
 * - Partage WhatsApp, copie lien
 */

const SAVE_HASH_PREFIX = 'restore=';

export function exportToUrl(gameState) {
  const json = JSON.stringify(gameState.serialize());
  if (typeof LZString !== 'undefined') {
    return LZString.compressToEncodedURIComponent(json);
  }
  return encodeURIComponent(btoa(unescape(encodeURIComponent(json))));
}

export function importFromUrl(encoded) {
  if (!encoded) return null;
  let json;
  try {
    if (typeof LZString !== 'undefined') {
      json = LZString.decompressFromEncodedURIComponent(encoded);
    } else {
      json = decodeURIComponent(escape(atob(decodeURIComponent(encoded))));
    }
    return json ? JSON.parse(json) : null;
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

export function generateQRCode(containerEl, url, size = 200) {
  if (typeof QRCode === 'undefined') {
    containerEl.innerHTML = '<p style="color:#e74c3c">Bibliothèque QR non chargée</p>';
    return null;
  }
  containerEl.innerHTML = '';
  if (url.length > 2500) {
    containerEl.innerHTML = '<p style="color:#f39c12;font-size:13px">Partie trop avancée pour le QR — utilisez « Copier le lien » ou WhatsApp pour partager.</p>';
    return null;
  }
  try {
    const qr = new QRCode(containerEl, {
      text: url,
      width: size,
      height: size,
      colorDark: '#1a1a2e',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.L
    });
    return qr;
  } catch (e) {
    containerEl.innerHTML = '<p style="color:#f39c12;font-size:13px">QR trop dense — utilisez « Copier le lien » ou WhatsApp.</p>';
    return null;
  }
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
