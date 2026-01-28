const STORAGE_KEY = 'library-setup-github-token';

const TokenStorage = {
  get() {
    return localStorage.getItem(STORAGE_KEY);
  },

  set(token) {
    localStorage.setItem(STORAGE_KEY, token);
  },

  clear() {
    localStorage.removeItem(STORAGE_KEY);
  },

  exists() {
    return !!this.get();
  },
};

export default TokenStorage;
