import React, { useState, useRef, useEffect } from "react";

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select...",
  disabled = false,
  className = "",
  style,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div
      ref={containerRef}
      className={`custom-select-container ${className} ${disabled ? "disabled" : ""}`}
      style={{ position: "relative", width: "100%", ...style }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`custom-select-trigger ${isOpen ? "open" : ""}`}
        style={{
          width: "100%",
          minHeight: "40px",
          padding: "8px 14px",
          border: isOpen ? "1px solid var(--color-ink)" : "1px solid var(--color-line)",
          borderRadius: "var(--radius-sm)",
          background: "#FFFFFF",
          color: selectedOption ? "var(--color-ink)" : "var(--color-slate)",
          fontFamily: "var(--font-body)",
          fontSize: "0.9em",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.15s ease",
          opacity: disabled ? 0.6 : 1,
          boxShadow: isOpen ? "0 0 0 3px rgba(21, 26, 35, 0.08)" : "none",
        }}
      >
        <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--color-slate)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
            flexShrink: 0,
            marginLeft: "8px",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="custom-select-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 1100,
            maxHeight: "220px",
            overflowY: "auto",
            background: "#FFFFFF",
            border: "1px solid var(--color-line)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "0 8px 24px rgba(21, 26, 35, 0.12)",
            padding: "4px",
          }}
        >
          {options.length === 0 ? (
            <div style={{ padding: "8px 12px", fontSize: "0.85em", color: "var(--color-slate)" }}>
              No options available
            </div>
          ) : (
            options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  type="button"
                  key={opt.value}
                  disabled={opt.disabled}
                  onClick={() => {
                    if (!opt.disabled) {
                      onChange(opt.value);
                      setIsOpen(false);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    textAlign: "left",
                    background: isSelected ? "var(--color-fog)" : "transparent",
                    color: opt.disabled ? "var(--color-slate)" : "var(--color-ink)",
                    border: "none",
                    borderRadius: "var(--radius-sm)",
                    cursor: opt.disabled ? "not-allowed" : "pointer",
                    fontSize: "0.88em",
                    fontFamily: "var(--font-body)",
                    fontWeight: isSelected ? 600 : 400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: opt.disabled ? 0.5 : 1,
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!opt.disabled && !isSelected) {
                      (e.currentTarget as HTMLElement).style.background = "var(--color-fog)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!opt.disabled && !isSelected) {
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }
                  }}
                >
                  <span style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {opt.label}
                  </span>
                  {isSelected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-vermilion)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
