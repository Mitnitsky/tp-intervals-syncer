import { z } from "zod";

const configSchema = z.object({
  trainingPeaks: z.object({
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  intervals: z.object({
    apiKey: z.string().min(1),
    athleteId: z.string().min(1),
  }),
  telegram: z
    .object({
      botToken: z.string().min(1),
      chatId: z.string().min(1),
    })
    .optional(),
  sync: z
    .object({
      daysAhead: z.number().int().min(1).max(730).default(90),
      includeToday: z.boolean().default(false),
      skipDates: z.array(z.iso.date()).default([]),
      timeZone: z.string().min(1).default("Asia/Jerusalem"),
    })
    .default({
      daysAhead: 90,
      includeToday: false,
      skipDates: [],
      timeZone: "Asia/Jerusalem",
    }),
});

export type SyncConfig = z.infer<typeof configSchema>;

export function loadConfig(raw = process.env.TP_INTERVALS_SYNC_CONFIG): SyncConfig {
  if (!raw) {
    throw new Error("TP_INTERVALS_SYNC_CONFIG is required.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("TP_INTERVALS_SYNC_CONFIG must be valid JSON.");
  }

  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid TP_INTERVALS_SYNC_CONFIG: ${details}`);
  }
  return result.data;
}
