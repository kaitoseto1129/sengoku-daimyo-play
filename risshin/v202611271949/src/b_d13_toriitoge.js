// 武田編 十三戦目「鳥居峠の戦い」（天正十年〔1582〕二月）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md・クラウド k365-cloud-10）
//   史実：木曽義昌が織田へ寝返ると、勝頼は今福昌和らを木曽へ送った。木曽勢は織田の援けを得て、雪の鳥居峠で武田勢を破った。
//   これを合図に織田の甲州征伐が始まる（『信長公記』・塩尻市・木祖村の鳥居峠の案内）。主人公は今福の手の足軽。峠を登って木曽勢と戦い、敗れて退く。
// 11/21 cloud-10：act bot で四分より短く討ち取り2〜6だったので、41 の前半と同じく敵の組の足軽を一・六倍・侍を一人ずつ足し、味方の刃を〇・二五・守りの段を十五秒延ばした（K467）

import * as THREE from 'three';
import { palisade, nobori } from './props.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const KISO = { flag: 'kiso', armor: 0x2e3a2a };
const SPAWN = { x: 0, z: 160 };
const FUMOTO = { x: 4, z: 96 };      // 峠の上り口
const TOGE = { x: -6, z: 20 };       // 鳥居峠の頂（木曽勢の柵）
const YOKO = { x: 46, z: 40 };       // 峠の脇の尾根（伏せ）
const NOKI = { x: 0, z: 140 };       // 退き口
const YABU = { x: -18, z: 62 };      // 峠の中ほどの杉の間（木曽の物見の伏せ・K652②）
const NARAI = { x: 16, z: 156 };    // 峠の下の奈良井の宿の口（退く道・K652②）。11/27 クラウドか：前の z196 は戦場の端（moveLim 176）の外で、宿の口の敵が端へ押し戻され飛んでいた→内へ
// 11/27 クラウドか K722②「敵国へ攻め込んだ武田が初めて自国へ逃げ戻る」：前は勝ちの台詞だけで、絵では誰も逃げ戻っていなかった。
//   本物の兵の「武田の後の備」（allies の四つ目）が峠で共に戦い、退き口の前の一息で峠道を麓へ、木曽に背を向けて甲斐の方へ下る。
//   退き口の守りの段（sendFriends）で呼び戻されないよう、その時に味方の表から外して（F.nigeG）列だけで歩かせる。兵は足さず使い回し
const NIGE = 3, NIGE_TO = { x: -60, z: 170 };   // 退き口の西の谷筋を甲斐の方へ（宿の口の戦の場を避け、戦場の端の内）
const nigeModoru = (rt) => {
  const F = rt.flags, A = F.allies || [], g = A[NIGE]; if (!g?.count || F.nigeG) return;
  A.splice(NIGE, 1); F.nigeG = g;
  g.calm = true; g.order = 'move'; g.dest = { ...NIGE_TO }; g.speed = 1.8; g.noRun = true;
};

// 11/26 クラウドす K655（サムネが「雪も峠も無い緑の坂」で鳥居峠と当てられなかった）：鳥居峠と分かる物を峠の頂に足す。
//   ①峠の名の元の御嶽遥拝の鳥居（木曽義元が戦の勝ちを祈って峠に建てたと伝わる・塩尻市／木曽町の史跡の案内 C）を峠道の上に。
//   ②頂の木曽勢の柵（『信長公記』巻十五 B・本文の「柵の兵」）と木曽の幟。③峠道の両の肩の尾根（下の hills の後ろ二つ）。
//   物は道と頂の後ろだけ・当たりは付けない（遊びは前と同じ）。形は柱一つ・横木一つを使い回す。
function toriiDress(rt) {
  const W = rt.world, sc = rt.scene, h = (x, z) => (W.heightAt(x, z) || 0);
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.95 });
  const g = new THREE.Group(); g.name = 'toriitogeTorii';
  const hasira = new THREE.CylinderGeometry(0.2, 0.26, 4.6, 10), yoko = new THREE.BoxGeometry(1, 1, 1);
  const add = (geo, x, y, z, sx = 1, sy = 1, sz = 1, rz = 0) => { const m = new THREE.Mesh(geo, wood); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.z = rz; m.castShadow = true; g.add(m); };
  add(hasira, -1.9, 2.3, 0); add(hasira, 1.9, 2.3, 0);
  add(yoko, 0, 3.45, 0, 4.9, 0.22, 0.2);                 // 貫
  add(yoko, 0, 4.55, 0, 6.0, 0.26, 0.42);                // 島木
  add(yoko, -2.7, 4.78, 0, 1.3, 0.24, 0.48, 0.12); add(yoko, 2.7, 4.78, 0, 1.3, 0.24, 0.48, -0.12); add(yoko, 0, 4.82, 0, 4.4, 0.24, 0.48);   // 笠木（両の端が反る）
  add(yoko, 0, 4.0, 0, 0.22, 0.9, 0.18);                 // 額束
  const tx = TOGE.x, tz = TOGE.z - 8; g.position.set(tx, h(tx, tz) - 0.2, tz); g.scale.setScalar(1.35); sc.add(g);   // 頂の手前（麓から見える側）・高さ六m余り
  // 頂の木曽勢の柵（峠道を塞ぎ、道の所だけ口を開ける）と、その後ろの木曽の幟
  for (const seg of [[tx - 30, tz + 8, tx - 3, tz + 6], [tx + 3, tz + 6, tx + 26, tz + 9]]) sc.add(palisade(W, seg));
  for (const dx of [-22, -12, 10, 20]) sc.add(nobori(W, tx + dx, tz + 2, 'kiso', 6));
}

export const d13_toriitoge = lightBattle({
  id: 'd13_toriitoge',
  date: '天正十年（1582）二月　雪　信濃国 鳥居峠',
  intro: '木曽義昌が織田に寝返った。今福昌和の手と共に雪の鳥居峠を登り、木曽勢を討て。',
  history: '天正十年（1582）二月、木曽義昌が織田へ寝返ると、勝頼は今福昌和らを木曽へ送った。木曽勢は織田の援けを得て、雪の鳥居峠で武田勢を破った。これを合図に、織田信長の甲州征伐が始まる。',
  sides: { a: { name: '今福昌和の手', mon: 'takeda', faction: 'takeda' }, b: { name: '木曽義昌の手', mon: 'kiso', faction: 'kiso' } },
  force: { a: 3000, b: 3000 },
  allyLook: TAKEDA, foeLook: KISO,
  minutes: 14,
  playerTaken: 0.3,   // 11/26 ヌ三：235秒で倒れたので0.45→0.3。前の 11/21 cloud-10（章の通し二回目：組の無い足軽の本人が囲まれ50〜131秒で倒れた）。敵は変えず、本人の受ける傷の割合だけ 0.6→0.45
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  world: {
    seed: 1582, time: 'day', snow: 0.5, winter: true, overcast: true, fogFar: 320,
    hills: [[0, 10, 60, 30], [60, 40, 40, 22], [-70, 40, 50, 20], [0, 160, 40, 6], [-48, -8, 24, 40], [42, -18, 20, 40]],
    // 11/21 cloud-19（K563 地形・手書き。標高の asset が来るまで）：峠の上り口・鳥居峠の頂・峠の脇の尾根・退き口 を結ぶ道と、丘の森（木の数は森の分を引いて同じ）
    paths: [{ pts: [[0, 160], [0, 140], [4, 96], [46, 40], [-6, 20]], w: 3 }],
    groves: [{ x: -70, z: 40, r: 25, n: 30, kind: 'sugi' }],
    trees: 610, tufts: 900,
    sky: { snowGround: 0.7 },   // 11/26 クラウドす K655：雪の峠（snow の降りだけで地面が緑のままだった）
  },
  setup: (rt) => { toriiDress(rt); },
  // 11/21 cloud-41（章の通し）：柵の前で四十余と鉄砲に、通しの足軽が44秒で命二割まで削られた。敵は変えず、味方の刃を〇・二五→〇・四五に（味方が柵の兵を受ける）
  // 11/21 cloud-41（章の通し）：味方が陣（z160）から出て本人だけが先に柵の四十余に着き、55秒で倒れた回がある。鉄砲衆は上り口、今福の手と槍衆は先手として峠の柵の前（TOGE+30）に既に取り付いている（それでも52秒で倒れた回があった）
  allies: [
    { name: '今福昌和の手', at: { x: SPAWN.x - 10, z: TOGE.z + 30 }, dmg: 0.45, list: [busho('今福昌和'), uS(4), uA(16)] },
    { name: '鉄砲衆', at: { x: SPAWN.x + 12, z: FUMOTO.z - 4 }, dmg: 0.45, list: [uS(1), uG(8)] },
    // 11/21 cloud-41（章の通し）：通しの本人（組の無い足軽）が柵の前と尾根の伏せで囲まれ97秒で倒れた回がある。敵は変えず、本人の脇に槍衆を一組
    { name: '武田の槍衆', at: { x: SPAWN.x + 2, z: TOGE.z + 32 }, dmg: 0.45, list: [uS(3), uA(16)] },
    { name: '武田の後の備', at: { x: SPAWN.x - 16, z: TOGE.z + 46 }, dmg: 0.3, list: [uS(3), uA(20)] },   // K722②：退き口の前の一息で甲斐へ逃げ戻る（nigeModoru）
  ],
  steps: [
    { kind: 'rest', dur: 14, heal: 0, say: [
      ['使番', '木曽義昌が織田へ寝返った！　峠を閉ざしたと', 3],
      ['今福昌和', '木曽の裏切り者を討ち、峠を押さえる', 3],
      ['組頭', '雪で足が取られる。列を乱すな', 2.8]] },
    { kind: 'move', at: FUMOTO, label: '峠の上り口', obj: '雪の道を峠の上り口まで進む', r: 12,
      say: [['物見', '峠の上に木曽の旗！', 2.6]] },
    // 11/26 クラウドか（K656 K658 十五分へ・467秒で短い）：木曽谷は道が一つで、雪の脇道は土地の者しか知らない。上り口で止まった武田の荷駄（兵糧）を、木曽の地侍が谷の脇道から突く
    { kind: 'rest', dur: 8, heal: 0.2, say: [['組頭', '御屋形様は、木曽の人質を新府で斬られたと。木曽はもう退かぬぞ', 3.2]] },
    { kind: 'hold', at: FUMOTO, label: '荷駄の列', obj: '雪の上り口で、谷の脇道から来た木曽の地侍から兵糧の荷駄を守る', r: 16, dur: 55,
      title: '荷駄の守り', sub: '雪の脇道を知る木曽の地侍',
      say: [['今福昌和', '兵糧を失えば雪の峠で飢える。荷駄を守れ！', 3]],
      waves: [
        { t: 5, say: ['物見', '谷の脇道から木曽の地侍！'], foes: [{ name: '木曽の地侍', from: { x: FUMOTO.x - 26, z: FUMOTO.z + 6 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の地侍 奥原' } }, uS(2), uA(12)] }] },
        { t: 28, say: ['組頭', '反対の沢からも来た！　荷駄の車を盾にせよ！'], foes: [{ name: '沢の地侍', from: { x: FUMOTO.x + 24, z: FUMOTO.z + 2 }, list: [uS(1), uA(10), uB(4)] }] }],
      reward: '荷駄を守り抜いた' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['今福昌和', '荷駄は無事じゃ。峠へ上るぞ', 2.8]] },
    // K652②（11/25 Sanae・10分に）：峠道の杉の間に木曽の物見が伏せ、上る武田の列を横から突いた（木曽谷の道は狭く、雪で列が延びた）
    { kind: 'fight', at: YABU, limit: 110, obj: '峠の中ほどの杉の間で、木曽の物見の伏せを払う', title: '杉の間', sub: '雪の杉林から木曽の物見',
      say: [['組頭', '杉の陰じゃ！　列を詰めよ！', 2.8]],
      foes: [
        { name: '木曽の物見', from: { x: YABU.x - 14, z: YABU.z - 8 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の物見頭 原' } }, uS(3), uA(16)] },
        { name: '杉の上の弓', from: { x: YABU.x + 12, z: YABU.z - 16 }, list: [uB(6)] }],
      reward: '杉の間の伏せを払った' },
    { kind: 'rest', dur: 8, heal: 0.4, say: [['今福昌和', '物見が出たなら、峠の上は待ち構えておる。息を整えよ', 3]] },
    { kind: 'fight', at: TOGE, obj: '峠の頂へ攻め上り、木曽勢の柵の前の兵を討つ', title: '鳥居峠', sub: '峠の上から木曽勢が槍を揃える',
      say: [['木曽の侍', '甲斐の者を峠から落とせ！', 2.6]],
      foes: [
        { name: '木曽の柵の兵', from: { x: TOGE.x, z: TOGE.z - 12 }, list: [uS(4), uA(22)] }],
      // 11/21 cloud-10（章の通し五回目：組の無い本人が峠の頂に着いた三十三秒に鉄砲の一斉射で四割を失い、柵の兵に囲まれ五十一秒で倒れた）。
      //   鉄砲の組は消さず、柵の兵と斬り合いが始まった後の新手（三十五秒）に回す
      later: [{ t: 35, say: ['物見', '柵の陰から鉄砲衆！　身を低く！'], foes: [{ name: '木曽の鉄砲', from: { x: TOGE.x + 12, z: TOGE.z - 18 }, list: [uG(7)] }] }],
      reward: '峠の柵の前で戦った' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TOGE.x + 14, z: TOGE.z + 16 }, obj: '峠の柵の脇の雪の窪で、木曽の弓を討つ', limit: 90,
      say: [['組頭', '雪の窪に弓がおる。射られる前に寄れ', 3.2]],
      foes: [{ name: '雪の窪の木曽の弓', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: TOGE.x + 14, z: TOGE.z + 16 }), list: [uS(1), uA(6), uB(5)] }],
      reward: '雪の窪の弓を討った' },
    // 11/21 cloud-41（章の通し）：通しの本人（組の無い足軽）が二つ目の段で深手を負い、三つ目の段の頭で倒れた。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['組頭', '柵の前は取った。息を継げ、傷を縛れ', 2.8], ['物見', '脇の尾根に人影！　伏せじゃ！', 2.6]] },
    { kind: 'fight', at: YOKO, obj: '脇の尾根から下りて来た伏せを押し返す', title: '伏せ', sub: '織田の援けの兵が尾根の陰から',
      say: [['物見', '横の尾根から織田の旗！', 2.8], ['今福昌和', '囲まれる前に押し返せ！', 2.8]],
      foes: [{ name: '尾根の伏せ', from: { x: YOKO.x + 10, z: YOKO.z - 10 }, list: [uS(6), uA(35)] }],
      reward: '尾根の伏せを押し返した' },
    // K652②：伏せを押し返した後、峠の頂の柵から木曽義昌の旗本が逆寄せに出た。武田は峠を取れず、退くことになる（『信長公記』）
    { kind: 'rest', dur: 8, heal: 0.35, say: [['物見', '峠の柵が開いた！　木曽義昌の旗本が下りて来る！', 3]] },
    { kind: 'hold', at: TOGE, label: '峠の頂', obj: '峠の頂で、木曽義昌の旗本の逆寄せを受ける', r: 16, dur: 65,
      title: '逆寄せ', sub: '木曽の旗本が柵を開けて打って出る',
      say: [['今福昌和', 'ここで押し返せば峠は取れる。踏みとどまれ！', 3]],
      waves: [
        { t: 5, say: ['木曽義昌', '甲斐の者を峠から落とせ！'], foes: [{ name: '木曽義昌の旗本', from: { x: TOGE.x, z: TOGE.z - 24 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の旗本 山村良候' } }, uS(4), uA(18)] }] },
        { t: 32, say: ['組頭', '織田の援けの鉄砲も来た！'], foes: [{ name: '遠山の鉄砲', from: { x: TOGE.x + 18, z: TOGE.z - 20 }, list: [uG(6), uS(2), uA(8)] }] }],
      reward: '峠の頂で逆寄せを受けた' },
    // 11/26 クラウドか（K656 K658）：木曽勢は雪の脇道から今福の旗本の脇へ回った（土地の者の道）。本人は先手から戻って大将の脇を固め、その間に退く手筈を付ける
    { kind: 'rest', dur: 8, heal: 0.4, say: [['物見', '今福様の旗の脇に木曽勢！　雪の脇道から回ったぞ！', 3]] },
    { kind: 'fight', at: { x: TOGE.x - 6, z: TOGE.z + 44 }, limit: 100, obj: '今福昌和の旗の脇へ戻り、雪の脇道から回った木曽勢を討つ', title: '大将の脇', sub: '雪の道を知る木曽勢が旗本の脇へ',
      say: [['今福昌和', '大将の旗を倒させるな！　寄れ、寄れ！', 3]],
      foes: [{ name: '脇道の木曽勢', from: { x: TOGE.x - 30, z: TOGE.z + 50 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の侍 上松' } }, uS(3), uA(16)] }],
      later: [{ t: 30, say: ['組頭', '杉の陰から弓！'], foes: [{ name: '脇道の弓', from: { x: TOGE.x - 34, z: TOGE.z + 38 }, list: [uB(5)] }] }],
      reward: '大将の旗を守った' },
    // 11/21 cloud-41（章の通し）：通しの本人が前の段で深手を負い、次の段の頭で倒れた回がある。段の間に手当ての一息（敵は変えず）
    { kind: 'rest', dur: 8, heal: 0.35, fn: nigeModoru, say: [['組頭', '伏せは押し返した。傷を縛れ、退き口へ', 2.8], ['物見', '後の備が峠を下りて行く……甲斐の方へ', 3]] },
    { kind: 'hold', at: NOKI, label: '退き口', obj: '退き口で追う木曽勢を食い止め、味方を峠から下ろす', r: 18, dur: 60, limit: 130,   // 11/27 クラウドか：act bot で一度 428秒延びた→上限
      title: '退き', sub: '峠は落とせなかった',
      say: [['今福昌和', '退け！　この雪では峠は取れぬ', 3]],
      waves: [{ t: 8, say: ['木曽義昌', '追え！　甲斐へ追い落とせ！'], foes: [{ name: '追う木曽勢', from: { x: NOKI.x, z: NOKI.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の組頭 千村' } }, uS(6), uA(32)] }] },
        { t: 30, say: ['組頭', '木曽の二の手が坂を下りて来る！'], foes: [{ name: '木曽の二の手', from: { x: NOKI.x + 20, z: NOKI.z - 44 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の組頭 山村' } }, uS(2), uA(18)] }] }],
      reward: '退き口で味方を下ろした' },
    // K652②：峠を下りた武田勢を、木曽の騎馬が谷沿いに回り込んで宿の口で待った。本人は宿の口を開けて、味方を甲斐の方へ退かせる
    { kind: 'rest', dur: 8, heal: 0.6, say: [['物見', '宿の口に木曽の騎馬！　谷沿いに回り込まれた！', 3]] },
    { kind: 'fight', at: NARAI, limit: 110, obj: '奈良井の宿の口で、回り込んだ木曽の騎馬を払い、退く道を開ける', title: '奈良井の宿', sub: '雪の宿場の口を木曽勢が塞ぐ',
      say: [['今福昌和', '道を開けよ！　ここで止まれば皆討たれる', 3]],
      foes: [
        { name: '宿の口の木曽勢', from: { x: NARAI.x + 6, z: NARAI.z + 14 }, list: [{ type: 'samurai', n: 1, o: { name: '木曽の組頭 千村' } }, uS(4), uA(18)] },
        { name: '宿の屋根の弓', from: { x: NARAI.x - 12, z: NARAI.z + 10 }, list: [uB(6)] }],
      later: [{ t: 38, say: ['組頭', '谷から騎馬が来る！'], foes: [{ name: '木曽の騎馬', from: { x: NARAI.x + 44, z: NARAI.z + 10 }, list: [{ type: 'cavalry', n: 4 }, uS(2), uA(8)] }] }],
      reward: '奈良井の宿の口を開けた' },   // 11/27 クラウドか：宿の口を戦場の内へ移した時、騎馬の出が本人の20m 脇になり act bot が倒れた→谷の東 45m から
  ],
  win: {
    banner: '鳥居峠 退き口を守る', sub: '峠は木曽勢の手に。織田の甲州征伐が始まる', award: '退き口で味方を下ろした',
    say: [['使番', '織田信忠の大軍が、伊那口から攻め入ったと！', 3.2],
      ['組頭', '甲斐が、攻められる番か', 3],
      ['今福昌和', '敵の国へ攻め込んだ武田が、初めて自分の国へ逃げ戻る……', 3.4]],
  },
});
export default d13_toriitoge;
