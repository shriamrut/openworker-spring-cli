#!/usr/bin/env node
/**
 * index.ts – Main entry point for the OpenWorker CLI.
 *
 * Commands
 * ─────────
 *   chat                 – Start interactive chat (new or resumed session)
 *   sessions             – List all sessions
 *   history <id>         – Show message history
 *   delete <id>          – Delete a session
 *   mode <id> <mode>     – Change agent mode
 *
 * Flags
 * ─────
 *   --session, -s <id>   – session to resume (with `chat`)
 *   --mode <mode>        – initial agent mode (with `chat`)
 *
 * Environment
 * ───────────
 *   OPENWORKER_URL       – Server URL (default: http://localhost:8765)
 */

import { select, input, confirm } from "@inquirer/prompts";
import ora from "ora";
import chalk from "chalk";
import * as readline from "readline";

import {
  createSession,
  listSessions,
  getSession,
  deleteSession,
  updateMode,
  submitPermissionDecision,
  streamTurn,
  AgentMode,
  BASE_URL,
} from "./api.js";

import {
  printBanner,
  printSessionTable,
  printSessionDetail,
  renderAgentEvent,
  promptToolApproval,
  printError,
  printSuccess,
  printInfo,
  printDivider,
} from "./ui.js";

// ──────────────────────────────────────────────────────────────────────────────
// Entry
// ──────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

printBanner();
printInfo(`Connected to: ${chalk.hex("#7C3AED")(BASE_URL)}`);
console.log();

switch (command) {
  case "chat":
    await runChat();
    break;
  case "sessions":
    await runListSessions();
    break;
  case "history":
    await runHistory(args[1]);
    break;
  case "delete":
    await runDelete(args[1]);
    break;
  case "mode":
    await runSetMode(args[1], args[2] as AgentMode);
    break;
  default:
    printHelp();
}

// ──────────────────────────────────────────────────────────────────────────────
// Chat REPL
// ──────────────────────────────────────────────────────────────────────────────

async function runChat() {
  let sessionId = getFlag("--session") ?? getFlag("-s");
  let currentMode: AgentMode = (getFlag("--mode") as AgentMode) ?? "DISCUSS";

  if (!sessionId) {
    const spinner = ora("Loading sessions…").start();
    let sessions: Awaited<ReturnType<typeof listSessions>> = [];
    try {
      sessions = await listSessions();
      spinner.stop();
    } catch {
      spinner.fail("Could not reach the server – is openworker-spring-ai running?");
      process.exit(1);
    }

    if (sessions.length > 0) {
      const choices: Array<{ name: string; value: string }> = [
        { name: chalk.hex("#10B981").bold("✦ Start a new session"), value: "__new__" },
        ...sessions.map((s) => ({
          name: `${chalk.hex("#94A3B8")(s.id.slice(0, 8))}  ${chalk.hex("#E2E8F0")(
            (s.title ?? "—").slice(0, 28).padEnd(28)
          )}  [${s.agentMode}]`,
          value: s.id,
        })),
      ];

      sessionId = await select({
        message: "Pick a session to resume or start a new one:",
        choices,
        pageSize: 12,
      });
    }
  }

  if (!sessionId || sessionId === "__new__") {
    const title = await input({ message: "Session title (optional):", default: "" });
    const mode = await select<AgentMode>({
      message: "Agent mode:",
      choices: [
        { name: "DISCUSS  – Interactive discussion; asks user for tool use", value: "DISCUSS" },
        { name: "PLAN     – Read-only, LLM designs a strategy", value: "PLAN" },
        { name: "FULL     – Write & shell execution enabled", value: "FULL" },
      ],
      default: "DISCUSS",
    });

    const spinner = ora("Creating session…").start();
    const session = await createSession(title || undefined, mode);
    spinner.succeed(`Session created: ${chalk.hex("#7C3AED")(session.id)}`);
    sessionId = session.id;
    currentMode = mode;
  } else {
    try {
      const session = await getSession(sessionId!);
      currentMode = session.agentMode;
      printInfo(
        `Resuming "${session.title ?? session.id.slice(0, 8)}"  [${session.agentMode}]`
      );
    } catch {
      printError("Session not found.");
      process.exit(1);
    }
  }

  console.log();
  printDivider();
  console.log(
    chalk.hex("#64748B")(
      "  Type your message and press Enter.\n" +
      "  Special commands:\n" +
      "    /mode <DISCUSS|PLAN|FULL>  – switch agent mode\n" +
      "    /history                   – view message history\n" +
      "    /exit                      – quit"
    )
  );
  printDivider();
  console.log();

  // ── REPL loop ──────────────────────────────────────────────────────────────
  const readLine = (): Promise<string> =>
    new Promise((resolve) => {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
      process.stdout.write(chalk.cyan.bold("\n▶ You: "));
      rl.once("line", (line) => {
        rl.close();
        resolve(line);
      });
    });

  while (true) {
    let userInput: string;
    try {
      userInput = (await readLine()).trim();
    } catch {
      break; // EOF / Ctrl-C
    }
    if (!userInput) continue;

    if (userInput === "/exit" || userInput === "/quit") {
      printSuccess("Goodbye!");
      break;
    }

    if (userInput === "/history") {
      const session = await getSession(sessionId!);
      printSessionDetail(session);
      continue;
    }

    if (userInput.startsWith("/mode ")) {
      const newMode = userInput.split(" ")[1]?.toUpperCase() as AgentMode;
      if (!["DISCUSS", "PLAN", "FULL"].includes(newMode)) {
        printError("Mode must be DISCUSS, PLAN, or FULL.");
        continue;
      }
      const spinner = ora(`Switching to ${newMode}…`).start();
      await updateMode(sessionId!, newMode);
      currentMode = newMode;
      spinner.succeed(`Mode switched to ${newMode}`);
      continue;
    }

    // ── Stream turn ───────────────────────────────────────────────────────────
    console.log();
    try {
      for await (const event of streamTurn(sessionId!, userInput, currentMode)) {
        if (event.type === "PERMISSION_REQUIRED" && event.toolCallId) {
          const approved = await promptToolApproval(event.toolName, event.content);
          try {
            await submitPermissionDecision(sessionId!, event.toolCallId, approved);
            if (approved) {
              printInfo(`Permission granted for ${event.toolName ?? "tool"}`);
            } else {
              printInfo(`Permission denied for ${event.toolName ?? "tool"}`);
            }
          } catch (err: unknown) {
            printError(`Failed to submit permission decision: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          renderAgentEvent(event);
        }
      }
    } catch (err: unknown) {
      printError(err instanceof Error ? err.message : String(err));
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Non-interactive commands
// ──────────────────────────────────────────────────────────────────────────────

async function runListSessions() {
  const spinner = ora("Fetching sessions…").start();
  try {
    const sessions = await listSessions();
    spinner.stop();
    printSessionTable(sessions);
  } catch (err: unknown) {
    spinner.fail("Failed to fetch sessions.");
    printError(err instanceof Error ? err.message : String(err));
  }
}

async function runHistory(sessionId?: string) {
  if (!sessionId) { printError("Usage: npm start -- history <sessionId>"); return; }
  const spinner = ora("Fetching history…").start();
  try {
    const session = await getSession(sessionId);
    spinner.stop();
    printSessionDetail(session);
  } catch (err: unknown) {
    spinner.fail("Failed to fetch session.");
    printError(err instanceof Error ? err.message : String(err));
  }
}

async function runDelete(sessionId?: string) {
  if (!sessionId) { printError("Usage: npm start -- delete <sessionId>"); return; }
  const ok = await confirm({
    message: `Delete session ${sessionId}? This cannot be undone.`,
    default: false,
  });
  if (!ok) { printInfo("Cancelled."); return; }
  const spinner = ora("Deleting…").start();
  try {
    await deleteSession(sessionId);
    spinner.succeed(`Session ${sessionId} deleted.`);
  } catch (err: unknown) {
    spinner.fail("Failed to delete session.");
    printError(err instanceof Error ? err.message : String(err));
  }
}

async function runSetMode(sessionId?: string, mode?: AgentMode) {
  if (!sessionId || !mode) {
    printError("Usage: npm start -- mode <sessionId> <DISCUSS|PLAN|FULL>");
    return;
  }
  const spinner = ora(`Setting mode to ${mode}…`).start();
  try {
    const session = await updateMode(sessionId, mode);
    spinner.succeed(`Mode updated to ${session.agentMode}`);
  } catch (err: unknown) {
    spinner.fail("Failed to update mode.");
    printError(err instanceof Error ? err.message : String(err));
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function getFlag(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function printHelp() {
  console.log(
    chalk.hex("#E2E8F0")(`
  Usage: npm start -- [command] [options]

  Commands:
    chat                          Interactive chat (new or resumed session)
    sessions                      List all sessions
    history <id>                  View message history
    delete <id>                   Delete a session
    mode <id> <DISCUSS|PLAN|FULL> Change agent mode

  Flags (for chat):
    --session, -s <id>            Resume a specific session
    --mode <mode>                 Initial agent mode

  Environment:
    OPENWORKER_URL                Server URL (default: http://localhost:8765)

  Examples:
    npm start -- chat
    npm start -- chat -s abc123 --mode FULL
    npm start -- sessions
    npm start -- history abc123
    npm start -- delete abc123
    npm start -- mode abc123 PLAN
`)
  );
}
