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
  const reRole = /arn:aws:iam:[^:]*:[0-9]+:role\/[^,<]+/i;
  const rePrincipal = /arn:aws:iam:[^:]*:[0-9]+:saml-provider\/[^,<]+/i;
  const reSessionDuration = /SessionNotOnOrAfter=.*Z"/g;

  const SessionNotOnOrAfter = samlattribute.match(reSessionDuration)?.[0];
  const sliced = SessionNotOnOrAfter?.slice(21, -1);
  const max_timestamp = new Date(sliced).toISOString();
  const current_timestamp = new Date().toISOString();

  const start = new Date(current_timestamp).getTime();
  const end = new Date(max_timestamp).getTime();
  let seconds = Math.floor(Math.abs(end - start) / 1000);
  seconds = seconds > 3900 ? seconds - 300 : seconds;

  const RoleArn = samlattribute.match(reRole)?.[0];
  const PrincipalArn = samlattribute.match(rePrincipal)?.[0];

  const roleParts = RoleArn?.match(/arn:aws:iam::(\d+):role\/(.+)/);
  const accountId = roleParts ? roleParts[1] : "";
  const roleName = roleParts ? roleParts[2] : "";

  const params = {
    PrincipalArn: PrincipalArn,
    RoleArn: RoleArn,
    SAMLAssertion: SAMLAssertion,
    ...(seconds > 0 ? { DurationSeconds: seconds } : {})
  };

  const sts = new AWS.STS();

  // Try with calculated seconds
  sts.assumeRoleWithSAML(params, function (err, data) {
    if (err && err.code === "ValidationError" && err.message.includes("DurationSeconds")) {
      // Retry with 3600 seconds fallback
      console.warn("Retrying with DurationSeconds = 3600 due to MaxSessionDuration limit");
      const fallbackParams = {
        ...params,
        DurationSeconds: 3600
      };
      sts.assumeRoleWithSAML(fallbackParams, function (err2, data2) {
        if (err2) {
          console.error("Retry also failed:", err2);
        } else {
          createCredentialArtifacts(data2, accountId, roleName);
        }
      });
    } else if (err) {
      console.error("STS Error:", err);
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
