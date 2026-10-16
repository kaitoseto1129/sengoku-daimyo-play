const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('risshin-lp/index.html', 'utf8');
const script = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes("window.fbq('init', '1134385575587937')"));

assert.ok(script, 'Meta Pixel base script is present on the Risshin LP');
assert.match(html, /<script src="\.\.\/ads-attribution\.js"><\/script>/);
assert.match(html, /G-CSH4DJMT91/);
assert.match(html, /apps\.apple\.com\/jp\/app\/id6816750198/);
assert.doesNotMatch(html, /apps\.apple\.com\/jp\/app\/id6811255282/);

const documentMock = {
  createElement: () => ({}),
  getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
};

global.location = { hostname: 'kaitoseto1129.github.io' };
global.document = documentMock;
global.window = { document: documentMock };

new Function(script)();

const calls = window.fbq.queue.map((args) => Array.from(args));
assert.deepEqual(calls[0], ['init', '1134385575587937']);
assert.deepEqual(calls[1], ['track', 'PageView']);

console.log('risshin LP Meta Pixel and shared conversions: PASS');
