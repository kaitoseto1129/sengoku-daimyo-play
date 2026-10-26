// 初めの三戦は、足軽の基本操作だけを出す。身分や保存の進み具合には依存しない。
export function simpleControls(rt) {
  const key = rt?.def?.key;
  return key === 'inou' || key === 'okehazama' || key === 'moribe';
}
