let isInjectingTags = false;
let injectionsDisabled = false;

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
  if (injectionsDisabled) return;
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
      target.setAttribute('data-original-text', target.textContent || '');
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
  if (injectionsDisabled) return;
  if (document.getElementById('complexity-analyzer-container')) return;
  const targetBar = document.getElementById('code_tabbar_outer');
  if (!targetBar) return;

  const container = document.createElement('div');
  container.id = 'complexity-analyzer-container';
  container.className = 'complexity-container';

  // Item 1: Time Complexity
  const timeItem = document.createElement('div');
  timeItem.className = 'complexity-item';
  const timeLabel = document.createElement('span');
  timeLabel.className = 'complexity-label';
  timeLabel.textContent = 'Time:';
  const timeVal = document.createElement('span');
  timeVal.className = 'complexity-value';
  timeVal.id = 'time-complexity-value';
  timeVal.textContent = '—';
  timeItem.appendChild(timeLabel);
  timeItem.appendChild(timeVal);

  // Item 2: Space Complexity
  const spaceItem = document.createElement('div');
  spaceItem.className = 'complexity-item';
  const spaceLabel = document.createElement('span');
  spaceLabel.className = 'complexity-label';
  spaceLabel.textContent = 'Space:';
  const spaceVal = document.createElement('span');
  spaceVal.className = 'complexity-value';
  spaceVal.id = 'space-complexity-value';
  spaceVal.textContent = '—';
  spaceItem.appendChild(spaceLabel);
  spaceItem.appendChild(spaceVal);

  // Status message
  const statusMsg = document.createElement('div');
  statusMsg.className = 'complexity-status';
  statusMsg.id = 'complexity-status-text';
  statusMsg.textContent = 'Right-click or Ctrl+Shift+X';

  container.appendChild(timeItem);
  container.appendChild(spaceItem);
  container.appendChild(statusMsg);

  const inner = targetBar.querySelector('.flexlayout__tabset_tabbar_inner');
  if (inner?.nextSibling) {
    targetBar.insertBefore(container, inner.nextSibling);
  } else {
    targetBar.appendChild(container);
  }
}

function analyzeCode(code) {
  if (injectionsDisabled) return;
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
      status.innerHTML = ''; // Safe clear
      
      if (res?.authRequired) {
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/login';
        link.target = '_blank';
        link.style.cssText = 'color:#a1a1aa; font-weight:500; text-decoration:underline;';
        link.textContent = 'Sign In required';
        status.appendChild(link);
        status.className = 'complexity-status';
      } else if (res?.limitReached) {
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/payments';
        link.target = '_blank';
        link.style.cssText = 'color:#eff1f680; font-weight:500; text-decoration:underline;';
        link.textContent = 'Upgrade Required';
        status.appendChild(link);
        status.className = 'complexity-status';
        alert(res.error);
      } else {
        status.textContent = 'Analysis Failed';
        status.className = 'complexity-status sprint-text-error';
      }
    }
  });
}

function injectSubmissionAnalysisUI() {
  if (injectionsDisabled) return;
  if (document.getElementById('sprint-submission-analysis')) return;
  const boxes = document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-lg.border.p-3');
  const targetDiv = Array.from(boxes).find(d => d.textContent.includes('Runtime') || d.textContent.includes('Memory'));
  if (!targetDiv) return;

  const container = document.createElement('div');
  container.id = 'sprint-submission-analysis';
  container.className = 'sprint-ai-analysis';

  // Tab Header Area
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

  // Status & Overview Area
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

  targetDiv.prepend(container);

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
  if (!raw.trim()) {
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
      summaryElement.textContent = ''; // Safe Clear
      if (res?.authRequired) {
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/login';
        link.target = '_blank';
        link.style.cssText = 'color:#a1a1aa; text-decoration:underline; font-weight:500;';
        link.textContent = 'Sign in to LeetCode Sprint to analyze submissions.';
        summaryElement.className = 'sprint-ai-summary-muted';
        summaryElement.appendChild(link);
      } else if (res?.limitReached) {
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/payments';
        link.target = '_blank';
        link.style.cssText = 'color:#eff1f680; text-decoration:underline; font-weight:500;';
        link.textContent = 'Limit reached. Upgrade at getsprint.me/payments';
        summaryElement.className = 'sprint-ai-summary sprint-text-warning';
        summaryElement.appendChild(link);
        alert(res.error);
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

function closeWhereAmIWrongPopup() {
  const overlay = document.getElementById('sprint-custom-overlay');
  if (!overlay) return false;
  overlay.classList.add('sprint-fade-out');
  overlay.querySelector('.sprint-modal')?.classList.add('sprint-pop-out');
  setTimeout(() => overlay.remove(), 120);
  return true;
}

function showWhereAmIWrongPopup() {
  if (injectionsDisabled) return;
  if (document.getElementById('sprint-custom-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'sprint-custom-overlay';
  overlay.className = 'sprint-overlay';

  const modal = document.createElement('div');
  modal.className = 'sprint-modal';

  const header = document.createElement('div');
  header.className = 'sprint-modal-header';

  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'sprint-modal-title';

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");

  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "12");
  circle.setAttribute("cy", "12");
  circle.setAttribute("r", "10");
  const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line1.setAttribute("x1", "12");
  line1.setAttribute("y1", "8");
  line1.setAttribute("x2", "12");
  line1.setAttribute("y2", "12");
  const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line2.setAttribute("x1", "12");
  line2.setAttribute("y1", "16");
  line2.setAttribute("x2", "12.01");
  line2.setAttribute("y2", "16");

  svg.appendChild(circle);
  svg.appendChild(line1);
  svg.appendChild(line2);

  const titleSpan = document.createElement('span');
  titleSpan.textContent = 'Debugger Analysis';

  titleWrapper.appendChild(svg);
  titleWrapper.appendChild(titleSpan);

  const closeBtn = document.createElement('button');
  closeBtn.id = 'sprint-close-x';
  closeBtn.className = 'sprint-close-x';

  const closeSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  closeSvg.setAttribute("width", "12");
  closeSvg.setAttribute("height", "12");
  closeSvg.setAttribute("viewBox", "0 0 24 24");
  closeSvg.setAttribute("fill", "none");
  closeSvg.setAttribute("stroke", "currentColor");
  closeSvg.setAttribute("stroke-width", "2.5");
  closeSvg.setAttribute("stroke-linecap", "round");
  closeSvg.setAttribute("stroke-linejoin", "round");

  const lineClose1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineClose1.setAttribute("x1", "18");
  lineClose1.setAttribute("y1", "6");
  lineClose1.setAttribute("x2", "6");
  lineClose1.setAttribute("y2", "18");
  const lineClose2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
  lineClose2.setAttribute("x1", "6");
  lineClose2.setAttribute("y1", "6");
  lineClose2.setAttribute("x2", "18");
  lineClose2.setAttribute("y2", "18");

  closeSvg.appendChild(lineClose1);
  closeSvg.appendChild(lineClose2);
  closeBtn.appendChild(closeSvg);

  header.appendChild(titleWrapper);
  header.appendChild(closeBtn);

  const body = document.createElement('div');
  body.className = 'sprint-modal-body';

  const secTitle = document.createElement('h2');
  secTitle.id = 'wrong-title';
  secTitle.className = 'sprint-modal-section-title';
  secTitle.textContent = 'Analyzing Code Logic...';

  const textContainer = document.createElement('div');
  textContainer.className = 'sprint-modal-text-container';
  textContainer.id = 'wrong-feedback-container';

  const feedbackParagraph = document.createElement('p');
  feedbackParagraph.id = 'wrong-feedback';
  feedbackParagraph.textContent = 'Consulting AI model to scan for anomalies...';

  textContainer.appendChild(feedbackParagraph);
  body.appendChild(secTitle);
  body.appendChild(textContainer);

  modal.appendChild(header);
  modal.appendChild(body);
  overlay.appendChild(modal);

  document.body.appendChild(overlay);
  closeBtn.addEventListener('click', closeWhereAmIWrongPopup);
}

async function triggerWhereAmIWrong() {
  if (injectionsDisabled) return;
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
    const container = document.getElementById('wrong-feedback-container');
    if (!container || !titleEl) return;

    container.innerHTML = ''; // Safe Clear

    if (res?.success) {
      if (res.authRequired || res.data?.authRequired) {
        titleEl.textContent = 'Sign In Required';
        titleEl.style.color = '#e0a96d';
        
        const textNode = document.createElement('p');
        textNode.textContent = 'You must be logged in to use the AI Debugger.';
        
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/login';
        link.target = '_blank';
        link.style.cssText = 'color:#cd5c5c; font-weight:600; text-decoration:underline; display:block; margin-top:12px;';
        link.textContent = 'Click here to Sign In';
        
        container.appendChild(textNode);
        container.appendChild(link);
        return;
      }

      const rawText = (res.data.feedback || "").trim();
      const cleanText = rawText.toLowerCase().replace(/[^a-z]/g, '');
      const isClean = cleanText === "therearenoerrors" || rawText.toLowerCase().includes("there are no errors") || (!rawText.includes("-") && rawText.length < 35);

      if (isClean) {
        titleEl.textContent = 'No Issues Found';
        titleEl.style.color = '#6eda30';
        
        const p = document.createElement('p');
        p.className = 'sprint-text-success';
        p.textContent = 'There are no errors.';
        container.appendChild(p);
      } else {
        titleEl.textContent = 'Issue Found';
        titleEl.style.color = '#b56363';
        
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        lines.forEach((line) => {
          const p = document.createElement('p');
          p.className = 'sprint-text-error';
          p.style.marginBottom = '10px';
          
          if (line.startsWith('-')) {
            p.textContent = `• ${line.substring(1).trim()}`;
          } else {
            p.textContent = line;
          }
          container.appendChild(p);
        });
      }
    } else {
      if (res?.authRequired) {
        titleEl.textContent = 'Sign In Required';
        titleEl.style.color = '#e0a96d';
        
        const p = document.createElement('p');
        p.textContent = 'You must be logged in.';
        
        const link = document.createElement('a');
        link.href = 'https://getsprint.me/login';
        link.target = '_blank';
        link.style.cssText = 'color:#cd5c5c; font-weight:600; text-decoration:underline; display:block; margin-top:12px;';
        link.textContent = 'Click here to Sign In';
        
        container.appendChild(p);
        container.appendChild(link);
      } else if (res?.limitReached) {
        closeWhereAmIWrongPopup();
        alert(res.error);
        window.open('https://getsprint.me/payments', '_blank');
      } else {
        titleEl.textContent = 'Analysis Failed';
        titleEl.style.color = '#f87171';
        
        const p = document.createElement('p');
        p.className = 'sprint-text-error';
        p.textContent = res?.error || "Could not reach the server.";
        container.appendChild(p);
      }
    }
  });
}

function injectWhereAmIWrongButton() {
  if (injectionsDisabled) return;
  if (document.getElementById('sprint-wrong-btn')) return;
  const targetBar = document.getElementById('code_tabbar_outer');
  if (!targetBar) return;

  const codeTab = Array.from(targetBar.querySelectorAll('.flexlayout__tab_button')).find(b => b.textContent?.includes('Code'));
  if (!codeTab) return;

  const btn = document.createElement('div');
  btn.id = 'sprint-wrong-btn';
  btn.className = 'sprint-wrong-btn-style';

  const btnInner = document.createElement('span');
  btnInner.className = 'sprint-btn-inner';

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "sprint-sparkle-glow");
  svg.setAttribute("width", "12");
  svg.setAttribute("height", "12");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");

  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z");
  svg.appendChild(path);

  const label = document.createElement('span');
  label.textContent = 'AI Insights';

  btnInner.appendChild(svg);
  btnInner.appendChild(label);
  btn.appendChild(btnInner);

  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    triggerWhereAmIWrong();
  });
  codeTab.insertAdjacentElement('afterend', btn);
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
  document.getElementById('complexity-analyzer-container')?.remove();
  document.getElementById('sprint-submission-analysis')?.remove();
  document.getElementById('sprint-wrong-btn')?.remove();
  document.getElementById('sprint-google-editor-pill')?.remove();
  closeWhereAmIWrongPopup();

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
  injectComplexityUI();
  if (window.location.pathname.includes('/submissions/')) injectSubmissionAnalysisUI();
  injectWhereAmIWrongButton();
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

  if (request.type === "ANALYZE_SELECTION") {
    if (injectionsDisabled) {
      sendResponse({ status: "Disabled" });
      return true;
    }
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
    if (injectionsDisabled) {
      sendResponse({ status: "Disabled" });
      return true;
    }
    if (!closeWhereAmIWrongPopup()) triggerWhereAmIWrong();
    sendResponse({ status: "Toggled" });
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
    if (!document.getElementById('complexity-analyzer-container')) injectComplexityUI();
    if (!document.getElementById('sprint-submission-analysis') && window.location.pathname.includes('/submissions/')) {
      injectSubmissionAnalysisUI();
    }
    if (!document.getElementById('sprint-wrong-btn')) injectWhereAmIWrongButton();
    if (!document.getElementById('sprint-google-editor-pill')) injectRedirectPills();
  }, 120);
});
obs.observe(document.body, { childList: true, subtree: true });