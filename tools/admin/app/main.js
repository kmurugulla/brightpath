/* eslint-disable import/no-absolute-path */

/* eslint-disable import/no-unresolved */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

import state, { resetModeState, clearErrors } from './state.js';
import * as templates from './templates.js';
import * as githubOps from '../operations/github.js';
import * as libraryOps from '../operations/library.js';
import * as daApi from '../utils/da-api.js';
import TokenStorage from '../utils/token-storage.js';
import GitHubAPI from '../utils/github-api.js';
import loadCSS from '../utils/css-loader.js';
import { templatesHandler, iconsHandler, placeholdersHandler } from './handlers/library-item-handler-factory.js';
import * as pagePickerHandlers from './handlers/page-picker-handlers.js';
import * as blocksHandlers from './handlers/blocks-handlers.js';
import * as aemAssetsHandlers from './handlers/aem-assets-handlers.js';
import * as translationHandlers from './handlers/translation-handlers.js';
import * as universalEditorHandlers from './handlers/universal-editor-handlers.js';
import { initRouter, getCurrentRoute } from './router.js';
import * as libraryItemsManager from '../operations/library-items-manager.js';

const app = {
  async init() {
    const container = document.getElementById('app-container');
    if (!container) {
      throw new Error('App container not found');
    }

    try {
      const { context, token } = await DA_SDK;
      state.daToken = token;

      if (context?.org) {
        state.org = context.org;
      }

      if (context?.repo) {
        state.site = context.repo;
      }
    } catch (error) {
      const urlMatch = window.location.pathname.match(/^\/app\/([^/]+)\/([^/]+)/);
      if (urlMatch) {
        const [, org, site] = urlMatch;
        state.org = org;
        state.site = site;
      }
    }

    if (TokenStorage.exists()) {
      state.githubToken = TokenStorage.get();
    }

    this.container = container;
    await this.loadInitialCSS();

    initRouter({
      blocks: () => this.renderBlocksView(),
      templates: () => this.renderTemplatesView(),
      icons: () => this.renderIconsView(),
      placeholders: () => this.renderPlaceholdersView(),
      'aem-assets': () => this.renderAemAssetsView(),
      translation: () => this.renderTranslationView(),
      'universal-editor': () => this.renderUniversalEditorView(),
    });

    this.attachEventListeners();

    if (state.mode === 'refresh' && state.org && state.site) {
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
    const cssToLoad = [];

    if (state.mode === 'setup' && !state.repositoryValidated) {
      cssToLoad.push(loadCSS('github-section.css'));
    }

    if (state.blocksDiscovered || state.mode === 'refresh') {
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

    if (state.mode === 'setup') {
      sections.push(templates.githubSectionTemplate({
        isValidated: state.repositoryValidated,
        validating: state.validating,
        githubUrl: state.githubUrl,
        message: state.errors.github ? templates.messageTemplate(state.errors.github, 'error') : '',
      }));

      if (state.needsToken && !state.repositoryValidated) {
        sections.push(templates.tokenInputTemplate({
          hasSavedToken: TokenStorage.exists(),
        }));
      }
    }

    if ((state.mode === 'setup' && state.repositoryValidated) || state.mode === 'refresh') {
      sections.push(templates.siteSectionTemplate({
        org: state.org,
        site: state.site,
        message: state.errors.site ? templates.messageTemplate(state.errors.site, 'error') : '',
        mode: state.mode,
      }));
    }

    if (state.blocksDiscovered) {
      sections.push(templates.blocksListTemplate({
        blocks: state.blocks,
        selectedBlocks: state.selectedBlocks,
        message: state.errors.blocks ? templates.messageTemplate(state.errors.blocks, 'error') : '',
      }));

      if (state.selectedBlocks.size > 0) {
        sections.push(templates.pagesSelectionTemplate({
          allSites: this.getAllSites(),
          pageSelections: state.pageSelections,
          message: state.errors.pages ? templates.messageTemplate(state.errors.pages, 'error') : '',
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
      state[existingKey] = await libraryItemsManager[`fetchExisting${capitalizedPlural}`](
        state.org,
        state.site,
      );
      state[loadingKey] = false;
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
      additionalProps: { validating: state.validatingAemUrl },
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
    const viewMap = {
      blocks: () => this.renderBlocksView(),
      templates: () => this.renderTemplatesView(),
      icons: () => this.renderIconsView(),
      placeholders: () => this.renderPlaceholdersView(),
      'aem-assets': () => this.renderAemAssetsView(),
      translation: () => this.renderTranslationView(),
      'universal-editor': () => this.renderUniversalEditorView(),
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

    const githubUrlInput = document.getElementById('github-url');
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

    const orgInput = document.getElementById('org-name');
    if (orgInput) {
      orgInput.addEventListener('input', (e) => {
        state.org = e.target.value.trim();
        state.errors.site = '';
      });
    }

    const siteInput = document.getElementById('site-name');
    if (siteInput) {
      siteInput.addEventListener('input', (e) => {
        state.site = e.target.value.trim();
        state.errors.site = '';
      });
    }

    const startBtn = document.getElementById('start-processing');
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

    const errorModalOverlay = document.getElementById('error-modal');
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

    if (newMode === 'refresh') {
      resetModeState();
      this.render();
      if (state.org && state.site) {
        await this.handleLoadExistingBlocks();
      }
      return;
    }

    if (newMode === 'setup') {
      resetModeState(true);
    }

    this.render();
  },

  async handleGitHubUrlChange(url) {
    state.githubUrl = url.trim();

    const parsed = githubOps.parseGitHubURL(state.githubUrl);
    if (parsed && parsed.org && parsed.repo) {
      state.org = parsed.org;
      state.repo = parsed.repo;
      state.site = parsed.repo;

      await this.validateRepository();
    }
  },

  async validateRepository() {
    state.validating = true;
    this.render();
    try {
      const result = await githubOps.validateRepository(state.org, state.repo, state.githubToken);

      if (!result.valid) {
        if (result.error === 'rate_limit') {
          state.needsToken = true;
          state.errors.github = `GitHub API rate limit exceeded (resets at ${result.resetTime}). Please add a GitHub token to continue, or wait and try again.`;
          state.validating = false;
          this.render();
          return;
        }

        if (result.error === 'not_found') {
          state.errors.github = 'Repository not found. Please check the URL and try again.';
          state.validating = false;
          this.render();
          return;
        }

        if (result.error === 'private' && result.needsToken) {
          state.needsToken = true;
          state.errors.github = 'Unable to access repository. If this is a private repository, please enter a GitHub token below.';
          state.validating = false;
          this.render();
          return;
        }

        state.errors.github = result.error === 'private' ? 'Unable to access repository with provided token.' : result.error;
        state.validating = false;
        this.render();
        return;
      }

      state.repositoryValidated = true;
      state.needsToken = false;

      state.validating = false;
      this.render();
      await this.discoverBlocks();
    } catch (error) {
      let errorMsg = error.message;
      if (errorMsg.includes('404') || errorMsg.includes('Not Found')) {
        errorMsg = 'Please enter a valid GitHub repository URL.';
      } else if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        errorMsg = 'Network error. Please check your connection and try again.';
      }

      state.message = errorMsg;
      state.messageType = 'error';
      state.validating = false;
      this.render();
    }
  },

  async handleValidateWithToken() {
    const tokenInput = document.getElementById('github-token');
    const saveCheckbox = document.getElementById('save-token');
    const token = tokenInput?.value.trim();

    if (!token) {
      state.errors.github = 'Please enter a GitHub token';
      this.render();
      return;
    }

    if (saveCheckbox?.checked) {
      TokenStorage.set(token);
    }

    state.githubToken = token;
    await this.validateRepository();
  },

  handleClearToken() {
    TokenStorage.clear();
    state.githubToken = null;
    state.message = 'Saved token cleared';
    state.messageType = 'success';
    this.render();
  },

  async handleLoadExistingBlocks() {
    if (!state.org || !state.site) {
      state.errors.site = 'Please enter both organization and site name';
      this.render();
      return;
    }

    state.discovering = true;
    this.render();

    try {
      const blocks = await libraryOps.fetchExistingBlocks(state.org, state.site);

      if (blocks.length === 0) {
        state.errors.site = 'No library found at this location. Please run "Library Setup" first to create the library.';
        state.discovering = false;
        this.render();
        return;
      }

      state.blocks = blocks.map((block) => ({
        ...block,
        isNew: false,
      }));
      state.blocksDiscovered = true;
      state.discovering = false;
      state.selectedBlocks = new Set(blocks.map((b) => b.name));
      state.errors = {
        github: '', site: '', blocks: '', pages: '',
      };
      this.render();
    } catch (error) {
      state.errors.site = `Unable to load library: ${error.message}. Please run "Library Setup" first to create the library.`;
      state.discovering = false;
      this.render();
    }
  },

  async discoverBlocks() {
    state.discovering = true;
    this.render();
    try {
      const blocks = await githubOps.discoverBlocks(state.org, state.repo, state.githubToken);

      const existingBlocksJSON = await daApi.fetchBlocksJSON(state.org, state.site);

      const existingBlockNames = new Set(
        existingBlocksJSON?.data?.data?.map((b) => {
          const pathParts = b.path.split('/');
          return pathParts[pathParts.length - 1]; // Get last part of path (kebab-case name)
        }) || [],
      );

      state.blocks = blocks.map((block) => ({
        ...block,
        isNew: !existingBlockNames.has(block.name),
      }));

      state.blocksDiscovered = true;
      state.discovering = false;

      state.selectedBlocks = new Set(blocks.map((b) => b.name));

      const libraryCheck = await libraryOps.checkLibraryExists(state.org, state.site);
      state.libraryExists = libraryCheck.exists;

      this.render();
    } catch (error) {
      state.errors.github = `Block discovery failed: ${error.message}`;
      state.discovering = false;
      this.render();
    }
  },

  async handleStartProcessing() {
    if (!state.daToken) {
      state.errors.pages = 'DA.live authentication required. This tool must be run from within DA.live.';
      this.render();
      return;
    }

    const siteValid = await this.validateSite(state.org, state.site, state.daToken);
    if (!siteValid) {
      state.errors.site = `Site "${state.org}/${state.site}" not found in DA.live. Please verify the site name.`;
      this.render();
      return;
    }

    state.processing = true;
    const baseStatus = {
      errors: { count: 0, messages: [] },
      completed: false,
    };

    if (state.selectedBlocks.size > 0) {
      baseStatus.github = { org: state.org, repo: state.repo, status: 'complete' };
      baseStatus.blocks = { total: state.selectedBlocks.size, status: 'complete' };
      baseStatus.blockDocs = { created: 0, total: state.selectedBlocks.size, status: 'pending' };
    }

    if (state.selectedTemplates.length > 0) {
      baseStatus.templates = { processed: 0, total: state.selectedTemplates.length, status: 'pending' };
    }

    if (state.selectedIcons.length > 0) {
      baseStatus.icons = { processed: 0, total: state.selectedIcons.length, status: 'pending' };
    }

    if (state.selectedPlaceholders.length > 0) {
      baseStatus.placeholders = { processed: 0, total: state.selectedPlaceholders.length, status: 'pending' };
    }

    if (state.mode === 'setup') {
      baseStatus.siteConfig = { status: 'pending', message: '' };

      if (state.selectedBlocks.size > 0) {
        baseStatus.blocksJson = { status: 'pending', message: '' };
      }
      if (state.selectedTemplates.length > 0) {
        baseStatus.templatesJson = { status: 'pending', message: '' };
      }
      if (state.selectedIcons.length > 0) {
        baseStatus.iconsJson = { status: 'pending', message: '' };
      }
      if (state.selectedPlaceholders.length > 0) {
        baseStatus.placeholdersJson = { status: 'pending', message: '' };
      }
    }

    state.processStatus = baseStatus;
    this.render();

    try {
      const selectedBlockNames = Array.from(state.selectedBlocks);
      const sitesWithPages = this.getAllSites().map((site) => ({
        org: state.org,
        site,
        pages: Array.from(state.pageSelections[site] || []),
      }));

      let githubApi = null;
      if (state.mode === 'setup' && state.org && state.repo) {
        githubApi = new GitHubAPI(state.org, state.repo, 'main', state.githubToken);
      }

      const results = await libraryOps.setupLibrary({
        org: state.org,
        site: state.site,
        blockNames: selectedBlockNames,
        templates: state.selectedTemplates,
        icons: state.selectedIcons,
        placeholders: state.selectedPlaceholders,
        sitesWithPages,
        onProgress: (progress) => this.handleProgress(progress),
        skipSiteConfig: state.mode === 'refresh',
        githubApi,
      });

      if (!results.success) {
        throw new Error(results.error || 'Library setup failed');
      }

      state.processStatus.completed = true;
      state.message = '';
      state.messageType = '';
    } catch (error) {
      state.processStatus.errors.count += 1;
      state.processStatus.errors.messages.push({
        type: 'general',
        block: 'N/A',
        message: error.message,
      });
      state.message = `Processing failed: ${error.message}`;
      state.messageType = 'error';
    } finally {
      state.processing = false;
      this.render();
    }
  },

  handleProgress(progress) {
    if (progress.step === 'register') {
      if (state.processStatus.siteConfig) {
        if (progress.status === 'start') {
          state.processStatus.siteConfig.status = 'processing';
          state.processStatus.siteConfig.message = 'Registering library...';
        } else if (progress.status === 'complete') {
          state.processStatus.siteConfig.status = 'complete';
          state.processStatus.siteConfig.message = 'Updated Site Config';
        }
      }
    } else if (progress.step === 'generate' && progress.status === 'start') {
      state.processStatus.blockDocs.status = 'processing';
    } else if (progress.step === 'upload') {
      if (progress.status === 'start') {
        state.processStatus.blockDocs.status = 'processing';
      } else if (progress.current && progress.total) {
        state.processStatus.blockDocs.created = progress.current;
        state.processStatus.blockDocs.status = 'processing';
      } else if (progress.status === 'complete') {
        const uploadSuccessCount = progress.uploadResults.filter((r) => r.success).length;
        const uploadErrorCount = progress.uploadResults.length - uploadSuccessCount;

        state.processStatus.blockDocs.created = uploadSuccessCount;
        state.processStatus.blockDocs.status = uploadErrorCount > 0 ? 'warning' : 'complete';

        if (uploadErrorCount > 0) {
          state.processStatus.errors.count += uploadErrorCount;
          progress.uploadResults
            .filter((r) => !r.success)
            .forEach((r) => state.processStatus.errors.messages.push({
              type: 'upload',
              block: r.name,
              message: r.error,
            }));
        }
      }
    } else if (progress.step === 'blocks-json') {
      if (state.processStatus.blocksJson) {
        if (progress.status === 'start') {
          state.processStatus.blocksJson.status = 'processing';
          state.processStatus.blocksJson.message = state.libraryExists
            ? 'Updating...'
            : 'Creating...';
        } else if (progress.status === 'complete') {
          state.processStatus.blocksJson.status = 'complete';
          state.processStatus.blocksJson.message = state.libraryExists
            ? 'Updated'
            : 'Created';
        }
      }
    } else if (progress.step === 'templates-json') {
      if (state.processStatus.templates) {
        state.processStatus.templates.status = 'processing';
      }
      if (state.processStatus.templatesJson) {
        if (progress.status === 'start') {
          state.processStatus.templatesJson.status = 'processing';
          state.processStatus.templatesJson.message = 'Creating...';
        } else if (progress.status === 'complete') {
          state.processStatus.templatesJson.status = 'complete';
          state.processStatus.templatesJson.message = 'Created';
          if (state.processStatus.templates) {
            state.processStatus.templates.status = 'complete';
            state.processStatus.templates.processed = state.selectedTemplates.length;
          }
        }
      }
    } else if (progress.step === 'icons-json') {
      if (state.processStatus.icons) {
        state.processStatus.icons.status = 'processing';
      }
      if (state.processStatus.iconsJson) {
        if (progress.status === 'start') {
          state.processStatus.iconsJson.status = 'processing';
          state.processStatus.iconsJson.message = 'Creating...';
        } else if (progress.status === 'complete') {
          state.processStatus.iconsJson.status = 'complete';
          state.processStatus.iconsJson.message = 'Created';
          if (state.processStatus.icons) {
            state.processStatus.icons.status = 'complete';
            state.processStatus.icons.processed = state.selectedIcons.length;
          }
        }
      }
    } else if (progress.step === 'placeholders-json') {
      if (state.processStatus.placeholders) {
        state.processStatus.placeholders.status = 'processing';
      }
      if (state.processStatus.placeholdersJson) {
        if (progress.status === 'start') {
          state.processStatus.placeholdersJson.status = 'processing';
          state.processStatus.placeholdersJson.message = 'Creating...';
        } else if (progress.status === 'complete') {
          state.processStatus.placeholdersJson.status = 'complete';
          state.processStatus.placeholdersJson.message = 'Created';
          if (state.processStatus.placeholders) {
            state.processStatus.placeholders.status = 'complete';
            state.processStatus.placeholders.processed = state.selectedPlaceholders.length;
          }
        }
      }
    }

    this.render();
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

  handleRemoveExistingTemplate(index) {
    templatesHandler.handleRemoveExisting(state, () => this.render(), index);
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

  handleRemoveExistingIcon(index) {
    iconsHandler.handleRemoveExisting(state, () => this.render(), index);
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

  handleRemoveExistingPlaceholder(index) {
    placeholdersHandler.handleRemoveExisting(state, () => this.render(), index);
  },

  handleCancelEditPlaceholder() {
    placeholdersHandler.handleCancelEdit(state, () => this.render());
  },

  handleSaveAemConfig() {
    aemAssetsHandlers.handleSaveAemConfig(state, () => this.render(), daApi);
  },

  handleVerifyAemUrl() {
    aemAssetsHandlers.handleVerifyAemUrl(state, () => this.render());
  },

  handleSaveTranslationConfig() {
    translationHandlers.handleSaveTranslationConfig(state, () => this.render(), daApi);
  },

  handleSaveUeConfig() {
    universalEditorHandlers.handleSaveUeConfig(state, () => this.render(), daApi);
  },

  showErrorModal() {
    const modal = document.getElementById('error-modal');
    if (modal) {
      modal.style.display = 'flex';
    }
  },

  hideErrorModal() {
    const modal = document.getElementById('error-modal');
    if (modal) {
      modal.style.display = 'none';
    }
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;
