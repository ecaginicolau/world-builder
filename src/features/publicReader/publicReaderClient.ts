import { supabase } from '@/lib/supabase';
import type {
  AnnotationKind,
  ReaderAnnotation,
  ReaderChapterPayload,
  ReaderSession,
  ResolvedBook,
  ResolvedChapter,
  ResolvedLink,
  ResolvedPart,
} from './types';

export interface PublicReaderError {
  status: number;
  code: string;
}

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('public-reader', {
    body: { action, ...payload },
  });
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; we read context.body for code.
    const ctx = (error as { context?: { body?: string } }).context;
    let code = 'unknown';
    let status = 500;
    try {
      if (ctx?.body) {
        const parsed = JSON.parse(ctx.body);
        if (typeof parsed?.error === 'string') code = parsed.error;
      }
    } catch {
      // ignore
    }
    if (typeof (error as { status?: number }).status === 'number') {
      status = (error as { status: number }).status;
    }
    throw { status, code } satisfies PublicReaderError;
  }
  return data as T;
}

export interface ResolvedLinkPayload {
  link: ResolvedLink;
  book: ResolvedBook;
  parts: ResolvedPart[];
  chapters: ResolvedChapter[];
}

export function resolveLink(token: string) {
  return call<ResolvedLinkPayload>('resolve_link', { token });
}

export function registerSession(args: {
  token: string;
  readerLocalId: string;
  name: string;
}) {
  return call<{ session: ReaderSession }>('register_session', {
    token: args.token,
    reader_local_id: args.readerLocalId,
    name: args.name,
  });
}

export function getChapter(args: {
  token: string;
  readerLocalId: string;
  chapterId: string;
}) {
  return call<{ chapter: ReaderChapterPayload; my_annotations: ReaderAnnotation[] }>(
    'get_chapter',
    {
      token: args.token,
      reader_local_id: args.readerLocalId,
      chapter_id: args.chapterId,
    },
  );
}

export function postAnnotation(args: {
  token: string;
  readerLocalId: string;
  chapterId: string;
  kind: AnnotationKind;
  selectedText: string;
  beforeCtx: string;
  afterCtx: string;
  commentBody?: string;
}) {
  return call<{ annotation: ReaderAnnotation }>('post_annotation', {
    token: args.token,
    reader_local_id: args.readerLocalId,
    chapter_id: args.chapterId,
    kind: args.kind,
    selected_text: args.selectedText,
    before_ctx: args.beforeCtx,
    after_ctx: args.afterCtx,
    comment_body: args.commentBody,
  });
}

export function deleteMyAnnotation(args: {
  token: string;
  readerLocalId: string;
  annotationId: string;
}) {
  return call<{ ok: true }>('delete_my_annotation', {
    token: args.token,
    reader_local_id: args.readerLocalId,
    annotation_id: args.annotationId,
  });
}
