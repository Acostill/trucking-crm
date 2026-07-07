import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { createSequence } from "./sequence.js";
import { initQuoteForm } from "./quote.js";
import { initVoiceAssistant } from "./voice.js";
import { CRM_LOGIN_URL } from "./config.js";

gsap.registerPlugin(ScrollTrigger);

export function initFirstClassLanding() {
if (window.__firstClassLandingInitialized) return;
window.__firstClassLandingInitialized = true;

document.querySelectorAll("[data-crm-login]").forEach((a) => {
  a.href = CRM_LOGIN_URL;
});

/* ---------------- smooth scroll ---------------- */
const lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 1.0 });
window.lenis = lenis;
lenis.on("scroll", ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);

/* anchor links through lenis */
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    lenis.scrollTo(a.getAttribute("href"), { duration: 1.6 });
  });
});

/* ---------------- one continuous story, scrubbed by scroll ---------------- */
/* A single 15s Higgsfield shot — highway → gate → yard → dock — exploded
   into frames. The whole page's scroll is the playhead: the story advances
   as you read, rewinds as you scroll back. Portrait devices get a dedicated
   9:16 cut of the same story (terminal-industries ships _vert variants too). */
const FRAME_COUNT = 271;
const isPortrait = window.innerHeight > window.innerWidth;
const FRAME_DIR = isPortrait ? "/frames-portrait" : "/frames";
const sequence = createSequence({
  canvas: document.getElementById("bg-canvas"),
  urlFor: (i) => `${FRAME_DIR}/frame_${String(i + 1).padStart(4, "0")}.jpg`,
  frameCount: FRAME_COUNT,
});

/* if the device flips across the portrait/landscape boundary, swap cuts */
window.addEventListener("resize", () => {
  const nowPortrait = window.innerHeight > window.innerWidth;
  if (nowPortrait !== isPortrait) window.location.reload();
});

ScrollTrigger.create({
  trigger: "main",
  start: "top top",
  end: "bottom bottom",
  scrub: true,
  onUpdate: (self) => sequence.setProgress(self.progress),
});
gsap.ticker.add(() => sequence.tick());
window.__seq = sequence;
window.__gsap = gsap;
window.__ST = ScrollTrigger;

/* HUD asset tags pop in with each act, like their yard annotations */
document.querySelectorAll(".hud-tags").forEach((tags) => {
  gsap.fromTo(
    tags.children,
    { opacity: 0, y: 14 },
    {
      opacity: 1, y: 0, duration: 0.6, stagger: 0.14, ease: "power2.out",
      scrollTrigger: { trigger: tags.parentElement, start: "top 45%" },
    }
  );
});

/* slow push-in on the footage layer as you scroll */
gsap.to("#bg", {
  scale: 1.12,
  ease: "none",
  scrollTrigger: { trigger: "main", start: "top top", end: "bottom bottom", scrub: 1.2 },
});

/* keep the twin/scan scenes readable behind panels, brighten for the finale */
const dim = document.getElementById("bg-dim");
gsap.timeline({
  scrollTrigger: { trigger: "main", start: "top top", end: "bottom bottom", scrub: 0.8 },
})
  .to(dim, { opacity: 0.4, duration: 0.3, ease: "none" }, 0.3)
  .to(dim, { opacity: 0.55, duration: 0.25, ease: "none" }, 0.6)
  .to(dim, { opacity: 0.1, duration: 0.15, ease: "none" }, 0.85);

/* ---------------- typography & panel reveals ---------------- */
gsap.set(".hero__word", { yPercent: 110 });
gsap.set(".reveal-line > span", { yPercent: 120 });
gsap.set(".nav", { y: -80, opacity: 0 });

const intro = gsap.timeline({ defaults: { ease: "power4.out" } });
intro
  .to(".hero__word", { yPercent: 0, duration: 1.2, stagger: 0.12 }, 0.3)
  .to(".reveal-line > span", { yPercent: 0, duration: 1.0, stagger: 0.1 }, 0.7)
  .fromTo(".hero__actions .btn", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.1 }, 1.0)
  .to(".nav", { y: 0, opacity: 1, duration: 1.0 }, 0.9);

/* story panels drift in */
document.querySelectorAll(".story__panel").forEach((panel) => {
  gsap.fromTo(
    panel,
    { opacity: 0, y: 90, filter: "blur(10px)" },
    {
      opacity: 1, y: 0, filter: "blur(0px)",
      duration: 1.2, ease: "power3.out",
      scrollTrigger: { trigger: panel, start: "top 78%" },
    }
  );
});

/* quote section reveal */
gsap.fromTo(
  ".quote__header",
  { opacity: 0, y: 60 },
  { opacity: 1, y: 0, duration: 1.0, ease: "power3.out",
    scrollTrigger: { trigger: ".quote", start: "top 70%" } }
);
gsap.fromTo(
  [".quote__form", ".quote__result"],
  { opacity: 0, y: 80, filter: "blur(8px)" },
  { opacity: 1, y: 0, filter: "blur(0px)", duration: 1.1, stagger: 0.15, ease: "power3.out",
    scrollTrigger: { trigger: ".quote__grid", start: "top 75%" } }
);

/* footer */
gsap.fromTo(
  ".footer > *",
  { opacity: 0, y: 50 },
  { opacity: 1, y: 0, duration: 1.0, stagger: 0.1, ease: "power3.out",
    scrollTrigger: { trigger: ".footer", start: "top 65%" } }
);

/* ---------------- stat count-ups ---------------- */
document.querySelectorAll("[data-count]").forEach((el) => {
  const target = parseFloat(el.dataset.count);
  const decimals = Number(el.dataset.decimals || 0);
  const counter = { v: 0 };
  ScrollTrigger.create({
    trigger: el,
    start: "top 85%",
    once: true,
    onEnter: () =>
      gsap.to(counter, {
        v: target, duration: 1.8, ease: "expo.out",
        onUpdate: () => (el.textContent = counter.v.toFixed(decimals)),
      }),
  });
});

/* ---------------- simulated market tickers ---------------- */
function jitterTicker() {
  const fuel = document.getElementById("tick-fuel");
  const load = document.getElementById("tick-load");
  if (fuel) fuel.textContent = "$" + (3.42 + Math.random() * 0.3).toFixed(3) + " /GAL";
  if (load) load.textContent = (61 + Math.random() * 9).toFixed(1) + "%";
}
setInterval(jitterTicker, 2600);
jitterTicker();

/* ---------------- quote system ---------------- */
initQuoteForm();

/* ---------------- voice assistant (xAI Grok Voice) ---------------- */
initVoiceAssistant();

/* On mobile the quote form is tall enough that the fixed voice fab would
   rest on top of form content (blocking taps) as the user scrolls through —
   dock it under the nav for the duration of #quote instead. */
const voiceWidget = document.querySelector(".voice");
const isMobileWidth = () => window.matchMedia("(max-width: 900px)").matches;
if (voiceWidget) {
  ScrollTrigger.create({
    trigger: "#quote",
    start: "top bottom",
    end: "bottom top",
    onToggle: (self) =>
      voiceWidget.classList.toggle("voice--docked", self.isActive && isMobileWidth()),
  });
}
}
