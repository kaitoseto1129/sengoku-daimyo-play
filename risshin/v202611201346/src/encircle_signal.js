// P3 包囲の合図の部品（kaito 11/20 K406「包囲は急に知るのではなく、気づけるように。太鼓がどんどん鳴り出し、一気に迫って囲まれたと分かる」・
//   K425「塀の上の全周に旗が見えれば囲まれた感じが出る」・K400「合図に太鼓を使ってよい」・連絡帳 11/20 02:30 P3）
//   伏兵・挟み撃ち・囲みが起きる前に、遠い太鼓が鳴り出して間を詰め、最後に法螺貝。同じ間に、伏せた組の後ろの稜線（塀の上）に
//   敵の幟が地の下からせり上がって並ぶ。字は出さない（絵と音だけ）。
//   K391・K285（部隊のいない旗は出さない）：幟は伏せた本物の組の後ろにだけ立て、二十五 m 内に敵の兵がいなくなったら下げる。
//   使い方：
//     encircleWarn(rt, { from: [{x,z}, …], center: {x,z}, flag: 'shimazu', lead: 6 })   戦の筋で包む前に呼ぶ（lead 秒後に包む）
//     encircleTick(rt, dt)   battle.js が毎コマ呼ぶ。幟を上げ下げし、o.ambush の伏兵（ai.js が近づくと起こす組）には自動で合図を出す
//   def.noEncircle で止める。描く回数は幟の束（props.js の InstancedMesh）なので増えない。
import { nobori } from './props.js';
import { signal } from './audio.js';
import { isTouch } from './touch.js';

const PER = isTouch ? 5 : 7;        // 一つの出どころに並べる幟
const MAX_ALL = isTouch ? 48 : 70;  // 一つの戦で同時に立てる上限（携帯の重さ）
const SINK = 8.5;                    // 地の下に沈めておく深さ（幟の丈 7m より深く）

function flagOf(g) {
  for (const u of g?.units || []) if (u.alive && u.look?.flag && u.type !== 'porter' && u.type !== 'player') return u.look.flag;
  return null;
}
function centerOf(g) {
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.gone) { x += u.pos.x; z += u.pos.z; n++; }
  return n ? { x: x / n, z: z / n, n } : null;
}
function state(rt) { return rt.flags._encS || (rt.flags._encS = { list: [], n: 0, drumT: -99, t: 0 }); }

// 中から出どころへの線の先で、出どころから十八 m までの一番高い所（丘の稜線・塀の際）。見つからなければ出どころのまま
function ridgeOf(W, c, p, ridge) {
  if (!ridge) return { x: p.x, z: p.z };
  const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
  let best = { x: p.x, z: p.z }, bh = W.heightAt(p.x, p.z);
  for (let s = 3; s <= 18; s += 3) {
    const x = p.x + ux * s, z = p.z + uz * s, h = W.heightAt(x, z);
    if (h > bh + 0.4) { bh = h; best = { x, z }; }
  }
  return best;
}

export function encircleWarn(rt, o = {}) {
  if (rt.def?.noEncircle) return;
  const W = rt.world, P = rt.player?.u;
  if (!W || !P || !rt.scene) return;
  const S = state(rt), lead = o.lead ?? 6;
  const c = o.center || P.pos;
  const from = (o.from || []).filter(Boolean);
  if (!from.length) return;
  // 太鼓は一度に一つ（十二秒の内に重ねない）。法螺は lead 秒の後
  if (rt.t - S.drumT > 12 && o.sound !== false) {
    S.drumT = rt.t;
    try { signal('kakomi', 0, o.vol ?? 1, lead); } catch (e) { /* 音は飾り */ }
  }
  const kind = o.flag || flagOf((rt.army?.groups || []).find((g) => g.team !== P.team && !g.routed && !g.civ && flagOf(g))) || 'oda';
  for (const [i, p0] of from.entries()) {
    if (S.n + PER > MAX_ALL) break;
    const p = ridgeOf(W, c, p0, o.ridge !== false);
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz) || 1;
    const lx = -dz / d, lz = dx / d;   // 中から見て横に並べる
    const per = o.per || PER, list = [];
    for (let j = 0; j < per; j++) {
      const side = (j - (per - 1) / 2) * (o.gap || 3.2) + Math.sin(j * 2.7 + i) * 0.5;
      const x = p.x + lx * side, z = p.z + lz * side;
      let nb;
      try { nb = nobori(W, x, z, p0.flag || kind, 7); } catch (e) { break; }
      // 六十〜九十 m 先の林の縁や稜線でも並びが見えるよう、ふつうの幟（丈五 m・幅 0.75 m）より大きい大幟にする
      nb.scale.x *= 1.6; nb.scale.z = nb.scale.x;
      const gy = W.heightAt(x, z);
      nb.position.y = gy - SINK;
      nb.rotation.y = Math.atan2(c.x - x, c.z - z);   // 布の面（PlaneGeometry の +Z）を中の方へ向け、囲まれた側から紋が見えるようにする
      rt.scene.add(nb);
      // せり上がる時刻：出どころごと・幟ごとにずらし、太鼓が詰まるにつれて次々に立つ
      const at = rt.t + (lead * 0.85) * Math.min(1, (i * per + j + 1) / (from.length * per)) * (0.55 + 0.45 * Math.sin(j * 1.3 + i * 2.1) ** 2);
      list.push({ nb, gy, at });
      S.n++;
    }
    // o.with：遠くの大軍（addDistantArmy の軽い作り）の前に立てる時は、本物の兵を数えず、その大軍が見えている間（with() が真）だけ立てる
    S.list.push({ list, x: p.x, z: p.z, keepT: rt.t + lead + 8, gone: 0, team: o.team ?? 1, with: o.with || null });
  }
}

// 自動の合図：o.ambush の伏兵（ai.js waitAmbush が十 m ほどで起こす）へ本人が三十 m 余りまで来たら、その組の後ろの稜線に幟を上げ太鼓を鳴らす。
//   戦の筋で動かす伏兵（fixed・noAI）は筋が起こすまで待つので、勝手に鳴らさない（「何も無いのに鳴る太鼓」を出さない）
function autoAmbush(rt) {
  const P = rt.player?.u, A = rt.army;
  const t = rt.def?.enemyTactics;
  if (t === false || t && t.ambush === false) return;
  const hits = [];
  for (const g of A.groups || []) {
    if (!g.ambush || g._encW || g.fixed || g.noAI || g.team === P.team || g.routed || g._ai?.ambushDone || (g.count || 0) < 4) continue;
    const c = centerOf(g); if (!c) continue;
    const r = (g.ambushRange ?? 10) + 24, d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
    if (d > r || d < (g.ambushRange ?? 10) + 2) continue;
    g._encW = true;
    hits.push({ x: c.x, z: c.z, flag: flagOf(g) });
  }
  if (hits.length) encircleWarn(rt, { from: hits, center: P.pos, lead: 4.5 });
}

export function encircleTick(rt, dt) {
  if (rt.def?.noEncircle || rt.def?.town || rt.def?.dojo || rt.def?.duel) return;
  const P = rt.player?.u, A = rt.army;
  if (!P || !A || !rt.world) return;
  const S = state(rt);
  S.t -= dt;
  const slow = S.t <= 0;
  if (slow) { S.t = 1; if (!rt.over) autoAmbush(rt); }
  for (let i = S.list.length - 1; i >= 0; i--) {
    const e = S.list[i];
    // 二十五 m 内に敵の兵がいるかを一秒に一度（K391：部隊のいない旗は出さない）。三秒いなければ下げる
    if (slow && rt.t > e.keepT) {
      let near = false;
      if (e.with) near = !!e.with();
      else for (const u of A.units) if (u.alive && !u.gone && u.team === e.team && Math.abs(u.pos.x - e.x) < 25 && Math.abs(u.pos.z - e.z) < 25) { near = true; break; }
      e.gone = near ? 0 : e.gone + 1;
    }
    const down = e.gone >= 3;
    let all = down;
    for (const f of e.list) {
      const want = down ? f.gy - SINK : rt.t >= f.at ? f.gy : f.gy - SINK;
      const y = f.nb.position.y;
      if (y !== want) f.nb.position.y = y < want ? Math.min(want, y + dt * (down ? 3 : 9)) : Math.max(want, y - dt * 3);
      if (down && f.nb.position.y > want + 0.01) all = false;
    }
    if (down && all) {
      for (const f of e.list) f.nb.parent?.remove(f.nb);
      S.n -= e.list.length; S.list.splice(i, 1);
    }
  }
}
