/**
 * Configuration and state management for media indexer
 */

/**
 * Validate GitHub org/repo name to prevent injection attacks
 * Allows: alphanumeric, hyphens, underscores, dots (standard GitHub naming)
 * @param {string} name - Org or repo name
 * @returns {string|null} Validated name or null if invalid
 */
function validateGitHubName(name) {
  if (!name || typeof name !== 'string') return null;
  // GitHub allows alphanumeric, hyphens, underscores, dots
  // Must not start/end with special chars, max 100 chars
  const validPattern = /^[a-zA-Z0-9]([a-zA-Z0-9._-]{0,98}[a-zA-Z0-9])?$/;
  return validPattern.test(name) ? name : null;
}

// Parse URL parameters
const params = new URLSearchParams(window.location.search);
const rawOrg = params.get('org');
const rawRepo = params.get('repo') || params.get('site');

export const org = validateGitHubName(rawOrg);
export const repo = validateGitHubName(rawRepo);
export const ref = 'main';
export const sitePath = org && repo ? `/${org}/${repo}` : null;

export const DA_ADMIN = 'https://admin.da.live';

export const state = {
  building: false,
  progress: { stage: 'idle', message: '', percent: 0 },
  buildStartTime: null,
  errors: [],
  logs: [],
  status: null,
  daToken: null,
};
