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

  if (!isPremium) {
    themes.classList.add('premium-locked');
    
    const overlay = document.createElement('div');
    overlay.className = 'themes-lock-overlay';
    
    const content = document.createElement('div');
    content.className = 'lock-overlay-content';

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.style.marginBottom = "4px";

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "3");
    rect.setAttribute("y", "11");
    rect.setAttribute("width", "18");
    rect.setAttribute("height", "11");
    rect.setAttribute("rx", "2");
    rect.setAttribute("ry", "2");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M7 11V7a5 5 0 0 1 10 0v4");

    svg.appendChild(rect);
    svg.appendChild(path);

    const lockText = document.createElement('span');
    lockText.textContent = "Premium Themes Locked";

    const ctaBtn = document.createElement('a');
    ctaBtn.id = 'lock-cta-btn';
    ctaBtn.className = 'btn-lock-upgrade';
    ctaBtn.href = 'https://getsprint.me/payments/index.html';
    ctaBtn.textContent = 'Upgrade Now';

    content.appendChild(svg);
    content.appendChild(lockText);
    content.appendChild(ctaBtn);
    overlay.appendChild(content);

    themes.style.position = 'relative';
    themes.appendChild(overlay);
    
    ctaBtn.addEventListener('click', (e) => { 
      e.preventDefault(); 
      chrome.tabs.create({ url: ctaBtn.href }); 
    });
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

  const storage = await chrome.storage.local.get(['isPremium', 'authToken', 'leetcodeTheme']);
  
  let isPremium = storage.isPremium === true || storage.isPremium === 'true';
  const token = storage.authToken;

  if (token) {
    chrome.runtime.sendMessage({ type: "SYNC_USER" }, async (response) => {
      if (response?.success) {
        const verifiedPremium = response.data.isPremium === true || response.data.isPremium === 'true';
        await chrome.storage.local.set({ 
          isPremium: verifiedPremium,
          premiumUntil: response.data.premiumUntil
        });
        
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
      if (!isPremium && dot.dataset.theme !== 'default') return;
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
    { optionName: 'showSphere', checked: true },
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
      const updated = currentOpts.map(o => {
        return o.optionName === cb.id ? { optionName: cb.id, checked: cb.checked } : o;
      });
      await chrome.storage.local.set({ options: updated });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updated });
    });
  });
});

