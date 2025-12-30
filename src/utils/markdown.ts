import { marked } from 'marked'
import DOMPurify from 'dompurify'

/**
 * Configure marked for safe, consistent Markdown rendering.
 * Settings optimized for CCC schedule descriptions.
 */
marked.setOptions({
  breaks: true,   // Convert \n to <br>
  gfm: true,      // GitHub flavored Markdown
})

/**
 * Parse Markdown to sanitized HTML.
 * Handles both Markdown and plain HTML input safely.
 * 
 * @param markdown - Markdown or HTML content
 * @returns Sanitized HTML string safe for rendering
 */
export function parseMarkdown(markdown: string): string {
  if (!markdown || !markdown.trim()) {
    return ''
  }

  try {
    // Protect German Gendersternchen (e.g., "Feminist*innen") from being parsed as Markdown emphasis
    // by escaping the asterisk with backslash before Markdown parsing
    const genderStarPattern = /(\p{L}+)\*(\p{L}+)/gu
    const textWithEscapedStars = markdown.replace(genderStarPattern, '$1\\*$2')

    // Parse Markdown to HTML
    const rawHtml = marked.parse(textWithEscapedStars, { async: false }) as string
    
    // Sanitize HTML to prevent XSS attacks
    const cleanHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'a', 'b', 'strong', 'i', 'em', 'u', 'strike', 's', 'del',
        'code', 'pre', 'br', 'p', 'div', 'span',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'blockquote',
        'hr',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'img',
      ],
      ALLOWED_ATTR: [
        'href', 'title', 'target', 'rel',
        'alt', 'src', 'width', 'height',
        'class',
      ],
      ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
      ALLOW_DATA_ATTR: false,
    })

    return cleanHtml
  } catch (error) {
    console.error('Failed to parse Markdown:', error)
    // Fallback: sanitize as plain HTML
    return DOMPurify.sanitize(markdown)
  }
}
