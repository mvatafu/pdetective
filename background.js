// === SET DEFAULT GLOBAL INTERVAL ON INSTALL (NOT TENANT-SPECIFIC) ===
chrome.runtime.onInstalled.addListener(async () => {
  const { autoRunInterval } = await chrome.storage.local.get("autoRunInterval");

  if (autoRunInterval === undefined) {
    await chrome.storage.local.set({ autoRunInterval: 1440 });
    console.log("🆕 Set global default autoRunInterval = 1440");
  } else {
    console.log("ℹ️ Global autoRunInterval already set to:", autoRunInterval);
  }

  setupAlarm();
});

// === ENSURE ALARM IS ACTIVE ON LOAD ===
setupAlarm();

// === SETUP ALARM FUNCTION ===
async function setupAlarm() {
  chrome.alarms.create("initialloadTrigger", {
    periodInMinutes: 1, // always check every 1 min, tenant logic filters later
  });

  console.log("🔁 Alarm scheduled to check every 1 minute");
}

// === ON ALARM: RUN LOGIC BASED ON ACTIVE TAB TENANT ===
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "initialloadTrigger") return;

  console.log("⏰ Alarm triggered. Checking active tenant...");

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (
      !tab || !tab.id || !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      !tab.url.includes("integrationsuite") ||
      !tab.url.includes("hana.ondemand.com")
    ) {
      console.warn("❗ Invalid active tab for injection.");
      return;
    }

    const tenantUrl = new URL(tab.url).origin;

    const keys = await chrome.storage.local.get(null);
    const intervalKey = `${tenantUrl}|autoRunInterval`;
    const lastRunKey = `${tenantUrl}|lastRunTimestamp`;

    const autoRunInterval = keys[intervalKey] ?? 1440;
    const lastRunTimestamp = keys[lastRunKey] ?? 0;

    const now = Date.now();
    const intervalMs = autoRunInterval * 60 * 1000;
    const timeSinceLastRun = now - lastRunTimestamp;

    if (timeSinceLastRun < intervalMs) {
      console.log(`🛑 Skipping run. Only ${Math.round(timeSinceLastRun / 1000)}s since last run.`);
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

    await chrome.storage.local.set({ [lastRunKey]: now });
    console.log(`🕒 ${lastRunKey} updated: ${new Date(now).toLocaleString()}`);
  } catch (err) {
    console.error("💥 Error in alarm logic:", err);
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
            console.warn("⚠️ runInitialLoadLogic not available.");
          }
        },
      });
    }

    retries--;
  }, 1000);
}

// === Message Listener: Save to Storage ===
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

// === Show Progress Popup ===
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === "showProgressPopup") {
    const popupUrl = chrome.runtime.getURL("popup.html");

    chrome.windows.create(
      { url: popupUrl, type: "popup", width: 400, height: 400 },
      () => {
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

// === Update UI Inside Popup ===
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
