/**
 * Minimal RUM beacon for Site Admin. Sends to the same AEM RUM collector
 * (payload shape and endpoint) without loading aem.js/scripts.js.
 */

const RUM_BASE = typeof window !== 'undefined' && window.RUM_BASE
  ? new URL(window.RUM_BASE, window.location.origin)
  : new URL('https://ot.aem.live');

const STORAGE_KEY = 'daSiteAdminApp';

function timeShift() {
  const store = window[STORAGE_KEY];
  return window.performance
    ? window.performance.now()
    : Date.now() - (store?.firstReadTime ?? 0);
}

/**
 * Send a checkpoint to the RUM collector. Call on app load or key actions.
 * @param {string} checkpoint - Event name (e.g. 'admin-load', 'admin-view')
 * @param {Object} [data] - Optional payload (e.g. { org, site, view })
 */
function sampleRUM(checkpoint, data = {}) {
  try {
    if (!window[STORAGE_KEY]) {
      const param = new URLSearchParams(window.location.search).get('rum');
      const weight = param === 'on' ? 1 : 100;
      const id = Math.random().toString(36).slice(-4);
      const isSelected = param === 'on'
        || (param !== 'off' && Math.random() * weight < 1);
      window[STORAGE_KEY] = {
        weight,
        id,
        isSelected,
        firstReadTime: window.performance?.timeOrigin ?? Date.now(),
      };
    }

    const { weight, id, isSelected } = window[STORAGE_KEY];
    if (!isSelected) return;

    const rumData = JSON.stringify({
      weight,
      id,
      referer: window.location.href,
      checkpoint,
      t: timeShift(),
      ...data,
    });
    const url = new URL(`.rum/${weight}`, RUM_BASE).href;
    navigator.sendBeacon(url, new Blob([rumData], { type: 'application/json' }));
  } catch (e) {
    // no-op
  }
}

export default sampleRUM;
