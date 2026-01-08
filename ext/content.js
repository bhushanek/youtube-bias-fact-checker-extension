/* ============================================================================
   PART 1: ROBUST UI INJECTION (The Fix)
   ============================================================================ */

// We use a "MutationObserver" to watch for YouTube's lazy loading
const observer = new MutationObserver((mutations) => {
  if (!document.getElementById("yt-bias-analyze-btn")) {
    injectUI();
  }
});

// Start watching the page body for changes immediately
observer.observe(document.body, { childList: true, subtree: true });

function injectUI() {
  // 1. Check if button already exists to avoid duplicates
  if (document.getElementById("yt-bias-analyze-btn")) return;

  // 2. List of possible locations for the button (YouTube changes these often)
  const selectors = [
    "#top-level-buttons-computed", // Classic location
    "ytd-menu-renderer #top-level-buttons-computed",
    "#actions-inner #top-level-buttons-computed",
    "#actions.ytd-watch-metadata", // Newer "Cinema" or "Ambient" modes
    "#flexible-item-buttons", // Alternate layout
  ];

  let targetContainer = null;

  // 3. Find the first valid container
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      targetContainer = el;
      console.log(`[Bias Checker] Found container: ${selector}`);
      break;
    }
  }

  // 4. Inject if found
  if (targetContainer) {
    const btn = document.createElement("button");
    btn.id = "yt-bias-analyze-btn";
    btn.innerHTML = `<span style="font-size:16px; margin-right:5px;">✨</span> Analyze Bias`;
    btn.onclick = handleAnalyzeClick;

    // Insert as the FIRST item (before the Like button)
    targetContainer.insertBefore(btn, targetContainer.firstChild);
  }
}

/* ============================================================================
   PART 2: INTERACTION HANDLER
   ============================================================================ */
async function handleAnalyzeClick() {
  const btn = document.getElementById("yt-bias-analyze-btn");
  const originalBtnContent = btn.innerHTML;

  if (!chrome.runtime?.id) {
    alert("Extension updated. Please refresh the page.");
    return;
  }

  btn.innerText = "🔍 Processing...";
  btn.disabled = true;

  try {
    const videoId = new URLSearchParams(window.location.search).get("v");
    if (!videoId) throw new Error("No Video ID found.");

    // 1. Fetch
    const rawTranscript = await getYouTubeTranscript(videoId);

    // Debug log for lengths
    const rawTextJoined = rawTranscript.map((t) => t.text).join(" ");
    console.log(
      `%c[Original] Length: ${rawTextJoined.length} chars`,
      "color: orange"
    );

    // 2. Cut Sponsors
    btn.innerText = "✂️ Trimming...";
    const sponsorSegments = await getSponsorSegments(videoId);

    // NOTE: Ensure you have added the 'filterSponsorSegments' function to your file!
    const cleanSegments = filterSponsorSegments(rawTranscript, sponsorSegments);

    // 3. Format with Timestamps for Gemini: "[12] text... [24] text..."
    // We create a NEW variable here called 'cleanTextWithTime'
    const cleanTextWithTime = cleanSegments
      .map((s) => `[${Math.floor(s.start)}] ${s.text}`)
      .join(" ");

    console.log(
      `%c[Trimmed] Length: ${cleanTextWithTime.length} chars`,
      "color: green"
    );

    btn.innerText = "20-30s⏱️ AI Thinking...";

    // 4. Send to Background
    chrome.runtime.sendMessage(
      { action: "analyze_bias", transcript: cleanTextWithTime },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          displayError("Connection failed. Please refresh the page.");
          btn.innerHTML = originalBtnContent;
          btn.disabled = false;
          return;
        }

        if (response && response.success) {
          displayResults(response.data);
        } else {
          displayError(response.error || "Unknown error.");
        }

        btn.innerHTML = originalBtnContent;
        btn.disabled = false;
      }
    );
  } catch (err) {
    console.error(err);
    displayError(err.message);
    btn.innerHTML = originalBtnContent;
    btn.disabled = false;
  }
}

// --- UPDATED ERROR DISPLAY HELPER ---
function displayError(message) {
  const oldBox = document.getElementById("yt-bias-result-box");
  if (oldBox) oldBox.remove();

  const descriptionContainer =
    document.querySelector("#description-inner") ||
    document.querySelector("#meta");
  if (!descriptionContainer) return;

  const box = document.createElement("div");
  box.id = "yt-bias-result-box";
  box.style.borderLeft = "5px solid #ef4444"; // Red border

  // Custom Tip Logic
  let tip =
    "This often happens with videos containing sensitive topics (war, crime, etc.) that trigger AI safety filters.";

  // CHECK FOR OVERLOAD ERROR SPECIFICALLY
  if (message.includes("overloaded") || message.includes("503")) {
    message = "The AI model is currently overloaded.";
    tip = "Google's servers are busy. Please wait 10 seconds and try again.";
  } else if (message.includes("Extension context invalidated")) {
    message = "Extension updated.";
    tip = "Please refresh the web page to reconnect.";
  }

  box.innerHTML = `
    <div class="gemini-header" style="color: #ef4444;">
      ⚠️ Analysis Failed
    </div>
    <div class="gemini-summary-content">
      <p><strong>Error:</strong> ${message}</p>
      <p style="font-size: 13px; color: #666; margin-top: 8px;"><em>Tip: ${tip}</em></p>
    </div>
  `;

  descriptionContainer.parentElement.insertBefore(box, descriptionContainer);
}

/* ============================================================================
   PART 3: SPONSORBLOCK & TRANSCRIPT LOGIC (Keep as is)
   ============================================================================ */

async function getSponsorSegments(videoId) {
  try {
    const categories = `["sponsor","selfpromo","interaction","intro","outro"]`;
    const url = `https://sponsor.ajay.app/api/skipSegments?videoID=${videoId}&categories=${categories}`;
    const res = await fetch(url);
    if (res.status === 404) return [];
    const data = await res.json();
    return data.map((item) => ({
      start: item.segment[0],
      end: item.segment[1],
      category: item.category,
    }));
  } catch (e) {
    console.warn("SponsorBlock skipped or failed:", e);
    return [];
  }
}

// Replace your old removeSponsorSegments with this one
function filterSponsorSegments(transcriptArray, sponsorSegments) {
  if (!sponsorSegments || sponsorSegments.length === 0) {
    return transcriptArray;
  }
  return transcriptArray.filter((line) => {
    // Keep lines that DO NOT overlap with a sponsor segment
    return !sponsorSegments.some(
      (seg) => line.start >= seg.start && line.start < seg.end
    );
  });
}

// NEW: Function to control the YouTube player
function seekTo(seconds) {
  const video = document.querySelector("video");
  if (video) {
    video.currentTime = seconds;
    video.play();
    // Scroll to top to see video if user is reading comments
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

/* ============================================================================
   PART 4: HELPERS (Transcript, Display, etc.)
   ============================================================================ */

async function getYouTubeTranscript(videoId) {
  try {
    const baseUrl = getCaptionBaseUrl();
    if (baseUrl) {
      const pot = await getPotToken(videoId);
      const targetUrl = pot
        ? `${baseUrl}&fmt=json3&pot=${pot}&c=WEB`
        : `${baseUrl}&fmt=json3`;
      const response = await fetch(targetUrl);
      const json = await response.json();
      if (json.events) return parseTranscriptAPI(json.events);
    }
  } catch (e) {
    console.warn("API transcript failed", e);
  }

  try {
    const domData = await scrapeTranscriptFromDOM();
    if (domData) return domData;
  } catch (e) {
    console.warn("DOM transcript failed", e);
  }

  throw new Error("Could not fetch transcript. Video might not have CC.");
}

function parseTranscriptAPI(events) {
  return events
    .filter((e) => e.segs && e.tStartMs)
    .map((e) => ({
      start: parseInt(e.tStartMs) / 1000,
      text: e.segs
        .map((s) => s.utf8)
        .join(" ")
        .trim(),
    }))
    .filter((item) => item.text.length > 0);
}

async function scrapeTranscriptFromDOM() {
  const menuButtons = document.querySelectorAll("button, yt-button-renderer");
  let transcriptBtn = null;
  for (const btn of menuButtons) {
    if (btn.getAttribute("aria-label")?.includes("Show transcript")) {
      transcriptBtn = btn;
      break;
    }
  }
  if (!transcriptBtn) {
    const descExpandBtn = document.querySelector("#expand");
    if (descExpandBtn) descExpandBtn.click();
    await new Promise((r) => setTimeout(r, 500));
    transcriptBtn = document.querySelector(
      'button[aria-label="Show transcript"]'
    );
  }
  if (!transcriptBtn) return null;
  transcriptBtn.click();
  await new Promise((r) => setTimeout(r, 1000));

  const segments = document.querySelectorAll("ytd-transcript-segment-renderer");
  if (!segments.length) return null;
  const results = [];
  segments.forEach((seg) => {
    const timeStr = seg
      .querySelector(".segment-timestamp")
      ?.textContent?.trim();
    const text = seg.querySelector("yt-formatted-string")?.textContent?.trim();
    if (text) results.push({ start: parseTime(timeStr), text: text });
  });
  return results;
}

function parseTime(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function getCaptionBaseUrl() {
  try {
    let playerResponse = window.ytInitialPlayerResponse;
    if (!playerResponse) {
      const scripts = document.querySelectorAll("script");
      for (const script of scripts) {
        if (script.textContent.includes("ytInitialPlayerResponse")) {
          const match = script.textContent.match(
            /ytInitialPlayerResponse\s*=\s*(\{.+?\});/
          );
          if (match) {
            playerResponse = JSON.parse(match[1]);
            break;
          }
        }
      }
    }
    const tracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (tracks?.length) {
      const en = tracks.find((t) => t.languageCode === "en");
      return en ? en.baseUrl : tracks[0].baseUrl;
    }
  } catch (e) {
    console.warn(e);
  }
  return null;
}

const potTokenCache = new Map();
async function getPotToken(videoId) {
  const cacheKey = `yt-pot-${videoId}`;
  if (potTokenCache.has(cacheKey)) return potTokenCache.get(cacheKey);
  const selector = ".ytp-subtitles-button";
  const ccButton = document.querySelector(selector);
  if (!ccButton) return "";
  return new Promise((resolve) => {
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (
          entry.name.includes("/api/timedtext") &&
          entry.name.includes("pot=")
        ) {
          const pot = new URL(entry.name).searchParams.get("pot");
          if (pot) {
            potTokenCache.set(cacheKey, pot);
            observer.disconnect();
            resolve(pot);
            return;
          }
        }
      }
    });
    observer.observe({ entryTypes: ["resource"] });
    ccButton.click();
    setTimeout(() => ccButton.click(), 50);
    setTimeout(() => {
      observer.disconnect();
      resolve("");
    }, 2000);
  });
}

function displayResults(data) {
  const oldBox = document.getElementById("yt-bias-result-box");
  if (oldBox) oldBox.remove();

  const descriptionContainer =
    document.querySelector("#description-inner") ||
    document.querySelector("#meta");
  if (!descriptionContainer) return;

  const box = document.createElement("div");
  box.id = "yt-bias-result-box";

  // 1. Build Chapters HTML
  let chaptersHtml = "";
  if (data.chapters && data.chapters.length > 0) {
    chaptersHtml = `<div style="margin-top: 15px;"><strong>📖 Smart Chapters</strong><ul style="list-style: none; padding: 0; margin-top: 5px;">`;
    data.chapters.forEach((chap) => {
      const timeStr = new Date(chap.time * 1000).toISOString().substr(14, 5); // Format 125 -> 02:05
      chaptersHtml += `
        <li style="margin-bottom: 6px; cursor: pointer; color: #065fd4;" class="seek-link" data-time="${chap.time}">
          <span style="font-family: monospace; background: #eee; padding: 2px 4px; border-radius: 4px; margin-right: 5px;">${timeStr}</span>
          ${chap.label}
        </li>`;
    });
    chaptersHtml += `</ul></div>`;
  }

  // 2. Build Errors HTML
  let errorsHtml = "";
  if (data.errors && data.errors.length > 0) {
    errorsHtml = `<div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ddd;"><strong>⚠️ Fact Checks</strong><ul style="list-style: none; padding: 0; margin-top: 5px;">`;
    data.errors.forEach((err) => {
      const timeStr = new Date(err.time * 1000).toISOString().substr(14, 5);
      errorsHtml += `
        <li style="margin-bottom: 8px;">
          <button class="seek-btn-red" data-time="${err.time}">Jump to ${timeStr}</button>
          <span style="color: #c00;">${err.correction}</span>
        </li>`;
    });
    errorsHtml += `</ul></div>`;
  }

  box.innerHTML = `
    <div class="gemini-header"><span class="sparkle-icon">✨</span> AI Fact Check and TimeStamps</div>
    
    <div class="bias-meter-container">
      <div class="bias-labels">
        <span class="label-left">Left ${data.bias.left}%</span>
        <span class="label-center">Center ${data.bias.center}%</span>
        <span class="label-right">Right ${data.bias.right}%</span>
      </div>
      <div class="bias-bar">
        <div class="bias-segment bias-left" style="width: ${data.bias.left}%"></div>
        <div class="bias-segment bias-center" style="width: ${data.bias.center}%"></div>
        <div class="bias-segment bias-right" style="width: ${data.bias.right}%"></div>
      </div>
    </div>

    ${chaptersHtml}
    ${errorsHtml}
  `;

  descriptionContainer.parentElement.insertBefore(box, descriptionContainer);

  // 3. Attach Click Listeners for Seeks
  box.querySelectorAll(".seek-link, .seek-btn-red").forEach((el) => {
    el.addEventListener("click", (e) => {
      const seconds = parseInt(e.currentTarget.getAttribute("data-time"));
      seekTo(seconds);
    });
  });
}

function formatGeminiText(text) {
  if (!text) return "";
  let safeText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  safeText = safeText.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  const lines = safeText.split("\n");
  let html = "";
  let inList = false;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      if (!inList) {
        html += "<ul>";
        inList = true;
      }
      html += `<li>${trimmed.substring(2)}</li>`;
    } else {
      if (inList) {
        html += "</ul>";
        inList = false;
      }
      html += `<p>${trimmed}</p>`;
    }
  });
  if (inList) html += "</ul>";
  return html;
}
