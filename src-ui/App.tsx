import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, PanelLeft, Square, X } from "lucide-react";
import { toast } from "sonner";
import "./App.css";
import { AppSidebar, type AppPage } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_SETTINGS, mergeSettings } from "@/domain/settings";
import { generateEventInstances } from "@/domain/events";
import {
  deserializePlannerState,
  moveActiveRouteTarget,
  PLANNER_STORAGE_KEY,
  toggleMiniMapExpanded,
  toggleRouteTargetComplete,
  serializePlannerState,
  type PlannerState,
} from "@/domain/planner";
import { applyAppearance, resolveTheme } from "@/domain/theme";
import type { AppSettings, EventInstance } from "@/domain/types";
import { skyDataIndex } from "@/data/skygame";
import {
  configureOverlayWindow,
  getWindowLabel,
  isTauriRuntime,
  registerAppHotkeys,
  showOverlay,
  toggleOverlay,
} from "@/tauri/overlay";
import { isGameProcessRunning } from "@/tauri/game-detection";
import {
  CalendarPage,
  CollectionPage,
  GoalsPage,
  Overlay,
  OverlaySettingsPage,
  OverviewPage,
  PageHeader,
  RoutesPage,
  SettingsPage,
  UpdatesPage,
} from "@/pages";
import {
  checkForAppUpdate,
  initialUpdateState,
  installAppUpdate,
  type AppUpdateState,
  type UpdateStatePatch,
} from "@/tauri/updater";
import { listenNativeThemeChange, syncNativeTheme } from "@/tauri/theme";

const SETTINGS_KEY = "sky-cotl-clock-settings";
const REMINDERS_KEY = "sky-cotl-clock-reminders";
const REMINDER_LEAD_MS = 10_000;
const REMINDER_TRIGGER_WINDOW_MS = 1_500;

function readStoredSettings() {
  try {
    return mergeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null"));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function readStoredPlanner() {
  return deserializePlannerState(localStorage.getItem(PLANNER_STORAGE_KEY));
}

function readStoredReminders() {
  try {
    const parsed = JSON.parse(localStorage.getItem(REMINDERS_KEY) ?? "{}");
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(([, enabled]) => enabled === true),
    ) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function eventReminderKey(event: EventInstance) {
  return `${event.definitionId}:${event.startsAtUtc}`;
}

function reminderBody(event: EventInstance) {
  return [event.location, event.phaseLabel, `${event.localTimeLabel} local`]
    .filter(Boolean)
    .join(" - ");
}

function playReminderSound() {
  const AudioContextCtor = window.AudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.34);
  window.setTimeout(() => void context.close(), 450);
}

async function ensureNotificationPermission() {
  if (!isTauriRuntime()) {
    return false;
  }

  let granted = await isPermissionGranted();
  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }

  return granted;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

function isBlockedProductionShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  const modifier = event.ctrlKey || event.metaKey;

  return (
    event.key === "F5" ||
    event.key === "F12" ||
    (modifier && key === "r") ||
    (modifier && key === "u") ||
    (modifier && event.shiftKey && ["c", "i", "j"].includes(key))
  );
}

function App() {
  const [settings, setSettings] = useState<AppSettings>(readStoredSettings);
  const [planner, setPlanner] = useState<PlannerState>(readStoredPlanner);
  const [reminders, setReminders] =
    useState<Record<string, boolean>>(readStoredReminders);
  const [activePage, setActivePage] = useState<AppPage>("overview");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [hotkeyError, setHotkeyError] = useState("");
  const [updateState, setUpdateState] = useState<AppUpdateState>(initialUpdateState);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const pendingUpdate = useRef<Update | null>(null);
  const latestSettings = useRef(settings);
  const gamePresence = useRef({
    running: false,
    overlayShownForLaunch: false,
    showTimer: 0,
  });
  const enabledEventsKey = useMemo(
    () => JSON.stringify(settings.events),
    [settings.events],
  );

  useEffect(() => {
    latestSettings.current = settings;
  }, [settings]);

  useEffect(() => {
    void getWindowLabel().then((label) => {
      document.body.dataset.windowLabel = label;
      setWindowLabel(label);
    });
  }, []);

  useEffect(() => {
    if (!import.meta.env.PROD) {
      return;
    }

    document.documentElement.dataset.appHardened = "true";

    const preventContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };
    const preventDrag = (event: DragEvent) => {
      event.preventDefault();
    };
    const preventSelection = (event: Event) => {
      if (!isEditableTarget(event.target)) {
        event.preventDefault();
      }
    };
    const preventShortcuts = (event: KeyboardEvent) => {
      if (isBlockedProductionShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("contextmenu", preventContextMenu);
    window.addEventListener("dragstart", preventDrag);
    window.addEventListener("selectstart", preventSelection);
    window.addEventListener("keydown", preventShortcuts, true);

    return () => {
      delete document.documentElement.dataset.appHardened;
      window.removeEventListener("contextmenu", preventContextMenu);
      window.removeEventListener("dragstart", preventDrag);
      window.removeEventListener("selectstart", preventSelection);
      window.removeEventListener("keydown", preventShortcuts, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const applyTheme = async () => {
      const nativeTheme = await syncNativeTheme(settings.theme);
      if (!cancelled) {
        const resolved =
          nativeTheme ??
          resolveTheme(
            settings.theme,
            window.matchMedia("(prefers-color-scheme: dark)").matches,
          );
        applyAppearance(settings, resolved);
        setResolvedTheme(resolved);
      }
    };

    void applyTheme();

    return () => {
      cancelled = true;
    };
  }, [
    settings.appearance.accentColor,
    settings.appearance.fontFamily,
    settings.theme,
  ]);

  useEffect(() => {
    if (settings.theme !== "system") {
      return;
    }

    const unlistenPromise = listenNativeThemeChange((nativeTheme) => {
      applyAppearance(settings, nativeTheme);
      setResolvedTheme(nativeTheme);
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, [
    settings.appearance.accentColor,
    settings.appearance.fontFamily,
    settings.theme,
  ]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent("sky-settings-changed"));
    if (isTauriRuntime()) {
      void emit("sky-settings-changed", settings);
    }
  }, [settings, windowLabel]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    localStorage.setItem(PLANNER_STORAGE_KEY, serializePlannerState(planner));
    window.dispatchEvent(new CustomEvent("sky-planner-changed"));
    if (isTauriRuntime()) {
      void emit("sky-planner-changed", planner);
    }
  }, [planner, windowLabel]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    localStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  }, [reminders, windowLabel]);

  useEffect(() => {
    void configureOverlayWindow(settings);
  }, [settings]);

  useEffect(() => {
    if (windowLabel !== "overlay") {
      return;
    }

    const syncSettings = () => setSettings(readStoredSettings());
    const syncPlanner = () => setPlanner(readStoredPlanner());
    const unlistenPromise = isTauriRuntime()
      ? listen<AppSettings>("sky-settings-changed", (event) =>
          setSettings(mergeSettings(event.payload)),
        )
      : Promise.resolve(() => undefined);
    const unlistenPlannerPromise = isTauriRuntime()
      ? listen<PlannerState>("sky-planner-changed", (event) =>
          setPlanner(event.payload),
        )
      : Promise.resolve(() => undefined);

    window.addEventListener("storage", syncSettings);
    window.addEventListener("sky-settings-changed", syncSettings);
    window.addEventListener("storage", syncPlanner);
    window.addEventListener("sky-planner-changed", syncPlanner);

    return () => {
      window.removeEventListener("storage", syncSettings);
      window.removeEventListener("sky-settings-changed", syncSettings);
      window.removeEventListener("storage", syncPlanner);
      window.removeEventListener("sky-planner-changed", syncPlanner);
      void unlistenPromise.then((unlisten) => unlisten());
      void unlistenPlannerPromise.then((unlisten) => unlisten());
    };
  }, [windowLabel]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    const getRouteTargetCount = () =>
      planner.activeRoute.areaGuid
        ? skyDataIndex.getRouteTargets(
            planner.activeRoute.areaGuid,
            planner.activeRoute.filters,
          ).length
        : 0;
    const getActiveTargetGuid = () =>
      skyDataIndex.getActiveRouteTarget(
        planner.activeRoute,
        planner.routeProgress,
      )?.target.guid ?? null;

    void registerAppHotkeys(settings, setHotkeyError, {
      cycleOverlayMode: () =>
        setSettings((current) => ({
          ...current,
          overlay: {
            ...current.overlay,
            mode: nextOverlayMode(current.overlay.mode),
          },
        })),
      nextRouteTarget: () =>
        setPlanner((current) =>
          moveActiveRouteTarget(current, 1, getRouteTargetCount()),
        ),
      previousRouteTarget: () =>
        setPlanner((current) =>
          moveActiveRouteTarget(current, -1, getRouteTargetCount()),
        ),
      toggleRouteTargetComplete: () => {
        const targetGuid = getActiveTargetGuid();
        if (targetGuid) {
          setPlanner((current) => toggleRouteTargetComplete(current, targetGuid));
        }
      },
      toggleMiniMapExpanded: () =>
        setPlanner((current) => toggleMiniMapExpanded(current)),
    });
  }, [
    planner.activeRoute,
    planner.routeProgress,
    settings.hotkeys.cycleOverlayMode,
    settings.hotkeys.nextRouteTarget,
    settings.hotkeys.previousRouteTarget,
    settings.hotkeys.showMainWindow,
    settings.hotkeys.toggleMiniMapExpanded,
    settings.hotkeys.toggleOverlay,
    settings.hotkeys.toggleRouteTargetComplete,
    settings.overlay.enabled,
    windowLabel,
  ]);

  useEffect(() => {
    if (
      windowLabel !== "main" ||
      !settings.overlay.enabled ||
      !settings.overlay.gameDetection.enabled ||
      !isTauriRuntime()
    ) {
      const state = gamePresence.current;
      if (state.showTimer) {
        window.clearTimeout(state.showTimer);
        state.showTimer = 0;
      }
      state.running = false;
      state.overlayShownForLaunch = false;
      return;
    }

    let cancelled = false;
    const state = gamePresence.current;
    const processNames = settings.overlay.gameDetection.processNames;
    const delayMs = settings.overlay.gameDetection.startupDelayMs;

    const scheduleOverlay = () => {
      if (state.overlayShownForLaunch || state.showTimer) {
        return;
      }

      state.showTimer = window.setTimeout(async () => {
        state.showTimer = 0;
        if (cancelled || state.overlayShownForLaunch) {
          return;
        }

        const stillRunning = await isGameProcessRunning(processNames).catch(
          () => false,
        );
        if (!cancelled && stillRunning) {
          await showOverlay(latestSettings.current);
          state.overlayShownForLaunch = true;
        }
      }, delayMs);
    };

    const checkPresence = async () => {
      const running = await isGameProcessRunning(processNames).catch(() => false);
      if (cancelled) {
        return;
      }

      if (running) {
        if (!state.running) {
          state.running = true;
        }
        scheduleOverlay();
      }

      if (!running && state.running) {
        state.running = false;
        state.overlayShownForLaunch = false;
        if (state.showTimer) {
          window.clearTimeout(state.showTimer);
          state.showTimer = 0;
        }
      }
    };

    void checkPresence();
    const interval = window.setInterval(() => void checkPresence(), 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (state.showTimer) {
        window.clearTimeout(state.showTimer);
        state.showTimer = 0;
      }
    };
  }, [
    settings.overlay.enabled,
    settings.overlay.gameDetection.enabled,
    settings.overlay.gameDetection.processNames,
    settings.overlay.gameDetection.startupDelayMs,
    windowLabel,
  ]);

  const patchUpdateState = (patch: UpdateStatePatch) =>
    setUpdateState((current) => ({ ...current, ...patch }));

  const refreshUpdate = async () => {
    pendingUpdate.current = await checkForAppUpdate(patchUpdateState);
  };

  const installUpdate = async () => {
    if (!pendingUpdate.current) {
      pendingUpdate.current = await checkForAppUpdate(patchUpdateState);
    }

    if (pendingUpdate.current) {
      await installAppUpdate(pendingUpdate.current, patchUpdateState);
    }
  };

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    void refreshUpdate();
  }, [windowLabel]);

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    const smoothWheelState = new WeakMap<
      Element,
      { animationFrame: number; targetTop: number }
    >();
    const timers = new WeakMap<Element, number>();
    const scrollListeners = new WeakMap<Element, EventListener>();
    const wheelListeners = new WeakMap<Element, EventListener>();
    const watched = new Set<Element>();

    const markScrolling = (element: Element) => {
      if (element.getAttribute("data-scrolling") !== "true") {
        element.setAttribute("data-scrolling", "true");
      }

      const existingTimer = timers.get(element);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      timers.set(
        element,
        window.setTimeout(() => {
          element.removeAttribute("data-scrolling");
          timers.delete(element);
        }, 700),
      );
    };

    const smoothWheel = (element: Element, event: WheelEvent) => {
      if (!(element instanceof HTMLElement)) {
        return;
      }

      const isLikelyTrackpad =
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL && Math.abs(event.deltaY) < 40;

      if (isLikelyTrackpad || !event.deltaY) {
        return;
      }

      event.preventDefault();
      markScrolling(element);

      const multiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 36
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? element.clientHeight
            : 1;
      const delta = event.deltaY * multiplier;
      const maxTop = element.scrollHeight - element.clientHeight;
      const state =
        smoothWheelState.get(element) ??
        { animationFrame: 0, targetTop: element.scrollTop };

      state.targetTop = Math.max(0, Math.min(maxTop, state.targetTop + delta));

      if (state.animationFrame) {
        smoothWheelState.set(element, state);
        return;
      }

      const glide = () => {
        const distance = state.targetTop - element.scrollTop;

        if (Math.abs(distance) < 0.5) {
          element.scrollTop = state.targetTop;
          state.animationFrame = 0;
          smoothWheelState.delete(element);
          return;
        }

        element.scrollTop += distance * 0.18;
        state.animationFrame = window.requestAnimationFrame(glide);
        smoothWheelState.set(element, state);
      };

      state.animationFrame = window.requestAnimationFrame(glide);
      smoothWheelState.set(element, state);
    };

    const bindScrollbars = () => {
      document.querySelectorAll(".theme-scrollbar").forEach((element) => {
        if (watched.has(element)) {
          return;
        }

        watched.add(element);
        const scrollListener = () => markScrolling(element);
        const wheelListener = ((event: WheelEvent) =>
          smoothWheel(element, event)) as EventListener;

        scrollListeners.set(element, scrollListener);
        wheelListeners.set(element, wheelListener);
        element.addEventListener("scroll", scrollListener, {
          passive: true,
        });
        element.addEventListener("wheel", wheelListener, {
          passive: false,
        });
      });
    };

    bindScrollbars();

    const observer = new MutationObserver(bindScrollbars);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      watched.forEach((element) => {
        const timer = timers.get(element);
        if (timer) {
          window.clearTimeout(timer);
        }

        element.removeAttribute("data-scrolling");
        const smoothState = smoothWheelState.get(element);
        if (smoothState?.animationFrame) {
          window.cancelAnimationFrame(smoothState.animationFrame);
        }

        const scrollListener = scrollListeners.get(element);
        if (scrollListener) {
          element.removeEventListener("scroll", scrollListener);
        }

        const wheelListener = wheelListeners.get(element);
        if (wheelListener) {
          element.removeEventListener("wheel", wheelListener);
        }
      });
    };
  }, [windowLabel]);

  const events = useMemo(
    () => generateEventInstances(now, settings),
    [
      now,
      settings.display.localTimeZone,
      settings.display.timeFormat,
      enabledEventsKey,
    ],
  );
  const overlayEvents = useMemo(
    () => events.slice(0, settings.overlay.maxEvents),
    [events, settings.overlay.maxEvents],
  );
  const firedReminders = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (windowLabel !== "main") {
      return;
    }

    const activeKeys = new Set(events.map(eventReminderKey));
    firedReminders.current.forEach((key) => {
      if (!activeKeys.has(key)) {
        firedReminders.current.delete(key);
      }
    });

    const dueEvents = events.filter((event) => {
      const key = eventReminderKey(event);
      return (
        reminders[key] &&
        !firedReminders.current.has(key) &&
        event.status === "upcoming" &&
        event.countdownMs <= REMINDER_LEAD_MS &&
        event.countdownMs > REMINDER_LEAD_MS - REMINDER_TRIGGER_WINDOW_MS
      );
    });

    dueEvents.forEach((event) => {
      const key = eventReminderKey(event);
      firedReminders.current.add(key);
      void deliverReminder(event);
    });
  }, [events, reminders, windowLabel]);

  const toggleReminder = async (event: EventInstance) => {
    const key = eventReminderKey(event);
    const enabled = !reminders[key];

    if (enabled && isTauriRuntime()) {
      void ensureNotificationPermission();
    }

    setReminders((current) => {
      const next = { ...current };
      if (enabled) {
        next[key] = true;
        firedReminders.current.delete(key);
      } else {
        delete next[key];
        firedReminders.current.delete(key);
      }

      return next;
    });

    const notify = enabled ? toast.success : toast.info;

    notify(enabled ? "Reminder enabled" : "Reminder disabled", {
      description: `${event.title} - ${event.localTimeLabel} local`,
    });
  };

  const deliverReminder = async (event: EventInstance) => {
    const title = `${event.title} starts in 10 seconds`;
    const body = reminderBody(event);

    if (isTauriRuntime()) {
      const current = getCurrentWindow();
      const [visible, minimized] = await Promise.all([
        current.isVisible(),
        current.isMinimized(),
      ]);

      if (!visible || minimized) {
        if (await ensureNotificationPermission()) {
          sendNotification({ title, body });
        }
        return;
      }
    }

    playReminderSound();
    toast.info(title, { description: body });
  };

  if (!windowLabel) {
    return null;
  }

  if (windowLabel === "overlay") {
    return (
      <Overlay
        events={overlayEvents}
        settings={settings}
        planner={planner}
        animated
      />
    );
  }

  return (
    <TooltipProvider>
      <div className="app-main-shell flex h-svh min-h-0 flex-col overflow-hidden">
        <SidebarProvider className="min-h-0 flex-1 flex-col">
          <AppTitlebar activePage={activePage} />
          <div className="app-workspace flex min-h-0 flex-1">
            <AppSidebar
              activePage={activePage}
              selectedDate={selectedDate}
              settings={settings}
              planner={planner}
              updateState={updateState}
              onPageChange={setActivePage}
              onSelectedDateChange={setSelectedDate}
              onThemeChange={(theme) => setSettings({ ...settings, theme })}
            />
            <SidebarInset className="flex h-full min-h-0 overflow-hidden">
              <div className="theme-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                <PageContent
                  activePage={activePage}
                  now={now}
                  selectedDate={selectedDate}
                  events={events}
                  planner={planner}
                  settings={settings}
                  hotkeyError={hotkeyError}
                  updateState={updateState}
                  reminders={reminders}
                  onPlannerChange={setPlanner}
                  onSettingsChange={setSettings}
                  onToggleOverlay={() => void toggleOverlay(settings)}
                  onToggleReminder={(event) => void toggleReminder(event)}
                  onRefreshUpdate={() => void refreshUpdate()}
                  onInstallUpdate={() => void installUpdate()}
                />
              </div>
            </SidebarInset>
          </div>
        </SidebarProvider>
        <Toaster theme={resolvedTheme} />
      </div>
    </TooltipProvider>
  );
}

function AppTitlebar({ activePage }: { activePage: AppPage }) {
  const { toggleSidebar } = useSidebar();
  const safeWindowAction = (
    action: (windowControls: ReturnType<typeof getCurrentWindow>) => Promise<void>,
  ) => {
    if (!isTauriRuntime()) {
      return;
    }

    void action(getCurrentWindow());
  };

  return (
    <div className="app-titlebar relative z-50 flex h-8 shrink-0 select-none items-center border-b border-border/80 bg-sidebar/95 text-sidebar-foreground">
      <div
        data-tauri-drag-region
        className="app-titlebar-drag flex h-full min-w-0 flex-1 items-center"
      >
        <div
          data-tauri-drag-region
          className="flex h-full w-(--sidebar-width-icon) shrink-0 items-center justify-center border-r border-sidebar-border"
        >
          <button
            type="button"
            aria-label="Toggle sidebar"
            title="Toggle sidebar"
            className="app-titlebar-sidebar-toggle flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={toggleSidebar}
          >
            <PanelLeft className="size-4" />
          </button>
        </div>
        <div
          data-tauri-drag-region
          className="flex h-full min-w-0 flex-1 items-center gap-2 px-4"
        >
          <span
            data-tauri-drag-region
            className="truncate text-xs font-semibold"
          >
            Isekai
          </span>
          <div
            data-tauri-drag-region
            className="hidden h-4 w-px bg-sidebar-border sm:block"
          />
          <span
            data-tauri-drag-region
            className="hidden truncate text-xs font-medium text-muted-foreground sm:block"
          >
            {pageTitle(activePage)}
          </span>
          <div
            data-tauri-drag-region
            className="min-w-0 flex-1 self-stretch"
          />
        </div>
      </div>
      <div className="flex h-full shrink-0 items-center">
        <TitlebarWindowButton
          label="Minimize"
          onClick={() =>
            safeWindowAction((windowControls) => windowControls.minimize())
          }
        >
          <Minus />
        </TitlebarWindowButton>
        <TitlebarWindowButton
          label="Maximize"
          onClick={() =>
            safeWindowAction((windowControls) => windowControls.toggleMaximize())
          }
        >
          <Square />
        </TitlebarWindowButton>
        <TitlebarWindowButton
          label="Close"
          danger
          onClick={() =>
            safeWindowAction((windowControls) => windowControls.close())
          }
        >
          <X />
        </TitlebarWindowButton>
      </div>
    </div>
  );
}

function TitlebarWindowButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant="ghost"
      className={
        danger
          ? "h-8 w-10 rounded-none text-muted-foreground hover:bg-destructive hover:text-white"
          : "h-8 w-10 rounded-none text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function nextOverlayMode(
  current: AppSettings["overlay"]["mode"],
): AppSettings["overlay"]["mode"] {
  const modes: AppSettings["overlay"]["mode"][] = [
    "clock",
    "route",
    "mini-map",
    "clock-route",
  ];
  const index = modes.indexOf(current);
  return modes[(index + 1) % modes.length];
}

function PageContent({
  activePage,
  now,
  selectedDate,
  events,
  planner,
  settings,
  hotkeyError,
  updateState,
  reminders,
  onPlannerChange,
  onSettingsChange,
  onToggleOverlay,
  onToggleReminder,
  onRefreshUpdate,
  onInstallUpdate,
}: {
  activePage: AppPage;
  now: Date;
  selectedDate: Date;
  events: EventInstance[];
  planner: PlannerState;
  settings: AppSettings;
  hotkeyError: string;
  updateState: AppUpdateState;
  reminders: Record<string, boolean>;
  onPlannerChange: (planner: PlannerState) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onToggleOverlay: () => void;
  onToggleReminder: (event: EventInstance) => void;
  onRefreshUpdate: () => void;
  onInstallUpdate: () => void;
}) {
  if (activePage === "overview") {
    return (
      <OverviewPage
        now={now}
        events={events}
        planner={planner}
        settings={settings}
        reminders={reminders}
        onToggleOverlay={onToggleOverlay}
        onToggleReminder={onToggleReminder}
      />
    );
  }

  if (activePage === "calendar") {
    return <CalendarPage selectedDate={selectedDate} planner={planner} />;
  }

  if (activePage === "routes") {
    return <RoutesPage planner={planner} onPlannerChange={onPlannerChange} />;
  }

  if (activePage === "goals") {
    return <GoalsPage planner={planner} onPlannerChange={onPlannerChange} />;
  }

  if (activePage === "collection") {
    return (
      <CollectionPage planner={planner} onPlannerChange={onPlannerChange} />
    );
  }

  if (activePage === "overlay") {
    return (
      <OverlaySettingsPage
        settings={settings}
        events={events}
        planner={planner}
        onSettingsChange={onSettingsChange}
      />
    );
  }

  if (activePage === "settings") {
    return (
      <SettingsPage
        settings={settings}
        hotkeyError={hotkeyError}
        onSettingsChange={onSettingsChange}
      />
    );
  }

  if (activePage === "updates") {
    return (
      <UpdatesPage
        updateState={updateState}
        onRefresh={onRefreshUpdate}
        onInstall={onInstallUpdate}
      />
    );
  }

  return (
    <PageHeader
      title="Not Found"
      description="The selected page is not available."
    />
  );
}

function pageTitle(page: AppPage) {
  const titles: Record<AppPage, string> = {
    overview: "Overview",
    calendar: "Calendar",
    routes: "Routes",
    goals: "Goals",
    collection: "Collection",
    overlay: "Overlay",
    settings: "Settings",
    updates: "Updates",
  };

  return titles[page];
}

export default App;
