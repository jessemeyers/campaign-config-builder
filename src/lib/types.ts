export type DiscountType = "percentage" | "fixed";
export type ReqType = "pid" | "tag";

export interface Requirement {
  type?: ReqType;
  qty?: number;
  qualifiers: string[];
  dt?: DiscountType;
  amount?: number;
}

export interface Tier {
  qty: number;
  dt?: DiscountType;
  amount: number;
  message: string;
}

export interface BaseCampaign {
  name: "BundleDiscount" | "TieredDiscount";
  label: string;
  allowed_codes?: string[];
  disallowed_codes?: string[];
  dt?: DiscountType;
  amount?: number;
  max_applications_per_order?: number;
}

export interface BundleCampaign extends BaseCampaign {
  name: "BundleDiscount";
  reqs: Requirement[];
}

export interface TieredCampaign extends BaseCampaign {
  name: "TieredDiscount";
  product_tag: string;
  tiers: Tier[];
}

export type Campaign = BundleCampaign | TieredCampaign;

export interface CampaignConfig {
  allowed_codes?: string[];
  disallowed_codes?: string[];
  campaigns: Campaign[];
}

export interface ValidationMessage {
  path: string;
  message: string;
  level: "error" | "warning";
}
