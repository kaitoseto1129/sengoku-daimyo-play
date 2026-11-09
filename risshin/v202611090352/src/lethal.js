// 命懸けの戦場（docs/lethal_field_spec_1108.md の 1〜7・11〜14・19〜22・24・25）の全戦共通の一か所。
//   「戦場では誰でも死ぬ」。敵の体力や数でなく、流れ弾・制圧・恐怖・孤立・突然の負傷と討死で怖さを作る。
//   字は足さない（Simple）。見た目・音・兵の動きだけで伝える。毎コマ入れ物を作らない。
//   使い方は docs/lethal_howto.md。戦の定義の lethal: true で入る（天王寺・岡山と姉川は既定で入る）。
//   史実で死ぬ時が決まった者・筋書きが生かす者（invuln・mustLive・総大将・名のある実在の将）には触らない。
import { sfx, hush } from './audio.js';
import { headUp } from './army_morale.js';
import { localPoint } from './army_local_way.js';

// 手本は織田の最初の四戦（稲生・桶狭間・森部・墨俣。kaito 11/8）。天王寺・岡山と姉川も入る。
const ON = new Set(['inou', 'okehazama', 'moribe', 'sunomata', 'k15_tennoji_okayama', 'anegawa']);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

export function lethalOn(def) {
  if (!def || def.town || def.dojo || def.duel || def.mapCastle) return false;
  return def.lethal === true || def.lethal !== false && ON.has(def.key || def.id);
}

// 戦の始め（battle.js が Army を作った後）に一度。戦の定義の lethal の細かい値も読む。
export function lethalSetup(rt) {
  const army = rt.army;
  if (!army) return;
  army.lethal = null;
  if (!lethalOn(rt.def)) { if (rt.lethal?.pressureAdd) rt.lethal = null; return; }
  const o = typeof rt.def.lethal === 'object' ? rt.def.lethal : {};
  army.lethal = {
    rt, step: 0, slow: 0, slice: 0, events: 0, nextEventAt: o.firstAt ?? 70, gap: o.gap ?? 45,
    max: o.max ?? 5, namedOk: new Set(o.named || []), pFear: 0, pSupp: 0, iso: 0, isoN: 0,
    heartAt: 0, hushAt: -99, hushGap: o.hushGap ?? 90, allyDeathAt: -99, says: Object.create(null),
    pant: 0, stats: { nearMiss: 0, wound: 0, death: 0, blow: 0, back: 0, rout: 0, hush: 0 },
  };
  // 深手の兵が這う・肩を貸される・運ばれる（army_combat の woundAid）。戦が自分で決めていればそのまま。
  if (rt.world?.def && rt.world.def.woundAid === undefined) rt.world.def.woundAid = true;
  // 倒れても数秒は戦場が動き続けてから戻る（二十四）。戦が決めた長さは変えない。
  if (rt.def.downDelay === undefined) army.lethal.downDelay = 7;
  army.lethalIso = 0;
  // 係B（lethal_story.js）の戦場の圧力へ、本人と味方の組の制圧を足す口（最大 20）
  rt.lethal = { pressureAdd: () => pressureAdd(army) };
}
function pressureAdd(army) {
  const L = army.lethal, P = army.playerUnit;
  if (!L || !P) return 0;
  let s = 0, n = 0;
  for (const g of army.groups) if (g.team === P.team && !g.civ && g.count > 0) { s += g.supp || 0; n++; }
  return Math.min(20, L.pSupp * 0.12 + (n ? s / n : 0) * 0.25);
}

// 史実・筋書きの者と、物・民は外す。名のある者は戦が架空と認めた者（u.fictional・lethal.named）だけ。
function shielded(L, u) {
  return !u || u.isPlayer || u.invuln || u.keepInvuln || u.mustLive || u.onWound || u.isTaisho || u.oTaisho || u.isLord ||
    u.isCourier || u.civ || u.kerai || u.isTomo || u.campProtected || u.noTarget || u.isStruct || u.histDeath ||
    u.type === 'dummy' || u.type === 'porter' || u.farSim || u.gone || u.dying ||
    !!(u.name && !u.isSub && !u.fictional && !L.namedOk.has(u.name));
}
// 組頭・旗持・侍・配下（名の付いた組の者）
function officer(u) {
  return u.ashiTaisho || u.stdHeld || u.banner || u === u.group?.leader || u.type === 'samurai' || u.isSub && !!u.name;
}
function title(u) {
  if (u.stdHeld || u.banner) return '旗が！';
  if (u.isSub && u.name) return u.name + '！';
  if (u.name) return u.name + '様！';
  return u.ashiTaisho || u === u.group?.leader ? '組頭！' : 'しっかりしろ！';
}
function shout(L, text, sec = 2) {
  const rt = L.rt, t = rt.t || 0;
  if ((L.says[text] ?? -99) + 8 > t) return;   // 同じ声は八秒に一度まで
  L.says[text] = t;
  rt.say?.('足軽', text, sec);
}

// ── ニアミス（十一・十二）：当たらなくても怖い。弾・矢がそばを抜けた者に制圧が乗る。
const _nm = { L: null, army: null, x: 0, z: 0, ax: 0, az: 0, bx: 0, bz: 0, r: 0, team: 0, add: 0, victim: null, seg: false };
function nearVisit(o, s) {
  if (o === s.victim || !o.alive || o.team === s.team || o.isStruct || o.type === 'dummy' || o.farSim) return;
  let d;
  if (s.seg) {
    const vx = s.bx - s.ax, vz = s.bz - s.az, l2 = vx * vx + vz * vz || 1;
    const q = clamp(((o.pos.x - s.ax) * vx + (o.pos.z - s.az) * vz) / l2, 0, 1);
    d = Math.hypot(s.ax + vx * q - o.pos.x, s.az + vz * q - o.pos.z);
  } else d = Math.hypot(o.pos.x - s.x, o.pos.z - s.z);
  if (d > s.r) return;
  const k = 1 - d / s.r * 0.6;
  const L = s.L, army = s.army;
  if (o.isPlayer) {
    L.pSupp = Math.min(100, L.pSupp + s.add * 1.5 * k);
    L.stats.nearMiss++;
    // 強いニアミス：ごく小さな揺れ（動きを減らす設定では揺らさない）
    if (d < 1.4 && L.rt.player?.addShake) L.rt.player.addShake(0.035);
    return;
  }
  o.supp = Math.min(100, (o.supp || 0) + s.add * k);
  if (o.group) o.group.supp = Math.min(100, (o.group.supp || 0) + s.add * 0.12);
  // 身をすくめる（出始めた一撃は止めない）
  if (d < 1.6 && !o.atk && !o.swing && !o.mounted && !(o.flinchT > 0)) o.flinchT = 0.3;
  if (o.group && o.group.integrity !== undefined && s.add >= 8) o.group.integrity = Math.max(0, o.group.integrity - 0.15);
  if (army) army._lethalNM = (army._lethalNM || 0) + 1;
}
// 鉄砲の玉の筋（最後の三十歩）。victim は当たった者（外す）。
export function lethalBulletPath(army, ax, az, bx, bz, team, victim) {
  const L = army.lethal;
  if (!L) return;
  const len = Math.hypot(bx - ax, bz - az);
  if (len > 30) { const k = (len - 30) / len; ax += (bx - ax) * k; az += (bz - az) * k; }
  const s = _nm;
  s.L = L; s.army = army; s.ax = ax; s.az = az; s.bx = bx; s.bz = bz; s.r = 2.4; s.team = team; s.add = 10; s.victim = victim; s.seg = true;
  army.forNear((ax + bx) / 2, (az + bz) / 2, Math.min(30, len) / 2 + s.r, nearVisit, s);
  s.victim = null; s.L = null; s.army = null;
}
// 矢・投石などが点に落ちた。r は散らばる広さ。
export function lethalNearMiss(army, x, z, team, kind = 'arrow', r = 3) {
  const L = army.lethal;
  if (!L) return;
  const s = _nm;
  s.L = L; s.army = army; s.x = x; s.z = z; s.r = r; s.team = team; s.add = kind === 'gun' ? 10 : kind === 'volley' ? 7 : 4; s.victim = null; s.seg = false;
  army.forNear(x, z, r, nearVisit, s);
  s.L = null; s.army = null;
}

// ── 武器ごとの致命傷（五・二十二）：体力を削り切らなくても、低い頻度で一撃が命を奪う。
//   army_combat の damage が傷を渡す直前に呼ぶ。本人の傷は既存の上限（playerHitLimit）に任せる。
export function lethalBlow(army, t, amount, src, kind, z, from) {
  const L = army.lethal;
  if (!L || t.isPlayer || !(amount > 0) || amount >= t.hp || shielded(L, t)) return amount;
  const flesh = z && z.res !== 'armor';
  const d = src?.pos ? Math.hypot(src.pos.x - t.pos.x, src.pos.z - t.pos.z) : 99;
  let p = 0;
  if (kind === 'gun') p = flesh && d < 15 ? 0.3 : 0;                                         // 近い鉄砲
  else if (kind === 'charge') p = 0.1;                                                        // 騎馬に巻き込まれる
  else if ((kind === 'thrust' || kind === 'tsuki') && flesh && z.part === 'torso') p = 0.07;  // 胴への強い突き
  else if (src?.wpnKind === 'sword' && flesh && (z.part === 'head' || z.part === 'neck')) p = 0.1;
  else if (kind === 'arrow' && flesh && (z.part === 'head' || z.part === 'neck')) p = 0.06;
  if (t.fleeing && from === 'back') p += 0.12;                                                // 敗走中に追いつかれる
  if (!(p > 0) || Math.random() >= p) return amount;
  L.stats.blow++;
  return t.hp + 0.01;
}

// ── 討死の知らせ（army_combat の kill から）：周りの制圧と恐怖、本人の恐怖、隊列維持度。
export function lethalDeath(army, t) {
  const L = army.lethal;
  if (!L || t.type === 'dummy' || t.isStruct) return;
  const P = army.playerUnit;
  if (P?.alive && t.team === P.team && Math.abs(t.pos.x - P.pos.x) < 10 && Math.abs(t.pos.z - P.pos.z) < 10) {
    L.pSupp = Math.min(100, L.pSupp + 12); L.allyDeathAt = army.time;
  }
  army.forNear(t.pos.x, t.pos.z, 8, (o) => {
    if (o.alive && o.team === t.team && !o.isPlayer && !o.isStruct) o.supp = Math.min(100, (o.supp || 0) + 8);
  });
  const g = t.group;
  if (g && g.integrity !== undefined && (t === g.leader || t.stdHeld || t.banner)) g.integrity = Math.max(0, g.integrity - 20);
}

// ── 毎コマ（units.js の update から）。重い見回しは間引く。
export function lethalTick(army, dt) {
  const L = army.lethal;
  if (!L || !(dt > 0)) return;
  const rt = L.rt, now = army.time, P = army.playerUnit;
  L.step += dt; L.slow += dt;
  // 制圧は時間で引く（毎コマ、数を引くだけ）
  L.pSupp = Math.max(0, L.pSupp - dt * 9);
  if (L.step < 0.25) return;
  const st = L.step; L.step = 0;
  for (const g of army.groups) if (g.supp > 0) g.supp = Math.max(0, g.supp - st * 6);
  playerFear(army, L, st);
  // 兵ごとの恐怖：一度に四十人ずつ順に見る（全員を毎コマ見ない）
  const U = army.units, n = U.length;
  if (n) {
    const per = Math.min(n, 40);
    for (let k = 0; k < per; k++) {
      L.slice = (L.slice + 1) % n;
      const u = U[L.slice];
      if (u) soldierFear(army, L, u, now);
    }
  }
  if (L.slow < 1) return;
  L.slow = 0;
  isolation(army, L, P);
  if (!rt.over && P?.alive) { suddenFall(army, L, P, now); bigAttackHush(army, L, P, now); }
}

// 十三・十二：兵の恐怖（u.fear 0〜100）と制圧（u.supp 0〜100）。既存の士気（fright・moraleThink）へつなぐ。
function soldierFear(army, L, u, now) {
  if (!u.alive || u.isPlayer || u.isStruct || u.type === 'dummy' || u.type === 'porter' || u.farSim || !u.group || u.group.civ) return;
  const g = u.group;
  if (u.supp > 0) u.supp = Math.max(0, u.supp - 2.5);   // 一人を見るのはおよそ二秒〜数秒に一度
  const supp = Math.max(u.supp || 0, (g.supp || 0) * 0.6);
  let fear = (u.fright || 0) * 1.4 + supp * 0.45 + (g.morale < 50 ? (50 - g.morale) * 0.8 : 0);
  if (g.integrity !== undefined) fear += (100 - g.integrity) * 0.15;
  const head = g.leader;
  if (head && head !== u && head.alive && !head.fleeing && Math.abs(head.pos.x - u.pos.x) < 10 && Math.abs(head.pos.z - u.pos.z) < 10) fear -= 12;
  u.fear = clamp(fear, 0, 100);
  // 低い姿勢（制圧 30）：立ち止まった鉄砲・弓だけ膝を折る。動けば army_anim が戻す。
  if (supp >= 30 && !u._crouch && (u.type === 'gun' || u.type === 'bow') && !u.target && !(u.moving > 0.15)) { u._crouch = true; u.lethalCrouch = true; }
  else if (u.lethalCrouch && supp < 15) { if (!u._nest) u._crouch = false; u.lethalCrouch = false; }
  if (u.fleeing || u.noTarget || u.woundOut || u.rearWound || u.downed || u.climb || u.perch || u.cover || u.escort ||
      u.atk || u.swing || u.name || u.type === 'busho' || u === g.leader || g.order === 'retreat' || g.order === 'flee') return;
  // 30〜50：周りを見る
  if (u.fear >= 30 && u.fear < 50 && !(u.lookAgainAt > now)) {
    u.lookFace = (g.facing ?? u.heading) + (u.id % 2 ? 1.2 : -1.2); u.lookUntil = now + 0.5; u.lookAgainAt = now + 5 + (u.id % 4);
  }
  // 50〜70・制圧 50：攻めが減る（考える間が延びる）
  if ((u.fear >= 50 || supp >= 50) && Math.random() < 0.3) u.aiT = Math.max(u.aiT || 0, 0.35);
  // 70〜85・制圧 70〜90：一歩下がる、前へ出るのを拒む
  //   目の前（三歩）の敵と打ち合う者は下がらない。全員が同時に引かないよう、一人十秒に一度まで。
  if ((u.fear >= 70 || supp >= 90) && !(u.lethalBackAt > now) && u.moralePoint &&
      !(u.target?.alive && u.target.pos && Math.abs(u.target.pos.x - u.pos.x) < 3 && Math.abs(u.target.pos.z - u.pos.z) < 3)) {
    u.lethalBackAt = now + (supp >= 90 ? 6 : 10);
    const h = g.facing ?? u.heading;
    localPoint(army, u, u.moralePoint, u.pos.x - Math.sin(h) * 2.5, u.pos.z - Math.cos(h) * 2.5);   // 壁・崖の向こうへは下がらない
    u.backFace = h; u.backUntil = now + 0.9; u.atk = null;
    L.stats.back++;
  }
  // 85〜：敗走へ。頭が生きて退く下知の無い組の者は一人で背を向けない（11/7 の決まり）
  if (u.fear >= 85 && !g.noRout && !headUp(g)) { u.fright = 45; L.stats.rout++; }
}

// 十四：本人の恐怖。ゲージは出さず、息・心拍・照準の揺れ・息の戻りだけ。操作は奪わない。
function playerFear(army, L, dt) {
  const rt = L.rt, P = army.playerUnit, pl = rt.player;
  if (!P?.alive) { L.pFear = 0; L.pant = 0; return; }
  const hp = P.hp / (P.maxHp || 1);
  const want = clamp(L.pSupp / 100 * 0.7 + L.iso * 0.18 + (army.time - L.allyDeathAt < 6 ? 0.2 : 0) + (hp < 0.5 ? (0.5 - hp) * 0.5 : 0), 0, 1);
  L.pFear += (want - L.pFear) * Math.min(1, dt * (want > L.pFear ? 2.5 : 0.5));
  L.pant = L.pFear > 0.25 ? (L.pFear - 0.25) * 0.8 : 0;
  // 心拍（深手の心拍は audio の ambience が鳴らすので重ねない）
  if (L.pFear > 0.45 && hp >= 0.3 && army.time >= L.heartAt) {
    L.heartAt = army.time + 1.15 - L.pFear * 0.45;
    sfx('heart', 0.07 + L.pFear * 0.1);
  }
  // 息の戻りが少し鈍る（連続のニアミス）
  if (pl && L.pFear > 0.5 && pl.sta < pl.maxSta) pl.sta = Math.max(0, pl.sta - dt * L.pFear * 1.2);
}
// 本人の恐怖で照準が少し揺れる（army_ranged の fireGun が掛ける）
export function lethalAimShake(army) { const L = army.lethal; return L ? 1 + L.pFear * 0.35 : 1; }
// battle.js の ambience の息（pant）へ足す量
export function lethalPant(army) { return army?.lethal ? army.lethal.pant : 0; }
export function lethalDownDelay(army) { return army?.lethal?.downDelay; }

// 二十・二十一：孤立判定。十二歩の内の味方 5 人以上＝安定／3〜4＝警戒／0〜2＝孤立。
//   孤立するほど敵が多方向から寄る（player_pressure が lethalIso を読む）。強制カメラにはしない。
const _iso = { team: 0, P: null, n: 0 };
function isoVisit(o, s) {
  if (o === s.P || !o.alive || o.team !== s.team || o.isStruct || o.fleeing || o.woundOut || o.dying || o.type === 'dummy' || o.civ) return;
  if (Math.abs(o.pos.y - s.P.pos.y) < 3 && Math.hypot(o.pos.x - s.P.pos.x, o.pos.z - s.P.pos.z) < 12) s.n++;
}
function isolation(army, L, P) {
  if (!P?.alive) { army.lethalIso = 0; return; }
  _iso.team = P.team; _iso.P = P; _iso.n = 0;
  army.forNear(P.pos.x, P.pos.z, 12, isoVisit, _iso);
  _iso.P = null;
  L.isoN = _iso.n;
  let foe = false;
  army.forNear(P.pos.x, P.pos.z, 25, (o) => { if (!foe && o.alive && o.team !== P.team && !o.isStruct && !o.fleeing && !o.civ) foe = true; });
  L.iso = !foe ? 0 : _iso.n >= 5 ? 0 : _iso.n >= 3 ? 1 : 2;
  army.lethalIso = L.iso;
}

// 二・三・四：組頭・旗持・侍・配下の突然の負傷・討死。危険度で確率を変え、遊ぶたびに違う小さな出来事に。
function danger(army, u, now) {
  const g = u.group;
  if (u.fleeing || g?.routed) return 0.06;                       // 敗走中：非常に高い
  let foes = 0, friends = 0;
  army.forNear(u.pos.x, u.pos.z, 7, (o) => { if (o.alive && !o.isStruct && !o.fleeing) { if (o.team === u.team) friends++; else foes++; } });
  if (foes >= 3 && foes > friends + 1) return 0.03;              // 包囲：高い
  if ((u.supp || 0) >= 45 || (g?.supp || 0) >= 45) return 0.03;  // 鉄砲の射線：高い
  if (foes > 0) return 0.012;                                    // 前線：低〜中
  return army.nearestEnemy?.(u, 40) ? 0.004 : 0;                 // 後方：極めて低い
}
function suddenFall(army, L, P, now) {
  const rt = L.rt;
  if (L.events >= L.max || (rt.t || 0) < L.nextEventAt) return;
  let pick = null, best = 0;
  army.forNear(P.pos.x, P.pos.z, 90, (u) => {
    if (!u.alive || u.isStruct || !u.group || shielded(L, u) || !officer(u)) return;
    const r = danger(army, u, now) * Math.random();
    if (r > best) { best = r; pick = u; }
  });
  // 三秒に一度の見回しで、選ばれた一人の危険度の分だけ起こる
  if (!pick || Math.random() > best * 8) return;
  let src = null, sd = 120;
  const ranged = Math.random() < 0.75;
  army.forNear(pick.pos.x, pick.pos.z, 100, (o) => {
    if (!o.alive || o.team === pick.team || o.isStruct || o.fleeing || o.civ) return;
    if (ranged && o.type !== 'gun' && o.type !== 'bow' && Math.random() < 0.7) return;
    const d = Math.hypot(o.pos.x - pick.pos.x, o.pos.z - pick.pos.z);
    if (d < sd) { sd = d; src = o; }
  });
  if (!src) return;
  L.events++; L.nextEventAt = (rt.t || 0) + L.gap * (0.7 + Math.random() * 0.6);
  // 死に方は英雄的とは限らない（四）：弾・矢・騎馬に巻き込まれ・乱戦で刺され・追いつかれる
  const kind = src.type === 'gun' ? 'gun' : src.type === 'bow' ? 'arrow' : src.mounted ? 'charge' : 'thrust';
  const die = Math.random() < (pick.fleeing ? 0.7 : 0.45);
  const g = pick.group;
  // 遠くの撃ち手の音（どこから来たか分からない一発）
  if (kind === 'gun' || kind === 'arrow') army.play(kind, src.pos, 1);
  if (die) {
    L.stats.death++;
    // 当たった姿と血は既存の傷で出し、救いの間（rescueDamage）を通さずに倒す（スローも札も出さない）
    army.damage(pick, Math.max(1, pick.maxHp * 0.1), src, { kind, noCover: true });
    if (pick.alive && !pick.dying) { pick.hp = 0; army.kill(pick, src); }
    if (g && g.integrity !== undefined && (pick === g.leader || pick.stdHeld)) g.integrity = Math.max(0, g.integrity - 15);
    if (g && pick === g.leader) army.depthCommanderLost?.(g, pick);
  } else {
    L.stats.wound++;
    army.damage(pick, Math.max(1, pick.hp - pick.maxHp * 0.2), src, { kind, noCover: true });
    // 深手：支えられて下がる（組の者の退きを使い回す）
    if (pick.alive && !pick.mounted && !pick.rearWound && !pick.woundOut) army.subFallBack?.(pick, src);
  }
  if (pick.team === P.team && Math.hypot(pick.pos.x - P.pos.x, pick.pos.z - P.pos.z) < 45) shout(L, title(pick));
}

// 二十五：大攻撃の直前の静寂。曲を沈め、風・息・鎧の音だけにして「来るぞ。」。
//   寄せる敵の大きな組（十二人以上）が初めて本人の七十歩の内へ入った時、九十秒に一度まで。戦は lethalHush を自分でも呼べる。
export function lethalHush(rt, sec = 4, line = '来るぞ。', who = '組頭') {
  const L = rt.army?.lethal;
  if (L) { L.hushAt = rt.t || 0; L.stats.hush++; }
  hush(sec);
  if (line) rt.say?.(who, line, 2.5);
}
function bigAttackHush(army, L, P, now) {
  const rt = L.rt;
  // 静けさは斬り合いの最中には作らない（十五歩の内に敵がいる時は待つ）
  if ((rt.t || 0) - L.hushAt < L.hushGap || (rt.t || 0) < 20 || army.nearestEnemy?.(P, 15)) return;
  for (const g of army.groups) {
    // 寄せて来る敵の大きな組が、初めて七十歩の内へ入った時（組ごとに一度）
    if (g._lethalHushed || g.team === P.team || g.civ || g.routed || g.hidden || g.order !== 'attack') continue;
    if ((g.count ?? g.units.length) < 12) continue;
    const c = g.center();
    if (Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 70) continue;
    g._lethalHushed = true;
    lethalHush(rt, 3.5);
    return;
  }
}

// 確かめの道具が読む（字は画面に出さない）
export function lethalStats(army) {
  const L = army?.lethal;
  return L ? { ...L.stats, nearMissAll: army._lethalNM || 0, events: L.events, pFear: +L.pFear.toFixed(2), iso: L.iso, isoN: L.isoN } : null;
}
