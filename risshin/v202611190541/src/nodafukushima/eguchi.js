// ======================================================================
// 野田・福島の戦い　終わりの段「江口の退き口」（12〜15分。docs/oda15_plan_1108.md の 10）
// - 詰め陣の守兵に合流した後、すぐ締めず、柴田勝家と和田惟政の殿に守られて江口の渡しへ退く（敵陣の間を抜けて退却）。
// - 江口では一揆が舟を隠し、退く列を待ち伏せする（公記）。払って渡しへ着けば、本の締め（winEnd）へ。
// ======================================================================
import { sfx } from '../audio.js';

export const MISSION = '柴田の殿に続き、江口の渡しへ退け';
const DEST = { x: 40, z: 150 };
// 北の合流場所から渡しへ直進すると、本陣の背面の陣幕に突き当たる。
// 東の外を回って南の兵道へ戻す。印と遊び手に同じ経由点を使う。
const CAMP_ROUTE = [{ x: 60, z: 28 }, { x: 60, z: 58 }, { x: 40, z: 68 }];
// 深手で戦えない兵や退いた兵を、渡しを塞ぐ残兵に数えない。
const fighting = u => u.alive && !u.fleeing && !u.dying && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget && !u.gone;

// ctx：{ enemyGroup, makeRoom, dress, ikko, friends[], done() }
export function start(rt, ctx) {
  const F = rt.flags;
  if (F.nodaEguchi) return;
  const S = F.nodaEguchi = { t0: rt.t, done: false, k: 0, at: DEST,
    route: rt.player.u.pos.z >= 58 ? CAMP_ROUTE.length : 0 };
  rt.marker('nodaEguchi', () => CAMP_ROUTE[S.route] || DEST, '江口の渡し', { h: 3, guideAlways: true, alwaysDistance: true });
  for (const g of ctx.friends) if (g && g.count && !g.routed) {
    g.onArrive = null; g.order = 'move'; g.noAI = false; g.dest = { x: DEST.x + (Math.random() - 0.5) * 16, z: DEST.z - 10 - Math.random() * 10 };
  }
  try { sfx('sig_nobiki', 0.6); } catch (e) { /* 音が無くても進む */ }
  rt.say('前田利家', 'よう戻った。だが、ここも長くは持たぬ。殿の柴田殿に続き、江口の渡しへ退くぞ！', 4.2);
  rt.after(10, () => !S.done && rt.say('柴田勝家', '殿は柴田が受け持つ。振り返るな、走れ！', 3.2));
  // 時間だけでは渡しへ着いた事にしない。待ち伏せを払い、本人が着くまで待つ。
  function ambush() {
    if (S.k || S.done || rt.t < (S.spawnAt || 0)) return;
    S.spawnAt = rt.t + 5;
    if (ctx.makeRoom(rt, 12) < 12) return;
    const g = ctx.enemyGroup(rt, { faction: 'honganji', name: '舟を隠した門徒', anchor: { x: DEST.x + 20, z: DEST.z - 34 }, facing: -Math.PI / 2, aggro: 16, seekRange: 50, width: 10, morale: 90 },
      ctx.dress([{ type: 'ashigaru', n: 9 }, { type: 'gun', n: 3 }], ctx.ikko));
    if (!g || !g.count) return;
    // 11/18 クラウド k365-cloud-13（act bot：退く段で畦道の門徒とこの組に一太刀55で囲み倒された）：一太刀を半分に（数は同じ）
    g.dmgMult = 0.5;
    S.k = 1; S.aT = rt.t;
    // 11/10 クラウド：本人だけを狙って八十歩も追わせると、殿から離れた本人が十二人に囲まれて倒れた（act bot 970秒）。
    //   待ち伏せは渡しの手前で待ち、近い者から相手にする。殿と退く列もこの門徒へ向き直って払う。
    g.ikko = true; g.order = 'attack'; g.focus = null; g.seekRange = 22; S.g = g;
    let n = 0;
    for (const f of ctx.friends) if (f && f.count && !f.routed && n < 3) { n++; f.order = 'attack'; f.dest = { x: DEST.x + 20, z: DEST.z - 34 }; f.focus = g.units[0] || null; f.seekRange = Math.max(f.seekRange || 0, 30); }
    rt.marker('nodaAmbush', () => { const u = g.units.find(fighting); return u ? { x: u.pos.x, z: u.pos.z } : null; }, '舟を隠した門徒', { red: true, group: g });
    rt.army.play('eshout', { x: DEST.x + 20, z: DEST.z - 34 }, 1.6);
    rt.say('足軽', '舟が無い！　一揆が舟を隠して待ち伏せしておったぞ！', 3.4);
    rt.after(3.6, () => !S.done && rt.say('前田利家', '道を開けよ！　払って渡しへ抜けるぞ！', 3));
  }
  function withdraw() {
    const g = S.g;
    // 追撃の対象を残すと、渡しへ抜ける主人公を退いた門徒が追い続ける。
    if (g && !g.routed) {
      g.onArrive = null; g.focus = null;
      g.dest = { x: DEST.x + 20, z: DEST.z - 34 };
      g.noRout = false; g.morale = 0; g.order = 'retreat';
    }
    // 門徒が先に敗走した場合も、殿と味方の列は追わず渡しへ戻る。
    for (const f of ctx.friends) if (f && f.count && !f.routed && f.order === 'attack') { f.focus = null; f.order = 'move'; f.dest = { x: DEST.x + (Math.random() - 0.5) * 16, z: DEST.z - 10 - Math.random() * 10 }; }
  }
  S.tick = () => {
    if (S.done || rt.over || !rt.player.u.alive) return;
    const p = rt.player.u.pos;
    const way = CAMP_ROUTE[S.route];
    if (way && Math.hypot(p.x - way.x, p.z - way.z) < 10) S.route++;   // 11/17 K358 iMac n-kiba（二度目：bot は 10m 内で着いたと見る。角の 6〜10m で立つと699秒に6秒なにも起きなかった）：印は 6m 内で『着いた』と見るのに、3m まで次の角へ進まず、その間に立つと何も起きなかった
    // 自分で陣の外を回った人も、北の経由点へ引き返させない。
    if (p.z >= 68) S.route = CAMP_ROUTE.length;
    if (!S.k && (p.z > DEST.z - 60 || rt.t - S.t0 > 45)) ambush();
    // 11/16 owner-3（写真：渡しへ退く間、広い野に本人一人と遠い五人だけ＝物差し③）：待ち伏せの前は、退く味方の組を本人の十歩先の道へ寄せ、
    //   本人と一緒に退く列に見せる（二秒ごと。組の数・速さは変えない）。
    if (!S.k && !(S.escortT > rt.t)) {
      S.escortT = rt.t + 2;
      const to = CAMP_ROUTE[S.route] || DEST, dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz) || 1;
      let i = 0;
      for (const g of ctx.friends) if (g && g.count && !g.routed && g.order === 'move') {
        const side = (i++ % 3 - 1) * 9;
        g.dest = { x: p.x + dx / d * 10 - dz / d * side, z: p.z + dz / d * 10 + dx / d * side };
      }
    }
    let left = 0;
    for (const u of S.g?.units || []) if (fighting(u)) {
      left++;
      // 渡しへ退く本人と待ち伏せが向き合ってから数える。遠くで待つだけでは進めない。
      // 殿が退かせた後の接近は、本人の撃退の戦功にしない。
      if (S.contestedAt == null && !S.cleared && !S.g.routed && S.g.order !== 'retreat' &&
          Math.hypot(p.x - DEST.x, p.z - DEST.z) < 50 &&
          Math.abs(u.pos.y - p.y) < 3 && Math.hypot(u.pos.x - p.x, u.pos.z - p.z) < 18 &&
          !rt.army.wallBetween(p, -1, u.pos) && !rt.army.terrainBlocks(p, u.pos)) S.contestedAt = rt.t;
    }
    // 殿が支える間に残兵を退かせる。少数の残敵を討ち尽くすまで渡しで足止めしない。
    // 待ち伏せが道の外で止まっても、出撃から百六十秒で退く。
    // 本人が渡しへ着く条件は残し、接敵していない退却に戦功は付けない。
    if (!S.cleared && S.g && (S.contestedAt != null && rt.t - S.contestedAt > 120 || rt.t - S.aT > 160)) {
      withdraw();
      S.cleared = true;
      rt.unmark('nodaAmbush');
      // 長く防いで退かせた時も、接敵後の戦功を一度だけ残す。
      // cleared を立てた後は下の残兵減少の処理へ入らない。
      if (S.contestedAt != null) rt.award((t) => t.side.push('江口で待ち伏せの門徒を払った'), '江口の待ち伏せを払った');
      rt.say('柴田勝家', '門徒が退くぞ！　追うな、江口の渡しへ抜けよ！', 3.2);
    }
    const clear = S.cleared || !S.g || S.g.routed || left <= 3;
    if (S.k && clear && !S.cleared) {
      S.cleared = true; rt.unmark('nodaAmbush'); withdraw();
      // 殿だけが払った待ち伏せを、まだ接敵していない本人の戦功にしない。
      if (S.contestedAt != null) rt.award((t) => t.side.push('江口で待ち伏せの門徒を払った'), '江口の待ち伏せを払った');
    }
    // 11/17 K358 iMac n-kiba（act bot：渡しのそばで待ち伏せが動かず6秒何も起きない、が3回に1回残った）：渡しの15m 内に本人がいて、
    //   まだ払えていない待ち伏せがあれば、毎回本人へ掛からせる（着いた一度だけでなく）
    if (S.k && !clear && S.g && !S.g.routed && S.g.count && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 15 && S.g.focus !== rt.player.u && rt.player.u.hp > 0.4 * (rt.player.u.maxHp || rt.player.u.hp)) {   // 11/18 ゲ三（act bot 二回続けて江口の退きで倒れた）：本人の命が四割を切ったら、待ち伏せを本人へ向け直さない
      S.g.order = 'attack'; S.g.dest = { x: p.x, z: p.z }; S.g.focus = rt.player.u; S.g.seekRange = Math.max(S.g.seekRange || 0, 60); S.g.aggro = Math.max(S.g.aggro || 0, 20);   // 殿の味方へ掛かっていても、渡しの本人を的にする
    }
    // 11/17 K358 iMac n-kiba（三度目・act bot 595秒）：待ち伏せが 20m 内まで寄って来ない時は、十四秒待たせず四秒半で渡す
    if ((S.k && clear || !S.k && S.arrivedAt != null && rt.t - S.arrivedAt > 4 || S.arrivedAt != null && rt.t - S.arrivedAt > (S.g?.units?.some((v) => fighting(v) && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < 20) ? 14 : 4.5)) && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 12) finish();   // 待ち伏せが出ないままでも八秒、出ても届かない（川や葦の向こうで寄れない）時も十四秒で渡しへ抜ける（11/17 K358 iMac n-kiba）   // 兵の枠が空かず待ち伏せが出ないままでも、着いて八秒で渡しへ抜ける
    // 11/19 K358 iMac n-kiba（描かずの通し：本人が渡しの二十六歩手前 (50,126) で二百秒止まり、渡しの十歩の輪に入れず1080秒の打ち切り）：
    //   段の始めから百五十秒たち、本人が渡しの四十歩内にいれば渡しへ抜ける
    if (rt.t - S.t0 > 150 && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 40) { finish(); return; }
    // 11/16 iMac n-mikata（K113・act bot「江口の渡しに着いても6秒なにも起きない」）：渡しに着いても待ち伏せが残る時は、右上の一行の進みで払う相手を示す
    else if (!S.arrived && !CAMP_ROUTE[S.route] && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 10.5) {
      S.arrived = true; S.arrivedAt = rt.t; if (!S.k) ambush(); rt.objProgress('main', '舟を隠した門徒を払い、渡しを開けよ');
      if (!S.k) rt.say('柴田勝家', '浅瀬じゃ。舟は無いが、歩いて渡れるぞ！', 3);   // 11/17 K358 iMac n-kiba（act bot 629秒：待ち伏せが出ない時、着いて6秒なにも起きない）：着いたら必ず一言、四秒で渡す
      // 11/17 K358 iMac n-kiba（act bot：渡しに着いても待ち伏せの門徒が 40m 先で動かず、6秒何も起きない）：着いたら待ち伏せが本人へ掛かる
      if (S.g && !S.g.routed && S.g.count) { S.g.order = 'attack'; S.g.dest = { x: p.x, z: p.z }; S.g.seekRange = Math.max(S.g.seekRange || 0, 60); S.g.aggro = Math.max(S.g.aggro || 0, 20); }
    }
    // 11/18 クラウド k365-cloud-13（act bot：佐久間の列へ退く道で、渡しの十六歩手前より寄れず六分たって1080秒の打ち切り）：
    //   退き始めから百五十秒たち、渡しから二十五歩の内にいれば、そこで渡しへ抜けた事にする（待つだけで済ませない時間は保つ）
    if (!S.done && rt.t - S.t0 > 150 && Math.hypot(p.x - DEST.x, p.z - DEST.z) < 25) finish();
  };
  function finish() {
    if (S.done) return;
    S.done = true;
    rt.unmark('nodaEguchi'); rt.unmark('nodaAmbush');
    withdraw();
    // 余韻：渡しから振り返ると、砦に本願寺の旗。十一年の戦の始まり
    rt.say('足軽', '振り返れば、砦にも堤にも南無阿弥陀仏の旗じゃ……', 3.4);
    rt.after(3.8, () => { if (!rt.over && rt.player.u.alive) rt.say('柴田勝家', '殿は渡り終えた。舟を出せ！', 2.8); });
    rt.after(7, () => { if (!rt.over && rt.player.u.alive) ctx.done(); });
  }
}
export function active(rt) { const S = rt.flags.nodaEguchi; return !!S && !S.done; }
export function bot(b, goTo, p, inp, strike) {
  const S = b.flags.nodaEguchi;
  if (!S || S.done) return false;
  const u = p.u;
  const way = CAMP_ROUTE[S.route];
  if (way) { goTo(p, inp, way.x, way.z, 2); return true; }
  if (S.g && !S.cleared) {
    let e = null, best = Infinity;
    for (const v of S.g.units) if (fighting(v)) { const d = Math.hypot(v.pos.x - u.pos.x, v.pos.z - u.pos.z); if (d < best) { best = d; e = v; } }
    // 渡しへ退く任務の範囲で戦う。追い回して遭遇判定の外へ離れない。
    if (e && best < 30 && Math.hypot(u.pos.x - S.at.x, u.pos.z - S.at.z) < 50 &&
        Math.hypot(e.pos.x - S.at.x, e.pos.z - S.at.z) < 40) {
      p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
      if (best > 2.2) goTo(p, inp, e.pos.x, e.pos.z, 2); else strike(p, inp, e, best);
      return true;
    }
  }
  goTo(p, inp, S.at.x, S.at.z, 4);
  return true;
}
