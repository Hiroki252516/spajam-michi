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
  const deterministic = extractJsonLdEvents(
    input.sourceUrl,
    document.jsonLdValues,
    document.contentText,
  );
  if (deterministic.length > 0 || !input.ollama) return deterministic;
  const llmInput = [
    `SOURCE_URL: ${input.sourceUrl}`,
    "JSON_LD:",
    document.jsonLdText,
    "VISIBLE_TEXT:",
    document.contentText,
  ]
    .join("\n")
    .slice(0, 16_000);
  const result = await measureSearchTiming(
    input.timings,
    "gemmaAnalysis",
    "eventStructuredExtraction",
    () =>
      input.ollama!.json(
        {
          system:
            "公開ページからイベントを抽出してください。開始・終了日時と日本国内の会場住所が本文またはJSON-LDに明記されていないイベントはeventsへ入れないでください。住所の推測は禁止です。情報がなければ空配列を返してください。",
          user: llmInput,
          schema: llmEventJsonSchema,
        },
        llmEventSchema,
        input.signal,
      ),
  );
  return result.events.flatMap((event) => {
    if (!event.address.trim() || !llmInput.includes(event.address.trim())) {
      return [];
    }
    return normalizeEvent({
      name: event.name,
      startDate: event.startDate,
      endDate: event.endDate,
      location: event.location,
      address: event.address,
      description: event.description,
      imageUri: optionalUrl(event.imageUrl),
      organizerName: event.organizerName,
      organizerContactEmail: optionalEmail(event.organizerContactEmail),
      tags: event.tags,
      sourceUrl: input.sourceUrl,
      contentText: document.contentText,
    });
  });
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
      const address = postalAddress(location?.address);
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
  const startsAt = parseDateTime(input.startDate);
  const endsAt = parseDateTime(input.endDate);
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

function parseDateTime(value: string) {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/u.test(trimmed)) return null;
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/u.test(trimmed)
    ? trimmed
    : `${trimmed}+09:00`;
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
