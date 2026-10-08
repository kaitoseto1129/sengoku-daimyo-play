// 傷は当たった時だけ入れ物を作り、戦の間は同じ物を使う。
const PARTS = ['head', 'neck', 'torso', 'shoulder', 'arm', 'thigh', 'leg'];
const NAMES = ['頭', '首', '胴', '肩', '腕', '腿', 'すね'];
const limit = (n, max = 1) => Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;

function fresh() {
  return { sites: Array(14).fill(0), broken: Array(14).fill(0), arrows: 0,
    bleed: 0, lost: 0, infection: 0, dirty: 0, scar: 0, part: 2, side: 0 };
}

export function woundHit(u, amount, part, side, kind, armor, world, source) {
  if (u.type === 'dummy' || u.isStruct || !(amount > 0)) return;
  const w = u.wounds || (u.wounds = fresh());
  const found = PARTS.indexOf(part), p = found >= 0 ? found : 2, s = side > 0 ? 1 : 0, at = p * 2 + s;
  if (source) u.woundSource = source;
  const deep = limit(amount / u.maxHp);
  w.part = p; w.side = s;
  w.sites[at] = limit(w.sites[at] + deep * (armor ? 0.25 : 1));
  // 甲冑の打撲は出血しない。重い叩き・弾で手足の骨が傷む。
  if ((kind === 'gun' || kind === 'slam' || kind === 'charge' || kind === 'butt') && deep >= 0.25 && p >= 3) {
    w.broken[at] = Math.max(w.broken[at], deep);
  }
  if (!armor && kind !== 'slam' && kind !== 'butt') {
    w.bleed = limit(w.bleed + deep * (p <= 2 ? 0.006 : 0.003), 0.004);
    if (kind === 'arrow') w.arrows = Math.min(24, w.arrows + 1);
    w.dirty = limit(w.dirty + deep * (world?.def?.muddy || world?.rainLevel > 0.3 ? 0.6 : 0.25));
  }
  woundEffects(u);
}

function woundEffects(u) {
  const w = u.wounds;
  if (!w) return;
  let legs = 0, arms = 0;
  for (let i = 6; i < 14; i++) {
    const hurt = Math.max(w.sites[i] * 0.5, w.broken[i]);
    if (i >= 10) legs = Math.max(legs, hurt); else arms = Math.max(arms, hurt);
  }
  u.woundSlow = Math.min(0.65, Math.max(legs, w.lost * 0.6, w.infection * 0.4, w.scar));
  u.armWound = Math.min(0.65, arms);
}

export function woundTick(u, dt) {
  const w = u.wounds;
  if (!w || !u.alive || u.gone || !(dt > 0)) return;
  // 遊び手は出血だけでは倒れない。斬撃などで十未満になった時も回復はさせない。
  // 新たな傷がなければ二十秒で出血が半分になる。最大でも追加の失血は約一割。
  // 下限へ達しても血は止まっていく。新しい一撃では woundHit が再び出血を足す。
  const step = Math.min(1, dt), decay = Math.LN2 / 20;
  const next = u.isPlayer ? w.bleed * Math.exp(-decay * step) : w.bleed;
  const drained = u.isPlayer ? (w.bleed - next) / decay : step * w.bleed;
  const loss = u.isPlayer ? Math.min(drained, Math.max(0, u.hp - 10) / u.maxHp) : drained;
  if (u.isPlayer) w.bleed = next > 0.0001 ? next : 0;
  if (loss > 0) {
    w.lost = limit(w.lost + loss);
    u.hp = Math.max(0, u.hp - u.maxHp * loss);
    woundEffects(u);
  }
}

export function bindWound(u) {
  if (u.wounds) u.wounds.bleed *= 0.1;
}

export function woundText(u) {
  const w = u.wounds;
  if (!w) return '';
  if (w.bleed > 0.0001) return `出血${w.lost >= 0.1 ? '多い' : ''}`;
  if (w.infection > 0.1) return '傷が腫れ、熱';
  const at = w.part * 2 + w.side;
  return `${w.part >= 3 ? w.side ? '右' : '左' : ''}${NAMES[w.part]}${w.broken[at] > 0.1 ? 'の骨の傷' : 'に傷'}${w.arrows ? '・矢が残る' : ''}`;
}

// 保存の仕組みには触れず、進行データの追加項目として傷を渡す。
export function rememberWounds(G, u, def) {
  if (G.practice || def.dojo || def.town) return;
  const w = u.wounds;
  if (!w && u.hp >= u.maxHp) return;
  const saved = w ? JSON.parse(JSON.stringify(w)) : fresh();
  saved.hp = Math.max(0, Math.min(1, u.hp / u.maxHp));
  // 感染は直後の数秒では起こさず、手当てしない傷が戦後に腫れる。
  saved.infection = limit(saved.infection + saved.dirty * 0.3);
  saved.scar = Math.max(saved.scar, Math.max(...saved.broken, ...saved.sites) * 0.2);
  saved.scar = Math.min(0.2, saved.scar);
  G.wounds = saved;
}

export function restoreWounds(G, u, def) {
  const saved = G.wounds;
  if (!saved || G.practice || def.dojo || def.town) return;
  const w = fresh();
  for (let i = 0; i < 14; i++) {
    w.sites[i] = limit(saved.sites?.[i]); w.broken[i] = limit(saved.broken?.[i]);
  }
  for (const key of ['lost', 'infection', 'dirty', 'scar']) w[key] = limit(saved[key]);
  w.bleed = limit(saved.bleed, 0.004); w.arrows = Math.floor(limit(saved.arrows, 24));
  w.part = Math.floor(limit(saved.part, 6)); w.side = saved.side === 1 ? 1 : 0;
  u.wounds = w;
  u.hp = u.maxHp * Math.max(0.1, Math.min(1 - w.scar, Number.isFinite(saved.hp) ? saved.hp : 1));
  woundEffects(u);
}

export function restWounds(G) {
  G.injured = false;
  const w = G.wounds;
  if (!w) return;
  // 宿での療養。矢は傷口を開いて取り出すので、戦場で引き抜かない。
  w.arrows = 0; w.bleed = 0; w.dirty = 0;
  w.infection = Math.max(0, w.infection - 0.25); w.lost *= 0.4;
  for (let i = 0; i < 14; i++) { w.sites[i] *= 0.4; w.broken[i] *= 0.65; }
  w.hp = Math.min(1 - w.scar, Math.max(0.35, w.hp || 0) + 0.25);
}
