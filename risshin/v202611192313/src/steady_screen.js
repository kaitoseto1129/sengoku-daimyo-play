// 画面の上の名札・行き先の印を揺らさない（kaito 11/19「名前が上下に揺れるのはすごいストレス。本当にやめてほしい」）。
// 歩きの上下・カメラの小さな揺れ・重なり避けの段替えで点が数 px ずつ跳ねるのを、
// 小さな揺れは止め（3px 未満は動かさない）、大きな動きはなめらかに追う。遠くへ跳んだ時（140px 超）と出し直しはすぐ合わせる。
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
export function steadyPoint(s, x, y, out = s) {
  const t = now();
  // 同じコマの二つ目（別の印）は混ぜない：そのままの点を返す
  if (s.t != null && t - s.t < 4) { out.x = x; out.y = y; return out; }
  const dt = s.t == null ? 1 : Math.min(.1, (t - s.t) / 1000);
  s.t = t;
  if (s.x == null || dt > .25 || Math.abs(x - s.x) > 140 || Math.abs(y - s.y) > 140) { s.x = x; s.y = y; }
  else {
    const a = 1 - Math.exp(-dt * 12);
    if (Math.abs(x - s.x) >= 1.5) s.x += (x - s.x) * a;
    if (Math.abs(y - s.y) >= 3) s.y += (y - s.y) * a;
  }
  out.x = s.x; out.y = s.y;
  return out;
}

// 頭の骨の高さは歩み・打ち込み・手を上げる動きで一コマごとに上下する。名札と頭上の印はその高さを
// 足もとからの高さとしてゆっくり（〇・四五秒）ならして使う（kaito_now 1「名札とピンが上下に揺れない」）。
// 同じコマの二度目の問いは同じ値を返す。半秒呼ばれなかった後と、大きく違う姿勢（一m 超）はすぐ合わせる。
export function steadyHeadY(u, worldY) {
  const t = now(), rel = worldY - (u.pos.y || 0), s = u._steadyHead || (u._steadyHead = { t: null, rel });
  const dt = s.t == null ? 1 : (t - s.t) / 1000;
  if (s.t == null || dt > .5 || Math.abs(rel - s.rel) > 1) s.rel = rel;
  else if (dt > .004) s.rel += (rel - s.rel) * (1 - Math.exp(-dt / .45));
  if (dt > .004 || s.t == null) s.t = t;
  return (u.pos.y || 0) + s.rel;
}
