import { useState } from "react";
import { BookOpen, ChevronDown, CircleHelp } from "lucide-react";

const TERMS = [
  {
    term: "Transaction",
    meaning:
      "A payment record representing money charged to or paid by a customer.",
  },
  {
    term: "Settlement",
    meaning:
      "The process of transferring and recording funds between the parties involved in a payment.",
  },
  {
    term: "Settlement Rate",
    meaning:
      "The percentage of transactions settled successfully, according to the backend's calculation.",
  },
  {
    term: "Fully Settled",
    meaning:
      "The net settlement amount matches the original transaction amount.",
  },
  {
    term: "Partially Settled",
    meaning:
      "Only part of the original transaction amount has been settled.",
  },
  {
    term: "Over-settled",
    meaning:
      "The net settlement amount is greater than the original transaction amount.",
  },
  {
    term: "Not Applicable",
    meaning:
      "Settlement status does not apply to the transaction, such as a failed or declined payment.",
  },
  {
    term: "Outstanding Amount",
    meaning:
      "The remaining amount that has not yet been settled. Check the backend's calculation for the exact treatment of refunds.",
  },
  {
    term: "Settlement Record",
    meaning:
      "An individual settlement entry linked to a transaction. One transaction can have multiple entries.",
  },
  {
    term: "Critical Issue",
    meaning:
      "A high-priority reconciliation exception that requires immediate investigation.",
  },
  {
    term: "Warning",
    meaning:
      "A reconciliation condition that should be reviewed but may not require immediate intervention.",
  },
  {
    term: "Flagged Transaction",
    meaning:
      "A transaction identified by the reconciliation system as needing review.",
  },
  {
    term: "Reconciliation",
    meaning:
      "Comparing transaction records with settlement records to identify mismatches, missing entries, or discrepancies.",
  },
  {
    term: "Top Discrepancies",
    meaning:
      "A ranked list of transactions with the largest differences between the original transaction amount and the settled amount. It helps identify under-settlements and over-settlements that may need investigation.",
  },
  {
    term: "Refund",
    meaning:
      "Money returned to a customer. Depending on the system's rules, a refund may reduce the net settled amount.",
  },
];

export default function HelpGlossary() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className="help-glossary">
      
        

      {(
        <div className="help-glossary-content">
          <div className="help-glossary-intro">
            <CircleHelp size={17} />
          </div>

          <div className="help-glossary-grid">
            {TERMS.map(({ term, meaning }) => (
              <article className="help-term" key={term}>
                <h4>{term}</h4>
                <p>{meaning}</p>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
