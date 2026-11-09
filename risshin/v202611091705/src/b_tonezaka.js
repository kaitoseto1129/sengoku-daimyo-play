import { useTerrain } from './asset_manifest.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { S as SETTINGS } from './settings.js';
import { pressureTick } from './battle_pressure.js';
import { retreatRequired as dangerRetreatRequired } from './battle_danger.js';
import { battleJin, installBattleJinkei } from './b_jinkei_layout.js';
// ======================================================================
// 織田家編　刀根坂の戦い（天正元年八月十三日）
// 小谷城を囲む信長に、朝倉義景が後詰に出てきた。大嵐の夜、信長は朝倉方の砦を落とし、
// 朝倉が陣を払って越前へ退くと見るや、自ら先に立って追った。刀根坂で追いついた織田勢は朝倉勢を崩し、
// 名のある者が多く討たれた。美濃を追われて朝倉に身を寄せていた斎藤龍興も、ここで討ち死にしたと伝わる。
// 足軽は信長の馬廻の供。①夜、信長について峠道を追う ②殿（しんがり）の一の手を破る
// ③山崎吉家・斎藤龍興の殿を破る ④刀根坂の峠を越え、街道から一乗谷の城下まで追う
// 向き：東の柳ヶ瀬から西北西の刀根坂・敦賀へ上る峠道（実の地図の向き）。
// ======================================================================
import { hut, dou, tawara, nobori, kagaribi, makeSimpleBatch, finalizeSimpleBatch, dorui, ishigaki, kabukimon, solidRect } from './props.js';
import { goten } from './castle_parts.js';
import { toneJourney, toneJourneyGroup } from './b_tonezaka_journey.js';
import { RANKS } from './state.js';
import { gauss, enemyGroup, allyGroup, unitPos } from './bhelp.js';
import { dress } from './b_inabayama.js';
import { distToPolyline, WIND_STATE, WIND_DIR, GUST } from './world.js';
import { demSample } from './dem.js';
import { rockShape } from './rock_shape.js';
import { leafTex } from './nature.js';
import { drawGroundAt } from './render_camera.js';
import { sightPoint, sightUnit, sightScreenUnit } from './battle_sight.js';
import { butaiTick, adoptGroup } from './butai.js';
import { fieldButai, routButai } from './b_yasen.js';
import { SWING } from './units.js';
import { flagBlocksView } from './units_flags.js';
import { isTouch } from './touch.js';
import { timeslipField } from './timeslip_field.js';
import { wayLitter, fallenHorses } from './gap_scene.js';
import { sfx, withPan } from './audio.js';
import { FL, deckAt } from './floors.js';
// 15分の構成（kaito 11/8 夜・docs/oda15_plan_1108.md 14）：段の中身は tonezaka/ に一段一ファイル
import { depthStart, depthTick, depthBot, rest as dpRest, hold as dpHold, move as dpMove } from './b_depth.js';
import { install as monomi } from './tonezaka/monomi.js';        // 0〜3分：朝倉の松明を物見
import { steps as kuzureSteps } from './tonezaka/kuzure.js';     // 6〜9分：狭い坂道で詰まる朝倉の列
import { steps as yoshikageSteps } from './tonezaka/yoshikage.js';   // 9〜12分：義景を追う・旗本の返し
import { install as yoin } from './tonezaka/yoin.js';
import { STAGES } from './stages.js';            // 終幕：一乗谷の火と勝鬨の余韻

// 止血した浅い手足の傷だけで、追撃が終わるまで退く札を出し続けない。
// 出血・深手は退避を続ける。傷による歩みや槍の弱りはそのまま残す。
function toneWoundRetreat(rt) {
  const u = rt.player.u;
  return !!(u.wounds?.bleed > 0.0001 || u.hp < u.maxHp * 0.3 ||
    u.woundSlow > 0.25 || u.armWound > 0.25);
}
function retreatRequired(rt) {
  return dangerRetreatRequired(rt) || !rt.over && rt.player.u.alive && toneWoundRetreat(rt);
}

// 捨て槍の長さ全体を描く地面へ合わせる。谷をまたいで宙に残る場所には置かない。
// 近場の飾りを並べ直す時だけ呼び、受け取った行列を使い回す。
function toneGroundSpear(W, x, z, rot, m) {
  const c = Math.cos(rot), s = Math.sin(rot), reach = 2.6;
  const a = drawGroundAt(W, x - c * reach, z + s * reach);
  const b = drawGroundAt(W, x + c * reach, z - s * reach);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const slope = (b - a) / (reach * 2), k = 1 / Math.hypot(1, slope);
  const h = (a + b) * 0.5;
  let low = Infinity, high = -Infinity;
  // 石突から穂先までを調べ、直線の柄を浮かせる深い窪みや土へのめり込みを避ける。
  for (let i = 0; i <= 8; i++) {
    const t = -2.3 + i * (4.9 / 8);
    const ground = drawGroundAt(W, x + c * k * t, z - s * k * t);
    if (!Number.isFinite(ground)) return false;
    const gap = ground - (h + slope * k * t);
    low = Math.min(low, gap); high = Math.max(high, gap);
  }
  if (high - low > 0.18) return false;
  m.set(c * k, -c * slope * k, s, x,
    slope * k, k, 0, h + high + 0.01,
    -s * k, s * slope * k, c, z,
    0, 0, 0, 1);
  return true;
}

// 向きと皺を直した後の隊旗で、胸への視線と画面中央の見通しを調べる。
// 近い敵の旗も対象にするが、倒れた旗と遠い軍勢の旗は残す。
function toneStandardBlocks(rt, s, viewAhead) {
  const d = s.userData.std, carrier = s.userData.carrier;
  if (!s.visible || d.down || !carrier ||
      Math.hypot(carrier.pos.x - rt.camera.position.x, carrier.pos.z - rt.camera.position.z) >= 14) return false;
  return flagBlocksView(d.cloth, rt.camera.position, rt.player.u.pos) ||
    flagBlocksView(d.cloth, rt.camera.position, viewAhead, 0.8);
}

// 下知の節目だけ合成の合図を鳴らす。道案内の札が変わるたびには鳴らさない。
function toneAdvanceCue(rt, kind, source) {
  const F = rt.flags;
  if (rt.over || F.ending || rt.t < (F.advanceCueAt ?? -99) + 30) return false;
  F.advanceCueAt = rt.t;
  const o = rt.objectives.find((q) => q.id === 'main');
  if (o) {
    o.cue = kind === 'susume' ? '合図：法螺貝と進み太鼓。馬廻に続け' : '合図：陣太鼓の早打ち。味方と敵を突き破れ';
    o.cueT = rt.t;
  }
  rt.army.playFar('sig_' + kind, source, 0.8);
  const step = F.step;
  rt.after(kind === 'susume' ? 3.2 : 4, () => {
    if (rt.over || F.ending || F.step !== step || !rt.player.u.alive) return;
    // 人声の録音へ渡さず、既存の合成の鬨を一度だけ重ねる。
    const p = kind === 'susume' ? F.nobuU.pos : F.late.center();
    withPan(rt.panAt(p), () => sfx('toki', 0.45 * rt.volumeAt(p)));
  });
  return true;
}

// 足軽大将ほどの身分：馬廻の足軽の一手を預かり、信長の脇を固めて追う
const hi = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// 構えを切り替える設定と、押し続ける設定で、札と急ぎの台詞をそろえる。
function toneGuardAction() {
  return isTouch ? '「構える」を押せ'
    : SETTINGS.guardToggle ? '右クリックで構えよ' : '右クリックを押し続けよ';
}

// 合流が済んだ後に、読み待ちの「待て」で兵を足止めしない。
// 台詞の記録と八秒の間引きは残し、今読む分だけを取り消す。
const TOWN_WAIT_LINE = /^(?:城下の道で、勝家の手を待て|敵へ構え、守り場で勝家の兵を迎えよ|敵へ構え、勝家の兵のそばへ寄れ|勝家の兵のそばへ寄れ)$/;
const INNER_WAIT_LINE = /あと[12一二]人|兵二人が揃うまで|勝家の兵のそばへ|味方と奥の道へ向かえ/;
// 合流後に古い「戻れ」を読ませ、前へ進む札と食い違わせない。
const CHASE_JOIN_LINE = /道をたどれ。味方の列へ戻るぞ|味方へ寄れ。列を揃えて進むぞ/;
const TOWN_JOIN_LINE = /敵は退いた。味方と城下へ進め|敵へ構え、味方へ戻れ|味方へ寄れ。共に城下へ進むぞ/;
const INNER_HOLD_LINE = /兵二人のそばで道を守れ|敵へ構え、兵二人と道を守れ/;
const INNER_GUARD_LINE = /^(?:敵へ構え、兵二人と道を守れ|敵へ構え、道を塞ぐ敵を味方と追い払え|あと[一二]人。敵を見て、勝家の兵のそばへ|敵へ構え、守り場で味方をあと[一二]人待て)$/;
const INNER_RESTART_LINE = /守り場を離れた。戻って守り直せ|味方が離れた。兵二人を呼び寄せ、守り直せ|敵が残る。味方と追い払い、守り直せ/;
// 使番や勝家の声も、届いた時に持ち場が変わっていれば読ませない。
const TONE_PHASE_ORDERS = new Map([
  ['朝倉が退くぞ！　馬廻、わしに続け！', 1],
  ['掛かれの貝じゃ！　味方と坂の敵を突き破れ', 2],
  ['道が開いた！　味方と坂の敵を突き破れ', 2],
  ['掛かれの貝だ！　味方と峠口の敵を追い払え', 3],
  ['首を追うな。味方と峠口の敵を追い払え', 3],
  ['掛かれの貝じゃ！　勝家の手と城下の道を押さえよ', 5],
  ['勝家の手に続け。城下の道を押さえよ', 5],
  ['奥の道で兵二人と守り通せ。離れたら守り直しじゃ', 6],
]);
function toneClearWaitSpeech(rt, pattern, staleOnly = false) {
  const H = rt.hud;
  for (let i = H.subQ.length - 1; i >= 0; i--) {
    const q = H.subQ[i];
    if (pattern.test(q.text) &&
        (!staleOnly || !rt.def.speechAllowed(rt, q.speaker, q.text))) H.subQ.splice(i, 1);
  }
  if (H.shownLine && pattern.test(H.shownLine.text) &&
      (!staleOnly || !rt.def.speechAllowed(rt, H.shownLine.speaker, H.shownLine.text))) {
    H.nextSub(); H.subT = 0; H.shownLine = null;
  }
}

// 11/6 fix3_tonezaka：実の地図の向きに合わせる。刀根越は近江の柳ヶ瀬から越前の刀根へ、西へ約6.2km・北へ約1.8km（西北西）に越える峠道
//   （国土地理院の地図。前は余呉→刀根坂の北向きで、峠道が実の向きと七十度ほどずれていた）。峠の先の一乗谷への追撃は北北東へ向く。
// 回転だけで道幅・距離・坂の高さ・兵の間隔を保つ。変換は配置時、逆変換は数値だけ。
const TURN = Math.atan2(6200, 1800), CS = Math.cos(TURN), SN = Math.sin(TURN);
const at = (x, z) => ({ x: x * CS + z * SN, z: z * CS - x * SN });
const xz = (x, z) => [x * CS + z * SN, z * CS - x * SN];
const along = (x, z) => x * SN + z * CS;
const NORTHWEST = at(0, -1), EAST = at(1, 0);
// 地形の元の座標と、実際に歩く北西向きの道を分ける。
const LOCAL_ROAD = [[4, 170], [0, 110], [-10, 60], [-4, 10], [10, -40], [6, -90], [-8, -140], [-4, -190], [-4, -240]];
const ROAD = LOCAL_ROAD.map(([x, z]) => xz(x, z));
const PASS = at(-6, -150);           // 刀根坂の峠
// 敦賀・府中を経る数日の追撃を、場の内に縮める。実際の距離・方角を表す道ではない。
const LOCAL_CHASE = [[-6, -150], [24, -160], [62, -148], [94, -128], [120, -104], [132, -80]];
const CHASE_ROAD = LOCAL_CHASE.map(([x, z]) => xz(x, z));
const STREET = at(62, -148), TOWN = at(120, -104), INNER = at(132, -80);
// 街道の曲がりにかかる家を西へ寄せ、奥への通りを空ける。家の当たりと火は同じ場所を使う。
// 人夫の背の荷（俵を縄で背負子に括った形）。形と材質は全員で共用する。
let porterLoadGeo = null, porterLoadMat = null;
const PORTER_LOAD = () => porterLoadGeo ||= (() => {
  const a = new THREE.CylinderGeometry(.2, .2, .62, 8); a.rotateZ(Math.PI / 2); a.translate(0, 1.42, -.26);
  const b = new THREE.BoxGeometry(.5, .08, .36); b.translate(0, 1.16, -.24);
  const g = mergeGeometries([a.toNonIndexed(), b.toNonIndexed()]); a.dispose(); b.dispose(); return g;
})();
const PORTER_MAT = () => porterLoadMat ||= new THREE.MeshStandardMaterial({ color: 0x8a7550, roughness: 1 });
// 退く人夫・足軽が落とした陣笠（浅い円錐を傾けて地に転がす）。準備時に一つの形へ合わせ、毎コマ作らない。
function droppedKasa(rt, spots) {
  const W = rt.world, parts = [];
  for (const [lx, lz, r] of spots) {
    const p = at(lx, lz), g = new THREE.ConeGeometry(0.36, 0.15, 12, 1, true);
    g.rotateZ(0.25 + (r % 1) * 0.9); g.rotateY(r); g.translate(p.x, W.heightAt(p.x, p.z) + 0.1, p.z);
    parts.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x2a2219, side: THREE.DoubleSide }));
  for (const g of parts) g.dispose();
  m.receiveShadow = true; rt.scene.add(m);
}
const TOWN_HOUSES = [[96, -108], [130, -120], [102, -78], [148, -96]].map(([x, z]) => xz(x, z));
// 下城戸の口（土地の向きの座標）と、城戸から見た町屋の置き場［街道に沿う歩, 横の歩］。前の四つは城戸の外、後ろの三つは内。
const TOWN_GATE = { x: 99.1, z: -123.3, tx: 0.735, tz: 0.678 };
const TOWN_MACHIYA = [[-28.4, 14.2], [-23.3, -7.1], [-14.4, -8.7], [-10.8, 10.9], [7, -10], [16.1, -10], [16, 10]];
const townMachiyaAt = (i) => { const [a, n] = TOWN_MACHIYA[i], k = TOWN_GATE; return xz(k.x + k.tx * a - k.tz * n, k.z + k.tz * a + k.tx * n); };
// 家の足元だけを均す。街道と山腹の起伏は残し、高い束の上に民家を浮かせない。
const HOME_PADS = [[-30, 70, 6, 4], [96, -108, 7, 5], [130, -120, 7, 5], [102, -78, 7, 5], [148, -96, 7, 5], [80, -102, 12, 10]];
// 刀根の里と、数日後の一乗谷の暮らしを分ける。民は兵の中心や峠の殿に置かない。
// 一乗谷の町屋・寺院は博物館の遺跡案内を参考にする。堂と避難路は縮めた場での推定。
// https://asakura-museum.pref.fukui.lg.jp/site/walk
// 避難路は家の外の谷筋・集落の脇。追撃の街道や城下の守り場を横切らない。
const PEOPLE_PATHS = [
  [[-43, 90], [-38, 114], [-32, 144], [-28, 176], [-28, 208]],
  [[94, -125], [106, -140], [150, -148], [190, -148], [218, -148]],
  [[166, -132], [190, -145], [218, -148]],
  [[160, -116], [180, -132], [210, -152], [230, -152]],
  [[72, -92], [72, -125], [84, -156], [96, -184], [96, -218]],
].map((path) => path.map(([x, z]) => xz(x, z)));
const PEOPLE_BANDS = [
  { ...at(-43, 78), kinds: ['farmer', 'farmer', 'woman', 'child', 'elder'], route: 0 },
  { ...at(99, -115), kinds: ['townsman', 'woman', 'child'], mode: 'inside', route: 1 },
  { ...at(156, -126), kinds: ['merchant', 'townsman', 'woman', 'child'], route: 2 },
  { ...at(152, -104), kinds: ['townsman', 'woman', 'child'], mode: 'inside', route: 3 },
  { ...at(80, -92), kinds: ['monk', 'monk', 'elder'], mode: 'inside', route: 4 },
].map((band) => ({ ...band, route: PEOPLE_PATHS[band.route].map(([x, z]) => ({ x, z })) }));
const peopleNear = (x, z) => PEOPLE_PATHS.some((path) => distToPolyline(x, z, path) < 4);
let homeHeights = null;
const chaseNear = (x, z) => distToPolyline(x, z, CHASE_ROAD);
const ODA = { flag: 'oda' };
const ASA = { flag: 'asakura' };

const FIRST_END = at(-4, 8);
const SAKA = at(4, -88);             // 刀根坂の中ほど（殿が構える坂）
// 国土地理院の標高（刀根坂。束0 の asset_dem_tonezaka.js）。ゲームの 1 を実の 3m に縮め、道の谷から離れた所の
// 尾根と沢の起伏だけを足す（道の上は手書きのまま：登れる坂は道だけ）
let tzDem = null;
let terrainDem = null;
let terrainFixed = false;
useTerrain('dem_tonezaka', (data) => { tzDem = data; terrainDem = null; terrainFixed = false; });
const DEM_XY = 3, DEM_OX = 900;
const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// 元の座標で、峠道の z における道の x。
function roadX(z) {
  for (let i = 0; i < LOCAL_ROAD.length - 1; i++) {
    const [x0, z0] = LOCAL_ROAD[i], [x1, z1] = LOCAL_ROAD[i + 1];
    if (z <= z0 && z >= z1) return x0 + (x1 - x0) * ((z0 - z) / (z0 - z1));
  }
  return z > LOCAL_ROAD[0][1] ? LOCAL_ROAD[0][0] : LOCAL_ROAD[LOCAL_ROAD.length - 1][0];
}
// 兵も主人公も長い移動では街道の折れをたどる。近い斬り合いでは行き先を保つ。
function chaseWay(army, u, want, keepLane = false) {
  // 主人公の案内は曲がりに近づいたら先へ送る。兵の列の細かな通り方は保つ。
  const bendReach = u.isPlayer ? 8 : 2;
  const z = along(u.pos.x, u.pos.z), end = along(want.x, want.z);
  const x = u.pos.x * CS - u.pos.z * SN, endX = want.x * CS - want.z * SN;
  // 峠から東へ曲がった街道は別の道。城下の兵を元の峠道へ戻さない。
  const chase = (x > 18 || endX > 18) && z < -58 && end < -58 &&
    (chaseNear(u.pos.x, u.pos.z) < distToPolyline(u.pos.x, u.pos.z, ROAD) ||
      chaseNear(want.x, want.z) < distToPolyline(want.x, want.z, ROAD));
  // 近い相手との槍合わせは保つ。山腹での短い退避は道順を省かない。
  if (!keepLane && Math.hypot(want.x - u.pos.x, want.z - u.pos.z) < 14 &&
      (chase || Math.abs(x - roadX(z)) <= 10 && Math.abs(endX - roadX(end)) <= 10)) return want;
  if (chase) {
    let from = 0, to = 0, fromD = Infinity, toD = Infinity, lane = 0;
    for (let i = 0; i < CHASE_ROAD.length - 1; i++) {
      const a = CHASE_ROAD[i], b = CHASE_ROAD[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((u.pos.x - a[0]) * dx + (u.pos.z - a[1]) * dz) / len2));
      const v = Math.max(0, Math.min(1, ((want.x - a[0]) * dx + (want.z - a[1]) * dz) / len2));
      const d = Math.hypot(u.pos.x - a[0] - t * dx, u.pos.z - a[1] - t * dz);
      const e = Math.hypot(want.x - a[0] - v * dx, want.z - a[1] - v * dz);
      if (d < fromD) { fromD = d; from = i; lane = Math.max(-2, Math.min(2, ((u.pos.x - a[0]) * dz - (u.pos.z - a[1]) * dx) / Math.sqrt(len2))); }
      if (e < toD) { toD = e; to = i; }
    }
    if (from === to) {
      if (!keepLane) return want;
      // 敗兵は最後の曲がりを過ぎても列の脇を保つ。同じ一点へ全員を吸い寄せない。
      const a = CHASE_ROAD[to], b = CHASE_ROAD[to + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
      const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
      q.x = want.x + dz / len * lane; q.z = want.z - dx / len * lane;
      return q;
    }
    let i = to > from ? from + 1 : from;
    if (Math.hypot(u.pos.x - CHASE_ROAD[i][0], u.pos.z - CHASE_ROAD[i][1]) < (u.isPlayer ? bendReach : 3)) i += to > from ? 1 : -1;
    i = Math.max(0, Math.min(CHASE_ROAD.length - 1, i));
    const a = CHASE_ROAD[Math.max(0, i - 1)], b = CHASE_ROAD[Math.max(1, i)];
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
    q.x = CHASE_ROAD[i][0] + dz / len * lane; q.z = CHASE_ROAD[i][1] - dx / len * lane;
    return q;
  }
  if (z < -150 || end < -150) return want;
  const lane = Math.max(-3, Math.min(3, x - roadX(z)));
  let next = end;
  if (Math.abs(x - roadX(z)) > 5) next = z;
  else if (end < z) {
    for (const p of LOCAL_ROAD) if (p[1] < z - bendReach && p[1] > end) { next = p[1]; break; }
  } else {
    for (let i = LOCAL_ROAD.length - 1; i >= 0; i--) {
      const p = LOCAL_ROAD[i];
      if (p[1] > z + bendReach && p[1] < end) { next = p[1]; break; }
    }
  }
  if (next === end && Math.abs(x - roadX(z)) <= 5) return want;
  const q = u._toneWay || (u._toneWay = { x: 0, z: 0, botRadius: 1 });
  const side = roadX(next) + lane;
  q.x = side * CS + next * SN; q.z = next * CS - side * SN;
  return q;
}
// 自動操作の退避先も、味方の列の脇へ収める。敵と反対というだけで山腹へ登らない。
function toneRetreatWay(rt, want) {
  if (rt.flags.step < 1 || rt.flags.step > 3) return chaseWay(rt.army, rt.player.u, want);
  const z = along(want.x, want.z), x = want.x * CS - want.z * SN;
  const side = roadX(z) + Math.max(-6, Math.min(6, x - roadX(z)));
  const q = rt.flags.retreatGuide || (rt.flags.retreatGuide = { x: 0, z: 0 });
  q.x = side * CS + z * SN; q.z = z * CS - side * SN;
  return chaseWay(rt.army, rt.player.u, q);
}
// 峠の敗兵は北西へ直進せず、曲がる街道を走る。城下の東への退き足は保つ。
// 行き先は兵ごとに使い回し、今いる列の脇を保って全員を道の中央へ集めない。
function toneFleeWay(army, u, want) {
  const x = u.pos.x * CS - u.pos.z * SN, z = along(u.pos.x, u.pos.z);
  if (u.team !== 1) return want;
  // 峠を越えた敗兵も街道の折れへ送る。元の道を延ばすと北の山腹へ走り続けてしまう。
  // 曲がった後も退路を覚え、境目で北向きへ戻らない。城下の奥では東へ抜ける。
  if (z < -146 && x < 18) u.toneChaseFlee = true;
  if (u.toneChaseFlee) {
    if (x < 128) return chaseWay(army, u, INNER, true);
    const q = u._toneFleeWay || (u._toneFleeWay = { x: 0, z: 0 });
    q.x = u.pos.x + EAST.x * 4; q.z = u.pos.z + EAST.z * 4;
    return q;
  }
  if (x >= 18 && z < -58) return want;
  const lane = Math.max(-2.8, Math.min(2.8, x - roadX(z)));
  // 道から押し出された者は斜めに戻る。足元を飛ばさず、四歩先へ向ける。
  const next = z - 4, side = roadX(next) + lane;
  const q = u._toneFleeWay || (u._toneFleeWay = { x: 0, z: 0 });
  q.x = side * CS + next * SN; q.z = next * CS - side * SN;
  return q;
}
// 道の両側の急な山腹。見えない壁は置かず、実際の傾斜を使う。
const KIRI = { z0: 16, z1: 104, off: 20 };
function kiriH(x, z) {
  const fz = sstep(KIRI.z0, KIRI.z0 + 8, z) * sstep(KIRI.z1, KIRI.z1 - 8, z);
  if (fz <= 0) return 0;
  return 6 * fz * sstep(KIRI.off - 2, KIRI.off + 10, Math.abs(x - roadX(z)));
}
function heightBase(wx, wz) {
  const x = wx * CS - wz * SN, z = along(wx, wz);
  if (!terrainFixed) { terrainDem = tzDem; terrainFixed = true; }
  let h = 0.5 * Math.sin(x * 0.04 + 0.3) * Math.cos(z * 0.03) + 0.35 * Math.sin(z * 0.07 + x * 0.03);
  // 道に沿って上る谷。両側は山
  // 11/8 critic60（八3・一8・二1「刀根坂なのに坂が無い」）：坂の勾配を一割一分から一割四分へ。峠（z=-150）の高さも同じ式で続ける
  h += z >= -150 ? Math.max(0, 120 - z) * 0.14 : Math.max(8, 37.8 + (z + 150) * 0.165);   // 城下の平らな谷底は前と同じ所（z=-331）から
  const d = distToPolyline(x, z, LOCAL_ROAD);
  h += Math.min(34, Math.max(0, d - 14) * 0.5);
  h += 16 * gauss(x, z, 70, -60, 2600) + 18 * gauss(x, z, -70, -100, 2600);
  h += kiriH(x, z);
  if (terrainDem && d > 55) {
    const sx = x * DEM_XY + DEM_OX, sz = z * DEM_XY;
    if (Math.abs(sx) < 1580 && Math.abs(sz) < 1580) h += sstep(55, 85, d) * Math.max(0, demSample(terrainDem, sx, sz) - 60) * 0.05;
  }
  // 元の峠と尾根を残し、その先だけ城下へ下る谷道にする。
  // 奥の道は北へ戻るため、城下の入口より南まで谷をつなぐ。
  // 終点だけ元の山腹へ戻すと、守り場の印が急斜面へ誘ってしまう。
  const blend = sstep(20, 54, x) * sstep(-58, -76, z);
  if (blend > 0) h += (31 + Math.min(22, Math.max(0, distToPolyline(x, z, LOCAL_CHASE) - 18) * 0.35) - h) * blend;
  return h;
}
function height(wx, wz) {
  let h = heightBase(wx, wz);
  if (!homeHeights) homeHeights = HOME_PADS.map(([x, z]) => heightBase(x * CS + z * SN, z * CS - x * SN));
  const x = wx * CS - wz * SN, z = along(wx, wz);
  let original = h, flatDistance = Infinity;
  for (let i = 0; i < HOME_PADS.length; i++) {
    const p = HOME_PADS[i];
    // 家の角を囲む格子点は水平に保ち、その外を丸い裾で山腹へ戻す。
    // 三歩で高さを戻す四角い台地を避ける。街道の足場は従来のまま保つ。
    const dx = Math.abs(x - p[0]) - p[2] / 2 - 5, dz = Math.abs(z - p[1]) - p[3] / 2 - 5;
    const edge = Math.hypot(Math.max(0, dx), Math.max(0, dz));
    flatDistance = Math.min(flatDistance, edge);
    original += (homeHeights[i] - original) * (1 - sstep(0, 3, Math.max(dx, dz)));
    if (edge < 14) {
      const skirt = 1 - sstep(0, 14, edge);
      h += (homeHeights[i] - h) * skirt;
    }
  }
  // 隣の家の裾が重なっても床下を傾けない。道と床下から離れた所だけを均す。
  const blend = sstep(0, 6, flatDistance) * sstep(8, 14, Math.min(distToPolyline(wx, wz, ROAD), chaseNear(wx, wz)));
  return original + (h - original) * blend;
}

// 戦える殿を数える。追撃の区切りでは残兵も本隊を追って退く。
const fighter = (u) => u.alive && !u.dying && !u.evacuatedWound && !u.fleeing && !u.woundOut && !u.gone && !u.noTarget;
const fighting = (g) => g && !g.routed && g.units.some(fighter);
function toneFootReset(u) {
  u.toneFootBeat = undefined;
  u.toneFootPhase = undefined;
  u.toneFootDir = undefined;
  u.toneFootTravel = 0;
  u.toneFootHiddenStep = undefined;
}
// 近い押し合い・追う列・敗走の脚の着地に泥と足音を合わせる。粒は既存の入れ物を使う。
function toneFootTick(rt) {
  const F = rt.flags, A = rt.army, p = rt.player.u.pos;
  if (rt.t < (F.toneFootAt || 0)) return;
  const sampleDt = rt.t - (F.toneFootSampleAt ?? rt.t);
  F.toneFootSampleAt = rt.t;
  F.toneFootAt = rt.t + 0.1;
  const count = A.units.length, start = F.toneFootCursor || 0;
  F.toneFootCursor = (start + 1) % Math.max(1, count);
  let first = null, second = null, firstD = Infinity, secondD = Infinity;
  let heard = null, heardD = Infinity;
  let speaker = null, speakerDue = Infinity, speakerD = Infinity;
  for (let i = 0; i < count; i++) {
    const u = A.units[(start + i) % count], g = u.group;
    if (!u.alive || u.dying || u.gone || u.isPlayer || u.isStruct || u.mounted ||
        u.climb || u.downed || u.woundOut || u.naka ||
        (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 > 16 ** 2 || Math.abs(u.pos.y - p.y) > 4) {
      // 範囲の外にいた間の移動を、戻った時の一歩として泥や音にしない。
      toneFootReset(u); u.toneFootX = undefined; u.toneFootY = undefined; u.toneFootZ = undefined;
      // 遠くにいた間の叫びを、再び近づいた瞬間へ持ち越さない。
      u.toneFleeVoiceAt = undefined;
      continue;
    }
    // 崩れた直後だけで終わらず、退く列の別の兵から時折声が届く。
    // 全体・隊・話者の間を空け、傷を受けている声には重ねない。
    const fleeing = !!(u.fleeing || g?.routed && !(u.routIn > 0));
    // 城下の避難民には兵の「退け」の声を割り当てない。足取りは同じ着地で拾う。
    const fleeVoice = fleeing && !u.civ && !g?.civ && u.type !== 'porter' &&
      !u.rearWound && !u.evacuatedWound;
    if (!fleeVoice) u.toneFleeVoiceAt = undefined;
    else if (u.toneFleeVoiceAt === undefined) {
      // 崩れた瞬間に一斉に叫ばず、息を継ぐ間を兵ごとに空ける。
      u.toneFleeVoiceAt = rt.t + 0.8 + (u.id * 0.61803398875 % 1) * 3.2;
    }
    // 殴られたり泥へ足を取られた時は、持ち直して息を継いでから叫ぶ。
    // 傷声が止まった瞬間に、待っていた敗走の声へ切り替えない。
    // 敗走で中断した装填の記録は残る。銃を抱えた逃げ足を装填中の息止めにしない。
    const interrupted = u.hit || u.dragging || u.dodging || u.recoil > 0 || u.flinchT > 0 ||
      u.stagger > 0 || u.slipT > 0 || u.pinT > A.time || u.contactFrozen ||
      u.lastHitT < 0.8 || u.cheer > 0 || u.atk || (u.reload && !fleeing) || u.fireT > 0 ||
      (u.swing && !u.swing.done);
    if (fleeVoice && interrupted) {
      u.toneFleeVoiceAt = Math.max(u.toneFleeVoiceAt, rt.t + 1.2 + (u.id % 5) * 0.23);
    }
    if (g && fleeVoice && !interrupted &&
        !(A._contactVoiceAt > A.time) &&
        rt.t >= (g.toneFleeVoiceAt || 0) && rt.t >= (u.toneFleeVoiceAt || 0) && rt.t >= (F.toneFleeVoiceAt || 0)) {
      // 長く声を出していない兵から拾い、同じ間だけ待った者なら近い声を選ぶ。
      // 最も近い一人が話し続けず、逃げる列の別の場所からも声が届く。
      const due = u.toneFleeVoiceAt;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (due < speakerDue || due === speakerDue && d < speakerD) {
        speaker = u; speakerDue = due; speakerD = d;
      }
    }
    // 押されて足が止まっても速度の値だけ残ることがある。泥は実際の踏み替えに合わせる。
    const dx = u.pos.x - (u.toneFootX ?? u.pos.x), dz = u.pos.z - (u.toneFootZ ?? u.pos.z);
    const dy = u.pos.y - (u.toneFootY ?? u.pos.y);
    // 横へ詰める骨の兵は腰と草鞋も回る。胸の向きで泥を置くと、着いた足の脇から噴いてしまう。
    const human = !!u.human?.root.visible && Number.isFinite(u.human.gaitClock);
    const footHeading = u.heading + (human ? u.human.gaitYaw || 0 : 0);
    // 曲がる前の足の向きも覚え、着地した時点の草鞋から泥を出す。
    const turn = Math.atan2(Math.sin(footHeading - (u.toneFootHeading ?? footHeading)),
      Math.cos(footHeading - (u.toneFootHeading ?? footHeading)));
    u.toneFootHeading = footHeading;
    u.toneFootX = u.pos.x; u.toneFootY = u.pos.y; u.toneFootZ = u.pos.z;
    const moved = Math.hypot(dx, dz);
    const speed = sampleDt > 0 && sampleDt < 0.35 ? moved / sampleDt : 0;
    const hidden = !!(u.offscreen || u.imp);
    // 見える姿へ戻った時は、止まっていた骨の時計と古い一歩をつながない。
    if (u.toneFootHidden !== hidden) toneFootReset(u);
    u.toneFootHidden = hidden;
    // 押し合いで滑った足も地を擦る。歩行の着地とは分け、一度擦ったら間を空ける。
    // 長い更新間隔や配置替えの移動は、足元の泥にしない。
    // 後列にも前列の押しが伝わる。直接狙う敵がいなくても、実際にずれた足は泥を擦る。
    const inContact = !fleeing && (u.target?.alive || u.contactBrace > 0.3);
    // 追手も敵を見つける前から泥を踏む。進軍中の実際の一歩だけを既存の枠へ渡す。
    const advancing = !u.civ && !g?.civ && u.type !== 'porter' && !!(g?.marching || u.moveTo);
    // 柄の反動がない肩同士の押し合いも拾う。進む足と同じ向きの押しは走行と区別する。
    // 実際のずれに押す力が乗り、自分の歩みより強い時だけ擦り足にする。
    const pushAlong = moved > 0 ? ((u.push?.x || 0) * dx + (u.push?.z || 0) * dz) / moved : 0;
    const walkAlong = moved > 0 ? ((u.mv?.x || 0) * dx + (u.mv?.z || 0) * dz) / moved : 0;
    const pressed = inContact &&
      (u._lineRecoil > 0.08 || u.contactFrozen || pushAlong > 0.2 && pushAlong > Math.max(0, walkAlong)) && u.moving < 0.8;
    // 被弾や回避で脚を崩している間は、位置のずれを草鞋の擦り足として扱わない。
    // 着地の時計も切り、踏ん張り直した最初の一回に古い歩調を重ねない。
    if (u.hit || u.stagger > 0 || u.dragging || u.dodging || u.pinT > A.time ||
        u.recoil > 0 || u.flinchT > 0) {
      toneFootReset(u); continue;
    }
    const scraping = (u.slipT > 0 || pressed) && speed >= 0.2 && speed < 7 && !u.dragging;
    // 押し戻される間は着地の時計を使わない。擦りの待ち時間にも足音を重ねない。
    if (scraping && rt.t < (u.toneScrapeAt || 0)) {
      toneFootReset(u); continue;
    }
    if (scraping && rt.t >= (u.toneScrapeAt || 0)) {
      toneFootReset(u);
    } else if (u.moving < 0.25 || speed < 0.2 || speed >= 7 || u.slipT > 0 || u.contactFrozen ||
        !(fleeing || inContact || advancing)) {
      toneFootReset(u); continue;
    }
    if (hidden) {
      // 背後へ走り抜けても足音は続く。描かない脚は進んだ距離で一歩を数える。
      // 背後の押し合いも擦れだけは聞かせる。着地音や見えない足の泥には替えない。
      const stride = (0.48 + Math.min(4, speed) * 0.1) * (0.94 + (u.id * 0.61803398875 % 1) * 0.12);
      const travel = (u.toneFootTravel || 0) + moved;
      u.toneFootTravel = scraping ? 0 : travel % stride;
      if (!scraping && travel < stride) continue;
      // 見えない兵も左右を踏み替える。二歩進んだ時は最後の着地だけ残す。
      const steps = Math.floor(travel / stride);
      u.toneFootHiddenStep = ((u.toneFootHiddenStep ?? u.id % 2) + steps) % 2;
      const distance = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 +
        Math.max(0, 0.9 - (rt.t - (u.toneHeardAt ?? -99))) * 36;
      if (distance >= heardD) continue;
      const since = scraping ? 0 : u.toneFootTravel / moved;
      u.toneStepX = u.pos.x - dx * since;
      u.toneStepY = u.pos.y - dy * since;
      u.toneStepZ = u.pos.z - dz * since;
      u.toneStepHeading = footHeading - turn * since; u.toneStepFoot = u.toneFootHiddenStep;
      if (scraping) {
        const lateral = (dx * Math.cos(footHeading) - dz * Math.sin(footHeading)) / moved;
        u.toneStepFoot = Math.abs(lateral) > 0.25 ? (lateral > 0 ? 0 : 1) : u.id % 2;
      }
      u.toneStepDX = dx / moved; u.toneStepDZ = dz / moved;
      u.toneStepSpeed = speed; u.toneStepGap = stride / speed; u.toneStepScrape = scraping;
      heard = u; heardD = distance;
      continue;
    }
    // 近い本物の兵は骨の歩調、軽い姿は腿の振りが端に来て膝が伸びる拍子で着地する。
    // 姿を切り替えた一回を着地として数えず、足が上がる時に泥を出さない。
    const phase = human ? u.human.gaitClock * 2 : (u.anim - Math.PI / 2) / Math.PI;
    const beat = ((Math.floor(phase) % 2) + 2) % 2, prev = u.toneFootBeat;
    // 歩きから走りへ移る間は、後退の構えが残っても脚の時計は前へ進む。
    // 構えの向きでなく、折り返しを除いた実際の歩調から接地する足を選ぶ。
    const phaseStep = phase - (u.toneFootPhase ?? phase);
    u.toneFootPhase = phase;
    const changed = u.toneFootHuman !== human;
    u.toneFootHuman = human;
    u.toneFootBeat = beat;
    // 前進から後ずさりへ移る折り返しは、同じ足を浮かせ直す途中。
    // 境を逆にまたいだだけでは踏み音や泥を重ねず、次の着地から拾う。
    const direction = human ? Math.sign(phaseStep) : (u.stepDir ?? 1) < 0 ? -1 : 1;
    const reversed = direction !== 0 && u.toneFootDir !== undefined && direction !== u.toneFootDir;
    if (direction !== 0) u.toneFootDir = direction;
    // 駆け足では一度の見回りに二歩進むことがある。左右が同じでも着地は拾う。
    // 過ぎた歩数をまとめて鳴らさず、最後に着いた一歩だけを既存の二人枠へ渡す。
    const crossed = Math.floor(phase) !== Math.floor(phase - phaseStep);
    if (!scraping && (changed || reversed || prev === undefined || !crossed || Math.abs(phaseStep) > 3)) continue;
    // 近い着地を優先しつつ、直前に泥を出した兵は少し譲る。
    // 同じ二人だけが泥を蹴り続けず、周りの踏み替えも既存の二人枠へ渡す。
    // 声の順番は巡回したまま。兵数・歩調・粒の上限は変えない。
    const distance = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 +
      Math.max(0, 0.65 - (rt.t - (u.toneLandingAt ?? -99))) * 64;
    u.toneStepScrape = scraping;
    // 見回りまでに進んだ分を戻し、実際に着いた場所へ泥を残す。
    // 逆回転と時計の折り返しでも、最後に境を越えた時点を使う。
    const since = scraping || Math.abs(phaseStep) < 1e-6 ? 0 : Math.min(1,
      (phaseStep > 0 ? phase - Math.floor(phase) : Math.ceil(phase) - phase) / Math.abs(phaseStep));
    u.toneStepX = u.pos.x - dx * since;
    u.toneStepY = u.pos.y - dy * since;
    u.toneStepZ = u.pos.z - dz * since;
    u.toneStepHeading = footHeading - turn * since;
    if (scraping) {
      // 滑る間は歩行の時計が止まる。押された向きの後ろ側の足が泥を擦る。
      // 前後へ押された時は兵ごとの構えを使い、止まった歩調で左右を替えない。
      const lateral = (dx * Math.cos(footHeading) - dz * Math.sin(footHeading)) / moved;
      u.toneStepFoot = Math.abs(lateral) > 0.25 ? (lateral > 0 ? 0 : 1) : u.id % 2;
    } else {
      // 骨の歩調は逆回転、軽い姿は時計を進めたまま脚の振りを反転する。
      // それぞれの後ずさりに合わせ、浮いている側から泥を出さない。
      const reverse = human ? phaseStep < 0 : (u.stepDir ?? 1) < 0;
      u.toneStepFoot = reverse ? 1 - beat : beat;
    }
    u.toneStepDX = dx / moved; u.toneStepDZ = dz / moved; u.toneStepSpeed = speed;
    u.toneStepGap = Math.abs(phaseStep) > 1e-6 ? sampleDt / Math.abs(phaseStep) : 0.6;
    // 泥を譲った兵も耳には近い。描く二人を絞る前に、着地した全員から足音を選ぶ。
    // すぐ隣の兵の音が続いても、周囲の着地へ少しずつ譲る。遠い音を優先はしない。
    // 背後の兵と見える兵を同じ物差しで選び、音の回数は増やさない。
    const audibleD = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2 +
      Math.max(0, 0.9 - (rt.t - (u.toneHeardAt ?? -99))) * 36;
    if (audibleD < heardD) { heard = u; heardD = audibleD; }
    if (distance >= secondD) continue;
    if (distance < firstD) {
      second = first; secondD = firstD; first = u; firstD = distance;
    } else { second = u; secondD = distance; }
  }
  if (speaker) {
    const u = speaker, n = u.toneFleeVoiceN = (u.toneFleeVoiceN || 0) + 1;
    const r = (u.id * 0.61803398875 + n * 0.754877666) % 1;
    // 疲れた敗兵は声が弱まり、同じ兵が叫び直す前に息を継ぐ。
    const fatigue = Math.max(0, Math.min(1, u.fat || 0));
    u.group.toneFleeVoiceAt = rt.t + 14 + r * 7;
    u.toneFleeVoiceAt = rt.t + 28 + r * 12 + fatigue * 8;
    F.toneFleeVoiceAt = rt.t + 8 + r * 6;
    // 近い押し合いの掛け声と息継ぎの間を共有する。退く声の直後にも叫びを重ねない。
    // 軍勢側の時計を使い、戦の経過時間と取り違えない。
    A._contactVoiceAt = A.time + 3 + r * 2;
    // 深手で息の上がった兵は声も弱める。話者を選び終えてから待ち時間を置く。
    const breath = (0.7 + 0.3 * Math.max(0, Math.min(1, u.hp / u.maxHp))) * (1 - fatigue * 0.25);
    // 家や柵だけでなく、街道の折れを隠す尾根でも声を弱める。話者一人だけ調べる。
    const shelter = A.wallBetween(u.pos, -1, p) || A.terrainBlocks(u.pos, p) ? 0.4 : 1;
    A.play('soldier_flee', u.pos, (0.4 + r * 0.15) * breath * shelter);
  }
  // 見える二人の泥と、背後も含めた近い一歩の音を、それぞれの枠へ渡す。
  if (first) toneFootLanding(rt, first, heard === first);
  if (second) toneFootLanding(rt, second, heard === second);
  if (heard && heard !== first && heard !== second && rt.t >= (F.toneFootSoundAt || 0)) {
    toneFootLanding(rt, heard, true, false);
  }
}
function toneFootLanding(rt, u, sound, particles = true) {
  const F = rt.flags, W = rt.world, speed = u.toneStepSpeed;
  const side = u.toneStepFoot % 2 ? 0.16 : -0.16;
  // 着いた足は腰の真下でなく進む側へ出る。後退・横歩きも実際の移動を使う。
  const reach = u.toneStepScrape ? 0 : Math.min(0.28, speed * 0.09);
  let x = u.toneStepX + Math.cos(u.toneStepHeading) * side + u.toneStepDX * reach;
  let z = u.toneStepZ - Math.sin(u.toneStepHeading) * side + u.toneStepDZ * reach;
  // 押し合いでは草鞋を前後に据えたまま腰だけがずれる。
  // 腰幅から推測した所でなく、実際に擦っている側の足から泥と音を出す。
  // 見える骨の兵の擦り足だけを調べ、歩行の過ぎた着地や背後の古い骨には使わない。
  const h = u.human;
  if (u.toneStepScrape && !u.offscreen && !u.imp && h?.root.visible) {
    const foot = h.bones?.[u.toneStepFoot % 2 ? 'RightFoot' : 'LeftFoot'];
    if (foot) {
      foot.getWorldPosition(F.toneFootPoint);
      // 姿の切り替え直後など、骨が兵の足元へ追いついていない時は従来の位置を保つ。
      const q = F.toneFootPoint;
      if ((q.x - u.pos.x) ** 2 + (q.z - u.pos.z) ** 2 < 1.2 ** 2 && Math.abs(q.y - u.pos.y) < 0.5) {
        x = q.x; z = q.z;
      }
    }
  }
  // 板床や階段の足音を、床下の泥・水しぶきにしない。
  const footY = W.heightAt(x, z);
  // 地面に近い縁や低い板床は、高さの差だけでは土と区別できない。
  // 着地した足だけ既存の床を調べ、床の下を通る兵には適用しない。
  const deck = FL.decks.length ? deckAt(x, z, u.toneStepY) : null;
  const deckY = deck === null ? -Infinity : FL.decks[deck].y;
  const onDeck = Math.abs(u.toneStepY - deckY) < 0.18 && deckY >= footY - 0.02;
  const onGround = !onDeck && Math.abs(u.toneStepY - W.heightAt(u.toneStepX, u.toneStepZ)) < 0.35 &&
    Math.abs(u.toneStepY - footY) < 0.35;
  // 段差を下りる途中の脚の拍子を着地音にしない。泥と音を同じ足場の判定へ揃える。
  if (!onGround && !onDeck) return;
  // 岸のごく浅い濡れ土は泥の踏み音にする。水音と水しぶきは同じ深さから切り替える。
  const depth = onGround && W.inWaterAt(x, z) ? W.waterDepthAt(x, z) : 0;
  const water = depth > 0.02;
  // 踏み出す足は後ろへ蹴り、押されて擦る足は滑る先へ泥を寄せる。
  if (particles && onGround && !SETTINGS.reduceMotion) {
    u.toneLandingAt = rt.t;
    const n = u.toneStepScrape ? 1 : Math.max(1, Math.min(3, Math.round(speed)));
    // 押し合いの小刻みな踏み替えと逃げ走りで、跳ね上がる高さを分ける。
    // 拍子だけ速い送り足もあるため、脚の時計でなく実際の移動の速さを使う。
    const weight = Math.max(0.2, Math.min(1, speed / 3));
    if (water) {
      // 蹄と共通の大きな跳ねを避け、草鞋の幅と擦り足の低さで水を払う。
      // 水面の輪と粒は既存の枠を使い、数を増やさない。
      const P = W.sprayP, waves = W.footWaves;
      if (P) {
        const y = footY + depth + 0.025, scrape = u.toneStepScrape;
        // 岸の薄い水膜では草鞋が押し出せる水も少ない。粒数を保ち、高さと広がりを水深へ合わせる。
        // 泥から水へ替わる境でも急に噴き上げず、擦り足は踏み下ろしより低く払う。
        const waterWeight = Math.min(1, Math.sqrt(depth / 0.18));
        if (waves) {
          const j = waves.i * 4;
          waves.data[j] = x; waves.data[j + 1] = y; waves.data[j + 2] = z;
          // 共通の波紋は残り時間から大きさを求める。短く始めると最初から大輪になる。
          // 着地から小さく広がる一周期を使い、波紋の枠や粒数は増やさない。
          waves.data[j + 3] = 0.85;
          waves.i = (waves.i + 1) % waves.age.count;
        }
        for (let j = 0; j < n; j++) {
          const i = P.i = (P.i + 1) % P.life.length, k = i * 3;
          const kick = (scrape ? 0.12 : -0.18) * Math.min(3, speed) * waterWeight;
          const scatter = (Math.random() - 0.5) * Math.min(0.3 * waterWeight, Math.abs(kick));
          P.pos[k] = x + (Math.random() - 0.5) * 0.14;
          P.pos[k + 1] = y; P.pos[k + 2] = z + (Math.random() - 0.5) * 0.14;
          P.vel[k] = u.toneStepDX * kick - u.toneStepDZ * scatter;
          const rise = (scrape ? 0.12 : 0.35 + Math.random() * 0.4) * weight * waterWeight;
          P.vel[k + 1] = rise;
          P.vel[k + 2] = u.toneStepDZ * kick + u.toneStepDX * scatter;
          P.life[i] = P.max[i] = (rise + Math.sqrt(rise * rise + 2 * 9 * 0.025)) / 9;
        }
      }
    }
    else if (W.mudP) {
      // 蹄用の広い跳ねを使わず、草鞋の幅から低く泥を払う。粒の数と入れ物は保つ。
      const P = W.mudP, y = footY, scrape = u.toneStepScrape;
      // 低い泥は坂にすぐ触れる。足元で一度だけ傾きを測り、粒ごとの地形探しはしない。
      const slopeX = (W.heightAt(x + 0.25, z) - W.heightAt(x - 0.25, z)) * 2;
      const slopeZ = (W.heightAt(x, z + 0.25) - W.heightAt(x, z - 0.25)) * 2;
      for (let j = 0; j < n; j++) {
        const i = P.i = (P.i + 1) % P.life.length, k = i * 3;
        const kick = (scrape ? 0.12 : -0.2) * Math.min(3, speed);
        // ばらつきは草鞋の横幅へ逃がす。弱い擦り足でも泥の向きを逆転させない。
        const scatter = (Math.random() - 0.5) * Math.min(0.16, Math.abs(kick));
        P.pos[k] = x + (Math.random() - 0.5) * 0.14;
        P.pos[k + 2] = z + (Math.random() - 0.5) * 0.14;
        P.pos[k + 1] = y + slopeX * (P.pos[k] - x) + slopeZ * (P.pos[k + 2] - z) + 0.035;
        P.vel[k] = u.toneStepDX * kick - u.toneStepDZ * scatter;
        const rise = (scrape ? 0.08 : 0.25 + Math.random() * 0.3) * weight;
        P.vel[k + 1] = rise;
        P.vel[k + 2] = u.toneStepDZ * kick + u.toneStepDX * scatter;
        // 坂を登る粒は早く接地し、下る粒は少し長く飛ぶ。泥が斜面を突き抜けない。
        const relativeRise = rise - slopeX * P.vel[k] - slopeZ * P.vel[k + 2];
        const landing = (relativeRise + Math.sqrt(relativeRise * relativeRise + 2 * 9 * 0.035)) / 9;
        // 寿命を先に切ると、坂下へ跳ねた泥が空中で消える。接地まで落とし切る。
        // 粒の枠と一歩の粒数は増やさず、同じ入れ物へ短い飛跡を戻す。
        P.life[i] = P.max[i] = landing;
      }
    }
  }
  if (u.toneStepScrape) {
    u.toneScrapeAt = rt.t + 0.6 + (u.id % 3) * 0.1;
  }
  if (sound && rt.t >= (F.toneFootSoundAt || 0)) {
    u.toneHeardAt = rt.t;
    // 実際の踏み替えの速さで間を取る。駆け足でも音の上限は従来の毎秒二回に保つ。
    // 二歩に一度だけ同じ足を拾う拍子を避け、兵ごとの歩幅で聞く間を少しずらす。
    // 音は着地の候補からだけ鳴らし、待ち時間そのものでは鳴らさない。
    const stride = 0.94 + (u.id * 0.61803398875 % 1) * 0.12;
    F.toneFootSoundAt = rt.t + Math.max(0.5, Math.min(0.85, u.toneStepGap * stride));
    const source = F.toneFootSoundPos || (F.toneFootSoundPos = { x: 0, y: 0, z: 0 });
    source.x = x; source.y = onDeck ? deckY : onGround ? footY + depth : u.toneStepY; source.z = z;
    // 敗走の声と同じく、家や塀・尾根を隔てた足音は弱める。鳴らす一歩だけ調べる。
    const shelter = rt.army.wallBetween(source, -1, rt.player.u.pos) ||
      rt.army.terrainBlocks(source, rt.player.u.pos) ? 0.4 : 1;
    // 押されて滑った草鞋は長めの擦れだけにし、踏み下ろす低音を重ねない。
    rt.army.play(u.toneStepScrape ? onDeck ? 'stepWoodScrape' : water ? 'stepWaterScrape' : 'stepScrape' : onDeck ? 'stepWood' : water ? 'wade' : onGround ? 'stepWet' : 'step',
      source, (u.fleeing || u.group?.routed ? 0.55 : 0.35) *
        Math.max(0.45, Math.min(1, speed / 2.2)) *
        (0.8 + 0.2 * Math.max(0, Math.min(1, u.hp / u.maxHp))) * shelter);
  }
}
// 殿を崩した跡の深手や倒れた兵は、追い手を囲む人数に含めない。
const toneCrowdFighter = (u) => fighter(u) && !u.rearWound && !u.downed && !u.dropped && !u.civ && !u.isStruct;
// 敵の気配は十八歩で知らせる。構える下知は槍の間合いに近づいてから。
const CLOSE_REAR = 18;
// 道案内の相手とは別に、目前の敵を確かめる。既存の周囲索敵を使い回す。
function toneCloseEnemy(rt) {
  const u = rt.flags.nearEnemy;
  return !!u && fighter(u) && !u.rearWound && !u.downed &&
    near(rt.player.u.pos, u.pos, CLOSE_REAR) && sightUnit(rt, u);
}
// 遠い兵も実際に見通せる時だけ敵として知らせる。霧と坂の判定は共通処理に任せる。
const VISIBLE_REAR = 60;
const GUARD_REAR = 6;
function toneGuardEnemy(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  // 打ち込みを受けた相手は、振り向く途中で画面外へ出ても四秒だけ覚える。
  // 視界に入るまで『進め』へ戻すと、背後から打つ敵へ背を向けさせてしまう。
  const attacker = F.guardEnemy;
  if (rt.t < (F.guardEnemyUntil || 0) && attacker && fighter(attacker) &&
      !attacker.rearWound && !attacker.downed && Math.abs(attacker.pos.y - p.y) < 3 &&
      near(p, attacker.pos, GUARD_REAR)) return attacker;
  for (let i = 0; i < 2; i++) {
    const u = i === 0 ? F.nearEnemy : F.guideEnemy;
    if (u && fighter(u) && !u.rearWound && !u.downed && Math.abs(u.pos.y - p.y) < 3 &&
        near(p, u.pos, GUARD_REAR) && sightScreenUnit(rt, u)) return u;
  }
  return null;
}
// 隊の中心には深手の兵も残る。今の持ち場で戦える兵へ道をたどる。
// 印の座標は使い回し、道の途中を敵の居場所として表示しない。
function toneGuide(rt, fallback) {
  const F = rt.flags, p = rt.player.u.pos;
  const defenders = F.stageDefenders[F.step] || [];
  let next = null, distance = Infinity;
  for (const g of defenders) {
    if (!fighting(g)) continue;
    for (const u of g.units) {
      if (!fighter(u) || u.rearWound || u.downed) continue;
      const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
      if (d < distance) { distance = d; next = u; }
    }
    // 今の任務の二つの備から近い兵を選ぶ。先の任務の備へは飛ばさない。
  }
  // 今の任務の敵だけを案内する。別の備の接近は危険の声で知らせる。
  const close = F.nearEnemy;
  if (close && defenders.includes(close.group) && fighting(close.group) &&
      fighter(close) && !close.rearWound && !close.downed &&
      near(p, close.pos, CLOSE_REAR) && sightScreenUnit(rt, close)) next = close;
  const enemyAt = next ? next.pos : fallback;
  const closeSeen = next && near(p, enemyAt, CLOSE_REAR) && sightScreenUnit(rt, next);
  let target = enemyAt;
  // 遠い敵が山腹へ押し出されても、追い手の矢行き先は街道に置く。
  // 目前の槍合わせは実際の兵へ向け、城下の別の街道には触れない。
  if (next && !closeSeen && F.step <= 3) {
    const z = along(enemyAt.x, enemyAt.z), x = enemyAt.x * CS - enemyAt.z * SN;
    const center = roadX(z), lane = Math.max(-4, Math.min(4, x - center));
    if (Math.abs(x - center) > 4) {
      target = F.enemyRoadPoint;
      target.x = (center + lane) * CS + z * SN;
      target.z = z * CS - (center + lane) * SN;
    }
  }
  const guide = closeSeen ? target : chaseWay(rt.army, rt.player.u, target);
  F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
  F.guideBend = guide !== enemyAt; F.guideEnemy = next; F.guideJoin = false;
  // 霧や坂の向こうの兵は、道の行き先として案内する。敵の札は姿が見えてから。
  F.guideVisible = !!next && near(p, enemyAt, VISIBLE_REAR) && sightScreenUnit(rt, next);
}
// 敵が退いた後と守り場への移動は、残兵を追わず道の曲がりを案内する。
function toneDestinationGuide(rt, target) {
  const F = rt.flags, guide = chaseWay(rt.army, rt.player.u, target);
  F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
  F.guideBend = guide !== target;
  F.guideEnemy = null; F.guideVisible = false; F.guideJoin = false;
}
// 道の行き先は着いたら消す。敵の列と合流の行き先は、そばへ着いても残す。
function toneGuidePosition(rt) {
  const F = rt.flags;
  return !F.guideEnemy && !F.guideBend && !F.guideJoin && !F.townWaiting && !F.innerWaiting && near(rt.player.u.pos, F.roadGuide, 8)
    ? null : F.roadGuide;
}
// 合流を命じる時は敵の先の曲がりへ誘わず、今戦える味方へ戻す。
// 馬の胴へ向かわせないよう徒歩兵を優先し、印の座標は使い回す。
function toneJoinable(rt, u) {
  return u !== rt.player.u && u.team === rt.player.u.team && fighter(u) &&
    !u.rearWound && !u.downed && !u.climb &&
    // 支えに数えない高さの兵や、道の外の兵へ戻る印を出さない。
    // 峠道と城下の道の両方を調べ、合流と退避で同じ候補を使う。
    Math.abs(u.pos.y - rt.player.u.pos.y) <= 3 &&
    Math.min(distToPolyline(u.pos.x, u.pos.z, ROAD), chaseNear(u.pos.x, u.pos.z)) <= 4 &&
    rt.world.walkable(u.pos.x, u.pos.z, u.pos.y);
}
function toneJoinRank(u, distance) {
  return distance < 22 ? (u.mounted ? 22 : 0) + distance : 44 + distance;
}
function toneRegroupGuide(rt, group = null) {
  const F = rt.flags, p = rt.player.u.pos;
  // 遠い合流相手も保ち、六歩以上近い兵がいる時だけ印を移す。
  const saved = F.regroupAlly;
  let ally = saved && (!group || saved.group === group) && toneJoinable(rt, saved) ? saved : null;
  const supportRange = 22;
  const distance = ally ? Math.hypot(ally.pos.x - p.x, ally.pos.z - p.z) : Infinity;
  let best = ally ? toneJoinRank(ally, distance) : Infinity;
  for (const u of group ? group.units : rt.army.units) {
    if (!toneJoinable(rt, u)) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z), rank = toneJoinRank(u, d);
    // 近い徒歩兵が来たら馬から案内を移す。それ以外は六歩の差をつけて揺れを防ぐ。
    if (!ally || ally.mounted && !u.mounted && d < supportRange || rank + 6 < best) {
      best = rank; ally = u;
    }
  }
  F.regroupAlly = ally;
  if (!ally) return false;
  // 隣の兵への合流で、通り過ぎた曲がりへ引き返させない。
  const onRoad = Math.min(distToPolyline(p.x, p.z, ROAD), chaseNear(p.x, p.z)) <= 10;
  let target = ally.pos;
  if (ally.mounted) {
    // 馬の胴を指さず、同じ道の脇で並べる場所を示す。座標は使い回す。
    const q = F.joinPoint || (F.joinPoint = { x: 0, z: 0 });
    const side = p.x * CS - p.z * SN >= ally.pos.x * CS - ally.pos.z * SN ? 4.5 : -4.5;
    q.x = ally.pos.x + side * CS; q.z = ally.pos.z - side * SN;
    target = q;
  }
  const guide = onRoad && near(p, target, supportRange) && sightUnit(rt, ally) ? target : chaseWay(rt.army, rt.player.u, target);
  F.roadGuide.x = guide.x; F.roadGuide.z = guide.z;
  F.guideBend = guide !== target; F.guideJoin = true;
  return true;
}
// 槍を受けている味方も支えになる。隊の到着判定だけでは、隣の組や交戦中の兵を見落とす。
function toneSupported(rt, p, group = null, range = 22) {
  if (group?.routed) return false;
  let n = 0;
  for (const u of group ? group.units : rt.army.units) {
    if (u === rt.player.u || u.team !== rt.player.u.team || !fighter(u) || u.rearWound || u.downed || u.climb || Math.abs(u.pos.y - p.y) > 3) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < 8 || d < range && ++n >= 2) return true;
  }
  return false;
}
// 合流は列のそばまで戻ってから終える。二十二歩の境目をまたぐだけで
// 前進と引き返しを繰り返さず、十二歩まで寄ってから追撃へ戻す。
function toneRegroupNeeded(rt, supported, joined) {
  const F = rt.flags;
  if (toneSupported(rt, rt.player.u.pos, null, 12)) {
    F.regrouping = false; F.regroupUntil = 0;
  } else if (!joined || !supported && (rt.player.u.mobbed || rt.t < (F.regroupUntil || 0))) {
    F.regrouping = true;
  }
  return !!F.regrouping;
}
// 夜の退き先は街道の内の味方の後ろ。共通の敵と反対向きの探索で山腹へ誘わない。
// 半秒ごとに候補と通り道を調べ、座標の入れ物は設営時の物を使い回す。
function toneShelter(rt) {
  const F = rt.flags, out = F.shelter;
  if (!out || F.step < 1 || F.step > 3 || F.ending || !retreatRequired(rt)) return null;
  if (rt.t < out.scanAt) return out.valid ? out : null;
  out.scanAt = rt.t + 0.5;
  // 安全な退き先は地面に保つ。歩く味方の四歩後ろを追い続けさせない。
  if (out.valid && out.ally && toneJoinable(rt, out.ally) && !out.ally.mounted &&
      near(out, out.ally.pos, 12) && sightUnit(rt, out.ally) &&
      toneShelterClear(rt, out.x, out.z, out.ally)) return out;
  out.valid = false; out.ally = null;
  const p = rt.player.u.pos, q = out.point;
  let best = Infinity;
  for (const ally of rt.army.units) {
    if (!toneJoinable(rt, ally) || ally.mounted || !sightUnit(rt, ally) || !near(p, ally.pos, 24)) continue;
    const z = along(ally.pos.x, ally.pos.z) + 4;
    const lane = Math.max(-3, Math.min(3, ally.pos.x * CS - ally.pos.z * SN - roadX(z)));
    const side = roadX(z) + lane, x = side * CS + z * SN, wz = z * CS - side * SN;
    const d = Math.hypot(x - p.x, wz - p.z);
    if (d >= best || d > 28) continue;
    if (!toneShelterClear(rt, x, wz, ally)) continue;
    best = d; out.x = x; out.z = wz; out.y = q.y; out.ally = ally; out.valid = true;
  }
  return out.valid ? out : null;
}
// 保った退き先にも、新しい退き先と同じ敵・坂・壁の検査を通す。
function toneShelterClear(rt, x, z, ally) {
  const p = rt.player.u.pos, q = rt.flags.shelter.point;
  const d = Math.hypot(x - p.x, z - p.z);
  if (d > 28) return false;
  for (const enemy of rt.army.units) {
    if (enemy.team === ally.team || !fighter(enemy) || enemy.civ || enemy.isStruct || Math.abs(enemy.pos.y - p.y) >= 4) continue;
    const from = Math.hypot(enemy.pos.x - p.x, enemy.pos.z - p.z);
    const to = Math.hypot(enemy.pos.x - x, enemy.pos.z - z);
    const t = Math.max(0, Math.min(1, ((enemy.pos.x - p.x) * (x - p.x) + (enemy.pos.z - p.z) * (z - p.z)) / Math.max(0.01, d * d)));
    if (to < 6 || from < 6 && to < from + 2 || from >= 6 &&
        Math.hypot(enemy.pos.x - p.x - t * (x - p.x), enemy.pos.z - p.z - t * (z - p.z)) < 4) return false;
  }
  const steps = Math.max(1, Math.ceil(d / 2));
  for (let i = 1; i <= steps; i++) {
    q.x = p.x + (x - p.x) * i / steps; q.z = p.z + (z - p.z) * i / steps;
    q.y = rt.world.heightAt(q.x, q.z);
    if (distToPolyline(q.x, q.z, ROAD) > 5 || !rt.world.walkable(q.x, q.z, q.y) ||
        Math.abs(q.y - p.y) > d * i / steps * 0.5 + 0.5 || rt.army.wallBetween(p, -1, q)) return false;
  }
  return true;
}
// 輪の内から八歩以内で並べる兵を迎える。輪のすぐ外の列も見落とさない。
function toneSecureAlly(rt, u) {
  return u !== rt.player.u && u.team === rt.player.u.team && fighter(u) &&
    !u.rearWound && !u.downed && !u.climb &&
    Math.abs(u.pos.y - rt.player.u.pos.y) < 3 && near(u.pos, INNER, 20);
}
function toneSecureCount(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  let n = 0, distance = Infinity;
  F.innerAlly = null;
  F.innerMeetReady = false;
  if (F.late.routed) return 0;
  for (const u of F.late.units) {
    // 守り場では道の中心から外れた味方や、背後の味方も共に守っている。
    // 背後の兵も合流先にする。輪に来ているのに「待て」と案内しない。
    if (!toneSecureAlly(rt, u)) continue;
    const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
    if (d < 8) {
      if (++n >= 2) { F.innerAlly = null; return n; }
    }
  }
  // 二人と並べる行き先は地面に保つ。歩く兵の中点を追わせない。
  const saved = F.innerMeet;
  if (saved && near(saved, INNER, 12)) {
    const y = rt.world.heightAt(saved.x, saved.z);
    let ready = 0;
    if (rt.world.walkable(saved.x, saved.z, y)) for (const u of F.late.units) {
      if (!toneSecureAlly(rt, u) || !near(u.pos, saved, 8) || Math.abs(u.pos.y - y) >= 3) continue;
      if (++ready >= 2) {
        F.innerAlly = u; F.innerMeetReady = true;
        return n;
      }
    }
  }
  // 初めから二人と合流できる場所を選ぶ。孤立した一人へ寄って待ち続けさせない。
  // 一人と合流済みでも、別の二人の間なら守れる場合を見落とさない。
  distance = Infinity;
  const units = F.late.units;
  for (let i = 0; i < units.length; i++) {
    const a = units[i];
    if (!toneSecureAlly(rt, a)) continue;
    for (let j = i + 1; j < units.length; j++) {
      const u = units[j];
      if (!toneSecureAlly(rt, u) || !near(u.pos, a.pos, 16)) continue;
      // 二人の中点が輪の外でも、輪の内から二人に寄れる場所を示す。
      const mx = (u.pos.x + a.pos.x) / 2 - INNER.x, mz = (u.pos.z + a.pos.z) / 2 - INNER.z;
      const radius = Math.hypot(mx, mz), scale = radius > 11 ? 11 / radius : 1;
      const x = INNER.x + mx * scale, z = INNER.z + mz * scale;
      if (Math.hypot(a.pos.x - x, a.pos.z - z) >= 8 || Math.hypot(u.pos.x - x, u.pos.z - z) >= 8) continue;
      const d = Math.hypot(x - p.x, z - p.z);
      if (d >= distance) continue;
      const y = rt.world.heightAt(x, z);
      if (Math.abs(a.pos.y - y) >= 3 || Math.abs(u.pos.y - y) >= 3 || !rt.world.walkable(x, z, y)) continue;
      const meet = F.innerMeet || (F.innerMeet = { x: 0, z: 0 });
      meet.x = x; meet.z = z;
      distance = d; F.innerAlly = u; F.innerMeetReady = true;
    }
  }
  return n;
}
function fighters(g) {
  if (!g || g.routed) return 0;
  let n = 0;
  for (const u of g.units) if (fighter(u)) n++;
  return n;
}
function arrived(g, p, r) {
  if (!g || g.routed) return false;
  let n = 0;
  for (const u of g.units) if (fighter(u) && !u.rearWound && !u.downed && !u.climb && !(u.pinT > g._t) && near(u.pos, p, r)) n++;
  return n >= Math.min(3, fighters(g)) && n > 0;
}
const near = (p, at, r) => Math.hypot(p.x - at.x, p.z - at.z) < r;
// 槍衾は width では横幅が決まらない。六人を越す分は後ろへ並べ、山腹へ広げない。
const toneYariRanks = (n) => Math.max(3, Math.ceil(n / 6));
function toneHold(g) {
  g.order = 'hold'; g.formation = 'yari'; g.yariRanks = toneYariRanks(g.initial);
  // 追い手が止まった時、後ろの兵の柄と腕を前の背へ詰めすぎない。横幅は保つ。
  if (g.team === 0) g.rankSpacing = 1.35;
}
function march(g, path, arrive) {
  if (!g || !g.count || g.routed) return;
  g.order = 'path'; g.formation = 'column'; g.colW = 2; g.roadColumn = true;
  g.rankSpacing = 1;
  // 後列も、出発点から街道の曲がりをたどる。山腹へ列を伸ばさない。
  g.path = [[g.anchor.x, g.anchor.z], ...path]; g.pathIdx = 1; g.speed = 2.8;
  g.onArrive = arrive || toneHold;
}
// 城下の各組は街道上で間を空ける。同じ一点へ重ねず、先鋒と後続の層を残す。
function townMarch(F, inner = false) {
  const end = inner ? 5 : 4, a = CHASE_ROAD[end - 1], b = CHASE_ROAD[end];
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  F.townFriends = [F.late, ...F.followers];
  F.townFriends.forEach((g, i) => {
    const t = Math.max(0, 1 - i * 4 / length);
    march(g, [[a[0], a[1]], [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]], (q) => {
      toneHold(q); q.aggro = 18;
    });
  });
}
// 後続の供も開いた道を追う。最初の六十歩だけで止めず、今の位置から次の持ち場へ送る。
// 道順は段が替わる時だけ作り、兵や馬の数は増やさない。
function followChase(rt, end) {
  for (const g of rt.flags.followers) {
    if (!fighting(g)) continue;
    const z = along(g.anchor.x, g.anchor.z);
    if (z <= end) continue;
    const path = ROAD.filter((p) => {
      const next = along(p[0], p[1]);
      return next < z - 2 && next > end;
    });
    path.push(xz(roadX(end), end));
    march(g, path);
  }
}
function retreat(g) {
  if (!g || g.routed) return;
  g.noRout = false; g.routed = true; g.order = 'flee';
  // 任務の区切りでも一斉に反転させず、後ろからほつれて前列へ崩れを伝える。
  // 共通の敗走処理へ待ち時間を渡し、後ずさりから逃げ足・武器を離す動きへつなぐ。
  const c = g.center(), fx = Math.sin(g.facing), fz = Math.cos(g.facing);
  let rear = 0, front = 0;
  for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing) {
    const depth = (u.pos.x - c.x) * fx + (u.pos.z - c.z) * fz;
    rear = Math.min(rear, depth); front = Math.max(front, depth);
  }
  g._routLeft = 0;
  for (const u of g.units) if (u.alive && !u.isPlayer && !u.fleeing) {
    const depth = (u.pos.x - c.x) * fx + (u.pos.z - c.z) * fz;
    const rank = front - rear > 0.5 ? (depth - rear) / (front - rear) : 0.5;
    u.routIn = 0.2 + rank * 1.6 + (u.id * 0.61803398875 % 1) * 0.45;
    u.target = null; u.atk = null; u.swing = null; u.bind = null;
    u.charging = false; u.cheer = 0; u.aiT = 0;
    g._routLeft++;
  }
}

// 前の備が崩れたら、既にいる次の備が街道で返し合わせる。味方の到着待ちと分ける。
const COUNTER_PATHS = [
  [xz(roadX(-40), -40), xz(roadX(-24), -24)],
  [xz(roadX(-60), -60), xz(roadX(-36), -36)],
  [xz(roadX(-140), -140), xz(roadX(-112), -112)],
  [CHASE_ROAD[1]], [CHASE_ROAD[3]],
];
function counterMarch(g, path) {
  if (!fighting(g) || g._countermarch) return;
  g._countermarch = true;
  march(g, path, toneHold);
}

// 後衛の敗走は、夜の知らせと実際に流れ込む兵で次の備へ伝わる。
// 五つの備だけを半秒ほどごとに調べ、同じ敗走で士気を削り続けない。
function retreatCascade(rt) {
  const F = rt.flags;
  for (let i = 0; i < F.rears.length; i++) {
    const rear = F.rears[i];
    if (fighting(rear)) continue;
    if (rear._collapseAt == null) {
      rear._collapseAt = rt.t;
      F.pursueUntil = rt.t + 8;
      const b = F.rearCrowds[i];
      routButai(b, 18);
    }
    const next = F.rears[i + 1];
    if (next && fighting(next) && !rear._collapseSent && rt.t >= rear._collapseAt + 6) {
      rear._collapseSent = true;
      // 知らせだけで無傷の備を敗走させず、将と供は奥で守りを続ける。
      next.morale = Math.min(next.morale, Math.max(24, next.morale - 12));
    }
    for (let j = i + 1; j < F.rears.length; j++) {
      const g = F.rears[j], bit = 1 << i;
      if (!fighting(g) || (g._fleeContact & bit)) continue;
      let touched = false;
      for (const v of rear.units) {
        if (!v.alive || !v.fleeing || v.gone) continue;
        for (const u of g.units) {
          if (!u.alive || u.fleeing || u.woundOut || u.noTarget ||
              Math.abs(u.pos.y - v.pos.y) > 2 || !near(u.pos, v.pos, 4)) continue;
          touched = true;
          if (!u.name && !u.mounted) { u.confused = Math.max(u.confused || 0, 2.5); u.aiT = 0; }
        }
      }
      if (touched) { g._fleeContact |= bit; g.morale = Math.min(g.morale, Math.max(24, g.morale - 8)); }
    }
  }
}

// 狭い街道で二つの味方の列を重ねず、供が離れた時は先頭が足を緩める。
// 半秒ほどごとの任務確認でだけ呼ぶ。道順・兵数・終戦までの上限は変えない。
function toneMarchPace(rt) {
  const F = rt.flags, p = rt.player.u.pos;
  for (const g of F.oda) {
    if (g.order !== 'path' || g.routed) continue;
    let speed = rt.t < F.pursueUntil ? 3.2 : 2.8;
    const z = along(g.anchor.x, g.anchor.z);
    const lag = along(p.x, p.z) - z;
    // 隊の先頭ではなく、実際に支えとなる徒歩兵との間を見る。
    // 支えの届く範囲を出る前に待ち、戻ってから歩き出す。
    let escortDistance = Infinity;
    for (const u of g.units) {
      if (!fighter(u) || u.mounted || u.rearWound || u.downed || u.climb || Math.abs(u.pos.y - p.y) > 3) continue;
      escortDistance = Math.min(escortDistance, Math.hypot(u.pos.x - p.x, u.pos.z - p.z));
    }
    g._toneWaitPlayer = lag > 0 && escortDistance > (g._toneWaitPlayer ? 12 : 18);
    // 足を負傷した供を、減速だけで置き去りにしない。列は持ち場で待つ。
    if (g._toneWaitPlayer) speed = 0;
    if (g === F.late && fighting(F.uma)) {
      const gap = z - along(F.uma.anchor.x, F.uma.anchor.z);
      g._toneQueue = gap < (g._toneQueue ? 32 : 26);
      if (g._toneQueue) speed = 0;
    }
    // 先頭の持ち場を敵の体へ進め続けない。兵自身は今の間合いから槍を合わせる。
    const height = rt.world.heightAt(g.anchor.x, g.anchor.z);
    const fx = Math.sin(g.facing), fz = Math.cos(g.facing);
    for (const rear of F.stageDefenders[F.step]) {
      if (!fighting(rear)) continue;
      for (const u of rear.units) {
        if (!fighter(u) || u.rearWound || u.downed) continue;
        const dx = u.pos.x - g.anchor.x, dz = u.pos.z - g.anchor.z;
        if (dx * fx + dz * fz > 0 &&
            Math.hypot(dx, dz) < 7 && Math.abs(u.pos.y - height) < 3) {
          speed = 0; break;
        }
      }
      if (!speed) break;
    }
    g.speed = speed;
  }
}

// 刀根坂の葉だけ、目の前の房を透かす。追加の林にも同じ処理を使う。
// 材質・形・描画回数は増やさない。
function toneLeafFade(sh) {
  // 距離は描く点の視点からの長さ（vViewPosition）で測る。共通の揺れの式が頂点の段を置き換えても
  // 距離が0のまま残らず、杉の葉が全部透けて幹だけの柱になるのを防ぐ（10/28）。
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `
    diffuseColor.a *= smoothstep(2.5, 7.5, length(vViewPosition));
    diffuseColor.rgb *= vec3(0.6, 0.66, 0.58);   // 雨の夜の杉は濃い緑。補光で青白い粉に見せない
    #include <alphatest_fragment>`);
  // 近くの葉は共通の式（nearLeafLit）が先に alphatest の行を置き換えるので、上の色は遠い葉にしか効かなかった。
  // 色は alphamap の行の後で掛け、近くの杉にも効かせる。
  sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
    // 葉房が明るい黄緑の羽の板に見えた（10/30 点付け：杉の葉の板）。濡れた夜の杉は灰青に沈み、房の根元ほど黒い。
    // 絵の縦（根元→葉先）で暗くし、葉の重なりの斑を入れて、一枚の板の均一な明るさを崩す（絵・形・描く回数は増やさない）。
    #ifdef USE_MAP
    { float tk = 0.62 + 0.3 * smoothstep(0.1, 0.8, abs(vMapUv.y - 0.5) * 2.0) + 0.08 * sin(vMapUv.x * 23.0 + vMapUv.y * 17.0);
      diffuseColor.rgb *= tk * vec3(0.8, 0.84, 0.9); }
    #endif
`);
}

// 刀根坂だけの外側の山腹。地面の端から続く面を折り、三つの尾根を距離の霞で重ねる。
// 一度だけ作り、木の幹と葉はそれぞれ一回の描画にまとめる。
// 夜の地形の外周は空と同じ霞へつなぐ。高さで薄まる共通の霧だけでは、
// 高い山腹の四角い端が残る。遠景と地面に同じ式を使い、昼の城下は保つ。
function toneHorizonFog(sh, W) {
  sh.uniforms.toneHorizonNight = W.nightU;
  sh.fragmentShader = 'uniform float toneHorizonNight;\n' + sh.fragmentShader.replace(
    '#include <fog_fragment>', `#include <fog_fragment>
      vec3 toneHorizonWorld = vFogOff + cameraPosition;
      float toneHorizonEdge = smoothstep(240.0, 290.0, max(abs(toneHorizonWorld.x), abs(toneHorizonWorld.z)));
      // 高い山腹も距離で霞へ溶かす。高さで薄まる共通の霧だけでは近い視点に角が残る。
      float toneHorizonDistance = smoothstep(fogFar * 0.9, fogFar * 1.65, length(vFogOff));
      float toneHorizonUp = max(vFogOff.y / max(length(vFogOff), 0.001), 0.0);
      vec3 toneHorizonColor = fogColor * (1.0 - 0.15 * smoothstep(0.0, 0.85, toneHorizonUp));
      gl_FragColor.rgb = mix(gl_FragColor.rgb, toneHorizonColor, toneHorizonNight * max(toneHorizonEdge, toneHorizonDistance));`);
}

function toneMountains(W) {
  W.mountains.visible = false;
  const group = new THREE.Group(), positions = [], colors = [], indices = [];
  const N = 128, ROWS = 18, color = new THREE.Color(), haze = new THREE.Color(0x718093);
  const slope = (a, row) => {
    const sa = Math.sin(a), ca = Math.cos(a), edge = 300 / Math.max(Math.abs(sa), Math.abs(ca));
    const r = edge + row * 28, x = sa * r, z = ca * r;
    const base = height(sa * edge, ca * edge);
    const peaks = 45 + 27 * Math.sin(a * 5 + row * 0.12) + 16 * Math.sin(a * 11 - row * 0.3);
    const rise = Math.sin(Math.min(1, row / 6) * Math.PI / 2);
    const folds = 18 * Math.sin(row * 0.8 + a * 3) * Math.min(1, row / 3);
    return { x, z, y: base + rise * peaks + folds };
  };
  for (let row = 0; row <= ROWS; row++) for (let i = 0; i <= N; i++) {
    const a = i / N * Math.PI * 2, q = slope(a, row);
    positions.push(q.x, q.y - 0.15, q.z);
    // 土と林の斑。遠い尾根ほど薄くし、実際の霧も材質へ掛ける。
    color.setHex(Math.sin(a * 29 + row * 1.7) > 0 ? 0x665847 : 0x3d5140);
    color.lerp(haze, row / ROWS * 0.38);
    colors.push(color.r, color.g, color.b);
    if (row < ROWS && i < N) {
      const k = row * (N + 1) + i;
      indices.push(k, k + 1, k + N + 1, k + 1, k + N + 2, k + N + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices); geo.computeVertexNormals();
  // 外の山腹は視点の描画距離（六百歩）より遠くまで続く。
  // 面がそこで切れて空に大きな角を作らないよう、手前から霞へ消す。
  // 地面の高さ・頂点数は保ち、この山腹一枚の材質だけを替える。
  const ridgeMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide,
    transparent: true, depthWrite: false, forceSinglePass: true });
  ridgeMat.customProgramCacheKey = () => 'tonezaka-ridge-horizon';
  ridgeMat.onBeforeCompile = (sh) => {
    toneHorizonFog(sh, W);
    sh.vertexShader = 'varying vec3 toneRidgeView;\n' + sh.vertexShader.replace(
      '#include <project_vertex>', '#include <project_vertex>\n toneRidgeView = mvPosition.xyz;');
    // 大きな三角の頂点距離を補間せず、画素の距離で消す。夜は夜の見通しに合わせる。
    sh.fragmentShader = 'varying vec3 toneRidgeView;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>', `#include <opaque_fragment>
        float toneRidgeEnd = clamp(floor(fogFar) * 2.2, 260.0, 540.0);
        gl_FragColor.a *= 1.0 - smoothstep(toneRidgeEnd * (2.0 / 3.0), toneRidgeEnd, length(toneRidgeView));`);
  };
  group.add(new THREE.Mesh(geo, ridgeMat));
  const count = 240, dummy = new THREE.Object3D();
  const wood = [new THREE.CylinderGeometry(0.12, 0.38, 4, 7)];
  for (let i = 0; i < 3; i++) {
    const branch = new THREE.CylinderGeometry(0.035, 0.12, 1.5, 5);
    branch.rotateZ(-0.85); branch.translate(0.5, 1.15 + i * 0.22, 0); branch.rotateY(i * 2.39996);
    wood.push(branch);
  }
  const woodGeo = mergeGeometries(wood);
  for (const part of wood) part.dispose();
  const bark = new THREE.InstancedMesh(woodGeo, new THREE.MeshLambertMaterial({ color: 0x5b4b3a }), count);
  // 道から見える雑木も共通の透ける葉房を使う。閉じた多面体を輪郭に残さない。
  const crowns = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, r = i === 8 ? 0.12 : 0.46 + (i % 3) * 0.13;
    for (let j = 0; j < 2; j++) {
      const crown = new THREE.PlaneGeometry(1.05 + (i % 3) * 0.12, 1.25);
      crown.rotateX(-0.18 + (i % 3) * 0.2);
      crown.rotateY(a + j * Math.PI / 2);
      crown.translate(Math.cos(a) * r, i === 8 ? 0.68 : -0.28 + (i % 4) * 0.23, Math.sin(a) * r);
      crowns.push(crown);
    }
  }
  const crownGeo = mergeGeometries(crowns);
  for (const crown of crowns) crown.dispose();
  const crownMat = new THREE.MeshLambertMaterial({ color: 0x829479, map: leafTex('broad'), alphaTest: 0.42, side: THREE.DoubleSide });
  crownMat.customProgramCacheKey = () => 'tonezaka-crowns-near-fade';
  crownMat.onBeforeCompile = (sh) => {
    toneLeafFade(sh);
    sh.uniforms.toneWind = { get value() { return SETTINGS.reduceMotion ? 0 : WIND_STATE.t; } };
    sh.uniforms.toneGust = { get value() { return SETTINGS.reduceMotion ? 0 : GUST.value; } };
    sh.uniforms.toneWindDir = WIND_DIR;
    sh.vertexShader = 'uniform float toneWind, toneGust; uniform vec2 toneWindDir;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float phase = dot(instanceMatrix[3].xz, toneWindDir) * 0.12;
      transformed.xz += toneWindDir * sin(toneWind * 1.6 + phase) * toneGust * 0.018 * max(0.0, position.y + 0.8);`);
  };
  const leaves = new THREE.InstancedMesh(crownGeo, crownMat, count);
  for (let i = 0; i < count; i++) {
    let x, z, y;
    if (i < 160) {
      // 同じ本数を沢ごとの小群へ。道に平行な等間隔の植え込みを崩す。
      const cluster = Math.floor((i % 80) / 5), within = i % 5;
      const localZ = 144 - cluster * 21 + Math.sin(cluster * 4.17) * 7 + Math.sin(within * 2.4) * 6;
      const localX = roadX(localZ) + (i < 80 ? -1 : 1) * (23 + (cluster * 17 % 29) + Math.cos(within * 2.4) * 6);
      const q = at(localX, localZ); x = q.x; z = q.z; y = W.heightAt(x, z) - 0.2;
    } else {
      const q = slope(i * 2.39996, 1 + (i % 6)); x = q.x; z = q.z; y = q.y;
    }
    const scale = 0.7 + (i % 5) * 0.12;
    dummy.position.set(x, y + 2 * scale, z); dummy.scale.set(scale, scale, scale);
    dummy.rotation.y = i * 2.39996; dummy.updateMatrix(); bark.setMatrixAt(i, dummy.matrix);
    dummy.position.y = y + 4.4 * scale; dummy.scale.set(2.6 * scale, 2.4 * scale, 2.1 * scale);
    dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
  }
  // 道脇は苔のある石だけ。浮いて見える箱形の土留めは置かない。
  // 月明かりの濡れた石は灰に光る。暗いままだと草地に黒い穴が並んで見えるので、わずかに自ら照らす（10/28）。
  // 一色の灰の平らな塊に見えた（10/30 点付け）。絵を足さず、世界の位置で風化の濃淡と細かな粒、上を向く面に苔を差す。
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x2a2c28 });
  stoneMat.customProgramCacheKey = () => 'tonezaka-stones-weathered';
  stoneMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 tsW; varying float tsUp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      tsW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; tsUp = normalize(mat3(instanceMatrix) * objectNormal).y;`);
    sh.fragmentShader = 'varying vec3 tsW; varying float tsUp;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      { float tsn = 0.5 + 0.5 * sin(tsW.x * 7.1 + tsW.z * 3.3 + sin(tsW.y * 9.0)) * sin(tsW.z * 6.3 - tsW.y * 5.1 + tsW.x * 2.0);
        float tsg = fract(sin(dot(floor(tsW * 23.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        float tsShade = 0.42 + 0.5 * tsn + 0.22 * (tsg - 0.5);
        diffuseColor.rgb *= tsShade * vec3(0.92, 0.88, 0.78);   // 月の青白い一色を土と苔の灰褐へ
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.25, 0.15), smoothstep(0.35, 0.85, tsUp) * (0.35 + 0.45 * tsn));
        totalEmissiveRadiance *= tsShade * 0.6; }`);
  };
  const stones = new THREE.InstancedMesh(rockShape(1, true), stoneMat, 144);
  const stonePoint = new THREE.Vector3(), stoneVertices = stones.geometry.attributes.position;
  for (let i = 0; i < 144; i++) {
    const cluster = Math.floor(i / 6), a = i * 2.39996;
    const z = 134 - cluster * 12.2 + Math.sin(cluster * 3.7) * 5 + Math.sin(a) * 3;
    const x = roadX(z) + (cluster % 2 ? -1 : 1) * (9 + (cluster * 17 % 24)) + Math.cos(a) * 3;
    const q = at(x, z), size = (i % 6 === 0 ? 0.65 : 0.22) + (i * 13 % 11) * 0.035;
    dummy.position.set(q.x, drawGroundAt(W, q.x, q.z) - 0.04, q.z);
    dummy.scale.set(size * 1.1, size * (1.15 + i % 3 * 0.15), size);   // 平たい黒い板に見えないよう、背を高くして肩を土から出す
    dummy.rotation.set(0, i * 2.39996, 0); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    // 腹の縁まで坂の土へ埋める。下端だけでは下り側に黒い腹が露出する。
    // 頂点の確認は設営時だけ。街道の当たりと兵の通り道は変えない。
    let sink = 0;
    for (let j = 0; j < stoneVertices.count; j++) {
      if (stoneVertices.getY(j) > 0.08) continue;
      stonePoint.fromBufferAttribute(stoneVertices, j).applyMatrix4(dummy.matrix);
      sink = Math.max(sink, stonePoint.y - drawGroundAt(W, stonePoint.x, stonePoint.z) + 0.04);
    }
    dummy.position.y -= sink; dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  // 『信長公記』巻六は峰で返し合わせる追撃戦を記す。
  // 準備済みの防衛線に見える常設の柵は置かず、道と山腹で殿の持ち場を示す。
  // https://ja.wikisource.org/wiki/信長公記
  group.add(bark, leaves, stones); W.scene.add(group);
  // 追加の林と露岩も、共通の林と同じく見える個体だけを詰めて描く。
  // 幹と葉は中心と拡大率が違うので、それぞれの外形で判定する。
  for (const mesh of [bark, leaves, stones]) W.viewCull([mesh], 0);
  return () => {
    group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    group.removeFromParent();
  };
}

// 本の野戦兵器の丸太・縄結びと、清洲の板囲いを手本にした道端の生活道具。
// 峠での追撃に常設の陣・攻城具は置かない。配置は史料にない補完。
function toneRoadside(W) {
  const group = new THREE.Group(), batches = [], dummy = new THREE.Object3D();
  // 木目は設営時に一枚だけ描き、丸太・箱で使い回す。外の素材は読み込まない。
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#66513c'; ctx.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 28; i++) {
    ctx.strokeStyle = i % 3 ? '#514432' : '#827056'; ctx.lineWidth = i % 4 ? 0.6 : 1.2;
    ctx.beginPath();
    for (let y = 0; y <= 128; y += 4) {
      const x = i * 2.4 + Math.sin(y * 0.08 + i * 1.7) * 0.7;
      if (!y) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const grain = new THREE.CanvasTexture(canvas); grain.colorSpace = THREE.SRGBColorSpace;
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping;
  const wood = new THREE.MeshLambertMaterial({ map: grain });
  const bamboo = new THREE.MeshLambertMaterial({ color: 0x77724a });
  const rope = new THREE.MeshLambertMaterial({ color: 0x9c8860 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0x928773, side: THREE.DoubleSide });
  const riceMat = new THREE.MeshLambertMaterial({ color: 0x777b3d, side: THREE.DoubleSide });
  const kit = (geo, mat, far) => {
    const b = { geo, mat, far, matrices: [] }; batches.push(b); return b;
  };
  const logs = kit(new THREE.CylinderGeometry(1, 1, 1, 5), wood, 95);
  const canes = kit(new THREE.CylinderGeometry(1, 1, 1, 5), bamboo, 65);
  const ties = kit(new THREE.TorusGeometry(1, 0.09, 3, 7), rope, 32);
  const boards = kit(new THREE.BoxGeometry(1, 1, 1), wood, 85);
  // 雨を含んだ布を竿へ二つ折り。端は地面から浮かせ、平たい板にしない。
  const fold = new THREE.PlaneGeometry(1, 1, 6, 2), fp = fold.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setZ(i, Math.sin(fp.getX(i) * 19) * 0.04 + Math.abs(fp.getX(i)) * 0.12);
  fold.computeVertexNormals();
  const cloths = kit(fold, cloth, 65);
  // 葉の先が垂れ、穂が曲がる稲株。一株三十六面だけで、近くに寄った時だけ描く。
  const riceParts = [];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.39996, blade = new THREE.PlaneGeometry(0.035, 0.8, 1, 2);
    const p = blade.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const h = p.getY(j) + 0.4;
      p.setXYZ(j, p.getX(j) + h * h * 0.24, h, 0);
    }
    blade.rotateY(a); riceParts.push(blade);
    const ear = new THREE.PlaneGeometry(0.07, 0.2);
    ear.rotateZ(0.7); ear.translate(0.18, 0.72, 0); ear.rotateY(a); riceParts.push(ear);
  }
  const riceGeo = mergeGeometries(riceParts);
  for (const p of riceParts) p.dispose();
  const rice = kit(riceGeo, riceMat, 42);
  const put = (batch, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    const q = at(x, z);
    dummy.position.set(q.x, y, q.z); dummy.scale.set(sx, sy, sz);
    dummy.rotation.set(rx, ry + TURN, rz, 'YXZ'); dummy.updateMatrix();
    batch.matrices.push(dummy.matrix.clone());
  };
  const ground = (x, z) => { const q = at(x, z); return drawGroundAt(W, q.x, q.z); };
  const beam = (batch, x, z, endX, endZ, h, r) => {
    const y = ground(x, z) + h, endY = ground(endX, endZ) + h;
    const dx = endX - x, dz = endZ - z, len = Math.hypot(dx, dz);
    put(batch, (x + endX) / 2, (y + endY) / 2, (z + endZ) / 2,
      r, Math.hypot(len, endY - y), r, Math.atan2(len, endY - y), Math.atan2(dx, dz));
  };
  // 里の小屋の裏の低い境柵。道・避難路は横切らず、出入口を開ける。
  for (let i = 0; i < 8; i++) {
    const x = -35 + i * 1.4, z = 75.5, y = ground(x, z);
    put(logs, x, y + 0.55, z, 0.065, 1.25, 0.065, 0, 0, (i % 3 - 1) * 0.04);
    if (i < 7) for (const h of [0.4, 0.85]) beam(canes, x, z, x + 1.4, z, h, 0.035);
    put(ties, x, y + 0.85, z, 0.09, 0.09, 0.09, Math.PI / 2);
  }
  // 撤収中に残された担い棒・竹束と畳んだ幕。幕は低く、無人の大旗は足さない。
  for (const [x, z] of [[19, -24], [-21, -124]]) {
    for (const side of [-1, 1]) {
      const px = x + side * 1.1, y = ground(px, z);
      put(logs, px, y + 0.65, z, 0.07, 1.5, 0.07);
      put(ties, px, y + 1.15, z, 0.1, 0.1, 0.1, Math.PI / 2);
    }
    beam(logs, x - 1.2, z, x + 1.2, z, 1.2, 0.055);
    put(cloths, x, ground(x, z) + 0.91, z + 0.06, 1.8, 0.55, 1, 0.12);
    for (let i = 0; i < 9; i++) {
      const bx = x + (i % 3) * 0.11 - 0.1, bz = z + 1.2;
      beam(canes, bx, bz - 1.3, bx + 0.15, bz + 1.3, 0.12 + Math.floor(i / 3) * 0.1, 0.048);
    }
    for (const dz of [-0.7, 0.7]) put(ties, x + 0.07, ground(x, z + 1.2 + dz) + 0.24,
      z + 1.2 + dz, 0.21, 0.21, 0.21);
    // 空の木箱。上を塞がず、板の厚みと底を残す。
    const bx = x + 1.6, bz = z + 1.1, by = ground(bx, bz);
    put(boards, bx, by + 0.08, bz, 0.9, 0.12, 0.65);
    for (const s of [-1, 1]) {
      put(boards, bx + s * 0.43, by + 0.3, bz, 0.06, 0.5, 0.65);
      put(boards, bx, by + 0.3, bz + s * 0.3, 0.8, 0.5, 0.06);
    }
  }
  // 谷底の二枚の小田だけ。夜の峠の山腹へ田畑を敷き詰めない。
  for (const [cx, cz] of [[-10, 123], [-14, 108]]) {
    for (let row = 0; row < 12; row++) for (let col = 0; col < 8; col++) {
      const x = cx + (col - 3.5) * 0.43 + Math.sin(row * 7 + col) * 0.06;
      const z = cz + (row - 5.5) * 0.48, q = at(x, z);
      if (W.slopeTan(q.x, q.z) > 0.35 || peopleNear(q.x, q.z) || distToPolyline(q.x, q.z, ROAD) < 6) continue;
      put(rice, x, ground(x, z) - 0.03, z, 0.9, 0.85 + (row % 3) * 0.06, 0.9, 0, row * 1.7 + col);
    }
  }
  for (const b of batches) {
    if (!b.matrices.length) { b.geo.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.matrices.length);
    for (let i = 0; i < b.matrices.length; i++) mesh.setMatrixAt(i, b.matrices[i]);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh); W.viewCull([mesh], 0, b.far);
  }
  W.scene.add(group);
  return () => {
    group.removeFromParent();
    for (const mesh of group.children) mesh.dispose();
    for (const b of batches) b.geo.dispose();
    for (const mat of [wood, bamboo, rope, cloth, riceMat]) mat.dispose();
    grain.dispose();
  };
}

// 各任務の上限。夜の追撃から城下の守りまで、残兵探しで長引かせない。
const TONE_FOE = { 1: '河合吉統の殿', 2: '山崎吉家・斎藤龍興の手', 3: '詫美越後守の殿' };
const TONE_NEXT = { 1: '刀根坂の中ほど', 2: '刀根坂の峠口', 3: '刀根坂の峠' };
// ▼の添え字：行く場所と行い（段ごとに一つ）。
const TONE_SIGN = { 0: '坂の下の殿を突き破れ', 1: '坂の下の殿を突き破れ', 2: '坂の中ほどの手を突き破れ', 3: '峠口の殿を追い払え', 5: '城下の道の兵を追い払え', 6: '奥の道で寄せる兵を防げ' };
// 段ごとの行き先は動かさない（AW3・BK4）。殿の持ち場・坂の中ほど・峠口・城下・奥の道。
const TONE_GOAL = { 0: at(-6, 40), 1: at(-6, 40), 2: SAKA, 3: PASS, 5: TOWN, 6: INNER };
const TONE_QUIET = new Set(['nobu', 'toneShelter', 'asakuraMain', 'toneFront', 'toneRoad', 'pass', 'town', 'townAllies', 'inner']);
const STAGE_LIMIT = { 1: 75, 2: 80, 3: 55, 5: 60, 6: 45 };
// 右上の段ごとの一行（stages.js の tonezaka と同じ字。番号は hud が頭に付ける）
const TONE_LINE = { 0: '坂の下で河合吉統の殿を突き破れ', 1: '坂の下で河合吉統の殿を突き破れ', 2: '坂の中ほどで山崎吉家・斎藤龍興の手を突き破れ', 3: '峠口で詫美越後守の殿を追い払え', 4: '一乗谷の城下の道から朝倉の兵を追い払え', 5: '一乗谷の城下の道から朝倉の兵を追い払え', 6: '一乗谷の奥の道で寄せる朝倉の兵を防げ' };
// 台詞は場面の復元。史料の発言をそのまま再現したものではない。
const REAR_VOICE = {
  '河合吉統': 'ここで食い止める！　皆の衆、槍を向けよ！',
  '山崎吉家': '坂で返せ！　義景様を敦賀へお通しする！',
  '斎藤龍興': 'まだ退くな！　この坂は渡さぬ！',
  '詫美越後守': '峠を守れ！　本隊が抜けるまで踏みとどまれ！',
};
function withdrawStage(rt) {
  const F = rt.flags, groups = F.stageDefenders[F.step], pp = rt.player.u.pos;
  for (const g of groups) {
    if (g === F.r1 && g.lastStand && !g.units.some((u) => u.name === '河合吉統' && u.alive)) {
      g.lastStand = false; g.noRout = false;
    }
    // 10/30：時の上限で退くのは、本人が近くで戦っている時だけ（立っているだけで段が進んで見えないように）
    // 10/30：味方が削っただけでは退かない。本人が近く（四十五歩）で戦っている時だけ崩れる
    const close = near(pp, g.center(), 45);
    // 11/5（kaito の物差し 二5）：本人が来なくても、上限の二倍の時が経てば味方の押しで殿は退き、物語は進む。
    //   峠・城下・奥の道は本人が着いて初めて次へ進むので、果たさずに勝ちにはならない。
    const remaining = fighters(g);
    // 城下と奥の寄せ手は、無傷のまま時計だけで退かせない。
    // 坂の殿の進行は保ち、一乗谷では実際に兵を失ってから時間の保険を使う。
    const late = rt.t - F.stepT >= STAGE_LIMIT[F.step] && (F.step <= 3 || remaining < g.initial);
    const idleLate = F.step <= 3 && rt.t - F.stepT >= STAGE_LIMIT[F.step] * 2;
    // 自分と組が三人を倒すと、三割弱の損失でも守りが崩れる。無傷の備は退かせない。
    const threshold = g._toneHelp >= 3 ? 0.75 : 0.6;
    // 山崎・龍興の旗本は、時刻で退かせず討たれるまで踏みとどまる。
    if (fighting(g) && !g.lastStand && (close && (remaining <= g.initial * threshold || late) || idleLate)) {
      retreat(g); tonezaka.onRout(rt, g);
    }
  }
}

// 峠へ着くまでは同じ段。最後の敵が退いただけで道中の案内を消さない。
function toneMissionStep(rt) {
  return rt.flags.step;
}
// 目標の段：今の段そのもの。殿が崩れても、その段の持ち場へ着いて次の段が始まるまで、目標と▼を替えない（AW3）。
const toneGoalStep = (rt) => rt.flags.step;
function toneMissionEnemy(rt) {
  const F = rt.flags, step = toneMissionStep(rt), p = rt.player.u.pos;
  if (F.ending || rt.over) return null;
  const groups = F.dpOn ? F.dp?.cur?.groups || [] : F.stageDefenders[step] || [];
  const old = F.missionEnemy;
  // 崩れた備の兵を覚えていても、守り場から追い出す印にはしない。
  if (F.missionEnemyStep === step && F.missionEnemyAt > rt.t && old &&
      groups.includes(old.group) && fighting(old.group) && fighter(old) && !old.downed && !old.rearWound &&
      near(p, old.pos, VISIBLE_REAR) && Math.abs(old.pos.y - p.y) < 3 && sightScreenUnit(rt, old)) return old;
  F.missionEnemyAt = rt.t + .2; F.missionEnemyStep = step;
  let best = null, distance = Infinity;
  for (const g of groups) {
    if (!fighting(g)) continue;
    for (const u of g.units) {
      if (!fighter(u) || u.downed || u.rearWound || !near(p, u.pos, VISIBLE_REAR) ||
          Math.abs(u.pos.y - p.y) >= 3 || !sightScreenUnit(rt, u)) continue;
      const d = (u.pos.x - p.x) ** 2 + (u.pos.z - p.z) ** 2;
      if (d < distance) { best = u; distance = d; }
    }
  }
  return (F.missionEnemy = best);
}

const tonezaka = {
  resumeSteps: [[1, 'chase'], [2, 'second'], [3, 'toPass'], [4, 'toIchijodani'], [5, 'townAttack'], [6, 'townFire']],   // 戦の途中の保存（battle_checkpoint.js）：段の始まりを、段の関数を順に流して作り直す
  // 稲生の水準：任務一行・ピン・敵の▼だけで現在の一手を示す。
  missionSingleLine: true,
  goalsAllRows: true, // 最初から場所と行いの五件を並べ、果たした目標に印を付ける。
  goalVisibleRows: 5,
  battleDialogue: true, // 刀根坂は短い下知も使う。八秒の間引きと三枠の上限は共通処理に任せる。
  hideMissionDots: true,
  hideGuideSteps: true,
  noPlayerFoot: true,
  quietMiss: true,
  noDodgeCard: true,
  enemyTriangleSigns: true,
  // 11/8 critic60（一2・十三4）：義景は峠の奥の本隊の内。十数メートル先の道に名札を出さない
  hideNameTag: (u) => u.name === '朝倉義景',
  nearbyAllySignLimit: 0,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  // 追撃を始める理由の見出しも通す。呼び出しがあっても、この制限で消していた。
  bannerAllowed: (rt, title) => rt.over || !!rt.flags.ending || /^(朝倉、陣を払う|朝倉が退く。信長公が追う|朝倉の列、詰まる|義景の旗本、返す|義景、逃げ延びる|朝倉軍、壊滅)$/.test(title) || /討ち取|討死|勝|一乗谷の火|越前への追撃|一乗谷の城下/.test(title),
  // 11/3 b100（AQ1・AR1）：「味方と進め」のような分からない言い方をやめ、段ごとに場所と行いを書く。
  // 11/4 史実の流れ（docs/battle_refs/tonezaka.md）：段ごとの目標は場所と行いの一つの言い方に固め、途中で言い替えない（AW3）。
  missions: ['坂の下で河合吉統の殿を突き破れ', '坂の下で河合吉統の殿を突き破れ', '坂の下で河合吉統の殿を突き破れ', '一乗谷の奥の道で寄せる朝倉の兵を防げ'],
  stageGoals: {
    0: ['坂の下で河合吉統の殿を突き破れ', '坂の下で河合吉統の殿を突き破れ', '坂の下で河合吉統の殿を突き破れ'],
    1: ['坂の下で河合吉統の殿を突き破れ', '坂の下で河合吉統の殿を突き破れ', '坂の下で河合吉統の殿を突き破れ'],
    2: ['坂の中ほどで山崎吉家・斎藤龍興の手を突き破れ', '坂の中ほどで山崎吉家・斎藤龍興の手を突き破れ', '坂の中ほどで山崎吉家・斎藤龍興の手を突き破れ'],
    3: ['峠口で詫美越後守の殿を追い払え', '峠口で詫美越後守の殿を追い払え', '峠口で詫美越後守の殿を追い払え'],
    4: ['一乗谷の城下の道から朝倉の兵を追い払え', '一乗谷の城下の道から朝倉の兵を追い払え', '一乗谷の城下の道から朝倉の兵を追い払え'],
    5: ['一乗谷の城下の道から朝倉の兵を追い払え', '一乗谷の城下の道から朝倉の兵を追い払え', '一乗谷の城下の道から朝倉の兵を追い払え'],
    6: ['一乗谷の奥の道で寄せる朝倉の兵を防げ', '一乗谷の奥の道で寄せる朝倉の兵を防げ', '一乗谷の奥の道で寄せる朝倉の兵を防げ'],
  },
  // 11/6 fix61（Z3・Z4）：共通の「〇〇の隊を助けに〇〇の隊が出てくる」は、退く義景の本隊を前へ出す言い方になり史実と違う（殿の向き直りはこの戦の COUNTER_PATHS）。
  //   使番の「後方にて陣を移す」も追撃の言葉でない。後続の先手が追い付く事と信長の叱りはこの戦の台詞で一度だけ。
  relief: false,
  noAllyReports: true,
  noHatamotoMass: true, // 狭い峠道で、将の後ろの軽い旗本の塊に追い手の味方が埋もれる（AP9・AQ6）。旗本は本物の侍の輪だけ
  stageGoalsOnly: true, // 右上の五つは段だけ（「敵を何人討つ」「義景を討つ」で埋めない。AW3・AV16）
  goalSignOnly: true,   // 行き先は頭上の金の▼一つだけ（道の曲がりの名札・旗・輪を重ねない。AP12・AV15・BH6）
  goalSignTriangle: true, // 画面外でも矢印へ替えず、縁の位置で行き先を示す。
  // ▼の添え字に行き先までの道のり（十メートル刻み。BK1）。
  goalSignAction: (rt) => {
    const F = rt.flags, step = toneGoalStep(rt), p = rt.player.u.pos;
    // 追加の追撃では、印だけ先へ進んで添え字と距離が元の坂へ戻らないようにする。
    const to = F.toneMonomi || (F.dpOn ? F.dp?.cur?.at : TONE_GOAL[step]);
    const say = F.toneMonomi || F.dpOn ? F.toneHead : TONE_SIGN[step];
    if (!say || !to) return say || '';
    const d = Math.round(Math.hypot(to.x - p.x, to.z - p.z) / 10) * 10;
    return d >= 20 ? `${say} ${d}メートル` : say;
  },
  // 11/2 bot（アクション好き）：峠を越えて一乗谷へ着いた後、城下と奥の道の段の途中で共通の八分打ち切りに掛かり、三回に二回負けた。
  //   一乗谷の段（略図・城下・奥の道）だけ十分まで待つ。勝つ条件と敵・味方の数は変えない。
  pacingCap: 1800, // 追加の追撃・城下まで、三十分の内で本人が任務を果たす。
  pacingWait: (rt) => !!rt.flags.ending || rt.flags.step >= 4 && rt.t < 600,
  missionOf(rt) {
    const F = rt.flags, step = toneMissionStep(rt);
    if (F.ending) return 3;
    if (F.dpOn) return toneMissionEnemy(rt) ? 1 : 2;
    if (step === 0 || retreatRequired(rt) || F.guideJoin || F.townWaiting || F.innerWaiting) return 0;
    if (step === 6 && F.innerJoined && toneMissionEnemy(rt)) return 1;
    if (step === 6) return near(rt.player.u.pos, INNER, 12) ? 3 : 2;
    if (step === 5 && !fighting(F.townG)) return near(rt.player.u.pos, TOWN, 14) ? 3 : 2;
    return toneMissionEnemy(rt) ? 1 : 2;
  },
  // 11/6 fix3_tonezaka（三1・三2・五1・九7・AW3）：右上の一行は段ごとに一つに固め、途中で言い替えない。
  //   「あと五秒で出発」「あと八秒」「あと二人」「味方へ寄れ」「略図の釦を押せ」のような数・説明・画面の言葉は出さない。
  //   寄る・退く・守り直すの下知は組頭の声だけで伝える。
  missionHeading(rt) {
    const F = rt.flags;
    if (F.ending) return '一乗谷の奥の道を守り通した';
    if (F.toneHead) return F.toneHead;
    return TONE_LINE[F.step] || TONE_LINE[1];
  },
  // 行き先は段の場所に固定し、近い敵を追う▼は出さない。敵は頭上の赤い印で分かる（AW3・AV15）。
  missionSignTarget: () => null,
  // 総大将は退く義景本人。討ち取りの任務や勝ちの条件は足さない。
  // 11/3 b100（④・⑧）：総大将は峠の向こうを退く本隊の奥にいて、討てる所に出ない。行き先は今の目標一つだけにし、義景の行き先は出さない。
  commanderSignTarget: () => null,
  noLeaderFollow: true, // 目標が敵を崩す事なので、ついていく相手の青い印を黄色の行き先と同時に出さない（AL）
  namedGuideTarget(rt) { return this.commanderSignTarget(rt); },
  commanderTarget(rt) {
    const u = this.missionSignTarget(rt);
    return u?.type === 'busho' ? u : null;
  },
  missionPin(rt) {
    const F = rt.flags, step = toneGoalStep(rt);
    if (F.ending || rt.over || F.step === 4 || !rt.player.u.alive) return null;
    const pin = F.missionPin || (F.missionPin = { x: 0, z: 0, r: 0, hide: 0, silent: true, always: true });
    pin.unit = null; pin.enemy = false; pin.waiting = false; pin.defend = false;
    pin.arrived = false; pin.route = false; pin.approach = false;
    // 足した段：物見の高み・段の持ち場
    const dpAt = F.toneMonomi || (F.dpOn && F.dp?.cur?.at);
    if (dpAt) { pin.x = dpAt.x; pin.z = dpAt.z; pin.r = 3; pin.hide = 0; pin.arrived = near(rt.player.u.pos, dpAt, 3); return pin; }
    // 追撃の合間の知らせでは、済んだ坂や峠へ行き先を戻さない。
    if (F.dpOn) return null;
    const shelter = toneShelter(rt);
    if (shelter) {
      // 退き先も道の曲がりへ動かさず、息を整える所そのものを指す。
      pin.x = shelter.x; pin.z = shelter.z; pin.r = 3; pin.hide = 0;
      pin.arrived = near(rt.player.u.pos, shelter, 3);
      return pin;
    }
    // 安全な退き先がまだ見つからない間も、敵へ進む印に戻さない。
    if (retreatRequired(rt)) return null;
    if (step === 4) return null;
    // 合流を命じた時は敵や輪の中央へ誘わず、台詞と同じ味方の印へ向ける。
    if (F.guideJoin || F.townWaiting && F.townAlly || F.innerWaiting && F.innerAlly) {
      pin.x = F.roadGuide.x; pin.z = F.roadGuide.z;
      pin.r = 1; pin.hide = 0; pin.route = F.guideBend;
      pin.waiting = true;
      return pin;
    }
    const enemy = this.missionSignTarget(rt);
    if (enemy) {
      if (rt.player.inRange && rt.player.rangeCueTarget === enemy) return null;
      const way = chaseWay(rt.army, rt.player.u, enemy.pos);
      pin.x = way.x; pin.z = way.z; pin.r = pin.hide = .2;
      pin.route = way !== enemy.pos; pin.unit = pin.route ? null : enemy;
      pin.enemy = !pin.route; pin.approach = true;
      return pin;
    }
    // 守り場に着いてもピンを残す。勝家の兵も同じ持ち場へ進む。
    const post = step === 6 ? INNER : step === 5 ? TOWN : F.roadGuide;
    const reached = step >= 5 && near(rt.player.u.pos, post, step === 6 ? 12 : 14);
    const way = reached ? post : chaseWay(rt.army, rt.player.u, step === 0 ? F.nobuU.pos : post);
    pin.x = way.x; pin.z = way.z; pin.r = reached ? (step === 6 ? 12 : 14) : 3;
    pin.hide = 0; pin.route = !reached; pin.waiting = pin.defend = step >= 5;
    pin.arrived = reached;
    return pin;
  },
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（docs/lethal_howto.md）。11/9 先取り（織田D）：弱めて入れる（突然の討死は二つまで・三分過ぎから）
  compactIntro: true,
  introKeepControls: false, // 始まりの札には操作の説明を足さない。
  introTaskFirst: true, // 横持ちでも人物紹介より先に、進み方と勝つ条件を読めるようにする。
  introPeopleFolded: true, // 人物の説明は開いて読む。初めは進み方と勝つ条件を一枚に収める。
  compactFieldGuides: true, // 敵を人型の太い枠で覆わず、頭の脇の小さな印で示す。
  noUnitContrast: true, // 白い簡略人型は別の描画。頭上の敵味方の印を残し、具足を見せる。
  compactCombatGuides: true,
  compactApproachGuide: true, keepApproachTaskPanel: true, // 接近先の大札を重ねず、足元の向きと左上の下知で近づく。
  enemyCornerSign: true, enemyFrameAtPosition: true, enemyFootRingRadius: 0.4, // 接近中の敵も現在地の四隅と小さな守り場で示し、具足を空ける。
  nearbyEnemySignRange: 0, // 刀は狙う一人だけ。周囲の三人にも重ねて槍先を隠さない。
  compactWaitGuard: true, // 横持ちでは防御札を親指側の端へ固定し、敵の槍を空ける。
  compactRetreatSign: true, compactRetreatArea: true, // 退き先の旗と守り場で左下の命の札を覆わない。
  singleRetreatArrow: true, retreatArrowLength: 72, // 足元に退く向きだけを示し、目前の兵へ長い白線を重ねない。
  retreatDestinationArrowOnly: true, // 退き先も矢印一つ。敵の印に大旗・白い輪・「ここへ」を重ねない。
  nearAllySolidBody: true, nearAllyWholeOcclusion: true, // 視点に重なる味方は、顔や胴を別々に透かさず描く間だけ避ける。
  enemyCornerSign: true, // 描画側が読む指定で四隅を細くし、敵の槍と具足を空ける。
  enemyFrameAtPosition: true, // 動く骨の更新順に左右されず、兵の現在地へ印を合わせる。
  enemyFootRingRadius: 0.4, // 相手の足元だけを示し、隣の兵まで大きな白守り場で囲まない。
  bodyHeightGuides: true, // 徒歩兵を一律の高さで囲まず、笠のすぐ上へ敵の印を寄せる。
  namedGuideMarkers: true, // 同じ旗印でも、味方・敵・道の曲がりを言葉で分ける。
  singleDestinationArrow: true, // 道の先と足元に矢印を重ねず、次の行き先一つへ導く。
  routeGuideArrowOnly: true, // 道の曲がりは矢印だけ。そこに実物の旗があるように見せない。
  directionalDestinationArrow: true, // 道の先を指す印も進む向きにそろえ、下がる操作と取り違えさせない。
  hideEdgeGoalDistance: true, // 歩数の字を足さず、行き先はピンで示す。
  avoidDestinationNotices: true, // 上の軍勢札や右の任務札に印が隠れる時は、空いた側へ向きを示す。
  compactDestinationSign: true, // 近い兵や槍を覆わず、携帯でも読める大きさの案内にする。
  hidePlayerSign: true, // 自分は姿と視点で分かる。肩越しで体から離れて見える輪を重ねない。
  noGroundGuide: true, // 通し確認で残った足元の矢印・輪を出さず、行き先の印にまとめる。
  standardClothScale: 0.72, // 狭い峠の肩越しでも、布の脇から敵の顔と槍先を見渡せる大きさにする。
  fadeCloseStandards: true, fadeCloseStandardFrame: true, // 近い旗の判定に使う。薄くする範囲の隊旗は下の更新で竿ごと隠す。
  woundedStandardsFall: true, // 生きていても深手で持てない旗は地へ落とし、隣の兵が拾う。
  immediateTaskChanges: true,
  immediatePhaseTasks: true,
  keepTaskLabel: true,
  keepDestinationTask: true, // 「次の曲がりへ。道の先へ」と重ねず、今の下知をそのまま読む。
  keepRetreatReason: true, // 命が多くても、息切れ・包囲・手傷のどれで退くかを残す。
  keepWoundRetreatReason: true,
  woundRetreatNeeded: toneWoundRetreat, // 任務と地面の印で同じ負傷の判定を使う。
  keepTaskPanel: true, // 接敵しても札を敵の胴へ移さず、左上の同じ欄で読む。
  speechAllowed(rt, speaker, text) {
    const F = rt.flags;
    if (text === F.departureLine) return !F.ending && F.step === 0;
    const step = TONE_PHASE_ORDERS.get(text);
    if (step !== undefined) {
      if (F.ending || F.step !== step || retreatRequired(rt)) return false;
      // 合流や守りへ変わった後に、遅れて届いた「敵を崩せ」を読ませない。
      if (step >= 1 && step <= 3 || step === 5)
        return !F.guideJoin && F.stageDefenders[step].some(fighting);
      // 奥へ着いた後に、遅れた移動の下知で守りを中断させない。
      return !near(rt.player.u.pos, INNER, 12);
    }
    // 使番が取り次いだ同じ下知にも、今の持ち場の判定を通す。
    // 構える相手や合流人数が変わったら、前の下知を読み続けない。
    if (INNER_GUARD_LINE.test(text)) return !F.ending && F.step === 6 &&
      !!toneGuardEnemy(rt) && text === F.innerGuardTask;
    // 表示待ちだけでなく、共通処理で数秒遅れて届く下知も今の任務で確かめる。
    if (text === '道をたどれ。山へ入らず、味方と進め')
      return !F.ending && F.step >= 1 && F.step <= 3 && !F.guideJoin && !F.guideVisible &&
        F.stageDefenders[F.step].some(fighting) && !toneCloseEnemy(rt);
    if (text === '道が開いた。逃げる兵は追わず、峠へ進め')
      return !F.ending && F.step === 3 && !fighting(F.r4) && !F.guideJoin;
    if (text === '道が開いた。逃げる兵は追わず、城下へ進め')
      return !F.ending && F.step === 5 && !fighting(F.townG) && !F.townJoined;
    if (text === '道を塞ぐ敵を追い払え。それから守り通せ')
      return !F.ending && F.step === 6 && F.innerJoined && fighting(F.innerG);
    if (CHASE_JOIN_LINE.test(text)) return !F.ending && F.step >= 1 && F.step <= 3 && !!F.guideJoin;
    if (TOWN_JOIN_LINE.test(text)) return !F.ending && F.step === 5 && !!F.guideJoin;
    if (TOWN_WAIT_LINE.test(text)) return !F.ending && F.step === 5 && F.townWaiting && text === F.townWaitTask;
    if (text === '一人で進むな。味方と奥の道へ向かえ')
      return !F.ending && F.step === 6 && !!F.guideJoin;
    if (INNER_WAIT_LINE.test(text)) return !F.ending && F.step === 6 && F.innerWaiting &&
      (text === F.innerWaitTask || text === F.innerGuardTask);
    if (INNER_HOLD_LINE.test(text)) return !F.ending && F.step === 6 && F.innerJoined &&
      rt.hud.root.hasAttribute('data-tonezaka-holding');
    if (INNER_RESTART_LINE.test(text)) return !F.ending && F.step === 6 && F.secureInterrupted &&
      text === F.secureRestartLine;
    return true;
  },
  combatTaskLabel(rt) {
    const F = rt.flags, H = rt.hud, u = H.defendEnemy;
    if (F.ending || F.step === 0 || F.step === 4 || !u || !fighter(u) ||
        !near(rt.player.u.pos, u.pos, CLOSE_REAR)) return '';
    // 共通の大きな指の札を増やさず、任務の一行で今の操作を教える。
    if (H.approachGuideEnemy === u) return '前の敵へ、味方と近づけ';
    if (!H.guardFacing) return `前の敵へ向け。${toneGuardAction()}`;
    if (H.attackGuideEnemy === u) {
      const attack = rt.player.weapon === 'sword' ? '斬れ' : '突け';
      return isTouch ? `「${rt.player.weapon === 'sword' ? 'きる' : '突く'}」を長押し、離して${attack}`
        : `左クリックを長押し、離して${attack}`;
    }
    return '敵へ構え、味方と押せ';
  },
  keepCombatTask: true, // 曲がりの印と敵の居場所の違いを、任務の補足にも残す。
  keepCombatTaskHeading: true, // 接敵しても「刀の印へ」だけに変えず、味方と進む下知を保つ。
  keepTaskWithGuard: true, // 構える釦が出ても、左上の任務を消さない。
  keepCombatTaskDetail: true, // 接敵の短い案内中も、味方と押す目的を札に残す。
  meleeApproachLabel: () => '味方と敵へ近づけ',
  meleeApproachText: '前の敵へ、味方と近づけ',
  // 距離は矢印の着く所まで。曲がりの四歩を、敵までの距離と取り違えない。
  distanceText(rt, distance) {
    const F = rt.flags;
    // 退く案内に、元の前進先の曲がりまでの距離を添えない。
    if (retreatRequired(rt)) {
      if (!toneShelter(rt)) return '敵を見て、味方の後ろへ';
      return distance < 3 ? '退き先まですぐ近く' : `退き先まであと${Math.ceil(distance / 0.75)}歩`;
    }
    // 輪に着いてから中央までの距離を出すと、守る兵のそばを離れさせてしまう。
    if (F.step === 6 && near(rt.player.u.pos, INNER, 12) && !F.innerAlly)
      return fighting(F.innerG) ? '道の敵を追い払え。それから守り通せ' : '守り場に到着。味方のそばを守れ';
    if (F.step === 5 && F.townWaiting && !F.townAlly) return toneGuardEnemy(rt)
      ? '守り場に着いた。敵を見て味方を迎えよ' : '守り場に着いた。勝家の兵を待て';
    const place = F.step === 0 ? rt.G.lord ? '馬廻まで' : '信長公まで'
      : F.townWaiting ? F.townAlly ? '味方のそばまで' : '守り場まで'
      : F.innerWaiting ? F.innerMeetReady ? '味方のそばまで' : F.innerAlly ? '味方まで' : '守り場まで'
      : F.guideBend ? F.guideJoin ? '合流する道の曲がりまで' : '曲がりまで'
      : F.guideJoin ? '味方まで' : F.guideVisible ? '敵の列まで'
      : F.step === 6 ? '奥の道まで' : F.step === 5 ? '城下まで'
      : F.step === 3 ? '峠まで' : '道の先まで';
    return distance < 3 ? `${place}すぐ近く` : `${place}あと${Math.ceil(distance / 0.75)}歩`;
  },
  // どの画面でも札には今の一手だけ残す。詳しい下知は任務を開いて読める。
  taskDetail(rt, title, progress) {
    const F = rt.flags;
    if (F.ending || F.step === 0 || F.step === 4) return progress;
    // 手傷や息切れでは退き方を先に伝え、城下では合流先と守る条件を残す。
    if (retreatRequired(rt)) return toneShelter(rt)
      ? toneGuardEnemy(rt) ? '行き先は味方の後ろ。敵を見ながら下がれ' : 'そこで止まり、息を整えよ'
      : toneGuardEnemy(rt) ? '敵を見ながら、味方の後ろへ' : '近くの味方に寄り、息を整えよ';
    // 奥の道は寄せ手を追い払って守る。廃止した兵二人待ちや八秒の案内を戻さない。
    if (F.step === 6 && rt.hud.root.hasAttribute('data-tonezaka-holding'))
      return '奥の道で、勝家の手と守り通せ';
    if (F.step === 6 && toneGuardEnemy(rt)) return near(rt.player.u.pos, INNER, 12)
      ? '敵へ構え、道を塞ぐ敵を味方と追い払え'
      : F.guideJoin ? '敵を見て、勝家の兵へ寄れ' : '敵を見て構え、道をたどって奥の道へ';
    if (F.step === 6) return F.guideJoin ? F.guideBend ? '行き先は勝家の兵へ戻る道。道なりに進め' : '行き先は勝家の兵。そばに寄れ'
      : !near(rt.player.u.pos, INNER, 12) ? F.guideBend ? '行き先は道の曲がり。奥の道へ進め'
        : '奥の道で、勝家の手と守り通せ' : progress;
    if (F.step === 5 && F.townWaiting) return progress;
    if (F.guideJoin) return toneGuardEnemy(rt) ? '行き先は味方。敵を見て戻れ'
      : F.guideBend ? '行き先は味方へ戻る道。道なりに進め' : '行き先は味方。そばへ寄れ';
    if (toneGuardEnemy(rt)) return rt.player.guard ? '味方と並び、槍を向ける敵を押せ'
      : `敵へ向け。${toneGuardAction()}`;
    // 敵が退いた後は、旗へ戻さず次の持ち場へ案内する。
    if (F.step >= 1 && F.step <= 3 && F.stageDefenders[F.step].every((g) => !fighting(g))) return progress;
    if (F.guideVisible && F.guideEnemy && near(rt.player.u.pos, F.guideEnemy.pos, CLOSE_REAR)) return F.guideBend
      ? '行き先は道の曲がり。近くの敵は味方と追い払え' : '行き先は道を塞ぐ敵。味方と近づけ';
    if (F.guideBend) return F.guideVisible ? '行き先は曲がり。その先の敵へ味方と進め' : '行き先は道の曲がり。道なりに進め';
    return F.guideVisible ? '前の敵へ、味方と近づけ' : '行き先は道。味方の旗に続け';
  },
  retreatGuideLabel(rt, reached) {
    if (reached) return '味方の後ろで息を整えよ';
    // 携帯では気力の帯が隠れる。いのちが残っていても退く理由を示す。
    if (rt.player.u.hp < rt.player.u.maxHp * 0.3) return '傷が深い。味方へ下がれ';
    if (rt.player.u.wounds?.bleed > 0.0001) return '血が出ている。味方の後ろへ';
    if (toneWoundRetreat(rt)) return '手足の傷が重い。味方の後ろへ';
    if (rt.player.u.mobbed) return '囲まれた。味方へ退け';
    if (rt.player.sta < 20) return '息が切れた。味方へ下がれ';
    if (rt.t < (rt.retreatUntil || 0)) return '傷を受けた。味方へ下がれ';
    return '味方の後ろへ下がれ';
  },
  travelGuideLabel(rt) {
    const F = rt.flags;
    if (F.step === 5 && F.townWaiting) return toneGuardEnemy(rt)
      ? F.townAlly ? '敵を見て、勝家の兵のそばへ' : '敵へ構え、守り場で味方を迎えよ'
      : F.townAlly ? '勝家の兵のそばへ' : '守り場で待て';
    if (F.step === 6 && F.innerWaiting) return F.innerAlly ? '勝家の兵のそばへ' : '守り場で待て';
    if (F.step === 6 && !F.guideJoin && !F.guideBend)
      return near(rt.player.u.pos, INNER, 12)
        ? fighting(F.innerG) ? '味方と道を塞ぐ敵を追い払え' : '守り場で味方と守れ' : '奥の道へ';
    return F.guideJoin ? '味方へ' : F.guideBend ? F.guideVisible ? '道をたどり敵の列へ' : '曲がりへ' : F.guideVisible ? '敵の列へ' : '道の先へ';
  },
  nobiki: true, // 追い手が崩れた時は、鉦だけでなく法螺貝と退き太鼓で退く。
  immediateTaskChanges: true, // 合流・前進の札を十秒待たせず、今の印に合わせる。
  keepTaskLabel: true, // 近い敵の名札で、味方への合流や峠へ進む下知を消さない。
  keepCombatTask: true, // 構えの案内中も、同じ任務札に持ち場と守る残り秒数を残す。
  civilianCrowd: { bands: PEOPLE_BANDS },
  camMaxDown: .18, // 峠の下り坂で後ろの地形が高くても、真上から見下ろさず低い肩越しに保つ（共通の口）。
  spawn: { ...at(roadX(86) + 3, 86), heading: Math.PI + TURN },
  // 11/6 fix3_tonezaka（五4）：始まりの札に操作の説明を出さない。退く訳と追う形だけの二行
  // 11/6 fixc2220（五4）：始まりの札は戦の名・年・両軍の数・二行と「戦いを始める」だけ。「人物と戦場の説明を読む」を出さない
  introPeople: [],
  introSides: { a: '織田　約三万', b: '朝倉　約二万' },
  introText: '昨夜の嵐に大嶽砦が落ち、朝倉義景は陣を払って越前へ退く。信長公は先手を待たず、馬廻と自ら追う。',
  softOpen: 90, // 最初の追撃は本人の傷を半分にし、構えと退き方を覚える間を残す。
  // 任務の言葉との部分一致に頼らず、既に置いた道と味方の印を選ぶ。
  guideMarker(rt) {
    // 11/4：道の曲がり・合流の名札は出さない（字の印を重ねない。行き先は▼一つ）。
    if (rt.flags.ending || this.goalSignOnly) return null;
    if (toneShelter(rt)) return 'toneShelter';
    switch (rt.flags.step) {
      case 0: return rt.G.lord ? null : 'nobu';
      case 1: return 'toneFront';
      case 2: return 'toneRoad';
      case 3: return 'pass';
      case 5: return 'town';
      case 6: return !rt.flags.innerWaiting && !rt.flags.guideJoin && near(rt.player.u.pos, INNER, 12) ? null : 'inner';
      default: return null;
    }
  },
  // 肩越しの視点を低く構え、真上から見下ろさない（10/28 資料との差：地面から2m ほど）。一人称の目の高さは保つ。
  clampCamera(rt, p) {
    if (!rt.player.u.alive || rt.over) return;
    p.y = Math.max(rt.world.heightAt(p.x, p.z) + 1.0, Math.min(p.y, rt.player.u.pos.y + 2.3));
  },
  cutFloor: 0.35,   // 11/1：構えずに受けた一太刀は命の一割八分（侍は二割）
  meleeGrace: { rate: 1, burst: 1, interval: 4 },   // 11/1：刃を受けた後の4秒は次の刃が通らない（一太刀五割のまま、同じ一瞬に二太刀・三太刀を浴びて倒れない）
  playerRegen: 0.02,   // 稲生の標準：戦っていない間は命が戻り、血も止まる（player_hurt.js）
  playerTaken: 0.75,   // 受ける傷を七割五分に（稲生の初陣は六割。最後まで戦い通せるように）
  // 身の回りの当時の場（timeslip_field.js）。天正元年八月十三日は今の九月半ば。夜の風雨（『信長公記』）。
  // 退く朝倉勢を追う峠道はぬかるみ、水たまりと折れた枝。道に沿って朝倉方の旗・槍・脱げた陣笠が捨てられている。
  timeslip: {
    laySpear: toneGroundSpear,
    wet: 1, dust: 0.05, trample: 0.4, debris: 1.2, arrows: 0.35, branches: 0,   // 11/8 critic60（八1「緑の角ばった塊が竿に刺さって転がる」）：葉の付いた折れ枝を置かない
    grass: 0x748a4c, grassTints: [0xffffff, 0xe0e6c0, 0xc8d0a0], grassH: 1.05, tallGrass: 0.9,
    flagColors: [0xe8e4d8, 0x1e1c1a, 0x30405a], hazeColor: 0x4a5258, mudOpacity: 0.3, pools: 0,   // 夜の月明かりでは泥と水たまりが黒い穴に見える。薄い踏み跡だけ
    fights: [...ROAD.map(([x, z]) => [x, z, 22]), ...CHASE_ROAD.map(([x, z]) => [x, z, 18])],
  },
  world: {
    playerAtkMax: 2,   // 11/1：本人へ同時に打ち込むのは二人まで（共通の既定の四人と一太刀五割では bot が倒れて負けた）。寄せる数・敵の強さは変えない
    seed: 15738,
    // 静かな景物は材質で結合し、画面外と遠い小屋の細部を送らない。
    compactScenery: true,
    mergeStaticBatches: true,
    // 本物の義景の供と南の後続は歩ける地面に収め、軽い本隊は場の外に置く。
    moveLim: 280,
    groundHalf: 300,
    time: 'night',   // 十三日夜中の追撃から始める。
    overcast: true,  // 11/8 critic60（二1・四5「雨の峠から青空に白い雲の明るい丘へ急に変わる」）：一乗谷の昼も一面の薄雲の空
    crowdFighter: toneCrowdFighter,
    // 馬の土煙で共通の見通しが十八歩まで縮み、先の供まで消えるのを防ぐ。
    // 煙そのものと夜の霞は残し、この谷の追い手と次の曲がりを見渡せる範囲を保つ。
    smokeFogFloor: 100,
    unitNightScale: 0.45, // 近い兵の補光を抑え、漆の胴と袖を白い縁で囲まない。夜道の照明は保つ。
    // 厚い雲の夜に晴夜用の月光を重ねず、山腹の白飛びを抑える。
    nightMoonMin: 0.7, // 10/31 雨の夜のまま、具足の受光面が読める所まで（0.55 では黒く沈んだ）
    nightFill: 0.6,
    nightLift: 1.8, // 雨雲の夜。共通の強い持ち上げで山肌まで昼の明るさにしない。
    ordinaryFlagStride: 3, // 無名の足軽の指物を減らし、騎馬と槍先を見せる。割合は補完。
    rainOpacity: 0.42, // 雨筋を夜にも見せる（既定 0.24）。0.95・0.62 でも白い描いた線に見えた（10/29 点付け）
    rainDir: [2.6, 0.4], // 風下へ横から強く吹きつけ、雨筋を画面の斜めに流す（長さが横風の強さ。南を向く画面で約25度傾く）。
    windStrength: 1.8, // 雨と一緒に風が吹き、道の脇の草が大きくなびく。
    lightning: false, // 追撃の夜まで雷が続いたとは確定できない。
    rainSplashScale: 0.3, // 弱い雨の跳ねを小さくし、街道を白い虫の群れのように見せない。
    muddy: 0.95,
    softEarthCrust: true, // 土塊の境だけを残し、道に升目の陰を並べない。
    erodedSlopes: true,
    noHaori: true, // 足軽を主に、武将にも陣羽織・母衣を着せない。
    variedInfantry: true, variedLoanArmor: true, variedHeadgear: true,
    kasaDrape: false, // 資料本四十七頁は首布付きの陣笠を江戸期と区別。天正の兵へ一律に足さない。
    meleeGroundedFeet: true, // 近い十八人までの既存の足合わせで、坂の踏み込み・受け・向き直りを地へ据える。
    rearSpearSupport: true, // 前列と間がある後列は肩越しに槍を送り、押し返しに合わせて柄を引く。密着時は立てる。
    longHoro: 'round', // 母衣は既存の丸い籠と布を使い、騎馬の背へ細い板を垂らさない。
    variedMarch: true, strideLimit: 1.25, // 退く列の歩調をばらし、走る腿を頭まで上げない。
    retreatLooks: true, // 退き口を気にする肩と首を、兵ごとに間をあけて滑らかに動かす。
    stagedRetreatPose: true, // 後列から崩れる順に、肩・槍・銃と退く声を逃げ足へ合わせる。
    retreatFootwork: true, retreatStrain: true, // 退き足と、疲れて前屈みになる上体を合わせる。
    smoothSlopeFooting: true, // 坂の境で足元を跳ねさせず、逃げる兵は上り下りに応じて胸と腰を支える。
    retreatGunCarry: true, // 崩れた鉄砲兵は銃を抱え、走りながら狙い直したり勝鬨を上げたりしない。
    waitingGunBreath: true, // 火縄を庇って待つ鉄砲の列にも、兵ごとの息と支え直しを残す。
    rainGunDiscipline: true, // 応じる声の間も火縄を袖で庇い、濡れた列で銃を振り上げない。
    gunHandlingPriority: true, // 装填と発射の反動を優先し、途中で銃を掲げたり火縄の手入れへ戻ったりしない。
    gunShoulderRecoil: true, // 発射の重みを手元だけでなく肩と腰で受け、ゆっくり構えへ戻す。
    livingSpearHedge: true, retreatSpearCarry: true, // 槍衾の息と押し返し、敗兵が柄を抱えて逃げる姿。
    slopeSpearHedge: true, retreatSpearBalance: true, // 坂へ穂先を向け、振り返る敗兵は柄を抱えて釣り合いを取る。
    contactSpearPressure: true, irregularRetreatLooks: true, // 押された柄を戻す間と、左右を確かめる間を兵ごとに変える。
    contactBreath: true, contactEffortVoice: true, // 待つ胸は小さな呼吸だけ。受け止めた拍子に近い兵が短く呼び合う。
    retreatThreatLooks: true, // 近くの敗兵は、実際に迫る追手の側を肩越しに確かめる。
    fallPaceSpread: 0.35, slopeContactFalls: true, // 膝が折れる間をばらし、坂下の胴も地面で支える。
    terrainContactFalls: true, // 坂を下る途中の高さの遅れを板床と取り違えず、倒れる胴を地面へ収める。
    plantedCollapse: true, // 膝を折る間は足元を保ち、胴が倒れる重みで地へずれる。
    carryFallPosture: true, // 押す肩・逃げる前傾を引き継ぎ、討たれた瞬間に直立へ戻さない。
    weightedFallTravel: true, // 立ち止まった兵は胴が崩れる側へよろめき、空いた所へ横滑りしない。
    blockedFallTravel: true, // よろめきと接地後の滑りを、柵や木戸の手前で止める。
    groundedMudSlide: true, // 胴の接地後に短く滑り、湿った坂で減速して止まる。
    momentumFalls: true, softFallSettle: true, // 走る勢いを倒れ先へ残し、湿った土では胴の弾みを早く収める。
    collapseWeaponRelease: true, // 同じ秒数で手を開かず、膝や胴が崩れる拍子に武器を離す。
    completeCrowdLegs: true, // 遠目で中の体を隠す時も、草摺から臑当まで袴と布を残す。
    drawTimeUnitParts: true, // 移動後の骨と具足の逆行列を描く時にそろえ、部品や槍を取り残さない。
    fullTipMatrices: true, // 遠い兵も手首と指をそろえ、近景まで皮膚が帯状に伸びるのを防ぐ。
    movingHiddenBones: true, // 画面外を進む兵も、根元が動いた時だけ骨を同じ位置へ移す。
    groundedFalls: true, settleSideFalls: true, // 横斬りで崩れた肩と胴を坂へ寝かせる。
    spreadFalls: true, // 討死の時だけ通れる倒れ先を探し、狭い峠道で亡骸を同じ所へ重ねない。
    collapseTravelLimit: 0.8, // 空いた所へ飛ばず、足を置いた所から半歩の範囲で崩れる。
    groundedFallImpact: true, wetEarthBursts: true, // 地を打つ時に音と低い泥粒。雨後に白い土煙を立てない。
    torsoFallImpact: true, contactFalls: true, // 胴が倒れ切って接地した一度だけ、音と泥を出す。
    scaledFallImpact: true, // 兵の体格に合う胴の下から接地音と泥・水を出す。
    weightedFallImpact: true, // 膝から崩れる時と走って倒れる時で、接地音と泥の跳ねる強さを変える。
    slopeFallMud: true, // 胴から跳ねた泥も坂へ着いた時に消し、斜面を突き抜けさせない。
    momentumFallMud: true, // 走って倒れた胴の泥には、地へ滑り込む向きの勢いも残す。
    waterFallSplash: true, // 水へ倒れた胴は、泥の跳ねと地面の音を水しぶきへ替える。
    shallowBodySplash: true, // 浅瀬では水深と胴の重みに合わせ、低い水の払いを胴に沿って散らす。
    momentumFallSplash: true, // 敗兵が浅瀬へ倒れ込む時も、水を進行方向へ払う。既存の五粒を使う。
    shelteredContactSounds: true, // 柄を受ける声と胴の接地音も、家や塀を隔てれば弱く届く。
    terrainFallSounds: true, // 尾根の向こうで倒れた胴の音も弱め、目の前の倒れ込みと区別する。
    unhorseContact: true, // 落馬でも空中には鳴らさず、地を打った時に一度だけ音と泥を出す。
    muddyFootsteps: true, // 小雨でも足踏みは乾いた煙ではなく、低く跳ねて落ちる泥粒。
    contactMudParticles: true, // 着地と倒れ込みだけの小さな泥粒を共用し、漂う土煙にはしない。
    contactDust: false, // 押し合いも上の実際の着地・擦り足で泥を出す。腰下の蹄用の跳ねと霞を二重に重ねない。
    bareFallenHats: true, slopeLitter: true, // 落ちた笠は首布を外し、笠と武具を坂へ沿わせる。
    rocks: 0, // 黒い大岩を重ねず、刀根坂で設営する百四十四個の小さな露岩を使う。
    slopeRockFaces: true, // 坂の外へ岩の厚みを向け、黒い薄板に見せない。
    groundedSlopeRocks: true, // 岩を坂へ埋め、谷をまたぐ黒い扇形の接地影を省く。
    templeNeedles: true, thickTrees: true, // 共通の丸い葉房と枝付きの幹を使う。
    layeredNeedles: true, raggedNeedles: true, // 既存の枝先の凹凸を使い、杉の整った三角の段を崩す。
    cedarBoughs: true, nearCedarBranches: true, cedarBoughPitch: 1.3, cedarBoughWidth: 1.1, keepNeedleLayers: true, // 杉を写真の葉房にし、縁がブロックの板に見えないように（木ノ芽峠と同じ）。
    closedFarCrowns: true, // 遠い雑木の重なる頂点を同じ量だけ動かし、黒い房の継ぎ目を閉じる。
    terrainTags: true,   // F1：ぬかるみ・坂・道で速さと疲れが変わる（terrain_tags.js。騎馬はぬかるみと坂で弱る）
    yieldAlliedHorse: true, // 徒歩の主人公も味方の馬の胴をすり抜けず、列の脇へ譲る。
    keepSpawnInside: true,
    noticeRepeatGap: 1e9, // この戦で一度見た知らせは再掲しない。任務の札は残す。
    blockedEscape: true,
    blockedEscapeAfter: 0.7, // 通れる横道を確かめて列の脇へ出る。
    blockedHint: (rt) => `${rt.blockedMove?.cause || '道の障り'}で足が止まった。${rt.phase === 'brief' ? '下知を聞き、馬廻が動いてから続け' : '山腹へ登らず、街道の内で列の脇を通れ'}`,
    paths: [ROAD, CHASE_ROAD],
    height,
    moveWay: chaseWay,
    fleeWay: toneFleeWay,
    guideWay: (u, p) => chaseWay(null, u, p), // 足が止まった時の案内も街道の曲がりに沿わせる。
    tint(x, z, h, c) { if (Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) > 16) c.setRGB(c.r * 0.82, c.g * 0.88, c.b * 0.8); },
    clear: (x, z) => Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) < 13 || Math.hypot(x - TOWN.x, z - TOWN.z) < 38 || peopleNear(x, z),
    trees: 700,
    tufts: 2600,
    tuftTint: 0x69755c, // 夜の補光で葉先が白い粒に見えないよう、湿った林床へ寄せる。
    treeDensity: (x, z) => {
      if (Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z)) < 18 || Math.hypot(x - TOWN.x, z - TOWN.z) < 38) return 0.15;
      return 0.25 + 0.75 * sstep(-0.45, 0.55, Math.sin(x * 0.065 + Math.sin(z * 0.037) * 2) * Math.cos(z * 0.09));
    },
    // 葉が画面の上へ抜ける背の高い竹藪を置かず、枝葉のある雑木の林縁にする。
    noBamboo: true,
    // 刀根坂の峠の両脇は杉の森（街道の口は開ける）。
    groves: [{ ...at(30, 40), r: 12, n: 16, kind: 'broad' }, { ...at(-34, -60), r: 12, n: 16, kind: 'broad' },
      { ...at(-30, -150), r: 11, n: 14, kind: 'sugi' }, { ...at(16, -186), r: 8, n: 12, kind: 'sugi' },
      { ...at(-28, -125), r: 9, n: 10, kind: 'sugi' }, { ...at(22, -128), r: 9, n: 10, kind: 'sugi' },
      // 持ち場の先の街道の両脇にも杉を並べ、最初の画面から峠の杉の森が道を挟んで見えるように。
      { ...at(-27, 62), r: 8, n: 11, kind: 'sugi' }, { ...at(12, 56), r: 6, n: 10, kind: 'sugi' },
      { ...at(-26, 30), r: 9, n: 12, kind: 'sugi' }, { ...at(14, 28), r: 7, n: 12, kind: 'sugi' },
      // 持ち場の右手の明るい斜面にも杉の群れ（最初の画面の右半分が裸の草地に見えないように）。
      { ...at(9, 48), r: 5, n: 8, kind: 'sugi' }, { ...at(13, 30), r: 6, n: 9, kind: 'sugi' }],
    fleeOut: (x, z, team) => team === 1 && along(x, z) < -235,
  },

  prelude: false, // この戦の使番と下知で開戦を伝え、共通の待ちを重ねない。
  setup(rt) {
    { const P = rt.player, td = P.takeDamage, k = rt.def.cutFloor; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const d = td.call(this, a, s); return s && !s.isStruct && !m && d > 0 ? d * k : d; }; }   // 11/1：刃の一太刀を def.cutFloor 倍に（共通の一太刀五割・六割は変えず、この戦だけ）
    const W = rt.world, F = rt.flags;
    timeslipField(rt);   // 身の回りの雨のぬかるみ・水たまり・捨てられた旗と槍（def.timeslip）
    // 退く朝倉勢が道に捨てた荷駄（荷車・俵・樽・箱）と、倒れた荷駄馬（資料との差 10/28：退く軍の見た目）
    // 橙の桶に見える外の樽は、主の荷だけでなく周りへこぼす荷からも外す。
    wayLitter(rt, LOCAL_ROAD.filter(([, z]) => z < 150 && z > -175).map(([x, z]) => xz(x, z)), { seed: 1573, step: 15, off: 5.4, clear: 3.6, exclude: ['barrel'],
      // 持ち場の近く（z 28〜95）は外の素材の角ばった袋（橙の箱に見えた）を置かず、下の丸い俵と倒れた馬で荷駄の崩れを見せる。
      skip: (x, z) => { const lz = z * CS + x * SN; return lz > 28 && lz < 95; } });
    wayLitter(rt, CHASE_ROAD.slice(0, 4), { seed: 813, step: 18, off: 5.6, clear: 3.8, kinds: ['cart', 'sack', 'sack'], exclude: ['barrel'] });
    // 一頭目は持ち場から十数歩先の道の左の肩に、二頭目は右の肩に倒し、こぼれた俵と脱げた笠を添える（最初の画面に荷駄の崩れを。10/28 二度目）。
    // 25秒の時、主人公は持ち場から十五歩ほど進み（z≈55）、カメラは南（z の小さい方）を向く。崩れはその先 z 33〜46 の道の両肩へ。
    // 25秒の時、主人公は道の右（x≈-3, z≈56）に立ち、画面の右半分が空いた草地になる。その右の肩（x 2〜7, z 44〜50）にも倒れた荷駄馬と俵・笠を（10/29）。
    fallenHorses(rt, [[-14, 44, 0.5], [-1, 37, 2.2], [4, 47, 1.3], [9, 22, -0.4], [14, -66, 2.6], [-12, -118, 0.2]].map(([x, z, r]) => [...xz(x, z), r]));
    for (const [x, z, r, n] of [[-12.5, 40, 0.3, 3], [-2.5, 41.5, -0.6, 2], [-15, 48, 1.1, 2], [0, 33, 0.8, 2], [5.8, 44.5, 0.9, 3], [2.2, 49.5, -0.3, 2]]) { const p = at(x, z); rt.scene.add(tawara(W, p.x, p.z, r + TURN, n)); }
    droppedKasa(rt, [[-11, 42.5, 0.4], [-4, 46, 2.1], [-3, 35, 4.0], [-12.5, 36, 5.2], [1.5, 40, 1.3], [6.8, 48.5, 0.7], [3, 43.5, 2.9], [1.2, 47, 3.6]]);
    { const label = document.querySelector('#h-breath span'); if (label) label.textContent = ''; } // 左下の「馬の息」の字を消し、帯だけを残す（10/28 共通：字を消す）。
    // 夜の遠い山腹は霧の色まで薄れる。空も低い所を同じ霞へつなぎ、
    // 地面の外周や描画距離の切れ目を黒い空との大きな角に見せない。
    // 見上げても霞を残し、急な山の稜線のすぐ上だけ黒い天井へ戻さない。
    // 刀根坂の空だけを変え、昼・歩く地形・遠景の頂点数は保つ。
    W.skyMat.uniforms.toneHaze = { value: W.scene.fog.color };
    W.skyMat.uniforms.toneNight = W.nightU;
    // 空は実際の視点を中心に描く。高い坂や近い描画距離でも球面を切らない。
    // 奥行きを書かず先に描くので、山・林・兵は従来どおり空の手前に重なる。
    W.sky.frustumCulled = false;
    W.skyMat.depthTest = false;
    W.skyMat.vertexShader = `varying vec3 vP;
      void main() {
        vP = normalize(position);
        vec4 skyClip = projectionMatrix * vec4(mat3(viewMatrix) * mat3(modelMatrix) * position, 1.0);
        gl_Position = skyClip.xyww;
      }`;
    // 霧は色の仕上げ後に掛かる。空も同じ段で合わせ、画質による境目を作らない。
    W.skyMat.fragmentShader = 'uniform vec3 toneHaze; uniform float toneNight;\n' + W.skyMat.fragmentShader.replace(
      '#include <colorspace_fragment>', `#include <colorspace_fragment>
          vec3 toneSkyHaze = toneHaze * (1.0 - 0.15 * smoothstep(0.0, 0.85, max(d.y, 0.0)));
          // 一色の紺の天井にしない：低く垂れた雨雲の濃淡（向きだけで決まる、毎コマの計算は少し）。
          vec2 tcU = d.xz / (max(d.y, 0.0) + 0.22);
          float tc = sin(tcU.x * 1.7 + sin(tcU.y * 1.3) * 1.6) * sin(tcU.y * 1.9 + sin(tcU.x * 2.3) * 1.1);
          tc += 0.5 * sin(tcU.x * 4.1 - tcU.y * 3.3 + sin(tcU.y * 5.0)) * sin(tcU.y * 4.7 + tcU.x * 1.9);
          toneSkyHaze *= 0.7 + 0.6 * smoothstep(-1.1, 1.3, tc) * (1.0 - 0.35 * smoothstep(0.2, 0.95, d.y));
          // 雲の奥の月：峠の先（画面の正面のやや左上）の雲だけ縁が銀に透け、杉の梢の上に淡い光の溜まりを作る（10/29 点付け：空が一色・光なし）。
          float toneMoon = max(dot(normalize(d), normalize(vec3(-0.45, 0.4, -0.85))), 0.0);
          float toneHalo = pow(toneMoon, 10.0), toneRim = smoothstep(0.15, 0.95, tc) * pow(toneMoon, 4.0);
          toneSkyHaze += vec3(0.5, 0.56, 0.62) * (0.1 * toneHalo + 0.12 * toneRim) * (1.0 - 0.4 * smoothstep(0.6, 1.0, d.y));
          // 霞の色は線形の値。色の仕上げの後で混ぜるので出力の色へ直す（直さないと空が真っ黒な天井になる）。
          gl_FragColor.rgb = mix(gl_FragColor.rgb, linearToOutputTexel(vec4(toneSkyHaze, 1.0)).rgb, toneNight * 0.92);`);
    W.skyMat.needsUpdate = true;
    // 雨筋が白い描いた線に見えた（10/29 点付け）。筋の頭から尾へ透けて消える濡れた灰にし、
    // 手前の太い筋と跳ねの冠も夜の暗さへ沈める。粒の数・形・動きは変えない。
    if (W.rain) {
      const g = W.rain.geometry, n = g.attributes.position.count, ca = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) ca.set([1, 1, 1, i % 2 ? 0 : 1], i * 4);   // 偶数が筋の頭（下）、奇数が尾（上）
      g.setAttribute('color', new THREE.BufferAttribute(ca, 4));
      W.rain.material.vertexColors = true; W.rain.material.color.setHex(0x8e999f); W.rain.material.needsUpdate = true;
    }
    if (W.rainNear) W.rainNear.material.uniforms.color.value.setHex(0x7f898e);
    if (W.splashPts) { W.splashPts.material.color.setHex(0x8a9397); W.splashPts.material.opacity = 0.45; }
    // 共通の林の形は保ち、この戦で作った葉の材質だけを変更する。
    const shadedLeaves = new Set();
    for (const mesh of W.treeMeshes || []) {
      const mat = mesh.material;
      if ((!mesh.customDepthMaterial && !mesh.userData.treeFoliage) || !mat?.alphaTest || shadedLeaves.has(mat)) continue;
      shadedLeaves.add(mat);
      const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
      mat.customProgramCacheKey = () => key + '|tonezaka-near-leaves';
      mat.onBeforeCompile = function (sh) { compile.call(this, sh); toneLeafFade(sh); };
      mat.needsUpdate = true;
    }
    // 刀根坂の地面だけに土の斑・砂利・途切れた踏み跡を重ねる。
    // 既存の絵と地面の一回の描画を使い、低画質でも濃淡を残す。
    const groundMat = W.terrain.material, compileGround = groundMat.onBeforeCompile;
    const groundKey = groundMat.customProgramCacheKey();
    const roadSegments = [ROAD, CHASE_ROAD].flatMap((road) => road.slice(1).map((p, i) => {
      const a = road[i], dx = p[0] - a[0], dz = p[1] - a[1];
      return `{
        vec2 a = vec2(${a[0].toFixed(5)}, ${a[1].toFixed(5)});
        vec2 d = vec2(${dx.toFixed(5)}, ${dz.toFixed(5)});
        vec2 q = wuv - a;
        float t = clamp(dot(q, d) / dot(d, d), 0.0, 1.0);
        toneRoad = min(toneRoad, length(q - d * t));
      }`;
    })).join('\n');
    groundMat.customProgramCacheKey = () => groundKey + '|tonezaka-road-horizon-wet';
    groundMat.onBeforeCompile = function (sh) {
      compileGround.call(this, sh);
      toneHorizonFog(sh, W);
      // 山腹の土色と岩の投影を、三角ごとの面法線で切り替えない。
      // 既存の頂点法線を補間し、同じ坂で草・土・岩が連続するようにする。
      // 地面の形・歩く高さ・切岸の当たりは変えない。
      sh.fragmentShader = sh.fragmentShader.replace(
        'vec3 gN = normalize(cross(dFdx(vWP), dFdy(vWP)));',
        'vec3 gN = normalize(vWN);');
      // 斜面の向きで絵の座標を回すと、地面の三角ごとに雨溝が飛ぶ。
      // 刀根坂だけ連続した地面の座標へ固定し、土の斑で溝を崩す。
      sh.fragmentShader = sh.fragmentShader.replace(
        `vec2 bankUv = vec2(vWP.x * 0.096 + vWP.z * 0.072,
              vWP.y * 0.035 + vWP.z * 0.024) + vec2(macro2, macro) * 0.12;`,
        'vec2 bankUv = vWP.xz * 0.085 + vec2(macro2 - 0.5, macro - 0.5) * 0.22;');
      // 既定の窪みを一面に並べず、薄い跡をまばらに残す。
      // 歩いて刻む足跡と轍は保ち、ほかの戦の地面には触れない。
      sh.fragmentShader = sh.fragmentShader.replace('float clodK =',
        'float clodSparse = smoothstep(0.55, 0.85, clodSeed) * mix(0.06, 0.22, trod);\n          float clodK = clodSparse *');
      sh.fragmentShader = sh.fragmentShader.replace('diffuseColor.rgb *= col;', `
        float toneRoad = 10000.0;
        ${roadSegments}
        float toneLane = 1.0 - smoothstep(2.4, 4.8, toneRoad);
        float toneSoil = smoothstep(0.38, 0.7, macro2) * (1.0 - steep * 0.35);
        // 通れる幅は変えず、踏み固めた中央だけ湿った土として見せる。
        vec3 toneEarth = mix(dirt, mud, uWet * 0.45) * vec3(0.9, 0.82, 0.7);
        col = mix(col, toneEarth, max(toneLane * 0.72, toneSoil * 0.48 * (1.0 - smoothstep(5.0, 13.0, toneRoad))) * (1.0 - steep));
        // 道の肩から二十歩ほどは雨に踏み荒らされた濡れ土と倒れた草の斑。平らな緑の一枚に見せない（点検表 5）。
        float toneShoulder = (1.0 - smoothstep(4.0, 24.0, toneRoad)) * (0.45 + 0.4 * smoothstep(0.3, 0.7, macro));
        col = mix(col, mix(toneEarth, mud * vec3(0.7, 0.66, 0.58), 0.5), toneShoulder * 0.55 * (1.0 - steep * 0.5));
        float toneGravel = smoothstep(0.55, 0.76, edge) * smoothstep(0.38, 0.65, macro2);
        col = mix(col, stone * vec3(0.9, 0.86, 0.78), toneGravel * (0.1 + toneLane * 0.16));
        // 真っ直ぐな二本線を避け、雨で崩れた踏み跡を土の斑へなじませる。
        float toneTrail = 0.8 + macro * 0.6 + sin(wuv.x * 0.53 + wuv.y * 0.19) * 0.24;
        float toneRut = (1.0 - smoothstep(0.08, 0.65, abs(toneRoad - toneTrail))) * toneLane;
        toneRut *= smoothstep(0.38, 0.62, macro2) * (0.4 + edge * 0.6);
        col = mix(col, mud * vec3(0.65, 0.61, 0.53), toneRut * 0.22);
        col *= 1.0 - toneRut * 0.08;
        // 二枚の小田の湿った土と畦。地面の一回の描画に含め、面を重ねない。
        vec2 toneLocal = vec2(wuv.x * ${CS.toFixed(7)} - wuv.y * ${SN.toFixed(7)},
          wuv.x * ${SN.toFixed(7)} + wuv.y * ${CS.toFixed(7)});
        vec2 toneFieldA = abs(toneLocal - vec2(-10.0, 123.0)) - vec2(1.9, 3.0);
        vec2 toneFieldB = abs(toneLocal - vec2(-14.0, 108.0)) - vec2(1.9, 3.0);
        float toneFieldEdge = min(max(toneFieldA.x, toneFieldA.y), max(toneFieldB.x, toneFieldB.y));
        float toneField = (1.0 - smoothstep(-0.1, 0.15, toneFieldEdge)) * (1.0 - smoothstep(0.25, 0.4, steep));
        col = mix(col, mud * vec3(0.79, 0.8, 0.64), toneField * 0.65);
        float toneBank = (1.0 - smoothstep(0.05, 0.35, abs(toneFieldEdge - 0.25))) * (1.0 - steep);
        col = mix(col, dirt * vec3(0.75, 0.78, 0.58), toneBank * 0.65);
        // 夜の裸の山腹だけを湿った土色へ寄せる。街道と昼の城下の明るさは保つ。
        col *= mix(vec3(1.0), vec3(0.52, 0.55, 0.48), steep * uNight * 0.7);
        diffuseColor.rgb *= col;`);
      // 強い雨の街道：踏み固めた中央に水の膜が張り、篝火と空を鈍く映す（土の斑の所はざらつきを残す）
      sh.fragmentShader = sh.fragmentShader.replace('roughnessFactor = mix(roughnessFactor, 0.26, pool);', `roughnessFactor = mix(roughnessFactor, 0.26, pool);
          roughnessFactor = mix(roughnessFactor, 0.16, toneLane * (1.0 - steep) * smoothstep(0.2, 0.7, uWet) * (0.6 + 0.4 * smoothstep(0.35, 0.7, macro2)));`);
      // 夜は映す空が暗いので、浅い角度で見る濡れた道の面に空の照りを足す（遠くへ続く道が白く光って見える）
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float toneFr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
          totalEmissiveRadiance += uSoilSky * toneFr * toneLane * (1.0 - steep) * smoothstep(0.2, 0.7, uWet) * smoothstep(0.42, 0.72, macro2) * 0.2;
        }`);
    };
    groundMat.needsUpdate = true;
    // 峠全体に等間隔の篝火を並べず、里の小屋脇の灯だけを補う。
    // 追撃路の見通しは既存の夜の補光で保つ。灯の位置は史料にない復元。
    {
      const p = at(-24, 70);
      W.scene.add(kagaribi(W, p.x, p.z));
      W.addFire(p.x, p.z, { h: 1.35, size: 1.1, nightOnly: true });
    }
    // 雲のある夜の補光は控え、近い兵の輪郭は既存の補光で保つ。
    const lookOf = W.lookOf;
    W.lookOf = function (key) {
      const look = lookOf.call(this, key);
      if (key === 'night') {
        look.cover = 0.72; // 弱い雨の夜は雲を厚くし、晴天の星空を避ける。
        look.sunI = Math.max(look.sunI, 0.36);
        look.hemiI = Math.max(look.hemiI, 0.4); // 月と近い兵の補光は残し、山腹の一様な明るさだけを抑える。
        look.hemiSky.setHex(0x8999ad); look.hemiGround.setHex(0x514c41);
        // 空が一色の紺の板に見えた（10/29 点付け：手本は林の奥が霞んで白く明るい）。雨雲の夜明け前の灰青にし、
        // 霧を林より明るい雨霞の色にして、奥の杉ほど淡く抜ける。見通しの距離と明るさの持ち上げは変えない。
        // 11/1 kaito の紙 14「夜の山間で追う」：灰青では曇りの昼に見えた。空と霞を雨雲の夜の暗い青灰へ沈め、兵の補光（hemi・sun）は保つ。
        look.sky.setHex(0x2c353f); look.top.setHex(0x10161e); look.fog.setHex(0x323b44);
      }
      return look;
    };
    W.setTime('night');
    // 雨の夜は星を隠し、近い房は高さと向きをばらす。設営時だけ整える。
    if (W.stars) W.stars.material.opacity = 0;
    for (let i = 0; i < (W.nearOff?.length || 0); i++) {
      const off = W.nearOff[i];
      off[2] = 0.28 + ((i * 37) % 101) / 100 * 1.55;
      off[3] = i * 2.39996;
    }
    const grassAt = W.grassAt;
    W.grassAt = function (x, z) {
      const d = Math.min(distToPolyline(x, z, ROAD), chaseNear(x, z));
      if (d < 5) return 0;
      const patch = 0.5 + 0.5 * Math.sin(x * 0.31 + Math.cos(z * 0.23)) * Math.cos(z * 0.27);
      const slope = this.slopeTan(x, z);
      return grassAt.call(this, x, z) * sstep(0.28, 0.72, patch) * (1 - sstep(0.55, 1.0, slope));
    };
    W.nearCell = null;
    // 肩越しの本人の槍は、三節の別描画を重ねず、つながった一つの形で見せる。
    // 手元の構え・突き・柄の送りと、元の長さ・穂先・当たりは保つ。
    // 既存の共有形へ戻すだけで、新しい形や材質を毎コマ作らない。
    const poseSpear = rt.army.poseSpear;
    rt.army.poseSpear = function (u, dt, engaged) {
      poseSpear.call(this, u, dt, engaged);
      if (!u.isPlayer) return;
      const w = u.wpn, f = w?.userData.flex;
      if (!f || w.userData.standard) return;
      w.geometry = f.G.full;
      f.a.visible = false;
      f.on = false; f.ang = 0; f.vel = 0;
    };
    // 落とした槍は坂に沿って寝かせる。穂先と石突を地面の高さへ合わせる。
    const dropWeapon = rt.army.dropWeapon;
    // 大旗の下端は雨で重く折れ重なる。落ちた時だけ作り、同じ布は形を共用する。
    const fallenCloths = new Map();
    // 坂ごとに違う接地だけは旗ごとに持つ。同じ旗が再び倒れた時も形を再利用する。
    const groundedCloths = new Map(), clothPoint = new THREE.Vector3(), clothInverse = new THREE.Matrix4();
    const groundCloth = (cloth) => {
      // 土へ落ちた布には、宙の布用に足した風の揺れを掛けない。
      cloth.material = wetSources.get(cloth.material) || cloth.material;
      const source = cloth.geometry;
      let geo = groundedCloths.get(cloth);
      if (!geo) { geo = source.clone(); groundedCloths.set(cloth, geo); }
      else geo.copy(source);
      cloth.updateWorldMatrix(true, false);
      clothInverse.copy(cloth.matrixWorld).invert();
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        clothPoint.fromBufferAttribute(p, i).applyMatrix4(cloth.matrixWorld);
        clothPoint.y = drawGroundAt(W, clothPoint.x, clothPoint.z) + 0.025
          + Math.abs(Math.sin(p.getX(i) * 24 + p.getY(i) * 13)) * 0.018;
        clothPoint.applyMatrix4(clothInverse);
        p.setXYZ(i, clothPoint.x, clothPoint.y, clothPoint.z);
      }
      p.needsUpdate = true;
      geo.computeVertexNormals(); geo.computeBoundingBox(); geo.computeBoundingSphere();
      cloth.geometry = geo;
    };
    // この戦の大旗だけ、雨で重い裾に折れを残す。横木と竿際は動かさない。
    // 設営時に形を作り、同じ大きさの布で使い回す。共通の旗の形は変えない。
    const wetCloths = new Map(), wetFlagMats = new Map(), wetMaterials = new WeakSet(), wetSources = new WeakMap();
    const creaseFlag = (cloth) => {
      if (!cloth) return;
      const source = cloth.geometry;
      let folded = wetCloths.get(source);
      if (!folded) {
        folded = source.clone();
        const p = folded.attributes.position, uv = folded.attributes.uv;
        folded.computeBoundingBox();
        const width = folded.boundingBox.max.x - folded.boundingBox.min.x;
        for (let i = 0; i < p.count; i++) {
          const free = uv.getX(i), loose = 1 - uv.getY(i), k = free * loose;
          // 裾だけを曲げると上半分が板に見える。横木のすぐ下から縦の折れを通す。
          // 竿際と上端は留めたまま、雨で重い布の折れを共有形に刻む。
          const pleat = free * sstep(0, 0.2, loose);
          p.setXYZ(i, p.getX(i) - width * 0.22 * k * k,
            p.getY(i) - width * 0.06 * k,
            p.getZ(i) + width * 0.38 * Math.sin(free * Math.PI * 4 + loose * 1.4) * pleat);
        }
        folded.computeVertexNormals(); folded.computeBoundingBox(); folded.computeBoundingSphere();
        wetCloths.set(source, folded);
      }
      cloth.geometry = folded;
      // 共通の波の法線で折り形の法線を上書きしない。この戦の材質だけ写して共用する。
      const base = cloth.material;
      // 拾い直した旗は既にこの戦の材質。写しを重ねて揺れを二重にしない。
      if (wetMaterials.has(base)) return;
      let material = wetFlagMats.get(base);
      if (!material) {
        material = base.clone();
        // 雨を吸った布は白く光らない。この戦の写しだけ濡れた灰へ沈め、白い板に見せない（10/29 点付け）。
        if (material.color) material.color.multiplyScalar(0.6);
        material.onBeforeCompile = (shader, renderer) => {
          base.onBeforeCompile(shader, renderer);
          // 隊旗の共通材質には布の揺れがない。刀根坂の写しだけに風を通す。
          // 横木と竿側は留め、裾と外縁だけを動かす。毎コマ形を作り直さない。
          shader.uniforms.toneClothTime = { get value() { return SETTINGS.reduceMotion ? 0 : WIND_STATE.t; } };
          shader.uniforms.toneClothGust = { get value() { return SETTINGS.reduceMotion ? 0 : GUST.value; } };
          shader.vertexShader = 'uniform float toneClothTime, toneClothGust;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float toneLoose = uv.x * (1.0 - uv.y);
            float toneWave = toneClothTime * 2.4 + position.y * 3.1 + uv.x * 4.0;
            transformed.z += sin(toneWave) * toneLoose * 0.07 * toneClothGust;
            transformed.x -= (0.5 + 0.5 * sin(toneWave)) * toneLoose * 0.025 * toneClothGust;`);
          shader.vertexShader = shader.vertexShader.replace(
            'objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));',
            'objectNormal = normalize(objectNormal + vec3(-dzdx, -dzdy, 0.0));');
        };
        material.customProgramCacheKey = () => base.customProgramCacheKey() + '刀根坂の折り布';
        wetFlagMats.set(base, material);
        wetMaterials.add(material);
        wetSources.set(material, base);
      }
      cloth.material = material;
    };
    rt.army.dropWeapon = function (u) {
      const w = u.wpn, standard = !!w?.userData.standard;
      const spear = (u.wpnKind || u.lookWeapon) === 'spear' && !standard;
      dropWeapon.call(this, u);
      if ((!spear && !standard) || !w || u.dropped !== w || w.parent !== this.scene || w.userData.toneGround) return;
      w.userData.toneGround = true;
      if (standard && u.standardFlag) {
        const cloth = u.standardFlag, source = cloth.geometry;
        let folded = fallenCloths.get(source);
        if (!folded) {
          folded = source.clone();
          const p = folded.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i);
            const loose = Math.max(0, Math.min(1, (0.36 - y) / 0.64));
            const free = Math.max(0, Math.min(1, x / 0.36));
            // 横木と竿側の留めは残し、自由な下端ほど幅をすぼめてたたむ。
            p.setXYZ(i, x * (1 - loose * 0.55), y + loose * loose * free * 0.22,
              -0.012 - Math.abs(Math.sin(loose * Math.PI * 4 + x * 24)) * loose * free * 0.018);
          }
          folded.computeVertexNormals(); folded.computeBoundingBox(); folded.computeBoundingSphere();
          fallenCloths.set(source, folded);
        }
        cloth.geometry = folded;
      }
      // 共通側で決めた、体と隊列に沿う倒れ方を保つ。全員を北西へ回し直さない。
      const a = w.rotation.y;
      const tip = w.userData.tip ?? 2.2, butt = w.userData.butt ?? -1.2, L = tip - butt;
      const dx = Math.sin(a), dz = Math.cos(a), x = w.position.x, z = w.position.z;
      const y0 = drawGroundAt(W, x + dx * butt, z + dz * butt), y1 = drawGroundAt(W, x + dx * tip, z + dz * tip);
      const slope = Math.atan2(y1 - y0, L);
      // 両端だけでなく柄の全長を、実際に描く坂へ合わせる。
      // 坂の角度を切り詰めると、急斜面で石突だけを支点に穂先が浮く。
      const cs = Math.cos(slope), sn = Math.sin(slope);
      let support = -Infinity, low = Infinity;
      for (let i = 0; i <= 8; i++) {
        const t = butt + L * i / 8;
        const h = drawGroundAt(W, x + dx * cs * t, z + dz * cs * t) - sn * t;
        support = Math.max(support, h); low = Math.min(low, h);
      }
      // 谷をまたぐ硬い柄は地面へ曲げない。接地できない捨て槍だけを省く。
      if (spear && (!Number.isFinite(support) || support - low > 0.18)) {
        w.visible = false; return;
      }
      // 幟の柄は縦の形。共通の皺の形を使い、石突と竿先を同じ坂へ接地する。
      w.rotation.set(standard ? Math.PI / 2 - slope : -slope, a, 0, 'YXZ');
      w.position.y = support + 0.025;
      if (standard && u.standardFlag) groundCloth(u.standardFlag);
    };
    const clearMountains = toneMountains(W);
    const clearRoadside = toneRoadside(W);
    // 共通の勝ち名乗りは名のある敵将の討取りだけ。肉声と字幕を共に三十秒あける。
    const onKill = rt.onKill, say = rt.say, bark = rt.bark;
    const voiceTimes = new Map();
    const allowVoice = (line, interval = 120) => {
      const last = voiceTimes.get(line);
      if (last != null && rt.t - last < interval) return false;
      voiceTimes.set(line, rt.t); return true;
    };
    rt.bark = function (line, ...args) {
      // 横持ちの警告札で「下がれ」の末尾だけが次の行に落ちない長さにする。
      if (line === '囲まれた！　味方のいる所まで下がれ') {
        line = '囲まれた！　味方の列へ下がれ';
        F.regroupUntil = rt.t + 8;
      }
      if (line === '敵が脇へ回るぞ！　退き口を見ておけ！' ||
          line === '横へ回られるぞ！　囲まれる前に動け！' ||
          line === '左右へ回られた！　退き口を空けよ！' ||
          line === '脇へ回る敵がおる！　背を取られるな！') line = '敵が横へ回る！　味方の列で構えよ';
      // 危険が再び起きたら知らせる。同じ警告は八秒あける。
      if (allowVoice(line, 8)) return bark.call(this, line, ...args);
    };
    rt.onKill = function (victim, killer) {
      const chief = victim.team !== this.player.u.team && !victim.civ && !victim.isStruct &&
        (victim.isTaisho || victim.type === 'busho' && victim.name);
      if (killer && (!chief || this.t < (F.victoryVoiceAt || 0))) killer.killCryT = this.t;
      else if (killer?.alive && (killer.killCryT ?? -99) + 8 <= this.t) F.victoryVoiceAt = this.t + 30;
      const down = victim.team === this.player.u.team && !victim.civ && !victim.isStruct;
      const previous = F.allyDownNow; F.allyDownNow = down;
      try {
        // 槍も共通の倒れる動きで手が緩む時に落とす。被弾の瞬間に地面へ移さない。
        return onKill.call(this, victim, killer);
      } finally { F.allyDownNow = previous; }
    };
    rt.say = function (who, line, seconds) {
      if (who === '柴田勝家' && line.includes('嘆くのは後じゃ') && !F.allyDownNow) return;
      // 合流の下知と話し手のない危険の案内は、再び必要になった時も八秒あけて伝える。
      const interval = who === '組頭' || !who ? 8 : 120;
      if (allowVoice(line, interval)) return say.call(this, who, line, seconds);
    };
    // 足軽・信長とも、最初の打ち込みを受ける前に構えを教える。
    // 急ぎの字幕にして、下知の待ち列で案内が遅れないようにする。
    const windup = rt.army.hooks.onWindup;
    rt.army.hooks.onWindup = (enemy, target) => {
      windup?.(enemy, target);
      if (rt.over || !target.isPlayer || !target.alive || enemy.team === target.team || enemy.atk?.ranged || enemy.atk?.bow) return;
      F.guardEnemy = enemy; F.guardEnemyUntil = rt.t + 4;
      if (F.guardTip || rt.player.guard) return;
      // 字幕が出せなかった時は、次の打ち込みでも手ほどきを試せるようにする。
      if (rt.hud.say('', `敵が打つ！　敵へ向け。${toneGuardAction()}`, 4, true)) F.guardTip = true;
    };
    // 構えと狙いの名札は一つにまとめ、道の印とは既存の重なり避けで離す。
    const style = F.labelStyle = document.createElement('style');
    // 本文を指で送れ、出陣の釦は常に札の下へ残す。ほかの戦の札には触れない。
    style.textContent = '#hud[data-tonezaka] #boss,#hud[data-tonezaka] #target{top:24%;left:50%;right:auto;bottom:auto;transform:translateX(-50%);max-width:42vw;box-sizing:border-box;background:#14120f;color:#ece4d2;border:2px solid #c2a25a;padding:4px 8px;font-size:15px;line-height:1.4}#hud[data-tonezaka]:has(#target:not([hidden])) #boss{display:none}#hud[data-tonezaka] #markers .mk b{background:#14120f;color:#ece4d2;border:1px solid #c2a25a;padding:4px 8px}';
    // 人物紹介を開く所も指で押せる広さにする。本文だけを送り、出陣の釦を残す。
    style.textContent += `
      html body #hud[data-tonezaka] #intro .intro-people summary{
        box-sizing:border-box;min-height:44px;padding:10px 8px;margin-top:8px;
        color:#f2cd72;font-size:max(15px,calc(15px * var(--text-scale,1)));line-height:1.6;
        text-decoration:underline;cursor:pointer;
      }
      html body #hud[data-tonezaka] #intro .intro-people summary:focus-visible{
        outline:3px solid #c2a25a;outline-offset:-3px;box-shadow:0 0 0 2px #14120f;
      }
      @media(min-height:501px){
        html body #hud[data-tonezaka] #intro:has(#intro-go)>.card.card{height:auto;min-height:0}
        html body #hud[data-tonezaka] #intro .intro-reading{flex:0 1 auto;min-height:0;overflow-y:auto}
      }
    `;
    // 後から手ほどきの見た目が入っても、任務と同じ欄で縦に積む。
    style.textContent += '#hud[data-tonezaka] #battle-notices > :is(#objectives,#tutorial){position:relative !important;inset:auto !important;transform:none !important;width:100% !important;min-width:0 !important;max-width:100% !important;flex:0 0 auto;box-sizing:border-box;white-space:normal;overflow-wrap:anywhere}#hud[data-tonezaka] #battle-notices #objectives .battle-action{white-space:normal;overflow-wrap:anywhere}';
    // 開始直後の指の絵にも、押すだけでなくなぞる操作だと明記する。
    style.textContent += '#hud[data-tonezaka] #battle-opening .opening-move b{font-size:0}#hud[data-tonezaka] #battle-opening .opening-move b::after{content:"上へなぞって進む";font-size:max(16px,calc(16px * var(--text-scale,1)))}';
    // 道案内中の共通指定は任務を画面上端へ浮かせる。刀根坂では欄の中へ戻して重なりを防ぐ。
    style.textContent += 'html body #hud[data-tonezaka] #battle-notices:not(.choosing) #objectives.ground-order:not(.expand){position:relative !important;inset:auto !important;width:100% !important;max-width:100% !important}html body #hud[data-tonezaka] #battle-notices #objectives.travel-retreat.ground-order:not(.expand) li.cur .obj-now{white-space:normal !important;overflow-wrap:anywhere !important;word-break:normal !important;font-size:max(16px,calc(16px * var(--text-scale,1))) !important}';
    // 共通の二列組や縮まない本文を持ち越さず、下知を札の横幅いっぱいで読む。
    style.textContent += `
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur{
        display:block !important;grid-template-columns:minmax(0,1fr);width:100%;box-sizing:border-box;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur :is(.obj-text,.obj-now){
        display:block;width:auto !important;min-width:0 !important;max-width:100% !important;
        flex:1 1 auto !important;white-space:normal !important;overflow-wrap:anywhere !important;
        word-break:normal !important;overflow:visible !important;
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
    `;
    style.textContent += '#hud[data-tonezaka] #intro:has(#intro-go) > .card{display:flex;flex-direction:column;gap:8px;padding:16px 24px}#hud[data-tonezaka] #intro .intro-reading{width:100%;min-height:0;flex:1 1 auto;overflow-y:auto;touch-action:pan-y;pointer-events:auto;overscroll-behavior:contain;scroll-padding-bottom:16px}#hud[data-tonezaka] #intro .intro-reading > *{flex-shrink:0}#hud[data-tonezaka] #intro-go{flex:none}';
    // 合図の詳説は任務を開いて読む。退避中に古い進撃の合図を並べない。
    style.textContent += 'html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) #obj-list li.cur .obj-cue{display:none !important}';
    // パソコンでも道案内の補足を小字にしない。距離と下知を同じ欄で折り返す。
    style.textContent += `
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur small.goal-place{
        display:block !important;font-size:max(15px,calc(15px * var(--text-scale,1))) !important;
        line-height:1.5 !important;white-space:normal !important;overflow-wrap:anywhere !important;
      }
    `;
    // 本文欄の高さを先に確保する。高さ自動の札と伸縮するスクロール欄の組合せは本文をつぶす。
    // 折り畳んだ人物紹介の下に大きな空白を残さない。任務は軍の帯の下、地図の左へ収める。
    style.textContent += '@media(min-height:501px){html body #hud[data-tonezaka] #intro:has(#intro-go)>.card.card{width:min(560px,calc(100vw - 32px));height:min(520px,calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)));max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important}}@media(min-width:901px) and (min-height:501px){html body #hud[data-tonezaka] #battle-notices:not(.choosing),html body #hud[data-tonezaka] #battle-notices:not(.choosing):not(:has(#objectives.expand)){left:auto !important;right:calc(210px + env(safe-area-inset-right,0px)) !important;top:calc(104px + env(safe-area-inset-top,0px)) !important;width:min(320px,28vw) !important;max-height:calc(100% - 208px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important}}';
    // 共通の一本案内より優先する。向きは戦場の矢印だけで示す。
    style.textContent += `
      /* 共通の道案内は二重の識別子で画面中央へ固定される。同じ強さで任務欄へ戻す。 */
      html:root body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives#objectives.route-summary:not(.expand){
        position:relative !important;inset:auto !important;transform:none !important;
        width:100% !important;min-width:0 !important;max-width:100% !important;
      }
      html:root body #hud[data-tonezaka].single-guide #battle-notices #objectives#objectives.route-summary:not(.expand) #obj-list li.cur :is(.obj-text,.obj-now){
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
        white-space:normal !important;overflow-wrap:anywhere !important;
      }
      html body #hud[data-tonezaka].single-guide #battle-notices #objectives.route-order:not(.expand) #obj-list li.cur .obj-now::before{display:none !important}
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur .obj-now{
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;text-wrap:pretty;
      }
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives:not(.expand) #obj-list li.cur small.goal-place{
        font-size:max(15px,calc(15px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
      @media(max-height:500px){
        html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing):not(:has(#objectives.expand)){
          left:calc(16px + env(safe-area-inset-left,0px)) !important;top:calc(52px + env(safe-area-inset-top,0px)) !important;
          width:min(280px,32vw) !important;max-height:33vh !important;
        }
      }
    `;
    // 横持ちで任務と二行の知らせを最後まで収める。欄は戦場の三分の一以内に保つ。
    style.textContent += `@media(max-height:500px){
      html body #hud[data-tonezaka] #intro:has(#intro-go)>.card.card{
        width:min(620px,calc(100vw - 32px));
        height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px));
        max-height:calc(100dvh - 32px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px)) !important;
      }
      html body #hud[data-tonezaka] #intro:has(#intro-go)>.card::after{
        content:none;
        order:1;flex:none;font-size:max(13px,calc(13px * var(--text-scale,1)));line-height:1.4;color:#ece4d2;
      }
      html body #hud[data-tonezaka] #intro-go{order:2}
      html body #hud[data-tonezaka] #intro .intro-person{grid-template-columns:auto minmax(0,1fr);gap:8px;text-align:left;padding:4px 8px}
      html body #hud[data-tonezaka] #intro .intro-person b{font-size:max(16px,calc(16px * var(--text-scale,1)));line-height:1.5}
      html body #hud[data-tonezaka] #battle-notices:not(.choosing){
        left:calc(16px + env(safe-area-inset-left,0px)) !important;right:auto !important;
        top:calc(52px + env(safe-area-inset-top,0px)) !important;bottom:auto !important;
        transform:none !important;width:min(280px,32vw) !important;
        max-height:min(33vh,calc(100% - 180px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))) !important;gap:4px !important;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) :is(.battle-action,li.cur,.obj-now){
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur small.goal-place{
        font-size:max(15px,calc(15px * var(--text-scale,1))) !important;line-height:1.4 !important;
      }
      html body #hud[data-tonezaka] #battle-notices #objectives:not(.expand) li.cur .obj-cue,
      html body #hud[data-tonezaka] #battle-notices #objectives.has-action:not(.expand) li.cur .obj-text{display:none !important}
      html body #hud[data-tonezaka] #battle-notices #objectives.has-action:not(.expand) li.cur::before{content:none !important}
      html body #hud[data-tonezaka] #battle-notices:not(.choosing) #objectives.keep-combat-task.has-action:not(.expand) #obj-list{display:block !important;margin-top:4px}
      html body #hud[data-tonezaka] #battle-notices #objectives.keep-combat-task.has-action:not(.expand) li.cur > small:not(.goal-place):not(.obj-cue){display:block !important;font-size:max(15px,calc(15px * var(--text-scale,1))) !important;line-height:1.4 !important;white-space:normal !important}
      html body #hud[data-tonezaka] #battle-notices:not(.choosing) #objectives.has-action:not(.expand) li.cur small.goal-place{display:block !important;margin-top:4px}
      html body #hud[data-tonezaka] #battle-notices #battle-message{gap:4px !important}
      html body #hud[data-tonezaka] #battle-notices #battle-message > :is(#subtitle,.battle-notice){padding:4px 8px !important;line-height:1.45 !important}
    }`;
    // 守りの間だけ、携帯でも残り秒数の一行を見せる。札は増やさない。
    style.textContent += '#hud[data-tonezaka-holding] #objectives:not(.expand) #obj-list li.cur > small:first-of-type{display:block !important}';
    // 退く札も左上の欄へ戻す。地面の輪を追う配置で主人公と敵の槍を覆わない。
    style.textContent += `@media(max-height:500px){
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand){
        position:relative !important;inset:auto !important;transform:none !important;
        width:100% !important;max-width:100% !important;
      }
      html body #hud[data-tonezaka].single-guide #battle-notices:not(.choosing) #objectives.travel-retreat.ground-order.destination-sign:not(.expand) #obj-list li.cur .obj-now{
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;line-height:1.4 !important;
        text-wrap:pretty;
      }
    }`;
    // けがの長い文が格子の最小幅を押し広げ、帯と残量を下地からはみ出させない。
    style.textContent += `
      html body #hud[data-tonezaka] .bl #h-hp.hp{
        grid-template-columns:minmax(0,1fr) max-content !important;max-width:calc(100vw - 32px);
      }
      html body #hud[data-tonezaka] .bl #h-hp.hp > :is(i,em){min-width:0;max-width:100%;box-sizing:border-box}
      html body #hud[data-tonezaka] .bl #h-hp.hp em{
        overflow-wrap:anywhere;word-break:normal;white-space:normal;
        font-size:max(16px,calc(16px * var(--text-scale,1))) !important;
      }
      html body #hud[data-tonezaka] .bl #h-hp.hp em svg{width:18px;height:20px}
      html body #hud[data-tonezaka] .bl #h-hp.hp:has(em:not([hidden])){
        width:max(192px,calc(176px * var(--text-scale,1) + 24px)) !important;
      }
      html.touch body #hud[data-tonezaka] #wait-guard{
        grid-template-columns:32px minmax(0,1fr) 24px;column-gap:4px;
        width:max(264px,calc(198px * var(--text-scale,1) + 80px));
      }
      html.touch body #hud[data-tonezaka] #wait-guard svg:first-child{width:32px}
      html.touch body #hud[data-tonezaka] #wait-guard svg + svg{width:24px}
      html.touch body #hud[data-tonezaka] #wait-guard :is(span,small){
        min-width:0;font-size:max(16px,calc(16px * var(--text-scale,1)));line-height:1.4;
        overflow-wrap:anywhere;text-wrap:pretty;
      }
    `;
    // 横持ちだけ端へ固定する。左利きの配置では命の札より上へ離す。
    style.textContent += `@media(max-height:500px){
      html.touch body #hud[data-tonezaka] #wait-guard{
        left:auto !important;right:calc(16px + env(safe-area-inset-right,0px)) !important;
        top:auto !important;bottom:calc(16px + env(safe-area-inset-bottom,0px));
        width:min(240px,calc(100vw - 32px));min-height:64px;padding:6px;
        grid-template-columns:24px minmax(0,1fr);column-gap:8px;row-gap:2px;
        border-width:2px;border-radius:8px;
      }
      html.touch body #hud[data-tonezaka] #wait-guard svg:first-child{width:24px;height:36px}
      html.touch body #hud[data-tonezaka] #wait-guard svg + svg{display:none}
      html.touch.tc-sw body #hud[data-tonezaka] #wait-guard{
        left:calc(16px + env(safe-area-inset-left,0px)) !important;right:auto !important;
        bottom:calc(128px + env(safe-area-inset-bottom,0px));
      }
    }`;
    // 小地図は戦の間を通して隠し、操作の輪は触る端末だけに残す。
    style.textContent += `
      html:root body #hud[data-tonezaka] #minimap#minimap{display:none !important}
      html:not(.touch) body:has(#hud[data-tonezaka]) #tc,
      html:not(.touch) body #hud[data-tonezaka] #wait-guard{display:none !important}
      html body #hud[data-tonezaka] #intro .intro-people{display:none !important}
      html body #hud[data-tonezaka] #intro .intro-reading > p:not(#intro-wait){display:none !important}
    `;
    document.head.append(style); rt.hud.root.dataset.tonezaka = '';
    // 刀根坂の下知だけを既存の三枠へ戻す。任務は右上の一行のまま。
    // 欄を画面幅の三分の一以内に収め、戦場と槍先を空ける。
    style.textContent += `
      html:root body #hud[data-tonezaka].mission-only #battle-notices #subtitle:not([hidden]):not(.notice-muted) {
        display:block !important;
      }
      html:root body #hud[data-tonezaka] #battle-notices:not(.choosing) {
        width:min(280px,32vw) !important; max-width:32vw !important;
        max-height:33vh !important;
      }
    `;
    const dispose = W.dispose.bind(W);
    W.dispose = () => { F.restoreNobuLabel?.(); style.remove(); delete rt.hud.root.dataset.tonezaka; delete rt.hud.root.dataset.tonezakaHolding; for (const g of groundedCloths.values()) g.dispose(); groundedCloths.clear(); for (const g of fallenCloths.values()) g.dispose(); fallenCloths.clear(); for (const g of wetCloths.values()) g.dispose(); wetCloths.clear(); for (const m of wetFlagMats.values()) m.dispose(); wetFlagMats.clear(); clearRoadside(); clearMountains(); dispose(); };
    const nearRain = W.updateNearRain;
    W.updateNearRain = function (dt, r, wdx, wdz) { nearRain.call(this, dt, r, wdx, wdz); if (this.rainNear.visible) this.rainNear.material.uniforms.op.value = Math.min(0.34, r * 0.45); };
    W.setRainTarget(0.8); W.rainLevel = 0.8; // 強い雨の夜（kaito 52番）。始めから手前の太い雨筋が見え、街道が濡れて光る。
    // 小さくした跳ねも一画素の白点は残る。この戦の雨だけ、濡れた土へなじませる。
    W.splashPts.material.opacity = 0.18;
    F.step = 0; F.ek = 0; F.ak = 0; F.poll = 0; F.pollAt = rt.t; F.briefAt = rt.t;
    F.roadGuide = { x: FIRST_END.x, z: FIRST_END.z };
    F.toneFootPoint = new THREE.Vector3();
    F.enemyRoadPoint = { x: FIRST_END.x, z: FIRST_END.z };
    F.townMeet = { x: TOWN.x, z: TOWN.z };
    F.shelter = { x: 0, y: 0, z: 0, scanAt: 0, valid: false, ally: null, point: { x: 0, y: 0, z: 0 } };
    F.chaseWait = { t: 0, step: 0, enemies: 0, joined: false, umaX: 0, umaZ: 0, lateX: 0, lateZ: 0, umaStopped: false, lateStopped: false, rearX: 0, rearZ: 0 };
    const chief = (name, survives = false, horse = false) => ({ type: 'busho', n: 1, o: { name, horse, invuln: survives } });
    // 本の足軽の図と着装写真：黒漆の胴、赤茶の陣笠、紺の小袖。味方を青く見せない決まり（10/28）で小袖は濃い褐（柿渋の焦げ茶）に。既存の形と材質を使う。
    const A = (n) => ({ type: 'ashigaru', n, o: { armor: 0x25211c, hat: 'jingasa', hatColor: 0x61332b, lace: 0x9c927b, cloth: 0x3b3127, doStyle: 'okegawa', sode: false } });
    const S = (n) => ({ type: 'samurai', n });
    // 11/8 critic60（五3・九3「敵味方の足軽が同じ灰青で見分けられない」）：織田の足軽は黒漆の陣笠に紺の小袖、朝倉は朱の剥げた陣笠に茶の小袖（A）
    const AO = (n) => ({ type: 'ashigaru', n, o: { ...A(n).o, hatColor: 0x1b1916, cloth: 0x27324a } });
    const foe = (name, at, list, width = 5) => enemyGroup(rt, {
      fixed: true, noAI: true, faction: 'asakura', name, anchor: at, facing: TURN,
      order: 'hold', formation: 'yari', yariRanks: toneYariRanks(list.reduce((n, part) => n + part.n, 0)), width, aggro: 8, morale: 78, guardOn: true,
      fleeDir: { ...NORTHWEST },
    }, dress(list, ASA));
    // 峠道はこの辺りで西へ曲がる。列の中心を道へ置き、山腹から斜めに合流させない。
    F.uma = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: '信長の馬廻', anchor: at(roadX(66), 66), facing: Math.PI + TURN,
      colW: 2, width: 5, formation: 'column', aggro: 8, guardOn: true, noRout: true },
      // 11/8 critic60（十一4・九4「信長が先頭に立つ姿が一枚も写らない」）：信長を列の頭（馬廻の侍の二番手）に。足軽は後ろへ
      dress(rt.G.lord ? [S(5), S(5), AO(24)] : [S(2), chief('織田信長', true, true), S(8), AO(24)], ODA));
    F.nobuU = rt.G.lord ? rt.player.u : F.uma.units.find((u) => u.name === '織田信長');
    // この戦の信長の名札だけ、固定の高さでなく揺れる兜のすぐ上へ寄せる。
    if (!rt.G.lord && F.nobuU.head) {
      const head = F.nobuU.head, project = rt.hud.project, headAt = new THREE.Vector3();
      head.geometry.computeBoundingBox();
      const headTop = head.geometry.boundingBox.max.y + 0.12;
      const nobuProject = function (p, y, battle) {
        if (p === F.nobuU.pos && y === p.y + (F.nobuU.mounted ? 3.3 : 2.35)) {
          headAt.set(0, headTop, 0); head.localToWorld(headAt);
          return project.call(this, headAt, headAt.y, battle);
        }
        return project.call(this, p, y, battle);
      };
      rt.hud.project = nobuProject;
      F.restoreNobuLabel = () => { if (rt.hud.project === nobuProject) rt.hud.project = project; };
    }
    F.uma.leader = rt.G.lord ? F.uma.units[0] : F.nobuU;
    if (!rt.G.lord) F.nobuU.allyOk = true;
    F.late = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: '柴田勝家の手', anchor: at(roadX(90), 90), facing: Math.PI + TURN,
      colW: 2, width: 5, formation: 'column', aggro: 8, guardOn: true, noRout: true },
      dress([S(4), chief('柴田勝家', true, true), S(4), AO(22)], ODA));
    F.late.leader = F.late.units.find((u) => u.type === 'busho'); F.late.leader.allyOk = true;
    F.oda = [F.uma, F.late];
    // 11/3 b100（AA・AF）：実兵のすぐ後ろの軽い後続（織田）と、持ち場の前40〜80mで同じ間合いのまま退く軽い大軍（朝倉）はやめた。
    //   近づけば消える見せかけになる。前の殿・後続の将は全部本物の兵。軽い列は峠の向こう（義景の本隊・荷駄）だけに残す。
    const n = Math.min(30, RANKS[rt.G.rank || 0].squad || 0);
    if (n) rt.makeSquad(at(roadX(98) + 3, 98), Math.PI + TURN, [{ kind: 'spear', n }]);
    // 供は馬廻の後ろから出る。傷は通すが、疲れた殿の一突きで組が溶けないようにする。
    for (const g of rt.squadGroups) g.defMult = 1.25;
    // 全ての戦う兵を初めに置く。武将は槍の前列より後ろで供に守られる。
    // 開戦25秒の乱戦（10/30）：殿の列を持ち場の前30mの坂へ寄せ、馬廻が25秒までに槍を合わせる（兵の数は同じ）
    F.r1 = foe('河合吉統の殿', at(-6, 54), [A(18), S(3), chief('河合吉統', false, true), S(3)]);
    // 河合は刀根坂で討死する。名を消して逃がさず、討たれるまで殿を保つ。
    F.r1.noRout = true; F.r1.lastStand = true;
    // 大軍対大軍（kaito 10/31）：殿の二の手は河合の殿のすぐ後ろに付け、一つの塊で坂を押し返す。
    F.r1b = foe('朝倉の殿の二の手', at(-4, 42), [A(6), S(2)]);
    F.r2 = foe('山崎吉家の手', at(4, -74), [A(16), S(2)]);
    // 11/6 fixc2220：山崎吉家・斎藤龍興は手が崩れても旗本と踏みとどまり、討たれるまで戦う（史実で二人とも坂で討死）。作りで命を零にせず、自分で討てる将に。
    const lastStand = (name, at0) => { const g = foe(name + 'と旗本', at0, [S(3), chief(name, false, true), S(2)], 3); g.noRout = true; g.lastStand = true; g.morale = 100; return g; };
    F.r2c = lastStand('山崎吉家', at(4, -84));
    // 斎藤龍興の手は山崎の手の真後ろに詰め、二つで一つの塊（前が崩れても続けて押す後詰め）にする。
    F.r3 = enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '斎藤龍興の手', anchor: at(6, -88), facing: TURN,
      order: 'hold', formation: 'yari', yariRanks: toneYariRanks(30), width: 5, aggro: 8, morale: 78, guardOn: true, fleeDir: { ...NORTHWEST } },
      // 11/3 b100：龍興は朝倉の客将として朝倉の陣にいた。旗はこの戦の家（織田・朝倉）だけにする。
      dress([A(16), S(2)], ASA));
    F.r3c = lastStand('斎藤龍興', at(6, -96));
    // 11/6 fix61（Z8）：詫美越後守は刀根坂を生き延び、疋壇城から朝倉景健らと逃れた。討てる将にせず、殿が崩れれば退く。
    F.r4 = foe('詫美越後守の殿', at(-4, -142), [A(18), S(3), chief('詫美越後守', true, true), S(3)]);
    F.roadG = enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '街道で向き直る朝倉勢', anchor: { ...STREET }, facing: -Math.PI / 2 + TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, aggro: 8, morale: 65, fleeDir: { ...EAST } }, dress([A(6), S(2)], ASA));
    // 11/6 fixc2220（九4・一5）：城下の兵が三人ほどで十秒で済んでいた。坂の殿を消した後に、城下へ着いた時に二十人の手で出す（実兵の上限を守る）。
    F.townG = null;
    F.makeTownG = () => enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '城下に残った朝倉の兵', anchor: { ...TOWN }, facing: -Math.PI / 2 + TURN,
      order: 'hold', formation: 'yari', yariRanks: 4, width: 6, aggro: 14, morale: 70, fleeDir: { ...EAST } }, dress([A(14), S(4)], ASA));
    // 奥の道へは、館の留守から逃げ遅れた朝倉の兵が谷の奥から寄せる（11/5：守る間に寄せる敵がいなかった）。
    //   城下の段の間に味方の備と組み合って消えないよう、火が上がった時に谷の奥から出し、守り場へ押し出す。
    F.innerG = null;
    // 寄せ手は奥の道の守り場（谷の底の道の上）から出て、城下から来る攻め手へ寄せる（崖の上に出さない）。
    F.makeInnerG = () => enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '谷の奥から寄せる朝倉の兵', anchor: { x: INNER.x, z: INNER.z }, facing: Math.PI + TURN,
      order: 'hold', formation: 'yari', yariRanks: 3, width: 5, aggro: 16, morale: 72, fleeDir: { ...at(0.45, 0.9) } }, dress([A(12), S(3)], ASA));
    F.hurtG = foe('道脇を退く朝倉の兵', at(-8, -48), [A(4)], 2);
    for (const u of F.hurtG.units) { u.hp = Math.min(u.hp, u.maxHp * 0.25); u.dmg = 0; u.yariOpenUntil = 1e9; }
    // 荷を担いで峠へ退く朝倉の人夫（資料との差 10/28：退く軍の小者・陣夫が道に一人もいなかった）。戦わない荷運びの兵として置く。
    // 道を北へ歩き続け、追い手が三十五歩まで寄れば荷を担いだまま走って逃げる（立ち尽くさない）。人数と場所は推定。
    // 一組目は持ち場の二十歩ほど先から荷を担いで峠へ退く（始めから見える）。人数は二組目から寄せて七人に（合計九人は同じ。10/29）。
    F.porters = [[-9, 64], [-2, -96]].map(([lx, lz], i) => {
      const g = enemyGroup(rt, { fixed: true, faction: 'asakura', name: '荷を担いで退く人夫', anchor: at(lx, lz), facing: TURN + Math.PI,
        formation: 'column', colW: 2, speed: 0.95, aggro: 0, civ: true, noRout: true, arriveNoncombat: true, fleeDir: { ...NORTHWEST } },
        // 荷運びの型（porter）は骨の人に替わらず霧の手前で隠れるので、得物を持たない足軽の体に荷を背負わせる
        [{ type: 'ashigaru', n: i ? 2 : 7, o: { flag: null, weapon: 'none', kosode: 1, kosodeCol: [0x5a4a36, 0x4b4434, 0x625240][i % 3], cloth: 0x4a3e2e, hat: 'jingasa_n', armor: 0x3a342a } }]);   // 11/8 critic60（十5・四4）：笠も無い灰色の裸の人形に見えた。陣夫も陣笠を被る
      for (const u of g.units) {
        u.noTarget = true; u.dmg = 0; u.civ = true;
        const load = new THREE.Mesh(PORTER_LOAD(), PORTER_MAT()); u.mesh.add(load);
      }
      g.order = 'path'; g.path = LOCAL_ROAD.filter(([, z]) => z < lz - 6).map(([x, z]) => xz(x, z)); g.pathIdx = 0;
      g.fleePath = g.path.slice();
      return g;
    });
    retreat(F.hurtG);
    // 義景は峠の向こうへ退く本隊の内。静止した陣幕・床几は置かない。
    F.yoshikage = enemyGroup(rt, { fixed: true, noAI: true, faction: 'asakura', name: '朝倉義景と旗本', anchor: at(-4, -200), facing: Math.PI + TURN,
      order: 'hold', formation: 'column', colW: 2, aggro: 2, morale: 60, noRout: true, arriveNoncombat: true, fleeDir: { ...NORTHWEST } },
      dress([S(3), chief('朝倉義景', true, true), S(3), A(3)], ASA));
    F.yoshikageU = F.yoshikage.units.find((u) => u.name === '朝倉義景');
    // 峠の殿が持ちこたえる間は、供と先の曲がりで待つ。開戦直後の逃亡札を出さない。
    for (const u of F.yoshikage.units) u.noTarget = true;
    march(F.yoshikage, [xz(-4, -216)], (g) => { g.order = 'hold'; });
    F.yoshikage.speed = 0.6; F.yoshikage.aggro = 0;
    F.rears = [F.r1, F.r1b, F.r2, F.r3, F.r4];
    F.stageDefenders = { 1: [F.r1, F.r1b], 2: [F.r2, F.r3, F.r2c, F.r3c], 3: [F.r4], 5: [], 6: [] }; // 6 は火が上がった時に谷の奥の兵を入れる
    // 殿だけが先に向き直る。中ほどの備は疲れた二列の退き足で、接敵してから槍をそろえる。
    for (let i = 0; i < F.rears.length; i++) {
      const g = F.rears[i];
      g.morale = i < 2 ? 68 : 58; g._fleeContact = 0;
      for (const u of g.units) { u.fat = Math.max(u.fat || 0, 0.35); if (u.mounted) u.hfat = Math.max(u.hfat || 0, 0.3); }
      if (i < 2) continue;
      const z = along(g.anchor.x, g.anchor.z) - 8;
      march(g, [xz(roadX(z), z)], (q) => { q.order = 'hold'; });
      g.speed = 1.6; g.facing = Math.PI + TURN; g._retreatColumn = true;
      // 疲れた徒歩は歩幅も間隔もそろわない。接敵後は元の槍の持ち場へ戻す。
      const slot = g.slotPos;
      g.slotPos = function (i, n) {
        const p = slot.call(this, i, n);
        if (this._retreatColumn) {
          const side = this.slotJit(i, 4) * 0.45, lag = (i % 4) * 0.55;
          p.x += side * CS + lag * SN; p.z += lag * CS - side * SN;
        }
        return p;
      };
      for (let j = 0; j < g.units.length; j++) {
        const u = g.units[j];
        if (!u.mounted && !u.name) { u.fat = 0.35 + (j % 4) * 0.08; u.speed *= 0.85 + (j % 3) * 0.05; }
      }
    }
    // 退く殿の旗は既存の旗持ちに任せる。無人の大旗を街道に立て並べない。
    F.defenders = [...F.rears, F.r2c, F.r3c, F.roadG];
    // 正面決戦の精兵ではなく、退きながら道を塞ぐ疲れた小勢。
    for (const g of F.defenders) g.dmgMult = 0.85;
    for (const g of [...F.rears, F.r2c, F.r3c, F.roadG, F.yoshikage]) for (const u of g.units) u.duelDone = true;
    // 遠景は道幅に合わせた長い列。近い退く兵だけ、共通の人数枠の中で本物へ替える。
    const fb = (name, team, nominal, x, z, facing, more) => fieldButai(rt, {
      name, team, nominal, at: at(x, z), facing: facing + TURN, kind: 'ashigaru', faction: team ? 'asakura' : 'oda',
      armor: team ? 0x33291f : 0x2a2622, flag: team ? 'asakura' : 'oda',
      lightWidth: 5, lightDepth: 24, realMax: team ? 6 : 0, morale: team ? 60 : 85, ...more,
    });
    // 殿の後ろの逃げ足は軽い列で見せる。戦う兵への切替は止める。
    F.rearCrowds = F.rears.map((g) => {
      const z = along(g.anchor.x, g.anchor.z) - 16;
      // 軽い作りは主人公の四十四歩内では描かれず（humans_shared.js の realNear）、杉の林の中も見えない。
      // 道の上だけに、殿の背の四十五歩より奥を道幅いっぱいの厚い列で退かせる（25秒の画面で殿の奥に退く群れ。点検表 6・10/29）。
      const b = fb('殿の後ろを退く朝倉勢', 1, 110, roadX(z), z, Math.PI, { lightWidth: 9, lightDepth: 22, armor: 0x463a2c });
      b.realMax = 0; b._autoSwitch = () => {};
      // 守る殿とは分け、後ろの列は北西へ歩き続ける。曲がりを十歩ほどずつたどる。
      // 行き先の入れ物は設営時に作り、次の曲がりに着いた時だけ移動を頼む。
      b.toneRetreatZ = z;
      b.toneRetreatTo = { x: b.pos.x, z: b.pos.z };
      // 11/3 b100（AF）：殿の十六歩後ろの軽い列は、追えば消える棒の群れに見えた。退く足の数え（崩れの連鎖）だけ残し、描かない。
      if (b.light) { b.light.visible = false; b.light.parent?.remove(b.light); }
      return b;
    });
    // 後続の将と供も初めから本物。先の馬廻へ新手として加えず、後ろの列を守る。
    F.followers = [];
    const follow = (name, nominal, x, z) => {
      const b = fb(name + 'の備', 0, nominal, x, z, Math.PI, { lightDepth: Math.round(nominal / 6) });
      const g = allyGroup(rt, { fixed: true, fullStrength: true, noAI: true, name: name + 'と供',
        anchor: at(x, z), facing: Math.PI + TURN, formation: 'column', colW: 2, width: 5, aggro: 4 },
        dress([S(2), chief(name, true, true), S(2)], ODA));
      g.leader = g.units.find((u) => u.type === 'busho'); g.leader.allyOk = true;
      adoptGroup(b, g);
      // fieldButai の固有の切替は noSwitch を読まないため、この備では明示して止める。
      b._autoSwitch = () => {};
      F.followers.push(g);
      return b;
    };
    F.bO = {
      niwa: follow('丹羽長秀', 300, 2, 186),
      hashiba: follow('羽柴秀吉', 300, 10, 214),
      takigawa: follow('滝川一益', 240, -2, 238),
      sakuma: follow('佐久間信盛', 220, 4, 260),
    };
    // 峠の向こうの旗と退く列を残す。近い義景の供は上で本物を置く。
    F.fleeB = [fb('朝倉義景の本隊', 1, 380, -4, -230, Math.PI, { lightDepth: 60 }), fb('朝倉の荷駄と後備え', 1, 200, 10, -260, Math.PI)];
    for (const b of F.fleeB) {
      b.realMax = 0; // 義景の供は既に置いてある。逃げる本隊から戦う兵を足さない。
      b.order({ id: 'retreat', to: { x: b.pos.x + NORTHWEST.x * 40, z: b.pos.z + NORTHWEST.z * 40 }, form: 'column' });
      b.light.moveTo(b.pos.x + NORTHWEST.x * 40, b.pos.z + NORTHWEST.z * 40, 500, { back: true });
      // 11/8 critic60（四1・九5）：峠の向こうの軽い列が、暗い空に旗と上半身だけ宙に浮いて見えた。描かず、退く数え（荷駄の詰まり）だけ残す。
      //   峠の先へ退く朝倉は、本物の義景の供と峠の旗（asakuraFlag）で見せる
      if (b.light) { b.light.visible = false; b.light.parent?.remove(b.light); }
    }
    // 荷駄の歩みは遅く、前が止まれば後ろも詰まる。戦う殿の進みを待たせない。
    F.baggage = F.fleeB[1]; F.baggageStopAt = rt.t + 12; F.baggageResumeAt = 0;
    F.baggageTo = { x: F.baggage.pos.x + NORTHWEST.x * 100, z: F.baggage.pos.z + NORTHWEST.z * 100 };
    F.baggage.light.moveTo(F.baggageTo.x, F.baggageTo.z, 85, { back: true });
    const loadX = F.baggage.pos.x + NORTHWEST.x * (100 * 12 / 85), loadZ = F.baggage.pos.z + NORTHWEST.z * (100 * 12 / 85);
    rt.scene.add(tawara(W, loadX + CS * 3, loadZ - SN * 3, TURN, 4));
    for (const [x, z, r] of [[-14, 30, 0.4], [16, -20, -0.3], [-10, -70, 0.2], [14, -118, 0.1]]) { const p = at(x, z); rt.scene.add(tawara(W, p.x, p.z, r + TURN, 4)); }
    const houses = makeSimpleBatch();
    { const p = at(-30, 70); hut(W, p.x, p.z, 6, 4, TURN, { wall: 0x5a4a38, groundedHome: true, batch: houses }); }
    finalizeSimpleBatch(rt, houses);
    // 25秒の時のカメラは撮るたびに向きが変わる（10/29 三回：南西・南・西。主人公は x≈-8, z≈66、カメラはその十歩ほど脇で高さ2m）。
    // 前の崩れ（z 37〜48）は南と南西の画面にしか入らず、西を向くと草の斜面と里の家だけになった。
    // 主人公の三十歩以内の四方（西の家の前・東の肩・南の道脇・北西の斜面）に、倒れた荷駄馬とこぼれた俵・脱げた笠を（点検表 2）。
    const WRECKS = [[-18, 63, 1.9], [-17, 78, -0.6], [3, 63, 0.3], [-1, 53, 2.8], [-22, 52, 0.9]];
    fallenHorses(rt, WRECKS.map(([x, z, r]) => [...xz(x, z), r]));
    for (const [x, z, r] of WRECKS) {
      // 荷鞍から外れた俵は馬の背の側へ転がり、二つ三つ重なる。
      const p = at(x + Math.cos(r) * 1.6, z - Math.sin(r) * 1.6); rt.scene.add(tawara(W, p.x, p.z, r + TURN + 0.4, 3));
      const q = at(x - Math.sin(r) * 1.9, z - Math.cos(r) * 1.9); rt.scene.add(tawara(W, q.x, q.z, r + TURN - 1.1, 1));
    }
    droppedKasa(rt, WRECKS.flatMap(([x, z, r], i) => [[x + 2.4, z + 0.8, r + i], [x - 1.2, z + 2.2, r * 2 + 1.7]]));
    // 城下の西の山際にある寺の堂。特定の寺の建物を復元したものではない。
    { const p = at(80, -102); rt.scene.add(dou(W, p.x, p.z, 8, 6, TURN)); }
    // 個々の家の復元図ではなく、城下の用途に合わせた推定の間取り。
    // 既存の位置・広さを保ち、土間のある町家と座敷のある屋敷を分ける。
    // 中は naka.js に任せ、竿縁天井・畳・柱と長押、横に滑る襖と障子を使い回す。
    for (let i = 0; i < TOWN_HOUSES.length; i++) {
      const [x, z] = TOWN_HOUSES[i], residence = i >= 2;
      goten(rt, x, z, { w: 7, d: 5, rot: TURN, team: 1, tile: false,
        earth: 0x947b55, naka: true, noTarget: true, doorX: 0, profile: 'tonezaka',
        kind: residence ? 'yashiki' : 'machiya', name: residence ? '一乗谷の屋敷' : '一乗谷の町家' });
    }
    // 11/6 fix61（専門家の目 Z7）：一乗谷が家四軒と堂一つでは、一万の人が住んだ城下に見えない。
    //   谷を塞ぐ下城戸（土塁の表に大石を積み、口に冠木門）と、街道に沿う町屋の並びを足す。
    //   下城戸の口は入口の先（入って十歩ほど）に縮めて置く推定。土塁は谷底を横切り、両の山裾へ消える。
    {
      const k = TOWN_GATE, tx = k.tx, tz = k.tz, nx = -tz, nz = tx;
      const P = (a, n) => xz(k.x + tx * a + nx * n, k.z + tz * a + nz * n);
      const rotN = Math.atan2(-nz, nx) + TURN;
      for (const s of [1, -1]) {
        const [ax, az] = P(0, 4 * s), [bx, bz] = P(0, 19 * s), [wx, wz] = xz(tx, tz);
        for (const f of [1, -1]) rt.scene.add(dorui(W, [ax, az, bx, bz], wx * f, wz * f, { w: 3.2, h: 2.6, capEnds: true, bareSoil: true }));
        const [cx, cz] = P(0, 11.5 * s);
        solidRect(cx, cz, 15, 6.4, rotN);
        // 攻め手の側の面だけ大石で固める（一乗谷の下城戸は巨石を組む）。
        const [sx, sz] = P(-1.2, 4 * s), [ex, ez] = P(-1.2, 10 * s);
        rt.scene.add(ishigaki(W, s > 0 ? [[sx, sz], [ex, ez]] : [[ex, ez], [sx, sz]], { kind: 'nozura', top: 2.1, minH: 2.1, maxH: 3, big: 2.2, noKit: true }));
      }
      { const [gx, gz] = P(0, 0); rt.scene.add(kabukimon(W, gx, gz, 7.2, rotN)); }
      const homes = makeSimpleBatch();
      for (let i = 0; i < TOWN_MACHIYA.length; i++) {
        const [a, n] = TOWN_MACHIYA[i], [hx, hz] = townMachiyaAt(i), w = 6 + (i % 3) * 0.5;
        hut(W, hx, hz, w, 4.2, Math.atan2(-tz, tx) + TURN, { wall: [0x5a4a38, 0x625240, 0x54473a][Math.abs(Math.round(a + n)) % 3], groundedHome: true, batch: homes });
      }
      finalizeSimpleBatch(rt, homes);
    }
    // 11/4（AP12・BH6）：道の曲がり・合流・退き先の名札（字の印）は出さない。行き先は頭上の▼一つ。
    { const mk = rt.marker; rt.marker = function (id, pos, label, o) { return mk.call(this, id, pos, TONE_QUIET.has(id) ? '' : label, o); }; }
    rt.setPhase('brief');
    rt.obj('main', TONE_LINE[0], 'main', true);
    F.departureLine = rt.G.lord ? '馬廻がそろいます。追撃の支度を' : '前の馬が信長公じゃ。追う支度をせよ';
    rt.say(rt.G.lord ? '近習' : '組頭', F.departureLine, 4);
    if (!rt.G.lord) rt.marker('nobu', unitPos(F.nobuU), '馬に乗った信長公と供の兵', {});
    rt.marker('toneShelter', () => toneShelter(rt), '味方の後ろで息を整える所',
      { guideArea: 'retreat', guideRadius: 3, guideAlly: () => F.shelter.ally, h: 0.3 });
    F.asakuraBearer = F.yoshikage.units.find((u) => u.type === 'samurai');
    F.asakuraFlag = nobori(W, F.asakuraBearer.pos.x, F.asakuraBearer.pos.z, 'asakura', 4);
    creaseFlag(F.asakuraFlag.userData.flag);
    for (const u of rt.army.units) {
      creaseFlag(u.standardFlag);
      // 雨の指物も裾を折る。騎馬の布は背の竿と同じ座標で揺らす。
      if (u.flag) { creaseFlag(u.flag); u.flag.userData.followPole = true; }
    }
    // 備の隊旗も雨の布へそろえる。旗持ちが視点のため隠れた時は旗だけを残さない。
    // 地へ倒れた旗は共通の皺を使い、拾われたら元の雨の布へ戻す。
    const updateStandards = rt.updateStandards;
    const standardViewAhead = new THREE.Vector3();
    rt.updateStandards = function (dt) {
      updateStandards.call(this, dt);
      this.camera.getWorldDirection(standardViewAhead).multiplyScalar(18).add(this.camera.position);
      // 共通の判定は足元の位置に胸の高さを足すので、中央への線では差し引く。
      standardViewAhead.y -= 1.4;
      for (const g of this.army.groups) {
        if (!g.stds) continue;
        for (const s of g.stds) {
          const d = s.userData.std, carrier = s.userData.carrier;
          if (d.kind === 'cavalry') continue;
          if (d.down) {
            // 共通側で求めた竿先は、方角へ向けてから倒す回転に対応する。
            // 順を逆にすると竿先が別の坂へ向き、旗全体が宙に残る。
            s.rotation.set(s.rotation.x, s.rotation.y, 0, 'YXZ');
            if (d.downT >= 0.7 && !d.toneFolded) {
              this.army.foldGroundFlag(d.cloth); groundCloth(d.cloth); d.toneFolded = true;
            }
          } else {
            d.toneFolded = false;
            // 逃げる旗持ちは竿を抱えて運ぶ。布を横倒しにしたまま地面へ下げない。
            // 討死して落とした旗の接地と、拾い直す動きは上の枝に任せる。
            if (g.routed) {
              s.rotation.x = Math.max(-0.35, s.rotation.x);
              s.rotation.z = Math.max(-0.1, Math.min(0.1, s.rotation.z));
              s.position.y = d.baseY - Math.min(d.low, 0.35) + (s.parent === this.scene ? carrier.pos.y : 0);
            }
            // 縦の乳で竿に留めた雨の幟。布だけを風下へ回して竿から離さない。
            d.cloth.rotation.y = 0;
            if (d.cloth.geometry === d.clothGeo) {
              const faint = d.faintClothMat && d.cloth.material === d.faintClothMat;
              if (d.fullClothMat) d.cloth.material = d.fullClothMat;
              creaseFlag(d.cloth);
              if (d.fullClothMat) d.fullClothMat = d.cloth.material;
              if (faint) d.cloth.material = d.faintClothMat;
            }
            // 半透明の大旗を敵へ重ねない。共通側が近い味方用の材質を選んだ間は竿ごと省く。
            // 風向きから竿際へ戻した後に再判定し、裸の竿も中央へ残さない。
            // 離れた時の表示は共通側が毎回戻す。旗持ちの体・戦力は変えない。
            if (carrier?.camHidden || d.faintClothMat && d.cloth.material === d.faintClothMat ||
                toneStandardBlocks(this, s, standardViewAhead)) s.visible = false;
          }
        }
      }
    };
    rt.scene.add(F.asakuraFlag);
    rt.marker('asakuraMain', () => F.asakuraFlag.visible && sightUnit(rt, F.asakuraBearer) ? F.asakuraBearer.pos : null, '峠の先へ退く朝倉の旗', { h: 4 });
    // 朝倉の松明を物見する段（tonezaka/monomi.js）の後に追撃
    rt.after(5, () => { if (rt.phase === 'brief' && !F.step) monomi(rt, { at, roadX, next: () => this.chase(rt) }); });
  },
  // 15分の構成で足した段（K 詰まる列・Y 義景の旗本）を、共通の段の仕組み（b_depth.js）で流す
  toneDeep(rt, key, head, steps, done) {
    const F = rt.flags;
    if (F['dp' + key]) return;
    F['dp' + key] = true; F.dpOn = true; F.toneHead = head;
    for (const k of ['toneRoad', 'pass', 'toneFront']) rt.unmark(k);
    rt.obj('main', head, 'main', true);
    for (const st of steps) {
      const start = st.start;
      st.start = (rt2, C, m, ctx) => {
        start(rt2, C, m, ctx);
        if (C.at) {
          // 共通の横並びは曲がった峠道の山腹へ広がる。各組を街道上の縦列に戻し、
          // 本人の到着点を兵の体で塞がないよう、後ろから順に支える。
          const end = along(C.at.x, C.at.z);
          ctx.friends(rt2).forEach((g, i) => {
            const z = end + 12 + i * 16;
            g.path = null; g.onArrive = null;
            g.formation = 'column'; g.colW = 2; g.width = 5;
            g.facing = Math.PI + TURN;
            g.anchor = at(roadX(z), z);
          });
        }
        if (F.toneHead) { rt.obj('main', F.toneHead, 'main', true); rt.objProgress('main', ''); }
      };
      // 狭い坂道・旗本・荷駄は、本人が目当てへ着き、敵を退けてから進む。
      // 共通の放置・時間切れによる段送りで、未達成の目標を飛ばさない。
      if (st.kind === 'hold' || st.kind === 'move') {
        st.idleAdvance = false; st.max = st.limit = Infinity;
        if (st.kind === 'hold') {
          const tick = st.tick;
          st.tick = (rt2, C, m, ctx, el, dt) => {
            const cleared = tick(rt2, C, m, ctx, el, dt);
            // 共通の守備処理が書く残り秒数を、追加した追撃の段にも残さない。
            rt2.objProgress('dp', '');
            return cleared && near(rt2.player.u.pos, C.at, C.botRadius);
          };
        }
      }
    }
    depthStart(rt, { faction: 'asakura', flag: 'asakura', fixedSpawn: true, backing: false, scale: 1.2, dmg: 0.8, calmRest: false, routeFight: true,
      look: (l) => dress(l, ASA), friends: () => [F.uma, F.late, ...(F.followers || [])].filter(fighting) }, steps, () => {
      F.dpOn = false; F.toneHead = null; F.guideTask = null; rt.objRemove('dp'); done();
    });
  },
  kit() {
    const A = (n) => ({ type: 'ashigaru', n }), S = (n) => ({ type: 'samurai', n });
    return { at, rest: dpRest, hold: dpHold, move: dpMove, A, S };
  },
  chase(rt) {
    const F = rt.flags;
    if (F.step >= 1) return;
    F.step = 1; F.stepT = rt.t; F.guideTask = null; rt.setPhase('chase');
    if (F.toneMonomi) { F.toneMonomi = null; F.toneHead = null; rt.unmark('toneMonomi'); }
    // 出立待ちの説明はここまで。ほかの札に隠れて読了が止まっていても、接敵後へ持ち越さない。
    const H = rt.hud, departureLine = F.departureLine;
    for (let i = H.subQ.length - 1; i >= 0; i--) {
      if (H.subQ[i].text === departureLine) H.subQ.splice(i, 1);
    }
    if (H.shownLine?.text === departureLine) { H.nextSub(); H.subT = 0; H.shownLine = null; }
    // 馬廻が後ろで戦っていても、前の敵を見ている者を振り向かせない。
    rt.unmark('nobu');
    toneGuide(rt, FIRST_END);
    rt.marker('toneFront', () => toneGuidePosition(rt),
      () => F.guideJoin ? F.guideBend ? '味方へ合流する道' : '合流する味方の兵' : F.guideBend ? '次の道の曲がり' : F.guideVisible ? '道を塞ぐ敵の列' : '坂へ続く道', { h: 0.35 });
    rt.banner('朝倉が退く。信長公が追う', '昨夜の嵐に大嶽砦が落ち、義景は陣を払った');
    F.chiefNoteT = rt.t + 8;
    rt.obj('main', '坂の下で河合吉統の殿を突き破る', 'main', true);
    toneAdvanceCue(rt, 'susume', F.nobuU.pos);
    rt.say('織田信長', '朝倉が退くぞ！　馬廻、わしに続け！', 4);
    march(F.uma, [[-10, 60], [-6, 48], [-4, 16]].map(([x, z]) => xz(x, z)));
    march(F.late, [[roadX(82), 82], [-10, 60], [-6, 48], [-4, 24]].map(([x, z]) => xz(x, z)));
    // 開戦25秒の乱戦（10/30）：殿の列は追手へ槍を入れて押し返しに出る（坂の途中で両軍が組み合う）
    rt.after(4, () => { for (const g of [F.r1, F.r1b]) if (F.step === 1 && g && g.count && !g.routed) { g._charge = true; g.seekRange = 30; g.aggro = 14; } });
    for (const b of Object.values(F.bO)) {
      if (b.light) b.light.advance(60, 45);
      const z = along(b.real.anchor.x, b.real.anchor.z);
      march(b.real, [xz(roadX(z - 60), z - 60)]);
    }
  },
  second(rt) {
    const F = rt.flags;
    F.step = 2; F.stepT = rt.t; F.guideTask = null; rt.setPhase('second');
    rt.unmark('toneFront');
    rt.unmark('nobu');
    toneGuide(rt, SAKA);
    rt.marker('toneRoad', () => toneGuidePosition(rt),
      () => F.guideJoin ? F.guideBend ? '味方へ合流する道' : '合流する味方の兵' : F.guideBend ? '次の道の曲がり' : F.guideVisible ? '坂道で向き直る敵' : '峠へ続く道', { h: 0.35 });
    rt.obj('main', TONE_LINE[2], 'main', true);
    const signaled = toneAdvanceCue(rt, 'kakari', F.late.center());
    rt.say('柴田勝家', signaled ? '掛かれの貝じゃ！　味方と坂の敵を突き破れ' : '道が開いた！　味方と坂の敵を突き破れ', 4);
    F.chiefNoteT = rt.t + 8;
    // 信長公記巻六：先手（佐久間・丹羽・羽柴・滝川）は信長に遅れて追い付き、叱られた。共通の「陣を移す」の代わりに一度だけ。
    if (!F.lateTold) {
      F.lateTold = true;
      rt.after(14, () => { if (!F.ending && F.step <= 3) rt.say('使番', '佐久間・丹羽・羽柴・滝川の先手、ようやく坂の下へ追い付きました', 4); });
      rt.after(22, () => { if (!F.ending && F.step <= 3) rt.say('織田信長', '先手の者ども、遅いわ！　この好機を何と心得る', 4); });
    }
    counterMarch(F.r2, COUNTER_PATHS[0]);
    march(F.uma, [...ROAD.slice(3, 6), xz(roadX(-98), -98)]);
    march(F.late, ROAD.slice(3, 6));
    followChase(rt, -64);
  },
  toPass(rt) {
    const F = rt.flags;
    F.step = 3; F.stepT = rt.t; F.guideTask = null; rt.setPhase('pass'); rt.unmark('toneRoad');
    rt.obj('main', TONE_LINE[3], 'main', true);
    const signaled = toneAdvanceCue(rt, 'kakari', F.late.center());
    toneGuide(rt, PASS);
    rt.unmark('nobu'); rt.marker('pass', () => toneGuidePosition(rt),
      () => F.guideJoin ? F.guideBend ? '味方へ合流する道' : '合流する味方の兵' : F.guideBend ? '次の道の曲がり' : F.guideVisible ? '峠口を守る敵' : '刀根坂の峠', { h: 0.35 });
    rt.say('組頭', signaled ? '掛かれの貝だ！　味方と峠口の敵を追い払え' : '首を追うな。味方と峠口の敵を追い払え', 4);
    F.chiefNoteT = rt.t + 8;
    // 11/6 fixc2220（一3）：峠口の殿が峠の上に一列で立つだけだった。殿は追い手へ槍を入れて押し返しに出る（返し合わせ）。
    rt.after(12, () => { if (F.step === 3 && fighting(F.r4)) F.r4._charge = true; });
    march(F.uma, ROAD.slice(6, 7)); march(F.late, ROAD.slice(6, 7));
    followChase(rt, -112);
    // 山崎・龍興の旗本を実際に討ち終えてから進む。段の切替で命を零にしない。
    if (!F.fallTold) {
      F.fallTold = true;
      // 11/6 fix61（Z1）：共通の見届けの取り次ぎに回ると、坂にいる本人にも重臣の討死が届かなかった。目の前の事なのでその場で大きく出す。
      rt.after(2, () => { if (!F.ending && !rt.over) { rt._bannerT = rt.t; rt.hud.banner('朝倉の重臣、次々討死', '山崎吉家・斎藤龍興・朝倉道景らが坂に倒れる'); } });
      rt.after(6, () => { if (!F.ending) rt.say('柴田勝家', '朝倉の列は崩れた。名のある者が次々討たれておる。義景を逃がすな！', 4); });
      rt.after(13, () => { if (!F.ending) rt.say('滝川一益', '義景の旗が峠を越えた。一乗谷へ逃げる気じゃ', 3.5); });
    }
  },
  toIchijodani(rt) {
    const F = rt.flags;
    F.step = 4; F.stepT = rt.t; rt.setPhase('road');
    // 11/6 fix61（Z2）：義景は崩れて討たれたのではなく、供と越前へ退いた。敗走にせず峠の先へ歩かせる（「義景と旗本、崩れたぞ」を出さない）。
    rt.unmark('asakuraMain'); F.yoshikage.speed = 1.2; march(F.yoshikage, [xz(-4, -320)], (g) => { g.order = 'hold'; });
    for (const b of F.fleeB) b.order({ id: 'retreat', to: { x: b.pos.x + NORTHWEST.x * 100, z: b.pos.z + NORTHWEST.z * 100 }, form: 'column' });
    rt.unmark('pass'); rt.unmark('nobu');
    // 11/6 fixc2220（一6・二2）：坂の殿・人夫・義景の供は一乗谷へ来ない（河合・山崎・龍興は坂で討死、詫美は疋壇城から逃れ、義景は大野へ）。
    //   略図の後の城下に、峠で退いた将の名札と逃げる列を残さない。
    for (const g of [...F.rears, F.r2c, F.r3c, F.hurtG, ...(F.porters || []), F.yoshikage]) if (g) for (const u of g.units) if (u.alive) {
      u.gone = true; u.noTarget = true; u.target = null; if (u.mesh) u.mesh.visible = false;
    }
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.world.setRainTarget(0);
    // 実際には敦賀に十四〜十六日留まり、十七日に木ノ芽峠を越える。
    rt.banner('越前への追撃', '敦賀に留まること三日。八月十七日、木ノ芽峠を越えて府中へ');
    rt.obj('main', TONE_LINE[4], 'main', true);
    F.journey = toneJourney(rt);
  },
  townAttack(rt) {
    const F = rt.flags;
    F.step = 5; F.stepT = rt.t; rt.setPhase('town'); rt.unmark('chase');
    F.guideTask = null;
    rt.world.setTime('day');
    // 11/8 critic60（八1「城下の地面が雪か氷のように白くテカテカ光る」）：刀根坂の雨から五日後。濡れの照りを引き継がない
    rt.world.wetness = Math.min(rt.world.wetness || 0, 0.25);
    rt.banner('一乗谷の城下', '八月十八日以後。信長公は府中、先手は一乗谷へ');
    rt.obj('main', TONE_LINE[5], 'main', true);
    const signaled = toneAdvanceCue(rt, 'kakari', F.late.center());
    rt.say('使番', signaled ? '掛かれの貝じゃ！　勝家の手と城下の道を押さえよ' : '勝家の手に続け。城下の道を押さえよ', 4);
    toneGuide(rt, TOWN);
    rt.marker('town', () => toneGuidePosition(rt),
      () => F.townWaiting ? F.townAlly ? '守り場で勝家の兵と合流する所' : '守り場で勝家の手を待つ所' : F.guideJoin ? F.guideBend ? '勝家の手へ合流する道' : '合流する勝家の手' : F.guideBend ? '城下へ続く道の曲がり' : F.guideVisible ? '城下の道を守る敵' : '城下の道', { h: 0.35 });
    // 府中で下知する信長を城下へ同行させない。街道の位置は場の圧縮。
    townMarch(F);
    if (!F.townG) {
      const g = F.townG = F.makeTownG();
      F.stageDefenders[5] = [g]; F.defenders.push(g); g.dmgMult = 0.85;
      for (const u of g.units) u.duelDone = true;
      // 城下に残った兵は、町屋の間の道で槍を揃えて攻め手に向かってくる。
      rt.after(6, () => { if (F.step === 5 && fighting(g)) g._charge = true; });
    }
  },
  townFire(rt) {
    const F = rt.flags;
    F.step = 6; F.stepT = rt.t; F.secureT = 0;
    // 城下の合流待ちはここまで。奥への移動に古い「待て」を残さない。
    F.townWaiting = false;
    toneClearWaitSpeech(rt, TOWN_WAIT_LINE);
    toneClearWaitSpeech(rt, INNER_WAIT_LINE);
    rt.setPhase('fire'); rt.unmark('town'); rt.unzone('town');
    rt.say('使番', '谷の奥から朝倉の兵が寄せる。勝家の手と奥の道を守れ', 4);
    // 11/6 fixc2220（四6）：小さな火の舌だけで、城下に火も煙も見えなかった。家ごと燃える火（屋根の炎と黒い煙の柱）にする。
    TOWN_HOUSES.forEach(([x, z], i) => {
      const ignite = () => rt.world.addBlaze(x, z, { w: 7, d: 5, h: 4.6, size: 3.6, rot: TURN });
      // 見出しを出す同じ時に最初の家を燃やし、残りへ順に移す。
      if (i === 0) ignite(); else rt.after(i * 1.5, ignite);
    });
    // 城戸の内の町屋にも火が移る（火は三日続いた）。
    [4, 5, 6].forEach((j, i) => rt.after(4 + i * 2, () => { const [x, z] = townMachiyaAt(j); rt.world.addBlaze(x, z, { w: 6, d: 5, h: 4.2, size: 3.2, rot: TURN }); }));
    rt.banner('一乗谷の火', '城下に火が上がる。義景は大野へ逃れたという');
    F.guideTask = null;
    // 目の前の持ち場替えはその場で知らせ、前の任務を運ぶ使番も取り消す。
    rt.obj('main', TONE_LINE[6], 'main', true);
    toneDestinationGuide(rt, INNER);
    rt.marker('inner', () => !F.innerWaiting && !F.guideJoin && near(rt.player.u.pos, INNER, 12) ? null : toneGuidePosition(rt),
      () => F.innerWaiting ? F.innerAlly ? '守り場で合流する勝家の兵' : '守り場で勝家の兵を待つ所' : F.guideJoin ? F.guideBend ? '勝家の手へ合流する道' : '合流する勝家の手' : F.guideBend ? '奥の道へ続く曲がり' : '奥の道の守り場', { h: 0.35 });
    rt.zone('inner', INNER.x, INNER.z, 12);
    townMarch(F, true);
    if (!F.innerG) {
      const g = F.innerG = F.makeInnerG();
      F.stageDefenders[6] = [g]; F.defenders.push(g); g.dmgMult = 0.85;
      for (const u of g.units) u.duelDone = true;
      // 11/6 fixc2220（九2）：寄せる兵が遠くで止まり、一度も当たらなかった。守り場へ押し出し、着けば攻め手に掛かる。
      g._charge = true;
      rt.after(3, () => { if (F.step === 6 && !F.ending) rt.say('組頭', '谷の奥から朝倉の兵が来るぞ！　槍を揃えよ', 4); });
    }
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('inner'); rt.unzone('inner');
    toneClearWaitSpeech(rt, INNER_HOLD_LINE);
    toneClearWaitSpeech(rt, INNER_RESTART_LINE);
    toneClearWaitSpeech(rt, INNER_WAIT_LINE);
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.objDone('main'); rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '一乗谷の奥の道を守り通した', pts: 20 }; }, '一乗谷の奥の道を守り通した');
    rt.banner('一乗谷の奥の道を守り通した', '後日、義景は大野で自害し、朝倉家は滅ぶ。織田勢は近江へ戻り、小谷城へ');
    // 後日の自害は見出しの語りに留め、足軽の現在の下知とは分ける。
    rt.say('組頭', 'よし、道は守り通した。追い討ちはここまでじゃ', 4);
    // 終幕の見出しは後日の語り。共通の追撃を挟まず、この戦の余韻で閉じる。
    // 15分の構成：結果の札へすぐ行かず、一乗谷の火と勝鬨の余韻を三十秒（tonezaka/yoin.js）
    rt.player.u.invuln = true; yoin(rt);
  },
  lose(rt, why) {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.unmark('toneRoad'); rt.unmark('asakuraMain');
    rt.unmark('toneFront');
    for (let i = 0; i < F.rears.length; i++) rt.unmark('rear' + i);
    rt.objFail('main'); rt.tracker.main = false;
    rt.unmark('nobu'); rt.unmark('pass'); rt.unmark('chase'); rt.unmark('town'); rt.unmark('inner');
    rt.say('組頭', '法螺貝と退き太鼓じゃ。生き残った者は来た道を退け。旗の下へ集まれ！', 4);
    rt.banner('追い手の列が崩れた', why || 'この組では追い討ちを続けられぬ');
    rt.objProgress('main', (why ? why + '。' : '') + '合図：法螺貝と退き太鼓。来た道を退き、旗の下へ'); rt.unzone('inner'); rt.unzone('town');
    rt.finish({ failureReason: why || 'この組では追い討ちを続けられぬ' }, 8);
  },
  update(rt, dt) {
    // 退く人夫は追い手が寄ると走って逃げる（戦わない。士気を落として既存の逃げ足に任せる）
    for (const g of rt.flags.porters || []) {
      if (g.portersFled) continue;
      const c = g.center?.();
      if (c && Math.hypot(c.x - rt.player.u.pos.x, c.z - rt.player.u.pos.z) < 15) { g.portersFled = true; g.noRout = false; g.morale = 0; }
    }
    const F = rt.flags;
    if (F.journey) {
      if (F.ending || !rt.player.u.alive || rt.over) { F.journey.close(); F.journey = null; return; }
      if (!F.journey.tick()) return;
      // 道中の空歩きは省き、勝家の手と共に城下の入口へ着く。
      // 11/6 fixc2220（史実）：信長公は府中に陣し、一乗谷へは先手（柴田ら）が入った。馬廻は城下へ連れず、峠の先に残す（城下に信長の名札を出さない）。
      toneJourneyGroup(rt, F.uma, at(-6, -180), Math.PI + TURN);
      toneJourneyGroup(rt, F.late, at(92, -132), Math.PI / 2 + TURN);
      // 後続の先手（丹羽・羽柴・滝川・佐久間）も一乗谷へ攻め入る。城下を軍勢で押す。
      F.followers.forEach((g, i) => { if (fighting(g)) toneJourneyGroup(rt, g, at(78 - i * 5, -136 + (i % 2) * 4), Math.PI / 2 + TURN); });
      const entry = at(88, -132), P = rt.player.u;
      P.pos.set(entry.x, rt.world.heightAt(entry.x, entry.z), entry.z);
      P.vel.x = P.vel.z = rt.player.vel.x = rt.player.vel.z = 0;
      P.target = P.moveTo = rt.player.lock = null;
      rt.player.yaw = P.heading = Math.PI / 2 + TURN;
      for (const g of rt.squadGroups) toneJourneyGroup(rt, g, at(84, -134), rt.player.yaw);
      let i = 0;
      for (const u of rt.tomoUnits || []) if (u.alive && !u.gone && !u.woundOut) {
        const q = at(84 - i++, -130);
        u.pos.set(q.x, rt.world.heightAt(q.x, q.z), q.z); u.target = u.moveTo = null; u.vel.x = u.vel.z = 0;
      }
      // 隊の列を置いた後で道の脇を選ぶ。騎馬の胴へ主人公を重ねない。
      // 暗転中の一度だけ。既存の兵との距離を見て、城下へ続く道の内に収める。
      let bestGap = -Infinity;
      for (let j = 0; j < 24; j++) {
        const q = at(88 - Math.floor(j / 3) * 2, -132 + (j % 3 - 1) * 4);
        if (chaseNear(q.x, q.z) > 7) continue;
        let gap = Infinity;
        for (const u of rt.army.units) {
          if (u === P || !u.alive || u.gone || u.woundOut) continue;
          gap = Math.min(gap, Math.hypot(q.x - u.pos.x, q.z - u.pos.z) - (u.mounted ? 4.5 : 2));
        }
        if (gap > bestGap) { bestGap = gap; entry.x = q.x; entry.z = q.z; }
        if (gap >= 0) break;
      }
      P.pos.set(entry.x, rt.world.heightAt(entry.x, entry.z), entry.z);
      retreat(F.roadG);
      F.journey.close(); F.journey = null;
      this.townAttack(rt); return;
    }
    if (F.asakuraFlag) {
      // 体と別に置いた本隊の旗も、深手や倒れた持ち主だけを残して宙を進ませない。
      F.asakuraFlag.visible = F.step < 4 && toneCrowdFighter(F.asakuraBearer) && !F.asakuraBearer.camHidden;
      if (F.asakuraFlag.visible) F.asakuraFlag.position.copy(F.asakuraBearer.pos);
    }
    butaiTick(rt, dt);
    if (F.ending || !rt.player.u.alive) return;
    toneFootTick(rt);
    const bag = F.baggage;
    if (!F.baggageResumeAt && rt.t >= F.baggageStopAt) {
      bag.light.halt(); F.baggageResumeAt = rt.t + 4;
    } else if (F.baggageResumeAt && rt.t >= F.baggageResumeAt) {
      bag.light.moveTo(F.baggageTo.x, F.baggageTo.z, 60, { back: true });
      F.baggageResumeAt = 0; F.baggageStopAt = Infinity;
    }
    // 見える敵が別の側へ回った時と、敵が再び近づいた時に知らせる。
    // 同じ危険を連呼せず、下知を変える間も八秒あける。
    if (F.step >= 1 && rt.t >= (F.enemyListenAt || 0)) {
      F.enemyListenAt = rt.t + 1;
      const p = rt.player.u.pos;
      let closest = null, distance = CLOSE_REAR;
      for (const u of rt.army.units) {
        if (!fighter(u) || u.rearWound || u.downed || u.team === rt.player.u.team || u.group?.hidden || u.group?.ambush) continue;
        const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
        if (d >= distance || !sightScreenUnit(rt, u)) continue;
        closest = u; distance = d;
      }
      F.nearEnemy = closest;
      if (!closest) F.enemyCallDirection = null;
      if (closest && rt.t >= (F.enemyVoiceAt || 0)) {
        const dx = closest.pos.x - p.x, dz = closest.pos.z - p.z;
        const e = rt.camera?.matrixWorld.elements;
        const side = e ? dx * e[0] + dz * e[2] : dx * Math.cos(rt.player.yaw) - dz * Math.sin(rt.player.yaw);
        const front = e ? -dx * e[8] - dz * e[10] : dx * Math.sin(rt.player.yaw) + dz * Math.cos(rt.player.yaw);
        const direction = Math.abs(side) > Math.abs(front) ? side > 0 ? '右' : '左' : front > 0 ? '前' : '後ろ';
        const guarding = distance < GUARD_REAR;
        if (direction !== F.enemyCallDirection || guarding !== F.enemyCallGuard) {
          F.enemyCallDirection = direction; F.enemyCallGuard = guarding; F.enemyVoiceAt = rt.t + 8;
          // 11/8 critic60（五1・ui「案内の字は出さない」）：何十回も出た字の案内はやめ、来る向きは画面の縁の赤だけで示す
          const ang = Math.atan2(dx, dz);
          rt.hud.damageFrom?.(ang - rt.player.yaw);
        }
      }
    }
    // 味方の曲がり角での停滞だけをほどく。殿全隊が主人公へ総攻撃する下知は出さない。
    if (F.step >= 1 && rt.t >= (F.pressureAt || 0)) pressureTick(rt, F.step, [], F.oda,
      F.guideTask || (F.step <= 3 ? '道の先へ進み、味方と敵を突き破れ' : '道の先へ進み、勝家の手に続け'));
    const hit = rt.player.lastHit;
    // 四割まで減ってからでは遅い。退ける体力があるうちに一度だけ案内する。
    const player = rt.player, u = player.u;
    if (!F.dangerTip && !rt.over && u.hp > 0 && u.hp <= u.maxHp * 0.65) {
      F.dangerTip = true;
      const ranged = hit?.ranged && rt.t - hit.t < 6;
      const text = ranged ? '矢玉は構えでは防げない。木や屋敷の陰へ退け'
        : player.sta <= 0 || player.guardBroken > 0 ? '構える力が尽きた。味方の後ろへ退き、息を整えよ'
        : `敵へ向け。${toneGuardAction()}。味方の後ろへ下がれ`;
      rt.hud.say('', text, 4, true);
      // 傷の原因の声も同時に重ねず、次の被弾まで待つ。
      F.hurtHitT = hit?.t; F.hurtWarnT = rt.t + 8;
    }
    if (hit && rt.t - hit.t < 8 && hit.t !== F.hurtHitT && rt.t >= (F.hurtWarnT || 0)) {
      // 別の被弾でも、原因と退き方が二分間途切れないよう八秒あけて知らせる。
      F.hurtHitT = hit.t; F.hurtWarnT = rt.t + 8;
      const cause = hit.ranged ? (hit.type === 'bow' ? '矢が当たった。' : '撃たれた。') : hit.back ? '背を突かれた。' : hit.side ? '横から打たれた。' : '前から突かれた。';
      rt.bark(cause + (hit.ranged ? '避けて味方へ退け' : hit.exhausted || hit.guardBroken ? '退いて息を整えよ' : '構えて味方へ退け'), true);
    }
    for (const g of F.rears) if (!g._shown && fighting(g)) {
      let seen = false;
      for (const u of g.units) if (u.alive && near(u.pos, rt.player.u.pos, 30) && sightPoint(rt, u.pos)) { seen = true; break; }
      if (seen) g._shown = true;
    }
    if (rt.t >= (F.chiefNoteT || 0)) for (const g of F.rears) {
      if (g._chiefNamed || !fighting(g)) continue;
      const u = g.units.find((q) => q.type === 'busho' && q.alive && !q.fleeing);
      if (u && near(u.pos, rt.player.u.pos, 18) && sightUnit(rt, u)) {
        g._chiefNamed = true; F.chiefNoteT = rt.t + 8;
        rt.say(u.name, REAR_VOICE[u.name], 4); break;
      }
    }
    for (let i = 0; i < F.rears.length; i++) if (!fighting(F.rears[i])) rt.unmark('rear' + i);
    F.poll -= dt;
    if (F.poll > 0) return;
    const elapsed = Math.max(0, rt.t - F.pollAt); F.pollAt = rt.t; F.poll = 0.4;
    const p = rt.player.u.pos;
    // 11/6 fixc2220（九2・一3）：noAI の組は「攻めよ」の下知だけでは動かない。押し出す組は三秒ごとに主人公の居る所へ道を引き直し、着けば槍を合わせる。
    //   向かう先は主人公か、より近い戦える味方。六歩まで寄せ、槍が届く前に列を止めない。
    for (const g of [F.r1, F.r1b, F.r2, F.r3, F.r2c, F.r3c, F.r4, F.townG, F.innerG]) {
      if (!g || !g._charge || !fighting(g) || rt.t < (g._chargeAt || 0)) continue;
      g._chargeAt = rt.t + 3; g.aggro = 20; g.seekRange = 40;
      const c = g.center(), groundY = rt.world.heightAt(c.x, c.z);
      let to = Math.abs(p.y - groundY) < 6 ? p : null;
      let best = to ? Math.hypot(c.x - p.x, c.z - p.z) - 10 : Infinity;
      // 城下でも近い攻め手と戦う。主人公だけを追って勝家の手を素通りしない。
      const allies = g === F.townG || g === F.innerG ? F.townFriends : [F.uma, F.late, ...F.followers];
      for (const a of allies) {
        if (!fighting(a)) continue;
        // 組の中心は深手の兵や山腹へ残った兵に引かれる。実際に戦える兵へ寄せる。
        for (const u of a.units) {
          if (!fighter(u) || u.rearWound || u.downed || u.climb || Math.abs(u.pos.y - groundY) >= 6) continue;
          const d = Math.hypot(c.x - u.pos.x, c.z - u.pos.z);
          if (d < best) { best = d; to = u.pos; }
        }
      }
      if (!to) continue;
      if (near(c, to, 6)) { if (g.order === 'path') { g.path = null; toneHold(g); } g.aggro = 20; continue; }
      march(g, [[to.x, to.z]], (q) => { toneHold(q); q.aggro = 20; });
      g.speed = 2.4;
    }
    for (const b of F.rearCrowds) {
      if (b.routedL || b.toneRetreatZ <= -220 || !near(b.pos, b.toneRetreatTo, 1)) continue;
      b.toneRetreatZ = Math.max(-220, b.toneRetreatZ - 8);
      const z = b.toneRetreatZ, x = roadX(z), to = b.toneRetreatTo;
      to.x = x * CS + z * SN; to.z = z * CS - x * SN;
      b.light.moveTo(to.x, to.z, 15, { back: false }); // 疲れた退き足（八歩に十五秒）。速いと25秒で峠の闇へ消えた
    }
    if (F.step >= 1 && F.step <= 3) {
      for (const g of F.rears) {
        if (!g._retreatColumn || !fighting(g)) continue;
        let close = near(p, g.anchor, 24);
        for (const a of F.oda) for (const u of a.units) {
          if (u.alive && !u.fleeing && !u.woundOut && near(u.pos, g.anchor, 24)) close = true;
        }
        if (!close) continue;
        g._retreatColumn = false; g.path = null;
        toneHold(g); g.facing = TURN; g._face = TURN;
      }
      retreatCascade(rt);
      toneMarchPace(rt);
    }
    if ((F.step >= 1 && F.step <= 3) || F.step >= 5) withdrawStage(rt);
    // 他の守りも少数になれば退く。
    for (const g of F.defenders) {
      const n = fighters(g);
      // 10/30：今の段の守りは、本人が遠い間は少数でも退かない（立っているだけで段が進まないように）
      if (F.stageDefenders[F.step]?.includes(g) && !near(rt.player.u.pos, g.center(), 45) || g.lastStand) continue;
      if (n > 0 && n <= 3 && n <= g.initial * 0.2) { retreat(g); this.onRout(rt, g); }
    }
    if (F.step >= 1 && !fighting(F.r1) && !fighting(F.r1b)) {
      // 山崎と斎藤の手は一緒に返し合わせる（二つで一つの塊）。
      counterMarch(F.r2, COUNTER_PATHS[0]);
      counterMarch(F.r3, COUNTER_PATHS[1]);
      counterMarch(F.r2c, [xz(roadX(-66), -66), xz(roadX(-46), -46)]);
      counterMarch(F.r3c, [xz(roadX(-76), -76), xz(roadX(-54), -54)]);
      // 旗本だけでなく足軽の手も押し出す。返し合わせの終点で槍の列が立ち尽くさない。
      if (F.step === 2 && (!fighting(F.r2) || !fighting(F.r3) || rt.t - F.stepT > 30)) for (const g of [F.r2, F.r3, F.r2c, F.r3c]) if (fighting(g) && !g._standOut) { g._standOut = true; g._charge = true; }
      if (!fighting(F.r2) && !fighting(F.r2c)) {
        if (!fighting(F.r3) && !fighting(F.r3c)) {
          counterMarch(F.r4, COUNTER_PATHS[2]);
          if (!fighting(F.r4)) {
            counterMarch(F.roadG, COUNTER_PATHS[3]);
            if (!fighting(F.roadG)) counterMarch(F.townG, COUNTER_PATHS[4]);
          }
        }
      }
    }
    if (F.step === 0) {
      // 旗へ着いたら出発する。寄れない時も既存の五秒後の下知で進める。
      if (!rt.G.lord && F.monomiDone && !F.toneMonomi && near(p, F.nobuU.pos, 8)) this.chase(rt);
    }
    if (F.step === 0 && !F.toneMonomi) {
      // 出立待ちも目標の場所と行いを保ち、秒数の案内へ替えない。
      rt.obj('main', TONE_LINE[0], 'main', true);
      rt.objProgress('main', rt.G.lord ? '馬廻と共に、道をたどって追う' : hi(rt) ? '組を率い、信長公の馬のそばへ。寄ればすぐ出発' : '信長公の馬のそばへ。寄ればすぐ出発');
    }
    // この先は約〇・四秒ごとの確認。守った時間も前の確認からの経過で数える。
    // 一コマの dt だけを渡すと、坂道と旗本を守っても守備の手柄が付かない。
    if (F.dpOn) depthTick(rt, elapsed);
    if (F.step >= 1 && F.step <= 3 && !F.dpOn) {
      // 兵が一歩離れただけで進め／戻れを繰り返さない。敵が目前なら猶予を切る。
      const supported = toneSupported(rt, p);
      if (supported) F.supportUntil = rt.t + 3;
      const joined = supported || rt.t < (F.supportUntil || 0) && !(F.nearEnemy && fighter(F.nearEnemy) && near(p, F.nearEnemy.pos, 6));
      // 囲まれた知らせの後でも、味方へ着いたら合流は済み。列の中で戻れを繰り返さない。
      const regroup = toneRegroupNeeded(rt, supported, joined);
      if (joined && !regroup) {
        F.regroupAlly = null;
        toneClearWaitSpeech(rt, CHASE_JOIN_LINE);
      }
      const n = F.step === 1 ? fighters(F.r1) + fighters(F.r1b) : F.step === 2 ? fighters(F.r2) + fighters(F.r3) : fighters(F.r4);
      const wait = F.chaseWait, uc = F.uma.center(), lc = F.late.center();
      wait.umaStopped = wait.t > 0 && Math.hypot(uc.x - wait.umaX, uc.z - wait.umaZ) < 0.1;
      wait.lateStopped = wait.t > 0 && Math.hypot(lc.x - wait.lateX, lc.z - wait.lateZ) < 0.1;
      wait.t = rt.t; wait.step = F.step; wait.enemies = n; wait.joined = joined;
      wait.umaX = uc.x; wait.umaZ = uc.z; wait.lateX = lc.x; wait.lateZ = lc.z;
      // 峠口が開いたら別の残兵へ誘わず、次の段へ進む峠そのものを指す。
      if (F.step === 3 && !n) toneDestinationGuide(rt, PASS);
      else toneGuide(rt, F.step === 1 ? FIRST_END : F.step === 2 ? SAKA : PASS);
      const seenRear = F.guideVisible;
      // 道の案内先とは別の隊も、目の前で槍を向けているなら優先する。
      const closeRear = toneCloseEnemy(rt) || seenRear && near(p, F.guideEnemy.pos, CLOSE_REAR);
      const guardRear = !!toneGuardEnemy(rt);
      // 敵が遠くても、独りになった供には合流先を示す。
      // 峠の敵が退いた後は、後ろの列へ戻さず峠への道を示す。
      if ((regroup || !joined) && !(F.step === 3 && !n && !closeRear)) toneRegroupGuide(rt);
      // 札だけでなく近くの組頭も合流先を教える。短い揺れや連呼は抑える。
      if (F.guideJoin && !F.chaseJoinCalled && rt.t >= (F.chaseJoinSayAt ?? -99) + 8) {
        F.chaseJoinCalled = true; F.chaseJoinSayAt = rt.t;
        rt.say('組頭', F.guideBend ? '道をたどれ。味方の列へ戻るぞ' : '味方へ寄れ。列を揃えて進むぞ', 4);
      } else if (supported) F.chaseJoinCalled = false;
      // 携帯では詳しい任務が隠れる。曲がりの距離を敵との距離と取り違えないよう、主の札も合わせる。
      const task = F.guideJoin ? guardRear ? '敵を見て、味方へ戻れ'
        : F.guideBend ? '道をたどり、味方の列へ戻れ' : '味方の列へ戻れ'
        : guardRear ? '敵へ構え、味方と押せ'
        : F.step === 3 && !n ? closeRear ? '近くの敵を見て、道をたどって峠へ' : '道をたどり、峠を越えよ'
        : !n && closeRear ? '近くの敵を見て、味方の列と進め'
        // 別の隊や背後の敵も近づく。道の印がその敵を指すとは限らない。
        : closeRear ? '近くの敵へ、味方と近づけ'
        : !n ? F.step === 1 ? '敵は退いた。味方と西の坂へ進め'
          : F.step === 2 ? '敵は退いた。味方と峠へ進め' : '敵は退いた。味方と峠を越えよ'
        : n && F.guideBend ? seenRear ? '道の曲がりへ進み、味方と敵を突き破れ' : '道の曲がりへ、味方と進め'
        : n && !seenRear ? '道の先へ、味方と進め'
        : '味方と前の敵へ進め';
      if (F.guideTask !== task) { F.guideTask = task; rt.obj('main', TONE_LINE[F.step], 'main', true); }
      // 峠口が開いたら討取りや後列を待たず、本人が峠へ進むと伝える。
      if (F.step === 3 && !n && !closeRear && !F.passClearedCalled) {
        F.passClearedCalled = true;
        rt.say('組頭', '道が開いた。逃げる兵は追わず、峠へ進め', 4);
      }
      // 坂の向こうの敵を探し回らせず、道の印の意味を各段で一度だけ伝える。
      if (n && !seenRear && !closeRear && !F.guideJoin && F.roadCalledStep !== F.step) {
        F.roadCalledStep = F.step;
        rt.say('組頭', '道をたどれ。山へ入らず、味方と進め', 4);
      }
      if (seenRear) { wait.rearX = F.guideEnemy.pos.x; wait.rearZ = F.guideEnemy.pos.z; }
      const direction = along(wait.rearX, wait.rearZ) < along(p.x, p.z) ? '西' : '東';
      // 行き先と戦い方を一度に詰め込まず、今の状況に要る一文だけ添える。
      const remaining = F.guideJoin ? guardRear ? '行き先は味方の列。敵を見ながら戻れ' : F.guideBend ? '行き先は味方へ戻る道。道なりに進め' : '行き先は合流する味方'
        : guardRear ? '逃げる兵は追わず、槍を向ける敵を押せ'
        : closeRear ? seenRear && !F.guideBend ? '前の敵が道を塞ぐ。味方と近づけ' : '近くに別の敵がいる。味方の列を離れるな'
        : F.guideBend ? '行き先は道の曲がり。山へ入るな'
        : seenRear ? `${direction}の敵を味方と追い払え` : '敵はまだ見えぬ。道をたどれ';
      rt.objProgress('main', F.guideJoin || n || closeRear ? remaining : F.step === 3 ? '道をたどり、刀根坂の峠へ' : !joined ? '近い味方の兵へ寄り、列に続け' : F.step === 1 ? '敵は崩れた。坂の中ほどへ進め' : '坂の敵は崩れた。街道をたどり、刀根坂の峠へ');
    }
    else if (F.step === 5) {
      const cleared = !fighting(F.townG), atTown = near(p, TOWN, 14);
      const supported = F.townFriends.some((g) => toneSupported(rt, p, g));
      // 列の端の一歩で合流札を出し直さない。敵が目前なら猶予を切る。
      if (supported) F.townSupportUntil = rt.t + 3;
      const joined = supported || F.townFriends.some(fighting) && rt.t < (F.townSupportUntil || 0) &&
        !(F.nearEnemy && fighter(F.nearEnemy) && near(p, F.nearEnemy.pos, 6));
      if (joined) {
        F.regroupAlly = null;
        toneClearWaitSpeech(rt, TOWN_JOIN_LINE);
        toneClearWaitSpeech(rt, TOWN_WAIT_LINE);
      }
      // 到着した隊と本人が離れていれば、輪の中の兵へ案内する。
      // 先頭と合流したら、隊の中心や後列の到着を待たない。
      F.townJoined = atTown && supported;
      // 城下の敵が退いたら、残兵を探さず次の合流場所へ進むと知らせる。
      if (cleared && !F.townClearedCalled) {
        F.townClearedCalled = true;
        toneClearWaitSpeech(rt, TOWN_JOIN_LINE);
        if (!atTown) rt.say('組頭', '道が開いた。逃げる兵は追わず、城下へ進め', 4);
      }
      if (cleared) toneDestinationGuide(rt, TOWN);
      else toneGuide(rt, TOWN);
      const closeRear = toneCloseEnemy(rt) || F.guideVisible && near(p, F.guideEnemy.pos, CLOSE_REAR);
      const guardRear = !!toneGuardEnemy(rt);
      // 待つ場所を点線で残す。札を増やさず、合流の判定と同じ広さを示す。
      if (cleared && !F.townZone) {
        F.townZone = true; rt.zone('town', TOWN.x, TOWN.z, 14);
      }
      // 敵がいる間は列へ戻す。敵が退いたら持ち場へ進み、そこで合流する。
      // 別の隊の敵が迫っても、輪の中の合流先を残す。構えながら味方へ寄れる。
      F.townWaiting = cleared && atTown && !F.townJoined;
      if (!joined && !cleared) toneRegroupGuide(rt, F.late);
      const waiting = F.townWaiting;
      // 先に輪へ着いた一人に寄れば合流できる。後列を待たず、守り場で迎える。
      const savedAlly = F.townAlly;
      F.townAlly = null;
      if (waiting) {
        let distance = Infinity;
        // まだ合流できる所なら印を動かさず、兵を追い回す往復を防ぐ。
        const meet = F.townMeet, ally = savedAlly;
        const meetY = rt.world.heightAt(meet.x, meet.z);
        if (ally && F.townFriends.some((g) => !g.routed && g.units.includes(ally)) && ally !== rt.player.u && ally.team === rt.player.u.team &&
            fighter(ally) && !ally.rearWound && !ally.downed && !ally.climb &&
            near(ally.pos, meet, 7) && Math.abs(ally.pos.y - p.y) <= 3 &&
            Math.abs(ally.pos.y - meetY) <= 3 && rt.world.walkable(meet.x, meet.z, meetY)) {
          F.townAlly = ally; distance = -1;
        }
        for (const g of F.townFriends) for (const u of g.routed ? [] : g.units) {
          if (distance < 0) break;
          // 到着済みの兵は背後にいても案内し、視点だけで合流待ちに戻さない。
          // 輪のすぐ外の兵にも、輪の内から寄れるなら合流できる。
          if (u === rt.player.u || u.team !== rt.player.u.team || !fighter(u) || u.rearWound || u.downed || u.climb ||
              Math.abs(u.pos.y - p.y) > 3) continue;
          const dx = u.pos.x - TOWN.x, dz = u.pos.z - TOWN.z;
          const radius = Math.hypot(dx, dz), scale = radius > 13 ? 13 / radius : 1;
          const x = TOWN.x + dx * scale, z = TOWN.z + dz * scale;
          if (Math.hypot(u.pos.x - x, u.pos.z - z) >= 7) continue;
          const y = rt.world.heightAt(x, z);
          if (Math.abs(u.pos.y - y) > 3 || !rt.world.walkable(x, z, y)) continue;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d < distance) {
            distance = d; F.townAlly = u; F.townMeet.x = x; F.townMeet.z = z;
          }
        }
        toneDestinationGuide(rt, TOWN);
        if (F.townAlly) {
          F.roadGuide.x = F.townMeet.x; F.roadGuide.z = F.townMeet.z;
          F.guideBend = false;
        }
      }
      const waitTask = !waiting ? null : guardRear
        ? F.townAlly ? '敵へ構え、勝家の兵のそばへ寄れ' : '敵へ構え、守り場で勝家の兵を迎えよ'
        : F.townAlly ? '勝家の兵のそばへ寄れ' : '城下の道で、勝家の手を待て';
      F.townWaitTask = waitTask;
      // 合流先や構えが変わったら、古い待ち方を読ませない。
      toneClearWaitSpeech(rt, TOWN_WAIT_LINE, true);
      if (!waiting) F.townWaitCalled = null;
      if (waiting && F.townWaitCalled !== waitTask && rt.t >= (F.townWaitSayAt ?? -99) + 8) {
        F.townWaitCalled = waitTask; F.townWaitSayAt = rt.t;
        rt.say('組頭', waitTask, 4);
      }
      if (F.guideJoin && !F.townJoinCalled && rt.t >= (F.townJoinSayAt ?? -99) + 8) {
        F.townJoinCalled = true; F.townJoinSayAt = rt.t;
        rt.say('組頭', cleared ? '敵は退いた。味方と城下へ進め' : guardRear ? '敵へ構え、味方へ戻れ' : '味方へ寄れ。共に城下へ進むぞ', 4);
      } else if (joined) F.townJoinCalled = false;
      const task = F.guideJoin ? guardRear ? '敵へ構え、勝家の手へ戻れ' : '勝家の手へ寄り、共に城下へ'
        : waiting ? waitTask
        : guardRear ? '近くの敵へ構え、勝家の手と追い払え'
        : cleared && closeRear ? '近くの敵を見て、勝家の手と城下へ'
        : cleared ? atTown ? F.townJoined ? '勝家の兵が揃うた。勝家の手と奥へ進め' : F.townAlly ? '勝家の兵のそばへ寄れ' : '城下の道で勝家の手を待て' : '敵は退いた。城下の道へ進め'
        : F.guideBend ? '道の曲がりへ。勝家の手に続け'
        : F.guideVisible ? '勝家の手に続き、城下の道から敵を追い払え' : '城下の道へ進み、勝家の手に続け';
      if (F.guideTask !== task) { F.guideTask = task; rt.obj('main', TONE_LINE[F.step], 'main', true); }
      rt.objProgress('main', waiting ? waitTask : F.guideJoin ? guardRear ? '行き先は味方の列。敵を見ながら戻れ' : '行き先は合流する味方。共に城下へ進め' : guardRear ? '逃げる兵は追わず、槍を向ける敵を押せ' : cleared && closeRear ? '近くに別の敵がいる。勝家の手を離れるな' : cleared ? atTown ? F.townAlly ? '行き先は守り場で味方と合流できる所' : '城下の道で勝家の兵に加われ' : '道をたどり、城下で勝家の兵に加われ'
        : F.guideBend ? '行き先は道の曲がり。敵へは道をたどれ' : F.guideVisible ? '勝家の旗に続き、道を守る敵を追い払え' : '道の先へ進み、勝家の旗に続け');
    }
    else if (F.step === 6) {
      // 11/6 fixc2220（九2・五1・Y2）：「兵二人が揃うまで待て」「あと五秒」をやめた。寄せる朝倉の兵を守り場で追い払えば守り通す。
      toneDestinationGuide(rt, INNER);
      // 行き先の印・守り場と同じ十二歩の内で守る。城下に残ったまま達成させない。
      const atInner = near(p, INNER, 12), foe = fighting(F.innerG);
      F.innerJoined = atInner; F.innerWaiting = false; F.guideJoin = false; F.innerAlly = null;
      F.innerGuardTask = null; F.innerWaitTask = null;
      const holding = atInner && !foe;
      rt.hud.root.toggleAttribute('data-tonezaka-holding', holding);
      // 持ち場を離れた間の守備時間は持ち越さず、戻ってから守り直す。
      F.secureT = holding ? F.secureT + elapsed : 0;
      if (F.guideTask !== TONE_LINE[6]) { F.guideTask = TONE_LINE[6]; rt.obj('main', TONE_LINE[6], 'main', true); }
      rt.objProgress('main', '');
    }
    // 先鋒が減っても後続は残る。味方の残数だけで主人公の任務を失敗にしない。
    const shaky = (F.step >= 5 && !F.townFriends.some(fighting)) || (F.step > 0 && F.step < 5 && !fighting(F.uma) && !fighting(F.late));
    if (shaky && !F.shakyWarn) { F.shakyWarn = true; rt.say('組頭', F.step >= 5 ? '柴田の手が持たぬぞ！　旗の下へ寄り、踏みとどまれ' : '馬廻が押されておる！　信長公の旗を守れ', 4); }
    // 殿が退いたら次の任務へ。列の後ろや逃げる残兵の到着を待たない。
    if (F.dpOn) return;
    if (F.step === 1 && !fighting(F.r1) && !fighting(F.r1b)) this.second(rt);
    // 坂の中ほどを破ったら、狭い坂道で詰まる朝倉の列（tonezaka/kuzure.js）を押し破ってから峠口へ
    else if (F.step === 2 && !fighting(F.r2) && !fighting(F.r3) && !fighting(F.r2c) && !fighting(F.r3c)) this.toneDeep(rt, 'K', '坂の上の狭い道で、詰まった朝倉の列を押し破れ', kuzureSteps(this.kit()), () => this.toPass(rt));
    // 追撃の略図へ移るのは、本人が道をたどって峠へ着いてから。
    // 峠を越えたら義景の旗を追い、旗本の返しを破る（tonezaka/yoshikage.js）。義景は逃げ延びて一乗谷へ
    // 11/9 二巡（豊臣A）：討てない詫美越後守が一人残ると殿が「戦える」のまま崩れず、峠の口で十分止まった（act の流し三回）。討てる兵が尽きれば崩れた事にする
    else if (F.step === 3 && (!fighting(F.r4) || !F.r4.units.some((u) => fighter(u) && !u.invuln)) && near(p, PASS, 14)) {
      // 11/9 二巡（豊臣A）：崩れた詫美の殿の生き残り（討てない詫美越後守を含む）が峠の細い道に残り、峠の先へ一歩も進めず十分止まった（act の流し）。
      //   峠を越える段に入る時、峠から先の道に残る殿の兵は場から下げる（詫美は史実どおり逃げ延びる）
      if (F.r4) for (const u of F.r4.units) if (u.alive && !u.gone) rt.army.despawn(u);
      this.toneDeep(rt, 'Y', '峠を越え、義景の旗を追え', yoshikageSteps(this.kit()), () => this.toIchijodani(rt));
    }
    // 下知どおりの場所で合流して進む。離れたまま時刻だけで達成にしない。
    else if (F.step === 5 && !fighting(F.townG) && near(p, TOWN, 14) && F.townJoined) this.townFire(rt);
    else if (F.step === 6) {
      // 寄せ手を退け、本人が奥の道を守って初めて締める。時刻だけでは達成にしない。
      if (F.secureT >= 3) this.win(rt);
    }
  },
  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    if (v.type === 'busho' && v.team === 1 && v.group) v.group.morale -= 35;
    // 逃げる残兵を狩る手柄にはせず、持ち場を守る敵への自分と組の働きだけを数える。
    if (v.team === 1 && !v.civ && !v.isStruct && !v.fleeing &&
        F.stageDefenders[F.step]?.includes(v.group) &&
        (k === rt.player.u || k?.team === rt.player.u.team && (k.isSub || k.isTomo))) {
      v.group._toneHelp = Math.min(3, (v.group._toneHelp || 0) + 1);
    }
  },
  onFinish(rt) { rt.flags.journey?.close(); rt.flags.journey = null; rt.flags.restoreNobuLabel?.(); rt.flags.labelStyle?.remove(); delete rt.hud.root.dataset.tonezaka; delete rt.hud.root.dataset.tonezakaHolding; },
  onRout(rt, g) {
    const F = rt.flags;
    if (g.team === 1 && g._toneHelp >= 3 && !g._toneHelpAward && F.stageDefenders[F.step]?.includes(g)) {
      g._toneHelpAward = true;
      const label = g.name + 'を突き破る働き';
      rt.award((t) => t.side.push(label), '自分たちの働きで道が開いた');
    }
    if (g.team !== 1 || g._routSaid || rt.t < (F.routSayT || 0) || !near(rt.player.u.pos, g.center(), 35)) return;
    g._routSaid = true; F.routSayT = rt.t + 8;
    const line = F.routLine = ((F.routLine || 0) + 1) % 3;
    rt.say('足軽', line === 0 ? '敵が逃げてくがね！　味方の旗に続け！' : line === 1 ? '槍が崩れたで！　道を押さえろ！' : '道が空いたで！　一人で追うでねえ！', 3);
  },
};
// 総勢は参考値。局地の一人の死を三十人・六十人の死へ換算しない。
// 11/8 critic60（九3・十二1「三千余り討たれた大負けなのに数が減らない」）：段が進むごとに朝倉の数を減らす（討死・逃げ散り）。織田も少し減る
// 段を始めただけで損失を先取りしない。河合の殿と戦う前は三万対二万を保つ。
// 略図から城下への移動でも減らさず、奥の道の損失は守り通した時に加える。
const TONE_LOSS_B = [0, 0, 900, 1800, 3300, 3300, 3300, 9000];
const TONE_LOSS_A = [0, 0, 60, 150, 340, 340, 340, 480];
tonezaka.force = (rt) => {
  const F = rt?.flags || {}, s = F.ending && rt.tracker?.main ? 7 : Math.max(0, Math.min(6, F.step || 0));
  return { a: 30000 - TONE_LOSS_A[s] - (F.ak || 0), a0: 30000, b: Math.max(0, 20000 - TONE_LOSS_B[s] - (F.ek || 0)), b0: 20000 };
};
tonezaka.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '朝倉軍', mon: 'asakura' } };
tonezaka.taisho = { a: null, b: null }; // 固有の馬廻と退く本隊を使い、共通の討ち取り勝ちを足さない。
tonezaka.noTaishoRaid = true;
tonezaka.noWake = true;
tonezaka.noRevive = true; // 深手から数秒で体力を戻し、戦い直す救済を足さない。
tonezaka.noDistantBattle = true;
tonezaka.lordHata = { spear: 12 };
tonezaka.rts = false;
tonezaka.gungi = () => null; // 足軽が柴田勝家の進路・全軍の作戦を決める軍議を作らない。
tonezaka.famous = []; // 河合らは初めから供と配置し、共通の名将追加を重ねない。
tonezaka.date = (rt) => rt.flags.step >= 5 ? '天正元年八月十八日以後　一乗谷の城下' : rt.flags.step >= 4 ? '天正元年八月十四日〜十八日　越前への追撃' : '天正元年八月十三日〜十四日　刀根坂の追撃';
tonezaka.canSkip = (rt) => (rt.phase === 'brief' ? '味方と追い討ちに出る' : '');
tonezaka.skip = (rt) => { if (rt.phase === 'brief') tonezaka.chase(rt); };
tonezaka.history = '天正元年（1573）八月、織田信長は浅井長政の小谷城を囲んだ。後詰に出てきた朝倉義景は、大嵐の夜に大嶽などの砦を落とされると、陣を払って越前へ退き始めた。信長はこれを読んでいて、諸将に「油断するな」と命じていた。しかし先手の諸将は遅れ、信長は自ら先に立って追った（あとで諸将を叱ったと『信長公記』は伝える）。刀根山の峰で追いついた織田勢は、敦賀まで追い討ちを続けた。『信長公記』は、この追撃で三千余りの首を取ったと記す。朝倉の重臣・山崎吉家や、美濃を追われて朝倉に身を寄せていた斎藤龍興も討ち死にしたと伝わる。義景は一乗谷へ逃れたが、織田勢の追撃は敦賀から府中へ続いた。『信長公記』巻六は、八月十八日に信長が府中の龍門寺に陣を置き、義景が一乗谷を捨てて大野へ逃れ、柴田勝家らが追ったと記す。一乗谷は焼かれた。朝倉景鏡は織田方へ寝返り、八月二十日、義景は大野で自害して朝倉家は滅んだ。夜の追撃は八月十三日、十二日の大風雨とは分けている。総勢と各備の人数は参考値で、『信長公記』に各備の内訳はない。遊びでは数日の道のりを縮め、街道や城下に残る兵との戦いを補っている。';
// 信長で遊ぶ時：居場所の目安（bot の目が始まりの位置を確かめる）
tonezaka.lordAt = { ...at(2, 128), r: 12, why: '馬廻の先頭（信長は自ら馬を出し、朝倉勢を追った）' };

// 自動操作も、戦う殿と持ち場を同じ条件で進む。
tonezaka.botOrders = true;
tonezaka.botRetreatWay = toneRetreatWay;
tonezaka.botBrain = (b, inp, { goTo, patientStrike, strikeTarget }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null; inp.k.delete('KeyW'); inp.k.delete('KeyE');
  if (!u.alive || F.ending) return;
  // 足した段：物見の高みへ・段の中は共通の段の頭
  if (F.toneMonomi) { goTo(p, inp, F.toneMonomi.x, F.toneMonomi.z, 2.5); return; }
  if (F.dpOn && F.dp?.on) { depthBot(b, inp, goTo); return; }
  inp.leftPressed = false; inp.chargeHold = false; inp.guardHold = false; inp.runHeld = false;
  if (b.squad.length && !(b.botCmdT > b.t) && b.squadGroups.some((g) => g.order !== 'follow')) {
    inp.quickCmd = 'follow'; b.botCmdT = b.t + 2;
  }
  // 下知の間は静止した馬廻の中央へ歩かない。列が進み始めてから供として続く。
  if (F.step === 0 || F.step === 4) return;
  // 近い兵より、実際にこちらへ打ち込んでいる兵を先に受ける。
  let attacker = null, ad = 10, soonest = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.noTarget || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos, false)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 馬廻や組の兵への振りを、自分への打ち込みとして受け続けない。
    const charge = o.charging && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const atk = o.atk && o.atk.target === u && !o.atk.bow;
    if (!charge && !atk && !swing) continue;
    // 近い兵がまだ溜めていても、横の兵の穂先が先に届くならそちらを受ける。
    const motion = atk ? (SWING[o.atk.kind] || SWING.thrust) : null;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) :
      o.atk.t + motion[0] * motion[1] * (o.atk.fast ? 0.7 : 1);
    if (d < 10 && (soon < soonest || soon === soonest && d < ad)) { attacker = o; ad = d; soonest = soon; }
  }
  // 坂の上や物陰の兵を、届く相手として追い続けない。
  const e = attacker || strikeTarget(b, F.guideJoin ? GUARD_REAR : 12);
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    const reach = p.weapon === 'sword' ? 1.9 : 2.8;
    // 敵へ詰める時も、当たりで止まったら回り込む共通の歩きを使う。
    // 狙いの固定で、その回り込みの向きへ引き戻されないようにする。
    if (p.lock) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 敵の槍は三歩余り、自分の槍は二歩余り。打ち込みを見た時に足を止めると、
    // こちらだけ届かない所で受け続ける。騎馬の突進以外は受けながら間合いを詰める。
    if (d > reach * 0.85 && !e.charging) {
      goTo(p, inp, e.pos.x, e.pos.z, reach * 0.85);
      // 回り込む歩みを残し、突きも構えも相手へ向ける。
      // 間合いの端で歩く向きのまま突くと、敵の横へ空振りする。
      const walk = p.yaw;
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      inp.k.delete('KeyW');
      const turn = walk - p.yaw;
      if (Math.cos(turn) > 0.3) inp.k.add('KeyW');
      else if (Math.cos(turn) < -0.3) inp.k.add('KeyS');
      if (Math.sin(turn) > 0.3) inp.k.add('KeyA');
      else if (Math.sin(turn) < -0.3) inp.k.add('KeyD');
    }
    if (attacker) {
      // 振りかぶりの初めから構えると、穂先が来る頃には受け流しの間が終わる。
      // 大振りも、実際に穂先が届く直前に構える。長い溜めの間は気力を戻す。
      const guardLead = p.parryWin() * (u.mobbed ? 0.7 : 1) * 0.65;
      inp.guardHold = !!e.charging || soonest <= guardLead;
      if (inp.guardHold) p.botStrikeUntil = 0;
      // 打ち手が交代しても、まだ長く溜めているなら普通の突きを出せる。
      // 全ての打ち手のうち最も早い一撃まで、余裕がある時だけ割り込む。
      else if (d < reach && soonest > 0.85 && e.atk?.t > 0.65) patientStrike(p, inp, e, d, true);
    }
    // 構えをくじで切り替えると、解いた直後の払いに化けて気力が尽きる。
    // 打ち込みを受けた後、構えを解く時間を保ってから突く。
    else if (d < reach) patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  // 守り場の端に着いても、味方が遠ければ示された合流先へ寄る。
  // 合流先から七歩以内の兵へ八歩未満まで近づけるよう、半歩まで進む。
  // 味方がまだ来ていない時と合流済みの時は、その場で待つ。
  if (F.step === 5 && !fighting(F.townG) && near(u.pos, TOWN, 14)) {
    if (F.townWaiting && F.townAlly) goTo(p, inp, F.roadGuide.x, F.roadGuide.z, 0.5);
    return;
  }
  // 二人と守り始めた場所を保つ。中央へ歩いて味方から離れ、守り直しを繰り返さない。
  if (F.step === 6 && F.innerJoined && !fighting(F.innerG) && near(u.pos, INNER, 12)) return;
  // 夜の峠でも合流の下知に従う。遠い敵だけを追って味方の列から離れない。
  // 目前の打ち合いは上で受け、敵が離れたら札と同じ道を戻る。
  if ((F.step >= 1 && F.step <= 3 || F.step === 6) && F.guideJoin) {
    goTo(p, inp, F.roadGuide.x, F.roadGuide.z, 3); return;
  }
  if (F.step >= 1 && F.step <= 3 || F.step === 5 || F.step === 6) {
    // 道中は人に見せた印をたどる。別の敵への直進で曲がりや合流を無視しない。
    // 目前の槍合わせは上で処理し、霧の先や山腹の兵には街道から近づく。
    goTo(p, inp, F.roadGuide.x, F.roadGuide.z, F.guideBend ? 2 : 3); return;
  }
  const at = F.step === 1 ? FIRST_END : F.step === 2 ? SAKA : F.step === 3 ? PASS : F.step === 5 ? TOWN : F.step === 6 ? INNER : F.uma.center();
  goTo(p, inp, at.x, at.z, 3);
};

// 信長公記巻六：信長の先駆けと遅れる先手、朝倉の退却。
// 長蛇は軍学上の史実の陣名でなく、細い街道に沿う並びの呼び名。
// 各備の内訳は史料にないため不明とする。描く兵の数・隊列・総勢は変えない。
installBattleJinkei(tonezaka, [
  battleJin('街道に続く追い手', 0, at(2, 124), Math.PI + TURN, [
    ['tone_nobunaga', '追い手の先頭・馬廻', '織田信長', null, at(2, 124), 'eiraku', 'oda', (r) => r.flags.uma, { form: 'column' }],
    ['tone_shibata', '遅れて追いつく先手', '柴田勝家', null, at(6, 164), 'oda', 'oda', (r) => r.flags.late, { form: 'column' }],
    ['tone_niwa', '後続の備え', '丹羽長秀', null, at(2, 186), 'oda', 'oda', (r) => r.flags.bO?.niwa],
    ['tone_hashiba', '後続の備え', '羽柴秀吉', null, at(10, 214), 'oda', 'oda', (r) => r.flags.bO?.hashiba],
    ['tone_takigawa', '後続の備え', '滝川一益', null, at(-2, 238), 'takigawa', 'takigawa', (r) => r.flags.bO?.takigawa],
    ['tone_sakuma', '後続の備え', '佐久間信盛', null, at(4, 260), 'oda', 'oda', (r) => r.flags.bO?.sakuma],
  ], '諸将の参戦を採用。各備の兵数は不明。後続の順は推定で、信長が先手を待たず追う筋を保つ。'),
  battleJin('殿から峠へ続く退きの備え', 1, at(-4, -200), TURN, [
    ['tone_kawai', '街道の殿', '河合吉統', null, at(-6, 40), 'asakura', 'asakura', (r) => r.flags.r1],
    ['tone_yamazaki', '坂の返し合わせ', '山崎吉家', null, at(4, -74), 'asakura', 'asakura', (r) => r.flags.r2],
    ['tone_saito', '坂の脇の備え', '斎藤龍興', null, at(6, -106), 'asakura', 'asakura', (r) => r.flags.r3],
    ['tone_takumi', '峠口の後備え', '詫美越後守', null, at(-4, -142), 'asakura', 'asakura', (r) => r.flags.r4],
    ['tone_yoshikage', '峠を越える本隊', '朝倉義景', null, at(-4, -200), 'asakura', 'asakura', (r) => r.flags.fleeB?.[0], { named: false }],
    ['tone_nida', '先へ退く荷駄と後備え', '将の名は不明', null, at(10, -240), 'asakura', 'asakura', (r) => r.flags.fleeB?.[1], { named: false }],
  ], '総勢二万は参考値。各備の兵数は不明で、持ち場は復元。朝倉は初めから疲れと乱れがあり、向きをそろえて正面決戦にはしない。'),
]);

// 武将の名簿（bushou_roster.js）から、この戦に出てまだ場にいない武将を足す（10/31 bushou_1_16）。敵の大将は討たれない（名簿で討死の人だけ討たれる）。
tonezaka.bushou = ['蜂屋頼隆', '稲葉一鉄'];
// 11/4（AP9・AQ6）：共通の陣立て（army_jindate）の軽い大軍を入れない。持ち場のすぐ後ろに味方が埋もれる見せかけになった。
//   後続の備（丹羽・羽柴・滝川・佐久間）と峠の向こうの義景の本隊・荷駄は、この戦が自分で置く。
tonezaka.__jindate = true;
// 右上の目標（15分の構成の七つ。史実の順。一度入った段からは戻らない）
{ const st = (n) => (rt) => (rt.flags.step ?? 0) >= n, fl = (k) => (rt) => !!rt.flags[k];
  STAGES.tonezaka = [['坂の下で河合吉統の殿を突き破れ'], ['坂の中ほどで山崎吉家・斎藤龍興の手を突き破れ', st(2)], ['坂の上の狭い道で、詰まった朝倉の列を押し破れ', fl('dpK')],
    ['峠口で詫美越後守の殿を追い払え', st(3)], ['峠を越え、義景の旗を追え', fl('dpY')], ['一乗谷の城下の道から朝倉の兵を追い払え', st(4)], ['一乗谷の奥の道で寄せる朝倉の兵を防げ', st(6)]]; }
export { tonezaka };
