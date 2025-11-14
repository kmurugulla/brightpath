# Brightpath
EDS Experiementation 

## Environments
- Preview: https://main--brightpath--kmurugulla.aem.page/
- Live: https://main--brightpath--kmurugulla.aem.live/

## Documentation

Before using the aem-boilerplate, we recommand you to go through the documentation on https://www.aem.live/docs/ and more specifically:
1. [Developer Tutorial](https://www.aem.live/developer/tutorial)
2. [The Anatomy of a Project](https://www.aem.live/developer/anatomy-of-a-project)
3. [Web Performance](https://www.aem.live/developer/keeping-it-100)
4. [Markup, Sections, Blocks, and Auto Blocking](https://www.aem.live/developer/markup-sections-blocks)

## Installation

```sh
npm i
```

## Linting

```sh
npm run lint
```

## Performance Budget

For detailed setup instructions and documentation, see [PERFORMANCE_BUDGET_SETUP.md](./PERFORMANCE_BUDGET_SETUP.md).

### Automated Testing (GitHub Actions)

Performance tests **automatically run on every PR** against the branch's preview URL:
- **Triggers:** When you create a PR to `main`
- **Tests:** Branch preview URL (e.g., `https://{branch}--{repo}--{owner}.aem.live`)
- **Paths:** Configured in `.github/workflows/performance-budget.yml` (env `PERF_TEST_PATHS`)
- **Results:** Posted as a comment on the PR

**To configure tested paths**, edit `.github/workflows/performance-budget.yml`:

```yaml
env:
  PERF_TEST_PATHS: '/ /da-demo /ue-editor/demo'
```

### Manual Testing (Local)

```sh
# Test localhost
npm run perftest
npm run perftest -- /about /contact

# Test branch preview URL
npm run perftest -- --url https://{branch}--{repo}--{owner}.aem.live / /about

# Test production
npm run perftest -- --url https://{branch}--{repo}--{owner}.aem.live

# Check file sizes
npm run perftest:size
```

## Local development

1. Create a new repository based on the `aem-boilerplate` template
1. Add the [AEM Code Sync GitHub App](https://github.com/apps/aem-code-sync) to the repository
1. Install the [AEM CLI](https://github.com/adobe/helix-cli): `npm install -g @adobe/aem-cli`
1. Start AEM Proxy: `aem up` (opens your browser at `http://localhost:3000`)
1. Open the `{repo}` directory in your favorite IDE and start coding :)
