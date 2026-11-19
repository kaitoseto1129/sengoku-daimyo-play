// ======================================================================
// 小田原征伐　囲みの陣の帯（台帳 K146・docs/odawara_spec_1109.md「城も巨大だが、囲んでいる方がもっと巨大」）
// 前の作り：囲みの大名の陣は西の外に陣幕一つと幟二本ずつ（hojin.js）で、東の徳川の陣からは霞の向こうに消えていた。
//   遊ぶ人のいる東から見回すと、囲みの広がりが見えなかった（11/13 司令塔「遠景の大名の旗の列と包囲の広がりが乏しい」）。
// 作り：総構えの外を一回りする「陣の帯」。各大名の受け持ちごとに、その家の幟を二列に並べ、間に陣幕・篝火・旗竿の束を置く。
//   兵の絵は置かない（K285 noFake。幟は兵ではない）。幟は束（InstancedMesh）で描くので軽い。篝火も束（kagaribiBatch）。
//   東の徳川の受け持ちは、山王川の東の岸に沿って北の山まで。北の山の尾根には徳川の諸将と羽柴秀次の勢。西は宇喜多・織田信雄・秀次。
//   帯の切れ目：遊ぶ人と bot の道（井伊の陣〜家康の本陣・山王川の渡り・浜の道）には置かない。
// 入れ方：b_t12_odawara.js の支度で place(rt) を一度。world.treeDensity で clearAt(x, z) の所は木を生やさない。
// ======================================================================
import { nobori, jinmaku, kagaribiBatch, hatazao, umajirushi } from '../props.js';
import { MEM_TIGHT } from '../settings.js';
import { distToPolyline } from '../world.js';

// [線, 家の旗（先頭から順に繰り返す）, 陣幕を置く間（m）]。線は城から見て外の側。布陣図 docs/fujin/t12_odawara.md の方角どおり
export const BANDS = [
  // 東：徳川家康の受け持ち。山王川の東の岸を北の山まで（井伊の陣と家康の本陣の間の道は z -150〜-120 で空ける）
  { pts: [[136, -168], [138, -200], [140, -232]], flags: ['tokugawa', 'honda', 'tokugawa', 'sakakibara'], jin: 30 },
  // 北東の尾根：徳川の諸将（本多・榊原）。家康の本陣の背の山
  { pts: [[178, -236], [140, -240], [96, -244]], flags: ['honda', 'tokugawa', 'sakakibara', 'tokugawa'], jin: 26 },
  // 北：羽柴秀次の勢（蒲生氏郷・細川忠興らと。旗は秀次の桐で代える）。総構えの北の外
  { pts: [[84, -248], [30, -250], [-20, -248], [-54, -242]], flags: ['toyotomi', 'toyotomi', 'kiri53'], jin: 28 },
  // 北西：織田信雄
  { pts: [[-62, -226], [-66, -180], [-62, -140]], flags: ['nobukatsu'], jin: 26 },
  // 西：宇喜多秀家（早川口の外）
  { pts: [[-56, -100], [-50, -60], [-46, -24]], flags: ['ukita'], jin: 24 },
  // 南西：小早川隆景・堀秀政（石垣山の麓。早川の南）
  { pts: [[-90, 52], [-70, 58], [-50, 60]], flags: ['kobayakawa', 'hori'], jin: 22 },
];

// 帯の大将の陣（陣幕・馬印・旗竿の束）。帯の旗と同じ家で、東から見える所を厚く
const JIN = [
  ['tokugawa', 148, -226, 'ogi'],      // 家康の本陣の背の山の陣（徳川の旗本の後備え）
  ['honda', 122, -238, null],          // 本多忠勝
  ['sakakibara', 166, -232, null],     // 榊原康政
  ['toyotomi', 20, -258, null],        // 羽柴秀次（北の口）。11/19 K365 クラウド38：千成瓢箪は秀吉の馬印。秀次本人の馬印は伝わらないので立てない（docs/generals_look_1108/羽柴秀次.md）
  ['nobukatsu', -76, -186, null],
];

// 道を空ける所（遊ぶ人と bot が通る）：この近さの幟は置かない
const KEEP_OUT = [
  [[164, -90], [138, -96], [146, -114], [152, -154], [170, -160]],   // 井伊の陣〜見張りの土手〜家康の本陣
  [[150, -58], [96, -18], [6, 34], [-64, 82]],                       // 浜の道（普請場へ）
];
const keepOut = (x, z) => KEEP_OUT.some((l) => distToPolyline(x, z, l) < 9);

// 木を生やさない所（帯の上と脇）。world.treeDensity から呼ぶ
export function clearAt(x, z) {
  for (const b of BANDS) if (distToPolyline(x, z, b.pts) < 6) return true;
  return false;
}

export function place(rt) {
  const W = rt.world, sc = rt.scene;
  const step = MEM_TIGHT ? 4.6 : 3.4;   // 幟の間（携帯は少し広く。数を三割ほど減らす）
  const fires = [];
  let n = 0;
  for (const b of BANDS) {
    let walked = 0, nextJin = b.jin * 0.5, k = 0;
    for (let i = 1; i < b.pts.length; i++) {
      const [ax, az] = b.pts[i - 1], [bx, bz] = b.pts[i];
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      // 線の外向き（城から遠い側）：二列目はそちらへ 2.4m ずらし、半歩ずらして互い違いに
      const nx = -uz, nz = ux;
      for (let s = 0; s < L; s += step, walked += step) {
        const x = ax + ux * s, z = az + uz * s;
        if (keepOut(x, z) || W.waterDepthAt?.(x, z) > 0.2) continue;
        const kind = b.flags[k++ % b.flags.length];
        const h = 6 + ((k * 7) % 3) * 0.5;
        sc.add(nobori(W, x, z, kind, h)); n++;
        const x2 = x + nx * 2.4 + ux * step * 0.5, z2 = z + nz * 2.4 + uz * step * 0.5;
        if (!MEM_TIGHT || k % 2) { sc.add(nobori(W, x2, z2, kind, h - 0.8)); n++; }
        if (k % 4 === 0) fires.push([x - nx * 1.6, z - nz * 1.6]);
        if (walked >= nextJin) {
          nextJin += b.jin;
          // 陣幕は帯の外側（城から遠い側）に。口は城の方へ開く向きを選べないので、幕の口（南）が見えても良い
          const jx = x + nx * 9, jz = z + nz * 9;
          if (!keepOut(jx, jz)) {
            sc.add(jinmaku(W, jx, jz, 10, 7, 4, { mon: kind }));
            sc.add(hatazao(W, jx - 6, jz, Math.atan2(ux, uz), 5, kind));
          }
        }
      }
    }
  }
  for (const [kind, x, z, uma] of JIN) {
    sc.add(jinmaku(W, x, z, 14, 10, 5, { mon: kind }));
    for (const [dx, dz] of [[-8, -6], [8, -6], [-8, 6], [8, 6]]) { sc.add(nobori(W, x + dx, z + dz, kind, 7)); n++; }
    if (uma) { const u = umajirushi(W, x, z - 7, 0, uma); u.position.y = W.heightAt(x, z - 7); sc.add(u); }
    fires.push([x - 4, z + 7], [x + 4, z + 7]);
  }
  if (fires.length) sc.add(kagaribiBatch(W, fires));
  rt.flags.kakoiFlags = n;
  return n;
}
