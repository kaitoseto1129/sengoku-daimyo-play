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
// 段ごとの行き先の印（s1〜s5 の pin と同じ所）
const STEP_PIN = [P.work, P.work, P.weir, P.breach, P.bridge];
const def = {
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: 0.3 },
  noWake: true, noTaishoRaid: true, noDespair: true, noFrontFill: true,
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
  reserveFold: (rt) => rt.flags.step >= 5,   // ⑤開城では待つ備を畳む（新手が使者の段で本人を討った。11/14 クラウドゆ）
  meleeGrace: { rate: 1, burst: 1, interval: 3 }, flagEra: { toyotomi: 'kiri53' },
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
  update(rt, dt) { waterTick(rt, dt); if (rt.player.u.alive) { guardTick(rt); passBy(rt); K.tick(rt, dt); } },
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
