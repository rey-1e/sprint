(() => {
  let savedTheme = 'default';
  let cachedOptions = null; // Cache settings in-memory to prevent async IPC messaging bottlenecks

  // ── Mode & Page Definition Strategies ──────────────────────────
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

  // ── Core Enhancement UI Strategies ─────────────────────────────
  class ProblemSetStrategy {
    hideLockedProblems(checked) {
      const rows = document.querySelectorAll('a[id]');
      rows.forEach(row => {
        const lockSvg = row.querySelector('div>div:nth-child(1)>svg');
        if (lockSvg && lockSvg.getAttribute('data-icon') === 'lock') {
          const isHidden = row.classList.contains('hide_leetcode-enhancer');
          if (checked && isHidden) {
            row.classList.remove('hide_leetcode-enhancer');
          } else if (!checked && !isHidden) {
            row.classList.add('hide_leetcode-enhancer');
          }
        }
      });
    }

    highlightSolvedProblems(checked) {
      const rows = document.querySelectorAll('a[id]');
      const isDarkMode = document.documentElement.classList.contains('dark') || 
                         document.querySelector('html').classList.contains('dark');
      rows.forEach(row => {
        const checkSvg = row.querySelector('div>div:nth-child(1)>svg');
        if (checkSvg && checkSvg.getAttribute('data-icon') === 'check') {
          const targetClass = isDarkMode ? 'add-bg-dark_leetcode-enhancer' : 'add-bg-light_leetcode-enhancer';
          const hasClass = row.classList.contains(targetClass);
          if (checked && !hasClass) {
            row.classList.remove('add-bg-dark_leetcode-enhancer', 'add-bg-light_leetcode-enhancer');
            row.classList.add(targetClass);
          } else if (!checked && (row.classList.contains('add-bg-dark_leetcode-enhancer') || row.classList.contains('add-bg-light_leetcode-enhancer'))) {
            row.classList.remove('add-bg-dark_leetcode-enhancer', 'add-bg-light_leetcode-enhancer');
          }
        }
      });
    }

    hideSolvedProb(checked) {
      const rows = document.querySelectorAll('a[id]');
      rows.forEach(row => {
        const checkSvg = row.querySelector('div>div:nth-child(1)>svg');
        if (checkSvg && checkSvg.getAttribute('data-icon') === 'check') {
          const isHidden = row.classList.contains('hide_leetcode-enhancer');
          if (checked && isHidden) {
            row.classList.remove('hide_leetcode-enhancer');
          } else if (!checked && !isHidden) {
            row.classList.add('hide_leetcode-enhancer');
          }
        }
      });
    }

    toggleByColName(colName, checked) {
      const rows = document.querySelectorAll('a[id]');
      if (colName === 'status') {
        rows.forEach(row => {
          const cell = row.querySelector('div>div:nth-child(1)');
          if (cell) {
            const isHidden = cell.classList.contains('hide_leetcode-enhancer');
            if (checked && isHidden) cell.classList.remove('hide_leetcode-enhancer');
            else if (!checked && !isHidden) cell.classList.add('hide_leetcode-enhancer');
          }
        });
      } else if (colName === 'acceptance') {
        rows.forEach(row => {
          const cell = row.querySelector('div>div:nth-child(2)>div:nth-child(2)');
          if (cell) {
            const isHidden = cell.classList.contains('hide_leetcode-enhancer');
            if (checked && isHidden) cell.classList.remove('hide_leetcode-enhancer');
            else if (!checked && !isHidden) cell.classList.add('hide_leetcode-enhancer');
          }
        });
      } else if (colName === 'difficulty') {
        rows.forEach(row => {
          const cell = row.querySelector('div>div:nth-child(2)>p:nth-child(3)');
          if (cell) {
            const isHidden = cell.classList.contains('hide_leetcode-enhancer');
            if (checked && isHidden) cell.classList.remove('hide_leetcode-enhancer');
            else if (!checked && !isHidden) cell.classList.add('hide_leetcode-enhancer');
          }
        });
      } else if (colName === 'frequency') {
        rows.forEach(row => {
          const cell = row.querySelector('div>div:nth-child(3)');
          if (cell) {
            const isHidden = cell.classList.contains('hide_leetcode-enhancer');
            if (checked && isHidden) cell.classList.remove('hide_leetcode-enhancer');
            else if (!checked && !isHidden) cell.classList.add('hide_leetcode-enhancer');
          }
        });
      } else if (colName === 'save') {
        rows.forEach(row => {
          const cell = row.querySelector('div>div:nth-child(4)>div');
          if (cell) {
            const isHidden = cell.classList.contains('hide_leetcode-enhancer');
            if (checked && isHidden) cell.classList.remove('hide_leetcode-enhancer');
            else if (!checked && !isHidden) cell.classList.add('hide_leetcode-enhancer');
          }
        });
      }
    }
  }

  class CodingAreaStrategy {
    hideSolvedDiff(checked) {
      const descContent = document.querySelector("div[data-track-load='description_content']");
      const diffCodingArea = descContent?.parentNode?.parentNode?.previousSibling?.firstChild;
      const diffNext = document.querySelectorAll("a[rel='noopener noreferrer'] div");

      if (diffCodingArea) {
        const isHidden = diffCodingArea.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) diffCodingArea.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) diffCodingArea.classList.add('hide_leetcode-enhancer');
      }
      if (diffNext) {
        diffNext.forEach(el => {
          const isHidden = el.classList.contains('hide_leetcode-enhancer');
          if (checked && isHidden) el.classList.remove('hide_leetcode-enhancer');
          else if (!checked && !isHidden) el.classList.add('hide_leetcode-enhancer');
        });
      }
    }

    hideDiffOfSimilarProb(checked) {
      const allAnchors = document.querySelectorAll('a');
      if (!allAnchors || allAnchors.length === 0) return;

      const urlProb = "https://leetcode.com/problems/";
      const pathnameParts = window.location.pathname.split("/");
      if (pathnameParts.length < 3) return;
      const curUrl = urlProb + pathnameParts[2] + "/";

      allAnchors.forEach(anchor => {
        if (anchor.href.startsWith(urlProb) && !anchor.href.startsWith(curUrl)) {
          const diffElement = anchor.parentElement?.parentElement?.parentElement?.nextElementSibling;
          if (diffElement) {
            const isHidden = diffElement.classList.contains('hide_leetcode-enhancer');
            if (checked && isHidden) diffElement.classList.remove('hide_leetcode-enhancer');
            else if (!checked && !isHidden) diffElement.classList.add('hide_leetcode-enhancer');
          }
        }
      });
    }

    hideStatus(checked) {
      const parts = window.location.pathname.split("/");
      if (parts.length < 3) return;
      const href = `/problems/${parts[2]}/`;
      const problemLink = document.querySelector(`a[href='${href}']`);

      if (problemLink) {
        const solvedStatus = problemLink.parentNode?.parentNode?.nextSibling;
        if (solvedStatus) {
          const isHidden = solvedStatus.classList.contains('hide_leetcode-enhancer');
          if (checked && isHidden) solvedStatus.classList.remove('hide_leetcode-enhancer');
          else if (!checked && !isHidden) solvedStatus.classList.add('hide_leetcode-enhancer');
        }
      }
    }

    hideAcceptance(checked) {
      const parts = window.location.pathname.split("/");
      if (parts.length < 3) return;
      const href = `/problems/${parts[2]}/`;
      const problemLink = document.querySelector(`a[href='${href}']`);
      const acceptanceElement = problemLink?.parentNode?.parentNode?.parentNode?.nextSibling?.nextSibling?.nextSibling?.children?.[3];

      if (acceptanceElement) {
        const isHidden = acceptanceElement.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) acceptanceElement.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) acceptanceElement.classList.add('hide_leetcode-enhancer');
      }
    }

    hideSave(checked) {
      const saveButton = document.querySelector("svg[data-icon='star']");
      if (saveButton) {
        const isHidden = saveButton.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) saveButton.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) saveButton.classList.add('hide_leetcode-enhancer');
      }
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
      const oldDiffLabel = document.querySelectorAll('.contest-question-info .list-group .list-group-item:nth-child(5) .label')?.[0];
      if (oldDiffLabel) {
        oldDiffLabel.style.visibility = checked ? 'visible' : 'hidden';
        return;
      }

      const easyDiffLabel = document.querySelector('.text-difficulty-easy');
      if (easyDiffLabel) {
        const isHidden = easyDiffLabel.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) easyDiffLabel.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) easyDiffLabel.classList.add('hide_leetcode-enhancer');
      }

      const mediumDiffLabel = document.querySelector('.text-difficulty-medium');
      if (mediumDiffLabel) {
        const isHidden = mediumDiffLabel.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) mediumDiffLabel.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) mediumDiffLabel.classList.add('hide_leetcode-enhancer');
      }

      const hardDiffLabel = document.querySelector('.text-difficulty-hard');
      if (hardDiffLabel) {
        const isHidden = hardDiffLabel.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) hardDiffLabel.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) hardDiffLabel.classList.add('hide_leetcode-enhancer');
      }

      const easySide = document.querySelectorAll('.text-sd-easy');
      easySide.forEach(label => {
        const isHidden = label.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) label.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) label.classList.add('hide_leetcode-enhancer');
      });

      const mediumSide = document.querySelectorAll('.text-sd-medium');
      mediumSide.forEach(label => {
        const isHidden = label.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) label.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) label.classList.add('hide_leetcode-enhancer');
      });

      const hardSide = document.querySelectorAll('.text-sd-hard');
      hardSide.forEach(label => {
        const isHidden = label.classList.contains('hide_leetcode-enhancer');
        if (checked && isHidden) label.classList.remove('hide_leetcode-enhancer');
        else if (!checked && !isHidden) label.classList.add('hide_leetcode-enhancer');
      });
    }

    toggleByColName(colName, checked) {
      if (colName === 'difficulty') {
        this.hideDiffFromContest(checked);
      }
    }
  }

  function getStrategy(mode) {
    if (mode === Mode.PROBLEM_SET) return new ProblemSetStrategy();
    if (mode === Mode.CODING_AREA) return new CodingAreaStrategy();
    if (mode === Mode.CONTEST) return new ContestStrategy();
    return null;
  }

  function applyVisibilityChanges(options) {
    const mode = findMode();
    const strategy = getStrategy(mode);
    if (!strategy || !options) return;

    options.forEach(option => {
      const name = option.optionName;
      const checked = option.checked;

      if (name === 'locked') {
        if (typeof strategy.hideLockedProblems === 'function') strategy.hideLockedProblems(checked);
      } else if (name === 'highlight') {
        if (typeof strategy.highlightSolvedProblems === 'function') strategy.highlightSolvedProblems(checked);
      } else if (name === 'solved') {
        if (typeof strategy.hideSolvedProb === 'function') strategy.hideSolvedProb(checked);
      } else {
        if (typeof strategy.toggleByColName === 'function') strategy.toggleByColName(name, checked);
      }
    });
  }

  // ── Optimized DOM Synchronizer (Prevents Thread Locking) ─────────
  let observer = null;
  
  function initVisibilityObserver() {
    if (observer) observer.disconnect();

    const mode = findMode();
    if (!mode) return;

    // Synchronous reads fromcachedOptions instead of async chrome.storage calls inside hot loops
    observer = new MutationObserver(() => {
      if (cachedOptions) {
        applyVisibilityChanges(cachedOptions);
      }
    });

    let targetElement = document.querySelector('#__next') || document.body;
    if (mode === Mode.CONTEST) {
      targetElement = document.getElementById('base_content') || 
                      document.getElementById('qd-content') || 
                      document.querySelector('#__next') || 
                      document.body;
    }

    if (targetElement) {
      observer.observe(targetElement, {
        childList: true,
        subtree: true
      });
    }
  }

  async function initOptions() {
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

  // ── Core Theme System Integration ──────────────────────────────
  async function initTheme() {
    const data = await chrome.storage.local.get('leetcodeTheme');
    savedTheme = data.leetcodeTheme || 'default';
    
    applyTheme(savedTheme);
    observeTheme();
  }

  function applyTheme(theme) {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-lc-theme');
    } else {
      document.documentElement.setAttribute('data-lc-theme', theme);
      if (!document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.add('dark');
      }
    }
  }

  function observeTheme() {
    const themeObserver = new MutationObserver(() => {
      const currentTheme = document.documentElement.getAttribute('data-lc-theme') || 'default';
      const hasDark = document.documentElement.classList.contains('dark');
      if (currentTheme !== savedTheme || (savedTheme !== 'default' && !hasDark)) {
        themeObserver.disconnect();
        applyTheme(savedTheme);
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme', 'class'] });
      }
    });
    
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme', 'class'] });
  }

  // Initial startup execution
  initTheme();
  initOptions();

  // ── Zero-Lag SPA Router Change Listener ────────────────────────
  let currentHref = window.location.href;
  const handleUrlChange = () => {
    if (window.location.href !== currentHref) {
      currentHref = window.location.href;
      initOptions();
    }
  };

  // Listen to navigation pops (back/forward)
  window.addEventListener('popstate', handleUrlChange);

  // Monkeypatch native History push and replace methods to track SPA navigation synchronously
  const originalPushState = history.pushState;
  history.pushState = function() {
    originalPushState.apply(this, arguments);
    handleUrlChange();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function() {
    originalReplaceState.apply(this, arguments);
    handleUrlChange();
  };

  // Runtime popup modification receiver
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'setTheme') {
      savedTheme = request.theme;
      applyTheme(savedTheme);
    }
    if (request.action === 'applyVisibilityOptions') {
      cachedOptions = request.options; // Keep synchronous cache synchronized
      applyVisibilityChanges(cachedOptions);
    }
  });
})();