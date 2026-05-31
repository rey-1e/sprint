/**
 * Sprint Extension — popup.js
 */

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
      // Avoid runtime failures on un-navigated/discarded tabs
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
      const { theme, display } = dot.dataset;

      document.querySelector('.dot.active')?.classList.remove('active');
      dot.classList.add('active');
      if (activeLabel) activeLabel.textContent = display;

      await chrome.storage.local.set({ leetcodeTheme: theme });
      broadcastMessage({ action: 'setTheme', theme });
    });
  });

  // ── Visibility settings setup ──
  const checkboxes = document.querySelectorAll('.sprint-switch input');
  const defaultOpts = [
    { optionName: 'locked', checked: true },
    { optionName: 'highlight', checked: false },
    { optionName: 'solved', checked: true },
    { optionName: 'status', checked: true },
    { optionName: 'acceptance', checked: true },
    { optionName: 'difficulty', checked: true },
    { optionName: 'frequency', checked: true },
    { optionName: 'save', checked: true }
  ];

  let { options } = await chrome.storage.local.get('options');
  if (!options) {
    options = defaultOpts;
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