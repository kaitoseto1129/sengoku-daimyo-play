// 豊臣編 7　紀州征伐／太田城（約15分。docs/toyo15_plan_1108.md の 7）
// 水攻め：巨大な包囲陣 → 築堤の護衛 → 堰を開いて水を入れる（夕・小舟）→ 堤が崩れ、崩れ目を守る → 白旗と開城。
// 敵将を倒すのではなく、工事と包囲で勝つ。段の中身は s1〜s5、舞台は scene.js、段の運びは toyo15/kit.js。
import { stageRun, fallB } from '../toyo15/kit.js';
import { P, build, otaHeight, waterTick } from './scene.js';
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
  // 堰の迎撃で城の北西角まで寄った護衛は、北の塀の外を通って東の堤へ戻る。
  // 半径五十歩の内から直行すると、北西角で塀を横切ろうとして止まる。
  // 北の塀は z=-25。塀ぎわの -26〜-25 にいる兵も、先に北へ離してから東へ回す。
  if (u.group?.name === '築堤の護衛' && u.group.order === 'move' &&
      want.x > 30 && want.z < 0 && p.x < 30 && p.z > -40 && p.z < 0 &&
      (p.x < -23 || p.z < -25)) {
    q.x = p.z > -32 ? (p.x < -23 ? -30 : p.x) : 32;
    q.z = -34;
    return q;
  }
  const dp = Math.hypot(p.x, p.z), dw = Math.hypot(want.x, want.z);
  if (dp < 50 || dw < 50) return want;
  const a = Math.atan2(p.z, p.x), end = Math.atan2(want.z, want.x);
  let d = end - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= 0.2) return want;
  const v = a + Math.sign(d) * Math.min(0.15, Math.abs(d)), r = Math.max(68, Math.min(80, dp));
  q.x = r * Math.cos(v); q.z = r * Math.sin(v); return q;
}
const def = {
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: 0.3 },
  noWake: true, noTaishoRaid: true, noDespair: true, noFrontFill: true,
  keepMix: true, noCavalryMix: true, stageGoalsOnly: true, nearbyAllySignLimit: 0, playerTaken: 0.6,
  missionSingleLine: true, hideGuideSteps: true, noDodgeCard: true, noSiegeCards: true,
  noPursuit: true,   // 11/10 関所4：囲むだけの戦で「築堤の人夫、追撃」「秀吉の本陣、追撃」が中ほどに三つ並んだ（gunsei の追撃を止める）
  depth, lethal: true,   // 囲みの備（depth.js）と命懸けの戦場（lethal.js）
  meleeGrace: { rate: 1, burst: 1, interval: 3 }, flagEra: { toyotomi: 'kiri53' },
  meleeGuide: () => false, guardGuideAllowed: () => false, castleFall: false,
  date: () => '天正十三年四月　春・晴',
  introPlace: '紀伊国 太田城　三月末〜四月',
  introText: '根来寺の後、雑賀衆は太田城へ籠もった。羽柴勢は城を力で攻めず、堤で囲んで水を入れる。築堤を守り、水で囲み、開城の使者を迎えよ。',
  history: '根来寺の後、雑賀の衆は太田城に籠もった。秀吉は城を囲む堤を築かせ、紀の川の水を引き入れて水攻めにした。堤は全長およそ五〜七キロメートルと復元される。城方の打ち出しや、堤の一部が崩れた伝えもある。四月二十二日に城は開け渡され、紀州の戦は収まった。築堤の護衛や堰の守り、崩れ目の守りの段は遊びの補い。',
  sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '雑賀衆', mon: 'maru' } },
  force: (rt) => ({ a0: 100000, b0: 5000, a: Math.max(0, 100000 - (rt.flags.ak || 0) * 30), b: Math.max(0, 5000 - (rt.flags.ek || 0) * 25) }),
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
  onKill(rt, u) { if (u.team === 1) rt.flags.ek++; else rt.flags.ak++; },
  update(rt, dt) { waterTick(rt, dt); if (rt.player.u.alive) K.tick(rt, dt); },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objDone('main'); rt.player.u.invuln = true; fallB(rt);
    rt.award((t) => { t.main = true; }, '太田城の開城を迎えた');
    rt.banner('太田城、開城', '水に囲まれた城が門を開く');
    rt.say('太田左近', '太田城を明け渡します。城の者の命をお助けください', 4);
    rt.after(4.5, () => rt.say('羽柴秀長', '城の者は助けよ。刀を置いて出よ', 3.5));
    rt.after(9, () => rt.say('羽柴秀吉', '一人も斬らずに城が開いた。これで紀州は収まる。次は四国じゃ', 4));
    rt.finish({ scriptedEnd: true }, 18);
  },
};
const K = stageRun(def, 't04b_ota', [s1, s2, s3, s4, s5], { way: route });
export const t04b_ota = def;
