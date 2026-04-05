#!/usr/bin/env node
/**
 * Download a webpage and convert to Markdown
 * Uses @mozilla/readability for content extraction and turndown for HTML-to-MD conversion
 *
 * Version: 1.0.0
 * When updating this script, bump the version number above.
 */

const fs = require('fs').promises;
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

// Try to load optional dependencies
let Readability = null;
let TurndownService = null;
let JSDOM = null;

try {
    const { Readability: R } = require('@mozilla/readability');
    Readability = R;
} catch (e) {
    // Will be checked later
}

try {
    const Turndown = require('turndown');
    TurndownService = Turndown;
} catch (e) {
    // Will be checked later
}

try {
    const { JSDOM: J } = require('jsdom');
    JSDOM = J;
} catch (e) {
    // Will be checked later
}

const VERSION = '1.0.0';

function showHelp() {
    console.log(`
Usage: download-markdown.cjs [OPTIONS] <url> [output]

Download a webpage and convert to Markdown.

ARGUMENTS:
    url         The URL to download
    output      Output file path (optional, defaults to stdout)

OPTIONS:
    -h, --help      Show this help message
    -v, --version   Show version information
    --detect-md     Check if site serves Markdown directly first
    --no-readability    Skip readability extraction (convert full HTML)
    --frontmatter   Add YAML frontmatter with metadata

EXAMPLES:
    # Download to stdout
    download-markdown.cjs https://example.com/article

    # Save to file
    download-markdown.cjs https://example.com/article ./output.md

    # Detect if site serves markdown first
    download-markdown.cjs --detect-md https://docs.example.com/page

DEPENDENCIES:
    npm install @mozilla/readability turndown jsdom
`);
}

function showVersion() {
    console.log(`download-markdown.cjs version ${VERSION}`);
    console.log('Download webpages and convert to Markdown');
}

async function fetchUrl(url, options = {}) {
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (options.acceptMarkdown) {
        headers['Accept'] = 'text/markdown, text/plain, */*';
    }

    return new Promise((resolve, reject) => {
        const client = url.startsWith('https:') ? https : http;
        const req = client.get(url, { headers }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).toString();
                console.error(`Redirecting to: ${redirectUrl}`);
                fetchUrl(redirectUrl, options).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    content: data,
                    contentType: res.headers['content-type'] || '',
                    finalUrl: res.responseUrl || url
                });
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

function extractMarkdownLinks(html, baseUrl) {
    const links = [];

    // Simple regex-based extraction (faster than full JSDOM parse)
    const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])([^"']+\.md(?:[^"']*)?)\1[^>]*>/gi;
    let match;

    while ((match = linkRegex.exec(html)) !== null) {
        const href = match[2];
        try {
            const absoluteUrl = new URL(href, baseUrl).toString();
            links.push({
                url: absoluteUrl,
                type: 'markdown-link'
            });
        } catch (e) {
            // Skip invalid URLs
        }
    }

    // Also look for edit/source links (common pattern in docs)
    const editLinkRegex = /<a\s+(?:[^>]*?\s+)?(?:rel=["'](?:edit|source|edit-this-page|view-source)["']|class=["'][^"']*edit[^"']*["'])(?:[^>]*?\s+)?href=(["'])([^"']+)["'][^>]*>(?:Edit|View Source|Edit this page)/gi;

    while ((match = editLinkRegex.exec(html)) !== null) {
        const href = match[3];
        try {
            const absoluteUrl = new URL(href, baseUrl).toString();
            links.push({
                url: absoluteUrl,
                type: 'edit-link'
            });
        } catch (e) {
            // Skip invalid URLs
        }
    }

    // Look for GitHub/GitLab raw links
    const rawLinkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(https?://(?:raw\.github(?:user)?\.com|gitlab\.com/[^/]+/[^/]+/-/raw)[^"']+)(?:\.md)?(?:[^"']*)\1/gi;

    while ((match = rawLinkRegex.exec(html)) !== null) {
        const href = match[2];
        try {
            const absoluteUrl = new URL(href, baseUrl).toString();
            links.push({
                url: absoluteUrl,
                type: 'raw-link'
            });
        } catch (e) {
            // Skip invalid URLs
        }
    }

    return links;
}

async function tryFetchMarkdown(url) {
    const urlObj = new URL(url);
    const basePath = urlObj.pathname.replace(/\/?$/, '');

    const strategies = [
        { name: '.md extension', url: `${basePath}.md` },
        { name: '.markdown extension', url: `${basePath}.markdown` },
        { name: '/index.md', url: `${basePath}/index.md` },
        { name: '.html → .md', url: basePath.replace(/\.html?$/, '.md') },
        { name: '/README.md', url: `${basePath}/README.md` },
    ];

    const results = {
        tried: [],
        found: null,
        htmlLinks: []
    };

    // Try each URL variant
    for (const strategy of strategies) {
        const testUrl = new URL(strategy.url, url).toString();
        results.tried.push({ name: strategy.name, url: testUrl });

        try {
            const result = await fetchUrl(testUrl);
            const isMarkdown = result.contentType.includes('text/markdown') ||
                              result.contentType.includes('text/x-markdown') ||
                              (result.contentType.includes('text/plain') &&
                               (result.content.trim().startsWith('#') ||
                                result.content.includes('---\n') ||
                                /\[.*\]\(.*\)/.test(result.content)));

            if (isMarkdown || result.content.trim().startsWith('#')) {
                results.found = { url: testUrl, content: result.content, contentType: result.contentType };
                return results;
            }
        } catch (e) {
            // Try next
        }
    }

    // Try Accept header on original URL
    try {
        const result = await fetchUrl(url, { acceptMarkdown: true });
        const isMarkdown = result.contentType.includes('text/markdown') ||
                          result.contentType.includes('text/x-markdown');

        if (isMarkdown) {
            results.found = { url, content: result.content, contentType: result.contentType };
            return results;
        }

        // Parse HTML for markdown links
        if (JSDOM) {
            const mdLinks = extractMarkdownLinks(result.content, url);
            if (mdLinks.length > 0) {
                results.htmlLinks = mdLinks;
                console.error(`Found ${mdLinks.length} potential Markdown link(s) in HTML`);

                // Try the first markdown link
                for (const link of mdLinks.slice(0, 2)) {
                    try {
                        const mdResult = await fetchUrl(link.url);
                        if (mdResult.contentType.includes('text/markdown') ||
                            mdResult.contentType.includes('text/x-markdown') ||
                            mdResult.content.trim().startsWith('#')) {
                            results.found = { url: link.url, content: mdResult.content, contentType: mdResult.contentType };
                            console.error(`Found Markdown via ${link.type} link: ${link.url}`);
                            return results;
                        }
                    } catch (e) {
                        // Try next
                    }
                }
            }
        }
    } catch (e) {
        // Fall through
    }

    return results;
}

function extractWithReadability(html, url) {
    if (!Readability || !JSDOM) {
        throw new Error('Readability extraction requires @mozilla/readability and jsdom');
    }

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
        return null;
    }

    return {
        title: article.title,
        byline: article.byline,
        content: article.content,
        textContent: article.textContent,
        excerpt: article.excerpt
    };
}

function htmlToMarkdown(html, title) {
    if (!TurndownService) {
        throw new Error('HTML to Markdown conversion requires turndown');
    }

    const turndown = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced'
    });

    turndown.addRule('preserveLineBreaks', {
        filter: 'br',
        replacement: () => '\n'
    });

    turndown.remove(['script', 'style', 'nav', 'header', 'footer', 'aside']);

    const markdown = turndown.turndown(html);
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        showHelp();
        process.exit(1);
    }

    let detectMd = false;
    let useReadability = true;
    let addFrontmatter = false;
    let url = null;
    let outputPath = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        switch (arg) {
            case '-h':
            case '--help':
            case 'help':
                showHelp();
                process.exit(0);
                break;
            case '-v':
            case '--version':
            case '-version':
            case 'version':
                showVersion();
                process.exit(0);
                break;
            case '--detect-md':
                detectMd = true;
                break;
            case '--no-readability':
                useReadability = false;
                break;
            case '--frontmatter':
                addFrontmatter = true;
                break;
            default:
                if (!arg.startsWith('-')) {
                    if (!url) url = arg;
                    else if (!outputPath) outputPath = arg;
                } else {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }

    if (!url) {
        console.error('Error: URL is required');
        showHelp();
        process.exit(1);
    }

    try {
        console.error(`Fetching: ${url}`);

        if (detectMd) {
            console.error('Checking for Markdown variants...');
            const mdResults = await tryFetchMarkdown(url);

            if (mdResults.found) {
                console.error(`Found Markdown at: ${mdResults.found.url}`);
                console.error(`Content-Type: ${mdResults.found.contentType}`);
                let content = mdResults.found.content;

                if (addFrontmatter) {
                    const frontmatter = `---\ntitle: "${path.basename(url)}"\nsource: "${mdResults.found.url}"\ndate: "${new Date().toISOString()}"\n---\n\n`;
                    content = frontmatter + content;
                }

                if (outputPath) {
                    await fs.mkdir(path.dirname(outputPath), { recursive: true });
                    await fs.writeFile(outputPath, content, 'utf8');
                    console.error(`Saved to: ${outputPath}`);
                } else {
                    console.log(content);
                }
                return;
            }

            console.error('Tried:');
            for (const attempt of mdResults.tried) {
                console.error(`  ${attempt.name}: ${attempt.url}`);
            }

            if (mdResults.htmlLinks.length > 0) {
                console.error(`Found ${mdResults.htmlLinks.length} Markdown link(s) in HTML (none worked):`);
                for (const link of mdResults.htmlLinks) {
                    console.error(`  [${link.type}] ${link.url}`);
                }
            }

            console.error('No Markdown version found, converting HTML...');
        }

        const result = await fetchUrl(url);

        let markdown = '';
        let metadata = {
            title: '',
            byline: '',
            source: result.finalUrl || url,
            date: new Date().toISOString()
        };

        if (useReadability && Readability) {
            console.error('Extracting content with Readability...');
            const article = extractWithReadability(result.content, url);

            if (article) {
                metadata.title = article.title || '';
                metadata.byline = article.byline || '';
                markdown = htmlToMarkdown(article.content, article.title);
            } else {
                console.error('Readability extraction failed, converting full HTML...');
                metadata.title = 'Untitled';
                markdown = htmlToMarkdown(result.content, '');
            }
        } else {
            console.error('Converting full HTML...');
            const titleMatch = result.content.match(/<title[^>]*>([^<]*)<\/title>/i);
            metadata.title = titleMatch ? titleMatch[1].trim() : '';
            markdown = htmlToMarkdown(result.content, metadata.title);
        }

        if (addFrontmatter) {
            const frontmatter = `---\ntitle: "${metadata.title}"\nbyline: "${metadata.byline}"\nsource: "${metadata.source}"\ndate: "${metadata.date}"\n---\n\n`;
            markdown = frontmatter + markdown;
        }

        if (outputPath) {
            await fs.mkdir(path.dirname(outputPath), { recursive: true });
            await fs.writeFile(outputPath, markdown, 'utf8');
            console.error(`Saved to: ${outputPath}`);
        } else {
            console.log(markdown);
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();