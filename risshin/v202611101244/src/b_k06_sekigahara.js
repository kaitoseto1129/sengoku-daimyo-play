// ======================================================================
// 徳川編 6　関ヶ原の戦い（慶長五年九月十五日 1600）。筋書きの正：docs/chapter3_tokugawa.md の「6. 関ヶ原」
// 主人公は東軍（徳川方）の侍大将。井伊直政・松平忠吉の手に付き、抜け駆けで開戦の口火を切る。
// 段（11/9 kaito docs/sekigahara_spec_1109.md で十に）：①霧の中、井伊に続いて宇喜多の先手の前へ ②井伊の鉄砲衆が撃ちかける（抜け駆け）
//     ③福島隊の後ろへ一旦退く（怒った福島正則が突撃） ④前線へ進め：福島隊に続き宇喜多の先手と槍を合わせる
//     ⑤宇喜多の押し返しを福島隊のそばで持ちこたえる（前半は西軍が強い） ⑥中央右翼を救援：藤堂・京極の隊へ回る
//     ⑦大谷隊の前進を止める（膠着。松尾山は動かない。十分半より前には寝返らない） ⑧小早川が山を下り大谷へ（一分半）→大谷隊を押し崩す
//     ⑨西軍中央を突破：宇喜多の殿を押し破る（秀家・三成は逃がす） ⑩島津の突入を本陣の前で食い止める（義弘は討たせない）
// 勝ち：⑩まで果たす。主人公が倒れた時は共通のやり直しへ。全体の刻限は無い（時は目標ごと：goals5.js・AP8）。
// kaito_play AP〜AT・BU：総大将（三成・秀家・家康）は遠い本陣の幕の内で床几に座る（幕の内へは歩いて入れない）・旗はその家の物・段は時間で進めない
// 地形：国土地理院の標高（asset_dem_sekigahara.js・dem.mjs の sekigahara）。11/6 BU「戦場が狭い」：ゲームの 1 を実の 4m に（前は 10m）、高さは 0.2 倍。
//   中心は北緯35.3655・東経136.4720（関ヶ原の盆地の真ん中）。陣の位置は陣跡の緯度経度を写した（docs/battle_refs/k06_sekigahara.md の布陣表の座標 × 2.5）。
//   島津だけは陣跡より後ろ（西）の林の陰に置き、退き口まで兵を出さない（BU「島津はずっと後ろ、退き口の時まで見えない」）。
// 座標：西が −x（笹尾山・天満山）、北が −z、南の +z に松尾山。東の +x に家康の本陣（桃配山）。
// 兵：戦う兵は全部本物（同時に二百五十まで）。振り返った所には中ほどの二の備え（金森・加藤）を本物で置く。
//   11/8 kaito（toku15_plan 6・army_depth_spec）：各家の備・二陣・旗本・南宮山の毛利は共通の軍勢の厚みに表で渡す（k06/depth_plan.js）。
//   第一線の激突・小早川の一万五千の下山・段ごとの下知は k06/jindate.js（霧が晴れると遠くまで旗が見える）。
//   勝った後は霧の晴れた野の余韻と首実検の支度（k06/yoin.js）。
//   名のある将は馬上で旗本の侍に囲む。総大将（家康・三成・秀家）と大谷吉継（輿）は本陣で座る。旗はその家の物だけ。
// 史実と一説：問鉄砲（家康が松尾山へ鉄砲を撃たせた）は一説。「勝って兜の緒を締めよ」は伝承。history に分けて書く。
// ======================================================================
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, gauss, nm, wallLine } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import * as THREE from 'three';
import { nobori, jinCamp, umaFollow } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { KILLS, cut } from './stages.js';
import { timeslipField } from './timeslip_field.js';
import { setStages } from './b_k_help.js';
import * as jindate from './k06/jindate.js';   // 台本の動き（第一線の激突・小早川の下山・段ごとの下知）
import { DEPTH } from './k06/depth_plan.js';   // 陣立て表（共通の army_depth.js が描く）
import * as yoin from './k06/yoin.js';         // 勝った後の余韻（倒れた旗・逃げる兵・首実検の支度）

let dem = null;
useTerrain('dem_sekigahara', (data) => { dem = data; });
const SC = 2.5;          // 前の座標（1＝10m）からの倍（11/6 BU：1＝4m）
const DEM_XY = 10 / SC;
function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.043 / SC + 0.6) * Math.cos(z * 0.039 / SC);
  // 笹尾山の比高も横方向と同じ四分の一に近づけ、麓から登る坂を残す。
  if (dem) return h + Math.max(-2, (demSample(dem, x * DEM_XY, z * DEM_XY) - 120) * 0.25);
  // 標高が読めない時の手書き（松尾山・天満山・笹尾山・南宮山の裾・北の伊吹の裾）
  x /= SC; z /= SC;
  h += 30 * gauss(x, z, -160, 206, 2200) + 12 * gauss(x, z, -160, 20, 700) + 16 * gauss(x, z, -166, -79, 600);
  h += 28 * gauss(x, z, 230, 90, 3000) + Math.max(0, -z - 95) * 0.5 + Math.max(0, -x - 190) * 0.45;
  return h;
}

// ---- 場所（ゲームの座標。陣跡の緯度経度から x＝(経度−136.472)×9080×2.5・z＝−(緯度−35.3655)×11100×2.5） ----
const p = (x, z) => ({ x: x * SC, z: z * SC });
// 11/9 kaito の布陣図（docs/sekigahara_layout_ref_1109.md）：井伊・松平忠吉は福島の後ろの南。福島の前を抜けて宇喜多の先手の前へ出る
const START = p(-68, 40);         // 井伊直政・松平忠吉の陣（福島隊の後ろの南東）
const NUKE = { x: -284, z: 36 };  // 抜け駆けで出る宇喜多の先手の前（福島隊の北の脇・先手まで鉄砲の届く所）
const FUKU = p(-96, 30);          // 福島正則の陣（春日神社の前）
const BACK = { x: -212, z: 52 };  // 一旦退く所（福島隊の後ろ）
const UKITA_F = p(-128, 22);      // 宇喜多の先手（明石全登）
const UKITA_H = { x: -420, z: 48 };   // 宇喜多秀家の本陣（南天満山。先手から百メートル余り奥の林）
const KONISHI = p(-158, -8);      // 小西行長（北天満山）
const SHIMAZU = { x: -392, z: -96 };  // 島津義弘（小池村の陣跡より奥の林の陰）
const SAKON = p(-148, -64);       // 島左近の隊（笹尾山の麓の柵）
const FENCE_X = SAKON.x + 16;     // 笹尾山の麓の柵（南北の線）
const FENCE = [[FENCE_X, -206], [FENCE_X - 2, -182], [FENCE_X, -160], [FENCE_X + 3, -136]];
const GAP = { x: FENCE_X - 1, z: -171 };   // 柵の口（虎口）
const GAP_HALF = 5.5;   // wallLine の gaps [5, 6]：開口は z=-176.5〜-165.5。脇の柵を壊して通っても虎口には数えない。
const SAKON_FRONT = { x: FENCE_X + 14, z: -170 };   // 左近が打って出る野の持ち場
const SASAO = p(-166, -79);       // 石田三成の本陣（笹尾山）
const KURODA = p(-84, -88);       // 黒田長政（岡山の烽火場の麓）
const HOSOKAWA = p(-100, -76);    // 細川忠興
const KATO_P = p(-96, -54);       // 加藤嘉明・田中吉政の手
const IEYASU0 = p(130, 60);       // 家康の本陣（はじめ・桃配山）
const IEYASU1 = p(-34, -39);      // 前へ出た本陣（陣場野）
const HONDA = p(-9, -17);         // 本多忠勝
const TODO_P = p(-82, 62);        // 藤堂高虎・京極高知
const MATSUO = p(-160, 206);      // 松尾山（小早川）
const WAKI_P = p(-150, 150);      // 脇坂・朽木・小川・赤座（松尾山の北の麓）
const OTANI = { x: -470, z: 202 };   // 大谷吉継（山中の藤川台。宇喜多の南東・中山道の南の高み。11/9 布陣図）
const HIRA = p(-152, 62);         // 平塚為広・戸田勝成（大谷の前。藤堂・京極に向く）
const HOLD5 = { x: -112, z: -36 };    // 島津の退き口を受ける所（陣場野の本陣の南の前）
const sc = (L) => L.map(([x, z]) => [x * SC, z * SC]);
const FUJI = sc([[-215, -230], [-200, -100], [-190, 0], [-170, 30], [-160, 52], [-165, 100], [-180, 160], [-200, 240]]);   // 藤古川
const NAKASENDO = sc([[240, 70], [130, 54], [40, 16], [0, 6], [-80, 8], [-150, 30], [-200, 56], [-240, 70]]);
const HOKKOKU = sc([[-60, 6], [-110, -30], [-150, -70], [-180, -150], [-200, -230]]);
const ISE = sc([[-6, 8], [2, 60], [12, 130], [30, 240]]);
const SHIMA_PATH = [{ x: -300, z: -70 }, { x: -200, z: -48 }, { x: -112, z: -36 }, { x: -60, z: 40 }, { x: -10, z: 170 }, { x: 20, z: 360 }, { x: 60, z: 560 }];
const FOG_T0 = 8, FOG_T1 = 40;   // 11/9 kaito：最初の三十秒で「見渡す限り軍勢」が見えるよう、霧は早く晴れる
const HOLD_S = 32;
// 11/9 kaito（docs/sekigahara_spec_1109.md）：前半十分は西軍が強い。寝返りは十分半ごろ。主人公は福島隊のそばから右翼へ、最後に島津の進路へ
const HOLD5S = 70;      // ⑤ 宇喜多の押し返しを福島隊のそばで持ちこたえる秒
const RLINE = { x: -272, z: 150 };   // ⑦ 藤堂・京極の脇で大谷隊（平塚・戸田）の前進を止める線
const OTANI_FRONT = { x: RLINE.x - 14, z: RLINE.z };
const HOLD7S = 80;
const CENTER9 = { x: -350, z: 66 };   // ⑨ 宇喜多の殿が踏みとどまる天満山の麓（大谷の陣が崩れた後、宇喜多・小西が横から押される）      // ⑦ 大谷隊の前を支える秒
const FLIP_MIN_T = 630; // 寝返りは戦が始まって十分半より前には起こさない（中盤で起こすと後半ずっと東軍の勝ちに見える）
const FALL_MAX = 110;   // ⑧ 小早川が動いてから大谷隊が崩れるまでの最長の秒（押し崩せなくても進む）
// 右上の目標（goals5・obj・setStages で同じ文）。行き先は地図で分かる名で（BU「ここ」は使わない）
//   討てる将（明石全登・島津豊久）の名は目標の文に入れない（victory_flow の namedKill が名を含む札を済みにし、段の途中で勝ちに締まる）
const G = [
  '霧の中、井伊の赤備えに続いて宇喜多の先手の前へ出る',
  '井伊の鉄砲衆の脇に槍を立て、宇喜多の先手へ撃ちかける間を守る',
  '井伊の手と共に、福島隊の後ろの春日神社の前まで退く',
  '前線へ進め。福島隊に続き、宇喜多の先手と槍を合わせる',
  '押し返してくる宇喜多勢を、福島隊のそばで持ちこたえる',
  '中央右翼を救援せよ。藤堂・京極の隊へ回る',
  '藤堂・京極の陣の前で、大谷隊の前進を止めろ',
  '藤堂・京極の陣の前で、大谷隊を押し崩す',
  '天満山の麓で、西軍中央を突破せよ',
  '陣場野の本陣の前で、島津の突入を食い止めろ',
];
const NOUN = ['宇喜多の先手', '井伊の鉄砲衆', '春日神社', '宇喜多の先手', '宇喜多勢', '藤堂・京極の隊', '大谷隊', '大谷隊', '宇喜多・小西の殿', '島津の隊'];

// ---- 兵の装い ----
const TK = 0x24221f, WS = 0x2c2a2a;
const II = { flag: 'ii', armor: 0x8e1f16 };          // 井伊の赤備え
const FUKUSHIMA = { flag: 'mizuno', armor: TK };     // 福島沢瀉を既存の沢瀉の絵で示す
const KUR = { flag: 'kuroda', armor: TK };
const TOKU = { flag: 'tokugawa', armor: TK };
const HOSO = { flag: 'kuyo', armor: TK };            // 細川の九曜
const KATO = { flag: 'sagarifuji', armor: TK };      // 加藤嘉明の下り藤
const TODO = { flag: 'todo', armor: TK };
const UKITA = { flag: 'ukita', armor: WS };
const ISHIDA = { flag: 'ishida', armor: WS };
const SHIMA = { flag: 'shimazu', armor: 0x1c1a1a };
const OTANI_LK = { flag: 'otani', armor: WS };
const KOBA = { flag: 'sashi:kobayakawa:#ece6d6:#16140f', armor: 0x2a2622 };
const WAKI = { flag: 'wakisaka', armor: WS };
const KONI = { flag: 'konishi', armor: WS };     // 小西の中結び祇園守
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const alive = (g) => !!g && !g.routed && g.count > 0;
const near = (a, b, r) => Math.hypot(a.x - b.x, a.z - b.z) < r;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 討てない大将だけを追わず、今の段で押し返す残兵へ案内する。
const front = (P, at, radius, g0, g1, g2, g3, g4) => {
  let target = at, best = Infinity;
  for (let k = 0; k < 5; k++) {
    const g = k === 0 ? g0 : k === 1 ? g1 : k === 2 ? g2 : k === 3 ? g3 : g4;
    if (alive(g)) for (const u of g.units) {
      if (!u.alive || u.gone || u.fleeing || u.invuln || u.noTarget || u.campProtected || !near(u.pos, at, radius)) continue;
      const d = dist(P, u.pos);
      if (d < best) { best = d; target = u.pos; }
    }
  }
  return target;
};
const rout = (g) => {
  if (!g) return;
  g.routed = true; g.order = 'flee'; g.onArrive = null; g.dest = null; g.focus = null;
  // 下知したコマから攻撃を解く。移動の到着予約で戦い直させない。
  for (const u of g.units) if (u.alive && !u.isPlayer) {
    u.target = null; u.atk = null; u.swing = null; u.bind = null; u.charging = false; u.aiT = 0;
  }
  KIT.markRecyclable(g);
};
const nOf = (...gs) => gs.reduce((n, g) => n + (alive(g) ? g.count : 0), 0);
// 笹尾山の旗本のうち、山（本陣）から七十歩の内で踏みとどまる兵だけ（遠くへ散った兵を追い回させない・11/8 流しで西の山奥まで追った）
const nAt = (at, ...gs) => gs.reduce((n, g) => n + (alive(g) ? g.units.filter((u) => u.alive && !u.gone && !u.fleeing && Math.hypot(u.pos.x - at.x, u.pos.z - at.z) < 70).length : 0), 0);
// 本物の兵は同時に REAL_CAP まで。新手を出す前に、逃げた隊・遠い隊から遠くの姿へ戻す（近づけばまた本物）
const REAL_CAP = 250;
const realCount = (rt) => rt.army.units.reduce((n, u) => n + (u.alive && !u.gone && u.type !== 'porter' ? 1 : 0), 0);
//   逃げて遠ざかった名の無い兵は、先に戦場の外へ出た事にする（崩れた隊が枠をふさがない）
const room = (rt, n) => {
  let over = realCount(rt) + n - REAL_CAP;
  if (over <= 0) return;
  const P = rt.player.u.pos;
  const run = rt.army.units.filter((u) => u.alive && !u.gone && u.fleeing && !u.name && !u.isPlayer && !u.isSub && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) > 50);
  run.sort((a, b) => Math.hypot(b.pos.x - P.x, b.pos.z - P.z) - Math.hypot(a.pos.x - P.x, a.pos.z - P.z));
  for (const u of run) { if (over <= 0) break; rt.army.despawn(u); over--; }
  if (over > 0) KIT.freeRoom(rt, over);
};
const goAttack = (g, dest, aggro = 40, seek = 60) => {
  if (!alive(g)) return;
  g.order = 'move'; g.dest = { ...dest }; g.arriveRadius = 6;
  g.onArrive = (q) => { if (!alive(q)) return; q.order = 'attack'; q.aggro = aggro; q.seekRange = seek; q.onArrive = null; };
};
const goTo = (g, dest) => { if (!alive(g)) return; g.order = 'move'; g.dest = { ...dest }; g.onArrive = (q) => { if (!alive(q)) return; q.order = 'hold'; q.anchor = { ...dest }; q.onArrive = null; }; };
const foe = (rt, name, at, list, lk, o = {}) => enemyGroup(rt, { name, faction: 'toyotomi', anchor: { ...at }, facing: Math.PI / 2, order: 'attack', aggro: 36, seekRange: 60, width: 10, ...o }, dress(list, lk));
const ally = (rt, name, at, list, lk, o = {}) => allyGroup(rt, { name, faction: 'tokugawa', anchor: { ...at }, facing: -Math.PI / 2, width: 10, aggro: 14, morale: 92, noRout: true, ...o }, dress(list, lk));
// 総大将は本陣で床几に座る（update が座り直させる）。幕の内から出ない（aggro 0・その場に留まる）
const keepCommander = () => {};
const SEAT = (g, name) => {
  const u = g?.units.find((o) => o.name === name);
  if (u) {
    // 索敵から外すだけでは、巻き込まれた一撃の手傷処理で討たれる。退却・自害は戦の台本に任せる。
    u.mustLive = true; u.onWound = keepCommander;
    u._crouch = true; u.noTarget = true; u._k06Seat = { ...u.pos };
  }
  return u;
};
// 索敵距離が零でも共通の応戦は働く。総大将だけを床几に留め、旗本は戦わせる。
const sit = (u) => {
  if (!u?.alive || u.gone || u.fleeing || u.group?.routed) return;
  if (u.group?.order === 'move') { u._crouch = false; return; }
  const p = u._k06Seat;
  if (!p) return;
  u.pos.x = p.x; u.pos.y = p.y; u.pos.z = p.z;
  u.target = null; u.watch = null; u.moveTo = null;
  u.atk = null; u.swing = null; u.bind = null;
  // 中盤に立っても、応戦の相手や攻撃を残して本陣から打って出させない。
  u.moving = 0; u._crouch = !u._k06Stand;
};
// 寝返った隊：同じ場所・同じ人数で東軍の隊に入れ替える（旗も具足もその家のまま）
const turnover = (rt, g) => { const n = g ? g.units.filter((u) => u.alive && !u.gone).length : 0; for (const u of g?.units || []) rt.army.despawn(u); if (g) g.routed = true; return n; };
// 本陣：幕（jinCamp）を張り、幕の線に沿って当たりを置く（幕は抜けられない。BU「敵の本陣に歩いて入れてしまう」）。
//   幕そのものが見える壁なので、当たりには別の形を付けない。大将は奥の床几に座る
const NOMESH = () => new THREE.Group();
function camp(rt, x, z, mon, o = {}) {
  const w = o.w || 16, d = o.d || 12;
  KIT.honjin(rt, x, z, { mon, people: false, fire: false, noUma: true, w, d });
  if (o.wall !== false) wallLine(rt, [[x - w / 2, z - d / 2], [x + w / 2, z - d / 2], [x + w / 2, z + d / 2], [x - w / 2, z + d / 2]], { closed: true, team: o.team ?? 1, hp: 1e9, segLen: 4, name: '陣幕', mesh: NOMESH });
  return { x, z: z - d / 2 + 2.6 };   // 床几の前（大将の座る所）
}
// 四方輿（しほうごし）：大谷吉継が乗った、四方に柱を立てて簾を巻き上げた屋形の輿。二本の長柄で担ぐ。地に下ろし、吉継はその床に座る
let KOSHI_MAT = null;
function shihoKoshi(world, x, z, rot) {
  const M = KOSHI_MAT || (KOSHI_MAT = { wood: new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.8 }), lac: new THREE.MeshStandardMaterial({ color: 0x15120f, roughness: 0.45 }), su: new THREE.MeshStandardMaterial({ color: 0x8a7a52, roughness: 0.95 }) });
  const g = new THREE.Group();
  const box = (w, h, d, px, py, pz, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(px, py, pz); g.add(o); return o; };
  box(1.2, 0.1, 1.4, 0, 0.08, 0, M.lac);                                          // 床（地に下ろした輿の床。吉継はこの上に座る）
  for (const sx of [-0.56, 0.56]) for (const sz of [-0.66, 0.66]) box(0.07, 1.6, 0.07, sx, 0.9, sz, M.lac);   // 四方の柱
  box(1.45, 0.1, 1.7, 0, 1.72, 0, M.lac); box(1.1, 0.1, 1.35, 0, 1.82, 0, M.lac);   // 屋形の屋根
  for (const sz of [-0.66, 0.66]) box(1.1, 0.12, 0.12, 0, 1.6, sz, M.su);          // 巻き上げた簾
  box(1.1, 0.2, 0.05, 0, 0.28, -0.68, M.wood); box(0.05, 0.2, 1.3, -0.58, 0.28, 0, M.wood); box(0.05, 0.2, 1.3, 0.58, 0.28, 0, M.wood);   // 低い手すり
  for (const sx of [-0.68, 0.68]) { const q = box(0.08, 0.08, 4.6, sx, 0.2, 0, M.wood); q.castShadow = true; }   // 長柄
  g.position.set(x, world.heightAt(x, z), z); g.rotation.y = rot;
  return g;
}
const k06_sekigahara = {
  // 身の回りの合戦の跡（timeslip_field.js）。関ヶ原：前の夜の雨で濡れた野と霧。ぬかるみ・水たまり・倒れた槍と旗
  timeslip: {
    wet: 0.65, dust: 0.1, trample: 0.4, debris: 1.3, arrows: 1, pools: 0.8, poolDim: 0.7,
    grass: 0x8a9456, grassTints: [0xffffff, 0xe0dcb0, 0xc4c494], grassH: 1.1, grassLift: 0.2, grassShape: 'blade', tallGrass: 0.8,
    flagColors: [0x24211e, 0x8e1f16, 0x3a3630],   // 模様の無い白い幟を地に立てない（critic60）
  },
  lethal: { max: 5, firstAt: 70, gap: 45 },   // 命懸けの戦場（docs/lethal_howto.md）
  fearKind: { kind: '天下分け目', note: '寝返りと島津の突撃で本陣に迫られる', w: { honjin: 1.8, flank: 1.4 }, line: '本陣が危ない！' },
  depth: DEPTH,   // 各家の備・二陣・旗本・南宮山の毛利（k06/depth_plan.js・docs/army_depth_howto.md）
  noCouriers: true,
  noTaisho: true,
  noReserve: true,
  frontlineDensity: false,
  enemyTactics: false,
  hideArmyPeek: true,
  missionSingleLine: true,
  battleDialogue: true,   // 抜け駆けの咎め・寝返り・退き口の知らせを、音を消していても読める
  // 自害は台本の使番が知らせる。倒す処理から共通の「討ち取ったり」を重ねない。
  // 生前の吉継の名と、ほかの将の討取りはそのまま出す。
  hideNameTag: (u, rt) => !!rt?.flags.otaniDown && u === rt.flags.otaniU && !u.alive,
  foeMarks: true,
  foeMarkRange: 30,
  missionPinCaption: '',
  // 戦の途中の保存（battle_checkpoint.js・kaito 11/8）：段の関数を順に流して段の始まりを作り直す（前の段の声・見出しは出さない）。
  //   ⑤の持久戦も保存する。⑨の前には寝返り（flip）を流しておく
  resumeSteps: [
    [1, function (rt) { this.stage1(rt); }], [2, function (rt) { rt.flags.kaniWait = false; this.stage2(rt); }], [3, function (rt) { this.stage3(rt); }], [4, function (rt) { this.stage4(rt); }],
    [5, function (rt) { this.stage5(rt); }], [6, function (rt) { this.stage6(rt); }], [7, function (rt) { this.stage7(rt); }], [8, function (rt) { this.stage8(rt); }],
    [9, function (rt) { this.otaniFall(rt); }], [10, function (rt) { this.westFall(rt, true); }],
  ],
  resumeAt: (rt, s) => ({ 2: NUKE, 3: NUKE, 4: BACK, 5: { x: UKITA_F.x + 20, z: UKITA_F.z + 10 }, 6: { x: UKITA_F.x + 20, z: UKITA_F.z + 10 }, 7: { x: TODO_P.x - 10, z: TODO_P.z }, 8: RLINE, 9: { x: HIRA.x + 30, z: HIRA.z - 30 }, 10: { x: HOLD5.x + 8, z: HOLD5.z + 6 } })[s] || null,
  horseHurtMul: 0.4,   // 11/8 critic60（一8）：馬がすぐ死んで④〜⑤を一人で歩いた。馬の傷を軽く
  // 行田市郷土博物館の合戦屏風解説・左隻四扇。ほかの戦の宇喜多旗へは遡らせない。
  flagEra: { ukita: 'sashi:字兒:#243e62:#ece6d6' },
  foeHit: 0.5,        // 宇喜多の先手に当たると三十秒で命が尽きた（critic60）。打ち込みを軽く
  // 11/4 n2（AP12・AV15・BH6・AL）：行き先は頭上の金の▼一つだけ。字は添えない（10/23）
  goalSignOnly: true,
  goalSignBare: true,
  // 11/6 BU：目標はいくつでもよい（九つ）。画面には今の五つ（hud_goals.js）。場所と行いだけで、討てる将の名は入れない
  goals5(rt) {
    const at = (q) => k06_sekigahara.missionPin(q);
    // 刻限を知らせない任務は、移動や押し合いが長引いても失敗にしない。
    return G.map((text, k) => ({ kind: 'stage', k, text, noun: NOUN[k], check: k === 9 ? (q) => !!q.flags.won
      : k === 6 ? (q) => !!q.flags.won || !!q.flags.turned || (q.flags.step || 0) > 8
      : (q) => !!q.flags.won || (q.flags.step || 0) > k + 1, place: at }));
  },
  closeCombatAssist: true,
  compactIntro: true,
  prelude: false,      // 霧の中の会話が開戦の溜め。共通の溜め（十五秒）を重ねると、三十秒近く立ち尽くす（newbie60）
  introText: () => '慶長五年九月十五日の朝。霧の関ヶ原で、東西およそ十五万が向き合う。井伊直政の手に付き、天下分け目の口火を切る。',
  minutes: 15,
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },
  sides: { a: { name: '東軍', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '西軍', mon: 'ishida', faction: 'toyotomi' } },
  date: () => '慶長五年（1600）九月十五日　朝・霧　美濃国 関ヶ原',
  force(rt) {
    const F = rt.flags;
    // 下山を始めただけでは所属を替えない。兵数の棒も実際の寝返りの確定に合わせる。
    const turned = F.turned ? 15000 + (F.wakiT ? 4000 : 0) : 0;
    const k = [0, 0, 0, 0.02, 0.05, 0.05, 0.06, 0.07, 0.3, 0.6, 0.85][F.step || 0] || 0;
    return { a: 75000 + turned - Math.round(75000 * k * 0.12) - (F.ak || 0) * 30, a0: 75000, b: Math.max(0, Math.round((82000 - turned) * (1 - k)) - (F.ek || 0) * 30), b0: 82000 };
  },
  world: {
    seed: 1600,
    time: 'day',
    mood: 'morning',     // 朝霧の中で始まった戦
    muddy: 0.4,          // 前の夜の雨で足もとがぬかるむ
    groundHalf: 650,     // 11/6 BU：振り返っても本陣と諸隊が見える広さ（地面の頂点数は増やさない）
    moveLim: 620,
    // 北西の伊吹の広い肩と南東の南宮山。円錐の峰を繰り返さない。
    mountainProfile(a, layer) {
      const lobe = (dir, width) => Math.exp(-(1 - Math.cos(a - dir)) / width);
      return 10 + layer * 5 + (36 + layer * 25) * lobe(-2.65, 0.22)
        + (18 + layer * 9) * lobe(1.05, 0.32) + 3 * Math.sin(a * 9 + layer);
    },
    mountainStreak: 0.2,
    height,
    streams: [{ pts: FUJI, w: 4, depth: 1.0 }],
    paths: [NAKASENDO, HOKKOKU, ISE],
    tint(x, z, h, c) {
      // 盆地の田は刈り入れ前の湿った土、山すそは濃い草、高い所は林の暗い緑
      if (h < 4) c.setRGB(c.r * 0.9 + 0.03, c.g * 0.9 + 0.025, c.b * 0.82);
      else if (h > 14) c.setRGB(c.r * 0.82, c.g * 0.92, c.b * 0.8);
      const q = 0.5 + 0.5 * Math.sin(x * 0.028 + 1.3) * Math.cos(z * 0.024);
      c.multiplyScalar(0.86 + q * 0.2);
    },
    fieldStage: 'ripe',
    paddy(x, z) {
      if (x < -320 || x > 300 || z < -150 || z > 270) return 0;
      if (Math.abs(z - 25) < 8) return 0;
      if ((Math.floor(x / 14) + Math.floor(z / 12)) % 3 === 1) return 0;
      const ex = Math.min(((x % 14) + 14) % 14, 14 - ((x % 14) + 14) % 14), ez = Math.min(((z % 12) + 12) % 12, 12 - ((z % 12) + 12) % 12);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * 0.7;
    },
    clear: (x, z) => x > -360 && x < 360 && z > -230 && z < 290,
    trees: 900,
    tufts: 3600,
    treeDensity: (x, z) => (x > -360 && x < 360 && z > -230 && z < 290 ? 0 : height(x, z) > 14 ? 1.2 : 0.35),
    groves: [{ x: MATSUO.x, z: MATSUO.z + 20, r: 60, n: 70, kind: 'sugi' }, { x: SASAO.x - 26, z: SASAO.z - 18, r: 26, n: 26 }, { x: UKITA_H.x - 20, z: UKITA_H.z, r: 30, n: 30 },
      { x: OTANI.x - 20, z: OTANI.z, r: 26, n: 24 }, { x: SHIMAZU.x + 18, z: SHIMAZU.z + 6, r: 24, n: 30, kind: 'sugi' }],
    fleeOut: (x, z, team) => (team === 1 ? x < -560 || z < -560 : x > 560),
  },

  missionPin(rt) {
    const F = rt.flags, q = F.pin || (F.pin = { x: 0, z: 0, r: 6, hide: 6 });
    if (!rt.player.u.alive || F.ending) return null;
    const lead = (g, at) => (g?.leader?.alive && !g.leader.gone ? g.leader.pos : alive(g) ? g.center() : at);
    const s = F.step || 1, P = rt.player.u.pos;
    // 討てない大将を追わず、今の段で押し合う相手の手前へ案内する（遠い残兵は追わせない）
    const T = s === 1 || s === 2 ? NUKE : s === 3 ? BACK : s === 4 ? front(P, UKITA_F, 45, F.akashi, F.akaGun, F.ukita2)
      : s === 5 ? (near(P, UKITA_F, 50) ? front(P, UKITA_F, 45, F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4) : UKITA_F)
      : s === 6 ? lead(F.todo, TODO_P)
      : s === 7 ? (near(P, RLINE, 34) ? front(P, RLINE, 30, F.otani, F.otaW1, F.otaW2) : RLINE)
      : s === 8 ? (near(P, RLINE, 80) ? front(P, RLINE, 30, F.otani, F.otaW1, F.otaW2) : RLINE)
      : s === 9 ? (near(P, CENTER9, 60) ? front(P, CENTER9, 50, F.shingari, F.koniR) : CENTER9) : HOLD5;
    q.x = T.x; q.z = T.z;
    return q;
  },

  setup(rt) {
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 本陣の幕と旗。幕の中には必ず大将と旗本が座る（AV18）。家康の陣場野の幕は本陣が移ってから張る
    // 11/5：金扇の大馬印は家康だけ（三成・秀家の陣に同じ金扇を立てない）。家康の馬印は本陣が陣場野へ進む時に共に動く（umaFollow）
    const seatI = camp(rt, IEYASU0.x + 4, IEYASU0.z, 'tokugawa', { wall: false });
    const seatM = camp(rt, SASAO.x - 4, SASAO.z - 2, 'ishida');
    const seatU = camp(rt, UKITA_H.x - 4, UKITA_H.z, 'ukita');
    const seatO = camp(rt, OTANI.x, OTANI.z, 'otani', { w: 12, d: 10 });
    // 笹尾山の麓の柵（石田の陣の前の柵。口を一つ空け、左近の兵がそこを守る）。柵は抜けられない（越えるのは口から）
    F.fence = wallLine(rt, FENCE, { team: 1, hp: 900, gaps: [5, 6], name: '柵' });
    for (const [x, z, f] of [[SASAO.x + 14, SASAO.z + 10, 'ishida'], [SAKON.x - 6, SAKON.z - 10, 'ishida'], [KONISHI.x + 8, KONISHI.z + 6, 'konishi'], [UKITA_F.x - 10, UKITA_F.z + 8, 'ukita'], [UKITA_H.x + 18, UKITA_H.z - 8, 'ukita'],
      [FUKU.x + 8, FUKU.z + 14, 'mizuno'], [-230, -18, 'kanamori'], [KATO_P.x + 6, KATO_P.z + 8, 'sagarifuji'], [START.x - 8, START.z + 6, 'ii'], [KURODA.x + 4, KURODA.z + 8, 'kuroda'], [HOSOKAWA.x, HOSOKAWA.z + 8, 'kuyo'], [TODO_P.x + 6, TODO_P.z + 8, 'todo'],
      [OTANI.x + 10, OTANI.z - 8, 'otani'], [MATSUO.x + 10, MATSUO.z - 10, KOBA.flag], [WAKI_P.x + 6, WAKI_P.z - 6, 'wakisaka'], [IEYASU0.x - 8, IEYASU0.z - 6, 'onri'], [IEYASU0.x + 14, IEYASU0.z + 8, 'tokugawa'], [HONDA.x + 4, HONDA.z + 6, 'honda']]) rt.scene.add(nobori(W, x, z, f));
    // ---- 兵：戦う所の兵は本物。各家の陣跡に、その家の旗と具足で置く ----
    // 東軍：井伊・松平（主人公が付く。鉄砲衆を引き連れる）・福島・家康の本陣（桃配山）・本多・藤堂と京極・加藤と田中
    // 11/9 重さ：始まりの本物の兵が 296 で枠（250）を大きく越えたので、名の無い兵を少し減らした（厚みは遠くの大軍で見せる）
    F.ii = ally(rt, '井伊直政の手', { x: START.x - 4, z: START.z - 6 }, [
      { type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '松平忠吉', invuln: true, horse: true, flag: 'tokugawa', armor: TK } },
      { type: 'samurai', n: 8 }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 9 }], II, { fullStrength: true, formation: 'yari' });
    F.iiGun = ally(rt, '井伊の鉄砲衆', { x: START.x + 2, z: START.z + 6 }, [{ type: 'gun', n: 14 }], II, { fullStrength: true, width: 16, aggro: 10, seekRange: 12 });
    F.fuku = ally(rt, '福島正則の隊', FUKU, [
      { type: 'busho', n: 1, o: { name: '福島正則', invuln: true, horse: true } }, { type: 'samurai', n: 1, o: { name: '可児才蔵', invuln: true, horse: false } },
      { type: 'samurai', n: 7 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 16 }], FUKUSHIMA, { fullStrength: true, order: 'hold', formation: 'yari', width: 20, facing: -Math.PI / 2 });
    F.ieyasu = ally(rt, '徳川家康の本陣', seatI, [
      { type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: false } }, { type: 'samurai', n: 8 }, { type: 'gun', n: 3 }], TOKU, { fullStrength: true, order: 'hold', aggro: 6, seekRange: 10, facing: -Math.PI / 2 - 0.4, width: 8 });   // 旗本の侍に囲まれ床几に座る（O・AR3）
    F.ieyasuU = SEAT(F.ieyasu, '徳川家康');
    if (F.ieyasuU) F.uma = umaFollow(W, rt.scene, F.ieyasuU, 'ogi');
    // 本陣が陣場野へ進んだ後も、桃配山の幕には留守の旗本が残る（人のいない幕を作らない）
    F.rusu = ally(rt, '桃配山の留守', { x: IEYASU0.x + 4, z: IEYASU0.z + 2 }, [{ type: 'samurai', n: 3 }], TOKU, { order: 'hold', aggro: 4, seekRange: 6, width: 6 });
    // 振り返れば見える後ろの諸隊（中ほどの二の備え）：金森長近、加藤嘉明。旗を立てて槍衾で構え、③の後に前へ出る
    F.kanamori = ally(rt, '金森長近の隊', { x: -236, z: -26 }, [{ type: 'busho', n: 1, o: { name: '金森長近', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 8 }], { flag: 'kanamori', armor: TK }, { order: 'hold', formation: 'yari', width: 14, aggro: 10 });
    F.kato = ally(rt, '加藤嘉明の隊', KATO_P, [{ type: 'busho', n: 1, o: { name: '加藤嘉明', invuln: true, horse: true } }, { type: 'samurai', n: 2 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 8 }], KATO, { order: 'hold', formation: 'yari', width: 14, aggro: 10 });
    F.honda = ally(rt, '本多忠勝の隊', HONDA, [{ type: 'busho', n: 1, o: { name: '本多忠勝', invuln: true, horse: true, flag: 'honda' } }, { type: 'cavalry', n: 3 }], { flag: 'honda', armor: TK }, { order: 'hold', aggro: 8 });
    F.todo = ally(rt, '藤堂高虎・京極高知の隊', TODO_P, [{ type: 'busho', n: 1, o: { name: '藤堂高虎', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '京極高知', invuln: true, horse: true, flag: 'kyogoku' } },
      { type: 'gun', n: 2 }, { type: 'ashigaru', n: 5 }], TODO, { facing: Math.PI * 0.7, aggro: 20, seekRange: 30 });
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: START.x + 2, z: START.z + 4 }, -Math.PI / 2, [{ kind: 'spear', n: Math.min(10, n) }]);
    // 西軍：天満山の宇喜多（奥の本陣と明石の先手）・北天満山の小西・笹尾山の石田・山中の大谷と平塚・戸田・松尾山の小早川と麓の四家。島津は退き口まで出さない
    F.hide = foe(rt, '宇喜多秀家の本陣', seatU, [{ type: 'busho', n: 1, o: { name: '宇喜多秀家', invuln: true, horse: false } }, { type: 'samurai', n: 5 }], UKITA, { order: 'hold', aggro: 0, seekRange: 0, width: 5, noRout: true, facing: Math.PI / 2 });
    SEAT(F.hide, '宇喜多秀家');
    // 11/8 critic60（一2）：一万七千の総大将の守りに見えるよう、旗本を厚く
    F.hideG = foe(rt, '宇喜多の旗本', { x: UKITA_H.x + 16, z: UKITA_H.z + 2 }, [{ type: 'samurai', n: 12 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 5 }], UKITA, { order: 'hold', aggro: 10, seekRange: 14, width: 14, noRout: true, formation: 'yari' });   // 本陣の幕の前を固める
    // 宇喜多の先手（明石全登）。霧の中、はじめから福島の前に槍衾を組んで構える。手傷の退場を止め、明石は先手と共に退く。
    F.akashi = foe(rt, '明石全登の隊', UKITA_F, [{ type: 'busho', n: 1, o: { name: '明石全登', horse: true, invuln: true, mustLive: true, onWound: () => {} } }, { type: 'samurai', n: 6 }, { type: 'bow', n: 4 }, { type: 'ashigaru', n: 16 }], UKITA, { morale: 90, width: 22, noRout: true, order: 'hold', aggro: 10, seekRange: 14, formation: 'yari' });
    F.akaGun = foe(rt, '宇喜多の先手の鉄砲', { x: UKITA_F.x + 6, z: UKITA_F.z - 4 }, [{ type: 'gun', n: 6 }], UKITA, { order: 'hold', aggro: 16, seekRange: 20, width: 14 });
    F.akashiU = F.akashi.leader;
    F.konishi = foe(rt, '小西行長の隊', KONISHI, [{ type: 'busho', n: 1, o: { name: '小西行長', mustLive: true, horse: true } }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 6 }], KONI, { order: 'hold', aggro: 10, seekRange: 14, formation: 'yari' });
    F.mitsu = foe(rt, '石田三成の本陣', seatM, [{ type: 'busho', n: 1, o: { name: '石田三成', invuln: true, horse: false } }, { type: 'samurai', n: 4 }], ISHIDA, { order: 'hold', aggro: 0, seekRange: 0, width: 5, noRout: true, facing: Math.PI / 2 });
    F.mitsuU = SEAT(F.mitsu, '石田三成');
    // 大谷吉継：病の吉継は四方輿に乗る（馬に乗らない）。藤川台の本陣で輿の床に座り、前で平塚為広・戸田勝成が藤堂・京極と押し合う
    F.koshi = shihoKoshi(W, seatO.x, seatO.z, 0); rt.scene.add(F.koshi);
    F.otaniH = foe(rt, '大谷吉継の本陣', seatO, [{ type: 'busho', n: 1, o: { name: '大谷吉継', invuln: true, horse: false } }, { type: 'samurai', n: 4 }], OTANI_LK, { order: 'hold', aggro: 0, seekRange: 0, noRout: true, width: 5, facing: Math.PI * 0.3 });
    F.otaniU = SEAT(F.otaniH, '大谷吉継');
    // 二将の最期は寝返りの台本で扱う。共通の手傷による退場・討取りで、寝返り前の持ち場を省かない。
    F.otani = foe(rt, '平塚為広・戸田勝成の隊', HIRA, [{ type: 'busho', n: 1, o: { name: '平塚為広', invuln: true, mustLive: true, onWound: () => {}, horse: true } }, { type: 'busho', n: 1, o: { name: '戸田勝成', invuln: true, mustLive: true, onWound: () => {}, horse: true } },
      { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], OTANI_LK, { order: 'hold', aggro: 12, seekRange: 16, noRout: true, facing: -Math.PI * 0.3 });
    for (const g of [F.todo, F.otani]) { g.dmgMult = 0.35; g.defMult = 1.4; }   // 藤堂・京極と平塚・戸田は朝から押し合う（寝返りまで決着しない）
    F.kobaE = foe(rt, '小早川秀秋の隊', MATSUO, [{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '平岡頼勝', invuln: true, horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 4 }], KOBA, { order: 'hold', aggro: 0, seekRange: 0, facing: -Math.PI * 0.8, noRout: true, formation: 'yari' });
    F.wakiE = foe(rt, '脇坂安治らの隊', WAKI_P, [{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'ashigaru', n: 5 }], WAKI, { order: 'hold', aggro: 0, seekRange: 0, facing: -Math.PI * 0.7, noRout: true, formation: 'yari' });
    for (const g of [F.kobaE, F.wakiE, F.hide, F.mitsu, F.otaniH]) g.noFrontline = true;
    jindate.install(rt, { UKITA_H, UKITA_F, KONISHI, SASAO, SAKON, KURODA, HOSOKAWA, KATO_P, IEYASU0, IEYASU1, HONDA, TODO_P, MATSUO, WAKI_P, OTANI, HIRA, FUKU, START, HOLD5, SHIMAZU });
    // 戦の前の会話（霧の中の対陣）
    rt.after(0.5, () => rt.say('井伊直政', '霧が深い。先陣は福島殿と決まっておるが……徳川の手で口火を切らねば、この戦は豊臣の家の戦で終わる', 5));
    rt.after(6, () => rt.say('松平忠吉', '物見と申して、福島の脇を抜けましょう。鉄砲衆も連れてゆく', 3.5));
    rt.after(10, () => rt.say(nm(rt), '豊臣の世を見届けた槍、今日は徳川の先で振るいます', 3.5));
    rt.after(13.5, () => this.stage1(rt));
  },

  // ① 霧の中、福島隊の脇を抜けて宇喜多の先手の前へ（抜け駆け）。井伊の手と鉄砲衆が主人公と同じ道を進む
  stage1(rt) {
    const F = rt.flags;
    F.step = 1; F.s1t = rt.t;
    rt.obj('main', G[0], 'main');
    goTo(F.ii, { x: NUKE.x + 6, z: NUKE.z - 8 });
    goTo(F.iiGun, { x: NUKE.x, z: NUKE.z + 2 });
    // 11/8 critic60（二3・一5）：咎めは時刻でなく、主人公と井伊の手が福島の隊の脇へ来た時に（先に駆け抜けても聞こえる所で）
    F.kaniWait = true;
  },
  // ② 井伊の鉄砲衆が宇喜多の先手へ撃ちかける（挑発）。主人公は鉄砲衆の脇で槍を立てて守る
  stage2(rt) {
    const F = rt.flags;
    if (F.step >= 2) return;
    F.step = 2; F.s2t = rt.t; F.vol = 0;
    rt.objDone('main');
    rt.award((t) => t.side.push('井伊・松平の抜け駆けに加わった'), '抜け駆けに加わった');
    rt.obj('main', G[1], 'main');
    F.iiGun.order = 'attack'; F.iiGun.aggro = 50; F.iiGun.seekRange = 50; F.iiGun.anchor = { ...NUKE };
    rt.say('井伊直政', '鉄砲衆、前へ。宇喜多の先手へ撃ちかけよ！', 3);
    // 鉄砲衆が三度撃ちかける（六秒おき）。撃つたびに先手が揺らぎ、宇喜多の鉄砲が撃ち返す
    const shot = () => {
      if (F.step !== 2 || F.ending) return;
      F.vol++;
      rt.army.play('volley', { x: NUKE.x - 4, z: NUKE.z + 2 }, 1.6);
      if (alive(F.akashi)) F.akashi.morale = Math.max(40, F.akashi.morale - 6);
      if (F.vol === 1) { sfx('horagai', 1); rt.banner('関ヶ原の戦い　開戦'); rt.say('井伊直政', '放てっ！　徳川の戦の始まりじゃ！', 3); }
      if (F.vol === 2) { rt.army.play('volley', { x: UKITA_F.x + 6, z: UKITA_F.z - 4 }, 1.2); rt.say('明石全登', '抜け駆けの鉄砲か。撃ち返せ！', 3); }   // 先手の鉄砲は構えた所から撃ち返す（打って出ない）
      if (F.vol < 3) rt.after(6.5, shot);
    };
    rt.after(1.5, shot);
  },
  // ③ 井伊の手が一旦退く。抜け駆けに怒った福島正則が宇喜多の先手へ突っ込む
  stage3(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.s3t = rt.t;
    rt.objDone('main');
    rt.obj('main', G[2], 'main');
    rt.say('井伊直政', '口火は切った。退け、福島殿に道を空けよ！', 3);
    goTo(F.ii, { x: BACK.x + 4, z: BACK.z - 10 });
    goTo(F.iiGun, { x: BACK.x + 6, z: BACK.z + 4 });
    rt.after(3.5, () => rt.say('福島正則', '抜け駆けされたか！　ええい、福島の者ども、宇喜多へかかれぇっ！', 3.5));
    rt.after(5, () => {
      goAttack(F.fuku, { x: UKITA_F.x + 18, z: UKITA_F.z + 6 }, 40, 60);
      F.akashi.order = 'attack'; F.akashi.aggro = 40; F.akashi.seekRange = 60;
    });
    rt.after(30, () => goAttack(F.todo, HIRA, 30, 40));
  },
  // ④ 福島に続いて藤下で宇喜多の先手と槍を合わせる
  stage4(rt) {
    const F = rt.flags;
    if (F.step >= 4) return;
    F.step = 4; F.s4t = rt.t; F.joined4 = false; F.fought4 = 0;
    rt.objDone('main');
    rt.obj('main', G[3], 'main');
    room(rt, 18);
    F.ukita2 = foe(rt, '宇喜多の二番手', { x: UKITA_F.x - 8, z: UKITA_F.z + 26 }, [{ type: 'samurai', n: 3 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 12 }], UKITA, { formation: 'yari' });
    goAttack(F.ukita2, { x: FUKU.x - 20, z: FUKU.z });
    F.akaN = nOf(F.akashi, F.akaGun, F.ukita2);
    goAttack(F.ii, { x: UKITA_F.x + 18, z: UKITA_F.z - 14 }, 40, 50);
    goAttack(F.iiGun, { x: UKITA_F.x + 30, z: UKITA_F.z - 16 }, 40, 50);
    rt.marker('foe', () => (F.akashi.leader?.alive ? F.akashi.leader.pos : F.akashi.center()), '明石全登', { red: true, group: F.akashi });
    rt.say('井伊直政', '福島殿が当たった。我らも横から押せ！', 3);
    rt.after(8, () => rt.say('明石全登', '宇喜多の槍は一万七千。押し返せ、福島を川まで追え！', 3.5));
  },
  // ⑤ 宇喜多は数が多く正面に強い。福島隊が押し返される中、そばで持ちこたえる（11/9 kaito：前半は東軍が押し切れない）
  stage5(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.s5t = rt.t; F.held5 = 0;
    rt.objDone('main'); rt.obj('main', G[4], 'main');
    rt.say('福島正則', '押せ押せ！　宇喜多を天満山へ追い返せ！', 3);
    // 宇喜多の本隊から新手が出て、福島隊を押し返す（明石の先手は崩れない）
    room(rt, 34);
    F.ukita3 = foe(rt, '宇喜多の本隊', { x: UKITA_H.x + 50, z: UKITA_H.z + 6 }, [{ type: 'samurai', n: 5 }, { type: 'gun', n: 6 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 14 }], UKITA, { morale: 95, noRout: true });
    goAttack(F.ukita3, { x: FUKU.x - 30, z: FUKU.z + 4 });
    for (const g of [F.akashi, F.ukita2, F.ukita3]) if (alive(g)) { g.noRout = true; g.morale = 100; }
    if (alive(F.fuku)) { F.fuku.dmgMult = 0.5; goTo(F.fuku, { x: FUKU.x - 8, z: FUKU.z + 2 }); }   // 福島隊は押し戻される
    rt.after(3, () => rt.say('使番', '天満山から宇喜多の新手！', 3));
    rt.after(12, () => rt.say('使番', '宇喜多勢、崩れませぬ！', 3));
    rt.after(26, () => rt.say('使番', '黒田・細川の手、石田の大筒に押されております！　島左近が打って出た由！', 4));
    rt.after(40, () => rt.say('使番', '南宮山の毛利勢、なお動かず！', 3));
  },
  // ⑥ 福島隊が持ち直す。主人公は中央右翼（藤堂・京極）の救援へ回る。左に石田、右に大谷、山に小早川が見える道
  stage6(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.s6t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('宇喜多の押し返しを持ちこたえた'), '宇喜多の押し返しを持ちこたえた');
    rt.say('福島正則', 'まだまだ！　福島の槍、退きはせぬぞ！', 3);
    if (alive(F.fuku)) { F.fuku.dmgMult = 1; goAttack(F.fuku, { x: UKITA_F.x + 14, z: UKITA_F.z + 4 }, 30, 40); }
    // 宇喜多の先手はその場で踏みとどまる（崩れるのは寝返りの後）
    for (const g of [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4]) if (alive(g)) { goTo(g, { x: UKITA_F.x - 6, z: UKITA_F.z + 4 }); g.aggro = 10; g.seekRange = 14; }
    rt.after(2, () => rt.say('使番', '藤堂・京極の手、大谷勢に押されております！　右へ回られよ！', 3.5));
    rt.obj('main', G[5], 'main');
    goTo(F.ii, { x: TODO_P.x - 16, z: TODO_P.z - 10 });
    goTo(F.iiGun, { x: TODO_P.x - 8, z: TODO_P.z - 18 });
    // 家康の本陣にも焦り：床几から立つ（中盤）
    if (F.ieyasuU) F.ieyasuU._k06Stand = true;
    rt.after(10, () => rt.say('使番', '殿、床几からお立ちになりました！', 3));
  },
  // ⑦ 膠着：藤堂・京極の脇で、平塚・戸田（大谷隊）の前進を止める。松尾山の小早川はまだ動かない
  stage7(rt) {
    const F = rt.flags;
    if (F.step >= 7) return;
    F.step = 7; F.s7t = rt.t; F.held7 = 0;
    rt.objDone('main'); rt.obj('main', G[6], 'main');
    room(rt, 36);
    F.otaW1 = foe(rt, '大谷吉治の隊', { x: HIRA.x - 16, z: HIRA.z + 14 }, [{ type: 'busho', n: 1, o: { name: '大谷吉治', horse: true, invuln: true, mustLive: true, onWound: () => {} } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 12 }], OTANI_LK, { morale: 100, noRout: true, formation: 'yari' });
    goAttack(F.otaW1, { x: RLINE.x - 6, z: RLINE.z + 4 }, 30, 40);
    goAttack(F.otani, { x: RLINE.x - 10, z: RLINE.z - 6 }, 24, 30);
    goAttack(F.todo, { x: RLINE.x + 6, z: RLINE.z + 2 }, 24, 30);
    goAttack(F.ii, { x: RLINE.x + 4, z: RLINE.z - 10 }, 24, 30);
    goAttack(F.iiGun, { x: RLINE.x + 16, z: RLINE.z - 12 }, 24, 30);
    for (const g of [F.otani, F.otaW1]) { g.dmgMult = 0.6; g.defMult = 1.4; }
    rt.marker('foe', () => (F.otani.leader?.alive ? F.otani.leader.pos : F.otani.center()), '平塚為広', { red: true, group: F.otani });
    // 膠着の使番が次々。味方は何度も松尾山を見上げる
    rt.after(3, () => rt.say('平塚為広', '刑部さまの陣へは一歩も寄せさせぬ！', 3));
    rt.after(12, () => rt.say('藤堂高虎', '小早川は何をしている……', 3));
    rt.after(22, () => rt.say('使番', '福島勢、宇喜多となお交戦！', 3));
    rt.after(32, () => rt.say('使番', '石田隊、なお健在！', 3));
    rt.after(44, () => rt.say('京極高知', '松尾山の旗……動かぬな', 3));
    rt.after(56, () => rt.say('使番', '大谷勢、退きませぬ！　このままでは右が破られまする！', 3.5));
    rt.after(68, () => rt.say('使番', '毛利勢、南宮山からなお動かず！', 3));
  },
  // ⑧ 小早川の寝返り（いきなり字幕にしない）：山上の旗が動き出す→どちらへ来るか分からない→大谷の方へ→接触→確定→周りも連鎖
  stage8(rt) {
    const F = rt.flags;
    if (F.step >= 8) return;
    F.step = 8; F.s8t = rt.t;
    // 下山の向きが定まるまでは、大谷隊の前進を止める任務を続ける。
    // 次の任務は寝返りの確定時に出すので、先に済みにすると三十三秒間主目標が空く。
    rt.unmark('foe');
    rt.award((t) => t.side.push('大谷隊の前進を止めた'), '大谷隊の前進を止めた');
    // 問鉄砲（一説）：断定しない。家康の方から松尾山の方へ鉄砲の音
    rt.army.play('volley', { x: MATSUO.x + 60, z: MATSUO.z - 120 }, 1.2);
    rt.after(1.5, () => rt.say('藤堂高虎', '本陣の方から鉄砲……催促の鉄砲か？', 3));
    rt.after(7, () => this.flip(rt));
    // 小早川が動くと本陣全体が動く：家康は桃配山から陣場野へ歩いて進み、着いたら幕を張る（遠い道を島津の前に歩き終える）
    rt.after(10, () => rt.say('使番', '殿が本陣を陣場野へ進められる！', 3));
    this.advanceHonjin(rt);
  },
  advanceHonjin(rt) {
    const F = rt.flags, g = F.ieyasu;
    if (!alive(g) || F.jinba || F.honjinMoving) return;
    F.honjinMoving = true;
    // 歩く時間を確保し、旗本が遠い敵へ寄り道しない。家康も隊列の中心を歩く。
    g.order = 'move'; g.dest = { x: IEYASU1.x, z: IEYASU1.z - 5.4 };
    g.formation = 'ring'; g.speed = 4.6; g.aggro = 0; g.seekRange = 0;
    g.keepMoveOrder = true; g.arriveNoncombat = true; g.arriveRadius = 5;
    const arrive = (q) => {
      if (F.jinba) return;
      const u = F.ieyasuU;
      // 旗本だけ先着しても家康を飛ばさない。床几のそばまで歩いてから座る。
      if (u?.alive && !u.gone && !near(u.pos, q.dest, 5)) { q.onArrive = arrive; return; }
      q.order = 'hold'; q.onArrive = null; q.aggro = 6; q.seekRange = 10;
      if (u?.alive && !u.gone) {
        u._k06Seat = { ...u.pos }; u._k06Stand = false; sit(u);
      }
      F.jinba = true;
      rt.scene.add(jinCamp(rt.world, IEYASU1.x, IEYASU1.z - 2, { mon: 'tokugawa', people: false, fire: false, noUma: true }));
      rt.scene.add(nobori(rt.world, IEYASU1.x - 10, IEYASU1.z - 10, 'onri', 7));
    };
    g.onArrive = arrive;
  },
  flip(rt) {
    const F = rt.flags;
    if (F.flipT || F.ending) return;
    F.flipT = rt.t;
    // 山の上の一万五千が動き出す（jindate.flip：はじめは北の野へ。どちらへ来るか分からない）
    rt.army.play('eshout', { x: MATSUO.x, z: MATSUO.z - 60 }, 2.5);
    rt.say('京極高知', '松尾山の旗が動いた！', 3);
    rt.after(6, () => rt.say(nm(rt), '……こちらへ攻め下ってくるのか？', 3));
    rt.after(12, () => rt.say('藤堂高虎', '備えよ、槍を揃えよ！', 2.5));
    rt.after(20, () => rt.say('使番', '小早川勢、大谷へ向かっております！', 3.5));
    rt.after(26, () => {
      if (F.ending) return;
      F.turned = true;
      turnover(rt, F.kobaE);
      room(rt, 14);
      F.kobaG = ally(rt, '小早川秀秋の兵', { x: OTANI.x + 60, z: OTANI.z + 50 }, [{ type: 'busho', n: 1, o: { name: '平岡頼勝', invuln: true, horse: true } }, { type: 'samurai', n: 3 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 8 }], KOBA, { facing: -Math.PI * 0.8, aggro: 40, seekRange: 60 });
      goAttack(F.kobaG, HIRA);
      rt.objDone('main');
      rt.obj('main', G[7], 'main');
      rt.banner('小早川勢、寝返り');
      for (const g of [F.akashi, F.konishi, F.otani, F.otaW1, F.hideG]) if (alive(g)) g.morale -= 12;
      // 大谷吉継は寝返りに備えていた：隊を返して小早川を一度押し返す
      if (alive(F.otaW1)) goAttack(F.otaW1, { x: OTANI.x + 64, z: OTANI.z + 40 }, 40, 50);
      rt.marker('foe', () => (F.otani.leader?.alive ? F.otani.leader.pos : F.otani.center()), '平塚為広', { red: true, group: F.otani });
    });
    rt.after(32, () => rt.say('大谷吉継', '金吾め、やはり裏切ったか……。備えはしてある。押し返せ！', 4));
    rt.after(44, () => rt.say('使番', '大谷勢、小早川を押し返しております！', 3));
    // 麓の四家が数十秒かけて一つずつ離反する（一斉の大演出にしない）
    rt.after(56, () => { F.wakiT = rt.t; rt.say('使番', '脇坂安治も東軍に付いた！', 3); turnover(rt, F.wakiE); room(rt, 8);
      F.wakiG = ally(rt, '脇坂安治らの兵', WAKI_P, [{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'ashigaru', n: 5 }], WAKI, { facing: -Math.PI * 0.7, aggro: 40, seekRange: 60 });
      goAttack(F.wakiG, HIRA); if (alive(F.otani)) F.otani.morale -= 20; });
    rt.after(66, () => rt.say('使番', '朽木・小川も寝返りましたぞ！', 3));
    rt.after(76, () => rt.say('使番', '赤座勢も大谷へかかる！', 3));
  },
  // 大谷隊の崩れ：吉継は陣中で自害、平塚・戸田は討ち死に。旗が倒れ、小西・宇喜多の脇が空く
  otaniFall(rt) {
    const F = rt.flags;
    if (F.otaniDown) return;
    F.otaniDown = rt.t;
    rt.banner('大谷勢、崩壊');
    rt.say('使番', '大谷勢、崩れました！', 3);
    rt.after(3, () => rt.say('使番', '刑部殿、陣中にて自害の由！', 3));
    for (const u of F.otani?.units || []) if (u.alive && !u.gone && u.type === 'busho') { u.invuln = false; u.hp = 0; rt.army.kill(u, null); }
    rout(F.otani); rout(F.otaniH); rout(F.otaW1); rout(F.otaW2);
    if (F.otaniU?.alive && !F.otaniU.gone) { F.otaniU.invuln = false; F.otaniU.hp = 0; rt.army.kill(F.otaniU, null); }
    this.stage9(rt);
  },
  // ⑨ 西軍中央を突破：宇喜多・小西が左右から押される。宇喜多の殿を押し破る（秀家は討たせず、旗と伝令と敗走で見せる）
  stage9(rt) {
    const F = rt.flags;
    if (F.step >= 9) return;
    F.step = 9; F.s9t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('小早川の寝返りを見届け、大谷隊を崩した'), '大谷隊を崩した');
    rt.obj('main', G[8], 'main');
    rt.after(4, () => rt.say('使番', '小西勢が危うい！　宇喜多の脇が空きましたぞ！', 3.5));
    room(rt, 40);
    for (const g of [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4]) rout(g);
    F.shingari = foe(rt, '宇喜多の殿', CENTER9, [{ type: 'samurai', n: 6 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 12 }], UKITA, { morale: 80, aggro: 24, seekRange: 30, formation: 'yari', width: 16 });
    F.koniR = foe(rt, '小西の後備', { x: CENTER9.x - 12, z: CENTER9.z - 40 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }], KONI, { morale: 70, aggro: 20, seekRange: 26 });
    F.c9N = nOf(F.shingari, F.koniR);
    for (const g of [F.fuku, F.todo, F.ii, F.iiGun, F.kobaG, F.wakiG]) if (alive(g)) goAttack(g, { x: CENTER9.x + (g === F.fuku ? 8 : 0), z: CENTER9.z + (g === F.kobaG || g === F.wakiG ? 30 : 0) }, 30, 40);
    rt.marker('foe', () => F.shingari.center(), '宇喜多の殿', { red: true, group: F.shingari });
    rt.after(6, () => rt.say('徳川家康', '今ぞ！　皆かかれ！', 3));
    rt.after(14, () => rt.say('島左近', 'まだじゃ……石田の陣、一歩も退くな！', 3));
  },
  // 宇喜多・石田の退却（秀家・三成は討たせず逃がす）→ ⑩ 島津の退き口
  westFall(rt, immediate = false) {
    const F = rt.flags;
    if (F.westDown) return;
    F.westDown = rt.t;
    rout(F.shingari); rout(F.koniR); rout(F.konishi);
    rt.say('宇喜多秀家', '金吾めっ……！　刺し違えてくれる！', 3);
    const hideLeaves = () => { rt.say('宇喜多の近習', '殿、なりませぬ！　ここは落ちのびられませ！', 3); if (F.hide?.leader?.alive) rt.army.despawn(F.hide.leader); rout(F.hide); rout(F.hideG); };
    const mitsuLeaves = () => {
      rt.say('使番', '治部少輔（三成）、伊吹山の方へ落ちた！', 3.5);
      if (F.mitsuU?.alive && !F.mitsuU.gone) rt.army.despawn(F.mitsuU);
      rout(F.mitsu);
    };
    // 途中再開では済んだ退却をその場で戻す。島津の目標だけを作ると、本陣に総大将が復活してしまう。
    if (immediate) { hideLeaves(); mitsuLeaves(); this.stage10(rt); }
    else { rt.after(3, hideLeaves); rt.after(7, mitsuLeaves); rt.after(9, () => this.stage10(rt)); }
  },
  // ⑩ 島津の退き口。朝から奥の林に構えていた島津の隊が、家康の本陣の前を突き抜ける
  stage10(rt) {
    const F = rt.flags;
    if (F.step >= 10) return;
    F.step = 10; F.s10t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('西軍の中央を押し破った'), '西軍の中央を押し破った');
    rt.obj('main', G[9], 'main');   // 目標はすぐ出す（空く間があると全部済んだ扱いで閉じる）
    // 途中再開でも本陣は歩いて進める。未着の隊をその場で移さない。
    this.advanceHonjin(rt);
    for (const g of [F.kanamori, F.otani, F.otaniH, F.otaW1, F.kobaG, F.wakiG, F.akashi, F.ukita2, F.ukita3, F.ukita4, F.mitsu, F.todo, F.hide, F.hideG, F.konishi, F.shingari, F.koniR, F.fuku]) KIT.markRecyclable(g);
    // 本陣の前で待ち受ける（遠くへ追って出ない）
    goAttack(F.ii, { x: HOLD5.x + 8, z: HOLD5.z - 26 }, 10, 12);
    goAttack(F.iiGun, { x: HOLD5.x + 24, z: HOLD5.z - 34 }, 20, 20);
    goAttack(F.honda, { x: HOLD5.x + 14, z: HOLD5.z + 8 }, 10, 12);
    // 島津の通り道の脇にいる金森・加藤の手は道を空ける（11/8 流し：金森の手と組み合い、島津が陣場野の百十歩手前で五分止まった）
    for (const g of [F.kanamori, F.kato]) if (alive(g)) { goTo(g, { x: -246, z: 14 }); g.aggro = 0; g.seekRange = 0; }
    rt.after(4, () => {
      sfx('horagai', 1);
      rt.say('島津義弘', '退くは前じゃ。家康の本陣の前を突き抜けよ！', 4);
      room(rt, 40);
      // 島津の隊はここで初めて林の陰から出る（朝から一日、陣を動かなかった）
      // 11/8：林の陰から野へ出た所で現す（林の奥から歩かせると、本陣の前に来るまでに三分かかった）
      // 義弘は退き口の下知で脱出する。共通の手傷退場で一人だけ先に消えないようにする。
      F.shima = foe(rt, '島津義弘の隊', { x: SHIMAZU.x + 106, z: SHIMAZU.z + 32 }, [{ type: 'busho', n: 1, o: { name: '島津義弘', invuln: true, mustLive: true, onWound: () => {}, horse: true } }, { type: 'busho', n: 1, o: { name: '島津豊久', horse: true } },
        { type: 'samurai', n: 6 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 14 }], SHIMA, { order: 'move', aggro: 10, seekRange: 12, morale: 100, noRout: true, width: 10 });
      F.shiN = F.shima.count; F.shiK = 0;
      F.shima.speed = 4.6;   // 11/8 流し：歩みが遅く（一秒に一歩足らず）、本陣の前に来るまで四分かかっていた。駆け抜ける速さに
      // 11/8 critic60（九2・三2）：道の途中で主人公とぶつかって減り切り、陣場野へ来ないまま勝っていた。本陣の前に着くまでは討たれにくい
      F.shima.defMult = 6;
      // 倍率だけでは主人公の一撃や鉄砲で尽きる。本陣へ着くまでは旗本が守る。
      for (const u of F.shima.units) u.campProtected = true;
      F.shiI = 0;   // 野へ出た所から（道の一つ目は林の出口なので飛ばす）
      this.shimaStep(rt);
      rt.marker('foe', () => (F.shima.leader?.alive ? F.shima.leader.pos : F.shima.center()), '島津義弘', { red: true, group: F.shima });
      rt.after(5, () => rt.say('福島の兵', '島津が来る！', 2.5));
      rt.after(9, () => rt.say(nm(rt), '敗走しているはずなのに……こっちに来る！', 3));
      rt.after(16, () => rt.say('本多忠勝', '島津の捨て奸じゃ。殿の陣へは一歩も入れるな！', 3.5));
    });
  },
  shimaStep(rt) {
    const F = rt.flags, g = F.shima;
    // 到着前に予約した次の移動も、受け合いを始めた後には進めない。
    if (!alive(g) || F.shiAt || F.ending) return;
    F.shiI = (F.shiI ?? -1) + 1;
    const q = SHIMA_PATH[Math.min(F.shiI, SHIMA_PATH.length - 1)];
    // 本陣の前（三つ目）で押し合い、捨て奸を残して伊勢路へ抜ける
    if (F.shiI === 2 && !F.shiAt) { g.order = 'move'; g.dest = { ...q }; g.aggro = 0; g.seekRange = 0; g.onArrive = null; return; }   // 本陣の前で押し合う（update が近づいたのを見て始める）
    g.order = 'move'; g.dest = { ...q }; g.aggro = 0; g.seekRange = 0;   // 駆け抜ける間は足を止めて戦わない（本陣の前だけで押し合う）
    g.onArrive = () => { rt.after(0.5, () => this.shimaStep(rt)); };
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.won = true;
    rt.unmark('foe');
    rt.player.u.invuln = true;
    if (alive(F.shima)) { F.shima.order = 'move'; F.shima.dest = { ...SHIMA_PATH[SHIMA_PATH.length - 1] }; F.shima.onArrive = null; F.shima.aggro = 0; }
    for (const g of rt.army.groups) if (g.team === 1 && g !== F.shima) rout(g);
    // 11/8 kaito：すぐ札へ行かず、霧の晴れた野の余韻と首実検の支度を二十秒（k06/yoin.js が締めの finish を呼ぶ）
    //   主の任務の済みと手柄は締めの直前に（共通の goalsDoneTick が二秒半で勝ちに締め、余韻を切らないように）
    yoin.start(rt, { UKITA_F, SAKON, KONISHI, done: () => {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '関ヶ原で寝返りを目の前で見届け、島津の突入を食い止めた', pts: 60 }; }, '島津の退き口を受けた');
    } });
  },
  update(rt, dt) {
    const F = rt.flags;
    // 総大将は床几に座ったまま（幕の内から出ない）
    for (const u of [F.ieyasuU, F.hide?.leader, F.mitsuU, F.otaniU]) sit(u);
    // 吉継は輿の床に座る（輿は吉継に付く）
    if (F.koshi && F.otaniU?.alive && !F.otaniU.gone) { const u = F.otaniU; F.koshi.position.set(u.pos.x, rt.world.heightAt(u.pos.x, u.pos.z), u.pos.z); F.koshi.rotation.y = u.heading || 0; }
    F.uma?.update(dt);
    this.fog(rt);
    jindate.tick(rt);
    if (F.ending || !F.step) return;
    // 平塚・戸田は藤川台の前を守る。応戦で敵を追っても、笹尾山への道まで出て行かない。
    // 寝返り後の討死・敗走には帰陣の下知を重ねない。
    // ⑦からは藤堂・京極の脇の線まで押し出し、そこで押し合う
    const OA = (F.step || 0) >= 7 ? OTANI_FRONT : HIRA;
    if (!F.turned && alive(F.otani) && F.otani.order !== 'move' &&
      (!near(F.otani.center(), OA, 40) || F.otani.leader?.alive && !near(F.otani.leader.pos, OA, 40))) { if (OA === HIRA) goTo(F.otani, HIRA); else goAttack(F.otani, OA, 24, 30); }
    const P = rt.player.u.pos;
    // 味方の損耗だけで主人公の任務を失敗にしない。討たれた時の扱いは共通のやり直しへ。
    if (F.step === 1) {
      if (F.kaniWait && (near(P, FUKU, 30) || alive(F.ii) && near(F.ii.center(), FUKU, 30) || rt.t - F.s1t > 25)) {
        F.kaniWait = false;
        F.kaniDoneT = rt.t + 11.8;   // 咎めと井伊の返答を聞き終えてから口火を切る
        rt.say('可児才蔵', '待て！　今日の先鋒は福島正則さま。抜け駆けは許さんぞ！', 3.5);   // 咎めたのは福島の先手の可児才蔵（通説）
        rt.after(4.2, () => rt.say('井伊直政', '井伊直政でござる。松平忠吉さまと共に、物見の最中なり', 3.5));
        rt.after(8.2, () => rt.say('井伊直政', '忠吉さまは初陣ゆえ、戦の始まりようを見聞させたいのでござる。通られよ', 3.6));
      }
      // 主人公・赤備え・鉄砲衆が揃ってから撃ちかける。時刻だけでは一人の抜け駆けを済みにしない。
      F.joined1 = near(P, NUKE, 18) ? (F.joined1 || 0) + dt : 0;
      const assembled = alive(F.iiGun) && near(F.iiGun.center(), NUKE, 16) && alive(F.ii) && near(F.ii.center(), NUKE, 24);
      // 道中で隊の一部が詰まっても、本人が先手前で待っていれば口火を切る。
      if (near(P, NUKE, 18) && !F.kaniWait && rt.t >= (F.kaniDoneT || 0) && (assembled || F.joined1 >= 40)) this.stage2(rt);
    } else if (F.step === 2) {
      // 三度撃ちかけ終えて、主人公が鉄砲衆の脇にいれば退く
      if (F.vol >= 3 && rt.t - F.s2t > 16 && near(P, NUKE, 36)) this.stage3(rt);
    } else if (F.step === 3) {
      if (near(P, BACK, 14) && rt.t - F.s3t > 6) this.stage4(rt);
    } else if (F.step === 4) {
      const left = nOf(F.akashi, F.akaGun, F.ukita2);
      F.ek = (F.akaN || 0) - left;
      // 春日神社に残ったまま味方が敵を減らしても、藤下へ続いた目標は済ませない。
      if (near(P, UKITA_F, 55)) { F.joined4 = true; F.fought4 += dt; }
      // 散った残兵だけで止めない。前線で槍を合わせ続ければ宇喜多の反撃へ移る。
      if (F.joined4 && near(P, UKITA_F, 55) && (left <= Math.round(F.akaN * 0.85) || F.fought4 >= 120)) this.stage5(rt);
    } else if (F.step === 5) {
      // 宇喜多は崩れない。福島隊のそばで押し返しを受けた時間だけを数える（討ち減らしの数でなく持ちこたえ）
      if (near(P, UKITA_F, 55)) F.held5 += dt;
      if (!F.wave2b && F.held5 > 28) {
        F.wave2b = true; room(rt, 24);
        F.ukita4 = foe(rt, '宇喜多の二の備', { x: UKITA_F.x - 24, z: UKITA_F.z - 30 }, [{ type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 12 }], UKITA, { morale: 100, noRout: true });
        goAttack(F.ukita4, { x: FUKU.x - 24, z: FUKU.z - 6 });
        rt.say('明石全登', '宇喜多の槍は一万七千。押し返せ、福島を川まで追え！', 3.5);
      }
      if (F.held5 >= HOLD5S) this.stage6(rt);
    } else if (F.step === 6) {
      // 藤堂・京極の隊に本人が加わるまで、時間だけで済ませない。
      if (alive(F.todo) && near(P, F.todo.center(), 26) || near(P, RLINE, 20)) this.stage7(rt);
    } else if (F.step === 7) {
      // 線の近くで大谷隊を受けた時間を数える。寝返りは十分半ごろ（早く着いても、線を支え続ける）
      if (near(P, RLINE, 40)) F.held7 += dt;
      if (!F.otaW2 && F.held7 > 36) {
        room(rt, 20);
        F.otaW2 = foe(rt, '戸田勝成の手', { x: HIRA.x - 10, z: HIRA.z - 20 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 10 }], OTANI_LK, { morale: 100, noRout: true });
        F.otaW2.dmgMult = 0.6;
        goAttack(F.otaW2, { x: RLINE.x - 8, z: RLINE.z - 10 }, 30, 40);
        rt.say('戸田勝成', '大谷の手はまだあるぞ。押せ！', 3);
      }
      if (F.held7 >= HOLD7S && rt.t >= FLIP_MIN_T && near(P, RLINE, 40)) this.stage8(rt);
    } else if (F.step === 8) {
      if (F.turned && !F.n8) F.n8 = Math.max(1, nOf(F.otani, F.otaW1, F.otaW2));
      const since = F.flipT ? rt.t - F.flipT : 0;
      // 桃配山などへ離れたまま、寝返りと大谷の最期を見ずに任務が済むのを防ぐ。
      // 残兵が地形に詰まっても、本人が右翼へ戻れば最長時間の条件で進める。
      // 赤座勢の離反は下山開始から七十六秒。先に兵が減っても、四家が離反する前に大谷を自害させない。
      if (F.turned && near(P, RLINE, 80) && (since >= 80 && nOf(F.otani, F.otaW1, F.otaW2) <= Math.round(F.n8 * 0.5) || since >= FALL_MAX)) this.otaniFall(rt);
    } else if (F.step === 9) {
      const left = nOf(F.shingari, F.koniR);
      F.ek = (F.akaN || 0) + (F.c9N || 0) - left;
      if (near(P, CENTER9, 60) && (left <= Math.round(F.c9N * 0.45) || rt.t - F.s9t > 150)) this.westFall(rt);
    } else if (F.step === 10 && F.shima) {
      const n = nOf(F.shima);
      if (alive(F.shima)) F.shima.morale = 100;   // 島津は退き口の間、崩れて逃げ戻らない（前へ抜けるだけ）
      F.shiK = F.shiN - n;
      // 島津が本陣の前に来て押し合い、主人公がその前に立って受け続ける（島津は勝ち負けに関わらず伊勢路へ抜けていく＝史実）
      const receiving = alive(F.shima) && near(F.shima.center(), HOLD5, 45);
      // 本陣を挟んで遠くに立つだけでは、退き口を受けた事にしない。
      if (receiving && near(P, HOLD5, 40) && F.shima.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.noTarget && near(P, u.pos, 26))) F.shiMet = true;
      // 本陣まで来た島津を受け切った後、残兵が尽きても守備の時計を止めない。
      // 到着前に減っただけでは果たさず、主人公が本陣の前にいる間だけ数える。
      const repelled = !!F.shiAt && (!alive(F.shima) || !F.shima.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.noTarget));
      // 本陣の前に着く前に兵に揉まれて止まったら、少しずつ前へ押し出す（足止めで退き口が来ないまま終わらない）
      if (!F.shiAt && alive(F.shima) && (F.shiChkT = (F.shiChkT || 0) - dt) <= 0) {
        F.shiChkT = 5;
        const c = F.shima.center(), d = F.shima.dest;
        if (F.shiLast && d && dist(c, F.shiLast) < 8) {
          const L = Math.max(1, dist(c, d)), ux = (d.x - c.x) / L, uz = (d.z - c.z) / L;
          for (const u of F.shima.units) if (u.alive && !u.gone) { u.pos.x += ux * 4; u.pos.z += uz * 4; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
        }
        F.shiLast = { x: c.x, z: c.z };
      }
      if (!F.shiAt && receiving) {
        F.shiAt = rt.t; F.shima.defMult = 1; F.shima.order = 'attack'; F.shima.aggro = 30; F.shima.seekRange = 30;
        F.shima.onArrive = null;
      }
      // 主人公が笹尾山から戻る前に味方だけで全滅させると、接触できず任務が止まる。
      // 到着だけでは守りを外さず、主人公が退き口を受けた所から通常の戦いにする。
      if (F.shiAt && F.shiMet && !F.shiEngaged) {
        F.shiEngaged = true;
        for (const u of F.shima.units) u.campProtected = false;
      }
      // 到着後に離れた相手を追うと、受けの時計が止まったままになる。本陣前へ戻してから押し合いを続ける。
      if (F.shiAt && !receiving && alive(F.shima) && F.shima.order !== 'move') {
        F.shima.aggro = 0; F.shima.seekRange = 0;
        goAttack(F.shima, HOLD5, 30, 30);
      }
      // 味方が島津を減らしただけでは果たさない。本陣の前で主人公が受けた時間だけを数える。
      // 主人公の到着が遅れても、受け終えるまでは島津を伊勢路へ進めない。
      if (F.shiAt && F.shiMet && (receiving || repelled) && near(P, HOLD5, 40)) F.shiHeld = (F.shiHeld || 0) + dt;
      // 豊久は義弘を逃がすため残って戦う殿。追った井伊直政は鉄砲で傷を負う（史実）
      if (F.shiMet && !F.toyoSaid) { F.toyoSaid = true; rt.say('島津豊久', '叔父上を落とせ！　ここは豊久が引き受け申す！', 3.5); }
      if ((F.shiHeld || 0) > HOLD_S * 0.6 && !F.iiHurt) {
        F.iiHurt = true;
        rt.say('使番', '井伊さま、島津の鉄砲に撃たれ手負い！', 3);
        if (alive(F.ii)) goTo(F.ii, { x: HOLD5.x + 20, z: HOLD5.z - 30 });
      }
      // 陣場野への移動中に島津を受け終えても、家康・幕・馬印が着く前に首実検へ進めない。
      if (F.jinba && F.shiMet && (receiving || repelled) && (F.shiHeld || 0) >= HOLD_S && near(P, HOLD5, 40)) this.win(rt);
    }
  },

  // 朝霧：はじめは一町先も見えず、しだいに晴れる（霧が晴れて戦が見えてくる）
  fog(rt) {
    const F = rt.flags, f = rt.scene.fog;
    if (!f || !('far' in f)) return;
    const k = rt.t < FOG_T0 ? 1 : Math.max(0, 1 - (rt.t - FOG_T0) / (FOG_T1 - FOG_T0));
    if (k <= 0) { if (F.fogDone) return; F.fogDone = true; }
    if (F.fogFar === undefined) { F.fogNear = f.near; F.fogFar = f.far; }
    f.near = F.fogNear + (8 - F.fogNear) * k;
    f.far = F.fogFar + (150 - F.fogFar) * k;
  },
};

k06_sekigahara.history = '慶長三年（1598）に豊臣秀吉が没すると、五大老の徳川家康と五奉行の石田三成の争いが深まった。慶長五年、家康が会津の上杉景勝を討ちに出た間に三成らが挙兵し、九月十五日の朝、美濃の関ヶ原で東軍およそ七万五千と西軍およそ八万（実際に戦ったのはその半ばほど）がぶつかった。\n'
  + '西軍は笹尾山に石田三成、その南に島津義弘・小西行長、天満山に宇喜多秀家、山中に大谷吉継、松尾山に小早川秀秋が陣を敷き、東軍を包む形をとった。東軍の先陣は福島正則と決まっていたが、霧の中、井伊直政と松平忠吉が鉄砲衆を連れて福島隊の脇を抜け、宇喜多隊へ鉄砲を撃ちかけて戦が始まった。先陣を奪われて怒った福島正則が宇喜多隊へ突きかかった。\n'
  + '福島隊と宇喜多隊は押し合い、黒田長政・細川忠興らは石田隊を攻め、島左近が激しく抗ったが、黒田の鉄砲に撃たれて退いた。家康は本陣を桃配山から陣場野へ進めた。昼ごろ、動かなかった小早川秀秋が東軍に寝返って大谷隊を攻め、脇坂安治・朽木元綱・小川祐忠・赤座直保も続いた。病の大谷吉継は輿に乗って指図し、敗れて自害した。西軍は総崩れとなって三成は伊吹山の方へ落ちた。\n'
  + '島津義弘は一日じゅう陣を動かず、西軍が崩れた後、東軍の中を突っ切って伊勢路へ退いた（島津の退き口）。甥の島津豊久らが捨て奸で討ち死にし、追った井伊直政は鉄砲で傷を負った。戦の後、家康は首実検を行った。\n'
  + '明石全登（掃部）は宇喜多の先手を率いて福島隊を押し返したが、崩れた後は落ちのび、のち大坂の陣でも戦った。\n'
  + '一説：家康が松尾山の小早川の陣へ鉄砲を撃ちかけさせて寝返りを迫ったという話（問鉄砲）は、のちの記録に見える一説で、確かではない。抜け駆けの時に咎めたのを可児才蔵とするのも通説。伝承：家康が勝った後に「勝って兜の緒を締めよ」と言ったという話は言い伝えである。\n'
  + '陣の位置は陣跡の緯度経度を縮めて写し、地形は国土地理院の標高によるが、藤古川の川筋・街道・隊の人数と動き・会話は遊びのための復元である。';
k06_sekigahara.bushou = [{ name: '井伊直政', g: /井伊/ }, { name: '徳川家康', g: /家康/ }, { name: '島左近', g: /左近/ }, { name: '小早川秀秋', g: /小早川|金吾/ }];

// 素直な遊び手：近い敵を突き、いなければ段の行き先へ（③の退く間は戦わずに戻る）
k06_sekigahara.botBrain = (b, inp, { goTo: go, patientStrike }) => {
  const pl = b.player, u = pl.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  const q = b.def.missionPin(b);
  // 持ちこたえる段は線の近くにいる事が大事。遠くの残兵を追わず、線から離れたら戻る。
  const returning = F.step === 5 && !near(u.pos, UKITA_F, 45) || F.step === 7 && !near(u.pos, RLINE, 32) || F.step === 8 && !near(u.pos, RLINE, 70) || F.step === 9 && !near(u.pos, CENTER9, 55);
  // 退く段・移動の段・本陣への移動を、脇の敵への寄り道で止めない。
  const moving = F.step === 1 || F.step === 3 || F.step === 6 || F.step === 10 && !near(u.pos, HOLD5, 35);
  // 目標と無関係な本陣・別の持ち場へ斬り込み、通しが長引く寄り道を避ける。
  const onTask = (g) => !!g && (F.step <= 5 ? g === F.akashi || g === F.akaGun || g === F.ukita2 || g === F.ukita3 || g === F.ukita4
    : F.step === 7 || F.step === 8 ? g === F.otani || g === F.otaW1 || g === F.otaW2
    : F.step === 9 ? g === F.shingari || g === F.koniR
    : F.step === 10 && g === F.shima);
  const ok = (o) => !moving && !returning && onTask(o.group) && !o.gone && !o.fleeing && !o.invuln && !o.campProtected && !o.noTarget && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 4;
  const prev = pl.botStrikeFoe;
  const r = F.step === 1 || F.step === 3 || F.step === 6 ? 3 : F.step === 2 ? 6 : 9;
  const e = prev?.alive && ok(prev) && pl.botStrikeUntil > pl.time && dist(prev.pos, u.pos) < 2.8 ? prev : b.army.nearestEnemy(u, r, ok);
  if (e) {
    const d = dist(e.pos, u.pos);
    if (pl.lock && pl.lock !== e) inp.e.add('KeyQ');
    pl.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d > 2.2) go(pl, inp, e.pos.x, e.pos.z, 2.2); else inp.k.delete('KeyW');
    patientStrike(pl, inp, e, d, true);
    return;
  }
  inp.guardHold = false;
  // ⑦は柵の口へ（柵を越える）。②は鉄砲衆の脇で待つ
  if (q && !(F.step === 2 && dist(q, u.pos) < 10)) go(pl, inp, q.x, q.z, 3); else inp.k.delete('KeyW');
};

// 倒す数（kaito 11/2 O）：段が進む判定と同じ数え方（stages.js）
KILLS.k06_sekigahara = (rt) => {
  const F = rt.flags;
  if (F.ending) return null;
  if (F.step === 9) return cut(F.c9N, nOf(F.shingari, F.koniR), Math.round(F.c9N * 0.45));
  return null;   // 島津の退き口は討つ人数でなく、本陣の前で受けた時間で果たす
};
// 戦の進行の札（段）：F.step の 1〜10
setStages('k06_sekigahara', G.map((t, k) => (k ? [t, k + 1] : [t])));

export { k06_sekigahara };
export default k06_sekigahara;
