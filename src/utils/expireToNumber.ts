import { SignOptions } from "jsonwebtoken";

// Converts a SignOptions['expiresIn'] like "1h", "30m", "15d" into milliseconds
const expireToNumber = (expire: SignOptions["expiresIn"]): number => {
  if (typeof expire === "number") {
    return expire * 1000;
  }

  if (!expire) {
    throw new Error("expiresIn is undefined");
  }

  const units: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    y: 365.25 * 24 * 60 * 60 * 1000,
  };

  const match = expire.match(/^(\d+)(ms|s|m|h|d|w|y)$/i);

  if (!match) {
    throw new Error(`Unsupported or invalid format: "${expire}"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  return value * units[unit];
};

export default expireToNumber;
