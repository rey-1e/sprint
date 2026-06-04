/**
 * ==============================================================================
 * SECTION 1: INJECT COMPANY TAGS AND ELO RATING
 * ==============================================================================
 */
let isInjectingTags = false;

async function getCachedQuestionId(slug) {
  const CACHE_KEY = `sprint_id_${slug}`;
  const localData = await chrome.storage.local.get([CACHE_KEY, 'all_problems_cache', 'all_problems_cache_time']);
  
  if (localData[CACHE_KEY]) {
    return localData[CACHE_KEY];
  }

  const now = Date.now();
  let problems = localData.all_problems_cache;

  if (!problems || !localData.all_problems_cache_time || (now - localData.all_problems_cache_time > 86400000)) {
    try {
      const res = await fetch('/api/problems/all/');
      const data = await res.json();
      problems = data.stat_status_pairs || [];
      await chrome.storage.local.set({
        all_problems_cache: problems,
        all_problems_cache_time: now
      });
    } catch (e) {
      console.error("Sprint: API lookup error", e);
      return null;
    }
  }

  const targetProb = problems.find(p => p.stat.question__title_slug === slug);
  const questionId = targetProb ? targetProb.stat.question_id.toString() : null;

  if (questionId) {
    await chrome.storage.local.set({ [CACHE_KEY]: questionId });
  }
  return questionId;
}

/**
 * Robust extraction utility that bypasses Monaco Virtualization
 * by fetching directly from local draft storage or falling back to DOM lines.
 */
async function getCodeFromLocalStorage(slug, questionId) {
  let bestCandidate = null;

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    const lowerKey = key.toLowerCase();
    
    // Strict requirement: Must match current problem identifiers
    const matchesProblem = (slug && lowerKey.includes(slug.toLowerCase())) || 
                          (questionId && lowerKey.includes(questionId.toString()));
                          
    const isDraftKey = lowerKey.includes("draft") || 
                       lowerKey.includes("code") || 
                       lowerKey.includes("editor") || 
                       lowerKey.includes("state");

    // Using logical AND (&&) to prevent pulling unrelated historical drafts
    if (matchesProblem && isDraftKey) {
      try {
        const val = localStorage.getItem(key);
        if (!val) continue;

        if (val.trim().startsWith('{') || val.trim().startsWith('[')) {
          const parsed = JSON.parse(val);
          
          const findCodeInObj = (obj) => {
            if (!obj) return null;
            if (typeof obj === 'string' && (obj.includes('class Solution') || obj.includes('def ') || obj.includes('function ') || obj.includes('class '))) {
              return obj;
            }
            if (typeof obj === 'object') {
              if (obj.code && typeof obj.code === 'string') return obj.code;
              if (obj.value && typeof obj.value === 'string') return obj.value;
              if (obj.draft && typeof obj.draft === 'string') return obj.draft;
              
              for (const k in obj) {
                const res = findCodeInObj(obj[k]);
                if (res) return res;
              }
            }
            return null;
          };

          const extracted = findCodeInObj(parsed);
          if (extracted) return extracted;
        } else {
          if (val.includes('class Solution') || val.includes('def ') || val.includes('function ') || val.includes('class ') || val.includes('impl Solution')) {
            bestCandidate = val;
          }
        }
      } catch (e) {
        // Safe parsing fallback
      }
    }
  }
  return bestCandidate;
}

async function extractFullCode() {
  const urlParts = window.location.pathname.split('/');
  const problemsIndex = urlParts.indexOf('problems');
  let slug = "";
  if (problemsIndex !== -1) {
    slug = urlParts[problemsIndex + 1];
  }
  const questionId = slug ? await getCachedQuestionId(slug) : null;
  
  if (slug || questionId) {
    const localCode = await getCodeFromLocalStorage(slug, questionId);
    if (localCode && localCode.trim().length > 0) {
      return localCode;
    }
  }

  const codeLines = document.querySelectorAll('.view-line');
  if (codeLines.length) {
    return Array.from(codeLines).map(line => line.textContent).join('\n');
  }

  return "";
}

async function injectTags() {
  if (document.getElementById('custom-company-tags') || isInjectingTags) return;
  isInjectingTags = true;

  try {
    const urlParts = window.location.pathname.split('/');
    const problemsIndex = urlParts.indexOf('problems');
    if (problemsIndex === -1) return;
    
    const slug = urlParts[problemsIndex + 1];
    if (!slug) return;

    const questionId = await getCachedQuestionId(slug);
    if (!questionId) return;

    const [companyRes, ratingRes] = await Promise.allSettled([
      fetch(chrome.runtime.getURL('data.json')).then(r => r.json()),
      fetch(chrome.runtime.getURL('ratings.json')).then(r => r.json())
    ]);

    const companies = companyRes.status === 'fulfilled' ? (companyRes.value[questionId] || []) : [];
    let eloRating = null;

    if (ratingRes.status === 'fulfilled') {
      const problemData = ratingRes.value.find(p => p.TitleSlug === slug);
      if (problemData && problemData.Rating) {
        eloRating = Math.round(problemData.Rating);
      }
    }

    let targetElement = document.querySelector('[class*="text-difficulty-"]');
    if (!targetElement) {
      const metadataItems = document.querySelectorAll('div.flex.items-center.space-x-4 div, div[class*="gap-"] > div');
      for (const el of metadataItems) {
        if (/^(Easy|Medium|Hard)$/i.test(el.textContent?.trim())) {
          targetElement = el;
          break;
        }
      }
    }

    if (!targetElement) return;

    if (eloRating && !targetElement.hasAttribute('data-elo-injected')) {
      targetElement.textContent = `${targetElement.textContent} - ${eloRating}`;
      targetElement.setAttribute('data-elo-injected', 'true');
    }

    if (document.getElementById('custom-company-tags')) return;

    const container = document.createElement('div');
    container.id = 'custom-company-tags';
    container.className = 'company-tags-wrapper';

    if (companies.length > 0) {
      [...new Set(companies)].slice(0, 10).forEach(name => {
        const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
        const span = document.createElement('span');
        span.className = 'company-tag';
        span.textContent = capitalized;
        container.appendChild(span);
      });
    } else {
      const span = document.createElement('span');
      span.className = 'company-tag no-data-tag';
      span.textContent = 'No Company Data';
      container.appendChild(span);
    }

    const appendTarget = targetElement.closest('.flex') || targetElement;
    appendTarget.after(container);

  } catch (error) {
    console.error("Sprint: Injected components failure", error);
  } finally {
    isInjectingTags = false;
  }
}

/**
 * ==============================================================================
 * SECTION 2: COMPLEXITY ANALYSIS UI
 * ==============================================================================
 */
function injectComplexityUI() {
  if (document.getElementById('complexity-analyzer-container')) return;

  const targetBar = document.getElementById('code_tabbar_outer');
  if (!targetBar) return;

  const container = document.createElement('div');
  container.id = 'complexity-analyzer-container';
  container.className = 'complexity-container';
  container.innerHTML = `
    <div class="complexity-item">
      <span class="complexity-label">Time:</span>
      <span class="complexity-value" id="time-complexity-value">—</span>
    </div>
    <div class="complexity-item">
      <span class="complexity-label">Space:</span>
      <span class="complexity-value" id="space-complexity-value">—</span>
    </div>
    <div class="complexity-status" id="complexity-status-text">Right-click or Ctrl+Shift+X</div>
  `;

  const innerBar = targetBar.querySelector('.flexlayout__tabset_tabbar_inner');
  if (innerBar?.nextSibling) {
    targetBar.insertBefore(container, innerBar.nextSibling);
  } else {
    targetBar.appendChild(container);
  }
}

function analyzeCode(code) {
  injectComplexityUI();

  const timeEl = document.getElementById('time-complexity-value');
  const spaceEl = document.getElementById('space-complexity-value');
  const statusEl = document.getElementById('complexity-status-text');

  if (!timeEl || !spaceEl || !statusEl) return;

  timeEl.textContent = '...';
  spaceEl.textContent = '...';
  statusEl.textContent = 'Analyzing...';
  statusEl.className = 'complexity-status sprint-text-warning';

  chrome.runtime.sendMessage(
    { type: "FETCH_COMPLEXITY", code },
    (response) => {
      if (response?.success) {
        timeEl.textContent = response.data.time || 'N/A';
        spaceEl.textContent = response.data.space || 'N/A';
        statusEl.textContent = 'Analysis Complete';
        statusEl.className = 'complexity-status sprint-text-success';
      } else {
        timeEl.textContent = 'Err';
        spaceEl.textContent = 'Err';
        if (response?.authRequired) {
          statusEl.innerHTML = '<a href="https://getsprint.me/login" target="_blank" style="color:#f87171; font-weight:500;">Sign In required</a>';
          statusEl.className = 'complexity-status';
        } else if (response?.limitReached) {
          statusEl.innerHTML = '<a href="https://getsprint.me/payments" target="_blank" style="color:#eff1f680; font-weight:500;">Upgrade Required</a>';
          statusEl.className = 'complexity-status';
          alert(response.error);
        } else {
          statusEl.textContent = 'Analysis Failed';
          statusEl.className = 'complexity-status sprint-text-error';
        }
      }
    }
  );
}

/**
 * ==============================================================================
 * SECTION 3: ACCEPTED SUBMISSION ANALYSIS UI
 * ==============================================================================
 */
async function injectSubmissionAnalysisUI() {
  if (document.getElementById('sprint-submission-analysis')) return;

  const boxes = document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-lg.border.p-3');
  const targetDiv = Array.from(boxes).find(div => {
    const txt = div.textContent;
    return txt.includes('Runtime') || txt.includes('Memory') || txt.includes('Beats');
  });

  if (!targetDiv) return;

  const container = document.createElement('div');
  container.id = 'sprint-submission-analysis';
  container.className = 'sprint-ai-analysis';
  container.innerHTML = `
    <div class="sprint-ai-topbar">
      <div class="sprint-ai-tabs">
        <span class="sprint-ai-tab active" data-target="tab-approach">Approach</span>
        <span class="sprint-ai-tab" data-target="tab-efficiency">Efficiency</span>
        <span class="sprint-ai-tab" data-target="tab-style">Code Style</span>
      </div>
    </div>
    <div class="sprint-ai-summary" id="sprint-ai-summary">Generating expert AI feedback...</div>
    
    <div class="sprint-ai-content active" id="tab-approach">
      <div class="sprint-ai-grid">
        <div class="sprint-ai-label">Current</div><div class="sprint-ai-val" id="val-app-curr">...</div>
        <div class="sprint-ai-label">Suggested</div><div class="sprint-ai-val sprint-text-success" id="val-app-sugg">...</div>
        <div class="sprint-ai-label">Key Idea</div><div class="sprint-ai-val" id="val-app-idea">...</div>
      </div>
    </div>

    <div class="sprint-ai-content sprint-hidden" id="tab-efficiency">
      <div class="sprint-ai-grid">
        <div class="sprint-ai-label">Current</div><div class="sprint-ai-val" id="val-eff-curr">...</div>
        <div class="sprint-ai-label">Suggested</div><div class="sprint-ai-val sprint-text-success" id="val-eff-sugg">...</div>
        <div class="sprint-ai-label">Suggestions</div><div class="sprint-ai-val" id="val-eff-idea">...</div>
      </div>
    </div>

    <div class="sprint-ai-content sprint-hidden" id="tab-style">
      <div class="sprint-ai-grid">
        <div class="sprint-ai-label">Readability</div><div class="sprint-ai-val" id="val-sty-read">...</div>
        <div class="sprint-ai-label">Structure</div><div class="sprint-ai-val" id="val-sty-struc">...</div>
        <div class="sprint-ai-label">Suggestions</div><div class="sprint-ai-val" id="val-sty-idea">...</div>
      </div>
    </div>
  `;

  targetDiv.prepend(container);

  const tabs = container.querySelectorAll('.sprint-ai-tab');
  const contents = container.querySelectorAll('.sprint-ai-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => {
        c.classList.remove('active');
        c.classList.add('sprint-hidden');
      });
      tab.classList.add('active');
      const spec = container.querySelector('#' + tab.getAttribute('data-target'));
      if (spec) {
        spec.classList.remove('sprint-hidden');
        spec.classList.add('active');
      }
    });
  });

  const rawCode = await extractFullCode();
  const summaryEl = document.getElementById('sprint-ai-summary');

  if (rawCode.trim()) {
    chrome.runtime.sendMessage(
      { type: "FETCH_DETAILED_ANALYSIS", code: rawCode },
      (response) => {
        if (response?.success) {
          const d = response.data;
          summaryEl.textContent = d.summary || "Analysis complete.";
          document.getElementById('val-app-curr').textContent = d.app_current || "N/A";
          document.getElementById('val-app-sugg').textContent = d.app_suggested || "N/A";
          document.getElementById('val-app-idea').textContent = d.app_keyidea || "N/A";
          document.getElementById('val-eff-curr').textContent = d.eff_current || "N/A";
          document.getElementById('val-eff-sugg').textContent = d.eff_suggested || "N/A";
          document.getElementById('val-eff-idea').textContent = d.eff_suggestions || "N/A";
          document.getElementById('val-sty-read').textContent = d.sty_readability || "N/A";
          document.getElementById('val-sty-struc').textContent = d.sty_structure || "N/A";
          document.getElementById('val-sty-idea').textContent = d.sty_suggestions || "N/A";
        } else {
          if (response?.authRequired) {
            summaryEl.innerHTML = '<a href="https://getsprint.me/login" target="_blank" style="color:#f87171; text-decoration:underline; font-weight:500;">Sign in to LeetCode Sprint to analyze submissions.</a>';
            summaryEl.className = 'sprint-ai-summary sprint-text-error';
          } else if (response?.limitReached) {
            summaryEl.innerHTML = '<a href="https://getsprint.me/payments" target="_blank" style="color:#f87171; text-decoration:underline; font-weight:500;">Limit reached. Upgrade at getsprint.me/payments</a>';
            summaryEl.className = 'sprint-ai-summary sprint-text-error';
            alert(response.error);
          } else {
            summaryEl.textContent = "Analysis failed. Ensure service worker API is active.";
            summaryEl.className = 'sprint-ai-summary sprint-text-error';
          }
        }
      }
    );
  } else {
    summaryEl.textContent = "Could not locate code on the page.";
    summaryEl.className = 'sprint-ai-summary sprint-text-error';
  }
}

/**
 * ==============================================================================
 * SECTION 4: WHERE AM I WRONG?
 * ==============================================================================
 */
function closeWhereAmIWrongPopup() {
  const overlay = document.getElementById('sprint-custom-overlay');
  if (!overlay) return false;

  overlay.classList.add('sprint-fade-out');
  overlay.querySelector('.sprint-modal')?.classList.add('sprint-pop-out');
  
  setTimeout(() => overlay.remove(), 120);
  return true;
}

function showWhereAmIWrongPopup() {
  if (document.getElementById('sprint-custom-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'sprint-custom-overlay';
  overlay.className = 'sprint-overlay';

  const modal = document.createElement('div');
  modal.className = 'sprint-modal';
  modal.innerHTML = `
    <div class="sprint-modal-header">
      <div class="sprint-modal-title">
        <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Debugger Analysis</span>
      </div>
      <button id="sprint-close-x" class="sprint-close-x">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
    
    <div class="sprint-modal-body" style="text-align: left !important; width: 100%;">
      <h2 id="wrong-title" class="sprint-modal-section-title" style="text-align: left !important; margin-bottom: 12px;">Analyzing Code Logic...</h2>
      <div class="sprint-modal-text-container" style="text-align: left !important; width: 100%;">
        <p id="wrong-feedback" style="white-space: pre-line !important; text-align: left !important; margin: 0; line-height: 1.6; font-size: 14px; padding-left: 4px;">Consulting AI model to scan for anomalies...</p>
      </div>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  document.getElementById('sprint-close-x').addEventListener('click', closeWhereAmIWrongPopup);
}

async function triggerWhereAmIWrong() {
  const codeToAnalyze = await extractFullCode();

  if (!codeToAnalyze.trim()) {
    alert("Sprint: Could not find any code. Please type something in the editor.");
    return;
  }

  let problemContext = "Description not found.";
  const problemTitle = document.title.split('-')[0].trim();

  const descElement = document.querySelector('[data-track-load="description_content"]') || document.querySelector('meta[name="description"]');
  if (descElement) {
    problemContext = descElement.textContent || descElement.content;
  } else {
    const pathParts = window.location.pathname.split('/');
    const pIndex = pathParts.indexOf('problems');
    if (pIndex !== -1) problemContext = `LeetCode Problem Slug: ${pathParts[pIndex + 1]}`;
  }

  showWhereAmIWrongPopup();

  chrome.runtime.sendMessage(
    {
      type: "FETCH_WHERE_AM_I_WRONG",
      code: codeToAnalyze,
      problemTitle,
      problemContext
    },
    (response) => {
      const titleEl = document.getElementById('wrong-title');
      const feedbackEl = document.getElementById('wrong-feedback');

      if (!feedbackEl) return;

      feedbackEl.style.whiteSpace = 'pre-line';
      feedbackEl.style.textAlign = 'left';

      if (response?.success) {
        if (response.authRequired || response.data?.authRequired) {
          titleEl.textContent = 'Sign In Required';
          titleEl.style.color = '#f87171';
          feedbackEl.innerHTML = 'You must be logged in to use the AI Debugger.<br><br><a href="https://getsprint.me/login" target="_blank" style="color:#cd5c5c; font-weight:600; text-decoration:underline;">Click here to Sign In</a>';
          return;
        }

        const feedbackText = (response.data.feedback || "").trim();
        const cleanText = feedbackText.toLowerCase().replace(/[^a-z]/g, '');
        
        // Smarter classification checking if 'there are no errors' exists anywhere in the clean response
        const isClean = cleanText === "therearenoerrors" || 
                        feedbackText.toLowerCase().includes("there are no errors") ||
                        (!feedbackText.includes("-") && feedbackText.length < 35);

        if (isClean) {
          titleEl.textContent = 'No Issues Found';
          titleEl.style.color = '#6eda30';
          feedbackEl.textContent = 'There are no errors.';
          feedbackEl.className = 'sprint-text-success';
        } else {
          titleEl.textContent = 'Issue Found';
          titleEl.style.color = '#b56363';
          feedbackEl.textContent = feedbackText || "No explicit errors described.";
          feedbackEl.className = 'sprint-text-error';
        }
      } else {
        if (response?.authRequired) {
          titleEl.textContent = 'Sign In Required';
          titleEl.style.color = '#f87171';
          feedbackEl.innerHTML = 'You must be logged in to use the AI Debugger.<br><br><a href="https://getsprint.me/login" target="_blank" style="color:#cd5c5c; font-weight:600; text-decoration:underline;">Click here to Sign In</a>';
        } else if (response?.limitReached) {
          closeWhereAmIWrongPopup();
          alert(response.error);
          window.open('https://getsprint.me/payments', '_blank');
        } else {
          titleEl.textContent = 'Analysis Failed';
          titleEl.style.color = '#f87171';
          feedbackEl.textContent = response?.error || "Could not reach the server.";
          feedbackEl.className = 'sprint-text-error';
        }
      }
    }
  );
}

function injectWhereAmIWrongButton() {
  if (document.getElementById('sprint-wrong-btn')) return;

  const targetBar = document.getElementById('code_tabbar_outer');
  if (!targetBar) return;

  const tabButtons = targetBar.querySelectorAll('.flexlayout__tab_button');
  const codeTabButton = Array.from(tabButtons).find(btn => btn.textContent?.includes('Code'));

  if (!codeTabButton) return;

  const btn = document.createElement('div');
  btn.id = 'sprint-wrong-btn';
  btn.className = 'sprint-wrong-btn-style';
  btn.innerHTML = `
    <span class="sprint-btn-inner">
      <svg class="sprint-sparkle-glow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
      </svg>
      <span>AI Insights</span>
    </span>
  `;

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    triggerWhereAmIWrong();
  });

  codeTabButton.insertAdjacentElement('afterend', btn);
}

/**
 * ==============================================================================
 * SECTION 5: REDIRECT PILLS
 * ==============================================================================
 */
function injectRedirectPills() {
  let targetDiv = document.querySelector('div.h-8.w-full.min-w-0.flex-1') || document.querySelector('[class*="h-8"][class*="w-full"][class*="flex-1"]');

  if (targetDiv && !document.getElementById('sprint-google-editor-pill')) {
    if (!targetDiv.classList.contains('sprint-flex-container-override')) {
      targetDiv.style.display = 'flex';
      targetDiv.style.alignItems = 'center';
      targetDiv.style.justifyContent = 'flex-end'; 
      targetDiv.classList.add('sprint-flex-container-override');
    }

    const link = document.createElement('a');
    link.id = 'sprint-google-editor-pill';
    link.href = 'https://getsprint.me/problemset';
    link.target = '_blank';
    link.className = 'sprint-pill-editor-btn';
    link.textContent = 'Problem-Set';

    targetDiv.appendChild(link);
  }
}

/**
 * ==============================================================================
 * SECTION 6: INITIALIZATION AND LISTENERS
 * ==============================================================================
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_SELECTION") {
    (async () => {
      let code = request.code || window.getSelection().toString();

      if (!code.trim()) {
        code = await extractFullCode();
      }

      if (code.trim()) {
        analyzeCode(code);
        sendResponse({ status: "Analysis started" });
      } else {
        alert("Sprint: Could not find any code. Make sure the code editor is visible.");
        sendResponse({ status: "No code found" });
      }
    })();
    return true; 
  }

  if (request.type === "TOGGLE_WHERE_AM_I_WRONG") {
    if (!closeWhereAmIWrongPopup()) {
      triggerWhereAmIWrong();
    }
    sendResponse({ status: "Toggled" });
    return true;
  }
  
  return true;
});

setTimeout(() => {
  injectTags();
  injectComplexityUI();
  injectSubmissionAnalysisUI();
  injectWhereAmIWrongButton();
  injectRedirectPills();
}, 50);

let mutationDebounceTimer = null;
const observer = new MutationObserver(() => {
  if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
  mutationDebounceTimer = setTimeout(() => {
    if (!document.getElementById('custom-company-tags')) injectTags();
    if (!document.getElementById('complexity-analyzer-container')) injectComplexityUI();
    if (!document.getElementById('sprint-submission-analysis')) injectSubmissionAnalysisUI();
    if (!document.getElementById('sprint-wrong-btn')) injectWhereAmIWrongButton();
    injectRedirectPills();
  }, 150);
});

observer.observe(document.body, { childList: true, subtree: true });