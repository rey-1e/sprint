const CF_MATCH_PATTERNS = [
  '*://*.codeforces.com/*',
  '*://*.codeforces.ru/*'
];

async function broadcastMessage(message) {
  try {
    const tabs = await chrome.tabs.query({ url: CF_MATCH_PATTERNS });
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {});
    });
  } catch (err) {
    console.error("Sprint CF Broadcast failed:", err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  // Theme dot selection logic
  const dots = document.querySelectorAll('.dot');
  const activeLabel = document.getElementById('active-label');

  const storage = await chrome.storage.local.get(['codeforcesTheme', 'cfHideTags', 'cfHideRatings']);
  const currentTheme = storage.codeforcesTheme || 'light';

  const activeDot = document.querySelector(`.dot[data-theme="${currentTheme}"]`);
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
      await chrome.storage.local.set({ codeforcesTheme: theme });
    });
  });

  // Anti-spoiler toggle logic
  const hideTagsToggle = document.getElementById('cfHideTags');
  const hideRatingsToggle = document.getElementById('cfHideRatings');

  if (hideTagsToggle) {
    hideTagsToggle.checked = storage.cfHideTags || false;
    hideTagsToggle.addEventListener('change', async () => {
      await chrome.storage.local.set({ cfHideTags: hideTagsToggle.checked });
    });
  }

  if (hideRatingsToggle) {
    hideRatingsToggle.checked = storage.cfHideRatings || false;
    hideRatingsToggle.addEventListener('change', async () => {
      await chrome.storage.local.set({ cfHideRatings: hideRatingsToggle.checked });
    });
  }
});
