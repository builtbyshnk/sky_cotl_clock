import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import type { DayButton } from "react-day-picker";
import {
  Calendar,
  CalendarDayButton,
} from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type SkyCalendarEntry,
  type SkyCalendarEntryKind,
} from "@/data/skygame";
import { cn } from "@/lib/utils";
import { getSkyCalendarEntries } from "@/tauri/skygame";

const kindLabels: Record<SkyCalendarEntryKind, string> = {
  season: "Season",
  event: "Event",
  "traveling-spirit": "Spirit",
};

const kindDotClass: Record<SkyCalendarEntryKind, string> = {
  season: "bg-calendar-poppy",
  event: "bg-calendar-teal",
  "traveling-spirit": "bg-calendar-violet",
};

const kindLegendClass: Record<SkyCalendarEntryKind, string> = {
  season: "border-calendar-poppy/45 bg-calendar-poppy/14",
  event: "border-calendar-teal/45 bg-calendar-teal/14",
  "traveling-spirit": "border-calendar-violet/45 bg-calendar-violet/14",
};

const SidebarCalendarContext = React.createContext<{
  entriesByDate: Map<string, SkyCalendarEntry[]>;
}>({ entriesByDate: new Map() });

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

function buildEntriesByDate(
  entries: SkyCalendarEntry[],
  startIso: string,
  endIso: string,
) {
  const grouped = new Map<string, SkyCalendarEntry[]>();

  for (const entry of entries) {
    const rangeStart = entry.date > startIso ? entry.date : startIso;
    const rangeEnd = entry.endDate < endIso ? entry.endDate : endIso;

    for (let date = rangeStart; date <= rangeEnd; date = addDaysIso(date, 1)) {
      const existing = grouped.get(date) ?? [];
      if (!existing.some((item) => item.guid === entry.guid)) {
        grouped.set(date, [...existing, entry]);
      }
    }
  }

  return grouped;
}

function uniqueKinds(entries: SkyCalendarEntry[]) {
  const seen = new Set<SkyCalendarEntryKind>();
  return entries.filter((entry) => {
    if (seen.has(entry.kind)) {
      return false;
    }
    seen.add(entry.kind);
    return true;
  });
}

function SidebarCalendarDayButton({
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const { entriesByDate } = React.useContext(SidebarCalendarContext);
  const iso = toDateIso(day.date);
  const dayEntries = entriesByDate.get(iso) ?? [];
  const dotEntries = uniqueKinds(dayEntries);
  const hasSeasonSpan = Boolean(modifiers.seasonSpan);
  const hasSeasonEndpoint =
    Boolean(modifiers.seasonSpanStart) || Boolean(modifiers.seasonSpanEnd);
  const hasSeasonTint =
    (hasSeasonSpan || Boolean(modifiers.otherSeason)) &&
    !modifiers.selected &&
    !modifiers.today;

  const button = (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      className={cn(
        "overflow-hidden rounded-xl pt-1 pb-3 text-[0.72rem] leading-none transition-colors",
        "data-[selected-single=true]:rounded-xl data-[selected-single=true]:shadow-sm",
        hasSeasonEndpoint && "ring-1 ring-calendar-poppy/35",
      )}
      {...props}
    >
      {hasSeasonTint ? (
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute inset-0 bg-calendar-poppy/12",
            hasSeasonSpan && "bg-calendar-poppy/18",
            hasSeasonEndpoint ? "rounded-xl bg-calendar-poppy/26" : "rounded-lg",
          )}
        />
      ) : null}
      <span className="relative">{day.date.getDate()}</span>
      {dotEntries.length > 0 ? (
        <span className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
          {dotEntries.map((entry) => (
            <span
              key={entry.guid}
              className={cn(
                "size-1 rounded-full ring-1 ring-sidebar/80",
                kindDotClass[entry.kind],
              )}
            />
          ))}
        </span>
      ) : null}
    </CalendarDayButton>
  );

  if (dayEntries.length === 0) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-52">
        <div className="flex flex-col gap-1">
          {dayEntries.slice(0, 4).map((entry) => (
            <span key={entry.guid} className="truncate">
              {entry.shortName ?? entry.name}
            </span>
          ))}
          {dayEntries.length > 4 ? (
            <span className="text-background/70">
              +{dayEntries.length - 4} more
            </span>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function CalendarLegend() {
  return (
    <div className="flex w-full flex-wrap justify-center gap-1.5 px-3 pb-3">
      {(Object.keys(kindLabels) as SkyCalendarEntryKind[]).map((kind) => (
        <Badge
          key={kind}
          variant="outline"
          className={cn(
            "h-5 gap-1.5 rounded-full px-2 text-[0.62rem] font-semibold text-sidebar-foreground shadow-sm",
            kindLegendClass[kind],
          )}
        >
          <span className={cn("size-1.5 rounded-full", kindDotClass[kind])} />
          {kindLabels[kind]}
        </Badge>
      ))}
    </div>
  );
}

export function SidebarCalendar({
  selectedDate,
  onSelectedDateChange,
}: {
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  onOpenCalendar?: () => void;
}) {
  const [visibleMonth, setVisibleMonth] = useState(selectedDate);
  const [entries, setEntries] = useState<SkyCalendarEntry[]>([]);

  useEffect(() => {
    setVisibleMonth(selectedDate);
  }, [selectedDate]);

  const monthStart = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  );
  const gridStartIso = toDateIso(
    new Date(monthStart.getFullYear(), monthStart.getMonth(), 1 - monthStart.getDay()),
  );
  const gridEndIso = addDaysIso(gridStartIso, 41);

  useEffect(() => {
    let cancelled = false;

    void getSkyCalendarEntries({
      startDate: gridStartIso,
      endDate: gridEndIso,
      kinds: ["season", "event", "traveling-spirit"],
    }).then((nextEntries) => {
      if (!cancelled) {
        setEntries(nextEntries);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [gridEndIso, gridStartIso]);

  const seasonEntries = useMemo(
    () => entries.filter((entry) => entry.kind === "season"),
    [entries],
  );

  const entriesByDate = useMemo(
    () => buildEntriesByDate(entries, gridStartIso, gridEndIso),
    [entries, gridEndIso, gridStartIso],
  );

  const selectedIso = toDateIso(selectedDate);
  const focusedSeason = seasonEntries.find(
    (entry) => entry.date <= selectedIso && entry.endDate >= selectedIso,
  );

  const modifiers = useMemo(
    () => ({
      seasonSpan: (date: Date) => {
        if (!focusedSeason) {
          return false;
        }
        const iso = toDateIso(date);
        return iso >= focusedSeason.date && iso <= focusedSeason.endDate;
      },
      seasonSpanStart: (date: Date) =>
        focusedSeason ? toDateIso(date) === focusedSeason.date : false,
      seasonSpanEnd: (date: Date) =>
        focusedSeason ? toDateIso(date) === focusedSeason.endDate : false,
      otherSeason: (date: Date) => {
        const iso = toDateIso(date);
        return seasonEntries.some(
          (entry) =>
            entry.guid !== focusedSeason?.guid &&
            entry.date <= iso &&
            entry.endDate >= iso,
        );
      },
    }),
    [focusedSeason, seasonEntries],
  );

  return (
    <SidebarCalendarContext.Provider value={{ entriesByDate }}>
      <div className="flex flex-col items-center gap-2">
        <Calendar
          mode="single"
          selected={selectedDate}
          month={visibleMonth}
          onMonthChange={setVisibleMonth}
          onSelect={(date) => date && onSelectedDateChange(date)}
          captionLayout="label"
          modifiers={modifiers}
          components={{
            DayButton: SidebarCalendarDayButton,
          }}
          className="bg-transparent p-2 [--cell-radius:0.75rem] [--cell-size:1.96rem] [&_.rdp-day]:p-0.5 [&_.rdp-month]:gap-2 [&_.rdp-week]:mt-0.5 [&_.rdp-weekday]:text-[0.65rem] [&_.rdp-weekday]:font-medium"
        />
        <CalendarLegend />
      </div>
    </SidebarCalendarContext.Provider>
  );
}
