import sqlite3, json
con = sqlite3.connect('/tmp/db_work.db')
cur = con.cursor()
print('== system_setting (all) ==')
for row in cur.execute('SELECT id, config_name, config_value FROM system_setting'):
    v = row[2] or ''
    print(f'  id={row[0]} name={row[1]} len={len(v)}')
    print('    value:', v[:300].replace('\n', '\\n'))
print('== module_config (all) ==')
for row in cur.execute('SELECT id, user_id, name, value_json FROM module_config'):
    v = row[3] or ''
    print(f'  id={row[0]} user={row[1]} name={row[2]} len={len(v)}')
    print('    value_json:', v[:600])
print('== user_config panel_json keys ==')
pj = cur.execute('SELECT panel_json FROM user_config').fetchone()[0]
d = json.loads(pj)
for k, v in d.items():
    s = json.dumps(v, ensure_ascii=False)
    print(f'  {k}: {s[:160]}')
