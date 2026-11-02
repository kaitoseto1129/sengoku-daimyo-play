// ======================================================================
// 徳川編⑩　鴫野の戦い（慶長十九年十一月二十六日・1614　冬・曇り）　docs/chapter3_tokugawa.md の「10.」が正
// 大坂冬の陣。大坂城の東、大和川と平野川に挟まれた鴫野の堤を、上杉景勝の軍が攻める。
// 豊臣方の前の陣を崩したが、大野治長の隊が鉄砲を揃えて反撃し、上杉勢は一時苦戦した（堤の一本道で押し合う）。
// 家康から退けの命が来ても、景勝と直江兼続は堤に踏みとどまり、堀尾忠晴・榊原康勝らの助けが着いて豊臣勢は城へ退いた。
// 自分は上杉の先手に付く部将。鴫野の前の陣を崩す → 大坂方の反撃を受けとめる → 退けの命でも堤に踏みとどまる
//   → 助けと共に押し返す。勝ち：豊臣勢を城へ退かせ、堤を守り通す。負け：堤を奪い返される・七分を過ぎる。
// 座標：北が −z、東が +x。堤（鴫野の道）は東西に z=0。大坂城は西（−x）の遠く。川筋・砦の置き場は推定。
// 地形：国土地理院の標高（大阪平野の低地）は平らなので、手書きの堤と湿地にした（標高の切り出しは残った事）。
// ======================================================================
import * as THREE from 'three';
import { distToPolyline } from './world.js';
import { nobori, hut, yagura, jinmaku, palisade } from './props.js';
import { allyGroup, nm } from './bhelp.js';
import { RANKS } from './state.js';
import { KIT } from './b_nagashinojo.js';
import { depthStart, depthTick, depthBot, rest, fight, hold, move } from './b_depth.js';
import { STAGES } from './stages.js';
import { TEGARA_ON } from './merit.js';

const ID = 'k10_shigino';
TEGARA_ON.add(ID);

// ---------------- 場所 ----------------
const SPAWN = { x: 122, z: 2 };   // 前の陣まで八十歩（寄せ始めてすぐ、堤の先の柵と守兵・乱戦が画面に入る）
const HONJIN = { x: 176, z: -6 };               // 上杉景勝の本陣（堤の東の端）
const POST = { x: 40, z: 0 };                   // 豊臣方の前の陣（鴫野の砦）
const HOLD1 = { x: 6, z: 0 };                   // 堤を押さえる持ち場
const HOLD2 = { x: 4, z: 0 };
const ROAD = [[190, 0], [150, 1], [100, 0], [40, 0], [-40, 1], [-120, 0], [-250, 0]];   // 鴫野の堤
const OYAMATO = [[-300, -78], [-150, -86], [0, -80], [150, -90], [300, -82]];            // 北の大和川
const HIRANO = [[-300, 74], [-150, 82], [0, 78], [150, 88], [300, 80]];                  // 南の平野川
const LIMIT = 420;                                // 七分

const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
function height(x, z) {
  // 低い湿地。堤の道だけが一段高い
  let h = 0.7 + 0.25 * Math.sin(x * 0.03) * Math.cos(z * 0.04);
  const rd = Math.abs(z - 0.5 * Math.sin(x * 0.02));
  h += 1.6 * sm(1 - rd / 12);
  const r1 = distToPolyline(x, z, OYAMATO), r2 = distToPolyline(x, z, HIRANO);
  const rv = Math.min(r1, r2);
  if (rv < 7) h -= (1 - rv / 7) * 1.4;
  // 北の端と南の端は低い丘（生駒の山並みへ向かって）
  h += Math.max(0, Math.abs(z) - 150) * 0.12;
  return h;
}

// 豊臣方の見た目：金瓢箪の馬印に、黒茶の具足
const TOYO = { flag: 'toyotomi', armor: 0x2a2622, lace: 0x6a3a2a, hatColor: 0x2e2a22 };
const look = (list) => list.map((q) => ({ ...q, o: { ...TOYO, ...(q.o || {}) } }));
const uS = (n) => ({ type: 'samurai', n }), uA = (n) => ({ type: 'ashigaru', n }), uB = (n) => ({ type: 'bow', n }), uG = (n) => ({ type: 'gun', n });
const UE = 'uesugi';
const HI = (rt) => !rt.G.lord && (rt.G.rank || 0) >= 3;

// ---------------- 小道具 ----------------
function buildStage(rt) {
  const W = rt.world, S = rt.scene;
  // 前の陣：堤をふさぐ柵と井楼、豊臣の旗（堤の道は空けない＝柵は南北に張り、道の真ん中に門）
  for (let k = -3; k <= 3; k++) {
    if (Math.abs(k) <= 0) continue;
    S.add(palisade(W, [POST.x - 6, POST.z + k * 3.4 - 1.7, POST.x - 6, POST.z + k * 3.4 + 1.7]));
  }
  S.add(palisade(W, [POST.x - 6, POST.z + 10, POST.x + 8, POST.z + 12]), palisade(W, [POST.x - 6, POST.z - 10, POST.x + 8, POST.z - 12]));
  S.add(yagura(W, POST.x - 2, POST.z - 8, { team: 1, mon: 'toyotomi' }));
  S.add(hut(W, POST.x - 14, POST.z + 8, 7, 5, 0.1, { h: 2.6 }), hut(W, POST.x - 16, POST.z - 8, 6, 5, 0, { h: 2.6 }));
  for (const [dx, dz] of [[-4, 6], [-4, -6], [4, 8], [4, -8], [-10, 0]]) S.add(nobori(W, POST.x + dx, POST.z + dz, 'toyotomi', 5));
  // 上杉の本陣：幕と「竹に雀」でなく上杉の旗
  S.add(jinmaku(W, HONJIN.x, HONJIN.z, 14, 10, 6));
  for (const dz of [-8, 0, 8]) S.add(nobori(W, HONJIN.x - 6, HONJIN.z + dz, UE, 6));
  // 堤の北と南の水辺に蘆の群れ
  const reed = new THREE.MeshLambertMaterial({ color: 0x8a7a4a });
  const g = new THREE.ConeGeometry(0.25, 2.4, 4);
  const m = new THREE.InstancedMesh(g, reed, 420);
  const d = new THREE.Object3D();
  for (let i = 0; i < 420; i++) {
    const x = -260 + ((i * 97) % 520), side = i % 2 ? 1 : -1;
    const z = side * (14 + ((i * 53) % 24)) + Math.sin(i) * 3;
    d.position.set(x, W.heightAt(x, z) + 1.1, z); d.rotation.set(0, i, 0); d.scale.setScalar(0.8 + (i % 5) * 0.12); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
  }
  S.add(m);
  // 大坂城の方角（西の遠く）に、城の影と豊臣の大軍。上杉の後ろにも大軍
  KIT.farHost(rt, -130, -26, 30, 14, 260, Math.PI / 2, TOYO.armor, 'toyotomi', 1614, 'mixed');
  KIT.farHost(rt, -150, 30, 30, 14, 240, Math.PI / 2, TOYO.armor, 'toyotomi', 1615, 'spear');
  KIT.farHost(rt, 210, -20, 28, 14, 240, -Math.PI / 2, KIT.ARMOR.tokugawa, UE, 1616, 'spear');
  KIT.farHost(rt, 220, 24, 28, 14, 220, -Math.PI / 2, KIT.ARMOR.tokugawa, UE, 1617, 'mixed');
  KIT.farHost(rt, 120, -48, 24, 10, 160, -Math.PI / 2, KIT.ARMOR.tokugawa, UE, 1618, 'gun');
}

// ---------------- 段 ----------------
function ctxOf(rt) {
  const F = rt.flags;
  return { faction: 'oda', flag: 'toyotomi', armor: TOYO.armor, look, dmg: 0.6, mass: 170, fixedSpawn: true,
    friends: () => F.allies.filter((g) => g && g.count && !g.routed),
    aid: { name: '上杉の後続', faction: UE, flag: UE, list: [uS(1), uA(9)] }, aidSaid: '上杉の後続が加わった' };
}
function steps(rt) {
  const F = rt.flags, me = (r) => nm(r);
  return [
    rest({ dur: 15, heal: 0, say: [['直江兼続', '大坂城の東は川と沼ばかり。通れるのはこの鴫野の堤のみじゃ', 3.4],
      ['上杉景勝', '……行く', 2], [me, '先手を承りました', 2.4], ['直江兼続', '堤の上は一本道。幅は狭いが、止まれば撃たれるぞ。前の陣を一気に崩せ', 3.4]] }),
    fight({ at: POST, title: '鴫野の堤', sub: '豊臣方の前の陣を攻める', obj: (r) => (HI(r) ? '預かった手で堤を進み、前の陣を崩せ' : '堤を進み、豊臣方の前の陣を崩せ'),
      foes: () => [{ name: '前の陣の守兵', from: { x: POST.x - 6, z: POST.z }, list: [uS(2), uA(11), uG(4)], mass: 150 }],
      later: [{ t: 26, say: ['足軽', '城から加勢が堤を来る！'], foes: () => [{ name: '前の陣の加勢', from: { x: POST.x - 44, z: POST.z }, list: [uS(1), uA(9), uG(3)], mass: 100 }] }],
      max: 90, reward: '鴫野の前の陣を崩した', onEnd: () => { F.step = 1; } }),
    move({ to: HOLD1, obj: '堤を西へ進み、先手の持ち場へ', label: '堤の先手', r: 10, max: 55,
      say: [['上杉景勝の使番', '陣は崩した。堤の先で隊を整えよ。城から出てくるぞ', 3.5]] }),
    hold({ at: HOLD1, dur: 60, r: 14, title: '大野治長の反撃', sub: '鉄砲を揃えて堤を押し返してくる', label: '堤の先手',
      obj: '大野治長の反撃を受けとめ、堤を守れ',
      say: [['大野治長', '堤を取り返せ。一人も通すな。鉄砲、前へ！', 3.4]],
      waves: [
        { t: 4, say: ['足軽', '大野の鉄砲が堤に並んだぞ！', 3], foes: () => [{ name: '大野治長の鉄砲衆', from: { x: HOLD1.x - 50, z: 0 }, list: [uS(1), uA(8), uG(9)], mass: 190, dmg: 0.7 }] },
        { t: 28, say: ['足軽', '二陣が堤を押してくる。味方が崩れかけておる！', 3.2], foes: () => [{ name: '大野治長の本隊', from: { x: HOLD1.x - 60, z: 0 }, list: [{ type: 'busho', n: 1, o: { name: '大野治長', flag: 'toyotomi', invuln: true, horse: true } }, uS(2), uA(11), uG(4)], mass: 200, dmg: 0.7 }] },
      ],
      reward: '大野治長の反撃を受けとめた', lost: ['直江兼続', '堤を奪い返されるか……！'],
      onEnd: (r, m, won) => {
        if (!won) { shigino.lose(r, '堤を奪い返された'); return; }
        F.step = 2;
        // 苦戦：上杉勢の士気が下がる
        for (const g of F.allies) if (g && g.count) g.morale = Math.min(g.morale, 55);
      } }),
    rest({ dur: 12, heal: 0.15, calmRest: false, say: [['家康の使番', '大御所様の仰せ。川に挟まれた堤は危うい。一度退け、とのこと', 3.4],
      ['直江兼続', '……景勝殿。いかが', 2.4], ['上杉景勝', '退かぬ。ここで退けば、堤は取り返される', 3], ['直江兼続', '承知。皆、一歩も退くな。堀尾・榊原の助けが来るまで持て', 3.4]] }),
    hold({ at: HOLD2, dur: 50, r: 14, title: '退けの命でも踏みとどまる', sub: '助けが着くまで堤を離れない', label: '踏みとどまる',
      obj: '退けの命の中、堤に踏みとどまれ',
      waves: [
        { t: 3, say: ['足軽', '大野勢が総がかりじゃ！', 3], foes: () => [{ name: '大野勢の総がかり', from: { x: HOLD2.x - 56, z: 0 }, list: [uS(2), uA(12), uG(6)], mass: 210, dmg: 0.7 }] },
        { t: 24, say: ['足軽', '井上頼次の手も出てきた！　まだ来る！', 3.2], foes: () => [{ name: '井上頼次の手', from: { x: HOLD2.x - 62, z: 8 }, list: [{ type: 'busho', n: 1, o: { name: '井上頼次', flag: 'toyotomi', invuln: true } }, uS(1), uA(9), uG(3)], mass: 150 }] },
      ],
      reward: '退けの命でも堤を守り抜いた', lost: ['上杉景勝', '堤は渡せぬのに……'],
      onEnd: (r, m, won) => {
        if (!won) { shigino.lose(r, '堤を奪い返された'); return; }
        F.step = 3;
        // 堀尾忠晴・榊原康勝の助けが東から着く
        F.helpA = allyGroup(r, { name: '堀尾忠晴の手', faction: 'tokugawa', anchor: { x: 112, z: -2 }, facing: -Math.PI / 2, noRout: true, aggro: 14, seekRange: 16, morale: 95, dmgMult: 0.7 },
          [{ type: 'busho', n: 1, o: { name: '堀尾忠晴', invuln: true, horse: true, flag: 'tokugawa' } }, uS(2), uA(12), uG(4)]);
        F.helpB = allyGroup(r, { name: '榊原康勝の手', faction: 'tokugawa', anchor: { x: 120, z: 8 }, facing: -Math.PI / 2, noRout: true, aggro: 14, seekRange: 16, morale: 95, dmgMult: 0.7 },
          [{ type: 'busho', n: 1, o: { name: '榊原康勝', invuln: true, horse: true, flag: 'tokugawa' } }, uS(2), uA(12), uG(4)]);
        F.allies.push(F.helpA, F.helpB);
        for (const g of F.allies) if (g && g.count) g.morale = Math.max(g.morale, 80);
      } }),
    rest({ dur: 8, heal: 0.3, say: [['堀尾忠晴', '遅れたが間に合うた。景勝殿、ここからは共に', 3.2], ['榊原康勝', '一気に押し返しましょう', 2.6], ['直江兼続', '今じゃ。堤を西へ押し出せ', 2.8]] }),
    fight({ at: { x: HOLD2.x - 36, z: 0 }, title: '押し返す', sub: '助けと共に、豊臣勢を城へ追う', obj: '助けと共に堤を押し出し、豊臣勢を崩せ',
      foes: () => [{ name: '退き遅れた豊臣勢', from: { x: HOLD2.x - 70, z: 0 }, list: [uS(2), uA(12), uG(4)], mass: 160 }],
      later: [{ t: 22, say: ['大野治長', 'これまでじゃ。城へ退け！　退き鐘を打て', 3.2], foes: () => [{ name: '殿の組', from: { x: HOLD2.x - 80, z: 4 }, list: [uS(1), uA(8), uG(3)], mass: 80, noRout: 6 }] }],
      max: 90, reward: '豊臣勢を城へ追い返した', onEnd: () => { F.step = 4; } }),
  ];
}

export const k10_shigino = {
  spawn: { x: SPAWN.x, z: SPAWN.z, heading: -Math.PI / 2 },
  noReserve: true, noTaishoRaid: true,
  world: {
    seed: 1614, time: 'day', muddy: 0.4,
    paths: [ROAD],
    height,
    streams: [{ pts: OYAMATO, w: 10, depth: 0.8 }, { pts: HIRANO, w: 10, depth: 0.8 }],
    // 堤は乾いた土の色、水辺は湿った枯れ草、遠くは冬の田
    tint(x, z, h, c) {
      const rd = distToPolyline(x, z, ROAD);
      if (rd < 6) { const k = 0.6 * (1 - rd / 6); c.setRGB(c.r * (1 - k) + 0.46 * k, c.g * (1 - k) + 0.4 * k, c.b * (1 - k) + 0.3 * k); }
      else { const k = 0.4; c.setRGB(c.r * (1 - k) + 0.42 * k, c.g * (1 - k) + 0.4 * k, c.b * (1 - k) + 0.26 * k); }
    },
    clear: (x, z) => Math.hypot(x - POST.x, z - POST.z) < 26 || Math.hypot(x - HONJIN.x, z - HONJIN.z) < 16 || distToPolyline(x, z, ROAD) < 7,
    trees: 220, tufts: 3200,
    treeDensity: (x, z) => (Math.abs(z) < 14 ? 0 : 0.5),
    fleeOut: (x, z, team) => (team === 1 ? x < -230 : x > 240),
  },
  sides: { a: { name: '上杉景勝の軍', mon: 'uesugi' }, b: { name: '豊臣方（大野治長ら）', mon: 'toyotomi' } },
  date: () => '慶長十九年十一月　冬・曇り',

  setup(rt) {
    const F = rt.flags;
    F.step = 0; F.ek = 0; F.ak = 0; F.ending = false;
    buildStage(rt);
    // 味方：上杉景勝の旗本（本陣）と、直江兼続の手、自分が付く先手
    allyGroup(rt, { name: '上杉景勝の旗本', faction: UE, anchor: { x: HONJIN.x, z: HONJIN.z + 2 }, facing: -Math.PI / 2, fixed: true, noRout: true, aggro: 4 },
      [{ type: 'busho', n: 1, o: { name: '上杉景勝', invuln: true, horse: true, flag: UE } }, uS(3)]);
    F.allies = [
      allyGroup(rt, { name: '直江兼続の手', faction: UE, anchor: { x: SPAWN.x + 10, z: SPAWN.z - 8 }, facing: -Math.PI / 2, noRout: true, aggro: 12, morale: 95, dmgMult: 0.6 },
        [{ type: 'busho', n: 1, o: { name: '直江兼続', invuln: true, horse: true, flag: UE } }, uS(1), uA(9), uG(3)]),
      allyGroup(rt, { name: '上杉の先手', faction: UE, anchor: { x: SPAWN.x - 2, z: SPAWN.z + 8 }, facing: -Math.PI / 2, noRout: true, aggro: 12, morale: 95, dmgMult: 0.6 }, [uS(2), uA(16), uG(3)]),
      allyGroup(rt, { name: '上杉の二陣', faction: UE, anchor: { x: SPAWN.x + 16, z: SPAWN.z + 4 }, facing: -Math.PI / 2, noRout: true, aggro: 12, morale: 90, dmgMult: 0.55 }, [uS(1), uA(12), uG(4)]),
    ];
    for (const g of F.allies) KIT.backOf(rt, g, { flag: UE, armor: KIT.ARMOR.tokugawa, kind: 'spear', w: 14, depth: 8, count: 120, seed: 1614 + g.count });
    const n = RANKS[rt.G.rank]?.squad;
    if (n) rt.makeSquad({ x: SPAWN.x + 2, z: SPAWN.z + 4 }, -Math.PI / 2, [{ kind: 'spear', n }]);
    rt.after(10, () => { if (!F.ending) F.t0 = rt.t; });
    depthStart(rt, ctxOf(rt), steps(rt), () => shigino.retreat(rt));
  },

  update(rt, dt) {
    const F = rt.flags;
    KIT.backTick(rt);
    depthTick(rt, dt);
    if (!F.ending && F.t0 != null && rt.t - F.t0 > LIMIT && F.step < 4 && rt.canFailMission()) shigino.lose(rt, '日が傾き、堤を守り通せなんだ');
  },

  // 豊臣勢が城へ退く：勝ち
  retreat(rt) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    for (const g of rt.army.groups) if (g.team === 1 && g.count) { g.noRout = false; g.morale = 0; }
    rt.banner('鴫野、上杉の勝ち', '大野治長の隊は城へ退いた');
    rt.after(1, () => rt.say('大野治長', '堤は取れなんだ……城へ引け', 3.4));
    rt.after(5, () => rt.say('上杉景勝', '……鴫野の堤、確かに取った', 3.2));
    rt.after(9, () => rt.say('直江兼続', '大御所様の退けの命にも従わず、よう持ちこたえました', 3.6));
    rt.after(13, () => rt.say('家康の使番', '大御所様は軍令に背いた事をお咎めにならず、お褒めになられた由', 3.8));
    rt.tracker.main = true;
    rt.award((t) => { t.main = true; t.special = { label: '鴫野の堤を守り抜き、豊臣勢を退けた', pts: 15 }; }, '鴫野を守り抜いた');
    rt.after(3, () => rt.army.celebrate(0));
    rt.finish({}, 20);
  },

  lose(rt, why) {
    const F = rt.flags;
    if (F.ending) return;
    F.ending = true;
    rt.tracker.main = false;
    rt.banner('鴫野、破れる', why);
    rt.finish({ failureReason: why }, 6);
  },

  onKill(rt, v) {
    const F = rt.flags;
    if (v.team === 1) F.ek++; else F.ak++;
    KIT.carrion(rt, v);
  },
};
const shigino = k10_shigino;

// 兵数は諸説。上杉勢はおよそ五千、堀尾・榊原らの助けを合わせて一万に満たない。豊臣方の大野治長の隊はおよそ四千とする
k10_shigino.force = (rt) => {
  const F = rt.flags;
  const a = 5000 + (F.step >= 3 ? 2500 : 0) - (F.ek || 0) * 2;
  const b = Math.max(0, 4000 - (F.ek || 0) * 25 - (F.step || 0) * 300);
  return { a: Math.max(2000, a - (F.ak || 0) * 20), a0: 7500, b: F.ending && rt.tracker.main ? Math.min(b, 1500) : b, b0: 4000 };
};
k10_shigino.history = '慶長十九年（1614）十一月二十六日、大坂冬の陣。大坂城の東、大和川と平野川に挟まれた鴫野では、上杉景勝の軍が豊臣方の砦を攻めた。\n大野治長らは鉄砲を揃えて堤の上で反撃し、上杉勢は一時苦戦した。家康は退けを命じたと伝わるが、景勝と直江兼続は踏みとどまり、堀尾忠晴・榊原康勝らの助けも着いて、豊臣方は城へ退いた。同じ日、近くの今福でも佐竹義宣らと木村重成らが戦った。\n堤・砦・川筋の置き場、両軍の人数、台詞は遊びのための推定である。';
k10_shigino.botBrain = (b, inp, { goTo }) => {
  inp.quickCmd = null;
  if (!b.player.u.alive || b.flags.ending) return;
  depthBot(b, inp, goTo);
};

// 右上の一行（stages.js の作りをそのまま使う。共通の表は直さず、ここで足す）
const s = (n) => (rt) => (rt.flags.step ?? 0) >= n;
STAGES[ID] = [['堤を進み、豊臣方の前の陣を崩す'], ['大野治長の反撃を受けとめる', s(1)], ['退けの命でも堤に踏みとどまる', s(2)], ['助けと共に押し返し、豊臣勢を城へ退かせる', s(3)]];
