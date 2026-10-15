
from pathlib import Path

from app.services.reconciliation_service import reconcile_csv
from app.utils.report_printer import print_reconciliation_report


CSV_PATH = (
    Path(__file__).resolve().parent
    / "settlement_report.csv"
)


def main():
    try:
        result = reconcile_csv(CSV_PATH)
        print_reconciliation_report(result)

    except (ValueError, FileNotFoundError) as error:
        print(f"Reconciliation failed: {error}")


if __name__ == "__main__":
    main()
