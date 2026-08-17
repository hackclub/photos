import { spawn } from "node:child_process";

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} exited with ${signal || `code ${code}`}`,
        ),
      );
    });
  });
}

const shouldMigrate =
  process.env.VERCEL_ENV === "production" ||
  (process.env.VERCEL_ENV === "preview" &&
    process.env.MIGRATE_PREVIEW_DATABASE === "true");

if (shouldMigrate) {
  console.log("Running database migrations before the Vercel build...");
  await run("bun", ["run", "db:migrate"]);
}

await run("bun", ["run", "build"]);
