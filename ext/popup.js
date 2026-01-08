document.addEventListener("DOMContentLoaded", () => {
  // Load saved settings
  chrome.storage.local.get(
    ["geminiApiKey", "geminiModel", "geminiLanguage"],
    (result) => {
      if (result.geminiApiKey) {
        document.getElementById("apiKey").value = result.geminiApiKey;
      }
      if (result.geminiModel) {
        document.getElementById("modelName").value = result.geminiModel;
      }
      // Set language (Default to English if not found)
      if (result.geminiLanguage) {
        document.getElementById("languageSelect").value = result.geminiLanguage;
      }
    }
  );

  // Save settings
  document.getElementById("saveBtn").addEventListener("click", () => {
    const key = document.getElementById("apiKey").value.trim();
    const model =
      document.getElementById("modelName").value.trim() || "gemini-2.5-flash";
    const lang = document.getElementById("languageSelect").value; // Get selected language
    const status = document.getElementById("status");

    if (!key) {
      status.textContent = "Please enter an API Key.";
      status.style.color = "red";
      return;
    }

    chrome.storage.local.set(
      {
        geminiApiKey: key,
        geminiModel: model,
        geminiLanguage: lang, // Save it
      },
      () => {
        status.textContent = "Settings Saved!";
        status.className = "success";
        setTimeout(() => {
          status.textContent = "";
        }, 2000);
      }
    );
  });
});
