export function attachTemplatesListeners(app, state) {
  const templateNameInput = document.getElementById('template-name');
  const addTemplateBtn = document.getElementById('add-template');

  if (templateNameInput && addTemplateBtn) {
    const updateValidation = () => {
      const hasName = templateNameInput.value.trim().length > 0;
      const hasPath = state.templateForm.path.length > 0;
      addTemplateBtn.disabled = !hasName || !hasPath;

      if (!hasName) {
        templateNameInput.classList.add('validation-required');
      } else {
        templateNameInput.classList.remove('validation-required');
      }
    };

    templateNameInput.addEventListener('input', (e) => {
      state.templateForm.name = e.target.value.trim();
      updateValidation();
    });

    templateNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !addTemplateBtn.disabled) {
        e.preventDefault();
        app.handleAddTemplate();
      }
    });

    updateValidation();
  }

  const selectTemplatePageBtn = document.getElementById('select-template-page');
  if (selectTemplatePageBtn) {
    selectTemplatePageBtn.addEventListener('click', () => app.openPagePicker(state.site, 'templates'));
  }

  if (addTemplateBtn) {
    addTemplateBtn.addEventListener('click', () => app.handleAddTemplate());
  }

  document.querySelectorAll('.remove-template-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      app.handleRemoveTemplate(index);
    });
  });
}

export function handleAddTemplate(state, render) {
  if (!state.templateForm.name || !state.templateForm.path) {
    return;
  }

  state.selectedTemplates.push({
    name: state.templateForm.name,
    path: state.templateForm.path,
  });

  state.templateForm = { name: '', path: '' };
  state.errors.templates = '';
  render();
}

export function handleRemoveTemplate(state, render, index) {
  state.selectedTemplates.splice(index, 1);
  render();
}
