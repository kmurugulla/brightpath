import { fetchPlaceholdersJSON, updatePlaceholdersJSON } from '../utils/da-api.js';
import { getSheetDataArray } from '../utils/sheet-json.js';
import { mergeLibraryItems, normalizeIdentifier } from './library-items.js';

export async function removeLibraryPlaceholder(org, site, placeholderKey) {
  const existingJSON = await fetchPlaceholdersJSON(org, site);
  const existingData = getSheetDataArray(existingJSON);
  const targetId = normalizeIdentifier(placeholderKey);
  const merged = existingData.filter(
    (item) => normalizeIdentifier(item.key) !== targetId,
  );
  if (merged.length === existingData.length) {
    return { success: true, removed: false };
  }
  const placeholdersJSON = {
    ':version': 3,
    ':type': 'sheet',
    total: merged.length,
    limit: merged.length,
    offset: 0,
    data: merged,
  };
  const updateResult = await updatePlaceholdersJSON(org, site, placeholdersJSON);
  return { ...updateResult, removed: true };
}

export async function updateLibraryPlaceholdersJSON(org, site, placeholders) {
  const existingJSON = await fetchPlaceholdersJSON(org, site);
  const existingData = getSheetDataArray(existingJSON);

  const normalizedNew = placeholders.map((p) => ({
    key: p.value,
    value: p.key,
  }));

  const mergeResult = mergeLibraryItems(existingData, normalizedNew, 'value');

  const placeholdersJSON = {
    ':version': 3,
    ':type': 'sheet',
    total: mergeResult.merged.length,
    limit: mergeResult.merged.length,
    offset: 0,
    data: mergeResult.merged,
  };

  const updateResult = await updatePlaceholdersJSON(org, site, placeholdersJSON);

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
