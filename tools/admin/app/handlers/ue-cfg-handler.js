import { DOM_IDS } from '../constants.js';

export function attachUniversalEditorListeners(app, state) {
  const editorPathInput = document.getElementById(DOM_IDS.UE_EDITOR_PATH);
  const saveConfigBtn = document.getElementById(DOM_IDS.SAVE_UE_CONFIG);

  if (editorPathInput) {
    editorPathInput.addEventListener('input', (e) => {
      state.universalEditorConfig.editorPath = e.target.value.trim();
    });
  }

  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', () => app.handleSaveUeConfig());
  }
}

export async function handleSaveUeConfig(state, render, daApi) {
  if (!state.universalEditorConfig.editorPath) {
    state.errors.universalEditor = 'Editor Path is required';
    render();
    return;
  }

  state.errors.universalEditor = '';
  render();

  try {
    const result = await daApi.updateUniversalEditorConfig(
      state.org,
      state.site,
      state.universalEditorConfig,
    );

    if (result.success) {
      state.errors.universalEditor = '✓ Configuration saved successfully!';
    } else {
      state.errors.universalEditor = `Error saving configuration: ${result.error}`;
    }
    render();
  } catch (error) {
    state.errors.universalEditor = `Error saving configuration: ${error.message}`;
    render();
  }
}
