export function buildSearchArea(address: {
  region?: string | null;
  city?: string | null;
  district?: string | null;
  subregion?: string | null;
}) {
  const region = address.region?.normalize("NFKC").trim() || "";
  const city =
    [address.city, address.subregion]
      .map((value) => value?.normalize("NFKC").trim() || "")
      .find((value) => /[市区町村]$/u.test(value)) || "";
  const subregion = address.subregion?.normalize("NFKC").trim() || "";
  const district = address.district?.normalize("NFKC").trim() || "";
  if (!region || !city || !/[市区町村]$/u.test(city)) return null;
  let area = city.startsWith(region) ? city : `${region}${city}`;
  if (
    /[市郡]$/u.test(subregion) &&
    /[区町村]$/u.test(city) &&
    !area.includes(subregion)
  )
    area = `${region}${subregion}${city}`;
  // district may be a neighborhood such as 山下町. Only administrative wards belong here.
  if (district && /区$/u.test(district) && !area.includes(district)) {
    const municipality = city.replace(region, "");
    area += district.startsWith(municipality)
      ? district.slice(municipality.length)
      : district;
  }
  return area.length <= 80 ? area : null;
}
