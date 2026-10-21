const TYPE_VALUES = ["null", "boolean", "object", "array", "number", "string", "integer"];

function asSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

function visit(previous, next, path, changes) {
  if (!previous || !next || typeof previous !== "object" || typeof next !== "object") return;
  if (previous.type && next.type && previous.type !== next.type) changes.push({ path, code: "type_changed", breaking: true });
  if (Object.hasOwn(previous, "const") && previous.const !== next.const) changes.push({ path, code: "const_changed", breaking: true });
  if (Array.isArray(previous.enum) && Array.isArray(next.enum)) {
    const nextValues = new Set(next.enum);
    if (previous.enum.some((value) => !nextValues.has(value))) changes.push({ path, code: "enum_narrowed", breaking: true });
  }
  const previousRequired = asSet(previous.required);
  const nextRequired = asSet(next.required);
  for (const key of nextRequired) if (!previousRequired.has(key)) changes.push({ path: `${path}.${key}`, code: "required_added", breaking: true });
  for (const [key, schema] of Object.entries(previous.properties ?? {})) {
    if (!(key in (next.properties ?? {}))) changes.push({ path: `${path}.${key}`, code: "property_removed", breaking: true });
    else visit(schema, next.properties[key], `${path}.${key}`, changes);
  }
  if (previous.additionalProperties !== false && next.additionalProperties === false) changes.push({ path, code: "unknown_properties_disallowed", breaking: true });
  if (previous.minimum !== undefined && next.minimum !== undefined && next.minimum > previous.minimum) changes.push({ path, code: "minimum_raised", breaking: true });
  if (previous.maximum !== undefined && next.maximum !== undefined && next.maximum < previous.maximum) changes.push({ path, code: "maximum_lowered", breaking: true });
}

export function compareSchemas(previous, next) {
  const changes = [];
  visit(previous, next, "$", changes);
  return Object.freeze({ compatible: changes.every((change) => !change.breaking), changes: Object.freeze(changes.map(Object.freeze)) });
}

export function isSemVer(value) {
  return typeof value === "string" && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

export const JSON_SCHEMA_TYPES = Object.freeze(TYPE_VALUES);
