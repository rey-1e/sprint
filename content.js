let isInjectingTags = false;

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
  const questionId = slug ? await getCachedQuestionId(slug) : null;

  // Primary: Real-time Monaco Memory Extraction via MAIN world bridge
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

  // Secondary Fallback: LocalStorage drafts
  if (slug || questionId) {
    const local = await getCodeFromLocalStorage(slug, questionId);
    if (local && local.trim().length > 0) return local;
  }

  // Tertiary Fallback: Monaco DOM virtualizer lines
  const lines = document.querySelectorAll('.view-line');
  return lines.length ? Array.from(lines).map(l => l.textContent).join('\n') : "";
}

async function injectTags() {
  if (document.getElementById('custom-company-tags') || isInjectingTags) return;
  isInjectingTags = true;

  try {
    const urlParts = window.location.pathname.split('/');
    const pIdx = urlParts.indexOf('problems');
    if (pIdx === -1) return;
    const slug = urlParts[pIdx + 1];
    if (!slug) return;

    const questionId = await getCachedQuestionId(slug);
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

    let target = document.querySelector('[class*="text-difficulty-"]');
    if (!target) {
      const items = document.querySelectorAll('div.flex.items-center.space-x-4 div, div[class*="gap-"] > div');
      for (const el of items) {
        if (/^(Easy|Medium|Hard)$/i.test(el.textContent?.trim())) {
          target = el;
          break;
        }
      }
    }
    if (!target) return;

    if (elo && !target.hasAttribute('data-elo-injected')) {
      target.textContent = `${target.textContent} - ${elo}`;
      target.setAttribute('data-elo-injected', 'true');
    }

    if (document.getElementById('custom-company-tags')) return;

    const container = document.createElement('div');
    container.id = 'custom-company-tags';
    container.className = 'company-tags-wrapper';

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

function injectComplexityUI() {
  if (document.getElementById('complexity-analyzer-container')) return;
  const targetBar = document.getElementById('code_tabbar_outer');
  if (!targetBar) return;

  const container = document.createElement('div');
  container.id = 'complexity-analyzer-container';
  container.className = 'complexity-container';
  container.innerHTML = `
    <div class="complexity-item"><span class="complexity-label">Time:</span><span class="complexity-value" id="time-complexity-value">—</span></div>
    <div class="complexity-item"><span class="complexity-label">Space:</span><span class="complexity-value" id="space-complexity-value">—</span></div>
    <div class="complexity-status" id="complexity-status-text">Right-click or Ctrl+Shift+X</div>
  `;

  const inner = targetBar.querySelector('.flexlayout__tabset_tabbar_inner');
  if (inner?.nextSibling) {
    targetBar.insertBefore(container, inner.nextSibling);
  } else {
    targetBar.appendChild(container);
  }
}

function analyzeCode(code) {
  injectComplexityUI();
  const time = document.getElementById('time-complexity-value');
  const space = document.getElementById('space-complexity-value');
  const status = document.getElementById('complexity-status-text');

  if (!time || !space || !status) return;
  time.textContent = '...';
  space.textContent = '...';
  status.textContent = 'Analyzing...';
  status.className = 'complexity-status sprint-text-warning';

  chrome.runtime.sendMessage({ type: "FETCH_COMPLEXITY", code }, (res) => {
    if (res?.success) {
      time.textContent = res.data.time || 'N/A';
      space.textContent = res.data.space || 'N/A';
      status.textContent = 'Analysis Complete';
      status.className = 'complexity-status sprint-text-success';
    } else {
      time.textContent = 'Err';
      space.textContent = 'Err';
      if (res?.authRequired) {
        status.innerHTML = '<a href="https://getsprint.me/login" target="_blank" style="color:#a1a1aa; font-weight:500; text-decoration:underline;">Sign In required</a>';
        status.className = 'complexity-status';
      } else if (res?.limitReached) {
        status.innerHTML = '<a href="https://getsprint.me/payments" target="_blank" style="color:#eff1f680; font-weight:500; text-decoration:underline;">Upgrade Required</a>';
        status.className = 'complexity-status';
        alert(res.error);
      } else {
        status.textContent = 'Analysis Failed';
        status.className = 'complexity-status sprint-text-error';
      }
    }
  });
}

async function injectSubmissionAnalysisUI() {
  if (document.getElementById('sprint-submission-analysis')) return;
  const boxes = document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-lg.border.p-3');
  const targetDiv = Array.from(boxes).find(d => d.textContent.includes('Runtime') || d.textContent.includes('Memory'));
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

  tabs.forEach(t => {
    t.addEventListener('click', () => {
      tabs.forEach(x => x.classList.remove('active'));
      contents.forEach(c => { c.classList.remove('active'); c.classList.add('sprint-hidden'); });
      t.classList.add('active');
      const target = container.querySelector('#' + t.getAttribute('data-target'));
      if (target) { target.classList.remove('sprint-hidden'); target.classList.add('active'); }
    });
  });

  const raw = await extractFullCode();
  const summary = document.getElementById('sprint-ai-summary');
  if (!raw.trim()) {
    summary.textContent = "Could not locate code on the page.";
    summary.className = 'sprint-ai-summary sprint-text-error';
    return;
  }

  chrome.runtime.sendMessage({ type: "FETCH_DETAILED_ANALYSIS", code: raw }, (res) => {
    if (res?.success) {
      const d = res.data;
      summary.textContent = d.summary || "Analysis complete.";
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
      if (res?.authRequired) {
        summary.innerHTML = '<a href="https://getsprint.me/login" target="_blank" style="color:#a1a1aa; text-decoration:underline; font-weight:500;">Sign in to LeetCode Sprint to analyze submissions.</a>';
        summary.className = 'sprint-ai-summary-muted';
      } else if (res?.limitReached) {
        summary.innerHTML = '<a href="https://getsprint.me/payments" target="_blank" style="color:#eff1f680; text-decoration:underline; font-weight:500;">Limit reached. Upgrade at getsprint.me/payments</a>';
        summary.className = 'sprint-ai-summary sprint-text-warning';
        alert(res.error);
      } else {
        summary.textContent = "Analysis failed. Ensure service worker API is active.";
        summary.className = 'sprint-ai-summary sprint-text-error';
      }
    }
  });
}

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
  overlay.innerHTML = `
    <div class="sprint-modal">
      <div class="sprint-modal-header">
        <div class="sprint-modal-title">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <span>Debugger Analysis</span>
        </div>
        <button id="sprint-close-x" class="sprint-close-x">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      <div class="sprint-modal-body">
        <h2 id="wrong-title" class="sprint-modal-section-title">Analyzing Code Logic...</h2>
        <div class="sprint-modal-text-container">
          <p id="wrong-feedback">Consulting AI model to scan for anomalies...</p>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.getElementById('sprint-close-x').addEventListener('click', closeWhereAmIWrongPopup);
}

async function triggerWhereAmIWrong() {
  const rawCode = await extractFullCode();
  if (!rawCode.trim()) {
    alert("Sprint: Could not find any code. Please type something in the editor.");
    return;
  }

  let ctx = "Description not found.";
  const title = document.title.split('-')[0].trim();
  const desc = document.querySelector('[data-track-load="description_content"]') || document.querySelector('meta[name="description"]');
  if (desc) {
    ctx = desc.textContent || desc.content;
  } else {
    const parts = window.location.pathname.split('/');
    const idx = parts.indexOf('problems');
    if (idx !== -1) ctx = `LeetCode Problem Slug: ${parts[idx + 1]}`;
  }

  showWhereAmIWrongPopup();

  chrome.runtime.sendMessage({ type: "FETCH_WHERE_AM_I_WRONG", code: rawCode, problemTitle: title, problemContext: ctx }, (res) => {
    const titleEl = document.getElementById('wrong-title');
    const feedback = document.getElementById('wrong-feedback');
    if (!feedback) return;

    if (res?.success) {
      if (res.authRequired || res.data?.authRequired) {
        titleEl.textContent = 'Sign In Required';
        titleEl.style.color = '#e0a96d';
        feedback.innerHTML = 'You must be logged in to use the AI Debugger.<br><br><a href="https://getsprint.me/login" target="_blank" style="color:#cd5c5c; font-weight:600; text-decoration:underline;">Click here to Sign In</a>';
        return;
      }
      const rawText = (res.data.feedback || "").trim();
      const cleanText = rawText.toLowerCase().replace(/[^a-z]/g, '');
      const isClean = cleanText === "therearenoerrors" || rawText.toLowerCase().includes("there are no errors") || (!rawText.includes("-") && rawText.length < 35);

      if (isClean) {
        titleEl.textContent = 'No Issues Found';
        titleEl.style.color = '#6eda30';
        feedback.textContent = 'There are no errors.';
        feedback.className = 'sprint-text-success';
      } else {
        titleEl.textContent = 'Issue Found';
        titleEl.style.color = '#b56363';
        
        // Escape bracket formats and cleanly map dashes to visual newlines
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        const formattedLines = lines.map(line => {
          const escapedLine = line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          if (escapedLine.startsWith('-')) {
            return `• ${escapedLine.substring(1).trim()}`;
          }
          return escapedLine;
        });

        feedback.innerHTML = formattedLines.join('<br><br>');
        feedback.className = 'sprint-text-error';
      }
    } else {
      if (res?.authRequired) {
        titleEl.textContent = 'Sign In Required';
        titleEl.style.color = '#e0a96d';
        feedback.innerHTML = 'You must be logged in.<br><br><a href="https://getsprint.me/login" target="_blank" style="color:#cd5c5c; font-weight:600; text-decoration:underline;">Click here to Sign In</a>';
      } else if (res?.limitReached) {
        closeWhereAmIWrongPopup();
        alert(res.error);
        window.open('https://getsprint.me/payments', '_blank');
      } else {
        titleEl.textContent = 'Analysis Failed';
        titleEl.style.color = '#f87171';
        feedback.textContent = res?.error || "Could not reach the server.";
        feedback.className = 'sprint-text-error';
      }
    }
  });
}

function injectWhereAmIWrongButton() {
  if (document.getElementById('sprint-wrong-btn')) return;
  const targetBar = document.getElementById('code_tabbar_outer');
  if (!targetBar) return;

  const codeTab = Array.from(targetBar.querySelectorAll('.flexlayout__tab_button')).find(b => b.textContent?.includes('Code'));
  if (!codeTab) return;

  const btn = document.createElement('div');
  btn.id = 'sprint-wrong-btn';
  btn.className = 'sprint-wrong-btn-style';
  btn.innerHTML = `
    <span class="sprint-btn-inner">
      <svg class="sprint-sparkle-glow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
      <span>AI Insights</span>
    </span>
  `;
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation(); e.preventDefault();
    triggerWhereAmIWrong();
  });
  codeTab.insertAdjacentElement('afterend', btn);
}

function injectRedirectPills() {
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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "ANALYZE_SELECTION") {
    (async () => {
      let code = request.code || window.getSelection().toString();
      if (!code.trim()) code = await extractFullCode();
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
    if (!closeWhereAmIWrongPopup()) triggerWhereAmIWrong();
    sendResponse({ status: "Toggled" });
    return true;
  }
  return true;
});

setTimeout(() => {
  injectTags();
  injectComplexityUI();
  if (window.location.pathname.includes('/submissions/')) injectSubmissionAnalysisUI();
  injectWhereAmIWrongButton();
  injectRedirectPills();
}, 50);

let debounce = null;
const obs = new MutationObserver(() => {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    if (!document.getElementById('custom-company-tags')) injectTags();
    if (!document.getElementById('complexity-analyzer-container')) injectComplexityUI();
    if (!document.getElementById('sprint-submission-analysis') && window.location.pathname.includes('/submissions/')) {
      injectSubmissionAnalysisUI();
    }
    if (!document.getElementById('sprint-wrong-btn')) injectWhereAmIWrongButton();
    if (!document.getElementById('sprint-google-editor-pill')) injectRedirectPills();
  }, 120);
});
obs.observe(document.body, { childList: true, subtree: true });