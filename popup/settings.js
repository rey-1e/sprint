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
  const checkboxes = document.querySelectorAll('.sprint-switch input');
  let { options } = await chrome.storage.local.get('options');

  if (!options) {
    options = [
      { optionName: 'removeInjections', checked: false },
      { optionName: 'showSphere', checked: true },
      { optionName: 'removeSelectionPopup', checked: false }
    ];
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

      // Update values for options present on this settings page
      const updated = currentOpts.map(opt => {
        const input = document.getElementById(opt.optionName);
        return input ? { optionName: opt.optionName, checked: input.checked } : opt;
      });

      await chrome.storage.local.set({ options: updated });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updated });
    });
  });
});

