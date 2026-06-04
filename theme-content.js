(() => {
  const currentHost = window.location.hostname;
  if (
    currentHost.includes('getsprint.me') ||
    currentHost.includes('localhost') ||
    currentHost.includes('127.0.0.1')
  ) {
    const syncTokenFromDOM = () => {
      const authState = document.documentElement.getAttribute('data-sprint-auth');
      const premiumState = document.documentElement.getAttribute('data-sprint-premium');
      
      if (authState) {
        if (authState === 'logout') {
          chrome.storage.local.remove(['authToken', 'isPremium', 'cachedThemeCSS']);
        } else {
          chrome.storage.local.set({ authToken: authState });
        }
      }

      if (premiumState) {
        chrome.storage.local.set({ isPremium: premiumState === 'true' });
      }
    };

    syncTokenFromDOM();

    const authObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'data-sprint-auth' || mutation.attributeName === 'data-sprint-premium')
        ) {
          syncTokenFromDOM();
        }
      }
    });

    authObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-sprint-auth', 'data-sprint-premium']
    });

    return; 
  }

  let savedTheme = 'default';
  let cachedOptions = null;

  const Mode = {
    PROBLEM_SET: 'PROBLEM_SET',
    CODING_AREA: 'CODING_AREA',
    CONTEST: 'CONTEST'
  };

  function findMode() {
    const url = window.location.href;
    if (url.includes('/contest/')) return Mode.CONTEST;
    if (url.includes('/problems/')) return Mode.CODING_AREA;
    if (url.includes('/problemset/')) return Mode.PROBLEM_SET;
    return null;
  }

  class ProblemSetStrategy {
    constructor() {
      this.cachedRows = null;
    }

    getRows() {
      if (!this.cachedRows || this.cachedRows.length === 0) {
        this.cachedRows = document.querySelectorAll('a[id]');
      }
      return this.cachedRows;
    }

    hideLockedProblems(checked) {
      this.getRows().forEach(row => {
        const lockSvg = row.querySelector('div>div:nth-child(1)>svg[data-icon="lock"]') || row.querySelector('div>div:nth-child(1)>svg');
        const isLock = lockSvg && (lockSvg.getAttribute('data-icon') === 'lock' || lockSvg.classList.contains('fa-lock'));
        if (isLock) {
          row.classList.toggle('hide_leetcode-enhancer', !checked);
        }
      });
    }

    highlightSolvedProblems(checked) {
      const isDarkMode = document.documentElement.classList.contains('dark');
      const targetClass = isDarkMode
        ? 'add-bg-dark_leetcode-enhancer'
        : 'add-bg-light_leetcode-enhancer';

      this.getRows().forEach(row => {
        const checkSvg = row.querySelector('div>div:nth-child(1)>svg[data-icon="check"]') || row.querySelector('div>div:nth-child(1)>svg');
        const isCheck = checkSvg && (checkSvg.getAttribute('data-icon') === 'check' || checkSvg.classList.contains('fa-check'));
        if (isCheck) {
          row.classList.remove(
            'add-bg-dark_leetcode-enhancer',
            'add-bg-light_leetcode-enhancer'
          );
          if (checked) row.classList.add(targetClass);
        }
      });
    }

    hideSolvedProb(checked) {
      this.getRows().forEach(row => {
        const checkSvg = row.querySelector('div>div:nth-child(1)>svg[data-icon="check"]') || row.querySelector('div>div:nth-child(1)>svg');
        const isCheck = checkSvg && (checkSvg.getAttribute('data-icon') === 'check' || checkSvg.classList.contains('fa-check'));
        if (isCheck) {
          row.classList.toggle('hide_leetcode-enhancer', !checked);
        }
      });
    }

    toggleByColName(colName, checked) {
      const colMap = {
        status: 'div>div:nth-child(1)',
        acceptance: 'div>div:nth-child(2)>div:nth-child(2)',
        difficulty: 'div>div:nth-child(2)>p:nth-child(3)',
        frequency: 'div>div:nth-child(3)',
        save: 'div>div:nth-child(4)>div'
      };

      const selector = colMap[colName];
      if (!selector) return;

      this.getRows().forEach(row => {
        row.querySelector(selector)?.classList.toggle('hide_leetcode-enhancer', !checked);
      });
    }
  }

  class CodingAreaStrategy {
    hideSolvedDiff(checked) {
      // Precise, future-proof selector for all difficulty labels on the page
      const diffs = document.querySelectorAll('[class*="text-difficulty-"]');
      diffs.forEach(el => {
        el.classList.toggle('hide_leetcode-enhancer', !checked);
      });
    }

    hideDiffOfSimilarProb(checked) {
      // Beautifully covered under hideSolvedDiff selector above.
    }

    hideStatus(checked) {
      const slug = window.location.pathname.split("/")[2];
      if (!slug) return;
      const problemLink = document.querySelector(`a[href='/problems/${slug}/']`);
      problemLink?.parentNode?.parentNode?.nextSibling?.classList.toggle(
        'hide_leetcode-enhancer',
        !checked
      );
    }

    hideAcceptance(checked) {
      const slug = window.location.pathname.split("/")[2];
      if (!slug) return;
      const problemLink = document.querySelector(`a[href='/problems/${slug}/']`);
      const acceptanceElement =
        problemLink?.parentNode?.parentNode?.parentNode?.nextSibling?.nextSibling
          ?.nextSibling?.children?.[3];
      acceptanceElement?.classList.toggle('hide_leetcode-enhancer', !checked);
    }

    hideSave(checked) {
      document
        .querySelector("svg[data-icon='star']")
        ?.classList.toggle('hide_leetcode-enhancer', !checked);
    }

    toggleByColName(colName, checked) {
      if (colName === 'difficulty') {
        this.hideSolvedDiff(checked);
        this.hideDiffOfSimilarProb(checked);
      } else if (colName === 'status') {
        this.hideStatus(checked);
      } else if (colName === 'acceptance') {
        this.hideAcceptance(checked);
      } else if (colName === 'save') {
        this.hideSave(checked);
      }
    }
  }

  class ContestStrategy {
    hideDiffFromContest(checked) {
      const oldDiffLabel = document.querySelector(
        '.contest-question-info .list-group .list-group-item:nth-child(5) .label'
      );
      if (oldDiffLabel) {
        oldDiffLabel.style.visibility = checked ? 'visible' : 'hidden';
        return;
      }

      const diffClasses = [
        '.text-difficulty-easy',
        '.text-difficulty-medium',
        '.text-difficulty-hard',
        '.text-sd-easy',
        '.text-sd-medium',
        '.text-sd-hard'
      ];
      diffClasses.forEach(selector => {
        document.querySelectorAll(selector).forEach(label => {
          label.classList.toggle('hide_leetcode-enhancer', !checked);
        });
      });
    }

    toggleByColName(colName, checked) {
      if (colName === 'difficulty') {
        this.hideDiffFromContest(checked);
      }
    }
  }

  const strategyCache = {};
  function getStrategy(mode) {
    if (!mode) return null;
    if (!strategyCache[mode]) {
      if (mode === Mode.PROBLEM_SET) strategyCache[mode] = new ProblemSetStrategy();
      if (mode === Mode.CODING_AREA) strategyCache[mode] = new CodingAreaStrategy();
      if (mode === Mode.CONTEST) strategyCache[mode] = new ContestStrategy();
    }
    return strategyCache[mode];
  }

  function applyVisibilityChanges(options) {
    const mode = findMode();
    const strategy = getStrategy(mode);
    if (!strategy || !options) return;

    if (strategy.cachedRows) strategy.cachedRows = null;

    options.forEach(option => {
      const { optionName: name, checked } = option;

      if (name === 'locked') {
        if (typeof strategy.hideLockedProblems === 'function')
          strategy.hideLockedProblems(checked);
      } else if (name === 'highlight') {
        if (typeof strategy.highlightSolvedProblems === 'function')
          strategy.highlightSolvedProblems(checked);
      } else if (name === 'solved') {
        if (typeof strategy.hideSolvedProb === 'function')
          strategy.hideSolvedProb(checked);
      } else {
        if (typeof strategy.toggleByColName === 'function')
          strategy.toggleByColName(name, checked);
      }
    });
  }

  let observer = null;
  let visibilityDebounce = null;

  function initVisibilityObserver() {
    if (observer) observer.disconnect();

    const mode = findMode();
    if (!mode) return;

    observer = new MutationObserver(() => {
      if (visibilityDebounce) clearTimeout(visibilityDebounce);
      visibilityDebounce = setTimeout(() => {
        if (cachedOptions) applyVisibilityChanges(cachedOptions);
      }, 150);
    });

    const targetElement = document.documentElement;
    if (targetElement) {
      observer.observe(targetElement, { childList: true, subtree: true });
    }
  }

  function injectVisibilityStyles() {
    let styleTag = document.getElementById('sprint-visibility-styles');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'sprint-visibility-styles';
      styleTag.textContent = `
        .add-bg-light_leetcode-enhancer {
            background-color: #a1ffa5 !important;
        }
        .add-bg-dark_leetcode-enhancer {
            background-color: rgb(115, 115, 115) !important;
        }
        .hide_leetcode-enhancer {
            display: none !important;
        }
      `;
      document.documentElement.appendChild(styleTag);
    }
  }

  async function initOptions() {
    injectVisibilityStyles();
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

    cachedOptions = options || defaultOpts;
    if (!options) {
      await chrome.storage.local.set({ options: defaultOpts });
    }

    applyVisibilityChanges(cachedOptions);
    initVisibilityObserver();
  }

  function injectSecureStyle(cssText) {
    let styleTag = document.getElementById('sprint-secure-theme-sheet');
    if (!styleTag) {
      styleTag = document.createElement('style');
      styleTag.id = 'sprint-secure-theme-sheet';
      document.documentElement.appendChild(styleTag);
    }
    styleTag.textContent = cssText;
  }

  function clearSecureStyle() {
    const styleTag = document.getElementById('sprint-secure-theme-sheet');
    if (styleTag) styleTag.remove();
    document.documentElement.removeAttribute('data-lc-theme');
  }

  async function initTheme() {
    const localData = await chrome.storage.local.get(['leetcodeTheme', 'cachedThemeCSS']);
    savedTheme = localData.leetcodeTheme || 'default';

    if (savedTheme !== 'default' && localData.cachedThemeCSS) {
      document.documentElement.setAttribute('data-lc-theme', savedTheme);
      document.documentElement.classList.add('dark');
      injectSecureStyle(localData.cachedThemeCSS);
    }

    await applyTheme(savedTheme, true);
    observeTheme();
  }

  async function applyTheme(theme, isBackgroundCheck = false) {
    if (theme === 'default') {
      clearSecureStyle();
      await chrome.storage.local.remove('cachedThemeCSS');
      return;
    }

    const { authToken = "" } = await chrome.storage.local.get('authToken');

    try {
      const res = await fetch('https://gettheme-i6ptizncma-uc.a.run.app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
          'X-Client-Version': '3.0'
        },
        body: JSON.stringify({ themeName: theme })
      });

      const data = await res.json();

      if (res.ok && data.success && data.fullCSS) {
        document.documentElement.setAttribute('data-lc-theme', theme);
        document.documentElement.classList.add('dark');
        injectSecureStyle(data.fullCSS);
        await chrome.storage.local.set({ cachedThemeCSS: data.fullCSS });
      } else {
        clearSecureStyle();
        await chrome.storage.local.remove('cachedThemeCSS');

        if (!isBackgroundCheck && theme !== 'default') {
          alert("Premium is required to use Custom Themes!");
          window.open('https://getsprint.me/payments', '_blank');
        }
      }
    } catch (e) {
      console.error("Secure theme delivery failure:", e);
    }
  }

  function observeTheme() {
    const themeObserver = new MutationObserver(() => {
      const currentTheme =
        document.documentElement.getAttribute('data-lc-theme') || 'default';
      const hasDark = document.documentElement.classList.contains('dark');
      if (currentTheme !== savedTheme || (savedTheme !== 'default' && !hasDark)) {
        themeObserver.disconnect();
        applyTheme(savedTheme);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-lc-theme', 'class']
        });
      }
    });

    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-lc-theme', 'class']
    });
  }

  initTheme();
  initOptions();

  let currentHref = window.location.href;
  const handleUrlChange = () => {
    if (window.location.href !== currentHref) {
      currentHref = window.location.href;
      initOptions();
    }
  };

  window.addEventListener('popstate', handleUrlChange);

  const patchHistory = (type) => {
    const orig = history[type];
    history[type] = function () {
      orig.apply(this, arguments);
      handleUrlChange();
    };
  };
  patchHistory('pushState');
  patchHistory('replaceState');

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'setTheme') {
      savedTheme = request.theme;
      applyTheme(savedTheme);
    }
    if (request.action === 'applyVisibilityOptions') {
      cachedOptions = request.options;
      applyVisibilityChanges(cachedOptions);
    }
  });
})();