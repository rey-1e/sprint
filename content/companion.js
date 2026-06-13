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

  // 2. Inject Stylesheet from package resources inside the Shadow root
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
  sphere.innerHTML = '⚡';

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

  // 4. Recursive selection reader (Traverses shadow root layers)
  function getDeepSelection() {
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

  // 5. Toast alerts
  function createToast(title, statusMessage, timeValue = "—", spaceValue = "—", isError = false, optLink = null) {
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
        <div class="complexity-status" style="${isError ? 'color: var(--text-warning);' : ''}"></div>
      </div>
      <div class="sprint-toast-progress-bar"></div>
    `;

    const statusContainer = toast.querySelector('.complexity-status');
    if (optLink) {
      const link = document.createElement('a');
      link.href = optLink.url;
      link.target = '_blank';
      link.style.cssText = 'color:#a1a1aa; font-weight:600; text-decoration:underline; pointer-events:auto;';
      link.textContent = optLink.text;
      statusContainer.appendChild(link);
    } else {
      statusContainer.textContent = statusMessage;
    }

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
          <span style="font-weight: 600; font-family: var(--font-google); color: var(--text-warning);">You should select code.</span>
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

  // 6. Original floating Debugger Modal window components
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
    closeBugModal(); // Close existing instances if open

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

  // 7. Action handlers
  function performComplexityAnalysis(forcedCode = null) {
    const code = forcedCode || getDeepSelection();
    if (!code) {
      createNoSelectionWarning();
      return;
    }

    createToast("Complexity Analysis", "Analyzing selection...", "...", "...");

    chrome.runtime.sendMessage({ type: "API_COMPLEXITY", code }, (res) => {
      const toasts = toastContainer.querySelectorAll('.sprint-toast');
      const activeToast = toasts[toasts.length - 1];
      if (!activeToast) return;

      const timeSpan = activeToast.querySelector('.complexity-container .complexity-item:nth-child(1) .complexity-value');
      const spaceSpan = activeToast.querySelector('.complexity-container .complexity-item:nth-child(2) .complexity-value');
      const statusDiv = activeToast.querySelector('.complexity-status');

      if (res?.success) {
        timeSpan.textContent = res.data.time || 'N/A';
        spaceSpan.textContent = res.data.space || 'N/A';
        statusDiv.textContent = 'Analysis Complete';
        statusDiv.style.color = 'var(--text-success)';
      } else {
        timeSpan.textContent = 'Err';
        spaceSpan.textContent = 'Err';
        statusDiv.style.color = 'var(--text-warning)';
        
        if (res?.authRequired) {
          statusDiv.textContent = '';
          const link = document.createElement('a');
          link.href = 'https://getsprint.me/login';
          link.target = '_blank';
          link.style.cssText = 'color:#a1a1aa; font-weight:600; text-decoration:underline; pointer-events:auto;';
          link.textContent = 'Sign In required';
          statusDiv.appendChild(link);
        } else if (res?.limitReached) {
          statusDiv.textContent = '';
          const link = document.createElement('a');
          link.href = 'https://getsprint.me/payments';
          link.target = '_blank';
          link.style.cssText = 'color:#eff1f680; font-weight:600; text-decoration:underline; pointer-events:auto;';
          link.textContent = 'Upgrade Required';
          statusDiv.appendChild(link);
          alert(res.error);
        } else {
          statusDiv.textContent = res?.error || 'Analysis Failed';
        }
      }
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
      const titleEl = shadow.getElementById('wrong-title');
      const container = shadow.getElementById('wrong-feedback-container');
      if (!container || !titleEl) return;

      container.innerHTML = ''; // Clear status wrapper

      if (res?.success) {
        if (res.authRequired || res.data?.authRequired) {
          titleEl.textContent = 'Sign In Required';
          titleEl.style.color = '#e0a96d';
          
          const p = document.createElement('p');
          p.textContent = 'You must be logged in to use the AI Debugger.';
          
          const link = document.createElement('a');
          link.href = 'https://getsprint.me/login';
          link.target = '_blank';
          link.style.cssText = 'color:#cd5c5c; font-weight:600; text-decoration:underline; display:block; margin-top:12px; pointer-events:auto;';
          link.textContent = 'Click here to Sign In';
          
          container.appendChild(p);
          container.appendChild(link);
          return;
        }

        const rawText = (res.data.feedback || "No major logical issues found.").trim();
        const cleanText = rawText.toLowerCase().replace(/[^a-z]/g, '');
        const isClean = cleanText === "therearenoerrors" || rawText.toLowerCase().includes("there are no errors") || (!rawText.includes("-") && rawText.length < 35);

        if (isClean) {
          titleEl.textContent = 'No Issues Found';
          titleEl.style.color = '#6eda30';
          const p = document.createElement('p');
          p.textContent = 'There are no errors.';
          p.style.color = 'var(--text-success)';
          container.appendChild(p);
        } else {
          titleEl.textContent = 'Issue Found';
          titleEl.style.color = '#b56363';
          
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
          link.style.cssText = 'color:#cd5c5c; font-weight:600; text-decoration:underline; display:block; margin-top:12px; pointer-events:auto;';
          link.textContent = 'Click here to Sign In';
          container.appendChild(p);
          container.appendChild(link);
        } else if (res?.limitReached) {
          closeBugModal();
          alert(res.error);
          window.open('https://getsprint.me/payments', '_blank');
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

  // 8. Hover-to-Expand Physics with drag fallback checks
  let isDragging = false;
  let startY = 0;
  let startX = 0;
  let startBottom = 24;
  let startRight = 24;
  let hoverTimeout = null;

  const showPanel = () => {
    if (isDragging) return;
    clearTimeout(hoverTimeout);
    actionPanel.classList.add('visible');
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
      
      actionPanel.style.right = `${boundedRight + 6}px`;
      actionPanel.style.bottom = `${boundedBottom + 60}px`;
    }
  });

  sphere.addEventListener('pointerup', (e) => {
    sphere.releasePointerCapture(e.pointerId);
    if (!isDragging) {
      actionPanel.classList.add('visible');
    }
    setTimeout(() => { isDragging = false; }, 50);
  });

  // Action Panel Bindings
  shadow.getElementById('btn-complexity').addEventListener('click', () => {
    performComplexityAnalysis();
    actionPanel.classList.remove('visible');
  });

  shadow.getElementById('btn-bug').addEventListener('click', () => {
    const modalContainer = shadow.getElementById('sprint-custom-overlay');
    if (modalContainer) {
      closeBugModal();
    } else {
      performBugCheck();
    }
    actionPanel.classList.remove('visible');
  });

  // 9. Communication channels for right-clicks
  chrome.runtime.onMessage.addListener((request) => {
    if (request.type === "TRIGGER_ACTION") {
      const code = request.code || getDeepSelection();
      
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
    }
  });

  // 10. Strict Toggle Keyboard Router with AltGr detection & escape hooks
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeBugModal();
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

    if (isCmdX || isCmdZ) {
      e.preventDefault();
      e.stopPropagation();

      const selection = getDeepSelection();

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
    }
  }, true); // Capture phase implementation prevents host site keystroke traps

})();