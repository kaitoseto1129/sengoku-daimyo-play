// ======================================================================
// 徳川編 13　道明寺の戦い（慶長二十年＝元和元年 1615・五月六日・夏）　大坂夏の陣の野戦
// 筋書きの正：docs/chapter3_tokugawa.md の「13. 道明寺」。史実の手本：docs/battle_refs/k13_domyoji.md
// 大和口の徳川方（三万四千ほど。先鋒の大将 水野勝成・本多忠政・伊達政宗と先手の片倉重綱）が国分の隘路を抜けて河内へ出る。
// 豊臣方の後藤又兵衛（約二千八百）は、後続を待たず石川を渡って小松山へ先に出た。薄田兼相・真田信繁・毛利勝永は霧で遅れ、
// 又兵衛は十倍を越える敵に孤立して討死（必ず）。誉田から出た薄田兼相も道明寺で討死。
// 昼に着いた信繁・勝永（一万二千ほど）は誉田で伊達勢と鉄砲を撃ち合って押し戻し、夕方、信繁が殿をして大坂へ退いた。徳川方は疲れて追わなかった。
// 主人公は東軍の水野勝成の先手に付く。大和口の総大将 松平忠輝は後ろの陣、伊達政宗は伊達勢の後ろ（前で討てる所に総大将を置かない。kaito 11/3 AR3・AT3）。
// 見せかけの軍勢（軽い作りの大軍・奥の乱戦・段の敵の後ろの控え）は置かない。見える兵は全部本物（kaito 11/3 AA・AF・AQ6）。
// 段：①小松山の斜面の鉄砲組を破る ②頂の後藤又兵衛を討つ ③道明寺の野で薄田兼相の手を討つ ④誉田で真田・毛利の寄せを伊達勢と受け止める ⑤真田のしんがりの逆襲を退ける
// 負け：目標ごとの刻限（①②③。kaito 11/3 AP8）までに果たせない。
// 向き：東（奈良の側）が +x、西（大坂の側）が -x、北が -z。小松山は中ほど、石川は山の西を北へ流れて大和川（北）に入る。
//   道明寺の野は石川の西、誉田（誉田八幡・誉田陵）はその南西（史実の地図どおり。docs/battle_refs/k13_domyoji.md の「布陣図の目標」）。
// 流れ（史実の刻）：寅の刻（午前四時）松倉重政・奥田忠次の先手が小松山の後藤勢に崩され奥田が討死→水野勝成・堀直寄らが助け、十倍で山を囲む
//   →昼前に又兵衛討死→薄田兼相・山川賢信・明石全登が着いて道明寺で破れる→真田・毛利が誉田に着き伊達勢と撃ち合う→未の刻（十四時半）八尾・若江の敗報→申の刻（十六時）退く
// 地形：手書きの小山と野（国土地理院の標高はまだ混ぜない）。大きさは常識の低い丘（AT8）。
// ======================================================================
import * as THREE from 'three';
import { nobori, jinmaku, kagaribi, hut, dou, bridgeWoodMaterial, solidCircle } from './props.js';
import { revealName } from './battle_intel.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import * as DP from './b_depth.js';
import { GENERALS } from './units_data.js';
import { KACCHU } from './kacchu_data.js';

// 慶長二十年の名乗りは片倉重綱（「重長」へ改めたのは将軍家綱の諱を避けた晩年）。顔と具足は重長の物を使う
if (GENERALS['片倉重長'] && !GENERALS['片倉重綱']) GENERALS['片倉重綱'] = GENERALS['片倉重長'];
if (KACCHU['片倉重長'] && !KACCHU['片倉重綱']) KACCHU['片倉重綱'] = KACCHU['片倉重長'];
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';
import { buildHorse, horseStyleFor } from './units.js';
import { goalsTick } from './hud_goals.js';
import { sightUnit } from './battle_sight.js';
import * as jin13 from './k13/jindate.js';
import { DEPTH13 } from './k13/depth.js';   // 陣立ての表（army_depth.js）   // 陣立ての厚み・「真田隊、来ます！」・誉田の鉄砲戦・騎馬・徳川の損害（11/8）

// ---- 場所（ゲームの座標） ----
const START = { x: 96, z: 4 };           // 国分を抜けた水野勢の寄せ口（小松山の麓の近く。長く歩かせない。AT10）
const SLOPE = { x: 40, z: 2 };           // 小松山の東の斜面（後藤勢の鉄砲組）
const TOP = { x: 4, z: 0 };              // 小松山の頂（後藤又兵衛）
const ISHI_X = -52;                      // 石川（小松山の西の裾を北へ流れる浅い川）
const NOGAWA = { x: -80, z: -6 };        // 道明寺の野（薄田兼相）。道明寺は石川の西・大和川との合流の南
const HONDA = { x: -116, z: 26 };        // 誉田（誉田八幡・誉田陵。道明寺の南西。真田・毛利が着く所）
const YAMATO_Z = -118;                   // 大和川（北の端を西へ流れる。石川はここに入る）
const HILL = 18;                         // 小松山（玉手山の丘陵の北の高み）の麓からの高さ（m）
const REAR = { x: 178, z: -6 };          // 松平忠輝の陣（後ろ）
// 誉田陵（応神天皇陵）：誉田の野の南。北が方形の前、南が円い後ろの前方後円の古墳（史実は長さ四百メートルを越える。ゲームは十分の一）。
//   周りに空堀と外の土手。墳丘は木に覆われる。誉田八幡はその南（後円部の裾）。真田の鉄砲はこの堀と土の高まりに伏せた
const KOFUN = { x: -128, z: 64 };
const HACHIMAN = { x: -128, z: 100 };
// 誉田の村の民家（夕方、豊臣方が退きながら火を放つ）
const HOUSES = [[-172, 10, 0.1], [-181, 22, -0.2], [-170, -6, 0.3], [-186, 2, 0]];
const LIMIT = [240, 0, 0, 270];          // 段ごとの刻限（秒。0 は刻限なし。②は伊達の鉄砲で又兵衛が果てるので刻限なし）
const FOES = ['後藤又兵衛', '薄田兼相', '明石全登', '山川賢信', '毛利勝永', '真田信繁'];
// 目標の言葉（右上の並び・段の目標・負けの札で同じ字。途中で言い替えない。kaito 十1）
const GOALS = ['小松山の東の斜面で、後藤勢の鉄砲組を破れ', '小松山の頂で、後藤又兵衛と侍衆を討て', '石川を渡り、道明寺の野で薄田兼相の手を討て',
  '誉田陵の前で伊達勢と並び、真田・毛利の寄せを止めよ', '誉田の野で、真田の殿の逆襲を押し返せ'];
// 誉田陵の墳丘の縁からの距離（内は負）。円い後ろ（南）と方形の前（北）を合わせた形
function kofunDist(x, z) {
  const kx = x - KOFUN.x, kz = z - KOFUN.z;
  return Math.min(Math.hypot(kx, kz - 8) - 13, Math.max(Math.abs(kx) - 11, Math.abs(kz + 6) - 10));
}

const ROUTE = [[236, 6], [START.x, START.z], [SLOPE.x, SLOPE.z], [TOP.x, TOP.z], [-30, 0], [ISHI_X, -2], [NOGAWA.x, NOGAWA.z], [-98, 10], [HONDA.x, HONDA.z], [-230, 40]];

const TOYO = { armor: 0x2e2a26, flag: 'toyotomi' };
const SANADA = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'sanada' };
const TOKU = { flag: 'tokugawa' };
const DATE = { armor: 0x24221f, lace: 0x3a3a3a, flag: 'date' };
const MIZU = { flag: 'mizuno' };
const HONDA_K = { flag: 'honda' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uB = (n) => ({ type: 'bow', n });
const sstep = (t) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };

// ---- 地形：国分の隘路（南北の山）・小松山・石川・西の野 ----
function height(x, z) {
  let h = 2 + 0.012 * Math.max(0, x - 100);
  // 国分の隘路：東の入口の南北が山で、まん中が谷
  const pass = sstep((x - 90) / 30) * (1 - sstep((x - 250) / 40));
  h += 22 * pass * sstep((Math.abs(z) - 26) / 34);
  // 小松山：南北に長い丘（玉手山の丘陵の北の高み。BH4）。頂は狭い平ら、東は国分からの長い登り、西は石川へ急な下り。
  //   斜めは歩いて登れる強さまで（東 0.45・西 0.55 ほど）
  const dx = x - TOP.x;
  const ew = dx > 0 ? 1 - sstep((dx - 10) / 60) : 1 - sstep((-dx - 8) / 48);
  const ns = 1 - sstep((Math.abs(z) - 46) / 54);
  h += HILL * ew * ns + 2.2 * ew * ns * Math.sin(z * 0.06 + 1.1) * Math.max(0, 1 - Math.abs(dx) / 40);
  // 石川の河原はわずかに低く
  h -= 0.9 * Math.exp(-((x - ISHI_X) * (x - ISHI_X)) / 160);
  h += 0.35 * Math.sin(x * 0.05 + 0.4) * Math.cos(z * 0.05) + 0.2 * Math.sin(z * 0.08 - x * 0.03);
  // 誉田陵：墳丘（後ろの円が高く 7m・前の方形 5.5m）・空堀（深さ 1.3m）・外の土手
  const kd = kofunDist(x, z);
  if (kd < 0) { const kz = z - KOFUN.z; h += sstep(-kd / 5) * (5.5 + 1.5 * sstep((kz + 2) / 8)); }
  else if (kd < 6) h -= 1.3 * Math.sin(Math.PI * kd / 6);
  else if (kd < 9) h += 0.7 * Math.sin(Math.PI * (kd - 6) / 3);
  return h;
}

// ---- 旗と陣 ----
function flags(rt) {
  const W = rt.world;
  // 水野勝成の旗は隊が背負って進む（空の陣所に旗だけを残さない。BH1）。家康・秀忠はこの場にいない（河内路）
  // 松平忠輝の陣（後ろ）。陣幕の内に忠輝と旗本が本当にいる（BH1）
  rt.scene.add(jinmaku(W, REAR.x, REAR.z, 12, 9, 4, { mon: 'tokugawa' }));
  for (const [x, z] of [[REAR.x - 6, REAR.z - 10], [REAR.x - 6, REAR.z + 10]]) rt.scene.add(nobori(W, x, z, 'tokugawa', 6));
  rt.scene.add(kagaribi(W, REAR.x - 4, REAR.z + 2));
  // 小松山の頂の後藤勢の旗（浪人衆は豊臣の旗の下）。頂の平らに輪に立て、どこが頂か遠くから分かるように
  for (const [x, z] of [[8, -10], [-2, 8], [14, 6], [0, -4], [10, -2], [-4, -12]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  // 誉田八幡（誉田陵の南の裾。薄田兼相が陣を張った境内）：社殿と白木の鳥居、薄田の旗
  rt.scene.add(dou(W, HACHIMAN.x, HACHIMAN.z + 4, 7, 5, 0, { h: 2.6 }));
  {
    const wood = bridgeWoodMaterial(), tz = HACHIMAN.z - 3, y = W.heightAt(HACHIMAN.x, tz), T = new THREE.Group();
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 3.8, 10), wood); p.position.set(sx * 1.6, 1.9, 0); T.add(p); solidCircle(HACHIMAN.x + sx * 1.6, tz, 0.24); }
    for (const [w, yy, d, hh] of [[4.7, 3.9, 0.38, 0.28], [4.2, 3.65, 0.3, 0.2], [3.9, 2.9, 0.16, 0.18]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), wood); b.position.y = yy; T.add(b); }
    T.position.set(HACHIMAN.x, y, tz); T.traverse((o) => { o.castShadow = true; }); rt.scene.add(T);
  }
  for (const [x, z] of [[HACHIMAN.x - 7, HACHIMAN.z - 4], [HACHIMAN.x + 7, HACHIMAN.z - 4]]) rt.scene.add(nobori(W, x, z, 'toyotomi', 6));
  // 誉田の村の民家（板の壁・茅葺き。夕方に火を放たれる）
  for (const [x, z, r] of HOUSES) rt.scene.add(hut(W, x, z, 7, 5, r, { groundedHome: true }));
}

// 芦毛（灰白の毛）は描くと真っ白な置物の馬に見える（kaito 十5）。この戦の馬は鹿毛・黒鹿毛にそろえる（半秒ごとに乗った馬を見る）
const GRAY = 0x74716b;
function recoat(rt) {
  for (const u of rt.army.units) {
    if (u._coatOk || !u.alive || !u.mounted || !u.horse || u.isPlayer) continue;
    u._coatOk = true;
    const st = u.horse.userData && u.horse.userData.style;
    if (!st || (st.coat !== GRAY && ((st.coat >> 16) & 255) + ((st.coat >> 8) & 255) + (st.coat & 255) < 300)) continue;
    rt.army.setMounted(u, false);
    rt.army.setMounted(u, true, buildHorse({ ...st, coat: 0x2e1f16, mane: 0x0e0b09, points: 1 }));
  }
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 10, list, seek: o.seek || 55, ...o });

// 放置や時間切れで目標を飛ばさず、本人が持ち場へ着いてから済ませる。
function checkedStep(step) {
  step.idleAdvance = false;
  if (step.kind !== 'fight' && step.kind !== 'hold') return step;
  if (step.kind === 'hold') {
    const start = step.start;
    step.start = (rt, C, m, ctx) => {
      start(rt, C, m, ctx);
      rt.unzone('dp'); // 持ち場は頭上の▼で示し、共通の守備範囲の輪を地面に残さない。
    };
  }
  const tick = step.tick, holdTime = step.kind === 'hold' ? (step.max - 35) * 0.45 : 0;
  step.max = Infinity;
  step.tick = (rt, C, m, ctx, el, dt) => {
    const p = rt.player.u.pos;
    const near = Math.hypot(p.x - C.at.x, p.z - C.at.z) < 32;
    if (near && C.arrivedAt == null) C.arrivedAt = rt.t;
    // 誉田へ本人が着く前に寄せと鉄砲戦を終えない。到着前の移動時間は守備の刻に入れない。
    if (holdTime && C.arrivedAt == null) { C.approachTime = el; return false; }
    const done = tick(rt, C, m, ctx, el - (C.approachTime || 0), dt);
    // 共通の激突は残り三人で敗走を許すが、兼相が逃げると討死待ちの段が終わらない。
    // 討つべき将が生きている組は、最後の一人まで持ち場で戦う。
    for (const g of C.groups) if (g.units.some((u) => u.alive &&
      (u.name === '後藤又兵衛' || u.name === '薄田兼相'))) {
      g.noRout = true;
      g.morale = Math.max(g.morale, 60);
    }
    // 誉田は本人だけが近くにいれば済む待機にしない。味方の列と共に受けた刻だけ数える。
    if (holdTime) {
      let friends = 0;
      const line = rt.flags.dp?.i === 5 ? [rt.flags.date, rt.flags.katakura] : ctx.friends?.(rt) || [];
      if (near) for (const g of line) {
        if (!g || g.routed || g.order === 'retreat' || g.order === 'flee') continue;
        for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing && !u.woundOut &&
          !u.gone && !u.rearWound && !u.downed && !u.noTarget &&
          Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 32) friends++;
      }
      if (near && friends >= 3) C.lineTime = (C.lineTime || 0) + dt;
    }
    if (!done || !near || (holdTime && (C.lineTime || 0) < holdTime)) return false;
    // 残り二人や敗走でも共通の段は済むが、又兵衛と兼相は討死まで待つ。
    return !C.groups.some((g) => g.units.some((u) => u.alive &&
      (u.name === '後藤又兵衛' || u.name === '薄田兼相')));
  };
  return step;
}

// 後藤又兵衛の討死（必ず）。鉄砲に撃たれ、麾下の兵に見取られる
function matabeiDown(rt) {
  const F = rt.flags;
  if (F.matabei) return;
  F.matabei = true;
  for (const u of rt.army.units) if (u.alive && u.name === '後藤又兵衛') rt.army.kill(u);
  rt.award((t) => { t.special = { label: '後藤又兵衛が小松山に果てた', pts: 40 }; }, '後藤又兵衛が討死した');
  // 見出しは共通の「後藤又兵衛が討たれた」の一枚だけ（二枚重ねない。五6）
  sfx('horagai', 0.7);
  rt.after(1.5, () => rt.say('後藤の侍', '殿は鉄砲に……吉村が介錯つかまつった！　薄田殿はまだか、真田殿は！', 3.6));
  // 主を失った後藤勢は崩れる（頂の段を締める）
  for (const g of rt.army.groups) if (g.team === 1 && /後藤/.test(g.name || '') && g.count) { g.noRout = false; g.morale = 0; }
}

// 又兵衛は頂で待たず、山を西から東へ駆け下りて槍を入れる（史実：数度押し返し、最後は隊を二つに分けて突っ込んだ）
function matabeiCharge(rt) {
  for (const g of rt.army.groups) {
    if (g.team !== 1 || !/後藤/.test(g.name || '') || !g.count) continue;
    const p = rt.player.u.pos;
    // 石川へ下りた本人を追って西へ突撃せず、頂から東の斜面を押し返す。
    g.calm = false; g.order = 'attack'; g.seekRange = 35; g.aggro = 30;
    g.anchor = { x: Math.max(TOP.x, Math.min(SLOPE.x, p.x - 4)), z: Math.max(-16, Math.min(16, p.z)) };
  }
}

// 片倉重綱の鉄砲が又兵衛を撃つ（伊達家の記録。胸を撃たれて家臣に介錯させた）。本人が先に討てばそれが手柄
function matabeiShot(rt) {
  const F = rt.flags;
  if (F.matabei || F.ending || rt.over) return;
  const v = rt.army.units.find((u) => u.alive && u.name === '後藤又兵衛');
  const k = F.katakura && F.katakura.units.find((u) => u.alive && u.name === '片倉重綱');
  const p = rt.player.u.pos;
  // 下知を出す将だけでなく、撃てる鉄砲兵が又兵衛の近くにいることを確かめる。
  const gunner = () => F.katakura?.units.find((u) => u.alive && u.weapon === 'gun' &&
    !u.gone && !u.woundOut && !u.downed && !u.noTarget && !u.fleeing && !u.rearWound &&
    Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) <= 60);
  const ready = () => v?.alive && k?.alive && rt.player.u.alive &&
    Math.hypot(p.x - TOP.x, p.z - TOP.z) < 32 &&
    Math.hypot(p.x - v.pos.x, p.z - v.pos.z) <= 50 && gunner();
  // 時刻だけで見えない所の最期を済ませない。本人が頂へ寄り、片倉の隊が届くまで待つ。
  if (!ready()) {
    rt.after(1, () => matabeiShot(rt));
    return;
  }
  rt.say('片倉重綱', 'あの黒の具足、又兵衛ぞ。鉄砲、揃えて放て！', 3);
  rt.after(2.4, () => {
    if (F.matabei || F.ending || rt.over) return;
    // 下知の後に本人が離れたり鉄砲兵が倒れたりした時は、射撃を待ち直す。
    const shooter = ready();
    if (!shooter) { rt.after(1, () => matabeiShot(rt)); return; }
    rt.army.play('volley', shooter.pos, 1.4);
    if (v && v.alive) { v.hp = 1; v.stagger = 1.2; }
    rt.after(1.2, () => { if (!F.ending && !rt.over) matabeiDown(rt); });
  });
}

// 伊達勢が国分を抜けて着く（片倉重綱の鉄砲隊が先手。政宗はその後ろの旗本の中）
function datearrive(rt) {
  const F = rt.flags;
  if (F.date) return;
  F.date = allyGroup(rt, { faction: 'tokugawa', name: '伊達勢', fixed: true, speed: 4.2, anchor: { x: TOP.x + 26, z: 12 }, facing: -Math.PI / 2, width: 14, aggro: 14, order: 'attack', seekRange: 90, noRout: true, dmgMult: 0.8 },
    dress([uS(5), uA(16), uG(8)], DATE));
  F.katakura = allyGroup(rt, { faction: 'tokugawa', name: '片倉重綱の鉄砲隊', fixed: true, speed: 4.2, anchor: { x: TOP.x + 18, z: -14 }, facing: -Math.PI / 2, width: 12, aggro: 14, order: 'attack', seekRange: 90, noRout: true, dmgMult: 0.8, formation: 'line' },
    dress([{ type: 'busho', n: 1, o: { name: '片倉重綱', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(3), uG(14)], DATE));
  // 政宗は伊達勢の後ろ（前へは出ない）
  F.masamune = allyGroup(rt, { faction: 'tokugawa', name: '伊達政宗の旗本', anchor: { x: TOP.x + 44, z: -20 }, facing: -Math.PI / 2, width: 8, aggro: 6, order: 'hold', noRout: true, fullStrength: true },
    dress([{ type: 'busho', n: 1, o: { name: '伊達政宗', invuln: true, horse: true, hat: 'kabuto', flag: 'date_hinomaru' } }, uS(7)], DATE));
  F.masamune.noFrontline = true;
  for (const g of [F.katakura, F.masamune]) for (const u of g.units) if (u.alive && u.name && u.mounted) F.riders.push({ u, speed: u.speed, run: u.run, g });
  for (const [x, z] of [[TOP.x + 48, -28], [TOP.x + 22, -22], [TOP.x + 30, 20]]) rt.scene.add(nobori(rt.world, x, z, 'date', 6));
  rt.army.play('toki', { x: 70, z: 0 }, 1.2);
  rt.say('伊達政宗', '片倉、前へ出よ。又兵衛を討ったなら、あとは野の戦じゃ', 3.8);
}

// 11/6 fix61（kaito 九1・九3・十1）：右上は①〜⑤（STAGES の五つ）を最初から全部並べ、済んだ物に印。両軍の兵の数の棒（徳川方 三万四千 対 豊臣方 一万八千六百・force）も上に常に出す。
//   徳川編の札（battleOrder）は今の一行だけなので、真田丸と同じく目標の札を重ねて置き換える。残りの時の字は出さない（三1）。
//   敵の頭上の赤い▼は共通の印が近い四人までなので、四十m 内の見える敵の残りにも同じ▼を付ける（九3）。印は使い回す
const BOARD_CSS = `
html:root body #hud#hud#hud.domyoji-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.domyoji-goals #armybar .clock { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) #hud#hud#hud.domyoji-goals :is(#armybar, #h-prog) { visibility:hidden !important; }
html:root body:has(#intro:not([hidden]) > .card) .field-names { visibility:hidden !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode > :not(.pg-goals) { display:none !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode > .pg-goals { display:block !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode {
 left:auto !important; right:calc(12px + env(safe-area-inset-right, 0px)) !important; transform:none !important;
 width:auto !important; min-width:0 !important; max-width:min(340px, 38vw) !important; box-sizing:border-box;
 padding:8px 12px 9px 10px !important; background:rgba(14,12,10,.7) !important; border:none !important; border-radius:6px !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li { display:flex !important; flex-wrap:wrap; white-space:normal !important; align-items:flex-start; color:#e6dfd2 !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li i { margin-top:3px; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li span { color:inherit !important; background:none !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li.now { color:#fff !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li.done { color:#cfc9bc !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li span { flex:1; min-width:0; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li em:not(.tm) { display:block !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li:not(.now) em { display:none !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals li:not(.now) { font-size:12px !important; line-height:1.3 !important; }
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog.goal-mode .pg-goals h3 b { display:none !important; }`;
function goalBoard(rt) {
  const hud = rt.hud;
  if (!hud?.root || typeof document === 'undefined') return;
  hud.root.classList.add('domyoji-goals');
  const style = document.createElement('style');
  style.textContent = BOARD_CSS;
  document.head.appendChild(style);
  const progress = hud.progress;
  hud.progress = function (battle) {
    const out = progress.call(this, battle);
    if (battle === rt && this.prog && !rt.over) goalsTick(this.prog, rt);
    return out;
  };
  const foeMarks = hud.foeMarks, tris = [], box = document.createElement('div'), v = new THREE.Vector3();
  // 入れ物は大きさ零（画面全体の透明な箱を札と数えない。▼は左上からの位置で置く）
  box.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:visible;pointer-events:none';
  box.setAttribute('aria-hidden', 'true');
  hud.root.appendChild(box);
  hud.foeMarks = function (battle) {
    const out = foeMarks.call(this, battle);
    if (battle !== rt) return out;
    const me = rt.player.u;
    const on = me.alive && !rt.over && !rt.choice && !this.introWaiting && !rt.player.camShot && !this.bigmap && !this.root.classList.contains('photo');
    let n = 0;
    if (on) for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.dying || u.woundOut || u.noTarget || u.isStruct || u.civ || u.team === me.team || u.team > 1 || u._nearSignOn ||
          u.mesh?.visible === false || u.camHidden) continue;
      const d2 = (u.pos.x - me.pos.x) ** 2 + (u.pos.z - me.pos.z) ** 2;
      if (d2 > 3600) continue;
      // 二十五 m の内は霧でも必ず付ける（斜面の斬り合いで、目の前の後藤勢に▼が無かった。九3「一人残らず」）
      if (d2 > 625) {
        if (!(u._dmSeenAt > rt.t - .34 && u._dmSeenAt <= rt.t)) { u._dmSeen = sightUnit(rt, u); u._dmSeenAt = rt.t; }
        if (!u._dmSeen) continue;
      }
      v.set(u.pos.x, u.pos.y + (u.mounted ? 3.2 : 2.25), u.pos.z).project(rt.camera);
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      let el = tris[n];
      if (!el) {
        el = tris[n] = document.createElement('span');
        el.textContent = '▼';
        el.style.cssText = 'position:absolute;left:0;top:0;color:#ff4a2e;font-size:26px;line-height:1;-webkit-text-stroke:1.5px #2a0d06;text-shadow:0 1px 2px #000;pointer-events:none';
        box.appendChild(el);
      }
      n++;
      el.hidden = false;
      el.style.transform = `translate(${((v.x + 1) * innerWidth / 2).toFixed(1)}px,${((1 - v.y) * innerHeight / 2).toFixed(1)}px) translate(-50%,-100%)`;
    }
    for (let i = n; i < tris.length; i++) tris[i].hidden = true;
    return out;
  };
  // 人数と棒は共通の updateArmy にそろえる。旧欄へも書くと人数が二重になる。
  // 戦の途中で上下に黒い帯を出さない（何もしていないのに映画の画面に替わる。九7）
  const cineFlash = hud.cineFlash, shotBars = hud.shotBars;
  hud.cineFlash = function () {}; hud.shotBars = function () {};
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.cineFlash = cineFlash; hud.shotBars = shotBars;
    hud.foeMarks = foeMarks; box.remove();
    hud.progress = progress;
    if (hud.prog) hud.prog.classList.remove('goal-mode');
    hud.root.classList.remove('domyoji-goals'); style.remove();
    return dispose.call(this);
  };
}

const k13_domyoji = {
  // 身の回りの合戦の跡（timeslip_field.js）。道明寺：五月初め（今の六月）の霧の朝。濡れた初夏の草、小松山の斜面の倒れた槍と旗
  timeslip: {
    wet: 0.4, dust: 0.2, trample: 0.3, debris: 0.45, arrows: 1, maxSlope: 0.3,
    grass: 0x7e9a4c, grassTints: [0xffffff, 0xe4ecc4, 0xc8d49c], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 1,
    flagColors: [0xe6dfcc, 0x24211e, 0x8e1f16],
  },
  spawn: { x: START.x - 4, z: START.z, heading: -Math.PI / 2 },
  // 始まりの札：戦の名・年・味方対敵と両軍の数・二三行（kaito 五4）
  // 両軍の数は味方対敵の行に入れると一行に収まらず、豊臣方の数が次の行へ落ちた。本文の頭に書く
  introText: '徳川方 三万四千、豊臣方 一万八千六百。霧の朝、国分の口。小松山に先に出た後藤又兵衛を、水野勝成の先手と攻め上る。昼には誉田で、真田・毛利の寄せを伊達勢と受け止める。',
  noGoalCount: true,      // 討つ相手の向きを画面の端の赤い太い矢印で指さない（矢印は使わない。五3。11/7 の遊びで②③に出た）
  goalSignTriangle: true, // 共通の行き先の印も、画面の端で矢印へ回さず▼のままにする。
  nameRange: 50,         // 水野・本多・片倉・又兵衛・薄田・真田の名を、組が見える所から出す（五2・九3）
  waitForPortrait: true, // 顔を覚えていない初戦でも黒い影を出さず、本人の顔が撮れてから表示する。
  noWake: true, noReserve: true, noTaishoRaid: true, noFarFill: true, noAheadFill: true,
  // 刃を受けた後の3秒は次の刃を通さない（三万四千の中で足軽一人に十秒で討たれない。kaito 十二3）
  meleeGrace: { rate: 1, burst: 1, interval: 3 },
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を何人討つ」で埋めない。三1）
  goalsAllRows: true,     // 共通の札でも①〜⑤を作り、今の一つ以外も最初から並べる（九1・十1）
  // 歩こうとした強さを覚える（動けなくなった時に抜け出す。BH8）。速さはそのまま返す
  playerVelocity(rt, vx, vz) { const F = rt.flags, q = F.pv || (F.pv = { x: 0, z: 0 }); F.want = Math.hypot(vx, vz); q.x = vx; q.z = vz; return q; },
  // 作り物の遠景の軍勢・奥の乱戦を出さない（kaito 11/3 AA・AF・AQ6）
  noDistantBattle: true, noFrontFill: true,
  // 豊臣の総大将 秀頼は大坂城、徳川の家康・秀忠は河内路。この場の総大将の討ち取りで勝ち負けを決めない
  taisho: { a: null, b: null },
  minutes: 7,
  world: {
    seed: 1615506,
    time: 'morning',
    mist: true,
    // 濃い霧（後続が遅れた原因）：見通しは五十歩ほど。④の前に晴れる（update で fogFar・mistFar を戻す）
    fogFar: 20, mistFar: 40,
    groundHalf: 300,
    mountainScale: 0.6,
    paths: [ROUTE.slice(0, 5), ROUTE.slice(4)],
    // 石川（南から北へ）と大和川（北の端。国分の亀の瀬から西へ）。石川は大和川に入って終わる
    streams: [{ pts: [[ISHI_X + 2, 260], [ISHI_X - 4, 110], [ISHI_X, 0], [ISHI_X - 2, -80], [ISHI_X - 6, YAMATO_Z]], w: 12, depth: 0.75 },
      { pts: [[70, YAMATO_Z - 14], [20, YAMATO_Z - 6], [ISHI_X - 6, YAMATO_Z], [-140, YAMATO_Z - 4], [-260, YAMATO_Z - 10]], w: 20, depth: 0.8 }],
    height,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3.4) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      // 石川の河原
      if (Math.abs(x - ISHI_X) < 10) { c.setRGB(c.r * 0.55 + 0.15, c.g * 0.55 + 0.14, c.b * 0.55 + 0.1); return; }
      // 誉田陵の空堀は湿った濃い草、墳丘は木の下の土
      { const kd = kofunDist(x, z); if (kd < 6) { const k = kd > 0 ? 0.6 : 0.75; c.setRGB(c.r * k, c.g * k + 0.02, c.b * k); return; } }
      // 河内の野は田と畑（初夏の青田）
      if (h < 4 && x < -20) { c.setRGB(c.r * 0.6 + 0.04, c.g * 0.7 + 0.14, c.b * 0.6 + 0.03); return; }
      // 小松山の斜面は土と下草（急な所ほど土の色）
      if (h > 6 && x > -50 && x < 80) { const k = Math.min(1, (h - 6) / 14); c.setRGB(c.r * (1 - 0.3 * k) + 0.12 * k, c.g * (1 - 0.32 * k) + 0.1 * k, c.b * (1 - 0.3 * k) + 0.06 * k); }
    },
    // 小松山の左右の裾（道から離れた所）には木を残す
    clear: (x, z) => kofunDist(x, z) > 0 && kofunDist(x, z) < 9 || HOUSES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 7) || Math.hypot(x - HACHIMAN.x, z - HACHIMAN.z - 1) < 9 || distToPolyline(x, z, ROUTE) < 9 || (Math.abs(z) < 40 && x > -160 && x < 130 && !(x > -40 && x < 70 && Math.abs(z) > 22)),
    trees: 420,
    tufts: 2400,
    treeDensity: (x, z) => { const kd = kofunDist(x, z); if (kd > 0 && kd < 9) return 0; if (kd <= 0) return 1.4; if (distToPolyline(x, z, ROUTE) < 12) return 0; return Math.abs(z) > 50 ? 1.1 : 0.15; },
    groves: [{ x: 90, z: -50, r: 18, n: 22, kind: 'sugi' }, { x: 80, z: 54, r: 18, n: 22, kind: 'sugi' }, { x: -110, z: 50, r: 14, n: 16 },
      { x: 16, z: -50, r: 14, n: 18 }, { x: 8, z: 50, r: 14, n: 18 }, { x: 44, z: -48, r: 10, n: 10 }, { x: -24, z: 48, r: 10, n: 10 }, { x: -6, z: -60, r: 16, n: 18 }, { x: 0, z: 62, r: 16, n: 18 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -220 : x > 240),
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags;
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    flags(rt);
    // ---- 東軍：水野勝成の先手（勝成は自ら前で戦った）・自分の手勢・本多忠政の隊 ----
    F.mizuno = allyGroup(rt, { faction: 'tokugawa', name: '水野勝成の先手', fixed: true, anchor: { x: START.x - 14, z: START.z - 4 }, facing: -Math.PI / 2, width: 12, aggro: 12, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '水野勝成', invuln: true, horse: true } }, uS(8), uA(22), uG(8), uB(2)], MIZU));
    F.mine = allyGroup(rt, { faction: 'tokugawa', name: '手勢', fixed: true, anchor: { x: START.x - 8, z: START.z + 8 }, facing: -Math.PI / 2, width: 10, aggro: 10, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([uS(3), uA(12), uG(4), uB(2)], MIZU));
    F.honda = allyGroup(rt, { faction: 'tokugawa', name: '本多忠政の隊', fixed: true, anchor: { x: START.x - 6, z: START.z - 16 }, facing: -Math.PI / 2, width: 10, aggro: 10, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '本多忠政', invuln: true, horse: true } }, uS(5), uA(16), uG(6)], HONDA_K));
    // 先に小松山へ取り付いた松倉重政・奥田忠次の先手（寅の刻に後藤勢に崩され、奥田は討死。勝成らが助けに出る）
    F.matsukura = allyGroup(rt, { faction: 'tokugawa', name: '松倉重政・奥田忠次の先手', fixed: true, anchor: { x: SLOPE.x + 10, z: SLOPE.z + 14 }, facing: -Math.PI / 2, width: 10, aggro: 12, speed: 4.2, noRout: true, order: 'attack', seekRange: 30, dmgMult: 0.7 },
      dress([{ type: 'busho', n: 1, o: { name: '松倉重政', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '奥田忠次', horse: true } }, uS(3), uA(10), uG(4)], TOKU));
    // 松平忠明の隊（大和口の先鋒の一つ。水野・本多と並んで山へ寄せる）
    F.tadaaki = allyGroup(rt, { faction: 'tokugawa', name: '松平忠明の隊', fixed: true, anchor: { x: START.x - 2, z: START.z + 20 }, facing: -Math.PI / 2, width: 10, aggro: 10, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '松平忠明', invuln: true, horse: true } }, uS(4), uA(10), uG(4)], TOKU));
    // 大和口の総大将 松平忠輝は後ろの陣幕の内に留まる（史実で戦に間に合っていない）。陣幕の内と口を旗本が固める（BH1・AV18）
    F.tadateru = allyGroup(rt, { faction: 'tokugawa', name: '松平忠輝の旗本', fixed: true, anchor: { x: REAR.x, z: REAR.z }, facing: -Math.PI / 2, width: 10, aggro: 6, seekRange: 12, order: 'hold', noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '松平忠輝', invuln: true, horse: false, hat: 'kabuto_w' } }, uS(14), uA(8), uG(4)], TOKU));
    // 総大将は陣幕の内の床几に腰を下ろす（kaito AV7「本陣の総大将は座っている」）
    const tdt = F.tadateru.units.find((v) => v.name === '松平忠輝');
    if (tdt) tdt._crouch = true;
    F.tadateru.noFrontline = true;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 12) }]);
    // 名のある将は馬上（BH2）。乗り手の足の速さを覚え、馬を失っても乗り直させる
    F.riders = [];
    for (const g of [F.mizuno, F.honda, F.tadaaki, F.matsukura]) for (const u of g.units) if (u.alive && u.name && u.mounted) F.riders.push({ u, speed: u.speed, run: u.run, g });
    // 始まりの札の後ろにも芦毛の白い馬を写さない（札の間は update が回らない）
    recoat(rt);
    // 使番の騎馬は setup の後に加わる（芦毛が札の後ろに白く写った）。始まりの札の間にも塗り直す
    for (const ms of [0, 400, 1500]) setTimeout(() => { if (rt.army && !rt.over) recoat(rt); }, ms);
    // 動けなくなった時に抜け出す（BH8）：歩こうとした向きを覚える
    F.want = 0; F.stillT = 0; F.goodPos = [];
    // 目標に名を挙げた敵将は、右上の目標・頭上の名で伏せない（「見えぬ敵の陣を物見する」に替えない。十1）
    for (const n of FOES) revealName(rt, n);
    rt.setPhase('brief');
    rt.obj('main', GOALS[0], 'main');
    goalBoard(rt);
    // 三万四千の味方の中で、主人公が足軽数人に囲まれて数十秒で討たれて戦が終わらない（kaito 十二3）：
    //   命が三割五分を切ったら、受ける傷を半分にする（その間に手勢と家臣が囲んで守る。keepUp）
    const P = rt.player, td = P.takeDamage;
    P.takeDamage = function (a, src) { return td.call(this, this.u.hp < this.u.maxHp * 0.35 ? a * 0.5 : a, src); };
    rt.say('水野勝成', '松倉と奥田の先手が小松山で崩れかけておる。霧の中じゃ、すぐ助けに出る', 4.5);
    rt.after(5, () => rt.say(nm(rt), '山の上は後藤又兵衛。ほかの隊は霧でまだ見えませぬ', 3.6));
    // 始めから味方の組が麓へ歩き出す（本人だけが丘に着いて一人に見えない）
    rt.after(2, () => {
      [F.mizuno, F.mine, F.honda, F.tadaaki].forEach((g, i) => { if (g && g.count) { g.calm = false; g.order = 'attack'; g.seekRange = 45; g.anchor = { x: SLOPE.x + 14 + i * 4, z: SLOPE.z + (i - 1) * 10 }; } });
    });
    rt.after(9, () => rt.say('水野勝成', '霧が晴れて大坂の後詰が着く前に、小松山を取る。かかれ！', 4));
    rt.after(13.5, () => this.begin(rt));
    jin13.install(rt, this);
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('battle');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    // 奥田忠次の討死（史実。後藤勢の最初の押しで）
    rt.after(16, () => {
      const o = F.matsukura && F.matsukura.units.find((v) => v.alive && v.name === '奥田忠次');
      if (o) rt.army.kill(o, null);
      rt.say('松倉の足軽', '奥田殿が討たれた！　後藤の槍が下りて来る！', 3.4);
    });
    const look = (list) => dress(list, TOYO);
    // fixedSpawn：段の敵は書いた所（頂・道明寺の野・誉田）から出る。見えない所を探して出すと、頂の又兵衛の組が石川の向こうに湧き、
    //   「頂で討て」の戦が川の中で起きた（11/7 描いて遊んだ写真）
    depthStart(rt, { fixedSpawn: true, faction: 'toyotomi', flag: 'toyotomi', armor: TOYO.armor, friends: () => [F.mizuno, F.mine, F.honda, F.tadaaki, F.matsukura, F.date, F.katakura].filter((g) => g && g.count && !g.routed), look, scale: 1.6, dmg: 0.5, botSeek: 45, mass: 0, backing: false,
      // ①②は小松山の上で戦う：遊ぶ頭が逃げる後藤勢を追って西の斜面を石川まで下りない（味方から離れて一人で討たれた。11/7）
      botSteer: (b, inp) => { const D = b.flags.dp, u = b.player.u; if (D && D.i <= 1 && u.pos.x < TOP.x - 16) { b.player.yaw = Math.atan2(TOP.x + 6 - u.pos.x, TOP.z - u.pos.z); inp.k.add('KeyW'); } } }, [
      // ① 小松山の東の斜面（撃ち下ろす鉄砲組と、駆け下りる槍）
      DP.fight({ at: SLOPE, title: '小松山', sub: '斜面に後藤勢の鉄砲組が並ぶ', obj: GOALS[0], max: LIMIT[0], noRefill: true,
        say: [['足軽', '山の上から撃ち下ろしてくる！　身を低うせよ']],
        foes: () => [keep('後藤勢の鉄砲組', SLOPE, [uS(3), uA(8), uG(9)], { dx: -14 })],
        later: [{ t: 30, say: ['後藤の侍', '押し返せ！　山を下りて槍を入れよ'], foes: () => [keep('後藤勢の槍組', SLOPE, [uS(3), uA(10)], { dx: -20, dz: 10, dmg: 0.75 })] }],
        reward: '小松山の斜面を破った' }),
      // ② 頂の後藤又兵衛（孤立しても侍衆が固く守る。必ず討たれる）
      DP.fight({ at: TOP, title: '後藤又兵衛', sub: '後続は霧で遅れ、小松山の頂は孤立している', obj: GOALS[1], max: 200, noRefill: true,
        say: [['後藤又兵衛', '薄田も真田も遅れたか。ならば我が手で、この山を墓所とする！'], ['足軽', '黒の甲冑、又兵衛じゃ！　侍衆が固めておる！']],
        foes: () => [keep('後藤又兵衛の旗本', TOP, [{ type: 'busho', n: 1, o: { name: '後藤又兵衛', horse: true, hat: 'kabuto' } }, uS(10), uA(8), uG(5)], { dx: -6, morale: 100, noRout: 120, dmg: 0.6 })],   // 0.8 では十秒で命が四割まで減った（11/7 の遊び。十二3）
        later: [
          // 又兵衛は頂で待たず、隊を率いて東の斜面へ駆け下りる（何度も押し返した）
          { t: 14, say: ['後藤又兵衛', '下りて突き崩す！　我に続け！'], foes: () => { matabeiCharge(rt); return []; } },
          { t: 30, say: ['後藤の侍', '殿をお守りせよ！　一歩も退くな！'], foes: () => [keep('後藤勢の新手', TOP, [uS(3), uA(9), uG(3)], { dx: -10, dz: 10, dmg: 0.6 })] },   // 頂の西の縁から（西の斜面の下に出すと、追った本人が石川の岸で一人になった）
          { t: 40, say: ['水野勝成', '伊達の鉄砲が着いた。撃ち込め！'], foes: () => { datearrive(rt); return []; } },
          { t: 52, foes: () => { matabeiCharge(rt); return []; } },
          // 史実：又兵衛は伊達の鉄砲に撃たれて果てた。本人が討てなくても、時が来れば物語は進む（二5）
          { t: 78, foes: () => { matabeiShot(rt); return []; } },
        ],
        // 四十秒より早く頂を破っても、誉田で並ぶ伊達勢の到着を飛ばさない。
        onEnd: (rt2) => { matabeiDown(rt2); datearrive(rt2); } }),
      DP.rest({ dur: 6, heal: 0.6, say: [['水野勝成', '又兵衛は討った。息を整えよ。石川の向こうに薄田の旗じゃ']] }),
      // ③ 石川を渡り、道明寺の野で薄田兼相を討つ（史実で討死）
      DP.fight({ at: NOGAWA, title: '薄田兼相', sub: '誉田八幡から出た薄田の手が、石川を渡って来る', obj: GOALS[2], max: LIMIT[3], noRefill: true,
        say: [['足軽', '薄田隼人の旗じゃ！　川の向こうから来るぞ！']],
        foes: () => [keep('薄田兼相の手', NOGAWA, [{ type: 'busho', n: 1, o: { name: '薄田兼相', horse: true, hat: 'kabuto_g' } }, uS(6), uA(12), uG(4)], { dx: -26, dz: -6, noRout: Infinity })],
        later: [{ t: 35, say: ['足軽', '山川賢信と明石全登の手じゃ！　霧の中から！'], foes: () => [keep('山川賢信・明石全登の手', NOGAWA, [{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(2), uA(10), uG(3)], { dx: -34, dz: 14 })] }],
        reward: '道明寺の野で薄田兼相の手を破った' }),
      DP.rest({ dur: 6, heal: 0.3, fn: () => { rt.world.setTime?.('day'); this.dateToHonda(rt); },
        banner: ['真田信繁・毛利勝永が着く', '霧が晴れ、誉田の野に赤い旗が並ぶ'],
        say: [['伊達政宗', '真田が来た。誉田で鉄砲を並べて迎える。片倉、前へ！'], ['水野勝成', '遅れて着いたが、数は一万を越える。気を抜くな']] }),
      // ④ 誉田の鉄砲戦（伊達の片倉隊と並ぶ。真田の待ち伏せで伊達勢は一度押し戻される）
      DP.hold({ at: HONDA, dur: 70, r: 16, title: '誉田の戦い', sub: '伊達勢と真田・毛利が鉄砲を撃ち合う', label: '誉田の野', obj: GOALS[3], noRefill: true,
        say: [['片倉重綱', '放て！　撃ち続けよ。弾が尽きるまで野を渡らせるな！']],
        waves: [
          { t: 4, say: ['足軽', '毛利の手じゃ！　鉄砲を揃えて来る！'], foes: () => [keep('毛利勝永の手', HONDA, [{ type: 'busho', n: 1, o: { name: '毛利勝永', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(4), uA(10), uG(8)], { dx: -40, dz: 14, noRout: 30 })] },
          // 真田は誉田陵の堀と土手に折り敷いて伏せ、片倉の寄せを引きつけて一斉に撃つ。伊達勢は一度押し戻される
          { t: 22, say: ['真田信繁', '折り敷け。引きつけて撃て。まだじゃ……放て！'], foes: () => { rt.after(1.5, () => this.datePushed(rt)); return [keep('真田信繁の手', HONDA, [{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, horse: true, ...SANADA } }, ...dress([uS(5), uA(10), uG(8)], SANADA)], { dx: -18, dz: 34, noRout: 30, dmg: 0.6 })]; } },
          { t: 30, say: ['足軽', '赤備えじゃ！　誉田陵の堀から撃って来る！　伊達殿が押し戻される！'], foes: () => [] },
        ],
        reward: '誉田で真田・毛利の寄せを止めた' }),
      // ⑤ しんがり（信繁・勝永は討てず、大坂へ退く）
      DP.hold({ at: HONDA, dur: 35, r: 16, title: '大坂へ退く', sub: '信繁の殿が、追う者を斬り払う', label: '誉田の野', obj: GOALS[4], noRefill: true,
        say: [['足軽', '八尾・若江で木村重成殿が討たれたと！　豊臣方が退き始めた！']],
        waves: [
          // 退く豊臣方が誉田の村の民家に火を放つ（史実。夕暮れの煙の中の殿）
          { t: 1, foes: () => { this.burnVillage(rt); return []; } },
          { t: 4, say: ['真田信繁', '関東勢百万と候え、男は一人もなし。引け、秀頼様の城を守る'], foes: () => [keep('真田の殿', HONDA, dress([uS(4), uA(10), uG(5)], SANADA), { dx: -40, dz: 0, dmg: 0.6 })] },
          { t: 12, say: ['足軽', '村に火を掛けて退いて行く！　煙で前が見えぬ！'], foes: () => [] },
        ],
        reward: '豊臣勢を大坂へ退かせた' }),
    ].map(checkedStep), (rt2) => this.win(rt2));
  },

  // ④の前：伊達勢（片倉の鉄砲が先・政宗はその後ろ）が誉田の野へ出て、西へ向いて鉄砲を並べる
  dateToHonda(rt) {
    const F = rt.flags;
    const put = (g, x, z, o = {}) => { if (!g || !g.count) return; g.calm = false; g.order = o.order || 'attack'; g.seekRange = o.seek || 40; g.anchor = { x, z }; if (o.line) g.formation = 'line'; };
    put(F.katakura, HONDA.x + 6, HONDA.z - 8, { line: true });
    put(F.date, HONDA.x + 10, HONDA.z + 8, { line: true });
    put(F.masamune, HONDA.x + 34, HONDA.z - 4, { order: 'hold' });
    for (const [x, z] of [[HONDA.x + 12, HONDA.z - 16], [HONDA.x + 38, HONDA.z - 10]]) rt.scene.add(nobori(rt.world, x, z, 'date', 6));
  },
  // 真田の待ち伏せの一斉射撃で、片倉の隊が十数歩押し戻され、少しして持ち直す
  datePushed(rt) {
    const F = rt.flags, g = F.katakura;
    rt.army.play('volley', { x: HONDA.x - 20, z: HONDA.z + 22 }, 1.6);
    if (!g || !g.count) return;
    g.order = 'move'; g.dest = { x: HONDA.x + 22, z: HONDA.z - 6 }; F.pushedUntil = rt.t + 12;
    rt.after(12, () => { if (g.count && !F.ending) { g.order = 'attack'; g.seekRange = 40; g.anchor = { x: HONDA.x + 4, z: HONDA.z - 4 }; rt.say('片倉重綱', '退くな！　列を立て直して撃ち返せ！', 3); } });
  },
  // ⑤：誉田の村の民家に火（夕暮れ）
  burnVillage(rt) {
    const F = rt.flags;
    if (F.burnt || !rt.world.addFire) return;
    F.burnt = true;
    HOUSES.forEach(([x, z], i) => rt.after(i * 1.6, () => rt.world.addFire(x + 0.6, z - 0.4, { size: 2.4, h: 2 })));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '道明寺を制した', pts: 40 }; }, '道明寺の野を制した');
    sfx('horagai', 0.9);
    rt.banner('豊臣勢、大坂へ退く', '慶長二十年五月六日　道明寺・誉田の戦い');
    // 生き残った豊臣勢は台詞だけでなく大坂側へ退く。朝から戦った徳川勢も追撃を止める。
    for (const g of rt.army.groups) {
      if (!g.count || g.routed) continue;
      g.calm = false; g.focus = null;
      if (g.team === 1) {
        g.order = 'retreat'; g.dest = { x: -240, z: 40 }; g.speed = 4.2; g.aggro = 0;
      } else if (g.team === 0 && !g.isPlayerSquad) {
        g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.seekRange = 0;
      }
    }
    rt.player.u.invuln = true;
    rt.after(2, () => rt.say('水野勝成', '追え！　今なら真田を討てる！', 3.4));
    rt.after(6, () => rt.say('伊達政宗', '兵は朝から戦い通しじゃ。深追いはならぬ', 4));
    rt.after(10.5, () => rt.say(nm(rt), '又兵衛殿は小松山に果てた。明日は大坂の城の前じゃ', 4.4));
    rt.finish({}, 16);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('退き太鼓', why);
    rt.say('水野勝成', '押し切れなんだ。一度国分まで退く', 4);
    rt.finish({ failureReason: why }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    try { jin13.tick(rt, dt); } catch (e) { if (!rt.flags._jinErr) { rt.flags._jinErr = 1; console.warn("道明寺の陣立て", e); } }
    if (F.ending) return;
    depthTick(rt, dt);
    this.keepUp(rt, dt);
    const D = F.dp;
    // 夕暮れは六十秒かけて移ろうので、④（午後の誉田）の始めから暮れさせ、⑤の殿の時に夕日になるように（⑤の始めからでは昼のまま終わった。11/7）
    if (!F.dusk && D && D.i >= 5) { F.dusk = true; rt.world.setTime('dusk'); }
    // 右上の主の目標は今の段の言葉（休みの間も次の段の番号と言葉をそろえる。十1）
    const gi = D && D.on ? [0, 1, 2, 2, 3, 3, 4][D.i] : null;
    if (gi != null && F.goalI !== gi) { F.goalI = gi; rt.obj('main', GOALS[gi], 'main'); }
    // 霧：③までは濃く（五十歩ほど）、④の前の休みから二十秒ほどで晴れる（史実：霧は昼までに晴れ、真田・毛利が着いた）
    const W = rt.world.def, clear = D && D.i >= 4;
    if (clear && W.fogFar < 230) { W.fogFar = Math.min(230, W.fogFar + dt * 10); W.mistFar = Math.min(95, W.mistFar + dt * 3); }
    // 目標ごとの刻限（kaito 11/3 AP8）
    const lim = D && D.on && D.cur ? LIMIT[D.i] : 0;
    if (lim && D.cur.arrivedAt != null) {
      const left = lim - (rt.t - D.cur.arrivedAt);
      if (left <= 0) { this.lose(rt, D.i === 0 ? '小松山の東の斜面の鉄砲組を破れなかった' : '道明寺の野で薄田兼相の手を破れなかった'); return; }
      if (left < 45 && F.warned !== D.i) { F.warned = D.i; rt.say('水野勝成', '霧が晴れる。豊臣の後続が着く前に、急げ', 3.5); }
    }
  },

  // 半秒ごと：味方が自分と同じ速さで付いて来る（BH3）・攻められたら家臣が囲む（BH5）・名のある将は馬上（BH2）・
  //   死んだ馬に乗れない（BH7）・動けなくなったら抜け出す（BH8）
  keepUp(rt, dt) {
    const F = rt.flags, P = rt.player, u = P.u;
    if ((F.kuT = (F.kuT || 0) - dt) > 0) return;
    F.kuT = 0.5;
    recoat(rt);
    if (!u.alive) return;
    const sp = Math.max(4.2, Math.min(9, Math.hypot(u.vel.x, u.vel.z) * 1.05));
    const threat = rt.army.nearestEnemy(u, 9);
    // 手勢と家臣の組：攻められたら自分を囲んで寄せる敵に掛かる。離れたら自分の足で追いつく
    const guards = [F.mine, ...(rt.squadGroups || [])].filter((g) => g && g.count && !g.routed);
    guards.forEach((g, i) => {
      const c = g.center(), d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      if (threat) { g.calm = false; g.order = 'attack'; g.focus = threat; g.anchor = { x: u.pos.x, z: u.pos.z }; g.seekRange = 12; g.speed = Math.max(sp, 5); }
      else if (d > 10) { g.calm = false; g.order = 'move'; g.dest = { x: u.pos.x + (i % 2 ? 2.5 : -2.5), z: u.pos.z + 3 }; g.speed = sp; g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 16; q.anchor = { x: u.pos.x, z: u.pos.z }; }; }
      else { g.focus = null; g.speed = sp; }
    });
    // 水野・本多・伊達の隊：自分より遅れたら、自分の速さで前へ出る（自分だけが先に敵を引き受けない）
    for (const g of [F.mizuno, F.honda, F.tadaaki, F.date, F.katakura]) {
      if (!g || !g.count || g.routed || g.order === 'retreat' || (g === F.katakura && rt.t < (F.pushedUntil || 0))) continue;
      const c = g.center(), lag = c.x - u.pos.x;
      g.speed = lag > 8 ? sp : 4.2;
      if (lag > 18 && F.begun) { g.calm = false; g.order = 'attack'; g.seekRange = 40; g.anchor = { x: u.pos.x + 5, z: Math.max(-30, Math.min(30, (g.anchor ? g.anchor.z : u.pos.z))) }; }
    }
    // 名のある将は馬上：馬を落とされても、少しして控えの馬に乗り直す
    for (const R of F.riders || []) {
      const v = R.u;
      if (!v.alive || v.mounted) { R.t = 0; continue; }
      if (v.pinT > rt.army.time || v.hit || v.stagger > 0) continue;
      if ((R.t = (R.t || 0) + 0.5) < 4) continue;
      R.t = 0;
      rt.army.setMounted(v, true, buildHorse(horseStyleFor(v.id, 1, R.g.faction)));
      if (v.mounted) { v.speed = R.speed; v.run = R.run; v.dismounted = false; v.horseBattle = 'mounted'; }
    }
    // 死んだ馬・命の尽きた馬は空馬の列から外す（乗れない）
    const LH = rt.army.looseHorses;
    if (LH) for (let i = LH.length - 1; i >= 0; i--) { const o = LH[i], H = o.h && o.h.userData.horse; if ((H && H.dead) || (o.stats ? o.stats.hp <= 0 : o.from && o.from.hp <= 0)) LH.splice(i, 1); }
    if (P.loose && P.horse && P.horse.userData.horse && P.horse.userData.horse.dead) P.loose.mode = 'fled';
    // 動けなくなった時：歩こうとしているのに 3 秒動かなければ固まった状態を解き、5 秒なら少し前に居た所へ戻す
    const L = F.lastP, moved = L ? Math.hypot(u.pos.x - L.x, u.pos.z - L.z) : 9;
    if (moved > 0.6) {
      F.stillT = 0; F.lastP = { x: u.pos.x, z: u.pos.z };
      F.goodPos.push(F.lastP); if (F.goodPos.length > 8) F.goodPos.shift();
    } else if (F.want > 1 && !rt.army.nearestEnemy(u, 4) && !u.climb) {
      F.stillT += 0.5;
      if (F.stillT >= 3) {
        P.catching = null; P.knockT = 0; P.staggerT = 0; P.mountT = 0; u.stagger = 0; u.hit = null; u.pinT = 0;
        if (P.cancelAttack) P.cancelAttack();
      }
      if (F.stillT >= 5 && F.goodPos.length > 1) {
        const q = F.goodPos[Math.max(0, F.goodPos.length - 3)];
        u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z);
        u.vel.x = u.vel.z = 0; F.stillT = 0; F.lastP = { x: q.x, z: q.z };
      }
    } else F.stillT = 0;
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '後藤又兵衛') matabeiDown(rt);
    if (v.name === '薄田兼相') rt.award((t) => { t.special = { label: '薄田兼相を討ち取った', pts: 20 }; }, '薄田兼相を討ち取った');
  },
};

// 兵の数は史実（徳川方 大和口 三万四千・豊臣方 後藤二千八百と後続を合わせて一万八千六百）。本物の兵一人がおよそ百人
k13_domyoji.force = (rt) => ({ a: Math.max(0, 34000 - (rt.flags.ak || 0) * 60), a0: 34000, b: Math.max(0, 18600 - (rt.flags.ek || 0) * 60), b0: 18600 });
// 陣立ての厚み（army_depth.js）・命懸けの戦場（lethal.js）・この戦の怖さ（霧の山の斬り合い・誉田の鉄砲戦）
k13_domyoji.depth = DEPTH13;
k13_domyoji.lethal = true;
k13_domyoji.fearKind = { kind: '鉄砲戦', note: '霧の小松山と誉田の撃ち合い', w: { losses: 1.4, ratio: 1.1 }, line: '撃たれるぞ、伏せよ！' };
k13_domyoji.sides = { a: { name: '徳川方', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '豊臣方', mon: 'toyotomi', faction: 'toyotomi' } };
k13_domyoji.date = (rt) => ((rt.flags.dp?.i ?? 0) >= 6 ? '慶長二十年五月六日　夕暮れ' : rt.flags.dp && rt.flags.dp.i >= 4 ? '慶長二十年五月六日　昼' : '慶長二十年五月六日　朝霧');
k13_domyoji.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k13_domyoji.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k13_domyoji.history = '慶長二十年（1615）五月六日、大坂夏の陣。大和路から大坂へ向かう徳川方（先鋒の大将 水野勝成・本多忠政・伊達政宗と片倉重綱ら三万四千ほど。総大将は松平忠輝）を、豊臣方は国分の隘路の出口で迎え撃つ策を立てた。後藤又兵衛（約二千八百）は薄田兼相・真田信繁・毛利勝永らの到着を待たず、霧の中を石川を渡って小松山へ先に出た。寅の刻（午前四時ごろ）、又兵衛は山へ取り付いた松倉重政・奥田忠次の先手を崩して奥田を討ったが、水野勝成・堀直寄らが助けに入り、伊達勢も加わって山を囲んだ。後続が霧で遅れたため又兵衛は孤立し、十倍を越える徳川方と昼まで戦って討死した。そのあと着いた薄田兼相・山川賢信・明石全登らも道明寺の辺りで破れ、兼相は討たれた。昼に着いた信繁・勝永は誉田で伊達勢と鉄砲を撃ち合い、待ち伏せで伊達勢を押し戻した。十四時半ごろ八尾・若江の敗報が届き、十六時ごろ信繁が殿を務めて大坂へ退いた。徳川方は兵が疲れ、追わなかった。\n両軍の数や細かい陣の動きは史料により異なり、地形は遊びのために縮めて復元した推定である。';
k13_domyoji.bushou = [{ name: '後藤又兵衛', g: /後藤/ }, { name: '薄田兼相', g: /薄田/ }];

k13_domyoji.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x - 6, START.z, 3);
};

// 戦の進行の札：五つの目標（段の 0・1・3・5・6）
const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
// 立て直す間も済んだ段に印を付け、次の目標を示す（主の目標の切替と同じ境目）。
STAGES.k13_domyoji = [[GOALS[0]], [GOALS[1], dpAt(1)], [GOALS[2], dpAt(2)], [GOALS[3], dpAt(4)], [GOALS[4], dpAt(6)]];

export { k13_domyoji };
export default k13_domyoji;
