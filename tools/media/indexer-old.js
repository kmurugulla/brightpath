/* eslint-disable import/no-absolute-path, import/no-unresolved */
/* The DA SDK is loaded from the da.live CDN and is required for authentication */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

// Parse URL parameters
const params = new URLSearchParams(window.location.search);
const org = params.get('org');
const repo = params.get('repo') || params.get('site');
const ref = 'main';
const sitePath = `/${org}/${repo}`;

const state = {
  building: false,
  progress: { stage: 'idle', message: '', percent: 0 },
  errors: [],
  logs: [],
  status: null,
  daToken: null,
};

async function fetchWithAuth(url, opts = {}) {
  opts.headers ||= {};
  if (state.daToken) {
    opts.headers.Authorization = `Bearer ${state.daToken}`;
  }
  return fetch(url, opts);
}

const DA_ADMIN = 'https://admin.da.live';

async function daFetch(url, opts = {}) {
  opts.headers ||= {};
  if (state.daToken) {
    opts.headers.Authorization = `Bearer ${state.daToken}`;
  }
  return fetch(url, opts);
}

async function loadMeta(path) {
  try {
    const resp = await daFetch(`${DA_ADMIN}/source${path}`);
    if (resp.ok) {
      const data = await resp.json();
      return data.data?.[0] || data;
    }
  } catch {
    return null;
  }
  return null;
}

async function createSheet(data, type = 'sheet') {
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

async function saveMeta(meta, path) {
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

async function fetchFromAdminAPI(endpoint, orgName, repoName, refName, since, limit, onPageLoaded) {
  const fetchParams = new URLSearchParams();
  fetchParams.append('limit', limit.toString());

  const sinceDuration = since ? timestampToDuration(since) : '90d';
  fetchParams.append('since', sinceDuration);

  const baseUrl = `https://admin.hlx.page/${endpoint}/${orgName}/${repoName}/${refName}`;
  const separator = endpoint === 'medialog' ? '/' : '';
  const url = `${baseUrl}${separator}?${fetchParams.toString()}`;

  const resp = await fetchWithAuth(url);

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
    const nextResp = await fetchWithAuth(nextUrl);

    if (!nextResp.ok) return [];

    const nextData = await nextResp.json();
    const nextEntries = nextData.entries || nextData.data || [];

    if (!nextEntries || nextEntries.length === 0) return [];

    if (onPageLoaded) {
      onPageLoaded([...entries, ...nextEntries], !!nextData.nextToken);
    }

    const remainingEntries = await fetchNextPage(nextData.nextToken);
    return [...nextEntries, ...remainingEntries];
  }

  const additionalEntries = await fetchNextPage(nextToken);
  return [...entries, ...additionalEntries];
}

/**
 * Normalize a path by removing query params/fragments and adding .md for pages
 * @param {string} path - The path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  if (!path) return '';
  let cleanPath = path.split('?')[0].split('#')[0];
  // Add .md for pages: /drafts/page -> /drafts/page.md
  if (!cleanPath.includes('.') && !cleanPath.startsWith('/media/')) {
    cleanPath = `${cleanPath}.md`;
  }
  return cleanPath;
}

/**
 * Detect if a path represents a page (not a media file or fragment)
 * @param {string} path - The path to check
 * @returns {boolean} True if path is a page
 */
function isPage(path) {
  if (!path || typeof path !== 'string') return false;
  return (path.endsWith('.md')
          || (!path.includes('.') && !path.startsWith('/media/')))
         && !path.includes('/fragments/');
}

/**
 * Extract the filename from a medialog entry
 * @param {object} mediaEntry - The medialog entry
 * @returns {string} The filename without query params or fragments
 */
function extractName(mediaEntry) {
  if (!mediaEntry) return '';
  if (mediaEntry.operation === 'ingest' && mediaEntry.originalFilename) {
    return mediaEntry.originalFilename.split('/').pop();
  }
  if (!mediaEntry.path) return '';
  // Remove query params (?...) and URL fragments (#...)
  return mediaEntry.path.split('?')[0].split('#')[0].split('/').pop();
}

/**
 * Detect media type from contentType in structured format
 * @param {object} mediaEntry - The medialog entry
 * @returns {string} Type in format "category > extension"
 */
function detectMediaType(mediaEntry) {
  const contentType = mediaEntry.contentType || '';
  if (contentType.startsWith('image/')) {
    const ext = contentType.split('/')[1];
    return `img > ${ext}`;
  }
  if (contentType.startsWith('video/')) {
    const ext = contentType.split('/')[1];
    return `video > ${ext}`;
  }
  return 'unknown';
}

async function getIndexStatus() {
  const metaPath = `${sitePath}/.da/mediaindex/medialog-meta.json`;
  const meta = await loadMeta(metaPath);

  return {
    lastRefresh: meta?.lastFetchTime || null,
    entriesCount: meta?.entriesCount || 0,
  };
}

async function buildInitialIndex(onProgress) {
  const index = [];

  // Phase 1: Fetch auditlog entries
  onProgress({ stage: 'fetching', message: 'Fetching auditlog entries...', percent: 10 });

  const auditlogEntries = await fetchFromAdminAPI('log', org, repo, ref, null, 1000, (entries, hasMore) => {
    onProgress({
      stage: 'fetching',
      message: `Fetched ${entries.length} auditlog entries${hasMore ? ' (more available)' : ''}...`,
      percent: 20,
    });
  });

  // Separate pages from files (filter out entries with invalid paths)
  const validEntries = auditlogEntries.filter((e) => e && e.path);
  const pages = validEntries.filter((e) => isPage(e.path));
  const files = validEntries.filter((e) => !isPage(e.path));

  onProgress({
    stage: 'fetching',
    message: `Identified ${pages.length} pages and ${files.length} files from auditlog`,
    percent: 30,
  });

  // Phase 2: Fetch medialog entries
  onProgress({ stage: 'fetching', message: 'Fetching medialog entries...', percent: 40 });

  const medialogEntries = await fetchFromAdminAPI('medialog', org, repo, ref, null, 1000, (entries, hasMore) => {
    onProgress({
      stage: 'fetching',
      message: `Fetched ${entries.length} medialog entries${hasMore ? ' (more available)' : ''}...`,
      percent: 50,
    });
  });

  onProgress({
    stage: 'processing',
    message: `Processing ${pages.length} pages with ${medialogEntries.length} medialog entries...`,
    percent: 60,
  });

  // Phase 3: Build hash map (deduplicate by hash, track all pages)
  const hashMap = new Map();

  // Process page-referenced media
  pages.forEach((pageEvent) => {
    const normalizedPath = normalizePath(pageEvent.path);

    // Find matching medialog entries within 5-second time window
    const pageMedia = medialogEntries.filter((m) => {
      if (!m.resourcePath) return false;
      if (m.resourcePath !== normalizedPath) return false;

      const TIME_WINDOW_MS = 5000;
      return m.timestamp >= pageEvent.timestamp
             && m.timestamp < pageEvent.timestamp + TIME_WINDOW_MS;
    });

    // Add to hash map
    pageMedia.forEach((media) => {
      const hash = media.mediaHash;
      if (!hashMap.has(hash)) {
        // First time seeing this hash - initialize entry
        hashMap.set(hash, {
          hash,
          pages: new Set([normalizedPath]),
          url: media.path,
          name: extractName(media),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          status: 'referenced',
        });
      } else {
        // Hash exists - update with latest info
        const entry = hashMap.get(hash);
        entry.pages.add(normalizedPath);

        // Keep latest timestamp (since logs are sorted newest first)
        if (media.timestamp > entry.timestamp) {
          entry.timestamp = media.timestamp;
          entry.operation = media.operation;
        }
      }
    });
  });

  onProgress({
    stage: 'processing',
    message: `Processed ${pages.length} pages, found ${hashMap.size} unique media items`,
    percent: 70,
  });

  // Phase 4: Process standalone uploads (not on any page yet)
  const standaloneUploads = medialogEntries.filter((m) => !m.resourcePath && m.originalFilename);

  standaloneUploads.forEach((media) => {
    const hash = media.mediaHash;
    if (!hashMap.has(hash)) {
      // Only add if not already referenced on a page
      hashMap.set(hash, {
        hash,
        pages: new Set(),
        url: media.path,
        name: media.originalFilename.split('/').pop(),
        timestamp: media.timestamp,
        user: media.user,
        operation: media.operation,
        type: detectMediaType(media),
        status: 'unused',
      });
    }
  });

  onProgress({
    stage: 'processing',
    message: `Added ${standaloneUploads.length} standalone uploads, total unique: ${hashMap.size}`,
    percent: 80,
  });

  // Convert Map to array with pipe-separated pages
  hashMap.forEach((entry) => {
    index.push({
      hash: entry.hash,
      pages: Array.from(entry.pages).join('|'),
      url: entry.url,
      name: entry.name,
      timestamp: entry.timestamp,
      user: entry.user,
      operation: entry.operation,
      type: entry.type,
      status: entry.status,
    });
  });

  // Phase 5: Save index
  onProgress({ stage: 'saving', message: `Saving ${index.length} entries...`, percent: 90 });

  const indexPath = `${sitePath}/.da/mediaindex/media-index.json`;
  const formData = await createSheet(index);
  await daFetch(`${DA_ADMIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });

  await saveMeta({
    lastFetchTime: Date.now(),
    entriesCount: index.length,
    lastRefreshBy: 'media-indexer',
  }, `${sitePath}/.da/mediaindex/medialog-meta.json`);

  onProgress({ stage: 'complete', message: `Complete! ${index.length} entries indexed`, percent: 100 });

  return { entriesCount: index.length };
}

function render() {
  const app = document.getElementById('app');

  const statusHtml = state.status ? `
    <div class="status-panel">
      <h2>Current Index Status</h2>
      <div class="status-grid">
        <div class="status-item">
          <label>Last Refresh:</label>
          <span>${state.status.lastRefresh ? new Date(state.status.lastRefresh).toLocaleString() : 'Never'}</span>
        </div>
        <div class="status-item">
          <label>Total Entries:</label>
          <span>${state.status.entriesCount || 0}</span>
        </div>
      </div>
    </div>
  ` : '<div class="status-loading">Checking status...</div>';

  const progressHtml = state.building || state.progress.stage !== 'idle' ? `
    <div class="progress-section">
      <h2>Progress</h2>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${state.progress.percent}%"></div>
      </div>
      <div class="progress-info">
        <span class="progress-stage">${state.progress.stage}</span>
        <span class="progress-message">${state.progress.message}</span>
      </div>
    </div>
  ` : '';

  const logsHtml = state.logs.length > 0 ? `
    <div class="logs-section">
      <h3>Logs (${state.logs.length})</h3>
      <ul class="logs-list">
        ${state.logs.map((log) => `<li class="log-${log.type}">${log.message}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const errorsHtml = state.errors.length > 0 ? `
    <div class="errors-section">
      <h3>Errors (${state.errors.length})</h3>
      <ul class="errors-list">
        ${state.errors.map((err) => `<li>${err.message}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  app.innerHTML = `
    <h1>Media Index Builder</h1>
    <p>Building index for: <strong>${org}/${repo}</strong></p>

    ${statusHtml}

    <div class="actions">
      <button id="buildBtn" class="btn-primary" ${state.building ? 'disabled' : ''}>
        ${state.building ? 'Building Index...' : 'Build Initial Index'}
      </button>
    </div>

    ${progressHtml}
    ${errorsHtml}
    ${logsHtml}
  `;
}

function attachEventListeners() {
  if (!state.building) {
    const buildBtn = document.getElementById('buildBtn');
    if (buildBtn) {
      buildBtn.addEventListener('click', () => {
        state.building = true;
        state.errors = [];
        state.logs = [];
        state.progress = { stage: 'starting', message: 'Starting build...', percent: 0 };
        render();

        buildInitialIndex((progress) => {
          state.progress = progress;
          state.logs.push({ message: progress.message, type: 'info' });
          render();
        })
          .then((result) => {
            state.logs.push({ message: `Index built successfully: ${result.entriesCount} entries`, type: 'success' });
            return getIndexStatus();
          })
          .then((status) => {
            state.status = status;
          })
          .catch((error) => {
            state.errors.push({ message: error.message });
            state.logs.push({ message: `Error: ${error.message}`, type: 'error' });
            state.progress = { stage: 'error', message: error.message, percent: 0 };
          })
          .finally(() => {
            state.building = false;
            render();
            attachEventListeners();
          });
      });
    }
  }
}

async function init() {
  if (!org || !repo) {
    document.getElementById('app').innerHTML = `
      <div class="error">
        <h1>Missing Parameters</h1>
        <p>Please provide org and repo parameters in the URL:</p>
        <pre>?org=yourorg&repo=yourrepo</pre>
      </div>
    `;
    return;
  }

  // Get DA token with timeout
  try {
    const tokenPromise = DA_SDK;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Authentication timeout')), 5000);
    });

    const result = await Promise.race([tokenPromise, timeoutPromise]);
    state.daToken = result?.token;
  } catch (error) {
    state.errors.push({ message: `Failed to get DA token: ${error.message}` });
  }

  if (!state.daToken) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `https://da.live/?returnUrl=${returnUrl}`;
    return;
  }

  state.status = await getIndexStatus();
  render();
  attachEventListeners();
}

init();
