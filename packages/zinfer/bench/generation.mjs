import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FILES = 12;
const RUNS = 3;
const MAX_NATIVE_SNAPSHOTS = 20;

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, "..", "dist", "cli.js");
const preload = join(here, "count-snapshots.mjs");
const metricsPath = process.argv[2];
if (!metricsPath) throw new Error("usage: node generation.mjs <metrics.json>");

function writeWorkload(dir) {
  mkdirSync(join(dir, "schemas"), { recursive: true });
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "Bundler",
        skipLibCheck: true,
      },
      include: ["schemas"],
    }),
  );
  writeFileSync(
    join(dir, "schemas", "common.ts"),
    `import { z } from "zod";
export const IdSchema = z.string().uuid().brand<"Id">();
export const TimestampSchema = z.coerce.date();
`,
  );
  for (let i = 0; i < FILES; i++) {
    const previous = i === 0 ? "" : `import { Item${i - 1}Schema } from "./schema-${i - 1}";\n`;
    const previousField = i === 0 ? "" : `  previous: Item${i - 1}Schema.optional(),\n`;
    writeFileSync(
      join(dir, "schemas", `schema-${i}.ts`),
      `import { z } from "zod";
import { IdSchema, TimestampSchema } from "./common";
${previous}
export const Item${i}Schema = z.object({
  id: IdSchema,
  name: z.string(),
  tags: z.array(z.string()).optional(),
  createdAt: TimestampSchema,
${previousField}});

export const Kind${i}Schema = z.enum(["a", "b", "c"]);

export const Payload${i}Schema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("x"), value: z.number() }),
  z.object({ type: z.literal("y"), items: z.array(Item${i}Schema) }),
]);

export const Config${i}Schema = z.object({
  kind: Kind${i}Schema,
  payload: Payload${i}Schema,
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const Wrapped${i}Schema = z.object({
  config: Config${i}Schema,
  count: z.coerce.number().default(0),
});
`,
    );
  }
}

function generate(dir) {
  const countFile = join(dir, "snapshots.txt");
  const start = performance.now();
  const result = spawnSync(
    process.execPath,
    ["--import", preload, cli, "schemas/schema-*.ts", "--outDir", "types", "--suffix", "Schema"],
    {
      cwd: dir,
      env: { ...process.env, ZINFER_BENCH_COUNT_FILE: countFile },
      encoding: "utf8",
    },
  );
  const milliseconds = performance.now() - start;
  if (result.status !== 0) throw new Error(`zinfer failed:\n${result.stderr}${result.stdout}`);
  return { milliseconds, snapshots: Number(readFileSync(countFile, "utf8")) };
}

// zod must resolve from this package's node_modules, so the workload lives under it.
const dir = mkdtempSync(join(here, ".workload-"));
try {
  writeWorkload(dir);
  const runs = Array.from({ length: RUNS }, () => generate(dir));
  const times = runs.map((run) => run.milliseconds).sort((a, b) => a - b);
  const snapshots = runs[0].snapshots;
  if (runs.some((run) => run.snapshots !== snapshots))
    throw new Error("snapshot count differs between runs");
  const median = Math.round(times[Math.floor(RUNS / 2)]);

  writeFileSync(
    metricsPath,
    JSON.stringify({
      key: "zinfer_generation",
      name: "zinfer generation",
      metrics: [
        { key: "native_snapshots", name: "Native snapshots created", value: snapshots, unit: "" },
        { key: "median_time", name: "Median generation time", value: median, unit: "ms" },
      ],
      acceptables: [`current.native_snapshots <= ${MAX_NATIVE_SNAPSHOTS}`],
    }),
  );
  console.log(
    `${FILES} files: ${snapshots} native snapshots, median ${median}ms of ${times.map(Math.round).join("/")}ms`,
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
