const profileTextarea = document.getElementById("profile-json");
const fillBtn = document.getElementById("fill-btn");
const submitBtn = document.getElementById("submit-btn");
const autoSubmitToggle = document.getElementById("auto-submit-toggle");
const logEl = document.getElementById("log");
const resultEl = document.getElementById("result");
const resultMessageEl = document.getElementById("result-message");
const resultConfirmationEl = document.getElementById("result-confirmation");
const aiOption = document.getElementById("ai-option");
const aiKeyHint = document.getElementById("ai-key-hint");
const canvas = document.getElementById("live-canvas");
const canvasCtx = canvas.getContext("2d");
const liveStatusEl = document.getElementById("live-status");

let sessionId = null;
let ws = null;

init();

async function init() {
  const profile = await fetch("/api/sample-profile").then((r) => r.json());
  profileTextarea.value = JSON.stringify(profile, null, 2);

  const { available } = await fetch("/api/ai-available").then((r) => r.json());
  if (!available) {
    aiOption.disabled = true;
    aiKeyHint.hidden = false;
  }

  document.querySelectorAll('input[name="strategy"]').forEach((el) => {
    el.addEventListener("change", () => {
      appendLog("info", `Switching to ${el.value === "ai" ? "AI (Stagehand + Claude)" : "Heuristic (no AI)"} — resetting the live view.`);
      startSession(el.value);
    });
  });

  setupCanvasInput();
  await startSession(currentStrategy());
}

function currentStrategy() {
  return document.querySelector('input[name="strategy"]:checked').value;
}

async function startSession(strategy) {
  liveStatusEl.textContent = "connecting…";
  liveStatusEl.className = "live-status";
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

  if (ws) {
    ws.onclose = null;
    ws.close();
    ws = null;
  }
  const previousSessionId = sessionId;
  sessionId = null;

  if (previousSessionId) {
    fetch(`/api/session/${previousSessionId}`, { method: "DELETE" }).catch(() => {});
  }

  let response;
  try {
    response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy }),
    });
  } catch (err) {
    appendLog("error", `Could not reach the server: ${err.message}`);
    liveStatusEl.textContent = "offline";
    liveStatusEl.className = "live-status offline";
    return;
  }

  if (!response.ok) {
    const { error } = await response.json().catch(() => ({ error: "Unknown error starting session." }));
    appendLog("error", error);
    liveStatusEl.textContent = "offline";
    liveStatusEl.className = "live-status offline";
    return;
  }

  const data = await response.json();
  sessionId = data.sessionId;
  connectWebSocket(sessionId);
}

function connectWebSocket(id) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(`${protocol}//${location.host}/ws/session/${id}`);

  ws.onopen = () => {
    liveStatusEl.textContent = "live";
    liveStatusEl.className = "live-status live";
  };
  ws.onclose = () => {
    liveStatusEl.textContent = "disconnected";
    liveStatusEl.className = "live-status offline";
  };
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "frame") drawFrame(msg.imageDataUrl);
  };
}

function setupCanvasInput() {
  canvas.addEventListener("click", (event) => {
    canvas.focus();
    const { x, y } = toCanvasCoordinates(event);
    sendInput({ type: "click", x, y });
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    sendInput({ type: "wheel", deltaY: event.deltaY });
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    event.preventDefault();
    sendInput({ type: "key", key: event.key });
  });
}

function toCanvasCoordinates(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.round((event.clientX - rect.left) * scaleX),
    y: Math.round((event.clientY - rect.top) * scaleY),
  };
}

function sendInput(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

fillBtn.addEventListener("click", async () => {
  if (!sessionId) {
    appendLog("error", "No live session yet — try again in a moment.");
    return;
  }

  let profile;
  try {
    profile = JSON.parse(profileTextarea.value);
  } catch (err) {
    appendLog("error", `Profile JSON is invalid: ${err.message}`);
    return;
  }

  resultEl.hidden = true;
  setButtonsBusy(true);
  fillBtn.textContent = "Filling...";

  try {
    const response = await fetch(`/api/session/${sessionId}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, autoSubmit: autoSubmitToggle.checked }),
    });

    if (!response.ok) {
      const { error } = await response.json().catch(() => ({ error: "Fill request failed." }));
      appendLog("error", error);
      return;
    }

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
    setButtonsBusy(false);
    fillBtn.textContent = "Fill Fields";
  }
});

submitBtn.addEventListener("click", async () => {
  if (!sessionId) {
    appendLog("error", "No live session yet — try again in a moment.");
    return;
  }

  setButtonsBusy(true);
  submitBtn.textContent = "Submitting...";
  appendLog("info", "Submitting application...");

  try {
    const response = await fetch(`/api/session/${sessionId}/submit`, { method: "POST" });
    const data = await response.json();

    if (!response.ok || !data.success) {
      appendLog("error", data.error || "Submit failed — make sure required fields are filled in the live view.");
      return;
    }

    appendLog("success", "Application submitted successfully.");
    resultEl.hidden = false;
    resultMessageEl.textContent = "Application submitted successfully.";
    resultMessageEl.className = "ok";
    if (data.confirmationText) {
      resultConfirmationEl.textContent = data.confirmationText;
      resultConfirmationEl.hidden = false;
    }
  } catch (err) {
    appendLog("error", `Request failed: ${err.message}`);
  } finally {
    setButtonsBusy(false);
    submitBtn.textContent = "Submit Application";
  }
});

function setButtonsBusy(busy) {
  fillBtn.disabled = busy;
  submitBtn.disabled = busy;
}

function handleEvent(event) {
  if (event.type === "log") {
    appendLog(event.level, event.message, event.timestamp);
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
