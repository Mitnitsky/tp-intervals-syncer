import type { SyncResult } from "./types.js";

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

const fieldLabels: Record<string, string> = {
  start_date_local: "date",
  name: "title",
  category: "category",
  type: "sport",
  description: "notes/workout structure",
  moving_time: "duration",
  distance: "distance",
  icu_training_load: "training load",
  external_id: "TrainingPeaks link",
};

function itemLine(item: SyncResult["updated"][number]): string {
  const changes =
    item.changedFields?.map((field) => fieldLabels[field] ?? field).join(", ") || "event details";
  return `• ${item.date} — ${item.name}: ${changes}`;
}

function changeSection(result: SyncResult): string[] {
  const sections: string[] = [];
  if (result.created.length > 0) {
    sections.push(
      "",
      result.dryRun ? "Would create:" : "Created:",
      ...result.created.map((item) => `• ${item.date} — ${item.name}`),
    );
  }
  if (result.updated.length > 0) {
    sections.push(
      "",
      result.dryRun ? "Would update:" : "Updated:",
      ...result.updated.map(itemLine),
    );
  }
  if (result.staleNotDeleted.length > 0) {
    sections.push(
      "",
      "Missing from TrainingPeaks (not deleted):",
      ...result.staleNotDeleted.map(
        (item) => `• ${item.date} — ${item.name ?? item.externalId}`,
      ),
    );
  }
  return sections;
}

function workflowUrl(): string {
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY ?? "Mitnitsky/tp-intervals-syncer";
  return `${server}/${repository}/actions/workflows/sync.yml`;
}

function runUrl(): string | undefined {
  const runId = process.env.GITHUB_RUN_ID;
  return runId
    ? `${process.env.GITHUB_SERVER_URL ?? "https://github.com"}/${process.env.GITHUB_REPOSITORY}/actions/runs/${runId}`
    : undefined;
}

export class TelegramNotifier {
  readonly #config: TelegramConfig | undefined;

  constructor(config: TelegramConfig | undefined) {
    this.#config = config;
  }

  async sendStarted(dryRun: boolean): Promise<void> {
    await this.#send(
      `TrainingPeaks sync started${dryRun ? " (dry run)" : ""}.`,
      runUrl() ?? workflowUrl(),
      "View run",
    );
  }

  async sendCompleted(result: SyncResult): Promise<void> {
    const mode = result.dryRun ? "Dry run completed" : "Sync completed";
    const message = [
      `${mode}.`,
      `Source: ${result.sourceCount}`,
      `Created: ${result.created.length}`,
      `Updated: ${result.updated.length}`,
      `Unchanged: ${result.unchanged.length}`,
      `Skipped: ${result.skipped.length}`,
      `Stale (not deleted): ${result.staleNotDeleted.length}`,
      ...changeSection(result),
    ].join("\n");
    await this.#send(message, runUrl() ?? workflowUrl(), runUrl() ? "View run" : "Run sync");
  }

  async sendFailed(error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await this.#send(
      `TrainingPeaks sync failed.\n${message.slice(0, 1_000)}`,
      runUrl() ?? workflowUrl(),
      runUrl() ? "View failed run" : "Open sync workflow",
    );
  }

  async #send(message: string, link: string, buttonText: string): Promise<void> {
    if (!this.#config) {
      return;
    }
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(
        `https://api.telegram.org/bot${this.#config.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: this.#config.chatId,
            text: message,
            disable_web_page_preview: true,
            reply_markup: {
              inline_keyboard: [[{ text: buttonText, url: link }]],
            },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (response.ok) {
        return;
      }
      if (attempt === 3) {
        throw new Error(`Telegram notification failed with HTTP ${response.status}.`);
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
}
