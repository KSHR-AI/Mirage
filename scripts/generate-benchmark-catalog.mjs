import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { format } from "prettier";

const repositoryRoot = process.cwd();
const outputPath = path.join(
  repositoryRoot,
  "app",
  "benchmark",
  "catalog.generated.json",
);

async function readJsonDirectory(relativeDirectory) {
  const directory = path.join(repositoryRoot, relativeDirectory);
  const fileNames = (await readdir(directory))
    .filter((fileName) => fileName.endsWith(".json"))
    .sort();

  return Promise.all(
    fileNames.map(async (fileName) => {
      const filePath = path.join(directory, fileName);
      const source = await readFile(filePath, "utf8");

      try {
        return JSON.parse(source);
      } catch (error) {
        throw new Error(
          `Invalid JSON in ${path.relative(repositoryRoot, filePath)}: ${error.message}`,
        );
      }
    }),
  );
}

const catalog = {
  tasks: await readJsonDirectory("benchmark/tasks"),
  submissions: await readJsonDirectory("benchmark/submissions"),
};

if (catalog.tasks.length !== 1) {
  throw new Error(
    `Expected exactly one benchmark task, found ${catalog.tasks.length}.`,
  );
}

if (catalog.submissions.length === 0) {
  throw new Error("Expected at least one benchmark submission.");
}

const generatedSource = await format(JSON.stringify(catalog), {
  parser: "json",
  filepath: outputPath,
});

if (process.argv.includes("--check")) {
  let committedSource = "";
  try {
    committedSource = await readFile(outputPath, "utf8");
  } catch {
    // A missing generated catalog is reported by the comparison below.
  }

  if (committedSource !== generatedSource) {
    console.error(
      "The generated benchmark catalog is stale. Run `pnpm catalog:generate`.",
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(outputPath, generatedSource);
}
