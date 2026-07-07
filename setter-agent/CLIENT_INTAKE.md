# Client Intake Sheet — fill one per coach

Everything needed to fill the `{{VARIABLES}}` in SYSTEM_PROMPT.md.
This doubles as your onboarding form — send it to each coach you sign,
or turn it into a Typeform. Onboarding a new coach = filling this in,
wiring their calendar/CRM webhooks, and running the testing checklist.

## Identity
| Variable | Question for the coach | Example |
|---|---|---|
| AGENT_NAME | What should the assistant be called? | "Riley" |
| COACH_NAME / COACH_FIRST_NAME | Your name as leads know it | "Coach Marcus" / "Marcus" |
| COACH_ONE_LINER | One sentence: who you help do what | "helps busy dads lose 20+ lbs without giving up weekends" |
| Voice | Warm, energetic, or authoritative? (→ ara/eve/rex, or clone) | ara |

## The offer & the call
| Variable | Question | Example |
|---|---|---|
| CALL_NAME | What do you call your sales/discovery call? | "Strategy Call" |
| CALL_LENGTH | How long is it? | 45 minutes |
| BOOKING_WINDOW | How far out can leads book? | 7 days |
| PROGRAM_FACTS | 5–10 plain facts about the program: what's included, who it's for, who it's NOT for, your credentials. Facts only, no hype. | see template |
| SOCIAL_PROOF | One verifiable proof point | "300+ clients since 2014" |
| FREE_RESOURCE / INFO_LINK | Free thing to send non-fits / "send me info" leads | YouTube training link |

## Leads & qualification
| Variable | Question | Example |
|---|---|---|
| LEAD_SOURCE_CONTEXT / LEAD_ACTION | Where do these leads come from and what did they do? | "IG ad → form fill asking about the 90-day program" |
| PROBLEM_DOMAIN | The area of life the discovery questions probe | "your health and training" |
| QUALIFICATION_CRITERIA | Who is a YES for the call? Who is an automatic NO? Must they confirm ability to invest? | see template |
| MAX_MINUTES | Cap on setter-call length | 8 |

## Compliance decisions (see COMPLIANCE.md)
| Variable | Question | Recommendation |
|---|---|---|
| DISCLOSURE_RULE | Disclose AI up front, or only if asked? | **Up front.** Several US states (incl. CA) require it for automated outbound calls, and it barely hurts booking rates. |
| Consent basis | Do leads check a phone-consent box on the form? | Required for outbound AI calls — TCPA needs prior express written consent for calls made with an artificial voice. No checkbox = don't dial. |
| Calling hours | Enforced in your dialer, not the prompt | 8am–9pm lead's local time |
| Recording notice | Two-party-consent states need it announced | Add to first line if you record |
