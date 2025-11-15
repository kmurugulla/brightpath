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

      const shouldExcludeResource = (item) => {
        const fileName = item.url.split('/').pop() || '';
        if (['aem.js', 'scripts.js'].includes(fileName)) return true;
        if (item.url.includes('media_') && item.url.includes('optimize=')) return true;
        return false;
      };

      const getThreshold = (resourceType, isThirdPartyResource) => {
        if (isThirdPartyResource) {
          return { Script: 3072, Stylesheet: 3072, Other: 5120 }[resourceType] || 5120;
        }
        return {
          Script: 5120, Stylesheet: 3072, Font: 0, Image: 20480, Document: 10240, Other: 10240,
        }[resourceType] || 10240;
      };

      const getFileName = (url) => {
        const parts = url.split('/');
        return parts.pop() || parts[parts.length - 1] || 'unknown';
      };

      const formatResourceBreakdown = (resources, pageUrl, label = 'Resources') => {
        const lines = [];
        if (resources.length === 0) return lines;

        const firstParty = resources.filter((r) => !isThirdParty(r.url, pageUrl));
        const thirdParty = resources.filter((r) => isThirdParty(r.url, pageUrl));

        const formatGroup = (items, isTP) => {
          const groupLines = [];
          const byType = {
            Script: items.filter((r) => r.resourceType === 'Script'),
            Stylesheet: items.filter((r) => r.resourceType === 'Stylesheet'),
            Image: items.filter((r) => r.resourceType === 'Image'),
            Font: items.filter((r) => r.resourceType === 'Font'),
            Document: items.filter((r) => r.resourceType === 'Document'),
            Other: items.filter((r) => !['Script', 'Stylesheet', 'Image', 'Font', 'Document'].includes(r.resourceType)),
          };

          Object.entries(byType).forEach(([type, typeItems]) => {
            if (typeItems.length === 0) return;

            const totalSize = typeItems.reduce((sum, item) => sum + (item.transferSize || 0), 0);
            const totalKB = Math.round(totalSize / 1024);
            groupLines.push(`      ${type}: ${totalKB}KB (${typeItems.length} file${typeItems.length > 1 ? 's' : ''})`);

            const threshold = getThreshold(type, isTP);
            const significant = typeItems
              .filter((item) => (item.transferSize || 0) > threshold)
              .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));

            significant.forEach((item) => {
              const fileName = getFileName(item.url);
              const size = Math.round((item.transferSize || 0) / 1024);
              if (isTP) {
                const domain = new URL(item.url).hostname;
                groupLines.push(`        • ${fileName} from ${domain} (${size}KB)`);
              } else {
                groupLines.push(`        • ${fileName} (${size}KB)`);
              }
            });

            if (significant.length < typeItems.length) {
              const smallCount = typeItems.length - significant.length;
              const thresholdKB = Math.round(threshold / 1024);
              groupLines.push(`        ... and ${smallCount} smaller file${smallCount > 1 ? 's' : ''} (<${thresholdKB}KB each)`);
            }
          });

          const totalSize = items.reduce((sum, item) => sum + (item.transferSize || 0), 0);
          const totalKB = Math.round(totalSize / 1024);
          const warning = totalKB > (isTP ? 50 : 100) ? ' ⚠️' : ' ✓';
          groupLines.push(`      TOTAL: ${totalKB}KB${warning}`);

          return groupLines;
        };

        lines.push(`  • ${label}:`);

        if (firstParty.length > 0) {
          lines.push('    📦 First-Party:');
          lines.push(...formatGroup(firstParty, false));
        }

        if (thirdParty.length > 0) {
          lines.push('    🌐 Third-Party:');
          lines.push(...formatGroup(thirdParty, true));
        }

        return lines;
      };

      const analyzeRootCause = (resources, pageUrl, metricType, metricValue, context = {}) => {
        const lines = ['  • 🔍 Root cause analysis:'];
        const firstParty = resources.filter((r) => !isThirdParty(r.url, pageUrl));
        const thirdParty = resources.filter((r) => isThirdParty(r.url, pageUrl));
        const firstPartySize = firstParty.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        const thirdPartySize = thirdParty.reduce((sum, r) => sum + (r.transferSize || 0), 0);
        const totalSize = firstPartySize + thirdPartySize;
        const thirdPartyPercent = totalSize > 0
          ? Math.round((thirdPartySize / totalSize) * 100) : 0;

        Object.entries(context).forEach(([key, value]) => {
          lines.push(`    - ${key}: ${value}`);
        });

        if (metricType === 'render-blocking' && thirdPartySize > 100000) {
          const sizeKB = Math.round(thirdPartySize / 1024);
          lines.push(`    → Primary issue: Third-party scripts blocking render (${sizeKB}KB)`);
        } else if (metricType === 'tbt' && thirdPartyPercent > 60) {
          lines.push(`    → Primary issue: Third-party scripts blocking main thread (${thirdPartyPercent}%)`);
        } else if (metricType === 'pageweight' && thirdPartyPercent > 50) {
          lines.push(`    → Primary issue: ${thirdPartyPercent}% of page weight from third-party`);
        } else if (metricType === 'lcp') {
          const { ttfb, fcp, lcpTime } = context;
          if (ttfb > 600) {
            lines.push('    → Primary issue: Slow server response');
          } else if (thirdParty.length > 3 && thirdPartySize > 50000) {
            lines.push('    → Primary issue: Third-party scripts delaying LCP');
          } else if (lcpTime - fcp > 1000) {
            lines.push('    → Primary issue: LCP element renders late after initial paint');
          } else if (fcp > 1800) {
            lines.push('    → Primary issue: First paint delayed by render-blocking CSS/fonts');
          } else if (totalSize > 100000) {
            lines.push('    → Primary issue: Too many/large resources loaded before LCP');
          } else {
            lines.push('    → LCP timing is close to threshold (may vary on runs)');
          }
        } else if (context.customRootCause) {
          lines.push(`    → ${context.customRootCause}`);
        }

        return lines;
      };

      const getDiagnostics = (rep, type) => {
        const diagnostics = [];

        if (type === 'lcp') {
          const lcpTime = rep.audits['largest-contentful-paint'].numericValue;
          const networkRequests = rep.audits['network-requests'];
          const ttfb = rep.audits['server-response-time']?.numericValue || 0;
          const fcp = rep.audits['first-contentful-paint']?.numericValue || 0;
          const lcpElement = rep.audits['largest-contentful-paint-element'];
          const lcpNode = lcpElement?.details?.items?.[0];

          if (lcpNode?.node) {
            const nodeLabel = lcpNode.node.nodeLabel || lcpNode.node.nodeName || 'Unknown';
            diagnostics.push(`  • 🎯 LCP Element: ${nodeLabel}`);
            const snippet = lcpNode.node.snippet || '';
            if (snippet && snippet.length < 100) diagnostics.push(`    ${snippet}`);
          }

          if (networkRequests?.details?.items) {
            const beforeLCP = networkRequests.details.items
              .filter((item) => {
                const endTime = item.networkEndTime || 0;
                return endTime > 0 && endTime <= lcpTime;
              })
              .filter((item) => !item.url.includes('livereload'));

            diagnostics.push(...formatResourceBreakdown(
              beforeLCP,
              rep.finalUrl,
              `Resources loaded BEFORE LCP (${Math.round(lcpTime)}ms)`,
            ));

            const topHeavy = beforeLCP
              .filter((item) => !shouldExcludeResource(item))
              .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
              .slice(0, 5)
              .filter((item) => (item.transferSize || 0) > 10240);

            if (topHeavy.length > 0) {
              diagnostics.push('  • 📊 Heaviest resources before LCP:');
              topHeavy.forEach((item) => {
                const size = Math.round((item.transferSize || 0) / 1024);
                const isTP = isThirdParty(item.url, rep.finalUrl) ? ' [3rd-party]' : '';
                diagnostics.push(`    - ${getFileName(item.url)} (${item.resourceType}, ${size}KB)${isTP}`);
              });
            }

            const fonts = beforeLCP.filter((item) => item.resourceType === 'Font');
            if (fonts.length > 0) {
              const totalFontSize = fonts.reduce((sum, f) => sum + (f.transferSize || 0), 0);
              const totalFontKB = Math.round(totalFontSize / 1024);
              if (totalFontKB > 50) {
                diagnostics.push('  • ⚠️  Font Loading Issues:');
                diagnostics.push(`    - ${fonts.length} font${fonts.length > 1 ? 's' : ''} loaded before LCP (${totalFontKB}KB)`);
                diagnostics.push('    - Consider using font-display: swap or optional in CSS');
              }
            }

            diagnostics.push(...analyzeRootCause(beforeLCP, rep.finalUrl, 'lcp', lcpTime, {
              'TTFB (server response)': `${Math.round(ttfb)}ms`,
              'FCP (first paint)': `${Math.round(fcp)}ms`,
              'LCP delay': `${Math.round(lcpTime - fcp)}ms after first paint`,
              ttfb,
              fcp,
              lcpTime,
            }));
          }
        }

        if (type === 'fcp') {
          const networkRequests = rep.audits['network-requests'];
          if (networkRequests?.details?.items) {
            const cssJs = networkRequests.details.items
              .filter((item) => item.resourceType === 'Script' || item.resourceType === 'Stylesheet')
              .filter((item) => !item.url.includes('livereload'));

            diagnostics.push(...formatResourceBreakdown(cssJs, rep.finalUrl, 'CSS/JS files affecting FCP'));
            diagnostics.push(...analyzeRootCause(cssJs, rep.finalUrl, 'fcp', null, {
              customRootCause: 'Defer non-critical CSS/JS, inline critical CSS',
            }));
          }
        }

        if (type === 'render-blocking') {
          const networkRequests = rep.audits['network-requests'];
          const renderBlockingAudit = rep.audits['render-blocking-resources'];

          if (networkRequests?.details?.items) {
            const blockingResources = networkRequests.details.items
              .filter((item) => {
                const { resourceType } = item;
                return resourceType === 'Script' || resourceType === 'Stylesheet';
              })
              .filter((item) => !item.url.includes('livereload'));

            diagnostics.push(...formatResourceBreakdown(blockingResources, rep.finalUrl, 'Render-blocking resources'));

            if (renderBlockingAudit?.details?.items?.length > 0) {
              diagnostics.push('  • ⏱️  Delay caused by blocking resources:');
              renderBlockingAudit.details.items.slice(0, 5).forEach((item) => {
                const wastedMs = Math.round(item.wastedMs || 0);
                const isTP = isThirdParty(item.url, rep.finalUrl) ? ' [3rd-party]' : '';
                diagnostics.push(`    - ${getFileName(item.url)} (delays by ${wastedMs}ms)${isTP}`);
              });
            }

            diagnostics.push(...analyzeRootCause(
              blockingResources,
              rep.finalUrl,
              'render-blocking',
              null,
              { customRootCause: 'Load critical CSS/JS async or defer non-critical resources' },
            ));
          }
        }

        if (type === 'tbt') {
          const thirdPartySummary = rep.audits['third-party-summary'];
          const mainThreadWork = rep.audits['mainthread-work-breakdown'];

          if (thirdPartySummary?.details?.items) {
            diagnostics.push('  • 🌐 Third-Party Impact on Main Thread:');
            thirdPartySummary.details.items.slice(0, 5).forEach((item) => {
              const { entity, blockingTime, transferSize } = item;
              const blocking = Math.round(blockingTime || 0);
              const size = Math.round((transferSize || 0) / 1024);
              diagnostics.push(`    - ${entity} (${blocking}ms blocking, ${size}KB)`);
            });
          }

          if (mainThreadWork?.details?.items) {
            const scriptEval = mainThreadWork.details.items.find(
              (item) => item.group === 'scriptEvaluation',
            );
            const scriptParse = mainThreadWork.details.items.find(
              (item) => item.group === 'scriptParseCompile',
            );
            if (scriptEval || scriptParse) {
              diagnostics.push('  • 📦 First-Party JavaScript Execution:');
              if (scriptEval) {
                diagnostics.push(`    - Script evaluation: ${Math.round(scriptEval.duration)}ms`);
              }
              if (scriptParse) {
                diagnostics.push(`    - Script parse/compile: ${Math.round(scriptParse.duration)}ms`);
              }
            }
          }

          diagnostics.push('  • 💡 Recommendations:');
          diagnostics.push('    - Load third-party scripts with async/defer');
          diagnostics.push('    - Move non-critical scripts to loadLazy or loadDelayed');
          diagnostics.push('    - Code-split large JavaScript bundles');
        }

        if (type === 'pageweight') {
          const networkRequests = rep.audits['network-requests'];
          if (networkRequests?.details?.items) {
            const allResources = networkRequests.details.items
              .filter((item) => !item.url.includes('livereload'));

            const weightLabel = 'Page weight breakdown';
            diagnostics.push(...formatResourceBreakdown(allResources, rep.finalUrl, weightLabel));
            diagnostics.push(...analyzeRootCause(allResources, rep.finalUrl, 'pageweight', null));
          }
        }

        return diagnostics;
      };

      const generateRecommendations = (rep, metricKey) => {
        const recommendations = [];
        const auditMappings = {
          performance: [
            'unused-javascript',
            'unused-css-rules',
            'modern-image-formats',
            'uses-optimized-images',
            'offscreen-images',
            'uses-text-compression',
            'uses-responsive-images',
          ],
          lcp: [
            'server-response-time',
            'render-blocking-resources',
            'unused-css-rules',
            'largest-contentful-paint-element',
            'prioritize-lcp-image',
          ],
          fcp: [
            'render-blocking-resources',
            'unused-css-rules',
            'font-display',
          ],
          tbt: [
            'unused-javascript',
            'legacy-javascript',
            'mainthread-work-breakdown',
            'third-party-summary',
          ],
          pageweight: [
            'total-byte-weight',
            'unused-javascript',
            'modern-image-formats',
            'uses-optimized-images',
            'uses-text-compression',
          ],
        };

        (auditMappings[metricKey] || []).forEach((auditKey) => {
          const audit = rep.audits[auditKey];
          if (audit?.details?.overallSavingsMs > 100) {
            const savingsMs = Math.round(audit.details.overallSavingsMs);
            const savingsKB = audit.details.overallSavingsBytes
              ? Math.round(audit.details.overallSavingsBytes / 1024) : null;
            let rec = audit.title;
            if (savingsMs && savingsKB) rec += ` (save ${savingsMs}ms, ${savingsKB}KB)`;
            else if (savingsMs) rec += ` (save ${savingsMs}ms)`;
            recommendations.push(rec);
          } else if (audit?.score !== null && audit.score < 0.9) {
            recommendations.push(audit.title);
          }
        });

        return recommendations.slice(0, 3).join('; ') || 'Review Lighthouse report for details';
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

      const checks = [
        {
          test: 'Performance Score',
          value: report.categories.performance.score,
          threshold: 0.9,
          unit: '/100',
          isScore: true,
          advice: () => generateRecommendations(report, 'performance'),
        },
        {
          test: 'First Contentful Paint',
          value: report.audits['first-contentful-paint'].numericValue,
          threshold: 2500,
          unit: 'ms',
          advice: () => generateRecommendations(report, 'fcp'),
          diagnostics: () => getDiagnostics(report, 'fcp'),
        },
        {
          test: 'Largest Contentful Paint',
          value: report.audits['largest-contentful-paint'].numericValue,
          threshold: 2500,
          unit: 'ms',
          advice: () => 'See root cause analysis below',
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
          advice: () => 'See diagnostics for specific files to defer/optimize',
          diagnostics: () => getDiagnostics(report, 'render-blocking'),
        },
        {
          test: 'Cumulative Layout Shift',
          value: report.audits['cumulative-layout-shift'].numericValue,
          threshold: 0.1,
          unit: '',
          advice: () => {
            const clsAudit = report.audits['cumulative-layout-shift'];
            if (clsAudit?.details?.items?.length > 0) {
              const elements = clsAudit.details.items
                .slice(0, 2)
                .map((item) => item.node?.nodeLabel || 'element')
                .join(', ');
              return `Add size attributes for: ${elements}`;
            }
            return 'Add size attributes to images, avoid inserting content above existing content';
          },
        },
        {
          test: 'Total Blocking Time',
          value: report.audits['total-blocking-time'].numericValue,
          threshold: 300,
          unit: 'ms',
          advice: () => generateRecommendations(report, 'tbt'),
          diagnostics: () => getDiagnostics(report, 'tbt'),
        },
        {
          test: 'Total Page Weight',
          value: report.audits['total-byte-weight'].numericValue,
          threshold: 614400,
          unit: 'KB',
          advice: () => generateRecommendations(report, 'pageweight'),
          diagnostics: () => getDiagnostics(report, 'pageweight'),
        },
      ];

      console.log('┌─────────────────────────────┬──────────┬──────────────────────────────────────────────────────────────────────────┐');
      console.log('│ Test                        │ Status   │ Current Value → Target                                               │');
      console.log('├─────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────────────────┤');

      let allPassed = true;
      checks.forEach((check) => {
        const {
          test, value, threshold, unit, advice, diagnostics: checkDiagnostics,
        } = check;
        const displayValue = formatValue(value, unit, test);
        const displayThreshold = formatValue(threshold, unit, test);
        const passed = checkPassed(value, threshold, test);
        const status = passed ? '✓ PASS' : '✗ FAIL';
        const comparison = test === 'Performance Score'
          ? `${displayValue}${unit} ≥ ${displayThreshold}${unit}`
          : `${displayValue}${unit} → ${displayThreshold}${unit}`;

        if (!passed) allPassed = false;

        const testPadded = test.padEnd(27);
        const statusPadded = status.padEnd(8);
        const comparisonPadded = comparison.padEnd(72);

        console.log(`│ ${testPadded} │ ${statusPadded} │ ${comparisonPadded} │`);

        if (!passed) {
          const adviceText = typeof advice === 'function' ? advice() : advice;
          console.log(`│                             │          │ ${adviceText.padEnd(72)} │`);
          if (checkDiagnostics) {
            const details = checkDiagnostics();
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
