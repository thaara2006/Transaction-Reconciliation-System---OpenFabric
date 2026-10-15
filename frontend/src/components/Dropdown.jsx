import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import "../styles/Dropdown.css";

export default function Dropdown({
  value,
  onChange,
  options = [],
  placeholder = "Select…",
  icon: Icon = null,
  header = null,
  align = "left",
  ariaLabel,
  className = "",
  id,
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const generatedId = useId();
  const menuId = id || `trs-dropdown-menu-${generatedId}`;

  const selectedOption = options.find((opt) => opt.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : placeholder;

  // Sync highlighted index when opened
  useEffect(() => {
    if (open) {
      const idx = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [open, value, options]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && menuRef.current && highlightedIndex >= 0) {
      const items = menuRef.current.querySelectorAll(".trs-dropdown-item");
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({
          block: "nearest",
        });
      }
    }
  }, [open, highlightedIndex]);

  const handleSelect = (val) => {
    onChange?.(val);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === "Tab") {
      setOpen(false);
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % options.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length);
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < options.length) {
        handleSelect(options[highlightedIndex].value);
      }
    }
  };

  return (
    <div
      className={`trs-dropdown ${className}`.trim()}
      ref={rootRef}
      onKeyDown={handleKeyDown}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`trs-dropdown-trigger${open ? " open" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel || (header ? `${header}: ${selectedLabel}` : selectedLabel)}
      >
        {Icon && (
          <span className="trs-dropdown-icon" aria-hidden="true">
            {typeof Icon === "function" || typeof Icon.render === "function" ? (
              <Icon size={15} />
            ) : (
              Icon
            )}
          </span>
        )}
        <span className="trs-dropdown-label">{selectedLabel}</span>
        <ChevronDown size={14} className="trs-dropdown-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className={`trs-dropdown-menu${align === "right" ? " align-right" : ""}`}
          role="listbox"
          tabIndex={-1}
        >
          {header && <div className="trs-dropdown-header">{header}</div>}
          {options.map((opt, index) => {
            const isSelected = opt.value === value;
            const isHighlighted = index === highlightedIndex;
            return (
              <div
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                className={`trs-dropdown-item${isSelected ? " active" : ""}${
                  isHighlighted ? " highlighted" : ""
                }`}
                onClick={() => handleSelect(opt.value)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className="trs-dropdown-item-label">{opt.label}</span>
                {isSelected && (
                  <span className="trs-dropdown-check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
