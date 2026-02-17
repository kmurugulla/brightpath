import { fetchIconsJSON, updateIconsJSON } from '../utils/da-api.js';
import { mergeLibraryItems, normalizeIdentifier } from './library-items.js';

export async function removeLibraryIcon(org, site, iconKey) {
  const existingJSON = await fetchIconsJSON(org, site);
  const existingData = existingJSON?.data?.data || existingJSON?.data || [];
  const targetId = normalizeIdentifier(iconKey);
  const merged = existingData.filter(
    (item) => normalizeIdentifier(item.key) !== targetId,
  );
  if (merged.length === existingData.length) {
    return { success: true, removed: false };
  }
  const iconsJSON = {
    ':version': 3,
    ':type': 'sheet',
    total: merged.length,
    limit: merged.length,
    offset: 0,
    data: merged,
  };
  const updateResult = await updateIconsJSON(org, site, iconsJSON);
  return { ...updateResult, removed: true };
}

// eslint-disable-next-line import/prefer-default-export
export async function updateLibraryIconsJSON(org, site, icons) {
  const existingJSON = await fetchIconsJSON(org, site);
  const existingData = existingJSON?.data?.data || existingJSON?.data || [];

  const normalizedNew = icons.map((icon) => {
    let iconPath = icon.path;

    if (iconPath.startsWith('https://')) {
      return {
        key: icon.name,
        icon: iconPath,
      };
    }

    const orgSitePrefix = `/${org}/${site}`;
    if (iconPath.startsWith(orgSitePrefix)) {
      iconPath = iconPath.substring(orgSitePrefix.length);
    }

    return {
      key: icon.name,
      icon: `https://content.da.live/${org}/${site}${iconPath}`,
    };
  });

  const mergeResult = mergeLibraryItems(existingData, normalizedNew, 'key');

  const iconsJSON = {
    ':version': 3,
    ':type': 'sheet',
    total: mergeResult.merged.length,
    limit: mergeResult.merged.length,
    offset: 0,
    data: mergeResult.merged,
  };

  const updateResult = await updateIconsJSON(org, site, iconsJSON);

  return {
    ...updateResult,
    stats: {
      added: mergeResult.added,
      skipped: mergeResult.skipped,
      existing: mergeResult.existing,
      total: mergeResult.merged.length,
    },
  };
}
