// K590②（オンライン PvP・docs/online_final_1120.md 14〜20）4武将×1,000（4,000 vs 4,000）を携帯で軽く動かす土台・クラウド k365-cloud-32（11/21）
//   工程：docs/online_plan_1121.md（cloud-18）。32＝見た目の段（近・中・遠・奥）、37＝重さと記憶（遠景の塊 pvp_army.js）。割り方の紙 docs/online_lod_1121.md
//   一武将＝一つの備（sonae.js）＝一つの部隊（butai.js）。部隊は名目の兵数（UNIT_STRENGTH=1000）を持ち、
//   近い・戦っている時だけ本物の兵（nearReal）、遠い時は少しの本物（farReal）＋軽い大軍（world.addDistantArmy）で数だけ押し合う。
//   本物の合計は butai.js の BUTAI_REAL_CAP（235・記憶の予算の内）。名目の数はいつも 本物＋軽い の合計（兵が消えたり増えたりしない）。
//   勝ち負けの数は名目で数える（本物が斬られれば名目が減り、軽い同士は lightClash で数が減る）。
import { makeSonae } from '../sonae.js';
import { MEM_TIGHT } from '../settings.js';
import { butaiTick, lightClash } from '../butai.js';
import { sonaeTick } from '../sonae.js';
import { army4kPeople } from '../pvp_army.js';
import { cavalryVanguard, cavalryVanguardTick } from '../mass_charge.js';   // 騎馬だけを先に突撃（三方ヶ原と同じ）   // 37：軽い大軍の並び（型ごとの備の形・兵種の場所・幟の林）

export const UNIT_STRENGTH = 1000;
// オンラインの隊どうしの減りの速さ（1＝筋書きの戦と同じ）。一戦を十二〜十八分に（online_final 87・MATCH_LENGTH 900）
export const PVP_PACE = 0.16;
// 相手の本陣へ寄せる一手を出してよい時刻（秒）。一戦を十二〜十八分に
export const PUSH_AFTER = 600;

// 兵の型（online_final 70〜72：槍20〜70%・鉄砲0〜40%・弓0〜30%・騎馬0〜40%・旗本5〜15%）。旗本は侍（samurai）で持つ
export const MIX4K = {
  標準: { ashigaru: 0.45, samurai: 0.1, gun: 0.2, bow: 0.1, cavalry: 0.15 },
  槍重視: { ashigaru: 0.65, samurai: 0.1, gun: 0.1, bow: 0.05, cavalry: 0.1 },
  鉄砲重視: { ashigaru: 0.35, samurai: 0.1, gun: 0.4, bow: 0.1, cavalry: 0.05 },
  騎馬重視: { ashigaru: 0.35, samurai: 0.1, gun: 0.1, bow: 0.05, cavalry: 0.4 },
  守備重視: { ashigaru: 0.55, samurai: 0.15, gun: 0.2, bow: 0.1, cavalry: 0 },
};

// 本物の人形の数（見た目の段）：霧の手前（約92m）は見せかけの兵を描かない決まり（flat_rule.js・kaito 10/28）なので、近くの大軍は本物の人形で見せる。
//   一隊 遠くても 140・近く 170（本人の武将 200）。八隊で 1,150〜1,450（今の戦の 2,100〜2,550 体より少ない）。一人ずつ考えるのは units.js の REALCAP（250）まで、
//   あふれた者は farSim（GPU 任せ）。部隊の本物の合計の上限は rt.butaiRealCap（REAL4K.cap）。名目の残り（1,000 − 本物）は軽い大軍（霧の先だけ描く）で数を持つ
//   11/21 iPhone 高の真似（tight=1・CPU 4倍遅く）で 1,450 は関ヶ原より重かった（実働 中央89ms 対 55ms・描く 299 対 191・記憶 473MB 対 460MB）。
//   司令塔の決め：一コマ20ms・描く300・記憶が関ヶ原以下に収まらなければ本物を 600 ほどに減らし、遠い隊は霧の手前でも見える軽い塊（37・flat_rule のオンラインだけの例外）で見せる
// 11/21 クラウド k365-03（司令塔の決め・K564 重くないが先）：携帯は本物 420（mine90・near60・far35）、パソコンは 600 のまま。
//   描かず・携帯の見なしの模擬合戦 200秒：本物600 で1コマ 17〜55ms（33ms 超 40コマ中10）→ 本物420 で多くは 10〜13ms（tools/online_prof.mjs）
export const REAL4K = MEM_TIGHT ? { mine: 90, near: 60, far: 35, cap: 420 } : { mine: 120, near: 90, far: 50, cap: 600 };
// 軽い大軍（見せかけ）の人数（一隊）：携帯 450・パソコン 600（cloud-32・本物が減った分を遠目で薄く見せない）
export const LIGHT4K = MEM_TIGHT ? 450 : 600;

// roster：[{ name: '柴田勝家', side: 0|1, flag, faction, armor, x, z, facing, type: '標準', nominal: 1000, mine: true, line, slot }]
export function army4kLayout(roster) {
  return roster.map((g, i) => ({
    id: g.id || `${g.side}_${g.name}`, name: g.label || `${g.name}の備`, team: g.side ? 1 : 0,
    faction: g.faction, flag: g.flag, armor: g.armor, taisho: g.name, fuku: g.fuku || null,
    line: g.line ?? (g.major ? 'honjin' : 1), slot: g.slot || ['left', 'center', 'right'][i % 3], major: !!g.major,
    nominal: g.nominal || UNIT_STRENGTH, mix: MIX4K[g.type] || MIX4K.標準,
    at: { x: g.x, z: g.z }, facing: g.facing || 0,
    nearReal: g.mine ? REAL4K.mine : REAL4K.near, farReal: REAL4K.far, real: REAL4K.far,
    // 11/21 司令塔：携帯の本物は 420（03 が REAL4K を入れる）。減った本物の分が遠目で薄く見えないよう、携帯の軽い大軍の人数を 300→450 に（パソコンは 600 のまま）。
    //   軽い大軍は霧の先だけ・型の束ね描き（描く回数は増えない）。本物 180 人分の骨の人が減った三角の内に収まる
    lightPeople: (b) => army4kPeople({ x: b.pos.x, z: b.pos.z, facing: b.facing, type: g.type, mix: MIX4K[g.type] || MIX4K.標準, seed: b.id, n: LIGHT4K }),
  }));
}

export function army4kSpawn(rt, roster) {
  rt.butaiRealCap = REAL4K.cap;
  return army4kLayout(roster).map((o, i) => { const S = makeSonae(rt, o); S._type4k = roster[i].type || '標準'; S.b.pvp = true; S._mine = !!roster[i].mine; return S; });
}

// 毎コマ：部隊（本物と軽いの入れ替え）・備の状態・遠い（軽い）備どうしの数の押し合い（三十m 内）
export function army4kTick(rt, dt, o = {}) {
  // 11/21 cloud-32（本人を含めた模擬合戦で本人の側だけ崩れる元）：取り代わり（command.js takeOverGeneral）は移る先の武将の体を『消えた者』にして
  //   本人をその所へ置く。備はそれを『大将が討たれた』と見て混乱・退きに入り、本人が取り代わるたびに本人の側の隊が一つずつ崩れていた。
  //   大将の体が消えた所（一歩半の内）に本人が立っていれば、本人をその備の大将に付け替える（備は崩れない）
  { const me = rt.player?.u;
    if (me?.alive) for (const S of rt.sonae || []) {
      const T = S.b?.taishoU, g = S.b?.real;
      if (!(T && T !== me && T.gone && S.team === me.team && !S.taishoDead && Math.hypot(T.pos.x - me.pos.x, T.pos.z - me.pos.z) < 1.5)) continue;
      // 本人を大将の座に置くと、組の頭（g.leader）が本人になり、隊が本人の歩く所へ引っ張られた（本人役の bot が隅へ行くと隊ごと戦から離れ、本人の側だけ兵が減った）。
      //   隊の中の侍（いなければ足軽）を新しい大将に立てる（備は崩れず、組の頭も隊の中に残る）
      const nu = g?.units?.find((u) => u.alive && !u.gone && u !== me && (u.type === 'samurai' || u.type === 'cavalry')) || g?.units?.find((u) => u.alive && !u.gone && u !== me);
      S.b.taishoU = nu || null; if (g) { g.leader = nu || null; if (g.leader === me) g.leader = null; }
    }
    // 本人が組の頭になった隊は外す（前の付け替えの残り・取り代わりの後）
    for (const g of rt.army?.groups || []) if (g.leader === me && !g.isPlayerSquad && me) g.leader = null; }
  butaiTick(rt, dt);
  sonaeTick(rt, dt);
  // 11/21 cloud-47（模擬合戦10回で接敵から十秒で潰走・名目は1000中80しか減らず）：本物の組（50〜120人）は名目1000の備の前の者だけなので、
  //   一人討たれた時の士気の落ち（army_combat：100/(initial+reserveCount)）を名目の数で割る＝描かれていない後ろの兵を控え（reserveCount）に数える
  // 11/21 cloud-47（同じ家どうしで片方が6戦6勝）：butai は本人の70m 内か攻めの隊を本物（nearReal）にする。本物の斬り合いは軽い押し合いより強いので、
  //   本人の立つ側（本人の隊は mine でさらに多い）だけが強くなっていた。試合では本人の居場所で数を変えず、攻めている隊だけを同じ数（near）の本物にする（両軍同じ決まり）
  for (const S of rt.sonae || []) { const B = S.b; if (!B) continue; const busy = B.cmd?.id === 'attack' || B.cmd?.id === 'charge' || B.cmd?.id === 'assault' || (rt.t - (B._clashAt ?? -99)) < 3; B.wantReal = busy ? Math.min(B.nearReal, REAL4K.near) : B.farReal; }
  for (const S of rt.sonae || []) { const g = S.b?.real; if (g?.count) { g.pvpBack = true; g.reserveCount = Math.max(0, Math.round(S.b.aliveNominal() - g.count)); } }
  // 11/21 cloud-32（47：一戦が2分半〜6分半で目当ての12〜18分に遠い。描かずの模擬合戦で 363秒）：オンラインの隊どうしの減りだけを PVP_PACE 倍に。
  //   本物どうしの斬り合い（army_combat の g.dmgMult＝本人でない相手への一太刀）と、遠い隊どうしの数の押し合い（lightClash）。
  //   本人に当たる一太刀（dmgMultPlayer）と本人が与える一太刀は変えない（本人の斬り合いの手応えは同じ）
  for (const S of rt.sonae || []) { const g = S.b?.real; if (g && g._paceSet !== PVP_PACE) { g.dmgMultPlayer = g.dmgMultPlayer ?? (g.dmgMult ?? 1); g.dmgMult = (g.dmgMult ?? 1) * PVP_PACE / (g._paceSet || 1); g._paceSet = PVP_PACE; } }
  for (const g of rt.army?.groups || []) if (g._ownerB && g._paceSet !== PVP_PACE) { g.dmgMultPlayer = g.dmgMultPlayer ?? (g.dmgMult ?? 1); g.dmgMult = (g.dmgMult ?? 1) * PVP_PACE; g._paceSet = PVP_PACE; }
  typeTick(rt);
  pushTick(rt);
  followTick(rt);
  honjinGuardTick(rt);
  const L = rt.sonae || [], R = o.clashR ?? 30;
  for (const a of L) {
    if (a.team !== 0 || a.state === '敗走') continue;
    for (const e of L) {
      if (e.team !== 1 || e.state === '敗走') continue;
      if (Math.hypot(a.b.pos.x - e.b.pos.x, a.b.pos.z - e.b.pos.z) < R) lightClash(a.b, e.b, dt, PVP_PACE);
    }
  }
}

// 兵種の隊の動き（11/21 K590②）：一つの備の本物は兵種が混ざった一つの組（butai の real）。そのままだと
//   ① 騎馬は徒の歩調で並足のまま寄り、組が敵を見つける間合い（十四歩）と突撃の間合い（七歩より先）が狭く、突撃がほとんど起きない（8隊の試しで 150秒に 3騎）
//   ② 槍重視・守備重視の備も横並び（line）のまま。
//   半秒ごとに：槍重視・守備重視の備は槍衾（yari）に。斬り合いへ出た備（attack）の名の無い騎馬が八騎以上いて、敵が六十歩内に来たら、
//   その騎馬だけを一つの騎馬の塊に分けて先に突撃させる（mass_charge.js cavalryVanguard・三方ヶ原と同じ形）。兵は足さない・強さも変えない。
//   名目の数を合わせる：分けた騎馬は部隊（butai）の『討たれた数』に数えず（_prevRealAlive を移した数だけ下げる）、騎馬の塊で討たれた分を部隊の lost へ足す
const YARI_TYPES = new Set(['槍重視', '守備重視']);
function typeTick(rt) {
  const A = rt.army; if (!A) return;
  // 騎馬の塊で討たれた分を元の部隊へ（毎コマ）
  for (const g of A.groups) {
    const B = g._ownerB; if (!B) continue;
    const n = g.count, d = Math.max(0, (g._prevN ?? n) - n); g._prevN = n;
    if (d) B.lost = Math.min(B.nominal, B.lost + d);
  }
  cavalryVanguardTick(rt);
  if (rt._a4kTypeT > A.time) return; rt._a4kTypeT = A.time + 0.5;
  for (const S of rt.sonae || []) {
    const G = S.b?.real; if (!G || G.routed || !G.hasLive?.()) continue;
    if (YARI_TYPES.has(S._type4k) && G.formation !== 'yari' && G.order !== 'retreat' && G.order !== 'flee') G.formation = 'yari';
    if (G.order !== 'attack' || S._cavSplitT > A.time || S._cavVan?.count >= 4) continue;   // 前の騎馬の塊が残る間は分けない
    let riders = 0; for (const u of G.units) if (u.alive && !u.gone && u.mounted && !u.name && u.type === 'cavalry') riders++;
    if (riders < 8) continue;
    const lead = G.units.find((u) => u.alive && !u.gone && u.mounted && !u.name);
    const e = lead && A.nearestEnemy(lead, 60, (q) => !q.isStruct && !q.fleeing);
    if (!e) continue;
    S._cavSplitT = A.time + 20;   // 一つの備から二十秒に一度まで
    const before = G.count;
    const sg = cavalryVanguard(rt, [G], { x: e.pos.x, z: e.pos.z }, { name: `${S.taisho}の騎馬`, min: 8 });
    if (!sg) continue;
    const moved = before - G.count;
    S.b._prevRealAlive = Math.max(0, (S.b._prevRealAlive || 0) - moved);
    sg._ownerB = S.b; sg._prevN = sg.count; S._cavVan = sg;
  }
}

// 11/21 cloud-32（司令塔：450秒から先、残った隊が本陣を攻めず時間切れまで止まる）：オンラインだけ、
//   ① 相手の前線（第一線の備）が全部崩れるか、生きた兵が三割を切った時、② 360秒を過ぎて自分の側が四十五秒どこも斬り合っていない時、
//   本陣と本人の隊を除く残りの隊に『相手の本陣へかかれ』を下知する（sonae の order。47 の AI は AI が出したのでない下知を命令として守る）。二十秒ごとに本陣の居所へ向け直す
// 11/21 cloud-32（司令塔：本人を含めた模擬合戦で本人の側だけ早く崩れる）：本人の隊（名目1,000）は AI に掛からず、本人が前へ出ても持ち場で待ったまま
//   （本人の側は実質三隊で戦っていた）。オンラインだけ、本人の四十 m 内に敵の備が来たら、本人の隊もそこへかかる（本人について歩かせはしない）。
//   本人が使番で命令を出した間（command.js の g._plOrder・三十秒）は命令を守る
function followTick(rt) {
  const L = rt.sonae || [], t = rt.t || 0, me = rt.player?.u;
  if (!me?.alive || rt._a4kFolT > t) return; rt._a4kFolT = t + 2;
  for (const S of L) {
    if (!(S.b.taishoU ? S.b.taishoU === me : S._mine) || S.line === 'honjin' || S.major || S.state === '敗走' || S.state === '混乱' || S.b.aliveNominal() <= 0) continue;   // 本陣（総大将の隊）は本人について前へ出ない（本陣が崩れれば負け）
    const g = S.b.real; if (g?._plOrder && t - (g._plOrder.t ?? -99) < 30) continue;
    let foe = null, fd = 40;
    for (const E of L) { if (E.team === S.team || E.state === '敗走' || E.b.aliveNominal() <= 0) continue; const d = Math.hypot(E.b.pos.x - me.pos.x, E.b.pos.z - me.pos.z); if (d < fd) { fd = d; foe = E; } }
    if (foe) { if (S.b.cmd?.id !== 'charge' || S._folFoe !== foe || S._folT < t) { S._folFoe = foe; S._folT = t + 10; S.order({ id: 'charge', to: { x: foe.b.pos.x, z: foe.b.pos.z }, target: foe.b }); } continue; }
    S._folFoe = null;
    // 本人について歩かせる決まりは外した（本人役の bot が地図の隅へ歩くと隊が引っ張られて戦から離れ、本人の側だけ少なくなった）。敵が近くにいない間は AI（47）と使番に任せる
  }
}

// 11/21 cloud-32（40 の6回：本人を含めると本人の側の負け5/6・本陣の備が崩れて負け。司令塔：本陣は持ち場を守る）：
//   本人の側の本陣（総大将の備）は AI に掛からず立つだけ、相手の本陣は AI が前へ打って出る、と両軍で違っていた（AI に任せると本陣が出て崩れ、決着が早すぎた）。
//   オンラインだけ、両軍の本陣は持ち場から六十 m 内に来た敵の備だけを迎え撃ち（charge）、いなくなれば持ち場へ戻る（move）。
//   相手の本陣にも同じ下知を出す（47 の AI は AI が出したのでない下知を命令として守る）。本人が使番で命令した三十秒は命令を守る
function honjinGuardTick(rt) {
  const L = rt.sonae || [], t = rt.t || 0;
  if (!L.length || rt._a4kHgT > t) return; rt._a4kHgT = t + 2;
  for (const H of L) {
    if (!(H.line === 'honjin' || H.major) || H.state === '敗走' || H.state === '混乱' || H.b.aliveNominal() <= 0) continue;
    const g = H.b.real; if (g?._plOrder && t - (g._plOrder.t ?? -99) < 30) continue;
    const home = H._home || (H._home = { x: H.b.pos.x, z: H.b.pos.z });
    let foe = null, fd = 60;
    for (const E of L) { if (E.team === H.team || E.state === '敗走' || E.b.aliveNominal() <= 0) continue; const d = Math.hypot(E.b.pos.x - home.x, E.b.pos.z - home.z); if (d < fd) { fd = d; foe = E; } }
    if (foe) { if (H._hgFoe !== foe || !(H._hgT > t)) { H._hgFoe = foe; H._hgT = t + 8; H.order({ id: 'charge', to: { x: foe.b.pos.x, z: foe.b.pos.z }, target: foe.b }); } continue; }
    if (H._hgFoe || Math.hypot(H.b.pos.x - home.x, H.b.pos.z - home.z) > 15) { if (!(H._hgT > t)) { H._hgFoe = null; H._hgT = t + 6; H.order({ id: 'move', to: { x: home.x, z: home.z } }); } }
  }
}

function pushTick(rt) {
  const L = rt.sonae || [], t = rt.t || 0;
  if (!L.length || rt._a4kPushT > t) return; rt._a4kPushT = t + 2;
  const P = rt._a4kPush || (rt._a4kPush = { quiet: [t, t] });
  for (const team of [0, 1]) {
    const mine = L.filter((S) => S.team === team), foe = L.filter((S) => S.team !== team);
    if (mine.some((S) => S.state === '交戦中')) P.quiet[team] = t;
    const foeFront = foe.filter((S) => S.line === 1);
    const frontDown = foeFront.length > 0 && foeFront.every((S) => S.state === '敗走' || S.b.aliveNominal() < S.b.nominal * 0.3);
    const stalled = t > 600 && t - P.quiet[team] > 45;
    // 本陣へ寄せるのは十分（PUSH_AFTER 600秒）を過ぎてから（前線が崩れてすぐ本陣が落ち、一戦が十分を切っていた。本人役の bot の模擬合戦 577〜735秒）
    if (t < PUSH_AFTER || (!frontDown && !stalled)) continue;
    const H = foe.find((S) => S.state !== '敗走' && (S.line === 'honjin' || S.major)) || foe.find((S) => S.state !== '敗走' && S.b.aliveNominal() > 0);
    if (!H) continue;
    for (const S of mine) {
      if (S._mine || S.line === 'honjin' || S.major || S.state === '敗走' || S.state === '混乱' || S.b.aliveNominal() <= 0) continue;
      if (S._pushT > t) continue;
      S._pushT = t + 20;
      S.order({ id: 'charge', to: { x: H.b.pos.x, z: H.b.pos.z }, target: H.b });
    }
  }
}

// 両軍の名目の人数（HUD の両軍の人数の札）
export function army4kNominal(rt) {
  const n = [0, 0];
  for (const S of rt.sonae || []) n[S.team ? 1 : 0] += S.b.aliveNominal();
  return n;
}
