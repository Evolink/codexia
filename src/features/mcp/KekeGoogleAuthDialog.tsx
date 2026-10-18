import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExternalUrl } from '@/features/plugins/hooks/useExternalUrl';
import type { useKekeMcpAuth } from './useKekeMcpAuth';

export function KekeGoogleAuthDialog({
  auth,
  onAuthorized,
}: {
  auth: ReturnType<typeof useKekeMcpAuth>;
  onAuthorized?: () => void;
}) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [token, setToken] = useState('');
  const { openExternalUrl } = useExternalUrl();
  const name = auth.googleName;
  const busy = name !== null && auth.pending === name;
  const reset = () => {
    setClientId('');
    setClientSecret('');
    setToken('');
  };
  const finish = (ok: boolean) => {
    if (!ok) return;
    reset();
    onAuthorized?.();
  };
  const error = name && auth.errors[name] && (
    <p role="alert" className="text-sm text-destructive">
      {auth.errors[name]}
    </p>
  );
  return (
    <Dialog
      open={name !== null}
      onOpenChange={(open) => {
        if (!open && !busy) {
          reset();
          auth.dismissGoogle();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Authorize Google</DialogTitle>
          <DialogDescription>
            Google needs your own OAuth client or an access token.
          </DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="client">
          <TabsList className="w-full">
            <TabsTrigger value="client" disabled={busy}>
              OAuth client
            </TabsTrigger>
            <TabsTrigger value="token" disabled={busy}>
              Access token
            </TabsTrigger>
          </TabsList>
          <TabsContent value="client">
            <form
              className="flex flex-col gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                finish(await auth.authorizeGoogleClient(clientId, clientSecret));
              }}
            >
              <Label htmlFor="google-mcp-client-id">Client ID</Label>
              <Input
                id="google-mcp-client-id"
                autoComplete="off"
                value={clientId}
                disabled={busy}
                onChange={(event) => setClientId(event.target.value)}
              />
              <Label htmlFor="google-mcp-client-secret">Client secret</Label>
              <Input
                id="google-mcp-client-secret"
                type="password"
                autoComplete="off"
                value={clientSecret}
                disabled={busy}
                onChange={(event) => setClientSecret(event.target.value)}
              />
              <Button
                type="button"
                variant="link"
                className="self-start px-0"
                onClick={() => openExternalUrl('https://console.cloud.google.com/apis/credentials')}
              >
                Create a Desktop app client
              </Button>
              {busy && (
                <p className="text-xs text-muted-foreground">
                  Complete authorization in your desktop browser.
                </p>
              )}
              {error}
              <DialogFooter>
                <Button type="submit" disabled={busy || !clientId.trim()}>
                  {busy ? 'Authorizing…' : 'Sign in with Google'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
          <TabsContent value="token">
            <form
              className="flex flex-col gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                finish(await auth.authorizeGoogleToken(token));
              }}
            >
              <Label htmlFor="google-mcp-token">Access token</Label>
              <Input
                id="google-mcp-token"
                type="password"
                autoComplete="off"
                value={token}
                disabled={busy}
                onChange={(event) => setToken(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Expires after about an hour.</p>
              {error}
              <DialogFooter>
                <Button type="submit" disabled={busy || !token.trim()}>
                  {busy ? 'Authorizing…' : 'Authorize'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
