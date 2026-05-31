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
 * FIX: Normalize all error shapes so content.js receives a consistent flat structure.
 *
 * Previously, the server returned { authRequired: true } inside data, but content.js
 * checked response.authRequired (flat) for complexity and response.data.authRequired
 * (nested) for the bug finder — causing the auth error to silently fail in the debugger.
 *
 * Now all responses are flat: { success, authRequired, limitReached, error, data }
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
        // FIX: Flat authRequired flag — content.js reads response.authRequired directly
        sendResponse({ success: false, authRequired: true, error: data.message || "Sign in required." });
        return;
      }
      if (data.error === "LIMIT_REACHED") {
        // FIX: Flat limitReached flag
        sendResponse({ success: false, limitReached: true, error: data.message });
        return;
      }
      throw new Error(data.message || `Server error ${res.status}`);
    }

    // FIX: Also check for authRequired embedded inside a 200 response body
    // (the bug finder endpoint returns 200 + { authRequired: true } on auth failure)
    if (data.authRequired) {
      sendResponse({ success: false, authRequired: true, error: "Sign in required." });
      return;
    }

    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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