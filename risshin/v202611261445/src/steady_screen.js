// 画面の上の名札・行き先の印を揺らさない（kaito 11/19「名前が上下に揺れるのはすごいストレス。本当にやめてほしい」）。
// 11/20 クラウドし：前の「3px 未満は止め、超えたら追う」は、ゆっくり動く点（毎秒十五 px ほど＝カメラの回しや歩み寄る敵）で
//   止まる→跳ぶ→止まるを繰り返し、かえって札がガクガク上下していた（試しの数え：一コマの揺れ 0.04→0.97px）。
//   止める幅を無くし、動きの速さで追う速さを変えるならし（ゆっくりの時は強くならし、速い時は遅れない）に替えた（同じ試し 0.08px）。
//   遠くへ跳んだ時（140px 超）と出し直しはすぐ合わせる。
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const follow = (dt, hz) => 1 - Math.exp(-dt * 2 * Math.PI * hz);
export function steadyPoint(s, x, y, out = s) {
  const t = now();
  // 同じコマの二つ目（別の印）は混ぜない：そのままの点を返す
  if (s.t != null && t - s.t < 4) { out.x = x; out.y = y; return out; }
  const dt = s.t == null ? 1 : Math.min(.1, (t - s.t) / 1000);
  s.t = t;
  if (s.x == null || dt > .25 || Math.abs(x - s.x) > 140 || Math.abs(y - s.y) > 140) { s.x = x; s.y = y; s.vx = 0; s.vy = 0; }
  else {
    const kv = follow(dt, 1);
    s.vx = (s.vx || 0) + ((x - s.x) / dt - (s.vx || 0)) * kv; s.vy = (s.vy || 0) + ((y - s.y) / dt - (s.vy || 0)) * kv;
    s.x += (x - s.x) * follow(dt, .7 + .02 * Math.abs(s.vx));
    s.y += (y - s.y) * follow(dt, .7 + .02 * Math.abs(s.vy));
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
