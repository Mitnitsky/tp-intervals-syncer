import { trainingPeaksWorkoutToEvent } from "./convert.js";
import type { IntervalsApi } from "./intervals.js";
import type {
  IntervalsEvent,
  IntervalsEventPayload,
  ChangeDetail,
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

function changedFields(event: IntervalsEvent, payload: IntervalsEventPayload): string[] {
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
  return Object.entries(payload)
    .filter(([key, value]) => eventValues[key] !== value)
    .map(([key]) => key);
}

function durationValue(value: unknown): string {
  if (typeof value !== "number") {
    return "not set";
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  return [
    hours > 0 ? `${hours}h` : "",
    minutes > 0 ? `${minutes}m` : "",
    seconds > 0 ? `${seconds}s` : "",
  ]
    .filter(Boolean)
    .join(" ") || "0s";
}

function fieldValue(field: string, value: unknown, compact: boolean): string {
  if (value == null || value === "") {
    return "not set";
  }
  if (field === "start_date_local" && typeof value === "string") {
    return value.slice(0, 10);
  }
  if (field === "description" && typeof value === "string") {
    return compact ? `${value.length} characters` : value || "empty";
  }
  if (field === "moving_time") {
    return durationValue(value);
  }
  if (field === "distance" && typeof value === "number") {
    return `${Number.parseFloat((value / 1_000).toFixed(3))} km`;
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "changed";
}

function changeDetails(
  event: IntervalsEvent,
  payload: IntervalsEventPayload,
  fields: string[],
): ChangeDetail[] {
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
  const payloadValues = payload as unknown as Record<string, unknown>;
  return fields.map((field) => ({
    field,
    before: fieldValue(field, eventValues[field], false),
    after: fieldValue(field, payloadValues[field], false),
    summary: `${fieldValue(field, eventValues[field], true)} → ${fieldValue(
      field,
      payloadValues[field],
      true,
    )}`,
  }));
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
    const differences = existing ? changedFields(existing, payload) : [];
    if (existing && differences.length === 0) {
      unchanged.push({ ...item, eventId: existing.id });
    } else if (existing) {
      const saved = options.dryRun
        ? existing
        : await intervals.updateEvent(existing.id, payload);
      updated.push({
        ...item,
        eventId: saved.id,
        ...(adopted ? { adoptedExistingEvent: true } : {}),
        changedFields: differences,
        changeDetails: changeDetails(existing, payload, differences),
      });
    } else {
      const saved = options.dryRun ? undefined : await intervals.createEvent(payload);
      created.push({ ...item, ...(saved ? { eventId: saved.id } : {}) });
    }
  }

  const staleEvents = [...existingByExternalId.values()].filter(
    (event) => !seenExternalIds.has(event.external_id!),
  );
  const deleted = staleEvents
    .map((event) => ({
      eventId: event.id,
      externalId: event.external_id!,
      date: event.start_date_local.slice(0, 10),
      ...(event.name !== undefined ? { name: event.name } : {}),
    }));
  if (!options.dryRun) {
    for (const event of staleEvents) {
      await intervals.deleteEvent(event.id);
    }
  }

  return {
    dateRange: { oldest: options.oldest, newest: options.newest },
    sourceCount: sourceWorkouts.length,
    eligibleCount: payloads.length,
    created,
    updated,
    unchanged,
    skipped,
    deleted,
    dryRun: options.dryRun,
    sourceOfTruth: "TrainingPeaks",
  };
}
