// === Tab Switching ===
function switchTab(activeTabId, inactiveTabId, activeContentId, inactiveContentId) {
    document.getElementById(activeTabId).classList.add("active");
    document.getElementById(inactiveTabId).classList.remove("active");
    document.getElementById(activeContentId).classList.add("active");
    document.getElementById(inactiveContentId).classList.remove("active");
}
  
function setupTabSwitching() {
    document.getElementById("mainTab").addEventListener("click", () => {
        switchTab("mainTab", "settingsTab", "mainContent", "settingsContent");
    });

    document.getElementById("settingsTab").addEventListener("click", () => {
        switchTab("settingsTab", "mainTab", "settingsContent", "mainContent");
    });
}
  
// === Toggle Explanation Sections ===
function toggleExplanationSections() {
    const section1 = document.getElementById("explanationTexts1");
    const section2 = document.getElementById("explanationTexts2");
    const btn = document.getElementById("showDetailsBtn");

    const shouldShow = section1.style.display === "none" || section1.style.display === "";

    section1.style.display = shouldShow ? "block" : "none";
    section2.style.display = shouldShow ? "block" : "none";
    btn.textContent = shouldShow ? "Hide details" : "Show details";
}
  
// === Settings Load/Save ===
function loadSettings() {
    chrome.storage.local.get(["autoRunInterval"], (result) => {
        const interval = result.autoRunInterval || 5;
        document.getElementById("autoRunInterval").value = interval;
    });
}
  
function saveSettings() {
    const interval = document.getElementById("autoRunInterval").value;
    if (interval && !isNaN(interval) && interval > 0) {
        chrome.storage.local.set({ autoRunInterval: parseInt(interval) }, () => {
            alert("Settings saved successfully!");
        });
    } else {
        alert("Please enter a valid interval.");
    }
}
  
// === Script Injection Utility ===
async function injectScript(tabId, markerVar, file, fallbackFuncName) {
    try {
        const [result] = await chrome.scripting.executeScript({
            target: { tabId },
            func: (marker) => window[marker],
            args: [markerVar]
        });

        if (!result.result) {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: [file]
            });
        } else {
            await chrome.scripting.executeScript({
                target: { tabId },
                func: (fnName) => {
                    if (typeof window[fnName] === "function") {
                        window[fnName]();
                    }
                },
                args: [fallbackFuncName]
            });
        }
    } catch (err) {
        console.error(`Error injecting ${file}:`, err);
        alert(`Failed to inject ${file}. Please try again.`);
    }
}
  
// === Report Fields Generation ===
function generateReportFields(step, status) {
    const container = document.getElementById("reportContainer");
    if (!container) {
        console.warn("⚠️ reportContainer not found!");
        return;
    }

    const iconMap = {
        "In Progress": "hourglass_empty",
        "Success": "check_circle",
        "Error": "warning"
    };

    const statusClass = {
        "In Progress": "status-in-progress",
        "Success": "status-success",
        "Error": "status-error"
    };

    const iconName = iconMap[status] || "info";
    const cssClass = statusClass[status] || "status-default";

    const reportItem = document.createElement("div");
    reportItem.classList.add("report-item", cssClass);

    reportItem.innerHTML = `
        <div class="report-header">
            <span class="material-symbols-outlined report-icon">${iconName}</span>
            <span class="report-step">${step}</span>
        </div>
        <div class="report-status">${status}</div>
    `;

    container.appendChild(reportItem);
}



// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "updateProgress") {
        const { step, status } = message;
        generateReportFields(step, status);
    }
});

function setupButtonHandlers() {
    document.getElementById("saveSettings").addEventListener("click", saveSettings);
    document.getElementById("showDetailsBtn").addEventListener("click", toggleExplanationSections);

    document.getElementById("initialload").addEventListener("click", async () => {
        const confirmed = confirm(
            "Clicking this button will trigger the initial load, which, depending on the number of artifacts, may take a while.\n\nBear in mind it might take a while, but you will be able to see all the logs.\n\nAre you sure to do that?"
        );
    
        if (!confirmed) return;
    
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        injectScript(tab.id, "__initialloadScriptInjected", "initialload.js", "runInitialLoadLogic");
    });
    

    document.getElementById("start").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        injectScript(tab.id, "__contentScriptInjected", "content.js", "runContentLogic");
    });

    document.getElementById("search").addEventListener("click", async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        injectScript(tab.id, "__searchScriptInjected", "search.js", "runSearchLogic");
    });

    // Add event listener for dynamically generated button
    // document.getElementById("updateReportButton").addEventListener("click", () => {
    //     const step = "Step 1"; // Replace with dynamic value if needed
    //     const status = "In Progress"; // Replace with dynamic value if needed
    //     generateReportFields(step, status);
    // });
}
  
// === Init ===
document.addEventListener("DOMContentLoaded", () => {
    loadSettings();
    setupTabSwitching();
    setupButtonHandlers();
});
