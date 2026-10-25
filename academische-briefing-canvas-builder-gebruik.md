# Academische briefing: gebruik en uitval in de Business Strategy Canvas Builder

Datum briefing: 5 september 2026  
Status: werkdocument voor een academisch auteur; geen afgerond onderzoeksartikel

## 1. Doel van deze briefing

Deze briefing ordent de beschikbare gegevens over het gebruik van de Business Strategy Canvas Builder, de uitval tijdens het proces en het verschil tussen zelfstandig appgebruik en een betaalde, begeleide strategiesessie. Het document scheidt controleerbare feiten nadrukkelijk van berekeningen, praktijkwaarnemingen, hypotheses en onbewezen aannames.

De centrale observatie is dat veel mensen een gratis en relatief korte digitale strategieroute niet voltooien, terwijl ondernemers bereid zijn EUR 3.000 te betalen voor een begeleide sessie van vier tot acht uur. Dat contrast roept de vraag op welke rol motivatie, commitment, begeleiding, ervaren relevantie en cognitieve of emotionele weerstand spelen.

## 2. Bewijslabels

De volgende labels worden in deze briefing gebruikt:

- **AWS-bewezen:** rechtstreeks vastgesteld in de bewaarde CloudWatch-telemetrie.
- **Technisch bewezen:** vastgesteld in de broncode die de meetgebeurtenissen produceert of verwerkt.
- **Aangeleverd onderzoeksgegeven:** door Ben Steenstra gerapporteerd als uitkomst van eigen onderzoek of enquête, maar in deze briefing niet onafhankelijk gecontroleerd aan de hand van de ruwe onderzoeksdata.
- **Praktijkwaarneming:** terugkerende professionele ervaring van Ben Steenstra; relevant kwalitatief bewijs, maar geen gecontroleerde causale meting.
- **Anekdotisch bewijs:** individuele casus of testimonial; geschikt ter illustratie, niet voor generalisatie.
- **Berekening:** mathematisch afgeleid uit opgegeven gegevens; alleen geldig wanneer de onderliggende populaties en definities overeenkomen.
- **Hypothese:** plausibele verklaring die nader onderzoek vereist.
- **Niet bewezen:** conclusie die met de huidige gegevens niet verantwoord kan worden getrokken.

## 3. Product en context

**Aangeleverd feit:** De Business Strategy Canvas Builder is een gratis app binnen ChatGPT waarmee een gebruiker zelfstandig een strategisch proces doorloopt.

**Aangeleverd feit:** Een zelfstandige sessie in de app duurt volgens de beschikbare praktijkinformatie doorgaans ongeveer 10 tot 60 minuten.

**Aangeleverd feit:** De begeleide variant duurt ongeveer vier tot acht uur en kost EUR 3.000.

**Technisch bewezen:** De digitale route bestaat uit een vaste volgorde. De stappen kunnen binnen de bedoelde gebruikersflow niet willekeurig worden overgeslagen:

1. Validation & Business Name: naam en soort onderneming
2. Dream
3. Purpose
4. Big Why
5. Role
6. Entity
7. Strategy
8. Target Group
9. Products & Services
10. Rules of the Game
11. Presentation

## 4. Beschikbaarheid en meetperiode

**AWS-bewezen:** De gebruikte AWS App Runner-service is aangemaakt op 24 januari 2026 om 14:10 Nederlandse tijd.

**AWS-bewezen:** Het eerste bewaarde serverbericht waaruit blijkt dat de MCP-server draaide, dateert van 25 januari 2026 om 10:09 Nederlandse tijd.

**AWS-bewezen:** De eerste gestructureerde gebruiksmeting in CloudWatch dateert van 11 maart 2026 om 19:11:11 Nederlandse tijd. Dit betrof onder andere `app_usage_session_started` en `app_usage_step_viewed`, met analyseschema `bsc_app_usage_v1`.

**Beperking:** AWS bewijst wanneer de backend draaide en wanneer de telemetrie begon. AWS bewijst niet op welke datum de app door OpenAI publiek beschikbaar is gemaakt.

## 5. AWS-resultaten van 1 juni tot en met 1 augustus 2026

De selectie loopt van 1 juni 2026 00:00 tot 2 augustus 2026 00:00 in de tijdzone Europe/Amsterdam. Daarmee is 1 augustus volledig inbegrepen.

### 5.1 Definities

**Technisch bewezen:** Een bereikte stap wordt gemeten met `app_usage_step_viewed`. Een gemaakte presentatie wordt apart gemeten met `app_usage_presentation_generated`.

**AWS-bewezen:** In de gekozen periode registreerde AWS 2.439 unieke sessie-ID's met een startgebeurtenis.

**AWS-bewezen:** Van deze sessies registreerden 2.414 in dezelfde periode ook een weergave van stap 1. Voor een zuivere funnel vanaf het begin van het canvas worden deze 2.414 sessies als uitgangspunt gebruikt.

**Belangrijke beperking:** Een sessie-ID is niet hetzelfde als een unieke persoon. Dezelfde persoon kan meer dan één sessie starten en de telemetrie bevat geen gevalideerde persoonsidentiteit.

### 5.2 Funnel vanaf stap 1

| Bereikt onderdeel | Unieke sessies | Percentage van stap 1 | Doorgang vanaf vorige stap |
|---|---:|---:|---:|
| Stap 1 - Naam en soort bedrijf | 2.414 | 100,0% | 100,0% |
| Stap 2 - Dream | 583 | 24,2% | 24,2% |
| Stap 3 - Purpose | 130 | 5,4% | 22,3% |
| Stap 4 - Big Why | 80 | 3,3% | 61,5% |
| Stap 5 - Role | 65 | 2,7% | 81,3% |
| Stap 6 - Entity | 62 | 2,6% | 95,4% |
| Stap 7 - Strategy | 58 | 2,4% | 93,5% |
| Stap 8 - Target Group | 44 | 1,8% | 75,9% |
| Stap 9 - Products & Services | 42 | 1,7% | 95,5% |
| Stap 10 - Rules of the Game | 42 | 1,7% | 100,0% |
| Stap 11 - Presentation bereikt | 34 | 1,4% | 81,0% |
| Presentatie daadwerkelijk gegenereerd | 34 | 1,4% | 100,0% van presentatie bereikt |

**Correcte interpretatie:** 5,4% van alle sessies die stap 1 bereikten, bereikte Purpose. Van de sessies die Dream bereikten, bereikte 22,3% vervolgens Purpose. De uitspraak dat slechts 5,4% "na Dream doorgaat" gebruikt daarom de verkeerde noemer.

**Beperking:** "Bereikt" betekent dat het scherm van een stap is getoond. Voor deze historische periode is dit niet voor iedere stap hetzelfde als bewijs dat de gebruiker de stap definitief heeft afgerond of de uiteindelijke formulering heeft bevestigd.

## 6. Verschil tussen beginnende en bestaande ondernemingen

**Aangeleverd onderzoeksgegeven:** Ongeveer 40% van de onderzochte gebruikers gaf aan dat de onderneming nog niet bestond of beginnend was. Ongeveer 60% betrof een bestaande onderneming.

**Aangeleverd onderzoeksgegeven:** Van de gebruikers die Purpose bereikten, bestond circa 72% uit beginnende ondernemingen en circa 28% uit bestaande ondernemingen.

### 6.1 Voorwaardelijke berekening

Wanneer beide percentages betrekking hebben op exact dezelfde populatie, dezelfde periode en volledige statusgegevens, volgt bij benadering:

- Beginnende ondernemingen die Purpose bereiken: 72% van 130, ongeveer 94 sessies.
- Bestaande ondernemingen die Purpose bereiken: 28% van 130, ongeveer 36 sessies.
- Geschatte Purpose-bereik onder beginners: 94 van circa 966, ongeveer 9,7%.
- Geschatte Purpose-bereik onder bestaande ondernemingen: 36 van circa 1.448, ongeveer 2,5%.
- Beginnende ondernemingen zouden Purpose daarmee relatief ongeveer 3,9 keer zo vaak bereiken als bestaande ondernemingen.

**Status van deze berekening:** voorwaardelijk en nog niet onafhankelijk bewezen. Voor publicatie moeten de ruwe statusgegevens, ontbrekende waarden, populatieafbakening en koppeling met de funnel worden gecontroleerd.

## 7. Kwalitatieve informatie

**Praktijkwaarneming:** Bestaande ondernemers leggen volgens Ben Steenstra vaak geen direct verband tussen tijdelijk falen, verlies aan motivatie of richting en het vervagen van hun oorspronkelijke ideaal of Purpose.

**Praktijkwaarneming:** Veel bestaande ondernemers hadden bij de start van hun onderneming wel een ideaal, maar raakten dit in de loop van de tijd kwijt. Zij melden zich voor begeleiding omdat zij richting, samenhang of motivatie missen.

**Aangeleverd enquêtegegeven:** Deelnemers vinden het proces lastig. Volgens de duiding van Ben Steenstra ligt de kern niet uitsluitend bij het begrijpen van de vragen, maar bij het behouden van motivatie en discipline om het strategische denkwerk te voltooien.

**Anekdotisch bewijs:** Ondernemers onder wie Steven Bakker van New Black en Pim Schoonenberg van Fresh 'n Rebel zouden naar eigen zeggen veel baat hebben gehad bij de begeleide aanpak en onderdelen van de strategie nog steeds implementeren.

**Publicatievoorwaarde:** Namen, bedrijfsnamen, ervaringen en eventuele citaten mogen in een artikel alleen als casusbewijs worden gebruikt wanneer de betreffende personen toestemming hebben gegeven en de oorspronkelijke uitspraken controleerbaar zijn vastgelegd.

## 8. Wat de gegevens wel ondersteunen

### 8.1 Sterk ondersteunde conclusies

1. De grootste numerieke uitval vindt vroeg in de digitale route plaats: van stap 1 naar Dream en vervolgens van Dream naar Purpose.
2. Slechts 1,4% van de bij stap 1 begonnen sessies bereikt en genereert in dezelfde meetperiode een presentatie.
3. De lengte van een activiteit is niet voldoende om voltooiing te verklaren. Een gratis route van 10 tot 60 minuten kan een lagere voltooiing hebben dan een veel langere betaalde interventie.
4. Toegang tot vragen of een methode is niet hetzelfde product als een begeleid veranderproces. De begeleide sessie bevat in ieder geval een afspraak, gereserveerde tijd en menselijke begeleiding; de zelfstandige app niet.

### 8.2 Redelijk onderbouwde interpretaties

1. **Commitmentverschil:** betaling, een afspraak en gereserveerde tijd kunnen de bereidheid vergroten om ongemak en cognitieve inspanning te verdragen.
2. **Procesbewaking:** begeleiding kan voorkomen dat twijfel, weerstand of dagelijkse druk direct tot stoppen leidt.
3. **Purpose-blinde vlek:** bestaande ondernemers kunnen Purpose als bekend, abstract of niet urgent ervaren, terwijl het verlies van verbinding met het oorspronkelijke ideaal juist mede aan hun probleem ten grondslag kan liggen.
4. **Verschil in behoefteherkenning:** beginners staan mogelijk explicieter open voor identiteits- en bestaansvragen; bestaande ondernemers zoeken eerder een antwoord op een zichtbaar commercieel, operationeel of motivatieprobleem.
5. **Selectie-effect van gratis toegang:** een gratis app trekt naast serieuze gebruikers ook nieuwsgierige bezoekers met een lage initiële intentie. Een betaalde sessie selecteert vooraf op bereidheid om tijd, geld en aandacht te investeren.
6. **Cognitieve en emotionele belasting:** Dream kan inspirerend en vrij voelen, terwijl Purpose vraagt om afbakening, betekenis en verantwoordelijkheid. Dat kan de overgang zwaarder maken dan de benodigde tijd doet vermoeden.

## 9. Wat de gegevens niet bewijzen

De volgende uitspraken zijn met de huidige gegevens niet gerechtvaardigd:

- "Purpose is voor ondernemers niet belangrijk."
- "Bestaande ondernemers hebben geen Purpose nodig."
- "Mensen haken uitsluitend af door gebrek aan discipline."
- "De begeleiding is bewezen de oorzaak van het succes van betaalde deelnemers."
- "De prijs van EUR 3.000 veroorzaakt voltooiing."
- "Iedere appstarter is een afzonderlijk persoon of ondernemer."
- "Iedere getoonde stap is definitief afgerond."
- "De genoemde klantvoorbeelden zijn representatief voor alle deelnemers."
- "De app is mislukt omdat weinig sessies de presentatie bereiken."

## 10. Alternatieve verklaringen die onderzocht moeten worden

Een academisch artikel moet de voorkeursverklaring vergelijken met alternatieven:

1. De formulering of positionering van Purpose sluit onvoldoende aan bij bestaande ondernemers.
2. De overgang tussen Dream en Purpose bevat technische of interactionele frictie.
3. Gebruikers ervaren na Dream al voldoende waarde en stoppen bewust.
4. Gebruikers willen later doorgaan, maar hervatten de sessie niet of doen dat onder een nieuwe sessie-ID.
5. ChatGPT-gebruikers verwachten een kort antwoord en geen zelfstandig strategisch traject.
6. De gratis gebruikerspopulatie verschilt fundamenteel van de populatie die EUR 3.000 betaalt.
7. Taal, land, type onderneming, bedrijfsgrootte of eerdere coachingservaring beïnvloeden de uitval.
8. Een deel van het gemeten verkeer bestaat uit tests, herhaalde sessies of niet-serieuze verkenning.

## 11. Kansrijke centrale these voor een artikel

Een verdedigbare werkthese luidt:

> Het verschil tussen gratis digitaal strategisch advies en betaalde begeleiding ligt mogelijk minder in de beschikbaarheid van de methode dan in het vermogen van de interventie om commitment, volgehouden aandacht en betekenisvol zelfonderzoek te organiseren. Vooral bestaande ondernemers kunnen afhaken bij Purpose, niet omdat Purpose aantoonbaar onbelangrijk is, maar omdat zij de relatie tussen hun actuele problemen en een vervaagd oorspronkelijk ideaal niet vanzelf herkennen.

Deze formulering is bewust als hypothese gesteld. De funnel ondersteunt het bestaan van uitval; de praktijkwaarnemingen ondersteunen de mogelijke verklaring; causaliteit is nog niet aangetoond.

## 12. Aanbevolen onderzoeksvragen

1. Welke redenen geven bestaande en beginnende ondernemers zelf voor stoppen tussen Dream en Purpose?
2. Verandert voltooiing wanneer Purpose wordt geïntroduceerd via herkenbare bedrijfssymptomen in plaats van als abstract begrip?
3. Wat is het afzonderlijke effect van betaling, afspraak, begeleiding en groeps- of sociale verantwoording?
4. Welke verschillen bestaan tussen gebruikers die alleen starten, Dream voltooien, Purpose bereiken en een presentatie genereren?
5. Hervatten gebruikers het proces later, eventueel met een nieuwe sessie-ID?
6. In hoeverre voorspelt het opnieuw verbinden met het oorspronkelijke ideaal latere motivatie, strategische consistentie of implementatie?
7. Welke onderdelen van de begeleide sessie ervaren betalende deelnemers als doorslaggevend?

## 13. Minimale gegevens voor een academisch verantwoorde vervolgstudie

- Een stabiele, geanonimiseerde deelnemer-ID naast de technische sessie-ID.
- Eenduidige registratie van starten, bereiken, bevestigen, hervatten en voltooien.
- Ondernemingsstatus met antwoordcategorie, meetmoment en ontbrekende waarden.
- Reden van stoppen via een korte exitvraag.
- Tijd per stap en hervatting over meerdere sessies.
- Herkomst van de gebruiker en vooraf gemeten intentie.
- Vergelijking tussen onbegeleid, licht begeleid en volledig begeleid gebruik.
- Vooraf vastgelegde uitkomstmaten, zoals motivatie, strategische helderheid, implementatie en resultaten op langere termijn.
- Documentatie van steekproef, uitsluitingen, testverkeer en datakwaliteit.

## 14. Samenvattende conclusie

De beschikbare telemetrie toont een grote vroege uitval in de gratis ChatGPT-app en een zeer kleine groep die binnen de gekozen periode een presentatie genereert. De gegevens tonen tevens dat de stap naar Purpose een belangrijk selectiemoment is. Door Ben Steenstra aangeleverde segmentgegevens suggereren dat beginnende ondernemingen relatief vaker Purpose bereiken dan bestaande ondernemingen.

De combinatie van funneldata, enquête-informatie en praktijkervaring ondersteunt de hypothese dat bestaande ondernemers niet noodzakelijk minder behoefte hebben aan Purpose, maar die behoefte minder direct herkennen. Het contrast met de betaalde, langdurige sessie suggereert dat de waarde van begeleiding mogelijk vooral bestaat uit het organiseren van commitment, aandacht, volharding en betekenisgeving. Voor causale uitspraken is aanvullend, gecontroleerd onderzoek nodig.
