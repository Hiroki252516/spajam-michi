import { createHash } from "node:crypto";

export type VenueQuality = {
  venueName?: string | null;
  venueVerified?: boolean;
  venueVerifiedAt?: Date | null;
  coordinateSource?: "source_page" | "gsi_address" | null;
  coordinateSourceUrl?: string | null;
  timePrecision?: "date_only" | "datetime" | null;
  hoursText?: string | null;
};

const PREFECTURE = "(?:北海道|東京都|大阪府|京都府|[一-龯]{2,3}県)";

export function normalizeSearchArea(value: string | undefined) {
  const area = value?.normalize("NFKC").replace(/\s+/gu, "").trim();
  return area &&
    area.length <= 80 &&
    new RegExp(
      `^${PREFECTURE}[一-龯ぁ-んァ-ヶー]{1,40}(?:市|区|町|村)$`,
      "u",
    ).test(area)
    ? area
    : null;
}

export function normalizeAddress(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .replace(/[‐‑−–—－]/gu, "-")
    .trim();
}

export function isDetailedAddress(value: string) {
  const address = normalizeAddress(value);
  const prefix = new RegExp(
    `^${PREFECTURE}[^0-9]{1,20}?(?:市(?:[^0-9]{1,12}?区)?|区|町|村)`,
    "u",
  );
  if (!prefix.test(address)) return false;
  const street = address.replace(prefix, "");
  return /[^0-9]+(?:\d+|[一二三四五六七八九十]+(?:丁目|番|号))/u.test(street);
}

export function validVenueCoordinates(latitude: unknown, longitude: unknown) {
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= 20 &&
    latitude <= 46 &&
    longitude >= 122 &&
    longitude <= 154
  );
}

export function isSpecificVenueName(value: string | null | undefined) {
  const name = value?.normalize("NFKC").replace(/\s+/gu, "");
  return Boolean(
    name &&
    !/(?:[市区町村]|周辺|エリア|未定|不明)$/u.test(name) &&
    !/^(?:(?:地下|B)?\d+階)?(?:催会場|会場|特設会場|イベント会場|イベントスペース|屋上|屋外|会場内)$/u.test(
      name,
    ),
  );
}

export function verifiedVenue(
  event: VenueQuality & {
    latitude: number;
    longitude: number;
    location?: string;
  },
  now: Date,
) {
  const checked = event.venueVerifiedAt?.getTime();
  return (
    event.venueVerified === true &&
    checked !== undefined &&
    Number.isFinite(checked) &&
    checked <= now.getTime() + 60_000 &&
    now.getTime() - checked <= 86_400_000 &&
    Boolean(event.coordinateSource) &&
    (isDetailedAddress(event.location ?? "") ||
      isSpecificVenueName(event.venueName)) &&
    validVenueCoordinates(event.latitude, event.longitude)
  );
}

export function eventIdentity(event: {
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  location: string;
}) {
  const normalizedName = event.name
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .toLowerCase();
  return createHash("sha256")
    .update(
      [
        normalizedName,
        event.startsAt?.toISOString(),
        event.endsAt?.toISOString(),
        normalizeAddress(event.location),
      ].join("\n"),
    )
    .digest("hex");
}

export function uniqueEvents<
  T extends {
    name: string;
    startsAt: Date | null;
    endsAt: Date | null;
    location: string;
  },
>(events: T[]) {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = eventIdentity(event);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function neighborhoodName(address: string) {
  if (!new RegExp(`^${PREFECTURE}`, "u").test(normalizeAddress(address)))
    return "会場周辺";
  const text = normalizeAddress(address)
    .replace(new RegExp(`^${PREFECTURE}`, "u"), "")
    .replace(/\d.*$/u, "")
    .replace(/[一二三四五六七八九十]+丁目.*$/u, "");
  return text ? `${text}周辺` : "周辺エリア情報なし";
}

export function closingTime(
  event: VenueQuality & { startsAt: Date | null; endsAt: Date | null },
  now: Date,
) {
  const hours = event.hoursText?.normalize("NFKC");
  if (hours) {
    const ranges = [
      ...hours.matchAll(/(\d{1,2}):(\d{2})\s*[〜～~\-–]\s*(\d{1,2}):(\d{2})/gu),
    ];
    // Weekday/holiday-dependent and multiple-session schedules stay source text.
    if (
      ranges.length !== 1 ||
      /曜|平日|土日|祝|休業|休館|定休|入店制限|のみ|\d{1,2}(?:月|\/)\d{1,2}|[月火水木金土日]\s*[・、〜～~\-]\s*[月火水木金土日]|\d{1,2}時\s*[〜～~\-]\s*\d{1,2}時/u.test(
        hours,
      )
    )
      return null;
    const range = ranges[0]!;
    const start = Number(range[1]) * 60 + Number(range[2]);
    const end = Number(range[3]) * 60 + Number(range[4]);
    if (
      Number(range[1]) > 23 ||
      Number(range[2]) > 59 ||
      Number(range[3]) > 24 ||
      Number(range[4]) > 59 ||
      end > 1440 ||
      start === end
    )
      return null;
    const day = new Date(now.getTime() + 9 * 3_600_000)
      .toISOString()
      .slice(0, 10);
    const dayStart = new Date(`${day}T00:00:00+09:00`).getTime();
    const currentMinute = (now.getTime() - dayStart) / 60_000;
    const wraps = end < start && currentMinute >= end;
    const close = new Date(dayStart + end * 60_000 + (wraps ? 86_400_000 : 0));
    return event.endsAt && event.endsAt < close ? event.endsAt : close;
  }
  return event.timePrecision === "datetime" ? event.endsAt : null;
}
