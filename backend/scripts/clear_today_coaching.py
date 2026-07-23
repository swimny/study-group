import sqlite3

conn = sqlite3.connect("studygroup.db")
conn.execute("DELETE FROM coaching_messages WHERE date = ?", ("2026-07-23",))
conn.commit()
print("삭제 완료")