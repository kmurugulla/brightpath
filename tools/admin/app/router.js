export function initRouter(viewCallbacks) {
  function handleRoute() {
    const hash = window.location.hash.slice(1) || '/blocks';
    const route = hash.split('/')[1];

    if (viewCallbacks[route]) {
      viewCallbacks[route]();
    } else {
      window.location.hash = '#/blocks';
    }
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}

export function getCurrentRoute() {
  const hash = window.location.hash.slice(1) || '/blocks';
  return hash.split('/')[1];
}

export function navigate(route) {
  window.location.hash = `#/${route}`;
}
