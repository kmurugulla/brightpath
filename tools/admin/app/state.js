const state = {
  mode: 'setup',
  daToken: null,
  githubUrl: '',
  githubToken: null,
  needsToken: false,
  org: '',
  repo: '',
  site: '',
  validating: false,
  repositoryValidated: false,
  selectedContentTypes: new Set(['blocks']),
  blocks: [],
  selectedBlocks: new Set(),
  discovering: false,
  blocksDiscovered: false,
  libraryExists: false,
  blocksDefaultModeSet: false,
  existingTemplates: [],
  selectedTemplates: [],
  templateForm: { name: '', path: '' },
  editingTemplateIndex: -1,
  loadingTemplates: false,
  templateSearchQuery: '',
  existingIcons: [],
  selectedIcons: [],
  iconForm: { name: '', path: '' },
  editingIconIndex: -1,
  loadingIcons: false,
  iconSearchQuery: '',
  existingPlaceholders: [],
  selectedPlaceholders: [],
  placeholderForm: { key: '', value: '' },
  editingPlaceholderIndex: -1,
  loadingPlaceholders: false,
  placeholderSearchQuery: '',
  aemAssetsConfig: {
    repositoryId: '',
    prodOrigin: '',
    imageType: false,
    renditionsSelect: false,
    dmDelivery: false,
    smartCropSelect: false,
    repositoryIdValidation: null,
    prodOriginValidation: null,
    exists: false,
  },
  loadingAemConfig: false,
  translationConfig: {
    translateBehavior: 'overwrite',
    translateStaging: 'off',
    rolloutBehavior: 'overwrite',
  },
  loadingTranslationConfig: false,
  universalEditorConfig: {
    editorPath: '',
  },
  loadingUeConfig: false,
  showPagePicker: false,
  pagePickerMode: '',
  currentSite: '',
  pageSearchQuery: '',
  allPages: [],
  loadingPages: false,
  loadedFolders: {},
  pageSelections: {},
  processing: false,
  processStatus: {
    github: { org: '', repo: '', status: 'pending' },
    blocks: {
      processed: 0, total: 0, status: 'idle', errors: [],
    },
    templates: {
      processed: 0, total: 0, status: 'idle', errors: [],
    },
    icons: {
      processed: 0, total: 0, status: 'idle', errors: [],
    },
    placeholders: {
      processed: 0, total: 0, status: 'idle', errors: [],
    },
    siteConfig: { status: 'pending', message: '' },
    blocksJson: { status: 'pending', message: '' },
    templatesJson: { status: 'pending', message: '' },
    iconsJson: { status: 'pending', message: '' },
    placeholdersJson: { status: 'pending', message: '' },
    errors: { count: 0, messages: [] },
  },
  message: '',
  messageType: 'info',
  errors: {
    github: '',
    site: '',
    blocks: '',
    templates: '',
    icons: '',
    placeholders: '',
    pages: '',
    aemAssets: '',
  },
};

export function resetModeState(includeLibraryExists = false) {
  Object.assign(state, {
    repositoryValidated: false,
    blocksDiscovered: false,
    blocksDefaultModeSet: false,
    needsToken: false,
    githubUrl: '',
    blocks: [],
    processing: false,
    validating: false,
    discovering: false,
    pageSelections: {},
  });
  state.selectedBlocks.clear();

  if (includeLibraryExists) {
    state.libraryExists = false;
  }
}

export function clearErrors() {
  state.errors = {
    github: '',
    site: '',
    blocks: '',
    templates: '',
    icons: '',
    placeholders: '',
    pages: '',
    aemAssets: '',
    translation: '',
    universalEditor: '',
  };
}

export default state;
