/**
 * ui.ts – Pretty terminal output helpers built on chalk.
 */

import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import type { AgentEvent, SessionSummary, SessionDetail } from "./api.js";

// ── Brand colours ────────────────────────────────────────────────────────────
const brand   = chalk.hex("#7C3AED");      // violet-600
const subtle  = chalk.hex("#94A3B8");      // slate-400
const success = chalk.hex("#10B981");      // emerald-500
const warn    = chalk.hex("#F59E0B");      // amber-500
const danger  = chalk.hex("#EF4444");      // red-500
const muted   = chalk.hex("#64748B");      // slate-500
const bright  = chalk.hex("#E2E8F0");      // slate-200

// ── Header / dividers ────────────────────────────────────────────────────────

export function printBanner() {
  console.log();
  console.log(brand.bold("  ┌─────────────────────────────────────┐"));
  console.log(brand.bold("  │   ✦  OpenWorker  Spring-AI  CLI  ✦  │"));
  console.log(brand.bold("  └─────────────────────────────────────┘"));
  console.log(muted("     Autonomous AI engineer at your command"));
  console.log();
}

export function printDivider() {
  console.log(muted("  " + "─".repeat(50)));
}

// ── Session list ─────────────────────────────────────────────────────────────

export function printSessionTable(sessions: SessionSummary[]) {
  if (sessions.length === 0) {
    console.log(subtle("  No sessions found."));
    return;
  }
  console.log();
  console.log(
    bright.bold(
      `  ${"ID".padEnd(38)}  ${"TITLE".padEnd(24)}  ${"MODE".padEnd(8)}  UPDATED`
    )
  );
  printDivider();
  for (const s of sessions) {
    const updated = new Date(s.updatedAt).toLocaleString();
    const modeColor =
      s.agentMode === "FULL"
        ? success
        : s.agentMode === "PLAN"
        ? warn
        : subtle;
    console.log(
      `  ${muted(s.id.padEnd(38))}  ${bright(
        (s.title ?? "—").slice(0, 24).padEnd(24)
      )}  ${modeColor(s.agentMode.padEnd(8))}  ${muted(updated)}`
    );
  }
  console.log();
}

// ── Session detail (history) ─────────────────────────────────────────────────

export function printSessionDetail(session: SessionDetail) {
  console.log();
  console.log(
    brand.bold(`  Session: `) + bright(session.id)
  );
  console.log(
    brand.bold(`  Title  : `) + bright(session.title ?? "—")
  );
  console.log(
    brand.bold(`  Mode   : `) + modeChip(session.agentMode)
  );
  printDivider();
  if (session.messages.length === 0) {
    console.log(subtle("  No messages yet."));
  }
  for (const msg of session.messages) {
    const ts = muted(new Date(msg.createdAt).toLocaleTimeString());
    if (msg.messageType === "USER") {
      console.log(`\n  ${chalk.cyan.bold("▶ You")}  ${ts}`);
      console.log(
        bright(
          msg.content
            .split("\n")
            .map((l) => "    " + l)
            .join("\n")
        )
      );
    } else {
      console.log(`\n  ${brand.bold("✦ Agent")}  ${ts}`);
      console.log(
        subtle(
          msg.content
            .split("\n")
            .map((l) => "    " + l)
            .join("\n")
        )
      );
    }
  }
  console.log();
}

// ── SSE event rendering ───────────────────────────────────────────────────────

export function renderAgentEvent(event: AgentEvent) {
  switch (event.type) {
    case "STARTED":
      console.log("\n" + brand.bold("  ✦ Agent started") + "\n");
      break;
    case "NARRATION":
      // Stream agent text word by word (it arrives as chunks)
      if (event.content) {
        process.stdout.write(subtle(event.content));
      }
      break;
    case "TOOL_CALL":
      console.log(
        "\n" +
          warn("  ⚙  Tool call: ") +
          bright(event.toolName ?? "?") +
          (event.content ? "\n" + muted("     " + event.content) : "")
      );
      break;
    case "TOOL_RESULT":
      if (event.content) {
        const preview =
          event.content.length > 200
            ? event.content.slice(0, 200) + "…"
            : event.content;
        console.log(muted("     ⮑ Result: " + preview));
      }
      break;
    case "PERMISSION_REQUIRED":
      console.log(
        "\n" + danger.bold("  ⚠  Permission required: ") + bright(event.content ?? "")
      );
      break;
    case "COMPLETED":
      console.log("\n\n" + success.bold("  ✓ Done") + "\n");
      break;
    case "ERROR":
      console.log("\n" + danger.bold("  ✗ Error: ") + bright(event.content ?? ""));
      break;
  }
}

export async function promptToolApproval(
  toolName: string | null,
  content: string | null
): Promise<boolean> {
  console.log();
  console.log(warn.bold("  ⚠  Tool Approval Required (DISCUSS mode)"));
  console.log(bright.bold("     Tool     : ") + brand.bold(toolName ?? "unknown"));
  if (content) {
    console.log(bright.bold("     Arguments: ") + muted(content));
  }
  return await confirm({
    message: `Allow agent to execute '${toolName ?? "tool"}'?`,
    default: true,
  });
}

// ── Utility ───────────────────────────────────────────────────────────────────

function modeChip(mode: string) {
  if (mode === "FULL") return success.bold(mode);
  if (mode === "PLAN") return warn.bold(mode);
  return subtle.bold(mode);
}

export function printError(msg: string) {
  console.error("\n" + danger.bold("  ✗ ") + bright(msg) + "\n");
}

export function printSuccess(msg: string) {
  console.log("\n" + success.bold("  ✓ ") + bright(msg) + "\n");
}

export function printInfo(msg: string) {
  console.log(brand("  ℹ ") + bright(msg));
}
