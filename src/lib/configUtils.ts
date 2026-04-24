import type {
  Campaign,
  CampaignConfig,
  Requirement,
  Tier,
  ValidationMessage,
} from "./types";

export function parseCodeList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizeRequirement(req: Requirement, campaignDt?: string): Requirement {
  const normalized: Requirement = {
    ...req,
    type: req.type ?? "pid",
    qty: Number(req.qty ?? 1),
    qualifiers: unique(req.qualifiers || []),
    dt: req.dt ?? (campaignDt as Requirement["dt"]) ?? "percentage",
  };

  if (normalized.amount !== undefined) {
    normalized.amount = Number(normalized.amount);
  }

  if (normalized.amount === undefined || Number.isNaN(normalized.amount)) {
    delete normalized.amount;
  }

  return normalized;
}

function normalizeTier(tier: Tier, campaignDt?: string): Tier {
  return {
    ...tier,
    qty: Number(tier.qty ?? 0),
    amount: Number(tier.amount ?? 0),
    dt: tier.dt ?? (campaignDt as Tier["dt"]) ?? "percentage",
    message: (tier.message || "").trim(),
  };
}

function normalizeCampaign(campaign: Campaign): Campaign {
  const base = {
    ...campaign,
    label: (campaign.label || "").trim(),
    allowed_codes: unique(campaign.allowed_codes || []),
    disallowed_codes: unique(campaign.disallowed_codes || []),
    dt: campaign.dt ?? "percentage",
  } as Campaign;

  if (base.allowed_codes && base.allowed_codes.length === 0) delete base.allowed_codes;
  if (base.disallowed_codes && base.disallowed_codes.length === 0) delete base.disallowed_codes;

  if (base.name === "BundleDiscount") {
    base.amount = Number(base.amount ?? 0);
    base.reqs = (base.reqs || []).map((req) => normalizeRequirement(req, base.dt));
  }

  if (base.name === "TieredDiscount") {
    base.product_tag = (base.product_tag || "").trim();
    base.tiers = (base.tiers || []).map((tier) => normalizeTier(tier, base.dt));
  }

  return base;
}

export function normalizeConfig(config: CampaignConfig): CampaignConfig {
  return {
    allowed_codes: unique(config.allowed_codes || []),
    disallowed_codes: unique(config.disallowed_codes || []),
    campaigns: (config.campaigns || []).map((campaign) => normalizeCampaign(campaign)),
  };
}

export function compactConfig(config: CampaignConfig): CampaignConfig {
  const normalized = normalizeConfig(config);

  return {
    ...(normalized.allowed_codes && normalized.allowed_codes.length
      ? { allowed_codes: normalized.allowed_codes }
      : {}),
    ...(normalized.disallowed_codes && normalized.disallowed_codes.length
      ? { disallowed_codes: normalized.disallowed_codes }
      : {}),
    campaigns: normalized.campaigns.map((campaign) => {
      const compactCampaign: Record<string, unknown> = {
        name: campaign.name,
        label: campaign.label,
      };

      if (campaign.allowed_codes?.length) compactCampaign.allowed_codes = campaign.allowed_codes;
      if (campaign.disallowed_codes?.length) compactCampaign.disallowed_codes = campaign.disallowed_codes;
      if (campaign.dt && campaign.dt !== "percentage") compactCampaign.dt = campaign.dt;
      if (campaign.max_applications_per_order) {
        compactCampaign.max_applications_per_order = campaign.max_applications_per_order;
      }

      if (campaign.name === "BundleDiscount") {
        compactCampaign.amount = campaign.amount;
        compactCampaign.reqs = campaign.reqs.map((req) => {
          const compactReq: Record<string, unknown> = {
            qualifiers: req.qualifiers,
          };
          if (req.type && req.type !== "pid") compactReq.type = req.type;
          if (req.qty && req.qty !== 1) compactReq.qty = req.qty;
          if (req.dt && req.dt !== campaign.dt && req.dt !== "percentage") compactReq.dt = req.dt;
          if (req.amount !== undefined) compactReq.amount = req.amount;
          return compactReq;
        });
      }

      if (campaign.name === "TieredDiscount") {
        compactCampaign.product_tag = campaign.product_tag;
        compactCampaign.tiers = campaign.tiers.map((tier) => {
          const compactTier: Record<string, unknown> = {
            qty: tier.qty,
            amount: tier.amount,
            message: tier.message,
          };
          if (tier.dt && tier.dt !== campaign.dt && tier.dt !== "percentage") compactTier.dt = tier.dt;
          return compactTier;
        });
      }

      return compactCampaign as unknown as Campaign;
    }),
  };
}

export function validateConfig(config: CampaignConfig): ValidationMessage[] {
  const messages: ValidationMessage[] = [];

  if (!Array.isArray(config.campaigns) || config.campaigns.length === 0) {
    messages.push({ path: "campaigns", message: "At least one campaign is required.", level: "error" });
    return messages;
  }

  for (let i = 0; i < config.campaigns.length; i++) {
    const campaign = config.campaigns[i];
    const basePath = `campaigns[${i}]`;

    if (!campaign.label?.trim()) {
      messages.push({ path: `${basePath}.label`, message: "Label is required.", level: "error" });
    }

    if (campaign.dt && campaign.dt !== "percentage" && campaign.dt !== "fixed") {
      messages.push({ path: `${basePath}.dt`, message: "dt must be 'percentage' or 'fixed'.", level: "error" });
    }

    if (campaign.name === "BundleDiscount") {
      if (typeof campaign.amount !== "number" || campaign.amount <= 0) {
        messages.push({ path: `${basePath}.amount`, message: "Bundle amount must be > 0.", level: "error" });
      }

      if (!Array.isArray(campaign.reqs) || campaign.reqs.length === 0) {
        messages.push({ path: `${basePath}.reqs`, message: "At least one req is required.", level: "error" });
      } else {
        for (let r = 0; r < campaign.reqs.length; r++) {
          const req = campaign.reqs[r];
          const reqPath = `${basePath}.reqs[${r}]`;

          if (!Array.isArray(req.qualifiers) || req.qualifiers.length === 0) {
            messages.push({ path: `${reqPath}.qualifiers`, message: "At least one qualifier is required.", level: "error" });
          }

          if (req.qty !== undefined && (!Number.isInteger(req.qty) || req.qty < 1)) {
            messages.push({ path: `${reqPath}.qty`, message: "qty must be an integer >= 1.", level: "error" });
          }

          if (req.type && req.type !== "pid" && req.type !== "tag") {
            messages.push({ path: `${reqPath}.type`, message: "type must be 'pid' or 'tag'.", level: "error" });
          }

          if (req.dt && req.dt !== "percentage" && req.dt !== "fixed") {
            messages.push({ path: `${reqPath}.dt`, message: "dt must be 'percentage' or 'fixed'.", level: "error" });
          }

          if (req.amount !== undefined && (typeof req.amount !== "number" || req.amount <= 0)) {
            messages.push({ path: `${reqPath}.amount`, message: "amount must be > 0 when provided.", level: "error" });
          }
        }
      }
    }

    if (campaign.name === "TieredDiscount") {
      if (!campaign.product_tag?.trim()) {
        messages.push({ path: `${basePath}.product_tag`, message: "product_tag is required for TieredDiscount.", level: "error" });
      }

      if (!Array.isArray(campaign.tiers) || campaign.tiers.length === 0) {
        messages.push({ path: `${basePath}.tiers`, message: "At least one tier is required.", level: "error" });
      } else {
        for (let t = 0; t < campaign.tiers.length; t++) {
          const tier = campaign.tiers[t];
          const tierPath = `${basePath}.tiers[${t}]`;
          if (!Number.isInteger(tier.qty) || tier.qty < 1) {
            messages.push({ path: `${tierPath}.qty`, message: "qty must be an integer >= 1.", level: "error" });
          }
          if (typeof tier.amount !== "number" || tier.amount <= 0) {
            messages.push({ path: `${tierPath}.amount`, message: "amount must be > 0.", level: "error" });
          }
          if (!tier.message?.trim()) {
            messages.push({ path: `${tierPath}.message`, message: "message is required.", level: "error" });
          }
        }

        for (let t = 1; t < campaign.tiers.length; t++) {
          if (campaign.tiers[t].qty > campaign.tiers[t - 1].qty) {
            messages.push({
              path: `${basePath}.tiers`,
              message: "Tiers should be sorted descending by qty.",
              level: "warning",
            });
            break;
          }
        }
      }
    }

    if (campaign.name !== "BundleDiscount" && campaign.name !== "TieredDiscount") {
      messages.push({
        path: `${basePath}.name`,
        message: "Campaign name must be BundleDiscount or TieredDiscount.",
        level: "error",
      });
    }

    if (
      !campaign.allowed_codes?.length &&
      !campaign.disallowed_codes?.length &&
      !config.allowed_codes?.length &&
      !config.disallowed_codes?.length
    ) {
      messages.push({
        path: basePath,
        message:
          "No allowed/disallowed codes are configured at either level. With entered discount codes, this campaign will be blocked by runtime rules.",
        level: "warning",
      });
    }
  }

  return messages;
}

export function tryParseConfig(raw: string): { config?: CampaignConfig; error?: string } {
  try {
    const parsed = JSON.parse(raw) as CampaignConfig;
    if (!parsed || typeof parsed !== "object") {
      return { error: "JSON root must be an object." };
    }
    return { config: normalizeConfig(parsed) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown parse error";
    return { error: message };
  }
}

export const starterConfig: CampaignConfig = {
  allowed_codes: ["SRBC"],
  campaigns: [
    {
      name: "BundleDiscount",
      label: "Starter Bundle",
      amount: 25,
      reqs: [
        {
          qualifiers: ["1234567890"],
        },
      ],
    },
  ],
};
