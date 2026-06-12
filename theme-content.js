(() => {
  const currentHost = window.location.hostname;
  if (currentHost.includes('getsprint.me') || currentHost.includes('localhost') || currentHost.includes('127.0.0.1')) {
    const syncTokenFromDOM = () => {
      const auth = document.documentElement.getAttribute('data-sprint-auth');
      const prem = document.documentElement.getAttribute('data-sprint-premium');
      if (auth) {
        if (auth === 'logout') {
          chrome.storage.local.remove(['authToken', 'isPremium', 'cachedThemeCSS']);
        } else {
          chrome.storage.local.set({ authToken: auth });
        }
      }
      if (prem) chrome.storage.local.set({ isPremium: prem === 'true' });
    };

    syncTokenFromDOM();
    new MutationObserver(() => syncTokenFromDOM()).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-sprint-auth', 'data-sprint-premium']
    });
    return;
  }

  let savedTheme = 'default';
  let cachedOptions = null;
  const Mode = { PROBLEM_SET: 'PS', CODING_AREA: 'CA', CONTEST: 'CO' };

  function findMode() {
    const url = window.location.href;
    if (url.includes('/contest/')) return Mode.CONTEST;
    if (url.includes('/problems/')) return Mode.CODING_AREA;
    if (url.includes('/problemset/')) return Mode.PROBLEM_SET;
    return null;
  }

  class ProblemSetStrategy {
    constructor() { this.rows = null; }
    getRows() {
      if (!this.rows?.length) this.rows = document.querySelectorAll('a[id]');
      return this.rows;
    }
    hideLockedProblems(c) {
      this.getRows().forEach(r => {
        const svg = r.querySelector('div>div:nth-child(1)>svg[data-icon="lock"]') || r.querySelector('div>div:nth-child(1)>svg');
        if (svg && (svg.getAttribute('data-icon') === 'lock' || svg.classList.contains('fa-lock'))) r.classList.toggle('hide_leetcode-enhancer', !c);
      });
    }
    highlightSolvedProblems(c) {
      const isDark = document.documentElement.classList.contains('dark');
      const cls = isDark ? 'add-bg-dark_leetcode-enhancer' : 'add-bg-light_leetcode-enhancer';
      this.getRows().forEach(r => {
        const svg = r.querySelector('div>div:nth-child(1)>svg[data-icon="check"]') || r.querySelector('div>div:nth-child(1)>svg');
        const isCheck = svg && (svg.getAttribute('data-icon') === 'check' || svg.classList.contains('fa-check'));
        r.classList.remove('add-bg-dark_leetcode-enhancer', 'add-bg-light_leetcode-enhancer');
        if (isCheck && c) r.classList.add(cls);
      });
    }
    hideSolvedProb(c) {
      this.getRows().forEach(r => {
        const svg = r.querySelector('div>div:nth-child(1)>svg[data-icon="check"]') || r.querySelector('div>div:nth-child(1)>svg');
        if (svg && (svg.getAttribute('data-icon') === 'check' || svg.classList.contains('fa-check'))) r.classList.toggle('hide_leetcode-enhancer', !c);
      });
    }
    toggleByColName(col, c) {
      const map = { status: 'div>div:nth-child(1)', acceptance: 'div>div:nth-child(2)>div:nth-child(2)', difficulty: 'div>div:nth-child(2)>p:nth-child(3)', frequency: 'div>div:nth-child(3)', save: 'div>div:nth-child(4)>div' };
      if (map[col]) this.getRows().forEach(r => r.querySelector(map[col])?.classList.toggle('hide_leetcode-enhancer', !c));
    }
  }

  class CodingAreaStrategy {
    hideSolvedDiff(c) {
      document.querySelectorAll('[class*="text-difficulty-"]').forEach(el => el.classList.toggle('hide_leetcode-enhancer', !c));
    }
    hideStatus(c) {
      const slug = window.location.pathname.split("/")[2];
      if (slug) document.querySelector(`a[href*='/problems/${slug}']`)?.parentNode?.parentNode?.nextSibling?.classList.toggle('hide_leetcode-enhancer', !c);
    }
    hideAcceptance(c) {
      const slug = window.location.pathname.split("/")[2];
      if (slug) {
        const link = document.querySelector(`a[href*='/problems/${slug}']`);
        link?.parentNode?.parentNode?.parentNode?.nextSibling?.nextSibling?.nextSibling?.children?.[3]?.classList.toggle('hide_leetcode-enhancer', !c);
      }
    }
    hideSave(c) { document.querySelector("svg[data-icon='star']")?.classList.toggle('hide_leetcode-enhancer', !c); }
    toggleByColName(col, c) {
      if (col === 'difficulty') this.hideSolvedDiff(c);
      else if (col === 'status') this.hideStatus(c);
      else if (col === 'acceptance') this.hideAcceptance(c);
      else if (col === 'save') this.hideSave(c);
    }
  }

  class ContestStrategy {
    hideDiffFromContest(c) {
      const label = document.querySelector('.contest-question-info .list-group .list-group-item:nth-child(5) .label');
      if (label) { label.style.visibility = c ? 'visible' : 'hidden'; return; }
      ['.text-difficulty-easy', '.text-difficulty-medium', '.text-difficulty-hard', '.text-sd-easy', '.text-sd-medium', '.text-sd-hard'].forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.classList.toggle('hide_leetcode-enhancer', !c));
      });
    }
    toggleByColName(col, c) { if (col === 'difficulty') this.hideDiffFromContest(c); }
  }

  const stratCache = {};
  function getStrategy(m) {
    if (!m) return null;
    if (!stratCache[m]) {
      if (m === Mode.PROBLEM_SET) stratCache[m] = new ProblemSetStrategy();
      if (m === Mode.CODING_AREA) stratCache[m] = new CodingAreaStrategy();
      if (m === Mode.CONTEST) stratCache[m] = new ContestStrategy();
    }
    return stratCache[m];
  }

  function applyVisibilityChanges(opts) {
    const m = findMode();
    const strat = getStrategy(m);
    if (!strat || !opts) return;
    if (strat.rows) strat.rows = null;

    opts.forEach(o => {
      const { optionName: name, checked: c } = o;
      if (name === 'locked' && typeof strat.hideLockedProblems === 'function') strat.hideLockedProblems(c);
      else if (name === 'highlight' && typeof strat.highlightSolvedProblems === 'function') strat.highlightSolvedProblems(c);
      else if (name === 'solved' && typeof strat.hideSolvedProb === 'function') strat.hideSolvedProb(c);
      else if (typeof strat.toggleByColName === 'function') strat.toggleByColName(name, c);
    });
  }

  let observer = null, debounce = null;
  function initVisibilityObserver() {
    if (observer) observer.disconnect();
    if (!findMode()) return;
    observer = new MutationObserver((mutations) => {
      // Performance optimization: check if any actual structural tree mutations occurred
      let structuralChange = false;
      for (const m of mutations) {
        if (m.type === 'childList' && m.addedNodes.length > 0) {
          structuralChange = true;
          break;
        }
      }
      if (!structuralChange) return;

      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { if (cachedOptions) applyVisibilityChanges(cachedOptions); }, 150);
    });
    if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function injectVisibilityStyles() {
    if (document.getElementById('sprint-visibility-styles')) return;
    const style = document.createElement('style');
    style.id = 'sprint-visibility-styles';
    style.textContent = `
      .add-bg-light_leetcode-enhancer { background-color: #a1ffa5 !important; }
      .add-bg-dark_leetcode-enhancer { background-color: rgb(115, 115, 115) !important; }
      .hide_leetcode-enhancer { display: none !important; }
    `;
    document.documentElement.appendChild(style);
  }

  async function initOptions() {
    injectVisibilityStyles();
    const { options } = await chrome.storage.local.get('options');
    const defaultOpts = [
      { optionName: 'removeInjections', checked: false },
      { optionName: 'locked', checked: true }, { optionName: 'highlight', checked: false },
      { optionName: 'solved', checked: true }, { optionName: 'status', checked: true },
      { optionName: 'acceptance', checked: true }, { optionName: 'difficulty', checked: true },
      { optionName: 'frequency', checked: true }, { optionName: 'save', checked: true }
    ];
    cachedOptions = options || defaultOpts;
    if (!options) await chrome.storage.local.set({ options: defaultOpts });
    applyVisibilityChanges(cachedOptions);
    initVisibilityObserver();
  }

  function injectSecureStyle(cssText) {
    let style = document.getElementById('sprint-secure-theme-sheet');
    if (!style) {
      style = document.createElement('style');
      style.id = 'sprint-secure-theme-sheet';
      document.documentElement.appendChild(style);
    }
    style.textContent = cssText;
  }

  function clearSecureStyle() {
    const style = document.getElementById('sprint-secure-theme-sheet');
    if (style) style.remove();
    document.documentElement.removeAttribute('data-lc-theme');
  }

  async function initTheme() {
    const local = await chrome.storage.local.get(['leetcodeTheme', 'cachedThemeCSS']);
    savedTheme = local.leetcodeTheme || 'default';
    if (savedTheme !== 'default' && local.cachedThemeCSS) {
      document.documentElement.setAttribute('data-lc-theme', savedTheme);
      document.documentElement.classList.add('dark');
      injectSecureStyle(local.cachedThemeCSS);
    }
    await applyTheme(savedTheme, true);
    observeTheme();
  }

  async function applyTheme(theme, isBgCheck = false) {
    if (theme === 'default') {
      clearSecureStyle();
      await chrome.storage.local.remove('cachedThemeCSS');
      return;
    }

    // Direct background network proxy loop
    chrome.runtime.sendMessage({ type: "FETCH_THEME", theme }, async (res) => {
      if (res?.success && res.data?.fullCSS) {
        document.documentElement.setAttribute('data-lc-theme', theme);
        document.documentElement.classList.add('dark');
        injectSecureStyle(res.data.fullCSS);
        await chrome.storage.local.set({ cachedThemeCSS: res.data.fullCSS });
      } else {
        clearSecureStyle();
        await chrome.storage.local.remove('cachedThemeCSS');
        if (!isBgCheck && theme !== 'default') {
          alert("Premium is required to use Custom Themes!");
          window.open('https://getsprint.me/payments', '_blank');
        }
      }
    });
  }

  function observeTheme() {
    const obsTheme = new MutationObserver(() => {
      const curr = document.documentElement.getAttribute('data-lc-theme') || 'default';
      const hasDark = document.documentElement.classList.contains('dark');
      if (curr !== savedTheme || (savedTheme !== 'default' && !hasDark)) {
        obsTheme.disconnect();
        applyTheme(savedTheme);
        obsTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme', 'class'] });
      }
    });
    obsTheme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme', 'class'] });
  }

  initTheme();
  initOptions();

  let href = window.location.href;
  const handleUrlChange = () => { if (window.location.href !== href) { href = window.location.href; initOptions(); } };
  window.addEventListener('popstate', handleUrlChange);

  const patch = (type) => {
    const orig = history[type];
    history[type] = function () { orig.apply(this, arguments); handleUrlChange(); };
  };
  patch('pushState'); patch('replaceState');

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'setTheme') { savedTheme = request.theme; applyTheme(savedTheme); }
    if (request.action === 'applyVisibilityOptions') { cachedOptions = request.options; applyVisibilityChanges(cachedOptions); }
  });
})();