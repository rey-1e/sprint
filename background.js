chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeCodeWithSprint",
      title: "Analyse with Sprint",
      contexts:["all"]
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeCodeWithSprint") {
    chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE_SELECTION",
      code: info.selectionText || ""
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 1. Existing Complexity Handler (Right-click tool)
  if (request.type === "FETCH_COMPLEXITY") {
      fetch('https://analyze-i6ptizncma-uc.a.run.app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: request.code })
      })
      .then(res => {
          if (!res.ok) throw new Error("Server error " + res.status);
          return res.json();
      })
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));

      return true; 
  }

  // 2. NEW: Submission Analysis Handler (Accepted screen tool)
  if (request.type === "FETCH_DETAILED_ANALYSIS") {
      // ⚠️ IMPORTANT: Update this URL with your newly deployed analyzeDetailed endpoint!
      // Firebase will give you a new URL when you deploy the updated index.js
      fetch('https://analyzedetailed-i6ptizncma-uc.a.run.app', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: request.code })
      })
      .then(res => {
          if (!res.ok) throw new Error("Server error " + res.status);
          return res.json();
      })
      .then(data => sendResponse({ success: true, data: data }))
      .catch(err => sendResponse({ success: false, error: err.message }));

      return true; // Tells Chrome we are responding asynchronously
  }
});