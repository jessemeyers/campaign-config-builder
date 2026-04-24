import { useMemo, useState } from "react";
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

function campaignSummary(config: CampaignConfig, index: number): string {
  const campaign = config.campaigns[index];
  return `${index + 1}. ${campaign.label || "Untitled"} (${campaign.name})`;
}

function App() {
  const [config, setConfig] = useState<CampaignConfig>(() => normalizeConfig(starterConfig));
  const [selectedCampaign, setSelectedCampaign] = useState(0);
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");

  const messages = useMemo(() => validateConfig(config), [config]);
  const compact = useMemo(() => compactConfig(config), [config]);

  const selected = config.campaigns[selectedCampaign];

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

  return (
    <div className="layout">
      <header className="topbar">
        <div>
          <h1>Campaign Config Builder</h1>
          <p>Schema v{CONFIG_SCHEMA_VERSION} • Matches current Shopify Function runtime defaults.</p>
        </div>
        <button className="primary" onClick={addCampaign}>Add Campaign</button>
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
                <button
                  className={selectedCampaign === index ? "selected" : ""}
                  onClick={() => setSelectedCampaign(index)}
                >
                  {campaignSummary(config, index)}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2>Campaign Editor</h2>
          {selected ? (
            <>
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
            <textarea rows={14} readOnly value={JSON.stringify(compact)} />
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
