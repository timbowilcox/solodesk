import { marked } from "marked";

marked.setOptions({ gfm: true, breaks: false });

export function Markdown({ content }: { content: string }) {
  const html = marked.parse(content) as string;
  return (
    <div
      className="markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
