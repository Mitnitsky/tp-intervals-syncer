import type { IntervalsEventPayload } from "./types.js";

const weekdayStartTimes = new Map<number, string>([
  [0, "05:00:00"],
  [1, "05:00:00"],
  [3, "05:00:00"],
]);

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

function timeText(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

export function schedulePlannedWorkouts(
  payloads: IntervalsEventPayload[],
): IntervalsEventPayload[] {
  const weekendCursors = new Map<string, number>();

  return payloads.map((payload) => {
    if (payload.category !== "WORKOUT") {
      return payload;
    }

    const date = payload.start_date_local.slice(0, 10);
    const day = weekday(date);
    let startTime = weekdayStartTimes.get(day);

    if ((day === 2 || day === 4) && payload.type === "Swim") {
      startTime = "06:15:00";
    } else if (day === 5 || day === 6) {
      const startSeconds = weekendCursors.get(date) ?? 6 * 3600;
      startTime = timeText(startSeconds);
      weekendCursors.set(date, startSeconds + (payload.moving_time ?? 0));
    }

    return startTime
      ? { ...payload, start_date_local: `${date}T${startTime}` }
      : payload;
  });
}
