import { useCallback } from 'react';
import {
  applyEditorReplacement,
  detectWordBoundaryTrigger,
  replaceAtTrigger,
  useComposerPopover,
} from '@/components/common/useComposerPopover';
import { Button } from '@/components/ui/button';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { type AcpCommand, useAcpStore } from '@/stores/useAcpStore';

interface AcpSlashCommandPopoverProps {
  input: string;
  setInput: (v: string) => void;
  editorRef: React.RefObject<HTMLTextAreaElement | null>;
  triggerElement: HTMLElement | null;
}

const detectSlash = detectWordBoundaryTrigger('/');
const filterCmd = (cmd: AcpCommand, query: string) =>
  !query || cmd.name.toLowerCase().includes(query.toLowerCase());

/** `/` completion over the commands the agent advertised for this session. */
export function AcpSlashCommandPopover({
  input,
  setInput,
  editorRef,
  triggerElement,
}: AcpSlashCommandPopoverProps) {
  const commands = useAcpStore((s) => s.commands);

  const handleSelect = useCallback(
    (cmd: AcpCommand) => {
      const newValue = replaceAtTrigger(input, '/', `/${cmd.name}`);
      if (newValue !== null) applyEditorReplacement(newValue, setInput, editorRef);
      else editorRef.current?.focus();
    },
    [input, setInput, editorRef]
  );

  const { open, setOpen, filteredItems, selectedIndex, setSelectedIndex, itemRefs } =
    useComposerPopover({
      input,
      items: commands,
      filter: filterCmd,
      detect: detectSlash,
      onKeySelect: handleSelect,
    });

  if (!commands.length || !triggerElement) return null;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={false}>
      <PopoverAnchor virtualRef={{ current: triggerElement }} />
      <PopoverContent
        align="start"
        side="top"
        className="w-72 p-1 max-h-64 overflow-hidden flex flex-col shadow-xl z-50"
        sideOffset={4}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="overflow-y-auto flex-1 py-1">
          {filteredItems.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-2">No matches</div>
          ) : (
            filteredItems.map((cmd, index) => (
              <Button
                key={cmd.name}
                ref={(el) => {
                  itemRefs.current[index] = el;
                }}
                variant={index === selectedIndex ? 'secondary' : 'ghost'}
                className="w-full h-auto justify-start gap-2 rounded-none py-1.5 text-xs"
                onClick={() => handleSelect(cmd)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="shrink-0 font-mono">/{cmd.name}</span>
                {cmd.description && (
                  <span className="truncate text-muted-foreground">{cmd.description}</span>
                )}
              </Button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
