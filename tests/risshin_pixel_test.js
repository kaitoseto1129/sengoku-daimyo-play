const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('risshin/index.html', 'utf8');
const script = [...html.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1])
  .find((source) => source.includes('__risshinMetaTrack'));

assert.ok(script, 'Meta Pixel script is present');

const listeners = new Map();
let observerCallback;
let introTitle = { textContent: '桶狭間の戦い' };
const documentMock = {
  body: {},
  createElement: () => ({}),
  getElementsByTagName: () => [{ parentNode: { insertBefore: () => {} } }],
  addEventListener: (type, callback) => listeners.set(type, callback),
  getElementById: (id) => (id === 'intro-title' ? introTitle : null),
  querySelectorAll: () => [],
};

global.location = { hostname: 'kaitoseto1129.github.io' };
global.document = documentMock;
global.window = { document: documentMock };
global.MutationObserver = class {
  constructor(callback) { observerCallback = callback; }
  observe() {}
};

new Function(script)();

const click = (id, textContent = '') => {
  const button = { id, textContent, closest: () => button };
  listeners.get('click')({ target: button });
};

click('b-cont');
click('ng-next', 'この名で始める');
click('intro-go');
listeners.get('DOMContentLoaded')();

const result = {
  nodeType: 1,
  matches: (selector) => selector === '.eval.ev2',
  querySelectorAll: () => [],
  querySelector: (selector) => ({
    '.ek-h h2': { textContent: '姉川の戦い' },
    '.ek-seal': { firstChild: { textContent: '甲' } },
    '.ev-sum .t strong': { textContent: '123' },
  })[selector] || null,
};
observerCallback([{ addedNodes: [result] }]);

const calls = window.fbq.queue.map((args) => Array.from(args));
assert.deepEqual(calls[0], ['init', '1134385575587937']);
assert.deepEqual(calls[1], ['track', 'PageView']);
assert.deepEqual(calls[2], ['trackCustom', 'GameStart', { mode: 'continue' }]);
assert.deepEqual(calls[3], ['trackCustom', 'GameStart', { mode: 'new' }]);
assert.deepEqual(calls[4], ['trackCustom', 'BattleStart', { battle: '桶狭間の戦い' }]);
assert.deepEqual(calls[5], ['trackCustom', 'GameResult', { battle: '姉川の戦い', grade: '甲', merit: 123 }]);

console.log('risshin Meta Pixel events: PASS');
