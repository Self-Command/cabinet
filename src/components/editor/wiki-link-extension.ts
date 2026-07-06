import { Mark, mergeAttributes } from "@tiptap/core";
import { InputRule } from "@tiptap/core";
import { wikiLinkHrefForPageName } from "@/lib/markdown/internal-link-target";

export const WikiLink = Mark.create({
  name: "wikiLink",
  priority: 1000,
  keepOnSplit: false,

  addAttributes() {
    return {
      pageName: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-page-name"),
        renderHTML: (attributes) => ({
          "data-page-name": attributes.pageName,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'a[data-wiki-link="true"]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const pageName = HTMLAttributes["data-page-name"] || "";

    return [
      "a",
      mergeAttributes(HTMLAttributes, {
        "data-wiki-link": "true",
        href: wikiLinkHrefForPageName(pageName),
        class: "wiki-link",
      }),
      0,
    ];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /\[\[([^\]]+)\]\]$/,
        handler: ({ state, range, match }) => {
          const pageName = match[1];
          const { tr } = state;

          tr.replaceWith(
            range.from,
            range.to,
            state.schema.text(pageName, [
              state.schema.marks.wikiLink.create({ pageName }),
            ])
          );
        },
      }),
    ];
  },
});
