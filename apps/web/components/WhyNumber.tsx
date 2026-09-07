"use client";

import { useId, useState, type ReactNode } from "react";

export function WhyNumber({
  value,
  unit,
  label,
  children,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const dialogId = useId();

  return (
    <span className="why">
      <button
        type="button"
        className="why-btn"
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen((v) => !v)}
      >
        <b>
          {value}
          {unit ? <small> {unit}</small> : null}
        </b>
        <span className="why-tag">Why?</span>
        <span className="why-label">{label}</span>
      </button>
      {open && (
        <div className="why-pop" id={dialogId} role="dialog" aria-label={label}>
          {children}
          <button type="button" className="why-close" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      )}
    </span>
  );
}
