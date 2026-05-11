import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { cn } from '@/lib/utils';

interface ArticleContentProps {
  content: string;
  className?: string;
}

/** Pre-processes raw markdown to convert nostr: URIs to clickable links */
function preprocessNostrLinks(markdown: string): string {
  return markdown.replace(
    /nostr:(npub1|note1|nprofile1|nevent1|naddr1)([023456789acdefghjklmnpqrstuvwxyz]+)/g,
    (_, prefix, data) => {
      const id = `${prefix}${data}`;
      return `[${id}](/${id})`;
    }
  );
}

/** Renders NIP-23 article markdown content with Tailwind Typography styling */
export function ArticleContent({ content, className }: ArticleContentProps) {
  const processed = preprocessNostrLinks(content);

  return (
    <div className={cn('prose prose-sm max-w-none dark:prose-invert', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Make internal links use React Router
          a: ({ href, children, ...props }) => {
            if (href?.startsWith('/')) {
              return <Link to={href} {...props}>{children}</Link>;
            }
            return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
