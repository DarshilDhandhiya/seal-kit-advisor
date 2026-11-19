export type OutMessage =
  | { kind: 'text'; text: string }
  | { kind: 'buttons'; text: string; buttons: { id: string; title: string }[]; headerImage?: string }
  | { kind: 'list'; text: string; buttonLabel: string; rows: { id: string; title: string; description?: string }[] }
  | { kind: 'image'; url: string; caption?: string };

export type Lang = 'en' | 'hi';
