#!/bin/bash
# 戦国大名のテストプレイヤーの道具を、作る所（~/code/sengoku-daimyo/src）からこの daimyo-bot/ へ写す。
# 遊び手の頭（playbot.js など）を直したら、これを走らせて push する。遊ぶ頁は公開中の index.html を使う（写さない）
set -e
S=${SRC:-$HOME/code/sengoku-daimyo/src}; D="$(cd "$(dirname "$0")" && pwd)"
cp "$S/harness.js" "$S/srv.py" "$D/"
for f in cdp.py playbot.py playbot.js genpersonas.py persona_base.json mergeall.py; do cp "$S/tools/test/$f" "$D/"; done
echo "写した：$D"
