import { randomUUID } from "node:crypto";

import { Hono } from "hono";

import type { EventRow, EventStore } from "./database.js";

type ErrorStatus = 400 | 404 | 409 | 500;

class ApiError extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createApp(database: EventStore) {
  const app = new Hono();

  app.get("/", (context) =>
    context.json({ name: "LED Quattro API", status: "ok" }),
  );

  app.get("/health", async (context) => {
    const databaseVersion = await database.health();
    return context.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      database: "postgresql",
      databaseVersion,
    });
  });

  app.get("/api/events/search", async (context) => {
    const query = context.req.query("q")?.trim();
    if (!query) {
      throw new ApiError(
        400,
        "INVALID_QUERY",
        "検索キーワードが入力されていません",
      );
    }
    const limit = parseInteger(context.req.query("limit"), 20, 1, 100);
    const offset = parseInteger(context.req.query("offset"), 0, 0, 1_000_000);
    const result = await database.searchEvents({ query, limit, offset });

    return context.json({
      status: "success",
      data: {
        events: result.events.map(toEventSummary),
        total: result.total,
        limit,
        offset,
      },
    });
  });

  app.get("/api/events/:eventId", async (context) => {
    const event = await database.findEvent(context.req.param("eventId"));
    if (!event) {
      throw new ApiError(
        404,
        "EVENT_NOT_FOUND",
        "指定されたイベントが見つかりません",
      );
    }
    return context.json({
      status: "success",
      data: {
        id: event.id,
        name: event.name,
        date: event.date,
        time: event.time,
        location: event.location,
        imageUri: event.imageUri,
        rating: event.rating,
        reviewCount: event.reviewCount,
        description: event.description,
        detailedDescription: event.detailedDescription,
        coordinates: {
          latitude: event.latitude,
          longitude: event.longitude,
        },
        tags: event.tags,
        organizer: {
          name: event.organizerName,
          contactEmail: event.organizerContactEmail,
        },
      },
    });
  });

  app.post("/api/reviews", async (context) => {
    const body = await readReviewBody(context.req.raw);
    if (!(await database.eventExists(body.eventId))) {
      throw new ApiError(
        404,
        "EVENT_NOT_FOUND",
        "指定されたイベントが見つかりません",
      );
    }
    const reviewId = `review-${randomUUID()}`;
    const review = await database.createReview({ id: reviewId, ...body });
    if (!review) {
      throw new ApiError(
        409,
        "DUPLICATE_REVIEW",
        "このユーザーはすでにこのイベントをレビュー済みです",
      );
    }

    return context.json(
      {
        status: "success",
        data: {
          reviewId: review.id,
          eventId: review.eventId,
          userId: review.userId,
          rating: review.rating,
          comment: review.comment,
          createdAt: review.createdAt.toISOString(),
          updatedAt: review.updatedAt.toISOString(),
        },
      },
      201,
    );
  });

  app.notFound((context) =>
    context.json(errorResponse("NOT_FOUND", "リソースが見つかりません"), 404),
  );

  app.onError((error, context) => {
    if (error instanceof ApiError) {
      return context.json(
        errorResponse(error.code, error.message),
        error.status,
      );
    }
    console.error(error);
    return context.json(
      errorResponse("INTERNAL_SERVER_ERROR", "サーバーエラーが発生しました"),
      500,
    );
  });

  return app;
}

function toEventSummary(event: EventRow) {
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    time: event.time,
    location: event.location,
    distance: event.distance,
    imageUri: event.imageUri,
    rating: event.rating,
    description: event.description,
    coordinates: {
      latitude: event.latitude,
      longitude: event.longitude,
    },
  };
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(400, "INVALID_REQUEST", "検索条件が不正です");
  }
  return parsed;
}

async function readReviewBody(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_REQUEST", "リクエスト形式が不正です");
  }
  if (!value || typeof value !== "object") {
    throw new ApiError(400, "INVALID_REQUEST", "リクエスト形式が不正です");
  }
  const body = value as Record<string, unknown>;
  if (
    !Number.isInteger(body.rating) ||
    Number(body.rating) < 1 ||
    Number(body.rating) > 5
  ) {
    throw new ApiError(
      400,
      "INVALID_RATING",
      "評価は1〜5の整数である必要があります",
    );
  }
  if (
    typeof body.eventId !== "string" ||
    !body.eventId ||
    typeof body.userId !== "string" ||
    !body.userId ||
    (body.comment !== undefined && typeof body.comment !== "string") ||
    (typeof body.comment === "string" && body.comment.length > 500)
  ) {
    throw new ApiError(400, "INVALID_REQUEST", "リクエスト形式が不正です");
  }
  return {
    eventId: body.eventId,
    userId: body.userId,
    rating: Number(body.rating),
    comment: body.comment as string | undefined,
  };
}

function errorResponse(code: string, message: string) {
  return { status: "error", error: { code, message, details: {} } };
}
