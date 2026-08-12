import { trainingPeaksWorkoutToEvent } from "./convert.js";
import type { IntervalsApi } from "./intervals.js";
import type {
  IntervalsEvent,
  IntervalsEventPayload,
  SyncItem,
  SyncResult,
  TrainingPeaksWorkout,
} from "./types.js";

function naturalEventKey(event: IntervalsEvent): string {
  return [
    event.start_date_local.slice(0, 10),
    event.name ?? "",
    event.category ?? "",
    event.type ?? "",
  ].join("\u0000");
}

function naturalPayloadKey(payload: IntervalsEventPayload): string {
  return [
    payload.start_date_local.slice(0, 10),
    payload.name,
    payload.category,
    payload.type ?? "",
  ].join("\u0000");
}

function eventMatchesPayload(event: IntervalsEvent, payload: IntervalsEventPayload): boolean {
  const eventValues: Record<string, unknown> = {
    start_date_local: event.start_date_local,
    name: event.name,
    category: event.category,
    type: event.type,
    description: event.description,
    moving_time: event.moving_time,
    distance: event.distance,
    icu_training_load: event.icu_training_load,
    external_id: event.external_id,
  };
  return Object.entries(payload).every(([key, value]) => eventValues[key] === value);
}

function itemFromPayload(payload: IntervalsEventPayload): SyncItem {
  return {
    externalId: payload.external_id,
    date: payload.start_date_local.slice(0, 10),
    name: payload.name,
    category: payload.category,
    ...(payload.type ? { type: payload.type } : {}),
  };
}

export interface SyncOptions {
  oldest: string;
  newest: string;
  skipDates: ReadonlySet<string>;
  dryRun: boolean;
}

export async function syncWorkouts(
  sourceWorkouts: TrainingPeaksWorkout[],
  intervals: IntervalsApi,
  options: SyncOptions,
): Promise<SyncResult> {
  const payloads: IntervalsEventPayload[] = [];
  const skipped: SyncResult["skipped"] = [];
  const seenExternalIds = new Set<string>();

  for (const workout of sourceWorkouts) {
    const workoutDay = workout.workoutDay?.slice(0, 10) ?? "";
    if (workoutDay < options.oldest || workoutDay > options.newest) {
      continue;
    }
    if (options.skipDates.has(workoutDay)) {
      skipped.push({
        ...(workout.workoutId !== undefined ? { workoutId: workout.workoutId } : {}),
        date: workoutDay,
        reason: "excluded_date",
      });
      continue;
    }
    const payload = trainingPeaksWorkoutToEvent(workout);
    if (!payload) {
      skipped.push({
        ...(workout.workoutId !== undefined ? { workoutId: workout.workoutId } : {}),
        ...(workoutDay ? { date: workoutDay } : {}),
        reason: "unsupported_or_incomplete",
      });
      continue;
    }
    if (seenExternalIds.has(payload.external_id)) {
      throw new Error(`TrainingPeaks returned duplicate workout ID ${payload.external_id}.`);
    }
    seenExternalIds.add(payload.external_id);
    payloads.push(payload);
  }

  const existingEvents = await intervals.getEvents(options.oldest, options.newest);
  const existingByExternalId = new Map(
    existingEvents
      .filter((event) => event.external_id?.startsWith("tp:"))
      .map((event) => [event.external_id!, event]),
  );
  const untaggedByKey = new Map<string, IntervalsEvent[]>();
  for (const event of existingEvents) {
    if (event.external_id) {
      continue;
    }
    const key = naturalEventKey(event);
    untaggedByKey.set(key, [...(untaggedByKey.get(key) ?? []), event]);
  }

  const created: SyncItem[] = [];
  const updated: SyncItem[] = [];
  const unchanged: SyncItem[] = [];

  for (const payload of payloads) {
    let existing = existingByExternalId.get(payload.external_id);
    let adopted = false;
    if (!existing) {
      const candidates = untaggedByKey.get(naturalPayloadKey(payload)) ?? [];
      if (candidates.length === 1) {
        existing = candidates.pop();
        adopted = true;
      }
    }

    const item = itemFromPayload(payload);
    if (existing && eventMatchesPayload(existing, payload)) {
      unchanged.push({ ...item, eventId: existing.id });
    } else if (existing) {
      const saved = options.dryRun
        ? existing
        : await intervals.updateEvent(existing.id, payload);
      updated.push({
        ...item,
        eventId: saved.id,
        ...(adopted ? { adoptedExistingEvent: true } : {}),
      });
    } else {
      const saved = options.dryRun ? undefined : await intervals.createEvent(payload);
      created.push({ ...item, ...(saved ? { eventId: saved.id } : {}) });
    }
  }

  const staleNotDeleted = [...existingByExternalId.values()]
    .filter((event) => !seenExternalIds.has(event.external_id!))
    .map((event) => ({
      eventId: event.id,
      externalId: event.external_id!,
      date: event.start_date_local.slice(0, 10),
      ...(event.name !== undefined ? { name: event.name } : {}),
    }));

  return {
    dateRange: { oldest: options.oldest, newest: options.newest },
    sourceCount: sourceWorkouts.length,
    eligibleCount: payloads.length,
    created,
    updated,
    unchanged,
    skipped,
    staleNotDeleted,
    dryRun: options.dryRun,
    sourceOfTruth: "TrainingPeaks",
  };
}
