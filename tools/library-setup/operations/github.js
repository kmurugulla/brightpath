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
    // ignore
  }
  return null;
}

export async function validateRepository(org, repo, token = null) {
  const api = new GitHubAPI(org, repo, 'main', token);
  return api.validateAccess();
}

async function findScriptsFile(api) {
  try {
    const url = `https://api.github.com/repos/${api.org}/${api.repo}/git/trees/${api.branch}?recursive=1`;
    const response = await fetch(url, { headers: GitHubAPI.getHeaders(api.token) });

    if (!response.ok) return null;

    const data = await response.json();
    const scriptsPattern = /(^|\/)scripts\/scripts\.js$/;
    const scriptsFile = data.tree.find((item) => scriptsPattern.test(item.path) && item.type === 'blob');

    return scriptsFile ? scriptsFile.path : null;
  } catch (error) {
    return null;
  }
}

async function detectAutoBlocks(api) {
  const autoBlocks = new Set();

  try {
    const scriptsPath = await findScriptsFile(api);
    if (!scriptsPath) return autoBlocks;

    const scriptsContent = await api.getFileContent(scriptsPath);
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
    // ignore
  }

  return autoBlocks;
}

export async function discoverBlocks(org, repo, token = null) {
  const api = new GitHubAPI(org, repo, 'main', token);
  const allBlocks = await api.discoverBlocks();

  const excludedBlocks = new Set(['header', 'footer', 'fragment']);

  try {
    const autoBlocks = await detectAutoBlocks(api);
    if (autoBlocks.size > 0) {
      autoBlocks.forEach((blockName) => excludedBlocks.add(blockName));
    }
  } catch (error) {
    // ignore
  }

  const filteredBlocks = allBlocks.filter((block) => !excludedBlocks.has(block.name));

  return filteredBlocks.map((block) => ({
    ...block,
    isAutoBlock: false,
  }));
}
