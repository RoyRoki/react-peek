// Handle keyboard shortcut
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-inspect') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'REACTPEEK_TOGGLE' }).catch(() => {
        // Content script not injected yet on this tab — ignore
      });
    }
  }
});

// Handle messages from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'REACTPEEK_TOGGLE_FROM_POPUP') {
    // Must be async-safe: use async IIFE, call sendResponse before await
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REACTPEEK_TOGGLE' }).catch(() => {});
      }
      sendResponse({ ok: true });
    })();
    return true; // keep message channel open for async sendResponse
  }
});
