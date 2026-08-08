import assert from "node:assert/strict";
import { it } from "node:test";

import { fetchPublicHtml } from "./safe-fetch.js";

it("blocks localhost and private event-page addresses before fetching", async () => {
  await assert.rejects(
    fetchPublicHtml("http://127.0.0.1:8080/private"),
    /Private or unresolved addresses/u,
  );
  await assert.rejects(
    fetchPublicHtml("http://192.168.1.10/private"),
    /Private or unresolved addresses/u,
  );
});
