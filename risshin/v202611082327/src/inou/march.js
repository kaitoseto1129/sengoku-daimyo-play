// ======================================================================
// 稲生 0〜2分：行軍（移動も出来事に）
//   於多井川を渡った信長方の列が、稲生の街道を三度に分けて北へ押し出す。止まるたびに何かが起きる：
//   信長が馬で列の前を見回る（相手も同じ織田の兵・雁金の旗が柴田）→ 使番が名塚の急を告げ、右の後ろの名塚の砦で佐久間勢と林勢が組み合う
//   → 物見に出た味方の手負いが下がって来る → 北の霞から柴田勢の雁金の旗の列が現れる → 柴田の物見三人（本体の練習）。
//   史実：『信長公記』弘治二年八月二十四日。信長は清洲から出て於多井川を渡り、名塚の砦（佐久間大学）を後ろに柴田・林と戦った。
// ======================================================================
import { allyGroup } from '../bhelp.js';
import { sfx } from '../audio.js';
import { pinAt } from './index.js';

const DZ = 96;   // 柴田勢は初め北の霞の向こう（百m 奥）に置き、行軍の終わりに寄せて来る
const live = (g) => g && g.units.some((u) => u.alive && !u.gone);
const shift = (rt, g, dz) => {
  for (const u of g.units) { u.pos.z += dz; u.pos.y = rt.world.heightAt(u.pos.x, u.pos.z); }
  if (g.anchor) g.anchor = { ...g.anchor, z: g.anchor.z + dz };
};

export function start(rt, def, C) {
  const F = rt.flags, v = F.v15;
  v.ph = 'march'; v.marchT = rt.t;
  F.holdPlayer = false;   // 始まりの十秒を立たせない（kaito 11/8「始めの5〜10秒動けない」）
  // 列は持ち場で槍を立てて待つ。柴田勢と勝家は北の霞の向こうへ
  for (const g of F.line) { g.order = 'hold'; g.dest = null; g.onArrive = null; }
  // 行軍の後に構える所は、本体の持ち場より二十四m 北（列との間を六十m 空け、物見や前衛との小戦に柴田勢を巻き込まない）
  v.l1Home = F.l1.map((g) => ({ ...g.anchor, z: g.anchor.z - 24 }));
  for (const g of F.l1) { shift(rt, g, -DZ); g.order = 'hold'; g.dest = null; g.onArrive = null; }
  v.shibaHome = { ...F.shibaG.anchor, z: F.shibaG.anchor.z - 24 };
  shift(rt, F.shibaG, -DZ);
  const say = (t, who, s, d = 3) => rt.after(t, () => { if (v.ph === 'march' && !F.ending) rt.say(who, s, d); });
  const step = (t, z) => rt.after(t, () => {
    if (v.ph !== 'march') return;
    sfx('taiko', 0.9); rt.after(0.5, () => sfx('taiko', 0.8)); rt.after(1, () => sfx('taiko', 0.8));
    v.lineZ = z;
    for (const g of F.line) if (live(g)) { g.order = 'move'; g.speed = 1.3; g.dest = { x: g.slotX, z }; g.onArrive = (q) => { q.order = 'hold'; }; }
    if (live(F.nobuG) && !v.ride) F.nobuGo = { x: C.FRONT_X + 10, z: z + 12 };
  });
  v.lineZ = C.ALLY_Z0;
  // 本体の組頭の二言（川を渡った・林も敵）はそのまま
  say(0.6, '組頭', '川を渡ったぞ。昨日の雨で川は増え、田はぬかるむ。東の街道から柴田勢が千、こちらは七百に足らぬ。', 3.2);
  say(4.2, '組頭', '林美作守も敵じゃ。七百を率いて南の田から名塚の砦へ寄せておる。太鼓三つで一歩ずつ前へ出るぞ。', 3.4);
  step(8, C.ALLY_Z0 - 8);
  // 信長が馬で列の前を見回る（相手も同じ織田の兵。雁金の旗が柴田）
  rt.after(12, () => { if (v.ph !== 'march' || !live(F.nobuG) || rt.G.lord) return; v.ride = true; F.nobuGo = { x: -32, z: v.lineZ - 7 }; F.nobuG.speed = 3.4; sfx('gallop', 0.6); });
  say(13, '組頭', '殿じゃ。御自ら列を見て回られる。槍を立てよ！', 2.8);
  say(17, rt.G.lord ? '自分' : '織田信長', '向こうも同じ織田の兵ぞ。雁金の旗が柴田じゃ。見誤るな！', 3.4);
  rt.after(26, () => { if (v.ph === 'march' && v.ride && live(F.nobuG)) F.nobuGo = { x: 50, z: v.lineZ - 7 }; });
  say(28, '足軽', '昨日まで同じ清洲の町で酒を飲んだ者と、槍を合わせるのか……', 3.2);
  say(32, '組頭', '迷えば己が討たれる。旗と槍先だけを見よ。', 2.8);
  rt.after(40, () => { if (v.ph === 'march' && live(F.nobuG)) { v.ride = false; F.nobuGo = { x: C.FRONT_X + 10, z: v.lineZ + 12 }; } });
  // 使番：北東から馬で駆けて来て、名塚の急を告げる。右の後ろの名塚の砦で佐久間勢と林勢が組み合う
  rt.after(42, () => {
    if (v.ph !== 'march') return;
    v.tsukai = allyGroup(rt, { name: '使番', anchor: { x: 58, z: v.lineZ - 60 }, facing: Math.PI, width: 1, aggro: 0, speed: 6, noAI: true, noRout: true, order: 'move', fixed: true,
      dest: { x: C.FRONT_X + 14, z: v.lineZ + 8 } }, [{ type: 'cavalry', n: 1, o: { name: '使番', invuln: true, flag: 'oda' } }]);
    v.tsukai.onArrive = (q) => { q.order = 'hold'; };
    sfx('gallop', 0.8);
  });
  say(50, '使番', '名塚の佐久間大学殿より！　林美作守の勢が南の田から砦へ寄せております！', 3.6);
  rt.after(51, () => {
    if (v.ph !== 'march') return;
    const W = rt.world;
    if (W.addClash && C.NAZUKA) {
      try {
        v.nazuka = W.addClash({ rt, play: (k, p, vv) => rt.army.play?.(k, p, vv), smoke: (x, y, z, fx, fz) => rt.army.smoke?.(x, y, z, fx, fz),
          x: C.NAZUKA.x - 6, z: C.NAZUKA.z - 26, facing: Math.PI * 0.5, w: 22, gap0: 8, seed: 1556, noRout: true, noWake: true,
          A: { flag: 'oda', armor: 0x1f1e1c, count: 40 }, B: { flag: 'nobukatsu', armor: 0x2e2822, count: 70 } });
        rt.after(1, () => v.nazuka?.go());
      } catch (e) { v.nazuka = null; }
    }
    rt.army.play('toki', { x: C.NAZUKA.x, z: C.NAZUKA.z - 20 }, 1.1);
  });
  say(55, rt.G.lord ? '自分' : '織田信長', '大学に名塚を守らせよ。我らは柴田を討つ！', 3);
  say(59.5, '組頭', '右の後ろを見よ。名塚の砦で、もう槍を合わせておる。', 3);
  step(64, C.ALLY_Z0 - 16);
  // 物見に出た味方の手負いが二人、北から下がって来る
  rt.after(70, () => {
    if (v.ph !== 'march') return;
    v.hurt = allyGroup(rt, { name: '手負いの足軽', anchor: { x: C.FRONT_X + 5, z: v.lineZ - 46 }, facing: 0, width: 2, aggro: 0, speed: 1.1, noAI: true, noRout: true, order: 'move',
      dest: { x: C.FRONT_X + 5, z: C.START.z + 8 } }, [{ type: 'ashigaru', n: 2 }]);
    for (const u of v.hurt.units) { u.hp = Math.max(1, u.maxHp * 0.25); u.noTarget = true; u.invuln = true; }
    v.hurt.onArrive = (q) => { for (const u of q.units) if (u.alive) rt.army.despawn(u); };
  });
  say(80, '手負いの足軽', '柴田の物見に追われた……千はおる。雁金の旗が野を埋めておるぞ……', 3.4);
  say(84, '組頭', '怯むな。槍を下げるな！', 2.4);
  // 北の霞から柴田勢が現れ、持ち場へ寄せて来る
  rt.after(88, () => {
    if (v.ph !== 'march') return;
    F.l1.forEach((g, i) => { g.order = 'move'; g.speed = 2.2; g.dest = { ...v.l1Home[i] }; g.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...v.l1Home[i] }; }; });
    const S = F.shibaG; S.order = 'move'; S.speed = 2.2; S.dest = { ...v.shibaHome }; S.onArrive = (q) => { q.order = 'hold'; q.anchor = { ...v.shibaHome }; };
    rt.army.play('toki', { x: C.FRONT_X, z: v.lineZ - 90 }, 1.2);
    rt.after(1.2, () => sfx('horagai', 0.7));
  });
  say(90, '組頭', '雁金の旗……柴田勢じゃ。数は向こうが多い。', 3);
  say(95, '柴田勝家', '上総介殿の勢は少ないぞ。押し包め！', 3);
  step(98, C.ALLY_Z0 - 20);
  // 柴田の物見三人（本体の練習）
  rt.after(116, () => {
    if (v.ph !== 'march') return;
    v.ph = null; v.marchDone = true;
    rt.say('組頭', '柴田の物見が三人、川岸へ寄って来たぞ。討て！', 2.8);
    def.spawnPractice(rt);
  });
}

// 行き先：組頭の後ろ（組と一緒に歩く）
export function pin(rt) {
  const F = rt.flags, K = F.kumiU;
  if (!K?.alive) return pinAt(rt, null);
  const P = rt.player.u.pos;
  if (Math.hypot(K.pos.x - P.x, K.pos.z - P.z) < 10) { F.farPin = null; return null; }
  return pinAt(rt, { x: K.pos.x, z: K.pos.z + 2 }, '稲生の街道', null, 10);
}

export function tick(rt) {
  const F = rt.flags, v = F.v15;
  // 使番は着いたら信長の脇に、一分で列の後ろへ去る
  if (v.tsukai && rt.t - v.marchT > 100 && !v.tsukaiGone) { v.tsukaiGone = true; for (const u of v.tsukai.units) if (u.alive) { v.tsukai.order = 'move'; v.tsukai.dest = { x: 60, z: 150 }; v.tsukai.onArrive = (q) => { for (const o of q.units) if (o.alive) rt.army.despawn(o); }; } }
}
