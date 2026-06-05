import { useEffect, useMemo, useRef, useState } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import { emit, listen } from "@tauri-apps/api/event";
import "./App.css";
import { AppSidebar, type AppPage } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DEFAULT_SETTINGS, mergeSettings } from "@/domain/settings";
import { generateEventInstances } from "@/domain/events";
import {
  deserializePlannerState,
  PLANNER_STORAGE_KEY,
  serializePlannerState,
  type PlannerState,
} from "@/domain/planner";
import { applyAppearance } from "@/domain/theme";
import type { AppSettings, EventInstance } from "@/domain/types";
import {
  configureOverlayWindow,
  getWindowLabel,
  isTauriRuntime,
  registerAppHotkeys,
  toggleOverlay,
} from "@/tauri/overlay";
import {
  CalendarPage,
  CollectionPage,
  GoalsPage,
  Overlay,
  OverlaySettingsPage,
  OverviewPage,
  PageHeader,
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
  const [activePage, setActivePage] = useState<AppPage>("overview");
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [now, setNow] = useState(() => new Date());
  const [windowLabel, setWindowLabel] = useState<string | null>(null);
  const [hotkeyError, setHotkeyError] = useState("");
  const [updateState, setUpdateState] = useState<AppUpdateState>(initialUpdateState);
  const pendingUpdate = useRef<Update | null>(null);
  const enabledEventsKey = useMemo(
    () => JSON.stringify(settings.events),
    [settings.events],
  );

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
        applyAppearance(settings, nativeTheme ?? undefined);
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
  }, [planner, windowLabel]);

  useEffect(() => {
    void configureOverlayWindow(settings);
  }, [settings]);

  useEffect(() => {
    if (windowLabel !== "overlay") {
      return;
    }

    const syncSettings = () => setSettings(readStoredSettings());
    const unlistenPromise = isTauriRuntime()
      ? listen<AppSettings>("sky-settings-changed", (event) =>
          setSettings(mergeSettings(event.payload)),
        )
      : Promise.resolve(() => undefined);

    window.addEventListener("storage", syncSettings);
    window.addEventListener("sky-settings-changed", syncSettings);

    return () => {
      window.removeEventListener("storage", syncSettings);
      window.removeEventListener("sky-settings-changed", syncSettings);
      void unlistenPromise.then((unlisten) => unlisten());
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

    void registerAppHotkeys(settings, setHotkeyError);
  }, [
    settings.hotkeys.showMainWindow,
    settings.hotkeys.toggleOverlay,
    settings.overlay.enabled,
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

  if (!windowLabel) {
    return null;
  }

  if (windowLabel === "overlay") {
    return <Overlay events={overlayEvents} settings={settings} animated />;
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
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
        <SidebarInset className="h-svh min-h-0 overflow-hidden">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background/90 px-4 shadow-[0_1px_2px_color-mix(in_oklch,var(--foreground)_6%,transparent)]">
              <SidebarTrigger />
              <div className="text-sm font-medium text-muted-foreground">
                {pageTitle(activePage)}
              </div>
            </div>
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
                onPlannerChange={setPlanner}
                onSettingsChange={setSettings}
                onToggleOverlay={() => void toggleOverlay(settings)}
                onRefreshUpdate={() => void refreshUpdate()}
                onInstallUpdate={() => void installUpdate()}
              />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
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
  onPlannerChange,
  onSettingsChange,
  onToggleOverlay,
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
  onPlannerChange: (planner: PlannerState) => void;
  onSettingsChange: (settings: AppSettings) => void;
  onToggleOverlay: () => void;
  onRefreshUpdate: () => void;
  onInstallUpdate: () => void;
}) {
  if (activePage === "overview") {
    return (
      <OverviewPage
        now={now}
        events={events}
        settings={settings}
        onToggleOverlay={onToggleOverlay}
      />
    );
  }

  if (activePage === "calendar") {
    return <CalendarPage selectedDate={selectedDate} planner={planner} />;
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
    goals: "Goals",
    collection: "Collection",
    overlay: "Overlay",
    settings: "Settings",
    updates: "Updates",
  };

  return titles[page];
}

export default App;
