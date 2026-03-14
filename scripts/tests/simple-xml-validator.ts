import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function simpleXMLValidator(xmlContent: string) {
  console.log('🔍 Simple XML Validation...\n');

  // Remove comments for validation
  const withoutComments = xmlContent.replace(/<!--[\s\S]*?-->/g, '');

  // Check for XML declaration
  if (!withoutComments.includes('<?xml')) {
    console.log('❌ Missing XML declaration');
    return false;
  }

  // Check for root element
  if (!withoutComments.includes('<rss') || !withoutComments.includes('</rss>')) {
    console.log('❌ Missing RSS root element');
    return false;
  }

  // Check for channel element
  if (!withoutComments.includes('<channel>') || !withoutComments.includes('</channel>')) {
    console.log('❌ Missing channel element');
    return false;
  }

  // Simple tag counting - remove self-closing tags first
  const withoutSelfClosing = withoutComments.replace(/<[^>]+\/>/g, '');

  // Handle multi-line tags by joining lines that are part of the same tag
  const singleLineContent = withoutSelfClosing.replace(/>\s*</g, '><').replace(/\s+/g, ' ');

  // Count opening and closing tags
  const openingTags = (singleLineContent.match(/<[^/?][^>]*>(?![^<]*<\/)/g) || []).length;
  const closingTags = (singleLineContent.match(/<\/[^>]*>/g) || []).length;

  console.log(`📊 Tag Count Analysis:`);
  console.log(`   Opening tags: ${openingTags}`);
  console.log(`   Closing tags: ${closingTags}`);
  console.log(`   Difference: ${openingTags - closingTags}`);

  if (openingTags !== closingTags) {
    console.log('❌ Tag count mismatch');
    return false;
  }

  console.log('✅ Basic XML structure is valid');
  return true;
}

function showTagDetails(xmlContent: string) {
  console.log('\n📝 Tag Details:');

  // Remove comments
  const withoutComments = xmlContent.replace(/<!--[\s\S]*?-->/g, '');

  // Find all tags
  const allTags = (withoutComments.match(/<[^>]*>/g) || []);
  const openingTags = allTags.filter(tag => !tag.startsWith('</') && !tag.endsWith('/>') && !tag.startsWith('<?'));
  const closingTags = allTags.filter(tag => tag.startsWith('</'));
  const selfClosingTags = allTags.filter(tag => tag.endsWith('/>'));
  const processingInstructions = allTags.filter(tag => tag.startsWith('<?'));

  console.log(`   Total tags: ${allTags.length}`);
  console.log(`   Opening tags: ${openingTags.length}`);
  console.log(`   Closing tags: ${closingTags.length}`);
  console.log(`   Self-closing: ${selfClosingTags.length}`);
  console.log(`   Processing instructions: ${processingInstructions.length}`);

  console.log('\n📋 Opening tags:');
  openingTags.forEach((tag, index) => {
    console.log(`   ${index + 1}. ${tag}`);
  });

  console.log('\n📋 Closing tags:');
  closingTags.forEach((tag, index) => {
    console.log(`   ${index + 1}. ${tag}`);
  });
}

function main() {
  try {
    const rssPath = join(__dirname, '..', 'dist', 'rss.xml');
    const rssContent = readFileSync(rssPath, 'utf-8');

    const isValid = simpleXMLValidator(rssContent);
    showTagDetails(rssContent);

    if (isValid) {
      console.log('\n✅ RSS feed is well-formed!');
    } else {
      console.log('\n❌ RSS feed has issues!');
    }

  } catch (error) {
    console.error('❌ Error reading RSS file:', error);
    process.exit(1);
  }
}

main();