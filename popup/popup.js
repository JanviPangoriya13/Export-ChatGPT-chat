document.addEventListener("DOMContentLoaded", () => {
  const progressDiv = document.getElementById("progress");

  chrome.storage.local.get(["colorScheme"], (result) => {
    const container = document.querySelector(".extension-container");
    container.classList.add(result.colorScheme);
  });

  chrome.storage.sync.get(["startOffset", "stopOffset"], (result) => {
    const startOffset = result.startOffset || 0;
    const stopOffset = result.stopOffset || -1;

    document
      .getElementById("download-as-json")
      .addEventListener("click", () => {
        progressDiv.innerHTML = "this may take a few minutes...";
        chrome.runtime.sendMessage(
          { message: "backUpAllAsJSON", startOffset, stopOffset },
          () => {
            progressDiv.innerHTML = "Download complete";
          }
        );
      });
  });

  document
    .getElementById("download-current-chat-as-json")
    .addEventListener("click", () => {
      progressDiv.innerHTML = "Download is in progress";
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        chrome.runtime.sendMessage(
          { message: "backUpSingleChat", tabs, downloadType: "json" },
          () => {
            progressDiv.innerHTML = "Download complete";
          }
        );
      });
    });
});
