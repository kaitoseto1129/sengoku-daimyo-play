// 武田編 三戦目「三増峠の戦い」（永禄十二年〔1569〕十月六日）。軽い型（light_battle.js）（K563・docs/chapter_takeda.md）
//   史実：信玄は小田原城を囲んだ後、甲斐へ退く途中の三増峠で、北条氏照・氏邦の二万に待ち伏せられた。
//   信玄は峠を越える荷駄を守らせつつ、山県昌景の別働隊を志田峠から北条の背へ回し、挟んで破った。武田方も浅利信種が討死（『甲陽軍鑑』・愛川町の史跡の案内）。
//   主人公は荷駄を守る足軽。
// 11/21 cloud-41：act bot で討ち取り4〜7・四分より短い戦があったので、敵の組の足軽を一・六倍・侍を一人ずつ足した（K467「敵は一気に大勢で来る」）
// 11/21 cloud-10（司令塔「本人の討ち取り5以上・4〜7分」）：受けの段の始めの組に、討てる名のある組頭を一人ずつ混ぜた（d12 と同じ形・busho の討てない将は使わない）
import * as THREE from 'three';
import { tawara, nobori } from './props.js';
import { lightBattle, uS, uA, uG, uB, busho } from './light_battle.js';
import { isEn, addEn } from './i18n.js';
if (isEn()) import('./i18n_en_takeda.js').then((m) => addEn(m.default)).catch(() => {});   // K516 英語の時だけ武田編の字の表を読む

const TAKEDA = { flag: 'takeda', armor: 0x502b24 };
const HOJO = { flag: 'hojo', armor: 0x2a2826 };
const SPAWN = { x: 0, z: 140 };
const KONIDA = { x: 4, z: 96 };       // 荷駄の列（峠道の上り口）
const SAKA = { x: -10, z: 36 };       // 峠の坂の中ほど
const TOGE = { x: 0, z: -24 };        // 三増峠の上
const TEPPO = { x: 34, z: 66 };        // 荷駄の列の東の林（浅利信種を撃った北条の鉄砲衆・K652②）
const KOE = { x: 4, z: -72 };         // 峠を越えた北の下り口（遅れて来た北条氏政の先手を受ける所・K652②）
// 11/27 クラウドす K722②「退く軍が一斉に向き直る」：前は台詞だけで、絵では誰も退いても向き直ってもいなかった。
//   本物の兵の「武田の本隊」（allies の四つ目）を峠の坂から麓へ、北条に背を向けてゆっくり退かせ、
//   「全軍、止まれ！北条へ向き直れ！」の段で止めて峠へ向き直らせ、坂の段の後ろへ押し出す。荷駄の守りと先手も同じ時に峠へ向く
const HONTAI = 3, HONTAI_FROM = { x: -16, z: 28 }, HONTAI_BACK = { x: -30, z: 78 };
const hontaiBack = (rt) => { const g = rt.flags.allies?.[HONTAI]; if (!g?.count) return; g.order = 'move'; g.dest = { ...HONTAI_BACK }; g.speed = 0.9; g.noRun = true; };
const hontaiTurn = (rt) => {
  const A = rt.flags.allies || [];
  for (const i of [0, 1]) { const g = A[i]; if (!g?.count) continue; const c = g.center(); g.facing = Math.atan2(TOGE.x - c.x, TOGE.z - c.z); }
  const g = A[HONTAI]; if (!g?.count) return;
  g.noRun = false; g.speed = 2.2; g.order = 'move'; g.dest = { x: SAKA.x - 8, z: SAKA.z + 14 };
};

// 11/25 K651（kaito「家どうしの同じ戦も一つの戦場に」）：三増峠の地面（峠・両の尾根の杉・峠道）。北条編 h05 も同じ戦場を使う
export const MIMASE_LAND = {
  seed: 1569, marchMist: 60, marchMistFar: 80, time: 'day', autumn: true, fogFar: 380,
  hills: [[0, -40, 70, 30], [-110, -10, 70, 34], [110, -30, 70, 30], [70, -70, 40, 22], [-60, 90, 50, 12],
    // 11/26 クラウドわ K655（窓口「峠でなく平らな野」）：峠道の両の肩の尾根。前は峠の上が丸い丘の頂で、麓から見て鞍部に見えなかった。
    //   道の西と東に肩を立て、峠道が二つの尾根の間の低い所を抜ける形に。戦う所（坂・峠・林の鉄砲・下り口）は肩の裾の外で高さはほぼ同じ
    [-50, 0, 28, 30], [48, 10, 26, 28]],
  // 11/21 cloud-19（K563 地形・手書き）：峠道は麓の荷駄の列から坂の中ほどを折れて峠へ上る。両の尾根は丹沢の東の裾の杉と雑木の森
  paths: [{ pts: [[0, 190], [0, 140], [4, 96], [-14, 64], [-10, 36], [8, 8], [0, -24], [0, -80]], w: 3 }],
  groves: [{ x: -70, z: 10, r: 30, n: 36, kind: 'sugi' }, { x: 70, z: -10, r: 30, n: 36, kind: 'sugi' }],
  trees: 610, tufts: 1600,
};

// 11/26 せ K655：三増峠と分かる物。前は杉の丘と兵だけで、どこの峠とも分からなかった。
//   この戦の芯は「小田原から甲斐へ帰る武田の荷駄の長い列が、峠道で待ち伏せられた」こと（『甲陽軍鑑』B・愛川町の解説 C）。
//   峠道の中ほどから麓へ、荷駄の車（台と二つの輪・俵を積む）と下ろした俵の山を道の脇に連ね、列の守りの武田の幟と、
//   峠の上の北条の陣の幟を立てる。物は道の脇だけ（当たりは付けない＝遊びは前と同じ）。車は一つの形を InstancedMesh で使い回す
// 11/26 クラウドさ K655：武田編 d03 も同じ荷駄の列を使う（ここへ移した）。hx,hz＝峠の上の北条の陣の幟の所
export function konidaDress(rt, hx = 0, hz = -46) {
  const W = rt.world, h = (x, z) => (W.heightAt(x, z) || 0);
  const road = [[4, 96], [-14, 64], [-10, 36]];   // MIMASE_LAND の峠道の折れ目（麓→坂の中ほど）
  const at = (t) => { const k = Math.min(road.length - 2, Math.floor(t * (road.length - 1))), f = t * (road.length - 1) - k, a = road[k], b = road[k + 1];
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) }; };
  // 荷車：台（板）・二つの輪・積んだ俵三つを一つの形に
  const parts = [], wood = new THREE.MeshStandardMaterial({ color: 0x5a4430, roughness: 0.95 }), straw = new THREE.MeshStandardMaterial({ color: 0xc2aa72, roughness: 1 });
  const bed = new THREE.BoxGeometry(1.5, 0.16, 2.6); bed.translate(0, 0.78, 0);
  const wheel = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 12); wheel.rotateZ(Math.PI / 2);
  const w1 = wheel.clone().translate(-0.86, 0.62, 0.2), w2 = wheel.clone().translate(0.86, 0.62, 0.2);
  const shaft = new THREE.BoxGeometry(0.1, 0.1, 2.2); const s1 = shaft.clone().translate(-0.5, 0.74, 2.3), s2 = shaft.clone().translate(0.5, 0.74, 2.3);
  const bale = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10); bale.rotateZ(Math.PI / 2);
  const bales = [bale.clone().translate(-0.32, 1.16, -0.6), bale.clone().translate(0.32, 1.16, -0.6), bale.clone().translate(0, 1.16, 0.3), bale.clone().translate(0, 1.62, -0.15)];
  const N = 9, cartW = new THREE.InstancedMesh(mergeGeo([bed, w1, w2, s1, s2]), wood, N), cartS = new THREE.InstancedMesh(mergeGeo(bales), straw, N);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < N; i++) {
    const p = at(0.04 + i * 0.11), side = i % 2 ? 1 : -1, o = 3.2 + (i % 3) * 0.6;
    const x = p.x + Math.cos(p.yaw) * o * side, z = p.z - Math.sin(p.yaw) * o * side;
    e.set(0, p.yaw + (i % 4 === 3 ? 1.1 : 0.15 * side), i % 5 === 4 ? 0.35 : 0); q.setFromEuler(e);   // 幾つかは向きが乱れ、一つは傾く（突かれた列）
    v.set(x, h(x, z), z); M.compose(v, q, one); cartW.setMatrixAt(i, M); cartS.setMatrixAt(i, M);
  }
  cartW.castShadow = cartS.castShadow = true; cartW.name = 'mimaseCarts'; cartS.name = 'mimaseCartBales';
  rt.scene.add(cartW, cartS);
  // 下ろした俵の山（道の脇の数か所）
  for (const [t, side, n] of [[0.2, 1, 6], [0.48, -1, 5], [0.7, 1, 6], [0.92, -1, 4]]) {
    const p = at(t), x = p.x + Math.cos(p.yaw) * 5.5 * side, z = p.z - Math.sin(p.yaw) * 5.5 * side;
    rt.scene.add(tawara(W, x, z, p.yaw + 0.4, n, { solid: false }));
  }
  // 列の守りの武田の幟（道の脇）と、峠の上の北条の陣の幟
  for (const t of [0.1, 0.36, 0.62, 0.86]) { const p = at(t), x = p.x - Math.cos(p.yaw) * 7, z = p.z + Math.sin(p.yaw) * 7; rt.scene.add(nobori(W, x, z, 'takeda', 5.5)); }
  for (const dx of [-18, -10, 10, 18]) rt.scene.add(nobori(W, hx + dx, hz, 'hojo', 6));
}
function mergeGeo(list) {
  const pos = [], nor = [], idx = []; let base = 0;
  for (const g of list) { const P = g.attributes.position, Nn = g.attributes.normal;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(Nn.getX(i), Nn.getY(i), Nn.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + base); else for (let i = 0; i < P.count; i++) idx.push(i + base);
    base += P.count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); out.setIndex(idx);
  return out;
}

export const d03_mimasetoge = lightBattle({
  id: 'd03_mimasetoge',
  date: '永禄十二年（1569）十月六日　晴れ　相模国 三増峠',
  intro: '小田原を囲んだ帰り道。荷駄を引いて三増峠を越える武田の列を、北条の二万が峠で待ち伏せていた。',
  history: '永禄十二年（1569）、武田信玄は小田原城を囲んだ後、甲斐へ退く途中の三増峠で北条氏照・氏邦の軍に待ち伏せられた。信玄は荷駄を守らせながら山県昌景の別働隊を北条の背へ回し、挟んで破った。武田方でも浅利信種が討死した。',
  sides: { a: { name: '武田信玄の軍', mon: 'takeda', faction: 'takeda' }, b: { name: '北条氏照・氏邦の軍', mon: 'hojo', faction: 'hojo' } },
  force: { a: 20000, b: 20000 },
  allyLook: TAKEDA, foeLook: HOJO,
  friendsSend: 2,   // 段の始めに攻めに出す味方の組は本人に近い二組（全部出すと本人より先に討ち切る・一組では章の通しで本人が囲まれて倒れた回があった 11/21）
  minutes: 10,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: Math.PI },
  setup: (rt) => { konidaDress(rt, TOGE.x, TOGE.z - 16); hontaiBack(rt); },   // 11/26 クラウドさ K655：峠道の荷駄の列（h05 と同じ物）
  world: MIMASE_LAND,

  allies: [
    { name: '荷駄の守り', at: { ...KONIDA }, list: [busho('浅利信種', { mustLive: false, invuln: false }), uS(3), uA(16)] },
    { name: '武田の先手', at: { x: SPAWN.x + 14, z: SPAWN.z - 20 }, list: [busho('馬場信春'), uS(3), uA(16)] },
    { name: '武田の鉄砲衆', at: { x: SPAWN.x - 14, z: SPAWN.z - 12 }, list: [uS(1), uG(8)] },
    { name: '武田の本隊', at: { ...HONTAI_FROM }, face: 0, list: [uS(3), uA(24)] },   // K722②：北条に背を向けて麓へ退く（hontaiBack）→向き直る（hontaiTurn）
  ],
  steps: [
    { kind: 'rest', dur: 12, heal: 0, say: [
      ['馬場信春', '峠の上に北条の旗。待ち伏せじゃ', 3],
      ['武田信玄', '荷駄は捨てぬ。昌景は志田峠から回れ。わしらはここで北条を引きつける', 3.6]] },
    { kind: 'hold', at: KONIDA, label: '荷駄の列', obj: '峠道の荷駄を、坂から下りる北条から守る', r: 16, dur: 110,   // 11/21 cloud-50（司令塔：240秒より短い戦は受けの段を厚くして4分以上に）：60→110秒・三の波と四の波を足した
      title: '待ち伏せ', sub: '峠の上から北条勢が下りて来る',
      say: [['浅利信種', '荷駄の兵糧は甲斐の冬の命じゃ。一俵も渡すな！', 3.2]],
      waves: [
        { t: 4, say: ['北条の侍', '荷駄を奪え！'], foes: [{ name: '北条の先手', from: { x: KONIDA.x - 8, z: KONIDA.z - 40 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 大藤' } }, uS(4), uA(26)] }] },
        { t: 30, say: ['組頭', '横の林からも来るぞ！'], foes: [{ name: '北条の弓', from: { x: KONIDA.x + 30, z: KONIDA.z - 26 }, list: [uB(8), uS(2)] }] },
        { t: 58, say: ['浅利信種', '二の手が下りて来る！　荷駄の車を盾にせよ！'], foes: [{ name: '北条の二の手', from: { x: KONIDA.x - 26, z: KONIDA.z - 34 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 中山' } }, uS(3), uA(22)] }] },
        { t: 84, say: ['組頭', '後ろの道を塞ぎに回ったぞ！'], foes: [{ name: '北条の回り込み', from: { x: KONIDA.x + 18, z: KONIDA.z + 30 }, list: [uS(3), uA(16)] }] }],
      reward: '荷駄を守り抜いた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KONIDA.x - 14, z: KONIDA.z - 18 }, obj: '荷駄の脇の谷で、回り込んだ北条の足軽を討つ', limit: 90,
      say: [['組頭', '谷から北条が回った。荷駄に近づけるな', 3.2]],
      foes: [{ name: '回り込んだ北条の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: KONIDA.x - 14, z: KONIDA.z - 18 }), list: [uS(2), uA(12)] }],
      reward: '回り込んだ足軽を討った' },
    // K652②（11/25 Sanae・10分に）：浅利信種は北条の鉄砲に撃たれて討死した（『甲陽軍鑑』）。本人は東の林の鉄砲衆へ斬り込む
    { kind: 'rest', dur: 8, heal: 0.4, say: [['使番', '浅利様が東の林からの鉄砲に撃たれた……！', 3], ['馬場信春', '林の鉄砲を黙らせよ。荷駄が狙い撃ちにされる', 3.2]] },
    { kind: 'fight', at: TEPPO, limit: 120, obj: '東の林の北条の鉄砲衆へ斬り込み、黙らせる', title: '林の鉄砲', sub: '林の陰から北条の鉄砲が荷駄を撃つ',
      say: [['組頭', '火縄の光を目当てに走れ！　込める間に斬り込め！', 3.2]],
      foes: [
        { name: '北条の鉄砲衆', from: { x: TEPPO.x + 8, z: TEPPO.z - 10 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の鉄砲頭 富永' } }, uS(2), uG(8), uA(8)] },
        { name: '鉄砲の守りの槍', from: { x: TEPPO.x - 10, z: TEPPO.z - 16 }, list: [uS(2), uA(14)] }],
      later: [{ t: 40, say: ['組頭', '林の奥から新手！'], foes: [{ name: '林の新手', from: { x: TEPPO.x + 20, z: TEPPO.z - 20 }, list: [uS(3), uA(12)] }] }],
      reward: '林の鉄砲衆を黙らせた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TEPPO.x + 10, z: TEPPO.z - 16 }, obj: '林の奥で、鉄砲衆を守る北条の槍を斬り払う', limit: 90,
      say: [['組頭', '鉄砲の後ろに槍がおる。斬り払え', 3.2]],
      foes: [{ name: '鉄砲衆を守る北条の槍', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: TEPPO.x + 10, z: TEPPO.z - 16 }), list: [uS(2), uA(10)] }],
      reward: '鉄砲衆の守りを斬り払った' },
    { kind: 'rest', dur: 8, heal: 0.35, fn: hontaiTurn, say: [['組頭', '鉄砲は黙った。傷を縛れ、坂へ上るぞ', 2.8], ['武田信玄', '退くはここまで。全軍、止まれ！　北条へ向き直れ！', 3.4], ['物見', '退いていた味方が、一斉に北条の方へ向き直った！', 3]] },
    // 11/21 cloud-41（章の通し）：坂の段が385秒かかり725秒になった回がある。斬り合いの段に上限150秒（六割崩していれば済）
    { kind: 'fight', at: SAKA, limit: 150, obj: '坂の中ほどで、北条の二の手を押し返す', title: '峠の坂', sub: '坂の上の北条が槍を揃えて押して来る',
      say: [['使番', '浅利様、お討死……！　馬場様の備へ加われ！', 3.2]],
      foes: [{ name: '北条氏邦の手', from: { x: SAKA.x, z: SAKA.z - 16 }, list: [busho('北条の侍大将', { mustLive: false, invuln: false }), uS(5), uA(29)] }],
      reward: '坂で北条を押し返した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: SAKA.x + 10, z: SAKA.z - 18 }, obj: '坂の上の土塁の陰で、石を投げる北条の足軽を討つ', limit: 90,
      say: [['組頭', '土塁の陰から石が来る。回り込め', 3.2]],
      foes: [{ name: '土塁の陰の北条の足軽', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: SAKA.x + 10, z: SAKA.z - 18 }), list: [uS(2), uA(12)] }],
      reward: '土塁の陰の足軽を討った' },
    { kind: 'rest', dur: 8, heal: 0.5, say: [['組頭', '坂は押し返した。傷を縛れ。峠の上へかかるぞ', 2.8], ['物見', '山の側の山県殿の手が、北条の脇へ回り込んだ！', 3]] },   // K652②：段が増え、坂から息を継がずに峠の上へ入って倒れた回がある（act bot 11/25）
    { kind: 'fight', at: TOGE, limit: 150, obj: '回り込んだ山県の赤備えと、峠の上の北条を挟む', title: '赤備え', sub: '志田峠から山県昌景の赤備えが北条の背に現れる',
      say: [['物見', '志田峠に赤い旗！　山県様の備が北条の背へ！', 3.2], ['馬場信春', '今じゃ、挟め！', 2.6]],
      foes: [{ name: '北条氏照の本隊', from: { x: TOGE.x, z: TOGE.z - 8 }, list: [uS(6), uA(29), uG(4)] }],
      later: [{ t: 10, say: ['山県昌景', '赤備え、背から突け！'], foes: [] }],
      reward: '峠の上の北条を崩した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TOGE.x - 10, z: TOGE.z - 16 }, obj: '峠の上の旗の下で、北条の旗本の侍を討つ', limit: 90,
      say: [['組頭', '旗本が旗を守っておる。旗を倒せ', 3.2]],
      foes: [{ name: '北条の旗本の侍', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: TOGE.x - 10, z: TOGE.z - 16 }), list: [uS(4), uA(8)] }],
      reward: '北条の旗本の侍を討った' },
    // K652②：北条氏政の本隊は荻野まで来ていたが間に合わなかった。武田は峠を越え、追って来た氏政の先手を払って甲斐へ退いた（『甲陽軍鑑』）
    { kind: 'rest', dur: 8, heal: 0.7, say: [['物見', '南から北条氏政の本隊の旗！　荻野まで来ておりまする！', 3.2], ['武田信玄', '峠を越えよ。追う先手だけ払って甲斐へ帰る', 3.2]] },
    { kind: 'hold', at: KOE, label: '峠の下り口', obj: '峠の下り口で、追って来る北条氏政の先手を払い、荷駄を通す', r: 16, dur: 70,
      title: '退き', sub: '氏政の先手が峠を越えて追って来る',
      say: [['馬場信春', '荷駄が下り切るまで、ここを持て', 3]],
      waves: [
        { t: 5, say: ['北条の侍', '甲斐へ帰すな！　荷駄を奪え！'], foes: [{ name: '北条氏政の先手', from: { x: KOE.x + 4, z: KOE.z + 30 }, list: [{ type: 'samurai', n: 1, o: { name: '北条の組頭 笠原' } }, uS(2), uA(14)] }] },
        { t: 34, say: ['組頭', '峠の脇の道からも来る！'], foes: [{ name: '北条の脇の手', from: { x: KOE.x - 20, z: KOE.z + 24 }, list: [uS(1), uA(10), uB(4)] }] }],
      reward: '荷駄を峠の向こうへ通した' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: KOE.x + 4, z: KOE.z - 26 }, obj: '峠の北の道で、追い縋る北条の騎馬を払う', limit: 90,
      say: [['物見', '北条の騎馬が追い縋る！　荷駄の尻を守れ', 3.2]],
      foes: [{ name: '追い縋る北条の騎馬', from: ((p) => ({ x: p.x + (0), z: p.z + (-14) }))({ x: KOE.x + 4, z: KOE.z - 26 }), list: [busho('北条の騎馬の将', { mustLive: false, invuln: false }), uS(3)] }],
      reward: '追い縋る騎馬を払った' },
  ],
  win: {
    banner: '三増峠の勝ち', sub: '北条は崩れ、武田は荷駄と共に甲斐へ帰った', award: '三増峠で北条を破った',
    say: [['山県昌景', '北条は崩れた。追うには及ばぬ', 3],
      ['武田信玄', '浅利を失うた。だが荷駄は守った。甲斐へ帰るぞ', 3.4]],
  },
});
export default d03_mimasetoge;
