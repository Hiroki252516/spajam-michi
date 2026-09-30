import { load } from "cheerio";
import { z } from "zod";

import { OllamaClient } from "./ollama.js";
import {
  measureSearchTiming,
  type SearchTimingCollector,
} from "./search-timing.js";

export type ExtractedEvent = {
  name: string;
  startsAt: Date;
  endsAt: Date;
  location: string;
  address: string;
  description: string;
  imageUri: string | null;
  organizerName: string;
  organizerContactEmail: string | null;
  tags: string[];
  sourceUrl: string;
  contentText: string;
};

const llmEventSchema = z.object({
  events: z.array(
    z.object({
      name: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      location: z.string(),
      address: z.string(),
      description: z.string(),
      imageUrl: z.string(),
      organizerName: z.string(),
      organizerContactEmail: z.string(),
      tags: z.array(z.string()),
    }),
  ),
});

const llmEventJsonSchema = {
  type: "object",
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        required: [
          "name",
          "startDate",
          "endDate",
          "location",
          "address",
          "description",
          "imageUrl",
          "organizerName",
          "organizerContactEmail",
          "tags",
        ],
        properties: {
          name: { type: "string" },
          startDate: { type: "string" },
          endDate: { type: "string" },
          location: { type: "string" },
          address: { type: "string" },
          description: { type: "string" },
          imageUrl: { type: "string" },
          organizerName: { type: "string" },
          organizerContactEmail: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

export async function extractEventsFromHtml(input: {
  sourceUrl: string;
  html: string;
  ollama?: OllamaClient;
  signal?: AbortSignal;
  timings?: SearchTimingCollector;
}) {
  const document = prepareDocument(input.html);
  const sourceHost = getSourceHost(input.sourceUrl);
  const pageSignals = {
    sourceHost,
    htmlLength: input.html.length,
    visibleTextLength: document.contentText.length,
    hasEventText: /イベント|開催|festival|event/iu.test(document.contentText),
    hasDateText: /20\d{2}[年./-]|\d{1,2}月\d{1,2}日/u.test(
      document.contentText,
    ),
  };
  const jsonLdEventObjectCount = document.jsonLdValues
    .flatMap(flattenJsonLd)
    .filter(isEventObject).length;
  const deterministic = extractJsonLdEvents(
    input.sourceUrl,
    document.jsonLdValues,
    document.contentText,
  );
  if (deterministic.length > 0 || !input.ollama) {
    if (deterministic.length === 0) {
      console.info("Event page has no verified JSON-LD event", {
        ...pageSignals,
        jsonLdEventObjectCount,
      });
    }
    return deterministic;
  }
  const llmInput = [
    `SOURCE_URL: ${input.sourceUrl}`,
    "JSON_LD:",
    document.jsonLdText,
    "VISIBLE_TEXT:",
    document.contentText,
  ]
    .join("\n")
    .slice(0, 16_000);
  const sourceText = `${document.jsonLdText}\n${document.contentText}`;
  const result = await measureSearchTiming(
    input.timings,
    "gemmaAnalysis",
    "eventStructuredExtraction",
    () =>
      input.ollama!.json(
        {
          system:
            "公開ページからイベントを抽出してください。イベント名、開始日と終了日、会場名または会場住所が本文またはJSON-LDに明記されているイベントだけを返してください。開催時刻が記載されていない場合は日付だけを返し、時刻を推測しないでください。住所欄には本文に住所が明記されている場合だけそのまま記入し、ない場合は空文字にしてください。会場名はlocation欄に本文の表記どおり記入してください。イベント名、日付、会場名の推測は禁止です。条件を満たす情報がなければ空配列を返してください。",
          user: llmInput,
          schema: llmEventJsonSchema,
        },
        llmEventSchema,
        input.signal,
      ),
  );
  let missingVenueCount = 0;
  let unverifiedVenueCount = 0;
  let unverifiedNameCount = 0;
  let invalidDateCount = 0;
  let invalidRequiredFieldCount = 0;
  const accepted: ExtractedEvent[] = [];
  for (const event of result.events) {
    const name = event.name.trim();
    const location = event.location.trim();
    const address = event.address.trim();
    const sourceBackedAddress = address && sourceText.includes(address);
    const sourceBackedLocation = location && sourceText.includes(location);
    if (!sourceBackedAddress && !sourceBackedLocation) {
      if (!address && !location) missingVenueCount += 1;
      else unverifiedVenueCount += 1;
      continue;
    }
    if (!name || !sourceText.includes(name)) {
      unverifiedNameCount += 1;
      continue;
    }
    if (
      !parseDateTime(event.startDate, "start") ||
      !parseDateTime(event.endDate, "end")
    ) {
      invalidDateCount += 1;
      continue;
    }
    const verifiedLocation = sourceBackedLocation ? location : address;
    const normalized = normalizeEvent({
      name,
      startDate: event.startDate,
      endDate: event.endDate,
      location: verifiedLocation,
      address: sourceBackedAddress ? address : verifiedLocation,
      description: event.description,
      imageUri: optionalUrl(event.imageUrl),
      organizerName: event.organizerName,
      organizerContactEmail: optionalEmail(event.organizerContactEmail),
      tags: event.tags,
      sourceUrl: input.sourceUrl,
      contentText: document.contentText,
    });
    if (normalized.length === 0) {
      invalidRequiredFieldCount += 1;
      continue;
    }
    accepted.push(...normalized);
  }
  if (accepted.length === 0) {
    console.info("Event page has no verified LLM event", {
      ...pageSignals,
      jsonLdEventObjectCount,
      jsonLdAcceptedCount: deterministic.length,
      llmCandidateCount: result.events.length,
      missingVenueCount,
      unverifiedVenueCount,
      unverifiedNameCount,
      invalidDateCount,
      invalidRequiredFieldCount,
    });
  }
  return accepted;
}

function getSourceHost(sourceUrl: string) {
  try {
    return new URL(sourceUrl).hostname;
  } catch {
    return "unknown";
  }
}

function prepareDocument(html: string) {
  const $ = load(html);
  const jsonLdValues: unknown[] = [];
  const jsonLdTextParts: string[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).text().trim();
    if (!text) return;
    jsonLdTextParts.push(text);
    try {
      jsonLdValues.push(JSON.parse(text));
    } catch {
      // Invalid JSON-LD is still available to the local model as source text.
    }
  });
  $("script,style,noscript,svg").remove();
  return {
    jsonLdValues,
    jsonLdText: jsonLdTextParts.join("\n").slice(0, 10_000),
    contentText: $("body").text().replace(/\s+/gu, " ").trim().slice(0, 10_000),
  };
}

function extractJsonLdEvents(
  sourceUrl: string,
  values: unknown[],
  contentText: string,
) {
  return values
    .flatMap(flattenJsonLd)
    .filter(isEventObject)
    .flatMap((value) => {
      const location = asObject(value.location);
      const address =
        postalAddress(location?.address) || stringValue(location?.name);
      return normalizeEvent({
        name: stringValue(value.name),
        startDate: stringValue(value.startDate),
        endDate: stringValue(value.endDate),
        location: stringValue(location?.name) || stringValue(location?.address),
        address,
        description: stringValue(value.description),
        imageUri: imageUrl(value.image),
        organizerName: stringValue(asObject(value.organizer)?.name),
        organizerContactEmail: optionalEmail(
          stringValue(asObject(value.organizer)?.email),
        ),
        tags: keywordValues(value.keywords),
        sourceUrl,
        contentText,
      });
    });
}

function normalizeEvent(input: {
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  address: string;
  description: string;
  imageUri: string | null;
  organizerName: string;
  organizerContactEmail: string | null;
  tags: string[];
  sourceUrl: string;
  contentText: string;
}): ExtractedEvent[] {
  const startsAt = parseDateTime(input.startDate, "start");
  const endsAt = parseDateTime(input.endDate, "end");
  if (
    !input.name.trim() ||
    !input.location.trim() ||
    !input.address.trim() ||
    !startsAt ||
    !endsAt ||
    endsAt <= startsAt
  ) {
    return [];
  }
  return [
    {
      name: input.name.trim().slice(0, 200),
      startsAt,
      endsAt,
      location: input.location.trim().slice(0, 300),
      address: input.address.trim().slice(0, 300),
      description: input.description.trim().slice(0, 2_000),
      imageUri: input.imageUri,
      organizerName: input.organizerName.trim().slice(0, 200) || "主催者不明",
      organizerContactEmail: input.organizerContactEmail,
      tags: [
        ...new Set(input.tags.map((tag) => tag.trim()).filter(Boolean)),
      ].slice(0, 20),
      sourceUrl: input.sourceUrl,
      contentText: input.contentText,
    },
  ];
}

function flattenJsonLd(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenJsonLd);
  const object = asObject(value);
  if (!object) return [];
  return [object, ...flattenJsonLd(object["@graph"])];
}

function isEventObject(value: Record<string, unknown>) {
  const type = value["@type"];
  return Array.isArray(type) ? type.includes("Event") : type === "Event";
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value;
  const object = asObject(value);
  return object ? stringValue(object.name) : "";
}

function imageUrl(value: unknown) {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === "string") return optionalUrl(first);
  const object = asObject(first);
  return optionalUrl(stringValue(object?.url));
}

function keywordValues(value: unknown) {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  return typeof value === "string"
    ? value.split(/[,、]/gu).map((keyword) => keyword.trim())
    : [];
}

function optionalUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function optionalEmail(value: string) {
  const trimmed = value.replace(/^mailto:/iu, "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed) ? trimmed : null;
}

function parseDateTime(value: string, boundary: "start" | "end") {
  const trimmed = value.trim();
  const normalized = trimmed
    .replace(/[（(](?:月|火|水|木|金|土|日)(?:曜日)?[)）]/u, "")
    .replace(/年|月/gu, "-")
    .replace(/日/u, "")
    .replace(/\//gu, "-");
  const dateParts =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\s*T?(\d{1,2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?)?/u.exec(
      normalized,
    );
  if (!dateParts) return null;
  const suffix = normalized.slice(dateParts[0].length).trim();

  const year = Number(dateParts[1]);
  const month = Number(dateParts[2]);
  const day = Number(dateParts[3]);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return null;
  }

  if (dateParts[4] === undefined) {
    if (suffix) return null;
    const time = boundary === "start" ? "00:00:00" : "23:59:59.999";
    const date = new Date(
      `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}+09:00`,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const hour = String(dateParts[4]).padStart(2, "0");
  const minute = dateParts[5];
  const second = dateParts[6] ?? "00";
  const fraction = dateParts[7] ?? "";
  const dateTime = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${hour}:${minute}:${second}${fraction}`;
  if (suffix && !/^(?:Z|[+-]\d{2}:?\d{2})$/u.test(suffix)) return null;
  const withZone = `${dateTime}${suffix || "+09:00"}`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function postalAddress(value: unknown) {
  if (typeof value === "string") return value.trim();
  const object = asObject(value);
  if (!object) return "";
  return [
    stringValue(object.addressRegion),
    stringValue(object.addressLocality),
    stringValue(object.streetAddress),
  ]
    .filter(Boolean)
    .join("")
    .trim();
}
