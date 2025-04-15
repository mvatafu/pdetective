// Function to report progress to the popup
function reportProgress(step, status) {
  chrome.runtime.sendMessage({
    action: "updateProgress",
    step: step,
    status: status
  });
}

// Define the runInitialLoadLogic function
async function runInitialLoadLogic() {
  console.log("Content script running on page:", window.location.href);
  const fullUrl = window.location.href;
  const tenantUrl = fullUrl.split('.com')[0] + '.com';
  console.log("Tenant URL:", tenantUrl);

  try {
    // Clean up old storage keys, but keep autoRunInterval
    const allStored = await new Promise(resolve => chrome.storage.local.get(null, resolve));
    console.log("Storage before cleanup:", allStored);
  
    Object.keys(allStored).forEach(key => {
      // Skip the removal of the autoRunInterval key
    if (key === `${tenantUrl}|autoRunInterval` || key === `${tenantUrl}|lastRunTimestamp` ) {
      console.log(`Skipping removal of key: ${key}`);
      return;
    }

    // Only remove keys that start with the current tenantUrl
    if (key.startsWith(`${tenantUrl}|`)) {
      console.log(`Removing key: ${key}`);
      chrome.storage.local.remove(key);
    } else {
      console.log(`Skipping unrelated key: ${key}`);
    }
    });

    // Fetch all content packages
    const packagesResponse = await fetch(`${tenantUrl}/odata/1.0/workspace.svc/ContentEntities.ContentPackages?$format=json`);
    const packagesData = await packagesResponse.json();
    const packages = packagesData?.d?.results || [];

    reportProgress("Process Starting", "In Progress");
    reportProgress("Packages Found", `${packages.length} packages`);

    let totalFlows = 0;
    let newPDLinks = 0;

    for (let i = 0; i < packages.length; i++) {
      const pkg = packages[i];
      const technicalName = pkg.TechnicalName;
      reportProgress(`Package ${i + 1}/${packages.length}`, `Loading ${technicalName}...`);

      const cpResponse = await fetch(`${tenantUrl}/odata/1.0/workspace.svc/ContentPackages('${technicalName}')?$format=json`);
      const cpData = await cpResponse.json();
      const workspaceId = cpData?.d?.reg_id;

      const artifactsResponse = await fetch(`${tenantUrl}/odata/1.0/workspace.svc/ContentPackages('${technicalName}')/Artifacts?$format=json`);
      const artifactData = await artifactsResponse.json();
      const artifacts = artifactData?.d?.results || [];

      await Promise.all(artifacts.map(async (artifact, idx) => {
        const flowId = artifact.Name;
        reportProgress(`Flow ${idx + 1}/${artifacts.length} in ${technicalName}`, "In Progress");

        const iflowResp = await fetch(`${tenantUrl}/api/1.0/workspace/${workspaceId}/artifacts/${artifact.reg_id}/entities/${artifact.reg_id}/iflows/${flowId}?runtimeLocationId=`);
        const iflowData = await iflowResp.json();

        const connectors = iflowData?.bpmnModel?.connectors || [];
        const defaultChannels = iflowData?.propertyViewModel?.listOfDefaultChannelModel || [];
        let pdLinksInFlow = 0;

        connectors.forEach((connector, i) => {
          if (connector.attributes.name === 'ProcessDirect') {
            const address = defaultChannels[i]?.allAttributes?.address?.value;
            const direction = defaultChannels[i]?.direction?.value;

            if (address) {
              const storageKey = `${tenantUrl}|${direction}|${flowId}|${technicalName}|${connector.id}`;
              chrome.storage.local.get([storageKey], (result) => {
                const values = result[storageKey] || [];

                if (!values.includes(address)) {
                  values.push(address);
                  chrome.storage.local.set({ [storageKey]: values });
                  pdLinksInFlow++;
                  newPDLinks++;
                }
              });
            }
          }
        });

        reportProgress(`Flow: ${flowId} ✔️`, `Completed with ${pdLinksInFlow} PD links`);
        totalFlows++;
      }));

      reportProgress(`Package: ${technicalName} ✔️`, `Completed with ${artifacts.length} flows`);
    }

    // Final summary
    reportProgress("Final Summary", `Processed ${packages.length} packages, ${totalFlows} flows, ${newPDLinks} new PD links.`);
  } catch (error) {
    console.error("❌ Error during initial load:", error);
    reportProgress("Error", "Initial load failed. Check console.");
  }
}

// Set flag to avoid reinjection
window.__initialloadScriptInjected = true;

// Execute logic
runInitialLoadLogic();
