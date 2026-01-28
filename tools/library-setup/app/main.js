/* eslint-disable import/no-absolute-path */
/* eslint-disable import/no-unresolved */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

import state from './state.js';
import * as templates from './templates.js';
import * as githubOps from '../operations/github.js';
import * as libraryOps from '../operations/library.js';
import * as pagesOps from '../operations/pages.js';
import TokenStorage from '../utils/token-storage.js';
import GitHubAPI from '../utils/github-api.js';

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

      // eslint-disable-next-line no-console
      console.log('DA SDK initialized:', {
        hasContext: !!context,
        hasToken: !!token,
        org: context?.org,
        repo: context?.repo,
        autoPopulated: !!(context?.org && context?.repo),
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('DA SDK not available (running outside DA.live):', error);

      const urlMatch = window.location.pathname.match(/^\/app\/([^/]+)\/([^/]+)/);
      if (urlMatch) {
        const [, org, site] = urlMatch;
        state.org = org;
        state.site = site;
        // eslint-disable-next-line no-console
        console.log('Auto-populated from URL:', { org: state.org, site: state.site });
      }
    }

    if (TokenStorage.exists()) {
      state.githubToken = TokenStorage.get();
    }

    this.container = container;
    this.render();
    this.attachEventListeners();

    // Auto-load blocks if starting in refresh mode with org/site available
    if (state.mode === 'refresh' && state.org && state.site) {
      await this.handleLoadExistingBlocks();
    }
  },

  render() {
    const sections = [];

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
    }

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

    if (state.selectedBlocks.size > 0 && (state.processing || state.processResults.length > 0)) {
      sections.push(state.processing
        ? templates.processingTemplate({ processStatus: state.processStatus })
        : templates.finalStatusTemplate({
          processStatus: state.processStatus,
          org: state.org,
          repo: state.repo,
        }));
    } else if (state.selectedBlocks.size > 0) {
      sections.push(templates.initialStatusTemplate({
        org: state.org,
        repo: state.repo,
        blocksCount: state.selectedBlocks.size,
        mode: state.mode,
      }));
    }

    const content = sections.join('');
    this.container.innerHTML = templates.appTemplate(content);
    this.attachEventListeners();
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

    const loadExistingBlocksBtn = document.getElementById('load-existing-blocks');
    if (loadExistingBlocksBtn) {
      loadExistingBlocksBtn.addEventListener('click', () => this.handleLoadExistingBlocks());
    }

    const validateWithTokenBtn = document.getElementById('validate-with-token');
    if (validateWithTokenBtn) {
      validateWithTokenBtn.addEventListener('click', () => this.handleValidateWithToken());
    }

    const clearTokenBtn = document.getElementById('clear-token');
    if (clearTokenBtn) {
      clearTokenBtn.addEventListener('click', () => this.handleClearToken());
    }

    const startBtn = document.getElementById('start-processing');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.handleStartProcessing());
    }

    document.querySelectorAll('[data-block-name]').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const { target } = e;
        const { blockName } = target.dataset;
        if (target.checked) {
          state.selectedBlocks.add(blockName);
        } else {
          state.selectedBlocks.delete(blockName);
        }
        this.render();
      });
    });

    const toggleAllBtn = document.getElementById('toggle-all-blocks');
    if (toggleAllBtn) {
      toggleAllBtn.addEventListener('click', () => this.toggleAllBlocks());
    }

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
  },

  async handleModeChange(newMode) {
    state.mode = newMode;
    state.message = '';
    state.messageType = 'info';
    state.errors = {
      github: '', site: '', blocks: '', pages: '',
    };

    if (newMode === 'refresh') {
      state.repositoryValidated = false;
      state.blocksDiscovered = false;
      state.needsToken = false;
      state.githubUrl = '';
      state.blocks = [];
      state.selectedBlocks.clear();
      state.processing = false;
      state.processResults = [];
      state.validating = false;
      state.discovering = false;
      state.pageSelections = {};

      this.render();
      if (state.org && state.site) {
        await this.handleLoadExistingBlocks();
      }
      return;
    }

    if (newMode === 'setup') {
      state.repositoryValidated = false;
      state.blocksDiscovered = false;
      state.needsToken = false;
      state.githubUrl = '';
      state.blocks = [];
      state.selectedBlocks.clear();
      state.processing = false;
      state.processResults = [];
      state.validating = false;
      state.discovering = false;
      state.pageSelections = {};
      state.libraryExists = false;
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

      state.blocks = blocks;
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
      state.blocks = blocks;
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
      github: { org: state.org, repo: state.repo, status: 'complete' },
      blocks: { total: state.selectedBlocks.size, status: 'complete' },
      blockDocs: { created: 0, total: state.selectedBlocks.size, status: 'pending' },
      errors: { count: 0, messages: [] },
      currentStep: state.mode === 'refresh' ? 'Starting documentation refresh...' : 'Starting library setup...',
    };

    // Only include siteConfig and blocksJson status in setup mode (not refresh)
    if (state.mode === 'setup') {
      baseStatus.siteConfig = { status: 'pending', message: '' };
      baseStatus.blocksJson = { status: 'pending', message: '' };
    }

    state.processStatus = baseStatus;
    state.processResults = [];
    this.render();

    try {
      const selectedBlockNames = Array.from(state.selectedBlocks);
      const sitesWithPages = this.getAllSites().map((site) => ({
        org: state.org,
        site,
        pages: Array.from(state.pageSelections[site] || []),
      }));

      // eslint-disable-next-line no-console
      console.log('Starting library setup:', {
        org: state.org,
        site: state.site,
        blocks: selectedBlockNames,
        pages: sitesWithPages,
      });

      let githubApi = null;
      if (state.mode === 'setup' && state.org && state.repo) {
        githubApi = new GitHubAPI(state.org, state.repo, 'main', state.githubToken);
      }

      const results = await libraryOps.setupLibrary({
        org: state.org,
        site: state.site,
        blockNames: selectedBlockNames,
        sitesWithPages,
        onProgress: (progress) => this.handleProgress(progress),
        skipSiteConfig: state.mode === 'refresh',
        githubApi,
      });

      // eslint-disable-next-line no-console
      console.log('Setup results:', results);

      if (!results.success) {
        throw new Error(results.error || 'Library setup failed');
      }

      state.processStatus.currentStep = '';
      state.message = '';
      state.messageType = '';
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Processing error:', error);

      state.processStatus.currentStep = `✗ Error: ${error.message}`;
      state.processStatus.errors.count += 1;
      state.processStatus.errors.messages.push(error.message);
      state.message = `Processing failed: ${error.message}`;
      state.messageType = 'error';
    } finally {
      state.processing = false;
      this.render();
    }
  },

  handleProgress(progress) {
    // eslint-disable-next-line no-console
    console.log('Progress update:', progress);

    if (progress.step === 'register') {
      // Only update siteConfig status if it exists (setup mode only)
      if (state.processStatus.siteConfig) {
        if (progress.status === 'start') {
          state.processStatus.siteConfig.status = 'processing';
          state.processStatus.siteConfig.message = 'Registering library...';
          state.processStatus.currentStep = 'Registering library in site configuration...';
        } else if (progress.status === 'complete') {
          state.processStatus.siteConfig.status = 'complete';
          state.processStatus.siteConfig.message = 'Updated Site Config';
          state.processStatus.currentStep = progress.registration.created
            ? 'Created config.json with library sheet'
            : 'Library already registered in config.json';
        }
      }
    } else if (progress.step === 'extract') {
      if (progress.status === 'start') {
        state.processStatus.currentStep = `Extracting block examples from ${progress.totalPages} sample pages...`;
      } else if (progress.status === 'complete') {
        state.processStatus.currentStep = 'Extracted block examples from sample pages';
      }
    } else if (progress.step === 'generate') {
      if (progress.status === 'start') {
        state.processStatus.blockDocs.status = 'processing';
        state.processStatus.currentStep = `Generating documentation for ${progress.totalBlocks} blocks...`;
      } else if (progress.status === 'complete') {
        state.processStatus.currentStep = `Generated ${progress.totalBlocks} block documentation files`;
      }
    } else if (progress.step === 'upload') {
      if (progress.status === 'start') {
        state.processStatus.blockDocs.status = 'processing';
        state.processStatus.currentStep = 'Uploading block documentation...';
      } else if (progress.current && progress.total) {
        state.processStatus.blockDocs.created = progress.current;
        state.processStatus.blockDocs.status = 'processing';
        state.processStatus.currentStep = `Uploading blocks... ${progress.current}/${progress.total}`;
      } else if (progress.status === 'complete') {
        const successCount = progress.uploadResults.filter((r) => r.success).length;
        const errorCount = progress.uploadResults.length - successCount;

        state.processResults = progress.uploadResults;
        state.processStatus.blockDocs.created = successCount;
        state.processStatus.blockDocs.status = errorCount > 0 ? 'warning' : 'complete';
        state.processStatus.currentStep = `Uploaded ${successCount} block documents`;

        if (errorCount > 0) {
          state.processStatus.errors.count += errorCount;
          progress.uploadResults
            .filter((r) => !r.success)
            .forEach((r) => state.processStatus.errors.messages.push(`${r.name}: ${r.error}`));
        }
      }
    } else if (progress.step === 'blocks-json') {
      if (state.processStatus.blocksJson) {
        if (progress.status === 'start') {
          state.processStatus.blocksJson.status = 'processing';
          state.processStatus.blocksJson.message = state.libraryExists
            ? 'Updating...'
            : 'Creating...';
          state.processStatus.currentStep = state.libraryExists
            ? 'Updating blocks.json configuration...'
            : 'Creating blocks.json configuration...';
        } else if (progress.status === 'complete') {
          state.processStatus.blocksJson.status = 'complete';
          state.processStatus.blocksJson.message = state.libraryExists
            ? 'Updated'
            : 'Created';
          state.processStatus.currentStep = state.libraryExists
            ? 'Updated blocks.json'
            : 'Created blocks.json';
        }
      }
    }

    this.render();
  },

  toggleAllBlocks() {
    if (state.selectedBlocks.size === state.blocks.length) {
      state.selectedBlocks.clear();
    } else {
      state.blocks.forEach((block) => state.selectedBlocks.add(block.name));
    }
    this.render();
  },

  getAllSites() {
    return [state.site];
  },

  async validateSite(org, site, token) {
    try {
      const response = await fetch(
        `https://admin.da.live/list/${org}/${site}/`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      return response.ok;
    } catch (error) {
      return false;
    }
  },

  async openPagePicker(site) {
    if (!state.daToken) {
      state.errors.pages = 'DA.live authentication required. This tool must be run from within DA.live.';
      this.render();
      return;
    }

    const siteValid = await this.validateSite(state.org, site, state.daToken);
    if (!siteValid) {
      state.errors.pages = `Site "${state.org}/${site}" not found in DA.live. Please verify the site name.`;
      this.render();
      return;
    }

    state.currentSite = site;
    state.loadingPages = true;
    state.showPagePicker = true;
    this.renderPagePickerModal();

    try {
      const pages = await pagesOps.fetchSitePages(state.org, site);
      state.allPages = pages;
      state.loadingPages = false;
      this.renderPagePickerModal();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Page picker error:', error);

      const errorMsg = error.message.includes('401')
        ? 'Authentication failed. Please ensure you are logged in to DA.live.'
        : `Failed to load pages: ${error.message}`;

      state.errors.pages = errorMsg;
      state.loadingPages = false;
      state.showPagePicker = false;
      this.render();
    }
  },

  renderPagePickerModal() {
    const modal = templates.pagePickerModalTemplate({
      site: state.currentSite,
      items: state.allPages, // Pass items directly
      selectedPages: state.pageSelections[state.currentSite] || new Set(),
      loading: state.loadingPages,
    });

    let modalContainer = document.getElementById('page-picker-modal');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'page-picker-modal';
      document.body.appendChild(modalContainer);
    }

    modalContainer.innerHTML = modal;
    this.attachPagePickerListeners();
  },

  attachPagePickerListeners() {
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.closePagePicker();
        }
      });
    }

    const cancelBtn = document.querySelector('.modal-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.closePagePicker());
    }

    const confirmBtn = document.querySelector('.modal-confirm');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmPageSelection());
    }

    const searchInput = document.getElementById('page-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.pageSearchQuery = e.target.value;
        this.renderPagePickerModal();
      });
    }

    document.querySelectorAll('.folder-toggle').forEach((folderBtn) => {
      folderBtn.addEventListener('click', async (e) => {
        const button = e.currentTarget;
        const folderItem = button.closest('.folder-item');
        const contents = folderItem.querySelector('.folder-contents');
        const arrow = button.querySelector('.toggle-arrow');
        const icon = button.querySelector('.folder-icon');
        const { folderPath } = button.dataset;
        const isLoaded = contents.dataset.loaded === 'true';

        if (contents.classList.contains('hidden')) {
          contents.classList.remove('hidden');
          arrow.textContent = '▼';
          icon.textContent = '📂';

          if (!isLoaded) {
            try {
              const items = await pagesOps.loadFolderContents(
                state.org,
                state.currentSite,
                folderPath,
              );

              const childHTML = items
                .sort((a, b) => {
                  if (!a.ext && b.ext) return -1;
                  if (a.ext && !b.ext) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((item) => {
                  if (item.ext === 'html') {
                    const siteSelections = state.pageSelections[state.currentSite] || new Set();
                    const isSelected = siteSelections.has(item.path);
                    const displayName = item.name.replace('.html', '');
                    return `
                      <div class="tree-item file-item" style="padding-left: 20px;">
                        <label class="page-checkbox ${isSelected ? 'selected' : ''}">
                          <input type="checkbox" data-path="${item.path}" ${isSelected ? 'checked' : ''}/>
                          <span class="page-icon">📄</span>
                          <span class="page-name">${displayName}</span>
                        </label>
                      </div>
                    `;
                  }
                  return `
                    <div class="tree-item folder-item" data-path="${item.path}" style="padding-left: 20px;">
                      <button class="folder-toggle" data-folder-path="${item.path}">
                        <span class="folder-icon">📁</span>
                        <span class="folder-name">${item.name}</span>
                        <span class="toggle-arrow">▶</span>
                      </button>
                      <div class="folder-contents hidden" data-loaded="false">
                        <div class="folder-loading">Loading...</div>
                      </div>
                    </div>
                  `;
                })
                .join('');

              contents.innerHTML = childHTML || '<p style="padding-left: 20px; color: #999;">Empty folder</p>';
              contents.dataset.loaded = 'true';

              this.attachPagePickerListeners();
            } catch (error) {
              contents.innerHTML = '<p style="padding-left: 20px; color: red;">Failed to load</p>';
            }
          }
        } else {
          contents.classList.add('hidden');
          arrow.textContent = '▶';
          icon.textContent = '📁';
        }
      });
    });

    document.querySelectorAll('.page-checkbox input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener('change', (e) => {
        const { path } = e.target.dataset;
        if (!state.pageSelections[state.currentSite]) {
          state.pageSelections[state.currentSite] = new Set();
        }

        if (e.target.checked) {
          state.pageSelections[state.currentSite].add(path);
        } else {
          state.pageSelections[state.currentSite].delete(path);
        }

        const confirmButton = document.querySelector('.modal-confirm');
        if (confirmButton) {
          const count = state.pageSelections[state.currentSite].size;
          confirmButton.textContent = `Confirm (${count} selected)`;
        }
      });
    });
  },

  closePagePicker() {
    const modalContainer = document.getElementById('page-picker-modal');
    if (modalContainer) {
      modalContainer.remove();
    }
    state.showPagePicker = false;
    state.pageSearchQuery = '';
  },

  confirmPageSelection() {
    this.closePagePicker();
    this.render();
  },

  removePage(site, path) {
    if (state.pageSelections[site]) {
      state.pageSelections[site].delete(path);
    }
    this.render();
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

export default app;
