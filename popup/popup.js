const LEETCODE_DOMAINS = ['*://*.leetcode.com/*', '*://*.leetcode.cn/*'];

function setupLink(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener('click', function (e) {
    e.preventDefault();
    chrome.tabs.create({ url: this.href });
  });
}

async function broadcastMessage(message) {
  for (const url of LEETCODE_DOMAINS) {
    try {
      const tabs = await chrome.tabs.query({ url });
      tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
    } catch {
      // Avoid runtime failures
    }
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  setupLink('upgrade-link');
  setupLink('website-link');
  setupLink('info-question-link');

  const companyAnchor = document.querySelector('.kbd a[href]');
  if (companyAnchor) {
    companyAnchor.addEventListener('click', function (e) {
      e.preventDefault();
      chrome.tabs.create({ url: this.href });
    });
  }

  // ── Premium Locking Module ──
  const { isPremium = false } = await chrome.storage.local.get('isPremium');
  const themesSection = document.getElementById('themes-section');
  
  if (!isPremium && themesSection) {
    themesSection.classList.add('premium-locked');
    const lockOverlay = document.createElement('div');
    lockOverlay.className = 'themes-lock-overlay';
    lockOverlay.innerHTML = `
      <div class="lock-overlay-content">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-bottom: 4px;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Premium Themes Locked</span>
        <a href="https://getsprint.me/payments/index.html" id="lock-cta-btn" class="btn-lock-upgrade">Upgrade Now</a>
      </div>
    `;
    themesSection.style.position = 'relative';
    themesSection.appendChild(lockOverlay);
    
    const lockCta = document.getElementById('lock-cta-btn');
    if (lockCta) {
      lockCta.addEventListener('click', function(e) {
        e.preventDefault();
        chrome.tabs.create({ url: this.href });
      });
    }
  }

  // ── Theme palette setup ──
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
      if (!isPremium && dot.dataset.theme !== 'default') {
        return; // Prevent free users from setting premium themes locally
      }
      const { theme, display } = dot.dataset;

      document.querySelector('.dot.active')?.classList.remove('active');
      dot.classList.add('active');
      if (activeLabel) activeLabel.textContent = display;

      await chrome.storage.local.set({ leetcodeTheme: theme });
      broadcastMessage({ action: 'setTheme', theme });
    });
  });

  // ── Visibility settings setup (remains as-is) ──
  const checkboxes = document.querySelectorAll('.sprint-switch input');
  let { options } = await chrome.storage.local.get('options');
  if (!options) {
    options = [
      { optionName: 'locked', checked: true },
      { optionName: 'highlight', checked: false },
      { optionName: 'solved', checked: true },
      { optionName: 'status', checked: true },
      { optionName: 'acceptance', checked: true },
      { optionName: 'difficulty', checked: true },
      { optionName: 'frequency', checked: true },
      { optionName: 'save', checked: true }
    ];
    await chrome.storage.local.set({ options });
  }

  options.forEach(opt => {
    const input = document.getElementById(opt.optionName);
    if (input) input.checked = opt.checked;
  });

  checkboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      const updatedOptions = Array.from(checkboxes).map(input => ({
        optionName: input.id,
        checked: input.checked
      }));
      await chrome.storage.local.set({ options: updatedOptions });
      broadcastMessage({ action: 'applyVisibilityOptions', options: updatedOptions });
    });
  });
});