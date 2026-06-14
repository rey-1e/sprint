chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "https://getsprint.me/installed" });
  } else if (details.reason === "update") {
    chrome.tabs.create({ url: "https://getsprint.me/updated" });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "sprintComplexityContext",
      title: "Sprint: Analyze Complexity (Ctrl+Shift+X)",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "sprintBugContext",
      title: "Sprint: Find My Bug (Ctrl+Shift+Z)",
      contexts: ["selection"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "sprintComplexityContext") {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ACTION", action: "complexity", code: info.selectionText });
  } else if (info.menuItemId === "sprintBugContext") {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ACTION", action: "bug", code: info.selectionText });
  }
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    const tabId = tabs[0].id;
    if (command === "analyze-complexity") {
      chrome.tabs.sendMessage(tabId, { type: "TRIGGER_ACTION", action: "complexity" });
    } else if (command === "analyze-bug") {
      chrome.tabs.sendMessage(tabId, { type: "TRIGGER_ACTION", action: "bug" });
    } else if (command === "toggle-chat") {
      chrome.tabs.sendMessage(tabId, { type: "TRIGGER_ACTION", action: "chat" });
    }
  });
});

async function handleApiRequest(url, payload, sendResponse, requiresAuth = false) {
  try {
    const storage = await chrome.storage.local.get(['authToken']);
    const token = storage.authToken || "";

    if (requiresAuth && !token) {
      sendResponse({ success: false, authRequired: true, error: "Authentication required. Please log in." });
      return;
    }

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
      body: JSON.stringify(payload)
    });

    const data = res.ok ? await res.json() : null;
    if (!res.ok) {
      if (res.status === 401) {
        sendResponse({ success: false, authRequired: true, error: data?.message || "Sign in required." });
        return;
      }
      if (res.status === 403) {
        sendResponse({ success: false, premiumRequired: true, error: data?.message || "Premium upgrade required." });
        return;
      }
      if (data && data.error === "LIMIT_REACHED") {
        sendResponse({ success: false, limitReached: true, error: data.message });
        return;
      }
      sendResponse({ success: false, error: data?.message || `Server error: ${res.status}` });
      return;
    }
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: `Connection failed: ${err.message}` });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "API_COMPLEXINGS") {
    handleApiRequest('https://analyze-i6ptizncma-uc.a.run.app', { code: request.code }, sendResponse, true);
    return true; 
  }
  if (request.type === "API_COMPLEXITY") {
    handleApiRequest('https://analyze-i6ptizncma-uc.a.run.app', { code: request.code }, sendResponse, true);
    return true; 
  }
  if (request.type === "API_FIND_BUG") {
    handleApiRequest('https://findmybug-i6ptizncma-uc.a.run.app', {
      code: request.code,
      problemTitle: request.problemTitle,
      problemContext: request.problemContext
    }, sendResponse, true);
    return true;
  }
  if (request.type === "API_CHAT") {
    handleApiRequest('https://us-central1-sprint-87863.cloudfunctions.net/sprintAIChat', {
      message: request.message,
      history: request.history
    }, sendResponse, true);
    return true;
  }
  if (request.type === "FETCH_THEME") {
    handleApiRequest('https://us-central1-sprint-87863.cloudfunctions.net/getTheme', {
      themeName: request.theme
    }, sendResponse, false);
    return true;
  }
  if (request.type === "FETCH_DETAILED_ANALYSIS") {
    handleApiRequest('https://us-central1-sprint-87863.cloudfunctions.net/fetchDetailedAnalysis', {
      code: request.code
    }, sendResponse, true);
    return true;
  }
  if (request.type === "SYNC_USER") {
    handleApiRequest('https://us-central1-sprint-87863.cloudfunctions.net/syncUser', {}, sendResponse, true);
    return true;
  }
  if (request.type === "GET_QUESTION_ID") {
    fetch(chrome.runtime.getURL('ratings.json'))
      .then(res => res.json())
      .then(data => {
        const matched = data.find(p => p.TitleSlug === request.slug);
        sendResponse({ questionId: matched?.ID || matched?.QuestionId || null });
      })
      .catch(err => {
        console.error("Sprint ratings lookup error:", err);
        sendResponse({ questionId: null });
      });
    return true;
  }
});