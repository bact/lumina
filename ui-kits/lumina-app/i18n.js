/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina UI Kit -- i18n / l10n infrastructure
//
// Scope: ship the plumbing, not the translations. Strings fall back to English
// when a locale has no entry; numbers and dates go through Intl APIs so they
// localize even when the UI text doesn't.
//
// Exposes window.LUMINA_I18N with:
//   LOCALES                 -- array of { code, label } for the picker
//   STRINGS                 -- { [code]: { [key]: text } } catalogue
//   getLocale() / setLocale(code)
//   t(key, vars?)           -- lookup with English fallback + {var} interpolation
//   formatNumber(n, opts?)  -- Intl.NumberFormat
//   formatDate(d, opts?)    -- Intl.DateTimeFormat
//   formatRelativeTime(value, unit)  -- Intl.RelativeTimeFormat
//   subscribe(fn)           -- listener for locale changes (returns unsubscribe)
//
// Accessibility:
//   - setLocale updates <html lang> so screen readers switch language.
//   - The hook + global listeners trigger re-renders so aria-labels stay in sync.

window.LUMINA_I18N = (() => {
  // Native-language labels so each option is readable by speakers of that
  // language. The order roughly follows the regions Lumina expects to land in.
  const LOCALES = [
    { code: "en",      label: "English"            },
    { code: "de",      label: "Deutsch"            },
    { code: "fr",      label: "Français"           },
    { code: "es",      label: "Español"            },
    { code: "it",      label: "Italiano"           },
    { code: "pt",      label: "Português"          },
    { code: "sv",      label: "Svenska"            },
    { code: "ja",      label: "日本語"              },
    { code: "ko",      label: "한국어"              },
    { code: "zh-Hant", label: "繁體中文"            },
    { code: "zh-Hans", label: "简体中文"            },
    { code: "th",      label: "ไทย"                },
    { code: "id",      label: "Bahasa Indonesia"   },
    { code: "vi",      label: "Tiếng Việt"         },
  ];

  // English catalogue -- the source of truth. Every other locale falls back
  // here per key. Use {var} placeholders for runtime interpolation.
  const en = {
    "topbar.skipToContent": "Skip to main content",
    "topbar.language":      "Language",
    "topbar.guide":         "Guide",
    "topbar.search":        "Search components, PURLs, or suppliers",
    "topbar.switchProject": "Switch project. Current: {project}",
    "topbar.projects":      "Projects",

    "nav.primary":          "Primary navigation",
    "nav.section.views":    "Views",
    "nav.section.conformance":"Conformance",
    "nav.section.security": "Security",
    "nav.section.source":   "Source",
    "nav.section.help":     "Help",
    "nav.section.workspace":"Workspace",
    "nav.overview":         "Overview",
    "nav.inventory":        "Inventory",
    "nav.raw":              "Raw",
    "nav.graph":            "Graph",
    "nav.requiredFields":   "Required fields",
    "nav.vulnerabilities":  "Vulnerabilities",
    "nav.import":           "Import",
    "nav.about":            "About",
    "nav.workspace.connected":"Connected to {branch} via Pitloom CI. Last weave {time}.",

    "kpi.components":       "Components",
    "kpi.fullyPresent":     "Fully present",
    "kpi.missingFields":    "Missing fields",
    "kpi.regulationsActive":"Regulations active",
    "kpi.acrossManifests":  "Across {n} manifests",
    "kpi.allFieldsFilled":  "All required fields filled",
    "kpi.componentsAffected":"{n} components affected",

    "inventory.title":      "Component inventory",
    "inventory.subtitle":   "Every thread Pitloom wove into this SBOM. Tap a row to see provenance.",
    "inventory.search":     "Search components or PURL",
    "inventory.checkedAgainst":"Checked against",
    "inventory.filter.all":           "All",
    "inventory.filter.missingFields": "Missing fields",
    "inventory.filter.unverified":    "Unverified",
    "inventory.filter.fullyPresent":  "Fully present",
    "inventory.columns":    "Columns",
    "inventory.export":     "Export",
    "inventory.showing":    "Showing {n} of {total} components",
    "inventory.format":     "Format",
    "inventory.col.component":"Component",
    "inventory.col.version":  "Version",
    "inventory.col.supplier": "Supplier",
    "inventory.col.license":  "License",
    "inventory.col.hash":     "Hash",
    "inventory.col.status":   "Status",
    "inventory.notDeclared":  "not declared",
  };

  // Sample translations for two locales -- proves the wiring without claiming
  // a finished translation set. Any missing key falls back to English.
  const STRINGS = {
    en,
    de: {
      "topbar.language": "Sprache",
      "topbar.guide":    "Anleitung",
      "topbar.skipToContent": "Zum Hauptinhalt springen",
      "nav.section.views": "Ansichten",
      "nav.section.conformance": "Konformität",
      "nav.section.security": "Sicherheit",
      "nav.section.source": "Quelle",
      "nav.section.help": "Hilfe",
      "nav.section.workspace": "Arbeitsbereich",
      "nav.overview":       "Übersicht",
      "nav.inventory":      "Inventar",
      "nav.raw":            "Rohdaten",
      "nav.graph":          "Graph",
      "nav.requiredFields": "Pflichtfelder",
      "nav.vulnerabilities":"Schwachstellen",
      "nav.import":         "Importieren",
      "nav.about":          "Über",
      "kpi.components":     "Komponenten",
      "kpi.fullyPresent":   "Vollständig",
      "kpi.missingFields":  "Fehlende Felder",
      "kpi.regulationsActive": "Regelwerke aktiv",
      "inventory.title":    "Komponenten-Inventar",
      "inventory.checkedAgainst": "Geprüft gegen",
    },
    ja: {
      "topbar.language": "言語",
      "topbar.guide":    "ガイド",
      "topbar.skipToContent": "メインコンテンツへスキップ",
      "nav.section.views": "ビュー",
      "nav.section.conformance": "適合性",
      "nav.section.security": "セキュリティ",
      "nav.section.source": "ソース",
      "nav.section.help": "ヘルプ",
      "nav.section.workspace": "ワークスペース",
      "nav.overview":       "概要",
      "nav.inventory":      "インベントリ",
      "nav.raw":            "生データ",
      "nav.graph":          "グラフ",
      "nav.requiredFields": "必須項目",
      "nav.vulnerabilities":"脆弱性",
      "nav.import":         "インポート",
      "nav.about":          "このアプリについて",
      "kpi.components":     "コンポーネント",
      "kpi.fullyPresent":   "完全",
      "kpi.missingFields":  "欠落項目",
      "kpi.regulationsActive": "適用規制",
      "inventory.title":    "コンポーネント一覧",
      "inventory.checkedAgainst": "対象規制",
    },
  };

  const STORAGE_KEY = "lumina-locale";
  let current = (typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY))
    || (navigator.language && LOCALES.find(l => navigator.language.toLowerCase().startsWith(l.code.toLowerCase()))?.code)
    || "en";
  const listeners = new Set();

  function getLocale() { return current; }
  function setLocale(code) {
    if (!LOCALES.find(l => l.code === code)) return;
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    document.documentElement.lang = code;
    listeners.forEach(fn => { try { fn(code); } catch (e) { /* ignore */ } });
  }
  function t(key, vars) {
    const lookup = STRINGS[current] && STRINGS[current][key];
    const str = lookup || STRINGS.en[key] || key;
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ""));
  }
  function formatNumber(n, opts) {
    try { return new Intl.NumberFormat(current, opts || {}).format(n); }
    catch (e) { return String(n); }
  }
  function formatDate(d, opts) {
    try { return new Intl.DateTimeFormat(current, opts || { dateStyle: "medium" }).format(new Date(d)); }
    catch (e) { return String(d); }
  }
  function formatRelativeTime(value, unit) {
    try { return new Intl.RelativeTimeFormat(current, { numeric: "auto" }).format(value, unit); }
    catch (e) { return `${value} ${unit}`; }
  }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  document.documentElement.lang = current;
  return { LOCALES, STRINGS, getLocale, setLocale, t, formatNumber, formatDate, formatRelativeTime, subscribe };
})();

// Convenience globals so any Babel-scoped file can call t() / formatNumber()
// without needing to import. Each script's scope still sees these via window.
window.t = (...a) => window.LUMINA_I18N.t(...a);
window.formatNumber = (...a) => window.LUMINA_I18N.formatNumber(...a);
window.formatDate = (...a) => window.LUMINA_I18N.formatDate(...a);
window.formatRelativeTime = (...a) => window.LUMINA_I18N.formatRelativeTime(...a);

// tNodes(key, vars) -- like t() but `vars` values can be React nodes. Splits
// the template on `{var}` placeholders and interleaves the node values, so
// you can interpolate <Mono>main</Mono> or <a>...</a> into a localized string
// without resorting to dangerouslySetInnerHTML.
window.tNodes = (key, vars) => {
  const tpl = window.LUMINA_I18N.t(key);
  const parts = tpl.split(/\{(\w+)\}/g); // text, key, text, key, …
  return parts.map((p, i) => i % 2 === 0 ? p : (vars && vars[p] !== undefined ? vars[p] : `{${p}}`));
};
