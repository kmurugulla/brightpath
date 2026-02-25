/**
 * UI rendering and event handling
 */

import { state, org, repo } from './config.js';
import {
  buildInitialIndex, buildIncrementalIndex, shouldReindex, getIndexStatus,
} from './builder.js';

export function render() {
  const app = document.getElementById('app');

  const statusHtml = state.status ? `
    <div class="status-panel">
      <h2>Current Index Status</h2>
      <div class="status-grid">
        <div class="status-item">
          <label>Last Refresh:</label>
          <span>${state.status.lastRefresh ? new Date(state.status.lastRefresh).toLocaleString() : 'Never'}</span>
        </div>
        <div class="status-item">
          <label>Total Entries:</label>
          <span>${state.status.entriesCount || 0}</span>
        </div>
        ${state.status.lastBuildMode ? `
        <div class="status-item">
          <label>Last Build:</label>
          <span>${state.status.lastBuildMode === 'full' ? 'Full rebuild' : 'Incremental'}</span>
        </div>
        ` : ''}
        ${state.status.indexLastModified != null ? `
        <div class="status-item">
          <label>Index Last Modified (DA):</label>
          <span>${new Date(state.status.indexLastModified).toLocaleString()}</span>
        </div>
        ` : ''}
      </div>
    </div>
  ` : '<div class="status-loading">Checking status...</div>';

  const elapsedMs = state.buildStartTime ? Date.now() - state.buildStartTime : 0;
  const elapsedStr = elapsedMs >= 1000 ? `${(elapsedMs / 1000).toFixed(1)}s` : `${elapsedMs}ms`;
  const pct = state.progress.percent;
  const etaMs = pct > 0 && pct < 100 ? (elapsedMs / pct) * (100 - pct) : 0;
  const etaStr = etaMs > 0 ? `~${(etaMs / 1000).toFixed(1)}s` : '';
  const { totalMs } = state.progress;
  let totalStr = '';
  if (totalMs != null) {
    totalStr = totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`;
  }

  const timingHtml = state.progress.stage === 'complete' && totalStr
    ? `<span>Total: ${totalStr}</span>`
    : `<span>Elapsed: ${elapsedStr}</span>${etaStr ? `<span>ETA: ${etaStr}</span>` : ''}`;

  const progressHtml = state.building || state.progress.stage !== 'idle' ? `
    <div class="progress-section">
      <h2>Progress</h2>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${state.progress.percent}%"></div>
      </div>
      <div class="progress-info">
        <span class="progress-stage">${state.progress.stage}</span>
        <span class="progress-message">${state.progress.message}</span>
      </div>
      <div class="progress-timing">
        ${timingHtml}
      </div>
    </div>
  ` : '';

  const logsHtml = state.logs.length > 0 ? `
    <div class="logs-section">
      <h3>Logs (${state.logs.length})</h3>
      <ul class="logs-list">
        ${state.logs.map((log) => `<li class="log-${log.type}">${log.message}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  const errorsHtml = state.errors.length > 0 ? `
    <div class="errors-section">
      <h3>Errors (${state.errors.length})</h3>
      <ul class="errors-list">
        ${state.errors.map((err) => `<li>${err.message}</li>`).join('')}
      </ul>
    </div>
  ` : '';

  app.innerHTML = `
    <h1>Media Index Builder</h1>
    <p>Building index for: <strong>${org}/${repo}</strong></p>

    ${statusHtml}

    <div class="actions">
      <button id="buildBtn" class="btn-primary" ${state.building ? 'disabled' : ''}>
        ${state.building ? 'Building Index...' : 'Build Index'}
      </button>
    </div>

    ${progressHtml}
    ${errorsHtml}
    ${logsHtml}
  `;
}

export function attachEventListeners() {
  if (!state.building) {
    const buildBtn = document.getElementById('buildBtn');
    if (buildBtn) {
      buildBtn.addEventListener('click', () => {
        state.building = true;
        state.buildStartTime = Date.now();
        state.errors = [];
        state.logs = [];
        state.progress = { stage: 'starting', message: 'Checking build mode...', percent: 0 };
        render();

        const runBuild = (useIncremental) => {
          const buildFn = useIncremental ? buildIncrementalIndex : buildInitialIndex;
          const onLog = (msg) => {
            state.logs.push({ message: msg, type: 'info' });
            render();
          };
          return buildFn(
            (progress) => {
              let finalProgress = progress;
              if (progress.stage === 'complete' && state.buildStartTime) {
                const totalMs = Date.now() - state.buildStartTime;
                const totalStr = totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`;
                finalProgress = { ...progress, message: `${progress.message} (${totalStr})`, totalMs };
              }
              state.progress = finalProgress;
              state.logs.push({ message: finalProgress.message, type: 'info' });
              render();
            },
            useIncremental ? onLog : undefined,
          );
        };

        shouldReindex()
          .then(({ shouldReindex: useIncremental, reason }) => {
            if (reason && !useIncremental) {
              state.logs.push({ message: `Full build: ${reason}`, type: 'info' });
            }
            return runBuild(useIncremental);
          })
          .then((result) => {
            const totalMs = state.buildStartTime ? Date.now() - state.buildStartTime : 0;
            const totalStr = totalMs >= 1000 ? `${(totalMs / 1000).toFixed(1)}s` : `${totalMs}ms`;
            state.logs.push({
              message: `Index built successfully: ${result.length} entries (${totalStr})`,
              type: 'success',
            });
            return getIndexStatus();
          })
          .then((status) => {
            state.status = status;
          })
          .catch((error) => {
            state.errors.push({ message: error.message });
            state.logs.push({ message: `Error: ${error.message}`, type: 'error' });
            state.progress = { stage: 'error', message: error.message, percent: 0 };
          })
          .finally(() => {
            state.building = false;
            state.buildStartTime = null;
            render();
            attachEventListeners();
          });
      });
    }
  }
}
