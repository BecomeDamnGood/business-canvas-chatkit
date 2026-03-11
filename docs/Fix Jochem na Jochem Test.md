# Fix Jochem na Jochem Test

## Fix 1 - Dream Builder scoring submit moet deterministisch door naar droomformulering, zonder leeglopende scores of hangend scoring-scherm

### Probleem in mensentaal
- De user vult in Dream Builder alle scores in.
- Daarna klikt de user op `formuleer een droom voor mij`.
- Verwachte uitkomst:
  - de flow gebruikt de ingevulde scores
  - gaat door naar een geformuleerde Droom of refine-scherm
  - en laat geen scoreverlies zien
- Werkelijke uitkomst:
  - de user blijft op hetzelfde scoring-scherm hangen
  - en alle ingevulde waarden lijken weer leeg
- Voor de user voelt dit alsof de knop niets heeft gedaan en alsof het systeem de invoer heeft weggegooid.

### Scopegrens
- Deze fix gaat over de overgang:
  - van volledig ingevulde Dream Builder scoring
  - naar `formuleer een droom voor mij`
  - naar de eerstvolgende renderstaat
- Deze fix gaat niet over:
  - het eerdere verzamelen van Dream Builder-statements
  - de aparte `switch to self`-semantiek
  - de inhoudelijke kwaliteit van de uiteindelijke droomformulering
- Deze fix moet wel end-to-end kloppen over:
  - route-afhandeling
  - statepersist
  - UI-variantselectie
  - en client-side tijdelijke scorestate

### Input (zoals gemeld)
- De user zit in Dream Builder scoring.
- Alle scorevelden zijn ingevuld.
- De user kiest `formuleer een droom voor mij`.
- Gewenste uitkomst:
  - de scores blijven behouden
  - de topclusters worden gebruikt
  - en de UI gaat door naar de geformuleerde Droom of refine-fase
- Huidige uitkomst:
  - de UI blijft in scoring hangen
  - en de ingevulde waarden zijn leeg

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- In `mcp-server/src/handlers/run_step_routes.ts` probeert `dream_submit_scores` inhoudelijk al het juiste te doen:
  - parsed scores lezen
  - `dream_scoring_statements`, `dream_scores` en `dream_top_clusters` opslaan
  - runtime mode naar `builder_refine` zetten
  - en direct `DreamExplainer` aanroepen voor de formulering
- Hoog-over betekent dit:
  - de backend-route is bedoeld als directe overgang van scoring naar formulering
  - niet als terugkeer naar hetzelfde scoring-scherm
- In `mcp-server/ui/lib/ui_render.ts` wordt bij de scoring-submitknop de tijdelijke clientscore-buffer direct leeggemaakt met:
  - `win.__dreamScoringScores = []`
  - nog voordat de volgende renderstaat bewezen is
- Dat is riskant, omdat dan precies dit kan gebeuren:
  - de submit is wel gestart
  - maar als de UI daarna nog één keer de scoring-variant rendert
  - zijn de client-side ingevulde waarden al weg
  - en oogt het alsof alles is gereset
- De scoring-UI zelf wordt opnieuw opgebouwd vanuit:
  - tijdelijke clientscores
  - of anders `state.dream_scores`
- Daardoor ontstaat een kwetsbaar handoff-moment:
  - als de response- of renderselectie nog op scoring uitkomt
  - terwijl de tijdelijke clientscores al zijn gewist
  - ziet de user opnieuw hetzelfde scherm, maar leeg
- Dit verklaart ook waarom de vorige fix dit niet echt oploste:
  - die zat semantisch op het bewaren/hervatten van Dream Builder-context
  - maar deze bug zit later, in de overgang van `scoring submit` naar `formulering render`

### Definitieve invariant
- Zodra alle scores geldig zijn ingevuld en de user `formuleer een droom voor mij` kiest, mag een geaccepteerde submit niet eindigen in een leeg scoring-scherm.
- De submit-overgang moet atomair aanvoelen:
  - ofwel de user blijft in scoring met exact dezelfde ingevulde waarden zichtbaar
  - ofwel de user gaat door naar de volgende Dream Builder-/formuleringsstaat
- Een tussentoestand waarbij:
  - het scoring-scherm nog zichtbaar is
  - maar de zojuist ingevulde waarden zijn verdwenen
  - is expliciet ongeldig
- Een geaccepteerde submit met state-advance moet de scoring-UI verlaten, tenzij de backend bewust een herstel- of correctiesituatie terugstuurt.
- Als er toch een fout of retry optreedt, moeten de ingevulde scores zichtbaar behouden blijven.

### Enige oplossing
- Maak de scoring-submitovergang transactioneel over backend-state, UI-variant en client-side scorebuffer.

Concreet:
1. Behandel `dream_submit_scores` als een echte fase-overgang:
   - accepted submit betekent door naar formuleer/refine
   - niet terugvallen naar impliciete scoring-render zonder expliciete reden
2. Wis de tijdelijke clientscore-buffer niet optimistisch voordat de volgende geldige renderstaat vaststaat.
3. Houd de ingevulde scorematrix zichtbaar totdat:
   - ofwel een refine/formulering-response succesvol is gerenderd
   - ofwel een expliciete fout/validatiestatus terugkomt die scoring opnieuw vereist
4. Forceer in de relevante response-/renderlaag dat een geaccepteerde `dream_submit_scores`-response met opgeslagen scorecontext niet opnieuw als `dream_builder_scoring` wordt behandeld.
5. Zorg dat stale scoring-payloads of stale UI-variantafleiding een nieuwere accepted refine-response niet kunnen overschrijven.
6. Als scoring toch opnieuw moet renderen, hydrateer dan uit de zojuist opgeslagen `dream_scores` zodat de user nooit lege velden terugziet.
7. Maak in tests expliciet onderscheid tussen:
   - submit geaccepteerd en door naar refine
   - submit faalt maar scores blijven zichtbaar
   - scoring rerender met persistente waarden
8. Neem client-side ingest/persistlogica mee in de fix, niet alleen de route-handler.
9. Als hiervoor nieuwe UI-tekst nodig is:
   - zet die in de juiste functionele categorie/namespace
   - registreer die in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat alle locale-bestanden worden aangepast

Waarom dit de juiste oplossing is:
- dit lost het echte usersymptoom op in plaats van alleen de backendroute te vertrouwen
- dit voorkomt invoerverlies in een belangrijke interactieve stap
- en dit maakt de scoring-submitovergang consistent over serverstate en widgetrendering heen

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
In Dream Builder scoring vult de user alle scores in en kiest daarna `formuleer een droom voor mij`. Op dit moment blijft de UI soms op hetzelfde scoring-scherm hangen en lijken alle waarden weer leeg. De vorige fix rond Dream Builder-contextbehoud was hiervoor niet genoeg, omdat deze bug later zit: in de submit-overgang van scoring naar formulering/refine-render.

Concrete codebevinding
- In `mcp-server/src/handlers/run_step_routes.ts` zet `dream_submit_scores` de flow inhoudelijk al richting formulering:
  - scores worden geparsed
  - `dream_scoring_statements`, `dream_scores` en `dream_top_clusters` worden opgeslagen
  - runtime mode gaat naar `builder_refine`
  - daarna wordt `DreamExplainer` direct aangeroepen
- In `mcp-server/ui/lib/ui_render.ts` wordt bij scoring submit de tijdelijke clientbuffer meteen leeggemaakt met `win.__dreamScoringScores = []` voordat de volgende renderstaat bewezen is.
- Als de UI daarna nog een scoring-variant rendert of een stale scoring-weergave aanhoudt, worden de inputs opnieuw opgebouwd zonder de net ingevulde clientwaarden.
- Daardoor ontstaat precies het gemelde symptoom:
  - de user blijft op scoring hangen
  - en ziet lege velden

Opdracht
Los dit structureel op als een overgangs- en renderinvariant, niet als een lokale patch op slechts een van de lagen.

Voer precies deze oplossing uit:
1. Maak `dream_submit_scores` end-to-end transactioneel:
   - accepted submit moet leiden tot een stabiele overgang naar refine/formulering
   - niet tot een lege scoring-rerender
2. Verwijder of verplaats het vroegtijdig leegmaken van de tijdelijke clientscore-buffer.
   - Wis client-side scores pas nadat de volgende geldige staat succesvol is overgenomen
   - of houd ze aan zolang scoring nog gerenderd wordt
3. Zorg dat een accepted response met opgeslagen `dream_scores` en refine/formuleringscontext niet opnieuw als `dream_builder_scoring` wordt gerenderd zonder expliciete backendreden.
4. Controleer de volledige keten:
   - route-handler
   - state update
   - response finalize/render
   - UI variant selection
   - client ingest/persist
5. Voorkom dat stale scoring-state of stale scoring-payload een nieuwere accepted refine-response kan domineren.
6. Als scoring om een geldige reden opnieuw moet renderen, hydrateer de velden dan uit persistente `dream_scores` zodat ingevulde waarden zichtbaar blijven.
7. Voeg regressietests toe die minimaal bewijzen:
   - ingevulde scoring-submit gaat door naar refine/formulering
   - scoring-inputs worden niet leeg als de response nog niet direct zichtbaar wisselt
   - een rerender van scoring gebruikt persisted scores
   - stale scoring-weergave overschrijft refine niet
8. Als nieuwe tekstkeys nodig zijn:
   - zet ze meteen in de juiste functionele categorie/namespace
   - registreer ze in `docs/overzicht-ontbrekende-ui-vertalingen.md`
   - vraag apart toestemming voordat je alle talen bijwerkt

Harde regels
- Geen symptoombestrijding die alleen de knop of copy wijzigt.
- Geen fix die alleen backendstate opslaat maar client-side renderverlies laat bestaan.
- Geen vroegtijdige reset van scores zolang scoring nog zichtbaar kan zijn.
- Een accepted `formuleer een droom voor mij`-submit mag niet eindigen in een leeg scoring-scherm.
- Als scoring zichtbaar blijft, moeten de ingevulde waarden intact zichtbaar blijven.
- Los dit op in de echte overgangsketen, inclusief widget-state en rerendergedrag.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 3 - Eerste vrije strategie-input mag niet onterecht als aanpas/verwijder-verzoek op een bestaande focuspuntenlijst worden behandeld

### Probleem in mensentaal
- De user komt in de stap Strategie en geeft voor het eerst inhoudelijke input.
- Bijvoorbeeld:
  - een of meerdere ruwe focuspunten
  - losse bullets
  - of een vrije tekst met twee strategische richtingen
- In plaats van die input inhoudelijk op te pakken, reageert het systeem alsof de user een bestaand focuspunt wil aanpassen of verwijderen.
- Daardoor krijgt de user een irrelevante reactie in de trant van:
  - het is niet duidelijk welk focuspunt je wilt aanpassen of verwijderen
- Dat is fout, want er is op dat moment nog helemaal geen bestaande strategielijst waarop zo'n mutatie logisch zou zijn.

### Scopegrens
- Deze fix gaat over de eerste inhoudelijke free-text input in stap `strategy`.
- Deze fix gaat over de preclassificatie vóór de specialistresponse.
- Deze fix gaat niet over:
  - de kwaliteit van de uiteindelijke strategieherformulering
  - het later bewerken van bestaande strategie-focuspunten wanneer er wél al een lijst bestaat
  - wording-choice gedrag nadat er al een voorstel of lijst aanwezig is
- Deze fix moet wel correct werken voor:
  - eerste input als losse zin
  - eerste input als meerdere bullets of zinnen
  - en eerste input met ruwe, nog niet perfect geformuleerde focuspunten

### Input (zoals gemeld)
- Eerste strategie-input van de user:
  - `Altijd investeren in de nieuwste AI-technologieën die relevant zijn voor onze klanten`
  - `Prototyping en MVP's bouwen als 'show what we can do for you' (zichtbaar zijn met dingen die er toe doen) - ook Jochems app!`
- Gewenste uitkomst:
  - het systeem leest dit als nieuwe strategie-inhoud
  - en helpt die input structureren of herformuleren
- Huidige uitkomst:
  - het systeem doet alsof de user een bestaand focuspunt wil aanpassen/verwijderen
  - en vraagt welk exact focuspunt bedoeld wordt

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- In `mcp-server/src/handlers/run_step_pipeline.ts` wordt vrije tekst in business-list-stappen al vroeg via `resolveBusinessListTurn(...)` geclassificeerd.
- Dat gebeurt ook voor stap `strategy`, nog vóór de specialist inhoudelijk antwoord geeft.
- In `mcp-server/src/handlers/run_step_business_list_turn.ts` retourneert `resolveBusinessListTurn(...)` nu bij `referenceItems.length === 0` niet `add`, maar meteen `clarify` met reden `missing_reference`.
- Hoog-over betekent dit:
  - als er nog geen bestaande strategie-focuspunten zijn
  - behandelt de runtime de eerste input alsnog alsof er een bestaande lijst is waarop de user een mutatie probeert te doen
- Daarna krijgt de specialist geen gewone vrije userinput, maar een routeprompt `__BUSINESS_LIST_CLARIFY__`.
- In `mcp-server/src/steps/strategy.ts` staat voor dat routepad expliciet dat de specialist moet vragen welk huidige focuspunt de user wil aanpassen of verwijderen.
- Dat verklaart exact de foutmelding in de UI.
- Tegelijk staat in dezelfde strategie-instructies ook dat ruwe eerste vrije tekst juist lokaal moet worden geïnterpreteerd en als voorstel/refine moet worden behandeld.
- Hoog-over zit de fout dus niet in de Strategy-specialist zelf, maar in de pre-routering ervoor.

### Definitieve invariant
- Als er in stap `strategy` nog geen bestaande focuspuntenlijst bestaat, mag de eerste inhoudelijke userinput nooit als business-list edit/remove/clarify worden behandeld.
- Zonder bestaande referentielijst bestaat er niets om exact te citeren, vervangen of verwijderen.
- In dat scenario moet de input altijd als nieuwe strategiebijdrage worden behandeld:
  - direct als `add`
  - of als vrije tekst die de specialist moet herformuleren
- Pas wanneer er echt een bestaande canonieke strategielijst is, mag local list-editing actief worden.
- De runtime mag de specialist niet met een `__BUSINESS_LIST_CLARIFY__`-prompt voeden als de user feitelijk gewoon zijn eerste strategie-input geeft.

### Enige oplossing
- Beperk business-list mutatieroutering in `strategy` tot situaties waar er aantoonbaar al een bestaande strategiereferentielijst is, en laat eerste inhoudelijke input anders altijd door als nieuwe bijdrage.

Concreet:
1. Maak het onmogelijk dat eerste strategie-input zonder bestaande reference items in het `clarify`-pad belandt.
2. Als er nog geen canonieke strategie-items bestaan:
   - behandel de turn als `add`
   - niet als `clarify`
3. Activeer local list-editing alleen wanneer er daadwerkelijk een bestaande strategielijst is om op te muteren.
4. Houd expliciete remove/replace/edit-semantiek intact voor latere turns waarin zo'n lijst al bestaat.
5. Zorg dat meerdere ruwe bullets of vrije zinnen in een eerste beurt gewoon naar de Strategy-specialist gaan als inhoudelijke input.
6. Laat de specialist daarna de bestaande strategie-instructies volgen:
   - lokale herformulering
   - refine bij ruwe tekst
   - of voorstelopbouw
7. Voeg regressietests toe die bewijzen dat:
   - eerste strategie-input zonder reference items niet naar `__BUSINESS_LIST_CLARIFY__` gaat
   - eerste input met meerdere regels als inhoudelijke add-turn wordt behandeld
   - edit/remove-gedrag pas actief wordt zodra er wél bestaande focuspunten zijn
8. Controleer of dezelfde fout niet ook onbedoeld optreedt in vergelijkbare list-steps, maar verander alleen wat codebewijs rechtvaardigt.

Waarom dit de juiste oplossing is:
- dit corrigeert de fout op de juiste laag: de preclassificatie
- dit laat de specialist eindelijk de echte eerste userinput verwerken
- en dit bewaart tegelijk het nuttige lokale list-editgedrag voor latere bewerkingsbeurten

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
De eerste vrije inhoudelijke input in stap `strategy` wordt nu soms onterecht behandeld alsof de user een bestaand focuspunt wil aanpassen of verwijderen. Daardoor krijgt de user een irrelevante verduidelijkingsvraag over welk focuspunt bedoeld wordt, terwijl er op dat moment nog helemaal geen bestaande strategielijst is.

Concrete codebevinding
- In `mcp-server/src/handlers/run_step_pipeline.ts` wordt vrije tekst in `strategy` vroeg door `resolveBusinessListTurn(...)` gestuurd.
- In `mcp-server/src/handlers/run_step_business_list_turn.ts` retourneert die resolver bij `referenceItems.length === 0` nu `clarify` met reden `missing_reference`.
- Daardoor krijgt de specialist een `__BUSINESS_LIST_CLARIFY__`-routeprompt in plaats van de echte userinput.
- In `mcp-server/src/steps/strategy.ts` is voor `__BUSINESS_LIST_CLARIFY__` expliciet voorgeschreven dat de specialist dan vraagt welk huidig focuspunt aangepast of verwijderd moet worden.
- Tegelijk schrijven de Strategy-instructies voor dat ruwe vrije tekst of nieuwe bullets juist inhoudelijk moeten worden geïnterpreteerd en geherformuleerd.

Opdracht
Herstel deze preclassificatiefout zodat eerste strategie-input zonder bestaande focuspuntenlijst nooit meer in het local-edit clarify-pad belandt.

Voer precies deze oplossing uit:
1. Zorg dat `strategy`-input zonder bestaande `referenceItems` als nieuwe bijdrage wordt behandeld, niet als `clarify`.
2. Laat de eerste inhoudelijke userinput rechtstreeks door naar de normale Strategy-specialistflow.
3. Activeer business-list edit/remove/replace/clarify alleen wanneer er daadwerkelijk een bestaande strategielijst is.
4. Behoud bestaand mutatiegedrag voor latere turns waarin er al canonieke focuspunten bestaan.
5. Zorg dat meerdere regels of meerdere ruwe focuspunten in één eerste beurt niet geblokkeerd worden door de local-edit router.
6. Voeg regressietests toe die minimaal bewijzen:
   - geen `__BUSINESS_LIST_CLARIFY__` bij eerste strategie-input zonder reference items
   - eerste input met meerdere focuspunten blijft een add-/inhoudelijke beurt
   - later edit/remove-gedrag blijft werken zodra reference items bestaan

Harde regels
- Geen symptoombestrijding in de specialistcopy alleen.
- Geen fix die de clarify-tekst maskeert maar de verkeerde preclassificatie laat bestaan.
- Zonder bestaande focuspuntenlijst mag `strategy` niet doen alsof de user iets bestaands probeert te wijzigen.
- De eerste inhoudelijke strategie-input moet inhoudelijk verwerkt worden.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.

---

## Fix 2 - Na terugschakelen uit Dream Builder moet de knoptekst semantisch omslaan van `start` naar `ga verder`, in alle talen

### Probleem in mensentaal
- De user zit eerst in Dream Builder.
- Daarna kiest de user `zelf de droom formuleren`.
- In dat scherm verschijnt nog steeds de standaardknoptekst die voelt als een nieuwe start:
  - `Doe een kleine oefening die helpt om je droom te definiëren.`
- Maar functioneel is dat in dit scenario niet meer juist.
- De onderliggende Dream Builder-context is namelijk al aanwezig:
  - statements kunnen al bestaan
  - scores kunnen al onthouden zijn
  - en klikken op die knop hervat de oefening in plaats van een lege nieuwe start te doen
- Voor de user is de huidige tekst daarom misleidend.

### Scopegrens
- Deze fix gaat over knopsemantiek en i18n wanneer de user:
  - uit Dream Builder terugschakelt naar zelf formuleren
  - en daarna opnieuw de builder kan hervatten
- Deze fix gaat niet over:
  - het technische bewaren van Dream Builder-state zelf
  - de scoring-submitbug uit Fix 1
  - de inhoud van de switch-to-self begeleidende tekstblokken
- Deze fix moet wel consistent zijn over:
  - contract/menu-labels
  - button-rendering
  - en alle vertaalbestanden

### Input (zoals gemeld)
- De user komt uit Dream Builder via de knop `zelf de droom formuleren`.
- Daarna ziet de user in het self-formulate-scherm nog steeds de standaard exercise-button.
- Gewenste uitkomst:
  - als hervatten mogelijk is, moet de knop zeggen:
    - `Ga verder met de kleine oefening die helpt om je droom te definiëren.`
- Dit moet niet alleen in het Nederlands kloppen, maar via de vertaalstructuur in alle ondersteunde talen gelijkwaardig worden doorgevoerd.

### Eerste analyse (grote lijnen, met concrete codebevindingen)
- De huidige exercise-route blijft actioneel dezelfde:
  - `ACTION_DREAM_INTRO_START_EXERCISE`
  - route naar `__ROUTE__DREAM_START_EXERCISE__`
- In `mcp-server/src/handlers/run_step_routes.ts` zet `dream_switch_to_self` de user terug naar Dream self-mode, maar laat tegelijk de builder-context beschikbaar voor hervatting.
- Hoog-over betekent dit:
  - productmatig is de knop in dit scherm na switch-to-self geen `start`-actie meer
  - maar een `resume`-actie
- Tegelijk zie ik dat de huidige knoplabeling nog generiek is:
  - in `mcp-server/ui/lib/ui_render.ts` wordt `btnStartDreamExercise` rechtstreeks gevuld met `t(lang, "dreamBuilder.startExercise")`
  - in de i18n-bestanden bestaat ook de generieke menulabel-key:
    - `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE`
- In `mcp-server/src/handlers/turn_contract.ts` wordt voor deze actie nu ook nog de generieke labelKey `dreamBuilder.startExercise` gebruikt.
- Hoog-over betekent dit:
  - de huidige i18n- en contractlaag kent geen onderscheid tussen:
    - eerste keer Dream Builder starten
    - Dream Builder hervatten na switch-to-self
- Daardoor kan de UI nu semantisch niet juist spreken, ook al is de state technisch hervatbaar.

### Definitieve invariant
- Als de user uit Dream Builder is teruggeschakeld naar zelf formuleren en er nog hervatbare Dream Builder-context bestaat, dan moet de oefenknop als `verdergaan` worden gepresenteerd, niet als `opnieuw starten`.
- De actiecode mag gelijk blijven als het gedrag gelijk is, maar de user-facing labelsemantiek moet contextbewust zijn.
- De knoptekst moet via de bestaande i18n-structuur in alle talen beschikbaar zijn.
- Er mag geen hardcoded taalafwijking ontstaan waarbij alleen Nederlands een andere knoptekst krijgt.
- De labelkeuze moet bepaald worden door state/context, niet door toeval van schermvolgorde.

### Enige oplossing
- Introduceer een expliciet `resume exercise`-labelpad voor Dream Builder en gebruik dat alleen wanneer switch-to-self terugkomt op een hervatbare builder-context.

Concreet:
1. Maak expliciet onderscheid tussen:
   - `Dream Builder starten`
   - en `Dream Builder hervatten`
2. Laat de knop in het self-formulate-scherm na switch-to-self een andere labelkey gebruiken zodra hervatten mogelijk is.
3. Bepaal die semantiek op basis van echte state, bijvoorbeeld aanwezigheid van hervatbare builder-context:
   - statements
   - en/of herbruikbare scorecontext
4. Houd de actioncode gelijk als het gedrag gelijk blijft:
   - het probleem zit in de labelsemantiek, niet per se in de route
5. Voeg nieuwe vertaalkeys toe in de juiste functionele categorie voor alle ondersteunde talen.
6. Werk zowel de directe buttontekst als eventuele contract-/menu-labels consequent bij, zodat widget en contract niet uiteenlopen.
7. Zorg dat de generieke starttekst behouden blijft voor echte first-start-scenario's.
8. Voeg regressietests toe die bewijzen dat:
   - eerste start nog steeds `start`-taal gebruikt
   - switch-to-self met hervatbare builder-context `ga verder`-taal gebruikt
   - dezelfde semantiek terugkomt in contract/renderlaag
9. Registreer nieuwe tekstkeys in `docs/overzicht-ontbrekende-ui-vertalingen.md` als dat proces documentair vereist is.

Waarom dit de juiste oplossing is:
- dit volgt de echte productsemantiek van het scherm
- dit voorkomt misleidende copy bij een hervatbare flow
- en dit houdt de oplossing structureel in de i18n- en contractlaag, in plaats van als losse NL-uitzondering

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
Na `zelf de droom formuleren` vanuit Dream Builder komt de user terug in het Dream self-formulate-scherm. In dat scherm staat nu nog de standaardtekst voor een nieuwe start van de oefening, terwijl de builder-context in dit scenario vaak gewoon hervatbaar is. Daardoor is de knoptekst misleidend: de user start niet opnieuw, maar gaat verder met een al opgebouwde oefening.

Concrete codebevinding
- De hervatactie blijft functioneel `ACTION_DREAM_INTRO_START_EXERCISE` richting `__ROUTE__DREAM_START_EXERCISE__`.
- In `mcp-server/src/handlers/run_step_routes.ts` laat `dream_switch_to_self` Dream Builder-context beschikbaar voor latere hervatting.
- In `mcp-server/ui/lib/ui_render.ts` krijgt `btnStartDreamExercise` nu nog generiek `t(lang, "dreamBuilder.startExercise")`.
- In `mcp-server/src/handlers/turn_contract.ts` wordt voor deze actie ook nog generiek `dreamBuilder.startExercise` als labelKey gebruikt.
- In de locale-bestanden bestaat voor het menu ook alleen de generieke start-variant:
  - `menuLabel.DREAM_MENU_INTRO.ACTION_DREAM_INTRO_START_EXERCISE`
- Daardoor bestaat er nu geen contextbewust onderscheid tussen eerste start en hervatten.

Opdracht
Los dit op in de i18n-, contract- en renderlaag zodat de knoptekst na switch-to-self semantisch correct `verdergaan` uitdrukt wanneer Dream Builder hervatbaar is.

Voer precies deze oplossing uit:
1. Introduceer een expliciet resume-labelpad voor Dream Builder exercise.
2. Bepaal op basis van echte state of hervatten mogelijk is:
   - bestaande Dream Builder-statements
   - en/of score/topclustercontext die hervatbaar is
3. Gebruik in dat scenario een aparte labelkey met betekenis:
   - `Ga verder met de kleine oefening die helpt om je droom te definiëren.`
4. Houd voor echte first-start-scenario's de bestaande start-tekst intact.
5. Werk de relevante lagen consequent bij:
   - turn contract labelKey
   - UI render buttontekst
   - eventuele menu-/contractlabelweergave
6. Voeg de nieuwe tekstkey(s) toe in alle ondersteunde locale-bestanden, niet alleen in het Nederlands.
7. Registreer nieuwe tekstkeys in `docs/overzicht-ontbrekende-ui-vertalingen.md` als dat binnen dit repo-proces vereist is.
8. Voeg regressietests toe die minimaal bewijzen:
   - standaard intro gebruikt nog steeds start-tekst
   - switch-to-self met hervatbare builder-context gebruikt resume-tekst
   - contract- en UI-laag blijven daarin gelijk

Harde regels
- Geen hardcoded Nederlandse uitzondering.
- Geen copy-fix alleen in de DOM zonder contract/i18n-ondersteuning.
- Geen wijziging waarbij first-start en resume semantisch door elkaar gaan lopen.
- Als de flow hervatbaar is, moet de knoptekst dat ook expliciet zeggen.
- De oplossing moet in alle talen gelijkwaardig werken via de vertaalbestanden.
```

### Toestemming
- Als je wilt dat deze fix ook echt wordt geïmplementeerd, geef dan eerst expliciet toestemming voor uitvoering.
