// 読み込みや舞台の作り直しをせず、同じ兵・隊・任務・時限の参照を保って戻す。
// 形・材質・素材・音・画面は写さない。開戦時と、十二秒おきの二点だけを持つ。
const memories = new WeakMap();
const HUMAN_KEYS = new Set(['human', '_humanBuild', '_humanBuildLook', '_hq', 'humanPending']);
const ROOT_KEEP = new Set(['game', 'hud', 'camera', 'def', 'environmentSound', 'warVoices', 'warSpeech', 'freezer', 'frustum', 'projView']);

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
  // 舞台の動かない表（草木の間引きの升・近い草の置き場・矢が刺さる木の箱・木の点）は数千の物。戻す物ではないので写さない
  for (const k of ['cullList', 'nearOff', 'missileWood', 'treePoints']) if (rt.world?.[k]) blocked.add(rt.world[k]);
  const keep = (o, k) => (o === rt && ROOT_KEEP.has(k)) || (o === rt.army && k === 'batch');
  const seen = new Set(), records = [], byObject = new Map(), stack = [extra, rt], time = rt.t;
  // 参照の索引も一ミリ秒の枠で作る。最後に全記録を反転・再走査する山を残さない。
  function record(r) { records.push(r); byObject.set(r.o, r); }
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
      const r = prevOf(o);
      if (r && r.kind === 'shape' && r.visible === o.visible && r.pos.equals(o.position) && r.rot.equals(o.quaternion) && r.scale.equals(o.scale) && sameList(r.children, children)) { record(r); return; }
      record({ o, kind: 'shape', pos: o.position.clone(), rot: o.quaternion.clone(),
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
    const shallow = !!(o.root && o.root.userData && o.root.userData.hum === o);
    const keys = Object.keys(o), r = prevOf(o);
    // 兵の骨入りの人（u.human）と作りかけ（_humanBuild）は写さず、戻す時も今の物をそのまま使う。
    //   写すと、捨てた人（evictHidden）が三つの写しに残り続ける（森部 70 秒で生きている人 80 に対し mixer 148・骨 1 万。10/20）。
    //   姿勢と動きは戻した次の更新で u の状態から描き直される
    const isUnit = 'human' in o && 'mesh' in o && 'pos' in o;
    // 前の写しと同じ鍵・同じ値なら、前の記録をそのまま使う（中の物はこれまでどおりたどる）
    if (r && r.values && r.length === o.length) {
      let n = 0, same = true;
      for (const k of keys) {
        if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d?.writable) continue;
        n++;
        if (!r.values.has(k) || r.values.get(k) !== o[k]) { same = false; break; }
      }
      if (same && n === r.values.size) {
        record(r);
        if (!shallow) for (const v of r.values.values()) if (v && typeof v === 'object') stack.push(v);
        return;
      }
    }
    const values = new Map();
    for (const k of keys) {
      if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (!d?.writable) continue;
      const v = o[k];
      values.set(k, v); if (!shallow && v && typeof v === 'object') stack.push(v);
    }
    record({ o, kind: Array.isArray(o) ? 'array' : 'object', values, length: o.length });
  }
  // budgetMs ずつ進める。終われば写し（restore を持つ物）を返し、まだなら null
  return { step(budgetMs) {
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
  prevMap = null; seen.clear(); blocked.clear(); stack.length = 0;
  return { time, byObject, restore() {
    // 記録の順は変えず、戻す時だけ末尾からたどって従来の復元順を保つ。
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i], o = r.o;
      if (r.kind === 'shape') {
        o.position.copy(r.pos); o.quaternion.copy(r.rot); o.scale.copy(r.scale); o.visible = r.visible;
        if (r.children !== o.children) {
          for (let i = o.children.length - 1; i >= 0; i--) if (o.children[i].name !== 'unitBatch' && !r.children.includes(o.children[i])) o.remove(o.children[i]);
          for (const child of r.children) if (child.parent !== o) o.add(child);
        }
        o.updateMatrix(); o.updateMatrixWorld(true);
      } else if (r.kind === 'map' || r.kind === 'set') {
        o.clear(); for (const e of r.entries) { if (r.kind === 'map') o.set(e[0], e[1]); else o.add(e); }
      } else {
        const isUnit = 'human' in o && 'mesh' in o && 'pos' in o;
        for (const k of Object.keys(o)) {
          if (keep(o, k) || (isUnit && HUMAN_KEYS.has(k))) continue;
          const d = Object.getOwnPropertyDescriptor(o, k);
          if (!r.values.has(k) && d?.writable && d.configurable) delete o[k];
        }
        for (const [k, v] of r.values) o[k] = v;
        if (r.kind === 'array') o.length = r.length;
      }
    }
  } };
  }
}
export function rememberBattle(rt, extra) { return startRemember(rt, extra).step(0); }
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

export function retryTick(rt, input, extra, dt) {
  let m = memories.get(rt);
  if (!m) {
    if (rt.def.town) return false;
    const start = rememberBattle(rt, extra);
    m = { start, recent: start, previous: start, next: rt.t + 12, dialog: null, accepting: false, input };
    memories.set(rt, m);
  }
  // 倒れた動きを同じ視点で一秒見せてから札を開く。
  if (m.pending) {
    m.pending.left -= dt;
    if (m.pending.left <= 0) {
      const pending = m.pending; m.pending = null;
      offerRetry(rt, pending.info, pending.delay);
    }
    return !!rt.def.pauseRetry && !!m.dialog;
  }
  // 選ぶ間に戦況を止める戦でも、札自身の期限は進める。
  if (m.dialog) {
    m.left -= dt;
    if (m.left <= 0) m.accept();
    return !!rt.def.pauseRetry && !!m.dialog;
  }
  // 深手になる前の時点を残す。直前の八秒を必ず空け、戻った瞬間の同じ一撃を避ける。
  if (m.job) {
    const done = m.job.step(1.0);   // 一ミリ秒ずつ。終わるまで前の写しを残す
    if (done) { m.previous = m.recent; m.recent = done; m.next = rt.t + 12; m.job = null; }
  } else if (!rt.over && rt.player.u.alive && rt.player.u.hp >= rt.player.u.maxHp * 0.5 && rt.t >= m.next) {
    m.job = startRemember(rt, extra, m.recent);
  }
  return false;
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
  const next = rt.def.retryAdvice?.(rt, info) || (info.down ? hit?.kind === 'fire' ? '火から離れ、燃えていない所へ' : hit?.ranged ? '物かげで 矢玉を よけよう' : 'かまえて 一撃を ふせごう'
    : /本陣に 敵が入った|入られた|止めきれ/.test(reason) ? '旗のそばで まもろう' : '旗の印を たどろう');
  return `${reason}\n${next}`;
}

export function offerRetry(rt, info, delay) {
  const m = memories.get(rt);
  if (!m || m.accepting) return false;
  if (m.dialog || m.pending) {
    // 攻め止めの札を読んでいる間に倒れた時も、実際の傷と理由を結果へ渡す。
    if (info.down) {
      if (m.pending) { m.pending.info = info; m.pending.delay = delay; }
      else {
        m.info = info; m.delay = delay;
        m.dialog.querySelector('h2').textContent = info.dead ? '命を落とした' : '傷で戦えない';
        m.dialog.querySelector('[data-reason]').textContent = retryText(rt, info);
      }
    }
    return true;
  }
  if (!info.down && rt.tracker.main !== false) return false;
  if (info.down && !m.downShown) {
    m.downShown = true; m.pending = { info, delay, left: rt.index === 0 ? 0.6 : 1.2 }; rt.retryOpen = true;
    return true;
  }
  const first = rt.index === 0 && !rt.G.lord && !rt.def.dojo;
  const d = document.createElement('dialog');
  d.className = 'battle-retry';
  d.style.cssText = 'position:fixed;margin:0;z-index:50;background:#14120f;color:#ece4d2;border:2px solid #c2a25a;border-radius:8px;box-sizing:border-box;width:min(304px,calc(100vw - 24px));padding:12px;max-height:calc(100dvh - 24px)';
  d.setAttribute('aria-labelledby', 'battle-retry-title');
  d.innerHTML = '<h2 id="battle-retry-title" style="font-size:20px;margin:0"></h2><p data-reason style="white-space:pre-line;font-size:max(20px, calc(20px * var(--text-scale, 1)));line-height:1.5;margin:8px 0"></p><div class="retry-actions" style="display:flex;flex-direction:column;gap:8px"><button class="btn primary" data-near style="min-height:44px">少し前から やり直す</button><button class="btn" data-start style="min-height:44px">最初から やり直す</button><button class="btn" data-result style="min-height:44px">結果を見る</button></div><div class="retry-reading" hidden><p data-cause></p><p></p></div>';
  d.querySelector('h2').textContent = info.down ? (info.dead ? '命を落とした' : '傷で戦えない') : '戦に負けた';
  d.querySelector('[data-reason]').textContent = retryText(rt, info);
  m.dialog = d; m.info = info; m.delay = delay; m.left = first ? Infinity : 15; rt.retryOpen = true;
  window.speechSynthesis?.cancel();
  // 開戦の札や、自分で開いた一時停止の状態には触れない。
  document.body.appendChild(d); d.setAttribute('open', '');
  const close = () => { d.close(); d.remove(); m.dialog = null; m.accept = null; rt.retryOpen = false; };
  const restore = (point) => {
    close(); m.downShown = false; m.job = null; m.input.clear?.(); point.restore();
    // 未来の点へは戻さない。次の保存も、戻した戦の時刻から数える。
    m.recent = m.previous = point; m.next = rt.t + 12;
    rt.game.G = rt.G; rt.game.hitstop = rt.game.slowmo = 0;
    rt.hud.reset(); if (rt.choice) rt.hud.renderChoice(rt.choice);
    rt.game.resumeBattleRetry();
    rt.player.updateCamera(1, rt.camera); rt.hud.update(0, rt);
    rt.game.requestLock();
  };
  d.querySelector('[data-near]').onclick = () => restore(rt.t - m.recent.time >= 8 ? m.recent : m.previous);
  d.querySelector('[data-start]').onclick = () => restore(m.start);
  m.accept = () => {
    close(); m.accepting = true;
    rt.finish(m.info, m.delay);
  };
  d.querySelector('[data-result]').onclick = m.accept;
  if (first) {
    if (document.pointerLockElement) document.exitPointerLock?.();
    m.input.clear?.();
    d.querySelector('[data-near]').focus({ preventScroll: true });
  }
  return true;
}

export function disposeRetry(rt) {
  const m = memories.get(rt);
  if (m?.dialog) { m.dialog.close(); m.dialog.remove(); }
  memories.delete(rt); rt.retryOpen = false;
}
