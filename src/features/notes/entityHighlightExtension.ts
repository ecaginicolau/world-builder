import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export interface EntityHighlightSpec {
  /** Display name of the entity (matched as a whole word, case-insensitive). */
  name: string;
  /** Resolved color (hex). */
  color: string;
  /** Optional aliases; matched the same way as name. */
  aliases?: string[];
}

interface Options {
  entities: EntityHighlightSpec[];
}

const pluginKey = new PluginKey<DecorationSet>('entityHighlight');

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledMatch {
  re: RegExp;
  color: string;
  label: string;
}

function compile(entities: EntityHighlightSpec[]): CompiledMatch[] {
  const out: CompiledMatch[] = [];
  for (const e of entities) {
    const variants = [e.name, ...(e.aliases ?? [])].filter((v) => v && v.trim().length > 1);
    for (const v of variants) {
      out.push({
        re: new RegExp(`\\b${escapeRegex(v)}\\b`, 'giu'),
        color: e.color,
        label: e.name,
      });
    }
  }
  return out;
}

function buildDecorations(doc: import('@tiptap/pm/model').Node, matches: CompiledMatch[]): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty;
  const decs: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    const text = node.text;
    for (const m of matches) {
      m.re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = m.re.exec(text)) !== null) {
        const from = pos + match.index;
        const to = from + match[0].length;
        decs.push(
          Decoration.inline(from, to, {
            class: 'entity-highlight',
            style: `background-color: ${m.color}33; border-bottom: 2px solid ${m.color}; border-radius: 2px;`,
            title: m.label,
          }),
        );
      }
    }
  });
  return DecorationSet.create(doc, decs);
}

export const EntityHighlight = Extension.create<Options>({
  name: 'entityHighlight',

  addOptions() {
    return { entities: [] };
  },

  addProseMirrorPlugins() {
    const initialEntities = this.options.entities;
    return [
      new Plugin({
        key: pluginKey,
        state: {
          init: (_config, instance) =>
            buildDecorations(instance.doc, compile(initialEntities)),
          apply: (tr, old) => {
            const meta = tr.getMeta(pluginKey);
            if (meta && meta.entities) {
              return buildDecorations(tr.doc, compile(meta.entities));
            }
            if (tr.docChanged) {
              return old.map(tr.mapping, tr.doc);
            }
            return old;
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

/** Imperative helper so callers can refresh the decorations when entities list changes. */
export function setEntityHighlights(
  editor: import('@tiptap/react').Editor,
  entities: EntityHighlightSpec[],
): void {
  const { state, view } = editor;
  const tr = state.tr.setMeta(pluginKey, { entities });
  view.dispatch(tr);
}
