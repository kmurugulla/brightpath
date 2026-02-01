export function attachPlaceholdersListeners(app, state) {
  const placeholderKeyInput = document.getElementById('placeholder-key');
  const placeholderValueInput = document.getElementById('placeholder-value');
  const addPlaceholderBtn = document.getElementById('add-placeholder');

  if (placeholderKeyInput && placeholderValueInput && addPlaceholderBtn) {
    const updateValidation = () => {
      const hasKey = placeholderKeyInput.value.trim().length > 0;
      const hasValue = placeholderValueInput.value.trim().length > 0;
      addPlaceholderBtn.disabled = !hasKey || !hasValue;

      if (!hasKey) {
        placeholderKeyInput.classList.add('validation-required');
      } else {
        placeholderKeyInput.classList.remove('validation-required');
      }
    };

    placeholderKeyInput.addEventListener('input', (e) => {
      state.placeholderForm.key = e.target.value.trim();
      updateValidation();
    });

    placeholderKeyInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !addPlaceholderBtn.disabled) {
        e.preventDefault();
        app.handleAddPlaceholder();
      }
    });

    placeholderValueInput.addEventListener('input', (e) => {
      state.placeholderForm.value = e.target.value.trim();
      updateValidation();
    });

    placeholderValueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !addPlaceholderBtn.disabled) {
        e.preventDefault();
        app.handleAddPlaceholder();
      }
    });

    updateValidation();
  }

  if (addPlaceholderBtn) {
    addPlaceholderBtn.addEventListener('click', () => app.handleAddPlaceholder());
  }

  document.querySelectorAll('.remove-placeholder-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index, 10);
      app.handleRemovePlaceholder(index);
    });
  });
}

export function handleAddPlaceholder(state, render) {
  if (!state.placeholderForm.key || !state.placeholderForm.value) {
    return;
  }

  state.selectedPlaceholders.push({
    key: state.placeholderForm.key,
    value: state.placeholderForm.value,
  });

  state.placeholderForm = { key: '', value: '' };
  state.errors.placeholders = '';
  render();
}

export function handleRemovePlaceholder(state, render, index) {
  state.selectedPlaceholders.splice(index, 1);
  render();
}
