import { spawn } from "node:child_process";
import { createServer } from "vite";

const companion = spawn(process.execPath, ["companion/server.mjs"], {
  cwd: process.cwd(),
  stdio: "inherit",
});
const web = await createServer({
  server: { host: "127.0.0.1", port: 4173 },
});
await web.listen();
web.printUrls();

let shuttingDown = false;

async function stop(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  companion.kill();
  await web.close();
  process.exit(exitCode);
}

companion.on("exit", (code) => {
  if (!shuttingDown) void stop(code ?? 1);
});
process.on("SIGINT", () => void stop(0));
process.on("SIGTERM", () => void stop(0));

console.log("Trace 本地模式正在启动：应用与只读本地伴侣将一起运行。 ");
