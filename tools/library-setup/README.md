# Library Setup Tool

Generate block documentation for your DA.live library from GitHub repositories.

## Installation

**Important:** Run these commands from your project root (where the `tools/` folder should be created or updated).

### Option 1: Using npx (Recommended)

```bash
npx degit kmurugulla/brightpath/tools/library-setup tools/library-setup
```

### Option 2: Using curl

```bash
curl -L https://github.com/kmurugulla/brightpath/archive/refs/heads/main.tar.gz | \
  tar -xz --strip=3 "brightpath-main/tools/library-setup" && \
  mv library-setup tools/
```

## Getting Started

- Access via: `https://da.live/app/{org}/{site}/tools/library-setup/library-setup?ref=local`
- `ref=local` points to your local development server
- Customize the code as needed for your project

## Setup Mode

![Library Setup Mode](./images/setup-mode.png)

Use this mode to create a new block library from scratch:

- Enter your GitHub repository URL to discover blocks
- Private repositories supported - enter a GitHub token when prompted
- Select which blocks to include in your library
- New blocks detected automatically - visual indicators show blocks not yet in blocks.json
- Use "Select New Only" button to quickly select just the newly discovered blocks
- Blocks are automatically analyzed for structure, variants, and features
- Placeholder documentation generated based on block code analysis
- Optionally select sample pages to extract real content examples
- Creates library structure in DA.live with blocks.json configuration
- Updates site configuration to register the library

## Refresh Documentation Mode

![Refresh Documentation Mode](./images/refresh-mode.png)

Use this mode to update existing block documentation with new content:

- No GitHub repository required - reads from existing library
- Enter your DA.live organization and site name
- Select which blocks to update
- Add new sample pages to extract fresh content examples
- Only updates blocks found in the selected pages
- Preserves existing blocks not being updated
- Maintains all library configuration settings

## Requirements

- Must be run from within DA.live for authentication
- Write access to CONFIG for your organization (required to update site configuration) - [See permissions guide](https://docs.da.live/administrators/guides/permissions)
- GitHub token needed only for private repositories (can be saved for future use)
- Sample pages optional - tool generates intelligent placeholders without them
