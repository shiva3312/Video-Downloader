import React, { useEffect, useState } from 'react';
import { VaultItem } from '@/types/vault';
import { vaultStorage, getCorrectMimeType } from '@/services/vaultStorage';
import {
  X,
  Download,
  Copy,
  Check,
  Film,
  Image as ImageIcon,
  MessageSquare,
  FileText,
  Calendar,
  Users,
  Send,
  Loader2,
} from 'lucide-react';

interface MediaPreviewModalProps {
  item: VaultItem | null;
  onClose: () => void;
}

export const MediaPreviewModal: React.FC<MediaPreviewModalProps> = ({ item, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [chatViewMode, setChatViewMode] = useState<'image' | 'transcript'>('image');
  const [sendingChat, setSendingChat] = useState(false);
  const [chatFeedback, setChatFeedback] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);

  useEffect(() => {
    setVideoError(null);
    if (item && item.blobData) {
      const mime = getCorrectMimeType(item.type, item.format, item.blobData.type);
      const playableBlob =
        item.blobData.type === mime ? item.blobData : new Blob([item.blobData], { type: mime });
      const url = URL.createObjectURL(playableBlob);
      setBlobUrl(url);

      if (item.type === 'text') {
        playableBlob
          .text()
          .then((txt) => {
            setTextBody(txt || item.chatMeta?.formattedTranscript || item.textMeta?.previewSnippet || '');
          })
          .catch(() => {
            setTextBody(item.chatMeta?.formattedTranscript || item.textMeta?.previewSnippet || '');
          });
      }

      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setBlobUrl(null);
      if (item?.type === 'text') {
        setTextBody(item.chatMeta?.formattedTranscript || item.textMeta?.previewSnippet || '');
      }
    }
  }, [item]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!item) return null;

  const handleCopy = async () => {
    const res = await vaultStorage.copyItemToClipboard(item);
    if (res.success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    vaultStorage.exportToPC(item);
  };

  const handleSendToChat = async () => {
    if (!item || sendingChat) return;
    setSendingChat(true);
    try {
      const res = await vaultStorage.sendItemsToActiveChat([item]);
      setChatFeedback(res.success ? 'Sent to chat!' : res.message || 'Failed to send');
      setTimeout(() => setChatFeedback(null), 3000);
    } catch (err: any) {
      setChatFeedback(err?.message || 'Error sending');
      setTimeout(() => setChatFeedback(null), 3000);
    } finally {
      setSendingChat(false);
    }
  };

  const formattedDate = new Date(item.createdAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const formattedSize =
    item.sizeBytes < 1024 * 1024
      ? `${(item.sizeBytes / 1024).toFixed(1)} KB`
      : `${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB`;

  return (
    <div className="v-modal-overlay" onClick={onClose}>
      <div className="v-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="v-modal-header">
          <div className="v-modal-title-wrap">
            <span className="v-modal-icon">
              {item.type === 'video' ? (
                <Film size={18} color="#38bdf8" />
              ) : item.type === 'image' ? (
                <ImageIcon size={18} color="#34d399" />
              ) : item.type === 'text' ? (
                <FileText size={18} color="#e879f9" />
              ) : (
                <MessageSquare size={18} color="#a78bfa" />
              )}
            </span>
            <div className="v-modal-text">
              <h3 className="v-modal-title" title={item.title}>
                {item.title}
              </h3>
              <div className="v-modal-subtitle">
                <span className="v-badge">{item.format}</span>
                <span className="v-dot">•</span>
                <span>{formattedSize}</span>
                <span className="v-dot">•</span>
                <span className="v-date">
                  <Calendar size={12} style={{ display: 'inline', marginRight: 3 }} />
                  {formattedDate}
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="v-close-btn" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Chat Tab Switcher (if chat screenshot has transcript) */}
        {item.type === 'chat_screenshot' && item.chatMeta?.formattedTranscript && (
          <div className="v-modal-tabs">
            <button
              type="button"
              className={`v-tab-pill ${chatViewMode === 'image' ? 'active' : ''}`}
              onClick={() => setChatViewMode('image')}
            >
              <ImageIcon size={14} style={{ marginRight: 6 }} />
              Screenshot Image
            </button>
            <button
              type="button"
              className={`v-tab-pill ${chatViewMode === 'transcript' ? 'active' : ''}`}
              onClick={() => setChatViewMode('transcript')}
            >
              <FileText size={14} style={{ marginRight: 6 }} />
              Chat Transcript ({item.chatMeta?.messageCount || 0})
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="v-modal-body">
          {item.type === 'video' ? (
            blobUrl ? (
              <>
                <video
                  src={blobUrl}
                  controls
                  autoPlay
                  playsInline
                  preload="auto"
                  className="v-media-video"
                  onError={(e) => {
                    const err = e.currentTarget.error;
                    console.warn('[MediaPreviewModal] HTML5 video player error:', err?.code, err?.message);
                    setVideoError('The browser HTML5 player cannot render this video codec directly. Click "Download to PC" below to play it in your local media player.');
                  }}
                >
                  Your browser does not support the video tag.
                </video>
                {videoError && (
                  <div
                    style={{
                      margin: '12px 16px',
                      padding: '12px 16px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      color: '#fca5a5',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <span>⚠️ {videoError}</span>
                    <button
                      type="button"
                      className="v-action-btn primary"
                      onClick={handleDownload}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      <Download size={14} style={{ marginRight: 6 }} /> Download to PC
                    </button>
                  </div>
                )}
              </>
            ) : item.sourceUrl && !item.sourceUrl.startsWith('blob:') ? (
              <video
                src={item.sourceUrl}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="v-media-video"
              />
            ) : (
              <div className="v-media-loading">Loading video...</div>
            )
          ) : item.type === 'image' ? (
            blobUrl ? (
              <div className="v-img-container">
                <img src={blobUrl} alt={item.title} className="v-media-image" />
              </div>
            ) : item.thumbnail ? (
              <div className="v-img-container">
                <img src={item.thumbnail} alt={item.title} className="v-media-image" />
              </div>
            ) : item.sourceUrl && !item.sourceUrl.startsWith('blob:') ? (
              <div className="v-img-container">
                <img src={item.sourceUrl} alt={item.title} className="v-media-image" />
              </div>
            ) : (
              <div className="v-media-loading">No image data</div>
            )
          ) : item.type === 'text' ? (
            <div className="v-transcript-wrap">
              {item.chatMeta?.participants && item.chatMeta.participants.length > 0 && (
                <div className="v-chat-participants">
                  <Users size={14} style={{ marginRight: 6 }} />
                  <strong>Chat between:</strong> {item.chatMeta.participants.join(' ↔ ')}
                  {item.chatMeta.messageCount && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                      {item.chatMeta.messageCount} messages
                    </span>
                  )}
                </div>
              )}
              <pre className="v-transcript-text">
                {textBody || item.chatMeta?.formattedTranscript || 'No text content available.'}
              </pre>
            </div>
          ) : (
            // Chat Screenshot
            chatViewMode === 'image' ? (
              blobUrl ? (
                <div className="v-img-container">
                  <img src={blobUrl} alt={item.title} className="v-media-image" />
                </div>
              ) : item.thumbnail ? (
                <div className="v-img-container">
                  <img src={item.thumbnail} alt={item.title} className="v-media-image" />
                </div>
              ) : (
                <div className="v-media-loading">No screenshot data</div>
              )
            ) : (
              <div className="v-transcript-wrap">
                {item.chatMeta?.participants && item.chatMeta.participants.length > 0 && (
                  <div className="v-chat-participants">
                    <Users size={14} style={{ marginRight: 6 }} />
                    <strong>Chat between:</strong> {item.chatMeta.participants.join(' ↔ ')}
                  </div>
                )}
                <pre className="v-transcript-text">
                  {item.chatMeta?.formattedTranscript || 'No transcript text available.'}
                </pre>
              </div>
            )
          )}
        </div>

        {/* Footer Actions */}
        <div className="v-modal-footer">
          <div className="v-footer-info">
            {item.chatMeta?.participants && item.chatMeta.participants.length > 0 && (
              <span className="v-meta-tag">
                <Users size={12} style={{ marginRight: 4 }} />
                {item.chatMeta.participants.join(', ')}
              </span>
            )}
          </div>
          <div className="v-footer-actions">
            <button
              type="button"
              className="v-action-btn send"
              onClick={handleSendToChat}
              disabled={sendingChat}
              title="Send / Paste directly into active chat"
            >
              {sendingChat ? (
                <>
                  <Loader2 size={14} className="sp-icon-spin" />
                  <span>Sending...</span>
                </>
              ) : chatFeedback ? (
                <>
                  <Check size={14} color="#10b981" />
                  <span>{chatFeedback}</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Send to Chat</span>
                </>
              )}
            </button>
            <button
              type="button"
              className="v-action-btn secondary"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            <button
              type="button"
              className="v-action-btn primary"
              onClick={handleDownload}
              title="Export and save to computer"
            >
              <Download size={14} />
              <span>Download to PC</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
