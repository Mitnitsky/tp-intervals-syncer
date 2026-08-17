import { describe, expect, it } from "vitest";
import { schedulePlannedWorkouts } from "../src/schedule.js";
import type { IntervalsEventPayload } from "../src/types.js";

function workout(
  date: string,
  externalId: string,
  type: string,
  movingTime: number,
): IntervalsEventPayload {
  return {
    start_date_local: `${date}T00:00:00`,
    name: externalId,
    category: "WORKOUT",
    type,
    moving_time: movingTime,
    description: "Workout",
    external_id: externalId,
  };
}

describe("planned workout scheduling", () => {
  it("starts Sunday, Monday, and Wednesday workouts at 05:00", () => {
    const result = schedulePlannedWorkouts([
      workout("2026-08-23", "sunday", "Run", 3600),
      workout("2026-08-24", "monday", "Ride", 3600),
      workout("2026-08-26", "wednesday", "Run", 3600),
    ]);

    expect(result.map((event) => event.start_date_local)).toEqual([
      "2026-08-23T05:00:00",
      "2026-08-24T05:00:00",
      "2026-08-26T05:00:00",
    ]);
  });

  it("starts Tuesday and Thursday swims at 06:15", () => {
    const result = schedulePlannedWorkouts([
      workout("2026-08-25", "tuesday", "Swim", 3600),
      workout("2026-08-27", "thursday", "Swim", 3600),
    ]);

    expect(result.map((event) => event.start_date_local)).toEqual([
      "2026-08-25T06:15:00",
      "2026-08-27T06:15:00",
    ]);
  });

  it("schedules Friday and Saturday workouts sequentially from 06:00", () => {
    const result = schedulePlannedWorkouts([
      workout("2026-08-21", "friday-bike", "Ride", 7200),
      workout("2026-08-21", "friday-run", "Run", 3600),
      workout("2026-08-22", "saturday-bike", "Ride", 5400),
      workout("2026-08-22", "saturday-run", "Run", 2700),
    ]);

    expect(result.map((event) => event.start_date_local)).toEqual([
      "2026-08-21T06:00:00",
      "2026-08-21T08:00:00",
      "2026-08-22T06:00:00",
      "2026-08-22T07:30:00",
    ]);
  });

  it("leaves notes and unspecified weekday workouts as all-day entries", () => {
    const note: IntervalsEventPayload = {
      start_date_local: "2026-08-21T00:00:00",
      name: "Travel",
      category: "NOTE",
      description: "Travel",
      external_id: "note",
    };
    const tuesdayRide = workout("2026-08-25", "ride", "Ride", 3600);

    expect(schedulePlannedWorkouts([note, tuesdayRide])).toEqual([note, tuesdayRide]);
  });
});
