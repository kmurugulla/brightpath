#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BLOCKS_DIR = path.join(__dirname, 'models', 'blocks');
const OUTPUT_DIR = path.join(__dirname, 'models');

/**
 * Consolidates individual block JSON files into three main configuration files
 * required by Universal Editor:
 * - component-definitions.json
 * - component-models.json
 * - component-filters.json
 */
function buildJSON() {
  const definitions = [];
  const models = [];
  const filters = [];

  try {
    // Read all JSON files from the blocks directory
    const files = fs.readdirSync(BLOCKS_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort();

    console.log(`Found ${files.length} block configuration(s) to process:`);

    files.forEach((file) => {
      const filePath = path.join(BLOCKS_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const blockConfig = JSON.parse(content);

      console.log(`  - ${file}`);

      // Extract and merge definitions
      if (blockConfig.definitions && Array.isArray(blockConfig.definitions)) {
        definitions.push(...blockConfig.definitions);
      }

      // Extract and merge models
      if (blockConfig.models && Array.isArray(blockConfig.models)) {
        models.push(...blockConfig.models);
      }

      // Extract and merge filters
      if (blockConfig.filters && Array.isArray(blockConfig.filters)) {
        filters.push(...blockConfig.filters);
      }
    });

    // Write consolidated files
    const definitionsPath = path.join(OUTPUT_DIR, 'component-definitions.json');
    const modelsPath = path.join(OUTPUT_DIR, 'component-models.json');
    const filtersPath = path.join(OUTPUT_DIR, 'component-filters.json');

    fs.writeFileSync(
      definitionsPath,
      JSON.stringify({ definitions }, null, 2),
      'utf8',
    );

    fs.writeFileSync(
      modelsPath,
      JSON.stringify({ models }, null, 2),
      'utf8',
    );

    fs.writeFileSync(
      filtersPath,
      JSON.stringify({ filters }, null, 2),
      'utf8',
    );

    console.log('\n✅ Successfully generated consolidated JSON files:');
    console.log(`  - component-definitions.json (${definitions.length} definitions)`);
    console.log(`  - component-models.json (${models.length} models)`);
    console.log(`  - component-filters.json (${filters.length} filters)`);
  } catch (error) {
    console.error('❌ Error building JSON files:', error.message);
    process.exit(1);
  }
}

buildJSON();
