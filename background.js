chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeCodeWithSprint",
      title: "Analyse with Sprint",
      contexts: ["all"]
    });
  });

  if (details.reason === "update") {
    chrome.tabs.create({ url: "https://getsprint.me/updated" });
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeCodeWithSprint" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE_SELECTION",
      code: info.selectionText || ""
    });
  }
});

function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (res) => {
      resolve(res.authToken || "");
    });
  });
}

/**
 * Normalizes error payloads and API handling so that content scripts receive structured responses.
 */
async function handleFetchRequest(url, bodyData, sendResponse) {
  try {
    const token = await getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      'X-Client-Version': '3.0'
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(bodyData)
    });

    const data = await res.json();

    if (!res.ok) {
      if (res.status === 401) {
        sendResponse({ success: false, authRequired: true, error: data.message || "Sign in required." });
        return;
      }
      if (data.error === "LIMIT_REACHED") {
        sendResponse({ success: false, limitReached: true, error: data.message });
        return;
      }
      throw new Error(data.message || `Server error ${res.status}`);
    }

    if (data.authRequired) {
      sendResponse({ success: false, authRequired: true, error: "Sign in required." });
      return;
    }

    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

/**
 * Heavy computation database query moved to service worker thread
 */
let allProblemsCache = null;
let allProblemsCacheTime = 0;

async function fetchAllProblems() {
  const now = Date.now();
  if (allProblemsCache && (now - allProblemsCacheTime < 86400000)) {
    return allProblemsCache;
  }
  const localData = await chrome.storage.local.get(['all_problems_cache', 'all_problems_cache_time']);
  if (localData.all_problems_cache && localData.all_problems_cache_time && (now - localData.all_problems_cache_time < 86400000)) {
    allProblemsCache = localData.all_problems_cache;
    allProblemsCacheTime = localData.all_problems_cache_time;
    return allProblemsCache;
  }
  try {
    const res = await fetch('https://leetcode.com/api/problems/all/');
    const data = await res.json();
    const problems = data.stat_status_pairs || [];
    await chrome.storage.local.set({
      all_problems_cache: problems,
      all_problems_cache_time: now
    });
    allProblemsCache = problems;
    allProblemsCacheTime = now;
    return problems;
  } catch (e) {
    console.error("Sprint background: API lookup error", e);
    return localData.all_problems_cache || [];
  }
}

async function getQuestionId(slug) {
  const CACHE_KEY = `sprint_id_${slug}`;
  const cached = await chrome.storage.local.get([CACHE_KEY]);
  if (cached[CACHE_KEY]) return cached[CACHE_KEY];

  const problems = await fetchAllProblems();
  const targetProb = problems.find(p => p.stat.question__title_slug === slug);
  const questionId = targetProb ? targetProb.stat.question_id.toString() : null;
  if (questionId) {
    await chrome.storage.local.set({ [CACHE_KEY]: questionId });
  }
  return questionId;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_QUESTION_ID") {
    getQuestionId(request.slug).then(questionId => {
      sendResponse({ questionId });
    });
    return true; // keeps the channel active for async reply
  }

  if (request.type === "FETCH_COMPLEXITY") {
    handleFetchRequest(
      'https://analyze-i6ptizncma-uc.a.run.app',
      { code: request.code },
      sendResponse
    );
    return true;
  }

  if (request.type === "FETCH_DETAILED_ANALYSIS") {
    handleFetchRequest(
      'https://analyzedetailed-i6ptizncma-uc.a.run.app',
      { code: request.code },
      sendResponse
    );
    return true;
  }

  if (request.type === "FETCH_WHERE_AM_I_WRONG") {
    handleFetchRequest(
      'https://findmybug-i6ptizncma-uc.a.run.app',
      {
        code: request.code,
        problemTitle: request.problemTitle,
        problemContext: request.problemContext
      },
      sendResponse
    );
    return true;
  }
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    if (command === "analyze-complexity") {
      chrome.tabs.sendMessage(tabs[0].id, { type: "ANALYZE_SELECTION", code: "" });
    }

    if (command === "analyze-bug") {
      chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_WHERE_AM_I_WRONG" });
    }
  });
});