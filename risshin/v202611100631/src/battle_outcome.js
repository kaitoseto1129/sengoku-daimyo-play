// 歴史で負ける戦は「合戦結果」と「任務結果」を分けて出す（docs/rank_interlude_retry_spec_1108.md 3・kaito 11/8）。
// 合戦は史実どおり負けても、自分の任務（守る・救う・退く）を果たせば任務は成功。星も任務の目標で数える（goals5.js）。
export const HIST_OUTCOME = {
  k01_fushimi: { battle: '伏見城 落城', mission: '城で時を稼ぐ' },
  k04_kuisegawa: { battle: '東軍の敗北', mission: '味方を救って退く' },
  k05_ueda: { battle: '上田城攻略 失敗・真田軍 健在', mission: '撤収 成功・西上 開始' },
  k11_sanadamaru: { battle: '真田丸 攻略失敗・徳川軍 撤収', mission: '味方部隊撤収' },
  sanadamaru: { battle: '真田丸 攻め落とせず', mission: '兵を退かせる' },
  mikatagahara: { battle: '会戦 敗北', mission: '家康を生きて帰す' },
  t06_hetsugi: { battle: '会戦 敗北', mission: '生きて退く' },
  t03b_nagakute: { battle: '長久手 羽柴軍敗北', mission: '細ヶ根まで退く' },
  tedorigawa: { battle: '織田軍 敗北', mission: '手取川を渡り、退く' },
  t10_oshi: { battle: '水攻め 攻略ならず（小田原開城で忍城も開城）', mission: '堤と陣を守る' },
};
// 結果の二行（字は短く。合戦・任務の順）
export function outcomeLines(id, missionDone) {
  const h = HIST_OUTCOME[id];
  if (!h) return null;
  return [`合戦結果　${h.battle}`, `任務結果　${h.mission}　${missionDone ? '成功' : '失敗'}`];
}
