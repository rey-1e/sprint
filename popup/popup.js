/* popup.js */
document.querySelector('.btn-donate').addEventListener('click', function (e) {
  e.preventDefault();
  chrome.tabs.create({ url: this.href });
});