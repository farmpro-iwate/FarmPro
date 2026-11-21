import fs from 'node:fs/promises';

// Keep Swift and JavaScript on the exact tested Capacitor version after sync.
const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.dependencies['@capacitor/core'];
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Capacitor must use an exact version.');
const path = new URL('../ios/App/CapApp-SPM/Package.swift', import.meta.url);
let swift = await fs.readFile(path, 'utf8');
const pattern = /(\.package\(url: "https:\/\/github.com\/ionic-team\/capacitor-swift-pm.git", )(?:from|exact): "[^"]+"\)/;
if (!pattern.test(swift)) throw new Error('Capacitor Swift package dependency not found.');
swift = swift.replace(pattern, `$1exact: "${version}")`);
await fs.writeFile(path, swift);
console.log(`Capacitor Swift runtime pinned to ${version}.`);
