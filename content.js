/**
 * ==============================================================================
 * SECTION 1: INJECT COMPANY TAGS AND ELO RATING
 * ==============================================================================
 */
let isInjectingTags = false;

async function injectTags() {
    if (document.getElementById('custom-company-tags') || isInjectingTags) return;
    isInjectingTags = true;

    try {
        const urlParts = window.location.pathname.split('/');
        const problemsIndex = urlParts.indexOf('problems');
        if (problemsIndex === -1) return;
        
        const slug = urlParts[problemsIndex + 1];
        if (!slug) return;

        const allProblemsRes = await fetch('/api/problems/all/');
        const allProblemsData = await allProblemsRes.json();
        const problem = allProblemsData.stat_status_pairs.find(p => p.stat.question__title_slug === slug);
        const questionId = problem ? problem.stat.question_id.toString() : null;

        if (!questionId) return;

        const companyDataRes = await fetch(chrome.runtime.getURL('data.json'));
        const companyData = await companyDataRes.json();
        const companies = companyData[questionId] ||[];

        let eloRating = null;
        try {
            const ratingRes = await fetch(chrome.runtime.getURL('ratings.json'));
            const ratingData = await ratingRes.json();
            const problemData = ratingData.find(p => p.TitleSlug === slug);
            if (problemData && problemData.Rating) {
                eloRating = Math.round(problemData.Rating);
            }
        } catch (error) {
            console.error("Sprint: Failed to fetch ratings.json", error);
        }

        let targetElement = document.querySelector('[class*="text-difficulty-"]');
        if (!targetElement) {
            const allDivs = Array.from(document.querySelectorAll('div'));
            targetElement = allDivs.find(el => /^(Easy|Medium|Hard)$/i.test(el.innerText?.trim()));
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
            const uniqueCompanies = [...new Set(companies)].slice(0, 10);
            uniqueCompanies.forEach(name => {
                const capitalizedName = name.charAt(0).toUpperCase() + name.slice(1);
                const span = document.createElement('span');
                span.className = 'company-tag';
                span.textContent = capitalizedName;
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
        console.error("Sprint: Failed to inject tags.", error);
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

    const tabbarInner = targetBar.querySelector('.flexlayout__tabset_tabbar_inner');
    if (tabbarInner && tabbarInner.nextSibling) {
        targetBar.insertBefore(container, tabbarInner.nextSibling);
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
        { type: "FETCH_COMPLEXITY", code: code },
        (response) => {
            if (response && response.success) {
                timeEl.textContent = response.data.time || 'N/A';
                spaceEl.textContent = response.data.space || 'N/A';
                statusEl.textContent = 'Analysis Complete';
                statusEl.className = 'complexity-status sprint-text-success';
            } else {
                console.error("Sprint: Analysis failed.", response?.error);
                timeEl.textContent = 'Err';
                spaceEl.textContent = 'Err';
                statusEl.textContent = 'Analysis Failed';
                statusEl.className = 'complexity-status sprint-text-error';
            }
        }
    );
}

/**
 * ==============================================================================
 * SECTION 3: ACCEPTED SUBMISSION ANALYSIS UI
 * ==============================================================================
 */
function injectSubmissionAnalysisUI() {
    if (document.getElementById('sprint-submission-analysis')) return;

    const targetContainers = document.querySelectorAll('div.flex.w-full.flex-col.gap-2.rounded-lg.border.p-3');
    let targetDiv = null;
    
    for (let div of targetContainers) {
        if (div.innerText.includes('Runtime') || div.innerText.includes('Memory') || div.innerText.includes('Beats')) {
            targetDiv = div;
            break;
        }
    }

    if (!targetDiv) return;

    const container = document.createElement('div');
    container.id = 'sprint-submission-analysis';
    container.className = 'sprint-ai-analysis';

    container.innerHTML = `
        <div class="sprint-ai-topbar">
            <div class="sprint-ai-tabs">
                <span class="sprint-ai-tab active" data-target="tab-approach">✓ Approach</span>
                <span class="sprint-ai-tab" data-target="tab-efficiency">✓ Efficiency</span>
                <span class="sprint-ai-tab" data-target="tab-style">✓ Code Style</span>
            </div>
        </div>
        <div class="sprint-ai-summary sprint-text-info" id="sprint-ai-summary">
            Generating expert AI feedback...
        </div>
        <hr class="sprint-ai-divider"/>
        
        <div class="sprint-ai-content active" id="tab-approach">
            <div class="sprint-ai-section-title">
                <svg class="sprint-ai-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
                Approach
            </div>
            <div class="sprint-ai-grid">
                <div class="sprint-ai-label">Current:</div>
                <div class="sprint-ai-val" id="val-app-curr">...</div>
                <div class="sprint-ai-label">Suggested:</div>
                <div class="sprint-ai-val sprint-text-success" id="val-app-sugg">...</div>
                <div class="sprint-ai-label">Key Idea:</div>
                <div class="sprint-ai-val" id="val-app-idea">...</div>
            </div>
        </div>

        <div class="sprint-ai-content sprint-hidden" id="tab-efficiency">
            <div class="sprint-ai-section-title">
                <svg class="sprint-ai-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
                Efficiency
            </div>
            <div class="sprint-ai-grid">
                <div class="sprint-ai-label">Current complexity:</div>
                <div class="sprint-ai-val" id="val-eff-curr">...</div>
                <div class="sprint-ai-label">Suggested complexity:</div>
                <div class="sprint-ai-val sprint-text-success" id="val-eff-sugg">...</div>
                <div class="sprint-ai-label">Suggestions:</div>
                <div class="sprint-ai-val" id="val-eff-idea">...</div>
            </div>
        </div>

        <div class="sprint-ai-content sprint-hidden" id="tab-style">
            <div class="sprint-ai-section-title">
                <svg class="sprint-ai-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>
                Code Style
            </div>
            <div class="sprint-ai-grid">
                <div class="sprint-ai-label">Readability:</div>
                <div class="sprint-ai-val" id="val-sty-read">...</div>
                <div class="sprint-ai-label">Structure:</div>
                <div class="sprint-ai-val" id="val-sty-struc">...</div>
                <div class="sprint-ai-label">Suggestions:</div>
                <div class="sprint-ai-val" id="val-sty-idea">...</div>
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
            const targetContent = container.querySelector('#' + tab.getAttribute('data-target'));
            targetContent.classList.remove('sprint-hidden');
            targetContent.classList.add('active');
        });
    });

    let codeToAnalyze = "";
    const codeLines = document.querySelectorAll('.view-line');
    if (codeLines.length > 0) {
        codeToAnalyze = Array.from(codeLines).map(line => line.textContent).join('\n');
    }

    const summaryEl = document.getElementById('sprint-ai-summary');

    if (codeToAnalyze.trim() !== "") {
        chrome.runtime.sendMessage(
            { type: "FETCH_DETAILED_ANALYSIS", code: codeToAnalyze },
            (response) => {
                if (response && response.success) {
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
                    summaryEl.textContent = "Analysis failed. Ensure API URL is updated.";
                    summaryEl.className = 'sprint-ai-summary sprint-text-error';
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
                <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Code Debugger</span>
            </div>
            <button id="sprint-close-x" class="sprint-close-x">&times;</button>
        </div>
        
        <div class="sprint-modal-body">
            <h2 id="wrong-title">Analyzing Logic...</h2>
            <p id="wrong-feedback">Sending code to AI...</p>
        </div>
        
        <div class="sprint-modal-footer">
            <button id="sprint-close-btn" class="sprint-btn">Dismiss</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const closeModal = () => {
        if (!document.getElementById('sprint-custom-overlay')) return;
        overlay.classList.add('sprint-fade-out');
        modal.classList.add('sprint-pop-out');
        setTimeout(() => overlay.remove(), 150);
    };

    document.getElementById('sprint-close-x').addEventListener('click', closeModal);
    document.getElementById('sprint-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
    });
}

function injectWhereAmIWrongButton() {
    if (document.getElementById('sprint-wrong-btn')) return;

    const targetBar = document.getElementById('code_tabbar_outer');
    if (!targetBar) return;

    const tabButtons = targetBar.querySelectorAll('.flexlayout__tab_button');
    let codeTabButton = null;

    for (let btn of tabButtons) {
        if (btn.textContent && btn.textContent.includes('Code')) {
            codeTabButton = btn;
            break;
        }
    }

    if (!codeTabButton) return;

    const btn = document.createElement('div');
    btn.id = 'sprint-wrong-btn';
    btn.className = 'sprint-wrong-btn-style';

    btn.innerHTML = `
        <span class="sprint-btn-inner">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        </span>
    `;

    btn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        e.preventDefault();

        let codeToAnalyze = "";
        const codeLines = document.querySelectorAll('.view-line');
        if (codeLines.length > 0) {
            codeToAnalyze = Array.from(codeLines).map(line => line.textContent).join('\n');
        }

        if (!codeToAnalyze || codeToAnalyze.trim() === "") {
            alert("Sprint: Could not find any code. Please type something in the editor.");
            return;
        }

        let problemContext = "Description not found.";
        let problemTitle = document.title.split('-')[0].trim();

        const descElement = document.querySelector('[data-track-load="description_content"]') || document.querySelector('meta[name="description"]');
        if (descElement) {
            problemContext = descElement.innerText || descElement.content;
        } else {
            const urlParts = window.location.pathname.split('/');
            const pIndex = urlParts.indexOf('problems');
            if (pIndex !== -1) problemContext = "LeetCode Problem Slug: " + urlParts[pIndex + 1];
        }

        showWhereAmIWrongPopup();

        chrome.runtime.sendMessage(
            {
                type: "FETCH_WHERE_AM_I_WRONG",
                code: codeToAnalyze,
                problemTitle: problemTitle,
                problemContext: problemContext
            },
            (response) => {
                const titleEl = document.getElementById('wrong-title');
                const feedbackEl = document.getElementById('wrong-feedback');

                if (!feedbackEl) return;

                if (response && response.success) {
                    titleEl.textContent = 'Issue Found:';
                    feedbackEl.textContent = response.data.feedback || "Something is wrong, but AI didn't specify.";
                    feedbackEl.className = 'sprint-text-error';
                } else {
                    titleEl.textContent = 'Analysis Failed';
                    feedbackEl.textContent = response?.error || "Could not reach the server.";
                    feedbackEl.className = 'sprint-text-error';
                }
            }
        );
    });

    codeTabButton.insertAdjacentElement('afterend', btn);
}

/**
 * ==============================================================================
 * SECTION 5: INITIALIZATION AND LISTENERS
 * ==============================================================================
 */
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "ANALYZE_SELECTION") {
        let codeToAnalyze = request.code;

        if (!codeToAnalyze || codeToAnalyze.trim() === "") {
            codeToAnalyze = window.getSelection().toString();
        }

        if (!codeToAnalyze || codeToAnalyze.trim() === "") {
            const codeLines = document.querySelectorAll('.view-line');
            if (codeLines.length > 0) {
                codeToAnalyze = Array.from(codeLines).map(line => line.textContent).join('\n');
            }
        }

        if (codeToAnalyze && codeToAnalyze.trim() !== "") {
            analyzeCode(codeToAnalyze);
            sendResponse({ status: "Analysis started" });
        } else {
            alert("Sprint: Could not find any code. Make sure the code editor is visible.");
            sendResponse({ status: "No code found" });
        }
    }
    return true;
});

// A lightweight observer keeping DOM polling extremely fast and robust.
const observer = new MutationObserver(() => {
    if (!document.getElementById('custom-company-tags')) injectTags();
    if (!document.getElementById('complexity-analyzer-container')) injectComplexityUI();
    if (!document.getElementById('sprint-submission-analysis')) injectSubmissionAnalysisUI();
    if (!document.getElementById('sprint-wrong-btn')) injectWhereAmIWrongButton();
});

observer.observe(document.body, { childList: true, subtree: true });