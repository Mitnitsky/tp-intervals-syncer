import { readFile } from "node:fs/promises";
import { chromium, type Browser, type Page } from "playwright";
import { z } from "zod";
import type { TrainingPeaksWorkout } from "./types.js";

const loginUrl = "https://home.trainingpeaks.com/login";
const apiBase = "https://tpapi.trainingpeaks.com";

const exportSchema = z.object({
  futureCalendarWorkouts: z.array(z.record(z.string(), z.unknown())),
});

interface TokenPayload {
  token?: {
    access_token?: string;
  };
}

interface UserPayload {
  user?: TrainingPeaksUser;
  athletes?: TrainingPeaksAthlete[];
  personId?: number;
  lastName?: string;
}

interface TrainingPeaksUser {
  athletes?: TrainingPeaksAthlete[];
  personId?: number;
  lastName?: string;
}

interface TrainingPeaksAthlete {
  athleteId?: number;
  coachedBy?: number;
  lastName?: string;
}

export class TrainingPeaksClient {
  readonly #username: string;
  readonly #password: string;
  readonly #executablePath: string | undefined;
  #token: string | undefined;

  constructor(username: string, password: string, executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    this.#username = username;
    this.#password = password;
    this.#executablePath = executablePath;
  }

  async authenticate(): Promise<void> {
    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({
        headless: true,
        ...(this.#executablePath ? { executablePath: this.#executablePath } : {}),
        args: ["--disable-dev-shm-usage"],
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.locator('input[name="Username"]').waitFor({ timeout: 30_000 });

      const cookieButton = page.locator("#onetrust-accept-btn-handler");
      if (await cookieButton.isVisible().catch(() => false)) {
        await cookieButton.click();
      }

      await page.locator('input[name="Username"]').fill(this.#username);
      await page.locator('input[name="Password"]').fill(this.#password);
      await page.locator('button[type="submit"]').click();

      this.#token = await this.#waitForToken(page);
      if (!this.#token) {
        const errorText = await page
          .locator('.error-message, .alert-danger, [class*="error"]')
          .first()
          .textContent()
          .catch(() => null);
        throw new Error(errorText?.trim() || "TrainingPeaks login did not produce an API token.");
      }
    } finally {
      await browser?.close();
    }
  }

  async #waitForToken(page: Page): Promise<string | undefined> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const payload = await page
        .evaluate(async (base) => {
          const response = await fetch(`${base}/users/v3/token`, {
            credentials: "include",
            headers: { Accept: "application/json" },
          });
          return response.ok ? ((await response.json()) as TokenPayload) : undefined;
        }, apiBase)
        .catch(() => undefined);
      const token = payload?.token?.access_token;
      if (token) {
        return token;
      }
      await page.waitForTimeout(1_000);
    }
    return undefined;
  }

  async getPlannedWorkouts(oldest: string, newest: string): Promise<TrainingPeaksWorkout[]> {
    if (!this.#token) {
      await this.authenticate();
    }
    const userPayload = await this.#request<UserPayload>("/users/v3/user");
    const user = userPayload.user ?? userPayload;
    const athletes = user.athletes ?? [];
    const ownAthlete =
      athletes.find(
        (athlete) =>
          athlete.coachedBy === user.personId &&
          athlete.lastName?.toLocaleLowerCase() === user.lastName?.toLocaleLowerCase(),
      ) ?? athletes[0];
    const athleteId = ownAthlete?.athleteId ?? user.personId;
    if (!athleteId) {
      throw new Error("Could not determine the TrainingPeaks athlete ID.");
    }

    const payload = await this.#request<TrainingPeaksWorkout[]>(
      `/fitness/v6/athletes/${athleteId}/workouts/${oldest}/${newest}`,
    );
    if (!Array.isArray(payload)) {
      throw new Error("TrainingPeaks returned an invalid workouts response.");
    }
    return payload.filter((workout) => workout.completed !== true);
  }

  async #request<T>(path: string): Promise<T> {
    const response = await fetch(`${apiBase}${path}`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.#token}`,
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      throw new Error(`TrainingPeaks ${path} failed with HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  }
}

export async function loadTrainingPeaksExport(path: string): Promise<TrainingPeaksWorkout[]> {
  const raw = await readFile(path, "utf8");
  const parsed = exportSchema.parse(JSON.parse(raw));
  return parsed.futureCalendarWorkouts as TrainingPeaksWorkout[];
}
