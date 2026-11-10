// ======================================================================
// 姉川の戦い　動く戦線（docs/anegawa_spec_1109.md「仕組みと見せ方」）
// - 三つの戦線（西＝徳川 対 朝倉・中央＝織田 対 浅井（磯野）・東＝織田 対 浅井）に内部の値 FRONTLINE_POSITION（m。正＝敵側へ押した）。
//   中央は始め敵側へ十m→磯野の段破りで二十〜三十m押し込まれ→横槍の後に戻り、追い討ちで敵側へ。西は徳川の押しと朝倉の崩れで前へ。
// - 値が五m動くたびに軽い押し合い（clash）を押す・揺らす。旗の帯（軽い大軍）も前後させ、遠くからでも戦線が動くのを見せる。
// - 一つの戦線の勝ち負けが隣へ響く（西が崩れると浅井の前の備が下がる）。使番の知らせは本当に起きた事の後だけ。
// - 終わり：信長の追撃停止と、両陣の勝鬨（軍として終わる）。
// ======================================================================
import { sfx } from '../audio.js';

const RATE = 1.2;   // 戦線が一秒に動く m

function centerTarget(F) {
  if (F.step >= 2) return 30;
  if (F.step === 1) {
    if (F.inabaT) return 10;
    return [10, -10, -20, -30][Math.min(3, F.breach || 0)];
  }
  return 0;
}
function westTarget(rt, F) {
  if (F.westBroken) return 40;
  if (F.tkPush) return 12;
  if (F.step >= 1) return Math.sin(rt.t / 23) * 6 - 4;   // 朝倉も始めは強い：押したり戻ったり
  return 0;
}
function eastTarget(F) {
  if (F.step >= 2) return 25;
  if (F.inabaT) return 18;
  return centerTarget(F) * 0.5;
}

export function install(rt) {
  const F = rt.flags;
  if (F.aneSen) return;
  const pos = F.FRONTLINE_POSITION = { west: 0, center: 0, east: 0 };
  const shown = { west: 0, center: 0, east: 0 };
  const said = {};
  let acc = 0;
  const live = () => !F.ending && !rt.over && rt.player?.u?.alive;
  const tell = (key, who, line, d = 3.6) => {
    if (said[key] || !live()) return;
    said[key] = true; rt.say(who, line, d);
  };
  const clashOf = { west: 0, center: 1, east: 2 };
  F.aneSen = {
    tick(dt) {
      if (!live()) return;
      acc += dt;
      if (acc < 1) return;
      const step = acc; acc = 0;
      // 徳川の動きが来ないまま長引いた時の見切り（西が崩れないと横槍も出ない）
      if (!F.tkPush && F.step >= 1 && rt.t - (F.stepT || 0) > 700) releaseWest(rt);
      const want = { west: westTarget(rt, F), center: centerTarget(F), east: eastTarget(F) };
      for (const k of Object.keys(pos)) {
        const d = want[k] - pos[k];
        pos[k] += Math.sign(d) * Math.min(Math.abs(d), RATE * step);
        // 五m動くたびに、軽い押し合いを押す（見た目で戦線が動く）
        const moved = pos[k] - shown[k];
        if (Math.abs(moved) >= 5) {
          shown[k] = pos[k];
          const c = F.clash?.[clashOf[k]];
          if (c && !c.B?.routed) {
            c.push?.(moved > 0 ? 'A' : 'B', 0.12);
            c.shake?.(moved > 0 ? 'B' : 'A', 8);
          }
        }
      }
      // 磯野が段を破った：中央が本当に下がった時だけ
      if (F.step === 1 && !F.inabaT && (F.breach || 0) >= 1 && pos.center < 0) {
        tell('center', '使番', '中央、押されております！　磯野勢が段を破り申した！');
      }
      // 徳川が朝倉を押し始めた（榊原の手が取り付いて朝倉が揺れた後）
      if (F.tkPush && !F.westBroken && pos.west > 5) {
        tell('tkPush', '使番', '徳川勢、朝倉を押しております！');
      }
      // 西が崩れた：浅井の側面が危うい。前の備の旗を下げ、真柄の討死を伝える
      if (F.westBroken && !said.west) {
        said.west = true;
        // 川べりの前の備だけ（野村の長政の本陣と、その手前の備は追い討ちの道なので動かさない）
        const q = F.azDA?.[0];
        if (q?.m && !q.m.army?.rout) q.m.retreat?.(6, 6);
        F.westBrokenT = rt.t;
      }
      // 隊が崩れただけでは討死にしない。実際の討ち取りを確認した後、戦況の知らせに続ける。
      if (F.westBroken && F.magaraKilled && !said.magara && (F.westReported ? rt.t - (F.westReportedT ??= rt.t) >= 6 : rt.t - F.westBrokenT >= 60)) {
        tell('magara', '使番', '朝倉の真柄直隆、徳川勢に討たれ申した！', 3.4);
      }
      // 横槍の後：押されていた織田の段が一斉に前へ（全軍の反撃）
      if (F.inabaT && !said.counter) {
        said.counter = true;
        for (const q of F.odaLayers || []) q?.m?.advance?.(34, 14, { charge: true });
        try { sfx('taiko', 0.9); } catch (e) { /* 音が無くても進む */ }
        rt.army?.play?.('toki', { x: 0, z: 30 }, 1.6);
      }
    },
  };
  // 榊原の手が朝倉の脇へ取り付く時刻（b_anegawa.js の tokugawa から六十二秒）
  if (F.sakakiGo != null) F.tkPush = rt.t - F.sakakiGo >= 62;
}

// 朝倉も始めは強い：西の押し合いは、徳川の別手が脇へ取り付くまで崩れない（setup で西の押し合いを始めた直後に呼ぶ）
export function holdWest(rt) {
  const c = rt.flags.clash?.[0];
  if (c?.o) c.o.noRout = true;
}
function releaseWest(rt) {
  const c = rt.flags.clash?.[0];
  if (c?.o) c.o.noRout = false;
}
// 徳川の別手が朝倉の脇へ取り付いた：四十秒押し合ってから、朝倉が崩れてよい
export function tkPush(rt) {
  const F = rt.flags;
  if (F.tkPush) return;
  F.tkPush = true;
  rt.after(20, () => { if (!rt.over && !F.ending) F.clash?.[0]?.push?.('A', 0.25); });
  rt.after(40, () => releaseWest(rt));
}

// 追撃停止と勝鬨（ending から）
export function end(rt) {
  const F = rt.flags;
  if (F.aneSenEnd || rt.over) return;
  F.aneSenEnd = true;
  rt.after(1, () => {
    if (rt.over) return;
    rt.say('使番', '御屋形様より！　追うな、陣を整えよとの仰せ！', 3.6);
  });
  rt.after(3.5, () => {
    if (rt.over) return;
    rt.army?.play?.('eiei', { x: -20, z: 160 }, 1.2);   // 信長の本陣
    rt.after(2.5, () => { if (!rt.over) rt.army?.play?.('eiei', { x: -200, z: 120 }, 0.6); });   // 遠く西で徳川も
  });
}
