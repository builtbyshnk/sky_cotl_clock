import type * as React from "react";
import {
  CalendarDays,
  CheckSquare,
  Eye,
  Flame,
  Gamepad2,
  Map,
  Monitor,
  Moon,
  Search,
  Settings,
  Sparkles,
  Sun,
  Upload,
} from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import type { AppSettings } from "@/domain/types";
import type { PlannerState } from "@/domain/planner";
import type { AppUpdateState } from "@/tauri/updater";
import { cn } from "@/lib/utils";
import { useI18n, type MessageKey } from "@/i18n";

export type AppPage =
  | "overview"
  | "discord-rpc"
  | "calendar"
  | "candle-runs"
  | "goals"
  | "collection"
  | "routes"
  | "overlay"
  | "settings"
  | "updates";

interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  activePage: AppPage;
  selectedDate: Date;
  settings: AppSettings;
  planner: PlannerState;
  updateState: AppUpdateState;
  onPageChange: (page: AppPage) => void;
  onSelectedDateChange: (date: Date) => void;
  onThemeChange: (theme: AppSettings["theme"]) => void;
}

const sections: Array<{
  titleKey: MessageKey;
  items: Array<{ id: AppPage; titleKey: MessageKey; icon: React.ElementType }>;
}> = [
  {
    titleKey: "nav.clock",
    items: [
      { id: "overview", titleKey: "nav.overview", icon: Sparkles },
      { id: "overlay", titleKey: "nav.overlay", icon: Eye },
      { id: "discord-rpc", titleKey: "nav.discordRpc", icon: Gamepad2 },
    ],
  },
  {
    titleKey: "nav.planner",
    items: [
      { id: "calendar", titleKey: "nav.calendar", icon: CalendarDays },
      { id: "routes", titleKey: "nav.routes", icon: Map },
      { id: "candle-runs", titleKey: "nav.candleRuns", icon: Flame },
      { id: "goals", titleKey: "nav.goals", icon: CheckSquare },
      { id: "collection", titleKey: "nav.collection", icon: Search },
    ],
  },
  {
    titleKey: "nav.system",
    items: [
      { id: "settings", titleKey: "nav.settings", icon: Settings },
      { id: "updates", titleKey: "nav.updates", icon: Upload },
    ],
  },
];

export const PAGE_SECTION_KEYS = Object.fromEntries(
  sections.flatMap((section) =>
    section.items.map((item) => [item.id, section.titleKey] as const),
  ),
) as Record<AppPage, MessageKey>;

const themeOptions = [
  { id: "dark", titleKey: "settings.theme.dark.label", icon: Moon },
  { id: "light", titleKey: "settings.theme.light.label", icon: Sun },
  { id: "system", titleKey: "common.auto", icon: Monitor },
] as const;

export function AppSidebar({
  activePage,
  selectedDate,
  settings,
  planner,
  updateState,
  onPageChange,
  onSelectedDateChange,
  onThemeChange,
  ...props
}: AppSidebarProps) {
  const { t } = useI18n(settings.language);
  return (
    <Sidebar collapsible="none" {...props}>
      <SidebarContent>
        <SidebarGroup className="px-0 pt-2">
          <SidebarGroupContent>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && onSelectedDateChange(date)}
              captionLayout="dropdown"
              className="bg-transparent [--cell-size:2.08rem]"
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="mx-0" />
        {sections.map((section) => (
          <SidebarSection
            key={section.titleKey}
            title={t(section.titleKey)}
            items={section.items}
            activePage={activePage}
            updateAvailable={updateState.status === "available"}
            onPageChange={onPageChange}
            t={t}
          />
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <div className="grid gap-2.5 px-2">
          <div className="flex items-center justify-between gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/35 px-2 py-1.5 text-xs text-sidebar-foreground/75">
            <span className="font-medium">Open goals</span>
            <Badge variant="secondary" className="h-5 rounded-sm">
              {planner.goals.filter((goal) => goal.status !== "done").length}
            </Badge>
          </div>
          {updateState.status === "available" ? (
            <button
              type="button"
              className="flex items-center justify-between gap-2 rounded-md border border-sidebar-primary/30 bg-sidebar-primary/10 px-2 py-1.5 text-left text-xs text-sidebar-foreground transition-colors hover:bg-sidebar-primary/15"
              onClick={() => onPageChange("updates")}
            >
              <span className="min-w-0 truncate font-medium">
                Update {updateState.latestVersion}
              </span>
              <Badge className="h-5 rounded-sm px-1.5 text-[0.65rem]">New</Badge>
            </button>
          ) : null}
          <ThemeTabs value={settings.theme} onValueChange={onThemeChange} t={t} />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

function ThemeTabs({
  value,
  onValueChange,
  t,
}: {
  value: AppSettings["theme"];
  onValueChange: (theme: AppSettings["theme"]) => void;
  t: (key: MessageKey) => string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="grid grid-cols-3 gap-1 rounded-md border border-sidebar-border bg-sidebar-accent/45 p-1"
    >
      {themeOptions.map((theme) => {
        const selected = value === theme.id;
        return (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={cn(
              "grid min-h-8 min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center justify-center gap-1 rounded-sm px-1.5 py-1 text-[0.66rem] font-semibold leading-tight text-sidebar-foreground/70 transition-colors hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
              selected &&
                "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm hover:text-sidebar-primary-foreground",
            )}
            onClick={() => onValueChange(theme.id)}
          >
            <theme.icon className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate whitespace-nowrap text-center">
              {t(theme.titleKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SidebarSection({
  title,
  items,
  activePage,
  updateAvailable,
  onPageChange,
  t,
}: {
  title: string;
  items: Array<{ id: AppPage; titleKey: MessageKey; icon: React.ElementType }>;
  activePage: AppPage;
  updateAvailable: boolean;
  onPageChange: (page: AppPage) => void;
  t: (key: MessageKey) => string;
}) {
  return (
    <SidebarGroup className="px-3 py-1">
      <SidebarGroupLabel className="h-7 px-1 text-sidebar-foreground/70">
        {title}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton
                type="button"
                isActive={activePage === item.id}
                tooltip={t(item.titleKey)}
                className="h-8 px-2.5"
                onClick={() => onPageChange(item.id)}
              >
                <item.icon />
                <span>{t(item.titleKey)}</span>
                {item.id === "updates" && updateAvailable ? (
                  <Badge className="ml-auto h-5 rounded-sm px-1.5 text-[0.65rem]">
                    {t("common.new")}
                  </Badge>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
