import React, { useState, useRef, useEffect } from 'react';
import { mockMessages } from './mockData';

export default function ChatDrawer({ open, onClose }) {
  const [input, setInput] = useState('');
  const threadRef = useRef(null);

  useEffect(() => {
    if (open && threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [open]);

  if (!open) return null;

  // Group by day
  const groups = [];
  let lastDay = null;
  mockMessages.forEach((m) => {
    if (m.day !== lastDay) {
      groups.push({ type: 'divider', day: m.day });
      lastDay = m.day;
    }
    groups.push({ type: 'msg', msg: m });
  });

  return (
    <div className="chat-drawer" onClick={onClose}>
      <div className="chat-drawer-inner" onClick={(e) => e.stopPropagation()}>
        <div className="chat-drawer-handle" />
        <div className="chat-drawer-header">
          <div className="chat-drawer-title">Chat</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="chat-drawer-thread" ref={threadRef}>
          {groups.map((g, i) =>
            g.type === 'divider' ? (
              <div key={`d-${i}`} className="day-divider">
                — {g.day} —
              </div>
            ) : (
              <div
                key={g.msg.id}
                className={`msg-block ${
                  g.msg.sender === 'you' ? 'msg-block-you' : 'msg-block-ai'
                }`}
              >
                <div className="msg-meta">
                  <span className="msg-sender">
                    {g.msg.sender === 'ai' ? 'AI' : 'YOU'}
                  </span>
                  <span className="msg-dot">·</span>
                  <span>{g.msg.time}</span>
                </div>
                <div className={`msg msg-${g.msg.sender}`}>{g.msg.body}</div>
              </div>
            ),
          )}
        </div>
        <div className="chat-drawer-input">
          <textarea
            className="input-field"
            placeholder="Type a message..."
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="send-btn" aria-label="Send">
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
