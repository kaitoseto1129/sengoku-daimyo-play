// ======================================================================
// 徳川編 16　秘密の戦「天下分け目の淀の野」（もしもの戦・元和元年 1615 五月）
// 筋書きの正：docs/chapter3_tokugawa.md の「出世と軍勢・秘密の最後の戦（kaito 11/1 夜）」
// 徳川編の15戦にすべて勝つと開く（tokugawa_secret.js）。史実ではない。
// 大坂の陣の後、大将になった主人公が二万を率いて、京へ戻る家康の三万と淀の野で戦う。家康を討ち、征夷大将軍に任じられる。
// 大軍は軽い作り（addDistantArmy・addClash）。本物の兵は自分の組・二つの備・段の敵・家康の旗本だけ（250人より少なく）。
// 段：①藤堂の先手を破る ②井伊の赤備えの横槍を受け止める ③家康の本陣へ寄せる ④家康を討つ
// 勝った後：勅使が将軍の位を告げ、出世の道（足軽→…→天下人→征夷大将軍）を一段ずつ灯して締める。
// 負け方：討たれる・刻限（七分）。
// 向き：北が -z（家康の本陣・京の方）。自分の軍は南（+z）から北へ。
// ======================================================================
import { nobori, tawara, hut } from './props.js';
import { RANKS, LADDER } from './state.js';
import { STAGES } from './stages.js';
import { sfx } from './audio.js';
import { gauss, enemyGroup, allyGroup, nm } from './bhelp.js';
import { KIT } from './b_nagashinojo.js';
import { camp } from './b_mid.js';
import { clash } from './b_sekigahara.js';
import * as DP from './b_depth.js';
import { depthStart, depthTick, depthBot } from './b_depth.js';

const HQ = { x: 0, z: -118 };            // 家康の本陣（小高い丘）
const FRONT = { x: 0, z: 4 };            // 先手どうしがぶつかる所
const LIMIT = 420;                       // 刻限（秒）
const OWN = { armor: 0x3a2a22, lace: 0xb8342a, flag: 'maru' };   // 主人公の軍（丸の旗・朱の威）
const II = { armor: 0x8e1f16, lace: 0xb8342a, flag: 'ii' };
const TODO = { flag: 'todo' };
const TK = { armor: 0x24221f, flag: 'tokugawa' };
const dress = (list, lk) => list.map((s) => ({ ...s, o: { ...lk, ...(s.o || {}) } }));
const gone = (g) => !g || g.count === 0 || g.routed;
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uG = (n) => ({ type: 'gun', n }), uC = (n) => ({ type: 'cavalry', n });

function height(x, z) {
  let h = 0.35 * Math.sin(x * 0.03) * Math.cos(z * 0.025) + 0.2 * Math.sin(z * 0.05 + x * 0.02);
  h += 5 * gauss(x, z, HQ.x, HQ.z - 6, 900);          // 家康の本陣の丘
  h += 3 * gauss(x, z, -120, 40, 1400) + 3 * gauss(x, z, 130, -30, 1600);
  h -= 1.6 * Math.exp(-((x + 150) ** 2) / 300);        // 西の淀川の低み
  return h;
}

const k16_secret = {
  spawn: { x: 4, z: 70, heading: Math.PI },
  minutes: 7,
  foeHit: 0.8,
  // 赤備えの騎馬と侍に囲まれ、三秒で倒れていた（bot 2回とも。11/2）。三万の中を斬り抜ける戦なので、受ける傷は六割五分に
  playerTaken: 0.65,
  world: {
    seed: 1615516,
    time: 'day',
    groundHalf: 260,
    paths: [[[0, 190], [2, 80], [0, 0], [0, HQ.z + 20]]],
    height,
    tint(x, z, h, c) {
      c.setRGB(c.r * 0.7 + 0.08, c.g * 0.8 + 0.1, c.b * 0.6 + 0.04);   // 初夏の青田と野
      if (x < -140) c.setRGB(c.r * 0.7, c.g * 0.75, c.b * 0.8);
    },
    clear: (x, z) => Math.abs(x) < 110 && z > -150 && z < 150,
    trees: 240,
    tufts: 2600,
    treeDensity: (x, z) => (Math.abs(x) > 115 || z < -160 || z > 160 ? 1 : 0.1),
    groves: [{ x: -96, z: -70, r: 12, n: 14 }, { x: 98, z: 60, r: 12, n: 14 }, { x: 30, z: HQ.z - 26, r: 10, n: 10 }],
    fleeOut: (x, z, team) => (team === 1 ? z < -190 : z > 200),
  },

  setup(rt) {
    const W = rt.world, F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false; F.begun = false;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KIT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);

    // ---- 家康の本陣（丘の上・金扇の馬印）。陣の後ろに旗本の控え ----
    F.camp = camp(rt, { x: HQ.x, z: HQ.z, facing: 0, team: 1, faction: 'tokugawa', mon: 'tokugawa', armor: TK.armor, uma: 'ogi', guard: 16, reserve: 320, runTo: { x: 0, z: -40 } });
    for (const [x, z, h] of [[-18, HQ.z + 10, 7], [18, HQ.z + 10, 7], [-34, HQ.z - 4, 6], [34, HQ.z - 4, 6]]) rt.scene.add(nobori(W, x, z, 'tokugawa', h));
    rt.scene.add(hut(W, -40, HQ.z - 24, 8, 5, 0.1), tawara(W, 40, HQ.z - 20, 0.2, 5));

    // ---- 大軍（軽い作り）：家康の三万（藤堂・井伊・松平・本多・旗本）と、自分の二万（左右の備・後ろの本隊） ----
    F.foeDA = [DA(-70, -60, 40, 14, 300, 0, TK.armor, 'todo', 161, 'spear'), DA(70, -60, 40, 14, 300, 0, II.armor, 'ii', 162, 'mixed'),
      DA(-64, -100, 30, 12, 260, 0, TK.armor, 'tokugawa', 163, 'gun'), DA(64, -100, 30, 12, 260, 0, TK.armor, 'tokugawa', 164, 'spear'),
      DA(-120, -110, 30, 14, 220, 0.3, TK.armor, 'tokugawa', 165, 'cavalry'), DA(120, -110, 30, 14, 220, -0.3, TK.armor, 'tokugawa', 166, 'spear')];
    F.ownDA = [DA(-30, 146, 46, 14, 320, Math.PI, OWN.armor, OWN.flag, 171, 'spear'), DA(30, 152, 46, 14, 320, Math.PI, OWN.armor, OWN.flag, 172, 'gun'),
      DA(0, 182, 60, 16, 300, Math.PI, OWN.armor, OWN.flag, 173, 'mixed')];
    for (const [x, z, h] of [[-10, 128, 7], [12, 128, 7], [0, 166, 8]]) rt.scene.add(nobori(W, x, z, OWN.flag, h));
    KIT.farVillage(rt, -150, 120, { rot: Math.PI / 2, n: 6, fields: 8, seed: 73 });

    // ---- 両翼の軽い大軍の押し合い（左＝自分の左備と藤堂、右＝右備と井伊） ----
    const own = (count, x = {}) => ({ flag: OWN.flag, armor: OWN.armor, count, team: 0, faction: 'oda', ...x });
    const foe = (flag, armor, count, x = {}) => ({ flag, armor, count, team: 1, faction: 'tokugawa', ...x });
    F.clash = [
      clash(rt, { x: -40, z: 32, facing: Math.PI, w: 50, gap0: 12, seed: 181, noRout: true, noWake: true, A: own(520, { guns: true }), B: foe('todo', TK.armor, 640, { guns: true }) }),
      clash(rt, { x: 44, z: 28, facing: Math.PI, w: 50, gap0: 12, seed: 182, noRout: true, noWake: true, A: own(520), B: foe('ii', II.armor, 640, { bows: true }) }),
    ];

    // ---- 味方の本物の兵：自分の組（大将の旗本）と、左右の備 ----
    F.left = allyGroup(rt, { faction: 'oda', name: '左の備', anchor: { x: -16, z: 52 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([uS(3), uA(16), uG(5)], OWN));
    F.right = allyGroup(rt, { faction: 'oda', name: '右の備', anchor: { x: 22, z: 52 }, facing: Math.PI, width: 14, aggro: 8, noRout: true, formation: 'yari' },
      dress([uS(3), uA(16), uC(4)], OWN));
    for (const g of [F.left, F.right]) { g.defMult = 1.2; g.dmgMult = 0.9; }
    // 控えは本物の兵に替えない（出だしで自分の真後ろの控えが二百人の本物になり、影の兵の中に埋もれていた。11/1）
    for (const [g, kind, seed] of [[F.left, 'spear', 91], [F.right, 'mixed', 92]]) {
      KIT.backOf(rt, g, { flag: OWN.flag, armor: OWN.armor, kind, w: 22, depth: 10, count: 160, gap: 20, seed }).army.noWake = true;
    }
    const n = RANKS[rt.G.rank].squad;
    rt.makeSquad({ x: 4, z: 64 }, Math.PI, [{ kind: 'spear', n: Math.max(10, Math.min(n || 10, 16)) }]);

    rt.world.setTime('day');
    rt.setPhase('brief');
    rt.obj('main', '二万を率いて、家康の本陣を討て', 'main');
    // 戦の前：もしもの戦と分かる見出し。家康の金扇が丘の上に見える
    rt.banner('もしもの戦　淀の野', '元和元年五月　大坂の陣の後');
    rt.marker('hq', { x: HQ.x, z: HQ.z }, '徳川家康', { red: true, h: 9 });
    rt.say('家臣', `殿、あの丘の金扇が家康の本陣にござる。三万`, 3.6);
    rt.after(4, () => rt.say(nm(rt), '足軽から槍一本で上がってきた。今日、天下を取る', 3.8));
    rt.after(8, () => rt.say('家臣', '二万、殿の采配を待っておりまする', 3.2));
    rt.after(11.5, () => this.begin(rt));
  },

  begin(rt) {
    const F = rt.flags;
    if (F.begun) return;
    F.begun = true; F.t0 = rt.t; F.step = 1;
    rt.setPhase('battle');
    sfx('horagai', 0.9);
    rt.after(1.2, () => sfx('taiko', 0.9));
    for (const C of F.clash) C.go();
    for (const m of F.ownDA.slice(0, 2)) m.advance(26, 12, {});
    const stepAt = () => (F.step >= 3 ? HQ : F.step === 2 ? { x: 6, z: -22 } : FRONT);
    const near = (p, r) => { const at = stepAt(); return Math.hypot(p.x - at.x, p.z - at.z) < r; };
    const ctx = { faction: 'tokugawa', flag: 'tokugawa', armor: TK.armor, dmg: 0.5, mass: 200, scale: 1.15, look: (l) => dress(l, TK), backGap: 22,
      // 備は段ごとに段の場所へ送る（近くの備だけに絞ると、遠い左の備が持ち場に立ち尽くし、赤備えの段で主人公が一人になった。11/2）
      friends: () => [F.left, F.right].filter((g) => g && g.count && !g.routed), botSeek: 40,
      // 備が減ったら旗本の新手が追いつく
      aid: { name: '旗本の新手', faction: 'oda', flag: OWN.flag, list: dress([uS(3), uA(10)], OWN) },
      // 息を整える先は段の場所の近くだけ。両翼の押し合いへ流れた備を頼って、西の端まで下がっていた（11/1）
      botBackAllowed: (b, x, z) => near({ x, z }, 45),
      // 段の場所から50m より遠い敵（両翼の大軍から替わった兵）は追わない。家康の段で東の端まで追って刻限が切れていた（11/1）
      // ただし斬りかかってくる間近の敵は払う（遠いからと構わずにいて、控えから替わった兵に囲まれ倒れていた。11/2）
      botFoeAllowed: (o) => near(o.pos, 50) || Math.hypot(o.pos.x - rt.player.u.pos.x, o.pos.z - rt.player.u.pos.z) < 5 };
    depthStart(rt, ctx, [
      // ① 藤堂の先手を破る
      DP.fight({ at: FRONT, title: '先手の激突', sub: '藤堂高虎の先手', obj: '藤堂の先手を破れ', max: 110,
        say: [[nm(rt), '者ども、かかれっ！']],
        foes: () => [{ name: '藤堂高虎の先手', from: { x: -4, z: FRONT.z - 22 }, list: dress([{ type: 'busho', n: 1, o: { name: '藤堂高虎', horse: true } }, uS(3), uA(12), uG(4)], TODO), mass: 160, morale: 70 }],
        later: [{ t: 26, say: ['家臣', '藤堂の二の手が出てきた！'], foes: () => [{ name: '藤堂の二の手', from: { x: 14, z: FRONT.z - 24 }, list: dress([uS(2), uA(10)], TODO), mass: 140 }] },
          { t: 50, say: ['家臣', '藤堂の槍がまだ来る！'], foes: () => [{ name: '藤堂の槍組', from: { x: -16, z: FRONT.z - 26 }, list: dress([uS(1), uA(10)], TODO), mass: 120 }] }],
        reward: '藤堂の先手を破った', onEnd: (rt2) => this.flank(rt2) }),
      // ② 井伊の赤備えの横槍を受け止める
      DP.hold({ at: { x: 6, z: -22 }, dur: 70, r: 16, label: '踏みとどまる所', title: '赤備えの横槍', sub: '井伊直孝の騎馬が東から',
        obj: '赤備えの横槍を受け止めよ',
        waves: [
          { t: 4, say: ['家臣', '東から赤備え！　井伊の騎馬じゃ！'], foes: () => [{ name: '井伊直孝の赤備え', from: { x: 54, z: -30 }, list: dress([{ type: 'busho', n: 1, o: { name: '井伊直孝', horse: true } }, uC(5), uS(3), uA(6)], II), mass: 200, noRout: 20 }] },
          { t: 24, say: ['家臣', '北から鉄砲衆！'], foes: () => [{ name: '徳川の鉄砲衆', from: { x: -14, z: -50 }, list: dress([uS(1), uG(7)], TK), formation: 'line', seek: 60, mass: 90, kind: 'gun' }] },
          { t: 44, say: ['家臣', '赤備えの二の手じゃ！'], foes: () => [{ name: '井伊の二の手', from: { x: 50, z: -10 }, list: dress([uS(3), uA(8)], II), mass: 160 }] },
        ],
        reward: '赤備えの横槍を受け止めた', onEnd: (rt2) => this.charge(rt2) }),
      // ③ 家康の本陣の前へ
      DP.move({ to: { x: 0, z: HQ.z + 34 }, label: '家康の本陣', r: 9, max: 70, obj: '家康の本陣へ寄せよ',
        say: [[nm(rt), '狙うは家康の首ひとつ！　本陣へ！']],
        ambush: { d: 24, say: ['家臣', '旗本が丘を下りてくる！'], foes: () => [{ name: '家康の馬廻', from: { x: 12, z: HQ.z + 18 }, list: dress([uS(4), uA(6)], TK), mass: 160 }] },
        onEnd: (rt2) => this.hq(rt2) }),
      // ④ 家康を討つ
      // 家康は陣幕の口の前で迎える（幕の内に出すと、幕の後ろへ回って bot も遊び手も届かなかった。11/2）
      DP.fight({ at: { x: HQ.x, z: HQ.z + 20 }, title: '家康の本陣', sub: '金扇の馬印の下', obj: '徳川家康を討ち取れ', max: 140,
        say: [['徳川家康', '……来たか。わしの首、取れるものなら取ってみよ', 3.6]],
        foes: () => [{ name: '徳川家康', from: { x: HQ.x, z: HQ.z + 15 }, list: dress([{ type: 'busho', n: 1, o: { name: '徳川家康', horse: false } }, uS(4), uA(4)], TK), mass: 220, noRout: 99, morale: 100 }],
        later: [{ t: 22, say: ['家臣', '本多の旗本が守りに戻ってきた！'], foes: () => [{ name: '本多正純の旗本', from: { x: -22, z: HQ.z + 12 }, list: dress([uS(3), uA(6)], TK), mass: 160 }] }],
        reward: '家康の本陣を崩した', onEnd: (rt2, m, won) => (won ? this.win(rt2) : this.lose(rt2, '家康を討ち漏らした')) }),
    ], (rt2) => this.win(rt2));
  },

  // 先手を破った：左翼の藤堂が崩れはじめる。右から井伊が横槍
  flank(rt) {
    const F = rt.flags;
    F.step = 2;
    F.clash[0].push('A', 0.6);
    F.clash[1].cavalry('B', { from: -1, count: 80, flag: 'ii', armor: II.armor });
    rt.say(nm(rt), '左の備、押せ！　右は槍を揃えて待て！', 3.4);
  },

  // 赤備えを止めた：両翼の徳川が崩れる。総がかり
  charge(rt) {
    const F = rt.flags;
    F.step = 3;
    sfx('horagai', 1);
    F.clash.forEach((C, i) => rt.after(i * 3, () => C.rout('B', { from: 0, hideAfter: 50, minFight: 2 })));
    F.foeDA.slice(0, 2).forEach((m, i) => rt.after(4 + i * 3, () => m.rout({ hideAfter: 50 })));
    for (const m of F.ownDA) m.advance(70, 14, { charge: true });
    for (const g of [F.left, F.right]) if (!gone(g)) { g.order = 'move'; g.dest = { x: g === F.left ? -14 : 14, z: HQ.z + 40 }; }
    rt.banner('総がかり', '徳川の両翼が崩れた');
  },

  // 本陣の前：家康の旗本が出る
  hq(rt) {
    const F = rt.flags;
    F.step = 4;
    rt.unmark('hq');
    // 左右の備も本陣へ斬り込む。止まったままだと、主人公だけが旗本に囲まれて倒れていた（11/1）
    for (const g of [F.left, F.right]) if (!gone(g)) {
      g.order = 'move'; g.dest = { x: g === F.left ? -10 : 10, z: HQ.z + 18 };
      g.onArrive = (q) => { q.order = 'attack'; q.aggro = 12; q.seekRange = 26; };
    }
    F.foeDA.slice(2, 4).forEach((m, i) => rt.after(2 + i * 4, () => m.rout({ hideAfter: 50 })));
  },

  win(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objDone('main');
    rt.award((t) => { t.main = true; t.special = { label: '徳川家康を討ち取った', pts: 100 }; }, '徳川家康を討ち取った');
    rt.player.u.invuln = true;
    for (const u of rt.army.units) if (u.alive && u.team === 1 && u.name === '徳川家康') rt.army.damage(u, u.maxHp * 9, rt.player.u, { pierce: true });
    for (const m of F.foeDA) m.rout({ hideAfter: 40 });
    sfx('horagai', 1); rt.after(1, () => sfx('taiko', 1));
    rt.banner('家康、討ち取ったり', 'もしもの天下　元和元年五月');
    rt.say('家臣', '金扇が倒れた！　徳川の軍勢が退いていく！', 3.6);
    rt.after(4.5, () => rt.say(nm(rt), '……槍一本で始めた道が、ここまで来たか', 3.8));
    // 将軍の位を告げる会話（勅使）
    rt.after(9, () => { rt.banner('勅使', '京より'); rt.say('勅使', `${nm(rt)}殿を、征夷大将軍に任ずる`, 4.2); });
    rt.after(13.5, () => rt.say(nm(rt), '謹んで、お受けいたす', 3));
    rt.after(16.5, () => rt.say('家臣', '将軍様じゃ！　我らが殿が、将軍様じゃ！', 3.4));
    rt.after(10, () => this.shogun(rt));
    rt.finish({}, 30);
  },

  // 終わりの場面：出世の道を下から一段ずつ灯し、最後に金の「征夷大将軍」（字は位の名だけ）
  shogun(rt) {
    if (typeof document === 'undefined' || rt.ended) return;
    const rm = document.body.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = [...LADDER.map((L) => L.name), '征夷大将軍'];
    const el = document.createElement('div');
    el.id = 'shogun-end';
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `出世の道。${steps.join('、')}`);
    el.innerHTML = `<style>
      #shogun-end { position: fixed; inset: 0; z-index: 40; pointer-events: none; display: flex; align-items: flex-end; justify-content: center; padding: 0 4vw 9vh; background: linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(10,8,6,.72) 100%); }
      #shogun-end ol { list-style: none; margin: 0; padding: 0; display: flex; align-items: flex-end; gap: 6px; }
      #shogun-end li { font: 600 13px/1.2 serif; color: #ece4d2; background: rgba(28,22,16,.82); border: 1px solid rgba(236,228,210,.3); padding: 6px 7px; writing-mode: vertical-rl; opacity: ${rm ? 1 : 0}; ${rm ? '' : 'animation: shgUp .5s ease-out forwards;'} }
      #shogun-end li.top { font-size: 18px; color: #2a1c08; background: linear-gradient(160deg, #f6e3a1, #c9a24a 60%, #f3d98a); border-color: #fff3c4; box-shadow: 0 0 18px rgba(240,200,110,.7); }
      @keyframes shgUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    </style><ol>${steps.map((s, i) => `<li class="${i === steps.length - 1 ? 'top' : ''}" style="margin-bottom:${i * 9}px;animation-delay:${(i * 0.45).toFixed(2)}s">${s}</li>`).join('')}</ol>`;
    document.body.appendChild(el);
    rt.flags.endEl = el;
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending || !rt.canFailMission()) return;
    F.ending = true;
    rt.setPhase('end');
    rt.objFail('main');
    rt.tracker.main = false;
    rt.banner('家康を討ち漏らした', '徳川の軍勢が持ち直した');
    rt.say('家臣', '殿、退きましょう！　天下は、また次に……', 4);
    rt.finish({ failureReason: why }, 6);
  },

  onFinish(rt) {
    const el = rt.flags.endEl;
    if (el) { el.remove(); rt.flags.endEl = null; }
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    if (F.ending) return;
    depthTick(rt, dt);
    // 家康は逃げない（旗本が減っても本陣に留まって戦う）
    if (F.step >= 4) for (const g of rt.army.groups) if (g.team === 1 && g.name === '徳川家康' && g.count) { g.noRout = true; g.morale = Math.max(g.morale, 60); }
    if (F.begun && rt.t - F.t0 > LIMIT) this.lose(rt, '刻限までに家康を討てなかった');
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
    if (v.team === 1 && v.name === '徳川家康') { this.win(rt); return; }
    if (v.type === 'busho' && v.team === 1 && v.name) {
      rt.say('家臣', `${v.name}、討ち取ったり！`, 2.8);
      rt.award((t) => { t.special = { label: `${v.name}を討ち取った`, pts: 30 }; }, `${v.name}を討ち取った`);
    }
  },
  onRout(rt, g) {
    // 影の大軍から替わった名の無い組（「備の兵」など）は言わない。同じ時に七つ崩れて同じ声が重なっていた（11/2）。言うのは8秒に一度まで
    const F = rt.flags;
    if (g.team !== 1 || !g.name || g.name === '徳川家康' || !/藤堂|井伊|本多|鉄砲衆|馬廻/.test(g.name) || rt.t < (F.routSaidT || 0)) return;
    F.routSaidT = rt.t + 8;
    rt.say('家臣', `${g.name}が崩れた！`, 2.4);
  },
};

// 両軍の総勢（もしもの数）：自分の二万、家康の三万。両翼が崩れると大きく減る
k16_secret.force = (rt) => {
  const F = rt.flags;
  const fall = F.step >= 3 ? Math.min(1, (rt.t - (F.t0 || 0)) / 400) * 14000 : 0;
  return { a: Math.max(0, Math.round(20000 - (F.ak || 0) * 25 - (F.step >= 2 ? 1500 : 0))), a0: 20000, b: Math.max(0, Math.round(30000 - (F.ek || 0) * 30 - (F.step >= 2 ? 3000 : 0) - fall)), b0: 30000 };
};
k16_secret.sides = { a: { name: '自分の軍', mon: 'maru' }, b: { name: '徳川軍', mon: 'tokugawa' } };
k16_secret.date = (rt) => `元和元年（1615）五月　夏・晴・${rt.t < 200 ? '朝' : '昼'}　もしもの戦`;
k16_secret.canSkip = (rt) => (rt.phase === 'brief' && rt.t > 3 ? '采配を振るまで待つ' : '');
k16_secret.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); };
k16_secret.history = 'この戦は史実ではない、もしもの戦である。元和元年（1615）五月、大坂夏の陣で豊臣家は滅び、徳川家康は天下の主となった。家康は翌年に世を去り、征夷大将軍の位は慶長十年（1605）からすでに子の秀忠が継いでいた。徳川の世は、この後二百六十年ほど続く。\n淀の野で家康を討ち、主人公が征夷大将軍になる筋は、足軽から出世してきた道の締めとして作った物語である。';
k16_secret.bushou = [{ name: '徳川家康', g: /家康/ }, { name: '井伊直孝', g: /井伊/ }, { name: '藤堂高虎', g: /藤堂/ }];

// 素直な遊び手：段の的へ
k16_secret.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.quickCmd = null;
  if (!u.alive || F.ending) return;
  if (F.dp && F.dp.on) { depthBot(b, inp, goTo); return; }
  inp.k.delete('KeyW');
  goTo(p, inp, 4, 60, 3);
};

const st = (k) => (rt) => (rt.flags.step || 0) >= k;
STAGES.k16_secret = [['藤堂の先手を破る'], ['赤備えの横槍を受け止める', st(2)], ['家康の本陣へ寄せる', st(3)], ['家康を討つ', st(4)]];

export { k16_secret };
export default k16_secret;
