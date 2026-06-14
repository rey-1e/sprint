function setupLink(id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function (e) { e.preventDefault(); chrome.tabs.create({ url: this.href }); });
}

async function broadcastMessage(message) {
  try {
    const tabs = await chrome.tabs.query({ url: [
      '*://*.leetcode.com/*',
      '*://*.leetcode.cn/*',
      '*://getsprint.me/*',
      '*://*.getsprint.me/*',
      'http://localhost/*',
      'http://127.0.0.1/*'
    ] });
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  } catch (err) {
    console.error("Sprint Broadcast failed:", err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupLink('upgrade-link');
  setupLink('website-link');
  setupLink('info-question-link');

  const comp = document.getElementById('company-link');
  if (comp) comp.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: comp.href }); });

  // Navigation pill logic to leetcode.html
  const leetcodePill = document.getElementById('leetcode-pill');
  if (leetcodePill) {
    leetcodePill.addEventListener('click', () => {
      window.location.href = 'leetcode.html';
    });
  }

  // Dual-view transition panel mappings
  const settingsToggleBtn = document.getElementById('settings-toggle-btn');
  const settingsBackBtn = document.getElementById('settings-back-btn');
  const mainView = document.getElementById('main-view');
  const settingsView = document.getElementById('settings-view');

  if (settingsToggleBtn && settingsBackBtn && mainView && settingsView) {
    settingsToggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      mainView.classList.remove('active');
      settingsView.classList.add('active');
    });

    settingsBackBtn.addEventListener('click', (e) => {
      e.preventDefault();
      settingsView.classList.remove('active');
      mainView.classList.add('active');
    });
  }

  const checkboxes = document.querySelectorAll('.sprint-switch input');
  let { options } = await chrome.storage.local.get('options');

  const defaultOptions = [
    { optionName: 'removeInjections', checked: false },
    { optionName: 'showSphere', checked: true },
    { optionName: 'removeSelectionPopup', checked: false }
  ];

  if (!options) {
    options = defaultOptions;
    await chrome.storage.local.set({ options });
  }

  options.forEach(opt => {
    const input = document.getElementById(opt.optionName);
    if (input) input.checked = opt.checked;
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      const storage = await chrome.storage.local.get('options');
      const currentOpts = storage.options || [];
      const updated = currentOpts.map(o => {
        return o.optionName === cb.id ? { optionName: cb.id, checked: cb.checked } : o;
      });
      await chrome.storage.local.set({ options: updated });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updated });
    });
  });
});