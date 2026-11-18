// ======================================================================
// 岩村城・水晶山　後半（9〜15分）「降伏の使者・開城・戦後」（docs/oda15_plan_1108.md 20）
//   ① 麓の登り口を固めた夜、城の太鼓が止み、逃げ出した者が下りて来て降る（城方の気の落ち）。続いて白旗の使者が下りて来る。本人は使者を柵の内の信忠の本陣まで送る（移動を出来事に）。
//   ② 本体の勝ち（水晶山の囲みを守った）の後、「十一日の後」。昼の麓へ場面替え：開かれた城から武田の城兵が列で下り、
//      先頭に秋山虎繁とおつやの方。織田の兵が道の両側で見送る。最後に信長公記の結末（長良川）と余韻。
// 兵は逃げ出した者四人・使者二人と、開城の列十人（どれも狙わせない）。字は台詞と任務の一行・時の見出しだけ。
// ======================================================================
import { enemyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { k15Fade } from '../oda15_kit.js';

export const GOAL = '白旗の使者を、柵の内の信忠様の本陣へ送り届けよ';
export const LEN = 46;
const HONJIN = { x: 0, z: 34 };
const ENVOY_SPEED = 2.8;   // 早足。2.2 では九十九折りを戻るだけで二分半かかった

export function active(rt) { const K = rt.flags.iwKaijo; return !!K && !K.ok; }
export function pin(rt) {
  const K = rt.flags.iwKaijo, e = envoy(rt);
  if (!K || !e) return null;
  const path = K.g.path, p = rt.player.u.pos;
  if (!path || path.length < 2 || K.ok) return e.pos;
  // 使者から離れた時も、切岸を横切らず同じ山道の折れを通って戻る。
  const q = K.guide || (K.guide = { x: 0, z: 0 });
  const from = roadPosition(path, p, q), to = roadPosition(path, e.pos);
  if (Math.hypot(p.x - q.x, p.z - q.z) > 3) return q;
  const direction = to > from ? 1 : -1;
  for (let i = direction > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1;
    i >= 0 && i < path.length && (direction > 0 ? i < to : i > to); i += direction) {
    q.x = path[i][0]; q.z = path[i][1];
    if (Math.hypot(p.x - q.x, p.z - q.z) > 2) return q;
  }
  return e.pos;
}
function roadPosition(path, p, out) {
  let best = Infinity, at = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    const x = a[0] + dx * t, z = a[1] + dz * t, d = Math.hypot(p.x - x, p.z - z);
    if (d >= best) continue;
    best = d; at = i - 1 + t;
    if (out) { out.x = x; out.z = z; }
  }
  return at;
}
export function envoy(rt) { const K = rt.flags.iwKaijo; return K?.g?.units.find((u) => u.alive) || null; }

function quiet(g) {
  g.aggro = 0; g.seekRange = 0; g.noAI = true; g.noHunt = true; g.peaceful = true;
  // 戦わない者も、実際に歩いて持ち場へ着いたかを数える。
  g.arriveNoncombat = true;
  for (const u of g.units) { u.noTarget = true; u.target = null; u.atk = null; u.swing = null; u.bind = null; u.invuln = true; }
}

// 本体の win の頭で呼ぶ。true の間は勝ちにしない
export function hold(rt) {
  const F = rt.flags;
  if (F.iwKaijo?.ok) return false;
  if (!F.iwYoru) yoru(rt);
  return true;
}

// 麓の登り口を固めた夜：城の太鼓が止み、城から逃げ出した者が下りて来て降る（城方の気の落ち）。その後で白旗の使者
function yoru(rt) {
  const F = rt.flags;
  F.iwYoru = { at: rt.t };
  for (const g of rt.army.groups) if (g.team === 1 && !g.routed) { quiet(g); g.order = 'hold'; }
  rt.say('河尻秀隆', '登り口は固めた。……城の太鼓が止んだな', 3.2);
  rt.after(6, () => { if (!rt.over) rt.say('足軽', '城の中から、泣く声が聞こえる……', 3); });
  // 勝頼の後詰は来ない：城の武田の幟を、麓に近い物から一本ずつ下ろす（字は足さず絵で。十一日の後には全部無い）。
  const flags = (F.iwCastleFlags || []).slice().sort((p, q) => q.position.z - p.position.z);
  flags.forEach((o, i) => rt.after(8 + i * 5, () => { if (!rt.over) o.visible = false; }));
  rt.after(20, () => { if (!rt.over && !F.ending) rt.say('物見', '東の峠に、甲斐の狼煙は上がりませぬ。城の幟が下りていく', 3.6); });
  rt.after(12, () => {
    if (rt.over || F.ending) return;
    // 11/18 夜50-29：九十九折りの道の上に縦に並んで座ると、後から下りる白旗の使者が門前で百三十秒つかえ、道を外れて切岸へ迷った（描かずの流し）。
    //   城の木戸の下まで来た所から、麓の道の脇の平場（終わりの場面で本人の組が立つ側）へ寄って座る。道は空けておく。
    const f = F.restPath[0];
    const g = enemyGroup(rt, { faction: 'takeda', flag: null, name: '城から逃げ出した者', fixed: true, noGuard: true, anchor: { x: 0, z: -104 }, facing: 0, width: 2, formation: 'loose', morale: 100, noRout: true, speed: 1.8 },
      [{ type: 'ashigaru', n: 4, o: { flag: null } }]);
    quiet(g);
    g.order = 'path'; g.pathIdx = 0; g.dest = null;
    g.path = [[0, -100], [f[0] + 9, f[1] - 2]];
    g.onArrive = (q) => { q.order = 'hold'; };
    F.iwYoru.g = g;
    rt.say('物見', '城の搦手から、誰か下りて来ます！　……刀を捨てておる', 3.4);
  });
  rt.after(24, () => { if (!rt.over && !F.ending) rt.say('城から逃げ出した者', '城には、もう食う物がない。馬も食うた……どうか命ばかりは', 4); });
  rt.after(29, () => { if (!rt.over && !F.ending) rt.say('河尻秀隆', '縄をかけて後ろへ送れ。城の気は落ちた。じきに使者が来よう', 3.6); });
  // 11/18 夜50-29：act bot で使者の段（待ち44秒＋付き添い約150秒）が斬り合いの無いまま三分続いた。台詞の間を詰め、使者は城の門前から下ろす。
  rt.after(34, () => { if (!rt.over && !F.ending && !F.iwKaijo) start(rt); });
}

function start(rt) {
  const F = rt.flags;
  const K = F.iwKaijo = { at: rt.t, s: 0 };
  // 夜討ちの直後に降伏したように見せず、使者が出る前に日付を区切る。
  // 11/18 夜50-29：戦が十分半（決まりは四〜七分）。使者の付き添いが門前から本陣まで約百五十秒で一番長かった。
  //   十一日の後への暗転の間に、使者はもう麓へ下り、本人が九十九折りの中ほどで迎えた所から始める（門前と下の二つの折れを省く）。
  const rp = F.restPath || [[0, -90], [-20, -62], [20, -34], [0, -6], [0, 10]];
  const a = rp[1], c = rp[2], mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const ux = c[0] - a[0], uz = c[1] - a[1], ul = Math.hypot(ux, uz) || 1;
  k15Fade(rt, () => {
    rt.world.setTime('day');
    for (const o of F.iwCastleFlags || []) o.visible = false;
    const W = rt.world, put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); };
    const bx = mid[0] - ux / ul * 3, bz = mid[1] - uz / ul * 3;
    put(rt.player.u, bx, bz);
    for (const q of rt.squadGroups || []) {
      q.anchor.x = bx - ux / ul * 2; q.anchor.z = bz - uz / ul * 2; q.path = null; q.dest = null; q.pending = null;
      let i = 0;
      for (const u of q.units) if (u.alive) { const k = 2 + 1.2 * i++; put(u, bx - ux / ul * k + (i % 2 ? 0.6 : -0.6), bz - uz / ul * k); }
    }
    if (K.g) for (const [i, u] of K.g.units.entries()) if (u.alive) put(u, mid[0] + ux / ul * (0.5 - i * 1.4), mid[1] + uz / ul * (0.5 - i * 1.4));
    // 11/18 17:00 持ち主 クラウド（岩村）：act bot の位置の記録で、十一日の後の使者の段にも夜討ちの残り（柵に取り付いた武田勢 hold 4〜5人）が柵の前に立ったままだった。
    //   十一日の間に城の外の武田勢は討たれるか城へ逃げ込んでいる。暗転の間に、城の外（麓より手前）に残る武田の兵を下げる（使者は残す）。
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g === K.g) continue;
      for (const u of g.units) if (u.alive && !u.gone && u.pos.z > -88) { try { rt.army.despawn(u); } catch (e) { /* なし */ } }
    }
  }, '十一日の後', '十一月二十一日、岩村城から白旗の使者');
  // 城方の残る兵は打ちかからない（使者が下りる間）
  for (const g of rt.army.groups) if (g.team === 1 && !g.routed) { quiet(g); g.order = 'hold'; }
  try { sfx('kane', 0.5); } catch (e) { /* なし */ }
  rt.say('物見', '城の木戸が開いた……白い旗じゃ！　使者が山道を下りて参りました', 3.6);
  K.g = enemyGroup(rt, { faction: 'takeda', flag: null, name: '城方の使者', fixed: true, noGuard: true, anchor: { x: mid[0], z: mid[1] }, facing: Math.atan2(ux, uz), width: 2, formation: 'column', morale: 100, noRout: true, speed: ENVOY_SPEED },
    [{ type: 'samurai', n: 1, o: { name: '城方の使者', flag: null } }, { type: 'ashigaru', n: 1, o: { flag: null } }]);
  for (const [i, u] of K.g.units.entries()) { u.pos.x = mid[0] + ux / ul * (0.5 - i * 1.4); u.pos.z = mid[1] + uz / ul * (0.5 - i * 1.4); u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
  quiet(K.g);
  K.g.roadColumn = true; K.g.followColumnRoad = true; K.g.colW = 1; K.g.noRun = true;
  K.g.order = 'path'; K.g.pathIdx = 1; K.g.dest = null; K.g.formation = 'column';
  // 本陣へは、追撃で下った九十九折りの残りを戻る。切岸を直進しない。
  K.g.path = [mid, ...rp.slice(2), [HONJIN.x, HONJIN.z - 4]];
  K.g.onArrive = (q) => { q.order = 'hold'; K.arrived = true; };
  rt.obj('main', GOAL, 'main', true);
  rt.after(5, () => rt.say('河尻秀隆', '槍を下げよ。使者は討つな。柵の内の本陣まで、おぬしが付いて送れ', 4));
}

export function tick(rt) {
  const F = rt.flags, K = F.iwKaijo;
  if (!K || K.ok || rt.over || F.ending || !rt.player.u.alive) return;
  const e = envoy(rt), p = rt.player.u.pos;
  if (!e) return;
  // 付き添いが離れたら道の途中で待つ。本人を置いて本陣へ着き、勝手に任務を済ませない。
  const beside = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 14 && Math.abs(e.pos.y - p.y) < 4;
  if (!K.arrived) {
    // 待つ間も道に沿う列を保つ。構えへ替えると折れの後列が切岸へ出る。
    K.waiting = !beside;
    K.g.speed = beside ? ENVOY_SPEED : 0;
    // 11/18 夜50-29：本人が使者の前の狭い山道に立つと、使者は本人を避けられずに門前で百秒以上立ち止まった（描かずの流し）。
    //   麓の登り口でも、固めた味方の間で使者が百秒以上つかえた。三秒動けない時は、使者が道に沿って人の脇をすり抜ける。
    // 11/18 20:50 持ち主 クラウド（岩村）：柵の口（z 0 あたり）で、口を守る鉄砲組と信忠の旗本が道の上に立ち、使者が十秒あまり行き来して詰まった（描かずの流し 532〜542秒）。
    //   使者の前二歩半の味方は、横へ一秒に一歩半ずつよけて道を開ける（白旗の使者を通す人垣）。
    const dtK = Math.min(0.1, Math.max(0, rt.t - (K.openT ?? rt.t))); K.openT = rt.t;
    if (beside && dtK > 0 && K.g.path?.length > 1) {
      const path = K.g.path, i = Math.min(path.length - 1, Math.floor(roadPosition(path, e.pos)) + 1);
      let fx = path[i][0] - e.pos.x, fz = path[i][1] - e.pos.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      for (const o of rt.army.units) {
        if (!o.alive || o.team === e.team || o.isPlayer || o.mounted || o.perch || o.climb || Math.abs(o.pos.y - e.pos.y) > 2) continue;
        const rx = o.pos.x - e.pos.x, rz = o.pos.z - e.pos.z, ahead = rx * fx + rz * fz, side = rx * -fz + rz * fx;
        if (ahead < -0.3 || ahead > 2.5 || Math.abs(side) > 1.4) continue;
        const sg = side >= 0 ? 1 : -1, st = 1.5 * dtK;
        const nx = o.pos.x - fz * sg * st, nz = o.pos.z + fx * sg * st;
        if (rt.army.wallBetween(o.pos, -1, { x: nx, y: o.pos.y, z: nz })) continue;
        o.pos.x = nx; o.pos.z = nz; o.pos.y = rt.world.heightAt(nx, nz);
      }
    }
    // 11/18 20:55 持ち主 クラウド（岩村）：使者の行き先（moveTo）が一つ目の折れの手前 (13,-39) に残り、すり抜けで先へ出ては戻る行き来を三十秒続けた（描かずの流し 494〜523秒）。
    //   付き添いがそばにいる間は、使者の行き先を道の三歩先に置き、考えを一秒止めて上書きさせない（従者は使者の後ろの道へ）。
    if (beside && K.g.path?.length > 1) {
      const path = K.g.path, ahead = (u, d) => {
        const at = roadPosition(path, u.pos); let i = Math.floor(at), t = at - i, left = d;
        while (i < path.length - 1) {
          const a = path[i], b = path[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, rest = L * (1 - t);
          if (rest >= left) { const k = t + left / L; return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k }; }
          left -= rest; i++; t = 0;
        }
        const z = path[path.length - 1]; return { x: z[0], z: z[1] };
      };
      e.moveTo = ahead(e, 3); e.aiT = 1;
      const f = K.g.units.find((u) => u.alive && u !== e);
      if (f && Math.hypot(f.pos.x - e.pos.x, f.pos.z - e.pos.z) > 1.6) { f.moveTo = ahead(f, 2); f.aiT = 1; }
    }
    const S = K.stall || (K.stall = { x: e.pos.x, z: e.pos.z, t: rt.t });
    if (Math.hypot(e.pos.x - S.x, e.pos.z - S.z) > 1) { S.x = e.pos.x; S.z = e.pos.z; S.t = rt.t; }
    else if (beside && rt.t - S.t > 3 && K.g.path?.length > 1) {
      const path = K.g.path, at = roadPosition(path, e.pos), i = Math.min(path.length - 1, Math.floor(at) + 1);
      const nx = path[i][0] - e.pos.x, nz = path[i][1] - e.pos.z, d = Math.hypot(nx, nz);
      if (d > 0.5) {
        const st = Math.min(d, 2.2);
        e.pos.x += nx / d * st; e.pos.z += nz / d * st; e.pos.y = rt.world.heightAt(e.pos.x, e.pos.z);
        S.x = e.pos.x; S.z = e.pos.z; S.t = rt.t - 2;
      }
    }
  }
  rt.objProgress('main', K.arrived ? '使者と信忠様の本陣へ進め' : K.waiting ?
    '山道で待つ白旗の使者のそばへ戻れ' : '白旗の使者に付き添い、山道から柵の口を通れ');
  const T = rt.t - K.at;
  if (!K.l1 && T > 24) { K.l1 = true; rt.say('城方の使者', '城の者の命を助けてくださるなら、城を開くと秋山が申しております', 4); }
  if (!K.l2 && T > 40) { K.l2 = true; rt.say('足軽', '……城の兵は痩せこけておる。兵糧が尽きたのは本当じゃ', 3.4); }
  // 時間切れを達成扱いにせず、本陣に使者と本人がそろった事を確かめる。
  // 随行兵の整列待ちより、使者本人の到着を優先する。崖や陣幕越しは到着にしない。
  const h = K.honjin || (K.honjin = { ...HONJIN, y: rt.world.heightAt(HONJIN.x, HONJIN.z) });
  if (!beside || Math.hypot(e.pos.x - HONJIN.x, e.pos.z - HONJIN.z) >= 8 ||
      Math.abs(e.pos.y - h.y) >= 4 || rt.army.wallBetween(e.pos, -1, h) || rt.army.terrainBlocks(e.pos, h) ||
      Math.hypot(p.x - HONJIN.x, p.z - HONJIN.z) >= 10) return;
  K.arrived = true; K.waiting = false; K.ok = true;
  K.g.order = 'hold'; K.g.onArrive = null;
  rt.objDone('main');
  rt.say('織田信忠', 'よかろう。城の者の命は助けると伝えよ', 3.6);
  rt.award((t) => { t.side.push('白旗の使者を信忠の本陣へ送り届けた'); }, '降伏の使者を送り届けた', HONJIN);
  rt.after(4, () => { if (!rt.over && !F.ending) { F.joinHold = Math.max(F.joinHold || 0, 3); rt.def.win(rt); } });
}

// 本体の勝ちの後の場面：使者を送った同じ日、昼の麓で開城の列を見送る
export function epilogue(rt) {
  const F = rt.flags;
  rt.after(3.5, () => {
    if (rt.over) return;
    // 本陣から麓への場面替えは、開城の列と見送りの配置を暗転の間にそろえる。
    k15Fade(rt, () => {
      rt.world.setTime('day');
      const P = rt.player.u, W = rt.world;
      const put = (u, x, z) => { u.pos.x = x; u.pos.z = z; u.pos.y = W.heightAt(x, z); };
      // 九十九折りの途中の道脇へ置くと、組の兵が切岸に貼り付く。
      // 追撃で確保した麓の平場から、道を空けて開城の列を見送る。
      const foot = F.restPath[0];
      put(P, foot[0] + 7, foot[1]);
      for (const q of rt.squadGroups || []) {
        // 兵だけ移しても、本陣への古い下知と隊の要が残ると切岸へ戻ってしまう。
        quiet(q);
        q.anchor.x = foot[0] + 10; q.anchor.z = foot[1] + 1;
        q.order = 'hold'; q.path = null; q.dest = null; q.onArrive = null; q.pending = null;
        q.formation = 'line'; q.width = 3; q.spacing = 1; q.facing = -Math.PI / 2;
        for (const u of q.units) if (u.alive) put(u, foot[0] + 9 + Math.random() * 3, foot[1] + 4 - Math.random() * 6);
      }
      for (const g of rt.army.groups) if (g.team === 1 && g !== F.keep?.lord?.group) for (const u of g.units) if (u.alive) { u.noTarget = true; if (u.mesh) u.mesh.visible = false; }
      const col = enemyGroup(rt, { faction: 'takeda', flag: 'takeda', name: '城を出る武田の城兵', fixed: true, noGuard: true, anchor: { x: 0, z: -118 }, facing: 0, width: 2, formation: 'column', morale: 100, noRout: true, speed: 1.6 },
        [{ type: 'samurai', n: 3, o: { flag: null } }, { type: 'ashigaru', n: 7, o: { flag: null } }]);
      quiet(col);
      // 開城の列も使者と同じ九十九折りを通す。切岸へ真っすぐ登らせない。
      const path = [[0, -96], ...F.restPath];
      col.roadColumn = true; col.followColumnRoad = true; col.colW = 1;
      col.order = 'path'; col.pathIdx = 0; col.dest = null; col.path = path;
      col.onArrive = (q) => { q.order = 'hold'; };
      const L = F.keep?.lord;
      if (L?.alive) {
        put(L, 0, -108); L.noTarget = true;
        if (L.group) {
          const g = L.group;
          // おつやの方も同じ隊。城内に置き去りにすると新しい隊の要へ切岸を直進する。
          let row = 0;
          for (const u of g.units) if (u.alive) {
            put(u, 0, -108 - row * 1.4); u.slot = row++;
          }
          quiet(g); g.anchor.x = L.pos.x; g.anchor.z = L.pos.z;
          g.formation = 'column'; g.roadColumn = true; g.followColumnRoad = true; g.colW = 1;
          g.order = 'path'; g.pathIdx = 0; g.dest = null; g.path = path; g.speed = 1.4;
          g.onArrive = (q) => { q.order = 'hold'; };
        }
      }
    }, '開城', '十一月二十一日、兵糧の尽きた岩村城は開かれた');
    rt.say('語り', '使者が戻ると、兵糧の尽きた岩村城は、城の者の命と引き替えに開かれた', 4.4);
  });
  rt.after(9, () => { if (!rt.over) rt.say('河尻秀隆', '先頭が秋山虎繁。後ろの輿が、おつやの方じゃ', 3.6); });
  rt.after(14, () => { if (!rt.over) rt.say('足軽', '……武田の兵も、こうして見ると、ただの痩せた男たちじゃな', 3.6); });
  rt.after(19, () => { if (!rt.over) rt.say('語り', '約束は守られなかった。礼に出た秋山・大島・座光寺の三将は、岐阜の長良川で磔にされた', 5); });
  // 信長公記巻八：岩村開城の七日後（十一月二十八日）、信長は家督を信忠に譲った。この囲みの総大将として認められた締め。
  rt.after(27, () => { if (!rt.over) rt.say('語り', '七日の後、信長はこの囲みの総大将、信忠に織田の家督を譲った', 4.4); });
  rt.after(35, () => { if (!rt.over) rt.banner('岩村城、開城', '東美濃は織田の手に戻った'); });
  rt.after(39, () => { if (!rt.over) rt.say('組頭', '帰るぞ。長い囲みじゃった', 3); });
  rt.after(42, () => { if (!rt.over) try { sfx('farHorn', 0.5); } catch (e) { /* なし */ } });
}

// 使者を送る間の bot：道の上の使者に付く（固定の横ずれで切岸へ出ない）
export function bot(b, inp, { goTo }) {
  const e = envoy(b), p = b.player;
  if (!e) return;
  if (p.lock) inp.e.add('KeyQ');
  inp.runHeld = Math.hypot(e.pos.x - p.u.pos.x, e.pos.z - p.u.pos.z) > 10;
  // 11/18 夜50-29：act bot が九十九折りの角 (18,-35) で道標の点へ寄り切れず百秒以上立ち、使者は本人を待って時間切れ（1080秒）が二度あった。
  //   四秒ほとんど動けない時は、道標を捨てて使者へ直に寄る。
  const K = b.flags.iwKaijo, me = p.u.pos, bs = K.botStall || (K.botStall = { x: me.x, z: me.z, t: b.t, direct: 0 });
  if (Math.hypot(me.x - bs.x, me.z - bs.z) > 1) { bs.x = me.x; bs.z = me.z; bs.t = b.t; }
  else if (b.t - bs.t > 4) { bs.direct = b.t + 6; bs.t = b.t; }
  if (b.t < bs.direct) { goTo(p, inp, e.pos.x, e.pos.z, 2); return; }
  const q = pin(b) || e.pos;
  // 使者の前の狭い道に立って塞がないよう、使者の三歩後ろ（城の側）に付く。
  const path = b.flags.iwKaijo?.g?.path;
  if (q === e.pos && path?.length > 1) {
    const at = roadPosition(path, e.pos), i = Math.max(0, Math.floor(at)), a = path[i];
    const bx = a[0] - e.pos.x, bz = a[1] - e.pos.z, d = Math.hypot(bx, bz);
    if (d > 0.5) { goTo(p, inp, e.pos.x + bx / d * Math.min(3, d), e.pos.z + bz / d * Math.min(3, d), 1.5); return; }
  }
  goTo(p, inp, q.x, q.z, q === e.pos ? 2 : 1);
}
