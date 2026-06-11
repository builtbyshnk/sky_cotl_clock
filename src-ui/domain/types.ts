export type EventCategory = "reset" | "wax" | "weekly" | "shard" | "seasonal";

export type EventStatus =
  | "upcoming"
  | "preparing"
  | "active"
  | "endingSoon"
  | "ended";

export interface EventDefinition {
  id: string;
  title: string;
  category: EventCategory;
  location?: string;
  enabledByDefault: boolean;
  priority: number;
  source: "official" | "wiki" | "community";
}

export interface EventInstance {
  definitionId: string;
  title: string;
  category: EventCategory;
  status: EventStatus;
  startsAtUtc: string;
  endsAtUtc?: string;
  skyTimeLabel: string;
  localTimeLabel: string;
  countdownMs: number;
  phaseLabel?: string;
  location?: string;
  source: EventDefinition["source"];
  priority: number;
  rewardLabel?: string;
}

export interface AppSettings {
  theme: "dark" | "light" | "system";
  appearance: {
    accentColor:
      | "mira"
      | "blue"
      | "violet"
      | "rose"
      | "amber"
      | "emerald"
      | "cyan"
      | "slate";
    fontFamily:
      | "system"
      | "inter"
      | "montserrat"
      | "lexend"
      | "nunito"
      | "outfit"
      | "work-sans"
      | "source-sans-3";
  };
  overlay: {
    enabled: boolean;
    gameDetection: {
      enabled: boolean;
      startupDelayMs: number;
      processNames: string[];
    };
    mode: "clock" | "route" | "mini-map" | "clock-route";
    position:
      | "top-right"
      | "top-left"
      | "bottom-right"
      | "bottom-left"
      | "custom";
    opacity: number;
    scale: number;
    maxEvents: number;
    cornerRadius: number;
    clickThrough: boolean;
    miniMap: {
      expanded: boolean;
      size: number;
    };
  };
  hotkeys: {
    toggleOverlay: string;
    showMainWindow: string;
    cycleOverlayMode: string;
    nextRouteTarget: string;
    previousRouteTarget: string;
    toggleRouteTargetComplete: string;
    toggleMiniMapExpanded: string;
  };
  events: Record<string, boolean>;
  display: {
    timeFormat: "system" | "12h" | "24h";
    localTimeZone: string;
    showSkyTime: boolean;
    showLocalTime: boolean;
    warningMinutes: number[];
  };
}
