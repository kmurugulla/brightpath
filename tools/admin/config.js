export const LIBRARY_BASE_PATH = 'library';
export const BLOCKS_PATH = 'blocks';
export const TEMPLATES_PATH = 'templates';
export const ICONS_PATH = 'icons';
export const LIBRARY_BLOCKS_PATH = `${LIBRARY_BASE_PATH}/${BLOCKS_PATH}`;
export const LIBRARY_TEMPLATES_PATH = `${LIBRARY_BASE_PATH}/${TEMPLATES_PATH}`;
export const LIBRARY_ICONS_PATH = `${LIBRARY_BASE_PATH}/${ICONS_PATH}`;

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

export function getTemplatesJSONPath(org, site) {
  return `${org}/${site}/${LIBRARY_BASE_PATH}/templates.json`;
}

export function getIconsJSONPath(org, site) {
  return `${org}/${site}/${LIBRARY_BASE_PATH}/icons.json`;
}

export function getPlaceholdersJSONPath(org, site) {
  return `${org}/${site}/placeholders.json`;
}

export function getContentTemplatePath(org, site, templateName) {
  return `${CONTENT_DA_LIVE_BASE}/${org}/${site}/${LIBRARY_TEMPLATES_PATH}/${templateName}`;
}

export function getContentIconPath(org, site, iconName) {
  return `${CONTENT_DA_LIVE_BASE}/${org}/${site}/${LIBRARY_ICONS_PATH}/${iconName}.svg`;
}
