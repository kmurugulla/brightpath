import { fetchPlaceholdersJSON, updatePlaceholdersJSON } from '../utils/da-api.js';
import { mergeLibraryItems } from './library-items.js';

// eslint-disable-next-line import/prefer-default-export
export async function updateLibraryPlaceholdersJSON(org, site, placeholders) {
  const existingJSON = await fetchPlaceholdersJSON(org, site);
  const existingData = existingJSON?.data?.data || existingJSON?.data || [];

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
