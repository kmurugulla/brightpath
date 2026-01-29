import state from '../app/state.js';
import { LIBRARY_BLOCKS_PATH, CONTENT_DA_LIVE_BASE } from '../config.js';

const DA_ADMIN = 'https://admin.da.live';

async function daFetch(url, options = {}) {
  const token = state.daToken;

  const headers = {
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  return response;
}

export async function fetchSiteConfig(org, site) {
  const url = `${DA_ADMIN}/config/${org}/${site}`;

  try {
    const response = await daFetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch config.json: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    return null;
  }
}

async function checkBlockDocExists(org, site, blockName) {
  const path = `/${org}/${site}/library/blocks/${blockName}`;
  const url = `${DA_ADMIN}/source${path}.html`;

  try {
    const response = await daFetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function createBlockDocVersion(org, site, blockName) {
  const path = `/${org}/${site}/library/blocks/${blockName}`;
  const url = `${DA_ADMIN}/versionsource${path}.html`;

  try {
    const response = await daFetch(url, { method: 'POST' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function uploadBlockDoc(org, site, blockName, htmlContent) {
  const path = `/${org}/${site}/library/blocks/${blockName}`;
  const url = `${DA_ADMIN}/source${path}.html`;

  try {
    const exists = await checkBlockDocExists(org, site, blockName);
    if (exists) {
      await createBlockDocVersion(org, site, blockName);
    }

    const formData = new FormData();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    formData.set('data', blob);

    const response = await daFetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
    }

    return {
      success: true,
      path,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      path,
      error: error.message,
    };
  }
}

export async function fetchBlocksJSON(org, site) {
  let path = `${org}/${site}/library/blocks.json`;

  const config = await fetchSiteConfig(org, site);
  if (config?.library?.data) {
    const blocksEntry = config.library.data.find((entry) => entry.title === 'Blocks');
    if (blocksEntry?.path) {
      path = blocksEntry.path.replace('https://content.da.live/', '');
    }
  }

  const url = `${DA_ADMIN}/source/${path}`;

  try {
    const response = await daFetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch blocks.json: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    return null;
  }
}

export async function updateBlocksJSON(org, site, config) {
  let path = `${org}/${site}/library/blocks.json`;

  const siteConfig = await fetchSiteConfig(org, site);
  if (siteConfig?.library?.data) {
    const blocksEntry = siteConfig.library.data.find((entry) => entry.title === 'Blocks');
    if (blocksEntry?.path) {
      path = blocksEntry.path.replace('https://content.da.live/', '');
    }
  }

  const url = `${DA_ADMIN}/source/${path}`;

  try {
    const formData = new FormData();
    const blob = new Blob([JSON.stringify(config)], { type: 'application/json' });
    formData.set('data', blob);

    const response = await daFetch(url, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to update blocks.json: ${response.status}`);
    }

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function batchUploadBlocks(org, site, blocks, onProgress, batchSize = 5) {
  const results = [];
  let processed = 0;

  const batches = [];
  for (let i = 0; i < blocks.length; i += batchSize) {
    batches.push({
      blocks: blocks.slice(i, i + batchSize),
      startIndex: i,
    });
  }

  await batches.reduce(async (previousPromise, { blocks: batch, startIndex }) => {
    await previousPromise;

    const processBatch = async (block, batchIndex) => {
      const currentIndex = startIndex + batchIndex;
      if (onProgress) {
        onProgress({
          current: currentIndex + 1,
          total: blocks.length,
          blockName: block.name,
          status: 'uploading',
        });
      }

      const result = await uploadBlockDoc(
        org,
        site,
        block.name,
        block.html,
      );
      processed += 1;

      if (onProgress) {
        onProgress({
          current: processed,
          total: blocks.length,
          blockName: block.name,
          status: result.success ? 'success' : 'error',
        });
      }

      return {
        name: block.name,
        ...result,
      };
    };

    const batchResults = await Promise.all(batch.map(processBatch));
    results.push(...batchResults);
  }, Promise.resolve());

  return results;
}

export async function validateSite(org, site) {
  const url = `https://admin.hlx.page/config/${org}/sites/${site}.json`;

  try {
    const response = await daFetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    return false;
  }
}

export async function updateSiteConfig(org, site, config) {
  const url = `${DA_ADMIN}/config/${org}/${site}`;

  try {
    const formData = new FormData();
    formData.append('config', JSON.stringify(config));

    const response = await daFetch(url, {
      method: 'PUT',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to update config.json: ${response.status}`);
    }

    return {
      success: true,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function registerLibrary(org, site) {
  try {
    let config = await fetchSiteConfig(org, site);
    const blocksPath = `${CONTENT_DA_LIVE_BASE}/${org}/${site}/${LIBRARY_BLOCKS_PATH}.json`;
    let wasCreated = false;

    if (!config) {
      config = {
        ':version': 3,
        ':names': ['library'],
        ':type': 'multi-sheet',
        library: {
          total: 1,
          limit: 1,
          offset: 0,
          data: [
            {
              title: 'Blocks',
              path: blocksPath,
            },
          ],
        },
      };

      const result = await updateSiteConfig(org, site, config);
      return {
        success: result.success,
        created: true,
        error: result.error,
      };
    }

    const configType = config[':type'];

    if (configType === 'sheet') {
      const existingData = config.data || [];
      const existingColWidths = config[':colWidths'];

      config = {
        ':version': 3,
        ':names': ['data', 'library'],
        ':type': 'multi-sheet',
        data: {
          total: existingData.length,
          limit: existingData.length,
          offset: 0,
          data: existingData,
        },
        library: {
          total: 1,
          limit: 1,
          offset: 0,
          data: [
            {
              title: 'Blocks',
              path: blocksPath,
            },
          ],
        },
      };

      if (existingColWidths) {
        config.data[':colWidths'] = existingColWidths;
      }

      wasCreated = true;
    } else if (configType === 'multi-sheet') {
      if (!config.library) {
        if (!config[':names'].includes('library')) {
          config[':names'].push('library');
        }

        config.library = {
          total: 1,
          limit: 1,
          offset: 0,
          data: [
            {
              title: 'Blocks',
              path: blocksPath,
            },
          ],
        };

        wasCreated = true;
      } else {
        const libraryData = config.library.data || [];
        const blocksIndex = libraryData.findIndex((entry) => entry.title === 'Blocks');

        if (blocksIndex === -1) {
          libraryData.push({
            title: 'Blocks',
            path: blocksPath,
          });

          config.library.data = libraryData;
          config.library.total = libraryData.length;
          config.library.limit = libraryData.length;
          wasCreated = true;
        } else {
          const existingPath = libraryData[blocksIndex].path;
          if (existingPath === blocksPath) {
            return {
              success: true,
              created: false,
              error: null,
            };
          }

          libraryData[blocksIndex].path = blocksPath;
          config.library.data = libraryData;
        }
      }
    } else {
      config = {
        ':version': 3,
        ':names': ['library'],
        ':type': 'multi-sheet',
        library: {
          total: 1,
          limit: 1,
          offset: 0,
          data: [
            {
              title: 'Blocks',
              path: blocksPath,
            },
          ],
        },
      };

      wasCreated = true;
    }

    if (!config[':version']) {
      config[':version'] = 3;
    }

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      created: wasCreated,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      created: false,
      error: error.message,
    };
  }
}
