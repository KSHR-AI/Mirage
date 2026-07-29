import path from "node:path";
import { invariant, PublishingError } from "./errors.mjs";

export function parseOptions(argv, specification) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    invariant(
      argument.startsWith("--"),
      `Unexpected positional argument "${argument}"`,
    );
    const name = argument.slice(2);
    const rule = specification[name];
    invariant(rule, `Unknown option "--${name}"`);
    invariant(!Object.hasOwn(options, name), `Duplicate option "--${name}"`);

    if (rule.type === "boolean") {
      options[name] = true;
      continue;
    }

    const value = argv[index + 1];
    invariant(
      value !== undefined && !value.startsWith("--"),
      `Option "--${name}" requires a value`,
    );
    options[name] = value;
    index += 1;
  }

  for (const [name, rule] of Object.entries(specification)) {
    if (rule.required) {
      invariant(Object.hasOwn(options, name), `Missing option "--${name}"`);
    }
    if (!Object.hasOwn(options, name) && Object.hasOwn(rule, "default")) {
      options[name] = rule.default;
    }
    if (Object.hasOwn(options, name) && rule.choices) {
      invariant(
        rule.choices.includes(options[name]),
        `Option "--${name}" must be one of: ${rule.choices.join(", ")}`,
      );
    }
  }

  return options;
}

export function resolvePathOption(value, cwd = process.cwd()) {
  return path.resolve(cwd, value);
}

export async function runCli(main) {
  try {
    await main();
  } catch (error) {
    if (error instanceof PublishingError) {
      process.stderr.write(`publishing error: ${error.message}\n`);
      if (error.details) {
        process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
      }
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}
