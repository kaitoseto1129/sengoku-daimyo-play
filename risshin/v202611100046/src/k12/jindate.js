// ======================================================================
// 樫井の陣立ての厚みと流れ（kaito 11/8 docs/toku15_plan_1108.md の 12・docs/army_depth_spec_1108.md）
//   浅野の本隊（約五千）は川の南に本陣・後備えと重なって構え、前に出るのは殿と村の備えだけ。
//   豊臣方は塙団右衛門の先手だけが突き出て、大野治房の後続は北の遠くに旗を並べたまま遅れる（「敵が突出している」）。
//   治房の後続は動かない。浅野は川を越えて深追いせず、終戦時に後続は北へ引き上げる。
// 軽い大軍（addDistantArmy。兵力の数に入れない・本物に替えない）。浅野の騎馬と、塙・岡部の騎馬も本物で足す。
// 入れ方：setup の終わりで install(rt, def)。update の頭で tick(rt, dt)。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { allyGroup } from '../bhelp.js';
import * as kerai from './kerai.js';
import { depthOrder } from '../army_depth.js';

const N = Math.PI;   // 北（−z）を向く
const n = (a, b) => (isTouch ? a : b);

export function install(rt, def) {
  const W = rt.world, F = rt.flags;
  const mk = (o) => { try { return W.addDistantArmy ? W.addDistantArmy({ host: false, farFill: true, kind: 'mixed', ...o, flagTex: flagTexture(o.flag) }) : null; } catch (e) { return null; } };
  const M = {
    // 浅野の二陣・本陣・後備えと治房の後続の軽い備は、陣立ての表（k12/depth.js・army_depth.js）が置く
  };
  // 治房本人は貝塚から動かず、この戦場には置かない。北の遠い旗だけを残す。
  F._jin12 = { M, step: -1, def };
  return F._jin12;
}

export function tick(rt, dt) {
  const F = rt.flags, st = F._jin12;
  if (!st) return;
  // 陣立ての表の備へ、使番で下知を送る（army_depth.js が無くても戦は進む）
  const order = (side, id, cmd) => { try { const D = F.depth && F.depth[side]; if (D) depthOrder(D, id, cmd); } catch (e) { /* 無くても進む */ } };
  kerai.tick(rt, dt, {
    guards: () => [F.mine],
    // 本陣の旗本・池の堤の伏せ鉄砲（③まで）は持ち場で構えたまま
    keepHold: (g) => g === F.honjin || ((g === F.pondGuns || g === F.kame) && (F.step || 0) < 3),
    guns: () => ((F.step || 0) <= 2 ? [F.kame, F.pondGuns] : [F.ueda, F.tomo, F.kame]),
  });
  const M = st.M;
  // 終わり：浅野は川を越えて追わない（足を止める）。治房の後続は北へ引き上げる
  if (F.ending && !st.end) {
    st.end = true;
    if (rt.tracker && rt.tracker.main) {
      for (const g of rt.army.groups) if (g.team === 0 && g.count && !g.routed && !g.isPlayerSquad && g !== F.mine) { const c = g.center(); g.order = 'hold'; g.anchor = { x: c.x, z: c.z }; g.seekRange = 0; g.focus = null; }
      for (const id of ['harufusa', 'harufusa2', 'harutane', 'harufusa3', 'konidaB']) order('B', id, 'retreat');
    }
    return;
  }
  const step = F.step || 0;
  if (step === st.step || F.ending) return;
  st.step = step;
  const later = (s, fn) => rt.after(s, () => { if (!F.ending && F.step === step) { try { fn(); } catch (e) { /* 軽い大軍が無くても戦は進む */ } } });
  if (step === 1) {
    // 塙の手だけが突き出ている事を、使番の口で一度だけ
    later(44, () => rt.say('使番', '塙の手だけが突き出ておる。治房の本隊は、まだ貝塚の旗の下じゃ', 3.4));
  } else if (step === 3) {
    // 浅野の二陣が村の南の端まで詰める。治房の後続はようやく旗を動かす（遠い）
    order('A', 'ni', 'advance');
  } else if (step === 4) {
    // 浅野の騎馬が南から東の口へ駆け、岡部の横を受ける。岡部の手にも騎馬が付いて来る
    const C = F.step === 4 && allyGroup(rt, { faction: 'tokugawa', name: '浅野の騎馬', fixed: true, anchor: { x: 30, z: -14 }, facing: N, width: 5, aggro: 14, order: 'attack', seekRange: 60, speed: 6, noRout: true, dmgMult: 0.8 },
      [{ type: 'cavalry', n: n(5, 6), o: { flag: 'asano' } }]);
    if (C) { C.anchor = { x: 38, z: -38 }; F.asaKiba = C; }
    later(4, () => {
      const E = st.def.foe(rt, '岡部の騎馬', { x: 150, z: -96 }, [{ type: 'cavalry', n: n(3, 4) }], { aim: { x: 36, z: -42 }, rout: 20 });
      E.speed = 6; E.seekRange = 50;
    });
    later(5, () => rt.say('浅野の侍', '騎馬は東の口へ！　岡部の横腹を突け！', 2.8));
  } else if (step === 5) {
    // 塙の侍衆に騎馬が並ぶ。治房の後続は動かない
    later(2, () => {
      const E = st.def.foe(rt, '塙の騎馬', { x: -14, z: -200 }, [{ type: 'cavalry', n: n(3, 4) }], { aim: { x: -6, z: -60 }, rout: 999 });
      E.speed = 6; E.seekRange = 40;
    });
    later(12, () => rt.say('使番', '北に後続の旗！　治房の本隊は貝塚から動かぬ', 3));
  }
}
