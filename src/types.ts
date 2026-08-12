export interface TrainingPeaksTarget {
  minValue?: number | null;
  maxValue?: number | null;
}

export interface TrainingPeaksLength {
  value?: number | null;
  unit?: string | null;
}

export interface TrainingPeaksStep {
  name?: string | null;
  length?: TrainingPeaksLength | null;
  targets?: TrainingPeaksTarget[] | null;
  intensityClass?: string | null;
}

export interface TrainingPeaksBlock {
  type?: string | null;
  length?: TrainingPeaksLength | null;
  steps?: TrainingPeaksStep[] | null;
}

export interface TrainingPeaksStructure {
  structure?: TrainingPeaksBlock | TrainingPeaksBlock[] | null;
}

export interface TrainingPeaksWorkout {
  workoutId?: number | null;
  workoutDay?: string | null;
  workoutTypeValueId?: number | null;
  title?: string | null;
  description?: string | null;
  coachComments?: string | null;
  completed?: boolean | null;
  totalTimePlanned?: number | null;
  distancePlanned?: number | null;
  tssPlanned?: number | null;
  ifPlanned?: number | null;
  structure?: TrainingPeaksStructure | null;
}

export interface IntervalsEventPayload {
  start_date_local: string;
  name: string;
  category: "WORKOUT" | "NOTE";
  description: string;
  external_id: string;
  type?: string;
  moving_time?: number;
  distance?: number;
  icu_training_load?: number;
}

export interface IntervalsEvent {
  id: number;
  start_date_local: string;
  name?: string | null;
  category?: string | null;
  type?: string | null;
  description?: string | null;
  external_id?: string | null;
  moving_time?: number | null;
  distance?: number | null;
  icu_training_load?: number | null;
}

export interface SyncItem {
  externalId: string;
  date: string;
  name: string;
  category: string;
  type?: string;
  eventId?: number;
  adoptedExistingEvent?: boolean;
}

export interface SyncResult {
  dateRange: { oldest: string; newest: string };
  sourceCount: number;
  eligibleCount: number;
  created: SyncItem[];
  updated: SyncItem[];
  unchanged: SyncItem[];
  skipped: Array<{
    workoutId?: number | null;
    date?: string;
    reason: string;
  }>;
  staleNotDeleted: Array<{
    eventId: number;
    externalId: string;
    date: string;
    name?: string | null;
  }>;
  dryRun: boolean;
  sourceOfTruth: "TrainingPeaks";
}

