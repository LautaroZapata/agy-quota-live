"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseQuotaSummaryResponse,
  mergeQuotas,
  extractGroupModels,
  inferMeta,
} = require("../src/quota");
const {
  renderHud,
  renderBar,
  stripAnsi,
  visibleLength,
  detectActiveGroupKey,
  detectActiveGroups,
  formatModelParts,
} = require("../src/render");
const {
  normalizeConfig,
  readConfig,
  writeConfig,
  resetConfig,
  cleanupStaleTempFiles,
} = require("../src/config");

const SAMPLE_API_RESPONSE = {
  groups: [
    {
      displayName: "Gemini Models",
      description: "Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Gemini 3.8 Flash",
      buckets: [
        {
          bucketId: "gemini-5h",
          window: "5h",
          remainingFraction: 0.92,
          resetTime: "2026-11-23T05:30:14Z",
        },
        {
          bucketId: "gemini-weekly",
          window: "weekly",
          remainingFraction: 0.96,
          resetTime: "2026-11-29T03:04:55Z",
        },
      ],
    },
    {
      displayName: "Claude and GPT models",
      description: "Models within this group: Claude Opus 5.5, Claude Sonnet 5.5, GPT-OSS 120B",
      buckets: [
        {
          bucketId: "3p-5h",
          window: "5h",
          remainingFraction: 1,
          resetTime: "2026-11-23T05:36:20Z",
        },
        {
          bucketId: "3p-weekly",
          window: "weekly",
          remainingFraction: 1,
          resetTime: "2026-11-30T00:36:20Z",
        },
      ],
    },
    {
      displayName: "Gemini 4 Argon",
      description: "For paid Pro plans, Argon quota is separate.",
      buckets: [
        {
          bucketId: "gemini-argon-wtu-weekly",
          window: "weekly",
          remainingFraction: 1,
          resetTime: "2026-11-30T00:36:20Z",
        },
      ],
    },
  ],
};

test("parseQuotaSummaryResponse extracts groupModels, carbon, disabled, and proto3 0%", () => {
  const buckets = parseQuotaSummaryResponse({
    groups: [
      ...SAMPLE_API_RESPONSE.groups,
      {
        displayName: "Gemini 4 Carbon",
        description: "Models within this group: Gemini 4 Carbon",
        buckets: [
          {
            bucketId: "gemini-carbon-wtu-weekly",
            window: "weekly",
            resetTime: "2026-11-30T00:36:20Z",
          },
          {
            bucketId: "gemini-carbon-disabled-test",
            window: "5h",
            disabled: true,
          },
        ],
      },
    ],
  });

  assert.deepEqual(buckets["gemini-5h"].groupModels, [
    "Gemini 4 Neon",
    "Gemini 4 Hydrogen",
    "Gemini 3.8 Flash",
  ]);
  assert.deepEqual(buckets["3p-5h"].groupModels, [
    "Claude Opus 5.5",
    "Claude Sonnet 5.5",
    "GPT-OSS 120B",
  ]);
  assert.equal(buckets["gemini-carbon-wtu-weekly"].groupKey, "carbon");
  assert.equal(buckets["gemini-carbon-wtu-weekly"].remainingPct, 0);
  assert.equal(buckets["gemini-carbon-disabled-test"].disabled, true);
});

test("detectActiveGroups handles all new models, Ultra Argon fallback, and Orchestrator", () => {
  const proBuckets = parseQuotaSummaryResponse(SAMPLE_API_RESPONSE);
  const ultraBuckets = {
    "gemini-5h": proBuckets["gemini-5h"],
    "gemini-weekly": proBuckets["gemini-weekly"],
    "3p-5h": proBuckets["3p-5h"],
    "3p-weekly": proBuckets["3p-weekly"],
  };

  assert.equal(detectActiveGroupKey("Gemini 4 Neon (XHigh)", proBuckets), "gemini");
  assert.equal(detectActiveGroupKey("Gemini 4 Hydrogen (XHigh)", proBuckets), "gemini");
  assert.equal(detectActiveGroupKey("Gemini 3.8 Flash (High)", proBuckets), "gemini");
  assert.equal(detectActiveGroupKey("Claude Opus 5.5 (High)", proBuckets), "3p");
  assert.equal(detectActiveGroupKey("Claude Sonnet 5.5 (Medium)", proBuckets), "3p");
  assert.equal(detectActiveGroupKey("GPT-OSS 120B (Medium)", proBuckets), "3p");
  assert.equal(detectActiveGroupKey("Gemini 4 Argon (High)", proBuckets), "argon");
  // Ultra plan has no separate argon bucket -> highlights gemini
  assert.equal(detectActiveGroupKey("Gemini 4 Argon (High)", ultraBuckets), "gemini");
  // Carbon without separate bucket falls back to gemini
  assert.equal(detectActiveGroupKey("Gemini 4 Carbon (High)", proBuckets), "gemini");

  // Orchestrator dual highlighting
  const orchArgon = detectActiveGroups("Orchestrator (Argon)", proBuckets);
  assert.equal(orchArgon.primary, "argon");
  assert.equal(orchArgon.secondary, "gemini");

  const orchNeon = detectActiveGroups("Orchestrator (Neon)", proBuckets);
  assert.equal(orchNeon.primary, "gemini");
  assert.equal(orchNeon.secondary, "");

  const orchOpus = detectActiveGroups("Orchestrator (Opus 5.5)", proBuckets);
  assert.equal(orchOpus.primary, "3p");
  assert.equal(orchOpus.secondary, "gemini");
});

test("formatModelParts handles slug IDs, Thinking stripping, and separate effort", () => {
  assert.deepEqual(
    formatModelParts({ display_name: "Claude Opus 5.5 (Thinking)", effort: "max" }),
    { base: "Claude Opus 5.5", suffix: "Max" }
  );
  assert.deepEqual(
    formatModelParts({ id: "gemini-4-hydrogen-xhigh" }),
    { base: "Gemini 4 Hydrogen", suffix: "XHigh" }
  );
  assert.deepEqual(
    formatModelParts({ id: "gemini-pro-orchestrator-neon" }),
    { base: "Orchestrator", suffix: "Neon" }
  );
});

test("renderBar smooth sub-blocks give non-zero visual fill for small percentages", () => {
  const bar6 = stripAnsi(renderBar(6, 8, "", true));
  assert.equal(Array.from(bar6).length, 8);
  assert.notEqual(bar6, "░░░░░░░░");

  const bar92 = stripAnsi(renderBar(92, 4, "", true));
  assert.equal(Array.from(bar92).length, 4);
  assert.notEqual(bar92, "████");
});

test("renderHud respects terminal_width across 2line and 3line modes and shows new models", () => {
  const nowMs = Date.parse("2026-11-23T00:36:20Z");
  const buckets = parseQuotaSummaryResponse(SAMPLE_API_RESPONSE);
  const quotaResult = mergeQuotas({ fetchedAt: nowMs - 2000, buckets }, {}, nowMs);

  for (const layout of ["2line", "3line"]) {
    for (const width of [80, 100, 120, 140, 175]) {
      const payload = {
        model: { display_name: "Gemini 4 Hydrogen (XHigh)", id: "gemini-4-hydrogen-xhigh", effort: "xhigh" },
        plan_tier: "Google AI Pro",
        cycle_mode: "auto",
        context_window: {
          total_input_tokens: 58400,
          context_window_size: 1048576,
          used_percentage: 6,
        },
        workspace: { current_dir: "E:/development" },
        vcs: { branch: "main" },
        agent_state: "idle",
        subagents: [{ name: "research", status: "running" }],
        task_count: 1,
        cost: { total_usd: 0.42 },
        terminal_width: width,
      };
      const out = renderHud(payload, quotaResult, nowMs, {
        config: normalizeConfig({ layout }),
      });
      const lines = out.split("\n");
      assert.equal(lines.length, layout === "3line" ? 3 : 2, `Expected line count for ${layout}`);
      for (const line of lines) {
        assert.ok(
          visibleLength(line) <= width,
          `Line exceeded width ${width} in ${layout}: (${visibleLength(line)}) ${stripAnsi(line)}`
        );
      }
      if (width >= 140) {
        const plain = stripAnsi(out);
        assert.match(plain, /Neon/);
        assert.match(plain, /Hydro/);
        assert.match(plain, /3\.8/);
        assert.match(plain, /Argon/);
      }
    }
  }
});

test("config read/write/reset and stale temp file cleanup work cleanly", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agy-quota-live-test-"));
  const cfgPath = path.join(tmpDir, "agy-quota-live.json");
  try {
    assert.equal(readConfig(cfgPath).layout, "2line");
    const updated = writeConfig({ layout: "3line", smoothBars: false }, cfgPath);
    assert.equal(updated.layout, "3line");
    assert.equal(updated.smoothBars, false);
    assert.equal(readConfig(cfgPath).layout, "3line");

    const reset = resetConfig(cfgPath);
    assert.equal(reset.layout, "2line");
    assert.equal(reset.smoothBars, true);

    const staleTmp = path.join(tmpDir, "agy-quota-live-cache.json.1234.tmp");
    fs.writeFileSync(staleTmp, "{}");
    const removed = cleanupStaleTempFiles(tmpDir, 0);
    assert.equal(removed, 1);
    assert.equal(fs.existsSync(staleTmp), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("visibleLength treats lightning badge as 2 columns and 3line aligns bar widths", () => {
  assert.equal(visibleLength("● Idle ⚡"), 9);
  const nowMs = Date.parse("2026-11-23T00:36:20Z");
  const buckets = parseQuotaSummaryResponse(SAMPLE_API_RESPONSE);
  const quotaResult = mergeQuotas({ fetchedAt: nowMs - 2000, buckets }, {}, nowMs);
  const out = renderHud(
    {
      model: { display_name: "Orchestrator (Neon)", id: "gemini-pro-orchestrator-neon" },
      plan_tier: "Google AI Pro",
      cycle_mode: "auto",
      context_window: { total_input_tokens: 42000, context_window_size: 1048576, used_percentage: 4 },
      agent_state: "idle",
      terminal_width: 120,
    },
    quotaResult,
    nowMs,
    { config: normalizeConfig({ layout: "3line" }) }
  );
  const lines = out.split("\n");
  assert.equal(lines.length, 3);
  assert.ok(stripAnsi(lines[1]).startsWith("▸"));
  assert.ok(stripAnsi(lines[2]).startsWith(" "));
  for (const line of lines) {
    assert.ok(visibleLength(line) <= 120);
  }
});

test("inferMeta and extractGroupModels handle fallback and future models", () => {
  assert.deepEqual(
    extractGroupModels("Models within this group: Gemini 4 Neon, Gemini 4 Hydrogen, Gemini 3.8 Flash."),
    ["Gemini 4 Neon", "Gemini 4 Hydrogen", "Gemini 3.8 Flash"]
  );
  assert.equal(inferMeta("gemini-carbon-wtu-weekly").groupKey, "carbon");
  assert.equal(inferMeta("gemini-argon-wtu-weekly").groupKey, "argon");
  assert.equal(inferMeta("3p-5h").groupKey, "3p");
  assert.equal(inferMeta("gemini-5h").groupKey, "gemini");
});
