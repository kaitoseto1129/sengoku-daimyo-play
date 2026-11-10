// ======================================================================
// 第二次木津川口 ①の段：大筒で寄る小早を払う（約2分40秒〜5分40秒）
// 構成：docs/oda15_plan_1108.md の 25（3〜6 遠距離砲撃・鉄砲・船団接触）。
// 段の中ほどで、村上の小早が南へ回り、鉄砲船が撃ちかける。終わりに焙烙の煙が見え、②（火）への伏線にする。
// 段の長さは HOUGEKI_LEN（敵の体力は増やさない。寄せる船の数と間合いで埋める）。
// ======================================================================
export const HOUGEKI_LEN = 180;

export function tick(rt, ctx, elapsed) {
  const F = rt.flags;
  const S = F.kzHou || (F.kzHou = { a: false, b: false });
  if (!S.a && elapsed >= 75) {
    S.a = true;
    rt.say('物見', '村上の小早が南へ回るぞ！　鉄砲船も寄せて来る！', 3.5);
    rt.army.playFar('sig_kakari_taiko', { x: -40, z: 70 }, 0.8);
    ctx.surge(rt);
    // 鉄砲の音は舟上の射手が実際に撃った時に鳴らす。退く船や沈み始めた船から空の銃声を出さない。
  }
  if (!S.b && elapsed >= 140) {
    S.b = true;
    rt.say('九鬼嘉隆', '小早の上に火の粉が見える。焙烙を投げて来るぞ、水桶を寄せておけ！', 4);
    for (const b of F.boats) if (b.alive && !b.big && !b.supply && !b.damageStage) { rt.army.smoke(b.x, 1.5, b.z, 0, 0, 1.6); break; }
  }
  return elapsed >= HOUGEKI_LEN && F.cannonHits >= 1;
}
