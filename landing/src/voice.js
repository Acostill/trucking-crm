/* ============================================================
   "Speak to an assistant" — realtime voice powered by xAI Grok
   through the setter-agent relay (setter-agent/app/server.js).

   Browser ⇄ relay (/ws) ⇄ wss://api.x.ai/v1/realtime
   The xAI key lives server-side in the relay; the browser speaks
   the relay's protocol:
     up:   {type:"start"} · {type:"audio_chunk", data: b64 pcm16@24k}
     down: {type:"audio", data} · agent_text(_delta) · user_transcript
           tool_call/tool_result · turn_done · error · closed
   ============================================================ */

import { VOICE_WS_URL } from "./config.js";

const SAMPLE_RATE = 24000;

let ws = null;
let mediaStream = null;
let audioCtx = null;
let workletNode = null;
let playCtx = null;
let playHead = 0;
let sources = [];
let state = "idle"; // idle | connecting | live | error

/* ---------------- audio helpers ---------------- */

function floatTo16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function b64FromInt16(int16) {
  const bytes = new Uint8Array(int16.buffer);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function int16FromB64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

function resampleTo24k(input, fromRate) {
  if (fromRate === SAMPLE_RATE) return input;
  const ratio = fromRate / SAMPLE_RATE;
  const out = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < out.length; i++) out[i] = input[Math.floor(i * ratio)] || 0;
  return out;
}

function playDelta(b64) {
  if (!playCtx) {
    playCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });
    playHead = playCtx.currentTime;
  }
  const int16 = int16FromB64(b64);
  const f32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 0x8000;
  const buf = playCtx.createBuffer(1, f32.length, SAMPLE_RATE);
  buf.getChannelData(0).set(f32);
  const src = playCtx.createBufferSource();
  src.buffer = buf;
  src.connect(playCtx.destination);
  playHead = Math.max(playHead, playCtx.currentTime + 0.04);
  src.start(playHead);
  playHead += buf.duration;
  sources.push(src);
  src.onended = () => { sources = sources.filter((s) => s !== src); };
}

function stopPlayback() {
  sources.forEach((s) => { try { s.stop(); } catch {} });
  sources = [];
  if (playCtx) playHead = playCtx.currentTime;
}

/* ---------------- mic capture ---------------- */

async function startMic() {
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const srcNode = audioCtx.createMediaStreamSource(mediaStream);
  await audioCtx.audioWorklet.addModule(
    URL.createObjectURL(new Blob([`
      class MicTap extends AudioWorkletProcessor {
        process(inputs) {
          const ch = inputs[0] && inputs[0][0];
          if (ch) this.port.postMessage(ch.slice(0));
          return true;
        }
      }
      registerProcessor("mic-tap", MicTap);
    `], { type: "application/javascript" }))
  );
  workletNode = new AudioWorkletNode(audioCtx, "mic-tap");
  srcNode.connect(workletNode);
  workletNode.port.onmessage = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const down = resampleTo24k(e.data, audioCtx.sampleRate);
    ws.send(JSON.stringify({ type: "audio_chunk", data: b64FromInt16(floatTo16(down)) }));
  };
}

/* ---------------- relay connection ---------------- */

function connect(ui) {
  setState("connecting", ui);
  ws = new WebSocket(VOICE_WS_URL);

  ws.onopen = async () => {
    ws.send(JSON.stringify({ type: "start" }));
    try {
      await startMic();
      setState("live", ui);
    } catch {
      setState("error", ui, "Microphone access denied");
      hangUp(ui);
    }
  };

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    switch (msg.type) {
      case "audio":
        playDelta(msg.data);
        ui.orb.classList.add("is-speaking");
        break;
      case "turn_done":
        ui.orb.classList.remove("is-speaking");
        break;
      case "user_transcript":
        stopPlayback(); // caller spoke — barge in
        ui.orb.classList.remove("is-speaking");
        break;
      case "error":
        setState("error", ui, msg.message || "Connection error");
        break;
      case "closed":
        if (state === "live") setState("idle", ui);
        break;
    }
  };

  ws.onerror = () => setState("error", ui, "Voice relay unreachable");
  ws.onclose = () => { if (state === "live" || state === "connecting") setState("idle", ui); };
}

function hangUp(ui) {
  if (ws) { try { ws.close(); } catch {} ws = null; }
  if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode = null; }
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
  stopPlayback();
  setState("idle", ui);
}

/* ---------------- UI ---------------- */

const STATUS_COPY = {
  idle: "SPEAK TO AN ASSISTANT",
  connecting: "CONNECTING…",
  live: "LIVE — GO AHEAD, ASK ANYTHING",
  error: "CONNECTION FAILED",
};

function setState(next, ui, detail) {
  state = next;
  ui.status.textContent = detail ? `${STATUS_COPY[next]} — ${detail.toUpperCase()}` : STATUS_COPY[next];
  ui.root.dataset.state = next;
}

export function initVoiceAssistant() {
  const root = document.createElement("div");
  root.className = "voice";
  root.dataset.state = "idle";
  root.innerHTML = `
    <div class="voice__panel" hidden>
      <p class="voice__status"></p>
      <div class="voice__orb"><span></span><span></span><span></span></div>
      <button class="voice__end" type="button">End conversation</button>
    </div>
    <button class="voice__fab" type="button" aria-label="Speak to an assistant">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <rect x="9" y="3" width="6" height="11" rx="3"/>
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>
      </svg>
      <span>Speak to an assistant</span>
    </button>`;
  document.body.appendChild(root);

  const ui = {
    root,
    panel: root.querySelector(".voice__panel"),
    status: root.querySelector(".voice__status"),
    orb: root.querySelector(".voice__orb"),
    fab: root.querySelector(".voice__fab"),
    end: root.querySelector(".voice__end"),
  };
  setState("idle", ui);

  ui.fab.addEventListener("click", () => {
    if (ui.panel.hidden) {
      ui.panel.hidden = false;
      connect(ui);
    } else {
      hangUp(ui);
      ui.panel.hidden = true;
    }
  });

  ui.end.addEventListener("click", () => {
    hangUp(ui);
    ui.panel.hidden = true;
  });
}
