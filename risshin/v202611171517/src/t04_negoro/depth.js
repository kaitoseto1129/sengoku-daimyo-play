// 根来寺の陣立て（docs/generals_toyo_toku_1108.md の 6）。谷の道に沿う長蛇。本物の隊（秀次の先手・筒井・堀・仙石）に結び、
// 必須の秀吉・秀長・中村一氏と出したい蜂須賀は、谷の口の後ろと左右の山裾に軽い備で散らす（寺の門前に集めない）。
export function negoroDepth(NG) {
  const { P, ROT } = NG, F = (k) => (rt) => rt.flags[k];
  return {
    A: { name: '羽柴', facing: ROT, honjin: P(-8, -188), mpu: 4, formation: '長蛇', terrain: 'valley', flag: 'toyotomi', armor: 0x2a2420, uma: 'fukube', openAt: 9999, attrition: 0,
      // 11/18 クラウド act bot：谷の奥の後詰（蜂須賀 (-211,49)・秀長 (-184,150)・本陣 (-212,132)）が戦場の端（176）の外に置かれ、
      //   兵が端で一点に重なり・端へ飛んだ。並び（左・右・中・奥）は変えず、谷の口の後ろへ縮めた
      sonae: [
        { id: 'hidetsugu', layer: 'sakite', wing: 'center', men: 3000, taisho: '羽柴秀次', bind: F('vanG') },
        { id: 'tsutsui', layer: 'ichi', wing: 'right', men: 3000, taisho: '筒井定次', flag: 'umebachi', bind: F('tsutsuiG') },
        { id: 'hori', layer: 'ichi', wing: 'left', men: 3000, taisho: '堀秀政', flag: 'hori', bind: F('horiG') },
        { id: 'sengoku', layer: 'ni', wing: 'right', men: 2000, taisho: '仙石秀久', bind: F('sengokuG') },
        { id: 'nakamura', layer: 'ni', wing: 'left', men: 4000, taisho: '中村一氏', at: P(-70, -190), hold: true },
        { id: 'hachisuka', layer: 'yobi', wing: 'right', men: 3000, taisho: '蜂須賀正勝', flag: 'hachisuka', at: P(60, -160), hold: true },   // 11/17 クラウド kaito2（見回り）：P(70,-205) はゲームの (-211,49) で兵の歩ける枠（176）の外。始めに縁へ一息で飛び、九人が重なって止まった（act bot）→ (-168,34) に
        { id: 'hidenaga', layer: 'yobi', wing: 'center', men: 10000, taisho: '羽柴秀長', at: P(-30, -200), hold: true },   // 11/17 クラウド kaito2：P(-30,-235)＝(-184,150) は枠の外で縁へ飛んだ→ (-154,131)
        { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 10000, taisho: '羽柴秀吉', at: P(0, -196), hold: true },   // 同じく P(10,-262)＝(-228,130) は枠の外→ 枠の内の後ろ
      ] },
    // 根来衆（docs/fujin/t04_negoro.md）：主力は和泉の城々へ出ていて、寺に残ったのは行人方と雑賀の加勢およそ千五百。勝つと fallB で崩れる
    B: { name: '根来衆', facing: Math.PI + ROT, honjin: P(-40, 108), mpu: 4, formation: '長蛇', terrain: 'valley', flag: 'maru', armor: 0x302a24, openAt: 9999, attrition: 0,
      sonae: [
        { id: 'inner', layer: 'ichi', wing: 'center', men: 300, taisho: '', bind: F('innerG') },
        { id: 'saika', layer: 'sakite', wing: 'left', men: 500, taisho: '', flag: 'yatagarasu', at: P(-52, -22), hold: true },
        { id: 'oku', layer: 'honjin', wing: 'center', men: 700, taisho: '', at: P(-40, 108), hold: true },
      ] },
    honjinView: { A: true, B: false },
  };
}
