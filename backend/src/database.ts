import { Pool } from "pg";

export type EventRow = {
  id: string;
  name: string;
  date: string;
  time: string;
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
  close(): Promise<void>;
}

export class PostgresEventStore implements EventStore {
  constructor(private readonly pool: Pool) {}

  async initialize(seed = false) {
    await this.pool.query(`
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

      CREATE INDEX IF NOT EXISTS events_name_index ON events(name);
      CREATE INDEX IF NOT EXISTS events_location_index ON events(location);
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

  async close() {
    await this.pool.end();
  }

  private async seedDevelopmentEvents() {
    const result = await this.pool.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM events",
    );
    if ((result.rows[0]?.count ?? 0) > 0) return;

    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO events (
          id, name, date, time, location, distance, image_uri, description,
          detailed_description, latitude, longitude, organizer_name,
          organizer_contact_email
        ) VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13),
          ($14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          "1",
          "SPAJAM 2026 オープニングセレモニー",
          "2026/08/08",
          "09:00-09:30",
          "東京都渋谷区",
          "1.2 km",
          "https://example.com/images/event-1.jpg",
          "SPAJAMのオープニングセレモニーです。全参加者が集まります。",
          "主催者からのウェルカムスピーチと、ハッカソンの進行説明を行います。",
          35.6595,
          139.7004,
          "SPAJAM運営事務局",
          "info@example.com",
          "2",
          "React Native ワークショップ",
          "2026/08/08",
          "10:00-11:30",
          "東京都渋谷区（ワークショップ会場A）",
          "2.1 km",
          "https://example.com/images/event-2.jpg",
          "React Nativeを使ったモバイル開発の基礎を学べます。",
          "React NativeとExpoを使い、簡単なモバイル画面を作成します。",
          35.6612,
          139.7017,
          "SPAJAM運営事務局",
          "info@example.com",
        ],
      );
      await client.query(
        `INSERT INTO event_tags (event_id, tag) VALUES
          ('1', 'ハッカソン'), ('1', '開幕'), ('1', '全参加者向け'),
          ('2', 'React Native'), ('2', 'ワークショップ')`,
      );
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

function escapeLike(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}
