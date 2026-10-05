// 音が地形と風を通って届く道筋。音を鳴らす時だけ調べ、入れ物は使い回す。
export function createSoundPath() {
  return { distance: 0, delay: 0, gain: 1, cutoff: 20000, echoDelay: 0, echoGain: 0 };
}

export function sampleSoundPath(world, source, listener, wind, path, distance = 0) {
  path.distance = Math.max(0, distance);
  path.delay = path.distance / 343;
  path.gain = 1; path.cutoff = 11000 / (1 + path.distance / 55);
  path.echoDelay = 0; path.echoGain = 0;
  if (!world || !source || !listener) return path;
  const dx = listener.x - source.x, dz = listener.z - source.z;
  const horizontal = Math.hypot(dx, dz);
  // 兵の座標は足元。発音点と耳を地面から持ち上げる。
  const sy = Math.max(source.y || 0, world.heightAt(source.x, source.z)) + 1.5;
  const ly = Math.max(listener.y || 0, world.heightAt(listener.x, listener.z) + 1.6);
  const direct = Math.hypot(horizontal, ly - sy);
  path.distance = direct;
  const strength = wind ? Math.max(0, Math.min(2, wind.gust)) : 0;
  const along = horizontal && wind ? (dx * wind.dirX + dz * wind.dirZ) / horizontal : 0;
  // 旗・煙と同じ風。風上へ進む音は高い成分が失われやすい。
  const speed = 343 + along * strength * (world.timeKey === 'storm' ? 8 : 3);
  const shadow = Math.max(0, -along) * strength * horizontal / (horizontal + 80);
  path.gain = 1 / (1 + shadow * 1.8);
  path.cutoff = 11000 / (1 + direct / 55) / (1 + shadow * 2.5);
  let ridge = 0, extra = 0;
  // 八点だけで尾根の遮りを近似。山越しでは低い成分だけが回り込む。
  if (horizontal > 18) for (let i = 1; i <= 8; i++) {
    const t = i / 9, h = world.heightAt(source.x + dx * t, source.z + dz * t);
    const above = h - (sy + (ly - sy) * t);
    if (above > ridge) {
      ridge = above;
      extra = Math.hypot(horizontal * t, h - sy) + Math.hypot(horizontal * (1 - t), h - ly) - direct;
    }
  }
  path.delay = (direct + extra) / speed;
  path.gain /= 1 + ridge * 0.18;
  path.cutoff = Math.max(220, path.cutoff / (1 + ridge * 0.3));
  // 道の両脇の斜面を調べる。平地には山のこだまを足さない。
  if (horizontal > 25) {
    const mx = (source.x + listener.x) * 0.5, mz = (source.z + listener.z) * 0.5;
    const base = world.heightAt(mx, mz), span = Math.min(100, Math.max(25, horizontal * 0.3));
    for (let side = -1; side <= 1; side += 2) {
      const x = mx - dz / horizontal * span * side, z = mz + dx / horizontal * span * side;
      // 地形の外側は端の高さで埋められるので反射面に数えない。
      if (world.half && (Math.abs(x) >= world.half || Math.abs(z) >= world.half)) continue;
      const h = world.heightAt(x, z), rise = h - base;
      if (rise <= 6) continue;
      const reflected = Math.hypot(x - source.x, z - source.z, h - sy) + Math.hypot(listener.x - x, listener.z - z, ly - h);
      const delay = reflected / speed - path.delay;
      const gain = Math.min(0.3, (rise - 6) / 100) * direct / reflected;
      if (delay > 0.035 && gain > path.echoGain) { path.echoDelay = delay; path.echoGain = gain; }
    }
  }
  return path;
}
