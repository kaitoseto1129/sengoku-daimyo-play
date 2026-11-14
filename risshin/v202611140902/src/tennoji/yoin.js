// ======================================================================
// 天王寺の戦い　勝った後の余韻（最後の三十秒。b_tennoji.js の win から入れる）
// 史実：城戸口まで追い、二千七百余を討った。信長は足の傷のまま砦の周りに十の付城を築かせ、石山を囲み直す（公記巻九）。
// 遊び：勝鬨・閉まる木戸・遠い石山の鐘・信長と光秀の短い言葉で締め、三十秒で戦後の札へ進む。
// ======================================================================
import { sfx } from '../audio.js';

export const YOIN_SEC = 30;

export function install(rt) {
  const F = rt.flags, lord = !!rt.G.lord;
  const at = () => rt.player.u.pos;
  // 鬨は音で残し、短い締めの台詞を待ち列へ重ねない。
  rt.after(2.5, () => { rt.army.play?.('toki', { x: at().x, z: at().z }, 1.3); sfx('toki', 0.9); });
  rt.after(7, () => {
    F.kidoGate?.userData.closeGate();
    rt.say('本願寺の番兵', '木戸を閉めよ！', 1);
  });
  rt.after(.1, () => rt.say(lord ? '佐久間信盛' : '織田信長', lord ? '殿、御足の傷を。砦は救われました。' : '足の傷など、これしき。付城を十、築かせよ。', 3));
  rt.after(5, () => sfx('kane', 0.35));
  rt.after(3.5, () => rt.say('明智光秀', '砦は救われた。原田殿も浮かばれよう。', 3));
  rt.after(7.5, () => sfx('horagai', 0.5));
  F.yoin = true;
  return null;
}
