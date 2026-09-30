export function areaNameFromAddress(location: string) {
  const withoutPrefecture = location
    .trim()
    .replace(/^(?:東京都|北海道|大阪府|京都府|.{2,3}県)/u, "");
  const municipality = withoutPrefecture.match(
    /^([^0-9０-９\s（(]{1,30}?[市区町村])/u,
  )?.[1];
  return municipality ? `${municipality}周辺` : null;
}

export function fallbackSpotName(location: string) {
  return areaNameFromAddress(location) ?? "周辺エリア情報なし";
}

export function formatEventTime(startsAt: Date, endsAt: Date) {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tokyo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const startTime = timeFormatter.format(startsAt);
  const endTime = timeFormatter.format(endsAt);
  if (
    dateFormatter.format(startsAt) === dateFormatter.format(endsAt) &&
    startTime === "00:00" &&
    endTime === "23:59"
  ) {
    return "時間未定";
  }
  return `${startTime}-${endTime}`;
}
