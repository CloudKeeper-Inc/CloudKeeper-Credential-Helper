importScripts("../lib/aws-sdk.min.js");

var FileName = "credentials";
var ApplySessionDuration = true;
var DebugLogs = false;
var RoleArns = {};
var LF = "\n";
loadItemsFromStorage();
chrome.storage.sync.get(
  {
    Activated: true,
  },
  function (item) {
    if (item.Activated) addOnBeforeRequestEventListener();
  }
);

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason == "install" || details.reason == "update") {
    chrome.tabs.create({ url: "../options/changelog.html" });
  }
});

function addOnBeforeRequestEventListener() {
  if (DebugLogs) console.log("DEBUG: Extension is activated");
  if (chrome.webRequest.onBeforeRequest.hasListener(onBeforeRequestEvent)) {
    console.log(
      "ERROR: onBeforeRequest EventListener could not be added, because onBeforeRequest already has an EventListener."
    );
  } else {
    chrome.webRequest.onBeforeRequest.addListener(
      onBeforeRequestEvent,
      { urls: ["https://signin.aws.amazon.com/saml"] },
      ["requestBody"]
    );
    if (DebugLogs) console.log("DEBUG: onBeforeRequest Listener added");
  }
}

function removeOnBeforeRequestEventListener() {
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestEvent);
}

function onBeforeRequestEvent(details) {
  if (DebugLogs) console.log("DEBUG: onBeforeRequest event hit!");
  var samlXmlDoc = "";
  var formDataPayload = undefined;
  if (details.requestBody.formData) {
    samlXmlDoc = decodeURIComponent(
      unescape(atob(details.requestBody.formData.SAMLResponse[0]))
    );
  } else if (details.requestBody.raw) {
    var combined = new ArrayBuffer(0);
    details.requestBody.raw.forEach(function (element) {
      var tmp = new Uint8Array(combined.byteLength + element.bytes.byteLength);
      tmp.set(new Uint8Array(combined), 0);
      tmp.set(new Uint8Array(element.bytes), combined.byteLength);
      combined = tmp.buffer;
    });
    var combinedView = new DataView(combined);
    var decoder = new TextDecoder("utf-8");
    formDataPayload = new URLSearchParams(decoder.decode(combinedView));
    samlXmlDoc = decodeURIComponent(
      unescape(atob(formDataPayload.get("SAMLResponse")))
    );
  }
  if (DebugLogs) {
    console.log("DEBUG: samlXmlDoc:");
    console.log(samlXmlDoc);
  }
  var PrincipalArn = "";
  var RoleArn = "";
  var SAMLAssertion = undefined;
  var hasRoleIndex = false;
  var roleIndex = undefined;
  if (details.requestBody.formData) {
    SAMLAssertion = details.requestBody.formData.SAMLResponse[0];
    if ("roleIndex" in details.requestBody.formData) {
      hasRoleIndex = true;
      roleIndex = details.requestBody.formData.roleIndex[0];
    }
  } else if (formDataPayload) {
    SAMLAssertion = formDataPayload.get("SAMLResponse");
    roleIndex = formDataPayload.get("roleIndex");
    hasRoleIndex = roleIndex != undefined;
  }

  if (navigator.userAgent.indexOf("Windows") !== -1) {
    LF = "\r\n";
  }

  if (DebugLogs) {
    console.log("ApplySessionDuration: " + ApplySessionDuration);
    // console.log('SessionDuration: ' + SessionDuration);
    console.log("hasRoleIndex: " + hasRoleIndex);
    console.log("roleIndex: " + roleIndex);
  }

  extractPrincipalPlusRoleAndAssumeRole(samlXmlDoc, SAMLAssertion);
}

function extractPrincipalPlusRoleAndAssumeRole(samlattribute, SAMLAssertion) {
  // Pattern for Role
  var reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,<]+/i;
  // Patern for Principal (SAML Provider)
  var rePrincipal = /arn:aws:iam:[^:]*:[0-9]+:saml-provider\/[^,<]+/i;
  RoleArn = samlattribute.match(reRole)[0];
  PrincipalArn = samlattribute.match(rePrincipal)[0];

  if (DebugLogs) {
    console.log("RoleArn: " + RoleArn);
    console.log("PrincipalArn: " + PrincipalArn);
  }

  var params = {
    PrincipalArn: PrincipalArn,
    RoleArn: RoleArn,
    SAMLAssertion: SAMLAssertion,
  };

  var sts = new AWS.STS();
  sts.assumeRoleWithSAML(params, function (err, data) {
    if (err) console.log(err, err.stack); 
    else {
      var docContent =
        "[default]" +
        LF +
        "aws_access_key_id = " +
        data.Credentials.AccessKeyId +
        LF +
        "aws_secret_access_key = " +
        data.Credentials.SecretAccessKey +
        LF +
        "aws_session_token = " +
        data.Credentials.SessionToken;

      if (DebugLogs) {
        console.log("DEBUG: Successfully assumed default profile");
        console.log("docContent:");
        console.log(docContent);
      }
      if (Object.keys(RoleArns).length == 0) {
        console.log("Generate AWS tokens file.");
        outputDocAsDownload(docContent);
      } else {
        if (DebugLogs)
          console.log("DEBUG: Additional Role ARNs are configured");
        var profileList = Object.keys(RoleArns);
        console.log(
          "INFO: Do additional assume-role for role -> " +
            RoleArns[profileList[0]]
        );
        assumeAdditionalRole(
          profileList,
          0,
          data.Credentials.AccessKeyId,
          data.Credentials.SecretAccessKey,
          data.Credentials.SessionToken,
          docContent,
          SessionDuration
        );
      }
    }
  });
}

function outputDocAsDownload(docContent) {
  if (DebugLogs) {
    console.log(
      "DEBUG: Now going to download credentials file. Document content:"
    );
    console.log(docContent);
  }

  try {
    chrome.storage.sync.clear();
    chrome.storage.sync.set({ AccessKeyId: docContent });
  } catch (err) {
    console.log(err.message);
  }
}
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action == "reloadStorageItems") {
    loadItemsFromStorage();
    sendResponse({ message: "Storage items reloaded in background process." });
  }
  if (request.action == "addWebRequestEventListener") {
    if (DebugLogs) console.log("DEBUG: Extension enabled from popup");
    addOnBeforeRequestEventListener();
    sendResponse({
      message: "webRequest EventListener added in background process.",
    });
  }
  if (request.action == "removeWebRequestEventListener") {
    if (DebugLogs) console.log("DEBUG: Extension disabled from popup");
    removeOnBeforeRequestEventListener();
    sendResponse({
      message: "webRequest EventListener removed in background process.",
    });
  }
});

function loadItemsFromStorage() {
  chrome.storage.sync.get(
    {
      FileName: "credentials",
      ApplySessionDuration: "yes",
      DebugLogs: "no",
      RoleArns: {},
    },
    function (items) {
      FileName = items.FileName;
      if (items.ApplySessionDuration == "no") {
        ApplySessionDuration = false;
      } else {
        ApplySessionDuration = true;
      }
      if (items.DebugLogs == "no") {
        DebugLogs = false;
      } else {
        DebugLogs = false;
      }
      RoleArns = items.RoleArns;
    }
  );
}
