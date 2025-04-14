// Ensure default interval is set on install/reload
chrome.runtime.onInstalled.addListener(async () => {
  const { autoRunInterval } = await chrome.storage.local.get("autoRunInterval");

  if (autoRunInterval === undefined) {
    await chrome.storage.local.set({ autoRunInterval: 5 });
    console.log("🆕 Set default autoRunInterval = 5");
  } else {
    console.log("ℹ️ autoRunInterval already set to:", autoRunInterval);
  }
});

// Handle alarm trigger for initialload logic
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "initialloadTrigger") return;

  console.log("⏰ Alarm triggered. Checking if we should run initialload...");

  try {
    const now = Date.now();

    const { lastRunTimestamp, autoRunInterval } = await chrome.storage.local.get([
      "lastRunTimestamp",
      "autoRunInterval",
    ]);

    const intervalMs = (autoRunInterval || 5) * 60 * 1000;
    const timeSinceLastRun = now - (lastRunTimestamp || 0);

    if (timeSinceLastRun < intervalMs) {
      console.log(`🛑 Skipping run. Only ${Math.round(timeSinceLastRun / 1000)} seconds passed since last run.`);
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (
      !tab ||
      !tab.id ||
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      !tab.url.includes("integrationsuite") ||
      !tab.url.includes("hana.ondemand.com")
    ) {
      console.warn("❗ No valid active tab found or not allowed to inject.");
      return;
    }

    const [check] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__initialloadScriptInjected === true,
    });

    if (!check.result) {
      console.log("📥 Script not injected. Injecting initialload.js...");
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["initialload.js"],
      });
    } else {
      console.log("✅ Script already injected. Calling runInitialLoadLogic() again.");
      await sendMessageToContentScript(tab.id);
    }

    await chrome.storage.local.set({ lastRunTimestamp: now });
    console.log("🕒 lastRunTimestamp updated:", new Date(now).toLocaleString());
  } catch (error) {
    console.error("💥 Error running alarm logic:", error);
  }
});


// Retry sending message after a short delay if content script is not ready
function sendMessageToContentScript(tabId) {
  let retries = 3;
  const interval = setInterval(async () => {
    const [check] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__initialloadScriptInjected === true,
    });

    if (check.result || retries === 0) {
      clearInterval(interval);
      chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          if (typeof runInitialLoadLogic === "function") {
            runInitialLoadLogic();
          } else {
            console.warn("⚠️ runInitialLoadLogic is not available.");
          }
        },
      });
    }

    retries--;
  }, 1000); // Retry every second, for up to 3 attempts
}

// === Handle all messages in a single listener
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "saveToStorage") {
    const { key, value } = msg;

    chrome.storage.local.get([key], (result) => {
      const current = result[key] || [];
      current.push(value);
      chrome.storage.local.set({ [key]: current }, () => {
        sendResponse({ success: true });
      });
    });

    return true; // Required for async response
  }

  if (msg.action === "updateProgress") {
    const { step, status } = msg;

    // Send message to popup to update UI dynamically
    chrome.runtime.sendMessage(
      { action: "updatePopupUI", step, status },
      () => {
        // optional callback
      }
    );

    return true;
  }

  return false;
});

// === Respond to popup creation and dynamically update it
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === "showProgressPopup") {
    const popupUrl = chrome.runtime.getURL("popup.html");

    chrome.windows.create(
      { url: popupUrl, type: "popup", width: 400, height: 400 },
      (win) => {
        setTimeout(() => {
          chrome.runtime.sendMessage({
            action: "updatePopupUI",
            step: msg.step,
            status: msg.status,
          });
        }, 1000); // slight delay to allow popup to load
      }
    );
  }
});

// This will be the function that updates the popup HTML
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === "updatePopupUI") {
    const { step, status } = msg;

    // Find the progress bar and update it with the report fields
    const popupDocument = await chrome.windows.getCurrent({ populate: true });
    const popupTab = popupDocument.tabs[0];

    if (popupTab) {
      const reportFields = `
        <div>
          <h3>Report:</h3>
          <p>Step: ${step}</p>
          <p>Status: ${status}</p>
        </div>
      `;

      chrome.scripting.executeScript({
        target: { tabId: popupTab.id },
        func: (reportFields) => {
          const container = document.getElementById("reportContainer");
          if (container) {
            container.innerHTML = reportFields;
            container.style.display = 'block';  // Make it visible
          } else {
            console.warn("⚠️ Report container not found.");
          }
        },
        args: [reportFields],
      });
    }
  }
});
