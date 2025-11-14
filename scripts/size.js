#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'child_process';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { gzipSync } from 'zlib';

const cyan = '\x1b[96m';
const reset = '\x1b[0m';
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frameIndex = 0;
const spinner = setInterval(() => {
  process.stdout.write(`\r${cyan}${frames[frameIndex]}${reset} Checking file sizes...`);
  frameIndex = (frameIndex + 1) % frames.length;
}, 80);

const bundlesize = spawn('npx', ['bundlesize'], {
  stdio: 'pipe',
});

let output = '';
bundlesize.stdout.on('data', (data) => {
  output += data.toString();
});
bundlesize.stderr.on('data', (data) => {
  output += data.toString();
});

bundlesize.on('close', () => {
  clearInterval(spinner);
  process.stdout.write('\r\x1b[K');

  const results = [];
  let allPassed = true;

  const lines = output.split('\n');
  lines.forEach((line) => {
    const passMatch = line.match(/PASS\s+(.+?):\s+(.+?)\s+<\s+maxSize\s+(.+?)\s+\(gzip\)/);
    const failMatch = line.match(/FAIL\s+(.+?):\s+(.+?)\s+>\s+maxSize\s+(.+?)\s+\(gzip\)/);

    if (passMatch) {
      results.push({
        status: '✓ PASS',
        file: passMatch[1],
        size: passMatch[2],
        limit: passMatch[3],
        passed: true,
      });
    } else if (failMatch) {
      results.push({
        status: '✗ FAIL',
        file: failMatch[1],
        size: failMatch[2],
        limit: failMatch[3],
        passed: false,
      });
      allPassed = false;
    }
  });

  const fonts = [];
  try {
    const fontFiles = readdirSync('fonts').filter((f) => f.endsWith('.woff2'));
    fontFiles.forEach((file) => {
      const filePath = join('fonts', file);
      const content = readFileSync(filePath);
      const gzipped = gzipSync(content);
      const sizeKB = (gzipped.length / 1024).toFixed(2);
      const maxSize = 100;
      const passed = gzipped.length <= maxSize * 1024;

      fonts.push({
        status: passed ? '✓ PASS' : '✗ FAIL',
        file: `./${filePath}`,
        size: `${sizeKB}KB`,
        limit: `${maxSize}KB`,
        passed,
      });

      if (!passed) allPassed = false;
    });
  } catch (error) {
    // No fonts directory, skip
  }

  console.log('┌────────────────────────────────────────────────────────────┬──────────┬────────────────────────┐');
  console.log('│ File                                                       │ Status   │ Size → Limit           │');
  console.log('├────────────────────────────────────────────────────────────┼──────────┼────────────────────────┤');

  [...results, ...fonts].forEach((result) => {
    const filePadded = result.file.padEnd(58);
    const statusPadded = result.status.padEnd(8);
    const sizePadded = `${result.size} → ${result.limit}`.padEnd(22);
    console.log(`│ ${filePadded} │ ${statusPadded} │ ${sizePadded} │`);
  });

  console.log('└────────────────────────────────────────────────────────────┴──────────┴────────────────────────┘\n');

  if (allPassed) {
    console.log('✅ All file size checks passed!\n');
    process.exit(0);
  } else {
    console.log('❌ File size checks failed. Please reduce file sizes.\n');
    process.exit(1);
  }
});
