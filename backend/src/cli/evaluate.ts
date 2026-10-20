import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { runBatchCases } from "../services/batch/batch-runner.js";

function parseArgs(args: string[]): { input: string; output: string } {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag !== "--input" && flag !== "--output") continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a file path.`);
    values.set(flag, value);
    index += 1;
  }
  const input = values.get("--input");
  const output = values.get("--output");
  if (!input || !output) throw new Error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
  const cwd = process.cwd();
  const root = resolve(cwd, "..");
  const cwdInput = resolve(cwd, input);
  const rootInput = resolve(root, input);
  // `npm run evaluate` can be invoked from the repository root or from backend/.
  // When the input is in the root, keep its relative output beside that input.
  const base = !isAbsolute(input) && !existsSync(cwdInput) && existsSync(rootInput) ? root : cwd;
  return { input: resolve(base, input), output: resolve(base, output) };
}

async function main(): Promise<void> {
  const paths = parseArgs(process.argv.slice(2));
  let cases: unknown;
  try { cases = JSON.parse(await readFile(paths.input, "utf8")); }
  catch (error) { throw new Error(`Could not read cases file: ${error instanceof Error ? error.message : "invalid JSON"}`); }
  if (!Array.isArray(cases)) throw new Error("Input must be a JSON array of cases.");

  const output = await runBatchCases(cases, undefined, (id, progress) => console.log(`[${id}] ${progress.percent}% ${progress.message}`));
  await mkdir(dirname(paths.output), { recursive: true });
  const temporary = `${paths.output}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temporary, paths.output);
  console.log(`Wrote ${output.kits.length} case results to ${paths.output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Evaluation failed.");
  process.exitCode = 1;
});
