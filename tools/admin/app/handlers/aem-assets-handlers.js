export function attachAemAssetsListeners(app, state) {
  const repositoryIdInput = document.getElementById('aem-repository-id');
  const prodOriginInput = document.getElementById('aem-prod-origin');
  const verifyUrlBtn = document.getElementById('verify-aem-url');
  const saveConfigBtn = document.getElementById('save-aem-config');

  if (repositoryIdInput) {
    repositoryIdInput.addEventListener('input', (e) => {
      state.aemAssetsConfig.repositoryId = e.target.value.trim();
    });
  }

  if (prodOriginInput) {
    prodOriginInput.addEventListener('input', (e) => {
      state.aemAssetsConfig.prodOrigin = e.target.value.trim();
    });
  }

  if (verifyUrlBtn) {
    verifyUrlBtn.addEventListener('click', () => app.handleVerifyAemUrl());
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

export async function handleSaveAemConfig(state, render, daApi) {
  const { repositoryId } = state.aemAssetsConfig;

  if (!repositoryId) {
    state.errors.aemAssets = 'Repository ID is required';
    render();
    return;
  }

  if (!repositoryId.startsWith('author-') && !repositoryId.startsWith('delivery-')) {
    state.errors.aemAssets = 'Repository ID must start with "author-" or "delivery-"';
    render();
    return;
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
      state.errors.aemAssets = '✓ Configuration saved successfully!';
    } else {
      state.errors.aemAssets = `Error saving configuration: ${result.error}`;
    }
    render();
  } catch (error) {
    state.errors.aemAssets = `Error saving configuration: ${error.message}`;
    render();
  }
}

export async function handleVerifyAemUrl(state, render) {
  if (!state.aemAssetsConfig.prodOrigin) {
    return;
  }

  state.validatingAemUrl = true;
  state.errors.aemAssets = '';
  render();

  try {
    await fetch(state.aemAssetsConfig.prodOrigin, {
      method: 'HEAD',
      mode: 'no-cors',
    });
    state.validatingAemUrl = false;
    state.errors.aemAssets = '✓ URL verified successfully!';
    render();
  } catch (error) {
    state.validatingAemUrl = false;
    state.errors.aemAssets = `Unable to verify URL: ${error.message}`;
    render();
  }
}
