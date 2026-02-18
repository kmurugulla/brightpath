/**
 * Resolve the main data array from a sheet/multi-sheet JSON using :names.
 * Works regardless of the sheet name (data, blocks, bla, etc.).
 * @param {object} json - Parsed sheet or multi-sheet JSON
 * @param {string[]} [excludeNames=['options']] - Sheet names to skip (e.g. options)
 * @returns {unknown[]} The data array, or [] if none found
 */
export function getSheetDataArray(json, excludeNames = ['options']) {
  const names = json?.[':names'];
  if (Array.isArray(names)) {
    for (const name of names) {
      if (excludeNames.includes(name)) continue;
      const sheet = json[name];
      if (sheet == null) continue;
      const arr = sheet?.data ?? (Array.isArray(sheet) ? sheet : null);
      if (Array.isArray(arr)) return arr;
    }
    return [];
  }
  const fallback = json?.data?.data || json?.data || [];
  return Array.isArray(fallback) ? fallback : [];
}
