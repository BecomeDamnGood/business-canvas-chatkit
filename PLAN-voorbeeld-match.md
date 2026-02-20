# Plan: Voorbeeldscherm 100% matchen

Vergelijking tussen het voorbeeld-HTML en de huidige `step-card.template.html` + `ui_render.ts` / `ui_constants.ts`.

---

## 1. Achtergrond (body)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Achtergrondkleur | `--cream: #f5f0ea` | `#eee8df` + gradients | Body-achtergrond op `var(--cream)` zetten; gradients/blobs aanpassen |
| Animated blobs | `body::before` + `body::after` met `floatBlob` | Geen | `floatBlob`-animatie toevoegen |
| Blob posities | 520px rechtsboven, 320px linksonder | - | Implementeren |

**Implementatie:** CSS voor `body::before` en `body::after` met `@keyframes floatBlob` toevoegen. Bestaande `background-image` behouden of vervangen door blobs (afhankelijk van `__ASSET_BG__`).

---

## 2. Brand header / logo

**Niet aanpassen** – gebruiker: "logo is al goed zo".

---

## 3. Stepper (steps-nav)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Structuur | `step-item` met `step-item-label` + `step-bar` | `step` met tekst + `::before` bar | DOM-structuur aanpassen in `buildStepper` |
| Label | 9px, text-light, boven de bar | - | Elk step krijgt label boven bar |
| Bar | 4px hoog, `rgba(0,0,0,0.12)` | 4px, `rgba(0,0,0,0.10)` | Kleur naar 0.12 |
| Active | Oranje label + oranje bar | Oranje bar | Label ook oranje bij active |
| Hover | `step-bar` wordt `orange-light` | Geen | Hover toevoegen |

**Implementatie:**
- `buildStepper` aanpassen: per step een `step-item` met `step-item-label` (tekst) en `step-bar` (div).
- CSS: `.step-item`, `.step-item-label`, `.step-bar` in lijn met voorbeeld.
- Step numbers verwijderen uit de stepper (voorbeeld toont alleen labels).

---

## 4. Card container

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| border-radius | 28px | 24px (r-2xl) | 28px |
| padding | 28px 40px 28px | 28px 24px 26px | 28px 40px 28px |
| Decorative blob | `card::before`, bottom -60px, right -40px, `#e8742a33` | `card::after`, bottom -70px, right -50px, rgba 0.09 | Naar `::before`, posities en opacity aanpassen |

---

## 5. Badge / step-number

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Font size | 44px | 40px | 44px |
| Opacity | 0.9 | 1 | 0.9 |
| Oranje balk | Geen (alleen nummer) | 3px bar via `::after` | Voorbeeld heeft geen balk onder "01" – **behouden** (vorige iteratie wilde die wel) |

*Opmerking:* Voorbeeld heeft geen balk onder het nummer. Eerdere wens was wel een oranje balk. We houden de balk, maar matchen font-size en opacity.

---

## 6. Step label (sectionTitle)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Font size | 11px | 9px | 11px |
| Kleur | `--text-light` | `--orange` | Voorbeeld: `text-light`; eerdere wens: oranje. We houden oranje (validation-kopjes). |
| margin-bottom | 12px | var(--space-3) | 12px |

*Opmerking:* Eerdere wens was oranje kapitalen voor Validation & Business Name etc. Voorbeeld gebruikt `text-light` voor step-label. We houden oranje voor de sectiekoppen.

---

## 7. Card headline (eerste paragraaf)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Font | DM Serif Display | DM Serif Display | OK |
| Font size | 22px | var(--font-size-2xl) ≈ 22px | Controleren |
| margin-bottom | 14px | - | 14px |
| max-width | 380px | - | 380px |

---

## 8. Secties (The Proven Standard, By the end you'll have)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| section-title | 12px, letter-spacing .1em, uppercase, orange | 9px | 12px |
| section-body | 14.5px, text-mid, line-height 1.65, font-weight 300 | 14px, 1.7 | 14.5px, 1.65 |
| margin-bottom | 14px | var(--space-6) | 14px |

---

## 9. Deliverables (By the end you'll have)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Structuur | `deliverable` met `deliverable-dot` + tekst (flex) | `ul`/`li` met `::before` bullet | Zelfde visueel; CSS kan huidige `ul li::before` behouden |
| Dot | 6x6px, oranje cirkel | 6x6px | OK |
| gap | 8px tussen items | - | 8px |
| Font | 14.5px, text-mid, 300 | 14px | 14.5px |

De huidige `ul`/`li` met `::before` geeft hetzelfde beeld. Alleen font-size en spacing aanpassen.

---

## 10. Divider

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Styling | 1px, rgba(0,0,0,0.07), margin 14px 0 | - | Divider tussen secties toevoegen |

**Implementatie:** Prestart-content herstructureren zodat er expliciete dividers tussen secties komen. Of: `cardDesc`-paragrafen stylen met `border-top` als divider. Voorbeeld gebruikt losse `<div class="divider">` tussen secties.

---

## 11. Meta-row (How it works / Time)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Layout | `meta-row` flex, gap 32px | Inline in cardDesc | Aparte structuur |
| meta-label | 11px, uppercase, text-light | strong (9px, orange) | 11px, text-light (of oranje – eerdere wens) |
| meta-value | 14.5px, text-dark | Gewone tekst | 14.5px |
| Tekst | "One question at a time" / "10–15 minutes" | "One question at a time. Clear input, structured output." / "Estimated time: 10–15 minutes." | Tekst inkorten naar voorbeeld |

**Implementatie:** PRESTART_WELCOME_DEFAULT aanpassen + prestart-render: "How it works" en "Time" als label/value-paren in een `meta-row`. Of: HTML-structuur in prestart wijzigen naar `<div class="meta-row">` met `meta-item` blokken.

---

## 12. CTA-knop (Start)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Vorm | Pill (border-radius 100px) | r-full (9999px) | OK |
| Padding | 16px 28px 16px 24px | - | Controleren |
| Layout | Flex met gap 12px, tekst + arrow-circle | Alleen tekst | Arrow-circle (SVG) toevoegen |
| Arrow | 28x28px oranje cirkel met pijltje | - | Toevoegen |
| Hover | background orange, translateY(-1px) | background orange | translateY(-1px) toevoegen |

**Implementatie:** HTML van `#btnStart` uitbreiden met een `cta-arrow` div + SVG. CSS voor `.cta-btn` en `.cta-arrow` toevoegen.

---

## 13. Hint (onderkant)

| Aspect | Voorbeeld | Huidige code | Actie |
|--------|-----------|---------------|-------|
| Tekst | "Use the app widget to continue (not the chat box)" | Zelfde (uiSubtitle) | OK |
| Styling | 12px, text-light, letter-spacing .03em, margin-top 22px, center | - | Aanpassen |

---

## 14. Prestart HTML-structuur

Het voorbeeld heeft een vaste structuur:
1. step-number (01)
2. step-label (Validation & Business Name)
3. card-headline
4. section (The Proven Standard) + section-body
5. divider
6. section (By the end you'll have) + deliverables
7. divider
8. meta-row (How it works | Time)
9. cta-btn

De huidige prestart gebruikt `formatText(prestartWelcomeForLang(lang))` en zet dat in `cardDesc`. De structuur is plat (strong, ul, strong, tekst).

**Opties:**
- **A:** Prestart specifiek renderen: niet `formatText` op de hele string, maar een dedicated prestart-render die de juiste HTML (sections, dividers, meta-row, deliverables) opbouwt.
- **B:** PRESTART_WELCOME_DEFAULT en formatText zo aanpassen dat de output dezelfde HTML-structuur heeft (sections, meta-row, etc.). formatText behoudt HTML-tags, dus we kunnen de juiste class-namen en structuur in de string zetten.

**Aanbeveling:** Optie B – PRESTART_WELCOME_DEFAULT herschrijven met de juiste HTML en class-namen. Geen wijziging in ui_render nodig, behalve eventueel voor de CTA (arrow).

---

## Samenvatting acties

### Alleen CSS (step-card.template.html)
1. Body: cream-achtergrond, animated blobs
2. Stepper: nieuwe classes `.step-item`, `.step-item-label`, `.step-bar` (indien we de DOM aanpassen)
3. Card: border-radius 28px, padding 28px 40px, blob via `::before`
4. Badge: 44px, opacity 0.9
5. sectionTitle: 11px, margin-bottom 12px
6. cardDesc eerste paragraaf: 22px, margin-bottom 14px, max-width 380px
7. section-title/section-body: 12px / 14.5px
8. Divider-styling
9. Meta-row styling (als we die structuur toevoegen)
10. CTA-knop: arrow, hover translateY
11. Hint: 12px, margin-top 22px, center

### TypeScript (ui_render.ts)
1. `buildStepper`: structuur wijzigen naar step-item + step-item-label + step-bar (labels i.p.v. nummers)
2. `#btnStart`: arrow-element toevoegen (of via HTML-template)

### Constants (ui_constants.ts)
1. PRESTART_WELCOME_DEFAULT: HTML herstructureren met sections, meta-row, kortere teksten

### Template HTML
1. `#btnStart`: wrapper + arrow-div toevoegen
2. Eventueel prestart-specifieke container voor meta-row (als we die los van cardDesc willen)

---

## Volgorde van uitvoering

1. **CSS** – alle visuele aanpassingen in de template
2. **buildStepper** – stepper-structuur
3. **PRESTART_WELCOME_DEFAULT** – nieuwe HTML-structuur
4. **btnStart** – arrow in template + CSS
5. **Test** – build en visuele check
