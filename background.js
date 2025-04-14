// === SET DEFAULT INTERVAL AND CREATE ALARM ===
chrome.runtime.onInstalled.addListener(async () => {
  const { autoRunInterval } = await chrome.storage.local.get("autoRunInterval");

  if (autoRunInterval === undefined) {
    await chrome.storage.local.set({ autoRunInterval: 1440 });
    console.log("🆕 Set default autoRunInterval = 1440");
  } else {
    console.log("ℹ️ autoRunInterval already set to:", autoRunInterval);
  }

  setupAlarm();
});

// === SETUP ALARM FUNCTION ===
async function setupAlarm() {
  const { autoRunInterval } = await chrome.storage.local.get("autoRunInterval");
  const intervalInMinutes = autoRunInterval || 1440;

  chrome.alarms.create("initialloadTrigger", {
    periodInMinutes: intervalInMinutes,
  });

  console.log(`🔁 Alarm scheduled every ${intervalInMinutes} minute(s)`);
}

// === ON ALARM: RUN LOGIC IF ENOUGH TIME HAS PASSED ===
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

// === Retry sending message to content script ===
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

// === Message listener for storage saving and UI updates ===
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

    return true;
  }

  if (msg.action === "updateProgress") {
    const { step, status } = msg;
    chrome.runtime.sendMessage({ action: "updatePopupUI", step, status });
    return true;
  }

  return false;
});

// === Create popup and update UI ===
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
        }, 1000);
      }
    );
  }
});

chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === "updatePopupUI") {
    const { step, status } = msg;

    const popupWindow = await chrome.windows.getCurrent({ populate: true });
    const popupTab = popupWindow.tabs[0];

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
        func: (html) => {
          const container = document.getElementById("reportContainer");
          if (container) {
            container.innerHTML = html;
            container.style.display = 'block';
          } else {
            console.warn("⚠️ Report container not found.");
          }
        },
        args: [reportFields],
      });
    }
  }
});

// === Ensure alarm is active on extension load (not just install) ===
setupAlarm();
