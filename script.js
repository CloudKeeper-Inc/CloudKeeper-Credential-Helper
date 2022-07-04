importScripts("../lib/aws-sdk.min.js");

var FileName = "credentials";
var ApplySessionDuration = true;
var DebugLogs = false;
var RoleArns = {};
var LF = "\n";
loadItemsFromStorage();
// Additionaly on start of the background process it is checked if this extension can be activated
chrome.storage.sync.get(
  {
    // The default is activated
    Activated: true,
  },
  function (item) {
    if (item.Activated) addOnBeforeRequestEventListener();
  }
);
// Additionally on start of the background process it is checked if a new version of the plugin is installed.
// If so, show the user the changelog
// var thisVersion = chrome.runtime.getManifest().version;
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason == "install" || details.reason == "update") {
    // Open a new tab to show changelog html page
    chrome.tabs.create({ url: "../options/changelog.html" });
  }
});

// Function to be called when this extension is activated.
// This adds an EventListener for each request to signin.aws.amazon.com
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

// Function to be called when this extension is de-actived
// by unchecking the activation checkbox on the popup page
function removeOnBeforeRequestEventListener() {
  chrome.webRequest.onBeforeRequest.removeListener(onBeforeRequestEvent);
}

// Callback function for the webRequest OnBeforeRequest EventListener
// This function runs on each request to https://signin.aws.amazon.com/saml
function onBeforeRequestEvent(details) {
  if (DebugLogs) console.log("DEBUG: onBeforeRequest event hit!");
  // Decode base64 SAML assertion in the request
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

  // Change newline sequence when client is on Windows
  if (navigator.userAgent.indexOf("Windows") !== -1) {
    LF = "\r\n";
  }

  if (DebugLogs) {
    console.log("ApplySessionDuration: " + ApplySessionDuration);
    // console.log('SessionDuration: ' + SessionDuration);
    console.log("hasRoleIndex: " + hasRoleIndex);
    console.log("roleIndex: " + roleIndex);
  }

  // If there is more than 1 role in the claim, look at the 'roleIndex' HTTP Form data parameter to determine the role to assume
  // if (roleDomNodes.length > 1 && hasRoleIndex) {
  //   for (i = 0; i < roleDomNodes.length; i++) {
  //     var nodeValue = roleDomNodes[i].innerHTML;
  //     if (nodeValue.indexOf(roleIndex) > -1) {
  //       // This DomNode holdes the data for the role to assume. Use these details for the assumeRoleWithSAML API call
  // 	    // The Role Attribute from the SAMLAssertion (DomNode) plus the SAMLAssertion itself is given as function arguments.
  // 	    extractPrincipalPlusRoleAndAssumeRole(nodeValue, SAMLAssertion, SessionDuration)
  //     }
  //   }
  // }
  // // If there is just 1 role in the claim there will be no 'roleIndex' in the form data.
  // else if (roleDomNodes.length == 1) {
  //   // When there is just 1 role in the claim, use these details for the assumeRoleWithSAML API call
  //   // The Role Attribute from the SAMLAssertion (DomNode) plus the SAMLAssertion itself is given as function arguments.
  //   extractPrincipalPlusRoleAndAssumeRole(roleDomNodes[0].innerHTML, SAMLAssertion, SessionDuration)
  // }
  extractPrincipalPlusRoleAndAssumeRole(samlXmlDoc, SAMLAssertion);
}

// Called from 'onBeforeRequestEvent' function.
// Gets a Role Attribute from a SAMLAssertion as function argument. Gets the SAMLAssertion as a second argument.
// This function extracts the RoleArn and PrincipalArn (SAML-provider)
// from this argument and uses it to call the AWS STS assumeRoleWithSAML API.
function extractPrincipalPlusRoleAndAssumeRole(samlattribute, SAMLAssertion) {
  // Pattern for Role
  var reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,<]+/i;
  // Patern for Principal (SAML Provider)
  var rePrincipal = /arn:aws:iam:[^:]*:[0-9]+:saml-provider\/[^,<]+/i;
  // Extraxt both regex patterns from SAMLAssertion attribute
  RoleArn = samlattribute.match(reRole)[0];
  PrincipalArn = samlattribute.match(rePrincipal)[0];

  if (DebugLogs) {
    console.log("RoleArn: " + RoleArn);
    console.log("PrincipalArn: " + PrincipalArn);
  }

  // Set parameters needed for assumeRoleWithSAML method
  var params = {
    PrincipalArn: PrincipalArn,
    RoleArn: RoleArn,
    SAMLAssertion: SAMLAssertion,
  };
  // if (SessionDuration !== null) {
  //   params['DurationSeconds'] = SessionDuration;
  // }

  // Call STS API from AWS
  var sts = new AWS.STS();
  sts.assumeRoleWithSAML(params, function (err, data) {
    if (err) console.log(err, err.stack); // an error occurred
    else {
      // On succesful API response create file with the STS keys
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

      // If there are no Role ARNs configured in the options panel, continue to create credentials file
      // Otherwise, extend docContent with a profile for each specified ARN in the options panel
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

// This Listener receives messages from options.js and popup.js
// Received messages are meant to affect the background process.
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  // When the options are changed in the Options panel
  // these items need to be reloaded in this background process.
  if (request.action == "reloadStorageItems") {
    loadItemsFromStorage();
    sendResponse({ message: "Storage items reloaded in background process." });
  }
  // When the activation checkbox on the popup screen is checked/unchecked
  // the webRequest event listener needs to be added or removed.
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
