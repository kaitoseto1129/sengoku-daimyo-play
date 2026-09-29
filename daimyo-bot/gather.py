# 各組の結果（一人一つの JSON）を daimyo-players/people/ に重ね（同じ人は新しい方で上書き）、
# mergeall.py で daimyo-players/REPORT.md・findings.json を書き直す。どこまで回したかは cursor.json
# つかいかた: python3 daimyo-bot/gather.py <集めた所> <始めた番> <人数>
import sys, os, json, glob, shutil, subprocess, datetime
IN, START, COUNT = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
DEST = 'daimyo-players'; PEOPLE = os.path.join(DEST, 'people'); TOTAL = 10000
os.makedirs(PEOPLE, exist_ok=True)
got = 0; fatal = 0
for f in glob.glob(os.path.join(IN, '**', '*.json'), recursive=True):
    try: d = json.load(open(f, encoding='utf-8'))
    except Exception: continue
    if not (isinstance(d, dict) and 'runs' in d): continue
    shutil.copy(f, os.path.join(PEOPLE, os.path.basename(f))); got += 1
    fatal += sum(1 for r in d['runs'] if r.get('fatal'))
logs = sorted(glob.glob(os.path.join(IN, '**', 'loop.log'), recursive=True))
miss = sum(len(open(l, encoding='utf-8').read().splitlines()) for l in logs)
subprocess.run(['python3', 'daimyo-bot/mergeall.py', PEOPLE, os.path.join(DEST, 'REPORT.md'), os.path.join(DEST, 'findings.json')], check=True)
cp = os.path.join(DEST, 'cursor.json')
try: cur = json.load(open(cp, encoding='utf-8'))
except Exception: cur = {}
at = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')
h = (cur.get('history') or [])[-200:]
h.append({'at': at, 'start': START, 'count': COUNT, 'played': got, 'fatal': fatal, 'skipped_or_failed': miss})
cur = {'next': (START + COUNT) % TOTAL, 'history': h}
json.dump(cur, open(cp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{START}番から{COUNT}人のうち {got}人の結果を足した（落ちた回 {fatal}・飛ばし/失敗 {miss}）')
