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
