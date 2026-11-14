// ======================================================================
// 天王寺・岡山の陣立ての厚み（11/8 kaito「本陣に至るまでに陣が何重にも重なり、それが突破され、陣形が崩れる様子で危機感を」
//   「戦場が空っぽになる」「大勢がまとまって中央突破してくる」）。docs/army_depth_1106.md の 前衛→二陣→旗本→本陣→後詰。
// 本物の兵（b_k15_tennoji_okayama.js の隊）の後ろに、軽い大軍（world_army.js の addDistantArmy。兵力の数に入れない・本物に替えない）を重ねる。
//   味方：本多の先手・榊原の二陣・本陣の後ろの旗本・本陣の西の脇備え・越前勢の後ろ。
//   敵：毛利の手の後ろ（毛利勝永の先手の後ろへ付いて一緒に寄せる＝中央突破の塊）・茶臼山の赤備えと騎馬（真田の突撃に付いて走る）。
// 段の移りで、先手が崩れ（rout）・二陣が押されて退き・旗本が逃げ散り・新手（水野の手）が南から駆け付ける。
// 11/12 MB二（台帳 K033「毛利の旗を高く・黒い塊に見える・兵の色が暗すぎ」）：軽い兵の鎧を真っ黒（0x22/0x1f）から鉄錆の暗い茶（0x35/0x2e）へ。11/13：毛利の先手は写真でまだ黒い塊だったので 0x3a3028→0x4a3a2c（鉄錆に赤味）。毛利は旗を三割に
// 入れ方：setup で install(rt, P) を一度。update で tick(rt) を呼ぶ（段の移りは F.step を見て自分で気づく）。
// ======================================================================
import { flagTexture } from '../textures.js';
import { isTouch } from '../touch.js';
import { centerOf } from '../bhelp.js';
import { clash } from '../b_sekigahara.js';
import { realFromLight } from '../depth_reserve.js';
import { enemyGroup, allyGroup } from '../bhelp.js';

const S = Math.PI;
const alive = (g) => g && !g.routed && g.count > 0;

// 徳川・豊臣の備の名（kaito 11/13 の布陣図：天王寺口は四重・岡山口は二重。K287）：置き場の備に、その家の名札を付ける
const SEED_NAME = { 16201: '秋田実季・浅野長重・真田信吉（一の列）', 16202: '榊原康勝の二陣（三の列）', 16203: '徳川頼宣の備え', 16204: '本陣の脇備え', 16205: '松平忠直の後備え（二の列）', 16206: '毛利勝永の後備え', 16207: '真田の赤備え', 16208: '真田の騎馬', 16211: '藤堂高虎（岡山口・二の列）', 16212: '伊達政宗・片倉重長（西の端）', 16213: '酒井家次・本多忠政', 16214: '浅野長晟（西の端）', 16215: '黒田長政・細川忠興', 16216: '明石全登', 16217: '大野治長', 16221: '諏訪忠澄・保科正光（三の列）', 16222: '内藤忠興・松平康長・酒井家次・松平忠良・仙石忠政（四の列）', 16223: '毛利の二陣', 16224: '毛利の後備え', 16225: '毛利の三陣', 16231: '前田利常・本多康紀・片桐且元（岡山口・一の列）', 16232: '井伊直孝・細川忠興・藤堂高虎（岡山口・二の列）', 16233: '徳川秀忠の本陣（岡山口・後ろ）' };
export function install(rt, P) {
  const W = rt.world, F = rt.flags, st0 = {};
  if (!W.addDistantArmy) return null;
  // 携帯（iPhone・iPad）：11/9 実機で天王寺岡山が落ちた（signal 9・Shader Error 1281）。軽い大軍が十五の塊・千七百人あった。
  //   携帯は塊を本陣・先手・二陣・毛利・真田の芯だけにし（形と材質の組を減らす）、人数も四割減らす（docs/crash_1108.md）
  const n = (a, b) => (isTouch ? Math.round(a * 0.6) : b);
  // 11/12 MacBook二（台帳 K006「騎馬が少ない・100騎規模」）：携帯では真田の軽い騎馬（16208）まで外していたので、kaito の iPhone では本物の騎馬三十数騎しか見えなかった。
  //   真田の騎馬の塊だけは携帯でも残す（人数は n() で六割）。落ちた時の十五塊・千七百人より十分軽い
  // 11/12 MacBook二（台帳 K018「城の方から三方面から来る」）：携帯では明石（北西）・大野（北東）の塊まで外していたので、kaito の iPhone では毛利の正面だけから来ていた。
  //   二つは残し、人数は六割のさらに四分の三（落ちた時の十五塊・千七百人より十分軽い）
  const MINOR = new Set([16204, 16212, 16213, 16214, 16215]);   // 脇・伊達・酒井・浅野・黒田（真田の騎馬・明石・大野は残す）
  const LIGHTER = new Set([16216, 16217]);
  const mk = (o) => { if (W.def && W.def.noFake) { (st0.pending ||= []).push(o); return null; } if (isTouch && MINOR.has(o.seed)) return null; if (isTouch && LIGHTER.has(o.seed)) o = { ...o, count: Math.round(o.count * 0.75) }; try { return W.addDistantArmy({ host: false, kind: 'mixed', ...o, flagTex: flagTexture(o.flag) }); } catch (e) { return null; } };
  const { FRONT, NIJIN, HON, SHITENNO, CHAUSU, ECHI } = P;
  const apx = (typeof window !== 'undefined' && window.__apx) || {};   // 自動計測専用：x_noband=新しい帯四本を作らない・x_nojin=陣立ての軽い大軍を全部作らない（実機の重さの切り分け）
  if (apx.nojin) return null;
  const M = {
    // 味方の陣（南ほど本陣に近い）。北（-z）を向く
    sen: mk({ x: FRONT.x + 2, z: FRONT.z + 14, w: 40, d: 8, count: n(110, 180), facing: S, armor: 0x2c2824, flag: 'honda', seed: 16201 }),
    ni: mk({ x: NIJIN.x, z: NIJIN.z + 12, w: 46, d: 10, count: n(130, 220), facing: S, armor: 0x2e2a26, flag: 'sakakibara', seed: 16202 }),
    hata: mk({ x: HON.x + 2, z: HON.z + 32, w: 54, d: 14, count: n(170, 300), facing: S, armor: 0x2e2a26, flag: 'tokugawa', seed: 16203 }),
    waki: mk({ x: HON.x + 30, z: HON.z - 6, w: 18, d: 22, count: n(60, 110), facing: S, armor: 0x2e2a26, flag: 'tokugawa', seed: 16204 }),
    echi: mk({ x: ECHI.x, z: ECHI.z + 14, w: 40, d: 10, count: n(130, 220), facing: S, armor: 0x2e2a26, flag: 'tokugawa', seed: 16205 }),
    // 敵の陣。南（+z）を向く
    mori: mk({ x: SHITENNO.x + 26, z: SHITENNO.z + 4, w: 34, d: 12, count: n(170, 300), facing: 0, team: 1, armor: 0x4a3a2c, flag: 'toyotomi', flagRate: 0.3, seed: 16206 }),
    sana: mk({ x: CHAUSU.x + 2, z: CHAUSU.z - 12, w: 28, d: 10, count: n(100, 170), facing: 0.6, team: 1, armor: 0x8e1f16, flag: 'sanada', seed: 16207 }),
    // 左右の翼と後詰（docs/generals_toyo_toku_1108.md の15番。名のある大名の備を旗で見せる。戦わない）
    todo: mk({ x: FRONT.x + 52, z: FRONT.z + 40, w: 36, d: 12, count: n(110, 200), facing: S, armor: 0x2e2a26, flag: 'todo', seed: 16211 }),   // 右翼：藤堂高虎
    date: mk({ x: FRONT.x + 70, z: HON.z - 10, w: 40, d: 14, count: n(130, 240), facing: S, armor: 0x1a1a22, flag: 'date', seed: 16212 }),   // 右翼の奥：伊達政宗・片倉重長
    sakai: mk({ x: -128, z: HON.z + 4, w: 30, d: 12, count: n(90, 160), facing: S + 0.5, armor: 0x2e2a26, flag: 'tokugawa', seed: 16213 }),   // 左翼：酒井家次・本多忠政
    asano: mk({ x: HON.x + 34, z: HON.z + 70, w: 36, d: 12, count: n(100, 180), facing: S, armor: 0x2e2a26, flag: 'asano', seed: 16214 }),   // 後詰：浅野長晟（寝返りの噂の的）
    kuroda: mk({ x: HON.x - 40, z: HON.z + 66, w: 34, d: 12, count: n(90, 160), facing: S, armor: 0x2e2a26, flag: 'kuroda', seed: 16215 }),   // 後詰：黒田長政・細川忠興
    akashi: mk({ x: SHITENNO.x - 48, z: SHITENNO.z - 26, w: 32, d: 12, count: n(110, 200), facing: 0, team: 1, armor: 0x352c25, flag: 'toyotomi', seed: 16216 }),   // 明石全登（船場口から）
    ono: mk({ x: SHITENNO.x + 40, z: SHITENNO.z - 70, w: 40, d: 14, count: n(120, 220), facing: 0, team: 1, armor: 0x352c25, flag: 'toyotomi', seed: 16217 }),   // 大野治長・城の前の備
    // 11/12 司令塔：本人の目の前（25m の外）に陣が帯のように何重にも見えるよう、先手・二陣・毛利の後ろへ軽い帯をもう三本ずつ重ねる（K001）
    senB: apx.noband ? null : mk({ x: FRONT.x - 6, z: FRONT.z + 32, w: 56, d: 7, count: isTouch ? 56 : 420, facing: S, armor: 0x2c2824, flag: 'honda', seed: 16221 }),
    senC: apx.noband || isTouch ? null : mk({ x: FRONT.x + 8, z: FRONT.z + 48, w: 60, d: 7, count: isTouch ? 56 : 420, facing: S, armor: 0x2e2a26, flag: 'sakakibara', seed: 16222 }),
    moriB: apx.noband ? null : mk({ x: SHITENNO.x + 10, z: SHITENNO.z - 6, w: 58, d: 7, count: isTouch ? 56 : 420, facing: 0, team: 1, armor: 0x4a3a2c, flag: 'toyotomi', flagRate: 0.3, seed: 16223 }),
    moriC: apx.noband || isTouch ? null : mk({ x: SHITENNO.x - 6, z: SHITENNO.z - 24, w: 60, d: 7, count: isTouch ? 56 : 420, facing: 0, team: 1, armor: 0x352c25, flag: 'toyotomi', seed: 16224 }),
    moriD: apx.noband || isTouch ? null : mk({ x: SHITENNO.x + 4, z: SHITENNO.z - 40, w: 60, d: 7, count: n(100, 400), facing: 0, team: 1, armor: 0x4a3a2c, flag: 'toyotomi', flagRate: 0.3, seed: 16225 }),
    sanaK: mk({ x: CHAUSU.x + 12, z: CHAUSU.z - 16, w: 26, d: 12, count: isTouch ? 80 : 140, facing: 0.6, team: 1, armor: 0x8e1f16, flag: 'sanada', kind: 'cavalry', seed: 16208 }),
    // 11/13 クラウドり（K006）：騎馬の二の波。一の波の少し後ろから別の幅で並び、本陣へ一気に押し寄せる（百騎規模を二つ重ねる）
    sanaK2: mk({ x: CHAUSU.x - 10, z: CHAUSU.z - 8, w: 30, d: 12, count: isTouch ? 70 : 120, facing: 0.5, team: 1, armor: 0x8e1f16, flag: 'sanada', kind: 'cavalry', seed: 16226 }),
  };
  // 岡山口の二重の列（kaito 11/13 の布陣図・K287）：一の列＝前田利常・本多康紀・片桐且元／二の列＝井伊直孝・細川忠興・藤堂高虎／後ろ＝徳川秀忠。noFake の戦は 本物の備で置く（人数は元の 12%・最大 36）
  if (W.def && W.def.noFake) for (const o of [
    { x: 46, z: 40, w: 56, d: 8, count: 500, facing: S, flag: 'tokugawa', seed: 16231, team: 0 },
    { x: 50, z: 66, w: 60, d: 8, count: 500, facing: S, flag: 'tokugawa', seed: 16232, team: 0 },
    { x: 40, z: 118, w: 36, d: 10, count: 300, facing: S, flag: 'tokugawa', seed: 16233, team: 0 }]) (st0.pending ||= []).push(o);
  const st = { M, step: -1, t0: 0, cl: null, rep: {}, sd: 999, flagT: 0, pending: st0.pending || null };
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

// 本人の前（敵の側）dist m・後ろは負：本人から 30〜80m の所へ軽い大軍の帯を置いて前へ動かす（台帳 K001 司令塔 11/13「三重の塊で押し寄せる」）
function aheadOf(rt, dist, lateral = 0) {
  return () => {
    const me = rt.player?.u; if (!me) return null;
    const F = rt.flags;
    // 一番近い敵の備の真ん中へ向ける（任務の行き先ごとに：西口・本陣前・追撃でも本人の前に敵の備を置く）。一秒ごとに選び直す
    if (!(F._aheadT > rt.t)) {
      F._aheadT = rt.t + 1; let best = null, bd = 1e9;
      for (const g of rt.army.groups || []) {
        if (g.team === me.team || !alive(g) || g.hidden || g.routed) continue;
        const c = centerOf(g)(); const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z);
        if (d < bd) { bd = d; best = c; }
      }
      F._aheadC = best ? { x: best.x, z: best.z } : { x: me.pos.x, z: me.pos.z - 60 };
    }
    const c = F._aheadC;
    let dx = c.x - me.pos.x, dz = c.z - me.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
    const k = dist >= 0 ? Math.min(dist, Math.max(36, d - 6)) : dist;
    return { x: me.pos.x + dx * k - dz * lateral, z: me.pos.z + dz * k + dx * lateral, facing: dist >= 0 ? 0 : S };   // 向きは東西の横長のまま（斜めに回すと帯が縦の列に見えた）
  };
}

export function tick(rt, P) {
  const F = rt.flags, st = F._jin;
  if (!st || rt.over) return;
  const M = st.M, step = F.step || 0;
  // noFake：置き場の本物の備は、その戦の兵の装束（rt._tpl）が覚えられてから（最初の数コマ後）作る（install は兵を作る前に呼ばれる）
  if (st.pending && rt._tpl && rt._tpl.E && rt._tpl.A) {
    const list = st.pending; st.pending = null; (st.real = []);
    // 11/14 クラウドか（K287）：realFromLight は備の幅が30m止まりなので、岡山口の一の列・二の列は左右二つの備に分けて横に長い列に見せる（人数の合計は同じ）
    const split = [];
    for (const o of list) { if (o.seed === 16231 || o.seed === 16232) { const h = o.w / 4; for (const s of [-1, 1]) split.push({ ...o, x: o.x + s * h, w: o.w / 2 / 0.6, count: Math.round(o.count / 2), half: true }); } else split.push(o); }
    for (const o of split) { try { const me0 = rt.player?.u?.pos; if (me0 && Math.hypot(o.x - me0.x, o.z - me0.z) > (isTouch ? 140 : 190)) continue; const g = realFromLight(rt, o, enemyGroup, allyGroup, isTouch ? 0.04 : 0.12, isTouch ? 14 : (o.half ? 30 : 36), SEED_NAME[o.seed] || '遠くの備'); if (g) st.real.push(g); } catch (e) { window.__rflErr = String(e && e.stack || e).slice(0, 400); } }
  }
  crisis(rt, st, P);
  // 一度付けたら最後まで本人の前後に付いて動く（150秒・300秒でも目の前に三重の備。台帳 K001）
  if (step >= 1 && !st.fol) {
    st.fol = true;
    M.moriB?.follow(aheadOf(rt, 40, -6), { gap: 0, speed: 7 });
    M.moriC?.follow(aheadOf(rt, 62, 8), { gap: 0, speed: 7 });
    M.moriD?.follow(aheadOf(rt, 84, -10), { gap: 0, speed: 7 });
    M.senB?.follow(aheadOf(rt, -26, 4), { gap: 0, speed: 7 });
    M.senC?.follow(aheadOf(rt, -50, -6), { gap: 0, speed: 7 });
  }
  // 端末が熱い（段2〜）間は、新しい軽い帯を前の一本（B）だけにする（司令塔 11/13：fps の上限を保つため）
  { const hot = (window.__heatBackgroundLevel || 0) >= 2 || (window.__iosHeat || 0) >= 2;
    if (hot !== !!st.hotBands) { st.hotBands = hot; for (const k of ['moriC', 'moriD', 'senC']) { const g = M[k]; if (g) g.visible = !hot; } } }
  if (step === st.step) return;
  st.step = step; st.t0 = rt.t;
  const later = (s, fn) => rt.after(s, () => { if (!rt.over && F.step === step) { try { fn(); } catch (e) { /* 軽い大軍が無くても戦は進む */ } } });
  try {
    if (step === 1) {
      // 毛利の手の後ろの大勢が、勝永の先手に付いてまとまって寄せる（中央突破の塊）
      M.mori?.follow(toward(rt, F.mori, 12), { gap: 12, speed: 3.2 });
      // 先手の東の脇でも本多の手と毛利の手が組み合い、押される（先手が押し込まれていく様子）
      st.cl = clash(rt, { x: P.FRONT.x + 36, z: P.FRONT.z - 8, facing: S, w: 30, gap0: 14, seed: 16209, host: false, noRout: true, noWake: true, killRate: 0.004, maxDrift: 8, corpses: 8, nearHide: 0,
        A: { flag: 'honda', armor: 0x2c2824, count: isTouch ? 40 : 120, flagRate: 0.2 }, B: { flag: 'toyotomi', armor: 0x352c25, count: isTouch ? 44 : 140, flagRate: 0.25, guns: true } });
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
      M.sanaK2?.follow(toward(rt, F.sanada, 6), { gap: 14, speed: 5.5 });
      later(30, () => M.ni?.retreat(6, 6));   // 二陣が押されて下がる
    } else if (step === 3) {
      // 本陣が乱れる：二陣は崩れ、旗本は逃げ散る（三里も逃げた者がいた。史実）
      M.ni?.rout({ hideAfter: 40 });
      M.hata?.retreat(24, 14);
      M.sana?.follow(toward(rt, F.sanada2, 14), { gap: 14, speed: 3.6 });
      M.sanaK?.follow(toward(rt, F.sanada2, 6), { gap: 6, speed: 5.5 });
      M.sanaK2?.follow(toward(rt, F.sanada2, 6), { gap: 14, speed: 5.5 });
      // 新手：水野勝成の手が南東から駆け付け、崩れた二陣の所を埋める（戦場を空にしない）
      later(30, () => {
        const W = rt.world;
        M.mizu = W.addDistantArmy({ host: false, kind: 'mixed', x: P.HON.x + 60, z: P.HON.z + 50, w: 40, d: 10, count: isTouch ? 60 : 200, facing: S, armor: 0x2e2a26, flag: 'tokugawa', flagTex: flagTexture('tokugawa'), seed: 16210 });
        M.mizu?.moveTo(P.NIJIN.x + 6, P.NIJIN.z + 16, 40);
        rt.say('使番', '水野日向守の手が南から駆け付けた！　二陣の崩れを埋めるぞ', 3.2);
      });
      later(45, () => M.hata?.reform());   // 逃げた旗本が戻って本陣の後ろを固め直す
    } else if (step === 4) {
      // 越前勢の後ろの大勢が真田の横へ。真田の大勢は四十秒で崩れる
      M.echi?.moveTo(P.HONF.x - 34, P.HONF.z - 30, 40);
      M.sana?.follow(toward(rt, F.nobu, 12), { gap: 12, speed: 3.4 });
      M.sanaK?.follow(toward(rt, F.nobu, 6), { gap: 6, speed: 5 });
      M.sanaK2?.follow(toward(rt, F.nobu, 6), { gap: 14, speed: 5 });
      later(40, () => { M.sana?.rout({ hideAfter: 40 }); M.sanaK?.rout({ hideAfter: 30 }); M.sanaK2?.rout({ hideAfter: 30 }); });
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
      if (st.sdG !== g) { st.sdG = g; st.sd = 999; }   // 知らせ直すのは隊が替わった時だけ（段の行き来で毎コマ「二百四十！」が五十回出た・11/10 関所）
      const c = centerOf(g)(), d = Math.hypot(c.x - I.pos.x, c.z - I.pos.z);
      const marks = [[120, '真田隊、本陣まで二百四十！'], [95, '真田隊、百九十！　止まりませぬ！'], [70, '真田隊、百四十！　中央を抜けました！'], [45, '真田隊、九十！　本陣へ来るぞ！'], [30, '真田隊、六十！　上様、ここは危のうございます！']];
      for (const [r, text] of marks) if (d < r && st.sd > r) { st.sd = r; rt.say('使番', text, 3); if (r <= 45) M.waki?.retreat(10, 6); break; }
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
