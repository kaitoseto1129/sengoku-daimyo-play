// 両軍の総大将（kaito 0929）
// ・どの戦にも、敵の総大将の本人が敵の本陣にいる。本陣は旗本と分厚い控えに囲まれている。総大将を討ち取れば、史実で死んでいなくても、その場で勝ち
// ・味方の総大将（殿）も本人が味方の本陣にいる。敵は時々、殿を狙う一隊を送ってくる。殿が討たれたら負け
// ・信長で遊ぶ時（G.lord）は、殿は自分なので味方の殿は置かない
// 戦の定義に def.taisho = { a: {...}, b: {...} } があれば、下の表より先に使う（a か b を null にすると、その側は置かない）
//   { name, mon, faction, at: { x, z }, use（定義が出す本人を待って使う）, def（定義が討ち取りの流れを持つ。何もしない）, off（置かない）, hat, haori,
//     fate（束5・65 章。b 側だけ。既定 'die'＝討てば勝ち。'flee'＝馬廻が尽きるまで討たれない。'capture'＝馬廻が尽きた後、9m 内に迫れば生け捕り。'abandon'＝本陣の厚みが尽きかけたら討たれる前に本陣を捨てて退く（戦は続く）） }
// battle.js からは taishoInit（戦の始め）・taishoTick（毎コマ）・taishoKill（誰かが討たれた時）の三つだけを呼ぶ
import { KIT } from './b_nagashinojo.js';
import { enemyGroup, allyGroup, unitPos, centerOf, ringWall } from './bhelp.js';
import { BATTLES } from './state.js';
import { HALF } from './world.js';
import { sfx } from './audio.js';
import { logEvent } from './senkyo.js';

// 織田家編の三十の戦：両軍の総大将（史実に合わせる。戦の場にいなかった者は、その軍の旗頭を置く）
const TABLE = {
  okehazama: { b: { name: '今川義元', def: true }, a: { name: '織田信長', use: true } },   // 義元を討つ流れは定義が持つ
  moribe: { b: { name: '長井甲斐守', use: true }, a: { name: '織田信長' } },
  sunomata: { b: { name: '稲田弾正', use: true }, a: { name: '木下藤吉郎' } },
  // 龍興は討ち取る敵ではなく、城を明け渡すまで討てない（b_inabayama.js の火の合図で勝つ）。use のままだと
  // taisho の adopt() が開戦直後に invuln を剥がし、柵の内から弓に討たれて数十秒で「総大将を討ち取った」勝ちになってしまう（kaito 0930）
  inabayama: { b: { name: '斎藤龍興', def: true }, a: { name: '織田信長' } },
  mitsukuri: { b: { name: '吉田出雲守', use: true }, a: { name: '織田信長' } },
  okawachi: { b: { name: '北畠具教' }, a: { name: '織田信長' } },
  kanegasaki: { b: { name: '朝倉景健', use: true }, a: { name: '木下藤吉郎', use: true } },   // しんがりの大将が殿
  anegawa: { b: { name: '浅井長政' }, a: { name: '織田信長' } },
  nodafukushima: { b: { name: '三好長逸' }, a: { name: '織田信長' } },
  shiga: { b: { name: '朝倉義景' }, a: { name: '各務元正' } },   // 森可成は筋書きで討ち死にするので、城を守り通した各務を殿に
  hieizan: { b: { name: '正覚院豪盛', use: true }, a: { name: '織田信長' } },
  mikatagahara: { b: { name: '武田信玄' }, a: { name: '徳川家康', mon: 'tokugawa', faction: 'tokugawa' } },
  tonezaka: { b: { name: '朝倉義景' }, a: { name: '織田信長', use: true } },
  odani: { b: { name: '浅井長政' }, a: { name: '織田信長' } },
  nagashima: { b: { name: '下間頼旦' }, a: { name: '織田信長' } },   // 願証寺と組んだ本願寺の坊官
  shitaragahara: { b: { name: '武田勝頼' }, a: { name: '織田信長' } },
  echizen: { b: { name: '下間頼照' }, a: { name: '織田信長' } },
  iwamura: { b: { name: '秋山虎繁' }, a: { name: '織田信忠' } },
  tennoji: { b: { name: '下間頼廉' }, a: { name: '織田信長', use: true } },
  saika: { b: { name: '鈴木孫一' }, a: { name: '織田信長' } },
  tedorigawa: { b: { name: '上杉謙信' }, a: { name: '柴田勝家', use: true } },
  shigisan: { b: { name: '松永久秀' }, a: { name: '織田信忠' } },
  kizugawa: { b: { name: '村上元吉', off: true }, a: { name: '九鬼嘉隆', off: true } },   // 海の上の戦（本陣を置く陸が無い）
  miki: { b: { name: '別所長治' }, a: { name: '羽柴秀吉', use: true } },
  arioka: { b: { name: '荒木久左衛門', off: true }, a: { name: '織田信忠' } },   // 村重は尼崎へ移った後。城を預かった荒木久左衛門。史実でも本丸は持ちこたえた戦なので、討ち取り即勝ちにはしない（官兵衛を救い出す筋書きが壊れる）
  iga: { b: { name: '百地丹波' }, a: { name: '織田信雄' } },
  tottori: { b: { name: '吉川経家' }, a: { name: '羽柴秀吉', use: true } },
  // 仁科盛信は本丸が落ちるまで討ち死にしない（b_takato_siege.js の win() が決める）。use のままだと
  // 本丸の目当て文に名が入っているので defOwned になり、序盤に討たれただけで「討ち取ったり」と
  // 戦が終わってしまう（kaito 10/1、龍興と同じ理由。inabayama のコメント参照）
  takato: { b: { name: '仁科盛信', def: true }, a: { name: '織田信忠', use: true } },
  tano: { b: { name: '武田勝頼', use: true }, a: { name: '滝川一益', use: true } },
  honnoji: { b: { name: '明智光秀' }, a: { name: '織田信忠', off: true } },   // 信忠は筋書きで二条御所に自害する
};
// 殿を狙う一隊：難しさごとの間（秒）・数・中身
const RAID = {
  easy: { every: 170, max: 2, list: [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }] },
  normal: { every: 115, max: 3, list: [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }] },
  hard: { every: 80, max: 4, list: [{ type: 'samurai', n: 3 }, { type: 'ashigaru', n: 6 }, { type: 'cavalry', n: 3 }] },
};
// 野戦（城攻め・籠城でない）で、一つおきに送る本気の突撃：騎馬を先に、前線を割って本陣へ
const FIELD_BIG = {
  easy: { list: [{ type: 'cavalry', n: 3 }, { type: 'samurai', n: 3 }, { type: 'ashigaru', n: 10 }] },
  normal: { list: [{ type: 'cavalry', n: 5 }, { type: 'samurai', n: 4 }, { type: 'ashigaru', n: 14 }] },
  hard: { list: [{ type: 'cavalry', n: 7 }, { type: 'samurai', n: 5 }, { type: 'ashigaru', n: 18 }] },
};
const CAP = 215;   // これより本物の兵が多ければ、本陣の備や殿を狙う隊を減らす（全体で 250 以下）
const LIM = HALF - 18;
const clamp = (v) => Math.max(-LIM, Math.min(LIM, v));
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const nameIs = (u, n) => u.name === n || (u.name && u.name.endsWith(' ' + n));
const real = (rt) => { let n = 0; for (const u of rt.army.units) if (u.alive && !u.isStruct && u.type !== 'dummy') n++; return n; };
function centroid(rt, team, skip) {
  let x = 0, z = 0, n = 0;
  for (const u of rt.army.units) {
    if (!u.alive || u.isStruct || u.isPlayer || u.team !== team || u.type === 'dummy' || u.type === 'porter') continue;
    if (skip && skip(u)) continue;
    x += u.pos.x; z += u.pos.z; n++;
  }
  return n ? { x: x / n, z: z / n, n } : null;
}
function commonFaction(rt, team, def) {
  const c = {};
  for (const g of rt.army.groups) if (g.team === team && g.faction) c[g.faction] = (c[g.faction] || 0) + g.units.length;
  let best = def, k = 0;
  for (const f in c) if (c[f] > k) { k = c[f]; best = f; }
  return best;
}
// 陸の上で、端から離れた所まで from から to の方へ戻す
function landAt(rt, p, back) {
  let q = { x: clamp(p.x), z: clamp(p.z) };
  for (let i = 0; i < 10 && rt.world.inWaterAt && rt.world.inWaterAt(q.x, q.z); i++) {
    const d = d2(q, back) || 1, s = Math.min(10, d) / d;
    q = { x: q.x + (back.x - q.x) * s, z: q.z + (back.z - q.z) * s };
  }
  return q;
}
// 同じ知らせは 8 秒に一度まで（決まり）。gap はそれより長くしてよい
function once(T, rt, key, gap, fn) {
  if ((T.said[key] ?? -99) + Math.max(8, gap) > rt.t) return;
  T.said[key] = rt.t; fn();
}
// 同じ叱り・知らせは、一つの戦で max 回まで（くり返しで鬱陶しくならないように。8 秒に一度までの決まりとは別枠）
function onceN(T, rt, key, gap, max, fn) {
  T.saidN = T.saidN || {};
  if ((T.saidN[key] || 0) >= max) return;
  if ((T.said[key] ?? -99) + Math.max(8, gap) > rt.t) return;
  T.said[key] = rt.t; T.saidN[key] = (T.saidN[key] || 0) + 1; fn();
}

export function taishoInit(rt) {
  const def = rt.def;
  if (def.dojo || def.mapCastle || def.noTaisho) return null;
  const bi = BATTLES[rt.index], id = bi && bi.id;
  const base = TABLE[id];
  const own = def.taisho;
  if (!base && !own) return null;
  const pick = (k) => {
    if (own && own[k] === null) return null;
    const e = { ...((base && base[k]) || {}), ...((own && own[k]) || {}) };
    return e.name && !e.off ? e : null;
  };
  const T = { a: pick('a'), b: pick('b'), said: {}, pollT: 0, raids: 0, raid: null, raidKills: 0, nextRaid: null, sides: def.sides || {} };
  if (rt.G.lord) T.a = null;   // 信長で遊ぶ時は、殿は自分自身
  if (!T.a && !T.b) return null;
  for (const k of ['a', 'b']) if (T[k]) T[k].state = T[k].def ? 'def' : 'wait';
  return T;
}

// ---------------- 置く ----------------
function adopt(rt, T, k) {
  const e = T[k], team = k === 'a' ? 0 : 1;
  const u = rt.army.units.find((o) => o.alive && o.team === team && nameIs(o, e.name));
  if (!u) return false;
  e.u = u; e.state = 'on'; e.adopted = true; u.isTaisho = k;
  if (team === 1) {
    u.invuln = false; u.woundOut = null; u.noTarget = false;   // 史実で生き延びた大将でも、ここでは討てる
    // 束5：総大将の扱い（65 章）。def.taisho.b.fate：'flee'・'capture' は馬廻（e.mg）が尽きるまで討たれない
    if (e.fate === 'flee' || e.fate === 'capture') u.invuln = true;
  } else {
    u.maxHp *= 3; u.hp = u.maxHp;
    if (u.invuln) { u.allyOk = true; e.woundLose = true; }   // 敵の槍も通る。深手（手傷で退く所）まで削られたら、旗本の陰に退く（負けではない）
  }
  // 定義の任務が本人の名を出していれば、討ち取りの流れも定義が持つ（こちらは後から見届ける）
  if (team === 1 && rt.objectives.some((o) => o.text && o.text.includes(e.name))) e.defOwned = true;
  return true;
}
function placeEnemy(rt, T, force) {
  const e = T.b, S = rt.player.u.pos;
  const C = centroid(rt, 1);
  if (!C && !force && !e.at) return false;
  let P;
  if (e.at) P = { x: e.at.x, z: e.at.z };
  else if (C) {
    // 本陣は戦場の奥（前より倍ほど遠く）に置く。すぐには見えず、陣幕と前の備を抜けてから分かるように
    let dx = C.x - S.x, dz = C.z - S.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const push = L > 150 ? 36 : 60;
    P = { x: C.x + dx * push, z: C.z + dz * push };
    if (d2(P, S) < 130) P = { x: S.x + dx * 130, z: S.z + dz * 130 };
  } else {
    const h = rt.player.u.heading || 0;
    P = { x: S.x + Math.sin(h) * 130, z: S.z + Math.cos(h) * 130 };
  }
  P = landAt(rt, P, S);
  const face = Math.atan2(S.x - P.x, S.z - P.z), fx = Math.sin(face), fz = Math.cos(face);
  const faction = e.faction || commonFaction(rt, 1, 'saito');
  const mon = e.mon || (T.sides.b && T.sides.b.mon) || 'maru';
  const armor = KIT.ARMOR[faction] || KIT.ARMOR.west;
  KIT.honjin(rt, P.x, P.z, { mon, people: false, fire: false });
  // 本陣は「一番厚い」所：本物の兵を 40 人以上、槍の備（外）・馬廻り（中）・旗本（内）の三重に置く。
  // 混んだ戦で枠が無ければ、遠い控え・通り過ぎた隊（markRecyclable）を先に軽い兵へ戻して空ける。
  // それでも枠が足りなければ数を絞る（250 人ほどの重さの決まりは破らない）
  const TARGET = 47;
  const need = TARGET - (CAP - real(rt));
  if (need > 0) KIT.freeRoom(rt, need, rt.player.u);
  const avail = Math.max(14, CAP - real(rt));
  const k = Math.min(1, avail / TARGET);
  const sc = (n) => Math.max(1, Math.round(n * k));
  // 外を囲む柵（陣幕のさらに外。総大将の周りは、幾重にも囲まれている）。口は陣幕と同じ向き（+z 側）に開ける
  ringWall(rt, P.x, P.z, 15, { team: 1, hp: 260, segLen: 5, gapAt: 0, gapW: 0.9, name: `${e.name}の柵` });
  const g = enemyGroup(rt, { faction, name: `${e.name}の旗本`, anchor: { x: P.x, z: P.z - 2 }, facing: face, order: 'hold', aggro: 14, seekRange: 22,
    noRout: true, morale: 100, guard: true, width: 6, defMult: 1.4, noGuard: true },
  [{ type: 'busho', n: 1, o: { name: e.name, hat: e.hat || 'kabuto_w', haori: e.haori } }, { type: 'samurai', n: sc(6) }, { type: 'ashigaru', n: sc(8) }]);
  const u = g.units.find((o) => o.type === 'busho' && o.name === e.name);
  if (!u) return true;
  u.maxHp *= 4.5; u.hp = u.maxHp; u.isTaisho = 'b'; g.leader = u; g.guardBase = g.defMult;
  e.u = u; e.g = g; e.at = P; e.state = 'on';
  e.guards = [g];   // 槍の備（外）・馬廻り（中）・旗本（内）をまとめて「本陣の厚み」として数える。崩れ具合で硬さ・退く判断を決める
  // 中：大将のすぐ周りを固める馬廻り（騎馬と侍）。大将が逃げる時、供としてついて行く
  const mg = enemyGroup(rt, { faction, name: `${e.name}の馬廻り`, anchor: { x: P.x - fz * 8, z: P.z + fx * 8 - 1 }, facing: face, order: 'hold', aggro: 15, seekRange: 26, morale: 95, width: 6, noGuard: true, defMult: 1.35 },
    [{ type: 'samurai', n: sc(3) }, { type: 'cavalry', n: sc(5) }]);
  mg.guardBase = mg.defMult; mg.leader = u; KIT.markRecyclable(mg);
  e.guards.push(mg); e.mg = mg;
  // 外：前の左右に本物の備（槍。遠くなれば軽い兵へ戻せる）。大将が逃げた後は、道を塞ぐ殿（しんがり）になる
  const sx = -fz, sz = fx;
  for (const s of [-1, 1]) {
    const sg = enemyGroup(rt, { faction, name: `${e.name}の備`, anchor: { x: P.x + fx * 20 + sx * 11 * s, z: P.z + fz * 20 + sz * 11 * s }, facing: face, order: 'hold', aggro: 16, seekRange: 30, morale: 90, width: 6, noGuard: true, defMult: 1.3 },
      [{ type: 'samurai', n: sc(3) }, { type: 'ashigaru', n: sc(9) }]);
    sg.guardBase = sg.defMult;
    KIT.markRecyclable(sg);
    KIT.backOf(rt, sg, { flag: mon, armor, kind: 'spear', w: 12, depth: 8, count: 70, seed: 311 + s * 7 });
    e.guards.push(sg);
  }
  e.guardN0 = e.guards.reduce((a, gg) => a + gg.units.filter((o) => o !== u).length, 0) || 1;   // 厚みの元の数（崩れ具合は、これに対する割合で見る）
  KIT.backOf(rt, g, { flag: mon, armor, kind: 'spear', w: 22, depth: 12, count: 140, seed: 303 });
  for (const s of [-1, 1]) KIT.farHost(rt, P.x - fz * 24 * s - fx * 4, P.z + fx * 24 * s - fz * 4, 10, 16, 70, face, armor, mon, 320 + s, 'spear');
  // 大将の位置を示す印や任務の札は出さない。物見のあいまいな一言だけ（238）
  rt.after(2, () => { if (T.b.state === 'on') rt.say('物見', '敵の本陣の方に、ひときわ大きな馬印が見えまする', 3.5); });
  return true;
}
function placeAlly(rt, T, force) {
  const e = T.a, S = rt.player.u.pos;
  const C1 = centroid(rt, 1), C0 = centroid(rt, 0, (u) => u.isSub || u.isTomo);
  if (!C1 && !force && !e.at) return false;
  let P;
  if (e.at) P = { x: e.at.x, z: e.at.z };
  else {
    const h = rt.player.u.heading || 0;
    let dx = C1 ? C1.x - S.x : Math.sin(h), dz = C1 ? C1.z - S.z : Math.cos(h); const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const B = C0 && d2(C0, S) < 90 ? C0 : S;
    P = { x: B.x - dx * 34, z: B.z - dz * 34 };
    if (d2(P, S) > 95) P = { x: S.x - dx * 40, z: S.z - dz * 40 };
  }
  P = landAt(rt, P, S);
  const face = C1 ? Math.atan2(C1.x - P.x, C1.z - P.z) : (rt.player.u.heading || 0);
  KIT.honjin(rt, P.x, P.z, { mon: e.mon || 'oda', people: false, fire: false });
  const small = real(rt) > CAP;
  const g = allyGroup(rt, { faction: e.faction || 'oda', name: `${e.name}の旗本`, anchor: { x: P.x, z: P.z - 2 }, facing: face, order: 'hold', aggro: 10, seekRange: 18,
    noRout: true, morale: 100, guard: true, stay: true, width: 5, defMult: 1.5, fullStrength: true },
  [{ type: 'busho', n: 1, o: { name: e.name, hat: e.hat || 'kabuto_w', haori: e.haori } }, { type: 'samurai', n: small ? 2 : 4 }, { type: 'ashigaru', n: small ? 3 : 8 }]);
  const u = g.units.find((o) => o.type === 'busho' && o.name === e.name);
  if (!u) return true;
  u.maxHp *= 4; u.hp = u.maxHp; u.isTaisho = 'a'; g.leader = u; g.guardBase = g.defMult;
  e.u = u; e.g = g; e.at = P; e.state = 'on';
  return true;
}

// ---------------- 毎コマ ----------------
export function taishoTick(rt, dt) {
  const T = rt.taisho;
  if (!T || rt.over) return;
  KIT.backTick(rt);   // 本陣の控え（一コマに一度だけ回る）
  if ((T.pollT -= dt) > 0) return;
  T.pollT = 1;
  const late = rt.t > 40;
  if (T.b && T.b.state === 'wait') {
    if (!adopt(rt, T, 'b') && !T.b.use) placeEnemy(rt, T, late);
  }
  if (T.a && T.a.state === 'wait') {
    if (!adopt(rt, T, 'a') && !T.a.use) placeAlly(rt, T, late);
  }
  const P = rt.player.u.pos;
  // 敵の総大将：位置を示す印や台詞は出さない。旗本の厚みで硬さが変わり、迫られれば奥へ退く（240）
  const B = T.b && T.b.state === 'on' && T.b.u;
  if (B && B.alive && T.b.g) {
    // 旗本（内）と両脇の備（前）をまとめて「本陣の厚み」とする。どれかだけ討っても崩れない
    const guards = T.b.guards || [T.b.g];
    let guardAlive = 0;
    for (const gg of guards) for (const o of gg.units) if (o.alive && o !== B) guardAlive++;
    T.b.guardAlive = guardAlive;
    // 厚みが残る間は硬く、崩れるほど討てるようになる（組や手勢と一緒に崩す前提。一人で切り込んでも通らない）
    // 厚みの元の数に対する割合で見る（備を置けない狭い戦でも、旗本だけで同じ硬さの曲線になるように）
    const base = T.b.g.guardBase || 1.4;
    const ratio = guardAlive / (T.b.guardN0 || guardAlive || 1);
    const tier = ratio >= 0.7 ? 2.4 : ratio >= 0.4 ? 1.5 : ratio >= 0.15 ? 0.85 : 0.55;
    for (const gg of guards) gg.defMult = (gg.guardBase || base) * tier;
    // 束5：abandon（本陣放棄）。厚みが尽きかけたら大将は本陣を捨てて退く（討ち取り即勝ちにはしない。戦は続く）
    if (T.b.fate === 'abandon' && ratio < 0.15 && !T.b.abandoned) { T.b.abandoned = true; abandonHonjin(rt, T); return; }
    const d = d2(B.pos, P);
    // 迫られると、旗本が総がかりで押し返す（間合いと勢いを上げる）
    T.b.g.seekRange = d < 32 ? 34 : 22;
    T.b.g.aggro = d < 32 ? 22 : 14;
    // 本陣のすぐそばまで迫られたら、大将は馬廻り（供）を連れて奥・脇道へ逃げる。槍の備（外）はその場に残り、道を塞ぐ殿になる
    // 馬廻りが尽きれば、もう逃げる供がいない（そこで最後の立ち姿。時間切れの保険は battle.js の側でそのまま効く）
    const mgAlive = T.b.mg ? T.b.mg.units.filter((o) => o.alive).length : 0;
    // 束5：flee・capture は馬廻がいる間は討たれない。尽きたら、そこから先は普通に討たれうる（flee）／囲めば生け捕り（capture）
    if ((T.b.fate === 'flee' || T.b.fate === 'capture') && B.invuln && mgAlive <= 0) {
      B.invuln = false;
      once(T, rt, 'bNoEscort', 15, () => rt.bark('もう守る供がおらぬ', true));
    }
    if (T.b.fate === 'capture' && !B.invuln && !T.b.captured && d2(B.pos, P) < 9) {
      T.b.captured = true; T.b.state = 'dead'; captureTaken(rt, T); return;
    }
    if ((d < 24 || B.hp < B.maxHp * 0.5) && mgAlive >= 1 && (T.bFallT ?? -99) + 5 < rt.t) {
      T.bFallT = rt.t;
      const first = !T.b.fleeing;
      T.b.fleeing = true;
      let dx = T.b.at.x - P.x, dz = T.b.at.z - P.z; const L = Math.hypot(dx, dz) || 1;
      // 素直に背へ引かず、少し脇（横道）へも振って、追いかけ甲斐のある動きにする
      const side = (T.bSide ?? (T.bSide = Math.random() < 0.5 ? 1 : -1));
      const ux = dx / L, uz = dz / L, sxv = -uz, szv = ux, dist = first ? 26 : 20;
      const nx = ux * 0.82 + sxv * side * 0.35, nz = uz * 0.82 + szv * side * 0.35, nl = Math.hypot(nx, nz) || 1;
      const ddx = (nx / nl) * dist, ddz = (nz / nl) * dist;
      const q = landAt(rt, { x: clamp(T.b.at.x + ddx), z: clamp(T.b.at.z + ddz) }, T.b.at);
      T.b.at = q; T.b.g.anchor = { x: q.x, z: q.z - 2 };
      if (T.b.mg) T.b.mg.anchor = { x: clamp(T.b.mg.anchor.x + ddx), z: clamp(T.b.mg.anchor.z + ddz) };
      if (first) {
        rt.marker('taisho_b', unitPos(B), `${T.b.name}（逃げる）`, { red: true });
        rt.banner(`${T.b.name}、御退きあれ！`, '馬廻りを連れて奥へ。備がしんがりを務める');
        rt.bark('敵の大将が、供を連れて逃げていく！', true);
      } else once(T, rt, 'bFall', 10, () => rt.bark('敵の大将が、なお奥へと逃げていく', true));
    }
    if (T.b.fleeing && (!mgAlive || (!B.alive))) { rt.unmark('taisho_b'); T.b.fleeing = false; }
    honjinRally(rt, T, B, P, ratio);
  }
  const A = T.a && T.a.state === 'on' && T.a.u;
  if (!A || !A.alive) return;
  // 旗本が厚い間は硬く、崩れれば手傷を負いやすくなる（敵の総大将と同じ仕組み）
  if (T.a.g) {
    const guardAlive = T.a.g.units.filter((o) => o.alive && o !== A).length;
    const base = T.a.g.guardBase || 1.5;
    T.a.g.defMult = guardAlive >= 6 ? base * 2.0 : guardAlive >= 3 ? base * 1.2 : base * 0.7;
  }
  // 深手（討たれない殿が退く所まで削られた）は負けではない：旗本の陰に退いて、それ以上は狙われない。負けは討たれた時だけ
  if (T.a.woundLose && A.woundOut) onceN(T, rt, 'aWound', 60, 2, () => rt.say('使番', '殿が手負いじゃ、守れ！', 3));
  raidTick(rt, T, A);
  // 殿が危ない：手傷・敵が迫る
  const hurt = A.hp < A.maxHp * 0.5;
  const R = T.raid && T.raid.count > 0 && !T.raid.routed ? T.raid : null;
  const near = R && d2(R.center(), A.pos) < 45;
  if (near || hurt) {
    if (!T.aMark) { T.aMark = true; rt.marker('taisho_a', unitPos(A), `殿（${T.a.name}）`, {}); }
    if (near) once(T, rt, 'aNear', 20, () => rt.say('使番', `殿の本陣に敵が迫っておる！　戻って殿をお守りせよ`, 3));
    if (hurt) once(T, rt, 'aHurt', 25, () => rt.bark(`殿が手傷を負われた！　急げ`, true));
  } else if (T.aMark && !R) { T.aMark = false; rt.unmark('taisho_a'); }
}

// 敵の大将の頭が、時々殿を狙う一隊を送る（難しさで間と数が変わる）
function raidTick(rt, T, A) {
  const cfg = RAID[rt.G.difficulty] || RAID.normal;
  if (T.nextRaid === null) T.nextRaid = Math.max(60, rt.t + cfg.every * 0.7);
  const R = T.raid;
  if (R) {
    if (!R.count || R.routed) {
      T.raid = null; rt.unmark('taisho_raid'); rt.objDone('taisho_a');
      if (T.raidKills > 0) rt.award((t) => t.side.push('殿を狙う敵を退けた'), '殿を狙う敵を退けた');
      else rt.bark('殿を狙った敵は退いた');
      rt.after(8, () => { if (!T.raid) rt.objRemove('taisho_a'); });
      T.nextRaid = rt.t + cfg.every;
    }
    return;
  }
  if (rt.def.noTaishoRaid || T.raids >= cfg.max || rt.t < T.nextRaid || rt.holdLeft > 0 || rt.choice) return;
  // 野戦（城攻め・籠城でない）では、一つおきに小さな一隊でなく、騎馬を先にした本気の突撃にする
  // 城攻め・籠城は def.noWake か、頑丈な城門・柵（敵方の構え）が立っている事で見分ける
  const isField = !rt.def.noWake && !rt.def.mapCastle && !(rt.army.structs && rt.army.structs.some((s) => s.team === 1 && s.maxHp >= 800));
  const big = isField && T.raids > 0 && T.raids % 2 === 1;
  const src = big ? (FIELD_BIG[rt.G.difficulty] || FIELD_BIG.normal) : cfg;
  // 本物の兵が多い時は、隊を小さくする（全体で 248 まで）。それでも四人に足りなければ、いま寄せている敵の隊を一つ殿へ向ける
  let room = 248 - real(rt);
  const list = [];
  for (const x of src.list) { const n = Math.min(x.n, room); if (n > 0) { list.push({ ...x, n }); room -= n; } }
  if (list.reduce((a, x) => a + x.n, 0) < 4) {
    let best = null, bd = 150;
    for (const g of rt.army.groups) {
      if (g.team !== 1 || g.routed || g.count < 4 || g.focus || g.guard || g === (T.b && T.b.g) || !(g.order === 'attack' || g.ai === true)) continue;
      if (g.units.some((u) => u.alive && u.name)) continue;
      const d = d2(g.center(), A.pos);
      if (d < bd && d > 30) { bd = d; best = g; }
    }
    if (!best) { T.nextRaid = rt.t + 20; return; }
    best.focus = A; best.seekRange = Math.max(best.seekRange || 0, 30);
    return launch(rt, T, best, big);
  }
  // 敵の側から、殿の横へ回り込む所に出す（殿から 95m ほど。見える所なら guardSpawn がずらす）
  const E = (T.b && T.b.u && T.b.u.alive && T.b.u.pos) || centroid(rt, 1);
  if (!E) { T.nextRaid = rt.t + 20; return; }
  let dx = E.x - A.pos.x, dz = E.z - A.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  const s0 = Math.random() < 0.5 ? 1 : -1;
  let at = null;
  for (const s of [s0, -s0]) {
    const q = { x: A.pos.x + dx * 90 - dz * 40 * s, z: A.pos.z + dz * 90 + dx * 40 * s };
    if (Math.abs(q.x) < LIM && Math.abs(q.z) < LIM && !(rt.world.inWaterAt && rt.world.inWaterAt(q.x, q.z))) { at = q; break; }
  }
  if (!at) { T.nextRaid = rt.t + 30; return; }
  const faction = (T.b && T.b.g && T.b.g.faction) || commonFaction(rt, 1, 'saito');
  const g = enemyGroup(rt, { faction, name: big ? '殿を狙う突撃' : '殿を狙う敵', anchor: at, facing: Math.atan2(A.pos.x - at.x, A.pos.z - at.z), order: 'attack', aggro: big ? 16 : 10, seekRange: big ? 40 : 30, morale: 90, noAI: true }, list);
  g.focus = A;
  launch(rt, T, g, big);
}
function launch(rt, T, g, big) {
  T.raid = g; T.raids++; T.raidKills = 0;
  if (big) {
    // 使番の急報・見出し・遠くの鬨の声・味方の本陣の印が赤く（位置の印を出すのは味方の本陣＝殿の所だけ）
    rt.banner('殿の本陣へ、本気の突撃！', '前線を割って、騎馬が奥へ駆け抜ける');
    rt.say('使番', '一大事！　敵が前線を破り、殿の本陣へ向かっており申す！', 3.5);
    sfx('far', 0.9);
    const A = T.a && T.a.u;
    if (A) { T.aMark = true; rt.marker('taisho_a', unitPos(A), `殿（${T.a.name}）`, { red: true }); }
  } else {
    rt.bark('敵の一隊が殿の本陣へ向かった！', true);
  }
  rt.obj('taisho_a', `殿（${T.a.name}）を守れ`, 'side');
  rt.marker('taisho_raid', centerOf(g), '殿を狙う敵', { red: true, group: g });
}

// 本陣が攻められ、厚みが薄くなってきたら、近くの空いた隊が駆け戻って守る（後詰め）
function honjinRally(rt, T, B, P, ratio) {
  if (ratio >= 0.55 || d2(B.pos, P) > 55 || (T.rallyT ?? -99) + 14 > rt.t) return;
  let n = 0;
  for (const g of rt.army.groups) {
    if (n >= 2) break;
    if (g.team !== 1 || g.routed || !g.count || g.guard || g.focus || g.reserve || g.noAI || g.isPlayerSquad) continue;
    if ((T.b.guards || []).includes(g) || g.order !== 'attack') continue;
    const c = g.center();
    if (d2(c, B.pos) > 140) continue;
    g.focus = rt.player.u; g.seekRange = Math.max(g.seekRange || 0, 40);
    n++;
  }
  if (n > 0) { T.rallyT = rt.t; once(T, rt, 'bRally', 20, () => rt.bark('近くの敵が、本陣を守ろうと駆け戻る', true)); }
  else T.rallyT = rt.t - 8;   // 呼べる隊が無ければ、また少し後で探す
}

// ---------------- 討たれた時 ----------------
export function taishoKill(rt, v, k) {
  const T = rt.taisho;
  if (!T || !v) return;
  if (T.raid && v.group === T.raid && k && (k.isPlayer || k.isSub || k.isTomo)) T.raidKills++;
  if (T.b && v === T.b.u) {
    if (T.b.state === 'dead') return;   // 同じ大将の二度目の kill（倒れ際の追い討ち）で、手柄・士気の下げ・勝ちを重ねない
    if (!k || k.team !== 0) return;   // 筋書きが消した（最後の場面など）時は、定義に任せる
    T.b.state = 'dead';
    const byMe = k.isPlayer || k.isSub || k.isTomo;
    // 大将が前線へ自ら出てくる戦（use：定義が出す本人を使う）では、討っても戦は終わらない。大手柄と敵の気落ちだけ（kaito 9/30）
    if (T.b.use && !T.b.defOwned) { fieldTaken(rt, T, byMe); return; }
    const win = () => { if (!rt.over) enemyTaken(rt, T, byMe); };
    if (T.b.defOwned) rt.after(3, win); else win();
  } else if (T.a && v === T.a.u && T.a.state !== 'dead') { T.a.state = 'dead'; tonoLost(rt, T, false); }
}
function enemyTaken(rt, T, byMe) {
  const n = T.b.name;
  rt.unmark('taisho_b');
  rt.after(0.6, () => rt.banner(`敵の総大将 ${n}、討ち取ったり`, '大将を失った敵は総崩れ。この戦は勝ちじゃ'));
  rt.tracker.main = true;
  rt.award((t) => { t.main = true; if (byMe) t.special = { label: `敵の総大将 ${n}を討ち取った`, pts: 60 }; }, byMe ? `大手柄：${n}を討ち取った` : `味方が${n}を討ち取った`);
  for (const g of rt.army.groups) if (g.team !== 0 && !g.routed && g.count > 0 && !g.civ) { g.noRout = false; g.morale = 0; }
  rt.player.u.invuln = true;
  rt.finish({ taisho: 'b' }, 9);
}
// 束5：fate='capture'。馬廻が尽きた後、囲んで（9m 内）討たずに生け捕る
function captureTaken(rt, T) {
  const n = T.b.name;
  rt.unmark('taisho_b');
  logEvent(rt, 'taishoCapture', { team: 0, who: n });
  rt.after(0.6, () => rt.banner(`敵の総大将 ${n}、生け捕ったり`, '大将を捕らえた敵は総崩れ。この戦は勝ちじゃ'));
  rt.tracker.main = true;
  rt.award((t) => { t.main = true; t.special = { label: `敵の総大将 ${n}を生け捕った`, pts: 65 }; }, `大手柄：${n}を生け捕った`);
  for (const g of rt.army.groups) if (g.team !== 0 && !g.routed && g.count > 0 && !g.civ) { g.noRout = false; g.morale = 0; }
  rt.player.u.invuln = true;
  rt.finish({ taisho: 'b', capture: true }, 9);
}
// 束5：fate='abandon'。本陣の厚みが尽きかけたら、大将は本陣を捨てて退く（討ち取り即勝ちにはしない。戦は別の形で続く）
function abandonHonjin(rt, T) {
  const n = T.b.name;
  rt.unmark('taisho_b'); T.b.fleeing = false;
  logEvent(rt, 'taishoAbandon', { team: 1, who: n });
  rt.banner(`${n}、本陣を捨てて退く`, '大将は逃げ延びたが、戦はまだ続く');
  if (T.b.u) T.b.u.invuln = true;
  for (const gg of (T.b.guards || [])) {
    gg.morale = Math.max(0, (gg.morale ?? 100) - 20);
    gg.order = 'move'; gg.dest = { x: (T.b.at && T.b.at.x) || 0, z: ((T.b.at && T.b.at.z) || 0) + 40 };
  }
}
function fieldTaken(rt, T, byMe) {
  const n = T.b.name;
  // 逃げる大将の印（taisho_b）は毎コマの見張りが生きている間しか外さないので、ここで外す（討たれた所に印が残らないように）
  rt.unmark('taisho_b'); T.b.fleeing = false;
  rt.after(0.6, () => rt.banner(`敵将 ${n}、討ち取ったり`, '敵は大将を失って揺らいでいる。戦はまだ続く'));
  rt.award((t) => { if (byMe) t.special = { label: `敵将 ${n}を討ち取った`, pts: 60 }; }, byMe ? `大手柄：${n}を討ち取った` : `味方が${n}を討ち取った`);
  for (const g of rt.army.groups) if (g.team !== 0 && !g.routed && g.count > 0 && !g.civ) g.morale = Math.max(0, (g.morale ?? 100) - 25);
}
function tonoLost(rt, T, wounded) {
  if (rt.over) return;
  const n = T.a.name;
  rt.unmark('taisho_a'); rt.unmark('taisho_raid');
  rt.objFail('taisho_a');
  rt.banner(wounded ? `殿（${n}）、深手を負われた` : `殿（${n}）、討たれる`, '殿を失っては戦えぬ。この戦は負けじゃ');
  rt.tracker.main = false;
  rt.player.u.invuln = true;
  rt.finish({ taisho: 'a' }, 8);
}
