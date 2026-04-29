/* popup.js */

function setupLink(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.addEventListener('click', function (e) {
      e.preventDefault();
      // Uses the Chrome API to open a new tab securely
      chrome.tabs.create({ url: this.href });
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Support Donate Link
  setupLink('donate-link');
  
  // getsprint.me Website Link
  setupLink('website-link');
});