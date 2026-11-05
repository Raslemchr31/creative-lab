# Stage: generate (Kie.ai)

```
node cli.mjs gen run --batch B --confirm B --dry-run          # writes every request to jobs/*/dry-run/, runs local ops, 0 credits
node cli.mjs gen run --batch B --confirm B --mock             # faithful local mock of Kie
node cli.mjs gen run --batch B --confirm B [--stage A|B] [--through] [--max-credits N]   # LIVE, needs KIE_API_KEY in creative-lab/.env
node cli.mjs gen status --batch B
```
- Stage A = stills (plates, cut-outs, harmonise, compose); review them (stage qa) BEFORE stage B (image-to-video). `--through` skips the pause.
- Resumable: tasks with a provider id are polled, never re-created. 402 = out of credits → stops.
- Model choice, prompts and Kie quirks: skill `kie-ai`.
- The owner approves spend: never run live without an explicit `--confirm <batch>` from them in this conversation.
