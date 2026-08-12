import type {
  IntervalsEventPayload,
  TrainingPeaksBlock,
  TrainingPeaksLength,
  TrainingPeaksStep,
  TrainingPeaksStructure,
  TrainingPeaksWorkout,
} from "./types.js";

const sportTypes = new Map<number, string>([
  [1, "Swim"],
  [2, "Ride"],
  [3, "Run"],
]);

const trainingPeaksDayOffType = 7;

function metricText(value: number): string {
  return Number.parseFloat(value.toPrecision(6)).toString();
}

function durationText(length: TrainingPeaksLength | null | undefined): string {
  const value = Number(length?.value ?? 0);
  if (length?.unit === "second") {
    const seconds = Math.round(value);
    return seconds > 0 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
  }
  if (length?.unit === "meter") {
    return `${Math.round(value)}mtr`;
  }
  if (length?.unit === "kilometer") {
    return `${value}km`;
  }
  return `${Math.round(value)}s`;
}

function targetText(step: TrainingPeaksStep, sport: string): string {
  const target = step.targets?.[0];
  if (!target) {
    return "free";
  }
  const minimum = Math.round(Number(target.minValue ?? 0));
  const maximum = Math.round(Number(target.maxValue ?? minimum));
  const percentage = minimum === maximum ? `${minimum}%` : `${minimum}-${maximum}%`;
  return sport === "Run" || sport === "Swim" ? `${percentage} pace` : percentage;
}

function stepLine(step: TrainingPeaksStep, sport: string): string {
  const parts = [`- ${durationText(step.length)}`, targetText(step, sport)];
  if (step.intensityClass === "rest") {
    parts.push("intensity=rest");
  }
  const name = step.name?.trim();
  if (name) {
    parts.push(name);
  }
  return parts.join(" ");
}

function normalizedBlocks(structure: TrainingPeaksStructure | null | undefined): TrainingPeaksBlock[] {
  const blocks = structure?.structure;
  if (!blocks) {
    return [];
  }
  return (Array.isArray(blocks) ? blocks : [blocks]).filter(
    (block): block is TrainingPeaksBlock => Boolean(block),
  );
}

export function trainingPeaksStructureToIntervals(
  structure: TrainingPeaksStructure | null | undefined,
  sport: string,
): string {
  const sections: string[] = [];
  let currentHeader: string | undefined;

  const addHeader = (header: string): void => {
    if (currentHeader === header) {
      return;
    }
    if (sections.length > 0 && sections.at(-1) !== "") {
      sections.push("");
    }
    sections.push(header);
    currentHeader = header;
  };

  for (const block of normalizedBlocks(structure)) {
    const steps = block.steps ?? [];
    if (steps.length === 0) {
      continue;
    }
    if (block.type === "repetition") {
      if (sections.length > 0 && sections.at(-1) !== "") {
        sections.push("");
      }
      const repetitions = Math.max(1, Math.round(Number(block.length?.value ?? 1)));
      sections.push(`Main ${repetitions}x`, ...steps.map((step) => stepLine(step, sport)), "");
      currentHeader = undefined;
      continue;
    }

    const intensity = steps[0]?.intensityClass;
    const header =
      intensity === "warmUp" ? "Warmup" : intensity === "coolDown" ? "Cooldown" : "Main";
    addHeader(header);

    if ((block.type === "rampUp" || block.type === "rampDown") && steps.length > 1) {
      const totalSeconds = steps.reduce((sum, step) => sum + Number(step.length?.value ?? 0), 0);
      const firstTarget = targetText(steps[0]!, sport).replace("% pace", "");
      const lastTarget = targetText(steps.at(-1)!, sport).replace("% pace", "");
      const suffix = sport === "Run" || sport === "Swim" ? " pace" : "";
      sections.push(
        `- ${durationText({ value: totalSeconds, unit: "second" })} ramp ${firstTarget.replace("%", "")}-${lastTarget}${suffix}`,
      );
    } else {
      sections.push(...steps.map((step) => stepLine(step, sport)));
    }
  }

  return sections.join("\n").trim();
}

export function trainingPeaksWorkoutToEvent(
  workout: TrainingPeaksWorkout,
): IntervalsEventPayload | undefined {
  const workoutId = workout.workoutId;
  const workoutDay = workout.workoutDay?.slice(0, 10);
  if (!workoutId || !workoutDay) {
    return undefined;
  }

  const sport = workout.workoutTypeValueId
    ? sportTypes.get(workout.workoutTypeValueId)
    : undefined;
  const sourceText = [
    workout.description?.trim(),
    workout.coachComments?.trim() ? `Coach:\n${workout.coachComments.trim()}` : undefined,
  ]
    .filter((text): text is string => Boolean(text))
    .join("\n\n");
  const externalId = `tp:${workoutId}`;
  const hasWorkoutContent = Boolean(
    workout.totalTimePlanned ||
      workout.distancePlanned ||
      workout.structure ||
      workout.tssPlanned,
  );

  if (workout.workoutTypeValueId === trainingPeaksDayOffType) {
    return {
      start_date_local: `${workoutDay}T00:00:00`,
      name: "Rest Day",
      category: "NOTE",
      description: sourceText || "Rest Day",
      external_id: externalId,
    };
  }

  if (!sport || !hasWorkoutContent) {
    const title = workout.title?.trim() || "TrainingPeaks Note";
    return {
      start_date_local: `${workoutDay}T00:00:00`,
      name: title,
      category: "NOTE",
      description: sourceText || title,
      external_id: externalId,
    };
  }

  const workoutText = trainingPeaksStructureToIntervals(workout.structure, sport);
  const metrics = [
    workout.tssPlanned == null
      ? undefined
      : `TrainingPeaks planned TSS: ${metricText(workout.tssPlanned)}`,
    workout.ifPlanned == null
      ? undefined
      : `TrainingPeaks planned IF: ${metricText(workout.ifPlanned)}`,
  ].filter((text): text is string => Boolean(text));
  const description =
    [sourceText, workoutText, metrics.join("\n")]
      .filter((text) => Boolean(text))
      .join("\n\n") || "Imported from TrainingPeaks.";

  const payload: IntervalsEventPayload = {
    start_date_local: `${workoutDay}T00:00:00`,
    name: workout.title?.trim() || "TrainingPeaks workout",
    category: "WORKOUT",
    type: sport,
    description,
    external_id: externalId,
  };
  if (workout.totalTimePlanned != null) {
    payload.moving_time = Math.trunc(Number(workout.totalTimePlanned) * 3600);
  }
  if (workout.distancePlanned != null) {
    payload.distance = Number(workout.distancePlanned);
  }
  if (workout.tssPlanned != null && !workoutText) {
    payload.icu_training_load = Math.round(Number(workout.tssPlanned));
  }
  return payload;
}
