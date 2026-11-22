// オンライン PvP の決まり：霧の情報の四つの状態・降伏・切断時の AI の引き継ぎ（K587・docs/online_extra_1120.md 16〜30・online_final_1120.md 82〜95）
// 描かない・通信しない決まりだけの部品。PvP の戦（ホスト）が毎コマ呼ぶ。数はすべてここに置き、試し（tools/pvp_rules.test.mjs）で見張る。
// 11/21 クラウド k365-cloud-40

// ---- 霧の情報の四つの状態 ----
//   UNKNOWN：いるか分からない（地図に出さない）
//   SPOTTED：軍勢は見つけたが、武将と兵種は分からない（印だけ）
//   IDENTIFIED：旗や斥候で武将と兵種が分かった（名と兵種を出す）
//   LOST：前にいた所だけ覚えている（推定の位置。今の位置は出さない）
export const INTEL = Object.freeze({ UNKNOWN: 0, SPOTTED: 1, IDENTIFIED: 2, LOST: 3 });

export const FOG = Object.freeze({
  seeSpot: 220,        // 目で軍勢に気付く遠さ（m）
  seeId: 90,           // 旗と武将の顔が分かる遠さ（m）
  highBonus: 1.35,     // 高所から見る時の遠さの倍
  touchId: true,       // 斬り合いで触れたら、すぐ分かる
  scoutId: true,       // 斥候が見つけたら、武将と兵種まで分かる
  holdLost: 45,        // 見えなくなってから、推定の位置を地図に残す秒（GPS のような追跡はしない）
  holdLostIntel: 75,   // 情報の武将（官兵衛・隆景・元就など）がいる軍の残す秒
  forgetSpotted: 12,   // SPOTTED のまま見えなくなった時、LOST に移るまでの秒（IDENTIFIED はすぐ LOST）
});

// 一つの軍が見ている敵の隊の帳面
export function createFog(opts = {}) {
  return { t: 0, intel: !!opts.intel, units: new Map() };
}

function rec(fog, id) {
  let r = fog.units.get(id);
  if (!r) { r = { state: INTEL.UNKNOWN, seenAt: -1e9, lastPos: null, known: false }; fog.units.set(id, r); }
  return r;
}

// 一つの敵の隊を、このコマにどう見たか。how：'eye'（目）・'high'（高所の目）・'scout'（斥候）・'touch'（斬り合い）・'report'（使番の報告）
//   d は自分の一番近い目からの遠さ（m）。見えていなければ呼ばない（tickFog が LOST へ移す）
export function observe(fog, id, pos, how = 'eye', d = 0) {
  const r = rec(fog, id);
  const far = how === 'high' ? FOG.highBonus : 1;
  let lv = INTEL.UNKNOWN;
  if (how === 'touch' && FOG.touchId) lv = INTEL.IDENTIFIED;
  else if (how === 'scout' && FOG.scoutId) lv = INTEL.IDENTIFIED;
  else if (how === 'report') lv = INTEL.SPOTTED;
  else if (d <= FOG.seeId * far) lv = INTEL.IDENTIFIED;
  else if (d <= FOG.seeSpot * far) lv = INTEL.SPOTTED;
  if (lv === INTEL.UNKNOWN) return r.state;
  // 一度武将まで分かった隊は、また見つけた時も名で出す（旗の覚え）
  if (lv === INTEL.SPOTTED && r.known) lv = INTEL.IDENTIFIED;
  if (lv === INTEL.IDENTIFIED) r.known = true;
  r.state = lv; r.seenAt = fog.t; r.lastPos = pos ? { x: pos.x, z: pos.z } : r.lastPos;
  return r.state;
}

// 毎コマ（または一秒ごと）。見えなくなった隊を LOST へ、古い LOST を UNKNOWN へ
export function tickFog(fog, t) {
  fog.t = t;
  const hold = fog.intel ? FOG.holdLostIntel : FOG.holdLost;
  for (const r of fog.units.values()) {
    const gone = t - r.seenAt;
    if (r.state === INTEL.IDENTIFIED && gone > 0) r.state = INTEL.LOST;
    else if (r.state === INTEL.SPOTTED && gone > FOG.forgetSpotted) r.state = INTEL.LOST;
    else if (r.state === INTEL.LOST && gone > hold) { r.state = INTEL.UNKNOWN; r.lastPos = null; }
  }
}

// 地図と画面に出す物（字は名と兵種だけ。分からない物は出さない）
export function fogView(fog, id) {
  const r = fog.units.get(id);
  if (!r || r.state === INTEL.UNKNOWN) return null;
  return { state: r.state, pos: r.lastPos, showName: r.state === INTEL.IDENTIFIED, estimate: r.state === INTEL.LOST };
}

// ---- 降伏 ----
export const SURRENDER = Object.freeze({
  noEarly: 300,        // 始まって五分は降伏できない（K603・kaito_online_battle_1121 46「開始5分から降伏できる」）
  lateLeft: 300,       // 残りが五分を切れば、いつでも降伏できる
  clearRatio: 0.45,    // 自分の兵力が相手の四割五分を切れば（勝敗が明らか）、時間にかかわらず降伏できる
  voteNeed: 1,         // 1対1 は本人だけ（複数人の戦は全員の同意へ広げる時にここを変える）
  rankLoss: 0.8,       // 降伏の負けで失う段位の点（ふつうの負けを 1 として。罰は小さく）
  rankLossLeave: 1.5,  // わざと抜けた負けで失う点（降伏より重い）
});

// match：{ t, length, myStrength, foeStrength }（t は始まってからの秒、length は一戦の長さ＝900）
export function canSurrender(match) {
  if (!match || match.over) return { ok: false, why: 'over' };
  if (match.t < SURRENDER.noEarly) return { ok: false, why: 'early', wait: Math.ceil(SURRENDER.noEarly - match.t) };
  // K603：五分の後はいつでも降伏できる（kaito 11/21 46）。訳は残り時間と兵の差で付ける（報告の字のため）
  const left = (match.length ?? 900) - match.t;
  if (left <= SURRENDER.lateLeft) return { ok: true, why: 'late' };
  if (match.foeStrength > 0 && match.myStrength / match.foeStrength < SURRENDER.clearRatio) return { ok: true, why: 'clear' };
  return { ok: true, why: 'after5' };
}

// 降伏した時の結果（負け）。残った兵力は戦の報告の評価にだけ少し効く
export function surrenderResult(match) {
  const left = Math.max(0, match.myStrength || 0), start = Math.max(1, match.myStart || 4000);
  return { win: false, how: 'surrender', rankLoss: SURRENDER.rankLoss, keptRatio: Math.min(1, left / start) };
}

// ---- 回線の切断と AI の引き継ぎ ----
export const LINK = Object.freeze({
  aiAfter: 0,          // 切れたら、すぐ（0秒）その武将と隊を AI が継ぐ。隊も武将も消さない
  backWindow: 120,     // この秒の内に戻れば、同じ武将へ戻る（その後も戻れるが、戦の報告に「切断」と残る）
  leaveWindow: 86400,  // わざと抜けた数を数える長さ（一日）
  leaveLimit: 3,       // 一日にわざと抜けた数がこれに届くと、
  leaveBan: 600,       //   この秒だけマッチングを止める（回線の切断は数えない）
});

// 席ごとの帳面。seat：{ id, ai:false, droppedAt:null, intentional:false }
export function createLink() { return { seats: new Map(), leaves: new Map() }; }

export function seatOf(link, id) {
  let s = link.seats.get(id);
  if (!s) { s = { id, ai: false, droppedAt: null, intentional: false, drops: 0 }; link.seats.set(id, s); }
  return s;
}

// 回線が切れた（intentional：本人が「戦を抜ける」を押した時だけ true。通信が途切れただけなら false）
//   返す hand：その席の武将と隊を AI へ渡す（net_coop の handToAI と同じ形）
export function onDrop(link, id, t, intentional = false) {
  const s = seatOf(link, id);
  s.droppedAt = t; s.intentional = intentional; s.drops++;
  s.ai = true;
  if (intentional) {
    const L = link.leaves.get(id) || [];
    L.push(t); link.leaves.set(id, L.filter((x) => t - x <= LINK.leaveWindow));
  }
  return { hand: 'ai', seat: id };
}

// 戻った：同じ武将へ戻す（AI から人へ）
export function onBack(link, id, t) {
  const s = seatOf(link, id);
  if (!s.ai) return { hand: 'none', seat: id };
  const late = s.droppedAt != null && t - s.droppedAt > LINK.backWindow;
  s.ai = false; s.droppedAt = null;
  return { hand: 'human', seat: id, late };
}

// わざと抜けるのが多い人だけ、短い間マッチングを止める（回線の切断とは分ける）
export function matchBanLeft(link, id, now) {
  const L = (link.leaves.get(id) || []).filter((x) => now - x <= LINK.leaveWindow);
  if (L.length < LINK.leaveLimit) return 0;
  return Math.max(0, Math.ceil(L[L.length - 1] + LINK.leaveBan - now));
}

// 戦の終わりの扱い：最後まで AI で戦った席の負けは、わざと抜けた時だけ重い
export function dropResult(link, id) {
  const s = seatOf(link, id);
  return { leftOnPurpose: !!(s.ai && s.intentional), rankLoss: s.ai && s.intentional ? SURRENDER.rankLossLeave : 1 };
}

// ---- 本陣と勝ち負けの判定（K603・docs/kaito_online_battle_1121.md 29〜46。前は online_final_1120.md 87〜92 の四つの印）----
//   本陣は円の取り合いでなく、戦って崩す。HQ_INTEGRITY（0〜100）を、旗本の損・馬印・総大将の傷・敵の侵入・守りの士気から量る。
//   状態は SECURE（無事）・THREATENED（脅かされ）・UNDER_ATTACK（攻められ）・COLLAPSING（崩れかけ）・FALLEN（陥落）。
//   陥落＝旗本が崩れて総大将に届き、総大将が討死か退く（旗本の残りが hatamotoBroken 未満か、HQ が fallAt 以下で、総大将が dead/retreated）。
//   総大将の討死だけでは陥落しない（副将が継ぐ・match.js が全軍の士気 −30 と下知の遅れを掛ける）。
//   勝ち：A 敵本陣陥落・B 敵全軍の士気崩壊（兵の七割超が潰走のまま routHold 秒）・C 十五分の判定（兵力30・士気25・本陣25・戦線10・武将の生存10）。
//   全武将が討たれた側は負け（why 'taisho'）。match.js（cloud-18）が毎秒 judge(state) を呼ぶ。
//   state：{ t, length=900, sides: [A, B], memo }
//   側 A・B：{ honjin: { routed(本陣の備が潰走中か), hatamoto(0〜1 旗本＝本陣の備の残り), umajirushi(馬印が立っているか), taisho('alive'|'retreated'|'dead'), taishoHp(0〜1),
//                        intrusion(0〜1 本陣の内へ入った敵の重さ), guardMorale(0〜100 本陣の士気), formation(0〜1・古い形。あれば旗本の代わりに少し効く) },
//             units: [{ strength, start, morale(0〜100), routed }], front(0〜1 戦線の支配), generals: { alive, total }（無ければ kills を使う）, kills }
export const HQ = Object.freeze({
  w: { hatamoto: 40, umajirushi: 15, taisho: 20, intrusion: 15, morale: 10 },   // 足すと 100
  secureAt: 85, threatAt: 60, attackAt: 35, fallAt: 15,
});
export const HQ_STATE = Object.freeze({ SECURE: 'SECURE', THREATENED: 'THREATENED', UNDER_ATTACK: 'UNDER_ATTACK', COLLAPSING: 'COLLAPSING', FALLEN: 'FALLEN' });
export const JUDGE = Object.freeze({
  extraMax: 180,         // 延長は最大三分
  closeGap: 0.04,        // 時間切れの点がこれより近ければ延長
  hatamotoBroken: 0.25,  // 旗本の残りがこれを切ると、総大将へ届く
  formationBroken: 0.35, // 古い形（formation）だけ渡された時の崩れ
  routShare: 0.7,        // 全軍の士気崩壊：潰走中の兵が残る兵の七割を超える
  routHold: 30,          // その割合を超えたまま、この秒続いたら全軍撤退（一時の崩れで決着しない）
  w: { strength: 0.30, morale: 0.25, honjin: 0.25, front: 0.10, generals: 0.10 },   // 時間切れの点の重み（kaito 11/21 39）
  killsFull: 4,          // generals が無い時：敵の武将を四人討てば満点（古い形）
  taishoMorale: -30,     // 総大将の討死で全軍の士気
  taishoLag: 6,          // 総大将の討死の後、下知が遅れる秒（副将が継ぐまで）
  taishoLagFor: 30,      //   その遅れが続く秒
  fallShow: 4,           // 本陣陥落の後、敵全軍の崩れを見せてから締める秒
});

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// HQ_INTEGRITY（0〜100）
export function hqIntegrity(h = {}) {
  const W = HQ.w;
  let hata = h.hatamoto ?? 1;
  if (h.hatamoto == null && h.formation != null) hata = h.formation;
  const tai = h.taisho === 'dead' ? 0 : h.taisho === 'retreated' ? 0.2 : clamp01(h.taishoHp ?? 1);
  const v = W.hatamoto * clamp01(hata) + W.umajirushi * (h.umajirushi === false ? 0 : 1) + W.taisho * tai
    + W.intrusion * (1 - clamp01(h.intrusion ?? 0)) + W.morale * clamp01((h.guardMorale ?? 70) / 70);
  return Math.round(Math.max(0, Math.min(100, v)));
}
export function honjinFallenH(h = {}) {
  const gone = h.taisho === 'dead' || h.taisho === 'retreated';
  if (!gone) return false;
  // 本陣の備そのものが潰走したまま（routed＝呼ぶ側が十五秒続いた時だけ立てる）、敵が本陣に入っているか旗本が半分を切った＝陥落
  //   （11/21 通しで本陣陥落が12戦0だった。一時の崩れでは落とさない）
  // K613（kaito 11/22「全然修羅じゃない。本陣も信長も一瞬で討ち取れた」）：h.strict（上級・修羅の相手・対戦）は、旗本を崩さないと陥落しない。
  //   総大将を一人で討っても、旗本（本陣の備の残り）が半分ある間は馬廻衆頭が継いで本陣は立つ（侵入の重さや HQ の低さだけでは落ちない）
  if (h.routed && (h.strict ? (h.hatamoto ?? 1) < 0.5 : ((h.intrusion ?? 0) >= 0.3 || (h.hatamoto ?? 1) < 0.5))) return true;
  const hata = h.hatamoto ?? h.formation ?? 1;
  if (hata < JUDGE.hatamotoBroken || (h.formation != null && h.hatamoto == null && h.formation < JUDGE.formationBroken)) return true;
  return hqIntegrity(h) <= HQ.fallAt && (!h.strict || hata < 0.5);
}
export const honjinFallen = (side) => honjinFallenH(side?.honjin);
export function hqState(h = {}) {
  if (honjinFallenH(h)) return HQ_STATE.FALLEN;
  const v = hqIntegrity(h), inn = h.intrusion ?? 0;
  if (v < HQ.attackAt) return HQ_STATE.COLLAPSING;
  if (v < HQ.threatAt || inn >= 0.3) return HQ_STATE.UNDER_ATTACK;
  if (v < HQ.secureAt || inn > 0) return HQ_STATE.THREATENED;
  return HQ_STATE.SECURE;
}
// 古い呼び名（本陣の崩れの印の数 0〜4）：HQ から割り戻す。報告や古い試しのため
export function honjinMarks(h = {}) {
  let n = 0;
  if ((h.formation ?? h.hatamoto ?? 1) < JUDGE.formationBroken) n++;
  if (h.taisho === 'retreated' || h.taisho === 'dead') n++;
  if (h.umajirushi === false) n++;
  if ((h.hatamoto ?? 1) < JUDGE.hatamotoBroken) n++;
  return n;
}

// 潰走中の兵の割合（兵の数で量る。隊の数ではない）
export function routShare(side) {
  const us = side?.units || [];
  if (!us.length) return 0;          // 隊がまだ並んでいない（試合の始め）＝判定しない
  let all = 0, run = 0;
  for (const u of us) { const s = Math.max(0, u.strength || 0); all += s; if (u.routed) run += s; }
  return all > 0 ? run / all : 1;   // 隊はあるのに兵が一人もいなければ崩れた扱い
}
export const armyRouted = (side) => routShare(side) > JUDGE.routShare;
// 全武将が討たれた（generals がある時だけ）
export const allGeneralsDown = (side) => !!side?.generals && side.generals.total > 0 && side.generals.alive <= 0;

// 時間切れの点の内訳（どれも 0〜1 に重みを掛けた物。足すと timeScore）
export function timeParts(side) {
  const us = side?.units || [];
  let now = 0, start = 0, mor = 0, ms = 0;
  for (const u of us) { const s = Math.max(0, u.strength || 0); now += s; start += Math.max(0, u.start || 0); mor += (u.morale ?? 0) * s; ms += s; }
  const W = JUDGE.w, g = side?.generals;
  return {
    strength: W.strength * (start > 0 ? now / start : 0),
    morale: W.morale * (ms > 0 ? mor / ms / 100 : 0),
    honjin: W.honjin * (hqIntegrity(side?.honjin) / 100),
    front: W.front * clamp01(side?.front ?? 0.5),
    generals: W.generals * (g && g.total > 0 ? clamp01(g.alive / g.total) : Math.min(1, (side?.kills || 0) / JUDGE.killsFull)),
  };
}
// 勝った側が一番大きく上回った項（画面の理由の字に使う）
export function timeLead(A, B) {
  const a = timeParts(A), b = timeParts(B);
  let k = null, best = 0;
  for (const key of Object.keys(a)) { const d = Math.abs(a[key] - b[key]); if (d > best) { best = d; k = key; } }
  return k;
}
// 時間切れの点（0〜1）
export function timeScore(side) { const p = timeParts(side); return p.strength + p.morale + p.honjin + p.front + p.generals; }

// { over, winner(0|1|null=引き分け), why('honjin'|'rout'|'taisho'|'time'|'draw'), overtime(延長中か) }
export function judge(state) {
  const [A, B] = state.sides, len = state.length ?? 900;
  // state.memo（試合ごとに持ち回す物）があれば、潰走が routHold 秒続いた時だけ崩壊とする。無ければその場で
  const memo = state.memo, raw = [armyRouted(A), armyRouted(B)];
  const rout = raw.map((r, i) => {
    if (!memo) return r;
    memo.routAt ||= [null, null];
    if (!r) { memo.routAt[i] = null; return false; }
    if (memo.routAt[i] == null) memo.routAt[i] = state.t;
    return state.t - memo.routAt[i] >= JUDGE.routHold;
  });
  const fall = [honjinFallen(A), honjinFallen(B)], dead = [allGeneralsDown(A), allGeneralsDown(B)];
  const lost = [fall[0] || rout[0] || dead[0], fall[1] || rout[1] || dead[1]];
  const whyOf = (i) => (fall[i] ? 'honjin' : dead[i] ? 'taisho' : 'rout');
  if (lost[0] !== lost[1]) return { over: true, winner: lost[0] ? 1 : 0, why: whyOf(lost[0] ? 0 : 1), overtime: state.t > len };
  if (lost[0] && lost[1]) {   // 同じ秒に両方崩れた：時間切れと同じ点で決める
    const d = timeScore(A) - timeScore(B);
    return { over: true, winner: d === 0 ? null : d > 0 ? 0 : 1, why: d === 0 ? 'draw' : 'time', overtime: state.t > len };
  }
  if (state.t < len) return { over: false, winner: null, why: null, overtime: false };
  const sa = timeScore(A), sb = timeScore(B), d = sa - sb;
  if (Math.abs(d) < JUDGE.closeGap && state.t < len + JUDGE.extraMax) return { over: false, winner: null, why: null, overtime: true };
  return { over: true, winner: d === 0 ? null : d > 0 ? 0 : 1, why: d === 0 ? 'draw' : 'time', overtime: state.t > len, score: [sa, sb], lead: d === 0 ? null : timeLead(A, B) };
}

// 勝因・敗因（報告に必ず出す）。r＝judge の結果、A＝自分・B＝相手（judge と同じ形）、ev＝試合の出来事 { foeTaishoDead, myTaishoDead, reserveUsed, wings: { left, right }（自分の翼の残り 0〜1）, foeWings }
//   返す：勝ちなら勝因、負けなら敗因の字の並び（多くて三つ）
export function matchReasons(r, A, B, ev = {}) {
  const win = r?.winner === 0, out = [];
  const add = (s) => { if (s && !out.includes(s) && out.length < 3) out.push(s); };
  const mor = (S) => { let m = 0, n = 0; for (const u of S?.units || []) { const s = Math.max(0, u.strength || 0); m += (u.morale ?? 0) * s; n += s; } return n ? m / n : 0; };
  if (win) {
    if (r.why === 'honjin') add('敵本陣陥落');
    if (r.why === 'rout') add('敵全軍の士気崩壊');
    if (r.why === 'taisho' || ev.foeTaishoDead) add('敵総大将討取');
    if (r.why === 'surrender') add('敵の降伏');
    if (ev.foeWings?.left != null && ev.foeWings.left < 0.35) add('敵左翼を突破');   // 翼の左右は相手の向きで呼ぶ
    if (ev.foeWings?.right != null && ev.foeWings.right < 0.35) add('敵右翼を突破');
    if (ev.reserveUsed) add('予備隊の投入');
    if (mor(A) > mor(B) + 10) add('士気で優勢');
    if (ev.wings?.left > 0.6 && ev.wings?.right > 0.6) add('両翼を守り切った');
    if (!out.length) add(r.why === 'time' ? '判定で上回った' : '粘り勝ち');
  } else if (r?.winner === 1) {
    if (r.why === 'honjin') add('本陣突破');
    if (r.why === 'rout') add('全軍の士気崩壊');
    if (r.why === 'taisho') add('武将が皆討たれた');
    if (r.why === 'surrender') add('降伏');
    if (ev.myTaishoDead) add('総大将の討死');
    if (ev.wings?.left != null && ev.wings.left < 0.35) add('左翼崩壊');
    if (ev.wings?.right != null && ev.wings.right < 0.35) add('右翼崩壊');
    if (!ev.reserveUsed) add('予備隊を使わなかった'); else add('予備隊消耗');
    if (mor(B) > mor(A) + 10) add('士気で劣勢');
    if (!out.length) add(r.why === 'time' ? '判定で下回った' : '力負け');
  } else add('両軍拮抗');
  return out;
}
