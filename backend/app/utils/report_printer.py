
def print_reconciliation_report(result):
    print("\n========== RECONCILIATION REPORT ==========")

    print(
        f"Settlements processed : {result['processed']}"
    )
    print(
        f"Duplicates skipped    : {result['duplicates']}"
    )
    print(
        f"Unmatched settlements : {result['unmatched']}"
    )
    print(
        f"Updated transactions  : "
        f"{result['updated_transactions']}"
    )
    print(
        f"Total issues detected : {len(result['issues'])}"
    )

    if result["issues"]:
        print("\nISSUES")

        for issue in result["issues"]:
            transaction_id = (
                issue.get("transaction_id") or "UNMATCHED"
            )

            print(
                f"\n[{issue['severity']}] "
                f"{transaction_id}: {issue['message']}"
            )

            print(
                f"  Recommendation: "
                f"{issue['recommendation']}"
            )
    else:
        print("\nNo reconciliation issues detected.")

    print("\n===========================================\n")
