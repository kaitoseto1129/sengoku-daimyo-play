// ======================================================================
// 町の出来事（kaito 10/2 二回目 ③）：喧嘩・祭りの囃子・行商の荷崩れ・火事の半鐘
// ときどき（一分半ほどおきに一つ）町のどこかで起き、声と音と印で知らせる。近づくと関われる（止める・手伝う・踊る）。
//   関わると小さな褒美（礼金・戦功・息が戻る）。放っておけば、しばらくして町の衆が片を付ける。
// 出来事の人は、はじめに四人だけ作って隠しておき、出来事ごとに着替えて使い回す（途中で兵を足さない）。
// ======================================================================
import * as THREE from 'three';
import { allyGroup } from './bhelp.js';
import { B, C, put } from './town_life.js';
import { park, unpark } from './town_air.js';
import { paint, merge, MAT, MK } from './units_model.js';

const KENKA = ['なんじゃと、もう一遍言うてみい！', 'おのれの秤がごまかしとるんじゃ！', 'やるか、この野郎！', '銭を返せ、銭を！', '先に手を出したのはそっちじゃ！'];
const TYPES = {
  kenka: { name: '喧嘩', ph: [0, 1, 2] },
  hayashi: { name: '囃子', ph: [1, 2, 3] },
  gyosho: { name: '行商', ph: [0, 1] },
  kaji: { name: '火事', ph: [1, 2, 3] },
};
const SPOTS = {
  kenka: [[0.5, -46], [-0.5, -12], [0.5, 14], [16, -30], [-24, 30]],
  hayashi: [[-22, 30.5], [24, 30.5], [18, -36]],
  gyosho: [[1, -64], [-1, -28], [1, 8], [-30, 30]],
};

// 天秤棒と籠（行商が担ぐ）
let TENBIN = null;
function tenbinGeo() {
  if (TENBIN) return TENBIN;
  const pole = new THREE.CylinderGeometry(0.025, 0.025, 2.0, 5); pole.rotateZ(Math.PI / 2); pole.rotateY(Math.PI / 2); pole.translate(0.0, 1.45, 0.05);
  const parts = [paint(pole, 0x8a7a50, false, MK.wood)];
  for (const s of [-1, 1]) {
    const k = new THREE.CylinderGeometry(0.24, 0.2, 0.36, 8); k.translate(0.0, 0.62, s * 0.95); parts.push(paint(k, 0x8a7448, false, MK.straw));
    const rope = new THREE.CylinderGeometry(0.008, 0.008, 0.66, 3); rope.translate(0.0, 1.12, s * 0.95); parts.push(paint(rope, 0x5a4a30, false, MK.cloth));
  }
  TENBIN = merge(parts);
  return TENBIN;
}

export function eventsSetup(rt, ctx) {
  const F = rt.flags;
  const E = F.ev = { next: 35 + Math.random() * 20, cur: null, last: null, units: [], n: 0, dress: ctx.dress, backPts: ctx.backPts || [] };
  for (let i = 0; i < 4; i++) {
    const g = allyGroup(rt, { name: '町の人', anchor: { x: 0, z: 0 }, facing: 0, order: 'hold', noRout: true, width: 1, speed: 1.2, march: false, aggro: 0, seekRange: 0, fixed: true },
      [{ type: 'porter', n: 1, o: { flag: null, invuln: true, weapon: 'none' } }]);
    const u = g.units[0];
    if (!u) continue;
    ctx.dress(rt, u, 'townsman', 80 + i);
    const P = { g, u, i: 80 + i, ev: true, kind: 'townsman' };
    park(P);
    E.units.push(P);
  }
  // 関わる所（出来事が無い時は出さない）
  const at = () => (E.cur && E.cur.spot && !E.cur.done ? E.cur.spot : null);
  rt.addInteract('ev-kenka', () => (E.cur && E.cur.type === 'kenka' ? at() : null), '止める　喧嘩', () => kenkaStop(rt), { r: 3.4 });
  rt.addInteract('ev-hayashi', () => (E.cur && E.cur.type === 'hayashi' ? at() : null), '踊る　囃子の輪に入る', () => hayashiJoin(rt), { r: 4 });
  rt.addInteract('ev-gyosho', () => (E.cur && E.cur.type === 'gyosho' ? at() : null), '手伝う　崩れた荷を拾う', () => gyoshoHelp(rt), { r: 3, hold: 1.6 });
  rt.addInteract('ev-kaji', () => (E.cur && E.cur.type === 'kaji' ? E.cur.near : null), '手伝う　水を掛ける', () => kajiDouse(rt), { r: 4.5, hold: 1.2 });
}

// ---- 出来事を始める・終える ----
function pickSpot(rt, list) {
  const p = rt.player.u.pos;
  const ok = list.filter(([x, z]) => { const d = Math.hypot(x - p.x, z - p.z); return d > 18 && d < 75; });
  const L = ok.length ? ok : list;
  const s = L[Math.floor(Math.random() * L.length)];
  return { x: s[0], z: s[1] };
}
function announce(rt, cur, text, label) {
  rt.bark(text, true);
  rt.marker('mk-ev', { x: cur.spot.x, z: cur.spot.z }, label);
  rt.obj('ev', text, 'side');
}
function finish(rt, msg) {
  const E = rt.flags.ev, cur = E.cur;
  if (!cur) return;
  cur.done = true;
  rt.unmark('mk-ev'); rt.objRemove('ev');
  if (msg) rt.bark(msg);
  if (cur.props) for (const m of cur.props) if (m.parent) m.parent.remove(m);
  if (cur.fire) { rt.world.removeFire(cur.fire); cur.fire = null; }
  // 出来事の人は、それぞれ離れて行って家へ
  for (const P of cur.cast || []) {
    if (P.away) continue;
    const u = P.u, a = Math.random() * 6.28;
    P.g.order = 'move'; P.g.dest = { x: u.pos.x + Math.sin(a) * 10, z: u.pos.z + Math.cos(a) * 10 }; P.leaveT = 9;
    P.leaving = true;
  }
  E.last = cur.type;
  E.next = rt.t + 70 + Math.random() * 40;
}
function cast(rt, n, kinds) {
  const E = rt.flags.ev, out = [];
  for (const P of E.units) {
    if (out.length >= n) break;
    if (!P.away) continue;
    const k = kinds[out.length] || 'townsman';
    if (P.kind !== k) { E.dress(rt, P.u, k, P.i + (E.n++)); P.kind = k; }
    P.leaving = false;
    out.push(P);
  }
  return out.length === n ? out : null;
}
function start(rt) {
  const E = rt.flags.ev, A = rt.flags.air, ph = A ? A.ph : 1;
  const types = Object.keys(TYPES).filter((k) => TYPES[k].ph.includes(ph) && k !== E.last);
  // 雨の間は火事と囃子を起こさない
  const rain = A && A.rainK > 0.3;
  const L = types.filter((k) => !(rain && (k === 'kaji' || k === 'hayashi')));
  if (!L.length) { E.next = rt.t + 20; return; }
  const type = L[Math.floor(Math.random() * L.length)];
  const fn = { kenka: kenkaStart, hayashi: hayashiStart, gyosho: gyoshoStart, kaji: kajiStart }[type];
  if (!fn(rt)) E.next = rt.t + 15;
}

// ---- 喧嘩：二人が掴み合い、怒鳴り合う。止めれば礼 ----
function kenkaStart(rt) {
  const E = rt.flags.ev;
  const cs = cast(rt, 2, ['townsman', 'merchant']);
  if (!cs) return false;
  const spot = pickSpot(rt, SPOTS.kenka);
  const cur = E.cur = { type: 'kenka', spot, cast: cs, t: 0, dur: 75, hitT: 0, sayT: 0, k: 0 };
  cs.forEach((P, i) => { const s = i ? 1 : -1; unpark(P, { x: spot.x + s * 0.55, z: spot.z }, s > 0 ? -Math.PI / 2 : Math.PI / 2); P.u.name = i ? '商人' : '町人'; });
  announce(rt, cur, '喧嘩だ！　町人が掴み合っている', '喧嘩');
  return true;
}
function kenkaTick(rt, cur, dt) {
  const p = rt.player.u.pos, d = Math.hypot(cur.spot.x - p.x, cur.spot.z - p.z);
  cur.hitT -= dt; cur.sayT -= dt;
  if (cur.hitT <= 0) {
    cur.hitT = 0.7 + Math.random() * 0.5;
    const P = cur.cast[cur.k++ % 2], Q = cur.cast[cur.k % 2];
    P.u.strikeT = 0.25;
    // 押された方が少しよろける
    Q.g.order = 'move'; Q.g.dest = { x: Q.u.pos.x + Math.sign(Q.u.pos.x - P.u.pos.x || 1) * 0.5, z: Q.u.pos.z };
    rt.after(0.4, () => { if (!cur.done) { Q.g.order = 'hold'; Q.g.anchor = { x: Q.u.pos.x, z: Q.u.pos.z }; Q.g.dest = null; Q.u.heading = Math.atan2(P.u.pos.x - Q.u.pos.x, P.u.pos.z - Q.u.pos.z); } });
    if (d < 25) rt.army.play('thud', Q.u.pos, 0.6);
  }
  if (d < 26 && cur.sayT <= 0) { cur.sayT = 3.6; const P = cur.cast[cur.k % 2]; rt.say(P.u.name, KENKA[Math.floor(Math.random() * KENKA.length)], 2.4); }
  if (cur.t > cur.dur) { rt.say('町人', 'ふん……今日はこのくらいにしといてやる', 2.5); finish(rt, '喧嘩は収まった'); }
}
function kenkaStop(rt) {
  const E = rt.flags.ev, cur = E.cur, G = rt.G;
  if (!cur || cur.done || rt.choice) return;
  rt.choose('町人と商人が掴み合っている', [{ label: '間に割って入り、分ける' }, { label: 'わけを聞いて、裁いてやる' }], (k) => {
    if (cur.done) return;
    if (k === 1) {
      rt.say('商人', '秤をごまかしたなどと、言いがかりで……', 3);
      rt.after(3, () => rt.say('町人', '……いや、わしの見間違いじゃった。すまなんだ', 3));
      G.kan = Math.round(((G.kan || 0) + 0.02) * 1000) / 1000; G.merit = (G.merit || 0) + 1;
      rt.after(6, () => rt.hud.flash('喧嘩を裁いた　礼金 20文・戦功 +1'));
    } else {
      rt.say('町人', 'お、お侍さま……。へえ、ここは引きまする', 3);
      G.merit = (G.merit || 0) + 1;
      rt.hud.flash('喧嘩を分けた　戦功 +1');
    }
    finish(rt, null);
  }, 20);
}

// ---- 祭りの囃子：辻で太鼓と笛。輪に入って踊れば、見物から投げ銭と、息が戻る ----
let DRUM = null;
function hayashiStart(rt) {
  const E = rt.flags.ev, W = rt.world;
  const cs = cast(rt, 4, ['townsman', 'townsman', 'elder', 'merchant']);
  if (!cs) return false;
  const spot = pickSpot(rt, SPOTS.hayashi);
  const cur = E.cur = { type: 'hayashi', spot, cast: cs, t: 0, dur: 95, beat: 0, fluteT: 1, props: [], danceA: 0, joined: false };
  // 太鼓（台に載せた長胴）と、竹に下げた提灯
  if (!DRUM) DRUM = [C(0.34, 0.34, 0.6, 0, 0.95, 0, 0x7a4a2a, 12, { rx: Math.PI / 2 }), C(0.35, 0.35, 0.03, 0, 0.95, 0.3, 0xd8ccb0, 12, { rx: Math.PI / 2 }), C(0.35, 0.35, 0.03, 0, 0.95, -0.3, 0xd8ccb0, 12, { rx: Math.PI / 2 }), B(0.08, 0.7, 0.5, -0.25, 0.35, 0, 0x3a2c20), B(0.08, 0.7, 0.5, 0.25, 0.35, 0, 0x3a2c20)];
  const dm = put(rt, DRUM.map((g) => g.clone()), spot.x, spot.z + 1.6, 0);
  cur.props.push(dm);
  unpark(cs[0], { x: spot.x, z: spot.z + 0.95 }, 0); cs[0].u.name = '太鼓打ち';
  unpark(cs[1], { x: spot.x - 1.4, z: spot.z + 1.4 }, Math.PI * 0.6); cs[1].u.name = '笛吹き';
  for (const P of [cs[2], cs[3]]) { unpark(P, { x: spot.x + 1.5, z: spot.z - 0.5 }, 0); P.u.name = '踊り手'; }
  announce(rt, cur, '辻で囃子が始まった。太鼓と笛が聞こえる', '囃子');
  return true;
}
function hayashiTick(rt, cur, dt) {
  const p = rt.player.u.pos, d = Math.hypot(cur.spot.x - p.x, cur.spot.z - p.z);
  cur.beat -= dt; cur.fluteT -= dt;
  if (cur.beat <= 0) {
    cur.k = (cur.k || 0) + 1;
    // ドン・ドン・カッ の拍子（三つ目は軽く）
    cur.beat = cur.k % 4 === 3 ? 0.62 : 0.31;
    cur.cast[0].u.strikeT = 0.18;
    if (d < 70) rt.army.play(cur.k % 4 === 2 ? 'knock' : 'taiko', { x: cur.spot.x, z: cur.spot.z + 1.6 }, cur.k % 4 === 2 ? 0.5 : 0.75);
  }
  if (cur.fluteT <= 0) { cur.fluteT = 7 + Math.random() * 3; if (d < 55) rt.army.play('flute', cur.spot, 0.55); }
  // 踊り手は輪を描いて回る
  cur.danceA += dt * 0.45;
  [cur.cast[2], cur.cast[3]].forEach((P, i) => {
    const a = cur.danceA + i * Math.PI, r = 2.0;
    P.g.order = 'move'; P.g.dest = { x: cur.spot.x + Math.sin(a) * r, z: cur.spot.z - 0.6 + Math.cos(a) * r };
    if (Math.random() < dt * 1.5) P.u.strikeT = 0.25;
  });
  if (cur.t > cur.dur) finish(rt, '囃子が終わった');
}
function hayashiJoin(rt) {
  const cur = rt.flags.ev.cur, G = rt.G, pl = rt.player;
  if (!cur || cur.done) return;
  if (pl.breath != null) pl.breath = pl.maxBreath || 100;
  if (cur.joined) { rt.say('踊り手', 'それそれ、もう一回り！', 2.5); return; }
  cur.joined = true;
  rt.say('踊り手', 'お侍さまも踊りなされ！　ほれ、手を上げて', 3);
  pl.u.strikeT = 0.3;
  rt.after(3.2, () => { G.kan = Math.round(((G.kan || 0) + 0.01) * 1000) / 1000; rt.say('見物', 'ようよう、お侍さま！', 2.5); rt.hud.flash('見物から投げ銭　10文・息が戻った'); });
}

// ---- 行商の荷崩れ：天秤棒の荷が崩れて困っている。拾ってやれば膏薬をくれる ----
function gyoshoStart(rt) {
  const E = rt.flags.ev;
  const cs = cast(rt, 1, ['merchant']);
  if (!cs) return false;
  const spot = pickSpot(rt, SPOTS.gyosho);
  const cur = E.cur = { type: 'gyosho', spot, cast: cs, t: 0, dur: 80, props: [], sayT: 0 };
  const P = cs[0];
  unpark(P, { x: spot.x + 0.8, z: spot.z }, -Math.PI / 2); P.u.name = '行商';
  // 散らばった荷（包み・小箱・籠）
  const parts = [];
  for (let i = 0; i < 9; i++) { const a = i * 1.9, r = 0.5 + (i % 3) * 0.45; parts.push(B(0.22 + (i % 2) * 0.1, 0.12, 0.18, Math.sin(a) * r, 0.06, Math.cos(a) * r, [0x8a5a3a, 0xd8ccb0, 0x4a5a70, 0x6a4a30][i % 4], { ry: a })); }
  parts.push(C(0.24, 0.2, 0.36, 0.9, 0.2, 0.5, 0x8a7448, 8, { rz: 1.4 }), C(0.025, 0.025, 2.0, 0.2, 0.05, -0.6, 0x8a7a50, 5, { rz: Math.PI / 2 }));
  cur.props.push(put(rt, parts, spot.x - 0.4, spot.z, 0.3));
  announce(rt, cur, '行商の荷が崩れた。困っているようだ', '行商');
  return true;
}
function gyoshoTick(rt, cur, dt) {
  const p = rt.player.u.pos, d = Math.hypot(cur.spot.x - p.x, cur.spot.z - p.z);
  cur.sayT -= dt;
  if (d < 22 && cur.sayT <= 0) { cur.sayT = 6; rt.say('行商', ['ああ、荷が……。だれか手を貸してくだされ', '膏薬が泥まみれじゃ……'][Math.floor(Math.random() * 2)], 2.6); }
  const u = cur.cast[0].u;
  if (Math.random() < dt * 0.8) u.strikeT = 0.25;   // かがんで拾う
  if (cur.t > cur.dur) { rt.say('行商', 'やれやれ、ようやく拾い終えた', 2.5); finish(rt, null); }
}
function gyoshoHelp(rt) {
  const cur = rt.flags.ev.cur, G = rt.G, pl = rt.player;
  if (!cur || cur.done) return;
  const P = cur.cast[0];
  // 天秤棒を担ぎ直して、礼を言う
  if (!P.prop) { const m = new THREE.Mesh(tenbinGeo(), MAT); P.u.mesh.add(m); P.prop = m; }
  if (pl.u.maxHp) pl.u.hp = pl.u.maxHp;
  G.kan = Math.round(((G.kan || 0) + 0.01) * 1000) / 1000;
  rt.say('行商', 'ありがたや、ありがたや。お礼に金創の膏薬を。少ないが、駄賃も', 4);
  rt.hud.flash('行商を助けた　膏薬で傷が癒えた・10文');
  finish(rt, null);
}

// ---- 火事：裏の家から火の手。半鐘が鳴り、町の衆が桶で水を掛ける。手伝えば早く消え、礼金 ----
function kajiStart(rt) {
  const E = rt.flags.ev, W = rt.world;
  const p = rt.player.u.pos;
  const L = E.backPts.filter((b) => { const d = Math.hypot(b.x - p.x, b.z - p.z); return d > 25 && d < 75; });
  if (!L.length) return false;
  const cs = cast(rt, 3, ['townsman', 'townsman', 'elder']);
  if (!cs) return false;
  const b = L[Math.floor(Math.random() * L.length)];
  const spot = { x: b.x, z: b.z };
  const cur = E.cur = { type: 'kaji', spot, near: { x: b.fx, z: b.fz }, cast: cs, t: 0, dur: 85, hp: 3, bellT: 0, props: [] };
  cur.fire = W.addFire(b.x + (b.fx - b.x) * 0.3, b.z + (b.fz - b.z) * 0.3, { size: 2.4, h: 3.2 });
  cs.forEach((P, i) => {
    const a = (i - 1) * 0.9;
    const at = { x: b.fx + (b.fx - b.x) * 0.25 + Math.cos(a) * 1.2, z: b.fz + Math.sin(a) * 1.6 };
    // 少し離れた所から駆けつける
    unpark(P, { x: at.x + (Math.random() - 0.5) * 14, z: at.z + 10 + Math.random() * 6 }, Math.PI);
    P.g.order = 'move'; P.g.dest = at; P.u.name = '町の衆';
  });
  announce(rt, cur, '火事だ！　半鐘が鳴っている', '火事');
  rt.army.play('bellRapid', { x: p.x, z: p.z + 30 }, 0.7);
  return true;
}
function kajiTick(rt, cur, dt) {
  const p = rt.player.u.pos, d = Math.hypot(cur.spot.x - p.x, cur.spot.z - p.z);
  cur.bellT -= dt;
  if (cur.t < 45 && cur.bellT <= 0) { cur.bellT = 6.5; rt.army.play('bellRapid', { x: p.x + 20, z: p.z + 30 }, 0.55); }
  // 町の衆は着いたら火の方を向いて、桶で水を掛ける
  for (const P of cur.cast) {
    const u = P.u;
    if (P.g.order === 'move' && P.g.dest && Math.hypot(u.pos.x - P.g.dest.x, u.pos.z - P.g.dest.z) < 1) { P.g.order = 'hold'; P.g.anchor = { x: u.pos.x, z: u.pos.z }; P.g.dest = null; }
    if (P.g.order === 'hold') { u.heading = Math.atan2(cur.spot.x - u.pos.x, cur.spot.z - u.pos.z); if (Math.random() < dt * 1.2) { u.strikeT = 0.3; if (d < 30) rt.army.play('wade', u.pos, 0.4); } }
  }
  if (d < 30 && Math.random() < dt * 0.25) rt.say('町の衆', ['水だ、水を持ってこい！', '隣へ移らせるな！', '桶を回せ！'][Math.floor(Math.random() * 3)], 2.2);
  if (cur.t > cur.dur) finish(rt, '火は町の衆が消し止めた');
}
function kajiDouse(rt) {
  const cur = rt.flags.ev.cur, G = rt.G;
  if (!cur || cur.done) return;
  cur.hp--;
  rt.army.play('wade', rt.player.u.pos, 0.8);
  if (cur.fire && cur.fire.size) { cur.fire.size *= 0.72; if (cur.fire.flame) cur.fire.flame.scale.multiplyScalar(0.75); if (cur.fire.inner) cur.fire.inner.scale.multiplyScalar(0.75); }
  if (cur.hp > 0) { rt.say('町の衆', cur.hp === 2 ? 'お侍さま、かたじけない！　もう一杯！' : 'あと一息じゃ！', 2.2); return; }
  G.kan = Math.round(((G.kan || 0) + 0.03) * 1000) / 1000; G.merit = (G.merit || 0) + 2;
  rt.say('町年寄', '火を消し止めてくだされた。町の者一同、お礼を申しまする', 4);
  rt.hud.flash('火事を消し止めた　礼金 30文・戦功 +2');
  finish(rt, null);
}

export function eventsTick(rt, dt) {
  const E = rt.flags.ev;
  if (!E) return;
  // 片の付いた出来事の人：離れて行って、家へ
  for (const P of E.units) {
    if (!P.leaving || P.away) continue;
    P.leaveT -= dt;
    if (P.leaveT <= 0 || (P.g.dest && Math.hypot(P.u.pos.x - P.g.dest.x, P.u.pos.z - P.g.dest.z) < 1.2)) {
      P.leaving = false;
      if (P.prop) { if (P.prop.parent) P.prop.parent.remove(P.prop); P.prop = null; }
      park(P);
    }
  }
  const cur = E.cur;
  if (cur && !cur.done) {
    cur.t += dt;
    ({ kenka: kenkaTick, hayashi: hayashiTick, gyosho: gyoshoTick, kaji: kajiTick })[cur.type](rt, cur, dt);
    return;
  }
  if (cur && cur.done && cur.cast.some((P) => !P.away)) return;
  if (rt.t > E.next && !rt.choice) { E.cur = null; start(rt); }
}
