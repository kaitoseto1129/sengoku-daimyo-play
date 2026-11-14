// ======================================================================
// 桶狭間 「最初の戦で何をすごいと思わせるか」（kaito 11/9 夜・docs/okehazama_spec_1109.md）の三つの瞬間
//   1. 谷を下り始めると、桶狭間山の向こうの丘一帯に今川の大軍（旗・陣の煙・人の列）が見える。「あれ全部、今川か」
//   2. 豪雨は曇り→雨→強い雨と強まり、「かかれ」は雨の中。組の左右と後ろの織田勢が一斉に走り出す。雨は麓の陣を破ってから弱まる
//   3. 義元が討たれると本陣の今川の幟が倒れ、「討死」の声が奥へ伝わり、丘一帯の大軍も退いてゆく。戦後に「名は？」
//   ほかに一度だけ：行軍中、話していた隣の足軽が流れ弾に倒れ、組は止まらない（味方も普通に死ぬ）。
//   遠くの軍勢は軽い作り（addDistantArmy・本物へ替えない）。本物の兵の数は増やさない。
// ======================================================================
import { sfx } from '../audio.js';
import { noboriInScene } from '../props.js';
import { MEM_TIGHT } from '../settings.js';
import { nm } from '../bhelp.js';

const ready = (u) => !!u && u.alive && !u.gone && !u.fleeing && !u.woundOut && !u.noTarget;
const S = (rt) => (rt.flags.o15.sg ||= {});
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// 桶狭間山の西と奥の丘一帯に陣取る今川の本軍（布陣図：全軍二万五千前後・鷲津・大高の外）
// 11/10 撮って確かめた：決めた所に置くと、林・丘・霞に隠れて谷の出口から見えなかった。
//   谷を下り始めた時に、本人の目から本陣の方へ見通せる丘を地形の高さで探し、そこへ置く（本陣の本物の兵から七十歩より離す）。
const BEARINGS = [-0.2, 0.2, -0.4, 0.4, -0.6, 0.6, -0.8, 0.8, -1, 1, -1.2, 1.2];
const RANGES = [170, 145, 120];

export function install(rt) {
  // 関所4：名の無い味方の侍が討たれただけで「味方の大将が討たれた」と出さない（共通の決め手の一言を、この戦では先に済ませた事にする）
  const dc = rt.decisiveCamera || (rt.decisiveCamera = { applied: 0 });
  (dc.said || (dc.said = new Set())).add('味方の大将が討たれた');
  S(rt).vista = [];
}

// 林の木の幹（一度だけ集める）。見通しの線から四歩以内に木があれば、その向きは林に隠れる
function treesOf(W) {
  if (W._okeTrees) return W._okeTrees;
  const out = [], m4 = { elements: null };
  for (const m of [...(W.treeMeshes || []), ...(W.farTreeMeshes || [])]) {
    if (!m.isInstancedMesh || !m.instanceMatrix) continue;
    const a = m.instanceMatrix.array;
    for (let i = 0; i < m.count; i++) if (a[i * 16]) out.push(a[i * 16 + 12], a[i * 16 + 14]);
  }
  return (W._okeTrees = out);
}
function treeBlocks(W, P, q) {
  const T = treesOf(W), dx = q.x - P.x, dz = q.z - P.z, L = Math.hypot(dx, dz) || 1;
  for (let i = 0; i < T.length; i += 2) {
    const tx = T[i] - P.x, tz = T[i + 1] - P.z, along = (tx * dx + tz * dz) / L;
    if (along < 6 || along > L - 10) continue;
    if (Math.abs(tx * dz - tz * dx) / L < 4) return true;
  }
  return false;
}

function placeVista(rt, C, P, force) {
  const v = S(rt), k = MEM_TIGHT ? 0.55 : 1, W = rt.world;
  const h = C.fieldPoint(C.HONJIN.x, C.HONJIN.z), base = Math.atan2(h.x - P.x, h.z - P.z);
  const spots = [];
  for (const b of BEARINGS) {
    if (spots.length >= 5) break;
    const a = base + b;
    for (const r of RANGES) {
      const q = { x: P.x + Math.sin(a) * r, z: P.z + Math.cos(a) * r };
      if (dist(q, h) < 70 || spots.some((o) => dist(o, q) < 45) || !sees(W, P, q) || !force && treeBlocks(W, P, q)) continue;
      spots.push(q); break;
    }
  }
  if (spots.length < 2 && !force) return 0;
  spots.forEach((q, i) => {
    try {
      const m = W.addDistantArmy({ x: q.x, z: q.z, w: 56, d: 20, count: Math.round(220 * k), facing: Math.atan2(P.x - q.x, P.z - q.z),
        armor: i % 2 ? 0x3a3026 : 0x3f2a24, mon: 'imagawa', seed: 181 + i, kind: i === 2 ? 'cavalry' : 'mixed', host: false, farFill: true, team: 0 });
      // team 0 で作るのは、共通の「敵の後詰めを本人の五十〜八十五歩へ寄せる」を外すため。作った後は今川（1）に戻す
      // avHost：共通の「本物の兵の付かない絵の大軍は隠す」（av_host.js・11/3 AV4）から外す。桶狭間の指示書（11/9 夜）は遠くの今川の大軍を見せる事が一つ目の瞬間
      if (m?.army) { m.army.noWake = true; m.army.team = 1; m.army.avHost = true; }
      // 林の先に見せる大軍は、八十歩より遠い軍勢を隠す処理から外す。
      // 視野・地形・霧による省略と、軽い形への切替は共通のまま使う。
      m?.traverse?.((mesh) => { if (mesh.isInstancedMesh) mesh.userData.keepDistantArmy = true; });
      v.vista.push(m);
      // 昼の休みの炊ぎの煙（陣の後ろから細く）
      if (i % 2 === 0) W.addSmokeColumn?.(q.x, W.heightAt(q.x, q.z) + 2, q.z, { size: 1.4 });
    } catch (e) { /* 描けなくても進む */ }
  });
  v.vistaAt = spots[0];
  return spots.length;
}

// 目の高さから旗の高さまで、地形に遮られずに見えるか
function sees(W, P, q) {
  const ey = W.heightAt(P.x, P.z) + 1.7, qy = W.heightAt(q.x, q.z) + 4;
  for (let s = 1; s < 40; s++) { const t = s / 40; if (W.heightAt(P.x + (q.x - P.x) * t, P.z + (q.z - P.z) * t) > ey + (qy - ey) * t + 0.3) return false; }
  return true;
}
function say(rt, who, text, d = 3) { if (!rt.over && !rt.flags.ending) rt.say(who, text, d); }

export function tick(rt, dt) {
  const F = rt.flags, v = S(rt), C = F.o15.C;
  if (rt.over) return;
  const P = rt.player.u.pos;
  // ① 谷を下り始めた所（雨の前・曇り）で、本陣の方の丘一帯に今川の大軍を見せる
  if (!v.vistaSaid && (rt.phase === 'march' && rt.t - (F.marchBegan ?? rt.t) > 2 || rt.phase === 'wait') && rt.t >= (v.vistaNext || 0)) {
    v.vistaNext = rt.t + 1;
    v.vistaTry = (v.vistaTry || 0) + 1;
    if (placeVista(rt, C, P, v.vistaTry > 15) >= 2 || v.vistaTry > 15) {
      v.vistaSaid = true; v.vistaSaidT = rt.t;
      if (v.vistaAt) rt.army.playFar?.('eshout', v.vistaAt, 0.6);
      say(rt, '弥七', '見よ、本陣の方の丘……旗だらけじゃ。あれ全部、今川か', 2.8);
      rt.after(2.8, () => say(rt, '組頭 源八', '二万を超えるそうじゃ。こちらは二千に足らぬ。あの真ん中の義元へ突っ込む', 3.4));
    }
  }
  // 殿の本陣の塊が横を通ると、周りの兵が気付く（一度だけ）
  if (!v.tonoSaid && !rt.G.lord && (rt.phase === 'march' || rt.phase === 'brief') && ready(F.nob?.units?.[0]) && dist(F.nob.units[0].pos, P) < 14) {
    v.tonoSaid = true;
    say(rt, '足軽', '殿じゃ……！　殿の馬印が前へ出られるぞ', 2.6);
  }
  // 雨は曇り→雨→強い雨と強まる（本体は降り始めに一度だけ最大を置く）
  //   大軍を見せる台詞が済むまで（見えてから六秒）は降らせない（雨の前の曇り）
  if (F.rain && !F.clear && rt.phase === 'march' && (!v.vistaSaid || rt.t - v.vistaSaidT < 6)) { rt.world.setRainTarget(0); rt.world.hailT = 0; }
  else if (F.rain && !F.clear && rt.phase === 'march') {
    if (v.rainT == null) { try { rt.world.setTime('storm'); } catch (e) { /* 空を変えられなくても進む */ } sfx('thunder', 0.8); rt.world.hailT = 18; }
    v.rainT ??= rt.t;
    rt.world.setRainTarget(Math.min(1, 0.3 + (rt.t - v.rainT) / 14));
  }
  // 一度だけ：話していた隣の足軽が流れ弾に倒れる。組は止まらない
  if (rt.phase === 'march' && F.rain && !v.strayT && rt.t - (v.rainT ?? rt.t) > 16 && !F.scoutFighting) {
    const g = rt.hostGroup;
    const u = g?.units?.find((q) => ready(q) && !q.isPlayer && !q.name && q !== F.yashichi && q.type === 'ashigaru' && dist(q.pos, P) > 2 && dist(q.pos, P) < 10);
    if (u) {
      v.strayT = rt.t;
      say(rt, '足軽', 'この雨なら、今川も気付くまい。首を取って、村へ帰って……', 2.6);
      rt.after(2.4, () => {
        if (rt.over || !ready(u)) return;
        try { sfx('gun', 0.9); } catch (e) { /* 音が無くても進む */ }
        u.hit = { kind: 'fall', t: 0, dur: 1, from: 'front', side: 1, part: 'torso', res: 'gap', heavy: true, wkind: 'shot' };
        rt.army.kill(u, null);
      });
      rt.after(3.6, () => say(rt, '組頭 源八', '止まるな！　頭を下げて進め！', 2.4));
    } else if (rt.t - (v.rainT ?? rt.t) > 40) v.strayT = -1;
  }
  // ② 豪雨の中の「かかれ」：左右と後ろの織田勢が一斉に走り出す。雨は麓の陣を破るまで強い
  if (F.kakare && !v.runT) {
    v.runT = rt.t;
    try { rt.world.setTime('storm'); } catch (e) { /* 空を変えられなくても進む */ }
    rt.army.playFar?.('toki', P, 1.4); sfx('taiko', 1); rt.after(0.8, () => sfx('horagai', 0.9));
    const h = C.fieldPoint(C.HONJIN.x, C.HONJIN.z);
    const face = Math.atan2(h.x - P.x, h.z - P.z), fx = Math.sin(face), fz = Math.cos(face);
    const n = MEM_TIGHT ? 50 : 90;
    v.run = [];
    // 本人の後ろ・左右の後ろに三つの塊（本人の組と重ねない。三十〜四十五歩離す）
    for (const [side, back, mon] of [[-34, 18, 'oda'], [34, 14, 'eiraku'], [0, 46, 'oda']]) {
      const x = P.x - fx * back + fz * side, z = P.z - fz * back - fx * side;
      try {
        const m = rt.world.addDistantArmy({ x, z, w: 18, d: 12, count: n, facing: face, armor: 0x2a2622, mon, seed: 211 + v.run.length, kind: 'mixed', host: false, farFill: true });
        if (m?.army) { m.army.noWake = true; m.army.avHost = true; }
        m?.advance?.(Math.max(20, dist({ x, z }, h) - 70), 26, { charge: true });
        v.run.push(m);
      } catch (e) { /* 描けなくても進む */ }
    }
    rt.after(1.5, () => say(rt, '弥七', '皆、走っておる……！　殿の旗も、後ろの組の旗も前へ！', 2.8));
    // 走り抜けた塊は本物の戦の場へ入る前に雨の中へ消す（本物の兵と重ねない）
    rt.after(27, () => { for (const m of v.run) if (m) m.visible = false; });
  }
  if (v.runT && !v.dryT) {
    const o = F.o15;
    const fadeFrom = o.nidaDone ? (v.fadeT ??= rt.t) : null;
    // K087 司令塔 11/13：本陣の幕の前でも雨筋が見えるよう、弱まっても半分より下げない（上がるのは義元が討たれてから）
    const r = fadeFrom == null ? 0.85 : Math.max(0.55, 0.85 - (rt.t - fadeFrom) / 25);
    rt.world.setRainTarget(r);
    if (fadeFrom != null && r <= 0.55) {
      v.dryT = rt.t;
      say(rt, '組頭 源八', '雨が弱まった。見よ、あれが義元の本陣の幕じゃ', 3);
    }
  }
  // 義元が討たれてから雨が上がる（spec 14:00〜「雨が弱まる」）
  if (v.fallT && !v.clearT && rt.t - v.fallT > 4) {
    const r = Math.max(0, 0.55 - (rt.t - v.fallT - 4) / 20);
    rt.world.setRainTarget(r);
    if (r <= 0) { v.clearT = rt.t; try { rt.world.setTime('after'); } catch (e) { /* 空を変えられなくても進む */ } }
  }
  // K087：本陣に突っ込むと旗が崩れる。旗本が欠けるたびに、幕のまわりの今川の幟を一本ずつ倒す（最後の二本は義元の討死で倒す）
  const H = rt.flags.hatamoto;
  if (H?.units && !F.victory) {
    v.hatoN ??= H.units.length;
    let alive = 0; for (const u of H.units) if (ready(u)) alive++;
    const down = v.hatoN - alive;
    if (!v.near) {
      const h = C.fieldPoint(C.HONJIN.x, C.HONJIN.z);
      v.near = noboriInScene(rt.scene).filter((g) => !g.userData.kind || g.userData.kind === 'imagawa')
        .map((g) => ({ g, w: g.getWorldPosition(g.position.clone()) })).filter((o) => dist(o.w, h) < 70);   // 幕の前の坂の旗本の幟まで
      v.near.sort((a, b) => dist(b.w, h) - dist(a.w, h));   // 外の幟から倒す
      v.nearFell = 0;
    }
    const want = Math.min(Math.max(0, v.near.length - 2), Math.floor(down / 3));
    while (v.nearFell < want) {
      const o = v.near[v.nearFell++];
      (v.flags ||= []).push({ g: o.g, at: -1, t: 0, a: Math.random() * Math.PI * 2, base: o.g.rotation.clone(), early: true });
      o.g.userData.fallen = true;
      if (v.nearFell === 1) say(rt, '今川の兵', '旗が……旗が倒れたぞ！', 2.2);
    }
  }
  // ③ 義元討死：本陣の幟が倒れ、声が奥へ伝わり、丘一帯の大軍も退く
  if (F.victory && !v.fallT) {
    v.fallT = rt.t;
    const h = C.fieldPoint(C.HONJIN.x, C.HONJIN.z);
    v.flags = (v.flags || []).filter((f) => f.early);
    for (const g of noboriInScene(rt.scene)) {
      if (g.userData.kind && g.userData.kind !== 'imagawa') continue;
      const w = g.getWorldPosition ? g.getWorldPosition(g.position.clone()) : g.position;
      if (dist(w, h) < 45 && !g.userData.fallen) v.flags.push({ g, at: 0.4 + v.flags.length * 0.5 + Math.random() * 0.4, t: 0, a: Math.random() * Math.PI * 2, base: g.rotation.clone() });
    }
    rt.after(2.2, () => say(rt, '今川の兵', '御屋形様が……御屋形様が討たれた！', 2.6));
    rt.after(5, () => { rt.army.playFar?.('eshout', C.fieldPoint(-70, -300), 1); say(rt, '今川の兵', '義元公、討死！　義元公、討死じゃあ！', 2.8); });
    rt.after(8, () => say(rt, '今川の兵', '退け、退けぇ！　駿河へ戻れ！', 2.4));
    (v.vista || []).forEach((m, i) => rt.after(6 + i * 1.6, () => { try { m?.rout?.({ hideAfter: 90 }); } catch (e) { /* 退かせられなくても進む */ } }));
  }
  if (v.flags) for (const f of v.flags) {
    if (f.done || !f.early && rt.t - v.fallT < f.at) continue;
    f.t += dt;
    const k = Math.min(1, f.t / 1.4), e = k * k;
    f.g.rotation.set(f.base.x + Math.cos(f.a) * e * 1.45, f.base.y, f.base.z + Math.sin(f.a) * e * 1.45);
    if (k >= 1) f.done = true;
  }
}

// 戦後：上官に名を聞かれる（出世につながると分からせる。主人公はまだ足軽）
export function nameAsked(rt, at) {
  if (rt.G.lord) return;
  // 帰陣後は ending が立つ。戦中の声を止める say を通すと、この三言も消えてしまう。
  const report = (who, text, d) => { if (!rt.over && rt.flags.o15?.yoinT != null) rt.say(who, text, d); };
  rt.after(at, () => report('前田又左衛門', 'そこの足軽。本陣の幕まで斬り込んでおったな。名は？', 3));
  rt.after(at + 3.1, () => report('組頭 源八', `わしの組の${nm(rt)}にござる`, 2.2));
  rt.after(at + 5.4, () => report('前田又左衛門', '覚えておく。殿にも申し上げておこう', 2.4));
}
