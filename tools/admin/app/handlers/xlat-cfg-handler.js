import { DOM_IDS } from '../constants.js';

export function attachTranslationListeners(app, state) {
  const translateBehaviorSelect = document.getElementById(DOM_IDS.TRANSLATE_BEHAVIOR);
  const translateStagingSelect = document.getElementById(DOM_IDS.TRANSLATE_STAGING);
  const rolloutBehaviorSelect = document.getElementById(DOM_IDS.ROLLOUT_BEHAVIOR);
  const saveConfigBtn = document.getElementById(DOM_IDS.SAVE_TRANSLATION_CONFIG);

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
