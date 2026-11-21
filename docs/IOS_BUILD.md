# FarmPro iOS — Xcode project

## Current state

This is the first bundled iOS client for the existing production service. The app identifier is `jp.farmpro.app`, the App Store version is `1.0`, and the initial build number is `1`. The existing website and server are not deployed or modified by this work.

The web client is built into the app. No remote `server.url` is configured. Capacitor and its iOS Swift runtime are pinned to `8.6.2`. The deployment target is iOS 15.0; use Xcode 26 or later on a compatible Mac.

The downloadable Xcode ZIP includes compiled web assets and the local Swift plugin packages. It can be opened without installing Node.js. The first Xcode open requires internet access to resolve the Capacitor and filesystem Swift dependencies.

## Mac: open, sign, and run

1. Install and open Xcode from the Mac App Store. Complete its initial setup and install an iOS platform/runtime when prompted.
2. Extract `FarmPro-iOS-Xcode.zip`. Open `FarmPro-iOS/App.xcodeproj` inside the extracted folder. Do not open the nested Swift package instead.
3. In Xcode, select the blue **App** project, then **TARGETS → App → Signing & Capabilities**. Leave **Automatically manage signing** enabled and choose the paid Apple Developer membership under **Team**. Keep **Bundle Identifier** as `jp.farmpro.app`.
4. If the team is missing, add the Apple Account in **Xcode → Settings → Accounts**. Enter credentials only in Apple's sign-in screen.
5. Select an iPhone simulator in the run destination menu and press the triangular Run button. Next, test on a connected iPhone with Developer Mode enabled when requested.
6. Log in with the existing FarmPro review account using the password already saved in App Store Connect. The ZIP contains no passwords or production account data.

## Required device checks before upload

The checks below have not been performed in this Linux workspace. Native compilation, signing, and device behavior remain to be verified on the Mac.

- App starts, email/password login works, and the expected review farm is displayed.
- Existing farm data can be read and a disposable review record can be saved and reloaded. Do not test destructive actions against real farm records.
- CSV and backup export show the iOS share sheet and can be saved to Files; cancelling does not show a false success message.
- Print/PDF actions open the iOS print interface.
- Camera/photo selection, OCR, audio input where available, and keyboard/safe-area layout work on the target iPhone. These native permission-dependent features are not yet device-verified.
- Network failure and expired sign-in return usable error messages.
- The user-facing account settings and withdrawal/deletion flow are reachable.

## Upload after device verification

1. In Xcode, choose an iOS device/archive destination rather than a simulator, then **Product → Archive**.
2. In Organizer, choose the new archive, **Distribute App → App Store Connect → Upload** and follow Apple's validation steps.
3. After Apple processes the upload, select build `1` in FarmPro's App Store Connect version `1.0` Build section.
4. Resolve export-compliance questions using the app's actual encryption behavior. This project deliberately does not assert an unverified encryption exemption in Info.plist.
5. Complete screenshots, privacy disclosures and any other required metadata before submitting for review. Uploading a build does not itself submit the app for review.

Increment the build number for any replacement binary Apple has already received.

## Native behavior and remaining review issues

- Email/password sign-in and password reset are retained. Native LINE sign-in and new-account registration are hidden; the existing web LINE cookie-based callback has not been ported to the native origin.
- Native purchase/upgrade entry points are hidden for all native users, and the paid-plan route redirects before mounting its web payment hooks. Existing contract cancellation access is retained. The website's existing entry points are unchanged.
- Native API calls go only to the existing production API at `https://app.farmpro-app.jp`. The adapter preserves the application's supplied authentication/sync headers; it does not invent cookies or an Origin header. Redirects are not followed with credentials.
- Backups and CSV exports use temporary per-operation cache files and the native share sheet. Temporary export files are cleaned up after the sheet closes.
- Printing uses the native iOS print controller. External HTTP(S) links use the native browser after existing application click guards have run.
- Push-notification registration and PWA installation/update prompts are skipped in the native app; a native push integration is not included.
- The included privacy manifest declares the required filesystem timestamp reason. It is not a substitute for App Store Connect's app-data collection disclosures.
- **Existing server limitation:** account deletion currently blocks non-Free plans, including the complimentary Pro review account. The server was not changed here. This needs to be resolved or accurately documented before submission; do not claim that Pro account deletion has been tested or is complete.
- App Store approval is not established by packaging. Payment-policy eligibility, account deletion, privacy/third-party AI disclosure, and minimum-functionality review must be assessed against the final binary and service behavior.

## Developer rebuild from the Git repository

Requirements: Node.js 22 or later and Xcode 26 or later. The repository's client TypeScript checks also reference existing server-side test types, so install both dependency sets.

```bash
cd server
npm ci
cd ../client
npm ci
node scripts/copy-ocr-assets.mjs
npm run ios:sync
npm run ios:open
```

`ios:sync` builds the client, copies its assets into the native project, syncs plugins, and restores the exact Swift runtime pin. Run it after every client change before archiving. Opening an old Xcode project without syncing will package old web assets.

Do not run `cap add ios` over this project. The checked-in app contains custom printing registration, permissions, privacy resources, and FarmPro icons.

## Verification completed here

- Whole-client TypeScript check and production Vite build.
- Capacitor iOS asset/plugin sync and exact Swift runtime version pin.
- Focused automated tests for API routing, abort/redirect handling, native navigation/login guards, file export, backup callers, and click-guard ordering.
- Native source and project-reference inspection, including registration of the print plugin from the displayed scene controller.

Not completed here: Xcode compilation, iPhone/simulator run, Apple signing, archive validation, upload, or App Review submission.

## Official references

- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/ios
- https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/
- https://developer.apple.com/app-store/review/guidelines/
