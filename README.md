# CloudKeeper - Credential Helper
## Installation
- The extension can be installed directly from the Chrome Web Store to any Chromium-based browser (like, Chromium, Google Chrome, Microsoft Edge, Opera, Brave, and others)
- Link to the Chrome Web Store page is available [here](https://chrome.google.com/webstore/detail/cloudkeeper-credential-he/mpljkpamdjfdjmfcpnlmhhakbjigjjcd)
## Browser Support
All Chromium-based browsers are supported. List is available [here](https://en.wikipedia.org/wiki/Chromium_(web_browser)#Browsers_based_on_Chromium).

The extension can be directly installed from the [Chrome Web Store](https://chrome.google.com/webstore/detail/cloudkeeper-credential-he/mpljkpamdjfdjmfcpnlmhhakbjigjjcd), regardless of the browser.

## Overview
When using External AWS Accounts in AWS IAM Identity Center (SSO) does not provide the functionality of retrieving the CLI credentials.

To overcome this limitation, the CloudKeeper - Credential Helper extension was developed. This extension retrieves the STS keys and displays it in the popup window of the extension.

## Security Overview
- Uses [Chrome Manifest v3](https://developer.chrome.com/docs/extensions/mv3/intro/)
- Uses [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) (instead of background pages) for enhanced security. Because of the service worker, the extension is treated as a proxy server-side application and hence has no control to the user's local data (like, automatically downloading files, etc.)
- The credentials can be viewed only once, post which the popup window is automatically cleared
- The credentials are stored in the user's local storage and cleared once viewed

## Architecture Overview
- The service worker for the extension is triggered anytime a user or a request goes through `https://signin.aws.amazon.com/saml`
- The SAML assertion being sent to AWS's SAML endpoint is retrieved and a AssumeRoleWithSAML call is made to AWS STS
- For sending the call to STS, AWS SDK is used. The STS controls were retrieved from the [AWS JS SDK repository on GitHub](https://github.com/aws/aws-sdk-js). Then the TypeScript SDK was modified and transpiled to a minifed JavaScript file.
- Once the response is received by the service worker from AWS, the credentials are retrieved and stored on the disk
- When the user clicks on the extension, the credentials are retrieved from the disk and displayed on the extension popup
- When the user clicks away from the extension, the credential data is cleared from the disk
