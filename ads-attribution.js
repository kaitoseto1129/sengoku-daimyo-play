(function (root) {
  'use strict';

  var STORAGE_KEY = 'sd_ads_attribution_v1';

  function memoryStorage() {
    var values = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
      setItem: function (key, value) { values[key] = String(value); }
    };
  }

  function availableStorage(env) {
    try {
      if (env.localStorage && typeof env.localStorage.getItem === 'function') return env.localStorage;
    } catch (_) {}
    return memoryStorage();
  }

  function clean(value, max) {
    return String(value || '').replace(/[^a-zA-Z0-9._-]/g, '').slice(0, max || 80);
  }

  function parse(search, pathname) {
    var query = new URLSearchParams(search || '');
    var source = clean(query.get('utm_source') || query.get('src') || (query.get('fbclid') ? 'meta' : query.get('gclid') ? 'google' : ''), 32);
    var medium = clean(query.get('utm_medium'), 32);
    var campaign = clean(query.get('utm_campaign'), 64);
    var content = clean(query.get('utm_content'), 32);
    var route = content === 'direct' ? 'web_direct' : content === 'lp' || /\/lp\//.test(pathname || '') ? 'lp' : query.get('from') === 'lp' ? 'lp' : 'web_direct';
    return {
      source: source || 'direct',
      medium: medium || (source === 'meta' ? 'paid_social' : source === 'google' ? 'cpc' : 'none'),
      campaign: campaign || 'none',
      content: content || route,
      route: route
    };
  }

  function titleFromPath(pathname) {
    return /(?:^|\/)risshin(?:-|\/|$)/.test(pathname || '') ? 'sengoku_risshin' : 'sengoku_daimyo';
  }

  function read(storage) {
    try { return JSON.parse(storage.getItem(STORAGE_KEY) || 'null'); } catch (_) { return null; }
  }

  function remember(locationLike, storage, now) {
    var current = parse(locationLike.search, locationLike.pathname);
    var saved = read(storage) || {};
    var paid = current.source === 'meta' || current.source === 'google';
    var next = {
      first: saved.first || (paid ? current : null),
      last: paid ? current : (saved.last || current),
      updated_at: now || Date.now()
    };
    try { storage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch (_) {}
    return next;
  }

  function eventPayload(name, attribution, extra, title) {
    var active = attribution.last || attribution.first || {};
    var payload = {
      event: 'sd_' + name,
      sd_title: title || 'sengoku_daimyo',
      sd_source: active.source || 'direct',
      sd_medium: active.medium || 'none',
      sd_campaign: active.campaign || 'none',
      sd_content: active.content || 'unknown',
      sd_route: active.route || 'unknown'
    };
    Object.keys(extra || {}).forEach(function (key) { payload[key] = extra[key]; });
    return payload;
  }

  function createApi(env) {
    var attribution = remember(env.location, availableStorage(env), env.now && env.now());
    var title = titleFromPath(env.location && env.location.pathname);
    function emit(name, extra) {
      var payload = eventPayload(name, attribution, extra, title);
      (env.dataLayer = env.dataLayer || []).push(payload);
      var params = {};
      Object.keys(payload).forEach(function (key) { if (key !== 'event') params[key] = payload[key]; });
      if (typeof env.gtag === 'function') env.gtag('event', payload.event, params);
      var metaEvents = {
        game_start: 'SDGameStart',
        lp_to_game: 'SDLPToGame',
        app_store_click: 'SDAppStoreClick',
        stay_45m: 'SDStay45m'
      };
      if (metaEvents[name] && typeof env.fbq === 'function') env.fbq('trackCustom', metaEvents[name], params);
      return payload;
    }
    function mapLegacyEvent(name) {
      if (name === 'title/start-click') return emit('game_start_click');
      if (/^start\//.test(name)) return emit('game_start', { sd_game_event: name });
      if (name === 'funnel/map-45m') return emit('stay_45m');
      return null;
    }
    function bind(documentLike) {
      documentLike.addEventListener('click', function (event) {
        var link = event.target && event.target.closest ? event.target.closest('a') : null;
        if (link) {
          var href = link.getAttribute('href') || '';
          if (link.hasAttribute('data-app') || href.indexOf('apps.apple.com') !== -1) {
            emit('app_store_click', { sd_link_position: clean(link.getAttribute('data-ev') || link.id || 'app', 48) });
          } else if (link.hasAttribute('data-play') || (/risshin-lp/.test(env.location.pathname || '') && /(?:^|\/)risshin\/?(?:[?#]|$)/.test(href))) {
            emit('lp_to_game', { sd_link_position: clean(link.getAttribute('data-ev') || link.id || 'play', 48) });
          }
          return;
        }
        var button = event.target && event.target.closest ? event.target.closest('button') : null;
        if (!button) return;
        if (button.id === 'b-cont') emit('game_start', { sd_start_mode: 'continue' });
        else if (button.id === 'ng-next' && button.textContent.indexOf('この名で始める') !== -1) emit('game_start', { sd_start_mode: 'new' });
      });
    }
    return { attribution: attribution, title: title, emit: emit, mapLegacyEvent: mapLegacyEvent, bind: bind };
  }

  var exported = { parse: parse, titleFromPath: titleFromPath, remember: remember, eventPayload: eventPayload, createApi: createApi, storageKey: STORAGE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  if (!root || !root.location) return;
  root.SDAdsAttribution = createApi(root);
  if (root.document) {
    root.SDAdsAttribution.bind(root.document);
  }
})(typeof window !== 'undefined' ? window : null);
