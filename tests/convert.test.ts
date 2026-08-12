import { describe, expect, it } from "vitest";
import {
  trainingPeaksStructureToIntervals,
  trainingPeaksWorkoutToEvent,
} from "../src/convert.js";

describe("TrainingPeaks conversion", () => {
  it("converts a structured run with repeats and recovery", () => {
    const result = trainingPeaksStructureToIntervals(
      {
        structure: [
          {
            type: "step",
            steps: [
              {
                name: "Warm up",
                length: { value: 600, unit: "second" },
                targets: [{ minValue: 70, maxValue: 80 }],
                intensityClass: "warmUp",
              },
            ],
          },
          {
            type: "repetition",
            length: { value: 3, unit: "repetition" },
            steps: [
              {
                name: "Fast",
                length: { value: 120, unit: "second" },
                targets: [{ minValue: 98, maxValue: 105 }],
                intensityClass: "active",
              },
              {
                name: "Easy",
                length: { value: 60, unit: "second" },
                targets: [{ minValue: 70, maxValue: 80 }],
                intensityClass: "rest",
              },
            ],
          },
        ],
      },
      "Run",
    );

    expect(result).toContain("Warmup\n- 10m 70-80% pace Warm up");
    expect(result).toContain("Main 3x");
    expect(result).toContain("- 2m 98-105% pace Fast");
    expect(result).toContain("- 1m 70-80% pace intensity=rest Easy");
  });

  it("converts day off to a Rest Day note", () => {
    expect(
      trainingPeaksWorkoutToEvent({
        workoutId: 11,
        workoutDay: "2026-08-20T00:00:00",
        workoutTypeValueId: 7,
        title: "Day Off",
        description: "Coach ordered rest.",
      }),
    ).toEqual({
      start_date_local: "2026-08-20T00:00:00",
      name: "Rest Day",
      category: "NOTE",
      description: "Coach ordered rest.",
      external_id: "tp:11",
    });
  });

  it("converts content-only entries to notes with coach text", () => {
    const event = trainingPeaksWorkoutToEvent({
      workoutId: 12,
      workoutDay: "2026-08-21T00:00:00",
      workoutTypeValueId: 100,
      title: "Travel",
      coachComments: "No training.",
    });

    expect(event).toMatchObject({
      category: "NOTE",
      name: "Travel",
      description: "Coach:\nNo training.",
    });
    expect(event).not.toHaveProperty("type");
  });

  it("keeps planned load only for unstructured workouts", () => {
    const event = trainingPeaksWorkoutToEvent({
      workoutId: 13,
      workoutDay: "2026-08-22",
      workoutTypeValueId: 2,
      title: "Endurance",
      totalTimePlanned: 1.5,
      tssPlanned: 75.4,
      ifPlanned: 0.71,
    });

    expect(event).toMatchObject({
      category: "WORKOUT",
      type: "Ride",
      moving_time: 5400,
      icu_training_load: 75,
    });
    expect(event?.description).toContain("TrainingPeaks planned TSS: 75.4");
    expect(event?.description).toContain("TrainingPeaks planned IF: 0.71");
  });
});

