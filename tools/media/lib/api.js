/**
 * DA Admin API functions for fetching logs and saving data
 */

import {
  state, DA_ADMIN, org, repo, ref,
} from './config.js';
import * as logger from './logger.js';

/** Constants */
const RATE_LIMIT_DELAY_MS = 100; // Delay between paginated API requests

/**
 * Fetch with DA authentication token
 * @param {string} url - URL to fetch
 * @param {object} opts - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function daFetch(url, opts = {}) {
  opts.headers ||= {};
  if (state.daToken) {
    opts.headers.Authorization = `Bearer ${state.daToken}`;
  }
  return fetch(url, opts);
}

/** CORS proxy for cross-origin fetches (same as media-library block) */
const CORS_PROXY_URL = 'https://media-library-cors-proxy.aem-poc-lab.workers.dev/';

/**
 * Fetch with CORS proxy. Uses proxy first when cross-origin (e.g. localhost → aem.page)
 * to avoid CORS errors; direct fetch when same-origin.
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
async function fetchWithCorsProxy(url, options = {}) {
  const targetOrigin = url.startsWith('http') ? new URL(url).origin : null;
  const isCrossOrigin = targetOrigin && window.location.origin !== targetOrigin;

  if (isCrossOrigin) {
    const proxyUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl, options);
  }

  try {
    const response = await fetch(url, options);
    if (!response.ok) {
      const proxyUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(url)}`;
      return fetch(proxyUrl, options);
    }
    return response;
  } catch (directError) {
    if (directError.name === 'TypeError'
        && (directError.message.includes('CORS')
        || directError.message.includes('blocked')
        || directError.message.includes('Access-Control-Allow-Origin')
        || directError.message.includes('Failed to fetch'))) {
      const proxyUrl = `${CORS_PROXY_URL}?url=${encodeURIComponent(url)}`;
      return fetch(proxyUrl, options);
    }
    throw directError;
  }
}

export async function loadMeta(path) {
  try {
    const resp = await daFetch(`${DA_ADMIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data?.[0] || data;
    }
  } catch (error) {
    logger.error(`Failed to load meta from ${path}:`, error.message);
    return null;
  }
  return null;
}

/**
 * Fetch page markdown from preview URL (org, repo from query params).
 * Uses CORS proxy fallback when direct fetch fails (e.g. cross-origin).
 * @param {string} pagePath - Path e.g. /drafts/page.md
 * @returns {Promise<string|null>} - Raw markdown or null
 */
export async function fetchPageMarkdown(pagePath) {
  try {
    if (!org || !repo) return null;
    const path = pagePath.startsWith('/') ? pagePath : `/${pagePath}`;
    const url = `https://${ref}--${repo}--${org}.aem.page${path}`;
    const resp = await fetchWithCorsProxy(url);
    if (!resp.ok) return null;
    return resp.text();
  } catch (error) {
    logger.error(`Failed to fetch page markdown ${pagePath}:`, error.message);
    return null;
  }
}

/**
 * Load media-index.json from DA (sheet format).
 * @param {string} path - Path to media-index.json
 * @returns {Promise<Array>} - Array of index entries, or [] if not found
 */
export async function loadIndex(path) {
  try {
    const resp = await daFetch(`${DA_ADMIN}/source${path}`);
    if (!resp.ok) return [];
    const data = await resp.json();
    const entries = data.data || [];
    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    logger.error(`Failed to load index from ${path}:`, error.message);
    return [];
  }
}

/**
 * List children of a DA path using the DA Admin List API.
 * Returns array of items; each item may have path, name, ext, props (with lastModified).
 * @param {string} path - Path within org/repo (e.g. /.da/mediaindex)
 * @returns {Promise<Array<{path?: string, name?: string, ext?: string, props?: object}>>}
 */
export async function daList(path) {
  const normalizedPath = path.replace(/^\//, '') || '';
  const url = `${DA_ADMIN}/list/${org}/${repo}/${normalizedPath}`;
  const resp = await daFetch(url);
  if (!resp.ok) return [];
  const data = await resp.json();
  const items = Array.isArray(data) ? data : (data.sources || []);
  return items;
}

/**
 * Get media-index.json info from DA Admin List API (not Franklin Admin API).
 * Uses DA List API since the index is stored in DA.
 * @param {string} folderPath - Path to mediaindex folder within repo (e.g. .da/mediaindex)
 * @returns {Promise<{exists: boolean, lastModified: number|null}>}
 */
export async function getMediaIndexInfo(folderPath = '.da/mediaindex') {
  const items = await daList(folderPath);
  const indexFile = items.find(
    (item) => (item.name === 'media-index' && item.ext === 'json')
      || (item.path && item.path.endsWith('/media-index.json')),
  );
  if (!indexFile) return { exists: false, lastModified: null };
  // DA List API: lastModified is Unix timestamp (ms) on item (docs.da.live/developers/api/list)
  const lastMod = indexFile.lastModified ?? indexFile.props?.lastModified;
  const ts = lastMod != null && typeof lastMod === 'number' ? lastMod : null;
  return { exists: true, lastModified: ts };
}

export async function createSheet(data, type = 'sheet') {
  const sheetMeta = {
    total: data.length,
    limit: data.length,
    offset: 0,
    data,
    ':type': type,
  };
  const blob = new Blob([JSON.stringify(sheetMeta, null, 2)], { type: 'application/json' });
  const formData = new FormData();
  formData.append('data', blob);
  return formData;
}

export async function saveMeta(meta, path) {
  const metaArray = Array.isArray(meta) ? meta : [meta];
  const formData = await createSheet(metaArray);
  return daFetch(`${DA_ADMIN}/source${path}`, {
    method: 'POST',
    body: formData,
  });
}

function timestampToDuration(timestamp) {
  if (!timestamp) return '90d';
  const ageMs = Date.now() - timestamp;
  const days = Math.ceil(ageMs / (24 * 60 * 60 * 1000));
  if (days < 1) {
    const hours = Math.ceil(ageMs / (60 * 60 * 1000));
    return hours > 0 ? `${hours}h` : '1h';
  }
  return `${Math.min(days, 90)}d`;
}

export async function fetchFromAdminAPI(
  endpoint,
  orgName,
  repoName,
  refName,
  since,
  limit,
  onPageLoaded,
) {
  const fetchParams = new URLSearchParams();
  fetchParams.append('limit', limit.toString());

  // API default (no since) = from=now-15min, to=now. For initial index use max span.
  const sinceDuration = since != null ? timestampToDuration(since) : '36500d';
  fetchParams.append('since', sinceDuration);

  const baseUrl = `https://admin.hlx.page/${endpoint}/${orgName}/${repoName}/${refName}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  const url = `${baseUrl}${separator}?${fetchParams.toString()}`;

  const resp = await daFetch(url);

  if (!resp.ok) {
    throw new Error(`${endpoint} API error: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json();
  const entries = data.entries || data.data || [];
  const { nextToken } = data;

  if (onPageLoaded && entries.length > 0) {
    onPageLoaded(entries, !!nextToken);
  }

  async function fetchNextPage(token) {
    if (!token) return [];

    fetchParams.set('nextToken', token);
    const nextUrl = `${baseUrl}${separator}?${fetchParams.toString()}`;
    const nextResp = await daFetch(nextUrl);

    if (!nextResp.ok) return [];

    const nextData = await nextResp.json();
    const nextEntries = nextData.entries || nextData.data || [];

    if (onPageLoaded && nextEntries?.length > 0) {
      onPageLoaded(nextEntries, !!nextData.nextToken);
    }

    const remainingEntries = nextData.nextToken
      ? await fetchNextPage(nextData.nextToken)
      : [];
    return [...(nextEntries || []), ...remainingEntries];
  }

  const additionalEntries = await fetchNextPage(nextToken);
  return [...entries, ...additionalEntries];
}

/** Delay helper for rate limiting */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Stream fetch from Admin API - yields chunks to onChunk, does not accumulate in memory.
 * @param {string} endpoint - 'log' or 'medialog'
 * @param {string} orgName - Org
 * @param {string} repoName - Repo
 * @param {string} refName - Ref (e.g. 'main')
 * @param {number|null} since - Timestamp for incremental, or null for full
 * @param {number} limit - Page size
 * @param {Function} onChunk - (entries: Array) => void|Promise - called per chunk
 */
export async function fetchFromAdminAPIStreaming(
  endpoint,
  orgName,
  repoName,
  refName,
  since,
  limit,
  onChunk,
) {
  const fetchParams = new URLSearchParams();
  fetchParams.append('limit', limit.toString());
  const sinceDuration = since != null ? timestampToDuration(since) : '36500d';
  fetchParams.append('since', sinceDuration);

  const baseUrl = `https://admin.hlx.page/${endpoint}/${orgName}/${repoName}/${refName}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  let nextUrl = `${baseUrl}${separator}?${fetchParams.toString()}`;

  /* eslint-disable no-await-in-loop -- sequential fetch required for pagination */
  while (nextUrl) {
    const resp = await daFetch(nextUrl);

    if (!resp.ok) {
      throw new Error(`${endpoint} API error: ${resp.status} ${resp.statusText}`);
    }

    const data = await resp.json();
    const entries = data.entries || data.data || [];

    if (entries.length > 0 && onChunk) {
      await onChunk(entries);
    }

    const nextLink = data.links?.next;
    const token = data.nextToken;
    logger.debug(`[${endpoint}] page: ${entries.length} entries | response keys: ${Object.keys(data).join(', ')} | nextToken=${token ?? 'null'} | links.next=${nextLink ?? 'null'}`);

    if (nextLink && typeof nextLink === 'string' && nextLink.trim()) {
      const base = `${baseUrl}${separator}`;
      nextUrl = nextLink.startsWith('http') ? nextLink : new URL(nextLink, base).href;
    } else if (token) {
      fetchParams.set('nextToken', token);
      nextUrl = `${baseUrl}${separator}?${fetchParams.toString()}`;
    } else {
      nextUrl = null;
    }

    if (nextUrl) await sleep(RATE_LIMIT_DELAY_MS);
  }
  /* eslint-enable no-await-in-loop */
}
