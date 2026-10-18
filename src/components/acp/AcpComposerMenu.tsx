import { open } from '@tauri-apps/plugin-dialog';
import { AtSign, Check, Globe, Image as ImageIcon, PlusIcon, Wrench } from 'lucide-react';
import { useRef, useState } from 'react';
import { SelectFilesMenuItem } from '@/components/codex/composer/ComposerMenu';
import { ScreenshotPopover } from '@/components/codex/composer/ScreenshotPopover';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { isDesktopTauri, isTauri } from '@/hooks/runtime';
import { cn } from '@/lib/utils';
import { type AcpConfigOption, acpSetConfigOption } from '@/services/apiAdapt/acp';
import { useAcpStore } from '@/stores/useAcpStore';
import { imagesAsDataUrls, TOOLS_CATEGORY } from './attachments';

const itemClass =
  'justify-start gap-2 px-2 h-8 w-full text-xs hover:bg-blue-500 hover:text-white transition-colors';

interface AcpComposerMenuProps {
  /** Omitted when the agent does not accept images. Paths or `data:` URLs. */
  onImagesSelected?: (images: string[]) => void;
  /** Desktop: files picked in the native dialog. */
  onFilesSelected: (paths: string[]) => void;
  /** Web: start an `@` file search instead, which runs on the server. */
  onMentionFile: () => void;
}

/** A session capability the agent lets the user switch, e.g. web search. */
function ToolToggle({ option }: { option: AcpConfigOption }) {
  const { connectionId, sessionId, setConfigOptionValue } = useAcpStore();
  const on = option.currentValue === true;
  const Icon = option.id === 'web_search' ? Globe : Wrench;

  const toggle = async () => {
    if (!connectionId || !sessionId) return;
    setConfigOptionValue(option.id, !on);
    try {
      await acpSetConfigOption(connectionId, sessionId, option.id, !on);
    } catch (e) {
      setConfigOptionValue(option.id, on);
      toast({ title: 'Agent rejected the change', description: String(e), variant: 'destructive' });
    }
  };

  return (
    <Button
      variant="ghost"
      aria-pressed={on}
      className={cn(itemClass, on && 'bg-blue-100 text-blue-900')}
      onClick={toggle}
      title={option.description}
    >
      <Icon className="w-4 h-4" />
      <span className="flex-1 text-left">{option.name}</span>
      {on && <Check className="w-4 h-4" />}
    </Button>
  );
}

/**
 * The composer's `+` menu: the session's tool switches, plus attachments —
 * images inline (when the agent accepts them) and files as path mentions.
 * The desktop picks local paths natively; the web build uses the browser's
 * picker for images and the server-side `@` search for files.
 */
export function AcpComposerMenu({
  onImagesSelected,
  onFilesSelected,
  onMentionFile,
}: AcpComposerMenuProps) {
  const [openState, setOpen] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const configOptions = useAcpStore((s) => s.configOptions);
  const tools = configOptions.filter((o) => o.category === TOOLS_CATEGORY && o.type === 'boolean');
  const native = isTauri();

  const addImages = (images: string[]) => {
    if (images.length) onImagesSelected?.(images);
    setOpen(false);
  };

  const selectImages = async () => {
    if (!native) {
      imageInput.current?.click();
      return;
    }
    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
      });
      if (selected) addImages(Array.isArray(selected) ? selected : [selected]);
    } catch (error) {
      console.error('Failed to select images:', error);
    }
  };

  return (
    <Popover open={openState} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Add"
          title="Add"
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-48 p-1">
        <div className="flex flex-col gap-1">
          {tools.map((option) => (
            <ToolToggle key={option.id} option={option} />
          ))}
          {tools.length > 0 && <Separator className="my-1" />}
          {onImagesSelected && (
            <Button variant="ghost" className={itemClass} onClick={selectImages}>
              <ImageIcon className="w-4 h-4" />
              <span>Add images</span>
            </Button>
          )}
          {native ? (
            <SelectFilesMenuItem
              onFilesSelected={onFilesSelected}
              onAfterSelect={() => setOpen(false)}
              className="h-8 w-full text-xs"
            />
          ) : (
            <Button
              variant="ghost"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                onMentionFile();
              }}
            >
              <AtSign className="w-4 h-4" />
              <span>Mention a file</span>
            </Button>
          )}
          {onImagesSelected && isDesktopTauri() && (
            <ScreenshotPopover onScreenshotTaken={(path) => addImages([path])} />
          )}
        </div>
        <input
          ref={imageInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={async (e) => {
            const files = e.target.files;
            if (files) addImages(await imagesAsDataUrls(files));
            e.target.value = '';
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
