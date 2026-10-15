
from app.database import get_connection


def list_transactions(
    limit=100,
    offset=0,
    status=None,
    search=None,
    sort_by=None,
):
    query = """
        SELECT *
        FROM transactions
        WHERE 1 = 1
    """
    parameters = []

    if status and status.upper() != "ALL":
        query += " AND settlement_status = ?"
        parameters.append(status.upper())

    if search and search.strip():
        query += """
            AND (
                LOWER(transaction_id) LIKE ?
                OR LOWER(merchant_name) LIKE ?
                OR LOWER(account_id) LIKE ?
            )
        """

        search_value = f"%{search.strip().lower()}%"
        parameters.extend([
            search_value,
            search_value,
            search_value,
        ])

    order_by = "ORDER BY transaction_date DESC, transaction_id DESC"
    if sort_by in ("oldest", "date_asc"):
        order_by = "ORDER BY transaction_date ASC, transaction_id ASC"
    elif sort_by == "id_asc":
        order_by = "ORDER BY transaction_id ASC"
    elif sort_by == "id_desc":
        order_by = "ORDER BY transaction_id DESC"
    elif sort_by == "amount_desc":
        order_by = "ORDER BY CAST(transaction_amount AS REAL) DESC, transaction_id ASC"
    elif sort_by == "amount_asc":
        order_by = "ORDER BY CAST(transaction_amount AS REAL) ASC, transaction_id ASC"
    elif sort_by == "status_asc":
        order_by = "ORDER BY settlement_status ASC, transaction_id ASC"
    elif sort_by in ("newest", "date_desc"):
        order_by = "ORDER BY transaction_date DESC, transaction_id DESC"

    query += f"""
        {order_by}
        LIMIT ? OFFSET ?
    """

    parameters.extend([limit, offset])

    with get_connection() as connection:
        rows = connection.execute(
            query,
            parameters,
        ).fetchall()

        return [dict(row) for row in rows]


def get_transaction(transaction_id):
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM transactions
            WHERE transaction_id = ?
            """,
            (transaction_id,),
        ).fetchone()

        return dict(row) if row else None


def get_all_transactions():
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM transactions
            ORDER BY transaction_id
            """
        ).fetchall()

        return [dict(row) for row in rows]


def get_settlements(transaction_id):
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                settlement_id,
                transaction_id,
                lifecycle_id,
                settlement_date,
                settlement_amount,
                settlement_type,
                currency,
                processed_at
            FROM settlement_history
            WHERE transaction_id = ?
            ORDER BY settlement_date, settlement_id
            """,
            (transaction_id,),
        ).fetchall()

        return [dict(row) for row in rows]


def get_settlement_count():
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM settlement_history
            """
        ).fetchone()

        return row["total"]


def get_status_breakdown():
    statuses = {
        "PENDING": 0,
        "PARTIAL": 0,
        "FULLY_SETTLED": 0,
        "OVER_SETTLED": 0,
        "REFUNDED": 0,
        "NOT_APPLICABLE": 0,
    }

    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT settlement_status, COUNT(*) AS total
            FROM transactions
            GROUP BY settlement_status
            """
        ).fetchall()

        for row in rows:
            statuses[row["settlement_status"]] = row["total"]

    return statuses
