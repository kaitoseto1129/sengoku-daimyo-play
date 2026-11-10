// 千石堀城 ① 0〜3分「十万の寄せ手」：秀吉の本陣の脇を抜けて先手の竹束へ。左右にも遠くにも羽柴の大軍が動き、
// 使番が別の城（積善寺城・畠中城）の様子を知らせる。着くと土橋の前の根来衆が鉄砲を撃ちながら出て来る。
import { P, HASHIBA, NEGORO, sentries } from './scene.js';
import { troops, host, reports, near, move, broken } from '../toyo15/kit.js';

export default {
  goal: '先手の竹束まで進み、根来の前衛を退けよ',
  pin: { ...P.rally, label: '先手の竹束' },
  enter(rt, F) {
    const W = rt.world;
    // 同じ時に、ほかの所でも何万人も動いている（軽い大軍）
    F.hostBack = host(rt, { x: 0, z: -146, w: 56, d: 22, count: 520, facing: 0, seed: 1101 });
    F.hostWest = host(rt, { x: -96, z: -112, w: 46, d: 30, count: 640, facing: -0.6, seed: 1102 });
    F.hostEast = host(rt, { x: 104, z: -86, w: 52, d: 26, count: 720, facing: 0.9, seed: 1103 });
    F.hostEast.advance(70, 120); F.hostWest.advance(40, 140);
    // 遠くの積善寺城の囲み（東）と、畠中城の煙（西）
    W.addFire(250, 30, { size: 5, h: 6, blackSmoke: true });
    F.front = troops(rt, false, '土橋の前の根来衆', { x: 0, z: -48 }, [{ type: 'ashigaru', n: 13 }, { type: 'gun', n: 5 }], NEGORO, { facing: Math.PI });
    F.front.stay = true;
    move(F.friends, P.rally);
    rt.say('羽柴秀次', '千石堀の根来衆は千五百。鉄砲が何より強い。竹束まで来い', 4);
    reports(rt, [
      [16, '使番', '東の積善寺城、細川・蒲生の勢が取り囲みました！'],
      [48, '使番', '西の畠中城、根来の者が自ら火を放って退きました！', () => W.addFire(-240, -40, { size: 5, h: 5, blackSmoke: true })],
      [125, '使番', '後ろの筒井・堀の勢も着きました。寄せ手は数万でございます'],
    ]);
  },
  tick(rt, dt, t) {
    const F = rt.flags;
    if (!F.contact && (near(rt, P.rally, 16) || t > 70)) {
      F.contact = t;
      move(F.front, { x: 0, z: -66 }, true); F.front.aggro = 14;
      move(F.friends, { x: 0, z: -68 }, true);
      F.wallGuns = sentries(rt, '外の塀の鉄砲衆', [{ x: -16, z: -31 }, { x: -9, z: -31 }, { x: 9, z: -31 }, { x: 16, z: -31 }]);
      rt.say('組頭', '根来の前衛が土橋から出て来るぞ！　竹束の陰から槍を出せ！', 3.5);
    }
    if (F.contact && !F.third && t - F.contact > 85) {
      F.third = troops(rt, false, '竹束を撃つ根来の鉄砲衆', { x: -14, z: -50 }, [{ type: 'gun', n: 4 }, { type: 'ashigaru', n: 4 }], NEGORO, { free: true, dmg: 0.2 });
      move(F.third, { x: -10, z: -60 }, true);
      rt.say('組頭', '左の畦から鉄砲じゃ！　撃ち終わって込める間に寄れ！', 3);
    }
    if (F.contact && !F.second && t - F.contact > 40) {
      F.second = troops(rt, false, '木戸から出る根来衆', { x: 10, z: -44 }, [{ type: 'ashigaru', n: 8 }, { type: 'samurai', n: 1 }], NEGORO, { free: true });
      move(F.second, { x: 4, z: -66 }, true);
      rt.say('組頭', 'また出て来た！　退くな、押し返せ！', 3);
    }
    return t > 150 && !!F.third && (broken(F.front, 0.35) && broken(F.second, 0.4) && broken(F.third, 0.4) || t > 175) && near(rt, P.rally, 34);
  },
  leave(rt, F) { for (const g of [F.front, F.second, F.third]) if (g) { g.noRout = false; g.morale = 0; move(g, { x: 0, z: -30 }); } },
  foes: (rt) => [rt.flags.front, rt.flags.second, rt.flags.third],
  max: 250,
};
