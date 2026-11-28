#!/usr/bin/env node
// Preflight only: no network access, signing, uploads or live data mutations.
import fs from "node:fs";
const file = new URL("./twa-manifest.json", import.meta.url);
const m = JSON.parse(fs.readFileSync(file, "utf8"));
const errors=[];
if(m.packageId!=="jp.farmpro.app") errors.push("Unexpected Android package ID");
if(m.host!=="app.farmpro-app.jp") errors.push("Unexpected production host");
if(m.startUrl!=="/") errors.push("Start path must remain /");
if(m.webManifestUrl!=="https://app.farmpro-app.jp/manifest.webmanifest") errors.push("Unexpected PWA manifest URL");
if(m.iconUrl!=="https://app.farmpro-app.jp/farmpro-icon-blue.png") errors.push("Approved blue icon URL missing");
if(!Number.isSafeInteger(m.appVersionCode)||m.appVersionCode<1) errors.push("Invalid version code");
if(!m.signingKey?.path?.endsWith(".keystore")) errors.push("Expected local signing keystore reference");
for(const key of ["targetSdkVersion","compileSdkVersion"]) {
  if(key in m && Number(m[key])<36) errors.push(key+" must be >=36");
}
if(errors.length){console.error(errors.join("\n"));process.exitCode=1;}
else {
  console.log("Draft TWA values valid; Android project not yet generated.");
  console.log("Verify targetSdk >=36 in generated Gradle project before building.");
  console.log("Do not commit signing key or passwords.");
}
