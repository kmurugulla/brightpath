import state from '../app/state.js';

const DA_ADMIN = 'https://admin.da.live';

async function daFetch(url) {
  const token = state.daToken;

  // eslint-disable-next-line no-console
  console.log('Pages fetch:', {
    url,
    hasToken: !!token,
    tokenPreview: token ? `${token.substring(0, 10)}...` : 'none',
  });

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  // eslint-disable-next-line no-console
  console.log('Pages response:', {
    url,
    status: response.status,
    ok: response.ok,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchSitePages(org, site) {
  try {
    const url = `${DA_ADMIN}/list/${org}/${site}/`;
    const items = await daFetch(url);

    if (!Array.isArray(items)) {
      return [];
    }

    const result = items.filter((item) => !item.ext || item.ext === 'html');

    // eslint-disable-next-line no-console
    console.log(`Found ${result.length} items for ${org}/${site}`);
    // eslint-disable-next-line no-console
    console.log('Sample paths:', result.slice(0, 3).map((item) => item.path));

    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to fetch site items:', error);
    throw error;
  }
}

export async function loadFolderContents(org, site, path) {
  try {
    const prefix = `/${org}/${site}`;
    const relativePath = path.startsWith(prefix) ? path.substring(prefix.length) : path;
    const url = `${DA_ADMIN}/list/${org}/${site}${relativePath}`;

    // eslint-disable-next-line no-console
    console.log('Loading folder:', {
      fullPath: path,
      relativePath,
      url,
    });

    const items = await daFetch(url);

    if (!Array.isArray(items)) {
      return [];
    }

    const result = items.filter((item) => !item.ext || item.ext === 'html');

    // eslint-disable-next-line no-console
    console.log(`Loaded folder contents for ${path}:`, result.length, 'items', result);

    return result;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Failed to load folder:', error);
    return [];
  }
}

export async function validateSite(org, site, token) {
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
}
