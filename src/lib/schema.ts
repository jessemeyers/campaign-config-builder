export const CONFIG_SCHEMA_VERSION = "2026-04";

// Mirrors the currently implemented function behavior:
// - req.type defaults to "pid"
// - req.qty defaults to 1
// - dt defaults to "percentage"
export const campaignConfigSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["campaigns"],
  properties: {
    allowed_codes: { type: "array", items: { type: "string" } },
    disallowed_codes: { type: "array", items: { type: "string" } },
    campaigns: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "label"],
      },
    },
  },
} as const;
