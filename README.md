openworker-cli

Use to start the CLI: npm start -- chat

```sh
npm start -- chat

> openworker-cli@1.0.0 start
> tsx src/index.ts chat


  ┌─────────────────────────────────────┐
  │   ✦  OpenWorker  Spring-AI  CLI  ✦  │
  └─────────────────────────────────────┘
     Autonomous AI engineer at your command

  ℹ Connected to: http://localhost:8765

✔ Pick a session to resume or start a new one: ✦ Start a new session
✔ Session title (optional): testing
✔ Agent mode: FULL     – Write & shell execution enabled
✔ Session created: c5df4260-f806-4197-9cf4-b3d5ed995e64

  ──────────────────────────────────────────────────
  Type your message and press Enter.
  Special commands:
    /mode <DISCUSS|PLAN|FULL>  – switch agent mode
    /history                   – view message history
    /exit                      – quit
  ──────────────────────────────────────────────────


▶ You: add 123 + 124 + 364 + 1354 using tools


  ✦ Agent started


  ⚙  Tool call: calculator_add
     {"a":123,"b":124}

  ⚙  Tool call: calculator_add
     {"a":247,"b":364}

  ⚙  Tool call: calculator_add
     {"a":611,"b":1354}
The sum \(123 + 124 + 364 + 1354 = 1965\).

  ✓ Done

```

To interact with https://github.com/shriamrut/openworker-spring/
