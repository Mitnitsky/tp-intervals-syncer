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

  it("labels threshold-HR run targets as LTHR instead of pace", () => {
    const result = trainingPeaksStructureToIntervals(
      {
        primaryIntensityMetric: "percentOfThresholdHr",
        structure: [
          {
            type: "step",
            steps: [
              {
                name: "Warm up",
                length: { value: 720, unit: "second" },
                targets: [{ minValue: 71, maxValue: 77 }],
                intensityClass: "warmUp",
              },
            ],
          },
          {
            type: "repetition",
            length: { value: 6, unit: "repetition" },
            steps: [
              {
                name: "Surge",
                length: { value: 20, unit: "second" },
                targets: [{ minValue: 98, maxValue: 105 }],
                intensityClass: "active",
              },
            ],
          },
        ],
      },
      "Run",
    );

    expect(result).toContain("- 12m 71-77% LTHR Warm up");
    expect(result).toContain("- 20s 98-105% LTHR Surge");
    expect(result).not.toContain("pace");
  });

  it("labels max-HR targets as HR", () => {
    const result = trainingPeaksStructureToIntervals(
      {
        primaryIntensityMetric: "percentOfMaxHr",
        structure: [
          {
            type: "step",
            steps: [
              {
                name: "Easy",
                length: { value: 600, unit: "second" },
                targets: [{ minValue: 65, maxValue: 70 }],
                intensityClass: "warmUp",
              },
            ],
          },
        ],
      },
      "Run",
    );

    expect(result).toContain("- 10m 65-70% HR Easy");
  });

  it("keeps FTP power targets as bare percentages", () => {
    const result = trainingPeaksStructureToIntervals(
      {
        primaryIntensityMetric: "percentOfFtp",
        structure: [
          {
            type: "step",
            steps: [
              {
                name: "Tempo",
                length: { value: 600, unit: "second" },
                targets: [{ minValue: 88, maxValue: 94 }],
                intensityClass: "active",
              },
            ],
          },
        ],
      },
      "Ride",
    );

    expect(result).toContain("- 10m 88-94% Tempo");
    expect(result).not.toContain("pace");
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

  it("formats calculated metrics consistently without floating-point noise", () => {
    const event = trainingPeaksWorkoutToEvent({
      workoutId: 14,
      workoutDay: "2026-08-23",
      workoutTypeValueId: 3,
      title: "Brick",
      totalTimePlanned: 0.25,
      tssPlanned: 6.884998476190471,
      ifPlanned: 0.6774483251052404,
    });

    expect(event?.description).toContain("TrainingPeaks planned TSS: 6.885");
    expect(event?.description).toContain("TrainingPeaks planned IF: 0.677448");
    expect(event?.description).not.toContain("0.6774483251052404");
  });
});
