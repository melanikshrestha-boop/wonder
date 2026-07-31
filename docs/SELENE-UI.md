# Selene UI — Wonder visual law

**Name:** Selene UI (Wonder’s UI gate)  
**Owner rule:** Melani. Agents obey this without asking.

## Absolute bans (default = forever)

1. **No divider lines**  
   - No `border-top` / `border-bottom` hairlines  
   - No `hr`  
   - No “section separators”  
   - No underline bars used as section chrome  

2. **No boxing content**  
   - No cards with full borders around content blocks  
   - No framed panels “for structure”  
   - No inset boxes unless Melani **explicitly** asks (she will not)

3. **No marketing / instructional blurbs**  
   - No ledes, taglines, “how this works,” helper paragraphs  
   - Only labels the user needs to act (buttons, field labels she already uses)

4. **No fake chrome**  
   - Space with **whitespace + hierarchy**, not lines and frames  
   - Active state = type weight / color / soft fill — not a box border

## Allowed (minimal)

- **Focus rings** for a11y (`outline` on `:focus-visible` only)  
- **Input borders** only on actual editable fields (forms)  
- **Product images** may use soft shadow for lift (not a rectangular frame)  
- **Pill buttons** with fill — not outlined boxes stacked as layout

## How agents work

- Before any Wonder UI edit: re-read this file  
- Prefer deleting chrome over “refining” it  
- If something looks empty, **tighten spacing** — do not add a line  
- Never reintroduce dividers “for clarity”

## Scope

All Wonder surfaces: shell, Fitness, Habits, Wardrobe (iframe), Finances, Mel panel, Agents, Bookshelf, etc.
