import { Pool } from "pg";

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
