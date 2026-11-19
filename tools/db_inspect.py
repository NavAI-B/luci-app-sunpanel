import sqlite3, shutil, sys
src = '/mnt/f/DSH Desktop/OpenWrt/Sun-Panel/dist/database.db'
shutil.copy(src, '/tmp/db_work.db')
con = sqlite3.connect('/tmp/db_work.db')
cur = con.cursor()
print('== tables ==')
for (name,) in cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"):
    print(' ', name)
print('== rows mentioning script/js/injection ==')
for (name,) in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall():
    try:
        cols = [c[1] for c in cur.execute(f'PRAGMA table_info("{name}")')]
        n = cur.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
        hits = []
        for row in cur.execute(f'SELECT * FROM "{name}"'):
            for v in row:
                if isinstance(v, str) and ('<script' in v.lower() or 'index.js' in v.lower() or 'innerHTML' in v.lower() or 'elaina' in v.lower()):
                    hits.append(v[:120])
                    break
        print(f'  {name} rows={n} cols={cols}' + (f'  <<< {len(hits)} hit(s)' if hits else ''))
        for h in hits[:2]:
            print('      sample:', h)
    except Exception as ex:
        print(f'  {name}: {ex}')
