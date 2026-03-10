# Fix Jochem na Jochem Test


## Fix 1 - Bullet-Step SSOT: grouped compare mag niet terugvallen naar legacy full-set compare bij anchorless rewrites, en wording-choice mag de normale step-prompt niet lekken

### Input (zoals gemeld)
Bij `strategy`, `productsservices` en `rulesofthegame` werkt het product inhoudelijk met bullets/lijsten.

De gewenste productrichting was al:
- niet langer standaard twee volledige sets naast elkaar vergelijken
- wel: alleen echte verschillen reviewen
- correcte / niet-betwiste bullets automatisch behouden
- compare per afwijkende compare-unit
- finale set daarna nog steeds langs de bestaande set-based gates

Maar in de praktijk gaat het nog steeds mis in een belangrijk type case:
- de user geeft 2 tot 5 bullets of losse zinnen
- de agent herschrijft die inhoudelijk goed, maar zonder exacte tekstuele overlap
- bijvoorbeeld:
  - `3 user-bullets -> 4 compactere / scherpere suggestion-bullets`
  - of `2 user-bullets -> 3 herschreven suggestion-bullets`
- inhoudelijk is het nog steeds duidelijk dezelfde set-discussie
- maar de UI valt terug naar de oude full-set compare

Zichtbare symptomen:
- de user ziet weer:
  - `Dit is jouw input`
  - `Dit zou mijn suggestie zijn`
  - twee volledige blokken
  - twee keer `Kies deze versie`
- niet-betwiste punten worden dus niet automatisch behouden
- de user moet alsnog bijna de hele set A versus B kiezen

Tweede zichtbaar probleem:
- tijdens wording-choice blijft de normale step-prompt onder de compare zichtbaar
- bijvoorbeeld onder een strategy compare staat nog:
  - `Waar focus je nog meer op binnen je strategie?`
- dat maakt de UI semantisch dubbel:
  - bovenaan vraagt het systeem om wording-keuze
  - onderaan lijkt het systeem alweer om nieuw input te vragen

Belangrijke observatie:
- dit probleem zit niet in de step-prompts zelf
- dit zit in de compare-builder en de wording-choice rendering

### Eerste analyse (grote lijnen, nu met concrete codebevindingen)

#### Hypothese A - De huidige grouped compare is nog te afhankelijk van exacte anchors
- In de huidige implementatie wordt grouped compare alleen gebouwd als er voldoende exact herkenbare overlap is tussen user-items en suggestion-items.
- De code gebruikt eerst een anchor/LCS-achtige match op gecanonicaliseerde list-items.
- Als:
  - `anchors.length === 0`
  - en `userItems.length > 1`
  - en `suggestionItems.length > 1`
- dan valt de code direct terug naar `null` voor grouped compare.
- Daardoor gaat de flow terug naar de oude full-set compare.

#### Hypothese B - Juist de belangrijkste productcases zijn vaak anchorless rewrites
- Een user schrijft vaak:
  - ruwe bullets
  - halve zinnen
  - gemixte observaties
- De agent herschrijft die vervolgens naar:
  - compactere bullets
  - gesplitste bullets
  - samengevoegde bullets
  - positievere of bruikbaardere formuleringen
- In zulke gevallen is exacte tekstuele overlap vaak juist afwezig.
- Dus het product faalt nu juist op de cases waarvoor grouped compare bedoeld was.

#### Hypothese C - De huidige fallback is te grof voor semantisch duidelijke n:m rewrites
- Als `3 -> 4` of `2 -> 3` inhoudelijk duidelijk één herschreven set is, hoort dat nog steeds grouped compare te zijn.
- De fallback naar full-set compare mag alleen gebruikt worden wanneer matching echt semantisch onzeker is.
- Nu wordt full-set fallback al gebruikt zodra exacte anchors ontbreken.
- Dat is te vroeg en productmatig onjuist.

#### Hypothese D - De compare-UI en de gewone step-prompt lopen nog door elkaar
- Tijdens wording-choice wordt de gewone `questionText` nog steeds meegestuurd.
- De frontend rendert daarna:
  - de wording-choice panel
  - én de normale prompt onderaan
- Daardoor lijkt de user tegelijk in twee toestanden te zitten:
  - kies tussen varianten
  - geef nog meer input

#### Hypothese E - De eerdere route-token / prompt-fixes lossen dit probleem niet op
- Step-prompt fixes zoals:
  - `purpose give examples`
  - expliciete route-token documentatie
- zijn nuttig, maar raken dit pad niet.
- Dit issue leeft in:
  - wording compare plan construction
  - wording fallback policy
  - wording-choice rendering

### Definitieve invariant

- `strategy`, `productsservices` en `rulesofthegame` blijven inhoudelijk list-steps.
- De user mag daar niet standaard twee volledige sets hoeven kiezen als het verschil lokaal te reviewen is.
- Grouped compare mag NIET afhankelijk zijn van exacte tekstuele anchors als de set semantisch nog duidelijk matchbaar is.
- Exacte anchors mogen een optimalisatie zijn, maar niet de harde voorwaarde voor grouped compare.
- Voor semantisch duidelijke `1:1`, `1:n`, `n:1` en `n:m` rewrites moet grouped compare de default blijven.
- Alleen wanneer matching echt onzeker is, mag de code terugvallen naar full-set compare of een expliciete herstelroute.
- Niet-betwiste bullets moeten automatisch behouden blijven wanneer dat inhoudelijk verantwoord is.
- Tijdens wording-choice mag de normale step-prompt niet tegelijk zichtbaar zijn.
- De user moet op dat moment één duidelijke taak zien:
  - kies lokaal tussen varianten
- Final confirm/gating blijft set-based en server-side.
- Alle user-facing labels voor grouped compare blijven i18n-gedreven.

### Mogelijke structurele fix

1. Vervang `exact-anchor-first` als harde gate door `semantic compare planning`
- Houd de huidige anchor/LCS-logica als snelle happy path.
- Maar maak `anchors.length === 0` niet automatisch een full-set fallback.
- Voeg een tweede planningslaag toe voor anchorless rewrites:
  - semantic similarity op itemniveau
  - token overlap / normalized phrase overlap
  - eventueel lightweight pair/group scoring
  - of een expliciete compare-unit grouping heuristic voor kleine sets
- Het doel is:
  - semantisch duidelijke n:m herschrijvingen alsnog als grouped compare modelleren
  - zonder te doen alsof er exacte anchors zijn

2. Ondersteun expliciet `n:m` compare-units
- De bestaande productrichting noemt al:
  - `1:1`
  - `1:n`
  - `n:1`
- Maar in de praktijk is ook `n:m` nodig.
- Bijvoorbeeld:
  - 3 user-bullets worden herschreven naar 4 suggestion-bullets
  - zonder letterlijk gedeelde bullet
- In dat geval moet één compare-unit of een kleine reeks compare-units mogelijk zijn, zolang de matching betrouwbaar genoeg is.

3. Gebruik full-set fallback alleen bij echte onzekerheid
- Full-set compare blijft toegestaan, maar alleen als expliciete safety fallback.
- Niet als implicit fallback omdat exacte anchors ontbreken.
- De fallback-conditie moet dus veranderen van:
  - `geen anchors + beide kanten >1`
- naar iets als:
  - `semantic grouping confidence onder drempel`
  - of `meerdere plausibele groupings zonder betrouwbare keuze`

4. Houd retained bullets zichtbaar wanneer ze echt retained zijn
- Als er anchors of semantisch stabiele items zijn:
  - neem die automatisch op als retained
  - toon ze in de instruction / retained block
- Als een case volledig anchorless is:
  - forceer dan geen fake retained bullets
  - maar bouw wel compare-units als de herschreven set nog duidelijk vergelijkbaar is

5. Onderdruk de gewone step-prompt tijdens wording-choice
- Terwijl `wording_choice_pending === true` en de picker actief is:
  - render géén normale step-question onder de picker
  - render géén tweede impliciete ask-state
- De UI moet in wording-choice mode één duidelijke state tonen:
  - compare panel
  - local choice CTA's
  - geen parallelle “wat nog meer?” prompt

6. Houd grouped compare labels semantisch correct
- Als grouped compare actief is voor list-steps, gebruik:
  - `Jouw compacte formulering is dit`
  - `Mijn suggestie is dit`
- Niet de legacy wording:
  - `Dit is jouw input`
  - `Dit zou mijn suggestie zijn`
- Legacy labels mogen alleen blijven voor de oude full-set fallback of pure text compare.

7. Test niet alleen anchor-cases, maar juist de failure-case
- Er moet verplichte testdekking komen voor:
  - `strategy` met `3 user-items -> 4 suggestion-items`
  - geen exacte gedeelde bullet
  - inhoudelijk wel duidelijke rewrite
  - verwacht resultaat: grouped compare, niet legacy full-set compare

### Voorkeursrichting

Voorkeursrichting:
- maak grouped compare semantisch robuust voor kleine anchorless rewrites
- en maak wording-choice render semantisch exclusief

Concreet betekent dat:
- de compare-builder mag niet stoppen zodra exacte anchors ontbreken
- hij moet nog één semantische grouping-pass doen
- pas bij echte onzekerheid valt hij terug naar full-set compare
- en tijdens wording-choice verdwijnt de gewone step-prompt volledig uit beeld

Waarom dit de beste richting is:
- dit lost de echte productbreuk op in plaats van alleen de makkelijke anchor-cases
- dit sluit aan op hoe users daadwerkelijk schrijven
- dit maakt `strategy`, `productsservices` en `rulesofthegame` echt vriendelijker
- dit voorkomt dubbelzinnige UI-states
- dit laat de bestaande confirm/gates intact

### Agent instructie (copy-paste, implementatieopdracht)
```text
Context
Voor `strategy`, `productsservices` en `rulesofthegame` bestaat al grouped compare-werk, maar een belangrijk type case valt nog steeds terug naar legacy full-set compare.

De huidige failure-case:
- user geeft meerdere bullets of losse zinnen
- de agent herschrijft die inhoudelijk goed
- maar zonder exacte tekstuele overlap
- bijvoorbeeld:
  - 3 user-bullets -> 4 suggestion-bullets
  - 2 user-bullets -> 3 suggestion-bullets
- de UI toont dan weer de oude full-set compare:
  - `Dit is jouw input`
  - `Dit zou mijn suggestie zijn`
  - twee complete blokken
- terwijl dit productmatig grouped compare had moeten zijn

Tweede probleem:
- tijdens wording-choice blijft de normale step-prompt onder de compare zichtbaar
- bijvoorbeeld:
  - `Waar focus je nog meer op binnen je strategie?`
- dat is semantisch fout: de user zit nog in compare/pick state, niet in nieuwe input state

Concrete codebevinding
De huidige compare-builder gebruikt exacte anchors/LCS op canonicalized list items.
Als:
- er geen anchors zijn
- én beide kanten meer dan 1 item hebben
dan valt de compare-builder nu direct terug naar `null`,
waardoor de legacy full-set compare activeert.

Dat is te grof.
Exacte anchors mogen een optimalisatie zijn, maar niet de harde voorwaarde voor grouped compare.

Nieuwe productrichting
Voor `strategy`, `productsservices` en `rulesofthegame` moet grouped compare ook werken bij kleine anchorless rewrites, zolang de matching semantisch betrouwbaar genoeg is.

De flow moet dus zijn:
1. probeer anchors / retained bullets te vinden
2. als anchors ontbreken, probeer alsnog semantic compare grouping
3. bouw grouped compare-units voor semantisch duidelijke `1:1`, `1:n`, `n:1` en `n:m`
4. val alleen terug naar full-set compare als matching echt onzeker is
5. toon tijdens wording-choice géén normale step-prompt onder de compare

Harde regels
- Behoud server-side set-based gating als eindautoriteit
- Geen vrije bullet-editor bouwen
- Geen fake retained bullets tonen als die er inhoudelijk niet zijn
- Geen semantisch onbetrouwbare pairings forceren
- Full-set compare blijft alleen een expliciete safety fallback
- Tijdens wording-choice geen parallelle ask-state renderen
- Geen hardcoded user-facing copy toevoegen
- Grouped compare labels blijven i18n-gedreven

Uit te voeren aanpak

1. Maak grouped compare niet afhankelijk van exacte anchors
- Houd de huidige anchor/LCS-logica als eerste pass.
- Verwijder de huidige harde return die grouped compare afbreekt zodra:
  - `anchors.length === 0`
  - en beide kanten meer dan 1 item hebben
- Voeg daarna een tweede semantic planning pass toe.

2. Voeg semantic grouping toe voor anchorless kleine lists
- Richt op kleine list-steps:
  - `strategy`
  - `productsservices`
  - `rulesofthegame`
- Ondersteun semantisch duidelijke rewrites zoals:
  - 1 -> 1
  - 1 -> 2
  - 2 -> 1
  - 3 -> 4
  - 2 -> 3
- Een compare-unit hoeft dus niet exact bullet-tegen-bullet te zijn.
- Als één duidelijke grouping mogelijk is, gebruik grouped compare.

3. Gebruik confidence-based fallback
- Als semantic grouping te onzeker is:
  - gebruik dan expliciet legacy full-set compare
- Maar maak `geen exacte anchors` op zichzelf niet langer voldoende reden voor fallback.

4. Houd retained bullets alleen als ze echt retained zijn
- Als er anchors of semantisch stabiele overeenkomsten zijn:
  - zet die in retained segments
- Als de hele case een complete rewrite is zonder retained items:
  - grouped compare mag nog steeds
  - maar dan zonder retained block of met leeg retained block

5. Maak wording-choice render exclusief
- Als wording-choice actief is:
  - render de compare panel
  - render de picker CTA's
  - render NIET de gewone step-prompt onder de compare
- De user mag op dat moment geen dubbele taak zien.

6. Houd grouped compare labels semantisch correct
- Voor grouped list compare:
  - user side: `Jouw compacte formulering is dit`
  - suggestion side: `Mijn suggestie is dit`
- Legacy wording:
  - `Dit is jouw input`
  - `Dit zou mijn suggestie zijn`
  mag alleen zichtbaar zijn in echte legacy full-set fallback of pure text compare.

Verplichte outputstructuur van je implementatieverslag
A. Waarom de huidige compare-builder terugviel naar legacy full-set compare
B. Hoe anchorless semantic grouping nu werkt
C. Hoe en wanneer full-set fallback nog wordt gebruikt
D. Hoe wording-choice rendering de normale step-prompt nu onderdrukt
E. Welke i18n-labels actief blijven voor grouped compare
F. Waarom de bestaande set-based gates intact blijven
G. Welke regressietests zijn toegevoegd

Verplichte testdekking
- `strategy`: 3 user-items -> 4 suggestion-items, geen exacte anchors, maar wel grouped compare
- `productsservices` of `rulesofthegame`: extra anchorless n:m rewrite-case
- bestaande anchor-based grouped compare blijft werken
- retained bullets blijven zichtbaar als ze echt bestaan
- legacy full-set fallback blijft actief bij echt onzekere matching
- grouped compare gebruikt niet de legacy labels
- tijdens wording-choice wordt de gewone step-prompt niet onder de compare gerenderd

Definitieve invariant
- Voor `strategy`, `productsservices` en `rulesofthegame` mag grouped compare niet alleen werken als er exacte anchors zijn.
- Kleine semantisch duidelijke anchorless rewrites moeten ook grouped compare krijgen.
- Full-set compare is alleen nog een expliciete safety fallback.
- Tijdens wording-choice ziet de user geen parallelle gewone step-vraag.
- Finale step-output blijft set-based en gaat nog steeds door de bestaande server-side gates.

Stopconditie
- Stop pas na implementatie, testaanpassingen en verificatie.
- Rapporteer expliciet:
  - waarom de oude code terugviel
  - hoe anchorless grouping nu werkt
  - hoe de render exclusiviteit van wording-choice is opgelost
  - en welke fallback-conditie overblijft voor echt onzekere matching
```

### Oplossing / aanpassing (na akkoord)
Nog niet ingevuld. Wacht op expliciet akkoord voor implementatie.


