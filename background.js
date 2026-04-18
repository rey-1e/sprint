chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeCodeWithSprint",
      title: "Analyse with Sprint",
      contexts: ["all"]
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

// NEW: Handle the network request from the background script to bypass CORS/HTTPS blocks
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
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

      // Return true to tell Chrome we will send the response asynchronously
      return true; 
  }
});