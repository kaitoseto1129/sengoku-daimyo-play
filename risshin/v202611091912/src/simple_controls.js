// 初めの三戦は、足軽の基本操作だけを出す。身分や保存の進み具合には依存しない。
// 三戦の def は missionStyle を持つ（b_inou・b_okehazama・b_moribe）。戦の名では分けない。
export function simpleControls(rt) {
  return !!rt?.def?.missionStyle;
}
