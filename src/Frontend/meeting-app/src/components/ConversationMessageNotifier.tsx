import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import {
  initializeSignalR,
  joinUserNotifications,
  onConversationMessageReceived,
  startSignalR,
} from '../services/signalR';

interface MessageToast {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  preview: string;
}

function normalizeMessage(data: any): MessageToast {
  const id = data.id || data.Id || `${data.conversationId || data.ConversationId}-${data.senderId || data.SenderId}-${data.timestamp || data.Timestamp}`;
  const message = (data.message || data.Message || '').trim();
  const attachmentFileName = data.attachmentFileName || data.AttachmentFileName;

  return {
    id,
    conversationId: data.conversationId || data.ConversationId || '',
    senderId: data.senderId || data.SenderId || '',
    senderName: data.senderName || data.SenderName || 'Someone',
    preview: message || (attachmentFileName ? `Shared ${attachmentFileName}` : 'Sent a message'),
  };
}

export default function ConversationMessageNotifier() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const token = useAuthStore((state) => state.token);
  const [toasts, setToasts] = useState<MessageToast[]>([]);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!token || !user) {
      return;
    }

    let cancelled = false;
    let unsubscribe: () => void = () => undefined;

    initializeSignalR(token);
    startSignalR()
      .then(async () => {
        if (cancelled) {
          return;
        }

        await joinUserNotifications(user.id);
        unsubscribe = onConversationMessageReceived((data) => {
          const toast = normalizeMessage(data);
          if (!toast.conversationId || !toast.id || toast.senderId === user.id || seenMessageIdsRef.current.has(toast.id)) {
            return;
          }

          seenMessageIdsRef.current.add(toast.id);
          setToasts((items) => [toast, ...items.filter((item) => item.id !== toast.id)].slice(0, 3));
          window.setTimeout(() => {
            setToasts((items) => items.filter((item) => item.id !== toast.id));
          }, 8000);
        });
      })
      .catch((error) => console.warn('Message notification connection failed', error));

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [token, user]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed right-6 top-24 z-[90] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-3">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          onClick={() => {
            setToasts((items) => items.filter((item) => item.id !== toast.id));
            navigate(`/chat?conversationId=${toast.conversationId}`);
          }}
          className="rounded-md border border-slate-200 bg-white p-4 text-left text-slate-950 shadow-2xl hover:bg-slate-50"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
              {toast.senderName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">New message</p>
              <p className="mt-1 truncate text-sm font-semibold">{toast.senderName}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{toast.preview}</p>
            </div>
            <span
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                setToasts((items) => items.filter((item) => item.id !== toast.id));
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  event.stopPropagation();
                  setToasts((items) => items.filter((item) => item.id !== toast.id));
                }
              }}
              className="rounded px-2 py-1 text-sm font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Dismiss notification"
            >
              x
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
