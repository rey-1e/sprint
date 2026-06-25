(() => {
  let savedTheme = 'light';

  // ── Theme Engine ──────────────────────────────────────────
  function applyThemeAttribute(theme) {
    if (theme && theme !== 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function injectSecureStyle(cssText) {
    let style = document.getElementById('sprint-cf-theme-sheet');
    if (!style) {
      style = document.createElement('style');
      style.id = 'sprint-cf-theme-sheet';
      document.documentElement.appendChild(style);
    }
    style.textContent = cssText;
  }

  function clearSecureStyle() {
    const style = document.getElementById('sprint-cf-theme-sheet');
    if (style) style.remove();
    document.documentElement.removeAttribute('data-theme');
  }

  async function applyTheme(theme, cachedCSS = null) {
    if (theme === 'light') {
      clearSecureStyle();
      await chrome.storage.local.remove('cachedCFThemeCSS');
      return;
    }
    chrome.runtime.sendMessage({ type: "FETCH_CF_THEME", theme }, async (res) => {
      if (res?.success && res.data?.fullCSS) {
        if (res.data.fullCSS !== cachedCSS) {
          injectSecureStyle(res.data.fullCSS);
          applyThemeAttribute(theme);
          await chrome.storage.local.set({ cachedCFThemeCSS: res.data.fullCSS });
        }
      } else {
        console.warn("Sprint CF Theme: Theme download failed.");
      }
    });
  }

  // ── Anti-Spoiler ──────────────────────────────────────────
  function updateAntiSpoilerClasses(settings) {
    if (settings.cfHideTags !== undefined) {
      document.documentElement.classList.toggle('cf-zenith-hide-tags', settings.cfHideTags);
    }
    if (settings.cfHideRatings !== undefined) {
      document.documentElement.classList.toggle('cf-zenith-hide-ratings', settings.cfHideRatings);
    }
  }

  // ── Initial Load ──────────────────────────────────────────
  async function init() {
    const storage = await chrome.storage.local.get([
      'codeforcesTheme', 'cachedCFThemeCSS', 'cfHideTags', 'cfHideRatings'
    ]);

    savedTheme = storage.codeforcesTheme || 'light';

    // Apply cached CSS immediately for FOUC-free loading
    if (savedTheme !== 'light' && storage.cachedCFThemeCSS) {
      injectSecureStyle(storage.cachedCFThemeCSS);
      applyThemeAttribute(savedTheme);
    }

    // Fetch fresh theme from server (pass cached CSS to prevent redundant application)
    await applyTheme(savedTheme, storage.cachedCFThemeCSS);

    // Apply anti-spoiler settings
    updateAntiSpoilerClasses({
      cfHideTags: storage.cfHideTags || false,
      cfHideRatings: storage.cfHideRatings || false
    });
  }

  init();

  // ── Listen for storage changes (live updates from popup) ──
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;

    if (changes.codeforcesTheme) {
      savedTheme = changes.codeforcesTheme.newValue || 'light';
      await applyTheme(savedTheme);
    }

    const antiSpoilerSettings = {};
    if (changes.cfHideTags) antiSpoilerSettings.cfHideTags = changes.cfHideTags.newValue;
    if (changes.cfHideRatings) antiSpoilerSettings.cfHideRatings = changes.cfHideRatings.newValue;
    if (Object.keys(antiSpoilerSettings).length > 0) {
      updateAntiSpoilerClasses(antiSpoilerSettings);
    }
  });
})();
