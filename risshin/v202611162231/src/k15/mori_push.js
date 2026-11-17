// ======================================================================
// 徳川編 15　天王寺・岡山：毛利勝永隊の押し（K325・docs/specs/tennoji_sanada_req_1115.md の3・5の1〜4・6・8）
//   ①第一線：塊で寄せた毛利の槍が、本多の槍衾と鉄砲の前で一度だけ数秒止まる（「止まった」と思わせる）。
//     その後、勝永の号令で二の列が前へ出て穴を開ける。崩れる理由は重なり（旗持ちの討死・前列の損耗・隣の後退・横の圧）。
//     三つ重なったら「下がれ！」で本多の旗が下がり（忠朝の討死の筋書きへ）、使番が「毛利勢が第一線を割った」と知らせる。
//   ①の間、押し返された毛利の隊は八歩退いて数秒で組み直し、また来る（一つの隊で二度まで。兵は湧かせない）。
//   ③④：毛利は崩れず、東の口から別の戦線で本陣へ押し続ける（使番「毛利勢、なお前進！」）。真田と火事が二つ。
//   ②〜④：本陣の危うさが五十を越えたら、周りの徳川の備が本陣を守る持ち場へ寄る（PROTECT_HQ）。
//   易しい／難しい：旗本の固さ・真田の足・毛利の圧を少し変える（敵の命は増やさない）。
// 真田の動き（hq_rush.js・sanada_end.js）には触らない。呼び方：毎コマ tick(rt, dt, ctx)。③の始めに front2(rt, ctx)。
// ======================================================================
import { sfx } from '../audio.js';

export const STAT = { stopT: null, breakT: null, causes: [], rgN: 0, front2: false, protect: 0 };
const live = (g) => g && !g.routed && g.count > 0;
const center = (g) => { let x = 0, z = 0, k = 0; for (const u of g?.units || []) if (u.alive && !u.fleeing) { x += u.pos.x; z += u.pos.z; k++; } return k ? { x: x / k, z: z / k } : null; };
const diffOf = (rt) => rt.G?.difficulty || 'normal';

// ctx：{ HON, FRONT, SHITENNO, charge(g, aggro, to), flee(gs), tadatomo() }
export function tick(rt, dt, ctx) {
  const F = rt.flags;
  if (F.ending) return;
  const M = F.moriP ||= { ph: 'go', said: {} };
  if (F.step === 1) first(rt, dt, ctx, M);
  if (F.step >= 2 && F.step <= 4) { protect(rt, ctx, M); difficulty(rt, M); }
  if (F.step >= 4.5 && !M.fled) { M.fled = true; const gs = [F.mori, F.katsu, ...(F.newE || []).filter((g) => /^毛利/.test(g.name || ''))].filter(live); if (gs.length) { ctx.flee(gs); rt.say('使番', '毛利勢も城の方へ退いていく……', 2.6); } }
}

function first(rt, dt, ctx, M) {
  const F = rt.flags, g = F.mori, D = diffOf(rt);
  const c = center(g);
  if (!c) return;
  if (M.ph === 'go') {
    // 塊のまま速く寄せる。第一線（本多の柵の前）へ着いたら止まる
    if (Math.hypot(c.x - ctx.FRONT.x, c.z - ctx.FRONT.z) < 24 || rt.t - F.tS > 34) {
      M.ph = 'stop'; M.t = rt.t; STAT.stopT = Math.round(rt.t - F.tS);
      M.stopFor = D === 'easy' ? 5 : D === 'hard' ? 3 : 4;
      g._charge = false; g.order = 'hold'; g.dest = null; g.path = null; g.focus = null; g.anchor = { x: c.x, z: c.z }; g.aggro = 2; g.seekRange = 3;
      rt.say('本多の侍', '止まった！　毛利が槍衾の前で止まったぞ！', 2.6);
    }
    return;
  }
  if (M.ph === 'stop') {
    if (rt.t - M.t < M.stopFor) return;
    // 二の列が前へ出て、槍列に穴を開ける
    M.ph = 'break'; M.t = rt.t; M.n0 = F.hondaN0 || F.honda?.count || 1;
    ctx.charge(g, 12);
    M.dm = g.dmgMult || 1; g.dmgMult = M.dm * (D === 'hard' ? 1.5 : 1.35);
    rt.after(10, () => { if (g) g.dmgMult = M.dm; });
    rt.say('毛利勝永', '二の列、前へ！　槍を揃えて突き崩せ！', 2.8);
    sfx('taiko', 0.7);
    return;
  }
  if (M.ph === 'break') {
    const el = rt.t - M.t, H = F.honda;
    const add = (k, who, line) => { if (STAT.causes.includes(k)) return; STAT.causes.push(k); rt.say(who, line, 2.6); if (live(H)) H.morale = Math.max(30, (H.morale || 90) - 12); };
    // 旗持ちの討死：毛利の一番近くにいる本多の兵を一人（名のある者は除く）
    if (el > 2 && !STAT.causes.includes('flag') && live(H)) {
      let best = null, bd = 1e9;
      for (const u of H.units) if (u.alive && !u.name && !u.isTaisho) { const d = Math.hypot(u.pos.x - c.x, u.pos.z - c.z); if (d < bd) { bd = d; best = u; } }
      if (best && bd < 14) { rt.army.kill(best, null); add('flag', '本多の侍', '旗持ちが討たれた！　旗が……！'); }
      else if (el > 6) add('flag', '本多の侍', '旗が揺らいだ！　前を固めよ！');
    }
    if (live(H) && H.count <= M.n0 * 0.78) add('loss', '本多の侍', '前の列が持たぬ……槍が足りぬ！');
    if (el > 6) { if (!STAT.causes.includes('side')) { try { F.tq?.C?.push?.('B', 0.6); } catch (e) { /* 軽い作りが無い時 */ } } add('side', '使番', '東の脇、小笠原の手が押し込まれております！'); }
    if (el > 11 || F.kimura) add('next', '本多の侍', '隣の組が下がるぞ！　横から槍が来る！');
    if (STAT.causes.length >= 3 || el > 24) {
      M.ph = 'broke'; STAT.breakT = Math.round(rt.t - F.tS);
      if (live(H)) { H.morale = Math.min(H.morale || 90, 50); H.anchor = { x: ctx.FRONT.x, z: ctx.FRONT.z + 8 }; }
      rt.say('本多の侍', '下がれ！　下がって組み直せ！', 2.6);
      rt.after(2.6, () => { if (F.step === 1) rt.say('使番', '毛利勢が第一線を割りました！', 2.8); });
      if (!F.tadaDone) rt.after(4, () => { if (F.step === 1 && !F.tadaDone) ctx.tadatomo(); });
    }
    return;
  }
  // 押し返されても、すぐ組み直してまた来る（一つの隊で二度まで）
  if (!(M.rT > rt.t)) {
    M.rT = rt.t + 2;
    for (const q of [F.mori, F.katsu, F.mori2]) {
      if (!live(q) || q._rgBusy) continue;
      const m = q._mp ||= { n: q.count, t: rt.t, k: 0 };
      if (rt.t - m.t > 10) { m.n = q.count; m.t = rt.t; continue; }
      if (m.k >= 2 || q.count > m.n * 0.8 || q.count < 5) continue;
      const p = center(q); if (!p) continue;
      m.k++; q._rgBusy = true; STAT.rgN++;
      const back = { x: p.x + (ctx.SHITENNO.x - p.x) * 0.15, z: p.z - 8 };
      q._charge = false; q.order = 'hold'; q.dest = null; q.path = null; q.focus = null; q.anchor = back; q.aggro = 3; q.seekRange = 4;
      rt.say('古参の侍', STAT.rgN % 2 ? '毛利め、退いて……もう組み直したぞ！' : 'また来る！　止めても止まらぬ！', 2.6);
      const wait = diffOf(rt) === 'easy' ? 4 : diffOf(rt) === 'hard' ? 2 : 3;
      rt.after(wait, () => { q._rgBusy = false; q._mp = { n: q.count, t: rt.t, k: m.k }; if (F.step === 1 && live(q)) ctx.charge(q, 12); });
    }
  }
}

// ③の始め：毛利は崩れず、手をまとめて東の口から本陣へ押し続ける（別の戦線）
export function front2(rt, ctx) {
  const F = rt.flags;
  // 勝永の先手・本隊に、②で出た毛利の新手（F.newE の毛利の名の隊）も合わせる（先手が討ち減っても東の戦線が立つ）
  let gs = [F.mori, F.katsu, ...(F.newE || []).filter((g) => /^毛利/.test(g.name || ''))].filter((g) => g && g.units.some((u) => u.alive && !u.fleeing));
  const n = gs.reduce((s, g) => s + g.units.filter((u) => u.alive && !u.fleeing).length, 0);
  // 11/17 kaito K359「勝永しか残らず歩いて帰る」：勝永の本隊は兵が少なくても退かず、旗本を連れて本陣へ（勝永の居ない小勢だけ退く）
  if (n < 5) { const rest = gs.filter((g) => g !== F.katsu); if (rest.length) ctx.flee(rest); if (!live(F.katsu)) return false; gs = [F.katsu]; }
  STAT.front2 = true;
  const E = { x: ctx.HON.x + 34, z: ctx.HON.z - 30 };
  gs.forEach((g, i) => {
    g.routed = false; g.noRout = true; g.morale = 100; g._charge = false; g.stay = true; g.allOutRun = true; g.aggro = 5; g.seekRange = 8;
    if (g !== F.katsu) g.dmgMult = diffOf(rt) === 'hard' ? 1 : 0.8;   // 本陣を一息に破る程ではない。押し続ける圧（勝永の旗本は K351 の鋭さのまま）
    g.order = 'move'; g.dest = { x: E.x + i * 6, z: E.z - i * 4 }; g.path = null; g.focus = null; g.anchor = { ...g.dest };
    g.arriveCount = Math.max(2, Math.ceil(g.count * 0.3)); g.arriveRadius = 8;
    g.onArrive = (q) => { q.onArrive = null; if (F.step >= 3 && F.step <= 4) ctx.charge(q, 8, ctx.HON); };
  });
  rt.after(4, () => { if (F.step === 3) rt.say('使番', '毛利勢、なお前進！　東の口からも本陣へ！', 2.8); });
  rt.after(9, () => { if (F.step === 3) rt.say('旗本', '真田と毛利、二筋じゃ！　どちらへ槍を回す！', 2.6); });
  return true;
}

// PROTECT_HQ：本陣が危うくなったら（危うさ五十）、周りの備が本陣を守る持ち場へ寄る（段ごとに一度）
function protect(rt, ctx, M) {
  const F = rt.flags;
  if (M.pStep === F.step || !((F.hqThreat || 0) >= 50)) return;
  M.pStep = F.step;
  const I = F.ieyasu?.pos || ctx.HON;
  let foe = null, bd = 1e9;
  for (const g of [F.sanada, F.sanada2, F.sanada3, F.nobu, F.mori, F.katsu, ...(F.newE || [])]) { if (!live(g)) continue; const p = center(g); if (!p) continue; const d = Math.hypot(p.x - I.x, p.z - I.z); if (d < bd) { bd = d; foe = p; } }
  if (!foe) return;
  const dx = foe.x - I.x, dz = foe.z - I.z, dl = Math.hypot(dx, dz) || 1;
  const gs = (F.step >= 3 ? [F.hata2, F.nijin, F.honda] : [F.hata2]).filter((g) => live(g) && g.order === 'hold');
  gs.forEach((g, i) => { const s = 14 + i * 6, side = (i - 1) * 7; g.anchor = { x: I.x + dx / dl * s - dz / dl * side, z: I.z + dz / dl * s + dx / dl * side }; g.aggro = Math.max(g.aggro || 0, 18); });
  if (gs.length) { STAT.protect++; rt.say('使番', F.step >= 3 ? '本陣を守れ！　二陣も先手も本陣の前へ寄れ！' : '旗本の二の備、本陣の前を固めよ！', 2.8); }
}

// 易しい：旗本が固く、真田の足が少し遅い。難しい：真田のまとまりが高く、毛利の圧が強い（敵の命は増やさない）
function difficulty(rt, M) {
  const F = rt.flags, D = diffOf(rt);
  if (D === 'normal') return;
  for (const g of [F.hon, F.hata2]) if (g && !g._dfK) { g._dfK = true; if (D === 'easy') g.defMult = (g.defMult || 1) * 1.25; }
  for (const g of [F.sanada, F.sanada2, F.sanada3, F.nobu]) if (g && !g._dfK) {
    g._dfK = true;
    if (D === 'easy') { for (const u of g.units) if (u.speed) u.speed *= 0.92; }
    else { g.morale = 100; g.defMult = (g.defMult || 1) * 1.1; }
  }
  if (D === 'hard') for (const g of [F.mori, F.katsu, ...(F.newE || [])]) if (g && !g._dfK) { g._dfK = true; g.dmgMult = (g.dmgMult || 1) * 1.15; }
}
