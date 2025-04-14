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
function showPopup(matches, selectedText) {
  const popup = document.createElement("div");
  popup.style.position = "fixed";
  popup.style.top = "50%";
  popup.style.left = "50%";
  popup.style.transform = "translate(-50%, -50%)";
  popup.style.zIndex = "999999";
  popup.style.background = "#fff";
  popup.style.padding = "30px";
  popup.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.25)";
  popup.style.borderRadius = "15px";
  popup.style.maxWidth = "1200px";
  popup.style.width = "90%";
  popup.style.maxHeight = "90vh";
  popup.style.overflowY = "auto";
  popup.style.fontFamily = "Arial, sans-serif";
  popup.style.fontSize = "16px";
  popup.style.color = "#333";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✖";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "15px";
  closeBtn.style.right = "20px";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.fontSize = "20px";
  closeBtn.onclick = () => popup.remove();

  const header = document.createElement("p");
  header.innerHTML = `The PD address <b>${selectedText}</b> was found in:`;
  header.style.marginBottom = "20px";
  header.style.fontSize = "18px";

  popup.appendChild(closeBtn);
  popup.appendChild(header);

  if (matches.length === 0) {
    const noMatch = document.createElement("p");
    noMatch.innerHTML = `<b>No matches found</b>`;
    popup.appendChild(noMatch);
  } else {
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.marginBottom = "30px";

    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr style="background-color: #f2f2f2;">
        <th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">Direction</th>
        <th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">Element ID</th>
        <th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">iFlow ID</th>
        <th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">Package ID</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    matches.forEach(({ direction, elementId, flowId, packageId }) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${direction}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;"><b>${elementId}</b></td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${flowId}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${packageId}</td>
      `;
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    popup.appendChild(table);
  }

  // Show map button
  if (matches.length > 0) {
    const mapButton = document.createElement("button");
    mapButton.textContent = "Show map";
    mapButton.style.display = "block";
    mapButton.style.margin = "0 auto 20px";
    mapButton.style.padding = "12px 24px";
    mapButton.style.fontSize = "18px";
    mapButton.style.background = "#4CAF50";
    mapButton.style.color = "#fff";
    mapButton.style.border = "none";
    mapButton.style.borderRadius = "8px";
    mapButton.style.cursor = "pointer";

    mapButton.onclick = () => {
      popup.innerHTML = "";
      popup.appendChild(closeBtn);

      const title = document.createElement("h2");
      title.innerText = `Flow Map for path: ${selectedText}`;
      title.style.textAlign = "center";
      popup.appendChild(title);

      const diagramWrapper = document.createElement("div");
      diagramWrapper.style.position = "relative";
      diagramWrapper.style.width = "100%";
      diagramWrapper.style.height = "700px";
      diagramWrapper.style.overflow = "auto";
      diagramWrapper.style.background = "#f9f9f9";
      diagramWrapper.style.border = "1px solid #ccc";
      diagramWrapper.style.marginTop = "30px";

      const senders = matches.filter(m => m.direction === "Sender");
      const receivers = matches.filter(m => m.direction === "Receiver");

      const senderNodes = senders.map((sender, i) => {
        const node = document.createElement("div");
        node.className = "sender-node";
        node.style.position = "absolute";
        node.style.top = `${i * 120 + 50}px`;
        node.style.left = `50px`;
        node.style.width = "180px";
        node.style.height = "70px";
        node.style.background = "#007bff";
        node.style.color = "white";
        node.style.padding = "8px";
        node.style.borderRadius = "10px";
        node.style.textAlign = "center";
        node.style.lineHeight = "1.4";
        node.style.fontSize = "14px";
        node.innerHTML = `<b>${sender.elementId}</b><br>${sender.flowId}`;
        diagramWrapper.appendChild(node);
        return { ...sender, y: i * 120 + 85 };
      });

      const receiverNodes = receivers.map((receiver, i) => {
        const node = document.createElement("div");
        node.className = "receiver-node";
        node.style.position = "absolute";
        node.style.top = `${i * 120 + 50}px`;
        node.style.left = `500px`;
        node.style.width = "180px";
        node.style.height = "70px";
        node.style.background = "#fd7e14";
        node.style.color = "white";
        node.style.padding = "8px";
        node.style.borderRadius = "10px";
        node.style.textAlign = "center";
        node.style.lineHeight = "1.4";
        node.style.fontSize = "14px";
        node.innerHTML = `<b>${receiver.elementId}</b><br>${receiver.flowId}`;
        diagramWrapper.appendChild(node);
        return { ...receiver, y: i * 120 + 85 };
      });

      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.position = "absolute";
      svg.style.top = "0";
      svg.style.left = "0";
      svg.style.overflow = "visible";

      senderNodes.forEach(s => {
        receiverNodes.forEach(r => {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", 230);
          line.setAttribute("y1", s.y);
          line.setAttribute("x2", 500);
          line.setAttribute("y2", r.y);
          line.setAttribute("stroke", "#333");
          line.setAttribute("stroke-width", "2");
          line.setAttribute("marker-end", "url(#arrowhead)");
          svg.appendChild(line);
        });
      });

      const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      defs.innerHTML = `
        <marker id="arrowhead" markerWidth="10" markerHeight="7"
          refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
        </marker>`;
      svg.appendChild(defs);

      diagramWrapper.appendChild(svg);
      popup.appendChild(diagramWrapper);
    };

    popup.appendChild(mapButton);
  }

  document.body.appendChild(popup);
}



// Prevent reinjection flag for search.js
window.__searchScriptInjected = true;
// Run the search logic when script is executed
runSearchLogic();