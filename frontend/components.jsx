/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- shared components
// Each component is a small, mainly-cosmetic React component.
// All export to window for cross-script reuse.

const { useState, useRef, useEffect } = React;

// ─── Icon ───────────────────────────────────────────────────────────────
// Wraps Lucide. Default 16px, currentColor. 1.5px stroke matches the system.
function Icon({ name, size = 16, className = "", style = {} }) {
  const ref = useRef(null);
  useEffect(() => {
    if (window.lucide && ref.current) {
      ref.current.innerHTML = "";
      const i = document.createElement("i");
      i.setAttribute("data-lucide", name);
      ref.current.appendChild(i);
      window.lucide.createIcons({ attrs: { width: size, height: size, "stroke-width": 1.5 } });
    }
  }, [name, size]);
  return <span ref={ref} className={"lumina-icon " + className} style={{ display: "inline-flex", width: size, height: size, ...style }} aria-hidden="true" />;
}

// ─── Logo ───────────────────────────────────────────────────────────────
function Logo({ size = 22 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: size, letterSpacing: "-0.028em", color: "var(--ink)", lineHeight: 1 }}>
      lumina
      <span style={{ display: "inline-block", width: size * 0.22, height: size * 0.22, background: "var(--shu)", marginLeft: 2 }} />
    </span>
  );
}

// ─── Button ─────────────────────────────────────────────────────────────
function Button({ variant = "secondary", size = "md", icon, iconAfter, children, onClick, disabled, style = {}, type = "button" }) {
  const base = {
    fontFamily: "inherit", fontWeight: 500, letterSpacing: "-0.005em",
    borderRadius: 4, cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent", lineHeight: 1, display: "inline-flex",
    alignItems: "center", gap: 8, transition: "background var(--dur-quick) var(--ease-out), color var(--dur-quick) var(--ease-out), border-color var(--dur-quick) var(--ease-out)",
    whiteSpace: "nowrap",
  };
  const sizes = {
    sm: { padding: "5px 10px", fontSize: 12 },
    md: { padding: "8px 14px", fontSize: 13 },
    lg: { padding: "10px 18px", fontSize: 14 },
  };
  const variants = {
    primary:   { background: "var(--shu)",    color: "var(--paper)", borderColor: "var(--shu)" },
    secondary: { background: "var(--white)",  color: "var(--ink)",   borderColor: "var(--border)" },
    ghost:     { background: "transparent",   color: "var(--ink-2)" },
    danger:    { background: "transparent",   color: "var(--shu-deep)", borderColor: "var(--shu)" },
  };
  const disabledStyle = disabled ? { background: "var(--paper-2)", color: "var(--ink-4)", borderColor: "var(--border-soft)" } : {};
  const [hover, setHover] = useState(false);
  const hoverStyle = hover && !disabled
    ? variant === "primary" ? { background: "var(--shu-deep)", borderColor: "var(--shu-deep)" }
    : variant === "secondary" ? { background: "var(--paper-2)" }
    : variant === "ghost" ? { background: "var(--paper-2)", color: "var(--ink)" }
    : variant === "danger" ? { background: "var(--shu-soft)" }
    : {} : {};
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ ...base, ...sizes[size], ...variants[variant], ...disabledStyle, ...hoverStyle, ...style }}>
      {icon && <Icon name={icon} size={size === "sm" ? 13 : 14} />}
      {children}
      {iconAfter && <Icon name={iconAfter} size={size === "sm" ? 13 : 14} />}
    </button>
  );
}

// ─── StatusChip ─────────────────────────────────────────────────────────
function StatusChip({ status, children }) {
  const map = {
    present:    { bg: "#E1E8D5", fg: "#2E3D24", dot: "#5F7A4F", label: "Present" },
    missing:    { bg: "#F1E5C9", fg: "#4F3A14", dot: "#B68333", label: "Missing" },
    unverified: { bg: "#DCE3EC", fg: "#15263C", dot: "#2F4A6B", label: "Unverified" },
    invalid:    { bg: "#F5DAD4", fg: "#5A1810", dot: "#C8392A", label: "Invalid" },
    neutral:    { bg: "var(--paper-2)", fg: "var(--ink-3)", dot: null, label: "--" },
  };
  const c = map[status] || map.neutral;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 500, padding: "2px 9px", borderRadius: 999, lineHeight: 1.4, background: c.bg, color: c.fg, whiteSpace: "nowrap" }}>
      {c.dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: c.dot, flex: "0 0 6px" }} />}
      {children || c.label}
    </span>
  );
}

// ─── RegTag ─────────────────────────────────────────────────────────────
// Display chip for a regulation (e.g. "NTIA Minimum Elements"). When onClick
// is provided, becomes a keyboard-accessible button (or radio, via the `role`
// prop). A `disabled` chip keeps its role but cannot be selected.
function RegTag({ children, active, onClick, role, ariaChecked, ariaLabel, disabled }) {
  const interactive = !!onClick || disabled;
  const activate = (e) => { if (!disabled && onClick) onClick(e); };
  const a11y = interactive ? {
    role: role || "button",
    tabIndex: disabled ? -1 : 0,
    "aria-disabled": disabled ? true : undefined,
    "aria-pressed": role ? undefined : !!active,
    "aria-checked": role === "radio" ? !!(ariaChecked ?? active) : undefined,
    "aria-label": ariaLabel,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); activate(e); } },
  } : {};
  return (
    <span onClick={activate} {...a11y} style={{
      display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)",
      fontSize: 11, padding: "3px 8px", borderRadius: 2,
      background: active ? "var(--ink)" : disabled ? "var(--paper-2)" : "var(--white)",
      color: active ? "var(--paper)" : disabled ? "var(--ink-3)" : "var(--ink-2)",
      border: "1px " + (disabled ? "dashed " : "solid ") + (active ? "var(--ink)" : "var(--border)"),
      cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
    }}>{children}</span>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────
// Container with paper / recessed / floating variants. If onClick is provided,
// becomes a keyboard-accessible button (Enter / Space to activate).
function Card({ children, variant = "default", style = {}, onClick, padding = 18, ariaLabel, ariaChecked, role }) {
  const v = {
    default:  { background: "var(--white)",   border: "1px solid var(--border)" },
    recessed: { background: "var(--paper-2)", border: "1px solid var(--border-soft)" },
    float:    { background: "var(--white)",   border: "1px solid var(--border)", boxShadow: "var(--shadow-2)" },
  }[variant];
  const a11y = onClick ? {
    role: role || "button",
    tabIndex: 0,
    "aria-label": ariaLabel,
    "aria-checked": role === "radio" ? !!ariaChecked : undefined,
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(e); } },
  } : {};
  return (
    <div onClick={onClick} {...a11y} style={{ ...v, borderRadius: 4, padding, ...style, cursor: onClick ? "pointer" : style.cursor }}>
      {children}
    </div>
  );
}

// ─── MarginNote ─────────────────────────────────────────────────────────
// Lumina's signature non-invasive guide. Renders as <aside role="note">.
function MarginNote({ children, title = "A note" }) {
  const titleId = "note-" + (title.replace(/\W+/g, "-").toLowerCase());
  return (
    <aside role="note" aria-labelledby={titleId} style={{
      display: "flex", flexDirection: "column", gap: 10,
      background: "var(--white)", border: "1px solid var(--border)",
      borderLeft: "2px solid var(--shu)", borderRadius: 2,
      padding: "14px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span aria-hidden="true" style={{ width: 6, height: 6, background: "var(--shu)", borderRadius: 999, flex: "0 0 6px" }} />
        <span id={titleId} style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--shu-deep)" }}>{title}</span>
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>
        {children}
      </div>
    </aside>
  );
}

// ─── TextField ──────────────────────────────────────────────────────────
// Adds accessible labelling: prefer an explicit `label` prop (visually hidden
// via .sr-only), or fall back to aria-label = label || placeholder.
function TextField({ icon, placeholder, label, value, onChange, style = {}, id, ...rest }) {
  const [focus, setFocus] = useState(false);
  const fieldId = id || "tf-" + ((label || placeholder || "input").replace(/\W+/g, "-").toLowerCase());
  const accessibleLabel = label || placeholder || "Search";
  return (
    <label htmlFor={fieldId} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: "var(--white)", border: "1px solid " + (focus ? "var(--ink-2)" : "var(--border)"),
      boxShadow: focus ? "0 0 0 3px rgba(200,57,42,.18)" : "none",
      borderRadius: 4, padding: "0 12px", height: 32, minWidth: 200,
      transition: "border-color var(--dur-quick), box-shadow var(--dur-quick)", ...style
    }}>
      <span className="sr-only">{accessibleLabel}</span>
      {icon && <Icon name={icon} size={14} style={{ color: "var(--ink-3)" }} />}
      <input
        id={fieldId}
        value={value} onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        aria-label={accessibleLabel}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={{ border: 0, outline: 0, background: "transparent", fontFamily: "inherit", fontSize: 13, color: "var(--ink)", flex: 1, minWidth: 0 }}
        {...rest}
      />
    </label>
  );
}

// ─── Eyebrow ────────────────────────────────────────────────────────────
function Eyebrow({ children, style = {}, id }) {
  return <div id={id} style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ink-3)", ...style }}>{children}</div>;
}

// ─── SummaryTile -- small labelled count card ───────────────────────────
function SummaryTile({ label, value, accent }) {
  return (
    <Card padding={18}>
      <Eyebrow>{label}</Eyebrow>
      <div style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.018em", lineHeight: 1, marginTop: 8, color: accent || "var(--ink)" }}>{value}</div>
    </Card>
  );
}

// ─── ErrorCard -- a failed request, with the server's own explanation ───
function ErrorCard({ title = "Could not complete", children }) {
  return (
    <Card variant="default" padding={16} style={{ borderColor: "var(--shu)" }}>
      <div role="alert">
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--shu)", fontSize: 14, fontWeight: 500 }}>
          <Icon name="alert-triangle" size={16} /> {title}
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{children}</div>
      </div>
    </Card>
  );
}

// ─── Mono ───────────────────────────────────────────────────────────────
function Mono({ children, style = {} }) {
  return <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.94em", letterSpacing: "-0.005em", ...style }}>{children}</span>;
}

// ─── useLocale ──────────────────────────────────────────────────────────
// React hook that subscribes to window.LUMINA_I18N locale changes so any
// component reading t() re-renders when the user switches language.
function useLocale() {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => window.LUMINA_I18N.subscribe(() => force()), []);
  return {
    locale: window.LUMINA_I18N.getLocale(),
    setLocale: window.LUMINA_I18N.setLocale,
    t: window.LUMINA_I18N.t,
  };
}

Object.assign(window, { Icon, Logo, Button, StatusChip, RegTag, Card, MarginNote, TextField, Eyebrow, Mono, SummaryTile, ErrorCard, useLocale });
