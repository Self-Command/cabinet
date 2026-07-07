import type { IDocumentData, IParagraph } from "@univerjs/core";

const DOCS_END = "\0";
const PARAGRAPH = "\r";

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function paragraphsFromXmlFallback(xml: string): string[] {
  const paragraphs: string[] = [];
  const paragraphMatches = xml.matchAll(/<[\w:]*p(?:\s[^>]*)?>([\s\S]*?)<\/[\w:]*p>/g);
  for (const paragraphMatch of paragraphMatches) {
    const text = Array.from(
      paragraphMatch[1].matchAll(/<[\w:]*t(?:\s[^>]*)?>([\s\S]*?)<\/[\w:]*t>/g)
    )
      .map((match) => decodeXmlText(match[1]))
      .join("");
    paragraphs.push(text);
  }
  return paragraphs;
}

function elementsByLocalName(root: ParentNode, localName: string): Element[] {
  return Array.from(root.querySelectorAll("*")).filter(
    (node): node is Element => node.localName === localName
  );
}

function textFromNode(node: Element): string {
  const chunks: string[] = [];
  elementsByLocalName(node, "t").forEach((textNode) => {
    chunks.push(textNode.textContent ?? "");
  });
  return chunks.join("");
}

function normalizeParagraphs(paragraphs: string[]): string[] {
  const cleaned = paragraphs
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return cleaned.length > 0 ? cleaned : ["Empty document"];
}

function paragraphsFromDocumentXml(documentXml: string): string[] {
  if (typeof DOMParser === "undefined") return paragraphsFromXmlFallback(documentXml);

  const doc = new DOMParser().parseFromString(documentXml, "application/xml");
  const parserError = doc.querySelector("parsererror");
  if (parserError) throw new Error("DOCX XML parse failed");
  return elementsByLocalName(doc, "p").map(textFromNode);
}

export async function docxBufferToUniverDocData(
  JSZip: typeof import("jszip"),
  buffer: ArrayBuffer,
  title: string
): Promise<IDocumentData> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) throw new Error("DOCX document.xml not found");

  const paragraphs = normalizeParagraphs(paragraphsFromDocumentXml(documentXml));
  const dataStream = `${paragraphs.join(PARAGRAPH)}${PARAGRAPH}${DOCS_END}`;
  const paragraphData: IParagraph[] = [];
  let cursor = 0;
  for (const paragraph of paragraphs) {
    paragraphData.push({
      startIndex: cursor,
      paragraphStyle: {
        spaceAbove: { v: 0 },
        spaceBelow: { v: 8 },
        lineSpacing: 1.15,
      },
    });
    cursor += paragraph.length + 1;
  }

  return {
    id: `cabinet-doc-${Date.now()}`,
    title,
    locale: "enUS" as IDocumentData["locale"],
    body: {
      dataStream,
      textRuns: [
        {
          st: 0,
          ed: Math.max(0, dataStream.length - 1),
          ts: {
            fs: 12,
            ff: "Arial",
          },
        },
      ],
      paragraphs: paragraphData,
      sectionBreaks: [{ startIndex: Math.max(0, dataStream.length - 2) }],
      customBlocks: [],
      tables: [],
    },
    documentStyle: {
      pageSize: {
        width: 794,
        height: 1123,
      },
      marginTop: 50,
      marginBottom: 50,
      marginRight: 50,
      marginLeft: 50,
      renderConfig: {
        zeroWidthParagraphBreak: 0,
        vertexAngle: 0,
        centerAngle: 0,
        background: { rgb: "#f8fafc" },
      },
    },
  };
}
