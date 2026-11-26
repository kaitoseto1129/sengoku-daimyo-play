// 読み込みや舞台の作り直しをせず、同じ兵・隊・任務・時限の参照を保って戻す。
// 形・材質・素材・音・画面は写さない。十二秒おきの写しを一つだけ持つ（小判のコンティニューの戻り先・K648。開戦の写しは最初の一つ）。
import { setAssist } from './battle_assist.js';
import { fiveGoals } from './goals5.js';
import { musicNow, playMusic } from './audio.js';
import { Unit } from './units_group.js';
import { CONTINUE_KOBAN, canContinue, payContinue, refundContinue } from './continue_koban.js';
import { addEn } from './i18n.js';
// K648：続けるのは小判のコンティニューだけ（無料の『直前から再開』『戦の最初から』『援護を強くする』『この局面を易しくする』は無くした）
addEn([[/^コンティニュー　小判(\d+)枚$/, (m) => `Continue (${m[1]} koban)`], [/^小判(\d+)枚を使って、倒れた所から続けます。$/, (m) => `Spend ${m[1]} koban to continue from where you fell.`],
  [/^小判(\d+)枚で続ける$/, (m) => `Pay ${m[1]} koban and continue`], ['使った小判は戻りません。', 'Spent koban cannot be returned.'], ['やめる', 'Cancel']]);
let payTag = 0;
// 負けと再開（docs/rank_interlude_retry_spec_1108.md 3・kaito 11/8「14分目に死んで最初から、は絶対に避ける」）
// - 区切り（チェックポイント）：段（任務の①②③…）が変わった所・目標を果たした所で写す。加えて、導入の後（2〜4分）・戦況の変わり目（6〜9分）・
//   最終局面の前（10〜13分）の三つの窓のうちに区切りが無ければ、窓の終わりに一つ写す。写しは戦の全部（体力・持ち物・味方と武将の生死・
//   敵の隊・任務・壊れ・火・時刻・空模様・隊列）を持つ。
// - 倒れたら 3〜5 秒は戦場が続き（音は遠のく）、それから「直前から再開」（既定）／「戦の最初から」。
// - 再開では長い会話・済んだ場面を流さず、2 秒だけ「前回まで／現在」を出す。体力が極端に低ければ四割五分まで戻す。
// - 二度目の負けで手がかり一行、三度目で「援護を強くする」「このまま戦う」、四度目から「この局面を易しくする」も（battle_assist.js。その戦だけ）
const LOSSES = new WeakMap();   // その戦で負けた数（写しに入らない）
const memories = new WeakMap();
export const RETRY_STAT = { n: 0, records: 0, fresh: 0 };   // 確かめ用：最後の写しの記録の数と、新しく作った記録の数
const HUMAN_KEYS = new Set(['human', '_humanBuild', '_humanBuildLook', '_hq', 'humanPending']);
// 11/25 K643 Sanae：replay3d（勝った後の 3D の見返しの記録の輪・replay_3d.js）は写さない。輪の nodes・par（1300 の配列×60）を
//   十二秒ごとに鍵と値の組で写し、一回の写しの記録の四割（41万の枠と添え字の字 15万）がこれだった。WebKit（iPhone）では
//   JS の山が開戦4分で約125MB 多かった（wk_soak.mjs・WebKitGTK）。中の姿の数（Float32Array）は元から写していないので、戻しても輪は今のまま使う
// 11/26 K675 Sanae（生きている量）：兵の後から作る作り置き（足の地形・群れの間・見張り・向きの点など。`u._x || (u._x = {…})` で
//   無ければその場で作る物）は写さない。兵一人に十あまり・桶狭間5分の写しの記録 6万のうち約1万がこれだった。
//   写しに無い鍵は戻す時に消える（下の restore）ので、戻した次の更新で今まで通り作り直される
const UNIT_SCRATCH = new Set(['_moveTerrain', '_terrainFx', '_mill', '_alv', '_farGap', '_farPinChk', '_nearPinChk', '_farStep', '_farSepP', '_farSepO', '_facePoint', '_pressWant']);
const ROOT_KEEP = new Set(['game', 'hud', 'camera', 'def', 'environmentSound', 'warVoices', 'warSpeech', 'freezer', 'frustum', 'projView', 'replay3d']);

// 写しは数百ミリ秒かかるので、一ミリ秒ずつ何コマかに分けて取る。
// 分けて取る間に動いた分は、物ごとに取った時のまま残る（戻す先は八秒前なので、数コマのずれは見えない）
// prev：前の写し（同じ物の値が変わっていなければ、前の写しの記録をそのまま使う＝新しく作らない。
//   写しは 12 秒ごとに数千の物・数万の鍵を作り直していて、古い写しを捨てる時の GC が重いコマになっていた。10/20 カクつきの係）
export function startRemember(rt, extra, prev = null) {
  // 前の写しは、写す間だけ見る。restore の閉包は startRemember の変数を全部つかむので、終わったら手放す
  //   （前の写し→その前の写し…と戦の始めから全部の写しと seen がつながり、捨てた束や人が残っていた。260 秒で WebContent 2GB。10/20）
  let prevMap = prev && prev.byObject || null; prev = null;
  const prevOf = (o) => prevMap ? prevMap.get(o) : undefined;
  const blocked = new Set([...ROOT_KEEP].map((k) => rt[k]));
  blocked.add(rt.world?.def);
  blocked.add(rt.army?.batch);
  // 11/15 iMac四十 K098 稲葉山「やり直しで弓が直っていない」：一人だけの形の束（army.solo の pools）は描くための入れ物で、
  //   写すと、写した後に返した（dispose した）束が「直前から再開」で Map に戻り、次のコマにもう一度 dispose して毎コマ落ち、
  //   戦が一時停止へ落ちて弓も引き切れなかった（iPhone の真似で 337 回）。batch と同じく写さず、今のまま使う
  if (rt.army?.solo) blocked.add(rt.army.solo);
  // 力の計算の糸へ渡した ArrayBuffer は手放し済み（detached）。写して戻すと postMessage が落ちて戦が止まる（kaito 10/23 稲生 13・25）
  if (rt.army?._bw) blocked.add(rt.army._bw);
  // 舞台の動かない表（草木の間引きの升・近い草の置き場・矢が刺さる木の箱・木の点）は数千の物。戻す物ではないので写さない
  for (const k of ['cullList', 'nearOff', 'missileWood', 'treePoints']) if (rt.world?.[k]) blocked.add(rt.world[k]);
  const keep = (o, k) => (o === rt && ROOT_KEEP.has(k)) || (o === rt.army && (k === 'batch' || k === 'solo'));
  // seen・stack は写し終わりに手放す（restore の閉包がこの場の変数を全部つかむので、空にしただけの入れ物も写しの数だけ残っていた。11/25 K643）
  let seen = new Set(), stack = [extra, rt], done = null;
  const records = [], time = rt.t;
  let byObject = new Map();
  // 参照の索引も一ミリ秒の枠で作る。最後に全記録を反転・再走査する山を残さない。
  let fresh = 0;
  function record(r) { records.push(r); byObject.set(r.o, r); if (!prevMap || prevMap.get(r.o) !== r) fresh++; }
  function visit(o) { if (o) stack.push(o); }
  function one(o) {
    if (!o || typeof o !== 'object' || seen.has(o) || blocked.has(o) ||
        ArrayBuffer.isView(o) || o instanceof ArrayBuffer || o.isMaterial || o.isTexture ||
        o.isBufferGeometry || o.isBufferAttribute || o.nodeType || o instanceof WeakMap || o instanceof WeakSet) return;
    seen.add(o);
    if (o.isObject3D) {
      if (o.userData?.hum || o.name === 'unitBatch' || o.isInstancedMesh || o.isBatchedMesh) return;
      // 人の骨・部品は h.bones などから直接参照されるので、その経路でも写さない。
      for (let parent = o.parent; parent; parent = parent.parent) if (parent.userData?.hum) return;
      // 模型の内部を歩かない。兵の姿勢は次の更新で描き直す。
      const children = o.children.some((c) => c.name === 'unitBatch')
        ? o.children.filter((c) => c.name !== 'unitBatch') : o.children;
      // 馬の生き死に（userData.horse の dead・deadT）は馬の中なので写しに入らず、戻すと「生きて乗っている騎馬の馬が倒れたまま」になった
      //   （K313 kaito 11/15「直前からやり直すが毎回バグる」：天王寺で戻した後、乗り手は生きて馬だけ死んだ形。11/15 クラウドか）
      const H = o.userData?.horse;
      if (H && typeof H === 'object') {
        const hr = prevOf(H);
        if (hr && hr.kind === 'horse' && hr.dead === !!H.dead && (!H.dead || hr.deadT === H.deadT)) record(hr);
        else record({ o: H, kind: 'horse', dead: !!H.dead, deadT: H.deadT || 0 });
      }
      const r = prevOf(o);
      // 11/15 K313（全戦）：向きは四元数でなく角度（rotation の x・y・z）で覚えて戻す。四元数から戻すと角度が（π, 180°−向き, π）の
      //   書き方に化け、兵の動きが毎コマ y（向き）だけを書くので、戻した兵が逆を向いたり裏返ったりしていた（設楽原：戻した直後に71人）
      const e = o.rotation;
      if (r && r.kind === 'shape' && r.visible === o.visible && r.pos.equals(o.position) && r.rx === e.x && r.ry === e.y && r.rz === e.z && r.ro === e.order && r.scale.equals(o.scale) && sameList(r.children, children)) { record(r); return; }
      record({ o, kind: 'shape', pos: o.position.clone(), rx: e.x, ry: e.y, rz: e.z, ro: e.order,
        scale: o.scale.clone(), visible: o.visible, children });
      return;
    }
    if (o instanceof Map || o instanceof Set) {
      const r = prevOf(o);
      let entries;
      if (r && r.kind === (o instanceof Map ? 'map' : 'set') && sameEntries(r.entries, o)) { entries = r.entries; record(r); }
      else { entries = [...o]; record({ o, kind: o instanceof Map ? 'map' : 'set', entries }); }
      for (const e of entries) { if (o instanceof Map) { visit(e[0]); visit(e[1]); } else visit(e); }
      return;
    }
    // 骨入りの人（humans.js の h）は、自分の鍵の値だけ覚えて中へは入らない。
    //   中（動きの mixer・骨の表・指の配列など）は一人 800 個の物・5000 の鍵があり、三つの写しで 30 万個の Map になって
    //   iPhone の WebContent を 2GB まで押し上げていた（10/19）。姿勢と動きは戻した次の更新で u の状態から描き直される
    const keys = Object.keys(o), r = prevOf(o);
    // 兵の骨入りの人（u.human）と作りかけ（_humanBuild）は写さず、戻す時も今の物をそのまま使う。
    //   写すと、捨てた人（evictHidden）が三つの写しに残り続ける（森部 70 秒で生きている人 80 に対し mixer 148・骨 1 万。10/20）。
    //   姿勢と動きは戻した次の更新で u の状態から描き直される
    // 11/18 夜50-47 K210：骨の人を一度も借りなかった兵（遠い兵）は 'human' の鍵を持たず、兵と見なされずに退場した後も中まで写されていた
    //   （稲葉山 300 秒で退場兵 3190 人分・中の物 8 万個・約 20MB が三つの写しに残り、記憶が毎分 7〜11MB 伸びた）。兵の作り（Unit）でも見る
    const isUnit = o instanceof Unit || ('human' in o && 'mesh' in o && 'pos' in o);
    // 退場した兵（遠景へ戻した・片付けた骸）は二度と出ないので写さない。戻す先で生きていた兵は、その時の写しに記録がある。
    //   写すと、起こしては戻す兵が写しのたびに増え、古い兵まで抱えて記憶が伸び続けた（10/31 設楽原・三木）
    if (isUnit && o.gone && !o.alive && !o.name && !o.isCourier && !o.civ && !o.group?.isRunner) return;
    // 消えた兵（沈み終えた亡骸・退いて消えた者）は自分の鍵だけ覚えて中へは入らない。もう動かず、戻す先でも消えたまま
    //   （10/31：援軍のたびに消えた兵の中身まで三つの写しが抱え、iPhone の記憶が毎分 6〜7MB 増えて三木・設楽原が落ちた）
    const shallow = !!(o.root && o.root.userData && o.root.userData.hum === o) || (isUnit && o.gone && !o.alive);
    // 11/25 K643 Sanae：穴も名前の鍵も無い配列（写しの配列のほとんど）は、値だけを並べて持つ（vals）。鍵と値の組（kv）だと
    //   添え字の字（"0"〜"1299"）が要素ごとに一つずつ作られて写しに残り、WebKit（iPhone）では写し一つが JSC の山で約 32MB になっていた。
    //   戻す時は長さと値を同じに戻すので、今までと同じ物に戻る。穴・名前の鍵・延ばせない配列は今まで通り kv
    if (Array.isArray(o) && Object.isExtensible(o) && keys.length === o.length && (o.length === 0 || keys[o.length - 1] === String(o.length - 1))) {
      const n = o.length;
      if (r && r.vals && r.vals.length === n) {
        let same = true;
        const vals = r.vals;
        for (let i = 0; i < n; i++) if (vals[i] !== o[i]) { same = false; break; }
        if (same) {
          record(r);
          for (let i = 0; i < n; i++) { const v = vals[i]; if (v && typeof v === 'object') stack.push(v); }
          return;
        }
      }
      const vals = o.slice();
      for (let i = 0; i < n; i++) { const v = vals[i]; if (v && typeof v === 'object') stack.push(v); }
      record({ o, kind: 'array', vals, length: n });
      return;
    }
    // 前の写しと同じ鍵・同じ値なら、前の記録をそのまま使う（中の物はこれまでどおりたどる）
    // 鍵と値は一つの平らな配列 [鍵, 値, 鍵, 値…] に持つ（10/31 c_leak2：記録ごとの Map が三つの写しで数万個になり、
    //   記憶の多くを占めていた）。鍵の順は Object.keys の順なので、前の記録とは順に見比べる
    if (r && r.kv && r.length === o.length) {
      let n = 0, same = true;
      const kv = r.kv;
      for (const k of keys) {
        if (keep(o, k) || (isUnit && (HUMAN_KEYS.has(k) || UNIT_SCRATCH.has(k)))) continue;
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d?.writable) continue;
        if (kv[n] !== k || kv[n + 1] !== o[k]) { same = false; break; }
        n += 2;
      }
      if (same && n === kv.length) {
        record(r);
        if (!shallow) for (let i = 1; i < kv.length; i += 2) { const v = kv[i]; if (v && typeof v === 'object') stack.push(v); }
        return;
      }
    }
    // 入れ物はちょうどの大きさで先に取る（push で伸ばすと、余りの枠が写しの数だけ残る。11/25 K643）
    const kv = keys.length < 4096 ? new Array(keys.length * 2) : [];
    let j = 0;
    for (const k of keys) {
      if (keep(o, k) || (isUnit && (HUMAN_KEYS.has(k) || UNIT_SCRATCH.has(k)))) continue;
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (!d?.writable) continue;
      const v = o[k];
      kv[j++] = k; kv[j++] = v; if (!shallow && v && typeof v === 'object') stack.push(v);
    }
    kv.length = j;
    record({ o, kind: Array.isArray(o) ? 'array' : 'object', kv, length: o.length });
  }
  // budgetMs ずつ進める。終われば写し（restore を持つ物）を返し、まだなら null
  return { step(budgetMs) {
    if (done) return done;
    const t0 = performance.now();
    let n = 0;
    while (stack.length) {
      one(stack.pop());
      if (budgetMs > 0 && (++n & 7) === 0 && performance.now() - t0 > budgetMs) return null;
    }
    return finish();
  } };
  function finish() {
  // 写し終わりに前の写し・seen・blocked を手放す（閉包が戦の始めからの写しを鎖でつかまないように）
  prevMap = null; seen = null; blocked.clear(); stack = null;
  RETRY_STAT.records = records.length; RETRY_STAT.fresh = fresh; RETRY_STAT.n++;
  // 索引は返す物だけが持つ（restore の閉包に残すと、外しても捨てられない）
  const index = byObject; byObject = null;
  return (done = { time, byObject: index, restore() {
    // 記録の順は変えず、戻す時だけ末尾からたどって従来の復元順を保つ。
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i], o = r.o;
      if (r.kind === 'shape') {
        o.position.copy(r.pos); o.rotation.set(r.rx, r.ry, r.rz, r.ro); o.scale.copy(r.scale); o.visible = r.visible;
        if (r.children !== o.children) {
          for (let i = o.children.length - 1; i >= 0; i--) if (o.children[i].name !== 'unitBatch' && !r.children.includes(o.children[i])) o.remove(o.children[i]);
          for (const child of r.children) if (child.parent !== o) o.add(child);
        }
        o.updateMatrix(); o.updateMatrixWorld(true);
      } else if (r.kind === 'horse') {
        // 死んだ馬を生きていた時へ戻す：倒れの姿勢（横倒し・沈み）と、骨入りの馬の「倒れる」一度きりの動きも消す
        if (o.dead && !r.dead) {
          o.pose?.rotation.set(0, 0, 0); o.pose?.position.set(0, 0, 0);
          if (o.real && o.real.oneK === 'death') { o.real.oneK = null; o.real.oneT = 0; }
        }
        o.dead = r.dead; o.deadT = r.deadT;
      } else if (r.kind === 'map' || r.kind === 'set') {
        o.clear(); for (const e of r.entries) { if (r.kind === 'map') o.set(e[0], e[1]); else o.add(e); }
      } else if (r.vals) {
        // 値だけで持った配列：長さと値を戻し、写しの後に足された名前の鍵があれば外す（kv の時と同じ姿に戻す）
        const vals = r.vals, n = vals.length;
        o.length = n;
        for (let i = 0; i < n; i++) o[i] = vals[i];
        const ks = Object.keys(o);
        if (ks.length !== n) for (const k of ks) if (String(+k) !== k) { const d = Object.getOwnPropertyDescriptor(o, k); if (d?.writable && d.configurable) delete o[k]; }
      } else {
        // 11/18 夜50-47 K210：骨の人を一度も借りなかった兵（遠い兵）は 'human' の鍵を持たず、兵と見なされずに退場した後も中まで写されていた
    //   （稲葉山 300 秒で退場兵 3190 人分・中の物 8 万個・約 20MB が三つの写しに残り、記憶が毎分 7〜11MB 伸びた）。兵の作り（Unit）でも見る
    const isUnit = o instanceof Unit || ('human' in o && 'mesh' in o && 'pos' in o);
        const kv = r.kv;
        let had = null;
        for (const k of Object.keys(o)) {
          if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
          const d = Object.getOwnPropertyDescriptor(o, k);
          if (!(d?.writable && d.configurable)) continue;
          if (!had) { had = new Set(); for (let i = 0; i < kv.length; i += 2) had.add(kv[i]); }
          if (!had.has(k)) delete o[k];
        }
        for (let i = 0; i < kv.length; i += 2) o[kv[i]] = kv[i + 1];
        if (r.kind === 'array') o.length = r.length;
      }
    }
    // 近くの兵を探す升目は、型付き配列（写さない＝今のまま）と普通の配列（写す＝昔に戻る）の組なので、戻すとちぐはぐになり
    //   forNear が undefined の兵を渡して戦が止まる（樫井：討たれて「少し前から」で player.js:48）。戻した兵で升目を作り直す
    try { rt.army?.rebuildGrid?.(); } catch (e) { /* 次のコマの更新で作り直される */ }
    try { reseatRiders(rt.army); } catch (e) { /* 乗り直しが出来なくても戦は続ける */ }
  } });
  }
}
// 写しの形の記録の children は three の生きた配列そのもの（写しの後に足し引きしても同じ配列）なので、親子の付け替えは戻らない。
//   馬を討たれて降りた騎馬は、戻すと「乗っている」に戻るのに、馬は地に倒れたまま・乗り手の体は鞍の入れ物の外で、
//   馬の無い騎馬が宙に浮いて走った（K313 kaito 11/15「直前からやり直すが毎回バグる」・天王寺で確かめ。11/15 クラウドか）。
//   乗っている／いないの印（u.mounted・u.horse は戻っている）に合わせて、馬・鞍の入れ物・乗り手の体の親を付け直す。
//   位置と向きは形の記録で戻っているので、親だけを替える（units.js の setMounted と同じ組み）
function reseatRiders(army) {
  for (const u of army?.units || []) {
    if (!u.mesh) continue;
    // 11/17 K352 kaito（戸次川）「再開した時に馬の歩きが変」：戻した直後、馬は前の速さ（prev）から急に止まったと見なして尻を沈め（sit）、
    //   腰を落としたまま歩き出していた（やり直し無し sit 0.01 → 再開の五秒後 0.78）。戻す時に歩きの記憶を消す
    const H = u.horse?.userData?.horse;
    if (H) { H.sit = 0; H.prev = 0; }
    const parts = [u.body, u.legL, u.legR, u.hand, u.flag, u.uma];
    if (u.mounted && u.horse) {
      if (u.horse.parent === u.mesh && (!u.seat || u.seat.parent === u.mesh)) continue;
      if (u.horse.parent !== u.mesh) { u.mesh.add(u.horse); u.horse.position.set(0, 0, 0); u.horse.rotation.set(0, 0, 0); u.horse.visible = true; }
      if (!u.seat) continue;
      if (u.seat.parent !== u.mesh) u.mesh.add(u.seat);
      for (const part of parts) if (part && part.parent !== u.seat) u.seat.add(part);
      if (u.human?.root && u.human.root.parent === u.mesh) u.seat.add(u.human.root);
      u.rideFix = true;
    } else if (!u.mounted && u.seat && u.seat.parent === u.mesh) {
      // 写しの後に乗った（乗り換えた）者：鞍の入れ物から降ろし、写しの後に付いた馬を外す
      for (const c of [...u.mesh.children]) if (c.userData?.horse && c !== u.horse) u.mesh.remove(c);
      if (u.horse && u.horse.parent === u.mesh) u.mesh.remove(u.horse);
      for (const part of parts) if (part && part.parent !== u.mesh) u.mesh.add(part);
      if (u.human?.root && u.human.root.parent === u.seat) u.mesh.add(u.human.root);
      u.mesh.remove(u.seat);
      u.rideFix = false;
    }
  }
}
export function rememberBattle(rt, extra) { return startRemember(rt, extra).step(0); }
// 不具合の途中の状態を再び動かさず、完成している直前の写しへ戻す。
// 一時停止の「再開する」から使い、読み込みや新しい札は増やさない。
// 少し前（recent）が八秒未満の時の戻り先：その前の写し。iPhone で「その前」を持たない時は、区切り・開戦のうち八秒以上前で新しい方（無ければ開戦）
function olderPoint(rt, m) {
  if (m.previous) return m.previous;   // 今までどおり（パソコン・再開した直後の iPhone）
  const old = [m.goal, m.start].filter((q) => q && rt.t - q.time >= 8);
  return old.reduce((a, q) => (q.time > a.time ? q : a), old[0] || m.previous || m.start || m.recent);
}
export function recoverBattle(rt) {
  const m = memories.get(rt);
  if (!m || !m.recent) return false;
  const point = rt.t - m.recent.time >= 8 ? m.recent : olderPoint(rt, m);
  m.dialog?.close(); m.dialog?.remove(); m.dialog = null;
  m.pending = null; m.accept = null; m.accepting = false; m.downShown = false; m.job = null;
  m.input.clear?.(); point.restore();
  m.recent = point; m.start = m.previous = null; m.next = rt.t + 12;
  rt.retryOpen = false;
  rt.game.G = rt.G; rt.game.hitstop = rt.game.slowmo = 0;
  settlePlayer(rt);
  rt.hud.reset(); if (rt.choice) rt.hud.renderChoice(rt.choice);
  return true;
}
// 戻した直後の主人公を整える：引きかけ・構え・よろけを消し、持ち物（弓・槍・刀）を手に正しく持たせ、
// 体を戦える所まで戻して、数秒は倒されない（弓が引けないまま戻る不具合の元を断つ）
const RETRY_COUNT = new WeakMap();   // 戦の写しに入らない数え（戻すと消えるため）
export function settlePlayer(rt) {   // オンライン対戦の討死の引き継ぎ（online_command.js）でも使う
  const p = rt.player, u = p.u;
  if (!p || !u) return;
  u.alive = true; u.dead = false;
  // 写した時に転倒・倒れ込みの途中でも、再開後は任務を続けられる状態へ戻す。
  u.dying = null; u.downed = null;
  // 11/18 kaito K295 ⑤（番外 天王寺）：倒れた時の体の傾き（army_anim の死の倒れ・mesh の rotation x/z）が戻らず、倒れた姿のまま再開した。立たせて戻す
  u.death = null; u.fall = 0; u.deadT = 0; if (u.mesh && !u.climb) { u.mesh.rotation.x = 0; u.mesh.rotation.z = 0; if (Number.isFinite(u.pos?.y)) u.mesh.position.y = u.pos.y; }
  //   馬上で討たれた時は馬にも「死」の印（H.dead・崩れ落ちの一度きりの動き）が残り、再開しても馬が地に崩れたまま＝本人も倒れた姿だった（11/18 K295 ⑤）。馬を立たせ、馬上で戻す
  { const H = u.horse?.userData?.horse; if (H) { H.dead = false; H.deadT = 0; H.blow = 0; if (H.real && H.real.oneK === 'death') { H.real.oneK = null; H.real.oneT = 0; H.real.buckle = 0; } if (u.horse.visible === false && u.mounted) u.horse.visible = true; } }
  // 体を戻す（11/6 共通：やり直しが命 5 で始まり、すぐ倒れた）。満たして、血も止める
  // 区切りの時の体力のまま。極端に低ければ四割五分まで戻す（kaito 11/8 仕様 3）。血は止める
  u.hp = Math.max(Number.isFinite(u.hp) ? u.hp : 0, u.maxHp * 0.45); if (u.wounds) u.wounds.bleed = 0;
  p.cancelAttack?.();
  p.draw = 0; p.bowHold = 0; p.bowTrigger = p.bowPressed = false;
  p.gunTrigger = p.gunRelease = false; p.shot = null; p.aiming = false;
  p.guardOn = p.guard = u.guard = false; p.charging = false; p.lock = p.aimed = null;
  p.knockT = p.staggerT = 0; u.stagger = 0; u.atk = null; u.reload = null; u.climb = null;
  p.cd = 0; p.sta = Math.max(p.sta, 60); p.staDelay = 0;
  p.noArrowT = p.bowTiredUntil = 0;
  if (p.hasBow && !(p.bowAmmo >= 8)) p.bowAmmo = 8;
  const meshOf = (w) => ({ sword: p.swordMesh, gun: p.gunMesh, bow: p.bowMesh }[w] || p.spearMesh);
  if (!meshOf(p.weapon) || !p.weaponList().includes(p.weapon)) p.weapon = 'spear';
  const want = meshOf(p.weapon);
  for (const w of [p.spearMesh, p.swordMesh, p.gunMesh, p.bowMesh]) if (w && w !== want && w.parent === u.hand) u.hand.remove(w);
  if (want && want.parent !== u.hand) u.hand.add(want);
  u.wpn = want; u.wpnKind = p.weapon;
  // 11/8 critic60 稲葉山：戻った所が撃たれる真ん前でも、すぐ倒れない。続けて戻すほど長く守る（八秒から最大二十秒）
  const now = performance.now(), c = RETRY_COUNT.get(rt) || { n: -1, at: -Infinity };
  c.n = now - c.at < 90000 ? c.n + 1 : 0; c.at = now; RETRY_COUNT.set(rt, c);
  p.retryGraceUntil = rt.t + Math.min(20, 8 + c.n * 4);
}
function sameList(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function sameEntries(entries, o) {
  if (entries.length !== o.size) return false;
  let i = 0;
  if (o instanceof Map) { for (const [k, v] of o) { const e = entries[i++]; if (e[0] !== k || e[1] !== v) return false; } }
  else { for (const v of o) if (entries[i++] !== v) return false; }
  return true;
}

// K516前後 14（司令塔の頼み・17 の見つけ：設楽原の山場で写しが毎コマ約1ms）：重いコマ（前のコマから 22ms 超）は写す一ミリ秒を 0.4 にする。
//   写す総量は同じで、重い間だけ遅く進む（軽い間に追いつく）。再開の働きは変えない（取る写しも戻る先も同じ・取り終わりが少し遅れるだけ）
const lastTick = new WeakMap();
function sliceMs(rt) {
  const now = performance.now(), prev = lastTick.get(rt); lastTick.set(rt, now);
  return prev !== undefined && now - prev > 22 && now - prev < 400 ? 0.4 : 1.0;
}
export function retryTick(rt, input, extra, dt) {
  let m = memories.get(rt);
  if (!m) {
    // 稽古場（腕試し）は倒れるまで何人討てるかを数える場。倒れた時に「直前から再開・戦の最初から」の札を出さず、すぐ稽古の結果へ（11/17 初めての15分）
    if (rt.def.town || rt.def.dojo) return false;
    // 開戦の写しも一ミリ秒ずつ何コマかに分けて取る（比叡山で一コマ目に一度に取り、170ms 止まっていた。11/1）。取り終えるまで札は出さない
    m = { start: null, startJob: startRemember(rt, extra), recent: null, previous: null, next: rt.t + 12, dialog: null, accepting: false, input };
    memories.set(rt, m);
  }
  const slice = sliceMs(rt);
  if (m.startJob) {
    const start = m.startJob.step(1.0);
    if (!start) return false;
    m.start = m.recent = start; m.previous = null; m.startJob = null; m.next = rt.t + 12;
  }
  // 倒れた動きを同じ視点で一秒見せてから札を開く。
  if (m.pending) {
    m.pending.left -= dt;
    if (m.pending.left <= 0) {
      const pending = m.pending; m.pending = null; m.unskip?.();
      offerRetry(rt, pending.info, pending.delay);
      if (pending.toResult) m.accept?.();
    }
    return !!rt.def.pauseRetry && !!m.dialog;
  }
  // 選ぶ間に戦況を止める戦でも、札自身の期限は進める。
  if (m.dialog) {
    m.left -= dt;
    if (m.left <= 0) m.accept();
    return !!rt.def.pauseRetry && !!m.dialog;
  }
  // 11/25 K643・K648 Sanae：無料の『直前から再開・最初から・易しく』を無くした後に要るのは、小判のコンティニュー（倒れた所から続ける）の写し一つだけ。
  //   区切り（段・目標・三つの窓）の写しと開戦の写しと『その前』の写しを抱えるのをやめ、十二秒おきの写しを一つだけ持つ（新しい写しが出来たら古い物は捨てる）。
  //   WebKit（iPhone）では写し一つが約16MB・開戦と区切りとその前で三つ多く抱え、桶狭間15分の伸びの主因だった（k643_all.md）
  // 金ヶ崎の退き口（def.retryBeforeT）：「この時刻より前へ」と言う間は、その前の写しを残し、新しく写さない（もう勝てない形の後の写しで上書きしない）
  const lim = rt.def.retryBeforeT?.(rt);
  if (lim != null && m.recent && m.recent.time < lim) { if (m.job) m.job = null; return false; }
  // 深手になる前の時点を残す。直前の八秒を必ず空け、戻った瞬間の同じ一撃を避ける。
  if (m.job) {
    const done = m.job.step(slice);   // 一ミリ秒ずつ（重いコマは半分）。終わるまで前の写しを残す
    if (done) {
      // 新しい写しが出来たら古い写しは捨てる（持つのは一つだけ。K643・K648）。同じ値の記録は新しい写しが使い回すので、捨てるのは変わった物の分だけ
      if (m.recent) m.recent.byObject = null;
      m.start = m.previous = null; m.recent = done; m.next = rt.t + 12; m.job = null;
    }
  } else if (!rt.over && rt.player.u.alive && rt.player.u.hp >= rt.player.u.maxHp * 0.3 && rt.t >= m.next) {   // 1.7.1 と揃える：深手の続く戦でも写しを取り続ける
    // 写す間は、十二秒以上前の recent が倒れた時の戻り先（写し終わるまで残す）
    m.job = startRemember(rt, extra, m.recent);
  }
  return false;
}

// 区切りの札の字：済んだ目標（前回まで）と今の目標（現在）。目標5つ（goals5.js）があればそれ、無ければ勝ちの一行
function cpLabel(rt) {
  let before = '', now = '';
  try {
    const F = fiveGoals(rt);   // 今のコマの済み・まだを見直してから読む（段が変わったコマでも、済んだ段が「前回まで」に入る）
    for (const r of F?.rows || []) {
      if (!r.text || r.kind === 'kills' || r.kind === 'hurt') continue;
      if (r.done) before = r.text; else if (!now && !r.fail) now = r.text;
    }
    if (!now) now = rt.victoryText?.() || '';
  } catch (e) { /* 字が無ければ出さない */ }
  return { before, now };
}
// 再開の時に 2 秒だけ出す札（読めなくても遊べる。押す所は無い）
function showResumeCard(rt, label) {
  if (!label || !(label.before || label.now)) return;
  document.getElementById('resume-card')?.remove();
  const el = document.createElement('div');
  el.id = 'resume-card'; el.setAttribute('role', 'status');
  el.style.cssText = 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:22;pointer-events:none;background:rgba(20,18,15,.88);color:#ece4d2;border:1px solid #c2a25a;border-radius:8px;padding:10px 18px;font-size:16px;line-height:1.6;max-width:calc(100vw - 32px);text-align:center';
  const row = (k, v) => { const p = document.createElement('div'); const b = document.createElement('span'); b.style.color = '#c2a25a'; b.textContent = k + '　'; p.append(b, v); return p; };
  if (label.before) el.append(row('前回まで', label.before));
  if (label.now) el.append(row('現在', label.now));
  document.body.appendChild(el);
  const off = () => el.remove();
  rt.cleanupTasks?.add(off);
  setTimeout(off, 2000);
}
// 二度目の負けから添える手がかりの一行。戦が retryHint を書いていればそれ、無ければ何にやられたかから
function retryHint(rt, info) {
  const own = rt.def.retryHint?.(rt, info);
  if (own) return own;
  const hit = rt.player.lastHit;
  if (hit && rt.t - (hit.t ?? -99) < 20) {
    if (hit.ranged || hit.kind === 'arrow' || hit.kind === 'gun') return '矢と鉄砲の前に立ち止まらず、横から回ろう';
    if (hit.back || hit.side) return '囲まれる前に、味方の列へ戻ろう';
    if (hit.kind === 'fire') return '火の手を避けて、別の道から回ろう';
  }
  return info.down ? '一人で前に出ず、味方と並んで戦おう' : '行き先の印から離れずに戦おう';
}

// 詳しい成績は結果へ回し、戦場では起きた事を一行で伝える。
function retryReason(rt, info) {
  if (info.down) {
    const hit = rt.player.lastHit;
    return hit?.kind === 'fire' ? '火で大きな傷を負った' : hit?.kind === 'fall' ? '高い所から落ちた' :
      hit?.ranged ? '矢や鉄砲で傷を負った' : '傷が重なり、戦えなくなった';
  }
  const reason = info.failureReason || rt.downReason || rt.loseReason();
  const battleReason = rt.def.retryReason?.(rt, info);
  if (battleReason) return battleReason;
  if (/守り.*通|本陣.*(押|破|落|入)/.test(reason)) return '本陣に 敵が入った';
  if (/長引|時間|間に合/.test(reason)) return '敵を止めきれなかった';
  const first = String(reason || '').split(/[。！？]/)[0];
  return first && first.length <= 22 ? first : '味方が押され、守りきれなかった';
}

// 負けた理由の下に、次にする事を一行で添える（やり直す前に読める短さ）。
function retryText(rt, info) {
  const reason = retryReason(rt, info), hit = rt.player.lastHit;
  // 次にする事の案内の字は既定で出さない（五1 説明の字・九7 ひらがな。11/6 共通の係で全戦）。戦が retryAdvice を書いた時だけ添える
  void hit;
  const next = rt.def.retryAdvice?.(rt, info) || '';
  return next ? `${reason}\n${next}` : reason;
}

export function offerRetry(rt, info, delay) {
  const m = memories.get(rt);
  if (!m || m.accepting || !m.recent) return false;
  if (m.dialog || m.pending) {
    // 攻め止めの札を読んでいる間に倒れた時も、実際の傷と理由を結果へ渡す。
    if (info.down) {
      if (m.pending) { m.pending.info = info; m.pending.delay = delay; }
      else {
        m.info = info; m.delay = delay;
        m.dialog.querySelector('h2').textContent = info.dead ? '討死' : '負傷';
        m.dialog.querySelector('[data-reason]').textContent = info.down ? '' : retryText(rt, info);
        m.dialog.querySelector('[data-reason]').hidden = !!info.down;
      }
    }
    return true;
  }
  if (!info.down && rt.tracker.main !== false) return false;
  // K648：オンライン対戦（rt.flags.match）は小判で続けると勝ち負けを買える形になるので、コンティニューの札を出さず、試合の結果へ
  if (rt.flags?.match) return false;
  // 勝ちが決まった後（締めの場面・結果待ち）の傷では、やり直しの札を出さない。初めの戦の札は選ぶまで閉じず、勝った戦が終わらなかった（11/8 真田丸・関ヶ原）
  if (rt.tracker.main === true && (rt.over || rt._closing || rt.flags.ending)) return false;
  if (info.down && !m.downShown) {
    m.downShown = true; m.pending = { info, delay, left: rt.army?.lethal ? 4.5 : rt.index === 0 ? 3 : 4 }; rt.retryOpen = true;   // 倒れてから 3〜5 秒は戦場が続く（音は playerDown が遠のかせる）
    // 11/9 kaito（全戦）：続く数秒は何も押さない時だけ。キー・画面を押したらすぐ札を出す（Q はそのまま結果へ）
    const skip = (e) => {
      if (!m.pending || e.repeat) return;
      if (e.type === 'keydown' && (e.ctrlKey || e.metaKey || e.altKey)) return;
      m.pending.left = 0; m.pending.toResult = e.type === 'keydown' && e.key?.toLowerCase() === 'q';
      unskip();
    };
    const unskip = () => { document.removeEventListener('keydown', skip, true); document.removeEventListener('pointerdown', skip, true); m.unskip = null; };
    m.unskip?.(); m.unskip = unskip;
    setTimeout(() => { if (m.pending && m.unskip === unskip) { document.addEventListener('keydown', skip, true); document.addEventListener('pointerdown', skip, true); } }, 300);   // 倒れた瞬間の押しっぱなしは数えない
    return true;
  }
  const first = rt.index === 0 && !rt.G.lord && !rt.def.dojo;
  const d = document.createElement('dialog');
  d.className = 'battle-retry';
  d.style.cssText = 'position:fixed;margin:0;z-index:50;background:#14120f;color:#ece4d2;border:2px solid #c2a25a;border-radius:8px;box-sizing:border-box;width:min(304px,calc(100vw - 24px));padding:12px;max-height:calc(100dvh - 24px)';
  d.setAttribute('aria-labelledby', 'battle-retry-title');
  const lost = (LOSSES.get(rt) || 0) + 1; LOSSES.set(rt, lost);
  d.style.overflowY = 'auto';
  const B = (k, t, main) => `<button class="btn${main ? ' primary' : ''}" ${k} style="min-height:44px">${t}</button>`;
  d.innerHTML = '<h2 id="battle-retry-title" style="font-size:20px;margin:0"></h2><p data-reason style="white-space:pre-line;font-size:max(20px, calc(20px * var(--text-scale, 1)));line-height:1.5;margin:8px 0"></p><p data-hint hidden style="font-size:16px;line-height:1.5;margin:0 0 8px;color:#f3e2b4"></p><div class="retry-actions" style="display:flex;flex-direction:column;gap:8px">' +
    // K648：小判が足りない時は押せない印（錠の形・薄い色）にして、結果（その先のホーム・城下）へだけ進める
    (canContinue() ? B('data-near', `コンティニュー　小判${CONTINUE_KOBAN}枚`, true) : `<button class="btn" data-near disabled aria-disabled="true" style="min-height:44px;opacity:.45;cursor:not-allowed"><svg aria-hidden="true" width="14" height="16" viewBox="0 0 14 16" style="vertical-align:-2px;margin-right:8px"><path d="M3.5 7V4.5a3.5 3.5 0 0 1 7 0V7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="1" y="7" width="12" height="9" rx="2" fill="currentColor"/></svg>コンティニュー　小判${CONTINUE_KOBAN}枚</button>`) +
    B('data-result', '結果を見る', !canContinue()) + '</div><div data-pay hidden style="margin-top:8px"></div><div class="retry-reading" hidden><p data-cause></p><p></p></div>';
  if (lost >= 2) { const h = d.querySelector('[data-hint]'); h.textContent = retryHint(rt, info); h.hidden = false; }
  d.querySelector('h2').textContent = info.down ? (info.dead ? '討死' : '負傷') : '戦に負けた';
  d.querySelector('[data-reason]').textContent = info.down ? '' : retryText(rt, info);
  d.querySelector('[data-reason]').hidden = !!info.down;
  m.dialog = d; m.info = info; m.delay = delay; m.left = first || !/[?&]bot\b/.test(location.search) ? Infinity : 30; rt.retryOpen = true;   // 人は選ぶまで閉じない（三十秒で勝手に結果へ進み、最初からしか選べなくなっていた。11/9 稲葉山のお客さん・1.7.1 と揃える）。bot の流しだけ三十秒で結果へ
  window.speechSynthesis?.cancel();
  // 開戦の札や、自分で開いた一時停止の状態には触れない。
  document.body.appendChild(d); d.setAttribute('open', '');
  // 鍵盤でも選べるが、釦の字は日本語だけにする。
  const keys = { r: '[data-near]', q: '[data-result]' };
  const onKey = (e) => {
    const b = !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && keys[e.key.toLowerCase()];
    if (b) { e.preventDefault(); e.stopPropagation(); d.querySelector(b)?.click(); }
  };
  if (!(typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches)) {
    document.addEventListener('keydown', onKey, true); m.onKey = onKey;
  }
  const close = () => { document.removeEventListener('keydown', onKey, true); d.close(); d.remove(); m.dialog = null; m.accept = null; rt.retryOpen = false; };
  const restore = (point, label = null) => {
    close(); m.downShown = false; m.job = null; m.input.clear?.(); point.restore();
    // 再開で長い会話を流し直さない：字幕の列と読み上げを捨てる
    window.speechSynthesis?.cancel(); if (rt.hud.subQ) { rt.hud.subQ.length = 0; rt.hud.subT = 0; }
    // 未来の点へは戻さない。次の保存も、戻した戦の時刻から数える。
    m.recent = point; m.start = m.previous = null; m.next = rt.t + 12;
    rt.player.u.graceUntil = rt.army.time + 8;
    rt.game.G = rt.G; rt.game.hitstop = rt.game.slowmo = 0;
    settlePlayer(rt);
    // 11/17 K363（kaito「直前から再開の時は毎回、自分を操作できない・攻撃できない」・全戦）：hud.reset は戦の終わり用で、戦ごとに差し替えた
    //   画面の手順（hud.say・hud.update・hud.banner など・76か所）を元へ戻し hud.rt も空にする。戦の途中の再開ではそれが全部外れていた。
    //   再開の時は、戦の差し替えを控えてから reset し、後で戻す（札と字幕だけを片付ける）
    const kept = [];
    for (const o of [rt.hud, rt.hud.notices]) if (o) { const P = Object.getPrototypeOf(o); for (const k of Object.keys(o)) if (typeof o[k] === 'function' && typeof P[k] === 'function') kept.push([o, k, o[k]]); }
    rt.hud.reset();
    for (const [o, k, f] of kept) o[k] = f;
    rt.hud.rt = rt;
    if (rt.choice) rt.hud.renderChoice(rt.choice);
    const tune = musicNow();
    rt.game.resumeBattleRetry();
    // silence が戦ごとの音の決まりと戦の曲（合成の節）を既定へ戻すので、開戦と同じに掛け直す（K313）
    rt.soundScene?.();
    if (tune && !rt.def.town && tune !== 'defeat' && tune !== 'victory') playMusic(tune);
    rt.player.updateCamera(1, rt.camera); rt.hud.update(0, rt);
    rt.game.requestLock();
    showResumeCard(rt, label);
  };
  const near = (o) => {
    // 11/15 K313（kaito「直前からやり直すが毎回バグる。ちゃんと途中から遊べない」・全戦）：区切り（m.goal）を先に選んでいたので、
    //   区切りの後に十二秒おきの写しが何枚あっても、段の始め（最大で数分前・前の段）まで戻っていた（全戦の流し：越前 段4→1、
    //   木津川・三木・高遠 段→0、二度目は90秒戻し）。八秒以上前の写しのうち一番新しい物へ戻す（同じ一撃を避ける八秒は今まで通り）
    let old = [m.goal, m.recent, m.previous].filter((q) => q && rt.t - q.time >= 8);
    // 11/19 K363 iMac n-hetsugi（金ヶ崎の退き口：もう勝てない形になった後の写しへ戻り、八十七回同じ負けを繰り返した）：
    //   戦が「この時刻より前の写しへ」と言う時（def.retryBeforeT）は、その前の写しがあればそちらへ戻す（無ければ今まで通り）
    const lim = rt.def.retryBeforeT?.(rt);
    if (lim != null) { const before = [m.goal, m.recent, m.previous, m.start].filter((q) => q && q.time < lim); if (before.length) old = before; }
    const p = old.reduce((a, q) => (q.time > a.time ? q : a), old[0] || m.goal || m.previous || m.recent);
    restore(p, p === m.goal ? m.cp : cpLabel(rt));
    if (o) setAssist(rt.army, o);   // 写しを戻した後に置く（Symbol の鍵なので次の再開でも残る）
    // 時間切れで負けた後に直前から戻すと、すぐ同じ打ち切りに当たって負け直した（11/9 稲葉山・1.7.1 と揃える）。負けた数だけ打ち切りを四分ずつ延ばす
    if (!m.info?.down) rt.pacingBonus = 240 * (LOSSES.get(rt) || 1);
  };
  // K648：押すと確かめの札（取り消せない）→［小判○枚で続ける］で一度だけ減らして、倒れた所（八秒前の写し）から続ける。失敗したら小判を戻す
  const tag = ++payTag;
  const pay = d.querySelector('[data-pay]');
  const go = () => {
    if (m.dialog !== d || !canContinue() || !payContinue(tag)) return;
    try { near(null); } catch (e) { refundContinue(tag); console.error(e); }
  };
  d.querySelector('[data-near]').onclick = () => {
    if (!canContinue() || !pay.hidden) return;
    pay.innerHTML = `<p style="font-size:16px;line-height:1.5;margin:0 0 4px">小判${CONTINUE_KOBAN}枚を使って、倒れた所から続けます。</p><p style="font-size:14px;margin:0 0 8px;color:#cdbf9f">使った小判は戻りません。</p><div style="display:flex;flex-direction:column;gap:8px">` +
      B('data-pay-go', `小判${CONTINUE_KOBAN}枚で続ける`, true) + B('data-pay-no', 'やめる') + '</div>';
    pay.hidden = false;
    const yes = pay.querySelector('[data-pay-go]');
    yes.onclick = () => { yes.disabled = true; go(); };
    pay.querySelector('[data-pay-no]').onclick = () => { pay.hidden = true; pay.innerHTML = ''; d.querySelector('[data-near]').focus({ preventScroll: true }); };
    yes.focus({ preventScroll: true });
  };
  m.accept = () => {
    close(); m.accepting = true;
    rt.finish(m.info, Math.min(m.delay ?? 1, 1));   // 結果を選んだら待たせない（kaito 11/9：Q から敗北の画面までが長い）
  };
  d.querySelector('[data-result]').onclick = m.accept;
  if (first) {
    if (document.pointerLockElement) document.exitPointerLock?.();
    m.input.clear?.();
    d.querySelector(canContinue() ? '[data-near]' : '[data-result]').focus({ preventScroll: true });
  }
  return true;
}

export function disposeRetry(rt) {
  const m = memories.get(rt);
  if (m?.onKey) document.removeEventListener('keydown', m.onKey, true);
  m?.unskip?.();
  if (m?.dialog) { m.dialog.close(); m.dialog.remove(); }
  memories.delete(rt); rt.retryOpen = false;
}
