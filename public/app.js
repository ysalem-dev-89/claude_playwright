const profileTextarea = document.getElementById("profile-json");
const applyBtn = document.getElementById("apply-btn");
const logEl = document.getElementById("log");
const resultEl = document.getElementById("result");
const resultMessageEl = document.getElementById("result-message");
const resultConfirmationEl = document.getElementById("result-confirmation");
const aiOption = document.getElementById("ai-option");
const aiKeyHint = document.getElementById("ai-key-hint");
const canvas = document.getElementById("live-canvas");
const canvasCtx = canvas.getContext("2d");
const canvasPlaceholder = document.getElementById("canvas-placeholder");

init();

async function init() {
  const profile = await fetch("/api/sample-profile").then((r) => r.json());
  profileTextarea.value = JSON.stringify(profile, null, 2);

  const { available } = await fetch("/api/ai-available").then((r) => r.json());
  if (!available) {
    aiOption.disabled = true;
    aiKeyHint.hidden = false;
  }
}

applyBtn.addEventListener("click", async () => {
  let profile;
  try {
    profile = JSON.parse(profileTextarea.value);
  } catch (err) {
    appendLog("error", `Profile JSON is invalid: ${err.message}`);
    return;
  }

  const strategy = document.querySelector('input[name="strategy"]:checked').value;

  logEl.innerHTML = "";
  resultEl.hidden = true;
  canvasPlaceholder.hidden = true;
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  applyBtn.disabled = true;
  applyBtn.textContent = "Applying...";

  try {
    const response = await fetch("/api/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, strategy }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        handleEvent(JSON.parse(line));
      }
    }
  } catch (err) {
    appendLog("error", `Request failed: ${err.message}`);
  } finally {
    applyBtn.disabled = false;
    applyBtn.textContent = "Apply to Job";
  }
});

function handleEvent(event) {
  if (event.type === "log") {
    appendLog(event.level, event.message, event.timestamp);
  } else if (event.type === "frame") {
    drawFrame(event.imageDataUrl);
  } else if (event.type === "done") {
    resultEl.hidden = false;
    resultMessageEl.textContent = event.message;
    resultMessageEl.className = event.success ? "ok" : "fail";

    if (event.confirmationText) {
      resultConfirmationEl.textContent = event.confirmationText;
      resultConfirmationEl.hidden = false;
    } else {
      resultConfirmationEl.hidden = true;
    }
  }
}

function drawFrame(dataUrl) {
  const img = new Image();
  img.onload = () => canvasCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.src = dataUrl;
}

function appendLog(level, message, timestamp) {
  const entry = document.createElement("div");
  entry.className = `entry ${level}`;
  const ts = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  entry.innerHTML = `<span class="ts">${ts}</span>${escapeHtml(message)}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
