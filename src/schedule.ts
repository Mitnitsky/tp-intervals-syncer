import type { IntervalsEventPayload } from "./types.js";

const sequentialStartSeconds = new Map<number, number>([
  [0, 5 * 3600],
  [1, 5 * 3600],
  [3, 5 * 3600],
  [5, 6 * 3600],
  [6, 6 * 3600],
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
  const dailyCursors = new Map<string, number>();

  return payloads.map((payload) => {
    if (payload.category !== "WORKOUT") {
      return payload;
    }

    const date = payload.start_date_local.slice(0, 10);
    const day = weekday(date);
    let startTime: string | undefined;
    const firstStartSeconds = sequentialStartSeconds.get(day);

    if (firstStartSeconds !== undefined) {
      const startSeconds = dailyCursors.get(date) ?? firstStartSeconds;
      startTime = timeText(startSeconds);
      dailyCursors.set(date, startSeconds + (payload.moving_time ?? 0));
    } else if ((day === 2 || day === 4) && payload.type === "Swim") {
      startTime = "06:15:00";
    }

    return startTime
      ? { ...payload, start_date_local: `${date}T${startTime}` }
      : payload;
  });
}
