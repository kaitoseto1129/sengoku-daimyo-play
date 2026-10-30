import { useTerrain } from './asset_manifest.js';
import { sightPoint } from './battle_sight.js';
import { currentObjective } from './mission_guide.js';
import { sendOrder } from './denrei.js';
import { battleJin, buildBattleJin } from './b_jinkei_g1.js';
import { HISTORICAL_GENERALS } from './b_historical_generals.js';
// ======================================================================
// 信長包囲網　姉川の戦い（元亀元年六月二十八日）
// 近江の姉川を挟んで、南に織田・徳川、北に浅井・朝倉。西の瀬では徳川が朝倉に、東では織田が浅井に当たる。
// 足軽は織田の備（森可成の手）の中に立つ。浅井の磯野員昌が川を渡って織田の段を次々に破って来る。
// ①幾重もの備を抜く磯野の先手を受ける ②東の回り込みを読み、先に備える ③横から押し返す ④川を渡って追う
// 向き：北が -z。川は x の向きに流れ、z ≒ 0。西（-x）が徳川と朝倉、東が織田と浅井
// ======================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nobori, tawara, hut, dou, dorui, kabukimon, solidSeg, koshisaku, jinmaku,
  yagura, bobosaku, tateNarabi, takataba, makeSimpleBatch, finalizeSimpleBatch } from './props.js';
import { addRamp } from './floors.js';
import { S as SETTINGS } from './settings.js';
import { isTouch } from './touch.js';
import { flagTexture } from './textures.js';
import { woodTex, dirtTex } from './nature.js';
import { RANKS } from './state.js';
import { buildHorse, MAT, arrowGeometry, merge as mergeUnit } from './units_model.js';
import { lookParts } from './units_look.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup as spawnEnemy, allyGroup as spawnAlly, centerOf } from './bhelp.js';
import { KIT, volley } from './b_nagashinojo.js';
import { clash } from './b_sekigahara.js';
import { battleEvent, EVENT_REINFORCEMENT, EVENT_RETREAT } from './battle_events.js';
import { camp } from './b_mid.js';
import { demRelief, demDetail } from './dem.js';
import { jinchiTick } from "./yasen_jinchi.js";
import { timeslipField } from './timeslip_field.js';
import { dressStage } from './stage_dress.js';
let aneDem = null;
useTerrain('dem_anegawa', (data) => { aneDem = data; });

// 布陣図の座標は資料の五分の一。地面を広げて本陣と横山城の囲みを収め、隊の間隔を縮めない。
const ANE = [[-420, 8], [-300, -2], [-240, 5], [-180, 8], [-120, -2], [-60, 5], [0, -1], [60, 4], [120, -3], [180, 5], [300, -2], [420, 5]];   // 姉川（補間用は西から東へ）
const MORI = { x: -50 / 5, z: 570 / 5 };     // 森可成の備（自分の持ち場）
// 森の先手の一手だけを川前へ置く遊びの補い。森の本隊と縦の備えは元の位置に残す。
const POST = { x: MORI.x, z: 18 };
// 長浜市は陣杭の柳を、信長が陣太鼓を掛けた伝承地として紹介する。座標と陣の広がりは復元。
// https://www.dokoiko-nagahama.jp/ja/spot/detail/116
const HQ = { x: -100 / 5, z: 830 / 5 };     // 信長の本陣（陣杭の柳の伝承を参考）
// 本陣から縦の備えを結ぶ復元の道。描く道と田を避ける判定で同じ座標を使う。
const ODA_PATH = [[HQ.x, HQ.z], [MORI.x, MORI.z], [-30 / 5, 480 / 5],
  [10 / 5, 260 / 5], [30 / 5, 160 / 5], [10, 4]];
// 田の範囲を通る区間だけを一度まとめる。水深や植生の判定中には物を作らない。
const PADDY_ROAD = ODA_PATH.slice(1).map((b, i) => {
  const a = ODA_PATH[i], dx = b[0] - a[0], dz = b[1] - a[1];
  return { x: a[0], z: a[1], dx, dz, len2: dx * dx + dz * dz };
}).filter((s) => Math.max(s.z, s.z + s.dz) >= 50 && Math.min(s.z, s.z + s.dz) <= 128);
const OKAYAMA = { x: -1030 / 5, z: 700 / 5 }; // 家康の本陣（岡山。後世の名は勝山）
// 太田浩司「ここ滋賀・姉川古戦場」：家康は信長本陣の北西の小丘に布陣。
// https://cocoshiga.jp/official/topic/ieyasu01/
// 丘の高さ・広がりは遊び用の復元。信長本陣には架空の丘を盛らない。
// 信長公記巻三の「又東は美濃三人衆」。東の備えとして置き、横山城の囲みと分ける。
// 細かな位置と横槍に移る時機は遊び用の復元。既存の控えを移し、兵は増やさない。
const MINO = { x: 96, z: 160 };
const DEM_DETAIL = { xy: 5, win: 40, scale: 0.3 };
const DEM_RELIEF = { xy: 5, cx: 0, cz: 48, inner: 210, fade: 80, scale: 0.2, ax: 0.9 };
const MITAMURA = { x: -860 / 5, z: -220 / 5 };   // 朝倉景健の本陣：三田村氏館（土塁・溝・屋敷・門の中世の館。天守にしない）
// 県文化財保護課の解説では主郭は一辺約六十メートルのほぼ正方形。
// 庭の百十人と退路を保つ遊び用の大きさで、南北だけを広げて平面の比率を合わせる。
// 寸法そのものの実測復元ではない。土塁・外堀・川岸の保護範囲で同じ半幅を使う。
// https://shiroexpo-shiga.jp/column/no17/
const MITAMURA_HALF = 17;
const MITAMURA_MOAT = MITAMURA_HALF + 2.5;
// 県文化財保護課の現存土塁は高さ約二・五〜三・五メートル、主郭は一辺約六十メートル。
// 中間の三メートルを館の描画寸法へ縮める。当日の土塁高を確定するものではない。
// https://shiroexpo-shiga.jp/column/no17/
const MITAMURA_BANK_HEIGHT = 3 * (MITAMURA_HALF * 2 / 60);
// 県文化財保護課は主郭の北にも土塁・堀跡があり、複数の郭を推定する。
// 北郭の北辺と東辺だけを補う。範囲・高さ・当日の姿は確定せず、西と南は開けておく。
// https://shiroexpo-shiga.jp/column/no17/
const MITAMURA_NORTH_BANKS = [
  [-17, -48, 17, -48, 0, 1],
  [17, -48, 17, -27, -1, 0],
];
// 滋賀県文化財保護課：三田村氏館は姉川と草野川に挟まれる。
// https://shiroexpo-shiga.jp/column/no17/
// 北の後方に草野川の谷を補う。川筋・幅・水深は復元で、当日の流路の実測ではない。
// 村・既存の山麓への道・追撃の終点より北を通し、主戦場の渡河と密度は保つ。
const KUSANO = [[420, -350], [240, -330], [80, -310], [-100, -280], [-260, -250], [-420, -220]];
const kusanoLevel = (x) => 0.6 + x * 0.0015;
function kusanoBankHeight(x, z, h) {
  if (z > -198 || z < -372) return h;
  let distance2 = Infinity;
  for (let i = 1; i < KUSANO.length; i++) {
    const a = KUSANO[i - 1], b = KUSANO[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
    const ox = x - a[0] - dx * t, oz = z - a[1] - dz * t;
    distance2 = Math.min(distance2, ox * ox + oz * oz);
  }
  // 北の丘の起伏を水面へ写さず、西へ下る谷底へつなぐ。地面の面数は増やさない。
  if (distance2 >= 484) return h;
  const bank = aneSmooth((Math.sqrt(distance2) - 4) / 18);
  const bed = kusanoLevel(x) + 0.15;
  return bed + (h - bed) * bank;
}
// 長浜市の解説にある北岸の三田村口。先手を開戦前から川中へ置かない。
// 幅七十六の乱戦の東端も館の堀から離す。北岸での交戦という推定を採り、細かな位置は復元。
// https://cocoshiga.jp/official/topic/ieyasu01/
const WEST_FRONT_X = MITAMURA.x - 70;
// 信長公記巻三では大依山から野村・三田村へ前進して開戦する。長政を山の陣と混同しない。
// 太田浩司「ここ滋賀・姉川古戦場」の当日の本陣の解説を参照。野村内の細かな位置は復元。
// https://cocoshiga.jp/official/topic/ieyasu01/
const NOMURA_HQ = { x: 58, z: -690 / 5 }; // 前の五手との奥行き・間隔を保ち、野村の後方へ寄せる。
// 公記の大依山は会戦前の陣。既存の北の道の出口で方面だけを示し、場内の丘を旧陣としない。
// https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
const OYORI_EXIT = { x: 160, z: -210 };
// 小谷は野村の北西。本陣だけでなく、崩れた実兵もしんがりも同じ方面へ退く。
// 太田浩司の古戦場全体図を参照。細かな退路は復元で、逃げる速さを保つ単位ベクトル。
// https://cocoshiga.jp/official/topic/ieyasu01/
const AZAI_FLEE = { x: -1 / Math.sqrt(5), z: -2 / Math.sqrt(5) };
// 横山城の北城と、その南東の南城。丘と囲みの位置は既存の縮尺を保つ。
// 曲輪の存在・向きは滋賀県文化財保護協会「新近江名所圖会 第99回」。寸法・柵・登り道は復元。
// https://www.shiga-bunkazai.jp/shigabun-shinbun/best-place-in-shiga/新近江名所圖会%E3%80%80第99回/
const YOKOYAMA = [{ x: 120, z: 312, hw: 12, hd: 9 }, { x: 138, z: 342, hw: 10, hd: 8 }];
// 県文化財保護課の解説にある北城西端の二重堀切。位置・寸法は遊び用の復元。
// 現存遺構には後年の改修も含まれるため、元亀元年の形と確定しない。
// https://shiroexpo-shiga.jp/column/no33/
// 高画質の既存の地面の升目に谷底を合わせ、面数を増やさず二本の堀を分けて描く。
const YOKOYAMA_CUTS = [105, 280 / 3];
function yokoyamaCutDepth(x, z) {
  const end = 1 - aneSmooth((Math.abs(z - YOKOYAMA[0].z) - 11) / 5);
  if (!end) return 0;
  let depth = 0;
  for (const cx of YOKOYAMA_CUTS) depth = Math.max(depth, 1.8 * (1 - aneSmooth(Math.abs(x - cx) / 3)));
  return depth * end;
}
// 同解説の尾根沿いの連絡を参考に、南城の北の入口で道を止めず、南の虎口から山裾へ下ろす。
// 南の包囲兵の正面を横切らず、東の脇へ回す。当日の虎口・道筋の確定ではなく遊び用の復元。
const YOKOYAMA_PATH = [[102, 270], [102, 286], [120, 296], [120, 303], [120, 325],
  [138, 334], [138, 350], [138, 358], [168, 358], [168, 378]];
// 米原市「街道の城」：横山丘陵の北端に、会戦前の信長・家康の陣となった龍ヶ鼻がある。
// https://www.city.maibara.lg.jp/material/files/group/47/13.pdf
// 川に近い北端と横山城を結ぶ尾根を補う。座標・高さ・幅は遊び用の復元。
const TATSUGAHANA = { x: 180, z: 88 };
// 公記にある横山城の囲みを、北城・南城へ向く二手で示す。位置・人数配分は復元。
// 百人の描画枠を分けるだけで、川原の乱戦から兵を抜かない。登り道の正面も空ける。
const YOKOYAMA_SIEGE = [
  { x: 90, z: 280, facing: Math.atan2(YOKOYAMA[0].x - 90, YOKOYAMA[0].z - 280) },
  { x: 150, z: 370, facing: Math.atan2(YOKOYAMA[1].x - 150, YOKOYAMA[1].z - 370) },
];

// 野村・三田村の郷は長浜市の三田村氏館跡の解説に基づく。
// https://www.city.nagahama.lg.jp/section/bunkazai/iseki/zyoukan_ato/mitamura.html
// 家・小堂・民の人数と避難路は推定。後世の長浜城下を会戦場へ置かない。
// 北岸は東西の村外れへ、南岸は村の西から南の野へ。川・館の溝・本陣・横山の囲みを横切らない。
const PEOPLE_PATHS = [
  [[160, -48], [180, -48], [198, -70], [230, -98], [270, -126]],
  [[-232, -42], [-252, -42], [-278, -64], [-320, -90]],
  // 両本陣の間を抜け、横山の囲みより西の野まで下がる。村際だけを避難先にしない。
  [[-112, 132], [-130, 132], [-145, 164], [-155, 210], [-155, 254], [-155, 300]],
  [[-112, 140], [-130, 140], [-134, 166], [-137, 210], [-137, 254], [-137, 300]],
];
// 家の戸口・村の西端・堂の階から見物の空き地へ続く里道。位置は復元。
const PEOPLE_ACCESS = [
  [[164, -58], [164, -48], PEOPLE_PATHS[0][0]],
  [[-236, -52], [-236, -42], PEOPLE_PATHS[1][0]],
  // 種を固定した南の村では、この東側に家がある。壁の中から道を引かず、西の軒外からつなぐ。
  [[-108, 120], [-112, 120], PEOPLE_PATHS[2][0]],
  [[-112, 144], PEOPLE_PATHS[3][0]],
];
// 家と堂は戦場生成後に置くため、先に庭と見物の空き地を林から空ける。
// 村外れの避難先にも待機できる空き地を取り、子や年寄りが林の中で立ち止まらないようにする。
const PEOPLE_CLEARINGS = [[164, -64, 12], [-236, -58, 12], [-112, 150, 12], [160, -48, 8],
  // 北岸も南の野と同じ広さを空ける。九歩ほどの空き地では、追手や火を避けるとすぐ林に詰まる。
  // 人数や木の総数は増やさず、避難先の周りに逃げ直せる余地を取る。
  ...PEOPLE_PATHS.map((path) => { const [x, z] = path[path.length - 1]; return [x, z, 32]; })];
// 里道が塞がれた時に脇へ避けられる幅も空ける。道の線だけを空けると、林の幹に挟まれる。
// 戸口から見物場所、避難先までをつなぐ。村へ出入りする里道も林で分断しない。
const PEOPLE_LANES = [...PEOPLE_ACCESS, ...PEOPLE_PATHS].flatMap((path) => path.slice(1).map(([bx, bz], i) => {
  const [ax, az] = path[i], dx = bx - ax, dz = bz - az;
  return { ax, az, dx, dz, len2: dx * dx + dz * dz };
}));
function peopleLaneClear(x, z) {
  for (const p of PEOPLE_LANES) {
    const t = Math.max(0, Math.min(1, ((x - p.ax) * p.dx + (z - p.az) * p.dz) / p.len2));
    if ((x - p.ax - p.dx * t) ** 2 + (z - p.az - p.dz * t) ** 2 < 64) return true;
  }
  return false;
}
// 道が塞がれて自由に逃げる時も、村の外側の平地を使う。範囲は遊び用の復元。
// 北東は東の別手、北西は三田村氏館へ戻さず、北の山裾より手前に留める。
// 南は村の西の里道に沿い、東の織田本陣と西の徳川本陣の間へ逃がす。
// 北岸も避難先の空き地（三十二）を範囲内へ収める。北の山裾（百八十四）には入らない。
// 避難先の南にも兵との間隔（二十四）以上の余地を残し、追われて範囲の端に詰まらせない。
const PEOPLE_ESCAPE_BOUNDS = [
  { minX: 150, maxX: 306, minZ: -162, maxZ: -20 },
  { minX: -356, maxX: -222, minZ: -126, maxZ: -20 },
  { minX: -190, maxX: -104, minZ: 124, maxZ: 332 },
  { minX: -190, maxX: -104, minZ: 124, maxZ: 332 },
];
const PEOPLE_BANDS = [
  // 東の別手の待機列からも離し、家の南の空き地から同じ岸の東へ逃がす。
  // 見る先は川前。後方の本陣や横山城を囲む兵に、見物の向きを引かれないようにする。
  { x: 160, z: -48, watchAt: { x: 58, z: 0 }, kinds: ['farmer', 'woman', 'child', 'elder', 'merchant'] },
  { x: -232, z: -42, watchAt: { x: -192, z: 0 }, kinds: ['farmer', 'farmer', 'woman', 'child', 'townsman'] },
  // 南の村と小堂は家並みの西から三田村側の川前を見る。東の野村口を向くと村の家越しになる。
  { x: -112, z: 132, watchAt: { x: -192, z: 4 }, kinds: ['farmer', 'woman', 'child', 'merchant', 'elder'] },
  { x: -112, z: 140, watchAt: { x: -192, z: 4 }, kinds: ['monk', 'monk', 'farmer'] },
// 避難先も場内なので消さずに待つ。兵や火が迫れば共通の仕組みでさらに逃げる。
].map((s, i) => ({ ...s, mode: 'watch', routeEnd: 'wait', route: PEOPLE_PATHS[i].slice(1).map(([x, z]) => ({ x, z })),
  // 避難先から逃げ直す人にも、郷ごとの逃げ道の側を守らせる。
  escapeBounds: PEOPLE_ESCAPE_BOUNDS[i], keepTogether: true,
}));

// 滋賀県文化財保護課の解説にある西辺の虎口へ、門・土橋・道を揃える。
// https://shiroexpo-shiga.jp/column/no17/
const MITAMURA_PATH = [[-232, -42], [MITAMURA.x - 28, MITAMURA.z],
  [MITAMURA.x - 17, MITAMURA.z], [MITAMURA.x - 8, MITAMURA.z - 4]];
// 小谷方面は野村の北西。東の山麓への道だけでなく、両郷の後方から北西へ抜ける道を補う。
// 公記の小谷の麓への追撃と、太田浩司の古戦場全体図を参考にした復元。
// https://cocoshiga.jp/official/topic/ieyasu01/
// 草野川の手前で止め、小谷城や史料にない橋は置かない。道筋・終点は当日の退路を確定しない。
const ODANI_PATH = [[96, -180], [32, -180], [-80, -190], [-180, -210], [-300, -210]];
// 公記の野村・三田村の二正面と横山城の囲みを結ぶ細道の補い。
// 当時の道筋を示す史料ではない。既存の瀬を通し、館の堀は西の土橋へ回る。
// 北岸の道は村外れにつなぎ、避難する民を川へ誘導しない。
const ANE_LINK_PATHS = [
  [[10, 4], [10, -20], [58, -42], [140, -42]],
  [[-192, 4], [-192, -16], [-208, -24], [-208, -42], [-232, -42]],
  // 徳川本隊が瀬から北岸の前線へ詰める道。館の堀を避け、既存の渡河後の進路へ結ぶ。
  // 北岸での交戦は太田浩司の解説に拠る推定。道筋自体は遊び用の復元。
  [[-192, -16], [WEST_FRONT_X, -16], [WEST_FRONT_X, -24]],
  // 大依山から二郷へ前進した公記の記述に合わせ、北岸の道を後方へつなぐ。
  // https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
  // 道筋は推定。浅井の縦備えは東を回り、三田村氏館は西の土橋へ結ぶ。
  // 北端は山麓への出口で、大依山の旧陣そのものではない。既存の兵と渡河路は動かさない。
  [[140, -42], [96, -70], [96, NOMURA_HQ.z], [96, -180], [OYORI_EXIT.x, OYORI_EXIT.z]],
  [[-232, -42], [-248, -80], [-248, -138], [-224, -180], [-180, -210]],
  ODANI_PATH,
  [[HQ.x, HQ.z], [30, 200], [80, 240], YOKOYAMA_PATH[0]],
  // 信長本陣の北西にある岡山の徳川陣へ、南岸だけで連絡できる細道。
  // https://cocoshiga.jp/official/topic/ieyasu01/
  // 本陣の位置関係を参考にした補いで、当日の道筋を確定しない。
  // 田・小堂・岡山の陣幕を避け、東脇から既存の徳川の道へ合流する。
  [[-112, 132], [-112, 166], [-80, 166], [HQ.x, HQ.z]],
  [[-112, 166], [-152, 166], [-174, 142], [-176, 112], [-192, 72]],
];
// 水面・川床・減速は姉川と同じ仕組み。西の門前は土橋として掘らない。
// 発掘実測ではなく館の形の補い。主戦場の川筋と浅瀬には触れない。
const MITAMURA_STREAMS = [
  [[-MITAMURA_MOAT, -MITAMURA_MOAT], [MITAMURA_MOAT, -MITAMURA_MOAT],
    [MITAMURA_MOAT, MITAMURA_MOAT], [-MITAMURA_MOAT, MITAMURA_MOAT]],
  [[-MITAMURA_MOAT, MITAMURA_MOAT], [-MITAMURA_MOAT, 4.5]],
  [[-MITAMURA_MOAT, -4.5], [-MITAMURA_MOAT, -MITAMURA_MOAT]],
  // 北郭の外側の水路。主郭の堀と西の退路から離し、館の北にも区画が続くことを示す。
  [[-20, -51], [20, -51], [20, -27]],
].map((pts) => ({ pts: pts.map(([x, z]) => [MITAMURA.x + x, MITAMURA.z + z]), w: 1.1, depth: 0.6 }));

// 姉川だけの細かな川床。広い戦場の粗い升目とは別に、岸と足の高さを同じ曲面で作る。
const aneSmooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function aneNaturalHeight(x, z) {
  let h = 0.5 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.3 * Math.sin(z * 0.05 + x * 0.02);
  // 湖北平野を残し、北の丘・南東の横山丘陵・岡山を盛る。丘の寸法は復元。
  // https://www.city.nagahama.lg.jp/cmsfiles/contents/0000000/285/20140523-151329.pdf
  h += 26 * gauss(x, z, 112, -280, 4608) + 12 * gauss(x, z, -64, -240, 4096);
  h += 16 * gauss(x, z, 600 / 5, 1560 / 5, 3840);
  // 横山城だけが独立した丘にならないよう、東側に龍ヶ鼻まで続く尾根を残す。
  // 川原・東の乱戦・美濃の備え・田・既存の登り道は元の高さを保つ。
  // 滋賀県文化財保護協会「新近江名所圖会 第341回」の横山丘陵北端の解説も参照。
  if (x > 126 && z > 40 && z < 300) {
    const edge = aneSmooth((x - 126) / 24) * aneSmooth((z - 40) / 32) * (1 - aneSmooth((z - 250) / 50));
    h += edge * (8 * gauss(x, z, TATSUGAHANA.x, TATSUGAHANA.z, 900) +
      10 * gauss(x, z, 162, 192, 2600));
  }
  h += 3 * gauss(x, z, OKAYAMA.x, OKAYAMA.z, 196);
  if (aneDem) {
    h += demRelief(aneDem, x, z, DEM_RELIEF);
    // 実測の細かい起伏（200m 四方の平均との差）を薄く足す。川筋と浅瀬の近くでは消して、渡しの高さを守る。
    const far = aneSmooth((Math.abs(z - aneCenter(x)) - 14) / 16);
    if (far > 0) h += far * Math.max(-0.9, Math.min(0.9, demDetail(aneDem, x, z, DEM_DETAIL)));
  }
  return kusanoBankHeight(x, z, h);
}
function aneCastleHeight(x, z) {
  let h = aneNaturalHeight(x, z);
  // 囲みの内側は削平した曲輪にする。土塁の裾まで平らにし、外側八歩で元の山肌へ戻す。
  // 北城が最高所で南城はその南東。高さ・削平の範囲は遊び用の復元で、実測値ではない。
  for (let i = 0; i < YOKOYAMA.length; i++) {
    const k = YOKOYAMA[i], edge = Math.max(Math.abs(x - k.x) - k.hw - 2, Math.abs(z - k.z) - k.hd - 2);
    if (edge >= 8) continue;
    let top = aneNaturalHeight(k.x, k.z);
    if (i === 1) top = Math.min(top, aneNaturalHeight(YOKOYAMA[0].x, YOKOYAMA[0].z) - 2);
    h = top + (h - top) * aneSmooth(edge / 8);
  }
  // 西の尾根を空堀で切る。北の登り道・南北の虎口・包囲兵の足場は保つ。
  return h - yokoyamaCutDepth(x, z);
}
function aneCenter(x) {
  let i = 0;
  while (i < ANE.length - 2 && x > ANE[i + 1][0]) i++;
  const a = ANE[i], b = ANE[i + 1], p = ANE[Math.max(0, i - 1)], q = ANE[Math.min(ANE.length - 1, i + 2)];
  const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0]))), t2 = t * t, t3 = t2 * t;
  const m0 = (b[1] - p[1]) / (b[0] - p[0]) * (b[0] - a[0]);
  const m1 = (q[1] - a[1]) / (q[0] - a[0]) * (b[0] - a[0]);
  return (2 * t3 - 3 * t2 + 1) * a[1] + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * b[1] + (t3 - t2) * m1;
}
// 大きな草地の島と細い裸地を重ねる。地表と株で同じまとまりを使う。
const aneMeadow = (x, z) => aneSmooth((Math.sin(x * 0.11 + Math.sin(z * 0.08) * 1.8)
  * Math.cos(z * 0.14 - x * 0.035) + Math.sin(x * 0.39 + z * 0.24) * 0.22 + 0.25) / 0.95);
const aneWidth = (x) => 9 + Math.sin(x * 0.071) * 0.9 + Math.sin(x * 0.027) * 0.6 + Math.sin(x * 0.23) * 0.22;
// 蛇行する水際から二歩離れた乾いた岸。渡河と案内を、描く川筋・川幅に揃える。
// 川幅そのものは復元のまま。兵数・戦闘の強さには触れない。
const aneNorthBank = (x) => aneCenter(x) - aneWidth(x) - 2;
const aneSouthBank = (x) => aneCenter(x) + aneWidth(x) + 2;
// 西の交戦位置に対し、南向きの朝倉の先手・二の手は北へ重ねる。
// 北岸での交戦という推定を採る配置の補い。固定値では先手が徳川側の後ろへ出てしまう。
// https://cocoshiga.jp/official/topic/ieyasu01/
// 川筋と共通の基準を使い、乱戦の位置・幅・人数は変えない。各手の間隔は復元。
const WEST_FRONT_Z = aneNorthBank(WEST_FRONT_X) - 16;
const ASAKURA_FRONT = { x: WEST_FRONT_X, z: WEST_FRONT_Z - 16 };
const ASAKURA_SECOND = { x: WEST_FRONT_X - 8, z: WEST_FRONT_Z - 32 };
function aneBankColor(x, z, color) {
  const d = Math.abs(z - aneCenter(x)), w = aneWidth(x);
  const shore = aneSmooth((d - w) / 5);
  // 砂利の岸に草が島状に残る。水際には出さず、外側の草地へつなぐ。
  const patch = aneSmooth((Math.sin(x * 0.47 + z * 0.31) + Math.sin(x * 0.19 - z * 0.63) - 0.2) / 1.4);
  // 持ち場の側（南岸の x -75〜40）は足もとまで玉石の川原。草の色を載せない（緑の芝に見えていた。10/28）
  const gravelNear = z > aneCenter(x) ? (1 - aneSmooth((d - w - 18) / 8)) * (1 - aneSmooth(Math.max(-75 - x, x - 40) / 20)) : 0;
  const grass = Math.max(aneSmooth((d - w - 3) / 23), patch * aneSmooth((d - w - 2) / 7) * 0.75) * (0.35 + aneMeadow(x, z) * 0.65) * (1 - gravelNear);
  const fleck = Math.sin(x * 4.7 + z * 7.3) * 0.012;
  // 水際の濡れた砂は暗く、乾いた岸と草地へなだらかにつなぐ。
  const wet = 1 - aneSmooth((d - w) / 4.5);   // 濡れた砂利の帯を広く（乾いた白い一枚に見えていた。10/28）
  // 水際の暗い縁から明るい砂利へ。青緑の川面と、黄土の岸を明度と色で分ける。
  // 川原の玉石の大小の斑（白い一枚に見せない。10/28）
  const cobble = (Math.sin(x * 1.9 + z * 2.3) * Math.sin(x * 2.7 - z * 1.6) + Math.sin(x * 0.61 - z * 0.83) * 0.6) * 0.065;
  // 川原の地を玉石より一段暗く締め、石の粒が地から浮いて見えるように（10/28）
  return color.setRGB(0.41 - shore * 0.16 - grass * 0.08 - wet * 0.27 + fleck + cobble,
    0.355 - shore * 0.11 + grass * 0.03 - wet * 0.2 + fleck + cobble * 0.9,
    0.265 - shore * 0.08 - grass * 0.03 - wet * 0.13 + fleck + cobble * 0.8);
}
// 矩形の短冊を避け、根元から細まり、先が曲がる葉を同じ二面で作る。
function aneGrassBlade(width, height) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -width * 0.5, 0, 0, width * 0.5, 0, 0,
    width * 0.28, height * 0.6, height * 0.07, -width * 0.4, height, height * 0.22,
  ], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals();
  return g;
}
function aneBankGrassMaterial(height) {
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vAneGrassTip;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>\n vAneGrassTip = smoothstep(0.0, ${height.toFixed(2)}, position.y);`);
    sh.fragmentShader = 'varying float vAneGrassTip;\n' + sh.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.20, 0.26, 0.10), vAneGrassTip);');
  };
  mat.customProgramCacheKey = () => `aneBankGrass${height}`;
  return mat;
}
function anegawaRiver(rt) {
  const W = rt.world, st = W.def.streams[0], oldHeight = W.heightAt.bind(W), oldDepth = W.waterDepthAt.bind(W);
  // 湖北平野を琵琶湖へ下る川。地面の凹凸を水面へ写すと、西へ流れる途中で逆勾配になる。
  // 長浜市の地形解説：https://www.city.nagahama.lg.jp/0000001835.html
  // 中央の水位を保ち、東の上流から西の下流へ連続して下げる。勾配は実測でなく遊び用の復元。
  const riverLevel = W.def.height(0, aneCenter(0)) - 0.15;
  const level = (x) => riverLevel + x * 0.0015;
  // 三田村氏館の堀は姉川とは別の水路。南辺も川岸の補間範囲に入るため保護する。
  // 館と周囲の堀は県文化財保護課の解説を参照。寸法・水位は既存の復元を使う。
  // https://shiroexpo-shiga.jp/column/no17/
  const riverBankWeight = (x, z) => aneSmooth((Math.max(
    Math.abs(x - MITAMURA.x), Math.abs(z - MITAMURA.z)) - MITAMURA_MOAT - 2.5) / 6);
  const bed = (x, z) => {
    const d = Math.abs(z - aneCenter(x)), w = aneWidth(x), h = oldHeight(x, z);
    if (d >= 40 || Math.abs(x) > 420) return h;
    let ford = 0;
    for (const f of st.fords) ford = Math.max(ford, aneSmooth((f.w - Math.abs(x - f.x)) / 6));
    const depth = 1.05 - ford * 0.49; // 瀬でも脛から膝まで浸かる。渡れる位置は変えない。
    const y = level(x) - depth * (1 - aneSmooth(d / w));
    if (d <= w) return y;
    const k = aneSmooth((d - w) / (22 - w));
    const shore = y * (1 - k) + Math.max(h, level(x) + 0.12) * k;
    const join = aneSmooth((d - 22) / 18);
    // 水面と瀬の深さは保ち、露出した岸にだけ低い砂礫の背と侵食溝を刻む。
    // 描く地面・兵の足・小石は同じ高さを読む。
    const edge = aneSmooth((d - w) / 2) * (1 - aneSmooth((d - 25) / 12));
    const runnel = Math.pow(0.5 + 0.5 * Math.sin(x * 0.72 + Math.sin(x * 0.19) * 2 + d * 0.18), 6);
    const gravel = Math.sin(x * 1.7 + z * 0.9) * Math.sin(z * 1.3 - x * 0.6) * 0.045;
    // 草の根元の起伏を残し、館の土塁と外堀へ近づくほど川岸の補間を弱める。
    const hummock = (aneMeadow(x, z) - 0.5) * 0.18;
    const bank = shore * (1 - join) + h * join + edge * (0.065 + gravel - runnel * 0.19 + hummock);
    return h + (bank - h) * riverBankWeight(x, z);
  };
  W.heightAt = bed;
  // 軽い兵も同じ川床を読む。元の升目は残し、姉川だけの高さの絵を一度作る。
  const size = 281, heights = new Float32Array(size * size);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) heights[j * size + i] = bed(-420 + i * 3, -420 + j * 3);
  const heightTex = new THREE.DataTexture(heights, size, size, THREE.RedFormat, THREE.FloatType);
  heightTex.needsUpdate = true;
  const heightScale = { value: new THREE.Vector3(420, 3, size - 1) }, heightMap = { value: heightTex };
  const prepared = new WeakSet();
  const dressArmy = (mesh) => {
    const mat = mesh.material;
    if (!mesh.isMesh || !mat || prepared.has(mat)) return;
    prepared.add(mat);
    const compile = mat.onBeforeCompile, key = mat.customProgramCacheKey();
    mat.onBeforeCompile = function (sh, renderer) {
      compile.call(this, sh, renderer);
      if (!sh.uniforms.uHgt) return;
      // 対岸の具足・小袖・顔にも空からの照り返しを残す。色と描く人数は保つ。
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>',
        '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse += diffuseColor.rgb * 0.16;');
      sh.uniforms.uHgt = heightMap; sh.uniforms.uHP = heightScale;
      // 水中は小さく脚を送る。直線の帯ではなく、接地にも使う川床と西へ下る水位で判定する。
      // 既存の高さの絵を川の近くだけ読み、岸へ上がると普通の足運びに戻す。
      // 前進・敗走の位置と勝敗の時計は変えない。
      const foot = sh.vertexShader.includes('void cInit(') ? 'modelMatrix * (instanceMatrix[3] + vec4(cOff.x, 0.0, cOff.z, 0.0))' : 'modelMatrix * instanceMatrix[3]';
      sh.vertexShader = sh.vertexShader.replace('float ph = sin(T * fq);',
        `vec2 aneFoot = (${foot}).xz;
         float aneWet = 0.0;
         if (abs(aneFoot.x) <= 420.0 && abs(aneFoot.y) < 22.0) {
           float aneDepth = ${riverLevel.toFixed(6)} + aneFoot.x * 0.0015 - aTerrain(aneFoot);
           aneWet = smoothstep(0.02, 0.2, aneDepth);
         }
         fq *= mix(1.0, 0.7, aneWet); amp *= mix(1.0, 0.55, aneWet);
         float ph = sin(T * fq);`);
      if (!sh.vertexShader.includes('void cInit(')) {
        // 進む控えの長柄を水平まで倒さず、肩から斜めに支える。
        // 密な列が一枚の黒い棚に見えるのを避ける。白兵の打ち込みは別の処理へ任せる。
        sh.vertexShader = sh.vertexShader.replace('uCharge * 1.15 * (1.0 - run)',
          'uCharge * 0.65 * (1.0 - run)');
      }
      if (sh.vertexShader.includes('void cInit(')) {
        // 打つ回数は保ち、構え・短い打ち込み・引き戻しの間を分ける。
        sh.vertexShader = sh.vertexShader.replace('float f = cFight, beat = sin(T * (2.0 + sd * 1.5));',
          `float f = cFight;
           float aneCycle = fract(T * (2.0 + sd * 1.5) / 6.283185);
           float aneReady = smoothstep(0.05, 0.28, aneCycle);
           float aneStrike = smoothstep(0.32, 0.42, aneCycle);
           float aneRecover = smoothstep(0.52, 0.95, aneCycle);
           float beat = -0.35 + 1.35 * aneReady - 2.0 * aneStrike + 0.65 * aneRecover;`)
          .replace('P.leg += f * 0.2 * sin(T * 2.6 + sd * 7.0);',
            'P.leg += f * 0.2 * sin(aneCycle * 6.283185) * (aneReady - aneRecover);');
        // 逃げながら倒れる者は、足がもつれて膝を折ってから重さで崩れる。
        sh.vertexShader = sh.vertexShader.replace('P.fall = down * 1.45;',
          `float aneTrip = falls * smoothstep(fallAt - 0.22, fallAt, rt) * (1.0 - down);
           P.fall = down * down * 1.45;
           P.lift -= aneTrip * 0.18;`)
          .replace('P.kneel = (kd == 1.0 && ex > 0.5) ? mix(0.7, 1.0, min(1.0, gait)) : 1.0;',
            'P.kneel = ((kd == 1.0 && ex > 0.5) ? mix(0.7, 1.0, min(1.0, gait)) : 1.0) - aneTrip * 0.22;');
      }
    };
    mat.customProgramCacheKey = () => key + '|aneBed'; mat.needsUpdate = true;
  };
  const addArmy = W.addDistantArmy.bind(W), addClash = W.addClash.bind(W);
  W.addDistantArmy = (o) => { const m = addArmy(o); m.traverse(dressArmy); return m; };
  W.addClash = (o) => { const c = addClash(o); c.mesh.traverse(dressArmy); return c; };
  const dispose = W.dispose.bind(W);
  W.dispose = () => { heightTex.dispose(); dispose(); };
  W.waterDepthAt = (x, z) => Math.abs(x) <= 420 && Math.abs(z - aneCenter(x)) < 40 && riverBankWeight(x, z) === 1
    ? (Math.abs(z - aneCenter(x)) < aneWidth(x) ? Math.max(0, level(x) - bed(x, z)) : 0) : oldDepth(x, z);
  // 水の範囲も曲がった岸に合わせる。館の溝や用水は元の判定に任せる。
  const oldWater = W.inWaterAt.bind(W);
  W.inWaterAt = (x, z, y) => Math.abs(x) <= 420 && Math.abs(z - aneCenter(x)) < 40 && riverBankWeight(x, z) === 1
    ? W.waterFootDepthAt(x, z, y) > 0.02 : oldWater(x, z, y);
  // 開戦時・鬨の声・騎馬の共通処理からも、水中へ乾いた土煙を出さない。
  const dustCloud = W.dustCloud.bind(W);
  let sprayAt = -1;
  W.dustCloud = (x, z, big, environment = false) => {
    if (W.inWaterAt(x, z)) {
      const focus = rt.player.u.pos;
      if (!SETTINGS.reduceMotion && W.time >= sprayAt && Math.abs(x - focus.x) < 70 && Math.abs(z - focus.z) < 70) {
        sprayAt = W.time + 0.25;
        W.spray(x, z, big ? 4 : 2);
      }
      return;
    }
    const p = dustCloud(x, z, big, environment);
    if (p && Math.abs(x) <= 420) {
      const dry = aneSmooth((Math.abs(z - aneCenter(x)) - aneWidth(x)) / 4);
      // 濡れた砂の岸では、薄い土煙が足元で早く収まる。
      p.a *= 0.25 + dry * 0.75;
      p.life *= 0.55 + dry * 0.45;
      p.rise *= 0.35 + dry * 0.65;
    }
    return p;
  };
  // 水際の粗い三角面を外し、同じ高さの細かな川原へ継ぐ。外縁では元の地面と重なる。
  const terrain = W.terrain.geometry, tp = terrain.attributes.position, kept = [], ix = terrain.index.array;
  for (let i = 0; i < ix.length; i += 3) {
    let cut = false;
    for (let j = 0; j < 3; j++) {
      const x = tp.getX(ix[i + j]), z = tp.getZ(ix[i + j]);
      if (Math.abs(z - aneCenter(x)) < 25) cut = true;
    }
    if (!cut) kept.push(ix[i], ix[i + 1], ix[i + 2]);
  }
  terrain.setIndex(kept);
  const positions = [], colors = [], uv = [], wetness = [], cover = [], indices = [], water = [], waterColors = [], waterFlow = [], wi = [], waterOff = [];
  const color = new THREE.Color(), deepColor = new THREE.Color(), mudColor = new THREE.Color(0x7a6c52), nx = 280, nz = 80;
  for (let i = 0; i <= nx; i++) {
    const x = -420 + i * 3, center = aneCenter(x);
    for (let j = 0; j <= nz; j++) {
      // 面数を増やさず草地まで重ねる。粗い地面を抜いた範囲の外だけ透かし、穴を開けない。
      const off = (j - 40) * 1.2, z = center + off, d = Math.abs(off);
      positions.push(x, bed(x, z) + 0.025 * aneSmooth((d - 20) / 15), z);
      cover.push(1 - aneSmooth((d - 38) / 10));
      aneBankColor(x, z, color);
      colors.push(color.r, color.g, color.b);
      uv.push(x * 0.7, z * 0.7);
      // 水際から数歩は湿った泥、外側は砂利へ。川の曲がりと左右の岸に沿わせる。
      wetness.push(1 - aneSmooth((d - aneWidth(x) - 0.8) / 7));
      if (i < nx && j < nz) {
        const a = i * (nz + 1) + j, b = a + nz + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    // 川幅を四つに分けて、水際の泥色から主流の青緑へつなぐ。川の曲がりに流れの筋も沿わせる。
    const slope = (aneCenter(x + 0.5) - aneCenter(x - 0.5)), flowLength = Math.hypot(1, slope);
    for (let j = 0; j <= 4; j++) {
      const off = j / 2 - 1, shallow = Math.pow(Math.abs(off), 3);
      water.push(x, level(x), center + off * aneWidth(x));
      // 真夏の渇水の姉川：深い青でなく、砂利の底が透ける緑灰。岸寄りほど川床の色（10/28）
      // 深さの色：主流は暗い青緑、岸へ寄るほど川床の砂利色が透ける。瀬（浅い所）と淵（深い所）を流れに沿って交互に（10/28）
      const riffle = 0.5 + 0.5 * Math.sin(x * 0.043 + Math.sin(x * 0.011) * 2.0);
      // 横の色の差は頂点で持たず、岸からの割合（aneOff）で画素ごとに塗る。三角の継ぎ目に斜めの縞を出さない。
      color.setHex(0x33544f).lerp(deepColor.setHex(0x5a7566), riffle * 0.45);
      const streak = 0.97 + Math.sin(x * 0.31) * Math.sin(x * 0.17) * 0.03;
      waterOff.push(off);
      waterColors.push(color.r * streak, color.g * streak, color.b * streak);
      waterFlow.push(-1 / flowLength, -slope / flowLength);
      if (i < nx && j < 4) {
        const a = i * 5 + j, b = a + 5;
        wi.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const bankGeo = new THREE.BufferGeometry();
  bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  bankGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  bankGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  bankGeo.setAttribute('bankWet', new THREE.Float32BufferAttribute(wetness, 1));
  bankGeo.setAttribute('bankCover', new THREE.Float32BufferAttribute(cover, 1));
  bankGeo.setIndex(indices); bankGeo.computeVertexNormals();
  // 土粒と丸い砂利を一枚に焼く。物体や描く回数を増やさない。
  // 512 の絵に玉石を詰めて焼く（128 では石が溶けて灰の一枚に見えた。10/28 点付け）。記憶は 1MB ほど。
  const TS = 512;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = TS;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(TS, TS);
  // 画素番号の正弦波は細い平行線になる。作る時だけ乱数で土粒を散らす。
  let soilSeed = 157028;
  const soilRandom = () => { soilSeed = soilSeed * 16807 % 2147483647; return soilSeed / 2147483647; };
  // 石の間の砂は暗めの灰褐色。白い一枚の砂に見せない（10/28）。
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 104 + Math.floor(soilRandom() * 40);
    pixels.data[i] = v; pixels.data[i + 1] = v - 5; pixels.data[i + 2] = v - 14; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  // 川原の玉石：灰・青灰・赤茶・黄土の大小を隙間なく詰め、影の縁と照りを付ける。大きい石から先に置き、小石で隙間を埋める。
  const STONE = ['#a19d93', '#8b8a84', '#9c8a70', '#b3a587', '#77736a', '#c2bcae', '#6d7378', '#a8957a'];
  const NSTONE = 2600;
  for (let i = 0; i < NSTONE; i++) {
    const x = soilRandom() * TS, y = soilRandom() * TS, u = i / NSTONE;
    const r = u < 0.04 ? 16 + soilRandom() * 10 : u < 0.22 ? 8 + soilRandom() * 6 : 2.5 + soilRandom() * 5;
    const a = soilRandom() * 3.14, el = 0.62 + soilRandom() * 0.3;
    const tone = STONE[Math.floor(soilRandom() * STONE.length)];
    // 繰り返す絵の縁にも同じ石を置き、継ぎ目を出さない（縁に掛かる石だけ写す）。
    for (let ox = -TS; ox <= TS; ox += TS) for (let oy = -TS; oy <= TS; oy += TS) {
      const cx = x + ox, cy = y + oy;
      if (cx < -r * 1.3 || cy < -r * 1.3 || cx > TS + r * 1.3 || cy > TS + r * 1.3) continue;
      ctx.fillStyle = 'rgba(40,37,32,0.85)';
      ctx.beginPath(); ctx.ellipse(cx + r * 0.12, cy + r * 0.16, r * 1.08, r * el * 1.1, a, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tone;
      ctx.beginPath(); ctx.ellipse(cx, cy, r, r * el, a, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(30,28,24,0.28)';
      ctx.beginPath(); ctx.ellipse(cx + r * 0.22, cy + r * 0.2, r * 0.7, r * el * 0.6, a, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(240,236,224,0.4)';
      ctx.beginPath(); ctx.ellipse(cx - r * 0.28, cy - r * 0.26, r * 0.42, r * el * 0.32, a, 0, Math.PI * 2); ctx.fill();
    }
  }
  const soilTex = new THREE.CanvasTexture(canvas); soilTex.wrapS = soilTex.wrapT = THREE.RepeatWrapping; soilTex.anisotropy = 4;
  // 同じ土粒の絵を凹凸にも使う。川原にも共通の踏み跡を読み、兵の通った所が泥へ変わる。
  const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: soilTex,
    bumpMap: soilTex, bumpScale: 0.075, roughness: 0.94, metalness: 0,
    emissive: 0x000000, emissiveIntensity: 0, transparent: true, depthWrite: false });
  bankMat.onBeforeCompile = (sh) => {
    sh.uniforms.tAneWear = W.groundU.tWear;
    sh.uniforms.tAneMud = W.groundU.tMud;
    sh.uniforms.tAneMacro = W.groundU.tMacro;
    sh.vertexShader = 'attribute float bankWet, bankCover;\nvarying float vAneWet, vAneCover;\nvarying vec3 vAneBank;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n vAneBank = position; vAneWet = bankWet; vAneCover = bankCover;');
    sh.fragmentShader = 'uniform sampler2D tAneWear, tAneMud, tAneMacro;\nvarying float vAneWet, vAneCover;\nvarying vec3 vAneBank;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.a *= vAneCover;
        float aneWear = texture2D(tAneWear, (vAneBank.xz + ${W.half.toFixed(1)}) / ${(W.half * 2).toFixed(1)}).r;
        float aneTrod = smoothstep(0.04, 0.65, aneWear);
        float anePatch = texture2D(tAneMacro, vAneBank.xz * 0.09).r;
        // 持ち場の側の川原（南岸）は草の島を消し、大きめの玉石の絵を重ねる（芝に白い点が散って見えていた。10/28）
        float aneGx = vAneBank.x;
        float aneGc = aneGx < -60.0 ? mix(-2.0, 5.0, clamp((aneGx + 120.0) / 60.0, 0.0, 1.0))
          : aneGx < 0.0 ? mix(5.0, -1.0, (aneGx + 60.0) / 60.0) : mix(-1.0, 4.0, clamp(aneGx / 60.0, 0.0, 1.0));
        float aneGd = vAneBank.z - aneGc;
        // 外の縁と東の先も、下地の砂が草へ戻り切るまで玉石を重ね、乾いた黄土の平たい帯を残さない（10/29）。
        float aneGravel = smoothstep(6.0, 9.0, aneGd) * (1.0 - smoothstep(31.0, 41.0, aneGd))
          * (1.0 - smoothstep(-75.0, -95.0, aneGx)) * (1.0 - smoothstep(100.0, 130.0, aneGx));
        vec3 aneBig = texture2D(map, vAneBank.xz * 0.14 + vec2(0.37, 0.11)).rgb;   // 一枚 7m に大小の玉石（10/28）
        diffuseColor.rgb = mix(diffuseColor.rgb, vColor.rgb * aneBig * 1.15, aneGravel * 0.92);
        float aneTuft = smoothstep(0.42, 0.67, anePatch) * (1.0 - vAneWet) * (1.0 - aneTrod) * (1.0 - aneGravel);
        // 草の島と裸地を色だけでも読み分け、遠くへ続く砂一色を崩す。
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.5, 0.66, 0.32), aneTuft * 0.8);
        // 葦の茂みの根元：枯れた茎の黄土と若い葉の緑が細かく混ざる斑（10/28）
        float aneReed = smoothstep(0.55, 0.75, anePatch) * (1.0 - aneTrod) * smoothstep(0.1, 0.5, vAneWet + 0.3);
        float aneStem = texture2D(tAneMacro, vAneBank.xz * vec2(1.7, 0.6)).r;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.22, 0.27, 0.1), vec3(0.42, 0.36, 0.2), smoothstep(0.4, 0.65, aneStem)), aneReed * 0.7);
        float aneDamp = clamp(vAneWet * (0.55 + anePatch * 0.65) + aneTrod * 0.45, 0.0, 1.0);
        // 共通の泥の絵にある足跡と土塊を使い、砂利の白さを斑に崩す。
        vec3 aneMud = texture2D(tAneMud, vAneBank.xz * 0.26).rgb;
        diffuseColor.rgb = mix(diffuseColor.rgb, aneMud * 1.15, aneDamp * 0.78);
        // 踏み跡の中だけ短い溝と崩れた縁を出す。一定間隔の轍を全面へ並べない。
        vec2 aneQ = vAneBank.xz;
        float aneRidge = sin(aneQ.x * 8.0 + sin(aneQ.y * 1.7) * 2.0)
          * sin(aneQ.y * 5.0 + sin(aneQ.x * 0.9));
        float aneH = aneRidge * aneTrod * 0.025 - aneTrod * 0.035
          + dot(aneMud, vec3(0.333)) * aneDamp * 0.12;
        diffuseColor.rgb *= 1.0 - aneTrod * (0.16 + aneRidge * 0.1);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 aneDx = dFdx(-vViewPosition), aneDy = dFdy(-vViewPosition);
        vec3 aneR1 = cross(aneDy, normal), aneR2 = cross(normal, aneDx);
        float aneDet = dot(aneDx, aneR1) * faceDirection;
        normal = normalize(abs(aneDet) * normal - sign(aneDet)
          * (dFdx(aneH) * aneR1 + dFdy(aneH) * aneR2));`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.38, aneDamp);`);
  };
  const banks = new THREE.Mesh(bankGeo, bankMat);
  banks.receiveShadow = true; W.scene.add(banks);
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(water, 3));
  wg.setAttribute('color', new THREE.Float32BufferAttribute(waterColors, 3));
  wg.setAttribute('waterFlow', new THREE.Float32BufferAttribute(waterFlow, 2));
  wg.setAttribute('aneOff', new THREE.Float32BufferAttribute(waterOff, 1));
  wg.setIndex(wi); wg.computeVertexNormals();
  st.mesh.geometry.dispose(); st.mesh.geometry = wg;
  // 共通の水面の補修は一列二頂点の帯を前提に岸と主流を交互に塗り、五列の姉川では斜めの緑の縞になった（10/28）。
  // 深さ・浅瀬・水際の泡はこの戦の材質で塗るので、共通の補修は掛けない。
  st.mesh.userData.waterSurfaceReady = true;
  // 濁った水が川床と浸かった脚を隠す。携帯でも砂と水面を見分けられる。
  st.mesh.material.opacity = 1; st.mesh.material.depthWrite = true;
  // 朝の白い空で水色を覆わない。低画質の空の加算も同じ強さに抑える。
  const waterMat = st.mesh.material, waterCompile = waterMat.onBeforeCompile;
  waterMat.roughness = 0.32; waterMat.envMapIntensity = 0.5;   // 空の映りが川に平行な明るい縞になった（10/28）。濁った夏の水は照りを抑える
  const waterKey = waterMat.customProgramCacheKey();
  waterMat.onBeforeCompile = function (sh, renderer) {
    waterCompile.call(this, sh, renderer);
    sh.vertexShader = 'attribute float aneOff; varying float vAneOff;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAneOff = aneOff;');
    sh.fragmentShader = 'varying float vAneOff;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace('reflectedLight.indirectDiffuse += uWaterSky *',
      'reflectedLight.indirectDiffuse += uWaterSky * 0.2 *')
      // 周期的な横線は残さず、二つの速さで流れる細長い斑へ替える。
      .replace('float streamLines = sin(streamAcross * 4.8 + sin(streamAlong * 0.22 - uTime * 0.8) * 0.7);',
        `float aneFlowPatch = texture2D(tMacro, vec2(streamAlong * 0.19 - uTime * 0.05, streamAcross * 0.43)).r;
         float aneFineFlow = texture2D(tMacro, vec2(streamAlong * 0.37 - uTime * 0.08, streamAcross * 0.91) + vec2(0.31, 0.67)).r;
         float streamLines = (aneFlowPatch * 0.65 + aneFineFlow * 0.35 - 0.5) * 2.0;`)
      .replace('streamLines * streamNear * 0.065', 'streamLines * streamNear * 0.015')
      // 深さの色：主流の暗い青緑から、岸寄りの浅瀬は砂利の川床が透ける黄土へ。水際は細く白く泡立つ（10/28）
      .replace('diffuseColor.rgb *= 1.0 + streamLines', `float aneShallow = pow(clamp(abs(vAneOff), 0.0, 1.0), 1.6);
         float aneBedSpot = texture2D(tMacro, vWPw.xz * 0.21 + 0.4).r;
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.11, 0.075) * mix(0.8, 1.15, aneBedSpot), (1.0 - aneShallow) * 0.5);   // 主流は青緑の板でなく、深みの暗い緑褐色（10/28）
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.2, 0.12) * mix(0.75, 1.2, aneBedSpot), aneShallow * 0.85);
         float aneFoam = smoothstep(0.8, 0.96, abs(vAneOff)) * smoothstep(0.45, 0.7, texture2D(tMacro, vWPw.xz * 0.6 - vec2(uTime * 0.04, 0.0)).r);
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.63, 0.6), aneFoam * 0.6);
         diffuseColor.rgb *= 1.0 + streamLines`);   // 川に平行な明るい縞が板の筋に見えた（10/28）。流れの斑は薄く残す
  };
  waterMat.customProgramCacheKey = () => `${waterKey}|aneWater`;
  waterMat.needsUpdate = true;
  // 元の石の白い輪は固定の板なので、主流に付いた分だけ隠す。
  for (const m of W.scene.children) if (m.isMesh && m.material?.color?.getHex() === 0xe8ecea) {
    m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox;
    if (b.max.x - b.min.x > 500 && b.min.z > -25 && b.max.z < 25) m.visible = false;
  }
  // 元の石は補修前の川床に乗っている。姉川だけ同じ石の枠へ大小を散らし、新しい岸へ接地する。
  if (st.rockMesh) st.rockMesh.visible = false;
  const dummy = new THREE.Object3D(), stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color: 0x77786f }), 640);   // 小石は十二面（百四十四面×六百四十が重かった）
  const blade = aneGrassBlade(0.09, 0.45);
  const grasses = new THREE.InstancedMesh(blade, aneBankGrassMaterial(0.45), 640);
  let seed = 1570;
  const R = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 640; i++) {
    // 枠数は保ち、三分の一を渡河する前線へ寄せる。
    const x = i % 3 === 0 ? -75 + R() * 180 : -415 + R() * 830, side = i % 2 ? 1 : -1;
    let z = aneCenter(x) + side * (aneWidth(x) + R() * 3.5);
    const large = i % 11 === 0, scale = large ? 1.4 + R() * 1.2 : 0.6 + R();   // 大石は径30cmほどまで（白い平たい塊を岸に並べない。10/29）
    dummy.rotation.set(R() * 0.18, R() * 6.28, R() * 0.18);
    dummy.scale.set(scale, scale * (0.45 + R() * 0.25), scale * (0.75 + R() * 0.4));
    dummy.position.set(x, bed(x, z) + dummy.scale.y * 0.045, z);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    color.setRGB(0.5 + R() * 0.24, 0.5 + R() * 0.24, 0.47 + R() * 0.22);   // 夏の日で白く飛ばない濡れ色の灰
    stones.setColorAt(i, color);
    z += side * (0.7 + R() * 4);
    dummy.position.set(x, bed(x, z), z); dummy.rotation.set(0, R() * 6.28, 0); dummy.scale.setScalar(0.4 + R() * 0.7);
    dummy.updateMatrix(); grasses.setMatrixAt(i, dummy.matrix);
    grasses.setColorAt(i, aneBankColor(x, z, color));
  }
  stones.instanceMatrix.needsUpdate = grasses.instanceMatrix.needsUpdate = true;
  W.scene.add(stones);   // 10/24：草は作らない
  // 川沿い八百メートルに散らした小石と草は、画面に入る物と近くの物だけ描く
  if (W.viewCull) { W.viewCull([stones], 6); }
  const ring = new THREE.RingGeometry(0.82, 1, 18, 1, 0, Math.PI * 1.65); ring.rotateX(-Math.PI / 2);
  const ripples = new THREE.InstancedMesh(ring, new THREE.MeshBasicMaterial({ color: 0xb1c3bd, transparent: true, opacity: 0.48, depthWrite: false, side: THREE.DoubleSide }), 48);
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(48), 1);
  ring.setAttribute('aneFade', fade);
  ripples.material.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aneFade; varying float vAneFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAneFade = aneFade;');
    sh.fragmentShader = 'varying float vAneFade;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vAneFade;');
  };
  ripples.material.customProgramCacheKey = () => 'aneRipple';
  ripples.count = 0; ripples.frustumCulled = false; W.scene.add(ripples);
  rt.flags.riverFx = { dummy, ripples, fade, age: new Float32Array(48), x: new Float32Array(48), z: new Float32Array(48), next: 0, sample: 0 };
  // 開戦前に置かれた兵も新しい川床へ接地する。
  for (const u of rt.army.units) if (Math.abs(u.pos.z - aneCenter(u.pos.x)) < 22) u.pos.y = bed(u.pos.x, u.pos.z);
}
// 持ち場の正面の川原と瀬（10/28 点付け「川は平たい板、川原は灰の一枚」）。
// 1. 両岸の水際から 7m を玉石と砂利の川原に（地面の配分を土へ寄せ、丸い玉石と細かな砂利を一つずつの InstancedMesh で）。
// 2. 森の前の瀬（x=0 の浅瀬）に白い波の筋と、水から頭を出す石。筋の絵は流れへずらすだけで、毎コマ物を作らない。
// 3. 対岸の水際の少し奥に浅井の旗の列（朝倉は西の三田村口で、この画面の外）。兵は増やさない。
function anegawaFrontRiver(rt) {
  const W = rt.world, F = rt.flags;
  let s = 913;
  const R = () => { s = s * 16807 % 2147483647; return s / 2147483647; };
  const X0 = -75, X1 = 40;
  // 地面：水際から離れるほど草へ戻る。
  const geo = W.terrain?.geometry, P = geo?.attributes.position, splat = geo?.attributes.splat, cover = geo?.attributes.groundCover;
  if (P && splat) {
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), z = P.getZ(i);
      if (x < X0 - 20 || x > X1 + 20) continue;
      const c = aneCenter(x), w = aneWidth(x), d = Math.abs(z - c) - w;
      // 手前（持ち場の側）の川原は夏の渇水で広く、足もとまで砂利。対岸は細い帯のまま。
      const near = z > c, reach = near ? 22 : 9;
      if (d < -1 || d > reach) continue;
      const k = (1 - aneSmooth((d - (near ? 14 : 4)) / (near ? 8 : 5))) * (1 - aneSmooth((Math.max(X0 - x, x - X1)) / 20));
      const n = 0.82 + 0.18 * Math.sin(x * 0.9 + z * 1.3) * Math.cos(z * 0.7 - x * 0.4);
      let g = splat.getX(i), dd = splat.getY(i), m = splat.getZ(i);
      const t = g * k * n;
      g -= t; dd += t * 0.8; m += t * 0.2;
      splat.setXYZ(i, g, dd, m);
      if (cover) cover.setY(i, cover.getY(i) * (1 - k * 0.9));
    }
    splat.needsUpdate = true; if (cover) cover.needsUpdate = true;
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), e = new THREE.Euler();
  const col = new THREE.Color();
  const bankPoint = (dmax) => {
    const x = X0 + R() * (X1 - X0), side = R() < 0.62 ? 1 : -1;   // 手前の岸を厚く
    const d = Math.pow(R(), 1.6) * dmax * (side > 0 ? 2.4 : 1);   // 手前は足もとまで散らす（数は増やさない）
    return [x, aneCenter(x) + side * (aneWidth(x) + d - 0.4)];
  };
  // 玉石（丸く、上を出して埋める）
  const NS = SETTINGS.quality === 'low' ? 420 : 760;
  // 玉石の形：なめらかな卵でなく、頂点を少し崩した面のある川石（白い卵が散って見えていた。10/28）。
  const stoneGeo = new THREE.IcosahedronGeometry(1, 1);
  { const a = stoneGeo.attributes.position, seen = new Map();
    for (let i = 0; i < a.count; i++) {
      const key = a.getX(i).toFixed(3) + ',' + a.getY(i).toFixed(3) + ',' + a.getZ(i).toFixed(3);
      if (!seen.has(key)) seen.set(key, 0.84 + R() * 0.3);
      const k = seen.get(key); a.setXYZ(i, a.getX(i) * k, a.getY(i) * k, a.getZ(i) * k);
    }
    // 法線は丸めて、角の立った白い多面体に見せない（水に磨かれた丸い川石。10/29）
    const nr = stoneGeo.attributes.normal, v3 = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) { v3.set(a.getX(i), a.getY(i), a.getZ(i)).normalize(); nr.setXYZ(i, v3.x, v3.y, v3.z); }
    nr.needsUpdate = true; }
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, NS);
  for (let i = 0; i < NS; i++) {
    const [x, z] = bankPoint(7);
    const r = 0.08 + R() * R() * 0.26;   // 径10〜30cmの玉石が主（大きな白い塊を散らさない。10/29）
    p.set(x, W.heightAt(x, z) - r * 0.38, z);
    q.setFromEuler(e.set(R() * 0.4, R() * 6.28, R() * 0.4));
    stones.setMatrixAt(i, m4.compose(p, q, sc.set(r * (1.05 + R() * 0.35), r * (0.6 + R() * 0.25), r)));
    // 夏の日差しで白く飛ばさない。灰・青灰・赤茶・黄土の川石を混ぜる。
    const v = 0.15 + R() * 0.12, h = R();   // 上の面が日を受けて白い板に見えないよう低めに
    if (h < 0.5) stones.setColorAt(i, col.setRGB(v, v * 0.98, v * 0.94));
    else if (h < 0.72) stones.setColorAt(i, col.setRGB(v * 0.88, v * 0.94, v * 1.02));
    else if (h < 0.88) stones.setColorAt(i, col.setRGB(v * 1.1, v * 0.86, v * 0.72));
    else stones.setColorAt(i, col.setRGB(v * 1.08, v * 0.98, v * 0.74));
  }
  stones.instanceMatrix.needsUpdate = true; stones.instanceColor.needsUpdate = true;
  // 砂利（小さく平たい粒）
  const NG = SETTINGS.quality === 'low' ? 900 : 1800;
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), stoneMat, NG);
  for (let i = 0; i < NG; i++) {
    const [x, z] = bankPoint(6);
    const r = 0.03 + R() * 0.06;
    p.set(x, W.heightAt(x, z) + r * 0.2, z);
    q.setFromEuler(e.set(R(), R() * 6.28, R()));
    gravel.setMatrixAt(i, m4.compose(p, q, sc.set(r * 1.3, r * 0.6, r)));
    const v = 0.36 + R() * 0.3;
    gravel.setColorAt(i, col.setRGB(v, v * 0.96, v * 0.9));
  }
  gravel.instanceMatrix.needsUpdate = true; gravel.instanceColor.needsUpdate = true;
  rt.scene.add(stones, gravel);
  if (W.viewCull) W.viewCull([stones, gravel], 6);
  // 瀬の石：水から頭を出す。白い波はその下手（西）へ流れる。
  const ROCKS = [];
  for (let k = 0; k < 40 && ROCKS.length < 16; k++) {
    const x = -30 + R() * 50, z = aneCenter(x) + (R() * 2 - 1) * (aneWidth(x) - 1);
    const dep = W.waterDepthAt(x, z);
    if (dep < 0.05 || dep > 0.9) continue;
    ROCKS.push([x, z, 0.35 + R() * 0.5, dep]);
  }
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  // 瀬の石が一色の黄土の平たい円盤に見えた（10/29）。川原と同じ面のある石の形で、濡れた暗い灰に色をばらし、水から頭だけ出す。
  const rocks = new THREE.InstancedMesh(stoneGeo, stoneMat, Math.max(1, ROCKS.length));
  rocks.count = ROCKS.length;
  ROCKS.forEach(([x, z, r, dep], i) => {
    p.set(x, W.heightAt(x, z) + dep - r * 0.45, z);
    q.setFromEuler(e.set(R() * 0.5, R() * 6.28, R() * 0.5));
    rocks.setMatrixAt(i, m4.compose(p, q, sc.set(r * (0.9 + R() * 0.5), r * (0.75 + R() * 0.3), r)));
    const v = 0.17 + R() * 0.08;
    rocks.setColorAt(i, col.setRGB(v * 1.03, v, v * 0.9));
  });
  rocks.instanceMatrix.needsUpdate = true; if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rt.scene.add(rocks);
  // 水際が一本の直線の段に見えた（10/28 点付け）。濡れた暗い帯と、半分水に浸かる石の列で岸の線を崩す。
  const edgeZ = (x, side) => {
    // 水面の板は判定の岸より外まで張る。地面が水面の上へ出る所を水際にする。
    const c = aneCenter(x), w = aneWidth(x), L = W.heightAt(x, c) + (W.waterDepthAt(x, c) || 0);
    let z = c + side * (w - 4);
    for (let k = 0; k < 64; k++, z += side * 0.25) if (W.heightAt(x, z) > L + 0.03) return z;
    return c + side * w;
  };
  {
    const OFF = [-0.8, 0.2, 1.4, 3.2], AL = [0, 0.7, 0.45, 0];
    const pos = [], colr = [], idx = [];
    let n = 0;
    for (const side of [1, -1]) {
      const base = n;
      let cols = 0;
      for (let x = X0; x <= X1; x += 1.2, cols++) {
        const ez = edgeZ(x, side), wob = Math.sin(x * 0.53) * 0.5 + Math.sin(x * 1.7) * 0.25;
        OFF.forEach((o, j) => {
          const z = ez + side * (o * (side > 0 ? 1 : 0.6) + (j ? wob : 0));
          pos.push(x, Math.max(W.heightAt(x, z), W.heightAt(x, ez)) + 0.04, z);
          colr.push(0.2, 0.19, 0.17, AL[j] * (0.75 + 0.25 * Math.sin(x * 0.9 + j)));
          n++;
        });
      }
      for (let i = 0; i < cols - 1; i++) for (let j = 0; j < OFF.length - 1; j++) {
        const a = base + i * OFF.length + j, b = a + OFF.length;
        if (side > 0) idx.push(a, b, a + 1, a + 1, b, b + 1); else idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    wg.setAttribute('color', new THREE.Float32BufferAttribute(colr, 4));
    wg.setIndex(idx); wg.computeVertexNormals();
    const wet = new THREE.Mesh(wg, new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    wet.renderOrder = 1;
    rt.scene.add(wet);
    // 水際の石：大小を不揃いに、半分は水に浸ける（瀬の石とは別の一つの InstancedMesh）
    const ED = [];
    for (let x = X0; x <= X1; x += 0.9 + R() * 1.6) {
      const side = R() < 0.75 ? 1 : -1, ez = edgeZ(x, side);
      const z = ez + side * (R() * 2.2 - 1.1), r = 0.18 + R() * R() * 0.6;
      ED.push([x, z, r]);
      if (R() < 0.35) ED.push([x + (R() - 0.5) * 1.2, z + side * (0.4 + R() * 0.6), r * (0.4 + R() * 0.3)]);
    }
    const edge = new THREE.InstancedMesh(rockGeo, stoneMat, Math.max(1, ED.length));
    edge.count = ED.length;
    ED.forEach(([x, z, r], i) => {
      const dep = W.waterDepthAt(x, z) || 0;
      p.set(x, W.heightAt(x, z) + Math.min(dep, r * 0.5) - r * 0.2, z);
      q.setFromEuler(e.set(R() * 0.4, R() * 6.28, R() * 0.4));
      edge.setMatrixAt(i, m4.compose(p, q, sc.set(r * (1.1 + R() * 0.4), r * (0.5 + R() * 0.25), r)));
      const v = dep > 0.01 ? 0.2 + R() * 0.08 : 0.28 + R() * 0.16;   // 濡れた石は暗い
      edge.setColorAt(i, col.setRGB(v * 1.02, v, v * 0.92));
    });
    edge.instanceMatrix.needsUpdate = true; edge.instanceColor.needsUpdate = true;
    rt.scene.add(edge);
    if (W.viewCull) W.viewCull([edge], 6);
  }
  // 白い波の絵：描いた筋の線は平たい板に見えた（10/29 点付け）。流れに長い泡の斑を、横につながる値の雑音で作る。
  // 泡の固まりの中に穴（水の色）と細かい気泡の粒が残り、縁は流れへほどける。作るのは支度の一度だけ。
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128;
  const cx = cv.getContext('2d'), img = cx.createImageData(256, 128), D = img.data;
  const LAT = [];
  for (let o = 0; o < 5; o++) { const nx = 4 << o, ny = 4 << o, g = new Float32Array(nx * ny); for (let k = 0; k < g.length; k++) g[k] = R(); LAT.push([nx, ny, g]); }
  const vn = ([nx, ny, g], u, v) => {
    const x = u * nx, y = v * ny, i = Math.floor(x), j = Math.floor(y);
    let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => g[((b % ny + ny) % ny) * nx + ((a % nx + nx) % nx)];
    return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
  };
  for (let y = 0; y < 128; y++) for (let x = 0; x < 256; x++) {
    const u = x / 256, v = y / 128;
    // 流れの向き（u）に引き延ばす：低い音は横に長く、高い音は粒
    const w = vn(LAT[1], u + vn(LAT[0], u, v) * 0.15, v);
    const f = vn(LAT[0], u, v) * 0.42 + w * 0.3 + vn(LAT[2], u, v) * 0.16 + vn(LAT[3], u, v) * 0.08 + vn(LAT[4], u, v) * 0.04;
    const body = Math.min(1, Math.max(0, (f - 0.5) / 0.16));
    const bub = vn(LAT[4], u * 1.0, v) * 0.6 + vn(LAT[3], u, v) * 0.4;
    const holes = Math.min(1, Math.max(0, (bub - 0.38) / 0.22));
    const a = body * (0.35 + 0.65 * holes) * (0.55 + 0.45 * body);
    const k = (y * 256 + x) * 4, sh = 0.86 + 0.14 * bub;
    D[k] = 214 * sh; D[k + 1] = 222 * sh; D[k + 2] = 218 * sh; D[k + 3] = Math.round(a * 235);
  }
  cx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping;
  if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
  // 四角い帯の縁が水に切れ目として見えた（10/28）。帯そのものの縁を楕円に抜く（流れへずらす絵とは別の止まった絵）。
  const ev = document.createElement('canvas'); ev.width = 64; ev.height = 32;
  const ex = ev.getContext('2d'), eg = ex.createRadialGradient(32, 16, 2, 32, 16, 32);
  eg.addColorStop(0, '#fff'); eg.addColorStop(0.55, '#bbb'); eg.addColorStop(1, '#000');
  ex.setTransform(1, 0, 0, 0.5, 0, 8); ex.fillStyle = eg; ex.fillRect(0, -16, 64, 64);
  const edge = new THREE.CanvasTexture(ev);
  const foamMat = new THREE.MeshBasicMaterial({ map: tex, alphaMap: edge, transparent: true, depthWrite: false, opacity: 0.8, fog: true });
  const foamGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const SP = [];
  // 瀬の白い波：等しい間の格子で並べると、25秒の画面で斜めの白い縞の列に見えた（10/28 夜）。
  // 瀬の固まり（ゆっくり変わる斑）にだけ、大きさと間をばらして散らす。数は前と同じほど。
  for (let i = 0; i < 150 && SP.length < 84; i++) {
    const x = -40 + R() * 64, s = R() * 2 - 1;
    const patch = Math.sin(x * 0.23 + s * 2.6) + Math.sin(x * 0.083 - s * 1.7 + 1.3);
    if (patch < 0.15 || R() > 0.35 + patch * 0.4) continue;
    const z = aneCenter(x) + s * 0.88 * aneWidth(x);
    const dep = W.waterDepthAt(x, z);
    if (dep < 0.03 || dep > 1.1) continue;
    SP.push([x, z, 2.2 + R() * 5.5, 0.6 + R() * 1.5, dep]);
  }
  // 石の下手と水際
  for (const [x, z, r, dep] of ROCKS) SP.push([x - r * 2.5, z, r * 6, r * 2.2, dep]);
  // 水際は二列の白い泡で、川原と水面の境を一本の直線に見せない（10/28）
  // 25秒の画面で二列の泡が切れ目なく続き、岸に平行な白い線の縞に見えた（10/28 夜）。所々を切り、岸からの離れと長さを不揃いに。
  for (let x = X0; x <= X1; x += 2.5) for (const side of [-1, 1]) for (const off of [0.6, 1.9]) {
    if (side < 0 && off > 1) continue;
    if (R() < (off > 1 ? 0.55 : 0.35)) continue;
    const z = aneCenter(x) + side * (aneWidth(x) - off * (0.6 + R() * 0.8) - R() * 0.6);
    const dep = W.waterDepthAt(x, z);
    if (dep > 0.01) SP.push([x + (R() - 0.5) * 2.2, z, 1.8 + R() * 3, (off > 1 ? 0.7 : 1.0) * (0.7 + R() * 0.6), dep]);
  }
  const foam = new THREE.InstancedMesh(foamGeo, foamMat, Math.max(1, SP.length));
  foam.count = SP.length;
  SP.forEach(([x, z, L, w, dep], i) => {
    const t = 0.01;
    const a = Math.atan2(aneCenter(x + t) - aneCenter(x - t), 2 * t);
    p.set(x, W.heightAt(x, z) + dep + 0.03, z);
    q.setFromEuler(e.set(0, -a, 0));
    foam.setMatrixAt(i, m4.compose(p, q, sc.set(L, 1, w)));
  });
  foam.renderOrder = 2;
  rt.scene.add(foam);
  F.aneFoam = tex;
  // 対岸の旗の列：浅井
  for (let x = -66; x <= 34; x += 8 + R() * 3) {
    const z = aneNorthBank(x) - 7 - R() * 4;
    if (!Number.isFinite(W.heightAt(x, z)) || W.waterDepthAt(x, z) > 0.02) continue;
    rt.scene.add(nobori(W, x, z, 'azai', 5 + R() * 1.2));
  }
}

function anegawaRiverTick(rt, dt) {
  const fx = rt.flags.riverFx, W = rt.world, focus = rt.player.u.pos;
  // 瀬の白い波の筋を流れへずらす（絵の位置を変えるだけ）。
  if (rt.flags.aneFoam && !SETTINGS.reduceMotion) rt.flags.aneFoam.offset.x = (rt.flags.aneFoam.offset.x + dt * 0.09) % 1;
  if (!fx) return;
  if (SETTINGS.reduceMotion) { fx.ripples.count = 0; fx.age.fill(0); return; }
  for (const u of rt.army.units) {
    if (!u.alive || u.isStruct || Math.abs(u.pos.x - focus.x) > 38 || Math.abs(u.pos.z - focus.z) > 38 || Math.abs(u.pos.z - aneCenter(u.pos.x)) > 11) continue;
    const depth = W.waterFootDepthAt(u.pos.x, u.pos.z, u.pos.y);
    if (depth < 0.08) continue;
    if (!u.mounted && u.moving > 0.2) {
      if (u.legL) { u.legL.rotation.x *= 0.55; u.legR.rotation.x *= 0.55; }
      if (u.shinL) { u.shinL.rotation.x *= 0.45; u.shinR.rotation.x *= 0.45; }
      if (u.body && !u.dodging && !u._crouch && !(u.stagger > 0)) u.body.position.y *= 0.4;
    }
    if ((u.aneRippleAt ?? -1) > rt.t) continue;
    const moving = u.moving > 0.2;
    u.aneRippleAt = rt.t + (moving ? 0.5 : 1.1);
    const i = fx.next; fx.next = (i + 1) % 48;
    fx.age[i] = 0.001; fx.x[i] = u.pos.x; fx.z[i] = u.pos.z;
    if (moving) W.spray(u.pos.x, u.pos.z, u.mounted ? 4 : 3);
  }
  if (rt.flags.step === 1 && rt.t >= (fx.clashAt || 0)) {
    fx.clashAt = rt.t + 0.45;
    let used = 0;
    for (const c of rt.flags.clash || []) {
      const cf = Math.cos(c.facing), sf = Math.sin(c.facing);
      for (let team = 0; team < 2 && used < 4; team++) {
        const side = team ? c.B : c.A;
        if (side.routed || !side.near.length) continue;
        const soldier = side.near[fx.sample++ % side.near.length], block = side.blk[soldier.j];
        if (soldier.taken || block.rt > 0 || soldier.slot < block.kd) continue;
        const kc = block.kd / c.cols, fr = Math.floor(kc), row = soldier.row <= fr ? fr : kc;
        const off = side.sgn * c.blocks[soldier.j].f + row * 1.15 + c.app;
        const lz = soldier.lz + side.sgn * off;
        const x = c.x + soldier.lx * cf + lz * sf, z = c.z - soldier.lx * sf + lz * cf;
        if (Math.abs(x - focus.x) > 70 || Math.abs(z - focus.z) > 70 || W.waterDepthAt(x, z) < 0.08) continue;
        const i = fx.next; fx.next = (i + 1) % 48;
        fx.age[i] = 0.001; fx.x[i] = x; fx.z[i] = z; used++;
        W.spray(x, z, 2);
      }
    }
  }
  let n = 0;
  for (let i = 0; i < 48; i++) {
    if (!fx.age[i]) continue;
    const age = fx.age[i] += dt;
    if (age > 1.1) { fx.age[i] = 0; continue; }
    const x = fx.x[i] - age * 0.22, z = fx.z[i], r = 0.18 + age * 0.65;
    const depth = W.waterDepthAt(x, z);
    if (depth < 0.02) continue;
    fx.dummy.position.set(x, W.heightAt(x, z) + depth + 0.025, z);
    fx.dummy.rotation.set(0, i * 2.4, 0); fx.dummy.scale.set(r, 1, r * 0.75);
    fx.fade.setX(n, (1 - age / 1.1) ** 2);
    fx.dummy.updateMatrix(); fx.ripples.setMatrixAt(n++, fx.dummy.matrix);
  }
  fx.ripples.count = n; fx.ripples.instanceMatrix.needsUpdate = fx.fade.needsUpdate = true;
}

// 太田浩司の解説にある、北岸で朝倉を崩した後の徳川の追撃を補う。
// https://cocoshiga.jp/official/topic/ieyasu01/
// 百六十人の既存の本隊だけを動かす。北の終点・道筋・速さは復元で、小谷城は場外。
function anegawaWestPursuit(rt) {
  const F = rt.flags, group = F.tk[0].m, A = group.army;
  const ford = F.tkFords, points = [];
  let x = A.cx + A.off.x, z = A.cz + A.off.z;
  // 早く朝倉が崩れた場合も、南岸から館へ斜めに渡らず元の瀬を通る。
  if (z > ford.north) {
    if (z >= ford.south) points.push([-192, Math.max(z, ford.south)]);
    points.push([-192, ford.north]);
  }
  // 隊幅四十の全列を館の西へ出してから北上し、草野川の手前で止める。
  points.push([WEST_FRONT_X, Math.min(z, ford.north)], [WEST_FRONT_X, -174]);
  let delay = 0;
  for (const [nx, nz] of points) {
    const seconds = Math.max(8, Math.hypot(nx - x, nz - z) / 1.6);
    const march = () => { if (!rt.over && !F.ending) group.moveTo(nx, nz, seconds); };
    if (delay === 0) march(); else rt.after(delay, march);
    delay += seconds; x = nx; z = nz;
  }
}

// 遠い知らせは使番が届ける。届かなくても隊の動きや勝敗は止めない。
function anegawaReport(rt, from, line, dur = 3, arrived) {
  const step = rt.flags.step;
  return sendOrder(rt, from, rt.player.u, { id: 'anegawaReport', apply: () => {
    if (rt.over || rt.flags.ending || rt.flags.step !== step) return;
    rt.say('使番', line, dur);
    if (arrived) arrived();
  } }, { team: 0, faction: from?.group?.faction || 'oda', name: '戦況の知らせ' });
}

// 館内の本陣は主屋と脇屋の外に並べ、西の虎口へ通じる空間を残す。
// https://shiroexpo-shiga.jp/column/no17/
// 建物は残っておらず、庭の配置は復元。既存の百十人を使い、野戦の兵は抜かない。
function mitamuraHonjinPeople() {
  const slots = [], people = [{ x: MITAMURA.x + 10.5, z: MITAMURA.z - 1.5, k: 'seated' }];
  for (let z = 10.5; z >= -10.5; z -= 1.5) for (let x = -13.5; x <= 13.5; x += 1.5) {
    if (Math.abs(x) < 8 && z > -8 && z < 4) continue; // 主屋と軒先
    if (x < -6 && z > 0 && z < 8) continue; // 脇屋と軒先
    if (x < -6 && Math.abs(z) < 3) continue; // 西の門から入る通路
    if (Math.hypot(x - 10.5, z + 1.5) < 2) continue; // 床几の周り
    slots.push({ x: MITAMURA.x + x, z: MITAMURA.z + z });
  }
  // 旗十五、侍二十一、槍七十三と床几一人。元の本陣と同じ内訳で庭へ散らす。
  let samurai = 21;
  for (let i = 0; i < 109; i++) {
    const flag = i < 105 && i % 7 === 0;
    const k = flag ? 'banner' : samurai-- > 0 ? 'samurai' : 'spear';
    people.push({ ...slots[Math.floor(i * slots.length / 109)], k });
  }
  return people;
}

// 三田村氏館：土塁の四辺＋門＋屋敷。「高」では土塁上に板塀を足し、西の門口を空ける。
function mitamuraYakata(rt) {
  const W = rt.world;
  const detailed = true, wallParts = [];
  // 土塁の上は暗い縦板と内側の横桟。館の囲いの推定で、写真の城郭の縄張りは移さない。
  const board = (x, y, z, w, h, d, rot, seed) => {
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const p = g.attributes.position, colors = new Float32Array(p.count * 3), color = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) / h + .5;
      color.setHex(t < .1 ? 0x403b2f : 0x81745e).multiplyScalar(.84 + (seed % 7) * .035);
      color.toArray(colors, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.rotateY(rot); g.translate(x, y, z); wallParts.push(g);
  };
  const cx = MITAMURA.x, cz = MITAMURA.z, hw = MITAMURA_HALF, hd = MITAMURA_HALF;
  const seg = [[cx - hw, cz - hd, cx + hw, cz - hd], [cx + hw, cz - hd, cx + hw, cz + hd], [cx + hw, cz + hd, cx - hw, cz + hd], [cx - hw, cz + hd, cx - hw, cz - hd]];
  const nrm = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const earth = (s, nx, nz) => {
    const [ax, az, bx, bz] = s, x = (ax + bx) / 2, z = (az + bz) / 2;
    const top = W.heightAt(x, z) + MITAMURA_BANK_HEIGHT;
    // 高さのある当たりは頂を越えれば通す。永久の壁にして退路を塞がない。
    const solid = solidSeg(ax, az, bx, bz, 0.15);
    solid.yTop = top + (detailed ? 1.4 : 0);
    if (detailed) {
      Object.assign(solid, { missileH: MITAMURA_BANK_HEIGHT + 1.4, missileType: 'wood' });
      const first = wallParts.length;
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / .38), rot = Math.atan2(nx, nz);
      for (let i = 0; i < n; i++) {
        const t = (i + .5) / n;
        board(ax + (bx - ax) * t, top + .7, az + (bz - az) * t,
          len / n - .014, 1.4, .065, rot, i);
      }
      for (const h of [.3, 1.1]) board(x + nx * .09, top + h, z + nz * .09,
        len, .1, .1, rot, 3);
      for (let i = 0, nPost = Math.ceil(len / 2); i <= nPost; i++) {
        const t = i / nPost;
        board(ax + (bx - ax) * t + nx * .12, top + .68, az + (bz - az) * t + nz * .12,
          .13, 1.55, .13, rot, i);
      }
      // 写真の板塀の笠は薄い板葺き。瓦や石垣を足さず、両側へ水を落とす。
      // 板の割り・取り替え跡を塀と同じ結合形へ入れ、門の開口は覆わない。
      for (let i = 0; i < n; i++) for (const side of [-1, 1]) {
        const t = (i + .5) / n, g = new THREE.BoxGeometry(len / n - .008, .045, .31).toNonIndexed();
        const colors = new Float32Array(g.attributes.position.count * 3);
        const color = new THREE.Color(i % 9 === 3 ? 0x8c7757 : 0x625b4c).multiplyScalar(.92 + (i % 4) * .04);
        for (let j = 0; j < g.attributes.position.count; j++) color.toArray(colors, j * 3);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        g.rotateX(side * .3); g.translate(0, 0, side * .145); g.rotateY(rot);
        g.translate(ax + (bx - ax) * t, top + 1.51, az + (bz - az) * t);
        wallParts.push(g);
      }
      // 土塁と同じ地面へ沿わせ、四隅で板塀の裾が浮かないようにする。
      for (let i = first; i < wallParts.length; i++) {
        const p = wallParts[i].attributes.position;
        for (let j = 0; j < p.count; j++)
          p.setY(j, p.getY(j) + W.heightAt(p.getX(j), p.getZ(j)) - (top - MITAMURA_BANK_HEIGHT));
        wallParts[i].computeVertexNormals();
      }
    }
    for (const side of [-1, 1]) {
      const dx = nx * side, dz = nz * side;
      W.scene.add(dorui(W, s, dx, dz, { w: 2.6, h: MITAMURA_BANK_HEIGHT }));
      addRamp({ ax: x + dx * 2.3, az: z + dz * 2.3, bx: x, bz: z,
        w: Math.hypot(bx - ax, bz - az), ya: W.heightAt(x + dx * 2.3, z + dz * 2.3), yb: top });
    }
  };
  for (let i = 0; i < seg.length; i++) if (i !== 3) earth(seg[i], nrm[i][0], nrm[i][1]);
  for (const s of [[cx - hw, cz + hd, cx - hw, cz + 3], [cx - hw, cz - 3, cx - hw, cz - hd]]) earth(s, 1, 0);
  // 北郭は既存の土塁の形・材質を共用し、建物や板塀の形まで推定しない。
  // 西の土橋から北へ退く兵と、館の西で組み合う前線の通り道は空ける。
  const northBanks = makeSimpleBatch();
  for (const [ax, az, bx, bz, nx, nz] of MITAMURA_NORTH_BANKS) {
    const s = [cx + ax, cz + az, cx + bx, cz + bz];
    const x = (s[0] + s[2]) / 2, z = (s[1] + s[3]) / 2;
    const top = W.heightAt(x, z) + MITAMURA_BANK_HEIGHT;
    solidSeg(...s, 0.15).yTop = top;
    for (const side of [-1, 1]) {
      const dx = nx * side, dz = nz * side;
      dorui(W, s, dx, dz, { w: 2.6, h: MITAMURA_BANK_HEIGHT, batch: northBanks });
      addRamp({ ax: x + dx * 2.3, az: z + dz * 2.3, bx: x, bz: z,
        w: Math.hypot(bx - ax, bz - az), ya: W.heightAt(x + dx * 2.3, z + dz * 2.3), yb: top });
    }
  }
  finalizeSimpleBatch(rt, northBanks);
  if (wallParts.length) {
    const wall = new THREE.Mesh(mergeGeometries(wallParts), new THREE.MeshStandardMaterial({
      map: woodTex(), vertexColors: true, roughness: .95 }));
    wall.castShadow = true; wall.receiveShadow = true; wall.userData.camBlock = true;
    W.scene.add(wall); wallParts.forEach(g => g.dispose());
  }
  W.scene.add(kabukimon(W, cx - hw, cz, 5.2, -Math.PI / 2));
  // 西の虎口から主屋の脇へ入る。建物の間取りは遺構の実測ではなく用途に合わせた推定。
  W.scene.add(hut(W, cx, cz - 2, 13, 9, 0, { wall: 0x6a5a44, minka: false, ita: detailed,
    boardRoof: detailed, weatheredBoards: true, boardRoofColors: [0x82705a, 0x746657, 0x957753, 0x6f6557],
    interior: { name: '三田村氏館の主屋', kind: 'yashiki', profile: 'anegawa', team: 1 } }));
  W.scene.add(hut(W, cx - 10, cz + 4, 6, 5, Math.PI * 0.5, { wall: 0x6a5a44, minka: false, ita: detailed,
    boardRoof: detailed, weatheredBoards: true, boardRoofColors: [0x746651, 0x8b7254, 0x6c6152],
    interior: { name: '三田村氏館の脇屋', kind: 'kura', profile: 'anegawa', team: 1 } }));
}

// 西の虎口・土橋を通り、館外の北への道へ退く。退路と所要時間は遊び用の復元。
// 西辺の虎口の根拠：https://shiroexpo-shiga.jp/column/no17/
// 庭の百十人をそのまま動かす。横隊全体の平行移動では塀・堀・主屋を突き抜けてしまう。
function mitamuraRetreat(rt) {
  const A = rt.flags.akDA[1].m.army, P = A.parts, W = rt.world;
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), routes = [];
  for (let i = 0; i < A.n; i++) {
    matrix.fromArray(A.base, i * 16); matrix.decompose(pos, rotation, scale);
    const x = pos.x - MITAMURA.x, z = pos.z - MITAMURA.z;
    const lane = (i % 2 ? 1 : -1) * 0.7;
    const points = [[pos.x, pos.z]];
    // 東の庭は主屋の南、北の庭は主屋の北を回る。西の脇屋の外には一人幅の道を取る。
    if (x > -8) {
      const side = z <= -8 ? -10.5 : 10.5;
      points.push([pos.x, MITAMURA.z + side], [MITAMURA.x - 14.5, MITAMURA.z + side]);
    } else points.push([MITAMURA.x - 14.5, pos.z]);
    points.push([MITAMURA.x - 14.5, MITAMURA.z + lane],
      [MITAMURA.x - 28, MITAMURA.z + lane], [-232 + lane, -42],
      [-248 + lane, -80], [-248 + lane, -138], [-224 + lane, -180]);
    // 虎口では二列を保ち、道を抜けてから草野川の手前へ分かれる。
    // 全員を二点に重ねず、馬上の武者にも前後の間を取る。百十人と三分の退却時間は保つ。
    // 館と草野川の位置関係は県文化財保護課の解説によるが、この停止位置・並びは復元。
    points.push([-224 + (i % 10 - 4.5) * 2.2, -184 - Math.floor(i / 10) * 2.8]);
    let length = 0;
    const segments = [];
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], dx = b[0] - a[0], dz = b[1] - a[1];
      const d = Math.hypot(dx, dz);
      if (d < 0.001) continue;
      segments.push({ x: a[0], z: a[1], dx, dz, start: length, length: d }); length += d;
    }
    const meshes = [[P.body, i], [P.flags, i]];
    if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) meshes.push([P.banners, j]); }
    // 床几の将も退く時は立つ。形・材質と旗持ちの内訳は使い回す。
    if (A.kinds[i] === 6) {
      A.kinds[i] = 3;
      for (const [mesh, j] of meshes) {
        const info = mesh.geometry.attributes.aInfo;
        info.setY(j, 3); info.needsUpdate = true;
      }
    }
    const delay = i * 0.35;
    routes.push({ i, segments, length, delay, speed: length / (180 - delay), scale: scale.clone(), meshes });
  }
  for (const mesh of [P.body, P.flags, P.banners]) if (mesh) {
    // 移動後も既存の描画範囲判定から消えないよう、退路までの範囲を一度だけ含める。
    mesh.boundingSphere.radius += 220;
  }
  const tick = A.tick;
  let elapsed = 0, next = 0;
  A.tick = (dt) => {
    tick(dt); elapsed = Math.min(180, elapsed + dt);
    A.U.uMarch.value = elapsed < 180 ? 1 : 0;
    if (elapsed < next && elapsed < 180) return;
    next = elapsed + 0.1; // 庭と退路の控えだけを十回毎秒。毎コマ物を作らない。
    for (const r of routes) {
      if (A.taken[r.i]) continue; // 本物へ替わった兵は二重に描かない。
      const d = Math.max(0, Math.min(r.length, (elapsed - r.delay) * r.speed));
      let j = 0;
      while (j < r.segments.length - 1 && d > r.segments[j].start + r.segments[j].length) j++;
      const s = r.segments[j], k = (d - s.start) / s.length;
      const x = s.x + s.dx * k, z = s.z + s.dz * k;
      matrix.makeRotationY(Math.atan2(s.dx, s.dz)).scale(r.scale);
      matrix.setPosition(x, W.heightAt(x, z), z);
      A.base.set(matrix.elements, r.i * 16);
      if (A.hid[r.i] > 0) continue;
      for (const [mesh, n] of r.meshes) { mesh.setMatrixAt(n, matrix); mesh.instanceMatrix.needsUpdate = true; }
    }
    if (elapsed >= 180) A.tick = tick;
  };
}

// 公記の守兵退出と藤吉郎の定番入城を、既存の守兵・包囲兵だけで示す。
// https://ja.wikisource.org/wiki/信長公記
// 虎口で横隊が土塁を抜けないよう、一人ずつ二列の道へ寄せる。経路・速さ・持ち場は復元。
function yokoyamaHandover(rt, group, points, inside, delay) {
  const A = group.m.army, P = A.parts, W = rt.world;
  if (!P || !P.body) return;   // 形がまだ作られていない遠い軍は動かさない（10/28 終幕で落ちた）
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(), routes = [];
  group.m.halt(); A.noWake = true;
  for (let i = 0; i < A.n; i++) {
    matrix.fromArray(A.base, i * 16); matrix.decompose(pos, rotation, scale);
    const lane = (i % 2 ? 1 : -1) * 0.6;
    const path = [[pos.x, pos.z], ...points.map(([x, z]) => [x + lane, z])];
    // 城内では西の庭、城外では北東の空き地へ。井楼・小屋・幟と虎口を空ける。
    const last = points[points.length - 1];
    path.push([last[0] + (inside ? -3.5 + i % 5 * 0.9 : i % 6 * 0.9),
      last[1] + Math.floor(i / (inside ? 5 : 6)) * 0.8]);
    const segments = [];
    let length = 0;
    for (let j = 1; j < path.length; j++) {
      const a = path[j - 1], b = path[j], dx = b[0] - a[0], dz = b[1] - a[1];
      const d = Math.hypot(dx, dz);
      if (d < 0.001) continue;
      segments.push({ x: a[0], z: a[1], dx, dz, start: length, length: d }); length += d;
    }
    const meshes = [[P.body, i], [P.flags, i]];
    if (P.banners) { const j = P.bearers.indexOf(i); if (j >= 0) meshes.push([P.banners, j]); }
    routes.push({ i, segments, length, delay: delay + i * 0.4, scale: scale.clone(), meshes });
  }
  for (const mesh of [P.body, P.flags, P.banners]) if (mesh) mesh.boundingSphere.radius += 100;
  const tick = A.tick;
  let elapsed = 0, next = 0;
  A.tick = (dt) => {
    tick(dt); elapsed += dt;
    if (elapsed < next) return;
    next = elapsed + 0.1;
    let moving = false;
    for (const r of routes) {
      if (A.taken[r.i]) continue;
      const d = Math.max(0, Math.min(r.length, (elapsed - r.delay) * 2));
      if (d < r.length) moving = true;
      if (elapsed < r.delay) continue;
      let j = 0;
      while (j < r.segments.length - 1 && d > r.segments[j].start + r.segments[j].length) j++;
      const s = r.segments[j], k = (d - s.start) / s.length;
      const x = s.x + s.dx * k, z = s.z + s.dz * k;
      matrix.makeRotationY(Math.atan2(s.dx, s.dz)).scale(r.scale);
      matrix.setPosition(x, W.heightAt(x, z), z);
      A.base.set(matrix.elements, r.i * 16);
      if (A.hid[r.i] > 0) continue;
      for (const [mesh, n] of r.meshes) { mesh.setMatrixAt(n, matrix); mesh.instanceMatrix.needsUpdate = true; }
    }
    A.U.uMarch.value = moving && elapsed >= delay ? 1 : 0;
    if (!moving) A.tick = tick;
  };
}

// 包囲兵の先に、尾根上の二つの曲輪を見せる。構えは土と木で作る。
// 設営時に同じ材質の形をまとめ、兵の更新や描く人数には加えない。
function yokoyamaCastle(rt) {
  const W = rt.world, earth = [], fences = [];
  rt.flags.yokoyamaStandards = [];
  for (const { x, z, hw, hd } of YOKOYAMA) {
    // 北の虎口を空け、二つの曲輪を尾根道でつなぐ。
    const edges = [
      [x - hw, z - hd, x - 3, z - hd, 0, 1], [x + 3, z - hd, x + hw, z - hd, 0, 1],
      [x + hw, z - hd, x + hw, z + hd, -1, 0],
      [x + hw, z + hd, x + 3, z + hd, 0, -1], [x - 3, z + hd, x - hw, z + hd, 0, -1],
      [x - hw, z + hd, x - hw, z - hd, 1, 0],
    ];
    for (const [ax, az, bx, bz, nx, nz] of edges) {
      const seg = [ax, az, bx, bz], cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const top = W.heightAt(cx, cz) + 0.8;
      solidSeg(ax, az, bx, bz, 0.15).yTop = top + 1.2;
      const fence = koshisaku(W, seg, { h: 1.2 });
      fence.geometry.translate(0, 0.8, 0); fences.push(fence);
      for (const side of [-1, 1]) {
        const dx = nx * side, dz = nz * side;
        earth.push(dorui(W, seg, dx, dz, { w: 2, h: 0.8, capEnds: true }));
        addRamp({ ax: cx + dx * 1.8, az: cz + dz * 1.8, bx: cx, bz: cz,
          w: Math.hypot(bx - ax, bz - az), ya: W.heightAt(cx + dx * 1.8, cz + dz * 1.8), yb: top });
      }
    }
    const standard = nobori(W, x - 4, z, 'azai', 5);
    rt.scene.add(standard);
    rt.flags.yokoyamaStandards.push(standard);
    if (true) {
      // 寸法と棟の位置は遊びの補い。尾根道と南北の虎口は空ける。
      rt.scene.add(yagura(W, x - hw + 4, z + hd - 4,
        { mon: 'azai', team: 1, boarded: false, fieldFrame: true, barkPosts: true,
          fieldDetail: true, fieldLashings: true, fieldBraces: true, name: '横山城の井楼' }),
      hut(W, x + 4, z + 2, 6, 4, Math.PI / 2,
        { ita: true, minka: false, h: 2.6, wall: 0x71604b, boardRoof: true,
          weatheredBoards: true, boardRoofColors: [0x897354, 0x75644e, 0x9a7c55],
          interior: { name: z === YOKOYAMA[0].z ? '横山城の北の番小屋' : '横山城の南の番小屋',
            kind: 'bansho', profile: 'anegawa', team: 1 } }));
    }
  }
  // 土塁と木柵はそれぞれ一つにまとめ、共通の材質を使い回す。
  for (const parts of [earth, fences]) {
    const mesh = new THREE.Mesh(mergeGeometries(parts.map((m) => m.geometry)), parts[0].material);
    mesh.receiveShadow = true;
    if (parts === fences) { mesh.castShadow = true; mesh.userData.camBlock = true; }
    W.scene.add(mesh);
    for (const m of parts) m.geometry.dispose();
  }
}

// 写真の形を参考にした陣具の補い。姉川に連続した三段柵があったという復元ではない。
// 前線の渡河・乱戦と退路を避け、本陣の脇と既存の控えの端だけに据える。
function anegawaFieldWorks(rt) {
  const W = rt.world, batch = makeSimpleBatch();
  for (const seg of [[-52, 34, -52, 44], [-52, 44, -40, 44], [66, 26, 52, 26]]) {
    bobosaku(W, seg, { batch, noTrench: true, noMound: true, fieldSplices: true });
    Object.assign(solidSeg(...seg, .18), { yTop: W.heightAt(seg[0], seg[1]) + 2.35,
      missileH: 2.35, missileType: 'wood' });
  }
  finalizeSimpleBatch(rt, batch);
  // 木地の置楯を二枚ずつ、隙間を空けて据える。表は外へ、中央の通路は閉じない。
  // 家紋を想像で足さず、紋は既存の陣幕と家ごとの幟で示す。
  const shields = [];
  for (const [x, z, facing] of [[HQ.x - 13, HQ.z - 8, -Math.PI / 2],
    [HQ.x + 13, HQ.z - 8, Math.PI / 2]]) {
    const m = tateNarabi(W, x, z + (facing < 0 ? 3 : -3), x, z + (facing < 0 ? -3 : 3),
      { fieldPairs: true, fieldTimber: true });
    shields.push(m);
  }
  const boards = new THREE.Mesh(mergeGeometries(shields.map(m => m.geometry)), shields[0].material);
  boards.castShadow = true; boards.receiveShadow = true; boards.userData.camBlock = true;
  rt.scene.add(boards);
  for (const m of shields) m.geometry.dispose();
  // 据え竹束は四基だけ。近くは細竹を密に詰め、遠くは共通の粗い形へ戻す。
  for (const [x, z, rot] of [[HQ.x - 14, HQ.z + 4, -Math.PI / 2],
    [HQ.x + 14, HQ.z + 4, Math.PI / 2], [48, 30, Math.PI], [64, 30, Math.PI],
    // 森の先手の持ち場の川前にも二基。正面の通り道（POST の前）は空け、左右の岸の上に据える（10/28）
    [POST.x - 15, 16, Math.PI - 0.15], [POST.x + 9, 16, Math.PI + 0.2]])
    rt.scene.add(takataba(W, x, z, rot, { fieldBundle: true, fieldTrestle: true }));
  // 森の先手の陣所：持ち場の左後ろに小さな陣幕。口は後ろ（南）へ開け、川前の隊列と通り道には掛けない（10/28）
  rt.scene.add(jinmaku(W, POST.x - 30, POST.z + 12, 10, 6, 4, { mon: 'oda' }));
  // 屋根のない四本柱の組上げ井楼。遠景は横木を半数にした共有形に切り替わる。
  for (const [x, z, mon, team] of [[HQ.x - 20, HQ.z + 9, 'oda', 0],
    [MITAMURA.x + 12, MITAMURA.z + 6, 'asakura', 1]])
    rt.scene.add(yagura(W, x, z, { mon, team, boarded: false, fieldFrame: true, barkPosts: true,
      fieldGallery: true, fieldDetail: true, fieldLashings: true, fieldBraces: true }));
  // 幕の左右に同じ家の旗を列で並べる。会戦の隊列と兵の数は変えない。
  for (const [cx, cz, mon] of [[HQ.x, HQ.z, 'oda'], [MITAMURA.x, MITAMURA.z, 'asakura']])
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++)
      rt.scene.add(nobori(W, cx + side * 10, cz - 8 + i * 5, mon, 5));
  // 控えの柵の外に板葺きの雨よけと荷台。通路と実兵の当たりには加えない。
  // 二か所とも同じ形・木目を使い、前景でも陣の用途と組み方が読めるようにする。
  const timbers = [];
  const beam = (w, h, d, x, y, z, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d); g.rotateX(rx); g.rotateZ(rz); g.translate(x, y, z); timbers.push(g);
  };
  for (const x of [-1.4, 1.4]) {
    beam(0.12, 2.15, 0.12, x, 1.075, -0.9);
    beam(0.12, 1.65, 0.12, x, 0.825, 0.9);
    beam(0.1, 0.12, 2.3, x, 1.94, 0, 0.27);
    beam(0.1, 0.95, 0.1, x, 1.5, -0.58, -0.65);
  }
  beam(3.1, 0.12, 0.14, 0, 2.12, -0.9);
  beam(3.1, 0.12, 0.14, 0, 1.63, 0.9);
  // 柱頭の方杖・屋根の桟・荷台の足を同じ束へ入れ、板が宙に浮いた形をなくす。
  for (const sd of [-1, 1]) {
    beam(.09, .78, .09, sd * 1.15, 1.82, -.9, 0, sd * .65);
    beam(.09, .66, .09, sd * 1.19, 1.38, .9, 0, sd * .65);
    for (const z of [-.55, .4]) beam(.14, .3, .14, sd * 1.05, .15, z);
  }
  for (const z of [-.8, 0, .8]) beam(3.1, .08, .09, 0, 1.99 - z * .27, z);
  for (let i = 0; i < 12; i++) beam(0.285, 0.05, 2.55 + (i % 3 - 1) * .06, (i - 5.5) * 0.28, 2.04, (i % 2) * .035, 0.27);
  for (let i = 0; i < 4; i++) beam(2.5, 0.09, 0.22, 0, 0.3, -0.55 + i * 0.32);
  // 軍需の木箱。板の隙間と二本の桟まで既存の木目一枚・一つの形で描く。
  for (const cx of [-.7, .45]) {
    for (let j = 0; j < 4; j++) {
      const y = .43 + j * .14;
      for (const z of [-.37, .25]) beam(.83, .125, .045, cx, y, z);
      for (const sd of [-1, 1]) beam(.045, .125, .62, cx + sd * .42, y, -.06);
      beam(.19, .045, .62, cx + (j - 1.5) * .21, .94, -.06);
    }
    for (const sd of [-1, 1]) beam(.065, .62, .065, cx + sd * .28, .66, -.41);
  }
  const shelterGeo = mergeGeometries(timbers);
  for (const g of timbers) g.dispose();
  const shelter = new THREE.InstancedMesh(shelterGeo,
    new THREE.MeshStandardMaterial({ color: 0x76634b, map: woodTex(), roughness: 0.95 }), 2);
  const frame = new THREE.Object3D();
  for (const [i, x, z] of [[0, -56, 40], [1, 62, 30]]) {
    frame.position.set(x, W.heightAt(x, z), z); frame.rotation.y = i ? Math.PI : 0;
    frame.updateMatrix(); shelter.setMatrixAt(i, frame.matrix);
  }
  shelter.instanceMatrix.needsUpdate = true; shelter.castShadow = true; shelter.receiveShadow = true;
  W.scene.add(shelter);
}

// 本の野戦道具の、丸太・横木・縄で組む陣の手触りを炊事場にも残す。
// 炊事場の位置と道具の並びは復元。朝の残り火だけにし、照明や兵は増やさない。
function anegawaCampLife(rt) {
  const W = rt.world, parts = [[], [], []];
  const put = (kind, geo, x, y, z, color, rx = 0, ry = 0, rz = 0) => {
    geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z);
    const c = new THREE.Color(color), colors = new Float32Array(geo.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) { colors[i] = c.r; colors[i + 1] = c.g; colors[i + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3)); parts[kind].push(geo);
  };
  const pole = (r, length, x, y, z, rx = 0, rz = 0) =>
    put(0, new THREE.CylinderGeometry(r * .8, r, length, 5), x, y, z, 0x77634a, rx, 0, rz);
  const ring = (kind, radius, tube, x, y, z, color, rx = Math.PI / 2) =>
    put(kind, new THREE.TorusGeometry(radius, tube, 3, 12), x, y, z, color, rx);
  // 灰をかぶった小さな炉。石の隙間から熾火が少し見え、鉄鍋の口は開けておく。
  put(1, new THREE.CylinderGeometry(.62, .69, .045, 12), 0, .025, 0, 0x61584a);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    put(1, new THREE.SphereGeometry(1, 5, 3).scale(.16, .1, .13),
      Math.sin(a) * .49, .09, Math.cos(a) * .49, 0x817968);
  }
  for (let i = 0; i < 4; i++) {
    put(2, new THREE.BoxGeometry(.07, .045, .48), (i - 1.5) * .11, .08, 0,
      i % 2 ? 0x7c3b1e : 0x302c27, 0, i * .7);
  }
  put(2, new THREE.CylinderGeometry(.34, .23, .29, 12, 1, true), 0, .37, 0, 0x373936);
  put(2, new THREE.CircleGeometry(.23, 12), 0, .225, 0, 0x282c29, -Math.PI / 2);
  ring(2, .34, .025, 0, .515, 0, 0x4b4d46);
  for (const side of [-1, 1]) ring(2, .07, .014, side * .34, .43, 0, 0x45473e, 0);
  // 二股の支柱と横木、鍋を吊る鉤。結び目も同じ縄の形を使う。
  for (const side of [-1, 1]) {
    pole(.055, 1.25, side * .66, .61, 0, 0, side * .12);
    for (let i = 0; i < 3; i++) ring(1, .075, .014, side * .59, 1.12 + i * .035, 0, 0xa18c60);
  }
  pole(.045, 1.7, 0, 1.2, 0, 0, Math.PI / 2);
  put(2, new THREE.CylinderGeometry(.012, .012, .62, 4), 0, .88, 0, 0x353831);
  ring(2, .27, .014, 0, .53, 0, 0x41443c, 0);
  // 割り薪は乱れた小積み。荷の籠は口・縦骨・横編みを残し、箱との違いを形で示す。
  for (let i = 0; i < 9; i++) pole(.065, .65 + (i % 3) * .09,
    1.28 + (i % 3) * .13, .07 + Math.floor(i / 3) * .11, .18, Math.PI / 2, (i % 2) * .1);
  for (const [x, z, r, h] of [[-1.25, .35, .28, .52], [-1.75, .55, .22, .4]]) {
    put(1, new THREE.CylinderGeometry(r, r * .75, h, 10, 1, true), x, h / 2, z, 0x88764e);
    for (let j = 0; j < 6; j++) ring(1, r * (.75 + j * .05), .015, x, .035 + j * (h - .045) / 5, z, 0xb19a69);
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4;
      put(1, new THREE.CylinderGeometry(.012, .012, h, 3),
        x + Math.sin(a) * r * .88, h / 2, z + Math.cos(a) * r * .88, 0xc1a876,
        Math.cos(a) * .12, 0, -Math.sin(a) * .12);
    }
    // 籠の底を暗く塞ぎ、地面まで透けた筒にしない。
    put(1, new THREE.CircleGeometry(r * .75, 10), x, .025, z, 0x594f37, -Math.PI / 2);
  }
  // 天秤棒と巻いた縄。人を置かず、足軽が運んだ兵糧の用を読ませる。
  pole(.035, 1.8, -1.45, .58, .55, 0, Math.PI / 2 - .12);
  for (let i = 0; i < 4; i++) ring(1, .17 + i * .025, .018, 1.28, .04, -.47, 0xa18c60);
  const geometries = parts.map((list) => mergeGeometries(list));
  for (const list of parts) for (const geo of list) geo.dispose();
  const materials = [
    new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex() }),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  ];
  // 前線の通路・瀬・田の内側を避け、雨よけの外と本陣の裏の三か所だけ。
  // 三つの材質と形を共用。遠くの小道具は描かず、毎コマ動かす処理も持たない。
  for (const [x, z, angle] of [[-59, 43, .3], [68, 35, -.5], [HQ.x - 15, HQ.z + 16, 1.2]]) {
    const lod = new THREE.LOD(), near = new THREE.Group();
    lod.position.set(x, W.heightAt(x, z), z); lod.rotation.y = angle;
    for (let i = 0; i < geometries.length; i++) {
      const mesh = new THREE.Mesh(geometries[i], materials[i]); mesh.receiveShadow = true; near.add(mesh);
    }
    lod.addLevel(near, 0); lod.addLevel(new THREE.Group(), 55, .15); rt.scene.add(lod);
  }
  // 風に流れる細い炊煙は後方の一筋だけ。既存の煙の粒と距離による省略を使う。
  if (!SETTINGS.reduceMotion) W.addSmokeColumn(HQ.x - 15, W.heightAt(HQ.x - 15, HQ.z + 16) + .55,
    HQ.z + 16, { size: .35 });
}

// 浅井・朝倉の兵の見た目（家ごとに甲冑の色と旗を変える）
const AZAI = { armor: 0x2e2a26, lace: 0x3c5a48, flag: 'azai' };
// 日の向きを南寄りへ回す角（上から見て時計回り。東南東 → 南南西）
const SUN_UP = new THREE.Vector3(0, 1, 0), SUN_TURN = -75 * Math.PI / 180;
const ASAKURA = { armor: 0x33291f, lace: 0x7a5a2a, flag: 'asakura' };
const INABA = { flag: 'inaba', armor: 0x33302a, lace: 0x5a4a2a };   // 稲葉一鉄ら西美濃の衆は、もと斎藤の家臣
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || (!g.anePending && g.count === 0) || g.routed;
// 本陣の危険は部隊の平均位置ではなく、そこまで来た戦える兵から読む。
function anegawaHqPressure(rt, dt) {
  const F = rt.flags, team = rt.player.u.team;
  const warned = F.hqThreat > 0, breached = !!F.hqBreached;
  const lineBroken = !anegawaLineSoldier(F.mori);
  let approaching = 0, attackers = 0, intruders = 0, defenders = 0, nearest = Infinity;
  let intruder = null, intruderDistance = Infinity;
  F.hqEnemy = null;
  for (const u of rt.army.units) {
    if (!u.alive || u.gone || u.noTarget || u.isStruct || u.fleeing || u.group?.routed ||
        u.woundOut || u.rearWound || u.downed || u.dropped) continue;
    const dx = u.pos.x - HQ.x, dz = u.pos.z - HQ.z, d2 = dx * dx + dz * dz;
    if (u.team !== team) {
      // 西や東の押し合いだけでは帰陣させない。本陣へ通じる道に迫った兵を読む。
      // 警戒解除には余裕を持たせ、森の備を抜ける前に戻る時間を残す。
      // 川前から本陣前までは百三十歩ほどある。池田の後ろへ抜けた時点で帰陣を知らせる。
      if (d2 < (warned ? 110 * 110 : 100 * 100) && Math.abs(dx) < (warned ? 55 : 45) &&
          (warned || lineBroken || u.pos.z > MORI.z - 45)) {
        approaching++;
        const post = F.hqDefend ? F.hqDefensePos : F.hqGuardPos;
        const gap = (u.pos.x - post.x) ** 2 + (u.pos.z - post.z) ** 2;
        if (gap < nearest) { nearest = gap; F.hqEnemy = u; }
      }
      if (d2 < 22 * 22) {
        attackers++;
        // 守備の旗は本陣の北十六歩。北側での押し合いだけで守備失敗にしない。
        if (dz > -6) {
          intruders++;
          const gap = (u.pos.x - rt.player.u.pos.x) ** 2 + (u.pos.z - rt.player.u.pos.z) ** 2;
          if (gap < intruderDistance) { intruderDistance = gap; intruder = u; }
        }
      }
    } else if (d2 < 22 * 22) defenders += u === rt.player.u ? 4 : 1;
  }
  // 下知どおり本陣へ戻った本人は、組の数人分の守りに数える（戻っても数で押し負ける崩れを防ぐ。10/28 bot が帰陣後に毎回敗れた）。
  F.hqThreat = approaching > 0 ? 1 : 0;
  F.hqBreached = intruders >= 3;
  if (F.hqBreached) F.hqEnemy = intruder;
  // 味方が食い止めている間は敗北を進めない。押し返せば危険も薄れる。
  // 本人が本陣の内で戦っている間は、崩れの進みを半分にする（戻って戦う者を、大波一つで負けにしない。10/28）
  const P = rt.player.u, inside = P.alive && (P.pos.x - HQ.x) ** 2 + (P.pos.z - HQ.z) ** 2 < 24 * 24;
  F.hqLostT = F.hqThreat && F.hqBreached && attackers > defenders
    ? (F.hqLostT || 0) + dt * (inside ? 0.5 : 1) : Math.max(0, (F.hqLostT || 0) - dt * 2);
  if (warned !== !!F.hqThreat || breached !== F.hqBreached) { F.taskAt = 0; F.taskChangedAt = -10; }
}
function pressureWarning(rt, line, interval = 8) {
  const F = rt.flags;
  if (rt.over || F.ending || (F.pressureWarnT ?? -99) + 8 > rt.t) return;
  if (interval === 30 && (F.windupWarnT ?? -99) + 30 > rt.t) return;
  if (interval === 30) F.windupWarnT = rt.t;
  F.pressureWarnT = rt.t;
  // 稲生の水準：指図の字は出さない（危険は縁の矢印と敵の▼で示す）。
}
// 試遊では鉄砲より足軽・侍の傷が重なった。傷は変えず、実際の味方の列で追手を受ける。
function coverRetreat(rt) {
  const F = rt.flags, army = rt.army, P = rt.player.u;
  if ((F.coverCheckAt ?? -1) > rt.t) return;
  F.coverCheckAt = rt.t + 0.18;
  const hurt = P.hp < P.maxHp * 0.4;
  const allies = F.coverAllies;
  allies.length = 0;
  let closing = 0, caught = false;
  for (const a of army.units) {
    if (!a.alive || a === P || a.isStruct || a.noTarget || a.fleeing || a.woundOut || a.rearWound || a.downed || a.dropped || a.group?.routed) continue;
    const d = Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z);
    if (a.team !== P.team) {
      if (d < 9 && (a.sidearm || a.type !== 'gun' && a.type !== 'bow') && a.target === P) closing++;
    } else if (d < (hurt ? 9 : 5) && !a.mounted && (a.sidearm || a.type === 'ashigaru' || a.type === 'samurai' || a.type === 'busho') &&
        !(a.stagger > 0) && !(a.pinT > army.time) && Math.abs(a.pos.y - P.pos.y) < 1.8 && !army.wallBetween(P.pos, -1, a.pos)) allies.push(a);
  }
  // 人数だけでは横から来たと決めない。向きは目前の危険札で示す。
  if (closing >= 3) pressureWarning(rt, F.hqThreat || F.hqDefend
    ? '本陣が危ない！　構えて、味方と本陣前へ下がれ'
    : '敵が押し寄せるぞ！　穂先を向け、味方の列へ退け');
  if (allies.length < (hurt ? 1 : 2)) return;
  for (const e of army.units) {
    if (!e.alive || e.team === P.team || e.fleeing || e.group?.routed || e.noTarget || e.target !== P ||
        !e.sidearm && (e.type === 'gun' || e.type === 'bow')) continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d2 = dx * dx + dz * dz;
    // 重傷なら横の味方も助けに入る。振り出した一撃は止めず、次の追撃を受け持つ。
    if (d2 > 144 || !hurt && d2 <= (e.reach + 0.6) ** 2 || e.swing && !e.swing.done) continue;
    let defender = null, best = 6;
    for (const a of allies) {
      const ax = a.pos.x - P.pos.x, az = a.pos.z - P.pos.z;
      const along = (ax * dx + az * dz) / Math.max(0.01, d2);
      if (!hurt && (along < 0.15 || along > 0.9 || (ax - along * dx) ** 2 + (az - along * dz) ** 2 > 2.2 ** 2)) continue;
      const d = Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z);
      if (d < best && Math.abs(a.pos.y - e.pos.y) < 1.8 && !army.wallBetween(e.pos, -1, a.pos)) { defender = a; best = d; }
    }
    if (!defender) continue;
    if (e.atk?.target === P) e.atk = null;
    e.target = defender; e.moveTo = null; e.aiT = Math.max(e.aiT, 0.6); e.cd = Math.max(e.cd, hurt ? 1.6 : 0.7);
    if (!defender.atk && !defender.swing) { defender.target = e; defender.aiT = 0.6; }
    caught = true;
  }
  // 一人の追手を引き受けても、本陣の突破が止まったとは限らない。
  if (caught) pressureWarning(rt, F.hqThreat || F.hqDefend
    ? anegawaReturning(rt) ? '味方が追手を受ける。今のうちに本陣の旗へ戻れ' : anegawaHqWatchText(rt)
    : '味方が追手を受ける。槍の後ろで息を整えよ');
}
// 今の下知は一件だけ。普段は十秒保ち、危険と段の切り替わりはすぐ知らせる。
function anegawaObjective(rt, id, text, urgent = false) {
  const F = rt.flags;
  let current = null;
  for (const o of rt.objectives) if (o.id === id) { current = o; break; }
  if (current?.text === text || !urgent && current && rt.t < (F.taskChangedAt ?? -10) + 10) return;
  F.taskChangedAt = rt.t;
  rt.obj(id, text, 'main', true);
  rt.objProgress(id, '');
}

// 姉川だけの札と声。任務の成否・手柄は元の筋書きで判定する。
function anegawaNotices(rt) {
  const root = rt.hud.root;
  // 待機専用の白い輪も、姉川では中心の小さな印にそろえる。
  // 共通の描画を直接呼ぶ経路があるため、この戦の描画だけ差し替える。
  const waitFrame = rt.hud.drawWaitFrame;
  const smallWaitFrame = function (g, battle, pos, radius) {
    return battle === rt ? this.drawTargetFootRing(g, battle, pos, 0.65)
      : waitFrame.call(this, g, battle, pos, radius);
  };
  rt.hud.drawWaitFrame = smallWaitFrame;
  // 守備中の味方の掛け声も下知にそろえる。声と字幕は同じ既存の節を使う。
  const soldierCall = rt.soldierCall.bind(rt);
  rt.soldierCall = (key, pos, who = '兵') => {
    const F = rt.flags;
    if (key === 'advance' && who.startsWith('味方') && F.step < 2 &&
        (!F.inabaT || F.hqThreat || F.hqDefend)) key = 'spear';
    return soldierCall(key, pos, who);
  };
  // 共通の札にある姉川用の配置を有効にする。地図から離し、二行の本文も収める。
  root.classList.add('anegawa-notices');
  // 矢をよける印も通常の退き先と同じ岸の判定を使う。追撃の下知後は渡れる。
  rt.army.hooks.rainEscapePointAllowed = (point) => anegawaGuidePointAllowed(rt, point);
  const dispose = rt.world.dispose.bind(rt.world);
  rt.world.dispose = () => {
    if (rt.hud.drawWaitFrame === smallWaitFrame) rt.hud.drawWaitFrame = waitFrame;
    root.classList.remove('anegawa-notices'); dispose();
  };
  // 落下範囲の独立札は任務と重なる。既存の三枠へ一件だけ入れる。
  rt.army.hooks.onArrowRain = (rain, under) => {
    if (!under || rt.t < 5 || rt.over || rt.ended) return;
    rt.flags.rainNoticeUntil = Math.max(rt.flags.rainNoticeUntil || 0, rt.t + rain.T - rain.t + 0.4);
    rt.hud.notices.push('矢が来る！ 印へよけよう', 110, Math.max(0.5, rain.T - rain.t + 0.4), 'warn',
      () => !rt.over && !rt.ended && rt.player.u.alive && rain.t < rain.T + 0.4 &&
        Math.hypot(rt.player.u.pos.x - rain.x, rt.player.u.pos.z - rain.z) < rain.r + 4);
  };
  const bark = rt.bark.bind(rt);
  rt.bark = (text, warn) => {
    // 落ちる矢の札がある間は、同じ危険の声を二枚目にしない。
    if (/矢が来る|矢じゃ|矢の雨|笠を傾け|矢が降る/.test(text) && rt.t < (rt.flags.rainNoticeUntil || 0)) return;
    // 横長の携帯で二行目が切れないよう、目前の一撃は短く知らせる。
    if (/刃が光った/.test(text)) text = '刃が光った。敵を向いて構えよ';
    else if (/大きく振りかぶった/.test(text)) text = '振りかぶったぞ。構えて下がれ';
    else if (/味方の後ろへ下がれ/.test(text)) text = text.replace(/味方の後ろへ下がれ/g, '味方の後ろへ退け').replace(/一撃を受けた/g, '一撃');
    return bark(text, warn);
  };
  // 姉川の押し返しと追撃は、守備や敵の退却とは別の合図にする。
  const signalCue = rt.signalCue.bind(rt);
  rt.signalCue = (o) => {
    const F = rt.flags;
    const kind = /浅井を押せ/.test(o.text) ? 'kakari' : /しんがりを追え/.test(o.text) ? 'susume' : null;
    if (!kind) {
      // 敵のしんがりを攻める札を、味方の退きの下知と取り違えない。
      if (/殿|しんがり/.test(o.text) && !/退け|退き口|へ退く|引き上げ|撤退|落ち延び|逃れ/.test(o.text)) return;
      return signalCue(o);
    }
    if (o.kind !== 'main' || rt.over || F.quiet) return;
    const cues = rt.cueAt || (rt.cueAt = {});
    o.cue = kind === 'kakari' ? '早い太鼓で、押し返せ' : '進む合図。川を渡れ';
    if ((cues[kind] ?? -99) + 30 > rt.t) { o.cueT = cues[kind]; return; }
    o.cueT = cues[kind] = rt.t;
    rt.army.playFar('sig_' + kind, kind === 'kakari' && F.inaba ? F.inaba.center() : MORI, 1);
  };
  const obj = rt.obj.bind(rt), done = rt.objDone.bind(rt), fail = rt.objFail.bind(rt);
  rt.obj = (id, text) => {
    if (id !== 'main' && id !== 'pursue') { rt.objRemove(id); return null; }
    for (let i = rt.objectives.length - 1; i >= 0; i--) {
      const old = rt.objectives[i];
      if (old.id !== id) rt.objRemove(old.id);
    }
    // 届く前の古い札が、新しい下知を後から上書きしない。
    rt.orderObjectives?.clear();
    return obj(id, text, 'main', true);
  };
  rt.objDone = (id) => { done(id); rt.objRemove(id); };
  rt.objFail = (id) => {
    fail(id); rt.objRemove(id);
    if (id === 'flank' && !rt.flags.flankFailedNotice) {
      rt.flags.flankFailedNotice = true;
      rt.flags.taskChangedAt = -10; rt.flags.taskAt = 0;
    }
  };
  // 任務の下に別の命令文を継ぎ足さない。
  rt.objProgress = () => {};
  const say = rt.say.bind(rt);
  rt.say = (who, line, dur) => {
    // 遠い大将の旗を目標と取り違えず、今の岸の持ち場を保つ。
    if (who === '物見' && /敵の奥の方に、大きな旗/.test(line)) line = '敵本陣は対岸の奥。今は岸を守れ';
    // 本陣の使番が届けた下知にも、姉川の任務と行き先を合わせる。
    if (who === '使番' && /殿の本陣に敵が迫/.test(line) && rt.flags.step === 1) {
      rt.flags.hqReported = true; rt.flags.taskAt = 0; rt.flags.taskChangedAt = -10;
    }
    if (/柴田勝家/.test(who) && /無念/.test(line)) {
      const u = rt.flags.shibata?.units.find((v) => v.name === '柴田勝家');
      if (!u || u.alive && !u.downed) line = '仲間の持ち場を支えよ！　槍の列を空けるな！';
    }
    // この戦は手ほどきの後。危険は戦場の声で知らせ、操作の説明を字幕に混ぜない。
    if (!who && /押せば|押したまま|クリック/.test(line)) {
      return;
    }
    say(who, line, dur);
  };
  const hint = rt.hint.bind(rt);
  rt.hint = (id) => { if (!/^(attack|guard|combo|charged|sweep|parry|waza|blocked)/.test(id)) hint(id); };
}

// 田の近景だけ細かくする。位置・水の減速・季節は元の田の定義を使う。
// 設営時に泥と薄い水膜を同じ面へまとめ、稲は既存の株を使い回す。
function anegawaPaddy(rt) {
  const W = rt.world, paddy = W.def.paddy;
  // 粗い地面の田の反射を外す。専用の細かな水膜に重ねると、
  // 低画質では八歩以上の三角面が田の外まで白く光ってしまう。
  const coarseWater = W.terrain.geometry.getAttribute('water');
  if (coarseWater) { coarseWater.array.fill(0); coarseWater.needsUpdate = true; }
  const soil = [], colors = [], cover = [], dampness = [], indices = [];
  const step = 0.75, nx = 176, nz = 104;
  const wet = (x, z) => {
    const a = Math.sin(x * 0.47 + Math.cos(z * 0.31)) * Math.cos(z * 0.53 - x * 0.12);
    return aneSmooth((a - 0.38) / 0.3);
  };
  const ridge = (x, z) => Math.pow(0.5 + 0.5 * Math.cos(x * Math.PI * 2 / 1.5 + Math.sin(z * 0.28) * 0.3), 4);
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = -30 + i * step, z = 50 + j * step, pd = paddy(x, z);
    // 通った轍では畝が崩れ、乾いた肩と湿った底に分かれる。
    const track = Math.exp(-Math.pow((x - 2 - Math.sin(z * 0.09) * 1.1) / 0.7, 2))
      + Math.exp(-Math.pow((x - 3.6 - Math.sin(z * 0.09) * 1.1) / 0.7, 2));
    const damp = Math.max(wet(x, z), Math.min(1, track) * 0.72), r = ridge(x, z) * pd * (1 - Math.min(1, track) * 0.85);
    const y = W.heightAt(x, z) + 0.025 + r * 0.085 * (1 - damp);
    soil.push(x, y, z);
    // 畦と草地の境を透かし、升目の縁を切り抜いた泥の板にしない。
    const rim = aneSmooth(Math.min(x + 30, 100 - x, z - 50, 128 - z) / 1.5);
    cover.push(aneSmooth(pd) * rim);
    dampness.push(aneSmooth((damp - 0.35) / 0.65) * aneSmooth((pd - 0.5) / 0.5));
    // 濡れた焦げ茶、乾いた黄土、畝の明るい肩。黒一色にしない。
    const tone = Math.sin(x * 1.7 + z * 0.8) * 0.018 + Math.sin(x * 0.24 - z * 0.37) * 0.035;
    const edgeGrass = 1 - aneSmooth(pd / 0.7);
    colors.push(0.29 + tone + r * 0.09 - damp * 0.07 - edgeGrass * 0.05,
      0.23 + tone + r * 0.075 - damp * 0.04 + edgeGrass * 0.045,
      0.15 + tone * 0.6 + r * 0.05);
    if (i < nx && j < nz) {
      const cx = x + step / 2, cz = z + step / 2;
      if (paddy(cx, cz) <= 0.12) continue;
      const a = j * (nx + 1) + i, b = a + nx + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(soil, 3));
  sg.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  sg.setAttribute('aneCover', new THREE.Float32BufferAttribute(cover, 1));
  sg.setAttribute('aneDamp', new THREE.Float32BufferAttribute(dampness, 1));
  sg.setIndex(indices); sg.computeVertexNormals();
  // 小さな土粒の絵は一枚だけ作り、田全体で繰り返す。
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128);
  let seed = 1570;
  const R = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = 175 + Math.floor(R() * 80);
    pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas); tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const uv = [];
  for (let i = 0; i < soil.length; i += 3) uv.push(soil[i] * 0.7, soil[i + 2] * 0.7);
  sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const soilMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex, emissive: 0x514735, emissiveIntensity: 0.3, transparent: true, depthWrite: false });
  soilMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aneCover, aneDamp; varying float vAneCover, vAneDamp;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\n vAneCover = aneCover; vAneDamp = aneDamp;');
    sh.fragmentShader = 'varying float vAneCover, vAneDamp;\n' + sh.fragmentShader.replace(
      '#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vAneCover;').replace(
      '#include <lights_fragment_end>', `#include <lights_fragment_end>
       // 水膜の境を泥の面でぼかす。別の板を貼らず、浅い角度だけ鈍く空を映す。
       float aneSheen = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 3.0);
       reflectedLight.indirectDiffuse += vec3(0.075, 0.07, 0.05) * vAneDamp * aneSheen;`);
  };
  soilMat.customProgramCacheKey = () => 'anePaddyFilm';
  const ground = new THREE.Mesh(sg, soilMat);
  ground.receiveShadow = true; W.scene.add(ground);
  // 共通の稲の控えも更新する。描く時の間引きで元の等間隔へ戻らないよう再登録する。
  const dummy = new THREE.Object3D();
  const list = W.cullList || [];
  for (let n = list.length - 1; n >= 0; n--) {
    const entry = list[n];
    if (entry.orig.length !== 1) continue;
    const { m, mat } = entry.orig[0];
    if (m.material.color?.getHex() !== W.field.color || !m.material.map || !entry.N) continue;
    if (paddy(entry.pts[0], entry.pts[2]) <= 0.5) continue;
    for (let i = 0; i < entry.N; i++) {
      dummy.matrix.fromArray(mat, i * 16);
      dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);
      const x = dummy.position.x, z = dummy.position.z;
      const px = x + (R() - 0.5) * 0.46, pz = z + (R() - 0.5) * 0.46;
      if (paddy(px, pz) > 0.6) dummy.position.set(px, W.heightAt(px, pz) + 0.025, pz);
      dummy.scale.y *= 0.65 + R() * 0.7;
      dummy.scale.x *= 0.8 + R() * 0.4;
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    list.splice(n, 1); W.viewCull([m], entry.near);
  }
}

// 川前の草と矢はまとめて描く。亡骸は戦死した場所へ置く固定の二十四枠。
function anegawaGround(rt) {
  const W = rt.world, dummy = new THREE.Object3D();
  let seed = 700;
  const R = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const blades = [];
  for (let i = 0; i < 3; i++) {
    const g = aneGrassBlade(0.065, 0.42);
    g.rotateY(i * Math.PI / 3); blades.push(g);
  }
  const grassGeo = mergeGeometries(blades);
  for (const g of blades) g.dispose();
  const grass = new THREE.InstancedMesh(grassGeo, aneBankGrassMaterial(0.42), 480);
  const grassColor = new THREE.Color();
  let gx = 0, gz = 0;
  for (let i = 0; i < 480; i++) {
    // 同じ株数を八株ずつ群落へ寄せ、間には裸地を残す。
    if (i % 8 === 0) {
      const near = i % 24 !== 0;
      gx = near ? POST.x - 38 + R() * 85 : -85 + R() * 205;
      gz = near ? 16 + R() * 37 : 16 + R() * 100;
    }
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * (i % 24 < 8 ? 1.2 : 3.8);
    const x = gx + Math.cos(a) * r, z = gz + Math.sin(a) * r;
    const worn = z < 45 && Math.abs(x - POST.x) < 22;
    dummy.position.set(x, W.heightAt(x, z), z);
    dummy.rotation.set(worn ? -0.9 : 0, R() * Math.PI * 2, worn ? 0.35 : 0);
    dummy.scale.set(0.9 + R() * 0.8, worn ? 0.28 + R() * 0.3 : 0.65 + R() * 0.7, 0.8);
    dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    if (Math.abs(z - aneCenter(x)) < 40) aneBankColor(x, z, grassColor);
    else grassColor.setRGB(0.25, 0.30, 0.13);
    grassColor.multiplyScalar(0.82 + aneMeadow(x, z) * 0.32);
    grass.setColorAt(i, grassColor);
  }
  grass.instanceMatrix.needsUpdate = true;   // 10/24：草は作らない
  // 川前の踏み荒らし。地表へ沿う小さな土の斑を一枚に束ね、縁を透かす。
  const scuffs = [], scuffColors = [], scuffAlpha = [];
  const point = (x, z, alpha, shade) => {
    scuffs.push(x, W.heightAt(x, z) + 0.018, z);
    scuffColors.push(0.25 * shade, 0.21 * shade, 0.145 * shade); scuffAlpha.push(alpha);
  };
  for (let i = 0; i < 100; i++) {
    const x = POST.x - 22 + R() * 60, z = 17 + R() * 30;
    if (W.inWaterAt(x, z)) continue;
    // 同じ百枚を大小の踏み跡へ振り分け、点々の模様を帯状の泥へつなぐ。
    const broad = i % 5 === 0 ? 2.8 : 1;
    const rx = (0.3 + R() * 0.5) * broad, rz = (0.7 + R() * 1.5) * broad, shade = 0.8 + R() * 0.4;
    for (let j = 0; j < 8; j++) {
      const a = j * Math.PI / 4, b = (j + 1) * Math.PI / 4;
      point(x, z, 0.62, shade);
      point(x + Math.cos(b) * rx, z + Math.sin(b) * rz, 0, shade);
      point(x + Math.cos(a) * rx, z + Math.sin(a) * rz, 0, shade);
    }
  }
  // 村口・小堂から避難先までの里道。民が使う道筋をそのまま地面へ描く。
  // 道筋は復元。川や館を横切る新しい道は足さず、踏み荒らしと一枚に束ねる。
  // 二歩ごとに地面へ沿わせ、中央の踏み土から草際へ薄くする。作るのは開戦時だけ。
  for (const lane of PEOPLE_LANES) {
    const length = Math.sqrt(lane.len2), steps = Math.ceil(length / 2);
    const nx = -lane.dz / length, nz = lane.dx / length;
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps, t1 = (i + 1) / steps;
      const ax = lane.ax + lane.dx * t0, az = lane.az + lane.dz * t0;
      const bx = lane.ax + lane.dx * t1, bz = lane.az + lane.dz * t1;
      if (W.inWaterAt(ax, az) || W.inWaterAt(bx, bz) ||
        !W.walkable(ax, az) || !W.walkable(bx, bz)) continue;
      for (const side of [-1, 1]) {
        const ox = nx * 0.85 * side, oz = nz * 0.85 * side;
        // 両側とも表を上に向ける。縁の高さも地面から取り、斜面で浮かせない。
        if (side < 0) {
          point(ax, az, 0.45, 1); point(bx, bz, 0.45, 1); point(ax + ox, az + oz, 0, 1);
          point(ax + ox, az + oz, 0, 1); point(bx, bz, 0.45, 1); point(bx + ox, bz + oz, 0, 1);
        } else {
          point(ax, az, 0.45, 1); point(ax + ox, az + oz, 0, 1); point(bx, bz, 0.45, 1);
          point(ax + ox, az + oz, 0, 1); point(bx + ox, bz + oz, 0, 1); point(bx, bz, 0.45, 1);
        }
      }
    }
  }
  const scuffGeo = new THREE.BufferGeometry();
  scuffGeo.setAttribute('position', new THREE.Float32BufferAttribute(scuffs, 3));
  scuffGeo.setAttribute('color', new THREE.Float32BufferAttribute(scuffColors, 3));
  scuffGeo.setAttribute('aneAlpha', new THREE.Float32BufferAttribute(scuffAlpha, 1));
  scuffGeo.computeVertexNormals();
  const scuffMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  scuffMat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aneAlpha; varying float vAneAlpha;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAneAlpha = aneAlpha;');
    sh.fragmentShader = 'varying float vAneAlpha;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.a *= vAneAlpha;');
  };
  scuffMat.customProgramCacheKey = () => 'aneScuffs';
  const scuffMesh = new THREE.Mesh(scuffGeo, scuffMat); scuffMesh.receiveShadow = true; W.scene.add(scuffMesh);
  const arrows = new THREE.InstancedMesh(arrowGeometry(), MAT, 96);
  for (let i = 0; i < 96; i++) {
    const x = -65 + R() * 170, z = 14 + R() * 82;
    dummy.position.set(x, W.heightAt(x, z) + 0.06, z);
    dummy.rotation.set(i % 3 ? 0 : -0.9, R() * Math.PI * 2, 0); dummy.scale.setScalar(1);
    dummy.updateMatrix(); arrows.setMatrixAt(i, dummy.matrix);
  }
  arrows.instanceMatrix.needsUpdate = true; arrows.visible = false; W.scene.add(arrows);
  rt.after(35, () => { if (!rt.over) arrows.visible = true; });
  const P = lookParts({ armor: AZAI.armor, lace: AZAI.lace, hat: 'jingasa', skin: 0xc2a080,
    face: 2, doStyle: 'sugake', sode: true, tier: 0, cloth: 0x45483a, dirt: 0.5, weapon: 'none' }, true);
  const pieces = [];
  for (const key of ['torso', 'hips', 'head', 'face', 'sodeP', 'sodeN']) if (P[key]) pieces.push(P[key].clone());
  for (const side of [-1, 1]) {
    if (P.thigh) pieces.push(P.thigh.clone().translate(side * 0.11, 0.74, 0));
    if (P.leg) pieces.push(P.leg.clone().translate(side * 0.11, 0.34, 0));
    if (P.foot) pieces.push(P.foot.clone().translate(side * 0.11, 0.34, 0));
    const arm = side > 0 ? 'P' : 'N';
    for (const [key, y] of [['upper', 1.37], ['fore', 1.07], ['hand', 0.8]]) {
      if (P[key + arm]) pieces.push(P[key + arm].clone().translate(side * 0.27, y, 0));
    }
  }
  const corpses = new THREE.InstancedMesh(mergeUnit(pieces), MAT, 24);
  for (const g of pieces) g.dispose();
  corpses.count = 0; W.scene.add(corpses);
  rt.flags.groundRemains = { corpses, dummy, used: 0,
    normal: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0),
    slope: new THREE.Quaternion(), contact: new THREE.Vector3() };
}
// 横槍が取り付いた味方の列へ案内する。敵の印を道案内には使わない。
function anegawaPushPost(rt) {
  const F = rt.flags;
  if (F.step !== 1 || !F.inabaT || gone(F.inaba)) return false;
  const P = rt.player.u.pos;
  let enemy = null, distance = Infinity;
  // 離れた騎馬武将を含む隊の中心ではなく、こちら岸の実際の押し合いを読む。
  for (const e of rt.army.units) {
    if (!e.alive || e.team === rt.player.u.team || e.noTarget || e.isStruct || e.fleeing ||
        e.woundOut || e.rearWound || e.downed || e.dropped || !F.waves.includes(e.group) ||
        gone(e.group) || e.group.anePending || e.pos.z < aneSouthBank(e.pos.x) || rt.world.waterDepthAt(e.pos.x, e.pos.z) > 0.02) continue;
    const d = Math.hypot(e.pos.x - P.x, e.pos.z - P.z);
    if (d < distance) { enemy = e; distance = d; }
  }
  if (!enemy) return false;
  let soldier = null, best = Infinity;
  for (let i = -1; i < F.holdRows.length; i++) {
    const row = i < 0 ? F.inaba : F.holdRows[i];
    const u = anegawaLineSoldier(row, F.pushSoldier, enemy.pos);
    if (!u || u.pos.z < aneSouthBank(u.pos.x) || rt.world.waterDepthAt(u.pos.x, u.pos.z) > 0.02) continue;
    const gap = Math.hypot(u.pos.x - enemy.pos.x, u.pos.z - enemy.pos.z);
    if (gap > 35) continue;
    const d = Math.hypot(u.pos.x - P.x, u.pos.z - P.z) + gap;
    if (d < best) { soldier = u; best = d; }
  }
  if (!soldier) return false;
  F.pushSoldier = soldier;
  F.pushAt.x = soldier.pos.x;
  F.pushAt.z = Math.max(soldier.pos.z + 2, aneCenter(soldier.pos.x) + aneWidth(soldier.pos.x) + 3);
  return true;
}
// 将一人や弓・鉄砲だけが残った段を、槍列として案内しない。
function anegawaLineSoldier(g, previous = null, focus = g?.anchor) {
  if (gone(g)) return null;
  let n = 0, nearest = null, distance = Infinity, previousDistance = Infinity;
  for (const u of g.units) {
    if (!u.alive || u.mounted || u.fleeing || u.noTarget || u.woundOut || u.rearWound ||
        u.downed || u.dropped || u.type === 'gun' || u.type === 'bow') continue;
    n++;
    const d = Math.hypot(u.pos.x - focus.x, u.pos.z - focus.z);
    if (u === previous) previousDistance = d;
    if (d < distance) { nearest = u; distance = d; }
  }
  // 生きた同じ兵を基準に保ち、半秒ごとの微小な並び替わりで印を飛ばさない。
  return n >= 3 ? previousDistance <= distance + 3 ? previous : nearest : null;
}
function anegawaPursuitText(rt) {
  if (gone(rt.flags.rear)) return 'しんがりは崩れた。浅い瀬を渡り、向こう岸の印へ';
  return '森の備と浅い瀬を渡り、しんがりを追え';
}
function anegawaTask(rt) {
  const F = rt.flags, P = rt.player.u;
  if (rt.G.lord || rt.t < (F.taskAt ?? 0)) return;
  F.taskAt = rt.t + 0.5;
  if (F.step === 0) return;
  if (F.step === 1) {
    // 川前の列が崩れたら、生きている後ろの段へ戻る。兵や勝敗の時計は変えない。
    if (!anegawaLineSoldier(F.holdRow)) {
      let next = null;
      for (const row of F.holdRows) if (anegawaLineSoldier(row) && row.anchor.z > F.holdRow.anchor.z + 4 &&
          (!next || row.anchor.z < next.anchor.z)) next = row;
      // 後ろの段が尽きても、柴田の手や本陣の槍が残っていれば、その兵へ合流する。
      // 援軍が前へ動いた後は、古い段の順だけで候補から外さない。
      if (!next) {
        let distance = Infinity;
        for (const row of F.holdRows) {
          const soldier = anegawaLineSoldier(row);
          if (!soldier) continue;
          const d = Math.hypot(soldier.pos.x - P.pos.x, soldier.pos.z - P.pos.z);
          if (d < distance) { next = row; distance = d; }
        }
      }
      if (next) {
        F.holdRow = next; F.holdAt.x = next.anchor.x; F.holdAt.z = next.anchor.z;
        F.taskChangedAt = -10;
        // まだ瀬を歩く新手も、今の守備列へ向かう。渡河の道順と交戦中の隊は変えない。
        for (const g of [F.second, F.third]) if (g && !gone(g) && g.order === 'path' && g.path?.length) {
          const end = g.path[g.path.length - 1];
          end[0] = F.holdAt.x + 20; end[1] = F.holdAt.z - 6;
        }
      }
    }
    const soldier = F.holdSoldier = anegawaLineSoldier(F.holdRow, F.holdSoldier);
    if (soldier) {
      // 列が動いた後も、残っている徒歩の兵の南側へ案内する。
      F.holdAt.x = soldier.pos.x;
      F.holdAt.z = Math.max(soldier.pos.z + 3, aneCenter(soldier.pos.x) + aneWidth(soldier.pos.x) + 3);
      F.holdLabel = F.holdRow === F.vanguard ? '森の先手・岸の槍列' : F.holdRow === F.sakai ? '坂井の槍列' :
        F.holdRow === F.ikeda ? '池田の槍列' : F.holdRow === F.shibata ? '柴田の槍列' :
        F.holdRow === F.mori ? '森の槍列' : F.holdRow === F.kino ? '佐久間の槍列' : '本陣前・残る味方の槍列';
    } else {
      F.holdAt.x = F.hqGuardPos.x; F.holdAt.z = F.hqGuardPos.z;
      F.holdLabel = '本陣前・残る味方と守る';
    }
    const lord = rt.taisho?.a?.u, raid = rt.taisho?.raid;
    // 殿の古い傷だけで川前の兵を呼び戻し続けない。今も迫る敵を読む。
    let threatened = false;
    if (lord?.alive) {
      threatened = raid?.count > 0 && !raid.routed && Math.hypot(raid.center().x - lord.pos.x, raid.center().z - lord.pos.z) < 45;
      if (!threatened && lord.hp < lord.maxHp * 0.5) for (const e of rt.army.units) {
        if (!e.alive || e.team === P.team || e.noTarget || e.isStruct || e.fleeing || e.group?.routed ||
            e.woundOut || e.rearWound || e.downed || e.dropped) continue;
        if (Math.hypot(e.pos.x - lord.pos.x, e.pos.z - lord.pos.z) < 35) { threatened = true; break; }
      }
    }
    F.hqDefend = !!(F.hqReported && threatened);
    if (F.hqDefend) {
      F.hqDefensePos.x = lord.pos.x; F.hqDefensePos.z = lord.pos.z - 8;
      // 殿が幕の内へ下がっても、足軽の守備位置は敵が来る北側の外に置く。
      if (Math.abs(lord.pos.x - HQ.x) < 10 && Math.abs(lord.pos.z - HQ.z) < 16) {
        F.hqDefensePos.z = Math.min(F.hqDefensePos.z, HQ.z - 12);
      }
      if (!F.hqDefenseMarked) {
        F.hqDefenseMarked = true;
        // 幕の中の殿本人ではなく、下知・到着判定と同じ守備位置へ案内する。
        rt.marker('honjinHelp', F.hqDefensePos, '本陣の旗', { guideArea: 'wait', guideRadius: 12, waitAction: true, guideDefend: true, guideFlag: true,
          guideFlagMesh: () => F.hqGuideFlag?.userData.flag });
      }
    } else if (F.hqReported || F.hqDefenseMarked) {
      F.hqDefenseMarked = false; F.hqReported = false; F.taskChangedAt = -10;
      rt.unmark('honjinHelp');
    }
  } else if (F.hqDefenseMarked) {
    F.hqDefend = false; F.hqDefenseMarked = false; F.hqReported = false;
    rt.unmark('honjinHelp');
  }
  let near = 0, nearestAim = 18, nearestWatch = 70;
  F.aimEnemy = null; F.watchEnemy = null;
  for (const e of rt.army.units) {
    if (!e.alive || e.team === P.team || e.noTarget || e.isStruct || e.fleeing || e.group?.routed ||
        e.woundOut || e.rearWound || e.downed || e.dropped) continue;
    const distance = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    if (distance < 25) near++;
    if (distance < nearestAim) { nearestAim = distance; F.aimEnemy = e; }
    if (distance < nearestWatch) { nearestWatch = distance; F.watchEnemy = e; }
  }
  F.nearEnemies = near;
  // 傷の境目で札を行ったり来たりさせない。
  const bleeding = P.wounds?.bleed > 0.0001;
  if (P.hp < P.maxHp * 0.5 || bleeding) F.taskHurt = true;
  else if (P.hp > P.maxHp * 0.55) F.taskHurt = false;
  const east = F.step === 1 && F.flankPick === 0 && !F.flankDone;
  const pushing = anegawaPushPost(rt);
  F.pushGuiding = pushing && !F.taskHurt && !F.hqThreat && !F.hqDefend && !east;
  const hqPost = F.hqDefend ? F.hqDefensePos : F.hqGuardPos;
  const atHq = hqPost && Math.hypot(P.pos.x - hqPost.x, P.pos.z - hqPost.z) < (F.atHq ? 18 : 12);
  F.atHq = !!atHq;
  // 列へ着いた者に「下がれ」を繰り返さない。境目と敵の一瞬の出入りでは札を替えない。
  F.atHold = F.step === 1 && Math.hypot(P.pos.x - F.holdAt.x, P.pos.z - F.holdAt.z) < (F.atHold ? 14 : 10);
  const hasLine = F.step !== 1 || !!anegawaLineSoldier(F.holdRow, F.holdSoldier);
  if (near || !F.atHold) { F.holdQuietAt = rt.t; F.holdWaiting = false; }
  else if (rt.t - (F.holdQuietAt ?? F.stepT) >= 12) F.holdWaiting = true;
  const holding = F.atHold ? F.holdWaiting ? F.inabaT ? 'ここで槍を揃え、残る旗を見張れ' : F.westReported ? 'ここで槍を揃え、横槍を待て' :
    'ここで槍を揃え、西の知らせを待て' : '味方と槍を揃え、浅井を止めよ' : null;
  // 出血が止まっても、深手なら残る布で手当てできる。布切れを回復待ちにしない。
  const canTreat = rt.player.treatmentLeft > 0 && rt.player.treatmentNext <= rt.t;
  // 手当てが先でも、本陣へ敵が抜けた事を任務から消さない。
  const hurtHq = F.step === 1 && F.taskHurt && (F.hqThreat || F.hqDefend);
  const returnHq = anegawaHqReturnPriority(rt);
  const text = returnHq ? anegawaHqReturnText(rt) : hurtHq ? anegawaHurtHqText(rt, F.retreatReached) : F.taskHurt ? !F.retreatSafe ? '槍を構え、南へ下がれ' : canTreat ?
    F.retreatReached ? 'ここで布を巻き、手当てせよ' : '退き先へ下がり、布で手当てせよ' : F.retreatReached ? rt.player.treatmentLeft > 0 ? '構えて休め。次の手当てを待て' : '傷は残る。味方の後ろで構えよ' : '印へ下がり、槍を構えよ' : F.step === 2 ? anegawaPursuitText(rt) :
    F.hqThreat || F.hqDefend ? atHq ? anegawaHqWatchText(rt) : near >= 3 ? '槍を構え、味方と本陣前へ退け' : '本陣前へ戻り、抜けた敵を止めよ' : east ? '東の瀬で別手を止めよ' : pushing ?
    Math.hypot(P.pos.x - F.pushAt.x, P.pos.z - F.pushAt.z) > 18 ? '押し返す味方の槍列へ合流せよ' : '横槍に合わせ、味方と浅井を押せ' :
    !hasLine ? F.atHold ? near ? '本陣前で構え、敵を通すな' : 'ここで構え、味方の旗を守れ' : '本陣前へ戻り、残る味方と守れ' : holding || (F.breach >= 3 ? '印の槍列で槍を揃え直せ' : F.holdAt.z > POST.z + 4 ? '印の槍列へ戻り、浅井を止めよ' : '川を渡らず、岸で浅井を止めよ');
  // 槍列を失った時と本陣前へ着いた時も、古い下知を十秒残さない。
  const guide = returnHq ? 'hq' : F.taskHurt ? 'hurt' : F.step === 2 ? gone(F.rear) ? 'cross' : 'pursue' : F.hqThreat || F.hqDefend ? 'hq' : east ? 'east' : pushing ? 'push' : !hasLine ? F.atHold ? near ? 'rallyFight' : 'rallyWait' : 'regroup' : F.atHold ? F.holdWaiting ? 'wait' : 'line' : 'hold';
  // 下知と行き先が替わる時は、古い札を十秒残さない。
  anegawaObjective(rt, F.step === 2 ? 'pursue' : 'main', text, guide !== F.taskGuide || F.taskHurt || F.hqThreat > 0 || F.hqDefend);
  F.taskGuide = guide;
  if (F.step !== 1) return;
  if (near) F.quietAt = rt.t;
  else if (rt.t - (F.quietAt ?? F.stepT) >= 12 && F.second && F.flankG && !F.tkDone) {
    // 次の新手は元の控えから歩かせる。敵を近くへ移したり、西の勝敗を秒数で決めたりしない。
    anegawa.tokugawa(rt);
  }
}
function cappedList(rt, list) {
  let room = 225 - rt.army.pendingSpawn; // 新手を出す時だけ数え、味方の追いつく分を空ける。
  for (const u of rt.army.units) if (u.alive && !u.isStruct && !u.farSim && u.type !== 'dummy') room--;
  return list.map((q) => { const n = Math.max(0, Math.min(q.n, room)); room -= n; return { ...q, n }; });
}
// 台本の新手は、開戦時から置いた控えの兵を同じ場所で本物に替える。
// カメラの裏へ動かさず、軽い兵から抜いた人数だけを出す。名前付きの将も重ねない。
function deploy(rt, team, o, list) {
  const F = rt.flags;
  const sources = {
    '磯野員昌の隊': F.jinIso, '浅井の二の手': F.jinMasazumi,
    '浅井の三の手': F.azDA?.[0], '東へ回る浅井の別手': F.jinFlank,
    '浅井のしんがり': F.jinShinjo, '柴田勝家の段': F.jinShiba,
    '稲葉一鉄の隊': F.jinInaba,
  };
  const source = sources[o.name];
  if (!source) return (team ? spawnEnemy : spawnAlly)(rt, { fixed: true, formation: 'yari', ...o }, cappedList(rt, list));
  const g = (team ? spawnEnemy : spawnAlly)(rt, { fixed: true, noGuard: true, fullStrength: true, formation: 'yari', ...o }, []);
  g.aneSource = source; g.anePending = true;
  source.real = g;
  const fill = () => {
    if (rt.over || F.ending) return;
    KIT.freeRoom(rt, list.reduce((v, q) => v + q.n, 0));
    const limited = cappedList(rt, list);
    const n = limited.reduce((v, q) => v + q.n, 0);
    // 空の隊を「撃退した」と数えない。枠が足りなければ控えのまま待つ。
    if (n < 8) { rt.after(1, fill); return; }
    // 中央から抜くと実兵が残りの控えに囲まれる。前の列から出し、控えは後ろに残す。
    const front = source.d / 2 + 12;
    const pts = source.m.take(source.x + Math.sin(o.facing) * front, source.z + Math.cos(o.facing) * front,
      n, 1e9, null, (x, z) => rt.world.walkable(x, z));
    if (!pts.length) { rt.after(1, fill); return; }
    const actual = [];
    let i = 0;
    for (const q of limited) for (let j = 0; j < q.n && i < pts.length; j++, i++) {
      const at = pts[i];
      actual.push({ type: q.type, n: 1, o: { ...q.o, x: at.x, z: at.z, heading: o.facing,
        ...(o.name === '磯野員昌の隊' && (q.type === 'busho' || q.o?.name) ? { invuln: true, allyOk: true } : {}) } });
    }
    rt.army.queueSpawn(g, actual, () => {
      g.anePending = false;
      if (o.name === '浅井のしんがり') F.rearAt = rt.t;
      g.leader = g.units.find((u) => u.type === 'busho' || u.name) || g.units.find((u) => u.type === 'samurai');
      g.historicalOrders = g.units.some((u) => u.name);
      if (o.name === '磯野員昌の隊') { F.isoU = g.leader; if (F.isoU) { F.isoU.invuln = true; F.isoU.allyOk = true; } }
    });
  };
  fill();
  // 備えの表も今の実兵を指す。軽い控えは同じ備えの残りとして留まる。
  for (const bound of Object.values(F.earlyJin || {})) if (bound?.source === source) bound.real = g;
  return g;
}
const enemyGroup = (rt, o, list) => deploy(rt, 1, o, list);
const allyGroup = (rt, o, list) => deploy(rt, 0, o, list);
const returnLine = (g) => { g.order = 'hold'; g.anchor.x = g.center().x; g.anchor.z = g.center().z; g.formation = 'yari'; };

// 川原の石（見た目だけ）：川の両岸の帯に、大小の丸い石を散らす
function kawara(W) {
  // 黒く平たい塊を避け、形と材質を一つずつ共用した明るい丸石にする。
  const stones = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 4),
    new THREE.MeshLambertMaterial({ color: 0xffffff }), 420);   // 色は石ごとに（一色の白い塊を並べない。10/29）
  const dummy = new THREE.Object3D();
  let s = 70;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 420; i++) {
    const x = -410 + R() * 820;
    const z = aneCenter(x) + (R() < 0.5 ? -1 : 1) * (aneWidth(x) + 0.2 + R() * 2.5);
    const r = 0.1 + R() * R() * 0.28;   // 径10〜30cmが主。半分を砂利に埋める（10/29）
    dummy.position.set(x, W.heightAt(x, z) + r * 0.15, z);
    dummy.rotation.set(0, R() * 6, 0);
    dummy.scale.set(r * 1.1, r * 0.7, r);
    dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
    const v = 0.3 + R() * 0.2, h = R();   // 灰・青灰・赤茶の濡れた川石
    stones.setColorAt(i, new THREE.Color(v * (h < 0.6 ? 1 : h < 0.8 ? 0.9 : 1.1), v * (h < 0.8 ? 0.98 : 0.88), v * (h < 0.6 ? 0.93 : h < 0.8 ? 1.0 : 0.75)));
  }
  stones.instanceMatrix.needsUpdate = true; stones.instanceColor.needsUpdate = true;
  return stones;
}

// 信長公記巻三の二正面。縦の段の将の順は後世の布陣図による復元で、十三段を確定しない。
// 東の野村＝織田と浅井、西の三田村＝徳川と朝倉。史料の兵数には大きな幅がある。
const ANEGAWA_JIN = [
  battleJin('織田の備え（復元）', 0, HQ, Math.PI, [
    ['agSakai', '一の段', '坂井政尚', 2000, 30 / 5, 160 / 5, 'sakai', 'oda'],
    ['agIkeda', '二の段', '池田恒興', 2000, 10 / 5, 260 / 5, 'ikeda', 'oda', 'ageha'],
    ['agShiba', '中の段', '柴田勝家', 3000, -30 / 5, 480 / 5, 'jinShiba', 'oda', 'kari'],
    ['agMori', '中の段', '森可成', 3000, MORI.x, MORI.z, 'mori', 'oda', 'tsuru'],
    ['agSaku', '後ろの段', '佐久間信盛', 3000, -80 / 5, 680 / 5, 'kino', 'oda'],
    ['agNobu', '本陣', '織田信長', 5000, HQ.x, HQ.z, 'hqCamp', 'eiraku', 'oda'],
    ['agMino', '東の備え', '稲葉一鉄・氏家卜全・安藤守就', 3000, MINO.x, MINO.z, 'jinInaba', 'inaba'],
    ['agYokoyama', '横山城の北の囲み', '木下藤吉郎の手', 600,
      YOKOYAMA_SIEGE[0].x, YOKOYAMA_SIEGE[0].z, 'jinYokoyama', 'oda', 'oda', YOKOYAMA_SIEGE[0].facing],
    ['agYokoyamaSouth', '横山城の南の囲み', '木下藤吉郎の手', 600,
      YOKOYAMA_SIEGE[1].x, YOKOYAMA_SIEGE[1].z, 'jinYokoyamaSouth', 'oda', 'oda', YOKOYAMA_SIEGE[1].facing],
  ], '信長本陣は陣杭の柳の伝承を参考にした復元で、当日の位置を確定しない。織田二万三千は西へ加勢する丹羽の手も含み、各手の配分は遊びの目安。縦の並びと磯野の突破は後世の軍記を交えた復元で、信長公記は備えの段数を記さない。美濃三人衆は信長公記の東の備えとし、藤吉郎は横山城の囲み説を採る。囲みを南北に分けた位置と人数は復元で、藤吉郎の持ち場を確定しない。'),
  battleJin('西の三田村口（復元）', 0, { x: -1030 / 5, z: 700 / 5 }, Math.PI, [
    ['agTKSakai', '先手', '酒井忠次・本多忠勝', 2200, -960 / 5, 360 / 5, 'tk.0', 'tokugawa'],
    ['agNiwa', '織田の加勢', '丹羽長秀', 800, -970 / 5, 460 / 5, 'jinNiwa', 'oda'],
    ['agIshikawa', '三の手', '石川数正', 1000, -1000 / 5, 560 / 5, 'jinIshikawa', 'tokugawa'],
    ['agIeyasu', '本陣', '徳川家康', 1300, -1030 / 5, 700 / 5, 'tk.1', 'tokugawa'],
    ['agSakaki', '西南の別手', '榊原康政', 500, -1220 / 5, 790 / 5, 'sakaki', 'sakakibara'],
  ], '徳川三千とも五千とも。ここでは徳川五千と織田の加勢八百を各手に分けた目安。当日付信長書状にある丹羽長秀の徳川勢への加勢を示す。信長公記にある西の三田村口への一番合戦に合わせるが、各手の順序・加勢の位置と榊原の別手は復元。'),
  battleJin('浅井の備え（復元）', 1, NOMURA_HQ, 0, [
    ['agIso', '先手', '磯野員昌', 1000, 80 / 5, -125 / 5, 'jinIso', 'azai'],
    ['agMasazumi', '二の手', '浅井政澄', 800, 90 / 5, -230 / 5, 'jinMasazumi', 'azai'],
    ['agAtsuji', '三の手', '阿閉貞征', 800, 120 / 5, -340 / 5, 'azDA.0', 'azai'],
    ['agShinjo', '四の手', '新庄直頼', 800, 120 / 5, -450 / 5, 'jinShinjo', 'azai'],
    ['agEndo', '五の手', '遠藤直経', 800, 140 / 5, -560 / 5, 'azDA.2', 'azai'],
    ['agNagamasa', '本陣', '浅井長政', 800, NOMURA_HQ.x, NOMURA_HQ.z, 'azDA.1', 'azai'],
  ], '浅井五千は信長公記による概数。当日付の信長書状の「五六千」は五千から六千ほどの見積もりで、五千六百という実数ではない。長政の本陣は野村に置く。郷内の位置と各手の配分は復元。'),
  battleJin('朝倉の備え（復元）', 1, MITAMURA, 0, [
    ['agKagenori', '先手', '名は伝わらない', 2500, ASAKURA_FRONT.x, ASAKURA_FRONT.z, 'jinKagenori', 'asakura'],
    ['agMaeba', '二の手', '前波新八', 2500, ASAKURA_SECOND.x, ASAKURA_SECOND.z, 'akDA.0', 'asakura'],
    ['agKagetake', '本陣', '朝倉景健', 3000, MITAMURA.x, MITAMURA.z, 'akDA.1', 'asakura'],
  ], '朝倉八千は信長公記による概数。当日付の信長書状では一万五千とあり、史料で大きく異なる。三田村氏館を本陣とするのは長浜市の解説に基づく推定。館内の配置と各手の配分は復元。'),
];

// 追撃の下知までは岸に沿う。川際にいる時も、水の深い方へ案内しない。
function anegawaGuidePointAllowed(rt, point) {
  if (rt.flags.step >= 2) return true;
  const p = rt.player.u.pos;
  const bankDistance = p.z - aneCenter(p.x) - aneWidth(p.x);
  return point.z - aneCenter(point.x) - aneWidth(point.x) >= Math.min(1.2, bankDistance);
}

// 退き先に迫る兵がいる時は案内しない。半秒ごとの候補調べだけで使う。
function anegawaRetreatSafe(rt, x, z) {
  const lim = rt.world.def.moveLim;
  if (Math.abs(x) > lim || Math.abs(z) > lim) return false;
  if (!rt.world.walkable(x, z)) return false;
  if (rt.flags.step < 2) {
    if (z < aneCenter(x) + aneWidth(x) + 3) return false;
    const p = rt.player.u.pos, steps = Math.max(1, Math.ceil(Math.hypot(x - p.x, z - p.z)));
    const margin = Math.min(1.2, p.z - aneCenter(p.x) - aneWidth(p.x));
    for (let i = 1; i <= steps; i++) {
      const px = p.x + (x - p.x) * i / steps, pz = p.z + (z - p.z) * i / steps;
      if (pz < aneCenter(px) + aneWidth(px) + margin) return false;
    }
  }
  for (const e of rt.army.units) {
    if (!e.alive || e.team === rt.player.u.team || e.noTarget || e.isStruct || e.fleeing || e.group?.routed ||
        e.woundOut || e.rearWound || e.downed || e.dropped) continue;
    const dx = e.pos.x - x, dz = e.pos.z - z;
    // 八歩では長柄や騎馬が手当て中に届く。十四歩を空け、迫ったら印を選び直す。
    if (dx * dx + dz * dz < 14 * 14) return false;
  }
  return true;
}

// 出血か重傷で味方の後ろへ案内する。最初の声は一戦に一度。傷や勝敗は変えない。
function anegawaRetreatGuide(rt) {
  const F = rt.flags, P = rt.player.u;
  const bleeding = P.wounds?.bleed > 0.0001;
  if (!F.retreatGuiding && P.hp > 0 && (P.hp < P.maxHp * 0.5 || bleeding)) {
    F.retreatGuiding = true;
    F.retreatPos ||= { x: P.pos.x, z: P.pos.z };
    F.retreatSafe = false; F.retreatReached = false;
    F.taskAt = 0; F.taskChangedAt = -10;
    rt.marker('hurtRetreat', () => F.retreatGuiding && F.retreatSafe ? F.retreatPos : null,
      () => rt.player.treatmentLeft > 0 && rt.player.treatmentNext <= rt.t ? '退き先・布で手当てする' : '退き先・槍を構える', { h: 2, guideArea: 'retreat', guideRadius: 3 });
    // 混戦の声の八秒待ちと台詞の待ち列に入れず、短い字幕を先に知らせる。
    if (!F.retreatWarned) {
      F.retreatWarned = true;
      rt.hud.say('組頭', '味方の列へ下がれ', 5, true);
    }
  }
  if (!F.retreatGuiding) return;
  if (P.hp > P.maxHp * 0.55 && !bleeding) {
    F.retreatGuiding = false; F.retreatSafe = false; F.retreatReached = false; rt.unmark('hurtRetreat'); return;
  }
  if (rt.t < (F.retreatScanAt ?? -1)) return;
  F.retreatScanAt = rt.t + 0.5;
  const pos = F.retreatPos, distance = Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z);
  // 安全な印は着いても逃げない。敵が迫るか、本人が離れた時だけ選び直す。
  if (F.retreatSafe && distance <= 28 && pos.z >= P.pos.z - 3 && anegawaRetreatSafe(rt, pos.x, pos.z)) {
    F.retreatReached = distance < (F.retreatReached ? 5 : 3);
    return;
  }
  F.retreatReached = false;
  let best = null, score = Infinity;
  for (const a of rt.army.units) {
    if (a === P || !a.alive || a.team !== P.team || a.isStruct || a.noTarget || a.mounted || a.fleeing ||
        a.woundOut || a.rearWound || a.downed || a.dropped || a.group?.routed || a.type === 'gun' || a.type === 'bow') continue;
    // 敵へ進む印にしない。列の南側を選び、その槍の四歩後ろへ下がる。
    const z = a.pos.z + 4;
    if (z < P.pos.z + 1 || F.step < 2 && z < aneSouthBank(a.pos.x)) continue;
    const dx = a.pos.x - P.pos.x, dz = z - P.pos.z, d = dx * dx + dz * dz;
    if (d <= 28 * 28 && d < score && anegawaRetreatSafe(rt, a.pos.x, z)) { score = d; best = a; }
  }
  F.retreatSafe = !!best;
  if (best) { pos.x = best.pos.x; pos.z = best.pos.z + 4; }
  else {
    // 持ち場の固定点へ戻すと、既に南へ退いた者を混戦へ呼び戻してしまう。
    // 味方がいなければ今いる所の南を調べ、全部塞がっていれば印を出さない。
    for (let dz = 8; dz <= 24; dz += 8) {
      const z = P.pos.z + dz;
      if (!anegawaRetreatSafe(rt, P.pos.x, z)) continue;
      pos.x = P.pos.x; pos.z = z; F.retreatSafe = true; break;
    }
  }
}
// 到着後は十八歩まで守備を続ける。任務と道案内で同じ境目を使う。
function anegawaReturning(rt) {
  const F = rt.flags, at = F.hqDefend ? F.hqDefensePos : F.hqThreat ? F.hqGuardPos : null;
  return !!at && Math.hypot(rt.player.u.pos.x - at.x, rt.player.u.pos.z - at.z) >= (F.atHq ? 18 : 12);
}
// 遠い敵を止めるよう急かさず、旗の前で見張る向きと接敵後の行動を分ける。
function anegawaHqWatchText(rt) {
  const F = rt.flags, p = rt.player.u.pos, enemy = F.hqEnemy;
  if (!enemy?.alive) return '輪の中で待とう';
  const dx = enemy.pos.x - p.x, dz = enemy.pos.z - p.z;
  // 本陣へ抜けた敵か、同じ相手が接近した時だけ迎撃を示す。
  if (F.hqBreached) {
    return '近づく敵をたおそう';
  }
  // 二十五歩内の別の敵ではなく、案内している敵が槍を向ける距離に来たかを見る。
  if (dx * dx + dz * dz < 12 * 12) return '近づく敵をたおそう';
  return '輪の中で待とう';
}
// 軽傷で歩ける間は、手当ての退き先で本陣への道案内を消さない。
// 出血・深手と布を巻いている間は傷の案内を優先する。
function anegawaHqReturnPriority(rt) {
  return rt.flags.step === 1 && rt.withdrawal?.losing !== 0 && !rt.over && !rt.flags.ending && !rt.player.treating &&
    !(rt.player.u.wounds?.bleed > 0.0001) &&
    rt.player.u.hp >= rt.player.u.maxHp * 0.6 && anegawaReturning(rt);
}
// 帰陣の道は、戻る旗に短い下知を添える。
function anegawaHqReturnText(rt) {
  return anegawaReturning(rt) ? '旗へもどろう' : '旗を守ろう';
}
// 傷の案内が任務札を置き換える時も、本陣の危険と今する事を一緒に伝える。
function anegawaHurtHqText(rt, reached) {
  const F = rt.flags, P = rt.player;
  if (F.step !== 1 || !(F.hqThreat || F.hqDefend) || rt.withdrawal?.losing === 0 || F.ending || rt.over) return null;
  if (P.treating) return '布を 巻き終えよう';
  if (!F.retreatSafe) return '本陣が危ない。かまえて下がろう';
  if (P.treatmentLeft > 0 && P.treatmentNext <= rt.t)
    return reached ? '止まって手当しよう' : '手当の場所へ';
  return reached ? '本陣前で かまえよう' : anegawaHqReturnText(rt);
}
function anegawaHoldRoute(rt) {
  return '旗へもどろう';
}
// 退き太鼓の時だけ選ぶ。空の畑を「味方の旗」と呼ばず、残る徒歩兵の後ろを探す。
function anegawaWithdrawPost(rt) {
  const F = rt.flags, p = rt.player.u.pos, at = F.withdrawAt;
  let best = Infinity;
  at.x = p.x; at.z = p.z;
  for (const a of rt.army.units) {
    if (a === rt.player.u || !a.alive || a.gone || a.team !== rt.player.u.team || a.isStruct ||
        a.noTarget || a.mounted || a.fleeing || a.group?.routed || a.woundOut || a.rearWound ||
        a.downed || a.dropped || a.type === 'gun' || a.type === 'bow') continue;
    const x = a.pos.x, z = a.pos.z + 4;
    const d = Math.hypot(x - p.x, z - p.z);
    if (z < p.z + 6 || d > 55 || d >= best || !anegawaRetreatSafe(rt, x, z) ||
        rt.army.wallBetween(p, -1, a.pos)) continue;
    at.x = x; at.z = z; best = d;
  }
  if (best < Infinity) return;
  // 味方が残らない時も、川や敵の中へ固定の四十五歩を指さない。
  for (let dz = 24; dz >= 8; dz -= 8) {
    if (!anegawaRetreatSafe(rt, p.x, p.z + dz)) continue;
    at.z = p.z + dz; return;
  }
}
// 待つ目的と敵の接近を、到着後も同じ短い下知で伝える。
function anegawaGuardLabel(rt, reached) {
  const F = rt.flags;
  if (F.hqThreat || F.hqDefend) return reached ? anegawaHqWatchText(rt) : anegawaHqReturnText(rt);
  if (!reached) return anegawaHoldRoute(rt);
  if (rt.phase !== 'brief' && F.nearEnemies > 0) return '近づく敵をたおそう';
  return '輪の中で待とう';
}
// ---- 稲生の水準（reports/inou-standard.md 10/25）----
// 右上は任務の一行だけ。守る段は持ち場へピン（着いても残し、味方の槍列がそこに集まる）。
// 倒す段はピンを一番近い残りの敵へ。磯野員昌が寄れば大将の印。手負い・退き太鼓は元の案内に任せる。
const ANE_MISSIONS = ['ここを守れ', '敵をたおせ', '磯野員昌を退けよ', '川を渡れ', 'しんがりを倒せ'];
const aneFoe = (u) => !!u?.alive && u.hp > 0 && !u.gone && !u.dying && !u.downed && !u.woundOut && !u.rearWound &&
  !u.fleeing && !u.noTarget && !u.isStruct && !u.civ && u.team === 1 && !u.group?.routed && !u.group?.noAI &&
  u.mesh?.visible !== false;
// 元の案内（手負い・退却・東の別手・押し返し）に任せる時。
function aneOwnGuide(rt) {
  const F = rt.flags;
  return !!(rt.over || F.ending || rt.withdrawal || F.taskHurt || F.retreatGuiding || rt.player.treating ||
    F.step < 2 && (F.pushGuiding || F.flankPick === 0 && !F.flankDone));
}
// 守る持ち場（本陣が危ない時は本陣の前）。
function anePost(rt) {
  const F = rt.flags;
  if (F.hqThreat || F.hqDefend) return (F.hqDefend ? F.hqDefensePos : F.hqGuardPos) || HQ;
  return F.holdAt || POST;
}
// 一番近い残りの敵。半秒に一度だけ選び直し、三歩より近い別の兵が出た時だけ替える。
function aneNearestFoe(rt) {
  const F = rt.flags;
  if (rt.t < (F.aneFoeAt || 0) && (F.aneFoe === null || aneFoe(F.aneFoe))) return F.aneFoe;
  F.aneFoeAt = rt.t + .5;
  const me = rt.player.u.pos, post = anePost(rt), pursuit = F.step === 2;
  let best = null, bd = Infinity;
  for (const u of rt.army.units) {
    if (!aneFoe(u)) continue;
    if (pursuit ? u.group !== F.rear && u.group !== F.counterChase
      : Math.hypot(u.pos.x - post.x, u.pos.z - post.z) > 30 && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) > 16) continue;
    const d = Math.hypot(u.pos.x - me.x, u.pos.z - me.z);
    if (d < bd) { bd = d; best = u; }
  }
  const prev = F.aneFoe;
  if (best && prev && best !== prev && aneFoe(prev) && bd + 3 >= Math.hypot(prev.pos.x - me.x, prev.pos.z - me.z) &&
      (!pursuit || prev.group === F.rear || prev.group === F.counterChase)) best = prev;
  F.aneFoe = best;
  return best;
}
// 磯野員昌が持ち場へ寄った時だけ、名と大きな▼をその人へ（深手で退けば印は消える）。
function aneCommander(rt) {
  const F = rt.flags, u = F.isoU;
  if (F.step !== 1 || aneOwnGuide(rt) || !aneFoe(u)) return null;
  return Math.hypot(u.pos.x - rt.player.u.pos.x, u.pos.z - rt.player.u.pos.z) < 26 ? u : null;
}
function aneMissionOf(rt) {
  const F = rt.flags;
  if (F.step === 2) return aneNearestFoe(rt) ? 4 : rt.player.u.pos.z >= aneNorthBank(rt.player.u.pos.x) ? 3 : 0;
  if (aneCommander(rt)) return 2;
  return F.step === 1 && aneNearestFoe(rt) ? 1 : 0;
}

// 遊んでいる姉川の rt（bot の本陣守りの判定に使う）
let aneLive = null;
const anegawa = {
  // 信長の開始地点・部隊の基点・居場所の判定を、陣杭の柳に置く同じ本陣へ揃える。
  // https://cocoshiga.jp/official/topic/ieyasu01/
  // 設営後に本人だけを移すと、部隊の基点と居場所の判定に古い前線の座標が残る。
  lordSpawn: { x: HQ.x, z: HQ.z, heading: Math.PI },
  lordAt: { x: HQ.x, z: HQ.z, r: 16, why: '姉川南岸の信長本陣（陣杭の柳の伝承を参考。位置は復元）' },
  mapBadgeTai: true, // 地図の組の札を「隊N」で出す（hud_map）
  // 共通の見物・避難を使い、軍の周りへの自動配置は止める。民は兵の名簿に入らない。
  // 松明より大きな小火にも逃げる。消えた火は共通の仕組みで除外する。
  civilianCrowd: { bounds: { minX: -420, maxX: 420, minZ: -420, maxZ: 420 }, bands: PEOPLE_BANDS, fireSize: 1, avoidArmies: true,
    // 戸口や村外れで家・土塁・地形に川前を遮られた人は、同じ岸の避難路へ退く。
    watchSight: true,
    // 家や土手の向こうの兵・火は透かして見ない。近くでは物音や熱でも気付く。
    noticeHearingDistance: 12, watchTerrainSight: true, watchRaisedFire: true,
    // 見回りの合間の発砲・斬撃も覚え、村口で短い戦いを見落とさない。
    rememberSoldierCombat: true, watchPlayerCombat: true,
    // 里道の途中も体の幅で調べ、薄い塀や堂の角をすり抜けない。
    continuousEscapeSolids: true,
    // 姉川と館の溝の縁では、体の幅も陸に残る道を使う。
    escapeBankMargin: 0.45,
    // 子の短い脚と年寄りの歩幅を、実際に進んだ距離へそろえる。
    naturalEscapeGait: true,
    // 家族の歩調は子や年寄りに合わせる。待ち合わせと同じ組を設営時に一度だけ調べる。
    keepFamiliesTogether: true,
    // 斬り合いになる前でも、寄せる兵とは広く間を取り、子や年寄りが里道へ逃げる暇を作る。
    watchDistance: 24,
    // 南の村と小堂では、近くの里人の避難にも気づく。家や地形の向こうへ恐慌を伝えない。
    neighborWarningDistance: 18,
    // 馬は歩く兵より早く迫る。見物と避難のどちらでも、同じ岸の里道を早めに空ける。
    horseDistance: 36,
    // 距離だけでなく寄せる速さも見て、次の見回しまでに迫る兵には早めに道を空ける。
    approachSeconds: 1.6,
    // 逃げる途中も同じ間を保ち、別の兵や火の近くを避難路に選ばない。
    // 挟まれた時は危険から離れる向きへ抜け、同じ岸の里道を使う。
    escapeDistance: 24, escapeFightDistance: 40, escapeFireDistance: 22,
    // 家の角や家族の脇で道が狭まった時だけ、短い歩幅でも抜け道を探す。
    shortEscapeStep: 1.2,
    // 勝敗が決まっても、里の者は残る兵や火を避けて村外れまで逃げる。
    fleeAfterBattle: true,
    // 避難を終えた里の者は休み、川前の見物へ戻らない。兵や火が迫れば再び逃げる。
    restAtRefuge: true,
    // 郷の百姓は藁包み、往来の商人は荷を背負う。人数を増やさず暮らしを見分ける。
    carryBelongings: true,
    // 近くの姿も土地の顔ぶれに揃える。控えは従来と同じ七人で使い回す。
    nearKinds: ['farmer', 'woman', 'child', 'elder', 'merchant', 'townsman', 'monk'] },
  // 密集でも具足・顔・手足を同じ濃さに保つ。視点が体に入る時だけ一人全体を避ける。
  nearAllySolidBody: true,
  nearAllyWholeOcclusion: true, // 本人を隠す味方は全身を一緒に避け、笠や胴だけが透けて浮くのを防ぐ。
  nearAllyFadeRadius: 1.1,
  nearAllyHorseFade: true, // 馬に入った視点も既存の判定で拾う。
  nearLongWeaponRadius: 10, // 後列の長柄も肩越しへ届く範囲まで、既存の処理で描く間だけ避ける。
  nearGroundSpearRadius: 14, // 持ち手から離れた落ち槍も、長柄の先が目前へ届く範囲を拾う。
  nearGroundSpearClearance: 3, // 胸への細い視線だけでなく、視点のすぐ下を横切る柄も描く間だけ避ける。
  compactPlayerSign: true, // 白い本人の輪を小さくし、足と川原を見せる。
  playerSignMinScale: 0.4, playerSignScale: 0.55, // 下限も指定し、携帯でも元の大きな輪へ戻さない。
  hideWeaponTrail: true, // 川前の乱戦に光の帯を重ねず、実際の穂先と構えを見せる。
  fadeCloseStandards: true,
  fadeCloseStandardFrame: true, // 目前の味方の隊旗は布・横木・竿を一緒に透かす。
  camLift: 0.65,
  keepPlayerFeet: true, // パソコンの近い視点でも足と本人の印を同じ画面へ収める。
  footFrameMinDistance: 2.5, // 幕際で寄った時は、足を入れるために真下を向かない。
  clampCamera(rt, pos) {
    // 幕際では布の上へ目線を少し上げる。幕の当たりと開いた口は残す。
    const x = pos.x - HQ.x, z = pos.z - HQ.z;
    if (Math.abs(x) > 9.2 || Math.abs(z) > 7.2) return;
    const north = Math.hypot(Math.max(0, Math.abs(x) - 8), z + 6);
    const sides = Math.hypot(Math.abs(x) - 8, Math.max(0, Math.abs(z) - 6));
    const south = Math.hypot(Math.max(0, 3 - Math.abs(x), Math.abs(x) - 8), z - 6);
    if (Math.min(north, sides, south) >= 1.2) return;
    // 丘では幕の中央と目線の足元の高さが違う。吊り縄の実際の高さも越える。
    pos.y = Math.max(pos.y, rt.world.heightAt(pos.x, pos.z) + 2.6, (rt.flags.hqCurtainTop ?? -Infinity) + 0.35);
  },
  rangeCueClearCenter: true,
  compactFieldGuides: true, // 敵の体と退き道を太い囲みで隠さず、小さな隅で示す。
  noUnitContrast: true, // 足元の輪とは別の白い人型も消す。敵味方の小さな印は残す。
  compactDestinationArea: true, // 大きな持ち場は中心の小さな枠で示す。
  compactWaitArea: true, // 岸と本陣の待機地点は上限のある小さい輪で示す。
  smallTaskAreas: true, smallRetreatAreas: true, taskAreaFootRing: true, // 待機・退避とも画面を横切る大輪に戻さない。
  compactFlagFrames: true, // 旗は縦長の囲みでなく、布の四隅だけを示す。
  cornerFlagFrames: false, // 目標の旗の布を閉じた太い枠で囲み、周囲の隊旗と区別する。
  compactFlagEmphasis: true, // 開幕・移動中の強調も四隅と小さい足元印にし、大輪と下矢印を重ねない。
  compactGroundGoalRing: true, compactGuardPostRing: true,
  visibleFlagGuides: true, // 兵や幕に隠れた旗の囲みを空中へ残さない。
  guideLinkLength: 48, // 離れた任務札から川原を横切る線を引かず、行き先のそばだけ示す。
  swipeArrowLength: 72, // 開幕・向き直し・手当ての案内も、始点から短い矢印にそろえる。
  guideArrowLength: 72, // 別経路の道案内でも兵や川原を横切らせない。
  compactFlagGuide: true, // 持ち場は地面の旗一つで示し、兵を縦長の枠に入れない。
  compactDestinationSign: true, // 川岸の旗と矢印で近くの兵を覆わない。
  groundFlagGuides: false, // 目的の実旗の布を囲み、周囲の隊旗と見分ける。
  compactDodgeGuide: true, // 見回す案内の大きな輪で兵の足と川岸を隠さない。
  avoidDestinationNotices: true, // 画面外への案内と実旗の囲みを任務札に重ねない。
  subtleTargetFrames: true,
  quietCombatCues: true, // 届く距離は照準の形、危険の向きは縁の矢印で伝える。
  reserveCombatCues: true,
  avoidWaymarkThreats: true, // 危険の札は槍列の名前と振り向く案内を避ける。
  compactThreats: true, // 方角に加えて、槍を構える対処を短く示す。
  introTaskFirst: true, // 人物紹介より先に、川を渡らない下知を見せる。
  contextualCoach: true, // 敵が届かない間は突きの手ほどきを休め、岸と本陣の下知を見せる。
  narrowWeaponTrail: true, // 穂先の短い残像に留め、乱戦を横切る白い帯を抑える。
  keepTaskLabel: true, // 近い敵一人の印でも、本陣を守る下知を消さない。
  keepGuardTaskLabel: true, // 敵との歩数で持ち場を離れるよう促さず、岸を守る下知を残す。
  keepDestinationTask: true, // 押し返し・追撃の下知を、行き先の旗だけの文へ縮めない。
  keepFlagTravelTask: true, // 歩数の横にも、川岸・本陣で何をするかを残す。
  keepFlagArrivalTask: true, // 旗に着いても、川へ槍を向けて待つ下知を残す。
  keepDefendTaskLabel: true, // 本陣への帰還・到着後の下知を、一般の旗守備の文で消さない。
  keepRetreatReason: true, // 本陣へ戻る理由を「旗まであと何歩」だけに置き換えない。
  keepWoundRetreatReason: true, // 出血中も、下の専用案内で手当てや本陣守備の目的を残す。
  pauseTurnPractice: false, // 見回しの手ほどきで渡河中の敵も戦の時計も止めない。
  dodgeTurnDuration: 3, // 指の大きな案内は短くし、川と迫る兵を見せる。
  dodgeTurnInterval: 30, // 乱戦中に見回しの手ほどきを何度も重ねない。
  dodgeTurnLabel: (_rt, right, touch) => touch ? `${right ? '右' : '左'}へなぞって味方を見よう` : `${right ? '右' : '左'}を向いて味方を見よう`,
  keepTaskWithCoach: true, // 操作中も、命・操作・今の任務の三枚に収める。
  keepTaskWithGuard: true,
  keepCombatTask: true, // 構えや回避の案内が出ても、守る持ち場を一枚の札に残す。
  keepCombatTaskHeading: true, // 携帯の攻撃操作でも、本陣へ戻る下知を消さない。
  keepTaskWithDodge: true, // 矢をよける間も、川を渡らない下知と本陣へ戻る目的を残す。
  keepDodgeGuideLabel: true, // 画面外の退き先でも、歩数より敵をよける指図を優先する。
  releaseGuardForAttack: true, // 敵の打ち終わりには、押し続ける守りを解いて反撃へ渡す。
  keepOpeningTaskLabel: true, // 最初の旗の囲みでも、渡河禁止の下知を残す。
  // 公記の浅井五千・朝倉八千を分け、味方は囲みを含む総勢と札にも明記する。
  // 川原の実兵数・軽い軍勢の描画数や各手への配分は変えない。
  // https://ja.wikisource.org/wiki/信長公記 （巻三・野村合戦の事）
  introSides: { a: '織田・徳川軍（囲みを含め約二万八千）', b: '浅井約五千・朝倉約八千（信長公記）' },
  // 信長公記の二正面と、軍記を交えた細かな布陣を、戦後の史実欄だけでなく出陣前にも区別する。
  // 史料の検討：https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
  introText: '川は渡らず、岸の味方と浅井を止めよう。列が崩れたら次の旗へ下がり、本陣が危なくなったら南で守ろう。西の三田村口は徳川と朝倉、東の野村口は織田と浅井。浅井・朝倉は北の大依山から二つの郷へ進み出ました。大依山の旧陣は場外で、北の道に方面を示します。信長本陣の場所は、陣杭の柳の伝承を参考にした復元です。細かな陣の並びや磯野の突破は、後世の軍記を交えた復元です。敵の表示は信長公記の浅井五千・朝倉八千を目安にしています。当日付の信長書状では浅井は五千から六千ほど、朝倉は一万五千ほどで、史料により異なります。味方の約二万八千も横山城の囲みを含む諸説ある目安です。描く兵一人が実際の一人を表すわけではありません。開戦は当日付の信長書状の巳の刻を採り、十時ごろの光で表します。信長公記では卯の刻です。晴れ具合と風向きは推定です。',
  openingMoveLabel: 'ここまで なぞろう',
  openingLinkedLabel: 'ここまで なぞろう',
  keepWaitFacingLabel: true, // 携帯でも向き直しを移動の案内に替えない。
  defendLocation: (rt) => rt.flags.step < 2 && !rt.flags.ending && rt.withdrawal?.losing !== 0 ? HQ : null,
  keepWaitOrderLabel: true, // 到着前も「輪に入る」で本陣や次の槍列への下知を消さない。
  // 到着後に許される十八歩までを、共通の守備の輪と内外の案内にも使う。
  defendGuideRadius(rt, marker) {
    return marker.guideDefend ? rt.flags.atHq ? 18 : 12 : marker.guideRadius;
  },
  namedGuideMarkers: true,
  // 見張る相手と槍の印をそろえる。周囲の敵は既存の見張りで集める。
  // 表示だけで使う相手。持ち場を離れる下知の間は敵の印を出さない。
  missionSignTarget(rt) {
    const F = rt.flags;
    if (rt.phase === 'brief' || aneOwnGuide(rt)) return null;
    const stage = aneMissionOf(rt);
    return stage === 2 ? aneCommander(rt) : stage === 1 || stage === 4 ? aneNearestFoe(rt) : null;
  },
  commanderTarget: (rt) => aneCommander(rt),
  namedGuideTarget: (rt) => aneCommander(rt),
  // 稲生の水準：右上は任務の一行・段の丸なし・味方の小旗なし・避ける札なし・空振りは鳴らさない。
  missions: ANE_MISSIONS,
  missionOf: (rt) => aneMissionOf(rt),
  missionSingleLine: true,
  hideMissionDots: true,
  nearbyAllySignLimit: 0,
  noDodgeCard: true,
  inouFeel: true,
  missionPinCaption: '',
  missionDetail: () => '',
  missionStatus: () => '',
  // 段の見出し（渡る・崩れる等）は出さない。勝ち負けの知らせだけ残す。
  bannerAllowed: (rt, t) => rt.over || !!rt.flags.ending || /討ち取|討死|崩れ|退く|果たせず/.test(t),
  // 手負い・退却・東の別手・押し返しの間は undefined を返し、元の印へピンを任せる（mission_pin.js）。
  missionPinFallback: true,
  missionPin(rt) {
    const F = rt.flags;
    if (aneOwnGuide(rt)) return undefined;
    if (!rt.player.u.alive) return null;
    const q = F.anePin || (F.anePin = { x: 0, z: 0, r: 6, hide: 6 });
    const me = rt.player.u.pos, stage = aneMissionOf(rt);
    q.unit = null; q.enemy = false; q.waiting = false; q.arrived = false; q.route = false; q.defend = false;
    q.follow = false; q.fire = false; q.gate = false; q.footRing = false; q.treatment = false; q.passage = false;
    if (stage === 1 || stage === 2 || stage === 4) {
      const u = stage === 2 ? aneCommander(rt) : aneNearestFoe(rt);
      // 槍が届いたら頭上の▼に任せ、ピンは消す。
      if (!u || rt.player.inRange && rt.player.rangeCueTarget === u) return null;
      q.unit = u; q.enemy = true; q.x = u.pos.x; q.z = u.pos.z; q.r = q.hide = 2;
      return q;
    }
    // 守る段・渡る段：持ち場（または向こう岸）に刺したまま。味方の槍列もそこに並ぶ。
    const at = stage === 3 ? { x: 24, z: -22 } : anePost(rt);
    q.x = at.x; q.z = at.z; q.r = q.hide = stage === 3 ? 6 : 8;
    q.waiting = q.defend = stage !== 3;
    q.arrived = q.waiting && Math.hypot(me.x - at.x, me.z - at.z) < 8;
    return q;
  },
  aimGuideTarget(rt) {
    return rt.flags.hqThreat || rt.flags.hqDefend ? rt.flags.hqEnemy : rt.flags.aimEnemy || rt.flags.watchEnemy;
  },
  aimGuideLabel(rt) {
    return rt.flags.hqThreat || rt.flags.hqDefend ? '本陣の敵をねらおう' : '持ち場の敵をねらおう';
  },
  enemyTaskLabel(rt) {
    return rt.flags.hqThreat || rt.flags.hqDefend ? '本陣の敵を見て まもる' : '敵を見て まもる';
  },
  enemyTaskTarget(rt) {
    if (!(rt.flags.hqThreat || rt.flags.hqDefend) || anegawaReturning(rt)) return null;
    const enemy = rt.flags.hqEnemy, p = rt.player.u.pos;
    return enemy?.alive && Math.hypot(enemy.pos.x - p.x, enemy.pos.z - p.z) < 18 ? enemy : null;
  },
  aimReadyLabel(rt) {
    return anegawaGuardLabel(rt, true);
  },
  waitFacingTarget(rt) {
    return rt.flags.waitFacingEnemy ? rt.flags.watchEnemy : null;
  },
  waitFacingLabel(rt, ready) {
    return ready ? anegawaGuardLabel(rt, true) : rt.flags.waitFacingEnemy ? '敵へ向く' : '川へ向く';
  },
  waitFacingPoint(rt) {
    const F = rt.flags;
    F.waitFacingEnemy = false;
    if (!F.holdAt || F.step >= 2 || F.hqThreat || F.hqDefend || F.pushGuiding ||
        F.retreatGuiding || F.taskHurt || rt.withdrawal || F.flankPick === 0 && !F.flankDone || F.nearEnemies > 0) return null;
    // 後方の列では、川に向き直らせず、実際に迫る兵を見張らせる。
    const enemy = F.watchEnemy;
    F.waitFacingEnemy = rt.phase !== 'brief' && !!enemy?.alive && !enemy.fleeing && !enemy.group?.routed;
    if (!F.waitFacingEnemy && rt.phase !== 'brief' &&
        (F.holdAt.z > POST.z + 4 || F.inabaT || F.westReported)) return null;
    const point = F.waitFacingPoint || (F.waitFacingPoint = { x: 0, z: 0 });
    if (F.waitFacingEnemy) { point.x = enemy.pos.x; point.z = enemy.pos.z; return point; }
    point.x = F.holdAt.x; point.z = aneCenter(point.x);
    return point;
  },
  singleRouteGuide: true, // 本陣への道筋が見える時は、足元へ別の矢印を重ねない。
  compactRouteGuide: true, // 横持ちでも道筋を細く保ち、倒れた兵や川原を覆わない。
  directionArrowLength: 72, // 足元の向きは短く示し、実旗まで兵を貫く白線を引かない。
  retreatArrowLength: 72,
  // 帰陣は次に踏む道だけを示す。遠い本陣までの折れ線で兵や空を横切らない。
  guidePath(rt, marker) {
    if (marker?.id !== 'hqGuard' && marker?.id !== 'honjinHelp' || !anegawaReturning(rt)) return null;
    const F = rt.flags, p = rt.player.u.pos;
    const pool = F.hqGuidePoints || (F.hqGuidePoints = Array.from({ length: 2 }, () => ({ x: 0, z: 0 })));
    const path = F.hqGuidePath || (F.hqGuidePath = []);
    if (F.hqGuideAt > rt.t && F.hqGuideMarker === marker && Math.hypot(p.x - pool[0].x, p.z - pool[0].z) < 1) return path;
    F.hqGuideAt = rt.t + .5; F.hqGuideMarker = marker;
    const road = rt.world.def.paths[0];
    const goal = F.hqDefend ? F.hqDefensePos : F.hqGuardPos;
    // 最寄りの道へ真横に戻すと、大きく折れ返る。南へ進んだ先の道へ合流する。
    // すでに本陣の南にいる時は、そのまま守備の旗へ戻す。
    const joinZ = p.z + Math.min(12, Math.abs(p.x - goal.x) * 0.5);
    let nextX = goal.x, nextZ = goal.z;
    for (let i = road.length - 1; i >= 0; i--) if (road[i][1] > joinZ && road[i][1] < goal.z) {
      nextX = road[i][0]; nextZ = road[i][1]; break;
    }
    const dx = nextX - p.x, dz = nextZ - p.z, distance = Math.hypot(dx, dz);
    if (distance < 1) { path.length = 0; return path; }
    // 本人の印を避けて少し先から数歩ぶん。二点と配列は使い回す。
    const start = Math.min(0.8, distance * 0.25), end = Math.min(3, distance);
    pool[0].x = p.x + dx * start / distance; pool[0].z = p.z + dz * start / distance;
    pool[1].x = p.x + dx * end / distance; pool[1].z = p.z + dz * end / distance;
    path[0] = pool[0]; path[1] = pool[1]; path.length = 2;
    return path;
  },
  travelGuideLabel(rt) {
    const marker = anegawa.guideMarker(rt);
    if (marker === 'withdrawPost') return 'この旗まで さがろう';
    if (marker === 'hurtRetreat') return '手当の場所へ';
    if (marker === 'honjinHelp' || marker === 'hqGuard') return anegawaHqReturnText(rt);
    if (marker === 'ford' || marker === 'pursuitPost') return '浅い川をわたろう';
    if (marker === 'eastPost') return '東の川岸へ進もう';
    if (marker === 'pushPost') return '押す味方の槍の列へ';
    return anegawaHoldRoute(rt);
  },
  guardStartText: '長押しで ふせぐ',
  waitGuardButtonText: '長押しで ふせぐ',
  // 携帯専用の移動案内でも、帰陣する理由と今の持ち場を残す。
  waitTravelLabel(rt) { return anegawa.travelGuideLabel(rt); },
  guardTravelLabel(rt) { return anegawa.travelGuideLabel(rt); },
  edgeDestinationCaption(rt, marker, distance) {
    const target = anegawa.guideMarker(rt);
    const place = marker.guideDefend ? '本陣' : target === 'eastPost' ? '東の川岸' :
      target === 'ford' || target === 'pursuitPost' ? '向こう岸' :
      target === 'withdrawPost' ? '退く旗' : target === 'hurtRetreat' ? '手当ての旗' :
      rt.flags.holdAt?.z <= POST.z + 4 ? '川岸の旗' : '味方の旗';
    return `${place}へ ${Math.ceil(distance)}歩`;
  },
  // 間合いの外の敵を示す札でも、岸の守備を旗への前進に言い換えない。
  meleeApproachText(rt) {
    const F = rt.flags;
    if (rt.withdrawal?.losing === 0) return F.withdrawReached ? '旗のそばで待とう' : '旗まで進もう';
    if (F.retreatGuiding || F.taskHurt) return anegawa.retreatGuideLabel(rt, F.retreatReached);
    if (F.hqThreat || F.hqDefend) return anegawaGuardLabel(rt, !anegawaReturning(rt));
    if (F.step === 2) return '逃げる敵を追おう';
    if (F.pushGuiding || F.inabaT) return '敵を押し返そう';
    if (F.flankPick === 0 && !F.flankDone) return '東の岸で敵を止めよう';
    return 'この敵を止めよう';
  },
  defenseLine(rt) {
    const F = rt.flags;
    if (F.step >= 2 || F.ending || rt.withdrawal) return null;
    const threat = !!(F.hqThreat || F.hqDefend);
    if (!threat && (F.pushGuiding || F.flankPick === 0 && !F.flankDone || !F.holdAt)) return null;
    const line = F.defenseLine ||= { x: 0, z: 0, halfWidth: 8, threat: false, label: '', flagOnly: true };
    // 川前で待つ間は、遠い本陣でなく今いる味方の槍列を示す。
    const hqPost = F.hqDefend ? F.hqDefensePos : F.hqGuardPos;
    line.x = threat ? hqPost.x : F.holdAt.x;
    line.z = threat ? hqPost.z : F.holdAt.z - 3;
    line.faceX = line.x;
    line.faceZ = threat ? line.z - 12 : aneCenter(line.x);
    // 本陣を抜けた敵にも向き直る。川の方だけを守らせない。
    if (threat && F.hqEnemy) { line.faceX = F.hqEnemy.pos.x; line.faceZ = F.hqEnemy.pos.z; }
    else if (!threat && F.watchEnemy?.alive && !F.watchEnemy.fleeing && !F.watchEnemy.group?.routed) {
      line.faceX = F.watchEnemy.pos.x; line.faceZ = F.watchEnemy.pos.z;
    }
    line.halfWidth = threat ? 22 : 8;
    line.threat = threat;
    line.showFacingFlag = false; // 本陣も任務の旗を使い、向きのための二本目を足さない。
    line.keepVisibleWithEnemy = threat;
    line.label = threat ? '本陣前・ここを守る' : F.holdAt.z <= POST.z + 4 ? '川岸・ここで待つ' : '味方の列・ここで守る';
    return line;
  },
  // 届く相手の打ち終わりには反撃を案内する。傷・退却・射撃の案内は共通の判断を先にする。
  attackOpening(rt, enemy) {
    const P = rt.player, u = P.u;
    if (rt.phase === 'brief' || enemy.atk || enemy.swing && !enemy.swing.done ||
        Math.abs(enemy.pos.y - u.pos.y) > 1.5 ||
        Math.hypot(enemy.pos.x - u.pos.x, enemy.pos.z - u.pos.z) > P.meleeReach(P.weapon === 'sword' ? 'slash' : 'thrust')) return false;
    // 別の敵が打ち込む最中は、正面のすきだけを見て攻撃を勧めない。
    for (const e of rt.army.units) {
      if (!e.alive || e.team === u.team || e.fleeing || e.woundOut || e.noTarget) continue;
      if ((e.atk?.target === u || e.swing?.target === u && !e.swing.done) &&
          Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) < 4.5) return false;
    }
    return true;
  },
  // 右上は今すること一つ。目的地は共通の輪と同じ持ち場を使う。
  missionHeading(rt) {
    const text = currentObjective(rt)?.text || '';
    const F = rt.flags;
    // 稲生の水準：毎回いまの戦場から決める。討った・着いた瞬間に次の一行へ替わる。
    if (!aneOwnGuide(rt)) return ANE_MISSIONS[aneMissionOf(rt)];
    if (F.step < 2 && !rt.withdrawal && !F.taskHurt && !rt.player.treating &&
        !F.retreatGuiding && !F.pushGuiding && !(F.flankPick === 0 && !F.flankDone)) {
      if (F.hqThreat || F.hqDefend) return anegawaGuardLabel(rt, !anegawaReturning(rt));
      return anegawaGuardLabel(rt, !!F.holdAt && Math.hypot(rt.player.u.pos.x - F.holdAt.x, rt.player.u.pos.z - F.holdAt.z) < 8);
    }
    if (/印の槍列へ戻り|印の槍列で槍を揃え直せ|味方と槍を揃え、浅井を止めよ|ここで槍を揃え|川を渡らず、岸で浅井を(?:待て|止めよ)/.test(text)) {
      const at = rt.flags.holdAt, p = rt.player.u.pos;
      return at && Math.hypot(p.x - at.x, p.z - at.z) < 8 ? anegawaGuardLabel(rt, true) : '旗へもどろう';
    }
    return text;
  },
  // 表示の言い換えだけ。兵の動き・傷・任務の成否は変えない。
  taskText(rt, text) {
    const F = rt.flags;
    if (anegawaHqReturnPriority(rt)) return anegawaHqReturnText(rt);
    if (F.taskHurt || rt.player.u.wounds?.bleed > 0.0001 || rt.player.treating) {
      const hq = anegawaHurtHqText(rt, F.retreatReached);
      if (hq) return hq;
    }
    if (rt.withdrawal?.losing === 0 || F.taskHurt || /手当て|布|血|傷/.test(text)) return text;
    if (rt.phase === 'brief') {
      const p = rt.player.u.pos;
      return F.holdAt && Math.hypot(p.x - F.holdAt.x, p.z - F.holdAt.z) < 8
        ? '川をわたらず、ここで待つ' : anegawaHoldRoute(rt);
    }
    if (F.hqThreat || F.hqDefend) return anegawaGuardLabel(rt, !anegawaReturning(rt));
    if (F.step === 2) return text;
    if (F.flankPick === 0 && !F.flankDone) return '東の川岸で敵を止めよう';
    if (F.pushGuiding) return rt.guideEnemyShown ? '味方と浅井を押そう' : '味方の槍の列へ進もう';
    if (F.atHold) return anegawaGuardLabel(rt, true);
    return anegawaHoldRoute(rt);
  },
  // 最後の表示段階でも、帰還・到着を同じ短い札で伝える。判定や難しさは変えない。
  conciseTaskLabel(rt, text) {
    const F = rt.flags;
    if (rt.over || rt.withdrawal?.losing === 0 || F.taskHurt || rt.player.treating ||
        rt.player.u.wounds?.bleed > 0.0001 || rt.player.u.hp < rt.player.u.maxHp * .6 ||
        rt.dodgeGuide || rt.hud.retreatGuide?.active) return text;
    if (F.hqThreat || F.hqDefend) return anegawaReturning(rt) ? anegawaHqReturnText(rt) : anegawaHqWatchText(rt);
    if (F.step < 2 && !F.atHold && !F.pushGuiding && !(F.flankPick === 0 && !F.flankDone))
      return anegawaHoldRoute(rt);
    return text;
  },
  placeText(label) {
    // 野村・三田村・岡山の本陣を、織田の本陣と言い換えない。
    // 地名だけの案内でも、東の野村を一律に「東の川岸」へ置き換えない。
    // 当日の陣所の解説：https://cocoshiga.jp/official/topic/ieyasu01/
    if (/浅井|朝倉|徳川|野村|三田村|岡山|横山城/.test(label)) return label;
    if (/信長|織田本陣/.test(label)) return '本陣の前';
    if (/東|別手/.test(label)) return '東の川岸';
    if (/槍列/.test(label)) return '味方の旗';
    return label;
  },
  readableLogEntry: true, // 数字だけの札にせず、報せを読む入口と示す。
  rearThreatFrame: true,
  rearAdviceView: true, // 振り向く声と危険の札を、どちらも見ている向きにそろえる。
  compactGunAction: '横へ走れ', // 柵のない川原でも、射線を外す動きが分かる。
  // 敵をまだ示していない待機場所では、操作だけで持ち場の下知を消さない。
  waitOrderLabel(rt, reached) {
    if (rt.flags.hqThreat || rt.flags.hqDefend) return anegawaGuardLabel(rt, reached);
    return reached ? anegawaGuardLabel(rt, true) : anegawaHoldRoute(rt);
  },
  // 本陣へ戻る間は近い敵への案内で旗を消さない。深手・手当て中は傷を優先する。
  routeGuidePriority: anegawaHqReturnPriority,
  // 待機の旗に着いただけでは、敵のいない川原へ防御の大札を出さない。
  // 接近中の長槍・騎馬には間を残し、倒れた兵や射手は防御の相手にしない。
  waitGuardAllowed(rt, enemy) {
    const p = rt.player.u;
    return !!enemy?.alive && enemy.team !== p.team && !enemy.fleeing && !enemy.woundOut &&
      !enemy.downed && !enemy.dropped && !enemy.noTarget && !enemy.isStruct &&
      (enemy.sidearm || enemy.type !== 'gun' && enemy.type !== 'bow') &&
      Math.abs(enemy.pos.y - p.pos.y) < 1.5 &&
      Math.hypot(enemy.pos.x - p.pos.x, enemy.pos.z - p.pos.z) < (enemy.mounted ? 8 : 6);
  },
  waitActionText(rt) {
    const F = rt.flags;
    if (F.hqThreat || F.hqDefend) return anegawaGuardLabel(rt, !anegawaReturning(rt));
    return anegawa.waitOrderLabel(rt, true);
  },
  // 指の印がある釦そのものを長押しする。横持ちでも短い一文に収める。
  dodgeActionText: '長く押してよける',
  dodgeLabel: (rt, direction, rain) => direction ? direction.replace(/にげる/g, 'よける') : rain ? '矢だ！ 印の方へよけよう' :
    rt.flags.hqThreat || rt.flags.hqDefend ? '本陣が危ない。敵をよけよう' : '味方の旗へ退き、槍を揃えよう',
  dodgeGuideLabel: (rt, reached, rain) => rain ? reached ? 'ここで敵へ槍を向けよう' : '印へよけて、矢を避けよう' :
    rt.flags.hqThreat || rt.flags.hqDefend ? '本陣が危ない。敵をよけよう' : reached ? 'ここで敵へ槍を向けよう' : '味方の旗へ退き、槍を揃えよう',
  escapePlaceLabel: (rt, rain, side) => rain ? anegawaHqReturnPriority(rt) ? `${side}へ矢をよけ、本陣へ戻ろう` :
    rt.flags.hqThreat || rt.flags.hqDefend ? `${side}へ矢をよけ、本陣を守ろう` : `${side}へよけて、矢を避けよう` : `${side}へよけて、槍を構えよう`,
  rainDodgeGuideLabel: (rt, reached) => anegawaHqReturnPriority(rt) ? reached ? anegawaHqReturnText(rt) : '矢をよけ、本陣へ戻ろう' :
    rt.flags.hqThreat || rt.flags.hqDefend ? reached ? anegawaHqWatchText(rt) : '矢をよけ、本陣を守ろう' : reached ? 'ここで敵へ槍を向けよう' : '印へよけて、矢を避けよう',
  retreatGuideLabel(rt, reached) {
    if (rt.withdrawal?.losing === 0) return reached ? '旗のそばで待とう' : '旗まで進もう';
    // 共通の退避案内でも、軽傷なら帰陣先と着いてからの守備を残す。
    if (anegawaHqReturnPriority(rt)) return anegawaHqReturnText(rt);
    const hurt = rt.flags.taskHurt || rt.player.u.wounds?.bleed > 0.0001 || rt.player.treating;
    if (hurt) {
      const hq = anegawaHurtHqText(rt, reached);
      if (hq) return hq;
    } else if (rt.flags.hqThreat || rt.flags.hqDefend) {
      // 退く先の印には移動の下知を付け、敵を指しているように見せない。
      return reached ? anegawaHqWatchText(rt) : anegawaHqReturnText(rt);
    }
    return rt.flags.retreatGuiding && rt.player.treatmentLeft > 0 && rt.player.treatmentNext <= rt.t
      ? reached ? '止まって手当しよう' : '手当の場所へ'
      : reached ? 'ここで構えて休もう' : anegawaHoldRoute(rt);
  },
  retreatDestinationLabel: (rt) => rt.withdrawal?.losing === 0 ? '退き先・ここで組を集める' : 'ここまで下がろう',
  dodgePointAllowed: anegawaGuidePointAllowed,
  // 道の矢印は、川の曲がりに沿って乾いた岸を通す。行動や到着の判定は変えない。
  approachGuidePoint(rt, from, goal) {
    if (rt.flags.step >= 2) return null;
    const point = rt.flags.bankGuidePoint || (rt.flags.bankGuidePoint = { x: 0, z: 0 });
    const dx = goal.x - from.x, dz = goal.z - from.z, distance = Math.hypot(dx, dz);
    const t = Math.min(1, 3 / Math.max(.001, distance));
    point.x = from.x + dx * t;
    point.z = Math.max(from.z + dz * t, aneCenter(point.x) + aneWidth(point.x) + 3);
    return point;
  },
  retreatPointAllowed: anegawaGuidePointAllowed,
  distanceUnit: 'steps',
  hideGuideSteps: true, // 横持ちの任務札は、歩数より守備・手当て・退却の下知を優先する。
  taishoRaid: { list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 12 }],
    width: 10, spacing: 1.1, formation: 'yari' },
  jinkei: ANEGAWA_JIN,
  softOpen: 0,   // 開戦直後も傷を軽くしない
  // 普通・易では、重なる槍の傷を共通の仕組みで抑える。
  // 満身から十秒の白兵でも、部位の最大一・四倍を含めて傷は八割ほどまで。矢玉は別。
  meleeGrace: { rate: 0.05, burst: 0.08, interval: 0.85 },
  woundEffectMin: 0.05, // ごく浅い傷では退避の大札を出さず、傷の部位を残す。
  phaseBanners: true,
  latestPhaseBanner: true,
  downReasonBanner: true, // 倒れた理由は、携帯でも補足として畳まない。
  retryReason(_rt, info) {
    return !info.down && /本陣.*(?:押|破|通)/.test(info.failureReason || '') ? '本陣の守りを破られた' : null;
  },
  retryAdvice(_rt, info) {
    return !info.down && /本陣.*(?:押|破|通)/.test(info.failureReason || '') ? '本陣の旗へ戻り、幕へ入った敵に槍を向けよう' : null;
  },
  downFogFar: 280, // 終幕でも、戦中より煙を濃くして周りの兵を隠さない。
  noDespair: true, // 遠い山の大軍ではなく、目の前の川と浅井の旗から始める。
  sideTaskAfter: Infinity, // 常に主の下知一件を案内し、渡河禁止の札と入れ替えない。
  noAllyReports: true, // 遠い森の独り言を復唱せず、姉川固有の戦況を使番が運ぶ。
  nobiki: true, // 敗北や隊の退却には、合成の法螺貝と退き太鼓を使う。
  withdrawGuidance: true, // 生きて退く間は、南の退き口と下知を隠さない。
  immediateTaskChanges: true, // 下知側で十秒の間引き済み。退却・到着まで古い守備の文を残さない。
  guideMarker: (rt) => rt.withdrawal?.losing === 0 ? 'withdrawPost' : anegawaHqReturnPriority(rt) ? rt.flags.hqDefend ? 'honjinHelp' : 'hqGuard' : rt.flags.retreatGuiding ? 'hurtRetreat' : rt.flags.hqDefend ? 'honjinHelp' : rt.flags.hqThreat ? 'hqGuard' : rt.flags.step === 2 ? (rt.flags.fordMarked ? 'ford' : 'pursuitPost') :
    rt.flags.flankPick === 0 && !rt.flags.flankDone ? 'eastPost' : rt.flags.pushGuiding ? 'pushPost' : 'stop',
  withdrawTick(rt) {
    if (rt.withdrawal.losing !== 0 || !rt.player.u.alive) return;
    if (rt.flags.withdrawMarked) {
      if (!rt.flags.withdrawReached && Math.hypot(rt.player.u.pos.x - rt.flags.withdrawAt.x,
          rt.player.u.pos.z - rt.flags.withdrawAt.z) < 8) {
        rt.flags.withdrawReached = true;
        anegawaObjective(rt, 'main', '旗のそばで待とう', true);
      }
      return;
    }
    anegawaWithdrawPost(rt);
    rt.flags.withdrawMarked = true;
    for (const id of ['stop', 'eastPost', 'pushPost', 'hqGuard', 'honjinHelp', 'hurtRetreat', 'ford', 'pursuitPost']) rt.unmark(id);
    anegawaObjective(rt, 'main', '旗まで進もう', true);
    rt.marker('withdrawPost', rt.flags.withdrawAt, '集まる旗', { guideArea: 'retreat', guideFlag: true, guideRadius: 8 });
    rt.hud.say('組頭', '退き太鼓じゃ！　旗のそばで味方を待て！', 8, true);
  },
  botOrders: true, // 持ち場と反撃の判断を、性格の突進・構え直しで上書きしない。
  // 列や建物の当たりを残し、組の脇の空いた所から始める。
  attackWarningDelay: 1, // 打たれる前に迫る向きを知らせ、構える間を残す。
  // 稲生の標準（kaito 10/23）：小地図・足元の輪・浮かぶ字の札を出さず、行き先のピン・敵の頭上の▼・右上の任務一行に絞る。
  noControlsHelp: true,   // 操作の字は尾張の戦で覚える。この戦では出さない
  missionStyle: 'field',   // 共通の頭上印を刀でなく稲生と同じ赤い▼に・ピンを判定地点に固定（field_signs・mission_pin）
  noPlayerFoot: true,
  noFieldMap: true,
  hideArmyPeek: true,
  foeMarks: true,
  enemyTriangleSigns: true,
  spawn: { x: POST.x - 8, z: POST.z + 5, heading: Math.PI - 0.5 },   // 川と味方の列・行き先を一つの画面に収める
  // 身の回りの当時の場（timeslip_field.js）。元亀元年六月二十八日は今の八月初め・真夏の朝。
  // 乾いた川原と岸の踏み跡、夏草と岸の葦、蹴立てた土埃。森可成の持ち場と浅瀬ほど、倒れた槍と浅井方の旗が多い。
  timeslip: {
    wet: 0.1, dust: 0.8, trample: 0.25, debris: 1, arrows: 0.6, reeds: 0.9,
    mudColor: 0x6d6557, // 踏み荒らした土の斑は川原の灰茶に。日に照る黄土の平たい板に見せない（10/29）。
    // 真夏の川原の草は日に焼けた暗い緑と枯れ茎の黄土。明るい若緑の板に見せない（10/29）。
    grass: 0x5f6b3c, grassTints: [0xffffff, 0xd6cc9c, 0xb9ad84], grassH: 1.1, tallGrass: 0.75,
    // 持ち場の側の乾いた玉石の川原には株を立てない。葦は水際の二〜三歩だけ、草は川原の外の岸へ。
    noGrass: (x, z) => { const c = aneCenter(x), d = z - c, w = aneWidth(x); return d > w + 3.5 && d < w + 24 && x > -90 && x < 55; },
    flagColors: [0xe6e0cc, 0x24211e, 0x3c5a48],
    fights: [[POST.x, POST.z, 36], [MORI.x, MORI.z, 26], [0, 0, 34], [-192, 4, 28], [100, 2, 24]],
  },
  // 重さ対策（kaito 10/1、原因を測って直す）：姉川は西・中・東の三方で大軍がぶつかり、本物の兵（写実の人）が同時に一番増える戦。
  // wakeRoom で本物の兵の上限を少し控えめに、humQ で写実の人へ替える数の上限を少し控えめにする（近さ・質はそのまま。見た目は大きく変えない）
  wakeRoom: 150,
  humQ: { max: 56, mustMax: 72 },
  world: {
    compactScenery: true,
    drawTimeUnitParts: true, // 描く時の骨と逆行列を揃え、槍も持ち主と同じ束で描く。古い位置に柄だけを残さない。
    fitSupplyCover: true, // 兵糧の筵は俵の表面へ掛け、端を地面へ垂らす。
    variedInfantry: true, // 接敵した兵は腰を戻し、隣と拍子をずらして押し返す。
    infantryWeight: true, // 共通の膝・腰の踏ん張りを使い、近景の兵に重みを残す。
    wholeInfantrySilhouette: true, // 川を上がった中景の徒歩兵も脚を残し、腰だけ浮く姿へ切り替えない。
    clashMiddleDetail: 36, // 近づいた前線は袖・顔・脚のある既存の形を三十六歩まで保つ。
    livingSpearHedge: true, // 槍衾の密度を保ち、後列にも重心の移りを伝える。
    groundHalf: 420, // 横山城（南へ三百七十八）と西南の別手まで収める。地面の分割数・兵数は増やさない。
    moveLim: 390,    // 西の瀬と横山城の囲みも、実兵と控えが歩ける範囲へ入れる。
    terrainTriangles: true, // 描く面と足・目線の高さを合わせ、丘で地面の裏へ入らない。
    variedFalls: true, // 密集していても、討たれた兵が同じ向きに並んで倒れない。
    fallPaceSpread: 0.35, // 膝を折る速さもずらし、一斉に同じ姿勢で止まるのを避ける。
    groundedFalls: true, // 横倒しの胴の厚みを支え、落ちる槍も体の向きへ揃える。
    slopeContactFalls: true, // 本陣の丘でも、足元でなく寝た胴の下へ接地させる。
    slopeLitter: true, // 長い竿や柄の中心を岸・丘の傾斜へ合わせる。
    longitudinalSpearFalls: true, // 握りの前後が違う長柄は、実際の穂先と石突で支えて岸の中央の傾きで浮かせない。
    bareFallenHats: true, // 落ちた笠に頭巾や首の形を残さず、笠だけを接地させる。
    settleSideFalls: true, // 横斬りでは途中で肩をひねり、最後は地へ横向きに収まる。
    crumpledFlags: true, // 落ちた指物は小さく皺を寄せ、川原に伏せる。
    keepSpawnInside: true, // 控えや援軍の後列も、出現する前に隊ごと場内へ収める。
    blockedHint: () => '槍列を突っ切るな。列の横を通り、森の旗へ戻れ',
    seed: 70,
    wind: [0.6, -0.8],   // 南東からの夏の風
    time: 'day',         // 当日付信長書状の巳の刻を採り、昼前の光から始める。
    mood: 'plain',       // 当日の濃霧は確かでない。川面と向こう岸の旗が見える空にする。
    mist: false,
    hazeColor: 0xaec2d2,   // 夏の晴れの遠景は青い霞。白い紗で遠山と空を平らに塗らない（手本。10/29）
    groundMistScale: 0.6,
    fogFar: 360, // 朝の霞は遠景に残し、対岸の具足と旗の色を見せる。
    battleViewDistance: 140, // 共通の八十歩の霞で対岸・本陣を白く隠さない。兵数と地形の細かさは増やさない。
    naturalArrowRain: true, // 落下範囲を黒い円盤にせず、矢の影を薄く残す。
    arrowRainGroundCue: false, // 白黒の大輪で川原を覆わず、矢の影・警告・安全な退き先の印で伝える。
    arrowRainPerBow: 1, // 弓兵一人につき補助の矢は一本。少人数の射手から三十六本の束を増やさない。
    smokeFogFloor: 480, // 広い川原を煙一枚で覆わず、対岸の旗と兵の色を残す。
    muddy: 0.2,
    softPathSoil: true, // 本陣へ続く踏み道の縁を升目で切らず、草地へなじませる。
    softEarthCrust: true, // 本陣前の乾いた土塊は縁をぼかし、四角い升の継ぎ目を残さない。
    sparseEarthCrust: true, // 盛り上がる土塊を斑に間引き、裸地を板の敷き詰めにしない。
    subtleMudRelief: true, // 泥の窪みは踏まれた所へ絞り、色・照り・凹凸を一緒に抑える。
    waterSlow: true,   // 姉川を渡る間は遅く、馬は岸へ上がる時に弱る（terrain_tags.js の 'water'）
    // 陣所と両郷の連絡路に、民の戸口からの里道も合わせる。道筋は遊び用の復元。
    paths: [ODA_PATH, [[-1030 / 5, 700 / 5], [-1000 / 5, 560 / 5], [-960 / 5, 360 / 5], [-192, 4]], YOKOYAMA_PATH, MITAMURA_PATH, ...PEOPLE_PATHS, ...PEOPLE_ACCESS, ...ANE_LINK_PATHS],
    height: aneCastleHeight,
    grassMix(x, z, pd) {
      // 踏み道の中央は裸地、外は大きな草の島と湿った土が交互に続く。
      // 持ち場の側の川原の外の縁は、裸地の黄土の平たい帯を作らず夏草へつなぐ（10/29）。
      const d = z - aneCenter(x) - aneWidth(x), rim = d > 18 && d < 70 && x > -100 && x < 140 ? 0.55 : 0;
      return aneSmooth((pd - 0.8) / 1.8) * Math.max(rim, 0.18 + aneMeadow(x, z) * 0.8);
    },
    tint(x, z, h, c) {
      // 近くの草は土と枯れ草の斑を残し、遠い緑一色へつながない。
      const patch = 0.5 + 0.5 * Math.sin(x * 0.17 + Math.sin(z * 0.13)) * Math.cos(z * 0.21);
      const near = 1 - aneSmooth((Math.abs(z) - 60) / 120);
      // 真夏の野は白く飛ばさず、濃い夏草と乾いた土の斑に（10/28：白っぽい一枚に見えた）
      c.multiplyScalar(0.86 + patch * 0.2);
      c.r += near * patch * 0.025; c.b += near * patch * 0.012;
      const cut = yokoyamaCutDepth(x, z) / 1.8;
      if (cut > 0) {
        c.r += (0.38 - c.r) * cut; c.g += (0.31 - c.g) * cut; c.b += (0.21 - c.b) * cut;
      }
      // 水面・川床と同じ蛇行と川幅で砂利の帯を置く。直線補間では曲がり角の水際からずれる。
      const d = Math.abs(z - aneCenter(x)), shore = aneWidth(x) + 2;
      if (d < shore) { const k = 1 - d / shore; c.setRGB(c.r * (1 - 0.5 * k) + 0.28 * k, c.g * (1 - 0.5 * k) + 0.26 * k, c.b * (1 - 0.5 * k) + 0.22 * k); }
      // 持ち場の側の川原の外の縁と踏み道は、日に照る黄土の平たい帯にせず灰茶の砂利へ寄せる（10/29）。
      const ds = z - aneCenter(x) - aneWidth(x);
      if (ds > 2 && ds < 70 && x > -100 && x < 140) {
        const k = 0.45 * (1 - aneSmooth((ds - 50) / 20)), l = (c.r + c.g + c.b) / 3;
        c.setRGB(c.r + (l * 1.02 - c.r) * k, c.g + (l * 0.98 - c.g) * k, c.b + (l * 0.9 - c.b) * k);
      }
    },
    clear: (x, z) => (x > -275 && x < 160 && z > -176 && z < 200) || peopleLaneClear(x, z) ||
      PEOPLE_CLEARINGS.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r) ||
      (x > 89 && x < 109 && Math.abs(z - YOKOYAMA[0].z) < 17) ||
      YOKOYAMA.some((k) => Math.abs(x - k.x) < k.hw + 6 && Math.abs(z - k.z) < k.hd + 6),
    fieldStage: 'growing',   // 稲の育ちと水の有無を合わせる（細かな収穫時期は推定）
    paddy(x, z) {
      if (z < 50 || z > 128 || x < -30 || x > 100) return 0;
      if (Math.abs(x - 30) < 5) return 0;
      if ((Math.floor(x / 12) + Math.floor(z / 15)) % 3 === 0) return 0;
      // 復元した道を田の水膜と稲で塞がない。道の肩は一歩の幅で畦へなじませる。
      let roadDist2 = Infinity;
      for (const s of PADDY_ROAD) {
        const t = Math.max(0, Math.min(1, ((x - s.x) * s.dx + (z - s.z) * s.dz) / s.len2));
        const dx = x - s.x - s.dx * t, dz = z - s.z - s.dz * t;
        roadDist2 = Math.min(roadDist2, dx * dx + dz * dz);
      }
      if (roadDist2 <= 4) return 0;
      const ex = Math.min(((x % 12) + 12) % 12, 12 - ((x % 12) + 12) % 12), ez = Math.min(((z % 15) + 15) % 15, 15 - ((z % 15) + 15) % 15);
      return Math.max(0, Math.min(1, (Math.min(ex, ez) - 0.8) / 0.6)) * aneSmooth(Math.sqrt(roadDist2) - 2);
    },
    // 浅瀬の位置と深さは遊び用の復元。史実の測量値ではない。川の点は東から西へ渡し、水面の流れを合わせる。
    riverCross: true,
    streams: [
      { pts: [...ANE].reverse(), w: 9, depth: 1.7, fords: [{ x: -192, w: 24 }, { x: 0, w: 25 }, { x: 100, w: 20 }] },
      ...MITAMURA_STREAMS,
      // 北の後方の川。既存の水面・材質・地面の仕組みを共用し、毎コマ物を作らない。
      { pts: KUSANO, w: 4, depth: 0.8, levelAt: kusanoLevel },
      // 田の脇の浅い用水。位置は復元。東の持ち場・渡河路を塞がない。
      { pts: [[72, 128], [72, 50]], w: 0.45, depth: 0.15 },
    ],
    rocks: 0, // 川原は専用の丸石だけ。共通の暗く平たい岩は置かない。
    trees: 230,   // 重さ対策：姉川は大軍の描く数が多いので、木は控えめに（kaito 10/1）
    tufts: 2600,
    scatterNearGrass: false, // 同じ株数を大小の群落へ寄せ、裸地と草丈の差を残す。
    tuftTint: 0xb6bd9a, // 株ごとの緑へ暗い緑を二重に掛けず、黒い斑点になるのを抑える。
    treeDensity: (x, z) => (z < -150 || z > 220 || Math.abs(x) > 270 ? 1 : 0.25),
    // 指定の林は共通の空き地判定を通らないため、川床と槍列から外へ移す。
    treeMix: { sugi: .18, matsu: .32 },   // 岸と野の林は丸く茂る広葉樹が主（杉の黒い円錐を並べない。手本。10/29）
    groves: [{ x: -300, z: 60, r: 12, n: 18 }, { x: 190, z: 40, r: 12, n: 16 }, { x: -30, z: -205, r: 14, n: 22 }, { x: 80, z: -205, r: 12, n: 18 }],
  },

  setup(rt) {
    aneLive = rt;
    const W = rt.world;
    const F = rt.flags;
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    // 地面の影に土色の最低限の明るさを残す。影の形は保ち、黒い帯を薄くする。
    W.terrain.material.emissive.setHex(0x514735);
    W.terrain.material.emissiveIntensity = 0.38;
    // 稜線にかかる低い雲も空へほどき、白い塊の縁を浮かせない。
    W.skyMat.fragmentShader = W.skyMat.fragmentShader.replace('c = mix(c, cc, dens *',
      'cc = mix(c, cc, smoothstep(0.04, 0.3, d.y));\n c = mix(c, cc, dens *');
    W.skyMat.needsUpdate = true;
    // 湖北平野から琵琶湖へ開ける西南を、共通の近山の輪で塞がない。
    // 長浜市の地形解説：https://www.city.nagahama.lg.jp/0000001835.html
    // 方角ごとの見通しを補う復元で、当時の稜線の実測ではない。
    // 北・東の山並みと横山・岡山の実地形は保つ。対岸方向の遠山は低い輪郭を残す。
    // 開戦時だけ既存の頂点を動かし、分割数・材質・毎コマの処理は増やさない。
    for (const mountain of W.mountains.children) {
      const geometry = mountain.geometry, positions = geometry.attributes.position;
      const base = W.def.mountainBase ?? -12;
      const distant = mountain.userData.rad >= 440;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), z = positions.getZ(i), r = Math.hypot(x, z);
        const southwest = aneSmooth(((-x + z) / (r * Math.SQRT2) - 0.45) / 0.4);
        const scale = 1 - southwest * (distant ? 0.82 : 1);
        positions.setY(i, base + (positions.getY(i) - base) * scale);
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    }
    // 姉川の峰の霞を、同じ方向に見える空の色へつなぐ。
    // 空と霧の値を共有するので、朝から昼へ移っても白い山の板が残らない。
    for (const mat of W.mountMats) {
      // 峰は既存の順で奥から重ねる。透ける裾は奥行きを塞がず、
      // 交差する層を三角形に切り抜かない。地面・兵との奥行き判定は残す。
      // 山を囲む輪の内側だけを描き、折り返した面を二重に重ねない。
      mat.transparent = true; mat.depthTest = true; mat.depthWrite = false;
      mat.side = THREE.BackSide;
      // 空と同じ先描きでも、裾の透けは奥の峰へ重ねる。
      // 裾を不透明な空色で塗ると、奥の山を三角形に切り抜いてしまう。
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
      mat.blendEquation = THREE.AddEquation;
      mat.uniforms.aneSkyTop = W.skyMat.uniforms.top;
      mat.uniforms.aneSkyBottom = W.skyMat.uniforms.bottom;
      mat.fragmentShader = 'uniform vec3 aneSkyTop, aneSkyBottom;\n' + mat.fragmentShader.replace(
        'hc = mix(hazeCol, hc, smoothstep(-8.0, 45.0 + layer * 15.0, vP.y));',
        `vec3 aneView = normalize(vW - cameraPosition);
         float aneHgt = clamp(aneView.y * 1.5 + 0.04, 0.0, 1.0);
         vec3 aneSky = mix(aneSkyBottom, aneSkyTop, pow(aneHgt, 0.8));
         hc = mix(hazeCol, aneSky, smoothstep(0.0, 0.18, aneView.y));`)
        // 遠山が灰の平らな影に見えた（10/29 点付け）。霞の上限を層ごとに下げ、杉と雑木の樹冠の細かい斑と
        // 沢筋の暗い溝を山肌に残す。形と頂点・描く回数は変えない。
        .replace('vec3 mountain = mix(c, hc, hz);',
          `float aneCan = n(q * vec2(0.07, 0.12)) * 0.55 + n(q * vec2(0.22, 0.35)) * 0.45;
           float aneGully = smoothstep(0.62, 0.9, n(vec2(q.x * 0.05 + q.y * 0.01, q.y * 0.004)));
           c *= mix(0.45, 1.5, aneCan) * (1.0 - aneGully * 0.45 * vCrest);
           c = mix(c, c * vec3(1.08, 1.0, 0.86), smoothstep(0.55, 0.8, patchy) * 0.5);
           c *= 2.4;
           hz = clamp(min(hz, 0.26 + layer * 0.14) + aneGully * 0.1 - aneCan * 0.08, 0.0, 0.97);
           vec3 mountain = mix(c, hc, hz);`)
        // 完全に透ける裾は奥行きにも書かず、奥の山や木を切り抜かない。
        .replace('gl_FragColor = vec4(mountain, edge);',
          'if (edge < 0.01) discard;\n gl_FragColor = vec4(mountain, edge);');
      mat.needsUpdate = true;
    }
    // 足元について来る草にも川原の色を掛ける。遠い草だけの色指定では近景が白く残る。
    if (W.nearGrass) {
      W.nearGrass.material.color.setHex(W.def.tuftTint);
      W.nearGrass.material.envMapIntensity = 0.3;
    }
    // 川原と本陣前の裸地は、舗装のような土塊の縁を持たない土にする。
    // 姉川の地面の参照だけ替え、共通の絵と材質は書き換えない。
    W.groundU.tDirt.value = dirtTex(true);
    anegawaRiver(rt);
    anegawaNotices(rt);
    // 部位による最大一・四倍が後から掛かっても、一発は最大体力の三分の一まで。
    const takeBullet = rt.player.takeBullet.bind(rt.player);
    rt.player.takeBullet = (amount, src) => Math.min(takeBullet(amount, src), rt.player.u.maxHp / (3 * 1.4));
    // 狙い始めから発射までの二秒半に、射手の向きと短い声を一度知らせる。
    rt.army.hooks.onGunAtPlayer = (e) => {
      if (rt.over || F.ending) return;
      const u = rt.player.u;
      rt.aimedT = Math.max(rt.aimedT || 0, 2.5);
      rt.hud.damageFrom(Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z) - rt.player.yaw);
      if ((F.gunAimWarnAt ?? -99) + 8 > rt.t) return;
      F.gunAimWarnAt = rt.t;
    };
    // 後から来る控えと組の兵にも同じ近景の装備を着せる。作る時だけ、形と材質は共用。
    const addUnit = rt.army.addUnit.bind(rt.army);
    rt.army.addUnit = (g, o) => {
      if (g.team === 0 && !o.name && ['ashigaru', 'bow', 'gun'].includes(o.type)) {
        o = { armor: 0x38404a, lace: 0x827252, cloth: 0x424958, skin: 0xc2a080,
          doStyle: 'sugake', sode: true, hat: 'jingasa', hatColor: 0x38362e, dirt: 0.35,
          real: 0, ...o };
      }
      return addUnit(g, o);
    };
    // 信長公記巻三は渡河・押し合い・追撃を記す。磯野の突破、段の並び、個別の横槍と別手の進路は遊びの補い。
    F.hist = { river: 'HIST_A', honjinOda: 'HIST_A', honjinAsai: 'HIST_A', mitamura: 'HIST_B', isoAttack: 'GAME_C', tokugawaFlank: 'GAME_C', inabaFlank: 'GAME_C', quietFlank: 'GAME_C', gravel: 'GAME_C', linkedFronts: 'GAME_C' };
    F.hist.forwardPost = 'GAME_C'; F.hist.shoreReserves = 'GAME_C';
    F.step = 0; F.breach = 0; F.holdAt = { ...(rt.G.lord ? MORI : POST) };
    F.pushAt = { x: POST.x, z: POST.z }; F.withdrawAt = { x: POST.x, z: POST.z + 45 };
    F.coverAllies = [];
    F.waves = [null, null, null, null]; // 寄せる四隊の入れ物は毎コマ作り直さない。
    const windup = rt.army.hooks.onWindup;
    rt.army.hooks.onWindup = (e, target) => {
      if (windup) windup(e, target);
      if (target !== rt.player.u || e.team === target.team || !e.atk || e.atk.ranged || e.atk.bow) return;
      // 指で構えを押し、後ろへ歩く間。既存の構えの姿勢と音を長く残す。
      const extra = Math.max(0, (target.hp < target.maxHp * 0.4 ? 1.8 : 0.9) - e.atk.dur);
      e.atk.t += extra; e.atk.dur += extra;
      pressureWarning(rt, e.mounted ? '馬上の敵が来るぞ！　味方の槍へ退け' :
        '打ち込んで来るぞ！　穂先を向けて退け', 30);
    };
    // 持ち場の脇に残された空馬一頭は遊びの補完。両軍の騎馬や武将は動かさない。
    F.hist.looseHorse = 'GAME_C';
    const h = buildHorse();
    h.position.set(MORI.x - 9, W.heightAt(MORI.x - 9, MORI.z + 5), MORI.z + 5);
    h.rotation.y = Math.PI;
    rt.scene.add(h);
    const horses = rt.army.looseHorses || (rt.army.looseHorses = []);
    horses.push({ h, heading: Math.PI, spd: 0, t: 0, calm: true,
      from: { team: 0, house: '織田', name: '', speed: 1, hp: 200, maxHp: 200 } });
    // 全軍の数や敵の傷は、持ち場の足軽には分からない。
    // ---- 味方：織田の段。前に坂井政尚の一段、その後ろに森可成の備（自分の持ち場） ----
    F.sakai = allyGroup(rt, { faction: 'oda', name: '坂井政尚の段', anchor: { x: 30 / 5, z: 160 / 5 }, facing: Math.PI, width: 14, aggro: 7, morale: 70, dmgMult: 1, fleeDir: { x: 0.1, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '坂井政尚', invuln: true, hat: 'kabuto_m', haori: 0x3a3a44 } }, { type: 'ashigaru', n: 8 }, { type: 'gun', n: 3 }]);
    const mori = allyGroup(rt, { faction: 'oda', name: '森可成の備', anchor: { ...MORI }, facing: Math.PI, width: 16, aggro: 7, noRout: false, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '森可成', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x2e2e38 } }, { type: 'ashigaru', n: 13 }]);
    F.mori = mori; F.moriU = mori.units[0]; F.mori0 = mori.count;
    // 森の本隊の位置は保ち、川前の一手で自分のそばにも槍と弓を並べる。
    F.vanguard = allyGroup(rt, { faction: 'oda', name: '森の川前の先手', anchor: { ...POST },
      facing: Math.PI, width: 15, spacing: 1.2, aggro: 12, morale: 85, formation: 'yari', order: 'hold' },
      [{ type: 'ashigaru', n: 10 }, { type: 'bow', n: 4 }]);
    mori.defMult = 1; mori.dmgMult = 1;
    // 段は縦に重ねる：坂井 → 池田 → 柴田 → 森（磯野が一段ずつ破って来る）
    F.ikeda = allyGroup(rt, { faction: 'oda', name: '池田恒興の段', anchor: { x: 10 / 5, z: 260 / 5 }, facing: Math.PI, width: 12, aggro: 7, morale: 80, formation: 'yari', order: 'hold', fleeDir: { x: -0.3, z: 1 } },
      [{ type: 'samurai', n: 1, o: { name: '池田恒興', invuln: true, hat: 'kabuto_m', haori: 0x4a2a22 } }, { type: 'ashigaru', n: 9 }]);
    F.ikeda.defMult = 1; F.ikeda.dmgMult = 1;
    // 木下藤吉郎は横山城の押さえに回っている（城下の話と同じ）。森の備の後ろは佐久間信盛の段
    F.kino = allyGroup(rt, { faction: 'oda', name: '佐久間信盛の段', anchor: { x: -80 / 5, z: 680 / 5 }, facing: Math.PI, width: 12, aggro: 7, noRout: false, formation: 'yari', order: 'hold' },
      [{ type: 'samurai', n: 1, o: { name: '佐久間信盛', invuln: true, hat: 'kabuto_m', haori: 0x4a3a2a } }, { type: 'ashigaru', n: 7 }, { type: 'bow', n: 2 }]);
    F.kino.defMult = 1; F.kino.dmgMult = 1;
    F.holdRow = F.vanguard; F.holdRows = [F.sakai, F.ikeda, F.mori, F.kino];
    F.hqDefensePos = { x: HQ.x, z: HQ.z - 8 };
    F.hqGuardPos = { x: HQ.x, z: HQ.z - 16 };
    // 森の備の鉄砲（元亀のころは数が少ない）：磯野が川の中ほどまで来たら一斉に放つ（kaito 0929）
    F.guns = [allyGroup(rt, { faction: 'oda', name: '森の備の鉄砲', anchor: { x: MORI.x + 16, z: MORI.z + 4 }, facing: Math.PI, width: 10, spacing: 1.6, aggro: 30, noRout: false, holdFire: true, dmgMult: 1 },
      [{ type: 'gun', n: 6 }])];
    const n = RANKS[rt.G.rank].squad;
    if (n) rt.makeSquad({ x: POST.x + 3, z: POST.z + 5 }, Math.PI, [{ kind: 'spear', n }]);

    // ---- 陣と旗 ----
    // 信長の本陣（陣杭の柳）：陣幕の内に床几の大将と諸将、後ろに馬印と旗本
    F.hqCamp = camp(rt, { x: HQ.x, z: HQ.z, facing: Math.PI, team: 0, faction: 'oda', mon: 'oda', general: { name: '織田信長' }, guard: 15, reserve: 220, runTo: { x: MORI.x, z: MORI.z + 20 } });
    F.hqCurtainTop = Math.max(...[[-8, -6], [0, -6], [8, -6], [-8, 0], [8, 0], [-8, 6], [8, 6]]
      .map(([x, z]) => W.heightAt(HQ.x + x, HQ.z + z))) + 2.3;
    // この本陣の布・柱・吊り縄だけ滑らかに透かす。共通の木材の材質は替えない。
    let poleMat = null;
    for (const root of rt.scene.children) if (root.userData.commandPost?.x === HQ.x && root.userData.commandPost.z === HQ.z) {
      root.traverse((m) => {
        if (!m.isMesh || !m.geometry.attributes.jpin) return;
        m.material.userData.camNearSmooth = true;
        m.material.transparent = true; m.material.depthWrite = false; m.material.needsUpdate = true;
        for (const pole of m.parent.children) {
          if (!pole.isMesh || pole === m) continue;
          if (!poleMat) {
            const source = pole.material;
            poleMat = source.clone();
            // 前の戦で共通材質へ付いた点描処理は引き継がず、木材の照り返しだけ保つ。
            poleMat.onBeforeCompile = (sh) => {
              if (poleMat.isMeshLambertMaterial) sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>',
                '#include <lights_fragment_end>\n reflectedLight.indirectDiffuse *= 4.0;');
            };
            poleMat.customProgramCacheKey = () => 'aneCampPole';
            poleMat.userData.camNearSmooth = true;
            poleMat.transparent = true; poleMat.depthWrite = false;
          }
          pole.material = poleMat;
        }
      });
    }
    rt.marker('campExit', rt.G.lord ? { x: HQ.x, z: HQ.z + 10 } : { x: POST.x + 16, z: POST.z + 5 }, rt.G.lord ? '本陣の幕の口・ここから回って北へ' : '備えの右の脇・ここから川へ', { h: 2 });
    F.hqCamp.guard.anchor.z = HQ.z - 14;
    for (const u of F.hqCamp.guard.units) { u.pos.z -= 25; u.pos.y = W.heightAt(u.pos.x, u.pos.z); }
    F.holdRows.push(F.hqCamp.guard);
    rt.scene.add(nobori(W, HQ.x - 12, HQ.z + 4, 'eiraku', 7));
    F.hqGuideFlag = nobori(W, HQ.x, HQ.z - 14, 'eiraku', 6);
    rt.scene.add(F.hqGuideFlag);
    // 出発点の背後の旗は西の端へ寄せ、足元の操作案内と川岸への見通しを空ける。
    for (const [x, z] of [[8, 38], [34, 38], [-32, 36], [56, 36], [16, 18], [28, 18]]) rt.scene.add(nobori(W, x, z, z < 25 ? 'oda' : (x > 40 ? 'eiraku' : 'oda'), z < 25 ? 3.2 : 5));
    rt.scene.add(tawara(W, 30, 60, 0.3, 5), hut(W, 60, 96, 7, 5, 0.2, { wall: 0xa58d6e, minka: false, groundedHome: true,
      interior: { name: '南の小屋', kind: 'nagaya', profile: 'anegawa', team: 0 } }));
    // 向こう岸の浅井の旗
    for (const [x, z] of [[4, -30], [26, -34], [44, -28], [60, -40]]) rt.scene.add(nobori(W, x, z, 'azai', 5.5));
    // 三田村口の朝倉の陣旗は、北岸で徳川を迎える先手と同じ場所へ揃える。
    // 館の南に旧配置の旗だけを残すと、西へ寄せた兵列と別の前線に見えてしまう。
    // 北岸の交戦という太田浩司の推定を採る。旗の細かな位置は復元。
    // https://cocoshiga.jp/official/topic/ieyasu01/
    // 三本の形・材質・高さを保ち、開戦時に置く座標だけを変える。
    for (const dx of [-12, 0, 12]) rt.scene.add(nobori(W, ASAKURA_FRONT.x + dx, ASAKURA_FRONT.z - 6, 'asakura', 5.5));
    mitamuraYakata(rt);
    for (const [x, z] of [[MITAMURA.x - 18, MITAMURA.z - 8], [MITAMURA.x + 20, MITAMURA.z + 10]]) rt.scene.add(nobori(W, x, z, 'asakura', 5));
    // 遠景の村（川の南の田の中）
    KIT.farVillage(rt, -80, 112, { rot: Math.PI, n: 6, fields: 10, seed: 41, groundedHomes: true, riceClumps: true,
      interior: { name: '南の村の民家', kind: 'minka', profile: 'anegawa', team: 0 } });
    // 北岸の二つの郷の外れ。民は家の前から遠巻きに見て、同じ岸の細道へ逃げる。
    // 堂は南の村の小堂として補い、史料にない寺名や城下の町並みは付けない。
    rt.scene.add(hut(W, 164, -64, 7, 5, 0, { groundedHome: true, minka: false,
        interior: { name: '野村の民家', kind: 'minka', profile: 'anegawa', team: 1 } }),
      hut(W, -236, -58, 7, 5, 0, { groundedHome: true, minka: false,
        interior: { name: '三田村の民家', kind: 'minka', profile: 'anegawa', team: 1 } }),
      dou(W, -112, 150, 6, 4, Math.PI, { h: 2.6,
        interior: { name: '南の村の小堂', kind: 'hondo', profile: 'anegawa', team: 0 } }));

    // ---- 大軍（軽い作り）：織田の縦備え、徳川は西の瀬、北に浅井と朝倉 ----
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind, generals = {}) => {
      // 縦の備えはすでに並べてある。自動の後詰めを足すと次の段の実兵に重なる。
      const m = W.addDistantArmy({ x, z, w, d, count, facing, armor, flagTex: flagTexture(flag), mon: flag,
        flagRate: true || flag === 'azai' || flag === 'asakura' ? 1 : .85,
        spearScale: kind === 'spear' ? 1.1 : 1,
        seed, kind, host: false, ...generals });
      // 軽い騎馬も実兵と同じ距離で怖がる。民の探索用の印だけを足す。
      m.army.civilianCavalry = kind === 'cavalry';
      return { m, x0: x, z0: z, x, z, d };
    };
    const OD = 0x2a2622, TK = 0x24221f;
    // 柴田の段を池田と森の間へ置く。匿名の七列を足さず、縦の備えの間を空ける。
    F.jinShiba = DA(-30 / 5, 480 / 5, 20, 14, 75, Math.PI, OD, 'oda', 11, 'spear');
    F.jinShiba.m.army.noWake = true;
    F.odaLayers = [F.jinShiba];
    // 後方の軽い控え六十人を、川前の弓列と馬の控えへ分ける。描く人数は増やさない。
    F.postBows = DA(POST.x - 25, POST.z + 12, 26, 5, 48, Math.PI, OD, 'oda', 19, 'bow');
    F.postHorses = DA(POST.x - 48, POST.z + 32, 16, 8, 12, Math.PI, OD, 'oda', 20, 'cavalry');
    for (const q of [F.postBows, F.postHorses]) { q.m.army.team = 0; q.m.army.noWake = true; }
    // 控えの端だけに低い柵を置く。川へ出る道と備えの脇は空ける。
    if (false) for (const seg of [[-52, 34, -52, 44], [-52, 44, -40, 44], [52, 26, 66, 26]]) {
      rt.scene.add(koshisaku(W, seg, { h: 1.1 }));
      solidSeg(...seg, 0.15).yTop = W.heightAt(seg[0], seg[1]) + 1.1;
    }
    anegawaFieldWorks(rt);
    anegawaCampLife(rt);
    for (const [x, z] of [[POST.x - 17, POST.z + 2], [POST.x + 10, POST.z + 5], [-38, 39]])
      rt.scene.add(nobori(W, x, z, 'oda', 5));
    // 川原の石：川の両岸に丸い石が出ている
    { const kw = kawara(W); rt.scene.add(kw); if (W.viewCull) W.viewCull([kw], 6); }   // 画面に入る川原の石だけ描く
    anegawaPaddy(rt);
    anegawaGround(rt);
    // 地名の目印：野村（織田と浅井が当たる東の岸）・三田村（朝倉の本陣の館）
    rt.marker('nomura', NOMURA_HQ, '野村・浅井本陣（位置は推定）', { h: 3 });
    rt.marker('mitamura', { x: MITAMURA.x, z: MITAMURA.z - 14 }, '三田村氏館・朝倉本陣（推定）', { h: 5 });
    rt.marker('mitamuraNorth', { x: MITAMURA.x, z: MITAMURA.z - 38 }, '三田村氏館の北郭（土塁・水路は推定）', { h: 3 });
    rt.marker('kusano', { x: -260, z: -250 }, '草野川（川筋は復元）', { h: 3 });
    rt.marker('oyori', OYORI_EXIT, '北・大依山方面（会戦前の陣・場外）', { h: 3 });
    const odaniExit = ODANI_PATH[ODANI_PATH.length - 1];
    rt.marker('odani', { x: odaniExit[0], z: odaniExit[1] }, '北西・小谷方面（道は復元・城は場外）', { h: 3 });
    rt.marker('tatsugahana', TATSUGAHANA, '龍ヶ鼻・会戦前の陣跡（位置は推定）', { h: 3 });
    // 横山城と、それを囲む織田の兵
    yokoyamaCastle(rt);
    F.yokoyamaGuards = [];
    for (let i = 0; i < YOKOYAMA_SIEGE.length; i++) {
      const p = YOKOYAMA_SIEGE[i], castle = YOKOYAMA[i];
      F[i === 0 ? 'jinYokoyama' : 'jinYokoyamaSouth'] = DA(p.x, p.z, 18, 8, 50, p.facing, OD, 'oda', 21 + i, 'spear');
      // 長浜市浅井歴史民俗資料館：三田村氏は姉川合戦に際して横山城を守備。
      // https://www.city.nagahama.lg.jp/section/azairekimin/azai_news/007/index-s.html
      // 無人の城を囲む姿にしない。人数・曲輪ごとの持ち場は復元で、野戦の一万三千には加算しない。
      // 虎口・井楼・小屋を避け、曲輪の内側から各包囲兵へ向く。形・材質は既存の軽い兵を共用。
      const x = castle.x - 3, z = castle.z - 3;
      const guard = DA(x, z, 5, 3, 18, Math.atan2(p.x - x, p.z - z), AZAI.armor, 'azai', 81 + i, 'spear');
      guard.m.army.team = 1;
      guard.m.army.noWake = true; // 城の守りを川原へ出す実兵に替えず、乱戦の人数・密度を保つ。
      guard.m.army.commanderName = '横山城の守兵（配置は復元）';
      F.yokoyamaGuards.push(guard);
    }
    // 徳川：西の瀬で朝倉と向き合う。奥に家康の本陣
    // 桑名市の忠勝年表に姉川参戦。先手内の位置は復元で、既存の騎馬枠を使う。
    // https://www.city.kuwana.lg.jp/documents/1504/2017-4.pdf
    F.tk = [DA(-960 / 5, 360 / 5, 40, 16, 160, Math.PI, TK, 'tokugawa', 31, 'mixed', { general: '酒井忠次', secondGeneral: '本多忠勝' }), camp(rt, { x: -1030 / 5, z: 700 / 5, facing: Math.PI, team: 0, faction: 'tokugawa', mon: 'tokugawa', general: { name: '徳川家康' }, guard: 15, reserve: 200, runTo: { x: -960 / 5, z: 360 / 5 } })];
    rt.marker('okayama', OKAYAMA, '岡山・徳川本陣', { h: 3 });
    F.tk[1].guard.anchor.z = 700 / 5 - 14;
    for (const u of F.tk[1].guard.units) { u.pos.z -= 25; u.pos.y = W.heightAt(u.pos.x, u.pos.z); }
    // 当日付信長書状では丹羽長秀が徳川勢に加わり、朝倉勢に当たる。位置は復元。
    // https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
    // 西の既存の控え六十人を織田の加勢へ替え、乱戦の兵と描画枠は保つ。
    F.jinNiwa = DA(-970 / 5, 460 / 5, 18, 6, 60, Math.PI, OD, 'oda', 34, 'spear');
    F.jinNiwa.m.army.team = 0;
    F.jinIshikawa = DA(-1000 / 5, 560 / 5, 18, 6, 60, Math.PI, TK, 'tokugawa', 35, 'spear');
    for (const q of [F.jinNiwa, F.jinIshikawa]) q.m.army.noWake = true;
    // 榊原康政の別手（のちに朝倉の横を突く）：家康の西南から北の瀬へ向いて控える
    // 横槍は後世の伝承を交えた復元。公記は騎馬だけの別手とは記さない。
    // 兵種の内訳は確定せず、既存の混成の備えで徒歩と馬上の武者を示す。五十人と進路は保つ。
    // 史料の検討：https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
    F.sakaki = DA(-1220 / 5, 790 / 5, 18, 16, 50, Math.PI, TK, 'sakakibara', 33, 'mixed');
    F.sakaki.m.army.team = 0;
    // 朝倉は西の三田村、浅井は東の野村。大依山は会戦前の陣で、当日の本陣にしない。
    F.akDA = [DA(ASAKURA_SECOND.x, ASAKURA_SECOND.z, 36, 14, 125, 0, ASAKURA.armor, 'asakura', 41, 'mixed'), DA(MITAMURA.x, MITAMURA.z, 30, 20, 110, 0, ASAKURA.armor, 'asakura', 42, 'honjin', { people: mitamuraHonjinPeople() })];
    // 庭の指定配置だけを使う。主屋に野陣の陣幕を重ねず、接近時は従来どおり軍勢として替える。
    F.akDA[1].m.army.people = false;
    F.akDA[1].m.army.lord = '朝倉景健';   // 本陣へ寄れば旗本が迎え撃つ（b_nagashinojo.js の wake）
    F.azDA = [DA(120 / 5, -340 / 5, 50, 16, 160, 0, AZAI.armor, 'azai', 51, 'spear'), DA(NOMURA_HQ.x, NOMURA_HQ.z, 30, 24, 125, 0, AZAI.armor, 'azai', 52, 'honjin'), DA(140 / 5, -560 / 5, 30, 14, 100, 0, AZAI.armor, 'azai', 53, 'spear')]
    F.azDA[1].m.army.lord = '浅井長政';
    // 対岸の旗の間を軽い兵で埋める。実兵や援軍の判定には加えない。
    F.bankArmy = [DA(-43, -23, 46, 6, 96, 0, AZAI.armor, 'azai', 71, 'spear'),
      DA(62, -24, 46, 6, 96, 0, AZAI.armor, 'azai', 72, 'spear')];
    for (const q of F.bankArmy) { q.m.army.team = 1; q.m.army.noWake = true; }
    // 前の各備が本陣を守る。重複する九百人の固定層は置かない。
    // 浅井の縦列は、川に近い磯野から長政へ。朝倉の先手は西の瀬に分ける。
    F.jinIso = DA(80 / 5, -125 / 5, 16, 10, 40, 0, AZAI.armor, 'azai', 54, 'spear');
    F.jinMasazumi = DA(90 / 5, -230 / 5, 16, 10, 40, 0, AZAI.armor, 'azai', 55, 'spear');
    F.jinShinjo = DA(120 / 5, -450 / 5, 16, 10, 40, 0, AZAI.armor, 'azai', 56, 'spear');
    F.jinKagenori = DA(ASAKURA_FRONT.x, ASAKURA_FRONT.z, 20, 8, 50, 0, ASAKURA.armor, 'asakura', 43, 'spear');
    F.jinFlank = DA(108, -24, 12, 10, 24, 0, AZAI.armor, 'azai', 57, 'spear');
    F.jinInaba = DA(MINO.x, MINO.z, 16, 12, 30, Math.PI, OD, 'inaba', 58, 'spear');
    F.jinFlank.m.army.team = 1; F.jinInaba.m.army.team = 0;
    F.jinFlank.m.army.noWake = true; F.jinInaba.m.army.noWake = true;
    F.azDA[0].m.army.noWake = true; F.jinShiba.m.army.team = 0;
    F.jinAzai = [F.jinIso, F.jinMasazumi, F.jinShinjo];
    for (const q of [...F.jinAzai, F.jinKagenori]) q.m.army.noWake = true;
    // ---- 大軍どうしの合戦（軽い作り・world.addClash）：西は渡河後の北岸、森の備の左右は川で組み合う ----
    // 織田と浅井の前線の、森の備に近い端は、本物の兵の押し引きにつながる（link）
    const side = (flag, armor, count, team, faction, x = {}) => ({ flag, armor, count, team, faction, flagRate: 0.6, bannerStride: 6, ...x });
    const front = { x: 0, z: 0 };
    let frontT = -1, frontValid = false;
    const realFront = () => {
      // 左右の前線から同じコマに呼ばれるので、隊の中心は一度だけ拾う。
      if (frontT === rt.world.time) return frontValid ? front : null;
      frontT = rt.world.time; frontValid = false;
      if (F.step !== 1) return null;
      const a = !gone(F.vanguard) ? F.vanguard : !gone(F.sakai) ? F.sakai : F.mori;
      if (gone(a)) return null;
      const e = F.iso && !F.iso.anePending && !gone(F.iso) ? F.iso :
        F.third && !F.third.anePending && !gone(F.third) ? F.third :
        F.second && !F.second.anePending && !gone(F.second) ? F.second : null;
      if (!e) return null;
      const c = e.center(); front.x = c.x; front.z = (c.z + a.center().z) / 2;
      frontValid = true;
      return front;
    };
    // 両軍とも同じ割合で近くの兵を本物へ替える。
    // 実兵への置換率は保ち、軽い前線だけを二十八歩から見せて空白を継ぐ。
    // 近い前線には共通の距離別の形を使い、後詰めの粗い人影は近づけない。
    const WK = { allyWake: 1, foeWake: 1, realNear: 28 };
    F.clash = [
      // 西は北岸の三田村口。館の堀を避けて渡河後の徳川と朝倉を向かい合わせる。
      // 北岸での交戦は太田浩司の推定による。細かな位置は遊び用の復元。
      // https://cocoshiga.jp/official/topic/ieyasu01/
      // 東は中央の実兵の両脇へ寄せ、左右の兵数・隊列幅・斬り合いの密度を保つ。
      clash(rt, { x: WEST_FRONT_X, z: WEST_FRONT_Z, facing: Math.PI, w: 76, gap0: 30, seed: 181, noRout: false, ...WK, A: side('tokugawa', TK, 240, 0, 'tokugawa', { guns: true }), B: side('asakura', ASAKURA.armor, 250, 1, 'asakura', { bows: true }) }),
      clash(rt, { x: -28, z: 3, facing: Math.PI, w: 64, gap0: 16, seed: 182, noRout: false, ...WK, A: side('oda', OD, 160, 0, 'oda'), B: side('azai', AZAI.armor, 100, 1, 'azai'), link: realFront }),
      clash(rt, { x: 56, z: 3, facing: Math.PI, w: 60, gap0: 16, seed: 183, noRout: false, ...WK, A: side('oda', OD, 180, 0, 'oda', { guns: true }), B: side('azai', AZAI.armor, 100, 1, 'azai'), link: realFront }),

    ];

    // 川の左右から軽い兵を振り分け、本陣前の突破にも向かい合う押し合いを残す。
    // 実兵の襲来まで描かず、勝敗や本陣の任務には加えない。
    F.hqClash = clash(rt, { x: HQ.x + 18, z: HQ.z - 25, facing: Math.PI,
      w: 24, gap0: 12, seed: 184, host: false, noWake: true, corpses: 48,
      A: side('oda', OD, 72, 0, 'oda'), B: side('azai', AZAI.armor, 72, 1, 'azai') });
    F.hqClash.mesh.visible = false;
    const hqTick = F.hqClash.tick;
    F.hqClash.tick = (dt, focus) => { if (F.hqClash.mesh.visible) hqTick(dt, focus); };

    buildBattleJin(rt);
    rt.world.setTime('day');
    // 朝の地面側からの光を補い、馬と具足の陰にも色を残す。
    const clock = W.dayClock;
    if (clock) {
      clock.morning.hemiI = Math.max(clock.morning.hemiI, 1.9);
      clock.morning.hemiGround.setHex(0xa2987a);
      // 夏の晴れた昼前：青い空に薄い雲、強い日差し。灰の霞で空と遠山を平らに塗らない（手本。10/29）
      for (const L of [clock.morning, clock.noon]) {
        L.top.setHex(0x3d6eae); L.sky.setHex(0xa3bfd6); L.fog.setHex(0xa9bccb);
        L.sunI = Math.max(L.sunI, 2.45); L.cover = Math.min(L.cover, 0.18); L.cloud = Math.min(L.cloud, 0.35);
        L.mount = [0x1d3524, 0x2a4532, 0x435b63];   // 近い峰は濃い杉と雑木の緑、遠いほど青い
      }
      // 巳の刻の日は東南東の高い所にあり、浅井の寄せ（北東から）へ向くと兵も旗も逆光の黒い影になる。
      // 日の高さは時計のまま、向きだけ南寄りへ回し、川向こうの敵と味方の背を斜め前から照らす。
      // 空の日輪・影・光を同じ向きに揃える（入れ物は使い回し、毎コマ new しない）。
      if (!clock.anegawaTurned) {
        clock.anegawaTurned = true;
        const tick0 = clock.tick.bind(clock);
        clock.tick = (dt) => {
          tick0(dt);
          W.sunOffset.applyAxisAngle(SUN_UP, SUN_TURN);
          clock.look.sunDir.copy(W.sunOffset).normalize();
          W.skyMat.uniforms.sunDir.value.copy(clock.look.sunDir);
        };
      }
      clock.tick(0);
    }
    // 信長公記巻三の徳川の「一番合戦」を先に始め、浅井の突撃を開戦の合図にしない。
    // https://nagahama-rekihaku.jp/digital-museum/70
    // 先行する秒数は遊び用の復元。西も東も既存の兵数・幅・密度を保つ。
    F.clash[0].go();
    // 西の主戦場は北岸。徳川の本隊も既存の瀬を渡り、先手の後ろへ詰める。
    // 先手の乱戦は続けたまま、既存の百六十人を動かす。道筋・所要時間は復元。
    // 幅四十・奥行き十六の本隊を、中心だけでなく前後列まで岸へ収める。
    // 北岸の横移動でも蛇行を横切らないよう、隊幅を含む全区間の岸を一度だけ調べる。
    // https://cocoshiga.jp/official/topic/ieyasu01/
    // 北岸で交戦したという推定を採る地形上の補いで、当日の渡河路を確定しない。
    let tkFordSouth = -Infinity, tkFordNorth = Infinity;
    for (let x = -214; x <= -170; x += 1) tkFordSouth = Math.max(tkFordSouth, aneSouthBank(x) + 10);
    for (let x = WEST_FRONT_X - 22; x <= -170; x += 1) tkFordNorth = Math.min(tkFordNorth, aneNorthBank(x) - 10);
    F.tkFords = { south: tkFordSouth, north: tkFordNorth };
    F.tk[0].m.moveTo(-192, tkFordSouth, 22);
    // 朝倉の二の手は館の南西から回り、北岸の前線の後ろへ入る。
    // 館の南の堀と西の土橋を斜めに横切らず、南岸へ渡って徳川の背後には出さない。
    F.akDA[0].m.moveTo(ASAKURA_SECOND.x, ASAKURA_SECOND.z, 22);
    rt.after(22, () => {
      if (F.step > 1 || F.westBroken || F.ending || rt.over) return;
      // 南岸から前線へ斜めに渡らず、同じ瀬の北岸へ出てから川沿いに詰める。
      // 元の二十秒を二つに分け、前線への到着時刻と乱戦の兵数は保つ。
      F.tk[0].m.moveTo(-192, tkFordNorth, 10);
      F.akDA[0].m.moveTo(ASAKURA_SECOND.x, F.clash[0].z - 18, 38);
    });
    rt.after(32, () => {
      if (F.step > 1 || F.westBroken || F.ending || rt.over) return;
      F.tk[0].m.moveTo(WEST_FRONT_X, Math.min(F.clash[0].z + 8, tkFordNorth), 10);
    });
    // 当日付信長書状の丹羽の加勢を、南岸の待機だけで終わらせない。
    // 既存の六十人が徳川本隊に続き同じ瀬を渡る。兵数・乱戦の強さは変えない。
    // 時間差で渡河中の重なりを避け、北岸では幅四十の本隊の東脇へ並ぶ。
    // 道筋・先後・秒数は復元。館の西の堀より西で止め、建物へ入れない。
    // https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
    rt.after(14, () => {
      if (F.step > 1 || F.westBroken || F.ending || rt.over) return;
      F.niwaCrossing = true;
      F.jinNiwa.m.moveTo(-192, tkFordSouth, 22);
    });
    rt.after(36, () => {
      if (!F.niwaCrossing || F.ending || rt.over) return;
      // 朝倉が先に崩れても、出発した加勢は同じ瀬を渡り切る。
      // 当日書状にある徳川への加勢を示す復元。参加開始の条件と人数は保つ。
      F.jinNiwa.m.moveTo(-192, tkFordNorth, 10);
    });
    rt.after(46, () => {
      if (!F.niwaCrossing || F.ending || rt.over) return;
      F.jinNiwa.m.moveTo(WEST_FRONT_X + 32, tkFordNorth, 10);
    });
    // 徳川の三の手も南岸に置き去りにせず、本隊・丹羽の後から同じ瀬を渡る。
    // 公記の三田村口の戦いを参考にした補い。石川の持ち場・順序・道筋は確定しない。
    // https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
    // 既存の六十人・幅十八・奥行き六を保ち、本隊の西脇へ並べる。
    // 横移動の全幅で岸を調べ、館の堀・建物を横切らない。
    let ishikawaNorth = tkFordNorth;
    for (let x = WEST_FRONT_X - 43; x <= -181; x += 1)
      ishikawaNorth = Math.min(ishikawaNorth, aneNorthBank(x) - 5);
    rt.after(28, () => {
      if (F.step > 1 || F.westBroken || F.ending || rt.over) return;
      F.ishikawaCrossing = true;
      F.jinIshikawa.m.moveTo(-192, tkFordSouth, 22);
    });
    rt.after(50, () => {
      if (!F.ishikawaCrossing || F.ending || rt.over) return;
      // 開始後に朝倉が崩れても、渡河を途中で止めず北岸へ上げる。
      F.jinIshikawa.m.moveTo(-192, ishikawaNorth, 10);
    });
    rt.after(60, () => {
      if (!F.ishikawaCrossing || F.ending || rt.over) return;
      F.jinIshikawa.m.moveTo(WEST_FRONT_X - 32, ishikawaNorth, 10);
    });
    rt.setPhase('brief');
    F.openingWaitDuration = rt.G.lord ? 18 : 11;
    F.openingWaitUntil = rt.t + F.openingWaitDuration;
    anegawaObjective(rt, 'main', rt.G.lord ? '浅井の寄せを受け、押し返せ' : '川を渡らず、岸で浅井を待て');
    F.holdLabel = '森の先手・岸の槍列';
    // 守る範囲を残し、到着しても「待とう」の一文で下知を隠さない。
    // 持ち場の手前の川原に半ば埋まった玉石と根の草、陣の俵・材木、踏み跡の土（共通の stage_dress）。
    // 対岸（浅井の側）と川には置かない。小屋・塀・幟は既存の陣にあるので足さない。
    dressStage(rt, { huts: 0, fence: false, flag: false, yagura: false, clutter: 4, fire: false, rocks: 16,
      avoid: (x, z) => z < -8 });
    anegawaFrontRiver(rt);
    rt.marker('stop', F.holdAt, () => F.holdLabel, { guideArea: 'wait', guideRadius: 8, guideFlag: true, waitAction: true,
      waitUntil: () => F.step === 0 ? F.openingWaitUntil : null, waitDuration: F.openingWaitDuration });
    rt.marker('pushPost', () => F.pushGuiding ? F.pushAt : null, '押し返す味方の槍列', { hideNear: 8, hideOnArrival: true });
    rt.marker('river', { x: 10, z: 4 }, '姉川・浅い瀬');
    if (!rt.G.lord) rt.obj('stay', '下知があるまで姉川を渡るな', 'side', true);
    rt.obj('mori', '森の兵を半分より多く守れ', 'side');
    rt.banner('川向こうに浅井の旗', rt.G.lord ? '西は徳川。正面の浅井を受け止めよ' : '川を渡らず、こちら岸で受け止めよ');
    rt.after(1, () => {
      if (F.step !== 0 || F.ending || rt.over || rt.G.lord) return;
      // 槍列の脇から川面と対岸を一緒に見せる。動きを減らす設定は既存の道具で守る。
      rt.player.showShot({ x: POST.x - 14, z: POST.z }, { x: 16, z: -16 }, 2.4,
        { h: 2.2, lookH: 1.4, drift: 0.25, zoom: 1 });
    });
    // 信長で遊ぶ時：本陣の前で、家臣の言上を聞く
    if (rt.G.lord) {
      rt.say('森可成', '殿、野村口は浅井、三田村口は朝倉にござる', 4);
      rt.say('森可成', '西では徳川殿が朝倉と戦っておられまする。我らは浅井を受ける備えにござる', 4);
      rt.say('織田信長', '馬廻りは野村口じゃ。東の三人衆と槍を合わせ、浅井を押し崩せ', 4);
      F.farT = 0;
      rt.after(F.openingWaitDuration, () => this.charge(rt));
      return;
    }
    rt.say('組頭', '浅井の旗じゃ！　川を渡るな。岸で槍を揃えよ！', 4);
    rt.after(5, () => {
      if (F.step !== 0 || F.ending || rt.over) return;
      rt.say('森可成', '西では徳川殿が戦っておる。ここで浅井を止めるぞ！', 4);
    });
    F.farT = 0;
    // 磯野の渡河まで（出会うまでが長すぎるとの声で、少し早めた分、太鼓・喊声・遠くの合戦は濃く残す）
    rt.after(F.openingWaitDuration, () => this.charge(rt));
  },

  // ① 磯野員昌の突撃：川を渡り、坂井の段を破って森の備へ
  charge(rt) {
    const F = rt.flags;
    if (F.step >= 1 || rt.over || F.ending) return;
    F.step = 1; F.stepT = rt.t;
    // 浅井の渡河を補う軽い後続。固定の終点では、蛇行した川の中に後列が残る。
    // 既存の隊幅・奥行き全体が南岸へ上がる位置を、渡河開始時に一度だけ求める。
    // 渡河の細かな位置は復元。各九十六人・隊形・到着までの秒数と乱戦は保つ。
    for (let i = 0; i < F.bankArmy.length; i++) {
      const group = F.bankArmy[i].m, army = group.army, x = i === 0 ? -35 : 70;
      const halfWidth = Math.ceil(army.hw0 + 2);
      let south = -Infinity;
      for (let dx = -halfWidth; dx <= halfWidth; dx++) south = Math.max(south, aneSouthBank(x + dx));
      group.moveTo(x, south + army.hd0 + 2, i === 0 ? 26 : 30);
    }
    rt.unmark('campExit');
    rt.setPhase('charge');
    sfx('taiko', 1);
    rt.army.play('eshout', { x: 20, z: -20 }, 2);
    rt.banner('浅井勢、姉川を渡る', '磯野員昌の突撃');
    rt.say('足軽', '浅井が渡って来るがや！　磯野の旗だで！', 3);
    const g = enemyGroup(rt, { faction: 'azai', name: '磯野員昌の隊', anchor: { x: 80 / 5, z: -125 / 5 }, facing: 0, fleeDir: AZAI_FLEE, aggro: 12, width: 16, morale: 100, noRout: false, speed: 3.0, dmgMult: 1 },
      dress([{ type: 'busho', n: 1, o: { name: '磯野員昌', horse: true, hat: 'kabuto_r', haori: 0x4a3a22 } }, { type: 'cavalry', n: 2 }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 31 }], AZAI));
    F.iso = g; F.waves[0] = g; F.isoU = g.units[0];
    // 磯野の後ろに浅井の徒歩の兵が続き、対岸の先の備も川べりへ押し出す
    // 西の瀬でも、森の備の左右でも、大軍どうしが川へ入って組み合う
    // 西は既に交戦中。東の二正面は元の時機に動き出す。
    F.clash.slice(1).forEach((c, i) => rt.after((i + 1) * 4, () => c.go()));
    if (F.isoU) { F.isoU.invuln = true; F.isoU.announced = false; }   // 磯野はこの戦を生き延びて佐和山へ退いた
    // 川の中で止めず、川前の味方の脇から南岸へ上がって取り付く。
    g.order = 'move'; g.dest = { x: POST.x + 10, z: POST.z - 3 };
    g.onArrive = (gg) => {
      gg.order = 'attack'; gg.seekRange = 34; gg.aggro = 16;
      // 渡河した先手が、前の段へ取り付く。
      if (F.isoU?.alive && !F.isoU.announced) {
        F.isoU.announced = true; F.isoU.cheer = 1.5;
        rt.army.play('eshout', F.isoU.pos, 1.6);
        rt.banner('浅井の先手、岸へ上がる', '前の段が押されている');
        if (sightPoint(rt, F.isoU.pos) && rt.distTo(F.isoU.pos) < 45) rt.say('磯野員昌', '岸へ上がれ！　織田の槍を押し開け！', 3);
        rt.after(4, () => {
          if (F.step !== 1 || F.ending || rt.over || gone(g)) return;
          rt.say('森可成', F.sakai.routed || F.sakai.count < 6 ? '坂井殿が押された！　池田殿の後ろで槍を揃えよ！' : '抜けた敵はここで止めるぞ！　列を空けるな！', 3.5);
        });
      }
    };
    rt.marker('iso', centerOf(g), '磯野員昌の先手', { red: true, group: g });
    anegawaObjective(rt, 'main', rt.G.lord ? '磯野の寄せを受け、押し返せ' : '川を渡らず、岸で浅井を止めよ', true);
    // 二の手は対岸の控えから歩いて川へ来る。岸へ着いた兵だけを実兵へ替える。
    F.jinMasazumi.m.moveTo(18, -22, 14);
    // 遠い備えも旗の密な列のまま川へ進む。描く人数・本陣の位置は増やさない。
    F.azDA[2].m.moveTo(28, -58, 48);
    // 二の手：少し遅れて、東の瀬から（出会うまでが長すぎるとの声で、こちらも間合いを詰めた）
    rt.after(14, () => {
      if (F.step !== 1 || rt.over || F.ending) return;
      const g2 = enemyGroup(rt, { faction: 'azai', name: '浅井の二の手', anchor: { x: 90 / 5, z: -230 / 5 }, facing: 0, fleeDir: AZAI_FLEE, aggro: 10, width: 14, morale: 90, speed: 3.8 },
        dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 17 }, { type: 'gun', n: 5 }], AZAI));
      g2.dmgMult = 1;
      g2.order = 'path'; g2.path = [[10, -14], [10, 14], [MORI.x + 20, F.holdAt.z - 6]]; g2.pathIdx = 0;
      g2.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 30; };
      F.second = g2; F.waves[1] = g2;
      rt.say('足軽', '東の瀬からも来るがや！', 2.5);
    });
    // 大声を上げず、東の浅瀬から後ろへ回る別手。正面の突破と同時に進む。
    rt.after(28, () => this.flank(rt));
    // 森より川に近い柴田の段が、持ち場の前を支える
    rt.after(62, () => this.shibata(rt));
    // 徳川の横槍・稲葉の横槍
    rt.after(70, () => this.tokugawa(rt));
  },

  shibata(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.shibata || F.ending || rt.over) return;
    const g = allyGroup(rt, { faction: 'oda', name: '柴田勝家の段', anchor: { x: -30 / 5, z: 480 / 5 }, facing: Math.PI, width: 14, aggro: 9, noRout: false, speed: 2.8 },
      [{ type: 'samurai', n: 1, o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_b', haori: 0x3a2a1c } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }]);
    g.defMult = 1; g.dmgMult = 1;
    g.order = 'move'; g.dest = { x: MORI.x, z: F.holdAt.z - 12 };
    g.onArrive = (gg) => { gg.order = 'hold'; gg.anchor = { x: MORI.x, z: F.holdAt.z - 12 }; gg.aggro = 12; };
    F.shibata = g;
    F.holdRows.push(g);
    anegawaReport(rt, F.jinShiba, '柴田殿の備が前へ！　ここを支えよとの下知にござる！', 3.5);
  },

  // 正面の圧力が続く時だけ段が抜かれる。早く敵を減らせば、深く入られる前に止められる。
  breakthrough(rt) {
    const F = rt.flags, g = F.iso;
    if (gone(g) || g.count <= 8 || F.breach >= 3 || F.inaba) return;
    const c = g.center(), elapsed = rt.t - F.stepT;
    const z = F.breach === 0 ? 160 / 5 - 5 : F.breach === 1 ? 260 / 5 - 5 : MORI.z - 5;
    const wait = F.breach === 0 ? 22 : F.breach === 1 ? 38 : 56;
    if (c.z < z || elapsed < wait) return;
    const row = F.breach === 0 ? F.sakai : F.breach === 1 ? F.ikeda : (F.shibata || { count: 75, routed: false });
    if (row && !gone(row) && row.count > 3) return;
    F.breach++;
    if (F.breach < 3) {
      g.order = 'move'; g.dest = { x: MORI.x, z: F.breach === 1 ? 260 / 5 : MORI.z + 4 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 24; };
    } else {
      // 本物の兵を増やさず、後ろの軽い二段も押し下げて、深い入り込みを見せる。
      for (const q of F.odaLayers) q.m.retreat(34, 12);
      F.holdAt.z = MORI.z + 20;
      for (const q of [F.vanguard, F.mori, F.guns[0], F.shibata]) if (q && !gone(q)) {
        q.order = 'move'; q.dest = { x: q.anchor.x, z: q === F.guns[0] ? F.holdAt.z + 6 : F.holdAt.z };
        q.onArrive = (r) => { r.order = 'hold'; r.facing = Math.PI; r.aggro = 12; };
      }
      for (const q of [F.second, F.third]) if (q && !gone(q)) { q.order = 'attack'; q.seekRange = 75; }
      g.order = 'move'; g.dest = { x: MORI.x, z: F.holdAt.z - 13 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 30; };
      rt.banner('後ろの段まで押し込まれた', '本陣の手前で、槍の列を揃え直せ');
      anegawaObjective(rt, 'main', '印の槍列で槍を揃え直せ', true);
      F.holdLabel = '森の後ろの槍列';
      rt.marker('stop', F.holdAt, () => F.holdLabel, { guideArea: 'wait', guideRadius: 8, guideFlag: true, waitAction: true });
    }
  },

  flank(rt) {
    const F = rt.flags;
    if (F.step !== 1 || F.flankG || F.ending || rt.over) return;
    const g = enemyGroup(rt, { faction: 'azai', name: '東へ回る浅井の別手', anchor: { x: 108, z: -16 }, facing: 0, width: 8, aggro: 2, morale: 85, speed: 2.2, fleeDir: AZAI_FLEE },
      dress([{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 10 }], AZAI));
    F.flankG = g; F.waves[3] = g;
    g.order = 'path'; g.path = [[108, 16], [96, MORI.z - 1], [MORI.x + 36, MORI.z + 20]]; g.pathIdx = 0;
    g.onArrive = (q) => {
      q.order = 'attack'; q.seekRange = 32;
      if (!F.flankDone) {
        F.flankDone = true;
        rt.objFail('flank');
        rt.unmark('flank'); rt.unmark('eastPost');
        rt.obj('mori', '森の兵を半分より多く守れ', 'side');
        F.mori.morale = Math.max(25, F.mori.morale - 15);
        anegawaReport(rt, F.guns[0], '東の別手が背後へ回り申した！　鉄砲組を守られよ！');
      }
    };
    // 東の川前にいる織田の備えから届いて初めて、回り込みへの下知を選べる。
    anegawaReport(rt, { x: 90, z: 16 }, '東の浅瀬に浅井の旗！　横へ回る構えにござる', 3, () => this.flankChoice(rt));
  },
  flankChoice(rt) {
    const F = rt.flags, g = F.flankG;
    if (F.step !== 1 || F.flankDone || F.flankChoiceShown || !g || rt.over || F.ending) return;
    F.flankChoiceShown = true;
    rt.objRemove('mori');
    rt.obj('flank', '東を守る者は別手を止めよ', 'side');
    // 選びの札で乱戦を隠さず、東の持ち場へ向かう動きで下知を決める。
    F.flankPick = 1;
    F.taskAt = 0;
    if (rt.G.lord) anegawaObjective(rt, 'main', '正面を守れ。東を受ける者は東の印へ', true);
    else anegawaTask(rt);
    rt.say('組頭', '東を守る者は東の印へ！　正面に残ってもよい！', 3);
    rt.objProgress('flank', '東の印で別手を受けるか、正面を守れ');
    rt.marker('eastPost', { x: 92, z: MORI.z - 1 }, '東を守る者はここへ');
    rt.marker('flank', centerOf(g), '後ろへ回る浅井の別手', { red: true, group: g });
  },
  defendEast(rt) {
    const F = rt.flags;
    if (!F.flankChoiceShown || F.flankDone || F.flankPick === 0) return;
    const p = rt.player.u.pos;
    if (Math.hypot(p.x - 92, p.z - (MORI.z - 1)) > 25) return;
    F.flankPick = 0;
    F.taskAt = 0;
    anegawaObjective(rt, 'main', '東の瀬で別手を止めよ', true);
    const q = rt.G.lord ? F.kino : rt.squadGroups?.[0];
    if (q && !gone(q)) {
      q.order = 'move'; q.dest = { x: 92, z: MORI.z - 1 };
      q.onArrive = (r) => { returnLine(r); r.facing = Math.PI; r.aggro = 18; };
    }
    rt.obj('flank', '東の瀬で浅井の別手を止めよ', 'side');
    rt.objProgress('flank', '瀬の出口で槍を揃えよ。深みへ入るな');
    rt.say('組頭', rt.G.lord ? '佐久間殿、東の瀬を支えられよ！' : '東の瀬を守れ。正面は味方に任せよ！', 3);
  },

  // ② 西の瀬で徳川が朝倉を破り、稲葉一鉄が浅井の横腹を突く
  tokugawa(rt) {
    const F = rt.flags;
    if (F.tkDone || F.ending || rt.over) return;
    F.tkDone = true;
    sfx('horagai', 0.7);
    anegawaReport(rt, F.tk[1].general || F.tk[1].pos, '西の徳川勢より！　榊原殿の別手に、瀬を渡り朝倉の脇へ回れとの下知！', 4,
      () => rt.banner('西の別手が動く', '榊原康政の手が浅瀬へ'));
    F.sakakiGo = rt.t;
    // 最初からある別手が西南から北へ進み、浅瀬を渡って朝倉の西へ回る。横槍の騎馬を別に湧かせない。
    // 瀬の西寄りを渡り、館の堀でなく朝倉の前線の西脇へ回る。人数と到着の時機は保つ。
    // 幅十八の隊を瀬の浅い帯へ収める。中心だけを瀬の端へ置くと、西の列が深みに入る。
    // 奥行き十六の後列まで北岸へ上がってから横へ回す。川筋に沿う余白は一度だけ求める。
    // 北岸で戦うという推定に合わせた地形上の補いで、榊原の渡河地点を史実と確定しない。
    const fordX = -200;
    let fordSouth = -Infinity, fordNorth = Infinity;
    for (let x = fordX - 10; x <= fordX + 10; x += 2) {
      fordSouth = Math.max(fordSouth, aneSouthBank(x) + 10);
      fordNorth = Math.min(fordNorth, aneNorthBank(x) - 10);
    }
    F.sakaki.m.moveTo(fordX, fordSouth, 36);
    rt.after(36, () => { if (!rt.over) F.sakaki.m.moveTo(fordX, fordNorth, 14); });
    rt.after(50, () => { if (!rt.over) F.sakaki.m.moveTo(WEST_FRONT_X - 50, F.clash[0].z - 8, 12); });
    rt.after(62, () => {
      if (rt.over || F.ending) return;
      F.clash[0].shake('B', 20); F.clash[0].push('A', 0.25);
    });
    // 浅井は朝倉の崩れを見る前に、残る旗本を押し出す（三の手）
    rt.after(4, () => {
      if (F.step !== 1 || rt.over || F.ending) return;
      const g3 = enemyGroup(rt, { faction: 'azai', name: '浅井の三の手', anchor: { x: 120 / 5, z: -340 / 5 }, facing: 0, fleeDir: AZAI_FLEE, aggro: 12, width: 16, morale: 95, noRout: false, speed: 2.9 },
        dress([{ type: 'samurai', n: 5 }, { type: 'cavalry', n: 1 }, { type: 'ashigaru', n: 19 }, { type: 'gun', n: 4 }], AZAI));
      g3.dmgMult = 1;
      g3.order = 'path'; g3.path = [[10, -14], [10, 14], [MORI.x + 20, F.holdAt.z - 6]]; g3.pathIdx = 0;
      g3.onArrive = (gg) => { gg.order = 'attack'; gg.seekRange = 34; };
      F.third = g3; F.waves[2] = g3;
      sfx('taiko', 0.9);
      rt.say('足軽', '向こう岸に新手だがや！　まだ来るぞ！', 3);
      if (rt.G.lord) anegawaObjective(rt, 'main', '浅井の新手を受け止めよ');
      rt.marker('third', centerOf(g3), '浅井の新手', { red: true, group: g3 });
    });
    rt.after(24, () => { if (F.westBroken) this.inaba(rt); });
  },
  inaba(rt) {
    const F = rt.flags;
    if (F.inaba || F.step !== 1 || !F.westBroken || rt.over) return;
    const tg = [F.third, F.iso, F.second].find((e) => e && !e.anePending && !gone(e));
    const c = tg ? tg.center() : { x: 20, z: 20 };
    const g = allyGroup(rt, { faction: 'saito', name: '稲葉一鉄の隊', anchor: { x: MINO.x, z: MINO.z }, facing: -Math.PI / 2, width: 12, aggro: 10, noRout: false, speed: 3.2 },
      dress([{ type: 'samurai', n: 1, o: { name: '稲葉一鉄', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x3a3022 } },
        { type: 'samurai', n: 1, o: { name: '氏家卜全', invuln: true } },
        { type: 'samurai', n: 1, o: { name: '安藤守就', invuln: true } },
        { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }], INABA));
    // 開戦時から置いた東の備えから、今いる敵の横へ進む。
    g.order = 'path'; g.path = [[MINO.x, F.holdAt.z], [c.x + 10, c.z]]; g.pathIdx = 0;
    g.onArrive = (gg) => {
      gg.order = 'attack'; gg.seekRange = 50; F.inabaT = rt.t;
      // 正面の生きた備も押す。後ろの持ち場で待ったままにしない。
      for (const q of [F.vanguard, F.mori, F.shibata, F.ikeda, F.kino]) if (q && !gone(q)) {
        q.order = 'attack'; q.seekRange = 50; q.formation = 'yari';
      }
      F.taskAt = 0;
      if (rt.G.lord) anegawaObjective(rt, 'main', '横槍に合わせ、浅井を押せ', true);
      else anegawaTask(rt);
      const leader = gg.units.find((u) => u.name === '稲葉一鉄');
      rt.say(leader?.alive ? '稲葉一鉄' : '組頭', '陣太鼓の早打ちじゃ！　敵の横へ取り付いた。正面の者も押せ！', 3);
      for (const e of [F.iso, F.second, F.third]) if (e && !gone(e)) e.morale = Math.max(0, e.morale - 12);
      F.clash[2].push('A', 0.25);
      for (let i = 1; i < F.clash.length; i++) F.clash[i].shake('B', 15);
    };
    F.inaba = g;
    battleEvent(rt, EVENT_REINFORCEMENT, c, g, 0, true, '東の備えから美濃三人衆が向かう');
    sfx('taiko', 1);
    rt.banner('東から味方の旗', '稲葉の手が、浅井の横へ進む');
    rt.say('森可成', '東の稲葉殿が浅井の脇へ向かう。取り付くまで列を保て！', 3.5);
    // 横を突かれて浅井は揺らぐ（稲葉が取り付いたら崩れうる）
  },

  // ③ 浅井が崩れた：川を渡って追い落とす
  counter(rt) {
    const F = rt.flags;
    if (F.step >= 2 || rt.over || F.ending) return;
    // 崩れる直前の先手から八人だけをその場で本物に替える。退く先へ歩いて追いすがる小勢。
    // 自分から四十五メートル以内の兵が追う。二十五メートル以内へ入るまでの道を二十メートル以内に抑える。
    const p = rt.player.u.pos;
    const n = cappedList(rt, [{ type: 'ashigaru', n: 8 }])[0].n;
    const pts = [];
    for (let i = 1; i < F.clash.length && pts.length < n; i++) {
      pts.push(...F.clash[i].take('B', p.x, p.z, n - pts.length, 45));
    }
    if (pts.length) {
      const g = enemyGroup(rt, { faction: 'azai', name: '浅井の先手の残兵',
        anchor: { x: pts[0].x, z: pts[0].z }, facing: 0, fleeDir: AZAI_FLEE,
        noGuard: true, width: 6, aggro: 12, seekRange: 32, morale: 65, speed: 3.2 },
      dress(pts.map((at) => ({ type: 'ashigaru', n: 1, o: { x: at.x, z: at.z, heading: at.yaw } })), AZAI));
      g.order = 'move'; g.dest = { x: p.x, z: p.z };
      g.onArrive = (q) => { q.order = 'attack'; };
      F.counterChase = g;
    }
    F.step = 2; F.stepT = rt.t;
    rt.setPhase('counter');
    rt.unmark('iso'); rt.unmark('third'); rt.unmark('stop'); rt.unmark('eastPost'); rt.unmark('hqGuard');
    if (F.flankG && !F.flankDone) {
      F.flankDone = true; rt.objFail('flank'); rt.unmark('flank'); rt.unmark('eastPost');
      // 未撃退の別手は、追撃開始だけでは消さない。
    }
    // 追撃の下知へ替える時に、守備の札を片付ける。
    if (rt.G.lord) rt.objDone('main');
    // 正面と西の敵が崩れた時点で寄せを退けた。追撃の成否は別の手柄にする。
    rt.tracker.main = true;
    rt.award((t) => t.side.push('浅井の寄せを受け止めた'), '浅井の寄せを受け止めた');
    if (!F.mori.routed && F.mori.units.reduce((n, u) => n + (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget ? 1 : 0), 0) > F.mori0 / 2) { rt.objDone('mori'); rt.award((t) => t.side.push('森の備を保った'), '森の備を保った'); } else rt.objFail('mori');
    if (!F.crossed && !rt.G.lord) rt.objDone('stay');
    rt.objRemove('stay');
    // 追撃も昼前からの時計を続ける。段の切替を史実の終了時刻とは扱わない。
    rt.world.setTime('afternoon');
    rt.banner('浅井勢、崩れる', '姉川を渡り、追い落とせ');
    battleEvent(rt, EVENT_RETREAT, { x: 24, z: -36 }, F.iso, 1, true, '浅井が川向こうへ退き始めた');
    rt.say('森可成', '法螺貝と進み太鼓じゃ！　川を渡り、向こう岸のしんがりを崩せ！', 4.5);
    anegawaObjective(rt, 'pursue', '森の備と浅い瀬を渡り、しんがりを追え', true);
    rt.marker('ford', { x: 10, z: 4 }, '森の備が渡る浅い瀬');
    rt.marker('pursuitPost', { x: 24, z: -22 }, '向こう岸で槍を揃える');
    rt.unmark('river');
    F.fordMarked = true;
    rt.say('組頭', '徒歩の者、森殿の旗に続け！　抜け駆けはならぬぞ！', 3);
    for (const g of [F.vanguard, F.ikeda, F.kino, F.inaba, F.shibata]) if (g && g.count) { g.order = 'attack'; g.seekRange = 70; g.formation = 'yari'; }
    // 後ろの段からも川を渡れるよう、向こう岸へ移ってから追撃に替える。
    for (const g of [F.mori, F.kino, F.inaba, F.shibata]) if (g && !gone(g)) {
      const i = g === F.mori ? 0 : g === F.kino ? 1 : g === F.inaba ? 2 : 3;
      const c = g.center(), x = 4 + i * 4;
      g.order = 'path'; g.path = [[c.x, Math.max(22 + i * 12, c.z)], [x, 14 + i * 4], [x, -18], [24 + (i - 1) * 10, -36]];
      g.pathIdx = 0; g.formation = 'column'; g.colW = 2; g.speed = 2.2;
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 70; q.formation = 'yari'; };
    }
    const R = enemyGroup(rt, { faction: 'azai', name: '浅井のしんがり', anchor: { x: 24, z: -36 }, facing: 0, fleeDir: AZAI_FLEE, aggro: 12, width: 16, morale: 85 },
      dress([{ type: 'busho', n: 1, o: { hat: 'kabuto_m', haori: 0x3a4a3a } }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 26 }, { type: 'gun', n: 5 }], AZAI));
    F.rear = R;
    R.order = 'path'; R.path = [[24, -50], [24, -36]]; R.pathIdx = 0;
    R.formation = 'column'; R.colW = 2;
    R.onArrive = (g) => { g.order = 'hold'; g.anchor.x = 24; g.anchor.z = -36; g.formation = 'yari'; };
    R.dmgMult = 1;   // 傷の重さは他の兵と同じ。
    if (F.flankStopped) {
      R.morale -= 20;
      rt.after(6, () => {
        if (F.step !== 2 || F.ending || rt.over) return;
        rt.say('組頭', F.flankHelp ? 'おぬしらが東を守った。敵は立て直せぬぞ！' : '東の別手も退いた。味方と川を渡れ！', 3);
      });
    }
    rt.marker('rear', centerOf(R), '浅井のしんがり', { red: true, group: R });
    // 浅井の先の備は崩れ、長政の本陣と後ろの備は北西の小谷方面へ引いていく。
    F.retreat = rt.t;
    // 崩れた控えは逃げる姿を残す。殿の控えは一緒に崩さない。
    F.azDA[0].m.rout({ hideAfter: 0 });
    for (const q of F.bankArmy) q.m.rout({ hideAfter: 0 });
    for (const q of [F.jinIso, F.jinMasazumi]) q.m.rout({ hideAfter: 0 });
    // 川の中の浅井の前線も崩れて向こう岸へ逃げる
    F.clash.slice(1).forEach((c, i) => rt.after(1 + i * 4, () => c.rout('B', { from: i ? -1 : 1, hideAfter: Infinity })));
    // 小谷は野村の北西。東へ寄る退き先を改め、野村の後方から西へ向かわせる。
    // 太田浩司の古戦場全体図を参照。小谷城は場外にあり、ここは退路の途中の復元。
    // https://cocoshiga.jp/official/topic/ieyasu01/
    // 動き出す時刻・所要時間と前線の兵数は保つ。城そのものを近くの丘へ置かない。
    rt.after(4, () => F.azDA[1].m.moveTo(-24, -180, 150));
    rt.after(7, () => F.azDA[2].m.moveTo(-48, -190, 150));
  },

  update(rt, dt) {
    const F = rt.flags;
    anegawaRiverTick(rt, dt);
    if (rt.t >= (F.hqSceneAt || 0)) {
      F.hqSceneAt = rt.t + 0.5;
      const raid = rt.taisho?.raid;
      let incoming = raid && !gone(raid) && Math.hypot(raid.center().x - HQ.x, raid.center().z - HQ.z) < 65;
      if (!incoming) for (const g of F.waves) if (g && !g.anePending && !gone(g) &&
          Math.hypot(g.center().x - HQ.x, g.center().z - HQ.z) < 55) { incoming = true; break; }
      if (incoming && !F.hqClashStarted && !F.ending && !rt.over) {
        F.hqClashStarted = true; F.hqClash.mesh.visible = true; F.hqClash.go();
      } else if (F.hqClashStarted && !incoming && !F.hqClash.B.routed) {
        F.hqClash.rout('B', { hideAfter: 16 });
      }
    }
    jinchiTick(rt, F.guns);   // 野戦の陣地：槍が前で揉み合う間は撃たない（yasen_jinchi.js）
    const p = rt.player.u.pos;
    // 北岸で交戦したとの推定に合わせ、銃声と硝煙も動く前線の徳川側から出す。
    // https://cocoshiga.jp/official/topic/ieyasu01/
    // 敗走後は共通の追撃表現に任せ、無人になった元の瀬から発砲を続けない。
    const west = F.clash[0];
    if (!F.ending && !rt.over && !west.A.routed && !west.B.routed && !west.winner) {
      F.farT -= dt;
      if (F.farT <= 0) {
        F.farT = 3 + Math.random() * 4;
        // 数秒に一度だけ既存の前線座標を拾い、押し引きにも追従する。
        const shot = west.frontAt(Math.floor(Math.random() * west.nb), -8);
        const { x, z } = shot;
        rt.army.smoke(x, rt.world.heightAt(x, z) + 1.4, z, 0, -1);
        rt.army.play('gun', shot, 0.9);
      }
    }
    KIT.backTick(rt);
    if (F.ending || rt.over || !rt.player.u.alive) return;
    const player = rt.player, u = player.u;
    anegawaRetreatGuide(rt);
    // 下知を選ぶ前に本陣の危険を読む。前の段の守備札を半秒残さない。
    if (F.step === 1) {
      anegawaHqPressure(rt, dt);
      if (F.hqThreat > 0 && !F.hqGuardMarked) {
        F.hqGuardMarked = true;
        rt.marker('hqGuard', F.hqGuardPos, '本陣の旗', { guideArea: 'wait', guideRadius: 12, waitAction: true, guideDefend: true, guideFlag: true,
          guideFlagMesh: () => F.hqGuideFlag?.userData.flag });
        if (!(F.hqWarnAt > rt.t)) {
          F.hqWarnAt = rt.t + 8;
          rt.hud.say('使番', '本陣が あぶない！ 川岸を離れ、本陣の旗へ戻れ', 5, true);
        }
      }
      if (!F.hqThreat && F.hqGuardMarked) { F.hqGuardMarked = false; rt.unmark('hqGuard'); }
      // 接近の報せと、実際に守りを抜かれた危険を分ける。敗北直前まで無言にしない。
      if (F.hqLostT > 0 && (F.hqBreachWarnAt ?? -99) + 8 <= rt.t) {
        F.hqBreachWarnAt = rt.t;
      }
    }
    // 追手を受けた声にも、この更新で読んだ本陣の危険を使う。
    coverRetreat(rt);
    anegawaTask(rt);
    if (u.alive && F.step === 1 && (u.mobbed || player.inCombatT > 0 && u.hp < u.maxHp * 0.55) &&
        (F.guardWarnT ?? -99) + 12 < rt.t) {
      F.guardWarnT = rt.t;
      pressureWarning(rt, player.sta < player.maxSta * 0.22 ? '息切れじゃ。構えて味方へ退け' :
        '槍を構え、味方の列へ退け');
    }
    // 一斉射：先手が森の鉄砲に届く距離へ寄せたら放つ（一度だけ）。
    if (!F.vol1 && F.iso && !gone(F.iso) && Math.hypot(F.iso.center().x - F.guns[0].anchor.x, F.iso.center().z - F.guns[0].anchor.z) < 65) {
      F.vol1 = true;
      volley(rt, F.guns, { who: '森可成', wait: 2.2, line: '森の鉄砲、浅井の先手へ放て！', hit: 0 });
    }
    // 川を渡ったか（下知の前）
    if (F.step < 2 && p.z < aneNorthBank(p.x) && !rt.G.lord) {
      F.outT = (F.outT || 0) + dt;
      if (F.outT > 3 && !F.crossed) {
        F.crossed = true;
        rt.violation('下知なく姉川を渡った', ['森可成', '戻れ！　誰が渡れと下知した！']);
        rt.objFail('stay');
      }
    } else F.outT = 0;
    if (F.step === 1) {
      const iso = F.iso;
      // 使番が討たれても、自分が旗を見れば組頭へ知らせられる。合戦の進行は待たせない。
      if (F.flankG && !F.flankChoiceShown && !F.flankDone && rt.t >= (F.flankSightAt || 0)) {
        F.flankSightAt = rt.t + 1;
        if (sightPoint(rt, F.flankG.anePending ? F.jinFlank : F.flankG.center())) this.flankChoice(rt);
      }
      this.defendEast(rt);
      // 西の勝敗も、軽い合戦の実際の崩れを待つ。秒数だけで朝倉を敗走させない。
      if (!F.westBroken && F.clash[0].B.routed) {
        F.westBroken = true;
        F.akDA[0].m.rout({ hideAfter: 0 }); F.jinKagenori.m.rout({ hideAfter: 0 });
        mitamuraRetreat(rt);
        anegawaWestPursuit(rt);
        const from = F.tk[1].general || F.tk[1].pos;
        if (from) sendOrder(rt, from, rt.player.u, { id: 'westReport', apply: () => {
          if (rt.over || F.ending) return;
          F.westReported = true;
          rt.say('使番', '西の朝倉、退き始め申した！　横槍が入るまで正面を支えられよ！', 4);
        } }, { team: 0, faction: 'tokugawa', name: '西の戦況' });
        for (const g of [F.iso, F.second, F.third]) if (g && !gone(g)) g.morale = Math.max(0, g.morale - 12);
      }
      if (F.westBroken && F.tkDone && !F.inaba) this.inaba(rt);
      this.breakthrough(rt);
      if (F.flankG && !F.flankDone && gone(F.flankG)) {
        F.flankDone = true; F.flankStopped = true;
        rt.objDone('flank'); rt.unmark('flank'); rt.unmark('eastPost');
        rt.after(4, () => rt.objRemove('flank'));
        rt.obj('mori', '森の兵を半分より多く守れ', 'side');
        rt.award((t) => t.side.push('東の回り込みを止めた'), '東の回り込みを止めた');
        F.clash[2].push('A', 0.5);
        F.taskAt = 0;
        if (!F.taskHurt && !F.hqThreat) anegawaObjective(rt, 'main', '正面へ戻り、味方と浅井を押せ', true);
        rt.say('組頭', F.flankHelp ? 'おぬしらが別手を止めた！　鉄砲組の背後は守れたぞ！' : '東の別手が退いた！　正面の味方を支えよ！', 3);
      }

      if (rt.G.lord) rt.objProgress('main', F.flankPick === 0 && !F.flankDone ? '佐久間の手と東の瀬を守れ' : F.inabaT ? '横槍が取り付いた。味方と正面の備を押せ' : F.westReported ? '西の朝倉は退いた。横槍が届くまで正面の列を保て' : '備を保ち、使番の知らせを待て');
      // 森の備が危うければ、稲葉の横槍を早める
      if (!F.inaba && F.mori.count < F.mori0 * 0.25 && F.tkDone) this.inaba(rt);
      if (!F.tkDone && F.mori.count < F.mori0 * 0.25) this.tokugawa(rt);
      // 坂井の段が押し負けていく様子を印で見せる（崩れたら消す）
      if (!F.sakaiMk && F.iso && F.iso.order === 'attack') { F.sakaiMk = true; rt.marker('sakai', centerOf(F.sakai), '坂井の段', { group: F.sakai }); }
      if (F.sakaiMk && (F.sakai.routed || !F.sakai.count)) rt.unmark('sakai');
      // 東の二段の崩れが、西の徳川の備の士気にも響く。
      if (!F.linkW && F.sakai.routed && F.ikeda.routed && !F.tkDone) {
        F.linkW = true; F.clash[0].shake('A', 14);
        anegawaReport(rt, F.tk[1].general || F.tk[1].pos, '織田の備が押されておる由、徳川殿へも伝え申した！');
      }
      // 坂井の段が崩れたら知らせる
      if (F.sakai.routed && !F.sakaiSaid) { F.sakaiSaid = true; rt.say('森可成', '坂井殿の備が破れた！　池田殿を支えよ！', 3); }
      if ((F.ikeda.routed || F.ikeda.count < 4) && !F.ikedaSaid) { F.ikedaSaid = true; rt.say('森可成', '池田殿の備も抜かれた！　踏みとどまれ、ここを破らすな！', 3); }
      const waves = F.waves;
      // 画面の外の残兵も退く。知らせが見えるかどうかで次の段を止めない。
      for (const g of waves) if (g && !g.anePending && !gone(g) && g.count <= 3) {
        g.noRout = false; g.morale = 0;
      }
      const spent = waves.every((e) => !e || (!e.anePending && (gone(e) || e.count <= 3)));
      // 二の手と東の別手が出た後、寄せを早く退けた働きで西の別手を早める。
      if (F.second && F.flankG && spent && !F.tkDone && !F.tkSoon) { F.tkSoon = true; rt.say('森可成', '敵の足が鈍ったぞ。残る旗を見張れ、西の知らせが来るまで動くな！', 3.5); rt.after(6, () => this.tokugawa(rt)); }
      if (F.third && gone(F.third)) rt.unmark('third');
      if (!iso.anePending && !iso.routed && iso.count <= 3 && !iso.fled) { iso.fled = true; iso.noRout = false; iso.morale = 0; rt.unmark('iso'); rt.banner('磯野員昌、退く', '浅井の先手、川向こうへ'); }
      // 東西の敵が実際に崩れたら追う。正面を守り切った時は、不要な横槍の到着を待たない。
      if (F.third && F.westBroken && gone(iso) && gone(F.second) && gone(F.third)) { this.counter(rt); return; }
      // 長引いた押し合いで突然退き太鼓にしない。残る一分の前に、理由と下知を知らせる。
      if (!F.longFightWarned && rt.t - F.stepT > 270) {
        F.longFightWarned = true;
        rt.hud.say('組頭', '浅井の寄せが止まらぬ。このままでは支え切れぬぞ！ 味方の旗を離れず、敵を押し返せ！', 6, true);
      }
      // 本陣を守り切ったまま五分を越えたら、浅井の寄せは尽きて退く（史実も横槍で浅井が崩れた）。
      //   残兵がどこかに残って押し合いが終わらず、守り通したのに時間切れで負ける事があった（10/28 bot）。
      if (rt.t - F.stepT > 300 && (F.hqLostT || 0) < 8 && !F.hqBreached) {
        for (const g of waves) if (g && !g.anePending && !gone(g)) { g.noRout = false; g.morale = 0; }
        rt.say('森可成', '浅井の寄せが尽きた！　敵が退くぞ！', 3);
        this.counter(rt); return;
      }
      // 守備が実際に押し切られた時だけ敗北へ進める。
      if (F.hqLostT > 22 || rt.t - F.stepT > 330) { this.lose(rt, F.hqLostT > 22 ? '本陣の守りが押し切られ、敵を奥へ通してしまった' : '押し合いが長引き、浅井の寄せを退けられなかった'); return; }
    }
    if (F.step === 2) {
      const R = F.rear;
      // しんがりが崩れれば先手の残兵も退く。浅井の退却の筋を変えない。
      if (gone(R) && F.counterChase && !gone(F.counterChase)) F.counterChase.morale = 0;
      if (F.fordMarked && p.z < aneNorthBank(p.x)) { F.fordMarked = false; rt.unmark('ford'); }
      if (rt.G.lord) anegawaObjective(rt, 'pursue', anegawaPursuitText(rt), true);
      if (gone(R) && !F.rearClearedNotice) {
        F.rearClearedNotice = true;
        rt.unmark('rear');
        if (p.z >= aneNorthBank(p.x)) rt.say('組頭', 'しんがりは崩れた。浅い瀬を渡り、向こう岸の印へ！', 3);
      }
      if (!R.anePending && !F.pursueWarned && rt.t - (F.rearAt ?? F.stepT) > 120) {
        F.pursueWarned = true;
      }
      // 敵が崩れ、本人も味方と渡河した時だけ追い討ちの手柄を付ける。
      if (gone(R) && p.z < aneNorthBank(p.x) && !gone(F.mori)) {
        rt.objDone('pursue'); rt.unmark('rear');
        rt.tracker.main = true;
        rt.award((t) => { t.main = true; t.special = { label: '追い討ち', pts: 25 }; }, '浅井のしんがりを崩した');
        this.ending(rt);
      } else if (gone(F.mori) || (!R.anePending && rt.t - (F.rearAt ?? F.stepT) > 150) || (R.anePending && rt.t - F.stepT > 180)) {
        rt.objFail('pursue');
        this.ending(rt, true);
      }
    }
  },
  lose(rt, reason = '味方の槍の列を保てず、これ以上は進めぬ') {
    if (!rt.canFailMission()) return;
    const F = rt.flags;
    if (F.ending || rt.over) return;
    F.ending = true; rt.tracker.main = false;
    const p = rt.player.u.pos;
    F.withdrawAt.x = p.x; F.withdrawAt.z = Math.min(340, p.z + 45);
    F.retreatGuiding = false; rt.unmark('hurtRetreat');
    // 持ち場を破った敵は、その場で整列して止まらず、奥へ押し寄せる。
    for (const g of F.waves) if (g && !gone(g)) {
      g.order = 'move'; g.dest = { x: HQ.x, z: HQ.z - 12 };
      g.onArrive = (q) => { q.order = 'attack'; q.seekRange = 50; };
    }
    for (const q of F.azDA) if (!q.m.army.rout) q.m.advance(24, 12, { charge: true });
    rt.objFail(F.step < 2 ? 'main' : 'pursue');
    for (const id of ['iso', 'flank', 'eastPost', 'third', 'rear', 'stop', 'sakai', 'hqGuard', 'honjinHelp', 'ford', 'pursuitPost', 'river']) rt.unmark(id);
    rt.objRemove('mori'); rt.objRemove('flank');
    if (!F.crossed && !rt.G.lord) rt.objFail('stay');
    rt.objRemove('stay');
    rt.banner('この組、働きを果たせず', reason);
    rt.say('組頭', '退き太鼓じゃ！　これ以上は支え切れぬ。手負いを連れて退け！', 4);
    rt.finish({ failureReason: reason }, 8);
  },
  ending(rt, shortPursuit = false) {
    const F = rt.flags;
    F.ending = true;
    F.retreatGuiding = false; rt.unmark('hurtRetreat');
    rt.objDone('main'); rt.objRemove('mori'); rt.objRemove('stay');
    for (const id of ['iso', 'flank', 'eastPost', 'third', 'rear', 'stop', 'sakai', 'ford', 'pursuitPost', 'hqGuard', 'honjinHelp', 'river']) rt.unmark(id);
    rt.banner('浅井・朝倉、退く', shortPursuit ? '追い討ちはここまで。組を集めよ' : '姉川の戦、終わる');
    if (shortPursuit) {
      for (const g of [F.rear, F.counterChase, F.flankG]) if (g && !gone(g)) {
        g.order = 'move'; g.dest = { x: g.anchor.x - 64, z: -180 }; g.formation = 'column';
        g.onArrive = (q) => { q.order = 'hold'; q.anchor.x = q.dest.x; q.anchor.z = q.dest.z; };
      }
    }
    const gather = () => {
      if (F.endOrderGiven || rt.over) return;
      F.endOrderGiven = true;
      anegawaObjective(rt, 'main', '法螺貝の長い二声で、組の者を集めよ', true);
      sfx('sig_atsumare', 0.8);
      rt.say('組頭', shortPursuit ? '法螺貝の二声じゃ！　深追いは無用。組を集め、手負いを連れ戻せ！' : '浅井も朝倉も退いたぞ。法螺貝の二声に合わせ、組の者を集めよ！', 4);
      F.epiloguePending = true; F.epilogueAt = rt.t; rt.after(5, () => this.epilogue(rt));
    };
    const from = F.mori.leader || F.mori.units.find((u) => u.alive && u.name);
    if (from?.alive && !rt.G.lord && Math.hypot(from.pos.x - rt.player.u.pos.x, from.pos.z - rt.player.u.pos.z) > 12) {
      sendOrder(rt, from, rt.player.u, { id: 'endGather', apply: gather }, { team: 0, faction: 'oda', name: '森の下知', onLost: gather });
      // 使番が道で止まっても、勝敗は決まっている。集合の法螺貝で終幕へ進む。
      rt.after(12, gather);
    } else gather();
  },
  epilogue(rt) {
    const F = rt.flags;
    if (!F.epiloguePending || rt.over) return;
    if (rt.t - F.epilogueAt < 5) { rt.after(1, () => this.epilogue(rt)); return; }
    F.epiloguePending = false;
    // 公記は小谷への追撃、横山への帰陣、開城の順に記すが、開城の日付は記さない。
    // 会戦中の時計を開城時刻として見せず、ここからは戦後の場面と明示する。
    F.yokoyamaAftermath = true;
    rt.banner('戦後の横山城', '追撃を終え、横山へ引き返す');
    // 長浜城歴史博物館「姉川合戦図」：合戦後に横山城が降り、藤吉郎が城番となる。
    // https://nagahama-rekihaku.jp/digital-museum/70
    // 降伏を告げる終幕でだけ城の旗を下ろす。開戦中の守兵・囲み・乱戦の人数は保つ。
    // 旗を下ろす所作と時機は遊び用の補いで、当日の降伏の手順を確定しない。
    for (const standard of F.yokoyamaStandards) standard.visible = false;
    // 信長公記巻三の「横山之城致降参退出」に合わせ、守兵も城外へ出す。
    // https://ja.wikisource.org/wiki/信長公記
    // 北の虎口から守兵が退出した後、既存の囲みの百人が南北の登り道から入城する。
    // 入城の順と両曲輪への配分は復元。乱戦の人数と勝敗の時計は変えない。
    for (let i = 0; i < F.yokoyamaGuards.length; i++) {
      const guard = F.yokoyamaGuards[i], castle = YOKOYAMA[i];
      const A = guard.m.army;
      if (A.parts?.flags) A.parts.flags.visible = false;   // 遠い軍の形がまだ無い時もある（10/28 終幕で落ちた）
      if (A.parts?.banners) A.parts.banners.visible = false;
      A.commanderName = '横山城の守兵・降伏して城外へ';
      const exitZ = castle.z - castle.hd - 5;
      yokoyamaHandover(rt, guard, [[castle.x, castle.z - 5], [castle.x, exitZ],
        [castle.x + castle.hw + 12, exitZ]], false, 0);
      const siege = i === 0 ? F.jinYokoyama : F.jinYokoyamaSouth;
      siege.m.army.commanderName = '木下藤吉郎の城番（配置は復元）';
      const approach = i === 0 ? [[102, 280], [102, 286], [120, 296], [120, 303], [120, 307]] :
        [[168, 378], [168, 358], [138, 358], [138, 350], [138, 337]];
      yokoyamaHandover(rt, siege, approach, true, 0);
    }
    rt.marker('yokoyamaSurrender', YOKOYAMA[0], '戦後の横山城・藤吉郎が城番へ', { h: 4 });
    // 戦の最中の古い下知で終幕を待たせない。決着後も読める台詞として直接並べる。
    rt.hud.subQ.length = 0;
    rt.hud.say('', '――追撃の後、織田勢は横山へ引き返した。横山城は降り、藤吉郎が城番となる。小谷城は、なお残る。', 8, true);
    rt.hud.say('', '八月、次の戦場は摂津。信長は野田・福島の砦へ向かう。', 4);
    const endDelay = rt.hud.subQ.reduce((t, line) => t + line.dur, Math.max(0.2, rt.hud.subT)) + 1;
    rt.finish({ scriptedEnd: true }, endDelay);
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1 && v.group === F.flankG && k && (k.isPlayer || k.isSub)) F.flankHelp = true;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    KIT.carrion(rt, v);
    const ground = F.groundRemains;
    // 元の倒れた兵が片付いた後だけ残す。二重に亡骸を描かず、固定枠を超えない。
    if (!ground || v.isStruct || v.isPlayer || ground.used >= 24) return;
    ground.used++;
    const x = v.pos.x, z = v.pos.z, heading = v.heading;
    rt.after(45, () => {
      if (rt.over || !v.gone && v.mesh?.parent) return;
      const d = ground.dummy;
      const W = rt.world, n = ground.normal, q = ground.slope, c = ground.contact;
      // 残す亡骸も実兵と同じく、足元ではなく寝た胴の下で坂に沿わせる。
      d.rotation.order = 'YXZ';
      d.rotation.set(Math.PI / 2, heading, 0);
      c.set(0, 0.85, 0).applyQuaternion(d.quaternion);
      const cx = x + c.x, cz = z + c.z, e = 0.6;
      n.set(W.heightAt(cx - e, cz) - W.heightAt(cx + e, cz), 2 * e,
        W.heightAt(cx, cz - e) - W.heightAt(cx, cz + e)).normalize();
      q.setFromUnitVectors(ground.up, n); d.quaternion.premultiply(q);
      c.set(0, 0.85, 0).applyQuaternion(d.quaternion);
      const y = W.heightAt(x + c.x, z + c.z) - c.y;
      d.position.set(x + n.x * 0.24, y + n.y * 0.24, z + n.z * 0.24);
      d.scale.setScalar(1); d.updateMatrix();
      ground.corpses.setMatrixAt(ground.corpses.count++, d.matrix);
      ground.corpses.instanceMatrix.needsUpdate = true;
      ground.corpses.computeBoundingSphere();
    });
  },
  onRout(rt, g) {
    const F = rt.flags;
    if (g._aneRoutSaid) return;
    g._aneRoutSaid = true;
    if (g.aneSource) g.aneSource.m.rout({ hideAfter: 0 });
    if (rt.over || F.ending || !sightPoint(rt, g.center())) return;
    // 川を渡る前に崩れることもある。南北どちらの岸でも、北西の小谷方面への退却として知らせる。
    if (g === F.iso) rt.say('足軽', '磯野の旗が退くがや！　北西へ逃げてくぞ！', 3);
    if (g === F.rear) rt.say('足軽', 'しんがりも崩れたがや！　皆、続け！', 3);
  },
};

// 織田・徳川は概数。浅井五千・朝倉八千は信長公記巻三の記述による。
// 当日付信長書状では浅井五千から六千ほど・朝倉一万五千ほど。表示の目安に公記を採り、実兵数と混同しない。
// 書状翻刻：福井県立図書館公開、佐藤圭「姉川合戦の事実に関する史料的考察」。
// https://www.library-archives.pref.fukui.lg.jp/tosyo/file/614648.pdf
anegawa.force = () => ({ a: 28000, a0: 28000, b: 13000, b0: 13000 });
anegawa.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '浅井の寄せまで待つ' : '');
anegawa.skip = (rt) => { if (rt.phase === 'brief' && !rt.over && !rt.flags.ending) anegawa.charge(rt); };
// 美濃三人衆は東の備えの同じ手に置く。森・佐久間への共通追加を防ぐ。
anegawa.famous = HISTORICAL_GENERALS.anegawa.filter((e) => e.team !== 0);
// 戦の途中で出る名のある武将（磯野・柴田・美濃三人衆）は、支度で作り置いて出る時は置くだけ（army_reserve.js）。姿は出す時と同じ指定
anegawa.reserve = [
  { team: 1, faction: 'azai', type: 'busho', o: { ...AZAI, name: '磯野員昌', horse: true, hat: 'kabuto_r', haori: 0x4a3a22 } },
  { team: 0, faction: 'oda', type: 'samurai', o: { name: '柴田勝家', invuln: true, horse: true, hat: 'kabuto_b', haori: 0x3a2a1c } },
  { team: 0, faction: 'saito', type: 'samurai', o: { ...INABA, name: '稲葉一鉄', invuln: true, horse: true, hat: 'kabuto_w', haori: 0x3a3022 } },
  { team: 0, faction: 'saito', type: 'samurai', o: { ...INABA, name: '氏家卜全', invuln: true } },
  { team: 0, faction: 'saito', type: 'samurai', o: { ...INABA, name: '安藤守就', invuln: true } },
];
anegawa.sides = { a: { name: '織田・徳川軍', mon: 'oda' }, b: { name: '浅井・朝倉軍', mon: 'azai' } };
// 一隊の敗走を全軍の崩れと呼ばず、追撃の下知は森の声に任せる。
anegawa.battleVoices = { lines: { ally: {
  encircle2: ['敵が寄った！　槍を向け、味方へ退け'],
  rout: ['敵の一隊が退くがや！　列を崩すな！', '敵の旗が下がったぞ！　まだ来るで、気を抜くな！'],
  cavCome: ['敵の騎馬だがや！　味方の槍へ退け！', '馬の武者が来るぞ！　槍を並べるんだわ！'],
} } };
anegawa.date = (rt) => {
  if (rt?.flags?.yokoyamaAftermath) return '元亀元年六月　姉川合戦の後';
  const h = rt?.world?.dayClock?.hour ?? 10;
  return '元亀元年六月二十八日　夏・' + (h < 7 ? '卯' : h < 9 ? '辰' : h < 11 ? '巳' : h < 13 ? '午' : '未') + 'の刻';
};
anegawa.history = '信長本陣は南岸の陣杭の柳の伝承を参考に置いた。長浜市は信長が陣太鼓を柳に掛けた伝承地として紹介しており、当日の本陣の位置・陣幕の広がり・建物との関係を確定したものではない。信長公記巻三では、元亀元年六月二十八日卯の刻、浅井・朝倉勢が野村と三田村の二手に分かれ、西の三田村口に徳川勢、東の野村口に信長の馬廻り、さらに東に美濃三人衆が当たったと記す。同書の徳川の「一番合戦」に合わせ、西の交戦と本隊の渡河を浅井の突撃より先に始める。先行する秒数は遊び用の復元である。敵は姉川を越え、織田勢と押しつ押されつ入り乱れた。西の徳川勢と朝倉勢の交戦位置は、太田浩司の解説にある渡河後の北岸とする推定を採った。瀬から北岸へ詰める先手と、それに続いて渡る徳川本隊を描いた。西の乱戦は三田村氏館の堀と建物に重ならないよう、幅と兵数を保って館の西へ寄せた。朝倉の先手・二の手と徳川本隊の合流先も合わせ、榊原の別手は瀬の西寄りから前線の西脇へ回す。別手は隊の幅が浅い帯に収まる位置を渡り、後列まで北岸に上がってから横へ回るよう補った。五十人の兵数・隊の幅と奥行き・横槍の到着時機は保ち、渡河地点は史実と確定しない。朝倉の先手と二の手は北岸の交戦位置からさらに北へ重ね、南向きに徳川を迎える配置に揃えた。各手の位置と間隔は遊び用の復元である。これは館と野戦を両立させる遊び用の復元で、史料が館の西を戦場と確定しているわけではない。朝倉の二の手も北岸の前線へ合流させ、南岸の徳川本陣へ渡る動きにはしない。朝倉が崩れた後は既存の徳川本隊も北岸から北へ追い、三田村氏館の西を通って草野川の手前まで進む。渡河途中なら同じ瀬を通り終えてから追う。これは太田浩司の追撃戦という推定を参考にした補いで、終点・道筋・所要時間は当日の追撃路を確定したものではない。両軍の合流経路・所要時間・細かな位置・川岸からの距離は遊び用の復元であり、当日の行軍を確定したものではない。織田・徳川勢は敵を崩して小谷の麓まで追い、横山へ引き返した後、横山城は降った。信長公記はこの開城の日付・時刻を記さないため、終幕は会戦中の刻を外して戦後の場面と示す。磯野員昌が何段も破ったという細かな戦いぶりは後の軍記に伝わる話で、信長公記には段数の記述はない。森可成の持ち場、川幅・深さと三田村氏館を後方に置く位置、寄せの順、磯野の突破と東の別手の進路、榊原康政の横槍、東の美濃三人衆が横槍に移る時機は、後の伝承を交えた復元である。三田村氏館の西の虎口は滋賀県文化財保護課の遺構解説を参考にした。同解説のほぼ正方形の主郭に合わせ、土塁と外堀の南北幅を東西幅にそろえた。実際の一辺約六十メートルを厳密に縮尺復元したものではなく、庭の百十人・建物・西の虎口と退路を保つ遊び用の大きさである。朝倉本陣の退却は、庭の主屋・脇屋を避けて西の虎口と土橋を一人ずつ通り、村外れから北の山麓への道へつないだ。館の北の塀と堀を横切らないための遊び用の復元であり、当日の退路を確定したものではない。百十人の描画枠と退却開始の条件・三分の移動時間は保った。退路の終わりでは百十人が二点に重ならないよう、草野川の手前で一人ずつ間隔を取って止まる。停止位置と並びは人数を見分けるための遊び用の復元で、当日の再集結地点を確定したものではない。朝倉本陣を三田村氏館に置くのは長浜市の解説に基づく推定で、野村の浅井本陣も郷内の位置は確定しない。館内の本陣は主屋・脇屋と西の虎口への通路を避けて庭へ並べ、主屋に野陣の陣幕を重ねないようにした。百十人の描画枠と兵種の内訳は保ったが、庭の持ち場や建物の配置は遊び用の復元である。門の形・土橋・館へ入る道は遊び用の復元であり、当日の姿を確定したものではない。二つの瀬から北岸の村へ続く道と、南岸の村・信長本陣から横山城の囲みへ続く道も、道筋の史料に基づかない遊び用の補いである。信長本陣の北西に岡山の徳川本陣があるという太田浩司の解説を参考に、南岸の村外れから岡山の東脇を回り、既存の徳川の道へ結ぶ連絡路も補った。田や小堂、陣幕を避けるための推定であり、当日の街道や伝令の経路を確定したものではない。北岸の村から浅井の縦備えの東と三田村氏館の西を回り、北の山麓へ抜ける連絡路も補った。大依山から二郷へ前進したことは信長公記にあるが、この道筋と山麓の出口の位置は推定であり、大依山の旧陣や当日の行軍路を確定したものではない。北の道の出口には大依山方面と会戦前の陣であることを示し、場内の丘や野村の長政本陣と混同しないようにした。目印は旧陣そのものの位置を示さない。米原市の「街道の城」にある、横山丘陵の北端の龍ヶ鼻を会戦前に信長・家康が陣として利用したという解説に合わせ、横山城の北へ続く尾根と龍ヶ鼻の目印を補った。当日の信長本陣を龍ヶ鼻へ移したものではない。尾根の位置・高さ・幅は遊び用の復元であり、古墳や砦の当時の形を確定したものではない。横山城の北城・南城は遺構の解説を参考にし、北城を高くした平坦な曲輪を設けた。削平の高さ・広さ、土塁・木柵の寸法と尾根の登り道は遊び用に補った。南城の北の入口で途切れていた道は、既存の南の虎口を通して山裾へつなぎ、南の包囲兵の東脇へ回した。尾根沿いの連絡を補う復元であり、当日の虎口や登城路を確定したものではない。当日付信長書状で丹羽長秀が徳川勢に加わって朝倉勢に当たったとあるため、西の控えを丹羽の加勢として織田の旗と具足に替えた。六十人の描画枠と乱戦の兵数は保ち、加勢の位置と人数配分は復元とした。丹羽の加勢は南岸に留めず、徳川本隊に続いて同じ瀬を渡り、北岸の本隊の東脇へ進めた。石川数正の控えも既存の六十人を本隊と丹羽の後から同じ瀬へ進め、全列が北岸へ上がってから本隊の西脇へ並べた。石川の参加順・持ち場・道筋は三田村口の戦いを示す遊び用の復元で、史料がこの進路を記すものではない。開始後に朝倉が崩れても渡河途中で止まらないようにした。道筋・先後・所要時間と北岸の持ち場は遊び用の復元で、当日の渡河路を確定したものではない。布陣図では横山城の囲みの目安から計八百を丹羽の加勢へ振り分け、徳川五千・織田二万三千と総勢の目安は保った。横山城を囲む兵は北城と南城に向けて南北に分けたが、二手の位置・向き・人数配分は囲みを示す遊び用の復元であり、当日の包囲線や両将の持ち場を確定したものではない。長浜市浅井歴史民俗資料館の解説にある三田村氏の横山城守備に合わせ、両曲輪の内側にも浅井方の守兵を置いた。各十八人の軽い兵は守備の存在を示す描画用の人数で、実際の籠城人数や曲輪ごとの持ち場を確定したものではなく、野戦の浅井・朝倉一万三千の表示には加算していない。降伏後は守兵が北の虎口を二列で退出し、囲みの既存の百人が南北の登り道から城番へ移るようにした。藤吉郎を定番として置くことは信長公記によるが、退出と入城の経路・速さ・曲輪ごとの持ち場は遊び用の復元である。滋賀県文化財保護課が解説する北城西端の二重堀切も、既存の地面を二本の空堀として掘り下げて示した。位置・幅・深さは遊び用の復元で、登り道・虎口・包囲兵の配置は保った。現存遺構には後年の改修もあり、元亀元年の縄張りを確定したものではない。北側の丘の高さと広がりも復元であり、長浜市の地形解説にある湖北平野を北一面の山壁で塞がないようにした。野村と三田村の後方の道には、小谷方面へ向かう北西の枝道と退き口の目印を補った。草野川の手前までの道筋と終点は遊び用の復元であり、当日の退路や渡河地点を確定したものではない。小谷山そのものは遊べる範囲の外にある。小谷方面へ退く長政の本陣と後ろの備は北西へ向かわせ、追撃を打ち切った時の残兵も同じ方角へ退く。退き先は途中の復元であり、小谷城そのものや当日の退路を確定したものではない。磯野の先手・二の手・三の手・東の別手・先手の残兵・しんがりの実兵も、崩れた後は同じ北西へ退く。敗走方向をそろえる補いであり、各隊の正確な退路を示すものではない。西南の湖北平野から琵琶湖へ開ける方向には、近山の輪を低地へなじませ、対岸方向の遠山だけ低い輪郭で残した。長浜市の地形解説を参考にした見通しの復元であり、稜線の高さや当日の眺めを確定したものではない。開戦時刻は信長公記の卯の刻と、当日六月二十八日付の信長書状の巳の刻とで異なる。ここでは当日書状を採り、巳の刻を十時ごろの光で表した。日の高さと方角は湖北の北緯約三十五度半と太陽暦八月上旬の赤緯約十六度を使い、夏の短い影へ合わせた。時刻は真太陽時の目安で、当日の観測や厳密な時刻の復元ではない。追撃へ移る時刻と戦の長さは遊び用の目安で、史実の終了時刻を示さない。渡河済みの判定と岸への案内は、復元した川の蛇行と川幅に合わせている。晴れの空と風向きは当日の天気を確定したものではない。兵数は信長公記の浅井五千・朝倉八千を表示の目安に採った。当日付の信長書状では浅井は五千から六千ほど、朝倉は一万五千ほどと見積もられ、史料によって異なる。織田・徳川二万八千は横山城を囲む兵も含めた諸説ある概数で、川原で一度に戦った人数を示すものではない。各手への人数の割り振りと画面に描く兵の数は遊び用の復元である。';

anegawa.history += '三田村氏館は、滋賀県文化財保護課が主郭の北にも土塁や堀跡と思われる水路を挙げ、複数の郭から成ったと推定している。これを参考に北郭の北辺・東辺に土塁と外側の水路を補った。位置・範囲・高さ・水深と元亀元年当日の姿は確定しない。主郭の西の虎口と既存の退路は保ち、北郭の建物や門は復元していない。';

// 素直な遊び手：移った槍の列を保ち、東の別手を読み、下知が出たら川を渡る
// 本陣を守る間は、bot も共通の退き癖（survive）で立ち尽くさず、この戦の頭で受けて突く（10/28：本陣で棒立ちのまま押し切られた）
Object.defineProperty(anegawa, 'botDefendsFort', { get() {
  const rt = aneLive, u = rt?.player?.u;
  if (!rt || rt.def !== anegawa || rt.over || !u) return false;
  const F = rt.flags;
  return F.step === 1 && !!(F.hqThreat || F.hqDefend) && !anegawaReturning(rt);
} });
anegawa.botBrain = (b, inp, { goTo, patientStrike }) => {
  const p = b.player, u = p.u, F = b.flags;
  const battlePost = F.pushGuiding ? F.pushAt : F.holdAt;
  inp.quickCmd = null;
  inp.k.delete('KeyW');
  inp.runHeld = false;
  if (!u.alive || F.ending) return;
  const reach = p.weapon === 'sword' ? 1.9 : 2.8;
  const approach = reach * 0.85;
  const hqPost = F.step === 1 && (F.hqThreat || F.hqDefend) ?
    (F.hqDefend ? F.hqDefensePos : F.hqGuardPos) : null;
  const returningHq = hqPost && anegawaReturning(b);
  // 目の前の敵と、実際に打ち込む敵は別の事がある。横からの一撃を先に受ける。
  let attacker = null, attackDist = 10, soonest = Infinity;
  for (const o of b.army.threats || []) {
    if (!o.alive || o.fleeing || o.type === 'gun' || o.type === 'bow' ||
        Math.abs(o.pos.y - u.pos.y) >= 3 || b.army.wallBetween(u.pos, -1, o.pos)) continue;
    const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z);
    // 脅威の表は前の更新のもの。振り終えた敵への構えを持ち越さない。
    if (!((o.atk && o.atk.target === u && !o.atk.bow) ||
        (o.swing && !o.swing.done && o.swing.target === u) ||
        (o.charging && o.cv === 'in' && o.target === u))) continue;
    const charge = o.charging && o.cv === 'in' && o.target === u;
    const swing = o.swing && !o.swing.done && o.swing.target === u;
    const soon = charge ? 0 : swing ? Math.max(0, o.swing.dur * o.swing.at - o.swing.t) : o.atk.t + 0.2;
    if (d < 10 && (soon < soonest || soon === soonest && d < attackDist)) {
      attacker = o; attackDist = d; soonest = soon;
    }
  }
  // 帰陣中は遠い敵の溜めを待たず、下知の旗へ進む。届く直前の一撃だけ先に受ける。
  if (returningHq && !(attacker && soonest <= 0.35 && attackDist <= attacker.reach + 0.6)) {
    inp.guardHold = false; inp.leftPressed = false; inp.chargeHold = false;
    p.botStrikeUntil = 0;
    goTo(p, inp, hqPost.x, hqPost.z, 4);
    return;
  }
  if (attacker) {
    if (p.lock && p.lock !== attacker) inp.e.add('KeyQ');
    // 敵の長槍だけ届く所で止まらない。下知の前は森の持ち場とこちら岸を守る。
    const nearPost = F.step >= 2 || (b.world.waterDepthAt(attacker.pos.x, attacker.pos.z) <= 0.02 && attacker.pos.z > aneSouthBank(attacker.pos.x) &&
      Math.hypot(attacker.pos.x - battlePost.x, attacker.pos.z - battlePost.z) < (b.G.lord ? 12 : 34));
    if (!returningHq && attackDist > approach && !attacker.charging && nearPost) {
      goTo(p, inp, attacker.pos.x, attacker.pos.z, approach);
      const walk = p.yaw, face = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
      inp.k.delete('KeyW');
      if (Math.cos(walk - face) > 0.3) inp.k.add('KeyW');
      if (Math.sin(walk - face) > 0.3) inp.k.add('KeyA');
      else if (Math.sin(walk - face) < -0.3) inp.k.add('KeyD');
    }
    p.yaw = Math.atan2(attacker.pos.x - u.pos.x, attacker.pos.z - u.pos.z);
    inp.leftPressed = false; inp.chargeHold = false;
    // 溜めの初めから構えると、気力と受け流しの間を使い切る。最も早い穂先に合わせる。
    inp.guardHold = !!attacker.charging || !!(attacker.swing && !attacker.swing.done && soonest <= p.parryWin() * 0.35);
    if (inp.guardHold) p.botStrikeUntil = 0;
    else if (!attacker.invuln && attackDist < reach && soonest > 0.85 && attacker.atk?.t > 0.65) {
      patientStrike(p, inp, attacker, attackDist, true);
    }
    return;
  }
  // 下知の前は川のこちら側だけ
  const ok = (o) => !o.fleeing && !o.invuln && !o.noTarget && !o.isStruct &&
    Math.abs(o.pos.y - u.pos.y) < 3 && !b.army.wallBetween(u.pos, -1, o.pos) &&
    (F.step >= 2 || o.pos.z > aneSouthBank(o.pos.x) && b.world.waterDepthAt(o.pos.x, o.pos.z) <= 0.02);
  const flank = F.flankG;
  if (!hqPost && F.step === 1 && F.flankPick === 0 && !F.flankDone && flank && !gone(flank)) {
    const c = flank.center();
    goTo(p, inp, c.x, Math.max(aneSouthBank(c.x) + 1, c.z), approach);
    const e = b.army.nearestEnemy(u, 3.2, ok);
    if (e) {
      if (p.lock && p.lock !== e) inp.e.add('KeyQ');
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (d > approach) goTo(p, inp, e.pos.x, e.pos.z, approach);
      else inp.k.delete('KeyW');
      patientStrike(p, inp, e, d);
    }
    return;
  }
  inp.runHeld = false;
  // 傷は自然には癒えない。共通の survive が構えて味方へ退き、傷を縛る。
  // 固定の退き先で回復を待つと、構えずに打たれ続け、斬り合いにも戻れない。
  // 下知の前は、備の前に出すぎず、槍の届く所の敵だけを突く
  const home = hqPost || (F.step >= 2 ? u.pos : F.pushGuiding ? F.pushAt : F.holdAt);
  const postRange = b.G.lord ? 12 : 34;
  const previous = p.botStrikeFoe;
  // 構えを解く間に近い兵が入れ替わっても、届く相手への反撃を続ける。
  const keep = p.botStrikeUntil > p.time && previous?.alive && previous.team !== u.team &&
    ok(previous) && Math.hypot(previous.pos.x - u.pos.x, previous.pos.z - u.pos.z) < reach &&
    Math.hypot(previous.pos.x - home.x, previous.pos.z - home.z) < (F.step >= 2 ? 99 : postRange);
  const e = keep ? previous : b.army.nearestEnemy(u, F.step >= 2 ? 16 : b.G.lord ? 9 : 25, (o) => ok(o) && Math.hypot(o.pos.x - home.x, o.pos.z - home.z) < (F.step >= 2 ? 99 : postRange));
  if (e) {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (p.lock && p.lock !== e) inp.e.add('KeyQ');
    p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    // 刀は槍より短い。槍の間合いで止まると、刀では一度も斬れない。
    if (d > approach) goTo(p, inp, e.pos.x, e.pos.z, approach);
    // 構えを毎コマ解き直すと、槍を突ける半秒の待ちが終わらない。
    // 打ち込みは受け、敵の隙には構えを解いて突き返す。
    patientStrike(p, inp, e, d);
    return;
  }
  inp.guardHold = false;
  if (F.step >= 2 && F.rear && F.rear.count) { const c = F.rear.center(); goTo(p, inp, c.x, c.z, 2); }
  else goTo(p, inp, home.x, hqPost || F.pushGuiding ? home.z : home.z - 3, 2.5);
};

export { anegawa };
