import * as pagesOps from '../../operations/pages.js';
import * as templates from '../templates.js';

// Circular dependency between renderPagePickerModalInternal and attachPagePickerListeners
// is intentional: modal needs to attach listeners after rendering, and listeners re-render
/* eslint-disable no-use-before-define */

export async function validateSite(org, site, token) {
  try {
    const response = await fetch(
      `https://admin.da.live/list/${org}/${site}/`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return response.ok;
  } catch (error) {
    return false;
  }
}

export function closePagePicker(state) {
  const modalContainer = document.getElementById('page-picker-modal');
  if (modalContainer) {
    modalContainer.remove();
  }
  state.showPagePicker = false;
  state.pageSearchQuery = '';
}

export function confirmPageSelection(app, state) {
  if (state.pagePickerMode === 'templates') {
    const selectedPages = Array.from(state.pageSelections[state.currentSite] || []);
    if (selectedPages.length > 0) {
      [state.templateForm.path] = selectedPages;
    }
    state.pageSelections = {};
  } else if (state.pagePickerMode === 'icons') {
    const selectedPages = Array.from(state.pageSelections[state.currentSite] || []);
    if (selectedPages.length > 0) {
      [state.iconForm.path] = selectedPages;
    }
    state.pageSelections = {};
  }
  closePagePicker(state);
  state.pagePickerMode = '';
  app.render();
}

function renderPagePickerModalInternal(app, state) {
  const modal = templates.pagePickerModalTemplate({
    site: state.currentSite,
    items: state.allPages,
    selectedPages: state.pageSelections[state.currentSite] || new Set(),
    loading: state.loadingPages,
    mode: state.pagePickerMode,
  });

  let modalContainer = document.getElementById('page-picker-modal');
  if (!modalContainer) {
    modalContainer = document.createElement('div');
    modalContainer.id = 'page-picker-modal';
    document.body.appendChild(modalContainer);
  }

  modalContainer.innerHTML = modal;
  attachPagePickerListeners(app, state);
}

export function attachPagePickerListeners(app, state) {
  const overlay = document.querySelector('.modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closePagePicker(state);
      }
    });
  }

  const cancelBtn = document.querySelector('.modal-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => closePagePicker(state));
  }

  const confirmBtn = document.querySelector('.modal-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => confirmPageSelection(app, state));
  }

  const searchInput = document.getElementById('page-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.pageSearchQuery = e.target.value;
      renderPagePickerModalInternal(app, state);
    });
  }

  document.querySelectorAll('.folder-toggle').forEach((folderBtn) => {
    folderBtn.addEventListener('click', async (e) => {
      const button = e.currentTarget;
      const folderItem = button.closest('.folder-item');
      const contents = folderItem.querySelector('.folder-contents');
      const arrow = button.querySelector('.toggle-arrow');
      const icon = button.querySelector('.folder-icon');
      const { folderPath } = button.dataset;
      const isLoaded = contents.dataset.loaded === 'true';

      if (contents.classList.contains('hidden')) {
        contents.classList.remove('hidden');
        arrow.textContent = '▼';
        icon.textContent = '📂';

        if (!isLoaded) {
          try {
            const allItems = await pagesOps.loadFolderContents(
              state.org,
              state.currentSite,
              folderPath,
            );

            let targetExt = null;
            if (state.pagePickerMode === 'templates') {
              targetExt = 'html';
            } else if (state.pagePickerMode === 'icons') {
              targetExt = 'svg';
            }

            const filteredItems = targetExt
              ? allItems.filter((item) => !item.ext || item.ext === targetExt)
              : allItems;

            let childHTML;

            if (allItems.length === 0) {
              childHTML = '<p style="padding-left: 20px; color: #999;">Empty folder</p>';
            } else if (filteredItems.length === 0) {
              let fileTypeMsg = 'No matching files';
              if (targetExt === 'html') {
                fileTypeMsg = 'No HTML files';
              } else if (targetExt === 'svg') {
                fileTypeMsg = 'No SVG files';
              }
              childHTML = `<p style="padding-left: 20px; color: #999;">${fileTypeMsg}</p>`;
            } else {
              const isSingleSelect = state.pagePickerMode === 'templates'
                || state.pagePickerMode === 'icons';
              const inputType = isSingleSelect ? 'radio' : 'checkbox';
              const inputName = isSingleSelect ? 'selected-item' : '';

              childHTML = filteredItems
                .sort((a, b) => {
                  if (!a.ext && b.ext) return -1;
                  if (a.ext && !b.ext) return 1;
                  return a.name.localeCompare(b.name);
                })
                .map((item) => {
                  if (item.ext) {
                    const siteSelections = state.pageSelections[state.currentSite] || new Set();
                    const isSelected = siteSelections.has(item.path);
                    const displayName = item.name.replace(`.${item.ext}`, '');
                    let fileIcon;

                    if (item.ext === 'svg') {
                      const iconUrl = `https://content.da.live${item.path}`;
                      fileIcon = `<img src="${iconUrl}" alt="${displayName}" style="width: 16px; height: 16px; vertical-align: middle;" />`;
                    } else {
                      fileIcon = '📄';
                    }

                    return `
                      <div class="tree-item file-item" style="padding-left: 20px;">
                        <label class="page-checkbox ${isSelected ? 'selected' : ''}">
                          <input type="${inputType}" ${inputName ? `name="${inputName}"` : ''} data-path="${item.path}" ${isSelected ? 'checked' : ''}/>
                          <span class="page-icon">${fileIcon}</span>
                          <span class="page-name">${displayName}</span>
                        </label>
                      </div>
                    `;
                  }
                  return `
                    <div class="tree-item folder-item" data-path="${item.path}" style="padding-left: 20px;">
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
                })
                .join('');
            }

            contents.innerHTML = childHTML;
            contents.dataset.loaded = 'true';

            attachPagePickerListeners(app, state);
          } catch (error) {
            contents.innerHTML = '<p style="padding-left: 20px; color: red;">Failed to load</p>';
          }
        }
      } else {
        contents.classList.add('hidden');
        arrow.textContent = '▶';
        icon.textContent = '📁';
      }
    });
  });

  document.querySelectorAll('.page-checkbox input[type="checkbox"], .page-checkbox input[type="radio"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const { path } = e.target.dataset;
      if (!state.pageSelections[state.currentSite]) {
        state.pageSelections[state.currentSite] = new Set();
      }

      if (e.target.type === 'radio') {
        state.pageSelections[state.currentSite].clear();
        if (e.target.checked) {
          state.pageSelections[state.currentSite].add(path);
        }
      } else if (e.target.checked) {
        state.pageSelections[state.currentSite].add(path);
      } else {
        state.pageSelections[state.currentSite].delete(path);
      }

      const confirmButton = document.querySelector('.modal-confirm');
      if (confirmButton) {
        const count = state.pageSelections[state.currentSite].size;
        confirmButton.textContent = `Confirm (${count} selected)`;
      }
    });
  });
}

export function removePage(state, render, site, path) {
  if (state.pageSelections[site]) {
    state.pageSelections[site].delete(path);
  }
  render();
}

export function renderPagePickerModal(app, state) {
  renderPagePickerModalInternal(app, state);
}

export async function openPagePicker(app, state, site, mode = 'pages') {
  if (!state.daToken) {
    state.errors[mode] = 'DA.live authentication required. This tool must be run from within DA.live.';
    app.render();
    return;
  }

  const siteValid = await validateSite(state.org, site, state.daToken);
  if (!siteValid) {
    state.errors[mode] = `Site "${state.org}/${site}" not found in DA.live. Please verify the site name.`;
    app.render();
    return;
  }

  state.pagePickerMode = mode;
  state.currentSite = site;
  state.loadingPages = true;
  state.showPagePicker = true;
  renderPagePickerModalInternal(app, state);

  try {
    const pages = await pagesOps.fetchSitePages(state.org, site);
    let filteredPages = pages;

    if (mode === 'templates') {
      filteredPages = pages.filter((page) => !page.ext || page.ext === 'html');
    } else if (mode === 'icons') {
      filteredPages = pages.filter((page) => !page.ext || page.ext === 'svg');
    }

    state.allPages = filteredPages;
    state.loadingPages = false;
    renderPagePickerModalInternal(app, state);
  } catch (error) {
    const errorMsg = error.message.includes('401')
      ? 'Authentication failed. Please ensure you are logged in to DA.live.'
      : `Failed to load pages: ${error.message}`;

    state.errors[mode] = errorMsg;
    state.loadingPages = false;
    state.showPagePicker = false;
    app.render();
  }
}
