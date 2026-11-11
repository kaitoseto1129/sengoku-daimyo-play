// ======================================================================
// 本能寺の変　本堂の縁（docs/kaito_honnoji_scene_1110.md・kaito 11/10「寺の中で弓と槍で応戦」）
// 本堂へ退いた後、すぐ外陣へ入らず：東の縁に白小袖の上様が立ち、弓を引く（『信長公記』：弓を二つ三つ取り替え、皆弦が切れた）。
// 小姓衆は縁に並ぶ。中庭は桔梗の旗の明智勢で埋まり、一気に縁へ押し寄せる。弦が切れて槍、肘に傷を受けて奥へ。
// 終わると元の「本堂の外陣で上様を守る」段（p5）へ。勝ちは刻を稼ぐ事（全滅させる事ではない）。
// 入れ方：b_honnoji.js で wrap(honnoji, K) を一度。def.p5 を包む。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, hashigo, paintGeo, WOOD_MAT } from '../props.js';
import { FL, addDeck } from '../floors.js';
import { allyGroup } from '../bhelp.js';
import { k15Freeze, k15Heal, k15Off, k15Go, k15Scenes, k15Track } from '../oda15_kit.js';

const EN = { x: -46.4, z: 46 };      // 本堂の東の縁（上様の立つ所）
const FRONT = { x: -43.6, z: 46 };   // 縁の下（木階の足もと。プレイヤーが受ける所）

export function wrap(def, K) {
  const p5 = def.p5;
  def.p5 = function (r) {
    const F = r.flags;
    if (F.ending || r.over || !r.player.u.alive) return;
    if (F.koen && F.koen.hall.rec.state === 2) dropKoen(F);   // 本堂が焼け落ちたら高縁も落とす
    if (k15Off(r) || F.enDone || (F.hp || 0) >= 5 || !F.nb?.alive) return p5.call(this, r);
    if (F.k15stage === 'en') return;
    start(r, K, () => { k15Heal(r); F.enDone = true; F.k15on = false; F.k15stage = null; p5.call(this, r); });
  };
}

// 本堂の東の高い縁（kaito 11/10 の絵：中庭から見上げる回廊）。堂の床は地面と同じ高さのまま、縁だけを
// 一段（約八十五センチ）持ち上げ、縁の下の束と框を見せる。中庭からも堂の中からも歩いて上がれる高さ（floors.js の 0.9m）に収め、
// 兵の通り道は変えない。一度だけ作り、本堂が焼け落ちたら片付ける。
const KOEN = { x0: -47, x1: -45.75, z0: 40, z1: 52 };
function koen(rt) {
  const F = rt.flags;
  if (F.koen) return;
  const hall = F.T?.halls?.find((h) => h.H.id === 'hondo');
  if (!hall || hall.rec.state === 2) return;
  // 本堂ごと基壇で持ち上げてある時（honno_tera.js の lift）は、元の縁がもう高い。足さずにその高さを使う。
  if (hall.H.lift) { F.koen = { hall, mesh: null, deck: null, top: hall.rec.y0 + .095 }; return; }
  try {
    const W = rt.world, y0 = hall.rec.y0;
    let low = Infinity;
    for (let z = KOEN.z0; z <= KOEN.z1; z += 1) low = Math.min(low, W.heightAt(KOEN.x1 + .4, z));
    const top = Math.min(y0 + .85, low + .85);
    if (top < y0 + .35) return;   // 庭が堂より高い所では持ち上げない
    const P = [], w = KOEN.x1 - KOEN.x0, d = KOEN.z1 - KOEN.z0, cx = (KOEN.x0 + KOEN.x1) / 2, cz = (KOEN.z0 + KOEN.z1) / 2;
    const box = (bw, bh, bd, x, y, z, c) => { const g = new THREE.BoxGeometry(bw, bh, bd); g.translate(x, y, z); P.push(paintGeo(g, c)); };
    // 縁板（一枚ずつ少し色を違える）と、外の縁框・木口
    for (let z = KOEN.z0, i = 0; z < KOEN.z1 - .01; z += .3, i++) box(w, .06, .28, cx, top - .03, z + .15, i % 3 ? 0x6a5238 : 0x5e4830);
    box(.14, .16, d, KOEN.x1 - .07, top - .1, cz, 0x4a3826);
    for (const z of [KOEN.z0, KOEN.z1]) box(w, .16, .14, cx, top - .1, z, 0x4a3826);
    // 縁の下：暗い奥と、束と束石
    box(.04, top - y0, d - .2, KOEN.x0 + .3, (top + y0) / 2 - .1, cz, 0x15110c);
    for (let z = KOEN.z0 + .2; z <= KOEN.z1 - .19; z += 1.5) {
      const g0 = Math.min(W.heightAt(KOEN.x1 - .2, z), y0) - .05;
      box(.12, top - .16 - g0, .12, KOEN.x1 - .2, (top - .16 + g0) / 2, z, 0x3e2f20);
      box(.26, .12, .26, KOEN.x1 - .2, g0 + .04, z, 0x7e7a70);
    }
    const mesh = new THREE.Mesh(mergeGeometries(P), WOOD_MAT());
    mesh.castShadow = false; mesh.receiveShadow = true; mesh.userData.camBlock = true;
    rt.scene.add(mesh);
    const id = addDeck({ x0: KOEN.x0, x1: KOEN.x1, z0: KOEN.z0, z1: KOEN.z1, y: top, name: '本堂の高縁' });
    F.koen = { hall, mesh, deck: FL.decks[id], top };
  } catch (e) { /* 縁を上げられなくても段は続ける */ }
}
function dropKoen(F) {
  const k = F.koen; if (!k) return;
  if (k.mesh) { k.mesh.parent?.remove(k.mesh); k.mesh.geometry.dispose(); }
  if (k.deck) k.deck.y = -1e4;   // 床の表からは外さず、拾われない高さへ（id をずらさない）
  F.koen = null; F.koenGone = true;
}

// 明智勢が中庭から縁へ掛ける梯子。押し返すと外へ倒れる。足もとを支点に回すので、群れの根をそこへ置く。
const HASHIGO_Z = [41.4, 43.7, 50.6];
function hashigoKake(rt) {
  const k = rt.flags.koen; if (!k) return null;
  const W = rt.world, out = [];
  try {
    for (const z of HASHIGO_Z) {
      const fx = -43.2, fy = W.heightAt(fx, z), g = new THREE.Group();
      const m = hashigo({ x: fx, y: fy, z }, { x: KOEN.x1 + .05, y: k.top + .45, z });
      m.position.set(-fx, -fy, -z); g.position.set(fx, fy, z); g.add(m); rt.scene.add(g); out.push(g);
    }
  } catch (e) { /* 梯子を掛けられなくても段は続ける */ }
  return {
    fall(rt) {   // 外（中庭の側）へ倒す
      let t = 0;
      const step = () => {
        t = Math.min(1, t + .08);
        for (const g of out) g.rotation.z = -1.25 * t * t;
        if (t < 1) rt.after(.04, step, true);
      };
      step();
    },
    clear() { for (const g of out) { g.parent?.remove(g); g.traverse((o) => o.geometry?.dispose?.()); } },
  };
}

// 中庭を埋める桔梗の旗の林（kaito 11/10 の絵：旗指物が林のように立つ）。当たりの無い幟だけ。縁の段が済めば片付ける。
const HATA = [[-33, 41], [-33.5, 45], [-33, 49.5], [-33.5, 54], [-35.5, 43], [-36, 47.5], [-35.5, 52], [-37.5, 40.5],
  [-38, 44.5], [-38.5, 51], [-37.5, 55], [-40, 42], [-40.5, 53.5]];
function hataBayashi(rt) {
  const out = [];
  try {
    for (const [x, z] of HATA) { const n = nobori(rt.world, x, z, 'akechi', 5.6 + ((x * 7 + z) % 3) * 0.4); rt.scene.add(n); out.push(n); }
  } catch (e) { /* 旗を立てられなくても段は続ける */ }
  return () => { for (const n of out) n.parent?.remove(n); };
}

// 寺の側の侍（坊主頭の僧形・寝間着の侍）が中庭で必死に斬り合う（kaito 11/10 の絵）。中庭の真ん中に踏みとどまり、そこで倒れる。
function teraSamurai(rt) {
  const ko = (col, bozu) => ({ type: 'samurai', n: 1, o: { kosode: 1, honnoCloth: true, kosodeCol: col, obi: 0x30251c, bozu, flag: null, hat: 'none', horo: 0, horse: false } });
  try {
    const g = allyGroup(rt, { fixed: true, noGuard: true, name: '寺の侍衆', anchor: { x: -39.5, z: 47.5 }, facing: Math.PI / 2, width: 3, aggro: 9, noRout: true, fullStrength: true, formation: 'line' },
      [ko(0x2a2826, 1), ko(0x4a3a2c, 0), ko(0x24221f, 1)]);
    g.defMult = 1; g.hideFlags = true;
    (rt.flags.templeCourtiers ||= []).push(g);   // 寺を去る時の片付けに入れる
    return g;
  } catch (e) { return null; }
}

function start(rt, K, done0) {
  const F = rt.flags, W = rt.world;
  let clear = null;
  let ladders = null;
  const done = () => { clear?.(); clear = null; ladders?.clear(); ladders = null; done0(); };
  F.k15stage = 'en'; F.k15on = true;
  k15Freeze(rt, 'en');   // 前の段の時計を止める
  const stop = () => F.k15stage !== 'en' || F.ending || !rt.player.u.alive;
  const nbOk = () => F.nb?.alive;
  // 上様の傷は戻らない作り。縁の段で負うのは肘の一傷までにし、後の段（外陣・御殿）の重さを変えない。
  const nbHp0 = F.nb?.hp || 0;
  const wound = () => { const u = F.nb; if (u?.alive) u.hp = Math.max(u.hp, nbHp0 - u.maxHp * 0.15); };
  rt.banner('本堂の縁', '縁に立つ上様を守り、押し寄せる明智勢を食い止めよ');
  // 上様は東の縁へ出て、新しい弓を取る。小姓衆は上様のまわり（縁）に付く。
  if (!F.koenGone) koen(rt);
  K.nbSet(rt, 'E', { at: { ...EN } });
  if (nbOk()) K.nbWeapon(rt, 'bow');
  // 奥から上がる火と煙（本堂の裏の庫裏の方）
  try { W.addSmokeColumn(-60, 1, 40, { size: 2.4 }); W.addSmokeColumn(-62, 1, 52, { size: 2 }); } catch (e) { /* 煙を置けなくても続ける */ }
  const big = (name, list, extra = []) => K.akechi(rt, name, [[-36, 50], [-40, 46.5], ...extra, [FRONT.x + 1, FRONT.z]], list, { player: true, dmg: 0.6 });
  k15Scenes(rt, [
    [1, () => K.say(rt, '織田信長', '弓を持て。……次の弓じゃ', 3)],
    [3, () => K.say(rt, '森蘭丸', '縁を固めよ！　一人も上げるな！', 3)],
  ], () => k15Go(rt, 'en-front', FRONT, 3.5, '本堂の縁の下で、上様の前を守れ', '縁の下', () => {
    // 中庭を埋める明智勢が、一気に縁へ押し寄せる（小隊を一つずつ潰す形にしない）
    clear = hataBayashi(rt);
    ladders = hashigoKake(rt);
    teraSamurai(rt);
    const w1 = big('中庭を埋める明智勢', [K.uS(3), K.uA(10)], [[-42, 43]]);
    big('縁へ寄せる明智勢', [K.uA(6)], [[-42, 50]]);
    rt.army.play?.('eshout', { x: -38, z: 48 }, 1.2);
    K.say(rt, '小姓', '中庭が桔梗の旗で埋まった……！', 3);
    k15Track(rt, w1, '縁へ押し寄せる明智勢', { sec: 45, left: 3 }, () => k15Scenes(rt, [
      [0.2, () => {
        if (!ladders) return;
        ladders.fall(rt);
        K.say(rt, '森蘭丸', '梯子を突き倒せ！', 2.5);
      }],
      [1.5, () => {
        if (!nbOk()) return;
        K.nbWeapon(rt, 'spear');
        K.say(rt, '織田信長', '弦が切れた。……槍じゃ！', 3);
      }],
      [3, () => { if (nbOk()) K.say(rt, '織田信長', '光秀ぇ！', 2.5); }],
      [2.5, () => {
        const w2 = big('縁へ上がる明智の侍', [K.uS(4), K.uA(4)], [[-42, 46]]);
        K.say(rt, '森蘭丸', '侍衆が縁へ上がるぞ！　突き落とせ！', 3);
        k15Track(rt, w2, '縁へ上がる明智の侍', { sec: 40, left: 2, reward: '本堂の縁で上様の時を稼いだ' }, () => k15Scenes(rt, [
          [0.5, () => K.say(rt, '小姓', '上様、お肘に傷が……！', 3)],
          [3, () => { if (nbOk()) K.say(rt, '織田信長', '是非に及ばず。……奥へ入る。堂の内で防げ', 3.5); }],
          [3.5, () => {}],
        ], () => { wound(); done(); }, stop));
      }],
    ], null, stop));
  }, { limit: 40 }), stop);
}
