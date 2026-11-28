// 近い兵は個別、中ほどは実在する隊の打ち合いと鬨、遠くは既存の戦場ループへ。
import { MEM_TIGHT } from './settings.js';
import { setFarBattle, markSourcedDrum } from './audio.js';

const CLASH = new Set(['kin', 'clash', 'nearClash', 'shaftContact', 'yoroi', 'thunk', 'hit', 'cut', 'thud']);
const VOICE = new Set(['shout', 'eshout', 'cry', 'umeki', 'toki', 'eiei']);
const GUNS = new Set(['gun', 'volley', 'volleySmall', 'gunScatter', 'saika_gun', 'gunWet']);

export function createBattleSound(rt) {
  const groups = new WeakMap();
  const result = { name: '', pos: null, vol: 1, grouped: false };
  const stats = { individual: 0, grouped: 0, distant: 0, merged: 0, farSoldiers: 0 };
  let speaker = null, nearest = Infinity, at = null, scanT = 0;
  // 遠くの本物の戦（audio.js の遠い層へ渡す）：打ち合う兵の数・その向きと距離、撃った鉄砲の数（八秒で薄れる）とその向き
  const real = { fight: 0, dx: 0, dz: 0, dist: 0, clash: 0, clashDist: 0, clashDx: 0, clashDz: 0, guns: 0, gunDx: 0, gunDz: 0, gunDist: 0 };
  const engaged = new Set();
  function find(u) {
    if (!u.alive || u.isStruct) return;
    const d = (u.pos.x - at.x) ** 2 + (u.pos.z - at.z) ** 2;
    if (d < nearest) { nearest = d; speaker = u; }
  }
  return {
    stats,
    real,
    route(name, pos, vol) {
      result.name = name; result.pos = pos; result.vol = vol; result.grouped = false;
      if (pos && (name === 'jindaiko' || name === 'otaiko')) markSourcedDrum();
      if (pos && GUNS.has(name)) {
        const q = rt.player.u.pos, gx = pos.x - q.x, gz = pos.z - q.z, gd = Math.hypot(gx, gz);
        if (gd > 30 && gd < 600) { const w = 1 / (real.guns + 1); real.gunDx += (gx - real.gunDx) * w; real.gunDz += (gz - real.gunDz) * w; real.gunDist += (gd - real.gunDist) * w; real.guns += name === 'volley' ? 3 : 1; }
      }
      if (!pos || (!CLASH.has(name) && !VOICE.has(name))) return result;
      const p = rt.player.u.pos, d = Math.hypot(pos.x - p.x, pos.z - p.z);
      // 本人の打ち合いと名のある将の声は、その位置のまま残す。
      const near = MEM_TIGHT ? 25 : 35;
      if (d <= near) { stats.individual++; return result; }
      at = pos; speaker = null; nearest = 2.25;
      rt.army.forNear(pos.x, pos.z, 1.5, find);
      if (speaker?.type === 'busho' && speaker.name && VOICE.has(name)) return result;
      if (d > 100) { stats.distant++; return null; }
      const scriptedCries = rt.world.def.scriptedBattleCries;
      // 下知で鬨を鳴らす戦では、実際の兵の叫びや呻きを大軍の鬨へ替えない。
      if (scriptedCries && VOICE.has(name)) return result;
      // K635③（kaito 11/21 音の要件書「ずっとワー・死ぬたびに叫び」）：中ほどの一人の叫び・うめき・掛け声を、隊の大勢の鬨（えい、えい、おう）へ替えない。
      //   中ほどは群れの打ち合いの音だけにし、鬨は鬨として求められた時（突撃・勝ち）だけ鳴らす（前は中ほどで一人倒れるたびに大勢の鬨が鳴った）
      if (!rt.def.keepCompanyVoices && (name === 'cry' || name === 'umeki' || name === 'shout' || name === 'eshout')) { stats.merged++; return null; }
      let group = speaker?.group;
      if (!group) {
        let best = 24;
        for (const g of rt.army.groups) {
          if (!g.count) continue;
          const c = g.center(), distance = Math.hypot(c.x - pos.x, c.z - pos.z);
          if (distance < best) { best = distance; group = g; }
        }
      }
      if (!group) return result;
      let state = groups.get(group);
      if (!state) { state = { until: 0, call: false }; groups.set(group, state); }
      if (state.until > rt.t) { stats.merged++; return null; }
      // 一隊で同時に一つ。槍と群声を交互にし、兵数は音の厚みに反映する。
      // 雑賀の引き退き・停止中も打ち合いは続く。金物の音から架空の鬨を作らない。
      state.call = !scriptedCries && (name === 'toki' || name === 'eiei' || rt.def.keepCompanyVoices && VOICE.has(name));   // K635③：打ち合いの音を交互に鬨へ替えない
      result.name = state.call ? 'toki' : 'shaftContact';
      result.pos = group.center();
      result.vol = Math.min(1.5, vol * (0.8 + Math.min(0.7, group.count / 50)));
      if (rt.def.keepCompanyVoices) {
        const retreating = group.routed || group.order === 'retreat';
        // 退きの合図に逆らう鬨を足さない。実際の叫びや打ち合いは残す。
        if (retreating && (name === 'toki' || name === 'eiei')) { stats.merged++; return null; }
        if (VOICE.has(name)) {
          // うめきや悲鳴を群声へ替えず、人数で大きくもしない。
          result.name = name; result.pos = pos; result.vol = vol;
        } else if (retreating) {
          result.name = name; state.call = false;
        } else if (state.call && group.team !== rt.player.u.team) {
          result.name = 'eshout';
        }
      }
      result.grouped = true;
      state.until = rt.t + (scriptedCries || state.call ? 4 : 2.5);
      stats.grouped++;
      return result;
    },
    tick(dt, active) {
      if (!active) { stats.farSoldiers = 0; scanT = 0; real.fight = 0; real.guns = 0; setFarBattle(real); return 0; }
      scanT -= dt;
      real.guns *= Math.exp(-dt / 8);
      if (scanT <= 0) {
        scanT = 0.5; stats.farSoldiers = 0;
        // P1 戦の音の層：今まさに打ち合う兵（target・atk）だけを数える。立っているだけの大軍からは鬨も太鼓も作らない。
        const p = rt.player.u.pos, seen = engaged;
        seen.clear();
        let n = 0, sx = 0, sz = 0, best = Infinity;
        for (const u of rt.army.units) {
          if (!u.alive || u.isPlayer || u.isStruct || !(u.target || u.atk)) continue;
          const g = u.group;
          if (g && (g.hidden || g.people || g.civ)) continue;
          const d = Math.hypot(u.pos.x - p.x, u.pos.z - p.z);
          if (g && d > 100) seen.add(g);
          if (d <= 25 || d > 420) continue;
          n++; sx += u.pos.x; sz += u.pos.z; if (d < best) best = d;
        }
        for (const g of seen) stats.farSoldiers += g.count || 0;
        real.fight = n;
        if (n) { real.dx = sx / n - p.x; real.dz = sz / n - p.z; real.dist = Math.max(best, Math.hypot(real.dx, real.dz) * 0.6); }
        // 遠目の合戦（addClash）も目に見える本物の打ち合いとして数える。
        real.clash = 0;
        for (const c of rt.world.clashes || []) {
          if (c.phase === 'wait') continue;
          const d = Math.hypot(c.x - p.x, c.z - p.z);
          if (d < 420 && (!real.clash || d < real.clashDist)) { real.clash = 1; real.clashDist = d; real.clashDx = c.x - p.x; real.clashDz = c.z - p.z; }
        }
        setFarBattle(real);
      }
      return Math.min(0.65, stats.farSoldiers / 200);
    },
  };
}
