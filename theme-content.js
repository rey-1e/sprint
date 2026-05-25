(() => {
  let savedTheme = 'default';

  async function initTheme() {
    const data = await chrome.storage.local.get('leetcodeTheme');
    savedTheme = data.leetcodeTheme || 'default';
    
    applyTheme(savedTheme);
    observeTheme();
  }

  function applyTheme(theme) {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-lc-theme');
    } else {
      document.documentElement.setAttribute('data-lc-theme', theme);
    }
  }

  function observeTheme() {
    const observer = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-lc-theme') || 'default';
      if (currentTheme !== savedTheme) {
        observer.disconnect();
        applyTheme(savedTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme'] });
      }
    });
    
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme'] });
  }

  // Initialize theme engine immediately upon document loading start phases
  initTheme();

  // Real-time listener responding to popup switch commands
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'setTheme') {
      savedTheme = request.theme;
      applyTheme(savedTheme);
    }
  });
})();