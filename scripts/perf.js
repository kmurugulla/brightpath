#!/usr/bin/env node
/* eslint-disable no-console */

import {
  spawn,
} from 'child_process';
import {
  readFileSync, readdirSync, writeFileSync, mkdirSync,
} from 'fs';
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
    const markdownResults = [];

    files.forEach((file) => {
      const reportPath = join(lhciDir, file);
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      const testedUrl = report.finalUrl || report.requestedUrl;
      console.log(`\n${'='.repeat(90)}`);
      console.log(`📄 Testing: ${testedUrl}`);
      console.log(`${'='.repeat(90)}\n`);

      const isThirdParty = (url, pageUrl) => {
        try {
          const urlHost = new URL(url).hostname;
          const baseHost = new URL(pageUrl).hostname;
          return urlHost !== baseHost && urlHost !== 'localhost';
        } catch {
          return false;
        }
      };

      const sourceCache = {};
      const findScriptSource = (url) => {
        if (sourceCache[url]) return sourceCache[url];

        try {
          const domain = new URL(url).hostname;
          const searchPaths = ['scripts', 'blocks', 'head.html', 'styles'];
          const extensions = ['.js', '.html', '.css'];

          const result = searchPaths.reduce((found, searchPath) => {
            if (found) return found;
            try {
              const fullPath = join(process.cwd(), searchPath);
              const filePaths = searchPath.endsWith('.html')
                ? [searchPath]
                : readdirSync(fullPath, { recursive: true })
                  .filter((f) => extensions.some((ext) => f.endsWith(ext)))
                  .map((f) => join(searchPath, f));

              const foundInFiles = filePaths.reduce((foundMatch, filePath) => {
                if (foundMatch) return foundMatch;
                try {
                  const content = readFileSync(join(process.cwd(), filePath), 'utf-8');
                  if (content.includes(domain) || content.includes(url)) {
                    const lines = content.split('\n');
                    const lineNum = lines.findIndex((l) => l.includes(domain) || l.includes(url));
                    let phase = 'unknown';
                    const lineContent = lines[lineNum] || '';
                    if (filePath.includes('delayed.js') || lineContent.includes('loadDelayed')) {
                      phase = 'loadDelayed';
                    } else if (lineContent.includes('loadLazy')) {
                      phase = 'loadLazy';
                    } else if (lineContent.includes('loadEager') || filePath.includes('scripts.js')) {
                      phase = 'loadEager';
                    }
                    return { file: filePath, line: lineNum + 1, phase };
                  }
                } catch { /* skip file read errors */ }
                return null;
              }, null);
              if (foundInFiles) return foundInFiles;
            } catch { /* skip invalid paths */ }
            return null;
          }, null);

          sourceCache[url] = result;
          return result;
        } catch { /* skip */ }

        sourceCache[url] = null;
        return null;
      };

      const groupByVendor = (resources) => {
        const vendors = {};
        resources.forEach((item) => {
          try {
            const domain = new URL(item.url).hostname;
            if (!vendors[domain]) {
              vendors[domain] = {
                domain, scripts: [], totalSize: 0,
              };
            }
            vendors[domain].scripts.push(item);
            vendors[domain].totalSize += (item.transferSize || 0);
          } catch { /* skip */ }
        });
        return Object.values(vendors).sort((a, b) => b.totalSize - a.totalSize);
      };

      const formatValue = (value, unit, test) => {
        const isCLS = test === 'Cumulative Layout Shift';
        if (test === 'Performance Score') return (value * 100).toFixed(0);
        if (isCLS) return value.toFixed(3);
        if (unit === 'KB') return (value / 1024).toFixed(0);
        return Math.round(value);
      };

      const checkPassed = (value, threshold, test) => (
        test === 'Performance Score' ? value >= threshold : value <= threshold
      );

      const getCrossDomainIssues = (rep) => {
        const networkRequests = rep.audits['network-requests'];
        const thirdPartySummary = rep.audits['third-party-summary'];
        if (!networkRequests?.details?.items) return [];

        const crossDomain = networkRequests.details.items
          .filter((item) => isThirdParty(item.url, rep.finalUrl))
          .filter((item) => !item.url.includes('livereload'))
          .filter((item) => (item.transferSize || 0) > 3072 || (item.resourceType === 'Script'));

        const vendors = groupByVendor(crossDomain);
        return vendors.map((vendor) => {
          const source = findScriptSource(vendor.scripts[0].url);
          const blockingTime = thirdPartySummary?.details?.items?.find(
            (item) => item.entity?.includes(vendor.domain) || vendor.domain.includes(item.entity),
          )?.blockingTime || 0;

          return {
            domain: vendor.domain,
            size: vendor.totalSize,
            blockingTime: Math.round(blockingTime),
            source,
            fileCount: vendor.scripts.length,
          };
        }).sort((a, b) => b.blockingTime - a.blockingTime || b.size - a.size);
      };

      const checks = [
        {
          test: 'Performance Score',
          value: report.categories.performance.score,
          threshold: 0.9,
          unit: '/100',
        },
        {
          test: 'First Contentful Paint',
          value: report.audits['first-contentful-paint'].numericValue,
          threshold: 2500,
          unit: 'ms',
        },
        {
          test: 'Largest Contentful Paint',
          value: report.audits['largest-contentful-paint'].numericValue,
          threshold: 2500,
          unit: 'ms',
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
        },
        {
          test: 'Cumulative Layout Shift',
          value: report.audits['cumulative-layout-shift'].numericValue,
          threshold: 0.1,
          unit: '',
        },
        {
          test: 'Total Blocking Time',
          value: report.audits['total-blocking-time'].numericValue,
          threshold: 300,
          unit: 'ms',
        },
        {
          test: 'Total Page Weight',
          value: report.audits['total-byte-weight'].numericValue,
          threshold: 614400,
          unit: 'KB',
        },
      ];

      // Collect failures and passing tests
      const failures = [];
      const passing = [];
      let allPassed = true;

      checks.forEach((check) => {
        const passed = checkPassed(check.value, check.threshold, check.test);
        const displayValue = formatValue(check.value, check.unit, check.test);
        const displayThreshold = formatValue(check.threshold, check.unit, check.test);

        if (!passed) {
          allPassed = false;
          failures.push({ ...check, displayValue, displayThreshold });
        } else {
          passing.push({ ...check, displayValue });
        }
      });

      const crossDomainIssues = getCrossDomainIssues(report);

      // Output: Show only failures in detail
      if (!allPassed) {
        console.log('\n❌ FAILURES:\n');

        failures.forEach((fail) => {
          const target = fail.test === 'Performance Score'
            ? `${fail.displayThreshold}${fail.unit}`
            : `${fail.displayThreshold}${fail.unit}`;
          console.log(`${fail.test}: ${fail.displayValue}${fail.unit} (target: ${target})`);

          // Show cross-domain root cause for performance score
          if (fail.test === 'Performance Score' && crossDomainIssues.length > 0) {
            const totalSize = Math.round(
              crossDomainIssues.reduce((sum, v) => sum + v.size, 0) / 1024,
            );
            console.log(`  → Root cause: ${totalSize}KB cross-domain scripts\n`);
          } else {
            console.log('');
          }
        });

        // Show cross-domain issues if significant
        if (crossDomainIssues.length > 0 && crossDomainIssues[0].size > 50000) {
          const totalSize = Math.round(
            crossDomainIssues.reduce((sum, v) => sum + v.size, 0) / 1024,
          );
          console.log(`Cross-Domain Scripts (${totalSize}KB):`);

          crossDomainIssues.slice(0, 5).forEach((vendor) => {
            const sizeKB = Math.round(vendor.size / 1024);
            const blocking = vendor.blockingTime > 0 ? `, ${vendor.blockingTime}ms blocking` : '';
            console.log(`  • ${vendor.domain} (${sizeKB}KB${blocking})`);

            if (vendor.source) {
              const phase = vendor.source.phase !== 'unknown' ? ` (${vendor.source.phase})` : '';
              console.log(`    📍 ${vendor.source.file}:${vendor.source.line}${phase}`);

              // Suggest action based on phase
              if (vendor.source.phase === 'loadEager') {
                console.log('    → Move to loadDelayed');
              } else if (vendor.source.phase === 'loadDelayed' && vendor.blockingTime > 100) {
                console.log('    → Already delayed but blocking - consider removing');
              } else if (vendor.source.phase === 'loadLazy') {
                console.log('    → Move to loadDelayed');
              }
            }
            console.log('');
          });
        }

        globalAllPassed = false;
      }

      // Show passing metrics in a single line
      if (passing.length > 0) {
        const passingTests = passing.map((p) => `${p.test} (${p.displayValue}${p.unit})`).join(', ');
        console.log(`\n${'='.repeat(90)}`);
        console.log(`✅ PASSING: ${passingTests}`);
        console.log(`${'='.repeat(90)}\n`);
      }

      if (allPassed) {
        console.log('\n✅ All checks passed for this page!\n');
      }

      // Build markdown for this page
      const pageStatus = allPassed ? '✅' : '❌';
      const perfScore = (report.categories.performance.score * 100).toFixed(0);
      const pathName = new URL(testedUrl).pathname || '/';

      let markdown = `\n<details${allPassed ? '' : ' open'}>\n`;
      markdown += `<summary>${pageStatus} <code>${pathName}</code> • Performance Score: ${perfScore}/100</summary>\n\n`;
      markdown += '#### Performance Metrics\n\n';
      markdown += '| Test | Status | Current Value | Target |\n';
      markdown += '|------|--------|---------------|--------|\n';

      checks.forEach((check) => {
        const {
          test, value, threshold, unit,
        } = check;
        const displayValue = formatValue(value, unit, test);
        const displayThreshold = formatValue(threshold, unit, test);
        const passed = checkPassed(value, threshold, test);
        const status = passed ? '✅' : '❌';
        const comparison = test === 'Performance Score'
          ? `≥ ${displayThreshold}${unit}` : `< ${displayThreshold}${unit}`;
        markdown += `| ${test} | ${status} | **${displayValue}${unit}** | ${comparison} |\n`;
      });

      if (!allPassed) {
        markdown += '\n#### 🔍 Issues Found\n\n';
        checks.forEach((check) => {
          const {
            test, value, threshold, unit, advice,
          } = check;
          if (!checkPassed(value, threshold, test)) {
            const displayValue = formatValue(value, unit, test);
            markdown += `**${test}**: ${displayValue}${unit}\n\n`;
            const adviceText = typeof advice === 'function' ? advice() : advice;
            markdown += `*Recommendation*: ${adviceText}\n\n`;
            if (check.diagnostics) {
              const details = check.diagnostics();
              if (details.length > 0) {
                details.forEach((detail) => {
                  markdown += `${detail}\n`;
                });
              }
            }
            markdown += '\n';
          }
        });
      }

      markdown += `\n[🔗 View Page](${testedUrl})\n`;
      markdown += '</details>\n';

      markdownResults.push(markdown);
    });

    console.log(`\n${'='.repeat(90)}`);
    if (globalAllPassed) {
      console.log('✅ All performance checks passed across all pages!\n');
    } else {
      console.log('❌ Performance checks failed on one or more pages. Please optimize before committing.\n');
    }

    const passedCount = files.filter((file) => {
      const reportPath = join(lhciDir, file);
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      const { performance } = report.categories;
      return performance.score >= 0.9;
    }).length;
    const totalCount = files.length;

    let fullMarkdown = '## 🚀 Performance Test Results\n\n';
    fullMarkdown += `**Status:** ${globalAllPassed ? '✅ All Passed' : '⚠️ Some Failed'} • `;
    fullMarkdown += `**Pages:** ${passedCount}/${totalCount} passed\n\n`;
    fullMarkdown += '---\n\n';
    fullMarkdown += '### 📄 Results by Page\n';
    fullMarkdown += markdownResults.join('\n');
    fullMarkdown += '\n---\n\n';
    fullMarkdown += '<sub>🤖 Automated by Lighthouse CI • ';
    const githubRepo = process.env.GITHUB_REPOSITORY || 'repository';
    const githubRunId = process.env.GITHUB_RUN_ID || 'run-id';
    fullMarkdown += `<a href="https://github.com/${githubRepo}/actions/runs/${githubRunId}">View Full Reports</a></sub>\n`;

    mkdirSync(lhciDir, { recursive: true });
    const summaryPath = join(lhciDir, 'summary.md');
    writeFileSync(summaryPath, fullMarkdown, 'utf-8');
    console.log(`📝 Markdown summary written to ${summaryPath}\n`);

    if (globalAllPassed) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error) {
    clearInterval(spinner);
    process.stdout.write('\r\x1b[K');
    console.error('Error parsing Lighthouse results:', error.message);
    process.exit(1);
  }
});
