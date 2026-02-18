/* eslint-disable import/no-absolute-path */

/* eslint-disable import/no-unresolved */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

import state, { resetModeState, clearErrors } from './state.js';
import * as templates from './templates.js';
import * as daApi from '../utils/da-api.js';
import TokenStorage from '../utils/token-storage.js';
import loadCSS from '../utils/css-loader.js';
import { templatesHandler, iconsHandler, placeholdersHandler } from './handlers/lib-item-factory.js';
import * as pagePickerHandlers from './handlers/page-picker-handler.js';
import * as blocksHandlers from './handlers/blocks-handler.js';
import * as aemAssetsHandlers from './handlers/assets-cfg-handler.js';
import * as translationHandlers from './handlers/xlat-cfg-handler.js';
import * as universalEditorHandlers from './handlers/ue-cfg-handler.js';
import * as processingHandler from './handlers/processing-handler.js';
import {
  MODES, ROUTES, DOM_IDS, ERROR_KEYS,
} from './constants.js';
import { initRouter, getCurrentRoute } from './router.js';
import * as libraryItemsManager from '../operations/library-items-manager.js';
import * as libraryOps from '../operations/library.js';
import { removeLibraryTemplate } from '../operations/templates.js';
import { removeLibraryIcon } from '../operations/icons.js';
import { removeLibraryPlaceholder } from '../operations/placeholders.js';
import sampleRUM from '../measure.js';

let lastReportedView = null;

const app = {
  async init() {
    const container = document.getElementById('app-container');
    if (!container) {
      throw new Error('App container not found');
    }

    // Prefer org/site from query; host (e.g. Nx Shell) may strip search so also check hash
    const hashQuery = window.location.hash && window.location.hash.includes('?')
      ? window.location.hash.split('?')[1] || ''
      : '';
    const searchString = window.location.search || hashQuery;
    const params = new URLSearchParams(searchString);
    const queryOrg = params.get('org');
    const querySite = params.get('site');

    // eslint-disable-next-line no-console
    console.log('[Site Admin] URL', {
      search: window.location.search || '(empty)',
      hash: window.location.hash || '(empty)',
      searchString: searchString || '(empty)',
      queryOrg: queryOrg || '(missing)',
      querySite: querySite || '(missing)',
    });

    let source = '';
    if (queryOrg && querySite) {
      source = 'query';
      state.org = queryOrg;
      state.site = querySite;
      state.repo = querySite;
    } else {
      try {
        const { context, token } = await DA_SDK;
        state.daToken = token;

        if (context?.org) {
          state.org = context.org;
        }

        if (context?.repo) {
          state.site = context.repo;
        }
        if (state.org || state.site) {
          source = 'da_sdk';
        }
      } catch (error) {
        const urlMatch = window.location.pathname.match(/^\/app\/([^/]+)\/([^/]+)/);
        if (urlMatch) {
          source = 'path';
          const [, org, site] = urlMatch;
          state.org = org;
          state.site = site;
          state.repo = site;
        }
      }
    }

    // eslint-disable-next-line no-console
    console.log('[Site Admin] org/site source:', source || '(none)', {
      org: state.org,
      site: state.site,
      repo: state.repo,
    });

    if (TokenStorage.exists()) {
      state.githubToken = TokenStorage.get();
    }

    if (state.org && state.site) {
      sampleRUM('admin-load', { org: state.org, site: state.site });
    }

    this.container = container;
    await this.loadInitialCSS();
    this.ensureConfirmModalContainer();

    initRouter({
      [ROUTES.BLOCKS]: () => this.renderBlocksView(),
      [ROUTES.TEMPLATES]: () => this.renderTemplatesView(),
      [ROUTES.ICONS]: () => this.renderIconsView(),
      [ROUTES.PLACEHOLDERS]: () => this.renderPlaceholdersView(),
      [ROUTES.AEM_ASSETS]: () => this.renderAemAssetsView(),
      [ROUTES.TRANSLATION]: () => this.renderTranslationView(),
      [ROUTES.UNIVERSAL_EDITOR]: () => this.renderUniversalEditorView(),
    });

    this.attachEventListeners();

    if (state.mode === MODES.REFRESH && state.org && state.site) {
      await this.handleLoadExistingBlocks();
    }
  },

  async loadInitialCSS() {
    await Promise.all([
      loadCSS('admin.css'),
      loadCSS('progress.css'),
      loadCSS('error-modal.css'),
    ]);
  },

  async renderBlocksView() {
    if (state.org && state.site && !state.blocksDefaultModeSet) {
      state.blocksDefaultModeSet = true;
      const check = await libraryOps.checkLibraryExists(state.org, state.site);
      state.libraryExists = check.exists;
      state.mode = state.libraryExists ? MODES.REFRESH : MODES.SETUP;
      if (state.mode === MODES.REFRESH) {
        // handleLoadExistingBlocks calls render() internally — let it own the render
        await blocksHandlers.handleLoadExistingBlocks(state, () => this.render());
        return;
      }
    }

    const cssToLoad = [];

    if (state.mode === MODES.SETUP && !state.repositoryValidated) {
      cssToLoad.push(loadCSS('github-section.css'));
    }

    if (state.blocksDiscovered || state.mode === MODES.REFRESH) {
      cssToLoad.push(loadCSS('blocks-section.css'));
    }

    if (state.selectedBlocks.size > 0) {
      cssToLoad.push(loadCSS('page-picker.css'));
    }

    if (cssToLoad.length > 0) {
      await Promise.all(cssToLoad);
    }

    const sections = [];

    sections.push(templates.sectionHeaderTemplate({
      title: 'Blocks',
      description: 'Generate block documentation for your DA.live library from GitHub repositories. Choose between initial setup mode or update existing blocks with new content examples.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-library',
    }));

    sections.push(templates.modeToggleTemplate({
      currentMode: state.mode,
    }));

    if (state.mode === MODES.SETUP) {
      sections.push(templates.githubSectionTemplate({
        isValidated: state.repositoryValidated,
        validating: state.validating,
        githubUrl: state.githubUrl,
        message: state.errors[ERROR_KEYS.GITHUB] ? templates.messageTemplate(state.errors[ERROR_KEYS.GITHUB], 'error') : '',
      }));

      if (state.needsToken && !state.repositoryValidated) {
        sections.push(templates.tokenInputTemplate({
          hasSavedToken: TokenStorage.exists(),
        }));
      }
    }

    if ((state.mode === MODES.SETUP && state.repositoryValidated) || state.mode === MODES.REFRESH) {
      sections.push(templates.siteSectionTemplate({
        org: state.org,
        site: state.site,
        message: state.errors[ERROR_KEYS.SITE] ? templates.messageTemplate(state.errors[ERROR_KEYS.SITE], 'error') : '',
        mode: state.mode,
      }));
    }

    if (state.blocksDiscovered) {
      sections.push(templates.blocksListTemplate({
        blocks: state.blocks,
        selectedBlocks: state.selectedBlocks,
        message: state.errors[ERROR_KEYS.BLOCKS] ? templates.messageTemplate(state.errors[ERROR_KEYS.BLOCKS], 'error') : '',
      }));

      if (state.selectedBlocks.size > 0) {
        sections.push(templates.pagesSelectionTemplate({
          allSites: this.getAllSites(),
          pageSelections: state.pageSelections,
          message: state.errors[ERROR_KEYS.PAGES] ? templates.messageTemplate(state.errors[ERROR_KEYS.PAGES], 'error') : '',
          daToken: state.daToken,
          org: state.org,
          mode: state.mode,
        }));
      }
    }

    const hasContent = state.selectedBlocks.size > 0;

    if (hasContent && !state.processStatus?.completed) {
      sections.push(templates.startButtonTemplate({
        mode: state.mode,
        disabled: state.processing,
        processing: state.processing,
      }));
    }

    if (hasContent && (state.processing || state.processStatus?.completed)) {
      sections.push(state.processing
        ? templates.processingTemplate({ processStatus: state.processStatus })
        : templates.finalStatusTemplate({
          processStatus: state.processStatus,
          org: state.org,
          repo: state.repo || state.site,
        }));
    } else if (state.selectedBlocks.size > 0) {
      sections.push(templates.initialStatusTemplate({
        org: state.org,
        repo: state.repo,
        blocksCount: state.blocks.length,
        mode: state.mode,
        libraryExists: state.libraryExists,
      }));
    }

    const content = sections.join('');
    const errorModal = templates.errorModalTemplate(
      state.processStatus.errors.messages,
    );
    this.container.innerHTML = templates.layoutTemplate(
      getCurrentRoute(),
      content,
    ) + errorModal;
    this.attachEventListeners();
  },

  async renderLibraryItemView(itemType, config) {
    const {
      title,
      description,
      docsUrl,
      templateFunction,
    } = config;

    await loadCSS('library-items-section.css');
    await loadCSS('page-picker.css');

    const capitalizedType = itemType.charAt(0).toUpperCase() + itemType.slice(1);
    const pluralType = `${itemType}s`;
    const capitalizedPlural = `${capitalizedType}s`;

    const existingKey = `existing${capitalizedPlural}`;
    const loadingKey = `loading${capitalizedPlural}`;
    const searchKey = `${itemType}SearchQuery`;
    const selectedKey = `selected${capitalizedPlural}`;
    const formKey = `${itemType}Form`;
    const editingKey = `editing${capitalizedType}Index`;

    const shouldLoad = state[existingKey].length === 0
      && !state[loadingKey]
      && state.org
      && state.site;

    if (shouldLoad) {
      state[loadingKey] = true;
      try {
        state[existingKey] = await libraryItemsManager[`fetchExisting${capitalizedPlural}`](
          state.org,
          state.site,
        );
      } catch (error) {
        state.errors[pluralType] = `Failed to load ${pluralType}: ${error.message}`;
      } finally {
        state[loadingKey] = false;
      }
    }

    const filteredExisting = libraryItemsManager.filterItems(
      state[existingKey],
      state[searchKey],
      pluralType,
    );

    const sections = [];

    sections.push(templates.sectionHeaderTemplate({
      title,
      description,
      docsUrl,
    }));

    sections.push(templateFunction({
      [`existing${capitalizedPlural}`]: filteredExisting,
      [pluralType]: state[selectedKey],
      [`${itemType}Form`]: state[formKey],
      editingIndex: state[editingKey],
      searchQuery: state[searchKey],
      loading: state[loadingKey],
      message: state.errors[pluralType] ? templates.messageTemplate(state.errors[pluralType], 'error') : '',
    }));

    const hasContent = state[selectedKey].length > 0;

    if (hasContent && !state.processStatus?.completed) {
      sections.push(templates.startButtonTemplate({
        mode: 'setup',
        disabled: state.processing,
        processing: state.processing,
      }));
    }

    if (hasContent && (state.processing || state.processStatus?.completed)) {
      sections.push(state.processing
        ? templates.processingTemplate({ processStatus: state.processStatus })
        : templates.finalStatusTemplate({
          processStatus: state.processStatus,
          org: state.org,
          repo: state.repo || state.site,
        }));
    }

    const content = sections.join('');
    const errorModal = templates.errorModalTemplate(
      state.processStatus.errors.messages,
    );
    this.container.innerHTML = templates.layoutTemplate(
      getCurrentRoute(),
      content,
    ) + errorModal;
    this.attachEventListeners();
  },

  async renderTemplatesView() {
    return this.renderLibraryItemView('template', {
      title: 'Templates',
      description: 'Create and manage page templates that authors can use to quickly build new pages with pre-configured layouts and content blocks.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-library',
      templateFunction: templates.templatesSectionTemplate,
    });
  },

  async renderIconsView() {
    return this.renderLibraryItemView('icon', {
      title: 'Icons',
      description: 'Manage SVG icons that authors can insert into documents. Icons are referenced by name and can be used throughout your site for consistent visual elements.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-library',
      templateFunction: templates.iconsSectionTemplate,
    });
  },

  async renderPlaceholdersView() {
    return this.renderLibraryItemView('placeholder', {
      title: 'Placeholders',
      description: 'Define reusable text placeholders (tokens) that authors can insert into documents. Perfect for commonly used text snippets, legal disclaimers, or dynamic content.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-library',
      templateFunction: templates.placeholdersSectionTemplate,
    });
  },

  async renderIntegrationView(integrationType, config) {
    const {
      title,
      description,
      docsUrl,
      templateFunction,
      configKey,
      loadingKey,
      errorKey,
      fetchFunction,
      shouldLoadCheck,
      additionalProps = {},
    } = config;

    await loadCSS('integrations.css');

    if (!state[loadingKey] && shouldLoadCheck()) {
      state[loadingKey] = true;
      state[configKey] = await fetchFunction(state.org, state.site);
      state[loadingKey] = false;
    }

    const sections = [];

    sections.push(templates.sectionHeaderTemplate({
      title,
      description,
      docsUrl,
    }));

    const messageType = state.errors[errorKey]?.includes('successfully')
      ? 'success'
      : 'error';

    sections.push(templateFunction({
      config: state[configKey],
      loading: state[loadingKey],
      message: state.errors[errorKey]
        ? templates.messageTemplate(state.errors[errorKey], messageType)
        : '',
      ...additionalProps,
    }));

    const content = sections.join('');
    const errorModal = templates.errorModalTemplate(
      state.processStatus.errors.messages,
    );
    this.container.innerHTML = templates.layoutTemplate(
      getCurrentRoute(),
      content,
    ) + errorModal;
    this.attachEventListeners();
  },

  async renderAemAssetsView() {
    return this.renderIntegrationView('aemAssets', {
      title: 'AEM Assets Integration',
      description: 'Connect your AEM as a Cloud Service assets repository to enable authors to browse and insert assets directly from AEM into their documents.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-aem-assets',
      templateFunction: templates.aemAssetsSectionTemplate,
      configKey: 'aemAssetsConfig',
      loadingKey: 'loadingAemConfig',
      errorKey: 'aemAssets',
      fetchFunction: daApi.fetchAemAssetsConfig,
      shouldLoadCheck: () => state.org && state.site && state.aemAssetsConfig.repositoryId === '',
    });
  },

  async renderTranslationView() {
    return this.renderIntegrationView('translation', {
      title: 'Translation Configuration',
      description: 'Configure how translation services handle your content. Set up staging, behavior for handling existing content, and rollout strategies for localized sites.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-translation',
      templateFunction: templates.translationSectionTemplate,
      configKey: 'translationConfig',
      loadingKey: 'loadingTranslationConfig',
      errorKey: 'translation',
      fetchFunction: daApi.fetchTranslationConfig,
      shouldLoadCheck: () => state.org && state.site && state.translationConfig.translateBehavior === 'overwrite',
    });
  },

  async renderUniversalEditorView() {
    return this.renderIntegrationView('universalEditor', {
      title: 'Universal Editor Setup',
      description: 'Enable Universal Editor for WYSIWYG content authoring. Configure the editor path to allow authors to edit content directly in a visual interface with real-time preview.',
      docsUrl: 'https://docs.da.live/administrators/guides/setup-universal-editor',
      templateFunction: templates.universalEditorSectionTemplate,
      configKey: 'universalEditorConfig',
      loadingKey: 'loadingUeConfig',
      errorKey: 'universalEditor',
      fetchFunction: daApi.fetchUniversalEditorConfig,
      shouldLoadCheck: () => state.org && state.site && state.universalEditorConfig.editorPath === '',
    });
  },

  async render() {
    const route = getCurrentRoute();
    if (state.org && state.site && route && route !== lastReportedView) {
      lastReportedView = route;
      sampleRUM('admin-view', { org: state.org, site: state.site, view: route });
    }
    const viewMap = {
      [ROUTES.BLOCKS]: () => this.renderBlocksView(),
      [ROUTES.TEMPLATES]: () => this.renderTemplatesView(),
      [ROUTES.ICONS]: () => this.renderIconsView(),
      [ROUTES.PLACEHOLDERS]: () => this.renderPlaceholdersView(),
      [ROUTES.AEM_ASSETS]: () => this.renderAemAssetsView(),
      [ROUTES.TRANSLATION]: () => this.renderTranslationView(),
      [ROUTES.UNIVERSAL_EDITOR]: () => this.renderUniversalEditorView(),
    };

    if (viewMap[route]) {
      await viewMap[route]();
    }
  },

  attachEventListeners() {
    document.querySelectorAll('.mode-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const newMode = e.target.dataset.mode;
        if (newMode !== state.mode) {
          this.handleModeChange(newMode);
        }
      });
    });

    const githubUrlInput = document.getElementById(DOM_IDS.GITHUB_URL);
    if (githubUrlInput && !state.repositoryValidated) {
      githubUrlInput.addEventListener('input', (e) => {
        state.githubUrl = e.target.value;
        state.errors.github = '';
      });

      githubUrlInput.addEventListener('blur', (e) => this.handleGitHubUrlChange(e.target.value));

      githubUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.handleGitHubUrlChange(e.target.value);
        }
      });
    }

    const orgInput = document.getElementById(DOM_IDS.ORG_NAME);
    if (orgInput) {
      orgInput.addEventListener('input', (e) => {
        state.org = e.target.value.trim();
        state.errors[ERROR_KEYS.SITE] = '';
        state.blocksDefaultModeSet = false;
      });
    }

    const siteInput = document.getElementById(DOM_IDS.SITE_NAME);
    if (siteInput) {
      siteInput.addEventListener('input', (e) => {
        state.site = e.target.value.trim();
        state.errors[ERROR_KEYS.SITE] = '';
        state.blocksDefaultModeSet = false;
      });
    }

    const startBtn = document.getElementById(DOM_IDS.START_PROCESSING);
    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleStartProcessing());
    }

    blocksHandlers.attachBlocksListeners(this, state);
    templatesHandler.attachListeners(this, state);
    iconsHandler.attachListeners(this, state);
    placeholdersHandler.attachListeners(this, state);
    aemAssetsHandlers.attachAemAssetsListeners(this, state);
    translationHandlers.attachTranslationListeners(this, state);
    universalEditorHandlers.attachUniversalEditorListeners(this, state);

    document.querySelectorAll('.select-pages-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const { site } = e.target.dataset;
        this.openPagePicker(site);
      });
    });

    document.querySelectorAll('.remove-page-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const { site, path } = e.target.dataset;
        this.removePage(site, path);
      });
    });

    document.querySelectorAll('.error-modal-close').forEach((btn) => {
      btn.addEventListener('click', () => this.hideErrorModal());
    });

    const errorModalOverlay = document.getElementById(DOM_IDS.ERROR_MODAL);
    if (errorModalOverlay) {
      errorModalOverlay.addEventListener('click', (e) => {
        if (e.target === errorModalOverlay) {
          this.hideErrorModal();
        }
      });
    }

    const errorsCard = document.querySelector('.import-card.errors');
    if (errorsCard && state.processStatus.errors.count > 0) {
      errorsCard.style.cursor = 'pointer';
      errorsCard.addEventListener('click', () => this.showErrorModal());
    }
  },

  async handleModeChange(newMode) {
    state.mode = newMode;
    state.message = '';
    state.messageType = 'info';
    clearErrors();

    if (newMode === MODES.REFRESH) {
      resetModeState();
      this.render();
      if (state.org && state.site) {
        await this.handleLoadExistingBlocks();
      }
      return;
    }

    if (newMode === MODES.SETUP) {
      resetModeState(true);
    }

    this.render();
  },

  async handleGitHubUrlChange(url) {
    await blocksHandlers.handleGitHubUrlChange(state, () => this.render(), url);
    if (state.org && state.repo) {
      await blocksHandlers.validateRepository(this, state);
    }
  },

  async validateRepository() {
    await blocksHandlers.validateRepository(this, state);
  },

  async handleValidateWithToken() {
    await blocksHandlers.handleValidateWithToken(this, state);
  },

  handleClearToken() {
    blocksHandlers.handleClearToken(state, () => this.render());
  },

  async handleLoadExistingBlocks() {
    await blocksHandlers.handleLoadExistingBlocks(state, () => this.render());
  },

  async discoverBlocks() {
    await blocksHandlers.discoverBlocks(this, state);
  },

  async handleStartProcessing() {
    await processingHandler.handleStartProcessing(this, state);
  },

  toggleAllBlocks() {
    blocksHandlers.toggleAllBlocks(state, () => this.render());
  },

  selectNewBlocksOnly() {
    blocksHandlers.selectNewBlocksOnly(state, () => this.render());
  },

  getAllSites() {
    return [state.site];
  },

  async validateSite(org, site, token) {
    return pagePickerHandlers.validateSite(org, site, token);
  },

  async openPagePicker(site, mode = 'pages') {
    await pagePickerHandlers.openPagePicker(this, state, site, mode);
  },

  renderPagePickerModal() {
    pagePickerHandlers.renderPagePickerModal(this, state);
  },

  attachPagePickerListeners() {
    pagePickerHandlers.attachPagePickerListeners(this, state);
  },

  closePagePicker() {
    pagePickerHandlers.closePagePicker(state);
  },

  confirmPageSelection() {
    pagePickerHandlers.confirmPageSelection(this, state);
  },

  removePage(site, path) {
    pagePickerHandlers.removePage(state, () => this.render(), site, path);
  },

  handleAddTemplate() {
    templatesHandler.handleAdd(state, () => this.render());
  },

  handleRemoveTemplate(index) {
    templatesHandler.handleRemove(state, () => this.render(), index);
  },

  handleEditExistingTemplate(index) {
    templatesHandler.handleEditExisting(state, () => this.render(), index);
  },

  async handleRemoveExistingTemplate(index) {
    const confirmed = await this.showConfirmModal({
      title: 'Remove template',
      message: 'Remove this template from the library? This cannot be undone.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const item = state.existingTemplates[index];
    state.errors[ERROR_KEYS.TEMPLATES] = '';
    this.render();
    try {
      const result = await removeLibraryTemplate(state.org, state.site, item.name);
      if (result.success) {
        state.existingTemplates.splice(index, 1);
        if (state.editingTemplateIndex === index) {
          state.editingTemplateIndex = -1;
          state.templateForm = { name: '', path: '' };
        } else if (state.editingTemplateIndex > index) {
          state.editingTemplateIndex -= 1;
        }
        state.errors[ERROR_KEYS.TEMPLATES] = 'Template removed.';
      } else {
        state.errors[ERROR_KEYS.TEMPLATES] = result.error || 'Failed to remove template.';
      }
    } catch (error) {
      state.errors[ERROR_KEYS.TEMPLATES] = error.message || 'Failed to remove template.';
    }
    this.render();
  },

  handleCancelEditTemplate() {
    templatesHandler.handleCancelEdit(state, () => this.render());
  },

  handleAddIcon() {
    iconsHandler.handleAdd(state, () => this.render());
  },

  handleRemoveIcon(index) {
    iconsHandler.handleRemove(state, () => this.render(), index);
  },

  handleEditExistingIcon(index) {
    iconsHandler.handleEditExisting(state, () => this.render(), index);
  },

  async handleRemoveExistingIcon(index) {
    const confirmed = await this.showConfirmModal({
      title: 'Remove icon',
      message: 'Remove this icon from the library? This cannot be undone.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const item = state.existingIcons[index];
    state.errors[ERROR_KEYS.ICONS] = '';
    this.render();
    try {
      const result = await removeLibraryIcon(state.org, state.site, item.name);
      if (result.success) {
        state.existingIcons.splice(index, 1);
        if (state.editingIconIndex === index) {
          state.editingIconIndex = -1;
          state.iconForm = { name: '', path: '' };
        } else if (state.editingIconIndex > index) {
          state.editingIconIndex -= 1;
        }
        state.errors[ERROR_KEYS.ICONS] = 'Icon removed.';
      } else {
        state.errors[ERROR_KEYS.ICONS] = result.error || 'Failed to remove icon.';
      }
    } catch (error) {
      state.errors[ERROR_KEYS.ICONS] = error.message || 'Failed to remove icon.';
    }
    this.render();
  },

  handleCancelEditIcon() {
    iconsHandler.handleCancelEdit(state, () => this.render());
  },

  handleAddPlaceholder() {
    placeholdersHandler.handleAdd(state, () => this.render());
  },

  handleRemovePlaceholder(index) {
    placeholdersHandler.handleRemove(state, () => this.render(), index);
  },

  handleEditExistingPlaceholder(index) {
    placeholdersHandler.handleEditExisting(state, () => this.render(), index);
  },

  async handleRemoveExistingPlaceholder(index) {
    const confirmed = await this.showConfirmModal({
      title: 'Remove placeholder',
      message: 'Remove this placeholder from the library? This cannot be undone.',
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
    const item = state.existingPlaceholders[index];
    state.errors[ERROR_KEYS.PLACEHOLDERS] = '';
    this.render();
    try {
      const result = await removeLibraryPlaceholder(state.org, state.site, item.key);
      if (result.success) {
        state.existingPlaceholders.splice(index, 1);
        if (state.editingPlaceholderIndex === index) {
          state.editingPlaceholderIndex = -1;
          state.placeholderForm = { key: '', value: '' };
        } else if (state.editingPlaceholderIndex > index) {
          state.editingPlaceholderIndex -= 1;
        }
        state.errors[ERROR_KEYS.PLACEHOLDERS] = `Placeholder "${item.key}" removed.`;
      } else {
        state.errors[ERROR_KEYS.PLACEHOLDERS] = result.error || 'Failed to remove placeholder.';
      }
    } catch (error) {
      state.errors[ERROR_KEYS.PLACEHOLDERS] = error.message || 'Failed to remove placeholder.';
    }
    this.render();
  },

  handleCancelEditPlaceholder() {
    placeholdersHandler.handleCancelEdit(state, () => this.render());
  },

  handleValidateRepositoryId() {
    aemAssetsHandlers.handleValidateRepositoryId(state, () => this.render(), daApi);
  },

  handleValidateProdOrigin() {
    aemAssetsHandlers.handleValidateProdOrigin(state, () => this.render(), daApi);
  },

  handleSaveAemConfig() {
    aemAssetsHandlers.handleSaveAemConfig(state, () => this.render(), daApi);
  },

  handleSaveTranslationConfig() {
    translationHandlers.handleSaveTranslationConfig(state, () => this.render(), daApi);
  },

  handleSaveUeConfig() {
    universalEditorHandlers.handleSaveUeConfig(state, () => this.render(), daApi);
  },

  showErrorModal() {
    const modal = document.getElementById(DOM_IDS.ERROR_MODAL);
    if (modal) {
      modal.style.display = 'flex';
    }
  },

  hideErrorModal() {
    const modal = document.getElementById(DOM_IDS.ERROR_MODAL);
    if (modal) {
      modal.style.display = 'none';
    }
  },

  ensureConfirmModalContainer() {
    let wrap = document.getElementById(DOM_IDS.CONFIRM_MODAL);
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = DOM_IDS.CONFIRM_MODAL;
      wrap.style.display = 'none';
      document.body.appendChild(wrap);
    }
    this.confirmModalContainer = wrap;
  },

  showConfirmModal({
    title, message, confirmLabel = 'Remove', cancelLabel = 'Cancel',
  }) {
    const wrap = this.confirmModalContainer || document.getElementById(DOM_IDS.CONFIRM_MODAL);
    if (!wrap) return Promise.resolve(false);

    wrap.innerHTML = templates.confirmModalTemplate({
      title,
      message,
      confirmLabel,
      cancelLabel,
    });
    wrap.style.display = 'block';

    return new Promise((resolve) => {
      const overlay = wrap.querySelector('[data-confirm-overlay]');
      const cancelBtn = wrap.querySelector('.modal-cancel');
      const confirmBtn = wrap.querySelector('.modal-confirm');
      let settled = false;

      // Declare onKeydown before settle so settle can reference it in removeEventListener
      let onKeydown;

      const settle = (value) => {
        if (settled) return;
        settled = true;
        wrap.style.display = 'none';
        wrap.innerHTML = '';
        document.removeEventListener('keydown', onKeydown);
        resolve(value);
      };

      onKeydown = (e) => {
        if (e.key === 'Escape') settle(false);
      };

      document.addEventListener('keydown', onKeydown);

      if (confirmBtn) confirmBtn.addEventListener('click', () => settle(true));
      if (cancelBtn) cancelBtn.addEventListener('click', () => settle(false));
      if (overlay) {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) settle(false);
        });
      }
    });
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;
