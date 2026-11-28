// 武田編 四戦目「蒲原城攻め」（永禄十二年〔1569〕十二月六日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：駿河へ攻め入った信玄は、北条方の北条氏信（綱重）の守る蒲原城を攻めた。勝頼と信豊が城の下の町へ火を放って城兵を誘い出し、
//   打って出た城兵を破ってそのまま城へ攻め入り、一日で落とした。氏信は討死（『甲陽軍鑑』・静岡市の史跡の案内）。勝頼の早い手柄の一つ。
//   主人公は勝頼の手の足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
import { withCastle } from './light_castle.js';
import { KANBARA_PLAN } from './castles/kanbara.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
import * as THREE from 'three';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const HOJO = { flag: 'hojo', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 140 };
const MACHI = { x: -8, z: 86 };       // 城の下の町（火を放つ）
const NO = { x: 6, z: 50 };           // 打って出た城兵と当たる野
const OTE = { x: 0, z: 10 };          // 大手の坂
const HON = { x: -2, z: -32 };        // 本曲輪
const BANSHO = { x: 40, z: 84 };       // 東海道の北条の番所（町の東の口・K652②）
const NINO = { x: 2, z: -12 };        // 二の曲輪（大手の坂の上・K652②）
// 11/27 クラウドす K722①：海（せ の carve と sea）は浜から見えるが、霧の見通し（百十mほど）の外の海は霞で消えるので、城の上からも駿河湾が見えるように、南の目の高さのすぐ下に水平線の帯を一枚置く
//   （town_sakurajima.js の錦江湾の帯と同じ手：カメラと一緒に動く遠景・霧を掛けない・深さを書かない。形一つ・描く回数一つ）
const SEA_D = 140;
function seaBand(rt) {
  // 上の縁が水平線。下へ行くほど透けて手前の霞へ溶ける（帯の下の縁を見せない）
  const g = new THREE.PlaneGeometry(700, 14, 1, 4), p = g.attributes.position, c = [], k = new THREE.Color();
  const top = new THREE.Color(0xb4c2cc), mid = new THREE.Color(0x7d95a6);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 7) / 14;   // 0 手前 〜 1 水平線
    k.copy(mid).lerp(top, t > 0.92 ? 1 : t * 0.45);
    c.push(k.r, k.g, k.b, Math.min(1, t * 1.6) * 0.9);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 4));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, depthWrite: false }));
  m.rotation.y = Math.PI;   // 北（城）から南を見る面
  m.renderOrder = -0.5; m.frustumCulled = false; m.userData.noMerge = true;
  let fr = -1;
  m.onBeforeRender = (renderer, scene, cam) => {
    if (renderer.info.render.frame === fr) return; fr = renderer.info.render.frame;
    m.position.set(cam.position.x, cam.position.y - 7.4, cam.position.z + SEA_D); m.updateMatrixWorld(true);
  };
  rt.scene.add(m);
}

// 11/21 クラウド35（K563 ③の質）：蒲原城（本曲輪・善福寺曲輪・二ノ・三ノ曲輪）を置く（castles/kanbara.js・出所 docs/battle_refs/kanbara.md）。遠景の軽い形
export const d04_kanbara = withCastle(lightBattle({
  id: 'd04_kanbara',
  date: '永禄十二年（1569）十二月六日　晴れ　駿河国 蒲原城',
  intro: '駿河の海を見下ろす蒲原城に、北条氏信が籠もる。勝頼は城の下の町に火を放ち、城兵を誘い出す。',
  history: '永禄十二年（1569）、武田信玄は駿河の蒲原城を攻めた。勝頼らが城の下に火を放って城兵を誘い出し、打って出た城兵を破ってそのまま攻め入り、一日で城を落とした。城主の北条氏信は討死した。',
  sides: { a: { name: '武田勝頼の手', mon: 'takeda', faction: 'takeda' }, b: { name: '北条氏信の城兵', mon: 'hojo', faction: 'hojo' } },
  force: { a: 6000, b: 1200 },
  allyLook: TAKEDA, foeLook: HOJO,
  friendsSend: 2,   // 段の始めに攻めに出す味方の組は本人に近い二組（全部出すと本人より先に討ち切る・一組では章の通しで本人が囲まれて倒れた回があった 11/21）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1569, time: 'day', winter: true, fogFar: 420,
    hills: [[0, -30, 44, 24], [-90, -60, 60, 30], [100, -50, 60, 28], [60, 110, 40, 6]],
    // 11/27 cloud-19（K563 地形・標高の asset が来るまで手書き。司令塔「Mac を待たない」）：蒲原城は駿河湾の北の山の上、城の下を東海道が東西に通り、
    //   東に富士川が南へ流れて海へ入る（今の静岡市清水区蒲原・富士川の河口の地図と『甲陽軍鑑』の蒲原城攻めの記から推した＝推し）。
    //   富士川（東・本人の戦う所から百六十 m 余り外）と、町の南の浜の向こうの駿河湾（静かな水面）。標高（dem_kanbara）が届いたら差し替える
    river: [[172, -220], [166, -100], [176, 0], [168, 100], [178, 220]], riverW: 26, riverDepth: 0.8,
    sea: [{ pts: [[-230, 214], [-80, 208], [80, 212], [230, 206]], w: 44, depth: 1.2, still: true, levelAt: () => -0.4 }],
    carve: [{ pts: [[-230, 214], [-80, 208], [80, 212], [230, 206]], w: 44 }],
    // 11/21 cloud-19（K563 地形・手書き）：城の下の町を東西に東海道が通り、大手の坂が町から本曲輪へ上る。城山の背は松と雑木
    paths: [{ pts: [[-200, 92], [-8, 86], [200, 80]], w: 4 }, { pts: [[0, 140], [-8, 86], [6, 50], [0, 10], [-2, -32]], w: 2.6 }],
    groves: [{ x: -40, z: -50, r: 24, n: 26 }, { x: 40, z: -44, r: 22, n: 22 }],
    trees: 470, tufts: 1500,
    // K722②（11/27 クラウドせ・要件書の戦場「海の見える丘」・駿河の海を見下ろす）：前は南も野と山ばかりで海が無く、本曲輪から見下ろしても
    //   野が続くだけだった（docs/status/k722/d04/hon_minami_mae_844x390.jpg）。蒲原は東海道の宿で、町の南はすぐ駿河の海（薩埵峠の西の浜）。
    //   町の南（陣の後ろ）の地面を浜から沖へ下げ、静かな海の水面を一枚（厳島・下田と同じ sea の作り・描く物は一つ）。浜は砂の色
    carve: [{ pts: [[-420, 262], [-150, 257], [0, 263], [150, 255], [420, 261]], w: 72 }],
    sea: [{ pts: [[-900, 480], [0, 482], [900, 480]], w: 300, depth: 3, still: true, levelAt: () => -0.5, waterColor: [0x4f6f74, 0x1c3440] }],
    tint(x, z, h, c) {
      if (z < 160) return;
      if (h < -0.35) { c.setRGB(c.r * 0.35 + 0.15, c.g * 0.35 + 0.17, c.b * 0.35 + 0.17); return; }
      if (h < 0.5) { const k = Math.min(1, (0.5 - h) / 0.5) * 0.75; c.setRGB(c.r * (1 - k) + 0.66 * k, c.g * (1 - k) + 0.6 * k, c.b * (1 - k) + 0.48 * k); }
    },
  },
  setup: seaBand,
  allies: [
    { name: '武田勝頼の手', at: { x: SPAWN.x - 10, z: SPAWN.z - 8 }, list: [busho('武田勝頼'), uS(4), uA(16)] },
    { name: '武田信豊の手', at: { x: SPAWN.x + 14, z: SPAWN.z - 6 }, list: [busho('武田信豊'), uS(3), uA(14)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 2, z: SPAWN.z + 8 }, list: [uS(1), uG(8)] },
  ],
  steps: [
    { kind: 'rest', dur: 10, heal: 0, say: [
      ['武田勝頼', '町に火を放て。城の者が黙って見てはおれぬ', 3.2],
      ['武田信豊', '城兵が出れば、そのまま城の門へ付いて入る', 3]] },
    // K652②（11/25 Sanae・10分に）：蒲原は東海道の宿。町の東の口に北条の番所があった（駿河へ入る北条の番の兵）。先に番所を破って町へ入る
    { kind: 'fight', at: BANSHO, limit: 110, obj: '東海道の北条の番所を破り、町の口を取る', title: '番所', sub: '町の口の番所に北条の番兵',
      say: [['武田信豊', '番所を破れ。町の口を押さえねば火はかけられぬ', 3.2]],
      foes: [
        { name: '番所の番兵', from: { x: BANSHO.x + 8, z: BANSHO.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の番頭 清水' } }, uS(3), uA(18)] },
        { name: '番所の弓', from: { x: BANSHO.x + 16, z: BANSHO.z - 4 }, list: [uB(5)] }],
      later: [{ t: 38, say: ['組頭', '宿の奥から番兵の助けが来る！'], foes: [{ name: '宿の番兵', from: { x: BANSHO.x - 14, z: BANSHO.z - 16 }, list: [uS(2), uA(12)] }] }],
      reward: '東海道の番所を破った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: BANSHO.x - 14, z: BANSHO.z - 12 }, obj: '番所の先の橋で、退く北条の番兵を追い崩す', limit: 90,
      say: [['組頭', '橋を渡らせるな。町へ知らせが走るぞ', 3.2]],
      foes: [{ name: '退く北条の番兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: BANSHO.x - 14, z: BANSHO.z - 12 }), list: [uS(2), uA(10)] }],
      reward: '退く番兵を追い崩した' },
    { kind: 'rest', dur: 8, heal: 0.7, say: [['組頭', '番所は破った。傷を縛れ、町へ走るぞ', 2.8]] },
    { kind: 'move', at: MACHI, label: '城の下の町', obj: '城の下の町へ火を放ちに走る', r: 14,
      say: [['組頭', '松明を持て！　町の端から火をかけよ！', 3]] },
    // 11/21 cloud-41（章の通し）：大手の坂の段が259秒かかり627秒になった回がある。斬り合いの段に上限150秒（六割崩していれば済）
    { kind: 'fight', at: NO, limit: 150, obj: '打って出た城兵を、野で迎え討つ', title: '打って出', sub: '火を見た城兵が門を開けて駆け下りて来る',
      say: [['北条の侍', '町を焼かせるな！　出て払え！', 3]],
      foes: [
        { name: '打って出た城兵', from: { x: NO.x, z: NO.z - 18 }, list: [uS(5), uA(26)] },
        { name: '城兵の鉄砲', from: { x: NO.x + 16, z: NO.z - 24 }, list: [uG(6)] }],
      // 11/21 cloud-50（司令塔：240秒より短い戦は受けの段を厚くして4分以上に）：野の受けに城兵の二の手・三の手を足した
      later: [{ t: 35, say: ['北条の侍', '二の手、出よ！　町を守れ！'], foes: [{ name: '城兵の二の手', from: { x: NO.x - 18, z: NO.z - 22 }, list: [uS(3), uA(18)] }] },
        { t: 70, say: ['組頭', '門からまた出て来るぞ！'], foes: [{ name: '城兵の三の手', from: { x: NO.x + 8, z: NO.z - 26 }, list: [uS(3), uA(16)] }] }],
      reward: '打って出た城兵を破った' },
    { kind: 'rest', dur: 8, heal: 0.6, say: [['組頭', '一度は退けた。傷を縛れ。門からまた来るぞ', 2.8]] },   // K652②：打って出と取り返しが続き、取り返しの段で倒れた回がある（act bot 11/25）
    // 11/21 cloud-50（4分以上に・二度目）：野の迎え討ちの後に、門から取り返しに来る城兵を受ける段を足した
    { kind: 'hold', at: NO, label: '野の備え', obj: '門から取り返しに来る城兵を、野で受け止める', r: 16, dur: 50,
      title: '取り返し', sub: '城兵が町を取り返しに門から押し出す',
      say: [['組頭', '退くな。ここで受ければ、門は開いたままじゃ', 3]],
      waves: [
        { t: 4, say: ['北条の侍', '町を取り返せ！'], foes: [{ name: '取り返しの城兵', from: { x: NO.x - 6, z: NO.z - 30 }, list: [uS(3), uA(18)] }] },
        { t: 28, say: ['組頭', '横の谷からも来る！'], foes: [{ name: '谷の城兵', from: { x: NO.x + 22, z: NO.z - 18 }, list: [uS(2), uA(14)] }] }],
      reward: '野で城兵を受け止めた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: NO.x + 14, z: NO.z - 14 }, obj: '野の端で、鉄砲を構える北条の兵を討つ', limit: 90,
      say: [['組頭', '野の端に鉄砲じゃ。伏せて寄れ', 3.2]],
      foes: [{ name: '鉄砲を構える北条の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: NO.x + 14, z: NO.z - 14 }), list: [uS(1), uA(6), uG(5)] }],
      reward: '野の端の鉄砲を討った' },
    { kind: 'fight', at: OTE, limit: 150, obj: '退く城兵に付いて、大手の坂を駆け上る', title: '大手の坂', sub: '城兵が門へ逃げ込む。門を閉じる前に付いて入る',
      say: [['武田勝頼', '門を閉じさせるな！　逃げる者の背に付いて入れ！', 3.2]],
      foes: [{ name: '大手の守り', from: { x: OTE.x, z: OTE.z - 10 }, list: [uS(4), uA(22), uB(4)] }],
      reward: '大手を破った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '坂は上った。息を整えよ。門の内に兵が戻るぞ', 2.8]] },   // K674：門の内の段で倒れた回（act bot 604秒）
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: OTE.x + 8, z: OTE.z - 14 }, obj: '大手の門の内で、門を閉めに戻る北条の兵を討つ', limit: 90,
      say: [['組頭', '門を閉めさせるな。付いて入れ', 3.2]],
      foes: [{ name: '門を閉めに戻る北条の兵', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: OTE.x + 8, z: OTE.z - 14 }), list: [uS(1), uA(8)] }],
      reward: '門の内の兵を討った' },
    // K652②：大手の上の二の曲輪で、北条の侍が取り返しに打ちかかる（城は一日で落ちたが、城兵は最後まで退かなかった）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '大手は破った。息を継げ。二の曲輪から来るぞ', 2.8]] },
    { kind: 'hold', at: NINO, label: '二の曲輪', obj: '二の曲輪で、取り返しに来る北条の侍を受け止める', r: 14, dur: 65,
      title: '二の曲輪', sub: '北条の侍が曲輪を取り返しに来る',
      say: [['武田勝頼', 'ここを持てば本曲輪は裸じゃ。一歩も退くな', 3.2]],
      waves: [
        { t: 5, say: ['北条の侍', '曲輪を取り返せ！　小田原の名にかけて！'], foes: [{ name: '二の曲輪の侍', from: { x: NINO.x - 4, z: NINO.z - 18 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 狩野' } }, uS(4), uA(16)] }] },
        { t: 32, say: ['組頭', '横の土塁から弓じゃ！'], foes: [{ name: '土塁の弓', from: { x: NINO.x + 14, z: NINO.z - 14 }, list: [uB(6), uS(2), uA(8)] }] }],
      reward: '二の曲輪を持ちこたえた' },
    // 11/21 cloud-41：最後の段が七分の上限まで延びた（通しで箕輪 731・蒲原 709秒）。旗本を六割崩せば 150 秒で済ます
    { kind: 'fight', at: HON, limit: 150, obj: '本曲輪で北条氏信の旗本を討つ', title: '本曲輪', sub: '北条氏信が最後の旗本と踏みとどまる',
      say: [['北条氏信', '小田原の名を汚すな。ここで死ぬぞ', 3.2]],
      foes: [{ name: '北条氏信の旗本', from: { x: HON.x, z: HON.z - 6 }, list: [busho('北条氏信', { mustLive: false, invuln: false }), uS(6), uA(13)] }],
      reward: '蒲原城を一日で落とした' },
  ],
  win: {
    banner: '蒲原城 落城', sub: '城主 北条氏信 討死。駿河の東の口が開いた', award: '蒲原城を落とした',
    say: [['武田信豊', '一日で落ちた。勝頼殿の火の手柄じゃ', 3.2],
      ['武田勝頼', '次は駿府じゃ。今川の残りを掃う', 3]],
  },
}), { plan: KANBARA_PLAN, at: { x: 0, z: 0 }, lift: 0, team: 1, life: false });
export default d04_kanbara;
