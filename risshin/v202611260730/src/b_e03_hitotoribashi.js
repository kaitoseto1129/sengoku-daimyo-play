// 伊達家編 山場「人取橋の戦い」（天正十三年〔1585〕十一月十七日）。軽い型（light_battle.js）。紙は docs/house_date.md ④・docs/fujin/e03_hitotoribashi.md
//   史実：父輝宗の死の後、十九歳の政宗は二本松を囲んだ。救いに来た佐竹義重・蘆名・二階堂・石川・白河らの連合約三万が、本宮の南の人取橋（瀬戸川）へ寄せた。
//   伊達は約七千。政宗の本陣（観音堂山）まで敵が迫り、七十三歳の鬼庭左月（良直）が殿で橋を防いで討死、伊達成実が横で奮戦した。
//   日が暮れて戦は止み、その夜、佐竹の陣に国元の急な報せ（諸説）があって連合は兵を引いた。出所：『伊達日記』（B）・『性山公治家記録』（B）・本宮市の解説（C）。数は通説
// この家だけの仕組み「馬印の勢い」の逆（house_date.md ①）：摺上原は馬印を押し出したが、ここは押し出さず守る。
//   政宗の馬印は丘に立ったまま動かない。本人が馬印の近く（十八歩内）にいると、旗本は踏みとどまり、旗は風を受けて立つ。
//   本人が馬印から離れると、旗が垂れ、味方の刃が鈍り、連合の兵が馬印へ寄ってくる。馬印に敵が取り付くと竿が傾き、倒れたら負け。字・札・釦は足さない
import * as THREE from 'three';
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { allyGroup } from './bhelp.js';
import { WIND_STATE, WIND_DIR, GUST } from './world.js';
import { bridgeBoard, bridgeWoodMaterial } from './props.js';

const DATE = { flag: 'date', armor: 0x1c1a18 };     // 伊達の黒漆の具足と竪三引両
const RENGO = { flag: 'satake', armor: 0x5a4a36 };   // 連合（佐竹の扇に月丸を先に立てる）
// 地形：x は東が＋。伊達は東（本宮・観音堂山）、連合は西（瀬戸川の向こう・須賀川の側）と南北から寄せる
const STREAM = [[-4, -220], [2, -100], [0, 0], [-6, 110], [-2, 220]];   // 瀬戸川
const BRIDGE = { x: 0, z: 0 };         // 人取橋
const UMA = { x: 28, z: 0 };           // 政宗の馬印（観音堂山の裾の小高い所）
const SPAWN = { x: 40, z: 3 };
const SIDE = { x: 30, z: -16 };        // 南から回り込む二階堂・石川の手を受ける所（馬印から十六歩）
const SAGETSU = { x: 9, z: 0 };        // 鬼庭左月の殿（橋の東の袂）
const KITA = { x: 22, z: 14 };         // 馬印の北の脇（北の田から回る蘆名を受ける・馬印から十五歩・K652②）
const MAE = { x: 15, z: -4 };          // 馬印の前（取り付いた佐竹の手を斬り払う・馬印から十三歩・K652②）
const KAKOMI = { x: 22, z: -8 };       // 政宗が敵に囲まれた所（馬印の南の前・K652⑥）
const NEAR = 18, FAR = 24;             // 馬印の近く／離れた

function hasFoe(u, P) { return u.alive && !u.gone && u.team !== P.team && !u.fleeing && !u.isStruct && !u.civ; }

// 馬印を守る。半秒ごと。F.guard：0〜1（本人が近いと上がる）・F.umaHp：1〜0（敵が取り付くと減る）
function guardTick(rt, dt) {
  const F = rt.flags, P = rt.player?.u;
  if (!P || F.ending) return;
  const b = umaHolder(rt);
  sagetsu(rt);
  if ((F._gT = (F._gT || 0) - dt) > 0) return;
  F._gT = 0.5;
  const dP = Math.hypot(P.pos.x - UMA.x, P.pos.z - UMA.z), near = dP < NEAR;
  F.guard = Math.max(0, Math.min(1, (F.guard ?? 0.6) + (near ? 0.06 : -0.1)));
  if (!near) F.awayS = (F.awayS || 0) + 0.5;
  // 馬印に取り付いた敵（七歩内）を数える。本人が離れていると、近くの敵（四十五歩内）を六人まで馬印へ向ける
  let on = 0, pulled = 0;
  for (const u of rt.army.units) {
    if (!hasFoe(u, P)) continue;
    const d = Math.hypot(u.pos.x - UMA.x, u.pos.z - UMA.z);
    if (d < 7) on++;
    else if (dP > FAR && d < 45 && pulled < 6 && !u.name) { u.moveTo = { x: UMA.x, z: UMA.z }; u.target = null; u.aiT = 1.5; pulled++; }
  }
  F.umaOn = on;
  const hp0 = F.umaHp ?? 1;
  F.umaHp = on ? Math.max(0, hp0 - on * (near ? 0.0006 : 0.004)) : Math.min(1, hp0 + 0.004);
  F.umaMin = Math.min(F.umaMin ?? 1, F.umaHp);
  // 竿が傾く（倒れると負け）
  if (b?.uma) { b.uma.rotation.z = -(1 - F.umaHp) * 1.1; b.uma.updateMatrix(); }
  if (F.umaHp <= 0) { rt.say('伊達成実', '殿の馬印が倒れた！', 3); rt.def.lose(rt, '政宗の馬印が倒れた'); return; }
  // 旗は守りの強さで立つ（風の強さを共有。旗・幟・草が同じに揺れる）。離れると垂れる
  const G = F.guard;
  WIND_STATE.gust = GUST.value = 0.3 + 0.9 * G;
  for (const g of F.allies || []) {
    if (!g || !g.count) continue;
    g.dmgMult = 0.2 + 0.2 * G;
    if (g === F.sageG) continue;
    if (g.name.includes('旗本')) { g.calm = false; g.order = 'hold'; g.aggro = 9; g.anchor = { x: UMA.x + 3, z: UMA.z + 2 }; continue; }   // 馬印の脇に立ち、取り付いた敵だけを斬る
    // 旗本・成実の手は馬印の前から離れない（押し出さない）。本人が近いと少し前（敵の側）まで踏み出す
    g.calm = false; g.order = 'hold'; g.aggro = 10 + 10 * G;
    const k = (F.allies.indexOf(g) % 3) - 1;
    g.anchor = { x: UMA.x - 6 - 4 * G, z: UMA.z + k * 9 + (g.name.includes('成実') ? -10 : 0) };
  }
}
// 鬼庭左月の殿：橋の袂に留まって戦う。夜を待つ段の頭で討死（史実）
function sagetsu(rt) {
  const F = rt.flags, g = F.sageG;
  if (!g) return;
  if (g.count) { g.anchor = { ...SAGETSU }; g.order = 'hold'; g.aggro = 14; g.calm = false; }
  if (F.step >= 4 && !F.sageDead) {   // K652②：段を二つ足したので、夜を待つ段（五つ目）の頭
    F.sageDead = true;
    const s = g.units.find((u) => u.alive && u.type === 'busho');
    if (s) { s.invuln = false; s.mustLive = false; s.hp = 0; rt.army.kill(s, null); }
    for (const u of g.units) if (u.alive) u.hp = Math.min(u.hp, u.maxHp * 0.3);
    rt.after(0.6, () => rt.say('伊達成実', '鬼庭左月どの、橋で討死！　左月どのの死を無にするな！', 3.6));
  }
}
// 馬印持ち：丘に立ったまま動かない。斬り合わず、狙われず、数に入れない（摺上原の持ち手と同じ手）
function umaHolder(rt) {
  const F = rt.flags;
  if (!F.umaG) {
    F.umaG = allyGroup(rt, { name: '政宗の馬印', anchor: { ...UMA }, noRout: true, order: 'hold', aggro: 0, fixed: true, noAI: true },
      [{ type: 'ashigaru', n: 1, o: { flag: null, uma: 'date_torige', weapon: 'none', dmg: 0 } }]);
    F.sageG = (F.allies || []).find((g) => g.name.includes('左月'));
    bridge(rt);
  }
  const b = F.umaG.units.find((u) => u.alive);
  if (!b) return null;
  if (!b.isUma) { b.isUma = b.isStandard = true; b.noTarget = true; b.invuln = true; if (b.uma) { b.uma.scale.setScalar(1.3); b.uma.matrixAutoUpdate = false; b.uma.updateMatrix(); } }
  b.target = null; b.atk = null; b.watch = null;
  b.moveTo = Math.hypot(b.pos.x - UMA.x, b.pos.z - UMA.z) > 0.8 ? { ...UMA } : null;
  return b;
}
// 人取橋：瀬戸川に渡した低い板橋（床板は props の bridgeBoard を使い回す。当たりは足さない＝川は浅く歩いて渡れる）
function bridge(rt) {
  const W = rt.world, y = Math.max(W.heightAt(-7, 0), W.heightAt(7, 0)) + 0.15, mat = bridgeWoodMaterial();
  const deck = new THREE.Mesh(bridgeBoard(15, 0.22, 3.4), mat);
  deck.position.set(BRIDGE.x, y, BRIDGE.z); deck.receiveShadow = true; deck.matrixAutoUpdate = false; deck.updateMatrix(); rt.scene.add(deck);
  for (const sx of [-4.5, 0, 4.5]) for (const sz of [-1.5, 1.5]) {
    const gy = W.heightAt(sx, sz), h = Math.max(0.4, y - gy + 0.1);
    const post = new THREE.Mesh(bridgeBoard(0.26, h, 0.26, true), mat);
    post.position.set(sx, gy + h / 2 - 0.12, sz); post.matrixAutoUpdate = false; post.updateMatrix(); rt.scene.add(post);
  }
}

export const e03_hitotoribashi = lightBattle({
  id: 'e03_hitotoribashi',
  date: '天正十三年（1585）十一月十七日　冬・夕暮れ　陸奥国 人取橋',
  intro: '二本松を救いに、佐竹・蘆名らの連合三万が寄せてきた。伊達は七千。日が暮れるまで、政宗の馬印を守り抜け。',
  history: '天正十三年（1585）十一月、父輝宗を失った十九歳の伊達政宗は二本松城を囲んだ。救いに来た佐竹義重・蘆名・二階堂・石川・白河らの連合約三万が、本宮の南の人取橋へ押し寄せた。伊達は約七千。敵は政宗の本陣の近くまで迫り、七十三歳の鬼庭左月（良直）が殿となって橋を防ぎ討死し、伊達成実も横で踏みとどまった。日が暮れて戦は止み、その夜、佐竹の陣に国元の急な報せがあったとされ、連合は兵を引いた。政宗は危うく助かった。',
  sides: { a: { name: '伊達政宗の軍', mon: 'date', faction: 'date' }, b: { name: '佐竹・蘆名らの連合', mon: 'satake', faction: 'satake' } },
  force: { a: 7000, b: 30000 },
  allyLook: DATE, foeLook: RENGO,
  playerTaken: 0.55,
  thick: true,
  allyDmg: 0.3,
  friendsSend: 0,   // 段の始めに味方を送らない。味方は馬印の前に踏みとどまる（guardTick）
  minutes: 7,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  world: {
    seed: 1585, time: 'dusk', winter: true, overcast: true, fogFar: 360,
    sky: { wind: [-1, 0.1], windStrength: 0.5 },
    river: STREAM, riverW: 9, riverDepth: 0.45,
    hills: [[52, 0, 34, 7], [70, 60, 60, 16], [90, -80, 70, 20], [-80, -120, 70, 14], [-90, 110, 60, 12]],   // 東に観音堂山の裾・南北に低い山
    paths: [{ pts: [[80, 4], [40, 3], [UMA.x, 0], [0, 0], [-60, -6], [-140, -20]], w: 3 }],   // 奥州街道（本宮〜須賀川）
    groves: [{ x: 70, z: 60, r: 30, n: 30 }, { x: -80, z: -120, r: 40, n: 40 }, { x: -60, z: 90, r: 26, n: 24 }],
    trees: 320, tufts: 1800,
  },
  allies: [
    { name: '伊達政宗の旗本', at: { x: UMA.x + 3, z: UMA.z + 2 }, list: [busho('伊達政宗'), uS(4), uA(6)] },
    { name: '鬼庭左月の殿', at: { ...SAGETSU }, list: [busho('鬼庭良直'), uS(2), uA(10)] },
    { name: '伊達成実の手', at: { x: UMA.x - 4, z: UMA.z - 12 }, list: [busho('伊達成実'), uS(2), uA(10)] },
    { name: '鉄砲衆', at: { x: UMA.x - 2, z: UMA.z + 10 }, list: [uS(1), uG(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['伊達政宗', '馬印を立てよ。ここから一歩も退かぬ', 3.4],
      ['鬼庭左月', '若殿、この爺が橋で防ぎまする。日が暮れるまで、旗を離されるな', 3.6]] },
    { kind: 'hold', at: UMA, label: '馬印', obj: '馬印の前で、連合の先手を受け止める', r: 16, dur: 60,
      title: '人取橋', sub: '連合三万が、瀬戸川を越えて寄せる',
      say: [['組頭', '馬印から離れるな！　旗が倒れれば、伊達は終わりじゃ！', 3.4]],
      waves: [
        { t: 6, say: ['佐竹の侍', '小勢じゃ！　政宗の旗を取れ！'], foes: [{ name: '佐竹の先手', from: { x: UMA.x - 44, z: UMA.z + 4 }, list: [uS(3), uA(14)] }] },
        { t: 30, say: ['組頭', '北からも来るぞ！'], foes: [{ name: '蘆名の手', from: { x: UMA.x - 26, z: UMA.z + 34 }, list: [uS(2), uA(10)] }] }],
      reward: '馬印の前で連合の先手を受け止めた' },
    { kind: 'hold', at: SIDE, label: '横', obj: '南から回り込む敵を、馬印から離れずに押し返す', r: 12, dur: 55,
      title: '回り込み', sub: '二階堂・石川の手が南から馬印を狙う',
      say: [['伊達成実', '横はわしが持つ！　お主は殿の旗の脇を固めよ', 3.2]],
      waves: [
        { t: 4, say: ['二階堂の侍', '後ろへ回れ！　馬印は手薄ぞ！'], foes: [{ name: '二階堂の手', from: { x: SIDE.x - 20, z: SIDE.z - 36 }, list: [uS(3), uA(12)] }] },
        { t: 28, say: ['組頭', '新手じゃ！　旗の前を空けるな！'], foes: [{ name: '石川・白河の手', from: { x: SIDE.x + 10, z: SIDE.z - 40 }, list: [uS(2), uA(10)] }] }],
      reward: '南から回り込む敵を押し返した' },
    // K652②（11/25 Sanae・10分）：連合は三方から寄せ、伊達の陣は何度も崩れかけた（『伊達日記』B）。馬印から離れずに戦う段を二つ
    { kind: 'hold', at: KITA, label: '北の脇', obj: '北の田から回り込む蘆名の手を、馬印の脇で受け止める', r: 12, dur: 55, limit: 110,
      title: '北の田', sub: '蘆名の手が、北の田を渡って来る',
      say: [['伊達成実', '北じゃ！　田を渡って来る。馬印の脇を空けるな', 3.2]],
      waves: [{ t: 4, say: ['蘆名の侍', '北から回れ！　伊達の旗は目の前ぞ！'], foes: [{ name: '北の田の蘆名勢', from: { x: KITA.x - 30, z: KITA.z + 30 }, list: [uS(3), uA(12)] }] },
        { t: 28, say: ['組頭', 'まだ来る！　畦を越えさせるな！'], foes: [{ name: '蘆名の二の手', from: { x: KITA.x - 40, z: KITA.z + 16 }, list: [uS(2), uA(10), uG(2)] }] }],
      reward: '北の田から回る蘆名の手を受け止めた' },
    { kind: 'fight', at: MAE, limit: 110, obj: '馬印の前に取り付いた佐竹の手を斬り払う', title: '旗の前', sub: '佐竹の手が、馬印の前まで迫る',
      say: [['伊達政宗', '旗の前まで来おったか。斬り払え！', 3.2], ['組頭', '殿の旗を取らせるな！', 3]],
      foes: [{ name: '馬印に迫る佐竹の手', from: { x: MAE.x - 14, z: MAE.z - 4 }, list: [uS(3), uA(13)] }, { name: '佐竹の鉄砲', from: { x: MAE.x - 22, z: MAE.z + 8 }, list: [uS(1), uG(4)] }],
      reward: '馬印の前の佐竹の手を斬り払った' },
    // K652⑥（11/25 クラウドわ）逸話の段：政宗は自ら敵中で戦い、具足に鉄砲の玉五つ・矢一筋を受けたと伝わる（『伊達治家記録』B）。本人が駆け込み、政宗を囲む佐竹の武者を斬り払う
    { kind: 'fight', at: KAKOMI, limit: 110, obj: '殿を囲む佐竹の武者へ斬り込み、政宗を救う', title: '殿の危うき', sub: '政宗の具足に玉が当たる。佐竹の武者が殿を囲む',
      say: [['組頭', '殿の具足に玉が当たったぞ！　殿を囲ませるな！', 3.2], ['伊達政宗', 'かすり傷じゃ。退くな、斬り払え！', 3.2]],
      foes: [{ name: '殿を囲む佐竹の武者', from: { x: KAKOMI.x - 12, z: KAKOMI.z - 8 }, list: [uS(4), uA(10)] }, { name: '殿を狙う佐竹の鉄砲', from: { x: KAKOMI.x - 20, z: KAKOMI.z + 6 }, list: [uS(1), uG(4)] }],
      reward: '政宗を囲む佐竹の武者を斬り払い、殿を救った' },
    // K652②（11/25 Sanae）：段を足して長くなった分、夜を待つ段の前に立て直しを一つ（八秒・傷の手当て。act bot が夜の段で倒れた）
    { kind: 'rest', dur: 8, say: [['組頭', '息を整えよ。傷を縛れ。次が来るぞ', 3]] },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: BRIDGE.x - 30, z: BRIDGE.z - 12 }, obj: '橋の東の土手で、渡って来る連合の足軽を討つ', max: 100, limit: 90,
      say: [['組頭', '橋を渡らせるな', 3.2]],
      foes: [{ name: '連合の足軽', from: { x: BRIDGE.x - 18, z: BRIDGE.z - 24 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '橋の東の土手を守った' },
    { kind: 'hold', at: { x: BRIDGE.x + 20, z: BRIDGE.z + 20 }, label: '馬印の南で、', obj: '馬印の南で、回り込む連合の弓を受け止める', r: 16, dur: 45,
      say: [['見張り', '弓が回り込んでいる！', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '連合の弓', from: { x: BRIDGE.x + 32, z: BRIDGE.z + 8 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '連合の弓', from: { x: BRIDGE.x + 6, z: BRIDGE.z + 34 }, list: [uS(2), uA(7)] }] }],
      reward: '馬印の南を守った' },
    { kind: 'fight', at: { x: BRIDGE.x - 50, z: BRIDGE.z + 6 }, obj: '橋の袂で、押し込んで来る連合の侍を斬り払う', max: 100, limit: 90,
      say: [['伊達政宗', '橋の袂を渡すな', 3.2]],
      foes: [{ name: '連合の侍', from: { x: BRIDGE.x - 38, z: BRIDGE.z - 6 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '橋の袂を守った' },
    { kind: 'hold', at: UMA, label: '夜まで', obj: '日が暮れるまで、馬印を守り抜く', r: 16, dur: 70,
      title: '夕闇', sub: '橋が破られた。日が落ちるまで、あと少し',
      say: [['伊達政宗', '退かぬ。わしの旗はここに立つ', 3.2]],
      waves: [
        { t: 3, say: ['佐竹の侍', '橋を渡ったぞ！　一気に押し包め！'], foes: [{ name: '佐竹の本手', from: { x: BRIDGE.x - 6, z: BRIDGE.z }, list: [uS(4), uA(14)] }] },
        { t: 26, say: ['蘆名の侍', '日が暮れる前に、政宗を討て！'], foes: [{ name: '蘆名の二の手', from: { x: UMA.x - 20, z: UMA.z - 34 }, list: [uS(2), uA(12)] }] }],
      reward: '日暮れまで馬印を守り抜いた' },
  ],
  update(rt, dt) {
    const F = rt.flags;
    if (F.step >= 4 && !F.nightT) { F.nightT = rt.t; rt.world.setTime?.('night'); }   // 夜を待つ段：四十五秒ほどかけて日が落ちる
    // 日が落ちきったら連合は戦をやめて退く（史実：日没で止み、その夜に佐竹が引いた）。残る寄せは崩れて川の向こうへ
    if (F.nightT && !F.dark && rt.t - F.nightT > 95) {
      F.dark = true;
      const P = rt.player.u;
      for (const u of rt.army.units) if (hasFoe(u, P) && u.group) { u.group.noRout = false; u.group.morale = 0; }
      rt.say('組頭', '日が落ちた……敵が退いていく', 3);
    }
    guardTick(rt, dt);
  },
  win: {
    banner: '夜', sub: '佐竹の陣に急な報せ。連合は兵を引いた', award: '人取橋で政宗の馬印を守り抜いた',
    say: [['伊達成実', '連合が退いていきます。佐竹の陣で何かあった様子', 3.4],
      ['伊達政宗', '左月の爺に救われた。この旗、二度と危うくはさせぬ', 3.6]],
  },
});
// 少し引いて、馬印（竿三・三m＋黒鳥毛の笠）と本人が同じ画面に入るように
e03_hitotoribashi.camPull = 1.6;
export default e03_hitotoribashi;
