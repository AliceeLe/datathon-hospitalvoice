/** Chat history shared with the legacy page (localStorage "hospitalvoice_chats_v1"). */
import type { AskResult } from './api';

export const CHATS_KEY = 'hospitalvoice_chats_v1';

export type ChatMessage = { kind: 'cards' | 'answer'; q: string; data: AskResult; isFirst: boolean };
export type StoredChat = {
  id: string; title: string; created: number; updated: number;
  conversationId: string | null; emergency: boolean;
  caseCtx: { need: string; address: string; freq: string; emergency: boolean; hospitals: string[] };
  messages: ChatMessage[];
};

export function loadChats(): StoredChat[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHATS_KEY) || '[]');
    return Array.isArray(v) ? (v as StoredChat[]) : [];
  } catch {
    return [];
  }
}

export function getChat(id: string): StoredChat | undefined {
  return loadChats().find((c) => c.id === id);
}

export function saveChat(chat: StoredChat): void {
  const chats = loadChats().filter((c) => c.id !== chat.id);
  chats.unshift(chat);
  try { localStorage.setItem(CHATS_KEY, JSON.stringify(chats.slice(0, 200))); } catch { /* full */ }
  window.dispatchEvent(new Event('hv-chats'));
}

/** The 5 sample chats (static/demo_chats.json), added once per browser like the legacy page did. */
export async function seedDemoChats(): Promise<void> {
  const FLAG = 'hospitalvoice_demo_seeded_v1';
  try {
    if (localStorage.getItem(FLAG)) return;
    const res = await fetch('/static/demo_chats.json');
    if (!res.ok) return;
    const demo = (await res.json()) as StoredChat[];
    const chats = loadChats();
    for (const c of demo) if (!chats.some((x) => x.id === c.id)) chats.push(c);
    chats.sort((a, b) => (b.updated || 0) - (a.updated || 0));
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    localStorage.setItem(FLAG, '1');
    window.dispatchEvent(new Event('hv-chats'));
  } catch { /* offline */ }
}
