import React, { useEffect, useRef } from 'react';

export default function FirstClassLandingPage() {
  const rootRef = useRef(null);

  useEffect(() => {
    let active = true;
    const previousTitle = document.title;

    document.title = 'FIRST CLASS - Instant Freight Quotes';
    window.scrollTo({ top: 0, left: 0 });

    const cssLink = document.createElement('link');
    cssLink.id = 'first-class-landing-css';
    cssLink.rel = 'stylesheet';
    cssLink.href = '/landing/style.css';
    document.head.appendChild(cssLink);

    const fontLink = document.createElement('link');
    fontLink.id = 'first-class-landing-fonts';
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap';
    document.head.appendChild(fontLink);

    async function bootLanding() {
      const response = await fetch('/landing/index.html');
      const html = await response.text();
      if (!active || !rootRef.current) return;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.body.querySelectorAll('script').forEach((script) => script.remove());
      rootRef.current.innerHTML = doc.body.innerHTML;
      document.querySelectorAll('.voice').forEach((voice) => voice.remove());
      window.__firstClassLandingInitialized = false;

      const landing = await import('../landing/main.js');
      if (active) {
        landing.initFirstClassLanding();
      }
    }

    bootLanding();

    return () => {
      active = false;
      cssLink.remove();
      fontLink.remove();
      document.title = previousTitle;
    };
  }, []);

  return <div ref={rootRef} className="first-class-landing" />;
}
