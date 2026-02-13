import * as daApi from '../utils/da-api.js';

export async function fetchExistingTemplates(org, site) {
  try {
    const json = await daApi.fetchTemplatesJSON(org, site);
    const data = json?.data?.data || json?.data || [];
    return data.map((item) => ({
      name: item.key,
      path: item.value,
    }));
  } catch (error) {
    return [];
  }
}

export async function fetchExistingIcons(org, site) {
  try {
    const json = await daApi.fetchIconsJSON(org, site);
    const data = json?.data?.data || json?.data || [];
    return data.map((item) => ({
      name: item.key,
      path: item.icon,
    }));
  } catch (error) {
    return [];
  }
}

export async function fetchExistingPlaceholders(org, site) {
  try {
    const json = await daApi.fetchPlaceholdersJSON(org, site);
    const data = json?.data?.data || json?.data || [];
    return data.map((item) => ({
      key: item.value,
      value: item.key,
    }));
  } catch (error) {
    return [];
  }
}

export function filterItems(items, query, type) {
  if (!query.trim()) return items;

  const lowerQuery = query.toLowerCase();

  if (type === 'placeholders') {
    return items.filter((item) => item.key.toLowerCase().includes(lowerQuery)
      || item.value.toLowerCase().includes(lowerQuery));
  }

  return items.filter((item) => item.name.toLowerCase().includes(lowerQuery)
    || item.path.toLowerCase().includes(lowerQuery));
}
