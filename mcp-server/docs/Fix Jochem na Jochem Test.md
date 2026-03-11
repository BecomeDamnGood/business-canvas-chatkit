# Fix Jochem na Jochem Test

## Fix 1 - Terugschakelen naar zelf de Droom formuleren mag de Dream Builder-inhoud niet wissen als de user later terug wil naar Dream Builder

### Probleem in mensentaal
- Soms besluit een user vanuit Dream Builder: ik wil toch zelf mijn Droom formuleren.
- Dat is een normale routewissel binnen dezelfde stap, geen signaal dat alle eerder verzamelde Dream Builder-input waardeloos is geworden.
- Als die user later alsnog terug wil naar Dream Builder, verwacht die logisch dat de eerder ingevoerde statements en eventuele scorecontext nog beschikbaar zijn.
- Nu lijkt die context te verdwijnen.
- Voor de user voelt dat alsof kiezen voor `zelf formuleren` gelijkstaat aan `alles weggooien`, terwijl dat productmatig niet hetzelfde hoort te zijn.

### Scopegrens
- Deze fix gaat over statebehoud tussen:
  - Dream Builder
  - terug naar gewone Dream self-mode
  - en later opnieuw starten van Dream Builder
- Deze fix gaat niet over het wissen van een foutief gestagede Dream-formulering; dat mag nog steeds nodig zijn.
- Deze fix moet onderscheid maken tussen:
  - de gewone Dream-uitkomst
  - en de onderliggende Dream Builder-werkcontext

### Input (zoals gemeld)
- De user zit in Dream Builder.
- De user kiest ervoor om terug te gaan naar zelf de Droom te formuleren.
- Daarna besluit de user later alsnog weer naar Dream Builder te gaan.
- Gewenste uitkomst:
  - de eerder ingevoerde Dream Builder-items worden onthouden
  - en de Dream Builder-logica kan die weer hergebruiken
  - in plaats van helemaal opnieuw vanaf nul te beginnen

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- De huidige switch-to-self route wist expliciet de Dream Builder-state in `mcp-server/src/handlers/run_step_routes.ts`.
- In `clearDreamStateForSwitchToSelf(...)` worden nu actief leeggemaakt:
  - `dream_builder_statements`
  - `dream_scores`
  - `dream_top_clusters`
- Diezelfde route wist ook de gewone Dream-staging:
  - `dream_final`
  - `provisional_by_step.dream`
  - `provisional_source_by_step.dream`
- De bestaande test in `mcp-server/src/handlers/run_step_routes_switch_self.test.ts` bevestigt dat dit gedrag nu bewust wordt afgedwongen.
- Als de user daarna opnieuw Dream Builder start, gebruikt de DreamExplainer als bron vooral:
  - `dream_builder_statements`
  - anders `last_specialist_result.statements`
  - anders `dream_scoring_statements`
- Maar doordat `dream_builder_statements` op switch-to-self al leeg wordt gemaakt, is de primaire bron van eerdere builder-input verdwenen.
- Hoog-over betekent dit:
  - de huidige code behandelt `terug naar zelf formuleren`
  - alsof het een volledige reset van de builder-context is
  - in plaats van een tijdelijke moduswissel binnen dezelfde Dream-stap

### Definitieve invariant
- Terugschakelen van Dream Builder naar zelf de Droom formuleren mag de builder-werkcontext niet onnodig vernietigen.
- Het wissen van een huidige Dream-kandidaat is iets anders dan het wissen van de Dream Builder-inputgeschiedenis.
- Als de user later opnieuw voor Dream Builder kiest, moet de flow kunnen hervatten met de eerder verzamelde statements.
- Als er al scores of top-clusterinformatie bestonden, moet expliciet bepaald worden of die nog geldig zijn of opnieuw berekend moeten worden, maar ze mogen niet stilzwijgend verdwijnen zonder productreden.
- Mode-switch is geen full reset, tenzij de user expliciet kiest voor opnieuw beginnen.

### Enige oplossing
- Splits `switch to self` semantisch op in:
  - Dream-output resetten waar nodig
  - maar Dream Builder-werkcontext behouden voor latere hervatting

Concreet:
1. Laat `switch to self` de huidige Dream-formulering en staged Dream-output opruimen als dat nodig is.
2. Bewaar de onderliggende Dream Builder-context apart als hervatbare werkstaat:
   - statements
   - en waar zinvol ook score-/clustercontext
3. Zorg dat opnieuw starten van Dream Builder eerst kijkt naar die bewaarde builder-context voordat het als een lege nieuwe sessie wordt behandeld.
4. Definieer expliciet wanneer bestaande scorecontext nog bruikbaar is en wanneer alleen de statements behouden blijven maar scores opnieuw moeten worden ingevuld.
5. Maak in state en tests helder onderscheid tussen:
   - `zelf de Droom formuleren`
   - `Dream Builder pauzeren`
   - `Dream Builder volledig resetten`
6. Neem copy-impact mee als de UI duidelijker moet maken dat de user later verder kan met bestaande input.
7. Als daarvoor nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit volgt de mentale verwachting van de user
- het voorkomt dat een routekeuze onbedoeld dataverlies veroorzaakt
- en het maakt de Dream-stap consistenter: output wisselen mag, onderliggende opgebouwde context hoeft niet meteen weg

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
Als een user vanuit Dream Builder terugschakelt naar zelf de Droom formuleren, mag dat niet automatisch betekenen dat alle eerder ingevoerde Dream Builder-items verloren gaan. Als die user later alsnog terug wil naar Dream Builder, moet de oefening kunnen hervatten met de eerder opgebouwde input.

Concrete codebevinding
- In `mcp-server/src/handlers/run_step_routes.ts` wist `clearDreamStateForSwitchToSelf(...)` nu expliciet:
  - `dream_builder_statements`
  - `dream_scores`
  - `dream_top_clusters`
- Daarnaast wordt ook de gewone Dream staging gewist:
  - `dream_final`
  - `provisional_by_step.dream`
  - `provisional_source_by_step.dream`
- In `mcp-server/src/handlers/run_step_routes_switch_self.test.ts` wordt dat huidige wisgedrag ook expliciet getest.
- Bij een latere terugkeer naar Dream Builder zoekt de DreamExplainer primair naar bestaande builder-statements in state. Door die nu te wissen, verdwijnt de hervatbare builder-context.

Opdracht
Herstel deze semantische fout zodat `switch to self` niet langer gelijkstaat aan een volledige Dream Builder-reset.

Voer precies deze oplossing uit:
1. Splits Dream-output reset en Dream Builder-contextbehoud van elkaar.
2. Laat `switch to self` alleen de actuele Dream-formulering/staging opruimen die niet mag blijven hangen.
3. Behoud de Dream Builder-context voor latere hervatting:
   - statements
   - en expliciet gekozen score/clusterstate als die nog geldig hoort te blijven, of bewaar minimaal genoeg om opnieuw door de builder-logica te kunnen gaan
4. Zorg dat `dream_start_exercise` of het relevante herstartpad eerst probeert te hervatten vanuit bewaarde builder-context.
5. Definieer expliciet wanneer scorestate nog herbruikbaar is en wanneer alleen statements worden meegenomen.
6. Pas tests aan zodat ze niet langer full reset verwachten bij `switch to self`, maar wel bewijzen dat foutieve Dream-output wordt gewist en builder-context behouden blijft.
7. Neem copy-impact meteen mee in het holistische ontwerp als de UI moet uitleggen dat de user later verder kan met bestaande builder-input.
8. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- `switch to self` is geen impliciete full reset van Dream Builder.
- Wis Dream Builder-state niet blind als de user alleen van modus wisselt.
- Houd duidelijk onderscheid tussen Dream-output en Dream Builder-werkcontext.
- Geen workaround die alleen de knoptekst verandert zonder stategedrag te corrigeren.
- Alleen een expliciete resetactie mag opgebouwde Dream Builder-context volledig weggooien.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 2 - Presentation moet de recap zichtbaar houden bij `Maak presentatie`, en recap-vragen mogen daar geen dubbele content meer tonen

### Probleem in mensentaal
- In `presentation` ziet de user eerst de samenvatting van alles wat tot nu toe is opgebouwd.
- Als de user daarna op `Maak presentatie` klikt, hoort de gegenereerde presentatie onder die bestaande samenvatting te verschijnen.
- Nu voelt het alsof er een nieuw scherm komt:
  - de recap verdwijnt als primaire inhoud
  - en alleen de nieuwe presentatie-output of preview blijft over
- Daarnaast is er nog een tweede fout:
  - als de user in `presentation` vraagt wat er tot nu toe besproken is
  - dan krijgt die dubbele content terug
  - terwijl die samenvatting al in beeld staat
- In deze stap is dat onlogisch. De juiste reactie is niet opnieuw recap renderen, maar feedback geven dat dit al zichtbaar is op het scherm.

### Scopegrens
- Deze fix gaat alleen over de UX- en contractsemantiek binnen stap `presentation`.
- Deze fix gaat niet over de inhoud van de recap zelf; dat staat in Fix 3.
- Deze fix gaat ook niet over de PPTX-generatie-engine zelf.
- Deze fix moet wel regelen:
  - hoe `Maak presentatie` dezelfde presentation-context behoudt
  - en hoe recap-intentie in deze stap anders wordt behandeld dan in andere stappen

### Input (zoals gemeld)
- Als de button `maak presentatie` gebruikt wordt, volgt een nieuw scherm met de presentatie.
- Maar de presentatie had onder de samenvatting gepresenteerd moeten worden.
- Oftewel:
  - geen nieuw schermgevoel
  - maar uitbreiding onder wat de user al ziet wanneer die de presentation-stap binnenkomt
- Daarnaast:
  - als de user in `presentation` vraagt wat we tot nu toe besproken hebben
  - komt er dubbele content
- Dat had niet gemogen, omdat die content al op het scherm staat.
- In `presentation` moet daar dus andere feedback op komen dan in andere stappen.

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- De route `presentation_generate` in `mcp-server/src/handlers/run_step_routes.ts` maakt nu een specialistobject met:
  - een korte ready-boodschap in `message`
  - lege `refined_formulation`
  - lege `presentation_brief`
  - en aparte `presentation_assets`
- Daardoor wordt bij die route de bestaande recap niet opnieuw als hoofdinhoud meegegeven.
- In de UI laat `mcp-server/ui/lib/ui_render.ts` de presentation-preview zien zodra `presentation_assets` aanwezig zijn.
- Hoog-over betekent dit:
  - de preview kan wel onder de kaart verschijnen
  - maar omdat de route de recapinhoud zelf leeg terugstuurt, verdwijnt de recap als primaire card-inhoud
  - en voelt het voor de user alsof de stapinhoud vervangen is in plaats van uitgebreid
- Voor recap-vragen zie ik een tweede generieke oorzaak:
  - in `mcp-server/src/handlers/run_step_runtime_state_helpers.ts` staat een universele recap-instructie die voor alle specialisten geldt
  - en in `mcp-server/src/handlers/run_step_policy_meta.ts` worden vragen als `wat hebben we tot nu toe besproken?` generiek als `wants_recap=true` geclassificeerd
- Daarna behandelt `mcp-server/src/core/turn_policy_renderer.ts` recapverzoeken generiek door recapcontent te renderen of toe te voegen.
- In de meeste stappen is dat logisch.
- In `presentation` niet, want daar is de recap juist al het hoofdscherm.
- Hoog-over betekent dit:
  - `presentation` heeft hier een uitzonderingssemantiek nodig
  - de generieke recap-pijplijn is in deze stap te letterlijk
  - en levert daardoor dubbele content op in een context waar de recap al persistent zichtbaar is

### Definitieve invariant
- In stap `presentation` blijft de recap de vaste hoofdcontext van het scherm.
- `Maak presentatie` mag die recap niet vervangen, maar moet de gegenereerde preview/assetstatus toevoegen onder dezelfde bestaande samenvatting.
- Een recap-vraag binnen `presentation` mag niet opnieuw dezelfde recap renderen als hoofdinhoud.
- In deze stap moet een recap-vraag worden beantwoord met korte contextfeedback in de lijn van:
  - dit staat al op het scherm
  - geef aan wat je wilt aanpassen of ga door met genereren
- `presentation` is dus semantisch geen gewone recap-step, maar een step waar recap al persistent zichtbaar is.

### Enige oplossing
- Maak `presentation` een persistent recap-contextstep: behoud de recap altijd zichtbaar bij `Maak presentatie`, en override generieke recap-intentie binnen deze stap naar een korte `already visible`-feedback in plaats van een tweede recaprender.

Concreet:
1. Laat `presentation_generate` de bestaande recapcontext behouden in de specialistoutput of ui-content, in plaats van `refined_formulation` en `presentation_brief` leeg terug te zetten.
2. Voeg de presentatie-preview/assets toe als uitbreiding onder dezelfde recapkaart, niet als vervanging van de bestaande presentation-hoofdinhoud.
3. Definieer voor `presentation` expliciet dat de recap persistent zichtbaar blijft zolang de user in deze stap zit.
4. Override recap-intentie in `presentation`:
   - als de user vraagt wat er tot nu toe besproken is
   - render dan niet opnieuw de recap
   - maar geef korte feedback dat de samenvatting al zichtbaar is in het scherm
5. Laat die feedback de user terugbrengen naar de echte taak van deze stap:
   - aanpassen
   - of presentatie maken
6. Zorg dat de generieke `wants_recap`-logica voor andere stappen intact blijft, maar dat `presentation` hier semantisch een uitzondering krijgt.
7. Voeg regressietests toe die bewijzen dat:
   - `Maak presentatie` recap + preview samen toont
   - de recap niet verdwijnt na assetgeneratie
   - recap-vragen in `presentation` geen dubbele recapblokken meer opleveren
   - maar wel een korte `already visible`-feedback geven
8. Neem copy-impact mee als voor deze stap een expliciete korte hinttekst nodig is.
9. Als daarvoor nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit volgt de mentale verwachting van de user in een review/generatie-step
- dit voorkomt dat `Maak presentatie` aanvoelt als contextwissel of schermreset
- en dit maakt `presentation` consistenter dan de generieke recap-pijplijn nu doet

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
De `presentation`-stap is een persistente recap-context. De user ziet daar al de volledige samenvatting van wat tot nu toe is opgebouwd. Twee dingen gaan nu fout:
1. Bij `Maak presentatie` voelt het alsof een nieuw scherm de recap vervangt, terwijl de preview juist onder de bestaande samenvatting moet verschijnen.
2. Als de user in `presentation` vraagt wat er tot nu toe besproken is, wordt de recap nog eens gerenderd en ontstaat dubbele content. In deze stap moet in plaats daarvan korte feedback komen dat de samenvatting al zichtbaar is.

Concrete codebevinding
- In `mcp-server/src/handlers/run_step_routes.ts` zet `presentation_generate` nu:
  - `message` op een korte ready-boodschap
  - `refined_formulation` op leeg
  - `presentation_brief` op leeg
  - en levert daarnaast `presentation_assets`
- In `mcp-server/ui/lib/ui_render.ts` wordt de presentation-preview zichtbaar zodra `presentation_assets` aanwezig zijn.
- Daardoor blijft de preview wel zichtbaar, maar de recapcontext wordt in de hoofdinhoud niet behouden.
- In `mcp-server/src/handlers/run_step_runtime_state_helpers.ts` en `mcp-server/src/handlers/run_step_policy_meta.ts` worden recapverzoeken generiek behandeld.
- In `mcp-server/src/core/turn_policy_renderer.ts` wordt recapcontent vervolgens generiek opnieuw gerenderd/toegevoegd.
- Voor `presentation` is dat semantisch fout, omdat deze stap de recap al persistent op het scherm heeft staan.

Opdracht
Herstel deze presentation-semantiek zodat de recap persistent zichtbaar blijft bij `Maak presentatie`, en recap-vragen in deze stap niet meer tot dubbele content leiden.

Voer precies deze oplossing uit:
1. Pas `presentation_generate` zo aan dat de bestaande recapcontext behouden blijft in de hoofdinhoud.
2. Voeg presentation preview/assets toe onder dezelfde bestaande recap, in plaats van de recapinhoud te vervangen.
3. Maak `presentation` expliciet tot persistente recap-contextstep zolang de user in deze stap blijft.
4. Override recap-intentie binnen `presentation`:
   - als de user vraagt wat er tot nu toe besproken is
   - render niet opnieuw dezelfde recap
   - geef korte feedback dat de samenvatting al zichtbaar is op het scherm
5. Laat die feedback functioneel terugleiden naar:
   - aanpassen van de samenvatting
   - of het maken van de presentatie
6. Houd de generieke `wants_recap`-logica voor andere stappen intact; maak alleen voor `presentation` een expliciete uitzondering.
7. Voeg regressietests toe die bewijzen dat:
   - `Maak presentatie` recap + preview samen toont
   - recap niet verdwijnt na assetgeneratie
   - recap-vragen in `presentation` geen dubbele content meer tonen
   - maar wel korte `already visible`-feedback geven
8. Neem copy-impact meteen mee als hiervoor korte stap-specifieke feedbacktekst nodig blijkt.
9. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- `Maak presentatie` mag de recap niet als hoofdinhoud vervangen.
- Geen nieuw-schermsemantiek voor een actie die eigenlijk een uitbreiding binnen dezelfde step is.
- Geen generieke recap-render herhalen in `presentation` als die recap al zichtbaar is.
- Geen fix die alleen de preview toont maar de recapcontext niet bewaart.
- Geen spontane locale-rollout zonder aparte toestemming.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 3 - Presentation recap moet kopjes en bullets behouden; de samenvatting mag niet vlakgeslagen worden tot lopende tekst

### Probleem in mensentaal
- In de presentatie-stap hoort de recap duidelijk opgebouwd te zijn:
  - met kopjes per onderdeel
  - en met bullets waar de onderliggende stap ook een lijst is
- Dat is nu stuk.
- In plaats van een scanbare samenvatting met duidelijke secties, verschijnt er vlakke lopende tekst op plekken waar bullets en duidelijke blokken verwacht worden.
- Voor de user voelt dat alsof de presentatie niet meer professioneel of controleerbaar is, terwijl deze stap juist bedoeld is als laatste review vóór presentatiegeneratie.

### Scopegrens
- Deze fix gaat over de recap-opmaak in stap `presentation`.
- Deze fix gaat niet over de uiteindelijke gegenereerde PPTX-layout zelf.
- Deze fix gaat ook niet over de inhoud van eerdere stappen, behalve waar die inhoud als lijststructuur in de recap behouden moet blijven.
- Deze fix moet wel de hele keten bewaken:
  - specialistoutput
  - staging/opslag
  - rehydration van de recap
  - en rendering in de card

### Input (zoals gemeld)
- De correcte opmaak bij step presentatie is verloren gegaan.
- Er hadden kopjes en bullets moeten staan.
- Dat is nu stuk.
- Gewenste uitkomst:
  - de recap toont opnieuw duidelijke sectiekoppen
  - en lijstvelden zoals Strategy, Products and Services en Rules of the Game blijven als bullets zichtbaar

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- De productintentie is nog steeds expliciet correct in `mcp-server/src/steps/presentation.ts`.
- Daar staat meerdere keren dat de recap:
  - moet starten met een introregel
  - daarna per final een apart gelabeld blok moet tonen
  - en bullets moet behouden voor waarden die bullets bevatten
- De UI kan zulke structuur ook al renderen:
  - `mcp-server/ui/lib/ui_text.ts` heeft `renderStructuredText(...)`
  - en die ondersteunt heading-like lines en bullet lists
- Hoog-over wijst dat erop dat de frontend niet per se het fundamentele probleem is; als de tekststructuur er nog is, kan de UI die tonen.
- Tegelijk heeft `presentation` geen eigen harde normalizer of contractlaag die de recapstructuur afdwingt voordat die wordt gestaged.
- In `mcp-server/src/handlers/run_step_state_update.ts` wordt voor `presentation` simpelweg `presentation_brief` of `refined_formulation` opgeslagen via `stageFieldValue(...)`, zonder extra normalisatie naar semantische recapblokken.
- Voor andere lijstachtige stappen bestaan wel expliciete normalisatiepaden:
  - Strategy normaliseert bullets/statement-consistentie
  - Rules of the Game heeft een contract- en runtime-policylaag
- Voor `presentation` ontbreekt zo'n server-side bescherming van de recapvorm.
- Daarnaast zie ik geen presentatie-specifieke regressietests die echt bewijzen dat:
  - gelabelde secties behouden blijven
  - bullets na staging en hergebruik nog bullets zijn
  - en een vlakgeslagen recap als ongeldig of herstelbaar wordt behandeld
- Hoog-over betekent dit:
  - de presentatie-instructie zegt nog steeds het juiste
  - de UI kan het juiste ook renderen
  - maar de keten tussen specialistoutput en opgeslagen/teruggeleverde recap borgt de structuur nu niet hard genoeg

### Definitieve invariant
- De recap in `presentation` is geen vrije samenvattingstekst, maar een gestructureerd reviewdocument.
- Per non-empty final moet er een eigen zichtbaar sectieblok zijn.
- Lijstvelden moeten hun lijstkarakter behouden:
  - bullets blijven bullets
  - genummerde lijsten blijven genummerd
  - losse single-value velden mogen inline achter hun label staan
- Deze structuur mag niet verloren gaan door staging, canonicalization of hergebruik van `presentation_brief`.
- Een vlakke recap zonder de vereiste sectie- en lijststructuur mag niet stilzwijgend als geldige presentation-brief worden geaccepteerd.

### Enige oplossing
- Voeg voor `presentation` een expliciete recap-normalizer en contractbewaking toe, zodat de verplichte sectie- en lijststructuur vóór opslag en vóór hergebruik wordt afgedwongen.

Concreet:
1. Behandel `presentation_brief` als een gestructureerde recapvorm, niet als willekeurige vrije tekst.
2. Definieer server-side expliciet welke structuur minimaal aanwezig moet zijn:
   - introregel
   - gelabelde secties per final
   - behoud van bullets/nummering waar de input dat vereist
3. Normaliseer presentation-output vóór staging naar die recapvorm als de specialistoutput inhoudelijk klopt maar formattering deels is vlakgeslagen.
4. Accepteer geen opgeslagen of hergebruikte `presentation_brief` meer als geldige canonical value wanneer de verplichte sectie- en lijststructuur ontbreekt.
5. Zorg dat lijstvelden in de recap hun semantiek behouden op basis van de onderliggende finals:
   - Strategy als bullets
   - Products and Services als bullets waar van toepassing
   - Rules of the Game als bullets
6. Houd rendering en opslag semantisch aligned:
   - wat server-side als recap wordt gestaged moet frontend-side nog steeds als headings en lists renderbaar zijn
7. Voeg regressietests toe die bewijzen dat de presentation-recap na specialistoutput, staging en hergebruik nog steeds:
   - aparte secties heeft
   - bullets behoudt
   - en niet degradeert tot één vlak tekstblok
8. Neem copy-impact mee als bepaalde labels of sectiekoppen nu inconsistent zijn en daarom mee rechtgetrokken moeten worden.
9. Als daarvoor nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit herstelt de productbedoeling van presentation als reviewdocument in plaats van losse platte tekst
- dit plaatst de fix op de juiste laag: contract/staging, niet alleen cosmetische frontend-opmaak
- en dit voorkomt dat correcte recapstructuur later opnieuw verloren gaat

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
De presentatie-stap hoort een scanbare recap te tonen met duidelijke kopjes per onderdeel en bullets voor lijstvelden. Die structuur is nu verloren gegaan: delen van de recap verschijnen als vlakke lopende tekst waar headings en bullets verwacht worden. Dat is productmatig fout voor een final review gate.

Concrete codebevinding
- In `mcp-server/src/steps/presentation.ts` staat nog steeds expliciet dat de recap per final apart gelabeld moet worden en bullets/nummering moet behouden waar van toepassing.
- In `mcp-server/ui/lib/ui_text.ts` kan `renderStructuredText(...)` headings en bullet lists al renderen.
- In `mcp-server/src/handlers/run_step_state_update.ts` wordt `presentation_brief` nu echter zonder presentation-specifieke recapnormalisatie gestaged via `stageFieldValue(...)`.
- Anders dan bij bijvoorbeeld Strategy of Rules of the Game bestaat er voor `presentation` geen harde contract-/runtime-normalizer die recapstructuur bewaakt vóór opslag en hergebruik.
- Daardoor kan een vlakgeslagen recap als geldige `presentation_brief` in state terechtkomen en later ook zo teruggerenderd worden.

Opdracht
Herstel deze regressie zodat `presentation` opnieuw een gestructureerde recap bewaart en toont, met verplichte sectiekoppen en bullets waar de onderliggende finals dat vereisen.

Voer precies deze oplossing uit:
1. Voeg voor `presentation` een expliciete recap-normalizer/validator toe vóór staging en vóór hergebruik van `presentation_brief`.
2. Definieer de minimale verplichte recapstructuur:
   - introregel
   - aparte gelabelde secties per non-empty final
   - bullets of genummerde lijsten waar het onderliggende final dat vereist
3. Normaliseer specialistoutput die inhoudelijk correct is maar formattering heeft verloren, terug naar deze recapvorm.
4. Accepteer geen vlakgeslagen `presentation_brief` meer als geldige canonical presentation recap wanneer headings/bullets ontbreken.
5. Zorg dat lijstvelden hun lijstsemantiek behouden in de recap:
   - Strategy
   - Products and Services
   - Rules of the Game
6. Houd staging en rendering aligned: wat server-side wordt opgeslagen moet frontend-side nog steeds semantisch als structured text renderbaar zijn.
7. Voeg regressietests toe die bewijzen dat presentation-recap na specialistoutput, staging en hergebruik:
   - duidelijke sectiekoppen behoudt
   - bullets behoudt
   - niet degradeert tot één vlak tekstblok
8. Neem copy-impact meteen mee als labels of sectiekoppen inhoudelijk moeten worden rechtgetrokken.
9. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- Geen cosmetische frontend-only fix die een slecht gestagede recap probeert te verbergen.
- Geen vrije platte tekst accepteren als vervanging voor verplichte recapstructuur.
- Geen samenvoeging van meerdere finals tot één onduidelijk tekstblok.
- Behoud lijstsemantiek end-to-end.
- Geen spontane locale-rollout zonder aparte toestemming.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 4 - Strategy moet lokale suggesties doen en bestaande bullets behouden, niet te snel een volledige 4-7-set genereren

### Probleem in mensentaal
- In Strategy voelt het nu soms alsof de agent te veel overneemt.
- Een kleine toevoeging of een wat rommelige vrije tekst kan dan onnodig uitgroeien tot:
  - een opgesplitste bullet
  - een volledige herschreven strategieset
  - of een suggestie die verder afstaat van wat de user eigenlijk bedoelde
- Voor de user is dat verwarrend, omdat de stap hoort te voelen als:
  - samen aanscherpen
  - niet als: `ik typ iets kleins en het systeem bedenkt mijn hele strategie opnieuw`
- Zeker bij een 8e punt hoort de logica niet meteen te springen naar een generieke `maak er 4-7 focuspunten van`-output.

### Scopegrens
- Deze fix gaat over de inhoudelijke Strategy-agentinstructie en de semantiek van de suggestion-flow.
- Dezelfde lokale bulletlogica moet in deze fix ook expliciet gelden voor `Rules of the Game`.
- Deze fix gaat niet over een volledige herbouw van de wording-choice UI; die kan grotendeels blijven zoals hij is.
- Deze fix gaat ook niet over het toestaan van meer dan 7 definitieve strategy bullets.
- Deze fix moet wel duidelijk regelen:
  - wanneer de agent lokaal mag herformuleren
  - wanneer de agent een consolidatievoorstel mag doen
  - en wanneer een vrije tekst eerst moet worden geïnterpreteerd tot voorstel in bulletvorm

### Input (zoals gemeld)
- De intentie is niet dat de agent in meerdere gevallen meteen een complete set van `4-7 focuspunten` produceert.
- Gewenst gedrag:
  - als er al `7` punten zijn en de user voegt een `8e` toe, moet de agent alleen indien nodig een suggestieflow starten
  - die flow moet duidelijk laten zien:
    - `your input` = 8 bullets
    - `my suggestion` = 7 bullets
    - met daarboven feedback waarom die suggestie is gedaan
- Als de user vrije invoer geeft:
  - een verhaal
  - een lange tekst
  - of iets dat nog geen duidelijke bullets zijn
  - dan moet de agent eerst zeggen in de lijn van:
    - `ik denk dat ik begrijp wat je bedoelt`
    - of `wat denk je van deze suggestie`
  - en daarna een voorstel in bullets geven
- Dat patroon bestaat al in andere stappen zoals Dream en Purpose en Strategy moet zich hier productmatig vergelijkbaar gedragen.

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- In `mcp-server/src/steps/strategy.ts` wordt de agent nu op meerdere plekken te breed naar een volledige `4 tot 7 focus points`-output gestuurd.
- Dat gebeurt niet alleen in de algemene kwaliteitsregels, maar ook expliciet in meerdere failure-modes, waar `refined_formulation` opnieuw als `4 to 7 focus points` moet worden voorgesteld.
- Daardoor ontstaat spanning in de instructie:
  - enerzijds is Strategy bedoeld als incrementele lijststap met canonieke `statements`
  - anderzijds wordt de agent herhaaldelijk uitgenodigd om meteen een complete geldige set te reconstrueren
- In dezelfde Strategy-flow bestaat al context voor het juiste productgedrag:
  - `mcp-server/src/core/turn_policy/strategy_helpers.ts` heeft al een overflow-waarschuwing voor meer dan `7` punten
  - inclusief een semantiek in de lijn van `kan ik dit voor je consolideren?`
- Ook de wording-choice laag ondersteunt al lokale vergelijking in plaats van full reset:
  - in `mcp-server/src/handlers/run_step_wording.ts` kan Strategy in `grouped_list_units` mode worden gezet
  - met compare-units, compare-segments en retained bullets
- `Rules of the Game` werkt inhoudelijk ook met een canonieke lijst (`statements`) en kent al semantiek rond aanscherpen, mergen en lokale aanpassing in `mcp-server/src/steps/rulesofthegame.ts`.
- Daardoor is er productmatig geen goede reden waarom Strategy wel lokale bullet-semantiek zou hebben, maar `Rules of the Game` niet.
- De tests in `mcp-server/src/handlers/run_step_wording_intent.test.ts` laten ook al zien dat lokale vergelijkingen worden ondersteund voor:
  - vrije tekst naar bulletvoorstel
  - `1 -> 2`
  - `3 -> 1`
  - en andere gegroepeerde vergelijkingen zonder meteen de hele set te vervangen
- Voor het patroon `ik denk dat ik begrijp wat je bedoelt` bestaat al precedent in `mcp-server/src/steps/purpose.ts`.

Hoog-over betekent dit:
- de compare- en UI-laag hebben al veel van de juiste bouwstenen
- maar de Strategy-agentinstructie is nu te eager om van gewone input een volledige `4-7`-strategieset te maken
- en precies daar moet de semantiek strakker worden gemaakt

### Definitieve invariant
- Strategy moet standaard incrementeel en behoudend werken.
- Dezelfde lokale en behoudende bulletsemantiek moet ook gelden voor `Rules of the Game`.
- Een nieuwe user-input mag niet zonder noodzaak uitgroeien tot een brede herschrijving van de hele strategie.
- Als een user een `8e` punt toevoegt terwijl er al `7` zijn, is de primaire reactie:
  - behoud wat de user toevoegt
  - en doe alleen indien nodig een expliciet consolidatievoorstel
- Zo'n consolidatievoorstel moet zichtbaar maken:
  - wat de user letterlijk toevoegt
  - wat de agent als compactere `7`-puntenvariant voorstelt
  - en waarom dat voorstel wordt gedaan
- Als de user vrije, langdradige of nog niet goed gestructureerde input geeft, moet de agent eerst interpreteren en dan een bulletvoorstel doen, in plaats van een complete alternatieve strategie te verzinnen.
- Full-set herschrijven mag alleen nog als expliciete uitzonderingsroute wanneer lokale mapping echt niet meer verdedigbaar is.

### Enige oplossing
- Vernauw de Strategy-agentinstructie zodat volledige `4-7`-synthese alleen nog gebeurt in expliciete suggestie- of consolidatiemomenten, en trek dezelfde lokale bulletlogica door naar `Rules of the Game`.

Concreet:
1. Verwijder uit de gewone Strategy-failure-modes de reflex dat de agent meteen een volledige nieuwe `4-7`-set moet produceren.
2. Maak de standaardreactie lokaal en incrementeel:
   - accepteer een geldige nieuwe focuskeuze
   - of herformuleer alleen het ingediende punt zo dicht mogelijk op de user-intentie
   - zonder de rest van de strategie onnodig te herschrijven
3. Als er al `7` punten zijn en de user voegt een `8e` punt toe:
   - start alleen indien inhoudelijk nodig een suggestion-flow
   - toon daar expliciet feedback waarom consolidatie nodig is
   - en vergelijk `your input` met `8` bullets tegen `my suggestion` met `7` bullets
4. Gebruik daarbij de bestaande grouped-compare semantiek zodat overeengekomen bullets zichtbaar blijven en alleen het relevante verschil wordt besproken.
5. Als de user vrije tekst, een verhaal of onduidelijke input geeft:
   - laat de agent eerst expliciet zeggen dat hij denkt te begrijpen wat de user bedoelt
   - of vraag `wat denk je van deze suggestie`
   - en geef daarna een voorstel in herkenbare bullets
6. Behandel dat vrije-tekstvoorstel als suggestion-flow, niet als direct gecommitte canonieke eindset zonder user-reactie.
7. Laat full-set herschrijven alleen nog toe als expliciete fallback wanneer:
   - lokale matching echt niet betrouwbaar is
   - of de user expliciet om een complete herformulering of consolidatie vraagt
8. Pas dezelfde lokale bullet- en suggestion-semantiek expliciet toe op `Rules of the Game`, zodat ook daar niet onnodig naar een brede lijst-herschrijving wordt gesprongen.
9. Neem copy-impact meteen mee in het holistische ontwerp als hiervoor nieuwe feedbackregels, labels of instructieteksten nodig zijn.
10. Als daarvoor nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit sluit aan op hoe de Strategy-stap voor de user hoort te voelen: lokaal aanscherpen, niet ongevraagd herschrijven
- dit voorkomt ook dat `Rules of the Game` een afwijkende en onlogische lijstsemantiek houdt
- dit gebruikt bestaande compare-bouwstenen in plaats van nieuwe complexe UI-logica te forceren
- dit maakt de `>7`-situatie expliciet en begrijpelijk
- en dit brengt Strategy semantisch in lijn met de suggestion-achtige patronen die al bestaan in Dream en Purpose

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
De huidige Strategy-instructie stuurt de agent op meerdere plekken te snel richting een volledige `4-7 focus points`-output. Dat is niet de productintentie. Strategy moet normaal incrementeel werken: lokale input toevoegen of lokaal herformuleren, met behoud van bestaande bullets. Alleen bij expliciete noodzaak mag een consolidatie- of suggestieflow ontstaan. Dezelfde lokale bulletsemantiek moet ook gelden voor `Rules of the Game`.

Concrete codebevinding
- In `mcp-server/src/steps/strategy.ts` vragen meerdere failure-modes nu expliciet om `refined_formulation` als volledige `4 to 7 focus points`.
- Daardoor krijgt de agent te veel ruimte om een kleine user-input om te zetten in een brede herschrijving van de hele strategieset.
- In `mcp-server/src/core/turn_policy/strategy_helpers.ts` bestaat al overflow-semantiek voor meer dan `7` focus points, inclusief een waarschuwing/consolidatievraag.
- In `mcp-server/src/handlers/run_step_wording.ts` en `mcp-server/src/handlers/run_step_wording_intent.test.ts` bestaat al grouped-compare ondersteuning waarmee lokale verschillen, retained bullets en `your input` versus `my suggestion` goed gepresenteerd kunnen worden.
- In andere stappen, zoals `mcp-server/src/steps/purpose.ts`, bestaat al het patroon waarbij vrije tekst eerst als begrepen intentie wordt teruggegeven met een voorstel.
- In `mcp-server/src/steps/rulesofthegame.ts` bestaat al een canonieke lijstsemantiek via `statements`, inclusief merge-/adjust-logica. Die stap moet daarom dezelfde lokale bulletregels volgen als Strategy.

Opdracht
Herstel deze semantiek zodat de agent in `Strategy`, en volgens dezelfde lijstlogica ook in `Rules of the Game`, niet meer standaard een volledige set genereert, maar lokale suggesties doet en alleen bij echte noodzaak consolideert of een voorstel in bullets maakt.

Voer precies deze oplossing uit:
1. Verwijder uit de normale Strategy-failure-modes het generieke patroon dat meteen een complete `4-7 focus points`-set laat genereren.
2. Maak de standaardreactie incrementeel:
   - accepteer een geldige nieuwe focuskeuze direct
   - of herformuleer alleen het nieuwe/onjuiste punt zo dicht mogelijk op de user-intentie
   - zonder de rest van de strategy onnodig te vervangen
3. Als er al `7` punten bestaan en de user een `8e` punt toevoegt:
   - start alleen indien nodig een consolidatie-suggestion-flow
   - toon feedback waarom de suggestie wordt gedaan
   - presenteer `your input` als `8` bullets
   - presenteer `my suggestion` als een geconsolideerde variant met `7` bullets
4. Gebruik hiervoor de bestaande grouped-compare / retained-bullets semantiek in plaats van een volledige set-reset.
5. Als de user vrije tekst, een verhaal of ongestructureerde input geeft:
   - laat de agent eerst expliciet zeggen dat hij denkt te begrijpen wat de user bedoelt, of vraag wat de user van de suggestie vindt
   - presenteer daarna een voorstel in bullets
   - commit die voorstelset niet direct als definitieve canonieke strategy zonder user-reactie
6. Laat volledige herschrijving van de hele set alleen nog toe als expliciete fallback wanneer lokale matching niet verdedigbaar is of wanneer de user zelf om volledige herformulering/consolidatie vraagt.
7. Trek dezelfde lokale bullet- en suggestion-semantiek door naar `Rules of the Game`.
8. Pas tests aan zodat ze bewijzen:
   - gewone Strategy-input lokaal blijft
   - `7 -> 8` indien nodig naar suggestion/consolidation gaat
   - vrije tekst leidt tot een voorstel in bullets
   - retained bullets zichtbaar blijven
   - full-set compare alleen als fallback wordt gebruikt
   - `Rules of the Game` dezelfde lokale bulletsemantiek volgt
9. Neem copy-impact meteen mee in het holistische ontwerp als nieuwe feedbackregels, labels of helperteksten nodig blijken.
10. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- Geen generieke `maak er meteen 4-7 focus points van`-reactie meer op gewone ruwe input.
- Geen onnodige splitsing van één userbullet in meerdere bullets zonder inhoudelijke noodzaak.
- Geen complete nieuwe strategieset verzinnen als lokale herformulering of lokale compare voldoende is.
- Een `8e` bullet is geen reden voor stille auto-rewrite; als consolidatie nodig is, moet die expliciet als voorstel zichtbaar zijn.
- Vrije tekst moet eerst via een voorstel/suggestieflow lopen, vergelijkbaar met Dream/Purpose-semantiek.
- `Rules of the Game` mag hierin niet afwijken van dezelfde lokale bulletlogica.
- Nieuwe copy niet tijdelijk of in de verkeerde bucket parkeren; meteen juist categoriseren.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 5 - Wijzig- en verwijderopdrachten in Strategy, Products and Services en Rules of the Game moeten als edit-intentie worden herkend, niet als nieuwe input

### Probleem in mensentaal
- Als een user in `Strategy`, `Products and Services` of `Rules of the Game` via het tekstveld zegt:
  - `haal deze bullet weg`
  - `vervang deze zin door ...`
  - of `pas deze bullet aan`
  dan verwacht die user dat het systeem een bestaande bullet wijzigt of verwijdert.
- Nu voelt het vaak alsof die tekst gewoon als nieuwe inhoud wordt gelezen.
- Daardoor krijg je geen gerichte edit van de bestaande lijst, maar een extra toevoeging of een vreemde hersamenvatting.
- Voor de user is dat onlogisch, omdat een wijzigopdracht semantisch iets heel anders is dan nieuwe content aanleveren.

### Scopegrens
- Deze fix gaat over vrije tekstinvoer in deze drie lijststappen:
  - `strategy`
  - `productsservices`
  - `rulesofthegame`
- Deze fix gaat niet over klikken in een aparte edit-UI; het gaat juist om herkenning van gewone tekstcommando's in het bestaande veld.
- Deze fix gaat ook niet over algemene wording-choice accept/reject op een al openstaande suggestion; die flow bestaat al deels.
- Deze fix moet wel regelen hoe een gewone userturn eerst wordt geclassificeerd:
  - nieuwe content
  - gerichte wijzigopdracht
  - of gerichte verwijderopdracht

### Input (zoals gemeld)
- Als user in `Strategy`, `Products and Services` en `Rules of the Game` via het tekstveld een wijziging aanvraagt of vraagt iets te verwijderen, wordt dat nu gezien als nieuwe input.
- Dat moet anders:
  - de agent moet herkennen dat dit een instructie is om een bestaande bullet aan te passen of te verwijderen
  - niet een signaal om een extra bullet toe te voegen

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- In `mcp-server/src/steps/strategy.ts` werkt de stap met canonieke `PREVIOUS_STATEMENTS` en een append-/herformuleerlogica, maar er staat geen stevige algemene regel dat een gewone userturn als `edit existing bullet` of `remove existing bullet` moet worden opgevat wanneer de user dat expliciet vraagt.
- In `mcp-server/src/steps/rulesofthegame.ts` bestaat wel een canonieke lijst via `statements` en zelfs taal over `adjust this rule`, maar die logica is vooral gericht op refinement van regels en niet scherp genoeg als algemene interpretatie van vrije tekstverzoeken tegen de al zichtbare lijst.
- In `mcp-server/src/steps/productsservices.ts` ontbreekt deze semantiek nog sterker:
  - de stap werkt vooral als samenvattende output naar één `productsservices` string of korte lijst
  - er is geen expliciete instructie om vrije tekst zoals `haal X weg` of `vervang Y door Z` als gerichte lijstbewerking te behandelen
- In `mcp-server/src/handlers/run_step_wording.ts` bestaat al wel generieke business-list intentlogica voor:
  - `strategy`
  - `productsservices`
  - `rulesofthegame`
- Daarin bestaan zelfs al patronen voor:
  - expliciet verwijderen via `LIST_REMOVE_VERB`
  - expliciet vervangen via `LIST_REPLACE_VERB`
  - matching op quoted fragments en best matching items
- Maar die logica leeft in de wording-choice/business-list compare laag en gebruikt referentie-items uit bestaande compare-context.
- Hoog-over betekent dit:
  - er zijn al bouwstenen om edit/remove semantisch te begrijpen
  - maar die semantiek is nog niet de default interpretatie van een gewone vrije userturn in deze stappen
  - daardoor valt een tekstueel wijzigverzoek nu te makkelijk terug naar `nieuwe content`
- Ik zie ook geen duidelijke regressietests die bewijzen dat een normale turn zoals `verwijder "X"` of `vervang "A" door "B"` in deze drie stappen leidt tot mutation van de bestaande lijst in plaats van appendgedrag.

### Definitieve invariant
- In `Strategy`, `Products and Services` en `Rules of the Game` moet een expliciete wijzig- of verwijderopdracht eerst als edit-intentie worden geïnterpreteerd.
- Een userturn die semantisch zegt `pas bestaand item aan` of `haal bestaand item weg` mag niet standaard als nieuwe bullet worden verwerkt.
- De zichtbare/canonieke lijst moet in deze stappen de referentie zijn voor wat gewijzigd of verwijderd wordt.
- Alleen als de referentie onduidelijk is, mag het systeem een verduidelijkingsvraag stellen.
- Gerichte list-editing moet vóór appendlogica komen, niet erna.

### Enige oplossing
- Voeg voor deze drie lijststappen een expliciete preclassificatie toe van vrije tekst naar `add`, `edit`, `remove` of `clarify`, en laat `edit/remove` altijd eerst tegen de bestaande lijst resolveren voordat de stap de input als nieuwe content behandelt.

Concreet:
1. Behandel `strategy`, `productsservices` en `rulesofthegame` als één gedeelde categorie van business-list steps voor vrije tekst edit-intentie.
2. Laat een gewone userturn eerst bepalen of de user:
   - nieuwe inhoud toevoegt
   - een bestaand item wil aanpassen
   - of een bestaand item wil verwijderen
3. Gebruik de bestaande zichtbare of canonieke lijst als referentie voor matching van het bedoelde item.
4. Als de user expliciet verwijdert:
   - verwijder het gematchte item uit de lijst
   - in plaats van de verwijdertekst als nieuw item te behandelen
5. Als de user expliciet vervangt of aanpast:
   - update alleen het bedoelde item
   - in plaats van een extra item toe te voegen of de hele lijst opnieuw te samenvatten
6. Als de match ambigu is:
   - stel een korte verduidelijkingsvraag
   - en commit nog niets
7. Trek hiervoor de bestaande remove/replace-bouwstenen uit de wording-choice/business-list laag door naar de gewone turninterpretatie, zodat deze semantiek niet alleen bestaat wanneer al een compareflow actief is.
8. Zorg dat `Products and Services` ook op itemniveau kan editen tegen de huidige gegroepeerde lijst, en daarna terug serialiseren naar de bestaande `productsservices` outputvorm.
9. Voeg regressietests toe die bewijzen dat in alle drie de stappen gewone tekstturns zoals:
   - `verwijder "X"`
   - `vervang "A" door "B"`
   - `maak deze bullet specifieker`
   leiden tot edit/remove van bestaande content en niet tot append van nieuwe content.
10. Neem copy-impact meteen mee als extra verduidelijkingsvragen of feedbackzinnen functioneel nodig blijken.
11. Als daarvoor nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit sluit aan op de mentale verwachting van de user bij een gewone wijzigopdracht
- dit gebruikt bestaande intent-/matchingbouwstenen in plaats van parallelle logica uit te vinden
- dit voorkomt ongewenste appendbugs in drie lijststappen tegelijk
- en dit maakt list-editing via gewone taal eindelijk semantisch correct

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
In `strategy`, `productsservices` en `rulesofthegame` worden gewone tekstverzoeken om iets aan te passen of te verwijderen nu te vaak behandeld als nieuwe inhoud. Dat is productmatig fout. Een user die zegt `verwijder deze bullet`, `vervang X door Y` of `pas dit punt aan` geeft een edit-opdracht, geen nieuwe list input.

Concrete codebevinding
- `mcp-server/src/steps/strategy.ts` werkt met canonieke `PREVIOUS_STATEMENTS`, maar bevat geen robuuste algemene regel dat gewone vrije tekst eerst als edit/remove-intentie tegen de bestaande lijst moet worden gelezen.
- `mcp-server/src/steps/rulesofthegame.ts` heeft canonieke `statements` en noemt adjust-scenario's, maar de semantiek is nog niet scherp genoeg als algemene vrije-tekst editlaag voor de zichtbare lijst.
- `mcp-server/src/steps/productsservices.ts` heeft nog geen expliciete item-level edit/remove semantiek; de stap vat input vooral opnieuw samen als products/services-output.
- In `mcp-server/src/handlers/run_step_wording.ts` bestaan al business-list intentbouwstenen voor `strategy`, `productsservices` en `rulesofthegame`, inclusief remove/replace detectie (`LIST_REMOVE_VERB`, `LIST_REPLACE_VERB`, matching op fragments en best matching items).
- Die logica is nu echter vooral beschikbaar binnen wording-choice/business-list compare-context en niet als standaardinterpretatie voor elke gewone vrije userturn.

Opdracht
Herstel deze semantische fout zodat gewone tekstturns in `strategy`, `productsservices` en `rulesofthegame` eerst als mogelijke edit/remove-opdracht tegen de bestaande lijst worden geïnterpreteerd, in plaats van standaard als nieuwe content.

Voer precies deze oplossing uit:
1. Voeg voor deze drie business-list steps een expliciete preclassificatie toe van vrije tekst naar:
   - add
   - edit
   - remove
   - clarify
2. Gebruik de huidige zichtbare/canonieke lijst als referentie om het bedoelde item te matchen.
3. Als de user expliciet iets wil verwijderen:
   - verwijder het gematchte item uit de lijst
   - behandel de turn niet als append van nieuwe content
4. Als de user expliciet iets wil vervangen of aanpassen:
   - update alleen het bedoelde item
   - behandel de turn niet als extra nieuw item
5. Als de match ambigu is:
   - stel een korte verduidelijkingsvraag
   - commit nog niets
6. Trek bestaande remove/replace-bouwstenen uit `run_step_wording.ts` door naar de gewone turninterpretatie, zodat deze logica niet alleen werkt binnen een al actieve wording-choice compareflow.
7. Zorg dat `productsservices` ook item-level edits kan uitvoeren tegen de huidige lijst/samenvatting en daarna terug serialiseert naar de bestaande outputvorm.
8. Pas tests aan zodat ze bewijzen dat normale tekstturns zoals:
   - `verwijder "X"`
   - `vervang "A" door "B"`
   - `pas deze bullet aan`
   in alle drie de stappen leiden tot gerichte mutatie van bestaande content en niet tot appendgedrag.
9. Neem copy-impact meteen mee in het holistische ontwerp als extra clarify-/feedbackteksten nodig blijken.
10. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- Een expliciete wijzig- of verwijderopdracht is geen nieuwe bullet.
- Edit/remove-intentie moet vóór appendlogica komen.
- Geen oplossing die alleen binnen wording-choice werkt maar niet in gewone userturns.
- Geen full-list rewrite als één lokaal item aangepast of verwijderd moet worden.
- Geen spontane locale-rollout zonder aparte toestemming.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 6 - Purpose-video's bestaan wel per taal, maar worden door de intro-gate niet getoond

### Probleem in mensentaal
- Voor Purpose zijn er al video’s geconfigureerd in meerdere talen.
- Toch ziet de user die video’s niet op de Purpose-kaart.
- Voor de user voelt dat alsof de video’s ontbreken, terwijl ze technisch gezien wel bestaan.
- Dat is verwarrend en productmatig zonde, omdat de content blijkbaar klaarstaat maar door de huidige renderlogica niet zichtbaar wordt.

### Scopegrens
- Deze fix gaat over het tonen van de bestaande Purpose-video’s.
- Deze fix gaat niet over het toevoegen van nieuwe video’s of nieuwe talen.
- Deze fix gaat ook niet over de videolinks zelf, tenzij later bewezen wordt dat een link ongeldig is.
- Het onderzoek wijst nu vooral naar render- en intro-gating, niet naar ontbrekende assets.

### Input (zoals gemeld)
- Er zijn movies voor Purpose in een aantal talen.
- Die worden niet getoond.
- Gewenste uitkomst:
  - als voor de actieve taal een Purpose-video is geconfigureerd
  - en de Purpose-kaart in de juiste toestand staat
  - dan moet die video ook echt zichtbaar zijn

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- De language-mapped Purpose-video’s bestaan al in `mcp-server/ui/lib/ui_constants.ts` via `PURPOSE_STEP_VIDEO_BY_LANG`.
- Daar staan nu expliciet links voor:
  - `en`
  - `de`
  - `es`
  - `fr`
  - `it`
  - `nl`
- De client heeft ook al een aparte embedfunctie:
  - `appendPurposeStepIntroVideo(...)`
  - in `mcp-server/ui/lib/ui_render.ts`
- De daadwerkelijke render gebeurt alleen als deze conditie waar is:
  - `current === "purpose" && showStepIntroChrome && !wordingChoiceActive`
- Die `showStepIntroChrome` komt uit de payloadflag `show_step_intro_chrome`.
- Server-side wordt die uiteindelijk gezet vanuit `ui_show_step_intro_chrome` in `mcp-server/src/core/turn_policy_renderer.ts`.
- Daar is de huidige bronregel:
  - `const showStepIntroChrome = stepId !== "step_0" && sourceAction === "INTRO"`
- Hoog-over betekent dit:
  - de Purpose-video is niet gekoppeld aan `heeft video-url`
  - maar aan `zit exact in een server-side INTRO-turn`
- Daardoor kan de video makkelijk wegvallen in echte flows waarin Purpose wel voor het eerst zichtbaar is voor de user, maar de turn server-side niet meer als `INTRO` is gemarkeerd.
- Dat past ook bij andere codepaden waar geforceerde routes vaak `show_step_intro: "false"` meegeven.

### Definitieve invariant
- Als er voor de actieve taal een geldige Purpose-video bestaat, mag die niet afhankelijk zijn van een te smalle of toevallige serveractiecode.
- De zichtbaarheid van de Purpose-video moet aansluiten op de producttoestand van de kaart:
  - eerste Purpose-intro / introductieve kaart zichtbaar
  - geen wording-choice blokkade
  - geen ontbrekende taalvideo
- Een bestaande video-config mag niet effectief onbruikbaar zijn door een te strikte intro-gate.

### Enige oplossing
- Verplaats de zichtbaarheid van de Purpose-video van een pure `sourceAction === INTRO` gate naar een semantische Purpose-intro gate.

Concreet:
1. Behoud de bestaande language-mapped video-SSOT.
2. Laat de client of server Purpose-video’s tonen op basis van een expliciete `Purpose intro zichtbaar` toestand, niet alleen op basis van de technische `INTRO` action source.
3. Definieer eenduidig wanneer de Purpose-kaart als introkaart geldt:
   - eerste keer Purpose zichtbaar voor de user
   - geen wording-choice state
   - geen latere refine/confirm-kaart waar introvideo ongewenst is
4. Maak `show_step_intro_chrome` of een specifiekere Purpose-video-flag semantisch correct voor die toestand.
5. Voeg regressietests toe die bewijzen:
   - Purpose-video verschijnt voor talen met geconfigureerde link
   - Purpose-video verschijnt niet voor talen zonder link
   - wording-choice of niet-intro states tonen de video niet onterecht
6. Neem copy-impact mee als er rond de video aanvullende introcopy nodig is.
7. Als daarvoor nieuwe tekstkeys nodig zijn:
   - categoriseer ze direct in de juiste functionele namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit laat de bestaande video-assets echt renderen
- dit maakt de gating semantisch in plaats van toevallig afhankelijk van één action source
- en dit voorkomt dat de feature in tests “bestaat” maar in echte flows onzichtbaar blijft

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
Voor Purpose bestaan al language-mapped video’s, maar in de praktijk worden ze niet getoond. De assets en URL-mapping zijn aanwezig; het probleem zit hoogstwaarschijnlijk in de render-/intro-gating.

Concrete codebevinding
- In `mcp-server/ui/lib/ui_constants.ts` bestaan al Purpose-video URLs voor meerdere talen via `PURPOSE_STEP_VIDEO_BY_LANG`.
- In `mcp-server/ui/lib/ui_render.ts` bestaat al `appendPurposeStepIntroVideo(...)`.
- De client toont de video nu alleen als:
  - `current === "purpose"`
  - `showStepIntroChrome === true`
  - `!wordingChoiceActive`
- `showStepIntroChrome` komt uit de payloadflag `show_step_intro_chrome`.
- In `mcp-server/src/core/turn_policy_renderer.ts` wordt die nu afgeleid van:
  - `stepId !== "step_0" && sourceAction === "INTRO"`
- Dat maakt de Purpose-video effectief afhankelijk van een te smalle technische INTRO-route in plaats van van een semantische Purpose-intro toestand.

Opdracht
Herstel deze gatingfout zodat bestaande Purpose-video’s getoond worden in de juiste introtoestand van de Purpose-kaart.

Voer precies deze oplossing uit:
1. Houd de bestaande video-URL mapping als SSOT.
2. Vervang of verbreed de huidige Purpose-video gate zodat die niet alleen afhangt van `sourceAction === "INTRO"`.
3. Definieer expliciet wat de juiste semantische introtoestand is voor Purpose-video weergave.
4. Zorg dat de Purpose-video zichtbaar wordt wanneer de user de Purpose-introkaart echt ziet, ook als die turn niet letterlijk via de huidige INTRO-source loopt.
5. Zorg tegelijk dat refine-, wording-choice- en andere niet-intro states de video niet onterecht tonen.
6. Voeg regressietests toe voor:
   - talen met bestaande Purpose-video
   - talen zonder Purpose-video
   - Purpose-intro zichtbaar
   - Purpose niet-intro / wording-choice verborgen
7. Neem copy-impact meteen mee als extra introcopy rond de video functioneel nodig blijkt.
8. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- Geen nieuwe hardcoded video-URLs buiten de bestaande SSOT.
- Geen fix die alleen in tests werkt maar niet in echte turnflows.
- Geen generieke force-show van video op elke Purpose-kaart.
- Los de gating op in de juiste render-/contractlaag.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 7 - Dream Builder scoring mag het tekstinvoerveld niet weghalen zodra er 20+ statements zijn

### Probleem in mensentaal
- Op het moment dat Dream Builder genoeg statements heeft verzameld en overschakelt naar het score-scherm, verdwijnt het gewone tekstveld.
- Daardoor lijkt het voor de user alsof hij alleen nog maar scores mag invullen.
- Dat is verwarrend en productmatig fout, want juist in deze fase moet de user nog extra statements kunnen toevoegen of eerdere statements kunnen aanscherpen.
- De flow zegt dus eigenlijk twee dingen tegelijk:
  - `je mag nog aanvullen en aanpassen`
  - maar de UI gedraagt zich als:
  - `je mag alleen nog scores insturen`
- Dit moet opgelost worden omdat de user anders te vroeg wordt vastgezet in de scoring-stap, terwijl de inhoud nog niet af hoeft te zijn.

### Scopegrens
- Deze fix gaat alleen over de Dream Builder-flow na de overgang naar scoring bij `20+` statements.
- Deze fix gaat niet over clusteringkwaliteit, scorevalidatie of de latere Dream-formulering zelf.
- Deze fix mag de bestaande score-invoer niet breken.
- Deze fix moet wel holistisch ontworpen worden:
  - bepaal dus meteen of aangepaste helperteksten, labels of uitlegcopy functioneel nodig zijn om de scoring-state begrijpelijk te maken.
- Wat niet automatisch in deze fix hoeft mee te lopen, is het direct uitwerken van die copy in alle talen.
- Als nieuwe of aangepaste UI-teksten nodig blijken, moeten de benodigde keys/copy eerst inhoudelijk als onderdeel van de fix worden vastgelegd, en pas daarna via het vertaaltraject landen in `docs/overzicht-ontbrekende-ui-vertalingen.md` en de locale-bestanden.
- Nieuwe toevoegingen moeten daarbij meteen in de juiste functionele categorie/namespace terechtkomen, dus niet als losse of tijdelijke tekst buiten de bestaande Dream Builder / scoring-structuur.

### Input (zoals gemeld)
- Zodra Dream Builder overschakelt naar het invullen van scores omdat er `20+` items zijn, verdwijnt het tekstinvoerveld.
- Dat is fout, want de user moet in deze fase nog steeds extra statements kunnen toevoegen.
- De huidige UX dwingt de user impliciet in een pure scorestap, terwijl de producttekst juist zegt dat aanpassen en toevoegen nog mogelijk is.

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- In `mcp-server/src/handlers/run_step_ui_payload.ts` wordt de view vanaf `20+` statements omgezet naar `dream_builder_scoring`.
- In hetzelfde pad wordt `dream_builder_statements_visible` alleen nog expliciet aangezet voor `dream_builder_collect` en `dream_builder_refine`, niet voor scoring.
- In `mcp-server/src/handlers/run_step_runtime_finalize.ts` wordt `ui_action_text_submit` in deze fase omgezet van normale tekstsubmit naar `ACTION_DREAM_EXPLAINER_SUBMIT_SCORES` met `payload_mode = "scores"`.
- In `mcp-server/src/steps/dream_explainer.ts` staat juist expliciet in de user-facing instructies dat de user statements nog steeds kan aanpassen en toevoegen nadat clustering/scoring is gestart.

Hoog-over betekent dit:
- de specialistinstructie zegt: `scoren én eventueel nieuwe statements toevoegen`
- maar het runtime/UI-contract zegt nu effectief: `alleen scores submitten`
- daardoor verdwijnt het vrije tekstpad precies in de fase waarin het product zegt dat het beschikbaar moet blijven

### Definitieve invariant
- Bij `20+` Dream Builder statements moet scoring zichtbaar zijn.
- In diezelfde toestand moet vrije tekstinvoer beschikbaar blijven voor extra statements of correcties.
- Score-submit en tekst-submit moeten dus naast elkaar kunnen bestaan in plaats van elkaar te vervangen.
- Het toevoegen van nieuwe statements moet de bestaande herclustering-flow blijven gebruiken.
- Deze fix mag de bestaande score-submitroute niet verwijderen of degraderen.

### Enige oplossing
- Maak `dream_builder_scoring` een gecombineerde invoerstand in plaats van een exclusieve scorestand.

Concreet:
1. Laat de scoring-view actief blijven voor clusters en scorevelden.
2. Houd daarnaast een normale tekstsubmit beschikbaar voor vrije invoer in dezelfde state.
3. Route vrije tekst in deze toestand terug naar de bestaande Dream Builder-logica voor:
   - statement toevoegen
   - statement corrigeren
   - herclusteren wanneer nodig
4. Gebruik de aparte score-submit alleen voor het verzenden van scores, niet als vervanging van alle tekstinvoer.
5. Breid de contract- en regressietests uit zodat `20+` statements expliciet bewijzen dat beide paden tegelijk beschikbaar zijn:
   - score-submit werkt nog
   - tekstinvoer blijft zichtbaar en bruikbaar
6. Als tijdens implementatie blijkt dat extra uitlegtekst nodig is:
   - neem die copy-behoefte meteen mee in het oplossingontwerp
   - definieer concreet welke nieuwe tekstkeys of welke aangepaste copy nodig zijn
   - zet nieuwe tekstkeys direct in de juiste functionele categorie/namespace
   - werk die niet automatisch meteen handmatig uit in alle talen in deze fixnotitie
   - zet ze eerst in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- het sluit aan op de bestaande productbelofte in de Dream Builder-copy
- het repareert de echte contractbreuk in plaats van een cosmetische UI-workaround
- het behoudt de huidige scoring-flow en voegt alleen het ontbrekende tekstpad terug toe
- en het houdt copy-/vertaalwerk gescheiden van de functionele fix

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
In Dream Builder verdwijnt het tekstinvoerveld zodra de flow naar scoring gaat bij `20+` statements. Dat is productmatig fout, omdat de user in deze fase nog steeds extra statements moet kunnen toevoegen of bestaande statements moet kunnen corrigeren.

Concrete codebevinding
- In `mcp-server/src/handlers/run_step_ui_payload.ts` wordt vanaf `20+` statements de view `dream_builder_scoring`.
- In `mcp-server/src/handlers/run_step_runtime_finalize.ts` wordt `ui_action_text_submit` dan vervangen door een score-submit met `payload_mode = "scores"`.
- In `mcp-server/src/steps/dream_explainer.ts` zegt de flowtekst juist dat statements nog steeds aangepast en toegevoegd kunnen worden.

Opdracht
Herstel deze contractbreuk door `dream_builder_scoring` niet langer als exclusieve scoremodus te behandelen.

Voer precies deze oplossing uit:
1. Houd de scoring-view en score-submit beschikbaar.
2. Laat in dezelfde scoring-state ook vrije tekstinvoer bestaan voor nieuwe of gecorrigeerde statements.
3. Route tekstinvoer in deze state terug naar de bestaande Dream Builder statement-flow, zodat extra input leidt tot update/herclustering in plaats van blokkade.
4. Zorg dat score-submit en tekst-submit elkaar niet overschrijven in state of UI-contract.
5. Voeg regressietests toe die expliciet bewijzen dat bij `20+` statements:
   - scoring zichtbaar is
   - score-submit werkt
   - tekstinvoer zichtbaar blijft
   - extra statements opnieuw verwerkt worden
6. Als blijkt dat extra helpertekst of een duidelijker knoplabel nodig is:
   - neem dat vanaf het begin mee in het holistische fixontwerp
   - beschrijf concreet de benodigde nieuwe tekstkeys/copy
   - plaats nieuwe toevoegingen meteen in de juiste categorie/namespace, niet als tijdelijke restpost
   - registreer die eerst in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle locale-bestanden bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- Geen workaround die alleen tekst copy aanpast.
- Geen oplossing die score-submit verwijdert.
- Geen aparte tijdelijke tussenstap introduceren.
- Geen frontend-only patch als de server nog steeds slechts één submit-contract uitgeeft.
- Respecteer de bestaande Dream Builder clustering- en scoring-flow.
- Denk vanaf het begin logisch en holistisch na over gedrag en copy samen.
- Nieuwe copy niet in een generieke of verkeerde bucket parkeren; meteen juist categoriseren.
- Niet spontaan alle talen aanpassen als bijvangst van deze fix.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 8 - Na score-submit moet Dream Builder direct een droom formuleren op basis van de hoogste scores, niet opnieuw clusteren met lege waarden

### Probleem in mensentaal
- Als de user alle scores heeft ingevuld en daarna vraagt om op basis van die scores een Droom te formuleren, gebeurt er nu iets vreemds.
- In plaats van een Droomvoorstel te krijgen op basis van wat het hoogst scoort, lijkt de flow opnieuw naar een scoring- of clusterstaat te gaan.
- Daarbij worden de items opnieuw gerangschikt en lijken de scorevelden weer leeg of op `0` te staan.
- Voor de user voelt dit alsof de eerder ingevulde scores niet echt zijn gebruikt of niet zijn onthouden.
- Dat is productmatig fout, omdat scoring juist bedoeld is als input voor de eerstvolgende stap: het formuleren van een Droom op basis van wat het belangrijkst is.

### Scopegrens
- Deze fix gaat over het gedrag na een geldige Dream Builder score-submit.
- Deze fix gaat niet over de kwaliteit van de clustering zelf.
- Deze fix gaat ook niet over de eerdere bug waarbij tekstinvoer in scoring-modus verkeerd wordt behandeld; die staat in Fix 7.
- Deze fix moet wel rekening houden met de samenhang tussen score-submit, score-state, vervolgprompt en Dream-formulering.

### Input (zoals gemeld)
- De user vult alle scores in.
- Daarna vraagt de user om op basis van die scores een Droom te formuleren.
- In plaats van een Droomvoorstel op basis van de hoogste scores:
  - worden de items opnieuw geordend
  - en staan de waarden weer op `0` of leeg
- Gewenste uitkomst:
  - de reeds ingevulde scores worden gebruikt
  - de hoogste scorethema's bepalen de richting
  - en het systeem formuleert daarop een Droom

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- Het bedoelde serverpad staat al in de code:
  - `ACTION_DREAM_EXPLAINER_SUBMIT_SCORES` wordt als score-submit behandeld in `mcp-server/src/handlers/run_step_runtime_finalize.ts`
  - en afgehandeld in `mcp-server/src/handlers/run_step_routes.ts`
- In die route gebeurt inhoudelijk al het juiste:
  - scores worden ingelezen
  - per cluster wordt een gemiddelde berekend
  - de hoogste cluster(s) worden opgeslagen als `dream_top_clusters`
  - daarna wordt direct opnieuw `DreamExplainer` aangeroepen om een Droomvoorstel te formuleren
- De specialistinstructie bevestigt dat dit ook de productbedoeling is:
  - na score-ontvangst moet de flow naar de Dream-direction / Dream-formulation stap
  - niet terug naar een nieuwe scoring-view
- Tegelijk bevat de generieke DreamExplainer-logica ook een fallback die bij `20+` statements opnieuw de scoring-view forceert zolang de runtime niet in `builder_refine` zit.
- Daarnaast bewaart de widget de ingevulde scores tijdelijk client-side in `__dreamScoringScores`, wist die bij submit, en initialiseert een nieuwe scoring-render weer leeg.
- Server-side wordt `dream_scores` wel opgeslagen, maar in de gevonden code wordt die opgeslagen score-state niet gebruikt om een heropende scoring-view opnieuw te vullen.

Hoog-over betekent dit:
- het bedoelde pad is: `scores -> top clusters -> Droomvoorstel`
- het waargenomen pad voelt als: `scores -> terug naar scoring/herclustering`
- en als die tweede route geraakt wordt, oogt het alsof de scores verloren zijn gegaan

### Definitieve invariant
- Na een geldige score-submit mag Dream Builder niet terugvallen naar de generieke `20+ statements => scoring view` flow.
- De reeds ingevulde scores moeten de bron van waarheid zijn voor wat daarna gebeurt.
- Het eerstvolgende inhoudelijke resultaat moet een Droomvoorstel zijn op basis van de hoogste scorethema's.
- Als de scoring-view toch opnieuw verschijnt, mogen eerder ingevulde scores niet visueel als leeg of `0` terugkomen zonder expliciete reden.
- Score-submit, top-clusterselectie en Dream-formulering moeten als één doorlopende keten werken.

### Enige oplossing
- Maak de post-score flow strikt score-gedreven en voorkom dat de generieke `20+` scoring-fallback deze route opnieuw overneemt.

Concreet:
1. Behandel een geldige score-submit als een definitieve overgang naar de Dream-formuleringsfase.
2. Zorg dat de vervolgcall altijd de al berekende `dream_top_clusters` gebruikt als input voor de Dream-formulering.
3. Zorg dat deze route niet opnieuw in de generieke `statement_count >= 20 => scoring_phase=true` logica kan vallen.
4. Definieer expliciet welke state leidend is na score-submit:
   - ingevulde scores
   - top clusters
   - awaiting-direction / refine-fase
5. Als de scoring-view om welke reden dan ook opnieuw rendert, gebruik dan bestaande score-state als bron, zodat de UI niet terugvalt naar lege of `0`-waarden.
6. Neem in het oplossingontwerp ook de copy-impact mee als die nodig is om duidelijk te maken dat de flow nu van `scores` naar `Droomvoorstel` gaat.
7. Als daarvoor nieuwe tekstkeys nodig zijn:
   - categoriseer ze direct in de juiste functionele namespace
   - registreer ze daarna in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit volgt de bestaande productlogica die al in de specialistinstructie staat
- dit voorkomt dat score-submit semantisch ongedaan wordt gemaakt door een generieke fallback
- en dit maakt zichtbaar dat de ingevulde scores echt gebruikt zijn voor het Droomvoorstel

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
Na een geldige Dream Builder score-submit moet het systeem een Droom formuleren op basis van de hoogste scorethema's. In de praktijk lijkt de flow nu soms terug te vallen naar een nieuwe scoring/herclustering-staat waarbij ingevulde waarden weer leeg of `0` lijken.

Concrete codebevinding
- In `mcp-server/src/handlers/run_step_routes.ts` bestaat al een expliciet score-submitpad:
  - lees scores in
  - bereken cluster averages
  - bepaal `dream_top_clusters`
  - roep `DreamExplainer` direct opnieuw aan voor Dream-formulering
- In `mcp-server/src/steps/dream_explainer.ts` staat ook expliciet dat na score-ontvangst de flow naar Dream-direction / Dream-formulation hoort te gaan.
- Tegelijk bevat de generieke DreamExplainer-logica een `20+ statements` scoring-fallback.
- In de widget worden scores tijdelijk client-side bewaard, maar bij een nieuwe scoring-render weer leeg geïnitialiseerd als er geen hergebruik van bestaande score-state plaatsvindt.

Opdracht
Herstel deze contractbreuk zodat score-submit altijd leidt tot Dream-formulering op basis van de hoogste scores, en niet terugvalt naar een hernieuwde scoring-view met lege waarden.

Voer precies deze oplossing uit:
1. Maak score-submit een expliciete overgang naar de post-score Dream-formuleringsfase.
2. Gebruik `dream_top_clusters` als verplichte input voor de daaropvolgende Dream-formulering.
3. Voorkom dat de generieke `20+ statements => scoring_phase=true` logica deze route opnieuw overneemt.
4. Maak de post-score state machine expliciet en stabiel:
   - scores ontvangen
   - top clusters bepaald
   - Dream-formulering gestart
   - builder_refine / equivalent vervolgstate actief
5. Als de scoring-view toch opnieuw kan renderen, vul die vanuit bestaande score-state in plaats van met lege of `0`-waarden.
6. Neem copy-impact meteen mee in het holistische ontwerp als extra uitleg of labelwijziging functioneel nodig blijkt.
7. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen hardcoded tekst in code; gebruik de bestaande contract-, UI-string- en i18n-structuur.
- Geen quick fix of symptoombestrijding; los dit structureel op in de juiste laag.
- Niet opnieuw clusteren als vervanging voor een geldige score-submit.
- Geen oplossing die eerder ingevulde scores visueel laat verdwijnen zonder expliciete reset.
- Geen workaround die alleen de knoptekst of prompttekst aanpast.
- Geen client-only patch als de server-state machine nog steeds terugvalt naar scoring.
- Gebruik de bestaande scoredata als bron van waarheid voor de vervolgstap.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.
