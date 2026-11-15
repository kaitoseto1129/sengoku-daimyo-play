// ======================================================================
// 徳川編 15　天王寺・岡山：真田・毛利の「止めても止まらない」本陣突撃（K325・docs/specs/tennoji_sanada_req_1115.md）
// 受け持ち（11/15 MacBook 窓口の係）：この紙と、b_k15_tennoji_okayama.js の段2〜4の真田の動かし方・段4の流れ・信繁の出し方だけ。
//   布陣・戦場の広さ（K315）・兵の厚み・名札（K287）・旗の倒れ（K293・hata_taore.js）はほかの係の受け持ち。ここでは触らない。
// 足す事：
//   ・HQ_BREAKTHROUGH：真田の隊は家康の本陣だけを目がけ、槍衾の正面に詰まれば隣の隙間（徳川兵の薄い側）へ流れる（g._gap）。
//   ・組み直し：押しが止まった隊は十二歩退いて組み直し、別の隙間からまた来る（一つの隊で二度まで。兵は湧かせない）。
//   ・HQ_THREAT（0〜100）：25 旗本の警戒 → 50 予備を出す → 70 陣幕を畳む支度 → 85 家康が動く。100 には届きにくい（負けは本の breach と家康の討死）。
//   ・段4：信繁は初めて本陣の前に出る。本陣の見える所で数秒止まり、号令して残り全員で走る → 「30秒、真田隊を食い止めろ」。
//     食い止めたら真田隊は崩れ、傷ついた信繁は少数で安居の天神へ退く（主人公は討たない。最期は越前の西尾宗次）。
// 字は任務の一行と使番・兵の台詞だけ。ボスの命の棒は出さない。
// ======================================================================
// bot の記録へ出す数（戦の終わりに flags は消えるので、ここに残す）
export const STAT = { max: 0, gapN: 0, rgN: 0, held: false, gapMori: 0, gapFlag: 0, pace: [0, 0, 0, 0], keeps: [], wedge: false, sideDrop: 0 };
const near = (p, q, r) => Math.hypot(p.x - q.x, p.z - q.z) < r;
const live = (g) => g && !g.routed && g.count > 0;

// 11/16 K325：進む速さの四段（要件書4）。0 速い歩き → 1 当たる前に速める → 2 列に当たる → 3 穴が開いたら一気に走る
const PACE = [0.55, 0.85, 1, 1.12];
function setPace(g, ph) {
  STAT.pace[ph]++;
  if (g._pace === ph) return;
  g._pace = ph;
  for (const u of g.units) {
    if (!u.alive) continue;
    if (u._run0 === undefined) u._run0 = u.run;
    u.run = u.fleeing ? u._run0 : Math.max((u.speed || 1) * 1.15, u._run0 * PACE[ph]);
  }
}
// 足を元へ戻す（崩れた・退く時）
function resetPace(gs) { for (const g of gs) if (g) { g._pace = undefined; for (const u of g.units) if (u._run0 !== undefined) { u.run = u._run0; u._run0 = undefined; } } }
// 11/16 K325：隊形の保ち 70→45→20（要件書4。士気は下がらず、並びだけが崩れていく）。並びの間を広げ、兵が個々に流れて見える
function keepOf(F, S) { return F.step <= 2 ? 70 : F.step === 3 || !(S.ph === 'rush' || S.ph === 'hold') ? 45 : 20; }
function setKeep(g, k) {
  if (g._keep === k) return;
  if (g._sp0 === undefined) g._sp0 = g.spacing;
  g._keep = k; g.spacing = g._sp0 * (1 + (70 - k) / 100 * 0.8);
  if (STAT.keeps[STAT.keeps.length - 1] !== k) STAT.keeps.push(k);
}
// 毛利の手の一番前（本陣に一番近い毛利の兵）
function moriFront(F, I) {
  let best = null, bd = 1e9;
  for (const g of [F.mori, F.katsu]) if (live(g)) for (const u of g.units) if (u.alive && !u.fleeing) { const d = Math.hypot(u.pos.x - I.x, u.pos.z - I.z); if (d < bd) { bd = d; best = u.pos; } }
  return best ? { x: best.x, z: best.z, d: bd } : null;
}

// 真田の隊（突撃中の物）
const sanadaGroups = (F) => [F.sanada, F.sanada2, F.sanada3, F.nobu, F.nobu2, F.nobu3, ...(F.nobuX || [])].filter(live);
const rushGroups = (F) => [...sanadaGroups(F), F.mori, F.katsu].filter(live);

function center(g) {
  let x = 0, z = 0, n = 0;
  for (const u of g.units) if (u.alive && !u.fleeing) { x += u.pos.x; z += u.pos.z; n++; }
  return n ? { x: x / n, z: z / n, n } : null;
}

// 点 p の周り r の内の徳川兵（逃げていない者）
function tokuNear(rt, p, r) {
  let n = 0;
  for (const u of rt.army.units) if (u.alive && u.team === 0 && !u.fleeing && !u.noTarget && Math.abs(u.pos.x - p.x) < r && Math.abs(u.pos.z - p.z) < r && near(u.pos, p, r)) n++;
  return n;
}

// ---- 段2の真田の登場：本人はまだ出さない。旗を先に見せ、兵の声で怖さを上げる（要件書 5-5・5-6） ----
export function sanadaAppear(rt) {
  const F = rt.flags;
  rt.after(7, () => { if (F.step === 2 && !F.ending) rt.say('使番', '真田勢、前進！　六文銭の旗が動いた！', 2.8); });
  rt.after(10.4, () => { if (F.step === 2 && !F.ending) rt.say('徳川の足軽', '真田だ！　真田丸の……！', 2.4); });
  rt.after(13.2, () => { if (F.step === 2 && !F.ending) rt.say('古参の侍', '来るぞ、崩すな！　槍を揃えよ！', 2.6); });
}

// 毎コマ（段2〜4）。本の update から呼ぶ。ctx：{ HON, HONF, CHAUSU, charge(g, aggro, to), allyWave() }
export function tick(rt, dt, ctx) {
  const F = rt.flags;
  if (F.ending || !(F.step >= 2 && F.step <= 4)) return;
  const S = F.k325 ||= { threat: 0, said: {}, rg: 0 };
  const I = F.ieyasu?.alive ? F.ieyasu.pos : ctx.HON;
  // 11/15 kaito 追記：倒れた兵（討たれた・深手で膝をついた・逃げる者）を追わない。相手が倒れたら目を離し、本陣の方の次の者と組む
  for (const g of rushGroups(F)) for (const u of g.units) {
    const t = u.alive && u.target;
    if (t && !t.isStruct && (!t.alive || t.noTarget || t.dying || t.downed || t.woundOut || t.fleeing)) { u.target = null; u.atk = null; u.watch = null; if (u.rushUntil) u.rushUntil = 0; }
  }
  // 11/16 K325：真田の兵は、後ろや横の相手（本陣と逆の向きに三歩より離れた者）を後回しにする。目の前を塞ぐ者とだけ組む
  if (!(S.sdT > rt.t)) {
    S.sdT = rt.t + 0.5;
    // 最後の突撃（本陣へ寄る・走る間）は、正面の六十度の外の相手（横から掛かる越前勢など）も払って奥へ進む。食い止めの間は組み合う
    const fin = F.step === 4 && (S.ph === 'march' || S.ph === 'rush'), lim = fin ? 0.5 : -0.1;
    for (const g of sanadaGroups(F)) if (g._charge || fin) for (const u of g.units) {
      const t = u.alive && !u.fleeing && u.target;
      if (!t || t.isStruct || t.isPlayer && u !== F.nobuU) continue;
      const tx = t.pos.x - u.pos.x, tz = t.pos.z - u.pos.z, td = Math.hypot(tx, tz);
      if (td < 3) continue;
      const ix = I.x - u.pos.x, iz = I.z - u.pos.z, id = Math.hypot(ix, iz) || 1;
      if ((tx * ix + tz * iz) / (td * id) < lim) { u.target = null; u.atk = null; u.watch = null; STAT.sideDrop++; }
    }
  }
  if (S.t1 > rt.t) { if (F.step === 4) final(rt, dt, ctx, S, I); return; }
  S.t1 = rt.t + 1;
  // 崩れた・退く隊と、逃げる兵の足は元へ戻す（遅い足のまま逃げない）
  for (const g of [F.sanada, F.sanada2, F.sanada3, F.nobu, F.nobu2, F.nobu3, ...(F.nobuX || [])]) if (g && g._pace !== undefined) {
    if (!live(g) || !g._charge) resetPace([g]);
    else for (const u of g.units) if (u.fleeing && u._run0 !== undefined) { u.run = u._run0; u._run0 = undefined; }
  }
  // ---- HQ_THREAT：本陣の一番近くの寄せ手の近さ・数から（上がるのは速く、下がるのは遅く） ----
  let dmin = 1e9, close = 0;
  for (const g of rushGroups(F)) for (const u of g.units) if (u.alive && !u.fleeing) { const d = Math.hypot(u.pos.x - I.x, u.pos.z - I.z); if (d < dmin) dmin = d; if (d < 30) close++; }
  const raw = Math.max(0, Math.min(99, (150 - dmin) / 130 * 80 + Math.min(19, close * 0.8)));
  S.threat = raw > S.threat ? S.threat + (raw - S.threat) * 0.5 : S.threat - Math.min(1.5, S.threat - raw);
  F.hqThreat = Math.round(S.threat); S.max = Math.max(S.max || 0, F.hqThreat); STAT.max = Math.max(STAT.max, F.hqThreat);
  const once = (k, fn) => { if (!S.said[k]) { S.said[k] = true; fn(); } };
  if (S.threat >= 25) once(25, () => rt.say('旗本', '寄せ手が見えるぞ。旗本、槍を立てよ！', 2.6));
  if (S.threat >= 50) once(50, () => { rt.say('使番', '予備の手、本陣の前へ出よ！', 2.6); try { ctx.allyWave(); } catch (e) { /* そのまま */ } });
  if (S.threat >= 70) once(70, () => rt.say('本陣の侍', '陣幕を畳め！　馬を引いて参れ！', 2.6));
  if (S.threat >= 85 && F.step >= 3) once(85, () => rt.say('本多正純', '大御所様、御退きくだされ！', 2.8));
  // ---- HQ_BREAKTHROUGH：槍衾の正面に詰まった隊は、隣の薄い所（隙間）へ流れ込む ----
  for (const g of sanadaGroups(F)) {
    if (!g._charge || g.order !== 'hold' || g._k325Back) continue;
    const c = center(g); if (!c) continue;
    const dx = I.x - c.x, dz = I.z - c.z, L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L;
    setKeep(g, keepOf(F, S));
    // 最後の突撃の走りは楔のまま真っすぐ本陣へ（隙間へ逸れない）
    if (L < 16 || S.ph === 'rush') { g._gap = null; setPace(g, 3); continue; }   // 本陣の間近は真っすぐ・一気に走る
    const ahead = { x: c.x + fx * 12, z: c.z + fz * 12 };
    const nA = tokuNear(rt, ahead, 9);
    // 速さの四段：穴へ流れる・最後の突撃・本陣の二十四歩の内は走る／列に当たる／前の二十六歩に徳川兵が見えたら速める／それまでは速い歩き
    setPace(g, g._gapT > rt.t || S.ph === 'rush' || S.ph === 'hold' || L < 24 ? 3 : nA >= 7 ? 2 : tokuNear(rt, { x: c.x + fx * 26, z: c.z + fz * 26 }, 14) >= 3 ? 1 : 0);
    if (!(g._gapT > rt.t) && nA >= 7) {
      // 左右十四歩の先の薄さを比べ、薄い側へ（どちらも厚ければ真っすぐ押す）
      const lp = { x: ahead.x - fz * 14, z: ahead.z + fx * 14 }, rp = { x: ahead.x + fz * 14, z: ahead.z - fx * 14 };
      const cands = [[lp, tokuNear(rt, lp, 9), ''], [rp, tokuNear(rt, rp, 9), '']];
      // 11/16 K325：毛利が崩した所（毛利の一番前が真田より本陣に近く、横へ四十歩の内）と、旗が下がった所（倒れた葵の幟の根元）を少し好む
      const mf = moriFront(F, I);
      if (mf && mf.d < L - 6 && Math.abs((mf.x - c.x) * -fz + (mf.z - c.z) * fx) < 40) cands.push([mf, tokuNear(rt, mf, 9) - 3, 'mori']);
      for (const nb of F._hata?.line || []) {
        const p = nb.userData.fall && nb.userData.foot; if (!p) continue;
        const al = (p.x - c.x) * fx + (p.z - c.z) * fz;
        if (al > 4 && al < 34 && Math.abs((p.x - c.x) * -fz + (p.z - c.z) * fx) < 30) { cands.push([p, tokuNear(rt, p, 9) - 2, 'flag']); break; }
      }
      let best = cands[0]; for (const k of cands) if (k[1] < best[1]) best = k;
      // 毛利が崩した口・旗の倒れた口は、正面より薄ければ（八割まで）左右の空きより先に選ぶ（要件書4「毛利が崩した所へ集まって流れ込む」。薄さだけで比べると一度も選ばれなかった）
      for (const k of cands) if (k[2] && k[1] + (k[2] === 'mori' ? 3 : 2) <= nA * 0.8) { best = [k[0], 0, k[2]]; break; }
      const side = best[0], ns = best[1];
      if (ns <= nA * 0.5) {
        // 隙間の先から本陣へ（持ち場は隙間の十歩先。抜けたら本の charge が家康の居所へ戻す）
        g._gap = { x: side.x + fx * 10, z: side.z + fz * 10 }; g._gapT = rt.t + 6; S.gapN = (S.gapN || 0) + 1; STAT.gapN++;
        if (best[2] === 'mori') STAT.gapMori++; else if (best[2] === 'flag') STAT.gapFlag++;
        ctx.charge(g, g._chA || 6, g._gap); setPace(g, 3);
        if (!S.said.gap) { S.said.gap = true; rt.say('使番', '赤備えが隊の隙間へ回り込む！　脇を塞げ！', 2.8); }
        else if (best[2] === 'mori' && !S.said.gm) { S.said.gm = true; rt.say('徳川の足軽', '毛利の崩した口から、六文銭が入ってくる！', 2.6); }
      }
    }
    if (g._gapT && g._gapT <= rt.t && g._gap) { g._gap = null; ctx.charge(g, g._chA || 6); }
    // ---- 組み直し：六秒、本陣へ二歩も寄れなければ一度退いて組み直し、また来る（一つの隊で二度まで） ----
    if (g._k325L === undefined || L < g._k325L - 2) { g._k325L = L; g._k325T = rt.t; }
    else if (rt.t - g._k325T > 6 && L > 22 && (g._k325N || 0) < 2 && nA >= 4 && c.n >= 6) {
      g._k325N = (g._k325N || 0) + 1; g._k325Back = true; S.rgN = (S.rgN || 0) + 1; STAT.rgN++;
      const back = { x: c.x - fx * 12, z: c.z - fz * 12 };
      g._charge = false; g.order = 'move'; g.dest = back; g.anchor = { ...back }; g.aggro = 2; g.seekRange = 3; g.allOutRun = true;
      for (const u of g.units) if (u.alive && !u.fleeing) { u.target = null; u.atk = null; u.swing = null; }
      const again = () => {
        if (!g._k325Back) return;
        g._k325Back = false; g._k325L = undefined; g.allOutRun = true;
        // 来た所と違う側（隙間）から：左右を一つずつ替える
        const s = (g._k325N % 2 ? 1 : -1) * 12, to = { x: c.x + fx * 20 - fz * s, z: c.z + fz * 20 + fx * s };
        g._gap = to; g._gapT = rt.t + 6; ctx.charge(g, g._chA || 6, to);
        if (S.rg < 3) rt.say('古参の侍', S.rg++ % 2 ? 'また来るぞ！　別の口から回った！' : '組み直して来る……止まらぬぞ！', 2.6);
      };
      g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; rt.after(2.5, again); };
      rt.after(7, again);
      if (!S.said.stop) { S.said.stop = true; rt.say('徳川の足軽', '止めたぞ！', 2); }
    }
  }
  if (F.step === 4) final(rt, dt, ctx, S, I);
}

// ---- 段4：信繁の最後の突撃と、30秒の食い止め ----
// 段4の始めに本から呼ぶ。信繁の手を本陣の見える所（家康の五十五歩手前）まで寄せて止める
export function finalStart(rt, ctx) {
  const F = rt.flags;
  const S = F.k325 ||= { threat: 0, said: {}, rg: 0 };
  const I = F.ieyasu?.alive ? F.ieyasu.pos : ctx.HON, C = ctx.CHAUSU;
  const dx = C.x - I.x, dz = C.z - I.z, L = Math.hypot(dx, dz) || 1;
  S.stage = { x: I.x + dx / L * 55, z: I.z + dz / L * 55 };
  S.ph = 'march'; S.phT = rt.t; S.holdT = 0;
  for (const g of [F.nobu, F.nobu2, F.nobu3, ...(F.nobuX || [])].filter(live)) {
    g._charge = false; g.order = 'move'; g.allOutRun = true; g.stay = true; g.aggro = 3; g.seekRange = 4;
    const k = g === F.nobu ? 0 : 1;
    g.dest = { x: S.stage.x - dz / L * 6 * k, z: S.stage.z + dx / L * 6 * k + 4 * k }; g.anchor = { ...g.dest };
    g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
  }
  rt.obj('main', '真田信繁を本陣へ着かせるな', 'main');
  rt.after(1.5, () => rt.say('使番', '茶臼山から六文銭の本隊！　真田左衛門佐、自ら出ました！', 3));
}

function final(rt, dt, ctx, S, I) {
  const F = rt.flags, N = F.nobuU, P = rt.player.u;
  if (!S.ph) return;
  if (S.ph === 'march') {
    const at = N?.alive ? N.pos : center(F.nobu);
    // 11/16：家康が床几を下げて本陣が奥へ移っても、家康の六十二歩の内に入れば止まって見る（前は持ち場の五十五歩手前だけを見て、遠いまま28秒で切れていた）
    if ((at && (near(at, S.stage, 12) || near(at, I, 62))) || rt.t - S.phT > 28) {
      S.ph = 'look'; S.phT = rt.t;
      for (const g of [F.nobu, F.nobu2, F.nobu3, ...(F.nobuX || [])].filter(live)) { g.order = 'hold'; g.dest = null; g.anchor = { x: center(g)?.x ?? S.stage.x, z: center(g)?.z ?? S.stage.z }; g.aggro = 2; g.seekRange = 3; }
      if (N) N.facing = Math.atan2(I.x - N.pos.x, I.z - N.pos.z);
      rt.say('徳川の足軽', '真田信繁だ！', 2);
    }
    return;
  }
  if (S.ph === 'look') {
    if (rt.t - S.phT < 4) return;
    S.ph = 'rush'; S.phT = rt.t;
    rt.say('真田信繁', 'あれが家康の旗じゃ。残る者、一人残らず続け！', 3.2);
    rt.army.play?.('toki', { x: S.stage.x, z: S.stage.z }, 1.6);
    // 残り全員で家康へ（縦に深い楔：信繁の旗本が先、馬廻と残りの赤備えが後ろに続く）
    // 11/16 K325：魚鱗（正面を狭く段を深く）に組み替え、楔の形で走る。走る間は三列の縦の行軍（march）で家康の居所へ走る（構えのままだと騎馬と名のある者は十四歩の内の越前勢へ向き直り、二十秒で十歩も進まなかった。行軍なら八歩の内の道を塞ぐ者とだけ組む）
    for (const g of sanadaGroups(F)) { ctx.charge(g, 1.5); g._k325N = 2; g.formation = 'gyorin'; g._charge = false; g.order = 'move'; g.march = true; g.colW = 3; g.dest = { x: I.x, z: I.z }; g.onArrive = (q) => { q.onArrive = null; q.march = false; ctx.charge(q, 5); }; g._pace = undefined; setPace(g, 3); STAT.wedge = true; }
    // 越前勢は横から一度突いた後、追いすがらずに持ち場で構える（追い続けると楔が越前勢と組み合って本陣へ届かなかった）
    if (live(F.echizen)) { const e = center(F.echizen); if (e) { F.echizen.order = 'hold'; F.echizen.stay = true; F.echizen.dest = null; F.echizen.anchor = { x: e.x, z: e.z }; F.echizen.aggro = 4; F.echizen.seekRange = 6; } }
    if (F.mori && live(F.mori)) rt.after(5, () => rt.say('使番', '毛利勢、なお前進！　東からも本陣へ！', 2.8));
    return;
  }
  if (S.ph === 'rush') {
    // 寄せ手が本陣の五十歩の内に入ったら（または走り出して十二秒）、30秒の食い止め
    let dmin = 1e9; for (const g of sanadaGroups(F)) for (const u of g.units) if (u.alive && !u.fleeing) dmin = Math.min(dmin, Math.hypot(u.pos.x - I.x, u.pos.z - I.z));
    if (dmin < 50 || rt.t - S.phT > 24) {   // 11/16：家康が南へ下がった後は本陣まで百歩を超える。十二秒では遠いまま食い止めに入った
      S.ph = 'hold'; S.phT = rt.t; S.holdT = 0;
      rt.obj('main', '30秒、真田隊を食い止めろ', 'main');
      rt.say('旗本', '本陣を守れ！　一歩も通すな！', 2.6);
      for (const g of sanadaGroups(F)) { g.march = false; ctx.charge(g, g === F.nobu ? 5 : 7); }   // 本陣の前では組み合う
      try { ctx.allyWave(); } catch (e) { /* そのまま */ }   // 本陣の前だけ兵を厚く（旗本・馬廻・駆け付けの手）
    }
    return;
  }
  if (S.ph === 'hold') {
    S.holdT += dt;
    const left = Math.max(0, Math.ceil(30 - S.holdT));
    if (left !== S.shown) { S.shown = left; rt.objProgress('main', `あと${left}秒`); }
    if (!S.said.d30 && N?.alive && near(N.pos, I, 32)) { S.said.d30 = true; rt.say('徳川の足軽', '真田信繁だ！　本陣のすぐ前ぞ！', 2.4); }
    if (S.holdT >= 30) { S.ph = 'done'; STAT.held = true; ctx.held(); }
  }
}

// 食い止めた後：真田隊は崩れ、傷ついた信繁は少数で安居の天神へ退く。主人公は討たない（最期は越前の西尾宗次・本の onKill）
export function withdraw(rt, ctx) {
  const F = rt.flags, N = F.nobuU, Y = ctx.YASUI;
  rt.objProgress('main', '');
  resetPace([F.sanada, F.sanada2, F.sanada3, F.nobu, F.nobu2, F.nobu3, ...(F.nobuX || [])]);
  ctx.flee([F.sanada2, F.sanada3, F.nobu2, F.nobu3, ...(F.nobuX || []), ...(F.newE || [])].filter(Boolean));
  rt.say('真田信繁', '……ここまでか。天神の杜まで退け', 3.2);
  rt.after(3.6, () => rt.say('徳川の足軽', '止めた……本当に止めたぞ……', 2.6));
  rt.after(6.8, () => rt.say('本多正純', '危のうござった。大御所様はご無事じゃ', 3));
  const g = F.nobu;
  if (g && N?.alive) {
    // 信繁と供の数人だけが天神へ。残りの旗本は城へ落ちる
    let keep = 0;
    for (const u of g.units) if (u.alive) { u.target = null; u.atk = null; u.swing = null; if (u === N || (keep < 4 && !u.fleeing && keep++ >= 0)) u.fleeing = false; else { u.moraleFleeDir = { x: 0.3, z: -1 }; u.fleeing = true; u.fleeT = rt.army.time; } }
    g.routed = false; g.noRout = true; g.noRetinue = true; g._charge = false; g.stay = true; g.aggro = 0; g.seekRange = 0;
    g.order = 'move'; g.dest = { x: Y.x, z: Y.z }; g.anchor = { x: Y.x, z: Y.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'hold'; };
    N.invuln = true; N.noTarget = true; N.run = Math.max(N.run || 0, 5); N.speed = Math.max(N.speed || 0, 3);
  }
  // 天神に着くか、二十秒たったら、越前の西尾宗次が討つ（主人公の手柄にしない）
  const t0 = rt.t;
  const end = () => {
    if (F.ending || F.step !== 4.5) return;
    if (N?.alive && !near(N.pos, Y, 16) && rt.t - t0 < 20) { rt.after(1, end); return; }
    ctx.nishio();
  };
  rt.after(2, end);
}
