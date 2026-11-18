/**
 * DOM Parser and data structures for Snapchat Web & modern chat interfaces
 */

export interface QuotedReply {
  sender: string;
  text: string;
}

export interface ChatMessageItem {
  id: string;
  element: HTMLElement;
  bundleElement: HTMLElement;
  date: string | null;
  sender: string;
  senderColor?: string | null;
  isMe: boolean;
  time: string | null;
  fullIsoTime?: string | null;
  text: string;
  reply?: QuotedReply | null;
  hasVideo: boolean;
  videoSrc?: string | null;
  hasImage: boolean;
  imageSrc?: string | null;
  statusText?: string | null;
}

/**
 * Finds the primary chat message list container in the DOM
 */
export function getChatListContainer(): HTMLElement | null {
  // Snapchat Web uses ul.MibAa or ul[id^="cv-"]
  const snapList = document.querySelector<HTMLElement>('ul.MibAa, ul[id^="cv-"]');
  if (snapList) return snapList;

  // Fallback for other chat interfaces
  const fallback = document.querySelector<HTMLElement>(
    '[role="log"] ul, [aria-label="Messages"], .chat-messages-container, .messages-list'
  );
  return fallback;
}

/**
 * Parses all rendered chat messages from the container in chronological order
 */
export function parseAllChatMessages(): ChatMessageItem[] {
  const root = getChatListContainer();
  if (!root) return [];

  const items: ChatMessageItem[] = [];
  let currentDate: string | null = null;
  let msgIndex = 0;

  // Direct child rows (typically li.T1yt2)
  const rows = Array.from(root.children) as HTMLElement[];

  for (const row of rows) {
    // 1. Check Date Divider
    const timeDivider = row.querySelector<HTMLElement>('time.LX6HN, time[datetime]');
    if (timeDivider && !row.querySelector('ul.ujRzj')) {
      const dateText = timeDivider.textContent?.trim();
      if (dateText) {
        currentDate = dateText;
      }
      continue;
    }

    // 2. Check Message Bundle
    const ujUl = row.querySelector<HTMLElement>('ul.ujRzj');
    if (!ujUl) continue;

    let bundleSender = 'Unknown';
    let bundleSenderColor: string | null = null;
    let bundleTime: string | null = null;
    let bundleIsoTime: string | null = null;
    let isMe = false;

    // Check bundle-level header
    const bundleHeader = row.querySelector<HTMLElement>('header.R1ne3');
    if (bundleHeader) {
      const senderEl = bundleHeader.querySelector('.GUB_w');
      if (senderEl) {
        bundleSender = senderEl.textContent?.trim() || 'Unknown';
      }
      isMe = bundleSender.trim().toLowerCase() === 'me';
      bundleSenderColor = bundleHeader.style.color || (isMe ? 'rgb(242, 60, 87)' : 'rgb(14, 173, 255)');

      const timeEl = bundleHeader.querySelector('.XIPmF time');
      if (timeEl) {
        bundleTime = timeEl.textContent?.trim() || null;
        bundleIsoTime = timeEl.getAttribute('datetime') || null;
      }
    }

    // Iterate over message items inside bundle
    const msgLis = Array.from(ujUl.querySelectorAll<HTMLElement>(':scope > li'));
    for (const msgLi of msgLis) {
      // Individual header override
      const header = msgLi.querySelector<HTMLElement>('header.R1ne3');
      if (header) {
        const senderEl = header.querySelector('.GUB_w');
        if (senderEl) {
          bundleSender = senderEl.textContent?.trim() || bundleSender;
        }
        isMe = bundleSender.trim().toLowerCase() === 'me';
        bundleSenderColor = header.style.color || bundleSenderColor || (isMe ? 'rgb(242, 60, 87)' : 'rgb(14, 173, 255)');

        const timeEl = header.querySelector('.XIPmF time');
        if (timeEl) {
          bundleTime = timeEl.textContent?.trim() || bundleTime;
          bundleIsoTime = timeEl.getAttribute('datetime') || bundleIsoTime;
        }
      }

      // Bubble element
      const bubble = msgLi.querySelector<HTMLElement>('.KB4Aq');
      if (!bubble && !msgLi.querySelector('video, img')) {
        continue;
      }

      // Check Quoted Reply (.z_6Hk)
      let reply: QuotedReply | null = null;
      const quoteEl = msgLi.querySelector<HTMLElement>('.z_6Hk');
      if (quoteEl) {
        const qSenderEl = quoteEl.querySelector<HTMLElement>('.SGcAb');
        const qTextEl = quoteEl.querySelector<HTMLElement>('.ogn1z');
        const qSender = qSenderEl?.textContent?.trim() || '';
        const qText = qTextEl?.textContent?.trim() || '';
        if (qSender || qText) {
          reply = { sender: qSender, text: qText };
        }
      }

      // Check Media
      const videoEl = msgLi.querySelector<HTMLVideoElement>('video');
      const imgEl = msgLi.querySelector<HTMLImageElement>('img');
      const hasVideo = !!videoEl;
      const hasImg = !!imgEl;

      // Check Message Text
      let text = '';
      const textSpans = Array.from(msgLi.querySelectorAll<HTMLElement>('.ogn1z'));
      // Filter out text spans inside the quote block
      const directSpans = textSpans.filter((s) => !s.closest('.z_6Hk'));
      if (directSpans.length > 0) {
        text = directSpans
          .map((s) => s.textContent?.trim() || '')
          .filter(Boolean)
          .join('\n');
      } else {
        const statusEl = msgLi.querySelector<HTMLElement>('.AVVFt .mZgqh');
        if (statusEl) {
          text = `[${statusEl.textContent?.trim()}]`;
        } else if (hasVideo) {
          text = '[🎥 Video]';
        } else if (hasImg) {
          text = '[📷 Photo]';
        }
      }

      msgIndex++;
      const id = `vd-msg-${msgIndex}`;
      msgLi.setAttribute('data-vd-msg-id', id);

      items.push({
        id,
        element: msgLi,
        bundleElement: row,
        date: currentDate,
        sender: bundleSender,
        senderColor: bundleSenderColor,
        isMe,
        time: bundleTime,
        fullIsoTime: bundleIsoTime,
        text,
        reply,
        hasVideo,
        videoSrc: videoEl?.src || null,
        hasImage: hasImg,
        imageSrc: imgEl?.src || null,
      });
    }
  }

  return items;
}
