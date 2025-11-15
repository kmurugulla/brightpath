#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'child_process';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';

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

    files.forEach((file, index) => {
      const reportPath = join(lhciDir, file);
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      const testedUrl = report.finalUrl || report.requestedUrl;

      if (index > 0) console.log('\n');
      console.log(`\n${'='.repeat(90)}`);
      console.log(`📄 Testing: ${testedUrl}`);
      console.log(`${'='.repeat(90)}\n`);

      // Helper to determine if URL is third-party
      const isThirdParty = (url, baseUrl) => {
        try {
          const urlHost = new URL(url).hostname;
          const baseHost = new URL(baseUrl).hostname;
          return urlHost !== baseHost && urlHost !== 'localhost';
        } catch {
          return false;
        }
      };

      const getDiagnostics = (rep, type) => {
        const diagnostics = [];

        if (type === 'lcp') {
          const lcpTime = rep.audits['largest-contentful-paint'].numericValue;
          const networkRequests = rep.audits['network-requests'];
          const ttfb = rep.audits['server-response-time']?.numericValue || 0;
          const fcp = rep.audits['first-contentful-paint']?.numericValue || 0;

          // Show LCP Element prominently at the top
          const lcpElement = rep.audits['largest-contentful-paint-element'];
          const lcpNode = lcpElement?.details?.items?.[0];
          if (lcpNode && lcpNode.node) {
            const snippet = lcpNode.node.snippet || '';
            const nodeLabel = lcpNode.node.nodeLabel || lcpNode.node.nodeName || 'Unknown';
            diagnostics.push(`  • 🎯 LCP Element: ${nodeLabel}`);
            if (snippet && snippet.length < 100) {
              diagnostics.push(`    ${snippet}`);
            }
          } else {
            // Try to get from lcp-lazy-loaded audit or metrics
            const lcpMetric = rep.audits['largest-contentful-paint'];
            if (lcpMetric?.displayValue) {
              diagnostics.push(`  • 🎯 LCP Element: ${lcpMetric.displayValue}`);
            }
          }

          if (networkRequests?.details?.items) {
            // Filter resources that finished before LCP using networkEndTime (already in ms)
            const beforeLCP = networkRequests.details.items
              .filter((item) => {
                const endTime = item.networkEndTime || 0;
                return endTime > 0 && endTime <= lcpTime;
              })
              .filter((item) => !item.url.includes('livereload'));

            // Separate first-party and third-party resources
            const firstParty = beforeLCP.filter((item) => !isThirdParty(item.url, rep.finalUrl));
            const thirdParty = beforeLCP.filter((item) => isThirdParty(item.url, rep.finalUrl));

            const byType = {
              Script: firstParty.filter((r) => r.resourceType === 'Script'),
              Stylesheet: firstParty.filter((r) => r.resourceType === 'Stylesheet'),
              Image: firstParty.filter((r) => r.resourceType === 'Image'),
              Font: firstParty.filter((r) => r.resourceType === 'Font'),
              Document: firstParty.filter((r) => r.resourceType === 'Document'),
              Other: firstParty.filter((r) => !['Script', 'Stylesheet', 'Image', 'Font', 'Document'].includes(r.resourceType)),
            };

            const totalSize = firstParty.reduce((sum, item) => sum + (item.transferSize || 0), 0);
            const totalSizeKB = Math.round(totalSize / 1024);

            diagnostics.push(`  • Resources loaded BEFORE LCP (${Math.round(lcpTime)}ms):`);
            diagnostics.push(`    📦 First-Party Resources:`);
            Object.entries(byType).forEach(([resourceType, items]) => {
              if (items.length > 0) {
                const typeSize = items.reduce((sum, item) => sum + (item.transferSize || 0), 0);
                const typeSizeKB = Math.round(typeSize / 1024);
                diagnostics.push(`      ${resourceType}: ${typeSizeKB}KB (${items.length} file${items.length > 1 ? 's' : ''})`);
                
                // Different thresholds per resource type (best practices)
                const thresholds = {
                  Script: 5120,        // 5KB - scripts block execution
                  Stylesheet: 3072,    // 3KB - render-blocking CSS
                  Font: 0,             // Always show - fonts are critical for rendering
                  Image: 20480,        // 20KB - focus on larger images
                  Document: 10240,     // 10KB
                  Other: 10240,        // 10KB
                };
                const threshold = thresholds[resourceType] || 10240;
                
                const significantFiles = items
                  .filter((item) => (item.transferSize || 0) > threshold)
                  .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));
                
                significantFiles.forEach((item) => {
                  const fileName = item.url.split('/').pop() || item.url.substring(item.url.lastIndexOf('/') + 1);
                  const size = Math.round((item.transferSize || 0) / 1024);
                  diagnostics.push(`        • ${fileName} (${size}KB)`);
                });
                
                if (significantFiles.length < items.length) {
                  const smallCount = items.length - significantFiles.length;
                  const thresholdKB = Math.round(threshold / 1024);
                  diagnostics.push(`        ... and ${smallCount} smaller file${smallCount > 1 ? 's' : ''} (<${thresholdKB}KB each)`);
                }
              }
            });
            diagnostics.push(`      TOTAL: ${totalSizeKB}KB ${totalSizeKB > 100 ? '⚠️  (exceeds 100KB recommendation)' : '✓'}`);

            // Show third-party resources separately
            if (thirdParty.length > 0) {
              const thirdPartySize = thirdParty.reduce((sum, item) => sum + (item.transferSize || 0), 0);
              const thirdPartySizeKB = Math.round(thirdPartySize / 1024);
              const thirdPartyByType = {
                Script: thirdParty.filter((r) => r.resourceType === 'Script'),
                Stylesheet: thirdParty.filter((r) => r.resourceType === 'Stylesheet'),
                Other: thirdParty.filter((r) => !['Script', 'Stylesheet'].includes(r.resourceType)),
              };

              diagnostics.push(`    🌐 Third-Party Resources:`);
              Object.entries(thirdPartyByType).forEach(([resourceType, items]) => {
                if (items.length > 0) {
                  const typeSize = items.reduce((sum, item) => sum + (item.transferSize || 0), 0);
                  const typeSizeKB = Math.round(typeSize / 1024);
                  diagnostics.push(`      ${resourceType}: ${typeSizeKB}KB (${items.length} file${items.length > 1 ? 's' : ''})`);
                  
                  // Lower thresholds for third-party (they're usually more impactful)
                  const thresholds = {
                    Script: 3072,        // 3KB - third-party scripts are critical
                    Stylesheet: 3072,    // 3KB - third-party CSS
                    Other: 5120,         // 5KB
                  };
                  const threshold = thresholds[resourceType] || 5120;
                  
                  const significantFiles = items
                    .filter((item) => (item.transferSize || 0) > threshold)
                    .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0));
                  
                  significantFiles.forEach((item) => {
                    const url = new URL(item.url);
                    const fileName = url.pathname.split('/').pop() || url.pathname;
                    const size = Math.round((item.transferSize || 0) / 1024);
                    diagnostics.push(`        • ${fileName} from ${url.hostname} (${size}KB)`);
                  });
                  
                  if (significantFiles.length < items.length) {
                    const smallCount = items.length - significantFiles.length;
                    const thresholdKB = Math.round(threshold / 1024);
                    diagnostics.push(`        ... and ${smallCount} smaller file${smallCount > 1 ? 's' : ''} (<${thresholdKB}KB each)`);
                  }
                }
              });
              diagnostics.push(`      TOTAL: ${thirdPartySizeKB}KB ${thirdPartySizeKB > 50 ? '⚠️  (third-party scripts impacting LCP)' : ''}`);
            }

            const allBeforeLCP = [...firstParty, ...thirdParty];
            // Exclude framework/core files and optimized images
            const coreFiles = ['aem.js', 'scripts.js'];
            const topHeavy = allBeforeLCP
              .filter((item) => {
                const fileName = item.url.split('/').pop() || '';
                // Exclude core framework files
                if (coreFiles.includes(fileName)) return false;
                // Exclude AEM optimized images (media_* with optimize param)
                if (item.url.includes('media_') && item.url.includes('optimize=')) return false;
                return true;
              })
              .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
              .slice(0, 5)
              .filter((item) => (item.transferSize || 0) > 10240);

            if (topHeavy.length > 0) {
              diagnostics.push('  • 📊 Heaviest resources before LCP:');
              topHeavy.forEach((item) => {
                const { url, transferSize, resourceType } = item;
                const fileName = url.split('/').pop() || url.substring(url.lastIndexOf('/') + 1, url.lastIndexOf('/') + 30);
                const size = Math.round((transferSize || 0) / 1024);
                const isTP = isThirdParty(url, rep.finalUrl) ? ' [3rd-party]' : '';
                diagnostics.push(`    - ${fileName} (${resourceType}, ${size}KB)${isTP}`);
              });
            }
            
            // Check for font-display issues
            const fonts = allBeforeLCP.filter((item) => item.resourceType === 'Font');
            if (fonts.length > 0) {
              const totalFontSize = fonts.reduce((sum, f) => sum + (f.transferSize || 0), 0);
              const totalFontKB = Math.round(totalFontSize / 1024);
              if (totalFontKB > 50) {
                diagnostics.push('  • ⚠️  Font Loading Issues:');
                diagnostics.push(`    - ${fonts.length} font${fonts.length > 1 ? 's' : ''} loaded before LCP (${totalFontKB}KB)`);
                diagnostics.push('    - Consider using font-display: swap or optional in CSS');
                diagnostics.push('    - This allows system fonts to show while custom fonts load');
              }
            }

            // Root cause analysis
            diagnostics.push('  • 🔍 Root cause analysis:');
            diagnostics.push(`    - TTFB (server response): ${Math.round(ttfb)}ms`);
            diagnostics.push(`    - FCP (first paint): ${Math.round(fcp)}ms`);
            diagnostics.push(`    - LCP delay: ${Math.round(lcpTime - fcp)}ms after first paint`);

            if (ttfb > 600) {
              diagnostics.push('    → Primary issue: Slow server response');
            } else if (thirdParty.length > 3 && thirdPartySizeKB > 50) {
              diagnostics.push('    → Primary issue: Third-party scripts delaying LCP');
            } else if (lcpTime - fcp > 1000) {
              diagnostics.push('    → Primary issue: LCP element renders late after initial paint');
            } else if (fcp > 1800) {
              diagnostics.push('    → Primary issue: First paint delayed by render-blocking CSS/fonts');
            } else if (totalSizeKB > 100) {
              diagnostics.push('    → Primary issue: Too many/large resources loaded before LCP');
            } else {
              diagnostics.push('    → LCP timing is close to threshold (may vary on different runs)');
            }
          }

          const renderBlocking = rep.audits['render-blocking-resources'];
          if (renderBlocking?.details?.items?.length > 0) {
            diagnostics.push('  • ⚠️  Render-blocking resources:');
            renderBlocking.details.items.slice(0, 5).forEach((item) => {
              const fileName = item.url.split('/').pop();
              const wastedMs = Math.round(item.wastedMs || 0);
              const isTP = isThirdParty(item.url, rep.finalUrl) ? ' [3rd-party]' : '';
              diagnostics.push(`    - ${fileName} (delays by ${wastedMs}ms)${isTP}`);
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
              .slice(0, 5);

            if (cssJs.length > 0) {
              diagnostics.push('  • Largest CSS/JS files:');
              cssJs.forEach((item) => {
                const size = ((item.transferSize || 0) / 1024).toFixed(0);
                const fileName = item.url.split('/').pop() || item.url.substring(item.url.lastIndexOf('/') + 1, item.url.lastIndexOf('/') + 30);
                const fileType = item.resourceType === 'Script' ? 'JS' : 'CSS';
                const isTP = isThirdParty(item.url, rep.finalUrl) ? ' [3rd-party]' : '';
                diagnostics.push(`    - ${fileType}: ${fileName} (${size}KB)${isTP}`);
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
                const isTP = isThirdParty(item.url, rep.finalUrl) ? ' [3rd-party]' : '';
                return `${fileName} (${size}KB)${isTP}`;
              });
            const js = networkRequests.details.items
              .filter((item) => item.resourceType === 'Script' && !item.url.includes('livereload'))
              .map((item) => {
                const size = ((item.transferSize || 0) / 1024).toFixed(0);
                const fileName = item.url.split('/').pop();
                const isTP = isThirdParty(item.url, rep.finalUrl) ? ' [3rd-party]' : '';
                return `${fileName} (${size}KB)${isTP}`;
              });
            if (css.length) diagnostics.push(`  • CSS files: ${css.slice(0, 3).join(', ')}`);
            if (js.length) diagnostics.push(`  • JS files: ${js.slice(0, 3).join(', ')}`);
          }
        }

        return diagnostics;
      };

      // Generate dynamic recommendations based on Lighthouse opportunities
      const generateRecommendations = (rep, metricKey) => {
        const recommendations = [];
        const opportunities = rep.audits;

        // Map of audit keys to check for each metric
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

        const relevantAudits = auditMappings[metricKey] || [];
        
        relevantAudits.forEach((auditKey) => {
          const audit = opportunities[auditKey];
          if (audit && audit.details?.overallSavingsMs > 100) {
            const savingsMs = Math.round(audit.details.overallSavingsMs);
            const savingsKB = audit.details.overallSavingsBytes 
              ? Math.round(audit.details.overallSavingsBytes / 1024) 
              : null;
            
            let rec = audit.title;
            if (savingsMs && savingsKB) {
              rec += ` (save ${savingsMs}ms, ${savingsKB}KB)`;
            } else if (savingsMs) {
              rec += ` (save ${savingsMs}ms)`;
            }
            recommendations.push(rec);
          } else if (audit && audit.score !== null && audit.score < 0.9) {
            recommendations.push(audit.title);
          }
        });

        // If no specific recommendations, provide generic guidance
        if (recommendations.length === 0) {
          const genericAdvice = {
            performance: 'Optimize images, reduce JavaScript, improve server response times',
            lcp: 'Optimize server response time, reduce render-blocking resources',
            fcp: 'Inline critical CSS, defer non-critical scripts',
            tbt: 'Reduce JavaScript execution time, code-split large bundles',
            pageweight: 'Compress images, minify CSS/JS, remove unused code',
          };
          return genericAdvice[metricKey] || 'Review Lighthouse report for optimization opportunities';
        }

        return recommendations.slice(0, 3).join('; ');
      };

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
        },
        {
          test: 'Total Page Weight',
          value: report.audits['total-byte-weight'].numericValue,
          threshold: 614400,
          unit: 'KB',
          advice: () => generateRecommendations(report, 'pageweight'),
        },
      ];

      console.log('┌─────────────────────────────┬──────────┬──────────────────────────────────────────────────────────────────────────┐');
      console.log('│ Test                        │ Status   │ Current Value → Target                                               │');
      console.log('├─────────────────────────────┼──────────┼──────────────────────────────────────────────────────────────────────────┤');

      let allPassed = true;
      checks.forEach((check) => {
        const isScore = check.isScore || false;
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
        const unit = check.unit;
        const comparison = isScore
          ? `${displayValue}${unit} ≥ ${displayThreshold}${unit}`
          : `${displayValue}${unit} → ${displayThreshold}${unit}`;

        if (!passed) allPassed = false;

        const testPadded = check.test.padEnd(27);
        const statusPadded = status.padEnd(8);
        const comparisonPadded = comparison.padEnd(72);

        console.log(`│ ${testPadded} │ ${statusPadded} │ ${comparisonPadded} │`);

        if (!passed) {
          const advice = typeof check.advice === 'function' ? check.advice() : check.advice;
          console.log(`│                             │          │ ${advice.padEnd(72)} │`);
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
        const isScore = check.isScore || false;
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

        const status = passed ? '✅' : '❌';
        const unit = check.unit;
        const comparison = isScore
          ? `≥ ${displayThreshold}${unit}`
          : `< ${displayThreshold}${unit}`;

        markdown += `| ${check.test} | ${status} | **${displayValue}${unit}** | ${comparison} |\n`;
      });

      // Add issues section if there are failures
      if (!allPassed) {
        markdown += '\n#### 🔍 Issues Found\n\n';
        checks.forEach((check) => {
          const isScore = check.isScore || false;
          const isCLS = check.test === 'Cumulative Layout Shift';
          let passed;
          if (isScore) {
            passed = check.value >= check.threshold;
          } else {
            passed = check.value <= check.threshold;
          }

          if (!passed) {
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
            const unit = check.unit;

            markdown += `**${check.test}** (${displayValue}${unit})\n`;
            const advice = typeof check.advice === 'function' ? check.advice() : check.advice;
            markdown += `- ${advice}\n`;

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

    // Write markdown summary
    const passedCount = files.filter((file, index) => {
      const reportPath = join(lhciDir, file);
      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      const perfScore = report.categories.performance.score;
      return perfScore >= 0.9;
    }).length;
    const totalCount = files.length;

    let fullMarkdown = `## 🚀 Performance Test Results\n\n`;
    fullMarkdown += `**Status:** ${globalAllPassed ? '✅ All Passed' : '⚠️ Some Failed'} • `;
    fullMarkdown += `**Pages:** ${passedCount}/${totalCount} passed\n\n`;
    fullMarkdown += `---\n\n`;
    fullMarkdown += `### 📄 Results by Page\n`;
    fullMarkdown += markdownResults.join('\n');
    fullMarkdown += `\n---\n\n`;
    fullMarkdown += `<sub>🤖 Automated by Lighthouse CI • `;
    fullMarkdown += `[View Full Reports](https://github.com/$\{GITHUB_REPOSITORY}/actions/runs/$\{GITHUB_RUN_ID})</sub>\n`;

    // Ensure .lighthouseci directory exists
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
