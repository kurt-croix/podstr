import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findUnclosedTags(xmlContent: string) {
  const lines = xmlContent.split('\n');
  const tagStack: string[] = [];
  const _unclosedTags: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('<!--') || line.endsWith('-->')) {
      continue; // Skip comments
    }

    // Find opening tags (not self-closing and not closing tags)
    const openingTagMatch = line.match(/<<([^/?][^>]*)(?:\s[^>]*)?(?<!\/)>$/);
    if (openingTagMatch && !line.endsWith('/>')) {
      const tagName = openingTagMatch[1].split(' ')[0]; // Get tag name without attributes
      tagStack.push(tagName);
    }

    // Find closing tags
    const closingTagMatch = line.match(/^<\/([^>]+)>$/);
    if (closingTagMatch) {
      const tagName = closingTagMatch[1];
      if (tagStack.length > 0 && tagStack[tagStack.length - 1] === tagName) {
        tagStack.pop(); // Matching closing tag
      } else if (tagStack.length === 0 || tagStack[tagStack.length - 1] !== tagName) {
        console.log(`Unexpected closing tag </${tagName}> at line ${i + 1}`);
      }
    }
  }

  // Any remaining tags in the stack are unclosed
  if (tagStack.length > 0) {
    console.log('Unclosed tags found:');
    tagStack.forEach((tagName, index) => {
      console.log(`  ${index + 1}. <${tagName}>`);
    });
  } else {
    console.log('All tags are properly closed!');
  }

  return tagStack;
}

function main() {
  try {
    const rssPath = join(__dirname, '..', 'dist', 'rss.xml');
    const rssContent = readFileSync(rssPath, 'utf-8');

    console.log('🔍 Looking for unclosed tags...\n');

    const unclosedTags = findUnclosedTags(rssContent);

    if (unclosedTags.length === 0) {
      console.log('✅ All tags are properly closed!');
    }

  } catch (error) {
    console.error('❌ Error reading RSS file:', error);
    process.exit(1);
  }
}

main();