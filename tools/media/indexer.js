/* eslint-disable import/no-absolute-path, import/no-unresolved */
/* The DA SDK is loaded from the da.live CDN and is required for authentication */
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

import { state, org, repo } from './lib/config.js';
import { getIndexStatus } from './lib/builder.js';
import { render, attachEventListeners } from './lib/ui.js';

/** Constants */
const AUTH_TIMEOUT_MS = 5000; // Timeout for DA authentication

async function init() {
  if (!org || !repo) {
    const params = new URLSearchParams(window.location.search);
    const rawOrg = params.get('org');
    const rawRepo = params.get('repo') || params.get('site');

    let errorMsg = '<p>Please provide valid org and repo parameters in the URL:</p>';
    if (!rawOrg || !rawRepo) {
      errorMsg += '<p>Missing required parameters.</p>';
    } else {
      errorMsg += '<p>Invalid parameter format. Names must be alphanumeric with optional hyphens, underscores, or dots.</p>';
    }

    document.getElementById('app').innerHTML = `
      <div class="error">
        <h1>Configuration Error</h1>
        ${errorMsg}
        <pre>?org=yourorg&repo=yourrepo</pre>
        <p><small>Example: ?org=mycompany&repo=myproject</small></p>
      </div>
    `;
    return;
  }

  // Get DA token with timeout
  try {
    const tokenPromise = DA_SDK;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Authentication timeout')), AUTH_TIMEOUT_MS);
    });

    const result = await Promise.race([tokenPromise, timeoutPromise]);
    state.daToken = result?.token;
  } catch (error) {
    state.errors.push({ message: `Failed to get DA token: ${error.message}` });
  }

  if (!state.daToken) {
    const returnUrl = encodeURIComponent(window.location.href);
    window.location.href = `https://da.live/?returnUrl=${returnUrl}`;
    return;
  }

  state.status = await getIndexStatus();
  render();
  attachEventListeners();
}

init();
