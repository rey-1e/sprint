/**
 * Sprint Extension — popup.js
 * Handles external links and the palette-dot theme selector.
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
});