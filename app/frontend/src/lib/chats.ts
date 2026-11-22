/** Chat history shared with the legacy page (localStorage "hospitalvoice_chats_v1"). */
export const CHATS_KEY = 'hospitalvoice_chats_v1';

export type StoredChat = {
  id: string; title: string; created: number; updated: number;
  conversationId: string | null; emergency: boolean;
  caseCtx: { need: string; address: string; freq: string; emergency: boolean; hospitals: string[] };
  messages: { kind: 'cards' | 'answer'; q: string; data: unknown; isFirst: boolean }[];
};

export function loadChats(): StoredChat[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]');
    return Array.isArray(v) ? (v as StoredChat[]) : [];
  } catch {
    return [];
  }
}

export function saveChat(chat: StoredChat): void {
  const chats = loadChats().filter((c) => c.id !== chat.id);
  chats.unshift(chat);
  try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 200))); } catch { /* full */ }
}

/** Where the existing results / tracker / planner screens live. */
export const legacyUrl = (hash = '') => `/legacy${hash ? `#${hash}` : ''}`;
