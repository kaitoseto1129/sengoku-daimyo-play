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
  // 携帯（iPhone・iPad）：11/9 実機で天王寺岡山が落ちた（signal 9・Shader Error 1281）。軽い大軍が十五の塊・千七百人あった。
  //   携帯は塊を本陣・先手・二陣・毛利・真田の芯だけにし（形と材質の組を減らす）、人数も四割減らす（docs/crash_1108.md）
  const n = (a, b) => (isTouch ? Math.round(a * 0.6) : b);
  const MINOR = new Set([16204, 16212, 16213, 16214, 16215, 16216, 16217, 16208]);   // 脇・伊達・酒井・浅野・黒田・明石・大野・真田の騎馬
  const mk = (o) => { if (isTouch && MINOR.has(o.seed)) return null; try { return W.addDistantArmy({ host: false, kind: 'mixed', ...o, flagTex: flagTexture(o.flag) }); } catch (e) { return null; } };
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
    // 左右の翼と後詰（docs/generals_toyo_toku_1108.md の15番。名のある大名の備を旗で見せる。戦わない）
    todo: mk({ x: FRONT.x + 52, z: FRONT.z + 40, w: 36, d: 12, count: n(110, 200), facing: S, armor: 0x1f1e1c, flag: 'todo', seed: 16211 }),   // 右翼：藤堂高虎
    date: mk({ x: FRONT.x + 70, z: HON.z - 10, w: 40, d: 14, count: n(130, 240), facing: S, armor: 0x1a1a22, flag: 'date', seed: 16212 }),   // 右翼の奥：伊達政宗・片倉重長
    sakai: mk({ x: -128, z: HON.z + 4, w: 30, d: 12, count: n(90, 160), facing: S + 0.5, armor: 0x1f1e1c, flag: 'tokugawa', seed: 16213 }),   // 左翼：酒井家次・本多忠政
    asano: mk({ x: HON.x + 34, z: HON.z + 70, w: 36, d: 12, count: n(100, 180), facing: S, armor: 0x1f1e1c, flag: 'asano', seed: 16214 }),   // 後詰：浅野長晟（寝返りの噂の的）
    kuroda: mk({ x: HON.x - 40, z: HON.z + 66, w: 34, d: 12, count: n(90, 160), facing: S, armor: 0x1f1e1c, flag: 'kuroda', seed: 16215 }),   // 後詰：黒田長政・細川忠興
    akashi: mk({ x: SHITENNO.x - 48, z: SHITENNO.z - 26, w: 32, d: 12, count: n(110, 200), facing: 0, team: 1, armor: 0x221f1c, flag: 'toyotomi', seed: 16216 }),   // 明石全登（船場口から）
    ono: mk({ x: SHITENNO.x + 40, z: SHITENNO.z - 70, w: 40, d: 14, count: n(120, 220), facing: 0, team: 1, armor: 0x221f1c, flag: 'toyotomi', seed: 16217 }),   // 大野治長・城の前の備
    sanaK: mk({ x: CHAUSU.x + 12, z: CHAUSU.z - 16, w: 26, d: 12, count: n(80, 140), facing: 0.6, team: 1, armor: 0x8e1f16, flag: 'sanada', kind: 'cavalry', seed: 16208 }),
  };
  const st = { M, step: -1, t0: 0, cl: null, rep: {}, sd: 999, flagT: 0 };
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
  crisis(rt, st, P);
  if (step === st.step) return;
  st.step = step; st.t0 = rt.t; st.sd = 999;   // 段ごとに、真田の遠さを知らせ直す
  const later = (s, fn) => rt.after(s, () => { if (!rt.over && F.step === step) { try { fn(); } catch (e) { /* 軽い大軍が無くても戦は進む */ } } });
  try {
    if (step === 1) {
      // 毛利の手の後ろの大勢が、勝永の先手に付いてまとまって寄せる（中央突破の塊）
      M.mori?.follow(toward(rt, F.mori, 12), { gap: 12, speed: 3.2 });
      // 先手の東の脇でも本多の手と毛利の手が組み合い、押される（先手が押し込まれていく様子）
      st.cl = clash(rt, { x: P.FRONT.x + 36, z: P.FRONT.z - 8, facing: S, w: 30, gap0: 14, seed: 16209, host: false, noRout: true, noWake: true, killRate: 0.004, maxDrift: 8, corpses: 8, nearHide: 0,
        A: { flag: 'honda', armor: 0x1c1a18, count: isTouch ? 40 : 120, flagRate: 0.2 }, B: { flag: 'toyotomi', armor: 0x221f1c, count: isTouch ? 44 : 140, flagRate: 0.25, guns: true } });
      st.cl?.go?.(); later(20, () => st.cl?.push?.('B', 0.5));
    } else if (step === 2) {
      // 城の方から三方面：北西の明石・北東の大野の大勢も本陣の方へ押し出す（11/9 kaito）
      M.akashi?.moveTo(P.HON.x - 50, P.HON.z - 70, 120, { charge: true });
      M.ono?.moveTo(P.HON.x + 46, P.HON.z - 60, 120, { charge: true });
      M.hata?.moveTo(P.HON.x, P.HON.z + 16, 30);   // 本陣の後ろの旗本も前へ（後ろでくすぶらない）
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
        M.mizu = W.addDistantArmy({ host: false, kind: 'mixed', x: P.HON.x + 60, z: P.HON.z + 50, w: 40, d: 10, count: isTouch ? 60 : 200, facing: S, armor: 0x1f1e1c, flag: 'tokugawa', flagTex: flagTexture('tokugawa'), seed: 16210 });
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

// 危機の重ね（docs/k15_crisis_spec_1108.md「危機は使番が実際に来て伝える。報告がどんどん悪くなる」「旗を減らす」「家康の周りの人数を減らす」）
const say1 = (rt, st, key, who, text) => { if (st.rep[key]) return; st.rep[key] = true; rt.say(who, text, 3); };
function crisis(rt, st, P) {
  const F = rt.flags, step = F.step, M = st.M, dt = rt.t - st.t0;
  if (F.ending) return;
  const cnt = (g) => (g && !g.routed ? g.count : 0);
  if (step === 1) {
    if (dt > 25) say1(rt, st, 'p1', '使番', '前衛、押されております！');
    if (F.honda && F.honda.initial && cnt(F.honda) < F.honda.initial * 0.6) say1(rt, st, 'p2', '使番', '本多隊、後退！　毛利勢、止まりませぬ！');
    if (F.nijin && cnt(F.nijin) && F.mori && alive(F.mori)) { const c = centerOf(F.mori)(); if (c.z > P.NIJIN.z - 14) say1(rt, st, 'p3', '使番', '毛利勢、第一陣を突破！　二陣へかかります！'); }
  }
  if (step === 2 || step === 3) {
    // 真田隊から家康までの遠さを、使番が近づくたびに知らせる（遊びの縮尺で、実の遠さに直して二百四十から六十まで）
    const g = step === 2 ? F.sanada : F.sanada2, I = F.ieyasu;
    if (alive(g) && I && I.alive) {
      const c = centerOf(g)(), d = Math.hypot(c.x - I.pos.x, c.z - I.pos.z);
      const marks = [[120, '真田隊、本陣まで二百四十！'], [95, '真田隊、百九十！　止まりませぬ！'], [70, '真田隊、百四十！　中央を抜けました！'], [45, '真田隊、九十！　本陣へ来るぞ！'], [30, '真田隊、六十！　上様、ここは危のうございます！']];
      for (const [r, text] of marks) if (d < r && st.sd >= r) { st.sd = r; rt.say('使番', text, 3); if (r <= 45) M.waki?.retreat(10, 6); break; }
    }
    // 本陣の葵の幟が一本ずつ倒れる（十五秒に一本。四本は残す）
    if (rt.t - st.flagT > 15 && F.honNobori && F.honNobori.length > 4) {
      st.flagT = rt.t;
      const nb = F.honNobori.splice(Math.floor(Math.random() * F.honNobori.length), 1)[0];
      if (nb) { nb.rotation.z = (Math.random() < 0.5 ? -1 : 1) * 1.45; nb.position.y -= 0.3; }
    }
  }
  // 真田が家康の退いた後の旧本陣へ着く：倒れた幟・空の床几。「逃したか……！」（完璧に守っても間に合わない所）
  if ((step === 3 || step === 4) && !st.rep.nige && F.ieyasu?.alive) {
    const I = F.ieyasu, far = Math.hypot(I.pos.x - P.HON.x, I.pos.z - P.HON.z) > 18;
    let got = false;
    for (const g of [F.sanada2, F.sanada3, F.nobu, ...(F.newE || [])]) if (alive(g)) for (const u of g.units) if (u.alive && !u.fleeing && Math.hypot(u.pos.x - P.HON.x, u.pos.z - P.HON.z) < 9) { got = true; break; }
    if (got && far) {
      st.rep.nige = true;
      rt.say('真田信繁', '逃したか……！　家康を追え！', 3);
      for (const nb of F.honNobori || []) { nb.rotation.z = (Math.random() < 0.5 ? -1 : 1) * 1.45; }
      F.honNobori = [];
    }
  }
  if (step === 4) say1(rt, st, 'p4', '使番', '越前勢、参ります！　ここから押し返すぞ！');
}
