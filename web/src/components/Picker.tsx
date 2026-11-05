import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface PickerOption<V> {
  value: V;
  label: string;
  /** Shorter text for the closed selector on small screens. */
  short?: string;
  icon: ReactNode;
}

const TYPE_AHEAD_MS = 600;

/** A selector with icons, which a native select cannot show. Keyboard follows the WAI-ARIA select-only combobox. */
export function Picker<V extends string | number>(props: {
  label: string;
  className?: string;
  value: V;
  options: PickerOption<V>[];
  onChange: (value: V) => void;
}) {
  const { label, className = "", value, options, onChange } = props;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: Number.NEGATIVE_INFINITY });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedAt = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedAt];

  const show = (at = selectedAt) => {
    setActive(at);
    setOpen(true);
  };
  const choose = (at: number) => {
    setOpen(false);
    const option = options[at];
    if (option && option.value !== value) onChange(option.value);
  };

  // Anything done elsewhere on the page closes the list.
  useEffect(() => {
    if (!open) return;
    const outside = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("wheel", outside, { passive: true });
    window.addEventListener("focusin", outside);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("wheel", outside);
      window.removeEventListener("focusin", outside);
    };
  }, [open]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const typeAhead = (key: string) => {
    const now = performance.now();
    const text = (now - typed.current.at > TYPE_AHEAD_MS ? "" : typed.current.text) + key.toLowerCase();
    typed.current = { text, at: now };
    const from = open ? active : selectedAt;
    const count = options.length;
    const repeat = [...text].every((c) => c === text[0]);
    for (let step = repeat ? 1 : 0; step < count + (repeat ? 1 : 0); step++) {
      const at = (from + step) % count;
      const name = options[at].label.toLowerCase();
      if (name.startsWith(text) || (repeat && name.startsWith(text[0]))) {
        show(at);
        return;
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const last = options.length - 1;
    const move = (at: number) => {
      e.preventDefault();
      if (open) setActive(at);
      else show();
    };
    if (e.key === "ArrowDown") move(Math.min(last, active + 1));
    else if (e.key === "ArrowUp") move(Math.max(0, active - 1));
    else if (e.key === "Home" && open) move(0);
    else if (e.key === "End" && open) move(last);
    else if (e.key === "PageDown" && open) move(Math.min(last, active + 10));
    else if (e.key === "PageUp" && open) move(Math.max(0, active - 10));
    else if (e.key === " " && performance.now() - typed.current.at < TYPE_AHEAD_MS) {
      // A space in the middle of typing a name ("Tampa Bay") is part of the name.
      e.preventDefault();
      typeAhead(" ");
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (open) choose(active);
      else show();
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab" && open) {
      choose(active);
    } else if (e.key.length === 1) {
      e.preventDefault();
      typeAhead(e.key);
    }
  };

  return (
    <div ref={root} className={`picker ${className}`} data-open={open || undefined}>
      <button
        type="button"
        className="picker-button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        data-value={selected?.value}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
      >
        <span className="picker-icon">{selected?.icon}</span>
        <span className="picker-text picker-long">{selected?.label}</span>
        <span className="picker-text picker-short">{selected?.short ?? selected?.label}</span>
        <svg className="picker-chevron" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true">
          <path d="M1.5 1.5 6 6l4.5-4.5" />
        </svg>
      </button>
      <ul
        ref={list}
        id={`${id}-list`}
        className="picker-list"
        role="listbox"
        aria-label={label}
        hidden={!open}
        // A click must not take focus from the button, which holds the keyboard.
        onMouseDown={(e) => e.preventDefault()}
      >
        {options.map((o, i) => (
          <li
            key={o.value}
            id={`${id}-${i}`}
            className="picker-option"
            role="option"
            aria-selected={o.value === value}
            data-value={o.value}
            data-active={i === active || undefined}
            onPointerMove={() => setActive(i)}
            onClick={() => choose(i)}
          >
            <span className="picker-icon">{o.icon}</span>
            <span className="picker-text">{o.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
