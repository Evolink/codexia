import { FilePen, Globe, SquareTerminal, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApprovalCard, type ApprovalOption } from '@/components/common';
import type { AcpPermissionRequest } from '@/stores/useAcpStore';

interface Props {
  permission: AcpPermissionRequest;
  /** `null` cancels the request without picking an option. */
  onRespond: (optionId: string | null) => void | Promise<void>;
}

export function AcpPermissionCard({ permission, onRespond }: Props) {
  const { t } = useTranslation('thread');
  const { options, toolKind } = permission;

  const toOption = (o: (typeof options)[number]): ApprovalOption => ({
    key: o.optionId,
    label: o.name,
    onSelect: () => onRespond(o.optionId),
  });

  // ACP option kinds: allow_once, allow_always, reject_once, reject_always.
  const allowOnce = options.find((o) => o.kind === 'allow_once') ?? options[0];
  const rejectOnce = options.find((o) => o.kind === 'reject_once');
  const rest = options.filter((o) => o !== allowOnce && o !== rejectOnce);

  const [icon, kind] =
    toolKind === 'execute'
      ? [<SquareTerminal key="i" />, t('approval.terminal')]
      : toolKind === 'edit' || toolKind === 'delete' || toolKind === 'move'
        ? [<FilePen key="i" />, t('approval.editFiles')]
        : toolKind === 'fetch'
          ? [<Globe key="i" />, t('approval.network')]
          : [<Wrench key="i" />, t('approval.tool')];

  return (
    <ApprovalCard
      icon={icon}
      kind={kind}
      title={permission.title}
      deny={
        rejectOnce
          ? toOption(rejectOnce)
          : { key: 'cancel', label: t('approval.deny'), onSelect: () => onRespond(null) }
      }
      allow={
        allowOnce
          ? toOption(allowOnce)
          : { key: 'once', label: t('approval.allowOnce'), onSelect: () => onRespond(null) }
      }
      moreOptions={rest.map(toOption)}
    />
  );
}
