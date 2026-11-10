// ======================================================================
// 関ヶ原の台本の動き（kaito 11/8：docs/toku15_plan_1108.md の 6・docs/army_depth_spec_1108.md）
//   各家の備・二陣・旗本・南宮山の毛利は共通の軍勢の厚み（army_depth.js）が k06/depth_plan.js の表で描き、動かす。
//   ここは表に入らない物と、筋書きで決まる動きだけ：
//     ・第一線の三つの激突（軽い大軍どうしの乱戦 addClash。福島と宇喜多・黒田と石田・藤堂京極と平塚戸田）
//     ・松尾山の小早川一万五千と麓の脇坂ら（寝返りで側が替わるので表に入れない）
//     ・段ごとの下知：⑤宇喜多の二の備が押し出し福島の二陣が乱れる（西軍の粘り）→ ⑧松尾山が動かない焦り
//       → 寝返り：小早川が山を下り、はじめ北へ（どちらへ来るか分からない）、急に大谷の陣へ。脇坂らも続き、大谷・宇喜多・小西の備が崩れる
//       → ⑨大谷が崩れ宇喜多・小西も崩れる → ⑩石田の陣が崩れ、島津だけが固まって中央を突き抜ける（本物の島津の後ろに付いて走る）→ 勝てば西軍の残りが皆逃げる（南宮山は動かない）
//   兵力の数・当たり・勝ち負け・bot には入れない（farFill・host:false。本物に替えない）。
// 入れ方：setup で install(rt, P) を一度。update で tick(rt) を毎コマ（段の移りは F.step と F.flipT を見て自分で気づく）。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { clash } from '../b_sekigahara.js';
import { depthOrder, depthRout, depthShock } from '../army_depth.js';

// 本物の兵・遠景・使番の知らせで同じ時刻を使う。下山の完了（三十六秒）より前に大谷を崩さない。
export const TURN = Object.freeze({ aim: 18, confirm: 26, support: 56 });   // 寝返りの時（秒）：大谷へ向く・確定・麓の離反の始め。大谷の崩れは b_k06 の otaniFall

const E = -Math.PI / 2;   // 東軍は西（-x）を向く
const TK = 0x24221f, WS = 0x2c2a2a;
const KOBA_FLAG = 'sashi:kobayakawa:#ece6d6:#16140f';   // 小早川の旗（b_k06 の KOBA と同じ）

export function install(rt, P) {
  const W = rt.world, F = rt.flags;
  if (!W.addDistantArmy) return null;
  const n = (a, b) => (isTouch ? a : b);
  const mk = (o) => { try { return W.addDistantArmy({ host: false, farFill: true, kind: 'mixed', flagRate: 0.35, mon: o.flag, ...o, flagTex: flagTexture(o.flag) }); } catch (e) { return null; } };
  const { MATSUO, WAKI_P, SASAO, OTANI, FUKU } = P;
  // 松尾山の小早川一万五千（山の上で北の野を見下ろし、動かない）と麓の脇坂・朽木・小川・赤座
  const M = {
    koba: mk({ x: MATSUO.x + 6, z: MATSUO.z - 20, w: 50, d: 18, count: n(150, 280), facing: Math.PI, team: 1, armor: 0x2a2622, flag: KOBA_FLAG, seed: 6016 }),
    koba2: mk({ x: MATSUO.x - 34, z: MATSUO.z + 10, w: 36, d: 12, count: n(70, 130), facing: Math.PI, team: 1, armor: 0x2a2622, flag: KOBA_FLAG, seed: 6017 }),
    waki: mk({ x: WAKI_P.x + 4, z: WAKI_P.z + 22, w: 34, d: 10, count: n(60, 110), facing: Math.PI, team: 1, armor: WS, flag: 'wakisaka', seed: 6018 }),
    // 松尾山の麓の一列（11/9 布陣図）：赤座直保・小川祐忠・朽木元綱。脇坂と共に寝返る
    akaza: mk({ x: WAKI_P.x - 66, z: WAKI_P.z + 4, w: 22, d: 8, count: n(30, 60), facing: Math.PI, team: 1, armor: WS, flag: 'maru', seed: 6019 }),
    ogawa: mk({ x: WAKI_P.x - 34, z: WAKI_P.z + 14, w: 24, d: 8, count: n(40, 70), facing: Math.PI, team: 1, armor: WS, flag: 'maru', seed: 6024 }),
    kutsuki: mk({ x: WAKI_P.x + 40, z: WAKI_P.z + 30, w: 22, d: 8, count: n(30, 60), facing: Math.PI, team: 1, armor: WS, flag: 'maru', seed: 6025 }),
  };
  // 第一線の三つの激突（はじめは間を空けて向き合う。noWake：近づくまで形を作らない）
  const cl = (o) => { try { return clash(rt, { host: false, noRout: true, noWake: true, killRate: 0.004, maxDrift: 10, corpses: 8, nearHide: 0, ...o }); } catch (e) { return null; } };
  const C = {
    s: cl({ x: FUKU.x - 64, z: FUKU.z + 40, facing: E, w: 44, gap0: 16, seed: 6021,
      A: { flag: 'mizuno', armor: TK, count: n(70, 130), flagRate: 0.22, guns: true }, B: { flag: 'ukita', armor: WS, count: n(80, 150), flagRate: 0.25 } }),
    n: cl({ x: SASAO.x + 104, z: SASAO.z - 46, facing: E, w: 34, gap0: 16, seed: 6022,
      A: { flag: 'kuroda', armor: TK, count: n(60, 110), flagRate: 0.22, guns: true }, B: { flag: 'ishida', armor: WS, count: n(60, 110), flagRate: 0.25, guns: true } }),
    o: cl({ x: OTANI.x + 200, z: OTANI.z + 22, facing: E, w: 40, gap0: 14, seed: 6023,
      A: { flag: 'todo', armor: TK, count: n(60, 110), flagRate: 0.22 }, B: { flag: 'otani', armor: WS, count: n(60, 110), flagRate: 0.25 } }),
  };
  const st = { M, C, step: -1, flip: false, P };
  F._jin = st;
  return st;
}

export function tick(rt) {
  const F = rt.flags, st = F._jin;
  if (!st || rt.over) return;
  const M = st.M, C = st.C, P = st.P, V = F.depth;
  const tryDo = (fn) => { try { fn(); } catch (e) { /* 軽い大軍が無くても戦は進む */ } };
  const later = (s, fn) => rt.after(s, () => { if (!rt.over) tryDo(fn); });
  const order = (side, id, cmd) => { if (V?.[side]) depthOrder(V[side], id, cmd); };
  const routB = (...ids) => { if (V?.B) for (const id of ids) depthRout(V.B, id); };
  if (F.flipT && !st.flip) { st.flip = true; tryDo(() => flip(rt, st, later, routB)); }
  if (F.won && !st.won) {
    st.won = true;
    tryDo(() => { routB('ukita2', 'konishi2', 'otani2', 'gamou', 'konida'); for (const c of [C.s, C.n, C.o]) c?.rout?.('B', { from: 0 }); M.shima?.rout({ hideAfter: 60 }); });
  }
  const step = F.step || 0;
  if (step === st.step) return;
  st.step = step;
  if (step === 3) {
    // 怒った福島の突撃と共に、南の第一線が組み合う
    tryDo(() => { C.s?.go?.(); order('A', 'fuku2', 'advance'); });
    later(12, () => C.s?.volley?.('A'));
  } else if (step === 4) {
    // 北でも南の奥でも、第一線が一度に激突する（戦場じゅうで槍が合う）
    tryDo(() => { C.n?.go?.(); C.o?.go?.(); order('A', 'kuroda2', 'advance'); order('A', 'kyogoku', 'advance'); });
    later(6, () => C.n?.volley?.('B'));
    later(14, () => C.n?.volley?.('A'));
  } else if (step === 5) {
    // 西軍の粘り：宇喜多の二の備が押し出し、福島の二陣が乱れて下がる。家康の本陣へ使番が続く
    tryDo(() => { C.s?.push?.('B', 0.5); order('B', 'ukita2', 'advance'); });
    later(10, () => { if (V?.A) depthShock(V.A, 'fuku2', 25); order('A', 'fuku2', 'retreat'); });
    later(18, () => rt.say('使番', '福島隊、宇喜多に押し戻されております！', 3));
    later(24, () => rt.say('徳川家康', '思うたより西軍は強いのう……。退くな、と伝えよ', 3.5));
    later(40, () => C.n?.push?.('B', 0.3));   // 北でも石田の鉄砲に黒田が押される
  } else if (step === 6) {
    // 家康が本陣を前へ。福島の二陣は持ち直し、松平忠吉の備も前へ
    tryDo(() => { C.s?.push?.('A', 0.15); order('A', 'fuku2', 'advance'); order('A', 'tadayoshi', 'advance'); order('A', 'tanaka', 'advance'); });
  } else if (step === 7) {
    // 膠着：松尾山が動かない焦り（野の使番は stage7。こちらは本陣の様子）
    later(50, () => rt.say('本多忠勝', '金吾の一万五千が敵に回れば、この戦は負けまするぞ', 3.5));
    later(76, () => rt.say('徳川家康', 'ええい、金吾め……！', 2.5));
  } else if (step === 9) {
    // 大谷が崩れ、宇喜多・小西の備が左右から押されて崩れる。戦線全体の旗が西へ押し出される
    tryDo(() => { C.o?.rout?.('B', { from: 1, minFight: 1 }); routB('otani2'); C.s?.push?.('A', 0.6); order('A', 'fuku2', 'advance'); });
    later(10, () => { C.s?.rout?.('B', { from: 1, minFight: 1 }); routB('ukita2', 'konishi2'); });
  } else if (step === 10) {
    // 石田の陣が崩れる。島津だけが固まって中央を突き抜ける（本物の島津の後ろに付いて走る）
    tryDo(() => { C.n?.rout?.('B', { from: -1, minFight: 2 }); routB('gamou'); });
    later(5, () => {
      const g = F.shima, c = g && g.center ? g.center() : P.SHIMAZU;
      M.shima = rt.world.addDistantArmy({ host: false, farFill: true, kind: 'mixed', flagRate: 0.4, mon: 'shimazu', x: c.x - 10, z: c.z, w: 16, d: 10, count: isTouch ? 40 : 80, facing: Math.PI / 2, team: 1, armor: 0x1c1a1a, flag: 'shimazu', flagTex: flagTexture('shimazu'), seed: 6031 });
      M.shima?.follow(() => {
        if (!g || g.routed || !g.count) return null;
        const q = g.center(), d = g.dest || q, f = Math.atan2(d.x - q.x, d.z - q.z);
        return { x: q.x, z: q.z, facing: f };
      }, { gap: 14, speed: 4 });
    });
  }
}

// 小早川の寝返り（11/9 kaito：一分から一分半）：一万五千がゆっくり山を下る。はじめは北の野へ（東軍へ来るのか分からない）、
//   二十秒ほどで西の大谷の陣へ向きを変える。麓の四家は数十秒かけて一つずつ離反する。大谷の崩れは b_k06 の otaniFall（step 9）で
function flip(rt, st, later, routB) {
  const M = st.M, C = st.C, P = st.P;
  M.koba?.moveTo(P.MATSUO.x + 10, P.MATSUO.z - 110, 6);
  M.koba2?.moveTo(P.MATSUO.x - 20, P.MATSUO.z - 90, 7);
  // 本物の隊と同じ時（寝返りの確定・b_k06 の flip の二十六秒）に東軍へ替える。移動だけでは遠景が西軍扱いのまま残る。
  later(26, () => { for (const g of [M.koba, M.koba2]) if (g?.army) g.army.team = 0; });
  later(18, () => {
    M.koba?.moveTo(P.HIRA.x - 10, P.HIRA.z + 40, 22, { charge: true });
    M.koba2?.moveTo(P.OTANI.x + 60, P.OTANI.z + 50, 24, { charge: true });
    C.o?.shake?.('B', 30);
  });
  later(44, () => C.o?.push?.('B', 0.3));   // 大谷勢が一度押し返す
  const side = (...gs) => { for (const g of gs) if (g?.army) g.army.team = 0; };
  later(56, () => { side(M.waki); M.waki?.moveTo(P.HIRA.x + 30, P.HIRA.z + 20, 20, { charge: true }); C.o?.push?.('A', 0.6); });
  later(66, () => { side(M.kutsuki, M.ogawa); M.kutsuki?.moveTo(P.HIRA.x + 46, P.HIRA.z + 26, 23, { charge: true }); M.ogawa?.moveTo(P.HIRA.x, P.HIRA.z + 30, 21, { charge: true }); });
  later(76, () => { side(M.akaza); M.akaza?.moveTo(P.HIRA.x - 20, P.HIRA.z + 34, 22, { charge: true }); });
}
