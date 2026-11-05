// creative-lab :: minimal JSON-Schema validator (subset) — zero dependencies.
// Supports: type (incl. arrays of types), enum, const, required, properties,
// additionalProperties (bool | schema), items, minItems, maxItems, uniqueItems,
// minimum, maximum, minLength, maxLength, pattern, oneOf/anyOf (first-match), $ref
// to "#/$defs/x", and an "x-enumRef" extension resolved against config/taxonomy.json
// so DNA/style enums live in one place.

import { labPath, readJson } from "./util.mjs";

let _tax;
export function taxonomy() {
  return (_tax ??= readJson(labPath("config/taxonomy.json")));
}

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const typeOk = (v, t) => {
  const tv = typeOf(v);
  if (t === "number") return tv === "number" || tv === "integer";
  return tv === t;
};

export function validate(schema, value, { root = schema, path = "$", errors = [] } = {}) {
  if (schema === true || schema === undefined) return errors;
  if (schema === false) {
    errors.push(`${path}: not allowed`);
    return errors;
  }
  if (schema.$ref) {
    const m = schema.$ref.match(/^#\/\$defs\/(.+)$/);
    if (!m || !root.$defs?.[m[1]]) {
      errors.push(`${path}: bad $ref ${schema.$ref}`);
      return errors;
    }
    return validate(root.$defs[m[1]], value, { root, path, errors });
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeOk(value, t))) {
      errors.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  const en = schema.enum || (schema["x-enumRef"] ? taxonomy()[schema["x-enumRef"]]?.map((x) => (typeof x === "object" ? x.id : x)) : null);
  if (en && value !== null && !en.includes(value)) errors.push(`${path}: "${value}" not in ${schema["x-enumRef"] ? `taxonomy.${schema["x-enumRef"]}` : "enum"} [${en.slice(0, 12).join(", ")}${en.length > 12 ? ", …" : ""}]`);
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: must equal ${JSON.stringify(schema.const)}`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: longer than ${schema.maxLength} (${value.length})`);
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: < ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: > ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: needs ≥${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: max ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((x) => JSON.stringify(x))).size !== value.length) errors.push(`${path}: items must be unique`);
    if (schema.items) value.forEach((v, i) => validate(schema.items, v, { root, path: `${path}[${i}]`, errors }));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const k of schema.required || []) if (value[k] === undefined) errors.push(`${path}.${k}: required`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) validate(props[k], v, { root, path: `${path}.${k}`, errors });
      else if (schema.additionalProperties === false) errors.push(`${path}.${k}: unknown field`);
      else if (typeof schema.additionalProperties === "object") validate(schema.additionalProperties, v, { root, path: `${path}.${k}`, errors });
    }
  }
  for (const key of ["anyOf", "oneOf"]) {
    if (schema[key]) {
      const ok = schema[key].some((s) => validate(s, value, { root, path, errors: [] }).length === 0);
      if (!ok) errors.push(`${path}: matches none of ${key}`);
    }
  }
  return errors;
}

const cache = new Map();
export function loadSchema(name) {
  if (!cache.has(name)) cache.set(name, readJson(labPath(`schemas/${name}.schema.json`)));
  return cache.get(name);
}

export function validateAs(name, value) {
  const s = loadSchema(name);
  return validate(s, value, { root: s });
}

export function assertValid(name, value) {
  const errs = validateAs(name, value);
  if (errs.length) {
    const e = new Error(`${name} invalid:\n  - ${errs.slice(0, 25).join("\n  - ")}${errs.length > 25 ? `\n  … ${errs.length - 25} more` : ""}`);
    e.code = "SCHEMA";
    e.errors = errs;
    throw e;
  }
  return value;
}
