import { qualityThink } from './army_quality.js';

// 門や塀は pos ではなく線分を持つ。攻城中も判断を進め、兵と同じ座標を読まない。
function closeThinkingTarget(u) {
  const target = u.target;
  return !!(target?.alive && (target.isStruct || target.pos &&
    Math.hypot(u.pos.x - target.pos.x, u.pos.z - target.pos.z) < Math.max(14, (u.reach || 0) + 8)));
}

// 判断だけを予算内で進める。足・攻撃・描画の時計は呼び出し側で毎コマ進める。
export function combatThinking(u, dist) {
  return dist <= 30 || u.isPlayer || u.name || u.isSub || u.type === 'busho' || u.atk || u.swing || u.bind ||
    u.charging || u.hit || u.stagger > 0 || u.fleeing || u.group?.routed ||
    closeThinkingTarget(u);
}

export function thinkingPhase(u, dist, frame) {
  const every = combatThinking(u, dist) ? 1 : dist > 80 ? 4 : 2;
  return frame % every === u.id % every;
}

function priority(u, dist) {
  if (u.atk || u.swing || u.bind || u.charging || u.hit || u.stagger > 0 ||
      closeThinkingTarget(u)) return 0;
  if (dist <= 30) return 1;
  if (!u.offscreen) return 2;
  if (u.name || u.isSub || u.type === 'busho') return 3;
  return dist <= 80 ? 4 : 5;
}
const byPriority = (a, b) => a.thinkPriority - b.thinkPriority || a.thinkSerial - b.thinkSerial;

export class ThinkBudget {
  constructor() {
    this.queue = [];
    this.serial = 0;
    this.ms = 0;
    this.done = 0;
    this.deferred = 0;
    this.limit = 5.5;
  }

  add(u, shared = false) {
    if (u.thinkQueued) { u.thinkShared = u.thinkShared && shared; return; }
    u.thinkShared = shared;
    u.thinkQueued = true;
    u.thinkSerial = this.serial++;
    this.queue.push(u);
  }

  run(army) {
    const queue = this.queue;
    const start = performance.now();
    for (const u of queue) u.thinkPriority = priority(u, Math.min(u.focusD ?? Infinity, u.camD ?? Infinity));
    queue.sort(byPriority);
    let keep = 0;
    this.done = 0;
    for (let i = 0; i < queue.length; i++) {
      const u = queue[i], dist = Math.min(u.focusD ?? Infinity, u.camD ?? Infinity);
      if (!u.alive || u.dying || u.gone || u.dragging || u.isPlayer || u.type === 'dummy' ||
          u.farSim || u.qualityAbstract || u.jinchu && !u.jinchu.danger) { u.thinkQueued = false; continue; }
      if (performance.now() - start >= this.limit || !thinkingPhase(u, dist, army.frameNo)) {
        queue[keep++] = u;
        continue;
      }
      if (u.thinkShared) qualityThink(army, u, true);
      else army.thinkNow(u);
      u.thinkQueued = false;
      this.done++;
    }
    queue.length = keep;
    this.ms = performance.now() - start;
    this.deferred = keep;
  }
}
