import state from '../app/state.js';
import { LIBRARY_BLOCKS_PATH, CONTENT_DA_LIVE_BASE } from '../config.js';

const DA_ADMIN = 'https://admin.da.live';

// Library item order priority (Blocks must always be first)
const LIBRARY_ORDER = {
  Blocks: 0,
  Templates: 1,
  Icons: 2,
  Placeholders: 3,
};

function sortLibraryData(libraryData) {
  return libraryData.sort((a, b) => {
    const orderA = LIBRARY_ORDER[a.title] ?? 999;
    const orderB = LIBRARY_ORDER[b.title] ?? 999;
    return orderA - orderB;
  });
}

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

export async function registerTemplatesInConfig(org, site) {
  try {
    const config = await fetchSiteConfig(org, site);
    const templatesPath = `${CONTENT_DA_LIVE_BASE}/${org}/${site}/library/templates.json`;

    if (!config || !config.library) {
      return {
        success: false,
        error: 'Site config not initialized. Run Blocks setup first.',
      };
    }

    const libraryData = config.library.data || [];
    const templatesIndex = libraryData.findIndex((entry) => entry.title === 'Templates');

    if (templatesIndex === -1) {
      libraryData.push({
        title: 'Templates',
        path: templatesPath,
      });
    } else {
      libraryData[templatesIndex].path = templatesPath;
    }

    // Ensure correct order (Blocks must be first)
    const sortedData = sortLibraryData(libraryData);
    config.library.data = sortedData;
    config.library.total = sortedData.length;
    config.library.limit = sortedData.length;

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function uploadTemplateDoc(org, site, templateName, sourcePath) {
  const sourceUrl = `${DA_ADMIN}/source/${org}/${site}${sourcePath}.html`;
  const targetPath = `/${org}/${site}/library/templates/${templateName}`;
  const targetUrl = `${DA_ADMIN}/source${targetPath}.html`;

  try {
    const sourceResponse = await daFetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error(`Failed to fetch source page: ${sourceResponse.status}`);
    }

    const htmlContent = await sourceResponse.text();

    const formData = new FormData();
    const blob = new Blob([htmlContent], { type: 'text/html' });
    formData.set('data', blob);

    const targetResponse = await daFetch(targetUrl, {
      method: 'POST',
      body: formData,
    });

    if (!targetResponse.ok) {
      throw new Error(`Upload failed: ${targetResponse.status}`);
    }

    return {
      success: true,
      path: targetPath,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      path: targetPath,
      error: error.message,
    };
  }
}

export async function fetchTemplatesJSON(org, site) {
  const path = `${org}/${site}/library/templates.json`;
  const url = `${DA_ADMIN}/source/${path}`;

  try {
    const response = await daFetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch templates.json: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    return null;
  }
}

export async function updateTemplatesJSON(org, site, config) {
  const path = `${org}/${site}/library/templates.json`;
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
      throw new Error(`Failed to update templates.json: ${response.status}`);
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

export async function fetchIconsJSON(org, site) {
  const path = `${org}/${site}/library/icons.json`;
  const url = `${DA_ADMIN}/source/${path}`;

  try {
    const response = await daFetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch icons.json: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    return null;
  }
}

export async function updateIconsJSON(org, site, config) {
  const path = `${org}/${site}/library/icons.json`;
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
      throw new Error(`Failed to update icons.json: ${response.status}`);
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

export async function uploadIconDoc(org, site, iconName, sourcePath) {
  const sourceUrl = `${DA_ADMIN}/source/${org}/${site}${sourcePath}`;
  const targetPath = `/${org}/${site}/library/icons/${iconName}`;
  const targetUrl = `${DA_ADMIN}/source${targetPath}.svg`;

  try {
    const sourceResponse = await daFetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error(`Failed to fetch source icon: ${sourceResponse.status}`);
    }

    const svgContent = await sourceResponse.text();

    const formData = new FormData();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    formData.set('data', blob);

    const targetResponse = await daFetch(targetUrl, {
      method: 'POST',
      body: formData,
    });

    if (!targetResponse.ok) {
      throw new Error(`Upload failed: ${targetResponse.status}`);
    }

    return {
      success: true,
      path: targetPath,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      path: targetPath,
      error: error.message,
    };
  }
}

export async function fetchPlaceholdersJSON(org, site) {
  const path = `${org}/${site}/placeholders.json`;
  const url = `${DA_ADMIN}/source/${path}`;

  try {
    const response = await daFetch(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch placeholders.json: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    return null;
  }
}

export async function updatePlaceholdersJSON(org, site, config) {
  const path = `${org}/${site}/placeholders.json`;
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
      throw new Error(`Failed to update placeholders.json: ${response.status}`);
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

export async function registerIconsInConfig(org, site) {
  try {
    const config = await fetchSiteConfig(org, site);
    const iconsPath = `${CONTENT_DA_LIVE_BASE}/${org}/${site}/library/icons.json`;

    if (!config || !config.library) {
      return {
        success: false,
        error: 'Site config not initialized. Run Blocks setup first.',
      };
    }

    const libraryData = config.library.data || [];
    const iconsIndex = libraryData.findIndex((entry) => entry.title === 'Icons');

    if (iconsIndex === -1) {
      libraryData.push({
        title: 'Icons',
        path: iconsPath,
        format: ':<content>:',
      });
    } else {
      libraryData[iconsIndex].path = iconsPath;
      libraryData[iconsIndex].format = ':<content>:';
    }

    // Ensure correct order (Blocks must be first)
    const sortedData = sortLibraryData(libraryData);
    config.library.data = sortedData;
    config.library.total = sortedData.length;
    config.library.limit = sortedData.length;

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function registerPlaceholdersInConfig(org, site) {
  try {
    const config = await fetchSiteConfig(org, site);
    const placeholdersPath = `${CONTENT_DA_LIVE_BASE}/${org}/${site}/placeholders.json`;

    if (!config || !config.library) {
      return {
        success: false,
        error: 'Site config not initialized. Run Blocks setup first.',
      };
    }

    const libraryData = config.library.data || [];
    const placeholdersIndex = libraryData.findIndex((entry) => entry.title === 'Placeholders');

    if (placeholdersIndex === -1) {
      libraryData.push({
        title: 'Placeholders',
        path: placeholdersPath,
        format: '{{<content>}}',
      });
    } else {
      libraryData[placeholdersIndex].path = placeholdersPath;
      libraryData[placeholdersIndex].format = '{{<content>}}';
    }

    // Ensure correct order (Blocks must be first)
    const sortedData = sortLibraryData(libraryData);
    config.library.data = sortedData;
    config.library.total = sortedData.length;
    config.library.limit = sortedData.length;

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchAemAssetsConfig(org, site) {
  try {
    const config = await fetchSiteConfig(org, site);
    if (!config || !config.data || !config.data.data) {
      return {
        repositoryId: '',
        prodOrigin: '',
        imageType: false,
        renditionsSelect: false,
        dmDelivery: false,
        smartCropSelect: false,
      };
    }

    const dataItems = config.data.data;
    const configMap = new Map(dataItems.map((item) => [item.key, item.value]));

    return {
      repositoryId: configMap.get('aem.repositoryId') || '',
      prodOrigin: configMap.get('aem.assets.prod.origin') || '',
      imageType: configMap.get('aem.assets.image.type') === 'link',
      renditionsSelect: configMap.get('aem.assets.renditions.select') === 'on',
      dmDelivery: configMap.get('aem.asset.dm.delivery') === 'on',
      smartCropSelect: configMap.get('aem.asset.smartcrop.select') === 'on',
    };
  } catch (error) {
    return {
      repositoryId: '',
      prodOrigin: '',
      imageType: false,
      renditionsSelect: false,
      dmDelivery: false,
      smartCropSelect: false,
    };
  }
}

export async function updateAemAssetsConfig(org, site, aemConfig) {
  try {
    let config = await fetchSiteConfig(org, site);

    if (!config) {
      config = {
        ':version': 3,
        ':type': 'multi-sheet',
        ':names': ['data'],
        data: {
          total: 0,
          limit: 0,
          offset: 0,
          data: [],
        },
      };
    }

    if (!config.data) {
      config.data = {
        total: 0,
        limit: 0,
        offset: 0,
        data: [],
      };
    }

    if (!config.data.data) {
      config.data.data = [];
    }

    const dataItems = [...config.data.data];
    const aemKeys = [
      'aem.repositoryId',
      'aem.assets.prod.origin',
      'aem.assets.image.type',
      'aem.assets.renditions.select',
      'aem.asset.dm.delivery',
      'aem.asset.smartcrop.select',
    ];

    const filteredData = dataItems.filter((item) => !aemKeys.includes(item.key));

    if (aemConfig.repositoryId) {
      filteredData.push({
        key: 'aem.repositoryId',
        value: aemConfig.repositoryId,
      });
    }

    if (aemConfig.prodOrigin) {
      filteredData.push({
        key: 'aem.assets.prod.origin',
        value: aemConfig.prodOrigin,
      });
    }

    if (aemConfig.imageType) {
      filteredData.push({
        key: 'aem.assets.image.type',
        value: 'link',
      });
    }

    if (aemConfig.renditionsSelect) {
      filteredData.push({
        key: 'aem.assets.renditions.select',
        value: 'on',
      });
    }

    if (aemConfig.dmDelivery) {
      filteredData.push({
        key: 'aem.asset.dm.delivery',
        value: 'on',
      });
    }

    if (aemConfig.smartCropSelect) {
      filteredData.push({
        key: 'aem.asset.smartcrop.select',
        value: 'on',
      });
    }

    config.data.data = filteredData;
    config.data.total = filteredData.length;
    config.data.limit = filteredData.length;

    if (!config[':names']) {
      config[':names'] = ['data'];
    }
    if (!config[':names'].includes('data')) {
      config[':names'].push('data');
    }

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchTranslationConfig(org, site) {
  try {
    const config = await fetchSiteConfig(org, site);
    if (!config || !config.data || !config.data.data) {
      return {
        translateBehavior: 'overwrite',
        translateStaging: 'off',
        rolloutBehavior: 'overwrite',
      };
    }

    const dataItems = config.data.data;
    const configMap = new Map(dataItems.map((item) => [item.key, item.value]));

    return {
      translateBehavior: configMap.get('translate.behavior') || 'overwrite',
      translateStaging: configMap.get('translate.staging') || 'off',
      rolloutBehavior: configMap.get('rollout.behavior') || 'overwrite',
    };
  } catch (error) {
    return {
      translateBehavior: 'overwrite',
      translateStaging: 'off',
      rolloutBehavior: 'overwrite',
    };
  }
}

export async function updateTranslationConfig(org, site, translationConfig) {
  try {
    let config = await fetchSiteConfig(org, site);

    if (!config) {
      config = {
        ':version': 3,
        ':type': 'multi-sheet',
        ':names': ['data'],
        data: {
          total: 0,
          limit: 0,
          offset: 0,
          data: [],
        },
      };
    }

    if (!config.data) {
      config.data = {
        total: 0,
        limit: 0,
        offset: 0,
        data: [],
      };
    }

    if (!config.data.data) {
      config.data.data = [];
    }

    const dataItems = [...config.data.data];
    const translationKeys = [
      'translate.behavior',
      'translate.staging',
      'rollout.behavior',
    ];

    const filteredData = dataItems.filter((item) => !translationKeys.includes(item.key));

    filteredData.push({
      key: 'translate.behavior',
      value: translationConfig.translateBehavior,
    });

    filteredData.push({
      key: 'translate.staging',
      value: translationConfig.translateStaging,
    });

    filteredData.push({
      key: 'rollout.behavior',
      value: translationConfig.rolloutBehavior,
    });

    config.data.data = filteredData;
    config.data.total = filteredData.length;
    config.data.limit = filteredData.length;

    if (!config[':names']) {
      config[':names'] = ['data'];
    }
    if (!config[':names'].includes('data')) {
      config[':names'].push('data');
    }

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export async function fetchUniversalEditorConfig(org, site) {
  try {
    const config = await fetchSiteConfig(org, site);
    if (!config || !config.data || !config.data.data) {
      return {
        editorPath: '',
      };
    }

    const dataItems = config.data.data;
    const configMap = new Map(dataItems.map((item) => [item.key, item.value]));

    return {
      editorPath: configMap.get('editor.path') || '',
    };
  } catch (error) {
    return {
      editorPath: '',
    };
  }
}

export async function updateUniversalEditorConfig(org, site, ueConfig) {
  try {
    let config = await fetchSiteConfig(org, site);

    if (!config) {
      config = {
        ':version': 3,
        ':type': 'multi-sheet',
        ':names': ['data'],
        data: {
          total: 0,
          limit: 0,
          offset: 0,
          data: [],
        },
      };
    }

    if (!config.data) {
      config.data = {
        total: 0,
        limit: 0,
        offset: 0,
        data: [],
      };
    }

    if (!config.data.data) {
      config.data.data = [];
    }

    const dataItems = [...config.data.data];
    const ueKeys = ['editor.path'];

    const filteredData = dataItems.filter((item) => !ueKeys.includes(item.key));

    if (ueConfig.editorPath) {
      filteredData.push({
        key: 'editor.path',
        value: ueConfig.editorPath,
      });
    }

    config.data.data = filteredData;
    config.data.total = filteredData.length;
    config.data.limit = filteredData.length;

    if (!config[':names']) {
      config[':names'] = ['data'];
    }
    if (!config[':names'].includes('data')) {
      config[':names'].push('data');
    }

    const result = await updateSiteConfig(org, site, config);
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
