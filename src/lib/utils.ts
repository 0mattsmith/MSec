import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import * as OTPAuth from "otpauth";
import zxcvbn from "zxcvbn";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generatePassword(options: {
  length: number;
  uppercase: boolean;
  lowercase: boolean;
  numbers: boolean;
  symbols: boolean;
}) {
  const chars = {
    uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
    lowercase: "abcdefghijklmnopqrstuvwxyz",
    numbers: "0123456789",
    symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
  };

  let allowedChars = "";
  if (options.uppercase) allowedChars += chars.uppercase;
  if (options.lowercase) allowedChars += chars.lowercase;
  if (options.numbers) allowedChars += chars.numbers;
  if (options.symbols) allowedChars += chars.symbols;

  if (allowedChars === "") return "";

  let password = "";
  // Ensure at least one of each required type
  if (options.uppercase) password += chars.uppercase[Math.floor(Math.random() * chars.uppercase.length)];
  if (options.lowercase) password += chars.lowercase[Math.floor(Math.random() * chars.lowercase.length)];
  if (options.numbers) password += chars.numbers[Math.floor(Math.random() * chars.numbers.length)];
  if (options.symbols) password += chars.symbols[Math.floor(Math.random() * chars.symbols.length)];

  while (password.length < options.length) {
    const randomIndex = Math.floor(Math.random() * allowedChars.length);
    password += allowedChars[randomIndex];
  }

  // Shuffle
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}

export function checkPasswordStrength(password: string) {
  if (!password) return { score: 0, label: "Empty", color: "bg-gray-200" };
  const result = zxcvbn(password);
  const labels = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const colors = [
    "bg-red-500",
    "bg-orange-500",
    "bg-yellow-500",
    "bg-emerald-500",
    "bg-green-600"
  ];
  return {
    score: result.score,
    label: labels[result.score],
    color: colors[result.score],
  };
}

export function generateTOTP(secret: string) {
  try {
    // Strip spaces from secret if any
    const cleanSecret = secret.replace(/\s+/g, '').toUpperCase();
    const totp = new OTPAuth.TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(cleanSecret),
    });
    return totp.generate();
  } catch (e) {
    return null;
  }
}

export function getTimeUntilNextTOTP() {
  const now = Math.floor(Date.now() / 1000);
  return 30 - (now % 30);
}

let clipboardClearTimeout: NodeJS.Timeout | null = null;
export function copyToClipboardWithTimeout(text: string, timeoutSeconds: number) {
  navigator.clipboard.writeText(text);
  if (clipboardClearTimeout) {
    clearTimeout(clipboardClearTimeout);
    clipboardClearTimeout = null;
  }
  if (timeoutSeconds > 0) {
    clipboardClearTimeout = setTimeout(() => {
      navigator.clipboard.writeText('');
    }, timeoutSeconds * 1000);
  }
}

