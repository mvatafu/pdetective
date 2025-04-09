
document.getElementById("initialload").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if the content.js script is already injected
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => window.__contentScriptInjected,
  }, (injectionResults) => {
    const contentScriptInjected = injectionResults?.[0]?.result;

    if (!contentScriptInjected) {
      // Inject content.js if it's not already injected
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["initialload.js"]
      });
    } else {
      console.log("initialload.js already injected.");
    }
  });
});

document.getElementById("start").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if search.js has already been injected
  const hasInjected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__contentScriptInjected
  });

  if (!hasInjected[0].result) {
      // Inject search.js if not already injected
      chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"]
      });
  } else {
      // If already injected, run the logic directly
      chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
              // Run the logic of content.js directly in the tab's context
              // This assumes that your logic for content is inside a function (e.g., `runContentLogic`)
              runContentLogic();
          }
      });
  }
});

document.getElementById("search").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if search.js has already been injected
  const hasInjected = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__searchScriptInjected
  });

  if (!hasInjected[0].result) {
      // Inject search.js if not already injected
      chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["search.js"]
      });
  } else {
      // If already injected, run the logic directly
      chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
              // Run the logic of search.js directly in the tab's context
              // This assumes that your logic for search is inside a function (e.g., `runSearchLogic`)
              runSearchLogic();
          }
      });
  }
});


