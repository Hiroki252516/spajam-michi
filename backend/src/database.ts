import { Pool } from "pg";

import type { SearchDebugTimings } from "./search-timing.js";

export type EventRow = {
  id: string;
  name: string;
  spotName?: string;
  date: string;
  time: string;
  duration?: string;
  cost?: string;
  location: string;
  distance: string;
  imageUri: string | null;
  description: string;
  detailedDescription: string;
  latitude: number;
  longitude: number;
  organizerName: string;
  organizerContactEmail: string | null;
  rating: number;
  reviewCount: number;
  sourceUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
};

export type ReviewRow = {
  id: string;
  eventId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UserRow = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  avatarUrl: string | null;
};

export type AuthSessionRow = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type VisitedEventRow = {
  id: string;
  eventName: string;
  visitedDate: string;
  rating: number;
};

export type DiscoveredEventInput = {
  id: string;
  name: string;
  location: string;
  imageUri: string | null;
  description: string;
  detailedDescription: string;
  latitude: number;
  longitude: number;
  organizerName: string;
  organizerContactEmail: string | null;
  sourceProvider: string;
  sourceUrl: string;
  sourceFingerprint: string;
  startsAt: Date;
  endsAt: Date;
  contentText: string;
  tags: string[];
  embedding: number[] | null;
  embeddingModel: string | null;
};

export type PreferenceMemoryRow = {
  reviewId: string;
  userId: string;
  eventId: string;
  memoryText: string;
  preferenceTags: string[];
  rating: number;
  embedding: number[] | null;
  embeddingModel: string | null;
  embeddingStatus: "pending" | "ready" | "failed";
  similarity: number | null;
};

export type DiscoveryCacheRow = {
  payload: DiscoveredEventInput[];
  expiresAt: Date;
};

export type EventSearchJobRow = {
  id: string;
  userId: string;
  query: string;
  limit: number;
  offset: number;
  debugRequested: boolean;
  debugTimings: SearchDebugTimings | null;
  status: "queued" | "running" | "succeeded" | "failed";
  result: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
};

export interface EventStore {
  health(): Promise<string>;
  searchEvents(input: {
    query: string;
    limit: number;
    offset: number;
  }): Promise<{ events: EventRow[]; total: number }>;
  findEvent(eventId: string): Promise<(EventRow & { tags: string[] }) | null>;
  eventExists(eventId: string): Promise<boolean>;
  createReview(input: {
    id: string;
    eventId: string;
    userId: string;
    rating: number;
    comment?: string;
  }): Promise<ReviewRow | null>;
  resetDevelopmentData(): Promise<void>;
  createUser(input: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<UserRow | null>;
  findUserByEmail(email: string): Promise<UserRow | null>;
  findUserById(userId: string): Promise<UserRow | null>;
  createAuthSession(input: {
    id: string;
    userId: string;
    expiresAt: Date;
  }): Promise<void>;
  findAuthSession(sessionId: string): Promise<AuthSessionRow | null>;
  revokeAuthSession(sessionId: string): Promise<void>;
  listVisitedEvents(userId: string): Promise<VisitedEventRow[]>;
  upsertDiscoveredEvents(events: DiscoveredEventInput[]): Promise<EventRow[]>;
  listActiveEvents(input: {
    query: string;
    startsBefore: Date;
    endsAfter: Date;
    limit: number;
  }): Promise<EventRow[]>;
  setEventEmbedding(
    eventId: string,
    embedding: number[],
    model: string,
  ): Promise<void>;
  savePreferenceMemory(
    input: Omit<PreferenceMemoryRow, "similarity">,
  ): Promise<void>;
  listPreferenceMemories(
    userId: string,
    limit: number,
  ): Promise<PreferenceMemoryRow[]>;
  findSimilarPreferenceMemories(
    userId: string,
    embedding: number[],
    limit: number,
  ): Promise<PreferenceMemoryRow[]>;
  getDiscoveryCache(cacheKey: string): Promise<DiscoveryCacheRow | null>;
  setDiscoveryCache(input: {
    cacheKey: string;
    query: string;
    area: string;
    payload: DiscoveredEventInput[];
    expiresAt: Date;
  }): Promise<void>;
  recordRecommendationLog(input: {
    id: string;
    userId: string;
    query: string;
    personalized: boolean;
    source: string;
    candidateScores: unknown;
    chatModel: string;
    embeddingModel: string;
  }): Promise<void>;
  createEventSearchJob(input: {
    id: string;
    userId: string;
    query: string;
    limit: number;
    offset: number;
    debugRequested: boolean;
    expiresAt: Date;
  }): Promise<EventSearchJobRow>;
  markEventSearchJobRunning(jobId: string, userId: string): Promise<void>;
  completeEventSearchJob(
    jobId: string,
    userId: string,
    result: unknown,
    debugTimings: SearchDebugTimings | null,
  ): Promise<void>;
  failEventSearchJob(
    jobId: string,
    userId: string,
    errorCode: string,
    errorMessage: string,
    debugTimings: SearchDebugTimings | null,
  ): Promise<void>;
  findEventSearchJob(
    jobId: string,
    userId: string,
  ): Promise<EventSearchJobRow | null>;
  close(): Promise<void>;
}

export class PostgresEventStore implements EventStore {
  constructor(private readonly pool: Pool) {}

  async initialize(seed = false) {
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      CREATE TABLE IF NOT EXISTS events (
        id text PRIMARY KEY,
        name text NOT NULL,
        date text NOT NULL,
        time text NOT NULL,
        location text NOT NULL,
        distance text NOT NULL DEFAULT '距離情報なし',
        image_uri text,
        description text NOT NULL,
        detailed_description text NOT NULL,
        latitude double precision NOT NULL,
        longitude double precision NOT NULL,
        organizer_name text NOT NULL,
        organizer_contact_email text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS event_tags (
        event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        tag text NOT NULL,
        PRIMARY KEY (event_id, tag)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id text PRIMARY KEY,
        event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment text CHECK (comment IS NULL OR char_length(comment) <= 500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (event_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS users (
        id text PRIMARY KEY,
        name text NOT NULL,
        email text NOT NULL,
        password_hash text NOT NULL,
        avatar_url text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_index
        ON users (lower(email));

      CREATE TABLE IF NOT EXISTS auth_sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS auth_sessions_user_id_index
        ON auth_sessions(user_id);

      CREATE INDEX IF NOT EXISTS events_name_index ON events(name);
      CREATE INDEX IF NOT EXISTS events_location_index ON events(location);

      ALTER TABLE events ADD COLUMN IF NOT EXISTS source_provider text;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS source_fingerprint text;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS starts_at timestamptz;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS ends_at timestamptz;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS content_text text;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS embedding vector(768);
      ALTER TABLE events ADD COLUMN IF NOT EXISTS embedding_model text;
      ALTER TABLE events ADD COLUMN IF NOT EXISTS fetched_at timestamptz;

      DROP INDEX IF EXISTS events_source_url_unique_index;
      CREATE UNIQUE INDEX IF NOT EXISTS events_source_fingerprint_unique_index
        ON events(source_fingerprint) WHERE source_fingerprint IS NOT NULL;
      CREATE INDEX IF NOT EXISTS events_active_time_index
        ON events(starts_at, ends_at);
      CREATE INDEX IF NOT EXISTS events_embedding_hnsw_index
        ON events USING hnsw (embedding vector_cosine_ops);

      CREATE TABLE IF NOT EXISTS user_preference_memories (
        review_id text PRIMARY KEY REFERENCES reviews(id) ON DELETE CASCADE,
        user_id text NOT NULL,
        event_id text NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        memory_text text NOT NULL,
        preference_tags text[] NOT NULL DEFAULT '{}',
        rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
        embedding vector(768),
        embedding_model text,
        embedding_status text NOT NULL DEFAULT 'pending'
          CHECK (embedding_status IN ('pending', 'ready', 'failed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS user_preference_memories_user_id_index
        ON user_preference_memories(user_id);
      CREATE INDEX IF NOT EXISTS user_preference_memories_embedding_hnsw_index
        ON user_preference_memories USING hnsw (embedding vector_cosine_ops);

      CREATE TABLE IF NOT EXISTS event_discovery_cache (
        cache_key text PRIMARY KEY,
        query text NOT NULL,
        area text NOT NULL,
        payload jsonb NOT NULL,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS event_discovery_cache_expires_at_index
        ON event_discovery_cache(expires_at);

      CREATE TABLE IF NOT EXISTS recommendation_logs (
        id text PRIMARY KEY,
        user_id text NOT NULL,
        query text NOT NULL,
        personalized boolean NOT NULL,
        source text NOT NULL,
        candidate_scores jsonb NOT NULL,
        chat_model text NOT NULL,
        embedding_model text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS recommendation_logs_user_created_index
        ON recommendation_logs(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS event_search_jobs (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        query text NOT NULL,
        result_limit integer NOT NULL CHECK (result_limit BETWEEN 1 AND 20),
        result_offset integer NOT NULL CHECK (result_offset >= 0),
        debug_requested boolean NOT NULL DEFAULT false,
        debug_timings jsonb,
        status text NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
        result jsonb,
        error_code text,
        error_message text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL
      );

      ALTER TABLE event_search_jobs
        ADD COLUMN IF NOT EXISTS debug_requested boolean NOT NULL DEFAULT false;
      ALTER TABLE event_search_jobs
        ADD COLUMN IF NOT EXISTS debug_timings jsonb;

      CREATE INDEX IF NOT EXISTS event_search_jobs_user_created_index
        ON event_search_jobs(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS event_search_jobs_expires_at_index
        ON event_search_jobs(expires_at);

      UPDATE event_search_jobs SET
        status = 'failed',
        error_code = 'SEARCH_INTERRUPTED',
        error_message = 'バックエンドの再起動により検索が中断されました。',
        updated_at = now()
      WHERE status IN ('queued', 'running');
    `);
    if (seed) await this.seedDevelopmentEvents();
  }

  async health() {
    const result = await this.pool.query<{ version: string }>(
      "SELECT version() AS version",
    );
    return result.rows[0]?.version ?? "unknown";
  }

  async searchEvents(input: { query: string; limit: number; offset: number }) {
    const pattern = `%${escapeLike(input.query)}%`;
    const where = `
      WHERE events.name ILIKE $1 ESCAPE '\\'
         OR events.location ILIKE $1 ESCAPE '\\'
         OR events.description ILIKE $1 ESCAPE '\\'`;
    const [eventResult, countResult] = await Promise.all([
      this.pool.query<EventDatabaseRow>(
        `SELECT events.*,
          COALESCE(AVG(reviews.rating), 0)::float8 AS rating,
          COUNT(reviews.id)::int AS review_count
        FROM events
        LEFT JOIN reviews ON reviews.event_id = events.id
        ${where}
        GROUP BY events.id
        ORDER BY events.date, events.time
        LIMIT $2 OFFSET $3`,
        [pattern, input.limit, input.offset],
      ),
      this.pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM events ${where}`,
        [pattern],
      ),
    ]);
    return {
      events: eventResult.rows.map(mapEvent),
      total: countResult.rows[0]?.count ?? 0,
    };
  }

  async findEvent(eventId: string) {
    const [eventResult, tagResult] = await Promise.all([
      this.pool.query<EventDatabaseRow>(
        `SELECT events.*,
          COALESCE(AVG(reviews.rating), 0)::float8 AS rating,
          COUNT(reviews.id)::int AS review_count
        FROM events
        LEFT JOIN reviews ON reviews.event_id = events.id
        WHERE events.id = $1
        GROUP BY events.id`,
        [eventId],
      ),
      this.pool.query<{ tag: string }>(
        "SELECT tag FROM event_tags WHERE event_id = $1 ORDER BY tag",
        [eventId],
      ),
    ]);
    const event = eventResult.rows[0];
    return event
      ? { ...mapEvent(event), tags: tagResult.rows.map(({ tag }) => tag) }
      : null;
  }

  async eventExists(eventId: string) {
    const result = await this.pool.query(
      "SELECT 1 FROM events WHERE id = $1 LIMIT 1",
      [eventId],
    );
    return result.rowCount === 1;
  }

  async createReview(input: {
    id: string;
    eventId: string;
    userId: string;
    rating: number;
    comment?: string;
  }) {
    const result = await this.pool.query<ReviewDatabaseRow>(
      `INSERT INTO reviews (id, event_id, user_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, user_id) DO NOTHING
       RETURNING *`,
      [
        input.id,
        input.eventId,
        input.userId,
        input.rating,
        input.comment ?? null,
      ],
    );
    const review = result.rows[0];
    return review ? mapReview(review) : null;
  }

  async resetDevelopmentData() {
    await this.seedDevelopmentEvents(true);
  }

  async createUser(input: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
  }) {
    const result = await this.pool.query<UserDatabaseRow>(
      `INSERT INTO users (id, name, email, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id, name, email, password_hash, avatar_url`,
      [input.id, input.name, input.email, input.passwordHash],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserByEmail(email: string) {
    const result = await this.pool.query<UserDatabaseRow>(
      `SELECT id, name, email, password_hash, avatar_url
       FROM users WHERE lower(email) = lower($1)`,
      [email],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async findUserById(userId: string) {
    const result = await this.pool.query<UserDatabaseRow>(
      `SELECT id, name, email, password_hash, avatar_url
       FROM users WHERE id = $1`,
      [userId],
    );
    return result.rows[0] ? mapUser(result.rows[0]) : null;
  }

  async createAuthSession(input: {
    id: string;
    userId: string;
    expiresAt: Date;
  }) {
    await this.pool.query(
      `INSERT INTO auth_sessions (id, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [input.id, input.userId, input.expiresAt],
    );
  }

  async findAuthSession(sessionId: string) {
    const result = await this.pool.query<AuthSessionDatabaseRow>(
      `SELECT id, user_id, expires_at, revoked_at
       FROM auth_sessions WHERE id = $1`,
      [sessionId],
    );
    return result.rows[0] ? mapAuthSession(result.rows[0]) : null;
  }

  async revokeAuthSession(sessionId: string) {
    await this.pool.query(
      `UPDATE auth_sessions SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL`,
      [sessionId],
    );
  }

  async listVisitedEvents(userId: string) {
    const result = await this.pool.query<VisitedEventDatabaseRow>(
      `SELECT reviews.id, events.name AS event_name,
          events.date AS visited_date, reviews.rating
       FROM reviews
       INNER JOIN events ON events.id = reviews.event_id
       WHERE reviews.user_id = $1
       ORDER BY events.date DESC, reviews.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      eventName: row.event_name,
      visitedDate: formatVisitedDate(row.visited_date),
      rating: row.rating,
    }));
  }

  async upsertDiscoveredEvents(events: DiscoveredEventInput[]) {
    if (events.length === 0) return [];
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const ids: string[] = [];
      for (const event of events) {
        const embedding = event.embedding
          ? serializeVector(event.embedding)
          : null;
        const result = await client.query<{ id: string }>(
          `INSERT INTO events (
            id, name, date, time, location, distance, image_uri, description,
            detailed_description, latitude, longitude, organizer_name,
            organizer_contact_email, source_provider, source_url,
            source_fingerprint, starts_at, ends_at, content_text, embedding,
            embedding_model, fetched_at
          ) VALUES (
            $1, $2, $3, $4, $5, '距離計算中', $6, $7, $8, $9, $10, $11,
            $12, $13, $14, $15, $16, $17, $18, $19::vector, $20, now()
          )
          ON CONFLICT (source_fingerprint)
            WHERE source_fingerprint IS NOT NULL DO UPDATE SET
            name = EXCLUDED.name,
            date = EXCLUDED.date,
            time = EXCLUDED.time,
            location = EXCLUDED.location,
            image_uri = EXCLUDED.image_uri,
            description = EXCLUDED.description,
            detailed_description = EXCLUDED.detailed_description,
            latitude = EXCLUDED.latitude,
            longitude = EXCLUDED.longitude,
            organizer_name = EXCLUDED.organizer_name,
            organizer_contact_email = EXCLUDED.organizer_contact_email,
            source_provider = EXCLUDED.source_provider,
            source_url = EXCLUDED.source_url,
            starts_at = EXCLUDED.starts_at,
            ends_at = EXCLUDED.ends_at,
            content_text = EXCLUDED.content_text,
            embedding = COALESCE(EXCLUDED.embedding, events.embedding),
            embedding_model = COALESCE(EXCLUDED.embedding_model, events.embedding_model),
            fetched_at = now(),
            updated_at = now()
          RETURNING id`,
          [
            event.id,
            event.name,
            formatEventDate(event.startsAt),
            formatEventTime(event.startsAt, event.endsAt),
            event.location,
            event.imageUri,
            event.description,
            event.detailedDescription,
            event.latitude,
            event.longitude,
            event.organizerName,
            event.organizerContactEmail,
            event.sourceProvider,
            event.sourceUrl,
            event.sourceFingerprint,
            event.startsAt,
            event.endsAt,
            event.contentText,
            embedding,
            event.embeddingModel,
          ],
        );
        const id = result.rows[0]?.id;
        if (!id) continue;
        ids.push(id);
        await client.query("DELETE FROM event_tags WHERE event_id = $1", [id]);
        for (const tag of [...new Set(event.tags)].slice(0, 20)) {
          await client.query(
            "INSERT INTO event_tags (event_id, tag) VALUES ($1, $2)",
            [id, tag],
          );
        }
      }
      await client.query("COMMIT");
      const result = await this.pool.query<EventDatabaseRow>(
        `SELECT events.*,
          COALESCE(AVG(reviews.rating), 0)::float8 AS rating,
          COUNT(reviews.id)::int AS review_count
        FROM events
        LEFT JOIN reviews ON reviews.event_id = events.id
        WHERE events.id = ANY($1::text[])
        GROUP BY events.id`,
        [ids],
      );
      const byId = new Map(result.rows.map((row) => [row.id, mapEvent(row)]));
      return ids.flatMap((id) => {
        const event = byId.get(id);
        return event ? [event] : [];
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listActiveEvents(input: {
    query: string;
    startsBefore: Date;
    endsAfter: Date;
    limit: number;
  }) {
    const pattern = input.query ? `%${escapeLike(input.query)}%` : "%";
    const result = await this.pool.query<EventDatabaseRow>(
      `SELECT events.*,
        COALESCE(AVG(reviews.rating), 0)::float8 AS rating,
        COUNT(reviews.id)::int AS review_count
      FROM events
      LEFT JOIN reviews ON reviews.event_id = events.id
      WHERE events.starts_at < $2
        AND events.ends_at > $3
        AND (
          events.name ILIKE $1 ESCAPE '\\'
          OR events.location ILIKE $1 ESCAPE '\\'
          OR events.description ILIKE $1 ESCAPE '\\'
        )
      GROUP BY events.id
      ORDER BY events.starts_at
      LIMIT $4`,
      [pattern, input.startsBefore, input.endsAfter, input.limit],
    );
    return result.rows.map(mapEvent);
  }

  async setEventEmbedding(eventId: string, embedding: number[], model: string) {
    await this.pool.query(
      `UPDATE events SET embedding = $2::vector, embedding_model = $3,
        updated_at = now() WHERE id = $1`,
      [eventId, serializeVector(embedding), model],
    );
  }

  async savePreferenceMemory(input: Omit<PreferenceMemoryRow, "similarity">) {
    await this.pool.query(
      `INSERT INTO user_preference_memories (
        review_id, user_id, event_id, memory_text, preference_tags, rating,
        embedding, embedding_model, embedding_status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9)
      ON CONFLICT (review_id) DO UPDATE SET
        memory_text = EXCLUDED.memory_text,
        preference_tags = EXCLUDED.preference_tags,
        rating = EXCLUDED.rating,
        embedding = EXCLUDED.embedding,
        embedding_model = EXCLUDED.embedding_model,
        embedding_status = EXCLUDED.embedding_status,
        updated_at = now()`,
      [
        input.reviewId,
        input.userId,
        input.eventId,
        input.memoryText,
        input.preferenceTags,
        input.rating,
        input.embedding ? serializeVector(input.embedding) : null,
        input.embeddingModel,
        input.embeddingStatus,
      ],
    );
  }

  async listPreferenceMemories(userId: string, limit: number) {
    const result = await this.pool.query<PreferenceMemoryDatabaseRow>(
      `SELECT review_id, user_id, event_id, memory_text, preference_tags,
        rating, embedding::text, embedding_model, embedding_status,
        NULL::float8 AS similarity
      FROM user_preference_memories
      WHERE user_id = $1
      ORDER BY updated_at DESC
      LIMIT $2`,
      [userId, limit],
    );
    return result.rows.map(mapPreferenceMemory);
  }

  async findSimilarPreferenceMemories(
    userId: string,
    embedding: number[],
    limit: number,
  ) {
    const result = await this.pool.query<PreferenceMemoryDatabaseRow>(
      `SELECT review_id, user_id, event_id, memory_text, preference_tags,
        rating, embedding::text, embedding_model, embedding_status,
        (1 - (embedding <=> $2::vector))::float8 AS similarity
      FROM user_preference_memories
      WHERE user_id = $1
        AND embedding_status = 'ready'
        AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector
      LIMIT $3`,
      [userId, serializeVector(embedding), limit],
    );
    return result.rows.map(mapPreferenceMemory);
  }

  async getDiscoveryCache(cacheKey: string) {
    await this.pool.query(
      "DELETE FROM event_discovery_cache WHERE expires_at <= now()",
    );
    const result = await this.pool.query<{
      payload: SerializedDiscoveredEvent[];
      expires_at: Date;
    }>(
      `SELECT payload, expires_at FROM event_discovery_cache
       WHERE cache_key = $1 AND expires_at > now()`,
      [cacheKey],
    );
    const row = result.rows[0];
    return row
      ? {
          payload: row.payload.map(deserializeDiscoveredEvent),
          expiresAt: row.expires_at,
        }
      : null;
  }

  async setDiscoveryCache(input: {
    cacheKey: string;
    query: string;
    area: string;
    payload: DiscoveredEventInput[];
    expiresAt: Date;
  }) {
    await this.pool.query(
      `INSERT INTO event_discovery_cache (
        cache_key, query, area, payload, expires_at
      ) VALUES ($1, $2, $3, $4::jsonb, $5)
      ON CONFLICT (cache_key) DO UPDATE SET
        query = EXCLUDED.query,
        area = EXCLUDED.area,
        payload = EXCLUDED.payload,
        expires_at = EXCLUDED.expires_at,
        created_at = now()`,
      [
        input.cacheKey,
        input.query,
        input.area,
        JSON.stringify(input.payload),
        input.expiresAt,
      ],
    );
  }

  async recordRecommendationLog(input: {
    id: string;
    userId: string;
    query: string;
    personalized: boolean;
    source: string;
    candidateScores: unknown;
    chatModel: string;
    embeddingModel: string;
  }) {
    await this.pool.query(
      `INSERT INTO recommendation_logs (
        id, user_id, query, personalized, source, candidate_scores,
        chat_model, embedding_model
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)`,
      [
        input.id,
        input.userId,
        input.query,
        input.personalized,
        input.source,
        JSON.stringify(input.candidateScores),
        input.chatModel,
        input.embeddingModel,
      ],
    );
  }

  async createEventSearchJob(input: {
    id: string;
    userId: string;
    query: string;
    limit: number;
    offset: number;
    debugRequested: boolean;
    expiresAt: Date;
  }) {
    const result = await this.pool.query<EventSearchJobDatabaseRow>(
      `INSERT INTO event_search_jobs (
        id, user_id, query, result_limit, result_offset, debug_requested,
        expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.id,
        input.userId,
        input.query,
        input.limit,
        input.offset,
        input.debugRequested,
        input.expiresAt,
      ],
    );
    return mapEventSearchJob(result.rows[0]!);
  }

  async markEventSearchJobRunning(jobId: string, userId: string) {
    await this.pool.query(
      `UPDATE event_search_jobs SET status = 'running', updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status = 'queued'`,
      [jobId, userId],
    );
  }

  async completeEventSearchJob(
    jobId: string,
    userId: string,
    result: unknown,
    debugTimings: SearchDebugTimings | null,
  ) {
    await this.pool.query(
      `UPDATE event_search_jobs SET status = 'succeeded', result = $3::jsonb,
         debug_timings = $4::jsonb, error_code = NULL, error_message = NULL,
         updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running')`,
      [
        jobId,
        userId,
        JSON.stringify(result),
        debugTimings ? JSON.stringify(debugTimings) : null,
      ],
    );
  }

  async failEventSearchJob(
    jobId: string,
    userId: string,
    errorCode: string,
    errorMessage: string,
    debugTimings: SearchDebugTimings | null,
  ) {
    await this.pool.query(
      `UPDATE event_search_jobs SET status = 'failed', error_code = $3,
         error_message = $4, debug_timings = $5::jsonb, updated_at = now()
       WHERE id = $1 AND user_id = $2 AND status IN ('queued', 'running')`,
      [
        jobId,
        userId,
        errorCode,
        errorMessage,
        debugTimings ? JSON.stringify(debugTimings) : null,
      ],
    );
  }

  async findEventSearchJob(jobId: string, userId: string) {
    await this.pool.query(
      "DELETE FROM event_search_jobs WHERE expires_at <= now()",
    );
    const result = await this.pool.query<EventSearchJobDatabaseRow>(
      `SELECT * FROM event_search_jobs
       WHERE id = $1 AND user_id = $2 AND expires_at > now()`,
      [jobId, userId],
    );
    return result.rows[0] ? mapEventSearchJob(result.rows[0]) : null;
  }

  async close() {
    await this.pool.end();
  }

  private async seedDevelopmentEvents(reset = false) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      if (reset) {
        await client.query("TRUNCATE reviews, event_tags, events");
      } else {
        const result = await client.query<{ count: number }>(
          "SELECT COUNT(*)::int AS count FROM events",
        );
        if ((result.rows[0]?.count ?? 0) > 0) {
          await client.query("COMMIT");
          return;
        }
      }

      const insertEvent = `INSERT INTO events (
          id, name, date, time, location, distance, image_uri, description,
          detailed_description, latitude, longitude, organizer_name,
          organizer_contact_email
        ) VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`;
      for (const event of DEVELOPMENT_EVENTS) {
        await client.query(insertEvent, [
          event.id,
          event.name,
          event.date,
          event.time,
          event.location,
          event.distance,
          event.imageUri,
          event.description,
          event.detailedDescription,
          event.latitude,
          event.longitude,
          "SPAJAM運営事務局",
          "info@example.com",
        ]);
        for (const tag of event.tags) {
          await client.query(
            "INSERT INTO event_tags (event_id, tag) VALUES ($1, $2)",
            [event.id, tag],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export async function openDatabase(databaseUrl: string, seed = false) {
  const store = new PostgresEventStore(
    new Pool({ connectionString: databaseUrl }),
  );
  await store.initialize(seed);
  return store;
}

type EventDatabaseRow = {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  distance: string;
  image_uri: string | null;
  description: string;
  detailed_description: string;
  latitude: number;
  longitude: number;
  organizer_name: string;
  organizer_contact_email: string | null;
  rating: number;
  review_count: number;
  source_url: string | null;
  starts_at: Date | null;
  ends_at: Date | null;
};

type ReviewDatabaseRow = {
  id: string;
  event_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
  created_at: Date;
  updated_at: Date;
};

type UserDatabaseRow = {
  id: string;
  name: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
};

type AuthSessionDatabaseRow = {
  id: string;
  user_id: string;
  expires_at: Date;
  revoked_at: Date | null;
};

type VisitedEventDatabaseRow = {
  id: string;
  event_name: string;
  visited_date: string;
  rating: number;
};

type PreferenceMemoryDatabaseRow = {
  review_id: string;
  user_id: string;
  event_id: string;
  memory_text: string;
  preference_tags: string[];
  rating: number;
  embedding: string | null;
  embedding_model: string | null;
  embedding_status: "pending" | "ready" | "failed";
  similarity: number | null;
};

type EventSearchJobDatabaseRow = {
  id: string;
  user_id: string;
  query: string;
  result_limit: number;
  result_offset: number;
  debug_requested: boolean;
  debug_timings: SearchDebugTimings | null;
  status: "queued" | "running" | "succeeded" | "failed";
  result: unknown;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
};

type SerializedDiscoveredEvent = Omit<
  DiscoveredEventInput,
  "startsAt" | "endsAt"
> & {
  startsAt: string;
  endsAt: string;
};

function mapEvent(row: EventDatabaseRow): EventRow {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    time: row.time,
    location: row.location,
    distance: row.distance,
    imageUri: row.image_uri,
    description: row.description,
    detailedDescription: row.detailed_description,
    latitude: row.latitude,
    longitude: row.longitude,
    organizerName: row.organizer_name,
    organizerContactEmail: row.organizer_contact_email,
    rating: row.rating,
    reviewCount: row.review_count,
    sourceUrl: row.source_url,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

function mapReview(row: ReviewDatabaseRow): ReviewRow {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUser(row: UserDatabaseRow): UserRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    avatarUrl: row.avatar_url,
  };
}

function mapAuthSession(row: AuthSessionDatabaseRow): AuthSessionRow {
  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

function mapPreferenceMemory(
  row: PreferenceMemoryDatabaseRow,
): PreferenceMemoryRow {
  return {
    reviewId: row.review_id,
    userId: row.user_id,
    eventId: row.event_id,
    memoryText: row.memory_text,
    preferenceTags: row.preference_tags,
    rating: row.rating,
    embedding: row.embedding ? parseVector(row.embedding) : null,
    embeddingModel: row.embedding_model,
    embeddingStatus: row.embedding_status,
    similarity: row.similarity,
  };
}

function mapEventSearchJob(row: EventSearchJobDatabaseRow): EventSearchJobRow {
  return {
    id: row.id,
    userId: row.user_id,
    query: row.query,
    limit: row.result_limit,
    offset: row.result_offset,
    debugRequested: row.debug_requested,
    debugTimings: row.debug_timings,
    status: row.status,
    result: row.result,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

function formatVisitedDate(value: string) {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(value);
  return match
    ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日`
    : value;
}

function escapeLike(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}

function serializeVector(value: number[]) {
  if (value.length !== 768 || value.some((item) => !Number.isFinite(item))) {
    throw new Error("Vector must contain 768 finite values");
  }
  return `[${value.join(",")}]`;
}

function parseVector(value: string) {
  return value.slice(1, -1).split(",").map(Number);
}

function deserializeDiscoveredEvent(
  value: SerializedDiscoveredEvent,
): DiscoveredEventInput {
  return {
    ...value,
    startsAt: new Date(value.startsAt),
    endsAt: new Date(value.endsAt),
  };
}

function formatEventDate(date: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatEventTime(startsAt: Date, endsAt: Date) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatter.format(startsAt)}-${formatter.format(endsAt)}`;
}

const DEVELOPMENT_EVENTS = [
  {
    id: "1",
    name: "SPAJAM 2026 オープニングセレモニー",
    date: "2026/08/08",
    time: "09:00-09:30",
    location: "東京都渋谷区",
    distance: "1.2 km",
    imageUri: "https://via.placeholder.com/400x150?text=Opening+Ceremony",
    description: "SPAJAMのオープニングセレモニーです。全参加者が集まります。",
    detailedDescription:
      "主催者からのウェルカムスピーチと、ハッカソンの進行説明を行います。",
    latitude: 35.6595,
    longitude: 139.7004,
    tags: ["ハッカソン", "開幕", "全参加者向け"],
  },
  {
    id: "2",
    name: "React Native ワークショップ",
    date: "2026/08/08",
    time: "10:00-11:30",
    location: "東京都渋谷区（ワークショップ会場A）",
    distance: "2.1 km",
    imageUri: "https://via.placeholder.com/400x150?text=React+Native",
    description: "React Nativeを使ったモバイル開発の基礎をお学びいただけます。",
    detailedDescription:
      "React NativeとExpoを使い、簡単なモバイル画面を作成します。",
    latitude: 35.6612,
    longitude: 139.7017,
    tags: ["React Native", "ワークショップ"],
  },
  {
    id: "3",
    name: "デザインシステム構築のベストプラクティス",
    date: "2026/08/08",
    time: "11:45-13:00",
    location: "東京都渋谷区（セミナールームB）",
    distance: "3.0 km",
    imageUri: "https://via.placeholder.com/400x150?text=Design+System",
    description: "スケーラブルなデザインシステムの設計方法について学びます。",
    detailedDescription:
      "再利用しやすいデザイン原則とコンポーネント設計を紹介します。",
    latitude: 35.6634,
    longitude: 139.7045,
    tags: ["デザイン", "デザインシステム"],
  },
  {
    id: "4",
    name: "ハッカソンメインラウンド",
    date: "2026/08/08",
    time: "14:00-18:00",
    location: "東京都渋谷区（メイン会場）",
    distance: "0.8 km",
    imageUri: "https://via.placeholder.com/400x150?text=Hackathon",
    description: "チームで協力して、革新的なアプリケーションを開発します。",
    detailedDescription:
      "チームごとにアイデアを形にし、制限時間内でプロトタイプを開発します。",
    latitude: 35.6575,
    longitude: 139.699,
    tags: ["ハッカソン", "開発"],
  },
  {
    id: "5",
    name: "スターアップピッチセッション",
    date: "2026/08/08",
    time: "19:00-20:30",
    location: "東京都渋谷区（ピッチ会場C）",
    distance: "2.5 km",
    imageUri: "https://via.placeholder.com/400x150?text=Pitch+Session",
    description: "ハッカソン参加者による成果発表・ピッチセッション。",
    detailedDescription:
      "参加チームが開発成果を発表し、審査員からフィードバックを受けます。",
    latitude: 35.6556,
    longitude: 139.7065,
    tags: ["ピッチ", "成果発表"],
  },
] as const;
