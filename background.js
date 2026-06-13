// Register right-click context menu options
chrome.runtime.onInstalled.addListener(() => {
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

// Listener for context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "sprintComplexityContext") {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ACTION", action: "complexity", code: info.selectionText });
  } else if (info.menuItemId === "sprintBugContext") {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_ACTION", action: "bug", code: info.selectionText });
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

// Production API request runner with adaptive credential sync
async function handleApiRequest(url, payload, sendResponse) {
  try {
    const storage = await chrome.storage.local.get(['authToken']);
    const token = storage.authToken || "";

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
      sendResponse({ success: false, error: data.message || `Server error: ${res.status}` });
      return;
    }
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: `Connection failed: ${err.message}` });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "API_COMPLEXITY") {
    handleApiRequest('https://analyze-i6ptizncma-uc.a.run.app', { code: request.code }, sendResponse);
    return true; 
  }
  if (request.type === "API_FIND_BUG") {
    handleApiRequest('https://findmybug-i6ptizncma-uc.a.run.app', {
      code: request.code,
      problemTitle: request.problemTitle,
      problemContext: request.problemContext
    }, sendResponse);
    return true;
  }
  if (request.type === "API_CHAT") {
    handleApiRequest('https://us-central1-sprint-87863.cloudfunctions.net/sprintAIChat', {
      message: request.message,
      history: request.history
    }, sendResponse);
    return true;
  }
});