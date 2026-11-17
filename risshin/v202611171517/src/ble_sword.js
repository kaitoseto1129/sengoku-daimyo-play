// 段5（K310・docs/specs/physical_roadmap_1115.md）：刀の柄に仕込んだ小さな板（M5StickC Plus2・ESP32）を Web Bluetooth でつなぐ。
//   板の作り（ファーム）は docs/physical/m5_katana/m5_katana.ino。3D プリンターの柄と鍔は docs/physical/m5_katana/。
//   板は振りを自分で読み、携帯の刀（phone_sword.js）と同じ言葉を一行ずつ送る：
//     "s,<kesa|gyaku|nagi|kara>,<重さ 0.85〜1.3>"＝斬る ／ "k,<重さ>"＝突く ／ "g,1"・"g,0"＝構える・解く ／ "t,<強さ>"＝打ち込み台に当たった
//   入れる先も同じ applySword（input.phoneSwing・leftPressed・guardHeld）。当たると板へ "hit" を返し、音と光で知らせる。
//   パソコンの Chrome・Edge（Web Bluetooth のある所）だけ。アプリには出さない。読み込み時に外へ取りに行かない。
import { applySword } from './phone_sword.js';

// Nordic UART（よく使われる名で、M5 の作例も多い）
export const NUS = '6e400001-b5a3-f393-e0a9-e08e3ca9e3c3';
const RX = '6e400002-b5a3-f393-e0a9-e08e3ca9e3c3';   // こちら → 板
const TX = '6e400003-b5a3-f393-e0a9-e08e3ca9e3c3';   // 板 → こちら
const DIRS = new Set(['kesa', 'gyaku', 'nagi', 'kara']);

// 一行を携帯の刀と同じ形の動きへ（読めない行は null）
export function parseLine(line) {
  const p = String(line || '').trim().split(',');
  const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
  if (p[0] === 's') return { t: 's', d: DIRS.has(p[1]) ? p[1] : 'kesa', p: num(p[2], 1) };
  if (p[0] === 'k') return { t: 'k', p: num(p[1], 1) };
  if (p[0] === 'g') return { t: 'g', on: p[1] === '1' };
  if (p[0] === 't') return { t: 't', p: num(p[1], 1) };
  return null;
}

// 板の便りは 20 字ほどで切れて届く事がある。改行までためて一行ずつ渡す
export function lineSplitter(onLine) {
  let buf = '';
  return (text) => {
    buf += text;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); if (l.trim()) onLine(l); }
    if (buf.length > 200) buf = '';
  };
}

// つないだ板（柄と巻藁の二つまで同時に。押すたびに一つ足す）。rx は「当たった」を返せる板（柄）だけ
const LINKS = new Set();
let buzzHooked = false;
const st = () => window.__bleStat || (window.__bleStat = { n: 0, target: 0, last: '' });
// K319：iOS アプリは Web Bluetooth が無いので、Swift の CoreBluetooth（docs/physical/ios_ble/BleKatana.swift）が板とつなぎ、
//   WKScriptMessageHandler「blekatana」で頼みを受け、window.__bleNative({ev,id,name,text}) で便りを返す。言葉と入れる先は同じ。
const NATIVE = () => { try { return window.webkit?.messageHandlers?.blekatana || null; } catch (e) { return null; } };
export const bleOffered = () => { try { return !!NATIVE() || (!!navigator.bluetooth && !window.__iosApp && !window.__androidApp && location.protocol !== 'app:'); } catch (e) { return false; } };

export function handle(line, input = window.__input) {
  const m = parseLine(line);
  if (!m) return null;
  const S = st(); S.last = line;
  if (m.t === 't') { S.target++; window.__targetHit?.(m.p); return m; }   // 打ち込み台：遊び側が受ける時だけ
  if (m.t !== 'g') S.n++;
  applySword(m, input);
  return m;
}

// 板へ一行送る（巻藁の人形を動かす "m,<揺れ -1〜1>"・倒れる "f"。受けの口のある板だけ。届かなくても遊びは止めない）
export function sendBoards(text, only = 'Makiwara') {
  const v = new TextEncoder().encode(text.endsWith('\n') ? text : text + '\n');
  let n = 0;
  for (const L of LINKS) if (!only || String(L.dev.name || '').includes(only)) { L.rx?.writeValueWithoutResponse?.(v).catch(() => {}); n++; }
  return n;
}
window.__boardSend = sendBoards;

// 当たった時に柄を鳴らす（携帯の刀の __swordBuzz と並べて呼ぶ。80ms に一度。掛けるのは一度だけ。巻藁へは返さない）
function hookBuzz() {
  if (buzzHooked) return;
  buzzHooked = true;
  const before = window.__swordBuzz; let at = -1e9;
  window.__swordBuzz = (n) => {
    try { before?.(n); } catch (e) { /* 携帯の方は無くてよい */ }
    const t = performance.now(); if (t - at < 80) return; at = t;
    for (const L of LINKS) if (!String(L.dev.name || '').includes('Makiwara')) L.rx?.writeValueWithoutResponse?.(new TextEncoder().encode('hit\n')).catch(() => {});
  };
}

// 「刀の柄をつなぐ」を押した時（Web Bluetooth は人の押しの中でしか機器を選べない）
export async function openBleSword(say = () => {}) {
  if (!bleOffered()) { say('！ この機械では刀の柄をつなげません（パソコンのクロームで開いてください）'); return false; }
  if (NATIVE()) return openNative(say);
  try {
    const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: [NUS] }, { namePrefix: 'Katana' }], optionalServices: [NUS] });
    for (const L of LINKS) if (L.dev.id === dev.id) { say('もうつながっています'); return true; }
    const srv = await (await dev.gatt.connect()).getPrimaryService(NUS);
    const tx = await srv.getCharacteristic(TX);
    const link = { dev, rx: await srv.getCharacteristic(RX).catch(() => null) };
    LINKS.add(link);
    dev.addEventListener('gattserverdisconnected', () => { LINKS.delete(link); say('刀の柄が切れました'); });
    const dec = new TextDecoder(), feed = lineSplitter((l) => handle(l));
    tx.addEventListener('characteristicvaluechanged', (e) => feed(dec.decode(e.target.value)));
    await tx.startNotifications();
    hookBuzz();
    say('刀の柄がつながりました');
    return true;
  } catch (e) {
    say(e?.name === 'NotFoundError' ? '刀の柄を選びませんでした' : '！ 刀の柄をつなげませんでした');
    return false;
  }
}

// --- iOS アプリ（Swift の CoreBluetooth）の道 ---
const nativeLinks = new Map();   // id → LINKS に入れた物
let nativeWait = null;
function nativeSay(o) { try { NATIVE()?.postMessage(o); } catch (e) { /* 橋が無い */ } }
window.__bleNative = (o = {}) => {
  if (o.ev === 'linked') {
    let L = nativeLinks.get(o.id);
    if (!L) {
      L = { dev: { id: o.id, name: o.name || '' }, rx: { writeValueWithoutResponse: async (v) => nativeSay({ op: 'send', id: o.id, text: new TextDecoder().decode(v) }) } };
      L.feed = lineSplitter((l) => handle(l));
      nativeLinks.set(o.id, L); LINKS.add(L);
    }
    hookBuzz();
    nativeWait?.(true); nativeWait = null;
  } else if (o.ev === 'line') nativeLinks.get(o.id)?.feed(String(o.text || ''));
  else if (o.ev === 'lost') { const L = nativeLinks.get(o.id); if (L) { LINKS.delete(L); nativeLinks.delete(o.id); } }
  else if (o.ev === 'none') { nativeWait?.(false); nativeWait = null; }
};
function openNative(say) {
  return new Promise((done) => {
    const t = setTimeout(() => { if (nativeWait) { nativeWait = null; say('刀の柄が見つかりませんでした'); done(false); } }, 15000);
    nativeWait = (ok) => { clearTimeout(t); say(ok ? '刀の柄がつながりました' : '刀の柄が見つかりませんでした'); done(ok); };
    nativeSay({ op: 'scan', prefix: 'Katana' });
  });
}
