import { afterEach, describe, expect, it, vi } from "vitest";
import { TelegramNotifier } from "../src/telegram.js";
import type { SyncResult } from "../src/types.js";

describe("TelegramNotifier", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GITHUB_RUN_ID;
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_SERVER_URL;
  });

  it("sends a completion summary with the current Actions run", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.GITHUB_RUN_ID = "123";
    process.env.GITHUB_REPOSITORY = "Mitnitsky/tp-intervals-syncer";
    process.env.GITHUB_SERVER_URL = "https://github.com";
    const notifier = new TelegramNotifier({ botToken: "token", chatId: "42" });
    const result: SyncResult = {
      dateRange: { oldest: "2026-08-13", newest: "2026-11-10" },
      sourceCount: 20,
      eligibleCount: 20,
      created: [],
      updated: [
        {
          externalId: "tp:99",
          date: "2026-08-14",
          name: "Easy Run",
          category: "WORKOUT",
          type: "Run",
          eventId: 1001,
          changedFields: ["description", "moving_time"],
        },
      ],
      unchanged: [],
      skipped: [],
      deleted: [],
      dryRun: true,
      sourceOfTruth: "TrainingPeaks",
    };

    await notifier.sendCompleted(result);

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe("https://api.telegram.org/bottoken/sendMessage");
    const rawBody = request?.[1]?.body;
    expect(typeof rawBody).toBe("string");
    const body = JSON.parse(rawBody as string) as {
      text: string;
      reply_markup: { inline_keyboard: Array<Array<{ url: string }>> };
    };
    expect(body.text).toContain("Dry run completed.");
    expect(body.text).toContain("Source: 20");
    expect(body.text).toContain("Would update:");
    expect(body.text).toContain(
      "• 2026-08-14 — Easy Run: notes/workout structure, duration",
    );
    expect(body.reply_markup.inline_keyboard[0]?.[0]?.url).toBe(
      "https://github.com/Mitnitsky/tp-intervals-syncer/actions/runs/123",
    );
  });

  it("does nothing when Telegram is not configured", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    await new TelegramNotifier(undefined).sendStarted(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
