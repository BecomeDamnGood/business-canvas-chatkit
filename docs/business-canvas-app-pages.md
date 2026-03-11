# Business Canvas App Pages

Last updated: March 11, 2026

This document contains ready-to-paste page content for two dedicated public pages for the Business Canvas app:

1. Privacy Policy
2. Terms of Use

Entity details used below:

- Legal/business name: Mindd
- Operating name: Ben Steenstra
- Website: https://www.bensteenstra.com
- Contact emails: ben@mindd.eu, ben@bensteenstra.com
- Address: Oosteinderweg 129, 1432 AH Aalsmeer, The Netherlands

The content below is based on the current app behavior in the codebase:

- the app processes business and strategy input submitted by the user
- the app sends user input to the OpenAI API to generate outputs
- the app can generate PPTX, PDF, and PNG presentation assets
- generated presentation assets are cleaned up after approximately 24 hours
- IP address and technical request metadata are processed for rate limiting and security logging
- the app emits privacy-minimized usage analytics events for session start, step views, wording-choice interactions, and presentation generation success or failure
- disk-based session token logs are disabled by default in production unless explicitly enabled

## Page 1: Privacy Policy

Suggested URL:

`https://www.bensteenstra.com/business-canvas-app-privacy`

Suggested page title:

`Business Canvas App Privacy Policy`

Suggested meta description:

`Privacy Policy for the Business Canvas app by Mindd / Ben Steenstra, including what information is processed, why it is processed, and how to contact us.`

### Ready-to-paste content

```md
Business Canvas App Privacy Policy

Last updated: March 11, 2026

This Privacy Policy explains how the Business Canvas app by Mindd, operating under the name Ben Steenstra, processes information when you use the app through supported AI clients and integrations, including ChatGPT and Claude.

1. Who we are

Mindd
Operating name: Ben Steenstra
Website: https://www.bensteenstra.com
Email: ben@mindd.eu
Alternative email: ben@bensteenstra.com
Address: Oosteinderweg 129, 1432 AH Aalsmeer, The Netherlands

2. What the app does

The Business Canvas app helps users build a business strategy canvas step by step. Based on user input, the app generates structured business and strategy output and can generate presentation files.

3. Information we process

When you use the app, we may process:

- the company name or working business name you provide
- the type of business or venture you describe
- the information you submit in the canvas steps, including content relating to dream, purpose, big why, role, entity, strategy, target group, products and services, rules of the game, and presentation content
- generated outputs derived from that input, including summaries and presentation materials
- technical request data such as IP address, request identifiers, and request metadata needed for security, rate limiting, and troubleshooting
- privacy-minimized usage analytics events, including pseudonymous session identifiers, step identifiers, session turn index, UI view mode/variant, wording-choice shown/selected state, and presentation generation success/failure metadata

4. Why we process this information

We process this information to:

- operate the app and return the requested business canvas output
- generate, refine, and present strategy content based on your input
- generate presentation assets such as PPTX, PDF, and preview images
- protect the service against abuse, enforce rate limits, and troubleshoot errors
- understand usage at a technical flow level, such as which steps are shown, when wording-choice interactions occur, and whether presentation generation succeeds or fails

5. Use of AI client platforms and OpenAI services

The app may be accessed through supported AI client platforms and integrations, including ChatGPT and Claude.

The app itself uses OpenAI API services to process user input and generate output. Information you submit through the app may therefore be sent to OpenAI for that purpose.

If you access the app through a third-party AI client platform, that platform may also process your information in accordance with its own terms and privacy policy.

6. Hosting and infrastructure

The app is hosted on AWS infrastructure. Technical metadata may be processed by our hosting and operational infrastructure as part of normal service delivery, logging, and security.

7. Temporary presentation files

When presentation output is generated, the app may temporarily generate presentation assets such as PPTX, PDF, and PNG files on the server.

Based on the current implementation, old generated presentation files are cleaned up after approximately 24 hours.

8. Logging, security, and usage analytics

The service may process technical logging data needed for service security, operations, and limited app usage analytics, including:

- IP-based rate limiting signals
- request and trace identifiers
- operational error and diagnostics metadata
- privacy-minimized app usage events such as session start, step view, wording-choice shown/selected, and presentation generation success/failure

Disk-based session token logs are disabled by default in production unless they are explicitly enabled for debugging purposes.

These usage analytics events are designed to avoid storing the free-text business canvas content itself as part of the analytics event payload.

9. Data minimization

The app is designed so that rich widget payloads remain app-side, while model-visible responses are kept minimal for the conversational layer where possible.

The app usage analytics described above are also designed to use technical event metadata rather than the free-text content of your business canvas answers where possible.

10. Your choices

Please do not submit information you do not want processed through the app.

If you have a privacy question or want to request deletion of information that may have been processed by the app, contact:

ben@mindd.eu
or
ben@bensteenstra.com

11. Changes to this Privacy Policy

We may update this Privacy Policy from time to time. The latest version will be published on this page with the updated effective date.
```

## Page 2: Terms of Use

Suggested URL:

`https://www.bensteenstra.com/business-canvas-app-terms`

Suggested page title:

`Business Canvas App Terms of Use`

Suggested meta description:

`Terms of Use for the Business Canvas app by Mindd / Ben Steenstra, including acceptable use, user responsibility, and contact details.`

### Ready-to-paste content

```md
Business Canvas App Terms of Use

Last updated: March 11, 2026

These Terms of Use govern your use of the Business Canvas app made available by Mindd, operating under the name Ben Steenstra, through supported AI clients and integrations, including ChatGPT and Claude.

1. Operator details

Mindd
Operating name: Ben Steenstra
Website: https://www.bensteenstra.com
Email: ben@mindd.eu
Alternative email: ben@bensteenstra.com
Address: Oosteinderweg 129, 1432 AH Aalsmeer, The Netherlands

2. What the app provides

The Business Canvas app helps users create a structured business canvas and related presentation materials based on user-provided input.

3. User responsibility

You are responsible for the information you submit to the app and for reviewing any generated output before relying on it.

You should make your own judgment before using outputs for strategic, business, legal, financial, commercial, or operational decisions.

4. No guarantee of accuracy or fitness

The app provides generated content and structured strategy assistance on a best-effort basis.

We do not guarantee that outputs are complete, accurate, error-free, legally compliant, or suitable for any particular purpose.

5. Acceptable use

You may not use the app to:

- violate applicable law
- infringe the rights of others
- abuse, overload, probe, or interfere with the service or its infrastructure
- attempt to bypass security, rate limits, or access restrictions

6. Availability and changes

We may update, suspend, restrict, or discontinue the app or parts of it at any time.

Features, outputs, and availability may change over time.

We may also use privacy-minimized technical usage analytics to understand how the app flow is used and to improve service reliability.

7. Generated output

The app may generate text, summaries, and presentation materials based on the information you provide.

You remain responsible for checking whether the generated output is suitable for your intended use.

8. Intellectual property

You remain responsible for the content you submit.

Except where applicable law provides otherwise, Mindd / Ben Steenstra retains rights in the app itself, including its software, branding, service design, and supporting materials.

9. Liability

To the maximum extent permitted by applicable law, the app is provided on an "as is" and "as available" basis, without warranties of any kind.

To the maximum extent permitted by applicable law, Mindd / Ben Steenstra is not liable for indirect, incidental, special, consequential, or business losses arising from the use of the app.

10. Privacy

Use of the app is also governed by the Business Canvas App Privacy Policy:

[insert privacy page URL here]

11. Contact

Questions about these Terms may be sent to:

ben@mindd.eu
or
ben@bensteenstra.com

12. Governing law

These Terms are governed by the laws applicable in The Netherlands, unless mandatory law requires otherwise.
```

## Publishing notes

- Prefer dedicated app pages instead of only generic site-wide privacy and terms pages.
- Use public, indexable URLs if you want reviewers and users to open them easily.
- Add the final privacy URL and terms URL to the relevant app configuration(s).
- After publishing the pages, update the Terms page so section 10 links to the final privacy page URL.
