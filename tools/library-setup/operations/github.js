import GitHubAPI from '../utils/github-api.js';

export function parseGitHubURL(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2) {
      return {
        org: pathParts[0],
        repo: pathParts[1].replace(/\.git$/, ''),
      };
    }
  } catch (error) {
    // do nothing
  }
  return null;
}

export async function validateRepository(org, repo, token = null) {
  const api = new GitHubAPI(org, repo, 'main', token);
  return api.validateAccess();
}

async function detectAutoBlocks(api) {
  const autoBlocks = new Set();

  try {
    const scriptsContent = await api.getFileContent('scripts/scripts.js');
    if (!scriptsContent) return autoBlocks;

    const buildBlockRegex = /buildBlock\(['"`](\w+)['"`]/g;
    const buildBlockMatches = Array.from(scriptsContent.matchAll(buildBlockRegex));
    buildBlockMatches.forEach((match) => {
      autoBlocks.add(match[1]);
    });

    const importRegex = /\/blocks\/(\w+)\/\w+\.js['"`)\]]/g;
    const importMatches = Array.from(scriptsContent.matchAll(importRegex));
    importMatches.forEach((match) => {
      autoBlocks.add(match[1]);
    });
  } catch (error) {
    // do nothing
  }

  return autoBlocks;
}

export async function discoverBlocks(org, repo, token = null) {
  const api = new GitHubAPI(org, repo, 'main', token);
  const allBlocks = await api.discoverBlocks();

  const excludedBlocks = new Set(['header', 'footer']);

  try {
    const autoBlocks = await detectAutoBlocks(api);
    if (autoBlocks.size > 0) {
      // eslint-disable-next-line no-console
      console.log('Auto-blocks detected from scripts.js:', Array.from(autoBlocks));
      autoBlocks.forEach((blockName) => excludedBlocks.add(blockName));
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Could not detect auto-blocks from scripts.js:', error.message);
  }

  const filteredBlocks = allBlocks.filter((block) => !excludedBlocks.has(block.name));
  const excluded = allBlocks.filter((block) => excludedBlocks.has(block.name));

  if (excluded.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`Excluded ${excluded.length} block(s) from library:`, excluded.map((b) => b.name));
  }

  return filteredBlocks.map((block) => ({
    ...block,
    isAutoBlock: false,
  }));
}
