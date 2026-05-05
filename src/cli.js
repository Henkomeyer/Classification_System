import { readFileSync } from "node:fs";
import { classifySms } from "./classifier.js";

function readInput() {
  const argumentText = process.argv.slice(2).join(" ").trim();
  if (argumentText) {
    return argumentText;
  }

  if (!process.stdin.isTTY) {
    return readFileSync(0, "utf8").trim();
  }

  return "";
}

const text = readInput();

try {
  const result = await classifySms(text);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Classification failed: ${error.message}`);
  console.error("Check that Ollama is running and the configured model is pulled.");
  process.exitCode = 1;
}
