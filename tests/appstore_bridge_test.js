const fs = require('fs');
const assert = require('assert');

const cases = [
  ['appstore/index.html', '6811255282', "app:'daimyo'"],
  ['risshin-appstore/index.html', '6816750198', "app:'risshin'"]
];

for (const [file, appId, eventApp] of cases) {
  const html = fs.readFileSync(file, 'utf8');
  assert(html.includes(`id${appId}`), `${file}: App Store ID`);
  assert(html.includes('1134385575587937'), `${file}: Meta Pixel`);
  assert(html.includes("fbq('track', 'PageView')"), `${file}: PageView`);
  assert(html.includes("fbq('trackCustom', 'LPClick'"), `${file}: LPClick`);
  assert(html.includes(eventApp), `${file}: app event discriminator`);
  assert(html.includes("source === 'google'"), `${file}: Google ct switch`);
}

console.log('appstore_bridge_test: PASS');
