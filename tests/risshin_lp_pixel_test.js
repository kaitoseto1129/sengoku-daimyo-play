const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('risshin-lp/index.html', 'utf8');
const script = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes("'LPClick'"));

assert.ok(script, 'Meta Pixel script is present on the Risshin LP');
assert.match(html, /apps\.apple\.com\/jp\/app\/id6816750198/);
assert.doesNotMatch(html, /apps\.apple\.com\/jp\/app\/id6811255282/);

const listeners = new Map();
const documentMock = {
  createElement: () => ({}),
  getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
  addEventListener: (type, callback) => listeners.set(type, callback),
};

global.location = { hostname: 'kaitoseto1129.github.io' };
global.document = documentMock;
global.window = { document: documentMock };

new Function(script)();

const click = (href) => {
  const link = { getAttribute: () => href };
  listeners.get('click')({ target: { closest: () => link } });
};

click('../risshin/');
click('https://apps.apple.com/jp/app/id6816750198');

const calls = window.fbq.queue.map((args) => Array.from(args));
assert.deepEqual(calls[0], ['init', '1134385575587937']);
assert.deepEqual(calls[1], ['track', 'PageView']);
assert.deepEqual(calls[2], ['trackCustom', 'LPClick', { destination: 'web_game' }]);
assert.deepEqual(calls[3], ['trackCustom', 'LPClick', { destination: 'app_store' }]);

console.log('risshin LP Meta Pixel events: PASS');
