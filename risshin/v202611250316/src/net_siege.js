// 攻城の区画の状態（オンライン P2 の下書き・docs/online_spec_1111.md 5章）。ソロの戦にはつなげない（オンラインの攻城だけ・下の attachSiegeNet）。
// 城に一本の HP を置かず、区画ごとに持つ（NG-07）。連鎖：外周の守りが減る→門が破りやすい→壁→虎口→曲輪→本丸。
export const SIEGE_SECTORS = ['OUTER_DEFENSE', 'GATE', 'WALL', 'KOGUCHI', 'BAILEY', 'HONMARU'];
// 区画ごとの耐え（0〜1の割合で持つ）と、連鎖で受ける倍率の元
const DEF = {
  OUTER_DEFENSE: { hp: 1, needs: null },
  GATE: { hp: 1, needs: 'OUTER_DEFENSE' },
  WALL: { hp: 1, needs: null },
  KOGUCHI: { hp: 1, needs: 'GATE' },
  BAILEY: { hp: 1, needs: 'KOGUCHI' },
  HONMARU: { hp: 1, needs: 'BAILEY' },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));

export function createSiegeState() {
  const s = {};
  for (const k of SIEGE_SECTORS) s[k] = { hp: DEF[k].hp, taken: false };
  return s;
}
// 先に落とす区画が残っているほど、その区画は破りにくい（0.4〜1.0）
export function sectorResist(state, key) {
  const n = DEF[key] && DEF[key].needs;
  if (!n) return 0.6;
  return 0.6 + 0.4 * clamp01(state[n].hp);
}
// 区画へ傷を与える。返す値は与えた後の hp。取られた区画は戻らない
export function damageSector(state, key, amount) {
  const sec = state[key];
  if (!sec || sec.taken) return sec ? sec.hp : 0;
  sec.hp = clamp01(sec.hp - Math.max(0, amount) * (1 - sectorResist(state, key) * 0.5));
  if (sec.hp <= 0.02) { sec.hp = 0; sec.taken = true; }   // 残り二分以下は落ちた事に（端数で止まらない）
  return sec.hp;
}
// 本丸が取られた時だけ城は落ちる。落ちた区画の数も返す（進み具合の印用）
export function siegeProgress(state) {
  let n = 0;
  for (const k of SIEGE_SECTORS) if (state[k].taken) n++;
  return { taken: n, total: SIEGE_SECTORS.length, fallen: state.HONMARU.taken };
}
// ネットで送る形（変わった区画だけ・小数二桁）
export function packSiege(state, prev) {
  const out = {};
  for (const k of SIEGE_SECTORS) {
    // 取られていない区画は 0 に丸めない（丸めで客の側だけ「落ちた」にならないように）。小数二桁
    const h = state[k].taken ? 0 : Math.max(0.01, Math.round(state[k].hp * 100) / 100);
    if (!prev || prev[k] !== h) out[k] = h;
  }
  return out;
}
export function applySiege(state, pack) {
  for (const k in pack) if (state[k]) { state[k].hp = clamp01(pack[k]); state[k].taken = pack[k] <= 0; }
}

// ---- 攻城の区画を戦につなぐ（PvP の攻城・K317・11/15）----
//   区画の置き場は戦ごと（攻め口は三つ以上：大手・搦手・脇の肩）。ホストだけが区画を削り、siege（変わった区画）で全員へ流す。
//   削り方：区画の16m 内の攻め手（東・team 0）と守り手（西・team 1）を数え、攻め手が上回るほど削る。プレイヤーの武将は兵五人分。
//   先に落とす区画が残っているほど破りにくい（sectorResist）。本丸が落ちれば城が落ちる。
//   見せ方は字でなく絵：区画ごとに旗竿を立て、布は守りの残り（hp）の高さで、守り手の赤。取られたら攻め手の青の布が上まで揚がる。
import * as THREE from 'three';
export const SIEGE_NAMES = { OUTER_DEFENSE: '物見櫓', GATE: '大手の木戸', WALL: '百曲りの肩', KOGUCHI: '本丸の口', BAILEY: '二の丸', HONMARU: '本丸' };
const SPOTS = {
  inabayama: async () => {
    const C = await import('./castles/inabayama.js');
    return { OUTER_DEFENSE: C.TOWER, GATE: C.OTE, WALL: { x: C.HYAKU[3][0], z: C.HYAKU[3][1] }, KOGUCHI: C.HON_GATE_OUT, BAILEY: C.NI, HONMARU: C.HON };
  },
};
export const siegeKeyOf = (rt) => rt.def?.key || rt.world?.def?.battleKey || rt.def?.id || '';
export async function attachSiegeNet(rt, { host, send, players = () => [], onTaken = () => {} }) {
  const get = SPOTS[siegeKeyOf(rt)];
  if (!get) return null;
  const spots = await get();
  const st = createSiegeState();
  const L = { st, spots, sent: 0, got: 0, ticks: 0, taken: [], flags: {} };
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a2c1c });
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 7, 6);
  const clothGeo = new THREE.PlaneGeometry(1.6, 3.2); clothGeo.translate(0.8, -1.6, 0);
  for (const k of SIEGE_SECTORS) {
    const p = spots[k]; if (!p) continue;
    const grp = new THREE.Group();
    const y = rt.world.heightAt(p.x, p.z);
    grp.position.set(p.x, y, p.z);
    const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 3.5; grp.add(pole);
    const mat = new THREE.MeshLambertMaterial({ color: 0xb8322a, side: THREE.DoubleSide });
    const cloth = new THREE.Mesh(clothGeo, mat); cloth.position.set(0.1, 6.9, 0); grp.add(cloth);
    rt.scene.add(grp);
    L.flags[k] = { grp, cloth, mat };
  }
  const show = () => {
    for (const k of SIEGE_SECTORS) {
      const f = L.flags[k]; if (!f) continue;
      const s = st[k];
      if (s.taken) { f.mat.color.setHex(0x2f5fb8); f.cloth.scale.y = 1; }
      else { f.mat.color.setHex(0xb8322a); f.cloth.scale.y = Math.max(0.08, s.hp); }
    }
  };
  show();
  const R2 = 16 * 16;
  let prev = null;
  const timer = setInterval(() => {
    if (!host || rt.ended) return;
    L.ticks++;
    const pls = players();
    for (const k of SIEGE_SECTORS) {
      const s = st[k], p = spots[k];
      if (!p || s.taken) continue;
      let a = 0, d = 0;
      for (const u of rt.army.units) {
        if (!u.alive || u.gone || u.isPlayer) continue;
        const dx = u.pos.x - p.x, dz = u.pos.z - p.z;
        if (dx * dx + dz * dz > R2) continue;
        if (u.team === 0) a++; else d++;
      }
      for (const q of pls) { const dx = q.x - p.x, dz = q.z - p.z; if (dx * dx + dz * dz <= R2) { if (q.team === 0) a += 5; else d += 5; } }
      const push = a - d * 1.5;
      if (push <= 0) continue;
      damageSector(st, k, Math.min(0.08, push * 0.01));
      if (s.taken) { L.taken.push(k); onTaken(k, siegeProgress(st)); }
    }
    const full = L.ticks % 5 === 0;
    const pack = packSiege(st, full ? null : prev);
    prev = {}; for (const k of SIEGE_SECTORS) prev[k] = st[k].taken ? 0 : Math.max(0.01, Math.round(st[k].hp * 100) / 100);
    if (Object.keys(pack).length) { send({ t: 'siege', p: pack }); L.sent++; }
    show();
  }, 1000);
  L.apply = (pack) => {
    const before = SIEGE_SECTORS.filter((k) => st[k].taken);
    applySiege(st, pack); L.got++;
    for (const k of SIEGE_SECTORS) if (st[k].taken && !before.includes(k)) { L.taken.push(k); onTaken(k, siegeProgress(st)); }
    show();
  };
  L.dispose = () => { clearInterval(timer); for (const f of Object.values(L.flags)) { rt.scene.remove(f.grp); f.mat.dispose(); } poleGeo.dispose(); clothGeo.dispose(); poleMat.dispose(); };
  return L;
}
