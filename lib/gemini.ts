// Gemini client for the agent's reasoning. Server-only.
import "server-only";
import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";

let _ai: GoogleGenAI | null = null;
export function getGemini(): GoogleGenAI {
  if (!_ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing env var GEMINI_API_KEY");
    _ai = new GoogleGenAI({ apiKey });
  }
  return _ai;
}
