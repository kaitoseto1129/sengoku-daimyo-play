// 桶狭間・森部・墨俣・設楽原で使い回す道具（遠景の軍勢・暦・段の兵の書き方。battles.js から分けた）
import { flagTexture } from './textures.js';

const gone = (g) => !g || g.count === 0 || g.routed;

// 動かせる遠景の軍勢（桶狭間・森部・墨俣で使う）：原点で作って、その場へ置き直す。
// 坂で浮かないように、塊は小さめにする。world の「ゆっくり揺れる」は x0 を動かして合わせる
function farArmy(rt, x, z, w, d, count, facing, armor, flag, seed) {
  const W = rt.world;
  const m = W.addDistantArmy({ x: 0, z: 0, w, d, count, facing, armor, flagTex: flagTexture(flag), seed });
  const q = { m, a: W.armies.find((e) => e.mesh === m), h0: W.heightAt(0, 0) };
  moveFar(rt, q, x, z);
  return q;
}
function moveFar(rt, q, x, z, rot) {
  q.x = x; q.z = z; q.a.x0 = x;
  q.m.position.set(x, rt.world.heightAt(x, z) - q.h0, z);
  if (rot !== undefined) q.m.rotation.y = rot;
}
// 道（点の並び）に沿って s だけ進んだ所と、その向き
function alongPath(path, s) {
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const L = Math.hypot(bx - ax, bz - az);
    if (s <= L || i === path.length - 1) {
      const k = Math.max(0, Math.min(1, s / L));
      return { x: ax + (bx - ax) * k, z: az + (bz - az) * k, h: Math.atan2(bx - ax, bz - az), end: s >= L && i === path.length - 1 };
    }
    s -= L;
  }
}

// 両軍の名と紋、その日の暦（画面上部の表示に使う）
const sky = (rt) => {
  const w = rt.world;
  const weather = w.rainLevel > 0.5 ? '雨' : w.timeKey === 'storm' ? '曇' : w.timeKey === 'after' ? '雨上がり' : '晴';
  const time = { morning: '朝', day: '昼', storm: '昼', after: '昼下がり', dusk: '夕暮れ' }[w.timeKey] || '昼';
  return `${weather}・${time}`;
};
// 旧暦の月から季節を出す（一〜三月は春、四〜六月は夏、七〜九月は秋、十〜十二月は冬）
const seasonOf = (m) => { const n = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'].indexOf(m.replace('月', '')) + 1; return n <= 3 ? '春' : n <= 6 ? '夏' : n <= 9 ? '秋' : '冬'; };

// ======================================================================
// 一つの戦を濃くする段（b_depth.js）：桶狭間・森部・墨俣・設楽原
// ======================================================================
const uS = (n, o) => ({ type: 'samurai', n, ...(o ? { o } : {}) });
const uA = (n) => ({ type: 'ashigaru', n });
const uB = (n) => ({ type: 'bow', n });
const uG = (n) => ({ type: 'gun', n });
const uC = (n) => ({ type: 'cavalry', n });
const uBu = (name, o = {}) => ({ type: 'busho', n: 1, o: { name, ...o } });

export { farArmy, alongPath, moveFar, gone, seasonOf, sky, uS, uA, uG, uBu, uB, uC };
