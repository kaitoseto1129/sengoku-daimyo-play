// 今川家編 十戦目「桶狭間の戦い（今川の側）」（永禄三年〔1560〕五月十九日・尾張国 桶狭間）。軽い型（light_battle.js）・H3（docs/house_imagawa.md ①④⑤）
//   史実：今川義元は約二万五千（通説。『信長公記』A は四万五千）で尾張へ入り、朝に丸根・鷲津の砦を落とした。昼、桶狭間山に本陣を据えて休む所へ、
//   西から急な雨（石氷を投げ打つような雨・楠が東へ倒れた）。雨が晴れると織田信長の手（約二千・通説）が本陣へ打ちかかった。
//   義元は旗本三百騎ほどに丸く囲まれて退いたが、二度三度と打ちかかられて五十騎ほどに減り、服部小平太が槍を付け、毛利新介が首を取った（『信長公記』A）。
//   作り直さず織田家編の桶狭間（b_okehazama.js）の地形（国土地理院の標高 dem_okehazama・同じ座標＝原点は桶狭間山の南西・x 東・z 南）と、西からの雨と雷を写す。
//   この家だけの仕組み「大軍の綻び」：味方の備（前備・旗本・後備）の間に金の細い帯。進むと細り、伝令（本人）が号令を届けると太く戻る。雨の中で切れ、その切れ目から織田が入る。字・札・ボタンは足さない。
//   今川の側の「勝ち」（K514 史実のまま・義元は討たれる）：義元の旗本として最後まで本陣を守り、生き残った者を沓掛の方へ退かせて生き延びること。本物の兵は250人まで。
import * as THREE from 'three';
import { lightBattle, uS, uA, uG, busho } from './light_battle.js';
import { useTerrain } from './asset_manifest.js';
import { demBlend } from './dem.js';
import { gauss } from './bhelp.js';
import { jinmaku, nobori, koshi } from './props.js';
import { sfx } from './audio.js';

// ---- 地形：b_okehazama.js と同じ標高（1単位＝1m）。読めない時は手書きの丘だけ ----
let dem = null;
useTerrain('dem_okehazama', (data) => { dem = data; });
const HONJIN = { x: 112, z: 33 };   // 桶狭間山の本陣（b_okehazama.js の FIELD_HONJIN と同じ所）
function base(x, z) {
  return 4 * Math.sin(x * 0.021 + 0.5) * Math.cos(z * 0.018) + 2 * Math.sin(x * 0.05) * Math.sin(z * 0.043 + 1) + 8 * gauss(x, z, HONJIN.x, HONJIN.z, 1400);
}
function height(x, z) {
  const b = base(x, z);
  return dem ? demBlend(dem, x, z, b, { scale: 1, xyScale: 1 }, b - 5) + b * 0.3 : b;
}

// ---- 場所（ゲームの x は東が＋・z は南が＋）。大高・鳴海へ向かう前備は西、沓掛から来た後備は東。織田は北西から雨を背に ----
const MAE = { x: -20, z: 62 };          // 前備（松井宗信ら）：大高へ向かう道の先
const ATO = { x: 236, z: 22 };          // 後備（朝比奈ら）：沓掛の方
const SPAWN = { x: 128, z: 44 };        // 本陣の東の幕の外。本人は旗本の足軽
const GAP = { x: 46, z: 40 };           // 本陣と前備の間（帯が切れる所）
const GATE = { x: 100, z: 30 };         // 本陣の西の口（輿の前）
const KUTSU = { x: 262, z: 8 };         // 沓掛の方へ退く所
const IMAGAWA = { flag: 'imagawa', armor: 0x302e2a };
const ODA = { flag: 'oda', armor: 0x24221f };
const FACE_W = -Math.PI / 2;            // 西（織田の来る方）へ向く

export const i10_okehazama = lightBattle({
  id: 'i10_okehazama',
  date: '永禄三年（1560）五月十九日　午の刻　尾張国 桶狭間',
  intro: '丸根と鷲津の砦は落ちた。義元様は桶狭間山で休んでおられる。大軍の列は長く伸びている。あなたは旗本の足軽。',
  history: '永禄三年（1560）五月、今川義元は約二万五千（通説。『信長公記』は四万五千と書く）で尾張へ入った。十九日の朝、松平元康が丸根、朝比奈泰朝が鷲津の砦を落とし、義元は桶狭間山に本陣を据えて休んだ。昼すぎ、西から石氷を投げ打つような急な雨が降り、雨が晴れると織田信長の手（約二千・通説）が本陣へ打ちかかった。義元は旗本三百騎ほどに丸く囲まれて退いたが、何度も打ちかかられて五十騎ほどに減り、服部小平太が槍を付け、毛利新介が首を取った（『信長公記』）。大軍は長く伸びた列のまま、本陣だけを突かれた。',
  sides: { a: { name: '今川義元の旗本', mon: 'imagawa', faction: 'imagawa' }, b: { name: '織田信長の手', mon: 'oda', faction: 'oda' } },
  force: { a: 25000, b: 2000 },
  allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4,
  foeDmg: 0.6,
  friendsSend: 1,
  minutes: 7,
  noMarch: true,   // 本陣で休んでいる所から始める（共通の行軍の入りは使わない）
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE_W },
  world: { seed: 1560, overcast: true, time: 'day', fogFar: 320 },
  allies: [
    { name: '前備（松井宗信の手）', at: MAE, face: FACE_W, list: [busho('松井宗信'), uS(3), uA(8)] },
    { name: '今川義元の旗本', at: { x: HONJIN.x - 4, z: HONJIN.z + 2 }, face: FACE_W, fixed: true, dmg: 0.5, list: [busho('今川義元', { horse: false }), uS(5), uA(8)] },
    { name: '後備（朝比奈の手）', at: ATO, face: FACE_W, list: [uS(2), uA(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['今川義元', '丸根も鷲津も落ちたか。まことに目出度い。ここで一息入れよ', 3.6],
      ['組頭', '列が長う伸びておる。前備は大高の方へ行き過ぎじゃ', 3.2],
      ['組頭', 'お主が走れ。前備に、本陣へ寄れと伝えよ', 3]] },
    { kind: 'move', at: MAE, label: '前備', obj: '細った帯をたどり、前備へ号令を届ける', r: 14, max: 110,
      say: [['組頭', '金の帯をたどれ。細うなった所が、列の切れかけじゃ', 3.4]] },
    { kind: 'rest', dur: 10, heal: 0.2, say: [
      ['松井宗信', '承った。前備は本陣へ寄せる', 3],
      ['組頭', '西の空が暗い……。雨じゃ！　ひどい雨が来るぞ', 3.2]] },
    { kind: 'fight', at: GAP, obj: '雨の中、列の切れ目から入った織田の手を止める', title: '綻び', sub: '帯が切れた', max: 110, limit: 120,
      say: [['組頭', '帯が切れた！　その切れ目から、敵が入って来るぞ！', 3.2], ['織田の侍', '雨は上がった！　かかれ、かかれ！', 3]],
      foes: [{ name: '織田の先手', from: { x: GAP.x - 40, z: GAP.z - 34 }, list: [uS(3), uA(12)] }],
      later: [{ t: 30, say: ['組頭', '北からも来る！　本陣へ下がって固めよ'], foes: [{ name: '織田の二の手', from: { x: GAP.x - 18, z: GAP.z - 56 }, list: [uS(2), uA(8), uG(2)] }] }],
      reward: '列の切れ目で織田の先手を止めた' },
    { kind: 'hold', at: GATE, label: '輿の前', obj: '義元様の輿の前で、旗本と共に守る', r: 16, dur: 85, title: '旗本', sub: '義元様を一人にしない',
      say: [['今川義元', '慌てるな。三百騎で丸く囲め。輿は捨てよ、馬を引け', 3.6], ['織田信長', '旗本はあれぞ！　かかれ！', 3]],
      waves: [{ t: 4, foes: [{ name: '信長の馬廻', from: { x: GATE.x - 46, z: GATE.z - 20 }, list: [uS(3), uA(10)] }] },
        { t: 34, say: ['組頭', '二度、三度と来る！　囲みを崩すな！'], foes: [{ name: '服部小平太の手', from: { x: GATE.x - 40, z: GATE.z + 26 }, list: [busho('服部小平太', { horse: false }), uS(2), uA(8)] }] },
        { t: 60, say: ['毛利新介', '義元はどこじゃ！　首を取れ！'], foes: [{ name: '毛利新介の手', from: { x: GATE.x - 30, z: GATE.z - 40 }, list: [busho('毛利新介', { horse: false }), uS(2), uA(6)] }] }],
      reward: '旗本として本陣の囲みを守った' },
    { kind: 'move', at: KUTSU, label: '沓掛', obj: '生き残った者と、沓掛の方へ退く', r: 16, max: 120,
      say: [['組頭', '……御大将が討たれた。旗が倒れた。退け、沓掛へ退け！', 3.6], ['組頭', '振り向くな。生きて駿河へ帰るのじゃ', 3]] },
  ],
  win: {
    banner: '桶狭間', sub: '本陣を守り、生き延びた', award: '桶狭間で義元の旗本として最後まで守り、生き延びた',
    say: [['組頭', '三百騎が、五十騎になるまで囲んだ。わしらは最後まで御大将を一人にせなんだ', 3.6],
      ['朝比奈の侍', '後備は沓掛で固める。鳴海の岡部殿は、まだ城を守っておられるそうな', 3.4],
      ['組頭', '生きて駿府へ帰るぞ。この雨を忘れるな', 3.2]],
  },
  setup(rt) {
    const W = rt.world, F = rt.flags;
    // 本陣の幕・幟・輿（見た目だけ。形は props.js の物を使い回す）
    rt.scene.add(jinmaku(W, HONJIN.x, HONJIN.z, 18, 12, 6, { mon: 'imagawa' }));
    for (const [dx, dz] of [[-10, 8], [10, 8], [-14, -4], [14, -4], [0, -9]]) rt.scene.add(nobori(W, HONJIN.x + dx, HONJIN.z + dz, 'imagawa', 6));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, MAE.x + dx, MAE.z + dz, 'imagawa', 5));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, ATO.x + dx, ATO.z + dz, 'imagawa', 5));
    try { rt.scene.add(koshi(W, HONJIN.x - 3, HONJIN.z - 3, Math.PI / 2)); } catch (e) { /* なし */ }
    F.obi = { a: 1, b: 1, t: 0 };   // a＝旗本⇄前備、b＝旗本⇄後備 の帯の太さ（0〜1）
  },
  update(rt, dt) {
    const F = rt.flags, D = F.dp, O = F.obi;
    if (!O) return;
    const i = D?.on ? D.i : -1;
    // 帯の太さ：前備へ走る間は細っていく（列が伸びる）。号令が届くと戻る。雨の段で切れる。本陣の守りの間に後ろの帯も細る
    if (i === 1) O.a = Math.max(0.28, O.a - dt / 45);
    else if (i === 2) {
      if (!O.back) { O.back = true; O.a = 1; sfx('kakegoe', 0.6); }
      O.rainT = (O.rainT || 0) + dt;
      if (O.rainT > 3 && !F.rain) { F.rain = true; rt.world.setRainTarget?.(1); sfx('thunder', 0.8); }
      if (O.rainT > 4) O.a = Math.max(0, O.a - dt / 4);
    } else if (i >= 3) {
      O.a = 0;
      if (!F.rain) { F.rain = true; rt.world.setRainTarget?.(1); }
      if (i >= 4) O.b = Math.max(0.2, O.b - dt / 70);
      // 雨が上がってから織田が打ちかかった（『信長公記』）。戦いの段に入ったら雨を弱める
      if (!F.rainOff && O.rainT > 0 && i === 3) { F.rainOff = true; rt.after(8, () => rt.world.setRainTarget?.(0.25)); }
    }
    obiTick(rt, dt);
    // 退く段：本陣の旗本は残って討たれる（義元は大勢に守られ一人でいない）。本人が離れたら旗本の兵を外す（遠くへ去った兵は数えない）
    if (i >= 5 && !F.i10Gone) {
      const H = F.allies?.[1], P = rt.player?.u?.pos;
      if (H && P && Math.hypot(P.x - HONJIN.x, P.z - HONJIN.z) > 90) {
        F.i10Gone = true;
        for (const u of H.units) { try { rt.army.despawn(u); } catch (e) { /* なし */ } }
      }
    }
  },
});

// 「大軍の綻び」の帯：前備・旗本・後備の中心を結ぶ金の細い線を三筋まで。太さ（筋の数）で列のつながりを、切れかけは点滅で見せる。
//   線と材質は一度だけ作って使い回す（毎コマ new しない）。字は出さない
const SEG = 20;
export function obiTick(rt, dt) {
  const F = rt.flags, O = F.obi, W = rt.world;
  if (!O.lines) {
    O.lines = [];
    for (let s = 0; s < 2; s++) {
      const mat = new THREE.LineBasicMaterial({ color: 0xd9a21c, transparent: true, opacity: 0.9, depthWrite: false, fog: false });
      const row = [];
      for (let k = 0; k < 3; k++) {
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((SEG + 1) * 3), 3));
        const L = new THREE.Line(geo, mat); L.frustumCulled = false; L.renderOrder = 5; L.visible = false;
        rt.scene.add(L); row.push(L);
      }
      O.lines.push({ mat, row });
    }
  }
  O.t += dt;
  const A = F.allies || [], c = (g, at) => (g && g.count ? g.center?.() : null) || at;
  const hon = c(A[1], HONJIN), pairs = [[hon, c(A[0], MAE), O.a], [hon, c(A[2], ATO), O.b]];
  for (let s = 0; s < 2; s++) {
    const [p, q, v] = pairs[s], { mat, row } = O.lines[s];
    const n = F.ending ? 0 : v > 0.66 ? 3 : v > 0.33 ? 2 : v > 0 ? 1 : 0;
    mat.opacity = v > 0.33 ? 0.9 : 0.35 + 0.55 * Math.abs(Math.sin(O.t * 5));   // 切れかけは点滅
    const d = Math.hypot(q.x - p.x, q.z - p.z) || 1, nx = -(q.z - p.z) / d, nz = (q.x - p.x) / d;
    for (let k = 0; k < 3; k++) {
      const L = row[k];
      L.visible = k < n;
      if (!L.visible) continue;
      const off = (k - (n - 1) / 2) * 0.6, a = L.geometry.attributes.position;
      for (let j = 0; j <= SEG; j++) {
        const f = j / SEG, x = p.x + (q.x - p.x) * f + nx * off, z = p.z + (q.z - p.z) * f + nz * off;
        a.setXYZ(j, x, W.heightAt(x, z) + 3.2 + Math.sin(f * Math.PI) * 1.5, z);
      }
      a.needsUpdate = true;
    }
  }
}

// 地形は織田家編の桶狭間の物（標高・西からの雨と雷・梅雨の泥）。木は丘に、本陣・道・持ち場は空ける
Object.assign(i10_okehazama.world, {
  height, muddy: 0.5, groundHalf: 460, moveLim: 420,
  rainDir: [2.2, 0], lightning: true,
  paths: [[[-180, 70], [-20, 62], [46, 40], [100, 30], [180, 26], [262, 8], [360, 0]]],
  treeDensity: (x, z) => (base(x, z) > 5 ? 1.2 : 0.35),
  clear: (x, z) => [SPAWN, MAE, ATO, GAP, GATE, KUTSU].some((p) => Math.hypot(x - p.x, z - p.z) < 26) || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 30,
  trees: 520, tufts: 2000,
});
export default i10_okehazama;
