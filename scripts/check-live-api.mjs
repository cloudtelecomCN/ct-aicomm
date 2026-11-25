import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { parse } from "yaml";

const specification = parse(await readFile(new URL("../openapi/public-api-v0.2.yaml", import.meta.url), "utf8"));
const origin = process.argv[2] ?? specification.servers[0].url;
const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addKeyword("components");

const validators = new Map();
for (const [route, operations] of Object.entries(specification.paths)) {
  assert.deepEqual(Object.keys(operations), ["get"], route);
  for (const [code, response] of Object.entries(operations.get.responses)) {
    const schema = response.content["application/json"].schema;
    validators.set(`${route} ${code}`, ajv.compile({ ...schema, components: specification.components }));
  }
}

async function check(route, { requestPath = route, status = 200 } = {}) {
  const response = await fetch(new URL(requestPath, origin), { signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, status, requestPath);
  assert.match(response.headers.get("content-type") || "", /^application\/json(?:;|$)/iu, requestPath);
  const value = await response.json();
  const validate = validators.get(`${route} ${status}`);
  assert.ok(validate(value), `${requestPath}: ${ajv.errorsText(validate.errors)}`);
  console.log(`${status} ${requestPath}`);
  return value;
}

const scenarioRoute = "/api/v1/bench/scenarios";
const registryRoute = "/api/v1/protocols";
const detailRoute = "/api/v1/protocols/{slug}";
const { scenarios, count: scenarioCount } = await check(scenarioRoute);
assert.equal(scenarios.length, scenarioCount);
const { protocols, count } = await check(registryRoute);
assert.equal(protocols.length, count);
assert.ok(protocols.length > 0, "At least one published protocol is required for the detail response check.");
for (const { slug } of protocols) {
  const { protocol } = await check(detailRoute, { requestPath: `${registryRoute}/${encodeURIComponent(slug)}` });
  assert.equal(protocol.slug, slug);
}
await check(registryRoute, { requestPath: `${registryRoute}?category=invalid-contract-filter`, status: 400 });
await check(detailRoute, { requestPath: `${registryRoute}/does-not-exist-contract-check`, status: 404 });
