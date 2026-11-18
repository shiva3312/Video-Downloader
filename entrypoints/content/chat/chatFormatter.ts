import { ChatMessageItem } from './chatParser';

/**
 * Formats selected messages as clean, human-readable plain text
 */
export function formatMessagesAsText(messages: ChatMessageItem[]): string {
  if (messages.length === 0) return '';

  const lines: string[] = [];
  let lastDate: string | null = null;
  let lastSender: string | null = null;
  let lastTime: string | null = null;

  for (const msg of messages) {
    // 1. Date Divider if date changed
    if (msg.date && msg.date !== lastDate) {
      if (lines.length > 0) lines.push('');
      lines.push(`────────── 📅 ${msg.date} ──────────`);
      lastDate = msg.date;
      lastSender = null; // force header output
      lastTime = null;
    }

    // 2. Sender Header
    const timeStr = msg.time ? `[${msg.time}] ` : '';
    const isNewSenderOrTime = msg.sender !== lastSender || msg.time !== lastTime;

    if (isNewSenderOrTime) {
      if (lines.length > 0 && !lines[lines.length - 1].startsWith('────')) {
        lines.push('');
      }
      lines.push(`${timeStr}${msg.sender}:`);
      lastSender = msg.sender;
      lastTime = msg.time;
    }

    // 3. Quoted Reply if any
    if (msg.reply && (msg.reply.sender || msg.reply.text)) {
      const qSender = msg.reply.sender ? `${msg.reply.sender}: ` : '';
      lines.push(`  > Replying to ${qSender}"${msg.reply.text}"`);
    }

    // 4. Message Content
    if (msg.text) {
      // Indent slightly if under header, or preserve line breaks
      const textLines = msg.text.split('\n');
      for (const tLine of textLines) {
        lines.push(`  ${tLine}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Formats selected messages as rich styled HTML preserving Snapchat message bubbles,
 * sender colors (blue for friend, red for me), quoted reply cards, and timestamps.
 */
export function formatMessagesAsHtml(messages: ChatMessageItem[]): string {
  if (messages.length === 0) return '';

  let html = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; padding: 20px; background: #0f172a; color: #f8fafc; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
`;

  let lastDate: string | null = null;
  let lastSender: string | null = null;

  for (const msg of messages) {
    // Date Divider
    if (msg.date && msg.date !== lastDate) {
      html += `
  <div style="text-align: center; margin: 16px 0 12px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.8px;">
    📅 ${msg.date}
  </div>`;
      lastDate = msg.date;
      lastSender = null;
    }

    const isMe = msg.isMe;
    const senderColor = msg.senderColor || (isMe ? '#f23c57' : '#0eadff');
    const bubbleBg = isMe ? 'rgba(242, 60, 87, 0.16)' : 'rgba(14, 173, 255, 0.16)';
    const bubbleBorder = isMe ? 'rgba(242, 60, 87, 0.35)' : 'rgba(14, 173, 255, 0.35)';
    const alignSelf = isMe ? 'flex-end' : 'flex-start';

    const isNewSender = msg.sender !== lastSender;
    if (isNewSender) {
      lastSender = msg.sender;
      html += `
  <div style="display: flex; align-items: center; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; gap: 8px; margin-top: 10px; margin-bottom: 4px;">
    <span style="font-size: 12px; font-weight: 700; color: ${senderColor};">${msg.sender}</span>
    ${msg.time ? `<span style="font-size: 10px; color: #64748b;">${msg.time}</span>` : ''}
  </div>`;
    }

    html += `
  <div style="display: flex; flex-direction: column; align-items: ${alignSelf}; margin-bottom: 6px;">
    <div style="max-width: 85%; background: ${bubbleBg}; border: 1px solid ${bubbleBorder}; border-radius: 12px; padding: 8px 12px; font-size: 13px; line-height: 1.4; color: #ffffff; word-break: break-word;">`;

    // Quoted reply
    if (msg.reply && (msg.reply.sender || msg.reply.text)) {
      html += `
      <div style="background: rgba(0,0,0,0.25); border-left: 3px solid ${senderColor}; padding: 4px 8px; border-radius: 4px; margin-bottom: 6px; font-size: 11px;">
        ${msg.reply.sender ? `<div style="font-weight: 700; color: ${senderColor}; margin-bottom: 2px;">${msg.reply.sender}</div>` : ''}
        <div style="color: #cbd5e1; font-style: italic;">${msg.reply.text}</div>
      </div>`;
    }

    // Message text
    if (msg.text) {
      const sanitized = msg.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br/>');
      html += `<div>${sanitized}</div>`;
    }

    html += `
    </div>
  </div>`;
  }

  html += `
</div>`;
  return html;
}

/**
 * Copies selected messages to system clipboard (both plain text and rich HTML)
 */
export async function copyMessagesToClipboard(messages: ChatMessageItem[]): Promise<boolean> {
  const plainText = formatMessagesAsText(messages);
  const richHtml = formatMessagesAsHtml(messages);

  if (!plainText) return false;

  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      const htmlBlob = new Blob([richHtml], { type: 'text/html' });
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/plain': textBlob,
          'text/html': htmlBlob,
        }),
      ]);
      return true;
    }
  } catch (err) {
    console.warn('[ChatSelector] Rich clipboard write failed, falling back to text:', err);
  }

  try {
    await navigator.clipboard.writeText(plainText);
    return true;
  } catch (err) {
    console.error('[ChatSelector] Clipboard writeText failed:', err);
    return false;
  }
}

/**
 * Inserts the formatted conversation into Snapchat's chat input field
 */
export function insertMessagesIntoChatInput(messages: ChatMessageItem[]): boolean {
  const plainText = formatMessagesAsText(messages);
  if (!plainText) return false;

  const prefix = `--- Forwarded Messages ---\n${plainText}\n--------------------------`;

  // Look for Snapchat Web or generic contenteditable / textarea
  const inputEl = document.querySelector<HTMLElement>(
    'div[contenteditable="true"], [role="textbox"], textarea.chat-input, textarea'
  );

  if (!inputEl) return false;

  inputEl.focus();

  if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
    const start = inputEl.selectionStart || 0;
    const end = inputEl.selectionEnd || 0;
    const val = inputEl.value;
    inputEl.value = val.slice(0, start) + prefix + val.slice(end);
    inputEl.selectionStart = inputEl.selectionEnd = start + prefix.length;
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }

  if (inputEl.isContentEditable) {
    // Standard execCommand preserves undo stack
    const inserted = document.execCommand('insertText', false, prefix);
    if (!inserted) {
      inputEl.innerText = (inputEl.innerText ? inputEl.innerText + '\n' : '') + prefix;
      inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prefix }));
    }
    return true;
  }

  return false;
}

/**
 * Generates a PNG Blob representing an authentic visual image card of the selected messages
 */
export async function renderMessagesAsBlob(messages: ChatMessageItem[]): Promise<Blob | null> {
  const richHtml = formatMessagesAsHtml(messages);
  if (!richHtml) return null;

  return new Promise((resolve) => {
    try {
      const width = 560;
      const svgString = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="1200">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml" id="svg-root" style="width:${width}px;">
              ${richHtml}
            </div>
          </foreignObject>
        </svg>
      `;

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const tempDiv = document.createElement('div');
          tempDiv.style.position = 'absolute';
          tempDiv.style.left = '-9999px';
          tempDiv.style.width = `${width}px`;
          tempDiv.innerHTML = richHtml;
          document.body.appendChild(tempDiv);
          const computedHeight = Math.max(tempDiv.offsetHeight + 40, 200);
          document.body.removeChild(tempDiv);

          canvas.width = width * 2;
          canvas.height = computedHeight * 2;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            URL.revokeObjectURL(url);
            resolve(null);
            return;
          }

          ctx.scale(2, 2);
          ctx.drawImage(img, 0, 0, width, computedHeight);
          URL.revokeObjectURL(url);

          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        } catch (e) {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };

      img.src = url;
    } catch (err) {
      console.error('[ChatSelector] renderMessagesAsBlob failed:', err);
      resolve(null);
    }
  });
}

/**
 * Generates an authentic visual image card of the selected messages and copies PNG to clipboard
 */
export async function copyMessagesAsImage(messages: ChatMessageItem[]): Promise<boolean> {
  const blob = await renderMessagesAsBlob(messages);
  if (!blob) return false;

  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([
        new ClipboardItem({
          'image/png': blob,
        }),
      ]);
      return true;
    }
    return false;
  } catch (copyErr) {
    console.warn('[ChatSelector] Image clipboard write failed:', copyErr);
    return false;
  }
}

/**
 * Triggers Snapchat's native single-message forward modal if available
 */
export function triggerNativeForward(message: ChatMessageItem): boolean {
  // Look for Snapchat forward button inside message row
  const forwardBtn = message.element.querySelector<HTMLButtonElement>(
    'button.NcaQH, button[title*="Forward"], button[aria-label*="Forward"]'
  );
  if (forwardBtn) {
    forwardBtn.click();
    return true;
  }
  return false;
}
