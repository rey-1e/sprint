const spaceEl = document.getElementById('space');
const timeEl  = document.getElementById('time');
const loader  = document.getElementById('loader');
const instruction = document.getElementById('instruction');

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

async function analyze(code) {
  hide(instruction);
  show(loader);
  spaceEl.textContent = '—';
  timeEl.textContent  = '—';

  const API_KEY = 'YOUR_API_KEY_HERE';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Analyze this code and reply ONLY with JSON like:
{"time":"O(n)","space":"O(1)"}
No markdown, no explanation. Just the JSON.

Code:
${code}`
        }]
      })
    });

    const data = await res.json();
    const parsed = JSON.parse(data.content?.[0]?.text?.trim() || '{}');

    spaceEl.textContent = parsed.space || 'N/A';
    timeEl.textContent  = parsed.time  || 'N/A';
  } catch {
    spaceEl.textContent = 'Err';
    timeEl.textContent  = 'Err';
  } finally {
    hide(loader);
  }
}

chrome.storage.session.get('selectedText', ({ selectedText }) => {
  if (selectedText) {
    analyze(selectedText);
    chrome.storage.session.remove('selectedText');
  }
});