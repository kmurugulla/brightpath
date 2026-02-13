import {
  getLibraryBlocksURL,
} from '../config.js';

export function navTemplate(currentRoute) {
  const sections = [
    {
      title: 'Library',
      routes: [
        { id: 'blocks', label: 'Blocks', enabled: true },
        { id: 'templates', label: 'Templates', enabled: true },
        { id: 'icons', label: 'Icons', enabled: true },
        { id: 'placeholders', label: 'Placeholders', enabled: true },
      ],
    },
    {
      title: 'Integrations',
      routes: [
        { id: 'aem-assets', label: 'AEM Assets', enabled: true },
        { id: 'translation', label: 'Translation', enabled: true },
        { id: 'universal-editor', label: 'Universal Editor', enabled: true },
      ],
    },
  ];

  return `
    <nav class="sidebar">
      <h1>Site Admin</h1>
      ${sections.map((section) => `
        <div class="nav-section">
          <h2 class="nav-section-title">${section.title}</h2>
          <ul class="nav-list">
            ${section.routes.map((route) => `
              <li class="nav-item">
                <a 
                  href="${route.enabled ? `#/${route.id}` : '#'}" 
                  class="nav-link ${currentRoute === route.id ? 'active' : ''} ${!route.enabled ? 'disabled' : ''}"
                  ${!route.enabled ? 'onclick="return false;"' : ''}>
                  ${route.label}
                </a>
              </li>
            `).join('')}
          </ul>
        </div>
      `).join('')}
    </nav>
  `;
}

export function layoutTemplate(currentRoute, content) {
  return `
    <div class="app-container">
      ${navTemplate(currentRoute)}
      <div class="main-content">
        ${content}
      </div>
    </div>
  `;
}

export function appTemplate(content) {
  return `
    <div class="siteadmin-container">
      <div class="siteadmin-header">
        <h1>Site Administration</h1>
        <p>Manage your DA.live site configuration and library</p>
      </div>
      <div class="siteadmin-content">
        ${content}
      </div>
    </div>
  `;
}

export function messageTemplate(message, type) {
  if (!message) return '';
  return `
    <div class="status-banner ${type}">
      <span>${message}</span>
    </div>
  `;
}

export function sectionHeaderTemplate({ title, description, docsUrl }) {
  return `
    <div class="section-header-info">
      <div class="section-header-content">
        <h2 class="section-title">${title}</h2>
        <p class="section-description">${description}</p>
      </div>
      ${docsUrl ? `
        <a href="${docsUrl}" target="_blank" class="section-docs-link">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M9 2H4C3.46957 2 2.96086 2.21071 2.58579 2.58579C2.21071 2.96086 2 3.46957 2 4V12C2 12.5304 2.21071 13.0391 2.58579 13.4142C2.96086 13.7893 3.46957 14 4 14H12C12.5304 14 13.0391 13.7893 13.4142 13.4142C13.7893 13.0391 14 12.5304 14 12V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M11 2H14V5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M6.5 9.5L14 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          View Documentation
        </a>
      ` : ''}
    </div>
  `;
}

export function modeToggleTemplate({ currentMode }) {
  return `
    <div class="mode-toggle">
      <button 
        class="mode-btn ${currentMode === 'setup' ? 'active' : ''}"
        data-mode="setup">
        Library Setup
      </button>
      <button 
        class="mode-btn ${currentMode === 'refresh' ? 'active' : ''}"
        data-mode="refresh">
        Update Examples
      </button>
    </div>
  `;
}

export function contentTypeTogglesTemplate({ selectedTypes }) {
  const types = [
    { id: 'blocks', label: 'Blocks' },
    { id: 'templates', label: 'Templates' },
    { id: 'icons', label: 'Icons' },
    { id: 'placeholders', label: 'Placeholders' },
  ];

  return `
    <div class="content-type-toggles">
      <div class="content-type-grid">
        ${types.map((type) => `
          <label class="content-type-option ${selectedTypes.has(type.id) ? 'selected' : ''}">
            <input 
              type="checkbox" 
              data-content-type="${type.id}"
              ${selectedTypes.has(type.id) ? 'checked' : ''}>
            <span class="content-type-label">${type.label}</span>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

export function githubSectionTemplate({
  isValidated,
  validating,
  githubUrl,
  message,
}) {
  return `
    <div class="form-section">
      <h2>Repository</h2>

      <div class="form-row repo-input-row">
        <input
          type="url"
          id="github-url"
          placeholder="https://github.com/{owner}/{repo}"
          value="${githubUrl}"
          ${isValidated ? 'readonly' : ''}
        />
      </div>

      ${validating ? `
        <div class="loading">
          <div class="spinner"></div>
          <p>Validating...</p>
        </div>
      ` : ''}

      ${message}
    </div>
  `;
}

export function tokenInputTemplate({ hasSavedToken }) {
  return `
    <div class="token-input-section">
      <div class="token-content">
        <div class="token-form">
          <div class="form-row">
            <label>GitHub Token</label>
            <input
              type="password"
              id="github-token"
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              autocomplete="off"
              class="token-input"
            />
          </div>

          <div class="form-row">
            <label class="checkbox-label">
              <input type="checkbox" id="save-token" checked />
              <span>Save for future use</span>
            </label>
          </div>

          <div class="form-row button-row">
            <button id="validate-with-token" class="accent">Validate Repository</button>
            ${hasSavedToken ? `
              <button id="clear-token" class="action">Clear Saved Token</button>
            ` : ''}
          </div>
        </div>

        <div class="token-instructions">
          <h4>Token Permissions</h4>
          <p>We only READ code (never write). Required:</p>
          <ul>
            <li><strong>Fine-Grained Token</strong> (recommended):<br>Repository → Contents → Read-only</li>
            <li><strong>Classic Token</strong>:<br>repo scope (private repos only)</li>
          </ul>
          <p class="permission-note">Public repos don't need a token</p>
          <a href="https://github.com/settings/personal-access-tokens/new"
             target="_blank"
             rel="noopener noreferrer"
             class="create-token-btn">
            Create Fine-Grained Token
          </a>
        </div>
      </div>
    </div>
  `;
}

export function siteSectionTemplate({
  org,
  site,
  message,
  mode = 'setup',
}) {
  const isRefreshMode = mode === 'refresh';

  return `
    <div class="form-section">
      <div class="form-row org-site-row">
        <div class="input-group">
          <label>Organization</label>
          <input
            type="text"
            value="${org}"
            readonly
            class="readonly-input"
          />
        </div>
        <div class="input-group">
          <label>Site</label>
          <input
            type="text"
            ${isRefreshMode ? '' : 'id="site-name"'}
            value="${site}"
            ${isRefreshMode ? 'readonly class="readonly-input"' : 'placeholder="site-name"'}
          />
        </div>
      </div>

      ${message}
    </div>
  `;
}

export function blocksListTemplate({
  blocks,
  selectedBlocks,
  message,
}) {
  const selectedCount = selectedBlocks.size;
  const totalCount = blocks.length;
  const newCount = blocks.filter((b) => b.isNew).length;
  const newCountText = newCount > 0 ? ` (${newCount} new)` : '';

  return `
    <div class="form-section blocks-section">
      <div class="blocks-header">
        <h2>${totalCount === 0 ? 'No Blocks Found' : `Select Blocks <span class="heading-annotation">${selectedCount} of ${totalCount} blocks selected${newCountText}</span>`}</h2>
        ${totalCount > 0 ? `
          <div class="blocks-actions">
            <button id="toggle-all-blocks" class="action">
              ${selectedCount === totalCount ? 'Deselect All' : 'Select All'}
            </button>
            ${newCount > 0 ? `
              <button id="select-new-only" class="action">
                Select New Only
              </button>
            ` : ''}
          </div>
        ` : ''}
      </div>

      ${message}

      ${totalCount > 0 ? `
        <ul class="blocks-list">
          ${blocks.map((block) => `
          <li class="block-item ${selectedBlocks.has(block.name) ? 'selected' : ''}">
            <label>
              <input
                type="checkbox"
                data-block-name="${block.name}"
                ${selectedBlocks.has(block.name) ? 'checked' : ''}
              />
              <span class="block-name">${block.name}</span>
              ${block.isNew ? '<span class="block-badge new">New</span>' : ''}
            </label>
          </li>
        `).join('')}
        </ul>
      ` : ''}
    </div>
  `;
}

export function pagesSelectionTemplate({
  allSites,
  pageSelections,
  message,
  daToken,
  org,
  mode = 'setup',
}) {
  const isRefreshMode = mode === 'refresh';

  return `
    <div class="form-section">
      <h2>Sample Pages <span class="heading-annotation">${isRefreshMode ? '' : '(Optional)'}</span></h2>
      <p class="form-section-subtitle">
        ${isRefreshMode
    ? 'Select pages to extract real block examples from. Only blocks found in these pages will be updated.'
    : 'Select pages to extract real block examples from. Skip to use placeholder content.'}
      </p>

      ${!daToken ? `
        <div class="info-banner">
          DA.live authentication required to browse pages. Please run this tool from within DA.live.
        </div>
      ` : ''}

      ${message}

      ${allSites.map((site) => {
    const basePath = `/${org}/${site}`;
    return `
        <div class="site-section">
          <div class="site-selection">
            <button class="select-pages-btn" data-site="${site}">
              Select (${(pageSelections[site] || new Set()).size})
            </button>
            <span class="site-label">from <strong>${site}</strong></span>
          </div>

          ${(pageSelections[site] || new Set()).size > 0 ? `
            <div class="selected-pages-list">
              ${Array.from(pageSelections[site] || []).map((path) => {
    const displayPath = path.replace(basePath, '') || '/';
    return `
                <div class="selected-page-item">
                  <span class="page-path">${displayPath}</span>
                  <button class="remove-page-btn" data-site="${site}" data-path="${path}">×</button>
                </div>
              `;
  }).join('')}
            </div>
          ` : ''}
        </div>
      `;
  }).join('')}
    </div>
  `;
}

export function startButtonTemplate({ mode, disabled = false, processing = false }) {
  let buttonText = 'Set Up Library';
  if (processing) {
    buttonText = 'Processing...';
  } else if (mode === 'refresh') {
    buttonText = 'Update Examples';
  }

  return `
    <div class="form-section">
      <div class="button-group">
        <button id="start-processing" class="accent" ${disabled ? 'disabled' : ''}>
          ${buttonText}
        </button>
      </div>
    </div>
  `;
}

export function initialStatusTemplate({
  org,
  repo,
  blocksCount,
  mode = 'setup',
  libraryExists = false,
}) {
  return `
    <div class="form-section">
      <div class="status-cards-grid">
        <!-- GitHub Repository (Blue) -->
        <div class="import-card import-card-blue">
          <div class="import-card-header">
            <h3>GitHub Repository</h3>
          </div>
          <div class="import-card-body">
            <p class="repo-path">${org}/${repo}</p>
            <a href="https://github.com/${org}/${repo}" target="_blank" class="import-card-link">
              View Repository →
            </a>
          </div>
        </div>

        <!-- Blocks (Lime Green) -->
        <div class="import-card import-card-lime">
          <div class="import-card-header">
            <h3>Blocks</h3>
          </div>
          <div class="import-card-body">
            <p class="import-card-value">${blocksCount}</p>
            <a href="${getLibraryBlocksURL(org, repo)}" target="_blank" class="import-card-link">
              View Blocks →
            </a>
          </div>
        </div>

        <!-- Site Config (Green) - Only shown in setup mode -->
        ${mode === 'setup' ? `
          <div class="import-card import-card-green import-card-pending">
            <div class="import-card-header">
              <h3>Site Config</h3>
            </div>
            <div class="import-card-body">
              <p>Ready to configure</p>
              ${libraryExists ? `
                <a href="https://da.live/config#/${org}/${repo}/" target="_blank" class="import-card-link">
                  View Config →
                </a>
              ` : ''}
            </div>
          </div>
        ` : ''}

        <!-- Block Docs (Cyan) -->
        <div class="import-card import-card-cyan import-card-pending">
          <div class="import-card-header">
            <h3>Block Docs</h3>
          </div>
          <div class="import-card-body">
            <p>0 of ${blocksCount} processed</p>
            ${libraryExists ? `
              <a href="https://da.live/#/${org}/${repo}/library" target="_blank" class="import-card-link">
                View Library →
              </a>
            ` : ''}
          </div>
        </div>

        <!-- Errors (Red) -->
        <div class="import-card import-card-red import-card-pending">
          <div class="import-card-header">
            <h3>Errors</h3>
          </div>
          <div class="import-card-body">
            <p class="import-card-value">0</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function processingTemplate({
  processStatus,
}) {
  return `
    <div class="form-section">
      <div class="status-cards-grid">
        <!-- GitHub Repository (Blue) -->
        <div class="import-card import-card-blue">
          <div class="import-card-header">
            <h3>GitHub Repository</h3>
          </div>
          <div class="import-card-body">
            <p class="repo-path">${processStatus.github.org}/${processStatus.github.repo}</p>
            <a href="https://github.com/${processStatus.github.org}/${processStatus.github.repo}" target="_blank" class="import-card-link">
              View Repository →
            </a>
          </div>
        </div>

        <!-- Blocks (Lime Green) -->
        <div class="import-card import-card-lime">
          <div class="import-card-header">
            <h3>Blocks Selected</h3>
          </div>
          <div class="import-card-body">
            <p class="import-card-value">${processStatus.blocks.total}</p>
            <a href="${getLibraryBlocksURL(processStatus.github.org, processStatus.github.repo)}" target="_blank" class="import-card-link">
              View Blocks →
            </a>
          </div>
        </div>

        <!-- Site Config (Green) - Only shown in setup mode -->
        ${processStatus.siteConfig ? `
          <div class="import-card import-card-green">
            <div class="import-card-header">
              <h3>Site Config</h3>
            </div>
            <div class="import-card-body">
              <p>${processStatus.siteConfig.message || 'Pending'}</p>
            </div>
          </div>
        ` : ''}

        <!-- Block Docs (Cyan) -->
        <div class="import-card import-card-cyan">
          <div class="import-card-header">
            <h3>Block Docs</h3>
          </div>
          <div class="import-card-body">
            <p class="import-card-value">${processStatus.blockDocs.created}/${processStatus.blockDocs.total}</p>
          </div>
        </div>

        <!-- Errors (Red) -->
        <div class="import-card import-card-red ${processStatus.errors.count > 0 ? 'has-errors' : ''}">
          <div class="import-card-header">
            <h3>Errors</h3>
          </div>
          <div class="import-card-body">
            <p class="import-card-value">${processStatus.errors.count}</p>
            ${processStatus.errors.count > 0 ? `
              <a href="#" class="import-card-link view-errors-link" onclick="event.preventDefault(); document.getElementById('error-modal').style.display='flex'">
                View errors →
              </a>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function pagePickerModalTemplate({
  site,
  items,
  selectedPages,
  loading,
  mode = 'pages',
}) {
  const modalTitles = {
    icons: 'Select Icons',
    templates: 'Select Template',
    pages: 'Select Pages',
  };
  const modalTitle = modalTitles[mode] || 'Select Pages';

  const isSingleSelect = mode === 'templates' || mode === 'icons';
  const inputType = isSingleSelect ? 'radio' : 'checkbox';
  const inputName = isSingleSelect ? 'selected-item' : '';

  const renderItem = (item) => {
    if (item.ext) {
      const isSelected = selectedPages.has(item.path);
      const displayName = item.name.replace(`.${item.ext}`, '');
      let icon;

      if (item.ext === 'svg') {
        const iconUrl = `https://content.da.live${item.path}`;
        icon = `<img src="${iconUrl}" alt="${displayName}" style="width: 16px; height: 16px; vertical-align: middle;" />`;
      } else {
        icon = '📄';
      }

      return `
        <div class="tree-item file-item">
          <label class="page-checkbox ${isSelected ? 'selected' : ''}">
            <input
              type="${inputType}"
              ${inputName ? `name="${inputName}"` : ''}
              data-path="${item.path}"
              ${isSelected ? 'checked' : ''}
            />
            <span class="page-icon">${icon}</span>
            <span class="page-name">${displayName}</span>
          </label>
        </div>
      `;
    }
    return `
      <div class="tree-item folder-item" data-path="${item.path}">
        <button class="folder-toggle" data-folder-path="${item.path}">
          <span class="folder-icon">📁</span>
          <span class="folder-name">${item.name}</span>
          <span class="toggle-arrow">▶</span>
        </button>
        <div class="folder-contents hidden" data-loaded="false">
          <div class="folder-loading">Loading...</div>
        </div>
      </div>
    `;
  };

  return `
    <div class="modal-overlay">
      <div class="modal">
        <h2>${modalTitle} from ${site}</h2>

        ${loading ? `
          <div class="loading">
            <div class="spinner"></div>
            <p>Loading pages...</p>
          </div>
        ` : `
          <div class="page-list tree-view">
            ${!items || items.length === 0 ? `
              <p style="text-align: center; color: var(--s2-gray-600);">No pages found</p>
            ` : items
    .sort((a, b) => {
      if (!a.ext && b.ext) return -1;
      if (a.ext && !b.ext) return 1;
      return a.name.localeCompare(b.name);
    })
    .map(renderItem)
    .join('')}
          </div>

          <div class="modal-actions">
            <button class="modal-cancel">Cancel</button>
            <button class="modal-confirm accent">
              Confirm (${selectedPages.size} selected)
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}

export function finalStatusTemplate({ processStatus, org, repo }) {
  return `
    <div class="form-section">
      <div class="status-cards-grid">
        <!-- GitHub Repository (Blue) - Only shown when blocks processed -->
        ${processStatus.github ? `
          <div class="import-card import-card-blue">
            <div class="import-card-header">
              <h3>GitHub Repository</h3>
            </div>
            <div class="import-card-body">
              <p class="repo-path">${processStatus.github.org}/${processStatus.github.repo}</p>
              <a href="https://github.com/${processStatus.github.org}/${processStatus.github.repo}" target="_blank" class="import-card-link">
                View Repository →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Blocks Selected (Lime Green) - Only shown when blocks processed -->
        ${processStatus.blocks ? `
          <div class="import-card import-card-lime">
            <div class="import-card-header">
              <h3>Blocks Selected</h3>
            </div>
            <div class="import-card-body">
              <p class="import-card-value">${processStatus.blocks.total}</p>
              <a href="${getLibraryBlocksURL(org, repo)}" target="_blank" class="import-card-link">
                View Blocks →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Site Config (Green) - Only shown in setup mode -->
        ${processStatus.siteConfig ? `
          <div class="import-card import-card-green">
            <div class="import-card-header">
              <h3>Site Config</h3>
            </div>
            <div class="import-card-body">
              <p>${processStatus.siteConfig.message}</p>
              <a href="https://da.live/config#/${org}/${repo}/" target="_blank" class="import-card-link">
                View Config →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Block Docs (Cyan) - Only shown when blocks processed -->
        ${processStatus.blockDocs ? `
          <div class="import-card import-card-cyan">
            <div class="import-card-header">
              <h3>Block Docs</h3>
            </div>
            <div class="import-card-body">
              <p class="import-card-value">${processStatus.blockDocs.created}/${processStatus.blockDocs.total}</p>
              <a href="https://da.live/#/${org}/${repo}/library" target="_blank" class="import-card-link">
                View Library →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Templates JSON -->
        ${processStatus.templatesJson ? `
          <div class="import-card import-card-cyan">
            <div class="import-card-header">
              <h3>Templates</h3>
            </div>
            <div class="import-card-body">
              <p class="import-card-value">${processStatus.templates?.processed || 0}</p>
              <a href="https://da.live/#/${org}/${repo}/library/templates/templates.json" target="_blank" class="import-card-link">
                View Templates JSON →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Icons JSON -->
        ${processStatus.iconsJson ? `
          <div class="import-card import-card-cyan">
            <div class="import-card-header">
              <h3>Icons</h3>
            </div>
            <div class="import-card-body">
              <p class="import-card-value">${processStatus.icons?.processed || 0}</p>
              <a href="https://da.live/#/${org}/${repo}/library/icons/icons.json" target="_blank" class="import-card-link">
                View Icons JSON →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Placeholders JSON -->
        ${processStatus.placeholdersJson ? `
          <div class="import-card import-card-cyan">
            <div class="import-card-header">
              <h3>Placeholders</h3>
            </div>
            <div class="import-card-body">
              <p class="import-card-value">${processStatus.placeholders?.processed || 0}</p>
              <a href="https://da.live/#/${org}/${repo}/placeholders.json" target="_blank" class="import-card-link">
                View Placeholders JSON →
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Errors (Red) -->
        <div class="import-card import-card-red ${processStatus.errors.count > 0 ? 'has-errors' : ''}">
          <div class="import-card-header">
            <h3>Errors</h3>
          </div>
          <div class="import-card-body">
            <p class="import-card-value">${processStatus.errors.count}</p>
            ${processStatus.errors.count > 0 ? `
              <a href="#" class="import-card-link view-errors-link" onclick="event.preventDefault(); document.getElementById('error-modal').style.display='flex'">
                View errors →
              </a>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="preview-notice">
        <div class="preview-notice-content">
          <h3>Setup Complete!</h3>
          ${processStatus.blockDocs ? `
            <p><strong>Next Step:</strong> Please preview block documents to make preview block feature work in Block Library.</p>
            <a href="${getLibraryBlocksURL(org, repo)}" target="_blank" class="preview-notice-link">
              Go to Library Blocks →
            </a>
          ` : `
            <p><strong>Next Step:</strong> Preview the JSON files above to verify the configuration.</p>
            <a href="https://da.live/#/${org}/${repo}/library" target="_blank" class="preview-notice-link">
              Go to Library →
            </a>
          `}
        </div>
      </div>
    </div>
  `;
}

export function errorModalTemplate(errors) {
  if (!errors || errors.length === 0) return '';

  const uploadErrors = errors.filter((e) => e.type === 'upload');
  const generalErrors = errors.filter((e) => e.type === 'general');

  const formatErrorStatus = (message) => {
    const match = message.match(/(\d{3})/);
    return match ? match[1] : 'Error';
  };

  const formatErrorType = (message) => {
    if (message.includes('Upload failed')) return 'Upload Failed';
    if (message.includes('403')) return 'Permission Denied';
    if (message.includes('404')) return 'Not Found';
    return 'Error';
  };

  return `
    <div class="error-modal-overlay" id="error-modal" style="display: none;">
      <div class="error-modal">
        <div class="error-modal-header">
          <h2>Processing Errors</h2>
          <button class="error-modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="error-modal-content">
          ${generalErrors.length > 0 ? `
            <div class="error-section">
              <h3>General Errors</h3>
              <table class="error-table">
                <thead>
                  <tr>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  ${generalErrors.map((e) => `
                    <tr>
                      <td>${e.message}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          ${uploadErrors.length > 0 ? `
            <div class="error-section">
              <h3>Upload Errors</h3>
              <table class="error-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Status</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  ${uploadErrors.map((e) => `
                    <tr>
                      <td class="block-name">${e.block}</td>
                      <td class="status-code">${formatErrorStatus(e.message)}</td>
                      <td>${formatErrorType(e.message)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

export function templatesSectionTemplate({
  existingTemplates = [],
  templates,
  templateForm,
  editingIndex = -1,
  searchQuery = '',
  loading = false,
  message,
}) {
  const totalCount = existingTemplates.length;
  const showSearch = totalCount > 5;
  const displayPath = templateForm.path
    ? templateForm.path.replace(/^\/[^/]+\/[^/]+/, '').replace(/\.html$/, '')
    : '';
  const isEditing = editingIndex >= 0;
  const buttonLabel = isEditing ? 'Update' : '+ Add';

  return `
    <div class="form-section templates-section">
      <div class="section-header">
        <div>
          <h2>Templates${totalCount > 0 ? ` (${totalCount})` : ''}</h2>
          <p class="form-section-subtitle">Manage page templates for authors to use</p>
        </div>
        ${showSearch ? `
          <input 
            type="search" 
            id="template-search" 
            class="library-search"
            value="${searchQuery}"
            placeholder="Search templates...">
        ` : ''}
      </div>
      
      ${message}
      
      ${loading ? '<p class="loading-message">Loading templates...</p>' : ''}
      
      ${!loading && totalCount > 0 ? `
        <div class="existing-items-list">
          <h3>Existing Templates</h3>
          ${existingTemplates.length === 0 ? '<p class="no-results">No templates match your search.</p>' : `
            <ul class="items-list">
              ${existingTemplates.map((template, index) => {
    const itemDisplayPath = template.path.replace(/https:\/\/content\.da\.live\/[^/]+\/[^/]+/, '');
    return `
                <li class="item">
                  <div class="item-content">
                    <span class="item-name">${template.name}</span>
                    <span class="item-path">${itemDisplayPath}</span>
                  </div>
                  <div class="item-actions">
                    <button 
                      class="edit-item-btn" 
                      data-type="template"
                      data-index="${index}"
                      title="Edit">
                      Edit
                    </button>
                    <button 
                      class="remove-item-btn" 
                      data-type="template"
                      data-index="${index}"
                      title="Remove">
                      Remove
                    </button>
                  </div>
                </li>
              `;
  }).join('')}
            </ul>
          `}
        </div>
      ` : ''}
      
      ${!loading && totalCount === 0 ? '<p class="empty-state">No templates configured yet. Add your first one below.</p>' : ''}
      
      <div class="add-new-section">
        <h3>${isEditing ? 'Edit Template' : 'Add New Template'}</h3>
        <div class="templates-form">
          <div class="input-group">
            <label for="template-name">Template Name</label>
            <input 
              type="text" 
              id="template-name" 
              value="${templateForm.name}"
              placeholder="Blog Template">
          </div>
          
          <div class="input-group">
            <label for="template-path">Source Page</label>
            <input 
              type="text" 
              id="template-path" 
              value="${displayPath}"
              placeholder="Select a page..."
              readonly>
          </div>
          
          <button class="action" id="select-template-page">Select Page</button>
          
          <button id="add-template">${buttonLabel}</button>
          ${isEditing ? '<button id="cancel-edit-template" class="secondary">Cancel</button>' : ''}
        </div>
        
        ${templates.length > 0 ? `
          <div class="pending-changes">
            <h4>Pending Changes (${templates.length})</h4>
            <ul class="templates-list">
              ${templates.map((template, index) => {
    const itemDisplayPath = template.path.replace(/^\/[^/]+\/[^/]+/, '');
    return `
                <li class="template-item">
                  <span class="template-name">${template.name}</span>
                  <span class="template-path">${itemDisplayPath}</span>
                  <button 
                    class="remove-template-btn" 
                    data-index="${index}"
                    aria-label="Remove">
                    &times;
                  </button>
                </li>
              `;
  }).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function iconsSectionTemplate({
  existingIcons = [],
  icons,
  iconForm,
  editingIndex = -1,
  searchQuery = '',
  loading = false,
  message,
}) {
  const totalCount = existingIcons.length;
  const showSearch = totalCount > 5;
  const displayPath = iconForm.path
    ? iconForm.path.replace(/^\/[^/]+\/[^/]+/, '').replace(/\.svg$/, '')
    : '';
  const isEditing = editingIndex >= 0;
  const buttonLabel = isEditing ? 'Update' : '+ Add';

  return `
    <div class="form-section icons-section">
      <div class="section-header">
        <div>
          <h2>Icons${totalCount > 0 ? ` (${totalCount})` : ''}</h2>
          <p class="form-section-subtitle">Manage SVG icons for content authors to use</p>
        </div>
        ${showSearch ? `
          <input 
            type="search" 
            id="icon-search" 
            class="library-search"
            value="${searchQuery}"
            placeholder="Search icons...">
        ` : ''}
      </div>
      
      ${message}
      
      ${loading ? '<p class="loading-message">Loading icons...</p>' : ''}
      
      ${!loading && totalCount > 0 ? `
        <div class="existing-items-list">
          <h3>Existing Icons</h3>
          ${existingIcons.length === 0 ? '<p class="no-results">No icons match your search.</p>' : `
            <ul class="items-list">
              ${existingIcons.map((icon, index) => {
    const itemDisplayPath = icon.path.replace(/https:\/\/content\.da\.live\/[^/]+\/[^/]+/, '');
    return `
                <li class="item">
                  <div class="item-content">
                    <span class="item-name">${icon.name}</span>
                    <span class="item-path">${itemDisplayPath}</span>
                  </div>
                  <div class="item-actions">
                    <button 
                      class="edit-item-btn" 
                      data-type="icon"
                      data-index="${index}"
                      title="Edit">
                      Edit
                    </button>
                    <button 
                      class="remove-item-btn" 
                      data-type="icon"
                      data-index="${index}"
                      title="Remove">
                      Remove
                    </button>
                  </div>
                </li>
              `;
  }).join('')}
            </ul>
          `}
        </div>
      ` : ''}
      
      ${!loading && totalCount === 0 ? '<p class="empty-state">No icons configured yet. Add your first one below.</p>' : ''}
      
      <div class="add-new-section">
        <h3>${isEditing ? 'Edit Icon' : 'Add New Icon'}</h3>
        <div class="icons-form">
          <div class="input-group">
            <label for="icon-name">Icon Name</label>
            <input 
              type="text" 
              id="icon-name" 
              value="${iconForm.name}"
              placeholder="search">
          </div>
          
          <div class="input-group">
            <label for="icon-path">Source SVG</label>
            <input 
              type="text" 
              id="icon-path" 
              value="${displayPath}"
              placeholder="Select an icon..."
              readonly>
          </div>
          
          <button class="action" id="select-icon-page">Select Page</button>
          
          <button id="add-icon">${buttonLabel}</button>
          ${isEditing ? '<button id="cancel-edit-icon" class="secondary">Cancel</button>' : ''}
        </div>
        
        ${icons.length > 0 ? `
          <div class="pending-changes">
            <h4>Pending Changes (${icons.length})</h4>
            <ul class="icons-list">
              ${icons.map((icon, index) => {
    const itemDisplayPath = icon.path.replace(/^\/[^/]+\/[^/]+/, '');
    return `
                <li class="icon-item">
                  <span class="icon-key">${icon.name}</span>
                  <span class="icon-path">${itemDisplayPath}</span>
                  <button 
                    class="remove-icon-btn" 
                    data-index="${index}"
                    aria-label="Remove">
                    &times;
                  </button>
                </li>
              `;
  }).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function placeholdersSectionTemplate({
  existingPlaceholders = [],
  placeholders,
  placeholderForm,
  editingIndex = -1,
  searchQuery = '',
  loading = false,
  message,
}) {
  const totalCount = existingPlaceholders.length;
  const showSearch = totalCount > 5;
  const isEditing = editingIndex >= 0;
  const buttonLabel = isEditing ? 'Update' : '+ Add';

  return `
    <div class="form-section placeholders-section">
      <div class="section-header">
        <div>
          <h2>Placeholders${totalCount > 0 ? ` (${totalCount})` : ''}</h2>
          <p class="form-section-subtitle">Manage key-value pairs for reusable content</p>
        </div>
        ${showSearch ? `
          <input 
            type="search" 
            id="placeholder-search" 
            class="library-search"
            value="${searchQuery}"
            placeholder="Search placeholders...">
        ` : ''}
      </div>
      
      ${message}
      
      ${loading ? '<p class="loading-message">Loading placeholders...</p>' : ''}
      
      ${!loading && totalCount > 0 ? `
        <div class="existing-items-list">
          <h3>Existing Placeholders</h3>
          ${existingPlaceholders.length === 0 ? '<p class="no-results">No placeholders match your search.</p>' : `
            <ul class="items-list">
              ${existingPlaceholders.map((placeholder, index) => `
                <li class="item">
                  <div class="item-content">
                    <span class="item-name">${placeholder.key}</span>
                    <span class="item-value">${placeholder.value}</span>
                  </div>
                  <div class="item-actions">
                    <button 
                      class="edit-item-btn" 
                      data-type="placeholder"
                      data-index="${index}"
                      title="Edit">
                      Edit
                    </button>
                    <button 
                      class="remove-item-btn" 
                      data-type="placeholder"
                      data-index="${index}"
                      title="Remove">
                      Remove
                    </button>
                  </div>
                </li>
              `).join('')}
            </ul>
          `}
        </div>
      ` : ''}
      
      ${!loading && totalCount === 0 ? '<p class="empty-state">No placeholders configured yet. Add your first one below.</p>' : ''}
      
      <div class="add-new-section">
        <h3>${isEditing ? 'Edit Placeholder' : 'Add New Placeholder'}</h3>
        <div class="placeholders-form">
          <div class="input-group">
            <label for="placeholder-key">Key</label>
            <input 
              type="text" 
              id="placeholder-key" 
              value="${placeholderForm.key}"
              placeholder="company-name">
          </div>
          
          <div class="input-group">
            <label for="placeholder-value">Value</label>
            <input 
              type="text" 
              id="placeholder-value" 
              value="${placeholderForm.value}"
              placeholder="Acme Corporation">
          </div>
          
          <button id="add-placeholder">${buttonLabel}</button>
          ${isEditing ? '<button id="cancel-edit-placeholder" class="secondary">Cancel</button>' : ''}
        </div>
        
        ${placeholders.length > 0 ? `
          <div class="pending-changes">
            <h4>Pending Changes (${placeholders.length})</h4>
            <ul class="placeholders-list">
              ${placeholders.map((placeholder, index) => `
                <li class="placeholder-item">
                  <span class="placeholder-key">${placeholder.key}</span>
                  <span class="placeholder-value">${placeholder.value}</span>
                  <button 
                    class="remove-placeholder-btn" 
                    data-index="${index}"
                    aria-label="Remove">
                    &times;
                  </button>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function aemAssetsSectionTemplate({
  config,
  loading = false,
  validating = false,
  message,
}) {
  return `
    <div class="form-section aem-assets-section">
      ${message}
      
      ${loading ? '<p class="loading-message">Loading configuration...</p>' : ''}
      
      ${!loading ? `
        <div class="integration-form">
          <div class="form-field">
            <label for="aem-repository-id">
              Repository ID <span class="required">*</span>
            </label>
            <input 
              type="text" 
              id="aem-repository-id" 
              value="${config.repositoryId}"
              placeholder="author-pxxxx-eyyyy.adobeaemcloud.com">
            <p class="field-help">Use 'author-' or 'delivery-' prefix for your AEM environment</p>
          </div>
          
          <div class="form-field">
            <label for="aem-prod-origin">Production Origin (Optional)</label>
            <div class="input-with-button">
              <input 
                type="url" 
                id="aem-prod-origin" 
                value="${config.prodOrigin}"
                placeholder="https://mysite.com">
              <button 
                id="verify-aem-url" 
                class="action"
                ${validating ? 'disabled' : ''}>
                ${validating ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            <p class="field-help">Custom domain for loading assets</p>
          </div>
          
          <div class="form-field">
            <h3>Options</h3>
            <div class="checkbox-group">
              <div class="checkbox-option">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    id="aem-image-type"
                    ${config.imageType ? 'checked' : ''}>
                  Insert links instead of copying images
                </label>
                <p class="checkbox-help">Reference assets via URL instead of downloading copies</p>
              </div>

              <div class="checkbox-option">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    id="aem-renditions-select"
                    ${config.renditionsSelect ? 'checked' : ''}>
                  Allow selecting asset renditions
                </label>
                <p class="checkbox-help">Let authors choose specific renditions (sizes) when inserting assets</p>
              </div>

              <div class="checkbox-option">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    id="aem-dm-delivery"
                    ${config.dmDelivery ? 'checked' : ''}>
                  Use Dynamic Media delivery
                </label>
                <p class="checkbox-help">Enable Dynamic Media for advanced image manipulation and delivery</p>
              </div>

              <div class="checkbox-option">
                <label class="checkbox-label">
                  <input 
                    type="checkbox" 
                    id="aem-smartcrop-select"
                    ${config.smartCropSelect ? 'checked' : ''}>
                  Enable Smart Crop selection
                </label>
                <p class="checkbox-help">Allow authors to use AI-powered smart cropping for images</p>
              </div>
            </div>
          </div>
          
          <div class="form-actions">
            <button id="save-aem-config" class="primary">
              Save Configuration
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function translationSectionTemplate({
  config,
  loading = false,
  message,
}) {
  return `
    <div class="form-section translation-section">
      ${message}

      ${loading ? '<p class="loading-message">Loading configuration...</p>' : ''}

      ${!loading ? `
        <div class="integration-form">
          <div class="form-field">
            <label for="translate-behavior">Translation Behavior</label>
            <select id="translate-behavior" class="config-select">
              <option value="overwrite" ${config.translateBehavior === 'overwrite' ? 'selected' : ''}>
                Overwrite - Replace old content (no-touch translation)
              </option>
              <option value="merge" ${config.translateBehavior === 'merge' ? 'selected' : ''}>
                Merge - Combine old and new content (requires review)
              </option>
            </select>
            <p class="field-help">How to handle existing content when translations return</p>
          </div>

          <div class="form-field">
            <label for="translate-staging">Translation Staging</label>
            <select id="translate-staging" class="config-select">
              <option value="on" ${config.translateStaging === 'on' ? 'selected' : ''}>
                On - Copy source to separate folder before translation
              </option>
              <option value="off" ${config.translateStaging === 'off' ? 'selected' : ''}>
                Off - Send source documents directly to translation service
              </option>
            </select>
            <p class="field-help">Stage content separately to modify before translation without affecting live content</p>
          </div>

          <div class="form-field">
            <label for="rollout-behavior">Rollout Behavior</label>
            <select id="rollout-behavior" class="config-select">
              <option value="overwrite" ${config.rolloutBehavior === 'overwrite' ? 'selected' : ''}>
                Overwrite - Replace old content (no-touch rollout)
              </option>
              <option value="merge" ${config.rolloutBehavior === 'merge' ? 'selected' : ''}>
                Merge - Combine old and new content (requires review)
              </option>
            </select>
            <p class="field-help">How to handle content when rolling out to locales (for hybrid/locale-based strategies)</p>
          </div>

          <div class="form-actions">
            <button id="save-translation-config" class="primary">Save Configuration</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

export function universalEditorSectionTemplate({
  config,
  loading = false,
  message,
}) {
  return `
    <div class="form-section universal-editor-section">
      ${message}

      ${loading ? '<p class="loading-message">Loading configuration...</p>' : ''}

      ${!loading ? `
        <div class="integration-form">
          <div class="form-field">
            <label for="ue-editor-path">
              Editor Path <span class="required">*</span>
            </label>
            <input
              type="text"
              id="ue-editor-path"
              value="${config.editorPath}"
              placeholder="/org/site/path=https://experience.adobe.com/#/@your-dx-handle/aem/editor/canvas/...">
            <p class="field-help">Format: /browsing/path=https://experience.adobe.com/#/@your-dx-handle/aem/editor/canvas/main--site--org.ue.da.live</p>
          </div>

          <div class="info-box">
            <h4>Requirements:</h4>
            <ul>
              <li>DX Handle (from experience.adobe.com URL)</li>
              <li>IMS Org with Universal Editor enabled (requires AEM Sites credits)</li>
              <li>Site on da.live with UE instrumentation (component-models.json, component-definitions.json, component-filters.json)</li>
              <li>Chrome or Safari browser</li>
            </ul>
          </div>

          <div class="form-actions">
            <button id="save-ue-config" class="primary">Save Configuration</button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}
