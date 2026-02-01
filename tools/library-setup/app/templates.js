import {
  getLibraryBlocksURL,
} from '../config.js';

export function appTemplate(content) {
  return `
    <div class="library-setup-container">
      <div class="library-setup-header">
        <h1>Library Setup</h1>
        <p>Generate block documentation with real content examples</p>
      </div>
      <div class="library-setup-content">
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
        Refresh Documentation
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
    buttonText = 'Refresh Documentation';
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

export function templatesSectionTemplate({ templates, templateForm, message }) {
  const displayPath = templateForm.path
    ? templateForm.path.replace(/^\/[^/]+\/[^/]+/, '').replace(/\.html$/, '')
    : '';

  return `
    <div class="form-section templates-section">
      <h2>Templates</h2>
      <p class="form-section-subtitle">Add page templates for authors to use</p>
      
      ${message}
      
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
        
        <button id="add-template">
          + Add
        </button>
      </div>
      
      ${templates.length > 0 ? `
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
      ` : ''}
    </div>
  `;
}

export function iconsSectionTemplate({ icons, iconForm, message }) {
  const displayPath = iconForm.path
    ? iconForm.path.replace(/^\/[^/]+\/[^/]+/, '').replace(/\.svg$/, '')
    : '';

  return `
    <div class="form-section icons-section">
      <h2>Icons</h2>
      <p class="form-section-subtitle">Add SVG icons for content authors to use</p>
      
      ${message}
      
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
        
        <button id="add-icon">
          + Add
        </button>
      </div>
      
      ${icons.length > 0 ? `
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
      ` : ''}
    </div>
  `;
}

export function placeholdersSectionTemplate({ placeholders, placeholderForm, message }) {
  return `
    <div class="form-section placeholders-section">
      <h2>Placeholders</h2>
      <p class="form-section-subtitle">Add key-value pairs for reusable content</p>
      
      ${message}
      
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
        
        <button id="add-placeholder">
          + Add
        </button>
      </div>
      
      ${placeholders.length > 0 ? `
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
      ` : ''}
    </div>
  `;
}
