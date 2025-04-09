chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "saveToStorage") {
    const { key, value } = msg;

    // Retrieve existing values from storage
    chrome.storage.local.get([key], (result) => {
      let addressValues = result[key] || []; // If no values exist yet, initialize as empty array
      addressValues.push(value); // Add the new address value to the array

      // Save the updated array back to storage
      chrome.storage.local.set({ [key]: addressValues }, () => {
        // Send a success response back to the content script
        sendResponse({ success: true });
      });
    });

    // Ensure the connection remains open until sendResponse is called
    return true; // Returning true keeps the message channel open
  }

  // Return false for unknown actions
  return false;
});
