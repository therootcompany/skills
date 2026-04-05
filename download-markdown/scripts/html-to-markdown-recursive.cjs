#!/usr/bin/env node
/**
 * Recursively convert HTML files to Markdown
 * Preserves directory structure
 *
 * Version: 1.0.0
 * When updating this script, bump the version number above.
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Try to load optional dependencies
let TurndownService = null;
try {
    const Turndown = require('turndown');
    TurndownService = Turndown;
} catch (e) {
    // Will be checked later
}

let JSDOM = null;
try {
    const { JSDOM: J } = require('jsdom');
    JSDOM = J;
} catch (e) {
    // Will be checked later
}

const VERSION = '1.0.0';

function showHelp() {
    console.log(`
Usage: html-to-markdown-recursive.js [OPTIONS] <input> <output>

Recursively convert HTML files to Markdown, preserving directory structure.

ARGUMENTS:
    input       Input directory or file path
    output      Output directory

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    --clean             Remove original HTML files after conversion
    --flatten           Flatten output structure (all files in one dir)
    --strip-prefix      Strip common prefix from output paths
    --dry-run           Show what would be converted without doing it
    --frontmatter       Add YAML frontmatter with metadata
    --no-readability    Convert full HTML without content extraction

EXAMPLES:
    # Convert directory
    html-to-markdown-recursive.js ./docs ./markdown-docs

    # Convert single file
    html-to-markdown-recursive.js ./article.html ./articles/article.md

    # Preview changes
    html-to-markdown-recursive.js --dry-run ./docs ./markdown-docs

    # Clean up HTML after conversion
    html-to-markdown-recursive.js --clean ./docs ./markdown-docs

DEPENDENCIES:
    npm install turndown jsdom
`);
}

function showVersion() {
    console.log(`html-to-markdown-recursive.js version ${VERSION}`);
    console.log('Recursively convert HTML files to Markdown');
}

async function findHtmlFiles(inputPath) {
    const files = [];

    async function walk(dir) {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await walk(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.html')) {
                files.push(fullPath);
            }
        }
    }

    const stat = await fs.stat(inputPath);
    if (stat.isDirectory()) {
        await walk(inputPath);
    } else if (stat.isFile() && inputPath.endsWith('.html')) {
        files.push(inputPath);
    }

    return files;
}

function htmlToMarkdown(html, title) {
    if (!TurndownService) {
        throw new Error('HTML to Markdown conversion requires turndown');
    }

    const turndown = new TurndownService({
        headingStyle: 'atx',
        bulletListMarker: '-',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });

    // Configure rules
    turndown.addRule('preserveLineBreaks', {
        filter: 'br',
        replacement: () => '\n'
    });

    turndown.remove(['script', 'style']);

    const markdown = turndown.turndown(html);

    // Clean up
    return markdown.replace(/\n{3,}/g, '\n\n').trim();
}

async function extractContentWithReadability(html, filePath) {
    if (!JSDOM) {
        return null;
    }

    try {
        const dom = new JSDOM(html, { url: `file://${filePath}` });
        const { Readability } = require('@mozilla/readability');
        const reader = new Readability(dom.window.document);
        const article = reader.parse();

        if (article && article.textContent.length > 100) {
            return {
                title: article.title,
                content: article.content,
                textContent: article.textContent
            };
        }
    } catch (e) {
        console.error(`Readability failed for ${filePath}: ${e.message}`);
    }

    return null;
}

async function convertFile(inputFile, outputFile, options) {
    const html = await fs.readFile(inputFile, 'utf8');

    let title = '';
    let content = html;

    // Try readability extraction if enabled
    if (options.useReadability) {
        const extracted = await extractContentWithReadability(html, inputFile);
        if (extracted) {
            title = extracted.title || '';
            content = extracted.content;
        } else {
            // Extract title from HTML
            const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
            title = titleMatch ? titleMatch[1].trim() : '';
        }
    } else {
        // Extract title from HTML
        const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
        title = titleMatch ? titleMatch[1].trim() : '';
    }

    let markdown = htmlToMarkdown(content, title);

    // Add frontmatter if requested
    if (options.frontmatter) {
        const frontmatter = `---\ntitle: "${title}"\nsource: "${inputFile}"\nconverted: "${new Date().toISOString()}"\n---\n\n`;
        markdown = frontmatter + markdown;
    }

    // Ensure output directory exists
    await fs.mkdir(path.dirname(outputFile), { recursive: true });

    // Write markdown file
    await fs.writeFile(outputFile, markdown, 'utf8');

    // Clean up original if requested
    if (options.clean) {
        await fs.unlink(inputFile);
    }

    return { title, input: inputFile, output: outputFile };
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        showHelp();
        process.exit(1);
    }

    let inputPath = null;
    let outputPath = null;
    let options = {
        clean: false,
        flatten: false,
        stripPrefix: false,
        dryRun: false,
        frontmatter: false,
        useReadability: true
    };

    // Parse arguments
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
            case '--clean':
                options.clean = true;
                break;
            case '--flatten':
                options.flatten = true;
                break;
            case '--strip-prefix':
                options.stripPrefix = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--frontmatter':
                options.frontmatter = true;
                break;
            case '--no-readability':
                options.useReadability = false;
                break;
            default:
                if (!arg.startsWith('-')) {
                    if (!inputPath) {
                        inputPath = arg;
                    } else if (!outputPath) {
                        outputPath = arg;
                    }
                } else {
                    console.error(`Unknown option: ${arg}`);
                    process.exit(1);
                }
        }
    }

    if (!inputPath || !outputPath) {
        console.error('Error: input and output paths are required');
        showHelp();
        process.exit(1);
    }

    // Check dependencies
    if (!TurndownService) {
        console.error('Error: turndown is required. Run: npm install turndown');
        process.exit(1);
    }

    try {
        // Resolve paths
        const resolvedInput = path.resolve(inputPath);
        const resolvedOutput = path.resolve(outputPath);

        console.error(`Scanning for HTML files in: ${resolvedInput}`);

        const htmlFiles = await findHtmlFiles(resolvedInput);

        if (htmlFiles.length === 0) {
            console.error('No HTML files found.');
            process.exit(0);
        }

        console.error(`Found ${htmlFiles.length} HTML file(s)`);

        if (options.dryRun) {
            console.log('\nDry run - would convert:');
        }

        const results = [];
        const inputDir = (await fs.stat(resolvedInput)).isDirectory()
            ? resolvedInput
            : path.dirname(resolvedInput);

        for (const file of htmlFiles) {
            let relativePath = path.relative(inputDir, file);
            let outputFile;

            if (options.flatten) {
                // Flatten: just use basename
                const base = path.basename(file, '.html') + '.md';
                outputFile = path.join(resolvedOutput, base);
            } else if (options.stripPrefix) {
                // Strip common directory prefix
                const parts = relativePath.split(path.sep);
                if (parts.length > 1) {
                    relativePath = parts.slice(1).join(path.sep);
                }
                outputFile = path.join(resolvedOutput, relativePath.replace('.html', '.md'));
            } else {
                // Preserve structure
                outputFile = path.join(resolvedOutput, relativePath.replace('.html', '.md'));
            }

            if (options.dryRun) {
                console.log(`  ${file} -> ${outputFile}`);
                continue;
            }

            try {
                const result = await convertFile(file, outputFile, options);
                results.push(result);
                console.error(`✓ ${path.basename(file)} -> ${outputFile}`);
            } catch (e) {
                console.error(`✗ ${file}: ${e.message}`);
            }
        }

        if (!options.dryRun) {
            console.error(`\nConverted ${results.length} file(s)`);
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
}

main();
