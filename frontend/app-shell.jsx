// Lumina UI Kit -- App shell (top bar + side nav + screen router)
//
// Accessibility + i18n:
//   <header role="banner">       -- top bar
//   <nav role="navigation"
//        aria-label="Primary">   -- side nav
//   Project switcher uses aria-haspopup / aria-expanded and ESC to close.
//   Language switcher (LanguageSwitcher) is a native <select> labelled
//   "Language" -- works with screen readers and OS-level locale tooling.
//   All labels run through t() so they re-render when the locale changes.

const { useState: _useStateA, useEffect: _useEffA, useRef: _useRefA } = React;

// ─── LanguageSwitcher -- compact icon button + popover listbox ───────────
//
// Keeps the topbar uncluttered: shows a single 28px icon with the current
// locale's ISO code overlaid. Activating it opens a popover with the full
// native + English language name pair so users can pick confidently.
//
// Accessibility:
//   - Button announces "{Language label}: {current language}. Change language."
//     so screen readers convey current state and afford navigation.
//   - aria-haspopup / aria-expanded / aria-controls hook the listbox.
//   - ESC closes and returns focus to the button; click-outside closes.
//   - Each option carries lang="..." so AT speaks it in the right voice.

// English names alongside the native labels -- gives screen readers and
// non-speakers a second anchor for each option.
const LUMINA_LANG_ENGLISH = {
  en: "English",       de: "German",         fr: "French",         es: "Spanish",
  it: "Italian",       pt: "Portuguese",     sv: "Swedish",        ja: "Japanese",
  ko: "Korean",        "zh-Hant": "Chinese (Traditional)",         "zh-Hans": "Chinese (Simplified)",
  th: "Thai",          id: "Indonesian",     vi: "Vietnamese",
};

function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = _useStateA(false);
  const buttonRef = _useRefA(null);
  const popoverRef = _useRefA(null);
  const popoverId = "lumina-language-popover";
  const currentLocale = window.LUMINA_I18N.LOCALES.find(l => l.code === locale) || { code: locale, label: locale };

  _useEffA(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    const onClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target) && !buttonRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  // ISO code shown under the icon -- keeps the trigger compact while still
  // signalling current state at a glance. "zh-Hant" → "zh", etc.
  const shortCode = currentLocale.code.split("-")[0].toUpperCase();
  const englishName = LUMINA_LANG_ENGLISH[currentLocale.code] || currentLocale.label;

  return (
    <div style={{ position: "relative", display: "inline-flex" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`${t("topbar.language")}: ${currentLocale.label} (${englishName}). Change language.`}
        title={`${t("topbar.language")}: ${currentLocale.label}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          height: 28, padding: "0 8px", borderRadius: 4, cursor: "pointer",
          background: open ? "var(--paper-2)" : "transparent",
          border: "1px solid " + (open ? "var(--border)" : "transparent"),
          color: "var(--ink-2)", fontFamily: "inherit",
        }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.background = "var(--paper-2)"; }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.background = "transparent"; }}>
        <Icon name="languages" size={15} style={{ color: "var(--ink-3)" }} />
        <span aria-hidden="true" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: "0.04em", color: "var(--ink-3)" }}>{shortCode}</span>
      </button>

      {open && (
        <div
          ref={popoverRef}
          id={popoverId}
          role="listbox"
          aria-label={t("topbar.language")}
          tabIndex={-1}
          style={{
            position: "absolute", top: "100%", right: 0, marginTop: 6,
            background: "var(--white)", border: "1px solid var(--border)",
            boxShadow: "var(--shadow-2)", borderRadius: 4,
            minWidth: 240, maxHeight: 360, overflowY: "auto",
            padding: 6, zIndex: 20,
          }}>
          {window.LUMINA_I18N.LOCALES.map(l => {
            const sel = l.code === locale;
            const eng = LUMINA_LANG_ENGLISH[l.code] || l.code;
            return (
              <div
                key={l.code}
                role="option"
                tabIndex={0}
                aria-selected={sel}
                lang={l.code}
                aria-label={`${l.label} -- ${eng}`}
                onClick={() => { setLocale(l.code); setOpen(false); buttonRef.current?.focus(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setLocale(l.code); setOpen(false); buttonRef.current?.focus(); } }}
                style={{
                  padding: "7px 10px", borderRadius: 2, cursor: "pointer",
                  background: sel ? "var(--paper-2)" : "transparent",
                  display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 10,
                }}
                onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "var(--paper-2)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = sel ? "var(--paper-2)" : "transparent"; }}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: sel ? 500 : 400 }}>{l.label}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, fontFamily: "var(--font-sans)" }}>{eng}</div>
                </div>
                {sel && <Icon name="check" size={14} style={{ color: "var(--shu)" }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TopBar({ project, onSwitchProject, projects }) {
  const { t } = useLocale();
  const [open, setOpen] = _useStateA(false);
  const dropdownRef = _useRefA(null);
  const buttonRef = _useRefA(null);
  const dropdownId = "project-switcher-menu";

  _useEffA(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") { setOpen(false); buttonRef.current?.focus(); } };
    const onClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) && !buttonRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open]);

  return (
    <header role="banner" style={{
      height: 52, display: "flex", alignItems: "center", gap: 18, padding: "0 24px",
      background: "var(--paper)", borderBottom: "1px solid var(--border)",
      flex: "0 0 52px", position: "relative", zIndex: 4,
    }}>
      <a href="#main-content" style={{ display: "inline-flex" }} aria-label="Lumina -- go to main content">
        <Logo size={22} />
      </a>
      <Divider vertical style={{ height: 22, alignSelf: "center" }} />

      {/* Project switcher */}
      <div style={{ position: "relative" }}>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setOpen(!open)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={dropdownId}
          aria-label={t("topbar.switchProject", { project: project.name })}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "transparent", border: "1px solid transparent",
            fontFamily: "inherit", fontSize: 13, color: "var(--ink)",
            padding: "5px 10px", borderRadius: 4, cursor: "pointer",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
          <Mono style={{ color: "var(--ink-3)", fontSize: 12 }}>{project.repo}</Mono>
          <span style={{ fontWeight: 500 }}>{project.name}</span>
          <Icon name="chevrons-up-down" size={13} style={{ color: "var(--ink-3)" }} />
        </button>
        {open && (
          <ul
            ref={dropdownRef}
            id={dropdownId}
            role="listbox"
            aria-label={t("topbar.projects")}
            style={{
              position: "absolute", top: "100%", left: 0, marginTop: 6, listStyle: "none",
              background: "var(--white)", border: "1px solid var(--border)",
              boxShadow: "var(--shadow-2)", borderRadius: 4, minWidth: 280, padding: 6, zIndex: 10,
            }}>
            {projects.map(p => (
              <li key={p.id}
                role="option"
                tabIndex="0"
                aria-selected={p.id === project.id}
                onClick={() => { onSwitchProject(p); setOpen(false); buttonRef.current?.focus(); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSwitchProject(p); setOpen(false); buttonRef.current?.focus(); } }}
                style={{
                  padding: "8px 10px", borderRadius: 2, cursor: "pointer",
                  background: p.id === project.id ? "var(--paper-2)" : "transparent",
                  display: "flex", justifyContent: "space-between", alignItems: "baseline",
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "var(--paper-2)"}
                onMouseLeave={(e) => e.currentTarget.style.background = p.id === project.id ? "var(--paper-2)" : "transparent"}>
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{p.name}</div>
                  <Mono style={{ fontSize: 11, color: "var(--ink-3)" }}>{p.repo}</Mono>
                </div>
                {p.missing === 0
                  ? <StatusChip status="present">Conformant</StatusChip>
                  : <StatusChip status="missing">{p.missing} missing</StatusChip>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <TextField icon="search" label={t("topbar.search")} placeholder={t("topbar.search") + "…"} style={{ width: 320 }} />
      <LanguageSwitcher />
      <Button variant="ghost" size="sm" icon="circle-help">{t("topbar.guide")}</Button>
      <div role="img" aria-label="User: RP" style={{ width: 28, height: 28, borderRadius: 999, background: "var(--paper-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--ink-2)", fontWeight: 500 }}>RP</div>
    </header>
  );
}

function SideNav({ current, onNav }) {
  const { t } = useLocale();
  const items = [
    { id: "dashboard",   label: t("nav.overview"),         icon: "layout-grid" },
    { sep: true,         label: t("nav.section.views") },
    { id: "inventory",   label: t("nav.inventory"),        icon: "list-tree" },
    { id: "raw",         label: t("nav.raw"),              icon: "braces" },
    { id: "graph",       label: t("nav.graph"),            icon: "git-fork" },
    { sep: true,         label: t("nav.section.conformance") },
    { id: "conformance", label: t("nav.requiredFields"),   icon: "scale" },
    { sep: true,         label: t("nav.section.security") },
    { id: "vulns",       label: t("nav.vulnerabilities"),  icon: "shield-alert" },
    { sep: true,         label: t("nav.section.source") },
    { id: "upload",      label: t("nav.import"),           icon: "log-in" },
    { sep: true,         label: t("nav.section.help") },
    { id: "about",       label: t("nav.about"),            icon: "info" },
  ];

  const groups = [];
  let currentGroup = { label: null, items: [] };
  items.forEach(it => {
    if (it.sep) {
      if (currentGroup.items.length || currentGroup.label) groups.push(currentGroup);
      currentGroup = { label: it.label, items: [] };
    } else {
      currentGroup.items.push(it);
    }
  });
  if (currentGroup.items.length) groups.push(currentGroup);

  return (
    <nav aria-label={t("nav.primary")} style={{
      width: 200, flex: "0 0 200px", background: "var(--paper)",
      borderRight: "1px solid var(--border)", padding: "20px 12px",
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      {groups.map((g, gi) => {
        const headingId = "navgroup-" + gi;
        return (
          <div key={gi} role="group" aria-labelledby={g.label ? headingId : undefined}>
            {g.label && <Eyebrow style={{ padding: gi === 0 ? "0 10px 10px" : "16px 10px 8px" }} id={headingId}>{g.label}</Eyebrow>}
            {g.items.map(it => {
              const sel = it.id === current;
              return (
                <button key={it.id}
                  type="button"
                  onClick={() => onNav(it.id)}
                  aria-current={sel ? "page" : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "7px 10px",
                    borderRadius: 4, cursor: "pointer", width: "100%",
                    background: sel ? "var(--shu-soft)" : "transparent",
                    color: sel ? "var(--shu-ink)" : "var(--ink-2)",
                    fontSize: 13, fontWeight: sel ? 500 : 400,
                    border: 0, fontFamily: "inherit", textAlign: "left",
                    boxShadow: sel ? "inset 2px 0 0 0 var(--shu)" : "none",
                    transition: "background var(--dur-quick)",
                  }}
                  onMouseEnter={(e) => { if (!sel) e.currentTarget.style.background = "var(--paper-2)"; }}
                  onMouseLeave={(e) => { if (!sel) e.currentTarget.style.background = "transparent"; }}>
                  <Icon name={it.icon} size={15} />
                  {it.label}
                </button>
              );
            })}
          </div>
        );
      })}
      <div style={{ flex: 1 }} />
      <Eyebrow style={{ padding: "16px 10px 10px" }}>{t("nav.section.workspace")}</Eyebrow>
      <div style={{ padding: "0 10px 4px", fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
        {tNodes("nav.workspace.connected", { branch: <Mono style={{ color: "var(--ink-2)" }}>main</Mono>, time: "2 hours ago" })
          .map((node, i) => <React.Fragment key={i}>{node}</React.Fragment>)}
      </div>
    </nav>
  );
}

Object.assign(window, { TopBar, SideNav, LanguageSwitcher });
