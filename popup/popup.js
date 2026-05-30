/**
 * Sprint Extension — popup.js
 * Handles external links, the palette-dot theme selector, and visibility settings.
 */

function setupLink(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener('click', function (e) {
    e.preventDefault();
    chrome.tabs.create({ url: this.href });
  });
}

document.addEventListener('DOMContentLoaded', async () => {

  // ── External links ────────────────────────────────────────────
  setupLink('donate-link');
  setupLink('website-link');
  setupLink('info-question-link'); // Google Redirect Support Link

  // The company-wise link lives inside a <kbd> <a> tag;
  // grab it directly by its href so we handle it the same way.
  const companyAnchor = document.querySelector('.kbd a[href]');
  if (companyAnchor) {
    companyAnchor.addEventListener('click', function (e) {
      e.preventDefault();
      chrome.tabs.create({ url: this.href });
    });
  }

  // ── Theme palette ─────────────────────────────────────────────
  const dots        = document.querySelectorAll('.dot');
  const activeLabel = document.getElementById('active-label');

  // Restore persisted theme
  const { leetcodeTheme } = await chrome.storage.local.get('leetcodeTheme');
  const current = leetcodeTheme || 'default';

  const activeDot = document.querySelector(`.dot[data-theme="${current}"]`);
  if (activeDot) {
    activeDot.classList.add('active');
    if (activeLabel) activeLabel.textContent = activeDot.dataset.display;
  }

  // Click handler
  dots.forEach(dot => {
    dot.addEventListener('click', async () => {
      const theme   = dot.dataset.theme;
      const display = dot.dataset.display;

      // Visual state
      document.querySelector('.dot.active')?.classList.remove('active');
      dot.classList.add('active');
      if (activeLabel) activeLabel.textContent = display;

      // Persist
      await chrome.storage.local.set({ leetcodeTheme: theme });

      // Broadcast to open LeetCode tabs
      const domains = ['*://*.leetcode.com/*', '*://*.leetcode.cn/*'];
      for (const domain of domains) {
        try {
          const tabs = await chrome.tabs.query({ url: domain });
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'setTheme',
              theme
            }).catch(() => {});
          });
        } catch {
          // Suppress errors on inactive/discarded tabs
        }
      }
    });
  });

  // ── Visibility Settings ───────────────────────────────────────
  const checkboxes = document.querySelectorAll('.sprint-switch input');
  
  // Set defaults if nothing is in local storage yet
  const { options } = await chrome.storage.local.get('options');
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

  const currentOptions = options || defaultOpts;
  if (!options) {
    await chrome.storage.local.set({ options: defaultOpts });
  }

  // Set the checkbox DOM states
  currentOptions.forEach(opt => {
    const input = document.getElementById(opt.optionName);
    if (input) {
      input.checked = opt.checked;
    }
  });

  // Handle setting updates
  checkboxes.forEach(cb => {
    cb.addEventListener('change', async () => {
      const updatedOptions = Array.from(checkboxes).map(input => ({
        optionName: input.id,
        checked: input.checked
      }));

      await chrome.storage.local.set({ options: updatedOptions });

      // Propagate live changes to all open LeetCode workspaces
      const domains = ['*://*.leetcode.com/*', '*://*.leetcode.cn/*'];
      for (const domain of domains) {
        try {
          const tabs = await chrome.tabs.query({ url: domain });
          tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'applyVisibilityOptions',
              options: updatedOptions
            }).catch(() => {});
          });
        } catch {
          // Suppress runtime active environment errors
        }
      }
    });
  });

});