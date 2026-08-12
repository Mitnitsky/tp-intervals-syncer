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
  const header = `• ${item.date} — ${item.name}`;
  if (item.changeDetails?.length) {
    return [
      header,
      ...item.changeDetails.map(
        (change) => `  ${fieldLabels[change.field] ?? change.field}: ${change.summary}`,
      ),
    ].join("\n");
  }
  const fields =
    item.changedFields?.map((field) => fieldLabels[field] ?? field).join(", ") || "event details";
  return `${header}: ${fields}`;
}

function fullDiff(item: SyncResult["updated"][number]): string {
  const details = item.changeDetails ?? [];
  return [
    `Full diff: ${item.date} — ${item.name}`,
    ...details.flatMap((change) => [
      "",
      `${fieldLabels[change.field] ?? change.field}:`,
      "Before:",
      change.before,
      "After:",
      change.after,
    ]),
  ].join("\n");
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
  if (result.deleted.length > 0) {
    sections.push(
      "",
      result.dryRun ? "Would delete (removed from TrainingPeaks):" : "Deleted:",
      ...result.deleted.map(
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
      `Deleted: ${result.deleted.length}`,
      ...changeSection(result),
    ].join("\n");
    await this.#send(message, runUrl() ?? workflowUrl(), runUrl() ? "View run" : "Run sync");
    for (const item of result.updated) {
      await this.#send(
        fullDiff(item),
        runUrl() ?? workflowUrl(),
        runUrl() ? "View run" : "Run sync",
      );
    }
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
    const config = this.#config;
    if (!config) {
      return;
    }
    const chunks = this.#chunks(message);
    for (const [index, chunk] of chunks.entries()) {
      await this.#sendChunk(config, chunk, link, buttonText, index === chunks.length - 1);
    }
  }

  #chunks(message: string): string[] {
    const maximum = 3_800;
    if (message.length <= maximum) {
      return [message];
    }
    const chunks: string[] = [];
    let remaining = message;
    while (remaining.length > maximum) {
      let boundary = remaining.lastIndexOf("\n", maximum);
      if (boundary < maximum / 2) {
        boundary = maximum;
      }
      chunks.push(remaining.slice(0, boundary));
      remaining = remaining.slice(boundary).replace(/^\n/, "");
    }
    chunks.push(remaining);
    return chunks;
  }

  async #sendChunk(
    config: TelegramConfig,
    message: string,
    link: string,
    buttonText: string,
    includeButton: boolean,
  ): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const response = await fetch(
        `https://api.telegram.org/bot${config.botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: config.chatId,
            text: message,
            disable_web_page_preview: true,
            ...(includeButton
              ? {
                  reply_markup: {
                    inline_keyboard: [[{ text: buttonText, url: link }]],
                  },
                }
              : {}),
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
