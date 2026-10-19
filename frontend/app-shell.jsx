/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- app shell (top bar + side nav)
//
// Accessibility + i18n:
//   <header role="banner">       -- top bar: logo + language switcher
//   <nav aria-label="Primary">   -- side nav: one <button> per screen
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
//     (all three parts localised)
//     so screen readers convey current state and afford navigation.
//   - aria-haspopup / aria-expanded / aria-controls hook the listbox.
//   - ESC closes and returns focus to the button; click-outside closes.
//   - Each option carries lang="..." so AT speaks it in the right voice.

// English names alongside the native labels -- gives screen readers and
// non-speakers a second anchor for each option. One entry per locale in
// window.LUMINA_I18N.LOCALES.
const LUMINA_LANG_ENGLISH = { en: "English", de: "German", ja: "Japanese" };

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

  // ISO code shown next to the icon -- keeps the trigger compact while still
  // signalling current state at a glance.
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
        aria-label={`${t("topbar.language")}: ${currentLocale.label} (${englishName}). ${t("topbar.changeLanguage")}`}
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

// Screens in the side nav, in order. `id` is the router key in index.html.
const NAV_SECTIONS = [
  { labelKey: "nav.section.check", items: [
    { id: "generate", labelKey: "nav.generate", icon: "link" },
    { id: "upload",   labelKey: "nav.upload",   icon: "file-up" },
    { id: "sarif",    labelKey: "nav.sarif",    icon: "file-json" },
  ] },
  { labelKey: "nav.section.help", items: [
    { id: "about",    labelKey: "nav.about",    icon: "info" },
  ] },
];

function navLabelKey(id) {
  for (const section of NAV_SECTIONS) {
    const item = section.items.find(it => it.id === id);
    if (item) return item.labelKey;
  }
  return null;
}

function TopBar() {
  const { t } = useLocale();
  return (
    <header role="banner" style={{
      height: 52, display: "flex", alignItems: "center", gap: 18, padding: "0 24px",
      background: "var(--paper)", borderBottom: "1px solid var(--border)",
      flex: "0 0 52px", position: "relative", zIndex: 4,
    }}>
      <a href="#main-content" style={{ display: "inline-flex" }} aria-label={t("topbar.home")}>
        <Logo size={22} />
      </a>
      <div style={{ flex: 1 }} />
      <LanguageSwitcher />
    </header>
  );
}

function SideNav({ current, onNav }) {
  const { t } = useLocale();
  return (
    <nav aria-label={t("nav.primary")} className="side-nav" style={{
      width: 200, flex: "0 0 200px", background: "var(--paper)",
      borderRight: "1px solid var(--border)", padding: "20px 12px",
      display: "flex", flexDirection: "column", gap: 2,
    }}>
      {NAV_SECTIONS.map((g, gi) => {
        const headingId = "navgroup-" + gi;
        return (
          <div key={g.labelKey} role="group" aria-labelledby={headingId}>
            <Eyebrow id={headingId} style={{ padding: gi === 0 ? "0 10px 10px" : "16px 10px 8px" }}>{t(g.labelKey)}</Eyebrow>
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
                  {t(it.labelKey)}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

Object.assign(window, { TopBar, SideNav, LanguageSwitcher, NAV_SECTIONS, navLabelKey });
