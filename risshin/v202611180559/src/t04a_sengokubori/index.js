// 豊臣編 5　紀州征伐／千石堀城（約15分。docs/toyo15_plan_1108.md の 5）
// 強烈な短い城攻め：十万の寄せ手の遠景 → 外の木柵で担ぎ手を守る → 虎口の門前の大損害 → 二の丸の火と煙 → 本丸と煙硝蔵の炎上。
// 爽快さより「一つの小城を落とすだけでこれだけ死ぬ」。段の中身は s1〜s5、舞台は scene.js、段の運びは toyo15/kit.js。
import { stageRun, fallB } from '../toyo15/kit.js';
import { P, build, senHeight, route } from './scene.js';
import s1 from './s1_shingun.js';
import s2 from './s2_kisaku.js';
import s3 from './s3_koguchi.js';
import s4 from './s4_kaji.js';
import s5 from './s5_honmaru.js';
import { depth } from './depth.js';

const def = {
  spawn: { x: P.spawn.x, z: P.spawn.z, heading: 0 },
  noWake: true, noTaishoRaid: true, noDespair: true, noFrontFill: true,
  stackAllAttack: true,   // 11/18 クラウド 紀州の持ち主：act bot 171秒 秀吉の陣幕の後ろ (-18,-125) で遠くの備5人が attack のまま重なる★★。狙い無しで重なる attack 組を渦に散らす
  keepMix: true, noCavalryMix: true, stageGoalsOnly: true, nearbyAllySignLimit: 0,
  noPursuit: true,   // 11/10 関所4：木柵の段で「羽柴秀次の先手、追撃」「秀吉の本陣、追撃」と出たが、城攻めで誰も追っていない
  depth, lethal: true,   // 武将の備（depth.js）と命懸けの戦場（lethal.js）
  // ④二の丸は段の敵（本丸から下りた根来衆・根来の頭の組）が出る。待つ備の新手は足さず、一太刀を軽く（11/14 クラウドゆ act bot：④で新手に囲まれ受けた傷150が全部新手・447秒で倒れた）
  // 譲る設定だけでは、既に前へ出た新手が残り、⑤では再び補充される。
  // 城内は段ごとの守備隊と筒井・堀・長谷川の寄せ手で戦わせる。
  reserveFold: (rt) => rt.flags.step >= 4, reserveDmgMult: 0.45,
  // 開門前の新手は北の野に置く。隊列の端まで閉じた木戸や側塀から離す。
  reserveOk: (rt, p) => rt.flags.step >= 4 || p.z < -52,
  reserveWallOk: false,
  playerTaken: 0.5,   // 塀・楼・路地の鉄砲が絶えず撃つ。本人が数分で倒れないよう受ける傷を軽く（一宮城と同じ）
  meleeGrace: { rate: 1, burst: 1, interval: 3 }, flagEra: { toyotomi: 'kiri53' },
  meleeGuide: () => false, guardGuideAllowed: () => false,
  date: () => '天正十三年三月二十一日　春・夕',
  introPlace: '和泉国 千石堀城　三月二十一日',
  introText: '根来寺へ向かう二日前。十万の羽柴勢が紀州へ入った。根来衆の主力が千石堀城で待つ。北の土橋から寄せ、本丸まで攻め入れ。',
  history: '天正十三年（1585）三月、羽柴秀吉はおよそ十万で紀州へ向かい、和泉の根来・雑賀方の城を同じ日に攻めた。三月二十一日、千石堀城では羽柴秀次・筒井定次らが寄せ、城の鉄砲で寄せ手にも大きな損害が出た。火矢の火が煙硝蔵に入って城は焼け落ち、城の者はほとんど討たれたと伝わる。積善寺城・畠中城もこの前後に開け渡しや自焼で落ちた。担ぎ手を守る手順や段の分け方は遊びの補い。',
  sides: { a: { name: '羽柴勢', mon: 'toyotomi' }, b: { name: '根来衆', mon: 'maru' } },
  // 11/18 クラウド K358：討った数×12 だと木柵の段（200秒）で根来が 468 人まで減り、本丸の前に 0 になっていた。段の進みで減らし、段の中は討った数で少しずつ
  force: (rt) => { const F = rt.flags, s = Math.max(0, Math.min(5, (F.step || 1) - 1)), k = Math.min(1, ((F.ek || 0) - (F.ekBase || 0)) / 60);
    return { a0: 30000, b0: 1500, a: Math.max(0, 30000 - (F.ak || 0) * 40), b: F.ending ? 0 : Math.max(40, Math.round(1500 * (1 - (s + k * 0.9) / 5))) }; },
  world: {
    noFake: true,   // 11/14 K285（kaito「本物の兵しか映したらいけない」）：絵だけの兵（addDistantArmy・addClash・陣立ての軽い備）を作らない。映る兵は全員 戦の中の本物
    moveWay: (army, u, want) => route(u, want),
    seed: 15850321, time: 'dusk', height: senHeight, softPathSoil: true, muddy: 0, tabaSolid: true,
    trees: 260, tufts: 900, fogFar: 330,
    clear: (x, z) => Math.abs(x) < 58 && z > -185 && z < 95,
    paths: [[[0, -185], [0, -18]], [[0, -44], [47, -44], [47, 20]]],
  },
  setup(rt) {
    const F = rt.flags;
    F.ek = 0; F.ak = 0;
    // 11/11 クラウドか：act bot が毎回段2〜4（250〜340秒）で倒れた。構えずに受けた刃は共通の床で一太刀に命の二割五分（playerTaken .5 の後）、
    //   堀端の根来衆に囲まれて四太刀で討たれていた。弾は共通の takeBullet が組の dmgMult も playerTaken も通さず、塀の鉄砲（.05）でも一発一割六分。
    //   この戦だけ、刃の一太刀を六割に・十歩より遠い弾と矢を半分に（近くの鉄砲と刃の重さは残す）。
    { const P = rt.player, td = P.takeDamage; P.takeDamage = function (a, s) { const m = this.u.hitKind === 'gun' || this.u.hitKind === 'arrow'; const far = s?.pos && Math.hypot(s.pos.x - this.u.pos.x, s.pos.z - this.u.pos.z) > 10; const d = td.call(this, a, s); if (!(d > 0) || !s || s.isStruct) return d; return m ? (far ? d * 0.5 : d) : d * 0.6; }; }
    build(rt);
    rt.setPhase('fight');
    K.start(rt);
  },
  onKill(rt, u) { const F = rt.flags; if (F.ekStep !== F.step) { F.ekStep = F.step; F.ekBase = F.ek; } if (u.team === 1) F.ek++; else F.ak++; },
  update(rt, dt) {
    if (!rt.player.u.alive) return;
    K.tick(rt, dt);
    // 11/18 クラウド kaito2（K365 見回り）：③④の虎口と堀端で東の堀端の根来衆に三人以上囲まれ、一太刀ずつ受けて倒れた（act bot 3回中2回・277・286秒）。
    //   敵は強いまま（K360⑦）、山崎・木津川口と同じく四十五歩の内の味方の組（二つまで）が本人の所へ寄って囲みを割る（命三割五分の下なら二人で呼ぶ）
    const F = rt.flags, P = rt.player.u.pos, me = rt.player.u;
    if ((F.surT = (F.surT || 0) - dt) > 0) return;
    F.surT = 0.5;
    // 11/18 クラウド 紀州の持ち主：act bot 242秒★「西の堀端の根来衆」の鉄砲が move の下知のまま本人の1.8m で六秒何もしない。
    //   本人の二歩半の内に寄った鉄砲足軽（塀・楼の上は除く）は筒を置いて脇差で本人へ斬り掛かる
    //   11/18 クラウド act bot：二の丸の虎口の根来衆（attack）の鉄砲が本人の2.6m で六秒立つ（186秒）→ 三歩半の内・attack の組も
    for (const u of rt.army.units) if (u.alive && u.team === 1 && u.type === 'gun' && !u.sidearm && !u.perch && !u.fleeing && !u.downed && !u.isStruct && Math.abs(u.pos.x - P.x) < 3.5 && Math.abs(u.pos.z - P.z) < 3.5 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 3.5 && (u.group?.order === 'move' || u.group?.order === 'attack')) { rt.army.drawSidearm(u); u.target = me; }
    let n = 0; for (const u of rt.army.units) if (u.alive && u.team === 1 && !u.fleeing && !u.isStruct && Math.abs(u.pos.x - P.x) < 5 && Math.abs(u.pos.z - P.z) < 5 && Math.hypot(u.pos.x - P.x, u.pos.z - P.z) < 4.5) n++;
    if (n >= 3 || (n >= 2 && me.hp < me.maxHp * 0.35)) {
      const ns = rt.army.groups.filter((g) => g.team === 0 && !g.isPlayerSquad && !g.routed && !g.civ && !g.honjin && g.count >= 4).map((g) => { const c = g.center(); return { g, d: c ? Math.hypot(c.x - P.x, c.z - P.z) : 1e9 }; }).filter((x) => x.d < 45 && x.d > 3).sort((a, b) => a.d - b.d).slice(0, 2);
      for (const { g } of ns) if (!(g._rescueT > rt.t)) { g._rescueT = rt.t + 6; g.order = 'move'; g.dest = { x: P.x, z: P.z }; g.onArrive = (q) => { q.onArrive = null; q.order = 'attack'; q.aggro = 12; q.seekRange = 16; }; }
    }
  },
  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true; rt.setPhase('end'); rt.objDone('main'); rt.player.u.invuln = true; fallB(rt);
    rt.award((t) => { t.main = true; }, '千石堀城の本丸まで攻め入った');
    // 余韻：勝鬨ではなく、焼け落ちる城と死人の多さ。次の根来寺への伏線
    rt.say('羽柴秀次', '……落ちた。一つの小城に、これほどの死人か', 4.5);
    rt.after(5, () => rt.say('組頭', '根来の者は、最後の一人まで撃ってきました', 4));
    rt.after(10, () => rt.say('使番', '殿下より御下知。明後日、根来寺へ攻め入る', 4));
    rt.after(15, () => rt.say('羽柴秀吉', '根来寺へ進め。大塔は焼かせるな', 4));
    rt.finish({ scriptedEnd: true }, 22);
  },
};
const K = stageRun(def, 't04a_sengokubori', [s1, s2, s3, s4, s5], { way: route });
export const t04a_sengokubori = def;
