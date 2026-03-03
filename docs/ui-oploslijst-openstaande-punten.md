# UI Oploslijst (Openstaande Punten)

Doel: centraal document met alle issues die jij meldt, om gericht op te lossen.

## Status
- Aangemaakt op: 2026-03-03
- Eigenaar: team Business Canvas
- Werkwijze: elk nieuw punt dat jij doorgeeft wordt hier direct toegevoegd.

## Taaldekking (verplicht)
- Dit document geldt voor **alle ondersteunde talen/locales**, niet alleen NL.
- Ondersteunde set:
  - `en`
  - `nl`
  - `de`
  - `fr`
  - `es`
  - `pt-BR`
  - `hi`
  - `id`
  - `it`
  - `ja`
  - `ko`
  - `zh-Hans`
- Regel:
  - voorbeelden mogen in NL staan, maar elke fix wordt altijd voor alle bovenstaande locales gecontroleerd en doorgevoerd waar nodig.

## Openstaande Punten

### 1) Ben Steenstra foto ontbreekt in de UI
- Probleem: in de kaart wordt de afbeelding niet geladen (broken image zichtbaar).
- Impact: profielblok oogt kapot/onvolledig.
- Benodigd om op te lossen:
  - correcte en stabiele image-URL of asset-pad van de Ben Steenstra foto.
- Actie:
  - Als de oorspronkelijke link/asset niet meer bekend is, nieuwe bronlink aanleveren.
  - Na ontvangst: koppeling in UI herstellen en valideren in widget-render.

## Notities voor volgende meldingen
- Voeg hier elk nieuw issue toe met:
  - Probleem
  - Impact
  - Benodigd om op te lossen
  - Actie

### 2) Grammaticafout: "het bestaansreden" (NL) + risico op soortgelijke fouten in andere talen
- Probleem: in de UI verschijnt een grammaticaal foutieve combinatie zoals "het bestaansreden".
- Impact: onprofessionele uitstraling en lagere taalbetrouwbaarheid.
- Waarschijnlijk bron:
  - templates die een vast lidwoord combineren met een dynamisch staplabel/term (bijv. Purpose -> Bestaansreden) zonder grammaticale afstemming.
- Benodigd om op te lossen:
  - per taal: grammatica-veilige formuleringen voor alle templates waar staplabels in zinnen worden ingevoegd.
  - vermijden van vaste lidwoorden rond dynamische staptermen.
- Actie:
  - locale-templates voor section/title/offtopic/contractregels nalopen op "vast lidwoord + dynamische term".
  - vervangen door grammatica-neutrale structuren of volledig uitgeschreven locale-zinnen per stap.
  - regressiecheck in alle actieve talen op soortgelijke combinaties.

### 3) User input wordt niet taalgecorrigeerd weergegeven (typfouten blijven staan)
- Probleem: getoonde user-input bevat ongewijzigde typfouten, bijvoorbeeld:
  - Invoer: "Ik heb een droom dat ik rijk wil wordne."
  - Verwacht: "Ik heb een droom dat ik rijk wil worden."
- Impact: lagere taalkwaliteit en minder professionele UX, vooral in samenvattende/reflecterende tekstblokken.
- Benodigd om op te lossen:
  - duidelijke regel per schermtype: wanneer ruwe user-input letterlijk tonen en wanneer taalgecorrigeerde versie tonen.
  - consistente taalcorrectie-flow in alle stappen waar input wordt gereflecteerd.
- Actie:
  - inventariseren in welke renderpaden user-input letterlijk wordt geïnjecteerd.
  - bepalen of taalcorrectie vóór render moet plaatsvinden of via bestaande wording/suggestie-flow.
  - regressiecheck op meerdere stappen/talen zodat dit niet incidenteel blijft.

### 4) Verkeerde werkwoordsvorm in kopregel (bijv. "Definiëren je ...") + case/grammatica issues per taal
- Probleem: kopregel gebruikt soms de verkeerde werkwoordsvorm en/of hoofdlettergebruik, bv. "Definiëren je Bestaansreden voor Mindd of kies een optie."
- Impact: onjuiste taal in prominente CTA-koppen; risico op dezelfde fout in andere talen.
- Waarschijnlijke bron:
  - generieke template-opbouw met losse bouwstenen (`define/refine` + `{topic}` + `{company}`), waarbij geen taal-specifieke vervoeging/case wordt afgedwongen.
- Structurele oplossing (aanpak):
  - vervang compositie met losse woorden door volledige locale-zin-templates per intent:
    - `headline.define.withCompany`
    - `headline.define.futureCompany`
    - `headline.refine.withCompany`
    - `headline.refine.futureCompany`
  - in die zinnen staat per taal de correcte imperatief, woordvolgorde en casing vast.
  - gebruik staplabel in locale-vorm (bijv. `bestaansreden` in lopende zin) i.p.v. generiek `Title Case` label.
  - voeg i18n-regressietest toe die renderkoppen per locale controleert op bekende foutpatronen (infinitief waar imperatief moet, vaste lidwoorden + dynamische term, ongewenste hoofdletters).
- Actie:
  - migreren van huidige `contract.headline.*` compositie naar volledige locale-zin-templates.
  - oude compositiemodus uitfaseren in runtime rendering.
  - snapshottests op alle ondersteunde locales.

### 5) Opsommingen renderen niet als bullets (items worden samengevoegd tot één alinea)
- Probleem: tekst die als opsomming bedoeld is, verschijnt als doorlopende paragraaf zonder bullets.
- Impact: slechtere leesbaarheid en verlies van structuur/hiërarchie in advies- en voorstelteksten.
- Verwacht gedrag:
  - opsommingen blijven opsommingen (bullet list) in de UI;
  - minimaal: elk item op een eigen regel, niet samengeplakt tot één blok.
- Waarschijnlijke bron:
  - formatter/renderpad normaliseert of concateneert regels, waardoor list-structuur (`-`, `*`, genummerd of losse regels) verloren gaat.
- Structurele oplossing (aanpak):
  - model-output voor suggestieblokken standaardiseren naar expliciete lijstvorm (bijv. markdown bullets of gestructureerde array);
  - renderer list-first maken: lijstpatronen eerst detecteren en als `<ul><li>` renderen;
  - fallbackregel: als meerdere korte zinnen in een suggestieblok staan, elk item op aparte regel tonen i.p.v. samenvoegen.
- Actie:
  - audit van list-detectie in runtime formatter/renderer;
  - regressietests toevoegen voor bullets in alle ondersteunde locales;
  - handmatige check in Purpose/Big Why/Strategy schermen waar opsommingen vaak voorkomen.

### 6) Engelse kerntermen lekken in lopende tekst (Why / Big Why) i.p.v. lokale termen
- Probleem: in Nederlandse tekst verschijnen Engelse termen zoals `Why` en `Big Why` in doorlopende alinea's.
- Impact: inconsistente taalbeleving en lagere kwaliteit van lokale versie.
- Voorbeeld (NL, huidige fout):
  - "Dit is het moment waarop we het verschil maken tussen een communiceerbare 'Why' en wat ik de échte Big Why noem."
- Gewenste tekst (NL):
  - "Dit is het moment waarop we het verschil maken tussen een communiceerbare 'Waarom' en wat ik de échte Grote Waarom noem."
- Benodigd om op te lossen:
  - alle stapteksten die kernconcepten gebruiken (Dream/Purpose/Big Why/Role/etc.) volledig via locale-terminologie laten lopen;
  - geen hardcoded EN-termen meer in body copy, prompts, intros en uitlegblokken.
- Actie:
  - scan op hardcoded concepttermen in specialist-output templates en i18n-teksten;
  - vervangen door locale keys per conceptterm;
  - regressiecheck op alle talen dat concepttermen lokaal blijven in zowel headings als body.

### 7) Gemixte concepttaal in Big Why introzin (Purpose/Big Why niet gelokaliseerd)
- Probleem: zin bevat Engelse concepttermen in NL-context, bijvoorbeeld:
  - "Gebaseerd op de Droom en Purpose van Mindd, zou je Big Why als volgt kunnen klinken"
- Gewenste tekst (NL):
  - "Gebaseerd op de Droom en het bestaansrecht van Mindd, zou je Grote Waarom als volgt kunnen klinken..."
- Impact: taalmix in kernuitleg, lagere inhoudelijke consistentie van het model.
- Benodigd om op te lossen:
  - concepttermen in samengestelde introzinnen altijd uit locale concept-map halen (niet uit EN-defaults of hardcoded specialisttekst).
- Actie:
  - template voor deze introzin per locale expliciet maken;
  - `Purpose/Big Why` vervangen door lokale equivalenten in zowel headline, body als follow-up vraag;
  - controle op vergelijkbare zinnen in andere stappen/talen.

### 8) Brede concept-taalmix over meerdere stappen (niet alleen Big Why)
- Probleem: in meerdere stappen (nu ook Role) blijven Engelse/ongelokaliseerde concepttermen in de bodytekst staan, bv. `Dream`, `Purpose`, `Big Why` binnen NL-zinnen.
- Impact: structurele inconsistentie; gebruiker ziet gemixte terminologie door de hele flow.
- Observatie:
  - Dit lijkt een generiek patroon in specialist-teksten/templates, niet een incidentele losse string.
- Structurele oplossing (globaal):
  - centrale concept-terminologie per locale (één map) verplicht gebruiken in alle stappen;
  - specialist-output en render-templates mogen conceptnamen alleen via die locale map invullen;
  - verbieden van ruwe EN-concepttermen in niet-EN locale renderpaden.
- Actie:
  - volledige scan over alle stappen/specialists op `Dream|Purpose|Big Why|Role|Entity|Strategy|Target Group|Products and Services|Rules of the Game` in niet-EN output;
  - vervangen door locale conceptkeys;
  - regressiesuite toevoegen met per stap scenario's voor alle ondersteunde locales die op EN-termen falen.

### 9) Verkeerde werkwoordsvorm in refine-kop (Role)
- Probleem: kopregel toont "Verfijnen je Rol voor Mindd of kies een optie."
- Correct (NL): "Verfijn je Rol voor Mindd of kies een optie."
- Impact: foutieve grammatica in prominente koptekst.
- Relatie met eerder issue:
  - valt onder het bredere probleem van infinitief i.p.v. imperatief in samengestelde kopregels.
- Actie:
  - corrigeren via locale-specifieke volledige kopzin-template (imperatief), niet via losse compositieblokken.

### 10) Suggestie-output mist vaste voorstelzin (Entity) en valt terug op losse term
- Probleem: na uitleg verschijnt alleen een losse term (`creatief adviesbureau`) i.p.v. een volledige suggestiezin.
- Gewenst patroon (alle talen):
  - eerst de inhoudelijke toelichting;
  - daarna een expliciete voorstelzin in lokale taal, bv. NL:
    - "Wat denk je van de formulering: Een creatief adviesbureau"
- Impact: output voelt onaf en minder begeleidend; gebruiker mist duidelijke voorstel-CTA.
- Benodigd om op te lossen:
  - vaste locale template voor suggestie-intro + voorstelregel in alle relevante specialist-flows (minimaal Entity, mogelijk ook Purpose/Role/Strategy waar suggesties voorkomen).
- Actie:
  - contract-/template-aanpassing zodat suggesties altijd in complete zin worden gepresenteerd;
  - locale keys toevoegen voor de voorstelzin per taal;
  - regressietest: geen losse suggestieterm zonder voorafgaande locale voorstelzin.
