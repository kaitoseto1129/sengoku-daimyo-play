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
assert.equal(tracker.titleFromPath('/'), 'sengoku_daimyo');
assert.equal(tracker.titleFromPath('/risshin/'), 'sengoku_risshin');
assert.equal(tracker.titleFromPath('/risshin-lp/'), 'sengoku_risshin');

const store = storage();
const gtagCalls = [];
const fbqCalls = [];
const env = {
  location: { search: cases[2][0], pathname: '/lp/' },
  localStorage: store,
  dataLayer: [],
  gtag: (...args) => gtagCalls.push(args),
  fbq: (...args) => fbqCalls.push(args),
  now: () => 1234,
};
const api = tracker.createApi(env);
assert.equal(api.attribution.first.source, 'meta');
assert.equal(api.attribution.last.route, 'lp');

assert.deepEqual(api.emit('app_store_click', { sd_link_position: 'hero_appstore_click' }), {
  event: 'sd_app_store_click',
  sd_title: 'sengoku_daimyo',
  sd_source: 'meta',
  sd_medium: 'paid_social',
  sd_campaign: 'ab_1012',
  sd_content: 'lp',
  sd_route: 'lp',
  sd_link_position: 'hero_appstore_click',
});
assert.equal(gtagCalls[0][0], 'event');
assert.equal(gtagCalls[0][1], 'sd_app_store_click');
assert.equal(gtagCalls[0][2].sd_title, 'sengoku_daimyo');
assert.equal(gtagCalls[0][2].transport_type, 'beacon');
assert.deepEqual(fbqCalls[0].slice(0, 2), ['trackCustom', 'SDAppStoreClick']);
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

const risshinGtag = [];
const risshinFbq = [];
const risshin = tracker.createApi({
  location: { search: '?utm_source=google&utm_medium=cpc&utm_campaign=sr_video', pathname: '/risshin/' },
  dataLayer: [],
  gtag: (...args) => risshinGtag.push(args),
  fbq: (...args) => risshinFbq.push(args),
});
const risshinStart = risshin.emit('game_start', { sd_start_mode: 'continue' });
assert.equal(risshinStart.sd_title, 'sengoku_risshin');
assert.equal(risshinGtag[0][1], 'sd_game_start');
assert.equal(risshinFbq[0][1], 'SDGameStart');
assert.equal(risshinFbq[0][2].sd_title, 'sengoku_risshin');

let clickHandler;
const boundEvents = [];
const boundApi = tracker.createApi({
  location: { search: '?utm_source=meta&utm_medium=paid_social&utm_campaign=sr_launch&utm_content=lp', pathname: '/risshin-lp/' },
  dataLayer: boundEvents,
});
boundApi.bind({ addEventListener: (type, handler) => { if (type === 'click') clickHandler = handler; } });
const linkTarget = (attrs) => ({
  closest: (selector) => selector === 'a' ? {
    id: attrs.id || '',
    hasAttribute: (name) => Boolean(attrs[name]),
    getAttribute: (name) => name === 'href' ? attrs.href : (attrs[name] || null),
  } : null,
});
clickHandler({ target: linkTarget({ href: '../risshin/' }) });
clickHandler({ target: linkTarget({ href: 'https://apps.apple.com/jp/app/id6816750198', id: 'as' }) });
assert.equal(boundEvents[0].event, 'sd_lp_to_game');
assert.equal(boundEvents[1].event, 'sd_app_store_click');
assert.equal(boundEvents[1].sd_title, 'sengoku_risshin');

console.log('ads attribution: PASS');
