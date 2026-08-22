import {
  Alert,
  Box,
  Button,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Skeleton,
  Stack,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import { SectionPanel } from "../../components/SectionPanel";

interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  all_day: boolean;
  location?: string | null;
  html_link?: string | null;
}

class CalendarQueryError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

function eventDay(event: CalendarEvent) {
  return dayjs(event.start).startOf("day");
}

function dayLabel(day: dayjs.Dayjs) {
  const today = dayjs().startOf("day");
  if (day.isSame(today, "day")) return "Today";
  if (day.isSame(today.add(1, "day"), "day")) return "Tomorrow";
  return day.format("dddd");
}

function timeLabel(event: CalendarEvent) {
  const start = dayjs(event.start);
  if (event.all_day) return `All day · ${start.format("ddd")}`;
  return start.format("ddd h:mm A");
}

function groupEvents(events: CalendarEvent[]) {
  return events.reduce<Array<{ key: string; label: string; events: CalendarEvent[] }>>(
    (groups, event) => {
      const day = eventDay(event);
      const key = day.format("YYYY-MM-DD");
      const existing = groups.find((group) => group.key === key);
      if (existing) {
        existing.events.push(event);
      } else {
        groups.push({ key, label: dayLabel(day), events: [event] });
      }
      return groups;
    },
    [],
  );
}

async function fetchUpcomingCalendarEvents(): Promise<CalendarEvent[]> {
  const { data, error, response } = await api.GET("/api/calendar/upcoming", {
    params: { query: { days: 7, limit: 10 } },
  });

  if (response.status === 401) {
    const code = (error as { code?: string } | undefined)?.code;
    const detail = (error as { detail?: string } | undefined)?.detail;
    throw new CalendarQueryError(detail ?? "Calendar reauthorization required.", code);
  }

  if (!response.ok || !Array.isArray(data)) {
    throw new CalendarQueryError("Failed to load upcoming calendar events.");
  }

  return data.slice(0, 10) as CalendarEvent[];
}

export function UpcomingCalendarCard() {
  const { data, error, isPending, refetch } = useQuery<CalendarEvent[], CalendarQueryError>({
    queryKey: ["calendar", "upcoming"],
    queryFn: fetchUpcomingCalendarEvents,
    staleTime: 5 * 60_000,
    retry: (failureCount, queryError) =>
      queryError.code === "reauth_required" ? false : failureCount < 2,
  });

  const events = data ?? [];
  const isReauthRequired = error?.code === "reauth_required";

  return (
    <SectionPanel
      title="Upcoming (Google Calendar)"
      count={isPending || error ? undefined : events.length}
      empty={!isPending && !error && events.length === 0}
      emptyTitle="No events in the next 7 days"
    >
      {isPending ? (
        <LoadingCalendarRows />
      ) : isReauthRequired ? (
        <Box sx={{ p: 2 }}>
          <Alert
            severity="info"
            variant="outlined"
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => {
                  window.location.href = "/auth/login";
                }}
              >
                Reconnect
              </Button>
            }
          >
            Reconnect Google Calendar to see upcoming events
          </Alert>
        </Box>
      ) : error ? (
        <Box sx={{ p: 2 }}>
          <Alert
            severity="error"
            action={
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            }
          >
            Failed to load upcoming calendar events.
          </Alert>
        </Box>
      ) : (
        <List dense disablePadding>
          {groupEvents(events).map((group) => (
            <Box key={group.key}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: "block",
                  px: 2,
                  pt: 1.5,
                  pb: 0.5,
                  fontWeight: 700,
                  textTransform: "uppercase",
                }}
              >
                {group.label}
              </Typography>
              {group.events.map((event) => (
                <CalendarEventRow key={event.id} event={event} />
              ))}
            </Box>
          ))}
        </List>
      )}
    </SectionPanel>
  );
}

function CalendarEventRow({ event }: { event: CalendarEvent }) {
  const row = (
    <>
      <Box sx={{ width: 92, flexShrink: 0 }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {timeLabel(event)}
        </Typography>
      </Box>
      <ListItemText
        primary={event.summary || "(No title)"}
        secondary={event.location || undefined}
        primaryTypographyProps={{ fontWeight: 600 }}
      />
    </>
  );

  return (
    <ListItem divider disablePadding>
      {event.html_link ? (
        <ListItemButton
          component="a"
          href={event.html_link}
          target="_blank"
          rel="noreferrer"
          sx={{ alignItems: "flex-start", gap: 2, py: 1.25 }}
        >
          {row}
        </ListItemButton>
      ) : (
        <Stack direction="row" spacing={2} sx={{ width: "100%", px: 2, py: 1.25 }}>
          {row}
        </Stack>
      )}
    </ListItem>
  );
}

function LoadingCalendarRows() {
  return (
    <List dense disablePadding>
      {Array.from({ length: 3 }).map((_, index) => (
        <ListItem key={index} divider>
          <Box sx={{ width: 92, flexShrink: 0 }}>
            <Skeleton width={64} />
          </Box>
          <ListItemText
            primary={<Skeleton width="55%" />}
            secondary={<Skeleton width="40%" />}
          />
        </ListItem>
      ))}
    </List>
  );
}
