const loadedStyles = new Set();

export default async function loadCSS(filename) {
  if (loadedStyles.has(filename)) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `styles/${filename}`;

  const promise = new Promise((resolve, reject) => {
    link.onload = () => {
      loadedStyles.add(filename);
      resolve();
    };
    link.onerror = reject;
  });

  document.head.appendChild(link);
  await promise;
}
