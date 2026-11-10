// ======================================================================
// 徳川編 2　河田木曽川渡河・米野の戦い（慶長五年 1600・八月二十二日）　美濃への入り口、川を渡る戦
// 筋書きの正：docs/chapter3_tokugawa.md の「2. 河田木曽川渡河・米野」
// 11/4 kaito「今夜までに史実どおりの布陣と流れに作り直す」：布陣と流れは docs/battle_refs/k02_kawada.md の「11/4 布陣と流れ」。
//   木曽川は東から西へ流れ、川島の辺りで南の筋・北の筋に分かれて中洲の小屋場島を抱く。
//   東軍（河田の手）：池田輝政（総大将・南岸の本陣の床几）・池田長吉・浅野幸長・一柳直盛（道案内の先手）・山内一豊（東の浅瀬）。
//   西軍（織田秀信方）：北岸の柵に木造長政の鉄砲組、下流の米野村に百々綱家と飯沼長資、北の新加納の砦に殿。秀信は川手の本陣（出さない）。
//   流れ：①明け方に南の筋を渡り小屋場島へ（北岸から撃たれる）②北の筋を渡り柵の内の木造長政の旗本を追い払う（大塚権太夫が一番に上がる）
//         ③北岸を下流の米野村へ。昼、百々綱家の隊と組み合う（飯沼長資が大塚を討って出て、討ち死にする）④新加納の砦の殿を破る→秀信は岐阜城へ退く
//   11/5 専門家の目：木造長政と百々綱家は米野で死なず、岐阜城へ退いて翌二十三日も城を守った（英語版 Wikipedia「Battle of Gifu Castle」の将の欄・
//   battle_learn の「岐阜城の戦いで降伏を勧めた」）。二人は討たせず柵と村から退かせ、ここで討ち死にした飯沼長資を討つ相手にする。
//   11/6 専門家の目：木曽川を守ったのは木造具政（1530 生）の子の木造長政（大膳。ja Wikipedia「木造長政」：米野で千の兵・岐阜城で七曲口）。
//   史跡の案内板は父の名で書くが、名は長政にする（図鑑 zukan_people も長政）。
//   織田秀信方は本物の織田家なので、旗と紋は織田木瓜（徳川編の noOda が永楽銭の背旗と桐の紋に替えていたのを、この戦では止める）。
// 11/3 kaito AP〜AT：見せかけの軍勢（addDistantArmy・clash）は出さない。見える兵は全部本物。兵の比は東軍一万八千・織田勢三千（六対一）。
//   旗はこの戦の家だけ：池田の揚羽蝶・浅野の違い鷹の羽・山内の丸に三つ柏・一柳の釘抜（11/5 共通の係が紋を足した）・織田秀信方は木瓜。
//   福島正則は下流の尾越（起の渡し・今の一宮市起）から渡ったので河田に出さない（11/5 専門家の目：前は「上流」と誤っていた）。
// 負け方：討たれる。目標が未達の間は経過時間だけで負けにしない。
// 向き：北が -z（美濃・岐阜）、南が +z（尾張・清洲）。浅瀬は x = -60（河田の渡し）と x = 80。
// 地形：国土地理院の標高（dem_kawada.js・tools/dem.mjs の kawada）は低い平野の起伏だけ写し、川は手で掘る。水平は実の 1/6 より縮めた（米野・新加納は歩いて行ける遠さに）。
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { demSample } from './dem.js';
import DEM from './dem_kawada.js';
import { nobori, jinmaku, kagaribi, palisade, shogi, village, kabukimon, yagura } from './props.js';
import { RANKS } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { allyGroup, enemyGroup, nm } from './bhelp.js';
import { distToPolyline } from './world.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';
import { routeTools } from './b_k_route.js';
import { timeslipField } from './timeslip_field.js';
import { revealName } from './battle_intel.js';
import { GENERALS } from './units_data.js';
import { KACCHU } from './kacchu_data.js';
import { install as installTosen, depthPlan as kawadaDepth } from './k02_kawada/tosen.js';   // 渡河の厚み・米野の押し合い・追撃・岐阜への知らせ（toku15 の 2）

// 慶長五年の名乗りは池田照政（井伊直政の書状。「輝政」に改めたのは慶長十二年頃）。顔と具足は輝政の物を使う
if (GENERALS['池田輝政'] && !GENERALS['池田照政']) GENERALS['池田照政'] = GENERALS['池田輝政'];
if (KACCHU['池田輝政'] && !KACCHU['池田照政']) KACCHU['池田照政'] = KACCHU['池田輝政'];

// ---- 場所（ゲームの座標） ----
const START = { x: -60, z: 78 };       // 南の野（池田の先手の集まる所）。11/8 critic60 二1：始まりの一枚で南の筋が霧の向こうに見える近さへ（前は z 110 で川が写らなかった）
const HONJIN = { x: -24, z: 132 };     // 池田輝政の本陣（南岸の堤の後ろ・陣幕と床几）
const ISLE = { x: -56, z: 4 };         // 中洲の小屋場島（輝政が旗を立てた松）
const NORTH = { x: -60, z: -38 };       // 北岸の守り（木造長政の鉄砲組）
const GUARD = { x: -60, z: -56 };       // 柵の内の木造長政の旗本
const YONENO = { x: -140, z: -68 };     // 米野村（北岸を下流へ。百々綱家）
const SHINKANO = { x: -84, z: -184 };   // 新加納の砦（岐阜への道）

const KISO = [[-300, 6], [-130, 3], [-60, 2], [20, -2], [100, -4], [300, 0]];
// 慶長の頃の木曽川は川島で幾筋にも分かれた（「川島」の名の元）。南の筋と北の筋の二本、間を小屋場島に
// 11/6 kaito の目「木曽川なのに幅 4〜5m の小川」：一筋を幅二十余歩（半幅 12・11）に広げ、間の小屋場島も二十歩ほどの中洲に。岸と陣は北へずらした
const KISO_S = KISO.map(([x, z]) => [x, z + 24]), KISO_N = KISO.map(([x, z]) => [x, z - 18]);
// 浅瀬は馬が渡りきれる幅（BK2：浅瀬の端から入った馬が川の中で止まらない）。深みは人も馬も入れない
const FORDS = [{ x: -60, w: 16 }, { x: 80, w: 12 }];
// 11/6 夜（fixc0939_k02_kawada）：浅瀬の所だけ川床が水面より上に出て、川の真ん中に乾いた道と菱形の水たまりが出ていた（写真）。
//   水面を川に沿って平らに決め（levelAt）、浅瀬は川の幅いっぱいに脛から膝の水の平らな床にする
const fordK = (x) => { let k = 0; for (const f of FORDS) k = Math.max(k, Math.max(0, Math.min(1, (f.w - 2 - Math.abs(x - f.x)) / 4))); return k; };
const flat0 = (x) => 0.1 + x * 0.0012, LEVEL = (x) => flat0(x) - 0.3;
const FORT_IN = { x: -84, z: -186 };     // 新加納の砦の内（柵で囲った中ほど）
const FORT_GATE = { x: -84, z: -166 };   // 新加納の砦の南の木戸の前
const inFort = (p) => Math.abs(p.x - FORT_IN.x) < 19.5 && p.z < FORT_IN.z + 11.5 && p.z > FORT_IN.z - 11.5;
const GATE = { x: -60, z: -48 };        // 北岸の柵の口
const insideNorthGuard = (p) => Math.abs(p.x - GUARD.x) < 34 && p.z < GATE.z && p.z > GUARD.z - 30;
const ROUTE = [[-60, 160], [-60, 110], [-60, 66], [-60, 46], [-58, 18], [ISLE.x, ISLE.z], [-60, -10], [NORTH.x, NORTH.z], [GATE.x, GATE.z], [-84, -60], [-112, -66], [YONENO.x, YONENO.z], [-118, -80], [-112, -112], [-104, -146], [SHINKANO.x, SHINKANO.z + 24], [SHINKANO.x, SHINKANO.z]];

// 11/8 critic60 四3「甲冑の基本は黒」：池田の侍の具足が赤茶に出ていた。東軍の四家は黒漆の具足に紺の縅
const BLACK = { armor: 0x1e1b19, lace: 0x2c3448 };
const IKEDA = { flag: 'ageha', ...BLACK };                                   // 池田の揚羽蝶
const ASANO = { flag: 'asano', ...BLACK };                                   // 浅野の丸に違い鷹の羽
const YAMAUCHI = { flag: 'kashiwa', ...BLACK }, HITOTSU = { flag: 'kuginuki', ...BLACK };   // 山内の丸に三つ柏・一柳の釘抜（textures。11/5 共通の係）
const WEST = { armor: 0x2a2622, lace: 0x7a3a2a, flag: 'oda' };    // 織田秀信方の木瓜
// 名のある将（busho）は自分の具足（kacchu_data）のまま。家の黒は兵だけに着せる
const dress = (list, lk) => list.map((s) => { const { armor, lace, ...rest } = lk; return { ...s, o: { ...(s.type === 'busho' && lk === WEST ? lk : s.type === 'busho' ? rest : lk), ...(s.o || {}) } }; });

// ---- 地形：低い平野。堤が川に沿って走り、田が広がる ----
// 11/6 専門家の目：前は標高の起伏がそのまま川の中まで入り、水面が低い岸に合わせて下がって、浅瀬の川床より低くなっていた（浅瀬が乾いた草地）。
//   川の両岸から六十歩の内は、東（上流）から西（下流）へゆるく下がる河原の面に均し、二筋の流れの芯を一段掘り下げる（水面は岸より下、浅瀬は脛まで水）
const XY = 6, D0 = demSample(DEM, 0, 0);
const smooth01 = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };
function height(x, z) {
  const n = Math.max(-1, Math.min(1.5, (demSample(DEM, x * XY, z * XY) - D0) * 0.25));
  let h = n + 0.25 * Math.sin(x * 0.05 + 0.6) * Math.cos(z * 0.04);
  const d = distToPolyline(x, z, KISO);
  const plain = smooth01((74 - d) / 26);   // 1：河原の面（d < 48）・0：田の起伏（d > 74）
  if (plain > 0) h = h * (1 - plain) + (0.1 + x * 0.0012) * plain;
  const fk = fordK(x), dS = distToPolyline(x, z, KISO_S), dN = distToPolyline(x, z, KISO_N);
  // 水面は河原より三十センチ下。五十センチだけ掘ると深みまで二十センチになり、どこでも渡れていた。
  h -= (2.7 * Math.exp(-((dS / 8) ** 2)) + 2.6 * Math.exp(-((dN / 7) ** 2))) * (1 - fk) + 0.62 * Math.max(smooth01((18 - dS) / 4), smooth01((17 - dN) / 4)) * fk;
  h += 1.3 * Math.exp(-(((d - 44) / 5) ** 2));    // 川の両岸の堤
  h += 0.45 * Math.exp(-(((d - 3) / 6) ** 2));     // 中洲（小屋場島）の砂の高まり
  return h;
}

const { way: wayRaw } = routeTools(ROUTE, 'k02');
const { way: eastWay } = routeTools([[80, 78], [80, 46], [80, 4], [80, -38], [80, -56]], 'k02east');
const EAST_EXIT = { x: 80, z: -56 };
// 道の角は 1.5 歩の内で次へ送るが、着いたとみなす輪が 2 歩で、角の 2 歩手前で止まったままになった（11/6 流しで新加納の手前に四分）。輪を 1 歩に
const kawadaWay = (army, u, want) => {
  // 退避で選んだ直進先は、歩く処理がもう一度道を選ぶ時にも維持する。
  const back = u._k02BackDirect;
  u._k02BackDirect = null;
  if (back && back.x === want.x && back.z === want.z) return want;
  // 米野への下知が先に来ても、山内の手は東の浅瀬を渡りきってから西へ向く。
  // 米野をそのまま渡すと道から三十歩以上離れて案内が外れ、北の筋の深みへ斜めに進んで止まる。
  if (u.pos.x > 20 && u.pos.z >= NORTH.z && want.x <= 20 && want.z < NORTH.z) {
    const q = eastWay(army, u, EAST_EXIT); if (q !== EAST_EXIT) q.botRadius = 1; return q;
  }
  // 北の筋を上がった後は、柵を挟まない行き先へ隊幅を保って進む。
  // 道譲りや口の脇への一歩まで中央へ戻すと、百人余りが同じ筋へ集まり続ける。
  if (u.pos.z < -30 && want.z < -30 && !army.wallBetween(u.pos, -1, want, false)) return want;
  // 東の浅瀬の山内勢は河田へ横切らせない。渡り終えたら北岸を米野へ進む。
  const way = u.pos.x > 20 && want.x > 20 ? eastWay : wayRaw;
  const q = way(army, u, want); if (q !== want) q.botRadius = 1; return q;
};
// 北岸の退避先は柵を挟まない場所から選んである。砦の外から道へ戻すと、
// 内側の折れ角へ引かれて柵で止まる。川を渡る退避だけ浅瀬の道を使う。
const kawadaWithdrawWay = (army, u, want) => {
  if (u.pos.z < NORTH.z && want.z < NORTH.z) { u._k02BackDirect = want; return want; }
  return kawadaWay(army, u, want);
};
// 手当ての退避先は、今いる側から歩いて寄れる味方の後ろだけにする。
// 砦の柵越しの味方や川の深みを選ぶと、退避と木戸への入り直しを繰り返す恐れがある。
function kawadaBackAllowed(b, x, z) {
  const q = b.flags.k02BackProbe || (b.flags.k02BackProbe = { x: 0, y: 0, z: 0 });
  q.x = x; q.z = z; q.y = b.world.heightAt(x, z);
  return b.world.walkable(x, z, q.y) && !b.army.wallBetween(b.player.u.pos, -1, q, false);
}
const keep = (name, at, list, o = {}) => ({ name, from: { x: at.x + (o.dx || 0), z: at.z + (o.dz || 0) }, width: o.width || 10, list, seek: o.seek || 50, morale: o.morale || 90 });
// 本陣の総大将は床几に腰を掛けたまま（army_move の陣中の座り。立つのは敵が寄った時だけ）
const seat = (u) => { if (u) u.jinchu = { standing: false, t: 99, len: 99, danger: false }; };
// 段の中の組を名で探し、持ち場に留める（名のある将の旗本は前へ出ない・背を向けて歩かない。BK5）
function holdGuard(C, name, at, facing) {
  const g = C && C.groups.find((q) => q.name === name);
  if (g && !g.routed && g.order !== 'retreat') {
    g.order = 'hold'; g.anchor.x = at.x; g.anchor.z = at.z; g.facing = facing; g.aggro = 9;
    // 生存の指定だけでは、主人公の攻撃で共通の手傷退却が先に起きる。
    // 旗本が崩れて退く下知が出るまで、目標の守将を持ち場に残す。
    for (const u of g.units) if (u.name === '木造長政' || u.name === '百々綱家') u.onWound = waitForGuard;
  }
  return g;
}
const waitForGuard = () => {};
// 後方へ離脱した負傷兵は、生きていても守りの戦力に数えない。
const guardStrength = (g) => g.units.reduce((n, u) => n + (u.alive && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.dying && !u.noTarget ? 1 : 0), 0);

// ①が済むと、池田輝政は本陣を中洲の小屋場島へ移す（旗立ての松。南の筋は河田の浅瀬を歩いて渡る）
function moveHonjin(rt) {
  const g = rt.flags.honjin;
  if (!g || g.routed || rt.flags.honjinMoved) return;
  rt.flags.honjinMoved = true;
  g.order = 'path'; g.path = [[-60, 40], [-60, 4], [ISLE.x + 16, ISLE.z]]; g.pathIdx = 0;
  g.onArrive = (q) => { q.order = 'hold'; q.anchor = { x: ISLE.x + 16, z: ISLE.z }; q.facing = Math.PI; seat(q.units.find((u) => u.name === '池田照政')); };
  rt.scene.add(jinmaku(rt.world, ISLE.x + 16, ISLE.z + 0.5, 10, 6, 4, { mon: 'ageha' }));
}
// 大塚権太夫は首を持って堤を登る所で飯沼長資に討たれた（笠松町無動寺に塚）。台詞だけでなく本当に倒れる
// 11/6 専門家の目：前は飯沼が村の奥に出た途端、離れた所の大塚がひとりでに倒れた。今は飯沼の手が大塚の手前に打って出て、二人が寄って一騎打ちで討つ。
//   一騎打ちが済むまで飯沼は討たれない（済む前に倒れると話が逆になる）。時間で省かず、二人が寄るまで待つ
const waitForDuel = () => {};   // 共通の手傷退却で一騎打ちの相手を失わない
function otsukaTick(rt, C) {
  const F = rt.flags, H = F.hitotsu;
  const u = H && H.units.find((q) => q.name === '大塚権太夫');
  // 大塚は一柳の手の内で戦う（馬で逃げる敵を北の端まで追って、手から百五十歩も離れていた。11/6 流し）
  // 一騎打ちの前に大塚が雑兵に討たれて一騎打ちの無い回があった（11/6 夜の流し）。済むまで大塚は倒れない
  if (u && u.alive && !F.otsukaDone) { u.invuln = true; u.onWound = waitForDuel; }
  if (u && u.alive && !F.otsukaDone && H.count) {
    const c = H.center();
    if (Math.hypot(u.pos.x - c.x, u.pos.z - c.z) > 35 || (u.target && u.target.fleeing)) { u.target = null; u.moveTo = { x: c.x, z: c.z }; }
  }
  if (!F.iinumaOut || F.otsukaDone) return;
  const ig = C.groups.find((q) => q.name === '飯沼長資の手');
  const iu = ig && ig.units.find((q) => q.alive && q.name === '飯沼長資');
  const end = () => { F.otsukaDone = true; if (u) u.onWound = null; if (iu) { iu.invuln = false; iu.onWound = null; } for (const g of [ig, H]) if (g && g.order === 'move') g.order = 'attack'; };
  if (!u || !u.alive || !iu) { end(); return; }
  iu.invuln = true; iu.onWound = waitForDuel;
  const gap = Math.hypot(u.pos.x - iu.pos.x, u.pos.z - iu.pos.z), wait = rt.t - F.iinumaOut;
  if (gap <= 6) {
    end();
    u.invuln = false; u.hp = 0; rt.army.kill(u, iu);
    rt.say('飯沼長資', '大塚とやら、討ち取った！　次は誰じゃ', 3.4);
    return;
  }
  // 一柳の手（大塚を連れる）と飯沼の手を互いの間へ寄せる。四十秒過ぎたら飯沼が大塚へ真っ直ぐ斬り込む
  if (wait > 40) {
    const toOtsuka = F.iinumaDuelTo || (F.iinumaDuelTo = { x: 0, z: 0 });
    const toIinuma = F.otsukaDuelTo || (F.otsukaDuelTo = { x: 0, z: 0 });
    toOtsuka.x = u.pos.x; toOtsuka.z = u.pos.z;
    toIinuma.x = iu.pos.x; toIinuma.z = iu.pos.z;
    iu.target = null; iu.moveTo = toOtsuka;
    u.target = null; u.moveTo = toIinuma;
  }
  const mid = F.duelMid || (F.duelMid = { x: 0, z: 0 });
  mid.x = wait > 40 ? u.pos.x : (u.pos.x + iu.pos.x) / 2;
  mid.z = wait > 40 ? u.pos.z : (u.pos.z + iu.pos.z) / 2;
  for (const g of [ig, H]) if (g.order !== 'move' || !g.dest || Math.hypot(g.dest.x - mid.x, g.dest.z - mid.z) > 4) { g.order = 'move'; g.dest = mid; g.onArrive = null; }
}

// 飯沼長資の手は米野村の家並みの間から、大塚権太夫のいる堤の側へ打って出る（大塚が村の近くにいる時は、その手前の家の陰から）
function iinumaFrom(rt) {
  const u = rt.flags.hitotsu && rt.flags.hitotsu.units.find((q) => q.name === '大塚権太夫');
  const vx = YONENO.x - 14, vz = YONENO.z - 16;   // 米野の家並みの中ほど（setup の village）
  if (!u || !u.alive || Math.hypot(u.pos.x - vx, u.pos.z - vz) > 130) return { x: YONENO.x - 10, z: YONENO.z - 14 };
  const dx = vx - u.pos.x, dz = vz - u.pos.z, d = Math.hypot(dx, dz) || 1, k = Math.min(12, d) / d;
  return { x: u.pos.x + dx * k, z: u.pos.z + dz * k };
}

// 11/6 kaito の目「主人公が島で動けないのに、米野も新加納も味方だけで済んで勝ち」：段は本人が着いて戦った時だけ済む。
//   止まっていても時間で次の段へ進めず（idleAdvance・max）、斬り合いの段は本人が段の場所の r の内にいる時だけ済む
// 小屋場島：本人が着いても、味方の備が二つ島へ渡り揃うまで（四十秒まで）は北の筋へかからない（一人で北岸の鉄砲の前へ出ない）
function island(step) {
  mine(step, 9);
  const t = step.tick;
  step.tick = (rt, C, m, ctx, el, dt) => {
    if (!t(rt, C, m, ctx, el, dt)) return false;
    const F = rt.flags, n = [F.mine, F.nagayoshi, F.asano, F.hitotsu].filter((g) => g && g.count && Math.hypot(g.center().x - ISLE.x, g.center().z - ISLE.z) < 26).length;
    if (n < 2 && !C.waitSaid) { C.waitSaid = true; rt.say('一柳直盛', '島で備を揃えよ。揃うたら北の筋へかかる', 3.4); }
    return n >= 2 || el - C.arrT > 40;
  };
  return step;
}
// 浅瀬の両の縁に立てた瀬踏みの竹（一柳の手が道案内で立てた目印。白い布を結ぶ）。どこが渡れるかを字でなく絵で見せる（kaito の目：どこが浅瀬か画面で分からない）
function fordStakes(W) {
  const pole = new THREE.CylinderGeometry(0.035, 0.05, 2.6, 5).translate(0, 1.3, 0);
  const rag = new THREE.PlaneGeometry(0.34, 0.16).translate(0.19, 2.35, 0);
  const poles = [], rags = [];
  for (const f of FORDS) for (const [pts, w] of [[KISO_S, 18], [KISO_N, 17]]) {
    let zc = 0; for (let i = 0; i < pts.length - 1; i++) if (f.x >= pts[i][0] && f.x <= pts[i + 1][0]) zc = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * (f.x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
    for (const sx of [-1, 1]) for (let dz = -w; dz <= w; dz += 3.4) {
      const x = f.x + sx * (f.w - 5) + Math.sin(dz * 1.7) * 0.3, z = zc + dz, y = W.heightAt(x, z) - 0.25, lean = Math.sin(dz * 2.3 + sx) * 0.08;
      poles.push(pole.clone().rotateZ(lean).translate(x, y, z));
      rags.push(rag.clone().rotateY(Math.sin(dz) * 0.8).rotateZ(lean).translate(x, y, z));
    }
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshLambertMaterial({ color: 0x8a7a4a })));
  g.add(new THREE.Mesh(mergeGeometries(rags), new THREE.MeshLambertMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide })));
  for (const m of g.children) m.castShadow = true;
  return g;
}

// 道の詰まりは経路側で直す。経過時間で本人の到着や一騎打ちを省略しない。
function mine(step, r, inside, retreated) {
  step.idleAdvance = false; step.max = 1e9;
  step.noHardCap = true; step.limit = Infinity;   // 共通の四分・七分の時間送りも使わない
  // 守将が退いた段は離脱中の負傷兵を待たない。本人の到着と退却の知らせは省かない。
  if (r) { const t = step.tick; step.tick = (rt, C, ...a) => { const ok = t(rt, C, ...a), p = rt.player.u.pos; return (retreated ? !!rt.flags[retreated] : ok) && (inside ? inside(p) : Math.hypot(p.x - C.at.x, p.z - C.at.z) < r); }; }
  return step;
}
// 二人以下の組は共通の段判定では済みになる。一騎打ちと飯沼本人の討死は人数と別に待つ。
function yoneno(step) {
  mine(step, 50, null, 'yonenoBroke');
  const tick = step.tick;
  step.tick = (rt, C, ...a) => {
    const done = tick(rt, C, ...a);
    // 共通の戦闘判定は三人になると不退転を外す。飯沼の討死までは毎回戻す。
    if (!rt.flags.iinumaDown) {
      const g = C.groups.find((q) => q.name === '飯沼長資の手');
      if (g) { g.noRout = true; g.morale = 100; }
    }
    return done && !!rt.flags.yonenoBroke && !!rt.flags.otsukaDone && !!rt.flags.iinumaDown;
  };
  return step;
}
// 砦は木戸を入って守備の八割を崩せば取れる。柵の向こうや戦場の端に
// 残った数人、戦えない負傷兵を探し続けて段が止まらないようにする。
function fort(step) {
  mine(step, 30, inFort);
  const tick = step.tick;
  step.tick = (rt, C, ...a) => {
    if (tick(rt, C, ...a)) return true;
    if (!inFort(rt.player.u.pos) || C.later.length || !C.nTot) return false;
    const left = C.groups.reduce((n, g) => n + (g.routed ? 0 : guardStrength(g)), 0);
    if (left > C.nTot * 0.2) return false;
    for (const g of C.groups) if (g.count) {
      g.fleeDir = { x: 0, z: -1 }; g.fleeSet = true;
      g.noRout = false; g.order = 'retreat'; g.morale = 0;
    }
    return true;
  };
  return step;
}
// 味方の備は本人と一緒に進む（主人公だけが先に一人で走らない・本人の居ない所で味方だけが攻め落とさない。九4・一5）
//   段が始まると味方は隊のまま一斉に段の場所へ押し出す（本人が先に一人で走らない）。本人が遠い間は斬り合いを浅くし（傷を与える力を下げ）、
//   本人の居ない所で味方だけが敵を崩し切らない。本人が着けば本気でかかる
const PACE_NEAR = 55;
function paceFriends(rt, dt) {
  const F = rt.flags, C = F.dp && F.dp.on ? F.dp.cur : null;
  if (!C || !C.at || C.s.kind !== 'fight' || (rt._k02pace = (rt._k02pace || 0) - dt) > 0) return;
  rt._k02pace = 1;
  const p = rt.player.u.pos, near = Math.hypot(C.at.x - p.x, C.at.z - p.z) < PACE_NEAR;
  const friends = [F.mine, F.nagayoshi, F.asano, F.hitotsu];
  for (let k = 0; k < friends.length; k++) {
    const g = friends[k];
    if (!g || !g.count || g.routed) continue;
    g.dmgMult = near ? 1.1 : 0.3;
    if (g === F.hitotsu && F.iinumaOut && !F.otsukaDone) continue;   // 大塚と飯沼の一騎打ちの間は otsukaTick が動かす
    // 本人が隊より先へ出ている間は、隊は駆けて追いつく（米野・新加納へ主人公だけ一人で走っていた。11/6 夜の通し・九4）
    const gc = g.center(), lag = Math.hypot(gc.x - p.x, gc.z - p.z) > 22 && Math.hypot(C.at.x - p.x, C.at.z - p.z) < Math.hypot(C.at.x - gc.x, C.at.z - gc.z);
    if (g._k02sp == null) g._k02sp = g.speed || 2.2;
    g.speed = lag ? Math.max(g._k02sp, 5.2) : g._k02sp;
    // 段の始めに分けた四つの持ち場を保つ。同じ一点へ戻すと、
    // 柵の口と木戸の内で百人余りが重なり、主人公の斬り込む道も塞ぐ。
    const x = C.at.x + (k - 1.5) * 6, z = C.at.z + (k % 2) * 5;
    if (g.order !== 'attack' || !g.anchor || Math.hypot(g.anchor.x - x, g.anchor.z - z) > 1) {
      g.order = 'attack'; g.seekRange = Math.max(g.seekRange || 0, 40);
      if (!g.anchor) g.anchor = { x, z }; else { g.anchor.x = x; g.anchor.z = z; }
    }
  }
  // 本人が味方の備から三十歩より先へ一人で出ている間は、敵の当たりを浅くする（味方が追いつくまでの間に囲まれて即座に倒れない）
  const alone = !friends.some((g) => g && g.count && Math.hypot(g.center().x - p.x, g.center().z - p.z) < 30);
  for (const g of C.groups) if (g && g.count && !g._k02fire) g.dmgMult = near && !alone ? 0.3 : 0.15;
  // 本人が遠い間は、段の後から来る敵（later）も出さない（本人の見ない所で一騎打ちや新手を済ませない）
  if (!near && C.later) { const el = rt.t - C.t0; for (const w of C.later) w.t = Math.max(w.t, el + 15); }
}

const k02_kawada = {
  // 身の回りの合戦の跡（timeslip_field.js）。河田・木曽川：八月末（今の九月末）の渡し。岸の葦と濡れた泥、渡った跡の矢と槍
  timeslip: {
    wet: 0.45, dust: 0.25, trample: 0.3, debris: 1.1, arrows: 1, reeds: 0.5,
    grass: 0x8a9a56, grassTints: [0xffffff, 0xe6e0b8, 0xc8cc98], grassH: 1.15, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.9,
    flagColors: [0xe6dfcc, 0xcdac50, 0x5a4a3a],
  },
  spawn: { x: START.x + 2, z: START.z, heading: Math.PI },
  noWake: true,
  // 段の時間送りを外しても、共通の十八分打ち切りは別に動く。
  // 未達の目標がある間は本人の到着と戦闘を待ち、放置で負けにしない。
  pacingWait: (rt) => !rt.flags.ending,
  minutes: 25,
  depth: kawadaDepth,   // 陣立て（army_depth.js）：河田の本物の隊の後ろと翼に、福島・黒田・細川・秀信の備（k02_kawada/tosen.js）
  lethal: { max: 2, firstAt: 200, gap: 120 },   // 命懸けの戦場（docs/lethal_howto.md）。11/9 二巡（徳川D）：既定では北の筋で bot が十七分止まった。弱める
  fearKind: { kind: '渡河', note: '浅瀬で足を取られ、対岸の鉄砲に撃たれる', w: { losses: 1.4, flank: 1.2 }, line: '川の中で止まるな！' },
  battleDialogue: true,   // 11/8 critic60 二5：音の無い所で誰が何を言ったか分からなかった。台詞を字でも出す（八秒の間引き・三枠は共通）
  nearbyAllySignLimit: 0,   // 11/8 critic60 五2：味方の頭上の白い小さな丸（意味の分からない印）を出さない
  noHatamotoMass: true,   // 確認表の四1・十二2：定義した備とは別に、勝敗と兵数に入らない旗本の大群を自動追加しない
  nameTagLimit: 12,   // 名のある将を二枚の枠で隠さない。重なりと遮蔽物の判定は共通の名札処理を使う
  stageGoalsOnly: true,   // 右上の目標は四つの段だけ（「敵を何人討つ」で埋めない。物差し三の1・11/6）
  goalsVisibleRows: 4,   // 共通画面の一件表示で隠さず、①〜④を始まりから全部並べる（確認表の九1・良い所を残す）
  dpNoMark: true,         // 行き先の印と別に「敵の組・士気」の札を重ねない（五1・五3）
  // 見出しの札は終わりと討ち取りだけ（「敵の隊が崩れた」「一騎打ち」「敵将が倒れた」や段の見出しは案内の字。物差し五の1・11/6 流しで八つ出ていた）
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死/.test(t),
  world: {
    seed: 1600822,
    time: 'morning',
    mist: true,          // 渡ったのは八月二十二日の明け方（米野で組み合ったのは昼）
    groundHalf: 290,
    moveLim: 250,
    paths: [ROUTE],
    height,
    moveWay: kawadaWay,
    // surfaceDrop を負に：水面を掘った芯より少し上へ（浅瀬は脛まで水に浸かる。深みは背より深い）
    // w は流れの半幅。前の 13・11 は二筋が重なり、中洲が浅瀬の所にしか出ていなかった。半幅 8・7 で二筋の間に中洲（小屋場島）が川に沿って続く
    streams: [{ pts: KISO_S, w: 12, depth: 2.4, fords: FORDS, levelAt: LEVEL }, { pts: KISO_N, w: 11, depth: 2.3, fords: FORDS, levelAt: LEVEL }],
    waterSlow: true,
    tint(x, z, h, c) {
      if (distToPolyline(x, z, ROUTE) < 3) { c.setRGB(c.r * 0.5 + 0.2, c.g * 0.5 + 0.17, c.b * 0.5 + 0.12); return; }
      const dk = distToPolyline(x, z, KISO);
      if (Math.abs(dk - 3) < 7) { c.setRGB(c.r * 0.4 + 0.36, c.g * 0.4 + 0.33, c.b * 0.4 + 0.26); return; }   // 中洲の白い砂と礫
      if (dk < 40) { c.setRGB(c.r * 0.55 + 0.17, c.g * 0.55 + 0.15, c.b * 0.5 + 0.11); return; }   // 両岸の河原（礫と砂）
      if (dk < 48) { c.setRGB(c.r * 0.7 + 0.12, c.g * 0.7 + 0.1, c.b * 0.6 + 0.06); return; }
      c.setRGB(c.r * 0.7 + 0.2, c.g * 0.7 + 0.18, c.b * 0.5 + 0.05);   // 刈り入れ前の田
    },
    clear: (x, z) => distToPolyline(x, z, ROUTE) < 8 || Math.hypot(x - YONENO.x, z - YONENO.z) < 30 || Math.hypot(x - SHINKANO.x, z - SHINKANO.z) < 34 ||   // 11/10 クラウド：砦の柵の外を回る道（柵から五歩）に松が立ち、西の柵の外で十六分止まった
       Math.hypot(x - HONJIN.x, z - HONJIN.z) < 14,
    trees: 120,
    // 11/8 critic60 八1・九5：霧の中の松が平たい切り絵、島の松の幹が赤い棒を組んだように見えた。太い幹・ふぞろいの葉房に
    raggedPineCrowns: true, unevenCrowns: true, thickTrees: true,
    tufts: 2600,
    treeDensity: (x, z) => (distToPolyline(x, z, KISO) < 50 ? 0.9 : Math.abs(x + 80) > 90 ? 0.7 : 0.15),
    groves: [{ x: 40, z: 70, r: 14, n: 14, kind: 'sugi' }, { x: -176, z: -74, r: 12, n: 12, kind: 'sugi' }, { x: ISLE.x + 5, z: ISLE.z, r: 3, n: 2, kind: 'matsu' }, { x: 30, z: 2, r: 10, n: 6, kind: 'matsu' }],
    fleeOut: (x, z, team) => (team === 1 ? z < -240 : z > 220),
    // 濃尾平野の真ん中。遠くの山は低く霞ませる（四方に大きな山がそびえて盆地に見えていた。11/6 kaito の目）
    mountainScale: 0.16, mountainHaze: 0.85,
    // 北の遠くに金華山の岐阜城（toku15 の 2：始まりから次の戦の城が見える）
    farCastle: { a: Math.PI - 0.22, d: 560, s: 1.3, tiers: 4 },
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const W = rt.world, F = rt.flags;
    // 敵は信長の孫の織田秀信の家中。木瓜の旗を桐や永楽銭に替えない（battle.js の noOda は world と同じ配列）
    if (rt.army.noOda) rt.army.noOda[1] = 'oda';
    installTosen(rt, rt.flags.k02t0 = {});
    F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    // 北岸と米野の守将の名は物見で知れていた（右上の目標が「見えぬ敵の陣を物見する」に伏せられていた。十の1・11/6 写真で見た）
    for (const n of ['木造長政', '百々綱家', '飯沼長資']) revealName(rt, n);
    // 北岸の柵（渡しの口は開いて通れる）と篝火、米野の村、新加納の砦の柵、南岸の池田の本陣
    try {
      rt.scene.add(palisade(W, [-100, NORTH.z - 10, -67, NORTH.z - 10], { h: 2.2, solid: true }));
      rt.scene.add(fordStakes(W));
      rt.scene.add(palisade(W, [-53, NORTH.z - 10, -26, NORTH.z - 10], { h: 2.2, solid: true }));
      // 新加納の砦：四方を柵で囲い、南の大手に冠木門の木戸、北の岐阜への退き口に搦手の口、内に物見の井楼櫓（池田家の家臣の覚書では、渡った後の戦いは新加納の砦）
      // 11/6 専門家の目：前は南と東西の三方の柵だけで、門も櫓も無く「砦」に見えなかった（物差し四の5・十一の2）
      const S = SHINKANO;
      rt.scene.add(palisade(W, [S.x - 20, S.z + 10, S.x - 4.5, S.z + 10], { h: 2.4, solid: true }));
      rt.scene.add(palisade(W, [S.x + 4.5, S.z + 10, S.x + 20, S.z + 10], { h: 2.4, solid: true }));
      rt.scene.add(palisade(W, [S.x - 20, S.z + 10, S.x - 20, S.z - 14], { h: 2.4, solid: true }));
      rt.scene.add(palisade(W, [S.x + 20, S.z + 10, S.x + 20, S.z - 14], { h: 2.4, solid: true }));
      rt.scene.add(palisade(W, [S.x - 20, S.z - 14, S.x - 3.5, S.z - 14], { h: 2.4, solid: true }));
      rt.scene.add(palisade(W, [S.x + 3.5, S.z - 14, S.x + 20, S.z - 14], { h: 2.4, solid: true }));
      rt.scene.add(kabukimon(W, S.x, S.z + 10, 9, 0, { doors: false, roof: false }));   // 扉と屋根なしの冠木門（木戸の内で背の後ろのカメラが開いた扉と屋根に埋まった。11/6 夜の通し）
      rt.scene.add(yagura(W, S.x + 14, S.z - 8));
      rt.scene.add(village(W, YONENO.x - 14, YONENO.z - 16, { n: 6, r: 16, seed: 822 }));
    } catch (e) { console.warn(e); }
    for (const [x, z] of [[-80, NORTH.z - 12], [-40, NORTH.z - 12], [YONENO.x + 8, YONENO.z + 4], [SHINKANO.x - 10, SHINKANO.z + 6], [SHINKANO.x + 10, SHINKANO.z + 6]]) rt.scene.add(nobori(W, x, z, 'oda', 6));
    for (const [x, z] of [[-70, NORTH.z - 8], [-50, NORTH.z - 8]]) rt.scene.add(kagaribi(W, x, z));
    rt.scene.add(jinmaku(W, HONJIN.x, HONJIN.z, 12, 9, 4, { mon: 'ageha' }));
    rt.scene.add(shogi(W, HONJIN.x, HONJIN.z - 2.6, Math.PI));
    for (const [x, z] of [[HONJIN.x - 8, HONJIN.z + 6], [HONJIN.x + 8, HONJIN.z + 6], [HONJIN.x + 12, HONJIN.z - 6]]) rt.scene.add(nobori(W, x, z, 'ageha', 6));
    // 見せかけの軍勢は置かない（AA・AF・AP9・AQ6）。見える兵は全部本物
    // ---- 東軍（河田の手）。総大将の池田輝政は南岸の本陣の床几に座り、侍の旗本に囲まれて動かない（O・AR3・AV7） ----
    F.honjin = allyGroup(rt, { faction: 'oda', name: '池田照政の本陣', anchor: { x: HONJIN.x, z: HONJIN.z - 2 }, facing: Math.PI, width: 8, aggro: 0, order: 'hold', fixed: true, noRout: true, fullStrength: true },
      dress([{ type: 'busho', n: 1, o: { name: '池田照政', invuln: true, horse: false } }, { type: 'samurai', n: 14 }, { type: 'gun', n: 4 }], IKEDA));
    seat(F.honjin.units.find((u) => u.name === '池田照政'));
    // 先手は本人と同じ野から始め、下知で一緒に渡る（BK1）。名のある将は馬上で、侍の旗本を連れる
    F.mine = allyGroup(rt, { faction: 'oda', name: '手勢', anchor: { x: START.x, z: START.z - 10 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: 20 }, { type: 'gun', n: 10 }], IKEDA));
    F.nagayoshi = allyGroup(rt, { faction: 'oda', name: '池田長吉の手', anchor: { x: START.x + 14, z: START.z - 6 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '池田長吉', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 7 }], IKEDA));
    F.asano = allyGroup(rt, { faction: 'oda', name: '浅野幸長の先手', anchor: { x: START.x - 14, z: START.z - 6 }, facing: Math.PI, width: 10, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '浅野幸長', invuln: true, horse: true } }, { type: 'samurai', n: 6 }, { type: 'ashigaru', n: 14 }, { type: 'gun', n: 7 }, { type: 'bow', n: 2 }], ASANO));
    // 一柳直盛の手：道案内で先に渡り、家来の大塚権太夫が一番に北岸へ上がった（井伊直政の報告・笠松の史跡の案内）
    F.hitotsu = allyGroup(rt, { faction: 'oda', name: '一柳直盛の手', anchor: { x: START.x - 4, z: START.z - 22 }, facing: Math.PI, width: 8, aggro: 10, noRout: true, formation: 'yari' },
      dress([{ type: 'busho', n: 1, o: { name: '一柳直盛', invuln: true, horse: true, mon: 'kuginuki' } }, { type: 'samurai', n: 1, o: { name: '大塚権太夫', invuln: true } }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10 }, { type: 'gun', n: 5 }], HITOTSU));
    F.hitotsu.units.find((u) => u.name === '大塚権太夫').onWound = waitForDuel;
    for (const g of [F.mine, F.nagayoshi, F.asano, F.hitotsu]) { g.defMult = 1.5; g.dmgMult = 1.1; g.aggro = 24; }
    // 始まりから全員が南の筋の堤まで押し出す（始めの二十五秒、皆が背を向けて突っ立っていた。11/6 kaito の目）
    [F.mine, F.nagayoshi, F.asano, F.hitotsu].forEach((g, k) => { g.order = 'hold'; g.anchor = { x: -60 + (k - 1.5) * 6, z: 52 + (k % 2) * 5 }; g.facing = Math.PI; });
    // 東の浅瀬（x=80）を渡る山内一豊の手と、それを撃つ北岸の織田の鉄砲組。川越しに本物の兵どうしが撃ち合い斬り合う
    // 山内一豊の紋は丸に三つ柏（kacchu_data の紋が木瓜のままなので、ここで直に渡す。real_common に書いた）
    F.east = allyGroup(rt, { faction: 'oda', name: '山内一豊の手', anchor: { x: 80, z: 50 }, facing: Math.PI, width: 10, aggro: 12, noRout: true, order: 'attack', seekRange: 70, fixed: true },
      dress([{ type: 'busho', n: 1, o: { name: '山内一豊', invuln: true, horse: true, mon: 'kashiwa' } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 16 }, { type: 'gun', n: 6 }], YAMAUCHI));
    F.east.anchor = { x: 80, z: 0 };
    F.eastFoe = enemyGroup(rt, { fixed: true, faction: 'oda', name: '東の浅瀬の織田勢', anchor: { x: 80, z: -42 }, facing: 0, order: 'hold', aggro: 12, width: 10, morale: 92 },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }, { type: 'gun', n: 10 }], WEST));
    F.east.dmgMult = 0.35; F.eastFoe.dmgMult = 0.3;
    // ---- 西軍の河田の守り：北岸の柵の前に木造長政の鉄砲組、柵の内に木造と侍の旗本（始めから構えている） ----
    F.northGun = enemyGroup(rt, { fixed: true, faction: 'oda', name: '北岸の鉄砲組', anchor: { x: NORTH.x, z: NORTH.z - 4 }, facing: 0, order: 'hold', aggro: 14, width: 14, morale: 96 },
      dress([{ type: 'samurai', n: 2 }, { type: 'gun', n: 18 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 6 }], WEST));
    F.northGuard = enemyGroup(rt, { fixed: true, faction: 'oda', name: '北岸の旗本', anchor: { x: GUARD.x, z: GUARD.z }, facing: 0, order: 'hold', aggro: 9, width: 7, morale: 100, noRout: true },
      dress([{ type: 'busho', n: 1, o: { name: '木造長政', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 12 }, { type: 'gun', n: 3 }], WEST));
    // 11/8 critic60 二3・二7：渡る間ずっと北岸から撃たれ、浅瀬で味方も本人も倒れる（前は 0.3 で、渡りきるまで命が一度も減らなかった）。
    //   鉄砲組は南の筋を渡る所から届く（aggro 70）。段の弱め（paceFriends）からは外す（_k02fire）
    // invuln だけでは主人公の一撃で討たれる。翌日の岐阜城へ退く将は生存を明示する。
    const kozukuri = F.northGuard.units.find((u) => u.name === '木造長政');
    kozukuri.mustLive = true; kozukuri.onWound = waitForGuard;
    F.northGun.dmgMult = 0.7; F.northGun.aggro = 70; F.northGun._k02fire = true; F.northGuard.dmgMult = 0.3;
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: START.x + 4, z: START.z - 2 }, Math.PI, [{ kind: 'spear', n: Math.min(n, 16) }]);
    rt.setPhase('brief');
    rt.obj('main', '河田の渡しで木曽川を渡り、米野と新加納の織田勢を破れ', 'main');
    rt.say('池田照政', '福島殿は下の尾越から渡る。我らは河田じゃ。夜の明けぬうちに渡れ', 4.4);
    rt.after(4.6, () => rt.say('一柳直盛', '道はそれがしが案内いたす。まず中洲の小屋場島へ', 3.8));
    // 始まりの待ちは十秒まで（物差し：始まりから全員動く・待ちは十五秒まで）。残りの台詞は渡りながら
    rt.after(9, () => this.begin(rt));
    rt.after(10, () => rt.say(nm(rt), '北の岸に木瓜の旗。堤の上に鉄砲が並んでおりまする', 3.6));
    rt.after(14.4, () => rt.say('浅野幸長', '浅瀬は細い。詰まれば撃たれる。止まらず駆け抜けよ', 4));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t;
    rt.setPhase('siege');
    sfx('horagai', 0.8);
    rt.after(1.2, () => sfx('taiko', 0.8));
    depthStart(rt, { faction: 'oda', flag: 'oda', armor: WEST.armor, friends: () => [F.mine, F.nagayoshi, F.asano, F.hitotsu], look: (list) => dress(list, WEST), scale: 1, backing: false, fixedSpawn: true, dmg: 0.3, botSeek: 40, routeFight: true, botFoeAllowed: fightingFoe, botBackAllowed: kawadaBackAllowed, withdrawWay: kawadaWithdrawWay }, [
      // ① 明け方、南の筋を渡って中洲の小屋場島へ。北岸の鉄砲が浅瀬を撃つ
      island(DP.move({ to: ISLE, obj: '南の筋の浅瀬を渡り、中洲の小屋場島へ行け', label: '小屋場島', r: 9, max: 120,
        say: [['一柳直盛', '浅瀬はここじゃ。島まで止まるな']],
        // 北岸の鉄砲組は始めから柵の前に並んでいて（setup）、浅瀬を渡る所を撃つ
        ambush: { d: 40, say: ['浅野の侍', '向こう岸から撃ってきたぞ！　島の松の陰へ駆けよ'], foes: () => [] },
        onEnd: (rt2) => { if (!rt2.flags.isleFlag) { rt2.flags.isleFlag = true; for (const [x, z] of [[ISLE.x + 2, ISLE.z], [ISLE.x + 5, ISLE.z - 1.5], [ISLE.x - 2, ISLE.z + 1]]) rt2.scene.add(nobori(rt2.world, x, z, 'ageha', 6)); rt2.say('池田照政', '島の松に揚羽蝶の旗を立てよ。本陣を小屋場島へ移す', 3.6); moveHonjin(rt2); } } })),
      DP.rest({ dur: 5, heal: 0.9 }),
      // ② 北の筋を渡り、柵の内の木造長政の旗本を追い払う。木造は侍の旗本に囲まれて動かない（BK5）。旗本が崩れると岐阜へ退く（翌日の岐阜城に居た）
      mine(DP.fight({ at: GUARD, title: '河田の渡し', sub: '北の岸に木造長政の鉄砲', obj: '北の筋を渡り、柵の内の木造長政の旗本を追い払え', max: 200, noRefill: true,
        onEnd: (rt2) => { rt2.flags.gumasaDown = true; },
        say: [['木造長政', '渡らせるな。浅瀬に入った所を撃て！']],
        // 始めから北岸に構えていた組をそのまま段の敵にする（目の前に湧かせない）
        foes: (rt2) => { const C = rt2.flags.dp.cur; for (const g of [F.northGun, F.northGuard]) if (g && g.count) { if (g === F.northGun) g.order = 'hold'; g.dmgMult = g._k02fire ? 0.7 : 0.3; C.groups.push(g); C.nTot = (C.nTot || 0) + g.count; } return []; },
        // 時刻だけで名のある敵の討ち取りを告げず、既にいる旗本と戦う。
        // 柵の前へ新しい槍組を突然出さない。
        later: [{ t: 4, say: ['大塚権太夫', '一柳監物が家来、大塚権太夫。一番に上がるぞ！'], foes: () => [] },
          { t: 22, say: ['大塚権太夫', '柵の口へ続け！　旗本を押し返すぞ！'], foes: () => [] }],
        reward: '河田の渡しを渡った' }), 45, insideNorthGuard, 'northBroke'),
      DP.rest({ dur: 5, heal: 0.9, fn: (rt2) => rt2.world.setTime('day') }),
      // ③ 北岸を下流の米野村へ。昼、百々綱家の隊と組み合う。飯沼長資が大塚権太夫を討って出て、ここで討ち死にする（討ったのは池田長吉とも）
      yoneno(DP.fight({ at: YONENO, title: '米野', sub: '百々綱家の隊が村の前に構える', obj: '北岸を西へ進み、米野村の百々綱家の隊を追い払え', max: 240, noRefill: true,   // 百々が退いた後に「新手の百々綱家の旗本」を湧かせない（11/6）
        say: [['百々綱家', '木造殿は退いたか。米野で食い止める！']],
        foes: () => [keep('米野の鉄砲組', { x: YONENO.x + 14, z: YONENO.z + 6 }, [{ type: 'samurai', n: 2 }, { type: 'gun', n: 12 }, { type: 'ashigaru', n: 10 }], { morale: 96 }),
          keep('百々綱家の旗本', YONENO, [{ type: 'busho', n: 1, o: { name: '百々綱家', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 12 }, { type: 'gun', n: 3 }], { width: 7, morale: 100 })],
        later: [{ t: 4, say: ['浅野幸長', '川は越えた。米野を抜けば岐阜じゃ'], foes: () => [] },
          { t: 45, say: ['飯沼長資', '飯沼勘平長資、生年二十一。米野は通さぬ！'], foes: (rt2) => { rt2.flags.iinumaOut = rt2.t; return [keep('飯沼長資の手', iinumaFrom(rt2), [{ type: 'samurai', n: 1, o: { name: '飯沼長資', hat: 'kabuto_m', horse: true, invuln: true } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 8 }], { morale: 100 })]; } }],
        reward: '米野で百々綱家の隊を追い払った' })),
      DP.rest({ dur: 5, heal: 0.9, fn: (rt2) => rt2.world.setTime('afternoon') }),   // 新加納の砦は昼過ぎ〜夕方に済んだ
      // ④ 北の新加納の砦。殿がよく防ぐが数で破る。秀信は岐阜城へ退く
      fort(DP.fight({ at: SHINKANO, title: '新加納の砦', sub: '岐阜への道を殿の織田勢が塞ぐ', obj: '北の新加納の砦の木戸から入り、殿の織田勢を追い払え', max: 200, noRefill: true,   // 砦の内に「新手の新加納の鉄砲組」を湧かせない（11/6 流しで出た）
        say: [['池田照政', '敵は岐阜城へ退くぞ。新加納の砦を破れ！']],
        foes: () => [keep('新加納の鉄砲組', { x: SHINKANO.x, z: SHINKANO.z + 4 }, [{ type: 'samurai', n: 2 }, { type: 'gun', n: 10 }, { type: 'ashigaru', n: 6 }], { morale: 94 }),
          keep('新加納の殿', { x: SHINKANO.x, z: SHINKANO.z - 6 }, [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 10 }], { morale: 96 })],
        reward: '新加納の砦を破り、岐阜へ追い込んだ' })),
    ], (rt2) => this.win(rt2));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '木曽川を渡り、米野で勝った', pts: 40 }; }, '木曽川を渡り、米野で勝った');
    sfx('horagai', 0.9);
    rt.banner('米野の戦い　勝ち', '織田秀信は岐阜城へ退いた');
    rt.player.u.invuln = true;
    F.k02t0?.ending?.();   // 使番「秀信、岐阜城へ籠もりました！」（k02_kawada/tosen.js）
    rt.after(4.4, () => rt.say('池田照政', '木曽川は越えた。中納言は城に籠もる。次は岐阜じゃ', 4));
    rt.after(8.8, () => rt.say('浅野幸長', '尾越の福島殿より先に渡った。信長公の孫の城か、相手に不足はない', 4.4));
    rt.after(13.2, () => rt.say(nm(rt), '明日は岐阜の城攻めでござるな。金華山が見えまする', 4));
    // 共通の勝利演出で見出しと待ち時間を上書きせず、締めの台詞を最後まで見せる。
    rt.finish({ scriptedEnd: true }, 22);
  },

  lose(rt) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('渡れなかった', '川の守りは崩せなかった');
    rt.say('池田照政', '日が暮れる。今日は退く', 4);
    rt.finish({ failureReason: '日暮れまでに米野と新加納を破れなかった' }, 6);
  },

  update(rt, dt) {
    const F = rt.flags;
    if (F.ending) return;
    depthTick(rt, dt);
    F.k02t0?.tick?.(dt);
    const C = F.dp && F.dp.on ? F.dp.cur : null;
    if (C && F.dp.i === 2) {
      // 木造の旗本は柵の内で南を向いて構える（前へ出て行かない・背を向けて歩かない。BK5）
      const g = holdGuard(C, '北岸の旗本', GUARD, 0);
      // 段の到着判定だけでなく退却も本人を待つ。南岸で止まっている間に木造が退くと、目標の将に会えない。
      if (g && !F.gumasaDown) { g.noRout = true; if (guardStrength(g) <= 6 && insideNorthGuard(rt.player.u.pos)) F.gumasaDown = true; }
      // 木造の旗本が五人を切ったら、木造は岐阜へ退き、北岸の守りは崩れて段が済む（木造は討たせない）
      if (F.gumasaDown && !F.northBroke) {
        F.northBroke = true; C.later.length = 0;
        const kozukuri = g && g.units.find((u) => u.name === '木造長政');
        if (kozukuri) kozukuri.onWound = null;
        for (const q of C.groups) if (q.count) { q.fleeDir = { x: 0, z: -1 }; q.fleeSet = true; q.noRout = false; q.order = 'retreat'; q.morale = 0; }
        rt.say('木造長政', '柵は破れた。岐阜の城へ退け！', 3);
        rt.after(3.2, () => rt.say('浅野の侍', '木造が退くぞ！　北の岸は取った', 3.5));
        // 北岸を取ったら、味方の備はそのまま隊で米野の手前の堤へ押し出す（本人だけが先に一人で米野へ走らない）
        [F.mine, F.nagayoshi, F.asano, F.hitotsu].forEach((q, k) => { if (q && q.count) { q.order = 'hold'; q.anchor = { x: YONENO.x + 40, z: YONENO.z + (k - 1.5) * 7 }; q.facing = -Math.PI / 2; } });
      }
    }
    if (C && F.dp.i === 4) {
      // 百々の旗本は村の前で東を向いて構え、百々が討たれるまで崩れない
      const g = holdGuard(C, '百々綱家の旗本', YONENO, Math.PI / 2);
      const dodo = g && g.units.find((u) => u.name === '百々綱家');
      if (dodo) dodo.mustLive = true;
      // 米野の鉄砲組は村の前で東を向いて撃つ（一人で来た本人へ村から打って出ない）
      holdGuard(C, '米野の鉄砲組', { x: YONENO.x + 14, z: YONENO.z + 6 }, Math.PI / 2);
      // 飯沼長資が出て大塚権太夫との一騎打ちが済むまで、百々の旗本は退かない（先に米野が崩れて一騎打ちが無くなっていた。11/6 流し）
      const ot = F.hitotsu && F.hitotsu.units.find((q) => q.name === '大塚権太夫');
      // 米野へ寄る前に味方だけで百々を退かせず、本人が将の見える所まで来てから退く。
      if (g && !F.dodoDown) { g.noRout = true; if (guardStrength(g) <= 6 && Math.hypot(rt.player.u.pos.x - YONENO.x, rt.player.u.pos.z - YONENO.z) < 40 && (F.otsukaDone || !(ot && ot.alive))) F.dodoDown = true; }
      // 飯沼長資の手は退かず、飯沼が倒れるまで斬り合う（米野で討ち死に）
      const ig = C.groups.find((q) => q.name === '飯沼長資の手');
      if (ig && !ig.routed) ig.noRout = !F.iinumaDown;
      if (F.dodoDown && !F.yonenoBroke) {
        F.yonenoBroke = true;
        if (dodo) dodo.onWound = null;
        // 段の中心から出た旗本は、共通の生成で退く向きがゼロになる。岐阜へ向かう北を明示する。
        for (const q of C.groups) if (q.count && q.name !== '飯沼長資の手') { q.fleeDir = { x: 0, z: -1 }; q.fleeSet = true; q.noRout = false; q.order = 'retreat'; q.morale = Math.min(q.morale, 20); }
        rt.say('百々綱家', '米野は持たぬ。岐阜へ退け！', 3);
        rt.after(3.2, () => rt.say('池田の侍', '百々の旗が退くぞ！　米野は崩れた', 3.5));
      }
    }
    if (C && F.dp.i === 6) {
      // 砦の守り手は柵と門の内から撃ち、木戸の内で槍を構える（柵の外に一列に並ばない。十一3）
      holdGuard(C, '新加納の鉄砲組', { x: SHINKANO.x, z: SHINKANO.z + 3 }, 0);
      holdGuard(C, '新加納の殿', { x: SHINKANO.x, z: SHINKANO.z - 5 }, 0);
    }
    if (C && F.dp.i >= 2 && F.dp.i <= 4) otsukaTick(rt, C);
    paceFriends(rt, dt);
    guideTick(rt);
    // 河田の手が北岸へ渡ったら、東の浅瀬の山内の手も北岸を米野へ寄せる（自分だけが目標へ向かわない。AQ7）
    if (F.east && F.dp && F.dp.i >= 4 && !F.eastGo) { F.eastGo = true; F.east.anchor = { x: YONENO.x + 34, z: YONENO.z + 4 }; }
    if (F.east && F.dp && F.dp.i >= 6 && !F.eastGo2) { F.eastGo2 = true; F.east.anchor = { x: SHINKANO.x + 26, z: SHINKANO.z + 20 }; }
    // 到着や斬り合いを待つ間に、戦全体の隠れた刻限で敗北へ送らない。
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    // 名のある将は本人の手で討った時だけ手柄（傷の四分の一を与えていれば本人の討ち取り。army_combat.js の kill）
    const mine = !!(k && k.isPlayer);
    if (v.name === '飯沼長資') F.iinumaDown = true;
    if (v.name === '飯沼長資' && mine) rt.award((t) => { t.special = { label: '飯沼長資を討ち取った', pts: 20 }; }, '飯沼長資を討ち取った');
  },
  onRout(rt, g) {
    if (g.team === 1 && g.name) rt.say('足軽', `${g.name}が崩れた！`, 2.5);
  },
};

// 織田勢の減りは討たれた数だけ（池田の組の首およそ五百。井伊直政の報告）。前は一人で二十五減らし、新加納の前に 0 になっていた（11/6）
k02_kawada.force = (rt) => ({ a: Math.round(18000 - (rt.flags.ak || 0) * 10), a0: 18000, b: Math.max(0, 3000 - (rt.flags.ek || 0) * 5), b0: 3000 });
// 開戦の札：両軍の数と二三行（五4・十二1）
k02_kawada.introSides = { a: '東軍一万八千', b: '織田三千' };   // 「織田勢　三千」は札の幅で「三千」が次の行へ落ちた（iPhone 横で撮って確かめた）
k02_kawada.introText = '岐阜城の織田秀信を攻めるため、東軍は木曽川を渡る。北岸の鉄砲の前で浅瀬を越え、米野村と新加納の砦の織田勢を破れ。';
k02_kawada.sides = { a: { name: '東軍', mon: 'ageha' }, b: { name: '織田勢', mon: 'oda' } };
// 旧暦八月二十二日は今の九月二十九日（秋）。刻は空の移ろいに合わせる（明け方の渡河→昼の米野→昼過ぎの新加納）
k02_kawada.date = (rt) => { const k = rt && rt.world && rt.world.timeKey; return `慶長五年（1600）八月二十二日　秋・${k === 'afternoon' ? '昼過ぎ' : k === 'day' ? '昼' : '明け方'}`; };
k02_kawada.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '下知まで待つ' : '');
k02_kawada.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k02_kawada.history = '慶長五年（1600）八月、清洲に集まった東軍は、岐阜城の織田秀信を攻めるため木曽川を越えて美濃へ入ることにした。二十二日、池田照政（のちの輝政）・浅野幸長・山内一豊らが河田の渡しから、福島正則・黒田長政・細川忠興らが下流の尾越（起の渡し）から渡った。河田の北岸には織田方の木造長政・百々綱家らが鉄砲を並べて守り、下流の米野村と北の新加納にも構えがあった（秀信は川手の閻魔堂の本陣）。東軍はおよそ一万八千、織田勢はおよそ三千。東軍は明け方に渡って中洲の小屋場島に陣を張り、北の筋も渡って、昼に米野で戦った。一柳直盛の家来・大塚権太夫が一番に渡ったが、若武者の飯沼長資に討たれ、飯沼もここで討ち死にした。木造と百々は岐阜城へ退いた。織田勢は新加納でも防いだが破れ、秀信も岐阜城へ退いた。翌日の岐阜城攻めへ続く。\n木曽川の流れは当時と今とで大きく違い、川島の辺りは幾筋にも分かれて中洲を抱いていた。';
// 名簿の武将は段の組にだけ出す（名のある武将の自動の配置で、東の浅瀬の組にもう一人の木造の将が出ていた。BK5）
k02_kawada.bushou = [{ name: '木造長政', g: /木造長政/, at: Infinity }, { name: '百々綱家', g: /綱家/, at: Infinity }, { name: '飯沼長資', g: /長資/, at: Infinity }];

// ---- 行き先の印：段ごとに一か所に決めて動かさず、距離を添える（BK1・BK4・AW3） ----
const GOALS = [[ISLE, '小屋場島', 9], [GATE, '北岸の柵の口', 10], [GATE, '北岸の柵の口', 10], [YONENO, '米野村', 14], [YONENO, '米野村', 14], [SHINKANO, '新加納の砦', 14], [SHINKANO, '新加納の砦', 14]];
function goalNow(rt) {
  const F = rt.flags;
  // 始まりの札の上に行き先の▼を重ねない（物差し五の4・11/6 写真で重なっていた。札より先の一コマ目で印が立っていた）
  if (F.ending || rt.hud?.introWaiting || rt.t < 1) return null;
  const i = !F.begun ? 0 : F.dp && F.dp.on ? F.dp.i : -1;
  return GOALS[i] || null;
}
function guideTick(rt) {
  const q = goalNow(rt), F = rt.flags;
  if (q === F.goalShown && (!q || rt.markers.some((m) => m.id === 'k02go'))) return;   // 段の印の同名消し（b_depth の dropSameMark）で消えても戻す
  F.goalShown = q;
  if (q) rt.marker('k02go', q[0], q[1], { h: 3 }); else rt.unmark('k02go');
}
k02_kawada.namedGuideMarkers = true;
k02_kawada.guideMarker = (rt) => {
  const q = goalNow(rt), p = rt.player.u.pos;
  if (!q) return null;
  // 距離だけで消すと、柵の九歩手前や砦の木戸の外で案内がなくなる。
  // 入口を通る目標は、柵を越え、砦の内へ入るまで案内を残す。
  if (q[0] === GATE) return insideNorthGuard(p) ? null : 'k02go';
  if (q[0] === SHINKANO) return inFort(p) ? null : 'k02go';
  return Math.hypot(p.x - q[0].x, p.z - q[0].z) < q[2] ? null : 'k02go';
};
k02_kawada.travelGuideLabel = (rt) => {
  const q = goalNow(rt), p = rt.player.u.pos;
  return q ? `${q[1]} ${Math.round(Math.hypot(p.x - q[0].x, p.z - q[0].z))}m` : '';
};

// 戦線を離れた負傷兵や狙えない兵を、柵の口で戦う相手に数えない。
const fightingFoe = (o) => !o.fleeing && !o.invuln && !o.noTarget && !o.woundOut && !o.rearWound && !o.downed && !o.dying;
const reachableFoe = (b, u, o) => fightingFoe(o) && !b.army.wallBetween(u.pos, u.team, o.pos, false);
k02_kawada.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  // 手当てのために下がっている間は、木戸や柵の口へ引き戻さない。
  // 安全な味方の後ろまで退き、手当てと気力の回復を済ませてから進む。
  if (F.dp && F.dp.on && F.dpBack) { depthBot(b, inp, goTo); return; }
  // 退避の後退・横移動・構えは入力に残る。専用の渡河・木戸の道順でも解除し、
  // 前進との同時押しで柵の前に止まり続けないようにする。
  inp.k.delete('KeyW'); inp.k.delete('KeyS'); inp.k.delete('KeyA'); inp.k.delete('KeyD'); inp.k.delete('KeyE');
  inp.guardHold = false; inp.chargeHold = false;
  // 11/9 徳川C（見回り）：①で浅瀬の西の深みへ寄り、南の筋を渡れず十八分止まった（bot 中学生：x −87 で止まる）。浅瀬の真ん中の筋を北へ上る
  if (F.dp && F.dp.on && F.dp.i === 0 && u.pos.z > ISLE.z + 6 && Math.abs(u.pos.x - FORDS[0].x) > 6) {
    inp.runHeld = true; inp.leftPressed = !!b.army.nearestEnemy(u, 4, (o) => reachableFoe(b, u, o));
    goTo(p, inp, FORDS[0].x, Math.min(u.pos.z - 6, START.z), 1.5, true);
    return;
  }
  // 北岸の敵が先に退いても、段の中心（柵の手前）で止まらず柵の口を抜ける
  // 口から横へ外れた所で道へ戻すと、柵の内の折れ角へ斜めに進んで止まる。
  // 先に南へ離れ、柵の南側で口の正面へ回る。道への引き戻しは使わない。
  if (F.dp?.on && F.dp.i === 2 && u.pos.z >= GATE.z && u.pos.z < NORTH.z + 12 && Math.abs(u.pos.x - GATE.x) > 6) {
    inp.leftPressed = !!b.army.nearestEnemy(u, 4, (o) => reachableFoe(b, u, o)); inp.runHeld = true;
    if (u.pos.z < NORTH.z + 2) goTo(p, inp, u.pos.x, NORTH.z + 3, 0.5, true);
    else goTo(p, inp, GATE.x, u.pos.z, 1, true);
    return;
  }
  // 柵越しの敵で足を止めず、口を通ってから斬り合う（通しで砦にも出た柵際の停止を避ける）。
  // 十秒ほとんど動かない時は、口の前の四歩内で実際に斬れる敵へ向く。
  // 柵越しの敵を選ぶと近接攻撃は壁で止まり、口へ進む処理にも戻れなくなる。
  const sp = F._k02sp || (F._k02sp = { x: u.pos.x, z: u.pos.z, t: b.t });
  if (Math.hypot(u.pos.x - sp.x, u.pos.z - sp.z) > 2) { sp.x = u.pos.x; sp.z = u.pos.z; sp.t = b.t; }
  if (F.dp && F.dp.on && F.dp.i === 2 && u.pos.z >= GATE.z - 4 && b.t - sp.t > 10) {
    const e = b.army.nearestEnemy(u, 4, (o) => reachableFoe(b, u, o));
    if (e) { p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z); inp.leftPressed = true; if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 2) goTo(p, inp, e.pos.x, e.pos.z, 1.8); return; }
    // 口の中央を味方や狙えない兵が塞ぐ時は、同じ筋へ押し続けず、
    // 十四歩開いた口の内で左右へ回る。道の案内へ戻すと中央に引かれる。
    if (u.pos.z >= GATE.z && u.pos.z < NORTH.z + 12 && Math.abs(u.pos.x - GATE.x) < 6 && !(F.k02GateUntil > b.t)) {
      F.k02GateSide = F.k02GateSide === -1 ? 1 : -1;
      F.k02GateUntil = b.t + 8;
    }
  }
  if (F.dp?.on && F.dp.i === 2 && u.pos.z >= GATE.z && F.k02GateUntil > b.t) {
    const x = GATE.x + F.k02GateSide * 4;
    inp.leftPressed = !!b.army.nearestEnemy(u, 4, (o) => reachableFoe(b, u, o)); inp.runHeld = true;
    // 先に横へ抜けてから北へ進む。柵の端から三歩の余裕を残す。
    goTo(p, inp, x, Math.abs(u.pos.x - x) > 1 ? u.pos.z : GUARD.z, 0.6, true);
    return;
  }
  if (F.dp && F.dp.on && F.dp.i === 2 && u.pos.z >= GATE.z && !b.army.nearestEnemy(u, 5, (o) => reachableFoe(b, u, o))) {
    inp.leftPressed = false; inp.runHeld = true;
    goTo(p, inp, GATE.x, GUARD.z, 2);
    return;
  }
  // 砦の段：柵を回って南の木戸から入る（柵の東の外で止まっていた。11/6 夜の流し）
  if (F.dp && F.dp.on && F.dp.i === 6 && !inFort(u.pos)) {
    // 柵越しの敵が五歩以内でも、外に留まらず木戸へ回る。寄る敵には斬り返す
    inp.leftPressed = !!b.army.nearestEnemy(u, 5, (o) => reachableFoe(b, u, o)); inp.runHeld = true;
    // 迂回中は道の線へ戻さない（柵の外から内側の道へ引かれると、柵に当たり続ける）
    // 北へ追った後は北の柵を横切らず、側面の外へ出てから南の木戸へ回る。
    const side = FORT_IN.x + (u.pos.x < FORT_IN.x ? -25 : 25);
    // 北の柵の境目と側面の柵ぎわでも、先に横へ離す。南へ直進すると柵に当たり続ける。
    const edge = Math.abs(u.pos.x - FORT_IN.x);
    // 達成判定より外でも柵の内にいる細い縁では、中へ寄る。外へ迂回すると側面の柵に当たり続ける。
    // 北柵と同じ位置から横へ回ると、搦手の口の端や柵に当たる。先に北へ四歩離してから側面へ回る。
    if (edge < 23 && u.pos.z <= SHINKANO.z - 14 && u.pos.z > SHINKANO.z - 18.5) goTo(p, inp, u.pos.x, SHINKANO.z - 19, 0.5, true);
    else if (edge < 20 && u.pos.z > SHINKANO.z - 14 && u.pos.z < SHINKANO.z + 10) goTo(p, inp, FORT_IN.x, FORT_IN.z, 1, true);
    else if ((u.pos.z <= SHINKANO.z - 12 || (edge >= 19.5 && u.pos.z < FORT_GATE.z - 1)) && edge < 23) goTo(p, inp, side, u.pos.z, 1, true);
    else if (Math.abs(u.pos.x - FORT_GATE.x) > 3 && u.pos.z < FORT_GATE.z - 1) goTo(p, inp, u.pos.x, FORT_GATE.z + 3, 2, true);
    else if (u.pos.z > FORT_GATE.z - 4 && Math.abs(u.pos.x - FORT_GATE.x) > 2) goTo(p, inp, FORT_GATE.x, FORT_GATE.z, 1.5, true);
    else goTo(p, inp, FORT_IN.x, FORT_IN.z, 3, true);
    return;
  }
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, START.x, START.z - 4, 3);
};

const dpAt = (k) => (rt) => (rt.flags.dp?.i ?? -1) >= k || (rt.flags.dp && !rt.flags.dp.on && rt.flags.begun);
STAGES.k02_kawada = [['南の筋を渡り小屋場島へ行く'], ['北岸の柵の木造長政の旗本を追い払う', dpAt(2), [['木造長政を柵から退かせる', (rt) => !!rt.flags.gumasaDown]], false], ['米野村の百々綱家の隊を追い払う', dpAt(4), [['飯沼長資を討つ', (rt) => !!rt.flags.iinumaDown]], false], ['新加納の砦の殿を追い払う', dpAt(6)]];

export { k02_kawada };
export default k02_kawada;
