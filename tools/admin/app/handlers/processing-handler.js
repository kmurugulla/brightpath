import * as libraryOps from '../../operations/library.js';
import GitHubAPI from '../../utils/github-api.js';
import * as pagePickerHandlers from './page-picker-handler.js';
import { PROGRESS_STEPS, ERROR_KEYS } from '../constants.js';

/**
 * Builds the initial processStatus object based on what content is selected.
 * @param {Object} state
 * @returns {Object} baseStatus
 */
function buildInitialStatus(state) {
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

  return baseStatus;
}

/**
 * Updates processStatus in response to a progress event from library setup.
 * @param {Object} progress
 * @param {Object} state
 * @param {Function} render
 */
export function handleProgress(progress, state, render) {
  const { step, status } = progress;

  if (step === PROGRESS_STEPS.REGISTER) {
    if (state.processStatus.siteConfig) {
      if (status === 'start') {
        state.processStatus.siteConfig.status = 'processing';
        state.processStatus.siteConfig.message = 'Registering library...';
      } else if (status === 'complete') {
        state.processStatus.siteConfig.status = 'complete';
        state.processStatus.siteConfig.message = 'Updated Site Config';
      }
    }
  } else if (step === PROGRESS_STEPS.GENERATE && status === 'start') {
    state.processStatus.blockDocs.status = 'processing';
  } else if (step === PROGRESS_STEPS.UPLOAD) {
    if (status === 'start') {
      state.processStatus.blockDocs.status = 'processing';
    } else if (progress.current && progress.total) {
      state.processStatus.blockDocs.created = progress.current;
      state.processStatus.blockDocs.status = 'processing';
    } else if (status === 'complete') {
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
  } else if (step === PROGRESS_STEPS.BLOCKS_JSON && state.processStatus.blocksJson) {
    if (status === 'start') {
      state.processStatus.blocksJson.status = 'processing';
      state.processStatus.blocksJson.message = state.libraryExists ? 'Updating...' : 'Creating...';
    } else if (status === 'complete') {
      state.processStatus.blocksJson.status = 'complete';
      state.processStatus.blocksJson.message = state.libraryExists ? 'Updated' : 'Created';
    }
  } else if (step === PROGRESS_STEPS.TEMPLATES_JSON) {
    if (state.processStatus.templates) {
      state.processStatus.templates.status = 'processing';
    }
    if (state.processStatus.templatesJson) {
      if (status === 'start') {
        state.processStatus.templatesJson.status = 'processing';
        state.processStatus.templatesJson.message = 'Creating...';
      } else if (status === 'complete') {
        state.processStatus.templatesJson.status = 'complete';
        state.processStatus.templatesJson.message = 'Created';
        if (state.processStatus.templates) {
          state.processStatus.templates.status = 'complete';
          state.processStatus.templates.processed = state.selectedTemplates.length;
        }
      }
    }
  } else if (step === PROGRESS_STEPS.ICONS_JSON) {
    if (state.processStatus.icons) {
      state.processStatus.icons.status = 'processing';
    }
    if (state.processStatus.iconsJson) {
      if (status === 'start') {
        state.processStatus.iconsJson.status = 'processing';
        state.processStatus.iconsJson.message = 'Creating...';
      } else if (status === 'complete') {
        state.processStatus.iconsJson.status = 'complete';
        state.processStatus.iconsJson.message = 'Created';
        if (state.processStatus.icons) {
          state.processStatus.icons.status = 'complete';
          state.processStatus.icons.processed = state.selectedIcons.length;
        }
      }
    }
  } else if (step === PROGRESS_STEPS.PLACEHOLDERS_JSON) {
    if (state.processStatus.placeholders) {
      state.processStatus.placeholders.status = 'processing';
    }
    if (state.processStatus.placeholdersJson) {
      if (status === 'start') {
        state.processStatus.placeholdersJson.status = 'processing';
        state.processStatus.placeholdersJson.message = 'Creating...';
      } else if (status === 'complete') {
        state.processStatus.placeholdersJson.status = 'complete';
        state.processStatus.placeholdersJson.message = 'Created';
        if (state.processStatus.placeholders) {
          state.processStatus.placeholders.status = 'complete';
          state.processStatus.placeholders.processed = state.selectedPlaceholders.length;
        }
      }
    }
  }

  render();
}

/**
 * Validates the site and kicks off the full library processing pipeline.
 * @param {Object} app
 * @param {Object} state
 */
export async function handleStartProcessing(app, state) {
  if (!state.daToken) {
    state.errors[ERROR_KEYS.PAGES] = 'DA.live authentication required. This tool must be run from within DA.live.';
    app.render();
    return;
  }

  const siteValid = await pagePickerHandlers.validateSite(state.org, state.site, state.daToken);
  if (!siteValid) {
    state.errors[ERROR_KEYS.SITE] = `Site "${state.org}/${state.site}" not found in DA.live. Please verify the site name.`;
    app.render();
    return;
  }

  state.processing = true;
  state.processStatus = buildInitialStatus(state);
  app.render();

  try {
    const selectedBlockNames = Array.from(state.selectedBlocks);
    const sitesWithPages = [state.site].map((site) => ({
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
      onProgress: (progress) => handleProgress(progress, state, () => app.render()),
      skipSiteConfig: state.mode === 'refresh',
      githubApi,
    });

    if (!results.success) {
      throw new Error(results.error || 'Library setup failed');
    }

    state.processStatus.completed = true;
    state.selectedTemplates = [];
    state.selectedIcons = [];
    state.selectedPlaceholders = [];
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
    app.render();
  }
}
