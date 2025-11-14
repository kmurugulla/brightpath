#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const args = process.argv.slice(2);

let baseUrl = process.env.PERF_URL || 'http://localhost:3000';
const paths = [];

for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--url' && args[i + 1]) {
    baseUrl = args[i + 1];
    i += 1;
  } else {
    paths.push(args[i]);
  }
}

if (paths.length === 0) paths.push('/');

const urls = paths.map((p) => `${baseUrl}${p}`).join(', ');

const cyan = '\x1b[96m';
const reset = '\x1b[0m';
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frameIndex = 0;
const spinner = setInterval(() => {
  process.stdout.write(`\r${cyan}${frames[frameIndex]}${reset} Testing performance for ${urls}`);
  frameIndex = (frameIndex + 1) % frames.length;
}, 80);

const urlArgs = urls.split(', ').flatMap((url) => ['--url', url]);
const lhciArgs = ['lhci', 'collect', '--numberOfRuns=1', '--config', 'lighthouserc.js', ...urlArgs];

const lhci = spawn('npx', lhciArgs, {
  stdio: 'pipe',
});

let lhciError = '';
lhci.stdout.on('data', () => {});
lhci.stderr.on('data', (data) => {
  lhciError += data.toString();
});

lhci.on('close', (exitCode) => {
  clearInterval(spinner);
  process.stdout.write('\r\x1b[K');

  if (exitCode !== 0) {
    console.error('\nLighthouse CI failed with exit code:', exitCode);
    console.error('Error output:', lhciError);
    process.exit(exitCode);
  }

  try {
    const lhciDir = '.lighthouseci';
    const files = readdirSync(lhciDir)
      .filter((f) => f.startsWith('lhr-') && f.endsWith('.json'))
      .sort();

    if (files.length === 0) {
      console.error('No Lighthouse results found');
      process.exit(1);
    }

    let globalAllPassed = true;

    files.forEach((file, index) => {
      const reportPath = join(lhciDir, file);
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      const testedUrl = report.finalUrl || report.requestedUrl;

      if (index > 0) console.log('\n');
      console.log(`\n${'='.repeat(90)}`);
      console.log(`📄 Testing: ${testedUrl}`);
      console.log(`${'='.repeat(90)}\n`);

      const getDiagnostics = (rep, type) => {
        const diagnostics = [];

        if (type === 'lcp') {
          const lcpTime = rep.audits['largest-contentful-paint'].numericValue;
          const networkRequests = rep.audits['network-requests'];
          const ttfb = rep.audits['server-response-time']?.numericValue || 0;
          const fcp = rep.audits['first-contentful-paint']?.numericValue || 0;

          if (networkRequests?.details?.items) {
            const beforeLCP = networkRequests.details.items
              .filter((item) => (item.networkRequestTime || 0) * 1000 < lcpTime)
              .filter((item) => !item.url.includes('livereload'));

            const byType = {
              Script: beforeLCP.filter((r) => r.resourceType === 'Script'),
              Stylesheet: beforeLCP.filter((r) => r.resourceType === 'Stylesheet'),
              Image: beforeLCP.filter((r) => r.resourceType === 'Image'),
              Font: beforeLCP.filter((r) => r.resourceType === 'Font'),
              Document: beforeLCP.filter((r) => r.resourceType === 'Document'),
              Other: beforeLCP.filter((r) => !['Script', 'Stylesheet', 'Image', 'Font', 'Document'].includes(r.resourceType)),
            };

            const totalSize = Object.values(byType)
              .flat()
              .reduce((sum, item) => sum + (item.transferSize || 0), 0);
            const totalSizeKB = Math.round(totalSize / 1024);

            diagnostics.push(`  • Resources loaded BEFORE LCP (${Math.round(lcpTime)}ms):`);
            Object.entries(byType).forEach(([resourceType, items]) => {
              if (items.length > 0) {
                const typeSize = items.reduce((sum, item) => sum + (item.transferSize || 0), 0);
                const typeSizeKB = Math.round(typeSize / 1024);
                diagnostics.push(`    - ${items.length} ${resourceType.toLowerCase()}${items.length > 1 ? 's' : ''} (${typeSizeKB}KB)`);
              }
            });
            diagnostics.push(`    - TOTAL: ${totalSizeKB}KB ${totalSizeKB > 100 ? '⚠️  (exceeds 100KB recommendation)' : '✓'}`);

            const topHeavy = beforeLCP
              .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
              .slice(0, 3)
              .filter((item) => (item.transferSize || 0) > 10240);

            if (topHeavy.length > 0) {
              diagnostics.push('  • Heaviest resources before LCP:');
              topHeavy.forEach((item) => {
                const { url, transferSize, resourceType } = item;
                const fileName = url.split('/').pop() || url;
                const size = Math.round((transferSize || 0) / 1024);
                diagnostics.push(`    - ${fileName} (${resourceType}, ${size}KB)`);
              });
            }

            if (totalSizeKB < 100) {
              diagnostics.push('  • Root cause analysis:');
              diagnostics.push(`    - TTFB (server response): ${Math.round(ttfb)}ms`);
              diagnostics.push(`    - FCP (first paint): ${Math.round(fcp)}ms`);
              diagnostics.push(`    - LCP delay: ${Math.round(lcpTime - fcp)}ms after first paint`);

              if (ttfb > 600) {
                diagnostics.push('    → Slow server response is the main bottleneck');
              } else if (lcpTime - fcp > 1000) {
                diagnostics.push('    → LCP element is rendering late after initial paint');
              } else if (fcp > 1800) {
                diagnostics.push('    → First paint is delayed (CSS/font blocking)');
              } else {
                diagnostics.push('    → LCP timing is close to threshold (may pass on retry)');
              }
            }
          }

          const lcpElement = rep.audits['largest-contentful-paint-element'];
          const lcpNode = lcpElement?.details?.items?.[0];
          if (lcpNode) {
            diagnostics.push(`  • LCP Element: ${lcpNode.node.nodeLabel || 'Unknown'}`);
          }

          const renderBlocking = rep.audits['render-blocking-resources'];
          if (renderBlocking?.details?.items?.length > 0) {
            diagnostics.push('  • Render-blocking resources:');
            renderBlocking.details.items.slice(0, 3).forEach((item) => {
              const fileName = item.url.split('/').pop();
              const wastedMs = Math.round(item.wastedMs || 0);
              diagnostics.push(`    - ${fileName} (delays by ${wastedMs}ms)`);
            });
          }
        }

        if (type === 'fcp') {
          const networkRequests = rep.audits['network-requests'];
          if (networkRequests?.details?.items) {
            const cssJs = networkRequests.details.items
              .filter((item) => item.resourceType === 'Script' || item.resourceType === 'Stylesheet')
              .filter((item) => !item.url.includes('livereload'))
              .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
              .slice(0, 3);

            if (cssJs.length > 0) {
              diagnostics.push('  • Largest CSS/JS files:');
              cssJs.forEach((item) => {
                const size = ((item.transferSize || 0) / 1024).toFixed(0);
                const fileName = item.url.split('/').pop() || item.url;
                const fileType = item.resourceType === 'Script' ? 'JS' : 'CSS';
                diagnostics.push(`    - ${fileType}: ${fileName} (${size}KB)`);
              });
            }
          }
        }

        if (type === 'render-blocking') {
          const networkRequests = rep.audits['network-requests'];
          if (networkRequests?.details?.items) {
            const css = networkRequests.details.items
              .filter((item) => item.resourceType === 'Stylesheet')
              .map((item) => {
                const size = ((item.transferSize || 0) / 1024).toFixed(0);
                const fileName = item.url.split('/').pop();
                return `${fileName} (${size}KB)`;
              });
            const js = networkRequests.details.items
              .filter((item) => item.resourceType === 'Script' && !item.url.includes('livereload'))
              .map((item) => {
                const size = ((item.transferSize || 0) / 1024).toFixed(0);
                const fileName = item.url.split('/').pop();
                return `${fileName} (${size}KB)`;
              });
            if (css.length) diagnostics.push(`  • CSS files: ${css.slice(0, 3).join(', ')}`);
            if (js.length) diagnostics.push(`  • JS files: ${js.slice(0, 3).join(', ')}`);
          }
        }

        return diagnostics;
      };

      const checks = [
        {
          test: 'Performance Score',
          value: report.categories.performance.score,
          threshold: 0.9,
          unit: '',
          advice: 'Optimize images, reduce JavaScript, improve server response times',
        },
        {
          test: 'First Contentful Paint',
          value: report.audits['first-contentful-paint'].numericValue,
          threshold: 2500,
          unit: 'ms',
          advice: 'Inline critical CSS, defer non-critical scripts, optimize above-the-fold',
          diagnostics: () => getDiagnostics(report, 'fcp'),
        },
        {
          test: 'Largest Contentful Paint',
          value: report.audits['largest-contentful-paint'].numericValue,
          threshold: 2500,
          unit: 'ms',
          advice: 'See root cause analysis below',
          diagnostics: () => getDiagnostics(report, 'lcp'),
        },
        {
          test: 'Render Blocking Resources',
          value: (() => {
            const networkRequests = report.audits['network-requests'];
            if (!networkRequests?.details?.items) return 0;
            const syncResources = networkRequests.details.items
              .filter((item) => item.resourceType === 'Script' || item.resourceType === 'Stylesheet')
              .filter((item) => !item.url.includes('livereload'));
            return syncResources.reduce((sum, item) => sum + (item.transferSize || 0), 0);
          })(),
          threshold: 102400,
          unit: 'KB',
          advice: 'Defer non-critical CSS/JS, inline critical CSS',
          diagnostics: () => getDiagnostics(report, 'render-blocking'),
        },
        {
          test: 'Cumulative Layout Shift',
          value: report.audits['cumulative-layout-shift'].numericValue,
          threshold: 0.1,
          unit: '',
          advice: 'Add size attributes to images, avoid inserting content above existing content',
        },
        {
          test: 'Total Blocking Time',
          value: report.audits['total-blocking-time'].numericValue,
          threshold: 300,
          unit: 'ms',
          advice: 'Reduce JavaScript execution time, code-split large bundles',
        },
        {
          test: 'Total Page Weight',
          value: report.audits['total-byte-weight'].numericValue,
          threshold: 614400,
          unit: 'KB',
          advice: 'Compress images, minify CSS/JS, remove unused code',
        },
      ];

      console.log('┌─────────────────────────────┬──────────┬──────────────────────────────────────────────────────────────────────────┐');
      console.log('│ Test                        │ Status   │ Current Value → Target                                               │');
      console.log('├─────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────────────────┤');

      let allPassed = true;
      checks.forEach((check) => {
        const isScore = check.test.includes('Score');
        const isCLS = check.test === 'Cumulative Layout Shift';

        let displayValue = check.value;
        if (isScore) {
          displayValue = (check.value * 100).toFixed(0);
        } else if (isCLS) {
          displayValue = check.value.toFixed(3);
        } else if (check.unit === 'KB') {
          displayValue = (check.value / 1024).toFixed(0);
        } else {
          displayValue = Math.round(check.value);
        }

        let displayThreshold = check.threshold;
        if (isScore) {
          displayThreshold = (check.threshold * 100).toFixed(0);
        } else if (isCLS) {
          displayThreshold = check.threshold.toFixed(3);
        } else if (check.unit === 'KB') {
          displayThreshold = (check.threshold / 1024).toFixed(0);
        }

        let passed;
        if (isScore) {
          passed = check.value >= check.threshold;
        } else {
          passed = check.value <= check.threshold;
        }

        const status = passed ? '✓ PASS' : '✗ FAIL';
        const unit = isScore ? '%' : check.unit;
        const comparison = isScore
          ? `${displayValue}${unit} ≥ ${displayThreshold}${unit}`
          : `${displayValue}${unit} → ${displayThreshold}${unit}`;

        if (!passed) allPassed = false;

        const testPadded = check.test.padEnd(27);
        const statusPadded = status.padEnd(8);
        const comparisonPadded = comparison.padEnd(72);

        console.log(`│ ${testPadded} │ ${statusPadded} │ ${comparisonPadded} │`);

        if (!passed) {
          console.log(`│                             │          │ ${check.advice.padEnd(72)} │`);
          if (check.diagnostics) {
            const details = check.diagnostics();
            if (details.length > 0) {
              details.forEach((detail) => {
                console.log(`│                             │          │ ${detail.padEnd(72)} │`);
              });
            }
          }
        }
      });

      console.log('└─────────────────────────────┴──────────┴──────────────────────────────────────────────────────────────────────────┘\n');

      if (allPassed) {
        console.log('✅ All checks passed for this page!\n');
      } else {
        console.log('❌ Some checks failed for this page.\n');
        globalAllPassed = false;
      }
    });

    console.log(`\n${'='.repeat(90)}`);
    if (globalAllPassed) {
      console.log('✅ All performance checks passed across all pages!\n');
      process.exit(0);
    } else {
      console.log('❌ Performance checks failed on one or more pages. Please optimize before committing.\n');
      process.exit(1);
    }
  } catch (error) {
    clearInterval(spinner);
    process.stdout.write('\r\x1b[K');
    console.error('Error parsing Lighthouse results:', error.message);
    process.exit(1);
  }
});
