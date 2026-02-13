/**
 * Factory for creating generic library item handlers (templates, icons, placeholders)
 * Consolidates duplicate handler logic across multiple item types
 */

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Creates a generic handler for library items
 * @param {string} itemType - Item type (e.g., 'template', 'icon', 'placeholder')
 * @param {Object} config - Configuration for the handler
 * @param {string[]} config.formFields - Field names in the form
 * @param {string} [config.confirmMessage] - Confirmation message for removal
 * @param {boolean} [config.hasPagePicker] - Whether to show page picker button
 * @returns {Object} Handler object with all methods
 */
export function createLibraryItemHandler(itemType, config) {
  const {
    formFields = ['name', 'path'],
    confirmMessage = `Remove this ${itemType} from the library?`,
    hasPagePicker = false,
  } = config;

  const capitalizedType = capitalize(itemType);
  const pluralType = `${itemType}s`;
  const capitalizedPlural = capitalize(pluralType);

  return {
    attachListeners(app, state) {
      const searchInput = document.getElementById(`${itemType}-search`);
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          state[`${itemType}SearchQuery`] = e.target.value;
          app.render();
        });
      }

      document.querySelectorAll(`.edit-item-btn[data-type="${itemType}"]`).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.index, 10);
          app[`handleEditExisting${capitalizedType}`](index);
        });
      });

      document.querySelectorAll(`.remove-item-btn[data-type="${itemType}"]`).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.index, 10);
          app[`handleRemoveExisting${capitalizedType}`](index);
        });
      });

      const inputs = {};
      const addBtn = document.getElementById(`add-${itemType}`);

      formFields.forEach((field) => {
        const inputId = `${itemType}-${field}`;
        inputs[field] = document.getElementById(inputId);
      });

      if (Object.values(inputs).every((input) => input) && addBtn) {
        const updateValidation = () => {
          const allValid = formFields.every((field) => {
            if (field === 'path') {
              return state[`${itemType}Form`][field].length > 0;
            }
            return inputs[field].value.trim().length > 0;
          });

          addBtn.disabled = !allValid;

          const firstField = formFields[0];
          if (inputs[firstField]) {
            if (inputs[firstField].value.trim().length === 0) {
              inputs[firstField].classList.add('validation-required');
            } else {
              inputs[firstField].classList.remove('validation-required');
            }
          }
        };

        formFields.forEach((field) => {
          if (inputs[field]) {
            inputs[field].addEventListener('input', (e) => {
              state[`${itemType}Form`][field] = e.target.value.trim();
              updateValidation();
            });

            inputs[field].addEventListener('keydown', (e) => {
              if (e.key === 'Enter' && !addBtn.disabled) {
                e.preventDefault();
                app[`handleAdd${capitalizedType}`]();
              }
            });
          }
        });

        updateValidation();
      }

      if (hasPagePicker) {
        const selectPageBtn = document.getElementById(`select-${itemType}-page`);
        if (selectPageBtn) {
          selectPageBtn.addEventListener('click', () => app.openPagePicker(state.site, pluralType));
        }
      }

      if (addBtn) {
        addBtn.addEventListener('click', () => app[`handleAdd${capitalizedType}`]());
      }

      const cancelEditBtn = document.getElementById(`cancel-edit-${itemType}`);
      if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => app[`handleCancelEdit${capitalizedType}`]());
      }

      document.querySelectorAll(`.remove-${itemType}-btn`).forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const index = parseInt(e.target.dataset.index, 10);
          app[`handleRemove${capitalizedType}`](index);
        });
      });
    },

    handleAdd(state, render) {
      const formKey = `${itemType}Form`;
      const form = state[formKey];

      const isValid = formFields.every((field) => form[field] && form[field].length > 0);
      if (!isValid) {
        return;
      }

      const editingKey = `editing${capitalizedType}Index`;
      const existingKey = `existing${capitalizedPlural}`;
      const selectedKey = `selected${capitalizedPlural}`;

      if (state[editingKey] >= 0) {
        const updatedItem = {};
        formFields.forEach((field) => {
          updatedItem[field] = form[field];
        });

        state[existingKey][state[editingKey]] = updatedItem;
        state[selectedKey].push(updatedItem);
        state[editingKey] = -1;
      } else {
        const newItem = {};
        formFields.forEach((field) => {
          newItem[field] = form[field];
        });
        state[selectedKey].push(newItem);
      }

      const emptyForm = {};
      formFields.forEach((field) => {
        emptyForm[field] = '';
      });
      state[formKey] = emptyForm;
      state.errors[pluralType] = '';
      render();
    },

    handleRemove(state, render, index) {
      const selectedKey = `selected${capitalizedPlural}`;
      state[selectedKey].splice(index, 1);
      render();
    },

    handleEditExisting(state, render, index) {
      const existingKey = `existing${capitalizedPlural}`;
      const formKey = `${itemType}Form`;
      const editingKey = `editing${capitalizedType}Index`;

      const item = state[existingKey][index];
      const form = {};
      formFields.forEach((field) => {
        form[field] = item[field];
      });

      state[formKey] = form;
      state[editingKey] = index;
      render();
    },

    handleRemoveExisting(state, render, index) {
      // TODO: Replace window.confirm with custom modal for better UX
      // eslint-disable-next-line no-alert
      if (window.confirm(confirmMessage)) {
        const existingKey = `existing${capitalizedPlural}`;
        const selectedKey = `selected${capitalizedPlural}`;

        const item = state[existingKey][index];
        state[existingKey].splice(index, 1);
        state[selectedKey].push({
          ...item,
          _removed: true,
        });
        render();
      }
    },

    handleCancelEdit(state, render) {
      const formKey = `${itemType}Form`;
      const editingKey = `editing${capitalizedType}Index`;

      const emptyForm = {};
      formFields.forEach((field) => {
        emptyForm[field] = '';
      });

      state[formKey] = emptyForm;
      state[editingKey] = -1;
      render();
    },
  };
}

export const templatesHandler = createLibraryItemHandler('template', {
  formFields: ['name', 'path'],
  hasPagePicker: true,
});

export const iconsHandler = createLibraryItemHandler('icon', {
  formFields: ['name', 'path'],
  hasPagePicker: true,
});

export const placeholdersHandler = createLibraryItemHandler('placeholder', {
  formFields: ['key', 'value'],
  hasPagePicker: false,
});
