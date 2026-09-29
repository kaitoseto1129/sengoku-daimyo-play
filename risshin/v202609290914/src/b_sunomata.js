// 墨俣の戦の定義（砦づくりと守り。battles.js から分けた。中身は元のまま）
import { palisade, bobosaku, kabukimon, tawara, hut, yagura, lumber, scaffold, umatsunagi, campfire, hasa, nobori, kagaribi, sakamogi, takataba, kobune, stumps } from './props.js';
import { gauss, allyGroup, nm, enemyGroup, centerOf, unitPos } from './bhelp.js';
import { nagashinojo } from './b_nagashinojo.js';
import { RANKS } from './state.js';
import { sfx } from './audio.js';
import { isTouch } from './touch.js';
import { K } from './settings.js';
import { moraleWord } from './hud.js';
import { volleyAt } from './b_okehazama.js';
import * as DP from './b_depth.js';
import { depthTick, depthStart } from './b_depth.js';
import { seasonOf, sky, uS, uA, uB, uG, uC } from './b_shared.js';
import { camp } from './b_mid.js';

// ======================================================================
// 第3戦　墨俣
// ======================================================================
const FORT = 18;
const ROAD3 = [[-176, 120], [-90, 86], [-36, 44], [0, 24]];
const ROAD3N = [[0, -176], [0, -24]];

function buildFort(rt) {
  const W = rt.world;
  const segs = [];
  const add = (ax, az, bx, bz, side, nx, nz) => {
    const s = rt.army.addStruct({ seg: [ax, az, bx, bz], side, nx, nz, hp: 240, maxHp: 240, team: 0, name: '柵' });
    s.mesh = palisade(W, s.seg);
    rt.scene.add(s.mesh);
    segs.push(s);
  };
  const st = (FORT * 2) / 8;
  for (let i = 0; i < 8; i++) {
    const a = -FORT + i * st, b = a + st;
    add(a, -FORT, b, -FORT, 'n', 0, -1);
    add(-FORT, a, -FORT, b, 'w', -1, 0);
    add(FORT, a, FORT, b, 'e', 1, 0);
  }
  for (const [a, b] of [[-18, -13], [-13, -8], [-8, -3], [3, 8], [8, 13], [13, 18]]) add(a, FORT, b, FORT, 's', 0, 1);
  return segs;
}

// 馬防柵：南北に長い柵を三重に。列の間は数メートル、ところどころに虎口（出入りの口）を空ける
// x0 が一列目（敵に近い側）、facing が敵の方向（+1 = x の正の向き）
export function buildBobosaku(rt, o) {
  const { x0, z0, z1, rows = 3, gap = 7, segLen = 6, gates = [], facing = 1, hp = 520 } = o;
  const W = rt.world, out = [];
  for (let r = 0; r < rows; r++) {
    const x = x0 - facing * r * gap;
    const off = (r % 2) * segLen * 0.5;   // 列ごとに口の位置をずらす
    for (let z = z0 + off; z < z1 - 0.5; z += segLen) {
      const a = z, b = Math.min(z1, z + segLen);
      const mid = (a + b) / 2;
      // 虎口：口の位置（列ごとに半区画ずらす）を含む区画は結わない
      if (gates.some((g) => { const gz = g + (r % 2) * segLen * 0.5; return gz >= a && gz < b; })) continue;
      const bend = Math.sin(mid * 0.05 + r) * 0.8;   // まっすぐすぎない
      const s = rt.army.addStruct({ seg: [x + bend, a, x + bend, b - 0.9], side: 'baboo', nx: facing, nz: 0, hp, maxHp: hp, team: 0, name: '馬防柵', row: r });
      s.mesh = bobosaku(W, s.seg);
      rt.scene.add(s.mesh);
      out.push(s);
    }
  }
  return out;
}

// 波の合間に人足が柵を直す
function repairFort(rt) {
  let n = 0;
  for (const s of rt.flags.segs) {
    if (s.alive) continue;
    s.alive = true; s.hp = s.maxHp; s.mesh.visible = true;
    if (s.stumps) { rt.scene.remove(s.stumps); s.stumps = null; }
    n++;
  }
  if (n) rt.say('木下藤吉郎', `今のうちじゃ、破れた柵を直せ！　……よし、${n}か所塞いだぞ`, 4);
  // 普請小屋も、人足が板を打ち直す（襲来ごとの傷が積もって、三の手の前に尽きないように）
  const h = rt.flags.hut;
  if (h && h.alive && h.hp < h.maxHp * 0.95) {
    h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.4);
    rt.say('人足', '小屋の板も打ち直しましたぞ', 2.5);
  }
}

function assaultFn(rt, side) {
  return (u) => {
    const F = rt.flags;
    const inside = Math.abs(u.pos.x) < FORT - 0.4 && Math.abs(u.pos.z) < FORT - 0.4;
    if (inside) {
      if (!F.hut.alive) return null;
      // 小屋を一度に打てるのは6人まで。あぶれた者は小屋のまわりで守り手と斬り合う（一息に焼け落ちないように）
      const hit = F.hutHit = (F.hutHit || []).filter((q) => q.alive && q.group && !q.group.routed);
      if (hit.includes(u)) return F.hut;
      // （組の小さい見習いの時は四人まで：五人の組で小屋へ戻る間に焼け落ちないように）
      if (hit.length < (F.few ? 4 : 6)) { hit.push(u); return F.hut; }
      const foe = rt.army.nearestEnemy(u, 16);
      if (foe) return { x: foe.pos.x, z: foe.pos.z };
      const a = u.id * 2.4;
      return { x: F.hut.x + Math.sin(a) * 7.5, z: F.hut.z + Math.cos(a) * 7.5 };
    }
    // 破れ目があればそこから入る
    let gap = null, gd = 50;
    for (const s of F.segs) {
      if (s.alive) continue;
      const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
      const d = Math.hypot(u.pos.x - mx, u.pos.z - mz);
      if (d < gd) { gd = d; gap = s; }
    }
    if (gap) {
      const mx = (gap.seg[0] + gap.seg[2]) / 2, mz = (gap.seg[1] + gap.seg[3]) / 2;
      const out = (u.pos.x - mx) * gap.nx + (u.pos.z - mz) * gap.nz;
      const lat = Math.abs((u.pos.x - mx) * gap.nz - (u.pos.z - mz) * gap.nx);
      if (out < 3 && lat < 2) return { x: mx - gap.nx * 5, z: mz - gap.nz * 5 };
      return { x: mx + gap.nx * 2.5, z: mz + gap.nz * 2.5 };
    }
    if (!u.segTarget || !u.segTarget.alive) {
      const cands = F.segs.filter((s) => s.alive && s.side === side);
      if (!cands.length) return F.hut;
      let best = null, bd = Infinity;
      for (const s of cands) {
        const mx = (s.seg[0] + s.seg[2]) / 2, mz = (s.seg[1] + s.seg[3]) / 2;
        const d = Math.hypot(u.pos.x - mx, u.pos.z - mz) + Math.random() * 14;
        if (d < bd) { bd = d; best = s; }
      }
      u.segTarget = best;
    }
    return u.segTarget;
  };
}

const sunomata = {
  spawn: { x: 0, z: 6, heading: Math.PI },
  world: {
    seed: 33,
    muddy: 0.45,     // 川辺の砦は湿っている
    paths: [ROAD3, ROAD3N],
    water: { x: 62, x2: 112, level: -0.7 },   // 長良川：向こう岸は 112 から
    time: 'day',
    autumn: true,
    height(x, z) {
      let h = 0.5 * Math.sin(x * 0.04) * Math.cos(z * 0.03) + 0.4 * Math.sin(z * 0.08 + x * 0.02);
      h += 9 * gauss(x, z, -140, -140, 3000) + 7 * gauss(x, z, -150, 60, 2600);
      if (x > 48) h -= Math.min(2.6, (x - 48) * 0.22);
      // 向こう岸：川を渡れば再び陸
      if (x > 106) h += Math.min(3.6, (x - 106) * 0.35);
      if (Math.abs(x) < FORT + 2 && Math.abs(z) < FORT + 2) h = h * 0.2 + 0.3;
      return h;
    },
    tint(x, z, h, c) {
      if (x > 50 && x < 118) c.setRGB(0.42, 0.38, 0.28);
      if (Math.abs(x) < FORT && Math.abs(z) < FORT) c.setRGB(0.4, 0.34, 0.24);
    },
    clear: (x, z) => (Math.abs(x) < 70 && Math.abs(z) < 70) || x > 45 || Math.hypot(x + 100, z - 150) < 34,
    trees: 260,
    tufts: 3500,
    groves: [{ x: -95, z: -30, r: 14, n: 20 }, { x: -60, z: 100, r: 12, n: 14 }, { x: 30, z: -110, r: 14, n: 18 }],
  },
  setup(rt) {
    const W = rt.world;
    const F = rt.flags;
    F.segs = buildFort(rt);
    // 南の冠木門と、兵糧の俵
    rt.scene.add(kabukimon(W, 0, FORT, 6.4));
    rt.scene.add(tawara(W, 9, -11, 0.4, 6), tawara(W, -10, 7, -0.3, 5), tawara(W, 6, 8, 1.2, 3));
    F.hut = rt.army.addStruct({ x: 0, z: -4, r: 3.8, solidR: 4.0, hp: 1500, maxHp: 1500, armor: 0.4, team: 0, name: '普請小屋' });
    F.hut.mesh = hut(W, 0, -4, 7, 4.5, 0);
    rt.scene.add(F.hut.mesh);
    rt.scene.add(yagura(W, -13, -13));
    rt.scene.add(lumber(W, 9, -10, 0.2));
    rt.scene.add(lumber(W, 10, 4, -0.1));
    rt.scene.add(lumber(W, -9, 7, 1.4));
    rt.scene.add(scaffold(W, -6, -4, 0.3));
    // 普請の途中：北東の隅は櫓の足場だけ、縄を張った杭で次に結う柵の線を示す
    F.scaf = scaffold(W, 13, -13, 0.1);
    rt.scene.add(F.scaf);
    rt.scene.add(umatsunagi(W, -4, -14.5, 0, 9), umatsunagi(W, 14.5, 4, Math.PI / 2, 8));
    // 大軍：川向こうの岸に斎藤の本隊が隊ごとに並ぶ。北と西の丘にも斎藤の備え（襲来はそこから来る）
    const KT = nagashinojo.kit;
    const DA = (x, z, w, d, count, facing, armor, flag, seed, kind) => KT.farHost(rt, x, z, w, d, count, facing, armor, flag, seed, kind);
    // 岸の前に鉄砲と槍、後ろに騎馬の備と斎藤の本陣
    const KS = ['gun', 'spear', 'gun', 'spear', 'mixed', 'cavalry', 'honjin', 'cavalry', 'spear'];
    [[128, -118], [126, -62], [130, -8], [128, 50], [134, 110], [156, -88], [160, -30], [156, 34], [160, 92]]
      .forEach(([x, z], i) => KS[i] !== 'honjin' && DA(x, z, KS[i] === 'gun' ? 28 : (KS[i] === 'honjin' ? 30 : 16), KS[i] === 'gun' ? 6 : (KS[i] === 'honjin' ? 24 : 28), KS[i] === 'cavalry' ? 100 : 150, -Math.PI / 2, i % 2 ? 0x3a3a30 : 0x35382c, 'saito', 7 + i, KS[i]));
    // 斎藤の本陣（川向こうの奥）：大将と旗本を本物の兵で置く。控えはまわりの斎藤の本隊（軽い兵）
    F.saitoCamp = camp(rt, { x: 162, z: -30, facing: -Math.PI / 2, team: 1, faction: 'saito', mon: 'saito', general: { name: '斎藤龍興' }, guard: 15, reserve: 0, runTo: { x: 136, z: -30 } });
    for (const [x, z] of [[132, -90], [134, 20], [136, 80], [150, -40]]) { rt.scene.add(campfire(W, x, z)); W.addFire(x, z); }
    DA(-30, -150, 60, 12, 200, 0.1, 0x35382c, 'saito', 17, 'mixed');
    DA(-120, -106, 24, 30, 160, 0.8, 0x3a3a30, 'saito', 18, 'spear');
    DA(-150, -12, 12, 40, 140, Math.PI / 2, 0x35382c, 'saito', 19, 'spear');
    // 味方：南に控える織田の備え
    DA(-64, 112, 34, 14, 170, Math.PI, KT.ARMOR.oda, 'oda', 21, 'spear');
    DA(34, 104, 28, 6, 130, Math.PI, KT.ARMOR.oda, 'oda', 22, 'gun');
    DA(-128, 90, 20, 14, 110, 2.0, KT.ARMOR.oda, 'oda', 23, 'cavalry');
    // 遠景の村（南西の在所。秋の柿）
    KT.farVillage(rt, -100, 150, { rot: Math.PI, n: 6, fields: 8, seed: 5, autumn: true });
    // 九月の刈田：畦に稲架を立て、刈った稲を干す
    for (const [x, z, r] of [[-70, 128, 0.1], [-52, 140, 0.05], [-88, 122, -0.1], [-30, 132, 0.2]]) rt.scene.add(hasa(W, x, z, r, 9));
    for (const [x, z] of [[-64, 100], [34, 94]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    // 砦の南：これから運び込む材木
    rt.scene.add(lumber(W, -14, 34, 0.5), lumber(W, 12, 44, -0.3), lumber(W, -36, 34, 1.2));
    // 襲来のたびに、川向こうの隊が岸まで押し出してくる（見た目だけ）
    F.far = [[150, -60], [150, 60], [150, -120], [150, 0], [150, 120], [150, -30]].map(([x, z], i) => ({ m: DA(x, z, 10, 8, 60, -Math.PI / 2, 0x35382c, 'saito', 40 + i, i % 2 ? 'gun' : 'spear'), v: 0 }));
    for (const [x, z] of [[-15, 15], [15, 15], [0, -15]]) rt.scene.add(nobori(W, x, z, 'oda', 5));
    // 篝火（夕暮れに灯る）
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) W.addFire(x, z, { torch: true, h: 1.5 });
    // 城の見栄え（A4）：篝火の火の下に鉄の籠の台、砦の外（北と西の寄せ口の間）に逆茂木、川の岸に竹束
    for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [-4, 20], [4, 20]]) rt.scene.add(kagaribi(W, x, z - 0.02));
    for (const [x, z, r] of [[-12, -25, Math.PI], [12, -25, Math.PI], [-25, -10, -Math.PI / 2], [-25, 10, -Math.PI / 2]]) rt.scene.add(sakamogi(W, x, z, r, 6));
    for (const [x, z] of [[40, -30], [42, -26], [40, 26], [42, 30]]) rt.scene.add(takataba(W, x, z, Math.PI / 2));
    F.perfect = true;

    const n = RANKS[rt.G.rank].squad || 15;
    // 組の小さい見習い（五人）の時は、寄せ手を少なめに。同時に本人へ打ちかかる敵は二人まで
    F.few = !rt.G.lord && n < 10;
    // 見習いの組の時は、普請小屋も少し固く（柱を太くした小屋）
    if (F.few) { F.hut.hp = F.hut.maxHp = 2100; }
    if (!rt.G.lord && (rt.G.rank || 0) <= 2) rt.army.maxAttackers = Math.min(rt.army.maxAttackers || 3, 2);
    const bows = Math.round(n * (rt.G.bowRatio ?? 0.33));
    rt.makeSquad({ x: 0, z: 10 }, Math.PI, [{ kind: 'spear', n: n - bows }, { kind: 'bow', n: bows }]);
    const tk = allyGroup(rt, { name: '藤吉郎', anchor: { x: 4, z: -9 }, facing: Math.PI, noRout: true }, [{ type: 'samurai', n: 1, o: { name: '木下藤吉郎', invuln: true, hat: 'jingasa_n' } }]);
    F.tokichiro = tk.units[0];
    const wk = allyGroup(rt, { name: '人足', anchor: { x: -6, z: -10 }, facing: 0, noRout: true, width: 4, aggro: 0 }, [{ type: 'porter', n: 10, o: { invuln: true } }]);
    F.wk = wk;
    F.ally = allyGroup(rt, { name: '別組', anchor: { x: -14, z: 2 }, facing: -Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: F.few ? 13 : 10 }]);
    // 川並衆：東の柵（川の側）を受け持つ
    F.ally2 = allyGroup(rt, { name: '川並衆', anchor: { x: 13, z: 2 }, facing: Math.PI / 2, aggro: 5, width: 3 }, [{ type: 'samurai', n: 1, o: { name: '蜂須賀小六', hat: 'jingasa_n' } }, { type: 'ashigaru', n: F.few ? 12 : 9 }]);
    F.koroku = F.ally2.units[0];

    rt.setPhase('brief');
    rt.obj('defend', '砦を守りきれ（襲来 0/3）', 'main');
    rt.obj('perfect', '柵を一本も破らせるな', 'side');
    rt.say('木下藤吉郎', `おお、お主が噂の${nm(rt)}か！　わしが木下藤吉郎じゃ。この砦の普請を任されておる`, 5);
    rt.say('木下藤吉郎', '斎藤の者ども、必ず邪魔しに来おる。柵が建つまで、なんとしても守り抜け', 4.5);
    rt.say('木下藤吉郎', '柵を破られれば小屋を焼かれる。東の川の側は、川並衆の蜂須賀小六が受け持つ。……頼りにしておるぞ', 4);
    // 操作の案内は字幕に積まず、短い知らせで（弓の人数も書く）
    rt.after(2, () => rt.bark(bows ? `弓 ${bows}人が組に加わった（号令の相手を「弓隊」に替えられる）` : '組は槍だけ。柵の内から突け'));
    rt.after(20, () => rt.bark('柵の内から槍で突ける。南の門から打って出て、横腹を突くこともできる'));
    rt.after(24, () => this.wave1(rt));
    // 藤吉郎の策（名乗りの台詞が終わってから）
    rt.after(14, () => rt.choose('藤吉郎「材木が少し余った。どう使うかの？」', [
      { label: '柵を補強する', note: '柵の強さが4割増す（人足が北の柵を二重に結う）' },
      { label: '弓組を増やす', note: '弓兵が二人、組に加わる' },
    ], (i) => {
      if (i === 0) { for (const sg of F.segs) { sg.maxHp *= 1.4; sg.hp *= 1.4; } rt.say('木下藤吉郎', '心得た、柵を二重に結わせよう', 3); this.doubleFence(rt); }
      else {
        const bg = rt.squadGroups.find((g) => g.kind === 'bow');
        if (bg) {
          for (let k = 0; k < 2; k++) {
            const c = bg.center();
            const u = rt.army.addUnit(bg, { type: 'bow', x: c.x + k, z: c.z + 1, flag: rt.G.aijirushi || 'ichimonji' });
            u.isSub = true; u.hp = u.maxHp = u.maxHp * 1.15; u.kills = 0; u.name = ['市助', '仁吉'][k];
            rt.squad.push(u);
          }
          rt.tracker.subsInit = rt.squad.length;
        }
        if (bg) rt.say('木下藤吉郎', 'わしの手の者から弓の上手を二人貸そう', 3);
        // 組に弓の者がいない時は、弓を貸せないので材木は柵に回す（選んだ事と起きる事を食い違わせない）
        else { for (const sg of F.segs) { sg.maxHp *= 1.2; sg.hp *= 1.2; } rt.say('木下藤吉郎', 'お主の組には弓を引く者がおらぬな。ならば材木は柵に回そう', 3.5); }
      }
      rt.G.rel.tokichiro.like += 3;
    }));
    // 普請小屋で手当てを受けられる（襲来の合間の立て直し）
    F.healCd = 0;
    rt.addInteract('heal', { x: 0, z: 0.5 }, '手当てを受ける（体力6割回復・45秒に一度）', () => {
      if (F.healCd > rt.t) { rt.hud.flash(`手当てはあと${Math.ceil(F.healCd - rt.t)}秒`, 'dim'); return; }
      const u = rt.player.u;
      u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.6);
      F.healCd = rt.t + 45;
      rt.say('人足', '傷を縛りまする。ご無理なさいますな', 2.5);
      sfx('ui');
    }, { r: 4 });
    rt.after(50, () => rt.bark(isTouch ? '深手を負ったら、普請小屋で手当てを受けられる（「取る」）' : `深手を負ったら、普請小屋で手当てを受けられる（${K('use')}）`));
    rt.tutStart('組頭の手ほどき', [['radial', '号令の輪（Tab 長押し）'], ['cmd_yari', '槍衾（輪か Tab → 7）'], ['cmd_fire', '弓の射撃の切替（Tab → 8）'], ['group', '号令先の切替（Tab → G）']]);
    rt.flags.nextWaveAt = 24;
  },

  wave1(rt) {
    const F = rt.flags;
    F.wave = 1;
    rt.setPhase('w1');
    F.W1 = enemyGroup(rt, { faction: 'saito', anchor: { x: 2, z: -100 }, facing: 0, order: 'assault', fleeDir: { x: 0, z: -1 }, width: 7 }, [{ type: 'samurai', n: 2 }, { type: 'ashigaru', n: F.few ? 16 : 20 }]);
    nagashinojo.kit.backOf(rt, F.W1, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 44, stop: () => { const c = F.W1.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W1.assault = assaultFn(rt, 'n');
    rt.banner('斎藤勢、来襲', '北より');
    rt.army.play('eshout', { x: 0, z: -60 }, 2);
    rt.say('木下藤吉郎', '来おったぞ！　北じゃ、柵に取り付かせるな！', 3.5);
    rt.marker('w', centerOf(F.W1), () => `敵勢・${moraleWord(F.W1.morale)}`, { red: true, group: F.W1 });
    rt.objProgress('defend', '');
    rt.obj('defend', '砦を守りきれ（襲来 1/3）', 'main');
  },

  wave2(rt) {
    const F = rt.flags;
    if (F.W2) return;
    F.wave = 2; F.waveT = 0;
    rt.setPhase('w2');
    // 波ごとに日が傾く：二の手は昼下がり、三の手で夕焼け
    rt.world.setTime('after');
    F.W2 = enemyGroup(rt, { faction: 'saito', anchor: { x: -122, z: 2 }, facing: Math.PI / 2, order: 'assault', fleeDir: { x: -1, z: 0 }, width: 8 }, [{ type: 'samurai', n: F.few ? 2 : 3 }, { type: 'ashigaru', n: F.few ? 16 : 20 }, { type: 'gun', n: 3 }]);
    nagashinojo.kit.backOf(rt, F.W2, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 14, depth: 8, count: 80, seed: 45, stop: () => { const c = F.W2.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W2.assault = assaultFn(rt, 'w');
    rt.banner('二の手', '西より');
    rt.say('木下藤吉郎', '西からも来たぞ！　……いかん、南西から荷駄が着く頃じゃ！', 4);
    rt.marker('w', centerOf(F.W2), () => `敵勢・${moraleWord(F.W2.morale)}`, { red: true, group: F.W2 });
    rt.obj('defend', '砦を守りきれ（襲来 2/3）', 'main');
    // 西の柵の内に味方の鉄砲（まだ数は少ない）。二の手が柵へ寄せた所で一斉に放つ
    F.gunW = allyGroup(rt, { name: '川並衆の鉄砲', anchor: { x: -FORT + 5, z: -3 }, facing: -Math.PI / 2, order: 'hold', aggro: 3, width: 5, noRout: true }, [{ type: 'samurai', n: 1 }, { type: 'gun', n: 4 }]);
    rt.after(6, () => rt.say('蜂須賀小六', '西の柵の内に鉄砲を並べた。引きつけて撃つ。揺れたら南の門から出て、横を突け', 4));
    // 荷駄
    const ND = allyGroup(rt, { name: '荷駄', anchor: { x: -112, z: 104 }, facing: 1.2, formation: 'column', order: 'path', speed: 2.3, noRout: true, aggro: 3 },
      [{ type: 'porter', n: 4 }, { type: 'ashigaru', n: 2 }]);
    ND.path = [[-112, 104], [-90, 86], [-36, 44], [0, 26], [0, 8]];
    ND.onArrive = (g) => { g.order = 'hold'; };
    F.K = ND;
    F.saved = 0;
    rt.obj('nida', '材木の荷駄を守れ（二人以上を砦へ）', 'side');
    rt.marker('gate', { x: 0, z: FORT + 1 }, '南の門（打って出られる）', { h: 2.5 });
    rt.after(25, () => rt.unmark('gate'));
    rt.marker('nida', centerOf(ND), '荷駄');
    // 荷駄を狙う斎藤の組は、少し遅れて西の林から出る（砦から駆けつければ間に合う間をおく）
    rt.after(4, () => rt.say('木下藤吉郎', '南の門から打って出て、荷駄を迎えよ！　西の林に斎藤の者が潜んでおるやもしれん', 4));
    F.KE = null; F.KEwait = true;
    rt.after(18, () => {
      F.KEwait = false;
      if (F.nidaDone || F.woodsClear) return;
      const KE = enemyGroup(rt, { faction: 'saito', anchor: { x: -150, z: 28 }, facing: 1.0, order: 'attack', seekRange: 90, fleeDir: { x: -1, z: 0 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 6 }]);
      KE.focus = ND.units.find((u) => u.alive && u.type === 'porter') || null;
      F.KE = KE;
      nagashinojo.kit.backOf(rt, KE, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 90, seed: 136 });
      rt.say('足軽', '西の林から斎藤の者が出たぞ！　荷駄を狙っておる！', 3);
      rt.marker('ke', centerOf(KE), '荷駄を狙う敵', { red: true, group: KE });
    });
  },

  wave3(rt) {
    const F = rt.flags;
    F.wave = 3; F.waveT = 0;
    rt.setPhase('w3');
    rt.world.setTime('dusk');
    F.W3a = enemyGroup(rt, { faction: 'saito', anchor: { x: -54, z: -122 }, facing: 0.45, order: 'assault', fleeDir: { x: -0.4, z: -1 }, width: 7 },
      [{ type: 'samurai', n: 1, o: { name: '斎藤方の旗持ち', flag: 'saito', flagScale: 1.8, tag: 'flag' } }, { type: 'samurai', n: F.few ? 1 : 2 }, { type: 'ashigaru', n: F.few ? 9 : 13 }]);
    nagashinojo.kit.backOf(rt, F.W3a, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 14, depth: 8, count: 80, seed: 46, stop: () => { const c = F.W3a.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W3a.assault = assaultFn(rt, 'n');
    F.W3b = enemyGroup(rt, { faction: 'saito', anchor: F.few ? { x: -162, z: -66 } : { x: -150, z: -60 }, facing: 1.2, order: 'assault', fleeDir: { x: -1, z: -0.3 }, width: 7 },
      [{ type: 'busho', n: 1, o: { name: '斎藤方 侍大将 稲田弾正' } }, { type: 'samurai', n: F.few ? 1 : 2 }, { type: 'cavalry', n: F.few ? 2 : 3 }, { type: 'ashigaru', n: F.few ? 5 : 8 }, { type: 'bow', n: F.few ? 2 : 3 }]);
    nagashinojo.kit.backOf(rt, F.W3b, { flag: 'saito', armor: 0x35382c, kind: 'spear', w: 14, depth: 8, count: 80, seed: 47, stop: () => { const c = F.W3b.center(); return Math.hypot(c.x, c.z) < FORT + 55; } });
    F.W3b.assault = assaultFn(rt, 'w');
    // 川沿いの東から回り込む一隊（守りの手薄な側）。北と西の寄せと重ならないよう、少し遅れて来る
    // 長良川を舟で渡り、東の岸から上がって来る一隊（守りの手薄な側）
    rt.after(F.few ? 44 : 32, () => {
      rt.say('足軽', '川に舟が出たぞ！　斎藤の者が川を渡ってくる！', 3.5);
      this.boats(rt, () => {
        F.W3c = enemyGroup(rt, { faction: 'saito', anchor: { x: 54, z: -6 }, facing: -Math.PI / 2, order: 'assault', fleeDir: { x: 1, z: 0 }, width: 5 },
          [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: (F.dpMem || {}).sunoBurnt ? 4 : F.few ? 7 : 9 }]);
        F.W3c.assault = assaultFn(rt, 'e');
        // 岸で組が待ち構えていれば、上がりきる前に叩かれて浮き足立つ。北に集めた時は、東の柵が手薄で強く押される
        if (F.post3 === 'e') { F.W3c.morale -= 35; rt.bark('岸で待ち構えた組が、上がりかけの舟の者を突く！'); }
        else if (F.post3 === 'n') F.W3c.morale = Math.min(100, F.W3c.morale + 10);
        rt.army.play('eshout', { x: 54, z: -6 }, 1.4);
        rt.say('足軽', '舟の者が岸に上がった！　東の柵じゃ！', 3);
        rt.marker('w3', centerOf(F.W3c), () => `敵勢（東）・${moraleWord(F.W3c.morale)}`, { red: true, group: F.W3c });
      });
    });
    F.flagbearer = F.W3a.units[0];
    // 伏兵：西の林から不意に
    rt.after(22, () => {
      // 伏兵は数人ずつでなく、一つの組にまとめて出す（後ろに林から湧く控えを背負わせ、まとまった波に見せる）
      F.W3d = enemyGroup(rt, { faction: 'saito', anchor: { x: -92, z: -26 }, facing: Math.PI / 2, order: 'assault', fleeDir: { x: -1, z: 0 }, width: 5 }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: F.few ? 5 : 8 }]);
      F.W3d.assault = assaultFn(rt, 'w');
      nagashinojo.kit.backOf(rt, F.W3d, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 12, depth: 6, count: 60, seed: 48, stop: () => { const c = F.W3d.center(); return Math.hypot(c.x, c.z) < FORT + 40; } });
      rt.banner('伏兵', '西の林から');
      rt.say('足軽', '伏兵だ！　西の林から出てきたぞ！', 3);
      rt.marker('w4', centerOf(F.W3d), () => `伏兵・${moraleWord(F.W3d.morale)}`, { red: true, group: F.W3d });
    });
    // 騎馬と侍大将の一撃は、柵の内の組頭を一度で崩さない強さに（駆け抜けて何度も当たるので）
    for (const u of F.W3b.units) if (u.type === 'cavalry' || u.type === 'busho') u.dmg *= 0.75;
    rt.banner('三の手', '夕暮れ、北西より大軍');
    rt.say('木下藤吉郎', 'これが最後の押しじゃ！　ここを凌げば砦は建つ！', 4);
    rt.marker('w', centerOf(F.W3a), () => `敵勢（北）・${moraleWord(F.W3a.morale)}`, { red: true, group: F.W3a });
    rt.marker('w2', centerOf(F.W3b), () => `敵勢（西）・${moraleWord(F.W3b.morale)}`, { red: true, group: F.W3b });
    rt.marker('flag', unitPos(F.flagbearer), '敵の旗', { red: true });
    rt.obj('defend', '砦を守りきれ（襲来 3/3）', 'main');
    rt.obj('flag', '敵の旗を奪え', 'side');
  },

  // 材木で柵を補強：人足が材木を担いで北の柵へ運び、内側に一本ずつ二重の柵が組まれていく
  doubleFence(rt) {
    const F = rt.flags, W = rt.world;
    const wk = F.wk;
    if (wk) { wk.order = 'move'; wk.dest = { x: 0, z: -FORT + 3 }; wk.speed = 1.6; wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: 0, z: -FORT + 3 }; }; }
    const st = (FORT * 2) / 8;
    for (let i = 0; i < 8; i++) {
      rt.after(6 + i * 1.6, () => {
        const a = -FORT + i * st;
        rt.scene.add(palisade(W, [a + 0.2, -FORT + 1.3, a + st - 0.2, -FORT + 1.3]));
        rt.army.play('knock', { x: a + st / 2, z: -FORT + 1.3 }, 0.8);
      });
    }
    rt.after(6 + 8 * 1.6 + 2, () => { if (wk) { wk.order = 'move'; wk.dest = { x: -6, z: -10 }; wk.onArrive = (g) => { g.order = 'hold'; g.anchor = { x: -6, z: -10 }; }; } });
  },
  // 勝った時：足場だった隅に櫓が立ち、柵と櫓の並んだ砦を見せる
  fortDone(rt) {
    const F = rt.flags, W = rt.world;
    if (F.scaf) { rt.scene.remove(F.scaf); F.scaf = null; }
    rt.scene.add(yagura(W, 13, -13), yagura(W, 13, 13));
    for (const [x, z] of [[13, -9], [9, 13]]) rt.scene.add(nobori(W, x, z, 'oda', 5.5));
    rt.army.play('wood', { x: 13, z: -13 }, 1);
    if (!rt.player.lock) rt.player.cine = { x: 13, z: -13, t: 3 };
  },
  // 舟で長良川を渡って来る一隊：向こう岸から舟が漕ぎ寄せ、岸に着くと兵が上がる
  boats(rt, onLand) {
    const F = rt.flags, W = rt.world;
    const y = -0.7 + 0.05;
    F.boats = [[108, -20], [110, -6], [106, 8]].map(([x, z], i) => { const m = kobune(x, y, z, -Math.PI / 2 + (i - 1) * 0.08); rt.scene.add(m); return { m, x, z, x1: 58 + i * 0.8 }; });
    rt.marker('boats', () => ({ x: F.boats[1].m.position.x, z: F.boats[1].m.position.z }), '川を渡る舟', { red: true, h: 2.5 });
    F.boatT = 0; F.onLand = onLand;
  },
  moveBoats(rt, dt) {
    const F = rt.flags;
    if (!F.boats || F.landed) return;
    F.boatT += dt;
    const k = Math.min(1, F.boatT / 16);
    for (const b of F.boats) { b.m.position.x = b.x + (b.x1 - b.x) * k; b.m.rotation.z = Math.sin(F.boatT * 1.7 + b.z) * 0.03; }
    if (k >= 1) { F.landed = true; rt.unmark('boats'); F.onLand(); }
  },

  // 川向こうの押し出し：襲来ごとに二隊が岸まで出て、しばらく睨んでから戻る
  moveFar(rt, dt) {
    const F = rt.flags;
    if (F.wave && F.farWave !== F.wave) {
      F.farWave = F.wave;
      for (const q of F.far.slice((F.wave - 1) * 2, F.wave * 2)) { q.v = 1; q.t = 0; }
    }
    for (const q of F.far) {
      if (!q.v) continue;
      q.t += dt;
      if (q.v === 1 && !q.go) { q.go = true; q.m.advance(33, 8); }
      if (q.v === 1 && q.t > 34) { q.v = -1; q.m.retreat(33, 13); }
      if (q.v === -1 && q.t > 48) { q.v = 0; q.go = false; }
    }
    nagashinojo.kit.backTick(rt);
  },

  update(rt, dt) {
    const F = rt.flags;
    const gone = (g) => !g || g.count === 0 || g.routed;
    this.moveFar(rt, dt);
    this.moveBoats(rt, dt);
    depthTick(rt, dt);
    // 深手のときだけ、手当ての場所を示す
    const low = rt.player.u.hp < rt.player.u.maxHp * 0.4 && !(F.healCd > rt.t);
    if (low && !F.healMarked) { F.healMarked = true; rt.marker('heal', { x: 0, z: 0.5 }, isTouch ? '手当て' : `手当て（${K('use')}）`, { h: 2.5 }); }
    if (!low && F.healMarked) { F.healMarked = false; rt.unmark('heal'); }
    // 普請小屋の具合と、次の襲来までの時間
    const hutPct = Math.round(F.hut.hp / F.hut.maxHp * 100);
    const wait = F.nextWaveAt ? Math.ceil(F.nextWaveAt - rt.t) : 0;
    rt.objProgress('defend', wait > 0 ? `次の襲来まで ${wait}秒 ・ 普請小屋 ${hutPct}%` : `普請小屋 ${hutPct}%`);
    // 小屋が打たれ始めたら早めに知らせ、印を立てる（気づいた時には手遅れ、にならないように）
    const hw = [85, 50, 25].find((q) => hutPct <= q && !(F.hutSaid || []).includes(q));
    if (hw) {
      F.hutSaid = [...(F.hutSaid || []), hw];
      // 小屋が傷むほど、屋根から上がる煙が太くなる（遠くからでも小屋の具合が分かる）
      if (hw <= 50) rt.world.addSmokeColumn(hw === 50 ? 1.5 : -1.5, rt.world.heightAt(0, -4) + 3.2, -4, { size: hw === 50 ? 1.4 : 2.4 });
      if (hw === 85) { rt.say('木下藤吉郎', '小屋に敵が取り付いた！　組を連れて戻れ、小屋を守れ！', 3.5); rt.marker('hut', { x: 0, z: -4 }, () => `普請小屋 ${Math.round(F.hut.hp / F.hut.maxHp * 100)}%`, { h: 5 }); rt.after(30, () => rt.unmark('hut')); }
      else rt.bark(`普請小屋が危ない！（残り ${hutPct}%）　中に入った敵を討て`, true);
    }
    // 取り残された少数の敵・鉄砲だけの敵は、しばらくすると退く（襲来が止まらないように）
    if (F.wave) {
      F.waveT = (F.waveT || 0) + dt;
      for (const g of [F.W1, F.W2, F.KE, F.W3a, F.W3b, F.W3c, F.W3d]) {
        if (!g || g.routed || g.count === 0) continue;
        const live = g.units.filter((u) => u.alive);
        const gunsOnly = live.every((u) => u.type === 'gun' || u.type === 'bow');
        // 150秒を過ぎた襲来は、残りがどれだけでも退く（どこかで詰まっても先へ進めるように。三の手だけは山場なので 200 秒）
        if ((F.waveT > 100 && live.length <= 3) || (F.waveT > 60 && gunsOnly) || F.waveT > (F.wave === 3 ? 200 : 150)) { g.noRout = false; g.morale = 0; }
      }
    }
    if (F.wave === 1 && gone(F.W1) && !F.next2) {
      F.next2 = true; F.next2T = rt.t;
      rt.unmark('w');
      rt.say('木下藤吉郎', 'ようやった！　じゃが、まだ来るぞ。今のうちに備えを直せ', 4);
      rt.after(12, () => rt.say('木下藤吉郎', '世間では一夜で城が建つなどと言うておるらしい。大げさじゃ。一夜では柵も結えぬわ', 4.5));
      rt.after(8, () => repairFort(rt));
      // 判断：柵を直して待つか、打って出て西の林の物見を追い払うか（荷駄の道が安くなる）
      rt.after(6, () => rt.choose('藤吉郎「次の寄せまで少し間がある。どうする？」', [
        { label: '砦に残り、柵を直して待つ', note: '破れた柵を多めに直す。西の林の斎藤の者はそのまま' },
        { label: '打って出て、西の林の物見を追い払う', note: '追い払えば、二の手で荷駄を狙う者が出ない。砦の外で戦う' },
      ], (i) => {
        if (i === 0) { rt.after(4, () => repairFort(rt)); rt.say('木下藤吉郎', 'よし、人足を総出で柵に回す', 3); rt.after(20, () => this.wave2(rt)); F.nextWaveAt = rt.t + 20; }
        else {
          F.scoutOut = enemyGroup(rt, { faction: 'saito', name: '西の林の物見', anchor: { x: -86, z: -20 }, facing: Math.PI / 2, order: 'hold', aggro: 14, width: 5, morale: 80, fleeDir: { x: -1, z: 0 } }, [{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 12 }]);
          nagashinojo.kit.backOf(rt, F.scoutOut, { flag: 'saito', armor: 0x3a3a30, kind: 'spear', w: 16, depth: 8, count: 100, seed: 137 });
          rt.obj('scout', '西の林の物見を追い払え', 'side');
          rt.marker('scout', centerOf(F.scoutOut), () => `西の林の物見・${moraleWord(F.scoutOut.morale)}`, { red: true, group: F.scoutOut });
          rt.say('木下藤吉郎', '南の門から出よ。林に潜む者を追い散らせ。遅れるなよ、二の手が来るまでに戻れ', 4);
          F.scoutT = rt.t;
        }
      }, 18));
    }
    // 保険：判断の段で二の手が始まらないまま長引いたら、二の手を始める
    if (F.next2T && !F.W2 && !F.wave2Q && rt.t - F.next2T > 110) { F.wave2Q = true; this.wave2(rt); }
    if (F.scoutOut && !F.scoutDone) {
      const q = F.scoutOut;
      if (gone(q) || rt.t - F.scoutT > 70) {
        F.scoutDone = true; rt.unmark('scout');
        if (gone(q)) { F.woodsClear = true; rt.objDone('scout'); rt.award((t) => t.side.push('西の林の物見を追い払った'), '西の林の物見を追い払った'); rt.say('木下藤吉郎', 'でかした！　これで荷駄の道は安い。戻れ、二の手じゃ', 3.5); }
        else { rt.objFail('scout'); q.noRout = false; q.morale = 0; rt.say('木下藤吉郎', 'もうよい、戻れ！　二の手が来るぞ', 3); }
        rt.after(10, () => this.wave2(rt)); F.nextWaveAt = rt.t + 10;
      }
    }
    if (F.wave === 2) {
      // 荷駄
      if (F.K && !F.nidaDone) {
        for (const u of F.K.units) {
          if (u.alive && u.type === 'porter' && !u.saved && Math.abs(u.pos.x) < FORT && Math.abs(u.pos.z) < FORT) { u.saved = true; F.saved++; }
        }
        const alivePorters = F.K.units.filter((u) => u.alive && u.type === 'porter' && !u.saved).length;
        rt.objProgress('nida', `砦へ ${F.saved}/4`);
        if (F.saved >= 2 && (alivePorters === 0 || F.saved >= 3 || F.K.pathIdx >= F.K.path.length)) {
          F.nidaDone = true; rt.objDone('nida'); rt.unmark('nida');
          rt.award((t) => t.side.push('荷駄を守った'), '荷駄を守った');
          rt.say('木下藤吉郎', '材木が届いた！　これで柵が増やせる、恩に着るぞ', 3.5);
        } else if (F.saved + alivePorters < 2) {
          F.nidaDone = true; rt.objFail('nida'); rt.unmark('nida');
          rt.say('木下藤吉郎', '荷駄がやられたか……痛いのう', 3);
        }
      }
      // 荷駄を狙う組：狙った人足が倒れたか砦へ入ったら次の人足へ。狙う荷駄がもう無ければ西の林へ退く（林の口で立ち尽くさない）
      if (F.KE && !gone(F.KE) && !F.KE.routed) {
        const fo = F.KE.focus;
        if (!fo || !fo.alive || fo.saved) {
          const next = F.nidaDone ? null : F.K && F.K.units.find((u) => u.alive && u.type === 'porter' && !u.saved);
          if (next) F.KE.focus = next;
          else { F.KE.focus = null; F.KE.noRout = false; F.KE.morale = 0; }
        }
      }
      if (F.KE && gone(F.KE)) rt.unmark('ke');
      if (F.W2) volleyAt(rt, 'sunoW2', F.gunW, [F.W2], { r: 34, until: rt.t + 1e9, hit: 26, who: '蜂須賀小六', then: ['木下藤吉郎', '二の手が揺れた！　門から出て横を突け！'] });
      // 三の手の前に段を重ねる（立て直し→舟溜まりの判断→西の林の鉄砲→砦へ戻る）
      if (gone(F.W2) && gone(F.KE) && !F.KEwait && !F.next3 && !F.dpA) { F.dpA = true; if (rt.G.lord) F.dpAdone = true; else { rt.unmark('w'); depthStart(rt, sunoCtx(rt), sunoA(), () => { F.dpAdone = true; }); } }
      if (gone(F.W2) && gone(F.KE) && !F.KEwait && !F.next3 && F.dpAdone) {
        F.next3 = true;
        rt.unmark('w');
        rt.say('木下藤吉郎', '日が傾いてきた。次が正念場じゃ', 3.5);
        rt.after(8, () => repairFort(rt));
        // 判断：夕暮れの三の手に、組をどこに置くか
        rt.after(6, () => rt.choose('藤吉郎「三の手は大勢じゃ。お主の組をどこに置く？」', [
          { label: '北の柵に組を集める', note: '北の寄せ（旗持ちの隊）を柵で強く受ける。東の川の側は川並衆だけ' },
          { label: '東の川の側に組を置く', note: '舟で渡る一隊を岸で叩ける。北の柵は別組だけで受ける' },
        ], (i) => {
          F.post3 = i === 0 ? 'n' : 'e';
          const sg = (rt.squadGroups || []).find((g) => g.count);
          const pt = i === 0 ? { x: 0, z: -FORT + 3 } : { x: FORT - 3, z: 0 };
          if (sg) { sg.order = 'move'; sg.dest = pt; sg.onArrive = (g) => { g.order = 'hold'; g.anchor = pt; }; }
          rt.marker('post3', pt, i === 0 ? '北の柵' : '東の川の側', { h: 2.5 });
          rt.after(20, () => rt.unmark('post3'));
          rt.say('木下藤吉郎', i === 0 ? 'よし、北を固めよ。東は小六に任せる' : 'よし、川の側じゃ。北は別組に踏ん張らせる', 3);
        }, 16));
        rt.after(24, () => this.wave3(rt));
        F.nextWaveAt = rt.t + 24;
      }
    }
    if (F.wave === 3 && F.W3c && F.W3d && gone(F.W3a) && gone(F.W3b) && gone(F.W3c) && gone(F.W3d) && !F.won) {
      rt.unmark('w4');
      F.won = true;
      rt.unmark('w'); rt.unmark('w2'); rt.unmark('w3'); rt.unmark('flag');
      rt.objDone('defend');
      rt.award((t) => { t.main = true; if (F.perfect) t.special = { label: '砦の完全防衛', pts: 30 }; }, F.perfect ? '任務達成・砦の完全防衛' : '任務達成');
      if (F.perfect) { rt.objDone('perfect'); rt.grantTitle('perfect'); }
      if (!F.flagTaken) rt.objFail('flag');
      rt.banner('守りきった', '墨俣に砦が建つ');
      rt.say('木下藤吉郎', `守りきったぞ！　${nm(rt)}、お主のおかげじゃ！`, 4);
      this.fortDone(rt);
      sfx('horagai', 0.8);
      // 守りきった後も、夜討ちと夜明けの段を重ねる
      if (rt.G.lord) rt.finish({}, 10);
      else rt.after(6, () => depthStart(rt, sunoCtx(rt), sunoB(), () => { rt.say('木下藤吉郎', '墨俣の砦、これにて成った！　皆、帰って眠れ', 3.5); sfx('horagai', 0.8); rt.finish({}, 10); }));
    }
  },

  onKill(rt, v, k) {
    const F = rt.flags;
    if (v.team === 1) F.ek = (F.ek || 0) + 1; else F.ak = (F.ak || 0) + 1;
    nagashinojo.kit.carrion(rt, v);
    if (v === F.flagbearer && k && (k.isPlayer || k.isSub)) {
      rt.unmark('flag');
      const pos = { x: v.pos.x, z: v.pos.z };
      rt.marker('flagdrop', pos, '敵の旗');
      rt.addInteract('flag', pos, '敵の旗を奪う', () => {
        rt.uninteract('flag'); rt.unmark('flagdrop');
        F.flagTaken = true;
        rt.objDone('flag');
        rt.award((t) => t.c.flag++, '斎藤の旗を奪った');
        rt.say('木下藤吉郎', '斎藤の旗を奪ったか！　あっぱれじゃ！', 3);
      }, { r: 3, ttl: 30, hold: 1.0 });
    } else if (v === F.flagbearer) {
      rt.unmark('flag');
      rt.objFail('flag');
    }
  },

  onStructHit(rt, s) {
    if (!s.side) return;
    const F = rt.flags;
    F.sideWarn = F.sideWarn || {};
    if ((F.sideWarn[s.side] || -99) + 12 > rt.t) return;
    F.sideWarn[s.side] = rt.t;
    rt.bark(`${{ n: '北', w: '西', e: '東', s: '南' }[s.side]}の柵が攻められている！`, true);
  },

  onStructDestroyed(rt, s) {
    const F = rt.flags;
    if (s === F.hut) {
      rt.banner('普請小屋が破られた');
      rt.say('木下藤吉郎', 'いかん……小屋をやられた。これでは砦が建たぬ', 4);
      rt.tracker.main = false;
      rt.objFail('defend');
      rt.finish({}, 7);
      return;
    }
    if (F.perfect) { F.perfect = false; rt.objFail('perfect'); }
    s.stumps = stumps(rt.world, s.seg);
    rt.scene.add(s.stumps);
    rt.say('木下藤吉郎', '柵が破られたぞ！　破れ目を塞げ！', 3);
    sfx('wood', 1);
  },

  onFinish(rt) {
    const R = rt.G.rel.tokichiro;
    if (rt.tracker.main) { R.trust += 10; R.like += 10; }
    if (rt.flags.perfect && rt.tracker.main) R.like += 5;
  },
};

// 墨俣の bot：砦の内に留まり、柵の内から槍で突く。柵を越えた敵を先に討つ。荷駄を狙う敵だけは南の門から打って出て討つ
// （柵の外の敵へまっすぐ歩くと柵に当たって動けなくなるので、柵の手前で止まって待つ）
sunomata.botBrain = (b, inp, { goTo }) => {
  const p = b.player, u = p.u, F = b.flags;
  inp.k.delete('KeyW'); inp.k.delete('KeyE');
  inp.guardHold = false;
  if (!u.alive) return;
  const inF = (q, m = 0) => Math.abs(q.x) < FORT - m && Math.abs(q.z) < FORT - m;
  const GATE_IN = { x: 0, z: FORT - 3 }, GATE_OUT = { x: 0, z: FORT + 3 };
  // 歩く：柵の内と外を行き来する時は南の門を通る。砦の内では普請小屋（真ん中の solid）を回り込む
  const walk = (x, z, r) => {
    const me = inF(u.pos, 0.3), to = inF({ x, z }, 0.3);
    if (me !== to) {
      const a = me ? GATE_IN : GATE_OUT, c = me ? GATE_OUT : GATE_IN;
      // 外から戻る時は、柵に沿って南へ回ってから門へ
      if (!me && u.pos.z < FORT + 2) {
        const sx = u.pos.x < 0 ? -1 : 1;
        if (Math.abs(u.pos.x) < FORT + 2.5) return goTo(p, inp, sx * (FORT + 4), u.pos.z, 1);
        return goTo(p, inp, sx * (FORT + 4), FORT + 4, 1.5);
      }
      if (Math.abs(u.pos.x - a.x) > 1.4 || Math.abs(u.pos.z - a.z) > 2) return walk2(a.x, a.z, 0.8);
      return goTo(p, inp, c.x, c.z, 0.5);
    }
    return walk2(x, z, r);
  };
  const walk2 = (x, z, r) => {
    const hx = F.hut.x, hz = F.hut.z;
    if (F.hut.alive && inF(u.pos)) {
      // 小屋が行く手をふさぐ時は、小屋のまわりを輪（半径 6.2m）に沿って回り込む（小屋へ向かって押し続けない）
      const dx = x - u.pos.x, dz = z - u.pos.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((hx - u.pos.x) * dx + (hz - u.pos.z) * dz) / l2));
      if (Math.hypot(u.pos.x + dx * t - hx, u.pos.z + dz * t - hz) < 5.4 && Math.hypot(x - hx, z - hz) > 5.2) {
        const a0 = Math.atan2(u.pos.x - hx, u.pos.z - hz), a1 = Math.atan2(x - hx, z - hz);
        let da = a1 - a0; da -= Math.PI * 2 * Math.round(da / (Math.PI * 2));
        const a = a0 + Math.sign(da || 1) * Math.min(Math.abs(da), 0.7);
        return goTo(p, inp, hx + Math.sin(a) * 6.2, hz + Math.cos(a) * 6.2, 0.6);
      }
    }
    return goTo(p, inp, x, z, r);
  };
  const strike = (e) => {
    const d = Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 4) p.yaw = Math.atan2(e.pos.x - u.pos.x, e.pos.z - u.pos.z);
    if (d < 3.2 && Math.random() < 0.5) inp.leftPressed = true;
    inp.guardHold = (b.army.threats || []).length > 0 && Math.random() < 0.6;
  };
  const fight = (e) => {
    const eIn = inF(e.pos), meIn = inF(u.pos, 0.3);
    // 柵の外の敵：柵の手前（内側）の近い所で待って突く
    if (meIn && !eIn) {
      const m = FORT - 1.1;
      walk(Math.max(-m, Math.min(m, e.pos.x)), Math.max(-m, Math.min(m, e.pos.z)), 0.5);
    } else if (Math.hypot(e.pos.x - u.pos.x, e.pos.z - u.pos.z) > 2.4) walk(e.pos.x, e.pos.z, 2.2);
    strike(e);
    // 組にも突かせる（号令は2秒に一度まで）
    if (b.squad.length && b.squadGroups[0].order !== 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyC'); b.botCmdT = b.t + 2; }
  };
  // 深手なら、敵から離れて構えたまま下がり、敵が寄っていなければ小屋で手当て（人ならそうする）
  if (u.hp < u.maxHp * 0.45) {
    const near = b.army.nearestEnemy(u, 8);
    const heal = b.interacts.find((x) => x.id === 'heal');
    if (!near && heal && !(F.healCd > b.t)) {
      walk(0, 1, 1.5);
      if (Math.hypot(u.pos.x, u.pos.z - 0.5) < 3.5) inp.e.add('KeyE');
      return;
    }
    if (near) {
      const m = FORT - 2;
      const d = Math.hypot(u.pos.x - near.pos.x, u.pos.z - near.pos.z) || 1;
      goTo(p, inp, Math.max(-m, Math.min(m, u.pos.x + (u.pos.x - near.pos.x) / d * 6)), Math.max(-m, Math.min(m, u.pos.z + (u.pos.z - near.pos.z) / d * 6)), 0.5);
      p.yaw = Math.atan2(near.pos.x - u.pos.x, near.pos.z - u.pos.z);
      inp.k.delete('KeyW'); inp.k.add('KeyS');
      inp.guardHold = true;
      if (d < 3 && Math.random() < 0.3) inp.leftPressed = true;
      return;
    }
  }
  // 落ちた敵の旗を拾う（砦の近くだけ）
  const fl = b.interacts.find((x) => x.id === 'flag');
  if (fl && Math.hypot(fl.pos.x, fl.pos.z) < 45 && !b.army.nearestEnemy(u, 3)) {
    if (Math.hypot(fl.pos.x - u.pos.x, fl.pos.z - u.pos.z) > 2) walk(fl.pos.x, fl.pos.z, 1.5);
    else { inp.e.add('KeyE'); inp.k.add('KeyE'); }
    return;
  }
  // 柵を越えた敵が最優先（小屋を焼かれる）
  const inside = b.army.nearestEnemy(u, 60, (o) => inF(o.pos, -0.5));
  if (inside) { fight(inside); return; }
  // 荷駄を狙う敵は打って出て討つ
  if (F.KE && F.KE.count && !F.KE.routed && !F.nidaDone) {
    const e = b.army.nearestEnemy(u, 200, (o) => o.group === F.KE);
    if (e) { fight(e); return; }
  }
  // 柵の外に出ていれば、近くの敵を討ちながら砦へ戻る
  if (!inF(u.pos, 0.3)) {
    const foe = b.army.nearestEnemy(u, 3.5);
    if (foe) { fight(foe); return; }
    walk(0, FORT - 5, 1.5);
    return;
  }
  // 柵に寄ってくる敵：柵の内側から突く
  const e = b.army.nearestEnemy(u, 30, (o) => Math.abs(o.pos.x) < FORT + 8 && Math.abs(o.pos.z) < FORT + 8);
  if (e) { fight(e); return; }
  if (b.squad.length && b.squadGroups[0].order === 'attack' && !(b.botCmdT > b.t)) { inp.e.add('KeyZ'); b.botCmdT = b.t + 2; }
  // 寄せ手の来る側の柵の内へ
  const far = b.army.nearestEnemy(u, 220);
  if (far) { const m = FORT - 2.5; walk(Math.max(-m, Math.min(m, far.pos.x)), Math.max(-m, Math.min(m, far.pos.z)), 2); }
  else walk(0, -10, 3);
};
sunomata.canSkip = (rt) => (rt.flags.nextWaveAt && rt.flags.nextWaveAt - rt.t > 3 ? '次の襲来まで待つ' : '');
sunomata.skip = (rt) => { for (const tm of rt.timers) tm.t = Math.min(tm.t, 0.2); rt.flags.nextWaveAt = rt.t; };
sunomata.sides = { a: { name: '織田軍', mon: 'oda' }, b: { name: '斎藤軍', mon: 'saito' } };
sunomata.date = (rt) => `永禄九年九月　${seasonOf('九月')}・${sky(rt)}`;
// 墨俣：数は伝わらない。砦の守りと人足で千五百、斎藤は川向こうも合わせて四千ほどに見せる
sunomata.force = (rt) => {
  const F = rt.flags;
  return { a: 1500 - (F.ak || 0) * 5, a0: 1500, b: 4000 - (F.ek || 0) * 15, b0: 4000 };
};
sunomata.history = '墨俣に砦を築いて美濃攻めの足場としたことは確かだが、「一夜城」の話は後世の伝承の色が濃い。翌永禄十年、信長は稲葉山城を落とし、岐阜と改めた。';

// ---- 墨俣 ----
function sunoCtx(rt) {
  const F = rt.flags;
  return { faction: 'saito', dmg: 0.62, friends: () => [F.ally2].filter((g) => g && g.count), aid: { name: '藤吉郎の手の者', list: [uS(1), uA(7)] }, aidSaid: '藤吉郎の手の者が加わった' };
}
const sunoHome = (rt) => { const F = rt.flags; if (F.ally && F.ally.count) { F.ally.order = 'hold'; F.ally.anchor = { x: -14, z: 2 }; } if (F.ally2 && F.ally2.count) { F.ally2.order = 'hold'; F.ally2.anchor = { x: 13, z: 2 }; } };
// 二の手の後：立て直し → 判断（舟溜まりを焼くか、柵を固めるか）→ 舟溜まり／柵の前 → 西の林の鉄砲 → 砦へ戻る
function sunoA() {
  return [
    DP.rest({ dur: 14, fn: (rt) => repairFort(rt), say: [['木下藤吉郎', '傷を縛れ。柵を直せ。……じきに日が暮れる'], ['蜂須賀小六', '藤吉郎、川上に斎藤の舟溜まりがある。三の手は、あそこから舟で来るぞ']] }),
    DP.pick({ title: '小六が、川上の斎藤の舟溜まりを焼こうと言う。どうする？',
      options: [{ label: '小六と舟溜まりへ打って出る', note: '舟を焼けば、三の手で川を渡る敵が減る。砦の外で戦う' }, { label: '砦に残り、柵を固めて待つ', note: '柵が二割固くなる。柵の前に斎藤の物見が寄る' }],
      on: (rt, m, i) => {
        m.sunoBoats = i === 0;
        if (i === 1) { for (const sg of rt.flags.segs) { sg.maxHp *= 1.2; sg.hp = sg.maxHp; } rt.say('木下藤吉郎', 'よし、人足に柵をもう一重結わせる', 3); }
        else rt.say('蜂須賀小六', 'よう言うた！　川並衆、続け！', 3);
      } }),
    DP.fight({ skip: (rt, m) => !m.sunoBoats, at: { x: 50, z: -70 }, title: '舟溜まり', sub: '川上の岸に、斎藤の舟が並ぶ', obj: '川上の舟溜まりの番兵を追い払い、舟を焼け',
      foes: () => [{ name: '舟溜まりの番兵', from: { x: 54, z: -100 }, list: [uS(1), uA(8), uB(2)] }],
      later: [{ t: 26, say: ['蜂須賀小六', '舟から上がってくるぞ！　岸で叩け！'], foes: () => [{ name: '舟から上がる斎藤勢', from: { x: 60, z: -40 }, list: [uA(6)] }] }],
      reward: '斎藤の舟溜まりを焼いた',
      onEnd: (rt, m, won) => { if (won) { m.sunoBurnt = true; rt.world.addSmokeColumn(56, rt.world.heightAt(56, -76) + 1, -76, { size: 2 }); rt.say('蜂須賀小六', '舟に火をかけた！　これで三の手は川を渡りにくかろう', 3.5); } } }),
    DP.hold({ skip: (rt, m) => m.sunoBoats, at: { x: 0, z: -30 }, dur: 75, r: 12, title: '柵の前の物見', sub: '夕暮れ前、斎藤の物見が柵の北へ寄る', label: '北の柵の前', obj: '北の柵の前で、斎藤の物見を追い払え',
      waves: [
        { t: 5, say: ['足軽', '北の畑に斎藤の物見じゃ！'], foes: () => [{ name: '斎藤の物見', from: { x: 0, z: -96 }, list: [uS(1), uA(6)] }] },
        { t: 38, say: ['木下藤吉郎', '鉄砲を連れてきおった！　撃たせるな！'], foes: () => [{ name: '物見の鉄砲', from: { x: -40, z: -92 }, list: [uG(3), uA(5)] }] },
      ],
      reward: '柵の前の物見を追い払った' }),
    DP.fight({ at: { x: -68, z: -22 }, title: '西の林の鉄砲', sub: '日が傾く前に、砦を撃つ鉄砲を黙らせる', obj: '砦を撃つ西の林の鉄砲組を黙らせよ',
      say: [['木下藤吉郎', '西の林から撃ってくる！　日が暮れる前に黙らせよ！']],
      foes: (rt, m) => [{ name: '西の林の鉄砲組', from: { x: -88, z: -28 }, list: [uS(1), uG(m.sunoBoats ? 3 : 4), uA(6)], seek: 45 }],
      reward: '西の林の鉄砲組を黙らせた' }),
    DP.rest({ dur: 12, fn: (rt) => { sunoHome(rt); repairFort(rt); }, say: [['木下藤吉郎', '戻れ、戻れ！　三の手が来るぞ。柵の内で受ける！']] }),
  ];
}
// 三の手を退けた後（夕暮れから夜明け）：立て直し → 判断（稲田の夜営を突くか、籠もるか）→ 夜討ちから材木置き場を守る → 夜明け
function sunoB() {
  return [
    DP.rest({ dur: 14, say: [['木下藤吉郎', '皆、ようやった……じゃが斎藤は夜討ちをかけてくるやもしれん'], ['蜂須賀小六', '退いた稲田の隊が、西の林の奥で火を焚いておる。夜営じゃな']] }),
    DP.pick({ title: '退いた稲田の隊が、西の林の奥で夜営している。どうする？',
      options: [{ label: '夜のうちに打って出て、稲田の夜営を突く', note: '夜営を崩せば大手柄。夜討ちの時、戻るのが遅れる' }, { label: '砦の外の材木置き場を固め、夜討ちに備える', note: '夜討ちを待ち構えて受けられる。手柄は小さい' }],
      on: (rt, m, i) => { m.sunoRaid = i === 0; rt.say('木下藤吉郎', i === 0 ? '大胆じゃのう！　……よし、火を目当てに行け。戻りを忘れるな' : 'うむ。材木を焼かれては砦が建たぬ。固めよ', 3); } }),
    DP.fight({ skip: (rt, m) => !m.sunoRaid, at: { x: -112, z: -52 }, title: '夜営を突く', sub: '焚き火のまわりで、稲田の隊が休んでいる', obj: '西の林の奥、稲田の隊の夜営を崩せ',
      foes: () => [{ name: '稲田の夜営', from: { x: -124, z: -62 }, list: [uS(2), uA(10), uB(2)], morale: 70 }],
      later: [{ t: 30, say: ['足軽', '見張りが駆け戻ってくる！　騎馬じゃ！'], foes: () => [{ name: '夜営の見張り', from: { x: -140, z: -20 }, list: [uC(2), uA(5)] }] }],
      reward: (t) => { t.special = { label: '稲田の夜営を突いた', pts: 25 }; }, rewardLabel: '稲田の夜営を突いた' }),
    DP.move({ skip: (rt, m) => !m.sunoRaid, to: { x: -26, z: 34 }, obj: '砦の外の材木置き場へ戻れ（夜討ちが来る）', label: '材木置き場', r: 9, max: 80,
      say: [['伝令', '材木置き場に夜討ちじゃ！　急ぎ戻られよ！']],
      ambush: { t: 12, say: ['足軽', '夜討ちの先手に追い付かれた！'], foes: () => [{ name: '夜討ちの先手', from: { x: -70, z: 10 }, list: [uA(6)] }] } }),
    DP.hold({ at: { x: -26, z: 34 }, dur: 80, r: 12, title: '夜討ち', sub: '斎藤の夜討ちが、砦の外の材木置き場を狙う', label: '材木置き場', obj: '夜討ちから、砦の外の材木置き場を守れ',
      say: [['木下藤吉郎', '材木に火をかけさせるな！　松明を持った者から討て！']],
      waves: (rt, m) => [
        { t: 4, say: ['足軽', '北西から松明が来る！'], foes: () => [{ name: '夜討ちの斎藤勢', from: { x: -90, z: -10 }, list: [uS(1), uA(m.sunoRaid ? 6 : 10)] }] },
        { t: 32, say: ['蜂須賀小六', '南の街道からも来たぞ！'], foes: () => [{ name: '街道の夜討ち', from: { x: -90, z: 86 }, list: [uA(8), uB(2)] }] },
        { t: 62, say: ['木下藤吉郎', '夜討ちの本手じゃ！　材木に寄せつけるな！'], foes: () => [{ name: '夜討ちの本手', from: { x: -60, z: 80 }, list: [uS(2), uA(m.sunoRaid ? 5 : 8)] }] },
      ],
      reward: '材木置き場を守り抜いた' }),
    DP.rest({ dur: 12, fn: (rt) => rt.world.setTime('morning'), banner: ['夜明け', '墨俣の砦の上に、朝日が昇る'], say: [['木下藤吉郎', '夜が明けた……砦は建つぞ！'], ['蜂須賀小六', '稲葉山の後詰は、砦を見て引き返していったわ']] }),
  ];
}

export { sunomata };
