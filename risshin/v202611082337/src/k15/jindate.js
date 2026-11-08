// ======================================================================
// 天王寺・岡山の陣立ての厚み（11/8 kaito「本陣に至るまでに陣が何重にも重なり、それが突破され、陣形が崩れる様子で危機感を」
//   「戦場が空っぽになる」「大勢がまとまって中央突破してくる」）。docs/army_depth_1106.md の 前衛→二陣→旗本→本陣→後詰。
// 本物の兵（b_k15_tennoji_okayama.js の隊）の後ろに、軽い大軍（world_army.js の addDistantArmy。兵力の数に入れない・本物に替えない）を重ねる。
//   味方：本多の先手・榊原の二陣・本陣の後ろの旗本・本陣の西の脇備え・越前勢の後ろ。
//   敵：毛利の手の後ろ（毛利勝永の先手の後ろへ付いて一緒に寄せる＝中央突破の塊）・茶臼山の赤備えと騎馬（真田の突撃に付いて走る）。
// 段の移りで、先手が崩れ（rout）・二陣が押されて退き・旗本が逃げ散り・新手（水野の手）が南から駆け付ける。
// 入れ方：setup で install(rt, P) を一度。update で tick(rt) を呼ぶ（段の移りは F.step を見て自分で気づく）。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { centerOf } from '../bhelp.js';
import { clash } from '../b_sekigahara.js';

const S = Math.PI;
const alive = (g) => g && !g.routed && g.count > 0;

export function install(rt, P) {
  const W = rt.world, F = rt.flags;
  if (!W.addDistantArmy) return null;
  const n = (a, b) => (isTouch ? a : b);
  const mk = (o) => { try { return W.addDistantArmy({ host: false, kind: 'mixed', ...o, flagTex: flagTexture(o.flag) }); } catch (e) { return null; } };
  const { FRONT, NIJIN, HON, SHITENNO, CHAUSU, ECHI } = P;
  const M = {
    // 味方の陣（南ほど本陣に近い）。北（-z）を向く
    sen: mk({ x: FRONT.x + 2, z: FRONT.z + 14, w: 40, d: 8, count: n(110, 180), facing: S, armor: 0x1c1a18, flag: 'honda', seed: 16201 }),
    ni: mk({ x: NIJIN.x, z: NIJIN.z + 12, w: 46, d: 10, count: n(130, 220), facing: S, armor: 0x1f1e1c, flag: 'sakakibara', seed: 16202 }),
    hata: mk({ x: HON.x + 2, z: HON.z + 32, w: 54, d: 14, count: n(170, 300), facing: S, armor: 0x1f1e1c, flag: 'tokugawa', seed: 16203 }),
    waki: mk({ x: HON.x + 30, z: HON.z - 6, w: 18, d: 22, count: n(60, 110), facing: S, armor: 0x1f1e1c, flag: 'tokugawa', seed: 16204 }),
    echi: mk({ x: ECHI.x, z: ECHI.z + 14, w: 40, d: 10, count: n(130, 220), facing: S, armor: 0x1f1e1c, flag: 'tokugawa', seed: 16205 }),
    // 敵の陣。南（+z）を向く
    mori: mk({ x: SHITENNO.x + 26, z: SHITENNO.z + 4, w: 34, d: 12, count: n(170, 300), facing: 0, team: 1, armor: 0x221f1c, flag: 'toyotomi', seed: 16206 }),
    sana: mk({ x: CHAUSU.x + 2, z: CHAUSU.z - 12, w: 28, d: 10, count: n(100, 170), facing: 0.6, team: 1, armor: 0x8e1f16, flag: 'sanada', seed: 16207 }),
    sanaK: mk({ x: CHAUSU.x + 16, z: CHAUSU.z - 4, w: 18, d: 10, count: n(40, 70), facing: 0.6, team: 1, armor: 0x8e1f16, flag: 'sanada', kind: 'cavalry', seed: 16208 }),
  };
  const st = { M, step: -1, t0: 0, cl: null };
  F._jin = st;
  return st;
}

// 本物の隊の真ん中と、家康へ向かう向き（軽い大軍が後ろへ付いて一緒に寄せる）
function toward(rt, g, gap) {
  return () => {
    if (!alive(g)) return null;
    const c = centerOf(g)(), I = rt.flags.ieyasu, t = I && I.alive ? I.pos : null;
    const facing = t ? Math.atan2(t.x - c.x, t.z - c.z) : 0;
    return { x: c.x, z: c.z, facing };
  };
}

export function tick(rt, P) {
  const F = rt.flags, st = F._jin;
  if (!st || rt.over) return;
  const M = st.M, step = F.step || 0;
  if (step === st.step) return;
  st.step = step; st.t0 = rt.t;
  const later = (s, fn) => rt.after(s, () => { if (!rt.over && F.step === step) { try { fn(); } catch (e) { /* 軽い大軍が無くても戦は進む */ } } });
  try {
    if (step === 1) {
      // 毛利の手の後ろの大勢が、勝永の先手に付いてまとまって寄せる（中央突破の塊）
      M.mori?.follow(toward(rt, F.mori, 12), { gap: 12, speed: 3.2 });
      // 先手の東の脇でも本多の手と毛利の手が組み合い、押される（先手が押し込まれていく様子）
      st.cl = clash(rt, { x: P.FRONT.x + 36, z: P.FRONT.z - 8, facing: S, w: 30, gap0: 14, seed: 16209, host: false, noRout: true, noWake: true, killRate: 0.004, maxDrift: 8, corpses: 8, nearHide: 0,
        A: { flag: 'honda', armor: 0x1c1a18, count: isTouch ? 70 : 120, flagRate: 0.2 }, B: { flag: 'toyotomi', armor: 0x221f1c, count: isTouch ? 80 : 140, flagRate: 0.25, guns: true } });
      st.cl?.go?.(); later(20, () => st.cl?.push?.('B', 0.5));
    } else if (step === 2) {
      // 先手が崩れる。毛利の塊は家康の本陣へ、茶臼山の赤備えと騎馬も真田の突撃に付いて走る
      M.sen?.rout({ hideAfter: 40 });
      st.cl?.rout?.('A', { from: -1, minFight: 2 });
      M.mori?.follow(toward(rt, F.katsu && alive(F.katsu) ? F.katsu : F.mori, 12), { gap: 12, speed: 3.4 });
      M.sana?.follow(toward(rt, F.sanada, 14), { gap: 14, speed: 3.6 });
      M.sanaK?.follow(toward(rt, F.sanada, 6), { gap: 6, speed: 5.5 });
      later(30, () => M.ni?.retreat(6, 6));   // 二陣が押されて下がる
    } else if (step === 3) {
      // 本陣が乱れる：二陣は崩れ、旗本は逃げ散る（三里も逃げた者がいた。史実）
      M.ni?.rout({ hideAfter: 40 });
      M.hata?.retreat(24, 14);
      M.sana?.follow(toward(rt, F.sanada2, 14), { gap: 14, speed: 3.6 });
      M.sanaK?.follow(toward(rt, F.sanada2, 6), { gap: 6, speed: 5.5 });
      // 新手：水野勝成の手が南東から駆け付け、崩れた二陣の所を埋める（戦場を空にしない）
      later(30, () => {
        const W = rt.world;
        M.mizu = W.addDistantArmy({ host: false, kind: 'mixed', x: P.HON.x + 60, z: P.HON.z + 50, w: 40, d: 10, count: isTouch ? 120 : 200, facing: S, armor: 0x1f1e1c, flag: 'tokugawa', flagTex: flagTexture('tokugawa'), seed: 16210 });
        M.mizu?.moveTo(P.NIJIN.x + 6, P.NIJIN.z + 16, 40);
        rt.say('使番', '水野日向守の手が南から駆け付けた！　二陣の崩れを埋めるぞ', 3.2);
      });
      later(45, () => M.hata?.reform());   // 逃げた旗本が戻って本陣の後ろを固め直す
    } else if (step === 4) {
      // 越前勢の後ろの大勢が真田の横へ。真田の大勢は四十秒で崩れる
      M.echi?.moveTo(P.HONF.x - 34, P.HONF.z - 30, 40);
      M.sana?.follow(toward(rt, F.nobu, 12), { gap: 12, speed: 3.4 });
      M.sanaK?.follow(toward(rt, F.nobu, 6), { gap: 6, speed: 5 });
      later(40, () => { M.sana?.rout({ hideAfter: 40 }); M.sanaK?.rout({ hideAfter: 30 }); });
    } else if (step === 6) {
      // 毛利の手は殿を残して城へ退く
      M.mori?.follow(null); M.mori?.moveTo(P.SHITENNO.x, P.SHITENNO.z - 40, 50);
    }
  } catch (e) { /* 軽い大軍が無くても戦は進む */ }
}
