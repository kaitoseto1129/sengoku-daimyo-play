// 読み込みや舞台の作り直しをせず、同じ兵・隊・任務・時限の参照を保って戻す。
// 形・材質・素材・音・画面は写さない。開戦時と、八秒おきの二点だけを持つ。
const memories = new WeakMap();
const ROOT_KEEP = new Set(['game', 'hud', 'camera', 'def', 'environmentSound', 'warVoices', 'freezer', 'frustum', 'projView']);

export function rememberBattle(rt, extra) {
  const blocked = new Set([...ROOT_KEEP].map((k) => rt[k]));
  blocked.add(rt.world?.def);
  blocked.add(rt.army?.batch);
  const keep = (o, k) => (o === rt && ROOT_KEEP.has(k)) || (o === rt.army && k === 'batch');
  const seen = new Set(), records = [];
  function visit(o) {
    if (!o || typeof o !== 'object' || seen.has(o) || blocked.has(o) ||
        ArrayBuffer.isView(o) || o instanceof ArrayBuffer || o.isMaterial || o.isTexture ||
        o.isBufferGeometry || o.isBufferAttribute || o.nodeType || o instanceof WeakMap || o instanceof WeakSet) return;
    seen.add(o);
    if (o.isObject3D) {
      // 模型の内部を歩かない。兵の姿勢は次の更新で描き直す。
      records.push({ o, kind: 'shape', pos: o.position.clone(), rot: o.quaternion.clone(),
        scale: o.scale.clone(), visible: o.visible, children: o.children.filter((c) => c.name !== 'unitBatch') });
      return;
    }
    if (o instanceof Map || o instanceof Set) {
      const entries = [...o]; records.push({ o, kind: o instanceof Map ? 'map' : 'set', entries });
      for (const e of entries) { if (o instanceof Map) { visit(e[0]); visit(e[1]); } else visit(e); }
      return;
    }
    const values = new Map();
    for (const k of Object.keys(o)) {
      if (keep(o, k)) continue;
      const d = Object.getOwnPropertyDescriptor(o, k);
      if (!d?.writable) continue;
      values.set(k, o[k]); visit(o[k]);
    }
    records.push({ o, kind: Array.isArray(o) ? 'array' : 'object', values, length: o.length });
  }
  visit(rt); visit(extra);
  return { time: rt.t, restore() {
    for (const r of records) {
      const o = r.o;
      if (r.kind === 'shape') {
        o.position.copy(r.pos); o.quaternion.copy(r.rot); o.scale.copy(r.scale); o.visible = r.visible;
        for (let i = o.children.length - 1; i >= 0; i--) if (o.children[i].name !== 'unitBatch' && !r.children.includes(o.children[i])) o.remove(o.children[i]);
        for (const child of r.children) if (child.parent !== o) o.add(child);
        o.updateMatrix(); o.updateMatrixWorld(true);
      } else if (r.kind === 'map' || r.kind === 'set') {
        o.clear(); for (const e of r.entries) { if (r.kind === 'map') o.set(e[0], e[1]); else o.add(e); }
      } else {
        for (const k of Object.keys(o)) {
          if (keep(o, k)) continue;
          const d = Object.getOwnPropertyDescriptor(o, k);
          if (!r.values.has(k) && d?.writable && d.configurable) delete o[k];
        }
        for (const [k, v] of r.values) o[k] = v;
        if (r.kind === 'array') o.length = r.length;
      }
    }
  } };
}

export function retryTick(rt, input, extra, dt) {
  let m = memories.get(rt);
  if (!m) {
    if (rt.def.town) return false;
    const start = rememberBattle(rt, extra);
    m = { start, recent: start, previous: start, next: rt.t + 8, dialog: null, accepting: false, input };
    memories.set(rt, m);
  }
  // 自動で出た札は時計を止めず、期限が来たら今の結果で進む。
  if (m.dialog) {
    m.left -= dt;
    if (m.left <= 0) m.accept();
    return false;
  }
  // 深手になる前の時点を残す。直前の八秒を必ず空け、戻った瞬間の同じ一撃を避ける。
  if (!rt.over && rt.player.u.alive && rt.player.u.hp >= rt.player.u.maxHp * 0.5 && rt.t >= m.next) {
    m.previous = m.recent; m.recent = rememberBattle(rt, extra); m.next = rt.t + 8;
  }
  return false;
}

export function offerRetry(rt, info, delay) {
  const m = memories.get(rt);
  if (!m || m.accepting) return false;
  if (m.dialog) return true;
  if (!info.down && rt.tracker.main !== false) return false;
  const d = document.createElement('dialog');
  d.className = 'battle-retry';
  d.style.cssText = 'position:fixed;inset:auto 8px 8px auto;margin:0;z-index:50;background:#14120f;color:#ece4d2;border:2px solid #c2a25a;border-radius:8px;padding:16px;box-sizing:border-box;width:min(360px,calc(48vw - 16px));max-height:60dvh;overflow:auto;font-size:16px;line-height:1.6';
  d.setAttribute('aria-labelledby', 'battle-retry-title');
  d.innerHTML = '<h2 id="battle-retry-title" style="font-size:24px;margin:0 0 8px"></h2><p data-cause style="margin:0 0 8px"></p><p style="font-size:13px;margin:0 0 16px">戻ると、その後の戦功や傷は戻ります。城下までの記録は残ります。読む間も戦は進みます。十五秒で、この結果のまま進みます。</p><div style="display:flex;flex-direction:column;gap:8px"><button class="btn primary" data-near style="min-height:48px">この場からやり直す（少し前の時点）</button><button class="btn" data-start style="min-height:48px">戦の始めから</button><button class="btn" data-result style="min-height:44px">この結果で進む</button></div>';
  d.querySelector('h2').textContent = info.down ? (info.dead ? '討死した' : '深手を負った') : '戦に負けた';
  d.querySelector('[data-cause]').textContent = info.down ? rt.downReason || rt.player.downCause(15) || '深手を負った。戦をやり直す時は、味方の列のそばに構えよう。' : info.failureReason || '味方の陣が崩れた。戦をやり直す時は、味方の陣のそばに構えよう。';
  m.dialog = d; m.left = 15; rt.retryOpen = true;
  window.speechSynthesis?.cancel();
  // 開戦の札や、自分で開いた一時停止の状態には触れない。
  document.body.appendChild(d); d.setAttribute('open', '');
  const close = () => { d.close(); d.remove(); m.dialog = null; m.accept = null; rt.retryOpen = false; };
  const restore = (point) => {
    close(); m.input.clear?.(); point.restore();
    // 未来の点へは戻さない。次の保存も、戻した戦の時刻から数える。
    m.recent = m.previous = point; m.next = rt.t + 8;
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
    rt.finish(info, delay);
  };
  d.querySelector('[data-result]').onclick = m.accept;
  return true;
}

export function disposeRetry(rt) {
  const m = memories.get(rt);
  if (m?.dialog) { m.dialog.close(); m.dialog.remove(); }
  memories.delete(rt); rt.retryOpen = false;
}
