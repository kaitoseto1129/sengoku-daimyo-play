// 買った素材の箱（asset_cgt.js）の鍵の流れ。作る道具（tools/cgt_kit.mjs）と読む側（cgt.js）で同じ物を使う。
// xorshift32 を決まった種から回し、一回ごとに下の 8 ビットを一つずつ使う（長さ n の Uint8Array を返す）。
export function cgtKey(n) {
  const k = new Uint8Array(n);
  let s = 0x5e1c0a73 >>> 0;
  for (let i = 0; i < n; i++) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    k[i] = (s ^ (s >>> 11)) & 255;
  }
  return k;
}
