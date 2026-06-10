# TALON — Tube-Launched Maritime Rescue Drones

A small marketing-and-demo website for **Northreach Systems / TALON**: a concept for
tube-launched drones that extend a Coast Guard cutter's **search range** and a warship's
**awareness range** from the launch tubes a ship already carries.

Built as a static site — no build step, no dependencies. Just open it.

## Pages

| File | What it is |
|------|------------|
| `index.html` | Landing page — the pitch, the problem (the gap between distress and arrival), how the system works, the two missions (Coast Guard SAR / Navy ISR), and the Bering Sea story. |
| `game.html` | **Rescue Simulator** — an interactive search-optimization game (see below). |
| `business-plan.html` | Full business plan structured on the **MSE405W** *Technology Ventures* framework (Byers, Dorf & Nelson, 5e, §6.5). |

## The game

Two modes share one search-theory engine:

- **Lost Sailor · SAR** — a Coast Guard search. Find the survivor before the survival window
  closes. Night and sea state change which sensor wins.
- **Submarine · ASW** — a destroyer's awareness problem. Hold a track on a contact before it
  escapes. A *quiet* boat needs MAD; a *snorkeling* boat is exposed to radar.

It's a genuine **optimization problem**. You get a budget and a catalog of three drones:

- **SCOUT-S** ($9k) — cheap micro drone, short legs. A swarm near the datum, useless if it's far.
- **RANGER-M** ($26k) — the value pick: thermal + sonobuoys, good range.
- **SENTINEL-L** ($60k) — long-range wide-area thermal / MAD. Reaches anything, eats the budget.

The model is real maritime search theory (Koopman random search):

```
Coverage  C   = swept sensor area ÷ search area
Detection POD = 1 − e^(−C)
```

Each drone contributes `sweep width × speed × time-on-station`. A far datum eats endurance in
transit (so short-legged scouts literally can't get there); night favours thermal; a quiet
submarine defeats sonobuoys. The live planner shows your coverage and detection estimate before
you commit, and the debrief grades your loadout against the **budget-constrained optimum** for
that scenario (computed by brute force) with a contextual coaching tip.

The constants are tuned so most scenarios are solvable to ~70–95% with a smart buy, while a few
genuinely can't be guaranteed — the honest "you can't always beat the ocean" lesson.

## Running it

It's a static site. Easiest:

```powershell
# from this folder
python -m http.server 8080
# then open http://localhost:8080
```

Or just double-click `index.html`. (A local server is slightly nicer — the Google Fonts and
relative asset paths all resolve either way.)

## Structure

```
talon-rescue-drones/
  index.html
  game.html
  business-plan.html
  assets/
    css/  style.css   (design system + shared)
          game.css    (simulator)
          plan.css    (business-plan document)
    js/   game.js      (simulator engine + canvas animation)
```

## Notes

- Design language: naval ops-room — deep navy, rescue orange (survivors / alerts), sonar green
  (detection / awareness), monospace HUD type.
- The business plan builds directly on the source MSE405W plan (tube-launched rescue drones for
  the Coast Guard), extended with the dual-use naval-awareness angle, market sizing, a staged
  financial model, and the four-category risk analysis the framework calls for.
- All figures are illustrative for a concept-stage venture.
