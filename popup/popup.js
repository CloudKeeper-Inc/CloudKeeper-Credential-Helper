// On load of popup
document.addEventListener("DOMContentLoaded", function () {
  chrome.storage.sync.get(
    ["AccessKeyId"],
    function (data) {
      if (typeof data.AccessKeyId !== "undefined")
        document.getElementById("AccessKeyId").innerText = data.AccessKeyId;
      chrome.storage.sync.clear();
    }
  );
});


