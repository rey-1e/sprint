const MATCH_PATTERNS = [
  '*://*.leetcode.com/*',
  '*://*.leetcode.cn/*',
  '*://getsprint.me/*',
  '*://*.getsprint.me/*',
  'http://localhost/*',
  'http://127.0.0.1/*'
];

async function broadcastMessage(message) {
  try {
    const tabs = await chrome.tabs.query({ url: MATCH_PATTERNS });
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  } catch (err) {
    console.error("Sprint Settings Broadcast failed:", err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  const upgradeLink = document.getElementById('upgrade-link');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: upgradeLink.href });
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
  } else {
    let modified = false;
    defaultOptions.forEach(defOpt => {
      if (!options.some(opt => opt.optionName === defOpt.optionName)) {
        options.push(defOpt);
        modified = true;
      }
    });
    if (modified) {
      await chrome.storage.local.set({ options });
    }
  }

  options.forEach(opt => {
    const input = document.getElementById(opt.optionName);
    if (input) input.checked = opt.checked;
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      const storage = await chrome.storage.local.get('options');
      const currentOpts = storage.options || [];

      let found = false;
      const updated = currentOpts.map(opt => {
        if (opt.optionName === cb.id) {
          found = true;
          return { optionName: cb.id, checked: cb.checked };
        }
        return opt;
      });
      if (!found) {
        updated.push({ optionName: cb.id, checked: cb.checked });
      }

      await chrome.storage.local.set({ options: updated });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updated });
    });
  });
});