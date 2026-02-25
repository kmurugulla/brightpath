/**
 * Core index building logic
 */

import {
  org, repo, ref, sitePath, DA_ADMIN,
} from './config.js';
import {
  fetchFromAdminAPI, fetchFromAdminAPIStreaming, createSheet, daFetch, saveMeta, loadMeta,
  loadIndex, getMediaIndexInfo, fetchPageMarkdown,
} from './api.js';
import {
  normalizePath, isPage, extractName, detectMediaType,
  isPdf, isSvg, isFragment, isPdfOrSvg, getFileType,
  isLinkedContentPath, normalizeFilePath,
  extractFragmentReferences, extractLinks, extractIconReferences,
} from './helpers.js';
import * as logger from './logger.js';

/** Constants */
// 2 minutes tolerance for index/meta alignment
const INDEX_ALIGNMENT_TOLERANCE_MS = 120_000;
// 5s window for matching media to page events (full build)
const MEDIA_ASSOCIATION_WINDOW_MS = 5000;
// 10s window for incremental media updates
const INCREMENTAL_WINDOW_MS = 10000;
// Default page size for Admin API requests
const API_PAGE_SIZE = 1000;
// Max concurrent page markdown fetches to avoid overwhelming browser/server
const MAX_CONCURRENT_FETCHES = 10;

export async function getIndexStatus() {
  const metaPath = `${sitePath}/.da/mediaindex/medialog-meta.json`;
  const meta = await loadMeta(metaPath);
  const { exists: indexExists, lastModified: indexLastModified } = await getMediaIndexInfo('.da/mediaindex');

  return {
    lastRefresh: meta?.lastFetchTime || null,
    entriesCount: meta?.entriesCount || 0,
    lastBuildMode: meta?.lastBuildMode || null,
    indexExists,
    indexLastModified,
  };
}

/**
 * Determine if we can do incremental re-index instead of full build.
 * Re-index when: meta has lastFetchTime, index exists, and index lastModified aligns with meta.
 * @returns {Promise<{shouldReindex: boolean, reason?: string}>}
 */
export async function shouldReindex() {
  const metaPath = `${sitePath}/.da/mediaindex/medialog-meta.json`;
  const meta = await loadMeta(metaPath);
  const { exists: indexExists, lastModified: indexLastModified } = await getMediaIndexInfo('.da/mediaindex');

  if (!meta?.lastFetchTime) {
    return { shouldReindex: false, reason: 'No previous fetch (meta missing lastFetchTime)' };
  }
  if (!indexExists) {
    return { shouldReindex: false, reason: 'Index file does not exist in DA' };
  }
  if (indexLastModified == null) {
    return { shouldReindex: false, reason: 'DA List API did not return lastModified for media-index.json' };
  }

  const lastFetch = meta.lastFetchTime;
  const diff = Math.abs(lastFetch - indexLastModified);
  if (diff > INDEX_ALIGNMENT_TOLERANCE_MS) {
    return {
      shouldReindex: false,
      reason: `Index lastModified (${indexLastModified}) does not align with meta lastFetchTime (${lastFetch})`,
    };
  }

  return { shouldReindex: true };
}

/**
 * Execute async tasks with concurrency limit
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function to execute per item
 * @param {number} concurrency - Max concurrent operations
 * @returns {Promise<Array>} Results in order
 */
async function processConcurrently(items, fn, concurrency) {
  const results = [];
  const executing = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const promise = Promise.resolve().then(() => fn(item, i));
    results.push(promise);

    if (concurrency <= items.length) {
      const executingPromise = promise.then(() => {
        executing.splice(executing.indexOf(executingPromise), 1);
      });
      executing.push(executingPromise);

      if (executing.length >= concurrency) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.race(executing);
      }
    }
  }

  return Promise.all(results);
}

/**
 * Build usage map for linked content (PDFs, SVGs, fragments).
 * Fetches .md from preview URL and parses markdown link syntax.
 * @param {Array<{path: string}>} pageEntries - Auditlog entries for pages
 * @param {Function} onProgress - Progress callback
 * @returns {Promise<{pdfs: Map, svgs: Map, fragments: Map}>}
 */
async function buildContentUsageMap(pageEntries, onProgress) {
  const usageMap = {
    fragments: new Map(),
    pdfs: new Map(),
    svgs: new Map(),
  };

  const pagesByPath = new Map();
  pageEntries.forEach((e) => {
    const p = normalizePath(e.path);
    if (!pagesByPath.has(p)) pagesByPath.set(p, []);
    pagesByPath.get(p).push(e);
  });
  pagesByPath.forEach((events) => {
    events.sort((a, b) => b.timestamp - a.timestamp);
  });

  const uniquePages = [...pagesByPath.keys()];
  logger.debug(`[buildContentUsageMap] parsing ${uniquePages.length} unique pages: [${uniquePages.slice(0, 10).join(', ')}${uniquePages.length > 10 ? '...' : ''}]`);

  const results = await processConcurrently(
    uniquePages,
    async (normalizedPath, i) => {
      onProgress?.({ message: `Parsing page ${i + 1}/${uniquePages.length}: ${normalizedPath}` });
      const md = await fetchPageMarkdown(normalizedPath);
      return { normalizedPath, md };
    },
    MAX_CONCURRENT_FETCHES,
  );

  const failed = results.filter((r) => !r.md);
  if (failed.length > 0) {
    logger.warn(`[buildContentUsageMap] failed to fetch markdown for ${failed.length} pages: [${failed.map((r) => r.normalizedPath).join(', ')}]`);
  }

  results.forEach(({ normalizedPath, md }) => {
    if (!md) return;

    const fragments = extractFragmentReferences(md);
    const pdfs = extractLinks(md, /\.pdf$/);
    const svgs = extractLinks(md, /\.svg$/);
    const icons = extractIconReferences(md);

    const addToMap = (map, path) => {
      if (!map.has(path)) map.set(path, []);
      if (!map.get(path).includes(normalizedPath)) {
        map.get(path).push(normalizedPath);
      }
    };

    fragments.forEach((f) => addToMap(usageMap.fragments, f));
    pdfs.forEach((p) => addToMap(usageMap.pdfs, p));
    svgs.forEach((s) => addToMap(usageMap.svgs, s));
    icons.forEach((s) => addToMap(usageMap.svgs, s));
  });

  const iconPathsFromUsage = [...usageMap.svgs.keys()].filter((p) => p.includes('/icons/'));
  logger.debug(`[buildContentUsageMap] usageMap: pdfs=${usageMap.pdfs.size}, svgs=${usageMap.svgs.size}, fragments=${usageMap.fragments.size} | icon paths from parsing: [${iconPathsFromUsage.join(', ') || 'none'}]`);

  return usageMap;
}

function noop() {}

/**
 * Find page events matching media within time window
 * Matches media to page events that occurred BEFORE media timestamp within window
 * Time window: MEDIA_ASSOCIATION_WINDOW_MS (5s for full build)
 * Rationale: Media operations typically follow page preview within seconds
 * Example: Page preview at T, media upload at T+2s → matched (within 5s window)
 * Edge case: Media uploaded, then page previewed → not matched (preview must come first)
 * @param {Map} pagesByPath - Map of normalized path to page events
 * @param {string} resourcePath - Media resource path
 * @param {number} mediaTimestamp - Media operation timestamp
 * @returns {Array} Matching page events
 */
function findMatchingPageEvents(pagesByPath, resourcePath, mediaTimestamp) {
  const events = pagesByPath.get(resourcePath);
  if (!events || events.length === 0) return [];
  const minTs = mediaTimestamp - MEDIA_ASSOCIATION_WINDOW_MS;
  return events.filter(
    (e) => e.timestamp <= mediaTimestamp && e.timestamp > minTs,
  );
}

/** Check memory (Chrome/Edge); returns { warning, usedMB, limitMB } or { warning: false } */
function checkMemory() {
  if (typeof performance !== 'undefined' && performance.memory) {
    const used = performance.memory.usedJSHeapSize / (1024 * 1024);
    const limit = performance.memory.jsHeapSizeLimit / (1024 * 1024);
    return { warning: used > limit * 0.8, usedMB: used, limitMB: limit };
  }
  return { warning: false };
}

/**
 * Remove media entry from index; handle orphaned media
 * Strategy: If removing last reference to a hash, mark as "unused" vs deleting
 * Exception: Don't add "unused" if medialog has explicit "delete" for this hash
 * Rationale: Media files persist in storage when unreferenced; track for cleanup
 * Example: Media on 2 pages, remove from 1 → still referenced
 *          Remove from both → becomes "unused"
 * @param {Array} idx - Index array
 * @param {object} entry - Entry to remove
 * @param {string} path - Page path
 * @param {Array} medialog - Medialog entries for delete detection
 * @returns {number} removed count (0 or 1)
 */
function removeMediaMaybeAddOrphan(idx, entry, path, medialog) {
  const i = idx.findIndex((e) => e.hash === entry.hash && e.page === path);
  if (i === -1) return 0;
  const { hash } = entry;
  const hasDelete = medialog.some((m) => m.mediaHash === hash && m.operation === 'delete');
  idx.splice(i, 1);
  const stillHasEntry = idx.some((e) => e.hash === hash);
  const alreadyUnused = idx.some((e) => e.hash === hash && !e.page);
  if (!stillHasEntry && !hasDelete && !alreadyUnused) {
    idx.push({
      hash,
      page: '',
      url: entry.url,
      name: entry.name,
      timestamp: entry.timestamp,
      user: entry.user,
      operation: entry.operation,
      type: entry.type,
      status: 'unused',
    });
  }
  return 1;
}

/**
 * Create a linked-content index entry using the same schema as media entries
 * so the DA sheet stores all rows correctly (no column misalignment).
 * @param {string} filePath - Path e.g. /icons/headset.svg
 * @param {string[]} linkedPages - Pages that reference this file
 * @param {{timestamp: number, user?: string}} fileEvent - Auditlog event
 * @param {string} status - 'referenced' or 'file-unused'
 * @returns {object} Entry matching media schema (hash, page, url, name, etc.)
 */
function toLinkedContentEntry(filePath, linkedPages, fileEvent, status) {
  const pageVal = linkedPages.length > 0 ? linkedPages.join(',') : '';
  return {
    hash: filePath,
    page: pageVal,
    url: '',
    name: filePath.split('/').pop() || filePath,
    timestamp: fileEvent.timestamp,
    user: fileEvent.user || '',
    operation: 'auditlog-parsed',
    type: getFileType(filePath),
    status,
    source: 'auditlog-parsed',
  };
}

/**
 * Process page-level media updates for incremental indexing
 * Compares old index entries with new medialog to detect additions/removals
 * @param {Array} updatedIndex - Index being built (mutated)
 * @param {Map} pagesByPath - Map of page path to events
 * @param {Array} medialogEntries - New medialog entries
 * @param {Function} onLog - Logging callback
 * @returns {{added: number, removed: number}} Counts
 */
function processPageMediaUpdates(updatedIndex, pagesByPath, medialogEntries, onLog) {
  let added = 0;
  let removed = 0;

  pagesByPath.forEach((pageEvents, normalizedPath) => {
    const latestEvent = pageEvents[0];
    const latestTs = latestEvent.timestamp;
    const windowStart = latestTs;
    const windowEnd = latestTs + INCREMENTAL_WINDOW_MS;

    onLog(`--- Page: ${normalizedPath} ---`);
    onLog(`  Latest preview: ${latestTs} (${new Date(latestTs).toISOString()})`);
    onLog(`  Window: [${windowStart}-${windowEnd}] (${INCREMENTAL_WINDOW_MS / 1000}s)`);

    const matchesPage = (m) => m.resourcePath && m.resourcePath === normalizedPath;
    const pageMedialogAll = medialogEntries.filter(matchesPage);
    const inWindow = (m) => m.timestamp >= windowStart && m.timestamp < windowEnd;
    const newPageMedia = pageMedialogAll.filter(inWindow);
    const outsideWindow = pageMedialogAll.filter((m) => !newPageMedia.includes(m));

    if (pageMedialogAll.length > 0) {
      onLog(`  Medialog for page: ${pageMedialogAll.length} total, ${newPageMedia.length} in window, ${outsideWindow.length} outside`);
      if (outsideWindow.length > 0) {
        outsideWindow.slice(0, 3).forEach((m) => {
          onLog(`    Outside: hash=${m.mediaHash} ts=${m.timestamp} (${new Date(m.timestamp).toISOString()})`);
        });
      }
    }

    const oldPageEntries = updatedIndex.filter((e) => e.page === normalizedPath);
    const oldHashes = new Set(oldPageEntries.map((e) => e.hash));
    const newHashes = new Set(newPageMedia.map((m) => m.mediaHash));

    onLog(`  Old (index): ${oldHashes.size} hashes ${[...oldHashes].slice(0, 5).join(', ')}${oldHashes.size > 5 ? '...' : ''}`);
    onLog(`  New (medialog in window): ${newHashes.size} hashes ${[...newHashes].slice(0, 5).join(', ')}${newHashes.size > 5 ? '...' : ''}`);

    /**
     * Edge case: Page was previewed but no media in the time window
     * Scenario: User previewed page, removed all media, then previewed again
     * Decision: Remove all old media entries for this page (assume removal intended)
     * Alternative considered: Keep old entries (assume no change)
     * Rationale: Preview action signals intent to update; empty medialog = intentional removal
     * Assumption: Events are processed in timestamp order
     */
    if (newPageMedia.length === 0 && oldPageEntries.length > 0) {
      onLog('  Edge case: Page previewed with no media in window - removing old entries');
      const rm = removeMediaMaybeAddOrphan;
      oldPageEntries.forEach((oldEntry) => {
        removed += rm(updatedIndex, oldEntry, normalizedPath, medialogEntries);
      });
      return;
    }

    const toRemove = [...oldHashes].filter((h) => !newHashes.has(h));
    const toAdd = [...newHashes].filter((h) => !oldHashes.has(h));
    const unchanged = [...newHashes].filter((h) => oldHashes.has(h));

    if (toRemove.length || toAdd.length) {
      onLog(`  Diff: remove ${toRemove.length} (${toRemove.slice(0, 3).join(', ')}${toRemove.length > 3 ? '...' : ''}), add ${toAdd.length}`);
    }

    const rm = removeMediaMaybeAddOrphan;
    toRemove.forEach((hash) => {
      const oldEntry = oldPageEntries.find((e) => e.hash === hash);
      if (oldEntry) {
        removed += rm(updatedIndex, oldEntry, normalizedPath, medialogEntries);
      }
    });

    toAdd.forEach((hash) => {
      const media = newPageMedia.find((m) => m.mediaHash === hash);
      if (media) {
        updatedIndex.push({
          hash: media.mediaHash,
          page: normalizedPath,
          url: media.path,
          name: extractName(media),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          status: 'referenced',
        });
        added += 1;
      }
    });

    unchanged.forEach((hash) => {
      const idx = updatedIndex.findIndex((e) => e.hash === hash && e.page === normalizedPath);
      const media = newPageMedia.find((m) => m.mediaHash === hash);
      if (idx !== -1 && media) {
        updatedIndex[idx].timestamp = media.timestamp;
      }
    });
  });

  return { added, removed };
}

/**
 * Process standalone media uploads (no page association)
 * @param {Array} updatedIndex - Index being built (mutated)
 * @param {Array} medialogEntries - New medialog entries
 * @param {Set} referencedHashes - Already referenced media hashes
 * @returns {number} Added count
 */
function processStandaloneUploads(updatedIndex, medialogEntries, referencedHashes) {
  let added = 0;
  const standaloneUploads = medialogEntries.filter((m) => !m.resourcePath && m.originalFilename);

  standaloneUploads.forEach((media) => {
    if (!referencedHashes.has(media.mediaHash)) {
      const exists = updatedIndex.some((e) => e.hash === media.mediaHash && !e.page);
      if (!exists) {
        updatedIndex.push({
          hash: media.mediaHash,
          page: '',
          url: media.path,
          name: media.originalFilename.split('/').pop(),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          status: 'unused',
        });
        added += 1;
      }
    }
  });

  return added;
}

/**
 * Process linked content (PDFs, SVGs, fragments) for incremental index
 * @param {Array} updatedIndex - Index being built (mutated)
 * @param {Array} files - File events from auditlog
 * @param {Array} pages - Page events
 * @param {Function} onProgress - Progress callback
 * @param {Function} onLog - Log callback
 * @returns {Promise<{added: number, removed: number}>} Counts
 */
async function processLinkedContentIncremental(updatedIndex, files, pages, onProgress, onLog) {
  let added = 0;
  let removed = 0;

  const filesByPath = new Map();
  files.forEach((e) => {
    if (!isPdfOrSvg(e.path) && !isFragment(e.path)) return;
    const p = e.path;
    const existing = filesByPath.get(p);
    if (!existing || e.timestamp > existing.timestamp) filesByPath.set(p, e);
  });

  const deletedPaths = new Set();
  filesByPath.forEach((event, path) => {
    if (event.method === 'DELETE') deletedPaths.add(path);
  });

  // Remove deleted linked content
  deletedPaths.forEach((path) => {
    const idx = updatedIndex.findIndex(
      (e) => (e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed') && e.hash === path,
    );
    if (idx !== -1) {
      updatedIndex.splice(idx, 1);
      removed += 1;
      onLog(`Removed linked content (DELETE): ${path}`);
    }
  });

  // Build usage map
  onProgress({ stage: 'processing', message: 'Building usage map for linked content...', percent: 83 });
  const usageMap = await buildContentUsageMap(pages, (p) => onProgress(p));

  const allLinkedPaths = new Set(filesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });

  // Add existing linked content paths whose pages were parsed
  const parsedPages = new Set(pages.map((p) => normalizePath(p.path)));
  updatedIndex.forEach((e) => {
    const isLinkedContent = e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed';
    if (!isLinkedContent) return;
    const entryPages = (e.page || '').split(',').map((p) => p.trim()).filter(Boolean);
    if (entryPages.some((p) => parsedPages.has(p))) {
      allLinkedPaths.add(e.hash);
    }
  });

  allLinkedPaths.forEach((filePath) => {
    if (deletedPaths.has(filePath)) return;

    let key = 'fragments';
    if (isPdf(filePath)) key = 'pdfs';
    else if (isSvg(filePath)) key = 'svgs';
    const linkedPages = usageMap[key]?.get(filePath) || [];
    const status = linkedPages.length > 0 ? 'referenced' : 'file-unused';
    const fileEvent = filesByPath.get(filePath) || { timestamp: 0, user: '' };

    const isLinked = (e) => (e.operation === 'auditlog-parsed' || e.source === 'auditlog-parsed')
      && e.hash === filePath;
    const existingIdx = updatedIndex.findIndex(isLinked);

    if (existingIdx !== -1) {
      updatedIndex[existingIdx].page = linkedPages.length > 0 ? linkedPages.join(',') : '';
      updatedIndex[existingIdx].timestamp = fileEvent.timestamp;
      updatedIndex[existingIdx].status = status;
    } else {
      updatedIndex.push(toLinkedContentEntry(filePath, linkedPages, fileEvent, status));
      added += 1;
    }
  });

  return { added, removed };
}

/**
 * Incremental re-index: fetch logs since lastFetchTime, merge with existing index.
 * Detects additions, removals, and updates per page.
 * @param {Function} onProgress - Progress callback
 * @param {Function} [onLog] - Optional debug log callback for per-page details
 */
export async function buildIncrementalIndex(onProgress, onLog = noop) {
  const metaPath = `${sitePath}/.da/mediaindex/medialog-meta.json`;
  const indexPath = `${sitePath}/.da/mediaindex/media-index.json`;
  const meta = await loadMeta(metaPath);
  const lastFetchTime = meta?.lastFetchTime;

  if (!lastFetchTime) {
    throw new Error('Cannot run incremental: meta missing lastFetchTime');
  }

  onLog(`lastFetchTime: ${lastFetchTime} (${new Date(lastFetchTime).toISOString()})`);
  onProgress({
    stage: 'starting',
    message: 'Mode: Incremental re-index (since last build)',
    percent: 5,
  });

  onProgress({ stage: 'loading', message: 'Loading existing index...', percent: 8 });
  const existingIndex = await loadIndex(indexPath);

  onLog(`Fetching auditlog since ${new Date(lastFetchTime).toISOString()}`);
  onProgress({ stage: 'fetching', message: 'Fetching new auditlog entries...', percent: 15 });
  const auditlogEntries = await fetchFromAdminAPI('log', org, repo, ref, lastFetchTime, API_PAGE_SIZE, (entries, hasMore) => {
    onProgress({
      stage: 'fetching',
      message: `Fetched ${entries.length} auditlog entries${hasMore ? ' (more available)' : ''}...`,
      percent: 25,
    });
  });

  const validEntries = auditlogEntries.filter((e) => e && e.path && e.route === 'preview');
  const pages = validEntries.filter((e) => isPage(e.path));

  onProgress({ stage: 'fetching', message: 'Fetching new medialog entries...', percent: 35 });
  const medialogEntries = await fetchFromAdminAPI('medialog', org, repo, ref, lastFetchTime, API_PAGE_SIZE, (entries, hasMore) => {
    onProgress({
      stage: 'fetching',
      message: `Fetched ${entries.length} medialog entries${hasMore ? ' (more available)' : ''}...`,
      percent: 45,
    });
  });

  if (pages.length === 0 && medialogEntries.length === 0) {
    onProgress({
      stage: 'complete',
      message: 'No new activity since last build - index unchanged',
      percent: 100,
    });
    return existingIndex;
  }

  onLog(`Auditlog: ${auditlogEntries.length} entries, ${pages.length} pages`);
  onLog(`Medialog: ${medialogEntries.length} entries (all since lastFetchTime)`);
  onProgress({
    stage: 'processing',
    message: `Processing ${pages.length} pages with ${medialogEntries.length} medialog entries...`,
    percent: 55,
  });

  const updatedIndex = [...existingIndex];

  const pagesByPath = new Map();
  pages.forEach((e) => {
    const p = normalizePath(e.path);
    if (!pagesByPath.has(p)) pagesByPath.set(p, []);
    pagesByPath.get(p).push(e);
  });

  /**
   * Indexing strategy for multiple preview events per page
   * Rule: Process only the LATEST preview event per page, skip others
   * Rationale: Latest preview represents current state; earlier previews are superseded
   * Example: Page previewed at T1, T2, T3 → only process T3's media associations
   * Trade-off: Simpler logic, potential to miss media if window misaligned (acceptable)
   */
  pagesByPath.forEach((events) => {
    events.sort((a, b) => b.timestamp - a.timestamp);
  });
  onLog(`Time window: ${INCREMENTAL_WINDOW_MS / 1000}s (medialog within window of latest preview)`);
  onLog(`Pages to process: ${pagesByPath.size} (${[...pagesByPath.keys()].join(', ')})`);
  onLog(`Medialog entries since lastFetch: ${medialogEntries.length}`);

  // Process page-level media updates
  const pageResults = processPageMediaUpdates(updatedIndex, pagesByPath, medialogEntries, onLog);
  let { added, removed } = pageResults;

  // Calculate referenced hashes for standalone upload processing
  const referencedHashes = new Set(
    updatedIndex.filter((e) => e.page).flatMap((e) => e.hash),
  );

  // Process standalone uploads
  const standaloneAdded = processStandaloneUploads(updatedIndex, medialogEntries, referencedHashes);
  added += standaloneAdded;

  // Process linked content
  const files = validEntries.filter((e) => !isPage(e.path));
  const linkedResults = await processLinkedContentIncremental(
    updatedIndex,
    files,
    pages,
    onProgress,
    onLog,
  );
  added += linkedResults.added;
  removed += linkedResults.removed;

  onProgress({
    stage: 'processing',
    message: `Incremental: +${added} added, -${removed} removed, total: ${updatedIndex.length}`,
    percent: 85,
  });

  onProgress({ stage: 'saving', message: `Saving ${updatedIndex.length} entries...`, percent: 90 });

  const formData = await createSheet(updatedIndex);
  await daFetch(`${DA_ADMIN}/source${indexPath}`, {
    method: 'POST',
    body: formData,
  });

  await saveMeta({
    lastFetchTime: Date.now(),
    entriesCount: updatedIndex.length,
    lastRefreshBy: 'media-indexer',
    lastBuildMode: 'incremental',
  }, metaPath);

  onProgress({
    stage: 'complete',
    message: `Incremental complete! ${updatedIndex.length} entries (${added} added, ${removed} removed)`,
    percent: 100,
  });

  return updatedIndex;
}

export async function buildInitialIndex(onProgress) {
  const index = [];
  const buildMode = 'full'; // incremental not yet implemented

  onProgress({
    stage: 'starting',
    message: 'Mode: Full build (rebuilding from auditlog + medialog)',
    percent: 5,
  });

  // Phase 1: Stream auditlog, build maps (no full accumulation)
  onProgress({ stage: 'fetching', message: 'Fetching auditlog (streaming)...', percent: 10 });

  const pagesByPath = new Map(); // normalizedPath -> [events] sorted desc
  const filesByPath = new Map(); // path -> latest event
  const deletedPaths = new Set();
  let auditlogCount = 0;

  await fetchFromAdminAPIStreaming('log', org, repo, ref, null, API_PAGE_SIZE, (chunk) => {
    const rawCount = chunk.length;
    const droppedNoPath = chunk.filter((e) => !e?.path).length;
    const droppedRoute = chunk.filter((e) => e?.path && e.route !== 'preview').length;
    if (droppedNoPath > 0 || droppedRoute > 0) {
      logger.debug(`[auditlog chunk] raw=${rawCount}, dropped(no path)=${droppedNoPath}, dropped(route!==preview)=${droppedRoute}`);
    }
    chunk.forEach((e) => {
      if (!e?.path || e.route !== 'preview') return;
      auditlogCount += 1;
      if (isPage(e.path)) {
        const p = normalizePath(e.path);
        if (!pagesByPath.has(p)) pagesByPath.set(p, []);
        pagesByPath.get(p).push(e);
      } else {
        const fp = normalizeFilePath(e.path);
        const existing = filesByPath.get(fp);
        if (!existing || e.timestamp > existing.timestamp) {
          filesByPath.set(fp, e);
        }
      }
    });
    onProgress({
      stage: 'fetching',
      message: `Auditlog: ${auditlogCount} entries, ${pagesByPath.size} pages...`,
      percent: 15,
    });
  });

  pagesByPath.forEach((events) => events.sort((a, b) => b.timestamp - a.timestamp));

  const pages = [];
  pagesByPath.forEach((events) => pages.push(...events));

  /**
   * Deletion detection strategy: Only mark as deleted if LATEST event is DELETE
   * Rationale: If a file was deleted then re-added, the latest event reflects current state
   * Assumption: filesByPath contains only the latest event per path (maintained above)
   * Example timeline: DELETE at T1, POST at T2 → latest=POST → not deleted (correct)
   */
  filesByPath.forEach((event, path) => {
    if (isLinkedContentPath(path) && event.method === 'DELETE') {
      deletedPaths.add(path);
    }
  });

  const iconPathsFromAuditlog = [...filesByPath.keys()].filter((p) => p.includes('/icons/'));
  const iconPathsInDeleted = [...deletedPaths].filter((p) => p.includes('/icons/'));
  logger.debug(`[auditlog done] total=${auditlogCount}, pages=${pagesByPath.size}, files=${filesByPath.size}, deleted=${deletedPaths.size}`);
  logger.debug(`  icon paths from auditlog: [${iconPathsFromAuditlog.join(', ') || 'none'}]`);
  logger.debug(`  icon paths in deletedPaths: [${iconPathsInDeleted.join(', ') || 'none'}]`);

  onProgress({
    stage: 'fetching',
    message: `Identified ${pages.length} page events, ${filesByPath.size} files`,
    percent: 25,
  });

  // Phase 2: Stream medialog, process each chunk (no full accumulation)
  onProgress({ stage: 'fetching', message: 'Fetching medialog (streaming)...', percent: 30 });

  const entryMap = new Map();
  const referencedHashes = new Set();
  const standaloneBuffer = [];
  let medialogCount = 0;

  await fetchFromAdminAPIStreaming('medialog', org, repo, ref, null, API_PAGE_SIZE, (chunk) => {
    logger.debug(`[medialog chunk] ${chunk.length} entries`);
    chunk.forEach((media) => {
      medialogCount += 1;
      if (media.resourcePath) {
        const matches = findMatchingPageEvents(pagesByPath, media.resourcePath, media.timestamp);
        matches.forEach((pageEvent) => {
          const normalizedPath = normalizePath(pageEvent.path);
          const hash = media.mediaHash;
          const key = `${hash}|${normalizedPath}`;
          const existing = entryMap.get(key);
          if (!existing || media.timestamp > existing.timestamp) {
            entryMap.set(key, {
              hash,
              page: normalizedPath,
              url: media.path,
              name: extractName(media),
              timestamp: media.timestamp,
              user: media.user,
              operation: media.operation,
              type: detectMediaType(media),
              status: 'referenced',
            });
          }
          referencedHashes.add(hash);
        });
      } else if (media.originalFilename) {
        standaloneBuffer.push(media);
      }
    });
    const mem = checkMemory();
    if (mem.warning) {
      onProgress({
        stage: 'processing',
        message: `Memory: ${mem.usedMB.toFixed(0)}MB / ${mem.limitMB.toFixed(0)}MB`,
        percent: 35,
      });
    } else {
      onProgress({
        stage: 'fetching',
        message: `Medialog: ${medialogCount} entries processed...`,
        percent: 35,
      });
    }
  });

  onProgress({
    stage: 'processing',
    message: `Processed ${medialogCount} medialog, ${entryMap.size} page refs`,
    percent: 60,
  });

  // Phase 3: Process standalone uploads
  standaloneBuffer.forEach((media) => {
    const hash = media.mediaHash;
    if (!referencedHashes.has(hash)) {
      const key = `${hash}|`;
      const existing = entryMap.get(key);
      if (!existing || media.timestamp > existing.timestamp) {
        entryMap.set(key, {
          hash,
          page: '',
          url: media.path,
          name: media.originalFilename.split('/').pop(),
          timestamp: media.timestamp,
          user: media.user,
          operation: media.operation,
          type: detectMediaType(media),
          status: 'unused',
        });
      }
    }
  });

  onProgress({
    stage: 'processing',
    message: `Standalone: ${standaloneBuffer.length}, total: ${entryMap.size}`,
    percent: 70,
  });

  // Convert Map to array
  entryMap.forEach((entry) => {
    index.push(entry);
  });

  // Phase 5: Linked content (PDFs, SVGs, fragments) - parse pages for usage
  onProgress({ stage: 'processing', message: 'Building content usage map (parsing pages)...', percent: 78 });
  const usageMap = await buildContentUsageMap(pages, (p) => onProgress(p));

  const linkedFilesByPath = new Map();
  filesByPath.forEach((e, p) => {
    if (!isPdfOrSvg(p) && !isFragment(p)) return;
    linkedFilesByPath.set(p, e);
  });

  const usageKey = (path) => {
    if (isPdf(path)) return 'pdfs';
    if (isSvg(path)) return 'svgs';
    return 'fragments';
  };

  const allLinkedPaths = new Set(linkedFilesByPath.keys());
  ['pdfs', 'svgs', 'fragments'].forEach((key) => {
    usageMap[key]?.forEach((_, path) => allLinkedPaths.add(path));
  });

  const iconPathsInAllLinked = [...allLinkedPaths].filter((p) => p.includes('/icons/'));
  logger.debug(`[linked content] linkedFilesByPath=${linkedFilesByPath.size}, allLinkedPaths=${allLinkedPaths.size} (after merge with usageMap) | icon paths: [${iconPathsInAllLinked.join(', ') || 'none'}]`);

  allLinkedPaths.forEach((filePath) => {
    if (deletedPaths.has(filePath)) {
      if (filePath.includes('/icons/')) {
        logger.debug(`[linked content] SKIP (in deletedPaths): ${filePath}`);
      }
      return;
    }
    const key = usageKey(filePath);
    const linkedPages = usageMap[key]?.get(filePath) || [];
    const status = linkedPages.length > 0 ? 'referenced' : 'file-unused';
    const fileEvent = linkedFilesByPath.get(filePath) || { timestamp: 0, user: '' };
    index.push(toLinkedContentEntry(filePath, linkedPages, fileEvent, status));
  });

  const linkedContentCount = index.length - entryMap.size;
  const iconEntriesInIndex = index.filter((e) => e.hash?.includes?.('/icons/'));
  logger.debug(`[full build done] media=${entryMap.size}, linked content=${linkedContentCount}, total=${index.length} | icon entries in index: [${iconEntriesInIndex.map((e) => e.hash).join(', ') || 'none'}]`);

  onProgress({
    stage: 'processing',
    message: `Added ${allLinkedPaths.size} linked content entries (PDFs, SVGs, fragments)`,
    percent: 82,
  });

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
    lastBuildMode: buildMode,
  }, `${sitePath}/.da/mediaindex/medialog-meta.json`);

  onProgress({ stage: 'complete', message: `Complete! ${index.length} entries indexed`, percent: 100 });

  return index;
}
