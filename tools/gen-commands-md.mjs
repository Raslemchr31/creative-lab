// Regenerates COMMANDS.md from the CLI's own help text: node tools/gen-commands-md.mjs
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const help = execFileSync(process.execPath, ["cli.mjs", "help"], { cwd: root, encoding: "utf8" });
const rows = help.split("\n").map((l) => l.match(/^ {2}(\S+ \S+)\s{2,}(.*)$/)).filter(Boolean);
const esc = (s) => s.replace(/\|/g, "\\|");
let out = "# creative-lab — commands\n\nRun from `creative-lab/`. Add `--json` for machine output. Network commands (spy, product sync, live gen) need internet; generation spends Kie credits only with `--confirm <batch>`.\n\n";
out += "**Prompt codes:** in the UI open any ad → *Get prompt code* → pick product + format → send the `FL-XXXXX` code to Claude (skill `flow-prompt`).\n\n";
out += "| Command | What it does / options |\n|---|---|\n";
for (const [, cmd, desc] of rows) out += `| \`${cmd}\` | ${esc(desc)} |\n`;
out += "\nOther: `node --no-warnings server/server.mjs` (UI, :4317) · `node tests/run.mjs [--e2e] [--render]` · `node tools/gen-commands-md.mjs` (this file) · Remotion render of one EDL (inside remotion-studio): `node tools/render-lab.mjs <edl.json> <out> [--still] [--scale 0.5]`.\n";
fs.writeFileSync(path.join(root, "COMMANDS.md"), out);
console.log(`${rows.length} commands`);
