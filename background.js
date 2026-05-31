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

// Listener to securely receive Auth Tokens from your getsprint.me website
chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (request.type === "SET_AUTH_TOKEN") {
    chrome.storage.local.set({ authToken: request.token }, () => {
      sendResponse({ success: true, message: "Sprint auth synchronized." });
    });
    return true; 
  }
});

// Helper function to read the stored auth token
function getAuthToken() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['authToken'], (res) => {
      resolve(res.authToken || "");
    });
  });
}

// Proxied secure API call helper with injected authentication headers
async function handleFetchRequest(url, bodyData, sendResponse) {
  try {
    const token = await getAuthToken();
    const headers = { 'Content-Type': 'application/json' };

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
      if (data.error === "LIMIT_REACHED") {
        sendResponse({ success: false, limitReached: true, error: data.message });
        return;
      }
      throw new Error(data.message || `Server error ${res.status}`);
    }
    
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "FETCH_COMPLEXITY") {
    handleFetchRequest('https://analyze-i6ptizncma-uc.a.run.app', { code: request.code }, sendResponse);
    return true; 
  }

  if (request.type === "FETCH_DETAILED_ANALYSIS") {
    handleFetchRequest('https://analyzedetailed-i6ptizncma-uc.a.run.app', { code: request.code }, sendResponse);
    return true; 
  }

  if (request.type === "FETCH_WHERE_AM_I_WRONG") {
    handleFetchRequest('https://findmybug-i6ptizncma-uc.a.run.app', { 
      code: request.code,
      problemTitle: request.problemTitle,
      problemContext: request.problemContext
    }, sendResponse);
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