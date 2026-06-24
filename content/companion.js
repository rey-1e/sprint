(() => {
  if (document.getElementById('sprint-global-companion-host')) return;

  // 1. Setup Shadow DOM Host wrapper
  const host = document.createElement('div');
  host.id = 'sprint-global-companion-host';
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.pointerEvents = 'none';
  host.style.zIndex = '2147483647';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // 2. Inject Stylesheet
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('styles/companion.css');
  shadow.appendChild(link);

  // 3. Construct Injected DOM structure
  const uiContainer = document.createElement('div');
  uiContainer.id = 'sprint-shadow-container';

  // Draggable sphere trigger
  const sphere = document.createElement('div');
  sphere.id = 'sprint-sphere';
  sphere.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  `;

  // Sphere Close Button
  const sphereCloseBtn = document.createElement('div');
  sphereCloseBtn.id = 'sprint-sphere-close';
  sphereCloseBtn.innerHTML = '&times;';
  sphere.appendChild(sphereCloseBtn);

  // Floating Action Panel
  const actionPanel = document.createElement('div');
  actionPanel.id = 'sprint-vertical-panel';

  const buttonsData = [
    {
      id: 'btn-complexity',
      tooltip: 'Analyze Complexity',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    },
    {
      id: 'btn-bug',
      tooltip: 'Find My Bug',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
    },
    {
      id: 'btn-chat',
      tooltip: 'sprintAI Chat',
      svg: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
    }
  ];

  buttonsData.forEach(data => {
    const btn = document.createElement('button');
    btn.className = 'sprint-icon-btn';
    btn.id = data.id;
    btn.innerHTML = `
      ${data.svg}
      <span class="sprint-tooltip">${data.tooltip}</span>
    `;
    actionPanel.appendChild(btn);
  });

  // Toast Container
  const toastContainer = document.createElement('div');
  toastContainer.id = 'sprint-toast-container';

  uiContainer.appendChild(sphere);
  uiContainer.appendChild(actionPanel);
  uiContainer.appendChild(toastContainer);
  shadow.appendChild(uiContainer);

  let chatHistory = [];
  let selectionPopup = null;
  let activeSelectionContext = null;
  let contextAddedToSession = false;

  const defaultPresets = [
    { label: 'Complexity', prompt: 'Analyze the space and time complexity of my selected solution code.' },
    { label: 'Bugs', prompt: 'Scan this selected code for hidden logical bugs or runtime failures.' },
    { label: 'Optimize', prompt: 'Propose optimizations to improve speed or lessen memory usage.' },
    { label: 'Explain', prompt: 'Explain this solution step by step in clear plain language.' }
  ];

  function checkAuthAndRun(callback) {
    chrome.storage.local.get(['authToken'], (storage) => {
      if (!storage.authToken) {
        alert("You need to log in to use AI features!");
        window.open("https://getsprint.me/login", "_blank");
        return;
      }
      callback();
    });
  }

  // Returns selection strictly triggered by manual user highlights, avoiding random clicks
  function getActualSelectionText() {
    let text = window.getSelection().toString().trim();
    if (text) return text;

    const getSelectionFromShadowRoot = (root) => {
      if (!root) return null;
      if (root.getSelection) {
        const s = root.getSelection().toString().trim();
        if (s) return s;
      }
      
      const elements = root.querySelectorAll ? root.querySelectorAll('*') : [];
      for (const el of elements) {
        if (el.shadowRoot) {
          const s = getSelectionFromShadowRoot(el.shadowRoot);
          if (s) return s;
        }
      }
      return null;
    };

    const shadowSelection = getSelectionFromShadowRoot(document);
    if (shadowSelection) return shadowSelection;

    const active = document.activeElement;
    if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (start !== undefined && end !== undefined && start !== end) {
        return active.value.substring(start, end).trim();
      }
    }
    return null;
  }

  function getDeepSelection() {
    const actual = getActualSelectionText();
    if (actual) return actual;

    const preBlocks = document.querySelectorAll('pre');
    if (preBlocks.length === 1) {
      return preBlocks[0].textContent.trim();
    }
    const codeBlocks = document.querySelectorAll('code');
    if (codeBlocks.length === 1) {
      return codeBlocks[0].textContent.trim();
    }

    return null;
  }

  function showSelectionPopup(x, y, selectedText) {
    removeSelectionPopupEl();

    chrome.storage.local.get('options', (res) => {
      const removePopOpt = res?.options?.find(o => o.optionName === 'removeSelectionPopup');
      if (removePopOpt && removePopOpt.checked) return;

      selectionPopup = document.createElement('div');
      selectionPopup.id = 'sprint-selection-popup';
      
      const boundedX = Math.max(10, Math.min(window.innerWidth - 130, x));
      const boundedY = Math.max(10, Math.min(window.innerHeight - 50, y));
      selectionPopup.style.left = `${boundedX}px`;
      selectionPopup.style.top = `${boundedY}px`;

      selectionPopup.innerHTML = `
        <button class="sprint-selection-btn" id="sel-btn-complexity" title="Complexity">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        </button>
        <button class="sprint-selection-btn" id="sel-btn-bug" title="Find My Bug">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        </button>
        <button class="sprint-selection-btn" id="sel-btn-chat" title="sprintAI Chat">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
      `;

      shadow.appendChild(selectionPopup);
      selectionPopup.style.pointerEvents = 'auto';

      shadow.getElementById('sel-btn-complexity').addEventListener('click', (e) => {
        e.stopPropagation();
        checkAuthAndRun(() => performComplexityAnalysis(selectedText));
        removeSelectionPopupEl();
      });

      shadow.getElementById('sel-btn-bug').addEventListener('click', (e) => {
        e.stopPropagation();
        checkAuthAndRun(() => performBugCheck(selectedText));
        removeSelectionPopupEl();
      });

      shadow.getElementById('sel-btn-chat').addEventListener('click', (e) => {
        e.stopPropagation();
        checkAuthAndRun(() => {
          activeSelectionContext = selectedText;
          contextAddedToSession = false;
          openChatModal();
        });
        removeSelectionPopupEl();
      });
    });
  }

  function removeSelectionPopupEl() {
    if (selectionPopup) {
      selectionPopup.remove();
      selectionPopup = null;
    }
  }

  document.addEventListener('mouseup', (e) => {
    const cursorX = e.clientX;
    const cursorY = e.clientY;

    setTimeout(() => {
      const sel = getActualSelectionText(); // STRICT selection verification triggered here
      if (sel && sel.length > 2) {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          
          if (e.target && (e.target.id === 'sprint-global-companion-host' || e.target.closest('#sprint-global-companion-host'))) {
            return;
          }

          const x = cursorX - 60;
          const y = cursorY - 45;
          showSelectionPopup(x, y, sel);
        }
      } else {
        if (e.target && !e.target.closest('#sprint-selection-popup')) {
          removeSelectionPopupEl();
        }
      }
    }, 50);
  });

  function createToast(title, statusMessage, timeValue = "—", spaceValue = "—", isError = false, autoClose = true) {
    const toast = document.createElement('div');
    toast.className = 'sprint-toast';
    
    toast.innerHTML = `
      <div class="sprint-toast-header">
        <span>${title}</span>
        <button class="sprint-toast-close">&times;</button>
      </div>
      <div class="complexity-container">
        <div class="complexity-item">
          <span class="complexity-label">Time:</span>
          <span class="complexity-value" style="${isError ? 'color: var(--text-warning);' : ''}">${timeValue}</span>
        </div>
        <div class="complexity-item">
          <span class="complexity-label">Space:</span>
          <span class="complexity-value" style="${isError ? 'color: var(--text-warning);' : ''}">${spaceValue}</span>
        </div>
        <div class="complexity-status" style="${isError ? 'color: var(--text-warning);' : ''}">${statusMessage}</div>
      </div>
      <div class="sprint-toast-progress-bar"></div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 50);

    const closeSelf = () => {
      toast.classList.add('slide-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };

    toast.querySelector('.sprint-toast-close').addEventListener('click', closeSelf);

    if (autoClose) {
      const progressBar = toast.querySelector('.sprint-toast-progress-bar');
      progressBar.style.animation = 'shrinkWidth 4s linear forwards';
      const timeout = setTimeout(closeSelf, 4000);
      toast.dataset.timeout = timeout;
    } else {
      const progressBar = toast.querySelector('.sprint-toast-progress-bar');
      progressBar.style.width = '100%';
    }

    return toast;
  }

  function finalizeToast(toast) {
    if (!toast) return;
    const progressBar = toast.querySelector('.sprint-toast-progress-bar');
    if (progressBar) {
      progressBar.style.animation = 'shrinkWidth 4s linear forwards';
    }
    const closeSelf = () => {
      toast.classList.add('slide-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };
    const timeout = setTimeout(closeSelf, 4000);
    toast.dataset.timeout = timeout;
  }

  function createNoSelectionWarning() {
    const toast = document.createElement('div');
    toast.className = 'sprint-toast';
    
    toast.innerHTML = `
      <div class="sprint-toast-header">
        <span>Selection Warning</span>
        <button class="sprint-toast-close">&times;</button>
      </div>
      <div class="complexity-container" style="padding: 12px 16px 16px;">
        <div class="complexity-item" style="gap: 10px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-warning)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span style="font-weight: 600; font-family: var(--font-google); color: var(--text-warning);">You Need to Select Text.</span>
        </div>
      </div>
      <div class="sprint-toast-progress-bar" style="background-color: #3b82f6;"></div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('show');
    }, 50);

    const progressBar = toast.querySelector('.sprint-toast-progress-bar');
    progressBar.style.animation = 'shrinkWidth 4s linear forwards';

    const closeSelf = () => {
      toast.classList.add('slide-out');
      setTimeout(() => {
        toast.remove();
      }, 300);
    };

    toast.querySelector('.sprint-toast-close').addEventListener('click', closeSelf);
    const timeout = setTimeout(closeSelf, 4000);
    toast.dataset.timeout = timeout;
  }

  function closeBugModal() {
    const modalContainer = shadow.getElementById('sprint-custom-overlay');
    if (!modalContainer) return;
    
    modalContainer.classList.add('sprint-fade-out');
    const innerModal = modalContainer.querySelector('.sprint-modal');
    if (innerModal) innerModal.classList.add('sprint-pop-out');
    
    setTimeout(() => {
      modalContainer.remove();
    }, 120);
  }

  function openBugModal(titleText, initialFeedback) {
    closeBugModal();

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

    const chatCta = document.createElement('button');
    chatCta.id = 'sprint-modal-chat-cta';
    chatCta.className = 'sprint-modal-chat-cta';
    chatCta.textContent = 'Ask Chat ⚡';
    chatCta.title = 'Ask SprintAI for follow-up help';
    chatCta.addEventListener('click', () => {
      checkAuthAndRun(() => {
        openChatModal();
      });
    });

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
    header.appendChild(chatCta);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'sprint-modal-body';

    const secTitle = document.createElement('h2');
    secTitle.id = 'wrong-title';
    secTitle.className = 'sprint-modal-section-title';
    secTitle.textContent = titleText;

    const textContainer = document.createElement('div');
    textContainer.className = 'sprint-modal-text-container';
    textContainer.id = 'wrong-feedback-container';

    const feedbackParagraph = document.createElement('p');
    feedbackParagraph.id = 'wrong-feedback';
    feedbackParagraph.textContent = initialFeedback;

    textContainer.appendChild(feedbackParagraph);
    body.appendChild(secTitle);
    body.appendChild(textContainer);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    uiContainer.appendChild(overlay);
    closeBtn.addEventListener('click', closeBugModal);
  }

  function closeChatModal() {
    const modalContainer = shadow.getElementById('sprint-chat-overlay');
    if (!modalContainer) return;
    
    modalContainer.classList.add('sprint-fade-out');
    const innerModal = modalContainer.querySelector('.sprint-modal');
    if (innerModal) innerModal.classList.add('sprint-pop-out');
    
    setTimeout(() => {
      modalContainer.remove();
    }, 120);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatMessageContent(text) {
    const placeholders = [];
    
    const codeBlockRegex = /```([a-zA-Z0-9+#-]+)?\n([\s\S]*?)\n```/g;
    let processed = text.replace(codeBlockRegex, (match, lang, code) => {
      const index = placeholders.length;
      placeholders.push({
        type: 'block',
        code: code,
        html: `<div class="sprint-chat-code-block-wrapper">
          <div class="sprint-chat-code-header">
            <span>${lang ? lang.toUpperCase() : 'CODE'}</span>
            <button class="sprint-chat-copy-code" data-index="${index}">Copy</button>
          </div>
          <pre><code>${escapeHtml(code)}</code></pre>
        </div>`
      });
      return `___SPRINT_PLACEHOLDER_${index}___`;
    });

    const inlineCodeRegex = /`([^`\n]+)`/g;
    processed = processed.replace(inlineCodeRegex, (match, code) => {
      const index = placeholders.length;
      placeholders.push({
        type: 'inline',
        code: code,
        html: `<code class="sprint-chat-inline-code">${escapeHtml(code)}</code>`
      });
      return `___SPRINT_PLACEHOLDER_${index}___`;
    });

    processed = escapeHtml(processed);
    processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    const paragraphs = processed.split(/\n\n+/);
    processed = paragraphs.map(p => {
      if (p.trim().startsWith('- ') || p.trim().startsWith('* ')) {
        const items = p.split(/\n[-*]\s+/);
        const listItems = items.map((item, i) => `<li>${i === 0 ? item.replace(/^[-*]\s+/, '') : item}</li>`).join('');
        return `<ul>${listItems}</ul>`;
      }
      if (/^\d+\.\s+/.test(p.trim())) {
        const items = p.split(/\n\d+\.\s+/);
        const listItems = items.map((item, i) => `<li>${i === 0 ? item.replace(/^\d+\.\s+/, '') : item}</li>`).join('');
        return `<ol>${listItems}</ol>`;
      }
      return `<p>${p}</p>`;
    }).join('');

    return { html: processed, placeholders };
  }

  function renderPresets(bar, input) {
    chrome.storage.local.get(['chatPresets'], (res) => {
      const presets = res.chatPresets || defaultPresets;
      bar.innerHTML = '';

      presets.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.className = 'sprint-chat-preset-btn';
        // Enforced strict flex formatting and vertical margins on wrap
        btn.style.cssText = 'display: inline-flex; align-items: center; gap: 4px; margin-bottom: 2px;';

        const labelSpan = document.createElement('span');
        labelSpan.textContent = p.label;
        labelSpan.style.cursor = 'pointer';
        labelSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          input.value = p.prompt;
          input.focus();
        });
        btn.appendChild(labelSpan);

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&times;';
        delBtn.style.cssText = 'color: var(--text-muted); font-size: 12px; font-weight: bold; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; width: 12px; height: 12px; border-radius: 50%; transition: color 0.15s, background-color 0.15s; margin-left: 4px;';
        delBtn.title = 'Delete Preset';
        delBtn.addEventListener('mouseenter', () => {
          delBtn.style.color = '#ef4444';
          delBtn.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        });
        delBtn.addEventListener('mouseleave', () => {
          delBtn.style.color = 'var(--text-muted)';
          delBtn.style.backgroundColor = 'transparent';
        });
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const updated = presets.filter((_, i) => i !== idx);
          chrome.storage.local.set({ chatPresets: updated }, () => {
            renderPresets(bar, input);
          });
        });
        btn.appendChild(delBtn);

        bar.appendChild(btn);
      });

      // Add Preset button (Enforces styling matching wrapping layout)
      const addBtn = document.createElement('button');
      addBtn.className = 'sprint-chat-preset-btn';
      addBtn.style.cssText = 'background: rgba(205, 92, 92, 0.12); border-color: rgba(205, 92, 92, 0.25); color: #ffd1d1; display: inline-flex; align-items: center; margin-bottom: 2px;';
      addBtn.innerHTML = '+ Custom';
      addBtn.title = 'Create Custom Preset';
      addBtn.addEventListener('click', () => {
        const label = prompt("Enter a short label for your custom pill (e.g., 🚀 Optimize):");
        if (!label) return;
        const promptText = prompt("Enter the prompt text associated with this pill:");
        if (!promptText) return;

        const updated = [...presets, { label, prompt: promptText }];
        chrome.storage.local.set({ chatPresets: updated }, () => {
          renderPresets(bar, input);
        });
      });
      bar.appendChild(addBtn);

      // Reset button (Enforces styling matching wrapping layout)
      const resetBtn = document.createElement('button');
      resetBtn.className = 'sprint-chat-preset-btn';
      resetBtn.style.cssText = 'background: rgba(255, 255, 255, 0.02); border-color: rgba(255, 255, 255, 0.05); color: var(--text-muted); display: inline-flex; align-items: center; margin-bottom: 2px;';
      resetBtn.innerHTML = '↺ Reset';
      resetBtn.title = 'Reset Presets to Default';
      resetBtn.addEventListener('click', () => {
        if (confirm("Are you sure you want to reset all preset pills back to default?")) {
          chrome.storage.local.set({ chatPresets: defaultPresets }, () => {
            renderPresets(bar, input);
          });
        }
      });
      bar.appendChild(resetBtn);
    });
  }

  function openChatModal() {
    closeBugModal();
    closeChatModal();

    activeSelectionContext = getDeepSelection();
    contextAddedToSession = false;

    const overlay = document.createElement('div');
    overlay.id = 'sprint-chat-overlay';
    overlay.className = 'sprint-overlay';

    const modal = document.createElement('div');
    modal.className = 'sprint-modal sprint-chat-modal';

    const header = document.createElement('div');
    header.className = 'sprint-modal-header';

    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'sprint-modal-title';
    titleWrapper.style.color = 'var(--accent)';

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z");
    svg.appendChild(path);

    const titleSpan = document.createElement('span');
    titleSpan.textContent = 'SprintAI Assistant';

    titleWrapper.appendChild(svg);
    titleWrapper.appendChild(titleSpan);

    const body = document.createElement('div');
    body.className = 'sprint-modal-body sprint-chat-body';
    body.id = 'sprint-chat-body';

    const historyContainer = document.createElement('div');
    historyContainer.className = 'sprint-chat-history';
    historyContainer.id = 'sprint-chat-history';
    body.appendChild(historyContainer);

    renderChatHistory(historyContainer);

    const newChatBtn = document.createElement('button');
    newChatBtn.id = 'sprint-chat-new-btn';
    newChatBtn.className = 'sprint-chat-new-btn';
    newChatBtn.textContent = 'New Chat';
    newChatBtn.addEventListener('click', () => {
      chatHistory = [];
      activeSelectionContext = null;
      contextAddedToSession = false;
      const indicator = shadow.getElementById('sprint-chat-context-indicator');
      if (indicator) indicator.style.display = 'none';
      renderChatHistory(historyContainer);
    });

    const closeBtn = document.createElement('button');
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
    header.appendChild(newChatBtn);
    header.appendChild(closeBtn);

    const contextIndicator = document.createElement('div');
    contextIndicator.id = 'sprint-chat-context-indicator';
    contextIndicator.className = 'sprint-chat-context-bar';
    contextIndicator.style.display = 'none';

    if (activeSelectionContext && !contextAddedToSession) {
      const truncated = activeSelectionContext.length > 50 ? activeSelectionContext.substring(0, 50) + "..." : activeSelectionContext;
      contextIndicator.innerHTML = `
        <span style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          <strong>Context:</strong> <span style="opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(truncated)}</span>
        </span>
        <button id="sprint-clear-context-btn" class="sprint-chat-context-close">&times;</button>
      `;
      contextIndicator.style.display = 'flex';
    }

    const presetsBar = document.createElement('div');
    presetsBar.className = 'sprint-chat-presets-bar';

    // "Do not answer" Option Checkbox Bar
    const optionsBar = document.createElement('div');
    optionsBar.className = 'sprint-chat-options-bar';

    const checkboxLabel = document.createElement('label');
    checkboxLabel.className = 'sprint-chat-checkbox-label';

    const checkboxInput = document.createElement('input');
    checkboxInput.type = 'checkbox';
    checkboxInput.id = 'sprint-chat-no-code-checkbox';

    const checkboxText = document.createElement('span');
    checkboxText.textContent = 'Do Not Output Full Code';

    checkboxLabel.appendChild(checkboxInput);
    checkboxLabel.appendChild(checkboxText);
    optionsBar.appendChild(checkboxLabel);

    const footer = document.createElement('div');
    footer.className = 'sprint-chat-footer';

    const input = document.createElement('textarea');
    input.placeholder = 'Ask anything...';
    input.className = 'sprint-chat-input';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'sprint-chat-send-btn';
    sendBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"></line>
        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
      </svg>
    `;

    footer.appendChild(input);
    footer.appendChild(sendBtn);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(contextIndicator);
    modal.appendChild(presetsBar);
    modal.appendChild(optionsBar); // Injected exactly above input field and below presets-bar
    modal.appendChild(footer);
    overlay.appendChild(modal);

    uiContainer.appendChild(overlay);

    closeBtn.addEventListener('click', closeChatModal);

    const clearContextBtn = contextIndicator.querySelector('#sprint-clear-context-btn');
    if (clearContextBtn) {
      clearContextBtn.addEventListener('click', () => {
        activeSelectionContext = null;
        contextAddedToSession = false;
        contextIndicator.style.display = 'none';
      });
    }

    renderPresets(presetsBar, input);

    const triggerSendMessage = () => {
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      sendMessage(text, historyContainer);
    };

    sendBtn.addEventListener('click', triggerSendMessage);
    
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          e.stopPropagation();
        } else {
          e.preventDefault();
          e.stopPropagation();
          triggerSendMessage();
        }
      }
    });

    setTimeout(() => input.focus(), 150);
  }

  function sendMessage(text, container) {
    let finalPrompt = text;
    
    // Check if the "Do not output full code" checkbox is activated [1]
    const noCodeCheckbox = shadow.getElementById('sprint-chat-no-code-checkbox');
    const preventCode = noCodeCheckbox ? noCodeCheckbox.checked : false;

    if (activeSelectionContext && !contextAddedToSession) {
      finalPrompt = `Context code:\n\`\`\`\n${activeSelectionContext}\n\`\`\`\n\nQuery: ${text}`;
      contextAddedToSession = true;
      const indicator = shadow.getElementById('sprint-chat-context-indicator');
      if (indicator) indicator.style.display = 'none';
    }

    if (preventCode) {
      finalPrompt += "\n\n(STRICT CONSTRAINT: Do not write, complete, or output the entire code solution. Provide conceptual guidance, pseudocode, or explanation only.)";
    }

    chatHistory.push({ role: 'user', content: finalPrompt });
    renderChatHistory(container);

    const typingBubble = document.createElement('div');
    typingBubble.className = 'sprint-chat-bubble sprint-chat-typing';
    typingBubble.innerHTML = `<div class="sprint-typing-dots"><span></span><span></span><span></span></div> thinking...`;
    container.appendChild(typingBubble);
    scrollToBottom();

    chrome.runtime.sendMessage({
      type: "API_CHAT",
      message: finalPrompt,
      history: chatHistory.slice(0, -1)
    }, (res) => {
      typingBubble.remove();
      if (res?.success) {
        const replyText = res.data.reply;
        chatHistory.push({ role: 'assistant', content: replyText });
        renderChatHistory(container);
      } else {
        if (res?.authRequired) {
          closeChatModal();
          alert("You need to log in to use AI features!");
          window.open("https://getsprint.me/login", "_blank");
          return;
        }

        let errorMsg = res?.error || "Failed to process chat response.";
        const errorBubble = document.createElement('div');
        errorBubble.className = 'sprint-chat-bubble sprint-chat-error';
        
        // Handles upgrade warning on Limit Reached (429) or Forbidden / Required upgrade (403)
        if (res?.limitReached) {
          errorBubble.innerHTML = `Limit Reached: <a href="https://getsprint.me/payments" target="_blank" style="color:var(--accent); text-decoration:underline; font-weight:700;">Upgrade to Premium</a>`;
        } else if (res?.premiumRequired || errorMsg.includes("403")) {
          errorBubble.innerHTML = `Upgrade Required: Please <a href="https://getsprint.me/payments" target="_blank" style="color:var(--accent); text-decoration:underline; font-weight:700;">Upgrade to Premium ⚡</a> to run this analysis.`;
        } else {
          errorBubble.textContent = errorMsg;
        }
        
        container.appendChild(errorBubble);
        scrollToBottom();
      }
    });
  }

  function renderChatHistory(container) {
    container.innerHTML = '';
    
    if (chatHistory.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.className = 'sprint-chat-placeholder';
      placeholder.innerHTML = `
        <div class="sprint-chat-placeholder-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <p>Ask about algorithms, debug code, or get optimization tips. SprintAI is ready to help.</p>
      `;
      container.appendChild(placeholder);
      return;
    }

    chatHistory.forEach((msg) => {
      const bubble = document.createElement('div');
      bubble.className = `sprint-chat-bubble sprint-chat-${msg.role}`;
      
      if (msg.role === 'assistant') {
        const formatted = formatMessageContent(msg.content);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'sprint-chat-content';
        let rawHtml = formatted.html;
        formatted.placeholders.forEach((placeholder, idx) => {
          rawHtml = rawHtml.replace(`___SPRINT_PLACEHOLDER_${idx}___`, placeholder.html);
        });
        contentDiv.innerHTML = rawHtml;
        bubble.appendChild(contentDiv);

        const copyCodeBtns = contentDiv.querySelectorAll('.sprint-chat-copy-code');
        copyCodeBtns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.getAttribute('data-index'), 10);
            const targetData = formatted.placeholders[index];
            if (targetData) {
              navigator.clipboard.writeText(targetData.code).then(() => {
                btn.textContent = 'Copied!';
                btn.style.color = 'var(--text-success)';
                setTimeout(() => {
                  btn.textContent = 'Copy';
                  btn.style.color = '';
                }, 1500);
              });
            }
          });
        });

        const actionRow = document.createElement('div');
        actionRow.className = 'sprint-chat-bubble-actions';
        const copyAllBtn = document.createElement('button');
        copyAllBtn.className = 'sprint-chat-copy-all-btn';
        copyAllBtn.innerHTML = `
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copy Message</span>
        `;
        copyAllBtn.addEventListener('click', () => {
          navigator.clipboard.writeText(msg.content).then(() => {
            const label = copyAllBtn.querySelector('span');
            label.textContent = 'Copied!';
            setTimeout(() => { label.textContent = 'Copy Message'; }, 1500);
          });
        });
        actionRow.appendChild(copyAllBtn);
        bubble.appendChild(actionRow);
      } else {
        const p = document.createElement('p');
        p.style.whiteSpace = 'pre-wrap';
        p.textContent = msg.content;
        bubble.appendChild(p);
      }

      container.appendChild(bubble);
    });

    scrollToBottom();
  }

  function scrollToBottom() {
    const body = shadow.getElementById('sprint-chat-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  function performComplexityAnalysis(forcedCode = null) {
    const code = forcedCode || getDeepSelection();
    if (!code) {
      createNoSelectionWarning();
      return;
    }

    const toast = createToast("Complexity Analysis", "Analyzing selection...", "...", "...", false, false);

    chrome.runtime.sendMessage({ type: "API_COMPLEXITY", code }, (res) => {
      if (res?.authRequired) {
        if (toast) toast.remove();
        alert("You need to log in to use AI features!");
        window.open("https://getsprint.me/login", "_blank");
        return;
      }

      if (!toast) return;

      const timeSpan = toast.querySelector('.complexity-container .complexity-item:nth-child(1) .complexity-value');
      const spaceSpan = toast.querySelector('.complexity-container .complexity-item:nth-child(2) .complexity-value');
      const statusDiv = toast.querySelector('.complexity-status');

      if (res?.success) {
        timeSpan.textContent = res.data.time || 'N/A';
        spaceSpan.textContent = res.data.space || 'N/A';
        statusDiv.textContent = 'Analysis Complete';
        statusDiv.style.color = 'var(--text-success)';
      } else {
        // Formats upgrade warnings user friendly, offering clean redirects on 403 blocks
        if (res?.premiumRequired || res?.error?.includes("403")) {
          timeSpan.textContent = 'Err';
          spaceSpan.textContent = 'Err';
          statusDiv.innerHTML = `Upgrade Required: <a href="https://getsprint.me/payments" target="_blank" style="color: var(--accent); text-decoration: underline; font-weight:600;">Upgrade Now</a>`;
          statusDiv.style.color = 'var(--text-warning)';
        } else {
          timeSpan.textContent = 'Err';
          spaceSpan.textContent = 'Err';
          statusDiv.textContent = res?.error || 'Analysis Failed';
          statusDiv.style.color = 'var(--text-warning)';
        }
      }

      finalizeToast(toast);
    });
  }

  function performBugCheck(forcedCode = null) {
    const code = forcedCode || getDeepSelection();
    if (!code) {
      createNoSelectionWarning();
      return;
    }

    openBugModal("Analyzing Code Logic...", "Consulting AI model to scan for anomalies...");

    chrome.runtime.sendMessage({
      type: "API_FIND_BUG",
      code,
      problemTitle: document.title,
      problemContext: `Host context: ${window.location.hostname}`
    }, (res) => {
      if (res?.authRequired) {
        closeBugModal();
        alert("You need to log in to use AI features!");
        window.open("https://getsprint.me/login", "_blank");
        return;
      }

      const titleEl = shadow.getElementById('wrong-title');
      const container = shadow.getElementById('wrong-feedback-container');
      if (!container || !titleEl) return;

      container.innerHTML = '';

      if (res?.success) {
        titleEl.textContent = 'Issue Found';
        titleEl.style.color = '#b56363';
        
        const rawText = (res.data.feedback || "No major logical issues found.").trim();
        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        
        lines.forEach((line) => {
          const p = document.createElement('p');
          p.style.marginBottom = '10px';
          p.style.color = '#a1a1aa';
          
          if (line.startsWith('-')) {
            p.textContent = `• ${line.substring(1).trim()}`;
          } else {
            p.textContent = line;
          }
          container.appendChild(p);
        });
      } else {
        // Friendly visual representation for 403 Premium Required blocks inside bugs Modal
        if (res?.premiumRequired || res?.error?.includes("403")) {
          titleEl.textContent = 'Upgrade Required';
          titleEl.style.color = 'var(--accent)';
          
          const p = document.createElement('p');
          p.innerHTML = `This feature requires a premium account. Please <a href="https://getsprint.me/payments" target="_blank" style="color: var(--accent); text-decoration: underline; font-weight: 600;">Upgrade to Premium ⚡</a> to scan for bugs.`;
          container.appendChild(p);
        } else {
          titleEl.textContent = 'Analysis Failed';
          titleEl.style.color = '#f87171';
          
          const p = document.createElement('p');
          p.textContent = res?.error || "Could not reach analysis model.";
          container.appendChild(p);
        }
      }
    });
  }

  // Drag Physics inside Window boundaries
  let isDragging = false;
  let startY = 0;
  let startX = 0;
  let startBottom = 24;
  let startRight = 24;
  let hoverTimeout = null;

  const showPanel = () => {
    if (isDragging) return;
    clearTimeout(hoverTimeout);
    
    const s = shadow.getElementById('sprint-sphere');
    if (s && !s.classList.contains('sprint-companion-hidden')) {
      actionPanel.classList.add('visible');
    }
  };

  const hidePanel = () => {
    hoverTimeout = setTimeout(() => {
      actionPanel.classList.remove('visible');
    }, 250);
  };

  sphere.addEventListener('mouseenter', showPanel);
  sphere.addEventListener('mouseleave', hidePanel);
  actionPanel.addEventListener('mouseenter', showPanel);
  actionPanel.addEventListener('mouseleave', hidePanel);

  sphere.addEventListener('pointerdown', (e) => {
    isDragging = false;
    startY = e.clientY;
    startX = e.clientX;
    const computed = window.getComputedStyle(sphere);
    startBottom = parseInt(computed.bottom) || 24;
    startRight = parseInt(computed.right) || 24;
    sphere.setPointerCapture(e.pointerId);
  });

  sphere.addEventListener('pointermove', (e) => {
    if (e.buttons !== 1) return;
    const deltaY = startY - e.clientY; 
    const deltaX = startX - e.clientX;

    if (Math.abs(deltaY) > 6 || Math.abs(deltaX) > 6) {
      isDragging = true;
      actionPanel.classList.remove('visible');
      
      const computedRight = startRight + deltaX;
      const computedBottom = startBottom + deltaY;
      
      const boundedRight = Math.max(10, Math.min(window.innerWidth - 60, computedRight));
      const boundedBottom = Math.max(10, Math.min(window.innerHeight - 60, computedBottom));

      sphere.style.right = `${boundedRight}px`;
      sphere.style.bottom = `${boundedBottom}px`;
      
      actionPanel.style.right = `${boundedRight}px`;
      actionPanel.style.bottom = `${boundedBottom + 48}px`;
    }
  });

  sphere.addEventListener('pointerup', (e) => {
    sphere.releasePointerCapture(e.pointerId);
    if (!isDragging) {
      actionPanel.classList.add('visible');
    }
    setTimeout(() => { isDragging = false; }, 50);
  });

  sphereCloseBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });

  sphereCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    chrome.storage.local.get('options', (res) => {
      const currentOpts = res.options || [];
      const updated = currentOpts.map(o => {
        return o.optionName === 'showSphere' ? { optionName: 'showSphere', checked: false } : o;
      });
      chrome.storage.local.set({ options: updated }, () => {
        applyShowSphereOption(updated);
        chrome.runtime.sendMessage({ action: 'applyVisibilityOptions', options: updated });
      });
    });
  });

  shadow.getElementById('btn-complexity').addEventListener('click', () => {
    checkAuthAndRun(() => {
      performComplexityAnalysis();
    });
    actionPanel.classList.remove('visible');
  });

  shadow.getElementById('btn-bug').addEventListener('click', () => {
    checkAuthAndRun(() => {
      const modalContainer = shadow.getElementById('sprint-custom-overlay');
      if (modalContainer) {
        closeBugModal();
      } else {
        performBugCheck();
      }
    });
    actionPanel.classList.remove('visible');
  });

  shadow.getElementById('btn-chat').addEventListener('click', () => {
    checkAuthAndRun(() => {
      const modalContainer = shadow.getElementById('sprint-chat-overlay');
      if (modalContainer) {
        closeChatModal();
      } else {
        openChatModal();
      }
    });
    actionPanel.classList.remove('visible');
  });

  function applyShowSphereOption(options) {
    const showSphereOpt = options?.find(o => o.optionName === 'showSphere');
    const show = showSphereOpt ? showSphereOpt.checked : true;
    const s = shadow.getElementById('sprint-sphere');
    const p = shadow.getElementById('sprint-vertical-panel');
    if (s && p) {
      if (show) {
        s.classList.remove('sprint-companion-hidden');
      } else {
        s.classList.add('sprint-companion-hidden');
        p.classList.remove('visible');
      }
    }
  }

  chrome.storage.local.get('options', (res) => {
    applyShowSphereOption(res?.options);
  });

  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "applyVisibilityOptions") {
      applyShowSphereOption(request.options);
    }
    if (request.type === "TRIGGER_ACTION") {
      const code = request.code || getDeepSelection();
      
      checkAuthAndRun(() => {
        if (request.action === "complexity") {
          const activeToasts = toastContainer.querySelectorAll('.sprint-toast');
          if (activeToasts.length > 0) {
            activeToasts.forEach(t => {
              t.classList.add('slide-out');
              setTimeout(() => t.remove(), 300);
            });
          } else {
            performComplexityAnalysis(code);
          }
        } 
        else if (request.action === "bug") {
          const modalContainer = shadow.getElementById('sprint-custom-overlay');
          if (modalContainer) {
            closeBugModal();
          } else {
            performBugCheck(code);
          }
        }
        else if (request.action === "chat") {
          const chatOverlay = shadow.getElementById('sprint-chat-overlay');
          if (chatOverlay) {
            closeChatModal();
          } else {
            openChatModal();
          }
        }
      });
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.options) {
      applyShowSphereOption(changes.options.newValue);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBugModal();
      closeChatModal();
      removeSelectionPopupEl();
      actionPanel.classList.remove('visible');
      const toasts = toastContainer.querySelectorAll('.sprint-toast');
      toasts.forEach(t => {
        t.classList.add('slide-out');
        setTimeout(() => t.remove(), 300);
      });
      return;
    }

    const isCmdX = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyX';
    const isCmdZ = (e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyZ';
    const isAltQ = e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyQ';

    if (isCmdX || isCmdZ || isAltQ) {
      e.preventDefault();
      e.stopPropagation();

      const selection = getDeepSelection();

      checkAuthAndRun(() => {
        if (isCmdX) {
          const activeToasts = toastContainer.querySelectorAll('.sprint-toast');
          if (activeToasts.length > 0) {
            activeToasts.forEach(t => {
              t.classList.add('slide-out');
              setTimeout(() => t.remove(), 300);
            });
          } else {
            performComplexityAnalysis(selection);
          }
        }

        if (isCmdZ) {
          const modalContainer = shadow.getElementById('sprint-custom-overlay');
          if (modalContainer) {
            closeBugModal();
          } else {
            performBugCheck(selection);
          }
        }

        if (isAltQ) {
          const chatOverlay = shadow.getElementById('sprint-chat-overlay');
          if (chatOverlay) {
            closeChatModal();
          } else {
            openChatModal();
          }
        }
      });
    }
  }, true);

})();