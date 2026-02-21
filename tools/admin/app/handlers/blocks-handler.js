import * as githubOps from '../../operations/github.js';
import * as libraryOps from '../../operations/library.js';
import * as daApi from '../../utils/da-api.js';
import TokenStorage from '../../utils/token-storage.js';
import { DOM_IDS, ERROR_KEYS } from '../constants.js';

// discoverBlocks must be defined before validateRepository which calls it
export async function discoverBlocks(app, state) {
  state.discovering = true;
  app.render();
  try {
    const blocks = await githubOps.discoverBlocks(state.org, state.repo, state.githubToken);

    const existingBlocksJSON = await daApi.fetchBlocksJSON(state.org, state.site);
    const existingData = libraryOps.getBlocksArray(existingBlocksJSON);
    const existingBlockNames = new Set(
      existingData.map((b) => {
        const pathParts = b.path.split('/');
        return pathParts[pathParts.length - 1];
      }),
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

    app.render();
  } catch (error) {
    state.errors.github = `Block discovery failed: ${error.message}`;
    state.discovering = false;
    app.render();
  }
}

export async function handleGitHubUrlChange(state, render, url) {
  state.githubUrl = url.trim();

  const parsed = githubOps.parseGitHubURL(state.githubUrl);
  if (parsed && parsed.org && parsed.repo) {
    state.org = parsed.org;
    state.repo = parsed.repo;
    state.site = parsed.repo;
  } else {
    state.org = '';
    state.repo = '';
  }

  state.repositoryValidated = false;
  state.needsToken = false;
  state.errors.github = '';
  render();
}

export async function validateRepository(app, state) {
  state.validating = true;
  app.render();
  try {
    const result = await githubOps.validateRepository(state.org, state.repo, state.githubToken);

    if (!result.valid) {
      if (result.error === 'rate_limit') {
        state.needsToken = true;
        state.errors.github = `GitHub API rate limit exceeded (resets at ${result.resetTime}). Please add a GitHub token to continue, or wait and try again.`;
        state.validating = false;
        app.render();
        return;
      }

      if (result.error === 'not_found') {
        state.errors.github = 'Repository not found. Please check the URL and try again.';
        state.validating = false;
        app.render();
        return;
      }

      if (result.error === 'private' && result.needsToken) {
        state.needsToken = true;
        state.errors.github = 'Unable to access repository. If this is a private repository, please enter a GitHub token below.';
        state.validating = false;
        app.render();
        return;
      }

      state.errors.github = result.error === 'private' ? 'Unable to access repository with provided token.' : result.error;
      state.validating = false;
      app.render();
      return;
    }

    state.repositoryValidated = true;
    state.needsToken = false;

    state.validating = false;
    app.render();
    await discoverBlocks(app, state);
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
    app.render();
  }
}

export async function handleValidateWithToken(app, state) {
  const tokenInput = document.getElementById(DOM_IDS.GITHUB_TOKEN);
  const saveCheckbox = document.getElementById(DOM_IDS.SAVE_TOKEN);
  const token = tokenInput?.value.trim();

  if (!token) {
    state.errors[ERROR_KEYS.GITHUB] = 'Please enter a GitHub token';
    app.render();
    return;
  }

  if (saveCheckbox?.checked) {
    TokenStorage.set(token);
  }

  state.githubToken = token;
  await validateRepository(app, state);
}

export function handleClearToken(state, render) {
  TokenStorage.clear();
  state.githubToken = null;
  state.message = 'Saved token cleared';
  state.messageType = 'success';
  render();
}

export async function handleLoadExistingBlocks(state, render) {
  if (!state.org || !state.site) {
    state.errors.site = 'Please enter both organization and site name';
    render();
    return;
  }

  state.discovering = true;
  render();

  try {
    const blocks = await libraryOps.fetchExistingBlocks(state.org, state.site);

    if (blocks.length === 0) {
      state.errors.site = 'No library found at this location. Please run "Library Setup" first to create the library.';
      state.discovering = false;
      render();
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
      github: '', site: '', blocks: '', templates: '', icons: '', placeholders: '', pages: '',
    };
    render();
  } catch (error) {
    state.errors.site = `Failed to load blocks: ${error.message}`;
    state.discovering = false;
    render();
  }
}

export function toggleAllBlocks(state, render) {
  if (state.selectedBlocks.size === state.blocks.length) {
    state.selectedBlocks.clear();
  } else {
    state.blocks.forEach((block) => state.selectedBlocks.add(block.name));
  }
  render();
}

export function selectNewBlocksOnly(state, render) {
  state.selectedBlocks.clear();
  state.blocks
    .filter((block) => block.isNew)
    .forEach((block) => state.selectedBlocks.add(block.name));
  render();
}

export function attachBlocksListeners(app, state) {
  const validateRepoBtn = document.getElementById(DOM_IDS.VALIDATE_REPOSITORY);
  if (validateRepoBtn) {
    validateRepoBtn.addEventListener('click', () => validateRepository(app, state));
  }

  const validateWithTokenBtn = document.getElementById(DOM_IDS.VALIDATE_WITH_TOKEN);
  if (validateWithTokenBtn) {
    validateWithTokenBtn.addEventListener('click', () => handleValidateWithToken(app, state));
  }

  const clearTokenBtn = document.getElementById(DOM_IDS.CLEAR_TOKEN);
  if (clearTokenBtn) {
    clearTokenBtn.addEventListener('click', () => handleClearToken(state, () => app.render()));
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
      app.render();
    });
  });

  const toggleAllBtn = document.getElementById(DOM_IDS.TOGGLE_ALL_BLOCKS);
  if (toggleAllBtn) {
    toggleAllBtn.addEventListener('click', () => toggleAllBlocks(state, () => app.render()));
  }

  const selectNewOnlyBtn = document.getElementById(DOM_IDS.SELECT_NEW_ONLY);
  if (selectNewOnlyBtn) {
    selectNewOnlyBtn.addEventListener('click', () => selectNewBlocksOnly(state, () => app.render()));
  }
}
