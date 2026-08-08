import { randomUUID } from "node:crypto";

import { Hono } from "hono";

import { AuthService } from "./auth.js";
import type { EventRow, EventStore } from "./database.js";
import { ApiError } from "./errors.js";
import { LocationResolutionError } from "./geocoding.js";
import {
  RoutingUnavailableError,
  type EventSearchResult,
  type EventRecommendationService,
} from "./recommendation.js";
import { SearchTimingCollector } from "./search-timing.js";

export function createApp(
  database: EventStore,
  options: {
    jwtSecret: string;
    recommendationService: EventRecommendationService;
    enableSearchTimingDebug?: boolean;
    enableDevelopmentEndpoints?: boolean;
  },
) {
  const app = new Hono();
  const authService = new AuthService(database, options.jwtSecret);

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
    let userId: string;
    try {
      ({ userId } = await authService.authenticate(
        context.req.header("Authorization"),
      ));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new ApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "イベント検索にはログインが必要です。",
        );
      }
      throw error;
    }
    const debugRequested = parseSearchTimingDebug(
      context.req.query("debug"),
      options.enableSearchTimingDebug ?? false,
    );
    const latitude = parseCoordinate(context.req.query("latitude"), "latitude");
    const longitude = parseCoordinate(
      context.req.query("longitude"),
      "longitude",
    );
    const query = context.req.query("q")?.trim() || "イベント";
    if (query.length > 100) {
      throw new ApiError(400, "INVALID_QUERY", "検索キーワードが長すぎます");
    }
    const limit = parseInteger(context.req.query("limit"), 20, 1, 20);
    const offset = parseInteger(context.req.query("offset"), 0, 0, 1_000_000);
    const jobId = `search-${randomUUID()}`;
    const job = await database.createEventSearchJob({
      id: jobId,
      userId,
      query,
      limit,
      offset,
      debugRequested,
      expiresAt: new Date(Date.now() + 30 * 60_000),
    });
    void runEventSearchJob({
      database,
      recommendationService: options.recommendationService,
      jobId,
      userId,
      query,
      latitude,
      longitude,
      limit,
      offset,
      debugRequested,
    });

    return context.json(
      {
        status: "success",
        data: {
          jobId,
          status: "queued" as const,
          pollUrl: `/api/events/search/jobs/${jobId}`,
          expiresAt: job.expiresAt.toISOString(),
        },
      },
      202,
    );
  });

  app.get("/api/events/search/jobs/:jobId", async (context) => {
    let userId: string;
    try {
      ({ userId } = await authService.authenticate(
        context.req.header("Authorization"),
      ));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        throw new ApiError(
          401,
          "AUTHENTICATION_REQUIRED",
          "イベント検索結果の取得にはログインが必要です。",
        );
      }
      throw error;
    }
    const job = await database.findEventSearchJob(
      context.req.param("jobId"),
      userId,
    );
    if (!job) {
      throw new ApiError(
        404,
        "SEARCH_JOB_NOT_FOUND",
        "検索ジョブが見つからないか、有効期限が切れています。",
      );
    }
    if (job.status === "succeeded") {
      const result = job.result as EventSearchResult;
      return context.json({
        status: "success",
        data: {
          jobId: job.id,
          status: job.status,
          events: result.events.map(toEventSummary),
          total: result.total,
          limit: job.limit,
          offset: job.offset,
          meta: result.meta,
        },
      });
    }
    if (job.status === "failed") {
      return context.json({
        status: "success",
        data: {
          jobId: job.id,
          status: job.status,
          error: {
            code: job.errorCode ?? "EVENT_SEARCH_FAILED",
            message: job.errorMessage ?? "イベント検索を完了できませんでした。",
          },
          ...(job.debugRequested && job.debugTimings
            ? { debugTimings: job.debugTimings }
            : {}),
        },
      });
    }
    return context.json({
      status: "success",
      data: { jobId: job.id, status: job.status },
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
    const event = await database.findEvent(body.eventId);
    if (!event) {
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
    void options.recommendationService
      .indexReview(review, event)
      .catch((error) => {
        console.error("Review preference indexing failed", error);
      });

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

  app.post("/api/auth/register", async (context) => {
    const body = await readRegisterBody(context.req.raw);
    return context.json(
      { status: "success", data: await authService.register(body) },
      201,
    );
  });

  app.post("/api/auth/login", async (context) => {
    const body = await readLoginBody(context.req.raw);
    return context.json({
      status: "success",
      data: await authService.login(body),
    });
  });

  app.get("/api/auth/me", async (context) =>
    context.json({
      status: "success",
      data: await authService.me(context.req.header("Authorization")),
    }),
  );

  app.post("/api/auth/logout", async (context) => {
    await authService.logout(context.req.header("Authorization"));
    return context.json({
      status: "success",
      data: { message: "ログアウトしました。" },
    });
  });

  if (options.enableDevelopmentEndpoints) {
    app.post("/api/dev/reset", async (context) => {
      await database.resetDevelopmentData();
      return context.json({ status: "success", data: { reset: true } });
    });
  }

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

async function runEventSearchJob(input: {
  database: EventStore;
  recommendationService: EventRecommendationService;
  jobId: string;
  userId: string;
  query: string;
  latitude: number;
  longitude: number;
  limit: number;
  offset: number;
  debugRequested: boolean;
}) {
  const timings = input.debugRequested
    ? new SearchTimingCollector(input.jobId)
    : undefined;
  try {
    await input.database.markEventSearchJobRunning(input.jobId, input.userId);
    const result = await input.recommendationService.search({
      userId: input.userId,
      query: input.query,
      latitude: input.latitude,
      longitude: input.longitude,
      limit: input.limit,
      offset: input.offset,
      timings,
    });
    const debugTimings = timings?.snapshot() ?? null;
    if (debugTimings) {
      result.meta.debugTimings = debugTimings;
      timings!.logSummary("succeeded", debugTimings);
    }
    await input.database.completeEventSearchJob(
      input.jobId,
      input.userId,
      result,
      debugTimings,
    );
  } catch (error) {
    let errorCode = "EVENT_SEARCH_FAILED";
    let errorMessage = "イベント検索を完了できませんでした。";
    if (error instanceof RoutingUnavailableError) {
      errorCode = "ROUTING_UNAVAILABLE";
      errorMessage =
        "現在、移動時間を計算できません。しばらくしてからお試しください。";
    } else if (error instanceof LocationResolutionError) {
      errorCode = "LOCATION_RESOLUTION_UNAVAILABLE";
      errorMessage =
        "DuckDuckGoの検索結果から現在地の地域名を確認できませんでした。";
    }
    const debugTimings = timings?.snapshot() ?? null;
    if (debugTimings) timings!.logSummary("failed", debugTimings);
    console.error("Asynchronous event search failed", error);
    await input.database.failEventSearchJob(
      input.jobId,
      input.userId,
      errorCode,
      errorMessage,
      debugTimings,
    );
  }
}

function parseSearchTimingDebug(value: string | undefined, enabled: boolean) {
  if (value === undefined) return false;
  if (value !== "timings") {
    throw new ApiError(
      400,
      "INVALID_DEBUG_MODE",
      "debugにはtimingsを指定してください。",
    );
  }
  if (!enabled) {
    throw new ApiError(
      403,
      "DEBUG_TIMINGS_DISABLED",
      "イベント検索のデバッグ計測は無効です。",
    );
  }
  return true;
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
    ...(isRecommendedEvent(event)
      ? {
          sourceUrl: event.sourceUrl,
          travelMode: event.travelMode,
          travelDurationMinutes: event.travelDurationMinutes,
          recommendationReason: event.recommendationReason,
        }
      : {}),
  };
}

function isRecommendedEvent(event: EventRow): event is EventRow & {
  travelMode: "TRANSIT" | "WALK";
  travelDurationMinutes: number;
  recommendationReason: string;
} {
  return "travelMode" in event;
}

function parseCoordinate(
  value: string | undefined,
  type: "latitude" | "longitude",
) {
  const parsed = value === undefined ? Number.NaN : Number(value);
  const minimum = type === "latitude" ? -90 : -180;
  const maximum = type === "latitude" ? 90 : 180;
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new ApiError(
      400,
      "LOCATION_REQUIRED",
      "現在地の緯度・経度を正しく指定してください。",
    );
  }
  return parsed;
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

async function readRegisterBody(request: Request) {
  const body = await readObjectBody(request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!name || name.length > 100) {
    throw validationError("お名前を入力してください。");
  }
  if (!isValidEmail(email)) {
    throw validationError("有効なメールアドレスを入力してください。");
  }
  validatePassword(password);
  return { name, email, password };
}

async function readLoginBody(request: Request) {
  const body = await readObjectBody(request);
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!isValidEmail(email) || !password) {
    throw validationError("メールアドレスとパスワードを入力してください。");
  }
  return { email, password };
}

async function readObjectBody(request: Request) {
  try {
    const value: unknown = await request.json();
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
  } catch {
    // The common validation error below is returned for malformed JSON.
  }
  throw validationError("リクエスト形式が不正です。");
}

function validatePassword(password: string) {
  if (password.length < 4) {
    throw validationError("パスワードは4文字以上で入力してください。");
  }
  if (password.length > 128) {
    throw validationError("パスワードは128文字以内で入力してください。");
  }
}

function isValidEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validationError(message: string) {
  return new ApiError(400, "VALIDATION_ERROR", message);
}

function errorResponse(code: string, message: string) {
  return { status: "error", error: { code, message, details: {} } };
}
