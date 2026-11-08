// 甲冑の色と型をそろえる（kaito 11/3 夕 AV 1「緑・紫・橙・赤い丸い兜で祭りのよう」）。全60戦の兵に、addUnit の終わりで一度だけ掛ける。
//   型は 足軽（old_good の黒い陣笠と桶側胴）・侍・侍大将・名のある武将 の四つ。基本は黒漆（少し青みの黒・黒褐も可）。
//   位は前立で分ける：侍は立物なし、侍大将は鍬形、名のある武将はその人の立物。
//   家の色は史実の物だけ：赤備え（武田・井伊・真田）は全員朱のまま。それ以外に朱・緑・紫・橙・浅葱・白の威と胴を出さない。
//   見た目だけで、防御力・背丈・当たりは変えない。本人・小袖・僧兵・南蛮胴には触らない（本人は player.js の位の表）。
import * as THREE from 'three';

// 史実の赤備えの家（旗の鍵）
export const RED_HOUSE = new Set(['takeda', 'akazonae', 'ii', 'sanada']);
// 胴と鉢の漆：黒漆・青みの黒漆・黒褐
const LAC = [0x1c1a1a, 0x1b1c21, 0x221e1b];
// 威：黒糸・紺黒・黒褐（old_good の侍の暗い威）
const ODO = [0x1c1a1a, 0x262b3a, 0x2c2622];
// 色の明るさと彩は見たままの sRGB で測る（three の Color は setHex で linear に直すので、暗く出て色物も「黒」と見なしていた）
const _hsl = { h: 0, s: 0, l: 0 };
const _color = new THREE.Color();
const _c = { setHex(h) { this.h = h; return this; }, getHSL(o) { _color.setHex(this.h, THREE.LinearSRGBColorSpace).getHSL(o, THREE.LinearSRGBColorSpace); return o; } };

// 黒に近い色（暗い・彩の薄い）か、暗い茶（溜塗・錆地）ならそのまま
function dark(h) {
  _c.setHex(h).getHSL(_hsl);
  if (_hsl.l < 0.12 || (_hsl.l < 0.24 && _hsl.s < 0.42)) return true;
  const deg = _hsl.h * 360;
  return deg >= 20 && deg < 45 && _hsl.l < 0.2 && _hsl.s < 0.5;   // 溜塗・朱溜の赤茶は朱に見えるので黒へ寄せる
}
// 金・銀の塗り（名のある武将の伝来の金陀美・銀箔押しだけ残す）
function metal(h) {
  _c.setHex(h).getHSL(_hsl);
  const deg = _hsl.h * 360;
  return (_hsl.s < 0.12 && _hsl.l > 0.5) || (deg >= 35 && deg < 55 && _hsl.l > 0.38 && _hsl.s > 0.35);
}
function red(h) {
  _c.setHex(h).getHSL(_hsl);
  const deg = _hsl.h * 360;
  return (deg < 16 || deg >= 340) && _hsl.s > 0.35 && _hsl.l > 0.14;
}
// 一つの色を型の色へ寄せる。pick は人ごとの組（0〜2）
function fix(h, T, pick, redOk, metalOk) {
  if (typeof h !== 'number') return h;
  if (redOk && red(h)) return h;
  if (metalOk && metal(h)) return h;
  if (dark(h)) return h;
  _c.setHex(h).getHSL(_hsl);
  // 青みの色は紺黒、暖かい色は黒褐、ほかは黒へ（形の数が増えないよう三つだけ）
  const deg = _hsl.h * 360;
  if (T === ODO) return deg >= 190 && deg < 260 ? ODO[1] : deg < 60 || deg >= 300 ? ODO[2] : ODO[pick % 2 ? 1 : 0];
  return T[pick % 3];
}
const COL = ['armor', 'helm', 'kusazuriColor', 'suneateColor'];
const LACE = ['lace', 'odo'];
function fixAll(o, pick, redOk, metalOk, haoriToo) {
  for (const k of COL) if (k in o) o[k] = fix(o[k], LAC, pick, redOk, metalOk);
  for (const k of LACE) if (k in o) o[k] = fix(o[k], ODO, pick, redOk, false);
  if (haoriToo && o.haori) o.haori = fix(o.haori, ODO, pick, redOk, false);
  if (!redOk && o.lac === 'shu') o.lac = 'kuro';
  if (!redOk && o.lac === 'shutame') o.lac = 'tame';
}
// 名の無い侍の元の表は兵ごとに作られる。戦後は元の表と写しを一緒に回収できるようにする。
const _kc = new WeakMap();   // 生きている元の表と赤の可否ごとに写しを共有する

export function uniformArmor(look, { flag, named, busho }) {
  if (!look || look.hero || look.kosode || look.sohei || look.nanban || look.oldGood) return look;
  const redOk = RED_HOUSE.has(String(flag || '')) || !!look.takedaRed;
  const pick = (look.vi || 0) % 3;
  fixAll(look, pick, redOk, named, true);
  if (look.hatColor != null) look.hatColor = fix(look.hatColor, LAC, pick, redOk, named);
  // 赤い丸い兜（作り物の朱の兜 kabuto_r）は赤備えの家だけ
  if (!redOk && look.hat === 'kabuto_r') look.hat = 'kabuto';
  const kc = look.kacchu;
  if (kc && typeof kc === 'object') {
    const key = kc;
    let m = _kc.get(key);
    const tag = (redOk ? 'r' : '') + (named ? 'n' : '') + (busho ? 'b' : '') + pick;
    let c = m && m.get(tag);
    if (!c) {
      c = { ...kc };
      fixAll(c, pick, redOk, named, true);
      // 位は前立で分ける：名の無い侍は立物なし、名の無い侍大将は鍬形（金の円盤・月・日輪にしない）
      if (c.generic && !named) c.crest = busho || (look.tier ?? 0) >= 2 ? (/^kuwa(_wide)?$/.test(c.crest || '') ? c.crest : 'kuwa') : 'none';
      if (!m) _kc.set(key, m = new Map());
      m.set(tag, c);
    }
    look.kacchu = c;
    if (c.generic) { look.crest = c.crest; look.lac = c.lac; }
  }
  return look;
}
