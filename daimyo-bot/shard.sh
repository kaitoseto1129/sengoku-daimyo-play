#!/bin/bash
# GitHub のランナーで一組（shard）を遊ばせる。置き場の一番上で走らせる
# 環境: START SHARD PER JOBS DAYS PLAYS PSEC JOBMIN SC CLANS
set -u
ROOT=$(pwd); SITE=$ROOT/site; OUT=$ROOT/out
mkdir -p "$SITE/tools/test" "$OUT"
# 遊ぶ頁：公開中の index.html。広告の計測（pixel の塊）は、この写しからだけ外す（置き場の index.html と pixel.html は触らない）
sed '/<!-- pixel:/,/<!-- \/pixel -->/d' index.html > "$SITE/tenkafubu.html"
cp daimyo-bot/harness.js daimyo-bot/srv.py "$SITE/"
cp daimyo-bot/cdp.py daimyo-bot/playbot.py daimyo-bot/playbot.js daimyo-bot/genpersonas.py daimyo-bot/persona_base.json "$SITE/tools/test/"
python3 "$SITE/tools/test/genpersonas.py" >/dev/null
LIST=$(python3 daimyo-bot/pick.py "$SITE/tools/test/personas.json" "$START" "$SHARD" "$PER")
T0=$(date +%s)
slot_run(){
  local slot=$1; shift
  for p in "$@"; do
    local left=$(( JOBMIN * 60 - ( $(date +%s) - T0 ) ))
    if [ $left -lt 120 ]; then echo "$(date -u +%FT%T) $p：時間が足りないので遊ばない" >> "$OUT/loop.log"; continue; fi
    local to=$PSEC; [ $left -lt $to ] && to=$left
    echo "[$(date -u +%H:%M)] 席${slot} $p（${to}秒まで）"
    ( cd "$SITE" && CI=1 CDP_PORT=$((${PORT0:-9433}+slot)) BPORT=$((${BPORT0:-8733}+slot)) PERSONA=$p SC=$SC CLANS=$CLANS OUTJSON="$OUT/$p.json" \
      timeout -k 20 $to python3 tools/test/playbot.py "$PLAYS" "$DAYS" > "$OUT/$p.txt" 2>&1 )
    [ $? -ne 0 ] && echo "$(date -u +%FT%T) $p：打ち切り・失敗 $(tail -1 "$OUT/$p.txt" | cut -c1-120)" >> "$OUT/loop.log"
    pkill -f "remote-debugging-port=$((${PORT0:-9433}+slot))" 2>/dev/null
  done
}
arr=($LIST)
for s in $(seq 0 $((JOBS-1))); do
  part=(); for i in "${!arr[@]}"; do [ $((i % JOBS)) -eq $s ] && part+=("${arr[$i]}"); done
  [ ${#part[@]} -gt 0 ] && slot_run $s "${part[@]}" &
done
wait
echo "遊んだ人：$(ls "$OUT"/*.json 2>/dev/null | wc -l)／${#arr[@]}"
exit 0
