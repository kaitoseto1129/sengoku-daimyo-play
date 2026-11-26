// 今川家編 七戦目「寺部城の戦い」（永禄元年〔1558〕二月・三河国 寺部城）。軽い型・H3（docs/house_imagawa.md ②）
//   史実：寺部城主の鈴木重辰が織田方に付いた。今川義元は松平元康（のち家康）に初陣を命じ、元康は寺部城の周りを焼き攻めにした（『三河物語』B・豊田市の解説 C）。
//   元康の先手に主人公。帯（b_i10_okehazama.js の obiTick）を切らさず城下まで進む。字・札・ボタンは足さない。
import { lightBattle, uS, uA, uB, uG, busho } from './light_battle.js';
import { withCastle } from './light_castle.js';
import { TERABE_PLAN } from './castles/terabe.js';
import { gauss } from './bhelp.js';
import { jinmaku, nobori } from './props.js';
import { obiTick } from './b_i10_okehazama.js';

const SPAWN = { x: -170, z: 90 }, TERA = { x: 40, z: -10 }, HON = { x: -110, z: 60 }, ATO = { x: -150, z: 80 };
const MID = { x: -50, z: 30 }, FACE = (3 * Math.PI) / 4;
const IMAGAWA = { flag: 'imagawa', armor: 0x302e2a }, ODA = { flag: 'oda', armor: 0x24221f };
const height = (x, z) => 3 * Math.sin(x * 0.02 + 2) * Math.cos(z * 0.021) + 10 * gauss(x, z, TERA.x, TERA.z, 1700);

export const i07_terabe = withCastle(lightBattle({
  id: 'i07_terabe',
  date: '永禄元年（1558）二月　三河国 寺部城',
  intro: '寺部城の鈴木重辰が、織田に付いた。松平元康の初陣じゃ。あなたは元康の先手の足軽。',
  history: '永禄元年（1558）二月、寺部城主の鈴木重辰が今川を離れて織田に付いた。義元は松平元康に初陣を命じ、元康は城下を焼いて攻め、城方を追い込んだ（『三河物語』B・豊田市の解説 C）。',
  sides: { a: { name: '松平元康の先手', mon: 'imagawa', faction: 'imagawa' }, b: { name: '鈴木重辰の城方', mon: 'oda', faction: 'oda' } },
  force: { a: 1500, b: 400 }, allyLook: IMAGAWA, foeLook: ODA,
  allyDmg: 0.4, foeDmg: 0.55, friendsSend: 1, minutes: 5,
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: FACE },
  world: { seed: 1558, time: 'day', fogFar: 360 },
  allies: [
    { name: '松平元康の手', at: { x: SPAWN.x + 16, z: SPAWN.z - 12 }, face: FACE, list: [busho('松平元康'), uS(3), uA(8)] },
    { name: '今川の本隊', at: HON, face: FACE, list: [uS(2), uA(8)] },
    { name: '後ろの備', at: ATO, face: FACE, list: [uS(2), uA(6)] },
  ],
  steps: [
    { kind: 'rest', dur: 9, heal: 0, say: [['松平元康', '初陣じゃ。寺部の城下まで、列を切らさず詰める', 3.4], ['組頭', '帯が細うなったら、走って本隊を寄せよ', 3.2]] },
    { kind: 'move', at: MID, label: '城下の手前', obj: '細った帯をたどり、本隊を寄せながら進む', r: 16, max: 100,
      say: [['組頭', '先手だけ出れば、城から押し返される。本隊を寄せよ', 3.4]] },
    { kind: 'fight', at: { x: 10, z: 0 }, obj: '城下に出た寺部の城方を討つ', title: '城下', sub: '鈴木重辰の手', max: 120, limit: 110,
      say: [['鈴木重辰', '織田様が援けに来られる。城下で食い止めよ', 3.2]],
      foes: [{ name: '寺部の城方', from: { x: TERA.x - 6, z: TERA.z - 14 }, list: [busho('鈴木重辰', { horse: false }), uS(4), uA(13), uG(3)] }],
      later: [{ t: 30, say: ['組頭', '城の脇からも出た！　囲まれるな'], foes: [{ name: '寺部の別手', from: { x: TERA.x - 30, z: TERA.z + 20 }, list: [uS(2), uA(7)] }] }],
      reward: '寺部の城下で城方を退けた' },
    { kind: 'move', at: { x: TERA.x + 4, z: TERA.z - 2 }, label: '寺部城', obj: '城の門まで詰める', r: 14, max: 110,
      say: [['松平元康', '押せ。門まで詰めよ。これが初陣の手柄じゃ', 3.2]] },
    // K652② 足した段（11/25 Sanae・史実の流れの続き）
    { kind: 'fight', at: { x: TERA.x - 4, z: TERA.z + 6 }, obj: '寺部城の門の前で、鈴木の守りを崩す', title: '寺部城', sub: '鈴木の兵が門を固める', max: 120, limit: 120,
      say: [['松平元康', '門の前の兵を崩せ。城下に火をかける', 3]],
      foes: [{ name: '寺部の門の守り', from: { x: TERA.x + 2, z: TERA.z - 2 }, list: [{ type: 'samurai', n: 1, o: { name: '鈴木の組頭' } }, uS(3), uA(12), { type: 'bow', n: 4 }] }],
      reward: '寺部城の門の前の守りを崩した' },
    { kind: 'rest', dur: 8, heal: 0.3, say: [['使番', '広瀬と挙母から、寺部の後詰が来まする！', 3], ['松平元康', '城下に火をかけ、後詰を受けて退く', 3.2]] },
    { kind: 'hold', at: { x: 10, z: 0 }, label: '城下', obj: '火の手の上がる城下で、広瀬と挙母の後詰を受け止める', r: 16, dur: 70, title: '後詰', sub: '城下に火の手が上がる',
      say: [['組頭', '帯を切らすな。本隊はまだ後ろじゃ', 3]],
      waves: [
        { t: 3, foes: [{ name: '広瀬の後詰', from: { x: 50, z: -50 }, list: [{ type: 'samurai', n: 1, o: { name: '広瀬の組頭' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '挙母の兵じゃ！'], foes: [{ name: '挙母の後詰', from: { x: 60, z: 40 }, list: [uS(2), uA(10)] }] }],
      reward: '城下で後詰を受け止めた' },
    { kind: 'fight', at: { x: 40, z: 30 }, obj: '後詰の旗本を崩し、退く道を開ける', title: '退く道', sub: '後詰の旗本が道を塞ぐ', max: 120, limit: 120,
      say: [['松平元康', '道を開けよ。ここで初陣を終える', 3]],
      foes: [{ name: '後詰の旗本', from: { x: 50, z: 40 }, list: [busho('後詰の侍大将', { mustLive: false, invuln: false }), uS(3), uA(10)] }],
      reward: '後詰の旗本を崩した' },
    // K652② 足した段 二（11/25 Sanae・史実の流れの続き）
    { kind: 'hold', at: { x: MID.x, z: MID.z }, label: '帰り道', obj: '帰り道で、最後に追って来る寺部の兵を受け止めて退く', r: 16, dur: 70, title: '帰り道', sub: '寺部の兵が城から追って来る',
      say: [['松平元康', '帯を太く保て。列が切れねば、追手は怖くない', 3]],
      waves: [
        { t: 3, foes: [{ name: '寺部の追手', from: { x: 20, z: 0 }, list: [{ type: 'samurai', n: 1, o: { name: '鈴木の侍' } }, uS(3), uA(12)] }] },
        { t: 32, say: ['見張り', '弓じゃ！'], foes: [{ name: '寺部の弓', from: { x: 0, z: -20 }, list: [uS(1), { type: 'bow', n: 6 }, uA(4)] }] }],
      reward: '追手を受けて退いた' },
    // K674 足した段（11/26 Sanae・一戦10任務）
    { kind: 'fight', at: { x: TERA.x - 30, z: TERA.z + 20 }, obj: '焼けた城下で、逃げ出す鈴木の足軽を追い散らす', max: 100, limit: 90,
      say: [['松平元康', '町の口を押さえよ。城へ入れるな', 3.2]],
      foes: [{ name: '鈴木の足軽', from: { x: TERA.x - 18, z: TERA.z + 8 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '城下の足軽を追い散らした' },
    { kind: 'fight', at: { x: TERA.x + 20, z: TERA.z - 26 }, obj: '二の丸の門で、守りを固める鈴木の旗本を崩す', max: 100, limit: 90,
      say: [['松平元康', '二の丸の門を破れ', 3.2]],
      foes: [{ name: '鈴木の旗本', from: { x: TERA.x + 32, z: TERA.z - 38 }, list: [uS(2), uA(9), uB(2)] }],
      reward: '二の丸の門を破った' },
    { kind: 'hold', at: { x: TERA.x + 40, z: TERA.z + 10 }, label: '街道の辻で、', obj: '街道の辻で、織田方へ逃れる鈴木の一族の殿を受け止める', r: 16, dur: 45,
      say: [['見張り', '一族が落ちて行く。殿が追って来るぞ', 3.2]],
      waves: [
        { t: 3, foes: [{ name: '鈴木一族の殿', from: { x: TERA.x + 52, z: TERA.z - 2 }, list: [uS(3), uA(9)] }] },
        { t: 22, foes: [{ name: '鈴木一族の殿', from: { x: TERA.x + 26, z: TERA.z + 24 }, list: [uS(2), uA(7)] }] }],
      reward: '街道の辻を守った' },
    // K656 K652⑥ 逸話の段（松平元康の初陣で、鈴木重辰は城下を焼かれて追い込まれた（『三河物語』B））。本人が斬る。字・札・ボタンは足さない
    { kind: 'fight', at: TERA, obj: '城下を焼かれた寺部城主・鈴木重辰の出撃を受け止めて斬り伏せる', title: '寺部城の城下', sub: '鈴木重辰、打って出る', max: 100, limit: 100,
      say: [['鈴木重辰', '初陣の若者に、城を焼かせるな！', 3], ['組頭', '元康様の初陣じゃ。重辰を城へ押し戻せ！', 3]],
      foes: [{ name: '鈴木重辰', from: { x: TERA.x + 12, z: TERA.z + -14 }, list: [busho('鈴木重辰', { mustLive: false, invuln: false, horse: false }), uS(2), uA(8)] }],
      reward: '初陣で鈴木重辰の出撃を受け止めた' },
  ],
  win: { banner: '寺部城', sub: '初陣を果たした', award: '寺部城の城下を破り、元康の初陣を支えた', say: [['松平元康', 'よう働いた。城は追い込んだ。この先、大きな戦が待っておる', 3.4]] },
  setup(rt) {
    const W = rt.world, F = rt.flags;
    for (const [dx, dz] of [[-8, 6], [8, 6]]) rt.scene.add(nobori(W, TERA.x + dx, TERA.z + dz, 'oda', 6));
    rt.scene.add(jinmaku(W, HON.x, HON.z, 12, 9, 6, { mon: 'imagawa' }));
    for (const [dx, dz] of [[-6, 4], [6, 4]]) rt.scene.add(nobori(W, HON.x + dx, HON.z + dz, 'imagawa', 5));
    F.obi = { a: 1, b: 1, t: 0 };
  },
  update(rt, dt) {
    const O = rt.flags.obi, i = rt.flags.dp?.on ? rt.flags.dp.i : -1;
    if (!O) return;
    if (i === 1) { O.a = Math.max(0.28, O.a - dt / 35); O.b = Math.max(0.28, O.b - dt / 45); }
    else if (i >= 2) { O.a = Math.min(1, O.a + dt / 6); O.b = Math.min(1, O.b + dt / 6); }
    obiTick(rt, dt);
  },
}), { plan: TERABE_PLAN, at: { x: TERA.x, z: TERA.z }, lift: 0, team: 1, life: false });
Object.assign(i07_terabe.world, {
  height, muddy: 0.2, groundHalf: 400, moveLim: 360,
  paths: [[[-260, 120], [-170, 90], [-50, 30], [40, -10]]],
  treeDensity: () => 0.9, clear: (x, z) => [SPAWN, TERA, HON, ATO].some((p) => Math.hypot(x - p.x, z - p.z) < 24), trees: 440, tufts: 1700,
});
export default i07_terabe;
