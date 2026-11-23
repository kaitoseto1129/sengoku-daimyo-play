// K587 ②（kaito 11/20 夜『オンラインPvP 残りの重要設計項目』2〜15・docs/online_extra_1120.md）：
//   武将 AI の性格6型・部隊の疲れ（0〜100）・鉄砲の弾薬。オンライン対戦の相手と、プレイヤーが動かしていない配下の3武将の動き。
//   この紙は戦の画面（three.js）に触らない「頭」だけ。隊（butai.js の Butai か、同じ形の物）の今を読んで、次の下知（intent）を返す。
//   決まり（要件書）：①プレイヤーの命令には原則従う。個性は命令を出していない間に出る ②全員同じ AI にしない（6型）
//   ③全部最初に突撃が弱くなる（疲れ・予備） ④弾は普通に撃てば15分足り、無駄に撃つと足りない。補給の地点で一部戻る（管理のゲームにしない）
//   ⑤数の上乗せでなく、動き方の差にする（性格で攻撃力は変えない）。
// 使い方（戦の側）：毎秒 aiStep(me, view, dt) を呼び、返った intent を butaiApply(B, intent) で隊へ。疲れと弾は fatigueStep・ammoStep。

// ---- 性格6型（要件書 2）。数は「どこまで前へ・どこで止まる・何を先に見る」の重みだけ ----
//   push：命令の無い時に前へ出る強さ（0〜1）／chase：崩れた敵を追う距離（m）／holdLine：持ち場を離れない強さ
//   rescue：崩れかけた味方を助けに行く重み／flank：横を取りに回る重み／restAt：これより疲れたら下がって休む（0〜100）
//   obey：命令を守る強さ（1＝命令の中で個性を出さない）／hiGround：高所・地形を先に取る重み／bait：誘いと反転
export const PERSONA = {
  AGGRESSIVE: { label: '積極攻撃', push: 0.9, chase: 140, holdLine: 0.1, rescue: 0.3, flank: 0.2, restAt: 85, obey: 0.75, hiGround: 0.1, bait: 0 },
  CAUTIOUS: { label: '慎重', push: 0.25, chase: 30, holdLine: 0.6, rescue: 0.6, flank: 0.2, restAt: 55, obey: 0.9, hiGround: 0.4, bait: 0 },
  DEFENSIVE: { label: '防御', push: 0.05, chase: 0, holdLine: 1.0, rescue: 0.7, flank: 0, restAt: 65, obey: 0.95, hiGround: 0.5, bait: 0 },
  MOBILE: { label: '機動', push: 0.6, chase: 110, holdLine: 0.15, rescue: 0.4, flank: 0.9, restAt: 70, obey: 0.8, hiGround: 0.2, bait: 0.3 },
  TACTICAL: { label: '戦術', push: 0.45, chase: 45, holdLine: 0.4, rescue: 0.6, flank: 0.7, restAt: 60, obey: 0.85, hiGround: 0.9, bait: 0.6 },
  LOYAL: { label: '命令に忠実', push: 0.3, chase: 25, holdLine: 0.8, rescue: 0.5, flank: 0.1, restAt: 70, obey: 1.0, hiGround: 0.3, bait: 0 },
};
export const PERSONA_KEYS = Object.keys(PERSONA);

// 初期6家の24人（docs/online_final_1120.md 3〜13）と要件書の例。二つ目は混ぜる型（重み3:1）
export const GENERAL_PERSONA = {
  '織田信長': ['TACTICAL', 'AGGRESSIVE'], '柴田勝家': ['AGGRESSIVE'], '木下藤吉郎': ['MOBILE', 'TACTICAL'], '前田利家': ['AGGRESSIVE', 'LOYAL'],
  '武田信玄': ['TACTICAL', 'DEFENSIVE'], '山県昌景': ['AGGRESSIVE', 'MOBILE'], '馬場信春': ['DEFENSIVE', 'LOYAL'], '内藤昌豊': ['LOYAL', 'DEFENSIVE'],
  '上杉謙信': ['AGGRESSIVE', 'TACTICAL'], '柿崎景家': ['AGGRESSIVE'], '斎藤朝信': ['CAUTIOUS', 'LOYAL'], '甘粕景持': ['DEFENSIVE', 'LOYAL'],
  '徳川家康': ['CAUTIOUS', 'TACTICAL'], '本多忠勝': ['AGGRESSIVE', 'LOYAL'], '酒井忠次': ['TACTICAL', 'CAUTIOUS'], '榊原康政': ['MOBILE', 'AGGRESSIVE'],
  '毛利元就': ['TACTICAL', 'CAUTIOUS'], '吉川元春': ['AGGRESSIVE', 'MOBILE'], '小早川隆景': ['TACTICAL', 'CAUTIOUS'], '毛利隆元': ['LOYAL', 'CAUTIOUS'],
  '島津義久': ['CAUTIOUS', 'TACTICAL'], '島津義弘': ['AGGRESSIVE', 'DEFENSIVE'], '島津家久': ['TACTICAL', 'MOBILE'], '島津歳久': ['CAUTIOUS', 'LOYAL'],
  '黒田官兵衛': ['TACTICAL'],
};
// 武将の性格（名が表に無ければ型の名か、既定の LOYAL）。二つの型は 3:1 で混ぜる
export function personaOf(nameOrKey) {
  const k = PERSONA[nameOrKey] ? [nameOrKey] : GENERAL_PERSONA[nameOrKey] || ['LOYAL'];
  const a = PERSONA[k[0]], b = k[1] ? PERSONA[k[1]] : null;
  if (!b) return { key: k[0], ...a };
  const o = { key: k[0] + '+' + k[1], label: a.label + '・' + b.label };
  for (const f of Object.keys(a)) if (typeof a[f] === 'number') o[f] = a[f] * 0.75 + b[f] * 0.25;
  return o;
}

// ---- 家ごとの戦い方と難易度（K603 1〜10・11/21 iMac k592）：諸大名戦（NPC）の相手の側だけに掛ける ----
//   決まり：名前だけ替えるのは禁止（同じ AI にしない）。難易度で HP・兵力・攻撃力は増やさない（ずる無し）。替えるのは考える速さ・見る広さ・予備と側面の使い方だけ。
//   家の型は性格の重みへ足す（+）。数は『前へ出る・待つ・回る・追う・休む』の重みだけで、強さの数は一つも触らない
export const CLAN_STYLE = {
  oda: { label: '鉄砲・攻勢・展開の速さ', push: 0.15, flank: 0.1, hiGround: 0.25, restAt: 5, gunHold: 0.25 },
  takeda: { label: '騎馬・高い士気・強い中央・予備の投入', push: 0.2, chase: 40, rescue: 0.2, reserveAt: 72, charge: 1, cavWait: 1 },
  uesugi: { label: '連続の攻め・機動・波状攻撃', push: 0.3, chase: 30, restAt: -15, flank: 0.1, wave: 1 },
  tokugawa: { label: '守り・戦線維持・予備・粘り', push: -0.2, holdLine: 0.35, rescue: 0.25, reserveAt: 48 },
  mori: { label: '弓・鉄砲・伏兵・側面', push: -0.1, flank: 0.35, bait: 0.3, hiGround: 0.3, gunHold: 0.2 },
  shimazu: { label: '釣り野伏・後退・反転・追撃', bait: 0.5, chase: 70, flank: 0.1 },
  date: { label: '騎馬・鉄砲・機動戦', push: 0.1, flank: 0.3, chase: 40, charge: 1, cavWait: 1 },
  hojo: { label: '守り・持久', push: -0.15, holdLine: 0.3, rescue: 0.2, reserveAt: 52 },
  toyotomi: { label: '大軍の押し・包囲', push: 0.15, flank: 0.2, rescue: 0.1 },
};
//   react＝考え直す間（秒）・see＝敵の隊が見える距離（霧に弱い／強い）・flankK・rescueK＝側面と予備の使い方の倍・counter＝兵種の相性を見て的を選ぶ
export const NPC_LEVEL = {
  // 11/21 iMac k592-net（長の頼み・K603 8・78「初級は初心者が勝てる」）：初級の織田・武田に、本人を守り本人の隊を AI に任せた通しでも武田に初級・中級とも負けた。
  //   HP・兵力・攻撃は触らず、初級だけ『考えが遅い・見えない・回らない・助けない・前へ出たがり疲れても休まない・予備を持たず全隊で当たる・戦法を使わない』に
  shokyu: { label: '初級', react: 4.5, see: 80, flankK: 0.2, rescueK: 0.3, add: { push: 0.25, restAt: 15 }, noReserve: true, noTactic: true, clanK: 0.3 },   // clanK：家の型（武田の救援・予備の早さ・突撃など）も三割だけ
  chukyu: { label: '中級', react: 1.2, see: 160, flankK: 1, rescueK: 1, add: {}, power: { pow: 1, guard: 1, morale: 0, troops: 1, lordHp: 2, lordGuard: 0.8 } },
  // K627 ⑥（kaito 11/22「修羅が修羅でない」）：上級・修羅は考えと見る広さを上げ、囲む（encircle＝味方と当たる敵の背と横へ回る）と、強さ（power＝押す力・守り・士気。match.js が相手の備に掛ける）を足す
  // K629 ⑨（kaito 11/22「修羅：敵がどんどん死ぬ＝弱い。無敵ではなく、敵の攻めを強く・兵数を多く」）：攻め（pow）と兵の数（troops＝名目の数の倍）を上げ、守り（guard）は上げすぎない。
  //   ⑪（「撃ち取りが簡単すぎる」）：敵将の命（lordHp＝倍）と守り（lordGuard＝受ける傷の割合）。中級も少し
  jokyu: { label: '上級', react: 0.6, see: 260, flankK: 1.6, rescueK: 1.3, add: { push: 0.1, hiGround: 0.2, rescue: 0.15, flank: 0.2 }, counter: true, encircle: true, power: { pow: 1.6, guard: 1.2, morale: 10, troops: 1.3, lordHp: 3, lordGuard: 0.6 } },
  shura: { label: '修羅', react: 0.3, see: 400, flankK: 2.5, rescueK: 1.6, add: { push: 0.25, hiGround: 0.3, rescue: 0.2, flank: 0.4, restAt: -5 }, counter: true, encircle: true, volley: true, power: { pow: 2.4, guard: 1.35, morale: 20, troops: 1.6, lordHp: 4, lordGuard: 0.5 } },
};
/** 性格に家の型と難易度を重ねる（強さの数は触らない） */
export function clanPersona(base, house, level, ai = null) {
  // codex の npc_clans.js の家の重み（ai：aggression・reserve・flank・ambush・waves 0〜1）があれば、家の型の上に少し足す（並の 0.5〜0.6 からの差だけ）
  const X = ai ? { push: ((ai.aggression ?? 0.6) - 0.6) * 0.4, rescue: ((ai.reserve ?? 0.5) - 0.5) * 0.4, flank: ((ai.flank ?? 0.5) - 0.5) * 0.4, bait: ((ai.ambush ?? 0.5) - 0.5) * 0.5 } : {};
  const C0 = CLAN_STYLE[house] || {}, C = { ...C0 }; for (const k of Object.keys(X)) C[k] = (C0[k] || 0) + X[k];
  const Lv = NPC_LEVEL[level] || NPC_LEVEL.chukyu;
  if (Lv.clanK != null) for (const k of Object.keys(C)) if (typeof C[k] === 'number' && k !== 'reserveAt') C[k] *= Lv.clanK;
  const o = { ...base, key: `${base.key}|${house || '-'}|${level || 'chukyu'}` };
  for (const k of ['push', 'holdLine', 'rescue', 'flank', 'hiGround', 'bait']) o[k] = Math.max(0, Math.min(1, (o[k] || 0) + (C[k] || 0) + (Lv.add[k] || 0)));
  o.chase = Math.max(0, (o.chase || 0) + (C.chase || 0)); o.restAt = Math.max(35, Math.min(95, (o.restAt || 70) + (C.restAt || 0) + (Lv.add.restAt || 0)));
  o.flank = Math.min(1, o.flank * Lv.flankK); o.rescue = Math.min(1, o.rescue * Lv.rescueK);
  if (C.reserveAt) o.reserveAt = C.reserveAt;
  o.cavWait = C0.cavWait || 0; o.gunHold = C.gunHold || 0; o.counter = !!Lv.counter; o.clan = house || null;
  o.encircle = !!Lv.encircle; o.volley = !!Lv.volley;
  return o;
}
// 兵種の相性（K603 87：相性を見て攻める）：騎馬→鉄砲・弓（近寄られると弱い）、槍→騎馬、鉄砲・弓→槍（足の遅い密な列）
const COUNTER = { cavalry: ['gun', 'bow'], spear: ['cavalry'], gun: ['spear'], bow: ['spear'] };

// ---- 疲れ（要件書 9〜11）：0〜100。斬り合い・走り・撃ちで増え、敵から離れて止まれば戻る ----
//   15分の戦で「最初から全軍で押し続けた隊」が十分前後で七十を越え、二隊で受けて一隊を休ませた側は新しい隊を出せる、の早さ。
export const FATIGUE = { fight: 0.16, run: 0.09, walk: 0.035, fire: 0.05, restNear: 0.04, restFar: 0.22, idle: 0.08, farD: 60 };
export function fatigueStep(st, dt, a) {
  // a：{ fighting, running, moving, firing, foeDist }（foeDist＝一番近い敵の隊までの m）
  let d;
  if (a.fighting) d = FATIGUE.fight;
  else if (a.running) d = FATIGUE.run;
  else if (a.moving) d = FATIGUE.walk;
  else if (a.firing) d = FATIGUE.fire;
  else d = -((a.foeDist ?? 999) > FATIGUE.farD ? FATIGUE.restFar : FATIGUE.restNear);
  if (a.firing && (a.fighting || a.moving)) d += FATIGUE.fire * 0.5;
  st.fatigue = Math.max(0, Math.min(100, (st.fatigue || 0) + d * dt));
  return st.fatigue;
}
// 疲れの効き目（要件書 9：動きが遅い・陣形の回復が遅い・射撃の効率が落ちる・騎馬の突撃が弱い）。50 まではほぼ効かない
export function fatigueFx(f) {
  const k = Math.max(0, (f - 30) / 70);   // 30 から効き始め、100 で全部
  return { speed: 1 - 0.3 * k, reform: 1 - 0.55 * k, fire: 1 - 0.35 * k, charge: 1 - 0.55 * k, morale: 1 - 0.25 * k };
}

// ---- 弾薬（要件書 12〜15）：鉄砲隊ごとに斉射の数。普通に撃てば15分足り、無駄に撃つと足りない ----
//   斉射の間はおよそ 25 秒（装填の揃え）。15分で撃てる回数は 36。普通の戦（接触してからの十分ほど・届く所で撃つ）は 20〜24 回。
//   持つ数を 28 にする：普通は足り、始めから遠くへ撃ち続けると十一分ほどで尽きる。補給の地点（本陣のまわり）で半分まで戻る。
export const AMMO = { max: 28, refillTo: 0.5, refillRate: 1 / 20, supplyR: 45, lowAt: 0.25, effRange: 0.65 };
export function makeAmmo() { return { ammo: AMMO.max, ammoMax: AMMO.max, shots: 0 }; }
export function ammoStep(st, dt, a) {
  // a：{ volley（今の一斉射を撃った）, nearSupply（補給の地点の内で止まっている） }
  if (a.volley && st.ammo > 0) { st.ammo -= 1; st.shots++; }
  if (a.nearSupply && st.ammo < st.ammoMax * AMMO.refillTo) st.ammo = Math.min(st.ammoMax * AMMO.refillTo, st.ammo + AMMO.refillRate * dt * st.ammoMax / 10);
  return st.ammo;
}
// 撃つか待つか（AI も、プレイヤーの「まだ撃つな」も同じ物差し）：弾が少ない時は届く距離の 65% より近い的だけ撃つ
export function shouldFire(st, dist, range, p) {
  if (!(st.ammo > 0) || dist > range) return false;
  const low = st.ammo <= st.ammoMax * AMMO.lowAt;
  const careful = (p?.holdLine ?? 0.5) > 0.5 || low;
  return careful ? dist <= range * AMMO.effRange : true;
}

// ---- 下知を決める ----
// me：{ id, name, persona, pos{x,z}, morale(0〜100), fatigue(0〜100), strength, kind('spear'|'gun'|'bow'|'cavalry'|'mixed'),
//       engaged(斬り合い中), reserve(予備として置いた), home{x,z}(持ち場), order({id,to,target,t} プレイヤーの命令・無ければ null), ammo?, range? }
// view：{ t, foes[{ id, pos, strength, morale, routed, engaged, fatigue, facing? }], friends[{ id, pos, strength, morale, engaged, routed }],
//         honjin{x,z}, supply{x,z}?, hills[{x,z}]?, foeHonjin{x,z}? }
// 返す：{ id: 'hold'|'move'|'attack'|'charge'|'pursue'|'retreat'|'rest'|'rescue'|'flank'|'fire', to?, target?, why }
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function aiStep(me, view) {
  const P = me.persona ? (me.persona.push !== undefined ? me.persona : personaOf(me.persona)) : personaOf(me.name);
  const fx = fatigueFx(me.fatigue || 0);
  const foes = (view.foes || []).filter((f) => f.strength > 0);
  const live = foes.filter((f) => !f.routed);
  const near = (list) => list.reduce((b, f) => (!b || d2(f.pos, me.pos) < d2(b.pos, me.pos) ? f : b), null);
  let nf = near(live), nd = nf ? d2(nf.pos, me.pos) : Infinity;
  // 上級・修羅：近い敵のうち、自分の兵種が強く出られる相手を先に選ぶ（一番近い敵より四割遠くまで）
  if (P.counter && nf && COUNTER[me.kind]) {
    const c = live.filter((f) => COUNTER[me.kind].includes(f.kind) && d2(f.pos, me.pos) < Math.max(80, nd * 1.4)).sort((a, b) => d2(a.pos, me.pos) - d2(b.pos, me.pos))[0];
    if (c) { nf = c; nd = d2(c.pos, me.pos); }
  }

  // ① プレイヤーの命令（要件書 4：原則従う）。命令の中で個性が出るのは「済んだ後」と「命令が古くなった後」だけ
  const ord = me.order;
  if (ord && ord.id && (view.t - (ord.t ?? view.t)) < 25 + 95 * P.obey) {
    // 命令の退却・守れは性格に関わらず守る。攻撃中に疲れ切った時だけ、obey の低い将は一言の後に下がる（次の段で）
    if (!(ord.id === 'attack' && (me.fatigue || 0) > 95 && P.obey < 0.8)) return { id: ord.id, to: ord.to, target: ord.target, why: '命令' };
  }
  // ② 崩れかけ：士気が低い間は持ち場まで退いて立て直す（どの型も）
  if ((me.morale ?? 100) < 25 && !me.engaged) return { id: 'retreat', to: me.home || view.honjin, why: '立て直し' };
  // ③ 本陣の危機（要件書 6：本陣の防衛）：本陣から 70m 内に敵の隊がいて、自分が近い（斬り合っていない）
  if (view.honjin) {
    const th = live.find((f) => d2(f.pos, view.honjin) < 70);
    if (th && !me.engaged && d2(me.pos, view.honjin) < 220 && P.holdLine + P.rescue > 0.6) return { id: 'attack', target: th.id, to: th.pos, why: '本陣の防衛' };
  }
  // ③'' 膠着を破る（K609 ③・kaito 11/21「自軍も敵軍も攻め寄せず、ずっと膠着」）：開戦から四十秒・または最後の斬り合いから三十秒、どこも当たっていなければ、
  //   攻めの側（性格の押しの強い側）から前の隊が一番近い敵へ仕掛ける。さらに二十秒続けば両方とも。本陣と後詰は動かさない（守りの家も前衛は出る）
  if (view.stall && !me.engaged && !me.honjin && !me.reserve && nf) return { id: me.kind === 'cavalry' && nd < 90 ? 'charge' : 'attack', target: nf.id, to: nf.pos, why: '膠着を破る' };
  // ③' 槍衾（K605 19・K601 52〜53：槍は対騎馬◎・一つの兵種で必ず勝てない）：騎馬の隊が正面の七十m 内に来たら、槍の隊は駆け寄らず
  //   その場で止まって敵の騎馬へ向き、槍衾で受ける（army_morale の yariHolds は『待て』の下知の時だけ効く＝前は『攻めよ』のまま突っ込み、
  //   騎馬に当たって数秒で崩れた）。騎馬と斬り合っている間も構えたまま受ける。横・後ろからの騎馬には効かない（yariShaken が整いを削る）。強さの数は触らない
  if (me.kind === 'spear' && (P.obey ?? 1) > 0.5) {
    const cv = live.filter((f) => f.kind === 'cavalry' && d2(f.pos, me.pos) < 70).sort((a, b) => d2(a.pos, me.pos) - d2(b.pos, me.pos))[0];
    if (cv && !(me.engaged && near(live.filter((f) => d2(f.pos, me.pos) < 25))?.kind !== 'cavalry')) return { id: 'hold', to: me.pos, face: Math.atan2(cv.pos.x - me.pos.x, cv.pos.z - me.pos.z), why: '槍衾で受ける' };
  }
  // ④ 疲れ（要件書 9）：斬り合っていない時、型ごとの限りを越えたら後ろで休む
  // K629 ④（kaito 11/22「敵本陣が目の前なのに交代する隊」）：疲れて下がる（交代）のは、近く（百m）に敵がいない時か、士気が崩れかけた（四十五未満）時だけ。
  //   攻めの最中（敵が百m 内）は疲れても下がらない
  if (!me.engaged && (me.fatigue || 0) >= P.restAt && (nd > 100 || (me.morale ?? 100) < 45)) return { id: 'rest', to: me.home || view.honjin, why: '疲れて休む' };
  // ④' 鉄砲・弓を守る（K624 ③・kaito 11/22「鉄砲で撃たれたら味方の槍が助けに来る」）：味方の鉄砲・弓の隊へ敵の隊が六十m 内まで寄ったら、
  //   その鉄砲に一番近い空いた槍の隊（本陣でない）が、鉄砲と敵の間（鉄砲から十二m 敵側）へ入って受ける。槍の隊が一つだけ出る（全部の槍が寄らない）。強さの数は触らない
  if (me.kind === 'spear' && !me.engaged && !me.honjin && (me.fatigue || 0) < P.restAt - 5) {
    const fr = view.friends || [];
    for (const g of fr) {
      if ((g.kind !== 'gun' && g.kind !== 'bow') || g.routed) continue;
      const th = near(live.filter((f) => f.kind !== 'gun' && f.kind !== 'bow' && d2(f.pos, g.pos) < 60));
      if (!th || d2(me.pos, g.pos) > 160) continue;
      const mine = d2(me.pos, g.pos);
      if (fr.some((q) => q.kind === 'spear' && !q.engaged && !q.routed && !q.honjin && d2(q.pos, g.pos) < mine)) continue;
      const L = d2(th.pos, g.pos) || 1;
      return { id: 'attack', target: th.id, to: { x: g.pos.x + (th.pos.x - g.pos.x) / L * 12, z: g.pos.z + (th.pos.z - g.pos.z) / L * 12 }, why: '鉄砲を守る' };
    }
  }
  // K603（11/21 k592）：釣り野伏の誘いは撃つ・予備より先に見る（前は家久が鉄砲で『撃つ』に取られ、後詰では『予備』で待ち、一度も誘わなかった）
  // ⑧' 釣り野伏を持つ将（me.baitAny・まだ使っていない）は、寄せて来る敵が三十五m 内に入れば（当たっていても）強さに関わらず退いて誘う（伏兵は matchAiTick が脇へ置く）
  if (me.baitAny && nf && nd < 35 && (me.morale ?? 100) >= 55) {
    const away = { x: me.pos.x - (nf.pos.x - me.pos.x) / nd * 30, z: me.pos.z - (nf.pos.z - me.pos.z) / nd * 30 };
    return { id: 'retreat', to: away, why: '誘い' };
  }
  // 誘う将は、敵が来るまで持ち場で待つ（前へ出ると脇の伏兵が置き場に着かない）
  if (me.baitAny && !me.engaged && (!nf || nd >= 35)) return { id: 'hold', to: me.home, why: '誘いの待ち' };
  // ⑤ 鉄砲・弓：撃てる的があれば撃つ（弾の物差し）。弾が尽きたら補給の地点へ
  if ((me.kind === 'gun' || me.kind === 'bow') && me.ammo) {
    if (me.ammo.ammo <= 0) return { id: 'retreat', to: view.supply || view.honjin, why: '弾を取りに戻る' };
    // K624 ③：敵の槍・騎馬が三十m 内まで寄ったら、近くの味方の槍の後ろへ下がって撃ち続ける（斬り合いに巻き込まれる前に）
    if (nf && nd < 30 && !me.engaged && nf.kind !== 'gun' && nf.kind !== 'bow') {
      const sp = (view.friends || []).filter((f) => f.kind === 'spear' && !f.routed && d2(f.pos, me.pos) < 70).sort((a, b) => d2(a.pos, me.pos) - d2(b.pos, me.pos))[0];
      if (sp) { const Ls = d2(sp.pos, nf.pos) || 1; return { id: 'move', to: { x: sp.pos.x + (sp.pos.x - nf.pos.x) / Ls * 18, z: sp.pos.z + (sp.pos.z - nf.pos.z) / Ls * 18 }, why: '槍の後ろから撃つ' }; }
    }
    if (nf && (P.volley ? nd <= (me.range || 140) : shouldFire(me.ammo, nd, me.range || 140, P))) return { id: 'fire', target: nf.id, to: nf.pos, why: P.volley ? '斉射' : '撃つ' };   // K627 ⑥：修羅は届けば斉射を惜しまない
    // 鉄砲の家（織田・毛利）：届く距離の外の敵へ自分から寄せず、持ち場で撃てる所まで来るのを待つ
    if (P.gunHold && nf && !me.engaged && nd < (me.range || 140) * 1.8 && ((view.t | 0) % 10) < 5 + P.gunHold * 10) return { id: 'hold', to: me.home, why: '射線で待つ' };
  }
  // ⑤' 射撃の間合いへ（K605・11/21 k592）：鉄砲・弓の隊は、予備や本陣でも、味方と当たっている敵（無ければ近い敵）が届く距離の外なら、
  //   届く距離の四分の三まで寄って撃つ（前は本陣の鉄砲が予備のまま後ろに居て一発も撃たなかった）。本陣は持ち場から九十m より先へは出ない
  if ((me.kind === 'gun' || me.kind === 'bow') && me.ammo && me.ammo.ammo > 0 && !me.engaged && nf) {
    const rg = me.range || 140, fight = live.filter((f) => f.engaged).sort((a, b) => d2(a.pos, me.pos) - d2(b.pos, me.pos))[0];
    const tgt = fight && d2(fight.pos, me.pos) < rg + 160 ? fight : nd < rg + 80 ? nf : null;
    if (tgt && d2(tgt.pos, me.pos) > rg * 0.85) {
      const L = d2(tgt.pos, me.pos) || 1, R = rg * 0.75;
      let to = { x: tgt.pos.x + (me.pos.x - tgt.pos.x) / L * R, z: tgt.pos.z + (me.pos.z - tgt.pos.z) / L * R };
      const leash = me.honjin ? 90 : 160, h = me.home || me.pos, dh = d2(to, h);
      if (dh > leash) to = { x: h.x + (to.x - h.x) / dh * leash, z: h.z + (to.z - h.z) / dh * leash };
      // K624 ③：味方の槍の隊が的との間に入れる所にいれば、その槍の後ろ（的から見て十八m 奥）に立って撃つ（槍を前に、鉄砲・弓は後ろから）
      const sp = (view.friends || []).filter((f) => f.kind === 'spear' && !f.routed && d2(f.pos, me.pos) < 90 && d2(f.pos, tgt.pos) < rg * 0.9 && d2(f.pos, tgt.pos) > 15)
        .sort((a, b) => d2(a.pos, me.pos) - d2(b.pos, me.pos))[0];
      if (sp) {
        const Ls = d2(sp.pos, tgt.pos) || 1, bk = { x: sp.pos.x + (sp.pos.x - tgt.pos.x) / Ls * 18, z: sp.pos.z + (sp.pos.z - tgt.pos.z) / Ls * 18 };
        if (d2(bk, tgt.pos) < rg * 0.95 && d2(bk, h) < leash + 30) return { id: 'move', to: bk, why: '槍の後ろから撃つ' };
      }
      if (d2(to, me.pos) > 8) return { id: 'move', to, why: '射撃の間合いへ' };
    }
  }
  // ⑥ 味方の救援（要件書 6：崩れた戦線の救援）。予備の値打ちの一つ
  const help = (view.friends || []).filter((f) => f.engaged && !f.routed && (f.morale ?? 100) < 55 && d2(f.pos, me.pos) < 160)
    .sort((a, b) => (a.morale ?? 100) - (b.morale ?? 100))[0];
  if (help && !me.engaged && (me.reserve || P.rescue >= 0.5) && (me.fatigue || 0) < P.restAt - 10) {
    const foe = near(live.filter((f) => d2(f.pos, help.pos) < 40)) || nf;
    return { id: me.kind === 'cavalry' ? 'charge' : 'rescue', target: foe?.id, to: foe?.pos || help.pos, why: '味方の救援' };
  }
  // ⑦ 予備（要件書 6）：救援・側面・追撃・本陣・交代の時だけ出る。それ以外は持ち場で待つ（疲れが戻る）
  // K629 ②（続き・AI 同士の測りで、後詰が『交戦中』のまま『予備』の持ち場待ちで棒立ちしていた＝114/400秒）：予備の決まりは斬り合っていない時だけ
  if (me.reserve && !me.engaged) {
    // 斬り合って疲れが半ばを越えた敵か、斬り合う味方の士気が六割を割った所へ新手として出る（交代・救援）
    const tired = live.find((f) => f.engaged && (f.fatigue || 0) > 50 && d2(f.pos, me.pos) < 220)
      || ((view.friends || []).some((f) => f.engaged && !f.routed && (f.morale ?? 100) < (me.reserveAt ?? P.reserveAt ?? 60)) ? near(live.filter((f) => f.engaged)) : null);
    if (tired && (me.fatigue || 0) < 30) return { id: me.kind === 'cavalry' ? 'charge' : 'attack', target: tired.id, to: tired.pos, why: '疲れた敵へ新手' };
    // 11/21 クラウド kaito2 k365-cloud-04（模擬合戦 練習・平原の描かずの通し：300秒で前の隊が両側とも崩れた後、予備だけが残り、
    //   斬り合う隊が一つも無いまま 900秒まで持ち場で待ち続けた）：味方の前の隊が崩れ、どこにも斬り合いが無い時は、予備が前の隊になって下の『ふだん』の決まりで寄せる
    const fr = view.friends || [];
    if (!(fr.some((f) => f.routed) && !fr.some((f) => f.engaged) && !live.some((f) => f.engaged))) return { id: 'hold', to: me.home, why: '予備' };
  }
  // ⑧ 崩れた敵の追撃（要件書 2：柴田は前へ出たがる・官兵衛は無理な追撃を避ける）
  const rf = near(foes.filter((f) => f.routed));
  if (rf && !me.engaged) {
    const far = d2(rf.pos, me.home || me.pos);
    if (far < P.chase && (me.fatigue || 0) < P.restAt - 15) return { id: 'pursue', target: rf.id, to: rf.pos, why: '追撃' };
  }
  // K603（11/21 k592）：騎馬の家（武田・伊達）の騎馬は正面の斬り合いに入り続けない。突撃して二十秒斬り合ったら一度離れて立て直し（REFORMING）、次の側面へ
  if (me.engaged && P.cavWait && me.kind === 'cavalry' && (me.engagedFor || 0) > 20 && (me.fatigue || 0) > 35) {
    // 離れる先は家でなく、味方と当たっている敵の横の七十m（立て直したらすぐ横から突ける＝赤備突撃の間合い）
    const bz = live.filter((f) => f.engaged).sort((a, b) => d2(a.pos, me.pos) - d2(b.pos, me.pos))[0];
    if (bz) { const L = d2(bz.pos, me.pos) || 1, ux = (me.pos.x - bz.pos.x) / L, uz = (me.pos.z - bz.pos.z) / L; return { id: 'move', to: { x: bz.pos.x + (ux - uz * 0.6) * 55, z: bz.pos.z + (uz + ux * 0.6) * 55 }, why: '離れて立て直す' }; }
    return { id: 'move', to: me.home, why: '離れて立て直す' };
  }
  if (me.engaged) return { id: 'attack', target: nf?.id, to: nf?.pos, why: '斬り合い' };
  // ⑨ 側面（要件書 2：官兵衛＝側面を優先・家久＝誘いと反転）：味方と斬り合っている敵の横へ回る
  const busy = live.find((f) => f.engaged && d2(f.pos, me.pos) < 180);
  // K624 ③（kaito 11/22「横腹を突く」）：騎馬の隊は性格に関わらず、味方と斬り合っている敵の横・後ろ（斬り合う味方の反対の側へ四十五度）へ回って突く
  if (busy && me.kind === 'cavalry' && !me.honjin && (me.fatigue || 0) < 60) {
    const fe = (view.friends || []).filter((f) => f.engaged && !f.routed && d2(f.pos, busy.pos) < 90).sort((a, b) => d2(a.pos, busy.pos) - d2(b.pos, busy.pos))[0];
    if (fe) {
      const L = d2(busy.pos, fe.pos) || 1, bx = (busy.pos.x - fe.pos.x) / L, bz = (busy.pos.z - fe.pos.z) / L;   // 敵の背の向き（味方から敵へ）
      const sg = ((me.pos.x - busy.pos.x) * -bz + (me.pos.z - busy.pos.z) * bx) >= 0 ? 1 : -1;   // 自分のいる側の横から
      const to = { x: busy.pos.x + (bx * 0.7 - bz * 0.7 * sg) * 22, z: busy.pos.z + (bz * 0.7 + bx * 0.7 * sg) * 22 };
      return { id: d2(to, me.pos) < 30 ? 'charge' : 'move', target: busy.id, to: d2(to, me.pos) < 30 ? busy.pos : to, why: '横腹を突く' };
    }
  }
  // K627 ⑥ 囲む（上級・修羅）：味方と斬り合っている敵の背と横へ、隊ごとに違う向き（百〜百六十度）から回り込んで当たる。本陣・鉄砲・弓は回らない
  if (P.encircle && busy && !me.honjin && me.kind !== 'gun' && me.kind !== 'bow' && (me.fatigue || 0) < 70) {
    const fe = (view.friends || []).filter((f) => f.engaged && !f.routed && d2(f.pos, busy.pos) < 90).sort((a, b) => d2(a.pos, busy.pos) - d2(b.pos, busy.pos))[0];
    if (fe) {
      const a0 = Math.atan2(fe.pos.x - busy.pos.x, fe.pos.z - busy.pos.z), off = (1.75 + ((me.id * 7) % 5) * 0.2) * (me.id % 2 ? 1 : -1), ang = a0 + off;
      const to = { x: busy.pos.x + Math.sin(ang) * 20, z: busy.pos.z + Math.cos(ang) * 20 };
      const close = d2(to, me.pos) < 25;
      return { id: close ? (me.kind === 'cavalry' ? 'charge' : 'attack') : 'move', target: busy.id, to: close ? busy.pos : to, why: '囲む' };
    }
  }
  if (busy && (P.flank >= 0.5 || (P.cavWait && me.kind === 'cavalry')) && (me.fatigue || 0) < 60) {
    const ang = Math.atan2(busy.pos.x - me.pos.x, busy.pos.z - me.pos.z) + (me.id % 2 ? 1 : -1) * 1.1;
    const side = { x: busy.pos.x - Math.sin(ang) * 25, z: busy.pos.z - Math.cos(ang) * 25 };
    return { id: me.kind === 'cavalry' ? 'charge' : 'flank', target: busy.id, to: side, why: '側面' };
  }
  // 騎馬の家の騎馬：味方と当たっている敵が出るまで、翼の持ち場の少し前で待つ（正面から突っ込まない＝赤備え突撃の条件『空いた騎馬』を残す）
  if (P.cavWait && me.kind === 'cavalry' && !busy && nd > 40) return { id: 'hold', to: me.home, why: '翼で待つ' };
  // ⑩' 地形の取り合い（K603 47〜49）：敵が寄せていない間、近くの空いた所・敵に押さえられた所（丘・橋・浅瀬・村・街道）を取りに行く。
  //   高所が好きな型（hiGround）は丘を、持ち場を守る型と回る型（holdLine＋flank）は橋・浅瀬・村・街道を。予備は動かさない。一度に一つの隊だけが向かう（同じ所へ二隊行かない）
  if (view.keys?.length && nd > 90 && !me.reserve) {
    const want = view.keys.filter((k) => k.held !== 'mine' && !live.some((f) => d2(f.pos, k) < 40) && !(view.friends || []).some((f) => !f.routed && d2(f.pos, k) < 30))
      .map((k) => ({ k, sc: (k.kind === 'hill' ? P.hiGround : (P.holdLine + P.flank) * 0.6) * k.w * (k.held === 'foe' ? 1.3 : 1) - d2(k, me.pos) / 400 }))
      .filter((q) => q.sc > 0.35 && d2(q.k, me.pos) < 170).sort((a, b) => b.sc - a.sc)[0];
    if (want) return { id: 'move', to: { x: want.k.x, z: want.k.z }, why: want.k.kind === 'hill' ? '高所を取る' : '要所を取る' };
  }
  // ⑩ 高所（要件書 2：官兵衛＝高所を優先）：近い高所が空いていれば先に取る
  if (P.hiGround >= 0.6 && view.hills?.length && nd > 90) {
    const h = view.hills.filter((q) => !live.some((f) => d2(f.pos, q) < 40)).sort((a, b) => d2(a, me.pos) - d2(b, me.pos))[0];
    if (h && d2(h, me.pos) > 12 && d2(h, me.pos) < 160) return { id: 'move', to: h, why: '高所を取る' };
  }
  // ⑪ 誘い（島津家久）：自分より強い敵が寄せて来たら、少し退いて伏兵の側へ引く（反転は固有戦術の側が出す）
  if (P.bait >= 0.5 && nf && nd < 70 && nf.strength > me.strength * 1.1 && !me.engaged) {
    const away = { x: me.pos.x - (nf.pos.x - me.pos.x) / nd * 40, z: me.pos.z - (nf.pos.z - me.pos.z) / nd * 40 };
    return { id: 'move', to: away, why: '誘い' };
  }
  // ⑫ ふだん：push の重みで前へ（holdLine が強い型は持ち場で待つ）
  if (!nf) return { id: 'hold', to: me.home, why: '敵が見えない' };
  const reach = 60 + 220 * P.push * fx.speed;
  if (nd <= reach && P.push >= P.holdLine) return { id: me.kind === 'cavalry' && nd < 90 ? 'charge' : 'attack', target: nf.id, to: nf.pos, why: '寄せる' };
  if (P.holdLine > P.push) {
    // 持ち場の前 40m に入った敵だけ受けに出る（防御・慎重・忠実）
    if (nd < 40 + 40 * (1 - P.holdLine)) return { id: 'attack', target: nf.id, to: nf.pos, why: '受ける' };
    return { id: 'hold', to: me.home, why: '持ち場' };
  }
  const step = Math.min(nd - 40, 30 + 50 * P.push);
  return { id: 'move', to: { x: me.pos.x + (nf.pos.x - me.pos.x) / nd * step, z: me.pos.z + (nf.pos.z - me.pos.z) / nd * step }, why: '前へ' };
}

// ---- 隊（butai.js の Butai）へ下知を渡す。疲れの効き目は B.pvp の隊だけに掛ける（一人の戦の隊は今のまま） ----
export function butaiApply(B, it) {
  if (!B || !it) return;
  let id = it.id === 'pursue' || it.id === 'rescue' || it.id === 'flank' ? (it.to ? 'move' : 'attack')
    : it.id === 'rest' ? 'retreat' : it.id === 'fire' ? 'hold' : it.id;
  // 11/21（18 の知らせ：8隊が待機のまま）：butai の attack は組の seekRange（45m）の内の敵しか探さない。行き先が遠ければ駆けて寄せ（charge）、
  //   四十五m の内に入ってから attack にする（butai.js は触らない）
  if ((id === 'attack' || id === 'charge') && it.to && B.pos && d2(B.pos, it.to) > 45) id = 'charge';
  else if (id === 'charge' && it.to && B.pos && d2(B.pos, it.to) <= 45) id = 'attack';
  const same = B._aiLast && B._aiLast.id === id && (!it.to || !B._aiLast.to || d2(B._aiLast.to, it.to) < 8);
  if (!same) { B.order({ id, to: it.to || null }); B._aiLast = { id, to: it.to || null }; }
  if (B.pvp && B.real) {
    const fx = fatigueFx((B.fatigue || 0) * 100);
    B.real.speedMult = fx.speed;
  }
}

// ---- 試合（match.js）につなぐ：毎秒、動かしていない隊の下知を決める（11/21 cloud-47・つなぐ順 ⑤） ----
//   S：sonae.js の備（S.b＝Butai・S.team・S.taisho・S.line・S.state）。自分の側の 0 番（本人が率いる隊）は本人が動かすので AI に掛けない。
//   o.both：相手の側も AI で動かす（練習の戦・切断の引き継ぎ）。二人の試合では相手の隊は相手の画面の AI が動かし、命令の札だけが来る。
//   プレイヤーの命令は command.js の applyCmd が g._plOrder に付ける（その隊の本物の組）。新しい間は AI は何もしない（命令の通りに動く）。
const KIND = (mix) => !mix ? 'spear' : (mix.cavalry || 0) >= 0.35 ? 'cavalry' : (mix.gun || 0) >= 0.35 ? 'gun' : 'spear';
// 諸大名戦（o.npc＝{ house, level }）の相手の側（team 1）か
const npcSide = (o, S) => !!o.npc && S.team === 1;
export function matchAiTick(rt, dt, sonae, o = {}) {
  const M = rt._gai || (rt._gai = { acc: 0, st: new Map() });
  M.acc += dt;
  if (M.acc < 1 || !sonae?.length) return;
  const step = M.acc; M.acc = 0;
  const t = rt.t || 0;
  const pub = sonae.map((S) => {
    const B = S.b, g = B.real;
    const fighting = (t - (B._clashAt ?? -99)) < 2 || !!g?.units?.some((u) => u.alive && u.target?.alive && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 4);
    return { S, id: S.id, team: S.team, pos: { x: B.pos.x, z: B.pos.z }, strength: B.aliveNominal(), morale: B.morale, routed: S.state === '敗走', engaged: fighting, fatigue: (B.fatigue || 0) * 100, kind: KIND(B.mix) };
  });
  const own0 = sonae.find((S) => S.team === 0);
  // K609 ③：膠着の見張り。どこかが斬り合っていれば時を覚え、無いまま続けば押しの強い側から仕掛けさせる
  M.t0 ??= t;
  if (pub.some((q) => q.engaged)) M.lastClash = t;
  const quiet = t - (M.lastClash ?? M.t0), lim = M.lastClash == null ? 40 : 30;
  const pushOfTeam = (tm) => { const L = pub.filter((q) => q.team === tm); return L.reduce((a, q) => a + (M.st.get(q.S)?.persona?.push ?? 0.4), 0) / Math.max(1, L.length); };
  const stallTeams = quiet < lim ? null : quiet < lim + 20 ? [pushOfTeam(0) >= pushOfTeam(1) ? 0 : 1] : [0, 1];
  const honjinOf = (team) => { const h = sonae.find((S) => S.team === team && (S.line === 'honjin' || S.major)) || sonae.find((S) => S.team === team); return h ? { x: h.b.pos.x, z: h.b.pos.z } : null; };
  // 釣り野伏（31 tsurinobuse・島津家久）の伏兵：前の秒に『誘い』で退いた隊があれば、同じ側の空いた隊を一つ、退く先の脇（筋から十八m）へ伏せる（三十秒）。
  //   追ってきた敵が伏兵の四十m 内へ入れば tactics.js の条件が揃い、aiTactic が反転と挟み撃ちを使う
  for (const bt of M.baits || []) {
    if ([...M.st.values()].some((q) => q.ambushFor === bt.S && q.ambushT > t)) continue;
    const L = Math.hypot(bt.to.x - bt.from.x, bt.to.z - bt.from.z) || 1, ux = (bt.to.x - bt.from.x) / L, uz = (bt.to.z - bt.from.z) / L;
    const cand = pub.filter((q) => q.team === bt.S.team && q.S !== bt.S && !q.engaged && !q.routed && q.strength > 0 && (q.morale ?? 100) >= 50 && (M.st.get(q.S)?.ambushT ?? -1) < t)
      .sort((a, b) => Math.hypot(a.pos.x - bt.to.x, a.pos.z - bt.to.z) - Math.hypot(b.pos.x - bt.to.x, b.pos.z - bt.to.z))[0];
    if (!cand) continue;
    const sgn = ((cand.pos.x - bt.to.x) * -uz + (cand.pos.z - bt.to.z) * ux) >= 0 ? 1 : -1;   // 伏兵の今いる側の脇へ
    const cs = M.st.get(cand.S); if (!cs) continue;
    cs.ambushFor = bt.S; cs.ambushT = t + 30; cs.ambushAt = { x: bt.to.x - uz * 18 * sgn - ux * 6, z: bt.to.z + ux * 18 * sgn - uz * 6 };
  }
  M.baits = [];
  // 釣り野伏の備えを始めから：その戦術を持つ将（家久）がまだ使っていない間、近い味方の隊（本陣でない）一つを、家久の脇十六m に伏せておく
  //   （退いてから呼んでも間に合わない＝11/21 の模擬合戦で本陣の義久が百m 後ろから向かい、出なかった）
  for (const P of pub) {
    const ks = M.st.get(P.S);
    if (!ks || P.routed || o.tac?.BUSHO_TACTIC?.[P.S.taisho] !== 'tsurinobuse' || ks.tacUsed > 0) continue;
    const foe = pub.filter((q) => q.team !== P.team && !q.routed && q.strength > 0).sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
    if (!foe) continue;
    const L = Math.hypot(foe.pos.x - P.pos.x, foe.pos.z - P.pos.z) || 1, ux = (foe.pos.x - P.pos.x) / L, uz = (foe.pos.z - P.pos.z) / L;
    let amb = [...M.st.entries()].find(([S2, q]) => q.ambushFor === P.S && q.ambushPre)?.[0];
    const ap = amb && pub.find((q) => q.S === amb);
    if (!ap || ap.routed || ap.engaged) {
      const c = pub.filter((q) => q.team === P.team && q !== P && !q.engaged && !q.routed && q.strength > 0 && q.S.line !== 'honjin' && !q.S.major)
        .sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
      amb = c?.S;
    }
    const as = amb && M.st.get(amb); if (!as) continue;
    const ac = pub.find((q) => q.S === amb), sgn = ((ac.pos.x - P.pos.x) * -uz + (ac.pos.z - P.pos.z) * ux) >= 0 ? 1 : -1;
    as.ambushFor = P.S; as.ambushPre = true; as.ambushT = t + 2;
    // 家久の脇十六m・六m 前（家久が三十m 退くと、追う敵がちょうど伏兵の横を抜ける＝四十m 内・筋から十m より外。二十二m 脇では四十m を少し越えた）。誘いの間は置き場を動かさない
    if (!(ks.baitUntil > t) || !as.ambushAt) as.ambushAt = { x: P.pos.x + ux * 6 - uz * 16 * sgn, z: P.pos.z + uz * 6 + ux * 16 * sgn };
  }
  for (const P of pub) {
    const S = P.S, B = S.b;
    let st = M.st.get(S);
    if (!st) { st = { fatigue: 0, home: { x: B.pos.x, z: B.pos.z }, ammo: (S.b.mix?.gun || 0) > 0 ? makeAmmo() : null, persona: npcSide(o, S) ? clanPersona(personaOf(S.taisho || S.name), o.npc.house, o.npc.level, o.npc.ai || null) : personaOf(S.taisho || S.name), volleyT: 0 }; M.st.set(S, st); }
    // 疲れ：備の今の動き（斬り合い・駆け・歩き）で増減し、隊の fatigue（0〜1。軽い押し合いの効きに使う）へ写す
    // 動いたか：一秒の間に進んだ道のり（下知の名ではなく実の動き。攻めの下知で寄せている間も歩きに数える）
    const lp = st.lastPos || P.pos, dv = Math.hypot(P.pos.x - lp.x, P.pos.z - lp.z) / step; st.lastPos = { x: P.pos.x, z: P.pos.z };
    const moving = dv > 0.4, running = dv > 2.6;
    const foes = pub.filter((q) => q.team !== P.team && q.strength > 0);
    const foeDist = foes.reduce((m, q) => Math.min(m, Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z)), 999);
    fatigueStep(st, step, { fighting: P.engaged, running, moving, foeDist });
    B.fatigue = st.fatigue / 100;
    // 切断の引き継ぎ（40 match_link.js の matchDrop が S.byAI を立てる）：切れた側の備は、本人の隊も相手の側も AI が動かす。戻れば matchBack が外す
    if (!S.byAI && (S === own0 || (P.team !== 0 && !o.both))) continue;
    if (P.routed || S.state === '混乱' || P.strength <= 0) continue;
    if (!S.byAI && S._plHold && t - S._plHold.t < 30) continue;   // 本人の命令から 30 秒（次の命令まで）は AI が下知を重ねない（command.js runCmd が立てる・cloud-26 11/21）
    const g = B.real;
    // AI が出したのでない下知（command.js の使番を通らない下知：31 の固有戦術・備の自分の退き・テストの B.order）も命令として守る（11/21 31：家久の『退け』が二秒で攻めに戻された）
    const bc = B.cmd, al = B._aiLast;
    if (bc?.id && st.seenCmd !== undefined && bc !== st.seenCmd && !(al && al.id === bc.id && ((!al.to && !bc.to) || (al.to && bc.to && d2(al.to, bc.to) < 1)))) st.ext = { id: bc.id === 'charge' ? 'attack' : bc.id, to: bc.to || null, t };
    st.seenCmd = bc || null;   // 始めの下知（備を立てた時の hold）は命令に数えない
    // 切断で AI が継いだ備（byAI）は、切れる前の人の命令を守らない（12秒で1m しか動かなかった＝前の『止まれ』を守り続けた）
    const po = S.byAI ? null : g?._plOrder && (!st.ext || g._plOrder.t >= st.ext.t) ? g._plOrder : st.ext;
    const me = { id: S.id, name: S.taisho, persona: st.persona, pos: P.pos, home: st.home, morale: P.morale, fatigue: st.fatigue, strength: P.strength,
      baitAny: o.tac?.BUSHO_TACTIC?.[S.taisho] === 'tsurinobuse' && !(st.tacUsed > 0),
      kind: KIND(B.mix), honjin: S.line === 'honjin' || !!S.major, engaged: P.engaged, engagedFor: P.engaged ? t - (st.engT ?? (st.engT = t)) : (st.engT = null, 0), reserve: S.state === '予備待機' || S.line === 'gotsume', ammo: st.ammo, range: 140,
      order: po ? { id: po.id, to: po.to, t: po.t } : null };
    // 諸大名戦の相手：難易度の『考える速さ』（初級は三秒に一度しか考え直さない）と『見る広さ』（霧に弱い）。前の下知はそのまま続く
    const npc = npcSide(o, S), Lv = npc ? NPC_LEVEL[o.npc.level] || NPC_LEVEL.chukyu : null;
    if (Lv && st.nextThink > t) continue;
    if (Lv) st.nextThink = t + Lv.react;
    if (Lv?.noReserve) me.reserve = false;   // 初級：後詰も始めから前へ（予備を残さない＝開戦すぐの全軍突撃が一番にならない形の逆を取る）
    const seen = Lv ? foes.filter((q) => Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) < Lv.see || q.engaged) : foes;
    const view = { t, foes: seen.map((q) => ({ id: q.id, pos: q.pos, strength: q.strength, morale: q.morale, routed: q.routed, engaged: q.engaged, fatigue: q.fatigue, kind: q.kind })),
      friends: pub.filter((q) => q.team === P.team && q !== P).map((q) => ({ id: q.id, pos: q.pos, strength: q.strength, morale: q.morale, engaged: q.engaged, routed: q.routed, kind: q.kind, honjin: q.S.line === 'honjin' || !!q.S.major })),
      honjin: honjinOf(P.team), supply: honjinOf(P.team), hills: o.hills || null, stall: !!stallTeams?.includes(P.team), keys: o.keysFor ? o.keysFor(P.team) : null };
    let it = aiStep(me, view);
    // K629 ②（kaito 11/22「向かい合うだけで動かない隊・端にぽつんと立つ山県隊・本陣が襲われても助けに来ない・こちらの本陣も攻めて来ない」）
    if (it.why !== '命令' && !P.engaged) {
      // 本陣の救援：自分の本陣の九十m 内に敵の隊がいれば、本陣でない近い二隊が（見える広さに関わらず）向かう
      const H = sonae.find((q) => q.team === S.team && (q.line === 'honjin' || q.major) && q.b?.aliveNominal() > 0);
      const th = H && pub.filter((q) => q.team !== P.team && !q.routed && q.strength > 0 && Math.hypot(q.pos.x - H.b.pos.x, q.pos.z - H.b.pos.z) < 90).sort((a, b) => Math.hypot(a.pos.x - H.b.pos.x, a.pos.z - H.b.pos.z) - Math.hypot(b.pos.x - H.b.pos.x, b.pos.z - H.b.pos.z))[0];
      if (th && S !== H && !me.honjin) {
        const mine = Math.hypot(P.pos.x - H.b.pos.x, P.pos.z - H.b.pos.z);
        const closer = pub.filter((q) => q.team === P.team && q.S !== H && q !== P && !q.engaged && !q.routed && q.strength > 0 && Math.hypot(q.pos.x - H.b.pos.x, q.pos.z - H.b.pos.z) < mine).length;
        if (closer < 2) it = { id: me.kind === 'cavalry' ? 'charge' : 'attack', target: th.id, to: th.pos, why: '本陣の救援' };
      }
      // 待ちすぎない：開戦四十秒より後、二十五秒続けて待った（持ち場・予備・翼・射線・見えない）隊は、敵の本陣か一番近い敵の隊へ寄せる。
      //   本陣までの間に敵の隊が無い（本陣が一番近い敵の一・三倍より近い）なら本陣を攻める
      const WAIT = it.why === '持ち場' || it.why === '予備' || it.why === '翼で待つ' || it.why === '射線で待つ' || it.why === '敵が見えない';
      if (WAIT && !me.honjin && t > 40) {
        st.waitT ??= t;
        if (t - st.waitT > 25) {
          const all = pub.filter((q) => q.team !== P.team && !q.routed && q.strength > 0);
          const fh = all.find((q) => q.S.line === 'honjin' || q.S.major), nf2 = all.filter((q) => q !== fh).sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
          const dh = fh ? Math.hypot(fh.pos.x - P.pos.x, fh.pos.z - P.pos.z) : Infinity, dn = nf2 ? Math.hypot(nf2.pos.x - P.pos.x, nf2.pos.z - P.pos.z) : Infinity;
          const tg = fh && dh < dn * 1.3 ? fh : nf2 || fh;
          if (tg) it = { id: me.kind === 'cavalry' && Math.min(dh, dn) < 90 ? 'charge' : 'attack', target: tg.id, to: tg.pos, why: tg === fh ? '本陣を攻める' : '次の的へ' };
        }
      } else st.waitT = null;
      // K629 ②（続き・毎時の長 11/22「本陣が戦の流れに合わせて動く（押される時に退く・押す時に前へ）」）：待っている本陣は、
      //   味方の前の隊（本陣でない・崩れていない）の兵の重みの真ん中から、自陣の側へ七十m の所へ寄る（前の隊が押されて下がれば本陣も退き、押せば前へ出る）。
      //   目当てが二十m の内なら動かない・敵の隊が六十m 内にいればその場で受ける（動いて背を見せない）
      if (me.honjin && (it.why === '予備' || it.why === '持ち場' || it.why === '翼で待つ' || it.why === '敵が見えない')) {
        const fr = pub.filter((q) => q.team === P.team && q !== P && !q.routed && q.strength > 0 && !(q.S.line === 'honjin' || q.S.major));
        const foeNear = pub.some((q) => q.team !== P.team && !q.routed && q.strength > 0 && Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) < 60);
        const w = fr.reduce((a, q) => a + q.strength, 0);
        if (w > 0 && !foeNear) {
          const cx = fr.reduce((a, q) => a + q.pos.x * q.strength, 0) / w, cz = fr.reduce((a, q) => a + q.pos.z * q.strength, 0) / w;
          const fh = pub.find((q) => q.team !== P.team && (q.S.line === 'honjin' || q.S.major)) || null;
          const hx = st.home.x - (fh ? fh.pos.x : cx), hz = st.home.z - (fh ? fh.pos.z : cz), hl = Math.hypot(hx, hz) || 1;   // 自陣の向き（敵の本陣から自分の持ち場へ）
          const to = { x: cx + hx / hl * 70, z: cz + hz / hl * 70 };
          const back = (to.x - P.pos.x) * hx + (to.z - P.pos.z) * hz > 0;
          if (Math.hypot(to.x - P.pos.x, to.z - P.pos.z) > 20) it = { id: 'move', to, why: back ? '本陣を退く' : '本陣を進める' };
        }
      }
    }
    // 伏兵の役：決めた脇へ寄って伏せる（斬り合いになったら外す）
    if (st.ambushT > t && !P.engaged && it.why !== '命令') it = { id: Math.hypot(P.pos.x - st.ambushAt.x, P.pos.z - st.ambushAt.z) > 6 ? 'move' : 'hold', to: st.ambushAt, why: '伏兵' };
    // 伏兵は声を潜める：近くを抜ける敵へ自分から斬り掛からない（斬り合っていると釣り野伏の伏兵に数えられない）。役が済めば元の気の荒さへ
    if (g) { if (it.why === '伏兵') { if (g._ambAggro == null) { g._ambAggro = g.aggro; g._ambSeek = g.seekRange; } g.aggro = 2; g.seekRange = 3; } else if (g._ambAggro != null) { g.aggro = g._ambAggro; g.seekRange = g._ambSeek; g._ambAggro = null; } }
    // 偽りの退き：一度誘いに出たら、当たられても二十秒は退き続ける（すぐ斬り合いに戻ると、追う敵と伏兵の条件が揃わない）
    if (it.why === '誘い' && !(st.baitUntil > t)) { st.baitUntil = t + 20; st.baitTo = it.to; }
    if (st.baitUntil > t && !(st.tacUsed > 0) && (P.morale ?? 100) >= 50 && it.why !== '命令') it = { id: 'retreat', to: st.baitTo, why: '誘い' };   // 退けの下知（31 の釣り野伏は備の b.cmd が retreat の隊を囮に数える）
    if (it.why === '誘い') M.baits.push({ S, from: { x: P.pos.x, z: P.pos.z }, to: it.to });
    if (o.field && it.why !== '命令') it = fieldStep(o.field, P, it, me, pub, t, st, M.st, g) || it;
    st.last = it;
    if (it.why === '命令') continue;   // 命令は command.js の使番が運んで当てる
    if (st.ammo) {
      const nearSupply = view.supply && Math.hypot(P.pos.x - view.supply.x, P.pos.z - view.supply.z) < AMMO.supplyR && !moving;
      const volley = it.id === 'fire' && t - st.volleyT >= 25;
      if (volley) st.volleyT = t;
      ammoStep(st.ammo, step, { volley, nearSupply });
    }
    butaiApply(B, it);
    if (it.face != null && B.real && !B.real.routed) { B.real.facing = it.face; if (B.real.formation !== 'yari' && B.real.arm !== 'gun') B.real.formation = 'yari'; }   // 槍衾：敵の騎馬へ向いて構える
    // 陣形と固有戦術（o.jin＝26 jinkei6.js・o.tac＝31 tactics.js。match.js が渡す。無ければ下知だけ）
    const fg = it.target != null ? sonae.find((q) => q.id === it.target)?.b?.real : null;
    // 11/21 司令塔の決め：本人の側の備の陣形は本人が布陣で選んだ物を AI が替えない（替えるのは陣形の命令だけ）。替えてよいのは相手の AI の側と、切断で AI が継いだ備
    aiJin(rt, o.jin, st, B.real, it, me, fg, S.team === 0 && !S.byAI);
    if (!Lv?.noTactic) aiTactic(rt, o.tac, S, P.team, st, P, view);   // 初級は戦法を使わない
  }
}
// K634 ②（kaito 11/22「設楽原の守り手が馬防柵から出て来る」）：筋書きの地の動き。F は match.js STORY_FIELDS の ai（世界の x の線・内の向き）
//   守り手：柵の内で鉄砲・弓で受け、敵が柵へ取り付いた（柵の外 push m 内）時だけ槍・騎馬が柵の際まで出て押し返す。外に出た隊は内へ戻る。
//   攻め手：柵へ寄せる。騎馬の隊と三つに一つの隊は柵の端を回り込む。車懸り（川中島）：四十秒斬り合った隊は退き、空いた隊が同じ敵へ替わる
export function fieldStep(F, P, it, me, pub, t, st, stMap, g) {
  const def = P.team === F.defTeam;
  if (F.line != null) {
    const dep = (p) => (p.x - F.line) * F.inSign;   // 柵の内への深さ（内が正）
    const inside = (p, d) => ({ x: dep(p) >= d ? p.x : F.line + d * F.inSign, z: p.z });
    if (def) {
      if (g && g._fSeek == null) { g._fSeek = g.seekRange ?? 45; g.seekRange = Math.min(g._fSeek, 14); }   // 柵越しに遠くの敵へ斬り掛からない
      const tg = it.target != null ? pub.find((q) => q.id === it.target) : null;
      const atFence = tg && dep(tg.pos) > -(Math.abs((F.outer ?? F.line) - F.line) + F.push);
      if ((it.id === 'attack' || it.id === 'charge') && atFence && me.kind !== 'gun' && me.kind !== 'bow') return { ...it, id: 'attack', to: inside(tg.pos, 2), why: '柵で押し返す' };
      if (dep(P.pos) < -3 && !P.engaged) return { id: 'move', to: inside(P.pos, 8), why: '柵の内へ戻る' };
      if (it.to && dep(it.to) < 4 && it.id !== 'retreat' && it.id !== 'rest') return { id: 'hold', to: inside(P.pos, 6), why: '柵の内で受ける' };
      return it;
    }
    if (F.ends && (it.id === 'attack' || it.id === 'charge') && !me.honjin) {
      const tg = it.target != null ? pub.find((q) => q.id === it.target) : null;
      if (!tg || dep(tg.pos) < -Math.abs((F.outer ?? F.line) - F.line)) return it;   // 柵の外の列より内の敵へ向かう時だけ
      if (st.flank === undefined) st.flank = me.kind === 'cavalry' || [...String(P.S.id ?? P.S.taisho)].reduce((a, c) => a + c.charCodeAt(0), 0) % 3 === 1 ? (Math.abs(P.pos.z - F.ends[0]) < Math.abs(P.pos.z - F.ends[1]) ? 0 : 1) : null;
      if (st.flank == null || st.flankDone) return it;
      const e = F.ends[st.flank], mid = (F.ends[0] + F.ends[1]) / 2, wp = { x: (F.outer ?? F.line) - F.inSign * 14, z: e + Math.sign(e - mid) * 25 };
      if (Math.hypot(P.pos.x - wp.x, P.pos.z - wp.z) > 20) return { id: me.kind === 'cavalry' ? 'charge' : 'move', to: wp, why: '柵を回り込む' };
      st.flankDone = true; return it;
    }
    return it;
  }
  if (F.kuruma && !def && !me.honjin) {
    if (st.kurumaT > t && st.kurumaTg != null) { const tg = pub.find((q) => q.id === st.kurumaTg && !q.routed && q.strength > 0); if (tg) return { id: me.kind === 'cavalry' ? 'charge' : 'attack', target: tg.id, to: tg.pos, why: '車懸りで替わる' }; }
    if (st.kurumaOut > t) return { id: 'retreat', to: st.kurumaTo, why: '車懸りで退く' };
    // 斬り合いの続き：四秒より短い途切れは続けて数える（斬り合いの印は一秒ごとに揺れる）
    if (P.engaged) { st.kEng = (st.kLastT != null && t - st.kLastT < 4 ? st.kEng || 0 : 0) + (st.kLastT != null && t - st.kLastT < 4 ? t - st.kLastT : 0); st.kLastT = t; }
    if (P.engaged && st.kEng > 35) {
      const foe = pub.filter((q) => q.team !== P.team && !q.routed && q.strength > 0).sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
      const fresh = foe && pub.filter((q) => q.team === P.team && q !== P && !q.engaged && !q.routed && q.strength > 0 && !(q.S.line === 'honjin' || q.S.major) && (q.fatigue || 0) < 50 && Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) < 160)
        .sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
      const fs = fresh && stMap.get(fresh.S);
      if (fs) {
        fs.kurumaT = t + 25; fs.kurumaTg = foe.id;
        const L = Math.hypot(foe.pos.x - P.pos.x, foe.pos.z - P.pos.z) || 1;
        st.kurumaOut = t + 15; st.kEng = 0; st.kurumaTo = { x: P.pos.x - (foe.pos.x - P.pos.x) / L * 40, z: P.pos.z - (foe.pos.z - P.pos.z) / L * 40 };
        return { id: 'retreat', to: st.kurumaTo, why: '車懸りで退く' };
      }
    }
  }
  return it;
}
// 下知と性格で陣形を選ぶ（要件書：陣形は並びと動きを変えるだけで強さは変えない）。二十秒に一度まで替える（揺れない）
//   攻め：積極＝魚鱗（一点を破る）・戦術と機動で数が足りる時＝鶴翼（包む）・ほか横陣／受け・守り：防御で敵が四十m 内＝方円・ほか横陣／
//   動き（追う・回る・退く・休む・前へ）：縦陣（速い）
export function jinFor(it, me) {
  const P = me.persona || {}, k = String(P.key || '');
  if (it.id === 'attack' || it.id === 'charge' || it.id === 'rescue') {
    if (/^AGGRESSIVE/.test(k)) return '魚鱗';
    if (/^(TACTICAL|MOBILE)/.test(k) && (me.strength || 0) >= (it.foeStrength || 0)) return '鶴翼';
    return '横陣';
  }
  if (it.id === 'hold' || it.id === 'fire') return /^DEFENSIVE/.test(k) && it.foeNear ? '方円' : '横陣';
  return '縦陣';
}
function aiJin(rt, jin, st, g, it, me, fg, keep) {
  if (!jin?.applyJin || !g?.units) return;
  // 布陣の画面で選んだ陣形を先に付け、それを「替えた」に数える（33 11/21：AI の毎コマが jinTick より先に回り、始めの一コマで AI の陣形が付いて
  //   jinFromMatch が付いている隊を飛ばすため、布陣で選んだ鶴翼・方円・長蛇などが一つも出ず、二人の対戦でも両方の画面で横陣・魚鱗になっていた）。
  //   選んだ陣形は少なくとも二十秒は保ち、その後は今まで通り性格と下知で替える
  if (st.jinT === undefined) { if (!g.jin) jin.jinFromMatch?.(rt); if (g.jin) st.jinT = rt.t || 0; }
  if (st.jin0 === undefined && g.jin) st.jin0 = g.jin;   // 布陣で選んだ陣形（受けに戻る時の元）
  // 26 の見つけ：持ち場（hold）を横陣にしていたので、選んだ縦陣・鶴翼・魚鱗が二十五秒で全部横陣になった。持ち場では選んだ陣形のまま（防御の型が敵に迫られた時だけ方円）、
  //   長い動き（六十m より先）だけ縦陣、攻めは性格の陣形
  let want = jinFor({ ...it, foeStrength: fg ? (fg.count || 0) * 10 : 0, foeNear: it.why === '受ける' || me.engaged }, me);
  if ((it.id === 'hold' || it.id === 'fire') && want !== '方円') want = st.jin0 || g.jin || want;
  if (want === '縦陣' && !(it.to && me.pos && Math.hypot(it.to.x - me.pos.x, it.to.z - me.pos.z) > 60)) want = st.jin0 || g.jin || want;
  if (!keep && g.jin !== want && (rt.t || 0) - (st.jinT ?? -99) >= 20) { jin.applyJin(g, want); st.jinT = rt.t || 0; }
  if ((it.id === 'attack' || it.id === 'charge') && fg && jin.jinAttack && st.jinFoe !== fg) { jin.jinAttack(rt, g, fg); st.jinFoe = fg; }
}
// 武将の固有戦術（31 BUSHO_TACTIC）：使える時に使う。ただし性格で使い所を選ぶ（積極＝当たったらすぐ・慎重と防御＝押されてから・戦術＝味方の誰かが斬り合ってから）
// 31 の aiUse が先に使った時（『使い切った』）も st.tacUsed を立て、誘いをやめる
function aiTactic(rt, tac, S, team, st, P, view) {
  const id = tac?.tacticIdOf?.(S.taisho) || tac?.BUSHO_TACTIC?.[S.taisho];   // K601 14：固有戦術の表に無い武将も戦法（主兵種から・tactics.js）を使う
  if (!id || !tac.useTactic || !tac.tacticReady || (rt.t || 0) - (st.tacTryT ?? -99) < (id === 'tsurinobuse' || id === 'akazonae' ? 1 : 5)) return;   // 赤備えは空いた一瞬を逃さない
  st.tacTryT = rt.t || 0;
  const k = String(st.persona.key || '');
  const pressed = (P.morale ?? 100) < 60 || (view.friends || []).some((f) => f.engaged && (f.morale ?? 100) < 60);
  // 赤備突撃は『空いた騎馬』が要る（K603・11/21 k592）：積極の型は斬り合っている時だけ試していたので、条件と食い違い一度も出なかった。空いている間に、味方が当たっている時に試す
  const cavFree = id === 'akazonae' ? (() => { const us = S.b?.real?.units || []; let n = 0, f = 0; for (const u of us) { if (!u.alive) continue; n++; if (u.target?.alive && Math.hypot(u.target.pos.x - u.pos.x, u.target.pos.z - u.pos.z) < 3.5) f++; } return n > 0 && f / n < 0.25; })() : false;
  const when = id === 'tsurinobuse' ? true : id === 'akazonae' ? cavFree && (view.friends || []).some((f) => f.engaged) : /^AGGRESSIVE/.test(k) ? P.engaged : /^(CAUTIOUS|DEFENSIVE|LOYAL)/.test(k) ? pressed : (P.engaged || (view.friends || []).some((f) => f.engaged));
  if (!when) return;
  // 釣り野伏は退く隊（家久）と伏兵（同じ側の別の隊）の両方を見るので、その側の全部の組で調べる
  const own = id === 'tsurinobuse' ? undefined : S.b?.real ? [S.b.real] : undefined;
  try { const rd = tac.tacticReady(rt, team, id, own); st.tacWhy = rd?.ok ? 'ok' : rd?.why; if (rd?.why === '使い切った' && !(st.tacUsed > 0)) { st.tacUsed = 1; (rt._gaiLog || (rt._gaiLog = [])).push({ t: Math.round(rt.t || 0), team, taisho: S.taisho, tac: id + '（31 の自動）' }); } if (rd?.ok && tac.useTactic(rt, team, id, own)) { st.tacUsed = (st.tacUsed || 0) + 1; (rt._gaiLog || (rt._gaiLog = [])).push({ t: Math.round(rt.t || 0), team, taisho: S.taisho, tac: id }); } } catch (e) { /* 戦術が使えなくても試合は止めない */ }
}
// 確かめ・戦況図のため：今の各隊の AI の下知と疲れと弾（試合の札には出さない）
export function matchAiState(rt) {
  const M = rt._gai; if (!M) return [];
  return [...M.st.entries()].map(([S, st]) => ({ id: S.id, team: S.team, taisho: S.taisho, persona: st.persona.key, fatigue: Math.round(st.fatigue), ammo: st.ammo ? Math.round(st.ammo.ammo) : null, why: st.last?.why || null, tacWhy: st.tacWhy || null }));
}
