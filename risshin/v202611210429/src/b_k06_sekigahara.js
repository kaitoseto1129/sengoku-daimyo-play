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
import { hiddenSpot } from './spawn_sight.js';
import { enemyJin } from './enemy_jin.js';
import { useTerrain } from './asset_manifest.js';
import { demSample } from './dem.js';
import { enemyGroup, allyGroup, gauss, nm, wallLine } from './bhelp.js';
import { depthReserve, frontFill } from './depth_reserve.js';
import { isTouch as TOUCH } from './touch.js';
import { KIT } from './b_nagashinojo.js';
import * as THREE from 'three';
import { nobori, jinCamp, umaFollow } from './props.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { KILLS, cut } from './stages.js';
import { timeslipField } from './timeslip_field.js';
import { setStages } from './b_k_help.js';
import { sightScreenUnit } from './battle_sight.js';
import { localPoint } from './army_local_way.js';
import { toyoGuard } from './toyo_bot.js';
import * as jindate from './k06/jindate.js';   // 台本の動き（第一線の激突・小早川の下山・段ごとの下知）
import { DEPTH } from './k06/depth_plan.js';   // 陣立て表（共通の army_depth.js が描く）
import * as yoin from './k06/yoin.js';         // 勝った後の余韻（倒れた旗・逃げる兵・首実検の支度）
import { loneGeneralTick } from './lone_general.js';   // 11/21 K468 クラウドせ：単騎の西軍の将を近くの厚い備の中へ
import { chargeFujinBlocks } from './mass_charge.js';   // K467：布陣の太い塊を一度に寄せる（cloud-27 の共通の部品・cloud-47 の形）
import { isEn, addEn } from './i18n.js';
// K516 英語の時だけ関ヶ原の字の表を読む（日本語の時は読まない）
if (isEn()) import('./i18n_sekigahara.js').then((m) => addEn(m.default)).catch(() => {});

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
// 11/18 クラウド k06 持ち主：段3 で (-212,52) まで七十歩退き、段4 で宇喜多先手前まで百十歩を六十秒歩き直して段4 の討ち取りが0だった。
//   退く所を福島隊の脇の後ろ（先手から七十五歩）へ寄せ、段4 の歩きを二十歩ほどに
const BACK = { x: -246, z: 50 };  // 一旦退く所（福島隊の脇の後ろ）
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
// 川の折れ目を丸める（角を二度削る）。八点の折れ線だと曲がり目が角ばって見えた（k365-cloud-19・川と森）
const FUJI_RIVER = [0, 1].reduce((pts) => [pts[0], ...pts.slice(0, -1).flatMap((p, i) => { const q = pts[i + 1];
  return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]]; }), pts[pts.length - 1]], FUJI);
const NAKASENDO = sc([[240, 70], [130, 54], [40, 16], [0, 6], [-80, 8], [-150, 30], [-200, 56], [-240, 70]]);
const HOKKOKU = sc([[-60, 6], [-110, -30], [-150, -70], [-180, -150], [-200, -230]]);
const ISE = sc([[-6, 8], [2, 60], [12, 130], [30, 240]]);
const SHIMA_PATH = [{ x: -300, z: -70 }, { x: -200, z: -48 }, { x: -112, z: -36 }, { x: -60, z: 40 }, { x: -10, z: 170 }, { x: 20, z: 360 }, { x: 60, z: 560 }];
const FOG_T0 = 8, FOG_T1 = 40;   // 11/9 kaito：最初の三十秒で「見渡す限り軍勢」が見えるよう、霧は早く晴れる
const HOLD_S = 90;   // 11/15 クラウドさ K129：32→90（30分の大きさへ。島津を本陣で受ける時間）
// 11/14 クラウドか K129（kaito 11/6「30分ほど遊べる大きさ」）：本陣の前で島津を受けた後、伊勢街道へ抜ける島津を追い、道に座って撃つ捨て奸を二手まで崩す段（⑫）。
//   史実でも井伊・松平忠吉・本多は島津を追い、捨て奸に足を止められ、烏頭坂のあたりで豊久が討ち死にした
// 11/14 クラウドさ K127：一の手が本陣の前から百五十m 先で、坂まで歩くだけで四十〜八十秒かかり act bot が⑫の半ばで1260秒の時切れ。
//   同じ退き道の上で一つずつ手前へ（一の手＝道の二つ目の角の先・二の手＝元の一の手の坂）
const SUTE1 = { x: -66, z: 34 }, SUTE2 = { x: -36, z: 98 };   // 捨て奸の一の手・二の手（島津の退き道 SHIMA_PATH の上）
const S12_MIN = 130, S12_MAX = 190;   // ⑫ 一手ごとに押し合う秒（11/14 クラウドさ：70/150 では坂への道を含め⑫が二百五十秒を越え、act bot が1260秒で時切れ）
// 11/9 kaito（docs/sekigahara_spec_1109.md）：前半十分は西軍が強い。寝返りは十分半ごろ。主人公は福島隊のそばから右翼へ、最後に島津の進路へ
const HOLD5S = 100;      // ⑤ 宇喜多の押し返しを福島隊のそばで持ちこたえる秒
const S5_MIN_T = 330;   // ⑤ は戦が始まって五分半より前には終えない（手本は3:00〜6:00。早く右翼へ着くと⑦の膠着が五分を越えて間延びする）
const RLINE = { x: -272, z: 150 };   // ⑦ 藤堂・京極の脇で大谷隊（平塚・戸田）の前進を止める線
const OTANI_FRONT = { x: RLINE.x - 14, z: RLINE.z };
const HOLD7S = 80;
// 11/14 クラウドか K129（kaito 11/6「30分ほど遊べる大きさ」）：⑨と島津の間に、笹尾山の麓の柵で島左近・石田の鉄砲衆を破る段（⑩）を差した。
//   史実でも石田の陣は宇喜多・小西より後まで持ちこたえ、黒田・細川が攻め続けた。左近は黒田の鉄砲に撃たれて退く（討てる将にはしない）
const S10_MIN = 200, S10_MAX = 290;   // ⑩ 柵の前で押し合う秒（短すぎると素通り・長すぎると間延び）
// 11/14 クラウドし K127：寝返りは630秒より前に起こさないので、⑩200秒・⑫二手×100秒の上限が重なると act bot の1260秒を越えた（2222：⑩173秒・⑫1110秒〜時切れ）。⑩150・⑫一手30〜55秒に（2233：二の手の半ばで時切れ）
const CENTER9 = { x: -350, z: 66 };   // ⑨ 宇喜多の殿が踏みとどまる天満山の麓（大谷の陣が崩れた後、宇喜多・小西が横から押される）      // ⑦ 大谷隊の前を支える秒
const FLIP_MIN_T = 630; // 寝返りは戦が始まって十分半より前には起こさない（中盤で起こすと後半ずっと東軍の勝ちに見える）
const FALL_MAX = 190;   // ⑧ 小早川が動いてから大谷隊が崩れるまでの最長の秒（押し崩せなくても進む）
// 右上の目標（goals5・obj・setStages で同じ文）。行き先は地図で分かる名で（BU「ここ」は使わない）
//   討てる将（明石全登・島津豊久）の名は目標の文に入れない（victory_flow の namedKill が名を含む札を済みにし、段の途中で勝ちに締まる）
// 11/20 K467（kaito「十人ほどしか来ない。一気に大勢で来る」・k365-cloud-15）：西軍の「受ける」段の始めに、本人に近い布陣の塊を一度に寄せる。
//   関ヶ原の布陣の塊は五人ずつと小さいので、五人以上の六つを、本人から近い塊の方へ八歩出た所に横に並べて走り込ませる（兵は足さない・強さは変えない）。十八秒後にもう六つ
function sekiCharge(rt) {
  const me = rt.player?.u; if (!me || typeof location !== 'undefined' && /[?&]k467off/.test(location.search)) return;   // ?k467off：前後の写真の前（now_pair --flag=k467off=1）
  const go = () => {
    const P = me.pos; let best = null, bd = 1e9;
    for (const g of rt.army.groups) if (g._fjR && g.team !== me.team && g.count >= 4 && !g.routed && !g._fjGo) { const c = g.center(), d = Math.hypot(c.x - P.x, c.z - P.z); if (d < bd) { bd = d; best = c; } }
    if (!best || bd > 220) return;
    const k = 8 / (bd || 1);
    chargeFujinBlocks(rt, { x: P.x + (best.x - P.x) * k, z: P.z + (best.z - P.z) * k }, { n: 6, min: 4, spread: 7 });
  };
  go(); rt.after(18, () => { if (!rt.over && !rt.flags.ending) go(); });
}
const G = [
  '井伊の赤備えと宇喜多先手前へ出る',
  '宇喜多の先手前で井伊の鉄砲衆を守る',
  '井伊と春日神社前の福島隊後方へ退く',
  '福島隊と宇喜多先手前で槍を合わす',
  '福島隊のそばで宇喜多の反撃に耐える',
  '中央右翼の藤堂・京極隊を救援する',
  '藤堂・京極の陣前で大谷隊を受ける',
  '藤堂・京極の陣前で大谷隊を押し崩す',
  '天満山の麓で西軍中央を突破する',
  '笹尾山の麓で石田の陣を押し崩す',
  '陣場野の本陣前で島津の突入を受ける',
  '伊勢街道の坂で島津の捨て奸を追い崩す',
];
const NOUN = ['宇喜多の先手', '井伊の鉄砲衆', '春日神社', '宇喜多の先手', '宇喜多勢', '藤堂・京極の隊', '大谷隊', '大谷隊', '宇喜多・小西の殿', '石田の陣', '島津の隊', '島津の捨て奸'];
// 目標文から地名を取り出す共通処理では、長い十段の文から名が取れず距離だけになる。
const PLACE = ['宇喜多先手前', '宇喜多先手前', '春日神社の福島隊後方', '宇喜多先手前', '宇喜多先手前', '藤堂・京極の隊', '藤堂・京極の陣前', '藤堂・京極の陣前', '天満山の麓', '笹尾山の麓の柵', '陣場野の本陣前', '伊勢街道の坂'];

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
// 11/18 cloud-31：筋書きの一斉射（込め終えた者が揃って本当に撃つ。army_ranged の scriptSalvo）
function salvo(rt, g, foes, max) { if (alive(g)) rt.army.scriptSalvo(g, foes, max); }
const near = (a, b, r) => !!a && !!b && Math.hypot(a.x - b.x, a.z - b.z) < r;
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
const front9 = (P, F) => { const q = front(P, CENTER9, 50, F.shingari, F.koniR, F.s9rest); return q === CENTER9 ? front(P, CENTER9, 80, F.shingari, F.koniR, F.s9rest) : q; };
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
// 11/20 K470（cloud-37・spawn_sight.js）：段の途中で出る宇喜多の組を、見えている所に急に生まず画面の外（横・奥）に生んで持ち場へ歩かせる（置けない時は今までどおり）
const foe = (rt, name, at, list, lk, o = {}) => {
  const lim = (rt.world?.def?.moveLim || rt.def?.moveLim || 176) - 20;
  const q = (rt.t || 0) > 20 ? hiddenSpot(rt, at, (p) => Math.abs(p.x) < lim && Math.abs(p.z) < lim && rt.world?.walkable?.(p.x, p.z) !== false) || at : at;
  const g = enemyGroup(rt, { name, faction: 'toyotomi', anchor: { ...q }, facing: Math.PI / 2, order: 'attack', aggro: 36, seekRange: 60, width: 10, ...o }, dress(list, lk));
  if (g && q !== at) { g.anchor = { ...at }; if (g.order !== 'attack') { g.order = 'move'; g.dest = { ...at }; g.onArrive = (h) => { h.onArrive = null; h.order = o.order || 'hold'; h.anchor = { ...at }; }; } }
  return g;
};
const ally = (rt, name, at, list, lk, o = {}) => allyGroup(rt, { name, faction: 'tokugawa', anchor: { ...at }, facing: -Math.PI / 2, width: 10, aggro: 14, morale: 92, noRout: true, ...o }, dress(list, lk));
// 総大将は本陣で床几に座る（update が座り直させる）。幕の内から出ない（aggro 0・その場に留まる）
const keepCommander = () => {};
const SEAT = (g, name) => {
  const u = g?.units.find((o) => o.name === name);
  if (u) {
    // 本人を座らせるだけでは、共通の加勢が旗本を前線へ借り出す。本陣の手は台本の下知でだけ動かす。
    g.stay = true;
    // 索敵から外すだけでは、巻き込まれた一撃の手傷処理で討たれる。退却・自害は戦の台本に任せる。
    u.mustLive = true; u.onWound = keepCommander;
    u._crouch = true; u.noTarget = true; u._k06Seat = { ...u.pos };
  }
  return u;
};
// 索敵距離が零でも共通の応戦は働く。総大将だけを床几に留め、旗本は戦わせる。
const sit = (u) => {
  if (!u?.alive || u.gone || u.fleeing || u.group?.routed) return;
  if (u.group?.order === 'move') { u._crouch = false; if (u._k06Seat) { u._k06Seat.x = u.pos.x; u._k06Seat.y = u.pos.y; u._k06Seat.z = u.pos.z; } return; }   // 11/18 ト四：歩く間に座所を現在地へ追わせ、order が一瞬 hold になっても昔の座所へ飛ばさない
  const p = u._k06Seat;
  if (!p) return;
  u.pos.x = p.x; u.pos.y = p.y; u.pos.z = p.z;
  u.target = null; u.watch = null; u.moveTo = null;
  u.atk = null; u.swing = null; u.bind = null;
  // 中盤に立っても、応戦の相手や攻撃を残して本陣から打って出させない。
  u.moving = 0; u._crouch = !u._k06Stand;
};
// 寝返りは所属だけを替える。兵を作り直すと、山から飛び、秀秋が消え、人数と傷も戻ってしまう。
const turnover = (rt, g, name) => {
  if (!g) return null;
  g.team = 0; g.name = name; g.faction = 'tokugawa'; g.noFrontline = false;
  for (const u of g.units) {
    u.team = 0;
    u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.aiT = 0;
  }
  return g;
};
// 本陣：幕（jinCamp）を張り、幕の線に沿って当たりを置く（幕は抜けられない。BU「敵の本陣に歩いて入れてしまう」）。
//   幕そのものが見える壁なので、当たりには別の形を付けない。大将は奥の床几に座る
// 11/18 クラウド k06 持ち主：act bot 1554秒 達成・討ち取り60で、受けた傷が弓の一度だけ（「簡単すぎ・もっと強い奴と斬り合いたい」）。
//   味方の大勢が先に組み合い、敵の組は本人の前を素通りする。槍を合わせる段（④⑤⑦⑧⑨⑩）だけ、本人から二十歩内で
//   攻めに出ている敵の組を一つ本人へ向ける（道明寺・木津川口の huntPlayer と同じ形）。敵の数・強さは変えない。
//   本人の命が六割を切ったら・柵を挟んだら・組が崩れたら放す。島津・捨て奸（historicalOrders・noAI）は向けない。
const HUNT_STEPS = [4, 5, 7, 8, 9, 10];
function huntPlayer(rt, F) {
  const P = rt.player.u;
  const on = P?.alive && !F.ending && HUNT_STEPS.includes(F.step) && P.hp >= P.maxHp * 0.6;
  const c = F._huntC || (F._huntC = { x: 0, y: 0, z: 0 });
  const ok = (g) => {
    if (!on || g.routed || !g.count || g.order !== 'attack' || g.noAI || g.historicalOrders) return false;
    g.center(c); c.y = rt.world.heightAt(c.x, c.z);
    return Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 20 && !rt.army.wallBetween(c, g.team, P.pos);
  };
  let cur = F._hunter;
  if (cur && (cur.focus !== P || !ok(cur))) {
    if (cur.focus === P) { cur.focus = null; for (const v of cur.units) if (v.target === P) { v.target = null; v.aiT = 0; } }
    cur = F._hunter = null;
  }
  // 11/18 21:15 クラウド k06 持ち主：討てない将（明石全登）が本人の三歩半内で六秒、狙いを持たずに立った（act bot 814秒・三回に一回）。
  //   一秒ごとに見て、本人のすぐそばで狙いの無い名のある敵の将は本人へ打ちかかる（島津・捨て奸は外す）
  // 11/19 04:50 クラウド k06 持ち主：討てない将（明石全登・invuln）が段4〜5で本人に四十秒付きまとい、退く本人を一太刀二割ずつ削って倒した（act bot 0441・230秒）。
  //   本人が討てない将は、本人の命が六割を切ったら本人を放して二秒は選び直さない（勝てない相手との斬り合いで倒させない。手の兵は向かって来る）
  const weak = P?.alive && P.hp < P.maxHp * 0.6;
  if (weak && !F.ending) for (const u of rt.army.units) if (u.invuln && u.team === 1 && u.alive && u.target === P && !u.group?.noAI && !u.group?.historicalOrders) { u.target = null; u.atk = null; u.aiT = 2; }
  if (P?.alive && !F.ending && rt.t >= (F._besideT || 0)) {
    F._besideT = rt.t + 1;
    for (const u of rt.army.units) {
      if (weak && u.invuln) continue;
      if (!u.alive || u.gone || u.team !== 1 || !u.name || u.fleeing || u.noTarget || u.target || u.atk || u.perch) continue;
      if (u.group?.noAI || u.group?.historicalOrders || Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z) > 3.5) continue;
      if (rt.army.wallBetween(u.pos, u.team, P.pos)) continue;
      u.target = P; u.aiT = 0;
    }
  }
  // 11/19 クラウド k06 持ち主：act bot 1687秒で、敵の侍が本人へ打ち込んだのは二太刀だけ（侍は組の中で味方の兵と組み合い、本人へ来るのは足軽と騎馬）。
  //   槍を合わせる段は、本人の十四歩内で崩れていない敵の侍のうち、近い二人までを本人へ打ちかからせる（一秒ごと・数と強さは変えない）
  if (on && rt.t >= (F._samT || 0)) {
    F._samT = rt.t + 1;
    let have = 0;
    const pick = F._samPick || (F._samPick = []);
    pick.length = 0;
    for (const u of rt.army.units) {
      if (!u.alive || u.gone || u.team !== 1 || u.type !== 'samurai' || u.fleeing || u.noTarget || u.woundOut || u.group?.routed) continue;
      if (u.target === P) {
        have++;
        if (rt._k06Cut) {
          const S = rt._k06Cut, d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z), v = Math.hypot(u.vel?.x || 0, u.vel?.z || 0);
          const k = d < 3 ? 'h3' : d < 6 ? 'h6' : d < 10 ? 'h10' : 'h14';
          S[k] = (S[k] || 0) + 1;
          if (d >= 3 && v < 0.3) S.hStill = (S.hStill || 0) + 1;
          if (d < 3 && !u.atk && !(u.swing && !u.swing.done)) {
            S.hIdle = (S.hIdle || 0) + 1;
            const fa = Math.atan2(P.pos.x - u.pos.x, P.pos.z - u.pos.z), ad = Math.abs(Math.atan2(Math.sin(u.heading - fa), Math.cos(u.heading - fa)));
            const r = u.stagger > 0 ? 'iSt' : u.guarding > 0 ? 'iGu' : u.cd > 0 ? 'iCd' : ad >= 0.6 ? 'iFa' : u.bind ? 'iBi' : 'iEl';
            S[r] = (S[r] || 0) + 1;
          }
          if (u.playerQueue) S.hQ = (S.hQ || 0) + 1;
          if (d >= 3 && v < 0.3 && !S.hEx) S.hEx = `${u.group?.name}:${u.group?.order}${u.group?.stay ? '・stay' : ''}${u.group?.anchor ? '・anchor' : ''}${u.bind ? '・bind' : ''}${u.pinT > rt.army.time ? '・pin' : ''}${u.dazed ? '・daze' : ''}`;
        }
        continue;
      }
      if (u.group?.noAI || u.group?.historicalOrders || u.mounted) continue;
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      if (d < 14 && !rt.army.wallBetween(u.pos, u.team, P.pos)) pick.push([d, u]);
    }
    pick.sort((a, b) => a[0] - b[0]);
    // 記録：一秒前に向けた侍が、今どうしているか（本人のまま・味方へ替えた・待ちの列・狙い無し）
    const Sx = rt._k06Cut;
    if (Sx) for (const u of F._samSent || []) {
      if (!u.alive) { Sx.lDead = (Sx.lDead || 0) + 1; continue; }
      const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z);
      const k = u.target === P ? (u.playerQueue ? 'lQ' : d < 4.5 ? 'lNear' : 'lKeep') : !u.target ? 'lNone' : 'lOther';
      Sx[k] = (Sx[k] || 0) + 1;
      if (k === 'lOther') { const b = d < 4.5 ? 'o4' : d < 9 ? 'o9' : 'o14'; Sx[b] = (Sx[b] || 0) + 1; }
    }
    const sent = F._samSent || (F._samSent = []);
    sent.length = 0;
    if (rt._k06Cut) { rt._k06Cut.on = (rt._k06Cut.on || 0) + 1; if (pick.length || have) rt._k06Cut.near = (rt._k06Cut.near || 0) + 1; }
    for (let i = 0; i < pick.length && have < 2; i++, have++) { const u = pick[i][1]; if (u.bind || u.swing && !u.swing.done) continue; u.target = P; u.atk = null; u.watch = null; u.moveTo = null; u.pullUntil = rt.army.time + 2.5; sent.push(u); if (rt._k06Cut) rt._k06Cut.sent = (rt._k06Cut.sent || 0) + 1; }
  }
  if (cur || !on) return;
  for (const g of rt.army.groups) if (g.team === 1 && !g.focus && !g.isPlayerSquad && ok(g)) { g.focus = P; F._hunter = g; return; }
}
// 11/18 クラウド k06 持ち主：段4・段5 は本人の一番近い敵が1〜7m なのに、本人の6m内に味方（福島・井伊・井伊の新手）が4〜15人立ち、
//   本人の前を塞いで先に討つ（段1〜6 の七分余りで本人の討ち取り1）。本人と敵の間に立つ味方の組（自分の組は外す）を、
//   本人の左右十二歩へ割って押し合わせる（数・強さ・段は変えない）。一つの組は一つの段に一度だけ割る。
function splitFront(rt, F) {
  if (F.ending || (F.step !== 4 && F.step !== 5) || rt.t < (F._splitT || 0)) return;
  F._splitT = rt.t + 2;
  const P = rt.player.u;
  if (!P?.alive) return;
  let foe = null, fd = 30;
  for (const u of rt.army.units) if (u.alive && !u.gone && u.team === 1 && !u.fleeing) { const d = Math.hypot(u.pos.x - P.pos.x, u.pos.z - P.pos.z); if (d < fd) { fd = d; foe = u; } }
  if (!foe) return;
  const fx = (foe.pos.x - P.pos.x) / (fd || 1), fz = (foe.pos.z - P.pos.z) / (fd || 1);
  const c = F._splitC || (F._splitC = { x: 0, y: 0, z: 0 });
  for (const g of rt.army.groups) {
    if (g.team !== 0 || g.isPlayerSquad || !alive(g) || g.noAI || g.historicalOrders || g._split === F.step) continue;
    g.center(c);
    const dx = c.x - P.pos.x, dz = c.z - P.pos.z, d = Math.hypot(dx, dz), along = dx * fx + dz * fz;
    if (d > 9 || along < 0) continue;
    g._split = F.step;
    const s = (dx * -fz + dz * fx) >= 0 ? 1 : -1;
    const at = { x: P.pos.x - fz * 12 * s + fx * 3, z: P.pos.z + fx * 12 * s + fz * 3 };
    if (g.order === 'hold') { g.anchor = at; g.dest = null; g.path = null; }
    else goAttack(g, at, 14, 20);
  }
}
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
  // 各隊の進軍は段の下知で管理する。共通の呼び寄せで本陣や寝返り前の小早川を動かさない。
  noGoalFoe: true,
  hideArmyPeek: true,
  // 11/18 クラウド k06 持ち主：段4 は春日神社から宇喜多先手前まで五十秒余り歩き、着いても三十m 内の敵が五〜六人（福島の列が先に組む）で本人の討ち取り0（act bot 3回）。
  //   段4 だけ、前を埋める備を敵の本物の数で数える（味方で前が埋まったと見なされ、宇喜多の新手が出なかった）
  frontFillFoe: (rt) => rt.flags.step === 4,
  keepBattleSigns: true,  // 行き先の▼を出している間も、武将名・兵数・目標一覧を残す。
  missionSingleLine: true,
  // 関ヶ原でほめられた目標の並びを保つ。十件を一度に広げず、今の段から五件ずつ送る。
  goalsAllRows: true,
  goalsVisibleRows: 5,
  battleDialogue: true,   // 抜け駆けの咎め・寝返り・退き口の知らせを、音を消していても読める
  // 自害は台本の使番が知らせる。倒す処理から共通の「討ち取ったり」を重ねない。
  // 生前の吉継の名と、ほかの将の討取りはそのまま出す。
  hideNameTag: (u, rt) => !!rt?.flags.otaniDown && u === rt.flags.otaniU && !u.alive,
  foeMarks: true,
  // 描画の有無だけでは山や陣幕の向こうにも印が出る。名前と▼に同じ見通しを使う。
  botStat(rt) { const S = rt._k06Cut; return S ? `槍の段${S.on || 0}秒・侍が十四歩内${S.near || 0}秒・向けた${S.sent || 0}・侍・武将の刃${S.n}（うち侍${S.sam || 0}・受け流し${S.parry}・構え${S.block}・入った${S.hit}・止め${S.zero}・傷${Math.round(S.dmg)}）・一秒後［本人へ寄る${S.lKeep || 0}・四歩半内${S.lNear || 0}・待ちの列${S.lQ || 0}・替えた${S.lOther || 0}（4内${S.o4 || 0}・9内${S.o9 || 0}・14内${S.o14 || 0}）・狙い無し${S.lNone || 0}・死${S.lDead || 0}］・本人を狙う侍の秒［3内${S.h3 || 0}（振らず${S.hIdle || 0}＝よろめき${S.iSt || 0}・構え${S.iGu || 0}・間${S.iCd || 0}・向き${S.iFa || 0}・組み${S.iBi || 0}・他${S.iEl || 0}）・6内${S.h6 || 0}・10内${S.h10 || 0}・遠${S.h14 || 0}・止まり${S.hStill || 0}・列${S.hQ || 0}・例 ${S.hEx || ''}］` : ''; },
  enemySignVisible(rt, u) {
    if (!u.mesh || u.camHidden) return false;
    // 親の隊や描画の束を隠した時も、宙に敵の印だけを残さない。
    // 場面から外した体は visible が真のままでも描かれない。
    for (let part = u.mesh; part; part = part.parent) {
      if (part.visible === false) return false;
      if (part === rt.scene) return sightScreenUnit(rt, u);
    }
    return false;
  },
  foeMarkRange: 30,
  missionPinCaption: '',
  // 11/11 クラウドか：寝返りは十分半より後（FLIP_MIN_T）・⑨⑩で約五分かかる作りなので、共通の十八分では島津を受け切った直後に打ち切られた（act bot 1067秒で受け切り→余韻の途中1080秒で失敗）。二十三分まで認め、受け切った後の余韻は打ち切らない
  // 11/13 クラウドす K129（kaito 11/6「30分ほど遊べる大きさ」）：筋は 11/9 の手本の十五分のまま、寄り道や押し合いで長引いても三十五分までは打ち切らない（天王寺と同じ）
  // 11/15 クラウドさ K129：act bot 1324秒（約22分）で30分に八分足りない。段を足さず、④⑤⑧⑨⑩⑫の押し合いの最短・最長を伸ばした（下の定数）。打ち切りは四十分
  pacingCap: 2400,
  pacingWait: (rt) => !!rt.flags.won,
  // 戦の途中の保存（battle_checkpoint.js・kaito 11/8）：段の関数を順に流して段の始まりを作り直す（前の段の声・見出しは出さない）。
  //   ⑤の持久戦も保存する。⑨の前には寝返り（flip）を流しておく
  resumeSteps: [
    [1, function (rt) { this.stage1(rt); }], [2, function (rt) { rt.flags.kaniWait = false; this.stage2(rt); }], [3, function (rt) { this.stage3(rt); }], [4, function (rt) { this.stage4(rt); }],
    [5, function (rt) { this.stage5(rt); }], [6, function (rt) { this.stage6(rt); }], [7, function (rt) { this.stage7(rt); }], [8, function (rt) { this.stage8(rt); }],
    [9, function (rt) { this.otaniFall(rt); }], [10, function (rt) { this.westFall(rt, true); }], [11, function (rt) { this.sakonFall(rt, true); }], [12, function (rt) { this.stage12(rt, true); }],
  ],
  resumeAt: (rt, s) => ({ 2: NUKE, 3: NUKE, 4: BACK, 5: { x: UKITA_F.x + 20, z: UKITA_F.z + 10 }, 6: { x: UKITA_F.x + 20, z: UKITA_F.z + 10 }, 7: { x: TODO_P.x - 10, z: TODO_P.z }, 8: RLINE, 9: { x: HIRA.x + 30, z: HIRA.z - 30 }, 10: { x: SAKON_FRONT.x + 30, z: SAKON_FRONT.z + 20 }, 11: { x: HOLD5.x + 8, z: HOLD5.z + 6 }, 12: { x: SUTE1.x - 8, z: SUTE1.z - 40 } })[s] || null,
  horseHurtMul: 0.4,   // 11/8 critic60（一8）：馬がすぐ死んで④〜⑤を一人で歩いた。馬の傷を軽く
  // 行田市郷土博物館の合戦屏風解説・左隻四扇。ほかの戦の宇喜多旗へは遡らせない。
  flagEra: { ukita: 'sashi:字兒:#243e62:#ece6d6' },
  foeHit: 0.85,       // 宇喜多の先手に当たると三十秒で命が尽きた（critic60）。打ち込みを軽く
  // 11/11 見回り クラウドわ：構えずに受けた刃の床（騎馬・侍で命の六割）は foeHit を通らず、act bot が宇喜多の組の騎馬（侍の四割が馬に乗る共通の決まり）に
  //   一撃60を四度受けて436秒で倒れた。軽くする分を playerTaken へ移す（ふだんの打ち込みは .85×.6≒前の .5 のまま・床と上限は六割に）
  playerTaken: 0.6,
  // 11/19 クラウドさ（Opus）写真の目（120・300秒 874×402）：本人のそばの味方の隊旗（白・黒の幟と倒れかけた幟の板）が画面の上半分を縦・斜めに塞いだ→近い味方の隊旗は布と竿を隠す（杭瀬川・今福と同じ手）
  fadeCloseStandards: true,
  // 11/4 n2（AP12・AV15・BH6・AL）：行き先は頭上の金の▼一つだけ。字は添えない（10/23）
  goalSignOnly: true,
  goalSignBare: true,
  goalSignTriangle: true,   // 画面外でも▼の向きを保ち、行き先への矢印に替えない。
  // 11/6 BU：目標はいくつでもよい（九つ）。画面には今の五つ（hud_goals.js）。場所と行いだけで、討てる将の名は入れない
  goals5(rt) {
    const at = (q) => k06_sekigahara.missionPin(q);
    // 刻限を知らせない任務は、移動や押し合いが長引いても失敗にしない。
    return G.map((text, k) => ({ kind: 'stage', k, text, noun: NOUN[k], check: k === 11 ? (q) => !!q.flags.won
      : k === 6 ? (q) => !!q.flags.won || !!q.flags.turned || (q.flags.step || 0) > 8
      : (q) => !!q.flags.won || (q.flags.step || 0) > k + 1, place: at }));
  },
  closeCombatAssist: true,
  compactIntro: true,
  // 11/21 クラウド k06 持ち主（K491 kaito「始めからもう戦が始まっている。抜け駆け→福島が怒る→開戦の順に」）：
  //   布陣の塊は開戦から十秒で起こされ（fujin_wake.js）、①の霧の中で東西の大軍が先に斬り合っていた。
  //   ③で福島が宇喜多へかかるまで、表の塊は両軍とも持ち場で待たせる（抜け駆けの井伊の手・鉄砲衆・物見は表の外なので動く）。
  //   起こす数の時の伸びも福島の突っ込みから数え直す（③で一度に大勢が起きないように）
  //   武将に付けた塊（fujin_place.js の K466）も、①で井伊の手に付いて宇喜多の先手の前まで出て、①の間に東西の塊が百人余り斬り合っていた（描かず 63秒 101人）。同じく③まで待たせる
  // 11/21 クラウド k06 持ち主（K492 kaito「見渡すと敵が少なく見える」）：描かずの数え（_k06_k492.mjs）で、石田の後備え二つ（表の『石田 後備え』）が
  //   ③〜⑥で起こされて宇喜多の前の大軍の斬り合いに混ざり討ち尽くされ、⑩笹尾山の柵の段（1200秒近く）に敵の生きた数が 22〜60・⑪は 3〜40 だった。
  //   史実で石田の陣は最後まで崩れない。⑩までは笹尾山の麓の持ち場で待たせ（起こさない・付き従わせない）、⑩で柵の口の前へ打って出る（stage10）
  fujinWakeHold: (rt, g) => { const F = rt.flags; if (g && g._fujinRow === '石田 後備え' && (F.step ?? 0) < 10) return true; if ((F.step ?? 0) >= 3 && rt.t - (F.s3t ?? 0) >= 5) return false; F._fwT0 = rt.t; return true; },
  fujinFollowHold: (rt, g) => { const F = rt.flags; if (g && g._fujinRow === '石田 後備え' && (F.step ?? 0) < 10) return true; return !((F.step ?? 0) >= 3 && rt.t - (F.s3t ?? 0) >= 5); },
  prelude: false,      // 霧の中の会話が開戦の溜め。共通の溜め（十五秒）を重ねると、三十秒近く立ち尽くす（newbie60）
  introText: () => '慶長五年九月十五日の朝。霧の関ヶ原で、東西およそ十五万が向き合う。井伊直政の手に付き、天下分け目の口火を切る。',
  minutes: 15,
  spawn: { x: START.x, z: START.z, heading: -Math.PI / 2 },
  sides: { a: { name: '東軍', mon: 'tokugawa', faction: 'tokugawa' }, b: { name: '西軍', mon: 'ishida', faction: 'toyotomi' } },
  date: () => '慶長五年（1600）九月十五日　朝・霧　美濃国 関ヶ原',
  force(rt) {
    const F = rt.flags;
    // 下山を始めただけでは所属を替えない。兵数の棒も実際の寝返りの確定に合わせる。
    const turned = F.turned ? 15000 + (F.wakiT ? 1000 : 0) + (F.kutsukiT ? 2000 : 0) + (F.akazaT ? 1000 : 0) : 0;
    // 下山開始だけでは西軍は崩れない。大谷が倒れる⑨まで、膠着中と同じ損耗に留める。
    const k = [0, 0, 0, 0.02, 0.05, 0.05, 0.06, 0.07, 0.07, 0.6, 0.72, 0.85, 0.9][F.step || 0] || 0;
    // 動かない小早川・四家の一万九千を先に損耗へ入れず、寝返った人数は同数を移す。
    // 移籍後の人数に損耗率を掛けると、寝返るたび総数が増えてしまう。
    return { a: 75000 + turned - Math.round(75000 * k * 0.12) - (F.ak || 0) * 30, a0: 75000, b: Math.max(0, 82000 - Math.round(63000 * k) - turned - (F.ek || 0) * 30), b0: 82000 };
  },
  world: {
    chargeDust: true,   // 11/21 K467 k365-cloud-33：寄せる大勢の後ろに泥しぶきの霞（ぬかるみ・world_haze chargeCloud）
    autumn: true,   // 11/19 史実照らし（docs/reki_sky_1119.md）：旧暦九月＝太陽暦十月。枯れ色の草と色づく木
    noboriBand: 2, blockForm: true,   // 11/14 K292 クラウドせ 14:10：司令塔「塊ごとに同じ幟を10本以上・備を厚い四角に」で四人に一人→二人に一人・blockForm（units_group.js layout）。元：K292 クラウドさ：無名の足軽・鉄砲の四人に一人を高さのそろった幟に（関ヶ原も天王寺と同じ旗の帯・図鑑の絵）
    noFake: true,   // 11/13 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    seed: 1600,
    time: 'day',
    mood: 'morning',     // 朝霧の中で始まった戦
    // 11/19 K365 クラウド34（司令塔「長い戦の光の移り」）：辰の刻（朝八時）の開戦から未の刻（昼二時）の島津の退き口まで、戦はおよそ二十八分。
    //   日は東南東の低い所から南を回って南西へ（地図は北が -z・西が -x。共通の回りは北へ回る向きだった）、高さは十四度から三十五度ほどへ。
    //   毎コマ少しずつ（一秒に〇・〇五度）動かすので影はちらつかない。?sekisun=old で前
    ...(/[?&]sekisun=old/.test(globalThis.location?.search || '') ? {} : { sunDriftSign: -1, sunDriftRate: 0.0009, sunRiseRate: 0.03 }),
    // 11/14 K292 クラウドせ：霧が晴れた後（四十秒〜）も場面の霧の端が兵を描く遠さ（八十m）に縛られ、中景の旗の林が乳白に洗われていた。
    //   霧だけを空気の見通しへ離す（天王寺と同じ）。朝霧の晴れ（fog）・兵を描く遠さ・数は変えない
    clearAir: true, fogFar: 170,
    // 11/17 クラウド kaito2（cloud-07 の照らし直し「200秒の写真で大軍に見えない」）：霧が晴れた後も霞の端が百四十〜百七十m で、60m 先の宇喜多の兵と幟が乳白に洗われていた。
    //   霞の端の下限を 280m に（world_update.js clearAirFar。兵を描く遠さ・数は変えない＝重さは同じ）
    clearAirFar: 280,
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
    // 11/17 クラウド kaito2（cloud-19 の川の見直し）：幅4m・深さ1m では升目（groundHalf 650）に掘りが埋もれ、川筋のほぼ全部で水が 0〜0.3m しか無く、開戦の持ち場から川が見えなかった。升目が9m なので、岸を升目一つ外に取る幅9m・深さ2.5m に
    streams: [{ pts: FUJI_RIVER, w: 9, depth: 2.5 }],
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
    const s = F.step || 1, P = rt.player.u.pos;
    // 討てない大将を追わず、今の段で押し合う相手の手前へ案内する（遠い残兵は追わせない）
    const T = s === 1 || s === 2 ? NUKE : s === 3 ? BACK : s === 4 ? ((G4) => front(P, UKITA_F, 60, F.akashi, F.akaGun, F.ukita2, G4[G4.length - 1], G4[G4.length - 2]))(F.qs4?.groups || [])   // 11/19 05:50 クラウド k06 持ち主：打って出た明石の槍の手（qs4）も印の相手に入れる（act bot 0538：160秒 印に着いて六秒なにも起きず★★）
      : s === 5 ? (near(P, UKITA_F, 50) ? front(P, UKITA_F, 45, F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4) : UKITA_F)
      : s === 6 ? RLINE
      // 11/18 16:50 クラウド k06 持ち主：⑦で陣から打って出た平塚・戸田の新手（qs7）を印が数えず、本人は空の陣前に立ったまま討ち取り5（act bot 1621）。新しい二手も印の相手に入れる
      : s === 7 ? (near(P, RLINE, 34) ? ((G7) => front(P, RLINE, 30, F.otani, F.otaW1, F.otaW2, G7[G7.length - 1], G7[G7.length - 2]))(F.qs7?.groups || []) : RLINE)
      // 11/18 16:20 クラウド k06 持ち主：⑧で陣前の三十歩内に大谷方が残らず、印が空の陣前に立ち本人が百九十秒討ち取り0（act bot 1607：675〜820秒 速0）。九十歩まで大谷方を探して押し崩しへ導く
      : s === 8 ? (near(P, RLINE, 80) ? ((q8) => q8 === RLINE ? front(P, RLINE, 90, F.otani, F.otaW1, F.otaW2) : q8)(front(P, RLINE, 30, F.otani, F.otaW1, F.otaW2)) : RLINE)
      // 11/18 クラウド k06 持ち主：殿が味方に押されて麓の五十歩の外へ散ると、印が空の麓に立ち、着いても六秒なにも起きなかった（act bot 869秒）。八十歩まで敵を探す
      : s === 9 ? (near(P, CENTER9, 60) ? front9(P, F) : CENTER9)
      // 柵内の鉄砲衆を行き先にすると、柵沿いを追い続けて押し合いの持ち場から外れる。
      : s === 10 ? SAKON_FRONT : s === 12 ? (F.sute2 ? SUTE2 : SUTE1) : HOLD5;
    q.x = T.x; q.z = T.z; q.label = PLACE[s - 1];
    // 11/18 21:00 クラウド k06 持ち主：⑪で島津を追って陣場野の本陣の北 (-87,-106) へ出た本人が、⑫の印（南の捨て奸）へ真っすぐ歩くと
    //   家康の床几と旗本の輪に当たって進めなかった（act bot 1527秒 ★★）。本陣の北にいる間は、印を本陣の東の脇へ一度立てて回らせる
    //   印のある側（⑫＝東・⑪の受け所＝西）の脇を通す
    if ((s === 11 || s === 12) && F.jinba && T.z > IEYASU1.z + 10 && near(P, IEYASU1, 26) && P.z < IEYASU1.z + 4) {
      const sd = T.x >= IEYASU1.x ? 1 : -1;
      // 11/18 21:55 クラウド k06 持ち主：本人が陣場野の幕（中心 IEYASU1.z−2・幅16・奥12）の内にいると、東の脇の印へ歩いて幕の東の壁 x−77 に当たり
      //   九百秒立ち尽くした（act bot 2122 ⑫ 時切れ・描かずに (−80,−100) へ置いて再現）。幕の内にいる間は南の口（幅6）の外へ印を立てて出す
      const cz = IEYASU1.z - 2;
      if (Math.abs(P.x - IEYASU1.x) < 9 && Math.abs(P.z - cz) < 7) { q.x = IEYASU1.x; q.z = cz + 10; }
      else if ((P.x - IEYASU1.x) * sd < 9) { q.x = IEYASU1.x + 18 * sd; q.z = IEYASU1.z + 2; }
    }
    // 11/18 クラウド k06 持ち主：⑦⑧で印が大谷勢の一番近い兵の足元に立ち、藤堂・京極の列の向こうで百八十秒16m より近づけなかった（act bot 580秒）。
    //   印は敵の兵の六歩手前（本人の側）に立てる。押し合いの列の前に立てば着いた事になる
    if ((s === 7 || s === 8) && T !== RLINE) { const d = Math.hypot(P.x - T.x, P.z - T.z); if (d > 6) { q.x = T.x + (P.x - T.x) * 6 / d; q.z = T.z + (P.z - T.z) * 6 / d; } }
    return q;
  },

  setup(rt) {
    // 11/18 クラウド kaito2 K365：段替わりの中央の青い札（右上の任務と同じ字）と中央の声が上の端で行き先の札と重なっていた（act bot 874×402・50回）。
    //   青い札は出さず、中央の声の間は行き先の字の札を薄くする（天王寺・岡山と同じ扱い）
    if (typeof document !== 'undefined' && !document.getElementById('k06-cc-style')) {
      const st = document.createElement('style'); st.id = 'k06-cc-style';
      st.textContent = `html:root body #hud:has(#h-prog[data-battle="k06_sekigahara"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="k06_sekigahara"]):has(#center-call .cc:not(.blue)) #goal-sign .gs-tag { opacity:0 !important; }`;
      document.head.appendChild(st);
    }
    // 11/19 クラウド k06 持ち主：act bot 1689秒・討ち取り95で受けた傷が 鉄砲40・足軽20・侍0・武将0（ひとこと「簡単すぎる・もっと強い奴と」）。
    //   侍・武将の刃は受け流しと構えで止まっていた。腕の立つ者は同じ手を続けて食わない：同じ侍・武将の刃を受け流した後の六秒は、
    //   その者の次の刃は受け流せず構えで受ける（気力が減り浅い傷・構えが崩れればそのまま入る）。敵の数・強さ・一太刀の重さは変えない。
    { const P = rt.player, td = P.takeDamage, S = rt._k06Cut = { n: 0, parry: 0, block: 0, hit: 0, zero: 0, dmg: 0 };
      P.takeDamage = function (a, s) {
        if (!s || s.isStruct || (s.type !== 'samurai' && s.type !== 'busho') || this.u.hitKind === 'gun' || this.u.hitKind === 'arrow') return td.call(this, a, s);
        const p0 = rt.stats.parries || 0, b0 = rt.stats.blocks || 0, g0 = this.guardT, noParry = (s._k06ParT || 0) > rt.t && this.guard;
        if (noParry) this.guardT = Math.max(g0 || 0, 9);
        const d = td.call(this, a, s);
        if (noParry && this.guardT === 9) this.guardT = g0;
        S.n++; S.dmg += d || 0; if (s.type === 'samurai') S.sam = (S.sam || 0) + 1;
        if ((rt.stats.parries || 0) > p0) { S.parry++; s._k06ParT = rt.t + 6; } else if ((rt.stats.blocks || 0) > b0) S.block++; else if (d > 0) S.hit++; else S.zero++;
        return d;
      };
    }
    timeslipField(rt);   // 身の回りの踏み荒らした地面・倒れた槍と旗・季節の草（def.timeslip）
    // 11/11 見回り：段が変わる時の中央の青い札は右上の任務と同じ字で、任務の札と合わせて画面の47%を食っていた。
    // 青い札は出さず、残る中央の知らせは任務の札の左の細い帯（上の方）に置く（天王寺岡山・本能寺と同じ）。この戦だけに効かせる。
    if (typeof document !== 'undefined' && !document.getElementById('k06-cc-style')) {
      const st = document.createElement('style'); st.id = 'k06-cc-style';
      st.textContent = `
html:root body #hud:has(#h-prog[data-battle="k06_sekigahara"]) #center-call { left:30vw; right:auto; top:calc(48px + env(safe-area-inset-top,0px)); width:32vw; }
html:root body #hud:has(#h-prog[data-battle="k06_sekigahara"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="k06_sekigahara"]) #center-call .cc { max-width:100%; box-sizing:border-box; padding:4px 6px; font-size:16px; line-height:1.35; letter-spacing:0; }`;
      document.head.appendChild(st);
    }
    const F = rt.flags, W = rt.world;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    // 本陣の幕と旗。幕の中には必ず大将と旗本が座る（AV18）。家康の陣場野の幕は本陣が移ってから張る
    // 11/5：金扇の大馬印は家康だけ（三成・秀家の陣に同じ金扇を立てない）。家康の馬印は本陣が陣場野へ進む時に共に動く（umaFollow）
    const seatI = camp(rt, IEYASU0.x + 4, IEYASU0.z, 'tokugawa', { wall: false });
    const seatM = camp(rt, SASAO.x - 4, SASAO.z - 2, 'ishida');
    const seatU = camp(rt, UKITA_H.x - 4, UKITA_H.z, 'ukita');
    const seatO = camp(rt, OTANI.x, OTANI.z, 'otani', { w: 12, d: 10 });
    // 11/20 クラウド35（K474「進んだ先で敵が陣を敷いているのが見える」）：西軍で幕を張っていたのは石田・宇喜多・大谷だけで、
    //   小西（北天満山）・島津（小池村）・小早川（松尾山）は幟と兵だけだった。各陣の後ろに家紋の幕と篝火、三成の本陣の後ろに陣小屋（見た目だけ・当たり無し）。
    //   手本：『関ヶ原合戦図屏風』（大阪歴史博物館蔵）の西軍の各陣の幕
    try {
      for (const [P, mon] of [[KONISHI, 'konishi'], [SHIMAZU, 'shimazu'], [MATSUO, 'kobayakawa']]) enemyJin(rt, { mon, facing: Math.PI / 2, pts: [{ x: P.x, z: P.z, big: true }] });
      enemyJin(rt, { mon: 'ishida', facing: Math.PI / 2, honjin: { x: SASAO.x - 4, z: SASAO.z - 2 }, hutName: '石田の陣小屋' });
    } catch (e) { console.warn(e); }
    // 笹尾山の麓の柵（石田の陣の前の柵。口を一つ空け、左近の兵がそこを守る）。柵は抜けられない（越えるのは口から）
    F.fence = wallLine(rt, FENCE, { team: 1, hp: 900, gaps: [5, 6], name: '柵' });
    for (const [x, z, f] of [[SASAO.x + 14, SASAO.z + 10, 'ishida'], [SAKON.x - 6, SAKON.z - 10, 'ishida'], [KONISHI.x + 8, KONISHI.z + 6, 'konishi'], [UKITA_F.x - 10, UKITA_F.z + 8, 'ukita'], [UKITA_H.x + 18, UKITA_H.z - 8, 'ukita'],
      [FUKU.x + 8, FUKU.z + 14, 'mizuno'], [-230, -18, 'kanamori'], [KATO_P.x + 6, KATO_P.z + 8, 'sagarifuji'], [START.x - 8, START.z + 6, 'ii'], [KURODA.x + 4, KURODA.z + 8, 'kuroda'], [HOSOKAWA.x, HOSOKAWA.z + 8, 'kuyo'], [TODO_P.x + 6, TODO_P.z + 8, 'todo'],
      [OTANI.x + 10, OTANI.z - 8, 'otani'], [MATSUO.x + 10, MATSUO.z - 10, KOBA.flag], [WAKI_P.x + 6, WAKI_P.z - 6, 'wakisaka'], [IEYASU0.x - 8, IEYASU0.z - 6, 'onri'], [IEYASU0.x + 14, IEYASU0.z + 8, 'tokugawa'], [HONDA.x + 4, HONDA.z + 6, 'honda']]) rt.scene.add(nobori(W, x, z, f));
    // ---- 兵：戦う所の兵は本物。各家の陣跡に、その家の旗と具足で置く ----
    // 東軍：井伊・松平（主人公が付く。鉄砲衆を引き連れる）・福島・家康の本陣（桃配山）・本多・藤堂と京極・加藤と田中
    // 11/9 重さ：始まりの本物の兵が 296 で枠（250）を大きく越えたので、名の無い兵を少し減らした（厚みは遠くの大軍で見せる）
    // 11/20 k365-cloud-42（kaito_now ③「主人公が一人にならない」）：井伊の手と鉄砲衆は本人の後ろでなく、本人の行く先（宇喜多の先手前）側の十余歩前の左右に構える
    //   （本人の後ろの陣では、駆け出す本人の背のカメラに一人も映らなかった。福島の後ろ・南という布陣図の場所の内）
    const toN = Math.hypot(NUKE.x - START.x, NUKE.z - START.z) || 1, dN = { x: (NUKE.x - START.x) / toN, z: (NUKE.z - START.z) / toN };
    const iiAt = (fwd, lat) => ({ x: START.x + dN.x * fwd - dN.z * lat, z: START.z + dN.z * fwd + dN.x * lat });
    F.ii = ally(rt, '井伊直政の手', iiAt(16, -8), [
      // 島津を追う前に共通の手傷で退場させない。直政の負傷は退き口の台本で解く。
      { type: 'busho', n: 1, o: { name: '井伊直政', invuln: true, mustLive: true, onWound: keepCommander, horse: true } }, { type: 'busho', n: 1, o: { name: '松平忠吉', invuln: true, mustLive: true, onWound: keepCommander, horse: true, flag: 'tokugawa', armor: TK } },
      { type: 'samurai', n: 8 }, { type: 'cavalry', n: 4 }, { type: 'ashigaru', n: 9 }], II, { fullStrength: true, formation: 'yari' });
    F.iiGun = ally(rt, '井伊の鉄砲衆', iiAt(12, 8), [{ type: 'gun', n: 14 }], II, { fullStrength: true, width: 16, aggro: 10, seekRange: 12 });
    F.fuku = ally(rt, '福島正則の隊', FUKU, [
      { type: 'busho', n: 1, o: { name: '福島正則', invuln: true, horse: true } }, { type: 'samurai', n: 1, o: { name: '可児才蔵', invuln: true, horse: false } },
      { type: 'samurai', n: 7 }, { type: 'gun', n: 8 }, { type: 'ashigaru', n: 16 }], FUKUSHIMA, { fullStrength: true, order: 'hold', formation: 'yari', width: 20, facing: -Math.PI / 2 });
    F.ieyasu = ally(rt, '徳川家康の本陣', seatI, [
      { type: 'busho', n: 1, o: { name: '徳川家康', invuln: true, horse: false } }, { type: 'samurai', n: 8 }, { type: 'gun', n: 3 }], TOKU, { fullStrength: true, order: 'hold', aggro: 6, seekRange: 10, facing: -Math.PI / 2 - 0.4, width: 8, spacing: 3.2 });   // 旗本の侍に囲まれ床几に座る（11/18 ト四：円陣の半径は spacing で決まる＝広げて床几の一点に重ならせない）（O・AR3）
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
    // 11/19 cloud-10 act bot 313秒：討てない明石が三秒ごとに本人へ二割ずつ打ち込み二十五秒で倒れた→本人への一太刀は一割まで（playerHitCap）
    // 宇喜多の先手（明石全登）。霧の中、はじめから福島の前に槍衾を組んで構える。手傷の退場を止め、明石は先手と共に退く。
    F.akashi = foe(rt, '明石全登の隊', UKITA_F, [{ type: 'busho', n: 1, o: { name: '明石全登', horse: true, invuln: true, mustLive: true, playerHitCap: 0.1, onWound: () => {} } }, { type: 'samurai', n: 6 }, { type: 'bow', n: 4 }, { type: 'ashigaru', n: 16 }], UKITA, { morale: 90, width: 22, noRout: true, order: 'hold', aggro: 10, seekRange: 14, formation: 'yari' });
    F.akaGun = foe(rt, '宇喜多の先手の鉄砲', { x: UKITA_F.x + 6, z: UKITA_F.z - 4 }, [{ type: 'gun', n: 6 }], UKITA, { order: 'hold', aggro: 16, seekRange: 20, width: 14 });
    F.akashiU = F.akashi.leader;
    // 生存の指定だけでは通常の被害で討たれる。明石と同じく、西軍崩壊後の退却まで残す。
    F.konishi = foe(rt, '小西行長の隊', KONISHI, [{ type: 'busho', n: 1, o: { name: '小西行長', invuln: true, mustLive: true, onWound: keepCommander, horse: true } }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 6 }], KONI, { order: 'hold', aggro: 10, seekRange: 14, formation: 'yari' });
    // 小西は北天満山に留まる：宇喜多の先手が崩れると共通の加勢（army_relief）が小西を前へ押し出し、⑥で主人公の退き道（宇喜多先手前→藤堂・京極）を塞いで倒していた（11/10 クラウドか）
    F.konishi.stay = true;
    F.mitsu = foe(rt, '石田三成の本陣', seatM, [{ type: 'busho', n: 1, o: { name: '石田三成', invuln: true, horse: false } }, { type: 'samurai', n: 4 }], ISHIDA, { order: 'hold', aggro: 0, seekRange: 0, width: 5, noRout: true, facing: Math.PI / 2 });
    F.mitsuU = SEAT(F.mitsu, '石田三成');
    // 大谷吉継：病の吉継は四方輿に乗る（馬に乗らない）。藤川台の本陣で輿の床に座り、前で平塚為広・戸田勝成が藤堂・京極と押し合う
    F.koshi = shihoKoshi(W, seatO.x, seatO.z, 0); rt.scene.add(F.koshi);
    F.otaniH = foe(rt, '大谷吉継の本陣', seatO, [{ type: 'busho', n: 1, o: { name: '大谷吉継', invuln: true, horse: false } }, { type: 'samurai', n: 4 }], OTANI_LK, { order: 'hold', aggro: 0, seekRange: 0, noRout: true, width: 5, facing: Math.PI * 0.3 });
    F.otaniU = SEAT(F.otaniH, '大谷吉継');
    // 二将の最期は寝返りの台本で扱う。共通の手傷による退場・討取りで、寝返り前の持ち場を省かない。
    // 斬られた時は持ち場に残ったまま馬上で仰け反る（空の onWound で傷が付かないように見えていた・11/11 クラウドわ）
    const reel = function () { this.hit = { kind: 'recoil', t: 0, dur: 0.6, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'thrust' }; this.lastHit = this.hit; this.stagger = Math.max(this.stagger || 0, 0.5); };
    // 共通の帰陣判断と前進の下知を競合させない。持ち場での応戦は兵一人ずつの判断で続く。
    F.otani = foe(rt, '平塚為広・戸田勝成の隊', HIRA, [{ type: 'busho', n: 1, o: { name: '平塚為広', invuln: true, mustLive: true, onWound: reel, horse: true } }, { type: 'busho', n: 1, o: { name: '戸田勝成', invuln: true, mustLive: true, onWound: reel, horse: true } },
      { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], OTANI_LK, { order: 'hold', aggro: 12, seekRange: 16, noRout: true, facing: -Math.PI * 0.3, noAI: true, historicalOrders: true, stay: true });
    for (const g of [F.todo, F.otani]) { g.dmgMult = 0.35; g.defMult = 1.4; }   // 藤堂・京極と平塚・戸田は朝から押し合う（寝返りまで決着しない）
    F.kobaE = foe(rt, '小早川秀秋の隊', MATSUO, [{ type: 'busho', n: 1, o: { name: '小早川秀秋', invuln: true, horse: true } }, { type: 'busho', n: 1, o: { name: '平岡頼勝', invuln: true, horse: true } }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 4 }], KOBA, { order: 'hold', aggro: 0, seekRange: 0, facing: -Math.PI * 0.8, noRout: true, formation: 'yari' });
    F.wakiE = foe(rt, '脇坂安治らの隊', WAKI_P, [{ type: 'busho', n: 1, o: { name: '脇坂安治', invuln: true, horse: true } }, { type: 'ashigaru', n: 5 }], WAKI, { order: 'hold', aggro: 0, seekRange: 0, facing: -Math.PI * 0.7, noRout: true, formation: 'yari' });
    // 寝返りの下知までは陣に残す。討死を防ぐ指定だけでは共通の手傷で先に退場してしまう。
    for (const g of [F.kobaE, F.wakiE]) for (const u of g.units) if (u.type === 'busho') {
      u.mustLive = true; u.onWound = keepCommander;
    }
    for (const g of [F.kobaE, F.wakiE, F.hide, F.mitsu, F.otaniH]) g.noFrontline = true;
    jindate.install(rt, { UKITA_H, UKITA_F, KONISHI, SASAO, SAKON, KURODA, HOSOKAWA, KATO_P, IEYASU0, IEYASU1, HONDA, TODO_P, MATSUO, WAKI_P, OTANI, HIRA, FUKU, START, HOLD5, SHIMAZU });
    // 戦の前の会話（霧の中の対陣）
    rt.after(0.5, () => rt.say('井伊直政', '霧が深い。先陣は福島殿と決まっておる。だが徳川の手で口火を切らねば、豊臣の家の戦で終わる', 5));
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
    // 11/18 クラウド kaito2 K365：馬の本人が四十五秒で宇喜多の先手前へ着いても、井伊の手は歩きで遅れ、874×402 の写真で本人の40m 内の味方が12人・前が草原だけだった。
    //   抜け駆けの井伊の手は小走りで本人に付いて出る（着いた後は元の速さ）
    for (const g of [F.ii, F.iiGun]) if (alive(g)) { const sp = g.speed; g.speed = Math.max(sp || 0, 4.4); rt.after(70, () => { if (alive(g) && g.speed === 4.4) g.speed = sp; }); }
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
    // 鉄砲衆が六度撃ちかける（六秒半おき・約四十秒の撃ち合い）。撃つたびに先手が揺らぎ、宇喜多の鉄砲が撃ち返す
    //   11/13 クラウドさ K126：三度で十六秒の段は「三十秒ごとに次々終わる」の元。一つの段を濃く長く
    const shot = () => {
      if (F.step !== 2 || F.ending) return;
      F.vol++;
      // 11/18 cloud-31：音だけの一斉射だった（三十五秒に本物の発砲6）。音に合わせ、込め終えた鉄砲兵が揃って本当に撃つ（筒先の火・硝煙・弾）
      salvo(rt, F.iiGun, [F.akashi, F.akaGun], 5);
      if (F.vol === 2 || F.vol === 4) rt.after(1.2, () => salvo(rt, F.akaGun, [F.iiGun, F.ii], 4));
      rt.army.play('volley', { x: NUKE.x - 4, z: NUKE.z + 2 }, 1.6);
      if (alive(F.akashi)) F.akashi.morale = Math.max(40, F.akashi.morale - 6);
      if (F.vol === 1) { sfx('horagai', 1); rt.banner('関ヶ原の戦い　開戦'); rt.say('井伊直政', '放てっ！　徳川の戦の始まりじゃ！', 3); }
      if (F.vol === 2) { rt.army.play('volley', { x: UKITA_F.x + 6, z: UKITA_F.z - 4 }, 1.2); rt.say('明石全登', '抜け駆けの鉄砲か。撃ち返せ！', 3); }   // 先手の鉄砲は構えた所から撃ち返す（打って出ない）
      if (F.vol === 4) { rt.army.play('volley', { x: UKITA_F.x + 6, z: UKITA_F.z - 4 }, 1.2); rt.say('井伊直政', '怯むな。撃ち続けよ！', 2.6); }
      if (F.vol === 6) rt.say('明石全登', '井伊の赤備えか。槍を揃えよ、出るぞ！', 3);
      if (F.vol === 1 || F.vol === 3) this.raid2(rt, F.vol === 1 ? 1 : 2);
      if (F.vol < 6) rt.after(6.5, shot);
    };
    rt.after(1.5, shot);
  },
  // ② の小競り合い：11/18 19:45 クラウド k06 持ち主：act bot 1658秒で段2「鉄砲衆を守る」の四十秒に討ち取り0・守る相手が来ない。
  //   撃ちかけの一度目と三度目に、宇喜多の先手から物見の小勢（侍二・足軽六）が鉄砲衆の脇へ斬り込む（抜け駆けの鉄砲へ先手が撃ち返し、物見が出て小競り合い＝K306 の段）。
  //   本人が鉄砲衆の三十六歩内にいる時だけ。本人へは浅く。段3 で井伊が退く時に物見も退く
  raid2(rt, n) {
    const F = rt.flags, P = rt.player.u.pos;
    if (F.step !== 2 || F.ending || !near(P, NUKE, 36)) return;
    room(rt, 8);
    // 本人（鉄砲衆の脇）の前（宇喜多の側）十八歩・左右十歩に置く。近くに急に湧かせない決まり（K153）で兵は七十歩ほど奥から駆けて来るので、一度目から出す（三度目・五度目では着くまで二十秒かかり、段の終わりに間に合わなかった＝描かずの見張り）
    const c0 = P;
    const dx = UKITA_F.x - c0.x, dz = UKITA_F.z - c0.z, L = Math.hypot(dx, dz) || 1, sd = n === 1 ? 10 : -10;
    const at = { x: c0.x + dx / L * 18 - dz / L * sd, z: c0.z + dz / L * 18 + dx / L * sd };
    const g = foe(rt, '宇喜多の物見', at, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], UKITA, { morale: 85, aggro: 24, seekRange: 30, width: 8 });
    if (!g) return;
    g.dmgMult = 0.6; g.dmgMultPlayer = 0.3;
    // 11/18 23:10 クラウド k06 持ち主：物見は七十歩を歩いて二十秒かかり（一度目は79秒に着く）、着いて四秒で崩れて退き、段2 の討ち取りが act bot 6回とも0（描かずの足跡 59〜100秒）。
    //   物見は駆けて来て（斬り込みの足）、段3 で退くまでは崩れない（段3 の rout で退く）
    g.speed = Math.max(g.speed || 0, 5.2); g.noRout = true; g.morale = 100;
    goAttack(g, { x: P.x, z: P.z }, 24, 30);
    (F.raid2 || (F.raid2 = [])).push(g);
    rt.say('宇喜多の兵', ['鉄砲を黙らせよ！　筒先へ斬り込め！', 'もう一度じゃ、赤備えの鉄砲を崩せ！'][n - 1], 3);
  },
  // ③ 井伊の手が一旦退く。抜け駆けに怒った福島正則が宇喜多の先手へ突っ込む
  stage3(rt) {
    const F = rt.flags;
    if (F.step >= 3) return;
    F.step = 3; F.s3t = rt.t;
    for (const g of F.raid2 || []) if (alive(g)) rout(g);
    this.ally10Back(rt);
    rt.objDone('main');
    rt.obj('main', G[2], 'main');
    rt.say('井伊直政', '口火は切った。退け、福島殿に道を空けよ！', 3);
    goTo(F.ii, { x: BACK.x + 4, z: BACK.z - 10 });
    goTo(F.iiGun, { x: BACK.x + 6, z: BACK.z + 4 });
    rt.after(3.5, () => rt.say('福島正則', '抜け駆けされたか！　ええい、福島の者ども、宇喜多へかかれぇっ！', 3.5));
    rt.after(5, () => {
      goAttack(F.fuku, { x: UKITA_F.x + 18, z: UKITA_F.z + 6 }, 40, 60);
      // 11/18 夜50-20：描かずの通しで福島の隊が③〜⑤の間に三十四人→四人まで溶け、⑤「福島隊のそばで」の野に本人一人だった（200秒の写真 ✕）。
      //   福島の六千は押されても崩れていない（史実）。受ける傷を半分強に抑え、⑤の終わりまで隊の厚みを残す
      if (alive(F.fuku)) F.fuku.defMult = 1.8;
      // 11/11 クラウドへ：明石がすぐ六十歩追うと、退く井伊の足軽が (-278,44) で組み付かれ move のまま二十秒止まった（act bot 九回）。
      //   明石は福島の隊が四十五歩へ寄るまで（遅くとも三十秒）自分の列で待ち、井伊の手が退く間を空ける
      if (F.step === 3) F.akaWait = true; else if (F.step === 4 && alive(F.akashi)) { F.akashi.order = 'attack'; F.akashi.aggro = 40; F.akashi.seekRange = 60; }
    });
    rt.after(30, () => goAttack(F.todo, { x: HIRA.x + 14, z: HIRA.z }, 30, 40));
    // 11/13 クラウドか K127：退く井伊の手が (-290,30) で明石の兵に組み付かれ、move のまま二十秒止まった（act bot 132秒・17回）。
    //   八秒で退ききれない時は、その場で槍を合わせる（行き先があるのに止まる兵を作らない）
    rt.after(8, () => {
      if (F.step !== 3) return;
      for (const g of [F.ii, F.iiGun]) if (alive(g) && g.order === 'move' && !near(g.center(), BACK, 16)) { g.order = 'attack'; g.aggro = 14; g.seekRange = 24; g.onArrive = null; }
    });
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
    rt.marker('foe', () => this.missionPin(rt), '宇喜多先手前', { red: true });
    rt.say('井伊直政', '福島殿が当たった。我らも横から押せ！', 3);
    rt.after(8, () => rt.say('明石全登', '宇喜多の槍は一万七千。押し返せ、福島を川まで追え！', 3.5));
  },
  // ⑤ 宇喜多は数が多く正面に強い。福島隊が押し返される中、そばで持ちこたえる（11/9 kaito：前半は東軍が押し切れない）
  stage5(rt) {
    const F = rt.flags;
    if (F.step >= 5) return;
    F.step = 5; F.s5t = rt.t; F.held5 = 0;
    rt.after(2, () => { if (rt.flags.step === 5) sekiCharge(rt); });   // K467：宇喜多の反撃が一度に来る
    rt.objDone('main'); rt.obj('main', G[4], 'main');
    rt.say('福島正則', '押せ押せ！　宇喜多を天満山へ追い返せ！', 3);
    // 宇喜多の本隊から新手が出て、福島隊を押し返す（明石の先手は崩れない）
    room(rt, 34);
    F.ukita3 = foe(rt, '宇喜多の本隊', { x: UKITA_H.x + 50, z: UKITA_H.z + 6 }, [{ type: 'samurai', n: 5 }, { type: 'gun', n: 6 }, { type: 'bow', n: 3 }, { type: 'ashigaru', n: 14 }], UKITA, { morale: 95, noRout: true });
    { const PP = rt.player.u.pos; goAttack(F.ukita3, { x: PP.x - 14, z: PP.z + 3 }, 40, 70); }   // ホ五 11/18：段4〜6で本人の討ち取り1だった。新手は福島の列でなく本人の槍の届く所へ来る
    for (const g of [F.akashi, F.ukita2, F.ukita3]) if (alive(g)) { g.noRout = true; g.morale = 100; }
    // 福島隊は押し戻される。11/13 K127 クラウドか：春日神社の前まで六十歩を 'move' で戻すと、宇喜多の中を抜けられず、敵の2〜4m で二十秒立ち尽くした（act bot 383秒・28回）。
    //   槍を合わせたまま、今の所から神社の方へ三割だけ下がる（押し戻される形）
    if (alive(F.fuku)) { const g = F.fuku, c = g.center(); g.dmgMult = 0.5; g.order = 'attack'; g.dest = null; g.path = null; g.onArrive = null; g.focus = null; g.anchor = { x: c.x + (FUKU.x - c.x) * 0.3, z: c.z + (FUKU.z - c.z) * 0.3 }; g.aggro = 10; g.seekRange = 28; }   // 11/19 cloud-10 act bot 367秒：十六歩では二十六歩前の明石の隊へ寄らず、下がった持ち場で侍が二十秒立ち尽くした→二十八歩
    rt.after(3, () => rt.say('使番', '天満山から宇喜多の新手！', 3));
    rt.after(12, () => rt.say('使番', '宇喜多勢、崩れませぬ！', 3));
    rt.after(26, () => rt.say('使番', '黒田・細川の手、石田の大筒に押されております！　島左近が打って出た由！', 4));
    rt.after(40, () => rt.say('使番', '南宮山の毛利勢、なお動かず！', 3));
    rt.after(19, () => { if (!F.ending) rt.say('足軽', '退け！　いや進め！　霧で旗が見えぬ！', 3); });   // ホ五 11/18：乱戦の短い叫び（大乱関ヶ原6巻 第35話）
    rt.after(33, () => { if (!F.ending) rt.say('足軽', 'はぐれた！　あれは味方か！', 3); });
    rt.after(46, () => { if (!F.ending) rt.say('使番', '黒田殿、竹中の案内で尾根の間道へ回り込む由！', 3.4); });   // ホ五 11/18：大乱関ヶ原6巻 第36話（竹中重門の領内の間道から黒田が横を突く）
    // 11/17 K355 クラウド k365-cloud-42（大乱関ヶ原の読み書き「⑨島津の前に、動かず見ている姿を一度」・『惟新公御自記』ほかの伝え：石田の使いが馬上で加勢を求め、島津は追い返した）。最後の退き口の前置き
    rt.after(52, () => { if (!F.ending) rt.say('使番', '島津の陣、石田の使いを追い返し、一兵も出さずに見ておる由', 3.6); });
  },
  // ⑥ 福島隊が持ち直す。主人公は中央右翼（藤堂・京極）の救援へ回る。左に石田、右に大谷、山に小早川が見える道
  stage6(rt) {
    const F = rt.flags;
    if (F.step >= 6) return;
    F.step = 6; F.s6t = rt.t;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('宇喜多の押し返しを持ちこたえた'), '宇喜多の押し返しを持ちこたえた');
    rt.say('福島正則', 'まだまだ！　福島の槍、退きはせぬぞ！', 3);
    // 11/11 クラウドか：⑤で主人公が持ちこたえる所（宇喜多先手前）に宇喜多の三つの隊と福島隊が寄り合い、主人公が囲まれて右翼へ抜けられず倒れた（act bot：330秒〜582秒 (-301〜-332,38〜71) で囲まれ騎馬に討たれる）。
    //   押し合いの場を西の天満山側へ二十歩ずらし、主人公の南東（右翼への道）を空ける
    //   11/11 クラウドへ：福島の行き先が宇喜多の退いた所（-26）の二十二歩手前で、着いた後に鉄砲・足軽が二十秒余り立ち尽くした（act bot 23回）→宇喜多の八歩手前まで押し出す
    if (alive(F.fuku)) { F.fuku.dmgMult = 1; goAttack(F.fuku, { x: UKITA_F.x - 12, z: UKITA_F.z - 2 }, 30, 40); }
    if (alive(F.fukuB)) goAttack(F.fukuB, { x: UKITA_F.x - 10, z: UKITA_F.z + 12 }, 30, 40);   // 夜50-20：後備も福島の本隊の脇で押し出す   // 11/17 ト四：後ろの足軽が前の列に塞がれ (-319,55) で行き先 (-337,52) へ二十秒止まった（act bot 421秒・9回）→行き先を六歩手前へ
    // 宇喜多の先手はその場で踏みとどまる（崩れるのは寝返りの後）
    // 11/18 クラウド（k06 持ち主）：五つの手を同じ一点へ寄せていたので、着いた手に後ろの手が塞がれ、明石の侍が行き先の手前で二十秒止まった（受け持ちの流し）。
    //   宇喜多の陣（天満山の麓）に沿って、先手・鉄砲・二の手・三の手・四の手を横と奥へ並べて踏みとどまらせる
    const UK_HOLD = [[-26, -4], [-38, -18], [-30, 10], [-44, 22], [-46, -30]];
    // ④⑤で打って出た明石の槍の手も宇喜多の陣の前へ戻って踏みとどまる（本人を右翼まで追わない）
    [...(F.qs4?.groups || []), ...(F.qs5?.groups || [])].forEach((g, i) => { if (alive(g)) { goTo(g, { x: UKITA_F.x - 34, z: UKITA_F.z - 8 + (i % 3) * 12 }); g.aggro = 10; g.seekRange = 14; } });
    [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4].forEach((g, i) => { if (alive(g)) { goTo(g, { x: UKITA_F.x + UK_HOLD[i][0], z: UKITA_F.z + UK_HOLD[i][1] }); g.aggro = 10; g.seekRange = 14; } });
    // 11/19 07:10 クラウド k06 持ち主：布陣の塊「宇喜多の二の備 左の手・中の手」が右翼へ回る井伊の手に一〜九歩で付いて来て、井伊の騎馬が (-267,101) 辺りで二十秒余り歩けなかった（act bot 0653 ★★・描かずの足跡 350〜387秒 井伊の手の真ん中が一秒一歩）。
    //   名の無い宇喜多の塊も今いる所で構え直す（槍の届く敵とは斬り合うが、右翼まで追わない）
    for (const g of rt.army.groups) if (g.team !== rt.player.u.team && alive(g) && !g.routed && /^宇喜多の.+の手$/.test(g.name || '')) { g.order = 'hold'; g.anchor = { ...g.center() }; g.dest = null; g.focus = null; g.aggro = 10; g.seekRange = 14; }
    // 11/17 クラウドト四：踏みとどまる先へ着けず、福島の兵と組み付いた宇喜多の手が move のまま二十秒止まった（act bot 373秒・明石の隊 (-354,52) で12回）
    //   十八秒たっても着かない手は、その場で踏みとどまって槍を合わせる（行き先があるのに止まる兵を作らない）
    rt.after(18, () => { for (const g of [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4, F.fuku]) if (alive(g) && g.order === 'move') { g.order = 'attack'; g.aggro = 14; g.seekRange = 20; g.onArrive = null; } });
    //   それでも前の列に塞がれる後ろの足軽は、三十秒で福島の隊ごと今の所に構え直す（槍が届く敵とは斬り合う）。次の段の下知でまた動く
    rt.after(30, () => { const g = F.fuku; if (F.step === 6 && alive(g) && g.order === 'attack') { g.order = 'hold'; g.anchor = { ...g.center() }; g.aggro = 30; g.seekRange = 40; } });
    // 補充された宇喜多の手も中央へ戻す。本人を追って右翼への退き道を塞がせない。
    let reserveLine = 0;
    for (const g of rt.army.groups) if (g.name === '宇喜多の新手' && alive(g)) {
      g.stay = true; g._rsv = false; g.isReserve = false; g.focus = null; g.path = null; g.fire = true;
      goTo(g, { x: UKITA_F.x - 42 - Math.floor(reserveLine / 4) * 14, z: UKITA_F.z - 30 + (reserveLine % 4) * 20 });
      g.aggro = 10; g.seekRange = 14; reserveLine++;
    }
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
    rt.after(2, () => { if (rt.flags.step === 7) sekiCharge(rt); });   // K467：大谷隊が一度に来る
    rt.objDone('main'); rt.obj('main', G[6], 'main');
    room(rt, 36);
    // 右翼への前進と寝返り時の反転は台本の下知。共通の帰陣・加勢で元の陣へ戻さない。
    F.otaW1 = foe(rt, '大谷吉治の隊', { x: HIRA.x - 16, z: HIRA.z + 14 }, [{ type: 'busho', n: 1, o: { name: '大谷吉治', horse: true, invuln: true, mustLive: true, onWound: () => {} } }, { type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 12 }], OTANI_LK, { morale: 100, noRout: true, formation: 'yari', noAI: true, historicalOrders: true, stay: true });
    goAttack(F.otaW1, { x: RLINE.x - 6, z: RLINE.z + 4 }, 30, 40);
    goAttack(F.otani, { x: RLINE.x - 10, z: RLINE.z - 6 }, 24, 30);
    goAttack(F.todo, { x: RLINE.x + 6, z: RLINE.z + 2 }, 24, 30);
    goAttack(F.ii, { x: RLINE.x + 4, z: RLINE.z - 10 }, 24, 30);
    goAttack(F.iiGun, { x: RLINE.x + 16, z: RLINE.z - 12 }, 24, 30);
    // 11/18 夜50-20：描かずの通しで⑦の四分の間、本人の四十歩内の味方が0〜4人（藤堂・京極の隊は将二人と七人だけ。史実は二家で五千余）。
    //   陣前の線に藤堂・京極の槍の手を一つずつ並べ、本人の脇に味方の列を作る（本物の兵・大谷隊の押しを受け続ける）
    room(rt, 24);
    F.todoL = ally(rt, '藤堂の槍の手', { x: RLINE.x + 10, z: RLINE.z + 12 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 7 }], TODO, { fullStrength: true, formation: 'yari', width: 12, facing: -Math.PI / 2 });
    F.kyoL = ally(rt, '京極の槍の手', { x: RLINE.x + 10, z: RLINE.z - 12 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 2 }, { type: 'ashigaru', n: 7 }], { flag: 'kyogoku', armor: TK }, { fullStrength: true, formation: 'yari', width: 12, facing: -Math.PI / 2 });
    for (const [g, dz] of [[F.todoL, 8], [F.kyoL, -8]]) if (alive(g)) { g.defMult = 1.4; goAttack(g, { x: RLINE.x - 2, z: RLINE.z + dz }, 22, 28); }
    // 11/17 クラウド k06：段7で大谷吉治の騎馬と鉄砲に囲まれて本人が倒れた（act bot 545・574・608秒）→本人へは浅く（藤堂・京極の列への押しはそのまま）
    for (const g of [F.otani, F.otaW1]) { g.dmgMult = 0.6; g.defMult = 1.4; g.dmgMultPlayer = 0.3; }
    F.otaW1.dmgMult = 0.45; // 11/18 ト四：act bot 4回中2回、545・574秒に大谷吉治の騎馬と鉄砲に囲まれて倒れた（段7）
    rt.marker('foe', () => this.missionPin(rt), '藤堂・京極の陣前', { red: true });
    // 膠着の使番が次々。味方は何度も松尾山を見上げる
    rt.after(3, () => rt.say('平塚為広', '刑部さまの陣へは一歩も寄せさせぬ！', 3));
    rt.after(12, () => rt.say('藤堂高虎', '小早川はまだ動かぬのか……', 3));
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
    F.honjinMoving = true; F.honjinT = rt.t;
    // 歩く時間を確保し、旗本が遠い敵へ寄り道しない。家康も隊列の中心を歩く。
    g.order = 'move'; g.dest = { x: IEYASU1.x, z: IEYASU1.z - 5.4 };
    g.formation = 'ring'; g.speed = 4.6; g.aggro = 0; g.seekRange = 0;
    g.keepMoveOrder = true; g.arriveNoncombat = true; g.arriveRadius = 5;
    const arrive = (q, force) => {
      if (F.jinba) return;
      const u = F.ieyasuU;
      // 旗本だけ先着しても家康を飛ばさない。床几のそばまで歩いてから座る。
      // 11/18 クラウド（k06 持ち主）：着いたと見なす輪は救済（6.5m）とそろえる。5m のままだと 5〜6.5m で止まった家康が押されも座りもせず、⑪の勝ちが来なかった（act bot 2400秒）
      if (!force && u?.alive && !u.gone && !near(u.pos, q.dest, 6.5)) { q.onArrive = arrive; return; }
      q.order = 'hold'; q.onArrive = null; q.aggro = 6; q.seekRange = 10;
      q.width = 12; q.spacing = 3.2;   // 11/17 ト四：着いて座った後、旗本十二人が床几の一点に重なって二十秒動かない（act bot 1415秒・10組）→ 輪の幅を広げて散らす
      if (u?.alive && !u.gone) {
        u._k06Seat = { ...u.pos }; u._k06Stand = false; sit(u);
      }
      F.jinba = true;
      rt.scene.add(jinCamp(rt.world, IEYASU1.x, IEYASU1.z - 2, { mon: 'tokugawa', people: false, fire: false, noUma: true }));
      rt.scene.add(nobori(rt.world, IEYASU1.x - 10, IEYASU1.z - 10, 'onri', 7));
    };
    g.onArrive = arrive;
    F.honjinArrive = arrive;
  },
  flip(rt) {
    const F = rt.flags;
    if (F.flipT || F.ending) return;
    F.flipT = rt.t;
    // 山の上の一万五千が動き出す（jindate.flip：はじめは北の野へ。どちらへ来るか分からない）
    if (alive(F.kobaE)) F.kobaE.speed = 4.6;
    goTo(F.kobaE, { x: MATSUO.x + 10, z: MATSUO.z - 110 });
    rt.after(18, () => { if (!F.ending) goTo(F.kobaE, { x: OTANI.x + 60, z: OTANI.z + 50 }); });
    rt.army.play('eshout', { x: MATSUO.x, z: MATSUO.z - 60 }, 2.5);
    rt.say('京極高知', '松尾山の旗が動いた！', 3);
    rt.after(6, () => rt.say(nm(rt), '……こちらへ攻め下ってくるのか？', 3));
    rt.after(12, () => rt.say('藤堂高虎', '備えよ、槍を揃えよ！', 2.5));
    rt.after(20, () => rt.say('使番', '小早川勢、大谷へ向かっております！', 3.5));
    // 11/18 K355 クラウド k365-cloud-42（tairan_sekigahara_06 の読み書き：寝返った側の兵の声を一つ。昨日までの味方へ掛かる気まずさ）
    rt.after(27, () => { if (!F.ending) rt.say('小早川の足軽', '昨日まで味方じゃった刑部様の陣へ……。ええい、下知じゃ、かかれ！', 3.4); });
    rt.after(26, () => {
      if (F.ending) return;
      F.turned = true;
      F.kobaG = turnover(rt, F.kobaE, '小早川秀秋の兵');
      goAttack(F.kobaG, HIRA);
      rt.objDone('main');
      rt.obj('main', G[7], 'main');
      rt.banner('小早川勢、寝返り');
      for (const g of [F.akashi, F.konishi, F.otani, F.otaW1, F.hideG]) if (alive(g)) g.morale -= 12;
      for (const g of F.qs7?.groups || []) if (alive(g)) { g.morale = 40; g.noRout = false; }   // 夜50-20：⑦で打って出た平塚・戸田の新手も寝返りで崩れかける
      // 大谷吉継は寝返りに備えていた：隊を返して小早川を一度押し返す
      if (alive(F.otaW1)) goAttack(F.otaW1, { x: OTANI.x + 64, z: OTANI.z + 40 }, 40, 50);
      // 11/14 クラウドし K127：寝返りの後、線の味方（藤堂・京極・井伊と新手）が狙いの届く30mの外の大谷の残りを前に立ち尽くした（act bot 713〜774秒 (-272,148)）。
      //   崩れかけた大谷隊へ押し出す：槍・侍の隊は平塚の陣の手前まで詰め、狙いの届く広さを60mに
      for (const g of rt.army.groups || []) {
        if (!alive(g) || g.team !== 0 || g.order !== 'attack' || !near(g.center(), RLINE, 60)) continue;
        g.aggro = Math.max(g.aggro || 0, 45); g.seekRange = Math.max(g.seekRange || 0, 60);
        if (g === F.todo || g === F.ii) goAttack(g, { x: HIRA.x + 34, z: HIRA.z - 4 }, 45, 60);
      }
      rt.marker('foe', () => this.missionPin(rt), '藤堂・京極の陣前', { red: true });
    });
    rt.after(32, () => rt.say('大谷吉継', '金吾め、やはり裏切ったか……。備えはしてある。押し返せ！', 4));
    rt.after(44, () => rt.say('使番', '大谷勢、小早川を押し返しております！', 3));
    // 麓の四家が数十秒かけて一つずつ離反する（一斉の大演出にしない）
    rt.after(56, () => { F.wakiT = rt.t; rt.say('使番', '脇坂安治も東軍に付いた！', 3);
      F.wakiG = turnover(rt, F.wakiE, '脇坂安治らの兵');
      goAttack(F.wakiG, HIRA); if (alive(F.otani)) F.otani.morale -= 20; });
    rt.after(66, () => { F.kutsukiT = rt.t; rt.say('使番', '朽木・小川も寝返りましたぞ！', 3); });
    rt.after(76, () => { F.akazaT = rt.t; rt.say('使番', '赤座勢も大谷へかかる！', 3); });
  },
  // 大谷隊の崩れ：吉継は陣中で自害、平塚・戸田は討ち死に。旗が倒れ、小西・宇喜多の脇が空く
  otaniFall(rt) {
    const F = rt.flags;
    if (F.otaniDown) return;
    F.otaniDown = rt.t;
    this.ally10Back(rt);   // ⑧で四割にした味方の刃を元へ
    rt.banner('大谷勢、崩壊');
    rt.say('使番', '大谷勢、崩れました！', 3);
    rt.after(3, () => rt.say('使番', '刑部殿、陣中にて自害の由！', 3));
    for (const u of rt.army.units.filter((o) => o.group === F.otani || o._lgFrom === F.otani)) if (u.alive && !u.gone && u.type === 'busho') { u.invuln = false; u.hp = 0; rt.army.kill(u, null); }
    rout(F.otani); rout(F.otaniH); rout(F.otaW1); rout(F.otaW2);
    for (const g of F._fj || []) if (g._fujinRow === '大谷 二の備' || g._fujinRow === '平塚・戸田') { g.stay = false; g.fixed = false; g.noRout = false; rout(g); }   // 11/16 K292 クラウドせ：布陣の表の大谷の二の備も崩れる
    // 大谷吉治は落ち延びる（史実）。不死身のまま戦場に残ると、共通の集まり直しで戻り、遊び手が斬っても傷のつかない武将になる（11/11 クラウドわ・act bot 1000秒）
    const yoshiharu = rt.army.units.find((u) => u.name === '大谷吉治' && u.alive && !u.gone);   // K468：隊の中へ移されても探せるよう全部から
    if (yoshiharu) {
      yoshiharu.noTarget = true; yoshiharu.target = null; yoshiharu.atk = null;
      const away = () => {
        if (!yoshiharu.alive || yoshiharu.gone) return;
        const P = rt.player.u.pos;
        if (Math.hypot(yoshiharu.pos.x - P.x, yoshiharu.pos.z - P.z) > 30) rt.army.despawn(yoshiharu); else rt.after(3, away);
      };
      rt.after(6, away);
    }
    if (F.otaniU?.alive && !F.otaniU.gone) { F.otaniU.invuln = false; F.otaniU.hp = 0; rt.army.kill(F.otaniU, null); }
    this.stage9(rt);
  },
  // ⑨ 西軍中央を突破：宇喜多・小西が左右から押される。宇喜多の殿を押し破る（秀家は討たせず、旗と伝令と敗走で見せる）
  stage9(rt) {
    const F = rt.flags;
    if (F.step >= 9) return;
    F.step = 9; F.s9t = rt.t; F.fought9 = 0;
    for (const g of [...(F.qs7?.groups || []), ...(F.qs8?.groups || [])]) if (alive(g)) rout(g);   // 夜50-20：⑦の新手の残りは大谷隊と崩れる
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('小早川の寝返りを見届け、大谷隊を崩した'), '大谷隊を崩した');
    rt.obj('main', G[8], 'main');
    rt.after(4, () => rt.say('使番', '小西勢が危うい！　宇喜多の脇が空きましたぞ！', 3.5));
    room(rt, 40);
    for (const g of [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4]) rout(g);
    // 寝返り後は補充の手も宇喜多本隊と共に崩れる。
    for (const g of rt.army.groups) if (g.name === '宇喜多の新手') { g.stay = false; rout(g); }
    F.shingari = foe(rt, '宇喜多の殿', CENTER9, [{ type: 'samurai', n: 6 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 12 }], UKITA, { morale: 80, aggro: 24, seekRange: 30, formation: 'yari', width: 16 });
    F.koniR = foe(rt, '小西の後備', { x: CENTER9.x - 12, z: CENTER9.z - 40 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }], KONI, { morale: 70, aggro: 20, seekRange: 26 });
    F.c9N = nOf(F.shingari, F.koniR);
    for (const g of [F.fuku, F.todo, F.ii, F.iiGun, F.kobaG, F.wakiG]) if (alive(g)) goAttack(g, { x: CENTER9.x + (g === F.fuku ? 8 : 0), z: CENTER9.z + (g === F.kobaG || g === F.wakiG ? 30 : 0) }, 30, 40);
    // 夜50-20：⑦で足した藤堂・京極の槍の手と福島の後備も、天満山の麓へ横に開いて押し出す（京極の足軽が (-325,70) で二十秒立った・act bot 1666秒）
    for (const [g, dz] of [[F.todoL, -14], [F.kyoL, 14], [F.fukuB, 24]]) if (alive(g)) goAttack(g, { x: CENTER9.x + 14, z: CENTER9.z + dz }, 30, 40);
    rt.marker('foe', () => this.missionPin(rt), '天満山の麓', { red: true });
    rt.after(6, () => rt.say('徳川家康', '今ぞ！　皆かかれ！', 3));
    rt.after(14, () => rt.say('島左近', 'まだじゃ……石田の陣、一歩も退くな！', 3));
  },
  // 宇喜多・石田の退却（秀家・三成は討たせず逃がす）→ ⑩ 島津の退き口
  westFall(rt, immediate = false) {
    const F = rt.flags;
    if (F.westDown) return;
    F.westDown = rt.t;
    rout(F.shingari); rout(F.koniR); rout(F.konishi); rout(F.s9rest);
    for (const g of F.qs9?.groups || []) if (alive(g)) rout(g);   // ⑨の空きで打って出た宇喜多の旗本も崩れる
    for (const g of F._fj || []) if (g._fujinRow === '宇喜多 二の備' || g._fujinRow === '小西 二の備' || g._fujinRow === '大谷 二の備' || g._fujinRow === '平塚・戸田' || g._fujinRow === '宇喜多 旗本') { g.stay = false; g.fixed = false; g.noRout = false; rout(g); }   // 11/14 クラウドし K127：布陣の表の宇喜多の二の備も崩れる
    rt.say('宇喜多秀家', '金吾めっ……！　刺し違えてくれる！', 3);
    const hideLeaves = () => { rt.say('宇喜多の近習', '殿、なりませぬ！　ここは落ちのびられませ！', 3); if (F.hide?.leader?.alive) rt.army.despawn(F.hide.leader); rout(F.hide); rout(F.hideG); };
    // 途中再開では済んだ退却をその場で戻す。島津の目標だけを作ると、本陣に総大将が復活してしまう。
    if (immediate) { hideLeaves(); this.stage10(rt); }
    else { rt.after(3, hideLeaves); rt.after(8, () => this.stage10(rt)); }
  },
  // ⑩ 笹尾山の麓の柵。宇喜多・小西が崩れても、石田の陣は島左近と鉄砲衆が柵の口を守って持ちこたえる。黒田・細川と共に口を破る
  stage10(rt) {
    const F = rt.flags;
    if (F.step >= 10) return;
    F.step = 10; F.s10t = rt.t; F.fought10 = 0;
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('西軍の中央を押し破った'), '西軍の中央を押し破った');
    rt.obj('main', G[9], 'main');
    room(rt, 34);
    rt.say('使番', '宇喜多勢、崩れました！　されど笹尾山の石田の陣、まだ一歩も退きませぬ！', 4);
    // K492：笹尾山の麓で待たせていた石田の後備え二つが、柵の口の前へ打って出る（⑩の敵を厚く）
    for (const g of F._fj || []) if (g && g._fujinRow === '石田 後備え' && alive(g)) goAttack(g, { x: GAP.x + 14, z: GAP.z + ((g._fjR?.z ?? -171) > -176 ? 10 : -10) }, 30, 40);
    //   描かずの数え（_k06_k492j.mjs・⑩へ跳ぶ）で、二つは⑩で一度も立たなかった（携帯は取っておきの列 _fjPend に入ったまま本物の数が埋まり、
    //   PC は始めに本人の 260m の外で表から落ちる）→⑩に入った時、立っていない方を列から抜いて、枠を空けてから石田の旗の本物の備として
    //   柵の後ろ（fujin_layout.js の skW5・skW6 と同じ所）に立て、柵の口へ打って出させる
    const pend = F._fjPend || [];
    for (const r of [{ name: '石田の後ろの備', x: -392, z: -140 }, { name: '島左近の後備え', x: -392, z: -212 }]) {
      if ((F._fj || []).some((g) => g && g._fjR?.name === r.name && alive(g))) continue;
      room(rt, TOUCH ? 16 : 30);
      const g = foe(rt, r.name, { x: r.x, z: r.z }, [{ type: 'samurai', n: TOUCH ? 4 : 8 }, { type: 'ashigaru', n: TOUCH ? 12 : 22 }], ISHIDA, { order: 'hold', aggro: 20, seekRange: 24, width: 16, facing: Math.PI / 2 });
      goAttack(g, { x: GAP.x + 14, z: GAP.z + (r.z > -176 ? 10 : -10) }, 30, 40);
    }
    if (pend.length) F._fjPend = pend.filter((q) => !q || q.row !== '石田 後備え');
    // 左近は柵の口の内で槍を揃え、鉄砲衆は柵の陰から撃つ。左近本人は討たせない（黒田の鉄砲で退く）
    F.sakonG = foe(rt, '島左近の隊', { x: GAP.x - 8, z: GAP.z }, [{ type: 'busho', n: 1, o: { name: '島左近', invuln: true, mustLive: true, onWound: () => {}, horse: false } },
      { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 14 }], ISHIDA, { morale: 95, noRout: true, aggro: 22, seekRange: 26, formation: 'column', colW: 2, noAI: true, historicalOrders: true, stay: true });
    // 柵を横陣のまま横切らず、二列で虎口を抜けてから野の持ち場で槍を揃える。
    goAttack(F.sakonG, SAKON_FRONT, 22, 26);
    const sallyArrive = F.sakonG.onArrive;
    F.sakonG.onArrive = (g) => { sallyArrive(g); g.formation = 'yari'; g.width = 14; };
    F.sakonGun = foe(rt, '石田の鉄砲衆', { x: FENCE_X - 7, z: GAP.z - 18 }, [{ type: 'gun', n: 8 }, { type: 'ashigaru', n: 4 }], ISHIDA, { order: 'hold', morale: 90, aggro: 30, seekRange: 40, width: 14, noAI: true, historicalOrders: true, stay: true });
    F.c10N = nOf(F.sakonG, F.sakonGun);
    // 朝から石田を攻め続けた黒田の手（鉄砲衆を連れる）が本人の脇に並ぶ
    F.kuroG = ally(rt, '黒田長政の手', { x: SAKON_FRONT.x + 34, z: SAKON_FRONT.z - 12 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 5 }, { type: 'ashigaru', n: 8 }], KUR, { order: 'attack', aggro: 26, seekRange: 34 });
    // 福島は宇喜多の跡に残す（柵の線の西へ回らせると柵に詰まって動けない＝act bot 1008秒）
    for (const g of [F.kuroG, F.kato]) if (alive(g)) goAttack(g, { x: SAKON_FRONT.x + 6, z: SAKON_FRONT.z + (g === F.kato ? -16 : 0) }, 26, 34);
    // 寝返った兵も中央の追撃を終え、柵の東の野へ進む。古い攻撃先に残して敗走兵を追わせない。
    for (const g of [F.kobaG, F.wakiG]) if (alive(g)) {
      g.focus = null; g.path = null;
      for (const u of g.units) { u.target = null; u.watch = null; u.moveTo = null; u.aiT = 0; }
      goAttack(g, { x: SAKON_FRONT.x + 20, z: SAKON_FRONT.z + (g === F.wakiG ? 24 : 40) }, 26, 34);
      // 11/18 クラウド k06 持ち主：攻めの味方は持ち場を今いる所へ寄せ続けるので、脇坂の兵が柵を越えて石田の本陣の幕の外まで寄り、塀の前で二十秒立った（act bot 1260秒 (-406,-201)）。
      //   柵の東の野に縛る（ai.js の loose から外す。持ち場から四十五歩までは打って出る）
      g.guard = true;
    }
    rt.marker('foe', () => (alive(F.sakonG) ? F.sakonG.center() : GAP), '島左近の隊', { red: true, group: F.sakonG });
    rt.after(6, () => rt.say('黒田長政', '島左近が出てくるぞ。鉄砲を揃えて待て！', 3.5));
    rt.after(14, () => rt.say('島左近', 'かかれ、かかれぇっ！　石田の陣に一兵も入れるな！', 3.5));
    rt.after(24, () => rt.say(nm(rt), '鬼の左近……あの声だけで足がすくむ', 3));
  },
  // 11/18 夜50-20：押し合う段で本人の二十二歩内に敵のいない間が十秒続けば、敵の陣から新手が本人へ打って出る（段ごとに三度まで・段の数えには入れない）
  //   ⑩：描かずの通しで260秒のうち147秒、本人のそばに敵がいなかった（左近の手は黒田・加藤・小早川に先に削られる。act bot「斬り合う相手が少なくて退屈」）。史実でも石田の陣は柵の内から何度も打って出た
  //   ⑦：藤堂・京極の陣前で 269秒のうち118秒が空き。平塚・戸田の手は寝返りまで何度も押し寄せた（大谷勢は小早川を一度押し返したほど強い）
  quietSally(rt, dt, step) {
    const F = rt.flags, P = rt.player.u.pos, me = rt.player.u.team;
    let foeNear = false;
    // 11/18 16:10 クラウド k06 持ち主：⑦で大谷の兵が二十歩の外を行き来するだけで寄らず、本人が陣前の印に百十秒立って討ち取り1（act bot 1556：518〜630秒 速0）。
    //   ④⑤⑦は、槍の届く十四歩内に敵がいない時を「空き」と数える（⑨⑩⑪は前のまま二十二歩）。脇を歩いて過ぎるだけの隊（move）の兵は六歩内だけ数える（act bot 1614：⑦で十四歩内を move の兵が行き来し百四十秒速0）
    const R = step === 4 || step === 5 || step === 7 || step === 8 ? 14 : 22;
    for (const u of rt.army.units) if (u.alive && !u.gone && u.team !== me && !u.fleeing && !u.civ && !u.invuln && !u.noTarget && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < (R === 14 && u.group?.order === 'move' ? 6 : R)) { foeNear = true; break; }
    const k = 'qs' + step;
    const S = F[k] || (F[k] = { quiet: 0, n: 0, groups: [] });
    S.quiet = foeNear ? 0 : S.quiet + dt;
    // 11/19 05:50 クラウド k06 持ち主：④で印（宇喜多先手前）に着いて六秒、敵も台詞も無かった（act bot 0538・160秒 ★★・④の討ち取り1）→④⑤は空き五秒で明石の槍の手が打って出る
    // 11/19 07:55 クラウド k06 持ち主：⑪で島津と受け合いを始めた後、印「島津義弘」に着いても六秒なにも起きない★★が二度（act bot 0739：1474・1493秒）。
    //   受け合いの後は前の三度とは別に、空き五秒で島津の殿の手が本陣の前（十四歩）へ斬り込む（三度まで。受けの時計と段送りは変えない）
    if (step === 11 && F.shiEngaged) {
      if (S.quiet <= 5 || (S.e || 0) >= 3 || F.ending || !near(P, HOLD5, 45)) return;
      S.quiet = 0; S.e = (S.e || 0) + 1; room(rt, 10);
      const c = alive(F.shima) ? F.shima.center() : { x: HOLD5.x - 30, z: HOLD5.z }, L = Math.max(1, dist(c, P)), k = Math.min(18, L * 0.5);
      const g = foe(rt, '島津の殿', { x: P.x + (c.x - P.x) / L * k, z: P.z + (c.z - P.z) / L * k }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 5 }], SHIMA, { morale: 95, aggro: 14, seekRange: 16, width: 8 });
      if (!g) return;
      g.dmgMult = 0.6; g.dmgMultPlayer = 0.3;
      goAttack(g, P, 14, 16); S.groups.push(g);
      rt.say('島津の兵', ['殿の背を守れ！　ここで食い止めよ！', '退くな！　一歩も通すな！', '島津の意地を見せよ！'][S.e - 1], 3);
      return;
    }
    // 11/19 cloud-10（act bot 1401・1191秒：⑩で印「島左近の隊」に着いて六秒なにも起きない）：⑩も空き五秒で石田の新手が打って出る
    if (S.quiet <= (step === 4 || step === 5 || step === 9 || step === 10 ? 5 : 10) || S.n >= (step === 9 || step === 4 || step === 5 ? 4 : 3) || F.ending || step === 10 && F.sakonDown || step === 7 && F.turned || step === 8 && F.otaniDown || step === 9 && F.westDown || step === 11 && !alive(F.shima)) return;
    if (step === 11) {   // ⑪：島津の先駆けが本隊の脇から本人へ斬りかかる（島津は福島・井伊の手の中を斬り抜けて東へ駆けた）
      // 11/18 クラウド k06 持ち主：前は島津の本隊の脇に出して本人を広く追わせ、本人が本陣を離れて⑪が189→442秒に延びた。
      //   本人が本陣の前（三十歩内）にいる時だけ、本人から二十歩先（島津の来る側）に出し、本陣の前（十四歩）へ斬り込ませる。受けの場を離れさせない
      // 11/18 14:55 クラウド k06 持ち主：笹尾山の柵から本陣の前まで本人が二百五十歩を八十秒、敵の六十歩内に入らず歩いていた（描かずの足跡）。
      //   本陣から五十歩より遠い間は、本人の二十歩先（本陣の側）に先駆けを二度まで出し、本陣の方へ進ませる（本人を本陣から引き離さない）
      if (!near(P, HOLD5, 50)) {
        // 11/21 k365-cloud-42（act bot 足跡：⑪の始め 1222〜1314秒の九十秒、本人の三十m 内に敵 0）：先駆けは本陣へ駆けて本人から離れ、本人は一人で歩いていた。
        //   本人の行く道の二十歩先に出し、そこで構えて本人を待つ（本陣へは駆けない・本人を本陣から引き離さない）。三度まで。段の長さ・受けの時計は変えない
        if ((S.far || 0) >= 3) { S.quiet = 0; return; }
        S.quiet = 0; S.far = (S.far || 0) + 1; room(rt, 10);
        const L = Math.max(1, dist(HOLD5, P)), k = Math.min(20, L * 0.5);
        const g = foe(rt, '島津の先駆け', { x: P.x + (HOLD5.x - P.x) / L * k, z: P.z + (HOLD5.z - P.z) / L * k }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], SHIMA, { morale: 95, aggro: 12, seekRange: 14, width: 8 });
        if (!g) return;
        g.dmgMult = 0.6; g.dmgMultPlayer = 0.3;
        g.order = 'hold'; g.anchor = g.center(); g.aggro = 16; g.seekRange = 18; S.groups.push(g);
        rt.say('島津の兵', ['道を開けい！　島津の通るぞ！', '殿の前を塞ぐ者は斬れ！', '退き口を開けよ！　押し通る！'][S.far - 1], 3);
        return;
      }
      if (!near(P, HOLD5, 30)) { S.quiet = 0; return; }
      S.quiet = 0; S.n++; room(rt, 10);
      const c = F.shima.center(), L = Math.max(1, dist(c, P)), k = Math.min(20, L * 0.5);
      const g = foe(rt, '島津の先駆け', { x: P.x + (c.x - P.x) / L * k, z: P.z + (c.z - P.z) / L * k }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], SHIMA, { morale: 95, aggro: 14, seekRange: 16, width: 8 });
      if (!g) return;
      g.dmgMult = 0.6; g.dmgMultPlayer = 0.3;
      goAttack(g, HOLD5, 14, 16); S.groups.push(g);
      rt.say('島津の兵', ['チェストォ！　前を塞ぐ者は斬り捨てよ！', '殿の御前を開けよ！', '一人も生きて帰らぬ覚悟じゃ！'][S.n - 1], 3);
      return;
    }
    S.quiet = 0; S.n++; room(rt, 16);
    const ten = step === 10, nine = step === 9, uk = step === 4 || step === 5;
    // 11/18 16:00 クラウド k06 持ち主：④で宇喜多の二番手が崩れて退くと、本人が空の印（宇喜多先手前）に七十秒立ち尽くし、④の討ち取り0（act bot 1551：137〜207秒 敵0〜2・速0）。
    //   ④⑤も十秒空けば、天満山の麓（宇喜多の陣の側）から明石の手の槍が打って出る（史実でも宇喜多は福島を押し返し、前半は崩れなかった）
    if (uk) {
      const g = foe(rt, '明石の槍の手', { x: UKITA_F.x - 24, z: UKITA_F.z + (S.n - 2) * 10 }, [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }], UKITA, { morale: 95, aggro: 30, seekRange: 40, formation: 'yari', width: 12 });
      if (!g) return;
      g.dmgMult = 0.6; g.dmgMultPlayer = 0.3;
      goAttack(g, P, 30, 40); S.groups.push(g);
      // 11/19 cloud-10（act bot 1353・314秒：⑤で三度の打って出を使い切った後、印「宇喜多先手前」に着いて六秒なにも起きない）：④⑤も四度まで
      rt.say('宇喜多の兵', ['福島の後ろに付いた奴を討て！', '明石さまの槍、もう一度かかれ！', '宇喜多の陣へは一歩も寄せるな！', '児の字の旗の前で退くな！　押し返せ！'][S.n - 1], 3);
      return;
    }
    // ⑨：天満山の林（麓の西）から宇喜多の旗本の残りが踏みとどまって打って出る（明石全登の手は最後まで戦った）
    //   11/18 クラウド k06 持ち主：三度出しても麓の三十歩内の空きが 40/186秒残った（描かずの通し）。⑨だけ四度まで
    const at = ten ? { x: GAP.x + 6, z: GAP.z + (S.n - 2) * 8 } : nine ? { x: CENTER9.x - 26, z: CENTER9.z + (S.n - 2) * 12 } : { x: OTANI_FRONT.x - 10, z: OTANI_FRONT.z + (S.n - 2) * 10 };
    const g = foe(rt, ten ? '石田の新手' : nine ? '宇喜多の旗本' : '平塚・戸田の新手', at, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 10 }], ten ? ISHIDA : nine ? UKITA : OTANI_LK, { morale: 90, aggro: 30, seekRange: 40, formation: 'yari', width: 12 });
    if (!g) return;
    if (step === 7 || step === 8) { g.dmgMult = 0.6; g.dmgMultPlayer = 0.3; }   // ⑦の大谷方は本人へ浅く（11/17 段7で囲まれて倒れた直しと同じ）
    goAttack(g, P, 30, 40); S.groups.push(g);
    const L = ten ? ['柵の内から押し出せ！　治部さまの陣を守れ！', 'まだじゃ、もう一度打って出よ！', '大一大万大吉の旗の下で死ね！']
      : nine ? ['中納言さまの退き口を守れ！', '児の字の旗を倒させるな！', '明石の手、まだ残っておるぞ！', '天満山へは一歩も入れるな！']
      : ['刑部さまの前へ出よ！　藤堂の槍を押し返せ！', '平塚の手、もう一度かかれ！', '戸田の者ども、退くな！'];
    rt.say(ten ? '石田の兵' : nine ? '宇喜多の兵' : '大谷の兵', L[S.n - 1], 3);
  },
  ally10Back(rt) {   // ⑩で四割にした味方の刃を元へ
    const F = rt.flags;
    if (!F.ally10) return;
    for (const [g, m] of F.ally10) g.dmgMult = m;
    F.ally10 = null;
  },
  // 左近が黒田の鉄砲に撃たれて退き、柵の口が破れる → 三成が伊吹山へ落ちる → 島津の退き口
  sakonFall(rt, immediate = false) {
    const F = rt.flags;
    if (F.sakonDown) return;
    F.sakonDown = rt.t;
    this.ally10Back(rt);
    const leave = (g) => { if (g?.leader?.alive && !g.leader.gone) rt.army.despawn(g.leader); };
    leave(F.sakonG); rout(F.sakonG); rout(F.sakonGun);
    for (const g of F.qs10?.groups || []) if (alive(g)) rout(g);   // 夜50-20：柵の口から打って出た石田の新手も崩れる
    const mitsuLeaves = () => {
      rt.say('使番', '治部少輔（三成）、伊吹山の方へ落ちた！', 3.5);
      if (F.mitsuU?.alive && !F.mitsuU.gone) rt.army.despawn(F.mitsuU);
      rout(F.mitsu);
    };
    if (immediate) { mitsuLeaves(); this.stage11(rt); return; }
    rt.say('使番', '柵の口が破れた！　石田の陣、崩れましたぞ！', 3.5);
    rt.after(5, mitsuLeaves);
    rt.after(9, () => this.stage11(rt));
  },
  // ⑩ 島津の退き口。朝から奥の林に構えていた島津の隊が、家康の本陣の前を突き抜ける
  stage11(rt) {
    const F = rt.flags;
    if (F.step >= 11) return;
    F.step = 11; F.s11t = rt.t;
    rt.after(2, () => { if (rt.flags.step === 11) sekiCharge(rt); });   // K467：島津の突入が一度に来る
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('笹尾山の柵を破り、石田の陣を崩した'), '石田の陣を崩した');
    rt.obj('main', G[10], 'main');   // 目標はすぐ出す（空く間があると全部済んだ扱いで閉じる）
    // 途中再開でも本陣は歩いて進める。未着の隊をその場で移さない。
    this.advanceHonjin(rt);
    for (const g of [F.kanamori, F.otani, F.otaniH, F.otaW1, F.otaW2, F.kobaG, F.wakiG, F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4, F.mitsu, F.todo, F.hide, F.hideG, F.konishi, F.shingari, F.koniR, F.fuku, F.sakonG, F.sakonGun, F.kuroG]) KIT.markRecyclable(g);
    // 本陣の前で待ち受ける（遠くへ追って出ない）
    goAttack(F.ii, { x: HOLD5.x + 8, z: HOLD5.z - 26 }, 10, 12);
    goAttack(F.iiGun, { x: HOLD5.x + 24, z: HOLD5.z - 34 }, 20, 20);
    goAttack(F.honda, { x: HOLD5.x + 14, z: HOLD5.z + 8 }, 10, 12);
    // 島津の通り道の脇にいる金森・加藤の手は道を空ける（11/8 流し：金森の手と組み合い、島津が陣場野の百十歩手前で五分止まった）
    // 11/18 クラウド k06 持ち主：二つの手を同じ一点 (-246,14) へ寄せていたので、加藤の侍六人が金森の輪と重なって止まった（act bot 1698秒・重なり5組）。
    //   通り道に沿って十八歩ずらし、二つの手を並べて置く（道の脇からは出さない）。
    for (const [g, at] of [[F.kanamori, { x: -246, z: 14 }], [F.kato, { x: -264, z: 14 }]]) if (alive(g)) { goTo(g, at); g.aggro = 0; g.seekRange = 0; }
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
      for (const u of F.shima.units) { u.campProtected = true; u.noQualityLoss = true; }   // 11/21 K468 クラウドせ：本陣へ駆ける間、遠くの押し合いの損耗（army_quality は campProtected を見ない）で27→7人に溶け、義弘・豊久が一人で本陣の前に着いた（act bot：守りのまま討たれた兵 6〜8）
      F.shiI = 0;   // 野へ出た所から（道の一つ目は林の出口なので飛ばす）
      this.shimaStep(rt);
      // 11/18 17:20 クラウド k06 持ち主：本陣の前に着く前の島津は旗本に守られて討てず、印（義弘の足元）に着いても六秒なにも起きなかった（act bot 1707：1449・1470秒）。
      //   着くまでは印を本陣の前（受ける所）に立て、島津が本陣の三十歩内へ来るか受け合いが始まってから義弘を指す
      rt.marker('foe', () => { const l = F.shima.leader?.alive ? F.shima.leader.pos : F.shima.center(); return F.shiAt || near(l, HOLD5, 30) ? l : HOLD5; }, '島津義弘', { red: true, group: F.shima });
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
    // 移動だけでは近い敵への応戦と鉄砲で列が止まる。退き道の下知で、手の届く追手だけ払い前へ抜ける。
    g.order = 'path'; g.path = [[q.x, q.z]]; g.pathIdx = 0; g.dest = { ...q };
    g.retreatOnly = true; g.noAI = true; g.keepMoveOrder = true;
    g.fire = false; g.aggro = 0; g.seekRange = 0;
    for (const u of g.units) if (u.alive && !u.gone) {
      u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null; u.aiT = 0;
    }
    // 本陣の前（三つ目）で押し合う。本人との受け合いが済むまで伊勢路へは進まない。
    g.onArrive = F.shiI === 2 ? null : () => { rt.after(0.5, () => this.shimaStep(rt)); };
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; F.won = true;
    rt.unmark('foe');
    rt.player.u.invuln = true;
    this.shimaAway(rt);
    for (const g of rt.army.groups) if (g.team === 1 && g !== F.shima) rout(g);
    // すぐ札へ行かず、霧の晴れた野の余韻と首実検の支度を三十秒（11/11 共通要件・k06/yoin.js が締める）
    //   主の任務の済みと手柄は締めの直前に（共通の goalsDoneTick が二秒半で勝ちに締め、余韻を切らないように）
    yoin.start(rt, { UKITA_F, SAKON, KONISHI, done: () => {
      rt.objDone('main');
      rt.award((t) => { t.main = true; t.special = { label: '関ヶ原で寝返りを目の前で見届け、島津の退き口を追い崩した', pts: 60 }; }, '島津の捨て奸を崩した');
    } });
  },
  // 受け合いの後は伊勢路への退却を優先する（通常の移動は近い敵へ応戦し、鉄砲も撃ち続ける）
  shimaAway(rt) {
    const F = rt.flags;
    if (alive(F.shima)) {
      const g = F.shima;
      g.order = 'retreat'; g.dest = { ...SHIMA_PATH[SHIMA_PATH.length - 1] };
      g.onArrive = null; g.aggro = 0; g.seekRange = 0; g.fire = false; g.focus = null;
      for (const u of g.units) if (u.alive && !u.gone) {
        u.target = null; u.watch = null; u.atk = null; u.swing = null; u.bind = null;
        u.charging = false; u.aiT = 0;
      }
    }
  },
  // ⑫ 島津の捨て奸：伊勢街道の坂に鉄砲を抱えた兵が座り込み、追手を撃っては槍で踏みとどまる。一の手を崩すと二の手が坂の上に
  stage12(rt, immediate = false) {
    const F = rt.flags;
    if (F.step >= 12) return;
    F.step = 12; F.s12t = rt.t; F.fought12 = 0; F.w12 = 1;
    for (const g of F.qs11?.groups || []) if (alive(g)) rout(g);   // ⑪で打って出た島津の先駆けも本隊と共に伊勢路へ
    rt.objDone('main'); rt.unmark('foe');
    rt.award((t) => t.side.push('本陣の前で島津の突入を受け止めた'), '島津の突入を受けた');
    rt.obj('main', G[11], 'main');
    this.shimaAway(rt);
    if (alive(F.shima)) for (const u of F.shima.units) u.campProtected = true;   // 逃げる本隊は討たせない（追うのは捨て奸）
    room(rt, 30);
    F.sute1 = this.suteGroup(rt, '島津の捨て奸', SUTE1);
    F.c12N = nOf(F.sute1);
    // 追手は井伊の赤備え・本多の手。家康の旗本は本陣に残る
    for (const g of [F.ii, F.iiGun, F.honda]) if (alive(g)) goAttack(g, { x: SUTE1.x + (g === F.iiGun ? 14 : 0), z: SUTE1.z - 14 }, 24, 30);
    // 散った残兵の中心へ追わせず、守備の時計を数える坂へ案内する。
    rt.marker('foe', () => this.missionPin(rt), '島津の捨て奸', { red: true, group: F.sute1 });
    if (immediate) return;
    rt.say('本多忠勝', '島津を逃がすな！　伊勢路の坂まで追え！', 3.5);
    rt.after(8, () => rt.say('島津の兵', 'ここで死ぬ。殿を一歩でも遠くへ！', 3));
    rt.after(16, () => rt.say(nm(rt), '道に座り込んで撃ってくる……退く兵の構えではない', 3));
  },
  suteGroup(rt, name, at, head = []) {
    return foe(rt, name, at, [...head, { type: 'gun', n: 7 }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 8 }], SHIMA,
      { order: 'hold', morale: 100, noRout: true, aggro: 22, seekRange: 26, width: 12, facing: Math.PI, stay: true, noAI: true, historicalOrders: true, dmgMultPlayer: 0.7 });   // 11/19 cloud-10 act bot 1604秒：捨て奸の鉄砲28と騎馬48二度で倒れた（三十分の終わりで一度の負け）→本人に当たる時だけ七割
  },
  skirmishFire(rt) {
    const A = rt.army, P = rt.player?.u;
    if (!P) return;
    const gs = A.groups.filter((g) => !g.routed && g.count && !g.isPlayerSquad && g.order !== 'flee' && g.order !== 'retreat' && g.units.some((u) => u.alive && u.type === 'gun' && !u.sidearm));
    for (const g of gs) {
      const c = g.center();
      if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 130) continue;
      // 本人が斬り合う相手（本人の二十五歩内の組）は味方の鉄砲で先に削らない（act bot 1401：討ち取り28・「斬る相手が少ない」）
      const foes = A.groups.filter((f) => f.team !== g.team && !f.routed && f.count && Math.hypot(f.center().x - c.x, f.center().z - c.z) < 90 &&
        (g.team !== P.team || Math.hypot(f.center().x - P.pos.x, f.center().z - P.pos.z) > 25));
      if (foes.length) A.scriptSalvo(g, foes, 6, 70);
    }
  },

  update(rt, dt) {
    const F = rt.flags;
    // 11/21 クラウド k06（K493「関ヶ原は特に重い」）：携帯で生きた兵が段1〜4 の間ずっと 262〜281（上限 250）。道の始めの行軍の列（飾りの味方十八人・march_open.js）が
    //   戦の終わりまで陣の後ろに立ち続けていた。段2からは、列の誰もが本人の七十m の外なら外す（真田丸と同じ手。数の札は despawn の _shedN で足し戻る）
    const mg = F.marchG, MP = rt.player?.u;
    if (TOUCH && mg && !F._mgOff && (F.step || 0) >= 2 && MP?.alive && (F._mgT = (F._mgT || 0) - dt) <= 0) {
      F._mgT = 1;
      const us = (mg.units || []).filter((u) => u.alive && !u.gone);
      if (!us.length) F._mgOff = true;
      else if (!us.some((u) => Math.hypot(u.pos.x - MP.pos.x, u.pos.z - MP.pos.z) < 70)) { for (const u of us) { try { rt.army.despawn(u); } catch (e) { /* そのまま */ } } F._mgOff = true; }
    }
    if ((F.step || 0) <= 9) loneGeneralTick(rt, { range: 160, rejoin: 30 });   // 11/21 K468 クラウドせ：旗本が二人以下になった西軍の将を九十m 内の厚い味方の備の中へ移す（島津の段の豊久・長寿院は台本が組から探すので外す）
    // 11/19 cloud-10（司令塔：K129 の三十分は残し、三十分を大きく越える回だけ縮める）：三十分（1800秒）を越えたら、
    //   段4〜11は一つの段が七十五秒続いた所で次の段へ進める（並びと段の中身は変えない。遊ぶ人が遅い回でも四十分にしない）
    if (!F.ending && rt.t > 1800 && F.step >= 4 && F.step <= 11 && rt.t - (F['s' + F.step + 't'] ?? rt.t) > 75 && typeof this['stage' + (F.step + 1)] === 'function') {
      this['stage' + (F.step + 1)](rt);
    }
    // 11/19 cloud-10（司令塔：煙が薄い＝本人の九十歩内に鉄砲が三十五挺いても二十秒に十発ほど・乱戦でほぼ撃たない）：
    //   史実の開戦は福島と宇喜多の鉄砲の撃ち合い。開戦の一斉射の後は二秒半ごとに、本人の百三十歩内の鉄砲を持つ組（敵味方とも・本物の兵だけ）が、
    //   七十歩内の敵の組へ、込め終えた者から撃ちかける（槍の間合いへ入る前から撃ち続ける。弾数・込めの長さ・当たりは今のまま。本人は狙わない）
    if (!F.ending && (F.step > 2 || F.vol >= 1) && (F.skfT = (F.skfT || 0) + dt) > 2.5) { F.skfT = 0; this.skirmishFire(rt); }
    // 11/21 クラウド k06 持ち主（K492「見渡すと敵が少なく見える」）：描かずの数えで西軍の布陣の表の塊が②〜⑥の大軍の斬り合いで討ち尽くされ、
    //   敵の生きた数が始め1036→⑦の始め74（味方は700〜1000）。史実の西軍は小早川の寝返りまで互角に持ちこたえた。寝返りの前（⑦まで）は
    //   表の西の塊（寝返る前の小早川の麓の備も）の受けを四倍にし（二倍では②〜⑤の百四十秒で宇喜多の表の塊 396→29 と変わらず。四倍で281秒 168・421秒 73・562秒 45 が残る）、⑧の寝返りから元へ戻す（刃は今のまま。本人の当たりは別の dmgMultPlayer）
    if ((F.k492dT = (F.k492dT || 0) + dt) > 1) {
      F.k492dT = 0;
      const hold = (F.step ?? 0) < 8 && !F.turned;
      for (const g of F._fj || []) {
        if (!g || g.team !== 1 || g._idleAid) continue;
        if (hold && !g._k492d && alive(g)) { g._k492d = g.defMult || 1; g.defMult = g._k492d * 4; }
        else if (!hold && g._k492d) { g.defMult = g._k492d; g._k492d = 0; }
      }
    }
    // 総大将は床几に座ったまま（幕の内から出ない）
    for (const u of [F.ieyasuU, F.hide?.leader, F.mitsuU, F.otaniU]) sit(u);
    // 吉継は輿の床に座る（輿は吉継に付く）
    if (F.koshi && F.otaniU?.alive && !F.otaniU.gone) { const u = F.otaniU; F.koshi.position.set(u.pos.x, rt.world.heightAt(u.pos.x, u.pos.z), u.pos.z); F.koshi.rotation.y = u.heading || 0; }
    F.uma?.update(dt);
    this.fog(rt);
    // 11/19 クラウド k06 持ち主：右翼へ回る井伊の手の侍二人が、行き先 (-261,143) の六十八歩手前 (-274,75) で move のまま二十秒歩かなかった（act bot 384秒・3回に1回。前の回も386秒）。
    //   ⑥⑦で井伊の手の兵が十二秒動かず行き先から十歩より遠い時は、隊ごと行き先を陣（anchor）にした槍合わせへ替える（行き先があるのに止まる兵を作らない）
    if ((F.step === 6 || F.step === 7) && rt.t >= (F.iiChkT || 0)) {
      F.iiChkT = rt.t + 2;
      for (const g of [F.ii, F.iiGun]) if (alive(g) && g.order === 'move' && g.dest) {
        let stuck = false;
        for (const u of g.units) if (u.alive && !u.gone) {
          const q = u._k06p;
          if (q && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 1) { u._k06s = (u._k06s || 0) + 2; } else { u._k06p = { x: u.pos.x, z: u.pos.z }; u._k06s = 0; }
          if (u._k06s >= 12 && !near(u.pos, g.dest, 10)) stuck = true;
        }
        if (stuck) { g.order = 'attack'; g.anchor = { ...g.dest }; g.dest = null; g.path = null; g.onArrive = null; g.aggro = 14; g.seekRange = 20; for (const u of g.units) u._k06s = 0; }
      }
    }
    // 11/20 k365-cloud-42（kaito_now ③「主人公が一人にならない」）：始まりの話の間（十三秒半）と①の抜け駆けの間に本人が先へ駆けると、
    //   井伊の手と鉄砲衆は陣に残り、874×402 の写真（10秒）で本人のまわりに味方が一人も映らなかった。
    //   ①までは、本人が井伊の手の真ん中から十八歩より離れたら、二隊とも①の行き先（宇喜多の先手前）へ駆けて本人に付く（追いつけば元の足に戻す）。数と強さは同じ
    if (!F.ending && (F.step || 0) <= 1 && rt.t >= (F.iiFolT || 0)) {
      F.iiFolT = rt.t + 1;
      const P = rt.player.u;
      for (const [g, home] of [[F.ii, { x: NUKE.x + 6, z: NUKE.z - 8 }], [F.iiGun, { x: NUKE.x, z: NUKE.z + 2 }]]) {
        if (!alive(g)) continue;
        const c = g.center(F._iiC || (F._iiC = {})), far = Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 18;
        // 行き先を毎秒替えると下知の伝わる間（signalWait）が毎回かかり隊が止まる＝本人の行く先（①の行き先）へ一度だけ駆けさせる
        if (far && !g._k06Fol) { goTo(g, home); g._k06Sp = g.speed; g.speed = Math.max(g.speed || 0, 7.5); g._k06Fol = true; }
        else if (g._k06Fol && !far && g.speed === 7.5) g.speed = g._k06Sp ?? g.speed;
      }
    }
    // 11/21 k365-cloud-42（11/19 と今の前後 60秒：本人が鉄砲衆の前へ十余歩出ると、井伊の槍の手は持ち場に残り、本人の背のカメラに味方が映らなかった）：
    //   ②の間、本人が井伊の槍の手の真ん中から十二歩より離れたら、槍の手は本人の五歩前（宇喜多の先手の側）へ寄って構える（八秒に一度だけ下知・鉄砲衆は撃つ所に残す）
    if (!F.ending && F.step === 2 && alive(F.ii) && rt.t >= (F.iiStep2T || 0)) {
      const P = rt.player.u.pos, c = F.ii.center(F._iiC || (F._iiC = {}));
      if (Math.hypot(c.x - P.x, c.z - P.z) > 12) {
        F.iiStep2T = rt.t + 8;
        const d = Math.hypot(UKITA_F.x - P.x, UKITA_F.z - P.z) || 1;
        goTo(F.ii, { x: P.x + (UKITA_F.x - P.x) / d * 5, z: P.z + (UKITA_F.z - P.z) / d * 5 });
      }
    }
    jindate.tick(rt);
    // 11/21 クラウド k06 持ち主 K564：二陣・前の補充（depthReserve・frontFill）も、出す前に room で上限250の枠を空ける（段2〜4 の生きた兵 261〜304 の残り）
    // 11/13 司令塔 K001・K075：激突の段は、敵の二陣・味方の二陣が本人の前後で待ち、薄い所へ一組ずつ出る（depth_reserve.js）
    // 宇喜多の補充は中央の交戦中だけ。退く段・右翼への移動・大谷の反転中には行く手を埋めない。
    const centralReserves = F.step >= 1 && F.step <= 5 && F.step !== 3 && !F.ending;
    depthReserve(rt, { active: () => centralReserves,
      enemy: { limit: 24, make: (r, at) => (room(r, 28), foe(r, '宇喜多の新手', at, [{ type: 'samurai', n: 6 }, { type: 'ashigaru', n: 22 }], UKITA, { order: 'hold', aggro: 15, seekRange: 16, width: 18, facing: Math.PI / 2 })) },
      ally: { limit: 12, make: (r, at) => (room(r, 20), ally(r, '井伊の新手', at, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: 16 }], II, { order: 'hold', aggro: 15, seekRange: 16, width: 16, fullStrength: true })) } });
    // 11/15 クラウドさ（K338 天王寺の物差し）：歩いて近づく間も、本人の前 60m に本物が 40 人以上（足りなければ前 45m に新手。天王寺と同じ frontFill）
    frontFill(rt, { active: () => centralReserves, limit: 16,
      enemy: (r, at, face) => (room(r, TOUCH ? 13 : 23), foe(r, '宇喜多の新手', at, [{ type: 'samurai', n: 5 }, { type: 'ashigaru', n: TOUCH ? 8 : 18 }], UKITA, { order: 'hold', aggro: 15, seekRange: 16, width: 18, facing: face })),
      ally: (r, at, face) => (room(r, TOUCH ? 11 : 18), ally(r, '井伊の新手', at, [{ type: 'samurai', n: 4 }, { type: 'ashigaru', n: TOUCH ? 7 : 14 }], II, { order: 'hold', aggro: 15, seekRange: 16, width: 16, facing: face, fullStrength: true })) });
    huntPlayer(rt, F);
    if (F.step === 7 && near(rt.player.u.pos, RLINE, 40)) this.quietSally(rt, dt, 7);
    // 11/19 クラウド k06 持ち主：⑧（寝返りから大谷の崩れまで 197秒）で本人の討ち取り1（act bot 1803秒）。小早川の下山を待つ間、本人の前に敵が来ない。
    //   史実でも大谷勢は寝返った小早川を二度三度押し返した。⑧も線のそばで十秒空けば、平塚・戸田の新手が本人へ打って出る（三度まで・数えには入れない）
    if (F.step === 8 && F.turned && near(rt.player.u.pos, RLINE, 80)) this.quietSally(rt, dt, 8);   // 11/19 06:15 クラウド k06 持ち主：印は線から九十歩まで大谷方を探すので、打って出る場も八十歩へ（act bot 0550・0600 三回とも⑧の討ち取り0）
    // 11/18 夜50-20：寝返った小早川・脇坂の兵が、持ち場へ戻る道で塀に当たり二十秒立った（act bot 1607秒 (-279,-91)・前の回 (-406,-201) 石田の本陣の塀）。
    //   ⑩からは持ち場が柵の内へ寄っていれば柵の東の野へ戻す。八秒動けず、持ち場との間に塀がある兵は、本人から五十歩より遠ければ外す（見えない所で消す）
    if (F.step >= 10 && rt.t >= (F.turnWallT || 0)) {
      F.turnWallT = rt.t + 2;
      const me = rt.player.u.pos;
      for (const [g, dz] of [[F.kobaG, 40], [F.wakiG, 24]]) {
        if (!alive(g)) continue;
        if (g.anchor && g.anchor.x < FENCE_X + 4) g.anchor = { x: SAKON_FRONT.x + 20, z: SAKON_FRONT.z + dz };
        for (const u of g.units) {
          if (!u.alive || u.gone || u.name) continue;
          const q = u._twP || (u._twP = { x: u.pos.x, z: u.pos.z, t: rt.t });
          if (Math.hypot(u.pos.x - q.x, u.pos.z - q.z) > 0.6) { q.x = u.pos.x; q.z = u.pos.z; q.t = rt.t; continue; }
          if (rt.t - q.t < 8) continue;
          const to = u.moveTo || g.dest || g.anchor;
          if (to && rt.army.wallBetween(u.pos, -1, to) && Math.hypot(u.pos.x - me.x, u.pos.z - me.z) > 50) rt.army.despawn(u);
        }
      }
    }
    // 11/19 クラウド 夜50-35：⑨以降（1173秒）藤堂の槍の手の足軽が (-411,47) で attack のまま、塀の向こうの敵25mを行き先 (-413,45) に追って二十秒動かなかった（act bot ★★×9・行き先があるのに止まる）。
    //   藤堂・京極の手の兵が十二秒動かず、まだ行き先を持つ時は、行き先を捨てて今の場所を陣（anchor）にした槍合わせへ替える（二秒ごと）
    if (rt.t >= (F.tkChkT || 0)) {
      F.tkChkT = rt.t + 2;
      for (const g of [F.todoL, F.kyoL]) if (alive(g) && g.order === 'attack' && g.dest) {
        let stuck = false;
        for (const u of g.units) if (u.alive && !u.gone) {
          const q = u._k06q;
          if (q && Math.hypot(u.pos.x - q.x, u.pos.z - q.z) < 1) { u._k06t = (u._k06t || 0) + 2; } else { u._k06q = { x: u.pos.x, z: u.pos.z }; u._k06t = 0; }
          if (u._k06t >= 12) stuck = true;
        }
        if (stuck) { const c = g.center(); g.anchor = { x: c.x, z: c.z }; g.dest = null; g.path = null; g.onArrive = null; g.aggro = 14; g.seekRange = 20; for (const u of g.units) u._k06t = 0; }
      }
    }
    // 11/20 クラウドさ（kaito_now 3 天王寺の出来に・本人が一人にならない）：段4〜5で本人の主の井伊の手・鉄砲衆が宇喜多の前の持ち場に残り、
    //   本人が宇喜多へ寄ると六十歩離れていた（描かずの数え 220秒 鉄砲衆の芯まで60m・三十歩内0）。四十歩より離れたら、槍を合わせたまま陣を本人の方へ六割寄せる（二秒ごと）
    // 11/20 クラウドか（同じ・後半）：⑦⑧の右翼でも、本人が大谷の手を追って線から三十歩出ると、藤堂・京極・井伊の手が線に残り
    //   三十歩内の味方が 4〜12 人に痩せた（描かずの数え 580・600秒）。⑦⑧は右翼の五つの手も、三十歩より離れたら同じく本人の方へ六割寄せる
    if ((F.step === 4 || F.step === 5 || F.step === 7 || F.step === 8) && !F.ending && rt.t >= (F.iiNearT || 0)) {
      F.iiNearT = rt.t + 2;
      const P = rt.player.u.pos, right = F.step >= 7;
      for (const g of right ? [F.ii, F.iiGun, F.todo, F.todoL, F.kyoL] : [F.ii, F.iiGun]) if (alive(g) && g.order === 'attack') {
        const c = g.center();
        if (Math.hypot(c.x - P.x, c.z - P.z) > (right ? 30 : 40)) { g.anchor = { x: c.x + (P.x - c.x) * 0.6, z: c.z + (P.z - c.z) * 0.6 }; g.dest = null; g.path = null; g.onArrive = null; }
      }
    }
    // 11/20 クラウドわ（kaito_now 3 関ヶ原・本人が一人にならない）：描かずの数え（携帯）で段8（寝返りの後 640〜880秒）は本人の三十歩内の味方が 13→1〜8人、
    //   段10（柵の口 1080秒〜）は 1〜7人。味方は二百人余り残るのに、藤堂・京極・井伊の手は陣前の線に、黒田・加藤の手は左近の前の野に残り、本人だけが大谷の陣・柵の東の野を進んでいた。
    //   段4〜5と同じ型で、四十歩より離れた攻めの手を本人の方へ六割寄せる（二秒ごと）。段10は本人が柵の東にいる時だけ（柵の内へ引き込まない）。小早川・脇坂は柵の東に縛るので入れない
    if ((F.step === 8 && F.turned || F.step === 10) && !F.ending && rt.t >= (F.nearPullT || 0)) {
      F.nearPullT = rt.t + 2;
      const P = rt.player.u.pos;
      const gs = F.step === 8 ? [F.todo, F.todoL, F.kyoL, F.ii, F.iiGun] : P.x > FENCE_X + 6 ? [F.kuroG, F.kato] : [];
      for (const g of gs) if (alive(g) && g.order === 'attack') {
        const c = g.center();
        if (Math.hypot(c.x - P.x, c.z - P.z) > 40) { g.anchor = { x: c.x + (P.x - c.x) * 0.6, z: c.z + (P.z - c.z) * 0.6 }; g.dest = null; g.path = null; g.onArrive = null; }
      }
    }
    splitFront(rt, F);
    // 11/18 夜50-20：藤堂・京極の隊の侍が平塚の前の行き先 (-363,153) の十三歩手前で味方に詰まり、move のまま二十秒止まった（act bot 388秒）。
    //   右翼の味方の手は、行き先の二十歩内まで来たら着いたと見て、その場で槍を合わせる（二秒ごと）
    //   11/18 21:00 クラウド k06 持ち主：⑥で右翼へ移る井伊の手・鉄砲衆も同じ型（段7 の始め 380秒ごろ持ち場の四十歩後ろで二十秒）→同じ扱いに入れる
    if (rt.t >= (F.rwArriveT || 0)) {
      F.rwArriveT = rt.t + 2;
      for (const g of F.step === 6 ? [F.todo, F.todoL, F.kyoL, F.ii, F.iiGun] : [F.todo, F.todoL, F.kyoL]) if (alive(g) && g.order === 'move' && g.dest && near(g.center(), g.dest, 20)) { if (g.onArrive) g.onArrive(g); else { g.order = 'attack'; g.aggro = 24; g.seekRange = 30; } }
    }
    if (F.ending || !F.step) return;
    // 平塚・戸田は藤川台の前を守る。応戦で敵を追っても、笹尾山への道まで出て行かない。
    // 寝返り後の討死・敗走には帰陣の下知を重ねない。
    // ⑦からは藤堂・京極の脇の線まで押し出し、そこで押し合う
    const OA = (F.step || 0) >= 7 ? OTANI_FRONT : HIRA;
    if (!F.turned && alive(F.otani) && F.otani.order !== 'move' &&
      (!near(F.otani.center(), OA, 40) || F.otani.leader?.alive && !near(F.otani.leader.pos, OA, 40))) { if (OA === HIRA) goTo(F.otani, HIRA); else goAttack(F.otani, OA, 24, 30); }
    const P = rt.player.u.pos;
    // 11/11 クラウドわ：旗本だけ先に着くと onArrive が一度きりで掛け直されず、家康が陣場野に座らないまま⑩の勝ちが来なかった（act bot：島津を161秒受けても1260秒で失敗）。
    //   八十秒経っても未着なら到着判定を掛け直す。足止めの救済も歩幅で進め、幕・柵を越えて床几へ飛ばさない。
    // 11/11 クラウドす：床几は桃配山の幕の内にあり、家康だけが幕と床几に挟まって一歩も出られず（旗本の輪は先に陣場野へ）、八十秒後の救済も
    //   毎コマ少し揺れるので「止まった」と見なされず、⑩で島津を受け続けても勝ちが来なかった（act bot 1260秒で失敗・家康は (322,146) のまま）。
    //   三秒で一歩も進まなければ、画面の外なら旗本の輪の中へ移し（遠くで見えない）、見える所なら歩幅で押す。
    if (F.honjinMoving && !F.jinba && rt.t - (F.honjinT || 0) > 15 && alive(F.ieyasu)) {
      const g = F.ieyasu, u = F.ieyasuU, d = g.dest || { x: IEYASU1.x, z: IEYASU1.z - 5.4 };
      // 11/18 クラウド（k06 持ち主）：床几の前 5.4m で止まった家康を輪の中心へ寄せ、また床几へ歩いて戻るのをくり返していた（act bot 834秒・29回）。
      //   着いたと見なす輪を 6.5m に広げ、救済は行き先（床几の前）へ歩幅で押す。押せない時だけ、画面の外なら行き先へ歩幅4mで寄せる（輪の中心へは寄せない）。
      if (u?.alive && !u.gone && !near(u.pos, d, 6.5) && (F.honjinChkT = (F.honjinChkT || 0) - dt) <= 0) {
        F.honjinChkT = 3;
        const last = F.honjinLast || (F.honjinLast = { x: u.pos.x + 9, z: u.pos.z });
        if (dist(u.pos, last) < 1.5) {
          const length = dist(u.pos, d), step = Math.min(4, length);
          const out = F.honjinPush || (F.honjinPush = { x: 0, y: 0, z: 0 });
          const q = localPoint(rt.army, u, out, u.pos.x + (d.x - u.pos.x) / length * step, u.pos.z + (d.z - u.pos.z) / length * step);
          if (dist(q, u.pos) > 0.3) {
            u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z);
          } else if (u.offscreen) {
            const nx = u.pos.x + (d.x - u.pos.x) / length * step, nz = u.pos.z + (d.z - u.pos.z) / length * step;
            if (rt.world.walkable?.(nx, nz) !== false) { u.pos.x = nx; u.pos.z = nz; u.pos.y = rt.world.heightAt(nx, nz); u.moveTo = null; }
          }
        }
        last.x = u.pos.x; last.z = u.pos.z;
      }
      // 目の前を歩く家康は到着まで待つ。近くて移せなかった時に到着だけ確定すると、
      // 桃配山の道中に座った家康と、陣場野の空の幕が離れて残ってしまう。
      g.dest = d;
      if (u?.alive && !u.gone && !near(u.pos, d, 6.5)) {
        g.order = 'move'; g.onArrive = F.honjinArrive;
      } else {
        g.onArrive = null; F.honjinArrive?.(g);
      }
    }
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
      // 何もしなくても物語は進む（kaito 11/3 K203）：赤備えと鉄砲衆が先手前に揃って九十秒たてば、本人が来なくても口火を切る（本人は後から追う）
      else if (!F.kaniWait && rt.t >= (F.kaniDoneT || 0) && assembled && rt.t - F.s1t > 90) this.stage2(rt);
    } else if (F.step === 2) {
      // 物見が残る間だけ、本人の組でない味方の刃を四割に（⑩と同じ。描かずの見張りで井伊の手が物見八人を本人より先に討ち切り、段2の討ち取り0のまま）
      const raidOn = (F.raid2 || []).some(alive);
      // 11/18 23:15 クラウド k06 持ち主：物見の組の真ん中が行き先の六歩に入らず、本人の三歩に来ても move のまま二十秒斬り合わなかった（描かずの足跡 71〜95秒）→誰か一人が本人の十二歩に入れば攻めに移す
      for (const g of F.raid2 || []) if (alive(g) && g.order === 'move' && g.units.some((u) => u.alive && !u.gone && near(u.pos, P, 12))) { g.order = 'attack'; g.aggro = 24; g.seekRange = 30; g.dest = null; g.onArrive = null; }
      if (raidOn && !F.ally10) { F.ally10 = new Map(); for (const g of rt.army.groups) if (g.team === 0 && !g.isPlayerSquad && !g.civ) { F.ally10.set(g, g.dmgMult); g.dmgMult = (g.dmgMult ?? 1) * 0.4; } }
      else if (!raidOn && F.ally10) this.ally10Back(rt);
      // 三度撃ちかけ終えて、主人公が鉄砲衆の脇にいれば退く
      // 本人が鉄砲衆の脇に来なくても、撃ちかけ終えて百秒たてば井伊は退く（K203 物語は進む）
      // 11/19 クラウド k06 持ち主：物見は七十七歩奥から駆けて二十三秒で着き、着いて十秒で段3へ移り退いた（描かずの足跡 79秒着・89秒段3。act bot 段2 の討ち取り 0）。
      //   本人の十二歩内に物見の兵が残る間は、七十五秒まで退きの下知を待つ（斬り合いの途中で退かせない）
      const raidHere = (F.raid2 || []).some((g) => alive(g) && g.units.some((u) => u.alive && !u.gone && !u.fleeing && near(u.pos, P, 12))) && rt.t - F.s2t < 75;
      if (F.vol >= 6 && !raidHere && (rt.t - F.s2t > 40 && near(P, NUKE, 36) || rt.t - F.s2t > 100)) this.stage3(rt);
    } else if (F.step === 3) {
      if (F.akaWait && alive(F.akashi) && (!alive(F.fuku) || near(F.fuku.center(), UKITA_F, 45) || rt.t - F.s3t > 35)) { F.akaWait = false; F.akashi.order = 'attack'; F.akashi.aggro = 40; F.akashi.seekRange = 60; }
      // 11/14 クラウドし K127：退く道で宇喜多の寄せに揉まれて BACK の14m に入れず③が162秒続いた回（act bot 2228）。物語は進む（K203）：45秒で40m 内・75秒で福島隊の槍合わせへ
      if (near(P, BACK, 14) && rt.t - F.s3t > 6 || near(P, BACK, 40) && rt.t - F.s3t > 45 || rt.t - F.s3t > 75) this.stage4(rt);
    } else if (F.step === 4) {
      if (F.akaWait && alive(F.akashi)) { F.akaWait = false; F.akashi.order = 'attack'; F.akashi.aggro = 40; F.akashi.seekRange = 60; }
      const left = nOf(F.akashi, F.akaGun, F.ukita2);
      F.ek = (F.akaN || 0) - left;
      // 春日神社に残ったまま味方が敵を減らしても、藤下へ続いた目標は済ませない。
      if (near(P, UKITA_F, 55)) { F.joined4 = true; F.fought4 += dt; }
      // 散った残兵だけで止めない。前線で槍を合わせ続ければ宇喜多の反撃へ移る。
      //   11/13 クラウドさ K126：討ち減らしても七十秒は槍を合わせ続ける（三十八秒で次へ移り、段が細切れだった）
      if (near(P, UKITA_F, 55)) this.quietSally(rt, dt, 4);
      // 11/19 06:50 クラウド k06 持ち主：明石の槍の手が三度とも打って出て尽きた後、印で六秒なにも起きない★★が五回に一回（act bot 0609-2：181秒）。
      //   四度目を出すと討てない明石の付きまといで倒れた（0624-3）→三度出し切って五秒空けば、宇喜多の本隊が押し返しに出る⑤へ移す（K203 物語は進む）
      const S4 = F.qs4;
      if (F.joined4 && near(P, UKITA_F, 55) && (left <= Math.round(F.akaN * 0.85) && F.fought4 >= 100 || F.fought4 >= 160 || S4 && S4.n >= 3 && S4.quiet > 5 && F.fought4 >= 40)) this.stage5(rt);
    }
    // 11/18 夜50-20：④⑤で福島の隊が十六人を割ったら、春日神社の後ろから後備が一度だけ槍を揃えて前へ出る（本人のそばに味方の塊を残す。本物の兵）
    if ((F.step === 4 || F.step === 5) && !F.fukuB && alive(F.fuku) && F.fuku.count < 16) {
      F.fukuB = true; room(rt, 18);
      const c = F.fuku.center();
      F.fukuB = ally(rt, '福島の後備', { x: c.x + 16, z: c.z + 4 }, [{ type: 'samurai', n: 4 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 11 }], FUKUSHIMA, { fullStrength: true, formation: 'yari', width: 14 });
      F.fukuB.defMult = 1.8;
      const pp = rt.player.u.pos;
      goAttack(F.fukuB, { x: (c.x + pp.x) / 2, z: (c.z + pp.z) / 2 }, 30, 40);
      rt.say('福島正則', '後備、前へ！　槍を揃えて宇喜多を押し返せ！', 3);
    }
    if (F.step === 5) {
      // 宇喜多は崩れない。福島隊のそばで押し返しを受けた時間だけを数える（討ち減らしの数でなく持ちこたえ）
      if (near(P, UKITA_F, 55)) { F.held5 += dt; this.quietSally(rt, dt, 5); }
      if (!F.wave2b && F.held5 > 28) {
        F.wave2b = true; room(rt, 24);
        F.ukita4 = foe(rt, '宇喜多の二の備', { x: UKITA_F.x - 24, z: UKITA_F.z - 30 }, [{ type: 'samurai', n: 4 }, { type: 'gun', n: 4 }, { type: 'ashigaru', n: 12 }], UKITA, { morale: 100, noRout: true });
        goAttack(F.ukita4, { x: FUKU.x - 24, z: FUKU.z - 6 });
        rt.say('明石全登', '宇喜多の槍は一万七千。押し返せ、福島を川まで追え！', 3.5);
      }
      if (F.held5 >= HOLD5S && rt.t >= S5_MIN_T) this.stage6(rt);
    } else if (F.step === 6) {
      // 救援の印は固定の陣前へ。大将が離れたり隊が尽きても、散った隊を追い続けさせない。
      if (near(P, RLINE, 20)) this.stage7(rt);
    }
    // 討てない将や散った隊の中心ではなく、実際の任務の印への到着に応じる。
    // 出入りだけで声を重ねず、持ち場で敵が接近してから槍を合わせる。寝返り後の反転は妨げない。
    // 11/18 クラウド k06 持ち主：⑨天満山の麓・⑩左近の柵前で、印に着いても六秒なにも起きなかった（act bot 872秒・1129秒）。
    //   印のそばに敵がいない時は、一番近い戦える組（九十歩内）を本人へ寄せる。⑩は左近の手が柵の口から打って出る（史実でも左近は柵を出て黒田に横撃ちされた）。
    // 11/18 クラウド k06 持ち主：⑨で崩した明石・宇喜多の手の足軽が、⑪の島津の段に「攻め」の下知のまま加藤の手の脇で二十秒止まっていた（act bot 1530秒）。
    //   崩した手は二秒ごとに見て、下知が逃げでなければ崩れ直させる（崩れない印 noRout も外す）
    if (F.step >= 9 && rt.t >= (F.reRoutT || 0)) {
      F.reRoutT = rt.t + 2;
      for (const g of [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4, ...(F.qs4?.groups || []), ...(F.qs5?.groups || [])]) if (alive(g) && (g.order !== 'flee' || !g.routed)) { g.noRout = false; rout(g); }
    }
    if (F.step === 4 || F.step === 5 || F.step === 7 || F.step === 8 || F.step === 9 || F.step === 10) {
      // ⑩の印は左近の隊の真ん中に立つ（柵前の点ではない）。着いたと見るのも印と同じ所で
      const pin = F.step === 10 && alive(F.sakonG) ? F.sakonG.center() : this.missionPin(rt);
      if (F.contactStep !== F.step) { F.contactStep = F.step; F.contactInside = false; }
      if (!near(P, pin, 18)) F.contactInside = false;
      if (!F.contactInside && near(P, pin, 10) && rt.t - (F.contactT ?? -99) >= 8) {
        F.contactInside = true; F.contactT = rt.t;
        const right = F.step === 7 || F.step === 8;
        rt.say(right ? '平塚為広' : F.step === 10 ? (F.sakonShot ? '石田の兵' : '島左近') : F.step === 9 ? '宇喜多の兵' : '明石全登',
          right ? '刑部さまの前は一歩も通さぬ！' : F.step === 10 ? '押し返せ！　柵の口へ一歩も寄せるな！' : F.step === 9 ? '殿を落とせ！　天満山の麓で食い止めよ！' : '宇喜多の槍、受けてみよ！', 3);
        rt.army.play('eshout', pin, 1.2);
        if (F.step !== 8) {
          const groups = right ? [F.otani, F.otaW1, F.otaW2] : F.step === 10 ? [F.sakonG] : F.step === 9 ? [F.shingari, F.koniR, F.s9rest] : [F.akashi, F.akaGun, F.ukita2, F.ukita3, F.ukita4];
          // 印のそばの戦える兵の隊だけを寄せる。護衛を失った不死身の将を一人で呼び出さない。
          const fit = (u) => u.alive && !u.gone && !u.fleeing && !u.invuln && !u.noTarget && !u.campProtected;
          let pick = groups.find((g) => alive(g) && g.units.some((u) => fit(u) && near(u.pos, pin, 12))), best = 90;
          if (!pick) for (const g of groups) if (alive(g)) for (const u of g.units) if (fit(u) && dist(u.pos, P) < best) { best = dist(u.pos, P); pick = g; }
          if (pick) goAttack(pick, P, 24, 30);
          // ⑨で殿と小西の後備が九十歩内に一人もいない時は、天満山の林から宇喜多の残兵が踏みとどまって出る（明石の手の残り）。数えには入れない
          // 11/20 k365-cloud-42：寄せた組が四十歩より遠いと六秒で届かず、印に着いて何も起きなかった（act bot 934秒）。
          //   その時も残兵を出す。前の残兵が尽きていれば三度まで出し直す
          if (F.step === 9 && (!pick || best < 90 && best > 40) && (!F.s9rest || !alive(F.s9rest)) && (F.s9n || 0) < 3) {
            F.s9n = (F.s9n || 0) + 1;
            room(rt, 10);
            const away = dist(P, CENTER9) > 1 ? { x: (CENTER9.x - P.x) / dist(P, CENTER9), z: (CENTER9.z - P.z) / dist(P, CENTER9) } : { x: -1, z: 0 };
            F.s9rest = foe(rt, '宇喜多の残兵', { x: P.x + away.x * 24 - 6, z: P.z + away.z * 24 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], UKITA, { morale: 70, aggro: 30, seekRange: 34 });
            goAttack(F.s9rest, P, 24, 30);
          }
        }
      }
    }
    // 11/20 k365-cloud-42：⑨の印に着いた時、前に一度印の内へ入っていると（contactInside のまま）声も寄せも起きず、六秒何も無かった（act bot 934秒）。
    //   印の十歩内で二十歩内に敵が四秒いなければ、宇喜多の残兵を本人の前に出す（三度まで・数えには入れない）
    if (F.step === 9 && !F.ending) {
      const q9 = near(P, this.missionPin(rt), 10) && !rt.army.nearestEnemy(rt.player.u, 20);
      F.s9idle = q9 ? (F.s9idle || 0) + dt : 0;
      if (F.s9idle > 4 && (!F.s9rest || !alive(F.s9rest)) && (F.s9n || 0) < 3) {
        F.s9idle = 0; F.s9n = (F.s9n || 0) + 1;
        room(rt, 10);
        const away = dist(P, CENTER9) > 1 ? { x: (CENTER9.x - P.x) / dist(P, CENTER9), z: (CENTER9.z - P.z) / dist(P, CENTER9) } : { x: -1, z: 0 };
        F.s9rest = foe(rt, '宇喜多の残兵', { x: P.x + away.x * 18, z: P.z + away.z * 18 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 7 }], UKITA, { morale: 70, aggro: 30, seekRange: 34 });
        goAttack(F.s9rest, P, 24, 30);
        rt.say('宇喜多の兵', '殿を落とせ！　天満山の麓で食い止めよ！', 3);
      }
    }
    if (F.step === 7) {
      // 線の近くで大谷隊を受けた時間を数える。寝返りは十分半ごろ（早く着いても、線を支え続ける）
      if (near(P, RLINE, 40)) F.held7 += dt;
      if (!F.otaW2 && F.held7 > 36) {
        room(rt, 20);
        F.otaW2 = foe(rt, '戸田勝成の手', { x: HIRA.x - 10, z: HIRA.z - 20 }, [{ type: 'samurai', n: 3 }, { type: 'gun', n: 3 }, { type: 'ashigaru', n: 10 }], OTANI_LK, { morale: 100, noRout: true, noAI: true, historicalOrders: true, stay: true });
        F.otaW2.dmgMult = 0.6; F.otaW2.dmgMultPlayer = 0.3;
        goAttack(F.otaW2, { x: RLINE.x - 8, z: RLINE.z - 10 }, 30, 40);
        rt.say('戸田勝成', '大谷の手はまだあるぞ。押せ！', 3);
      }
      if (F.held7 >= HOLD7S && rt.t >= FLIP_MIN_T && near(P, RLINE, 40)) this.stage8(rt);
    } else if (F.step === 8) {
      if (F.turned && !F.n8) F.n8 = Math.max(1, nOf(F.otani, F.otaW1, F.otaW2));
      // 11/19 06:15 クラウド k06 持ち主：⑧の197秒、本人の討ち取りが三回とも0（act bot 0550・0600）。寝返った小早川と藤堂・京極が大谷方を先に討ち切る。
      //   ⑩と同じく、打って出た平塚・戸田の新手が残る間だけ本人の組でない味方の刃を四割に（兵の数と敵の強さは変えない）。新手が尽きるか大谷が崩れれば元へ
      const sallyOn8 = (F.qs8?.groups || []).some(alive);
      if (sallyOn8 && !F.ally10) { F.ally10 = new Map(); for (const g of rt.army.groups) if (g.team === 0 && !g.isPlayerSquad && !g.civ) { F.ally10.set(g, g.dmgMult); g.dmgMult = (g.dmgMult ?? 1) * 0.4; } }
      else if (!sallyOn8 && F.ally10) this.ally10Back(rt);
      const since = F.flipT ? rt.t - F.flipT : 0;
      // 桃配山などへ離れたまま、寝返りと大谷の最期を見ずに任務が済むのを防ぐ。
      // 残兵が地形に詰まっても、本人が右翼へ戻れば最長時間の条件で進める。
      // 赤座勢の離反は下山開始から七十六秒。先に兵が減っても、四家が離反する前に大谷を自害させない。
      if (F.turned && near(P, RLINE, 80) && (since >= 140 && nOf(F.otani, F.otaW1, F.otaW2) <= Math.round(F.n8 * 0.5) || since >= FALL_MAX)) this.otaniFall(rt);
    } else if (F.step === 9) {
      const left = nOf(F.shingari, F.koniR);
      F.ek = (F.akaN || 0) + (F.c9N || 0) - left;
      // 遠くで待った時間を突破の手柄にしない。残兵が散った時の救済も、本人が中央戦線に加わった時間で数える。
      if (near(P, CENTER9, 60)) {
        F.fought9 = (F.fought9 || 0) + dt;
        // 11/18 クラウド k06 持ち主：⑨の空き（本人の二十二歩内に敵なし 114/187秒）→⑦⑩と同じく、十秒空けば宇喜多の旗本が打って出る（三度まで）
        this.quietSally(rt, dt, 9);
        // 11/18 ホ五：麓で殿・後備・残兵が皆倒れ、印に着いても何も起きない間を作らない。八秒空なら残兵をもう一隊（二度まで・数えには入れない）
        const sees9 = [F.shingari, F.koniR, F.s9rest].some((g) => alive(g) && g.units.some((u) => u.alive && !u.gone && !u.fleeing && dist(u.pos, P) < 45));
        F.empty9 = !sees9 && near(P, CENTER9, 30) ? (F.empty9 || 0) + dt : 0;
        if (F.empty9 > 5 && (F.s9n || 0) < 3 && F.fought9 < 200) {
          F.s9n = (F.s9n || 0) + 1; F.empty9 = 0; room(rt, 10);
          F.s9rest = foe(rt, '宇喜多の残兵', { x: P.x - 22, z: P.z + 8 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 6 }], UKITA, { morale: 70, aggro: 30, seekRange: 40 });
          goAttack(F.s9rest, P, 24, 30);
        }
        if (F.fought9 >= 160 && left <= Math.round(F.c9N * 0.45) || F.fought9 > 290) this.westFall(rt);
      } else if (near(P, CENTER9, 90)) {
        // 11/19 08:05 クラウド k06 持ち主：印は麓の八十歩まで敵を探して立つ（front9）ので、麓の六十歩の外の印に着くと打って出が回らず、
        //   六秒なにも起きなかった（act bot 0747-2・933秒 ★★）。印の届く九十歩内なら空きの打って出だけは回す（手柄の時は数えない）
        this.quietSally(rt, dt, 9);
      }
      // 11/19 08:15 クラウド k06 持ち主：打って出を四度出し切った後も麓で六秒なにも起きなかった（act bot 0803-2・998秒 ★★）。
      //   出し切って本人の二十二歩内に敵のいない間が五秒続き、麓で九十秒以上戦っていれば、宇喜多の殿は尽きたと見て崩れへ進める
      if ((F.qs9?.n || 0) >= 4 && F.qs9.quiet > 5 && (F.fought9 || 0) >= 90 && near(P, CENTER9, 90)) this.westFall(rt);
    } else if (F.step === 10) {
      const left = nOf(F.sakonG, F.sakonGun);
      F.ek = (F.akaN || 0) + (F.c9N || 0) + (F.c10N || 0) - left;
      // 柵の口の前で押し合った時間だけを数える（遠くで待っても破れない）
      if (near(P, SAKON_FRONT, 60)) {
        F.fought10 += dt;
        // 押し合いの半ばで、黒田の鉄砲衆が左近を撃つ（史実）。左近は手負いで下がり、隊は崩れかける
        if (!F.sakonShot && F.fought10 > 55) {
          F.sakonShot = true;
          rt.army.play('volley', { x: SAKON_FRONT.x + 20, z: SAKON_FRONT.z - 6 }, 1.4);
          rt.say('黒田の鉄砲頭', '左近じゃ！　放てっ！', 2.5);
          rt.after(3, () => rt.say('島左近', 'ぐっ……まだじゃ。退くな……！', 3));
          rt.after(7, () => { const g = F.sakonG; if (g?.leader?.alive && !g.leader.gone) rt.army.despawn(g.leader); if (alive(g)) { g.morale = 60; g.noRout = false; } rt.say('石田の兵', '左近さまが撃たれた！', 2.5); });
        }
        // 11/18 夜50-20：描かずの通しで⑩の260秒のうち147秒、本人の二十歩内に敵が一人もいなかった（左近の手は黒田・加藤・小早川に先に削られる。act bot「斬り合う相手が少なくて退屈」）。
        //   史実でも石田の陣は柵の内から何度も打って出た。本人のそばに敵がいない間が十秒続けば、柵の口から石田の新手が本人へ打って出る（三度まで・数えには入れない）
        this.quietSally(rt, dt, 10);
        // 11/18 18:10 クラウド k06 持ち主：描かずの足跡で、柵の口から打って出た石田の新手（十四人）が本人の三〜八歩に九〜十四人いても、黒田・加藤の手が十〜四十秒で討ち切り、⑩の本人の討ち取りは新手三度とも0（1110〜1202秒）。
        //   新手が残っている間だけ、本人の組でない味方の刃を四割に（三木の出城と同じ・兵の数と敵の強さは変えない）。新手が尽きるか柵が破れれば元へ
        const sallyOn10 = (F.qs10?.groups || []).some(alive);
        if (sallyOn10 && !F.ally10) { F.ally10 = new Map(); for (const g of rt.army.groups) if (g.team === 0 && !g.isPlayerSquad && !g.civ) { F.ally10.set(g, g.dmgMult); g.dmgMult = (g.dmgMult ?? 1) * 0.4; } }
        else if (!sallyOn10 && F.ally10) this.ally10Back(rt);
        // 11/18 夜50-20：味方の侍が柵の外 (-342,-164) から柵の内の石田の鉄砲衆を狙い、口の前で詰まって二十秒立った（act bot 1667秒）。
        //   柵の外の味方の槍・刀は、柵の内の敵を狙わない（一秒ごとに柵の外の一番近い敵へ替える。いなければ狙いを外す）
        if (rt.t >= (F.fenceAimT || 0)) {
          F.fenceAimT = rt.t + 1;
          const me = rt.player.u.team;
          for (const u of rt.army.units) {
            if (!u.alive || u.gone || u.isPlayer || u.team !== me || u.type === 'gun' || u.type === 'bow' || u.pos.x < FENCE_X + 0.5) continue;
            const t = u.target; if (!t || !t.alive || t.pos.x > FENCE_X - 0.5) continue;
            let best = null, bd = 30;
            for (const o of rt.army.units) if (o.alive && !o.gone && o.team !== me && !o.fleeing && o.pos.x > FENCE_X + 0.5) { const d = Math.hypot(o.pos.x - u.pos.x, o.pos.z - u.pos.z); if (d < bd) { bd = d; best = o; } }
            u.target = best; u.aiT = 0;
          }
        }
        if (F.fought10 >= S10_MIN && left <= Math.round(F.c10N * 0.45) || F.fought10 >= S10_MAX) this.sakonFall(rt);
      }
    } else if (F.step === 12) {
      const g = F.w12 === 2 ? F.sute2 : F.sute1, at = F.w12 === 2 ? SUTE2 : SUTE1, left = nOf(g);
      // 11/18 20:20 クラウド k06 持ち主：退く島津の本隊の足軽二人が、持ち場の百歩後ろ（-184,-47）で二十秒立ち尽くした（act bot 1607秒・号令 retreat）。
      //   二秒ごとに見て、持ち場から二十歩より遠いのに八秒ほとんど動かない島津の兵は、隊を離れて散り散りに落ちる（討たせない印 campProtected はそのまま）
      F.shiStrT = (F.shiStrT || 0) + dt;
      if (F.shiStrT > 2 && F.shima) {
        F.shiStrT = 0;
        for (const u of F.shima.units) if (u.alive && !u.gone && !u.fleeing && !u.mounted && u.moveTo) {
          const S = u._shiSt || (u._shiSt = { x: u.pos.x, z: u.pos.z, n: 0 });
          const far = Math.hypot(u.moveTo.x - u.pos.x, u.moveTo.z - u.pos.z) > 20, still = Math.hypot(u.pos.x - S.x, u.pos.z - S.z) < 1;
          S.n = far && still ? S.n + 1 : 0; S.x = u.pos.x; S.z = u.pos.z;
          if (S.n >= 4) { u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.atk = null; u.swing = null; }
        }
        // 11/19 05:05 クラウド k06 持ち主：退く島津義弘（馬・討たせない）が本人の三歩内で六秒なにもせず立った（act bot 0450-2・1719秒・★）。
        //   馬の者も入れて、討たせない島津の兵が本人の四歩内で四秒打ちかからずにいれば、隊を離れて伊勢路の方へ駆け去る
        for (const u of F.shima.units) if (u.alive && !u.gone && !u.fleeing && u.campProtected) {
          const close = near(u.pos, P, 4) && !u.atk && !(u.swing && !u.swing.done);
          u._shiNear = close ? (u._shiNear || 0) + 1 : 0;
          if (u._shiNear >= 2) { u.fleeing = true; u.fleeT = rt.army.time; u.target = null; u.atk = null; u.swing = null; }
        }
      }
      if (F.chojuU && !F.chojuSaid && (!F.chojuU.alive || F.chojuU.gone)) {
        F.chojuSaid = true;
        rt.say('井伊の兵', '討ち取ったは……義弘ではない！　身代わりじゃ！', 3.2);
        rt.after(3.6, () => { if (!F.ending) rt.say('本多忠勝', '見事な死に様よ。……追え、本物はまだ先じゃ！', 3.2); });
      }
      // 坂の前で押し合った時間だけを数える（本陣で待っても崩れない）
      if (near(P, at, 60)) F.fought12 += dt;
      // 11/18 23:25 クラウド k06 持ち主：捨て奸の印に着いても六秒なにも起きない（act bot 1599秒・★★）＝座った兵が味方に討たれて印のそばに残らず、押し合いの時間だけを待っていた。
      //   印の十四歩に着いて、今の手の兵が本人の二十五歩に一人もいない間が四秒続けば、その手は崩れたと見て次の手（または終わり）へ
      const sees12 = alive(g) && g.units.some((u) => u.alive && !u.gone && !u.fleeing && near(u.pos, P, 25));
      F.empty12 = near(P, at, 14) && !sees12 ? (F.empty12 || 0) + dt : 0;
      if (F.empty12 > 4) { F.empty12 = 0; F.fought12 = Math.max(F.fought12, S12_MAX); }
      if (near(P, at, 60) && (F.fought12 >= S12_MIN && left <= Math.round(F.c12N * 0.45) || F.fought12 >= S12_MAX || !alive(g) && F.fought12 > 10)) {
        if (F.w12 === 1) {
          F.w12 = 2; F.fought12 = 0;
          rout(F.sute1); room(rt, 24);
          // 11/18 クラウド（k06 持ち主）：act bot「もっと強い奴と斬り合いたい」・名のある将を本人が討った数が六回とも0（敵の将は皆 討てない将）。
          //   二の手に長寿院盛淳を置く（義弘の陣羽織を着て「島津兵庫頭これにあり」と名乗り、身代わりに討ち死にした家老＝『惟新公御自記』ほかの伝え）。
          //   討てる将（不死身でない）。数えと時切れ（S12_MAX）はそのままなので、討たなくても段は進む
          F.sute2 = this.suteGroup(rt, '島津の捨て奸 二の手', SUTE2, [{ type: 'busho', n: 1, o: { name: '長寿院盛淳', horse: false } }]);
          F.chojuU = F.sute2.units.find((u) => u.name === '長寿院盛淳');
          rt.after(9, () => { if (F.chojuU?.alive && !F.ending) rt.say('長寿院盛淳', '島津兵庫頭、これにあり！　討って手柄にせよ！', 3.4); });
          F.c12N = nOf(F.sute2);
          rt.marker('foe', () => this.missionPin(rt), '島津の捨て奸 二の手', { red: true, group: F.sute2 });
          for (const q of [F.ii, F.iiGun, F.honda]) if (alive(q)) goAttack(q, { x: SUTE2.x + (q === F.iiGun ? 14 : 0), z: SUTE2.z - 14 }, 24, 30);
          rt.say('使番', '一の手、崩れた！　坂の上にまた座り込んでおりますぞ！', 3.5);
          rt.after(6, () => rt.say('島津の兵', 'チェストォ！　一人も通すな！', 2.5));
        } else this.win(rt);
      }
    } else if (F.step === 11 && F.shima) {
      // 11/18 クラウド k06 持ち主：⑪の空き（本人の二十二歩内に敵なし 100/189秒）に島津の先駆けを打って出させたら、描かずの通しで⑪が189→442秒に延びた（先駆けと斬り合う間に本陣で受けられない）。呼ぶのを止めた（quietSally の⑪の枝は残す）
      this.quietSally(rt, dt, 11);   // 本陣の前で待つ間だけ島津の先駆けが斬り込む（本陣の外へは誘わない）
      const n = nOf(F.shima);
      if (alive(F.shima)) F.shima.morale = 100;   // 島津は退き口の間、崩れて逃げ戻らない（前へ抜けるだけ）
      F.shiK = F.shiN - n;
      // 島津が本陣の前に来て押し合い、主人公がその前に立って受け続ける（島津は勝ち負けに関わらず伊勢路へ抜けていく＝史実）
      //   11/14 クラウドさ K127：島津は着いた後も受けの輪の縁（44〜46m）を出入りし、本人は島津の兵と斬り合いながら本陣の西50〜90m にいて
      //   受けの時計が5秒のまま七十秒止まった（act bot 1031〜1096秒）。着いた後は輪を60mに、島津の兵と26m内で斬り合っていれば受けと数える。
      // 隊列が道に長く伸びても、先頭の義弘が本陣前に留まっていれば受け合いは続いている。
      const shL = alive(F.shima) && F.shima.leader?.alive && !F.shima.leader.gone ? F.shima.leader.pos : null;
      const receiving = alive(F.shima) && (near(F.shima.center(), HOLD5, F.shiAt ? 60 : 45) || !!F.shiAt && !!shL && near(shL, HOLD5, 30));
      const engagedP = alive(F.shima) && F.shima.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.noTarget && near(P, u.pos, 26));
      // 11/14 クラウドす K127：島津は本陣の前の受けの輪（45m）の西の縁（約43m）で止まって押し合う事が多く、その前で斬り合う本人は
      //   本陣から40m の外になり受けの時計が進まなかった（act bot：島津の段 780秒・1260秒の時切れ）。島津の隊の30m内で受けていれば数える。
      const atHold = near(P, HOLD5, 40) || receiving && (near(P, F.shima.center(), 30) || engagedP);
      // 本陣を挟んで遠くに立つだけでは、退き口を受けた事にしない。
      if (receiving && atHold && F.shima.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.noTarget && near(P, u.pos, 26))) F.shiMet = true;
      // 本陣まで来た島津を受け切った後、残兵が尽きても守備の時計を止めない。
      // 到着前に減っただけでは果たさず、主人公が本陣の前にいる間だけ数える。
      const repelled = !!F.shiAt && (!alive(F.shima) || !F.shima.units.some((u) => u.alive && !u.gone && !u.fleeing && !u.noTarget));
      // 本陣の前に着く前に兵に揉まれて止まったら、少しずつ前へ押し出す（足止めで退き口が来ないまま終わらない）
      if (!F.shiAt && alive(F.shima) && (F.shiChkT = (F.shiChkT || 0) - dt) <= 0) {
        F.shiChkT = 5;
        const c = F.shima.center(), d = F.shima.dest;
        if (F.shiLast && d && dist(c, F.shiLast) < 8) {
          const L = Math.max(1, dist(c, d)), ux = (d.x - c.x) / L, uz = (d.z - c.z) / L;
          // 足止めの救済でも柵・陣幕・深みは抜けない。通れる脇へ避け、入れ物は使い回す。
          const out = F.shiPush || (F.shiPush = { x: 0, y: 0, z: 0 });
          const step = Math.min(4, dist(c, d));
          for (const u of F.shima.units) if (u.alive && !u.gone) {
            const q = localPoint(rt.army, u, out, u.pos.x + ux * step, u.pos.z + uz * step);
            u.pos.x = q.x; u.pos.z = q.z; u.pos.y = rt.world.heightAt(q.x, q.z);
          }
        }
        F.shiLast = { x: c.x, z: c.z };
      }
      // 11/19 04:00 クラウド k06 持ち主：印は義弘が本陣の三十歩内へ来ると義弘を指すが、隊の真ん中が受けの輪（45m）の外だと
      //   隊は退き道の下知（noAI・旗本の守り）のままで、義弘の前に着いた本人に誰も打ちかからず六秒空いた（act bot ⑪）。
      //   本人が義弘の十六歩内へ来たら、隊の真ん中を待たずに受け合いを始める
      if (!F.shiAt && alive(F.shima) && shL && near(shL, HOLD5, 30) && near(P, shL, 16) && !receiving) F._shiEarly = (F._shiEarly || 0) + 1;
      // 11/21 K468 クラウドせ：島津が遠くの損耗で溶けなくなり（十六人ほどで着く）、義弘が本陣の前に着いても後ろの兵が道に伸びて隊の真ん中が輪の外のまま、⑪が五百五十秒止まった（act bot 1回）。義弘が本陣の二十歩内に着けば着いたと見る
      if (!F.shiAt && (receiving || shL && near(shL, HOLD5, 20) || shL && near(shL, HOLD5, 30) && near(P, shL, 16))) {
        F.shiAt = rt.t; F.shima.defMult = 1; F.shima.order = 'attack'; F.shima.aggro = 30; F.shima.seekRange = 30;
        F.shima.onArrive = null; F.shima.path = null;
        F.shima.retreatOnly = false; F.shima.noAI = false; F.shima.keepMoveOrder = false; F.shima.fire = true;
      }
      // 11/19 05:20 クラウド k06 持ち主：受け合いを始めても、隊の真ん中が受けの輪の外だと本人が本陣の四十歩の外になり「受けた」と見なさず、
      //   島津の兵は旗本の守り（campProtected・刃が通らない）のままで、義弘の印に着いた本人に六秒なにも起きなかった（act bot 0508-2・1520秒・★★）。
      //   本人が義弘の十六歩内に来たら受けたと見なし、守りを外して斬り合う（受けの時計は今まで通り本陣の前でだけ数える）
      if (F.shiAt && !F.shiMet && shL && near(P, shL, 16)) F.shiMet = true;
      // 主人公が笹尾山から戻る前に味方だけで全滅させると、接触できず任務が止まる。
      // 到着だけでは守りを外さず、主人公が退き口を受けた所から通常の戦いにする。
      if (F.shiAt && F.shiMet && !F.shiEngaged) {
        F.shiEngaged = true;
        for (const u of F.shima.units) u.campProtected = false;
      }
      // 到着後に離れた相手を追うと、受けの時計が止まったままになる。本陣前へ戻してから押し合いを続ける。
      if (F.shiAt && !receiving && alive(F.shima) && F.shima.order !== 'move') {
        F.shima.aggro = 0; F.shima.seekRange = 0;
        // 戻った後に広く追うと、また本陣の前から離れて遠くの兵を追い続けた（act bot：島津が東へ百m流れた）。戻りの後は近くだけ受ける
        goAttack(F.shima, HOLD5, 14, 16);
      }
      // 味方が島津を減らしただけでは果たさない。本陣の前で主人公が受けた時間だけを数える。
      // 主人公の到着が遅れても、受け終えるまでは島津を伊勢路へ進めない。
      if (F.shiAt && F.shiMet && (receiving || repelled) && atHold) F.shiHeld = (F.shiHeld || 0) + dt;
      // 豊久は義弘を逃がすため残って戦う殿。追った井伊直政は鉄砲で傷を負う（史実）
      if (F.shiMet && !F.toyoSaid) {
        F.toyoSaid = true;
        const toyohisa = F.shima.units.find((u) => u.name === '島津豊久' && u.alive && !u.gone && !u.woundOut);
        if (toyohisa) rt.say('島津豊久', '叔父上を落とせ！　ここは豊久が引き受け申す！', 3.5);
      }
      if ((F.shiHeld || 0) > HOLD_S * 0.6 && !F.iiHurt) {
        F.iiHurt = true;
        const naomasa = F.ii?.units.find((u) => u.name === '井伊直政' && u.alive && !u.gone);
        if (naomasa) {
          // 知らせだけで済ませず、本人も共通の手傷の動きで戦列から退く。
          naomasa.hp = Math.min(naomasa.hp, naomasa.maxHp * 0.28);
          naomasa.onWound = null;
          rt.army.generalWounded(naomasa, F.shima.leader);
          rt.say('使番', '井伊さま、島津の鉄砲に撃たれ手負い！', 3);
        }
        if (alive(F.ii)) goTo(F.ii, { x: HOLD5.x + 20, z: HOLD5.z - 30 });
      }
      // 陣場野への移動中に島津を受け終えても、家康・幕・馬印が着く前に首実検へ進めない。
      if (F.jinba && F.shiMet && (receiving || repelled) && (F.shiHeld || 0) >= HOLD_S && atHold) this.stage12(rt);
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
    // 11/19 K365 クラウド34：はじめの霧は百五十mだと晴れた野と変わらず、宇喜多の幟が素の色で見えていた。見通し九十五m（ほかの朝霧の戦と同じ）にして、
    //   六十m 先の先手と幟の林を霧の奥の灰の影に沈める。晴れ始め（八秒）と晴れ切り（四十秒）は kaito 11/9 の通り。?sekifog=150 で前
    const fogStart = globalThis.__sekiFog ?? (+(/[?&]sekifog=(\d+)/.exec(globalThis.location?.search || '')?.[1]) || 95);
    f.far = F.fogFar + (fogStart - F.fogFar) * k;
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
// 流しの足跡（playbot の跡）：⑩で島津の居所・受けの時計・本陣の着き・段の深みの札
k06_sekigahara.botDbg = (b) => { const F = b.flags; if (F.step !== 11) return ''; const c = alive(F.shima) ? F.shima.center() : null; return `e${F._shiEarly || 0}s${c ? c.x.toFixed(0) + ',' + c.z.toFixed(0) : '-'}i${F.shiI ?? ''}${F.shiAt ? 'A' : ''}${F.shiMet ? 'M' : ''}h${Math.round(F.shiHeld || 0)}${F.jinba ? 'J' : ''}${F.dp?.on ? 'D' : ''}${b.player.u.mounted ? 'U' : ''}`; };

// 素直な遊び手：近い敵を突き、いなければ段の行き先へ（③の退く間は戦わずに戻る）
k06_sekigahara.botBrain = (b, inp, { goTo: go, patientStrike }) => {
  const pl = b.player, u = pl.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  const q = b.def.missionPin(b);
  // 持ちこたえる段は線の近くにいる事が大事。遠くの残兵を追わず、線から離れたら戻る。
  const returning = F.step === 5 && !near(u.pos, UKITA_F, 45) || F.step === 7 && !near(u.pos, RLINE, 32) || F.step === 8 && !near(u.pos, RLINE, 70) || F.step === 9 && !near(u.pos, CENTER9, 55) || F.step === 10 && !near(u.pos, SAKON_FRONT, 55) || F.step === 12 && !near(u.pos, F.sute2 ? SUTE2 : SUTE1, 55);
  // 退く段・移動の段・本陣への移動を、脇の敵への寄り道で止めない。
  const moving = F.step === 1 || F.step === 3 || F.step === 6 || F.step === 11 && !near(u.pos, HOLD5, 35) && !(F.shiAt && alive(F.shima) && near(u.pos, F.shima.center(), 30));
  // 討てない大谷の将も打ち込んでくる。攻める相手の選別より先に、実際に届く刃を受ける。
  // 移動中は救援・退き先への歩みを優先する。
  if (!moving && !returning && toyoGuard(b, inp, { goTo: go, patientStrike })) return;
  // 目標と無関係な本陣・別の持ち場へ斬り込み、通しが長引く寄り道を避ける。
  //   ⑥の抜ける道で張り付いた宇喜多の兵（三歩の内）は払う（払わず歩くと囲まれて討たれる）
  // 11/19 クラウド k06 持ち主：本人へ打って出た新手（quietSally）を bot が相手にせず、⑨で新手が四度出ても討ち取り1（act bot 1803秒）。その段の新手も目標に入れる
  const qsOn = (g) => [F.step <= 6 ? F.qs4 : null, F.step <= 6 ? F.qs5 : null, F.step === 7 || F.step === 8 ? F.qs7 : null, F.step === 8 ? F.qs8 : null, F.step === 9 ? F.qs9 : null, F.step === 10 ? F.qs10 : null].some((S) => !!S?.groups.includes(g));
  // 11/19 クラウド k06 持ち主：段2で鉄砲衆の脇へ斬り込む宇喜多の物見（raid2）も目標に（本人の五歩に物見が残っても bot が槍を出さず、段2 の討ち取り 0）
  const onTask = (g) => !!g && (qsOn(g) || F.step === 2 && !!F.raid2?.includes(g) || (F.step <= 6 ? g === F.akashi || g === F.akaGun || g === F.ukita2 || g === F.ukita3 || g === F.ukita4
    : F.step === 7 || F.step === 8 ? g === F.otani || g === F.otaW1 || g === F.otaW2
    : F.step === 9 ? g === F.shingari || g === F.koniR || g === F.s9rest
    : F.step === 10 ? g === F.sakonG || g === F.sakonGun
    : F.step === 11 ? g === F.shima || !!F.qs11?.groups.includes(g)
    : F.step === 12 && (g === F.sute1 || g === F.sute2)));
  // 11/11 クラウドへ：⑥で福島と宇喜多の押し合いの中を通ると、そばを過ぎる宇喜多の兵を次々に斬り続け、右翼へ九百秒出られなかった（act bot）。
  //   ⑥で払うのは自分に打ち掛かる兵だけ
  //   ⑪の本陣へ歩く道に出る島津の先駆け（quietSally）は払って進む
  const ok = (o) => (!moving || F.step === 6 && o.target === u || F.step === 11 && !!F.qs11?.groups.includes(o.group)) && !returning && onTask(o.group) && !o.gone && !o.fleeing && !o.invuln && !o.campProtected && !o.noTarget && !o.isStruct && Math.abs(o.pos.y - u.pos.y) < 4;
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
  if (F.step === 10) return cut(F.c10N, nOf(F.sakonG, F.sakonGun), Math.round(F.c10N * 0.45));
  if (F.step === 12) return cut(F.c12N, nOf(F.w12 === 2 ? F.sute2 : F.sute1), Math.round(F.c12N * 0.45));
  return null;   // 島津の退き口は討つ人数でなく、本陣の前で受けた時間で果たす
};
// 戦の進行の札（段）：F.step の 1〜12
setStages('k06_sekigahara', G.map((t, k) => (k ? [t, k + 1] : [t])));

export { k06_sekigahara };
export default k06_sekigahara;
