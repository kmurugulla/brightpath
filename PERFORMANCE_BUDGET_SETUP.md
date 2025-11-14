# Performance Budget Setup Guide

This guide explains how to set up automated performance testing and budget enforcement for your AEM Edge Delivery project.

## 📋 Overview

This setup provides:
- **Automated Lighthouse performance testing** on pull requests
- **Bundle size checks** for JavaScript, CSS, and fonts
- **Visual PR comments** with detailed metrics and diagnostics
- **Customizable performance budgets** per metric
- **Collapsible results** (failed tests expanded, passing tests collapsed)

---

## 🚀 Quick Start

Follow these steps to set up performance budgets in 10-15 minutes.

### Step 1: Install Dependencies

```bash
npm install --save-dev @lhci/cli@^0.14.0 bundlesize@^0.18.2
```

**Required packages:**
- `@lhci/cli` - Lighthouse CI for performance testing
- `bundlesize` - File size checking

### Step 2: Copy Required Files

Copy these 4 files from this project to yours:

| File | Destination | Customize? |
|------|-------------|------------|
| `lighthouserc.js` | Project root | ✅ Yes - adjust thresholds |
| `scripts/perf.js` | `scripts/` folder | ❌ No - use as-is |
| `scripts/size.js` | `scripts/` folder | ❌ No - use as-is |
| `.github/workflows/performance-budget.yml` | `.github/workflows/` | ✅ Yes - set test paths |

### Step 3: Update package.json

Add these two sections to your `package.json`:

```json
{
  "scripts": {
    "perftest": "node scripts/perf.js",
    "perftest:size": "node scripts/size.js"
  },
  "bundlesize": [
    {
      "path": "./scripts/*.js",
      "maxSize": "50 KB",
      "compression": "gzip"
    },
    {
      "path": "./blocks/**/*.js",
      "maxSize": "15 KB",
      "compression": "gzip"
    },
    {
      "path": "./styles/*.css",
      "maxSize": "10 KB",
      "compression": "gzip"
    },
    {
      "path": "./blocks/**/*.css",
      "maxSize": "5 KB",
      "compression": "gzip"
    },
    {
      "path": "./fonts/*.woff2",
      "maxSize": "100 KB",
      "compression": "gzip"
    }
  ]
}
```

### Step 4: Configure Test Paths

Edit `.github/workflows/performance-budget.yml` (line 13):

```yaml
env:
  PERF_TEST_PATHS: '/ /page1 /page2'  # ← Add your pages here
```

**Common paths to test:**
- `/` - Homepage (usually most important)
- `/products` - Key landing pages
- `/blog/sample-post` - Content pages

### Step 5: Test Locally

Before pushing, test the setup:

```bash
# Start your local server first
npx -y @adobe/aem-cli up --no-open

# In another terminal, run performance tests
npm run perftest -- --url http://localhost:3000 / /page1 /page2

# Check bundle sizes
npm run perftest:size
```

### Step 6: Commit and Create PR

```bash
git add .
git commit -m "feat: add performance budget testing"
git push
```

Then create a pull request to verify the workflow runs and posts results as a comment.

### ✅ Expected Results

After setup, every PR will automatically:
- Run Lighthouse tests on your specified pages
- Check bundle sizes for all assets
- Post detailed results as PR comments with collapsible sections
- Block merging if budgets are exceeded

**Checklist:**
- [ ] Dependencies installed
- [ ] 4 files copied
- [ ] npm scripts and bundlesize config added to package.json
- [ ] Test paths configured
- [ ] Tested locally
- [ ] PR created and workflow runs successfully

---

## ⚙️ Configuration Details

### Lighthouse Performance Budgets

Edit `lighthouserc.js` to customize performance thresholds:

```javascript
export default {
  ci: {
    collect: {
      numberOfRuns: 1,  // Number of test runs per page
      settings: {
        preset: 'perf',
        formFactor: 'mobile',  // 'mobile' or 'desktop'
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
        },
      },
    },
    assert: {
      assertions: {
        'first-contentful-paint': ['error', { maxNumericValue: 2500 }],        // FCP < 2.5s
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],      // LCP < 2.5s
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],        // CLS < 0.1
        'total-blocking-time': ['error', { maxNumericValue: 300 }],            // TBT < 300ms
        'categories:performance': ['error', { minScore: 0.9 }],                // Performance > 90
        'total-byte-weight': ['error', { maxNumericValue: 614400 }],           // 600KB total
      },
    },
  },
};
```

**Key metrics you can configure:**
- `first-contentful-paint` - When first content renders (ms)
- `largest-contentful-paint` - When main content is visible (ms)
- `cumulative-layout-shift` - Visual stability score
- `total-blocking-time` - Main thread blocking time (ms)
- `categories:performance` - Overall performance score (0-1)
- `total-byte-weight` - Total page weight (bytes)

### Bundle Size Budgets

**Recommended budgets:**
- Global scripts: 50 KB (gzipped)
- Block JavaScript: 15 KB per block (gzipped)
- Global CSS: 10 KB (gzipped)
- Block CSS: 5 KB per block (gzipped)
- Fonts: 100 KB per font (gzipped)

Adjust these in `package.json` based on your project needs.

### GitHub Workflow Permissions

Ensure your workflow has the correct permissions:

```yaml
permissions:
  contents: read
  issues: write
  pull-requests: write
```

---

## 🎯 What Gets Tested

### Performance Metrics (via Lighthouse)

Each page is tested for:
- ✅ **Performance Score** (must be ≥ 90)
- ✅ **First Contentful Paint** (FCP < 2.5s)
- ✅ **Largest Contentful Paint** (LCP < 2.5s)
- ✅ **Cumulative Layout Shift** (CLS < 0.1)
- ✅ **Total Blocking Time** (TBT < 300ms)
- ✅ **Render Blocking Resources** (< 100KB)
- ✅ **Total Page Weight** (< 600KB)

### Bundle Size Checks

All committed files are checked for:
- Individual script sizes (gzipped)
- Individual CSS file sizes (gzipped)
- Font file sizes (gzipped)

---

## 📊 PR Comment Format

When the workflow runs, it posts a comment on your PR:

```markdown
## 🚀 Performance Test Results

**Status:** ⚠️ Some Failed • **Pages:** 2/3 passed

### 📄 Results by Page

<details open>
<summary>❌ `/` • Performance Score: 80/100</summary>

#### Performance Metrics
| Test | Status | Current Value | Target |
|------|--------|---------------|--------|
| LCP  | ❌     | **2.8s**     | < 2.5s |

#### 🔍 Issues Found
**Largest Contentful Paint** (2.8s)
- First paint is delayed (CSS/font blocking)
- TTFB: 150ms, FCP: 2.4s, LCP delay: 341ms

[🔗 View Page](https://branch--repo--owner.aem.live/)
</details>
```

**Features:**
- Failed pages expanded by default
- Passing pages collapsed
- Root cause analysis for failures
- Direct links to tested pages

---

## 🔧 Customization Options

### Adjust Performance Thresholds

Make tests stricter or more lenient in `lighthouserc.js`:

```javascript
// Stricter (for high-performance sites)
'largest-contentful-paint': ['error', { maxNumericValue: 1800 }],  // < 1.8s
'categories:performance': ['error', { minScore: 0.95 }],           // > 95

// More lenient (for complex applications)
'largest-contentful-paint': ['error', { maxNumericValue: 3000 }],  // < 3.0s
'categories:performance': ['error', { minScore: 0.85 }],           // > 85
```

### Change Mobile/Desktop Testing

Edit `lighthouserc.js`:

```javascript
// Test desktop instead
settings: {
  preset: 'perf',
  formFactor: 'desktop',
  screenEmulation: {
    mobile: false,
    width: 1350,
    height: 940,
    deviceScaleFactor: 1,
  },
}
```

### Disable Specific Checks

Remove checks you don't want:

```javascript
// In lighthouserc.js, remove or comment out lines:
assert: {
  assertions: {
    'first-contentful-paint': ['error', { maxNumericValue: 2500 }],
    // 'total-blocking-time': ['error', { maxNumericValue: 300 }],  // Disabled
  },
}
```

---

## 🐛 Troubleshooting

### Tests Fail in CI but Pass Locally

**Cause:** Network conditions or server response times differ.

**Solution:**
1. Check the branch preview URL is accessible
2. Wait for preview site to warm up (workflow already has 30 retries)
3. Adjust TTFB budgets if your server is consistently slow

### "Command not found: lhci"

**Cause:** Dependencies not installed.

**Solution:** Run `npm install` or `npm ci`

### Bundle Size Checks Fail

**Cause:** Files exceed gzipped size limits.

**Solutions:**
1. Split large blocks into smaller components
2. Lazy-load non-critical code
3. Remove unused code
4. Check for duplicate dependencies
5. Adjust limits in `package.json` if necessary

### Workflow Can't Post Comments

**Cause:** Missing GitHub permissions.

**Solution:** Ensure workflow has `pull-requests: write` permission in the workflow file.

### Different Results on Each Run

**Cause:** Lighthouse can vary ±5% between runs.

**Solutions:**
1. Increase `numberOfRuns` in `lighthouserc.js` (averages results)
2. Focus on consistent failures, not borderline passes
3. Add margin to your budgets (e.g., target 2.2s instead of 2.5s)

---

## 📈 Best Practices

### 1. Set Realistic Budgets

Don't just copy these settings blindly:
- Test your current performance first
- Set budgets slightly better than current
- Gradually make them stricter over time

### 2. Test Representative Pages

Include pages that represent:
- Most common user journeys
- Heaviest pages (most blocks/images)
- Highest traffic pages
- Different types of content

### 3. Focus on Core Web Vitals

Prioritize these metrics (they affect Google rankings):
- **LCP** (Largest Contentful Paint) < 2.5s
- **CLS** (Cumulative Layout Shift) < 0.1
- **INP** (Interaction to Next Paint) < 200ms

### 4. Review Failed Tests Carefully

Not all failures mean "don't merge":
- Check if failure is consistent
- Consider if it's expected (e.g., very image-heavy page)
- Look at root cause analysis in PR comment
- Fix structural issues, not just symptoms

### 5. Monitor Trends

Track performance over time:
- Download Lighthouse artifacts from workflow runs
- Compare before/after on major changes
- Set up monitoring in production

---

## 📝 Maintenance

### Regular Updates

Keep dependencies updated:

```bash
npm update @lhci/cli bundlesize
```

### Review Budgets Quarterly

As your site evolves:
- Review if budgets are still appropriate
- Tighten budgets if performance improves
- Adjust for new features/blocks

### Test New Blocks

When adding new blocks:
1. Test locally first: `npm run perftest -- --url http://localhost:3000 /page-with-new-block`
2. Check bundle size: `npm run perftest:size`
3. Ensure block CSS/JS meets size budgets

---

## 🎓 Learning Resources

- [Lighthouse Scoring Guide](https://web.dev/performance-scoring/)
- [Core Web Vitals](https://web.dev/vitals/)
- [AEM Performance Best Practices](https://www.aem.live/developer/keeping-it-100)
- [Performance Budgets Guide](https://web.dev/performance-budgets-101/)

---

## 🤝 Contributing

Found an issue or have suggestions for this setup?
1. Test locally first
2. Document the issue with examples
3. Propose specific configuration changes
4. Submit a PR with clear before/after comparison

---

## ❓ FAQ

### How long does setup take?

- **Quick setup:** 10-15 minutes (following Quick Start)
- **Full customization:** 30-45 minutes
- **First PR test:** 5-10 minutes

### Will this slow down my PRs?

Typical workflow time: 3-5 minutes
- Most time is waiting for Lighthouse tests
- Runs in parallel with other checks
- Only runs on PRs, not all commits

### Can I use this with other CI systems?

The scripts (`perf.js`, `size.js`) work anywhere Node.js runs. You'll need to adapt the workflow file for GitLab CI, CircleCI, etc.

### What if I don't use GitHub?

- The testing scripts work anywhere
- You'll need to adapt the PR comment posting for your platform
- Or just run tests and check exit codes

### How do I test different devices?

Edit `lighthouserc.js` settings:
- Change `formFactor: 'mobile'` to `'desktop'`
- Adjust screen dimensions
- Modify network throttling

---

**Questions?** Check the [Troubleshooting](#-troubleshooting) section or review the workflow logs for detailed error messages.
