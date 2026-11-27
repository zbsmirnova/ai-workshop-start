# Skill map interaction demo

[skill-map-demo.webm](skill-map-demo.webm) shows a local fixture scan, switching to Claude grouping, selecting a skill, a failed scan and retry. The model response is the saved test answer, not a live Claude call.

Produced by Air Automations. Name: Fix the review and/or merge / Run: https://air.jetbrains.cloud/org/05cf1a7f-6ab5-713b-abd3-29d0c8a05e2d/automations/f1e7e7e4-8212-4688-9557-98aa6157eac2?run=37fcc0a0-a7f2-4bbd-b55f-3826d29d78f7

## Repository navigation fixes

[navigation-fixes.webm](navigation-fixes.webm) shows Back during a delayed real fixture scan, Forward starting a fresh scan, and filtering after editing an unsubmitted repository followed by a successful reload. The response is held to make the navigation race visible; no API response data is fabricated.

## Red-agent follow-up fixes

[red-agent-followup-fixes.webm](red-agent-followup-fixes.webm) shows whitespace map validation with warnings preserved, correct highlighting of `xy` in `İxylophone`, and keyboard activation of a skill source link. [keyboard-link-target.webm](keyboard-link-target.webm) records the new tab opened by Enter. Scans use real local fixtures; the keyboard demo replaces only the source URL and serves a controlled HTTPS target to avoid external network delays.
