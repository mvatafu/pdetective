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

  console.log("Tenant URL:", tenantUrl); // Logs the tenant URL
  console.log("Flow ID:", flowId); // Logs the flow ID
  console.log("Package ID:", packageId); // Logs the flow ID
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

if (connector.attributes.name === 'ProcessDirect') {
  // Extract the address value for the corresponding connector
  const addressValue = iflowData.propertyViewModel?.listOfDefaultChannelModel?.[index]?.allAttributes?.address?.value;

  console.log(`Found addressValue: ${addressValue}`); // Debugging: log address value found

  if (addressValue) {
    // Create a unique storage key using flowId, packageId, and elementId
    const storageKey = `${flowId}|${packageId}|${connector.id}`;
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
