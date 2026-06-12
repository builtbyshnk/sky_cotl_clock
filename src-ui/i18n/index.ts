import { useMemo } from "react";
import { ar } from "./messages/ar";
import { bn } from "./messages/bn";
import { de } from "./messages/de";
import { en, type MessageKey } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";
import { hi } from "./messages/hi";
import { id } from "./messages/id";
import { it } from "./messages/it";
import { ja } from "./messages/ja";
import { ko } from "./messages/ko";
import { pt } from "./messages/pt";
import { ru } from "./messages/ru";
import { tr } from "./messages/tr";
import { vi } from "./messages/vi";
import { zhHans } from "./messages/zh-Hans";

export type LocaleCode =
  | "en"
  | "hi"
  | "es"
  | "zh-Hans"
  | "ru"
  | "ar"
  | "fr"
  | "pt"
  | "de"
  | "ja"
  | "it"
  | "ko"
  | "id"
  | "tr"
  | "vi"
  | "bn";

export type LocaleDirection = "ltr" | "rtl";

export const DEFAULT_LOCALE: LocaleCode = "en";

export const SUPPORTED_LOCALES: Array<{
  code: LocaleCode;
  nativeName: string;
  englishName: string;
  direction: LocaleDirection;
}> = [
  { code: "en", nativeName: "English", englishName: "English", direction: "ltr" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", direction: "ltr" },
  { code: "es", nativeName: "Español", englishName: "Spanish", direction: "ltr" },
  { code: "zh-Hans", nativeName: "简体中文", englishName: "Mandarin Chinese", direction: "ltr" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", direction: "ltr" },
  { code: "ar", nativeName: "العربية", englishName: "Arabic", direction: "rtl" },
  { code: "fr", nativeName: "Français", englishName: "French", direction: "ltr" },
  { code: "pt", nativeName: "Português", englishName: "Portuguese", direction: "ltr" },
  { code: "de", nativeName: "Deutsch", englishName: "German", direction: "ltr" },
  { code: "ja", nativeName: "日本語", englishName: "Japanese", direction: "ltr" },
  { code: "it", nativeName: "Italiano", englishName: "Italian", direction: "ltr" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", direction: "ltr" },
  { code: "id", nativeName: "Bahasa Indonesia", englishName: "Indonesian", direction: "ltr" },
  { code: "tr", nativeName: "Türkçe", englishName: "Turkish", direction: "ltr" },
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", direction: "ltr" },
  { code: "bn", nativeName: "বাংলা", englishName: "Bengali", direction: "ltr" },
];

const SUPPORTED_CODES = new Set<LocaleCode>(
  SUPPORTED_LOCALES.map((locale) => locale.code),
);

const MESSAGES: Record<LocaleCode, Record<MessageKey, string>> = {
  en,
  hi,
  es,
  "zh-Hans": zhHans,
  ru,
  ar,
  fr,
  pt,
  de,
  ja,
  it,
  ko,
  id,
  tr,
  vi,
  bn,
};

export function resolveLocale(locale: string | undefined | null): LocaleCode {
  if (!locale) {
    return DEFAULT_LOCALE;
  }

  const normalized = locale.trim().replace("_", "-");
  if (!normalized) {
    return DEFAULT_LOCALE;
  }

  if (normalized.toLowerCase().startsWith("zh")) {
    return "zh-Hans";
  }

  const base = normalized.split("-")[0]?.toLowerCase();
  if (base && SUPPORTED_CODES.has(base as LocaleCode)) {
    return base as LocaleCode;
  }

  return DEFAULT_LOCALE;
}

export function detectPreferredLocale(
  languages: readonly string[] | undefined =
    typeof navigator === "undefined" ? undefined : navigator.languages,
): LocaleCode {
  for (const language of languages ?? []) {
    const resolved = resolveLocale(language);
    if (resolved !== DEFAULT_LOCALE || language.toLowerCase().startsWith("en")) {
      return resolved;
    }
  }

  if (typeof navigator !== "undefined") {
    return resolveLocale(navigator.language);
  }

  return DEFAULT_LOCALE;
}

export function getLocaleDirection(locale: LocaleCode): LocaleDirection {
  return (
    SUPPORTED_LOCALES.find((supportedLocale) => supportedLocale.code === locale)
      ?.direction ?? "ltr"
  );
}

export function translate(
  locale: LocaleCode,
  key: MessageKey,
  values?: Record<string, string | number>,
) {
  let message = MESSAGES[locale]?.[key] ?? en[key] ?? key;
  if (!values) {
    return message;
  }

  for (const [name, value] of Object.entries(values)) {
    message = message.split(`{${name}}`).join(String(value));
  }

  return message;
}

export function useI18n(locale: LocaleCode) {
  return useMemo(
    () => ({
      locale,
      direction: getLocaleDirection(locale),
      t: (key: MessageKey, values?: Record<string, string | number>) =>
        translate(locale, key, values),
    }),
    [locale],
  );
}

export type { MessageKey };
