chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyze_bias") {
    // 1. Get settings from storage (Now including 'geminiLanguage')
    chrome.storage.local.get(
      ["geminiApiKey", "geminiModel", "geminiLanguage"],
      (result) => {
        const apiKey = result.geminiApiKey;
        const modelName = result.geminiModel || "gemini-2.5-flash";
        const language = result.geminiLanguage || "English"; // Default to English

        if (!apiKey) {
          sendResponse({
            success: false,
            error:
              "Missing API Key. Please open the extension popup (click the icon) to set it.",
          });
          return;
        }

        // 2. Start Analysis
        analyzeWithRetry(request.transcript, apiKey, modelName, language)
          .then((data) => sendResponse({ success: true, data: data }))
          .catch((error) =>
            sendResponse({ success: false, error: error.message })
          );
      }
    );

    return true; // Keep channel open
  }
});

async function analyzeWithRetry(
  transcript,
  apiKey,
  modelName,
  language,
  retries = 3,
  delay = 2000
) {
  try {
    return await callGeminiAPI(transcript, apiKey, modelName, language);
  } catch (error) {
    if (
      retries > 0 &&
      (error.message.includes("overloaded") || error.message.includes("503"))
    ) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return analyzeWithRetry(
        transcript,
        apiKey,
        modelName,
        language,
        retries - 1,
        delay * 2
      );
    }
    throw error;
  }
}

async function callGeminiAPI(transcript, apiKey, modelName, language) {
  const safeTranscript = transcript.substring(0, 35000);
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const prompt = `
  You are a neutral news analyst with access to Google Search.
  
  TASK:
  1. Analyze the transcript (which has [time_in_seconds] tags).
  2. Use Google Search to verify claims against current news.
  3. Create "Smart Chapters" for key topics.
  4. Identify factual errors and note the specific timestamp where they occur.
  5. **Determine political bias as a percentage (0-100). The three values (Left, Center, Right) MUST sum to exactly 100.**
  6. If no factual errors then output time : 00:00s and correction as "You are watching 100% factual error free video"

  LANGUAGE REQUIREMENT:
  Translate ALL your output (Topic labels, error explanations, etc.) into ${language}.
  
  OUTPUT FORMAT:
  Strictly return valid JSON. Do not use Markdown.
  {
    "bias": { 
      "left": int, 
      "center": int, 
      "right": int 
    },
    "chapters": [
      { "time": int, "label": "Short Topic Title in ${language}" }
    ],
    "errors": [
      { "time": int, "correction": "Explanation of the error in ${language}." }
    ]
  }

  TRANSCRIPT:
  ${safeTranscript}
  `;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE",
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE",
        },
      ],
    }),
  });

  const data = await response.json();

  if (data.error) throw new Error(data.error.message);

  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new Error(
      `Blocked by Safety Filter: ${data.promptFeedback.blockReason}`
    );
  }

  if (!data.candidates || !data.candidates[0].content) {
    throw new Error("Gemini refused to answer.");
  }

  let rawText = data.candidates[0].content.parts[0].text;
  return cleanAndParseJSON(rawText);
}

function cleanAndParseJSON(text) {
  let cleanText = text.replace(/```json/g, "").replace(/```/g, "");
  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Invalid Response: No JSON object found.");
  }

  cleanText = cleanText.substring(firstBrace, lastBrace + 1);

  try {
    return JSON.parse(cleanText);
  } catch (e) {
    try {
      const fixedText = cleanText.replace(/[\n\r\t]/g, " ");
      return JSON.parse(fixedText);
    } catch (finalError) {
      throw new Error("Failed to parse AI response.");
    }
  }
}
