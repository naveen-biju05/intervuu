/**
 * Gemma 3 4B — Centralized AI Service
 *
 * Unified function for all AI calls. Sends plain-text prompts to the
 * Gemma 3 4B IT model via Google's Generative Language API (same
 * infrastructure as Gemini, different model).
 *
 * Features:
 *   - Automatic JSON parsing with retry on malformed output
 *   - Markdown fence stripping
 *   - Configurable via GEMMA_API_KEY and GEMMA_MODEL env vars
 */

const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_RETRIES = 2;

/**
 * Get the configured API key.
 */
const getApiKey = () => process.env.GEMMA_API_KEY;

/**
 * Get the configured model name.
 */
const getModel = () => process.env.GEMMA_MODEL || DEFAULT_MODEL;

/**
 * Check whether the AI service is configured (key present).
 */
const isConfigured = () => !!getApiKey();

/**
 * Log key status (safe — only shows first 4 chars).
 */
const logKeyStatus = (tag = "GemmaService") => {
  const key = getApiKey();
  console.log(
    `[${tag}] GEMMA_API_KEY is`,
    key ? "LOADED (starts with " + key.substring(0, 4) + ")" : "MISSING",
  );
};

/**
 * Call Gemma and return raw text.
 *
 * @param {string} prompt  Plain-text prompt
 * @returns {string}       Raw model output
 */
async function callGemma(prompt) {
  const key = getApiKey();
  if (!key) throw new Error("GEMMA_API_KEY is not set");

  const model = getModel();
  console.log("Using model:", model);
  const url = `${BASE_URL}/${model}:generateContent?key=${key}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    console.error(`[GemmaService] API HTTP ${response.status}:`, errBody);
    throw new Error("Gemma API HTTP " + response.status);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

/**
 * Strip markdown code fences from model output.
 */
function stripMarkdownFences(text) {
  let cleaned = text.trim();
  // Remove ```json ... ``` or ``` ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }
  return cleaned.trim();
}

/**
 * Call Gemma and parse the response as JSON.
 * Retries up to MAX_RETRIES times if JSON.parse fails.
 *
 * @param {string} prompt       Plain-text prompt (should ask for strict JSON)
 * @param {*}      fallback     Value to return if all retries fail (default: null)
 * @param {number} retries      Number of retry attempts
 * @returns {any}               Parsed JSON object / array
 */
async function callGemmaJSON(prompt, fallback = null, retries = MAX_RETRIES) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const raw = await callGemma(prompt);

      console.log("\n========== GEMMA RAW ==========");
      console.log(raw);
      console.log("================================\n");

      let cleaned = stripMarkdownFences(raw);

      // Extract the first JSON object from the response
      // Extract JSON object OR array from the response
      const firstObj = cleaned.indexOf("{");
      const firstArr = cleaned.indexOf("[");

      let start = -1;

      if (firstObj === -1) start = firstArr;
      else if (firstArr === -1) start = firstObj;
      else start = Math.min(firstObj, firstArr);

      if (start === -1) throw new Error("No JSON found.");

      cleaned = cleaned.substring(start);

      const lastObj = cleaned.lastIndexOf("}");
      const lastArr = cleaned.lastIndexOf("]");

      const end = Math.max(lastObj, lastArr);

      if (end === -1) throw new Error("Incomplete JSON.");

      cleaned = cleaned.substring(0, end + 1);

      const parsed = JSON.parse(cleaned);
      return parsed;
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(
          `[GemmaService] JSON parse attempt ${attempt + 1}/${retries + 1} failed: ${err.message}. Retrying...`,
        );
      }
    }
  }

  console.error(
    "[GemmaService] All JSON parse attempts failed:",
    lastError?.message,
  );

  if (fallback !== null) return fallback;
  throw lastError;
}

export { callGemma, callGemmaJSON, isConfigured, logKeyStatus, getApiKey };
