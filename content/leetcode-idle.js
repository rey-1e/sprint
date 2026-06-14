let isInjectingTags = false;
let injectionsDisabled = false;

function extractQuestionIdFromDOM() {
  const selectors = [
    '.text-title-large',
    'div[class*="text-title-large"]',
    'h1',
    '[data-cy="question-title"]',
    '.css-v3d350',
    '#qd-content a',
    'span[class*="text-title"]'
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const txt = el.textContent.trim();
      const match = txt.match(/^\s*(\d+)\s*\./);
      if (match) {
        return match[1];
      }
    }
  }
  return null;
}

async function getCachedQuestionId(slug) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_QUESTION_ID", slug }, (response) => {
      resolve(response?.questionId || null);
    });
  });
}

async function getCodeFromLocalStorage(slug, questionId) {
  let candidate = null;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    const lowerKey = key.toLowerCase();
    const isTarget = (slug && lowerKey.includes(slug.toLowerCase())) || (questionId && lowerKey.includes(questionId.toString()));
    const isCode = lowerKey.includes("draft") || lowerKey.includes("code") || lowerKey.includes("editor");

    if (isTarget && isCode) {
      try {
        const val = localStorage.getItem(key);
        if (!val) continue;
        if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
          const parsed = JSON.parse(val);
          const findCode = (obj) => {
            if (!obj) return null;
            if (typeof obj === 'string' && (obj.includes('class Solution') || obj.includes('def ') || obj.includes('function '))) return obj;
            if (typeof obj === 'object') {
              if (obj.code && typeof obj.code === 'string') return obj.code;
              if (obj.value && typeof obj.value === 'string') return obj.value;
              for (const k in obj) {
                const r = findCode(obj[k]);
                if (r) return r;
              }
            }
            return null;
          };
          const ext = findCode(parsed);
          if (ext) return ext;
        } else if (val.includes('class Solution') || val.includes('def ') || val.includes('function ')) {
          candidate = val;
        }
      } catch (e) {}
    }
  }
  return candidate;
}

async function extractFullCode() {
  const urlParts = window.location.pathname.split('/');
  const pIdx = urlParts.indexOf('problems');
  const slug = pIdx !== -1 ? urlParts[pIdx + 1] : "";
  const questionId = slug ? (extractQuestionIdFromDOM() || await getCachedQuestionId(slug)) : null;

  const monacoCode = await new Promise((resolve) => {
    const handleResponse = (e) => {
      window.removeEventListener("sprint-monaco-code-response", handleResponse);
      resolve(e.detail?.code || null);
    };
    window.addEventListener("sprint-monaco-code-response", handleResponse);
    window.dispatchEvent(new CustomEvent("sprint-get-monaco-code"));
    setTimeout(() => {
      window.removeEventListener("sprint-monaco-code-response", handleResponse);
      resolve(null);
    }, 250);
  });

  if (monacoCode && monacoCode.trim().length > 0) return monacoCode;

  if (slug || questionId) {
    const local = await getCodeFromLocalStorage(slug, questionId);
    if (local && local.trim().length > 0) return local;
  }

  const lines = document.querySelectorAll('.view-line');
  return lines.length ? Array.from(lines).map(l => l.textContent).join('\n') : "";
}

async function injectTags() {
  if (injectionsDisabled) return;

  const urlParts = window.location.pathname.split('/');
  const pIdx = urlParts.indexOf('problems');
  if (pIdx === -1) return;
  const slug = urlParts[pIdx + 1];
  if (!slug) return;

  const existing = document.getElementById('custom-company-tags');
  if (existing) {
    if (existing.getAttribute('data-problem-slug') === slug) {
      return; 
    } else {
      existing.remove(); 
    }
  }

  if (isInjectingTags) return;
  isInjectingTags = true;

  try {
    let questionId = extractQuestionIdFromDOM();
    if (!questionId) {
      questionId = await getCachedQuestionId(slug);
    }
    if (!questionId) return;

    const [compRes, ratRes] = await Promise.allSettled([
      fetch(chrome.runtime.getURL('data.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('ratings.json')).then(r => r.json())
    ]);

    const comps = compRes.status === 'fulfilled' ? (compRes.value[questionId] || []) : [];
    let elo = null;
    if (ratRes.status === 'fulfilled') {
      const pData = ratRes.value.find(p => p.TitleSlug === slug);
      if (pData?.Rating) elo = Math.round(pData.Rating);
    }

    let target = document.querySelector('[class*="text-difficulty-"]') || document.querySelector('[class*="text-sd-"]');
    if (!target) {
      const items = document.querySelectorAll('div.flex.items-center.space-x-4 div, div[class*="gap-"] > div, span, div');
      for (const el of items) {
        const text = el.textContent?.trim();
        if (/^(Easy|Medium|Hard)$/i.test(text)) {
          target = el;
          break;
        }
      }
    }
    if (!target) return;

    if (elo && !target.hasAttribute('data-elo-injected')) {
      const originalText = (target.textContent || '').trim();
      target.setAttribute('data-original-text', originalText);
      target.textContent = `${originalText} - ${elo}`;
      target.setAttribute('data-elo-injected', 'true');
    }

    if (document.getElementById('custom-company-tags')) return;

    const container = document.createElement('div');
    container.id = 'custom-company-tags';
    container.className = 'company-tags-wrapper';
    container.setAttribute('data-problem-slug', slug);

    if (comps.length > 0) {
      [...new Set(comps)].slice(0, 10).forEach(name => {
        const span = document.createElement('span');
        span.className = 'company-tag';
        span.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        container.appendChild(span);
      });
    } else {
      const span = document.createElement('span');
      span.className = 'company-tag no-data-tag';
      span.textContent = 'No Company Data';
      container.appendChild(span);
    }

    const appendTarget = target.closest('.flex') || target;
    appendTarget.after(container);
  } catch (e) {
    console.error("Sprint Tags Injection Error:", e);
  } finally {
    isInjectingTags = false;
  }
}

function findSubmissionTargetDiv() {
  const boxes = document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-lg.border.p-3, div[class*="rounded-lg"][class*="border"]');
  let target = Array.from(boxes).find(d => d.textContent.includes('Runtime') || d.textContent.includes('Memory'));
  if (target) return target;

  const divs = document.querySelectorAll('div');
  for (const div of divs) {
    if (div.children.length >= 2 && div.textContent.includes('Runtime') && div.textContent.includes('Memory')) {
      if (div.classList.contains('border') || div.classList.contains('rounded-lg') || div.querySelector('[class*="bg-"]')) {
        return div;
      }
    }
  }
  return null;
}

function injectSubmissionAnalysisUI() {
  if (injectionsDisabled) return;
  if (document.getElementById('sprint-submission-analysis')) return;
  
  const targetDiv = findSubmissionTargetDiv();
  if (!targetDiv) return;

  const container = document.createElement('div');
  container.id = 'sprint-submission-analysis';
  container.className = 'sprint-ai-analysis';

  const topbar = document.createElement('div');
  topbar.className = 'sprint-ai-topbar';

  const tabs = document.createElement('div');
  tabs.className = 'sprint-ai-tabs';

  const tabApproach = document.createElement('span');
  tabApproach.className = 'sprint-ai-tab active';
  tabApproach.setAttribute('data-target', 'tab-approach');
  tabApproach.textContent = 'Approach';

  const tabEfficiency = document.createElement('span');
  tabEfficiency.className = 'sprint-ai-tab';
  tabEfficiency.setAttribute('data-target', 'tab-efficiency');
  tabEfficiency.textContent = 'Efficiency';

  const tabStyle = document.createElement('span');
  tabStyle.className = 'sprint-ai-tab';
  tabStyle.setAttribute('data-target', 'tab-style');
  tabStyle.textContent = 'Code Style';

  tabs.appendChild(tabApproach);
  tabs.appendChild(tabEfficiency);
  tabs.appendChild(tabStyle);
  topbar.appendChild(tabs);
  container.appendChild(topbar);

  const summary = document.createElement('div');
  summary.id = 'sprint-ai-summary';
  summary.className = 'sprint-ai-summary';
  summary.textContent = 'Generating expert AI feedback...';
  container.appendChild(summary);

  const makeGridSection = (id, visible, labels) => {
    const sec = document.createElement('div');
    sec.id = id;
    sec.className = 'sprint-ai-content' + (visible ? '' : ' sprint-hidden');
    const grid = document.createElement('div');
    grid.className = 'sprint-ai-grid';

    labels.forEach(item => {
      const lbl = document.createElement('div');
      lbl.className = 'sprint-ai-label';
      lbl.textContent = item.label;
      const val = document.createElement('div');
      val.className = 'sprint-ai-val' + (item.success ? ' sprint-text-success' : '');
      val.id = item.id;
      val.textContent = '...';
      grid.appendChild(lbl);
      grid.appendChild(val);
    });

    sec.appendChild(grid);
    return sec;
  };

  const approachSec = makeGridSection('tab-approach', true, [
    { label: 'Current', id: 'val-app-curr' },
    { label: 'Suggested', id: 'val-app-sugg', success: true },
    { label: 'Key Idea', id: 'val-app-idea' }
  ]);

  const efficiencySec = makeGridSection('tab-efficiency', false, [
    { label: 'Current', id: 'val-eff-curr' },
    { label: 'Suggested', id: 'val-eff-sugg', success: true },
    { label: 'Suggestions', id: 'val-eff-idea' }
  ]);

  const styleSec = makeGridSection('tab-style', false, [
    { label: 'Readability', id: 'val-sty-read' },
    { label: 'Structure', id: 'val-sty-struc' },
    { label: 'Suggestions', id: 'val-sty-idea' }
  ]);

  container.appendChild(approachSec);
  container.appendChild(efficiencySec);
  container.appendChild(styleSec);

  if (targetDiv.prepend) {
    targetDiv.prepend(container);
  } else {
    targetDiv.insertBefore(container, targetDiv.firstChild);
  }

  const tabElements = container.querySelectorAll('.sprint-ai-tab');
  const contentElements = container.querySelectorAll('.sprint-ai-content');

  tabElements.forEach(t => {
    t.addEventListener('click', () => {
      tabElements.forEach(x => x.classList.remove('active'));
      contentElements.forEach(c => {
        c.classList.remove('active');
        c.classList.add('sprint-hidden');
      });
      t.classList.add('active');
      const targetId = t.getAttribute('data-target');
      const targetContent = container.querySelector('#' + targetId);
      if (targetContent) {
        targetContent.classList.remove('sprint-hidden');
        targetContent.classList.add('active');
      }
    });
  });

  fetchAnalysisData(summary);
}

async function fetchAnalysisData(summaryElement) {
  const raw = await extractFullCode();
  if (!raw || !raw.trim()) {
    summaryElement.textContent = "Could not locate code on the page.";
    summaryElement.className = 'sprint-ai-summary sprint-text-error';
    return;
  }

  chrome.runtime.sendMessage({ type: "FETCH_DETAILED_ANALYSIS", code: raw }, (res) => {
    if (res?.success) {
      const d = res.data;
      summaryElement.textContent = d.summary || "Analysis complete.";
      safeSetText('val-app-curr', d.app_current);
      safeSetText('val-app-sugg', d.app_suggested);
      safeSetText('val-app-idea', d.app_keyidea);
      safeSetText('val-eff-curr', d.eff_current);
      safeSetText('val-eff-sugg', d.eff_suggested);
      safeSetText('val-eff-idea', d.eff_suggestions);
      safeSetText('val-sty-read', d.sty_readability);
      safeSetText('val-sty-struc', d.sty_structure);
      safeSetText('val-sty-idea', d.sty_suggestions);
    } else {
      summaryElement.textContent = ''; 
      if (res?.authRequired) {
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/login';
        link.target = '_blank';
        link.style.cssText = 'color:#a1a1aa; text-decoration:underline; font-weight:500; display:inline-block; cursor:pointer;';
        link.textContent = 'Sign in to LeetCode Sprint to analyze submissions.';
        summaryElement.className = 'sprint-ai-summary-muted';
        summaryElement.appendChild(link);
      } else if (res?.limitReached) {
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/payments';
        link.target = '_blank';
        link.style.cssText = 'color:#ffb000; text-decoration:underline; font-weight:500; display:inline-block; cursor:pointer;';
        link.textContent = 'Daily usage limits reached. Click here to upgrade at getsprint.me/payments.';
        summaryElement.className = 'sprint-ai-summary sprint-text-warning';
        summaryElement.appendChild(link);
      } else if (res?.premiumRequired || res?.error?.includes("403")) {
        // Clear, user friendly upgrade block replacing raw status errors
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/payments';
        link.target = '_blank';
        link.style.cssText = 'color:#CD5C5C; text-decoration:underline; font-weight:600; display:inline-block; cursor:pointer;';
        link.textContent = 'Premium upgrade required. Click here to upgrade at getsprint.me/payments.';
        summaryElement.className = 'sprint-ai-summary sprint-text-warning';
        summaryElement.appendChild(link);
      } else {
        summaryElement.textContent = "Analysis failed. Ensure service worker API is active.";
        summaryElement.className = 'sprint-ai-summary sprint-text-error';
      }
    }
  });
}

function safeSetText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val || "N/A";
}

function injectRedirectPills() {
  if (injectionsDisabled) return;
  const target = document.querySelector('div.h-8.w-full.min-w-0.flex-1') || document.querySelector('[class*="h-8"][class*="w-full"][class*="flex-1"]');
  if (target && !document.getElementById('sprint-google-editor-pill')) {
    if (!target.classList.contains('sprint-flex-container-override')) {
      target.style.display = 'flex';
      target.style.alignItems = 'center';
      target.style.justifyContent = 'flex-end';
      target.classList.add('sprint-flex-container-override');
    }
    const link = document.createElement('a');
    link.id = 'sprint-google-editor-pill';
    link.href = 'https://getsprint.me/problemset';
    link.target = '_blank';
    link.className = 'sprint-pill-editor-btn';
    link.textContent = 'Problem-Set';
    target.appendChild(link);
  }
}

function removeInjectedElements() {
  document.getElementById('custom-company-tags')?.remove();
  document.getElementById('sprint-submission-analysis')?.remove();
  document.getElementById('sprint-google-editor-pill')?.remove();

  const eloTarget = document.querySelector('[data-elo-injected="true"]');
  if (eloTarget) {
    const origText = eloTarget.getAttribute('data-original-text');
    if (origText) eloTarget.textContent = origText;
    eloTarget.removeAttribute('data-elo-injected');
    eloTarget.removeAttribute('data-original-text');
  }
}

function injectAll() {
  if (injectionsDisabled) return;
  injectTags();
  
  const hasSubmissionBox = !!findSubmissionTargetDiv();
  if (window.location.pathname.includes('/submissions/') || hasSubmissionBox) {
    injectSubmissionAnalysisUI();
  }
  injectRedirectPills();
}

async function updateInjectionsState() {
  const res = await chrome.storage.local.get('options');
  const removeInjectionsOpt = res?.options?.find(o => o.optionName === 'removeInjections');
  injectionsDisabled = removeInjectionsOpt ? removeInjectionsOpt.checked : false;

  if (injectionsDisabled) {
    removeInjectedElements();
  } else {
    injectAll();
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "applyVisibilityOptions") {
    const removeInjectionsOpt = request.options?.find(o => o.optionName === 'removeInjections');
    injectionsDisabled = removeInjectionsOpt ? removeInjectionsOpt.checked : false;
    if (injectionsDisabled) {
      removeInjectedElements();
    } else {
      injectAll();
    }
    return true;
  }
  return true;
});

setTimeout(() => {
  updateInjectionsState();
}, 50);

let debounce = null;
const obs = new MutationObserver(() => {
  if (injectionsDisabled) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (!document.getElementById('custom-company-tags')) injectTags();
    
    const hasSubmissionBox = !!findSubmissionTargetDiv();
    if (!document.getElementById('sprint-submission-analysis') && (window.location.pathname.includes('/submissions/') || hasSubmissionBox)) {
      injectSubmissionAnalysisUI();
    }
    if (!document.getElementById('sprint-google-editor-pill')) injectRedirectPills();
  }, 120);
});
obs.observe(document.body, { childList: true, subtree: true });