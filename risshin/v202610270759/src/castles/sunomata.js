// ======================================================================
// castles/sunomata.js … 墨俣の砦の縄張り（docs/quality-upgrade-plan.md 束2・fort-spec 4・22）
// castle_plan.js の riverFortPlan（岸の広場・本陣・水の堀・川）の形に倣い、長良川の洲に結った砦を書く。
// 川は東（x 62〜112）。砦の内（柵・土塁）は b_sunomata.js の buildFort が手で結う（壊せる柵・破れ目の当たりを持つため）。
// ここでは、場の当たり（砦の内・岸の舟着き）・物見・外の空堀・寄せの道（斎藤の寄せ手が選ぶ三つ）を持つ。
// ======================================================================
import { riverFortPlan, rectPoly } from '../castle_plan.js';

export const FORT = 18;
// 南西からの街道。南西の控え（-128, 90）の隊列の南を回り、荷駄の合流点へ戻す。
// 濃尾平野の自然堤防上の往来を参考にした遊びの道筋。永禄年間の街道の復元ではない。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
// 兵の配置と人数を保ち、隊列・家並み・東の刈田を踏み抜かないよう地表の道だけを迂回させる。
export const ROAD3 = [[-176, 120], [-150, 118], [-100, 118], [-90, 86], [-36, 44], [0, 24]];
// 南西の在所は自然堤防上。東の湿った刈田へ踏み込まず、家並みの西脇から街道へつなぐ。
// 岐阜県の教材「濃尾平野の自然堤防帯」を参考にした地勢の補い。当時の道の復元ではない。
// https://gakuen.gifu-net.ed.jp/~contents/mizubunka/html/01010211/01010211_nr01.html
// 家の軒・西の控え・荷駄の既存の道をよけ、地面の色と草木の除外に共通の道を使う。
const VILLAGE_ROAD = [[-121, 180], [-121, 150], [-121, 118]];
VILLAGE_ROAD.w = 1.4;
// 南の控えは街道から孤立させず、隊列の外縁へ細い踏み道を通す。
// 自然堤防沿いの道を参考にした遊びの補いで、永禄年間の軍道の復元ではない。
// 分岐は既存の街道上。湿った刈田・隊列・荷駄と後詰の待機場所を避ける。
// 北と西の寄せ口、南門への進路には新しい障害物や高低差を作らない。
const CAMP_ROAD = [[-60, 62 + 2 / 3], [-58, 84], [-58, 112], [0, 116], [54, 116], [54, 104]];
CAMP_ROAD.w = 1.2;
// 南西の織田の控えも、南側へ回した街道から取り残さない。
// 隊列の南端から街道までを結び、北の兵列・南の家並み・東の刈田を避ける。
// 陣内の往来を表す遊びの補いで、当時の軍道を復元したものではない。
// 地面の色と草木の除外だけを共用し、兵・足場・形・材質は増やさない。
const SOUTHWEST_CAMP_ROAD = [[-128, 102], [-128, 118]];
SOUTHWEST_CAMP_ROAD.w = 1.2;
// 西の控えから寄せ場へ続く踏み道。控えだけ伐開すると、二の手の進路が河畔林で途切れる。
// 濃尾平野の自然河川・河畔林を参考にした陣内の補いで、史料に残る軍道ではない。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
// 東向きの控え（中心 -150,-12、幅十二・奥行き四十メートル）の中に道を敷かず、
// 南側の外縁から既存の寄せ手の出発点へ結ぶ。道幅と兵の体の余地も空ける。
// 空堀の手前で止め、川・土橋・柵際の地形は保つ。陣内の往来の補いで、史実の陣道ではない。
// 地面の色と植樹除外は共通の道を使い、新しい形・材質・毎コマの生成を加えない。
const WEST_YOSE_ROAD = [[-150, 0], [-138, 2], [-122, 2], [-66, 2], [-40, 0]];
WEST_YOSE_ROAD.w = 1.8;
// 北西の控えも林の中で孤立させず、北の寄せ道へ結ぶ。
// 北の横隊の南側を回り、支流の浅瀬より北で既存の道へ合流する。
// 濃尾平野の河畔林を参考にした陣内の補いで、当時の軍道の復元ではない。
// https://www.cbr.mlit.go.jp/kisokaryu/chisui/01noubi.html
// 地表の色と草木の除外に既存の道の仕組みを使う。兵の位置・人数・寄せ方は保つ。
// 北西の備えは幅二十四・奥行き三十メートルを斜めに向けている。
// 中心から道を引くと横隊を斜めに貫くため、東の伐開縁から既存の道へつなぐ。
// 川辺の設営上の補いで、当時の陣跡を示すものではない。
const NORTH_YOSE_ROAD = [[-96, -106], [-92, -124], [-76, -130], [-14, -130], [0, -118]];
NORTH_YOSE_ROAD.w = 1.8;
// 東岸の控えも草地へ孤立させず、二列の備えの間を南北の踏み道で結ぶ。
// 地学案内が示す水運の拠点という立地を参考にした陣内の補い。軍道の復元ではない。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
// 岸の寄せ列の中心（北百五十・南百四十二メートル）へ横道を入れると、待機中の兵列を貫く。
// 北は隊列の北側、南は隊列の北側の空き地へ回し、道幅と槍先の余地を残す。
// 南を外へ延ばすと古木曽川の岸へ入るため、合流口より手前で止める。陣跡の復元ではない。
// 既存の地表処理だけを使い、兵・川床・舟の航路・毎コマの処理は変えない。
const EAST_CAMP_ROAD = [[126, -160], [164, -160], [164, 132], [126, 132]];
EAST_CAMP_ROAD.w = 1.2;
// 北の横隊（中心 -30,-150、幅六十メートル）の東端を道で貫かない。
// 控えの東を回り、寄せ手の出発点より北で元の道へ戻す。人数・浅瀬・土橋は保つ。
// 水運の拠点という立地を参考にした陣内の補いで、当時の道筋の復元ではない。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
// 既存の地表処理を共用し、形・材質や毎コマの処理を加えない。
export const ROAD3N = [[0, -176], [12, -168], [12, -138], [0, -118], [0, -24], [0, -10]];
// 北の控えの南端を、北西の控えから来る踏み道へ結ぶ。横隊の中へ道は敷かない。
const NORTH_CAMP_ROAD = [[-30, -138], [-30, -130]];
NORTH_CAMP_ROAD.w = 1.2;
// 縄張り図は残らない。美濃の川辺の普請砦としての推定。舟着きへは南門を回る。
export const KISHI_ROAD = [[0, 24], [28, 24], [36, 10], [56, 10]];
// 材木の筏の係留岸（57, 40）まで荷揚げの踏み道をつなぐ。
// 地学案内の水運に適した立地を参考にした補いで、当時の道筋の復元ではない。
// https://geo-gifu.org/tour/12_tour/tour_12_4.html
// 河床の始まる東側へ張り出さず、舟の横断線・竹束・南の控えを避ける。
// 地表の色と草の除外だけで示し、形・材質・毎コマの処理は加えない。
const TIMBER_SHORE_ROAD = [[48, 10], [50, 24], [54, 36], [57, 40]];
TIMBER_SHORE_ROAD.w = 1.4;
// 小屋の実寸と位置を小道にも共用する。描く側だけで縮めたり動かすと、
// 兵糧小屋の戸口と踏み道が離れ、普請砦の往来が途切れてしまう。
// 配置自体は遊びの補いで、当時の縄張りの復元ではない。
export const SHEDS = [
  { name: '西の兵舎', x: -12, z: -6, w: 5, d: 3.4, rot: .08, kind: 'nagaya' },
  { name: '東の兵舎', x: 13, z: -3, w: 5, d: 3.4, rot: -.06, kind: 'nagaya' },
  { name: '材木の蔵', x: -13, z: 10, w: 4.4, d: 3.4, rot: Math.PI / 2, kind: 'yagura' },
  { name: '南門の番所', x: -7, z: 14, w: 3.8, d: 2.6, rot: Math.PI / 2, kind: 'yagura' },
  { name: '兵糧小屋', x: 11, z: 14, w: 3.8, d: 2.6, rot: -Math.PI / 2, kind: 'yagura' },
  { name: '普請の作業場', x: 13, z: 9, w: 4, d: 2.6, rot: -Math.PI / 2, kind: 'yagura' },
].map((p) => ({ ...p, w: p.w * .85, d: p.d * .85 }));
// 戸口の先を空けた小道。兵の持ち場を動かさず、中央・南門・小屋をつなぐ。
export const SHED_ROADS = SHEDS.map((p) => {
  const x = p.x + Math.sin(p.rot) * (p.d / 2 + 1.2);
  const z = p.z + Math.cos(p.rot) * (p.d / 2 + 1.2);
  const lane = p.x < 0 ? (p.z >= 12 ? -4 : -6) : 6;
  return [[x, z], [lane, z], [lane, 10], [0, 10]];
});
export const SUNOMATA_PATHS = [ROAD3, ROAD3N, KISHI_ROAD, TIMBER_SHORE_ROAD, VILLAGE_ROAD, CAMP_ROAD, SOUTHWEST_CAMP_ROAD, WEST_YOSE_ROAD, NORTH_YOSE_ROAD, NORTH_CAMP_ROAD, EAST_CAMP_ROAD, [[0, 24], [0, 10], [0, -.5]], ...SHED_ROADS];

// 歩く地面に盛り土を含める。南門は盛らず、普請中の北の口も越せる緩い土塁。
export function sunomataGround(x, z, h) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d < FORT + 5) {
    const t = Math.max(0, Math.min(1, (FORT + 5 - d) / 3));
    h += (.35 - h) * t;
    const bank = Math.max(0, Math.min(1, (d - FORT + 1.4) / 1.4, (FORT + 3.2 - d) / 3.2));
    const mouth = z > FORT - 2 ? Math.max(0, Math.min(1, (Math.abs(x) - 3.5) / 1.5)) : 1;
    h += .7 * bank * mouth;
  }
  // 岸の広場は低い段。河床を覆わず、周囲へ三メートルでつなぐ。
  const shore = Math.max(22 - x, x - 57, -24 - z, z - 16);
  const t = Math.max(0, Math.min(1, 1 - Math.max(0, shore) / 3));
  if (t > 0) h += (.1 - h) * t;
  return h;
}

// 寄せの道（斎藤の寄せ手の頭が、毎回ここから選ぶ）。side は assaultFn の柵の向き（n 北・w 西）
// yose は寄せ場（竹束を押してここまでゆっくり寄せ、柵へ取り付く）。far は二の手（遠くから出る）の出口
export const YOSE = {
  kita: { id: 'kita', name: '北の畑', side: 'n', from: { x: 2, z: -64 }, far: { x: 2, z: -112 }, yose: { x: 0, z: -FORT - 14 }, dir: { x: 0, z: 1 }, flee: { x: 0, z: -1 }, pathLen: 46, chokeWidth: 3.2 },
  nishi: { id: 'nishi', name: '西の林の口', side: 'w', from: { x: -66, z: 2 }, far: { x: -122, z: 2 }, yose: { x: -FORT - 14, z: 0 }, dir: { x: 1, z: 0 }, flee: { x: -1, z: 0 }, pathLen: 48, chokeWidth: 3.4 },
};
export const SIDE_WORD = { n: '北', w: '西', e: '東', s: '南' };

// 外の空堀：北と西の柵の外を回る（北の道の所は土橋として切る）。深さ 1.1・幅 8 で、
// 斜面は 35 度より緩い（world.walkable で登れる）。寄せ手はここで足が鈍る
export const HORI = [
  { kind: 'karabori', pts: [[-31, 24], [-31, -31], [-4, -31]], deep: 1.1, w: 8 },
  { kind: 'karabori', pts: [[4, -31], [31, -31], [31, -22]], deep: 1.1, w: 8 },
];

const R = riverFortPlan({ name: '墨俣の砦', w: 2 * FORT });

export const SUNOMATA_PLAN = {
  ...R,
  name: '墨俣の砦',
  kuruwa: [
    // 砦の内（柵は buildFort が結うので wall は持たない）
    { id: 'toride', name: '砦の内', poly: rectPoly(-FORT, FORT, -FORT, FORT), level: 0.35 },
    // 岸の舟着き（riverFortPlan の「岸の広場」に当たる。東の柵と川の間）
    { id: 'kishi', name: '岸の舟着き', poly: rectPoly(FORT + 4, 57, -24, 16), level: 0.1 },
  ],
  koguchi: [{ id: 'minami', name: '南の冠木門', at: [0, FORT] }],
  paths: SUNOMATA_PATHS.map((pts) => ({ pts })),
  hori: HORI,
  // 物見：北西の柵内（寄せ手の来る北と西が見える。守りから切り離さない）と、岸の舟着き（川向こうと舟が見える）
  // 大垣市の砦という説明と、岐阜県の地学案内の丸太小屋程度という説明を参考にする。
  // https://geo-gifu.org/tour/12_tour/tour_12_4.html
  // 北西も下部を板壁と中段の張り出しで囲わず、既存の丸太組みの物見にする。
  // 位置・高さ・床・梯子・上の囲いは保つ。物見の構造自体は史料で確定しない遊びの補い。
  yagura: [{ id: 'monomiNW', name: '北西の物見', at: [-FORT + 5, -FORT + 5], height: 8.2, boarded: false }, { id: 'monomiKishi', name: '岸の物見', at: [FORT + 14, -15], height: 6.6, boarded: false }],
  river: { x: 62, x2: 112 },
};
