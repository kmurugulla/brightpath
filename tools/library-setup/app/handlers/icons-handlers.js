export function attachIconsListeners(app, state) {
  const iconNameInput = document.getElementById('icon-name');
  const addIconBtn = document.getElementById('add-icon');

  if (iconNameInput && addIconBtn) {
    const updateValidation = () => {
      const hasName = iconNameInput.value.trim().length > 0;
      const hasPath = state.iconForm.path.length > 0;
      addIconBtn.disabled = !hasName || !hasPath;

      if (!hasName) {
        iconNameInput.classList.add('validation-required');
      } else {
        iconNameInput.classList.remove('validation-required');
      }
    };

    iconNameInput.addEventListener('input', (e) => {
      state.iconForm.name = e.target.value.trim();
      updateValidation();
    });

    iconNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !addIconBtn.disabled) {
        e.preventDefault();
        app.handleAddIcon();
      }
    });

    updateValidation();
  }

  const selectIconPageBtn = document.getElementById('select-icon-page');
  if (selectIconPageBtn) {
    selectIconPageBtn.addEventListener('click', () => app.openPagePicker(state.site, 'icons'));
  }

  if (addIconBtn) {
    addIconBtn.addEventListener('click', () => app.handleAddIcon());
  }

  document.querySelectorAll('.remove-icon-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      app.handleRemoveIcon(index);
    });
  });
}

export function handleAddIcon(state, render) {
  if (!state.iconForm.name || !state.iconForm.path) {
    return;
  }

  state.selectedIcons.push({
    name: state.iconForm.name,
    path: state.iconForm.path,
  });

  state.iconForm = { name: '', path: '' };
  state.errors.icons = '';
  render();
}

export function handleRemoveIcon(state, render, index) {
  state.selectedIcons.splice(index, 1);
  render();
}
