async function injectTags() {
    const urlParts = window.location.pathname.split('/');
    const slug = urlParts[urlParts.indexOf('problems') + 1];
    
    const id = await fetch(`/api/problems/algorithms/`)
        .then(res => res.json())
        .then(data => {
            const problem = data.stat_status_pairs.find(p => p.stat.question__title_slug === slug);
            return problem ? problem.stat.question_id.toString() : null;
        });

    if (!id) return;

    const response = await fetch(chrome.runtime.getURL('data.json'));
    const companyData = await response.json();
    
    // Check if companies exist for this ID
    const companies = companyData[id] || [];

    // Don't inject if we already have it
    if (document.getElementById('custom-company-tags')) return;

    const chips = Array.from(document.querySelectorAll('.flex.gap-1'));
    const target = chips.find(el => /Easy|Medium|Hard/i.test(el.innerText));
    if (!target) return;

    const container = document.createElement('div');
    container.id = 'custom-company-tags';
    container.className = 'company-tags-wrapper';

    // LOGIC: If companies exist, map them. If not, show "Dataset NULL"
    if (companies.length > 0) {
        companies.slice(0, 5).forEach(name => {
            const span = document.createElement('span');
            span.className = 'company-tag';
            span.textContent = name;
            container.appendChild(span);
        });
    } else {
        const span = document.createElement('span');
        span.className = 'company-tag'; // Uses the same style as regular tags
        span.textContent = 'Dataset NULL';
        span.style.opacity = '0.5'; // Optional: make it look slightly distinct
        container.appendChild(span);
    }

    target.after(container);
}

// Observe URL changes
let lastUrl = location.href;
new MutationObserver(() => {
    if (location.href !== lastUrl) {
        lastUrl = location.href;
        document.getElementById('custom-company-tags')?.remove();
        setTimeout(injectTags, 1000);
    }
}).observe(document.body, { childList: true, subtree: true });

setTimeout(injectTags, 1000);