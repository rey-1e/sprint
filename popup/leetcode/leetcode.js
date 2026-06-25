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
    console.error("Sprint Broadcast failed:", err);
  }
}

function renderThemesSection(isPremium) {
  const themes = document.getElementById('themes-section');
  if (!themes) return;

  const existingOverlay = themes.querySelector('.themes-lock-overlay');
  if (existingOverlay) existingOverlay.remove();
  themes.classList.remove('premium-locked');
}

document.addEventListener('DOMContentLoaded', async () => {
  const upgradeLink = document.getElementById('upgrade-link');
  if (upgradeLink) {
    upgradeLink.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: upgradeLink.href });
    });
  }

  const storage = await chrome.storage.local.get(['isPremium', 'authToken', 'leetcodeTheme']);
  
  let isPremium = storage.isPremium === true || storage.isPremium === 'true';
  const token = storage.authToken;

  if (token) {
    chrome.runtime.sendMessage({ type: "SYNC_USER" }, async (response) => {
  if (response?.success) {
    const verifiedPremium = response.data.isPremium === true || response.data.isPremium === 'true';
    
    const updateData = {
      isPremium: verifiedPremium,
      premiumUntil: response.data.premiumUntil
    };

    // If the server returned a persistent session token, save it to keep the session alive long-term
    if (response.data.sessionToken) {
      updateData.authToken = response.data.sessionToken;
    }

    await chrome.storage.local.set(updateData);
    
    if (verifiedPremium !== isPremium) {
      isPremium = verifiedPremium;
      renderThemesSection(isPremium);
    }
  }
});
  }

  renderThemesSection(isPremium);

  const dots = document.querySelectorAll('.dot');
  const activeLabel = document.getElementById('active-label');
  const leetcodeTheme = storage.leetcodeTheme || 'default';

  const activeDot = document.querySelector(`.dot[data-theme="${leetcodeTheme}"]`);
  if (activeDot) {
    activeDot.classList.add('active');
    if (activeLabel) activeLabel.textContent = activeDot.dataset.display;
  }

  dots.forEach(dot => {
    dot.addEventListener('click', async () => {
      const { theme, display } = dot.dataset;
      document.querySelector('.dot.active')?.classList.remove('active');
      dot.classList.add('active');
      if (activeLabel) activeLabel.textContent = display;
      await chrome.storage.local.set({ leetcodeTheme: theme });
      broadcastMessage({ action: 'setTheme', theme });
    });
  });

  const checkboxes = document.querySelectorAll('.sprint-switch input');
  let { options } = await chrome.storage.local.get('options');

  const defaultOptions = [
    { optionName: 'removeInjections', checked: false },
    { optionName: 'removeSelectionPopup', checked: false },
    { optionName: 'locked', checked: true }, { optionName: 'highlight', checked: false },
    { optionName: 'solved', checked: true }, { optionName: 'status', checked: true },
    { optionName: 'acceptance', checked: true }, { optionName: 'difficulty', checked: true },
    { optionName: 'frequency', checked: true }, { optionName: 'save', checked: true }
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

  checkboxes.forEach(cb => {
    const opt = options.find(o => o.optionName === cb.id);
    if (opt) cb.checked = opt.checked;

    cb.addEventListener('change', async () => {
      const storageOpts = await chrome.storage.local.get('options');
      const currentOpts = storageOpts.options || [];
      
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