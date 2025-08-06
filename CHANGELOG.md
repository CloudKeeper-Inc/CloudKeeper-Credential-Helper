# Changelog

## [1.0.0] 2022-07-02
- Initial
## [1.0.1] 2022-07-06
- Added support for persistent service worker so that the extension does not shut down automatically in some time.
## [1.0.2] 2022-09-20
- Fixed persistence of service worker to make the extension compatible with tools like Okta, OneLogin, etc.

## [1.1.0] 2022-11-09
- Added SessionDuration feature. The SessionDuration will be picked from the SAML assertion. SessionDuration must be same in IAM Identity Center and the destination IAM Role.

## [1.1.1] 2022-11-15
- Updated SessionDuration feature.

## [1.1.2] 2022-11-16
- Updated the code to use default session duration when there is a mismatch in session duration between IAM and SSO.

## [1.2.0] 2023-06-08
- Updated the popup to display both credentials for .aws/credentials file and for exporting to environment variables

## [1.3.0] 2024-02-05
- Added copy buttons to the popup window

## [1.4.0] 2025-05-13
- Updated to now display PowerShell AWS environment variables, alongside the previously existing credentials for the .aws/credentials file and options for exporting to environment variables.

## [1.5.0] 2025-06-19
- Da extension now feels bonita 💅

## [1.6.0] 2025-07-13
- Added last updated info, so you can stop playing credential archaeology.
