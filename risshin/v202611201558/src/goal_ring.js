// ======================================================================
// K473（kaito 11/20 夕「行き先の地面に白い丸。着いたら丸が消えて、その任務は済み」・全戦）：
//   行き先の▼（goal_sign.js が hud.goalSignPoint に置く一点）が場所を指す間、その地面に白い丸を敷く。
//   本人が丸に入ったら丸を消し、P4 チェックポイントと同じ「済」の印と音（checkpoint_chain.js の cpCue）を一度出す。
//   同じ行き先は一度着いたら戦の間は敷き直さない（斬り合いで離れても出し直さない＝goal_sign の着いた場所と同じ決まり）。
//   人・敵を指す間（▼が頭上）と、地面のピンを自分で描く戦（goalSignGroundPin）は敷かない。形と材質は一つを使い回す。
// ======================================================================
import * as THREE from 'three';
import { groundAt } from './floors.js';
import { cpCue } from './checkpoint_chain.js';

let ring = null, ringRt = null;
const reached = new WeakMap();

function make(rt) {
  if (!ring) {
    const g = new THREE.RingGeometry(0.88, 1, 64); g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: false });
    ring = new THREE.Mesh(g, m); ring.name = 'goal-ring'; ring.renderOrder = 3; ring.frustumCulled = false;
    ring.userData.noShadow = true; ring.castShadow = ring.receiveShadow = false;
  }
  if (ringRt !== rt || ring.parent !== rt.scene) { ring.removeFromParent(); rt.scene.add(ring); ringRt = rt; }
  return ring;
}

export function goalRingTick(rt) {
  const hud = rt?.hud, t = hud?.goalSignPoint, u = rt?.player?.u;
  const off = !t || !u || !rt.scene || t.unit || t.enemy || !Number.isFinite(t.x) || !Number.isFinite(t.z) || rt.def?.goalSignGroundPin || rt.def?.goalRingOff ||
    rt.over || !u.alive || hud?.introWaiting || hud?.bigmap || rt.player.camShot || rt.player.cine;
  if (off) { if (ring && ringRt === rt) ring.visible = false; return; }
  let st = reached.get(rt); if (!st) { st = { done: new Set(), shown: new Set(), x: NaN, z: NaN, still: 0, t: rt.t }; reached.set(rt, st); }
  // 動く行き先（列の後ろ・追う味方の将など）は丸を敷かない：同じ所に一秒とどまった一点だけ（毎コマ「済」が鳴るのを防ぐ）
  const dt = Math.max(0, rt.t - st.t); st.t = rt.t;
  if (Math.hypot(t.x - st.x, t.z - st.z) > 0.5) { st.x = t.x; st.z = t.z; st.still = 0; } else st.still += dt;
  const R = make(rt);
  if (st.still < 1) { R.visible = false; return; }
  const key = t.arrivalId != null ? `id:${t.arrivalId}` : `${t.label || ''}:${Math.round(t.x)}:${Math.round(t.z)}`;
  const r = Math.max(3, Math.min(12, t.r ?? t.hideDistance ?? 6));
  if (st.done.has(key)) { R.visible = false; return; }
  if (Math.hypot(u.pos.x - t.x, u.pos.z - t.z) < r) {
    st.done.add(key); R.visible = false;
    // 丸を見せた後に入った時だけ「済」の印と音（始めから中に立っていた行き先は黙って済ませる）。
    //   段の連なり（checkpoint_chain の cpStart）を使う戦は、その部品が自分で印と音を出す（二度鳴らさない）
    if (st.shown.has(key) && !rt.flags?.cp) cpCue(rt, t);
    return;
  }
  st.shown.add(key);
  const y = t.y ?? groundAt(rt.world, t.x, t.z, u.pos.y);
  R.position.set(t.x, (Number.isFinite(y) ? y : u.pos.y) + 0.12, t.z);
  R.scale.set(r, 1, r);
  R.visible = true;
}
