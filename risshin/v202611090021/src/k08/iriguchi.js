// k08/iriguchi.js … 木津川口の戦いの「大坂城を囲む陣」と「これはまだ入口」の締め（docs/toku15_plan_1108.md の 8）
// ・遠く東北東に大坂城（osaka_far.js の遠景。描く距離の外でも見える）。
// ・砦と城の間に、城を囲む徳川方の陣（陣幕・幟・篝火）を四つ。夜の闇に篝火の点が並び、「二十万が城を囲む」を絵で見せる。
// ・勝った後：砦を一つ取っても、城は遠く大きいまま。台詞二つで「これはまだ入口」と締める。字の札は足さない。
// 重さ：幟と陣幕は置くだけ（当たり無し）。篝火の火は四つまで（光は小さく）。
// 使い方：setup の終わりで install(rt, { W })、win の中で ending(rt, { who, shisha })。
import { osakaFar } from '../osaka_far.js';
import { nobori, jinmaku, kagaribi } from '../props.js';
import { farSight } from '../far_sight.js';
import { nm } from '../bhelp.js';

// 城：東北東の四 km ほど先（木津川口は城の西南西）。地面の格子（±180）の外なので、城の下に野を敷く
const CASTLE = { x: 620, z: -430 };
// 囲む陣：砦の北東、城へ向かう道すじに。[x, z, 家, 篝火を焚くか]
const CAMPS = [
  [96, -128, 'tokugawa', true],
  [138, -70, 'todo', true],
  [70, -168, 'ii', false],
  [150, -10, 'honda', true],
];

export function install(rt, ctx = {}) {
  const W = ctx.W || rt.world, F = rt.flags;
  if (F.iriguchi) return;
  F.iriguchi = true;
  try {
    F.osakaFar = osakaFar(rt, { x: CASTLE.x, z: CASTLE.z, s: 1.05, big: 1.5, land: [[260, -780, 1000, -120]] });
  } catch (e) { console.warn(e); }
  const objs = [];
  let fires = 0;
  for (const [x, z, k, fire] of CAMPS) {
    const face = Math.atan2(CASTLE.x - x, CASTLE.z - z);
    const jm = jinmaku(W, x, z, 10, 7, 4, { mon: k });
    rt.scene.add(jm); objs.push(jm);
    for (let i = 0; i < 6; i++) {
      const a = face + (i - 2.5) * 0.32, r = 8 + (i % 2) * 2.5;
      const f = nobori(W, x + Math.sin(a) * r, z + Math.cos(a) * r, k, 4.6);
      f.rotation.y = face + (i % 3 - 1) * 0.2;
      rt.scene.add(f); objs.push(f);
    }
    if (fire && fires < 4) {
      fires++;
      try { const kg = kagaribi(W, x - 4, z + 5); rt.scene.add(kg); objs.push(kg); if (W.addFire) W.addFire(x - 4, z + 5, { h: 1.3, size: 0.7, lightRadius: 10, smoke: false }); } catch (e) { /* 篝火が置けなくても陣は残す */ }
    }
  }
  // 陣は遠くでも霧に沈めない（夜の闇に篝火と幟の影が並ぶ）
  try { farSight(objs, { W, cap: 0.5, from: 50, to: 110 }); } catch (e) { /* 霧のまま */ }
}

// 勝った後の締め：砦を一つ取っても、城はまだ遠い
export function ending(rt, o = {}) {
  const shisha = o.shisha || '使番';
  rt.after(13, () => rt.say(nm(rt), '砦を一つ取って、ようやく城の影が見える所まで来たか', 3.4));
  rt.after(16.8, () => rt.say(shisha, '殿の仰せ。これはまだ入口じゃ。大坂の城は、あの奥ぞ', 3.8));
  return 21.5;
}
