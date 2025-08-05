// importScripts("../lib/aws-sdk.min.js");

const DebugLogs = false;
let LF = "\n";

browser.webNavigation.onBeforeNavigate.addListener(() => {
  console.log("CloudKeeper - Credential Helper - Service Worker active");
});

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install" || details.reason === "update") {
    browser.tabs.create({ url: "../options/changelog.html" });
  }
});

function addOnBeforeRequestEventListener() {
  if (DebugLogs) console.log("DEBUG: Extension is activated");

  if (browser.webRequest.onBeforeRequest.hasListener(onBeforeRequestEvent)) {
    console.warn("Listener already attached");
  } else {
    browser.webRequest.onBeforeRequest.addListener(
      onBeforeRequestEvent,
      { urls: ["https://signin.aws.amazon.com/saml"] },
      ["requestBody"]
    );
    if (DebugLogs) console.log("DEBUG: onBeforeRequest listener added");
  }
}
addOnBeforeRequestEventListener();

function onBeforeRequestEvent(details) {
  if (DebugLogs) console.log("DEBUG: onBeforeRequest triggered");

  let samlXmlDoc = "";
  let formDataPayload;

  if (details.requestBody.formData) {
    samlXmlDoc = decodeURIComponent(
      unescape(atob(details.requestBody.formData.SAMLResponse[0]))
    );
  } else if (details.requestBody.raw) {
    let combined = new ArrayBuffer(0);
    details.requestBody.raw.forEach((element) => {
      let tmp = new Uint8Array(combined.byteLength + element.bytes.byteLength);
      tmp.set(new Uint8Array(combined), 0);
      tmp.set(new Uint8Array(element.bytes), combined.byteLength);
      combined = tmp.buffer;
    });
    const decoder = new TextDecoder("utf-8");
    formDataPayload = new URLSearchParams(decoder.decode(new DataView(combined)));
    samlXmlDoc = decodeURIComponent(
      unescape(atob(formDataPayload.get("SAMLResponse")))
    );
  }

  const SAMLAssertion = formDataPayload
    ? formDataPayload.get("SAMLResponse")
    : details.requestBody.formData?.SAMLResponse[0];

  if (!SAMLAssertion) return;

  extractAndAssumeRole(samlXmlDoc, SAMLAssertion);
}

function extractAndAssumeRole(samlattribute, SAMLAssertion) {
  const reRole = /arn:aws:iam::(\d+):role\/([^,<]+)/i;
  const rePrincipal = /arn:aws:iam::\d+:saml-provider\/[^,<]+/i;
  const reSessionDuration = /SessionNotOnOrAfter="([^"]+)"/;

  const RoleArnMatch = samlattribute.match(reRole);
  const PrincipalArn = samlattribute.match(rePrincipal)?.[0];
  const SessionEnd = samlattribute.match(reSessionDuration)?.[1];

  if (!RoleArnMatch || !PrincipalArn || !SessionEnd) {
    console.warn("SAML parsing failed");
    return;
  }

  const RoleArn = RoleArnMatch[0];
  const accountId = RoleArnMatch[1];
  const roleName = RoleArnMatch[2];

  const start = new Date().getTime();
  const end = new Date(SessionEnd).getTime();
  let seconds = Math.floor(Math.abs(end - start) / 1000);
  seconds = seconds > 3900 ? seconds - 300 : seconds;

  const baseParams = {
    PrincipalArn: PrincipalArn,
    RoleArn: RoleArn,
    SAMLAssertion: SAMLAssertion
  };

  const sts = new AWS.STS();

  function assumeWithDuration(duration) {
    const params = { ...baseParams, DurationSeconds: duration };
    sts.assumeRoleWithSAML(params, function (err, data) {
      if (err) {
        console.error("STS Error:", err);
        if (
          err.code === "ValidationError" &&
          err.message.includes("DurationSeconds")
        ) {
          console.warn("Retrying with 3600 seconds due to max session restriction");
          // Retry with max allowed default
          sts.assumeRoleWithSAML(
            { ...baseParams, DurationSeconds: 3600 },
            function (err2, data2) {
              if (err2) {
                console.error("Retry failed:", err2);
              } else {
                createCredentialArtifacts(data2, accountId, roleName);
              }
            }
          );
        }
      } else {
        createCredentialArtifacts(data, accountId, roleName);
      }
    });
  }

  assumeWithDuration(seconds);
}

function createCredentialArtifacts(data, accountId, roleName) {
  const docContentCred = [
    "[default]",
    "aws_access_key_id = " + data.Credentials.AccessKeyId,
    "aws_secret_access_key = " + data.Credentials.SecretAccessKey,
    "aws_session_token = " + data.Credentials.SessionToken
  ].join(LF);

  const docContentEnv = [
    `export AWS_ACCESS_KEY_ID="${data.Credentials.AccessKeyId}"`,
    `export AWS_SECRET_ACCESS_KEY="${data.Credentials.SecretAccessKey}"`,
    `export AWS_SESSION_TOKEN="${data.Credentials.SessionToken}"`
  ].join(LF);

  const docContentPwShEnv = [
    `$Env:AWS_ACCESS_KEY_ID="${data.Credentials.AccessKeyId}"`,
    `$Env:AWS_SECRET_ACCESS_KEY="${data.Credentials.SecretAccessKey}"`,
    `$Env:AWS_SESSION_TOKEN="${data.Credentials.SessionToken}"`
  ].join(LF);

  saveCredentials(docContentEnv, docContentCred, docContentPwShEnv, accountId, roleName);
}

async function saveCredentials(docContentEnv, docContentCred, docContentPwShEnv, accountId, roleName) {
  try {
    const newEntry = {
      credentialsFile: docContentCred,
      env_variables: docContentEnv,
      pwsh_env_variables: docContentPwShEnv,
      lastRefreshed: Date.now(),
      accountId,
      roleName
    };

    const result = await browser.storage.local.get(['credentialHistory']);
    const history = result.credentialHistory || [];

    // Only remove exact duplicates (all fields match)
    const updated = [newEntry, ...history.filter(entry =>
      !(
        entry.accountId === newEntry.accountId &&
        entry.roleName === newEntry.roleName &&
        entry.credentialsFile === newEntry.credentialsFile &&
        entry.env_variables === newEntry.env_variables &&
        entry.pwsh_env_variables === newEntry.pwsh_env_variables
      )
    )];

    const trimmed = updated.slice(0, 5); // Keep latest 5

    await browser.storage.local.set({
      credentialHistory: trimmed,
      currentCredentials: newEntry
    });

    if (DebugLogs) {
      console.log("Saved credential:", newEntry);
      console.log("Updated history:", trimmed);
    }

  } catch (err) {
    console.error("Error saving credentials:", err.message);
  }
}
