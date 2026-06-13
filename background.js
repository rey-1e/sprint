// Register right-click context menu options
chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "sprintComplexityContext",
      title: "Sprint: Analyze Complexity (Ctrl+Shift+X)",
      contexts: ["selection"],
      documentUrlPatterns: ["<all_urls>"]
    });
    chrome.contextMenus.create({
      id: "sprintBugContext",
      title: "Sprint: Find My Bug (Ctrl+Shift+Z)",
      contexts: ["selection"],
      documentUrlPatterns: ["<all_urls>"]
    });
  });

  if (details.reason === "update") {
    chrome.tabs.create({ url: "https://getsprint.me/updated" });
  }
});

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "sprintComplexityContext") {
    chrome.tabs.sendMessage(tab.id, { 
      type: "TRIGGER_ACTION", 
      action: "complexity", 
      code: info.selectionText 
    });
  } else if (info.menuItemId === "sprintBugContext") {
    chrome.tabs.sendMessage(tab.id, { 
      type: "TRIGGER_ACTION", 
      action: "bug", 
      code: info.selectionText 
    });
  }
});

// Listener for global keyboard commands
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tabId = tabs[0].id;
    if (command === "analyze-complexity") {
      chrome.tabs.sendMessage(tabId, { type: "TRIGGER_ACTION", action: "complexity" });
    } else if (command === "analyze-bug") {
      chrome.tabs.sendMessage(tabId, { type: "TRIGGER_ACTION", action: "bug" });
    }
  });
});

function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (res) => {
      resolve(res.authToken || "");
    });
  });
}

// Unified API request runner with adaptive credential sync and limits enforcement
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

// LeetCode problems list cache definitions
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

// Global runtime message router
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_QUESTION_ID") {
    getQuestionId(request.slug).then(questionId => {
      sendResponse({ questionId });
    });
    return true;
  }

  // Merged Complexity channels
  if (request.type === "FETCH_COMPLEXITY" || request.type === "API_COMPLEXITY") {
    handleFetchRequest(
      'https://analyze-i6ptizncma-uc.a.run.app',
      { code: request.code },
      sendResponse
    );
    return true;
  }

  // LeetCode submission analyzer channel
  if (request.type === "FETCH_DETAILED_ANALYSIS") {
    handleFetchRequest(
      'https://analyzedetailed-i6ptizncma-uc.a.run.app',
      { code: request.code },
      sendResponse
    );
    return true;
  }

  // Merged logical debugger analysis channels
  if (request.type === "FETCH_WHERE_AM_I_WRONG" || request.type === "API_FIND_BUG") {
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

  // Custom Theme dynamic loader channel
  if (request.type === "FETCH_THEME") {
    handleFetchRequest(
      'https://gettheme-i6ptizncma-uc.a.run.app',
      { themeName: request.theme },
      sendResponse
    );
    return true;
  }
});