function runSearchLogic(extendedMode = false, initialElementIds = [], initialAddresses = []) {
  // Step 1: Get selected text from the page
  const selectedText = window.getSelection().toString().trim();
  console.log("Content script running on page:", window.location.href);
  const fullUrl = window.location.href;
  const tenantUrl = fullUrl.split('.com')[0] + '.com';

  if (!selectedText && initialElementIds.length === 0) {
    console.warn("No text selected!");
    return;
  }

  const pdAddress = selectedText || initialAddresses[0];
  console.log("Selected text:", pdAddress);
  console.log("Extended mode:", extendedMode);
  console.log("Initial element IDs:", initialElementIds);

  // Step 2: Get all storage entries
  chrome.storage.local.get(null, (result) => {
    if (chrome.runtime.lastError) {
      console.error("Error accessing storage:", chrome.runtime.lastError);
      return;
    }

    // Filter entries for this tenant
    const tenantEntries = Object.entries(result).filter(([key]) => key.startsWith(`${tenantUrl}|`));
    console.log(`Found ${tenantEntries.length} entries for tenant ${tenantUrl}`);
    
    // Create a more accessible data structure from storage entries
    const allEntries = [];
    for (const [key, value] of tenantEntries) {
      const parts = key.split('|');
      const direction = parts[1];
      const elementId = parts[2];
      const flowId = parts[3];
      const packageId = parts[4] || '';
      
      // Handle different value formats
      let pdAddresses = [];
      if (typeof value === 'string') {
        pdAddresses = [value];
      } else if (typeof value === 'object' && value !== null) {
        pdAddresses = Object.values(value);
      }
      
      for (const addr of pdAddresses) {
        allEntries.push({
          direction,
          elementId,
          flowId,
          packageId,
          pdAddress: addr
        });
      }
    }
    
    console.log(`Processed ${allEntries.length} total entries`);
    
    let matches = [];
    const processedAddresses = new Set(initialAddresses.length > 0 ? initialAddresses : [pdAddress]);
    const processedElementIds = new Set(initialElementIds);
    const addressToElementsMap = new Map();
    
    // First pass: Find direct matches for selected PD address
    if (!extendedMode || initialElementIds.length === 0) {
      console.log("Performing initial search for PD address:", pdAddress);
      const directMatches = allEntries.filter(entry => entry.pdAddress === pdAddress);
      
      for (const match of directMatches) {
        matches.push(match);
        processedElementIds.add(match.elementId);
        
        // Build a map of PD addresses to elements
        if (!addressToElementsMap.has(match.pdAddress)) {
          addressToElementsMap.set(match.pdAddress, []);
        }
        addressToElementsMap.get(match.pdAddress).push(match.elementId);
      }
    } else {
      // We're in extended mode with initial element IDs
      const elemMatches = allEntries.filter(entry => initialElementIds.includes(entry.elementId));
      
      for (const match of elemMatches) {
        matches.push(match);
        processedAddresses.add(match.pdAddress);
        
        // Build map of PD addresses to elements
        if (!addressToElementsMap.has(match.pdAddress)) {
          addressToElementsMap.set(match.pdAddress, []);
        }
        addressToElementsMap.get(match.pdAddress).push(match.elementId);
      }
    }

    // Extended search: Find all flows connected to the found PD addresses and element IDs
    if (extendedMode) {
      console.log("Performing extended search for connected flows");
      let newItemsFound = true;
      const maxIterations = 10; // Increase to ensure we find everything
      let iteration = 0;
      
      // Keep searching until no new connections are found or max iterations reached
      while (newItemsFound && iteration < maxIterations) {
        newItemsFound = false;
        iteration++;
        
        console.log(`Extended search iteration ${iteration}`);
        console.log(`Current processed addresses: ${Array.from(processedAddresses)}`);
        console.log(`Current processed element IDs: ${Array.from(processedElementIds)}`);
        
        // Make copies of the current state
        const currentAddresses = Array.from(processedAddresses);
        const currentElementIds = Array.from(processedElementIds);
        
        // Step 1: Find flows that use any of our PD addresses
        for (const entry of allEntries) {
          if (currentAddresses.includes(entry.pdAddress) && !processedElementIds.has(entry.elementId)) {
            console.log(`Found new element ${entry.elementId} with PD address ${entry.pdAddress}`);
            matches.push(entry);
            processedElementIds.add(entry.elementId);
            newItemsFound = true;
            
            // Update address to elements map
            if (!addressToElementsMap.has(entry.pdAddress)) {
              addressToElementsMap.set(entry.pdAddress, []);
            }
            addressToElementsMap.get(entry.pdAddress).push(entry.elementId);
          }
        }
        
        // Step 2: Find all PD addresses used by our element IDs
        for (const entry of allEntries) {
          if (currentElementIds.includes(entry.elementId) && !processedAddresses.has(entry.pdAddress)) {
            console.log(`Found new PD address ${entry.pdAddress} from element ${entry.elementId}`);
            processedAddresses.add(entry.pdAddress);
            newItemsFound = true;
            
            // Make sure this entry is in matches if it's not already
            if (!matches.some(m => m.elementId === entry.elementId && m.pdAddress === entry.pdAddress)) {
              matches.push(entry);
            }
            
            // Update address to elements map
            if (!addressToElementsMap.has(entry.pdAddress)) {
              addressToElementsMap.set(entry.pdAddress, []);
            }
            addressToElementsMap.get(entry.pdAddress).push(entry.elementId);
          }
        }
        
        // Step 3: Look for elements connected to newly discovered PD addresses
        const newAddresses = Array.from(processedAddresses).filter(addr => !currentAddresses.includes(addr));
        for (const addr of newAddresses) {
          const relatedEntries = allEntries.filter(entry => entry.pdAddress === addr);
          
          for (const entry of relatedEntries) {
            if (!processedElementIds.has(entry.elementId)) {
              console.log(`Found new element ${entry.elementId} from newly discovered PD address ${addr}`);
              matches.push(entry);
              processedElementIds.add(entry.elementId);
              newItemsFound = true;
              
              // Update address to elements map
              if (!addressToElementsMap.has(entry.pdAddress)) {
                addressToElementsMap.set(entry.pdAddress, []);
              }
              addressToElementsMap.get(entry.pdAddress).push(entry.elementId);
            }
          }
        }
      }
    }

    // Remove duplicate matches by creating a unique key for each entry
    const uniqueMatches = Array.from(
      matches.reduce((map, entry) => {
        const uniqueKey = `${entry.direction}|${entry.elementId}|${entry.flowId}|${entry.pdAddress}`;
        if (!map.has(uniqueKey)) {
          map.set(uniqueKey, entry);
        }
        return map;
      }, new Map()).values()
    );

    if (uniqueMatches.length === 0) {
      console.log("No match found in local storage for:", pdAddress);
    } else {
      console.log(`Found ${uniqueMatches.length} unique matches`);
      console.log("Final matches:", uniqueMatches);
    }

    // Create a connection map for visualization
    const connectionMap = buildConnectionMap(uniqueMatches, addressToElementsMap);

    // Show popup with the results
    showPopup(
      uniqueMatches, 
      pdAddress, 
      extendedMode, 
      Array.from(processedElementIds), 
      Array.from(processedAddresses),
      connectionMap
    );
  });
}

// Build map of connections between elements based on shared PD addresses
function buildConnectionMap(matches, addressToElementsMap) {
  const connections = new Map();
  
  // Initialize the connection map with all elements
  matches.forEach(match => {
    if (!connections.has(match.elementId)) {
      connections.set(match.elementId, {
        direction: match.direction,
        flowId: match.flowId,
        packageId: match.packageId,
        connectedTo: new Set()
      });
    }
  });
  
  // For each PD address, connect all elements that share it
  addressToElementsMap.forEach((elements, pdAddress) => {
    // Skip if only one element uses this address
    if (elements.length <= 1) return;
    
    // Connect all elements that share this PD address
    for (let i = 0; i < elements.length; i++) {
      const elementA = elements[i];
      if (!connections.has(elementA)) continue;
      
      for (let j = 0; j < elements.length; j++) {
        const elementB = elements[j];
        if (i !== j && connections.has(elementB)) {
          connections.get(elementA).connectedTo.add(elementB);
        }
      }
    }
  });
  
  // Convert Sets to Arrays for easier usage
  connections.forEach(value => {
    value.connectedTo = Array.from(value.connectedTo);
  });
  
  return connections;
}

function showPopup(matches, selectedText, isExtendedMode = false, elementIds = [], pdAddresses = [], connectionMap = null) {
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
  header.innerHTML = isExtendedMode
    ? `Extended view for flows related to: <b>${selectedText}</b>`
    : `The PD address <b>${selectedText}</b> was found in:`;
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
        <th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">iFlow ID</th>
        <th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">Package ID</th>
        ${isExtendedMode ? '<th style="padding: 10px; border-bottom: 1px solid #ccc; text-align: left;">PD Address</th>' : ''}
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    matches.forEach(({ direction, elementId, flowId, packageId, pdAddress }) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${direction}</td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;"><b>${elementId}</b></td>
        <td style="padding: 10px; border-bottom: 1px solid #eee;">${flowId}</td>
        ${isExtendedMode ? `<td style="padding: 10px; border-bottom: 1px solid #eee;">${pdAddress}</td>` : ''}
      `;
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    popup.appendChild(table);
  }

  if (matches.length > 0) {
    const buttonContainer = document.createElement("div");
    buttonContainer.style.display = "flex";
    buttonContainer.style.justifyContent = "center";
    buttonContainer.style.gap = "15px";
    buttonContainer.style.marginBottom = "20px";

    // Show map button
    const mapButton = document.createElement("button");
    mapButton.textContent = "Show Map";
    mapButton.style.padding = "12px 24px";
    mapButton.style.fontSize = "18px";
    mapButton.style.background = "#4CAF50";
    mapButton.style.color = "#fff";
    mapButton.style.border = "none";
    mapButton.style.borderRadius = "8px";
    mapButton.style.cursor = "pointer";

    mapButton.onclick = () => {
      showFlowMap(
        popup, 
        closeBtn, 
        matches, 
        selectedText, 
        isExtendedMode, 
        elementIds, 
        pdAddresses, 
        connectionMap
      );
    };

    buttonContainer.appendChild(mapButton);
    popup.appendChild(buttonContainer);
  }

  document.body.appendChild(popup);
}

function showFlowMap(popup, closeBtn, matches, selectedText, isExtendedMode, elementIds, pdAddresses, connectionMap) {
  popup.innerHTML = "";
  popup.appendChild(closeBtn);

  const title = document.createElement("h2");
  title.innerText = isExtendedMode 
    ? `Extended Flow Map for: ${selectedText}` 
    : `Flow Map for path: ${selectedText}`;
  title.style.textAlign = "center";
  popup.appendChild(title);

  // Add toggle for extended view
  const toggleContainer = document.createElement("div");
  toggleContainer.style.display = "flex";
  toggleContainer.style.alignItems = "center";
  toggleContainer.style.justifyContent = "center";
  toggleContainer.style.marginBottom = "20px";
  toggleContainer.style.gap = "10px";

  const toggleLabel = document.createElement("label");
  toggleLabel.innerText = "Extended View:";
  toggleLabel.style.fontSize = "16px";
  toggleLabel.style.fontWeight = "bold";

  const toggleSwitch = document.createElement("div");
  toggleSwitch.style.position = "relative";
  toggleSwitch.style.display = "inline-block";
  toggleSwitch.style.width = "60px";
  toggleSwitch.style.height = "30px";
  toggleSwitch.style.backgroundColor = isExtendedMode ? "#4CAF50" : "#ccc";
  toggleSwitch.style.borderRadius = "34px";
  toggleSwitch.style.transition = "0.4s";
  toggleSwitch.style.cursor = "pointer";

  const toggleCircle = document.createElement("div");
  toggleCircle.style.position = "absolute";
  toggleCircle.style.height = "22px";
  toggleCircle.style.width = "22px";
  toggleCircle.style.left = isExtendedMode ? "34px" : "4px";
  toggleCircle.style.bottom = "4px";
  toggleCircle.style.backgroundColor = "white";
  toggleCircle.style.borderRadius = "50%";
  toggleCircle.style.transition = "0.4s";
  
  toggleSwitch.appendChild(toggleCircle);
  toggleContainer.appendChild(toggleLabel);
  toggleContainer.appendChild(toggleSwitch);
  popup.appendChild(toggleContainer);

  // Toggle switch event handler
  toggleSwitch.onclick = () => {
    const newExtendedMode = !isExtendedMode;
    
    // Save the extended mode state to chrome.storage.local
    chrome.storage.local.set({ "extendedViewEnabled": newExtendedMode }, () => {
      console.log("Extended view mode set to:", newExtendedMode);
    });

    // Close current popup and run search logic again with new mode
    popup.remove();
    runSearchLogic(newExtendedMode, elementIds, pdAddresses);
  };

  const diagramWrapper = document.createElement("div");
  diagramWrapper.style.position = "relative";
  diagramWrapper.style.width = "100%";
  diagramWrapper.style.height = "700px";
  diagramWrapper.style.overflow = "auto";
  diagramWrapper.style.background = "#f9f9f9";
  diagramWrapper.style.border = "1px solid #ccc";
  diagramWrapper.style.marginTop = "30px";

  const senders = matches.filter(m => m.direction === "Receiver");
  const receivers = matches.filter(m => m.direction === "Sender");

  // Create position maps for consistent node placement
  const elementPositions = new Map();
  let senderCount = 0;
  let receiverCount = 0;
  
  // Position all senders on the left
  senders.forEach(sender => {
    if (!elementPositions.has(sender.elementId)) {
      elementPositions.set(sender.elementId, {
        x: 50,
        y: senderCount * 120 + 50,
        type: 'sender'
      });
      senderCount++;
    }
  });
  
  // Position all receivers on the right
  receivers.forEach(receiver => {
    if (!elementPositions.has(receiver.elementId)) {
      elementPositions.set(receiver.elementId, {
        x: 500,
        y: receiverCount * 120 + 50,
        type: 'receiver'
      });
      receiverCount++;
    }
  });

  // Render all nodes based on their positions
  const nodeElements = new Map();
  matches.forEach(match => {
    if (!elementPositions.has(match.elementId)) {
      console.warn(`No position defined for element: ${match.elementId}`);
      return;
    }
    
    const position = elementPositions.get(match.elementId);
    const node = document.createElement("div");
    node.className = `${position.type}-node`;
    node.style.position = "absolute";
    node.style.top = `${position.y}px`;
    node.style.left = `${position.x}px`;
    node.style.width = "180px";
    node.style.height = "90px";
    node.style.background = position.type === 'sender' ? "#007bff" : "#fd7e14";
    node.style.color = "black";
    node.style.padding = "8px";
    node.style.borderRadius = "10px";
    node.style.textAlign = "center";
    node.style.lineHeight = "1.4";
    node.style.fontSize = "14px";
    node.style.overflow = "hidden";
    node.style.whiteSpace = "normal";
    node.style.wordWrap = "break-word";
    node.innerHTML = `<b>${match.elementId}</b><br>${match.flowId}<br><small>${isExtendedMode ? match.pdAddress : ''}</small>`;
    diagramWrapper.appendChild(node);
    nodeElements.set(match.elementId, node);
  });

  // Create SVG for lines
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.style.position = "absolute";
  svg.style.top = "0";
  svg.style.left = "0";
  svg.style.overflow = "visible";
  
  // Add connecting lines based on connection mapping
  if (isExtendedMode && connectionMap) {
    connectionMap.forEach((details, sourceId) => {
      const sourcePosition = elementPositions.get(sourceId);
      if (!sourcePosition) return;
      
      const sourceX = sourcePosition.type === 'sender' ? 230 : 500;
      const sourceY = sourcePosition.y + 45; // Center of node
      
      details.connectedTo.forEach(targetId => {
        const targetPosition = elementPositions.get(targetId);
        if (!targetPosition) return;
        
        const targetX = targetPosition.type === 'sender' ? 50 : 500;
        const targetY = targetPosition.y + 45; // Center of node
        
        // Draw line
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", sourceX);
        line.setAttribute("y1", sourceY);
        line.setAttribute("x2", targetPosition.type === 'sender' ? 230 : targetX);
        line.setAttribute("y2", targetY);
        line.setAttribute("stroke", "#333");
        line.setAttribute("stroke-width", "2");
        line.setAttribute("marker-end", "url(#arrowhead)");
        line.setAttribute("stroke-dasharray", sourcePosition.type === targetPosition.type ? "5,5" : "");
        svg.appendChild(line);
      });
    });
  } else {
    // Standard view: Connect all senders to all receivers
    senders.forEach(sender => {
      const senderPosition = elementPositions.get(sender.elementId);
      if (!senderPosition) return;
      
      receivers.forEach(receiver => {
        const receiverPosition = elementPositions.get(receiver.elementId);
        if (!receiverPosition) return;
        
        // Check if they share a PD address in extended mode
        let sharedAddress = false;
        if (isExtendedMode) {
          sharedAddress = sender.pdAddress === receiver.pdAddress;
        } else {
          sharedAddress = true; // In standard mode, connect all
        }
        
        if (sharedAddress) {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", 230);
          line.setAttribute("y1", senderPosition.y + 45);
          line.setAttribute("x2", 500);
          line.setAttribute("y2", receiverPosition.y + 45);
          line.setAttribute("stroke", "#333");
          line.setAttribute("stroke-width", "2");
          line.setAttribute("marker-end", "url(#arrowhead)");
          svg.appendChild(line);
        }
      });
    });
  }

  // Add arrowhead definition
  const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
  defs.innerHTML = `
    <marker id="arrowhead" markerWidth="10" markerHeight="7"
      refX="10" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#333" />
    </marker>`;
  svg.appendChild(defs);

  diagramWrapper.appendChild(svg);
  popup.appendChild(diagramWrapper);

  // Add legend for extended view
  if (isExtendedMode) {
    const legend = document.createElement("div");
    legend.style.marginTop = "20px";
    legend.style.padding = "15px";
    legend.style.backgroundColor = "#f0f0f0";
    legend.style.borderRadius = "8px";
    legend.style.fontSize = "14px";
    legend.innerHTML = `
      <p><strong>Extended View Legend:</strong></p>
      <div style="display: flex; gap: 20px; margin-top: 10px;">
        <div>
          <span style="display: inline-block; width: 15px; height: 15px; background-color: #007bff; margin-right: 5px;"></span> Sender Flows
        </div>
        <div>
          <span style="display: inline-block; width: 15px; height: 15px; background-color: #fd7e14; margin-right: 5px;"></span> Receiver Flows
        </div>
        <div>
          <span style="display: inline-block; width: 15px; height: 15px; border: 1px solid #333; margin-right: 5px;"></span> Direct Connection
        </div>
        ${isExtendedMode ? `
        <div>
          <span style="display: inline-block; width: 20px; height: 5px; background-color: #333; margin-right: 5px; margin-bottom: 2px;"></span> Connection via shared PD address
        </div>` : ''}
      </div>
      <p style="margin-top: 10px;"><small>Extended view shows ${pdAddresses.length} PD addresses connecting ${elementIds.length} flows</small></p>`;
    popup.appendChild(legend);
  }
}

// Check if extended view mode was previously enabled
function initializeSearch() {
  chrome.storage.local.get("extendedViewEnabled", (result) => {
    const extendedMode = result.extendedViewEnabled || false;
    console.log("Initializing search with extended mode:", extendedMode);
    runSearchLogic(extendedMode);
  });
}

// Prevent reinjection flag for search.js
if (!window.__searchScriptInjected) {
  window.__searchScriptInjected = true;
  // Run the search logic when script is executed
  initializeSearch();
}