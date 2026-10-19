import { Fragment, type ReactNode } from 'react';
import { marked, type Token, type Tokens } from 'marked';
import { headingId, subheadingId } from './helpDoc';

/**
 * Pinta el markdown del manual como elementos de React, sin `dangerouslySetInnerHTML`: `marked`
 * solo lo parte en piezas (títulos, párrafos, listas, tablas, imágenes) y aquí se arma cada una.
 * Las imágenes cargan al acercarse (`loading="lazy"`) y llevan su pie; el HTML crudo se ignora.
 */
export default function ManualContent({ markdown, sectionId }: { markdown: string; sectionId: string }) {
  const tokens = marked.lexer(markdown, { gfm: true });
  return <>{tokens.map((tok, i) => block(tok, i, sectionId))}</>;
}

function inline(tokens: Token[] | undefined): ReactNode {
  if (!tokens) return null;
  return tokens.map((tok, i) => {
    switch (tok.type) {
      case 'strong':
        return <strong key={i}>{inline((tok as Tokens.Strong).tokens)}</strong>;
      case 'em':
        return <em key={i}>{inline((tok as Tokens.Em).tokens)}</em>;
      case 'del':
        return <del key={i}>{inline((tok as Tokens.Del).tokens)}</del>;
      case 'codespan':
        return <code key={i}>{decode((tok as Tokens.Codespan).text)}</code>;
      case 'br':
        return <br key={i} />;
      case 'link': {
        const l = tok as Tokens.Link;
        const external = /^https?:/i.test(l.href);
        return (
          <a key={i} href={l.href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {inline(l.tokens)}
          </a>
        );
      }
      case 'image':
        return figure(tok as Tokens.Image, i);
      case 'text': {
        const t = tok as Tokens.Text;
        return t.tokens ? <Fragment key={i}>{inline(t.tokens)}</Fragment> : <Fragment key={i}>{decode(t.text)}</Fragment>;
      }
      case 'escape':
        return <Fragment key={i}>{decode((tok as Tokens.Escape).text)}</Fragment>;
      default:
        return null; // html crudo y lo que no se use en el manual
    }
  });
}

function figure(img: Tokens.Image, key: number) {
  return (
    <figure key={key} className="help-figure">
      <img src={img.href} alt={img.text} loading="lazy" decoding="async" />
      {img.text && <figcaption>{img.text}</figcaption>}
    </figure>
  );
}

function block(tok: Token, key: number, sectionId: string): ReactNode {
  switch (tok.type) {
    case 'heading': {
      const h = tok as Tokens.Heading;
      const Tag = `h${Math.min(Math.max(h.depth, 2), 4)}` as 'h2' | 'h3' | 'h4';
      const id = h.depth <= 2 ? headingId(h.text) : subheadingId(sectionId, h.text);
      return <Tag key={key} id={id}>{inline(h.tokens)}</Tag>;
    }
    case 'paragraph': {
      const p = tok as Tokens.Paragraph;
      // Un párrafo que es solo una imagen se pinta como figura, no dentro de un <p>.
      const solo = p.tokens.filter((x) => !(x.type === 'text' && !x.raw.trim()));
      if (solo.length === 1 && solo[0].type === 'image') return figure(solo[0] as Tokens.Image, key);
      return <p key={key}>{inline(p.tokens)}</p>;
    }
    case 'list': {
      const l = tok as Tokens.List;
      const items = l.items.map((it, i) => <li key={i}>{it.tokens.map((x, j) => (x.type === 'text' ? <Fragment key={j}>{inline((x as Tokens.Text).tokens ?? [x])}</Fragment> : block(x, j, sectionId)))}</li>);
      return l.ordered ? <ol key={key} start={typeof l.start === 'number' ? l.start : undefined}>{items}</ol> : <ul key={key}>{items}</ul>;
    }
    case 'table': {
      const t = tok as Tokens.Table;
      return (
        <div key={key} className="help-table-wrap">
          <table>
            <thead><tr>{t.header.map((c, i) => <th key={i}>{inline(c.tokens)}</th>)}</tr></thead>
            <tbody>{t.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c.tokens)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    case 'blockquote':
      return <blockquote key={key}>{(tok as Tokens.Blockquote).tokens.map((x, i) => block(x, i, sectionId))}</blockquote>;
    case 'code':
      return <pre key={key} tabIndex={0}><code>{(tok as Tokens.Code).text}</code></pre>;
    case 'text': {
      const t = tok as Tokens.Text;
      return <p key={key}>{inline(t.tokens ?? [t])}</p>;
    }
    default:
      return null; // space, hr, html
  }
}

/** `marked` deja las entidades de los textos escapadas (&amp;, &quot;, &#39;): aquí se devuelven. */
function decode(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
