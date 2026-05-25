chrome.runtime.onInstalled.addListener((details) => {
  // 1. Initialize Context Menus safely
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeCodeWithSprint",
      title: "Analyse with Sprint",
      contexts: ["all"]
    });
  });

  // 2. Launch the Update Splash Page
  if (details.reason === "update") {

    //Open your external webpage (Uncomment if you are hosting it online instead)
    chrome.tabs.create({ url: "https://getsprint.me/updated" });
  }
});

// Context Menu Action Handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeCodeWithSprint") {
    chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE_SELECTION",
      code: info.selectionText || ""
    });
  }
});

// Network Fetch Helper Function
async function handleFetchRequest(url, bodyData, sendResponse) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });
    
    if (!res.ok) throw new Error("Server error " + res.status);
    
    const data = await res.json();
    sendResponse({ success: true, data: data });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// Runtime Messaging Dispatcher
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

// Command Hotkey Listener
chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return;

    if (command === "analyze-complexity") {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "ANALYZE_SELECTION",
        code: "" 
      });
    }

    if (command === "analyze-bug") {
      chrome.tabs.sendMessage(tabs[0].id, {
        type: "TOGGLE_WHERE_AM_I_WRONG"
      });
    }
  });
});