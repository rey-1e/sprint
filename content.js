/**
 * ==============================================================================
 * SECTION 1: INJECT COMPANY TAGS
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

        let targetElement = document.querySelector('[class*="text-difficulty-"]');
        if (!targetElement) {
            const allDivs = Array.from(document.querySelectorAll('div'));
            targetElement = allDivs.find(el => /^(Easy|Medium|Hard)$/i.test(el.innerText?.trim()));
        }
        
        if (!targetElement) return;
        if (document.getElementById('custom-company-tags')) return;

        const container = document.createElement('div');
        container.id = 'custom-company-tags';
        container.className = 'company-tags-wrapper';

        if (companies.length > 0) {
            const uniqueCompanies =[...new Set(companies)].slice(0, 10);
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
        console.error("Sprint: Failed to inject company tags.", error);
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
    container.innerHTML = `
        <div class="complexity-item">
            <span class="complexity-label">Time:</span>
            <span class="complexity-value" id="time-complexity-value">—</span>
        </div>
        <div class="complexity-item">
            <span class="complexity-label">Space:</span>
            <span class="complexity-value" id="space-complexity-value">—</span>
        </div>
        <div class="complexity-status" id="complexity-status-text">Right-click anywhere to analyze</div>
    `;

    const tabbarInner = targetBar.querySelector('.flexlayout__tabset_tabbar_inner');
    
    if (tabbarInner && tabbarInner.nextSibling) {
        targetBar.insertBefore(container, tabbarInner.nextSibling);
    } else {
        targetBar.appendChild(container);
    }
}

// FIX: Send request to background.js instead of fetching directly from content.js
function analyzeCode(code) {
    injectComplexityUI(); 

    const timeEl = document.getElementById('time-complexity-value');
    const spaceEl = document.getElementById('space-complexity-value');
    const statusEl = document.getElementById('complexity-status-text');

    if (!timeEl || !spaceEl || !statusEl) return;

    timeEl.textContent = '...';
    spaceEl.textContent = '...';
    statusEl.textContent = 'Analyzing...';
    statusEl.style.color = '#f5a623'; 

    chrome.runtime.sendMessage(
        { type: "FETCH_COMPLEXITY", code: code },
        (response) => {
            if (response && response.success) {
                timeEl.textContent = response.data.time || 'N/A';
                spaceEl.textContent = response.data.space || 'N/A';
                statusEl.textContent = 'Analysis Complete';
                statusEl.style.color = '#22a06b'; 
            } else {
                console.error("Sprint: Analysis failed.", response?.error);
                timeEl.textContent = 'Err';
                spaceEl.textContent = 'Err';
                statusEl.textContent = 'Analysis Failed';
                statusEl.style.color = '#ef4444'; 
            }
        }
    );
}

/**
 * ==============================================================================
 * SECTION 3: INITIALIZATION AND LISTENERS
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

const observer = new MutationObserver((mutations, obs) => {
    if (!document.getElementById('custom-company-tags')) injectTags();
    if (!document.getElementById('complexity-analyzer-container')) injectComplexityUI();
});

observer.observe(document.body, { childList: true, subtree: true });