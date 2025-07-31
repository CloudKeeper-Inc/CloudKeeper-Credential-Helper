importScripts("../lib/aws-sdk.min.js");

var FileName = "credentials";
var DebugLogs = false;
var RoleArns = {};
var LF = "\n";

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  console.log(
    "Keeping alive -CloudKeeper - Credential Helper - Service Worker"
  );
});

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
addOnBeforeRequestEventListener();

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
    console.log("hasRoleIndex: " + hasRoleIndex);
    console.log("roleIndex: " + roleIndex);
  }

  extractPrincipalPlusRoleAndAssumeRole(samlXmlDoc, SAMLAssertion);
}

function extractPrincipalPlusRoleAndAssumeRole(samlattribute, SAMLAssertion) {
  var reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,<]+/i;
  var rePrincipal = /arn:aws:iam:[^:]*:[0-9]+:saml-provider\/[^,<]+/i;
  var reSessionDuration = /SessionNotOnOrAfter=.*Z"/g;

  SessionNotOnOrAfter = samlattribute.match(reSessionDuration)[0];
  sliced = SessionNotOnOrAfter.slice(21, -1);
  max_timestamp = new Date(sliced).toISOString();
  current_timestamp = new Date().toISOString();
  console.log(current_timestamp);
  console.log(max_timestamp);

  const start = new Date(current_timestamp).getTime();
  const end = new Date(max_timestamp).getTime();
  let seconds = Math.round(Math.abs(end - start) / 1000);
  const days = Math.floor(seconds / 86400);
  seconds -= days * 86400;
  const hours = Math.floor(seconds / 3600);
  seconds -= hours * 3600;
  minutes = Math.floor(seconds / 60);
  seconds -= minutes * 60;
  seconds += hours * 3600 + minutes * 60;

  RoleArn = samlattribute.match(reRole)[0];
  PrincipalArn = samlattribute.match(rePrincipal)[0];

  // Extract account ID and role name
  const roleParts = RoleArn.match(/arn:aws:iam::(\d+):role\/(.+)/);
  const accountId = roleParts ? roleParts[1] : "";
  const roleName = roleParts ? roleParts[2] : "";

  if (DebugLogs) {
    console.log("RoleArn: " + RoleArn);
    console.log("PrincipalArn: " + PrincipalArn);
    console.log("Extracted Account ID: " + accountId);
    console.log("Extracted Role Name: " + roleName);
  }

  var params = {
    PrincipalArn: PrincipalArn,
    RoleArn: RoleArn,
    SAMLAssertion: SAMLAssertion,
  };

  if (seconds > 3900) {
    params.DurationSeconds = seconds - 300;
  }

  var sts = new AWS.STS();
  sts.assumeRoleWithSAML(params, function (err, data) {
    if (err) {
      console.log("Handling session duration mismatch between SSO and IAM");
      var new_sts = new AWS.STS();
      new_sts.assumeRoleWithSAML(params, function (err, data) {
        if (err) console.log(err, err.stack);
        else createCredentialArtifacts(data, accountId, roleName);
      });
    } else {
      createCredentialArtifacts(data, accountId, roleName);
    }
  });
}


function createCredentialArtifacts(data, accountId, roleName) {
  const LF = '\n'; // <-- Add this!

  const docContentCred =
    "[default]" + LF +
    "aws_access_key_id = " + data.Credentials.AccessKeyId + LF +
    "aws_secret_access_key = " + data.Credentials.SecretAccessKey + LF +
    "aws_session_token = " + data.Credentials.SessionToken;

  const docContentEnv = [
    'export AWS_ACCESS_KEY_ID="', data.Credentials.AccessKeyId, '"\n',
    'export AWS_SECRET_ACCESS_KEY="', data.Credentials.SecretAccessKey, '"\n',
    'export AWS_SESSION_TOKEN="', data.Credentials.SessionToken, '"'
  ].join('');

  const docContentPwShEnv = [
    '$Env:AWS_ACCESS_KEY_ID="', data.Credentials.AccessKeyId, '"\n',
    '$Env:AWS_SECRET_ACCESS_KEY="', data.Credentials.SecretAccessKey, '"\n',
    '$Env:AWS_SESSION_TOKEN="', data.Credentials.SessionToken, '"'
  ].join('');

  saveCredentials(docContentEnv, docContentCred, docContentPwShEnv, accountId, roleName);
}

function saveCredentials(docContentEnv, docContentCred, docContentPwShEnv, accountId, roleName) {
  try {
    const newEntry = {
      credentialsFile: docContentCred,
      env_variables: docContentEnv,
      pwsh_env_variables: docContentPwShEnv,
      lastRefreshed: Date.now(),
      accountId,
      roleName
    };

    chrome.storage.local.get(['credentialHistory'], (result) => {
      const history = result.credentialHistory || [];

      // Optional: avoid duplicate entries
      const filtered = history.filter(
        (entry) => !(entry.accountId === accountId && entry.roleName === roleName)
      );

      filtered.unshift(newEntry);
      const trimmedHistory = filtered.slice(0, 5);

      chrome.storage.local.set({
        credentialHistory: trimmedHistory,
        currentCredentials: newEntry // Combine into one set call
      });
    });

  } catch (err) {
    console.error("Error saving credentials:", err.message);
  }
}
