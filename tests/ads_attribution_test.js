const assert = require('node:assert/strict');
const tracker = require('../ads-attribution.js');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    values,
  };
}

const cases = [
  ['?utm_source=meta&utm_medium=paid_social&utm_campaign=ab_1012&utm_content=direct', '/', 'meta', 'web_direct'],
  ['?utm_source=google&utm_medium=cpc&utm_campaign=ab_1012&utm_content=direct', '/', 'google', 'web_direct'],
  ['?utm_source=meta&utm_medium=paid_social&utm_campaign=ab_1012&utm_content=lp', '/lp/', 'meta', 'lp'],
  ['?utm_source=google&utm_medium=cpc&utm_campaign=ab_1012&utm_content=lp', '/lp/', 'google', 'lp'],
];

for (const [search, pathname, source, route] of cases) {
  const parsed = tracker.parse(search, pathname);
  assert.equal(parsed.source, source);
  assert.equal(parsed.campaign, 'ab_1012');
  assert.equal(parsed.route, route);
}

const store = storage();
const env = {
  location: { search: cases[2][0], pathname: '/lp/' },
  localStorage: store,
  dataLayer: [],
  now: () => 1234,
};
const api = tracker.createApi(env);
assert.equal(api.attribution.first.source, 'meta');
assert.equal(api.attribution.last.route, 'lp');

assert.deepEqual(api.emit('app_store_click', { sd_link_position: 'hero_appstore_click' }), {
  event: 'sd_app_store_click',
  sd_source: 'meta',
  sd_medium: 'paid_social',
  sd_campaign: 'ab_1012',
  sd_content: 'lp',
  sd_route: 'lp',
  sd_link_position: 'hero_appstore_click',
});
assert.equal(api.mapLegacyEvent('title/start-click').event, 'sd_game_start_click');
assert.equal(api.mapLegacyEvent('start/nagashino/oda').event, 'sd_game_start');
assert.equal(api.mapLegacyEvent('funnel/map-45m').event, 'sd_stay_45m');
assert.equal(api.mapLegacyEvent('battle/win'), null);

const returning = tracker.createApi({
  location: { search: '', pathname: '/' },
  localStorage: store,
  dataLayer: [],
  now: () => 5678,
});
assert.equal(returning.attribution.first.source, 'meta');
assert.equal(returning.attribution.last.source, 'meta');

const noStorageLayer = [];
const noStorage = tracker.createApi({
  location: { search: cases[1][0], pathname: '/' },
  dataLayer: noStorageLayer,
  now: () => 9999,
});
assert.equal(noStorage.attribution.last.source, 'google');
assert.equal(noStorage.emit('game_start').event, 'sd_game_start');
assert.equal(noStorageLayer.length, 1);

console.log('ads attribution: PASS');
