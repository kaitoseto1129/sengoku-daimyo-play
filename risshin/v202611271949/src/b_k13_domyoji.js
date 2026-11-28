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
// 目標は本人が果たすまで残す。見えない刻限だけで失敗にしない（kaito の物差し・短い版）。
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
import { depthStart, depthTick, depthBot, depthJump } from './b_depth.js';
import { timeslipField } from './timeslip_field.js';
import { buildHorse, horseStyleFor } from './units.js';
import { goalsTick } from './hud_goals.js';
import { fujinRealN } from './fujin_layout.js';
import { isTouch } from './touch.js';
import * as jin13 from './k13/jindate.js';
import { DEPTH13 } from './k13/depth.js';   // 陣立ての表（army_depth.js）   // 陣立ての厚み・「真田隊、来ます！」・誉田の鉄砲戦・騎馬・徳川の損害（11/8）
import { isEn, addEn } from './i18n.js';
// K516 英語の時だけ訳の表を読む（日本語の時は読まない・重さ0）
if (isEn()) { try { addEn((await import('./i18n_k13_domyoji.js')).default); } catch (e) {} }

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
const LIMIT = [240, 0, 0, 270];
const FOES = ['後藤又兵衛', '薄田兼相', '明石全登', '山川賢信', '毛利勝永', '真田信繁'];
// 目標の言葉（右上の並び・段の目標・負けの札で同じ字。途中で言い替えない。kaito 十1）
// 11/18 クラウド kaito2（K365・cloud-07 の照らし直し）：874×402 の右上の札は二行で、長い文は「…寄せ…」と切れていた。十六字までに
//   後ろに討った数（ 7/25）が付くので、文は十二字まで
const GOALS = ['斜面の後藤の鉄砲組を破れ', '頂の後藤又兵衛を討て', '石川を渡り薄田兼相を討て',
  '誉田で真田・毛利を止めよ', '真田の殿を押し返せ'];
// 誉田では各隊の幅を空ける。共通の寄せ直しや守備の集合先を一点にすると、六隊が本人の前で重なる。
// 後列も守備の判定（三十二歩）の内へ置く。外へ広げると、伊達勢を失った後の交代が成立しない。
const HONDA_LINE = [['mizuno', 10, -20], ['honda', 10, 20], ['tadaaki', 18, 24],
  ['matsukura', 18, -24], ['date', 6, 8], ['katakura', 6, -8]];
// 左右へ広げた後列は中央の空地（南北四十歩）の外にも出る。
// 持ち場の周囲も枝と三人称のカメラの分だけ空け、古墳の林は残す。
const clearHondaLine = (x, z) => HONDA_LINE.some(([, dx, dz]) =>
  Math.hypot(x - HONDA.x - dx, z - HONDA.z - dz) < 14);
function spreadHondaLine(rt) {
  const F = rt.flags;
  if (F.ending || rt.over || !F.dp?.on || F.dp.i < 5) return;
  for (const [key, dx, dz] of HONDA_LINE) {
    const g = F[key];
    if (!g?.count || g.routed || (g.order !== 'attack' && g.order !== 'hold') ||
        g.focus || g.onArrive || !g.anchor ||
        (key === 'katakura' && rt.t < (F.pushedUntil || 0)) ||
        Math.hypot(g.anchor.x - HONDA.x, g.anchor.z - HONDA.z) > 40) continue;
    // 兵の位置には触らず、通常の移動で各隊の持ち場へ広げる。
    g.anchor.x = HONDA.x + dx; g.anchor.z = HONDA.z + dz;
  }
}
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
    if (!u.alive || !u.mounted || !u.horse || u.isPlayer || u._coatHorse === u.horse) continue;
    const st = u.horse.userData && u.horse.userData.style;
    if (!st) continue;
    // 確認済みの印は乗り手ではなく馬に結ぶ。控えの馬へ乗り直した時も色を確かめる。
    u._coatHorse = u.horse;
    if (st.coat !== GRAY && ((st.coat >> 16) & 255) + ((st.coat >> 8) & 255) + (st.coat & 255) < 300) continue;
    rt.army.setMounted(u, false);
    rt.army.setMounted(u, true, buildHorse({ ...st, coat: 0x2e1f16, mane: 0x0e0b09, points: 1 }));
    u._coatHorse = u.horse;
  }
}

// 11/18 クラウド kaito2（道明寺の持ち主）：act bot 470秒 達成・24人を討って本人へ刃が一度も来なかった（受けた傷の記録が空）。
//   味方の大勢が先に組み合い、段の敵は本人の前を素通りする。戦う段（斜面・頂・道明寺の野・誉田）で、本人から二十歩内の
//   隊の的の無い敵の組を一つだけ本人へ向ける（木津川口の huntPlayer と同じ形）。敵の数・強さは変えない。
//   本人の命が六割を切ったら・塀を挟んだら・組が崩れたら放す。
function huntPlayer(rt, F) {
  const P = rt.player.u, D = F.dp;
  // 11/22 07:20 UTC クラウド k13_domyoji の持ち主：act bot（--mobile 描かず）5本中2本が③の209秒で倒れた（石川を渡った所で
  //   薄田の手・豊臣の後詰に囲まれ、命100→0 が四〜十秒。同時に打つのは既定の四人、名乗りの薄田の手は focusMeRange で命が減っても本人を放さない）。
  //   本人の命が半分を切ったら、同時に打ち込むのは三人まで（共通の下限）・薄田の手の「本人だけを狙え」を解く（兼相本人の斬り込みは残す）。七割に戻れば元へ。
  if (rt.world?.def) rt.world.def.playerAtkMax = P?.alive && P.hp < P.maxHp * 0.5 ? 3 : undefined;
  // 11/22 12:20 UTC クラウド k13_domyoji の持ち主：act bot --mobile 3本中1本が段4の335秒で倒れた（布陣の表の「豊臣の後詰 3・5」の足軽が
  //   本人へ一突き33・十七秒で命76→0）。段の敵（keep）は本人への傷を0.6〜0.75倍にしているが、布陣の表の後詰の備は倍が無く素の重さだった。
  //   後詰の備も本人に当たる時だけ0.6倍にそろえる（味方の兵への強さ・数は変えない）。一秒ごとに新しく立った備へ付ける。
  //   12:25 直した後の3本でも1本が327秒で倒れた（後詰 2 の足軽20・倍の無い毛利勝永の手の侍24 に囲まれた）→倍の無い敵の組（段の毛利・薄田・山川明石も）を全部0.6倍へ
  // 11/22 14:20 UTC クラウド k13_domyoji の持ち主：act bot --mobile 3本中1本が③の234秒、薄田兼相の手の鉄砲に十二〜十五歩で一発35を三つ受けて倒れた。
  //   弾（takeBullet）は組の本人への倍（dmgMultPlayer）を見ず、刃だけ0.6倍・弾は素のままだった。この戦だけ、敵の弾にも本人への倍を掛ける（下限0.4・味方への弾は変えない）
  if (rt.player && !F._k13gun) {
    F._k13gun = 1;
    const tb = rt.player.takeBullet.bind(rt.player);
    rt.player.takeBullet = (amount, src) => { const t = tb(amount, src); const m = src?.group?.team === 1 ? src.group.dmgMultPlayer : null; return m != null && m < 1 ? t * Math.max(0.4, m) : t; };
  }
  if (rt.t >= (F._ksT || 0)) {
    F._ksT = rt.t + 1;
    for (const g of rt.army.groups) if (g.team === 1 && g.dmgMultPlayer == null && (g.dmgMult ?? 1) > 0.6) g.dmgMultPlayer = 0.6;
    // 11/22 14:00 UTC クラウド k13_domyoji の持ち主：13:50 の act bot --mobile 3本中1本が段4の343秒で倒れた（退く所を豊臣の後詰 3 の足軽に囲まれ、
    //   一突き20が九秒に六つ・命100→0）。本人の命が半分を切ったら、上で0.6倍にした組だけ本人へ0.4倍に下げる（七割に戻れば0.6へ。数と味方への強さは変えない）
    const low = P?.alive && P.hp < P.maxHp * 0.5, back = P?.alive && P.hp >= P.maxHp * 0.7;
    //   14:05 直した後も3本中1本が519秒で「遠くの備」（組の倍が初めから0.6以下で上の0.6倍の外）の足軽16に退く所を囲まれ倒れた→命が半分を切ったら敵の組を全部0.4倍まで（元の倍を覚えて七割で戻す）
    //   14:10 0.4倍の後も3本中1本が294秒で後詰 3 の足軽・侍に囲まれ倒れた（同時に打つ数は共通の下限三人で絞れない）→半分を切った時に三割五分も切っていれば0.3倍
    if (low) { const lm = P.hp < P.maxHp * 0.35 ? 0.3 : 0.4; for (const g of rt.army.groups) if (g.team === 1) { if (g._k13lo === undefined && Math.min(g.dmgMult ?? 1, g.dmgMultPlayer ?? 9) > lm) g._k13lo = g.dmgMultPlayer ?? null; if (g._k13lo !== undefined) g.dmgMultPlayer = Math.min(lm, g._k13lo ?? 9, g.dmgMult ?? 1); } }
    else if (back) { for (const g of rt.army.groups) if (g._k13lo !== undefined) { g.dmgMultPlayer = g._k13lo; delete g._k13lo; } }
    if (rt.def) rt.def.floorGmMin = 0.3;   // 一突きの床（命の半分×組の倍・下限0.5）も0.3倍まで下げてよい（0.6倍の組の床は今まで通り）
  }
  if (P?.alive && D?.on && D.i === 3) {
    const kg = F._kaneG?.count ? F._kaneG : (F._kaneG = rt.army.groups.find((g) => g.team === 1 && g.name === '薄田兼相の手' && g.count) || null);
    if (kg && !kg.routed) {
      if (kg.focus === P && P.hp < P.maxHp * 0.5) {
        kg.focus = null; kg.focusMeFirst = false; kg._k13low = true;
        for (const v of kg.units) if (v.alive && v.target === P && v.name !== '薄田兼相') { v.target = null; v.aiT = 0; }
      } else if (kg._k13low && P.hp >= P.maxHp * 0.7) { kg.focus = P; kg.focusMeFirst = true; kg._k13low = false; }
    }
  }
  // 11/19 02:10 UTC クラウド kaito2（持ち主）：act bot 3回とも兼相は本人の四十歩前後で筋書きの討死（本人0）。POSLOG で、名乗り・手負いの後も
  //   兼相は本人の二十二〜二十九歩先で、近い味方の兵と斬り結び続けた（必死さの「近い敵へ」が本人への的を毎回上書き）。
  //   死に物狂い（lastStand）の兼相は、本人が六十歩内なら半秒ごとに本人だけを的にして馬を寄せる（史実の名乗っての斬り込み。数と強さは変えない）
  if (P?.alive && D?.on && D.i === 3 && rt.t >= (F._kaneT || 0)) {
    F._kaneT = rt.t + 0.5;
    const v = F._kane?.alive ? F._kane : (F._kane = rt.army.units.find((u) => u.name === '薄田兼相' && u.alive) || null);
    if (v?.lastStand && !v.fleeing && !v.downed) {
      const d = Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z);
      // 的だけでは持ち場の縛りで動かなかった（02:05 の POSLOG：本人の二十八〜三十七歩で止まったまま）→七歩より遠ければ本人の二歩手前へ歩みを置く
      if (d > 7 && d < 60 && !v.atk && !v.swing) { v.target = null; v.watch = null; v.moveTo = { x: P.pos.x - (P.pos.x - v.pos.x) / d * 2, z: P.pos.z - (P.pos.z - v.pos.z) / d * 2 }; v.aiT = Math.max(v.aiT || 0, 0.6); }
      else if (d <= 7 && v.target !== P && !v.atk && !v.swing) { v.target = P; v.watch = null; v.moveTo = null; v.aiT = Math.max(v.aiT || 0, 0.6); }
    }
  }
  const on = P?.alive && D?.on && [0, 1, 3, 5, 6].includes(D.i) && P.hp >= P.maxHp * 0.6;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  // 11/18 15:55 UTC クラウド kaito2（持ち主）：act bot「7分で6人」・段1と誉田（段4）で本人の討ち取り0。誉田の毛利・真田の手は
  //   本人から四十歩先で伊達の列と撃ち合い、二十歩内に入らないので本人へ向く組が無かった。斜面は三十歩・誉田は四十五歩まで探す（数・強さは変えない）
  //   16:20 同じ回：その後の3回でも頂（段2）・道明寺の野（段3）で討0〜1 の回が残った（七分で3人・7人）→頂と野も三十歩まで探す
  const reach = D?.i >= 5 ? 45 : 30;
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack') return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < reach && !rt.army.wallBetween(c, g.team, P.pos);
  };
  // 11/18 05:55 夜50-46：act bot 3回のうち2回が「斬り合う相手が少ない（七分で2〜4人・段1と段2で討0）」。
  //   本人の命が八割以上の間は、二つ目の組も本人へ向ける（数・強さは変えない。命が減れば一組に戻る）。
  for (const key of ['_hunter', '_hunter2']) {
    let cur = F[key];
    if (cur && (cur.focus !== P || !ok(cur) || key === '_hunter2' && P.hp < P.maxHp * 0.8)) {
      // 17:20 持ち主：名乗って本人へ斬り込む薄田の手（focusMeRange）は、三十歩を離れても放さない（act bot で兼相が持ち場へ戻り四十歩先で討死した）
      if (cur.focus === P && !cur.focusMeRange) { cur.focus = null; for (const v of cur.units) if (v.target === P) { v.target = null; v.aiT = 0; } }
      if (cur._k13fmf) { cur.focusMeFirst = false; cur._k13fmf = false; }
      cur = F[key] = null;
    }
    if (cur || !on || key === '_hunter2' && (!F._hunter || P.hp < P.maxHp * 0.8)) continue;
    // 11/19 03:00 UTC クラウド kaito2（持ち主）：act bot 七分で本人の命が百のまま（頂・野で討0、本人の二〜八歩に本人を狙う組）。
    //   共通の「三歩半内の敵へ先に応戦」で、組の者は本人の横の味方の足軽へ斬りかかり本人に届かなかった→本人を狙う組は八歩内なら本人を先に打つ（数・強さは変えない）
    for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; F[key] = g; if (!g.focusMeFirst) { g.focusMeFirst = true; g._k13fmf = true; } break; }
  }
  // 11/18 07:55 クラウド kaito2（持ち主）：act bot「19人を無傷で討った」。測ると段1の後藤の鉄砲組は12発のうち本人へ1発だけ
  //   （「山の上から撃ち下ろしてくる」と言うのに、弾は味方の大勢へ行く）。段1の間、本人が五十五歩内なら鉄砲組の的を本人にする。
  //   数・強さは変えない。本人の命が六割を切ったら・組が崩れたら放す。
  const gun = F._volley === false ? null : F._volley || (F._volley = rt.army.groups.find((x) => x.team === 1 && x.name === '後藤勢の鉄砲組') || null);
  if (gun) {
    let want = false;
    if (P?.alive && D?.on && D.i === 0 && P.hp >= P.maxHp * 0.6 && !gun.routed && gun.count && (!gun.focus || gun.focus === P)) {
      gun.center(c); want = Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 55;
    }
    // 11/18 cloud-31：三十歩まで引きつける決まり（K291）では、駆け上がる本人へ斜面から一度しか撃てなかった（段1の六十秒で敵の発砲3）。
    //   段1の間だけ、斜面の鉄砲組は五十歩から撃ち下ろす。
    gun.longShot = D?.on && D.i === 0 && !gun.routed ? 50 : 0;
    //   攻めの号令のままだと鉄砲兵が団子で寄り、前の者が後ろの者の射線を塞いだ（待ちの七割）。本人が十二歩より遠い間は、
    //   斜面に横一列で据えて段撃ち（前の段が放ち、後ろと入れ替わる）。寄られたら攻めに戻す。
    if (gun.longShot && P?.alive && gun.count >= 4) {
      gun.center(c); const dP = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
      if (dP > 12 && dP < 70) {
        if (gun.order !== 'hold') { gun.order = 'hold'; gun.formation = 'line'; gun.anchor = { x: c.x, z: c.z }; gun.facing = Math.atan2(P.pos.x - c.x, P.pos.z - c.z); }
      } else if (gun.order === 'hold') gun.order = 'attack';
    } else if (gun.order === 'hold' && !gun.routed) gun.order = 'attack';
    if (want && gun.focus !== P) gun.focus = P;
    else if (!want && gun.focus === P && F._hunter !== gun && F._hunter2 !== gun) { gun.focus = null; for (const v of gun.units) if (v.target === P) { v.target = null; v.aiT = 0; } }
    if (D?.on && D.i > 0 && gun.focus !== P) F._volley = false;   // 段1を過ぎたら探し直さない
  }
}

// 11/18 21:55 UTC クラウド kaito2（持ち主）：段1（斜面）の本人の討ち取りが 0・1・1（act bot）。POSLOG で、本人が国分の寄せ口から
//   五十六歩を登る間（五十秒余り）に味方の大勢が斜面の二十三人のうち十三人を討ち、本人は二十五歩内に敵0のまま段2へ移っていた。
//   段1の間、本人が斜面の敵の組から二十五歩より遠い時だけ、本人の組でない味方の刃を四割に（三木の出城と同じ形・敵の数と強さは変えない）。
//   本人が着けば元へ戻す。段1を過ぎたら必ず戻す。
function slopeHold(rt, F) {
  const P = rt.player?.u, D = F.dp;
  if (F._slopeDone) return;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  let far = false;
  if (P?.alive && D?.on && D.i === 0) {
    far = true;
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.routed || !g.count || !D.cur?.groups?.includes(g)) continue;
      g.center(c);
      if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 25) { far = false; break; }
    }
  }
  const mates = F._slopeMates || (F._slopeMates = new Map());
  for (const g of rt.army.groups) {
    if (g.team !== P?.team || g.isPlayerSquad) continue;
    if (far && !mates.has(g)) { mates.set(g, g.dmgMult); g.dmgMult = (g.dmgMult ?? 1) * 0.4; }
  }
  if (!far) {
    for (const [g, m] of mates) g.dmgMult = m;
    mates.clear();
    if (D?.on && D.i > 0) F._slopeDone = true;
  }
}

// 11/18 14:50 UTC クラウド kaito2（持ち主）：act bot「15人を無傷で討った（歯ごたえがない）」。誉田の段（④⑤）は
//   「伊達勢と真田・毛利が鉄砲を撃ち合う」のに、真田・毛利の鉄砲は伊達の列へだけ撃ち、本人は一度も撃たれない。
//   ④⑤の間、25〜70歩の真田・毛利の鉄砲が二、三挺そろえて本人を間を置いて撃つ（数・強さは変えない。命が七割五分を切ったら撃たない
//   ＝傷を負って斬り合いから退かせない。小田原の sogamaeFire と同じ形）。
const SANADA_GUNS = ['毛利勝永の手', '真田信繁の手', '真田の殿', '薄田兼相の手', '山川賢信・明石全登の手'];   // 15:25 ③の薄田・明石の鉄砲も（act bot 351秒で「17人を無傷」がまだ一回）
function hondaFire(rt, F, dt) {
  const D = F.dp, P = rt.player?.u;
  if (!D?.on || (D.i !== 3 && D.i !== 5 && D.i !== 6)) return;
  if ((F._hfT = (F._hfT ?? 5) - dt) > 0) return;
  F._hfT = 5 + Math.random() * 3;
  if (!P?.alive || P.hp < P.maxHp * 0.75) return;
  const ready = [];
  for (const g of rt.army.groups) {
    if (g.team !== 1 || g.routed || !SANADA_GUNS.includes(g.name)) continue;
    for (const u of g.units) {
      if (!u.alive || u.type !== 'gun' || u.reload || u.fleeing || u.downed || u.mounted) continue;
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      if (d > 18 && d < 70 && Math.abs(u.pos.y - P.pos.y) < 6 && !rt.army.wallBetween(u.pos, 1, P.pos)) ready.push([d + Math.random() * 12, u]);
    }
  }
  ready.sort((a, c) => a[0] - c[0]);
  ready.slice(0, 2 + (Math.random() < 0.5 ? 1 : 0)).forEach(([, u], k) => rt.after(k * 0.25, () => {
    if (!u.alive || !P.alive || P.hp < P.maxHp * 0.75) return;
    const fl = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) / 160, v = P.vel || { x: 0, z: 0 };
    const aim = { x: P.pos.x + v.x * fl, y: P.pos.y, z: P.pos.z + v.z * fl };
    u.gunAmmo = Math.max(u.gunAmmo ?? 20, 1);
    u.heading = Math.atan2(aim.x - u.pos.x, aim.z - u.pos.z);
    if (u.mesh) u.mesh.rotation.y = u.heading;
    if (rt.army.fireGun(u, P, null, aim)) rt.army.startReload(u);
  }));
}

const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 10, list, seek: o.seek || 55, ...o });

// 11/27 クラウド21：討死を待つ将。又兵衛は討死の印（matabei）が立った後は待たない。
//   K708（筋書きの倒しは本物の当たりで）で matabeiDown の倒しが九十秒で切れ、又兵衛が生きたまま頂の段が 275〜340秒止まった（act bot・徳川編の通しで道明寺が千八十秒の時切れ）。
//   印の後も生きていれば六秒ごとに倒しを頼み直す（伊達の鉄砲の本物の一撃で倒れる）。段は印で締める
const lead = (rt, u) => u.name === '薄田兼相' || (u.name === '後藤又兵衛' && !rt.flags.matabei);
function matabeiAgain(rt) {
  const F = rt.flags;
  if (!F.matabei || rt.t < (F.mbAgainAt || 0)) return;
  F.mbAgainAt = rt.t + 6;
  for (const u of rt.army.units) if (u.alive && u.name === '後藤又兵衛') { u.group && (u.group.noRout = false, u.group.morale = 0); rt.army.kill(u); }
}

// 放置や時間切れで目標を飛ばさず、本人が持ち場へ着いてから済ませる。
function checkedStep(step) {
  const ranged = (u) => !u.mounted && !u.sidearm &&
    (u.type === 'gun' ? (u.gunAmmo ?? 20) > 0 : u.type === 'bow' && (u.arrowAmmo ?? 24) > 0);   // 11/18 kaito2：兵の得物は u.type（u.weapon は無く、射手を一人も数えていなかった）
  step.idleAdvance = false;
  if (step.kind !== 'fight' && step.kind !== 'hold') return step;
  // 共通の四分・七分の救済でも未達成の目標を飛ばさない。
  step.noHardCap = true;
  // 段固有の刻限も共通側では強制終了に使われるため、達成判定は下の処理に任せる。
  step.limit = Infinity;
  if (step.kind === 'hold') {
    const start = step.start;
    step.start = (rt, C, m, ctx) => {
      start(rt, C, m, ctx);
      rt.unzone('dp'); // 持ち場は頭上の▼で示し、共通の守備範囲の輪を地面に残さない。
    };
  }
  const tick = step.tick, maxFight = step.max, holdDuration = step.kind === 'hold' ? step.max - 35 : 0;
  const holdTime = holdDuration * 0.45;
  step.max = Infinity;
  step.tick = (rt, C, m, ctx, el, dt) => {
    const p = rt.player.u.pos;
    matabeiAgain(rt);
    // 守備は共通の判定（十六歩＋三十歩）とそろえ、前へ出て受けた間も止めない。
    const near = rt.player.u.alive && Math.hypot(p.x - C.at.x, p.z - C.at.z) < (holdTime ? 46 : 32);
    if (near && C.arrivedAt == null) C.arrivedAt = rt.t;
    if (near && !holdTime) C.foughtAt = (C.foughtAt || 0) + dt;
    // 寄せの開始は本人と味方の列がそろってから。列を離れた時間は守備に含めない。
    if (holdTime) {
      let friends = 0, available = 0;
      const line = rt.flags.dp?.i === 5 ? [rt.flags.date, rt.flags.katakura] : ctx.friends?.(rt) || [];
      if (near) for (const g of line) {
        if (!g || g.routed || g.order === 'retreat' || g.order === 'flee') continue;
        for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing && !u.woundOut &&
          !u.gone && !u.rearWound && !u.downed && !u.noTarget) {
          available++;
          if (Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 32) friends++;
        }
      }
      // 伊達勢の到着を待っても列がそろわなければ、水野・本多らが持ち場を引き継ぐ。
      // 生存者が遠くに三人いるだけで、現地の味方を数えず待ち続けない。
      // 引き継いだ後も本人と味方三人の到着・実際の交戦は必要。
      if (near && friends < 3) C.lineWait = (C.lineWait || 0) + dt;
      const relief = available < 3 || (C.lineWait || 0) >= 24;
      if (near && rt.flags.dp?.i === 5 && relief) for (const g of ctx.friends?.(rt) || []) {
        if (!g || line.includes(g) || g.routed || g.order === 'retreat' || g.order === 'flee') continue;
        for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing && !u.woundOut &&
          !u.gone && !u.rearWound && !u.downed && !u.noTarget &&
          Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 32) friends++;
      }
      // 生存していても列が遠いままなら、八秒ごとに持ち場へ寄せ直す。
      if (near && friends < 3 && rt.t >= (C.rallyAt || 0)) {
        C.rallyAt = rt.t + 8;
        const rally = relief ? ctx.friends?.(rt) || [] : line;
        for (const g of rally) {
          if (!g || g.routed || g.order === 'retreat' || g.order === 'flee' ||
              (g === rt.flags.katakura && rt.t < (rt.flags.pushedUntil || 0))) continue;
          g.calm = false; g.order = 'hold'; g.focus = null; g.onArrive = null; g.dest = null;
          // 寄せ直す時も隊の間隔を保つ。全隊を同じ一点へ集めてから広げ直さない。
          const place = HONDA_LINE.find(([key]) => rt.flags[key] === g);
          g.anchor = { x: C.at.x + (place ? place[1] : 14), z: C.at.z + (place ? place[2] : 0) }; g.seekRange = 24;
        }
      }
      // 一度そろった列は、交戦前の被弾や押し戻しで未到着へ戻さない。
      // 波を出す時計まで止めると、次の敵が来ず交戦待ちから抜けられない。
      // 達成には、この後の実際の交戦と全ての寄せを受ける条件も必要。
      // 11/19 05:55 UTC クラウド kaito2（持ち主）：POSLOG で④の八十四秒、本人は石川の西（-46〜-60）で残兵と斬り合い誉田の野から七十歩のまま、
      //   寄せの時計が止まって毛利・真田が一度も出ず（waves 3 のまま）、上限で段が切れていた。史実の誉田の撃ち合いは本人を待たない：
      //   十二秒過ぎて本人が遠ければ、寄せの時計だけ回して伊達の列と毛利・真田を撃ち合わせる（真田の槍は本人へ来る）。守った刻は数えない。
      if (!near) {
        if (rt.flags.dp?.i === 5 && el >= 12 && C.waves.length) { C.farEl = (C.farEl || 0) + dt; tick(rt, C, m, ctx, Math.max(C.holdElapsed || 0, C.farEl), dt); }
        //   四十秒過ぎてもまだ遠ければ、真田の一斉射撃に押し戻された伊達の列ごと持ち場を本人から誉田へ三十歩の所へ下げる（史実の押し戻し・数と強さは変えない）
        if (rt.flags.dp?.i === 5 && el >= 40 && !C.atShifted && rt.player.u.alive) {
          C.atShifted = true;
          const dx = C.at.x - p.x, dz = C.at.z - p.z, d = Math.hypot(dx, dz) || 1;
          C.at = { x: p.x + dx / d * 30, z: p.z + dz / d * 30 }; C.goal = C.at; C.rallyAt = 0;
          rt.marker('dp', C.at, '誉田の野', { h: 3 });
        }
        return false;
      }
      if (friends >= 3) C.lineReady = true;
      // 列の一部が先に受けた交戦も記録する。三人を数える前に敵が崩れると、
      // 寄せを退けたのに交戦待ちのまま止まってしまう。
      // 敵が近いだけでは済ませず、列との白兵戦か射線の通る弓・鉄砲戦を確かめる。
      if (!C.metAttack && rt.t >= (C.attackScanAt || 0)) {
        C.attackScanAt = rt.t + 0.25;
        C.metAttack = C.groups.some((g) => !g.routed &&
          g.order !== 'retreat' && g.order !== 'flee' && g.units.some((u) =>
          u.alive && !u.fleeing && !u.woundOut && !u.gone && !u.downed && !u.noTarget &&
          !u.rearWound && !u.isStruct && Math.hypot(u.pos.x - C.at.x, u.pos.z - C.at.z) < 60 &&
          rt.army.nearestEnemy(u, 42, (v) => v.alive && !v.fleeing && !v.woundOut &&
            !v.gone && !v.downed && !v.noTarget && !v.rearWound && !v.isStruct &&
            Math.hypot(v.pos.x - C.at.x, v.pos.z - C.at.z) < 32 &&
            (Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) <= 6 ||
              (ranged(u) &&
                rt.army.coverBetween(u.pos, v.pos, u.team) > 0 && !rt.army.shotBlocked(u, v.pos) &&
                !rt.army.allyInLine(u, v, Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z))) ||
              (ranged(v) &&
                rt.army.coverBetween(v.pos, u.pos, v.team) > 0 && !rt.army.shotBlocked(v, u.pos) &&
                !rt.army.allyInLine(v, u, Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z)))))));
      }
      if (!C.lineReady && !C.metAttack) return false;
      C.holdElapsed = (C.holdElapsed || 0) + dt;
    }
    let done = tick(rt, C, m, ctx, holdTime ? C.holdElapsed : el, dt);
    // 共通の激突は残り三人で敗走を許すが、兼相が逃げると討死待ちの段が終わらない。
    // 討つべき将が生きている組は、最後の一人まで持ち場で戦う。
    for (const g of C.groups) if (g.units.some((u) => u.alive &&
      lead(rt, u))) {
      g.noRout = true;
      g.morale = Math.max(g.morale, 60);
      // 将の組が追撃で持ち場を離れると、追った本人も現地の判定から外れる。
      // 瞬間移動させず、頂・道明寺へ戻って戦わせる。
      if (!holdTime && el >= 45 && rt.t >= (C.leaderRallyAt || 0)) {
        C.leaderRallyAt = rt.t + 8;
        g.calm = false; g.order = 'attack'; g.focus = null; g.onArrive = null; g.dest = null;
        g.anchor = { x: C.at.x, z: C.at.z }; g.seekRange = 24;
      }
    }
    // 誉田は本人だけが近くにいれば済む待機にしない。味方の列と共に受けた刻だけ数える。
    if (holdTime && C.metAttack) C.lineTime = (C.lineTime || 0) + dt;
    // 列で実際に寄せを受け、全ての波を守り切ったら残兵は大坂へ退く。
    // 不死の将や岩陰の一人を全滅するまで追わせない。
    if (holdTime && C.metAttack && !C.waves.length && C.holdElapsed >= holdDuration &&
        (C.lineTime || 0) >= holdTime) {
      for (const g of C.groups) if (!g.routed && g.count) {
        g.noRout = false; g.calm = false; g.focus = null; g.onArrive = null;
        g.order = 'retreat'; g.dest = { x: -240, z: 40 }; g.aggro = 0;
      }
      done = true;
    }
    // 斜面・頂・道明寺でも、主力が崩れた後の残兵だけで無期限に止めない。
    // 又兵衛・兼相の討死と、本人の現地への到着は引き続き必要。
    if (!holdTime && !C.later.length) {
      let remaining = 0;
      for (const g of C.groups) {
        if (g.routed || g.order === 'retreat' || g.order === 'flee') continue;
        for (const u of g.units) if (u.alive && !u.fleeing && !u.woundOut &&
          !u.gone && !u.downed && !u.noTarget && !u.rearWound) remaining++;
      }
      const leaderAlive = C.groups.some((g) => g.units.some((u) => u.alive &&
        lead(rt, u)));
      // 主力の八割が崩れ、討つ将も倒れたら、上限まで空待ちさせない。
      // 上限に達した時も、討死を果たした段は残兵の追い回しを終える。
      // 11/22 13:20 UTC クラウド k13_domyoji の持ち主：act bot --mobile で薄田が③の98秒で討死した後、残る新手を本人が追い回して
      //   段が二分（264→384秒）延び、一戦が500秒（七分越え）・⑤で倒れた。史実も兼相の討死で薄田の手は誉田へ崩れた。
      //   討つ将のいた段は、将が倒れて十五秒で締める（残兵は下の退きで大坂へ）
      if (leaderAlive) C.hadLeader = true; else if (C.hadLeader && C.leaderDeadAt == null) C.leaderDeadAt = el;
      if (!leaderAlive && (remaining <= Math.max(2, (C.nTot || 0) * 0.2) || el >= maxFight || (C.leaderDeadAt != null && el - C.leaderDeadAt >= 15))) {
        done = true;
        // 残兵を追って持ち場から離れた人には、段を締める場所を示す。
        C.goal = C.at;
        if (near) for (const g of C.groups) if (!g.routed && g.count) {
          g.noRout = false; g.calm = false; g.focus = null; g.onArrive = null;
          g.order = 'retreat'; g.dest = { x: -240, z: 40 }; g.aggro = 0;
        }
      }
      // 現地で段の上限まで戦った後は残兵を退かせる。
      // 射撃の成立待ちにさらに百五十秒を足すと、頂だけで六分近く掛かる。
      if (near && el >= maxFight && C.foughtAt >= maxFight) {
        for (const g of C.groups) if (!g.routed && g.count && !g.units.some((u) => u.alive && lead(rt, u))) { g.noRout = false; g.order = 'retreat'; g.dest = { x: -240, z: 40 }; g.aggro = 0; }
        if (rt.flags.dp?.i === 1) matabeiDown(rt, true);
        // 兼相の組だけは上の退却から除かれるため、将が離れると討死待ちが続いた。
        // 現地で上限の刻まで戦った後は、又兵衛と同じく史実の討死で締める。
        if (rt.flags.dp?.i === 3) for (const g of C.groups) {
          for (const u of g.units) if (u.alive && u.name === '薄田兼相') rt.army.kill(u);
        }
        done = true;
      }
    }
    // 11/19 06:25 UTC クラウド kaito2（持ち主）：POSLOG で①②とも残り一〜二人になった後、本人が東へ百歩（135,18）離れ、段が四十秒ほど空回りして八分を越えた。
    //   斜面・頂・野で現地で十秒以上戦った後は、離れていても段を締める（守りの段④⑤は今まで通り）
    if (!done || (!near && (holdTime || !((C.foughtAt || 0) >= 10))) || (holdTime && (C.lineTime || 0) < holdTime)) return false;
    // 残り二人や敗走でも共通の段は済むが、又兵衛と兼相は討死まで待つ。
    return !C.groups.some((g) => g.units.some((u) => u.alive &&
      lead(rt, u)));
  };
  return step;
}

// 11/19 06:30 UTC クラウド kaito2（持ち主）：⑤の殿は誉田の西四十歩（本人から百歩）に出て、三十五秒の段で本人に届かず⑤の討ち取りが三回とも0。
//   持ち場が本人の方へ寄った時（誉田から二十歩より離れた時）は、殿を持ち場の西（大坂の側）に出す。数と強さは変えない
function rearAt(rt) {
  const at = rt.flags.dp?.cur?.at;
  return at && Math.hypot(at.x - HONDA.x, at.z - HONDA.z) > 20 ? at : HONDA;
}

// 後藤又兵衛の討死（必ず）。鉄砲に撃たれ、麾下の兵に見取られる
function matabeiDown(rt, shot = false) {
  const F = rt.flags;
  if (F.matabei) return;
  F.matabei = true;
  for (const u of rt.army.units) if (u.alive && u.name === '後藤又兵衛') rt.army.kill(u);
  rt.award((t) => { t.special = { label: '後藤又兵衛が小松山に果てた', pts: 40 }; }, '後藤又兵衛が討死した');
  // 見出しは共通の「後藤又兵衛が討たれた」の一枚だけ（二枚重ねない。五6）
  sfx('horagai', 0.7);
  // 本人や味方が先に討った時は、鉄砲と介錯で果てた事にしない。
  rt.after(1.5, () => rt.say('後藤の侍', shot
    ? '殿は鉄砲に……吉村が介錯つかまつった！　薄田殿はまだか、真田殿は！'
    : '殿が討たれた！　薄田殿はまだか、真田殿は！', 3.6));
  // 主を失った後藤勢は崩れる（頂の段を締める）
  // 11/18 クラウド kaito2（持ち主）：頂の段の共通の「新手」（後藤の名の無い組）も崩す。残ると又兵衛の討死の後も上限二百秒まで残兵待ちになった（act bot 728・787秒）
  const cur = rt.flags.dp?.i === 1 ? rt.flags.dp.cur?.groups || [] : [];
  for (const g of rt.army.groups) if (g.team === 1 && (/後藤/.test(g.name || '') || cur.includes(g)) && g.count) { g.noRout = false; g.morale = 0; }
}

// 又兵衛は頂で待たず、山を西から東へ駆け下りて槍を入れる（史実：数度押し返し、最後は隊を二つに分けて突っ込んだ）
function matabeiCharge(rt) {
  // 早く又兵衛を討った時も、後に残った突撃の予約で敗走を取り消さない。
  if (rt.flags.matabei || rt.flags.ending || rt.over) return;
  for (const g of rt.army.groups) {
    if (g.team !== 1 || !/後藤/.test(g.name || '') || !g.count || g.routed ||
        g.order === 'retreat' || g.order === 'flee') continue;
    const p = rt.player.u.pos;
    // 石川へ下りた本人を追って西へ突撃せず、頂から東の斜面を押し返す。
    g.calm = false; g.order = 'attack'; g.seekRange = 35; g.aggro = 30;
    g.anchor = { x: Math.max(TOP.x, Math.min(SLOPE.x, p.x - 4)), z: Math.max(-16, Math.min(16, p.z)) };
  }
}

// 物語の射撃も実弾・硝煙・弾込めを共通の戦闘とそろえる。銃声だけでは成立させない。
function storyShot(rt, u, target) {
  if (u.reload || u.atk || u.cd > 0 || rt.army.allyInLine(u, target,
      Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z))) return false;
  u.heading = Math.atan2(target.pos.x - u.pos.x, target.pos.z - u.pos.z);
  const fired = rt.army.fireGun(u, target);
  rt.army.startReload(u);
  rt.army.gunRotate(u);
  return fired;
}

// 片倉重綱の鉄砲が又兵衛を撃つ（伊達家の記録。胸を撃たれて家臣に介錯させた）。本人が先に討てばそれが手柄
function matabeiShot(rt) {
  const F = rt.flags;
  if (F.matabei || F.ending || rt.over) return;
  const v = rt.army.units.find((u) => u.alive && u.name === '後藤又兵衛');
  const p = rt.player.u.pos;
  const active = (u) => u.alive && !u.gone && !u.woundOut && !u.downed &&
    !u.noTarget && !u.fleeing && !u.rearWound;
  // 片倉本人の負傷や一組の鉄砲切れで止めず、伊達の生きた鉄砲兵が引き継ぐ。
  const groups = [F.katakura, F.date].filter((g) => g && !g.routed &&
    g.order !== 'retreat' && g.order !== 'flee');
  // 11/18 04:10 クラウド kaito2（持ち主）：射線の通る射手を待つ間に頂の段が百秒近く延びた（act bot：t78 の後も又兵衛が 255秒まで生き、本人は頂の二十歩内）。
  //   待ち始めて十二秒を過ぎたら、丘の遮りを問わず九十歩内の伊達の鉄砲で撃つ（射撃と硝煙は実弾のまま）。
  if (F.shotWaitFrom == null) F.shotWaitFrom = rt.t;
  const relaxed = rt.t - F.shotWaitFrom >= 12;
  const ready = () => {
    if (!v?.alive || !rt.player.u.alive || Math.hypot(p.x - TOP.x, p.z - TOP.z) >= 32 ||
        Math.hypot(p.x - v.pos.x, p.z - v.pos.z) > 50) return null;
    for (const g of groups) {
      if (g.routed || g.order === 'retreat' || g.order === 'flee') continue;
      for (const u of g.units) if (active(u) && u.type === 'gun' && !u.sidearm && !u.mounted && (u.gunAmmo ?? 20) > 0 &&
          !u.reload && !u.atk && !(u.cd > 0) &&
          Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) <= (relaxed ? 90 : 60) &&
          (relaxed || (rt.army.coverBetween(u.pos, v.pos, u.team) > 0 && !rt.army.shotBlocked(u, v.pos))) &&
          !rt.army.allyInLine(u, v, Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z))) return u;
    }
    return null;
  };
  // 二十八秒待っても撃てる射手がいなければ（味方が射線に並び続ける等）、本人が頂にいる時に物語の最期で締める。
  // 11/18 15:05 持ち主：本人が頂の三十二歩の外で残兵を追うと、この締めが来ずに頂の段が147秒（一戦479秒＝八分）まで延びた。四十五秒待てば本人の居場所を問わず締める。
  if (v?.alive && rt.t - F.shotWaitFrom >= 28 && rt.player.u.alive && (Math.hypot(p.x - TOP.x, p.z - TOP.z) < 32 || rt.t - F.shotWaitFrom >= 45)) {
    rt.say('片倉重綱', 'あの黒の具足、又兵衛ぞ。鉄砲、揃えて放て！', 3);
    sfx('gun', 0.8);
    v.hp = 1; v.stagger = 1.2;
    rt.after(1.2, () => { if (!F.matabei && !F.ending && !rt.over) matabeiDown(rt, true); });
    return;
  }
  // 11/18 クラウド kaito2（持ち主）：射手を u.weapon で探していて一人も見つからず、片倉の一斉射撃が一度も起きなかった（頂が上限二百秒まで延びた訳）。u.type で探す。
  // 丘に射線を遮られた列を頂へ進める。姿を移さず、自分の足で登らせる。
  if (v?.alive && rt.t >= (F.shotRallyAt || 0)) {
    F.shotRallyAt = rt.t + 8;
    groups.forEach((g, i) => {
      g.calm = false; g.order = 'attack'; g.focus = null; g.seekRange = 28;
      g.anchor = { x: TOP.x + 12, z: TOP.z + (i ? 10 : -10) };
    });
  }
  // 時刻だけで見えない所の最期を済ませない。本人が頂へ寄り、片倉の隊が届くまで待つ。
  const shooter = ready();
  if (!shooter || !storyShot(rt, shooter, v)) {
    rt.after(1, () => matabeiShot(rt));
    return;
  }
  // 撃てる瞬間に実弾を放つ。下知の後に探し直すと、通常の攻撃・装填が先に始まり、
  // 射線の通る鉄砲兵がいても二秒四の待ち直しを繰り返してしまう。
  rt.say('片倉重綱', 'あの黒の具足、又兵衛ぞ。鉄砲、揃えて放て！', 3);
  if (v.alive) { v.hp = 1; v.stagger = 1.2; }
  rt.after(1.2, () => {
    if (F.matabei || F.ending || rt.over) return;
    // 射撃が成立した後は、射手の負傷や本人の一歩で着弾を取り消さない。
    matabeiDown(rt, true);
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
//   敵の▼は共通の印だけを使う。専用の字を重ねると同じ兵に二つ付いてしまう。
const BOARD_CSS = `
html:root body #hud#hud#hud.domyoji-goals #armybar:not([hidden]) { display:grid !important; visibility:visible !important; opacity:1 !important; }
html:root body #hud#hud#hud.domyoji-goals #armybar .clock { visibility:hidden !important; }
/* 顔が撮れるまで、隠した絵の幅だけが空の枠として残らないようにする。 */
html:root body #hud.domyoji-goals #jk-vit canvas[style*="visibility: hidden"] { display:none !important; }
/* 共通の battle-order は棒も隠すため、道明寺では両軍を左右に分けた一本だけ戻す。 */
html:root body #hud#hud#hud.domyoji-goals #h-prog#h-prog #armybar#armybar .gauge.one {
 display:block !important; grid-column:1 / -1; width:100%; }
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
  // 人数と棒は共通の updateArmy にそろえる。旧欄へも書くと人数が二重になる。
  // 戦の途中で上下に黒い帯を出さない（何もしていないのに映画の画面に替わる。九7）
  const cineFlash = hud.cineFlash, shotBars = hud.shotBars;
  hud.cineFlash = function () {}; hud.shotBars = function () {};
  const dispose = rt.dispose;
  rt.dispose = function () {
    hud.cineFlash = cineFlash; hud.shotBars = shotBars;
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
  marchIn: { road: [[164, 4], [128, 4], [98, 4]], facing: -1.5708 },   // 11/20 K474：始めを東へ七十歩下げ、西へ歩いて入る
  // 始まりの札：戦の名・年・味方対敵と両軍の数・二三行（kaito 五4）
  // 両軍の数は味方対敵の行に入れると一行に収まらず、豊臣方の数が次の行へ落ちた。本文の頭に書く
  introText: '徳川方 三万四千、豊臣方 一万八千六百。霧の朝、国分の口。小松山に先に出た後藤又兵衛を、水野勝成の先手と攻め上る。昼には誉田で、真田・毛利の寄せを伊達勢と受け止める。',
  goalEdgeArrow: false,  // 目標の人数は数え、討つ相手を指す画面の端の矢印だけ止める（五3・十八2）。
  goalSignTriangle: true, // 共通の行き先の印も、画面の端で矢印へ回さず▼のままにする。
  noGroundGuide: true,  // 守備範囲だけでなく共通画面の地面の輪も止め、行き先は頭上の▼にそろえる。
  keepBattleSigns: true, // 行き先の札を出している間も、名のある将の頭上の名を隠さない。
  // 専用の字を廃し、共通の▼を全員に一つずつ。行き先の札と重なる所だけ空ける。
  allVisibleFoeSigns: true,
  foeSignRange: 60, foeNearSignRange: 25, foeSignMinPixels: 26,
  // 11/19 クラウド kaito2（持ち主）⑥ 315秒 誉田の写真の悪い所②：石川の中の真田・毛利の手の頭上に赤い×が十数並び、兵より印が目立った。
  //   八尾・若江・三木と同じく、本人の四十m 内では本人を狙う敵と近い七人だけに印（四十m より遠い敵は旗と姿で見せる）。兵の数・斬り合いは変えない
  enemySignVisible: (rt, u) => {
    const me = rt.player.u, p = me.pos;
    const du = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
    if (du > 1600) return false;
    // 02:25 330秒の写真：本人を狙う奥の鉄砲の×がまだ十並んだ→狙う者も二十五m 内だけ（その外は近い七人に入れば出す）
    if (du < 625 && (u.target === me || u.atk?.target === me || u.swing?.target === me)) return true;
    if (rt._triT !== rt.t) {
      rt._triT = rt.t; const near = rt._triNear || (rt._triNear = new Set()); near.clear();
      const c = rt._triCand || (rt._triCand = []); c.length = 0;
      for (const v of rt.army.units) { if (!v.alive || v.team === me.team || v.team > 1 || v.isStruct || v.downed || v.woundOut) continue; const d = (v.pos.x - p.x) ** 2 + (v.pos.z - p.z) ** 2; if (d < 1600) c.push(d, v); }
      for (let k = 0; k < 7 && c.length; k++) { let bi = 0; for (let j = 2; j < c.length; j += 2) if (c[j] < c[bi]) bi = j; near.add(c[bi + 1]); c.splice(bi, 2); }
    }
    return rt._triNear.has(u);
  },
  // 通し四周目：目前の赤い印で本人と戦列を覆わない。遠くの読みやすさは残す。
  foeSignMaxPixels: 28, enemySignMaxPixels: 28,
  nameRange: 50,         // 水野・本多・片倉・又兵衛・薄田・真田の名を、組が見える所から出す（五2・九3）
  waitForPortrait: true, // 顔を覚えていない初戦でも黒い影を出さず、本人の顔が撮れてから表示する。
  // 11/19 K338（天王寺・岡山の物差し）：右上の地図を戻す。小松山・石川の河原・誉田の後続まで入る半径
  mapBack: true, mapRange: 170,
  noWake: true, noReserve: true, noTaishoRaid: true, noFarFill: true, noAheadFill: true,
  // 刃を受けた後の3秒は次の刃を通さない（三万四千の中で足軽一人に十秒で討たれない。kaito 十二3）
  meleeGrace: { rate: 1, burst: 1, interval: 3 },
  stageGoalsOnly: true,   // 目標は五つの段だけ（「敵を何人討つ」で埋めない。三1）
  goalsAllRows: true,     // 共通の札でも①〜⑤を作り、今の一つ以外も最初から並べる（九1・十1）
  goalVisibleRows: 5,     // 共通の札が実際に作る行数も五つにする（既定の一行では残りが消える）。
  nearbyAllySignLimit: 0, // 味方の頭上の白い輪は出さない（批評の五2）。敵の赤い▼と武将の名は残す。
  // 下知を待つ間も、先手が向かう小松山の斜面を示す（全戦の通し確認で開始直後の印が無かった）。
  missionPinFallback: true,
  missionPin(rt) {
    if (rt.flags.ending || rt.over) return null;
    if (!rt.flags.begun) return { x: SLOPE.x, z: SLOPE.z, r: 6, label: '小松山' };
    return undefined;
  },
  // 歩こうとした強さを覚える（動けなくなった時に抜け出す。BH8）。速さはそのまま返す
  playerVelocity(rt, vx, vz) { const F = rt.flags, q = F.pv || (F.pv = { x: 0, z: 0 }); F.want = Math.hypot(vx, vz); q.x = vx; q.z = vz; return q; },
  // 作り物の遠景の軍勢・奥の乱戦を出さない（kaito 11/3 AA・AF・AQ6）
  noDistantBattle: true, noFrontFill: true,
  // 豊臣の総大将 秀頼は大坂城、徳川の家康・秀忠は河内路。この場の総大将の討ち取りで勝ち負けを決めない
  taisho: { a: null, b: null },
  minutes: 7,
  world: {
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 1615506,
    time: 'morning',
    mist: true,
    // 濃い霧（後続が遅れた原因）：見通しは五十歩ほど。④の前に晴れる（update で fogFar・mistFar を戻す）
    fogFar: 20, mistFar: 40,
    groundHalf: 300,
    // 忠輝の本陣（東178）と大坂への退路（西240）を歩ける範囲に収め、端で旗本の列が潰れないようにする。
    moveLim: 260,
    mountainScale: 0.6,
    // 通し確認で白い丸丘に見えた山肌へ、既存の林床と土・下草の斑を使う。
    slopeForest: 0.65, patchyGround: true, stableSlopeGrain: true,
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
      //   11/10 関所の写真：霧の中で白っぽいのっぺりした丘に見えた。明るく足すのをやめ、暗い土と下草の緑に寄せる
      if (h > 6 && x > -50 && x < 80) { const k = Math.min(1, (h - 6) / 14); c.setRGB(c.r * (1 - 0.38 * k) + 0.07 * k, c.g * (1 - 0.34 * k) + 0.07 * k, c.b * (1 - 0.42 * k) + 0.025 * k); }
    },
    // 小松山の左右の裾（道から離れた所）には木を残す
    //   11/19 07:55 UTC クラウド kaito2（持ち主）⑥：120秒の写真で本人が斜面の南の縁（48,-28）で斬り合い、後ろの目と本人の間に杉の幹が三本立って画の半分を塞いだ。
    //   斜面の斬り合いは道から二十歩ほど横へ広がる→斜面の左右の林の縁を二十二歩→三十歩へ下げる（木の本数は変えない）
    clear: (x, z) => clearHondaLine(x, z) || kofunDist(x, z) > 0 && kofunDist(x, z) < 9 || HOUSES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 7) || Math.hypot(x - HACHIMAN.x, z - HACHIMAN.z - 1) < 9 || distToPolyline(x, z, ROUTE) < 9 || (Math.abs(z) < 40 && x > -160 && x < 130 && !(x > -40 && x < 70 && Math.abs(z) > 30)),
    // 追加の木立も進路・川岸・持ち場を空ける。誉田の林が空地へ入り、手前の葉で列を隠していた。
    clearGroves: true,
    trees: 420,
    // 11/15 K268（mini司令塔「兵がまだ黒い塊で具足の札や色が見えない」）：天王寺（同じ大坂の陣・kaito 11/9「兵の色が暗すぎて黒い」）と同じ強さの面の補光
    unitCloudFill: 0.75,
    tufts: 2400,
    treeDensity: (x, z) => { const kd = kofunDist(x, z); if (kd > 0 && kd < 9) return 0; if (kd <= 0) return 1.4; if (distToPolyline(x, z, ROUTE) < 12) return 0; if (x > -40 && x < 70 && Math.abs(z) > 30) return 1.1; return Math.abs(z) > 50 ? 1.1 : 0.15; },
    groves: [{ x: 90, z: -50, r: 18, n: 22, kind: 'sugi' }, { x: 80, z: 54, r: 18, n: 22, kind: 'sugi' }, { x: -110, z: 50, r: 14, n: 16 },
      // 本数は増やさず、左右の林を斜面まで寄せる。中央の登り道と頂の旗は空ける。
      { x: 16, z: -42, r: 10, n: 18 }, { x: 8, z: 42, r: 10, n: 18 }, { x: 44, z: -42, r: 8, n: 10 }, { x: -24, z: 42, r: 8, n: 10 }, { x: -6, z: -60, r: 16, n: 18 }, { x: 0, z: 62, r: 16, n: 18 }],
    fleeOut: (x, z, team) => (team === 1 ? x < -220 : x > 240),
  },

  // 戦の途中の保存（battle_checkpoint.js・K363）：段の流れ（b_depth.js）の番号を段とし、飛ばした段の終わりの出来事（又兵衛の最期・伊達の着陣・薄田の最期）を音もなく起こして飛ぶ
  checkpointStep(rt) { const D = rt.flags.dp; return D && D.on ? D.i : -1; },
  resumeSteps: [1, 2, 3, 4, 5, 6].map((k) => [k, function (rt) {
    if (!rt.flags.begun) this.begin(rt);
    const D = rt.flags.dp;
    if (!D?.on) return;
    for (let j = D.i; j < k; j++) D.steps[j]?.resumeEnd?.(rt, D.mem, true);
    depthJump(rt, k);
    { const gi = [0, 1, 2, 2, 3, 3, 4][k]; rt.flags.goalI = gi; rt.obj('main', GOALS[gi], 'main'); }   // 右上の一行も今の段へ
  }]),

  *setup(rt) {   // K626：段に分けた（間の yield で一コマ返す）
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags;
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    { const T = rt._tpl || (rt._tpl = {});   // 11/20 見回り④湧き出し：布陣の表の備（fujin_place）が使う装束の手本を先に置く（装束が覚えられる14秒まで備が立たず、本人の近くで急に現れた）
      T.E = T.E || { o: { team: 1, faction: 'toyotomi' }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }] };
      T.A = T.A || { o: { team: 0, faction: 'tokugawa' }, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 2 }] }; }
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    flags(rt);
    // ---- 東軍：水野勝成の先手（勝成は自ら前で戦った）・自分の手勢・本多忠政の隊 ----
    // 勝成は先手と共に戦う。共通の大将護衛で狙いを外し、列の後ろに留めない。
    F.mizuno = allyGroup(rt, { faction: 'tokugawa', name: '水野勝成の先手', fixed: true, anchor: { x: START.x - 14, z: START.z - 4 }, facing: -Math.PI / 2, width: 12, aggro: 12, speed: 4.2, noRout: true, formation: 'yari', dmgMult: 0.8 },
      dress([{ type: 'busho', n: 1, o: { name: '水野勝成', invuln: true, horse: true, keep: true } }, uS(8), uA(22), uG(8), uB(2)], MIZU));
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
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    if (tdt) tdt._crouch = true;
    yield;   // K626：重い段をさらに割る（描く支度はここで一コマ返す）
    F.tadateru.noFrontline = true;
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x - 4, z: START.z + 6 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(n, 12) }]);
    // 名のある将は馬上（BH2）。乗り手の足の速さを覚え、馬を失っても乗り直させる
    F.riders = [];
    for (const g of [F.mizuno, F.honda, F.tadaaki, F.matsukura]) for (const u of g.units) if (u.alive && u.name && u.mounted) F.riders.push({ u, speed: u.speed, run: u.run, g });
    // 始まりの札の後ろにも芦毛の白い馬を写さない（札の間は update が回らない）
    recoat(rt);
    // 使番の騎馬は setup の後に加わる（芦毛が札の後ろに白く写った）。始まりの札の間にも塗り直す
    for (const ms of [0, 400, 1500]) rt.defer(ms, () => { if (rt.army && !rt.over) recoat(rt); });
    // 動けなくなった時に抜け出す（BH8）：歩こうとした向きを覚える
    F.want = 0; F.stillT = 0; F.goodPos = [];
    // 目標に名を挙げた敵将は、右上の目標・頭上の名で伏せない（「見えぬ敵の陣を物見する」に替えない。十1）
    for (const n of FOES) revealName(rt, n);
    rt.setPhase('brief');
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    rt.obj('main', GOALS[0], 'main');
    goalBoard(rt);
    // 11/19 クラウド kaito2（持ち主）：写真の悪い所①＝誉田の野（守る段・広さ十六歩）のピンが、着いた後も斬り合いの真上で兵に重なる
    //   （共通は六歩まで寄らないと消えない）。誉田の野の内へ入ればピンを消し、離れれば出す（字や印は足さない）
    { const mk0 = rt.marker; rt.marker = function (id, pos, label, o = {}) { return mk0.call(this, id, pos, label, id === 'dp' && label === '誉田の野' && o.guideRadius == null ? { ...o, guideRadius: 16 } : o); }; }
    // 三万四千の味方の中で、主人公が足軽数人に囲まれて数十秒で討たれて戦が終わらない（kaito 十二3）：
    //   命が三割五分を切ったら、受ける傷を半分にする（その間に手勢と家臣が囲んで守る。keepUp）
    const P = rt.player, td = P.takeDamage;
    P.takeDamage = function (a, src) { return td.call(this, this.u.hp < this.u.maxHp * 0.35 ? a * 0.5 : a, src); };
    rt.say('水野勝成', '松倉と奥田の先手が小松山で崩れかけておる。霧の中じゃ、すぐ助けに出る', 4.5);
    yield;   // K626：読み込みの一続きの止まりを割る（描く支度はここで一コマ返す・K112 の段分け）
    rt.after(5, () => rt.say(nm(rt), '山の上は後藤又兵衛。ほかの隊は霧でまだ見えませぬ', 3.6));
    // 始めから味方の組が麓へ歩き出す（本人だけが丘に着いて一人に見えない）
    rt.after(2, () => {
      [F.mizuno, F.mine, F.honda, F.tadaaki].forEach((g, i) => { if (g && g.count) { g.calm = false; g.order = 'attack'; g.seekRange = 45; g.anchor = { x: SLOPE.x + 14 + i * 4, z: SLOPE.z + (i - 1) * 10 }; } });
    });
    rt.after(9, () => rt.say('水野勝成', '霧が晴れて大坂の後詰が着く前に、小松山を取る。かかれ！', 4));
    // K355（11/17 iMac n-look-face）：センゴク天正記11巻＝若い又兵衛は播磨から付いて来た者の一人（読んだ本の人の厚み。台詞は自分の言葉）
    rt.after(19, () => { if (!rt.over) rt.say('足軽', '又兵衛は播磨の出じゃ。若い頃から槍一本で名を上げた男よ。侮るな', 3.8); });
    // 11/21 クラウド kaito2（持ち主・K494 名場面）：前夜の陣で家康に「先駆けするな」と言い含められた勝成（五十二歳）が、自ら槍を取って小松山へ出た（通説・B）。前夜の言葉の受け
    rt.after(26, () => { if (!rt.over && !F.ending) rt.say('水野勝成', '大御所様は先駆けするなと仰せじゃった。……槍を持て。わしも出る！', 3.8); });
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
      if (o) {
        rt.army.kill(o, null);
        rt.say('松倉の足軽', '奥田殿が討たれた！　後藤の槍が下りて来る！', 3.4);
      }
    });
    const look = (list) => dress(list, TOYO);
    // fixedSpawn：段の敵は書いた所（頂・道明寺の野・誉田）から出る。見えない所を探して出すと、頂の又兵衛の組が石川の向こうに湧き、
    //   「頂で討て」の戦が川の中で起きた（11/7 描いて遊んだ写真）
    depthStart(rt, { fixedSpawn: true, faction: 'toyotomi', flag: 'toyotomi', armor: TOYO.armor,
      // 次の段へ並べ直す下知でも、退却と待ち伏せによる片倉隊の後退を取り消さない。
      // 誉田に着いた増援も守備を引き継ぐ。元の七隊が減った後に、新手が目前に
      // 三人以上いても「味方の列が来ない」と待ち続けない。本陣の旗本は動かさない。
      friends: () => [F.mizuno, F.mine, F.honda, F.tadaaki, F.matsukura, F.date, F.katakura,
        ...rt.army.groups.filter((g) => F.dp?.i >= 5 && g.team === rt.player.u.team &&
          (g.name === '新手の足軽' || g.name === '神保相茂の手' || g.name === '伊達の騎馬鉄砲'))].filter((g) =>
        g && g.count && !g.routed && g.order !== 'retreat' && g.order !== 'flee' &&
        !(g === F.katakura && rt.t < (F.pushedUntil || 0))),
      look, scale: 1.6, dmg: 0.62, botSeek: 45, mass: 0, backing: false,
      // 11/18 クラウド（持ち主・見回り五度「無傷で二十〜三十八人を討てる＝打ち返しが弱い」）：段の敵の攻めを 0.5 から全戦の既定 0.62 へ戻す。又兵衛の旗本 0.6 はそのまま
      // ①②は小松山の上で戦う：遊ぶ頭が逃げる後藤勢を追って西の斜面を石川まで下りない（味方から離れて一人で討たれた。11/7）
      botSteer: (b, inp) => { const D = b.flags.dp, u = b.player.u; if (D && D.i <= 1 && u.pos.x < TOP.x - 16) { b.player.yaw = Math.atan2(TOP.x + 6 - u.pos.x, TOP.z - u.pos.z); inp.k.add('KeyW'); } } }, [
      // ① 小松山の東の斜面（撃ち下ろす鉄砲組と、駆け下りる槍）
      DP.fight({ at: SLOPE, title: '小松山', sub: '斜面に後藤勢の鉄砲組が並ぶ', obj: GOALS[0], max: LIMIT[0], noRefill: true,
        say: [['足軽', '山の上から撃ち下ろしてくる！　身を低うせよ']],
        // 11/18 cloud-31：一つの組に槍・侍・鉄砲を混ぜると、前に立つ味方の槍に射線を塞がれ（待ちの95%）、段1の六十秒で発砲3だった。
        //   鉄砲を斜面の前に並べ、槍と侍はその後ろ（上手）に置く。数は同じ
        foes: () => [keep('後藤勢の鉄砲組', SLOPE, [uG(9)], { dx: -12 }), keep('後藤勢の鉄砲組の備え', SLOPE, [uS(3), uA(8)], { dx: -22, seek: 16 })],
        later: [{ get t() { const g = rt.army.groups.find((x) => x.team === 1 && x.name === '後藤勢の鉄砲組'); return g && (g.routed || g.count <= 6) ? 16 : 30; },   // 11/18 05:55 持ち主：鉄砲組が三十三秒ほどで崩れ、槍の来る四十四秒まで印が消えて本人が麓へ戻った（act bot の段1 討ち取り0・敵0人の十秒）→崩れたらすぐ槍が駆け下りる
          say: ['後藤の侍', '押し返せ！　山を下りて槍を入れよ'], foes: () => [keep('後藤勢の槍組', SLOPE, [uS(3), uA(10)], { dx: -12, dz: 10, dmg: 0.75, hunt: true, noRout: 18 })] }],   // 11/18 09:05 持ち主：槍組が出て十秒ほどで味方の大勢に崩され、段1 の本人の討ち取り0（act bot 3回中2回）→十八秒は崩れずに本人と斬り合う   // 11/18 クラウド持ち主：駆け下りる槍は本人を狙う（act bot 七分で受けた傷0＝味方の大勢が先に組み合い、刃が本人へ届かなかった）
        reward: '小松山の斜面を破った' }),
      // ② 頂の後藤又兵衛（孤立しても侍衆が固く守る。必ず討たれる）
      DP.fight({ at: TOP, title: '後藤又兵衛', sub: '後続は霧で遅れ、小松山の頂は孤立している', obj: GOALS[1], max: 200, limit: 200, noRefill: true,   // 11/18 持ち主：上限200秒（又兵衛の討死の後も、本人が頂の三十二歩の外で残兵を追うと 247・305秒まで延びた）
        say: [['後藤又兵衛', '薄田も真田も遅れたか。ならば我が手で、この山を墓所とする！'], ['足軽', '黒の甲冑、又兵衛じゃ！　侍衆が固めておる！']],
        foes: () => [keep('後藤又兵衛の旗本', TOP, [{ type: 'busho', n: 1, o: { name: '後藤又兵衛', horse: true, hat: 'kabuto' } }, uS(10), uA(8), uG(5)], { dx: -6, morale: 100, noRout: 120, dmg: 0.6 })],   // 0.8 では十秒で命が四割まで減った（11/7 の遊び。十二3）
        later: [
          // 又兵衛は頂で待たず、隊を率いて東の斜面へ駆け下りる（何度も押し返した）
          { t: 14, if: () => !F.matabei, say: ['後藤又兵衛', '下りて突き崩す！　我に続け！'], foes: () => { matabeiCharge(rt); return []; } },
          { t: 30, if: () => !F.matabei, say: ['後藤の侍', '殿をお守りせよ！　一歩も退くな！'], foes: () => [keep('後藤勢の新手', TOP, [uS(3), uA(9), uG(3)], { dx: -10, dz: 10, dmg: 0.6 })] },   // 頂の西の縁から（西の斜面の下に出すと、追った本人が石川の岸で一人になった）
          { t: 40, say: ['水野勝成', '伊達の鉄砲が着いた。撃ち込め！'], foes: () => { datearrive(rt); return []; } },
          { t: 52, foes: () => { matabeiCharge(rt); return []; } },
          // 史実：又兵衛は伊達の鉄砲に撃たれて果てた。本人が討てなくても、時が来れば物語は進む（二5）
          { t: 78, foes: () => { matabeiShot(rt); return []; } },
        ],
        // 四十秒より早く頂を破っても、誉田で並ぶ伊達勢の到着を飛ばさない。
        onEnd: (rt2) => { matabeiDown(rt2); datearrive(rt2); } }),
      DP.rest({ dur: 6, heal: 0.6, say: [['水野勝成', '又兵衛は討った。息を整えよ。石川の向こうに薄田の旗じゃ']] }),
      // ③ 石川を渡り、道明寺の野で薄田兼相を討つ（史実で討死）
      DP.fight({ at: NOGAWA, title: '薄田兼相', sub: '誉田八幡から出た薄田の手が、石川の西の道明寺に着く', obj: GOALS[2], max: LIMIT[3], limit: 88, noRefill: true,   // 11/19 07:12 UTC 持ち主：本人が③の四十五秒で薄田へ着くようになり（新手を石川の西へ）一戦が 428〜445秒→上限 100→88秒
        // 05:15 120→100秒（一戦が450〜463秒と七分を越えた・③が126秒）。 11/18 持ち主：上限150秒（今日の act bot で204秒・七分の上限まで残兵待ちが続いた）→04:15 120秒（一戦が451・498秒と七分を越えた。③が156秒の回あり）
        say: [['足軽', '薄田隼人の旗じゃ！　川の向こうから来るぞ！']],
        foes: () => [keep('薄田兼相の手', NOGAWA, [{ type: 'busho', n: 1, o: { name: '薄田兼相', horse: true, hat: 'kabuto_g' } }, uS(6), uA(12), uG(4)], { dx: -26, dz: -6, noRout: Infinity })],
        // 11/17 K355 クラウド k365-cloud-42（『大坂御陣覚書』ほかの伝え：冬の陣の博労淵の砦は、守将の薄田が留守の間に落ち、「橙武者」と笑われた）
        later: [{ t: 12, say: ['水野の侍', '冬の陣で砦を空けて落とされ、橙武者と笑われた薄田よ。今日は死ぬ気で来るぞ'], foes: () => [] },
          { t: 20, if: (rt2) => rt2.army.units.some((u) => u.name === '薄田兼相' && u.alive), say: ['薄田兼相', '冬の恥は、この野で雪ぐ。薄田隼人、一歩も退かぬ！'], foes: () => [] },
          { t: 35, say: ['足軽', '山川賢信と明石全登の手じゃ！　霧の中から！'], foes: () => [keep('山川賢信・明石全登の手', NOGAWA, [{ type: 'busho', n: 1, o: { name: '明石全登', invuln: true, horse: true, hat: 'kabuto_m' } }, { type: 'busho', n: 1, o: { name: '山川賢信' } }, uS(1), uA(10), uG(3)], { dx: -22, dz: 12 })] },   // 11/18 15:25 持ち主：dx-34 では本人の六十七歩先に出て着くまで二十秒余り、③が毎回上限百秒で締まり十三人が残った（描かずの通し）。霧の縁の四十八歩へ
          // 11/18 08:55 クラウド kaito2（持ち主・定時）：act bot で薄田が本人の三十歩先に立ったまま上限まで生き、onEnd で討死（本人の討ち取り0・名0）。
          //   史実の兼相は名乗って徳川の中へ斬り込んだ。名乗りの後、本人が六十歩内なら手勢ごと本人へ寄せる（数と強さは変えない）。
          { t: 24, if: (rt2) => rt2.army.units.some((u) => u.name === '薄田兼相' && u.alive), foes: () => {
            const v = rt.army.units.find((u) => u.name === '薄田兼相' && u.alive), P = rt.player.u;
            if (v?.group && !v.group.routed && P?.alive && Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z) < 150) {   // 20:20 持ち主：act bot で本人が七十〜百十歩先の回も兼相は上限まで立った→百五十歩   // 16:58 持ち主：本人が頂から降りる途中（七十五歩）で六十歩に入らず、兼相が三十六秒あまり野に留まった→百歩
              v.group.focus = P; v.group.order = 'attack'; v.group.focusMeFirst = true; v.group.focusMeRange = 40;   // 11/18 16:55 持ち主：味方と斬り結んだまま二十歩先に百秒立ち、onEnd で討死（本人の名0・2回続けて）→味方を振り切って本人へ
              if (rt.flags._hunter && rt.flags._hunter !== v.group) { rt.flags._hunter.focus = null; rt.flags._hunter = null; }
            }
            return []; } },
          // 11/18 クラウド kaito2（持ち主）：act bot 8回とも薄田が上限百五十秒まで生き残り、③は毎回百五十秒で締まった。
          //   史実の兼相は大勢に囲まれ奮戦の末に討たれた。七十五秒で手負いにし、近い味方の組を二つまで兼相へ向ける（本人が先に討てば手柄）。
          { t: 60, if: (rt2) => rt2.army.units.some((u) => u.name === '薄田兼相' && u.alive), say: ['水野の侍', '薄田は手負いぞ！　囲んで討ち取れ！'], foes: () => {
            const v = rt.army.units.find((u) => u.name === '薄田兼相' && u.alive);
            if (v) {
              v.hp = Math.min(v.hp, Math.round(v.maxHp * 0.4)); v.lastStand = true;   // 深手でも後ろへ下がらない（army_think）
              // 11/18 04:55 クラウド kaito2（持ち主）：act bot は名のある将を本人が一度も討てなかった（薄田は本人の六歩先で味方に討たれる）。
              //   本人が三十五歩内なら、手負いの兼相は手勢ごと本人へ斬り込む（死ぬ気の突撃）。味方は向けず、本人が受けて討つ場を作る。
              const P = rt.player.u;
              if (P?.alive && v.group && !v.group.routed && Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z) < 90) {
                v.group.focus = P; v.group.order = 'attack'; v.group.focusMeFirst = true; v.group.focusMeRange = 40;
                if (rt.flags._hunter && rt.flags._hunter !== v.group) { rt.flags._hunter.focus = null; rt.flags._hunter = null; }
                return [];
              }
              const c = { x: 0, y: 0, z: 0 };
              const near = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.routed && g.count && g.order !== 'retreat' && g.order !== 'flee')
                .map((g) => { g.center(c); return [g, Math.hypot(c.x - v.pos.x, c.z - v.pos.z)]; }).filter((e) => e[1] < 45).sort((a, b) => a[1] - b[1]).slice(0, 2);
              for (const [g] of near) { g.calm = false; g.order = 'attack'; g.focus = v; }
            }
            return []; } },
          // 11/18 17:05 持ち主：本人を的にしても兼相の手は持ち場（anchor）に留まり、二十二歩先で百秒立って onEnd で討死（act bot 3回続けて名0）。
          //   的が本人の間は、持ち場ごと本人の方へ寄せる（十歩ごと・味方の数と強さは変えない）
          ...[32, 42, 52, 66, 76].map((t) => ({ t, foes: () => {
            const v = rt.army.units.find((u) => u.name === '薄田兼相' && u.alive), P = rt.player.u, g = v?.group;
            if (g && g.anchor && !g.routed && g.focus === P && P?.alive) {
              const dx = P.pos.x - g.anchor.x, dz = P.pos.z - g.anchor.z, d = Math.hypot(dx, dz);
              if (d > 6 && d < 150) { const k = Math.min(1, (d > 60 ? 20 : 12) / d); g.anchor = { x: g.anchor.x + dx * k, z: g.anchor.z + dz * k }; }
            }
            return []; } })),
          // 11/18 19:50 UTC クラウド kaito2（持ち主）：act bot で兼相がまだ本人の二十四歩先に立ったまま上限に掛かり、onEnd で討死（筋書きの死）。
          //   上限の十四秒前、生きていて本人が六十歩内なら、深手の兼相は持ち場ごと本人の前へ出て最後の斬り込み（一太刀で倒れる深手）
          { t: 86, if: (rt2) => rt2.army.units.some((u) => u.name === '薄田兼相' && u.alive), say: ['薄田兼相', 'この首、取れるものなら取ってみよ！'], foes: () => {
            const v = rt.army.units.find((u) => u.name === '薄田兼相' && u.alive), P = rt.player.u, g = v?.group;
            if (v && g && !g.routed && P?.alive && Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z) < 90) {
              v.hp = Math.min(v.hp, Math.max(1, Math.round(v.maxHp * 0.12))); v.lastStand = true;
              g.focus = P; g.order = 'attack'; g.focusMeFirst = true; g.focusMeRange = 60; g.anchor = { x: P.pos.x, z: P.pos.z };
              if (rt.flags._hunter && rt.flags._hunter !== g) { rt.flags._hunter.focus = null; rt.flags._hunter = null; }
            }
            return []; } },
          // 11/18 21:20 UTC クラウド kaito2（持ち主）：act bot で兼相が本人の十七〜二十二歩まで来たまま上限に掛かり onEnd で討死（本人の名0）。
          //   兼相が生きていて本人の六十歩内なら、本人へ最後の斬り込みを続ける。
          { t: 96, if: (rt2) => rt2.army.units.some((u) => u.name === '薄田兼相' && u.alive), foes: () => {
            const v = rt.army.units.find((u) => u.name === '薄田兼相' && u.alive), P = rt.player.u, C = rt.flags.dp?.cur;
            if (v && C?.s && P?.alive && Math.hypot(P.pos.x - v.pos.x, P.pos.z - v.pos.z) < 60) {
              v.lastStand = true; v.hp = Math.min(v.hp, Math.max(1, Math.round(v.maxHp * 0.12)));
              if (v.group) { v.group.focus = P; v.group.order = 'attack'; v.group.anchor = { x: P.pos.x, z: P.pos.z }; }
            }
            return []; } },
          // 史実：薄田が討死すると、その手は崩れて誉田へ退いた。将の倒れた後も noRout で残兵が野に立ち尽くさない
          { t: 80, foes: () => { const gs = rt.flags.dp?.cur?.groups || []; if (!rt.army.units.some((u) => u.name === '薄田兼相' && u.alive)) { for (const g of gs) if (g.count) { g.noRout = false; g.morale = Math.min(g.morale, 20); } rt.say('足軽', '薄田隼人、討死！　薄田の手が崩れるぞ', 3); } return []; } }],
        // 上限で段が締まった時も、薄田は史実どおり道明寺の野で討死する（生きたまま次の段へ持ち越さない）
        // 21:30 持ち主：act bot で本人が兼相に傷を負わせ九〜二十二歩で斬り合う間に上限が来て、筋書きの死が「他」になった→本人が傷を負わせ二十五歩内なら本人の手柄
        onEnd: (rt2) => { const P = rt2.player.u; for (const u of rt2.army.units) if (u.alive && u.name === '薄田兼相') rt2.army.kill(u, (P?.alive && (u.heroDmg || 0) > 0 && Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) < 25) ? P : undefined); },
        reward: '道明寺の野で薄田兼相の手を破った' }),
      DP.rest({ dur: 6, heal: 0.3, fn: () => { rt.world.setTime?.('day'); this.dateToHonda(rt); },
        banner: ['真田信繁・毛利勝永が着く', '霧が晴れ、誉田の野に赤い旗が並ぶ'],
        say: [['伊達政宗', '真田が来た。誉田で鉄砲を並べて迎える。片倉、前へ！'], ['水野勝成', '遅れて着いたが、数は一万を越える。気を抜くな']] }),
      // ④ 誉田の鉄砲戦（伊達の片倉隊と並ぶ。真田の待ち伏せで伊達勢は一度押し戻される）
      DP.hold({ at: HONDA, dur: 60, r: 16, title: '誉田の戦い', sub: '伊達勢と真田・毛利が鉄砲を撃ち合う', label: '誉田の野', obj: GOALS[3], noRefill: true, limit: 85,   // 05:15 撃ち合い70→60秒・上限95→85秒（一戦を七分の内へ）。 11/18 持ち主：撃ち合いの70秒の後、討てない信繁・勝永の手の残りを待って197秒まで延びた→04:30 毎回上限110で締まり一戦が七分を越えたので95秒
        say: [['片倉重綱', '放て！　撃ち続けよ。弾が尽きるまで野を渡らせるな！']],
        waves: [
          { t: 4, say: ['足軽', '毛利の手じゃ！　鉄砲を揃えて来る！'], foes: () => [keep('毛利勝永の手', HONDA, [{ type: 'busho', n: 1, o: { name: '毛利勝永', invuln: true, horse: true, hat: 'kabuto_m' } }, uS(4), uA(10), uG(8)], { dx: -40, dz: 14, noRout: 30 })] },
          // 真田は誉田陵の堀と土手に折り敷いて伏せ、片倉の寄せを引きつけて一斉に撃つ。伊達勢は一度押し戻される
          { t: 22, say: ['真田信繁', '折り敷け。引きつけて撃て。まだじゃ……'], foes: () => { rt.after(1.5, () => this.datePushed(rt)); return [keep('真田信繁の手', HONDA, [{ type: 'busho', n: 1, o: { name: '真田信繁', invuln: true, horse: true, ...SANADA } }, ...dress([uS(5), uA(10), uG(8)], SANADA)], { dx: -18, dz: 34, noRout: 30, dmg: 0.6 })]; } },
          // 11/18 22:50 UTC クラウド kaito2（持ち主）：act bot で④の討ち取りが0（真田・毛利は野の向こうから撃つだけで本人の槍が届かない）。
          //   史実：真田は一斉射撃で伊達勢を押し戻した後、槍を入れて追い崩した。一斉射撃の後、真田の槍（十人）が本人へ突き掛かる
          { t: 34, say: ['真田信繁', '今ぞ、槍を入れよ！'], foes: () => [keep('真田の槍', HONDA, dress([uS(2), uA(8)], SANADA), { dx: -18, dz: 18, dmg: 0.6, hunt: true })] },
        ],
        reward: '誉田で真田・毛利の寄せを止めた' }),
      // 11/21 08:00 UTC クラウド kaito2（持ち主・K582 関所）：携帯の act bot が 361秒（⑤）で討死（侍の傷120）。④の真田の槍で手負いのまま、
      //   息を継ぐ間なく⑤の殿（十九人＋槍十人）に入っていた。史実も誉田の撃ち合いは昼過ぎに膠着し、両軍が睨み合った後に豊臣方が退いた。
      //   ④と⑤の間に四秒の息継ぎ（手当て三割・敵の数と強さは変えない）
      DP.rest({ dur: 4, heal: 0.3 }),
      // ⑤ しんがり（信繁・勝永は討てず、大坂へ退く）
      // 11/19 03:20 UTC クラウド kaito2（持ち主）：act bot 5回に4回、終わりの札に「真田の殿を押し返せ〔失〕」。POSLOG で本人は誉田の野の七十歩手前（-69,-28）で⑤に入り、
      //   持ち場を本人へ寄せる波（t1）は列が揃って時計が回ってから＝五十秒後にしか来ず、持ち場の内の刻（inT）が五秒で〔失〕。段の始めに持ち場を決める
      DP.hold({ at: (rt) => { const P = rt.player?.u; if (!P?.alive) return HONDA; const dx = HONDA.x - P.pos.x, dz = HONDA.z - P.pos.z, d = Math.hypot(dx, dz); return d > 40 ? { x: P.pos.x + dx / d * 20, z: P.pos.z + dz / d * 20 } : HONDA; }, dur: 35, r: 16, title: '大坂へ退く', sub: '信繁の殿が、追う者を斬り払う', label: '誉田の野', obj: GOALS[4], noRefill: true, limit: 62,   // 11/18 05:50 夜50-46：80→62（act bot で毎回八十秒まで延びた・③④の05:15 の直しと合わせ 377〜405秒）。 11/18 持ち主：殿の35秒の後、列の揃い待ちで209秒まで延びた（act bot）
        say: [['足軽', '八尾・若江で木村重成殿が討たれたと！　豊臣方が退き始めた！']],
        waves: [
          // 退く豊臣方が誉田の村の民家に火を放つ（史実。夕暮れの煙の中の殿）
          { t: 1, foes: () => {
            this.burnVillage(rt);
            // 11/18 18:30 UTC クラウド kaito2（持ち主）：act bot で⑤が〔失〕3回に2回＝本人が誉田の野の四十六歩の外（道明寺の野の側）で④を終え、
            //   殿は誉田の西四十歩に出て本人と出会わず、段が上限で締まった。殿は追う者を斬り払いに来た（史実）。本人が遠ければ、持ち場（と行き先のピン）を本人から誉田へ二十歩の所へ移す
            const C = rt.flags.dp?.cur, P = rt.player?.u;
            if (C && C.at && P?.alive) {
              const dx = C.at.x - P.pos.x, dz = C.at.z - P.pos.z, d = Math.hypot(dx, dz);
              if (d > 40) { C.at = { x: P.pos.x + dx / d * 20, z: P.pos.z + dz / d * 20 }; C.goal = C.at; rt.marker('dp', C.at, '誉田の野', { h: 3 }); }
            }
            return []; } },
          { t: 4, say: ['真田信繁', '関東勢百万と候え、男は一人もなし。引け、秀頼様の城を守る'], foes: () => [keep('真田の殿', rearAt(rt), dress([uS(4), uA(10), uG(5)], SANADA), { dx: rearAt(rt) === HONDA ? -40 : -24, dz: 0, dmg: 0.6, hunt: true })] },   // 殿は追う本人を斬り払いに来る（史実の殿の逆襲）
          { t: 12, say: ['足軽', '村に火を掛けて退いて行く！　煙で前が見えぬ！'], foes: () => [] },
          // 11/18 21:20 UTC クラウド kaito2（持ち主）：act bot 4回で⑤の討ち取りが 0・0・1・1（殿の十九人は誉田の西四十歩から来て、半ばは鉄砲で撃つだけ）。
          //   殿の槍の二の手（十人）が煙の中から本人の寄った誉田の西二十歩へ斬り返して来る（信繁の殿が追う者を幾度も斬り払った）
          { t: 14, foes: () => [keep('真田の殿の槍', rearAt(rt), dress([uS(2), uA(8)], SANADA), { dx: rearAt(rt) === HONDA ? -20 : -14, dz: 6, dmg: 0.6, hunt: true })] },
        ],
        reward: '豊臣勢を大坂へ退かせた' }),
    ].map(checkedStep), (rt2) => this.win(rt2));
  },

  // ④の前：伊達勢（片倉の鉄砲が先・政宗はその後ろ）が誉田の野へ出て、西へ向いて鉄砲を並べる
  dateToHonda(rt) {
    const F = rt.flags;
    if (F.ending || rt.over) return;
    const put = (g, x, z, o = {}) => { if (!g || !g.count || g.routed || g.order === 'retreat' || g.order === 'flee') return; g.calm = false; g.order = o.order || 'attack'; g.seekRange = o.seek || 40; g.anchor = { x, z }; if (o.line) g.formation = 'line'; };
    put(F.katakura, HONDA.x + 6, HONDA.z - 8, { line: true });
    put(F.date, HONDA.x + 10, HONDA.z + 8, { line: true });
    put(F.masamune, HONDA.x + 34, HONDA.z - 4, { order: 'hold' });
    for (const [x, z] of [[HONDA.x + 12, HONDA.z - 16], [HONDA.x + 38, HONDA.z - 10]]) rt.scene.add(nobori(rt.world, x, z, 'date', 6));
    // 11/18 クラウド kaito2（質を一段：300秒の照らしで、誉田へ向かう本人が野に一人）：本人の五十歩内の味方を二組まで、本人の左右に付けて誉田へ連れて行く（着けば寄せと斬り合う）
    const P = rt.player?.u?.pos, c = { x: 0, y: 0, z: 0 };
    if (P) {
      const skip = new Set([F.katakura, F.date, F.masamune]);
      const near = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !skip.has(g) && !g.routed && g.count >= 4 && !g.fixed && g.order !== 'retreat' && g.order !== 'flee')
        .map((g) => { g.center(c); return [g, Math.hypot(c.x - P.x, c.z - P.z)]; }).filter((e) => e[1] < 50).sort((a, b) => a[1] - b[1]).slice(0, 2);
      near.forEach(([g], i) => { g.calm = false; g.order = 'move'; g.dest = { x: HONDA.x - 6 + i * 12, z: HONDA.z + 10 }; g.anchor = { ...g.dest }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.seekRange = 30; }; });
      // 11/18 18:00 UTC クラウド kaito2（持ち主）：act bot の POSLOG で、③の後も道明寺の野に山川・明石の手と豊臣方の新手（20〜37人）が本人の二十五歩内に残り、
      //   本人は誉田の野（七十五歩先）へ一度も行けず④⑤の討ち取り0〜2・⑤〔失〕。史実の後続（明石・山川・薄田の残兵）は誉田へ退いて真田・毛利と合わさった。
      //   本人の六十歩内に残る豊臣方の組は誉田の西の土手へ退かせ、着けばそこで向き直って戦う（数と強さは変えない）
      const foes = rt.army.groups.filter((g) => g.team === 1 && !g.routed && g.count && g.order !== 'retreat' && g.order !== 'flee' && !/真田|毛利/.test(g.name || ''))
        .map((g) => { g.center(c); return [g, Math.hypot(c.x - P.x, c.z - P.z)]; }).filter((e) => e[1] < 60);
      // 11/19 00:55 UTC クラウド kaito2（持ち主）：⑥の写真と POSLOG で、④の間も本人が石川の河原（-55,-3）で新手十五人と斬り合い、誉田の野へ着くのは④の終わり。
      //   待つ備（depth_reserve の S.E）に入った組は四秒ごとに本人の四十歩先へ置き直されて退く下知が消えていた→誉田へ退かせる組は待つ備の列から外す
      const DR = F._dr;
      foes.forEach(([g], i) => {
        if (DR?.E) { const k = DR.E.indexOf(g); if (k >= 0) { DR.E.splice(k, 1); DR.nE = Math.max(0, (DR.nE || 1) - 1); } }
        g.isReserve = false; g._rsv = false;
        //   退く組が歩いて河原に長く残ると、本人が追って誉田の段を河原で過ごした（POSLOG：新手三十六人が move のまま本人の二十五歩内に六十秒）→駆け足で退く
        const sp0 = g.speed; g.speed = Math.max(g.speed || 0, 3.6);
        const wasAi = g.ai;   // g.ai の隊は共通の頭（ai.js）が attack へ戻し、退く下知が効かなかった（POSLOG で山川・明石の手が attack のまま）
        g.calm = false; g.stay = false; g.noRout = false; g.focus = null; g.focusMeFirst = false; g.ai = false; g.keepMoveOrder = true; g.order = 'move';
        g.dest = { x: HONDA.x - 26 + (i % 3) * 7, z: HONDA.z - 10 + Math.floor(i / 3) * 9 }; g.anchor = { ...g.dest };
        // 11/19 04:20 UTC クラウド kaito2（持ち主）：act bot の POSLOG で④の始めの三十秒、誉田へ駆けて退く組（新手三十五人・move）が本人の二十五歩内を通り抜け、
        //   本人はそれに掛かって石川の西の岸（-50,-30）に留まり、誉田の撃ち合いに入れなかった→退く間は振り向かない（的にならず・打たない）。着くか二十五秒で元へ
        const back = () => { for (const u of g.units) if (u._dmyRun) { u._dmyRun = false; u.noTarget = false; } };
        // 11/19 05:10 UTC クラウド kaito2（持ち主）：act bot 3回に2回、④の始めの十秒で本人の命が百→五十（POSLOG：本人は石川の西 (-60,-20)・二十五歩内は退く山川・明石の手だけ）。
        //   名のある将（山川賢信・明石全登・武将）は的のまま本人と組み合い、本人は命半分で避け続けて④⑤の討ち取り0（誉田へ着かず）→退く間は名のある将も振り向かない（着けば元へ）
        for (const u of g.units) if (u.alive && !u.noTarget) { u._dmyRun = true; u.noTarget = true; u.target = null; u.atk = null; }
        rt.after(25, back);
        g.onArrive = (q) => { q.onArrive = null; q.speed = sp0; q.ai = wasAi; q.keepMoveOrder = false; q.order = 'attack'; q.seekRange = 30; back(); };
      });
    }
  },
  // 真田の待ち伏せの一斉射撃で、片倉の隊が十数歩押し戻され、少しして持ち直す
  datePushed(rt, waiting = null) {
    const F = rt.flags, g = F.katakura;
    const sanada = waiting || F.dp?.cur?.groups.find((q) => q.name === '真田信繁の手');
    if (!sanada) return;
    // 待ち伏せの予約後に終戦した場合、追撃停止を移動の下知で上書きしない。
    // 次の段では元の組を探せないため、再試行へ待機中の組を引き継いで伏せを解く。
    if (F.ending || rt.over || F.dp?.i !== 5) {
      sanada.ambush = false;
      for (const u of sanada.units) u._crouch = false;
      return;
    }
    // 射撃を待つ間に退く下知が出た組を、予約の再試行で攻撃へ戻さない。
    // 伏せた姿勢も解き、大坂へ退く動きを妨げない。
    if (sanada.routed || sanada.order === 'retreat' || sanada.order === 'flee') {
      sanada.ambush = false;
      for (const u of sanada.units) u._crouch = false;
      return;
    }
    const active = (u) => u.alive && !u.fleeing && !u.gone && !u.woundOut &&
      !u.rearWound && !u.downed && !u.noTarget;
    // 鉄砲兵が倒れた後まで射撃待ちを続けると、残った槍兵も伏せたままになる。
    // 迎える伊達勢が尽きた時や退く下知が出た時も、架空の一斉射撃で押し戻さず通常の戦いへ戻す。
    // 馬上では共通の射撃処理が発砲しない。弾切れの筒も待ち伏せの射手に数えない。
    const armed = (u) => active(u) && u.type === 'gun' && !u.sidearm && !u.mounted && (u.gunAmmo ?? 20) > 0;
    if (!sanada.units.some(armed) ||
        !g || !g.count || g.routed || g.order === 'retreat' || g.order === 'flee' || !g.units.some(active)) {
      sanada.ambush = false; sanada.order = 'attack'; sanada.seekRange = 55;
      sanada.anchor = { x: HONDA.x, z: HONDA.z };
      for (const u of sanada.units) u._crouch = false;
      return;
    }
    if (!sanada._dmAmbush) {
      sanada._dmAmbush = true; sanada._dmAmbushAt = rt.t;
      sanada.ambush = true; sanada.order = 'hold'; sanada.seekRange = 0;
      const c = sanada.center(); sanada.anchor = { x: c.x, z: c.z };
      for (const u of sanada.units) if (active(u) && !u.mounted) {
        u._crouch = true; u.target = null; u.moveTo = null;
      }
    }
    // 台詞から一定時間で押し戻さず、生きた鉄砲兵へ伊達勢が寄り、射線が通るまで伏せて待つ。
    const gunner = sanada.units.find((u) => armed(u) && !u.reload && !u.atk && !(u.cd > 0) &&
      g.units.some((v) => active(v) && Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z) <= 42 &&
        rt.army.coverBetween(u.pos, v.pos, u.team) > 0 && !rt.army.shotBlocked(u, v.pos) &&
        !rt.army.allyInLine(u, v, Math.hypot(u.pos.x - v.pos.x, u.pos.z - v.pos.z))));
    if (!gunner) {
      // 堀や丘で射線が通らない時は、伏せたまま待ち続けず槍と共に寄せる。
      if (rt.t - sanada._dmAmbushAt >= 20) {
        sanada.ambush = false; sanada.order = 'attack'; sanada.seekRange = 55;
        sanada.anchor = { x: HONDA.x, z: HONDA.z };
        for (const u of sanada.units) u._crouch = false;
        return;
      }
      rt.after(1, () => this.datePushed(rt, sanada)); return;
    }
    const target = g.units.find((v) => active(v) && Math.hypot(gunner.pos.x - v.pos.x, gunner.pos.z - v.pos.z) <= 42 &&
      rt.army.coverBetween(gunner.pos, v.pos, gunner.team) > 0 && !rt.army.shotBlocked(gunner, v.pos) &&
      !rt.army.allyInLine(gunner, v, Math.hypot(gunner.pos.x - v.pos.x, gunner.pos.z - v.pos.z)));
    if (!target || !storyShot(rt, gunner, target)) {
      rt.after(1, () => this.datePushed(rt, sanada)); return;
    }
    sanada.ambush = false; sanada.order = 'attack'; sanada.seekRange = 55;
    sanada.anchor = { x: HONDA.x, z: HONDA.z };
    for (const u of sanada.units) u._crouch = false;
    rt.say('真田信繁', '今じゃ、放て！', 2);
    g.order = 'move'; g.dest = { x: HONDA.x + 22, z: HONDA.z - 6 }; F.pushedUntil = rt.t + 12;
    rt.say('足軽', '誉田陵の堀から撃って来る！　伊達殿が押し戻される！', 3);
    // 待ち伏せが④の終わりに起きても、⑤の殿を迎える列へ戻す。
    // 終戦・退却の下知が出ていれば、反撃の予約で取り消さない。
    rt.after(12, () => { if (g.count && !g.routed && g.order !== 'retreat' && g.order !== 'flee' && !F.ending && !rt.over && (F.dp?.i === 5 || F.dp?.i === 6)) { g.order = 'attack'; g.seekRange = 40; g.anchor = { x: HONDA.x + 4, z: HONDA.z - 4 }; rt.say('片倉重綱', '退くな！　列を立て直して撃ち返せ！', 3); } });
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
      g.calm = false; g.focus = null; g.onArrive = null;
      if (g.team === 1) {
        g.order = 'retreat'; g.dest = { x: -240, z: 40 }; g.speed = 4.2; g.aggro = 0;
      } else if (g.team === 0) {
        g.order = 'hold'; const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.seekRange = 0;
      }
    }
    rt.player.u.invuln = true;
    // 11/21 クラウド kaito2（持ち主・K494 名場面）：史実では水野勝成が追い討ちを説き、伊達政宗が「兵は疲れ、弾も尽きた」と応じず真田は退き果せた。
    //   前は勝成が「深追いするな」と言っていて逆だった→勝成が説き、政宗が断る
    rt.after(2, () => rt.say('水野勝成', '真田が退くぞ。今こそ追い討ちじゃ！　伊達殿、兵を出されよ', 3.6));
    rt.after(6, () => rt.say('伊達政宗', '兵は朝から戦い通し、弾も尽きた。今日はこれまでじゃ', 4));
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
    // 11/19 06:10 UTC クラウド kaito2（持ち主）：03:29 の取り込みで depthTick が二度呼ばれ（下にもう一つ）、④⑤の守った刻・列で受けた刻が倍速で進み
    //   ⑤の殿（三十五秒）が十七秒で締まっていた（POSLOG：el 17.5 で holdElapsed 35）。下の一つだけにした
    // 11/19 クラウド k365-26（受け持ちの濃さ）：act bot 428秒で味方の討ち取り247・本人7（突き13）、薄田と誉田の段は本人0〜1。兵の数（ほめた物）は変えず、
    //   本人の二十歩内に兵のいる敵の組だけ、味方の刃（strike）に二・五倍固く（離れれば元へ）。本人の太刀（army.damage）はそのまま
    if (!((F.k26NearT || 0) > rt.t)) {
      F.k26NearT = rt.t + 1;
      const P = rt.player.u.pos;
      for (const g of rt.army.groups) {
        if (g.team === rt.player.u.team || !g.units?.length || g.civ) continue;
        let near = false;
        for (const u of g.units) if (u.alive && !u.fleeing && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 35) { near = true; break; }   // 11/19 クラウド kaito2：二十→三十五歩（act bot 味方の討ち取り219・本人15）
        if (near && !g.k26Hard) { g.k26Hard = true; g.k26Def = g.defMult; g.defMult = Math.max(g.defMult || 1, 2.5); }
        else if (!near && g.k26Hard) { g.k26Hard = false; g.defMult = g.k26Def ?? 1; }
      }
    }
    // 11/19 クラウド kaito2（act bot 3回：討ち取り11・9・14、二回は侍と足軽の傷0）：本人へ向いた組（focus が本人）も、本人へ届く前に味方の大勢に討たれていた。
    //   その組の兵のうち本人の十四歩より外の者だけ味方の刃と玉を弾く（真田丸・樫井と同じ形）。名のある将は外す。兵の数（ほめた物）は変えない。本人の一撃は通る
    if ((F._dShT = (F._dShT || 0) - dt) <= 0) {
      F._dShT = 0.5;
      const P = rt.player.u;
      for (const u of rt.army.units) {
        const g = u.group, on = !!(P?.alive && u.alive && !u.gone && !u.fleeing && !u.name && g && g.focus === P && !g.routed && g.order !== 'flee');
        if (on && !u._dSh && u.invuln) continue;
        const want = on && Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 14;
        if (want) { u._dSh = true; u.invuln = true; } else if (u._dSh) { u._dSh = false; u.invuln = false; }
      }
    }
    depthTick(rt, dt);
    // 最後の段で終戦したら、追撃停止の下知を追従処理で攻撃へ戻さない。
    if (F.ending) return;
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
    // 戦側の手勢：攻められたら自分を囲んで寄せる敵に掛かる。離れたら自分の足で追いつく
    // 本人が号令する組は共通の追従に任せ、突撃先や待機の下知を半秒ごとに上書きしない。
    // 退く下知を受けた組は、近くに敵がいても追従や護衛で攻撃へ戻さない。
    const guards = [F.mine].filter((g) => g && g.count && !g.routed && g.order !== 'retreat' && g.order !== 'flee');
    guards.forEach((g, i) => {
      const c = g.center(), d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
      if (threat) { g.calm = false; g.order = 'attack'; g.focus = threat; g.anchor = { x: u.pos.x, z: u.pos.z }; g.seekRange = 12; g.speed = Math.max(sp, 5); }
      else if (d > 10) { g.calm = false; g.order = 'move'; g.dest = { x: u.pos.x + (i % 2 ? 2.5 : -2.5), z: u.pos.z + 3 }; g.speed = sp; g.onArrive = (q) => {
        if (F.ending || rt.over || q.routed || q.order === 'retreat' || q.order === 'flee') return;
        q.order = 'attack'; q.seekRange = 16; q.anchor = { x: u.pos.x, z: u.pos.z };
      }; }
      else { g.focus = null; g.speed = sp; }
    });
    // 水野・本多・伊達の隊：自分より遅れたら、自分の速さで前へ出る（自分だけが先に敵を引き受けない）
    for (const g of [F.mizuno, F.honda, F.tadaaki, F.date, F.katakura]) {
      if (!g || !g.count || g.routed || g.order === 'retreat' || g.order === 'flee' || (g === F.katakura && rt.t < (F.pushedUntil || 0))) continue;
      const c = g.center(), lag = c.x - u.pos.x;
      g.speed = lag > 8 ? sp : 4.2;
      if (lag > 18 && F.begun) {
        g.calm = false; g.order = 'attack'; g.seekRange = 40;
        // 誉田では左右の持ち場へ追いつく。南北三十歩への丸めで後列を中央へ重ねない。
        const place = F.dp?.on && F.dp.i >= 5 && Math.hypot(u.pos.x - HONDA.x, u.pos.z - HONDA.z) < 32
          ? HONDA_LINE.find(([key]) => F[key] === g) : null;
        g.anchor = place ? { x: HONDA.x + place[1], z: HONDA.z + place[2] }
          : { x: u.pos.x + 5, z: Math.max(-30, Math.min(30, (g.anchor ? g.anchor.z : u.pos.z))) };
      }
    }
    // 小松山・道明寺・誉田では、水野・本多・片倉・松倉の先手・忠明隊・神保勢の後列が古い持ち場に残らないようにする。
    // 横陣の後列は索敵が短い。八秒打ち合えなければ今の段の敵へ隊で寄せる。
    // 道明寺に残った兵から敵までは五十数歩あるため、三十二歩では寄せ直せない。
    // 頂の戦いでも松倉勢が敵の手前で止まるため、斜面と頂も寄せ直しの対象にする。
    const advanceAt = F.dp?.on && (F.dp.i === 0 ? SLOPE : F.dp.i === 1 ? TOP :
      F.dp.i === 3 ? NOGAWA : F.dp.i >= 5 ? HONDA : null);
    for (const advance of rt.army.groups) {
      if (advance !== F.mizuno && advance !== F.honda && advance !== F.katakura &&
          advance !== F.matsukura && advance !== F.tadaaki && advance.name !== '神保相茂の手' &&
          !(advance.isPlayerSquad && advance.team === u.team)) continue;
      // K133（11/13 クラウドわ）：討たれた・逃げた的を持ったままの隊は、的の無い隊として寄せ直す（忠明隊が死んだ毛利の兵を的にしたまま誉田で立っていた）
      const fo = advance.focus;
      if (fo && (!fo.alive || fo.gone || fo.fleeing || fo.noTarget || fo.woundOut ||
          fo.rearWound || fo.downed)) advance.focus = null;
      // 11/18 クラウド kaito2（道明寺の持ち主）：誉田で隊に的があるのに、煙で的が見えず一人が的の手前で二十秒立った（act bot 433秒・水野の侍・敵10m）。
      //   的のある隊でも、同じ一人が八秒動かず手が空いていれば、その者に一番近い見える敵を隊の的にし直す
      if (advanceAt && advance.focus && advance.count && !advance.routed && advance.order === 'attack') {
        const st = advance.units.find((v) => v.alive && !v.fleeing && !v.woundOut && !v.rearWound && !v.downed && !v.gone &&
          !v.noTarget && !v.stdHeld && !v.target?.alive && !v.atk && !v.swing && v.moving < 0.25 && v.moveTo &&
          Math.hypot(v.moveTo.x - v.pos.x, v.moveTo.z - v.pos.z) > 1.6 && (v.type === 'samurai' || v.type === 'ashigaru'));
        advance._fxIdle = st && advance._fxIdleUnit === st ? (advance._fxIdle || 0) + 0.5 : 0;
        advance._fxIdleUnit = st;
        if (advance._fxIdle >= 8) {
          const foe = rt.army.nearestEnemy(st, 20, (v) => v !== advance.focus && !v.fleeing && !v.woundOut && !v.rearWound &&
            !v.downed && !v.gone && !v.noTarget && !v.isStruct && Math.abs(v.pos.y - st.pos.y) < 3 &&
            !rt.army.wallBetween(st.pos, advance.team, v.pos));
          if (foe) { advance.focus = foe; st.aiT = 0; }
          advance._fxIdle = 0;
        }
      }
      if (!(advanceAt && advance.count && !advance.routed &&
          advance.order === 'attack' && !advance.focus && !advance.onArrive &&
          !(advance === F.katakura && rt.t < (F.pushedUntil || 0)))) {
        advance._dmIdle = 0; advance._dmIdleUnit = null;
        continue;
      }
      // 鉄砲隊に足軽・侍が残っていなくても、将だけ古い持ち場で止めない。
      // 配下が撃ち合っている間は、後ろで下知する将を停止とみなさない。
      const fighting = advance.units.some((v) => v.alive && !v.fleeing && !v.woundOut &&
        !v.rearWound && !v.downed && !v.gone && !v.noTarget && v.target?.alive);
      const idle = advance.units.find((v) => v.alive && !v.fleeing && !v.woundOut &&
        !v.rearWound && !v.downed && !v.gone && !v.noTarget && !v.stdHeld && !v.target?.alive && !v.atk && !v.swing &&
        v.moving < 0.25 && (v.type === 'samurai' || v.type === 'ashigaru' || v.type === 'busho' && !fighting));
      // K133（11/13 クラウドわ）：携帯は本人の近くの四十体より外の兵を略した動き（army_quality）にする。略された兵は一人ずつ敵を探さず、
      //   隊の的が無いと持ち場に立ったまま（誉田で敵を二十〜四十歩前に二十秒止まった）。略された兵が多い隊は、待たずに近い敵を隊の的にする
      // 本人の突撃は、前列の一人が戦っていても後列を八秒待たせない。
      // 小松山の登りでは高低差だけで的を捨てず、壁の無い斜面を通常の足運びで寄せる。
      const squadAttack = advance.isPlayerSquad && advance.team === u.team;
      if (!fighting || squadAttack) {
        const abs = squadAttack ? idle : advance.units.find((v) => v.alive && v.qualityAbstract && !v.fleeing && !v.woundOut && !v.downed && !v.gone && v.moving < 0.25);
        const foe = abs && rt.army.nearestEnemy(abs, 45, (v) => !v.fleeing && !v.woundOut &&
          !v.rearWound && !v.downed && !v.gone && !v.noTarget && !v.isStruct &&
          Math.hypot(v.pos.x - advanceAt.x, v.pos.z - advanceAt.z) < 60 &&
          (squadAttack || Math.abs(v.pos.y - abs.pos.y) < 3) && !rt.army.wallBetween(abs.pos, advance.team, v.pos));
        if (foe) {
          advance.calm = false; advance.focus = foe; advance._dmIdle = 0; advance._dmIdleUnit = null;
          if (squadAttack) for (const v of advance.units) if (v.alive && !v.fleeing &&
            !v.woundOut && !v.rearWound && !v.downed && !v.gone && !v.noTarget) v.aiT = 0;
          continue;
        }
      }
      advance._dmIdle = idle && advance._dmIdleUnit === idle ? (advance._dmIdle || 0) + 0.5 : 0;
      advance._dmIdleUnit = idle;
      if (advance._dmIdle >= 8) {
        const foe = rt.army.nearestEnemy(idle, 60, (v) => !v.fleeing && !v.woundOut &&
          !v.rearWound && !v.downed && !v.gone && !v.noTarget && !v.isStruct &&
          Math.hypot(v.pos.x - advanceAt.x, v.pos.z - advanceAt.z) < 60 &&
          Math.abs(v.pos.y - idle.pos.y) < 3 && !rt.army.wallBetween(idle.pos, advance.team, v.pos));
        if (foe) { advance.calm = false; advance.focus = foe; advance._dmIdle = 0; }
      }
    }
    spreadHondaLine(rt);
    huntPlayer(rt, F);
    slopeHold(rt, F);
    hondaFire(rt, F, 0.5);
    // 名のある将は馬上：馬を落とされても、少しして控えの馬に乗り直す
    for (const R of F.riders || []) {
      const v = R.u;
      // 倒れた将や負傷して離脱する将を、四秒後に馬上へ戻さない。
      if (!v.alive || v.mounted || v.downed || v.woundOut || v.rearWound ||
          v.gone || v.noTarget || v.fleeing) { R.t = 0; continue; }
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

  onKill(rt, v, killer) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.name === '後藤又兵衛') matabeiDown(rt);
    // 兼相の不退転は生きている間だけ。討死後まで無期限に残すと、残兵を追う段が長引く。
    if (v.name === '薄田兼相' && v.group) {
      v.group.noRout = false;
      v.group.morale = 0;
      v.group.fleeDir = { x: -1, z: 0 }; v.group.fleeSet = true;
    }
    // 討ち手は共通の戦功判定に従う。味方の討ち取りを本人の手柄にせず、先の大きな戦功も下げない。
    if (v.name === '薄田兼相' && killer?.isPlayer) rt.award((t) => {
      if ((t.special?.pts || 0) < 20) t.special = { label: '薄田兼相を討ち取った', pts: 20 };
    }, '薄田兼相を討ち取った');
  },
};

// 兵の数は史実（徳川方 大和口 三万四千・豊臣方 後藤二千八百と後続を合わせて一万八千六百）。本物の兵一人がおよそ百人
k13_domyoji.force = (rt) => ({ a: Math.max(0, 34000 - (rt.flags.ak || 0) * 60), a0: 34000, b: Math.max(0, 18600 - (rt.flags.ek || 0) * 60), b0: 18600 });
// 陣立ての厚み（army_depth.js）・命懸けの戦場（lethal.js）・この戦の怖さ（霧の山の斬り合い・誉田の鉄砲戦）
k13_domyoji.depth = DEPTH13;
k13_domyoji.lethal = true;
// 11/19 08:25 UTC クラウド kaito2（持ち主）⑥：60秒の写真（874×402）で、斜面を登る水野勢の塊の中に本人が埋もれ、後ろの目の前の味方の笠と胴が画の右三分の一と本人の上半身を塞いだ。
//   手前の味方を透かす輪を 2.2→3.2、本人の少し先（一歩と四分の一）まで視線の帯を延ばす（鴫野と同じ形）。兵の数・当たりは変えない
k13_domyoji.nearAllyFadeRadius = 3.2;
k13_domyoji.nearAllyPastSelf = 1.25;
// 11/18 18:20 UTC クラウド kaito2（持ち主）：act bot の POSLOG で、誉田の段（④⑤）の間も待つ備（新手）が本人の四十六歩先＝道明寺の野と誉田の間に立ち、
//   本人が二十四歩に入るたびに出て囲み、本人は誉田の野（七十五歩先）へ着けず⑤が〔失〕（3回に2回）。誉田の段では、本人が誉田の四十五歩内に入るまで待つ備を出さない（並べて二線として見せるだけ）
k13_domyoji.reserveRelease = (rt) => {
  if ((rt.flags.dp?.i ?? 0) < 4) return true;
  const P = rt.player?.u?.pos;
  return !!P && Math.hypot(P.x - HONDA.x, P.z - HONDA.z) < 45;
};
// 11/18 20:55 UTC クラウド kaito2（持ち主）：K281 の厚み＝描かずの数え（thickness.mjs）で本人から30〜60m の敵の本物が 90秒20・200秒29人（40に届かず）。
//   本人の前60m に味方が90人を越えて立ち、共通の「前を埋める新手」が味方で埋まったと見て出なかった→小松山と道明寺の野の段（①〜③）は前を敵の本物だけで数える
k13_domyoji.frontFillFoe = (rt) => (rt.flags.dp?.i ?? 0) <= 3;
//   本物の兵が 90秒231・200秒239 人で上限250に詰まり、新手（二十八人）を置く枠が無かった→上限を携帯270・パソコン300に（森部・天王寺と同じ形。味方の兵の多さ K266 は減らさない）
k13_domyoji.realCap = isTouch ? 270 : 300 + fujinRealN('k13_domyoji');   // 11/19 iMac army-13（kaito「天王寺レベルの軍勢」）：パソコンは布陣の表の分を足す
//   待つ備は既定の四十六歩に四組を横へ並べると端の組が六十歩の外へ出た（60〜100m に敵80人）→四十歩に
k13_domyoji.reserveDist = 40;
// 11/19 00:55 UTC クラウド kaito2（持ち主）：誉田の段（④⑤）は石川の流れと東の河原に敵の待つ備を置かない（誉田の野で戦う。史実の後続は誉田へ退いて真田・毛利と合わさった）
// 11/19 07:05 UTC クラウド kaito2（持ち主）：act bot 2回とも③の百秒で本人の討ち取り2・薄田の手へ一度も着かず（POSLOG：本人は石川の東 x -18〜16 を行き来し、
//   二十五歩内に待つ備の新手 12〜24人。四十歩先＝石川の東の岸に置かれた新手が川の手前で本人を囲み、bot は避けて東へ戻る）。③（と前の息継ぎ）は敵の新手を石川の西
//   （薄田の手の後ろ＝道明寺の野の二線）にだけ置く。数と強さは変えない
k13_domyoji.reserveOk = (rt, p, foe) => !foe || ((i) => i === 2 || i === 3 ? p.x < ISHI_X - 4 : true)(rt.flags.dp?.i ?? 0) && ((rt.flags.dp?.i ?? 0) < 4 || p.x < ISHI_X - 22 &&
  // 11/19 04:05 UTC クラウド kaito2（持ち主）：act bot の POSLOG で④の八十秒、本人が石川の西の岸（-50,-4）に立ち、本人の三十六〜四十歩先（x -86〜-90）へ置かれた新手と
  //   斬り合い続けて誉田の野（六十八歩先）へ行けなかった（討ち取りは増えるが誉田の撃ち合いに一度も入らない）。本人が誉田の四十五歩の外の間は、新手を誉田の野の四十歩内にだけ置く
  //   04:30 続き：誉田の東の縁（x -80〜-90）に置いた新手から本人（bot）が避けて東へ戻った→遠い間は誉田の西（真田・毛利の後ろ）にだけ置く
  ((Math.hypot(p.x - HONDA.x, p.z - HONDA.z) < 40 && p.x < HONDA.x - 8) || ((P) => !!P && Math.hypot(P.x - HONDA.x, P.z - HONDA.z) < 45)(rt.player?.u?.pos)));
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

// ======================================================================
// K651（kaito 11/25「立場を入れ替えるだけでできる戦は全部の家でそうする」）：道明寺の戦場を建てる所だけを出す。
//   伊達編 e10 は domyojiField(rt) を呼び、遊ぶ側（片倉の鉄砲騎馬隊）・備・行き先・勝ち負けだけ入れ替える（docs/k651_howto.md）。
//   中身は徳川の setup と同じ手（身の回りの場・忠輝の陣・小松山の頂の旗・誉田八幡の社と鳥居・誉田の民家）。徳川の setup は前のまま
export const DOMYOJI_WORLD = k13_domyoji.world;
export const DOMYOJI_TIMESLIP = k13_domyoji.timeslip;
export function* domyojiField(rt) {
  timeslipField(rt);
  yield;
  flags(rt);
}
// 行き先を置く物差し（手で数を写さない）。東（奈良の側）が +x、北が −z。小松山は中ほど、石川はその西
export const DOMYOJI_AT = { start: START, slope: SLOPE, top: TOP, ishiX: ISHI_X, nogawa: NOGAWA, honda: HONDA, rear: REAR, hachiman: HACHIMAN };
export { k13_domyoji };
export default k13_domyoji;
// K652②（11/25 Sanae）：殿の後の続きの段（煙の中の殿）。tokugawa_more.js
import { moreSteps, MORE } from './tokugawa_more.js';
moreSteps(k13_domyoji, MORE.k13_domyoji);
