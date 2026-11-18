import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Copy,
  X,
  Check,
  Camera,
  GripVertical,
  ShieldCheck,
} from 'lucide-react';
import { ChatMessageItem } from './chatParser';

interface ChatActionBarProps {
  isSelecting: boolean;
  step: 'start' | 'end' | 'done';
  selectedMessages: ChatMessageItem[];
  onToggleMode: () => void;
  onClear: () => void;
  onCopyText: () => void;
  onCopyImage: () => void;
  toastMessage: string | null;
}

export const ChatActionBar: React.FC<ChatActionBarProps> = ({
  isSelecting,
  step,
  selectedMessages,
  onToggleMode,
  onClear,
  onCopyText,
  onCopyImage,
  toastMessage,
}) => {
  const count = selectedMessages.length;

  // 1. Draggable state for Trigger Button
  const [triggerPos, setTriggerPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingTriggerRef = useRef(false);
  const triggerDragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // 2. Draggable state for Action Bar
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const isDraggingBarRef = useRef(false);
  const barDragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);

  // Drag handler for Trigger Button
  const handleTriggerMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    // Only left click
    if (e.button !== 0) return;

    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const btnWidth = rect.width > 0 ? rect.width : 160;
    const btnHeight = rect.height > 0 ? rect.height : 42;

    // Default position: right-most, center vertically
    const defaultX = Math.max(10, window.innerWidth - btnWidth - 12);
    const defaultY = Math.max(10, Math.round(window.innerHeight / 2 - btnHeight / 2));

    const currentX = triggerPos ? triggerPos.x : (rect.left > 0 ? rect.left : defaultX);
    const currentY = triggerPos ? triggerPos.y : (rect.top > 0 ? rect.top : defaultY);

    triggerDragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: currentX,
      posY: currentY,
    };
    isDraggingTriggerRef.current = false;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!triggerDragStartRef.current) return;
      const dx = moveEvt.clientX - triggerDragStartRef.current.startX;
      const dy = moveEvt.clientY - triggerDragStartRef.current.startY;

      if (Math.hypot(dx, dy) > 4) {
        isDraggingTriggerRef.current = true;
        const newX = Math.max(10, Math.min(window.innerWidth - btnWidth - 10, triggerDragStartRef.current.posX + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - btnHeight - 10, triggerDragStartRef.current.posY + dy));
        setTriggerPos({ x: newX, y: newY });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      setTimeout(() => {
        isDraggingTriggerRef.current = false;
      }, 50);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleTriggerClick = (e: React.MouseEvent) => {
    if (isDraggingTriggerRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    onToggleMode();
  };

  // Drag handler for Action Bar
  const handleBarMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks on buttons inside the bar
    if ((e.target as HTMLElement).closest('button')) return;
    if (e.button !== 0) return;

    const barEl = e.currentTarget;
    const rect = barEl.getBoundingClientRect();
    const currentX = barPos ? barPos.x : rect.left;
    const currentY = barPos ? barPos.y : rect.top;

    barDragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: currentX,
      posY: currentY,
    };
    isDraggingBarRef.current = false;

    const onMouseMove = (moveEvt: MouseEvent) => {
      if (!barDragStartRef.current) return;
      const dx = moveEvt.clientX - barDragStartRef.current.startX;
      const dy = moveEvt.clientY - barDragStartRef.current.startY;

      if (Math.hypot(dx, dy) > 3) {
        isDraggingBarRef.current = true;
        const barWidth = rect.width;
        const barHeight = rect.height;
        const newX = Math.max(10, Math.min(window.innerWidth - barWidth - 10, barDragStartRef.current.posX + dx));
        const newY = Math.max(10, Math.min(window.innerHeight - barHeight - 10, barDragStartRef.current.posY + dy));
        setBarPos({ x: newX, y: newY });
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <>
      {/* 1. Floating Trigger Button (Compact, Draggable, Middle-Right by default) */}
      <button
        type="button"
        className={`vd-chat-trigger-btn ${isSelecting ? 'active' : ''}`}
        style={
          triggerPos
            ? {
                position: 'fixed',
                left: `${triggerPos.x}px`,
                top: `${triggerPos.y}px`,
                right: 'auto',
                bottom: 'auto',
                transform: 'none',
              }
            : {
                position: 'fixed',
                right: '12px',
                top: '50%',
                left: 'auto',
                bottom: 'auto',
                transform: 'translateY(-50%)',
              }
        }
        onMouseDown={handleTriggerMouseDown}
        onClick={handleTriggerClick}
        data-tooltip={isSelecting ? 'Exit message selection' : 'Select messages to copy or forward (drag to reposition)'}
        data-tooltip-pos="left"
        title=""
      >
        <MessageSquare size={16} />
        <span>{isSelecting ? 'Exit Selection' : 'Select Messages'}</span>
      </button>

      {/* 2. Top Interactive Guide Banner (Shown while selecting Start/End: Step 1 or Step 2) */}
      {isSelecting && step !== 'done' && (
        <div
          className="vd-chat-banner"
          style={
            barPos
              ? {
                  left: `${barPos.x}px`,
                  top: `${barPos.y}px`,
                  transform: 'none',
                }
              : undefined
          }
          onMouseDown={handleBarMouseDown}
        >
          <div className="vd-drag-handle" title="Drag to reposition">
            <GripVertical size={13} />
          </div>

          {step === 'start' ? (
            <>
              <span className="vd-banner-step-badge vd-step-start">Step 1</span>
              <span className="vd-banner-text">Click 1st message</span>
            </>
          ) : (
            <>
              <span className="vd-banner-step-badge vd-step-end">Step 2</span>
              <span className="vd-banner-text">
                Click 2nd message{' '}
                <span className="vd-banner-hint">(top is <strong>START</strong>, bottom is <strong>END</strong>)</span>
              </span>
            </>
          )}

          <button
            type="button"
            className="vd-banner-cancel-btn"
            onClick={onClear}
            data-tooltip="Cancel"
            title=""
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 3. Top Compact Floating Action Bar (Shown ONLY when BOTH messages are selected: step === 'done') */}
      {isSelecting && step === 'done' && count > 0 && (
        <div
          className="vd-action-bar"
          style={
            barPos
              ? {
                  left: `${barPos.x}px`,
                  top: `${barPos.y}px`,
                  transform: 'none',
                }
              : undefined
          }
          onMouseDown={handleBarMouseDown}
        >
          {/* Drag Handle */}
          <div className="vd-drag-handle" data-tooltip="Drag to move toolbar" title="">
            <GripVertical size={14} />
          </div>

          {/* Selection Count Pill */}
          <div className="vd-selection-count-pill">
            <Check size={13} color="#38bdf8" />
            <span>{count} Selected</span>
          </div>

          {/* 1. Copy (as text) */}
          <button
            type="button"
            className="vd-action-btn primary"
            onClick={onCopyText}
            data-tooltip="Copy selected messages as text"
            title=""
          >
            <Copy size={13} />
            <span>Copy</span>
          </button>

          {/* 2. Screenshot (Exact screen capture from start to end element) */}
          <button
            type="button"
            className="vd-action-btn image-action"
            onClick={onCopyImage}
            data-tooltip="Take screenshot from start to end messages"
            title=""
          >
            <Camera size={13} color="#38bdf8" />
            <span>Screenshot</span>
          </button>

          {/* Clear / Cancel Selection */}
          <button
            type="button"
            className="vd-action-btn danger"
            onClick={onClear}
            data-tooltip="Cancel selection"
            title=""
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* 4. Feedback Toast */}
      {toastMessage && (
        <div className="vd-chat-toast">
          <Check size={14} color="#10b981" />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
};
