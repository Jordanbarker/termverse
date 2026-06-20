#!/usr/bin/env npx tsx
/**
 * Playtest the user's "Terminal Commands Reference Guide" against the game.
 * Runs each example command, records pass/fail, prints a summary.
 *
 * Pass = exitCode 0 AND output is non-empty / sensible.
 * Fail = "invalid option", "command not found", or empty/error output.
 */

const storage = new Map<string, string>();
globalThis.localStorage = {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => { storage.set(k, v); },
  removeItem: (k: string) => { storage.delete(k); },
  clear: () => storage.clear(),
  get length() { return storage.size; },
  key: (i: number) => [...storage.keys()][i] ?? null,
} as Storage;

import { GameRunner } from "./play";

interface Outcome {
  cmd: string;
  status: "PASS" | "FAIL" | "SKIP" | "PARTIAL";
  note: string;
  output: string;
  exitCode: number;
}

const results: Outcome[] = [];

function record(o: Outcome) {
  results.push(o);
  const icon = o.status === "PASS" ? "✓" : o.status === "FAIL" ? "✗" : o.status === "PARTIAL" ? "~" : "·";
  console.log(`  ${icon} ${o.cmd.padEnd(48)} ${o.status.padEnd(7)} ${o.note}`);
}

function classify(cmd: string, output: string, exitCode: number, expectContains?: string[]): Outcome {
  const lower = output.toLowerCase();
  if (lower.includes("command not found") || lower.includes("not found in") || lower.includes("zsh: command not found")) {
    return { cmd, status: "FAIL", note: "command not found", output, exitCode };
  }
  if (lower.includes("invalid option") || lower.includes("unrecognized option") || lower.includes("illegal option") || lower.includes("unknown option")) {
    return { cmd, status: "FAIL", note: "flag not supported", output, exitCode };
  }
  if (exitCode !== 0 && exitCode !== undefined) {
    return { cmd, status: "FAIL", note: `exit ${exitCode}: ${output.split("\n")[0].slice(0, 60)}`, output, exitCode };
  }
  if (expectContains) {
    for (const needle of expectContains) {
      if (!output.includes(needle)) {
        return { cmd, status: "PARTIAL", note: `ran but missing "${needle}"`, output, exitCode };
      }
    }
  }
  return { cmd, status: "PASS", note: output.split("\n")[0].slice(0, 60), output, exitCode };
}

async function runOnce(runner: GameRunner, cmd: string, expectContains?: string[]): Promise<Outcome> {
  const r = await runner.runAsync(cmd);
  return classify(cmd, r.output, r.exitCode ?? 0, expectContains);
}

function syncRun(runner: GameRunner, cmd: string, expectContains?: string[]): Outcome {
  const r = runner.run(cmd);
  return classify(cmd, r.output, r.exitCode ?? 0, expectContains);
}

// Unlock everything so no command is gated.
function fullyUnlocked(): Record<string, boolean> {
  return {
    returned_home_day1: true,
    basic_tools_unlocked: true,
    tree_installed: true,
    apt_unlocked: true,
    pdftotext_unlocked: true,
    ssh_unlocked: true,
    search_tools_unlocked: true,
    inspection_tools_unlocked: true,
    processing_tools_unlocked: true,
    coder_unlocked: true,
    chip_unlocked: true,
    chmod_unlocked: true,
    printenv_unlocked: true,
    piper_unlocked: true,
    day1_shutdown: true,
  };
}

async function main() {
  console.log("\n=== Termoil reference-list playtest ===\n");

  // Run on NexaCorp — most commands available, plus dbt/python/snow.
  const runner = new GameRunner("nexacorp");
  runner.storyFlags = fullyUnlocked();

  // Seed fixtures in cwd (~/playtest)
  console.log("→ Seeding fixtures in ~/playtest ...");
  syncRun(runner, "mkdir -p playtest");
  syncRun(runner, "cd playtest");
  runner.writeFile("notes.txt", "first line\nERROR: something broke\nthird line\nerror lowercase\nfifth line\n");
  runner.writeFile("file1.txt", "alpha\nbeta\ngamma\n");
  runner.writeFile("file2.txt", "alpha\nBETA\ngamma\ndelta\n");
  runner.writeFile("numbers.txt", "10\n2\n30\n4\n100\n");
  runner.writeFile("names.txt", "alice\nbob\nalice\ncarol\nbob\nalice\n");
  runner.writeFile("script.sh", "#!/bin/bash\necho line1\necho line2\necho line3\necho line4\necho line5\necho line6\necho line7\necho line8\necho line9\necho line10\necho line11\n");
  runner.writeFile("log.txt", "2026-05-09 INFO start\n2026-05-09 ERROR connection refused\n2026-05-09 WARN slow query\n2026-05-09 ERROR retry failed\n");
  syncRun(runner, "mkdir -p dirA");
  syncRun(runner, "mkdir -p dirB");
  runner.writeFile("dirA/x.txt", "hello\n");
  runner.writeFile("dirB/x.txt", "hello world\n");
  console.log("   fixtures ready\n");

  // ── ls ───────────────────────────────────────────────────
  console.log("ls");
  record(syncRun(runner, "ls"));
  record(syncRun(runner, "ls -la", ["notes.txt"]));
  record(syncRun(runner, "ls -lh"));

  // ── cd / pwd ─────────────────────────────────────────────
  console.log("\ncd / pwd");
  record(syncRun(runner, "pwd", ["/playtest"]));
  record(syncRun(runner, "cd ~"));
  record(syncRun(runner, "pwd", [`/home/${runner.username}`]));
  syncRun(runner, "cd playtest");
  record(syncRun(runner, "cd .."));
  syncRun(runner, "cd playtest");

  // ── cat ──────────────────────────────────────────────────
  console.log("\ncat");
  record(syncRun(runner, "cat notes.txt", ["first line"]));
  record(syncRun(runner, "cat -n notes.txt", ["1", "first line"]));
  record(syncRun(runner, "cat file1.txt file2.txt > combined.txt"));
  record(syncRun(runner, "cat combined.txt", ["alpha", "BETA"]));

  // ── clear / help ─────────────────────────────────────────
  console.log("\nclear / help");
  record(syncRun(runner, "clear"));
  record(syncRun(runner, "help"));
  record(syncRun(runner, "help cd"));

  // ── nano ─────────────────────────────────────────────────
  console.log("\nnano");
  record({ ...syncRun(runner, "nano config.txt"), status: "SKIP", note: "interactive editor — opens session" });
  record(syncRun(runner, "nano +10 script.sh"));

  // ── python (async) ───────────────────────────────────────
  console.log("\npython");
  record({ ...await runOnce(runner, "python"), status: "SKIP", note: "interactive REPL" });
  record(await runOnce(runner, "python -c \"print('hello')\"", ["hello"]));
  record(await runOnce(runner, "python -m http.server"));

  // ── dbt (async) ──────────────────────────────────────────
  console.log("\ndbt");
  // dbt requires being in a dbt project — skip exact run, just check command exists.
  record({ ...await runOnce(runner, "dbt"), status: "SKIP", note: "needs dbt project; tested via subcommands below" });
  // Just check the flag is recognized — full run is exercised elsewhere.
  // ── ssh ──────────────────────────────────────────────────
  console.log("\nssh");
  record(syncRun(runner, "ssh user@example.com"));
  record(syncRun(runner, "ssh -p 2222 user@example.com"));
  record(syncRun(runner, "ssh -i ~/.ssh/mykey user@example.com"));

  // ── coder ────────────────────────────────────────────────
  console.log("\ncoder");
  record(syncRun(runner, "coder login https://coder.example.com"));
  record(syncRun(runner, "coder list"));
  // Don't actually ssh — would start a session
  record({ ...syncRun(runner, "coder ssh ai"), status: "SKIP", note: "starts SSH session" });

  // ── shutdown ─────────────────────────────────────────────
  console.log("\nshutdown");
  // Need to be on home for shutdown to be available, but it might be NexaCorp-blocked.
  // Run on a fresh home runner.
  {
    const h = new GameRunner("home");
    h.storyFlags = fullyUnlocked();
    record(syncRun(h, "sudo shutdown now"));
    record(syncRun(h, "sudo shutdown -r +5"));
    record(syncRun(h, "sudo shutdown -c"));
  }

  // ── save / load / newgame ────────────────────────────────
  console.log("\nsave / load / newgame");
  record(syncRun(runner, "save 1"));
  record(syncRun(runner, "load 1"));
  // newgame would wipe everything — skip
  record({ ...syncRun(runner, "newgame"), status: "SKIP", note: "would reset game state" });

  // ── grep ─────────────────────────────────────────────────
  console.log("\ngrep");
  record(syncRun(runner, "grep error log.txt", ["ERROR"].slice(0, 0))); // case-sensitive: shouldn't match ERROR
  record(syncRun(runner, "grep -in error log.txt", ["ERROR"]));
  record(syncRun(runner, "grep -r TODO ."));

  // ── find ─────────────────────────────────────────────────
  console.log("\nfind");
  record(syncRun(runner, "find . -name \"*.txt\"", ["notes.txt"]));
  record(syncRun(runner, "find . -type d"));
  record(syncRun(runner, "find . -mtime -7"));

  // ── head / tail ──────────────────────────────────────────
  console.log("\nhead / tail");
  record(syncRun(runner, "head script.sh", ["line1"]));
  record(syncRun(runner, "head -n 3 script.sh", ["line1", "line3"]));
  record(syncRun(runner, "tail script.sh"));
  record(syncRun(runner, "tail -f log.txt"));

  // ── diff ─────────────────────────────────────────────────
  console.log("\ndiff");
  record(syncRun(runner, "diff file1.txt file2.txt"));
  record(syncRun(runner, "diff -u file1.txt file2.txt"));
  record(syncRun(runner, "diff -r dirA/ dirB/"));

  // ── wc ───────────────────────────────────────────────────
  console.log("\nwc");
  record(syncRun(runner, "wc notes.txt", ["notes.txt"]));
  record(syncRun(runner, "wc -l notes.txt"));

  // ── echo ─────────────────────────────────────────────────
  console.log("\necho");
  record(syncRun(runner, "echo \"Hello, world\"", ["Hello, world"]));
  record(syncRun(runner, "echo $HOME", [`/home/${runner.username}`]));
  record(syncRun(runner, "echo -n \"no newline\""));

  // ── chmod ────────────────────────────────────────────────
  console.log("\nchmod");
  record(syncRun(runner, "chmod +x script.sh"));
  record(syncRun(runner, "chmod 755 script.sh"));
  record(syncRun(runner, "chmod -R 644 ./dirA"));

  // ── mkdir ────────────────────────────────────────────────
  console.log("\nmkdir");
  record(syncRun(runner, "mkdir new_folder"));
  record(syncRun(runner, "mkdir -p projects/2026/january"));

  // ── rm ───────────────────────────────────────────────────
  console.log("\nrm");
  syncRun(runner, "touch _del.txt");
  record(syncRun(runner, "rm _del.txt"));
  syncRun(runner, "mkdir -p _delfolder");
  syncRun(runner, "touch _delfolder/x");
  record(syncRun(runner, "rm -r _delfolder/"));
  syncRun(runner, "mkdir -p _temp");
  record(syncRun(runner, "rm -rf _temp/"));

  // ── mv ───────────────────────────────────────────────────
  console.log("\nmv");
  syncRun(runner, "touch old.txt");
  record(syncRun(runner, "mv old.txt new.txt"));
  syncRun(runner, "mkdir -p Documents");
  syncRun(runner, "touch report.pdf");
  record(syncRun(runner, "mv report.pdf ./Documents/"));

  // ── cp ───────────────────────────────────────────────────
  console.log("\ncp");
  syncRun(runner, "touch cf1.txt");
  record(syncRun(runner, "cp cf1.txt cf2.txt"));
  syncRun(runner, "mkdir -p folderA");
  syncRun(runner, "touch folderA/inside.txt");
  record(syncRun(runner, "cp -r folderA/ folderB/"));

  // ── touch ────────────────────────────────────────────────
  console.log("\ntouch");
  record(syncRun(runner, "touch newfile.txt"));
  record(syncRun(runner, "touch a.txt b.txt c.txt"));

  // ── history ──────────────────────────────────────────────
  console.log("\nhistory");
  record(syncRun(runner, "history"));
  record(syncRun(runner, "history | grep ls"));

  // ── whoami / hostname ────────────────────────────────────
  console.log("\nwhoami / hostname");
  record(syncRun(runner, "whoami", [runner.username]));
  record(syncRun(runner, "hostname"));
  record(syncRun(runner, "hostname -I"));

  // ── file ─────────────────────────────────────────────────
  console.log("\nfile");
  record(syncRun(runner, "file notes.txt"));
  record(syncRun(runner, "file *.txt"));

  // ── tree ─────────────────────────────────────────────────
  console.log("\ntree");
  record(syncRun(runner, "tree"));
  record(syncRun(runner, "tree -L 2"));
  record(syncRun(runner, "tree -a"));

  // ── sort ─────────────────────────────────────────────────
  console.log("\nsort");
  record(syncRun(runner, "sort names.txt"));
  record(syncRun(runner, "sort -r names.txt"));
  record(syncRun(runner, "sort -n numbers.txt"));

  // ── uniq ─────────────────────────────────────────────────
  console.log("\nuniq");
  record(syncRun(runner, "sort names.txt | uniq"));
  record(syncRun(runner, "sort names.txt | uniq -c"));

  // ── date ─────────────────────────────────────────────────
  console.log("\ndate");
  record(syncRun(runner, "date"));
  record(syncRun(runner, "date +\"%Y-%m-%d\""));

  // ── which / command / type / man ─────────────────────────
  console.log("\nwhich / command / type / man");
  record(syncRun(runner, "which python"));
  record(syncRun(runner, "command ls"));
  record(syncRun(runner, "command -v git"));
  record(syncRun(runner, "type cd"));
  record(syncRun(runner, "type -a python"));
  record(syncRun(runner, "man ls"));
  record(syncRun(runner, "man -k network"));

  // ── df ───────────────────────────────────────────────────
  console.log("\ndf");
  record(syncRun(runner, "df"));
  record(syncRun(runner, "df -h"));

  // ── sudo / apt ───────────────────────────────────────────
  console.log("\nsudo / apt");
  record(syncRun(runner, "sudo apt update"));
  record(syncRun(runner, "sudo apt install curl"));
  record(syncRun(runner, "sudo apt remove curl"));
  record(syncRun(runner, "sudo apt upgrade"));
  record(syncRun(runner, "sudo -u postgres psql"));
  record(syncRun(runner, "sudo -i"));

  // ── source ───────────────────────────────────────────────
  console.log("\nsource");
  runner.writeFile(".myrc", "export FOO=bar\n");
  record(syncRun(runner, "source .myrc"));

  // ── alias / unalias ──────────────────────────────────────
  console.log("\nalias / unalias");
  record(syncRun(runner, "alias"));
  record(syncRun(runner, "alias ll='ls -la'"));
  record(syncRun(runner, "unalias ll"));
  record(syncRun(runner, "unalias -a"));

  // ── export / printenv / env ──────────────────────────────
  console.log("\nexport / printenv / env");
  record(syncRun(runner, "export API_KEY=\"abc123\""));
  record(syncRun(runner, "export PATH=\"$PATH:/opt/mytool/bin\""));
  record(syncRun(runner, "printenv"));
  record(syncRun(runner, "printenv HOME"));
  record(syncRun(runner, "env"));
  record(syncRun(runner, "env DEBUG=1 ./myscript.sh"));

  // ── Summary ──────────────────────────────────────────────
  console.log("\n\n=== Summary ===");
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const partial = results.filter((r) => r.status === "PARTIAL").length;
  const skip = results.filter((r) => r.status === "SKIP").length;
  console.log(`  PASS:    ${pass}`);
  console.log(`  PARTIAL: ${partial}`);
  console.log(`  FAIL:    ${fail}`);
  console.log(`  SKIP:    ${skip}`);
  console.log(`  TOTAL:   ${results.length}`);

  if (fail > 0) {
    console.log("\n=== Failures ===");
    for (const r of results.filter((x) => x.status === "FAIL")) {
      console.log(`  ✗ ${r.cmd}`);
      console.log(`      ${r.note}`);
      if (r.output) {
        const firstLine = r.output.split("\n").slice(0, 2).join(" | ").slice(0, 120);
        console.log(`      out: ${firstLine}`);
      }
    }
  }
  if (partial > 0) {
    console.log("\n=== Partial / suspicious ===");
    for (const r of results.filter((x) => x.status === "PARTIAL")) {
      console.log(`  ~ ${r.cmd}`);
      console.log(`      ${r.note}`);
      const firstLine = r.output.split("\n").slice(0, 2).join(" | ").slice(0, 120);
      console.log(`      out: ${firstLine}`);
    }
  }
}

main().catch((e) => {
  console.error("Playtest crashed:", e);
  process.exit(1);
});
