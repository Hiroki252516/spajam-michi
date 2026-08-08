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
