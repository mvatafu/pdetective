// Define the runSearchLogic function inside search.js
function runSearchLogic() {
  // Step 1: Get selected text from the page
  const selectedText = window.getSelection().toString().trim();
  if (!selectedText) {
    console.warn("No text selected!");
    return;
  }
  console.log("Selected text:", selectedText);
  // Step 2: Get all storage entries
  chrome.storage.local.get(null, (result) => {
    if (chrome.runtime.lastError) {
      console.error("Error accessing storage:", chrome.runtime.lastError);
      return;
    }
    const matches = [];
    // Step 3: Search for the selected text in values
    for (const [key, value] of Object.entries(result)) {
      if (Object.values(value).includes(selectedText)) {
        const [direction, flowId, packageId, elementId] = key.split('|');
        matches.push({ direction, flowId, packageId, elementId });
      }
    }
    if (matches.length === 0) {
      console.log("No match found in local storage for selected text:", selectedText);
    }
    // Show popup with matches or "No matches found" message
    showPopup(matches, selectedText);
  });
}
// Step 4: Inject a styled popup into the page
function showPopup(matches, selectedText) {
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.zIndex = "999999";
  popup.style.background = "#fff";
  popup.style.padding = "20px";
  popup.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.2)";
  popup.style.borderRadius = "10px";
  popup.style.maxWidth = "450px";
  popup.style.fontFamily = "Arial, sans-serif";
  popup.style.fontSize = "14px";
  popup.style.color = "#333";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✖";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "5px";
  closeBtn.style.right = "10px";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "16px";
  closeBtn.onclick = () => popup.remove();
  const header = document.createElement("p");
  header.innerHTML = `The PD address <b>${selectedText}</b> was found in:`;
  header.style.marginBottom = "10px";
  const list = document.createElement("ul");
  list.style.paddingLeft = "20px";
  list.style.margin = "0";
  // If no matches, show a message
  if (matches.length === 0) {
    const noMatchItem = document.createElement("li");
    noMatchItem.innerHTML = `<b>No matches found</b>`;
    list.appendChild(noMatchItem);
  } else {
    // If matches are found, display them
    matches.forEach(({ direction, flowId, packageId, elementId }) => {
      const item = document.createElement("li");
      item.innerHTML = `Direction <b>${direction}</b> Element ID <b>${elementId}</b> | iFlow ID <b>${flowId}</b> | Package ID <b>${packageId}</b>`;
      list.appendChild(item);
    });
  }
  popup.appendChild(closeBtn);
  popup.appendChild(header);
  popup.appendChild(list);
  document.body.appendChild(popup);
}
// Prevent reinjection flag for search.js
window.__searchScriptInjected = true;
// Run the search logic when script is executed
runSearchLogic();