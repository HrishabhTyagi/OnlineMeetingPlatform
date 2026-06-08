import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { conversationAPI } from './api';

const OUTBOX_KEY = 'samvaad.mobile.outbox';

export interface QueuedMessage {
  id: string;
  conversationId: string;
  payload: any;
  createdAt: string;
}

async function readOutbox() {
  const value = await AsyncStorage.getItem(OUTBOX_KEY);
  return value ? JSON.parse(value) as QueuedMessage[] : [];
}

async function writeOutbox(items: QueuedMessage[]) {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

export async function enqueueMessage(conversationId: string, payload: any) {
  const items = await readOutbox();
  items.push({ id: `${Date.now()}-${Math.random()}`, conversationId, payload, createdAt: new Date().toISOString() });
  await writeOutbox(items);
}

export async function flushOutbox() {
  const state = await NetInfo.fetch();
  if (!state.isConnected) {
    return 0;
  }

  const items = await readOutbox();
  const remaining: QueuedMessage[] = [];
  let sent = 0;

  for (const item of items) {
    try {
      await conversationAPI.sendMessage(item.conversationId, item.payload);
      sent += 1;
    } catch {
      remaining.push(item);
    }
  }

  await writeOutbox(remaining);
  return sent;
}
