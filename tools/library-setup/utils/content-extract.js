import state from '../app/state.js';

const DA_SOURCE = 'https://admin.da.live/source';

async function fetchPageHTML(org, site, pagePath) {
  const token = state.daToken;
  const htmlPath = pagePath.endsWith('.html') ? pagePath : `${pagePath}.html`;
  const cleanPath = htmlPath.startsWith('/') ? htmlPath.slice(1) : htmlPath;
  const url = `${DA_SOURCE}/${cleanPath}`;

  // eslint-disable-next-line no-console
  console.log('Fetching page content:', url);

  const response = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    // eslint-disable-next-line no-console
    console.error(`Failed to fetch ${htmlPath}: ${response.status}`);
    throw new Error(`Failed to fetch page ${pagePath}: ${response.status}`);
  }

  const html = await response.text();
  // eslint-disable-next-line no-console
  console.log(`Fetched ${htmlPath}, length: ${html.length} chars`);

  return html;
}

function extractBlocksFromHTML(html, blockName) {
  const instances = [];
  const openTagRegex = new RegExp(`<div([^>]*class="[^"]*\\b${blockName}\\b[^"]*"[^>]*)>`, 'gi');

  // eslint-disable-next-line no-console
  console.log(`Looking for blocks with class: ${blockName}`);

  const matches = Array.from(html.matchAll(openTagRegex));

  matches.forEach((match) => {
    const openTag = match[0];
    const attributes = match[1];
    const startPos = match.index + openTag.length;

    const classMatch = attributes.match(/class="([^"]*)"/);
    const classes = classMatch ? classMatch[1].split(/\s+/) : [];
    const variant = classes.find((cls) => cls !== blockName && cls !== 'block' && cls !== 'section') || '';

    let depth = 1;
    let pos = startPos;
    const divOpenRegex = /<div[^>]*>/g;
    const divCloseRegex = /<\/div>/g;

    while (depth > 0 && pos < html.length) {
      divOpenRegex.lastIndex = pos;
      divCloseRegex.lastIndex = pos;

      const nextOpen = divOpenRegex.exec(html);
      const nextClose = divCloseRegex.exec(html);

      if (!nextClose) break;

      if (nextOpen && nextOpen.index < nextClose.index) {
        depth += 1;
        pos = nextOpen.index + nextOpen[0].length;
      } else {
        depth -= 1;
        if (depth === 0) {
          const content = html.substring(startPos, nextClose.index).trim();
          if (content) {
            instances.push({
              html: content,
              variant,
            });
            // eslint-disable-next-line no-console
            console.log(`  Found ${blockName} (${variant || 'default'}), content length: ${content.length}`);
          }
          break;
        }
        pos = nextClose.index + nextClose[0].length;
      }
    }
  });

  return instances;
}

export async function extractExamplesWithProgress(sitesWithPages, blockNames, onProgress) {
  const examplesByBlock = {};

  blockNames.forEach((blockName) => {
    examplesByBlock[blockName] = [];
  });

  const pagesList = sitesWithPages
    .filter(({ pages }) => pages && pages.length > 0)
    .flatMap(({ org, site, pages }) => pages.map((pagePath) => ({ org, site, pagePath })));

  const totalPages = pagesList.length;
  let processed = 0;

  await pagesList.reduce(async (previousPromise, { org, site, pagePath }) => {
    await previousPromise;

    try {
      if (onProgress) {
        onProgress({
          current: processed + 1,
          total: totalPages,
          site,
          page: pagePath,
        });
      }

      const html = await fetchPageHTML(org, site, pagePath);

      blockNames.forEach((blockName) => {
        const instances = extractBlocksFromHTML(html, blockName);

        instances.forEach((instance) => {
          examplesByBlock[blockName].push({
            ...instance,
            source: {
              site,
              page: pagePath,
            },
          });
        });
      });

      processed += 1;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Error extracting from ${pagePath}:`, error.message);
      processed += 1;
    }
  }, Promise.resolve());

  // eslint-disable-next-line no-console
  console.log('Extraction complete. Summary:');
  blockNames.forEach((blockName) => {
    const count = examplesByBlock[blockName].length;
    // eslint-disable-next-line no-console
    console.log(`  ${blockName}: ${count} examples found`);
  });

  return examplesByBlock;
}
