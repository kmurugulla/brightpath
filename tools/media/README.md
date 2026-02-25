# Media Indexer

A tool for building and maintaining a media index from DA Live's medialog and auditlog APIs.

## Architecture

The indexer is now modular for better maintainability and extensibility:

```
tools/media/
├── indexer.html          # Entry point HTML
├── indexer.css           # Styles
├── indexer.js            # Main entry (initialization & auth)
├── indexer-old.js        # Backup of monolithic version
└── lib/
    ├── config.js         # Configuration & state management
    ├── api.js            # DA Admin API calls
    ├── helpers.js        # Utility functions (normalizePath, isPage, etc.)
    ├── builder.js        # Core index building logic
    └── ui.js             # UI rendering & event handling
```

## Modules

### `lib/config.js`
- URL parameter parsing (org, repo, ref)
- Global state management
- Constants (DA_ADMIN, sitePath)

### `lib/api.js`
- `fetchWithAuth()` - Authenticated fetch wrapper
- `daFetch()` - DA API fetch wrapper
- `loadMeta()` - Load metadata from DA
- `createSheet()` - Create sheet format for DA
- `saveMeta()` - Save metadata to DA
- `fetchFromAdminAPI()` - Fetch from auditlog/medialog with pagination

### `lib/helpers.js`
- `normalizePath()` - Normalize paths (add .md, remove query params)
- `isPage()` - Detect if path is a page vs media file
- `extractName()` - Extract filename from medialog entry
- `detectMediaType()` - Detect media type from contentType

### `lib/builder.js`
- `getIndexStatus()` - Get current index metadata
- `buildInitialIndex()` - Core indexing logic:
  1. Fetch auditlog entries
  2. Fetch medialog entries
  3. Match media to pages (5-second time window)
  4. Deduplicate by hash
  5. Save index to DA

### `lib/ui.js`
- `render()` - Render UI with status, progress, logs, errors
- `attachEventListeners()` - Handle button clicks

### `indexer.js`
- Main entry point
- DA SDK authentication
- Initialize UI

## Index Schema

Each entry in the media index:

```javascript
{
  hash: "abc123",                    // Media hash (unique identifier)
  pages: "/page1.md|/page2.md",     // Pipe-separated list of pages using this media
  url: "https://.../media_abc.jpg",  // Full URL to media
  name: "photo.jpg",                 // Filename (extracted from URL)
  timestamp: 1771704070155,          // Latest usage timestamp
  user: "user@example.com",          // User who uploaded/used it
  operation: "reuse",                // Latest operation (ingest/reuse)
  type: "img > jpeg",                // Media type (category > extension)
  status: "referenced"               // Status (referenced/unused)
}
```

## Indexing Rules

- **Latest event only:** For each page, use only the latest auditlog event. Skip all others. Multiple events in a batch are sorted by timestamp; only the most recent determines the current page state.

## Phase 1 (Current)

✅ Media Bus items (images/videos) from medialog API
✅ Deduplicated by hash
✅ Pipe-separated pages for multi-page usage
✅ Latest usage tracking

## Phase 2 (Current)

- Linked content (PDFs, SVGs, fragments) from auditlog
- HTML parsing for usage detection (extractFragmentReferences, extractLinks)
- Source: "auditlog-parsed"
- Index entries: path, usedIn, timestamp, type, status

## Phase 3 (Future)

- Streaming architecture for large sites
- Chunked processing
- Memory optimization

## Usage

1. Open in browser: `https://main--repo--org.aem.page/tools/media/indexer.html?org=yourorg&repo=yourrepo`
2. Authenticate with DA Live
3. Click "Build Initial Index"
4. Index saved to `/.da/mediaindex/media-index.json`

## Development

Run linting:
```bash
npm run lint:js
npm run lint:css
```

Test locally:
```bash
npx @adobe/aem-cli up
# Open http://localhost:3000/tools/media/indexer.html?org=yourorg&repo=yourrepo
```
