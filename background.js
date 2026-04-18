// Ensure we cleanly create the context menu when the extension loads/updates
chrome.runtime.onInstalled.addListener(() => {
  // Remove existing to prevent duplication errors, then create
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "analyzeCodeWithSprint",
      title: "Analyse with Sprint",
      contexts: ["all"] // FIX: Changed from "selection" to "all" to bypass Monaco editor quirks
    });
  });
});

// Listen for a click on our context menu item.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "analyzeCodeWithSprint") {
    // Send a message to the content script. 
    // If Chrome caught the selection, send it. Otherwise, send an empty string.
    chrome.tabs.sendMessage(tab.id, {
      type: "ANALYZE_SELECTION",
      code: info.selectionText || ""
    });
  }
});