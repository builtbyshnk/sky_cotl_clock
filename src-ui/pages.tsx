import { useEffect, useMemo, useState } from "react";
import type * as React from "react";
import type { AnimationEvent } from "react";
import { createPortal } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bell,
  BellOff,
  CalendarClock,
  CircleCheck,
  Clock,
  Download,
  ExternalLink,
  Eye,
  Flame,
  Gamepad2,
  Info,
  Keyboard,
  Monitor,
  Palette,
  Plus,
  RefreshCw,
  Search,
  Star,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EVENT_DEFINITIONS } from "@/domain/settings";
import { ACCENT_OPTIONS, FONT_OPTIONS } from "@/domain/theme";
import {
  createGoal,
  resetAllRouteProgress,
  resetCandleRunProgress,
  resetCurrentAreaRoute,
  setActiveCandleRun,
  setActiveRoute,
  toggleCandleGroupComplete,
  type PlannerGoal,
  type PlannerState,
} from "@/domain/planner";
import {
  formatDuration,
  formatLocalDateTime,
  skyNow,
} from "@/domain/skyTime";
import type { AppSettings, EventInstance } from "@/domain/types";
import {
  ISEKAI_DISCORD_URL,
  SKY_DISCORD_URL,
  type DiscordRpcPresencePayload,
} from "@/domain/discordRpc";
import {
  SUPPORTED_LOCALES,
  useI18n,
  type LocaleCode,
  type MessageKey,
} from "@/i18n";
import type {
  SkyAreaRoute,
  SkyCalendarEntry,
  SkyCandleGroup,
  SkyCandleRunSummary,
  SkyItemSummary,
  SkyRouteTarget,
} from "@/data/skygame";
import { countCandleGroupWax, skyDataIndex } from "@/data/skygame";
import { formatBytes, type AppUpdateState } from "@/tauri/updater";
import type { DiscordRpcStatus } from "@/tauri/discord-rpc";
import { isTauriRuntime } from "@/tauri/overlay";

type SkyDataModule = typeof import("@/data/skygame");

const LOCAL_TIME_ZONE_OPTIONS = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "America/Buenos_Aires",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const OVERLAY_POSITION_OPTIONS: Array<{
  value: AppSettings["overlay"]["position"];
  labelKey: MessageKey;
}> = [
  { value: "top-right", labelKey: "overlay.position.topRight" },
  { value: "bottom-right", labelKey: "overlay.position.bottomRight" },
  { value: "top-left", labelKey: "overlay.position.topLeft" },
  { value: "bottom-left", labelKey: "overlay.position.bottomLeft" },
];

const OVERLAY_MODE_OPTIONS: Array<{
  value: AppSettings["overlay"]["mode"];
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    value: "clock",
    labelKey: "overlay.mode.clock",
    descriptionKey: "overlay.mode.clock.description",
  },
  {
    value: "route",
    labelKey: "overlay.mode.route",
    descriptionKey: "overlay.mode.route.description",
  },
  {
    value: "mini-map",
    labelKey: "overlay.mode.miniMap",
    descriptionKey: "overlay.mode.miniMap.description",
  },
  {
    value: "clock-route",
    labelKey: "overlay.mode.clockRoute",
    descriptionKey: "overlay.mode.clockRoute.description",
  },
];

const DISCORD_RPC_MODE_OPTIONS: Array<{
  value: AppSettings["discordRpc"]["mode"];
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    value: "auto",
    labelKey: "discordRpc.mode.auto",
    descriptionKey: "discordRpc.mode.auto.description",
  },
  {
    value: "events",
    labelKey: "discordRpc.mode.events",
    descriptionKey: "discordRpc.mode.events.description",
  },
  {
    value: "candleRun",
    labelKey: "discordRpc.mode.candleRun",
    descriptionKey: "discordRpc.mode.candleRun.description",
  },
  {
    value: "route",
    labelKey: "discordRpc.mode.route",
    descriptionKey: "discordRpc.mode.route.description",
  },
  {
    value: "goals",
    labelKey: "discordRpc.mode.goals",
    descriptionKey: "discordRpc.mode.goals.description",
  },
  {
    value: "overlay",
    labelKey: "discordRpc.mode.overlay",
    descriptionKey: "discordRpc.mode.overlay.description",
  },
];

const DISCORD_RPC_PRESET_OPTIONS: Array<{
  value: AppSettings["discordRpc"]["safePreset"];
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}> = [
  {
    value: "planning",
    labelKey: "discordRpc.preset.planning",
    descriptionKey: "discordRpc.preset.planning.description",
  },
  {
    value: "farmingWax",
    labelKey: "discordRpc.preset.farmingWax",
    descriptionKey: "discordRpc.preset.farmingWax.description",
  },
  {
    value: "trackingGoals",
    labelKey: "discordRpc.preset.trackingGoals",
    descriptionKey: "discordRpc.preset.trackingGoals.description",
  },
  {
    value: "watchingTimers",
    labelKey: "discordRpc.preset.watchingTimers",
    descriptionKey: "discordRpc.preset.watchingTimers.description",
  },
];

function getTimeZoneOptions(selectedTimeZone: string) {
  return Array.from(
    new Set([...LOCAL_TIME_ZONE_OPTIONS, selectedTimeZone]),
  ).filter(Boolean);
}

function useSkyData(options: { defer?: boolean } = {}) {
  const [module, setModule] = useState<SkyDataModule | null>(null);

  useEffect(() => {
    let mounted = true;
    let timeoutId: number | null = null;

    const load = () => void import("@/data/skygame").then((loaded) => {
      if (mounted) {
        setModule(loaded);
      }
    });

    if (options.defer) {
      timeoutId = window.setTimeout(load, 180);
    } else {
      load();
    }

    return () => {
      mounted = false;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [options.defer]);

  return module;
}

function toDateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysIso(date: string, days: number) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2 border-b border-border bg-background/85 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h1 className="text-xl font-semibold tracking-normal text-foreground">
          {title}
        </h1>
        <p className="max-w-2xl text-xs font-medium text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </header>
  );
}

export function OverviewPage({
  now,
  events,
  planner,
  settings,
  reminders,
  onToggleOverlay,
  onToggleReminder,
}: {
  now: Date;
  events: EventInstance[];
  planner: PlannerState;
  settings: AppSettings;
  reminders: Record<string, boolean>;
  onToggleOverlay: () => void;
  onToggleReminder: (event: EventInstance) => void;
}) {
  const skyData = useSkyData({ defer: true });
  const skyClock = skyNow(now);
  const upcoming = events.find((event) => event.status === "upcoming");
  const dailyReset = events.find((event) => event.definitionId === "daily-reset");
  const edenReset = events.find((event) => event.definitionId === "eden-reset");
  const nextSeasonal = useMemo(
    () =>
      skyData
        ? skyData.skyDataIndex.getUpcomingSeasonalEntries(now).slice(0, 4)
        : [],
    [now, skyData],
  );

  return (
    <>
      <PageHeader
        title="Overview"
        description="A compact command center for Sky time, timers, and personal goals."
        action={
          <Button type="button" onClick={onToggleOverlay}>
            <Eye className="size-4" />
            Toggle overlay
          </Button>
        }
      />
      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-4">
            <MetricCard
              title="Sky Mean Time"
              value={skyClock.toLocaleString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                second: "2-digit",
                timeZoneName: "short",
              })}
              icon={<Clock />}
            />
            <MetricCard
              title="Local Time"
              value={formatLocalDateTime(
                now,
                settings.display.timeFormat,
                settings.display.localTimeZone,
              )}
              icon={<Clock />}
            />
            <MetricCard
              title="Daily Candle Reset"
              value={dailyReset ? formatDuration(dailyReset.countdownMs) : "--"}
              icon={<Clock />}
            />
            <MetricCard
              title="Weekly Eden Reset"
              value={edenReset ? formatDuration(edenReset.countdownMs) : "--"}
              icon={<Clock />}
            />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Now / Upcoming</CardTitle>
              <CardDescription>Countdowns are local and Sky-time aware.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {events.slice(0, 10).map((event) => (
                <EventRow
                  key={`${event.definitionId}-${event.startsAtUtc}`}
                  event={event}
                  reminderEnabled={Boolean(reminders[eventReminderKey(event)])}
                  onToggleReminder={onToggleReminder}
                />
              ))}
            </CardContent>
          </Card>
        </div>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Next Event</CardTitle>
              <CardDescription>
                {upcoming ? upcoming.title : "Nothing upcoming"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold tabular-nums">
                {upcoming ? formatDuration(upcoming.countdownMs) : "--"}
              </p>
              {upcoming ? (
                <p className="text-sm text-muted-foreground">
                  {upcoming.localTimeLabel} local / {upcoming.skyTimeLabel}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Seasonal Calendar</CardTitle>
              <CardDescription>Upcoming seasonal and event date ranges.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {nextSeasonal.length > 0 ? (
                nextSeasonal.map((entry) => (
                  <CalendarEntryRow key={entry.guid} entry={entry} />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Loading planner data...
                </p>
              )}
            </CardContent>
          </Card>
          <OverlayPreview events={events} planner={planner} settings={settings} />
        </div>
      </div>
    </>
  );
}

export function CalendarPage({
  selectedDate,
  planner,
}: {
  selectedDate: Date;
  planner: PlannerState;
}) {
  const skyData = useSkyData();
  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const startIso = toDateIso(monthStart);
  const endIso = addDaysIso(startIso, 41);
  const filterKinds = useMemo(
    () =>
      [
        planner.calendarFilters.events ? "event" : null,
        planner.calendarFilters.seasons ? "season" : null,
        planner.calendarFilters.travelingSpirits ? "traveling-spirit" : null,
      ].filter(Boolean) as Array<SkyCalendarEntry["kind"]>,
    [
      planner.calendarFilters.events,
      planner.calendarFilters.seasons,
      planner.calendarFilters.travelingSpirits,
    ],
  );
  const entries = useMemo(
    () =>
      skyData
        ? skyData.skyDataIndex.getCalendarEntries({
            startDate: startIso,
            endDate: endIso,
            kinds: filterKinds,
          })
        : [],
    [endIso, filterKinds, skyData, startIso],
  );
  const goals = planner.calendarFilters.goals
    ? planner.goals.filter((goal) => goal.dueDate && goal.dueDate >= startIso && goal.dueDate <= endIso)
    : [];
  const grouped = useMemo(
    () => groupCalendar(entries, goals, startIso, endIso),
    [endIso, entries, goals, startIso],
  );

  return (
    <>
      <PageHeader
        title="Calendar"
        description="Sky event ranges, traveling spirits, seasons, and your goal due dates."
      />
      <div className="grid gap-4 p-5 xl:grid-cols-[1fr_300px]">
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 42 }).map((_, index) => {
            const date = addDaysIso(startIso, index);
            const dayItems = grouped.get(date) ?? [];

            return (
              <div
                key={date}
                className="min-h-28 rounded-md border border-border bg-card/80 p-2.5 shadow-[0_1px_1px_color-mix(in_oklch,var(--foreground)_5%,transparent)] transition-colors hover:bg-muted/25"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-sm font-medium">{date}</span>
                  <Badge variant="secondary">{dayItems.length}</Badge>
                </div>
                <div className="grid gap-1">
                  {dayItems.slice(0, 4).map((item) => (
                    <div key={item.id} className="truncate text-xs text-muted-foreground">
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Selected Month</CardTitle>
            <CardDescription>{startIso} through {endIso}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {entries.slice(0, 12).map((entry) => (
              <CalendarEntryRow key={entry.guid} entry={entry} />
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function RoutesPage({
  planner,
  onPlannerChange,
}: {
  planner: PlannerState;
  onPlannerChange: (planner: PlannerState) => void;
}) {
  const skyData = useSkyData();
  const realms = useMemo(() => skyData?.skyDataIndex.getRealms() ?? [], [skyData]);
  const selectedRealmGuid =
    planner.activeRoute.realmGuid ?? realms.find((realm) => realm.areaGuids.length > 0)?.guid;
  const areas = useMemo(
    () =>
      skyData && selectedRealmGuid
        ? skyData.skyDataIndex.getAreasForRealm(selectedRealmGuid)
        : [],
    [selectedRealmGuid, skyData],
  );
  const selectedAreaGuid =
    planner.activeRoute.areaGuid ?? areas.find((area) => area.spiritGuids.length + area.wingedLightGuids.length > 0)?.guid;
  const areaRoute = selectedAreaGuid && skyData
    ? skyData.skyDataIndex.getAreaRoute(selectedAreaGuid)
    : null;
  const routeTargets = useMemo(
    () =>
      selectedAreaGuid && skyData
        ? skyData.skyDataIndex.getRouteTargets(
            selectedAreaGuid,
            planner.activeRoute.filters,
          )
        : [],
    [planner.activeRoute.filters, selectedAreaGuid, skyData],
  );
  const activeTarget =
    skyData?.skyDataIndex.getActiveRouteTarget(
      planner.activeRoute,
      planner.routeProgress,
    )?.target ?? routeTargets[0] ?? null;
  const completedCount = routeTargets.filter(
    (target) => planner.routeProgress.completedTargets[target.guid],
  ).length;
  const connections =
    skyData && areaRoute
      ? areaRoute.connectionGuids
          .map((guid) => skyData.skyDataIndex.getArea(guid))
          .filter(Boolean)
      : [];

  function updateRoute(input: {
    realmGuid?: string;
    areaGuid?: string;
    spirits?: boolean;
    wingedLights?: boolean;
  }) {
    const nextRealmGuid = input.realmGuid ?? selectedRealmGuid;
    const nextAreas =
      skyData && nextRealmGuid ? skyData.skyDataIndex.getAreasForRealm(nextRealmGuid) : [];
    const nextAreaGuid =
      input.areaGuid ??
      (input.realmGuid
        ? nextAreas.find((area) => area.spiritGuids.length + area.wingedLightGuids.length > 0)?.guid
        : selectedAreaGuid);

    onPlannerChange(
      setActiveRoute(planner, {
        realmGuid: nextRealmGuid,
        areaGuid: nextAreaGuid,
        filters: {
          spirits: input.spirits ?? planner.activeRoute.filters.spirits,
          wingedLights:
            input.wingedLights ?? planner.activeRoute.filters.wingedLights,
        },
      }),
    );
  }

  function resetArea() {
    onPlannerChange(
      resetCurrentAreaRoute(
        planner,
        routeTargets.map((target) => target.guid),
      ),
    );
  }

  return (
    <>
      <PageHeader
        title="Routes"
        description="Choose an area route and send spirit or winged light targets to the overlay."
      />
      <div className="grid gap-4 p-5 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Route Builder</CardTitle>
            <CardDescription>Manual in-game reference, not live tracking.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="route-realm">Realm</Label>
              <NativeSelect
                id="route-realm"
                className="w-full"
                value={selectedRealmGuid}
                onChange={(event) =>
                  updateRoute({ realmGuid: event.target.value })
                }
                disabled={!skyData}
              >
                {realms.map((realm) => (
                  <NativeSelectOption key={realm.guid} value={realm.guid}>
                    {realm.shortName ?? realm.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="route-area">Area</Label>
              <NativeSelect
                id="route-area"
                className="w-full"
                value={selectedAreaGuid}
                onChange={(event) =>
                  updateRoute({ areaGuid: event.target.value })
                }
                disabled={!skyData || areas.length === 0}
              >
                {areas.map((area) => {
                  const route = skyData?.skyDataIndex.getAreaRoute(area.guid);
                  return (
                    <NativeSelectOption key={area.guid} value={area.guid}>
                      {area.name} ({route?.counts.total ?? 0})
                    </NativeSelectOption>
                  );
                })}
              </NativeSelect>
            </div>
            <Separator />
            <SettingSwitch
              label="Spirits"
              checked={planner.activeRoute.filters.spirits}
              onCheckedChange={(spirits) => updateRoute({ spirits })}
            />
            <SettingSwitch
              label="Winged lights"
              checked={planner.activeRoute.filters.wingedLights}
              onCheckedChange={(wingedLights) => updateRoute({ wingedLights })}
            />
            <Button
              type="button"
              disabled={!selectedRealmGuid || !selectedAreaGuid}
              onClick={() =>
                updateRoute({
                  realmGuid: selectedRealmGuid,
                  areaGuid: selectedAreaGuid,
                })
              }
            >
              <Upload className="size-4" />
              Send to overlay
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={resetArea}>
                Reset area
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onPlannerChange(resetAllRouteProgress(planner))}
              >
                Reset all
              </Button>
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <AreaRouteCard
            areaRoute={areaRoute}
            activeTarget={activeTarget}
            completedCount={completedCount}
            totalCount={routeTargets.length}
            connections={connections as Array<{ guid: string; name: string }>}
          />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Route Targets</CardTitle>
              <CardDescription>
                {completedCount} of {routeTargets.length} complete in this area.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {routeTargets.length > 0 ? (
                routeTargets.map((target, index) => (
                  <RouteTargetRow
                    key={target.guid}
                    target={target}
                    active={target.guid === activeTarget?.guid}
                    complete={planner.routeProgress.completedTargets[target.guid] === true}
                    index={index}
                  />
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  {skyData ? "No route targets match these filters." : "Loading route data..."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function CandleRunsPage({
  planner,
  onPlannerChange,
}: {
  planner: PlannerState;
  onPlannerChange: (planner: PlannerState) => void;
}) {
  const skyData = useSkyData();
  const runs = useMemo(
    () => skyData?.skyDataIndex.getCandleRuns() ?? [],
    [skyData],
  );
  const fallbackRunGuid = runs[0]?.guid;
  const storedRun =
    planner.candleRun.activeRunGuid && skyData
      ? skyData.skyDataIndex.getCandleRun(planner.candleRun.activeRunGuid)
      : null;
  const selectedRun =
    storedRun ??
    (fallbackRunGuid && skyData
      ? skyData.skyDataIndex.getCandleRun(fallbackRunGuid)
      : null);
  const selectedRunGuid = selectedRun?.guid ?? fallbackRunGuid;
  const currentSessionDate = new Date().toISOString().slice(0, 10);
  const runGroupKeys = selectedRun
    ? selectedRun.groups.map((group, index) =>
        candleGroupKey(selectedRun.guid, group, index),
      )
    : [];
  const completedGroups = runGroupKeys.filter(
    (key) => planner.candleRun.completedGroups[key],
  ).length;
  const totalWax = selectedRun
    ? selectedRun.groups.reduce(
        (total, group) => total + countCandleGroupWax(group),
        0,
      )
    : 0;
  const completedWax = selectedRun
    ? selectedRun.groups.reduce((total, group, index) => {
        const key = candleGroupKey(selectedRun.guid, group, index);
        return planner.candleRun.completedGroups[key]
          ? total + countCandleGroupWax(group)
          : total;
      }, 0)
    : 0;
  const completionRatio =
    runGroupKeys.length > 0 ? completedGroups / runGroupKeys.length : 0;

  useEffect(() => {
    if (planner.candleRun.sessionDate !== currentSessionDate) {
      onPlannerChange(resetCandleRunProgress(planner));
    }
  }, [currentSessionDate, onPlannerChange, planner]);

  function selectRun(runGuid: string) {
    onPlannerChange(setActiveCandleRun(planner, runGuid));
  }

  function toggleGroup(group: SkyCandleGroup, index: number) {
    if (!selectedRun) {
      return;
    }

    onPlannerChange(
      toggleCandleGroupComplete(
        planner,
        candleGroupKey(selectedRun.guid, group, index),
      ),
    );
  }

  return (
    <>
      <PageHeader
        title="Candle Run"
        description="Daily wax route progress from bundled Sky candle map data."
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() => onPlannerChange(resetCandleRunProgress(planner))}
          >
            <RefreshCw data-icon="inline-start" />
            Reset today
          </Button>
        }
      />
      <div className="grid gap-4 p-5 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Runs</CardTitle>
            <CardDescription>
              {runs.length > 0
                ? `${runs.length} candle maps available.`
                : "Loading candle maps..."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {runs.length > 0 ? (
              runs.map((run) => (
                <CandleRunButton
                  key={run.guid}
                  run={run}
                  active={run.guid === selectedRunGuid}
                  completedGroups={countCompletedRunGroups(
                    run.guid,
                    planner.candleRun.completedGroups,
                    skyData?.skyDataIndex.getCandleRun(run.guid)?.groups ?? [],
                  )}
                  onClick={() => selectRun(run.guid)}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                Loading candle run data...
              </p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            {selectedRun?.imageUrl ? (
              <CandleRunMapPreview
                imageUrl={selectedRun.imageUrl}
                name={selectedRun.name}
              />
            ) : null}
            <CardHeader>
              <CardTitle className="text-base">
                {selectedRun?.name ?? "No candle run selected"}
              </CardTitle>
              <CardDescription>
                {selectedRun
                  ? `${completedGroups} of ${selectedRun.groups.length} groups complete today.`
                  : "Choose a run to start tracking."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-2 md:grid-cols-3">
                <InfoRow
                  label="Groups"
                  value={`${completedGroups}/${runGroupKeys.length}`}
                />
                <InfoRow label="Wax" value={`${completedWax}/${totalWax}`} />
                <InfoRow
                  label="Session"
                  value={planner.candleRun.sessionDate}
                />
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${Math.round(completionRatio * 100)}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Candle Groups</CardTitle>
              <CardDescription>
                Mark groups as you collect them during today&apos;s run.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {selectedRun ? (
                selectedRun.groups.map((group, index) => {
                  const key = candleGroupKey(selectedRun.guid, group, index);
                  return (
                    <CandleGroupRow
                      key={key}
                      group={group}
                      index={index}
                      complete={planner.candleRun.completedGroups[key] === true}
                      onToggle={() => toggleGroup(group, index)}
                    />
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  {skyData ? "No candle run selected." : "Loading candle data..."}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export function GoalsPage({
  planner,
  onPlannerChange,
}: {
  planner: PlannerState;
  onPlannerChange: (planner: PlannerState) => void;
}) {
  const [title, setTitle] = useState("");
  const [currencyNeeded, setCurrencyNeeded] = useState("");
  const [dueDate, setDueDate] = useState("");

  function addGoal() {
    if (!title.trim()) {
      return;
    }

    onPlannerChange({
      ...planner,
      goals: [
        createGoal({
          title,
          currencyNeeded: currencyNeeded ? Number(currencyNeeded) : undefined,
          dueDate: dueDate || undefined,
        }),
        ...planner.goals,
      ],
    });
    setTitle("");
    setCurrencyNeeded("");
    setDueDate("");
  }

  return (
    <>
      <PageHeader
        title="Goals"
        description="Personal planning for candles, cosmetics, and event targets."
      />
      <div className="grid gap-4 p-5 xl:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New Goal</CardTitle>
            <CardDescription>Keep this lightweight: target, currency, date.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="goal-title">Title</Label>
              <Input id="goal-title" value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal-currency">Currency needed</Label>
              <Input id="goal-currency" inputMode="numeric" value={currencyNeeded} onChange={(event) => setCurrencyNeeded(event.currentTarget.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="goal-date">Due date</Label>
              <Input id="goal-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.currentTarget.value)} />
            </div>
            <Button type="button" onClick={addGoal}>
              <Plus className="size-4" />
              Add goal
            </Button>
          </CardContent>
        </Card>
        <div className="grid gap-3">
          {planner.goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onStatusChange={(status) =>
                onPlannerChange({
                  ...planner,
                  goals: planner.goals.map((candidate) =>
                    candidate.id === goal.id ? { ...candidate, status } : candidate,
                  ),
                })
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}

export function CollectionPage({
  planner,
  onPlannerChange,
}: {
  planner: PlannerState;
  onPlannerChange: (planner: PlannerState) => void;
}) {
  const [query, setQuery] = useState("");
  const skyData = useSkyData();
  const items = useMemo(
    () => (skyData ? skyData.skyDataIndex.searchItems(query) : []),
    [query, skyData],
  );

  return (
    <>
      <PageHeader
        title="Collection"
        description="Searchable wishlist for cosmetics and planner targets."
      />
      <div className="grid gap-4 p-5">
        <div className="relative max-w-xl">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-9" value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search items, types, or origins" />
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.length > 0 ? (
            items.map((item) => (
              <ItemCard
                key={item.guid}
                item={item}
                wished={planner.wishlist[item.guid] === true}
                onToggleWishlist={() =>
                  onPlannerChange({
                    ...planner,
                    wishlist: {
                      ...planner.wishlist,
                      [item.guid]: planner.wishlist[item.guid] !== true,
                    },
                  })
                }
              />
            ))
          ) : (
            <div className="rounded-md border border-border bg-card/80 p-3 text-sm text-muted-foreground">
              {skyData ? "No items match this search." : "Loading planner data..."}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function OverlaySettingsPage({
  settings,
  events,
  planner,
  onSettingsChange,
}: {
  settings: AppSettings;
  events: EventInstance[];
  planner: PlannerState;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const { t } = useI18n(settings.language);
  const modeLabels = new Map(
    OVERLAY_MODE_OPTIONS.map((mode) => [mode.value, t(mode.labelKey)] as const),
  );
  const modeValues = OVERLAY_MODE_OPTIONS.map((mode) => mode.value);
  const selectedMode = modeValues.includes(settings.overlay.mode)
    ? settings.overlay.mode
    : "clock";

  return (
    <>
      <PageHeader
        title={t("nav.overlay")}
        description={t("overlay.settings.description")}
      />
      <div className="grid gap-4 p-5 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("overlay.settings.behavior.title")}</CardTitle>
            <CardDescription>
              {t("overlay.settings.behavior.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-sm text-muted-foreground">
              {t("overlay.settings.note")}
            </div>
            <SettingSwitch
              label={t("overlay.enable")}
              checked={settings.overlay.enabled}
              onCheckedChange={(enabled) =>
                onSettingsChange({ ...settings, overlay: { ...settings.overlay, enabled } })
              }
            />
            <Separator />
            <SettingSwitch
              label={t("overlay.enableGameDetection")}
              description={t("overlay.gameDetection.description")}
              checked={settings.overlay.gameDetection.enabled}
              onCheckedChange={(enabled) =>
                onSettingsChange({
                  ...settings,
                  overlay: {
                    ...settings.overlay,
                    gameDetection: {
                      ...settings.overlay.gameDetection,
                      enabled,
                    },
                  },
                })
              }
            />
            <SettingSwitch
              label={t("overlay.showOnStart")}
              description={t("overlay.showOnStart.description")}
              checked={settings.overlay.gameDetection.showOverlayOnStart}
              disabled={!settings.overlay.gameDetection.enabled}
              onCheckedChange={(showOverlayOnStart) =>
                onSettingsChange({
                  ...settings,
                  overlay: {
                    ...settings.overlay,
                    gameDetection: {
                      ...settings.overlay.gameDetection,
                      showOverlayOnStart,
                    },
                  },
                })
              }
            />
            <SliderSetting
              label={t("overlay.launchDelay")}
              value={settings.overlay.gameDetection.startupDelayMs / 1_000}
              min={2}
              max={5}
              step={1}
              display={`${settings.overlay.gameDetection.startupDelayMs / 1_000}s`}
              onValueChange={(seconds) =>
                onSettingsChange({
                  ...settings,
                  overlay: {
                    ...settings.overlay,
                    gameDetection: {
                      ...settings.overlay.gameDetection,
                      startupDelayMs: seconds * 1_000,
                    },
                  },
                })
              }
            />
            <SettingSwitch
              label={t("overlay.hideOnExit")}
              description={t("overlay.hideOnExit.description")}
              checked={settings.overlay.gameDetection.hideOverlayOnExit}
              disabled={!settings.overlay.gameDetection.enabled}
              onCheckedChange={(hideOverlayOnExit) =>
                onSettingsChange({
                  ...settings,
                  overlay: {
                    ...settings.overlay,
                    gameDetection: {
                      ...settings.overlay.gameDetection,
                      hideOverlayOnExit,
                    },
                  },
                })
              }
            />
            <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-xs text-muted-foreground">
              Detection checks process names only:{" "}
              {settings.overlay.gameDetection.processNames.join(", ")}. It does
              not read game memory, inspect network traffic, modify files,
              inject code, or automate input. Turn game detection off for no
              presence behavior.
            </div>
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="overlay-mode">{t("overlay.layout")}</Label>
              <NativeSelect
                id="overlay-mode"
                className="w-full"
                value={selectedMode}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    overlay: {
                      ...settings.overlay,
                      mode: event.target
                        .value as AppSettings["overlay"]["mode"],
                    },
                  })
                }
              >
                {OVERLAY_MODE_OPTIONS.map((mode) => (
                  <NativeSelectOption key={mode.value} value={mode.value}>
                    {modeLabels.get(mode.value) ?? t(mode.labelKey)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {t("overlay.settings.modeCycleHelp")}
              </p>
            </div>
            <SettingSwitch
              label={t("overlay.clickThrough")}
              checked={settings.overlay.clickThrough}
              onCheckedChange={(clickThrough) =>
                onSettingsChange({ ...settings, overlay: { ...settings.overlay, clickThrough } })
              }
            />
            <div className="grid gap-2">
              <Label htmlFor="overlay-position">{t("overlay.position")}</Label>
              <NativeSelect
                id="overlay-position"
                className="w-full"
                value={settings.overlay.position}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    overlay: {
                      ...settings.overlay,
                      position: event.target
                        .value as AppSettings["overlay"]["position"],
                    },
                  })
                }
              >
                {OVERLAY_POSITION_OPTIONS.map((position) => (
                  <NativeSelectOption key={position.value} value={position.value}>
                    {t(position.labelKey)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
            <SliderSetting
              label={t("overlay.opacity")}
              value={settings.overlay.opacity}
              min={0.2}
              max={1}
              step={0.01}
              display={`${Math.round(settings.overlay.opacity * 100)}%`}
              onValueChange={(opacity) =>
                onSettingsChange({ ...settings, overlay: { ...settings.overlay, opacity } })
              }
            />
            <SliderSetting
              label={t("overlay.scale")}
              value={settings.overlay.scale}
              min={0.8}
              max={1.4}
              step={0.05}
              display={`${Math.round(settings.overlay.scale * 100)}%`}
              onValueChange={(scale) =>
                onSettingsChange({ ...settings, overlay: { ...settings.overlay, scale } })
              }
            />
            <SliderSetting
              label={t("overlay.clockRows")}
              value={settings.overlay.maxEvents}
              min={3}
              max={8}
              step={1}
              display={settings.overlay.maxEvents.toString()}
              onValueChange={(maxEvents) =>
                onSettingsChange({ ...settings, overlay: { ...settings.overlay, maxEvents } })
              }
            />
            <SliderSetting
              label={t("overlay.cornerRadius")}
              value={settings.overlay.cornerRadius}
              min={0}
              max={32}
              step={1}
              display={`${settings.overlay.cornerRadius}px`}
              onValueChange={(cornerRadius) =>
                onSettingsChange({
                  ...settings,
                  overlay: { ...settings.overlay, cornerRadius },
                })
              }
            />
            <Separator />
            <SliderSetting
              label={t("overlay.miniMapSize")}
              value={settings.overlay.miniMap.size}
              min={220}
              max={420}
              step={10}
              display={`${settings.overlay.miniMap.size}px`}
              onValueChange={(size) =>
                onSettingsChange({
                  ...settings,
                  overlay: {
                    ...settings.overlay,
                    miniMap: { ...settings.overlay.miniMap, size },
                  },
                })
              }
            />
          </CardContent>
        </Card>
        <OverlayPreview events={events} planner={planner} settings={settings} />
      </div>
    </>
  );
}

export function DiscordRpcPage({
  settings,
  skyProcessRunning,
  status,
  presence,
  onSettingsChange,
}: {
  settings: AppSettings;
  skyProcessRunning: boolean;
  status: DiscordRpcStatus;
  presence: DiscordRpcPresencePayload | null;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const { t } = useI18n(settings.language);
  const selectedMode =
    DISCORD_RPC_MODE_OPTIONS.find(
      (mode) => mode.value === settings.discordRpc.mode,
    ) ?? DISCORD_RPC_MODE_OPTIONS[0];
  const selectedPreset =
    DISCORD_RPC_PRESET_OPTIONS.find(
      (preset) => preset.value === settings.discordRpc.safePreset,
    ) ?? DISCORD_RPC_PRESET_OPTIONS[0];
  const availability = !status.configured
    ? t("discordRpc.status.missingClientId")
    : !settings.discordRpc.enabled
      ? t("discordRpc.status.disabled")
      : settings.discordRpc.requireSkyDetection && !skyProcessRunning
        ? t("discordRpc.status.waitingForSky")
        : status.active
          ? t("discordRpc.status.active")
          : t("discordRpc.status.ready");

  return (
    <>
      <PageHeader
        title={t("nav.discordRpc")}
        description={t("discordRpc.description")}
        action={
          <Badge variant={status.active ? "default" : "secondary"} className="rounded-sm">
            {availability}
          </Badge>
        }
      />
      <div className="grid gap-4 p-5 xl:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("discordRpc.controls.title")}</CardTitle>
            <CardDescription>
              {t("discordRpc.controls.description")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SettingSwitch
              label={t("discordRpc.enable")}
              description={t("discordRpc.enable.description")}
              checked={settings.discordRpc.enabled}
              disabled={!status.configured}
              onCheckedChange={(enabled) =>
                onSettingsChange({
                  ...settings,
                  discordRpc: { ...settings.discordRpc, enabled },
                })
              }
            />
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="discord-rpc-client-id">{t("discordRpc.clientId")}</Label>
              <Input
                id="discord-rpc-client-id"
                value={settings.discordRpc.clientId}
                placeholder={t("discordRpc.clientId.placeholder")}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    discordRpc: {
                      ...settings.discordRpc,
                      clientId: event.target.value,
                    },
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                {t("discordRpc.clientId.description")}
              </p>
            </div>
            <Separator />
            <div className="grid gap-2">
              <Label htmlFor="discord-rpc-mode">{t("discordRpc.mode")}</Label>
              <NativeSelect
                id="discord-rpc-mode"
                className="w-full"
                value={settings.discordRpc.mode}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    discordRpc: {
                      ...settings.discordRpc,
                      mode: event.target
                        .value as AppSettings["discordRpc"]["mode"],
                    },
                  })
                }
              >
                {DISCORD_RPC_MODE_OPTIONS.map((mode) => (
                  <NativeSelectOption key={mode.value} value={mode.value}>
                    {t(mode.labelKey)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {t(selectedMode.descriptionKey)}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="discord-rpc-preset">{t("discordRpc.safePreset")}</Label>
              <NativeSelect
                id="discord-rpc-preset"
                className="w-full"
                value={settings.discordRpc.safePreset}
                onChange={(event) =>
                  onSettingsChange({
                    ...settings,
                    discordRpc: {
                      ...settings.discordRpc,
                      safePreset: event.target
                        .value as AppSettings["discordRpc"]["safePreset"],
                    },
                  })
                }
              >
                {DISCORD_RPC_PRESET_OPTIONS.map((preset) => (
                  <NativeSelectOption key={preset.value} value={preset.value}>
                    {t(preset.labelKey)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                {t(selectedPreset.descriptionKey)}
              </p>
            </div>
            <Separator />
            <SettingSwitch
              label={t("discordRpc.showButtons")}
              description={t("discordRpc.showButtons.description")}
              checked={settings.discordRpc.showButtons}
              onCheckedChange={(showButtons) =>
                onSettingsChange({
                  ...settings,
                  discordRpc: { ...settings.discordRpc, showButtons },
                })
              }
            />
            <SettingSwitch
              label={t("discordRpc.requireSkyDetection")}
              description={t("discordRpc.requireSkyDetection.description")}
              checked={settings.discordRpc.requireSkyDetection}
              onCheckedChange={(requireSkyDetection) =>
                onSettingsChange({
                  ...settings,
                  discordRpc: { ...settings.discordRpc, requireSkyDetection },
                })
              }
            />
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("discordRpc.preview.title")}</CardTitle>
              <CardDescription>
                {t("discordRpc.preview.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2 rounded-md border border-border bg-card/70 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
                    <Gamepad2 className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {presence?.details ?? t("discordRpc.preview.emptyDetails")}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {presence?.state ?? t("discordRpc.preview.emptyState")}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={skyProcessRunning ? "default" : "secondary"}>
                    {skyProcessRunning
                      ? t("discordRpc.skyDetected")
                      : t("discordRpc.skyNotDetected")}
                  </Badge>
                  <Badge variant={status.connected ? "default" : "secondary"}>
                    {status.connected
                      ? t("discordRpc.discordConnected")
                      : t("discordRpc.discordDisconnected")}
                  </Badge>
                  <Badge variant={status.configured ? "default" : "secondary"}>
                    {status.configured
                      ? t("discordRpc.clientConfigured")
                      : t("discordRpc.clientMissing")}
                  </Badge>
                </div>
              </div>
              {status.lastError ? (
                <div className="rounded-md border border-border bg-muted/25 p-3 text-xs text-muted-foreground">
                  {status.lastError}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("discordRpc.links.title")}</CardTitle>
              <CardDescription>
                {t("discordRpc.links.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <a href={ISEKAI_DISCORD_URL} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Isekai
                </a>
              </Button>
              <Button asChild variant="secondary">
                <a href={SKY_DISCORD_URL} target="_blank" rel="noreferrer">
                  <ExternalLink data-icon="inline-start" />
                  Sky
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export type SettingsTab = "appearance" | "events" | "hotkeys" | "time";

const SETTINGS_TAB_KEYS: Record<SettingsTab, MessageKey> = {
  appearance: "settings.appearance.title",
  events: "settings.tab.events",
  hotkeys: "settings.tab.hotkeys",
  time: "settings.tab.time",
};

const SETTINGS_TABS: Array<{
  id: SettingsTab;
  labelKey: MessageKey;
  icon: React.ElementType;
}> = [
  { id: "appearance", labelKey: SETTINGS_TAB_KEYS.appearance, icon: Palette },
  { id: "events", labelKey: SETTINGS_TAB_KEYS.events, icon: CalendarClock },
  { id: "hotkeys", labelKey: SETTINGS_TAB_KEYS.hotkeys, icon: Keyboard },
  { id: "time", labelKey: SETTINGS_TAB_KEYS.time, icon: Clock },
];

export function settingsTabTitleKey(tab: SettingsTab): MessageKey {
  return SETTINGS_TAB_KEYS[tab];
}

function SettingsTabTransition({
  activeTab,
  children,
}: {
  activeTab: SettingsTab;
  children: (visibleTab: SettingsTab) => React.ReactNode;
}) {
  const [visibleTab, setVisibleTab] = useState(activeTab);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (activeTab === visibleTab) {
      setIsExiting(false);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisibleTab(activeTab);
      setIsExiting(false);
      return;
    }

    setIsExiting(true);
  }, [activeTab, visibleTab]);

  function handleAnimationEnd(event: AnimationEvent<HTMLDivElement>) {
    if (event.animationName !== "page-fade-out" || !isExiting) {
      return;
    }

    setVisibleTab(activeTab);
    setIsExiting(false);
  }

  return (
    <div
      key={visibleTab}
      className="page-transition mt-4"
      data-exiting={isExiting}
      onAnimationEnd={handleAnimationEnd}
    >
      {children(visibleTab)}
    </div>
  );
}

export function SettingsPage({
  settings,
  hotkeyError,
  activeTab,
  onActiveTabChange,
  onSettingsChange,
}: {
  settings: AppSettings;
  hotkeyError: string;
  activeTab: SettingsTab;
  onActiveTabChange: (tab: SettingsTab) => void;
  onSettingsChange: (settings: AppSettings) => void;
}) {
  const { t } = useI18n(settings.language);
  const [capturingHotkey, setCapturingHotkey] = useState<{
    id: keyof AppSettings["hotkeys"];
    label: string;
  } | null>(null);
  const enabledEventCount = EVENT_DEFINITIONS.filter(
    (definition) => settings.events[definition.id] !== false,
  ).length;
  const selectedAccent =
    ACCENT_OPTIONS.find(
      (accent) => accent.id === settings.appearance.accentColor,
    ) ?? ACCENT_OPTIONS[0];
  const selectedFont =
    FONT_OPTIONS.find((font) => font.id === settings.appearance.fontFamily) ??
    FONT_OPTIONS[1];
  const hotkeyRows: Array<{
    id: keyof AppSettings["hotkeys"];
    label: string;
    description: string;
  }> = [
    {
      id: "toggleOverlay",
      label: t("hotkeys.toggleOverlay.label"),
      description: t("hotkeys.toggleOverlay.description"),
    },
    {
      id: "showMainWindow",
      label: t("hotkeys.showMainWindow.label"),
      description: t("hotkeys.showMainWindow.description"),
    },
    {
      id: "cycleOverlayMode",
      label: t("hotkeys.cycleOverlayMode.label"),
      description: t("hotkeys.cycleOverlayMode.description"),
    },
    {
      id: "nextRouteTarget",
      label: t("hotkeys.nextRouteTarget.label"),
      description: t("hotkeys.nextRouteTarget.description"),
    },
    {
      id: "previousRouteTarget",
      label: t("hotkeys.previousRouteTarget.label"),
      description: t("hotkeys.previousRouteTarget.description"),
    },
    {
      id: "toggleRouteTargetComplete",
      label: t("hotkeys.toggleRouteTargetComplete.label"),
      description: t("hotkeys.toggleRouteTargetComplete.description"),
    },
    {
      id: "toggleMiniMapExpanded",
      label: t("hotkeys.toggleMiniMapExpanded.label"),
      description: t("hotkeys.toggleMiniMapExpanded.description"),
    },
  ];
  const finishHotkeyCapture = (shortcut: string) => {
    if (!capturingHotkey) {
      return;
    }

    onSettingsChange({
      ...settings,
      hotkeys: {
        ...settings.hotkeys,
        [capturingHotkey.id]: shortcut,
      },
    });
    setCapturingHotkey(null);
  };

  return (
    <>
      <PageHeader
        title={t("nav.settings")}
        description={t("settings.actionDescription")}
        action={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-sm">
              {selectedAccent.label}
            </Badge>
            <Badge variant="outline" className="rounded-sm">
              {enabledEventCount}/{EVENT_DEFINITIONS.length} events
            </Badge>
          </div>
        }
      />
      <Tabs
        value={activeTab}
        onValueChange={(value) => onActiveTabChange(value as SettingsTab)}
        className="p-5"
      >
        <div className="flex flex-col gap-4 border-b border-border pb-5">
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-foreground">
              {t("settings.preferences")}
            </p>
            <p className="max-w-2xl text-xs text-muted-foreground">
              {settings.display.localTimeZone} / {settings.display.timeFormat}
            </p>
          </div>
          <TabsList>
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.id} value={tab.id}>
                  <Icon />
                  {t(tab.labelKey)}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </div>

        <SettingsTabTransition activeTab={activeTab}>
          {(visibleTab) =>
            visibleTab === "appearance" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SettingsPanel
              icon={<Palette />}
              title={t("settings.appearance.title")}
              description={t("settings.appearance.description")}
            >
              <SettingGroup label={t("settings.info.theme")}>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["dark", "light", "system"] as const).map((theme) => (
                    <ChoiceButton
                      key={theme}
                      selected={settings.theme === theme}
                      label={
                        theme === "system"
                          ? t("common.system")
                          : theme === "dark"
                            ? t("settings.theme.dark.label")
                            : t("settings.theme.light.label")
                      }
                      description={
                        theme === "system"
                          ? t("settings.theme.system.description")
                          : theme === "dark"
                            ? t("settings.theme.dark.description")
                            : t("settings.theme.light.description")
                      }
                      icon={<Monitor className="size-4" />}
                      onClick={() => onSettingsChange({ ...settings, theme })}
                    />
                  ))}
                </div>
              </SettingGroup>
              <Separator />
              <SettingGroup label={t("common.language")}>
                <NativeSelect
                  id="language"
                  className="w-full"
                  value={settings.language}
                  onChange={(event) =>
                    onSettingsChange({
                      ...settings,
                      language: event.target.value as LocaleCode,
                    })
                  }
                >
                  {SUPPORTED_LOCALES.map((locale) => (
                    <NativeSelectOption key={locale.code} value={locale.code}>
                      {locale.nativeName}
                      {locale.nativeName === locale.englishName
                        ? ""
                        : ` / ${locale.englishName}`}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">
                  {t("settings.language.description")}
                </p>
              </SettingGroup>
              <Separator />
              <SettingGroup label={t("settings.accentColor")}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {ACCENT_OPTIONS.map((accent) => (
                    <Button
                      key={accent.id}
                      type="button"
                      variant={
                        settings.appearance.accentColor === accent.id
                          ? "default"
                          : "secondary"
                      }
                      className="h-10 justify-start gap-2"
                      onClick={() =>
                        onSettingsChange({
                          ...settings,
                          appearance: {
                            ...settings.appearance,
                            accentColor: accent.id,
                          },
                        })
                      }
                    >
                      <span
                        className="size-4 shrink-0 rounded-full border border-border"
                        style={{ background: accent.swatch }}
                      />
                      {accent.label}
                    </Button>
                  ))}
                </div>
              </SettingGroup>
              <Separator />
              <SettingGroup label={t("settings.interfaceFont")}>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {FONT_OPTIONS.map((font) => (
                    <Button
                      key={font.id}
                      type="button"
                      variant={
                        settings.appearance.fontFamily === font.id
                          ? "default"
                          : "secondary"
                      }
                      className="h-10 justify-start text-sm"
                      style={{ fontFamily: font.family }}
                      onClick={() =>
                        onSettingsChange({
                          ...settings,
                          appearance: {
                            ...settings.appearance,
                            fontFamily: font.id,
                          },
                        })
                      }
                    >
                      {font.label}
                    </Button>
                  ))}
                </div>
              </SettingGroup>
            </SettingsPanel>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("settings.currentStyle.title")}</CardTitle>
                <CardDescription>
                  {t("settings.currentStyle.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <InfoRow label={t("settings.info.theme")} value={settings.theme} />
                <InfoRow label={t("common.language")} value={settings.language} />
                <InfoRow label={t("settings.info.accent")} value={selectedAccent.label} />
                <InfoRow label={t("settings.info.font")} value={selectedFont.label} />
              </CardContent>
            </Card>
          </div>
            ) : visibleTab === "events" ? (
          <SettingsPanel
            icon={<CalendarClock />}
            title={t("settings.events.title")}
            description={t("settings.events.description")}
          >
            <div className="grid gap-2 md:grid-cols-2">
              {EVENT_DEFINITIONS.map((definition) => (
                <div
                  key={definition.id}
                  className="rounded-md border border-border bg-card/70 p-3 transition-colors hover:bg-muted/25"
                >
                  <SettingSwitch
                    label={definition.title}
                    description={[
                      definition.location,
                      definition.category,
                      definition.source,
                    ]
                      .filter(Boolean)
                      .join(" - ")}
                    checked={settings.events[definition.id] !== false}
                    onCheckedChange={(checked) =>
                      onSettingsChange({
                        ...settings,
                        events: {
                          ...settings.events,
                          [definition.id]: checked,
                        },
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </SettingsPanel>
            ) : visibleTab === "hotkeys" ? (
          <SettingsPanel
            icon={<Keyboard />}
            title={t("settings.hotkeys.title")}
            description={t("settings.hotkeys.description")}
          >
            <div className="grid gap-3">
              {hotkeyRows.map((row) => (
                <SettingRow
                  key={row.id}
                  label={row.label}
                  description={row.description}
                  control={
                    <Input
                      id={`${row.id}-hotkey`}
                      readOnly
                      className="cursor-pointer font-mono"
                      value={settings.hotkeys[row.id]}
                      onClick={() =>
                        setCapturingHotkey({ id: row.id, label: row.label })
                      }
                      onFocus={() =>
                        setCapturingHotkey({ id: row.id, label: row.label })
                      }
                    />
                  }
                />
              ))}
            </div>
            {hotkeyError ? (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <p>{hotkeyError}</p>
              </div>
            ) : null}
          </SettingsPanel>
            ) : visibleTab === "time" ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <SettingsPanel
              icon={<Clock />}
              title={t("settings.time.title")}
              description={t("settings.time.description")}
            >
              <SettingSwitch
                label={t("settings.time.showSky")}
                description={t("settings.time.showSky.description")}
                checked={settings.display.showSkyTime}
                onCheckedChange={(showSkyTime) =>
                  onSettingsChange({
                    ...settings,
                    display: { ...settings.display, showSkyTime },
                  })
                }
              />
              <SettingSwitch
                label={t("settings.time.showLocal")}
                description={t("settings.time.showLocal.description")}
                checked={settings.display.showLocalTime}
                onCheckedChange={(showLocalTime) =>
                  onSettingsChange({
                    ...settings,
                    display: { ...settings.display, showLocalTime },
                  })
                }
              />
              <Separator />
              <SettingGroup label={t("settings.time.format")}>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["system", "12h", "24h"] as const).map((timeFormat) => (
                    <ChoiceButton
                      key={timeFormat}
                      selected={settings.display.timeFormat === timeFormat}
                      label={
                        timeFormat === "system"
                          ? t("common.system")
                          : timeFormat === "12h"
                            ? t("settings.time.format12")
                            : t("settings.time.format24")
                      }
                      description={
                        timeFormat === "system"
                          ? t("settings.time.formatSystem.description")
                          : timeFormat === "12h"
                            ? t("settings.time.format12.description")
                            : t("settings.time.format24.description")
                      }
                      onClick={() =>
                        onSettingsChange({
                          ...settings,
                          display: { ...settings.display, timeFormat },
                        })
                      }
                    />
                  ))}
                </div>
              </SettingGroup>
              <SettingGroup label={t("settings.time.localTimezone")}>
                <NativeSelect
                  id="local-timezone"
                  className="w-full"
                  value={settings.display.localTimeZone}
                  onChange={(event) =>
                    onSettingsChange({
                      ...settings,
                      display: {
                        ...settings.display,
                        localTimeZone: event.target.value,
                      },
                    })
                  }
                >
                  {getTimeZoneOptions(settings.display.localTimeZone).map(
                    (timeZone) => (
                      <NativeSelectOption key={timeZone} value={timeZone}>
                        {timeZone}
                      </NativeSelectOption>
                    ),
                  )}
                </NativeSelect>
              </SettingGroup>
            </SettingsPanel>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Info className="size-4 text-primary" />
                  {t("common.about")}
                </CardTitle>
                <CardDescription>
                  {t("settings.time.aboutDescription")}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <InfoRow label={t("settings.info.timezone")} value={settings.display.localTimeZone} />
                <InfoRow label={t("settings.info.format")} value={settings.display.timeFormat} />
              </CardContent>
            </Card>
          </div>
            ) : null
          }
        </SettingsTabTransition>
      </Tabs>
      <HotkeyCaptureDialog
        target={capturingHotkey}
        currentShortcut={
          capturingHotkey ? settings.hotkeys[capturingHotkey.id] : ""
        }
        onCancel={() => setCapturingHotkey(null)}
        onCapture={finishHotkeyCapture}
      />
    </>
  );
}

export function UpdatesPage({
  updateState,
  onRefresh,
  onInstall,
}: {
  updateState: AppUpdateState;
  onRefresh: () => void;
  onInstall: () => void;
}) {
  const checking = updateState.status === "checking";
  const installing =
    updateState.status === "downloading" || updateState.status === "installing";
  const canInstall = updateState.status === "available";
  const progressLabel =
    updateState.contentLength && updateState.downloadedBytes
      ? `${formatBytes(updateState.downloadedBytes)} / ${formatBytes(updateState.contentLength)}`
      : updateState.downloadedBytes
        ? formatBytes(updateState.downloadedBytes)
        : "";
  const changelogTitle =
    updateState.status === "available"
      ? `Changelog for ${updateState.latestVersion}`
      : `Changelog for ${updateState.currentVersion || "current version"}`;
  const changelogEmpty =
    updateState.status === "current"
      ? "No changelog was found for the installed version."
      : "No release notes loaded.";
  const publishedLabel = updateState.releaseDate
    ? new Date(updateState.releaseDate).toLocaleString()
    : "Not available";

  return (
    <>
      <PageHeader
        title="Updates"
        description="Desktop app updates from the GitHub Releases channel."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={checking || installing}
              onClick={onRefresh}
            >
              <RefreshCw className={cn("size-4", checking && "animate-spin")} />
              Check
            </Button>
            <Button
              type="button"
              disabled={!canInstall || installing}
              onClick={onInstall}
            >
              <Download className="size-4" />
              Install update
            </Button>
          </div>
        }
      />
      <div className="grid min-w-0 gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <UpdateStatusIcon status={updateState.status} />
              {updateStatusTitle(updateState)}
            </CardTitle>
            <CardDescription className="flex min-w-0 flex-wrap gap-x-2 gap-y-1">
              <span>Current {updateState.currentVersion || "unknown"}</span>
              {updateState.latestVersion ? (
                <span>Latest {updateState.latestVersion}</span>
              ) : null}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {updateState.status === "available" ? (
              <div className="rounded-md border border-primary/25 bg-primary/10 p-3 text-sm text-primary">
                Version {updateState.latestVersion} is ready to download and install.
              </div>
            ) : null}
            {installing || updateState.status === "installed" ? (
              <div className="grid gap-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">
                    {updateState.status === "installing"
                      ? "Installing"
                      : updateState.status === "installed"
                        ? "Installed"
                        : "Downloading"}
                  </span>
                  <span className="text-muted-foreground">
                    {progressLabel ||
                      (updateState.progress === null
                        ? "Receiving update"
                        : `${Math.round(updateState.progress * 100)}%`)}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={
                    updateState.progress === null
                      ? undefined
                      : Math.round(updateState.progress * 100)
                  }
                  className="h-2 overflow-hidden rounded-sm bg-secondary"
                >
                  <div
                    className={cn(
                      "h-full bg-primary transition-all",
                      updateState.progress === null && "w-1/2 animate-pulse",
                    )}
                    style={{
                      width:
                        updateState.progress === null
                          ? undefined
                          : `${Math.round(updateState.progress * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}
            {updateState.error ? (
              <div className="rounded-md border border-destructive/35 bg-destructive/10 p-3 text-sm text-destructive">
                {updateState.error}
              </div>
            ) : null}
            <div className="grid gap-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <h2 className="min-w-0 text-sm font-semibold">{changelogTitle}</h2>
                {updateState.status === "current" ? (
                  <Badge variant="secondary" className="rounded-sm">
                    Installed
                  </Badge>
                ) : null}
              </div>
              <div className="theme-scrollbar max-h-[420px] overflow-auto rounded-md border border-border bg-card/70 p-3 text-sm text-muted-foreground">
                {updateState.releaseNotes ? (
                  <MarkdownChangelog content={updateState.releaseNotes} />
                ) : (
                  <p>{changelogEmpty}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Update Details</CardTitle>
            <CardDescription>Simple status for this installed app.</CardDescription>
          </CardHeader>
          <CardContent className="grid min-w-0 gap-3 text-sm text-muted-foreground">
            <InfoRow
              label="Installed version"
              value={updateState.currentVersion || "Checking..."}
            />
            <InfoRow
              label="Newest version"
              value={updateState.latestVersion || updateState.currentVersion || "Checking..."}
            />
            <InfoRow label="Release date" value={publishedLabel} />
            <Separator className="my-1" />
            <div className="rounded-md border border-border/70 bg-muted/20 p-3">
              <h3 className="text-sm font-semibold text-foreground">
                {updateState.status === "available"
                  ? "Ready when you are"
                  : "Nothing to do right now"}
              </h3>
              <p className="mt-1 text-sm leading-5">
                {updateState.status === "available"
                  ? "Download and install the update from this page. The app will guide the process."
                  : "The app checks for updates when it opens. You can also check again manually."}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export function Overlay({
  events,
  settings,
  planner,
  animated = false,
}: {
  events: EventInstance[];
  settings: AppSettings;
  planner?: PlannerState;
  animated?: boolean;
}) {
  const [visible, setVisible] = useState(!animated);
  const visibleEvents = useMemo(
    () => events.slice(0, settings.overlay.maxEvents),
    [events, settings.overlay.maxEvents],
  );
  const rowRadius = Math.max(0, Math.min(settings.overlay.cornerRadius - 6, 18));
  const routeState = planner
    ? skyDataIndex.getActiveRouteTarget(
        planner.activeRoute,
        planner.routeProgress,
      )
    : null;
  const activeArea = planner?.activeRoute.areaGuid
    ? skyDataIndex.getAreaRoute(planner.activeRoute.areaGuid)
    : null;
  const miniMapPins = (planner?.activeRoute.areaGuid
    ? skyDataIndex.getMiniMapPins(
        planner.activeRoute.areaGuid,
        planner.activeRoute.filters,
      )
    : []
  );
  const overlayMode =
    settings.overlay.mode === "mini-map" && (!activeArea?.imageUrl || miniMapPins.length === 0)
      ? "route"
      : settings.overlay.mode;

  useEffect(() => {
    if (!animated) {
      setVisible(true);
      return;
    }

    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [animated]);

  useEffect(() => {
    if (!animated || !isTauriRuntime()) {
      return;
    }

    const unlistenPromise = listen<boolean>(
      "sky-overlay-visibility",
      (event) => setVisible(event.payload),
    );

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <section
      data-visible={visible}
      data-animated={animated}
      className="overlay-shell flex max-h-svh w-full max-w-[360px] flex-col overflow-hidden border border-white/10 p-3 text-foreground"
      style={{
        background: `color-mix(in oklch, var(--background) ${Math.round(
          settings.overlay.opacity * 100,
        )}%, transparent)`,
        borderRadius: `${settings.overlay.cornerRadius}px`,
        transform: `translateY(${visible ? 0 : 8}px)`,
        zoom: settings.overlay.scale,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {overlayMode === "route" ? (
          <RouteOverlayContent
            routeState={routeState}
            activeArea={activeArea}
            nextEvent={visibleEvents[0]}
            settings={settings}
            rowRadius={rowRadius}
          />
        ) : overlayMode === "clock-route" ? (
          <ClockRouteOverlayContent
            routeState={routeState}
            activeArea={activeArea}
            pins={miniMapPins}
            planner={planner}
            events={visibleEvents}
            settings={settings}
            rowRadius={rowRadius}
          />
        ) : overlayMode === "mini-map" ? (
          <MiniMapOverlayContent
            routeState={routeState}
            activeArea={activeArea}
            pins={miniMapPins}
            planner={planner}
            settings={settings}
            rowRadius={rowRadius}
          />
        ) : (
          <ClockOverlayContent
            events={visibleEvents}
            settings={settings}
            rowRadius={rowRadius}
          />
        )}
      </div>
    </section>
  );
}

function OverlayHeader({
  title,
  shortcut,
}: {
  title: string;
  shortcut: string;
}) {
  return (
    <div className="mb-2 flex shrink-0 items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-primary" />
        <span className="text-sm font-semibold">{title}</span>
      </div>
      <Badge variant="secondary" className="text-[10px]">
        {shortcut}
      </Badge>
    </div>
  );
}

function ClockOverlayContent({
  events,
  settings,
  rowRadius,
}: {
  events: EventInstance[];
  settings: AppSettings;
  rowRadius: number;
}) {
  return (
    <>
      <OverlayHeader title="Sky Clock" shortcut={settings.hotkeys.toggleOverlay} />
      <div className="theme-scrollbar grid min-h-0 flex-1 gap-2 overflow-y-auto">
        {events.map((event) => (
          <div
            key={`${event.definitionId}-${event.startsAtUtc}`}
            className="overlay-event-row grid gap-1 overflow-hidden border border-border/70 bg-card/80 p-2"
            style={{ borderRadius: `${rowRadius}px` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-5">{event.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[event.location, event.phaseLabel].filter(Boolean).join(" - ")}
                </p>
              </div>
              <StatusBadge status={event.status} />
            </div>
            <div className="flex items-end justify-between gap-2">
              <p className="text-lg font-semibold tabular-nums leading-none">
                {formatDuration(event.countdownMs)}
              </p>
              <p className="text-right text-[11px] text-muted-foreground">
                {settings.display.showLocalTime ? event.localTimeLabel : null}
                {settings.display.showSkyTime ? ` / ${event.skyTimeLabel}` : null}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RouteOverlayContent({
  routeState,
  activeArea,
  nextEvent,
  settings,
  rowRadius,
  showHeader = true,
}: {
  routeState: ReturnType<typeof skyDataIndex.getActiveRouteTarget>;
  activeArea: SkyAreaRoute | null;
  nextEvent?: EventInstance;
  settings: AppSettings;
  rowRadius: number;
  showHeader?: boolean;
}) {
  const target = routeState?.target;

  return (
    <>
      {showHeader ? (
        <OverlayHeader title="Route" shortcut={settings.hotkeys.cycleOverlayMode} />
      ) : null}
      <div className="grid gap-2">
        <div
          className="grid gap-2 border border-border/70 bg-card/80 p-3"
          style={{ borderRadius: `${rowRadius}px` }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {activeArea?.name ?? "No route selected"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {activeArea?.realmName ?? "Choose a route in the main app"}
              </p>
            </div>
            {target ? (
              <Badge variant="outline" className="rounded-sm">
                {target.kind === "winged-light" ? "WL" : "Spirit"}
              </Badge>
            ) : null}
          </div>
          {target ? (
            <>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold leading-6">
                  {target.name}
                </p>
                <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
                  {target.description}
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {routeState.completedCount} / {routeState.total} complete
                </span>
                <span>
                  {routeState.targetIndex + 1} / {routeState.total}
                </span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Start a spirit or winged light route from the Routes page.
            </p>
          )}
        </div>
        {nextEvent ? (
          <div className="flex items-center justify-between gap-2 rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5 text-xs">
            <span className="truncate">{nextEvent.title}</span>
            <span className="font-semibold tabular-nums">
              {formatDuration(nextEvent.countdownMs)}
            </span>
          </div>
        ) : null}
      </div>
    </>
  );
}

function MiniMapOverlayContent({
  routeState,
  activeArea,
  pins,
  planner,
  settings,
  rowRadius,
}: {
  routeState: ReturnType<typeof skyDataIndex.getActiveRouteTarget>;
  activeArea: SkyAreaRoute | null;
  pins: ReturnType<typeof skyDataIndex.getMiniMapPins>;
  planner?: PlannerState;
  settings: AppSettings;
  rowRadius: number;
}) {
  if (!activeArea?.imageUrl || pins.length === 0) {
    return (
      <RouteOverlayContent
        routeState={routeState}
        activeArea={activeArea}
        settings={settings}
        rowRadius={rowRadius}
      />
    );
  }

  const expanded = planner?.activeRoute.miniMapExpanded ?? settings.overlay.miniMap.expanded;
  const size = expanded ? settings.overlay.miniMap.size : 220;
  const target = routeState?.target;

  return (
    <>
      <OverlayHeader title="Mini Map" shortcut={settings.hotkeys.toggleMiniMapExpanded} />
      <div className="grid gap-2">
        <div
          className="relative overflow-hidden border border-border/70 bg-card"
          style={{
            borderRadius: `${rowRadius}px`,
            width: `${size}px`,
            maxWidth: "100%",
          }}
        >
          <img
            src={activeArea.imageUrl}
            alt=""
            className="aspect-[4/3] w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/10" />
          {pins.map((pin) => {
            const complete =
              planner?.routeProgress.completedTargets[pin.targetGuid] === true;
            const active = pin.targetGuid === routeState?.target.guid;
            return (
              <span
                key={pin.guid}
                title={pin.label}
                className={cn(
                  "absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white shadow-[0_0_0_2px_rgba(0,0,0,0.35)]",
                  pin.kind === "winged-light" ? "bg-amber-300" : "bg-cyan-300",
                  complete && "opacity-35",
                  active && "size-4 bg-primary ring-2 ring-white",
                )}
                style={{ left: `${pin.x}%`, top: `${pin.y}%` }}
              />
            );
          })}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-2">
            <p className="truncate text-sm font-semibold">{activeArea.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {routeState?.target.name ?? "No target selected"}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-sm border border-border/60 bg-muted/30 px-2 py-1.5 text-xs">
          <span>
            {routeState?.completedCount ?? 0} / {routeState?.total ?? 0} complete
          </span>
          <span>{expanded ? "expanded" : "compact"}</span>
        </div>
        {target ? (
          <div
            className="grid gap-1 border border-border/60 bg-card/80 p-2"
            style={{ borderRadius: `${rowRadius}px` }}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{target.name}</p>
              <Badge variant="outline" className="rounded-sm text-[10px]">
                {routeState.targetIndex + 1}/{routeState.total}
              </Badge>
            </div>
            <p className="line-clamp-2 text-xs leading-4 text-muted-foreground">
              {target.description}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function ClockRouteOverlayContent({
  routeState,
  activeArea,
  pins,
  planner,
  events,
  settings,
  rowRadius,
}: {
  routeState: ReturnType<typeof skyDataIndex.getActiveRouteTarget>;
  activeArea: SkyAreaRoute | null;
  pins: ReturnType<typeof skyDataIndex.getMiniMapPins>;
  planner?: PlannerState;
  events: EventInstance[];
  settings: AppSettings;
  rowRadius: number;
}) {
  const canShowMiniMap =
    Boolean(activeArea?.imageUrl) &&
    pins.length > 0;
  const clockLimit = canShowMiniMap ? 2 : 3;
  const clockEvents = events.slice(
    0,
    Math.min(settings.overlay.maxEvents, clockLimit),
  );

  return (
    <>
      <OverlayHeader title="Clock + Route" shortcut={settings.hotkeys.cycleOverlayMode} />
      {clockEvents.length > 0 ? (
        <div className="mb-2 grid gap-1.5">
          {clockEvents.map((event) => (
            <div
              key={`${event.definitionId}-${event.startsAtUtc}`}
              className="grid gap-1 border border-border/70 bg-card/80 p-2"
              style={{ borderRadius: `${rowRadius}px` }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium">{event.title}</p>
                <StatusBadge status={event.status} />
              </div>
              <div className="flex items-end justify-between gap-2">
                <p className="text-lg font-semibold tabular-nums leading-none">
                  {formatDuration(event.countdownMs)}
                </p>
                <p className="text-right text-[11px] text-muted-foreground">
                  {settings.display.showLocalTime ? event.localTimeLabel : null}
                  {settings.display.showSkyTime ? ` / ${event.skyTimeLabel}` : null}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {canShowMiniMap ? (
        <MiniMapOverlayContent
          routeState={routeState}
          activeArea={activeArea}
          pins={pins}
          planner={planner}
          settings={settings}
          rowRadius={rowRadius}
        />
      ) : (
        <RouteOverlayContent
          routeState={routeState}
          activeArea={activeArea}
          settings={settings}
          rowRadius={rowRadius}
          showHeader={false}
        />
      )}
    </>
  );
}

function UpdateStatusIcon({ status }: { status: AppUpdateState["status"] }) {
  if (status === "available" || status === "downloading" || status === "installing") {
    return <Download className="size-4 text-primary" />;
  }

  if (status === "current" || status === "installed") {
    return <CircleCheck className="size-4 text-primary" />;
  }

  if (status === "error" || status === "unsupported") {
    return <TriangleAlert className="size-4 text-destructive" />;
  }

  if (status === "checking") {
    return <RefreshCw className="size-4 animate-spin text-primary" />;
  }

  return <Upload className="size-4 text-muted-foreground" />;
}

function updateStatusTitle(updateState: AppUpdateState) {
  if (updateState.status === "available") {
    return `Update ${updateState.latestVersion} available`;
  }

  const titles: Record<AppUpdateState["status"], string> = {
    idle: "Update check pending",
    checking: "Checking for updates",
    available: "Update available",
    current: "App is up to date",
    downloading: "Downloading update",
    installing: "Installing update",
    installed: "Update installed",
    unsupported: "Updates unavailable",
    error: "Update check failed",
  };

  return titles[updateState.status];
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border border-border/70 bg-muted/20 p-2.5">
      <span className="text-[0.68rem] font-semibold uppercase tracking-normal text-muted-foreground/70">
        {label}
      </span>
      <span className="min-w-0 break-words text-foreground">{value}</span>
    </div>
  );
}

function MarkdownChangelog({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-3 text-lg font-semibold text-foreground">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-4 text-base font-semibold text-foreground first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-3 text-sm font-semibold text-foreground">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="my-2 leading-6 text-muted-foreground">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-6">{children}</li>,
        a: ({ children, href }) => (
          <a
            className="break-words font-medium text-primary underline-offset-4 hover:underline"
            href={href}
            rel="noreferrer"
            target="_blank"
          >
            {children}
          </a>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="block overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {children}
              </code>
            );
          }

          return (
            <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
              {children}
            </code>
          );
        },
        pre: ({ children }) => <pre className="my-3 overflow-x-auto">{children}</pre>,
        blockquote: ({ children }) => (
          <blockquote className="my-3 border-l-2 border-primary/50 pl-3 text-muted-foreground">
            {children}
          </blockquote>
        ),
        hr: () => <Separator className="my-4" />,
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted p-2 font-semibold text-foreground">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border p-2 align-top">{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function OverlayPreview({
  events,
  planner,
  settings,
}: {
  events: EventInstance[];
  planner: PlannerState;
  settings: AppSettings;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overlay Preview</CardTitle>
        <CardDescription>
          {settings.overlay.maxEvents} rows at {Math.round(settings.overlay.opacity * 100)}% opacity,
          {` ${settings.overlay.cornerRadius}px`} radius.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Overlay events={events} planner={planner} settings={settings} />
      </CardContent>
    </Card>
  );
}

function MetricCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactElement;
}) {
  return (
    <Card>
      <CardContent className="grid min-h-[6.5rem] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-3.5">
        <p className="min-w-0 text-sm font-semibold leading-snug text-muted-foreground">
          {title}
        </p>
        <div className="row-span-2 flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15 [&_svg]:size-5">
          {icon}
        </div>
        <MetricValue value={value} />
      </CardContent>
    </Card>
  );
}

function MetricValue({ value }: { value: string }) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const timeMatch = normalized.match(/^(.+?)\s+(am|pm)(?:\s+(.+))?$/i);

  if (timeMatch) {
    const [, time, period, zone] = timeMatch;

    return (
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-1 text-foreground">
        <span className="text-[1.35rem] font-semibold leading-none tabular-nums">
          {time}
        </span>
        <span className="text-sm font-bold uppercase leading-none tracking-normal">
          {period}
        </span>
        {zone ? (
          <span className="text-sm font-bold uppercase leading-none tracking-normal text-muted-foreground">
            {zone}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <p className="whitespace-nowrap text-[1.35rem] font-semibold leading-none tabular-nums text-foreground">
      {normalized}
    </p>
  );
}

function eventReminderKey(event: EventInstance) {
  return `${event.definitionId}:${event.startsAtUtc}`;
}

function EventRow({
  event,
  reminderEnabled,
  onToggleReminder,
}: {
  event: EventInstance;
  reminderEnabled: boolean;
  onToggleReminder: (event: EventInstance) => void;
}) {
  const ReminderIcon = reminderEnabled ? Bell : BellOff;

  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/70 p-3 transition-colors hover:bg-muted/25 md:grid-cols-[1fr_auto_auto] md:items-center">
      <div className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{event.title}</p>
          <StatusBadge status={event.status} />
          {event.source === "community" ? <Badge variant="outline">predicted</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {[event.location, event.phaseLabel, event.rewardLabel].filter(Boolean).join(" - ")}
        </p>
      </div>
      <div className="text-left md:text-right">
        <p className="font-semibold tabular-nums">{formatDuration(event.countdownMs)}</p>
        <p className="text-xs text-muted-foreground">
          {event.localTimeLabel} local / {event.skyTimeLabel}
        </p>
      </div>
      <Button
        type="button"
        variant={reminderEnabled ? "secondary" : "ghost"}
        size="icon-sm"
        className="justify-self-start md:justify-self-end"
        aria-pressed={reminderEnabled}
        aria-label={
          reminderEnabled
            ? `Disable reminder for ${event.title}`
            : `Enable reminder for ${event.title}`
        }
        title={reminderEnabled ? "Disable reminder" : "Remind me 10s before"}
        onClick={() => onToggleReminder(event)}
      >
        <ReminderIcon />
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: EventInstance["status"] }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 rounded-sm capitalize",
        status === "active" &&
          "border-primary/25 bg-primary/10 text-primary dark:bg-primary/15",
        status === "endingSoon" &&
          "border-destructive/25 bg-destructive/10 text-destructive",
        status === "preparing" &&
          "border-chart-2/25 bg-chart-2/10 text-chart-4 dark:text-chart-2",
        status === "upcoming" &&
          "border-border bg-secondary text-secondary-foreground",
        status === "ended" &&
          "border-border bg-muted/40 text-muted-foreground",
      )}
    >
      {status === "endingSoon" ? "ending" : status}
    </Badge>
  );
}

function CalendarEntryRow({ entry }: { entry: SkyCalendarEntry }) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-card/70 p-2.5 transition-colors hover:bg-muted/25">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{entry.name}</p>
        <Badge variant="outline">{entry.kind}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {entry.date} to {entry.endDate}
      </p>
    </div>
  );
}

function AreaRouteCard({
  areaRoute,
  activeTarget,
  completedCount,
  totalCount,
  connections,
}: {
  areaRoute: SkyAreaRoute | null;
  activeTarget: SkyRouteTarget | null;
  completedCount: number;
  totalCount: number;
  connections: Array<{ guid: string; name: string }>;
}) {
  if (!areaRoute) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Choose a realm and area to preview route targets.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {areaRoute.imageUrl ? (
        <div className="relative aspect-[16/7] overflow-hidden bg-muted">
          <img
            src={areaRoute.imageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-4">
            <p className="text-lg font-semibold">{areaRoute.name}</p>
            <p className="text-sm text-muted-foreground">{areaRoute.realmName}</p>
          </div>
        </div>
      ) : null}
      <CardHeader>
        <CardTitle className="text-base">{areaRoute.name}</CardTitle>
        <CardDescription>
          {completedCount} of {totalCount} route targets complete.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="grid gap-2 md:grid-cols-3">
          <InfoRow label="Spirits" value={String(areaRoute.counts.spirits)} />
          <InfoRow
            label="Winged lights"
            value={String(areaRoute.counts.wingedLights)}
          />
          <InfoRow label="Total" value={String(areaRoute.counts.total)} />
        </div>
        {activeTarget ? (
          <div className="rounded-md border border-primary/25 bg-primary/10 p-3">
            <p className="text-sm font-semibold">Active target</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeTarget.name} - {activeTarget.description}
            </p>
          </div>
        ) : null}
        {connections.length > 0 ? (
          <div className="grid gap-1">
            <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground/70">
              Connected areas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {connections.slice(0, 12).map((area) => (
                <Badge key={area.guid} variant="secondary" className="rounded-sm">
                  {area.name}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RouteTargetRow({
  target,
  active,
  complete,
  index,
}: {
  target: SkyRouteTarget;
  active: boolean;
  complete: boolean;
  index: number;
}) {
  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-border bg-card/70 p-3 transition-colors md:grid-cols-[auto_1fr_auto] md:items-center",
        active && "border-primary/35 bg-primary/10",
        complete && "opacity-65",
      )}
    >
      <Badge variant={target.kind === "winged-light" ? "default" : "secondary"}>
        {index + 1}
      </Badge>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{target.name}</p>
          <Badge variant="outline" className="rounded-sm">
            {target.kind === "winged-light" ? "Winged Light" : "Spirit"}
          </Badge>
          {active ? <Badge className="rounded-sm">Active</Badge> : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[target.areaName, target.description].filter(Boolean).join(" - ")}
        </p>
      </div>
      <Badge variant={complete ? "default" : "secondary"} className="rounded-sm">
        {complete ? "Done" : "Open"}
      </Badge>
    </div>
  );
}

function CandleRunMapPreview({
  imageUrl,
  name,
}: {
  imageUrl: string;
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{
    pointerId: number;
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  function resetImageView() {
    setZoomed(false);
    setZoomOrigin({ x: 50, y: 50 });
    setPan({ x: 0, y: 0 });
    setDrag(null);
  }

  function openMap() {
    resetImageView();
    setOpen(true);
  }

  function closeMap() {
    setOpen(false);
    resetImageView();
  }

  function toggleImageZoom(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (drag?.moved) {
      setDrag(null);
      return;
    }

    if (zoomed) {
      resetImageView();
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    setZoomOrigin({
      x: ((event.clientX - rect.left) / rect.width) * 100,
      y: ((event.clientY - rect.top) / rect.height) * 100,
    });
    setPan({ x: 0, y: 0 });
    setZoomed(true);
  }

  function startImageDrag(event: React.PointerEvent<HTMLButtonElement>) {
    event.stopPropagation();

    if (!zoomed) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    });
  }

  function moveImageDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.stopPropagation();

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    setDrag({
      ...drag,
      moved: drag.moved || Math.hypot(deltaX, deltaY) > 4,
    });
    setPan({
      x: drag.panX + deltaX,
      y: drag.panY + deltaY,
    });
  }

  function endImageDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeMap();
      }
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const overlay =
    open && portalReady
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${name} candle map`}
            className="fixed inset-0 z-50 flex h-svh w-svw touch-none items-center justify-center overflow-hidden bg-background/85 p-6 backdrop-blur-sm"
            onClick={closeMap}
            onWheel={(event) => event.preventDefault()}
          >
            <Button
              type="button"
              aria-label="Close map"
              title="Close map"
              variant="ghost"
              size="icon-sm"
              className="absolute right-4 top-4 bg-background/80 shadow-sm"
              onClick={(event) => {
                event.stopPropagation();
                closeMap();
              }}
            >
              <X />
            </Button>
            <button
              type="button"
              aria-label={zoomed ? "Show full map" : "Zoom map"}
              className={cn(
                "flex max-h-[calc(100svh-3rem)] max-w-[calc(100svw-3rem)] items-center justify-center overflow-hidden outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
                zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in",
              )}
              onClick={toggleImageZoom}
              onPointerDown={startImageDrag}
              onPointerMove={moveImageDrag}
              onPointerUp={endImageDrag}
              onPointerCancel={endImageDrag}
            >
              <img
                src={imageUrl}
                alt={`${name} candle map`}
                className={cn(
                  "max-h-[calc(100svh-3rem)] max-w-[calc(100svw-3rem)] object-contain drop-shadow-2xl transition-transform duration-200",
                  zoomed && "scale-200",
                )}
                draggable={false}
                style={{
                  transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                  translate: `${pan.x}px ${pan.y}px`,
                }}
              />
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label={`Open ${name} candle map`}
        className="group relative aspect-[16/6] w-full overflow-hidden bg-muted text-left outline-hidden transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={openMap}
      >
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-4">
          <p className="text-lg font-semibold">{name}</p>
        </div>
        <div className="absolute right-3 top-3 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Open map
        </div>
      </button>
      {overlay}
    </>
  );
}

function CandleRunButton({
  run,
  active,
  completedGroups,
  onClick,
}: {
  run: SkyCandleRunSummary;
  active: boolean;
  completedGroups: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid min-w-0 gap-1 rounded-md border border-border bg-card/70 p-3 text-left transition-colors hover:bg-muted/35",
        active && "border-primary/35 bg-primary/10",
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">{run.name}</span>
        {active ? <Badge className="rounded-sm">Active</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
        <span>{completedGroups}/{run.groupCount} groups</span>
        <span>{run.waxCount} wax</span>
      </div>
    </button>
  );
}

function CandleGroupRow({
  group,
  index,
  complete,
  onToggle,
}: {
  group: SkyCandleGroup;
  index: number;
  complete: boolean;
  onToggle: () => void;
}) {
  const waxCount = countCandleGroupWax(group);

  return (
    <div
      className={cn(
        "grid gap-2 rounded-md border border-border bg-card/70 p-3 transition-colors md:grid-cols-[auto_1fr_auto] md:items-center",
        complete && "opacity-65",
      )}
    >
      <Badge variant={complete ? "default" : "secondary"}>{index + 1}</Badge>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">{group.name}</p>
          <Badge variant="outline" className="rounded-sm">
            {group.candles.length} spots
          </Badge>
          <Badge variant="outline" className="rounded-sm">
            {waxCount} wax
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {group.candles
            .map((candle) => candle.description)
            .filter(Boolean)
            .slice(0, 2)
            .join(" - ") || "Standard candle group"}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant={complete ? "default" : "secondary"}
        onClick={onToggle}
      >
        {complete ? (
          <CircleCheck data-icon="inline-start" />
        ) : (
          <Flame data-icon="inline-start" />
        )}
        {complete ? "Done" : "Mark"}
      </Button>
    </div>
  );
}

function GoalRow({
  goal,
  onStatusChange,
}: {
  goal: PlannerGoal;
  onStatusChange: (status: PlannerGoal["status"]) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-card/80 p-3 shadow-[0_1px_1px_color-mix(in_oklch,var(--foreground)_5%,transparent)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{goal.title}</p>
        <Badge
          variant={goal.status === "done" ? "default" : "secondary"}
          className="rounded-sm"
        >
          {goal.status}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {[goal.currencyNeeded ? `${goal.currencyNeeded} currency` : null, goal.dueDate]
          .filter(Boolean)
          .join(" - ")}
      </p>
      <div className="flex gap-2">
        {(["planned", "active", "done"] as const).map((status) => (
          <Button
            key={status}
            type="button"
            size="xs"
            variant={goal.status === status ? "default" : "secondary"}
            onClick={() => onStatusChange(status)}
          >
            {status}
          </Button>
        ))}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  wished,
  onToggleWishlist,
}: {
  item: SkyItemSummary;
  wished: boolean;
  onToggleWishlist: () => void;
}) {
  return (
    <div className="grid gap-2.5 rounded-md border border-border bg-card/80 p-3 shadow-[0_1px_1px_color-mix(in_oklch,var(--foreground)_5%,transparent)] transition-colors hover:bg-muted/25">
      <div className="flex items-start gap-3">
        {item.icon ? (
          <img
            src={item.icon}
            alt=""
            className="size-10 shrink-0 rounded-sm bg-muted object-contain ring-1 ring-border"
          />
        ) : (
          <div className="size-10 shrink-0 rounded-sm bg-muted ring-1 ring-border" />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{item.name}</p>
          <p className="text-sm text-muted-foreground">{item.type}</p>
        </div>
        <Button type="button" size="icon-sm" variant={wished ? "default" : "secondary"} onClick={onToggleWishlist}>
          <Star className="size-4" />
        </Button>
      </div>
      <div className="grid gap-1">
        {item.origins.slice(0, 2).map((origin, index) => (
          <p key={`${origin.kind}-${origin.name}-${index}`} className="truncate text-xs text-muted-foreground">
            {origin.kind}: {origin.name}
          </p>
        ))}
      </div>
    </div>
  );
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

function HotkeyCaptureDialog({
  target,
  currentShortcut,
  onCancel,
  onCapture,
}: {
  target: { id: keyof AppSettings["hotkeys"]; label: string } | null;
  currentShortcut: string;
  onCancel: () => void;
  onCapture: (shortcut: string) => void;
}) {
  const [preview, setPreview] = useState("");

  useEffect(() => {
    if (!target) {
      setPreview("");
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.key === "Escape") {
        onCancel();
        return;
      }

      const shortcut = shortcutFromKeyboardEvent(event);
      setPreview(shortcut || modifierPreviewFromKeyboardEvent(event));

      if (shortcut) {
        onCapture(shortcut);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [onCancel, onCapture, target]);

  if (!target) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-background/70 p-5 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <Card
        className="w-full max-w-md shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotkey-capture-title"
      >
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <div>
            <CardTitle id="hotkey-capture-title" className="text-base">
              Press a shortcut
            </CardTitle>
            <CardDescription>
              {target.label}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel shortcut capture"
            onClick={onCancel}
          >
            <X className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid min-h-24 place-items-center rounded-md border border-dashed border-border bg-muted/30 p-4 text-center">
            <div className="grid gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Hold modifiers, then press the final key
              </p>
              <p className="font-mono text-2xl font-semibold tabular-nums">
                {preview || currentShortcut || "..."}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Escape cancels. The shortcut saves automatically after the final key.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function shortcutFromKeyboardEvent(event: KeyboardEvent) {
  const key = normalizeShortcutKey(event.key, event.code);
  if (!key) {
    return "";
  }

  return [...modifierPartsFromKeyboardEvent(event), key].join("+");
}

function modifierPreviewFromKeyboardEvent(event: KeyboardEvent) {
  return modifierPartsFromKeyboardEvent(event).join("+");
}

function modifierPartsFromKeyboardEvent(event: KeyboardEvent) {
  return [
    event.ctrlKey ? "Ctrl" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    event.metaKey ? "Meta" : null,
  ].filter(Boolean) as string[];
}

function normalizeShortcutKey(key: string, code: string) {
  if (MODIFIER_KEYS.has(key)) {
    return "";
  }

  if (/^F(?:[1-9]|1\d|2[0-4])$/.test(key)) {
    return key;
  }

  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3);
  }

  if (/^Digit\d$/.test(code)) {
    return code.slice(5);
  }

  if (/^Numpad\d$/.test(code)) {
    return `Numpad${code.slice(6)}`;
  }

  const namedKeys: Record<string, string> = {
    " ": "Space",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    ArrowUp: "ArrowUp",
    Backspace: "Backspace",
    Delete: "Delete",
    End: "End",
    Enter: "Enter",
    Home: "Home",
    Insert: "Insert",
    PageDown: "PageDown",
    PageUp: "PageUp",
    Spacebar: "Space",
    Tab: "Tab",
  };

  if (namedKeys[key]) {
    return namedKeys[key];
  }

  if (key.length === 1) {
    return key.toUpperCase();
  }

  return key;
}

function SettingsPanel({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactElement;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/15 [&_svg]:size-4">
            {icon}
          </span>
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function SettingGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function SettingRow({
  label,
  description,
  control,
}: {
  label: string;
  description: string;
  control: React.ReactNode;
}) {
  return (
    <div className="grid gap-3 rounded-md border border-border bg-card/70 p-3 md:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)] md:items-center">
      <div className="min-w-0">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      {control}
    </div>
  );
}

function ChoiceButton({
  selected,
  label,
  description,
  icon,
  onClick,
}: {
  selected: boolean;
  label: string;
  description: string;
  icon?: React.ReactElement;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "grid min-h-20 gap-1 rounded-md border bg-card/70 p-3 text-left transition-colors hover:bg-muted/30",
        selected
          ? "border-primary/45 bg-primary/10 text-foreground ring-1 ring-primary/20"
          : "border-border text-foreground",
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 text-sm font-semibold">
        {icon}
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  );
}

function SettingSwitch({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4",
        disabled && "opacity-60",
      )}
    >
      <div className="min-w-0">
        <Label>{label}</Label>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function SliderSetting({
  label,
  value,
  min,
  max,
  step,
  display,
  onValueChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onValueChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm text-muted-foreground">{display}</span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([next]) => onValueChange(next)}
      />
    </div>
  );
}

function candleGroupKey(
  runGuid: string,
  group: SkyCandleGroup,
  index: number,
) {
  return `${runGuid}:${index}:${group.name}`;
}

function countCompletedRunGroups(
  runGuid: string,
  completedGroups: Record<string, boolean>,
  groups: SkyCandleGroup[],
) {
  return groups.filter((group, index) =>
    completedGroups[candleGroupKey(runGuid, group, index)],
  ).length;
}

function groupCalendar(
  entries: SkyCalendarEntry[],
  goals: PlannerGoal[],
  startIso: string,
  endIso: string,
) {
  const grouped = new Map<string, Array<{ id: string; label: string }>>();
  const add = (date: string, item: { id: string; label: string }) => {
    grouped.set(date, [...(grouped.get(date) ?? []), item]);
  };

  for (const entry of entries) {
    const rangeStart = entry.date > startIso ? entry.date : startIso;
    const rangeEnd = entry.endDate < endIso ? entry.endDate : endIso;

    for (let date = rangeStart; date <= rangeEnd; date = addDaysIso(date, 1)) {
      add(date, { id: `${entry.guid}-${date}`, label: entry.name });
    }
  }

  for (const goal of goals) {
    if (goal.dueDate) {
      add(goal.dueDate, { id: goal.id, label: `Goal: ${goal.title}` });
    }
  }

  return grouped;
}
