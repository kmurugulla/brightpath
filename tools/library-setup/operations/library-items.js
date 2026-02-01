export function normalizeIdentifier(str) {
  return str.toLowerCase().trim().replace(/\s+/g, '-');
}

export function mergeLibraryItems(existingItems, newItems, identifierKey) {
  if (!existingItems || existingItems.length === 0) {
    return {
      merged: newItems,
      added: newItems.length,
      skipped: 0,
      existing: 0,
    };
  }

  const existingMap = new Map(
    existingItems.map((item) => [
      normalizeIdentifier(item[identifierKey]),
      item,
    ]),
  );

  const newItemsSet = new Set(
    newItems.map((item) => normalizeIdentifier(item[identifierKey])),
  );

  const preserved = existingItems.filter(
    (item) => !newItemsSet.has(normalizeIdentifier(item[identifierKey])),
  );

  const itemsToAdd = newItems.filter(
    (item) => !existingMap.has(normalizeIdentifier(item[identifierKey])),
  );

  return {
    merged: [...preserved, ...itemsToAdd],
    added: itemsToAdd.length,
    skipped: newItems.length - itemsToAdd.length,
    existing: existingItems.length,
  };
}
