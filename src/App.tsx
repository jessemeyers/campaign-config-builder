import { useEffect, useMemo, useState } from "react";
import {
  compactConfig,
  normalizeConfig,
  parseCodeList,
  starterConfig,
  tryParseConfig,
  validateConfig,
} from "./lib/configUtils";
import { CONFIG_SCHEMA_VERSION } from "./lib/schema";
import type { CampaignConfig, Requirement } from "./lib/types";

const DRAFT_STORAGE_KEY = "kb-campaign-config-builder-draft-v1";

function campaignSummary(config: CampaignConfig, index: number): string {
  const campaign = config.campaigns[index];
  return `${index + 1}. ${campaign.label || "Untitled"} (${campaign.name})`;
}

function formatBytes(bytes: number): string {
  return `${bytes.toLocaleString()} bytes (${(bytes / 1024).toFixed(2)} KB)`;
}

function isLocalStorageAvailable(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const testKey = "__kb-campaign-config-builder-test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function loadDraftFromStorage(): { config: CampaignConfig; selectedCampaign: number } | null {
  if (!isLocalStorageAvailable()) return null;

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as { config?: CampaignConfig; selectedCampaign?: number };
    if (!parsed.config) return null;

    const normalizedConfig = normalizeConfig(parsed.config);
    const maxCampaignIndex = Math.max(0, normalizedConfig.campaigns.length - 1);
    const selectedCampaign =
      typeof parsed.selectedCampaign === "number"
        ? Math.min(Math.max(parsed.selectedCampaign, 0), maxCampaignIndex)
        : 0;

    return { config: normalizedConfig, selectedCampaign };
  } catch {
    return null;
  }
}

function App() {
  const initialDraft = loadDraftFromStorage();
  const [config, setConfig] = useState<CampaignConfig>(() => initialDraft?.config ?? normalizeConfig(starterConfig));
  const [selectedCampaign, setSelectedCampaign] = useState(() => initialDraft?.selectedCampaign ?? 0);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const canPersistDraft = useMemo(() => isLocalStorageAvailable(), []);

  const messages = useMemo(() => validateConfig(config), [config]);
  const compact = useMemo(() => compactConfig(config), [config]);
  const compactJson = useMemo(() => JSON.stringify(compact), [compact]);
  const compactJsonBytes = useMemo(() => new TextEncoder().encode(compactJson).length, [compactJson]);

  const selected = config.campaigns[selectedCampaign];

  useEffect(() => {
    if (!canPersistDraft) return;

    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          config,
          selectedCampaign,
        })
      );
    } catch {
      // Ignore persistence failures and keep the editor fully functional.
    }
  }, [canPersistDraft, config, selectedCampaign]);

  function patchSelected(patch: Record<string, unknown>) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      Object.assign(next.campaigns[selectedCampaign], patch);
      return normalizeConfig(next);
    });
  }

  function patchRequirement(index: number, patch: Partial<Requirement>) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      const campaign = next.campaigns[selectedCampaign];
      if (campaign.name !== "BundleDiscount") return prev;
      Object.assign(campaign.reqs[index], patch);
      return normalizeConfig(next);
    });
  }

  function addCampaign() {
    setConfig((prev) => {
      const next = structuredClone(prev);
      next.campaigns.push({
        name: "BundleDiscount",
        label: "New Bundle Campaign",
        amount: 10,
        reqs: [{ qualifiers: [""] }],
      });
      return normalizeConfig(next);
    });
    setSelectedCampaign(config.campaigns.length);
  }

  function duplicateCampaign() {
    if (!selected) return;

    setConfig((prev) => {
      const next = structuredClone(prev);
      const source = next.campaigns[selectedCampaign];
      if (!source) return prev;

      const clone = structuredClone(source);
      clone.label = `${clone.label || "Untitled"} (Copy)`;
      next.campaigns.splice(selectedCampaign + 1, 0, clone);
      return normalizeConfig(next);
    });

    setSelectedCampaign((prev) => prev + 1);
  }

  function deleteCampaign() {
    if (!selected) return;

    const confirmed = window.confirm(
      `Delete campaign "${selected.label || "Untitled"}"? This cannot be undone.`
    );
    if (!confirmed) return;

    setConfig((prev) => {
      const next = structuredClone(prev);
      if (!next.campaigns[selectedCampaign]) return prev;

      next.campaigns.splice(selectedCampaign, 1);
      return normalizeConfig(next);
    });

    setSelectedCampaign((prev) => {
      const nextLength = config.campaigns.length - 1;
      if (nextLength <= 0) return 0;
      return Math.min(prev, nextLength - 1);
    });
  }

  function moveCampaign(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= config.campaigns.length || fromIndex === toIndex) return;

    setConfig((prev) => {
      const next = structuredClone(prev);
      const [moved] = next.campaigns.splice(fromIndex, 1);
      if (!moved) return prev;
      next.campaigns.splice(toIndex, 0, moved);
      return normalizeConfig(next);
    });

    setSelectedCampaign((prev) => {
      if (prev === fromIndex) return toIndex;
      if (fromIndex < prev && prev <= toIndex) return prev - 1;
      if (toIndex <= prev && prev < fromIndex) return prev + 1;
      return prev;
    });
  }

  function addRequirement() {
    setConfig((prev) => {
      const next = structuredClone(prev);
      const campaign = next.campaigns[selectedCampaign];
      if (campaign.name !== "BundleDiscount") return prev;
      campaign.reqs.push({ qualifiers: [""] });
      return normalizeConfig(next);
    });
  }

  function removeRequirement(index: number) {
    setConfig((prev) => {
      const next = structuredClone(prev);
      const campaign = next.campaigns[selectedCampaign];
      if (campaign.name !== "BundleDiscount") return prev;
      campaign.reqs.splice(index, 1);
      return normalizeConfig(next);
    });
  }

  function importJson() {
    const parsed = tryParseConfig(importText);
    if (!parsed.config) {
      setImportError(parsed.error || "Unable to parse JSON");
      return;
    }
    setImportError("");
    setConfig(parsed.config);
    setSelectedCampaign(0);
  }

  function clearConfig() {
    const confirmed = window.confirm("Clear current config and start from the default starter config?");
    if (!confirmed) return;

    setConfig(normalizeConfig(starterConfig));
    setSelectedCampaign(0);
    setImportText("");
    setImportError("");

    if (!canPersistDraft) return;

    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      // Ignore storage cleanup failures.
    }
  }

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Campaign Config Builder</h1>
          <p>Schema v{CONFIG_SCHEMA_VERSION} • Matches current Shopify Function runtime defaults.</p>
        </div>
        <div className="row-inline">
          <button className="primary" onClick={addCampaign}>Add Campaign</button>
          <button className="danger" onClick={clearConfig}>Clear Config</button>
        </div>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Top-Level Settings</h2>
          <label>
            Allowed Codes (comma-separated)
            <input
              value={(config.allowed_codes || []).join(", ")}
              onChange={(event) =>
                setConfig((prev) => normalizeConfig({ ...prev, allowed_codes: parseCodeList(event.target.value) }))
              }
            />
          </label>
          <label>
            Disallowed Codes (comma-separated)
            <input
              value={(config.disallowed_codes || []).join(", ")}
              onChange={(event) =>
                setConfig((prev) =>
                  normalizeConfig({ ...prev, disallowed_codes: parseCodeList(event.target.value) })
                )
              }
            />
          </label>

          <h3>Campaigns</h3>
          <ul className="campaign-list">
            {config.campaigns.map((_, index) => (
              <li key={index}>
                <div className="campaign-row">
                  <button
                    className={selectedCampaign === index ? "selected" : ""}
                    onClick={() => setSelectedCampaign(index)}
                  >
                    {campaignSummary(config, index)}
                  </button>
                  <div className="row-inline campaign-move-actions">
                    <button
                      aria-label={`Move campaign ${index + 1} up`}
                      title={`Move campaign ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveCampaign(index, index - 1)}
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move campaign ${index + 1} down`}
                      title={`Move campaign ${index + 1} down`}
                      disabled={index === config.campaigns.length - 1}
                      onClick={() => moveCampaign(index, index + 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Campaign Editor</h2>
          {selected ? (
            <>
              <div className="row-spread">
                <h3>Selected Campaign</h3>
                <div className="row-inline">
                  <button onClick={duplicateCampaign}>Duplicate Campaign</button>
                  <button className="danger" onClick={deleteCampaign}>Delete Campaign</button>
                </div>
              </div>
              <label>
                Name
                <select
                  value={selected.name}
                  onChange={(event) =>
                    patchSelected({
                      name: event.target.value,
                    })
                  }
                >
                  <option value="BundleDiscount">BundleDiscount</option>
                  <option value="TieredDiscount">TieredDiscount</option>
                </select>
              </label>
              <label>
                Label
                <input value={selected.label} onChange={(event) => patchSelected({ label: event.target.value })} />
              </label>
              <label>
                Campaign Allowed Codes (comma-separated)
                <input
                  value={(selected.allowed_codes || []).join(", ")}
                  onChange={(event) => patchSelected({ allowed_codes: parseCodeList(event.target.value) })}
                />
              </label>
              <label>
                Campaign Disallowed Codes (comma-separated)
                <input
                  value={(selected.disallowed_codes || []).join(", ")}
                  onChange={(event) => patchSelected({ disallowed_codes: parseCodeList(event.target.value) })}
                />
              </label>
              <label>
                Discount Type (dt)
                <select value={selected.dt || "percentage"} onChange={(event) => patchSelected({ dt: event.target.value })}>
                  <option value="percentage">percentage</option>
                  <option value="fixed">fixed</option>
                </select>
              </label>

              {selected.name === "BundleDiscount" && (
                <>
                  <label>
                    Amount
                    <input
                      type="number"
                      step="0.001"
                      value={selected.amount ?? 0}
                      onChange={(event) => patchSelected({ amount: Number(event.target.value) })}
                    />
                  </label>

                  <div className="row-spread">
                    <h3>Requirements</h3>
                    <button onClick={addRequirement}>Add Requirement</button>
                  </div>

                  {selected.reqs.map((req, idx) => (
                    <div key={idx} className="req-card">
                      <div className="row-spread">
                        <strong>Req {idx + 1}</strong>
                        <button className="danger" onClick={() => removeRequirement(idx)}>
                          Remove
                        </button>
                      </div>
                      <label>
                        Type
                        <select
                          value={req.type || "pid"}
                          onChange={(event) => patchRequirement(idx, { type: event.target.value as Requirement["type"] })}
                        >
                          <option value="pid">pid (default)</option>
                          <option value="tag">tag</option>
                        </select>
                      </label>
                      <label>
                        Qty
                        <input
                          type="number"
                          min={1}
                          value={req.qty ?? 1}
                          onChange={(event) => patchRequirement(idx, { qty: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Req Discount Type (dt)
                        <select
                          value={req.dt || ""}
                          onChange={(event) =>
                            patchRequirement(idx, {
                              dt: event.target.value ? (event.target.value as Requirement["dt"]) : undefined,
                            })
                          }
                        >
                          <option value="">Inherit campaign dt</option>
                          <option value="percentage">percentage</option>
                          <option value="fixed">fixed</option>
                        </select>
                      </label>
                      <label>
                        Req Amount (optional override)
                        <input
                          type="number"
                          step="0.001"
                          value={req.amount ?? ""}
                          onChange={(event) =>
                            patchRequirement(idx, {
                              amount: event.target.value === "" ? undefined : Number(event.target.value),
                            })
                          }
                        />
                        <span className="hint">Leave blank to use campaign amount.</span>
                      </label>
                      <label>
                        Qualifiers (one per line)
                        <textarea
                          rows={5}
                          value={(req.qualifiers || []).join("\n")}
                          onChange={(event) =>
                            patchRequirement(idx, {
                              qualifiers: event.target.value.split("\n").map((q) => q.trim()).filter(Boolean),
                            })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </>
              )}
            </>
          ) : (
            <p>Add or select a campaign to begin.</p>
          )}
        </section>

        <section className="panel">
          <h2>Import / Export</h2>
          <label>
            Import JSON
            <textarea
              rows={8}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste existing config JSON here"
            />
          </label>
          <div className="row-spread">
            <button onClick={importJson}>Import</button>
            {importError ? <span className="error">{importError}</span> : null}
          </div>

          <label>
            Compact JSON (copy this)
            <span className="hint">Size: {formatBytes(compactJsonBytes)}</span>
            <textarea rows={14} readOnly value={compactJson} />
          </label>
        </section>
      </main>

      <section className="panel messages">
        <h2>Validation</h2>
        {messages.length === 0 ? <p className="ok">No validation issues.</p> : null}
        <ul>
          {messages.map((msg, index) => (
            <li key={`${msg.path}-${index}`} className={msg.level}>
              <code>{msg.path}</code> {msg.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default App;
