// Security headers middleware including CSP
const DEFAULT_CSP_OPTIONS = {
    allowInlineScripts: true, // Widget uses inline scripts (required for embedded widget)
    allowInlineStyles: true, // Widget uses inline styles (required for embedded widget)
    allowEval: false, // Widget does not use eval() - disabled for security (App Store compliance)
    frameAncestors: [
        "https://chat.openai.com",
        "https://*.openai.com",
        "https://chatgpt.com",
        "https://*.chatgpt.com",
    ], // Allow ChatGPT embedding
    allowedDomains: {
        fonts: ["https://fonts.googleapis.com", "https://fonts.gstatic.com"],
        scripts: [],
        styles: ["https://fonts.googleapis.com"],
        images: ["https://raw.githubusercontent.com"], // Widget uses GitHub raw image
        connects: [],
    },
};
function buildCSPHeader(options = DEFAULT_CSP_OPTIONS) {
    const directives = [];
    // Default source
    directives.push("default-src 'self'");
    // Script sources
    const scriptSrc = ["'self'"];
    if (options.allowInlineScripts) {
        scriptSrc.push("'unsafe-inline'");
    }
    if (options.allowEval) {
        scriptSrc.push("'unsafe-eval'");
    }
    if (options.allowedDomains?.scripts) {
        scriptSrc.push(...options.allowedDomains.scripts);
    }
    directives.push(`script-src ${scriptSrc.join(" ")}`);
    // Style sources
    const styleSrc = ["'self'"];
    if (options.allowInlineStyles) {
        styleSrc.push("'unsafe-inline'");
    }
    if (options.allowedDomains?.styles) {
        styleSrc.push(...options.allowedDomains.styles);
    }
    directives.push(`style-src ${styleSrc.join(" ")}`);
    // Font sources
    const fontSrc = ["'self'"];
    if (options.allowedDomains?.fonts) {
        fontSrc.push(...options.allowedDomains.fonts);
    }
    directives.push(`font-src ${fontSrc.join(" ")}`);
    // Connect sources (for fetch/XHR)
    const connectSrc = ["'self'"];
    if (options.allowedDomains?.connects) {
        connectSrc.push(...options.allowedDomains.connects);
    }
    directives.push(`connect-src ${connectSrc.join(" ")}`);
    // Image sources
    const imgSrc = ["'self'", "data:"]; // Allow data URIs for inline images
    if (options.allowedDomains?.images) {
        imgSrc.push(...options.allowedDomains.images);
    }
    directives.push(`img-src ${imgSrc.join(" ")}`);
    // Object sources (for embeds)
    directives.push("object-src 'none'");
    // Base URI
    directives.push("base-uri 'self'");
    // Form action
    directives.push("form-action 'self'");
    // Frame ancestors (allow ChatGPT embedding)
    if (options.frameAncestors && options.frameAncestors.length > 0) {
        directives.push(`frame-ancestors ${options.frameAncestors.join(" ")}`);
    }
    else {
        directives.push("frame-ancestors 'none'"); // Default: block all
    }
    return directives.join("; ");
}
/**
 * Apply security headers to response
 * Note: Headers must be set before writeHead() is called
 */
export function applySecurityHeaders(res, options) {
    const csp = buildCSPHeader(options);
    // Set CSP header (must be done before writeHead)
    if (!res.headersSent) {
        res.setHeader("Content-Security-Policy", csp);
        res.setHeader("X-Content-Type-Options", "nosniff");
        // X-Frame-Options removed: CSP frame-ancestors has precedence and is more flexible
        res.setHeader("X-XSS-Protection", "1; mode=block");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    }
}
/**
 * Security middleware factory
 */
export function createSecurityMiddleware(options) {
    return (req, res, next) => {
        applySecurityHeaders(res, options);
        next();
    };
}
