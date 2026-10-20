/*
SPDX-FileContributor: Arthit Suriyawongkul
SPDX-FileCopyrightText: 2026-present Arthit Suriyawongkul
SPDX-FileType: SOURCE
SPDX-License-Identifier: Apache-2.0
*/
// Lumina frontend -- i18n
//
// Scope: the app shell only (skip link, language picker, navigation, the main
// landmark's label). Screen content is English. Each catalogue below has every
// shell key; t() falls back to English for a key a catalogue lacks.
//
// Exposes window.LUMINA_I18N with:
//   LOCALES                 -- array of { code, label } for the picker; only
//                              locales that have a catalogue
//   STRINGS                 -- { [code]: { [key]: text } } catalogue
//   getLocale() / setLocale(code)
//   t(key, vars?)           -- lookup with English fallback + {var} interpolation
//   subscribe(fn)           -- listener for locale changes (returns unsubscribe)
//
// Accessibility:
//   - setLocale updates <html lang> so screen readers switch language.
//   - useLocale() (components.jsx) re-renders on a change so aria-labels stay in sync.

window.LUMINA_I18N = (() => {
  // Native-language labels so each option is readable by speakers of that
  // language.
  const LOCALES = [
    { code: "en", label: "English" },
    { code: "de", label: "Deutsch" },
    { code: "fr", label: "Français" },
    { code: "ga", label: "Gaeilge" },
    { code: "ja", label: "日本語"   },
    { code: "th", label: "ไทย"     },
  ];

  // English catalogue -- the source of truth. Use {var} placeholders for
  // runtime interpolation.
  const en = {
    "topbar.skipToContent": "Skip to main content",
    "topbar.language":      "Language",
    "topbar.changeLanguage":"Change language.",
    "topbar.title":         "Generate and check SBOMs against G7 SBOM for AI",
    "topbar.home":          "{title} -- go to main content",

    "nav.primary":          "Primary navigation",
    "nav.section.check":    "Check",
    "nav.section.help":     "Help",
    "nav.generate":         "Generate & check",
    "nav.upload":           "Upload SBOM",
    "nav.sarif":            "Import SARIF",
    "nav.about":            "About",

    "main.label":           "{screen} screen",
  };

  const STRINGS = {
    en,
    de: {
      "topbar.skipToContent": "Zum Hauptinhalt springen",
      "topbar.language":      "Sprache",
      "topbar.changeLanguage":"Sprache ändern.",
      "topbar.title":         "SBOMs erzeugen und gegen G7 SBOM for AI prüfen",
      "topbar.home":          "{title} -- zum Hauptinhalt",
      "nav.primary":          "Hauptnavigation",
      "nav.section.check":    "Prüfen",
      "nav.section.help":     "Hilfe",
      "nav.generate":         "Erzeugen & prüfen",
      "nav.upload":           "SBOM hochladen",
      "nav.sarif":            "SARIF importieren",
      "nav.about":            "Über",
      "main.label":           "Ansicht {screen}",
    },
    fr: {
      "topbar.skipToContent": "Passer au contenu principal",
      "topbar.language":      "Langue",
      "topbar.changeLanguage":"Changer de langue.",
      "topbar.title":         "Générer des SBOM et les vérifier selon G7 SBOM for AI",
      "topbar.home":          "{title} -- aller au contenu principal",
      "nav.primary":          "Navigation principale",
      "nav.section.check":    "Vérifier",
      "nav.section.help":     "Aide",
      "nav.generate":         "Générer et vérifier",
      "nav.upload":           "Téléverser un SBOM",
      "nav.sarif":            "Importer du SARIF",
      "nav.about":            "À propos",
      "main.label":           "Écran {screen}",
    },
    ga: {
      "topbar.skipToContent": "Léim go dtí an príomhábhar",
      "topbar.language":      "Teanga",
      "topbar.changeLanguage":"Athraigh teanga.",
      "topbar.title":         "Gin SBOManna agus seiceáil iad i gcoinne G7 SBOM for AI",
      "topbar.home":          "{title} -- téigh chuig an bpríomhábhar",
      "nav.primary":          "Príomhnascleanúint",
      "nav.section.check":    "Seiceáil",
      "nav.section.help":     "Cabhair",
      "nav.generate":         "Gin agus seiceáil",
      "nav.upload":           "Uaslódáil SBOM",
      "nav.sarif":            "Iompórtáil SARIF",
      "nav.about":            "Maidir leis",
      "main.label":           "Scáileán {screen}",
    },
    ja: {
      "topbar.skipToContent": "メインコンテンツへスキップ",
      "topbar.language":      "言語",
      "topbar.changeLanguage":"言語を変更します。",
      "topbar.title":         "SBOM を生成して G7 SBOM for AI に照らしてチェック",
      "topbar.home":          "{title} -- メインコンテンツへ",
      "nav.primary":          "メインナビゲーション",
      "nav.section.check":    "チェック",
      "nav.section.help":     "ヘルプ",
      "nav.generate":         "生成してチェック",
      "nav.upload":           "SBOM をアップロード",
      "nav.sarif":            "SARIF をインポート",
      "nav.about":            "このアプリについて",
      "main.label":           "{screen} 画面",
    },
    th: {
      "topbar.skipToContent": "ข้ามไปยังเนื้อหาหลัก",
      "topbar.language":      "ภาษา",
      "topbar.changeLanguage":"เปลี่ยนภาษา",
      "topbar.title":         "สร้าง SBOM และตรวจสอบตาม G7 SBOM for AI",
      "topbar.home":          "{title} -- ไปยังเนื้อหาหลัก",
      "nav.primary":          "การนำทางหลัก",
      "nav.section.check":    "ตรวจสอบ",
      "nav.section.help":     "ความช่วยเหลือ",
      "nav.generate":         "สร้างและตรวจสอบ",
      "nav.upload":           "อัปโหลด SBOM",
      "nav.sarif":            "นำเข้า SARIF",
      "nav.about":            "เกี่ยวกับ",
      "main.label":           "หน้าจอ {screen}",
    },
  };

  const STORAGE_KEY = "lumina-locale";
  const known = (code) => LOCALES.some(l => l.code === code);
  function stored() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  const fromBrowser = (navigator.language || "").toLowerCase().split("-")[0];
  let current = known(stored()) ? stored() : known(fromBrowser) ? fromBrowser : "en";
  const listeners = new Set();

  function getLocale() { return current; }
  function setLocale(code) {
    if (!known(code)) return;
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
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  document.documentElement.lang = current;
  return { LOCALES, STRINGS, getLocale, setLocale, t, subscribe };
})();
