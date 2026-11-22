// K590②（オンライン PvP・docs/online_final_1120.md 14〜20）4武将×1,000（4,000 vs 4,000）を携帯で軽く動かす土台・クラウド k365-cloud-32（11/21）
//   工程：docs/online_plan_1121.md（cloud-18）。32＝見た目の段（近・中・遠・奥）、37＝重さと記憶（遠景の塊 pvp_army.js）。割り方の紙 docs/online_lod_1121.md
//   一武将＝一つの備（sonae.js）＝一つの部隊（butai.js）。部隊は名目の兵数（UNIT_STRENGTH=1000）を持ち、
//   近い・戦っている時だけ本物の兵（nearReal）、遠い時は少しの本物（farReal）＋軽い大軍（world.addDistantArmy）で数だけ押し合う。
//   本物の合計は butai.js の BUTAI_REAL_CAP（235・記憶の予算の内）。名目の数はいつも 本物＋軽い の合計（兵が消えたり増えたりしない）。
//   勝ち負けの数は名目で数える（本物が斬られれば名目が減り、軽い同士は lightClash で数が減る）。
import { makeSonae } from '../sonae.js';
import { VAT_GHOST, vatGhostTpl, vatGhostVar } from '../crowd_vat.js';
import { DIST_FAKE_NEAR, ARMY_P, ARMY_REAL_P, ARMY_REAL_R, ARMY_NEAR } from '../world_army_shader.js';
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
export const REAL4K = MEM_TIGHT ? { mine: 90, near: 60, far: 35, far2: 10, cap: 420 } : { mine: 120, near: 90, far: 50, far2: 15, cap: 600 };
// 軽い大軍（見せかけ）の人数（一隊）：携帯 450・パソコン 600（cloud-32・本物が減った分を遠目で薄く見せない）
export const LIGHT4K = MEM_TIGHT ? 450 : 600;
// 11/22 kaito：本人の近くの隊の本物（r m の内は n 人・far m より先の戦っていない隊は REAL4K.far2 人）
export const NEAR4K = MEM_TIGHT ? { r: 110, far: 170, n: 180 } : { r: 110, far: 170, n: 260 };

// roster：[{ name: '柴田勝家', side: 0|1, flag, faction, armor, x, z, facing, type: '標準', nominal: 1000, mine: true, line, slot }]
export function army4kLayout(roster) {
  return roster.map((g0, i) => { const hs = g0.heishu || heishuOf(g0.name), g = { ...g0, type: HEISHU_SHAPE[hs], heishu: hs }; return {
    id: g.id || `${g.side}_${g.name}`, name: g.label || `${g.name}の備`, team: g.side ? 1 : 0,
    faction: g.faction, flag: g.flag, armor: g.armor, taisho: g.name, fuku: g.fuku || null,
    line: g.line ?? (g.major ? 'honjin' : 1), slot: g.slot || ['left', 'center', 'right'][i % 3], major: !!g.major,
    nominal: g.nominal || UNIT_STRENGTH, mix: HEISHU_MIX[hs], heishu: hs,
    at: { x: g.x, z: g.z }, facing: g.facing || 0,
    nearReal: g.mine ? REAL4K.mine : REAL4K.near, farReal: REAL4K.far, real: REAL4K.far,
    // 11/21 司令塔：携帯の本物は 420（03 が REAL4K を入れる）。減った本物の分が遠目で薄く見えないよう、携帯の軽い大軍の人数を 300→450 に（パソコンは 600 のまま）。
    //   軽い大軍は霧の先だけ・型の束ね描き（描く回数は増えない）。本物 180 人分の骨の人が減った三角の内に収まる
    lightPeople: (b) => army4kPeople({ x: b.pos.x, z: b.pos.z, facing: b.facing, type: g.type, mix: HEISHU_MIX[hs], seed: b.id, n: Math.round(LIGHT4K * Math.max(0.6, Math.min(1.25, (g.nominal || UNIT_STRENGTH) / UNIT_STRENGTH))) }),   // K624⑤：兵の多い隊は軽い群れも厚く（本物の数は同じ。始めの四将 SS・S・A・N で軽い群れの合計は前の 1.03 倍＝携帯の重さは変わらない）
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
  for (const S of rt.sonae || []) { const B = S.b; if (!B) continue; const busy = B.cmd?.id === 'attack' || B.cmd?.id === 'charge' || B.cmd?.id === 'assault' || (rt.t - (B._clashAt ?? -99)) < 3; B.wantReal = busy ? Math.min(B.nearReal, REAL4K.near) : B.farReal; if (S._k613Threat > rt.t) B.wantReal = Math.max(B.wantReal, B.nearReal);
    // 11/22 kaito「そこへ行った時には本当に存在していないといけない」：本人の近く（百十 m）の隊は、敵も味方も同じ数の本物に（近くに見せの兵を置かないので、本物で埋める）。
    //   本人から百十 m より外の戦っていない隊（と百七十 m より先の戦う隊）は本物を十人にして、上限（REAL4K.cap）を近くの隊へ回す。近い隊は早く本物に替える
    const me4 = rt.player?.u;
    if (me4?.alive && B.pos) { const d = Math.hypot(B.pos.x - me4.pos.x, B.pos.z - me4.pos.z); S._d4 = d;
      if (d >= NEAR4K.r && !S._mine && !(S._k613Threat > rt.t) && (d > NEAR4K.far || !busy)) B.wantReal = Math.min(B.wantReal, REAL4K.far2); } else S._d4 = 1e9; }
  // 近い隊へは、上限の残りを本人に近い順に配る（一隊 NEAR4K.n まで。味方の隊が先に上限を食って、近づいた敵の隊が三十人のままだった）
  { const L4 = (rt.sonae || []).filter((S) => S.b && S._d4 < NEAR4K.r).sort((a, b) => a._d4 - b._d4);
    let budget = (rt.butaiRealCap || REAL4K.cap);
    for (const S of rt.sonae || []) if (S.b && !L4.includes(S)) budget -= Math.min(S.b.wantReal ?? 0, S.b.aliveNominal());
    for (const S of L4) { const B = S.b, w = Math.max(0, Math.min(NEAR4K.n, budget)); if (w > B.wantReal) B.wantReal = w; budget -= Math.min(B.wantReal, B.aliveNominal()); if (B._swT > 0.1) B._swT = 0.1; } }   // 近くの隊が本物を取れるよう、外の隊は少なく（戦う隊は百七十 m までは今の数）   // K613：迫られた本陣は名目の兵を本物に（match.js honjinWall）
  for (const S of rt.sonae || []) { const g = S.b?.real; if (g?.count) { g.pvpBack = true; g.reserveCount = Math.max(0, Math.round(S.b.aliveNominal() - g.count)); } }
  // 11/21 cloud-32（47：一戦が2分半〜6分半で目当ての12〜18分に遠い。描かずの模擬合戦で 363秒）：オンラインの隊どうしの減りだけを PVP_PACE 倍に。
  //   本物どうしの斬り合い（army_combat の g.dmgMult＝本人でない相手への一太刀）と、遠い隊どうしの数の押し合い（lightClash）。
  //   本人に当たる一太刀（dmgMultPlayer）と本人が与える一太刀は変えない（本人の斬り合いの手応えは同じ）
  for (const S of rt.sonae || []) { const g = S.b?.real; if (g && g._paceSet !== PVP_PACE) { g.dmgMultPlayer = g.dmgMultPlayer ?? (g.dmgMult ?? 1); g.dmgMult = (g.dmgMult ?? 1) * PVP_PACE / (g._paceSet || 1); g._paceSet = PVP_PACE; } }
  for (const g of rt.army?.groups || []) if (g._ownerB && g._paceSet !== PVP_PACE) { g.dmgMultPlayer = g.dmgMultPlayer ?? (g.dmgMult ?? 1); g.dmgMult = (g.dmgMult ?? 1) * PVP_PACE; g._paceSet = PVP_PACE; }
  typeTick(rt);
  ghostTick(rt, dt);
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
    // K613：上級・修羅の相手と対戦の本陣（match.js が H._k613Strict を立てる）は前へ出ない。二十八 m 内へ来た備だけ迎え、遠い備へは掛からない（旗本は総大将の回りで壁になる）
    let foe = null, fd = H._k613Strict ? 28 : 60;
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
// K611（kaito：後ろの鉄砲隊が撃たない・鉄砲をもっと活躍させる）：鉄砲の間合いを AI の撃つ間合い（general_ai の range 140）と揃えた（前は AI が 140m で『撃てる』と見て待ち、
//   斉射は 100m までなので後ろの鉄砲隊が一度も撃たなかった）。当たりは近いほど多い（六十m 内 名目の3%・百m 内 2%・その先 1%＝千人の鉄砲で 30・20・10 人）
const VOLLEY = { 鉄砲: { T: 12, R: [15, 140], K: [[60, 0.03], [100, 0.02], [1e9, 0.01]] }, 弓: { T: 10, R: [12, 80], K: [[55, 0.008], [1e9, 0.005]] } };
function volleyTick(rt, A, S, B, g, kind) {
  const V = VOLLEY[kind], gun = kind === '鉄砲';
  const pa = gun ? aimAtPlayer(rt, A, S, B, g) : null;   // K615：本人が正面に立てば、狙って必ず撃つ
  if ((gun && !(S.ammoLeft >= 1)) || S._k603eng || S.state === '敗走' || B.aliveNominal() <= 50 || S._volT > A.time) return;
  let e = null, bd = V.R[1];
  for (const q of rt.sonae || []) { if (q.team === S.team || q.state === '敗走' || !q.b || q.b.aliveNominal() <= 0) continue; const d = Math.hypot(q.b.pos.x - B.pos.x, q.b.pos.z - B.pos.z); if (d >= V.R[0] && d < bd) { bd = d; e = q; } }
  if (!e && !pa) return;
  const fat = 1 - 0.35 * Math.max(0, Math.min(1, B.fatigue || 0));
  if (e) {
    const K = V.K.find(([r]) => bd < r)[1];   // 遠いほど当たらない・疲れで落ちる
    const kill = Math.min(e.b.aliveNominal(), K * B.aliveNominal() * fat * Math.max(0.3, (B.morale || 70) / 100));
    e.b.lost = Math.min(e.b.nominal, e.b.lost + kill);
    const mh = (gun ? 1.5 : 1.1) * 85 * kill / e.b.nominal; e.b.morale = Math.max(5, e.b.morale - mh); if (e.b.real?.count) e.b.real.morale = Math.max(5, e.b.real.morale - mh);
  }
  if (gun) S.ammoLeft = Math.max(0, S.ammoLeft - 1);
  S._volT = A.time + V.T * (S._rapidUntil > A.time ? 0.5 : 1) / Math.max(0.5, fat); S.volleys = (S.volleys || 0) + 1;
  if (pa) S.pVolleys = (S.pVolleys || 0) + 1;
  if (gun) try { salvo(rt, A, S, B, g, e, bd, pa); } catch (x) { /* 火と煙が出なくても数は減らす */ }
}
// K615（kaito 11/21「織田の鉄砲隊の目の前に立っていたのに全然気づかなかった」）：狙われている事を絵と音で分からせる。
//   本人が敵の鉄砲隊の正面（隊の向きから左右およそ八十度・八〜百四十m）に入ると、その隊は二秒半の内に必ず一斉射を放つ（間が残っていても詰める）。
//   その間、鉄砲足軽は本人へ向き直り、届く者（百m 内）は八人まで筒を本人へ構える（構えの形・火縄の煙・火皿の火は army_think の構えと同じ物。
//   頭上の矢玉の予告と画面の縁の脈も、構えた者を数える既存の作り）。放てば本物の弾が飛び、耳元をかすめれば唸り、外れた弾は足元に土煙を上げる。
//   当たれば画面の端が赤く染まる（gunHitEdge）。百m より遠い時は弾が届かないので、隊の一斉射の見込みで当て、外れは唸りと土煙だけを出す
const PAIM = 2.5, PAIM_N = 8;
function aimAtPlayer(rt, A, S, B, g) {
  const P = rt.player?.u;
  if (!P?.alive || P.team === S.team || !(S.ammoLeft >= 1) || S.state === '敗走' || S._k603eng || B.aliveNominal() <= 50) { S._pAim = 0; return null; }
  const dx = P.pos.x - B.pos.x, dz = P.pos.z - B.pos.z, d = Math.hypot(dx, dz);
  if (d < 8 || d > VOLLEY.鉄砲.R[1] || Math.cos(Math.atan2(dx, dz) - (B.facing || 0)) < 0.2) { S._pAim = 0; return null; }
  if (!S._pAim) {
    S._pAim = A.time; S.pAimN = (S.pAimN || 0) + 1;
    S._volT = Math.max(A.time + 1.2, Math.min(S._volT ?? 0, A.time + PAIM));   // 構えを見せる間（一・二秒）を置いて、二秒半の内に必ず放つ
    try { A.hooks?.onGunAtPlayer?.(g?.units?.find((u) => u.type === 'gun') || { pos: B.pos }); } catch (x) { /* 声が無くても構える */ }
  }
  // 構えは次の一斉射の二秒半前から。一斉射ごとに八人まで（撃ち手が尽きるまで続けて撃たない）
  const fireAt = S._volT ?? 0, soon = fireAt > A.time && fireAt - A.time <= PAIM + 0.3;
  if (g && soon) g._pAimUntil = fireAt + 1;
  if (S._pAimFor !== fireAt && soon) { S._pAimFor = fireAt; S._pAimK = 0; }
  for (const u of g?.units || []) {
    if (!u.alive || u.gone || u.type !== 'gun' || u.sidearm || u.fleeing || u._k615 > A.time || u.atk) continue;
    u.heading = Math.atan2(P.pos.x - u.pos.x, P.pos.z - u.pos.z);   // 本人へ向き直る（込め直しの者も）
    if (!soon || S._pAimK >= PAIM_N || u.reload || (u.gunAmmo ?? 20) <= 0 || Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) > 98) continue;
    aimJob(A, u, P, fireAt + Math.random() * 0.35);
    if (!u.offscreen && u.camD < 90) try { A.smoke?.(u.pos.x, u.pos.y + 1.5, u.pos.z, 0, 0, 0.35); } catch (x) { /* 煙が無くても構える */ }
    S._pAimK++;
  }
  S.pAimers = S._pAimK || 0;
  return { P, d };
}
// 一人の構えから発砲まで。遠くの兵は携帯で考えを省かれ（army_quality が毎コマ構えを外す）、近くの兵も隊の号令待ちで筒を下ろすので、
//   army_think の構えに任せず、毎コマの弾の段（stepSalvo）で向きと構えを保ち、刻が来たら火皿を光らせて本人へ放つ
function aimJob(A, u, P, at) {
  const aimO = { t: 99, dur: 99, target: P, ranged: true };
  u._k615 = at; u.atk = aimO; u.cd = 0; u.shotWarnUntil = at;
  (A._salvoQ || (A._salvoQ = [])).push(() => {
    if (!u.alive || u.gone || u.fleeing || u.sidearm || !P.alive) { if (u.atk === aimO) u.atk = null; u._k615 = 0; return true; }
    u.heading = Math.atan2(P.pos.x - u.pos.x, P.pos.z - u.pos.z);
    if (A.time < at) {
      if (!u.atk) u.atk = aimO;
      u.shotWarnUntil = at;
      if (A.playerShotAimers && !A.playerShotAimers.includes(u)) A.playerShotAimers.push(u);
      return false;
    }
    if (u.atk === aimO) u.atk = null;
    u._k615 = 0;
    try { A.panFlash?.(u, !u.offscreen && u.camD < 90); } catch (x) { /* 火皿の火が無くても撃つ */ }
    const a0 = u.gunAmmo ?? 20;
    if (A.fireGun(u, P) || (u.gunAmmo ?? 20) < a0) A.startReload?.(u);
    return true;
  });
}
// 鉄砲に当たった時の画面の端の赤（字は出さない・動きを減らす設定では揺らさずに一度だけ）
let edgeEl = null, edgeT = 0;
function gunHitEdge(w = 1) {
  if (typeof document === 'undefined') return;
  if (!edgeEl || !edgeEl.isConnected) {
    edgeEl = document.createElement('div'); edgeEl.id = 'gunhitfx'; edgeEl.setAttribute('aria-hidden', 'true');
    edgeEl.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:6;opacity:0;transition:opacity .7s ease-out;background:radial-gradient(ellipse 80% 76% at 50% 50%,transparent 52%,rgba(150,14,4,.42) 80%,rgba(96,6,0,.78) 100%)';
    document.body.appendChild(edgeEl);
  }
  const el = edgeEl; el.style.transition = 'none'; el.style.opacity = String(Math.min(1, 0.55 + 0.45 * w));
  clearTimeout(edgeT); edgeT = setTimeout(() => { el.style.transition = document.body.classList.contains('rm') ? 'none' : 'opacity .7s ease-out'; el.style.opacity = '0'; }, 160);
  if (typeof window !== 'undefined') window.__gunHitEdge = (window.__gunHitEdge || 0) + 1;
}
// 弾が届かない遠さ（百m 越え）で外れた時：耳元の唸りと足元の土煙だけ
function nearMissFx(A, P) {
  const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3, x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
  try { A.play?.('whiz', P.pos, 1.2); A.burst?.(x, (A.world?.heightAt ? A.world.heightAt(x, z) : P.pos.y) + 0.05, z, 5, 'dust', 0, 0, null, true); A.play?.('thunk', { x, y: P.pos.y, z }, 0.35); } catch (x2) { /* 出なくても進む */ }
}
// 兵一人ずつの本物の弾（K611）：込め終えた鉄砲足軽が〇・六秒の内にばらけて一発ずつ撃つ（火・煙・弾道は army_ranged の fireGun）。
//   的は百m 内の一番近い敵の本物の兵、いなければ敵の備の方へ（弾は飛び、当たれば当たる）。撃った者は込め直し。一度に三十人まで（携帯の重さ）
//   銃声は隊で一つ大きく（近ければ volley・遠ければ volleyFar＝遠いほどこもる）。敵の鉄砲隊へ本人が突っ込めば、本人にも弾が来る
const SALVO_MAX = 30;
function salvo(rt, A, S, B, g, e, bd, pa = null) {
  const cam = rt.camera?.position, cd = cam ? Math.hypot(cam.x - B.pos.x, cam.z - B.pos.z) : 0;
  try { A.play?.(cd > 120 ? 'volleyFar' : 'volley', B.pos, cd > 120 ? 1.2 : 1.6); } catch (x) { /* 音が無くても撃つ */ }
  const shooters = (g?.units || []).filter((u) => u.alive && !u.gone && u.type === 'gun' && !u.sidearm && !u.reload && !(u.cd > 0) && !u.atk && !(u._k615 > A.time) && !u.fleeing && (u.gunAmmo ?? 20) > 0).slice(0, SALVO_MAX);
  const foeReal = e?.b.real?.units?.filter((q) => q.alive && !q.gone) || [];
  const P = rt.player?.u, aim = e ? e.b.pos : P.pos;
  let toP = pa ? Math.max(0, 6 - (S.pAimers || 0)) : 0;   // 構えに間に合わなかった者も、本人へ数人は撃つ
  for (const u of shooters) {
    let t = null, best = 95;
    if (toP > 0 && Math.hypot(P.pos.x - u.pos.x, P.pos.z - u.pos.z) < 98) { t = P; toP--; }
    else for (const q of foeReal) { const d = Math.hypot(q.pos.x - u.pos.x, q.pos.z - u.pos.z); if (d < best) { best = d; t = q; } }
    if (!t) { const dx = aim.x - u.pos.x, dz = aim.z - u.pos.z, dl = Math.hypot(dx, dz) || 1, k = Math.min(dl, 90) / dl; const x = u.pos.x + dx * k, z = u.pos.z + dz * k; t = { pos: { x, y: rt.world?.heightAt ? rt.world.heightAt(x, z) : u.pos.y, z }, alive: true, team: e ? e.team : P.team, mounted: false }; }
    const at = A.time + Math.random() * 0.6;
    (A._salvoQ || (A._salvoQ = [])).push(() => {
      if (A.time < at) return false;
      if (u.alive && !u.reload && !u.atk && t.alive !== false) { u.heading = Math.atan2(t.pos.x - u.pos.x, t.pos.z - u.pos.z); const a0 = u.gunAmmo ?? 20; if (A.fireGun(u, t) || (u.gunAmmo ?? 20) < a0) A.startReload?.(u); }
      return true;
    });
  }
  // 百m 内の本人へは本物の弾が飛ぶ（上の構えと toP）。弾の届かない百〜百四十m の本人には、隊の一斉射の見込みで当てる（一発 14〜26）。外れは唸りと土煙
  //   込め直しの最中や行軍の途中で本人へ構えられる者がいない時も、一斉射の見込みで当てる（正面に立てば必ず撃たれる）
  if (pa && (pa.d >= 98 || !(S._pAimK > 0) && toP >= 6) && rt.army?.hooks?.playerDamage) {
    if (Math.random() < 0.55 * (1 - pa.d / 150)) {
      const src = shooters[0] || { pos: B.pos, team: S.team, isStruct: false, type: 'gun' };
      P.hitKind = 'gun'; try { const tk = rt.army.hooks.playerDamage(14 + Math.random() * 12, src); if (tk > 0) P.hp = Math.max(0, P.hp - tk); S.playerHits = (S.playerHits || 0) + 1; } catch (x) { /* 当たらなくても進む */ }
    } else nearMissFx(A, P);
  }
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
  // K615：本人が鉄砲に当たれば画面の端を赤く（本物の弾も隊の一斉射も。hooks の playerDamage を一度だけ包む）
  const H = A.hooks;
  // 隊は号令待ち（holdFire）で、敵の兵は本人へ構えても撃たずに筒を下ろしていた。隊が本人を狙う間（_pAimUntil）だけ、本人への構えは号令を待たない
  if (A.gunHold && !A._k615gh) { const gh = A.gunHold; A._k615gh = true; A.gunHold = function (g, u, t) { return t && t === this.playerUnit && g?._pAimUntil > this.time ? false : gh.call(this, g, u, t); }; }
  if (H?.playerDamage && H._k615 !== H.playerDamage) {
    const pd = H.playerDamage;
    H.playerDamage = H._k615 = (a, s2) => { const r = pd(a, s2); if (r > 0 && (s2?.type === 'gun' || rt.player?.u?.hitKind === 'gun')) { rt.player.u.gunHits = (rt.player.u.gunHits || 0) + 1; gunHitEdge(Math.min(1, r / 30)); } return r; };
  }
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


// 11/22 K609（kaito「一つ一つの隊が少なく見える」）：本物（REAL4K）は変えず、その後ろの列を考えない「見せの兵」で埋めて千人の隊の厚みを見せる。
//   描くのは crowd_vat.js の ghostDraw（同じ隊の本物の姿・得物・焼いた動きを借りる立体の VAT。平たい絵は使わない＝flat_rule のまま）。
//   見せの兵は Unit ではない（考え・当たり・斬り合い・数えに入らない）ので、隊の強さ・名目の数・本物の上限は今まで通り。
//   数＝名目の残り − 本物（一隊 GHOST4K.per まで・霧の手前の隊だけ・全部で GHOST4K.cap まで）。崩れた・逃げる隊には付けない。
//   本物の隊の一番後ろの者の一・六 m 後ろから、隊の向きに横に並べて奥へ。隊が動けば歩いて付いて行く（一秒に 4.5m まで）。本人の一・二 m 内は道を空ける
// 11/22 K613②（kaito「遠くにたくさん軍勢がいると思って近づくと、兵が消えていく」）：軽い大軍は本人とカメラから DIST_FAKE_NEAR（60m）＋兵ごとに 0〜30m の内で
//   一人ずつ消える（world_army_shader.js）のに、見せの兵は霧の手前の近い隊に一隊 160・全部で 600 だけで、消えた軽い兵の分を埋め切れていなかった（近づくほど兵が減った）。
//   見せの兵を、軽い大軍が消える所だけを一人ずつ埋める形に：一隊の数は軽い大軍が描く数（LIGHT4K から本物を引き、携帯は軽い大軍と同じく半分）にそろえ、
//   一人ずつ同じ式（60m＋兵ごとに 0〜30m）で、内なら見せの兵・外なら軽い大軍。近づいても兵の数は変わらない。五十 m より先の見せの兵は粗い形（三角が 15%）
export const GHOST4K = MEM_TIGHT ? { per: 225, cap: 1800, thin: 0.5 } : { per: 600, cap: 3000, thin: 1 };
const ghash = (k) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
function ghostTick(rt, dt) {
  const t0 = performance.now();
  try { ghostTick0(rt, dt); } finally { VAT_GHOST.tickMs += performance.now() - t0; }
}
function ghostTick0(rt, dt) {
  const out = VAT_GHOST.list;
  out.length = 0;
  if (!VAT_GHOST.on || !rt.camera || !rt.world) return;
  const cam = rt.camera.position, me = rt.player?.u, fk = DIST_FAKE_NEAR.value, far = fk + 30 + 40, px = me ? me.pos.x : cam.x, pz = me ? me.pos.z : cam.z;
  // 数の枠は両軍に半分ずつ（近い味方の隊だけで使い切り、向かいの敵の隊が薄いままにならない）。同じ側では画面の前の近い隊から（カメラの後ろの隊は四倍遠いと見る）
  // K615①：枠は両軍で一つ（画面の外・カメラの後ろの見せの兵は数えない。数えると前の敵の隊で枠が尽き、近づくと兵が減った）
  const lefts = [GHOST4K.cap];
  const cd = new rt.camera.position.constructor(); rt.camera.getWorldDirection?.(cd);
  const L = (rt.sonae || []).slice().sort((a, b) => sd(a) - sd(b));
  function sd(S) { const p = S.b?.pos; if (!p) return 1e12; const dx = p.x - cam.x, dz = p.z - cam.z; return (dx * dx + dz * dz) * (dx * cd.x + dz * cd.z < 0 ? 16 : 1); }
  for (const S of L) {
    const B = S.b, g = B?.real, ti = 0, left = lefts[ti];
    if (!g || !g.units || left <= 0) { if (S._gh) S._gh.length = 0; continue; }
    if (S.state === '敗走' || g.routed || g.order === 'flee') { if (S._gh) S._gh.length = 0; continue; }
    // 本物の真ん中・一番後ろ・横の広がり（隊の向きで測る）
    let n = 0, sx = 0, sz = 0;
    for (const u of g.units) if (u.alive && !u.gone) { n++; sx += u.pos.x; sz += u.pos.z; }
    if (!n) { if (S._gh) S._gh.length = 0; continue; }
    const cx = sx / n, cz = sz / n;
    if (Math.min((cx - cam.x) ** 2 + (cz - cam.z) ** 2, (cx - px) ** 2 + (cz - pz) ** 2) > far * far) { if (S._gh) S._gh.length = 0; continue; }   // 隊がまるごと軽い大軍の描く所（輪の外）
    // 前＝一番近い敵の隊の方（隊の向き facing は持ち場の向きのままの事があり、後ろの列が敵の側へ出た）。百五十 m 内に敵の隊が無ければ隊の向き
    let fw = g.forward ? g.forward() : { x: Math.sin(B.facing || 0), z: Math.cos(B.facing || 0) }, fd = 150 * 150;
    for (const T of rt.sonae || []) { if (T.team === S.team || !T.b?.pos) continue; const ex = T.b.pos.x - cx, ez = T.b.pos.z - cz, e2 = ex * ex + ez * ez; if (e2 < fd && e2 > 1) { fd = e2; const l = Math.sqrt(e2); fw = { x: ex / l, z: ez / l }; } }
    const rx = fw.z, rz = -fw.x, face = Math.atan2(fw.x, fw.z);
    let back = 0, wide = 4;
    for (const u of g.units) if (u.alive && !u.gone) { const dx = u.pos.x - cx, dz = u.pos.z - cz, f = dx * fw.x + dz * fw.z, r = Math.abs(dx * rx + dz * rz); if (f < back) back = f; if (r > wide) wide = r; }
    const LA = B.light && B.light.army && B.light.army.body && !B.light.army.empty ? B.light.army : null;
    const want = LA ? 1 : Math.max(0, Math.min(GHOST4K.per, Math.round(B.aliveNominal() - g.count), Math.round((LIGHT4K - g.count) * GHOST4K.thin)));
    // 姿を借りる本物（二秒ごとに選び直す・いろいろな姿が混ざるよう八人まで）
    if (!S._ghT || rt.t - S._ghT > 2 || !S._ghTpl?.length) {
      S._ghT = rt.t; S._ghTpl = [];
      for (const u of g.units) { if (S._ghTpl.length >= 8) break; if (u !== me && vatGhostTpl(u)) S._ghTpl.push(u); }
    }
    const tp = S._ghTpl;
    // 貸せる本物がまだ居ない隊は、姿を作ってもらう（crowd_vat.js vatSelect が一コマ一つ）
    if (tp.length < 4 && want && VAT_GHOST.want.length < 6) { let k = 0; for (const u of g.units) { if (k >= 2) break; if (u !== me && u.alive && !u.gone && !u.vatL && u.look) { VAT_GHOST.want.push(u); k++; } } }
    if (!tp.length || !want) { if (S._gh) S._gh.length = 0; continue; }
    if (LA) { ghostLight(rt, S, B, g, LA, tp, me, ti, lefts, out, dt, cd); continue; }
    const G = S._gh || (S._gh = []);
    if (G.length > want) G.length = want;
    const cols = Math.max(8, Math.min(40, Math.round(wide * 2 / 1.3) + 2)), sp = 1.3, dp = 1.55;
    for (let i = 0; i < want; i++) {
      const seed = (B.id || 1) * 1000 + i + 1;
      const row = Math.floor(i / cols), col = i % cols - (cols - 1) / 2;
      const jx = (ghash(seed) - 0.5) * 0.5, jz = (ghash(seed + 0.5) - 0.5) * 0.5;
      const ox = col * sp + jx, oz = back - 1.6 - row * dp + jz;
      let tx = cx + rx * ox + fw.x * oz, tz = cz + rz * ox + fw.z * oz;
      if (me?.alive) { const dx = tx - me.pos.x, dz = tz - me.pos.z, d = Math.hypot(dx, dz); if (d < 1.2) { const s2 = (1.2 - d) / (d || 1); tx += dx * s2; tz += dz * s2; } }
      let e = G[i];
      if (!e) { e = G[i] = { x: tx, z: tz, y: 0, sp: 0, ph: ghash(seed + 0.25), seed: ghash(seed + 0.75), var: vatGhostVar(seed), tpl: null, yaw: face, h: ghash(seed + 0.9) }; }
      const dx = tx - e.x, dz = tz - e.z, d = Math.hypot(dx, dz), stp = Math.min(d, 4.5 * dt);
      if (d > 25) { e.x = tx; e.z = tz; e.sp = 0; }   // 遠く離れた（隊が出直した）時は置き直す
      else if (d > 0.05 && dt > 0) { e.x += dx / d * stp; e.z += dz / d * stp; e.sp += (stp / dt - e.sp) * Math.min(1, dt * 6); }
      else e.sp += (0 - e.sp) * Math.min(1, dt * 6);
      e.yaw = d > 0.3 ? Math.atan2(dx, dz) : face;
      if (d > 0.05 || !e.y) e.y = rt.world.heightAt(e.x, e.z);
      e.tpl = tp[i % tp.length];
      // 軽い大軍と同じ輪（本人とカメラの近い方から 60m＋兵ごとに 0〜30m）の内だけ描く。外は軽い大軍が描く
      const dc = Math.min((e.x - cam.x) ** 2 + (e.z - cam.z) ** 2, (e.x - px) ** 2 + (e.z - pz) ** 2), rr = fk + 30 * e.h;
      if (dc >= rr * rr || dc < fk * fk || lefts[ti] <= 0) continue;   // 六十 m の内は本物だけ（kaito 11/22）
      lefts[ti]--;
      out.push(e);
    }
  }
}
// 11/22 K615①（kaito「近づいたら消えるのを本当にやめて」）：K613② の後も、敵の鉄砲隊の正面へ歩くと、その隊の見える兵が 395→243 に減った（6将戦・iPhone 高）。
//   元：見せの兵は隊の後ろの升目に「数だけ」合わせた（一隊 208）が、携帯の軽い大軍は足軽の半分と武者・旗持ち・騎馬を全部描くので、消える数（約360）より少なかった。
//   置き場も本物の後ろの升目で、軽い兵が消えた所（隊の前・横）は空いた。
//   直し：軽い大軍の一人ずつを見て、描く式（world_army_shader.js の ARMY_PUSH と army_batch.js の携帯の間引き）がその兵を消す時だけ、同じ場所・同じ向きに見せの兵を一人置く。
//   近づいても兵は一人も減らない（消えた軽い兵は必ず見せの兵か本物に替わる）。描かれている本物の立つ升（一 m）には置かない（霧の先で描かれない本物の升は空けない）
const ghostCell = new Set();
function ghostLight(rt, S, B, g, A, tp, me, ti, lefts, out, dt, cd) {
  const cam = rt.camera.position, cl = Math.hypot(cd.x, cd.z) || 1, fx = cd.x / cl, fz = cd.z / cl;
  const body = A.body, grp = A.mesh, N = body.count, info = body.geometry.attributes.aInfo.array, M = body.instanceMatrix.array, base = A.base, hid = A.hid, taken = A.taken;
  grp.updateWorldMatrix(true, false);
  const e = grp.matrixWorld.elements, ox = A.off.x, oy = A.off.y, oz = A.off.z, ry = grp.rotation.y + (A.tw && A.tw.back ? Math.PI : 0);
  const cpx = ARMY_P.value.x, cpz = ARMY_P.value.y, rpx = ARMY_REAL_P.value.x, rpz = ARMY_REAL_P.value.y, fk = DIST_FAKE_NEAR.value, an = ARMY_NEAR.value, rr = ARMY_REAL_R.value;
  ghostCell.clear();
  for (const u of g.units) if (u.alive && !u.gone && !u.camHidden) ghostCell.add(Math.round(u.pos.x) * 4096 + Math.round(u.pos.z));
  const G = S._gh || (S._gh = []), L = S._ghL || (S._ghL = []);
  G.length = 0;
  for (let i = 0; i < N; i++) {
    if (taken && taken[i]) continue;
    const x0 = info[i * 4];
    if (MEM_TIGHT && info[i * 4 + 1] < 3 && x0 < 0.5) continue;   // 携帯で軽い大軍が描かない足軽（army_batch.js SOLID_THIN）は見せの兵にもしない
    const k = i * 16, src = hid && hid[i] > 0 && base ? base : M;
    if (src[k] === 0 && src[k + 5] === 0 && src[k + 10] === 0) continue;
    const lx = src[k + 12] + ox, ly = src[k + 13] + oy, lz = src[k + 14] + oz;
    const wx = e[0] * lx + e[4] * ly + e[8] * lz + e[12], wz = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
    const dd = Math.hypot(wx - cpx, wz - cpz), mn = Math.min(dd, Math.hypot(wx - rpx, wz - rpz));
    const yielded = src !== M;   // 本物の兵のそばで道を譲って隠れた軽い兵（world_army_scene.js yieldArmyStep・大きさ 0）
    if (!yielded && !(dd < an || mn < rr - 5 * x0 || mn < fk + 30 * x0)) continue;   // 軽い大軍が描く兵（描く式の外）
    if (mn < fk) continue;   // 11/22 kaito「近づくと消える兵をやめて・そこへ行った時には本当に存在していないと」：本人とカメラの輪（六十 m）の内に見せの兵は置かない（本物だけ）
    const cx0 = Math.round(wx), cz0 = Math.round(wz);
    if (ghostCell.has(cx0 * 4096 + cz0)) continue;
    // 譲った兵は、そばの本物が霧の先で描かれていない時（八十 m の先）だけ埋める（描かれていれば本物がそこに居る）。埋めないと隊に七十人ほどの穴が開いた
    if (yielded) { let near = false; for (let a = -1; a <= 1 && !near; a++) for (let c = -1; c <= 1; c++) if (ghostCell.has((cx0 + a) * 4096 + cz0 + c)) { near = true; break; } if (near) continue; }
    { const vx = wx - cam.x, vz = wz - cam.z, f = vx * fx + vz * fz, d2 = vx * vx + vz * vz; if (d2 > 36 && (f <= 0 || f * f < 0.15 * d2)) { if (L[i]) L[i].x = wx, L[i].z = wz; continue; } }   // 画面の外（カメラの後ろ・横の六十七度より外）は描かれないので枠を使わない
    if (lefts[ti] <= 0) break;
    let q = L[i];
    if (!q) { const seed = (B.id || 1) * 1000 + i + 1; q = L[i] = { x: wx, z: wz, y: rt.world.heightAt(wx, wz), sp: 0, ph: ghash(seed + 0.25), seed: ghash(seed + 0.75), var: vatGhostVar(seed), tpl: null, yaw: 0, h: x0 }; }
    let tx = wx, tz = wz;
    if (me?.alive) { const dx = tx - me.pos.x, dz = tz - me.pos.z, d = Math.hypot(dx, dz); if (d < 1.2) { const s2 = (1.2 - d) / (d || 1); tx += dx * s2; tz += dz * s2; } }
    const dx = tx - q.x, dz = tz - q.z, d = Math.hypot(dx, dz);
    if (d > 0.02 && dt > 0) { q.sp += (Math.min(6, d / dt) - q.sp) * Math.min(1, dt * 6); if (d > 0.05) q.y = rt.world.heightAt(tx, tz); }
    else q.sp += (0 - q.sp) * Math.min(1, dt * 6);
    q.x = tx; q.z = tz;
    q.yaw = Math.atan2(src[k + 8], src[k + 10]) + ry;
    q.tpl = tp[i % tp.length];
    lefts[ti]--;
    G.push(q); out.push(q);
  }
}
