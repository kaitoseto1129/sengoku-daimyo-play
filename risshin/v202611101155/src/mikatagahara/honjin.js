// ======================================================================
// 三方ヶ原の戦い　「第一線崩壊→本陣の危機」の段（8〜12分。docs/mikatagahara_spec_1109.md）
// 平手の討死で第一線が崩れ、初めて「第二線まで退け」。本多忠勝の手が一時追手を止める。
// 使番「敵、御本陣へ！」で、逃げてくる味方の流れに逆らって家康の本陣へ戻り、旗本・馬廻と武田の前衛を受ける。
// 家康はまだ戦おうとし、家臣が退きを進める。本陣を支えたら、家康を浜松城へ退かせる段（本体の retreat）へ。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';

export const SECOND_LINE = { x: 22, z: 50 };   // 第二線（台地の南の端。佐久間の手と本多の手が踏みとどまる）
export const HONJIN = { x: 0, z: 26 };         // 家康の本陣（大馬印・旗本・馬廻）。第二線より北で、逃げる味方はここを南へ抜ける

// 逃げてくる味方：北の崩れた第一線から、本人の進む道を逆へ（南へ）流れていく。実兵は少しだけ、旗と人の流れで見せる。
function routStream(rt, K, n) {
  const F = rt.flags;
  F.mkRouters = F.mkRouters || [];
  for (let i = 0; i < n; i++) {
    const x = HONJIN.x + 6 + i * 7, z = HONJIN.z - 22 - i * 4;
    const g = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '崩れた徳川の手', anchor: { x, z }, facing: 0, width: 5, spacing: 1.4, aggro: 0, seekRange: 0, morale: 20, noRout: true },
      K.dress([{ type: 'ashigaru', n: 6 }, { type: 'samurai', n: 1 }], K.TOKU));
    if (!g || !g.count) continue;
    g.order = 'path'; g.retreatOnly = true; g.speed = 4.4;
    g.path = [[x - 4, HONJIN.z + 14], [SECOND_LINE.x - 6, SECOND_LINE.z + 26]]; g.pathIdx = 0;
    g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; };
    F.mkRouters.push(g);
  }
}

// K：本体から渡す道具 { rest, withstand, withdraw, uS, uA, uC, uB, gunLine, aka, dress, TOKU, adv, sub }
export function steps(K) {
  return [
    K.rest({ dur: 6, heal: 0, fn: (rt) => {
      const F = rt.flags;
      K.sub(rt, 'second', SECOND_LINE);
      sfx('kane', 0.45);
      rt.banner('第一線、崩れる', '平手の手が崩れ、逃げる兵が後ろへ流れる');
      // 第一線の味方は第二線へ。隊列は保てず、ばらばらに下がる。
      for (const g of [F.hirate, F.saku, F.toku]) if (g && g.count && !g.routed) {
        g.path = [[SECOND_LINE.x + (g === F.saku ? 6 : g === F.toku ? -8 : 0), SECOND_LINE.z - 4]]; g.pathIdx = 0;
        g.retreatOnly = true; g.order = 'path'; g.speed = 3.4;
        g.onArrive = (q) => { q.order = 'hold'; q.facing = Math.PI; q.retreatOnly = false; };
      }
      // 武田の旗が味方の陣の中へ（絵で戦況を見せる）
      for (const id of ['baba', 'naito', 'katsuyori', 'yamagata']) K.adv(F.bT?.[id], 22, 30, true);
    }, say: [['足軽', '前が崩れたがや！　退く道を空けろ！'], ['使番', '第二線まで退け！　佐久間殿の旗まで下がれ！']] }),
    K.withdraw({ to: SECOND_LINE, r: 10, label: '第二線', obj: '第二線まで退け', keepFriends: true, arrived: '第二線で息を整えよ',
      say: [['組頭', '背を見せて走るな！　後ろを見ながら下がれ！']],
      ambush: { d: 26, t: 10, title: '追いすがる騎馬', sub: '武田の騎馬が、崩れた所へ駆け込む', say: ['足軽', '騎馬じゃ！　逃げる者を追うとるがや！'],
        foes: () => [{ name: '追いすがる武田の騎馬', from: { x: SECOND_LINE.x + 18, z: SECOND_LINE.z - 30 }, list: [{ type: 'samurai', n: 1, o: { horse: true } }, K.uC(3)], mass: 160 }] } }),
    K.rest({ dur: 6, heal: 0, fn: (rt) => {
      const F = rt.flags;
      // 本多忠勝の手が第二線の前で追手を止め、退く道を作る（「本多の手がいるから一瞬持つ」）
      if (!F.hondaG) {
        F.hondaG = allyGroup(rt, { fixed: true, faction: 'tokugawa', name: '本多忠勝の手', anchor: { x: SECOND_LINE.x + 2, z: SECOND_LINE.z - 12 }, facing: Math.PI, width: 7, spacing: 1, aggro: 12, noRout: true, formation: 'yari' },
          K.dress([{ type: 'samurai', n: 1, o: { horse: true, name: '本多忠勝', hat: 'kabuto_m' } }, { type: 'samurai', n: 2 }, { type: 'ashigaru', n: 8 }], K.TOKU));
        const hu = F.hondaG?.units.find((u) => u.name === '本多忠勝');
        if (hu) { hu.invuln = true; hu.mustLive = true; }
      }
    }, say: [['本多忠勝', '本多平八郎がここを支える！　退く者は通れ！'], ['使番', '一大事！　敵、御本陣へ！　馬場・山県の手が本陣の脇へ回った！']] }),
    K.withdraw({ to: HONJIN, r: 9, label: '家康の本陣', obj: '家康の本陣へ戻れ', keepFriends: true, arrived: '本陣に着いた。上様の前を固めよ',
      onStart: (rt) => { K.sub(rt, 'go', HONJIN); streamOnce(rt, K); },
      say: [['組頭', '逃げる者に逆らって走れ！　上様の大馬印を目指せ！']] }),
    K.rest({ dur: 5, heal: 0, fn: (rt) => {
      const F = rt.flags;
      K.sub(rt, 'honjin', HONJIN);
      // 本陣はもう整っていない：陣幕を畳み、馬を引き、負傷者が運ばれる（旗本の構えを本陣の北へ）
      for (const g of [F.campA?.guard, F.campA?.general?.group]) if (g && g.count && !g.routed) {
        g.order = 'hold'; g.retreatOnly = false; g.facing = Math.PI; g.aggro = 10; g.seekRange = 14;
        for (const u of g.units) u._seat = null;   // 床几を今の本陣へ移す
      }
      sfx('horagai', 0.5);
    }, say: [['徳川家康', '退かぬ！　ここで武田を迎え撃つ、旗本は前へ出よ！'], ['石川数正', '殿、もはや軍は持ちませぬ！　浜松へお退きくだされ！']] }),
    K.withstand({ at: { x: HONJIN.x, z: HONJIN.z - 6 }, dur: 44, cap: 80, r: 16, title: '本陣の防ぎ', sub: '大将のそばまで武田が来た', label: '家康の本陣',
      obj: '本陣で武田の前衛を防げ',
      say: [['組頭', '上様の前を空けるな！　旗本と並べ！']],
      waves: [
        { t: 0, foes: () => [{ name: '本陣へ迫る武田の前衛', from: { x: HONJIN.x - 6, z: HONJIN.z - 34 }, list: [K.uS(2), K.uA(9)], formation: 'yari', mass: 300, dmg: 0.8 }] },
        { t: 12, say: ['足軽', '赤い旗だ……！　大馬印のすぐ向こうに赤備えがおる！'], foes: () => [{ ...K.aka([{ type: 'samurai', n: 1, o: { horse: true } }, K.uC(2), K.uS(1)]), name: '本陣の脇へ回った赤備え', from: { x: HONJIN.x + 26, z: HONJIN.z - 20 }, mass: 200, dmg: 0.8 }] },
        { t: 26, say: ['物見', '馬場の旗も来る！　後から後から寄せてくるぞ！'], foes: () => [{ name: '馬場信春の手', from: { x: HONJIN.x - 22, z: HONJIN.z - 28 }, list: [K.uS(1), K.uA(8)], formation: 'yari', mass: 300, dmg: 0.8 }] },
      ],
      reward: '本陣で武田の前衛を防いだ', lost: ['組頭', '本陣が破れる……！　上様をお連れせよ！'] }),
    K.rest({ dur: 5, heal: 0, fn: (rt) => {
      const F = rt.flags;
      K.sub(rt, 'escort', null);
      // 本陣はもう持たない。陣幕を畳み、家康を馬に乗せる。
      if (F.ieHost) try { F.ieHost.moveTo(4, 70, 30); } catch (e) { /* 遠景が無くても進む */ }
      for (const g of F.mkRouters || []) if (g.count && !g.routed) { g.path = [[g.anchor.x, 120]]; g.pathIdx = 0; g.order = 'path'; g.retreatOnly = true; }
    }, say: [['酒井忠次', '殿、御馬を！　ここは我らが捨て石になりまする！'], ['徳川家康', '……浜松へ退く。皆、離れるな！']] }),
  ];
}

// 退く途中の本陣へ、逃げる味方の流れを足す（本陣へ戻る段の始めに一度）
export function streamOnce(rt, K) {
  const F = rt.flags;
  if (F.mkStreamed) return;
  F.mkStreamed = true;
  routStream(rt, K, 4);
  rt.after(9, () => { if (!rt.over && !F.ending) routStream(rt, K, 3); });
  rt.after(3, () => { if (!rt.over && !F.ending) rt.say('足軽', '逃げろ！　武田が来る、浜松へ逃げろ！', 2.6); });
}
