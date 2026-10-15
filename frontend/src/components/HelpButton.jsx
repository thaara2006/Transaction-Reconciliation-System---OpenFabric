
import { useEffect, useRef, useState } from "react";
import { CircleHelp, X } from "lucide-react";
import HelpGlossary from "./HelpGlossary";
import "../styles/HelpGlossary.css";

export default function HelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const helpRef = useRef(null);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        helpRef.current &&
        !helpRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div className="floating-help" ref={helpRef}>
      <button
        type="button"
        className="floating-help-button"
        onClick={() => setIsOpen((previous) => !previous)}
        aria-label={isOpen ? "Close help" : "Open help"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        title="Help and glossary"
      >
        {isOpen ? <X size={22} /> : <CircleHelp size={23} />}
      </button>

      {isOpen && (
        <div
          className="floating-help-popup"
          role="dialog"
          aria-label="Help and glossary"
        >
          <div className="floating-help-header">
            <div>
              <h3>Help &amp; Glossary</h3>
              <p>Understand your reconciliation dashboard</p>
            </div>

            <button
              type="button"
              className="floating-help-close"
              onClick={() => setIsOpen(false)}
              aria-label="Close help"
            >
              <X size={18} />
            </button>
          </div>

          <div className="floating-help-content">
            <HelpGlossary />
          </div>
        </div>
      )}
    </div>
  );
}
