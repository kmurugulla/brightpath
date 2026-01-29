export const LIBRARY_BASE_PATH = 'library';
export const BLOCKS_PATH = 'blocks';
export const LIBRARY_BLOCKS_PATH = `${LIBRARY_BASE_PATH}/${BLOCKS_PATH}`;

export const DA_LIVE_BASE = 'https://da.live';
export const DA_LIVE_EDIT_BASE = `${DA_LIVE_BASE}/edit`;
export const CONTENT_DA_LIVE_BASE = 'https://content.da.live';
export const ADMIN_HLX_PAGE = 'https://admin.hlx.page';

export function getLibraryBlocksURL(org, repo) {
  return `${DA_LIVE_BASE}/#/${org}/${repo}/${LIBRARY_BLOCKS_PATH}`;
}

export function getBlockEditURL(org, repo, blockName) {
  return `${DA_LIVE_EDIT_BASE}#/${org}/${repo}/${LIBRARY_BLOCKS_PATH}/${blockName}`;
}

export function getBlockPreviewURL(org, repo, blockName) {
  return `https://main--${repo}--${org}.aem.page/${LIBRARY_BLOCKS_PATH}/${blockName}`;
}

export function getContentBlockPath(org, site, blockName) {
  return `${CONTENT_DA_LIVE_BASE}/${org}/${site}/${LIBRARY_BLOCKS_PATH}/${blockName}`;
}

export function getBlocksJSONPath(org, site) {
  return `${org}/${site}/${LIBRARY_BASE_PATH}/blocks.json`;
}
