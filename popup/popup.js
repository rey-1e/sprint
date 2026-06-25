function setupLink(id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function (e) { e.preventDefault(); chrome.tabs.create({ url: this.href }); });
}

async function broadcastMessage(message) {
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  } catch (err) {
    console.error("Sprint Broadcast failed:", err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupLink('upgrade-link');
  setupLink('settings-upgrade-link');
  setupLink('website-link');
  setupLink('info-question-link');

  const comp = document.getElementById('company-link');
  if (comp) comp.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: comp.href }); });

  // Navigation pill logic to leetcode.html
  const leetcodePill = document.getElementById('leetcode-pill');
  if (leetcodePill) {
    leetcodePill.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'leetcode/leetcode.html';
    });
  }

  // Navigation pill logic to codeforces.html
  const codeforcesPill = document.getElementById('codeforces-pill');
  if (codeforcesPill) {
    codeforcesPill.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = 'codeforces/codeforces.html';
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
      const updated = currentOpts.map(o => {
        if (o.optionName === cb.id) {
          found = true;
          return { optionName: cb.id, checked: cb.checked };
        }
        return o;
      });
      if (!found) {
        updated.push({ optionName: cb.id, checked: cb.checked });
      }

      await chrome.storage.local.set({ options: updated });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updated });
    });
  });
});