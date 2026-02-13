import {
  registerLibrary,
  fetchBlocksJSON,
  updateBlocksJSON,
  batchUploadBlocks,
} from '../utils/da-api.js';
import { generateBlockHTML, generateBlocksJSON } from '../utils/doc-generator.js';
import extractExamplesWithProgress from '../utils/content-extract.js';
import { analyzeBlock } from '../utils/block-analysis.js';
import { getContentBlockPath } from '../config.js';

export async function checkLibraryExists(org, site) {
  try {
    const blocksJSON = await fetchBlocksJSON(org, site);
    if (blocksJSON && blocksJSON.data) {
      return {
        exists: true,
        count: blocksJSON.data.total || blocksJSON.data.data?.length || 0,
      };
    }
    return { exists: false, count: 0 };
  } catch (error) {
    return { exists: false, count: 0 };
  }
}

export async function fetchExistingBlocks(org, site) {
  const blocksJSON = await fetchBlocksJSON(org, site);
  if (blocksJSON && blocksJSON.data && blocksJSON.data.data) {
    const autoBlocks = new Set(['header', 'footer', 'fragment']);

    return blocksJSON.data.data
      .filter((block) => {
        const pathParts = block.path.split('/');
        const kebabName = pathParts[pathParts.length - 1];
        return !autoBlocks.has(kebabName.toLowerCase());
      })
      .map((block) => ({
        name: block.name,
        path: block.path,
        isAutoBlock: false,
      }));
  }
  return [];
}

export async function setupLibraryConfig(org, site) {
  return registerLibrary(org, site);
}

export async function extractBlockExamples(blockNames, sitesWithPages, onProgress) {
  if (!sitesWithPages || sitesWithPages.length === 0) {
    return {};
  }

  const totalPages = sitesWithPages.reduce((sum, s) => sum + s.pages.length, 0);
  if (totalPages === 0) {
    return {};
  }

  return extractExamplesWithProgress(sitesWithPages, blockNames, onProgress);
}

export async function generateBlockDocs(
  blocks,
  examplesByBlock,
  api = null,
  discoveredBlocks = [],
) {
  return Promise.all(blocks.map(async (blockName) => {
    const examples = examplesByBlock[blockName] || [];

    let analysis = null;
    if (api && examples.length === 0) {
      try {
        const blockInfo = discoveredBlocks.find((b) => b.name === blockName);
        const blockPath = blockInfo?.path || `blocks/${blockName}`;
        analysis = await analyzeBlock(api, blockName, blockPath);
      } catch (error) {
        // ignore
      }
    }

    const block = { name: blockName, analysis };
    const html = generateBlockHTML(block, examples);

    return {
      name: blockName,
      html,
    };
  }));
}

export async function uploadBlockDocs(org, site, blocksToUpload, onProgress) {
  return batchUploadBlocks(org, site, blocksToUpload, onProgress);
}

export async function updateLibraryBlocksJSON(org, site, blockNames) {
  let existingBlocks = [];
  let existingOptions = null;

  try {
    const existingBlocksJSON = await fetchBlocksJSON(org, site);
    if (existingBlocksJSON?.data?.data) {
      existingBlocks = existingBlocksJSON.data.data;
    }
    if (existingBlocksJSON?.options) {
      existingOptions = existingBlocksJSON.options;
    }
  } catch (error) {
    // ignore
  }

  const existingBlockMap = new Map(
    existingBlocks.map((block) => {
      const pathParts = block.path.split('/');
      const kebabName = pathParts[pathParts.length - 1];
      return [kebabName, block];
    }),
  );

  const autoBlocks = new Set(['header', 'footer']);
  const blockNamesSet = new Set(blockNames);
  const preservedBlocks = existingBlocks.filter((block) => {
    const pathParts = block.path.split('/');
    const kebabName = pathParts[pathParts.length - 1];
    return !blockNamesSet.has(kebabName) && !autoBlocks.has(kebabName.toLowerCase());
  });

  const newBlocks = blockNames.map((name) => {
    const existing = existingBlockMap.get(name);
    return {
      name,
      path: existing?.path || getContentBlockPath(org, site, name),
    };
  });

  const mergedBlocks = [...preservedBlocks, ...newBlocks];

  const blocksJSON = generateBlocksJSON(
    mergedBlocks.map((block) => ({ name: block.name, path: block.path })),
    org,
    site,
  );

  if (existingOptions) {
    blocksJSON.options = existingOptions;
  }

  return updateBlocksJSON(org, site, blocksJSON);
}

export async function setupLibrary({
  org,
  site,
  blockNames,
  templates = [],
  icons = [],
  placeholders = [],
  sitesWithPages = [],
  onProgress,
  skipSiteConfig = false,
  githubApi = null,
}) {
  const results = {
    steps: [],
    success: true,
    error: null,
  };

  try {
    if (!skipSiteConfig) {
      onProgress?.({ step: 'register', status: 'start' });
      const registration = await setupLibraryConfig(org, site);
      if (!registration.success) {
        throw new Error(`Failed to register library: ${registration.error}`);
      }
      results.steps.push({ name: 'register', success: true });
      onProgress?.({ step: 'register', status: 'complete', registration });
    }

    if (blockNames.length > 0) {
      let examplesByBlock = {};
      const totalPages = sitesWithPages.reduce((sum, s) => sum + s.pages.length, 0);
      if (totalPages > 0) {
        onProgress?.({ step: 'extract', status: 'start', totalPages });
        examplesByBlock = await extractBlockExamples(blockNames, sitesWithPages, onProgress);
        results.steps.push({ name: 'extract', success: true });
        onProgress?.({ step: 'extract', status: 'complete' });
      }

      let blocksToProcess = blockNames;
      if (skipSiteConfig && totalPages > 0) {
        blocksToProcess = blockNames.filter((name) => {
          const examples = examplesByBlock[name] || [];
          return examples.length > 0;
        });

        if (blocksToProcess.length === 0) {
          throw new Error('No blocks found in the selected sample pages. Please select pages that contain the blocks you want to update.');
        }
      }

      onProgress?.({ step: 'generate', status: 'start', totalBlocks: blocksToProcess.length });
      let discoveredBlocks = [];
      if (githubApi) {
        discoveredBlocks = await githubApi.discoverBlocks();
      }
      const blocksToUpload = await generateBlockDocs(
        blocksToProcess,
        examplesByBlock,
        githubApi,
        discoveredBlocks,
      );
      results.steps.push({ name: 'generate', success: true });
      onProgress?.({ step: 'generate', status: 'complete' });

      onProgress?.({ step: 'upload', status: 'start' });
      const uploadResults = await uploadBlockDocs(org, site, blocksToUpload, onProgress);
      results.steps.push({ name: 'upload', success: true, results: uploadResults });
      onProgress?.({ step: 'upload', status: 'complete', uploadResults });

      if (!skipSiteConfig) {
        onProgress?.({ step: 'blocks-json', status: 'start' });
        const blocksJsonResult = await updateLibraryBlocksJSON(org, site, blockNames);
        if (!blocksJsonResult.success) {
          throw new Error(`Failed to update blocks.json: ${blocksJsonResult.error}`);
        }
        results.steps.push({ name: 'blocks-json', success: true });
        onProgress?.({ step: 'blocks-json', status: 'complete' });
      }
    }

    if (templates.length > 0) {
      const { updateLibraryTemplatesJSON } = await import('./templates.js');
      const { registerTemplatesInConfig } = await import('../utils/da-api.js');

      onProgress?.({ step: 'templates-json', status: 'start' });
      const templatesJsonResult = await updateLibraryTemplatesJSON(org, site, templates);
      if (!templatesJsonResult.success) {
        throw new Error(`Failed to update templates.json: ${templatesJsonResult.error}`);
      }
      results.steps.push({ name: 'templates-json', success: true, stats: templatesJsonResult.stats });
      onProgress?.({ step: 'templates-json', status: 'complete' });

      if (!skipSiteConfig) {
        const registerResult = await registerTemplatesInConfig(org, site);
        if (!registerResult.success) {
          throw new Error(`Failed to register templates in config: ${registerResult.error}`);
        }
      }
    }

    if (icons.length > 0) {
      const { updateLibraryIconsJSON } = await import('./icons.js');
      const { registerIconsInConfig } = await import('../utils/da-api.js');

      onProgress?.({ step: 'icons-json', status: 'start' });
      const iconsJsonResult = await updateLibraryIconsJSON(org, site, icons);
      if (!iconsJsonResult.success) {
        throw new Error(`Failed to update icons.json: ${iconsJsonResult.error}`);
      }
      results.steps.push({ name: 'icons-json', success: true, stats: iconsJsonResult.stats });
      onProgress?.({ step: 'icons-json', status: 'complete' });

      if (!skipSiteConfig) {
        const registerResult = await registerIconsInConfig(org, site);
        if (!registerResult.success) {
          throw new Error(`Failed to register icons in config: ${registerResult.error}`);
        }
      }
    }

    if (placeholders.length > 0) {
      const { updateLibraryPlaceholdersJSON } = await import('./placeholders.js');
      const { registerPlaceholdersInConfig } = await import('../utils/da-api.js');

      onProgress?.({ step: 'placeholders-json', status: 'start' });
      const placeholdersJsonResult = await updateLibraryPlaceholdersJSON(org, site, placeholders);
      if (!placeholdersJsonResult.success) {
        throw new Error(`Failed to update placeholders.json: ${placeholdersJsonResult.error}`);
      }
      results.steps.push({
        name: 'placeholders-json',
        success: true,
        stats: placeholdersJsonResult.stats,
      });
      onProgress?.({ step: 'placeholders-json', status: 'complete' });

      if (!skipSiteConfig) {
        const registerResult = await registerPlaceholdersInConfig(org, site);
        if (!registerResult.success) {
          throw new Error(`Failed to register placeholders in config: ${registerResult.error}`);
        }
      }
    }

    return results;
  } catch (error) {
    results.success = false;
    results.error = error.message;
    return results;
  }
}
