import color from "picocolors";

const PRIVATE_KEY_PATTERN = /0x[0-9a-fA-F]{64}/g;

export function redact(input: string): string {
  if (typeof input !== "string") return input;
  return input.replace(PRIVATE_KEY_PATTERN, "[REDACTED_KEY]");
}

export const logger = {
  info: (msg: string) => console.log(color.cyan(redact(msg))),
  warn: (msg: string) => console.warn(color.yellow(redact(msg))),
  error: (msg: string) => console.error(color.red(redact(msg))),
  success: (msg: string) => console.log(color.green(redact(msg))),
};
