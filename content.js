// Define the runContentLogic function
async function runContentLogic() {
  console.log("Content script running on page:", window.location.href);

  // Get the current page URL
  const fullUrl = window.location.href;

  // Extract the tenant_url (everything up to ".com")
  const tenantUrl = fullUrl.split('.com')[0] + '.com';

  // Extract the flow_id (everything after the last slash)
  const flowId = fullUrl.substring(fullUrl.lastIndexOf('/') + 1);

  // Extract the text between "/contentpackage/" and "/integrationflows/"
  const packageId = fullUrl.split('/contentpackage/')[1]?.split('/integrationflows/')[0] || '';

  console.log("Tenant URL:", tenantUrl);
  console.log("Flow ID:", flowId);
  console.log("Package ID:", packageId);

  try {
    // Get Workspace ID
    const cpResponse = await fetch(`${tenantUrl}/odata/1.0/workspace.svc/ContentPackages('${packageId}')?$format=json`);
    const cpData = await cpResponse.json();
    const workspaceId = cpData.d?.reg_id;
    console.log("Workspace ID:", workspaceId);

    // Get Artifact ID
    const artifactResponse = await fetch(`${tenantUrl}/odata/1.0/workspace.svc/Artifacts(Name='${flowId}',Type='IFlow')?$format=json`);
    const artifactData = await artifactResponse.json();
    const artifactId = artifactData.d?.reg_id;
    console.log("Artifact ID:", artifactId);

    // Define your headers
    const headers = {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json"
    };

    // Get iFlow entities with additional headers
    const iflowResponse = await fetch(
      `${tenantUrl}/api/1.0/workspace/${workspaceId}/artifacts/${artifactId}/entities/${artifactId}/iflows/${flowId}?runtimeLocationId=`,
      { headers }
    );
    const iflowData = await iflowResponse.json();

    // Loop through all connectors
    if (iflowData.bpmnModel && Array.isArray(iflowData.bpmnModel.connectors)) {
      iflowData.bpmnModel.connectors.forEach((connector, index) => {
        console.log(`Processing connector with id: ${connector.id}`);

        // Check if the connector's name is "ProcessDirect"
        if (connector.attributes && connector.attributes.name === 'ProcessDirect') {
          // Extract the corresponding address value
          const addressValue = iflowData.propertyViewModel?.listOfDefaultChannelModel?.[index]?.allAttributes?.address?.value;
          console.log(`Found addressValue for connector ${connector.id}: ${addressValue}`);

          if (addressValue) {
            // Create a unique storage key using direction, flowId, packageId, and connector.id
            const storageKey = `${addressValue}|${flowId}|${packageId}|${connector.id}`;
            console.log(`Generated storage key: ${storageKey}`);

            // Access the storage and update the address value without adding duplicates
            chrome.storage.local.get([storageKey], (result) => {
              let addressValues = result[storageKey] || [];
              if (!addressValues.includes(addressValue)) {
                addressValues.push(addressValue);
                console.log(`Adding new address value for connector ${connector.id}.`);
              } else {
                console.log(`Address value ${addressValue} already exists for connector ${connector.id}.`);
              }

              // Save the updated array back to storage
              chrome.storage.local.set({ [storageKey]: addressValues }, () => {
                console.log(`Successfully saved address for connector ${connector.id} to storage.`);
              });
            });
          } else {
            console.log(`No address value found for connector ${connector.id}.`);
          }
        } else {
          console.log(`Connector with id ${connector.id} is not ProcessDirect.`);
        }
      });
    } else {
      console.log("No connectors found in the iFlow data.");
    }
  } catch (err) {
    console.error("Error during API calls:", err);
  }
}

// Prevent reinjection flag for content.js
window.__contentScriptInjected = true;

// Run the content logic when the script is executed
runContentLogic();
