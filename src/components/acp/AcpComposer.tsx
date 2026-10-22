import { ArrowUp, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AgentModelPanel } from '@/components/agent/AgentModelPanel';
import { AgentModelTrigger } from '@/components/agent/AgentModelTrigger';
import { DictationButton } from '@/components/codex/composer/DictationButton';
import { FileMentionPopover } from '@/components/common';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { acpCancel, acpPrompt } from '@/services/apiAdapt/acp';
import { useWorkspaceStore } from '@/stores';
import { useAcpStore } from '@/stores/useAcpStore';
import { AcpComposerMenu } from './AcpComposerMenu';
import { AcpConnectStatus, AcpImageStrip, AcpInstallBanner } from './AcpComposerParts';
import { AcpSessionControls } from './AcpSessionControls';
import { AcpSlashCommandPopover } from './AcpSlashCommandPopover';
import { imagesAsDataUrls } from './attachments';
import {
  ACP_INPUT_FOCUS_EVENT,
  focusAcpComposer,
  focusRequestPending,
  settleFocusRequest,
} from './focusComposer';
import { useAcpConnection } from './useAcpConnection';

export function AcpComposer() {
  const { connectionId, sessionId, connecting, running, canAttachImages, setRunning, addEntry } =
    useAcpStore();
  const cwd = useWorkspaceStore((s) => s.cwd);
  const { agent, connect } = useAcpConnection();
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Held in state so the popovers re-render once the wrapper mounts.
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    const focus = () => textareaRef.current?.focus();
    if (focusRequestPending()) focus();
    window.addEventListener(ACP_INPUT_FOCUS_EVENT, focus);
    return () => window.removeEventListener(ACP_INPUT_FOCUS_EVENT, focus);
  }, []);

  // Grow with the text, up to the wrapper's max height.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text is the trigger — measure after the textarea re-renders with it
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [text]);

  /** Files from the `+` menu go in as path mentions, like `@` completion. */
  const appendFiles = (paths: string[]) => {
    const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '');
    const mentions = paths.map((path) => {
      const posix = path.replace(/\\/g, '/');
      return `\`${root && posix.startsWith(`${root}/`) ? posix.slice(root.length + 1) : posix}\``;
    });
    setText((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}${mentions.join(' ')} `);
    textareaRef.current?.focus();
  };

  /** Open the `@` file search, which works without a local file dialog. */
  const mentionFile = () => {
    setText((prev) => `${prev}${prev && !/\s$/.test(prev) ? ' ' : ''}@`);
    textareaRef.current?.focus();
  };

  /** Pasted screenshots attach like picked images. */
  const pasteImages = async (e: React.ClipboardEvent) => {
    if (!canAttachImages) return;
    const files = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    const pasted = await imagesAsDataUrls(files);
    setImages((prev) => [...prev, ...pasted]);
  };

  const send = async () => {
    const trimmed = text.trim();
    if ((!trimmed && images.length === 0) || running || connecting) return;

    let live = connectionId && sessionId ? { connectionId, sessionId } : null;
    if (!live) {
      if (agent && !agent.available) {
        toast({ title: `${agent.name} is not installed`, description: `Download it first.` });
        return;
      }
      live = await connect();
      if (!live) return;
    }

    const pendingImages = images;
    setText('');
    setImages([]);
    const shown =
      trimmed || `${pendingImages.length} image${pendingImages.length === 1 ? '' : 's'}`;
    // The first turn swaps the empty layout for the chat one, which mounts a
    // new composer; keep the caret in it.
    focusAcpComposer();
    addEntry({ id: `u-${Date.now()}`, role: 'user', text: shown });
    setRunning(true);
    try {
      await acpPrompt(live.connectionId, live.sessionId, trimmed, pendingImages);
    } catch (e) {
      // The pane may have switched to another session meanwhile.
      if (useAcpStore.getState().sessionId === live.sessionId)
        addEntry({ id: `e-${Date.now()}`, role: 'error', text: String(e) });
    } finally {
      if (useAcpStore.getState().sessionId === live.sessionId) setRunning(false);
    }
  };

  return (
    <div>
      <AcpSlashCommandPopover
        input={text}
        setInput={setText}
        editorRef={textareaRef}
        triggerElement={wrapperEl}
      />
      <FileMentionPopover
        input={text}
        setInput={setText}
        editorRef={textareaRef}
        triggerElement={wrapperEl}
      />
      <div className="rounded-xl border bg-background shadow-sm focus-within:ring-1 focus-within:ring-ring transition-shadow overflow-hidden">
        <AcpImageStrip
          images={images}
          onRemove={(path) => setImages((prev) => prev.filter((p) => p !== path))}
        />

        <div ref={setWrapperEl} className="max-h-64 overflow-y-auto px-3 pt-3">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={pasteImages}
            onKeyDown={(e) => {
              settleFocusRequest();
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Do anything... / @"
            rows={1}
            className="block w-full min-h-[44px] resize-none bg-transparent text-base md:text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {agent && !agent.available && !connectionId && (
          <AcpInstallBanner agent={agent} connecting={connecting} onInstall={() => connect()} />
        )}

        <div className="flex items-center justify-between gap-2 px-1 bg-muted/20 border-t">
          <div className="flex items-center min-w-0">
            <AcpComposerMenu
              onImagesSelected={
                canAttachImages ? (paths) => setImages((prev) => [...prev, ...paths]) : undefined
              }
              onFilesSelected={appendFiles}
              onMentionFile={mentionFile}
            />
            <AcpSessionControls />
            <AcpConnectStatus
              agentName={agent?.name}
              needsProject={!cwd && !connectionId}
              connecting={connecting}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <AgentModelPanel trigger={<AgentModelTrigger />} />
            <DictationButton
              onTranscript={(spoken) => setText((prev) => (prev ? `${prev} ${spoken}` : spoken))}
            />
            {running ? (
              <Button
                onClick={() => connectionId && acpCancel(connectionId, sessionId)}
                variant="destructive"
                size="icon"
                className="h-10 w-10 md:h-8 md:w-8 rounded-full"
                aria-label="Stop"
                title="Stop"
              >
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={() => send()}
                size="icon"
                className="h-10 w-10 md:h-8 md:w-8 rounded-full"
                disabled={connecting || (!text.trim() && images.length === 0)}
                aria-label="Send"
                title="Send"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
