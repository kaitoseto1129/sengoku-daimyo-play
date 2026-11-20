// 豊臣編 7　紀州征伐／太田城（約15分。docs/toyo15_plan_1108.md の 7）
// 水攻め：巨大な包囲陣 → 築堤の護衛 → 堰を開いて水を入れる（夕・小舟）→ 堤が崩れ、崩れ目を守る → 白旗と開城。
// 敵将を倒すのではなく、工事と包囲で勝つ。段の中身は s1〜s5、舞台は scene.js、段の運びは toyo15/kit.js。
import { stageRun, fallB } from '../toyo15/kit.js';
import { P, build, otaHeight, waterTick, guardTick } from './scene.js';
import s1 from './s1_hoi.js';
import s2 from './s2_chikutei.js';
import s3 from './s3_seki.js';
import s4 from './s4_kekkai.js';
import s5 from './s5_kaijo.js';
import { depth } from './depth.js';
import { isTouch as TOUCH } from '../touch.js';
import { fujinRealN } from '../fujin_layout.js';
import { pressPlayer } from '../tottori/combat.js';

// 堤の輪（半径六十五歩）の上を回って歩く（輪の内の水と城へ斬り込まない）
function route(u, want) {
  const p = u.pos, q = u._otaWay || (u._otaWay = { x: 0, z: 0, botRadius: 2 });
  // 本陣の幕の内からは、南の開き口へ回って出る。堤へ直行すると西南の幕で止まる。
  const cx = P.camp.x, cz = P.camp.z;
  if (Math.abs(want.x - cx) < 8 && Math.abs(want.z - cz) < 6) u._otaCampExit = 0;
  else if (!u._otaCampExit && Math.abs(p.x - cx) < 8 && Math.abs(p.z - cz) < 6) u._otaCampExit = 1;
  if (u._otaCampExit) {
    // 出口へ向いた後でも、押し合いで脇へずれたら幕の内で並び直す。
    // 出口の段を保ったまま斜めに進むと、南の幕の端で止まり続ける。
    if (u._otaCampExit === 2 && p.z < cz + 6 && Math.abs(p.x - cx) > 2) u._otaCampExit = 1;
    // 出口の正面まで来た兵を、幕の奥の集合点へ引き返させない。
    if (u._otaCampExit === 1 && Math.abs(p.x - cx) < 2 && p.z >= cz + 1) u._otaCampExit = 2;
    if (u._otaCampExit === 2 && p.z >= cz + 9) u._otaCampExit = 0;
    else {
      q.x = cx; q.z = u._otaCampExit === 1 ? Math.max(p.z, cz + 3) : cz + 10;
      return q;
    }
  }
  // 北の塀の内へ追い込まれた兵は、門の正面へ並んでから外へ出る。
  // 外どうしの迂回だけでは、堰や東の堤へ直行して塀に止まり続ける。
  if (Math.abs(p.x) < 23 && p.z >= -25 && p.z < -12 &&
      (Math.abs(want.x) > 25 || Math.abs(want.z) > 27)) {
    q.x = 0; q.z = Math.abs(p.x) > 2 ? -20 : -34;
    return q;
  }
  // 城の外どうしの移動でも、五十歩の内から直行すると塀を横切る。
  // 主人公・人夫・護衛・退く雑賀衆とも、行き帰りを北の塀の外へ回す。
  if ((Math.abs(p.x) > 23 || Math.abs(p.z) > 25) &&
      (Math.abs(want.x) > 25 || Math.abs(want.z) > 27)) {
    const dx = want.x - p.x, dz = want.z - p.z;
    let lo = 0, hi = 1;
    if (Math.abs(dx) < 0.001) { if (Math.abs(p.x) > 25) hi = -1; }
    else { const a = (-25 - p.x) / dx, b = (25 - p.x) / dx; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (Math.abs(dz) < 0.001) { if (Math.abs(p.z) > 27) hi = -1; }
    else { const a = (-27 - p.z) / dz, b = (27 - p.z) / dz; lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b)); }
    if (lo <= hi) {
      if (p.z > 25 && Math.abs(p.x) <= 23) {
        q.x = want.x < 0 ? -30 : 30; q.z = Math.max(30, p.z);
        return q;
      }
      q.x = p.z > -32 ? (p.x < -23 ? -30 : p.x > 23 ? 30 : p.x) : (want.x < 0 ? -32 : 32);
      q.z = -34;
      return q;
    }
  }
  const dp = Math.hypot(p.x, p.z), dw = Math.hypot(want.x, want.z);
  if (dp < 50 || dw < 50) return want;
  // 堤の外の短い寄せ足まで輪へ戻すと、敵へ寄る足と迂回が競り合う。
  // 直線が堤の内縁（半径五十七歩）を横切る時だけ、輪に沿って回す。
  // 城の塀と本陣の幕の迂回は、この判定より先に保つ。
  const dx = want.x - p.x, dz = want.z - p.z, len2 = dx * dx + dz * dz;
  const k = len2 > 0 ? Math.max(0, Math.min(1, -(p.x * dx + p.z * dz) / len2)) : 0;
  if (Math.hypot(p.x + dx * k, p.z + dz * k) >= 57) return want;
  const a = Math.atan2(p.z, p.x), end = Math.atan2(want.z, want.x);
  let d = end - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= 0.2) return want;
  const v = a + Math.sign(d) * Math.min(0.15, Math.abs(d)), r = Math.max(68, Math.min(80, dp));
  q.x = r * Math.cos(v); q.z = r * Math.sin(v); return q;
}
// 11/16 iMac act bot：人夫や堰へ向かう途中（move）の雑賀衆が、本人のすぐそばを六秒素通りした（347秒 土橋を渡る組・496秒 松明の組）。
//   本人の六 m 内へ来た敵の組はその場で打ち掛かる（段ごとの行き先の下知より目の前の侍を先に）
function passBy(rt) {
  const me = rt.player.u, F = rt.flags;
  // 開城の使者や停戦した兵の行進を、接近を理由に打ち掛かりへ変えない。
  if (F.step >= 5 || F.ending || F.passByAt > rt.t) return;
  // 描画の速さに左右されず、四分の一秒ごとに近くの敵を見回る。
  F.passByAt = rt.t + 0.25;
  for (const g of rt.army.groups) if (g.team === 1 && !g.peaceful && g.order === 'move' && !g.routed && g.count && g.units.some((u) => u.alive && !u.gone && !u.fleeing && Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 6)) { g.order = 'attack'; g.dest = null; g.aggro = Math.max(g.aggro || 0, 14); g.seekRange = Math.max(g.seekRange || 0, 20); }
}
// 11/19 01:10 クラウド 紀州の持ち主：act bot（POSLOG）④ 245〜575秒 崩れ目で本人の二歩内に敵が三〜九人（共通の新手 三十〜四十四人が本人へ）、
//   bot が囲まれて構えたまま三百三十秒 討ち取り22のまま。本人の四歩半の内に五人を超えたら、本人へ打ちかかる者は近い四人まで（侍大将は数えない）、
//   五人目からは近くの味方の兵へ向け直す（千石堀と同じ。敵の数・強さは変えない）
function mobCap(rt) {
  const F = rt.flags, me = rt.player.u, P = me.pos;
  if (F.step >= 5 || F.ending || F.mobAt > rt.t) return;
  F.mobAt = rt.t + 0.5;
  let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.abs(u.pos.x - P.x) < 5 && Math.abs(u.pos.z - P.z) < 5 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 4.5) n++;
  // 01:20：向け直しだけでは本人の五歩内に味方が居らず（POSLOG 400〜570秒 本人の二歩内に敵三〜七・味方0）、囲まれたまま下がり続けた。
  //   三人を超えたら四十五m 内の味方の組を二つまで本人の脇へ寄せて打ち掛からせる（千石堀と同じ形）
  if (n >= 3) {
    const ns = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.routed && !g.civ && !g.honjin && !g.peaceful && !g.noAI && !g.fixed && g !== F.friends && (!g.onArrive || g._rescueT) && g.count >= 4).map((g) => { const c = g.center(); return { g, d: c ? Math.hypot(c.x - P.x, c.z - P.z) : 1e9 }; }).filter((x) => x.d < 45 && x.d > 3).sort((a, b) => a.d - b.d).slice(0, 2);
    for (const { g } of ns) if (!(g._rescueT > rt.t)) { g._rescueT = rt.t + 6; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 12; q.seekRange = 16; }; }
  }
  if (n <= 4) return;
  const on = rt.army.units.filter((u) => u.alive && u.team === 1 && u.target === me && !u.fleeing && u.type !== 'busho').sort((a, b) => Math.hypot(a.pos.x - P.x, a.pos.z - P.z) - Math.hypot(b.pos.x - P.x, b.pos.z - P.z));
  for (const u of on.slice(4)) { const a = rt.army.nearestEnemy(u, 16, (o) => o !== me && !o.isPlayer && !o.isStruct && !o.fleeing); if (a) { u.target = a; u.atk = null; u.aiT = 0.4; } }
}
function huntTick(rt) {
  const F = rt.flags, me = rt.player.u;
  if ((F.step || 1) < 2 || rt.t < (F.huntAt || 0)) return;
  F.huntAt = rt.t + 2;
  // act bot 248秒★：寄せた小舟の雑賀の鉄砲が本人の2.6m で六秒立つ→三歩半の内の鉄砲は脇差で本人へ（千石堀と同じ）
  for (const u of rt.army.units) if (u.alive && u.team === 1 && u.type === 'gun' && !u.sidearm && !u.perch && !u.fleeing && !u.downed && !u.isStruct && Math.abs(u.pos.x - me.pos.x) < 3.5 && Math.abs(u.pos.z - me.pos.z) < 3.5 && Math.hypot(u.pos.x - me.pos.x, u.pos.z - me.pos.z) < 3.5 && (u.group?.order === 'move' || u.group?.order === 'attack')) { rt.army.drawSidearm(u); u.target = me; }
  const cur = F.huntG;
  if (cur && cur.focus === me && !cur.routed && cur.count && rt.t < F.huntEnd) return;
  if (cur && cur.focus === me) cur.focus = null;
  F.huntG = null;
  for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.downed && !u.civ && Math.abs(u.pos.x - me.pos.x) < 12 && Math.abs(u.pos.z - me.pos.z) < 12) return;
  let best = null, bd = 60;
  for (const g of rt.army.groups) {
    // 11/19 02:05 クラウド 紀州の持ち主：③④は待つ備を放たない（reserveRelease）のに、この狩りが二線に並んだ待つ備（stay）を一番近い組として本人へ打ち掛からせ、
    //   新手が本人を囲んで討ち取りが二百秒止まった（act bot 01:37）。並んで待つ備は狩りに選ばない
    if (g.team !== 1 || g.routed || g.peaceful || g.civ || !g.count || g.focus || g.stay || g.order === 'flee' || g.order === 'retreat') continue;
    const c = g.center(); if (!c) continue;
    const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z);
    if (d < bd && Math.hypot(c.x, c.z) > 38) { bd = d; best = g; }
  }
  if (!best) return;
  best.focus = me; best.order = 'attack'; best.dest = null; F.huntG = best; F.huntEnd = rt.t + 15;
}
function bladeTick(rt) {
  const F = rt.flags;
  if (rt.t < (F.bladeAt || 0)) return;
  F.bladeAt = rt.t + 1;
  for (const g of rt.army.groups) if (g.team === 1 && !g.civ && g.dmgMultPlayer == null && (g.dmgMult ?? 1) < 0.5) { g.dmgMultPlayer = 0.7; g.dmgMultPlayerMelee = true; }   // 21:25：囲みを四人までにした後 act bot 受けた傷 0〜12 → 0.55→0.7
  // 11/18 22:10 クラウド 紀州の持ち主：act bot 21:55「簡単すぎる・受けた傷 足軽0・侍0」（本人の軽い突きの連打で雑賀の侍の振りが毎回止まる）。
  //   雑賀の侍・侍大将は本人の軽い突きでは振りを止めない（根白坂・八王子・木津川口と同じ共通の u.poiseVsP。数と強さは変えない）
  for (const g of rt.army.groups) if (g.team === 1 && !g.civ) for (const u of g.units || []) if (!u.poiseVsP && (u.type === 'samurai' || u.type === 'busho')) u.poiseVsP = true;
}
// 段ごとの行き先の印（s1〜s5 の pin と同じ所）
const STEP_PIN = [P.work, P.work, P.weir, P.breach, P.bridge];
const def = {
  // 11/19 係 army-08（kaito「天王寺レベルの軍勢」）：パソコンは布陣の表の分を上限に足す＝筋書きの新手の空きは前と同じ。携帯は今まで
  realCap: TOUCH ? 250 : 250 + fujinRealN('t04b_ota'),
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: 0.3 },
  noWake: true, noTaishoRaid: true, noDespair: true, noFrontFill: true,
  // 11/18 17:30 クラウド 紀州の持ち主：act bot「⑤の終わりに (42,-19)⇄(45,-24) と一息で飛ぶ」の元は使番の騎馬。この戦は本陣の備（rt.sonae）も大将も持たず、
  //   使番の帰る所が本人の足元になり、水の満ちた崩れ目のそばで控えては置き直され、十m 余り飛んでいた（描かずの通し 404・455・464秒）。
  //   使番の知らせは台詞（reports）で届くので、騎馬の使番は出さない
  noCouriers: true,
  stackAllAttack: true,   // 11/18 クラウド 紀州の持ち主：act bot 55秒 (-18,-104) で遠くの5人の組が attack のまま重なり止まる。狙い無しで重なる attack 組を渦に散らす
  keepMix: true, noCavalryMix: true, stageGoalsOnly: true, nearbyAllySignLimit: 0, playerTaken: 0.6,
  missionSingleLine: true, hideGuideSteps: true, noDodgeCard: true, noSiegeCards: true,
  noPursuit: true,   // 11/10 関所4：囲むだけの戦で「築堤の人夫、追撃」「秀吉の本陣、追撃」が中ほどに三つ並んだ（gunsei の追撃を止める）
  depth, lethal: true,   // 囲みの備（depth.js）と命懸けの戦場（lethal.js）
  // 11/16 iMac act bot：城方の共通の新手は城の内の北門の脇 (22,-24) に置かれ、十一人が一点に重なって立った（316秒・45組）。城の島（中心から三十八 m）の内には置かない
  //   （新手を止めると①が四十五秒静まり無傷で五十五人討てた＝止めない）
  // 味方の新手も城の内の北門の脇 (22,-24) で十人重なった（718秒）。両軍とも城の島（中心から三十八 m）の外だけ
  // 11/18 クラウド（太田の持ち主）：reserveOk を持つ戦は共通の「行き先の印より遠くへ置かない」が外れる。④崩れ目（東 60,-18）を守る間、
  //   止まりで九十 m 奥へ下げた敵の新手が西の堀端 (-30,-17) に立ち、遠くで考えを間引かれたまま味方と四 m で二十秒立ち尽くした（act bot 425秒 ★★）。
  //   敵の新手は今の段の印から七十二 m の内だけに置く（味方の新手は今まで通り）
  reserveOk: (rt, p, foe) => Math.hypot(p.x, p.z) > 38 && (!foe || ((q) => !q || Math.hypot(p.x - q.x, p.z - q.z) <= 72)(STEP_PIN[(rt.flags.step || 1) - 1])),
  // 11/19 01:30 クラウド 紀州の持ち主：act bot（POSLOG）③④で共通の敵の新手が三十〜七十四人 本人の二十五m 内へ駆け寄り、本人の二歩内に敵五〜十人・討ち取りが三百秒止まった（3遊びに2）。
  //   ③④は段の筋書きの雑賀衆（小舟・松明・崩れ目・水を渡る・頭の組）と戦う場なので、敵の新手は出さず待つ備として並べるだけ（二線として見えたまま）
  reserveRelease: (rt) => (rt.flags.step || 1) < 3,
  // 11/19 02:10 クラウド 紀州の持ち主：それでも act bot（02:00 二戦目）③④で「新手 attack 備」が三十四〜四十五人 本人の二十五m 内に寄り、③④の討ち取り0・名のある将0。
  //   待つ備は十八m に敵（味方の兵）が来ると待ちを解く（depth_reserve の engageNear）ので、③④の間は筋書きの「まだ寄せない」で解かせない
  reserveWait: (rt) => { const s = rt.flags.step || 1; return s >= 3 && s < 5; },
  reserveFold: (rt) => rt.flags.step >= 5,   // ⑤開城では待つ備を畳む（新手が使者の段で本人を討った。11/14 クラウドゆ）
  meleeGrace: { rate: 1, burst: 1, interval: 3 }, flagEra: { toyotomi: 'kiri53' },
  // 11/19 クラウド kaito2（見た目の見回り 874×402 の200秒）：③の堰の口で、肩越しの二〜四m の味方の幟の布が画面の上と左を大きく覆った。
  //   ほかの戦（桶狭間・設楽原・大河内など）と同じく、近い旗布は六m まで描く間だけ避け、目のすぐ脇の長柄も避ける（兵と当たりは残す）
  nearFlagFadeRadius: 6, nearLongWeaponRadius: 3.2,
  meleeGuide: () => false, guardGuideAllowed: () => false, castleFall: false,
  date: () => '天正十三年四月　春・晴',
  introPlace: '紀伊国 太田城　三月末〜四月',
  introText: '根来寺の後、雑賀衆は太田城へ籠もった。羽柴勢は城を力で攻めず、堤で囲んで水を入れる。築堤を守り、水で囲み、開城の使者を迎えよ。',
  history: '根来寺の後、雑賀の衆は太田城に籠もった。秀吉は城を囲む堤を築かせ、紀の川の水を引き入れて水攻めにした。堤は全長およそ五〜七キロメートルと復元される。城方の打ち出しや、堤の一部が崩れた伝えもある。四月二十二日に城は開け渡され、紀州の戦は収まった。築堤の護衛や堰の守り、崩れ目の守りの段は遊びの補い。',
  sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '雑賀衆', mon: 'maru' } },
  // 11/18 クラウド K358：討った数×25 だと200秒で 5,000→2,825、和睦の開城の前に 0 になり「城兵が全員死んだのに開城」と食い違う。
  //   段の進みで減らし（五段で四割まで）、段の中は討った数で少しずつ。開城は城兵が生きて出る
  force: (rt) => { const F = rt.flags, s = Math.max(0, Math.min(5, (F.step || 1) - 1)), k = Math.min(1, ((F.ek || 0) - (F.ekBase || 0)) / 50);
    return { a0: 100000, b0: 5000, a: Math.max(0, 100000 - (F.ak || 0) * 30), b: Math.round(5000 * (1 - 0.6 * (s + k * 0.9) / 5)) }; },
  world: {
    noFake: true,   // 11/14 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    moveWay: (army, u, want) => route(u, want),
    seed: 158504, time: 'day', height: otaHeight, softPathSoil: true, muddy: 0.2,
    trees: 100, tufts: 900, fogFar: 330,
    clear: (x, z) => Math.hypot(x, z) < 125,
    paths: [[[0, -85], [0, -25]], [[-34, -120], [-26, -62]]],
  },
  setup(rt) {
    const F = rt.flags;
    F.ek = 0; F.ak = 0;
    // 11/18 08:15 クラウド 紀州の持ち主（⑥ 476秒の写真「堤の斜面に黒い横筋」）：討たれた旗持ちの幟の布が、草の上に寝た黒い長い板に見えた。
    //   道明寺・木津川口・岩村と同じく、落ちた幟は竿だけ残し布を隠す
    { const A = rt.army, dw = A && A.dropWeapon; if (dw) A.dropWeapon = function (u) { dw.call(this, u); if (u.dropped?.userData?.standard && u.standardFlag && u.dropped.parent === this.scene) u.standardFlag.visible = false; }; }
    // 任務は右上の一行で読む。中央の同じ文が命の棒を覆わず、行き先の印も消さない。
    if (!document.getElementById('ota-notices-style')) {
      const style = document.createElement('style');
      style.id = 'ota-notices-style';
      style.textContent = `
html:root body #hud:has(#h-prog[data-battle="t04b_ota"]) #center-call .cc.blue { display:none !important; }
html:root body #hud:has(#h-prog[data-battle="t04b_ota"]):not(:has(#center-call .cc:not(.blue))) #goal-sign .gs-tag { opacity:1 !important; }`;
      document.head.appendChild(style);
    }
    build(rt);
    rt.setPhase('fight');
    K.start(rt);
  },
  onKill(rt, u) { const F = rt.flags; if (F.ekStep !== F.step) { F.ekStep = F.step; F.ekBase = F.ek; } if (u.team === 1) F.ek++; else F.ak++; },
  // 11/19 クラウド 紀州の持ち主（act bot 17:53「16分で131人斬った・簡単すぎる・もっと強い奴と斬り合いたい」・受けた傷 足軽0・侍0・鉄砲0）：
  //   雑賀衆は護衛や人夫の組とばかり打ち合い、本人は横から突くだけだった。①〜④の間、本人の十m 内の雑賀の刀・槍の者を四人まで本人へ向き直らせる
  //   （鳥取の pressPlayer と同じ形。数・強さは変えない）。命が半分を切ったら向けない
  //   18:30：直した後も act bot 一回は③④で討ち取り0（本人の近くに雑賀衆が来ず、味方の大勢が先に討っていた）。②〜④で本人の十二m 内に敵が居ない時、
  //   六十m 内の一番近い雑賀の組を一つ、十五秒まで本人へ向ける（有岡・河田と同じ形。一度に一組・数と強さは変えない）
  //   11/18 20:10 クラウド 紀州の持ち主：act bot 二回とも「受けた傷 侍0」・討ち取り59/71。雑賀の組は kit の既定で攻め 0.24 倍（味方の組と打ち合う時の加減）が本人にも効いていた。
  //   本人に当たる刃だけ 0.55 倍まで上げる（鉄砲・弓は変えない＝dmgMultPlayerMelee。K360⑦ 敵の手加減外し）
  // 11/19 06:40 クラウド 紀州の持ち主：堤の後詰が持ち場へ戻った後も歩みの下知のまま（止まり ord=move (-40,-65) 二百秒）。持ち場の三m 内なら構えに戻す（一秒に一度）
  update(rt, dt) { const F0 = rt.flags, gz = F0.otaGozume; if (gz && !F0.gozumeOut && gz.order === 'move' && gz.dest && rt.t > (F0.gzHomeAt || 0)) { F0.gzHomeAt = rt.t + 1; const c = gz.center(); if (c && Math.hypot(c.x - gz.dest.x, c.z - gz.dest.z) < 3) { gz.onArrive = null; gz.order = 'hold'; gz.dest = null; gz.stay = true; } }
    waterTick(rt, dt); bladeTick(rt); const me = rt.player.u; if (me.alive) { guardTick(rt); passBy(rt); mobCap(rt); if ((rt.flags.step || 1) < 5 && !rt.flags.ending && me.hp > (me.maxHp || 100) * 0.5) { if (!(rt.flags.chiefClose > rt.t)) pressPlayer(rt); huntTick(rt); } K.tick(rt, dt); } },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objDone('main'); rt.player.u.invuln = true; fallB(rt);
    rt.award((t) => { t.main = true; }, '太田城の開城を迎えた');
    rt.banner('太田城、開城', '水に囲まれた城が門を開く');
    rt.say('太田左近', '太田城を明け渡します。城の者の命をお助けください', 4);
    // 11/18 K306：史実では太田左近ら主だった五十余人の首を取り、ほかの城の者は助けて、刀と鉄砲を取り上げて村へ返した（刀狩の始まり）
    rt.after(4.5, () => rt.say('羽柴秀長', '主だった者の首だけを取る。ほかの者は刀と鉄砲を置いて村へ帰れ', 3.8));
    rt.after(9, () => rt.say('足軽', '城から出て来るのは、百姓の顔ばかりじゃ……', 3));
    rt.after(12.5, () => rt.say('羽柴秀吉', '雑賀の鉄砲もみな取り上げよ。百姓は鍬を持て。これで紀州は収まる', 4));
    rt.finish({ scriptedEnd: true }, 18);
  },
};
const K = stageRun(def, 't04b_ota', [s1, s2, s3, s4, s5], { way: route });
export const t04b_ota = def;
