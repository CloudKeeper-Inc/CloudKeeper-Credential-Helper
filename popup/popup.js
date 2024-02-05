// On load of popup
document.addEventListener("DOMContentLoaded", function () {
  browser.storage.sync.get(["credentialsFile"], function (data) {
    if (typeof data.credentialsFile !== "undefined")
      document.getElementById("credentialsFile").innerText =
        data.credentialsFile;
  });
  browser.storage.sync.get(["env_variables"], function (data) {
    if (typeof data.env_variables !== "undefined")
      document.getElementById("env_variables").innerText =
        data.env_variables;
  });
  browser.storage.sync.clear();
});

// Function to copy text to clipboard and update button text
function copyToClipboardAndUpdateButton(elementId, buttonId) {
  var copyText = document.getElementById(elementId);
  var textArea = document.createElement("textarea");
  textArea.value = copyText.innerText;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);

  // Update button text to "Copied!" with animation
  var button = document.getElementById(buttonId);
  button.innerText = "Copied!";
  button.classList.add("copied-animation");

  // Reset button text after 2 seconds
  setTimeout(function() {
    button.innerText = "Copy Credentials";
    button.classList.remove("copied-animation");
  }, 2000);
}

// Attach click event listeners using JavaScript
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("copyCredentialsButton").addEventListener("click", function() {
    copyToClipboardAndUpdateButton('credentialsFile', 'copyCredentialsButton');
  });

  document.getElementById("copyEnvVariablesButton").addEventListener("click", function() {
    copyToClipboardAndUpdateButton('env_variables', 'copyEnvVariablesButton');
  });
});
