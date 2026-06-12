import { describe, expect, test } from "vitest";
import {
  DEFAULT_LOCALE,
  detectPreferredLocale,
  getLocaleDirection,
  resolveLocale,
} from ".";

describe("locale resolution", () => {
  test("maps common regional variants to supported base languages", () => {
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("en-GB")).toBe("en");
    expect(resolveLocale("hi-IN")).toBe("hi");
    expect(resolveLocale("es-MX")).toBe("es");
    expect(resolveLocale("es-ES")).toBe("es");
    expect(resolveLocale("zh-CN")).toBe("zh-Hans");
    expect(resolveLocale("zh-SG")).toBe("zh-Hans");
    expect(resolveLocale("it-IT")).toBe("it");
    expect(resolveLocale("ko-KR")).toBe("ko");
    expect(resolveLocale("id-ID")).toBe("id");
    expect(resolveLocale("tr-TR")).toBe("tr");
    expect(resolveLocale("vi-VN")).toBe("vi");
    expect(resolveLocale("bn-BD")).toBe("bn");
  });

  test("falls back to English for unsupported or empty locale codes", () => {
    expect(resolveLocale("nl-NL")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  test("detects first supported browser language", () => {
    expect(detectPreferredLocale(["nl-NL", "ru-RU", "en-US"])).toBe("ru");
    expect(detectPreferredLocale(["nl-NL", "en-GB"])).toBe("en");
    expect(detectPreferredLocale(["nl-NL", "ko-KR", "en-US"])).toBe("ko");
  });

  test("reports right-to-left direction for Arabic only", () => {
    expect(getLocaleDirection("ar")).toBe("rtl");
    expect(getLocaleDirection("en")).toBe("ltr");
  });
});
