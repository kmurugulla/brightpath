export function attachTranslationListeners(app, state) {
  const translateBehaviorSelect = document.getElementById('translate-behavior');
  const translateStagingSelect = document.getElementById('translate-staging');
  const rolloutBehaviorSelect = document.getElementById('rollout-behavior');
  const saveConfigBtn = document.getElementById('save-translation-config');

  if (translateBehaviorSelect) {
    translateBehaviorSelect.addEventListener('change', (e) => {
      state.translationConfig.translateBehavior = e.target.value;
    });
  }

  if (translateStagingSelect) {
    translateStagingSelect.addEventListener('change', (e) => {
      state.translationConfig.translateStaging = e.target.value;
    });
  }

  if (rolloutBehaviorSelect) {
    rolloutBehaviorSelect.addEventListener('change', (e) => {
      state.translationConfig.rolloutBehavior = e.target.value;
    });
  }

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', () => app.handleSaveTranslationConfig());
  }
}

export async function handleSaveTranslationConfig(state, render, daApi) {
  state.errors.translation = '';
  render();

  try {
    const result = await daApi.updateTranslationConfig(
      state.org,
      state.site,
      state.translationConfig,
    );

    if (result.success) {
      state.errors.translation = '✓ Configuration saved successfully!';
    } else {
      state.errors.translation = `Error saving configuration: ${result.error}`;
    }
    render();
  } catch (error) {
    state.errors.translation = `Error saving configuration: ${error.message}`;
    render();
  }
}
