const LEETCODE_DOMAINS = ['*://*.leetcode.com/*', '*://*.leetcode.cn/*'];

function setupLink(id) {
  const el = document.getElementById(id);
  if (el) el.addEventListener('click', function (e) { e.preventDefault(); chrome.tabs.create({ url: this.href }); });
}

async function broadcastMessage(message) {
  for (const url of LEETCODE_DOMAINS) {
    try {
      const tabs = await chrome.tabs.query({ url });
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
    } catch {}
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupLink('upgrade-link');
  setupLink('website-link');
  setupLink('info-question-link');

  const comp = document.getElementById('company-link');
  if (comp) comp.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: comp.href }); });

  const { isPremium = false } = await chrome.storage.local.get('isPremium');
  const themes = document.getElementById('themes-section');
  
  if (!isPremium && themes) {
    themes.classList.add('premium-locked');
    const overlay = document.createElement('div');
    overlay.className = 'themes-lock-overlay';
    overlay.innerHTML = `
      <div class="lock-overlay-content">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-bottom: 4px;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Premium Themes Locked</span>
        <a href="https://getsprint.me/payments/index.html" id="lock-cta-btn" class="btn-lock-upgrade">Upgrade Now</a>
      </div>
    `;
    themes.style.position = 'relative';
    themes.appendChild(overlay);
    
    const lockCta = document.getElementById('lock-cta-btn');
    if (lockCta) lockCta.addEventListener('click', (e) => { e.preventDefault(); chrome.tabs.create({ url: lockCta.href }); });
  }

  const dots = document.querySelectorAll('.dot');
  const activeLabel = document.getElementById('active-label');
  const { leetcodeTheme = 'default' } = await chrome.storage.local.get('leetcodeTheme');

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

  options.forEach(opt => {
    const input = document.getElementById(opt.optionName);
    if (input) input.checked = opt.checked;
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      const updated = Array.from(checkboxes).map(input => ({ optionName: input.id, checked: input.checked }));
      await chrome.storage.local.set({ options: updated });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updated });
    });
  });
});