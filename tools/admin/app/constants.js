/**
 * Application-wide constants — use these instead of inline magic strings.
 */

export const MODES = {
  SETUP: 'setup',
  REFRESH: 'refresh',
};

export const ROUTES = {
  BLOCKS: 'blocks',
  TEMPLATES: 'templates',
  ICONS: 'icons',
  PLACEHOLDERS: 'placeholders',
  AEM_ASSETS: 'aem-assets',
  TRANSLATION: 'translation',
  UNIVERSAL_EDITOR: 'universal-editor',
};

export const PROGRESS_STEPS = {
  REGISTER: 'register',
  GENERATE: 'generate',
  UPLOAD: 'upload',
  BLOCKS_JSON: 'blocks-json',
  TEMPLATES_JSON: 'templates-json',
  ICONS_JSON: 'icons-json',
  PLACEHOLDERS_JSON: 'placeholders-json',
};

// Keys used in state.errors
export const ERROR_KEYS = {
  GITHUB: 'github',
  SITE: 'site',
  BLOCKS: 'blocks',
  TEMPLATES: 'templates',
  ICONS: 'icons',
  PLACEHOLDERS: 'placeholders',
  PAGES: 'pages',
  AEM_ASSETS: 'aemAssets',
  TRANSLATION: 'translation',
  UNIVERSAL_EDITOR: 'universalEditor',
};

// DOM element IDs referenced by handler code
export const DOM_IDS = {
  APP_CONTAINER: 'app-container',
  GITHUB_URL: 'github-url',
  GITHUB_TOKEN: 'github-token',
  SAVE_TOKEN: 'save-token',
  CLEAR_TOKEN: 'clear-token',
  VALIDATE_REPOSITORY: 'validate-repository',
  VALIDATE_WITH_TOKEN: 'validate-with-token',
  LOAD_EXISTING_BLOCKS: 'load-existing-blocks',
  TOGGLE_ALL_BLOCKS: 'toggle-all-blocks',
  SELECT_NEW_ONLY: 'select-new-only',
  START_PROCESSING: 'start-processing',
  ORG_NAME: 'org-name',
  SITE_NAME: 'site-name',
  AEM_REPOSITORY_ID: 'aem-repository-id',
  AEM_PROD_ORIGIN: 'aem-prod-origin',
  SAVE_AEM_CONFIG: 'save-aem-config',
  TRANSLATE_BEHAVIOR: 'translate-behavior',
  TRANSLATE_STAGING: 'translate-staging',
  ROLLOUT_BEHAVIOR: 'rollout-behavior',
  SAVE_TRANSLATION_CONFIG: 'save-translation-config',
  UE_EDITOR_PATH: 'ue-editor-path',
  SAVE_UE_CONFIG: 'save-ue-config',
  PAGE_SEARCH: 'page-search',
  PAGE_PICKER_MODAL: 'page-picker-modal',
  ERROR_MODAL: 'error-modal',
  CONFIRM_MODAL: 'confirm-modal',
};

// Default route used when no hash is present
export const DEFAULT_ROUTE = ROUTES.BLOCKS;

// Fetch timeout in milliseconds
export const FETCH_TIMEOUT_MS = 10000;
