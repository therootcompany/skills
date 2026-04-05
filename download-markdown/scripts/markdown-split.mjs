#!/usr/bin/env node
/**
 * Split large Markdown files into smaller reference files
 * Extracts TOC, splits by headers, creates navigation index
 *
 * Version: 1.0.0
 * When updating this script, bump the version number above.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERSION = '1.0.0';

function showHelp() {
    console.log(`
Usage: markdown-split.mjs [OPTIONS] <input> [output-dir]

Split large Markdown files into smaller reference files for skill context loading.

ARGUMENTS:
    input       Input markdown file
    output-dir  Output directory (defaults to input name without .md)

OPTIONS:
    -h, --help          Show this help message
    -v, --version       Show version information
    --toc               Output TOC with line numbers only
    --max-lines N       Target max lines per file (default: 500)
    --max-bytes N       Target max bytes per file (default: 20000)
    --depth N           Header depth to split on (default: 2, splits on ##)
    --index             Create index file listing all splits
    --flatten           Use flat filenames instead of directories

EXAMPLES:
    # View TOC with line numbers
    markdown-split.mjs --toc large-doc.md

    # Split into directory
    markdown-split.mjs --index large-doc.md ./references/

    # Split on level-1 headers, flatten filenames
    markdown-split.mjs --depth 1 --flatten large-api.md ./api/

OUTPUT:
    Creates multiple .md files suitable for progressive context loading.
    Each file starts with a header and stays within size limits.
`);
}

function showVersion() {
    console.log(`markdown-split.mjs version ${VERSION}`);
    console.log('Split large Markdown files for skill context loading');
}

/**
 * Extract headers from markdown content
 * @param {string} content - Markdown content
 * @param {number} maxDepth - Maximum header depth (1-6)
 * @returns {Array<{level: number, text: string, line: number, slug: string}>}
 */
function extractHeaders(content, maxDepth = 6) {
    const lines = content.split('\n');
    const headers = [];
    let inCodeBlock = false;
    let startLine = 0;

    // Skip YAML frontmatter
    if (lines[0] === '---') {
        for (let i = 1; i < lines.length; i++) {
            if (lines[i] === '---') {
                startLine = i + 1;
                break;
            }
        }
    }

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i];

        // Track code blocks
        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            continue;
        }

        // Skip lines inside code blocks
        if (inCodeBlock) continue;

        // ATX-style headers (# Header)
        const atxMatch = line.match(/^(#{1,6})\s+(.+)$/);
        if (atxMatch) {
            const level = atxMatch[1].length;
            if (level <= maxDepth) {
                headers.push({
                    level,
                    text: atxMatch[2].trim(),
                    line: i + 1,
                    slug: slugify(atxMatch[2].trim())
                });
            }
        }

        // Setext-style headers (underlined with = or -)
        if (i > 0 && lines[i - 1].trim()) {
            const prevLine = lines[i - 1];
            if (line.match(/^=+$/) && prevLine.trim()) {
                // Level 1 (underlined with =)
                headers.push({
                    level: 1,
                    text: prevLine.trim(),
                    line: i,
                    slug: slugify(prevLine.trim())
                });
            } else if (line.match(/^-+$/) && prevLine.trim()) {
                // Level 2 (underlined with -)
                headers.push({
                    level: 2,
                    text: prevLine.trim(),
                    line: i,
                    slug: slugify(prevLine.trim())
                });
            }
        }
    }

    return headers;
}

/**
 * Convert text to URL-safe slug
 * @param {string} text - Header text
 * @returns {string}
 */
function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
}

/**
 * Generate a safe filename from header
 * @param {object} header - Header object
 * @param {number} index - Header index
 * @param {boolean} flatten - Use flat names
 * @returns {string}
 */
function headerToFilename(header, index, flatten = false) {
    const slug = header.slug || slugify(header.text);

    if (flatten) {
        return `${String(index).padStart(3, '0')}-${slug}.md`;
    }

    // Create hierarchical filename based on header depth
    return `${slug}.md`;
}

/**
 * Output TOC with line numbers
 * @param {string} content - Markdown content
 * @param {number} maxDepth - Maximum header depth
 */
function outputTOC(content, maxDepth = 6) {
    const headers = extractHeaders(content, maxDepth);

    console.log('# Table of Contents\n');
    console.log('| Level | Line | Header |');
    console.log('|-------|------|--------|');

    for (const h of headers) {
        const indent = '  '.repeat(h.level - 1);
        console.log(`| ${h.level} | ${h.line} | ${indent}${h.text} |`);
    }

    console.log('\n---\n');
    console.log(`Total headers: ${headers.length}`);
    console.log(`Total lines: ${content.split('\n').length}`);
}

/**
 * Split markdown by headers
 * @param {string} content - Markdown content
 * @param {object} options - Split options
 * @returns {Array<{name: string, content: string, header: object}>}
 */
function splitByHeader(content, options = {}) {
    const {
        splitDepth = 2,
        maxLines = 500,
        maxBytes = 20000,
        flatten = false
    } = options;

    const lines = content.split('\n');
    const headers = extractHeaders(content, splitDepth);
    const sections = [];

    if (headers.length === 0) {
        // No headers at this depth, return entire content
        return [{ name: 'index.md', content, header: null }];
    }

    // Add implicit start if content before first header
    const firstHeaderLine = headers[0].line - 1;
    if (firstHeaderLine > 0) {
        const preamble = lines.slice(0, firstHeaderLine).join('\n');
        if (preamble.trim()) {
            sections.push({
                name: 'intro.md',
                content: preamble,
                header: { text: 'Introduction', level: 0 }
            });
        }
    }

    // Split by headers at splitDepth
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const startLine = header.line - 1;
        const endLine = i < headers.length - 1
            ? headers[i + 1].line - 1
            : lines.length;

        const sectionLines = lines.slice(startLine, endLine);
        const sectionContent = sectionLines.join('\n');

        // Check if section is too large and needs further splitting
        if (sectionLines.length > maxLines || sectionContent.length > maxBytes) {
            // Find subheaders within this section
            const subHeaders = extractHeaders(sectionContent, splitDepth + 1)
                .filter(h => h.level > header.level);

            if (subHeaders.length > 0) {
                // Split by subheaders
                for (let j = 0; j < subHeaders.length; j++) {
                    const subHeader = subHeaders[j];
                    const subStart = subHeader.line - 1;
                    const subEnd = j < subHeaders.length - 1
                        ? subHeaders[j + 1].line - 1
                        : sectionLines.length;

                    const subContent = sectionLines.slice(subStart, subEnd).join('\n');

                    sections.push({
                        name: headerToFilename(subHeader, i * 100 + j, flatten),
                        content: subContent,
                        header: subHeader,
                        parent: header.text
                    });
                }
            } else {
                // No subheaders, keep as-is but warn
                sections.push({
                    name: headerToFilename(header, i, flatten),
                    content: sectionContent,
                    header,
                    oversized: true
                });
            }
        } else {
            sections.push({
                name: headerToFilename(header, i, flatten),
                content: sectionContent,
                header
            });
        }
    }

    return sections;
}

/**
 * Create index file listing all sections
 * @param {Array} sections - Array of section objects
 * @param {string} title - Index title
 * @returns {string}
 */
function createIndex(sections, title = 'Reference Index') {
    let index = `# ${title}\n\n`;
    index += 'Split for progressive context loading. Read only what you need.\n\n';
    index += '| File | Header | Lines | Size |\n';
    index += '|------|--------|-------|------|\n';

    for (const section of sections) {
        const lines = section.content.split('\n').length;
        const size = (section.content.length / 1024).toFixed(1);
        const warning = section.oversized ? ' ⚠️' : '';
        index += `| ${section.name} | ${section.header?.text || 'Introduction'} | ${lines} | ${size}KB${warning} |\n`;
    }

    index += '\n---\n';
    index += 'Usage: Use `grep -n "^#" file.md` to find headers, then read specific sections.\n';

    return index;
}

async function main() {
    const args = process.argv.slice(2);
    const options = {
        toc: false,
        index: false,
        splitDepth: 2,
        maxLines: 500,
        maxBytes: 20000,
        flatten: false
    };

    let inputFile = null;
    let outputDir = null;

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '-h' || arg === '--help') {
            showHelp();
            process.exit(0);
        }

        if (arg === '-v' || arg === '--version') {
            showVersion();
            process.exit(0);
        }

        if (arg === '--toc') {
            options.toc = true;
            continue;
        }

        if (arg === '--index') {
            options.index = true;
            continue;
        }

        if (arg === '--flatten') {
            options.flatten = true;
            continue;
        }

        if (arg === '--depth') {
            options.splitDepth = parseInt(args[++i], 10);
            continue;
        }

        if (arg === '--max-lines') {
            options.maxLines = parseInt(args[++i], 10);
            continue;
        }

        if (arg === '--max-bytes') {
            options.maxBytes = parseInt(args[++i], 10);
            continue;
        }

        if (!arg.startsWith('-')) {
            if (!inputFile) {
                inputFile = arg;
            } else if (!outputDir) {
                outputDir = arg;
            }
        }
    }

    if (!inputFile) {
        console.error('Error: No input file specified');
        console.error('Use --help for usage information');
        process.exit(1);
    }

    // Read input file
    let content;
    try {
        content = await fs.readFile(inputFile, 'utf-8');
    } catch (e) {
        console.error(`Error: Cannot read file: ${inputFile}`);
        console.error(e.message);
        process.exit(1);
    }

    // TOC mode - output and exit
    if (options.toc) {
        outputTOC(content, options.splitDepth);
        process.exit(0);
    }

    // Default output dir to input name without extension
    if (!outputDir) {
        outputDir = inputFile.replace(/\.md$/, '');
    }

    // Split content
    const sections = splitByHeader(content, options);

    // Create output directory
    try {
        await fs.mkdir(outputDir, { recursive: true });
    } catch (e) {
        console.error(`Error: Cannot create directory: ${outputDir}`);
        console.error(e.message);
        process.exit(1);
    }

    // Write sections
    for (const section of sections) {
        const outputPath = path.join(outputDir, section.name);
        try {
            await fs.writeFile(outputPath, section.content);
            const lines = section.content.split('\n').length;
            const size = (section.content.length / 1024).toFixed(1);
            console.log(`Wrote: ${section.name} (${lines} lines, ${size}KB)`);
            if (section.oversized) {
                console.log(`  ⚠️  Section exceeds size limits but has no subheaders`);
            }
        } catch (e) {
            console.error(`Error: Cannot write file: ${outputPath}`);
            console.error(e.message);
        }
    }

    // Create index if requested
    if (options.index) {
        const title = path.basename(inputFile, '.md');
        const indexContent = createIndex(sections, title);
        const indexPath = path.join(outputDir, 'INDEX.md');
        await fs.writeFile(indexPath, indexContent);
        console.log(`Wrote: INDEX.md`);
    }

    console.log(`\nSplit ${inputFile} into ${sections.length} files in ${outputDir}/`);
}

main().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});