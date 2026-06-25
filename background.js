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
    const storage = await chrome.storage.local.get(['authToken', 'isPremium']);
    const token = storage.authToken || "";
    const isPremium = storage.isPremium === true || storage.isPremium === 'true';

    if (requiresAuth && !token) {
      sendResponse({ success: false, authRequired: true, error: "Authentication required. Please log in." });
      return;
    }

    const headers = {
      'Content-Type': 'application/json',
      'X-Client-Version': '3.0'
    };

    if (token && (requiresAuth || isPremium)) {
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

async function checkLimitAndRun(featureKey, limitVal, sendResponse, callback) {
  try {
    const storage = await chrome.storage.local.get(['isPremium', 'usageLimits']);
    const isPremium = storage.isPremium === true || storage.isPremium === 'true';

    if (isPremium) {
      callback(sendResponse);
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    let usageLimits = storage.usageLimits || {};
    
    if (!usageLimits[featureKey] || usageLimits[featureKey].date !== today) {
      usageLimits[featureKey] = {
        count: 0,
        date: today
      };
    }

    if (usageLimits[featureKey].count >= limitVal) {
      sendResponse({ success: false, limitReached: true, error: "Daily usage limits reached. Click here to upgrade at getsprint.me/payments." });
      return;
    }

    const wrappedSendResponse = async (response) => {
      if (response && response.success) {
        usageLimits[featureKey].count += 1;
        await chrome.storage.local.set({ usageLimits });
      } else if (response && (response.limitReached || response.premiumRequired || response.error?.includes("403") || response.error?.toLowerCase().includes("limit"))) {
        usageLimits[featureKey].count = limitVal;
        usageLimits[featureKey].date = today;
        await chrome.storage.local.set({ usageLimits });
      }
      sendResponse(response);
    };

    callback(wrappedSendResponse);
  } catch (err) {
    console.error("Sprint limit check error:", err);
    callback(sendResponse);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "API_COMPLEXINGS") {
    checkLimitAndRun("complexity", 15, sendResponse, (wrappedResponse) => {
      handleApiRequest('https://analyze-i6ptizncma-uc.a.run.app', { code: request.code }, wrappedResponse, true);
    });
    return true; 
  }
  if (request.type === "API_COMPLEXITY") {
    checkLimitAndRun("complexity", 15, sendResponse, (wrappedResponse) => {
      handleApiRequest('https://analyze-i6ptizncma-uc.a.run.app', { code: request.code }, wrappedResponse, true);
    });
    return true; 
  }
  if (request.type === "API_FIND_BUG") {
    checkLimitAndRun("bug", 7, sendResponse, (wrappedResponse) => {
      handleApiRequest('https://findmybug-i6ptizncma-uc.a.run.app', {
        code: request.code,
        problemTitle: request.problemTitle,
        problemContext: request.problemContext
      }, wrappedResponse, true);
    });
    return true;
  }
  if (request.type === "API_CHAT") {
    checkLimitAndRun("chat", 10, sendResponse, (wrappedResponse) => {
      handleApiRequest('https://sprintaichat-i6ptizncma-uc.a.run.app', {
        message: request.message,
        history: request.history
      }, wrappedResponse, true);
    });
    return true;
  }
  if (request.type === "FETCH_THEME") {
    handleApiRequest('https://gettheme-i6ptizncma-uc.a.run.app', {
      themeName: request.theme
    }, sendResponse, false);
    return true;
  }
  if (request.type === "FETCH_CF_THEME") {
    handleApiRequest('https://us-central1-sprint-87863.cloudfunctions.net/getCodeforcesTheme', {
      themeName: request.theme
    }, sendResponse, false);
    return true;
  }
  if (request.type === "FETCH_DETAILED_ANALYSIS") {
    handleApiRequest('https://analyzedetailed-i6ptizncma-uc.a.run.app', {
      code: request.code
    }, sendResponse, false);
    return true;
  }
  if (request.type === "SYNC_USER") {
    handleApiRequest('https://syncuser-i6ptizncma-uc.a.run.app', {}, sendResponse, true);
    return true;
  }
  if (request.type === "GET_QUESTION_ID") {
    fetch(chrome.runtime.getURL('content/leetcode/ratings.json'))
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