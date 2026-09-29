# この組（shard）が遊ぶ人を出す。名簿の並べ方は playmany.sh と同じ（気分・癖・変わり種の順）
# つかいかた: python3 pick.py <personas.json> <始める番> <組の番号(0から)> <一組の人数>
import json, sys
d = json.load(open(sys.argv[1], encoding='utf-8'))
ks = sorted(d, key=lambda k: (d[k].get('mood', ''), d[k].get('habit', ''), d[k].get('variant', ''), k))
start, shard, per = int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
print(' '.join(ks[(start + shard * per + i) % len(ks)] for i in range(per)))
