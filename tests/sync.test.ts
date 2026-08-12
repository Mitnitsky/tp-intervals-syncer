import { describe, expect, it, vi } from "vitest";
import type { IntervalsApi } from "../src/intervals.js";
import { syncWorkouts } from "../src/sync.js";
import type { IntervalsEvent, IntervalsEventPayload } from "../src/types.js";

class FakeIntervals implements IntervalsApi {
  readonly createEvent = vi.fn(async (payload: IntervalsEventPayload) => ({
    id: 2001,
    ...payload,
  }));

  readonly updateEvent = vi.fn(
    async (eventId: number, payload: IntervalsEventPayload) => ({
      id: eventId,
      ...payload,
    }),
  );

  readonly deleteEvent = vi.fn(async () => undefined);

  constructor(private readonly events: IntervalsEvent[]) {}

  async getEvents(): Promise<IntervalsEvent[]> {
    return this.events;
  }
}

const options = {
  oldest: "2026-08-13",
  newest: "2026-08-30",
  skipDates: new Set<string>(),
  dryRun: false,
};

describe("authoritative sync", () => {
  it("adopts a unique manual import and overwrites it from TrainingPeaks", async () => {
    const intervals = new FakeIntervals([
      {
        id: 1001,
        start_date_local: "2026-08-14T00:00:00",
        name: "Easy Run",
        category: "WORKOUT",
        type: "Run",
        description: "Manual import",
      },
    ]);

    const result = await syncWorkouts(
      [
        {
          workoutId: 99,
          workoutDay: "2026-08-14T00:00:00",
          workoutTypeValueId: 3,
          title: "Easy Run",
          totalTimePlanned: 0.5,
          tssPlanned: 20,
        },
      ],
      intervals,
      options,
    );

    expect(result.created).toHaveLength(0);
    expect(result.updated).toEqual([
      expect.objectContaining({
        eventId: 1001,
        externalId: "tp:99",
        adoptedExistingEvent: true,
        changedFields: expect.arrayContaining([
          "description",
          "moving_time",
          "icu_training_load",
          "external_id",
        ]),
        changeDetails: expect.arrayContaining([
          {
            field: "description",
            before: "Manual import",
            after: "TrainingPeaks planned TSS: 20",
            summary: "13 characters → 29 characters",
          },
          {
            field: "moving_time",
            before: "not set",
            after: "30m",
            summary: "not set → 30m",
          },
        ]),
      }),
    ]);
    expect(intervals.updateEvent).toHaveBeenCalledWith(
      1001,
      expect.objectContaining({
        external_id: "tp:99",
        description: expect.stringContaining("TrainingPeaks planned TSS: 20"),
      }),
    );
  });

  it("is unchanged when all managed fields match", async () => {
    const existing: IntervalsEvent = {
      id: 1002,
      start_date_local: "2026-08-15T00:00:00",
      name: "Rest Day",
      category: "NOTE",
      description: "Rest Day",
      external_id: "tp:100",
    };
    const intervals = new FakeIntervals([existing]);

    const result = await syncWorkouts(
      [
        {
          workoutId: 100,
          workoutDay: "2026-08-15",
          workoutTypeValueId: 7,
          title: "Day Off",
        },
      ],
      intervals,
      options,
    );

    expect(result.unchanged).toHaveLength(1);
    expect(intervals.updateEvent).not.toHaveBeenCalled();
    expect(intervals.createEvent).not.toHaveBeenCalled();
  });

  it("deletes managed events removed from TrainingPeaks", async () => {
    const intervals = new FakeIntervals([
      {
        id: 1003,
        start_date_local: "2026-08-16T00:00:00",
        name: "Old workout",
        category: "WORKOUT",
        type: "Ride",
        external_id: "tp:101",
      },
    ]);

    const result = await syncWorkouts([], intervals, options);

    expect(result.deleted).toEqual([
      {
        eventId: 1003,
        externalId: "tp:101",
        date: "2026-08-16",
        name: "Old workout",
      },
    ]);
    expect(intervals.deleteEvent).toHaveBeenCalledWith(1003);
  });

  it("preserves unrelated Intervals events", async () => {
    const intervals = new FakeIntervals([
      {
        id: 1004,
        start_date_local: "2026-08-16T00:00:00",
        name: "Manual workout",
        category: "WORKOUT",
        type: "Run",
      },
    ]);

    const result = await syncWorkouts([], intervals, options);

    expect(result.deleted).toHaveLength(0);
    expect(intervals.deleteEvent).not.toHaveBeenCalled();
  });

  it("does not make writes in dry-run mode", async () => {
    const intervals = new FakeIntervals([]);
    const result = await syncWorkouts(
      [
        {
          workoutId: 102,
          workoutDay: "2026-08-17",
          workoutTypeValueId: 1,
          title: "Swim",
          totalTimePlanned: 1,
        },
      ],
      intervals,
      { ...options, dryRun: true },
    );

    expect(result.created).toHaveLength(1);
    expect(intervals.createEvent).not.toHaveBeenCalled();
    expect(intervals.deleteEvent).not.toHaveBeenCalled();
  });
});
