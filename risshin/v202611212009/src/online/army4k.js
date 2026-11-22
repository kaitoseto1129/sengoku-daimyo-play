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
import { bushouByName } from './bushou_online.js';
import { unitOf } from './unit_type.js';   // K601：武将の主兵種は編成の画面と同じ一つの元（k598-tonya の unit_type.js）
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

// K601（kaito 11/21・docs/kaito_online_units_1121.md 1〜6・68〜70）：一人の武将＝主兵種一つの約千人隊。騎馬の将は騎馬だけ・鉄砲の将は鉄砲だけ・槍の将は槍だけ。
//   侍（samurai）は武将の回りの旗本（五分）だけで、ほかは全部その兵種。布陣で選んだ型（標準・槍重視…）ではなく、武将で決まる（同じ兵種を何隊並べてもよい）
export const HEISHU_MIX = {
  槍: { ashigaru: 0.95, samurai: 0.05 },
  騎馬: { cavalry: 0.95, samurai: 0.05 },
  鉄砲: { gun: 0.95, samurai: 0.05 },
  弓: { bow: 0.95, samurai: 0.05 },
};
// 主兵種 → 遠くの軽い大軍の並びの型（pvp_army.js の PVP_TYPES）と、槍衾・騎馬の先駆けの型（typeTick）
const HEISHU_SHAPE = { 槍: '槍重視', 騎馬: '騎馬重視', 鉄砲: '鉄砲重視', 弓: '標準' };
// 主兵種は online/unit_type.js の unitOf（表の unit → 弓の将の表 → fav）。編成の画面に出る兵種と戦場の兵が必ず同じになる
const UNIT_HEISHU = { kiba: '騎馬', teppo: '鉄砲', yari: '槍', yumi: '弓' };
export function heishuOf(name) { return UNIT_HEISHU[unitOf(bushouByName(name))?.id] || '槍'; }

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
  return roster.map((g0, i) => { const hs = heishuOf(g0.name), g = { ...g0, type: HEISHU_SHAPE[hs], heishu: hs }; return {
    id: g.id || `${g.side}_${g.name}`, name: g.label || `${g.name}の備`, team: g.side ? 1 : 0,
    faction: g.faction, flag: g.flag, armor: g.armor, taisho: g.name, fuku: g.fuku || null,
    line: g.line ?? (g.major ? 'honjin' : 1), slot: g.slot || ['left', 'center', 'right'][i % 3], major: !!g.major,
    nominal: g.nominal || UNIT_STRENGTH, mix: HEISHU_MIX[hs], heishu: hs,
    at: { x: g.x, z: g.z }, facing: g.facing || 0,
    nearReal: g.mine ? REAL4K.mine : REAL4K.near, farReal: REAL4K.far, real: REAL4K.far,
    // 11/21 司令塔：携帯の本物は 420（03 が REAL4K を入れる）。減った本物の分が遠目で薄く見えないよう、携帯の軽い大軍の人数を 300→450 に（パソコンは 600 のまま）。
    //   軽い大軍は霧の先だけ・型の束ね描き（描く回数は増えない）。本物 180 人分の骨の人が減った三角の内に収まる
    lightPeople: (b) => army4kPeople({ x: b.pos.x, z: b.pos.z, facing: b.facing, type: g.type, mix: HEISHU_MIX[hs], seed: b.id, n: LIGHT4K }),
  }; });
}

export function army4kSpawn(rt, roster) {
  rt.butaiRealCap = REAL4K.cap;
  return army4kLayout(roster).map((o, i) => { const S = makeSonae(rt, o); S._type4k = HEISHU_SHAPE[o.heishu] || '標準'; S.heishu = o.heishu; k603Setup(S); S.b.pvp = true; S._mine = !!roster[i].mine; return S; });
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
  k603Tick(rt);
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
    if (S.cav && S.cav !== 'READY' && S.cav !== 'CHARGING') continue;   // K603：再集合の間・疲れ切った騎馬は先駆けに出さない
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
    // K609（kaito『自軍も敵軍も攻め寄せずずっと膠着』）：始め（九十秒）の後、その側がどこも六十秒斬り合っていなければ、前の隊（本人の隊・本陣・後詰を除く）を
    //   一番近い敵の隊へ掛ける（本陣へではない＝早く決着しない）。二十秒に一度まで・両軍同じ決まり。前は十分（PUSH_AFTER）まで誰も寄せない試合があった
    if (t > 90 && t - P.quiet[team] > 60 && !(P.breakT?.[team] > t)) {
      (P.breakT ||= [0, 0])[team] = t + 20;
      for (const S of mine) {
        if (S._mine || S.line === 'honjin' || S.line === 'gotsume' || S.major || S.state === '敗走' || S.state === '混乱' || S.b.aliveNominal() <= 0) continue;
        let e = null, bd = Infinity; for (const q of foe) { if (q.state === '敗走' || q.b.aliveNominal() <= 0) continue; const d = Math.hypot(q.b.pos.x - S.b.pos.x, q.b.pos.z - S.b.pos.z); if (d < bd) { bd = d; e = q; } }
        if (e) { S.order({ id: 'attack', to: { x: e.b.pos.x, z: e.b.pos.z }, target: e.b }); S._breakAt = t; }
      }
      P.breaks = (P.breaks || 0) + 1;
    }
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

// ---- K603（kaito_online_battle_1121 54〜55）：鉄砲の弾・騎馬の状態・疲れの効き目（オンラインの試合だけ・11/21 iMac k592-net） ----
//   ① 鉄砲の弾：隊ごとに斉射の蓄え（AMMO4K 回）。鉄砲の隊は 15〜100m の敵の備へ十二秒ごとに一斉射（名目の兵を減らし、士気を揺らす。本物の鉄砲足軽が居れば火と煙も）。
//      前は本物の敵の兵が四〜九十 m に居る時だけ一人ずつ撃つ作りで、千人隊どうしの遠い間合いでは一発も撃たなかった（11/21 模擬合戦 5分で発砲0）。
//      一斉射で一つ、本物の鉄砲足軽の六十発で一つ減る。尽きれば撃てない（脇差で斬り合う）。本陣の45m 内で斬り合っていなければ半分まで戻る（補給）。
//      撃ち続ければ六分で尽きる＝撃ち放題にしない。残りは S.ammoPct（0〜100）と部隊の stat() の『弾』
//   ② 騎馬の状態（S.cav）：READY → CHARGING（駆けて寄る）→ ENGAGED（斬り合い）→ REFORMING（離れて二十秒・再集合）→ READY。疲れ七割五分で EXHAUSTED（四割まで休む）。
//      REFORMING と EXHAUSTED の間は『かかれ・駆けよ』の下知を受けず、その場で集まる（突撃の後は再集合が要る）。先駆けの騎馬の塊も出さない
//   ③ 疲れの効き目：本物の斬り合いの一太刀を疲れで最大三割五分下げる（軽い押し合いは butai が既に下げる）。開戦すぐに全軍で駆けると、着いた時に疲れて弱い
export const AMMO4K = 30;
// 隊の斉射：鉄砲 十二秒・十五〜百m・名目の1.2%／弓 十秒・十二〜八十m・0.8%。戦法『一斉射』の間（S._rapidUntil）は間を半分に詰める（弾は同じく一つずつ使う＝弾が早く減る）
const VOLLEY = { 鉄砲: { T: 12, R: [15, 100], K: 0.012, far: 70 }, 弓: { T: 10, R: [12, 80], K: 0.008, far: 55 } };
function volleyTick(rt, A, S, B, g, kind) {
  const V = VOLLEY[kind], gun = kind === '鉄砲';
  if ((gun && !(S.ammoLeft >= 1)) || S._k603eng || S.state === '敗走' || B.aliveNominal() <= 50 || S._volT > A.time) return;
  let e = null, bd = V.R[1];
  for (const q of rt.sonae || []) { if (q.team === S.team || q.state === '敗走' || !q.b || q.b.aliveNominal() <= 0) continue; const d = Math.hypot(q.b.pos.x - B.pos.x, q.b.pos.z - B.pos.z); if (d >= V.R[0] && d < bd) { bd = d; e = q; } }
  if (!e) return;
  const fat = 1 - 0.35 * Math.max(0, Math.min(1, B.fatigue || 0)), far = bd > V.far ? 0.6 : 1;   // 遠いほど当たらない・疲れで落ちる
  const kill = Math.min(e.b.aliveNominal(), V.K * B.aliveNominal() * fat * far * Math.max(0.3, (B.morale || 70) / 100));
  e.b.lost = Math.min(e.b.nominal, e.b.lost + kill);
  const mh = (gun ? 1.5 : 1.1) * 85 * kill / e.b.nominal; e.b.morale = Math.max(5, e.b.morale - mh); if (e.b.real?.count) e.b.real.morale = Math.max(5, e.b.real.morale - mh);
  if (gun) S.ammoLeft = Math.max(0, S.ammoLeft - 1);
  S._volT = A.time + V.T * (S._rapidUntil > A.time ? 0.5 : 1) / Math.max(0.5, fat); S.volleys = (S.volleys || 0) + 1;
  if (gun) try { if (g?.count && A.scriptSalvo) A.scriptSalvo(g, e.b.real ? [e.b.real] : [], 8, V.R[1]); } catch (x) { /* 火と煙が出なくても数は減らす */ }
}
const CAV_REFORM = 20;
function k603Setup(S) {
  const B = S.b; if (!B) return;
  if (S.heishu === '鉄砲') { S.ammoLeft = AMMO4K; S.ammoPct = 100; B.ammoPct = 100; }
  if (S.heishu === '騎馬') { S.cav = 'READY'; B.cavState = 'READY'; }
  const o0 = B.order.bind(B);
  B.order = (c) => {
    if (S.heishu === '騎馬' && (S.cav === 'REFORMING' || S.cav === 'EXHAUSTED') && c && (c.id === 'charge' || c.id === 'attack' || c.id === 'assault') && !S._k603eng) {
      S.cavDenied = (S.cavDenied || 0) + 1;
      return o0({ id: 'hold', to: null });
    }
    return o0(c);
  };
}
function k603Tick(rt) {
  const A = rt.army; if (!A || rt._k603T > A.time) return;
  const dt = A.time - (rt._k603T0 ?? A.time); rt._k603T0 = A.time; rt._k603T = A.time + 0.5;
  for (const S of rt.sonae || []) {
    const B = S.b, g = B?.real; if (!B) continue;
    let eng = 0;
    for (const u of g?.units || []) if (u.alive && !u.gone && u.target?.alive && Math.hypot(u.pos.x - u.target.pos.x, u.pos.z - u.target.pos.z) < 4 && ++eng >= 3) break;
    S._k603eng = eng >= 3 || (rt.t - (B._clashAt ?? -99)) < 2;   // 本物の斬り合いか、遠い隊どうしの押し合い（lightClash）
    // ③ 疲れの効き目
    if (g) { const f = 1 - 0.35 * Math.max(0, Math.min(1, B.fatigue || 0)), old = g._fatMul || 1; if (Math.abs(f - old) > 0.01) { g.dmgMult = (g.dmgMult ?? 1) * f / old; g._fatMul = f; } }
    // ① 鉄砲の弾
    if (S.ammoLeft != null) {
      for (const u of g?.units || []) {
        if (u.type !== 'gun' || !u.alive) continue;
        const a = u.gunAmmo ?? 20;
        if (u._ga != null && a < u._ga) { S._shotAcc = (S._shotAcc || 0) + (u._ga - a); while (S._shotAcc >= 60) { S._shotAcc -= 60; S.ammoLeft = Math.max(0, S.ammoLeft - 1); } }
        if (S.ammoLeft <= 0) u.gunAmmo = 0;
        else if (a < 5) u.gunAmmo = 20;   // 蓄えから込め直す（撃った数は上で蓄えから引く）
        u._ga = u.gunAmmo ?? 20;
      }
      volleyTick(rt, A, S, B, g, '鉄砲');
      const H = (rt.sonae || []).find((q) => q.team === S.team && q.line === 'honjin');
      if (!S._k603eng && H && H !== S && H.b && Math.hypot(H.b.pos.x - B.pos.x, H.b.pos.z - B.pos.z) < 45 && S.ammoLeft < AMMO4K * 0.5) S.ammoLeft = Math.min(AMMO4K * 0.5, S.ammoLeft + dt / 4);
      S.ammoPct = B.ammoPct = Math.round(S.ammoLeft / AMMO4K * 100);
    }
    // 弓の隊も同じく隊として射る（前は鉄砲と同じく千人隊どうしの間合いで一本も射ていなかった）。矢は数えない
    if (S.heishu === '弓') volleyTick(rt, A, S, B, g, '弓');
    // ② 騎馬の状態
    if (S.cav) {
      const f = B.fatigue || 0, id = B.cmd?.id, was = S.cav;
      if (S.cav === 'EXHAUSTED' ? f > 0.4 : f > 0.75) S.cav = 'EXHAUSTED';
      else if (S._k603eng) { S.cav = 'ENGAGED'; S._freeT = A.time; }
      else if (was === 'ENGAGED' && A.time - (S._freeT ?? A.time) < 3) S.cav = 'ENGAGED';   // 三秒続けて離れてから（一瞬の途切れで抜けない）
      else if (was === 'ENGAGED') { S.cav = 'REFORMING'; S.cavUntil = A.time + CAV_REFORM * (1 + f); }
      else if (was === 'REFORMING' && A.time < S.cavUntil) S.cav = 'REFORMING';
      else if (id === 'charge' || id === 'attack' || id === 'assault') S.cav = 'CHARGING';
      else S.cav = 'READY';
      if (S.cav !== was && (S.cav === 'REFORMING' || S.cav === 'EXHAUSTED') && (id === 'charge' || id === 'attack' || id === 'assault')) B.order({ id: 'hold', to: null });   // 駆け続けず、その場で集まる
      B.cavState = S.cav;
    }
  }
}

