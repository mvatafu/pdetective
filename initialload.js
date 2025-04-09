(async () => {
    console.log("Content script running on page:", window.location.href);
  
    // Get the current page URL
    const fullUrl = window.location.href;
    // Extract the tenant_url (everything up to ".com")
    const tenantUrl = fullUrl.split('.com')[0] + '.com';
  
    console.log("Tenant URL:", tenantUrl); // Logs the tenant URL
  
    try {
      // Clean up all old keys before starting the new execution
      chrome.storage.local.get(null, (result) => {
        console.log("Storage result before cleanup:", result); // Debugging: log all existing keys in storage
  
        // Clean up any old keys that are no longer valid
        for (let key in result) {
          if (result.hasOwnProperty(key)) {
            console.log(`Deleting outdated key: ${key}`);
            chrome.storage.local.remove(key);
          }
        }
      });
  
      // Fetch all content packages on the tenant
      const packagesResponse = await fetch(
        `${tenantUrl}/odata/1.0/workspace.svc/ContentEntities.ContentPackages?$format=json`
      );
      const packagesData = await packagesResponse.json();
      console.log("All Content Packages:", packagesData);
  
      // Create an array to store all TechnicalName fields from each package
      const technicalNames = packagesData.d?.results?.map(pkg => pkg.TechnicalName) || [];
      console.log("All Technical Names:", technicalNames);
  
      // Loop over all technicalNames (packages)
      for (const technicalName of technicalNames) {
        console.log(`Processing package with TechnicalName: ${technicalName}`);
  
        // Get Workspace ID for the package
        const cpResponse = await fetch(
          `${tenantUrl}/odata/1.0/workspace.svc/ContentPackages('${technicalName}')?$format=json`
        );
        const cpData = await cpResponse.json();
        const workspaceId = cpData.d?.reg_id;
        console.log("Workspace ID:", workspaceId);
  
        // Fetch all Artifacts associated with this package
        const artifactResponse = await fetch(
          `${tenantUrl}/odata/1.0/workspace.svc/ContentPackages('${technicalName}')/Artifacts?$format=json`
        );
        const artifactData = await artifactResponse.json();
        console.log(`Artifacts for package ${technicalName}:`, artifactData);
  
        // Loop through all the Artifacts (flows) in the package
        for (const artifact of artifactData.d?.results || []) {
          const flowId = artifact.Name; // Assuming 'Name' field holds the flowId
          const artifactId = artifact.reg_id;
  
          console.log(`Processing Artifact (Flow ID): ${flowId}, Artifact ID: ${artifactId}`);
  
          // Define headers for iFlow API call
          const headers = {
            "Accept": "application/json",
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/json"
          };
  
          // Get iFlow entities with additional headers for each flowId associated with this package
          const iflowResponse = await fetch(
            `${tenantUrl}/api/1.0/workspace/${workspaceId}/artifacts/${artifactId}/entities/${artifactId}/iflows/${flowId}?runtimeLocationId=`,
            { headers }
          );
          const iflowData = await iflowResponse.json();
  
          ////////////////////////////////////// AICI !!! //////////////////////////////////////////
  
          // Loop through all connectors in the iFlow and find ids where name === 'ProcessDirect'
          iflowData.bpmnModel.connectors.forEach((connector, index) => {
            console.log(`Processing connector with id: ${connector.id}`); // Debugging: log connector being processed
  
            if (connector.attributes.name === 'ProcessDirect') {
              // Extract the address value for the corresponding connector
              const addressValue = iflowData.propertyViewModel?.listOfDefaultChannelModel?.[index]?.allAttributes?.address?.value;
              const direction = iflowData.propertyViewModel?.listOfDefaultChannelModel?.[index]?.direction?.value;
  
              console.log(`Found addressValue: ${addressValue}`); // Debugging: log address value found
  
              if (addressValue) {
                // Create a unique storage key using flowId, packageId, and elementId
                const storageKey = `${direction}|${flowId}|${technicalName}|${connector.id}`;
                console.log(`Generated storage key: ${storageKey}`); // Debugging: log storage key being created
  
                // Access the storage and update the address value
                chrome.storage.local.get([storageKey], (result) => {
                  console.log(`Storage result for key ${storageKey}:`, result); // Debugging: log what is in storage for the key
  
                  let addressValues = result[storageKey] || []; // Default to empty array if nothing exists
  
                  // Check if the address already exists in the array
                  const index = addressValues.indexOf(addressValue);
                  console.log(`Address value ${addressValue} found at index: ${index}`); // Debugging: log if address exists or not
  
                  if (index === -1) {
                    // If address doesn't exist, add it
                    console.log(`Address value ${addressValue} not found, adding it.`);
                    addressValues.push(addressValue);
                  } else {
                    // If address exists, replace the value (effectively "overwrite" it)
                    console.log(`Address value ${addressValue} found, replacing it.`);
                    addressValues[index] = addressValue;
                  }
  
                  // Save the updated array back to storage
                  chrome.storage.local.set({ [storageKey]: addressValues }, () => {
                    console.log(`Successfully saved address value for elementId ${connector.id} to storage!`);
  
                    // After saving, log the key and its value
                    chrome.storage.local.get([storageKey], (updatedResult) => {
                      console.log(`Updated Key: ${storageKey}, Value:`, updatedResult[storageKey]);
                    });
                  });
                });
              } else {
                console.log(`No address value found for elementId ${connector.id}`); // Debugging: log when no address value is found
              }
            } else {
              console.log(`Connector with id ${connector.id} does not have 'ProcessDirect' as its name`); // Debugging: log when name is not 'ProcessDirect'
            }
          });
        }
      }
  
    } catch (err) {
      console.error("Error during API calls:", err);
    }
  
    // Prevent reinjection flag for content.js
    window.__contentScriptInjected = true;
  })();
  