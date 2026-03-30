# Beknopte samenvatting

Als je dit veilig stap voor stap wilt doen, zou ik de volgorde omdraaien van “grootste zichtbare winst” naar “laagste implementatierisico”. Dus eerst de tokenmaatregelen met het kleinste gedragsoppervlak, daarna pure memoization, en pas als laatste de prestart-warmup voor de `Start`-klik.

Aanbevolen volgorde:

1. regressieharnas en baselinemetingen;
2. dream-classifier alleen nog aanroepen als hij echt nodig is;
3. glossary uitschakelen voor interne repair-routes;
4. `Step0BootstrapExtractor` memoizen;
5. pas daarna de `Start`-prewarm invoeren.

Zo houd je elke stap klein, controleerbaar en terugdraaibaar.

## Gebruik van dit plan

- Geef per fase alleen de instructie van de fase waar op dat moment aan gewerkt wordt.
- De agent mag alleen de fase oplossen waar hij op dat moment aan werkt.
- Laat de agent per fase:
  - tests draaien;
  - een korte diff-samenvatting geven;
  - expliciet aangeven of het veilig is om naar de volgende fase te gaan.
- Ga pas naar de volgende fase als:
  - de code compileert;
  - de relevante tests groen zijn;
  - er geen onverwachte UX-wijziging zichtbaar is.

## Harde randvoorwaarden voor alle fases

- De applicatie moet 100% meertalig blijven.
- Er mogen geen user-facing teksten hardcoded in code worden geplaatst.
- Nieuwe of gewijzigde user-facing teksten moeten altijd via de bestaande i18n-runtime, catalogi en vertaalstroom lopen.
- Er mag geen workaround, quick fix, tijdelijke bypass of “voor nu even” oplossing worden geïntroduceerd.
- Elke wijziging moet structureel, logisch uitlegbaar en veilig terug te leiden zijn naar bestaand architectuurgedrag.
- Als een fase deze randvoorwaarden niet zuiver kan respecteren, moet de agent stoppen en dat expliciet melden.

## Fase 1

## Doel

Eerst regressierisico verkleinen voordat er optimalisaties komen. In deze fase nog geen functionele optimalisatie, alleen vangrails en meetpunten.

## Waarom eerst dit

- Dit verlaagt het risico van alle volgende fases.
- Vooral de dream-flow en de `step_0`-startflow hebben meerdere vertakkingen.
- Zonder baseline kun je achteraf niet hard bewijzen dat gedrag gelijk is gebleven.

## Exacte instructie voor Codex

```text
Je mag alleen fase 1 oplossen. Voer nog geen optimalisaties uit.

Doel:
- voeg minimale regressievangrails toe rond de drie paden die we later aanpassen:
  1. dream-flow rond AcceptedOutputUserTurn-classificatie en force-refine;
  2. glossary-aan/uit voor interne repair-routes;
  3. start_prestart / step0 bootstrap pad.

Niet onderhandelbare randvoorwaarden:
- respecteer dat de applicatie 100% meertalig is;
- plaats geen user-facing teksten in code;
- gebruik geen workaround, quick fix of tijdelijke bypass;
- als testbaarheid alleen haalbaar lijkt via hardcoded teksten of tijdelijke gedragspaden: stop en rapporteer dat.

Wat ik wil:
- inspecteer bestaande tests en voeg alleen gerichte tests toe waar dekking ontbreekt;
- voeg waar nuttig kleine, lokale hulpfuncties toe om gedrag testbaar te maken;
- verander nog geen runtimegedrag behalve wat nodig is om tests mogelijk te maken;
- als er al testbestanden bestaan voor de relevante modules, breid die uit in plaats van nieuwe willekeurige suites te maken.

Concrete deliverables:
- tests die bewijzen dat:
  - in de dream-flow een bestaande kandidaat niet onnodig gerepareerd hoeft te worden;
  - BigWhy glossary-uitschakeling voor __SHORTEN_BIGWHY__ behouden blijft;
  - Step0 bootstrap alleen afhangt van FIRST_USER_MESSAGE en LANGUAGE;
  - start_prestart bestaand snapshot mag hergebruiken.
- korte notitie welke tests ontbreken en waarom, als iets echt niet praktisch testbaar is.

Werkwijze:
- lees eerst de relevante bestanden;
- maak daarna alleen de minimale test- en refactorwijzigingen;
- draai relevante tests of typecheck;
- stop daarna.

Rapporteer terug:
- welke tests je hebt toegevoegd of aangepast;
- welke commando’s je hebt gedraaid;
- of fase 2 veilig kan starten.
```

## Stopcriterium

- Relevante tests bestaan.
- Geen functionele optimalisatie is al “stiekem” meegekomen.

## Fase 2

## Doel

De veiligste directe tokenwinst doorvoeren: `AcceptedOutputUserTurnClassifier` in de dream-flow alleen nog aanroepen als de specialist nog geen bruikbare kandidaat heeft.

## Waarom deze fase nu

- Klein codeoppervlak.
- Geen nieuw cachegedrag.
- Geen UI-wijziging.
- Grootste directe tokenwinst per kleine wijziging.

## Exacte instructie voor Codex

```text
Je mag alleen fase 2 oplossen.

Doel:
- optimaliseer de dream-flow zodat classifyAcceptedOutputUserTurn alleen nog wordt aangeroepen wanneer dat semantisch echt nodig is.

Harde eisen:
- respecteer dat de applicatie 100% meertalig is;
- plaats geen user-facing teksten in code;
- gebruik geen workaround, quick fix of tijdelijke bypass;
- behoud exact hetzelfde gedrag wanneer candidateMissing === true;
- verander geen andere dream-logica;
- verander geen promptteksten;
- verander geen modelrouting;
- gebruik de bestaande tests uit fase 1 en voeg alleen aan als nodig.

Implementatierichting:
- in run_step_pipeline.ts, in het dream-blok:
  - bepaal eerst isOfftopic;
  - bepaal eerst isMetaFallback;
  - bepaal eerst candidateMissing;
  - roep classifyAcceptedOutputUserTurn alleen aan als !isOfftopic && !isMetaFallback && candidateMissing;
  - houd hasContributingInput in alle andere gevallen deterministisch false.

Belangrijk:
- als de classifier niet meer wordt aangeroepen, mag er geen ander gedrag veranderen;
- laat bestaande repair-flow met dreamForceRefineRoutePrefix intact;
- wijzig geen logging behalve als een kleine extra debugregel echt helpt.

Verificatie:
- draai relevante tests;
- voeg 1 gerichte test toe die bewijst dat de classifier niet nodig is als al een geldige kandidaat aanwezig is.

Stop na deze fase en rapporteer:
- welke code is aangepast;
- welke tests bewijzen dat gedrag gelijk bleef;
- welke tokencall nu vermeden wordt.
```

## Stopcriterium

- Dream-flow werkt nog hetzelfde.
- Eén onnodige classifier-call is structureel verwijderd.

## Fase 3

## Doel

Glossary uitschakelen voor interne repair-routes, analoog aan de bestaande `__SHORTEN_BIGWHY__`-uitzondering.

## Waarom deze fase nu

- Nog steeds laag risico.
- Geen gedragscache.
- Alleen promptgrootte omlaag op routes die niet open user-facing zijn.

## Exacte instructie voor Codex

```text
Je mag alleen fase 3 oplossen.

Doel:
- schakel de glossary uit voor interne repair-routes, op dezelfde manier als nu al gebeurt voor __SHORTEN_BIGWHY__.

Harde eisen:
- respecteer dat de applicatie 100% meertalig is;
- plaats geen user-facing teksten in code;
- gebruik geen workaround, quick fix of tijdelijke bypass;
- verander geen user-facing promptinhoud buiten includeGlossary true/false;
- houd de bestaande BigWhy-uitzondering intact;
- gebruik één centrale helper in specialist_dispatch.ts in plaats van losse conditionals te verspreiden.

Ik wil dat je:
- een helper toevoegt, bijvoorbeeld shouldIncludeGlossaryForInternalRoute(specialist, userMessage);
- die helper false laat teruggeven voor:
  - __SHORTEN_BIGWHY__
  - __ROUTE__DREAM_FORCE_REFINE__
  - __ROUTE__DREAM_EXPLAINER_MULTI_REWRITE_REPAIR__
  - __ROUTE__DREAM_EXPLAINER_OVERLAP_REPAIR__
  - __ROUTE__DREAM_EXPLAINER_CLUSTER_THEME_REPAIR__
  - __ROUTE__STRATEGY_CONSOLIDATE__
- die helper vervolgens gebruikt voor de relevante specialisten in specialist_dispatch.ts.

Belangrijk:
- verander geen schema’s;
- verander geen repair-inputs;
- verander geen route-prefixes;
- pas alleen includeGlossary-beslissingen aan.

Verificatie:
- voeg tests toe of breid tests uit zodat:
  - BigWhy bij __SHORTEN_BIGWHY__ glossary uit houdt;
  - DreamExplainer repair-routes glossary uit krijgen;
  - gewone DreamExplainer-calls glossary aan houden;
  - Strategy consolidate glossary uit krijgt maar normale strategy-calls niet.

Stop na deze fase en rapporteer:
- welke routes nu glossary-vrij zijn;
- welke tests dat bewijzen;
- of fase 4 veilig kan starten.
```

## Stopcriterium

- Alleen interne repair-routes zijn aangepast.
- Reguliere specialist-calls zijn ongemoeid gebleven.

## Fase 4

## Doel

`Step0BootstrapExtractor` memoizen op exacte input `(FIRST_USER_MESSAGE, LANGUAGE)`.

## Waarom deze fase nu

- Pure memoization is veilig als de key exact is.
- Deze fase raakt geen UI.
- Goede voorbereiding op fase 5, omdat de start-prewarm hier straks meteen van profiteert.

## Exacte instructie voor Codex

```text
Je mag alleen fase 4 oplossen.

Doel:
- voeg een kleine, veilige memoizationlaag toe voor Step0BootstrapExtractor op basis van exact dezelfde input waarop de specialist nu al draait.

Harde eisen:
- respecteer dat de applicatie 100% meertalig is;
- plaats geen user-facing teksten in code;
- gebruik geen workaround, quick fix of tijdelijke bypass;
- cache-key mag alleen afhangen van:
  - FIRST_USER_MESSAGE.trim()
  - LANGUAGE.trim().toLowerCase()
- cache moet zowel recognized=true als recognized=false resultaten bewaren;
- gebruik een kleine LRU of TTL-oplossing;
- verander niets aan de inhoud van de specialist-call zelf;
- als er geen cache-hit is, moet het oude gedrag exact blijven bestaan.

Implementatierichting:
- plaats de cache op serverniveau, dicht bij het step0 bootstrap pad;
- check de cache vóór deps.callSpecialistStrictSafe(...) in het start_prestart bootstrapgedeelte;
- schrijf een kleine helper voor normalisatie en cache-key-opbouw;
- houd de cache compact en makkelijk verwijderbaar.

Verificatie:
- test dat identieke input twee keer hetzelfde resultaat teruggeeft;
- test dat taalverschil een andere cache-key oplevert;
- test dat recognized=false ook gecachet wordt;
- test dat bij cache-miss nog steeds de bestaande specialist-route loopt.

Rapporteer terug:
- waar de cache leeft;
- hoe de key is opgebouwd;
- welke tests dit afdekken;
- of fase 5 veilig kan starten.
```

## Stopcriterium

- Exacte input geeft cache-hit.
- Afwijkende input geeft cache-miss.
- Geen UI- of flowwijziging.

## Fase 5

## Doel

De grootste UX-winst veilig uitrollen: prestart-warmup voor de `Start`-klik.

## Waarom deze fase als laatste

- Dit is de enige fase die zowel client als server tegelijk raakt.
- Hier zit het meeste UX-oppervlak.
- Alle voorbereidende risicoreductie uit de eerdere fases is dan al aanwezig.

## Exacte instructie voor Codex

```text
Je mag alleen fase 5 oplossen.

Doel:
- haal Step0BootstrapExtractor uit het Start-klikpad door een aparte prestart-warmup toe te voegen.

Harde eisen:
- respecteer dat de applicatie 100% meertalig is;
- plaats geen user-facing teksten in code;
- gebruik geen workaround, quick fix of tijdelijke bypass;
- gebruik NIET ACTION_BOOTSTRAP_POLL voor deze warmup;
- verander het compare-pick pad niet;
- verander presentation-generate niet;
- warmup mag started niet op true zetten;
- warmup mag geen zichtbare stapadvance veroorzaken;
- Start moet bestaand snapshot blijven hergebruiken als het al beschikbaar is.

Functionele bedoeling:
- terwijl de gebruiker nog in step_0 zit en started !== true:
  - als er non-empty input is;
  - en de genormaliseerde input is gewijzigd;
  - voer dan debounced een prestart-warmup uit;
- die warmup moet server-side alleen:
  - initial_user_message vastleggen;
  - maybeHydrateBootstrapFromStep0Specialist(false) uitvoeren;
  - ensureStartState(...) uitvoeren;
  - de bestaande prestart-gate response teruggeven.

Implementatierichting:
- voeg client-side een debounce toe op inputveranderingen in de widget;
- zorg dat dezelfde tekst niet opnieuw wordt voorgewarmd als de hash gelijk is;
- laat de warmup een aparte, expliciete route of action gebruiken zodat hij niet verward wordt met ACTION_BOOTSTRAP_POLL;
- gebruik in de Start-flow daarna de al opgebouwde snapshot.

Belangrijk:
- Start stuurt nu zelf geen vrije tekst mee; hou daar rekening mee;
- de warmup moet dus vóór de klik de benodigde state klaarzetten;
- als de warmup niet beschikbaar is of faalt, moet ACTION_START nog steeds het bestaande fallbackpad volgen.
- als er voor deze warmup nieuwe user-facing status, foutmelding of hint nodig lijkt, gebruik dan uitsluitend de bestaande meertalige infrastructuur; voeg niets hardcoded toe in componenten of servercode.

Verificatie:
- test of simuleer:
  - geen input -> geen warmup;
  - nieuwe input -> precies één warmup per hash;
  - identieke input -> geen tweede warmup;
  - warmup gevolgd door Start -> geen extra bootstrap-specialist nodig;
  - warmup-failure -> Start blijft werken via bestaand pad.

Stop na deze fase en rapporteer:
- welk nieuwe warmupmechanisme je hebt gekozen;
- hoe je dubbele warmups voorkomt;
- welke test of logging bewijst dat Start nu een voorbereid snapshot kan hergebruiken.
```

## Stopcriterium

- `Start` blijft functioneel correct.
- Prestart-warmup is debounced en idempotent op input-hash.
- Fallback zonder warmup blijft bestaan.

## Fase 6

## Doel

Afronden, opschonen en opnieuw meten.

## Exacte instructie voor Codex

```text
Je mag alleen fase 6 oplossen.

Doel:
- rond de eerdere fases af zonder nieuwe optimalisaties toe te voegen.

Wat ik wil:
- respecteer dat de applicatie 100% meertalig is;
- plaats geen user-facing teksten in code;
- gebruik geen workaround, quick fix of tijdelijke bypass;
- verwijder tijdelijke debugregels die niet nodig zijn;
- controleer of naming en helpers consistent zijn;
- draai de relevante testset en typecheck;
- maak een korte eindnotitie in markdown met:
  - welke fases zijn uitgevoerd;
  - welke metrics of call-reducties nu aantoonbaar zijn;
  - welke rest-risico’s nog openstaan.

Rapporteer terug:
- uitgevoerde commando’s;
- eindstatus van tests;
- eventuele open punten die nog bewust niet zijn aangepakt.
```

## Aanbevolen beslisregel tussen fases

- Ga door naar de volgende fase alleen als de vorige fase:
  - klein is gebleven;
  - testbaar is bewezen;
  - geen onverwacht UI-gedrag heeft geïntroduceerd.

## Mijn praktische advies

Als je het echt veilig wilt houden, zou ik Codex niet meteen fase 5 laten doen. Eerst fase 1 t/m 4 afronden. Daarmee pak je al de meeste veilige tokenwinst en leg je de technische basis voor de enige UX-optimalisatie met groot effect.
