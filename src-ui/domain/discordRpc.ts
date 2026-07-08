import type { AppSettings, EventInstance } from "./types";
import type { PlannerState } from "./planner";

export const ISEKAI_DISCORD_URL =
  "https://github.com/builtbyshnk/sky_cotl_clock";
export const SKY_DISCORD_URL = "https://www.thatskygame.com/";

export interface DiscordRpcButtonPayload {
  label: string;
  url: string;
}

export interface DiscordRpcPresencePayload {
  details: string;
  state: string;
  largeImageKey: string;
  largeImageText: string;
  smallImageKey: string;
  smallImageText: string;
  startTimestamp?: number;
  endTimestamp?: number;
  buttons: DiscordRpcButtonPayload[];
}

export interface DiscordRpcBuildInput {
  settings: AppSettings;
  events: EventInstance[];
  planner: PlannerState;
  skyProcessRunning: boolean;
  sessionStartedAtMs: number;
}

interface PresenceSource {
  details: string;
  state: string;
  endTimestamp?: number;
}

const MAX_FIELD_LENGTH = 128;

export function buildDiscordRpcPresence({
  settings,
  events,
  planner,
  skyProcessRunning,
  sessionStartedAtMs,
}: DiscordRpcBuildInput): DiscordRpcPresencePayload | null {
  if (
    !settings.discordRpc.enabled ||
    (settings.discordRpc.requireSkyDetection && !skyProcessRunning)
  ) {
    return null;
  }

  const source = selectPresenceSource(settings, events, planner);
  const buttons = settings.discordRpc.showButtons
    ? [
        { label: "Isekai", url: ISEKAI_DISCORD_URL },
        { label: "Sky", url: SKY_DISCORD_URL },
      ]
    : [];

  return {
    details: clampDiscordField(source.details),
    state: clampDiscordField(source.state),
    largeImageKey: "isekai_logo",
    largeImageText: "Isekai for Sky: Children of the Light",
    smallImageKey: "sky_logo",
    smallImageText: "Playing Sky",
    startTimestamp: Math.floor(sessionStartedAtMs / 1_000),
    endTimestamp: source.endTimestamp,
    buttons,
  };
}

function selectPresenceSource(
  settings: AppSettings,
  events: EventInstance[],
  planner: PlannerState,
): PresenceSource {
  const mode = settings.discordRpc.mode;
  const sources: Record<Exclude<typeof mode, "auto">, () => PresenceSource | null> = {
    events: () => eventPresence(events),
    candleRun: () => candleRunPresence(planner),
    route: () => routePresence(planner),
    goals: () => goalsPresence(planner),
    overlay: () => overlayPresence(settings),
  };

  if (mode !== "auto") {
    return sources[mode]() ?? presetPresence(settings.discordRpc.safePreset);
  }

  return (
    eventPresence(events) ??
    candleRunPresence(planner) ??
    routePresence(planner) ??
    goalsPresence(planner) ??
    overlayPresence(settings) ??
    presetPresence(settings.discordRpc.safePreset)
  );
}

function eventPresence(events: EventInstance[]): PresenceSource | null {
  const event = events.find((candidate) =>
    ["active", "preparing", "upcoming", "endingSoon"].includes(candidate.status),
  );
  if (!event) {
    return null;
  }

  const endTimestamp =
    event.status === "upcoming"
      ? Date.parse(event.startsAtUtc) / 1_000
      : event.endsAtUtc
        ? Date.parse(event.endsAtUtc) / 1_000
        : undefined;
  const state = [event.location, event.phaseLabel]
    .filter(Boolean)
    .join(" - ");

  return {
    details:
      event.status === "active" || event.status === "endingSoon"
        ? `Tracking ${event.title}`
        : `Waiting for ${event.title}`,
    state: state || "Playing Sky with Isekai",
    endTimestamp: Number.isFinite(endTimestamp) ? endTimestamp : undefined,
  };
}

function candleRunPresence(planner: PlannerState): PresenceSource | null {
  return planner.candleRun.activeRunGuid ? presetPresence("farmingWax") : null;
}

function routePresence(planner: PlannerState): PresenceSource | null {
  return planner.activeRoute.areaGuid ? presetPresence("planning") : null;
}

function goalsPresence(planner: PlannerState): PresenceSource | null {
  const openGoals = planner.goals.filter((goal) => goal.status !== "done");
  if (openGoals.length === 0) {
    return null;
  }

  const dueDates = openGoals
    .map((goal) => goal.dueDate)
    .filter((dueDate): dueDate is string => Boolean(dueDate))
    .sort();

  return {
    details: "Tracking Sky goals",
    state: dueDates[0]
      ? `${openGoals.length} open goals, next due ${dueDates[0]}`
      : `${openGoals.length} open goals with Isekai`,
  };
}

function overlayPresence(settings: AppSettings): PresenceSource {
  const modeLabel: Record<AppSettings["overlay"]["mode"], string> = {
    clock: "clock",
    route: "route",
    "mini-map": "mini map",
    "clock-route": "clock + route",
  };

  return {
    details: "Using Isekai overlay",
    state: `${modeLabel[settings.overlay.mode]} mode for Sky`,
  };
}

function presetPresence(
  preset: AppSettings["discordRpc"]["safePreset"],
): PresenceSource {
  const presets: Record<AppSettings["discordRpc"]["safePreset"], PresenceSource> = {
    planning: {
      details: "Planning a Sky session",
      state: "Using Isekai for Sky",
    },
    farmingWax: {
      details: "Planning candle run",
      state: "Playing Sky with Isekai",
    },
    trackingGoals: {
      details: "Tracking Sky goals",
      state: "Using Isekai for Sky",
    },
    watchingTimers: {
      details: "Watching Sky timers",
      state: "Using Isekai for Sky",
    },
  };

  return presets[preset] ?? presets.planning;
}

function clampDiscordField(value: string) {
  if (value.length <= MAX_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_FIELD_LENGTH - 3)}...`;
}
