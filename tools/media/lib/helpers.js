/**
 * Helper functions for path normalization, type detection, and name extraction
 */

import * as logger from './logger.js';

/**
 * Normalize path by removing query params and adding .md for pages
 * @param {string} path - The path to normalize
 * @returns {string} Normalized path
 */
export function normalizePath(path) {
  if (!path) return '';
  let cleanPath = path.split('?')[0].split('#')[0];
  if (!cleanPath.includes('.') && !cleanPath.startsWith('/media/')) {
    cleanPath = cleanPath === '/' || cleanPath === '' ? '/index.md' : `${cleanPath}.md`;
  }
  return cleanPath;
}

/**
 * Check if a path represents a page (not a media file or fragment)
 * @param {string} path - The path to check
 * @returns {boolean} True if path is a page
 */
export function isPage(path) {
  if (!path || typeof path !== 'string') return false;
  return (path.endsWith('.md')
          || (!path.includes('.') && !path.startsWith('/media/')))
         && !path.includes('/fragments/');
}

/**
 * Extract filename from medialog entry or path
 * @param {object} mediaEntry - The medialog entry
 * @returns {string} Extracted filename
 */
export function extractName(mediaEntry) {
  if (!mediaEntry) return '';
  if (mediaEntry.originalFilename) {
    return mediaEntry.originalFilename.split('/').pop();
  }
  if (!mediaEntry.path) return '';
  return mediaEntry.path.split('?')[0].split('#')[0].split('/').pop();
}

/** Phase 2: Linked content type detection */
export function isPdf(path) {
  return path && path.toLowerCase().endsWith('.pdf');
}

export function isSvg(path) {
  return path && path.toLowerCase().endsWith('.svg');
}

export function isFragment(path) {
  return path && path.includes('/fragments/');
}

/** True if path is PDF, SVG, or fragment (linked content from auditlog) */
export function isLinkedContentPath(path) {
  return path && (isPdf(path) || isSvg(path) || isFragment(path));
}

/** Normalize file path for matching (ensure leading slash) */
export function normalizeFilePath(path) {
  if (!path) return '';
  const p = path.split('?')[0].split('#')[0].trim();
  return p.startsWith('/') ? p : `/${p}`;
}

export function isPdfOrSvg(path) {
  return isPdf(path) || isSvg(path);
}

/**
 * Get file type in same format as media: "category > extension"
 * @param {string} path - File path
 * @returns {string} e.g. "document > pdf", "image > svg", "content > fragment"
 */
export function getFileType(path) {
  if (isPdf(path)) return 'document > pdf';
  if (isSvg(path)) return 'image > svg';
  if (isFragment(path)) return 'content > fragment';
  return 'unknown';
}

function toPath(href) {
  if (!href) return '';
  try {
    if (href.startsWith('http')) {
      return new URL(href).pathname;
    }
    return href.startsWith('/') ? href : `/${href}`;
  } catch (error) {
    logger.error(`Failed to parse URL ${href}:`, error.message);
    return href;
  }
}

/** Markdown link regex: [text](url) or ![alt](url) - captures URL in group 1 */
const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/gi;

/** Markdown autolink: <url> - captures URL in group 1 */
const MD_AUTOLINK_RE = /<(https?:\/\/[^>]+|\/[^>\s]*)>/g;

/** Icon shorthand: :iconname: → /icons/iconname.svg */
const ICON_RE = /:([a-zA-Z0-9-]+):/g;
/** Exclude doc terms like "with :svg: syntax" to avoid false positives */
const ICON_DOC_EXCLUDE = new Set(['svg', 'pdf', 'image', 'link', 'syntax']);

/**
 * Extract all URLs from markdown: [text](url), ![alt](url), and <url> autolinks
 * @param {string} md - Raw markdown
 * @returns {string[]} - URLs from link syntax
 */
function extractUrlsFromMarkdown(md) {
  if (!md || typeof md !== 'string') return [];
  const fromLinks = [...md.matchAll(MD_LINK_RE)].map((m) => m[1].trim());
  const fromAutolinks = [...md.matchAll(MD_AUTOLINK_RE)].map((m) => m[1].trim());
  return [...fromLinks, ...fromAutolinks];
}

/**
 * Extract icon references from :iconname: shorthand (resolves to /icons/iconname.svg)
 * @param {string} md - Raw markdown
 * @returns {string[]} - Normalized paths like /icons/headset.svg
 */
export function extractIconReferences(md) {
  if (!md || typeof md !== 'string') return [];
  const matches = [...md.matchAll(ICON_RE)];
  return [...new Set(
    matches
      .filter((m) => !ICON_DOC_EXCLUDE.has(m[1].toLowerCase()))
      .map((m) => `/icons/${m[1]}.svg`),
  )];
}

/**
 * Extract fragment references from markdown (links to /fragments/...)
 * @param {string} md - Raw markdown
 * @returns {string[]} - Normalized paths
 */
export function extractFragmentReferences(md) {
  const urls = extractUrlsFromMarkdown(md);
  return [...new Set(urls.filter((u) => u.includes('/fragments/')).map((u) => toPath(u)))];
}

/**
 * Extract links matching pattern (e.g. .pdf, .svg) from markdown
 * @param {string} md - Raw markdown
 * @param {RegExp} pattern - Pattern to match (e.g. /\.pdf$/)
 * @returns {string[]} - Normalized paths
 */
export function extractLinks(md, pattern) {
  const urls = extractUrlsFromMarkdown(md);
  const pathPart = (u) => u.split('?')[0].split('#')[0];
  return [...new Set(urls.filter((u) => pattern.test(pathPart(u))).map((u) => toPath(u)))];
}

/**
 * Detect media type from contentType in structured format
 * @param {object} mediaEntry - The medialog entry
 * @returns {string} Type in format "category > extension"
 */
export function detectMediaType(mediaEntry) {
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
