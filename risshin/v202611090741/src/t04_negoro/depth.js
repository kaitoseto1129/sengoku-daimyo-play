// 根来寺の陣立て（docs/generals_toyo_toku_1108.md の 6）。谷の道に沿う長蛇。本物の隊（秀次の先手・筒井・堀・仙石）に結び、
// 必須の秀吉・秀長・中村一氏と出したい蜂須賀は、谷の口の後ろと左右の山裾に軽い備で散らす（寺の門前に集めない）。
export function negoroDepth(NG) {
  const { P, ROT } = NG, F = (k) => (rt) => rt.flags[k];
  return {
    A: { name: '羽柴', facing: ROT, honjin: P(0, -250), mpu: 4, formation: '長蛇', terrain: 'valley', flag: 'toyotomi', armor: 0x2a2420, uma: 'fukube', openAt: 9999, attrition: 0,
      sonae: [
        { id: 'hidetsugu', layer: 'sakite', wing: 'center', men: 3000, taisho: '羽柴秀次', bind: F('vanG') },
        { id: 'tsutsui', layer: 'ichi', wing: 'right', men: 3000, taisho: '筒井定次', flag: 'umebachi', bind: F('tsutsuiG') },
        { id: 'hori', layer: 'ichi', wing: 'left', men: 3000, taisho: '堀秀政', flag: 'hori', bind: F('horiG') },
        { id: 'sengoku', layer: 'ni', wing: 'right', men: 2000, taisho: '仙石秀久', bind: F('sengokuG') },
        { id: 'nakamura', layer: 'ni', wing: 'left', men: 4000, taisho: '中村一氏', at: P(-70, -190), hold: true },
        { id: 'hachisuka', layer: 'yobi', wing: 'right', men: 3000, taisho: '蜂須賀正勝', flag: 'hachisuka', at: P(70, -205), hold: true },
        { id: 'hidenaga', layer: 'yobi', wing: 'center', men: 10000, taisho: '羽柴秀長', at: P(-30, -235), hold: true },
        { id: 'hatamoto', layer: 'hatamoto', wing: 'center', men: 10000, taisho: '羽柴秀吉', at: P(10, -262), hold: true },
      ] },
    honjinView: { A: true },
  };
}
