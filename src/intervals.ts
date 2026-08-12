import type { IntervalsEvent, IntervalsEventPayload } from "./types.js";

export interface IntervalsApi {
  getEvents(oldest: string, newest: string): Promise<IntervalsEvent[]>;
  createEvent(payload: IntervalsEventPayload): Promise<IntervalsEvent>;
  updateEvent(eventId: number, payload: IntervalsEventPayload): Promise<IntervalsEvent>;
  deleteEvent(eventId: number): Promise<void>;
}

export class IntervalsClient implements IntervalsApi {
  readonly #athleteId: string;
  readonly #authorization: string;
  readonly #baseUrl: string;

  constructor(apiKey: string, athleteId: string, baseUrl = "https://intervals.icu/api/v1") {
    this.#athleteId = athleteId;
    this.#authorization = `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`;
    this.#baseUrl = baseUrl;
  }

  getEvents(oldest: string, newest: string): Promise<IntervalsEvent[]> {
    const query = new URLSearchParams({ oldest, newest });
    return this.#request<IntervalsEvent[]>(
      "GET",
      `/athlete/${encodeURIComponent(this.#athleteId)}/events?${query.toString()}`,
    );
  }

  createEvent(payload: IntervalsEventPayload): Promise<IntervalsEvent> {
    return this.#request<IntervalsEvent>(
      "POST",
      `/athlete/${encodeURIComponent(this.#athleteId)}/events`,
      payload,
    );
  }

  updateEvent(eventId: number, payload: IntervalsEventPayload): Promise<IntervalsEvent> {
    return this.#request<IntervalsEvent>(
      "PUT",
      `/athlete/${encodeURIComponent(this.#athleteId)}/events/${eventId}`,
      payload,
    );
  }

  async deleteEvent(eventId: number): Promise<void> {
    await this.#request<unknown>(
      "DELETE",
      `/athlete/${encodeURIComponent(this.#athleteId)}/events/${eventId}`,
    );
  }

  async #request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: IntervalsEventPayload,
  ): Promise<T> {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: this.#authorization,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(
        `Intervals.icu ${method} ${path} failed with HTTP ${response.status}: ${responseText.slice(0, 500)}`,
      );
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
