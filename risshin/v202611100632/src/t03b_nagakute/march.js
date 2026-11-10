// ======================================================================
// 小牧・長久手 二　①の段「三河への行軍」（0〜3分）
//   夜明け、中入りの列は順調に見える。先を行く池田・森の列（軽い作り）が岩崎城へ向かい、遠くで鬨の声。
//   主人公は信吉隊の先手と道の東の徳川方の番所（物見の小屋と柵）を焼く（小さな戦）。家康の行方は分からない。
//   焼いて戻ると信吉が朝飯を命じる。その最中に徳川勢が現れる（②白山林へ）。
// ======================================================================
import { enemyGroup, allyGroup } from '../bhelp.js';
import { flagTexture } from '../textures.js';
import { nobori } from '../props.js';

export const BANSHO = { x: 146, z: 10 };   // 道の東南の徳川方の番所（①の行き先）
function say(rt, who, s, t, sec = 3) { rt.after(t, () => { if (!rt.flags.ending) rt.say(who, s, sec); }); }

function defending(g) {
  if (!g || g.routed || g.order === 'retreat' || g.order === 'flee') return 0;
  let n = 0;
  for (const u of g.units) if (u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.rearWound && !u.downed && !u.noTarget) n++;
  return n;
}

export function start(rt, K) {
  const F = rt.flags, W = rt.world;
  // 番所へ同行する組は朝飯をやめて立つ。林で待つ馬廻と本隊は座ったまま。
  for (const u of F.men.units) if (u.alive) u._crouch = false;
  // 先を行く池田・森の列（遠く南東へ。軽い作り）と、後ろの堀の列（西）
  try {
    const A = (x, z, flag, seed, count, f) => W.addDistantArmy({ x, z, w: 12, d: 26, count, facing: f, armor: 0x2b2723, flagTex: flagTexture(flag), mon: flag, seed, team: 0, kind: 'mixed', host: false, farFill: true, flagRate: 0.2 });
    F.ikeCol = A(120, 92, 'ageha', 15851, 260, Math.PI * 0.8);
    F.moriCol = A(80, 104, 'tsuru', 15852, 220, Math.PI * 0.8);
    F.horiCol = A(-30, -40, 'hori', 15853, 200, Math.PI / 2);
    rt.after(2, () => { try { F.ikeCol?.moveTo(150, 118, 120); F.moriCol?.moveTo(120, 118, 130); } catch (e) { /* 遠景 */ } });
  } catch (e) { /* 遠景が無くても進む */ }
  // 番所：小屋の代わりに柵と幟、守りの兵
  for (const [dx, dz] of [[-4, -3], [4, -3]]) rt.scene.add(nobori(W, BANSHO.x + dx, BANSHO.z + dz, 'tokugawa', 5));
  F.banG = enemyGroup(rt, { faction: 'tokugawa', name: '番所の守り', anchor: { ...BANSHO }, facing: Math.PI * 1.25, width: 5, formation: 'line', morale: 70, dmgMult: 0.35, order: 'hold', aggro: 14, seekRange: 22 },
    K.dressT([{ type: 'samurai', n: 1 }, { type: 'ashigaru', n: 5, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
  K.pushWave(F.banG);
  // 信吉隊の先手（主人公と番所へ）
  F.vanG = allyGroup(rt, { fullStrength: true, noRout: true, dmgMult: 0.5, name: '信吉隊の先手', anchor: { x: K.CAMP.x + 6, z: K.CAMP.z + 14 }, facing: Math.PI / 2, width: 5, aggro: 12, seekRange: 20, speed: 3.6, order: 'move' },
    K.fl([{ type: 'ashigaru', n: 8, o: { flagScale: 1 } }, { type: 'samurai', n: 2 }], 'toyotomi'));
  F.vanG.dest = { x: BANSHO.x - 6, z: BANSHO.z - 4 };
  F.vanG.onArrive = (q) => { q.order = 'attack'; };
  say(rt, '三好信吉', '池田・森の手はもう岩崎へ向かった。我らも遅れるな', 0.4, 3);
  say(rt, '三好信吉', '東の道の脇に徳川の番所がある。焼いて道を開け', 3.8, 3);
  say(rt, '足軽', '夜通し歩いて腹が減った……', 12, 2.6);
  say(rt, '物見', '小牧の家康の動き、まだ見えませぬ', 20, 3);
  rt.after(30, () => { rt.army.play('toki', { x: 140, z: 118 }, 0.7); });
  say(rt, '使番', '池田様の先手、岩崎城に取りかかられました！', 32, 3.2);
}

export function tick(rt, K, dt) {
  const F = rt.flags, P = rt.player.u.pos;
  const near = Math.hypot(P.x - BANSHO.x, P.z - BANSHO.z) < 14;
  // 番所に着くと、岩崎の方から番所の加勢が駆けて来る（小さな戦の二つ目）
  if (near && !F.banHelp) {
    F.banHelp = rt.t;
    rt.after(12, () => {
      if (F.banFire) return;
      F.banG2 = enemyGroup(rt, { faction: 'tokugawa', name: '番所の加勢', anchor: { x: BANSHO.x + 10, z: BANSHO.z + 34 }, facing: Math.PI, width: 5, formation: 'line', morale: 75, dmgMult: 0.35, order: 'attack', aggro: 20, seekRange: 34 },
        K.dressT([{ type: 'samurai', n: 1, o: { horse: true } }, { type: 'ashigaru', n: 4, o: { flagScale: 1 } }, { type: 'gun', n: 2 }]));
      K.pushWave(F.banG2);
      rt.army.play('toki', { x: BANSHO.x + 10, z: BANSHO.z + 34 }, 0.9);
      rt.say('信吉隊の侍', '南から加勢が来る！　番所に火をかける間、防げ！', 2.8);
    });
  }
  // 守りを退け、番所のそばで十秒かけて火を付ける。離れている間は進めない。
  // 逃げ出した守り手は退けたものとする。生存人数だけでは、逃走中の加勢を追って火付けが止まる。
  if (!F.banFire && near && defending(F.banG) <= 1 && defending(F.banG2) <= 1 && F.banG2) F.banLit = (F.banLit || 0) + dt;
  if (!F.banFire && near && (F.banLit || 0) >= 10) {
    F.banFire = rt.t;
    if (K.live(F.banG)) { F.banG.order = 'retreat'; F.banG.dest = { x: 170, z: 60 }; F.banG.aggro = 0; }
    try { rt.world.addFire(BANSHO.x, BANSHO.z, { size: 2.6, h: 0.4, blackSmoke: true }); rt.world.addFire(BANSHO.x + 4, BANSHO.z - 2, { size: 1.8, h: 0.3 }); } catch (e) { /* 火 */ }
    rt.award((t) => t.side.push('三河への道の徳川の番所を焼いた'), '徳川の番所を焼いた');
    rt.say('信吉隊の侍', '番所は焼けた。……家康の兵はおらなんだな', 3);
    rt.after(3.6, () => rt.say('三好信吉', 'よし、陣へ戻れ。白山林で飯にいたす', 3));
    if (K.live(F.vanG)) { F.vanG.order = 'move'; F.vanG.dest = { x: K.CAMP.x + 10, z: K.CAMP.z + 8 }; F.vanG.onArrive = (q) => { q.order = 'hold'; }; }
    // 焼いた直後、白山林の陣の後ろの林から徳川勢が現れる（家康は小牧を出ていた。陣と分断される）
    rt.after(8, () => rt.say('物見', '徳川勢じゃ！　白山林の後ろの東の林から来るぞ！　陣へ戻れ！', 3));
    rt.after(10, () => K.next());
  }
}
