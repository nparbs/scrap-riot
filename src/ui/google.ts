interface GoogleIdentity {
  accounts: {
    id: {
      initialize(config: { client_id: string; callback: (response: { credential: string }) => void }): void;
      renderButton(parent: HTMLElement, options: Record<string, string | number>): void;
    };
  };
}

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
let loading: Promise<GoogleIdentity> | null = null;

/** Google's script loads only when someone opens the Profile tab, not for every visitor. */
function loadGoogle(): Promise<GoogleIdentity> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve((window as unknown as { google: GoogleIdentity }).google);
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google sign-in'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

let initializedFor: string | null = null;
let currentCallback: (credential: string) => void = () => {};

export async function renderGoogleButton(parent: HTMLElement, clientId: string, onCredential: (credential: string) => void): Promise<void> {
  const google = await loadGoogle();
  currentCallback = onCredential;
  // Google warns against initializing twice, so later renders just swap the callback.
  if (initializedFor !== clientId) {
    google.accounts.id.initialize({ client_id: clientId, callback: (response) => currentCallback(response.credential) });
    initializedFor = clientId;
  }
  google.accounts.id.renderButton(parent, { theme: 'filled_black', size: 'large', text: 'signin_with', width: 260 });
}
