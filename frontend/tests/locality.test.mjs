import assert from "node:assert/strict";
import { it } from "node:test";
import { buildSearchArea } from "../src/services/locality.ts";
it("uses address components without repeating municipality or using a landmark", () => {
  assert.equal(
    buildSearchArea({
      region: "神奈川県",
      city: "横浜市",
      district: "中区",
      name: "中区役所",
    }),
    "神奈川県横浜市中区",
  );
  assert.equal(
    buildSearchArea({
      region: "神奈川県",
      city: "横浜市中区",
      district: "中区",
    }),
    "神奈川県横浜市中区",
  );
  assert.equal(
    buildSearchArea({ region: "東京都", city: "渋谷区", district: "神南" }),
    "東京都渋谷区",
  );
  assert.equal(buildSearchArea({ region: "東京都", name: "東京駅" }), null);
  assert.equal(buildSearchArea({ city: "渋谷区" }), null);
  assert.equal(
    buildSearchArea({
      region: "神奈川県",
      city: "横浜市中区",
      district: "山下町",
    }),
    "神奈川県横浜市中区",
  );
  assert.equal(
    buildSearchArea({
      region: "神奈川県",
      city: "港北区",
      subregion: "横浜市",
    }),
    "神奈川県横浜市港北区",
  );
  assert.equal(
    buildSearchArea({
      region: "神奈川県",
      city: "横浜市",
      district: "横浜市港北区",
    }),
    "神奈川県横浜市港北区",
  );
  assert.equal(
    buildSearchArea({ region: "北海道", city: "当別町", subregion: "石狩郡" }),
    "北海道石狩郡当別町",
  );
  assert.equal(
    buildSearchArea({
      region: "東京都",
      city: "東京都",
      subregion: "千代田区",
    }),
    "東京都千代田区",
  );
});
