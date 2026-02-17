import { DOM_IDS } from '../constants.js';

export function attachAemAssetsListeners(app, state) {
  const repositoryIdInput = document.getElementById(DOM_IDS.AEM_REPOSITORY_ID);
  const prodOriginInput = document.getElementById(DOM_IDS.AEM_PROD_ORIGIN);
  const saveConfigBtn = document.getElementById(DOM_IDS.SAVE_AEM_CONFIG);

  if (repositoryIdInput) {
    repositoryIdInput.addEventListener('input', (e) => {
      state.aemAssetsConfig.repositoryId = e.target.value.trim();
      // Clear validation state when input changes
      state.aemAssetsConfig.repositoryIdValidation = null;
    });

    // Validate on blur
    repositoryIdInput.addEventListener('blur', () => {
      if (state.aemAssetsConfig.repositoryId) {
        app.handleValidateRepositoryId();
      }
    });
  }

  if (prodOriginInput) {
    prodOriginInput.addEventListener('input', (e) => {
      state.aemAssetsConfig.prodOrigin = e.target.value.trim();
      // Clear validation state when input changes
      state.aemAssetsConfig.prodOriginValidation = null;
    });

    // Validate on blur
    prodOriginInput.addEventListener('blur', () => {
      if (state.aemAssetsConfig.prodOrigin) {
        app.handleValidateProdOrigin();
      }
    });
  }

  const checkboxes = [
    { id: 'aem-image-type', key: 'imageType' },
    { id: 'aem-renditions-select', key: 'renditionsSelect' },
    { id: 'aem-dm-delivery', key: 'dmDelivery' },
    { id: 'aem-smartcrop-select', key: 'smartCropSelect' },
  ];

  checkboxes.forEach(({ id, key }) => {
    const checkbox = document.getElementById(id);
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        state.aemAssetsConfig[key] = e.target.checked;
      });
    }
  });

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', () => app.handleSaveAemConfig());
  }
}

export async function handleValidateRepositoryId(state, render, daApi) {
  const { repositoryId } = state.aemAssetsConfig;

  if (!repositoryId) {
    state.aemAssetsConfig.repositoryIdValidation = null;
    render();
    return;
  }

  // Validate repository ID (hostname only, no protocol)
  state.aemAssetsConfig.repositoryIdValidation = { validating: true };
  render();

  const result = await daApi.validateRepositoryId(repositoryId);

  if (result.valid) {
    // Update with normalized value (protocol stripped if present)
    if (result.normalized !== repositoryId) {
      state.aemAssetsConfig.repositoryId = result.normalized;
    }

    state.aemAssetsConfig.repositoryIdValidation = {
      valid: true,
      message: '✓ Valid repository ID',
    };
  } else {
    state.aemAssetsConfig.repositoryIdValidation = {
      valid: false,
      message: result.error || 'Unable to reach repository',
    };
  }
  render();
}

export async function handleValidateProdOrigin(state, render, daApi) {
  const { prodOrigin } = state.aemAssetsConfig;

  if (!prodOrigin) {
    state.aemAssetsConfig.prodOriginValidation = null;
    render();
    return;
  }

  // Validate production origin (full URL with protocol)
  state.aemAssetsConfig.prodOriginValidation = { validating: true };
  render();

  const result = await daApi.validateProductionOrigin(prodOrigin);

  if (result.valid) {
    // Update with normalized value (https:// added if missing)
    if (result.normalized !== prodOrigin) {
      state.aemAssetsConfig.prodOrigin = result.normalized;
    }

    state.aemAssetsConfig.prodOriginValidation = {
      valid: true,
      message: '✓ Valid URL',
    };
  } else {
    state.aemAssetsConfig.prodOriginValidation = {
      valid: false,
      message: result.error || 'Unable to reach URL',
    };
  }
  render();
}

export async function handleSaveAemConfig(state, render, daApi) {
  const {
    repositoryId,
    repositoryIdValidation,
    prodOrigin,
    prodOriginValidation,
  } = state.aemAssetsConfig;

  if (!repositoryId) {
    state.errors.aemAssets = 'Repository ID is required';
    render();
    return;
  }

  // Double-check: Repository ID should not contain protocol
  if (repositoryId.includes('://')) {
    state.errors.aemAssets = 'Repository ID must not include https:// - use hostname only (e.g., author-pxxxx-eyyyy.adobeaemcloud.com)';
    render();
    return;
  }

  // Validate Repository ID if not already validated
  if (!repositoryIdValidation || repositoryIdValidation.validating) {
    state.errors.aemAssets = 'Please wait for Repository ID validation to complete';
    render();
    return;
  }

  if (!repositoryIdValidation.valid) {
    state.errors.aemAssets = 'Please enter a valid Repository ID';
    render();
    return;
  }

  // Validate Production Origin if provided
  if (prodOrigin) {
    if (!prodOriginValidation || prodOriginValidation.validating) {
      state.errors.aemAssets = 'Please wait for Production Origin validation to complete';
      render();
      return;
    }

    if (!prodOriginValidation.valid) {
      state.errors.aemAssets = 'Please enter a valid Production Origin URL';
      render();
      return;
    }
  }

  state.errors.aemAssets = '';
  render();

  try {
    const result = await daApi.updateAemAssetsConfig(
      state.org,
      state.site,
      state.aemAssetsConfig,
    );

    if (result.success) {
      state.errors.aemAssets = state.aemAssetsConfig.exists
        ? '✓ Configuration updated successfully!'
        : '✓ Configuration saved successfully!';
      // Mark as existing after successful save
      state.aemAssetsConfig.exists = true;
    } else {
      state.errors.aemAssets = `Error saving configuration: ${result.error}`;
    }
    render();
  } catch (error) {
    state.errors.aemAssets = `Error saving configuration: ${error.message}`;
    render();
  }
}
