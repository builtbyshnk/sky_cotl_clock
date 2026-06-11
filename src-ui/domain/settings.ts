import type { AppSettings, EventDefinition } from "./types";

function detectLocalTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function isValidTimeZone(timeZone: string | undefined) {
  if (!timeZone) {
    return false;
  }

  try {
    new Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

const OVERLAY_MODES: AppSettings["overlay"]["mode"][] = [
  "clock",
  "route",
  "mini-map",
  "clock-route",
];
const SKY_PROCESS_NAMES = [
  "Sky.exe",
  "Sky",
  "Sky-Win64-Shipping.exe",
];

export const EVENT_DEFINITIONS: EventDefinition[] = [
  {
    id: "daily-reset",
    title: "Daily Reset",
    category: "reset",
    enabledByDefault: true,
    priority: 20,
    source: "official",
  },
  {
    id: "eden-reset",
    title: "Eden Reset",
    category: "weekly",
    enabledByDefault: true,
    priority: 18,
    source: "wiki",
  },
  {
    id: "geyser",
    title: "Sanctuary Geyser",
    category: "wax",
    location: "Sanctuary Islands",
    enabledByDefault: true,
    priority: 100,
    source: "wiki",
  },
  {
    id: "grandma",
    title: "Grandma Dinner",
    category: "wax",
    location: "Elevated Clearing",
    enabledByDefault: true,
    priority: 95,
    source: "wiki",
  },
  {
    id: "turtle",
    title: "Sunset Turtle",
    category: "wax",
    location: "Sanctuary Islands",
    enabledByDefault: true,
    priority: 90,
    source: "wiki",
  },
  {
    id: "forest-rainbow",
    title: "Forest Rainbow",
    category: "wax",
    location: "Forest Brook",
    enabledByDefault: true,
    priority: 64,
    source: "wiki",
  },
  {
    id: "shard-eruption",
    title: "Shard Eruption",
    category: "shard",
    enabledByDefault: true,
    priority: 85,
    source: "community",
  },
  {
    id: "traveling-spirit",
    title: "Traveling Spirit",
    category: "seasonal",
    enabledByDefault: false,
    priority: 35,
    source: "wiki",
  },
];

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  appearance: {
    accentColor: "mira",
    fontFamily: "inter",
  },
  overlay: {
    enabled: true,
    gameDetection: {
      enabled: false,
      startupDelayMs: 3_000,
      processNames: SKY_PROCESS_NAMES,
    },
    mode: "clock",
    position: "top-right",
    opacity: 0.92,
    scale: 1,
    maxEvents: 5,
    cornerRadius: 0,
    clickThrough: true,
    miniMap: {
      expanded: false,
      size: 300,
    },
  },
  hotkeys: {
    toggleOverlay: "F8",
    showMainWindow: "Shift+F8",
    cycleOverlayMode: "F9",
    nextRouteTarget: "F10",
    previousRouteTarget: "Shift+F10",
    toggleRouteTargetComplete: "F11",
    toggleMiniMapExpanded: "Shift+F11",
  },
  events: Object.fromEntries(
    EVENT_DEFINITIONS.map((definition) => [
      definition.id,
      definition.enabledByDefault,
    ]),
  ),
  display: {
    timeFormat: "system",
    localTimeZone: detectLocalTimeZone(),
    showSkyTime: true,
    showLocalTime: true,
    warningMinutes: [5, 15, 30],
  },
};

export function mergeSettings(stored: Partial<AppSettings> | null): AppSettings {
  if (!stored) {
    return DEFAULT_SETTINGS;
  }

  const display = { ...DEFAULT_SETTINGS.display, ...stored.display };
  if (!isValidTimeZone(display.localTimeZone)) {
    display.localTimeZone = detectLocalTimeZone();
  }

  const overlay = {
    ...DEFAULT_SETTINGS.overlay,
    ...stored.overlay,
    gameDetection: {
      ...DEFAULT_SETTINGS.overlay.gameDetection,
      ...stored.overlay?.gameDetection,
      processNames:
        stored.overlay?.gameDetection?.processNames?.filter(Boolean) ??
        DEFAULT_SETTINGS.overlay.gameDetection.processNames,
    },
    miniMap: {
      ...DEFAULT_SETTINGS.overlay.miniMap,
      ...stored.overlay?.miniMap,
    },
  };
  const overlayMode = OVERLAY_MODES.includes(overlay.mode)
    ? overlay.mode
    : DEFAULT_SETTINGS.overlay.mode;

  return {
    theme: stored.theme ?? DEFAULT_SETTINGS.theme,
    appearance: { ...DEFAULT_SETTINGS.appearance, ...stored.appearance },
    overlay: {
      ...overlay,
      mode: overlayMode,
      opacity: clampNumber(overlay.opacity, 0.2, 1, DEFAULT_SETTINGS.overlay.opacity),
      maxEvents: Math.round(
        clampNumber(overlay.maxEvents, 3, 8, DEFAULT_SETTINGS.overlay.maxEvents),
      ),
      gameDetection: {
        ...overlay.gameDetection,
        startupDelayMs: Math.round(
          clampNumber(
            overlay.gameDetection.startupDelayMs,
            2_000,
            5_000,
            DEFAULT_SETTINGS.overlay.gameDetection.startupDelayMs,
          ),
        ),
      },
      miniMap: {
        ...overlay.miniMap,
        size: Math.round(
          clampNumber(
            overlay.miniMap.size,
            220,
            420,
            DEFAULT_SETTINGS.overlay.miniMap.size,
          ),
        ),
      },
    },
    hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...stored.hotkeys },
    events: { ...DEFAULT_SETTINGS.events, ...stored.events },
    display,
  };
}
