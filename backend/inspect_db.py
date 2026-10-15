import sqlite3
c = sqlite3.connect('data/reconciliation.db')
rows = c.execute("SELECT name, sql FROM sqlite_master WHERE type='table'").fetchall()
for r in rows:
    print(r[0])
    if r[1]:
        print(r[1][:300])
    print("---")
c.close()
