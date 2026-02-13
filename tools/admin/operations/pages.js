import state from '../app/state.js';

const DA_ADMIN = 'https://admin.da.live';

async function daFetch(url) {
  const token = state.daToken;

  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

export async function fetchSitePages(org, site) {
  const url = `${DA_ADMIN}/list/${org}/${site}/`;
  const items = await daFetch(url);

  if (!Array.isArray(items)) {
    return [];
  }

  const result = items.filter((item) => !item.ext || item.ext === 'html');

  return result;
}

export async function loadFolderContents(org, site, path) {
  try {
    const prefix = `/${org}/${site}`;
    const relativePath = path.startsWith(prefix) ? path.substring(prefix.length) : path;
    const url = `${DA_ADMIN}/list/${org}/${site}${relativePath}`;

    const items = await daFetch(url);

    if (!Array.isArray(items)) {
      return [];
    }

    return items;
  } catch (error) {
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
