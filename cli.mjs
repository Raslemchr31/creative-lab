#!/usr/bin/env node
// creative-lab CLI — `node cli.mjs <group> <command> [--flags]`  (run from anywhere)
// Groups: spy · lib · analyze · dna · style · product · batch · gen · qa · assemble · export · ui · doctor
// `node cli.mjs help` lists everything. Every command prints JSON when --json is passed.

import { commands } from "./lib/commands.mjs";

function parseArgs(argv) {
  const pos = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const k = a.slice(2);
        const nxt = argv[i + 1];
        if (nxt !== undefined && !nxt.startsWith("--")) {
          flags[k] = nxt;
          i++;
        } else flags[k] = true;
      }
    } else pos.push(a);
  }
  return { pos, flags };
}

const { pos, flags } = parseArgs(process.argv.slice(2));
const [group = "help", cmd = "", ...rest] = pos;
const key = commands[`${group} ${cmd}`] ? `${group} ${cmd}` : commands[group] ? group : null;

if (!key || group === "help") {
  console.log("creative-lab — commands:\n");
  for (const [k, v] of Object.entries(commands)) console.log(`  ${k.padEnd(22)} ${v.help}`);
  console.log("\nAdd --json for machine output. Docs: creative-lab/README.md");
  process.exit(key || group === "help" ? 0 : 1);
}

const restArgs = key === group ? [cmd, ...rest].filter(Boolean) : rest;
try {
  const out = await commands[key].run(restArgs, flags);
  if (out !== undefined) {
    if (flags.json) console.log(JSON.stringify(out, null, 2));
    else if (typeof out === "string") console.log(out);
    else console.log(JSON.stringify(out, null, 2));
  }
  process.exit(0);
} catch (e) {
  console.error(`✗ ${e.code ? `[${e.code}] ` : ""}${e.message}`);
  if (flags.debug) console.error(e.stack);
  process.exit(e.exitCode || 1);
}
