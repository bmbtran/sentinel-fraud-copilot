import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const dataDir = fileURLToPath(new URL("../data/", import.meta.url));
const filePath = join(dataDir, "scenarios.json");
let scenarios = [];
export async function initializeScenarios() { await mkdir(dataDir, { recursive: true }); try { scenarios = JSON.parse(await readFile(filePath, "utf8")); } catch { scenarios = []; } if (!Array.isArray(scenarios)) scenarios = []; }
export function listScenarios() { return scenarios; }
export async function saveScenario(scenario) { scenarios = [scenario, ...scenarios.filter((item) => item.id !== scenario.id)]; await writeFile(filePath, JSON.stringify(scenarios, null, 2)); return scenario; }
