import {
  fetchTemplatesJSON,
  updateTemplatesJSON,
} from '../utils/da-api.js';
import getSheetDataArray from '../utils/sheet-json.js';
import { mergeLibraryItems, normalizeIdentifier } from './library-items.js';

export async function removeLibraryTemplate(org, site, templateKey) {
  const existingJSON = await fetchTemplatesJSON(org, site);
  const existingData = getSheetDataArray(existingJSON);
  const targetId = normalizeIdentifier(templateKey);
  const merged = existingData.filter(
    (item) => normalizeIdentifier(item.key) !== targetId,
  );
  if (merged.length === existingData.length) {
    return { success: true, removed: false };
  }
  const templatesJSON = {
    ':version': 3,
    ':type': 'sheet',
    total: merged.length,
    limit: merged.length,
    offset: 0,
    data: merged,
  };
  const updateResult = await updateTemplatesJSON(org, site, templatesJSON);
  return { ...updateResult, removed: true };
}

// eslint-disable-next-line import/prefer-default-export
export async function updateLibraryTemplatesJSON(org, site, templates) {
  const existingJSON = await fetchTemplatesJSON(org, site);
  const existingData = getSheetDataArray(existingJSON);

  const normalizedNew = templates.map((template) => {
    let templatePath = template.path.replace(/\.html$/, '');

    if (templatePath.startsWith('https://')) {
      return {
        key: template.name,
        value: templatePath,
      };
    }

    const orgSitePrefix = `/${org}/${site}`;
    if (templatePath.startsWith(orgSitePrefix)) {
      templatePath = templatePath.substring(orgSitePrefix.length);
    }

    return {
      key: template.name,
      value: `https://content.da.live/${org}/${site}${templatePath}`,
    };
  });

  const mergeResult = mergeLibraryItems(existingData, normalizedNew, 'key');

  const templatesJSON = {
    ':version': 3,
    ':type': 'sheet',
    total: mergeResult.merged.length,
    limit: mergeResult.merged.length,
    offset: 0,
    data: mergeResult.merged,
  };

  const updateResult = await updateTemplatesJSON(org, site, templatesJSON);

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
