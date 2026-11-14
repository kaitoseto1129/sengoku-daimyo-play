// 武将の上半身の絵：ゲームの 3D（preview.js の setGeneral：その人の兜・甲冑・実写の顔）で撮る。図鑑の札と会話の場面から使う。
// 一人一枚を覚えておく。撮る間だけ小さな描画を一つ持ち、しばらく使わなければ手放す（携帯の記憶を増やさない）。
// 撮れない時（描けない端末・素材が読めない）は null を返し、呼ぶ側は今までの顔の絵を使う。
// 11/2：図鑑の名簿（zukan_people.js）の人で、具足の表（units_data.js の GENERALS）に顔の無い人も、名簿の顔の手がかりから一人ずつの顔を作って撮る。
import * as THREE from 'three';
import { GENERALS } from './units_data.js';
import { ROSTER_ALIAS, BATTLE_YEAR } from './bushou_roster.js';
import { ZUKAN_ROWS } from './zukan_people.js';
import { TOYOTOMI_LINE } from './toyotomi_line.js';
import { TOKUGAWA_LINE } from './tokugawa_line.js';

const shots = new Map();
const MAX_SHOTS = 48;
let pv = null, cv = null, ready = null, idleT = 0, busy = false, U = null, P = {}, K = {}, F = null;
const queue = [];
const box = new THREE.Box3();
// 戦や会話の呼び名 → 具足の名
// 木下の名の秀吉は、若い頃の具足（頭形・立物なし。units_data の木下藤吉郎）で撮る。後年の馬藺の後立を元亀の金ヶ崎の会話に出さない（kaito 11/5 BQ）
const ALIAS = { 木下藤吉郎: '木下藤吉郎', 木下秀吉: '木下藤吉郎', 藤吉郎: '木下藤吉郎', 豊臣秀吉: '羽柴秀吉', 蜂須賀小六: '蜂須賀正勝', 稲葉良通: '稲葉一鉄', 稲葉一鉄: '稲葉良通', 伊賀伊賀守: '安藤守就', 毛利河内: '毛利長秀', 真田幸村: '真田信繁' };
// 図鑑の名簿：名と別名 → 名簿の一行
const ROW = new Map();
for (const r of ZUKAN_ROWS) { ROW.set(r[0], r); for (const a of r[8].split('・')) if (a && !ROW.has(a)) ROW.set(a, r); }
const YEAR = { ...BATTLE_YEAR };
for (const b of [...TOYOTOMI_LINE, ...TOKUGAWA_LINE]) YEAR[b.id] = b.year;

export function portraitName(raw) {
  const n = String(raw || '').replace(/^.* /, '').replace(/(殿|様)$/, '');
  const k = ALIAS[n] || ROSTER_ALIAS[n] || n;
  if (GENERALS[k] && GENERALS[k].face) return k;
  if (GENERALS[n] && GENERALS[n].face) return n;
  const r = ROW.get(n) || ROW.get(k);
  if (!r) return null;
  // 名簿の人でも、具足の表に顔のある名（別名）があればそちらを使う
  for (const a of [r[0], ...r[8].split('・')]) if (a && GENERALS[ALIAS[a] || a]?.face) return ALIAS[a] || a;
  return r[0];
}
export function portraitCached(raw) { const k = portraitName(raw); return (k && shots.get(k)) || null; }

// ---------------- 名簿の顔の手がかり → 3D の顔の値 ----------------
function hashOf(s, salt = 0) { let h = 2166136261 ^ salt; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return ((h >>> 0) % 10007) / 10007; }
const SHAPE = {
  丸: { w: 1.1, jaw: 1.05, chin: 0.88, cheek: 1.0, gaunt: -0.2 },
  角: { w: 1.05, jaw: 1.35, chin: 0.85, cheek: 1.25, gaunt: 0.4 },
  面: { w: 0.94, jaw: 0.9, chin: 1.18, cheek: 1.1, gaunt: 0.7 },
  細: { w: 0.92, jaw: 0.85, chin: 1.05, cheek: 1.15, gaunt: 0.9 },
};
// 肖像画の髭は濃く描かれている（兵の髭の濃さのままでは、皆が同じ薄い顎髭に見えた）。濃さは 1 を越えてよい
const BEARD = {
  無: { mus: 0, musW: 0.5, musH: 0.5, goat: 0, side: 0, stub: 0.2 },
  薄: { mus: 0.35, musW: 0.65, musH: 0.6, droop: 0.25, goat: 0.25, goatW: 0.5, side: 0, stub: 0.5 },
  口: { mus: 1.05, musW: 0.95, musH: 1.0, droop: 0.45, goat: 0, side: 0, stub: 0.6 },
  髭: { mus: 1.0, musW: 0.95, musH: 0.95, droop: 0.45, goat: 1.0, goatW: 0.85, side: 0.15, stub: 0.8 },
  濃: { mus: 1.4, musW: 1.15, musH: 1.3, droop: 0.5, goat: 1.3, goatW: 1.2, side: 1.1, stub: 1.3 },
  長: { mus: 0.95, musW: 0.85, musH: 0.9, droop: 0.8, goat: 1.45, goatW: 0.7, side: 0.1, stub: 0.7 },
};
const SKIN = [0xb88e6a, 0xa87f5c, 0xc09a74, 0x9c7453, 0xb08664];
// 絵の年：会える戦のうち最後の年（没年より後にしない）。生年が分からない人は四十歳ほど
function ageOf(r, tk) {
  const y = tk.find((t) => /^年\d+$/.test(t));
  if (y) return +y.slice(1);
  if (!r[2]) return 40;
  const ys = r[5].split(' ').map((id) => YEAR[id]).filter(Boolean);
  const last = Math.min(Math.max(...ys, r[2] + 30), r[3] || 9999);
  return Math.max(15, last - r[2]);
}
export function zukanLook(name) {
  const r = ROW.get(name);
  if (!r) return null;
  const tk = r[7].split(' ').filter(Boolean);
  const has = (t) => tk.includes(t);
  const j = (salt, amp) => (hashOf(r[0], salt) - 0.5) * 2 * amp;
  const age = ageOf(r, tk);
  const shape = SHAPE[tk.find((t) => SHAPE[t])] || { w: 1, jaw: 1 + j(1, 0.15), chin: 1 + j(2, 0.1), cheek: 1.12, gaunt: 0.5 };
  const bk = tk.find((t) => BEARD[t]) || (age < 22 ? '無' : ['口', '髭', '髭', '長'][Math.floor(hashOf(r[0], 3) * 4)]);
  const beard = { ...BEARD[bk] };
  if (beard.mus) beard.musW = beard.musW + j(4, 0.12);
  if (beard.goat) beard.goatW = (beard.goatW || 0.8) + j(5, 0.15);
  const f = {
    ...shape, brow: 1.1, nose: 1, nw: 1, eye: 1.05, esp: 1 + j(6, 0.04),
    browSlope: j(7, 0.08), eyeTilt: j(8, 0.06), age, beard,
    t: age >= 55 ? 7 : age >= 45 ? 5 : age >= 35 ? 3 : age >= 25 ? 1 : 0,
    hair: has('白') || age >= 58 ? 0x8a847a : age >= 48 ? 0x4a4640 : 0x15110d,
  };
  f.w += j(9, 0.03); f.cheek += j(10, 0.08); f.nose += j(11, 0.08);
  if (has('太')) { f.brow = 1.35; f.browT = 1.4; }
  if (has('細')) { f.brow = 0.95; f.browT = 0.75; }
  if (has('細目')) f.eye = 1.28;
  if (has('大目')) f.eye = 0.9;
  if (has('高')) { f.nose = 1.2; f.nw = 0.9; }
  if (has('広')) f.nw = 1.25;
  if (has('肥')) { f.w += 0.06; f.gaunt -= 0.4; }
  if (has('痩')) f.gaunt += 0.4;
  if (f.browT == null) f.browT = f.brow;
  // 装い：h: 兜・a: 胴の色/威の色（具足の表に無い人だけ。表のある人は表が勝つ）
  const hat = (tk.find((t) => t.startsWith('h:')) || 'h:kabuto_m').slice(2);
  const [armor, lace] = ((tk.find((t) => t.startsWith('a:')) || 'a:1c1a1a/4a3a2a').slice(2)).split('/').map((h) => parseInt(h, 16));
  const look = { armor, lace, hat, mon: 'none', skin: SKIN[Math.floor(hashOf(r[0], 12) * SKIN.length)], face: f };
  // 僧・坊官：戦の姿と同じ具足に兜（髭を剃る）。僧兵の衣と裹頭は、近くで撮ると襟が浮き輪のように太く写った
  if (has('僧') || has('坊')) look.monk = 1;
  return look;
}

function open() {
  if (ready) return ready;
  ready = (async () => {
    const { Preview } = await import('./preview.js');
    U = await import('./units.js');
    P = await import('./humans_pose.js');
    K = await import('./kacchu_data.js');
    const [fm, fg] = await Promise.all([import('./humans_face_materials.js'), import('./humans_face_geometry.js')]);
    F = { headMats: fm.headMats, headGeos: fg.headGeos };
    cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;left:-10000px;top:0;width:280px;height:336px;pointer-events:none';
    document.body.appendChild(cv);
    pv = new Preview(cv);
    if (!pv.renderer) throw new Error('描けない');
    pv.renderer.setPixelRatio(1);
    // 札の絵（168px）を携帯の二倍の細かさで見ても髭と目元がつぶれない大きさ
    pv.renderer.setSize(280, 336, false);
    pv.spin = 0;
    for (const m of pv.floor || []) m.visible = false;
    await pv.loadGeneral();
  })();
  return ready;
}
// 描画の輪は、絵の板が外れると自分で手放す（preview.js）
function close() { if (cv) cv.remove(); cv = null; pv = null; ready = null; }

// 名簿だけの人：具足の表へ撮る間だけ置き、その人の兜・甲冑（kacchu_data.js の表）と顔で組む。撮ったらすぐ外す（戦の兵の見た目を変えない）
// 名簿の顔の手がかり（肖像画に寄せた形・髭・年）で撮る人：具足の表に無い人と、表の顔が名と生年から作った仮の顔の人（11/2：174人のうち122人が仮の顔で、
//   伊達政宗や石田三成が十五歳の顔に写っていた）。兜・甲冑は具足の表（kacchu_data.js）のまま、顔だけ名簿から。
//   撮る間だけ別の名（zk:）で具足の表へ置き、撮ったらすぐ外して顔の絵と形も手放す（戦の兵の顔と見た目を変えない・記憶を残さない）
const KZ = 'zk:';
function dressRow(nm, gen) {
  const L = zukanLook(nm), base = gen ? GENERALS[gen] : null, B = base || L, key = KZ + nm;
  GENERALS[key] = base ? { ...base, face: L.face } : L;
  try {
    pv.holder.clear();
    pv.horse = null;
    const u = {};
    const m = U.buildModel(u, { armor: B.armor, lace: B.lace, hat: B.hat, sode: true, pole: false, flag: null, weapon: null, skin: B.skin, saya: true, menpo: B.menpo || 0, menpoStyle: B.menpoStyle, horo: 0, haori: 0, noHaori: true, tier: 3, face: 'g:' + key, mon: B.mon, haoriMonCol: B.haoriMonCol,
      ...(K.KACCHU[gen || nm] ? { kacchu: K.KACCHU[gen || nm] } : {}),
      ...(L.monk ? { monk: 1 } : {}) });
    u.hand.rotation.x = -0.5; U.poseArms(u);
    pv.holder.add(m);
    pv.holder.rotation.y = -0.45;
    if (pv.humanize(u, m)) { pv.holder.rotation.y = 0; u.heading = 0.35; m.rotation.y = u.heading; }
    return snap();
  } finally { delete GENERALS[key]; forget('g:' + key); }
}
// 撮るためだけに作った顔の絵・材質・形を手放す
function forget(fk) {
  if (!F) return;
  for (const [k, m] of F.headMats) if (String(k).startsWith(fk)) { m.map?.dispose(); m.dispose?.(); F.headMats.delete(k); }
  for (const [k, g] of F.headGeos) if (String(k).startsWith(fk)) { g.dispose(); F.headGeos.delete(k); }
}
// 肖像画の姿：指物の布を外し（竿を持たないので頭の上に浮いた）、両の手を腰の前へ下ろす（待つ構えの腕と籠手の肩が顎の前に塊で写った）
const _s = new THREE.Vector3(), _h = new THREE.Vector3(), _t = new THREE.Vector3(), _p = new THREE.Vector3();
function sitStill(u) {
  if (u && u.flag) u.flag.visible = false;
  const h = u && u.human, B = h && h.bones;
  // 会話の顔は面頬を外す（軍議で面頬を着けたままの肖像は無い。赤い面で顔が隠れ、誰か分からなかった。kaito 11/5 BQ）
  if (h && h.parts && h.parts.menpo) h.parts.menpo.visible = false;
  if (!B || !B.Hips || !P.ik2) return;
  B.Hips.getWorldPosition(_h);
  for (const sd of ['Right', 'Left']) {
    const up = B[sd + 'Arm'], lo = B[sd + 'ForeArm'], hd = B[sd + 'Hand'];
    if (!up || !lo || !hd) continue;
    up.getWorldPosition(_s);
    _t.set(_s.x + (_s.x - _h.x) * 0.25, _h.y + 0.02, _s.z + 0.12);
    _p.set(_s.x + (_s.x - _h.x) * 2, _s.y - 0.3, _s.z - 0.6);
    P.ik2(up, lo, hd, _t, _p);
  }
  pv.holder.updateMatrixWorld(true);
  // 腕の骨に付いた籠手の肩の当てが、下ろした腕に付いてこず肩の上に立つ物は描かない
  B.Neck && B.Neck.getWorldPosition(_t);
  pv.holder.traverse((o) => {
    if (!o.isMesh || !/^sock:(Left|Right)Arm$/.test(o.parent?.name || '')) return;
    box.setFromObject(o);
    if (box.max.y > _t.y - 0.02) o.visible = false;
  });
}
function snap() {
  if (!pv.hu) pv.holder.rotation.y = -0.3;
  else sitStill(pv.hu);
  pv.holder.updateMatrixWorld(true);
  box.setFromObject(pv.holder);
  const head = pv.hu?.human?.bones?.Head;
  if (head) {
    // 骨の入った人：胸の上から兜の立物の先までを入れる（伊達の三日月・清正の長烏帽子のような立物で誰か分かる）。
    // 立物の高い兜ほど引くが、並びの小さな札（幅90px）でも顔が分かるよう、顔が絵の五分の一より小さくならない所で止める
    // （本多の鹿角・黒田の一の谷の根元が入り、何の立物か分かる所まで）
    head.getWorldPosition(_t);
    // 兜の無い頭（僧・坊官）も、兜の人と同じ大きさの顔と胸の上までに撮る（頭の先で切ると顔が絵いっぱいになった）
    const lo = _t.y - 0.26, hi = Math.max(_t.y + 0.3, Math.min(Number.isFinite(box.max.y) ? box.max.y : _t.y + 0.3, _t.y + 0.55)) + 0.02;
    const y = (lo + hi) / 2, d = Math.max(0.95, Math.min(1.3, (hi - lo) / 2 / Math.tan(THREE.MathUtils.degToRad(pv.camera.fov / 2)) + 0.1));
    pv.camera.position.set(0.1 * d, y + 0.03, d);
    pv.camera.lookAt(0, y, 0);
  } else {
    // 兜の立物の先から胸までが入るように、頭の高さに合わせて寄る（顔が絵の三分の一ほどになるまで）
    const top = Number.isFinite(box.max.y) ? box.max.y : 1.8;
    const y = Math.max(1.1, Math.min(top - 0.4, 1.6));
    pv.camera.position.set(0.2, y + 0.04, 1.55);
    pv.camera.lookAt(0, y - 0.04, 0);
  }
  pv.renderer.render(pv.scene, pv.camera);
  // 透ける地のまま軽く（webp を書けない端末は png になる）
  return cv.toDataURL('image/webp', 0.9);
}
// 名簿の顔の手がかりがある人（形・髭などが一つでもある人）
const hasLook = (r) => !!r && r[7].split(' ').some((t) => t && !/^(h:|a:)/.test(t));
function shoot(nm) {
  if (!GENERALS[nm]?.face) return dressRow(nm);
  const r = ROW.get(nm);
  if (hasLook(r)) return dressRow(r[0], nm);
  pv.setGeneral(nm, 0.35);
  return snap();
}

async function pump() {
  if (busy) return;
  busy = true;
  try {
    while (queue.length) {
      const [nm, res] = queue.shift();
      if (shots.has(nm)) { res(shots.get(nm)); continue; }
      let url = null;
      try { await open(); url = shoot(nm); } catch (e) { url = null; }
      if (url) {
        shots.set(nm, url);
        if (shots.size > MAX_SHOTS) shots.delete(shots.keys().next().value);
      }
      res(url);
      await new Promise((r) => requestAnimationFrame(() => r()));
    }
  } finally { busy = false; }
  clearTimeout(idleT);
  idleT = setTimeout(close, 8000);
}

export function portrait(raw) {
  const nm = portraitName(raw);
  if (!nm) return Promise.resolve(null);
  if (shots.has(nm)) return Promise.resolve(shots.get(nm));
  return new Promise((res) => { queue.push([nm, res]); clearTimeout(idleT); pump(); });
}
export function portraitStop() {
  for (const [, r] of queue.splice(0)) r(null);
  clearTimeout(idleT);
  close();
}
