
from app.database import get_connection

with get_connection() as connection:
    rows = connection.execute("""
        SELECT transaction_id, settlement_status, total_settled_amount
        FROM transactions
        ORDER BY transaction_id
    """).fetchall()

    for row in rows:
        print(dict(row))
