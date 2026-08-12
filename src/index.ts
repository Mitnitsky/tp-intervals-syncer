import { loadConfig } from "./config.js";
import { trainingPeaksWorkoutToEvent } from "./convert.js";
import { addDays, currentDateInTimeZone } from "./dates.js";
import { IntervalsClient } from "./intervals.js";
import { syncWorkouts } from "./sync.js";
import { loadTrainingPeaksExport, TrainingPeaksClient } from "./trainingpeaks.js";

interface Arguments {
  dryRun: boolean;
  exportPath?: string;
  validateExportPath?: string;
}

function parseArguments(argv: string[]): Arguments {
  const args: Arguments = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      args.dryRun = true;
    } else if (argument === "--export-json" || argument === "--validate-export") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`${argument} requires a file path.`);
      }
      if (argument === "--export-json") {
        args.exportPath = value;
      } else {
        args.validateExportPath = value;
      }
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return args;
}

async function validateExport(path: string): Promise<void> {
  const workouts = await loadTrainingPeaksExport(path);
  const converted = workouts.map(trainingPeaksWorkoutToEvent);
  const invalid = converted.filter((event) => !event).length;
  const events = converted.filter((event) => Boolean(event));
  const summary = {
    sourceCount: workouts.length,
    convertedCount: events.length,
    invalidCount: invalid,
    workoutCount: events.filter((event) => event?.category === "WORKOUT").length,
    noteCount: events.filter((event) => event?.category === "NOTE").length,
    structuredCount: workouts.filter((workout) => workout.structure).length,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (invalid > 0) {
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.validateExportPath) {
    await validateExport(args.validateExportPath);
    return;
  }

  const config = loadConfig();
  const today = currentDateInTimeZone(new Date(), config.sync.timeZone);
  const oldest = config.sync.includeToday ? today : addDays(today, 1);
  const newest = addDays(today, config.sync.daysAhead);
  const sourceWorkouts = args.exportPath
    ? await loadTrainingPeaksExport(args.exportPath)
    : await new TrainingPeaksClient(
        config.trainingPeaks.username,
        config.trainingPeaks.password,
      ).getPlannedWorkouts(oldest, newest);
  const intervals = new IntervalsClient(config.intervals.apiKey, config.intervals.athleteId);
  const result = await syncWorkouts(sourceWorkouts, intervals, {
    oldest,
    newest,
    skipDates: new Set(config.sync.skipDates),
    dryRun: args.dryRun,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Sync failed: ${message}`);
  process.exitCode = 1;
});

